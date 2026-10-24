/* ---------------- AUTH ---------------- */
import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { LOGO, ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { api } from '../core/api.js';
import { effectiveDark } from '../core/theme.js';
import { TEMPLATES } from '../overlays/modals.js';
import { strengthMeter } from './settings.js';

/* The onboarding's view lookup: the stored team value is the machine id
   (data-v), the display reads the catalogue. */
const VIEWS = { kanban: 'nav.tab.board', list: 'nav.tab.list', timeline: 'nav.route.timeline', table: 'nav.tab.table' };
/* The stored team-size values the wizard stores verbatim (data-v), keyed to
   their display. */
const SIZES = {
  'Just me': 'page.auth.size.justMe',
  '2-10': 'page.auth.size.small',
  '11-50': 'page.auth.size.medium',
  '51-200': 'page.auth.size.large',
  '200+': 'page.auth.size.xlarge',
};

export function authShell(inner, topRight = '') {
  return `<div class="auth"><div class="auth-top"><span class="brand">${LOGO(22)}</span><div class="row">${topRight}<button class="ibtn" data-a="toggleDark" data-tip="${t('a11y.auth.toggleTheme')}" aria-label="${t('a11y.auth.toggleTheme')}">${ic(effectiveDark() ? 'sun' : 'moon', 16)}</button></div></div>
    <div class="auth-c">${inner}</div>
    <div class="auth-foot" style="padding:18px;font-size:12px" ><span class="faint">${t('page.auth.legal')}</span></div></div>`;
}
export const socialBtns = () => `<div class="social">
  <button class="btn btn-secondary btn-lg" data-a="socialAuth" data-v="Google"><svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>${t('page.auth.continueGoogle')}</button>
  <button class="btn btn-secondary btn-lg" data-a="socialAuth" data-v="Microsoft"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect width="6.4" height="6.4" fill="#F25022"/><rect x="7.6" width="6.4" height="6.4" fill="#7FBA00"/><rect y="7.6" width="6.4" height="6.4" fill="#00A4EF"/><rect x="7.6" y="7.6" width="6.4" height="6.4" fill="#FFB900"/></svg>${t('page.auth.continueMicrosoft')}</button>
  <button class="btn btn-secondary btn-lg" data-a="socialAuth" data-v="Apple">${ic('apple', 15)}${t('page.auth.continueApple')}</button></div>`;
export const ferr = k => (S.ui.errors[k] ? `<span class="err" id="${k}-err">${ic('circle-alert', 12)}${S.ui.errors[k]}</span>` : '');
export const icls = k => (S.ui.errors[k] ? 'is-error' : '');
export function renderAuth() {
  const s = S.ui.auth;
  const e = S.ui.errors;
  const f = S.ui.af || (S.ui.af = { email: '', name: '' });
  if (s === 'onboarding') return renderOnboarding();
  if (s === 'login')
    return authShell(
      `<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doLogin" novalidate>
    <div style="display:flex;justify-content:center">${LOGO(30)}</div><h1>${t('page.auth.welcomeBack')}</h1><p class="sub">${t('page.auth.signInTo')} ${esc(D().ws.name)}</p>
    ${e.login ? `<div class="alert danger" role="alert">${ic('circle-alert', 15)}<span>${esc(e.login)}</span></div>` : ''}
    <div class="field"><label class="label" for="l-email">${t('common.email')}</label><input class="input input-lg ${icls('email')}" id="l-email" type="email" value="${esc(f.email)}" autocomplete="email" aria-invalid="${!!e.email}" aria-describedby="email-err">${ferr('email')}</div>
    <div class="field"><div class="row"><label class="label" for="l-pw">${t('common.password')}</label><span class="sp"></span>${api.enabled ? '' : `<button type="button" class="link" style="font-size:12.5px" data-a="auth" data-v="forgot">${t('page.auth.forgotPassword')}</button>`}</div>
      <div class="inwrap"><input class="input input-lg ${icls('pw')}" id="l-pw" type="${S.ui.showPw ? 'text' : 'password'}" autocomplete="current-password" style="padding-right:38px" aria-invalid="${!!e.pw}"><button type="button" class="ibtn ibtn-sm" style="position:absolute;right:5px" data-a="toggleShowPw" aria-label="${S.ui.showPw ? t('page.auth.hidePw') : t('page.auth.showPw')}">${ic(S.ui.showPw ? 'eye-off' : 'eye', 15)}</button></div>${ferr('pw')}</div>
    <label class="row" style="font-size:13px;gap:8px;cursor:pointer"><input type="checkbox" class="check" id="l-rem" checked>${t('page.auth.rememberMe')}</label>
    <button class="btn btn-primary btn-lg btn-block" data-a="doLogin" id="login-btn">${t('page.auth.signIn')}</button>
    ${api.enabled ? '' : `<div class="or">${t('page.auth.or')}</div>${socialBtns()}`}
    ${api.enabled ? (api.allowSignup ? `<p class="auth-foot">${t('page.auth.noAccount')} <button type="button" class="link" data-a="auth" data-v="signup">${t('page.auth.signUp')}</button></p>` : `<p class="auth-foot">${t('page.auth.adminCreates')}</p>`) : `<p class="auth-foot">${t('page.auth.noAccount')} <button type="button" class="link" data-a="auth" data-v="signup">${t('page.auth.signUp')}</button></p>`}</form>`,
      api.enabled ? '' : `<button class="btn btn-ghost btn-sm" data-a="auth" data-v="signup">${t('page.auth.signUp')}</button>`,
    );
  if (s === 'join') {
    const j = S.ui.join || {};
    if (j.error)
      return authShell(
        `<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--red);width:44px;height:44px;border-radius:11px">${ic('link', 20)}</span></div><h1>${t('page.auth.inviteUnavailable')}</h1><p class="sub">${esc(j.error)}</p><button class="btn btn-primary btn-lg btn-block" data-a="auth" data-v="login">${t('page.auth.goToSignIn')}</button></div>`,
      );
    // The address already has an account: joining means signing in, not signing up.
    if (j.existing)
      return authShell(
        `<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center">${LOGO(30)}</div><h1>${t('page.auth.joinTitle', { name: esc(j.workspace?.name || D().ws.name) })}</h1><p class="sub">${t('page.auth.existingBody', { email: esc(j.email || t('page.auth.thisAddress')) })}</p>
    ${S.ui.errors.login ? `<div class="alert danger" role="alert">${ic('circle-alert', 15)}<span>${esc(S.ui.errors.login)}</span></div>` : ''}
    <button class="btn btn-primary btn-lg btn-block" data-a="auth" data-v="login">${ic('log-in', 15)}${t('page.auth.signInAndJoin')}</button>
    <p class="auth-foot">${t('page.auth.wrongAddress', { name: esc(j.workspace?.name || D().ws.name) })}</p></div>`,
      );
    const email = j.email || S.ui.af.email;
    return authShell(
      `<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doJoin" novalidate>
    <div style="display:flex;justify-content:center">${LOGO(30)}</div><h1>${t('page.auth.joinTitle', { name: esc(j.workspace?.name || D().ws.name) })}</h1><p class="sub">${t('page.auth.joinSubtitle')}</p>
    ${e.join ? `<div class="alert danger" role="alert">${ic('circle-alert', 15)}<span>${esc(e.join)}</span></div>` : ''}
    <div class="field"><label class="label" for="j-name">${t('common.fullName')}</label><input class="input input-lg ${icls('name')}" id="j-name" value="${esc(S.ui.af.name || '')}" autocomplete="name" autofocus placeholder="${t('a11y.auth.yourName')}">${ferr('name')}</div>
    <div class="field"><label class="label" for="j-email">${t('common.email')}</label><input class="input input-lg ${icls('email')}" id="j-email" type="email" value="${esc(email)}" autocomplete="email" ${j.email ? 'readonly' : ''}>${ferr('email') || (j.email ? `<span class="hint">${t('page.auth.inviteForAddress')}</span>` : '')}</div>
    <div class="field"><label class="label" for="j-pw">${t('common.password')}</label><input class="input input-lg ${icls('pw')}" id="j-pw" type="password" data-in="pwStrength" value="${esc(S.ui.pwNew || '')}" autocomplete="new-password">${strengthMeter(S.ui.pwNew || '')}${ferr('pw') || `<span class="hint">${t('common.pwHint')}</span>`}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doJoin" id="join-btn">${t('page.auth.createJoin')}</button>
    <p class="auth-foot">${t('page.auth.haveAccount')} <button type="button" class="link" data-a="auth" data-v="login">${t('page.auth.signIn')}</button></p></form>`,
    );
  }
  if (s === 'no-workspace')
    return authShell(
      `<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center">${LOGO(30)}</div>
    <h1>${t('page.auth.noWorkspaceTitle')}</h1><p class="sub">${t('page.auth.noWorkspaceBody')}</p>
    <div class="panel" style="padding:12px 14px;display:flex;gap:10px;align-items:center">${ic('mail', 15)}<span class="muted" style="font-size:13px">${t('page.auth.signedInAs')} ${esc(api.user?.email || S.ui.af.email || t('page.auth.you'))}</span></div>
    <button class="btn btn-secondary btn-lg btn-block" data-a="signOut">${t('palette.signOut')}</button></div>`,
    );
  if (s === 'signup')
    return authShell(
      `<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doSignup" novalidate>
    <div style="display:flex;justify-content:center">${LOGO(30)}</div><h1>${t('page.auth.createYourAccount')}</h1><p class="sub">${api.enabled ? t('page.auth.signupCloud') : t('page.auth.signupFree')}</p>
    ${api.enabled ? '' : `${socialBtns()}<div class="or">${t('page.auth.orSignupEmail')}</div>`}
    <div class="field"><label class="label" for="s-name">${t('common.fullName')}</label><input class="input input-lg ${icls('name')}" id="s-name" value="${esc(f.name)}" autocomplete="name" placeholder="Tanjim Islam">${ferr('name')}</div>
    <div class="field"><label class="label" for="s-email">${t('page.auth.workEmail')}</label><input class="input input-lg ${icls('email')}" id="s-email" type="email" value="" autocomplete="email" placeholder="you@company.com">${ferr('email')}</div>
    <div class="field"><label class="label" for="s-pw">${t('common.password')}</label><input class="input input-lg ${icls('pw')}" id="s-pw" type="password" data-in="pwStrength" value="${esc(S.ui.pwNew || '')}" autocomplete="new-password">${strengthMeter(S.ui.pwNew || '')}${ferr('pw') || `<span class="hint">${t('common.pwHint')}</span>`}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doSignup" id="signup-btn">${t('page.auth.createAccount')}</button>
    <p class="hint" style="text-align:center">${t('page.auth.termsNote')}</p>
    <p class="auth-foot">${t('page.auth.haveAccount')} <button type="button" class="link" data-a="auth" data-v="login">${t('page.auth.signIn')}</button></p></form>`,
      `<button class="btn btn-ghost btn-sm" data-a="auth" data-v="login">${t('page.auth.logIn')}</button>`,
    );
  if (s === 'forgot')
    return authShell(`<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doForgot" novalidate>
    <div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--accent);width:44px;height:44px;border-radius:11px">${ic('key-round', 20)}</span></div><h1>${t('page.auth.resetTitle')}</h1><p class="sub">${t('page.auth.resetSubtitle')}</p>
    <div class="field"><label class="label" for="f-email">${t('common.email')}</label><input class="input input-lg ${icls('email')}" id="f-email" type="email" value="${esc(f.email)}" autocomplete="email">${ferr('email')}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doForgot" id="forgot-btn">${t('page.auth.sendResetLink')}</button>
    <p class="auth-foot"><button type="button" class="link row" style="display:inline-flex;gap:6px" data-a="auth" data-v="login">${ic('arrow-left', 14)}${t('page.auth.backToSignIn')}</button></p></form>`);
  if (s === 'forgot-sent')
    return authShell(`<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--green);width:44px;height:44px;border-radius:11px">${ic('mail-check', 20)}</span></div><h1>${t('page.auth.checkEmail')}</h1><p class="sub">${t('page.auth.resetLinkSent')} <b style="color:var(--text)">${esc(f.email)}</b>${t('page.auth.resetExpires')}</p>
    <button class="btn btn-primary btn-lg btn-block" data-a="auth" data-v="reset">${t('page.auth.openResetLink')}</button><div class="alert info">${ic('info', 14)}<span>${t('page.auth.prototypeNote')}</span></div>
    <p class="auth-foot">${t('page.auth.noEmail')} <button class="link" data-a="resend" data-v="reset">${t('page.auth.resendEmail')}</button></p><p class="auth-foot"><button class="link row" style="display:inline-flex;gap:6px" data-a="auth" data-v="login">${ic('arrow-left', 14)}${t('page.auth.backToSignIn')}</button></p></div>`);
  if (s === 'reset')
    return authShell(`<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doReset" novalidate><div style="display:flex;justify-content:center">${LOGO(30)}</div><h1>${t('page.auth.chooseNewPw')}</h1><p class="sub">${t('page.auth.for')} ${esc(f.email)}</p>
    <div class="field"><label class="label" for="r-pw">${t('page.auth.newPassword')}</label><input class="input input-lg ${icls('pw')}" id="r-pw" type="password" data-in="pwStrength" value="${esc(S.ui.pwNew || '')}" autocomplete="new-password">${strengthMeter(S.ui.pwNew || '')}${ferr('pw')}</div>
    <div class="field"><label class="label" for="r-pw2">${t('page.auth.confirmPassword')}</label><input class="input input-lg ${icls('pw2')}" id="r-pw2" type="password" autocomplete="new-password">${ferr('pw2')}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doReset" id="reset-btn">${t('page.auth.resetPassword')}</button></form>`);
  if (s === 'reset-done')
    return authShell(
      `<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--green);width:44px;height:44px;border-radius:11px">${ic('circle-check', 20)}</span></div><h1>${t('page.auth.pwUpdated')}</h1><p class="sub">${t('page.auth.pwUpdatedBody')}</p><button class="btn btn-primary btn-lg btn-block" data-a="auth" data-v="login">${t('page.auth.signIn')}</button></div>`,
    );
  if (s === 'verify')
    return authShell(`<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--accent);width:44px;height:44px;border-radius:11px">${ic('mail', 20)}</span></div><h1>${t('page.auth.verifyTitle')}</h1><p class="sub">${t('page.auth.verifyLinkSent')} <b style="color:var(--text)">${esc(f.email)}</b>${t('page.auth.verifyClick')}</p>
    <div class="panel" style="padding:12px 14px;display:flex;gap:10px;align-items:center"><span class="sk" style="width:8px;height:8px;border-radius:50%;animation-duration:1.1s"></span><span class="muted" style="font-size:13px">${t('page.auth.waitingVerification')}</span></div>
    <button class="btn btn-primary btn-lg btn-block" data-a="verified">${t('page.auth.verifiedButton')}</button>
    <button class="btn btn-secondary btn-lg btn-block" data-a="resend" data-v="verify" id="resend-btn" ${S.ui.resendT > 0 ? 'disabled' : ''}>${S.ui.resendT > 0 ? `${t('page.auth.resendIn')} <span class="num" id="resend-t">${S.ui.resendT}</span>${t('page.auth.secondsSuffix')}` : t('page.auth.resendEmail')}</button>
    <p class="auth-foot">${t('page.auth.wrongEmail')} <button class="link" data-a="auth" data-v="signup">${t('page.auth.changeIt')}</button></p></div>`);
  return '';
}

/* ---------------- ONBOARDING ---------------- */
export function renderOnboarding() {
  const st = S.ui.onb;
  const o = S.ui.onbData;
  const N = 6;
  const nav = (next = t('page.auth.continue'), skip = false) =>
    `<div class="row" style="margin-top:6px">${st > 0 && st < 5 ? `<button class="btn btn-ghost" data-a="onbBack">${ic('arrow-left', 14)}${t('page.auth.back')}</button>` : ''}<span class="sp"></span>${skip ? `<button class="btn btn-ghost" data-a="onbNext" data-skip="1">${t('page.auth.skipForNow')}</button>` : ''}<button class="btn btn-primary btn-lg" data-a="onbNext" id="onb-next">${next}${ic('arrow-right', 15)}</button></div>`;
  const opt = (k, v, icon, n, s) =>
    `<button class="opt ${o[k] === v ? 'on' : ''}" role="radio" aria-checked="${o[k] === v}" data-a="onbSet" data-k="${k}" data-v="${v}">${ic(icon, 18)}<b>${n}</b>${s ? `<span>${s}</span>` : ''}</button>`;
  let body;
  if (st === 0)
    body = `<h1>${t('page.auth.onb1Title')}</h1><p class="sub">${t('page.auth.onb1Sub')}</p><div class="opts" role="radiogroup">${[
      ['product', 'target', 'page.auth.use.product', 'page.auth.use.productSub'],
      ['design', 'palette', 'page.auth.use.design', 'page.auth.use.designSub'],
      ['marketing', 'megaphone', 'page.auth.use.marketing', 'page.auth.use.marketingSub'],
      ['engineering', 'code', 'page.auth.use.engineering', 'page.auth.use.engineeringSub'],
      ['personal', 'user', 'page.auth.use.personal', 'page.auth.use.personalSub'],
      ['other', 'sparkles', 'page.auth.use.other', 'page.auth.use.otherSub'],
    ]
      .map(x => opt('use', x[0], x[1], t(x[2]), t(x[3])))
      .join('')}</div>${nav()}`;
  if (st === 1) {
    const e = S.ui.errors.ws;
    body = `<h1>${t('page.auth.onb2Title')}</h1><p class="sub">${t('page.auth.onb2Sub')}</p>
    <div class="field"><label class="label" for="o-ws">${t('common.wsName')}</label><input class="input input-lg ${e ? 'is-error' : ''}" id="o-ws" data-in="onbWs" value="${esc(o.ws)}" placeholder="${t('a11y.auth.wsNamePlaceholder')}" autofocus>${e ? `<span class="err">${ic('circle-alert', 12)}${e}</span>` : ''}</div>
    <div class="field"><label class="label" for="o-url">${t('common.wsUrl')}</label><div class="row" style="gap:0"><span class="input input-lg" style="width:auto;background:var(--surface-2);border-right:0;border-radius:6px 0 0 6px;display:flex;align-items:center;color:var(--text-2)">${esc(api.host)}/w/</span><input class="input input-lg" id="o-url" value="${esc(o.url || '')}" data-in="onbUrl" style="border-radius:0 6px 6px 0" placeholder="gr8rstudio"></div>${o.url ? `<span class="hint" style="display:flex;gap:4px;align-items:center">${ic('link', 12)}${t('page.auth.wsUrlHint')} ${esc(api.host)}/w/${esc(o.url)}</span>` : ''}</div>${nav()}`;
  }
  if (st === 2)
    body = `<h1>${t('page.auth.onb3Title')}</h1><p class="sub">${t('page.auth.onb3Sub')}</p><div class="opts" role="radiogroup" style="grid-template-columns:repeat(2,minmax(0,1fr))">${[
      ['kanban', 'square-kanban', 'page.auth.team.boards', 'page.auth.team.boardsSub'],
      ['list', 'list-checks', 'page.auth.team.lists', 'page.auth.team.listsSub'],
      ['timeline', 'chart-gantt', 'page.auth.team.timelines', 'page.auth.team.timelinesSub'],
      ['table', 'table-2', 'page.auth.team.tables', 'page.auth.team.tablesSub'],
    ]
      .map(x => opt('team', x[0], x[1], t(x[2]), t(x[3])))
      .join('')}</div>
    <div class="field"><span class="label">${t('page.auth.teamSize')}</span><div class="seg" style="width:fit-content">${Object.keys(SIZES)
      .map(s => `<button class="${o.size === s ? 'on' : ''}" data-a="onbSet" data-k="size" data-v="${s}">${t(SIZES[s])}</button>`)
      .join('')}</div></div>${nav()}`;
  if (st === 3)
    body = `<h1>${t('page.auth.onb4Title')}</h1><p class="sub">${t('page.auth.onb4Sub')}</p><div class="field"><label class="label" for="o-proj">${t('page.auth.projectName')}</label><input class="input input-lg" id="o-proj" data-in="onbProj" value="${esc(o.proj)}" autofocus></div><div class="tmpls" role="radiogroup">${TEMPLATES.filter(
      tp => tp.id !== 'blank',
    )
      .map(tp =>
        opt(
          'tmpl',
          tp.id,
          tp.icon,
          t(`project.template.${tp.id}.name`),
          tp.tasks ? t('common.starterTasks', { n: tp.tasks }) : t(`project.template.${tp.id}.desc`),
        ),
      )
      .join('')}</div>${nav()}`;
  if (st === 4)
    body = `<h1>${t('page.auth.onb5Title')}</h1><p class="sub">${t('page.auth.onb5Sub')}${api.mailEnabled ? ` ${t('page.auth.onb5MailHint')}` : api.enabled ? ` ${t('page.auth.onb5LinkHint')}` : ''}</p><div class="col" style="gap:8px">${[0, 1, 2].map(i => `<input class="input input-lg" id="o-inv-${i}" placeholder="teammate@company.com" type="email" value="${esc((o.invites || '').split(',')[i] || '')}" data-in="onbInv" data-i="${i}" aria-label="${t('a11y.auth.inviteEmail')} ${i + 1}">`).join('')}</div>${api.enabled ? '' : `<button class="btn btn-ghost btn-sm" style="align-self:flex-start" data-a="copyInviteLink">${ic('link', 13)}${t('page.auth.copyInviteLink')}</button>`}${nav(t('page.auth.sendInvites'), true)}`;
  if (st === 5) {
    const n = (o.invites || '').split(',').filter(x => x.includes('@')).length;
    body = `<div style="display:flex;justify-content:center"><span class="ftype ready-badge" style="--c:var(--green);width:48px;height:48px;border-radius:12px">${ic('circle-check', 22)}</span></div><h1>${t('page.auth.onb6Title')}</h1><p class="sub">${t('page.auth.onb6Sub')}</p>
    <div class="panel">${[
      ['building-2', t('page.auth.readyWorkspace', { name: esc(o.ws || t('page.auth.myWorkspace')) }), `${esc(api.host)}/w/${esc(o.url || 'workspace')}`],
      [
        TEMPLATES.find(tp => tp.id === o.tmpl)?.icon || 'folder',
        t('page.auth.readyProject', { name: esc(o.proj) }),
        t('page.auth.readyStarter', { n: TEMPLATES.find(tp => tp.id === o.tmpl)?.tasks || 0, view: t(VIEWS[o.team]) }),
      ],
      ['user-plus', n ? t('page.auth.invitesSent', { n: n }) : t('page.auth.noInvites'), n ? t('page.auth.invitesAppear') : t('page.auth.inviteAnytime')],
    ]
      .map(
        ([i, h1, h2]) =>
          `<div class="row ready-row" style="padding:12px 14px;border-top:1px solid var(--divider);gap:12px"><span class="ftype" style="--c:var(--accent)">${ic(i, 14)}</span><div class="grow"><div style="font-weight:500">${h1}</div><div class="faint" style="font-size:12px">${h2}</div></div><span class="ok" style="color:var(--green);display:inline-flex">${ic('check', 15)}</span></div>`,
      )
      .join('')}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="onbFinish">${t('page.auth.openWorkspace')}${ic('arrow-right', 15)}</button>`;
  }
  return authShell(
    `<div class="auth-card onb${S.ui.fx.step ? ' fx-step' : ''}" style="max-width:${st === 5 ? 440 : 560}px">
    <div class="steps" aria-label="${t('page.auth.stepOf', { n: st + 1, total: N })}">${Array.from({ length: N }, (_, i) => `<i class="${i <= st ? 'on' : ''} ${i === st ? 'cur' : ''}"></i>`).join('')}</div>
    <div class="faint" style="text-align:center;font-size:12px">${t('page.auth.stepOf', { n: st + 1, total: N })}</div>
    ${body}</div>`,
    `<button class="btn btn-ghost btn-sm" data-a="onbExit">${t('page.auth.exitSetup')}</button>`,
  );
}
