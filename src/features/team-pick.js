/* ---------- team picker modal (84-02 BP-01) ---------- */
/* Clone of the 55-04 assignee-picker lazy chunk (66-03 gate remedy): the
   picker's BYTES leave the entry chunk; modalHtml reaches it through the
   S.ui.tpMod module cache populated by the opener's dynamic import in
   actions.js — the DELIV-02 lazy-modal pattern. The stored team state
   (S.ui.inviteTeams / S.ui.memberTeams.teams) is UNCHANGED; the draft lives
   in S.ui.teamPick = { surface: 'invite'|'member', draft, q, hl } and the
   handlers (A.teamPickOpen / A.teamPickToggle / A.teamPickAdd /
   A.teamPickClose / A.teamPickApply / IN.teamPickQ) stay in actions.js.
   Keyboard contract per D-03: Enter selects and keeps the input open
   (chip accumulates), Backspace removes the last chip, Escape closes —
   wired in keyboard.js over the pk._flat mechanism (settings.js:226
   precedent). */
import { esc, foldForSearch } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { S, teamsList } from '../core/store.js';

export function teamPickModal(m, H) {
  const st = S.ui.teamPick || { surface: 'invite', draft: [], q: '', hl: 0 };
  const needle = foldForSearch(st.q || '').text;
  const cands = teamsList().filter(tm => !needle || foldForSearch(tm.name).text.includes(needle));
  /* keyboard.js picks the highlighted entry from here (pk._flat pattern,
     settings.js:226 precedent). */
  st._flat = cands.map(tm => tm.id);
  return `${H(t('nav.route.team'), '')}
  <div class="modal-b" style="gap:10px">
    <input class="input" id="tp-q" data-in="teamPickQ" placeholder="${t('modal.teamSearch')}" value="${esc(st.q || '')}" autofocus role="combobox" aria-expanded="true" aria-controls="tp-list" aria-activedescendant="tp-opt-${st.hl}" autocomplete="off" aria-label="${t('modal.teamSearch')}">
    ${
      st.draft.length
        ? `<div class="row" style="flex-wrap:wrap;gap:6px">${st.draft
            .map(
              id => {
                const tm = teamsList().find(x => x.id === id);
                return `<span class="chip">${ic('users', 12)}<b>${esc(tm?.name || id)}</b><button type="button" class="ibtn" data-a="teamPickToggle" data-v="${id}" aria-label="${t('act.remove')}">${ic('x', 12)}</button></span>`;
              },
            )
            .join('')}</div>`
        : ''
    }
    <div class="col" role="listbox" id="tp-list" style="gap:2px;max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:var(--r);padding:4px">
      ${
        cands
          .map((tm, i) => {
            const on = st.draft.includes(tm.id);
            return `<button type="button" role="option" aria-selected="${i === st.hl}" class="opt ${i === st.hl ? 'hl' : ''}${on ? ' on' : ''}" data-a="teamPickAdd" data-v="${tm.id}" style="padding:8px;flex-direction:row;align-items:center;gap:8px;border-radius:var(--r)">${ic('users', 14)}<b style="font-size:12.5px">${esc(tm.name)}</b>${on ? ic('check', 13) : ''}</button>`;
          })
          .join('') || `<div class="mi faint" style="cursor:default">${t('modal.teamNoMatches')}</div>`
      }
    </div>
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="teamPickClose">${t('common.cancel')}</button><button class="btn btn-primary" data-a="teamPickApply">${t('act.done')}</button></div>`;
}
