# Phase 21: Disable-2FA Verification & Closure - Research

**Researched:** 2026-10-29
**Domain:** Node.js http server route tightening (server.js), SQLite transactional teardown, node:test regression coverage, Playwright/Chromium e2e
**Confidence:** HIGH

## Summary

This phase is almost entirely **subtractive and additive edits to one already-shipped route** plus proof. The disable route (`server.js:1656–1700`) already has the right scaffold: guard order, throttle, `readJson`, a single `transaction()` with fresh in-transaction re-select, complete `two_fa_*` + recovery-code teardown, and honest outcome mapping. Phase 21 (a) deletes the recovery-code else-branch (`server.js:1673–1688`) and replaces it with the strict-6-digit gate already proven in the regen route (`server.js:1719`), (b) adds two more deletes inside the same transaction — pending `login_challenges` for the user and all sessions except the caller's — and (c) records `logSecurity(user.id, 'tfa_disabled')` after the transaction commits, mirroring `server.js:1747`.

The research confirms every cited mechanism exists and behaves as the CONTEXT claims: the revoke-others precedent is literally at `server.js:1587` (`delete from sessions where user_id = ? and token_hash != ?`), the `login_challenges` schema is at `server.js:117–123`, the challenge burn sites are at `server.js:1534, 1783–1790, 1794, 1799, 1837`, and a background sweeper (`server.js:2807–2808`) deletes only *expired* challenges — so pending ones genuinely persist until torn down, which is exactly the ghost state DIS-01 targets. Test infrastructure is mature: `test/tfa-recovery-regen.test.mjs` is the direct template for the server-level suite (real server, real SQLite, throwaway `MASTER_KEY`, `totpAt` helper), and `e2e/flows.spec.mjs` already contains a parametric EN+FR 2FA spec with API-driven enroll/login helpers to reuse.

**Primary recommendation:** Mirror the regen route's strict-gate pattern line-for-line into the disable route, add the two deletes + session revoke inside the existing transaction, log the verb after commit, then write one server test file (recovery-code rejection, pending-challenge teardown, throttle/503/wrong-password) and one Chromium spec covering disable→re-enroll in EN+FR.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-101:** The D-57 recovery-code branch is **deleted entirely** from the disable route. Non-6-digit input is rejected with 400 `codeRejected` before any `recovery_codes` access — the exact D-85 pattern the regen route already implements (`server.js:1704+`). No recovery lookup exists anywhere in the route. *(Reversibility: costly — the "no recovery lookup" property is the load-bearing DIS-02 invariant.)*
- **D-102:** The regression test posts a valid, unused recovery code to the disable route and asserts 400 `codeRejected` **and** that recovery codes remain intact (not burned, not deleted) and 2FA remains enabled.
- **D-103:** Disable deletes **all** `login_challenges` rows for the user (`delete from login_challenges where user_id = ?`) inside the existing disable transaction — not just unexpired ones.
- **D-104:** Regression coverage: disable while a pending challenge exists, then prove the challenge token no longer completes login.
- **D-105:** Disable revokes **all sessions except the current one** (`delete from sessions where user_id = ? and token_hash != ?`), mirroring the password-change precedent (`server.js:1587`), inside the same transaction.
- **D-106:** The policy is documented in the route comment and asserted in e2e: a second browser session goes through the central honest 401 teardown after disable.
- **D-107:** Successful disable records `logSecurity(user.id, 'tfa_disabled')` — log after the transaction commits 'ok', before the response.
- **D-108:** The existing throttle (`tfa-disable|${user.id}`, 5/15min), guard order (`sameOrigin` → `requireUser` → throttle → `readJson`), and `requireTotpSecret` fail-closed 503 stay as shipped — verified, not rewritten. Wrong-password attempts still consume a try.
- **D-109:** One Chromium spec covers the full cycle in EN and FR: enable → login with 2FA → disable (password + TOTP) → login without 2FA → re-enable. Plus the recovery-code rejection regression (UI level) and the session-policy assertion.
- **D-110:** Server-level tests (not e2e) cover: pending-challenge teardown, throttle, wrong password, wrong code, and 503 `masterKeyMissing`. Exhaustive error-state rendering in-browser is out of scope.
- **D-111:** All new user-facing strings (if any) catalogued EN + FR under `settings.tfa.*`; i18n-scan must stay green.

