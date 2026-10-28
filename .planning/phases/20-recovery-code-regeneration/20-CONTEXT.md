# Phase 20: Recovery-Code Regeneration - Context

**Gathered:** 2026-10-28
**Status:** Ready for planning

<domain>
## Phase Boundary

A 2FA user can burn-and-replace their recovery codes via `POST /api/auth/tfa/recovery`, behind the strongest step-up (current password + live TOTP code). Two deliverables (REGEN-01, REGEN-02):

1. **Regeneration endpoint** — password + live TOTP step-up; a recovery code can never satisfy the step-up; atomic delete-all + insert-new in one transaction; own throttle budget; `Cache-Control: no-store`.
2. **Settings UI flow** — a regenerate action on the tfa settings card whose new codes are displayed exactly once and never stored.

Session policy, disable-2FA, and operator revocation belong to Phases 21/22. Key rotation and key-custody runbook remain deferred per REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

### Step-up Strictness
- **D-85:** Strict 6-digit-only input — the route rejects any non-6-digit input with 400 `codeRejected` **before** any recovery_codes lookup; no recovery lookup exists anywhere in the route. Structurally impossible for a recovery code to satisfy step-up (REGEN-01 regression test proves it). — **Reversibility:** costly — the "no recovery lookup in the route" property is the load-bearing safety invariant; adding a lookup later would reintroduce the D-57 dual-shape hazard.
- **D-86:** Factor check order is password → TOTP, mirroring the disable route's order inside its transaction.
- **D-87:** A successful TOTP verification updates `users.two_fa_last_step` to the matched step **in the same transaction** as the burn-and-replace — the D-04 replay guard stays current across regeneration.
- **D-88:** Single transaction covers password verify, TOTP verify (decrypt via `requireTotpSecret`, D-77), delete-all and insert-new — rows re-selected fresh inside the transaction (Pitfall 4 pattern). An interrupted or concurrent attempt can never leave both old and new codes valid (REGEN-02).
- **D-89:** The live-TOTP check reads the encrypted secret through the Phase 19 `requireTotpSecret` wrapper and fails closed 503 `masterKeyMissing` on `{ ok: false }` — same outcome handling as the disable route.

### UI Entry & Flow
- **D-90:** The regenerate action is an **inline stage on the existing tfa settings card**: a button in the on-state row (next to "Turn off") that reveals an inline confirmation form with password + 6-digit code fields — the same inline-stage pattern the disable flow uses (`S.ui.tfaStage`).
- **D-91:** The new codes are displayed by **reusing the existing D-53 one-time recovery modal** (transient `S.ui.recoveryCodes`, cleared on dismiss, copy-all path). Zero new display machinery; the regenerated set renders identically to the enable-time set.
- **D-92:** The confirmation form carries a small warning that regeneration invalidates the old codes ("your old codes will stop working") — new EN + FR i18n keys, catalogued for the i18n-scan.

### Route & Throttle Shape
- **D-93:** Throttle budget `tfa-regen|${user.id}`, 5 attempts / 15 minutes — the same shape as `tfa-enroll` and `tfa-disable` (D-11 band). Identity-keyed since the caller is authenticated.
- **D-94:** Every attempt consumes one try, **including a wrong password** — the D-41/D-49 precedent ("every attempt — including a wrong current password — consumes one try"). Prevents free scrypt-oracle probing.
- **D-95:** A user with 2FA disabled is rejected with **409 `tfaNotEnabled`** before any factor check — the TFA-03 verify-before-enable spirit applied to regeneration.
- **D-96:** Guard order mirrors every tfa sibling (Pitfall 22): `sameOrigin` → `requireUser` → throttle → `readJson`.

### Codes & Side Effects
- **D-97:** The regenerated set is **10 codes via `generateRecoveryCode()`**, hashed with `recoveryHash(normalizeRecoveryCode(code))` — the identical recipe and count as the enable route (D-50/D-51). Plaintext never stored.
- **D-98:** Existing sessions are **untouched** — only the `recovery_codes` table and `two_fa_last_step` change. Codes are a login-recovery factor, not a session credential; suspected code exposure is not treated as suspected session compromise. (Contrast with password change, which revokes others.)
- **D-99:** Successful regeneration records an activity entry with a new verb (e.g. `tfa_recovery_regenerated`). **Ground-truth caveat for the planner:** gr8r's only activity mechanism today is task/workspace-document-scoped (`logAct`, `src/core/store.js:264`) — there is no account-security activity feed, and no auth route currently records one (password change, enable and disable 2FA record nothing). The planner must define the minimal honest mechanism (e.g. a server-side security log the UI can surface, or a documented deferral) rather than force-fitting the task activity feed. Note Phase 21's DIS-01 also requires "records the activity verb" — whatever mechanism is chosen should be shared by both routes.
- **D-100:** The response is `{ ok: true, recoveryCodes: [...] }` with `Cache-Control: no-store` — the identical envelope to the enable response, so the client modal path is shared and one less payload shape exists.

