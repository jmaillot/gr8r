/* =====================================================================
   TEMPLATES — Phase 66 (66-01) — pure, DOM-free template sanitizers.
   =====================================================================
   The one shared definition of the doc-embedded template record shape,
   consumed by the server funnel (normalizeTemplatesData sink on both the
   mergeClientDoc write path and the normalizeDoc read path) and the MCP
   writeDoc mirror. Mirrors the src/core/subtree.js discipline: no DOM
   access, plain comparators only (never localeCompare) so ordering is
   byte-identical across hosts; uid factories are injected, never
   imported. The ONLY import is the sibling zero-import subtree.js —
   the embedded-tree gate and heal reuse the exact definitions the
   Phase 65 funnel block and mcp.js writeDoc run (one validator, never
   a second one).

   Stored shape (CONTEXT.md D-02): every record of doc.templates[]
   carries exactly
     { id, kind:'task'|'project', name, icon, color, body, position,
       createdBy, createdAt, updatedAt }
   The body is KIND-SPECIFIC (D-04): a task body whitelists
   title/notes/priority/subtasks; a project body whitelists
   name/description/status/teams. Unknown fields are DROPPED BY
   CONSTRUCTION, never rejected (D-04/TMPL-01) — the sanitizer's silence
   IS the decision (D-14: no assignees/lead/members/milestones anywhere
   in template bodies).

   Subtask entries inside a task body are mutated IN PLACE — never mapped
   to fresh objects (the Phase 65 whitelist trap: a pass that rebuilds
   subtask objects silently strips { id, parentId, position };
   subtree.js documents it in-source). Template-level `position` follows
   the Phase 65 D-03 ruling: explicit safe integer, ties/missing
   normalized by the funnel, one-node moves (array storage order is
   irrelevant).
   ===================================================================== */
import { normalizeTaskSubtasks, validateSubtree } from './subtree.js';

/* The embedded-subtask whitelist (D-04). Entries are mutated in place;
   unknown keys are deleted, canonical shape keys survive. dueOffsetDays
   (D-05/D-07) is kept ONLY when numeric — a missing/absent offset means
   "no due date" at instantiation (D-08), never a default. Returns true
   when the entry is worth keeping (object check), so callers can filter. */
const TEMPLATE_SUB_FIELDS = ['id', 'parentId', 'position', 'title', 'done', 'note'];

export function sanitizeTemplateSubtask(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  for (const k of Object.keys(s)) {
    if (k !== 'dueOffsetDays' && !TEMPLATE_SUB_FIELDS.includes(k)) delete s[k];
  }
  if (typeof s.id !== 'string' || !s.id) delete s.id;
  if (typeof s.parentId !== 'string' && s.parentId !== null) s.parentId = null;
  if (typeof s.title !== 'string') s.title = '';
  if (s.done !== true) s.done = false;
  if (typeof s.note !== 'string') delete s.note;
  if (!Number.isSafeInteger(s.position)) delete s.position; /* heal pass assigns the array index */
  if (!Number.isFinite(s.dueOffsetDays)) delete s.dueOffsetDays;
  return true;
}

/* Task-kind body whitelist (D-04): title/notes/priority/subtasks only. */
export function sanitizeTaskBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {};
  if (typeof b.title === 'string') out.title = b.title;
  if (typeof b.notes === 'string') out.notes = b.notes;
  if (typeof b.priority === 'string' && b.priority) out.priority = b.priority;
  if (Array.isArray(b.subtasks)) {
    /* entries keep their object identity — IN PLACE whitelist, never a map */
    out.subtasks = b.subtasks.filter(s => sanitizeTemplateSubtask(s));
  }
  return out;
}

/* Project-kind body whitelist (D-14): name/description/status/teams + the
   66-02 embedded task tree (ordered entries carrying full task-template
   bodies with dueOffsetDays/startOffsetDays). No assignees, no lead/members/
   milestones, no custom fields — the sanitizer's silence IS the research
   resolution. */
