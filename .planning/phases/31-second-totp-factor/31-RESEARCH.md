# Phase 31: Second TOTP Factor - Research

**Researched:** 2026-11-01
**Domain:** Server auth state extension (SQLite schema + TOTP verify loop) and settings UI, all inside an existing zero-dependency Node 24 (`node:sqlite`, `node:crypto`) codebase
**Confidence:** HIGH — every load-bearing claim below was verified by reading the source files this session

## Summary

This phase is pure in-repo work: no new packages, no external services, no new crypto. The
entire design rides three existing assets — the `v2:` keyring envelope (`encryptTotpSecret`
/ `requireTotpSecret`), the ±1-window replay guard (`verifyTotpCode` returning
`matchedStep`), and the staged enroll wizard (`tfaStage`). The work decomposes into: (1) an
additive `totp_factors` table + one-time boot copy of `users.two_fa_secret`, (2) a shared
multi-factor verify helper replacing the three `wrapped = requireTotpSecret(...)` call
sites, (3) new enroll/remove/list routes extending the existing tfa route family, and (4)
settings-card UI reusing the staged pattern and the `ago()` relative-time helper.

The riskiest part is not new code — it is the **existing test pins**. `test/totp-encryption.test.mjs`
asserts *exactly three* `const wrapped = requireTotpSecret(` occurrences and *exactly three*
`verifyTotpCode(wrapped.secret` occurrences, and pins `decryptTotpSecret` call-site
exclusivity to four sanctioned regions. Converting to a factor-loop helper changes these
counts by design; the planner must schedule deliberate pin updates, not discover them as
failures. Second risk: the boot migration must be trigger-gated and byte-identical on
second boot (the `test/migration.test.mjs` discipline), and per D-09 must copy
`users.two_fa_last_step` into the migrated row so no pre-migration code can replay.

**Primary recommendation:** Add `totp_factors`, keep every call site's shape but point all
three through one `verifyTotpAgainstFactors()` helper that itself calls `requireTotpSecret()`
per factor (never `decryptTotpSecret` directly — the exclusivity pin scans for it), reuse the
disable-2FA transaction verbatim for last-factor removal, and update the three encrypted-pin
counts in `totp-encryption.test.mjs` as an explicit Wave 0 test task.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Factor list lives in the existing 2FA card in the settings security tab — list of
  enrolled factors (name + last-used) with an "Add factor" button re-launching the existing
  staged enroll wizard. No new sub-tab, no modal-only management.
- **D-02:** A label is required at enrollment (naming step before the QR step); no unnamed factor.
- **D-03:** No rename after enrollment — names fixed at enrollment. No rename route, no edit UI.
- **D-04:** "Add factor" step-up reuses the staged wizard pattern (D-49): current password, then
  a live code from the existing factor, before the new factor's QR/secret is shown (TOTP2-05).
- **D-05:** Last-used displayed as relative time under each factor name ("2 hours ago"),
  refreshed on tab load.
- **D-06:** Boot migration **copies `users.two_fa_secret` into a `totp_factors` row**, making the
  table the single source of truth. After migration the users column stays in schema but nothing
  reads it. One-way; migration test pin in `test/migration.test.mjs` (byte-identical second boot).
- **D-07:** Migrated row named with a fixed catalogue string (EN+FR), e.g. "Primary authenticator"
  — localized at display time, nothing free-text stored.
- **D-08:** `users.two_fa_secret` and `users.two_fa_last_step` remain in schema **kept, unread**;
  `users.two_fa_enabled` stays the on/off switch.
- **D-09:** Migrated row's initial per-factor `last_step` = current `users.two_fa_last_step`
  (replay-guard continuity, no replay window).
- **D-10:** Shared verification helper (`verifyTotpAgainstFactors(userId, code, now)`) loads all
  factor rows, tries each with its own replay guard, returns matched factor + step. All call
  sites — login challenge, tfa/disable step-up, recovery regen step-up — route through it.
- **D-11:** First match short-circuits; an unmatched code counts as one failed attempt against
  the existing challenge attempts counter, regardless of factor count.
