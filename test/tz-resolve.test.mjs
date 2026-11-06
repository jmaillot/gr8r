/* Timezone funnel contract pins (Phase 44, D-05/D-07/D-08).
   Unit tests over the exported resolveTz funnel + TZ_BY_LABEL map — no
   server, no DB. The funnel is the single label→zone choke point, so these
   pins are the executable contract for every resolution site. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TZ_BY_LABEL, resolveTz } from '../tz.js';

/* D-08: every legacy label resolves to its IANA equivalent, so existing
   Phase 27/37/38 fixtures keep passing unmodified (resolve-on-read). */
test('D-08: all 6 legacy labels map to their IANA zones', () => {
  assert.equal(resolveTz('(GMT-08:00) Pacific Time'), 'America/Los_Angeles');
  assert.equal(resolveTz('(GMT-05:00) Eastern Time'), 'America/New_York');
  assert.equal(resolveTz('(GMT+00:00) London'), 'Europe/London');
  assert.equal(resolveTz('(GMT+01:00) Berlin'), 'Europe/Berlin');
  assert.equal(resolveTz('(GMT+08:00) Singapore'), 'Asia/Singapore');
  assert.equal(resolveTz('(GMT-07:00) Pacific Time'), 'America/Los_Angeles', 'client default label (store.js DEFAULT_PREFS.tz)');
  assert.equal(Object.keys(TZ_BY_LABEL).length, 6, 'map carries exactly the 6 legacy labels');
});

test('D-07: empty, nullish, and non-string values all fall back to Europe/Paris', () => {
  assert.equal(resolveTz(''), 'Europe/Paris');
  assert.equal(resolveTz(undefined), 'Europe/Paris');
  assert.equal(resolveTz(null), 'Europe/Paris');
  assert.equal(resolveTz(42), 'Europe/Paris', 'non-string input');
  assert.equal(resolveTz({}), 'Europe/Paris');
  assert.equal(resolveTz(true), 'Europe/Paris');
});

test('D-07: unknown IANA-looking label falls back to Europe/Paris', () => {
  assert.equal(resolveTz('Mars/Olympus_Mons'), 'Europe/Paris');
  assert.equal(resolveTz('Not/AZone'), 'Europe/Paris');
});

test('T-44-01: hostile input never throws and always falls back to Europe/Paris', () => {
  const hostile = ['<script>alert(1)</script>', 'x'.repeat(10000), 'Europe/Paris; drop table users', '\x00\x01\x02', '../../etc/passwd'];
  for (const h of hostile) {
    assert.doesNotThrow(() => resolveTz(h));
    assert.equal(resolveTz(h), 'Europe/Paris');
  }
});

test('A2: arbitrary valid IANA zones and aliases are accepted as-is', () => {
  assert.equal(resolveTz('Asia/Tokyo'), 'Asia/Tokyo');
  assert.equal(resolveTz('America/Argentina/Buenos_Aires'), 'America/Argentina/Buenos_Aires', 'multi-segment zones');
  assert.equal(resolveTz('US/Pacific'), 'US/Pacific', 'legacy aliases accepted');
  assert.equal(resolveTz('UTC'), 'UTC');
});

test('funnel is idempotent on valid zones and trims surrounding whitespace', () => {
  assert.equal(resolveTz('Europe/Paris'), 'Europe/Paris');
  assert.equal(resolveTz('  Europe/Paris  '), 'Europe/Paris', 'trimmed before validation');
  assert.equal(resolveTz('  Asia/Tokyo '), 'Asia/Tokyo');
});