### the agent's Discretion
- Exact test file placement and naming within existing conventions; whether D-104/D-102 server tests live in one file or follow the existing tfa test split; FR/EN copy for any touched strings; route comment wording for the session policy.

### Deferred Ideas (OUT OF SCOPE)
- None. Operator session revocation belongs to Phase 22; key rotation and key-custody runbook remain deferred per REQUIREMENTS.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIS-01 | Pending `login_challenges` teardown, one-transaction cleanup of `two_fa_*` + recovery codes, explicit session policy on disable | Verified route scaffold (`server.js:1656–1700`), revoke-others precedent (`server.js:1587`), challenge schema/lifecycle (`server.js:117–123, 1501, 1783–1837`), sweeper that only removes expired rows (`server.js:2807–2808`) |
| DIS-02 | A recovery code can never disable 2FA — password + live TOTP required (regression-tested) | Strict-gate reference implementation at `server.js:1719`; existing recovery-code generation/normalization helpers (`recoveryHash`, `normalizeRecoveryCode` in `totp.js`) usable to mint a valid code in the regression test |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recovery-code rejection on disable | API/Backend (`server.js` route) | — | Structural invariant: the route must contain no recovery lookup at all |
| Pending challenge teardown | API/Backend (inside disable transaction) | Database/Storage (SQLite `login_challenges`) | Atomicity requires same transaction as the `two_fa_*` wipe |
| Session policy (revoke others) | API/Backend (same transaction) | Database/Storage (`sessions`) | Mirrors password-change precedent, same tier |
| Activity verb | API/Backend (`logSecurity` after commit) | — | Security-log only on success |
| Full-cycle e2e proof | Browser/Client (Playwright Chromium) | API/Backend (real server via `e2e/server.mjs`) | D-109 demands UI-driven, two-language proof |

## Standard Stack

### Core
No new packages. Everything needed is already installed and used by sibling suites.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:test runner | Node v24.21.0 [VERIFIED: `node --version` this session] | Server-level regression tests | All existing `test/*.test.mjs` suites use it (`npm test` = `node --test --test-concurrency=2 test/*.test.mjs`) |
| `@playwright/test` | ^1.64.1 [VERIFIED: package.json] | Chromium e2e, EN+FR parametric | `npm run e2e` → `playwright test --config e2e/playwright.config.mjs` |
| `totp.js` helpers | in-repo | `totpAt(secret, epoch)`, `recoveryHash`, `normalizeRecoveryCode` for minting test fixtures | Used verbatim by `test/tfa-recovery-regen.test.mjs` [VERIFIED: test/tfa-recovery-regen.test.mjs:7–8] |
| `test/helpers/server.mjs` | in-repo | `signup`, `startServer({ dataDir, env: { MASTER_KEY } })`, `withDb(dbPath, fn)` | Direct template pattern |

**Installation:** none — zero new dependencies. **Package Legitimacy Audit: N/A** (no external packages installed this phase).

## Architecture Patterns

### System Architecture Diagram

