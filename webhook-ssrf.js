/* =====================================================================
   WEBHOOK SSRF GUARD — Phase 67 (WHK-05, T-67-01) — server-only module.
   =====================================================================
   Per-delivery outbound-URL guard: https-only plus a resolved-IP
   deny-list (re-resolved EVERY attempt to defeat DNS rebinding between
   registration and delivery). Fail-closed contract (oidc.js discipline):
   every refusal or lookup error returns { ok: false, reason } — never a
   throw the caller could turn into a 500.

   Server-side only: NOT under src/ so Vite never bundles node:dns.
   Zero npm imports (stdlib-only phase); `lookup` is injectable so tests
   run with zero network access.
   ===================================================================== */
import dns from 'node:dns/promises';
import net from 'node:net';

export async function ssrfOk(urlStr, { lookup } = {}) {
  return { ok: false, reason: 'not-implemented' };
}
