/* ---------- 404 / DENIED / FAILED ---------- */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { mem } from '../core/store.js';
import { t } from '../core/i18n.js';

export function page404() {
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('file-question', 20)}</div></div><span class="code">${t('err.code404')}</span><h1>${t('page.notFound')}</h1><p>${t('page.notFoundTitle')}</p><div class="row"><button class="btn btn-secondary" data-a="back">${ic('arrow-left', 14)}${t('page.back')}</button><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
}
export function stateDenied(p) {
  const lead = mem(p?.lead);
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('page.denied')}</h1><p>${p ? `<b>${esc(p.name)}</b> ${t('page.deniedPrivate')} ` : ''}${t('page.deniedAsk')} ${lead ? esc(lead.name) : t('page.deniedOwner')} ${t('page.deniedHint')}</p><div class="row"><button class="btn btn-secondary" data-a="go" data-r="projects">${t('page.backToProjects')}</button><button class="btn btn-primary" data-a="requestAccess" data-id="${p?.id || ''}">${t('page.requestAccess')}</button></div></div></div>`;
}
export function stateFailed() {
  return `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${t('page.somethingWrong')}</h1><p>${t('page.loadFailedBody')}</p><div class="row"><button class="btn btn-secondary" data-a="go" data-r="home">${t('nav.goHome')}</button><button class="btn btn-primary" data-a="reload">${ic('refresh-cw', 14)}${t('page.tryAgain')}</button></div></div></div>`;
}