```
POST /api/auth/tfa/disable
  │
  ├─ sameOrigin → requireUser → tooMany(tfa-disable|uid, 5/15min) → readJson   [unchanged, D-108]
  │
  ├─ validate: currentPassword present, code present
  ├─ GATE (D-101): code must match /^\d{6}$/  ── else 400 codeRejected  (NO recovery lookup)
  │
  └─ transaction():
       ├─ re-select user fresh (password_hash, two_fa_*)
       ├─ verifyPassword ── miss → 'password' (403)
       ├─ requireTotpSecret(fresh.two_fa_secret) ── miss → 'masterKey' (503)
       ├─ verifyTotpCode(±1 window, replay guard vs two_fa_last_step) ── miss → 'code' (400)
       ├─ update users set two_fa_enabled=0, two_fa_secret='', two_fa_last_step=0
       ├─ delete from recovery_codes where user_id = ?
       ├─ delete from login_challenges where user_id = ?          (D-103, NEW)
       └─ delete from sessions where user_id = ? and token_hash != caller  (D-105, NEW)
     commit 'ok'
       ├─ logSecurity(user.id, 'tfa_disabled')   (D-107, after commit)
       └─ 200 {ok:true}  (Cache-Control: no-store via json())
```

### Pattern 1: Strict-6-digit structural gate (D-85 mirror)
**What:** Validate code shape *before* entering the transaction, with no else-branch and no recovery_codes access.
**When to use:** The disable route's step-up (D-101).
**Example (verbatim reference — `server.js:1717–1719`):**
```javascript
    // D-85 (structural invariant): strict 6-digit-only gate with NO else-branch
    // and NO recovery_codes lookup anywhere in this route — a recovery code
    // can never satisfy the step-up.
    if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', 'Enter a 6-digit verification code');
```

### Pattern 2: Revoke-others inside the caller's transaction
**What:** `delete from sessions where user_id = ? and token_hash != ?` where the second param is the sha256 of the *caller's own cookie* — never a body value.
**Example (verbatim — `server.js:1578–1587`):**
```javascript
    // Pitfall 9: hash the caller's own cookie — never a body or param value.
    const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    // PASS-02: verify, rehash and revoke-others are one atomic unit.
    const ok = transaction(() => {
      ...
      // Keep-current (P-H): the caller's own session is excluded by the != clause.
      db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
```

