/* Phase 60 gap closure (60-03): regression tests for CR-01 and WR-01 in
   src/pages/dashboard.js — the REAL client module loaded through
   dashboard-client-loader.mjs (only its browser-touching transitive imports
   are stubbed).

   CR-01: a failed window-switch fetch must not re-kick fill() on every
   render — the window is claimed up-front and the kick guard checks the
   error state. Pre-fix: one api.dashboard call per render (ping-pong).
   Post-fix: exactly one.

   WR-01: the 30 s poll must survive route exit/re-entry with cached data.
   Pre-fix: startPoll() runs only while loading, so the poll stays dead
   after the first route exit. Post-fix: `if (!timer) startPoll()`. */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { mock, test } from 'node:test';

register(new URL('./helpers/dashboard-client-loader.mjs', import.meta.url), import.meta.url);

const { pageDashboard } = await import('../src/pages/dashboard.js');
const { S } = await import('../src/core/store.js');
const { ROUTE_TEARDOWN } = await import('../src/shell/render.js');

/* Deterministic async flush: let the awaited api.dashboard settle and the
   follow-up render() run. */
const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

const PANELS = { overdue: [], load: [], upcoming: [], activity: [] };

let calls;
function reset(opts = {}) {
  ROUTE_TEARDOWN.dashboard?.(); // clear any poll left by a previous test
  S.ui = {};
  calls = 0;
  globalThis.__renders = 0;
  globalThis.__apiDashboard = async () => {
    calls++;
    return opts.res ?? { ok: true, data: PANELS };
  };
}

test('window-switch fetch failure stops the fetch kick after one attempt (CR-01 regression)', async () => {
  reset({ res: { ok: false, status: 0 } });
  /* Cached data from an earlier visit; the user has switched 7d → 24h. */
  S.ui.dashData = PANELS;
  S.ui.dashDataWindow = '7d';
  S.ui.dashWindow = '24h';
  S.ui.route = 'dashboard';

  for (let i = 0; i < 6; i++) {
    pageDashboard();
    await flush();
  }
  assert.equal(calls, 1, `exactly ONE api.dashboard call across 6 renders (got ${calls})`);
});

test('a failed window-switch fetch surfaces the error state exactly once per attempt', async () => {
  reset({ res: { ok: false, status: 0 } });
  S.ui.dashData = PANELS;
  S.ui.dashDataWindow = '7d';
  S.ui.dashWindow = '24h';
  S.ui.route = 'dashboard';

  pageDashboard();
  await flush();
  assert.ok(S.ui.dashErr, 'dashErr set on failure');
  assert.equal(S.ui.dashErr.status, 0, 'status 0 (network error) still lands a truthy error OBJECT');
  /* status 0 is falsy — the keyed fullstates must NOT swallow the panels */
  const html = pageDashboard();
  assert.ok(html.includes('grid2'), 'cached panels still render (no fullstate hijack)');
  assert.equal(globalThis.__renders, 1, 'exactly one render bump from the failed fill');
  assert.equal(calls, 1, 'no second fetch attempt');
});

test('route exit clears the poll timer and re-entry restarts it with cached data (WR-01 regression, D-05)', async () => {
  reset();
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    S.ui.route = 'dashboard';
    /* First visit: fill lands (skeleton → data). */
    pageDashboard();
    await flush();
    assert.equal(calls, 1);

    /* Route exit: teardown clears the timer. */
    ROUTE_TEARDOWN.dashboard();
    S.ui.route = 'home';

    /* Re-entry with cached data: loading=false, dashDataWindow===w. */
    S.ui.route = 'dashboard';
    pageDashboard();
    await flush();

    mock.timers.tick(30000); // one 30 s poll tick
    await flush();
    assert.equal(calls, 2, 'a fresh api.dashboard fires on the first poll tick after re-entry');

    /* Exit again: the timer must be gone. */
    ROUTE_TEARDOWN.dashboard();
    mock.timers.tick(60000);
    await flush();
    assert.equal(calls, 2, 'no poll fires after route exit');
  } finally {
    mock.timers.reset();
  }
});

test('repeated entry/exit cycles never stack poll intervals', async () => {
  reset();
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    S.ui.route = 'dashboard';
    pageDashboard();
    await flush();
    for (let i = 0; i < 3; i++) {
      ROUTE_TEARDOWN.dashboard();
      S.ui.route = i % 2 ? 'home' : 'dashboard';
      pageDashboard();
      await flush();
    }
    ROUTE_TEARDOWN.dashboard(); // leave
    S.ui.route = 'dashboard';
    pageDashboard(); // enter again
    await flush();
    mock.timers.tick(30000);
    await flush();
    assert.equal(calls, 2, 'exactly ONE poll tick fires — 3 cycles never stacked intervals');
  } finally {
    mock.timers.reset();
    ROUTE_TEARDOWN.dashboard?.();
  }
});