export function sanitizeProjectTaskEntry(e) {
  /* the wrapper entry is rebuilt fresh (D-04 whitelist-drop), but its
     subtask entries are whitelisted IN PLACE via sanitizeTaskBody — never
     mapped to fresh objects (the Phase 65 identity trap). */
  const out = sanitizeTaskBody(e);
  const src = e && typeof e === 'object' ? e : {};
  if (Number.isFinite(src.dueOffsetDays)) out.dueOffsetDays = src.dueOffsetDays;
  if (Number.isFinite(src.startOffsetDays)) out.startOffsetDays = src.startOffsetDays;
  return out;
}

export function sanitizeProjectBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {};
  if (typeof b.name === 'string') out.name = b.name;
  if (typeof b.description === 'string') out.description = b.description;
  if (typeof b.status === 'string' && b.status) out.status = b.status;
  if (Array.isArray(b.teams)) out.teams = b.teams.filter(t => typeof t === 'string' && t);
  if (Array.isArray(b.tasks)) out.tasks = b.tasks.filter(e => e && typeof e === 'object' && !Array.isArray(e)).map(sanitizeProjectTaskEntry);
  return out;
}

/* The D-02 record whitelist — builds a FRESH object with exactly the
   canonical key set (unknown record fields drop by construction, D-04).
   `index` is the array position of the record — the fallback for a
   missing/junk `position` (D-03 tie rule) and the seed for a generated
   id when the factory is absent. */
export function sanitizeTemplate(record, uidFactory, index = 0) {
  const src = record && typeof record === 'object' ? record : {};
  const kind = src.kind === 'project' ? 'project' : 'task';
  const out = {};
  out.id =
    typeof src.id === 'string' && src.id
      ? src.id
      : typeof uidFactory === 'function'
        ? uidFactory()
        : 'tpl' + (index + 1);
  out.kind = kind;
  out.name = typeof src.name === 'string' ? src.name : '';
  out.icon = typeof src.icon === 'string' ? src.icon : '';
  out.color = typeof src.color === 'string' ? src.color : '';
  out.body = kind === 'project' ? sanitizeProjectBody(src.body) : sanitizeTaskBody(src.body);
  out.fav = src.fav === true;
  out.position = Number.isSafeInteger(src.position) ? src.position : index;
  out.createdBy = typeof src.createdBy === 'string' && src.createdBy ? src.createdBy : null;
  out.createdAt = typeof src.createdAt === 'number' && Number.isFinite(src.createdAt) ? src.createdAt : null;
  out.updatedAt = typeof src.updatedAt === 'number' && Number.isFinite(src.updatedAt) ? src.updatedAt : null;
  return out;
}

/* =====================================================================
   [Phase 66, 66-01 task 2] The templates funnel sink — the mirror of
   server.js's normalizeSubtasksData, run at every doc write/read site
   (mergeClientDoc, normalizeDoc, and the MCP writeDoc mirror — one
   validator, several call sites, T-65-11 precedent). Per record:
     1. sanitizeTemplate rebuilds the D-02 whitelisted shape (D-04)
        plus the persistent `fav` favourite flag;
     2. (gate on) every embedded subtask tree is wholesale-validated
        BEFORE the heal — a raw self-parenting or cyclic template body
        must be REJECTED, never silently normalized (the 65-02 lesson:
        the heal re-roots self-parents, so pre-heal validation is the
        only gate that can reject them);
     3. the embedded subtask arrays are healed IN PLACE via the shared
        normalizeTaskSubtasks (junk healed, never stripped);
     4. template-level positions are renumbered to distinct safe
        integers, rank-preserving (D-03: explicit positions keep their
        relative order, ties break by array storage order; idempotent
        on repeat PUTs).
   A non-array or absent templates key normalizes to [], matching the
   savedViews/recentSearches guards in normalizeDoc.
   opts.gate=false (the normalizeDoc read path) skips step 2 — a stored
   doc that already slipped past the write gate is healed, never turned
   into a read failure (the Phase 65 read path has the same asymmetry).
   ===================================================================== */
