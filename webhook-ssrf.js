/* =====================================================================
   WEBHOOK SSRF GUARD — Phase 67 (WHK-05, T-67-01) — server-only module.
   =====================================================================
   Per-delivery outbound-URL guard: https-only plus a resolved-IP
   deny-list (re-resolved EVERY attempt to defeat DNS rebinding between
   registration and delivery). Fail-closed contract (oidc.js discipline):
   every refusal or lookup error returns { ok: false, reason } — never a
   throw the caller could turn into a 500. On ok, the VERIFIED address
   set rides the verdict so the delivery fetch can pin the connection to
   it (pinnedFetch below — the WR-01 within-attempt rebinding fix).

   Server-side only: NOT under src/ so Vite never bundles node:dns.
   Zero npm imports (stdlib-only phase); `lookup` is injectable so tests
   run with zero network access.
   ===================================================================== */
import dns from 'node:dns/promises';
import https from 'node:https';
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
  /* WR-01 fix (v2.4 audit): the validated set rides the verdict so the
     delivery fetch can PIN the connection to these exact addresses —
     closing the within-attempt rebinding window (ssrfOk validates the
     resolution, then fetch resolved the hostname AGAIN; a rebinding
     attacker flips DNS in between). */
  return { ok: true, addresses };
}

/* WR-01 fix (v2.4 audit) — pinned transport. A fetch-like POST built on
   node:https whose TLS connect resolves the hostname THROUGH the
   guard-validated address set (fail-closed: no address set → no connect;
   the lookup only ever yields validated IPs, so a DNS flip between
   guard and connect can no longer redirect the request). redirect is a
   no-op (node:https never follows), signal aborts the request — the
   caller passes the same AbortSignal.timeout(10_000) as before. Returns
   the fetch-shaped slice the delivery engine consumes: { ok, status,
   headers: { get } } (the body is drained, never surfaced). `request`
   is injectable so tests run with zero network. */
function pinnedLookup(addresses) {
  let i = 0;
  return (hostname, options, callback) => {
    const address = addresses[i++ % addresses.length];
    process.nextTick(() => callback(null, address, net.isIPv4(address) ? 4 : 6));
  };
}

export function pinnedFetch(urlStr, { addresses, signal, request, ...rest } = {}) {
  return new Promise((resolve, reject) => {
    const fail = reason => reject(Object.assign(new Error(`ssrf: ${reason}`), { code: 'ssrf-refused' }));
    if (!Array.isArray(addresses) || !addresses.length) return fail('no pinned addresses');
    let url;
    try {
      url = new URL(urlStr);
    } catch {
      return fail('unparseable-url');
    }
    if (url.protocol !== 'https:') return fail('https-only');
    const req = (request || https.request)(urlStr, { ...rest, lookup: pinnedLookup(addresses), servername: url.hostname }, r => {
      r.on('data', () => {});
      r.on('error', reject);
      r.on('end', () =>
        resolve({
          ok: r.statusCode >= 200 && r.statusCode < 300,
          status: r.statusCode,
          headers: {
            get: k => {
              const v = r.headers[String(k).toLowerCase()];
              return v == null ? null : Array.isArray(v) ? v[0] : v;
            },
          },
        }),
      );
    });
    req.on('error', reject);
    if (signal) {
      if (signal.aborted) return fail('aborted');
      signal.addEventListener('abort', () => req.destroy(new Error('The operation was aborted')), { once: true });
    }
    if (rest.body) req.write(rest.body);
    req.end();
  });
}
