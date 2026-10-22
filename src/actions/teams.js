/* =====================================================================
   ACTIONS · TEAMS: create, edit, delete
   ===================================================================== */
import { $, uid } from '../core/utils.js';
import { t, t as tMsg } from '../core/i18n.js';
import { PCOLORS } from '../core/constants.js';
import { D, S, mem, team, teamsList } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { go, render } from '../shell/render.js';
import { openModal } from '../overlays/modals.js';
import { A, IN, confirmDlg, restore, snapshot } from './actions.js';

A.newTeam = () => {
  S.ui.pop = null;
  S.ui.errors = {};
  S.ui.tform = { name: '', desc: '', icon: 'users', color: 'teal', members: [] };
  openModal({ type: 'team' });
};
A.editTeam = el => {
  const t = team(el.dataset.id);
  if (!t) return;
  S.ui.pop = null;
  S.ui.errors = {};
  S.ui.tform = {
    name: t.name,
    desc: t.desc,
    icon: t.icon,
    color: Object.keys(PCOLORS).find(k => PCOLORS[k] === t.c) || 'slate',
    members: D()
      .members.filter(m => m.team === t.id)
      .map(m => m.id),
  };
  openModal({ type: 'team', edit: t.id });
};
IN.tform = el => {
  S.ui.tform[el.dataset.f] = el.value;
  if (el.dataset.f === 'name' && S.ui.errors.tname && el.value.trim()) {
    S.ui.errors.tname = null;
    render();
  }
};
A.tformSet = el => {
  S.ui.tform[el.dataset.f] = el.dataset.v;
  render();
};
A.tformMember = el => {
  const l = S.ui.tform.members;
  const id = el.dataset.id;
  S.ui.tform.members = l.includes(id) ? l.filter(x => x !== id) : [...l, id];
  render();
};
A.submitTeam = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const f = S.ui.tform;
  f.name = ($('#tm-name')?.value || '').trim();
  f.desc = ($('#tm-desc')?.value || '').trim();
  if (!f.name) {
    S.ui.errors.tname = t('err.teamNameRequired');
    render();
    $('#tm-name')?.focus();
    return;
  }
  if (teamsList().some(t => t.name.toLowerCase() === f.name.toLowerCase() && t.id !== m.edit)) {
    S.ui.errors.tname = `A team called “${f.name}” already exists`;
    render();
    $('#tm-name')?.focus();
    return;
  }
  let t;
  const ok = mutate(() => {
    if (m.edit) {
      t = team(m.edit);
      Object.assign(t, { name: f.name, desc: f.desc, icon: f.icon, c: PCOLORS[f.color] });
      D().members.forEach(x => {
        if (x.team === t.id && !f.members.includes(x.id)) x.team = '';
      });
    } else {
      t = { id: uid('tm'), name: f.name, desc: f.desc || tMsg('common.noDescriptionYet'), icon: f.icon, c: PCOLORS[f.color] };
      teamsList().push(t);
    }
    f.members.forEach(id => {
      const x = mem(id);
      if (x) x.team = t.id;
    });
  });
  if (!ok) return;
  S.ui.modals.pop();
  if (m.edit) {
    render();
    toast(tMsg('toast.teamSaved', { name: t.name }));
  } else {
    go('team', { id: t.id });
    toast(tMsg('toast.createdProject', { name: t.name }));
  }
};
A.delTeam = el => {
  const tm = team(el.dataset.id);
  const n = D().members.filter(x => x.team === tm.id).length;
  const np = D().projects.filter(p => p.team === tm.id).length;
  S.ui.modals.pop();
  confirmDlg({
    title: t('act.deleteTitle', { name: tm.name }),
    body: `${n ? `<b>${t('act.teams.membersWithoutTeam', { n: n })}</b> will have no team` : t('act.teams.noMembers')}${np ? ` and <b>${t('act.teams.projectsWithoutTeam', { n: np })}</b> will need a new team` : ''}. People and projects are not deleted.`,
    ok: t('act.deleteTeam'),
    danger: true,
    icon: 'users',
    run: () => {
      const snap = snapshot();
      if (
        mutate(() => {
          D().teams = teamsList().filter(x => x !== tm);
          D().members.forEach(x => {
            if (x.team === tm.id) x.team = '';
          });
          D().projects.forEach(p => {
            if (p.team === tm.id) p.team = '';
          });
        })
      ) {
        if (S.ui.route === 'team') go('teams');
        toast(t('toast.deleted', { name: tm.name }), { action: t('toast.undo'), onAction: () => restore(snap) });
      }
    },
  });
};