export function normalizeTemplatesData(data, uidFactory, opts = {}) {
  if (!data || typeof data !== 'object') return;
  const gate = opts.gate !== false;
  const list = Array.isArray(data.templates) ? data.templates : [];
  /* subSig65 mirror (v2.4 audit tech-debt fix): records whose sanitized
     body is byte-identical to the stored one skip the wholesale
     validateSubtree walk — a template the client did not touch cannot
     introduce a NEW poisoned tree (it is already stored), so re-walking
     it on every doc-PUT only burns cycles on large catalogues. The heal
     below still runs unconditionally, exactly like the task-tree path
     (validate skipped for unchanged, normalizeSubtasksData always). */
  const storedById = new Map(
    (Array.isArray(opts.storedTemplates) ? opts.storedTemplates : [])
      .filter(r => r && typeof r === 'object' && !Array.isArray(r) && typeof r.id === 'string' && r.id)
      .map(r => [r.id, r]),
  );
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const rec = list[i];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    const t = sanitizeTemplate(rec, uidFactory, i);
    /* every embedded subtask array that exists — task bodies carry
       `subtasks`; a project-kind body's task tree lands in 66-02's
       builder, but the gate runs on whatever arrays exist */
    const trees = [];
    if (Array.isArray(t.body.subtasks)) trees.push(t.body.subtasks);
    if (Array.isArray(t.body.tasks)) {
      for (const bt of t.body.tasks) {
        if (bt && typeof bt === 'object' && Array.isArray(bt.subtasks)) trees.push(bt.subtasks);
      }
    }
    if (gate) {
      /* unchanged-body skip: the sanitized stored record is compared
         canonical-form to canonical-form — a raw client resend that only
         reorders JSON keys still matches (both sides run the same
         sanitizer), while any body delta (new tree, new subtask, changed
         field) falls through to full validation. */
      const prev = storedById.get(t.id);
      const unchanged =
        !!prev &&
        JSON.stringify(sanitizeTemplate(prev, null, i)?.body ?? null) === JSON.stringify(t.body);
      if (!unchanged) {
        for (const tree of trees) {
          const verdict = validateSubtree(tree);
          if (!verdict.ok) {
            /* the message carries ONLY the stable machine code — the client
               translates subtaskCycle/subtaskDepth (ERR-01; both keys live in
               the EN+FR catalogues) and the i18n scan gate keeps English prose
               out of src/. mcp.js composes the human wording at its call site. */
            const err = new Error(verdict.code);
            err.status = 400;
            err.code = verdict.code;
            throw err;
          }
        }
      }
    }
    for (const tree of trees) normalizeTaskSubtasks({ subtasks: tree }, uidFactory);
    out.push(t);
  }
  /* D-03 position normalization: rank key = (position, array storage
     order) — explicit positions keep their relative order, ties break
     by storage order, everything renumbers to 0..n-1. */
  const ranked = out
    .map((t, i) => ({ t, i, key: Number.isSafeInteger(t.position) ? t.position : Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.key - b.key || a.i - b.i);
  ranked.forEach((r, rank) => {
    r.t.position = rank;
  });
  data.templates = ranked.map(r => r.t);
}

/* =====================================================================
   [Phase 66, 66-02 task 1] instantiateTemplate — the pure instantiation
   builder. Zero new imports (the subtree.js discipline): the uid factory
   and the instantiation day are INJECTED parameters, so tests pin a fixed
   day and a deterministic id sequence. The action layer performs the D()
   pushes (below, landInstantiation) — this function is push-free: it only
   RETURNS funnel-ready rows.

   Semantics (66-CONTEXT.md):
     - D-16: every id is regenerated through uidFactory(prefix) — no id
       sharing between template copies and live items, no cross-
       instantiation collisions;
     - D-05/D-06: every due = instantiation day + dueOffsetDays, plain
       calendar days, no clamping, no business-day logic;
     - D-07: subtask offsets are ABSOLUTE — each anchors to the same
       captured day, never chained off a parent's computed due;
     - D-08: a missing/non-numeric offset produces NO due field (never a
       default); negative/zero offsets pass straight through;
     - Pitfall 4: subtask parentId references are remapped through the
       per-task old-id→new-id Map — without this the funnel's lazy heal
       would re-root every reference and silently flatten the tree;
     - ordering: tasks land in body order with position values from the
       template (funnel-normalized by the 66-01 sink), sibling order
       preserved via the carried position.

   The returned rows use the createProject/createTask field vocabulary
   (actions.js:1699–1741) so the funnel's existing normalizeProjects /
   subtask gates accept them unchanged. The caller assigns the live-doc
   fields that need D() access (lead/members, the key via keyFn, order
   renumbering) — keyFn mirrors makeKey without importing it.
   ===================================================================== */

/* Import-free day math mirroring src/core/utils.js's iso/addD contract
   (templates.js must not import the utils chain — it drags i18n/theme into
   the server funnel). `today` is a Date or a 'YYYY-MM-DD' string; string
   parsing is component-wise so timezone offsets can never shift the day. */
const pad2 = n => String(n).padStart(2, '0');
function capturedDay(today) {
  let y, m, d;
  if (today instanceof Date) {
    y = today.getFullYear();
    m = today.getMonth();
    d = today.getDate();
  } else if (typeof today === 'string') {
    const parts = today.split('-').map(Number);
    y = parts[0];
    m = parts[1] - 1;
    d = parts[2];
  } else return null;
  const x = new Date(y, m, d);
  return isNaN(x.getTime()) ? null : x;
}
function offsetIso(today, off) {
  const x = capturedDay(today);
  if (!x) return undefined;
  x.setDate(x.getDate() + off);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

/* Regenerate one template subtask tree: fresh uid('s') ids, parentId
   remapped through the old→new map built during the same pass, position
   carried, due from the absolute offset (D-07/D-08). */
function buildSubtaskRows(list, today, uidFactory) {
  const src = Array.isArray(list) ? list : [];
  const pairs = [];
  const map = new Map();
  for (const s of src) {
    if (!s || typeof s !== 'object') continue;
    const row = {
      id: uidFactory('s'),
      parentId: null,
      position: Number.isSafeInteger(s.position) ? s.position : 0,
      title: typeof s.title === 'string' ? s.title : '',
      done: s.done === true,
    };
    if (typeof s.note === 'string') row.note = s.note;
    if (Number.isFinite(s.dueOffsetDays)) row.due = offsetIso(today, s.dueOffsetDays);
    if (typeof s.id === 'string' && s.id) map.set(s.id, row.id);
    pairs.push([s, row]);
  }
  for (const [s, row] of pairs) {
    /* only a reference INSIDE this same tree remaps; a dangling/cross-task
       template id lands null — exactly what the funnel heal would do */
    const np = typeof s.parentId === 'string' ? map.get(s.parentId) : null;
    if (np) row.parentId = np;
  }
  return pairs.map(p => p[1]);
}

/* One task row per createTask's field vocabulary. `projectId` is null for
   task-kind templates (the caller assigns the ref); `order` seeds the
   doc-level ordering — the action renumbers against the live task list. */
function buildTaskRow(entry, projectId, today, uidFactory, order) {
  const e = entry && typeof entry === 'object' ? entry : {};
  const row = {
    id: uidFactory('t'),
    project: projectId,
    title: typeof e.title === 'string' ? e.title : '',
    status: 'todo',
    /* the createTask field vocabulary the client renders unguarded — the
       drawer/labels/deps/attachments surfaces read .length directly, and a
       fresh instantiation must render without a reload (66-03 e2e finding).
       The funnel refills these on the next server sync regardless. */
    assignees: [],
    priority: 'none',
    due: null,
    start: null,
    labels: [],
    attachments: [],
    deps: [],
    desc: '',
    estimate: null,
    created: Date.now(),
    updated: Date.now(),
    creator: null,
    fav: false,
    order,
    subtasks: buildSubtaskRows(e.subtasks, today, uidFactory),
  };
  if (typeof e.notes === 'string') row.notes = e.notes;
  if (typeof e.priority === 'string' && e.priority) row.priority = e.priority;
  if (Number.isFinite(e.dueOffsetDays)) row.due = offsetIso(today, e.dueOffsetDays);
  if (Number.isFinite(e.startOffsetDays)) row.start = offsetIso(today, e.startOffsetDays);
  return row;
}

export function instantiateTemplate(tmpl, uidFactory, today, keyFn) {
  const t = tmpl && typeof tmpl === 'object' ? tmpl : {};
  const body = t.body && typeof t.body === 'object' ? t.body : {};
  if (t.kind !== 'project')
    return { project: null, tasks: [buildTaskRow(body, null, today, uidFactory, 1)] };
  const p = {
    id: uidFactory('p'),
    name: typeof body.name === 'string' ? body.name : '',
    icon: typeof t.icon === 'string' ? t.icon : '',
    color: typeof t.color === 'string' ? t.color : '',
    status: typeof body.status === 'string' && body.status ? body.status : 'planning',
    teams: Array.isArray(body.teams) ? body.teams.filter(x => typeof x === 'string' && x) : [],
    desc: typeof body.description === 'string' ? body.description : '',
    milestones: [],
    last: 0,
    fav: false,
  };
  /* the key needs D()-aware uniqueness (makeKey) — injected, never imported */
  if (typeof keyFn === 'function') p.key = keyFn(p.name);
  const entries = (Array.isArray(body.tasks) ? body.tasks : []).filter(e => e && typeof e === 'object' && !Array.isArray(e));
  return { project: p, tasks: entries.map((e, i) => buildTaskRow(e, p.id, today, uidFactory, i + 1)) };
}

/* =====================================================================
   [Phase 66, 66-02 task 2] landInstantiation — the push-free landing
   step the action calls inside ONE mutate. Pure doc-shaping: takes the
   doc data object, the builder output, and injected identity helpers
   (me / actId / nextKey / now) — no store, no DOM, so the node suite
   pins the exact rows/orders/activity rows the single doc-PUT carries
   (D-15: everything lands synchronously; the action then settles exactly
   one pushNow). Key/seq semantics mirror nextKey: p.seq seeds at 200 and
   the first task key is <key>-201.
   ===================================================================== */
export function landInstantiation(data, kind, built, opts = {}) {
  if (!data || typeof data !== 'object' || !built) return null;
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const me = typeof opts.me === 'string' && opts.me ? opts.me : null;
  const actId = typeof opts.actId === 'function' ? opts.actId : () => 'a' + now.toString(36);
  if (!Array.isArray(data.tasks)) data.tasks = [];
  if (!Array.isArray(data.projects)) data.projects = [];
  if (!Array.isArray(data.projOrder)) data.projOrder = [];
  if (!Array.isArray(data.activity)) data.activity = [];
  const maxOrder = data.tasks.reduce((m, x) => Math.max(m, x?.order || 0), 0);
  if (kind === 'project' && built.project) {
    const p = built.project;
    /* the caller-neutral live fields the pure builder cannot know (the
       createProject D-51-17 client default: creator is the lead) */
    p.lead = me;
    p.members = me ? [me] : [];
    p.seq = 200;
    let n = 0;
    for (const tk of built.tasks || []) {
      p.seq++;
      tk.key = p.key ? p.key + '-' + p.seq : tk.id;
      tk.order = maxOrder + ++n;
      data.tasks.push(tk);
    }
    data.projects.push(p);
    data.projOrder.unshift(p.id);
    data.activity.unshift({ id: actId(), by: me, verb: 'createdProject', task: null, project: p.id, at: now, extra: {} });
    return p;
  }
  const tk = built.tasks && built.tasks[0];
  if (!tk) return null;
  tk.project = typeof opts.project === 'string' && opts.project ? opts.project : null;
  if (typeof opts.nextKey === 'function') tk.key = opts.nextKey();
  else if (!tk.key) tk.key = tk.id;
  tk.order = maxOrder + 1;
  data.tasks.push(tk);
  data.activity.unshift({ id: actId(), by: me, verb: 'created', task: tk.id, project: tk.project, at: now, extra: {} });
  return tk;
}

/* =====================================================================
   [Phase 66, 66-02 task 2] templateFromItem — the saveAsTemplate draft
   builder: the INVERSE of instantiateTemplate, anchored to the item's own
   due day (offset = item due − today). Extracts ONLY the D-14 whitelist
   fields (no assignees/lead/members/milestones — the sanitizer would drop
   them anyway, T-66-05); subtask trees carry their shape with dueOffsetDays
   derived from live due dates; live start dates map to startOffsetDays on
   task-tree entries. Live `desc` is rich text — carried as the body
   description verbatim (the editor rewrites it).
   For project kind, pass the live task rows via extra.tasks (the action
   gathers them — this function stays store-free).
   ===================================================================== */
function dayDiff(today, isoDay) {
  const a = capturedDay(today);
  if (!a || typeof isoDay !== 'string') return undefined;
  const parts = isoDay.split('-').map(Number);
  const b = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(b.getTime())) return undefined;
  return Math.round((b - a) / 864e5);
}
function subDrafts(list, today) {
  return (Array.isArray(list) ? list : [])
    .filter(s => s && typeof s === 'object')
    .map(s => {
      const d = { id: s.id, parentId: s.parentId === null ? null : s.parentId, position: Number.isSafeInteger(s.position) ? s.position : 0, title: typeof s.title === 'string' ? s.title : '', done: false };
      if (typeof s.note === 'string') d.note = s.note;
      const off = dayDiff(today, s.due);
      if (off !== undefined) d.dueOffsetDays = off;
      return d;
    });
}
export function templateFromItem(kind, item, today, extra = {}) {
  const it = item && typeof item === 'object' ? item : {};
  if (kind === 'project') {
    const tasks = (Array.isArray(extra.tasks) ? extra.tasks : [])
      .filter(t => t && typeof t === 'object')
      .map(t => {
        const e = {
          title: typeof t.title === 'string' ? t.title : '',
          subtasks: subDrafts(t.subtasks, today),
        };
        if (typeof t.notes === 'string') e.notes = t.notes;
        if (typeof t.priority === 'string' && t.priority) e.priority = t.priority;
        const off = dayDiff(today, t.due);
        if (off !== undefined) e.dueOffsetDays = off;
        const soff = dayDiff(today, t.start);
        if (soff !== undefined) e.startOffsetDays = soff;
        return e;
      });
    const body = {
      name: typeof it.name === 'string' ? it.name : '',
      description: typeof it.desc === 'string' ? it.desc : '',
      status: typeof it.status === 'string' && it.status ? it.status : 'planning',
      teams: Array.isArray(it.teams) ? it.teams.filter(x => typeof x === 'string' && x) : [],
      tasks,
    };
    return { id: null, kind: 'project', name: body.name, icon: '', color: '', body, position: null, createdBy: null, createdAt: null, updatedAt: null };
  }
  const body = {};
  if (typeof it.title === 'string') body.title = it.title;
  if (typeof it.notes === 'string') body.notes = it.notes;
  if (typeof it.priority === 'string' && it.priority) body.priority = it.priority;
  body.subtasks = subDrafts(it.subtasks, today);
  return { id: null, kind: 'task', name: body.title || '', icon: '', color: '', body, position: null, createdBy: null, createdAt: null, updatedAt: null };
}
