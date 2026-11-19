/* The install banner (Phase 73, D-01..D-05) — a lazy feature chunk: the entry
   (main.js) carries only two window listeners and one boot-time pre-check;
   every render/detect/persist decision lives here.

   D-01: fixed bottom strip with an Install button and a dismiss X — not a
   toast, not inline. Mounted on document.body OUTSIDE the app root so a
   shell render() never wipes it. D-02: boot-only, event-driven — onBip is
   handed the captured beforeinstallprompt event; prompt() is called ONLY
   from the Install button's click handler (one shot per event: the reference
   is nulled immediately, prompt() twice is forbidden). D-04: suppressed on
   appinstalled, in standalone display mode, and on explicit dismissal.
   D-05: the X dismissal persists in localStorage under 'pwa.installDismissedAt'
   with a 14-day cooldown — per-browser, never the workspace doc, never
   server state. userChoice 'dismissed' hides without writing the key: that
   key is reserved for the explicit X dismissal.

   localStorage discipline (push.js convention): fail-absent reads, silently
   tolerant writes. The stored value is never rendered or interpolated — only
   compared against Date.now() (T-73-01: Number coercion with || 0 fallback). */
import { t } from '../core/i18n.js';
import { S } from '../core/store.js';
import { api } from '../core/api.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';

const KEY = 'pwa.installDismissedAt';
const COOLDOWN_MS = 14 * 864e5;
/* 73-IN-02 (D-77-11): the exit animation duration is ONE named constant.
   overlays.css derives the opacity transition from this module's CSS
   variable (--install-banner-exit-ms, set at mount) — no independent
   literal pairs the CSS and the JS anymore. */
export const EXIT_MS = 160;
/* 73-IN-04 (D-77-13): the pre-hydration rAF retry budget, in wall-clock
   milliseconds (≈ the 300-frame budget it replaces at 60fps). */
export const RETRY_BUDGET_MS = 5000;

/* The currently mounted strip (either flavour) — onInstalled() and the
   outcome handlers hide through this reference. */
let strip = null;
/* The flavour the current strip was mounted with (WR-02/73-REVIEW): tracked
   alongside `strip` so renderStrip() can distinguish "same flavour already
   mounted" (reuse) from "different flavour" (rebuild). Cleared with `strip`
   inside hide()'s removal timeout — never before the node is actually gone. */
let stripFlavour = null;
/* The captured beforeinstallprompt event: one shot per event (D-02). */
let deferred = null;

/* PURE (test seam): true when no active 14-day cooldown at nowMs (D-05). */
export function cooldownExpired(nowMs) {
  let v = 0;
  try {
    v = Number(localStorage.getItem(KEY)) || 0;
  } catch {
    /* storage blocked or absent key: no cooldown is assumed */
  }
  return nowMs - v > COOLDOWN_MS;
}

/* PURE (test seam): feature-based iOS detection (D-06, research Pitfall 4).
   Never timeout-based: no setTimeout/setInterval anywhere in the detection
   path. iPadOS 13+ reports platform 'MacIntel' — the maxTouchPoints clause
   catches it. */
export function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function standalone() {
  try {
    return matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/* Route/auth/demo/cooldown guard (D-03/D-04/D-05) — the same signals as
   main.js's 30s poll guard. Not exported: canShow() is decided inside the
   chunk, never by the entry. The guard reads through a live seam
   (push.js setPushWorkspace pattern) because api.enabled is getter-bound
   and the node harness pins it there. */
const defaultGuard = () => ({
  auth: S.ui.auth,
  enabled: api.enabled,
  path: (typeof location !== 'undefined' && location.pathname) || '/',
});
export let guardSource = defaultGuard;
export function setGuardSource(fn) {
  guardSource = fn || defaultGuard;
}
function canShow() {
  if (standalone()) return false; /* D-04 */
  const g = guardSource();
  if (g.auth) return false; /* login/join/auth screens (D-03) */
  if (!g.enabled) return false; /* demo mode (D-03) */
  if (/^\/join\//.test(g.path)) return false; /* join routes (D-03) */
  return cooldownExpired(Date.now());
}

/* Exit animation then remove (toast.js kill() shape). EXIT_MS (above) is
   the single source of truth for the exit duration — overlays.css derives
   its transition from the same constant via the CSS variable set at mount
   (73-IN-02; toast.js keeps its own literal — unifying it later must not
   foreclose on this constant). The strip/flavour references survive until
   the node is actually removed (WR-02): the DOM node stays live for the
   full animation, so the "is a strip mounted" check must stay true too. */
function hide(el) {
  el.classList.add('out');
  setTimeout(() => {
    el.remove();
    if (strip === el) {
      strip = null;
      stripFlavour = null;
    }
  }, EXIT_MS);
}

function writeCooldown() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked or full: the dismissal stays for the session only */
  }
}

/* Build and mount the strip on document.body (outside the app root).
   flavour 'cta': text + Install button + dismiss X (Chromium path).
   flavour 'ios': dismiss X + static one-line hint — NEVER an Install
   button, never a fake prompt (D-06). */
function renderStrip(flavour) {
  /* WR-02 flavour-aware early return: reuse only when the SAME flavour is
     already mounted; a different flavour rebuilds (the iOS hint must not
     inherit the Chromium strip's button and vice versa). */
  if (strip && stripFlavour === flavour) return strip;
  const el = document.createElement('div');
  el.className = 'install-banner';
  el.setAttribute('role', 'status');
  /* 73-IN-02: the CSS exit transition derives its duration from the JS
     constant — the variable is set at mount, so the stylesheet never
     carries an independent 160 literal. */
  el.style.setProperty('--install-banner-exit-ms', `${EXIT_MS}ms`);
  /* WR-01: the grow-span carries the dedicated hint key — never the CTA
     label duplicated above the Install button (D-77-8). */
  const text = flavour === 'ios' ? t('pwa.install.iosHint') : t('pwa.install.hint');
  el.innerHTML = `<span class="grow">${esc(text)}</span>`;
  if (flavour === 'cta') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary install-cta';
    btn.textContent = t('pwa.install.cta');
    /* The ONLY prompt() call site — inside a user-gesture click handler
       (research Pitfall 2). One shot per captured event. */
    btn.onclick = async () => {
      const ev = deferred;
      deferred = null;
      if (!ev) return hide(el);
      try {
        ev.prompt();
      } catch {
        return hide(el);
      }
      try {
        /* accepted and dismissed both hide (D-04); an unexpected outcome
           hides defensively too. Only the X writes the cooldown key.
           73-IN-01: exactly ONE hide on this path — the fall-through call
           below covers every outcome, so the catch must not hide again
           (a second hide would double-schedule the removal timeout). */
        await ev.userChoice;
      } catch {
        /* the fall-through hide() below runs for every outcome */
      }
      hide(el);
    };
    el.appendChild(btn);
  }
  const x = document.createElement('button');
  x.className = 'ibtn ibtn-xs';
  x.setAttribute('aria-label', t('a11y.dismiss'));
  x.innerHTML = ic('x', 13);
  x.onclick = () => {
    writeCooldown();
    hide(el);
  };
  el.appendChild(x);
  document.body.appendChild(el);
  strip = el;
  stripFlavour = flavour;
  return el;
}

