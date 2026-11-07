/* =====================================================================
   MCP — Model Context Protocol endpoint (/mcp) over streamable HTTP.

   A non-interactive programmatic surface for AI agents (OpenCode & co),
   scoped to ONE workspace through a personal API key (psk_live_…). The
   key is generated from the Settings > API keys card after a full
   login + 2FA browser session; only the key's sha256 hash (same
   discipline as session tokens) is stored, in the api_keys table.

   D-12: ZERO runtime dependencies — the protocol below (JSON-RPC 2.0
   over one HTTP POST per message, mcp-session-id header, initialize →
   initialized notification → tools/list → tools/call) is implemented
   by hand on Node built-ins, exactly like oidc.js and totp.js. The
   2025-06-18 streamable-HTTP shape spoken here is what every official
   MCP client emits; `initialize` echoes the client's protocol version
   and tools/list advertises the frozen surface below. GET (the optional
   server→client SSE stream) answers 405: this server never pushes.

   Tool writes go through the same discipline as every doc mutation:
   begin-immediate transaction, JSON.parse(stored doc), edit,
   revision+1 commit — so an agent edit and a browser sync never race.
   Every tool call is audited into audit_log with a `mcp.` action prefix
   and rate-limited per key (60 req/min).

   Future Postgres migration: nothing here touches sqlite beyond the
   passed-in `db` handle and the small SQL subset below — the doc is
   read and written as one opaque JSON column, exactly like server.js.
   ===================================================================== */
import crypto from 'node:crypto';

/* The stored vocabulary (src/core/constants.js STATUSES / PRIOS ids). The ids
   are what the document holds — this module reads and writes them verbatim,
   never a display name. */
export const MCP_STATUSES = ['backlog', 'todo', 'progress', 'review', 'done'];
export const MCP_PRIORITIES = ['urgent', 'high', 'medium', 'low'];
const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROTOCOL_VERSION = '2025-06-18';

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ------------------------- API keys (psk_live_) ------------------------- */

export const API_KEY_PREFIX = 'psk_live_';
export const API_KEY_DAYS = [30, 90, 365]; // expiry is mandatory — no permanent keys
export const API_KEY_SCOPES = ['read', 'write'];

/* One-shot generation: the raw key is returned exactly once and only its
   sha256 hash, a display prefix and metadata ever hit the database. */
export function generateApiKey() {
  const key = API_KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 8), hash: sha256hex(key) };
}

function sha256hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export const validKeyDays = d => (API_KEY_DAYS.includes(Number(d)) ? Number(d) : null);
export const validKeyScope = s => (API_KEY_SCOPES.includes(s) ? s : null);

/* ------------------------------ module ---------------------------------- */
/* createMcp(deps) keeps this file free of imports from server.js (no
   circular deps). server.js passes its primitives once at boot; everything
   doc-shaped is done here against the same stored-document discipline. */
