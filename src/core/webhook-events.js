/* =====================================================================
   WEBHOOK EVENTS — Phase 67 (WHK-02, D-01/D-03/D-04) — pure, DOM-free
   webhook event vocabulary, doc diff and per-event whitelist envelopes.
   =====================================================================
   The one shared definition of the 8-event vocabulary, the funnel diff
   and the envelope builder, consumed by the server doc-PUT transaction
   and the reminder funnel (due.reminder). Mirrors the src/core/subtree.js
   / src/export/model.js discipline: NO IMPORTS AT ALL, no DOM access,
   no I/O — so the module bundles cleanly on both hosts and the diff is
   trivially testable.

   diffWebhookEvents(storedDoc, next) MUST run AFTER docFromClient
   returns `next` — both sides are then in canonical shape (Pitfall 1:
   a normalized-vs-raw diff fires spurious events). The Map-building
   approach copies logDocChanges (server.js) so both diffs see the same
   shapes. Fail-absent contract: the whole function is exception-proof
   and returns [] on ANY error — webhook diffing must never fail a doc
   push (same contract as logDocChanges).

   Each diff event carries a `data` snapshot captured AT DIFF TIME — the
   delivery row stores it (ctx column), so task.deleted can carry the
   last-known title and a 40 KB comment body truncates from the original
   text, not a re-read of the (possibly changed) current doc.

   D-01: EVENT_FIELDS is the code-defined per-event field whitelist —
   the ONLY fields that may enter a payload. D-03: every envelope adds
   the minimal context trio (projectName, projectId, authorName).
   D-04: timestamps are ISO 8601 UTC strings.
   ===================================================================== */

/* The fixed 8-event vocabulary (CONTEXT.md; every hook's `events` JSON
   filter draws from this list — no other event name may be claimed). */
export const WEBHOOK_EVENTS = Object.freeze([
  'task.created',
  'task.completed',
  'task.assigned',
  'task.deleted',
  'comment.added',
  'due.reminder',
  'project.completed',
  'subtask.tree-changed',
]);

/* D-01 — the auditable per-event field whitelist. The envelope builder is
   the single gate: no field outside this list ever enters a payload, no
   user-configurable fields exist, and no enriched project (description/
   members/teams) is included — only the D-03 minimal context trio. */
export const EVENT_FIELDS = Object.freeze({
  'task.created': Object.freeze(['event', 'taskId', 'title', 'status', 'projectName', 'projectId', 'authorName', 'occurredAt']),
  'task.completed': Object.freeze(['event', 'taskId', 'title', 'done', 'projectName', 'projectId', 'authorName', 'occurredAt']),
  'task.assigned': Object.freeze(['event', 'taskId', 'title', 'assignees', 'mentions', 'projectName', 'projectId', 'authorName', 'occurredAt']),
  'task.deleted': Object.freeze(['event', 'taskId', 'title', 'projectName', 'projectId', 'authorName', 'occurredAt']),
  'comment.added': Object.freeze(['event', 'commentId', 'taskId', 'taskTitle', 'body', 'authorName', 'projectName', 'projectId', 'occurredAt']),
  'due.reminder': Object.freeze(['event', 'taskId', 'title', 'due', 'offset', 'projectName', 'projectId', 'occurredAt']),
  'project.completed': Object.freeze(['event', 'projectId', 'projectName', 'authorName', 'occurredAt']),
  'subtask.tree-changed': Object.freeze(['event', 'taskId', 'taskTitle', 'projectName', 'projectId', 'authorName', 'occurredAt']),
});

/* D-01 envelope builder — the single field gate. Copies ONLY the
   whitelisted fields from ctx (anything else is dropped, so a stray or
   enriched field can never leak into a payload), stamps occurredAt as an
   ISO 8601 UTC string (D-04) when the caller did not pin one. Unknown
   events build nothing (fail-absent). */
export function buildEnvelope(event, ctx = {}) {
  try {
    const fields = EVENT_FIELDS[event];
    if (!fields) return null;
    const env = {};
    for (const f of fields) {
      if (ctx && ctx[f] !== undefined) env[f] = ctx[f];
    }
    if (!env.occurredAt) env.occurredAt = new Date().toISOString();
    return env;
  } catch {
    return null;
  }
}

/* Assignee shape variance (Pitfall 1): the stored doc may predate the
   assignee migration — normalize BOTH sides to arrays before any list
   comparison (pure local copy; the inputs are never mutated). */
const asList = a => (Array.isArray(a) ? a.filter(Boolean) : a ? [a] : []);

/* Phase 65 parent/child signals: the tree changed when a subtask was
   added, removed, or re-parented. parentId normalization: undefined →
   null so a legacy entry and a normalized root compare equal. */