### the agent's Discretion
- Error-copy wording for the new 409/400 codes, exact i18n key names, test file placement within existing conventions (server route tests + a Chromium or fetch-level test consistent with how tfa routes are tested today), and the D-99 mechanism detail — decisions above fix behavior, not prose or wiring specifics.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ground-truth code (server.js)
- `server.js:1621–1640` — enable route: the complete burn-and-replace recipe to mirror (generate 10 codes, transaction, delete-all + hash-insert, `recoveryCodes` response)
- `server.js:1643–1690` — disable route: password + code step-up order, single-transaction outcome pattern, `requireTotpSecret` usage, throttle key shape — the closest sibling for the new route
- `server.js:1583–1602` — enroll route: D-49/D-41 throttle-every-attempt precedent
- `server.js:1744–1750` — login recovery burn: the race-safe conditional `used_at is null` burn — regeneration's delete-all supersedes any unused codes
- `server.js:49` + `totp.js` — `generateRecoveryCode`, `normalizeRecoveryCode`, `recoveryHash`, `verifyTotpCode` signatures
- `requireTotpSecret` wrapper (Phase 19, near `server.js:230–262`) — the only decrypt path allowed for the live-TOTP check (D-89)

### Frontend
- `src/pages/settings.js:391–432` — the tfa card, its on-state row and the disable inline-stage form this phase extends
- `src/overlays/modals.js:48–57` — the D-53 one-time recovery modal to reuse for the regenerated set
- `src/locales/en.json`, `src/locales/fr.json` — `settings.tfa.*` keys; new keys follow this namespace
- `src/core/store.js:264` — `logAct`: the only existing activity mechanism (task-scoped) — relevant to the D-99 caveat

### Planning docs
- `.planning/REQUIREMENTS.md` § REGEN-01/REGEN-02 — locked requirement text; deferred items list
- `.planning/ROADMAP.md` Phase 20 details — success criteria this phase is verified against
- `.planning/phases/19-totp-encryption-closure/19-CONTEXT.md` — D-77 wrapper contract, D-80 503 contract this phase consumes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Enable route's burn-and-replace block (server.js:1621–1640): transaction shape, code generation, hashing, response envelope — the new route is a close structural sibling.
- The D-53 one-time recovery modal: complete one-time display machinery (transient state, copy-all, dismiss-clear) — reused verbatim for regenerated codes.
- `requireTotpSecret` (Phase 19): the decrypt boundary the live-TOTP check goes through.
- Disable route's inline confirmation form + `S.ui.tfaStage` staging: the UI pattern D-90 extends.

### Established Patterns
- Pitfall 22 route-guard order (sameOrigin first), D-11 throttle budget band, D-41/D-49 every-attempt-counts, single-transaction re-select-fresh (Pitfall 4), one normalization (Pitfall 6), D-xx inline decision tags in server.js continuing the sequence.
- All 2FA routes are JSON with `error_code`-carrying `fail()` responses; the client switches on `error_code`.

### Integration Points
- New route block placed with the other tfa routes in server.js.
- tfa settings card on-state row (settings.js) gains the regenerate button + inline stage.
- `refreshTfa()` / `api.user.twoFa` state already reflects 2FA status — no new server state is needed by the UI beyond the route.
- D-99 activity mechanism — to be defined at planning; shared with Phase 21's disable route.

</code_context>

<specifics>
## Specific Ideas

- "A recovery code must never satisfy the step-up" is enforced structurally (no lookup exists), not behaviorally — the user chose the strongest option over dual-shape-with-reject.
- Regeneration is deliberately narrower than password change: sessions survive, only codes burn. Suspected code exposure ≠ suspected session compromise.
- The new-codes display must be zero new machinery — reuse the enable-time modal so the two one-time displays can never drift.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Session policy on regeneration was decided in-scope as "sessions untouched"; broader revocation semantics belong to Phases 21–22.)

</deferred>

---

*Phase: 20-Recovery-Code Regeneration*
*Context gathered: 2026-10-28*
