/* =====================================================================
   test: pwa-banner — the install banner slice (Phase 73, PWA-04).

   Under test:
     - onBip captures the beforeinstallprompt event, defers the canShow()
       decision one rAF past hydration, renders the fixed-bottom strip and
       NEVER calls prompt() outside the Install button click handler
       (D-01/D-02, research Pitfall 2/6).
     - the Install click calls prompt() exactly once and hides on outcome
       'accepted' OR 'dismissed' — and 'dismissed' leaves the cooldown key
       untouched (that key is reserved for the explicit X dismissal, D-05).
     - the X dismissal writes pwa.installDismissedAt and a stored timestamp
       suppresses rendering for 14 days (cooldownExpired seam; D-05).
     - onInstalled() hides (D-04); standalone display mode suppresses
       rendering (D-04).
     - checkIos(): iOS UA + no captured event renders the iosHint-only
       strip (no Install button, nothing scheduled — D-06); Firefox UA
       renders nothing (D-07); iOS + standalone renders nothing (D-04
       beats D-06); iOS + active cooldown renders nothing.

   NOT under test: the real browser events (never fire in node/Playwright —
   stubbed events here; e2e stub lands in plan 02) and CSS.

   The browser modules read document/navigator/localStorage/window while
   they load, so every global is stubbed BEFORE the dynamic import —
   the stub order is load-bearing (browser-push.test.mjs precedent).
   ===================================================================== */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';
import { after, before, test } from 'node:test';
import { ROOT } from './helpers/server.mjs';

register(new URL('./helpers/virtual-icons-loader.mjs', import.meta.url));

/* ---------- global stubs (order matters) ---------- */

/* localStorage backed by a Map, so cooldown persistence is observable. */
const ls = new Map();
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

/* DOM element stand-in that TRACKS children/classes/removal — the banner's
   behaviour is asserted through the mounted strip, not storage alone. */
const fakeEl = tag => {
  const el = {
    tagName: tag,
    children: [],
    attrs: {},
    _classes: new Set(),
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    onclick: null,
    removed: false,
    classList: {
      add: c => el._classes.add(c),
      remove: c => el._classes.delete(c),
      toggle() {},
      contains: c => el._classes.has(c),
    },
    setAttribute(k, v) {
      el.attrs[k] = v;
    },
    removeAttribute() {},
    appendChild(c) {
      el.children.push(c);
      return c;
    },
    removeChild() {},
    remove() {
      el.removed = true;
    },
    addEventListener() {},
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
  };
  /* className assignment routes into the tracked class set */
  Object.defineProperty(el, 'className', {
    get: () => [...el._classes].join(' '),
    set: v => {
      el._classes.clear();
      for (const c of String(v).split(/\s+/)) if (c) el._classes.add(c);
    },
  });
  return el;
};

globalThis.document = {
  querySelectorAll: () => [],
  querySelector: () => fakeEl(),
  getElementById: () => fakeEl(),
  addEventListener: () => {},
  body: fakeEl('body'),
  title: '',
  hidden: false,
  documentElement: fakeEl(),
  activeElement: null,
  createElement: fakeEl,
};

let ua = 'node';
const setUA = u => {
  ua = u;
  setNav({ platform: 'Linux', userAgent: u, maxTouchPoints: 0 });
};
/* Per-test navigator override — the iPadOS case needs platform + touch
   overrides beyond the UA (research Pitfall 4). */
const setNav = props => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: 'Linux', userAgent: ua, maxTouchPoints: 0, ...props },
    configurable: true,
    writable: true,
  });
};
setUA('node');

let standaloneMatches = false;
globalThis.matchMedia = () => ({ matches: standaloneMatches, addEventListener() {}, addListener() {} });

globalThis.location = { pathname: '/' };

/* rAF is captured, not run: onBip defers its canShow() re-check one frame
   (research Pitfall 6), and tests pump the frame deterministically. */
const pendingFrames = [];
globalThis.requestAnimationFrame = fn => pendingFrames.push(fn);
const pumpFrame = () => {
  const fns = pendingFrames.splice(0);
  for (const fn of fns) fn();
};

