# Phase 18: Closing Verification — i18n, Migration Proof & Real-Device UAT - Research

**Researched:** 2026-10-27
**Domain:** Verification/closure — Playwright e2e extension, node:test migration proof, i18n gate re-run, UAT harness, client state-fix regression
**Confidence:** HIGH (nearly all claims verified by direct file reads this session; infrastructure exists and is pattern-complete)

## Summary

This is a **closure phase, not a build phase**: no new packages, no new capabilities, no server routes. Every piece of infrastructure the phase needs already exists and was read this session: `e2e/flows.spec.mjs` (977+ lines, 12 tests, the `[en, fr]` per-language `for`-loop pattern with catalogue-imported assertions), `e2e/playwright.config.mjs` (port 4317, locale `en-US` pinned, `workers: 1` in CI, `webServer: node e2e/server.mjs` with graceful shutdown), `test/migration.test.mjs` (370 lines — 2FA columns, `login_challenges` + expiry index, `recovery_codes` byte-identical no-op, doc-field stripping all already asserted), `scripts/i18n-scan.mjs` (re-run this session: **0 literals / 0 pending / 0 unlisted / 0 stale / 0 unresolved / 0 placeholder-mismatch**), and the `16-UAT.md` frontmatter pattern (`status: complete`, numbered tests with expected/result).

The one **code change** in scope is small and precisely located: WR-01/WR-02 in `src/actions/actions.js` (`A.doTfaLogin` success path at :2770–2772 must set `S.ui.auth = 'login'` before `await finishLogin(...)`, and both `A.doLogin`/`A.doTfaLogin` should clear `S.ui.tfaRecoveryRemaining` at entry). The rest is test extension, audit document, and the human UAT file.

Two engineering traps deserve plan-level attention: (1) **TOTP window-boundary flakiness** — an e2e test computing a code near the 30 s boundary can race the server's own step window; the fix is deterministic (import `totp.js`'s `totpAt` and pick a code computed for a *stable* moment, or retry on failure with the ±1 step — D-76 already allows importing the module directly); (2) **shared login-throttle budget** — the e2e suite dodges throttles via per-account run-unique `X-Forwarded-For` (`clientIp(run, tag)`, [VERIFIED: e2e/helpers/setup.mjs:32-35]); every new auth test must follow that convention or 429s cross tests.

**Primary recommendation:** Plan 4 work items in the locked order — (1) WR-01/WR-02 fix + regression pin, (2) auth e2e suite in `flows.spec.mjs` parametric in EN/FR with TOTP computed via `totp.js` imports, (3) migration-proof extension + JSON key scan in `test/migration.test.mjs`, (4) `18-PITFALLS-AUDIT.md` + `18-UAT.md` — then run the full closing gate (`npm test && npm run lint && npm run format:check && npm run build && npm run e2e`) and leave the phase open on the UAT human gate.

<user_constraints>
## User Constraints (from CONTEXT.md — D-75…D-85, locked)

### Locked Decisions
- **D-75:** New auth e2e tests extend **`e2e/flows.spec.mjs`** — not a new spec file. Shared setup, one config. If flows.spec grows unwieldy the planner may split into a second describe block, but no separate file/config.
- **D-76:** TOTP in e2e is obtained by **test-secret + local computation** — the test knows the enrollment secret and computes the 6-digit code by importing `totp.js` directly. No test-only backdoor route in server.js.
- **D-77:** All new auth tests run **parametrically in EN + FR** (the `[en, fr]` pattern flows.spec already uses).
- Coverage required (criterion 2): session revocation (revoke others → they die, current survives — Pitfall 9), password change + revocation of other sessions (Pitfall 12), and the full 2FA login path (enroll via API/fixtures, login → pending2fa screen → code → signed in; recovery-code path included). This also discharges Phase 17's deferred visual verification of the 2FA flow.
- **D-78:** Extend **`test/migration.test.mjs`** — no separate final-proof test file. Add assertions for the newest schema (post-17: `sessions.pending_tfa` column behavior, `login_challenges` lifecycle cleanliness) and keep the byte-identical second-boot pattern.
- **D-79:** "Zero auth fields in workspace JSON" is a **direct DB assertion** in the same test file: open each workspace document, assert absence of `tfa` / `sessions` keys. No API/client surface re-test.
- **D-80:** The pitfalls checklist runs as a **dedicated audit task producing `18-PITFALLS-AUDIT.md`** in the phase dir: every PITFALLS.md item / verified-or-not / evidence / gap. Committed.
- **D-81:** A failing item becomes a **documented gap with a fix plan, not an inline fix**. Exception: WR-01/WR-02, pre-approved for fix here.
- **D-82:** UAT happens **after e2e is green**. Pattern = Phase 16's `16-UAT.md`: frontmatter status, numbered tests with expected/result. Content: QR scan with Google Authenticator + one other app, enroll → verify next code, then the full 2FA login on the device.
- **D-83:** The UAT file is created by the plan and executed by the human; `/gsd-verify-work` routes on its completion (status: complete in frontmatter).
- **D-84:** **WR-01 and WR-02 are fixed in this phase** (small client task), with a regression test pinning both.
- **D-85:** **IN-02 (logout sameOrigin) is NOT in this phase** — noted as a backlog observation in `18-PITFALLS-AUDIT.md` when the audit passes over it.

