# Phase 20: Recovery-Code Regeneration - Research

**Researched:** 2026-10-29
**Domain:** Server route + settings UI — burn-and-replace of 2FA recovery codes behind password+TOTP step-up (Node built-in http, better-sqlite3-style sync transactions, vanilla-JS settings card)
**Confidence:** HIGH — nearly every fact below was read directly from the ground-truth code this session; no external packages are involved.

## Summary

This phase is a **structural sibling-combining exercise**, not new design. The new route `POST /api/auth/tfa/recovery` is essentially the **disable route's step-up front half** (password → strict-6-digit TOTP via `requireTotpSecret`, single transaction re-selecting fresh rows — `server.js:1643–1686`) grafted onto the **enable route's back half** (generate 10 codes, `delete from recovery_codes`, hash-insert, `{ ok: true, recoveryCodes }` response — `server.js:1621–1640`). Every decision in CONTEXT.md (D-85..D-100) already fixes the behavior; the research confirms each has a verbatim pattern in the codebase to copy.

Key ground-truth findings that de-risk planning:

1. **D-85's "6-digit-only, no recovery lookup" is trivially enforceable**: the disable route already branches on `/^\d{6}$/` (`server.js:1659`) — the regen route simply *omits the else branch entirely*. No recovery_codes lookup exists anywhere in the route; a recovery code (letters/hyphens after normalization, never exactly 6 digits) hits 400 `codeRejected` before any table read.
2. **`Cache-Control: no-store` is already free**: the shared `json()` helper sets `'Cache-Control': 'no-store'` on **every** JSON response (`server.js:1227–1234` — read this session). The success criterion is satisfied by using `json()`; the planner should still add an assertion test so it is regression-guarded.
3. **D-99 (activity verb) has no existing mechanism**: confirmed — the only activity writer is `logAct` at `src/core/store.js:264`, task/workspace-scoped, and no auth route records any activity. The planner must define a minimal honest mechanism (or documented deferral) shared with Phase 21's DIS-01.
4. **Test infrastructure is established and directly reusable**: `test/tfa-enrollment.test.mjs` boots a real server + real SQLite via `test/helpers/server.mjs` (`startServer`, `signup`, `login`, `loginTfa`, `withDb`), tracks secrets and generates TOTP codes with `totpAt()` from `totp.js`. A new `test/tfa-recovery-regen.test.mjs` follows this pattern exactly. No new deps.

**Primary recommendation:** Build the route as a disable-route clone with the recovery-code branch deleted and the teardown replaced by the enable-route's burn-and-replace block; reuse the D-53 modal and `S.ui.tfaStage` inline pattern verbatim on the frontend. No new packages, no new display machinery, one new test file.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-85:** Strict 6-digit-only input — reject non-6-digit with 400 `codeRejected` **before** any recovery_codes lookup; no recovery lookup anywhere in the route. Structurally impossible for a recovery code to satisfy step-up. **Reversibility: costly — the "no lookup" property is the load-bearing invariant.**
- **D-86:** Factor check order: password → TOTP (mirrors disable route inside its transaction).
- **D-87:** Successful TOTP verification updates `users.two_fa_last_step` to the matched step **in the same transaction** as burn-and-replace (D-04 replay guard stays current).
- **D-88:** Single transaction covers password verify, TOTP verify (decrypt via `requireTotpSecret`), delete-all and insert-new — rows re-selected fresh inside the transaction (Pitfall 4 pattern).
- **D-89:** Live-TOTP check reads the encrypted secret through Phase 19 `requireTotpSecret`; `{ ok: false }` → fail closed 503 `masterKeyMissing`.
- **D-90:** Regenerate action is an **inline stage on the existing tfa settings card** — button in the on-state row next to "Turn off", revealing inline password + 6-digit code form (same `S.ui.tfaStage` pattern as disable).
- **D-91:** New codes displayed by **reusing the D-53 one-time recovery modal** (transient `S.ui.recoveryCodes`, cleared on dismiss, copy-all). Zero new display machinery.
- **D-92:** Confirmation form carries a warning that regeneration invalidates old codes — new EN + FR i18n keys, catalogued for the i18n-scan.
- **D-93:** Throttle budget `tfa-regen|${user.id}`, 5 attempts / 15 minutes (same shape as `tfa-enroll`/`tfa-disable`).
- **D-94:** Every attempt consumes one try, **including a wrong password** (D-41/D-49 precedent).
- **D-95:** 2FA-disabled user → 409 `tfaNotEnabled` before any factor check.
- **D-96:** Guard order: `sameOrigin` → `requireUser` → throttle → `readJson` (Pitfall 22).
- **D-97:** 10 codes via `generateRecoveryCode()`, hashed with `recoveryHash(normalizeRecoveryCode(code))` — identical recipe/count to enable route. Plaintext never stored.
- **D-98:** Existing sessions untouched — only `recovery_codes` and `two_fa_last_step` change.
- **D-99:** Success records an activity verb (e.g. `tfa_recovery_regenerated`). **No account-security activity mechanism exists today** (`logAct`, `src/core/store.js:264`, is task-scoped; no auth route records anything). Planner defines the minimal honest mechanism or documents a deferral — shared with Phase 21's DIS-01.
- **D-100:** Response `{ ok: true, recoveryCodes: [...] }` with `Cache-Control: no-store` — identical envelope to enable response.

