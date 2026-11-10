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
export const MCP_PRIORITIES = ['none', 'urgent', 'high', 'medium', 'low']; // 'none' = UI-canonical cleared value (PRIOS, constants.js)
/* Project lifecycle ids (src/core/constants.js PSTAT). */
export const MCP_PROJECT_STATUSES = ['planning', 'active', 'risk', 'hold', 'complete'];
/* The label catalog (src/core/constants.js LABELS ids). Task documents store
   label ids, never free strings — this is the closed vocabulary. */
export const MCP_LABELS = ['design', 'frontend', 'backend', 'research', 'content', 'bug', 'qa', 'growth'];
/* Recurrence values exactly as the client stores them (actions.js RECUR_DAYS). */
export const MCP_RECUR = ['Daily', 'Weekly', 'Every 2 weeks', 'Monthly'];
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
  const { db, now, uid, clientIp, logInfo, logWarn, tooMany, maxBody, ROLE_RANK } = deps;

  /* Session registry: mcp-session-id → { ctx, scope }. The session is
     bound to the key that created it — a request presenting session X with a
     DIFFERENT key is rejected, so a leaked session id grants nothing. */
  const sessions = new Map();

  /* ----------------------------- auth ---------------------------------- */
  async function authenticate(req) {
    const m = /^Bearer\s+(.+)$/i.exec(String(req.headers['authorization'] || ''));
    if (!m) return { status: 401, code: 'mcpUnauthorized', message: 'Missing bearer token' };
    const row = await db.get('select * from api_keys where key_hash = ?', [sha256hex(m[1].trim())]);
    if (!row || row.revoked_at) return { status: 401, code: 'mcpUnauthorized', message: 'Invalid or revoked API key' };
    if (row.expires_at <= now()) return { status: 401, code: 'mcpUnauthorized', message: 'API key expired' };
    const user = await db.get('select * from users where id = ?', [row.user_id]);
    const ws = await db.get('select * from workspaces where id = ?', [row.workspace_id]);
    const membership = await db.get('select * from memberships where workspace_id = ? and user_id = ?', [row.workspace_id, row.user_id]);
    if (!user || !ws || !membership) return { status: 401, code: 'mcpUnauthorized', message: 'API key no longer valid' };
    /* Throttled last-used stamp: one write per minute at most, never per
       request — the settings card shows "last used" without a write storm. */
    if (!row.last_used_at || row.last_used_at < now() - 60_000) {
      await db.run('update api_keys set last_used_at = ? where id = ?', [now(), row.id]);
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
  async function audit(ctx, ip, action, targetName) {
    try {
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), ctx.user.id, ctx.key.id, action, 0, ip, ctx.ws.id, ctx.user.name, ctx.user.email, targetName || 'mcp', 'api-key', now()],
      );
    } catch (err) {
      logWarn(`mcp audit ${action}: ${err.message}`);
    }
  }

  /* ------------------------- document access ----------------------------- */
  async function loadDoc(ws) {
    const row = await db.get('select doc from workspaces where id = ?', [ws.id]);
    return row ? JSON.parse(row.doc) : null;
  }

  /* The same shape as server.js's PUT path: one immediate transaction,
     one JSON parse of the CURRENT row, one revision bump. Never a blind
     overwrite of a row read outside the transaction. */
  async function writeDoc(ws, edit) {
    return await db.tx(async () => {
      const row = await db.get('select doc from workspaces where id = ?', [ws.id]);
      if (!row) throw new Error('Workspace not found');
      const doc = JSON.parse(row.doc);
      await edit(doc);
      await db.run('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?', [JSON.stringify(doc), now(), ws.id]);
      return doc;
    });
  }

  function toolError(message) {
    const err = new Error(message);
    err.mcpToolError = true;
    return err;
  }

  /* --------------------------- visibility -------------------------------- */
  /* [2026-11-07 D-49-2/D-49-4, 2026-11-08 D-50-5, 2026-11-09 Phase 53 (53-01)]
     Mirror of memberCanReadProject (server.js) without the server import:
     boolean private flag ∨ access list ∨ LIVE team link (the same D-50-5
     third term — p.teams is read again). The admin/owner exemption stays
     (server hiddenFor keeps the same bypass); the legacy p.access spelling
     stays retired. Computed per call — never cached across requests.
     [53-01, D-03] The 53-01 per-team permission keys ride INSIDE p.perms as
     'team:'+teamId (no top-level field) and gate CONTENT WRITES only —
     visibility stays boolean, so this mirror needs NO perm-tier logic; its
     agreement with the server funnel is pinned per-actor in test/mcp.test.mjs
     (53-01 parity rows, VISIBILITY_MODEL/MIRROR_MODEL team-perm cells). */
  async function canReadProject(ctx, p) {
    if (!p || typeof p !== 'object') return false;
    if ((ROLE_RANK[ctx.membership.role] || 0) >= ROLE_RANK.admin) return true;
    if (p.private !== true) return true;
    const mid = ctx.membership.member_id;
    if (!mid) return false;
    if (Array.isArray(p.members) && p.members.includes(mid)) return true;
    /* D-50-5: resolve the caller's LIVE team ids from team_members (user_id
       space) and intersect with p.teams — the exact term server.js resolves. */
    const pTeams = Array.isArray(p.teams) ? p.teams.filter(t => typeof t === 'string' && t) : [];
    if (!pTeams.length) return false;
    const rows = await db.all('select team_id from team_members where workspace_id = ? and user_id = ?', [ctx.ws.id, ctx.membership.user_id]);
    const mine = new Set(rows.map(r => r.team_id));
    return pTeams.some(t => mine.has(t));
  }

  const tasksOf = doc => (Array.isArray(doc?.data?.tasks) ? doc.data.tasks : []).filter(t => t?.id);
  const projectsOf = doc => (Array.isArray(doc?.data?.projects) ? doc.data.projects : []).filter(p => p?.id);

  async function visibleProjects(ctx, doc) {
    const out = [];
    for (const p of projectsOf(doc)) {
      if (!p.archived && (await canReadProject(ctx, p))) out.push(p);
    }
    return out;
  }

  /* A task is readable iff its project is (every task belongs to a project;
     a project-less task is treated as invisible rather than leaked). */
  async function readableProjectIds(ctx, doc) {
    const ok = new Set();
    for (const p of projectsOf(doc)) {
      if (!p.archived && (await canReadProject(ctx, p))) ok.add(p.id);
    }
    return ok;
  }

  async function visibleTasks(ctx, doc) {
    const ok = await readableProjectIds(ctx, doc);
    return tasksOf(doc).filter(t => !t.archived && ok.has(t.project));
  }

  async function findVisibleTask(ctx, id, doc) {
    const ok = await readableProjectIds(ctx, doc);
    const t = tasksOf(doc).find(t => t.id === id);
    if (!t || t.archived || !ok.has(t.project)) throw toolError(`Task not found: ${id}`);
    return t;
  }

  /* A project reference may be the internal id OR the human key prefix
     (TEST, KAN…) — the stable, human-readable name an agent can carry in
     its own context (repo AGENTS.md) without a lookup round-trip. */
  async function findVisibleProjectRef(ctx, ref, doc) {
    const p = projectsOf(doc).find(p => p.id === ref) || projectsOf(doc).find(p => p.key && p.key.toUpperCase() === String(ref).toUpperCase());
    if (!p || p.archived || !(await canReadProject(ctx, p))) throw toolError(`Project not found: ${ref}`);
    return p;
  }

  /* Assignee resolution: member id first, then name, then email — so an
     agent can write "assignee": "marie@example.com" without a list_members
     round-trip. Exact id matches always win; names compare folded. */
  async function resolveAssignee(ctx, ref) {
    const members = await roster(ctx);
    const exact = members.find(m => m.id === ref);
    if (exact) return exact.id;
    const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hit =
      members.find(m => m.email && m.email.toLowerCase() === String(ref).toLowerCase()) ||
      members.find(m => fold(m.name) === fold(ref));
    if (!hit) throw toolError(`Unknown member "${ref}" — use a member id, email, or exact name (see list_members)`);
    return hit.id;
  }

  /* The roster projection (syncProfiles shape): membership rows are the
     authority; doc profiles only decorate. id is member_id space when the
     membership carries one. */
  async function roster(ctx) {
    const doc = await loadDoc(ctx.ws);
    const profiles = Array.isArray(doc?.data?.members) ? doc.data.members : [];
    const rows = await db.all(
      'select m.user_id, m.role, m.member_id, u.name, u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = ?',
      [ctx.ws.id],
    );
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

  const memberName = async (ctx, id) => (await roster(ctx)).find(m => m.id === id)?.name || null;

  /* --------------------------- projections ------------------------------- */
  async function taskOut(ctx, t, doc) {
    return {
      id: t.id,
      key: t.key || null,
      title: t.title || '',
      status: t.status || 'todo',
      project: t.project || null,
      projectKey: projectsOf(doc).find(p => p.id === t.project)?.key || null,
      assignee: t.assignee || null,
      assigneeName: t.assignee ? await memberName(ctx, t.assignee) : null,
      priority: t.priority || 'none',
      due: t.due || null,
      recur: t.recur || null,
      labels: Array.isArray(t.labels) ? t.labels : [],
      subtasksTotal: Array.isArray(t.subtasks) ? t.subtasks.length : 0,
      subtasksDone: (t.subtasks || []).filter(s => s?.done).length,
      updated: t.updated || null,
    };
  }

  /* One activity row per mutation, same shape logAct writes (machine verbs,
     `by` in member_id space) — the Activity page filters render these
     verbatim. */
  function logActivity(doc, ctx, verb, task, extra = {}, projectId) {
    doc.data.activity = Array.isArray(doc.data.activity) ? doc.data.activity : [];
    doc.data.activity.unshift({
      id: uid('a'),
      by: ctx.membership.member_id || null,
      verb,
      task: task?.id || null,
      project: task?.project || projectId || null,
      at: now(),
      extra,
    });
  }

  /* --------------------------- prompt surface ---------------------------- */
  /* Slash-command style prompts the client lists under prompts/list. Each
     builds a ready-to-run instruction grounded in the tools we ship. */
  const PROMPTS = [
    {
      name: 'daily-standup',
      description: 'Standup summary: what moved yesterday, what is in progress, what is blocked.',
      arguments: [{ name: 'project', description: 'Project id or key prefix (optional — all projects if omitted)', required: false }],
      build: a => [
        'Prepare my daily standup from Projects Studio.',
        a.project ? `Scope: project ${a.project}.` : 'Scope: every project in the workspace.',
        'Using the Projects Studio MCP tools:',
        '1. whoami to confirm the workspace and project map.',
        '2. list_tasks filtered on statuses progress and review to build "in progress" and "waiting on review".',
        '3. list_activity to summarize what moved since the previous day.',
        '4. list_tasks with status backlog and a non-null dependency list (get_task) to flag anything blocked.',
        'Then output: Done since yesterday / In progress / Blocked or needs review — one bullet per task with its key, title, assignee and due date. Be factual: only what the data says.',
      ].join('\n'),
    },
    {
      name: 'triage-backlog',
      description: 'Review the backlog of a project: dedupe, prioritize, and propose a To-do ordering.',
      arguments: [
        { name: 'project', description: 'Project id or key prefix', required: true },
        { name: 'limit', description: 'How many backlog tasks to examine (default 50)', required: false },
      ],
      build: a => {
        if (!a.project) throw new Error("Missing required argument: project");
        return [
          `Triage the Backlog of project ${a.project} in Projects Studio.`,
          'Using the Projects Studio MCP tools:',
          `1. list_tasks { project: ${JSON.stringify(String(a.project))}, status: "backlog", limit: ${Number(a.limit) || 50} }.`,
          '2. Group the tasks: duplicates or near-duplicates, stale items (no update in a long time), quick wins, and everything else.',
          '3. Propose an ordering for the To-do column: urgent/high priority first, then due dates, then quick wins.',
          '4. Report proposed moves as a numbered list, and WAIT for my confirmation before calling move_task or update_task.',
        ].join('\n');
      },
    },
    {
      name: 'prepare-review',
      description: 'Prepare a code-review handoff: move a task to review, post a summary comment.',
      arguments: [
        { name: 'task', description: 'Task id', required: true },
        { name: 'summary', description: 'Short summary of what was done', required: false },
      ],
      build: a => {
        if (!a.task) throw new Error("Missing required argument: task");
        return [
          `Prepare the review handoff for task ${a.task}.`,
          'Using the Projects Studio MCP tools:',
          `1. get_task { id: ${JSON.stringify(String(a.task))} } and list_comments to gather context.`,
          a.summary ? `2. The work done: ${String(a.summary).slice(0, 500)}.` : '2. Ask me for a one-paragraph summary of what was done if it is not obvious.',
          '3. Show me the proposed summary comment for approval.',
          '4. After my approval: add_comment with the summary, then move_task to status review.',
        ].join('\n');
      },
    },
  ];

  /* --------------------------- tool surface ------------------------------ */
  /* Frozen registry: each tool carries a tiny hand-rolled argument schema
     (the D-12 constraint rules out zod). Types: s=string, n=integer,
     enum:[...], arr=string array, nullable allows explicit null. */
  const TOOLS = {
    list_projects: {
      description: 'List the projects of the workspace with open/total task counts.',
      schema: {},
      run: async ctx => {
        const doc = await loadDoc(ctx.ws);
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
          projects: (await visibleProjects(ctx, doc)).map(p => ({
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
    whoami: {
      description: 'Identify the API key: workspace, your role, scope, expiry, and a compact project map (id + key prefix + name) usable as a stable project reference.',
      schema: {},
      run: async ctx => {
        const doc = await loadDoc(ctx.ws);
        return {
          workspace: { id: ctx.ws.id, name: ctx.ws.name, slug: ctx.ws.slug },
          user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
          role: ctx.membership.role,
          scope: ctx.scope,
          keyPrefix: ctx.key.prefix,
          expiresAt: ctx.key.expires_at,
          statuses: MCP_STATUSES,
          projects: (await visibleProjects(ctx, doc)).map(p => ({ id: p.id, key: p.key || null, name: p.name || '' })),
        };
      },
    },
    get_project: {
      description: 'Get one project in full: description, status, lead, members, milestones.',
      schema: { project: { t: 's', req: true } },
      run: async (ctx, a) => {
        const doc = await loadDoc(ctx.ws);
        const p = await findVisibleProjectRef(ctx, a.project, doc);
        const members = await roster(ctx);
        const counts = {};
        for (const s of MCP_STATUSES) counts[s] = 0;
        for (const t of tasksOf(doc)) if (t.project === p.id && !t.archived) counts[t.status || 'todo'] = (counts[t.status || 'todo'] || 0) + 1;
        return {
          id: p.id,
          key: p.key || null,
          name: p.name || '',
          description: p.desc || '',
          status: p.status || null,
          /* D-49-4: post-sweep every project carries the boolean; the legacy
             p.access fallback spelling is retired (the boot sweep normalized
             it away before any request is served). */
          private: p.private === true,
          lead: p.lead || null,
          leadName: p.lead ? members.find(m => m.id === p.lead)?.name || p.lead : null,
          members: (Array.isArray(p.members) ? p.members : []).map(id => ({ id, name: members.find(m => m.id === id)?.name || id })),
          milestones: Array.isArray(p.milestones) ? p.milestones : [],
          tasksByStatus: counts,
        };
      },
    },
    create_project: {
      description: 'Create a project in the workspace. The key prefix (e.g. KAN) is derived from the name unless given.',
      write: true,
      schema: {
        name: { t: 's', req: true, max: 60 },
        key: { t: 's', re: /^[A-Z][A-Z0-9]{1,7}$/, max: 8 },
        description: { t: 's', max: 2000 },
        status: { t: 'enum', values: MCP_PROJECT_STATUSES, def: 'active' },
        private: { t: 'b', def: false },
        start: { t: 's', re: DUE_RE, nullable: true },
        due: { t: 's', re: DUE_RE, nullable: true },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const used = new Set(projectsOf(doc).map(p => p.key).filter(Boolean));
        let key = a.key || null;
        if (!key) {
          const letters = String(a.name).toUpperCase().replace(/[^A-Z]/g, '');
          for (const cand of [letters.slice(0, 4), letters.slice(0, 3), letters.slice(0, 5) || 'PRJ']) {
            if (cand && !used.has(cand)) {
              key = cand;
              break;
            }
          }
          if (!key) key = 'PRJ';
          let n = 2;
          while (used.has(key)) key = `PRJ${n++}`;
        } else if (used.has(key)) {
          throw toolError(`Project key "${key}" is already taken`);
        }
        const me = (await roster(ctx)).find(m => m.id === ctx.membership.member_id);
        const project = {
          id: uid(),
          key,
          name: a.name.trim(),
          desc: a.description || '',
          status: a.status || 'active',
          private: !!a.private,
          start: a.start || null,
          due: a.due || null,
          members: a.private && me ? [me.id] : [],
          teams: [],
          lead: me?.id || null,
          milestones: [],
          fav: false,
          archived: false,
        };
        await writeDoc(ctx.ws, async d => {
          d.data.projects = Array.isArray(d.data.projects) ? d.data.projects : [];
          d.data.projects.push(project);
          /* The web UI lists projects through data.projOrder (store.js visibleProjects);
             without this entry an MCP-created project never renders on the Projects page. */
          d.data.projOrder = Array.isArray(d.data.projOrder) ? d.data.projOrder : [];
          d.data.projOrder.unshift(project.id);
          logActivity(d, ctx, 'createdProject', null, {}, project.id);
        });
        return { created: true, project: { id: project.id, key: project.key, name: project.name, status: project.status } };
      },
    },
    update_project: {
      description: 'Update a project: name, description, dates (start/due), or lifecycle status (planning/active/risk/hold/complete).',
      write: true,
      schema: {
        project: { t: 's', req: true },
        name: { t: 's', max: 60 },
        description: { t: 's', max: 2000 },
        status: { t: 'enum', values: MCP_PROJECT_STATUSES },
        start: { t: 's', re: DUE_RE, nullable: true },
        due: { t: 's', re: DUE_RE, nullable: true },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        let result = null;
        await writeDoc(ctx.ws, async d => {
          const p = projectsOf(d).find(p => p.id === a.project || (p.key && p.key.toUpperCase() === String(a.project).toUpperCase()));
          if (!p || p.archived) throw toolError(`Project not found: ${a.project}`);
          if (a.name !== undefined && a.name.trim() !== p.name) {
            logActivity(d, ctx, 'renamed', null, { kind: 'renamedTo', value: a.name.trim() }, p.id);
            p.name = a.name.trim();
          }
          if (a.description !== undefined) p.desc = a.description;
          if (a.status !== undefined && a.status !== p.status) {
            logActivity(d, ctx, 'projectStatusChanged', null, { kind: 'projStatusSet', value: a.status }, p.id);
            p.status = a.status;
          }
          if (a.start !== undefined) p.start = a.start;
          if (a.due !== undefined) p.due = a.due;
          result = { id: p.id, key: p.key, name: p.name, description: p.desc, status: p.status, start: p.start ?? null, due: p.due ?? null };
        });
        return { updated: true, project: result };
      },
    },
    add_milestone: {
      description: 'Add a milestone (name + target date) to a project. Shown on the project overview and timeline.',
      write: true,
      schema: {
        project: { t: 's', req: true },
        name: { t: 's', req: true, max: 120 },
        date: { t: 's', req: true, re: DUE_RE },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const p = await findVisibleProjectRef(ctx, a.project, doc);
        const ms = { name: a.name.trim(), date: a.date };
        await writeDoc(ctx.ws, async d => {
          const live = projectsOf(d).find(x => x.id === p.id);
          live.milestones = Array.isArray(live.milestones) ? live.milestones : [];
          live.milestones.push(ms);
        });
        return { added: true, milestone: ms, total: (p.milestones || []).length + 1 };
      },
    },
    remove_milestone: {
      description: 'Remove a milestone from a project, by name (exact) or 0-based index.',
      write: true,
      schema: {
        project: { t: 's', req: true },
        name: { t: 's', max: 120 },
        index: { t: 'n', min: 0, max: 99 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const p = await findVisibleProjectRef(ctx, a.project, doc);
        let removed = null;
        await writeDoc(ctx.ws, async d => {
          const live = projectsOf(d).find(x => x.id === p.id);
          const list = Array.isArray(live.milestones) ? live.milestones : [];
          const i = a.name ? list.findIndex(m => m?.name === a.name) : a.index;
          if (i < 0 || !list[i]) throw toolError(`Milestone not found on ${p.key || p.id}`);
          removed = list[i];
          live.milestones = list.filter((_, j) => j !== i);
        });
        return { removed: true, milestone: removed };
      },
    },
    add_project_member: {
      description: 'Add a member to a project (needed for private projects). Requires write scope and project management rights (lead or admin).',
      write: true,
      schema: {
        project: { t: 's', req: true },
        member: { t: 's', req: true, max: 200 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const p = await findVisibleProjectRef(ctx, a.project, doc);
        requireProjectManager(ctx, p);
        const id = await resolveAssignee(ctx, a.member);
        await writeDoc(ctx.ws, async d => {
          const live = projectsOf(d).find(x => x.id === p.id);
          live.members = Array.isArray(live.members) ? live.members : [];
          if (!live.members.includes(id)) live.members.push(id);
        });
        const m = (await roster(ctx)).find(m => m.id === id);
        return { added: true, member: { id, name: m?.name || id } };
      },
    },
    remove_project_member: {
      description: 'Remove a member from a project. Requires write scope and project management rights (lead or admin).',
      write: true,
      schema: {
        project: { t: 's', req: true },
        member: { t: 's', req: true, max: 200 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const p = await findVisibleProjectRef(ctx, a.project, doc);
        requireProjectManager(ctx, p);
        const id = await resolveAssignee(ctx, a.member);
        await writeDoc(ctx.ws, async d => {
          const live = projectsOf(d).find(x => x.id === p.id);
          live.members = (Array.isArray(live.members) ? live.members : []).filter(x => x !== id);
        });
        return { removed: true };
      },
    },
    archive_project: {
      description: 'Archive a project (hidden from the board, its tasks stay in the database).',
      write: true,
      schema: { project: { t: 's', req: true } },
      run: async (ctx, a) => {
        canWrite(ctx);
        await writeDoc(ctx.ws, async d => {
          const p = projectsOf(d).find(p => p.id === a.project || (p.key && p.key.toUpperCase() === String(a.project).toUpperCase()));
          if (!p) throw toolError(`Project not found: ${a.project}`);
          if (!p.archived) {
            p.archived = true;
            p.archivedAt = now();
          }
        });
        return { archived: true };
      },
    },
    restore_project: {
      description: 'Restore an archived project.',
      write: true,
      schema: { project: { t: 's', req: true } },
      run: async (ctx, a) => {
        canWrite(ctx);
        await writeDoc(ctx.ws, async d => {
          const p = projectsOf(d).find(p => p.id === a.project || (p.key && p.key.toUpperCase() === String(a.project).toUpperCase()));
          if (!p) throw toolError(`Project not found: ${a.project}`);
          if (p.archived) {
            p.archived = false;
            p.archivedAt = null;
          }
        });
        return { restored: true };
      },
    },
    list_tasks: {
      description: 'List tasks, optionally filtered by project (id or key prefix), status, or assignee member id.',
      schema: {
        project: { t: 's' },
        status: { t: 'enum', values: MCP_STATUSES },
        assignee: { t: 's' },
        limit: { t: 'n', min: 1, max: 200, def: 50 },
      },
      run: async (ctx, a) => {
        const doc = await loadDoc(ctx.ws);
        let rows = await visibleTasks(ctx, doc);
        if (a.project) {
          await findVisibleProjectRef(ctx, a.project, doc);
          rows = rows.filter(t => t.project === a.project || t.project === (projectsOf(doc).find(p => p.key && p.key.toUpperCase() === String(a.project).toUpperCase()) || {}).id);
        }
        if (a.status) rows = rows.filter(t => t.status === a.status);
        if (a.assignee) rows = rows.filter(t => t.assignee === a.assignee);
        rows = rows
          .slice()
          .sort((x, y) => (y.updated || 0) - (x.updated || 0))
          .slice(0, a.limit ?? 50);
        return { total: rows.length, tasks: await Promise.all(rows.map(t => taskOut(ctx, t, doc))) };
      },
    },
    get_task: {
      description: 'Get one task in full: description, subtasks, dependencies, comment count.',
      schema: { id: { t: 's', req: true } },
      run: async (ctx, a) => {
        const doc = await loadDoc(ctx.ws);
        const t = await findVisibleTask(ctx, a.id, doc);
        const comments = (doc?.data?.comments || []).filter(c => c?.task === t.id);
        const proj = projectsOf(doc).find(p => p.id === t.project) || {};
        return {
          ...(await taskOut(ctx, t, doc)),
          description: t.desc || '',
          start: t.start || null,
          estimate: t.estimate || null,
          dependencies: Array.isArray(t.deps) ? t.deps : [],
          subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => ({ id: s?.id || null, title: s?.title || '', done: !!s?.done })) : [],
          projectName: proj.name || null,
          commentsCount: comments.length,
        };
      },
    },
    search_tasks: {
      description: 'Search task titles, descriptions and task keys in the workspace (accent-folded, case-insensitive).',
      schema: { query: { t: 's', req: true }, limit: { t: 'n', min: 1, max: 50, def: 20 } },
      run: async (ctx, a) => {
        const doc = await loadDoc(ctx.ws);
        const fold = s =>
          String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        const q = fold(a.query);
        const rows = (await visibleTasks(ctx, doc))
          .filter(t => fold(t.title).includes(q) || fold(t.desc).includes(q) || fold(t.key).includes(q))
          .slice(0, a.limit ?? 20);
        return { query: a.query, total: rows.length, tasks: await Promise.all(await Promise.all(rows.map(t => taskOut(ctx, t, doc)))) };
      },
    },
    list_members: {
      description: 'List the members of the workspace (member ids for assignee parameters).',
      schema: {},
      run: async ctx => ({ members: await roster(ctx) }),
    },
    list_teams: {
      description: 'The teams of the workspace (definitions + member names). Membership lives in the team_members table.',
      schema: {},
      run: async ctx => {
        const doc = await loadDoc(ctx.ws);
        const defs = Array.isArray(doc?.data?.teams) ? doc.data.teams : [];
        const members = await roster(ctx);
        const rows = await db.all('select team_id, member_id from team_members where workspace_id = ?', [ctx.ws.id]);
        return {
          teams: defs.map(t => ({
            id: t?.id || null,
            name: t?.name || '',
            color: t?.color || t?.c || null,
            members: rows
              .filter(r => r.team_id === t?.id)
              .map(r => {
                const m = members.find(m => m.id === r.member_id);
                return { id: r.member_id, name: m?.name || r.member_id };
              }),
          })),
        };
      },
    },
    list_labels: {
      description: 'The workspace label catalog with per-label task counts. Tasks store these ids in their labels[] array.',
      schema: {},
      run: async ctx => {
        const doc = await loadDoc(ctx.ws);
        const counts = Object.fromEntries(MCP_LABELS.map(l => [l, 0]));
        let other = 0;
        for (const t of tasksOf(doc)) {
          if (t.archived) continue;
          for (const l of Array.isArray(t.labels) ? t.labels : []) {
            if (l in counts) counts[l]++;
            else other++;
          }
        }
        return { labels: MCP_LABELS.map(l => ({ id: l, tasks: counts[l] })), other };
      },
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
        recur: { t: 'enum', values: MCP_RECUR },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const proj = await findVisibleProjectRef(ctx, a.project, doc);
        if (a.assignee) a.assignee = await resolveAssignee(ctx, a.assignee);
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
          priority: a.priority || 'none', // UI-canonical: PR[null] would crash the client renderer
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
          recur: a.recur || null,
        };
        await writeDoc(ctx.ws, async d => {
          d.data.tasks = Array.isArray(d.data.tasks) ? d.data.tasks : [];
          d.data.tasks.push(task);
          logActivity(d, ctx, 'created', task, {});
        });
        return { created: true, task: await taskOut(ctx, task, doc) };
      },
    },
    update_task: {
      description: 'Update a task: title, description, dates (due/start), estimate, priority, labels or assignee (id, email, or exact name). Use move_task for status changes.',
      write: true,
      schema: {
        id: { t: 's', req: true },
        title: { t: 's', max: 200 },
        description: { t: 's', max: 20000 },
        due: { t: 's', re: DUE_RE, nullable: true },
        start: { t: 's', re: DUE_RE, nullable: true },
        estimate: { t: 's', max: 20, nullable: true },
        priority: { t: 'enum', values: MCP_PRIORITIES, nullable: true },
        labels: { t: 'arr', maxLen: 10, itemMax: 40 },
        recur: { t: 'enum', values: MCP_RECUR, nullable: true },
        assignee: { t: 's', nullable: true },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        let result = null;
        await writeDoc(ctx.ws, async d => {
          const tasks = Array.isArray(d.data.tasks) ? d.data.tasks : [];
          const t = tasks.find(x => x?.id === a.id);
          if (!t || t.archived) throw toolError(`Task not found: ${a.id}`);
          if (!(await readableProjectIds(ctx, d)).has(t.project)) throw toolError(`Task not found: ${a.id}`);
          if (a.title !== undefined && a.title.trim() !== t.title) {
            logActivity(d, ctx, 'renamed', t, { kind: 'renamedTo', value: a.title.trim() });
            t.title = a.title.trim();
          }
          if (a.description !== undefined) t.desc = a.description.includes('<') ? a.description : `<p>${esc(a.description)}</p>`;
          if (a.due !== undefined && a.due !== t.due) {
            logActivity(d, ctx, 'changedDueDateOf', t, a.due ? { kind: 'dateSet', value: a.due } : { kind: 'dateCleared' });
            t.due = a.due;
          }
          if (a.start !== undefined && a.start !== t.start) {
            logActivity(d, ctx, 'changedStartDateOf', t, a.start ? { kind: 'dateSet', value: a.start } : { kind: 'dateCleared' });
            t.start = a.start;
          }
          if (a.estimate !== undefined && a.estimate !== t.estimate) {
            logActivity(d, ctx, 'estimated', t, a.estimate ? { kind: 'estimateSet', value: a.estimate } : {});
            t.estimate = a.estimate || null;
          }
          if (a.priority !== undefined && a.priority !== t.priority) {
            const cleared = a.priority === null || a.priority === 'none';
            logActivity(d, ctx, 'changedPriorityOf', t, { kind: 'prioritySet', value: cleared ? 'none' : a.priority }); // same shape as the UI setter (actions.js)
            t.priority = cleared ? 'none' : a.priority; // UI-canonical: never store null (PR[null] crashes the client renderer)
          }
          if (a.labels !== undefined) {
            logActivity(d, ctx, 'updatedLabelsOn', t, {});
            t.labels = a.labels;
          }
          if (a.recur !== undefined && a.recur !== t.recur) {
            logActivity(d, ctx, 'setRepeatOn', t, a.recur ? { kind: 'repeatSet', id: a.recur.toLowerCase() } : {});
            t.recur = a.recur || null;
          }
          if (a.assignee !== undefined && a.assignee !== t.assignee) {
            if (a.assignee) a.assignee = await resolveAssignee(ctx, a.assignee);
            const members = await roster(ctx);
            logActivity(d, ctx, 'assigned', t, a.assignee ? { kind: 'assignedTo', value: members.find(m => m.id === a.assignee)?.name || a.assignee } : { kind: 'unassigned' });
            t.assignee = a.assignee || null;
          }
          t.updated = now();
          result = await taskOut(ctx, t, d);
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
        await writeDoc(ctx.ws, async d => {
          const tasks = Array.isArray(d.data.tasks) ? d.data.tasks : [];
          const t = tasks.find(x => x?.id === a.id);
          if (!t || t.archived) throw toolError(`Task not found: ${a.id}`);
          if (!(await readableProjectIds(ctx, d)).has(t.project)) throw toolError(`Task not found: ${a.id}`);
          const from = t.status || 'todo';
          if (from !== a.status) {
            logActivity(d, ctx, a.status === 'done' ? 'completed' : 'moved', t, { kind: 'statusMoved', from, to: a.status });
            t.status = a.status;
            t.updated = now();
          }
          result = await taskOut(ctx, t, d);
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
        const doc = await loadDoc(ctx.ws);
        const t = await findVisibleTask(ctx, a.task, doc);
        const comment = { id: uid('c'), task: t.id, by: ctx.membership.member_id || null, at: now(), text: a.text.trim(), re: {} };
        await writeDoc(ctx.ws, async d => {
          d.data.comments = Array.isArray(d.data.comments) ? d.data.comments : [];
          d.data.comments.push(comment);
          logActivity(d, ctx, 'commentedOn', tasksOf(d).find(x => x.id === t.id) || t, {});
        });
        return { posted: true, comment: { id: comment.id, at: comment.at } };
      },
    },
    add_subtask: {
      description: 'Add a subtask to a task.',
      write: true,
      schema: { task: { t: 's', req: true }, title: { t: 's', req: true, max: 200 } },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const t = await findVisibleTask(ctx, a.task, doc);
        const sub = { id: uid(), title: a.title.trim(), done: false };
        await writeDoc(ctx.ws, async d => {
          const live = tasksOf(d).find(x => x.id === t.id);
          live.subtasks = Array.isArray(live.subtasks) ? live.subtasks : [];
          live.subtasks.push(sub);
          live.updated = now();
          logActivity(d, ctx, 'addedSubtaskTo', live, { kind: 'subtaskAdded', value: sub.title });
        });
        return { added: true, subtask: sub };
      },
    },
    toggle_subtask: {
      description: 'Check/uncheck a subtask. The subtask id (or 0-based index) comes from get_task.',
      write: true,
      schema: {
        task: { t: 's', req: true },
        subtask: { t: 's' },
        index: { t: 'n', min: 0, max: 99 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const t = await findVisibleTask(ctx, a.task, doc);
        let result = null;
        await writeDoc(ctx.ws, async d => {
          const live = tasksOf(d).find(x => x.id === t.id);
          const list = Array.isArray(live.subtasks) ? live.subtasks : [];
          const s = a.subtask ? list.find(x => x.id === a.subtask) : list[a.index];
          if (!s) throw toolError(`Subtask not found on ${t.id}`);
          s.done = !s.done;
          live.updated = now();
          logActivity(d, ctx, s.done ? 'completedSubtaskOn' : 'reopenedSubtaskOn', live, { kind: 'quoted', value: s.title });
          result = { id: s.id, title: s.title, done: s.done, total: list.length, doneCount: list.filter(x => x.done).length };
        });
        return { toggled: true, subtask: result };
      },
    },
    set_dependencies: {
      description: 'Set the blocked-by dependencies of a task (array of task ids, replaces the whole list).',
      write: true,
      schema: {
        task: { t: 's', req: true },
        deps: { t: 'arr', maxLen: 50, itemMax: 64 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const t = await findVisibleTask(ctx, a.task, doc);
        const ids = new Set(tasksOf(doc).map(x => x.id));
        for (const dep of a.deps) {
          if (!ids.has(dep)) throw toolError(`Unknown task id in deps: ${dep}`);
          if (dep === t.id) throw toolError('A task cannot depend on itself');
        }
        await writeDoc(ctx.ws, async d => {
          const live = tasksOf(d).find(x => x.id === t.id);
          live.deps = a.deps;
          live.updated = now();
          logActivity(d, ctx, 'updatedDependenciesOf', live, {});
        });
        return { updated: true, deps: a.deps };
      },
    },
    handoff_task: {
      description: 'Atomic review handoff: move a task to review, optionally reassign it, and post a summary comment — the gesture of an agent finishing work. One transaction, one activity trail.',
      write: true,
      schema: {
        id: { t: 's', req: true },
        summary: { t: 's', max: 4000 },
        assignee: { t: 's', max: 200 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const t = await findVisibleTask(ctx, a.id, doc);
        const leadId = a.assignee ? await resolveAssignee(ctx, a.assignee) : null;
        let result = null;
        await writeDoc(ctx.ws, async d => {
          const live = tasksOf(d).find(x => x.id === t.id);
          if (live.archived) throw toolError(`Task not found: ${a.id}`);
          const members = await roster(ctx);
          if (leadId && leadId !== live.assignee) {
            logActivity(d, ctx, 'assigned', live, { kind: 'assignedTo', value: members.find(m => m.id === leadId)?.name || leadId });
            live.assignee = leadId;
          }
          const from = live.status || 'todo';
          if (from !== 'review') {
            logActivity(d, ctx, from === 'done' ? 'reopened' : 'moved', live, { kind: 'statusMoved', from, to: 'review' });
            live.status = 'review';
          }
          if (a.summary && a.summary.trim()) {
            const comment = { id: uid('c'), task: live.id, by: ctx.membership.member_id || null, at: now(), text: a.summary.trim(), re: {} };
            d.data.comments = Array.isArray(d.data.comments) ? d.data.comments : [];
            d.data.comments.push(comment);
            logActivity(d, ctx, 'commentedOn', live, {});
            result = { commentId: comment.id };
          }
          live.updated = now();
        });
        return { handedOff: true, task: await taskOut(ctx, tasksOf(await loadDoc(ctx.ws)).find(x => x.id === t.id), doc), ...result };
      },
    },
    archive_task: {
      description: 'Archive a task (hidden from every view; use restore_task to bring it back).',
      write: true,
      schema: { id: { t: 's', req: true } },
      run: async (ctx, a) => {
        canWrite(ctx);
        await writeDoc(ctx.ws, async d => {
          const t = tasksOf(d).find(x => x?.id === a.id);
          if (!t) throw toolError(`Task not found: ${a.id}`);
          if (!(await readableProjectIds(ctx, d)).has(t.project)) throw toolError(`Task not found: ${a.id}`);
          if (!t.archived) {
            t.archived = true;
            t.archivedAt = now();
            logActivity(d, ctx, 'archived', t, {});
          }
        });
        return { archived: true };
      },
    },
    restore_task: {
      description: 'Restore an archived task.',
      write: true,
      schema: { id: { t: 's', req: true } },
      run: async (ctx, a) => {
        canWrite(ctx);
        await writeDoc(ctx.ws, async d => {
          const tasks = Array.isArray(d.data.tasks) ? d.data.tasks : [];
          const t = tasks.find(x => x?.id === a.id && x.archived);
          if (!t) throw toolError(`Archived task not found: ${a.id}`);
          if (!(await readableProjectIds(ctx, d)).has(t.project)) throw toolError(`Task not found: ${a.id}`);
          t.archived = false;
          t.archivedAt = null;
          logActivity(d, ctx, 'restored', t, {});
        });
        return { restored: true };
      },
    },
    list_notifications: {
      description: 'The workspace inbox: notifications (mentions, assignments, moves), newest first, names resolved.',
      schema: { unreadOnly: { t: 'b' }, limit: { t: 'n', min: 1, max: 100, def: 30 } },
      run: async (ctx, a) => {
        const doc = await loadDoc(ctx.ws);
        const members = await roster(ctx);
        const tasks = new Map(tasksOf(doc).map(t => [t.id, t]));
        const projects = new Map(projectsOf(doc).map(p => [p.id, p]));
        const rows = (Array.isArray(doc?.data?.notifs) ? doc.data.notifs : [])
          .filter(n => n && typeof n.to === 'string')
          .filter(n => !a.unreadOnly || !n.read)
          .slice(0, a.limit ?? 30)
          .map(n => ({
            id: n.id || null,
            to: n.to,
            toName: members.find(m => m.id === n.to)?.name || n.to,
            type: n.type || null,
            by: n.by || null,
            byName: n.by ? members.find(m => m.id === n.by)?.name || n.by : null,
            task: n.task || null,
            taskTitle: n.task ? tasks.get(n.task)?.title || null : null,
            project: n.project || null,
            projectName: n.project ? projects.get(n.project)?.name || null : null,
            snippet: n.snippet || '',
            at: n.at,
            read: !!n.read,
          }));
        return { total: rows.length, notifications: rows };
      },
    },
    list_activity: {
      description: 'Recent workspace activity, newest first (machine verbs + human names resolved).',
      schema: { limit: { t: 'n', min: 1, max: 100, def: 30 } },
      run: async (ctx, a) => {
        const doc = await loadDoc(ctx.ws);
        const members = await roster(ctx);
        const tasks = new Map(tasksOf(doc).map(t => [t.id, t]));
        const projects = new Map(projectsOf(doc).map(p => [p.id, p]));
        const rows = (Array.isArray(doc?.data?.activity) ? doc.data.activity : [])
          .slice(0, a.limit ?? 30)
          .map(e => ({
            verb: e.verb,
            by: e.by,
            byName: e.by ? members.find(m => m.id === e.by)?.name || e.by : null,
            task: e.task || null,
            taskTitle: e.task ? tasks.get(e.task)?.title || null : null,
            project: e.project || null,
            projectName: e.project ? projects.get(e.project)?.name || null : null,
            at: e.at,
            extra: e.extra || {},
          }));
        return { total: rows.length, activity: rows };
      },
    },
    remove_subtask: {
      description: 'Delete a subtask from a task. The id (or 0-based index) comes from get_task.',
      write: true,
      schema: {
        task: { t: 's', req: true },
        subtask: { t: 's' },
        index: { t: 'n', min: 0, max: 99 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const t = await findVisibleTask(ctx, a.task, doc);
        let result = null;
        await writeDoc(ctx.ws, async d => {
          const live = tasksOf(d).find(x => x.id === t.id);
          const list = Array.isArray(live.subtasks) ? live.subtasks : [];
          const i = a.subtask ? list.findIndex(x => x.id === a.subtask) : a.index;
          if (i < 0 || !list[i]) throw toolError(`Subtask not found on ${t.id}`);
          result = { id: list[i].id, title: list[i].title };
          live.subtasks = list.filter((_, j) => j !== i);
          live.updated = now();
        });
        return { removed: true, subtask: result };
      },
    },
    rename_subtask: {
      description: 'Rename a subtask.',
      write: true,
      schema: {
        task: { t: 's', req: true },
        subtask: { t: 's', req: true },
        title: { t: 's', req: true, max: 200 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const t = await findVisibleTask(ctx, a.task, doc);
        await writeDoc(ctx.ws, async d => {
          const live = tasksOf(d).find(x => x.id === t.id);
          const s = (Array.isArray(live.subtasks) ? live.subtasks : []).find(x => x.id === a.subtask);
          if (!s) throw toolError(`Subtask not found on ${t.id}`);
          s.title = a.title.trim();
          live.updated = now();
        });
        return { renamed: true };
      },
    },
    reorder_task: {
      description: 'Move a task within its column: top, bottom, or relative to another task (before/after).',
      write: true,
      schema: {
        id: { t: 's', req: true },
        top: { t: 'b' },
        bottom: { t: 'b' },
        before: { t: 's' },
        after: { t: 's' },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const hints = [a.top, a.bottom, a.before, a.after].filter(x => x !== undefined).length;
        if (hints !== 1) throw toolError('Provide exactly one of: top, bottom, before, after');
        let result = null;
        await writeDoc(ctx.ws, async d => {
          const live = tasksOf(d).find(x => x.id === a.id);
          if (!live) throw toolError(`Task not found: ${a.id}`);
          if (!(await readableProjectIds(ctx, d)).has(live.project)) throw toolError(`Task not found: ${a.id}`);
          const column = tasksOf(d)
            .filter(x => !x.archived && x.project === live.project && (x.status || 'todo') === (live.status || 'todo') && x.id !== live.id)
            .sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0));
          let order;
          if (a.top) order = (Number(column[0]?.order) || 0) - 1;
          else if (a.bottom) order = (Number(column[column.length - 1]?.order) || 0) + 1;
          else {
            const refId = a.before || a.after;
            const ref = tasksOf(d).find(x => x.id === refId);
            if (!ref || ref.project !== live.project || (ref.status || 'todo') !== (live.status || 'todo')) {
              throw toolError(`Reference task must be in the same project and column: ${refId}`);
            }
            const i = column.findIndex(x => x.id === refId);
            const prev = a.before ? column[i - 1] : column[i];
            const next = a.before ? column[i] : column[i + 1];
            order = ((Number(prev?.order) || Number(next?.order) || 0) + (Number(next?.order) || Number(prev?.order) || 0)) / 2;
          }
          live.order = order;
          live.updated = now();
          result = { id: live.id, order: live.order, columnSize: column.length + 1 };
        });
        return { reordered: true, task: result };
      },
    },
    delete_comment: {
      description: "Delete a comment. Only the API key owner's own comments can be deleted.",
      write: true,
      schema: { comment: { t: 's', req: true } },
      run: async (ctx, a) => {
        canWrite(ctx);
        await writeDoc(ctx.ws, async d => {
          const comments = Array.isArray(d.data.comments) ? d.data.comments : [];
          const c = comments.find(x => x?.id === a.comment);
          if (!c) throw toolError(`Comment not found: ${a.comment}`);
          if (c.by !== ctx.membership.member_id) throw toolError('Only your own comments can be deleted');
          d.data.comments = comments.filter(x => x !== c);
        });
        return { deleted: true };
      },
    },
    create_tasks: {
      description: 'Create several tasks at once in the same project — one transaction, one activity entry per task. Max 20 per call.',
      write: true,
      schema: {
        project: { t: 's', req: true },
        tasks: { t: 'objs', maxLen: 20 },
      },
      run: async (ctx, a) => {
        canWrite(ctx);
        const doc = await loadDoc(ctx.ws);
        const proj = await findVisibleProjectRef(ctx, a.project, doc);
        /* Each item carries the create_task fields minus `project`. */
        const items = (Array.isArray(a.tasks) ? a.tasks : []).map(t => {
          if (!t || typeof t !== 'object' || typeof t.title !== 'string' || !t.title.trim()) {
            throw toolError('Every item of tasks[] needs a non-empty "title"');
          }
          if (Object.keys(t).some(k => !['title', 'description', 'status', 'assignee', 'priority', 'due', 'labels', 'recur', 'estimate'].includes(k))) {
            throw toolError(`Unknown key in tasks[] item: ${Object.keys(t).filter(k => !['title', 'description', 'status', 'assignee', 'priority', 'due', 'labels', 'recur', 'estimate'].includes(k)).join(', ')}`);
          }
          if (t.status && !MCP_STATUSES.includes(t.status)) throw toolError(`tasks[] item status must be one of: ${MCP_STATUSES.join(', ')}`);
          if (t.priority && !MCP_PRIORITIES.includes(t.priority)) throw toolError(`tasks[] item priority must be one of: ${MCP_PRIORITIES.join(', ')}`);
          if (t.due && !DUE_RE.test(t.due)) throw toolError('tasks[] item due must be YYYY-MM-DD');
          if (t.recur && !MCP_RECUR.includes(t.recur)) throw toolError(`tasks[] item recur must be one of: ${MCP_RECUR.join(', ')}`);
          if (t.labels && (!Array.isArray(t.labels) || t.labels.length > 10)) throw toolError('tasks[] item labels must be an array of at most 10 strings');
          return t;
        });
        if (!items.length) throw toolError('tasks[] must not be empty');
        const assignees = new Map();
        for (const it of items) {
          if (it.assignee && !assignees.has(it.assignee)) assignees.set(it.assignee, await resolveAssignee(ctx, it.assignee));
        }
        const created = [];
        await writeDoc(ctx.ws, async d => {
          const tasks = Array.isArray(d.data.tasks) ? d.data.tasks : [];
          let n = tasks.reduce((max, x) => Math.max(max, Number(x.order) || 0), 0);
          const usedKeys = new Set(tasks.map(x => x.key).filter(Boolean));
          for (const it of items) {
            n++;
            let key = null;
            if (proj.key) {
              let i = 100;
              while (usedKeys.has(`${proj.key}-${i}`)) i++;
              key = `${proj.key}-${i}`;
              usedKeys.add(key);
            }
            const t = now();
            const task = {
              id: uid(),
              key,
              project: proj.id,
              title: it.title.trim(),
              status: it.status || 'todo',
              assignee: it.assignee ? assignees.get(it.assignee) : null,
              priority: it.priority || 'none', // UI-canonical: PR[null] would crash the client renderer
              due: it.due || null,
              start: null,
              labels: Array.isArray(it.labels) ? it.labels : [],
              subtasks: [],
              attachments: [],
              deps: [],
              desc: it.description ? (it.description.includes('<') ? it.description : `<p>${esc(it.description)}</p>`) : '',
              estimate: it.estimate || null,
              created: t,
              updated: t,
              order: n,
              fav: false,
              recur: it.recur || null,
            };
            tasks.push(task);
            logActivity(d, ctx, 'created', task, {});
            created.push(task);
          }
          d.data.tasks = tasks;
        });
        return { created: created.length, tasks: await Promise.all(created.map(t => taskOut(ctx, t, doc))) };
      },
    },
    list_comments: {
      description: 'List the comments on a task, oldest first.',
      schema: { task: { t: 's', req: true } },
      run: async (ctx, a) => {
        const doc = await loadDoc(ctx.ws);
        const t = await findVisibleTask(ctx, a.task, doc);
        const rows = await Promise.all(
          (doc?.data?.comments || [])
            .filter(c => c?.task === t.id)
            .sort((x, y) => (x.at || 0) - (y.at || 0))
            .map(c => memberName(ctx, c.by).then(authorName => ({ id: c.id, by: c.by, authorName: c.by ? authorName : null, at: c.at, text: c.text }))),
        );
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
      } else if (rule.t === 'b') {
        if (typeof v !== 'boolean') throw toolError(`Argument "${key}" must be a boolean`);
        out[key] = v;
      } else if (rule.t === 'arr') {
        if (!Array.isArray(v)) throw toolError(`Argument "${key}" must be an array of strings`);
        if (rule.maxLen && v.length > rule.maxLen) throw toolError(`Argument "${key}" accepts at most ${rule.maxLen} items`);
        if (v.some(x => typeof x !== 'string' || (rule.itemMax && x.length > rule.itemMax))) throw toolError(`Argument "${key}" items must be strings of at most ${rule.itemMax} characters`);
        out[key] = v;
      } else if (rule.t === 'objs') {
        if (!Array.isArray(v)) throw toolError(`Argument "${key}" must be an array of objects`);
        if (rule.maxLen && v.length > rule.maxLen) throw toolError(`Argument "${key}" accepts at most ${rule.maxLen} items`);
        if (v.some(x => !x || typeof x !== 'object' || Array.isArray(x))) throw toolError(`Argument "${key}" items must be objects`);
        out[key] = v;
      }
    }
    return out;
  }

  const canWrite = ctx => {
    if (ctx.scope !== 'write') throw toolError('This API key is read-only. Create a read+write key in Settings to allow mutations.');
    if ((ROLE_RANK[ctx.membership.role] || 0) < ROLE_RANK.member) throw toolError('Viewers cannot modify this workspace. Ask an administrator.');
  };

  /* Same rule as the web client (store.js canManageProject): workspace
     admin/owner, or lead of the project. */
  const requireProjectManager = (ctx, p) => {
    if ((ROLE_RANK[ctx.membership.role] || 0) >= ROLE_RANK.admin) return;
    if (p.lead && p.lead === ctx.membership.member_id) return;
    throw toolError('Only the project lead or a workspace admin can manage this project');
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
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
          serverInfo: { name: 'projects-studio', version: '1.1.1' },
        }),
      };
    }
    if (method === 'notifications/initialized') return { status: 202, body: null }; // notification: no reply body
    if (!sid || !sessions.has(sid)) return { status: 400, body: jsonRpcError(id, -32000, 'Bad Request: Server not initialized') };
    if (method === 'tools/list') return { status: 200, body: jsonRpcResult(id, { tools: toolDefs() }) };
    if (method === 'prompts/list') {
      return {
        status: 200,
        body: jsonRpcResult(id, {
          prompts: PROMPTS.map(p => ({ name: p.name, description: p.description, arguments: p.arguments || [] })),
        }),
      };
    }
    if (method === 'prompts/get') {
      const name = String(params?.name || '');
      const prompt = PROMPTS.find(p => p.name === name);
      if (!prompt) return { status: 200, body: jsonRpcError(id, -32602, `Unknown prompt: ${name}`) };
      const args = params?.arguments || {};
      let text;
      try {
        text = prompt.build(args);
      } catch (err) {
        return { status: 200, body: jsonRpcError(id, -32602, err.message) };
      }
      return { status: 200, body: jsonRpcResult(id, { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text } }] }) };
    }
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
        await audit(ctx, ip, `mcp.${name}`, `mcp:${name}`);
        logInfo(`mcp ${name} user=${ctx.user.email} ws=${ctx.ws.slug}${tool.write ? ' [write]' : ''}`);
        return { status: 200, body: jsonRpcResult(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }) };
      } catch (err) {
        if (err?.mcpToolError) {
          await audit(ctx, ip, `mcp.${name}.error`, `mcp:${name}`);
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
    const auth = await authenticate(req);
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
