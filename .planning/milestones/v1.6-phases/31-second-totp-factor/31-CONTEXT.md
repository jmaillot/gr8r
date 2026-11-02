# Phase 31: Second TOTP Factor - Context

**Gathered:** 2026-11-01
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can register multiple named TOTP factors alongside the first — each a row in a new
`totp_factors` table riding the existing `v2:` envelope keyring through `requireTotpSecret()` —
with per-factor replay guards, individual removal (password step-up + live code from a remaining
factor), and last-factor removal delegating to the existing disable-2FA transaction. A code from
ANY enrolled factor is accepted at login, at the pending-2FA challenge, and at every step-up call
site. Recovery codes and the v1.4 disable contract unchanged. No new crypto, no new runtime
dependencies. Safest feature closes the milestone (v1.6).

</domain>

<decisions>
## Implementation Decisions

### Factor list & naming UI
- **D-01:** The factor list lives in the **existing 2FA card** in the settings security tab —
  a list of enrolled factors (name + last-used) with an "Add factor" button that re-launches the
  existing staged enroll wizard. No new sub-tab, no modal-only management.
- **D-02:** A **label is required at enrollment** (a naming step before the QR step, e.g. "Work
  phone"); a factor cannot be enrolled unnamed.
- **D-03:** **No rename after enrollment** — names are fixed at enrollment. No rename route, no
  edit UI, no additional mutation path on auth data.
- **D-04:** "Add factor" step-up reuses the existing staged wizard pattern (D-49 discipline):
  current password, then a live code from the existing factor, before the new factor's QR/secret
  is shown (TOTP2-05).
- **D-05:** Last-used is displayed as **relative time** under each factor name ("2 hours ago"),
  refreshed on tab load.

### First-factor migration
- **D-06:** The boot migration **copies `users.two_fa_secret` into a `totp_factors` row**, making
  the table the single source of truth. After migration the users column stays in schema but
  nothing reads it — same additive discipline as `memberships.team` in Phase 28 (D-03/D-04).
  — **Reversibility:** one-way — the copy is the migration; a different source-of-truth choice
  later would need a new migration, and the migration test pin (`test/migration.test.mjs`,
  byte-identical second boot) locks the outcome.
- **D-07:** The migrated row is named with a **fixed catalogue string (EN+FR)**, e.g. "Primary
  authenticator" — localized at display time, nothing free-text stored. Consistent with D-03
  (no rename): the catalogue label is the permanent name.
- **D-08:** `users.two_fa_secret` and `users.two_fa_last_step` remain in schema **kept, unread**
  after migration; `users.two_fa_enabled` stays the on/off switch.
- **D-09:** The migrated row's initial per-factor `last_step` is the **current
  `users.two_fa_last_step` value** — replay-guard continuity, no window where a pre-migration
  code replays. Per-factor guards in `totp_factors` take over entirely.

### Replay guard & verification
- **D-10:** A **shared verification helper** (e.g. `verifyTotpAgainstFactors(userId, code, now)`)
  loads all factor rows, tries each with its own replay guard, and returns the matched factor +
  step. All call sites — login challenge, tfa/disable step-up, recovery regen step-up — route
  through it (TOTP2-03).
- **D-11:** **First match short-circuits**; an unmatched code counts as one failed attempt
  against the existing challenge attempts counter, regardless of factor count.
- **D-12:** An **undecryptable factor is skipped** in the loop (fails closed for that factor
  alone via `requireTotpSecret()`); other factors still verify.
- **D-13:** Enroll→enable staging **extends the existing in-memory pending map** (per-factor key);
  on enable the row inserts with `last_step = matched step`, and `users.two_fa_enabled` flips on
  only for the first-ever factor.
- **D-14:** Recovery codes are **untouched** — they verify outside the factor loop (existing D-64
  burn path at login); a TOTP code never satisfies recovery (D-59/D-72 boundary).

### Removal semantics
- **D-15:** Removing a single factor requires a live code from a factor that is **NOT the one
  being removed** — the lock-yourself-out guard, matching TOTP2-02's wording.
- **D-16:** **No factor picker** at removal: after password step-up the user types a code; the
  server verifies it against all remaining factors.
- **D-17:** Recovery codes rotate **only on last-factor removal** (the existing disable
  transaction's D-53 rotation) and when a new first factor is enrolled after disable.
  Single-factor removal leaves recovery codes alone.
- **D-18:** Removing the **last factor delegates to the existing disable-2FA transaction
  verbatim** — the remove route detects "last factor" and runs it; no re-implemented second
  code path (TOTP2-04's no-half-state guarantee rides the existing transaction).
- **D-19:** Per-factor removal uses a **confirm modal** (factor name + current password + live
  code from any remaining factor), same modal pattern as the existing disable confirmation.

### the agent's Discretion
- Exact `totp_factors` schema shape (column names, indexes, timestamps) and API route naming.
- Catalogue key wording for the migrated "Primary" label (EN+FR strings).
- Helper naming/signature, last_used_at update timing, and per-factor test pins beyond the
  existing totp test files.
- Migration failure semantics detail (rows that fail decrypt are left as-is per D-K7/D-K9 —
  planner decides how the copy step treats them).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` § Second 2FA Factor (TOTP2-01..TOTP2-05) — locked requirements for this phase
- `.planning/ROADMAP.md` § Phase 31 — goal, success criteria 1–5

### Prior phase context (patterns to follow)
- `.planning/phases/28-multi-team-membership/28-CONTEXT.md` — additive-migration discipline (D-03/D-04: keep scalar column in schema, unread), authority-row pattern

### Cross-cutting gates
- `.planning/REQUIREMENTS.md` § Cross-cutting — additive-only migrations pinned in `test/migration.test.mjs`, byte-identical second boot, EN+FR i18n gate, zero new dependencies

No external specs/ADRs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireTotpSecret()` (server.js:405) — single decrypt boundary (D-77/D-79); all factor
  decryption must flow through it
- `encryptTotpSecret(secret, 'v2')` — the only v2 envelope writer (D-K10)
- In-memory pending map (server.js:~2410) — staged, not-yet-verified TOTP secrets keyed by user;
  extends to per-factor staging (D-13)
- Staged enroll wizard (`tfaStage` flow, `src/actions/actions.js:2738+`; API wrappers
  `src/core/api.js:291-310`) — reuse for "Add factor"
- Existing disable-2FA transaction (server.js:2479-2487) — the last-factor removal target (D-18)

### Established Patterns
- Single decrypt boundary: `requireTotpSecret()` is the ONLY caller of `decryptTotpSecret()`,
  pinned by `test/totp-encryption.test.mjs`
- Fail-closed on undecryptable envelopes (D-75, D-K7, D-K9); migration re-wrap boot gates
  (`migrateTotpEncryption` server.js:1605, `migrateTotpReWrap` server.js:1742)
- Replay guard: ±1 window + stored last-step compare (`verifyTotpCode(secret, code, lastStep, now)`)
- Additive-only migrations with pre-migration backup, byte-identical second boot

### Integration Points
- Three `requireTotpSecret()` step-up/login call sites to convert to the shared factor-loop
  helper: login challenge (server.js:2611), tfa/disable (2479), recovery regen (2537)
- Enroll-enable path verifying the pending secret (server.js:2426) and the enable write
  (server.js:2441)
- Recovery-code burn path at login (server.js:~2620) — unchanged, outside the factor loop
- Settings security tab 2FA card (client) — gains the factor list + Add factor button

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 31-Second TOTP Factor*
*Context gathered: 2026-11-01*
