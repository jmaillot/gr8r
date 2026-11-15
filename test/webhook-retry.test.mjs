/* Retry math suite (Phase 67, D-05 / Pitfall 7). Pure: no network, no real
   timers — `now` is injected. Retry-After parses as integer seconds first,
   then HTTP-date; absent/unparseable falls back to the D-05 backoff table
   (1m → 5m → 30m → 2h → 8h). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { BACKOFF_MS, nextAttemptMs, isDead } from '../webhook-retry.js';

const NOW = Date.parse('2026-11-15T12:00:00Z');

test('backoff table is the D-05 decision: 1m, 5m, 30m, 2h, 8h', () => {
  assert.deepEqual(BACKOFF_MS, [60_000, 300_000, 1_800_000, 7_200_000, 28_800_000]);
});

test('no Retry-After: attempt N falls back to table entry N', () => {
  assert.equal(nextAttemptMs({ attempt: 0, now: NOW }), NOW + 60_000);
  assert.equal(nextAttemptMs({ attempt: 1, now: NOW }), NOW + 300_000);
  assert.equal(nextAttemptMs({ attempt: 4, now: NOW }), NOW + 28_800_000);
});

test('attempt beyond the table length clamps to the last entry', () => {
  assert.equal(nextAttemptMs({ attempt: 9, now: NOW }), NOW + 28_800_000);
});

test('Retry-After in integer seconds wins over the table', () => {
  assert.equal(nextAttemptMs({ attempt: 0, retryAfterHeader: '7', now: NOW }), NOW + 7_000);
});

test('Retry-After as an HTTP-date wins over the table (Pitfall 7)', () => {
  const r = nextAttemptMs({ attempt: 0, retryAfterHeader: 'Wed, 21 Oct 2026 07:28:00 GMT', now: NOW });
  assert.equal(r, Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'));
});

test('unparseable Retry-After falls back to the table', () => {
  assert.equal(nextAttemptMs({ attempt: 2, retryAfterHeader: 'garbage', now: NOW }), NOW + 1_800_000);
});

test('a Retry-After in the past still yields a next attempt (not NaN, not stuck)', () => {
  const r = nextAttemptMs({ attempt: 0, retryAfterHeader: 'Wed, 21 Oct 2020 07:28:00 GMT', now: NOW });
  assert.equal(r, Date.parse('Wed, 21 Oct 2020 07:28:00 GMT'));
});

test('isDead: attempt ≥ 5 is dead (no next attempt), 4 is alive', () => {
  assert.equal(isDead(5), true);
  assert.equal(isDead(6), true);
  assert.equal(isDead(4), false);
  assert.equal(isDead(0), false);
});