### Order of work (locked)
1. WR-01/WR-02 fix (D-84) → 2. e2e auth suite (D-75/76/77) → 3. Migration proof (D-78/79) → 4. Pitfalls audit (D-80/81) → 5. UAT file + human device verification (D-82/83).

### Deferred Ideas (OUT OF SCOPE)
- IN-02 logout CSRF (sameOrigin on logout route) — v1.3.x hardening pass (D-85).
- Any new capability suggestions from the audit → roadmap backlog, not this phase (D-81).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | All new strings/error codes catalogued EN+FR; i18n-scan gate green as a whole-surface check | Gate verified green today (0/0/0/0/0/0); runs as `prebuild`/`prebuild:en` and standalone via `npm run i18n:scan` [VERIFIED: package.json scripts]. FR visual half = existing `e2e/french-overflow.spec.mjs` + new FR-parametric auth tests (D-77). |
| AUTH-03 | All three flows covered e2e in Chromium both locales; QR verified by UAT on a real device (Google Authenticator + one other app) | Existing Chromium-only Playwright config [VERIFIED: e2e/playwright.config.mjs:31], `describe.for(['en','fr'])` pattern [VERIFIED: e2e/flows.spec.mjs:280], TOTP importable from e2e (`totpAt` export) [VERIFIED: totp.js:53], UAT frontmatter pattern [VERIFIED: 16-UAT.md]. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WR-01/WR-02 client state fix | Client (src/actions/actions.js) | — | Pure S.ui state-lifecycle bug; no server involvement |
| Auth flow e2e | Test tier (e2e/flows.spec.mjs) | e2e/server.mjs fixtures via real API | Browser proves the surface; fixtures only through the API (suite convention) |
| Migration purity proof | Test tier (test/migration.test.mjs) | test/helpers/legacy-fixture.mjs | Direct DB assertions against a real pre-v1.3 fixture on a real server |
| i18n whole-surface gate | Build gate (scripts/i18n-scan.mjs) | FR overflow e2e | Scan runs before bundler; visual FR proof in Chromium |
| Pitfalls audit | Documentation (.planning) | — | Evidence table, no code |
| Real-device QR UAT | Human | — | Not automatable; the phase's human_needed gate |

## Standard Stack

