/* =====================================================================
   DST BOUNDARY MATRIX ON THE PURE CRON CONTRACT (Phase 90, plan 90-04,
   SC-4 half 1, D-90-18) — test/dst-cron-boundaries.test.mjs
   =====================================================================
   Direct-import pure suite — NO server boot (the test/backup-cron.test.mjs
   idiom). Pins the D-90-18 boundary contract of export/cron.js nextRunAt
   (export/cron.js:135 — the pure minute-scan with injectable clock) across
   BOTH zones and BOTH transition kinds for the 2026 AND 2027 transitions:

   - spring-forward (EU 2026-03-29 / 2027-03-28, US 2026-03-08 / 2027-03-14):
     a 02:30 daily cron does NOT fire on the transition day — the scan never
     observes the nonexistent local time and does NOT substitute 03:30; the
     next fire is the FOLLOWING day at 02:30 local.
   - fall-back (EU 2026-10-25 / 2027-10-31, US 2026-11-01 / 2027-11-07):
     the fire lands ON the transition day at 02:30 local. In the EU the
     transition is 03:00→02:00, so 02:30 occurs TWICE and the forward scan
     must pick the FIRST (earlier) occurrence (CEST 00:30Z, never the CET
     01:30Z one). In the US the transition is 02:00→01:00 — the ambiguous
     hour is 01:xx, so 02:30 occurs exactly once (post-transition EST
     07:30Z); the earlier-of-two semantics is pinned non-vacuously with an
     explicit 01:30 probe (first EDT occurrence 05:30Z, never the EST 06:30Z).
   - digest control (cron '0 8 * * *', the D-90-18 second half): fires
     normally ON every transition day at local 08:00.

   Every wall-time assertion reads through tz.js localParts (resolveTz +
   localParts, tz.js:28/:45) — NEVER UTC-offset math. The minute component
   is guaranteed by the cron field itself (the scanner returns an instant
   only when its local minute matches the minute set), so localParts'
   {date, hour} + the pinned UTC instant pin the wall time exactly.

   All expected instants were computed live through nextRunAt itself this
   session (the test asserts the CONTRACT, it does not re-derive cron math).
   Seeding: fromMs = the transition day's LOCAL midnight (the research
   Pitfall 5 warning — seeding from an already-past instant fires the
   previous day and masks the transition behavior; nextRunAt scans from
   fromMs + 1 minute, so the local-midnight seed covers the whole day).
   ===================================================================== */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextRunAt } from '../export/cron.js';
import { resolveTz, localParts } from '../tz.js';

/* ---------- the verified transition matrix (EU + US × 2026/2027) ---------- */

const SPRING_FORWARD = Object.freeze([
  { zone: 'Europe/Paris', day: '2026-03-29', seed: Date.parse('2026-03-28T23:00:00Z'), next: Date.parse('2026-03-30T00:30:00Z') },
  { zone: 'Europe/Paris', day: '2027-03-28', seed: Date.parse('2027-03-27T23:00:00Z'), next: Date.parse('2027-03-29T00:30:00Z') },
  { zone: 'America/New_York', day: '2026-03-08', seed: Date.parse('2026-03-08T05:00:00Z'), next: Date.parse('2026-03-09T06:30:00Z') },
  { zone: 'America/New_York', day: '2027-03-14', seed: Date.parse('2027-03-14T05:00:00Z'), next: Date.parse('2027-03-15T06:30:00Z') },
]);

const FALL_BACK = Object.freeze([
  { zone: 'Europe/Paris', day: '2026-10-25', seed: Date.parse('2026-10-24T22:00:00Z'), next: Date.parse('2026-10-25T00:30:00Z'), later: Date.parse('2026-10-25T01:30:00Z') },
  { zone: 'Europe/Paris', day: '2027-10-31', seed: Date.parse('2027-10-30T22:00:00Z'), next: Date.parse('2027-10-31T00:30:00Z'), later: Date.parse('2027-10-31T01:30:00Z') },
  { zone: 'America/New_York', day: '2026-11-01', seed: Date.parse('2026-11-01T04:00:00Z'), next: Date.parse('2026-11-01T07:30:00Z'), later: null },
  { zone: 'America/New_York', day: '2027-11-07', seed: Date.parse('2027-11-07T04:00:00Z'), next: Date.parse('2027-11-07T07:30:00Z'), later: null },
]);

/* US fall-back ambiguous-hour probe: 01:30 occurs TWICE (EDT then EST). */
const US_AMBIGUOUS = Object.freeze([
  { zone: 'America/New_York', day: '2026-11-01', seed: Date.parse('2026-11-01T04:00:00Z'), next: Date.parse('2026-11-01T05:30:00Z'), later: Date.parse('2026-11-01T06:30:00Z') },
  { zone: 'America/New_York', day: '2027-11-07', seed: Date.parse('2027-11-07T04:00:00Z'), next: Date.parse('2027-11-07T05:30:00Z'), later: Date.parse('2027-11-07T06:30:00Z') },
]);