### Pattern 3: logSecurity after commit
**What:** Record the security verb only after the transaction returns 'ok', before the response. Do NOT move it inside the transaction for disable (the regen route does include it in-transaction via D-99 — either placement satisfies D-107's "after commit, before response" wording; after-commit is the simpler match and the D-107 text says "log after the transaction commits 'ok'").

### Recommended Project Structure
```
server.js                                   # route edit (only production file touched)
test/tfa-disable.test.mjs                   # NEW server-level suite (D-102, D-104, D-110)
e2e/tfa-disable-cycle.spec.mjs              # NEW Chromium spec, EN+FR (D-109) — name at planner's discretion
src/pages/settings.js                       # NO changes expected (disable form already exists)
src/locales/en.json, fr.json                # only if any string changes (D-111)
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP fixture codes in tests | Manual HMAC math | `totpAt(secret, Date.now()/1000)` from `totp.js` | Same helper the regen suite uses; replay guard handled by `resetLastStep` pattern |
| Valid recovery-code fixture | Random strings | `generateRecoveryCode` path — or insert a known hash via `recoveryHash(normalizeRecoveryCode(code))` directly with `withDb` | Must match the ONE normalization or the test proves nothing |
| Throwaway encrypted-secret env | Setting MASTER_KEY globally | `startServer({ dataDir, env: { MASTER_KEY: '...' } })` | Existing helper isolates per-suite |
| Two-browser e2e session | New context juggling | Playwright `browser.newContext()` per session (standard) | D-106 needs a genuinely separate cookie jar |

**Key insight:** Every hard part (TOTP verify, envelope decrypt, transaction, throttle) is already built and tested. This phase's difficulty is *proof coverage*, not implementation.

## Common Pitfalls

### Pitfall 1: Keeping any recovery_codes reference in the route
**What goes wrong:** Even a comment-level or dead lookup reintroduces the dual-shape hazard D-57 caused.
**How to avoid:** After the edit, `grep -n recovery server.js` scoped to the disable route body must return zero hits. This is the D-101 structural invariant and the regression test's reason to exist.

### Pitfall 2: Burning a recovery code in the failed-attempt path
**What goes wrong:** D-102 asserts codes stay intact after a rejected disable. If the route touches `recovery_codes` on the rejection path, the assertion fails.
**How to avoid:** The strict gate fires before the transaction; nothing in the transaction references recovery_codes except the teardown delete (which only runs on success — fine, it deletes the user's codes as part of disable).

### Pitfall 3: Revoking the caller's own session
**What goes wrong:** A `delete ... where user_id = ?` without the `token_hash != ?` clause logs the user out mid-flow and breaks the e2e "user sees the updated card" expectation (D-105 rationale).
**How to avoid:** Hash the caller's cookie exactly as `server.js:1578–1587` does; assert the current session survives in the server test too.

### Pitfall 4: logSecurity inside the transaction on a failing path
**What goes wrong:** If the verb is recorded but the transaction later rolls back (or vice versa), the security log lies.
**How to avoid:** Follow D-107 literally: log only after `outcome === 'ok'`, before `json(res, 200, ...)`.

### Pitfall 5: Challenge teardown scope
**What goes wrong:** `delete from login_challenges where user_id = ?` is naturally user-scoped, but a sloppy `where challenge_token_hash` variant would miss rows; an unscoped delete would break other users' in-flight logins.
**How to avoid:** Exactly the D-103 statement, keyed on `user_id` only.

### Pitfall 6: e2e replay-guard flakiness
**What goes wrong:** Using the same TOTP code twice in one window fails the D-04 replay guard (`two_fa_last_step`).
**How to avoid:** Reuse the `tfaCode(secret, offsetSec)` offset helper from `e2e/flows.spec.mjs:1032` and/or reset `two_fa_last_step` via DB access between steps, as `test/tfa-recovery-regen.test.mjs:23–25` does.

### Pitfall 7: i18n-scan green
**What goes wrong:** Any new UI string not catalogued in both locales breaks `npm run build` (prebuild runs `scripts/i18n-scan.mjs`).
**How to avoid:** Prefer reusing existing strings (`settings.tfa.turnOff`, `act.turnOff` already exist). If any string changes, add EN + FR entries under `settings.tfa.*` and run `npm run i18n:scan`.

## Code Examples

### The disable transaction after Phase 21 (shape)
```javascript
// Ground truth read this session: server.js:1670–1695 (existing) + D-103/D-105 additions.
const outcome = transaction(() => {
  const fresh = db.prepare('select password_hash, two_fa_secret, two_fa_last_step from users where id = ?').get(user.id);
  if (!fresh || !verifyPassword(cur, fresh.password_hash)) return 'password';
  // D-101: no recovery branch. Code shape was gated before the transaction.
  const wrapped = requireTotpSecret(fresh.two_fa_secret);
  if (!wrapped.ok) return 'masterKey';
  if (!verifyTotpCode(wrapped.secret, code, fresh.two_fa_last_step || null, Math.floor(now() / 1000)).ok) return 'code';
  db.prepare("update users set two_fa_enabled = 0, two_fa_secret = '', two_fa_last_step = 0 where id = ?").run(user.id);
  db.prepare('delete from recovery_codes where user_id = ?').run(user.id);
  // D-103: kill every pending 2FA challenge for this user.
  db.prepare('delete from login_challenges where user_id = ?').run(user.id);
  // D-105: revoke-others, keep-current (hash of the caller's own cookie).
  db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
  return 'ok';
});
if (outcome === 'password') return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
if (outcome === 'masterKey') return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured or the stored secret is undecryptable');
if (outcome === 'code') return fail(res, 400, 'codeRejected', 'That code is not valid');
logSecurity(user.id, 'tfa_disabled'); // D-107: after commit, before response
return json(res, 200, { ok: true });
```
Note: `tokenHash` must be computed before the transaction (`const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE])`), and the pre-gate `if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', ...)` replaces the current empty-code check's permissiveness (the current route only checks `!code`; Phase 21 makes the empty/non-6-digit case the same 400 `codeRejected`, matching regen).

