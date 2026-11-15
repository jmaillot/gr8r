/* =====================================================================
   TEMPLATES — Phase 66 (66-01) — pure, DOM-free template sanitizers.
   =====================================================================
   The one shared definition of the doc-embedded template record shape,
   consumed by the server funnel (normalizeTemplatesData sink on both the
   mergeClientDoc write path and the normalizeDoc read path) and the MCP
   writeDoc mirror. Mirrors the src/core/subtree.js discipline: no DOM
   access, plain comparators only (never localeCompare) so ordering is
   byte-identical across hosts; uid factories are injected, never
   imported.

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

/* Project-kind body whitelist (D-14): name/description/status/teams only.
   No assignees, no lead/members/milestones, no custom fields — the
   sanitizer's silence IS the research resolution. */
export function sanitizeProjectBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {};
  if (typeof b.name === 'string') out.name = b.name;
  if (typeof b.description === 'string') out.description = b.description;
  if (typeof b.status === 'string' && b.status) out.status = b.status;
  if (Array.isArray(b.teams)) out.teams = b.teams.filter(t => typeof t === 'string' && t);
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
  out.position = Number.isSafeInteger(src.position) ? src.position : index;
  out.createdBy = typeof src.createdBy === 'string' && src.createdBy ? src.createdBy : null;
  out.createdAt = typeof src.createdAt === 'number' && Number.isFinite(src.createdAt) ? src.createdAt : null;
  out.updatedAt = typeof src.updatedAt === 'number' && Number.isFinite(src.updatedAt) ? src.updatedAt : null;
  return out;
}

/* =====================================================================
   [Phase 66, 66-01] The templates funnel sink — the mirror of
   server.js's normalizeSubtasksData, run at every doc write/read site
   (mergeClientDoc, normalizeDoc, and later the MCP writeDoc mirror —
   one validator, several call sites, T-65-11 precedent). Rebuilds
   data.templates per-record through sanitizeTemplate: unknown fields
   drop by construction (D-04), missing positions take the array-index
   fallback (D-03). A non-array or absent templates key normalizes to
   [], matching the savedViews/recentSearches guards in normalizeDoc.
   (The embedded-tree gate, in-place subtask heal and rank-preserving
   position renumber land in 66-01 task 2 — the gate must run beside
   the Phase 65 validateSubtree block, not before it exists.)
   ===================================================================== */
export function normalizeTemplatesData(data, uidFactory) {
  if (!data || typeof data !== 'object') return;
  const list = Array.isArray(data.templates) ? data.templates : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const rec = list[i];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    out.push(sanitizeTemplate(rec, uidFactory, i));
  }
  data.templates = out;
}