### the agent's Discretion
- Error-copy wording for the new 409/400 codes; exact i18n key names; test file placement within existing conventions; the D-99 mechanism detail.

### Deferred Ideas (OUT OF SCOPE)
None — session policy on regeneration decided in-scope as "sessions untouched" (D-98); disable-2FA closure and operator revocation belong to Phases 21–22; key rotation / key-custody runbook remain deferred per REQUIREMENTS.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REGEN-01 | Regenerate via `POST /api/auth/tfa/recovery` — current password **and** live TOTP code required; a recovery code must never satisfy the step-up | D-85 structural enforcement: copy disable route's `/^\d{6}$/` branch (`server.js:1659`) but omit the recovery else-branch; regression test posts a known recovery code and asserts 400 `codeRejected` + unchanged code set |
| REGEN-02 | Atomic delete-all + insert-new in one transaction; plaintext displayed once, never stored | Copy enable route's transaction block (`server.js:1629–1638`); add fresh re-select inside the transaction (disable-route pattern, `server.js:1656–1658`) per D-88; reuse D-53 modal |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Step-up verification (password + TOTP) | API/Backend (server.js route) | — | Server-side security boundary; client only collects input |
| Burn-and-replace transaction | Database/Storage (SQLite transaction) | — | Atomicity lives in the DB layer; app code wraps it |
| One-time code display | Browser/Client (D-53 modal) | — | Plaintext exists only in the HTTP response + transient UI state |
| Throttling | API/Backend (`tooMany`) | — | Identity-keyed, in-memory, server-owned |
| Inline regenerate stage + i18n | Browser/Client (settings.js) | — | UI-only concern; reuses existing staging + locale keys |

## Standard Stack