- **D-12:** An undecryptable factor is skipped in the loop (fails closed for that factor alone
  via `requireTotpSecret()`); other factors still verify.
- **D-13:** Enroll→enable staging extends the existing in-memory pending map (per-factor key);
  on enable the row inserts with `last_step = matched step`; `users.two_fa_enabled` flips on
  only for the first-ever factor.
- **D-14:** Recovery codes untouched — verify outside the factor loop (D-64 burn path at login);
  a TOTP code never satisfies recovery (D-59/D-72 boundary).
- **D-15:** Removing a single factor requires a live code from a factor that is NOT the one being
  removed (lock-yourself-out guard, TOTP2-02).
- **D-16:** No factor picker at removal: after password step-up the user types a code; the server
  verifies it against all remaining factors.
- **D-17:** Recovery codes rotate only on last-factor removal (existing D-53 rotation) and when a
  new first factor is enrolled after disable. Single-factor removal leaves recovery codes alone.
- **D-18:** Removing the last factor delegates to the existing disable-2FA transaction verbatim —
  the remove route detects "last factor" and runs it; no re-implemented second code path.
- **D-19:** Per-factor removal uses a confirm modal (factor name + current password + live code
  from any remaining factor), same modal pattern as the existing disable confirmation.

### the agent's Discretion
- Exact `totp_factors` schema shape (column names, indexes, timestamps) and API route naming.
- Catalogue key wording for the migrated "Primary" label (EN+FR strings).
- Helper naming/signature, last_used_at update timing, and per-factor test pins beyond the
  existing totp test files.
- Migration failure semantics detail (rows that fail decrypt are left as-is per D-K7/D-K9 —
  planner decides how the copy step treats them).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOTP2-01 | Register second+ TOTP method; codes from ANY factor accepted at login, pending-2FA challenge, step-ups | D-10 helper routing all three `wrapped` call sites (server.js:2479, 2537, 2611) through the factor loop; D-13 enable path |
| TOTP2-02 | Named factors with last-used; remove one with password + live code from a remaining factor | D-01/D-05 list in existing card with `ago()`; D-15/D-16/D-19 removal route + confirm modal |
| TOTP2-03 | Login and pending-2FA challenge accept a code from ANY enrolled factor | Same helper at the login TOTP branch (server.js:2608-2616) and enable path (2424-2427) |
| TOTP2-04 | Removing last factor runs the existing disable-2FA transaction — no half-states | D-18: remove route detects last factor and reuses the transaction at server.js:2473-2496 verbatim |
| TOTP2-05 | Enrollment of a new factor requires step-up proving existing factor works | D-04: enroll route gains a live-code gate before `stashPendingTfa` (server.js:2391-2407) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Multi-factor verify (any-factor acceptance) | API/Backend (server.js routes) | — | Replay guards and secrets are server-only; `totp.js` is deliberately not bundled by Vite |
| `totp_factors` persistence + boot copy | Database/Storage (SCHEMA + boot migration) | — | Additive table + one-time copy, pinned by `test/migration.test.mjs` |
| Factor list / naming / remove UI | Browser/Client (settings security tab) | API for ground truth | Client reads server state via `refreshTfa()` pattern — never a client flag |
| Enroll staging (pending secret) | API/Backend (in-memory `pendingTfa` map) | Client staged wizard | 10-min TTL memory-only staging is an established invariant (D-46) |
| Recovery codes | API/Backend | — | Untouched (D-14); account-level break-glass outside the factor loop |

## Standard Stack

### Core
No new packages — this phase is a hard "zero new runtime dependencies" milestone invariant.
Everything needed already exists in-repo:

