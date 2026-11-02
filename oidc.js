/* =====================================================================
   OIDC client core (SSO-01) — Microsoft Entra authorization-code flow
   with PKCE, hand-rolled over node:crypto + global fetch.

   Zero runtime dependencies (D-01 + milestone invariant, pinned by
   test/dependencies.test.mjs). Server-side only: NOT under src/ so Vite
   never bundles server crypto (same rule as totp.js / mailer.js).

   Contracts honored here (30-CONTEXT locked decisions):
   - D-01: confidential client — client_secret rides the token POST body,
     PKCE S256 on the authorization-code flow.
   - D-02: activation requires OIDC_ENABLED=true AND all three of
     OIDC_TENANT_ID / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET present and
     non-empty. Partial config NEVER half-enables SSO.
   - D-10: the server is the ground truth; clients read oidcEnabled from
     /api/config, never env.

   Env:
     OIDC_ENABLED        true to enable SSO (still requires the three vars)
     OIDC_TENANT_ID      Entra directory (tenant) id
     OIDC_CLIENT_ID      app registration application (client) id
     OIDC_CLIENT_SECRET  app registration client secret
     OIDC_SSO_ONLY       true = SSO becomes the only sign-in door
     OIDC_SCOPES         default "openid profile email"
     OIDC_ISSUER_OVERRIDE  TEST-ONLY issuer override for the mock IdP
                         (test/oidc-sso.test.mjs); never set in production.

   Every outbound fetch carries AbortSignal.timeout(10_000) (house rule,
   mailer.js SMTP_TIMEOUT_MS precedent — Pitfall 7) and every expected
   failure returns a fail-closed { ok:false, reason } — never a throw the
   callback could accidentally turn into a 500 (Pitfall 2).
   ===================================================================== */
import crypto from 'node:crypto';

const FETCH_TIMEOUT_MS = 10_000;

function flag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

const text = value => String(value ?? '').trim();

/* D-02: null unless the flag is on AND the complete var set is present.
   A missing/empty var is indistinguishable from "off" — the caller only
   ever sees a disabled client, never which var was missing (no-oracle). */
function readConfig(env) {
  if (!flag(env.OIDC_ENABLED)) return null;
  const tenantId = text(env.OIDC_TENANT_ID);
  const clientId = text(env.OIDC_CLIENT_ID);
  const clientSecret = String(env.OIDC_CLIENT_SECRET ?? '').trim();
  if (!tenantId || !clientId || !clientSecret) return null;
  const issuer = text(env.OIDC_ISSUER_OVERRIDE) || `https://login.microsoftonline.com/${tenantId}/v2.0`;
  return {
    tenantId,
    clientId,
    clientSecret,
    issuer,
    scopes: text(env.OIDC_SCOPES) || 'openid profile email',
    ssoOnly: flag(env.OIDC_SSO_ONLY),
  };
}

/* RFC 7636 S256 pair (Pattern 2): a 64-char base64url verifier, well inside
   the 43-128 unreserved-char spec range. */
export function pkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

const b64uJson = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* RS256 id_token verification over node:crypto — no JWT library (Pattern 1).
   Fail-closed reason chain: shape → alg → kid → signature → iss → aud →
   exp → nonce. The nonce compare is timing-safe (attacker-influenced input);
   the short issuer/audience compares are server-pinned constants. */
export function verifyIdToken(idToken, jwkByKey, { issuer, audience, nonce, now }) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'shape' };
  const [h, p, s] = parts;
  let header;
  let claims;
  try {
    header = b64uJson(h);
    claims = b64uJson(p);
  } catch {
    return { ok: false, reason: 'shape' };
  }
  if (header.alg !== 'RS256') return { ok: false, reason: 'alg' };
  const jwk = jwkByKey instanceof Map ? jwkByKey.get(header.kid) : null;
  if (!jwk) return { ok: false, reason: 'kid' };
  let key;
  try {
    key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    return { ok: false, reason: 'kid' };
  }
  let okSig = false;
  try {
    okSig = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'));
  } catch {
    return { ok: false, reason: 'signature' };
  }
  if (!okSig) return { ok: false, reason: 'signature' };
  if (claims.iss !== issuer) return { ok: false, reason: 'iss' };
  if (claims.aud !== audience) return { ok: false, reason: 'aud' };
  if (typeof claims.exp !== 'number' || claims.exp <= now) return { ok: false, reason: 'exp' };
  /* Nonce: attacker-influenced → timing-safe compare with a length pre-check. */
  if (!nonce || typeof claims.nonce !== 'string' || !timingSafeEq(claims.nonce, nonce)) {
    return { ok: false, reason: 'nonce' };
  }
  return { ok: true, claims };
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`oidc fetch failed: ${res.status}`);
  return res.json();
}

export function createOidc(env = process.env) {
  const config = readConfig(env);

  if (!config) {
    /* Disabled / partial config: inert, honest object. Methods throw only if
       a caller bypasses the enabled gate — routes never do. */
    return {
      enabled: false,
      ssoOnly: false,
      config: null,
      buildAuthUrl() {
        throw new Error('OIDC is not configured');
      },
      async exchangeCode() {
        throw new Error('OIDC is not configured');
      },
      async getJwks() {
        throw new Error('OIDC is not configured');
      },
    };
  }

  /* Discovery + JWKS cache (Pitfall 3): fetched once at first use, issuer
     validated against the pinned value, plus exactly ONE refetch on unknown
     kid before failing closed (signing-key rollover flow). */
  let disco = null;
  let jwkByKey = null;

  async function ensureDisco() {
    if (disco) return disco;
    const doc = await fetchJson(`${config.issuer}/.well-known/openid-configuration`);
    if (doc.issuer !== config.issuer) throw new Error('oidc discovery issuer mismatch');
    if (!doc.jwks_uri || !doc.token_endpoint) throw new Error('oidc discovery document incomplete');
    disco = doc;
    return disco;
  }

  async function getJwks(force = false) {
    const { jwks_uri } = await ensureDisco();
    if (jwkByKey && !force) return jwkByKey;
    const set = await fetchJson(jwks_uri);
    const map = new Map();
    for (const jwk of Array.isArray(set?.keys) ? set.keys : []) {
      if (jwk.kid) map.set(jwk.kid, jwk);
    }
    jwkByKey = map;
    return jwkByKey;
  }

  return {
    enabled: true,
    ssoOnly: config.ssoOnly,
    config: { tenantId: config.tenantId, clientId: config.clientId, issuer: config.issuer },

    /* The authorize URL carries the full D-01 shape: confidential-client id,
       PKCE S256, state, nonce. The redirect_uri is fixed server-side; the
       callback route never honors a redirect parameter coming back. */
    buildAuthUrl(redirectUri, { state, nonce, challenge }) {
      const base = config.issuer.replace(/\/v2\.0$/, '');
      const url = new URL(`${base}/oauth2/v2.0/authorize`);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: config.scopes,
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },

    /* D-01 confidential client: client_secret in the POST body, PKCE verifier
       attached, hard 10s timeout (Pitfall 7). Returns the parsed token JSON;
       network/HTTP failures throw — the callback catches and redirects to the
       generic error marker. */
    async exchangeCode(code, verifier, redirectUri) {
      const { token_endpoint } = await ensureDisco();
      return fetchJson(token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }),
      });
    },

    getJwks,
  };
}
