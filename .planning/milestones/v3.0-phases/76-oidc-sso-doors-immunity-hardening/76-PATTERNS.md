# Phase 76: OIDC/SSO Doors & Immunity Hardening - Pattern Map

**Mapped:** 2026-11-19
**Files analyzed:** 4 (2 modified, 2 new)
**Analogs found:** 4 / 4

All analog paths verified git-tracked (`git ls-files` non-empty). No mirror paths.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (modify: DP-4 gate in OIDC callback fresh-provision arm) | controller (route handler, in-place edit) | request-response | `server.js:7948-7958` (DP-3 accept-door gate) + `server.js:5116-5131` (target site) | exact |
| `server.js` (modify: DP-5 filter in SSO-07 reconciliation) | controller (route handler, in-place edit) | request-response (filter-before-branch) | `server.js:7955-7957` (DP-3 row-email funnel call) | exact |
| `server.js` (modify: D-11 combined matrix boot log) | config/boot-log | batch (boot-time) | `server.js:8905-8909` (D-06 lines, the code being extended) | exact |
| `server.js` (modify: import `emailFromEmail`) | imports | — | `server.js:180-185` (Phase 75 import block) | exact |
| `test/domain-admission-sso.test.mjs` (new) | test (table-driven contract suite) | batch/integration | `test/domain-admission.test.mjs` (structure) + `test/oidc-sso.test.mjs` (IdP harness) | exact |
| `test/helpers/oidc-idp.mjs` (new, optional per Open Q2) | utility (test helper) | — | `test/oidc-sso.test.mjs:15-122` (source to extract) + `test/helpers/server.mjs` (helper export style) | role-match |
| `test/oidc-sso.test.mjs` (modify: swap inline idp for helper import — only if extraction chosen) | test | integration | its own lines 1-14 (import block) | exact |

## Pattern Assignments

### `server.js` — DP-4 gate (controller, request-response)

**Analog:** `server.js:7948-7958` (DP-3, the door this must mirror) — insertion site `server.js:5116-5131`.

**Import pattern** (lines 180-185) — add `emailFromEmail` here:
```js
import {
  SIGNUP_DOMAINS,
  INVITE_DOMAINS,
  emailDomainRefusal,
  isWildcardList,
} from './domains.js';
```

**Door-gate pattern to copy** (DP-3, lines 7948-7957 — comment discipline + funnel composition + custom code/message):
```js
    /* DP-3 (Phase 75, DOM-04/D-07): fail-closed re-derivation against the
       LIVE boot-frozen invite list — the ROW's email is the ticket, never a
       stored/resolved domain. The refusal is BEFORE any write and
       non-consuming (loosening the list revives the pending invite). When
       INVITE_DOMAINS is null (both doors unset) the gate is absent — the
       unset contract stays fail-open. The signup list is deliberately never
       consulted here (one door, one rule — DOM-03). */
    if (invite.email && INVITE_DOMAINS) {
      const acceptRefusal = emailDomainRefusal(invite.email, INVITE_DOMAINS, 'inviteDomainNoLonger', 'This invite can no longer be accepted');
      if (acceptRefusal) return fail(res, 403, 'inviteDomainNoLonger', acceptRefusal.message);
    }
```

**Insertion site verbatim** (lines 5121-5131 — the DP-4 gate goes ONLY in the final `else` arm):
```js
        } else if (!verifiedEmail) {
          /* G-30-1: no verified email → no JIT account, guest or not —
             fail closed BEFORE any users/oidc_identities write. */
          return errorRedirect();
        } else {
          /* Pitfall 5: JIT accounts get a RANDOM unusable scrypt hash — never
             a constant — into the password_hash NOT NULL column. Bare account,
             no workspace (D-05); the onboarding flow lands them next. */
          const created = await createUser(email, String(claims.name || ''), crypto.randomBytes(24).toString('base64url'));
          row = await db.get('select * from users where id = ?', [created.id]);
        }
```