globalThis.addEventListener = () => {};
globalThis.window = globalThis;
globalThis.CSS = globalThis.CSS || { escape: s => s };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.CustomEvent = class CustomEvent {
  constructor(type, opts) {
    this.type = type;
    this.detail = opts?.detail;
  }
};

const settle = (ms = 220) => new Promise(r => setTimeout(r, ms)); /* > the 160ms exit animation */

/* Stubbed beforeinstallprompt event: prompt() records exactly once and
   resolves userChoice with the configured outcome. */
function fakeBip(outcome = 'accepted') {
  const ev = {
    preventDefaultCount: 0,
    promptCalled: 0,
    preventDefault() {
      this.preventDefaultCount++;
    },
    prompt() {
      this.promptCalled++;
    },
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  };
  return ev;
}

const banner = () =>
  globalThis.document.body.children.find(c => c._classes.has('install-banner') && !c.removed);
const ctaBtn = el => el && el.children.find(c => c._classes.has('install-cta'));
const xBtn = el => el && el.children.find(c => c._classes.has('ibtn-xs'));

/* The module under test — dynamic import AFTER the stubs (store.js and the
   banner module both read document/navigator at eval time). */
const B = await import('../src/features/install-banner.js');
const { S } = await import('../src/core/store.js');

/* Per-test reset: pins the guard to "enabled app, no auth, root path"
   (api.enabled is getter-bound in the harness — the seam is the pin,
   same pattern as push.js setPushWorkspace), clears storage and DOM. */
async function reset({ enabled = true, auth = null, path = '/' } = {}) {
  /* unmount any strip left over from a previous test — the module keeps a
     `strip` reference, and renderStrip() early-returns while it is set. */
  B.onInstalled();
  await settle();
  ls.clear();
  globalThis.document.body = fakeEl('body');
  standaloneMatches = false;
  globalThis.location.pathname = path;
  S.ui.auth = auth;
  B.setGuardSource(() => ({ auth, enabled, path }));
  pendingFrames.length = 0;
}

/* ---------- onBip: render + prompt-from-gesture (D-01/D-02) ---------- */

test('onBip renders the strip on the first guard-resolved frame, without prompting', async () => {
  await reset();
  const ev = fakeBip('accepted');
  B.onBip(ev);
  /* the first attempt judges synchronously when the guards are already live
     (same shape as checkIos); the retry loop covers the pending case (CR-01) */
  assert.equal(ev.promptCalled, 0, 'prompt() is never called outside the click handler');
  pumpFrame();
  const el = banner();
  assert.ok(el, 'the strip renders after the deferred recheck');
  assert.equal(el.attrs.role, 'status');
  assert.ok(ctaBtn(el), 'the Chromium strip carries an Install button');
  assert.ok(xBtn(el), 'the strip carries a dismiss X');
  assert.equal(ev.promptCalled, 0);
  await settle();
});

test('the Install click calls prompt() exactly once from the gesture and hides on accepted', async () => {
  await reset();
  const ev = fakeBip('accepted');
  B.onBip(ev);
  pumpFrame();
  ctaBtn(banner()).onclick();
  await ev.userChoice;
  assert.equal(ev.promptCalled, 1, 'prompt() exactly once, from the click handler only');
  await settle();
  assert.equal(banner(), undefined, 'the strip hides on the accepted outcome');
  assert.equal(ls.has('pwa.installDismissedAt'), false, 'accepted never writes the cooldown key');
});

test("userChoice 'dismissed' hides the strip and leaves pwa.installDismissedAt untouched", async () => {
  await reset();
  const ev = fakeBip('dismissed');
  B.onBip(ev);
  pumpFrame();
  ctaBtn(banner()).onclick();
  await ev.userChoice;
  await settle();
  assert.equal(banner(), undefined, 'the strip hides on the dismissed outcome');
  assert.equal(ls.has('pwa.installDismissedAt'), false, 'dismissed writes NO cooldown key (D-05)');
});

/* ---------- X dismissal + 14-day cooldown (D-05) ---------- */

