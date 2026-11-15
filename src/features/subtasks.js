/* ---------- the shared subtask-tree surface (65-03) ---------- */
/* Home of the tree surfaces' shared contract: the ONE recursive renderer for
   the subtask tree — the drawer checklist, the list/table subrows and the
   board card popover (D-11) all render through it — now lives in the
   pre-warmed lazy chunk (features/subtask-popovers.js) and is reached via the
   registry below. Ordering is subtree.orderedSiblings alone — no per-surface
   ordering logic (D-03). Collapse state is the session-only S.ui.subOpenNodes
   map (D-10), keyed by subtask id, never persisted. The subtask DETAIL view
   lives in subtask-detail.js (65-03 chunk-gate remedy, 61-02 precedent).

   65-04 chunk-gate remedy (61-02/65-03 precedent): the renderer's BYTES moved
   to the lazy chunk; consumers call treeChecklist.fn(...) — populated at boot
   (popovers.js pre-warms the chunk) before any surface can render a tree. */

export const treeChecklist = { fn: null };
