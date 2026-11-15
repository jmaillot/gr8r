/* =====================================================================
   WEBHOOK RETRY MATH — Phase 67 (D-05) — pure backoff / Retry-After.
   =====================================================================
   Pure module: no imports, no I/O, no clock reads — `now` is a parameter
   so tests pin the math without fake timers. The backoff table IS the
   D-05 decision (5 attempts max: 1 min → 5 min → 30 min → 2 h → 8 h);
   Retry-After (integer seconds, then HTTP-date) overrides the table when
   present and parseable.
   ===================================================================== */

export const BACKOFF_MS = [];

export function nextAttemptMs({ attempt = 0, retryAfterHeader = null, now = Date.now() } = {}) {
  return null;
}

export function isDead(attempt = 0) {
  return false;
}
