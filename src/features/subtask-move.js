/* ---------- subtask one-level restructure actions (65-04, lazy chunk) ----------
   Split from actions/subtasks.js by the 500 kB entry-chunk gate (61-02/65-03
   remedy precedent): the restructure handlers are context-menu-driven and the
   menu module pre-warms this chunk at boot, so the handlers are assigned long
   before any click can reach them. Same discipline as features/subtask-detail:
   the shared recursive renderer stays synchronous; the interactive extras ride
   a dynamic import.

   One-level promote / demote / re-parent (D-09). Each action computes the
   proposed parentId, runs subtree.validateMove as a CLIENT pre-check (UX only
   — D-05: the server funnel re-validates every doc PUT and is the sole
   authority), then mutates ONLY the moved node's parentId/position (D-03's
   one-node diff is the point) and lets save() ride the normal funnel. A
   rejected move mutates nothing and shows the localized err.<code> toast. */
import { t as tMsg } from '../core/i18n.js';
import { S, logAct, task } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { render } from '../shell/render.js';
import { A } from '../actions/actions.js';
import { nextPosition, validateMove } from '../core/subtree.js';
import { subOf } from '../actions/subtasks.js';

/* Shared restructure body: pre-check, one-node mutate, activity log. */
function restructureSub(t, s, newParentId, verb) {
  if (!t || !s || s.parentId === newParentId) return;
  const chk = validateMove(t.subtasks, s.id, newParentId);
  if (!chk.ok) {
    toast(tMsg(`err.${chk.code}`), { kind: 'err' });
    return;
  }
  mutate(() => {
    s.parentId = newParentId;
    s.position = nextPosition(t.subtasks, newParentId);
    t.updated = Date.now();
    logAct(verb, t, { kind: 'subtaskMoved', value: s.title });
  });
}

/* A.moveSubUp — promote one level: a child of a subtask becomes a sibling
   of its parent. Already-root subtasks cannot promote (menu hides it). */
A.moveSubUp = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  if (!t || !s || s.parentId == null) return;
  const parent = subOf(t, s.parentId);
  restructureSub(t, s, parent ? parent.parentId : null, 'promotedASubtaskOf');
};

/* A.moveSubDown — demote one level under the PREVIOUS sibling (deterministic,
   D-09 — never a free target pick). Roots demote under the first root
   sibling; a first sibling with no previous has no demote (menu hides it). */
A.moveSubDown = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  if (!t || !s) return;
  const sibs = orderedSiblingsOf(t, s);
  const i = sibs.findIndex(x => x.id === s.id);
  if (i <= 0) return;
  restructureSub(t, s, sibs[i - 1].id, 'demotedASubtaskOf');
};

/* A.reparentSub — open the one-level re-parent picker (targets computed in
   the popover renderer; the picked target arrives on the item's data-v). */
A.reparentSub = () => {
  S.ui.pop = { ...S.ui.pop, type: 'subParent', q: '' };
  render();
};

/* A.reparentSubTo — the picker item: move under the chosen sibling (one
   level — validateMove rejects anything that would cycle or overflow). */
A.reparentSubTo = el => {
  const p = S.ui.pop;
  const t = task(p?.id);
  const s = subOf(t, p?.sid);
  const v = el.dataset.v;
  S.ui.pop = null;
  if (!t || !s || !v) return;
  restructureSub(t, s, v, 'movedASubtaskOf');
};

function orderedSiblingsOf(t, s) {
  const out = (t.subtasks || []).filter(x => x && (x.parentId ?? null) === (s.parentId ?? null));
  out.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return out;
}