No new dependencies. The entire phase uses the existing zero-framework stack:

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Node built-in `http` + existing route block | current repo | Route handler inside the existing if-chain | Every tfa route is a plain `if (pathname === ...) && method === 'POST'` block `[VERIFIED: server.js:1582–1686]` |
| `transaction()` helper | existing | Wraps the atomic unit | Enable route uses it verbatim `[VERIFIED: server.js:1629]` |
| `tooMany(key, 5, 15*60*1000)` | existing | Throttle | Same call shape on all sibling routes `[VERIFIED: server.js:1588, 1647]` |
| `requireTotpSecret` | Phase 19 | Only decrypt boundary | D-77/D-78c exclusivity, proven by `test/totp-encryption.test.mjs` `[VERIFIED: server.js:266–269]` |
| `verifyTotpCode(secret, code, lastStep, nowSec)` | totp.js:61 | ±1 window + D-04 replay guard; returns `{ ok, matchedStep }` `[VERIFIED: totp.js:7, 61]` |
| `generateRecoveryCode` / `normalizeRecoveryCode` / `recoveryHash` | totp.js:88/96/99 | Code recipe. `normalizeRecoveryCode = s => String(s).trim().toLowerCase().replace(/[\s-]/g, '')`; `recoveryHash = normalized => sha256hex(normalized)` `[VERIFIED: totp.js:88-99]` |
| `json()` / `fail()` helpers | server.js:1227/1241 | Response envelope — `json()` already sets `Cache-Control: no-store` `[VERIFIED: server.js:1229–1232]` |
| `test/helpers/server.mjs` + `node --test` | existing | Real-server integration tests | `package.json` test script: `node --test --test-concurrency=2 test/*.test.mjs` `[VERIFIED: package.json:18]` |

**Installation:** none. **Package Legitimacy Audit:** N/A — this phase installs no external packages.

## Architecture Patterns

### System Architecture Diagram

```
Browser (settings card, on-state row)
   │  click "Regenerate codes" → inline stage (S.ui.tfaStage)
   │  POST /api/auth/tfa/recovery { currentPassword, code }
   ▼
Route guards (server.js, new block among tfa routes)
   sameOrigin → requireUser → tooMany("tfa-regen|<id>", 5, 15min) → readJson
   │                                    429 tooManyAttempts
   ▼
Pre-transaction rejects (no writes, per disable-route pattern)
   2FA off? → 409 tfaNotEnabled        (D-95)
   empty password? → 400 passwordRequired
   empty / non-6-digit code? → 400 codeRejected   (D-85 — no recovery lookup exists)
   ▼
transaction(() => {                       (D-88, Pitfall 4: re-select fresh inside)
   fresh = select users (password_hash, two_fa_secret, two_fa_last_step)
   password wrong? → abort 'password'     (D-94: throttle try already consumed)
   wrapped = requireTotpSecret(fresh.two_fa_secret)
   !wrapped.ok → abort 'masterKey'        (D-89 → 503)
   !verifyTotpCode(...).ok → abort 'code'
   update users set two_fa_last_step = matchedStep   (D-87)
   delete from recovery_codes where user_id = ?      (burn-all)
   insert 10 rows: recoveryHash(normalizeRecoveryCode(code))  (D-97)
   → return { ok:true, recoveryCodes: codes }        (D-100, no-store via json())
})
   ▼
Client: S.ui.recoveryCodes = codes → D-53 modal (shown once, cleared on dismiss) (D-91)
```

### Pattern 1: The Route Skeleton (closest sibling = disable route)

**What:** The new route is the disable route (`server.js:1643–1686`) with: (a) the recovery-code else-branch **deleted** (D-85), (b) the teardown replaced by the enable route's delete-all + hash-insert (`server.js:1631–1636`), (c) `two_fa_last_step` updated instead of cleared (D-87), (d) throttle key `tfa-regen|${user.id}` (D-93), (e) a `two_fa_enabled` pre-check → 409 `tfaNotEnabled` (D-95).

**Where:** Placed with the other tfa routes in server.js, following the disable block.