### Core (all existing — nothing to install)
| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| @playwright/test | ^1.64.1 (devDep) | Chromium e2e | Already configured; `npm run e2e` script exists [VERIFIED: package.json] |
| node:test | Node ≥24 (engines) | migration + regression tests | `npm test` runs `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json] |
| totp.js | project module | TOTP code computation in e2e (D-76) | Exports `totpAt(secretB32, timeSec)` — pure, RFC-vector-tested [VERIFIED: totp.js:44-53] |
| scripts/i18n-scan.mjs | project script | AUTH-01 gate | `npm run i18n:scan`; prebuild hook |

**Installation:** none. **Package Legitimacy Audit:** not applicable — this phase installs zero external packages.

## Architecture Patterns

### System Architecture Diagram

```
Legacy fixture DB (test/helpers/legacy-fixture.mjs)
        │  startServer() real server.js (no mocks)
        ▼
 migration.test.mjs ── first boot: backup + additive columns/tables
        │               ── direct DB asserts: no tfa/sessions doc keys (D-79)
        │               ── stop + second boot: snapshot deepEqual (Pitfall 21)
        ▼
 npm run build (prebuild → i18n-scan gate: AUTH-01)   [Vite]
        ▼
 e2e/server.mjs (throwaway mkdtemp DATA_DIR, TRUST_PROXY=1, port 4317)
        ▼
 e2e/flows.spec.mjs
   fixtures: API enroll (POST /api/auth/tfa/enroll → /enable with
             totpAt-computed code) + second sessions via fresh API contexts
        ▼
 Chromium (locale pinned en-US; FR from the account, D-02) × [en, fr]
        ▼
 18-PITFALLS-AUDIT.md (evidence table) ──► 18-UAT.md ──► HUMAN (real device:
   Google Authenticator + one other app) ──► /gsd-verify-work routes on
   frontmatter status: complete