test('the X dismissal writes pwa.installDismissedAt and hides', async () => {
  await reset();
  B.onBip(fakeBip('accepted'));
  pumpFrame();
  const el = banner();
  const before = Date.now();
  xBtn(el).onclick();
  await settle();
  assert.ok(ls.has('pwa.installDismissedAt'), 'the explicit X writes the cooldown key');
  assert.ok(Number(ls.get('pwa.installDismissedAt')) >= before - 5, 'the key holds a timestamp');
  assert.equal(banner(), undefined);
});

test('a stored recent timestamp suppresses rendering; a backdated one (>14d) allows it', async () => {
  await reset();
  ls.set('pwa.installDismissedAt', String(Date.now()));
  B.onBip(fakeBip('accepted'));
  pumpFrame();
  assert.equal(banner(), undefined, 'active cooldown: no render');
  ls.set('pwa.installDismissedAt', String(Date.now() - 15 * 864e5));
  B.onBip(fakeBip('accepted'));
  pumpFrame();
  assert.ok(banner(), 'expired cooldown (15 days back): renders again');
  await settle();
});

test('cooldownExpired(nowMs) is a pure seam: absent key, fresh key, stale key', async () => {
  await reset();
  /* ONE captured clock base: the boundary assertions must not depend on two
     Date.now() reads landing in the same millisecond (the 73-VERIFICATION
     boundary flake at the old :273 line). */
  const base = Date.now();
  assert.equal(B.cooldownExpired(base + 864e5), true, 'absent key: no cooldown');
  ls.set('pwa.installDismissedAt', String(base));
  assert.equal(B.cooldownExpired(base + 864e5), false, 'fresh dismissal: cooldown active');
  assert.equal(B.cooldownExpired(base + 15 * 864e5), true, 'past the 14-day window');
  assert.equal(B.cooldownExpired(base + 14 * 864e5), false, 'exactly 14 days: still cooling');
  assert.equal(B.cooldownExpired(base + 14 * 864e5 + 1), true, '1 ms past the window: expired');
  ls.set('pwa.installDismissedAt', 'garbage');
  assert.equal(B.cooldownExpired(base + 864e5), true, 'garbage coerces via Number()||0 → 0 → no cooldown');
});

/* ---------- onInstalled + standalone suppression (D-04) ---------- */

test('onInstalled() hides the strip', async () => {
  await reset();
  B.onBip(fakeBip('accepted'));
  pumpFrame();
  assert.ok(banner());
  B.onInstalled();
  await settle();
  assert.equal(banner(), undefined);
});

test('standalone display mode: onBip renders nothing (D-04)', async () => {
  await reset();
  standaloneMatches = true;
  B.onBip(fakeBip('accepted'));
  pumpFrame();
  await settle();
  assert.equal(banner(), undefined);
});

test('auth screen: onBip renders nothing (D-03)', async () => {
  await reset({ auth: 'login' });
  B.onBip(fakeBip('accepted'));
  pumpFrame();
  await settle();
  assert.equal(banner(), undefined);
});

test('demo mode (api disabled): onBip renders nothing (D-03)', async () => {
  await reset({ enabled: false });
  B.onBip(fakeBip('accepted'));
  pumpFrame();
  await settle();
  assert.equal(banner(), undefined);
});

test('join route: onBip renders nothing (D-03)', async () => {
  await reset({ path: '/join/abcdefghijklmnop/' });
  B.onBip(fakeBip('accepted'));
  pumpFrame();
  await settle();
  assert.equal(banner(), undefined);
});

/* ---------- onBip pre-hydration retry (CR-01 closure, plan 73-03) ----------
   The real Chromium race: beforeinstallprompt fires BEFORE /api/boot
   hydration resolves, so api.enabled is still false on the first frames.
   onBip must retry across a bounded rAF budget — the same shape checkIos()
   already ships — and decide ONCE once the guards resolve. */

