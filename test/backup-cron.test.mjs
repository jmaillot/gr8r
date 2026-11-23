/* =====================================================================
   Cron evaluator grammar matrix (Phase 87, plan 87-01, BKBCK-03 core).

   Direct-import unit suite — no server boot (the test/settings-tz-
   combobox.test.mjs precedent for a pure root-level module). Pins the
   FULL 5-field grammar of export/cron.js:
   - per-field star / lists / ranges / steps and range-steps;
   - field range validation (malformed → parseCron null, never a crash);
   - vixie dom/dow OR when both restricted, single-restricted wins;
   - dow 0-7 with 0=7=Sunday;
   - DST: spring-forward skips the nonexistent wall time (the next match
     is the following day's), fall-back picks the EARLIER ambiguous
     instant — fresh Intl formatter per evaluation, never cached offsets;
   - bounded horizon (~366 days of minutes, MAX_SCAN_MINUTES=527040):
     a cron matching nothing inside the horizon returns null, documented.
   ===================================================================== */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextRunAt, parseCron } from '../export/cron.js';

/* ---------- parseCron: grammar acceptance ---------- */

test('parseCron accepts the full grammar: star, steps, lists, ranges, range-steps, dow-0', () => {
  const all = parseCron('* * * * *');
  assert.ok(all, '* * * * * parses');
  assert.equal(all.minute.size, 60);
  assert.equal(all.hour.size, 24);
  assert.equal(all.mon.size, 12);

  const mixed = parseCron('*/15 2,6 1-5 3 0');
  assert.ok(mixed, 'steps/lists/ranges/dow-0 parse');
  assert.deepEqual([...mixed.minute].sort((a, b) => a - b), [0, 15, 30, 45]);
  assert.deepEqual([...mixed.hour].sort((a, b) => a - b), [2, 6]);
  assert.deepEqual([...mixed.dom].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.deepEqual([...mixed.mon], [3]);
  assert.deepEqual([...mixed.dow], [0]);
  assert.deepEqual([...parseCron('0 0 1-15/2 * *').dom], [1, 3, 5, 7, 9, 11, 13, 15], 'range-steps land');
});

test('parseCron refuses malformed expressions with null (61/24/non-numeric/4-fields)', () => {
  for (const bad of ['61 * * * *', '* 24 * * *', 'a b c d e', '* * * *', '', '* * * * * *', '*/0 * * * *', '1-60 * * * *', '5/10 * * * *', '30-15 * * * *']) {
    assert.equal(parseCron(bad), null, `malformed refused: ${JSON.stringify(bad)}`);
  }
});

/* ---------- nextRunAt: DST contract ---------- */

/* 2026 DST: spring-forward Sun 2026-03-29 02:00→03:00 CET→CEST;
   fall-back Sun 2026-10-25 03:00→02:00 CEST→CET. */

test('spring-forward: 02:30 is nonexistent on the shift day → the next match is the following day 02:30 CEST', () => {
  /* ref = 2026-03-29 01:15 CET = 00:15 UTC */
  const got = nextRunAt('30 2 * * *', 'Europe/Paris', Date.UTC(2026, 2, 29, 0, 15));
  /* 2026-03-30 02:30 CEST = 00:30 UTC */
  assert.equal(got, Date.UTC(2026, 2, 30, 0, 30), `got ${new Date(got)?.toISOString?.() ?? got}`);
});

test('fall-back: ambiguous 02:30 picks the EARLIER valid instant (CEST occurrence)', () => {
  /* ref = 2026-10-25 02:10 CEST = 00:10 UTC */
  const got = nextRunAt('30 2 * * *', 'Europe/Paris', Date.UTC(2026, 9, 25, 0, 10));
  /* first 02:30 = CEST occurrence = 00:30 UTC (the CET one would be 01:30 UTC) */
  assert.equal(got, Date.UTC(2026, 9, 25, 0, 30), `got ${new Date(got)?.toISOString?.() ?? got}`);
});

test('plain daily fire is minute-exact in a plain zone window', () => {
  const got = nextRunAt('30 2 * * *', 'Europe/Paris', Date.UTC(2026, 0, 1, 0, 0)); // 01:00 CET
  assert.equal(got, Date.UTC(2026, 0, 1, 1, 30)); // 02:30 CET
});

/* ---------- nextRunAt: dom/dow semantics ---------- */

test('both restricted → vixie OR: any Friday OR the 13th fires first (Friday Jan 2, 2026)', () => {
  /* 2026-01-01 is a Thursday; 2026-01-02 is a Friday */
  const got = nextRunAt('0 0 13 * 5', 'Europe/Paris', Date.UTC(2025, 11, 31, 23, 0)); // 2026-01-01 00:00 CET
  assert.equal(got, Date.UTC(2026, 0, 1, 23, 0), `got ${new Date(got)?.toISOString?.() ?? got}`); // 2026-01-02 00:00 CET
});

test('both restricted OR: any Friday fires, not only Friday-the-13ths (first Friday after Feb 1 = Feb 6)', () => {
  const got = nextRunAt('0 0 13 * 5', 'Europe/Paris', Date.UTC(2026, 1, 1, 0, 0)); // 2026-02-01 00:00 CET
  assert.equal(got, Date.UTC(2026, 1, 5, 23, 0), `got ${new Date(got)?.toISOString?.() ?? got}`); // 2026-02-06 00:00 CET
});

test('dom-only restricted wins: the 13th of the month regardless of weekday', () => {
  const got = nextRunAt('0 0 13 * *', 'Europe/Paris', Date.UTC(2026, 0, 1, 0, 0));
  assert.equal(got, Date.UTC(2026, 0, 12, 23, 0)); // 2026-01-13 00:00 CET
});

test('dow-only restricted wins: any Friday', () => {
  const got = nextRunAt('0 0 * * 5', 'Europe/Paris', Date.UTC(2026, 0, 1, 0, 0));
  assert.equal(got, Date.UTC(2026, 0, 1, 23, 0)); // 2026-01-02 00:00 CET
});

test('dow 7 ≡ 0 (Sunday): 0 0 * * 7 fires the next Sunday', () => {
  const got = nextRunAt('0 0 * * 7', 'Europe/Paris', Date.UTC(2026, 0, 1, 0, 0)); // Thu Jan 1
  assert.equal(got, Date.UTC(2026, 0, 3, 23, 0), `got ${new Date(got)?.toISOString?.() ?? got}`); // Sun Jan 4 00:00 CET
  assert.equal(nextRunAt('0 0 * * 0', 'Europe/Paris', Date.UTC(2026, 0, 1, 0, 0)), got, 'dow 0 and dow 7 are the same day');
});

/* ---------- nextRunAt: bounded horizon ---------- */

test('leap day fires on the next Feb 29 within the horizon (2028-02-29 from Jan 2028)', () => {
  const got = nextRunAt('0 0 29 2 *', 'Europe/Paris', Date.UTC(2028, 0, 1, 0, 0));
  assert.equal(got, Date.UTC(2028, 1, 28, 23, 0), `got ${new Date(got)?.toISOString?.() ?? got}`); // 2028-02-29 00:00 CET
});

test('a cron matching nothing inside the bounded horizon returns null (leap day queried far from any Feb 29)', () => {
  /* Next Feb 29 after 2026-03-01 is 2028-02-29 — ~700 days away, beyond the
     ~366-day cap → documented null, never an infinite scan. */
  assert.equal(nextRunAt('0 0 29 2 *', 'Europe/Paris', Date.UTC(2026, 2, 1, 0, 0)), null);
});

/* =====================================================================
   Phase 92 (D-04) — describeCron: the structured cron descriptor.
   Derived from parseCron output ONLY (field sets + restriction flags) —
   no regex on the raw string, no server-side translated strings (the
   client localizes via t() keys in Phase 94). `custom` renders the raw
   expression honestly and carries NO weekday/hour/minute fields.
   ===================================================================== */
import { describeCron } from '../export/cron.js';

test('describeCron: daily — unrestricted dom+dow, singleton hour and minute', () => {
  assert.deepEqual(describeCron('0 3 * * *'), { kind: 'daily', hour: 3, minute: 0, raw: '0 3 * * *' });
});

test('describeCron: weekly — dow-only restricted with singleton dow', () => {
  assert.deepEqual(describeCron('0 0 * * 1'), { kind: 'weekly', weekday: 1, hour: 0, minute: 0, raw: '0 0 * * 1' });
});

test('describeCron: monthly — dom-only restricted (singleton dom), dow unrestricted', () => {
  assert.deepEqual(describeCron('0 4 1 * *'), { kind: 'monthly', hour: 4, minute: 0, raw: '0 4 1 * *' });
});

test('describeCron: yearly — singleton dom AND singleton mon', () => {
  assert.deepEqual(describeCron('0 5 1 1 *'), { kind: 'yearly', hour: 5, minute: 0, raw: '0 5 1 1 *' });
});

test('describeCron: custom — multi-value minute set, weekday/hour/minute ABSENT', () => {
  const got = describeCron('*/15 * * * *');
  assert.equal(got.kind, 'custom');
  assert.equal(got.raw, '*/15 * * * *');
  assert.equal('weekday' in got, false);
  assert.equal('hour' in got, false);
  assert.equal('minute' in got, false);
});

test('describeCron: custom — dow range is not singleton', () => {
  const got = describeCron('0 6 * * 1-5');
  assert.deepEqual(got, { kind: 'custom', raw: '0 6 * * 1-5' });
});

test('describeCron: honest custom fallback for a malformed expression', () => {
  assert.deepEqual(describeCron('not a cron'), { kind: 'custom', raw: 'not a cron' });
});