```

### Pattern 1: EN/FR parametric auth e2e (D-75/D-77)
**What:** Extend `e2e/flows.spec.mjs`; per-language fixtures in `beforeAll` (`FLOW[lang]` map, run-unique accounts via `createAccount(base, run, tag, name, { locale: lang })`), tests inside `for (const lang of ['en', 'fr'])` describes, every asserted string via the local `fmt(key, vars, lang)` reading `src/locales/{en,fr}.json` directly — never raw literals.
**Example anchors** [VERIFIED: e2e/flows.spec.mjs:34-52, 89-100, 280-316]:
```js
// fmt() interpolates catalogue values exactly like t() incl. Intl.PluralRules
const CATALOGUE = { en, fr };   // imports at file head
for (const lang of ['en', 'fr']) { test(`... (${lang})`, async ({ browser }) => {...}); }
```
Locale discipline: browser is pinned `en-US`; French comes from the **account** (`PATCH /api/auth/me { locale: 'fr' }`), never the browser — except anonymous pages (/join, login), which use a `fr-FR` context (see the /join test, flows.spec.mjs:387).

### Pattern 2: TOTP code in e2e without a backdoor (D-76)
**What:** The test drives enrollment through the real API — `POST /api/auth/tfa/enroll` (returns pending secret) → compute the 6-digit code with the imported module → `POST /api/auth/tfa/enable` → later `POST /api/auth/login` returns `{ pending2fa, maskedEmail }` → `POST /api/auth/tfa/login` with the code [VERIFIED: server.js:1488, 1506, 1597 route sites; 17-VERIFICATION truths 1-3].
```js
import { totpAt } from '../totp.js';
const code = totpAt(secret, Math.floor(Date.now() / 1000)); // SHA1/6/30 defaults match D-54
```
**Window-boundary hardening (new pattern, planner should specify):** compute at `nowSec`, and on a rejection that could be a boundary race, recompute at `nowSec + 30` (one step forward, inside the server's ±1 window — D-04 accepts delta −1/0/+1). Never fabricate a code from a different secret; never widen the server window.

### Pattern 3: Migration proof extension (D-78/D-79)
**What:** `test/migration.test.mjs` already: boots a real server on a pre-v1.3 fixture, asserts the Phase-14 column set with type/notnull/dflt_value parity (P-B pattern, :223-242), asserts served-and-stored docs are stripped of `sessions`/`tfa` (:244-278), and deep-equals a full snapshot across a stop/second-boot (:281-322). The Phase-18 additions follow these exact shapes:
- extend the schema assertions for the post-17 surface (`sessions.pending_tfa` behavior per D-78; `login_challenges` lifecycle: starts empty, stays clean — note the legacy fixture has no login activity, so "cleanliness" here = no rows and byte-identical schema across boots),
- a **direct DB scan of every workspace row's `doc` JSON** asserting absence of `tfa` / `sessions` (and any auth-bearing keys the planner enumerates) — extend the `/"tfa"/.test(stringified)` regex-scan shape of :270-276 to a deliberate full-document key walk,
- keep the byte-identical second-boot snapshot (extend `snapshot()` if new auth state must be covered).

### Pattern 4: UAT file (D-82/D-83)
**What:** `18-UAT.md` in the phase dir, frontmatter `status: pending` → human flips to `complete`; numbered tests with `expected:`/`result:` blocks. Copy the 16-UAT structure verbatim [VERIFIED: 16-UAT.md]. Tests: (1) QR scan with Google Authenticator — enroll → verify next code; (2) QR scan with a second app (e.g. Aegis/Authy/2FAS); (3) full 2FA login on the device, both locales on the surface if practical.

### Anti-Patterns to Avoid
- **New spec files or a second Playwright config** for auth tests (D-75 explicitly forbids).
- **Test-only server backdoors** for TOTP codes (D-76 explicitly forbids).
- **Asserting raw English literals** in e2e — the suite's rule is catalogue-backed assertions only (flows.spec header convention).
- **Fixing red audit items inline** (D-81) — file the gap instead.
- **`npm run build:en` last before e2e** — known operational run-order rule: `build:en` last makes French e2e fail (STATE.md decisions). Full `npm run build` before `npm run e2e`.
- **Making `test:e2e` part of `npm test` silently** — CONTEXT flags this as a planner decision; if the closing gate runs both, it should be an explicit plan task (CI workers=1, ~long runtime), not a quiet package.json change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP codes in tests | Custom HOTP reimplementation | `import { totpAt } from '../totp.js'` (D-76) | Same RFC 4226/6238 logic as the server, fixture-vector proven |
| Locale strings in assertions | Hardcoded English/French text | `fmt()` + `src/locales/*.json` imports | Zero transcription drift; plural handling included |
| Per-IP throttle isolation | Shared fixed IPs across tests | `clientIp(run, tag)` per account/context | Login throttle is 10/15min per ip+email (D-03); setup.mjs's hash scheme prevents cross-test 429s [VERIFIED: e2e/helpers/setup.mjs:32-35] |
| Multi-session e2e state | Cookie juggling in one context | Fresh `apiClient`/browser context per "other device" with its own IP | Server keys revocation on token_hash; contexts model devices |
| Migration fixture | Hand-built SQL dump | `test/helpers/legacy-fixture.mjs` `createLegacyDb(dataDir)` | The existing fixture already encodes the pre-v1.3 shape |

## Runtime State Inventory

Migration/verification phase — the relevant inventory:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Legacy fixture DB in `test/helpers/legacy-fixture.mjs` — the only pre-v1.3 surface the migration test proves against | Extend assertions, not the fixture (unless post-17 schema needs new legacy-state representation) |
| Live service config | None — no external services; e2e server is spawned per run with `TRUST_PROXY=1`, `SEED_DATA=false`, `ALLOW_SIGNUP=true` [VERIFIED: e2e/server.mjs] | None |
| OS-registered state | None | None |
| Secrets/env vars | None new; test enrollment secret is generated per-run by the API | None |
| Build artifacts | `dist/` must be freshly built (full `npm run build`) before e2e; `playwright-report/` and `test-results/` are throwaway | Full build as the gate order |

## Common Pitfalls

### Pitfall A: TOTP 30-second boundary flake in e2e
**What goes wrong:** the test computes a code at 29.9 s into a step; the server verifies at 30.1 s (next step). A ±1 window (D-04) actually absorbs this — but only if the test does not also burn the retry budget (3 wrong codes kills the challenge, D-03) by resubmitting a *stale* code.
**How to avoid:** compute immediately before submit; if rejected, treat the retry as a *new* challenge only if the server reports the challenge alive; prefer computing for `nowSec + 1` or retrying with the next step's code once. Assert on `challengeExpired` distinctly from `invalidTfaCode` so a boundary flake is diagnosable.
**Warning signs:** intermittent e2e failure roughly 1 in 20 runs, always on the 2FA login test.

### Pitfall B: Throttle budget bleed across auth tests
**What goes wrong:** login attempts share one budget per ip+email (D-03); a test doing many logins for one account poisons later tests for the same ip+email pair; wrong-code attempts at the 2FA step (5/15min `2fa-login|ip|email`) are a separate but equally shared budget.
**How to avoid:** every new fixture account and every browser context gets `clientIp(run, <unique tag>)`; each e2e test creates its own account rather than reusing `FLOW[lang]` logins that already consumed budget. The wrong-code negative test must use a dedicated account.
**Warning signs:** 429 `tooManyAttempts` appearing only when the full suite runs, never when a single test runs.

### Pitfall C: Second-boot snapshot misses new auth state (Pitfall 21 recurrence)
**What goes wrong:** adding a `pending_tfa` column or challenge lifecycle changes without extending the snapshot means "byte-identical" silently excludes the new surface.
**How to avoid:** extend `snapshot()` in migration.test.mjs to cover every auth-bearing column/table the phases added; the existing deepEqual is the proof — its coverage is the only thing Phase 18 must grow.
**Warning signs:** a green second-boot test that does not mention post-17 columns.

### Pitfall D: Audit turns into a fix-fest (D-81)
**What goes wrong:** the PITFALLS-AUDIT pass discovers something imperfect and the executor "just fixes it" — scope creep in the closing phase.
**How to avoid:** the audit task's output is only `18-PITFALLS-AUDIT.md`; red rows get gap + fix plan text. The ONLY inline-fix exception is WR-01/WR-02 (pre-approved, D-84).
**Warning signs:** source diffs attributed to the audit task.

### Pitfall E: WR-01 fix regression shape
**What goes wrong:** fixing WR-01 by clearing `S.ui.auth` inside `finishLogin` breaks the normal login path (which legitimately passes through states before success).
**How to avoid:** apply the fix exactly where 17-REVIEW.md prescribes — in `A.doTfaLogin`'s success path, before `await finishLogin(...)` (actions.js:2772), plus WR-02's `S.ui.tfaRecoveryRemaining = null` at the entry of both `A.doLogin` and `A.doTfaLogin` [VERIFIED: 17-REVIEW.md:61-82; actions.js:2738-2773]. Pin with a client-level regression test in the existing node:test i18n/ui suites' style, not an e2e-only pin (the failure branch is hard to reach in Chromium).

### Pitfall F: UAT ordering violation (D-82)
**What goes wrong:** handing the human a UAT file while e2e is red — the human tests an unproven surface.
**How to avoid:** the plan makes the UAT-file task depend on the e2e task; `/gsd-verify-work` gates on frontmatter `status: complete`.

## Code Examples

### WR-01/WR-02 fix (from 17-REVIEW.md, pre-approved)
```js
// src/actions/actions.js — A.doTfaLogin success path (currently :2770-2772)
applyUser(res.data);
if (typeof res.data.recoveryRemaining === 'number') S.ui.tfaRecoveryRemaining = res.data.recoveryRemaining;
S.ui.maskedEmail = null;
S.ui.auth = 'login';                    // WR-01: any finishLogin failure render lands on the login card
S.ui.tfaRecoveryRemaining = null;       // WR-02 alternative placement — see below
await finishLogin(api.user?.name || api.user?.email || '', done);
// WR-02: ALSO clear the slot at the ENTRY of A.doLogin and A.doTfaLogin (alongside S.ui.errors = {}),
// per 17-REVIEW.md's primary recommendation — planner picks one consistent site (entry-clear) or both.
```

### 2FA e2e skeleton (patterns verified against flows.spec + server routes)
```js
import { totpAt } from '../totp.js';
test.describe('auth flows (Phase 18)', () => {
  for (const lang of ['en', 'fr']) {
    test(`a revoked session dies while the current one survives (${lang})`, async ({ browser }) => {
      const context = await newContext(browser, { ip: clientIp(run, `revoke-${lang}`) });
      // fixtures: two API contexts = two devices; revoke-others via the API the UI calls;
      // second device's page hits a requireUser surface → mid-session 401 → signOutRevoked copy (D-28 err.signedOutElsewhere)
    });
    test(`password change revokes other sessions (${lang})`, async ({ browser }) => { /* same two-device shape; PASS-03 copy asserted */ });
    test(`full 2FA login: enroll, login, pending2fa screen, code, signed in (${lang})`, async ({ browser }) => {
      // API: POST /api/auth/tfa/enroll → { secret } → code = totpAt(secret, ...) → POST /api/auth/tfa/enable
      // Browser: signIn → server answers pending2fa → assert the '2fa' screen (maskedEmail via catalogue fmt)
      //          → fill #tfa-login-code → land on /w/<slug>; recovery-path variant burns a code and
      //          asserts the post-landing recovery toast (auth.recoveryUsed / recoveryUsedLast)
    });
  }
});
```

### Migration JSON scan (extend the stored-doc shape of migration.test.mjs:270-276)
```js
// D-79: walk EVERY workspace row, not just ws_legacy
const docs = withDb(server.dbPath, db => db.prepare('select id, doc from workspaces').all());
for (const row of docs) {
  const parsed = JSON.parse(row.doc);
  assert.equal('sessions' in parsed.data, false, `ws ${row.id}: no sessions key`);
  assert.equal('tfa' in parsed.data, false, `ws ${row.id}: no tfa key`);
  // + any other auth-bearing keys the planner enumerates from 13-DECISIONS
}
```

## State of the Art

Not applicable — no library churn. The only "current" item is that i18n-scan is already clean and Phase 17's suite is at 520 passing node tests (17-VERIFICATION), so the phase starts from a fully green base.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Phase-14/16 migration test already covers everything post-17 except what D-78 lists (`sessions.pending_tfa` behavior, login_challenges lifecycle cleanliness) — i.e. no other post-17 schema surface needs a new assertion | Pattern 3 | A byte-identical gap goes unproven; mitigation: the audit task double-checks `pragma table_info` outputs against server.js SCHEMA |
| A2 | `sessions` table has (or will have by the time this phase runs) a mechanism touching `pending_tfa` exactly as CONTEXT words it; the planner should verify the actual column/behavior name in server.js before writing the assertion | Pattern 3 | Wrong column name fails the parse/assert — cheap to catch at execution |
| A3 | The e2e login screen labels for anonymous pages can be asserted from the English catalogue for the FR variant when the login form is negotiated (the suite's existing signIn convention) — for the 2FA pending screen, the account patch to `fr` makes the post-pending surface French, but the login form itself follows the negotiated rule | Pattern 1 / Pitfall B | Wrong locale expectation in the FR 2FA test; mitigation: follow the /join test's fr-FR-context precedent for the anonymous login form |
| A4 | `API` enroll response exposes the pending secret in a form the test can read (`res.data.secret` or equivalent) | Code Examples | The test needs one field-name check at execution time against server.js:1488 handler |

## Open Questions

1. **Does the closing gate include e2e in `npm test`?**
   - What we know: `test:e2e` is NOT part of `npm test` today; CONTEXT explicitly leaves this to the planner.
   - Recommendation: keep them separate commands but define the phase gate as the explicit sequence `npm test && npm run lint && npm run format:check && npm run build && npm run e2e` — no package.json change needed.

2. **WR-02 clear-site choice** — entry-clear of both doLogin/doTfaLogin (reviewer's primary rec) vs clearing in finishLogin failure branches.
   - Recommendation: entry-clear (simpler, covers all failure branches); pin with the regression test.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | ✓ | engines: >=24; totp.js/node:sqlite used everywhere | — |
| @playwright/test + Chromium | e2e | ✓ | ^1.64.1 devDep; `npm run e2e` working (Phase 17 run) | — |
| Vite build | e2e serves dist/ | ✓ | ^6.4.4 | — |
| Real phone + authenticator apps | UAT | human-provided | — | None — this is the human gate (AUTH-03); cannot be automated |

No missing dependencies with a viable fallback; the UAT device is by design a human_needed gate.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node ≥24) + @playwright/test ^1.64.1 |
| Config file | e2e/playwright.config.mjs (Chromium only); node --test via package.json |
| Quick run command | `node --test test/migration.test.mjs` |
| Full suite command | `npm test` (520+ tests) then `npm run build && npm run e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | i18n gate green over final tree | build gate | `node scripts/i18n-scan.mjs` (exit 0) | ✅ |
| AUTH-01 | FR renders all three flows | e2e | `npm run e2e` (FR variants of new auth tests) | ❌ Wave 0 (new) |
| AUTH-03 | Session revocation e2e, both locales | e2e | `npm run e2e` | ❌ Wave 0 (new) |
| AUTH-03 | Password change + revocation e2e, both locales | e2e | `npm run e2e` | ❌ Wave 0 (new) |
| AUTH-03 | Full 2FA login path e2e incl. recovery, both locales | e2e | `npm run e2e` | ❌ Wave 0 (new) |
| AUTH-02 (final) | Additive migration + byte-identical second boot + no auth doc keys | node:test | `node --test test/migration.test.mjs` | ✅ (extend) |
| AUTH-03 | QR on real device (GA + second app) | manual-only | — UAT file `18-UAT.md`; justification: physical device scan | — (D-82) |
| WR-01/02 | State fix pinned | unit (client-level) | `node --test` on the chosen suite | ❌ Wave 0 (new) |