| Asset | Location (verified) | Purpose |
|---------|---------------------|---------|
| `verifyTotpCode(secretB32, code, lastStep, nowSec, period=30)` → `{ok, matchedStep}` | totp.js:61 [VERIFIED: totp.js:55-61] | Per-factor verify with ±1 window + matched-step replay guard |
| `encryptTotpSecret(secretB32, 'v2')` → `v2:<kid8>:<iv>:<tag>:<ct>` or null | server.js:323-339 [VERIFIED: server.js:332-333] | The ONLY v2 envelope writer (D-K10) |
| `requireTotpSecret(envelope)` → `{ok, secret}` / `{ok:false}` | server.js:405-408 [VERIFIED: server.js:405-408] | Single decrypt boundary (D-77/D-79) — the factor helper MUST call this, not `decryptTotpSecret` |
| `stashPendingTfa(userId, secret, otpauth)` / `pendingTfa` Map, 10-min TTL | server.js:414-421 [VERIFIED: server.js:414-421] | Extends to per-factor staging key (D-13) |
| `transaction(fn)`, `logSecurity`, `tooMany(key, 5, 15*60*1000)` rate bands | server.js (used by all tfa routes) | Atomicity, security verbs, D-11 budget shape |
| `ago(ts)` relative-time helper | src/pages/settings.js:551 [VERIFIED: settings.js sessions row] | D-05 last-used display |
| EN/FR catalogues | src/locales/en.json, src/locales/fr.json [VERIFIED: file scan] | D-07 "Primary authenticator" key (i18n-scan/build-locales/catalogue tests gate parity) |
| Staged enroll wizard actions | src/actions/actions.js:2738-2864 [VERIFIED] | `tfaStart/tfaBeginEnroll/tfaVerify/tfaAskDisable/tfaDisableConfirm` — pattern to clone for Add-factor and Remove |

**Installation:** none. Any plan step that runs `npm install` for runtime deps is wrong.

## Package Legitimacy Audit

Not applicable — zero external packages introduced. Verified: all crypto/TOTP primitives are
in-repo (`totp.js`, `node:crypto`), DB is `node:sqlite` `DatabaseSync` (server.js:47
[VERIFIED: server.js:47]).

## Architecture Patterns

### Existing code map (the real spec — verified this session)

| Region | Lines | What Phase 31 does there |
|--------|-------|--------------------------|
| `SCHEMA` users table | server.js:113-127 | users columns stay (D-08); add `create table if not exists totp_factors (...)` to `SCHEMA` |
| `ensureColumn` examples | server.js:272 | Additive-migration precedent for schema columns |
| `migrateTotpEncryption` / `migrateTotpReWrap` | server.js:1605+, 1742+ | Sibling pattern for the new boot copy: trigger-gate → (backup) → transaction → console summary; second boot = byte-identical no-op |
| `requireTotpSecret` | server.js:405-408 | Boundary stays; the new helper loops factors through it |
| `pendingTfa` | server.js:414-421 | Per-factor staging key (D-13) |
| enroll / enable routes | server.js:2391-2407 / 2409-2451 | enroll gains label + existing-factor code step-up (TOTP2-05); enable gains per-factor key + row insert (D-13) |
| disable route transaction | server.js:2453-2504 (tx 2473-2496) | **The** last-factor removal transaction (D-18) — its teardown block at 2486-2494 (users flip + recovery delete + challenge delete + revoke-others) must run verbatim |
| recovery regen route | server.js:2508-2560 | Converts its verify block (2531-2543) to the factor helper |
| login second step | server.js:2566-2659 | TOTP branch 2608-2616 converts to the factor helper; recovery branch 2617-2625 stays OUTSIDE the loop (D-14) |
| Settings 2FA card | src/pages/settings.js:462-537 | Gains factor list + Add factor (D-01) + remove confirm modal (D-19) |
| tfa actions | src/actions/actions.js:2738-2864 | Clone the staged-action pattern for add-factor/remove |
| API wrappers | src/core/api.js:291-310 [VERIFIED: api.js:292-310] | Add wrappers for the new routes alongside `tfaEnroll/tfaEnable/tfaDisable/tfaRecover/tfaLogin` |

### Pattern 1: Shared factor-loop helper (D-10/D-11/D-12)

**What:** one helper loads all factor rows for the user, tries each: `requireTotpSecret(row.secret)`
→ on `!ok` skip that factor (D-12) → `verifyTotpCode(secret, code, row.last_step || null, nowSec)`
→ first hit short-circuits, returns `{ok, factorId, matchedStep}`.

