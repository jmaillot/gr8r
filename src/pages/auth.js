/* ---------------- AUTH ---------------- */
import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { brandLogo, ic } from '../core/icons.js';
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

/* One theme toggle for both shells, so the entry screens and the rest of the
   auth family share a single control (and a single data-a site). */
const themeToggle = () =>
  `<button class="ibtn" data-a="toggleDark" data-tip="${t('a11y.auth.toggleTheme')}" aria-label="${t('a11y.auth.toggleTheme')}">${ic(effectiveDark() ? 'sun' : 'moon', 16)}</button>`;
export function authShell(inner, topRight = '') {
  return `<div class="auth"><div class="auth-top"><div class="row">${topRight}${themeToggle()}</div></div>
    <div class="auth-c">${inner}</div>
    <div class="auth-foot" style="padding:18px;font-size:12px" ><span class="faint">${t('page.auth.legal')}</span></div></div>`;
}
/* ---------- the landing shell: split layout for the two entry screens ---------- */
/* Left: the brand panel — a fixed dark surface carrying the wordmark and an
   abstract board built from glass cards. It is decorative by construction:
   skeleton bars and status dots, no copy, so it needs no catalogue entry and
   reads the same in both themes. Right: the form column, which scrolls on its
   own so the panel never moves under the pointer. */
const abCard = (w1, w2, pill, av = false) =>
  `<div class="ab-card"><i class="ab-line" style="width:${w1}%"></i><i class="ab-line" style="width:${w2}%"></i><div class="ab-meta"><i class="ab-pill" style="--c:${pill}"></i>${av ? '<i class="ab-av"></i>' : ''}</div></div>`;
const abCol = (dot, cards) =>
  `<div class="ab-col"><div class="ab-h"><i class="ab-dot" style="--c:${dot}"></i><i class="ab-line" style="width:54px"></i></div>${cards}</div>`;
export const brandPanel = () => `<aside class="auth-panel">
    <div class="auth-panel-body">
      <p class="auth-panel-line">${t('page.auth.panelLine')}</p>
      <div class="ab-board" aria-hidden="true">
        ${abCol('var(--st-todo)', abCard(84, 58, 'var(--violet)', true) + abCard(70, 44, 'var(--amber)') + abCard(62, 38, 'var(--blue)'))}
        ${abCol('var(--st-progress)', abCard(76, 52, 'var(--teal)', true) + abCard(88, 40, 'var(--rose)') + abCard(66, 46, 'var(--violet)'))}
        ${abCol('var(--st-done)', abCard(68, 48, 'var(--green)', true) + abCard(52, 34, 'var(--blue)') + abCard(74, 42, 'var(--teal)'))}
      </div>
    </div>
  </aside>`;
/* The wordmark sits on top of the entry card, at the width the card allows: the
   lockup is 591×208, so it scales instead of being pinned to a fixed height. */
const cardLogo = () =>
  `<img class="auth-card-logo" src="/logo-${effectiveDark() ? 'dark' : 'light'}.svg" alt="${t('a11y.brand')}" width="591" height="208" />`;
/* `topRight` keeps its old meaning (the header's action), so the data-a / data-v
   contract of every entry screen is untouched. */
export function landingShell(inner, topRight = '') {
  return `<div class="auth auth-split">${brandPanel()}<main class="auth-main">
    <div class="auth-top"><span class="sp"></span><div class="row">${topRight}${themeToggle()}</div></div>
    <div class="auth-c">${inner}</div>
    <div class="auth-foot" style="padding:0 24px 20px;font-size:12px"><span class="faint">${t('page.auth.legal')}</span></div>
  </main></div>`;
}
export const ferr = k => (S.ui.errors[k] ? `<span class="err" id="${k}-err">${ic('circle-alert', 12)}${S.ui.errors[k]}</span>` : '');
export const icls = k => (S.ui.errors[k] ? 'is-error' : '');
/* Phase 30 (D-09/D-10): the Microsoft SSO entry renders ONLY when the server's
   /api/config ground truth says OIDC is enabled — never a client-side guess,
   and the false defaults keep it hidden until the config resolves. A real
   link (browser navigation) — the flow starts with a 302, not XHR. It is the
   only third-party sign-in: there is no Google/Apple button. */
export const ssoBtn = () =>
  api.oidcEnabled
    ? `<div class="social"><a class="btn btn-secondary btn-lg" href="/api/auth/oidc/start"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect width="6.4" height="6.4" fill="#F25022"/><rect x="7.6" width="6.4" height="6.4" fill="#7FBA00"/><rect y="7.6" width="6.4" height="6.4" fill="#00A4EF"/><rect x="7.6" y="7.6" width="6.4" height="6.4" fill="#FFB900"/></svg>${t('page.auth.continueMicrosoft')}</a></div>`
    : '';
