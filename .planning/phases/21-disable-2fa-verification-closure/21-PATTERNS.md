# Phase 21: Disable-2FA Verification & Closure - Pattern Map

**Mapped:** 2026-10-29
**Files analyzed:** 5 (1 modified, 2 new, 2 conditional)
**Analogs found:** 5 / 5

All analog paths verified git-tracked this session (`git ls-files`): `server.js`, `test/tfa-recovery-regen.test.mjs`, `test/helpers/server.mjs`, `e2e/flows.spec.mjs`, `e2e/playwright.config.mjs`, `src/pages/settings.js`, `src/locales/*.json`, `totp.js`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (edit: `/api/auth/tfa/disable`, lines 1656–1700) | route/controller | request-response | `server.js:1704–1755` (regen route, same file) | exact |
| `test/tfa-disable.test.mjs` (NEW) | test (node:test server suite) | request-response | `test/tfa-recovery-regen.test.mjs` | exact |
| `e2e/tfa-disable-cycle.spec.mjs` (NEW, name at planner's discretion) | test (Playwright Chromium e2e) | event-driven (browser flows) | `e2e/flows.spec.mjs:1086–1254` (phase-18 parametric 2FA/revocation tests) | exact |
| `src/pages/settings.js` (NO change expected) | component | transform | `src/pages/settings.js:391–432` (its own tfa card) | n/a — read-only reference |
| `src/locales/en.json`, `src/locales/fr.json` (only if strings change, D-111) | config (i18n) | transform | their own `settings.tfa.*` namespaces | n/a — prefer reuse, zero new strings |

## Pattern Assignments

### `server.js` — disable route edit (route, request-response)

**Primary analog:** the disable route's own scaffold, `server.js:1656–1700` (the subject — kept: guard order, throttle, readJson, transaction shape, outcome mapping). **Strict-gate analog:** regen route `server.js:1704–1755`.

**Guard order + throttle (stays as shipped, D-108)** — `server.js:1656–1666`:
```javascript
if (pathname === '/api/auth/tfa/disable' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = requireUser(req, res);
    if (!user) return;
    // T-16-14: a distinct budget from the other tfa routes (D-11 band).
    if (tooMany(`tfa-disable|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const cur = String(body?.currentPassword || '');
    const code = String(body?.code || '').trim();
    if (!cur) return fail(res, 400, 'passwordRequired', 'Enter your current password');
    if (!code) return fail(res, 400, 'codeRejected', 'Enter a verification code');
```

**Strict-6-digit gate to copy verbatim (D-85 pattern, D-101)** — `server.js:1716–1719` (regen route), replaces the permissive `!code` check and the whole `1673–1688` else-branch:
```javascript
    // D-85 (structural invariant): strict 6-digit-only gate with NO else-branch
    // and NO recovery_codes lookup anywhere in this route — a recovery code
    // can never satisfy the step-up.
    if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', 'Enter a 6-digit verification code');
```

**Core transaction pattern (fresh re-select + verify + teardown, Pitfall 4)** — `server.js:1670–1695`; after the edit the in-transaction body becomes: fresh re-select → verifyPassword → `requireTotpSecret` (503 fail-closed) → `verifyTotpCode` → the existing two teardown statements (`1672`, `1692–1693`) **plus the two new deletes (D-103/D-105, see Shared Patterns)**. Shape reference — `server.js:1727–1749` (regen):
```javascript
    const outcome = transaction(() => {
      const fresh = db.prepare('select password_hash, two_fa_enabled, two_fa_secret, two_fa_last_step from users where id = ?').get(user.id);
      if (!fresh || !fresh.two_fa_enabled) return 'notEnabled'; // D-95: before any factor check
      if (!verifyPassword(cur, fresh.password_hash)) return 'password'; // D-86: password first (D-94: try already consumed)
      const wrapped = requireTotpSecret(fresh.two_fa_secret);
      if (!wrapped.ok) return 'masterKey';
      const verified = verifyTotpCode(wrapped.secret, code, fresh.two_fa_last_step || null, Math.floor(now() / 1000));
      if (!verified.ok) return 'code';
      ...
      return 'ok';
    });
```

**Outcome mapping (honest codes, unchanged)** — `server.js:1696–1699`:
```javascript
    if (outcome === 'password') return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
    if (outcome === 'masterKey') return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured or the stored secret is undecryptable');
    if (outcome === 'code') return fail(res, 400, 'codeRejected', 'That code is not valid');
    return json(res, 200, { ok: true });
```

**logSecurity verb call site (D-107)** — `server.js:1746–1747` (regen, in-transaction via D-99). For disable, log **after** the transaction returns 'ok', before the response (D-107 wording — see Assumption A1 in RESEARCH.md):
```javascript
      // D-99: the security event shares the transaction — success-only rows.
      logSecurity(user.id, 'tfa_recovery_regenerated');
```

---

### `test/tfa-disable.test.mjs` (test, request-response)

**Analog:** `test/tfa-recovery-regen.test.mjs` (full file, 212 lines — the direct template).

**Imports + suite scaffold** (lines 5–36):
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { totpAt, recoveryHash, normalizeRecoveryCode } from '../totp.js';
import { signup, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;

/* Track each user's stored secret at enable time so tests can derive live codes. */
const enabledSecrets = new Map();

/* Reset the D-04 baseline (test-side DB access) so a current-window code verifies. */
function resetLastStep(email) {
  withDb(server.dbPath, db => db.prepare('update users set two_fa_last_step = 0 where email = ?').run(email));
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-tfa-regen-'));
  // D-10: a throwaway MASTER_KEY so production and tests exercise the same envelope path.
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'gr8r-tfa-suite-key' } });
});
```

**Fixtures / helpers to copy** (lines 38–76): `makeUser` (signup is IP-throttled 5/hour — **stay within 5 signups per server**), `userRow`, `recoveryRows`, `securityRows` (all `withDb` readers — `securityRows` is exactly what D-107's assertion needs), `liveCode`, a `fetch`-based route helper (`regen` at lines 62–67), and `enableTfa` (lines 70–76).

**The D-102 regression test shape is already written** — lines 114–144 ("D-85 headline regression"): post a captured plaintext recovery code, assert `400` + `code` `codeRejected`, then assert the recovery-code set is byte-unchanged and unburned. Phase 21's version additionally asserts `users.two_fa_enabled` is still 1.

**D-104 / D-105 test data techniques**: mint a `login_challenges` row via `withDb` mimicking the server's own insert — `server.js:1501–1505`:
```javascript
      db.prepare('insert into login_challenges (challenge_token_hash, user_id, expires_at, attempts) values (?,?,?,0)').run(
        sha256(challengeToken),
        row.id,
        now() + CHALLENGE_TTL_MS,
      );
```
(`CHALLENGE_TTL_MS = 5 * 60 * 1000`, `server.js:82`; token hash = sha256 of a random base64url token). Then prove the token dies: `POST /api/auth/tfa/login` with it returns 401 `challengeExpired` (`server.js:1772, 1798–1800` — a user with `two_fa_enabled = 0` kills the challenge). For sessions, mint a second session by a second login, then assert the first cookie still 200s and the second 401s after disable.

**Throttle test template** — lines 155–178 (D-93/D-94): 5 attempts stay verified, 6th is 429 `tooManyAttempts`; wrong passwords consume tries (D-108). **503 test template** — lines 180–211: corrupt the envelope via `withDb`, assert 503 `masterKeyMissing` + zero mutation.

---

### `e2e/tfa-disable-cycle.spec.mjs` (test, browser event-driven)

**Analog:** `e2e/flows.spec.mjs:1005–1254` — the phase-18 block: parametric `for (const lang of ['en', 'fr'])` describes, `createAccount` per run-unique tag with `clientIp(run, tag)` (throttle isolation), and the exact helper set the new spec reuses.

**Helpers to import/copy** — `e2e/flows.spec.mjs:1032–1084`:
```javascript
function tfaCode(secret, offsetSec = 1) {
  return totpAt(secret, Math.floor(Date.now() / 1000) + offsetSec);
}

async function enrollAndEnableTfa(client) {
  const enroll = await must('tfa enroll', await client.post('/api/auth/tfa/enroll', { currentPassword: PASSWORD }), [200]);
  const secret = enroll.secret;
  ...
  for (const offset of [1, 31]) {
    const res = await client.post('/api/auth/tfa/enable', { code: tfaCode(secret, offset) });
    if (res.status === 200) return { secret, recoveryCodes: res.data.recoveryCodes };
    ...
  }
}

async function fillLogin(page, account, lang) { ... }        // lines 1057–1063
async function submitTfaCode(page, slug, code) { ... }       // lines 1068–1077
async function openSettingsSec(page, sec) { ... }            // lines 1081–1084
```
Note: these live inside `flows.spec.mjs` — the planner decides whether the new spec imports them (extract to a shared helper module) or the spec lives in `flows.spec.mjs` (D-75 precedent: "same file, no new spec/config"). Either is within "existing conventions"; `e2e/playwright.config.mjs` has no per-file registry (testDir = e2e dir).

**Two-session e2e pattern (D-106)** — the password-change test, `e2e/flows.spec.mjs:1214–1252`, is a line-for-line template for "revoke-others, keep-current, honest 401 teardown":
```javascript
      const ctxA = await newContext(browser, { ip: clientIp(run, `${tag}-a`), lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const ctxB = await newContext(browser, { ip: clientIp(run, `${tag}-b`), lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      ...
        /* B dies on its next requireUser surface, with the honest copy. */
        await openSettingsSec(b, 'sessions');
        await expect(b.getByText(fmt('err.signedOutElsewhere', {}, lang))).toBeVisible();
        await expect(b.getByLabel(fmt('common.email', {}, lang), { exact: true })).toBeVisible();
```
The "central honest 401 teardown" mechanism is `signOutRevoked` in `src/actions/actions.js:2131–2141` — the e2e asserts its observable copy (`err.signedOutElsewhere`), never the implementation.

**Disable form selectors to drive** — `src/pages/settings.js:412–417`: `data-submit="tfaDisableConfirm"` form, `#tfa-off-pw`, `#tfa-off-code`, `#tfa-off-save` button, `data-a="tfaAskDisable"` entry button; catalogue strings `act.turnOff`, `settings.tfa.turnOff`, `settings.tfa.pwLabel`, `settings.tfa.codeLabel` (all present in both `en.json` and `fr.json` — verified). Replay-guard discipline: compute codes at submit time with the `tfaCode(secret, offset)` offset trick (`flows.spec.mjs:1105–1114`) and/or `resetLastStep` between steps.

**Parametric structure** — `e2e/flows.spec.mjs:1086–1095`:
```javascript
test.describe('phase 18 auth flows', () => {
  for (const lang of ['en', 'fr']) {
    test(`... (${lang})`, async ({ browser }) => {
      const tag = `2fa-${lang}`;
      const acct = await createAccount(BASE_URL, run, tag, `2FA ${lang}`, { locale: lang, workspace: `2fa-${lang}-${run}` });
      const { secret } = await enrollAndEnableTfa(acct.client);
      const context = await newContext(browser, { ip: acct.account.ip, lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
```
All asserted UI copy goes through `fmt(key, params, lang)` from the catalogue — never raw literals (flows.spec.mjs:1014–1017 header comment).

---

## Shared Patterns

### Revoke-others inside the caller's transaction (D-105)
**Source:** `server.js:1578–1587` (password change — the exact precedent)
**Apply to:** the disable transaction
```javascript
    // Pitfall 9: hash the caller's own cookie — never a body or param value.
    const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    // PASS-02: verify, rehash and revoke-others are one atomic unit.
    const ok = transaction(() => {
      // Pitfall 4: re-select the hash fresh inside the transaction.
      const row = db.prepare('select password_hash from users where id = ?').get(user.id);
      if (!row || !verifyPassword(cur, row.password_hash)) return false;
      db.prepare('update users set password_hash = ? where id = ?').run(hashPassword(nw), user.id);
      // Keep-current (P-H): the caller's own session is excluded by the != clause.
      db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
      return true;
    });
```
`tokenHash` is computed **before** the transaction from the caller's own cookie.

### User-scoped teardown deletes (D-103)
**Source:** the disable route's own existing deletes, `server.js:1692–1693`; schema `server.js:117–123`
**Apply to:** one added statement inside the same transaction
```javascript
      db.prepare("update users set two_fa_enabled = 0, two_fa_secret = '', two_fa_last_step = 0 where id = ?").run(user.id);
      db.prepare('delete from recovery_codes where user_id = ?').run(user.id);
      // D-103 (new): keyed on user_id ONLY — an unscoped or token-keyed variant
      // either misses rows or breaks other users' in-flight logins.
```
Context: `login_challenges` issue site `server.js:1501–1505`; burn sites `server.js:1534, 1785, 1794, 1799, 1837` are all keyed by `challenge_token_hash`; the sweeper `server.js:2807–2808` deletes only `expires_at <= now()` — so pending rows genuinely persist until torn down (the ghost state DIS-01 targets).

### Security-verb logging (D-107)
**Source:** `server.js:1747` (regen route) + `security_log` schema `server.js:162–168`
**Apply to:** after the disable transaction commits 'ok', before `json(res, 200, {ok:true})`
```javascript
logSecurity(user.id, 'tfa_disabled');
```
Assert in the server test via the `securityRows(email)` helper (`test/tfa-recovery-regen.test.mjs:55–58`): exactly one row, verb `tfa_disabled`, **zero rows on every failure path** (success-only convention, proven at regen-test lines 110–111, 152, 177).

### Guard order + throttle band (D-108, verified not rewritten)
**Source:** `server.js:1657–1661` (as shipped); sibling budgets `pwchange|uid` at 1570, `tfa-enroll|uid` at 1602, `tfa-regen|uid` at 1711 — all 5/15min keyed per-user
**Apply to:** nothing changes; tests assert the band per the regen throttle template (test lines 155–178).

### Single-transaction atomicity with fresh re-select (Pitfall 4)
**Source:** `server.js:1670–1671` (disable's own), commented at `1581–1583`
**Apply to:** the whole disable flow — all six statements (2FA wipe, recovery wipe, challenge wipe, session revoke) plus verify must live in the one `transaction(() => {...})`; every miss returns an outcome string with zero writes.

### i18n string discipline (D-111)
**Source:** `src/locales/en.json:1266–1279` and `fr.json` (mirror namespace), both verified to already contain `settings.tfa.turnOff` etc.; `act.turnOff` at en.json/fr.json (`act.turnOff` / "Désactiver")
**Apply to:** prefer reusing existing strings — likely zero changes. If any string changes, add EN + FR entries under `settings.tfa.*` and run `npm run i18n:scan` (prebuild gate).

### Route-comment documentation (D-106)
**Source:** the regen route's D-85 comment style, `server.js:1716–1718`
**Apply to:** a comment above the session-revoke delete stating the policy (revoke others, keep current) — same terse decision-tagged style (`// D-105: ...`).

## No Analog Found

None — every file this phase touches has an in-repo exact analog. The only genuinely new file names (`test/tfa-disable.test.mjs`, the e2e spec) follow established suite conventions listed above.

## Metadata

**Analog search scope:** `server.js` (auth/tfa route regions), `test/`, `e2e/`, `src/pages/`, `src/locales/`, `totp.js`
**Files scanned:** ~12 read, 9 verified tracked
**Pattern extraction date:** 2026-10-29