**Key shapes to preserve:**
- The helper must call `requireTotpSecret`, never `decryptTotpSecret` — `test/totp-encryption.test.mjs:53-82` pins decrypt call-site exclusivity to exactly four regions (definition, requireTotpSecret body, D-K7 probe, re-wrap) and fails on any other `decryptTotpSecret(` occurrence [VERIFIED: test/totp-encryption.test.mjs:53-82].
- Unmatched code = one failed attempt against the *existing* counter. At login this is free: the
  `attempts = attempts + 1` increment (server.js:2595) happens before any code comparison, so
  iterating N factors still consumes exactly one attempt. Do not add per-factor attempt writes.
- The enable path (server.js:2424-2427) verifies the pending secret against the *new* code with the
  user's baseline as guard — for a second factor the guard should be that factor's own (null)
  baseline, not the account one, so a first-ever code from the new device is not refused.

### Pattern 2: Additive boot copy (D-06/D-07/D-09)

Trigger-gated like `migrateTotpEncryption`: copy only when `users.two_fa_enabled = 1` AND
`two_fa_secret` non-empty AND no `totp_factors` row exists for that user. Copy
`two_fa_last_step` → the new row's `last_step` (D-09). Second boot: zero eligible rows →
no writes, byte-identical (the `test/migration.test.mjs` pin discipline — `before` hook
captures `pragma table_info` snapshots; extend with `totp_factors`). D-73-style defer
semantics if MASTER_KEY is missing is the planner's discretion (decisions D-06 discretion).

### Pattern 3: Last-factor removal = existing transaction (D-18)

The remove route counts factor rows after step-up; if the target is the last, run the
disable transaction's teardown verbatim (2486-2494) — users flip, recovery wipe, challenge
wipe, revoke-others keep-current. If >1 factors, remove only the row (no recovery rotation,
D-17) and update `users.two_fa_last_step` only if the removed row held the account baseline.

### Recommended Project Structure
```
server.js              # schema + boot copy + helper + routes (existing single-file server)
totp.js                # untouched
src/pages/settings.js  # 2FA card: factor list, Add factor, remove modal
src/actions/actions.js # new staged actions beside tfa* ones
src/core/api.js        # new wrappers beside lines 291-310
src/locales/en.json    # catalogue keys (EN+FR parity, gated by i18n tests)
test/tfa-multi-factor.test.mjs   # new suite (Wave 0)
test/migration.test.mjs          # extend the byte-identical pin with totp_factors
test/totp-encryption.test.mjs    # deliberate pin-count updates (see Pitfall 1)
```

### Anti-Patterns to Avoid
- **Calling `decryptTotpSecret` from the new helper** — breaks the D-78c exclusivity pin. Always via `requireTotpSecret`.
- **A second teardown code path for "remove last factor"** — D-18 forbids re-implementing; delegate.
- **Reading `users.two_fa_secret` after migration** — D-08: kept, unread. The factor loop is the only reader.
- **Per-factor rate-limit budgets** — D-11: one attempt against the existing counter regardless of factor count.
- **Recovery codes inside the factor loop** — D-14: the 6-digit gate (server.js:2463-2467, 2520-2523) and the D-64 burn branch stay exactly where they are.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP verify / replay guard | New window logic | `verifyTotpCode` verbatim | RFC fixture-tested, matched-step guard contract (D-04) |
| Envelope crypto | Anything new | `encryptTotpSecret(secret,'v2')` + `requireTotpSecret` | Frozen keyring format; single-decrypt-boundary invariant |
| Relative time | Custom formatter | `ago()` (settings.js:551 usage) | Already localized/used |
| Staged wizard state machine | New modal flow | `tfaStage` staged pattern | D-01/D-04 explicitly mandate reuse |
| Boot migration | Ad-hoc copy at first query | Trigger-gated boot pass beside `migrateTotpEncryption` | Byte-identical second boot is a pinned milestone gate |

## Runtime State Inventory

