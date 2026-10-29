# Phase 21: Disable-2FA Verification & Closure - Context

**Gathered:** 2026-10-29
**Status:** Ready for planning

<domain>
## Phase Boundary

The shipped `POST /api/auth/tfa/disable` route (`server.js:1656–1700`) is verified against the full contract and closed: password + live TOTP code only (the D-57 recovery-code branch is removed), one-transaction teardown that additionally wipes the user's pending `login_challenges` rows, an explicit documented session policy (revoke-others, keep-current), a `logSecurity` activity verb, and Chromium e2e coverage of the full disable→re-enroll cycle in EN + FR with all new strings catalogued (i18n-scan green).

Two deliverables (DIS-01, DIS-02):

1. **Route tightening & transactional closure** — the disable route becomes strict-6-digit-only, deletes pending challenges, applies the session policy, and records the verb, all inside the existing single transaction.
2. **Automated proof** — regression test proving a recovery code can never disable 2FA, plus the full-cycle e2e spec in both languages.

Operator session revocation belongs to Phase 22. Key rotation and key-custody runbook remain deferred per REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

### Recovery-code tightening (DIS-02)
- **D-101:** The D-57 recovery-code branch is **deleted entirely** from the disable route. Non-6-digit input is rejected with 400 `codeRejected` before any `recovery_codes` access — the exact D-85 pattern the regen route already implements (`server.js:1704+`). No recovery lookup exists anywhere in the route; it is structurally impossible for a recovery code to disable 2FA. — **Reversibility:** costly — the "no recovery lookup in the route" property is the load-bearing DIS-02 invariant; re-adding the branch would reintroduce the D-57 dual-shape hazard that Phase 20 removed from its sibling route.
- **D-102:** The regression test posts a valid, unused recovery code to the disable route and asserts 400 `codeRejected` **and** that the recovery codes remain intact (not burned, not deleted) and 2FA remains enabled.

### Pending login-challenge teardown (DIS-01)
- **D-103:** Disable deletes **all** `login_challenges` rows for the user (`delete from login_challenges where user_id = ?`) inside the existing disable transaction — not just unexpired ones; no distinction is worth maintaining. A user who just turned 2FA off has no legitimate pending 2FA challenge. — **Reversibility:** reversible.
- **D-104:** Regression coverage: disable while a pending challenge exists, then prove the challenge token no longer completes login (the ghost-state failure DIS-01 names).

### Session policy (DIS-01)
- **D-105:** Disable revokes **all sessions except the current one** (`delete from sessions where user_id = ? and token_hash != ?`), mirroring the password-change precedent (`server.js:1587`), inside the same transaction. Rationale: disable is a security-control removal, unlike regeneration (D-98, no session touch); the current browser stays signed in so the user sees the updated card. — **Reversibility:** reversible.
- **D-106:** The policy is documented in the route comment and asserted in e2e: a second browser session goes through the central honest 401 teardown after disable.

### Activity verb
- **D-107:** Successful disable records `logSecurity(user.id, 'tfa_disabled')` — the Phase 20 mechanism (already used by the regen route, `server.js:1747`). Same outcome handling questions do not arise: log after the transaction commits 'ok', before the response.

### Throttle & guards (unchanged, verified)
- **D-108:** The existing throttle (`tfa-disable|${user.id}`, 5/15min), guard order (`sameOrigin` → `requireUser` → throttle → `readJson`), and `requireTotpSecret` fail-closed 503 stay as shipped — Phase 21 verifies them, not rewrites them. Wrong-password attempts still consume a try (D-41/D-49/D-94 band).

### e2e scope & i18n (success criterion 4)
- **D-109:** One Chromium spec covers the full cycle in EN and FR: enable → login with 2FA → disable (password + TOTP) → login without 2FA → re-enable. Plus two contract-critical scenarios in the same spec family: the recovery-code rejection regression (D-102 at the UI level) and the session-policy assertion (D-106).
- **D-110:** Server-level tests (not e2e) cover: pending-challenge teardown (D-104), throttle, wrong password, wrong code, and 503 `masterKeyMissing`. Exhaustive error-state rendering in-browser is out of scope.
- **D-111:** All new user-facing strings (if any — the disable form already exists) are catalogued EN + FR under `settings.tfa.*`; i18n-scan must stay green.

### the agent's Discretion
- Exact test file placement and naming within existing conventions; whether D-104/D-102 server tests live in one file or follow the existing tfa test split; the FR/EN copy for any touched strings; route comment wording for the session policy.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ground-truth code (server.js)
- `server.js:1656–1700` — the shipped disable route: the subject of this phase. Transaction shape, outcome handling, and throttle stay; the recovery branch (1673–1688) is deleted.
- `server.js:1704–1754` — the Phase 20 regen route: the D-85 strict-6-digit pattern to mirror (D-101) and the `logSecurity` verb call site (D-107).
- `server.js:1561–1590` — password change: the revoke-others session precedent D-105 mirrors.
- `server.js:117–123` + `server.js:1501,1534,1783–1790` — `login_challenges` schema and lifecycle: what D-103 tears down and what D-104 must prove dead.
- `requireTotpSecret` wrapper (Phase 19, near `server.js:230–262`) — the only decrypt path for the live-TOTP check; stays as shipped (D-108).
- `src/pages/settings.js:391–432` — the tfa card with the disable inline-stage form the e2e drives.
- `src/locales/en.json`, `src/locales/fr.json` — `settings.tfa.*` namespace for any touched strings (D-111).

### Planning docs
- `.planning/REQUIREMENTS.md` § DIS-01/DIS-02 — locked requirement text; deferred items list.
- `.planning/ROADMAP.md` Phase 21 details — the four success criteria this phase is verified against, including the flagged policy conflict this discussion resolved.
- `.planning/phases/20-recovery-code-regeneration/20-CONTEXT.md` — D-85 strictness contract, D-94 throttle precedent, D-107's `logSecurity` mechanism, D-109's UI inline-stage context.
- `.planning/phases/19-totp-encryption-closure/19-CONTEXT.md` — D-77 wrapper contract, D-80 503 contract this phase consumes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Disable route's transaction/outcome scaffold (`server.js:1670–1695`): the tightening is subtractive (delete branch, add two deletes + session revoke + verb) — the shape stays.
- Regen route (`server.js:1704+`): the strict-input reference implementation and the `logSecurity` call pattern.
- Existing tfa route tests and Chromium e2e helpers: reuse for D-104/D-110 server tests and the D-109 spec.
- Central honest 401 teardown: the mechanism D-106's e2e assertion rides.

### Established Patterns
- Guard order Pitfall 22, throttle band D-11, single-transaction atomicity (Pitfall 4, fresh re-select inside), `Cache-Control: no-store` via `json()`.
- Security-sensitive actions revoke others / keep current (password change) — disable now joins this family.

### Integration Points
- `login_challenges` lifecycle (challenge issue/burn at `server.js:1501,1534,1783–1790`): the disable teardown must not break an in-flight login for a *different* user — scoped strictly by `user_id`.
- i18n-scan pipeline: new/changed strings must be catalogued.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — the discussion locked policy and proof shape; standard approaches cover the rest.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 21-Disable-2FA Verification & Closure*
*Context gathered: 2026-10-29*