test('onBip during boot hydration retries frames and renders once enabled resolves (CR-01)', async () => {
  await reset({ enabled: false });
  /* the guard reports enabled:false for the first 5 reads, then hydration
     "lands" — well inside the 300-frame budget the implementation ships */
  let reads = 0;
  B.setGuardSource(() => ({ auth: null, enabled: ++reads > 5, path: '/' }));
  const ev = fakeBip('accepted');
  B.onBip(ev);
  assert.equal(banner(), undefined, 'nothing renders while api.init() is still pending');
  assert.equal(pendingFrames.length, 1, 'a retry frame is scheduled — frame-based, never a timeout');
  /* pump well past the flip point: the one-shot implementation would have
     already declined on its single early frame and never renders */
  for (let i = 0; i < 10; i++) pumpFrame();
  const el = banner();
  assert.ok(el, 'the strip renders once enabled flips true (bounded retry, not one-shot)');
  assert.ok(ctaBtn(el), 'the Chromium strip carries an Install button');
  assert.equal(ev.promptCalled, 0);
  await settle();
});

test('onBip decides once: no further frames are scheduled after the strip renders', async () => {
  await reset();
  B.onBip(fakeBip('accepted'));
  pumpFrame();
  assert.ok(banner(), 'the strip rendered');
  for (let i = 0; i < 20; i++) pumpFrame();
  const count = globalThis.document.body.children.filter(c => c._classes.has('install-banner')).length;
  assert.equal(count, 1, 'no second strip mounts after additional frames');
  assert.equal(pendingFrames.length, 0, 'the decision scheduled no further frames');
  await settle();
});

test('auth screen decline is final: onBip renders nothing even after auth clears later (D-03)', async () => {
  await reset({ auth: 'login' });
  B.onBip(fakeBip('accepted'));
  for (let i = 0; i < 5; i++) pumpFrame();
  assert.equal(banner(), undefined, 'no render on the auth screen');
  /* auth flips false later — the decline stays final, mirroring checkIos */
  B.setGuardSource(() => ({ auth: null, enabled: true, path: '/' }));
  for (let i = 0; i < 5; i++) pumpFrame();
  assert.equal(banner(), undefined, 'the auth decline is final — no late render');
  await settle();
});

/* ---------- checkIos: feature-based degradation (D-06/D-07) ---------- */

test('checkIos with an iPhone UA and no captured event renders the iosHint strip — no button, nothing scheduled', async () => {
  await reset();
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
  B.checkIos();
  const el = banner();
  assert.ok(el, 'the iOS strip renders at boot');
  assert.ok(el.innerHTML.includes('pwa.install.iosHint') === false, 'no raw key leaks');
  assert.ok(!ctaBtn(el), 'the iOS strip NEVER carries an Install button (D-06)');
  assert.ok(xBtn(el), 'the iOS strip carries the dismiss X');
  await settle();
  assert.ok(banner(), 'the strip stays mounted (no self-removal scheduled)');
  B.onInstalled();
  await settle();
});

test('checkIos with a Firefox UA renders nothing (D-07)', async () => {
  await reset();
  setUA('Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0');
  B.checkIos();
  await settle();
  assert.equal(banner(), undefined, 'Firefox gets total silence');
});

test('checkIos with iOS UA + standalone matches:true renders nothing (D-04 beats D-06)', async () => {
  await reset();
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
  standaloneMatches = true;
  B.checkIos();
  await settle();
  assert.equal(banner(), undefined);
});

test('checkIos with iOS UA + active cooldown renders nothing (D-05 beats D-06)', async () => {
  await reset();
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
  ls.set('pwa.installDismissedAt', String(Date.now()));
  B.checkIos();
  await settle();
  assert.equal(banner(), undefined);
});

/* ---------- degradation matrix hardening (plan 02, D-06/D-07) ---------- */

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

test('checkIos invoked the way main.js invokes it at boot renders the iosHint strip (D-06 runtime shape)', async () => {
  await reset();
  setUA(IOS_UA);
  /* The entry's exact boot shape: bannerMod().then(m => m.checkIos()) — a
     promise-resolution hop sits between boot and the render. */
  await Promise.resolve(B).then(m => m.checkIos());
  const el = banner();
  assert.ok(el, 'the strip renders through the promise-hop invocation');
  assert.ok(!ctaBtn(el), 'no Install button on the iOS path (D-06)');
  assert.ok(xBtn(el), 'the dismiss X is present');
  B.onInstalled();
  await settle();
});

