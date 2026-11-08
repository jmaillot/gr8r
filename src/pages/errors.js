/* ---------- 404 / DENIED / FAILED ---------- */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { mem } from '../core/store.js';
import { t } from '../core/i18n.js';

export function page404() {
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('file-question', 20)}</div></div><span class="code">${t('err.code404')}</span><h1>${t('page.notFound')}</h1><p>${t('page.notFoundTitle')}</p><div class="row"><button class="btn btn-secondary" data-a="back">${ic('arrow-left', 14)}${t('page.back')}</button><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
}
/* [2026-11-08 D-51-4] The project-specific honest not-found state: a client
   that had the project open and lost it (someone flipped it private — the
   server redacts it from the member's served copy) re-renders this instead of
   the generic 404 copy. Localized via the existing err.projectNotFound keys;
   the server's 404 bodies are untouched — this is client-side rendering over
   server redaction only. */
export function stateNotFound() {
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('file-question', 20)}</div></div><span class="code">${t('err.code404')}</span><h1>${t('err.projectNotFound')}</h1><p>${t('page.notFoundTitle')}</p><div class="row"><button class="btn btn-secondary" data-a="back">${ic('arrow-left', 14)}${t('page.back')}</button><button class="btn btn-primary" data-a="go" data-r="projects">${t('page.backToProjects')}</button></div></div></div>`;
}
export function stateDenied(p) {
  const lead = mem(p?.lead);
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('page.denied')}</h1><p>${p ? `<b>${esc(p.name)}</b> ${t('page.deniedPrivate')} ` : ''}${t('page.deniedAsk')} ${lead ? esc(lead.name) : t('page.deniedOwner')} ${t('page.deniedHint')}</p><div class="row"><button class="btn btn-secondary" data-a="go" data-r="projects">${t('page.backToProjects')}</button><button class="btn btn-primary" data-a="requestAccess" data-id="${p?.id || ''}">${t('page.requestAccess')}</button></div></div></div>`;
}
export function stateFailed() {
  return `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${t('page.somethingWrong')}</h1><p>${t('page.loadFailedBody')}</p><div class="row"><button class="btn btn-secondary" data-a="go" data-r="home">${t('nav.goHome')}</button><button class="btn btn-primary" data-a="reload">${ic('refresh-cw', 14)}${t('page.tryAgain')}</button></div></div></div>`;
}