### Sampling Rate
- **Per task commit:** the task's touched suite (e.g. `node --test test/migration.test.mjs` or the e2e spec).
- **Per wave merge:** `npm test`.
- **Phase gate:** full `npm test && npm run lint && npm run format:check && npm run build && npm run e2e` green + `18-PITFALLS-AUDIT.md` committed + `18-UAT.md` status: complete.

### Wave 0 Gaps
- [ ] Auth e2e tests inside `e2e/flows.spec.mjs` (D-75) — AUTH-03
- [ ] WR-01/WR-02 regression test — D-84
- [ ] Extended migration assertions (D-78/D-79) — extension of existing file
- [ ] `18-PITFALLS-AUDIT.md` and `18-UAT.md` artifacts — not tests but required gate artifacts

## Security Domain

Applicable ASVS categories (this phase verifies, does not build): V3 Session Management (revocation proofs — Pitfalls 9/10/12 items in the audit), V5 Input Validation (none new), V6 Cryptography (TOTP replay guard, timingSafeEqual — checklist items), V7 (throttle/lockout hygiene — Pitfalls 18/items). Known patterns to re-verify in the audit: revoke-others keep-current SQL; pending-2FA anonymity matrix (T-17-02); budget carry-over password→2FA (D-03); no timing disclosure in 429 copy (D-13 grep gate). The audit table is the verification instrument — every item cites test name or code location, per D-80. IN-02 (logout sameOrigin) is explicitly observed-and-filed, not fixed (D-85).

