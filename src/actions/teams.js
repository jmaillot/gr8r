/* =====================================================================
   ACTIONS · TEAMS: create, edit, delete
   ===================================================================== */
import { $, uid } from '../core/utils.js';
import { t, t as tMsg } from '../core/i18n.js';
import { PCOLORS } from '../core/constants.js';
import { D, S, mem, memberTeams, projInTeam, projTeams, pushNow, team, teamsList } from '../core/store.js';
import { api } from '../core/api.js';
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
      .members.filter(m => memberTeams(m).includes(t.id))
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
A.submitTeam = async () => {
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
  const before = new Map(D().members.map(x => [x.id, memberTeams(x)]));
  let t;
  const ok = mutate(() => {
    if (m.edit) {
      t = team(m.edit);
      Object.assign(t, { name: f.name, desc: f.desc, icon: f.icon, c: PCOLORS[f.color] });
    } else {
      t = { id: uid('tm'), name: f.name, desc: f.desc || tMsg('common.noDescriptionYet'), icon: f.icon, c: PCOLORS[f.color] };
      teamsList().push(t);
    }
    /* Membership rides the authority set (D-01): the mutate envelope only
       renders the projected set optimistically — the server call below is
       the authority. Teamless stays an empty array (D-03). */
    f.members.forEach(id => {
      const x = mem(id);
      if (x) x.teams = Array.from(new Set([...memberTeams(x), t.id]));
    });
    if (m.edit) {
      D().members.forEach(x => {
        if (!f.members.includes(x.id)) x.teams = memberTeams(x).filter(id => id !== t.id);
      });
    }
  });
  if (!ok) return;
  /* Persist the changed memberships through the API (server mode) — the doc
     write above never reaches the wire as membership. */
  if (api.enabled) {
    const changed = D()
      .members.map(x => ({ x, next: memberTeams(x) }))
      .filter(({ x, next }) => JSON.stringify(before.get(x.id)) !== JSON.stringify(next));
    const results = await Promise.all(changed.map(({ x, next }) => api.setMemberTeams(x.userId, next)));
    if (results.some(r => !r?.ok)) {
      changed.forEach(({ x }) => {
        x.teams = before.get(x.id) || [];
      });
      render();
      toast(tMsg('err.changeTeam'), { kind: 'err' });
      return;
    }
  }
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
  const n = D().members.filter(x => memberTeams(x).includes(tm.id)).length;
  const np = D().projects.filter(p => projInTeam(p, tm.id)).length;
  S.ui.modals.pop();
  confirmDlg({
    title: t('act.deleteTitle', { name: tm.name }),
    body: `${n ? `<b>${t('act.teams.membersWithoutTeam', { n: n })}</b> will have no team` : t('act.teams.noMembers')}${np ? ` and <b>${t('act.teams.projectsWithoutTeam', { n: np })}</b> will need a new team` : ''}. People and projects are not deleted.`,
    ok: t('act.deleteTeam'),
    danger: true,
    icon: 'users',
    run: async () => {
      /* Phase 35 undo capture (D-01/D-05): the before-map is taken ABOVE the
         purge block, before any PUT fires — it is the confirm closure's
         record of each affected member's team set at deletion time. The Map
         keys by doc member id (x.id); the undo PUT needs the account id
         (x.userId) — the closure also carries tm.id and snap. */
      const before = new Map(D().members.map(x => [x.id, memberTeams(x)]));
      /* T-28-05: purge the authority rows for the deleted team BEFORE the doc
         team definition disappears — every affected member is re-PUT with the
         team filtered out of their set (transactional delete+insert on the
         server), so no orphaned team_members rows survive the doc deletion. */
      const affected = D().members.filter(x => memberTeams(x).includes(tm.id));
      if (api.enabled) {
        const results = await Promise.all(
          affected.map(x =>
            api.setMemberTeams(
              x.userId,
              memberTeams(x).filter(id => id !== tm.id),
            ),
          ),
        );
        if (results.some(r => !r?.ok)) {
          toast(t('err.changeTeam'), { kind: 'err' });
          return;
        }
      }
      const snap = snapshot();
      if (
        mutate(() => {
          D().teams = teamsList().filter(x => x !== tm);
          affected.forEach(x => {
            x.teams = memberTeams(x).filter(id => id !== tm.id);
          });
          D().projects.forEach(p => {
            p.teams = projTeams(p).filter(id => id !== tm.id);
            delete p.team;
          });
        })
      ) {
        if (S.ui.route === 'team') go('teams');
        /* Phase 35 honest undo (D-05/D-06): restore runs unconditionally —
           local mode (api.enabled false) stops there, exactly as before. In
           API mode the restored doc MUST land server-side BEFORE any
           authority PUT: the membership route whitelists team ids against
           the stored doc, so a premature PUT 400s unknownTeam. The ≤25
           tooManyTeams cap is unreachable inside the ~5s toast window. */
        toast(t('toast.deleted', { name: tm.name }), {
          action: t('toast.undo'),
          onAction: async () => {
            restore(snap);
            if (!api.enabled) return;
            const pushed = await pushNow();
            /* WR-01 (Gap 1): a failed doc push (network loss, 401, 403, 409)
               stops the undo BEFORE any authority PUT — the membership route
               whitelists team ids against the stored doc, so a PUT now is a
               guaranteed 400 unknownTeam (and a divergent-state corner if the
               server doc still carries the team id). Unconditional: even with
               an empty affected roster, the restore was never persisted. */
            /* Defense-in-depth: truthiness, not strict === false — a result
               shape missing `ok` must fail closed (the gate is the last line
               of defense against the guaranteed-400 unknownTeam cascade). */
            if (!pushed.ok) {
              toast(t('err.changeTeam'), { kind: 'err' });
              return;
            }
            const results = await Promise.all(
              affected.map(x => {
                const live = D().members.find(m => m.id === x.id);
                if (!live) return { ok: false, status: 0 };
                /* Additive union (D-03): the captured before-map set ∪ the
                   member's current set ∪ the deleted team id — newer
                   independent changes are never erased. Full-set replace is
                   why the union shape is load-bearing (D-04). */
                const union = Array.from(new Set([...(before.get(x.id) || []), ...memberTeams(live), tm.id]));
                return api.setMemberTeams(live.userId, union);
              }),
            );
            /* D-02: failure = honest error toast, no compensating rollback. */
            if (!pushed.ok || results.some(r => !r?.ok)) {
              toast(t('err.changeTeam'), { kind: 'err' });
              return;
            }
          },
        });
      }
    },
  });
};