function subtreeChanged(before, after) {
  const b = new Map((Array.isArray(before) ? before : []).filter(s => s?.id).map(s => [s.id, s.parentId ?? null]));
  const a = (Array.isArray(after) ? after : []).filter(s => s?.id);
  if (a.length !== b.size) return true;
  for (const s of a) {
    if (!b.has(s.id) || (b.get(s.id) ?? null) !== (s.parentId ?? null)) return true;
  }
  return false;
}

/* One event per (hook, event, subject) — the event object is the claim
   seed: { event, subjectId, data }. subjectId aliases the natural claim
   subject (taskId / commentId / projectId) so the deliveries dedup key is
   exactly-once per real-world occurrence (Pitfall 2: ONE task.assigned
   event per task, its payload carrying the full assignee list). */
export function diffWebhookEvents(storedDoc, next) {
  try {
    const events = [];
    const occurredAt = new Date().toISOString();
    /* The exact Map-building shape of logDocChanges: id-keyed snapshots of
       the stored tasks, diffed against the canonical next tasks. */
    const beforeTasks = new Map(
      (Array.isArray(storedDoc?.data?.tasks) ? storedDoc.data.tasks : [])
        .filter(t => t?.id)
        .map(t => {
          const copy = { ...t };
          copy.assignees = asList(copy.assignees !== undefined ? copy.assignees : copy.assignee);
          return [t.id, copy];
        }),
    );
    const afterTasks = (Array.isArray(next?.data?.tasks) ? next.data.tasks : []).filter(t => t?.id);
    const afterIds = new Set(afterTasks.map(t => t.id));
    const taskById = new Map(afterTasks.map(t => [t.id, t]));
    const assigneesOf = t => asList(t.assignees !== undefined ? t.assignees : t.assignee);
    for (const t of afterTasks) {
      const prev = beforeTasks.get(t.id);
      if (!prev) {
        events.push({ event: 'task.created', subjectId: t.id, taskId: t.id, occurredAt, data: { taskId: t.id, title: t.title || '', status: t.status || '' } });
        /* WHK-02 adjacency edge: created AND assigned in one save → two
           distinct events, each delivered on its own claim. */
        const assignees = assigneesOf(t);
        if (assignees.length) {
          events.push({ event: 'task.assigned', subjectId: t.id, taskId: t.id, occurredAt, data: { taskId: t.id, title: t.title || '', assignees } });
        }
        continue;
      }
      const title = t.title || prev.title || '';
      if (prev.status !== 'done' && t.status === 'done') {
        events.push({ event: 'task.completed', subjectId: t.id, taskId: t.id, occurredAt, data: { taskId: t.id, title, done: true } });
      }
      /* Pitfall 2: ONE event per task — data.assignees is the full list;
         the formatter renders the mention(s). */
      const prevA = asList(prev.assignees);
      const nextA = assigneesOf(t);
      const added = nextA.filter(id => !prevA.includes(id));
      if (added.length) {
        events.push({ event: 'task.assigned', subjectId: t.id, taskId: t.id, occurredAt, data: { taskId: t.id, title, assignees: nextA } });
      }
      if (subtreeChanged(prev.subtasks, t.subtasks)) {
        events.push({ event: 'subtask.tree-changed', subjectId: t.id, taskId: t.id, occurredAt, data: { taskId: t.id, taskTitle: title } });
      }
    }
    for (const [id, prev] of beforeTasks) {
      if (!afterIds.has(id)) {
        events.push({ event: 'task.deleted', subjectId: id, taskId: id, occurredAt, data: { taskId: id, title: prev.title || '' } });
      }
    }
    /* Comments: one event per NEW comment (subjectId = comment id — two
       comments on one task in one save are two events, each with its own
       body — the D-02 truncation target). */
    const beforeComments = new Set((Array.isArray(storedDoc?.data?.comments) ? storedDoc.data.comments : []).map(c => c?.id).filter(Boolean));
    for (const c of Array.isArray(next?.data?.comments) ? next.data.comments : []) {
      if (!c?.id || beforeComments.has(c.id) || !c.task) continue;
      events.push({ event: 'comment.added', subjectId: c.id, occurredAt, data: { commentId: c.id, taskId: c.task, taskTitle: taskById.get(c.task)?.title || '', body: c.body || '' } });
    }
    /* project.completed: the project-level completion flag (status
       'complete') flips — a fresh completed project emits nothing (no
       prior state to flip FROM). */
    const beforeProjects = new Map((Array.isArray(storedDoc?.data?.projects) ? storedDoc.data.projects : []).filter(p => p?.id).map(p => [p.id, p]));
    for (const p of Array.isArray(next?.data?.projects) ? next.data.projects : []) {
      if (!p?.id) continue;
      const prev = beforeProjects.get(p.id);
      if (prev && prev.status !== 'complete' && p.status === 'complete') {
        events.push({ event: 'project.completed', subjectId: p.id, occurredAt, data: { projectId: p.id, projectName: p.name || '' } });
      }
    }
    return events;
  } catch {
    /* fail-absent — never fail a doc push over webhook diffing */
    return [];
  }
}
