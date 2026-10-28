# Phase 18: Closing Verification — i18n, Migration Proof & Real-Device UAT - Pattern Map

**Mapped:** 2026-10-27
**Files analyzed:** 6 (2 modified source/test files, 1 new test file, 2 new phase docs, 1 shared-helpers reuse)
**Analogs found:** 5 / 6 (the only no-analog item is `18-PITFALLS-AUDIT.md`, whose shape is defined by D-80, not code)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/actions/actions.js` (modify — WR-01/WR-02) | client actions (controller) | event-driven (A[] dispatcher) | self — fix sites at `:2738-2773`; regression-pinning pattern from `test/locale-negotiate.test.mjs` | exact |
| `test/tfa-state-fix.test.mjs` (new — WR-01/WR-02 regression pin, planner names it) | test | static source-structure assertions | `test/locale-negotiate.test.mjs` | role-match |
| `e2e/flows.spec.mjs` (extend — auth e2e, D-75/76/77) | e2e spec | request-response via real API fixtures | self — `[en, fr]` describe pattern, `fmt()`, `signIn`, `newContext` | exact |
| `test/migration.test.mjs` (extend — D-78/79) | test (migration proof) | direct DB asserts | self — column-parity, doc-scan and snapshot patterns | exact |
| `18-PITFALLS-AUDIT.md` (new) | documentation | evidence table | none in codebase; shape locked by D-80 | no analog |
| `18-UAT.md` (new) | documentation (human gate) | numbered tests w/ frontmatter | `.planning/phases/16-totp-core-enrollment/16-UAT.md` | exact |

Shared helpers to reuse (not modify): `e2e/helpers/setup.mjs` (`apiClient`, `clientIp`, `createAccount`, `newRunId`, `PASSWORD`), `totp.js` (`totpAt`), `test/helpers/legacy-fixture.mjs` + `test/helpers/server.mjs` (`startServer`, `withDb`, `login`). All verified git-tracked (`git ls-files` non-empty).

## Pattern Assignments

### `src/actions/actions.js` (modify — WR-01/WR-02, D-84)

**Analog (fix sites):** self, per 17-REVIEW.md. **Regression-pin analog:** `test/locale-negotiate.test.mjs`.

**The exact code being changed** (`src/actions/actions.js:2768-2772`, `A.doTfaLogin` success path):
```js
    applyUser(res.data);
    /* D-73/D-74: keep the recovery count for the post-landing honest report. */
    if (typeof res.data.recoveryRemaining === 'number') S.ui.tfaRecoveryRemaining = res.data.recoveryRemaining;
    S.ui.maskedEmail = null;
    await finishLogin(api.user?.name || api.user?.email || '', done);
