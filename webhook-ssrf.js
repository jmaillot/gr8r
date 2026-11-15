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

/* IPv4: loopback 127/8, private 10/8 + 172.16/12 + 192.168/16, link-local
   169.254/16, this-network 0/8. IPv6: loopback ::1, unspecified ::,
   link-local fe80::/10 (fe[89ab]), unique-local fc00::/7 (f[cd]). */
function deniedIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  return /^(::1|f[cd]|fe[89ab])/i.test(ip) || ip === '::';
}

export async function ssrfOk(urlStr, { lookup } = {}) {
  const resolve = lookup || dns.lookup;
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    return { ok: false, reason: 'unparseable-url' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https-only' };
  let resolved;
  try {
    resolved = await resolve(url.hostname, { all: true, verbatim: true });
  } catch (err) {
    return { ok: false, reason: `lookup-failed: ${err?.code || err?.message || 'error'}` };
  }
  /* dns.lookup({all:true}) yields [{ address, family }]; a bare-string
     array (injected fake) is accepted too. Empty resolution is fail-closed. */
  const addresses = (Array.isArray(resolved) ? resolved : [])
    .map(entry => (typeof entry === 'string' ? entry : entry?.address))
    .filter(Boolean);
  if (!addresses.length) return { ok: false, reason: 'no-addresses' };
  /* WHK-05 adjacency edge: ONE denied IP blocks the whole URL. */
  const bad = addresses.find(ip => deniedIp(ip));
  if (bad) return { ok: false, reason: `denied-ip: ${bad}` };
  return { ok: true };
}