### Server test skeleton (mirroring test/tfa-recovery-regen.test.mjs)
```javascript
// Source: test/tfa-recovery-regen.test.mjs conventions, read this session
import { totpAt, recoveryHash, normalizeRecoveryCode } from '../totp.js';
import { signup, startServer, withDb } from './helpers/server.mjs';
// before: startServer({ dataDir: tmp, env: { MASTER_KEY: 'gr8r-tfa-suite-key' } })
// per-user signup (≤5 per server — signup is IP-throttled 5/hour)
// enable 2FA via POST /api/auth/tfa/enroll + /enable with totpAt-derived code
// D-102: post unused recovery code → assert 400 codeRejected; withDb: recovery_codes rows
//        unchanged (same count, used_at still null), users.two_fa_enabled still 1
// D-104: insert a login_challenges row via withDb (mimic server.js:1501–1505 shape:
//        sha256(token), user_id, expires_at = now()+TTL, attempts 0) → disable →
//        withDb: row gone; posting the token to the 2FA login step returns the dead-challenge 401
// D-105: create second session → disable → second token 401, first still 200
// throttle: 6th disable attempt → 429 tooManyAttempts (wrong passwords consume tries, D-108)
```

## Runtime State Inventory

Not a rename/refactor phase — omitted. (Relevant note for planners: the phase writes to live SQLite tables `users`, `recovery_codes`, `login_challenges`, `sessions`, `security_log`, all already created by migrations in `server.js:117–125`.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server tests, server itself | ✓ | v24.21.0 [VERIFIED: `node --version`] | — |
| @playwright/test + Chromium browser | D-109 e2e | ✓ (dep ^1.64.1 in package.json; browser binary assumed installed — run `npx playwright install chromium` if `npm run e2e` reports missing) | ^1.64.1 | Server-level tests cover the contract; e2e would be flagged for human |
| SQLite (node:sqlite via server) | withDb test access | ✓ | bundled with Node 24 | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node 24) + @playwright/test ^1.64.1 |
| Config file | none for node:test (convention-driven); `e2e/playwright.config.mjs` for e2e |
| Quick run command | `node --test test/tfa-disable.test.mjs` |
| Full suite command | `npm test` (server) · `npm run e2e` (Chromium) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIS-02 | Valid unused recovery code → 400 codeRejected, codes intact, 2FA still on | unit/integration (server) | `node --test test/tfa-disable.test.mjs` | ❌ Wave 0/1 |
| DIS-01 | Pending challenge deleted on disable; token no longer completes login | unit/integration (server) | same file | ❌ |
| DIS-01 (D-105) | Other sessions revoked, current kept | unit/integration (server) | same file | ❌ |
| DIS-01 (D-107) | `security_log` contains `tfa_disabled` on success only | unit/integration (server) | same file | ❌ |
| D-108 | Throttle 5/15min; wrong password consumes a try; 503 masterKeyMissing | unit/integration (server) | same file | ❌ |
| SC-4 | Full disable→re-enroll cycle, EN+FR, recovery-code rejection at UI, second session 401 | e2e (Chromium) | `npm run e2e` | ❌ |

