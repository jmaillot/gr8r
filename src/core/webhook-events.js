/* =====================================================================
   WEBHOOK EVENTS — Phase 67 (WHK-02, 67-01) — pure, DOM-free webhook
   event vocabulary and doc diff.
   =====================================================================
   The one shared definition of the 8-event vocabulary and the funnel
   diff, consumed by the server doc-PUT transaction and (67-02) the
   reminder funnel. Mirrors the src/core/subtree.js / src/export/model.js
   discipline: NO IMPORTS AT ALL, no DOM access, no I/O — so the module
   bundles cleanly on both hosts and the diff is trivially testable.

   diffWebhookEvents(storedDoc, next) MUST run AFTER docFromClient
   returns `next` — both sides are then in canonical shape (Pitfall 1:
   a normalized-vs-raw diff fires spurious events). The Map-building
   approach copies logDocChanges (server.js) so both diffs see the same
   shapes. Fail-absent contract: the whole function is exception-proof
   and returns [] on ANY error — webhook diffing must never fail a doc
   push (same contract as logDocChanges).

   Tracer scope (67-01): ONLY task.created (a task id present in
   next.data.tasks, absent from storedDoc.data.tasks). The remaining 7
   events expand in 67-02 without architectural change — assignee
   normalization (task.assigned scalar-vs-array, D-13/D-14 oid resolution)
   lands there too.
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

/* One event per (hook, event, subject) — the event object is the claim
   seed: { event, subjectId, occurredAt }. taskId aliases subjectId for
   task-shaped events (67-02). Timestamps are ISO 8601 UTC strings (D-04). */
export function diffWebhookEvents(storedDoc, next, { memberIds } = {}) {
  void memberIds; // consumed by 67-02 (task.assigned assignee normalization)
  try {
    const events = [];
    const occurredAt = new Date().toISOString();
    /* The exact Map-building shape of logDocChanges: id-keyed snapshots of
       the stored tasks, diffed against the canonical next tasks. */
    const beforeTasks = new Map(
      (Array.isArray(storedDoc?.data?.tasks) ? storedDoc.data.tasks : [])
        .filter(t => t?.id)
        .map(t => [t.id, { ...t }]),
    );
    const afterTasks = (Array.isArray(next?.data?.tasks) ? next.data.tasks : []).filter(t => t?.id);
    for (const t of afterTasks) {
      if (!beforeTasks.has(t.id)) {
        events.push({ event: 'task.created', subjectId: t.id, taskId: t.id, occurredAt });
      }
    }
    return events;
  } catch {
    /* fail-absent — never fail a doc push over webhook diffing */
    return [];
  }
}
