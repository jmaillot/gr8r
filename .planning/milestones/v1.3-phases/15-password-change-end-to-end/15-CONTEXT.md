# Phase 15: Password Change End-to-End - Context

**Gathered:** 2026-10-27
**Status:** Ready for planning

<domain>
## Phase Boundary

The password-change form stops lying: `A.savePassword`
(`src/actions/actions.js:2378`) currently shows a success toast without any
API call. This phase wires the flow end to end — a dedicated
`PATCH /api/auth/password` route that verifies the current password
server-side, rehashes with scrypt, and revokes all other sessions in one
`transaction()` (reusing Phase 14's revocation primitive), plus the client
rewiring with honest success/failure copy (PASS-01, PASS-02, PASS-03).

No TOTP behavior (Phase 16), no login-flow rework (Phase 17), no e2e sweep
(Phase 18).

</domain>

<decisions>
## Implementation Decisions

### Endpoint design

- **D-34:** Dedicated route `PATCH /api/auth/password` with body
  `{ currentPassword, newPassword }` — does NOT extend `PATCH /api/auth/me`.
  Matches the D-26 flat noun-resource style of the `/api/auth/*` family and
  keeps the sensitive change out of `/me`'s mass-assignment guard (locale
  only).
- **D-35:** `sameOrigin(req)` guard required before any processing — same
  pattern as every mutating endpoint.
- **D-36:** Server-side strength validation uses the **same rules as
  signup** (`server.js:1396`: ≥ 10 chars + digit or symbol, existing
  `passwordTooWeak` code). The client validates first line; the server
  enforces independently.

### Response & errors

- **D-37:** Success response is minimal: `200 { ok: true }` — no
  `revokedCount` exposed; the toast says other sessions were disconnected
  without a count.
- **D-38:** Dedicated error codes: `wrongCurrentPassword` (current password
  incorrect), existing `passwordTooWeak`, `passwordRequired` (empty fields).
  Client translates via the `err.*` catalogue (ERR-01 pattern).
- **D-39:** On `wrongCurrentPassword`, the client clears only the
  current-password field, keeps the new password input, and shows the error
  under the current field — no full-form wipe.

### Throttle policy

- **D-40:** Throttle key is **`user_id`** via the existing `tooMany()`
  primitive (`server.js:1163`), budget **10 tries / 15 min** (D-11 band).
  The caller is already cookie-authenticated — IP+email (D-12) is the login
  shape, not this one; IP alone would lock out whole CGNAT households.
- **D-41:** A wrong current-password attempt **consumes budget** — that is
  the attack vector (password guessing against a stolen cookie).
- **D-42:** Lockout copy follows **D-13 exactly**: generic
  `tooManyAttempts` message, no timing, no `Retry-After`.

### Client UX after change

- **D-43:** After success: fields cleared, honest toast
  « Mot de passe mis à jour · autres sessions déconnectées » (PASS-03),
  sessions tab refreshes (D-29 refresh pattern), user stays signed in on the
  changing browser.
- **D-44:** The second (revoked) browser is handled by the **existing 14-05
  central 401 intercept** → `signOutRevoked()` with the
  `err.signedOutElsewhere` toast. No new work — a test must verify the
  routing.
- **D-45:** Client strength rules **identical to signup** (10+ chars, digit
  or symbol), consistent with the server rule (D-36); the existing
  `pwStrength` meter stays.

### Agent's Discretion

- Exact toast copy within the honest-copy rule (catalogued EN+FR).
- Test file placement following existing `test/` conventions.
- Handler ordering within the `/api/auth/*` route block.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pinned contracts (Phase 13 — binding for this phase)
- `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` —
  D-11 (throttle budgets), D-13 (generic lockout copy) are load-bearing here
- `.planning/phases/13-investigation-invariant-pinning/13-CONTEXT.md` —
  locked ground truth

### Prior phase context
- `.planning/phases/14-schema-session-ground-truth/14-CONTEXT.md` — D-26
  (route family), D-27 (opaque ids), D-28/D-29 (401 UX + refresh), the
  revocation primitive 14-03 landed

### Milestone planning docs
- `.planning/ROADMAP.md` — Phase 15 goal + success criteria (PASS-01–03)
- `.planning/REQUIREMENTS.md` — PASS-01–03 definitions
- `.planning/STATE.md` — "Key Decisions for Planning" (revocation
  keep-current SQL, throttle budgets)
- `.planning/research/PITFALLS.md` — Pitfall 9 (revoke self-DoS: keep the
  changing session alive)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hashPassword` / `verifyPassword` (`server.js:189-204`): scrypt with
  per-password salt + `DUMMY_HASH` constant-time comparison — reuse
  directly for verify + rehash
- `transaction(fn)` (`server.js:779`): `begin immediate` / commit /
  rollback — PASS-02's atomicity wraps the rehash + delete-others in one
  call
- Phase 14 revocation SQL: keep-current delete
  (`token_hash != sha256(current cookie)`) — PASS-02 reuses it verbatim
- `tooMany(key, max, windowMs)` (`server.js:1163`): D-40's budget plugs in
- `sameOrigin(req)`, `clientIp(req)`, `readJson(req)`: existing guards on
  the same route block
- Client form already exists: `src/pages/settings.js:377-385` (3 fields,
  `pwStrength` meter, error spans, all strings catalogued EN+FR),
  `A.savePassword` (`src/actions/actions.js:2378`) is the stub to rewire,
  `api.sessions/revokeSession` methods (`src/core/api.js:237-243`) show the
  auth-scoped API-call pattern to copy for the new method

### Established Patterns
- Honest-copy rule (v1.2): success toast states what actually happened
- Server tests never mock SQLite or HTTP; each test file owns its server +
  temp database — the PASS-01/02 tests follow this (two-browser test =
  two cookies against one server)
- i18n: new strings catalogued EN+FR before the build-gate scan runs
- Error translation: server sends English message + stable code; client
  translates the code (ERR-01/02)

### Integration Points
- `/api/auth/sessions` DELETE routes (`server.js`, landed in 14-03): the
  delete-others SQL that the password-change transaction reuses
- `A.savePassword` (`src/actions/actions.js:2378`): the fake success path
  replaced by a real `api.changePassword` call
- `signOutRevoked()` + central 401 intercept (14-05): already handles the
  revoked second browser end to end
- Session touch points: the changing browser's session row must survive
  the transaction (keep-current semantics — Pitfall 9)

</code_context>

<specifics>
## Specific Ideas

- The user chose the minimal response (`{ ok: true }`) over exposing
  `revokedCount` — keep the toast count-free (« autres sessions
  déconnectées », no number).
- The user consistently picked the established-pattern option: dedicated
  route on the `/api/auth` family, sameOrigin guard, signup-identical
  strength rules, D-13 lockout copy unchanged. Do not introduce new
  conventions in this phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-Password Change End-to-End*
*Context gathered: 2026-10-27*