/* Digest 08:00 control on every transition day (same local-midnight seeds). */
const DIGEST_CONTROL = Object.freeze([
  { zone: 'Europe/Paris', day: '2026-03-29', seed: Date.parse('2026-03-28T23:00:00Z'), next: Date.parse('2026-03-29T06:00:00Z') },
  { zone: 'Europe/Paris', day: '2026-10-25', seed: Date.parse('2026-10-24T22:00:00Z'), next: Date.parse('2026-10-25T07:00:00Z') },
  { zone: 'Europe/Paris', day: '2027-03-28', seed: Date.parse('2027-03-27T23:00:00Z'), next: Date.parse('2027-03-28T06:00:00Z') },
  { zone: 'Europe/Paris', day: '2027-10-31', seed: Date.parse('2027-10-30T22:00:00Z'), next: Date.parse('2027-10-31T07:00:00Z') },
  { zone: 'America/New_York', day: '2026-03-08', seed: Date.parse('2026-03-08T05:00:00Z'), next: Date.parse('2026-03-08T12:00:00Z') },
  { zone: 'America/New_York', day: '2026-11-01', seed: Date.parse('2026-11-01T04:00:00Z'), next: Date.parse('2026-11-01T13:00:00Z') },
  { zone: 'America/New_York', day: '2027-03-14', seed: Date.parse('2027-03-14T05:00:00Z'), next: Date.parse('2027-03-14T12:00:00Z') },
  { zone: 'America/New_York', day: '2027-11-07', seed: Date.parse('2027-11-07T04:00:00Z'), next: Date.parse('2027-11-07T13:00:00Z') },
]);

const wall = (zone, ms) => localParts(zone, new Date(ms));
const iso = ms => new Date(ms).toISOString();

/* ---------- spring-forward: no fire on the transition day, next day 02:30 local ---------- */

for (const c of SPRING_FORWARD) {
  test(`spring-forward ${c.zone} ${c.day}: the 02:30 cron does NOT fire that day — next fire is the following day 02:30 local (never 03:30)`, () => {
    assert.equal(resolveTz(c.zone), c.zone, 'the zone resolves canonically');
    const got = nextRunAt('30 2 * * *', c.zone, c.seed);
    assert.equal(got, c.next, `the next fire instant is ${iso(c.next)} (got ${iso(got)})`);
    /* Wall-time claims via localParts — never offset math. The next fire's
       local wall time is the FOLLOWING day at hour 02 (minute 30 rides the
       cron field); the transition day itself never sees a fire. */
    const lp = wall(c.zone, got);
    assert.notEqual(lp.date, c.day, `NO fire with a local time on the transition day ${c.day}`);
    assert.equal(lp.date, c.day === '2026-03-29' ? '2026-03-30'
      : c.day === '2027-03-28' ? '2027-03-29'
      : c.day === '2026-03-08' ? '2026-03-09' : '2027-03-15',
      `the next fire is ${lp.date} — the day AFTER the transition`);
    assert.equal(lp.hour, 2, `the next fire is 02:30 local on ${lp.date}`);
    /* The explicit anti-case: the scanner never substitutes the shifted
       03:30 for the nonexistent 02:30. */
    assert.notEqual(lp.hour, 3, 'the nonexistent 02:30 is never substituted with 03:30 local');
  });
}

/* ---------- fall-back: fires the FIRST (earlier) occurrence on the day ---------- */

for (const c of FALL_BACK) {
  const usOnce = c.zone === 'America/New_York';
  test(`fall-back ${c.zone} ${c.day}: the 02:30 cron fires ON the transition day at 02:30 local${usOnce ? ' (07:30Z — 02:30 occurs once; the US ambiguous hour is 01:xx)' : ' — the FIRST (earlier) of the two occurrences'}`, () => {
    const got = nextRunAt('30 2 * * *', c.zone, c.seed);
    assert.equal(got, c.next, `the fire instant is ${iso(c.next)} (got ${iso(got)})`);
    const lp = wall(c.zone, got);
    assert.equal(lp.date, c.day, `the fire lands on the fall-back day ${c.day}`);
    assert.equal(lp.hour, 2, `at 02:30 local on ${c.day}`);
    if (!usOnce) {
      /* EU: 02:30 occurs twice (CEST then CET) — the forward scan must meet
         the EARLIER one; the later CET occurrence is never picked. */
      assert.notEqual(got, c.later, 'the later (post-fall-back) occurrence is never picked');
    }
  });
}

/* US fall-back earlier-of-two semantics, non-vacuously: the ambiguous hour
   is 01:xx (transition 02:00 EDT → 01:00 EST), so 01:30 occurs twice and
   the scan must pick the FIRST (EDT) occurrence. */
for (const c of US_AMBIGUOUS) {
  test(`fall-back ${c.zone} ${c.day}: the 01:30 cron fires the FIRST (earlier EDT 05:30Z) of the two 01:30 occurrences`, () => {
    const got = nextRunAt('30 1 * * *', c.zone, c.seed);
    assert.equal(got, c.next, `the fire instant is ${iso(c.next)} (got ${iso(got)})`);
    const lp = wall(c.zone, got);
    assert.equal(lp.date, c.day, `the fire lands on the fall-back day ${c.day}`);
    assert.equal(lp.hour, 1, 'at 01:30 local');
    assert.notEqual(got, c.later, 'the later (EST) occurrence is never picked');
  });
}

/* ---------- digest control: 08:00 fires normally on EVERY transition day ---------- */

for (const c of DIGEST_CONTROL) {
  test(`digest control ${c.zone} ${c.day}: the 08:00 cron fires normally ON the transition day at local 08:00`, () => {
    const got = nextRunAt('0 8 * * *', c.zone, c.seed);
    assert.equal(got, c.next, `the fire instant is ${iso(c.next)} (got ${iso(got)})`);
    const lp = wall(c.zone, got);
    assert.equal(lp.date, c.day, `the digest fires on the transition day ${c.day} itself`);
    assert.equal(lp.hour, 8, `at local 08:00 on ${c.day} (D-90-18 second half)`);
  });
}