## Sources

### Primary (HIGH confidence — all read this session)
- `e2e/flows.spec.mjs`, `e2e/playwright.config.mjs`, `e2e/server.mjs`, `e2e/helpers/setup.mjs` — e2e patterns, throttle scheme, server env
- `test/migration.test.mjs`, `test/helpers/legacy-fixture.mjs` — migration-proof shapes
- `totp.js` — `totpAt` export, D-04 window/contract comments
- `src/actions/actions.js` :2621-2793 — finishLogin, doLogin pending branch, doTfaLogin, reportRecoveryBurn (WR-01/WR-02 exact sites)
- `scripts/i18n-scan.mjs` run output — 0/0/0/0/0/0
- `server.js` route sites `/api/auth/tfa/{enroll,enable,disable,login}` (:1488/1506/1548/1597)
- `.planning/phases/17-login-second-factor-flow/17-REVIEW.md` (WR-01/WR-02/IN-02), `17-VERIFICATION.md` (deferred item, 520-test baseline)
- `.planning/phases/16-totp-core-enrollment/16-UAT.md` — UAT frontmatter pattern
- `.planning/research/PITFALLS.md` — 22 pitfalls + the 13-item "Looks Done But Isn't" checklist
- `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` — D-03/D-04/D-11/D-13 anchors
- `package.json` — scripts, engines, devDeps

### Secondary (MEDIUM confidence)
- CONTEXT.md code_context notes (throttle isolation "likely already" in setup.mjs — upgraded to VERIFIED by reading setup.mjs)

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack / infra: HIGH — every referenced file read and commands verified this session
- Architecture patterns: HIGH — copied from in-repo proven patterns, not external docs
- Pitfalls: HIGH for A/B/D/E/F (code-grounded); MEDIUM for A2/A4 specifics (execution-time field-name check)
- UAT flow: HIGH on pattern, inherently manual on execution

**Research date:** 2026-10-27
**Valid until:** 2026-11-26 (stable — closure phase over a frozen codebase)
