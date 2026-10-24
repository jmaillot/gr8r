/* =====================================================================
   ACTIONS · ARCHIVE: restore and purge
   ===================================================================== */
import { esc } from '../core/utils.js';
import { t as tMsg } from '../core/i18n.js';
import { logAct, task } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { A, confirmDlg, deleteTasks } from './actions.js';

A.restoreTask = el => {
  const t = task(el.dataset.id);
  if (
    mutate(() => {
      t.archived = false;
      t.archivedAt = null;
      logAct('restored', t, {});
    })
  )
    toast(tMsg('toast.taskRestored', { title: t.title }), { action: tMsg('toast.open'), onAction: () => A.openTask({ dataset: { id: t.id } }) });
};
A.purgeTask = el => {
  const t = task(el.dataset.id);
  confirmDlg({
    title: tMsg('act.deleteTaskForeverTitle'),
    body: `<b>${esc(t.title)}</b>${tMsg('act.purgeTaskBody')}`,
    ok: tMsg('act.deletePermanently'),
    danger: true,
    run: () => {
      if (mutate(() => deleteTasks([t.id]))) toast(tMsg('toast.deletedTask', { title: t.title }));
    },
  });
};
