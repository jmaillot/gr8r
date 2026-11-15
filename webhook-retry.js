/* =====================================================================
   WEBHOOK RETRY MATH — Phase 67 (D-05) — pure backoff / Retry-After.
   =====================================================================
   Pure module: no imports, no I/O, no clock reads — `now` is a parameter
   so tests pin the math without fake timers. The backoff table IS the
   D-05 decision (5 attempts max: 1 min → 5 min → 30 min → 2 h → 8 h);
   Retry-After (integer seconds, then HTTP-date) overrides the table when
   present and parseable.
   ===================================================================== */

/* D-05: after failed attempt N (0-based), wait table entry N. */
export const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 28_800_000];

/* Retry-After (Pitfall 7): integer seconds first, then HTTP-date via
   Date.parse; absent/unparseable falls back to the table (last entry
   clamped). A past date is returned as-is — the caller's due check
   (next_attempt_at ≤ now) keeps the delivery eligible immediately. */
export function nextAttemptMs({ attempt = 0, retryAfterHeader = null, now = Date.now() } = {}) {
  if (retryAfterHeader != null) {
    const asText = String(retryAfterHeader).trim();
    if (/^\d+$/.test(asText)) return now + Number(asText) * 1000;
    const asDate = Date.parse(asText);
    if (!Number.isNaN(asDate)) return asDate;
  }
  return now + BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)];
}

/* D-05/D-06: 5 attempts max — a delivery that has made 5 attempts is
   dead (badge state, no further attempts). */
export function isDead(attempt = 0) {
  return attempt >= BACKOFF_MS.length;
}
