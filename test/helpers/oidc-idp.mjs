/* Shared fake-OIDC-IdP harness for the node:test suites (extracted from
   test/oidc-sso.test.mjs — imports-only move, zero behavioral drift).
   A node:http IdP serves discovery, JWKS (a test-generated RSA key) and a
   token endpoint minting one id_token per call from `idp.tokenConfig`
   (claims overrides, alg/kid/signKey knobs). Suites point a REAL server.js
   at it via the test-only OIDC_ISSUER_OVERRIDE knob. */
import crypto from 'node:crypto';
import http from 'node:http';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
/* A second RSA key the real IdP does not publish — signatures from it are
   the SSO-08 "valid shape, wrong key" vector. */
const { privateKey: foreignPrivateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'mock-key-1';
const PUBLIC_JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const b64u = buf => Buffer.from(buf).toString('base64url');

/* The per-test token behavior: the token endpoint mints exactly one id_token
   per call from this row (claims overrides, sign on/off). Later plans extend
   this row into the SSO-08 fail-closed matrix. */
export const idp = {
  base: null,
  issuer: null,
  tokenConfig: { code: 'auth-code-1', claims: {} },
  /* Mint one id_token per token-endpoint call. Row knobs:
     claims     — claim overrides spread over the defaults (tid: 't-1' is the
                  pinned tenant, present on every honest managed-user token)
     alg        — 'RS256' (default) | 'none' | 'HS256' (SSO-08 confusion vectors)
     kid        — header kid override (unknown kid → JWKS miss)
     signKey    — 'own' (default) | 'foreign' (a key the JWKS never published) */
  mintIdToken(nonce) {
    const { claims, alg = 'RS256', kid = KID, signKey = 'own' } = this.tokenConfig;
    const header = b64u(JSON.stringify({ alg, kid, typ: 'JWT' }));
    const payload = b64u(
      JSON.stringify({
        iss: this.issuer,
        aud: 'cid',
        sub: 'sub-1',
        email: 'sso.user@example.com',
        name: 'SSO User',
        tid: 't-1',
        /* G-30-1: `email_verified` is NOT in the default payload — the strict
           policy gates on the claim, so its omission is the failure mode the
           fixtures must model explicitly. Every test where the policy should
           ALLOW the flow supplies `email_verified: true` in its claims. */
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        nonce,
        ...claims,
      }),
    );
    const unsigned = `${header}.${payload}`;
    if (alg === 'none') return `${unsigned}.`;
    if (alg === 'HS256') {
      const sig = crypto.createHmac('sha256', 'symmetric-secret-shared').update(unsigned).digest();
      return `${unsigned}.${b64u(sig)}`;
    }
    const key = signKey === 'foreign' ? foreignPrivateKey : privateKey;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key);
    return `${unsigned}.${b64u(sig)}`;
  },
};

export function startMockIdp() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/v2.0/.well-known/openid-configuration') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ issuer: idp.issuer, jwks_uri: `${idp.base}/jwks`, token_endpoint: `${idp.base}/token` }));
        return;
      }
      if (url.pathname === '/jwks') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [PUBLIC_JWK] }));
        return;
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
          /* demandVerifier (SSO-08 wrong-verifier row): the mock insists on an
             exact verifier it was handed — the server's real PKCE verifier can
             never match, so the exchange 400s and the callback fails closed. */
          const verifierOk = idp.tokenConfig.demandVerifier
            ? form.get('code_verifier') === idp.tokenConfig.demandVerifier
            : (form.get('code_verifier') || '').length >= 43;
          const ok =
            form.get('grant_type') === 'authorization_code' &&
            form.get('code') === idp.tokenConfig.code &&
            verifierOk &&
            form.get('client_secret') === 'sec';
          if (!ok) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_grant' }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id_token: idp.mintIdToken(form.get('nonce')), token_type: 'Bearer' }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      idp.base = `http://127.0.0.1:${port}`;
      idp.issuer = `${idp.base}/v2.0`;
      resolve(server);
    });
  });
}