```js
// Skeleton (decisions already fixed; copy exact helpers from siblings)
if (pathname === '/api/auth/tfa/recovery' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = requireUser(req, res);
  if (!user) return;
  if (tooMany(`tfa-regen|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  const body = await readJson(req);
  const cur = String(body?.currentPassword || '');
  const code = String(body?.code || '').trim();
  if (!cur) return fail(res, 400, 'passwordRequired', 'Enter your current password');
  if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', 'Enter a 6-digit verification code'); // D-85: no recovery lookup exists
  const codes = [];
  for (let i = 0; i < 10; i++) codes.push(generateRecoveryCode());
  const outcome = transaction(() => {           // Pitfall 4: re-select fresh inside
    const fresh = db.prepare('select password_hash, two_fa_enabled, two_fa_secret, two_fa_last_step from users where id = ?').get(user.id);
    if (!fresh || !fresh.two_fa_enabled) return 'notEnabled';             // D-95
    if (!verifyPassword(cur, fresh.password_hash)) return 'password';     // D-94: try already consumed
    const wrapped = requireTotpSecret(fresh.two_fa_secret);
    if (!wrapped.ok) return 'masterKey';                                  // D-89
    const verified = verifyTotpCode(wrapped.secret, code, fresh.two_fa_last_step || null, Math.floor(now() / 1000));
    if (!verified.ok) return 'code';
    db.prepare('update users set two_fa_last_step = ? where id = ?').run(verified.matchedStep, user.id); // D-87
    db.prepare('delete from recovery_codes where user_id = ?').run(user.id);
    const insert = db.prepare('insert into recovery_codes (id, user_id, code_hash, used_at, created_at) values (?,?,?,null,?)');
    for (const c of codes) insert.run(uid(), user.id, recoveryHash(normalizeRecoveryCode(c)), now());    // D-97
    return 'ok';
  });
  if (outcome === 'notEnabled') return fail(res, 409, 'tfaNotEnabled', 'Enable two-factor authentication first');
  if (outcome === 'password') return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
  if (outcome === 'masterKey') return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured or the stored secret is undecryptable');
  if (outcome === 'code') return fail(res, 400, 'codeRejected', 'That code is not valid');
  return json(res, 200, { ok: true, recoveryCodes: codes }); // D-100; no-store already set by json()
}
```

**Planner choice point (discretion):** whether the `two_fa_enabled` pre-check runs before the transaction (a cheap non-transactional select) or inside it as sketched. Inside-the-transaction is the Pitfall-4-consistent shape and matches the disable route's "re-select fresh" discipline; a pre-transaction check is a fast-path UX nicety but the in-transaction check must exist regardless to close the race. Either satisfies D-95 as long as the 409 lands before any factor verification.

### Pattern 2: One-time modal reuse (D-91)

The D-53 modal renders from transient `S.ui.recoveryCodes` with copy-all and dismiss-clear — `src/overlays/modals.js:48–57` `[VERIFIED: modals.js:50–56]`. The client-side handler for the regen response sets `S.ui.recoveryCodes = res.recoveryCodes` and opens the same modal; **zero new display code**. Ensure the dismiss-clear action also clears the inline `tfaStage` so the form doesn't linger with a password field after success.

### Pattern 3: Test harness reuse

`test/tfa-enrollment.test.mjs` shows the exact conventions: real server via `startServer({ dataDir, env: { MASTER_KEY: '...' } })`, `signup`/`login`/`loginTfa` helpers, `withDb(server.dbPath, db => ...)` for direct DB assertions/fixups, `totpAt(secret, Date.now()/1000)` for live codes, and `recoveryHash` imported from `../totp.js` `[VERIFIED: test/tfa-enrollment.test.mjs:1–37]`. New file: `test/tfa-recovery-regen.test.mjs`.

### Anti-Patterns to Avoid
- **Adding any recovery_codes lookup in the route** — violates D-85's structural invariant and reintroduces the D-57 dual-shape hazard. The route must not read `recovery_codes` at all (except its own delete/insert writes).
- **Generating codes outside the transaction then hashing inside with different values** — the enable route generates plaintext *before* the transaction (`server.js:1623–1626`) and inserts those exact values; mirror it. Never generate inside and return different plaintext.
- **Verifying factors before consuming a throttle try** — D-94: the `tooMany` call precedes everything after the guards; even a wrong password burns a try. Do not add "free" pre-checks after the throttle that bypass it (the D-95 409 and empty-field 400s are before/at the throttle boundary per the disable-route precedent — match sibling behavior exactly).
- **Writing error copy the client can't translate** — new `error_code`s (`tfaNotEnabled`) need client-side i18n keys or the client falls back to the English message; add both EN and FR keys (D-92, i18n-scan catalogued).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP verify + replay guard | custom time-step math | `verifyTotpCode` (±1 window, matchedStep, D-04) | Already battle-tested across 3 call sites |
| Code generation/hashing | custom alphabet/hash | `generateRecoveryCode` + `recoveryHash(normalizeRecoveryCode(...))` | Pitfall 6: ONE normalization; drift breaks login burn |
| Atomicity | app-level check-then-write | `transaction()` + fresh re-select | SQLite sync transactions are the established atomicity primitive |
| Throttling | new rate limiter | `tooMany(key, 5, 15*60*1000)` | Same budget band (D-11) as all siblings |
| One-time display | new UI component | D-53 modal | D-91 mandates reuse so the two displays can't drift |
| Decrypt | direct `decryptTotpSecret` call | `requireTotpSecret` wrapper | D-77/D-78c: single decrypt boundary, test-enforced |

**Key insight:** this phase's risk is *drift from siblings*, not technical novelty — every helper exists and every decision has a verbatim precedent within ~120 lines of server.js.

## Runtime State Inventory

Omitted — greenfield route addition; no rename/migration. (New rows in existing `recovery_codes` / `users.two_fa_last_step` use existing schemas; schema check: enable route already inserts `(id, user_id, code_hash, used_at, created_at)` — `[VERIFIED: server.js:1632]` — no migration needed.)

## Common Pitfalls

### Pitfall 1: Recovery code satisfying the step-up (the headline REGEN-01 regression)
**What goes wrong:** if any lookup or loose validation lets a non-6-digit string through, a stolen recovery code could rotate codes.
**Why it happens:** copying the disable route wholesale, including its else-branch.
**How to avoid:** delete the branch; `/^\d{6}$/` gate only. Regression test: enable 2FA, capture plaintext codes, POST one as `code` → expect 400 `codeRejected`, then assert (via `withDb`) the code set is unchanged and still all `used_at is null`.

### Pitfall 2: Missing `two_fa_last_step` update (D-87)
**What goes wrong:** replay guard goes stale → a code captured from an earlier window could be replayed after regeneration.
**How to avoid:** `update users set two_fa_last_step = ?` with `verified.matchedStep` inside the same transaction — mirror `server.js:1742` (login route does exactly this).

### Pitfall 3: Stale row read outside the transaction
**What goes wrong:** TOCTOU — password hash or secret read before transaction, changed concurrently.
**How to avoid:** re-select `password_hash, two_fa_enabled, two_fa_secret, two_fa_last_step` inside the transaction (disable route, `server.js:1656–1658`).

### Pitfall 4: New i18n keys missing from FR catalog
**What goes wrong:** `i18n-scan` test fails (the project has `test/i18n-scan.test.mjs` enforcing catalogued keys).
**How to avoid:** add EN + FR keys under `settings.tfa.*` in the same commit; run `npm test` locally before committing.

### Pitfall 5: D-99 forced into the task activity feed
**What goes wrong:** `logAct` is task/workspace-document-scoped (`src/core/store.js:264`) — force-fitting creates meaningless activity rows.
**How to avoid:** planner defines a minimal honest mechanism (e.g., a small server-side security-event log table or a documented deferral), designed so Phase 21's DIS-01 can share it. This is the phase's only genuinely open design point.

### Pitfall 6: Forgetting the stage/modal interplay
**What goes wrong:** after success, the inline form remains mounted holding a typed password.
**How to avoid:** on 200, clear `S.ui.tfaStage` when opening the recovery modal; dismiss-clear also resets the stage.

## Code Examples

See Pattern 1 (route skeleton) and Pattern 3 (test harness) above — all values quoted verbatim from files read this session:

- `verifyTotpCode(secretB32, code, lastStep, nowSec, period = 30)` — `[VERIFIED: totp.js:61]`
- `generateRecoveryCode()` at `totp.js:88`; `normalizeRecoveryCode = s => String(s).trim().toLowerCase().replace(/[\s-]/g, '')` at `totp.js:96`; `recoveryHash = normalized => sha256hex(normalized)` at `totp.js:99` — `[VERIFIED: totp.js:88-99]`
- Enable-route burn-and-replace transaction with exact insert column list `(id, user_id, code_hash, used_at, created_at)` and value `recoveryHash(normalizeRecoveryCode(code0))` — `[VERIFIED: server.js:1629–1639]`
- Disable-route step-up order, fresh re-select, `/^\d{6}$/` branch, `requireTotpSecret` usage, error mapping `password|masterKey|code` → `403/503/400` — `[VERIFIED: server.js:1656–1685]`
- `json()` sets `'Cache-Control': 'no-store'` — `[VERIFIED: server.js:1229–1232]`
- `requireTotpSecret` is the ONLY caller of `decryptTotpSecret`, proven by `test/totp-encryption.test.mjs` — `[VERIFIED: server.js:266–269]`

## State of the Art

N/A — closed internal codebase, no external libraries to track. All patterns are current within the repo (Phase 19 landed the decrypt wrapper this phase consumes).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The in-transaction `two_fa_enabled` check (vs a pre-transaction fast-path) satisfies D-95's "before any factor check" intent | Pattern 1 | Low — both readings honored if the in-transaction check exists; planner may do both |
| A2 | The i18n-scan test will reject uncatalogued new keys (enforcing D-92's "catalogued for the i18n-scan") | Pitfall 4 | Low — adding EN+FR keys is correct regardless |
| A3 | A new verb string `tfa_recovery_regenerated` needs no registry beyond where D-99's mechanism defines one | D-99 | Low — mechanism itself is the open item |

All other claims are `[VERIFIED]` against files read this session; no external docs were needed.

## Open Questions (RESOLVED)

1. **D-99 mechanism shape** — RESOLVED. Adopted: a minimal `security_log` table (id, user_id, verb, created_at, FK to users on delete cascade + user index) plus a `logSecurity(userId, verb)` helper, implemented in 20-01 Task 1; Phase 21's DIS-01 reuses the table and helper verbatim. No deferral — the verb `tfa_recovery_regenerated` is written in the same transaction as burn-and-replace and asserted by the Wave 0 test.

2. **Throttle/409 ordering** — RESOLVED. Adopted: the `two_fa_enabled` check runs **inside the transaction** (Pitfall 4 fresh re-select discipline), returning 'notEnabled' which maps to 409 `tfaNotEnabled` after the transaction — no pre-transaction fast-path select in 20-01. The 409 still lands before any factor verification (password/TOTP are checked after the enabled check inside the same transaction), satisfying D-95; guard order remains sameOrigin → requireUser → throttle → readJson per D-96. Phase 21 should follow the same in-transaction shape for consistency.

## Environment Availability

Node.js v24.21.0 available `[VERIFIED: node --version]`. Test runner is `node --test` (built-in). No external services needed — tests boot a real server on a temp dir with a throwaway `MASTER_KEY`. No missing dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in), `node --test --test-concurrency=2` `[VERIFIED: package.json:18]` |
| Config file | none — convention-based `test/*.test.mjs` |
| Quick run command | `node --test test/tfa-recovery-regen.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REGEN-01 | Password + live TOTP regenerates 10 codes | integration | `node --test test/tfa-recovery-regen.test.mjs` | ❌ Wave 0 |
| REGEN-01 | Recovery code as step-up → 400 `codeRejected`, code set unchanged | integration (regression) | same | ❌ Wave 0 |
| REGEN-02 | Old set invalid immediately; new set valid for login burn | integration | same | ❌ Wave 0 |
| REGEN-02 | 2FA-disabled user → 409 `tfaNotEnabled`; wrong password burns a throttle try (6th → 429) | integration | same | ❌ Wave 0 |
| SC-4 | Response carries `Cache-Control: no-store` | integration | same | ❌ Wave 0 |
| D-89 | Missing MASTER_KEY → 503 `masterKeyMissing`, no mutation | integration | same | ❌ Wave 0 |
| D-92 | New i18n keys present in EN + FR | unit (existing suite) | `node --test test/i18n-scan.test.mjs` | ✅ existing |
| D-91 | Regenerated set renders via existing modal state | covered by existing modal tests / manual | — | partial |

### Sampling Rate
- **Per task commit:** `node --test test/tfa-recovery-regen.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/tfa-recovery-regen.test.mjs` — covers REGEN-01/REGEN-02 + no-store + throttle-budget regression
- [ ] (if D-99 mechanism built) a table/log assertion or a documented-deferral note instead

## Security Domain

security_enforcement not disabled in `.planning/config.json` → included. This phase is itself a security control; the applicable baseline:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Password + TOTP step-up; password via existing `verifyPassword`; scrypt params unchanged |
| V3 Session Management | no | D-98: sessions untouched by design |
| V4 Access Control | yes | `requireUser` + identity-keyed throttle; 2FA-disabled fast-fail 409 |
| V5 Input Validation | yes | Strict `/^\d{6}$/` gate (D-85); `String(body?.x \|\| '')` coercion per sibling routes |
| V6 Cryptography | yes | Codes hashed `sha256hex` of the one normalization; plaintext never stored or logged; decrypt only via `requireTotpSecret` |
| V7 Error Handling/Logging | partial | New error codes flow through `fail()`; D-99 security log (mechanism TBD) is the logging gap |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stolen recovery code rotates codes (privilege persistence) | Elevation | D-85 structural 6-digit gate; regression test |
| Brute-force TOTP via regen endpoint | Spoofing | `tfa-regen\|<uid>` 5/15min, every-attempt-counts (D-93/D-94) |
| Plaintext code leakage via caching/proxy | Information Disclosure | `json()` no-store (D-100); display once in transient UI state (D-91) |
| MASTER_KEY missing → partial state | Tampering/DoS | `requireTotpSecret` fail-closed 503 before any mutation (D-89) |
| Concurrent regen double-insert | Tampering | Single transaction, fresh re-select (D-88/Pitfall 4) |

## Sources

### Primary (HIGH confidence — read this session)
- `server.js:1582–1686` — enroll/enable/disable routes (throttle, step-up, burn-and-replace, error mapping)
- `server.js:1692–1759` — login second step (D-04 last_step update precedent, conditional burn)
- `server.js:225–269` — encrypt/decrypt boundary, `requireTotpSecret` contract comment
- `server.js:1222–1241` — `json()`/`fail()` helpers, `Cache-Control: no-store`
- `totp.js:61–99` — `verifyTotpCode`, `generateRecoveryCode`, `normalizeRecoveryCode`, `recoveryHash`
- `test/tfa-enrollment.test.mjs:1–37` — test conventions, helpers, harness shape
- `package.json:18` — test script
- `.planning/REQUIREMENTS.md:27–40` — REGEN-01/REGEN-02 locked text
- `src/overlays/modals.js:48–57` — D-53 modal (recoveryCodes transient state)
- CONTEXT.md D-85..D-100 — locked decisions (verified against the code above where applicable)

### Secondary (MEDIUM) / Tertiary (LOW)
None — no external research was required; the phase consumes only in-repo patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all helpers verified in source
- Architecture: HIGH — route is a verbatim sibling composition; every decision maps to a cited line range
- Pitfalls: HIGH — derived from repo-established patterns (Pitfalls 4/6/22) plus one open design point (D-99) flagged honestly

**Research date:** 2026-10-29
**Valid until:** 2026-11-28 (stable internal codebase; re-verify only if Phases 19–21 land changes to server.js tfa blocks)