test('checkIos during boot hydration (enabled false) retries frames and renders once the guard resolves', async () => {
  await reset({ enabled: false });
  setUA(IOS_UA);
  B.checkIos();
  assert.equal(banner(), undefined, 'nothing renders while api.init() is still pending');
  assert.equal(pendingFrames.length, 1, 'one retry frame is scheduled — frame-based, never a timeout');
  /* hydration lands: flip the guard seam in place (reset() would clear the
     scheduled retry frames) and pump — the strip mounts as soon as it does */
  B.setGuardSource(() => ({ auth: null, enabled: true, path: '/' }));
  pumpFrame();
  const el = banner();
  assert.ok(el, 'the strip renders once enabled flips true');
  assert.ok(!ctaBtn(el), 'still no Install button');
  B.onInstalled();
  await settle();
});

test('iPadOS 13+ (MacIntel + maxTouchPoints > 1) renders the same iOS strip (Pitfall 4)', async () => {
  await reset();
  setNav({
    platform: 'MacIntel',
    maxTouchPoints: 5,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  });
  assert.equal(B.isIos(), true, 'the MacIntel+touch clause catches iPadOS');
  B.checkIos();
  const el = banner();
  assert.ok(el, 'the iOS strip renders for iPadOS');
  assert.ok(!ctaBtn(el), 'no Install button on the iPadOS path');
  B.onInstalled();
  await settle();
});

test('Firefox: isIos() false, no render side effect, nothing scheduled (D-07)', async () => {
  await reset();
  setUA('Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0');
  assert.equal(B.isIos(), false, 'Firefox is never feature-detected as iOS');
  const framesBefore = pendingFrames.length;
  B.checkIos();
  assert.equal(banner(), undefined, 'no render side effect');
  assert.equal(pendingFrames.length, framesBefore, 'no rAF scheduled by the Firefox path');
  await settle();
  assert.equal(banner(), undefined, 'still nothing after the animation window');
});

test('the iOS strip honors the shared suppression: its dismiss X writes the cooldown and checkIos() stays silent', async () => {
  await reset();
  setUA(IOS_UA);
  B.checkIos();
  const el = banner();
  assert.ok(el, 'the iOS strip renders first');
  xBtn(el).onclick();
  await settle();
  assert.ok(ls.has('pwa.installDismissedAt'), 'the iOS X dismissal writes the SAME cooldown key (D-05)');
  assert.equal(banner(), undefined, 'the strip hides');
  B.checkIos();
  await settle();
  assert.equal(banner(), undefined, 'a re-checkIos() during the cooldown renders nothing');
});

/* ---------- static contract pins ---------- */

test('main.js wires the banner through the [73-01] lazy-import block only', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(/\/\* \[73-01\]/.test(main), 'the banner block carries the [73-01] comment tag');
  assert.ok(main.includes("import('./features/install-banner.js')"), 'the banner rides a lazy import()');
  assert.ok(main.includes("addEventListener('beforeinstallprompt'"), 'the entry captures beforeinstallprompt');
  assert.ok(main.includes("addEventListener('appinstalled'"), 'the entry captures appinstalled');
  assert.ok(main.includes('m.onBip(e)') && main.includes('m.onInstalled()'), 'the listeners delegate to the module');
  assert.ok(main.includes('m.checkIos()'), 'one boot-time iOS pre-check call (D-06)');
  assert.ok(
    main.includes('bannerMod().then(m => m.checkIos())'),
    'the boot-time call is the exact bannerMod().then(m => m.checkIos()) shape (D-06 runtime reachability, plan-02 pin)',
  );
  assert.ok(!main.includes('pwa.install'), 'no banner strings in the entry (D-09)');
  assert.ok(!main.includes('installDismissedAt'), 'no cooldown key in the entry (D-09)');
});