```

**Entry-clear site** (`:2738-2740`, `A.doTfaLogin` entry — the entry of `A.doLogin` at `:2689-2690` has the same `S.ui.errors = {}` line):
```js
A.doTfaLogin = () => {
  S.ui.errors = {};
  const code = $('#tfa-login-code')?.value?.trim() || '';
```

**The fix to apply** (per 17-REVIEW.md / Research Code Examples — WR-01 then WR-02 in the success path; plus the entry-clear of `S.ui.tfaRecoveryRemaining` at both `A.doLogin` and `A.doTfaLogin` alongside `S.ui.errors = {}`):
```js
    applyUser(res.data);
    if (typeof res.data.recoveryRemaining === 'number') S.ui.tfaRecoveryRemaining = res.data.recoveryRemaining;
    S.ui.maskedEmail = null;
    S.ui.auth = 'login';                    // WR-01: any finishLogin failure render lands on the login card
    S.ui.tfaRecoveryRemaining = null;       // WR-02
    await finishLogin(api.user?.name || api.user?.email || '', done);
```
**Constraint (Pitfall E):** do NOT clear `S.ui.auth` inside `finishLogin` — that breaks the normal login path. The insertion must sit between `S.ui.maskedEmail = null;` and `await finishLogin(` in `A.doTfaLogin` only. Note `reportRecoveryBurn()` (`:2681-2687`) reads `S.ui.tfaRecoveryRemaining` — the WR-02 entry-clear means the value set at `:2770` must survive until `finishLogin` completes (clear at entry, consume in `reportRecoveryBurn`, do not clear again before the toast fires).

### `test/tfa-state-fix.test.mjs` (new test — WR-01/WR-02 pin)

**Analog:** `test/locale-negotiate.test.mjs:174-208` — source-structure assertions against `actions.js` via a `bodyOf` helper. This is the suite's established way to pin client action ordering without a browser:

```js
/* test/locale-negotiate.test.mjs:186-202 — the shape to copy */
const finish = bodyOf(ACTIONS, 'async function finishLogin');
assert.ok(
  finish.indexOf('await adoptAccountLocale()') < finish.indexOf('hydrateFromServer('),
  'finishLogin: adoption before hydration and the render that follows',
);
for (const [header, call] of [['A.doLogin = () =>', 'api.login('], ...]) {
  const fn = bodyOf(ACTIONS, header);
  const delegated = fn.indexOf('await finishLogin(');
  assert.ok(delegated > fn.indexOf(call), `${header}: the finishLogin delegation is after the auth call`);
}
```

**Copy for Phase 18:** read `src/actions/actions.js` as text; assert on `bodyOf(ACTIONS, 'A.doTfaLogin = () =>')` that (a) the index of `S.ui.auth = 'login'` and of `S.ui.tfaRecoveryRemaining = null` is less than the index of `await finishLogin(`, and (b) both `A.doLogin` and `A.doTfaLogin` bodies clear `S.ui.tfaRecoveryRemaining` before their first `await api.` call. Header style: block comment explaining the pinned contract, `import assert from 'node:assert/strict'`, plain `test()` (no before/after, no server).

### `e2e/flows.spec.mjs` (extend — auth e2e, D-75/76/77)

**Analog:** self. The header comment (`:1-23`) states the file's conventions — extend inside this file, following them.

**Imports & catalogue discipline** (`:24-29`, `:34-43`):
```js
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, inviteToken, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const CATALOGUE = { en, fr };

function fmt(key, vars, lang) {   // interpolates {name}/{n} incl. Intl.PluralRules — NEVER raw literals
  let s = CATALOGUE[lang][key];
  ...
}
```
**New import to add (D-76):** `import { totpAt } from '../totp.js';` — `totpAt(secretB32, timeSec)` at `totp.js:53` is pure and importable from e2e.

**Per-language parametric describe** (`:279-316`):
```js
test.describe('onboarding wizard', () => {
  for (const lang of ['en', 'fr']) {
    test(`a browser signup walks the onboarding wizard and lands in the created workspace (${lang})`, async ({ browser }) => {
      ...
      const context = await newContext(browser, { ip: clientIp(run, tag) });
      const page = await context.newPage();
      try {
        ...
      } finally {
        await context.close();
      }
    });
  }
});
```

**Locale discipline** — browser pinned `en-US`; French from the account via `PATCH /api/auth/me { locale: 'fr' }` (`:301-309`), EXCEPT anonymous pages which use a negotiated context (`:387`):
```js
const context = await newContext(browser, { ip: clientIp(run, `joiner-${lang}`), lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
```
The 2FA login form is anonymous → use this `fr-FR`-context lever for the FR variant (A3 mitigation); the signed-in surface after the code follows the account locale.

**Context/device pattern** (`:65-73`):
```js
async function newContext(browser, { ip, lang = 'en-US' } = {}) {
  const context = await browser.newContext({
    baseURL: BASE_URL, locale: lang,
    extraHTTPHeaders: ip ? { 'x-forwarded-for': ip } : undefined,
  });
  ...
}
```
Two API clients with distinct `clientIp(run, tag)` addresses model "two devices" for revocation tests — one shared context per device, never cookie juggling in one context.

**Throttle isolation (Pitfall B):** every fixture account and browser context presents its own run-unique `clientIp(run, tag)` (`e2e/helpers/setup.mjs:32-35`); each test creates its own account; the wrong-code negative test uses a dedicated account.

**TOTP boundary hardening (Pitfall A):** compute `totpAt(secret, Math.floor(Date.now() / 1000) + 1)` immediately before submit; on a rejection where the challenge is still alive, retry once with the next step's code (`nowSec + 30`). Server window is ±1 step (D-04, `totp.js:66`). Assert `challengeExpired` distinctly from `invalidTfaCode`.

**API route sites the fixtures call** (server.js): `POST /api/auth/tfa/enroll` (:1488, returns pending secret), `POST /api/auth/tfa/enable` (:1506), `POST /api/auth/tfa/login` (:1597). Verify the enroll response field name at execution time (A4).

### `test/migration.test.mjs` (extend — D-78/79)

**Analog:** self. Three existing shapes to copy.

**Column/definition parity** (`:223-242`) — extend for the post-17 surface (verify the actual `pending_tfa` column/behavior name in server.js SCHEMA first, A2):
```js
const col = (table, name) => withDb(server.dbPath, db => db.prepare(`pragma table_info(${table})`).all().find(c => c.name === name));
// ...
const expected = { 'sessions.label': { type: 'TEXT', notnull: 0, dflt_value: null }, ... };
for (const [key, want] of Object.entries(expected)) {
  const got = col(table, name);
  assert.deepEqual({ type: got.type, notnull: got.notnull, dflt_value: got.dflt_value }, want, `${key} definition matches the SCHEMA declaration`);
}
```

**Lifecycle cleanliness** (`:220`): `assert.equal(withDb(server.dbPath, db => db.prepare('select count(*) as n from login_challenges').get()).n, 0, 'login_challenges starts empty');` — plus "no rows" and byte-identical schema across the second boot.

**Direct DB doc scan (D-79)** — extend the stored-doc regex shape (`:270-276`) to a full walk of EVERY workspace row:
```js
const docs = withDb(server.dbPath, db => db.prepare('select id, doc from workspaces').all());
for (const row of docs) {
  const parsed = JSON.parse(row.doc);
  assert.equal('sessions' in parsed.data, false, `ws ${row.id}: no sessions key`);
  assert.equal('tfa' in parsed.data, false, `ws ${row.id}: no tfa key`);
  // + any other auth-bearing keys enumerated from 13-DECISIONS
}
```

**Byte-identical second boot (Pitfall 21, Pitfall C):** extend `snapshot()` (`:281-301`) to cover the new auth state (e.g. add `sessions.pending_tfa` columns/values and `login_challenges` rows to the returned object), keeping the `:303-322` deepEqual pattern:
```js
const firstBoot = snapshot();
await server.stop();
server = await startServer({ dataDir });
assert.deepEqual(snapshot(), firstBoot, 'no drift');
```

### `18-UAT.md` (new — D-82/83)

**Analog:** `.planning/phases/16-totp-core-enrollment/16-UAT.md` — copy the structure verbatim:
```markdown
---
status: pending          # ← human flips to complete; /gsd-verify-work gates on this
phase: 18-closing-verification-i18n-migration-proof-real-device-uat
source: [18-VERIFICATION.md]
started: <ISO> / updated: <ISO>
---

### 1. Real-device QR scan — Google Authenticator
expected: |
  ...
result: pass
```
Numbered tests, `expected:` block per test, `## Summary` (total/passed/issues/pending/skipped/blocked), `## Gaps`. Content per D-82: (1) GA scan → enroll → verify next code; (2) second app (Aegis/Authy/2FAS) scan; (3) full 2FA login on the device, both locales if practical. Create it with `status: pending`, task depends on e2e being green (Pitfall F).

### `18-PITFALLS-AUDIT.md` (new — D-80/81)

**No codebase analog** — shape locked by D-80: one table row per PITFALLS.md item (Pitfalls 1–21+ and the "Looks Done But Isn't" checklist), columns item / verified-or-not / evidence (test file & test name, or code cite — use the concrete anchors in RESEARCH.md's Test Map) / gap. Red rows get "gap + fix plan" text only (D-81); the sole inline-fix exception is WR-01/WR-02. When the audit passes IN-02, record it as a backlog observation, not a fix (D-85).

## Shared Patterns

### Throttle-safe multi-device fixtures
**Source:** `e2e/helpers/setup.mjs:32-35, 45-79, 125-136`
**Apply to:** all new auth e2e tests
```js
export function clientIp(run, tag) {
  const h = createHash('sha1').update(`${run}:${tag}`).digest();
  return `10.${h[0]}.${h[1]}.${(h[2] % 254) + 1}`;
}
```
Each account/context gets its own tag; a device = its own `apiClient` or browser context with that IP.

### Catalogue-backed assertions (no raw literals)
**Source:** `e2e/flows.spec.mjs:26-52`
**Apply to:** every assertion in the new e2e tests — `fmt(key, vars, lang)` over imported `src/locales/{en,fr}.json`; error-copy keys come from the D-11 error catalogue (`err.challengeExpired`, `err.invalidTfaCode`, `err.tooManyAttempts`, `err.signedOutElsewhere`).

### Direct-DB assertion helper
**Source:** `test/migration.test.mjs:22-24` via `test/helpers/server.mjs`
**Apply to:** all D-78/79 additions — `withDb(server.dbPath, db => ...)` + `assert` from `node:assert/strict`.

### Status-checked fixture calls
**Source:** `e2e/flows.spec.mjs:55-60` (`must(step, res, allowed)`)
**Apply to:** every API fixture call in the new tests — explicit allowed-status arrays, never unchecked.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `18-PITFALLS-AUDIT.md` | documentation | evidence table | No prior phase produced a pitfalls evidence table; shape defined entirely by D-80. Use `.planning/research/PITFALLS.md` as the row source and `16-UAT.md` for file conventions. |

## Metadata

**Analog search scope:** `e2e/`, `test/`, `src/actions/`, `scripts/`, `.planning/phases/16-totp-core-enrollment/`
**Files scanned:** ~15 (4 read in full or large part, 3 read in targeted ranges)
**Tracked-source gate:** all named analog paths verified via `git ls-files` (non-empty); no mirror paths.
**Pattern extraction date:** 2026-10-27