### Sampling Rate
- **Per task commit:** `node --test test/tfa-disable.test.mjs` + `npm run i18n:scan`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` + `npm run e2e` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/tfa-disable.test.mjs` — the D-102/D-104/D-105/D-107/D-108 suite (no disable-route server suite exists today; closest is `test/tfa-recovery-regen.test.mjs`)
- [ ] `e2e/tfa-disable-cycle.spec.mjs` — the D-109 spec (reuse `e2e/flows.spec.mjs` helpers: `must`, `tfaCode`, API-driven enroll)
- No framework install needed — none.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Password + TOTP step-up via `verifyPassword` / `verifyTotpCode` (existing) |
| V3 Session Management | yes | D-105 revoke-others on a security-control change; hash of caller cookie only (Pitfall 9) |
| V4 Access Control | yes | `requireUser` guard, per-user scoping of all deletes |
| V5 Input Validation | yes | Strict `^\d{6}$` gate (D-101) — the phase's core tightening |
| V6 Cryptography | yes | TOTP secret only via `requireTotpSecret` decrypt path; `recoveryHash` for any fixture; never plaintext at rest |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Recovery-code downgrade (a "backup" path bypassing live TOTP) | Elevation | D-101 structural gate — no lookup exists to exploit |
| Ghost 2FA challenge after disable (stale login_challenges row completes login) | Spoofing | D-103 teardown + D-104 proof |
| Cross-user challenge/session deletion | Tampering | All deletes keyed strictly by `user_id` |
| Timing/oracle on disabled accounts | Information disclosure | Existing uniform outcome handling (fail codes unchanged); throttle unchanged (D-108) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `logSecurity` placed after commit (not in-transaction as regen does via D-99) satisfies D-107's wording | Pattern 3 / Code Examples | Cosmetic: if the planner prefers in-transaction symmetry with regen (`server.js:1747`), both are defensible; D-107 says "after the transaction commits 'ok'" |
| A2 | Playwright Chromium browser binary is installed on this machine (dependency declared, binary not probed) | Environment Availability | e2e fails at launch → `npx playwright install chromium` fixes |
| A3 | No UI code change is needed (disable form at `src/pages/settings.js:391–432` already sends password + code; server tightening is invisible to the client except error copy) | Recommended Project Structure | If the client pre-validates code shape, it doesn't — the disable form has no `inputmode="numeric"` unlike the regen form, so a recovery code can be typed and will hit the server 400, which the UI already renders. If desired, adding `inputmode="numeric"` to `tfa-off-code` is a one-attribute, zero-string change (i18n-safe) |

## Open Questions (RESOLVED)

1. **Should the disable form get `inputmode="numeric"`?**
   - What we know: the regen code field has it (`settings.js` regen form), the disable field does not; server-side strictness makes it cosmetic.
   - Recommendation: planner's discretion (D-111 covers string safety; an attribute change needs no new strings). Low risk either way.
   - **RESOLVED (2026-10-29): No** — planner discretion confirmed by user; no UI change this phase (zero-string change per A3; plans legitimately leave the UI untouched).

## Sources

### Primary (HIGH confidence)
- `server.js:1656–1700` — disable route ground truth (read this session)
- `server.js:1704–1754` — regen route, strict gate at 1717–1719, `logSecurity` at 1747 (read this session)
- `server.js:1561–1590` — password change revoke-others precedent, 1578–1587 (read this session)
- `server.js:117–125, 1501–1505, 1534, 1783–1837, 2807–2808` — login_challenges schema, issue/burn lifecycle, sweeper (read this session)
- `src/pages/settings.js:391–432` — tfa card, disable inline stage (read this session)
- `test/tfa-recovery-regen.test.mjs:1–60` — server-test conventions, MASTER_KEY env, helpers (read this session)
- `e2e/flows.spec.mjs:1007–1048` — existing 2FA e2e helpers `tfaCode`, API enroll flow (grep/read this session)
- `.planning/REQUIREMENTS.md:37–42, 79–80` — DIS-01/DIS-02 locked text (read this session)

### Secondary (MEDIUM confidence)
- `package.json` scripts/versions — `npm test`, `npm run e2e`, `@playwright/test ^1.64.1` (read this session)

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all tooling read in-repo this session
- Architecture: HIGH — every edited region and every referenced precedent read verbatim this session
- Pitfalls: HIGH — derived from the route's own commented invariants (D-57/D-59/D-85) and sibling-suite conventions

**Research date:** 2026-10-29
**Valid until:** 2026-11-28 (stable in-repo domain)