test('the banner module carries the pure seams and the cooldown contract', () => {
  const mod = fs.readFileSync(new URL('../src/features/install-banner.js', import.meta.url), 'utf8');
  for (const exp of ['export function onBip(', 'export function onInstalled(', 'export function checkIos(', 'export function isIos(', 'export function cooldownExpired('])
    assert.ok(mod.includes(exp), `missing export: ${exp}`);
  assert.ok(mod.includes('pwa.installDismissedAt'), 'the cooldown key lives in the chunk');
  assert.ok(mod.includes('14 * 864e5'), 'the 14-day window is explicit');
  assert.ok(mod.includes('document.body.appendChild'), 'body-level mount, outside the app root (A1)');
  assert.ok(mod.includes("(display-mode: standalone)"), 'standalone detection present');
  /* the ONLY prompt() call site is the Install click handler */
  const promptSites = mod.match(/\.prompt\(\)/g) || [];
  assert.equal(promptSites.length, 1, 'exactly one prompt() call site in the module');
  assert.ok(/btn\.onclick[\s\S]*?\.prompt\(\)/.test(mod), 'that site is inside the Install button click handler');
});

test('both locale files catalogue the banner keys in the same commit (D-08)', () => {
  for (const f of ['en.json', 'fr.json']) {
    const cat = JSON.parse(fs.readFileSync(new URL(`../src/locales/${f}`, import.meta.url), 'utf8'));
    assert.ok(typeof cat['pwa.install.cta'] === 'string' && cat['pwa.install.cta'], `${f}: pwa.install.cta present`);
    assert.ok(typeof cat['pwa.install.iosHint'] === 'string' && cat['pwa.install.iosHint'], `${f}: pwa.install.iosHint present`);
    assert.ok(cat['a11y.dismiss'], `${f}: a11y.dismiss exists for the X aria-label`);
  }
});

/* ---------- build contract: the D-09 lazy chunk + entry delta ----------
   Proven on the REAL bundle, the build-chunk-size.test.mjs way: the suite
   runs the same `vite build` CI runs, into a temporary out directory, and
   asserts on the produced bytes. Nothing is written into dist/. */

const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
/* The D-09 entry-delta budget: the entry chunk may grow by at most 200
   bytes over the pinned pre-banner baseline. */
const MAX_ENTRY_DELTA = 200;

let outDir = null;
let buildErr = '';

before(() => {
  try {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-banner-gate-'));
    const result = spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', outDir, '--emptyOutDir'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      buildErr = `the vite build failed\n${result.stdout || ''}\n${result.stderr || ''}`;
      outDir = null;
    }
  } catch (e) {
    buildErr = String(e);
    outDir = null;
  }
});

after(() => {
  if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

/* Every .js chunk under assets/, with its real byte size on disk. */
function builtChunks() {
  const dir = path.join(outDir, 'assets');
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.js'))
    .sort()
    .map(name => ({ name, bytes: fs.statSync(path.join(dir, name)).size }));
}

test('a real vite build emits exactly one lazy install-banner chunk (D-09)', () => {
  assert.equal(buildErr, '', buildErr || 'build ok');
  const hits = builtChunks().filter(c => /install-banner/.test(c.name));
  assert.equal(hits.length, 1, `exactly one install-banner chunk expected, got:\n${hits.map(c => c.name).join('\n') || '(none)'}`);
});

test('the entry chunk grew by at most 200 bytes over the pre-banner baseline (D-09)', () => {
  assert.equal(buildErr, '', buildErr || 'build ok');
  const baseline = JSON.parse(
    fs.readFileSync(new URL('./fixtures/banner-entry-baseline.json', import.meta.url), 'utf8'),
  );
  const entry = builtChunks().filter(c => /^index-/.test(c.name));
  assert.ok(entry.length === 1, `one index-* entry chunk expected:\n${entry.map(c => c.name).join('\n')}`);
  const delta = entry[0].bytes - baseline.baseline;
  assert.ok(
    delta <= MAX_ENTRY_DELTA,
    `entry delta ${delta} bytes exceeds the ${MAX_ENTRY_DELTA}-byte budget ` +
      `(entry ${entry[0].bytes} vs baseline ${baseline.baseline}) — the banner must stay in the lazy chunk`,
  );
});