**Refusal-surface pattern** (lines 5052-5056) — the ONLY allowed client surface for a DP-4 refusal:
```js
    const errorRedirect = () => {
      appendCookie(res, `${OIDC_FLOW_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      res.writeHead(302, { Location: '/login?sso=error' });
      res.end();
    };
```

**Logging pattern** — D-09: plain `logInfo`, domain only, never the full email (PII ban, V7). `email` is already lowercased/trimmed at :5086-5088 and `emailOk` at :5089 guarantees a domain exists. Research sketch (final wording per plan):
```js
          const signupRefusal = emailDomainRefusal(email, SIGNUP_DOMAINS);
          if (signupRefusal) {
            logInfo('sso signup domain refused', { domain: emailFromEmail(email) });
            return errorRedirect();
          }
```

**Anti-pattern (from :5103-5107 comment):** the already-linked path (`row` resolves at :5112-5115) must never reach the gate — "repeat logins must not break". Gate lives in the fresh-provision arm only; do NOT put it before the `if (existing)` branches (would block verified-email LINK of an existing account — Pitfall 1).

---

### `server.js` — DP-5 filter (controller, request-response)

**Analog:** `server.js:7955-7957` (DP-3, verbatim semantics to mirror). Insertion site: line 5162, immediately after the `pendingInvites` fetch, BEFORE the `length === 1` / `length > 1` branching (lines 5163, 5200).

**Target site verbatim** (lines 5160-5163):
```js
      let ssoRedirect = '/';
      if (!(await db.get('select 1 from memberships where user_id = ?', [row.id]))) {
        const pendingInvites = await db.all('select * from invites where email = ? collate nocase and used_at is null and expires_at > ?', [row.email, now()]);
        if (pendingInvites.length === 1) {
```

**Research sketch** (D-10: silent filter, new array, non-consuming — filter on the ROW's stored `invite.email`, never client input):
```js
        const pendingInvites = (await db.all('select * from invites where email = ? collate nocase and used_at is null and expires_at > ?', [row.email, now()]))
          /* DP-5 (Phase 76, DOM-05/SC3): refuse invites the accept door would
             refuse — row email against the live boot-frozen INVITE_DOMAINS,
             verbatim DP-3 semantics. Silent (D-10): a filtered invite is
             neither consumed nor messaged; loosening the list revives it. */
          .filter(invite => emailDomainRefusal(invite.email, INVITE_DOMAINS) === null);
```

**Invariants:** no new log verb, no redirect change (D-10); a filtered invite keeps `used_at IS NULL` (test-assert this); the branching downstream (auto-accept at :5164-5199, `/#invitations` at :5200-5205) consumes ONLY the filtered array. No catalogue/locale edits (Pitfall 6 — zero i18n surface).

---

### `server.js` — D-11 combined matrix boot log (boot-time batch)

**Analog:** the code being extended, `server.js:8905-8909` — D-11 appends ONE line after these, reusing the existing `domainListLog` helper:
```js
    /* D-06 (Phase 75): one grep-able, source-tagged line per admission var —
       `docker logs` answers "how are the doors configured". */
    const domainListLog = list => (list === null ? 'off' : isWildcardList(list) ? '*' : list.size === 0 ? 'deny-all' : [...list].sort().join(', '));
    logInfo(`domains: ALLOW_SIGNUP_DOMAINS: ${domainListLog(SIGNUP_DOMAINS)} (source: own)`);
    logInfo(`domains: ALLOW_INVITE_DOMAINS: ${domainListLog(INVITE_DOMAINS)} (source: ${'ALLOW_INVITE_DOMAINS' in process.env ? 'own' : 'inherit'})`);
```

**Door→list mapping (structural, don't re-derive):** signup + sso-jit ride `SIGNUP_DOMAINS`; invite-create + invite-accept + sso-reconcile ride `INVITE_DOMAINS` (already carries resolved inherit via `??` at `domains.js:80`). Research sketch for the combined line (format at agent's discretion per D-11; source may repeat or rely on the D-06 lines):
```js
logInfo(`domains: door matrix — signup: ${domainListLog(SIGNUP_DOMAINS)} | invite-create: ${domainListLog(INVITE_DOMAINS)} | invite-accept: ${domainListLog(INVITE_DOMAINS)} | sso-jit: ${domainListLog(SIGNUP_DOMAINS)} | sso-reconcile: ${domainListLog(INVITE_DOMAINS)}`);
```
Insert at line 8910 (inside the same boot callback, before the closing `});` at :8910). D-06 lines stay byte-identical (SC4 requires both).

---

### `test/domain-admission-sso.test.mjs` (test, integration — NEW)

**Analogs:** `test/domain-admission.test.mjs` (suite structure, env matrix, log-regex idioms) + `test/oidc-sso.test.mjs` (fake IdP harness).

**Suite header/import pattern** (`test/domain-admission.test.mjs:1-8`):
```js
/* Domain admission suite (Phase 75, DOM-01 / DOM-02 / DOM-07). The signup
   door (ALLOW_SIGNUP_DOMAINS) and the invite-door tri-state resolver
   (ALLOW_INVITE_DOMAINS, unset-inherits) proved end-to-end through the real
   server via the harness: out-of-list refused with the keyed localized
   refusal, unset byte-identical fail-open, set-empty deny-all (D-02). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { login, signup, startServer } from './helpers/server.mjs';
```

**Spawn/try-finally pattern** (`test/domain-admission.test.mjs:12-30`) — every test boots a REAL server.js with per-test env, asserts, `finally { await server.stop(); }`:
```js
test('an in-list email signs up and logs in; an out-of-list email is refused with signupDomainNotAllowed', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    const inList = await signup(server.base, { name: 'Inside', email: 'inside@a.com' });
    assert.equal(inList.status, 201, `in-list signup must be admitted, got ${inList.status}: ${JSON.stringify(inList.data)}`);
    ...
  } finally {
    await server.stop();
  }
});
```

**Boot-log regex assertion pattern** (`test/domain-admission.test.mjs:260-271`) — template for the D-11 test; use a distinctive combined-line prefix (e.g. `door matrix`) so loose `/domains:/` regexes don't collide with the two D-06 lines (Pitfall 5), and assert D-06 lines still appear:
```js
test('boot logs one source-tagged line per admission var (D-06)', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: 'b.com' } });
  try {
    const out = server.output();
    const signupLine = out.split('\n').find(l => l.includes('domains: ALLOW_SIGNUP_DOMAINS:'));
    ...
    assert.ok(signupLine && signupLine.includes('a.com') && signupLine.includes('(source: own)'), `signup line: ${signupLine}`);
  } finally {
    await server.stop();
  }
});
```

**Fake IdP harness to reuse** (`test/oidc-sso.test.mjs:17-122`) — test-generated RSA key + JWKS, discovery at `/v2.0/.well-known/openid-configuration`, token endpoint minting one id_token per call from `idp.tokenConfig` (claims overrides, alg/kid/signKey knobs). Critical fixture detail (`:50-54`): `email_verified` is NOT in the default payload — every allow-flow test must pass `email_verified: true` explicitly in `tokenConfig.claims`. The D-12 suite drives the full authorize → callback flow with `redirect: 'manual'` fetches (`nav()` helper at :127-130) and asserts the 302 `Location` (SC1: `/login?sso=error`; D-10: `/`). DB assertions via `withDb(server.dbPath, db => ...)` from the harness (`test/helpers/server.mjs:167-174`) — e.g. Pitfall 2's non-consumption check on `invites.used_at`.

**D-12 required shape:** ONE table-driven file pinning all five decision points + inherit matrix both directions, with the THREE immunity rows as explicit named rows (re-login of linked identity / repeat SSO login of linked identity / SSO reconcile of refused invite non-consumed — see RESEARCH.md Test Map). Reboot-same-DB immunity tests pass an explicit `dataDir` to `startServer` (`test/helpers/server.mjs:43-45` comment: "pass one explicitly when a test needs to reboot against the same database").

---

### `test/helpers/oidc-idp.mjs` (utility, NEW — optional per Open Q2)

**Source to extract:** `test/oidc-sso.test.mjs:15-122` (module-scope RSA keys, `b64u`, `idp` object, `startMockIdp()`). **Style analog:** `test/helpers/server.mjs:1-13` — file-head comment explaining the shared harness, then plain `export` functions/consts:
```js
/* Shared isolated-server harness for the node:test suites.
   Every suite spawns a real server.js on an ephemeral loopback port with its own
   temporary DATA_DIR, so no test needs a developer database, port 8080 or dist/. */
import { spawn } from 'node:child_process';
...
export const ROOT = path.resolve(import.meta.dirname, '..', '..');
```
Extraction touches only the import blocks of `test/oidc-sso.test.mjs:1-14` and the new suite. If extraction shows risk, duplicate the ~90-line idp object instead (RESEARCH.md A4).

---

### `server.js` — immunity (DOM-05): NO code change

Zero code. The already-linked path short-circuits before every predicate (`server.js:5112-5115`, whole `if (!row)` block skipped), and membership short-circuit precedes the DP-3 gate (`server.js:7955` guarded `if (invite.email && INVITE_DOMAINS)` after membership/pre-existing checks). Pinned only by the three named test rows.

## Shared Patterns

### The ONE admission funnel (T-75-16: no bypass lane)
**Source:** `domains.js:86-92`
**Apply to:** DP-4 and DP-5 — both must compose `emailDomainRefusal`; never inline `Set.has` checks.
```js
export function emailDomainRefusal(email, domains, code = 'signupDomainNotAllowed', message = 'This email is outside the domains allowed to create an account') {
  if (!domains) return null; // door off — fail-open (unset)
  if (isWildcardList(domains)) return null; // explicit '*' — allow-all
  const domain = emailFromEmail(email);
  if (domain === null || !domains.has(domain)) return { code, message }; // exact membership only
  return null;
}
```
Null (door off) and wildcard are handled INSIDE the funnel — new gates get both free. Unparseable email refuses, never throws.

### Boot-frozen consts, no request-time re-parse
**Source:** `domains.js:79-80`
**Apply to:** any new list consumption.
```js
export const SIGNUP_DOMAINS = parseDomainList(process.env.ALLOW_SIGNUP_DOMAINS, 'ALLOW_SIGNUP_DOMAINS');
export const INVITE_DOMAINS = parseDomainList(process.env.ALLOW_INVITE_DOMAINS, 'ALLOW_INVITE_DOMAINS') ?? SIGNUP_DOMAINS;
```

### Row-email discipline (never client-supplied)
**Source:** `server.js:7949` comment + `:7955` (`invite.email`, the ROW's stored email)
**Apply to:** DP-5 filter — filter on `invite.email`, never `row.email` or request data.

### PII ban in logs (V7)
**Source:** D-09 decision + `logInfo` style (`server.js:8901-8909`)
**Apply to:** DP-4 refusal log — domain only (`emailFromEmail(email)`), never the full email.

### Test harness conventions
**Source:** `test/helpers/server.mjs`, `test/domain-admission.test.mjs`, `test/oidc-sso.test.mjs`
**Apply to:** D-12 suite — `startServer({ env })` per test + try/finally stop; `withDb` for DB assertions; `server.output()` + distinctive-prefix regex for log tests; `nav()` manual-redirect fetches for the OIDC flow; explicit `dataDir` for reboot-same-DB immunity rows. `npm test` = `node --test --test-concurrency=2 test/*.test.mjs` (package.json:19).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | None. Every new/modified file has an exact or role-match analog; the phase extends already-landed Phase 75 machinery. |

## Metadata

**Analog search scope:** root (`server.js`, `domains.js`), `test/`, `test/helpers/`
**Files scanned:** 7 (domains.js full; server.js §180-185, §5033-5261, §7940-7979, §8900-8914; test/domain-admission.test.mjs §1-90, §240-318; test/oidc-sso.test.mjs §1-130; test/helpers/server.mjs full)
**Pattern extraction date:** 2026-11-19