export function renderAuth() {
  const s = S.ui.auth;
  const e = S.ui.errors;
  const f = S.ui.af || (S.ui.af = { email: '', name: '' });
  if (s === 'onboarding') return renderOnboarding();
  if (s === 'login') {
    /* D-07 client side: under SSO-only (server ground truth) the password
       form vanishes ENTIRELY — no disabled form, no explanatory message. */
    const ssoOnly = api.oidcSsoOnly;
    return landingShell(
      `<form class="auth-card auth-entry${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doLogin" novalidate>
    ${cardLogo()}
    ${e.login ? `<div class="alert danger" role="alert">${ic('circle-alert', 15)}<span>${esc(e.login)}</span></div>` : ''}
    ${ssoOnly ? '' : `<div class="auth-fields"><div class="field"><label class="label" for="l-email">${t('common.email')}</label><input class="input input-lg ${icls('email')}" id="l-email" type="email" value="${esc(f.email)}" autocomplete="email" aria-invalid="${!!e.email}" aria-describedby="email-err">${ferr('email')}</div>
    <div class="field"><div class="row"><label class="label" for="l-pw">${t('common.password')}</label><span class="sp"></span>${api.enabled ? '' : `<button type="button" class="link" style="font-size:12.5px" data-a="auth" data-v="forgot">${t('page.auth.forgotPassword')}</button>`}</div>
      <div class="inwrap"><input class="input input-lg ${icls('pw')}" id="l-pw" type="${S.ui.showPw ? 'text' : 'password'}" autocomplete="current-password" style="padding-right:38px" aria-invalid="${!!e.pw}"><button type="button" class="ibtn ibtn-sm" style="position:absolute;right:5px" data-a="toggleShowPw" aria-label="${S.ui.showPw ? t('page.auth.hidePw') : t('page.auth.showPw')}">${ic(S.ui.showPw ? 'eye-off' : 'eye', 15)}</button></div>${ferr('pw')}</div></div>
    <label class="row" style="font-size:13px;gap:8px;cursor:pointer"><input type="checkbox" class="check" id="l-rem" checked>${t('page.auth.rememberMe')}</label>
    <button class="btn btn-primary btn-lg btn-block" data-a="doLogin" id="login-btn">${t('page.auth.signIn')}</button>`}
    ${api.oidcEnabled ? `${ssoOnly ? '' : `<div class="or">${t('page.auth.or')}</div>`}${ssoBtn()}` : ''}
    ${api.enabled ? (api.allowSignup ? `<p class="auth-foot">${t('page.auth.noAccount')} <button type="button" class="link" data-a="auth" data-v="signup">${t('page.auth.signUp')}</button></p>` : `<p class="auth-foot">${t('page.auth.adminCreates')}</p>`) : `<p class="auth-foot">${t('page.auth.noAccount')} <button type="button" class="link" data-a="auth" data-v="signup">${t('page.auth.signUp')}</button></p>`}</form>`,
      api.enabled ? '' : `<button class="btn btn-ghost btn-sm" data-a="auth" data-v="signup">${t('page.auth.signUp')}</button>`,
    );
  }
  if (s === 'join') {
    const j = S.ui.join || {};
    if (j.error)
      return authShell(
        `<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--red);width:44px;height:44px;border-radius:11px">${ic('link', 20)}</span></div><h1>${t('page.auth.inviteUnavailable')}</h1><p class="sub">${esc(j.error)}</p><button class="btn btn-primary btn-lg btn-block" data-a="auth" data-v="login">${t('page.auth.goToSignIn')}</button></div>`,
      );
    // The address already has an account: joining means signing in, not signing up.
    if (j.existing)
      return authShell(
        `<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center">${brandLogo(96)}</div><h1>${t('page.auth.joinTitle', { name: esc(j.workspace?.name || D().ws.name) })}</h1><p class="sub">${t('page.auth.existingBody', { email: esc(j.email || t('page.auth.thisAddress')) })}</p>
    ${S.ui.errors.login ? `<div class="alert danger" role="alert">${ic('circle-alert', 15)}<span>${esc(S.ui.errors.login)}</span></div>` : ''}
    <button class="btn btn-primary btn-lg btn-block" data-a="auth" data-v="login">${ic('log-in', 15)}${t('page.auth.signInAndJoin')}</button>
    ${api.oidcEnabled ? `<div class="or">${t('page.auth.or')}</div>${ssoBtn()}` : ''}
    <p class="auth-foot">${t('page.auth.wrongAddress', { name: esc(j.workspace?.name || D().ws.name) })}</p></div>`,
      );
    const email = j.email || S.ui.af.email;
    return authShell(
      `<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doJoin" novalidate>
    <div style="display:flex;justify-content:center">${brandLogo(96)}</div><h1>${t('page.auth.joinTitle', { name: esc(j.workspace?.name || D().ws.name) })}</h1><p class="sub">${t('page.auth.joinSubtitle')}</p>
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
      `<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center">${brandLogo(96)}</div>
    <h1>${t('page.auth.noWorkspaceTitle')}</h1><p class="sub">${t('page.auth.noWorkspaceBody')}</p>
    <div class="panel" style="padding:12px 14px;display:flex;gap:10px;align-items:center">${ic('mail', 15)}<span class="muted" style="font-size:13px">${t('page.auth.signedInAs')} ${esc(api.user?.email || S.ui.af.email || t('page.auth.you'))}</span></div>
    <button class="btn btn-secondary btn-lg btn-block" data-a="signOut">${t('palette.signOut')}</button></div>`,
    );
  if (s === 'signup')
    return landingShell(
      `<form class="auth-card auth-entry${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doSignup" novalidate>
    <header class="auth-head">
      ${cardLogo()}
      <h1>${t('page.auth.createYourAccount')}</h1>
      ${api.enabled ? `<p class="sub">${t('page.auth.signupCloud')}</p>` : ''}
    </header>
    <div class="auth-fields">
      <div class="field"><label class="label" for="s-name">${t('common.fullName')}</label><input class="input input-lg ${icls('name')}" id="s-name" value="${esc(f.name)}" autocomplete="name" placeholder="Tanjim Islam">${ferr('name')}</div>
      <div class="field"><label class="label" for="s-email">${t('page.auth.workEmail')}</label><input class="input input-lg ${icls('email')}" id="s-email" type="email" value="" autocomplete="email" placeholder="you@company.com">${ferr('email')}</div>
      <div class="field"><label class="label" for="s-pw">${t('common.password')}</label><input class="input input-lg ${icls('pw')}" id="s-pw" type="password" data-in="pwStrength" value="${esc(S.ui.pwNew || '')}" autocomplete="new-password">${strengthMeter(S.ui.pwNew || '')}${ferr('pw') || `<span class="hint">${t('common.pwHint')}</span>`}</div>
    </div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doSignup" id="signup-btn">${t('page.auth.createAccount')}</button>
    ${api.oidcEnabled ? `<div class="or">${t('page.auth.or')}</div>${ssoBtn()}` : ''}
    <p class="hint auth-terms">${t('page.auth.termsNote')}</p>    <p class="auth-foot">${t('page.auth.haveAccount')} <button type="button" class="link" data-a="auth" data-v="login">${t('page.auth.signIn')}</button></p></form>`,
      `<button class="btn btn-ghost btn-sm" data-a="auth" data-v="login">${t('page.auth.logIn')}</button>`,
    );
  if (s === '2fa')
    return authShell(`<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doTfaLogin" novalidate>
    <div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--accent);width:44px;height:44px;border-radius:11px">${ic('shield-check', 20)}</span></div><h1>${t('page.auth.tfaTitle')}</h1><p class="sub">${t('page.auth.tfaSubtitle', { email: esc(S.ui.maskedEmail || '') })}</p>
    ${e.login ? `<div class="alert danger" role="alert">${ic('circle-alert', 15)}<span>${esc(e.login)}</span></div>` : ''}
    <div class="field"><label class="label" for="tfa-login-code">${t('page.auth.tfaCodeLabel')}</label><input class="input input-lg" id="tfa-login-code" autocomplete="one-time-code" inputmode="numeric" autofocus></div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doTfaLogin" id="tfa-login-btn">${t('page.auth.tfaVerify')}</button>
    <p class="auth-foot"><button type="button" class="link row" style="display:inline-flex;gap:6px" data-a="tfaBackToSignIn">${ic('arrow-left', 14)}${t('page.auth.backToSignIn')}</button></p></form>`);
  if (s === 'invitations')
    /* Phase 30 (D-06): a multi-invite SSO login lands here (/#invitations,
       session already minted) — surfaced, never mass-accepted. Each invite
       stays pending and remains reachable through its emailed /join/<token>
       link, so the honest surface points back at the inbox. */
    return authShell(
      `<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--accent);width:44px;height:44px;border-radius:11px">${ic('mail', 20)}</span></div><h1>${t('page.auth.invitationsTitle')}</h1><p class="sub">${t('page.auth.invitationsBody')}</p><button class="btn btn-secondary btn-lg btn-block" data-a="signOut">${t('palette.signOut')}</button></div>`,
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
    return authShell(`<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doReset" novalidate><div style="display:flex;justify-content:center">${brandLogo(96)}</div><h1>${t('page.auth.chooseNewPw')}</h1><p class="sub">${t('page.auth.for')} ${esc(f.email)}</p>
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
    <div class="field"><label class="label" for="o-url">${t('common.wsUrl')}</label><div class="row" style="gap:0"><span class="input input-lg" style="width:auto;background:var(--surface-2);border-right:0;border-radius:6px 0 0 6px;display:flex;align-items:center;color:var(--text-2)">${esc(api.host)}/w/</span><input class="input input-lg" id="o-url" value="${esc(o.url || '')}" data-in="onbUrl" style="border-radius:0 6px 6px 0" placeholder="projectsstudio"></div>${o.url ? `<span class="hint" style="display:flex;gap:4px;align-items:center">${ic('link', 12)}${t('page.auth.wsUrlHint')} ${esc(api.host)}/w/${esc(o.url)}</span>` : ''}</div>${nav()}`;
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