Not a rename phase, but the migration moves live state — audited:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `users.two_fa_secret` / `two_fa_last_step` (enrolled users) — SQLite `projects.db` | One-time boot copy into `totp_factors` (D-06/D-09); users columns kept, unread (D-08) |
| Live service config | None — verified: no external service holds TOTP state | none |
| OS-registered state | None | none |
| Secrets/env vars | `MASTER_KEY` / `MASTER_KEY_PREVIOUS` keyring — unchanged; new rows stamp key ids via the same `encryptTotpSecret(...,'v2')` | none |
| Build artifacts | None (no build step for server; client built by Vite from sources) | none |

## Common Pitfalls

### Pitfall 1: Silent breakage of the encryption-pin tests
**What goes wrong:** `test/totp-encryption.test.mjs:89` asserts `(match(/const wrapped = requireTotpSecret\(/g)).length === 3` and line 91 asserts `verifyTotpCode(wrapped.secret` × 3 [VERIFIED: test/totp-encryption.test.mjs:85-92]. The factor-loop refactor changes these counts and moves verify calls into the helper.
**Why it happens:** the pins exist to lock the v1.5 contracts; the phase legitimately evolves them.
**How to avoid:** a Wave 0 task that updates these pins *with intent* — new expected counts + a new assertion that every factor decrypt flows through `requireTotpSecret` inside the helper.
**Warning signs:** full-suite red immediately after the helper lands.