/* Chromium captured the install event (D-02): store it, then defer the
   visibility decision past boot's hydration with a bounded
   requestAnimationFrame re-check budget — the SAME boot race checkIos()
   documents below (research Pitfall 6: the event can fire before the first
   render, and canShow() must not judge a login screen or an un-hydrated
   api.enabled). The guard decision retries across the frame budget while
   hydration is pending; once the signals are live the decision is final —
   no further frames are scheduled on any path (render, auth decline, or
   budget exhaustion), and canShow() alone judges standalone/cooldown/route. */
export function onBip(e) {
  deferred = e || null;
  if (!deferred) return; /* nothing captured: nothing scheduled */
  /* 73-IN-04: wall-clock retry budget — a 5s deadline measured with
     performance.now(), not a frame counter (frames ≠ time under a stalled
     or throttled rAF). The give-up path clears `deferred` (WR-02): a
     dropped capture must not linger as a stale one-shot reference. */
  const deadline = performance.now() + RETRY_BUDGET_MS;
  const attempt = () => {
    if (strip || !deferred) return; /* mounted, or onInstalled() nulled the event */
    const g = guardSource();
    if (g.auth) return; /* login/join screens: the decision is final (D-03) */
    if (!g.enabled) {
      /* boot still hydrating: retry within the wall-clock budget, never a timeout */
      if (performance.now() < deadline) requestAnimationFrame(attempt);
      else deferred = null;
      return;
    }
    if (canShow()) renderStrip('cta');
  };
  attempt();
}

/* Installed (D-04): hide unconditionally — belt + suspenders alongside the
   'accepted' outcome hide. */
export function onInstalled() {
  deferred = null;
  if (strip) hide(strip);
}

/* Boot-time iOS pre-check (D-06), called once from main.js at boot: on iOS
   neither beforeinstallprompt nor appinstalled ever fires, so without this
   call the hint strip would only ever render in test seams. Feature-based:
   iOS AND not standalone AND the route/cooldown guard passes → the static
   one-liner strip. Everything else (Firefox, unqualified Chromium, desktop)
   renders nothing and schedules nothing — total silence (D-07).

   Boot race (research Pitfall 6, same as onBip): the entry's
   bannerMod().then(m => m.checkIos()) can resolve BEFORE api.init() has
   set enabled — proven by e2e (plan 73-02) — so the guard decision retries
   across a bounded rAF budget while hydration is still pending
   (enabled false and no auth screen). Once the guard signals are live the
   decision is final: no further frames are scheduled on any path. */
export function checkIos() {
  if (!isIos() || standalone()) return;
  /* 73-IN-04: the same wall-clock budget as onBip (D-77-13) — the give-up
     path schedules nothing further; the boot-time pre-check leaves no
     residual state. */
  const deadline = performance.now() + RETRY_BUDGET_MS;
  const attempt = () => {
    if (strip || !isIos() || standalone()) return;
    const g = guardSource();
    if (g.auth) return; /* login/join screens: the decision is final (D-03) */
    if (!g.enabled) {
      /* boot still hydrating: retry within the wall-clock budget, never a timeout */
      if (performance.now() < deadline) requestAnimationFrame(attempt);
      else deferred = null;
      return;
    }
    if (canShow()) renderStrip('ios');
  };
  attempt();
}
