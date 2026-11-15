/* ---------- assignee picker modal (55-04, moved 66-03) ---------- */
/* 66-03 chunk-gate remedy (61-02/65-03/57-04 precedent): the assignee
   picker's BYTES left the entry chunk (the 500 kB gate); modalHtml reaches
   it through the S.ui.apMod module cache populated by the opener's dynamic
   import in actions.js — the DELIV-02 lazy-modal pattern. Markup, state
   shape and handlers (A.assigneePickToggle / IN.assigneePickQ — still in
   actions.js) are UNCHANGED; only the module home moved. */
import { esc, foldForSearch } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { av } from '../ui/helpers.js';
import { D, S, assignableInProject, mem, proj, task } from '../core/store.js';
import { ASSIGNEE_CAP } from '../core/constants.js';

export function assigneePickModal(m, H) {
  const st = S.ui.assigneePick || { taskId: null, subtaskIndex: null, draft: [], q: '' };
  const isForm = st.taskId === '__form';
  const tk = isForm ? null : task(st.taskId);
  const p = proj(isForm ? S.ui.form.project : tk?.project);
  const needle = foldForSearch(st.q || '').text;
  const cands = (D().members || [])
    .filter(mm => mm.status !== 'deactivated' && assignableInProject(mm, p, st.draft))
    .filter(mm => !needle || foldForSearch(mm.name).text.includes(needle));
  const atCap = st.draft.length >= ASSIGNEE_CAP;
  return `${H(t('act.assignTo'), tk ? esc(tk.title) : '')}
  <div class="modal-b" style="gap:10px">
    <input class="input" id="ap-q" data-in="assigneePickQ" placeholder="${t('modal.assigneeSearch')}" value="${esc(st.q || '')}" autofocus aria-label="${t('modal.assigneeSearch')}">
    ${
      st.draft.length
        ? `<div class="row" style="flex-wrap:wrap;gap:6px">${st.draft
            .map(
              id =>
                `<span class="chip">${av(id, 'sm', false)}<b>${esc(mem(id)?.name || '')}</b><button type="button" class="ibtn" data-a="assigneePickToggle" data-v="${id}" aria-label="${t('act.remove')}">${ic('x', 12)}</button></span>`,
            )
            .join('')}</div>`
        : ''
    }
    ${atCap ? `<div class="alert info" style="margin:0">${ic('circle-alert', 14)}<span>${t('page.field.assigneeCap', { n: ASSIGNEE_CAP })}</span></div>` : ''}
    <div class="col" style="gap:2px;max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:var(--r);padding:4px">
      ${
        cands
          .map(mm => {
            const on = st.draft.includes(mm.id);
            const blocked = !on && atCap;
            return `<button type="button" role="checkbox" aria-checked="${on}" aria-disabled="${blocked}" class="opt ${on ? 'on' : ''}${blocked ? ' off' : ''}" data-a="assigneePickToggle" data-v="${mm.id}" style="padding:8px;flex-direction:row;align-items:center;gap:8px;border-radius:var(--r)">${av(mm.id, 'sm', false)}<b style="font-size:12.5px">${esc(mm.name)}</b>${on ? ic('check', 13) : ''}</button>`;
          })
          .join('') || `<div class="mi faint" style="cursor:default">${t('modal.assigneeNoMatches')}</div>`
      }
    </div>
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="assigneePickApply">${t('act.done')}</button></div>`;
}