export function createMcp(deps) {
  const { db, now, uid, clientIp, logWarn, tooMany, maxBody, ROLE_RANK } = deps;

  /* Session registry: mcp-session-id → { ctx, scope }. The session is
     bound to the key that created it — a request presenting session X with a
     DIFFERENT key is rejected, so a leaked session id grants nothing. */
  const sessions = new Map();

  /* ----------------------------- auth ---------------------------------- */
  function authenticate(req) {
    const m = /^Bearer\s+(.+)$/i.exec(String(req.headers['authorization'] || ''));
    if (!m) return { status: 401, code: 'mcpUnauthorized', message: 'Missing bearer token' };
    const row = db.prepare('select * from api_keys where key_hash = ?').get(sha256hex(m[1].trim()));
    if (!row || row.revoked_at) return { status: 401, code: 'mcpUnauthorized', message: 'Invalid or revoked API key' };
    if (row.expires_at <= now()) return { status: 401, code: 'mcpUnauthorized', message: 'API key expired' };
    const user = db.prepare('select * from users where id = ?').get(row.user_id);
    const ws = db.prepare('select * from workspaces where id = ?').get(row.workspace_id);
    const membership = db.prepare('select * from memberships where workspace_id = ? and user_id = ?').get(row.workspace_id, row.user_id);
    if (!user || !ws || !membership) return { status: 401, code: 'mcpUnauthorized', message: 'API key no longer valid' };
    /* Throttled last-used stamp: one write per minute at most, never per
       request — the settings card shows "last used" without a write storm. */
    if (!row.last_used_at || row.last_used_at < now() - 60_000) {
      db.prepare('update api_keys set last_used_at = ? where id = ?').run(now(), row.id);
    }
    return { key: row, user, ws, membership, scope: validKeyScope(row.scope) || 'read' };
  }

  function fail(res, status, code, message) {
    if (!res.headersSent) {
      const payload = JSON.stringify({ error: message, code });
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(payload);
    } else res.end();
  }

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      let overflow = null;
      req.on('data', chunk => {
        if (overflow) return;
        size += chunk.length;
        if (size > maxBody) {
          overflow = new Error('Request body too large');
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (overflow) return reject(overflow);
        if (!chunks.length) return resolve(null);
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /* --------------------------- audit trail ------------------------------ */
  /* Every tool call lands in the append-only audit_log in the same
     discipline as the session-revocation writers (snapshot columns, no
     FKs). Reads AND writes both — the point is "what did the agent do". */
  function audit(ctx, ip, action, targetName) {
    try {
      db.prepare(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(uid(), ctx.user.id, ctx.key.id, action, 0, ip, ctx.ws.id, ctx.user.name, ctx.user.email, targetName || 'mcp', 'api-key', now());
    } catch (err) {
      logWarn(`mcp audit ${action}: ${err.message}`);
    }
  }

  /* ------------------------- document access ----------------------------- */
  function loadDoc(ws) {
    const row = db.prepare('select doc from workspaces where id = ?').get(ws.id);
    return row ? JSON.parse(row.doc) : null;
  }

  /* The same shape as server.js's PUT path: one immediate transaction,
     one JSON parse of the CURRENT row, one revision bump. Never a blind
     overwrite of a row read outside the transaction. */
  function writeDoc(ws, edit) {
    db.exec('begin immediate');
    try {
      const row = db.prepare('select doc from workspaces where id = ?').get(ws.id);
      if (!row) throw new Error('Workspace not found');
      const doc = JSON.parse(row.doc);
      edit(doc);
      db.prepare('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?').run(JSON.stringify(doc), now(), ws.id);
      db.exec('commit');
      return doc;
    } catch (err) {
      try {
        db.exec('rollback');
      } catch {
        /* no tx open */
      }
      throw err;
    }
  }

  function toolError(message) {
    const err = new Error(message);
    err.mcpToolError = true;
    return err;
  }

  /* --------------------------- visibility -------------------------------- */
  /* Mirror of memberCanReadProject (server.js) without the server import:
     public ∨ access list ∨ live team intersection; admins/owners see all.
     Computed per call — never cached across requests. */
  function canReadProject(ctx, p) {
    if (!p || typeof p !== 'object') return false;
    if ((ROLE_RANK[ctx.membership.role] || 0) >= ROLE_RANK.admin) return true;
    const priv = typeof p.private === 'boolean' ? p.private : p.access === 'private';
    if (!priv) return true;
    const mid = ctx.membership.member_id;
    if (mid && Array.isArray(p.members) && p.members.includes(mid)) return true;
    const teams = db.prepare('select team_id from team_members where workspace_id = ? and user_id = ?').all(ctx.ws.id, ctx.user.id).map(r => r.team_id);
    return Array.isArray(p.teams) && p.teams.length > 0 && teams.length > 0 && p.teams.some(t => teams.includes(t));
  }

  const tasksOf = doc => (Array.isArray(doc?.data?.tasks) ? doc.data.tasks : []).filter(t => t?.id);
  const projectsOf = doc => (Array.isArray(doc?.data?.projects) ? doc.data.projects : []).filter(p => p?.id);

  function visibleProjects(ctx, doc) {
    return projectsOf(doc).filter(p => !p.archived && canReadProject(ctx, p));
  }

  /* A task is readable iff its project is (every task belongs to a project;
     a project-less task is treated as invisible rather than leaked). */
  function readableProjectIds(ctx, doc) {
    return new Set(projectsOf(doc).filter(p => !p.archived && canReadProject(ctx, p)).map(p => p.id));
  }

  function visibleTasks(ctx, doc) {
    const ok = readableProjectIds(ctx, doc);
    return tasksOf(doc).filter(t => !t.archived && ok.has(t.project));
  }

  function findVisibleTask(ctx, id, doc) {
    const ok = readableProjectIds(ctx, doc);
    const t = tasksOf(doc).find(t => t.id === id);
    if (!t || t.archived || !ok.has(t.project)) throw toolError(`Task not found: ${id}`);
    return t;
  }

  function findVisibleProject(ctx, id, doc) {
    const p = projectsOf(doc).find(p => p.id === id);
    if (!p || p.archived || !canReadProject(ctx, p)) throw toolError(`Project not found: ${id}`);
    return p;
  }

  /* The roster projection (syncProfiles shape): membership rows are the
     authority; doc profiles only decorate. id is member_id space when the
     membership carries one. */
  function roster(ctx) {
    const doc = loadDoc(ctx.ws);
    const profiles = Array.isArray(doc?.data?.members) ? doc.data.members : [];
    const rows = db
      .prepare('select m.user_id, m.role, m.member_id, u.name, u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = ?')
      .all(ctx.ws.id);
    const byUser = new Map(rows.map(r => [r.user_id, r]));
    const out = [];
    const seen = new Set();
    for (const prof of profiles) {
      if (!prof?.userId || !byUser.has(prof.userId)) continue;
      const r = byUser.get(prof.userId);
      seen.add(r.user_id);
      out.push({ id: r.member_id || prof.id, name: r.name || prof.name || '', email: r.email || prof.email || '', role: r.role });
    }
    for (const r of rows) {
      if (seen.has(r.user_id)) continue;
      out.push({ id: r.member_id || r.user_id, name: r.name || '', email: r.email || '', role: r.role });
    }
    return out;
  }

  const memberName = (ctx, id) => roster(ctx).find(m => m.id === id)?.name || null;

  /* --------------------------- projections ------------------------------- */
  function taskOut(ctx, t, doc) {
    return {
      id: t.id,
      key: t.key || null,
      title: t.title || '',
      status: t.status || 'todo',
      project: t.project || null,
      projectKey: projectsOf(doc).find(p => p.id === t.project)?.key || null,
      assignee: t.assignee || null,
      assigneeName: t.assignee ? memberName(ctx, t.assignee) : null,
      priority: t.priority || null,
      due: t.due || null,
      labels: Array.isArray(t.labels) ? t.labels : [],
      subtasksTotal: Array.isArray(t.subtasks) ? t.subtasks.length : 0,
      subtasksDone: (t.subtasks || []).filter(s => s?.done).length,
      updated: t.updated || null,
    };
  }

  /* One activity row per mutation, same shape logAct writes (machine verbs,
     `by` in member_id space) — the Activity page filters render these
     verbatim. */
  function logActivity(doc, ctx, verb, task, extra = {}) {
    doc.data.activity = Array.isArray(doc.data.activity) ? doc.data.activity : [];
    doc.data.activity.unshift({
      id: uid('a'),
      by: ctx.membership.member_id || null,
      verb,
      task: task?.id || null,
      project: task?.project || null,
      at: now(),
      extra,
    });
  }

  /* --------------------------- tool surface ------------------------------ */
  /* Frozen registry: each tool carries a tiny hand-rolled argument schema
     (the D-12 constraint rules out zod). Types: s=string, n=integer,
     enum:[...], arr=string array, nullable allows explicit null. */
  const TOOLS = {
    list_projects: {
      description: 'List the projects of the workspace with open/total task counts.',
      schema: {},
      run: async ctx => {
        const doc = loadDoc(ctx.ws);
        const counts = new Map();
        for (const t of tasksOf(doc)) {
          const c = counts.get(t.project) || { total: 0, open: 0 };
          c.total++;
          if (t.status !== 'done' && !t.archived) c.open++;
          counts.set(t.project, c);
        }
        return {
          workspace: { id: ctx.ws.id, name: ctx.ws.name, slug: ctx.ws.slug },
          statuses: MCP_STATUSES,
          projects: visibleProjects(ctx, doc).map(p => ({
            id: p.id,
            key: p.key || null,
            name: p.name || '',
            description: p.desc || '',
            status: p.status || null,
            openTasks: counts.get(p.id)?.open || 0,
            totalTasks: counts.get(p.id)?.total || 0,
          })),
        };
      },
    },
    list_tasks: {
      description: 'List tasks, optionally filtered by project id, status, or assignee member id.',
      schema: {
        project: { t: 's' },
        status: { t: 'enum', values: MCP_STATUSES },
        assignee: { t: 's' },
        limit: { t: 'n', min: 1, max: 200, def: 50 },
      },
      run: async (ctx, a) => {
        const doc = loadDoc(ctx.ws);
        let rows = visibleTasks(ctx, doc);
        if (a.project) {
          findVisibleProject(ctx, a.project, doc);
          rows = rows.filter(t => t.project === a.project);
        }
        if (a.status) rows = rows.filter(t => t.status === a.status);
        if (a.assignee) rows = rows.filter(t => t.assignee === a.assignee);
        rows = rows
          .slice()
          .sort((x, y) => (y.updated || 0) - (x.updated || 0))
          .slice(0, a.limit ?? 50);
        return { total: rows.length, tasks: rows.map(t => taskOut(ctx, t, doc)) };
      },
    },
    get_task: {
      description: 'Get one task in full: description, subtasks, dependencies, comment count.',
      schema: { id: { t: 's', req: true } },
      run: async (ctx, a) => {
        const doc = loadDoc(ctx.ws);
        const t = findVisibleTask(ctx, a.id, doc);
        const comments = (doc?.data?.comments || []).filter(c => c?.task === t.id);
        const proj = projectsOf(doc).find(p => p.id === t.project) || {};
        return {
          ...taskOut(ctx, t, doc),
          description: t.desc || '',
          start: t.start || null,
          estimate: t.estimate || null,
          dependencies: Array.isArray(t.deps) ? t.deps : [],
          projectName: proj.name || null,
          commentsCount: comments.length,
        };
      },
    },
    search_tasks: {
      description: 'Search task titles, descriptions and task keys in the workspace (accent-folded, case-insensitive).',
      schema: { query: { t: 's', req: true }, limit: { t: 'n', min: 1, max: 50, def: 20 } },
      run: async (ctx, a) => {
        const doc = loadDoc(ctx.ws);
        const fold = s =>
          String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        const q = fold(a.query);
        const rows = visibleTasks(ctx, doc)
          .filter(t => fold(t.title).includes(q) || fold(t.desc).includes(q) || fold(t.key).includes(q))
          .slice(0, a.limit ?? 20);
        return { query: a.query, total: rows.length, tasks: rows.map(t => taskOut(ctx, t, doc)) };
      },
    },
    list_members: {
      description: 'List the members of the workspace (member ids for assignee parameters).',
      schema: {},
      run: async ctx => ({ members: roster(ctx) }),
    },
    create_task: {
      description: 'Create a task in a project.',
      write: true,
      schema: {
        project: { t: 's', req: true },
        title: { t: 's', req: true, max: 200 },
        description: { t: 's', max: 20000 },
        status: { t: 'enum', values: MCP_STATUSES, def: 'todo' },
        assignee: { t: 's' },
        priority: { t: 'enum', values: MCP_PRIORITIES },
        due: { t: 's', re: DUE_RE },
        labels: { t: 'arr', maxLen: 10, itemMax: 40 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = loadDoc(ctx.ws);
        const proj = findVisibleProject(ctx, a.project, doc);
        if (a.assignee && !roster(ctx).some(m => m.id === a.assignee)) throw toolError(`Unknown member id: ${a.assignee}`);
        const tasks = tasksOf(doc);
        const n = tasks.reduce((max, x) => Math.max(max, Number(x.order) || 0), 0) + 1;
        const usedKeys = new Set(tasks.map(x => x.key).filter(Boolean));
        let key = null;
        if (proj.key) {
          let i = 100;
          while (usedKeys.has(`${proj.key}-${i}`)) i++;
          key = `${proj.key}-${i}`;
        }
        const t = now();
        const task = {
          id: uid('t'),
          key,
          project: proj.id,
          title: a.title.trim(),
          status: a.status || 'todo',
          assignee: a.assignee || null,
          priority: a.priority || null,
          due: a.due || null,
          start: null,
          labels: Array.isArray(a.labels) ? a.labels : [],
          subtasks: [],
          attachments: [],
          deps: [],
          desc: a.description ? (a.description.includes('<') ? a.description : `<p>${esc(a.description)}</p>`) : '',
          estimate: null,
          created: t,
          updated: t,
          order: n,
          fav: false,
          recur: null,
        };
        writeDoc(ctx.ws, d => {
          d.data.tasks = Array.isArray(d.data.tasks) ? d.data.tasks : [];
          d.data.tasks.push(task);
          logActivity(d, ctx, 'created', task, {});
        });
        return { created: true, task: taskOut(ctx, task, doc) };
      },
    },
    update_task: {
      description: 'Update a task: title, description, due date, priority, labels or assignee. Use move_task for status changes.',
      write: true,
      schema: {
        id: { t: 's', req: true },
        title: { t: 's', max: 200 },
        description: { t: 's', max: 20000 },
        due: { t: 's', re: DUE_RE, nullable: true },
        priority: { t: 'enum', values: MCP_PRIORITIES, nullable: true },
        labels: { t: 'arr', maxLen: 10, itemMax: 40 },
        assignee: { t: 's', nullable: true },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const members = roster(ctx);
        let result = null;
        writeDoc(ctx.ws, d => {
          const tasks = Array.isArray(d.data.tasks) ? d.data.tasks : [];
          const t = tasks.find(x => x?.id === a.id);
          if (!t || t.archived) throw toolError(`Task not found: ${a.id}`);
          if (!readableProjectIds(ctx, d).has(t.project)) throw toolError(`Task not found: ${a.id}`);
          if (a.title !== undefined && a.title.trim() !== t.title) {
            logActivity(d, ctx, 'renamed', t, { kind: 'renamedTo', value: a.title.trim() });
            t.title = a.title.trim();
          }
          if (a.description !== undefined) t.desc = a.description.includes('<') ? a.description : `<p>${esc(a.description)}</p>`;
          if (a.due !== undefined && a.due !== t.due) {
            logActivity(d, ctx, 'changedDueDateOf', t, a.due ? { kind: 'dateSet', value: a.due } : { kind: 'dateCleared' });
            t.due = a.due;
          }
          if (a.priority !== undefined && a.priority !== t.priority) {
            logActivity(d, ctx, 'changedPriorityOf', t, { kind: 'prioritySet', value: a.priority });
            t.priority = a.priority;
          }
          if (a.labels !== undefined) {
            logActivity(d, ctx, 'updatedLabelsOn', t, {});
            t.labels = a.labels;
          }
          if (a.assignee !== undefined && a.assignee !== t.assignee) {
            if (a.assignee && !members.some(m => m.id === a.assignee)) throw toolError(`Unknown member id: ${a.assignee}`);
            logActivity(d, ctx, 'assigned', t, a.assignee ? { kind: 'assignedTo', value: members.find(m => m.id === a.assignee)?.name || a.assignee } : { kind: 'unassigned' });
            t.assignee = a.assignee || null;
          }
          t.updated = now();
          result = taskOut(ctx, t, d);
        });
        return { updated: true, task: result };
      },
    },
    move_task: {
      description: `Move a task to another column (status). Statuses: ${MCP_STATUSES.join(', ')} — any transition allowed.`,
      write: true,
      schema: { id: { t: 's', req: true }, status: { t: 'enum', values: MCP_STATUSES, req: true } },
      run: async (ctx, a) => {
        canWrite(ctx);
        let result = null;
        writeDoc(ctx.ws, d => {
          const tasks = Array.isArray(d.data.tasks) ? d.data.tasks : [];
          const t = tasks.find(x => x?.id === a.id);
          if (!t || t.archived) throw toolError(`Task not found: ${a.id}`);
          if (!readableProjectIds(ctx, d).has(t.project)) throw toolError(`Task not found: ${a.id}`);
          const from = t.status || 'todo';
          if (from !== a.status) {
            logActivity(d, ctx, a.status === 'done' ? 'completed' : 'moved', t, { kind: 'statusMoved', from, to: a.status });
            t.status = a.status;
            t.updated = now();
          }
          result = taskOut(ctx, t, d);
        });
        return { moved: true, task: result };
      },
    },
    add_comment: {
      description: 'Post a comment on a task. The author shown is the API key owner.',
      write: true,
      schema: { task: { t: 's', req: true }, text: { t: 's', req: true, max: 4000 } },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = loadDoc(ctx.ws);
        const t = findVisibleTask(ctx, a.task, doc);
        const comment = { id: uid('c'), task: t.id, by: ctx.membership.member_id || null, at: now(), text: a.text.trim(), re: {} };
        writeDoc(ctx.ws, d => {
          d.data.comments = Array.isArray(d.data.comments) ? d.data.comments : [];
          d.data.comments.push(comment);
          logActivity(d, ctx, 'commentedOn', tasksOf(d).find(x => x.id === t.id) || t, {});
        });
        return { posted: true, comment: { id: comment.id, at: comment.at } };
      },
    },
    list_comments: {
      description: 'List the comments on a task, oldest first.',
      schema: { task: { t: 's', req: true } },
      run: async (ctx, a) => {
        const doc = loadDoc(ctx.ws);
        const t = findVisibleTask(ctx, a.task, doc);
        const rows = (doc?.data?.comments || [])
          .filter(c => c?.task === t.id)
          .sort((x, y) => (x.at || 0) - (y.at || 0))
          .map(c => ({ id: c.id, by: c.by, authorName: c.by ? memberName(ctx, c.by) : null, at: c.at, text: c.text }));
        return { task: t.id, total: rows.length, comments: rows };
      },
    },
  };

  const toolDefs = () =>
    Object.entries(TOOLS).map(([name, tool]) => ({
      name,
      description: tool.write ? `${tool.description} (Requires a read+write API key.)` : tool.description,
      inputSchema: { type: 'object', properties: {}, required: [] }, // agents rely on the description; keep the wire shape simple
    }));

  /* Hand-rolled argument validation (D-12): unknown keys are rejected so a
     typo'd agent argument never silently no-ops. */
  function validateArgs(ctx, name, args) {
    const tool = TOOLS[name];
    const out = {};
    for (const key of Object.keys(args || {})) {
      if (!tool.schema[key]) throw toolError(`Unknown argument "${key}" for ${name}`);
    }
    for (const [key, rule] of Object.entries(tool.schema)) {
      let v = args?.[key];
      if (v === undefined) {
        if (rule.req) throw toolError(`Missing required argument "${key}" for ${name}`);
        if (rule.def !== undefined) out[key] = rule.def;
        continue;
      }
      if (v === null) {
        if (rule.nullable) {
          out[key] = null;
          continue;
        }
        throw toolError(`Argument "${key}" cannot be null`);
      }
      if (rule.t === 's') {
        if (typeof v !== 'string' || !v.trim()) throw toolError(`Argument "${key}" must be a non-empty string`);
        if (rule.max && v.length > rule.max) throw toolError(`Argument "${key}" exceeds ${rule.max} characters`);
        if (rule.re && !rule.re.test(v)) throw toolError(`Argument "${key}" must match ${rule.re}`);
        out[key] = v;
      } else if (rule.t === 'n') {
        const n = Number(v);
        if (!Number.isInteger(n) || n < (rule.min ?? -Infinity) || n > (rule.max ?? Infinity)) {
          throw toolError(`Argument "${key}" must be an integer${rule.min != null ? ` between ${rule.min} and ${rule.max}` : ''}`);
        }
        out[key] = n;
      } else if (rule.t === 'enum') {
        if (!rule.values.includes(v)) throw toolError(`Argument "${key}" must be one of: ${rule.values.join(', ')}`);
        out[key] = v;
      } else if (rule.t === 'arr') {
        if (!Array.isArray(v)) throw toolError(`Argument "${key}" must be an array of strings`);
        if (rule.maxLen && v.length > rule.maxLen) throw toolError(`Argument "${key}" accepts at most ${rule.maxLen} items`);
        if (v.some(x => typeof x !== 'string' || (rule.itemMax && x.length > rule.itemMax))) throw toolError(`Argument "${key}" items must be strings of at most ${rule.itemMax} characters`);
        out[key] = v;
      }
    }
    return out;
  }

  const canWrite = ctx => {
    if (ctx.scope !== 'write') throw toolError('This API key is read-only. Create a read+write key in Settings to allow mutations.');
    if ((ROLE_RANK[ctx.membership.role] || 0) < ROLE_RANK.member) throw toolError('Viewers cannot modify this workspace. Ask an administrator.');
  };

  /* --------------------------- JSON-RPC core ----------------------------- */
  function jsonRpcResult(id, result) {
    return { jsonrpc: '2.0', id, result };
  }

  function jsonRpcError(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }

  async function dispatch(ctx, ip, msg, sid) {
    const { id, method, params } = msg || {};
    if (method === 'initialize') {
      const session = crypto.randomUUID();
      sessions.set(session, { ctx, scope: ctx.scope });
      return {
        status: 200,
        session,
        body: jsonRpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'projects-studio', version: '1.1.1' },
        }),
      };
    }
    if (method === 'notifications/initialized') return { status: 202, body: null }; // notification: no reply body
    if (!sid || !sessions.has(sid)) return { status: 400, body: jsonRpcError(id, -32000, 'Bad Request: Server not initialized') };
    if (method === 'tools/list') return { status: 200, body: jsonRpcResult(id, { tools: toolDefs() }) };
    if (method === 'tools/call') {
      const name = String(params?.name || '');
      const tool = TOOLS[name];
      if (!tool) return { status: 200, body: jsonRpcResult(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }) };
      let args;
      try {
        args = validateArgs(ctx, name, params?.arguments);
      } catch (err) {
        return { status: 200, body: jsonRpcResult(id, { content: [{ type: 'text', text: `MCP error -32602: ${err.message}` }], isError: true }) };
      }
      try {
        const out = await tool.run(ctx, args);
        audit(ctx, ip, `mcp.${name}`, `mcp:${name}`);
        return { status: 200, body: jsonRpcResult(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }) };
      } catch (err) {
        if (err?.mcpToolError) {
          audit(ctx, ip, `mcp.${name}.error`, `mcp:${name}`);
          return { status: 200, body: jsonRpcResult(id, { content: [{ type: 'text', text: err.message }], isError: true }) };
        }
        logWarn(`mcp tool ${name}: ${err.message}`);
        return { status: 200, body: jsonRpcResult(id, { content: [{ type: 'text', text: 'Internal error' }], isError: true }) };
      }
    }
    return { status: 200, body: jsonRpcError(id, -32601, `Method not found: ${method}`) };
  }

  /* ------------------------------ handle --------------------------------- */
  async function handle(req, res) {
    /* Auth BEFORE any protocol work: no credential, no MCP handshake, no
       session oracle. Rate limit right after the key is known. */
    const auth = authenticate(req);
    if (auth.status) return fail(res, auth.status, auth.code, auth.message);
    const ctx = auth;
    const ip = clientIp(req);
    if (tooMany(`mcp|${ctx.key.id}`, 60, 60 * 1000)) return fail(res, 429, 'mcpTooManyRequests', 'Rate limit exceeded (60 req/min per key)');

    const method = req.method.toUpperCase();
    const sid = String(req.headers['mcp-session-id'] || '');
    const entry = sid ? sessions.get(sid) : undefined;
    if (entry && entry.ctx.key.id !== ctx.key.id) return fail(res, 401, 'mcpUnauthorized', 'Session belongs to another API key');
    /* Scope changes apply IMMEDIATELY: a live session built under the old
       scope is dropped, so the client must re-initialize (authenticate above
       already rejects revoked/expired keys outright). */
    if (entry && entry.scope !== ctx.scope) {
      sessions.delete(sid);
      return fail(res, 401, 'mcpSessionStale', 'API key scope changed; re-initialize the session');
    }

    try {
      if (method === 'POST') {
        let msg;
        try {
          msg = await readJsonBody(req);
        } catch (err) {
          return fail(res, err.message === 'Invalid JSON body' ? 400 : 413, 'mcpInvalidRequest', err.message);
        }
        if (!msg || typeof msg !== 'object') return fail(res, 400, 'mcpInvalidRequest', 'Invalid JSON-RPC message');
        const reply = await dispatch(ctx, ip, msg, sid);
        if (reply.status === 202) {
          res.writeHead(202, { 'Cache-Control': 'no-store' });
          return res.end();
        }
        const payload = JSON.stringify(reply.body);
        const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
        if (reply.session) headers['mcp-session-id'] = reply.session;
        res.writeHead(reply.status, headers);
        return res.end(payload);
      }
      if (method === 'DELETE') {
        /* Session termination: the spec's client-driven close. */
        if (sid && sessions.has(sid)) sessions.delete(sid);
        res.writeHead(200, { 'Cache-Control': 'no-store' });
        return res.end();
      }
      /* GET (the optional server→client SSE stream) is not offered: this
         server never pushes unsolicited messages. 405 is the spec-sanctioned
         answer for servers without the stream. */
      return fail(res, 405, 'methodNotAllowed', 'Method not allowed (POST a JSON-RPC message, DELETE to close the session)');
    } catch (err) {
      logWarn(`mcp ${method} /mcp: ${err.message}`);
      return fail(res, 500, 'mcpInternalError', 'Internal server error');
    }
  }

  return { handle };
}