### Pitfall 2: Replay-guard continuity window at migration
**What goes wrong:** if the copied row's `last_step` starts at 0/null, a code generated in the last window before upgrade replays after it.
**How to avoid:** D-09 — copy `users.two_fa_last_step` into the row in the same transaction. Also: enable of a *second* factor must use that factor's own (null) baseline, not the account's current `two_fa_last_step`, or the first scan-then-verify from the new device is refused (its code may be ≤ the account's stored step).

### Pitfall 3: Undecryptable-factor semantics conflict with the disable-503 contract
**What goes wrong:** today disable/regen/login return 503 `masterKeyMissing` when `requireTotpSecret` fails (server.js:2480, 2538, 2612). D-12 says the loop *skips* undecryptable factors. If ALL factors are undecryptable, the loop finds nothing — is that "code rejected" (an oracle-free lie) or 503?
**How to avoid:** planner decision (discretion area): recommend distinguishing "no factors decrypted at all" → 503 `masterKeyMissing` (preserves D-06 fail-closed and the existing test expectations) vs "some decrypted, none matched" → `codeRejected`/`invalidTfaCode` as today. Note the 503 copy is admin-facing, never user copy (D-58).

### Pitfall 4: Half-states between `users.two_fa_enabled` and factor count
**What goes wrong:** `two_fa_enabled = 1` with zero factors (undecryptable-all + removal edge), or factor rows surviving a disable.
**How to avoid:** D-18 — last-factor removal delegates to the disable transaction (which also wipes everything account-level in one `transaction()`); enable of the first-ever factor flips `two_fa_enabled` in the same transaction as the row insert (D-13, mirroring server.js:2440-2449).

### Pitfall 5: `last_step` ownership drift
**What goes wrong:** after D-06 the account-level `users.two_fa_last_step` is unread — but code writing it may linger, and login's `update users set two_fa_last_step` (server.js:2616) becomes dead writes.
**How to avoid:** the helper returns the matched factor; callers update `totp_factors.last_step` for that row only. Sweep the route bodies for leftover `two_fa_last_step` writes.

### Pitfall 6: i18n gate
**What goes wrong:** new catalogue keys (factor list labels, "Primary authenticator" EN+FR, modal copy) missing from one locale fail `test/i18n-scan.test.mjs` / `build-locales` / `catalogue.test.mjs`.
**How to avoid:** add every key to both `src/locales/en.json` and `src/locales/fr.json` in the same task.

## Code Examples

### The three call-site conversions (shape only — bodies stay verbatim otherwise)

```js
// server.js (new helper) — calls requireTotpSecret per factor (D-12), never decryptTotpSecret
function verifyTotpAgainstFactors(userId, code, nowSec) {
  const rows = db.prepare('select id, secret, last_step from totp_factors where user_id = ?').all(userId);
  let decrypted = 0;
  for (const row of rows) {
    const wrapped = requireTotpSecret(row.secret);
    if (!wrapped.ok) continue; // D-12: skip that factor alone
    decrypted++;
    const verified = verifyTotpCode(wrapped.secret, code, row.last_step || null, nowSec);
    if (verified.ok) return { ok: true, factorId: row.id, matchedStep: verified.matchedStep, decrypted };
  }
  return { ok: false, decrypted }; // decrypted === 0 → caller 503s (Pitfall 3)
}
// Login TOTP branch then: replace server.js:2611-2616 with the helper + per-factor
// last_step update; the D-64 recovery branch (2617-2625) stays untouched (D-14).
```

### Boot copy (additive, trigger-gated)

```js
// SCHEMA gains:
create table if not exists totp_factors (
  id        text primary key,
  user_id   text not null references users(id) on delete cascade,
  name      text not null,
  secret    text not null,          // v2 envelope via encryptTotpSecret(secret,'v2')
  last_step integer not null default 0,
  created_at integer not null
);
create index if not exists totp_factors_user on totp_factors(user_id);
// Boot copy: eligible = users.two_fa_enabled=1 AND two_fa_secret != '' AND zero rows in
// totp_factors for that user; copy secret envelope + two_fa_last_step → last_step (D-09);
// name = fixed catalogue key (D-07). Zero eligible rows → no-op (byte-identical second boot).
```

## State of the Art

N/A — internal feature. Relevant prior-art inside the repo: Phase 28's additive-migration
discipline (`memberships.team` kept-in-schema-unread, D-03/D-04 of 28-CONTEXT) is the named
template for D-06/D-08.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 31-CONTEXT.md (gathered 2026-11-01) supersedes the older STATE.md accumulated decision "mirroring the primary factor into `users.two_fa_secret` so existing call sites survive unmodified" — D-06/D-08/D-10 instead make `totp_factors` the single source of truth and convert the call sites. | Summary / code map | If the user intended the mirror approach, the helper refactor and D-08 are wrong; confirm at planning |
| A2 | Phase 30 (SSO) may not be executed yet (STATE.md current_phase: 29); its SSO×pending-2FA interaction is listed as this phase's dependency | Open Questions | If phase 30 lands differently, the pending-2FA challenge route shape may differ |
| A3 | Displaying last-used as derived time (`matchedStep * 30` epoch seconds) is acceptable instead of a wall-clock `last_used_at` column — context lists "last_used_at update timing" as discretion but D-05 says relative time | Code map / Pitfall 5 | Minor UX fidelity; a stored timestamp is the safer planner choice if in doubt |

## Open Questions

1. **All-factors-undecryptable at step-up/login** — 503 (preserve D-06 contract) vs skip-to-reject (strict D-12)? Recommendation: 503 when zero factors decrypted; `codeRejected` otherwise (Pitfall 3). Confirm in planning.
2. **Phase 30 status** — is SSO landed before Phase 31 executes? If not, verify the pending-2FA challenge surface is unchanged by SSO work.
3. **Copy migration vs missing MASTER_KEY** — copy is decrypt-free (envelope copied verbatim), so no MASTER_KEY dependency; the planner may confirm this reading of the discretion note.

## Environment Availability

Step 2.6 audit — all in-repo/runtime-bundled:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (`node:sqlite`, `node:test`, `node:crypto`) | everything | ✓ | v24.21.0 | — |
| ESLint (existing config) | lint gate | ✓ (script `lint`) | repo-pinned | — |
| Playwright e2e (`e2e/*.spec.mjs`) | login/tfa cycle specs reference `two_fa_last_step` behavior | ✓ (existing suites) | repo-pinned | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (built-in), concurrency 2 |
| Config file | none — script in package.json |
| Quick run command | `node --test test/tfa-multi-factor.test.mjs test/totp-encryption.test.mjs` |
| Full suite command | `npm test` (all `test/*.test.mjs`) + `npm run lint` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOTP2-01 | Second factor enrolls; any-factor acceptance at login/step-ups | integration | `node --test test/tfa-multi-factor.test.mjs` | ❌ Wave 0 |
| TOTP2-02 | Named list + individual removal with remaining-factor code | integration | same | ❌ Wave 0 |
| TOTP2-03 | Pending-2FA challenge accepts any factor | integration | same | ❌ Wave 0 |
| TOTP2-04 | Last-factor removal = disable transaction (no half-state) | integration | same | ❌ Wave 0 |
| TOTP2-05 | Add-factor requires existing-factor code step-up | integration | same | ❌ Wave 0 |
| D-06/09 | Boot copy: byte-identical second boot, last_step carried | migration pin | `node --test test/migration.test.mjs` | ✅ extend |
| D-77/78c | Decrypt boundary + pin counts after refactor | pin tests | `node --test test/totp-encryption.test.mjs` | ✅ update counts (Pitfall 1) |
| i18n | EN+FR parity for new keys | unit | `node --test test/i18n-scan.test.mjs test/build-locales.test.mjs` | ✅ |

### Sampling Rate
- **Per task commit:** the touched test file(s) above
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green + `npm run lint` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/tfa-multi-factor.test.mjs` — covers TOTP2-01..05 (reuse helpers: `startServer`, `withDb`, `login` from `test/helpers/`)
- [ ] Pin-count updates in `test/totp-encryption.test.mjs` (3→new call-site shape) — deliberate, documented
- [ ] `test/migration.test.mjs` — extend `pragma table_info` snapshot + second-boot byte-identical assertion with `totp_factors`
- [ ] New fixtures only within existing helper patterns — no framework install needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Multi-factor via `totp_factors`; password step-up gates (D-04/D-15) |
| V3 Session Management | yes | Disable transaction's revoke-others-keep-current (server.js:2494) reused for last-factor removal |
| V4 Access Control | yes | `requireUser` + same-origin gate on every new route (pattern at 2392/2410/2454) |
| V5 Input Validation | yes | Strict `/^\d{6}$/` gate before verify; label length/trim validation at enroll |
| V6 Cryptography | yes | AES-256-GCM via frozen keyring only — never hand-rolled; timing-safe compare inside `verifyTotpCode` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Code replay across factors | Spoofing | Per-factor `last_step` guard (D-09/D-10); `matchedStep <= stored` refused |
| Brute-force codes at login | Spoofing | Existing attempts counter + `tooMany` budgets; D-11 one-attempt semantics |
| Self-lockout via removal | DoS | D-15 live code from a *remaining* factor |
| Recovery-code confusion | Elevation | D-14: recovery verification stays outside the factor loop; 6-digit gate intact |
| Plaintext fallback | Info disclosure | Single decrypt boundary (D-77/78c); no `??`/`||` fallbacks — pinned by tests |

## Sources

### Primary (HIGH confidence — all read this session)
- server.js:113-127 (users schema), 323-408 (envelope + boundary), 414-421 (pending map), 1605+ / 1742+ (boot migrations), 2389-2559 (enroll/enable/disable/regen routes), 2564-2659 (login second step)
- totp.js:1-61 (verify contract, matched-step guard)
- test/totp-encryption.test.mjs (pins: 3 call sites, exclusivity regions, 503 semantics)
- test/migration.test.mjs (byte-identical second-boot discipline)
- src/pages/settings.js:462-537 (2FA card, `ago()` usage), src/actions/actions.js:2738-2864 (staged actions), src/core/api.js:291-310 (wrappers), src/locales/{en,fr}.json
- .planning/phases/31-second-totp-factor/31-CONTEXT.md, .planning/REQUIREMENTS.md, .planning/STATE.md

### Secondary / Tertiary
None needed — no external technology introduced.

## Metadata

**Confidence breakdown:**
- Code map & call sites: HIGH — every line number read this session
- Migration pattern: HIGH — read `migrateTotpEncryption` directly; re-wrap pass located
- Pitfalls: HIGH — pinned tests read directly
- Planner discretion areas (schema shape, helper signature, route names): open by design

**Research date:** 2026-11-01
**Valid until:** 2026-12-01 (in-repo facts; re-verify after Phases 29/30 land)
