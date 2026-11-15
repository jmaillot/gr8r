/* =====================================================================
   ACTIONS · TEMPLATES: save, instantiate, save-as-template (Phase 66,
   66-02). Split from actions.js by the 500 kB entry-chunk gate (the
   Phase 65 actions/subtasks.js precedent): this module joins the shared
   A namespace by assignment, the same way every sibling action module
   does. Every write rides the ONE existing doc-PUT funnel — snapshot()
   → mutate() → settle the push → restore() + honest toast on !res.ok
   (the A.submitProject failure contract). TMPL-03: no fourth write
   path, no MCP route, and no per-task creation loop anywhere here — the
   instantiation path lands builder-produced rows in ONE mutate and
   settles exactly ONE pushNow (D-15).
   ===================================================================== */
import { t } from '../core/i18n.js';
import { TODAY, uid } from '../core/utils.js';
import { D, proj, pushNow, task } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { render } from '../shell/render.js';
import { A, makeKey, nextKey, restore, snapshot } from './actions.js';
import { instantiateTemplate, landInstantiation, sanitizeTemplate, templateFromItem } from '../core/templates.js';

/* [66-03 registry] The template editor chunk lands in 66-03 and populates
   openEditor with its drawer opener (the treeChecklist registry pattern,
   src/features/subtasks.js). Until then the reference is stub-safe: a
   null fn means the save-as-template draft is built but nothing opens —
   no entry-chunk bytes, no crash. */
export const templateUi = { openEditor: null };

/* Create or update one doc.templates[] record. The draft runs through
   sanitizeTemplate CLIENT-side first (T-66-04) so the optimistic state
   matches exactly what the funnel will store — the sink remains the
   authority on the wire. */
A.saveTemplate = async record => {
  const snap = snapshot();
  const now = Date.now();
  const clean = sanitizeTemplate(record, () => uid('tpl'), Array.isArray(D().templates) ? D().templates.length : 0);
  let saved = null;
  if (
    !mutate(() => {
      if (!Array.isArray(D().templates)) D().templates = [];
      clean.updatedAt = now;
      const i = D().templates.findIndex(x => x.id === clean.id);
      if (i >= 0) {
        clean.createdAt = D().templates[i].createdAt || now;
        D().templates[i] = clean;
      } else {
        clean.createdAt = now;
        D().templates.push(clean);
      }
      saved = clean;
    }) ||
    !saved
  )
    return;
  const res = await pushNow();
  if (!res.ok) {
    restore(snap);
    render();
    toast(res.status === 409 ? t('modal.settingsConflict') : t('err.templateSaveFailed'), { kind: 'err' });
    return;
  }
  render();
  toast(t('toast.templateSaved', { name: saved.name }));
};

/* Instantiate a template (TMPL-02). kind 'project': the builder's rows,
   the project, projOrder.unshift, every task row, and one activity row
   land in the SAME synchronous mutate; kind 'task': one task row with
   the project ref assigned from the modal context. ONE pushNow (D-15) —
   never a per-task creation loop (the builder already produced
   funnel-ready rows). Returns the landed row so callers can navigate. */
A.instantiateTemplate = async (templateId, context = {}) => {
  const tm = (Array.isArray(D().templates) ? D().templates : []).find(x => x.id === templateId);
  if (!tm) return null;
  const snap = snapshot();
  let landed = null;
  if (
    !mutate(() => {
      const built = instantiateTemplate(tm, uid, TODAY, makeKey);
      landed = landInstantiation(D(), tm.kind, built, {
        me: D().me,
        project: context.project,
        actId: () => uid('a'),
        nextKey:
          tm.kind === 'task' && context.project && proj(context.project)
            ? () => nextKey(proj(context.project))
            : undefined,
      });
    }) ||
    !landed
  )
    return null;
  const res = await pushNow();
  if (!res.ok) {
    restore(snap);
    render();
    toast(res.status === 409 ? t('modal.settingsConflict') : t('err.templateInstantiateFailed'), { kind: 'err' });
    return null;
  }
  render();
  toast(t('toast.instantiatedFromTemplate', { name: tm.name }));
  return landed;
};

/* "Save as template" (D-10): build a whitelist-conformant draft from a
   live task/project (D-14 — offsets derived from the item's own due day,
   the inverse of the builder), then open the lazy template editor via
   the 66-03 registry pre-filled with the draft. The draft is NOT saved
   here — the editor's submit calls A.saveTemplate. */
A.saveAsTemplate = (kind, id) => {
  if (kind === 'project') {
    const p = proj(id);
    if (!p) return;
    const draft = templateFromItem('project', p, TODAY, { tasks: D().tasks.filter(x => x.project === p.id) });
    if (templateUi.openEditor) templateUi.openEditor(draft);
    return;
  }
  const tk = task(id);
  if (!tk) return;
  const draft = templateFromItem('task', tk, TODAY);
  if (templateUi.openEditor) templateUi.openEditor(draft);
};
