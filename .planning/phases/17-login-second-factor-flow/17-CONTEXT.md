# Phase 17: Login Second-Factor Flow - Context

**Gathered:** 2026-10-27
**Status:** Ready for planning

<domain>
## Phase Boundary

An enrolled user signing in faces a real second step: after a correct
password the login flow issues a short-lived challenge (cookie + `login_challenges`
row) and the client shows a dedicated code screen; the sign-in completes only
when a live 6-digit TOTP code or a single-use recovery code verifies on a
dedicated route — and only then is a session identity minted. A pending
(password-correct, code-absent) sign-in is anonymous across every endpoint
family, proven by the 401-matrix test over API routes, `/w/:slug/file/:id`
and invite accept. The password→2FA steps share one throttle budget with no
reset between steps (the `attempts.delete()` success-clear at the current
`server.js:1350` must not run between them), and D-13's generic lockout copy
replaces the pre-existing "Try again in 15 minutes" 429 string at
`server.js:1235`-area as scoped in 13-DECISIONS.

All crypto, schema, throttle constants, and the recovery-code burn primitive
already exist (Phases 13/14/16) — this phase is the login flow, the challenge
lifecycle, and the proof. No e2e/i18n sweep (Phase 18), no settings-surface
work (Phase 16 owns it).

</domain>

<decisions>
## Implementation Decisions

### Second-step screen shape

- **D-60:** The second step is a **dedicated full-screen state** — a new
  `s === '2fa'` branch in `src/pages/auth.js` rendering `authShell()` with
  its own card (code input + back link). Consistent with the existing
  login/signup/forgot state pattern; no inline-swap on the login card.
- **D-61:** The code screen offers a **"back to sign in" link that clears the
  challenge cookie** and returns to the login card. The pending challenge is
  abandoned; the shared throttle budget is NOT reset (D-03's
  one-logical-login-one-budget survives an abandoned challenge).
- **D-62:** The code screen shows a **masked email** (e.g. `j***@d***.com`)
  so multi-account users pick the right authenticator entry without full
  disclosure.
- **D-63:** The masked email is **computed server-side and returned in the
  login response payload** — nothing persisted, nothing client-computed.

### Input & error contract

- **D-64:** **One dual-shape code field** — a single input
  (`autocomplete="one-time-code"`) accepting either a 6-digit TOTP or an
  `xxxx-xxxx` recovery code; the server decides by shape, no client
  branching. Reuses `normalizeRecoveryCode()`/`recoveryHash()` and mirrors
  D-57's settings-disable precedent exactly.
- **D-65:** **One generic error code for both failure shapes**
  (e.g. `invalidTfaCode`, one message). No oracle distinguishing a wrong TOTP
  from a dead/stolen recovery code (Pitfall 15's failure table: one error
  code regardless of reason). Mirrors the settings-disable error behavior.
- **D-66:** Challenge lifecycle **per D-03 exactly**: 3 wrong codes or
  5 minutes kills the challenge; the shared throttle budget still governs;
  after challenge death the user restarts from the password step. No override.
- **D-67:** Failure path **per D-03/D-11 mechanics only** — attempts counter
  on the `login_challenges` row + the shared `tooMany()` budget,
  length-validate before `timingSafeEqual` (Pitfall 22), attempt increment
  before verify so a race can't smuggle a fourth try. No artificial delay,
  no extra logging beyond the pinned contract.

### Pending-state client contract

- **D-68:** `POST /api/auth/login` with a correct password on a 2FA-enabled
  account returns **`200 { pending2fa: true, maskedEmail }`** and sets **only
  the challenge cookie** — short-lived (~5 min, never `SESSION_DAYS`; Pitfall
  15's Max-Age copy-paste warning). No session cookie, no user payload in the
  pending response. The name `pending2fa` is chosen so no client can
  misread it as signed-in.
- **D-69:** Code verification is a **dedicated route** (e.g.
  `POST /api/auth/tfa/login`) carrying the `sameOrigin` guard, the
  `2fa-login|${ip}|${email}` throttle (D-11), and consuming the challenge
  cookie. On success: atomically delete the challenge row, mint the real
  session (`SESSION_DAYS`), set the session cookie, return the user payload.
  Dedicated route per the D-26/Phase-15 pattern; the password handler is not
  extended with a second identity-minting path.
- **D-70:** **No client persistence of pending state**: a reload
  mid-challenge shows the login form again. The still-valid challenge cookie
  expires server-side; re-submitting the password creates a fresh challenge.
  No sessionStorage mirrors of auth state — the exact decorative pattern this
  milestone is killing.
- **D-71:** The 401-matrix proof is **scoped as in ROADMAP success criterion
  3**: with a challenge cookie held, assert 401 from a `requireUser()` API
  route, `GET /w/:slug/file/:id`, invite accept, and `PATCH /api/auth/me` —
  plus `GET /api/auth/me` answering `user: null`, and logout working from the
  pending state (clears the challenge).

### Recovery-code UX at login

- **D-72:** A burned recovery code goes **straight to session — same as a
  TOTP success**. The burn is the authentication event; the used code is
  marked burned in the same transaction that mints the session.
- **D-73:** After a recovery burn, show a **post-login banner**:
  "Recovery code used — you have N left" with a link to settings — honest
  reporting (v1.2 rule), non-blocking; N comes from the verify response.
- **D-74:** When the burned code was the **last remaining one**, the banner
  escalates its copy ("This was your last recovery code — generate new ones
  in Settings" + link). Copy escalation only, no behavior change.
- **D-75:** Post-verify landing is the **normal home/overview** — no special
  routing for the recovery path.

### Agent's Discretion

- Exact challenge-cookie name and serialization (separate from the session
  cookie per D-02; ~5 min Max-Ace per D-68; httpOnly/sameSite attributes
  matching the session cookie's existing setSessionCookie style).
- Exact verify-route path name (`/api/auth/tfa/login` suggested, D-26 flat
  style) and response payload key for the remaining-recovery-count (D-73).
- Masking algorithm for D-62 (e.g. first char + `***` + domain first char)
  — must never leak enough to enumerate.
- Test file placement/structure following existing `test/` conventions
  (`tfa-enrollment.test.mjs` is the model); the 401-matrix may live in its
  own file or extend an existing auth test file.
- New locale keys (code screen, banner, escalated banner, error copy) —
  catalogued EN+FR in-commit per the established i18n convention.
- Exact generic lockout replacement copy for the `server.js:1235`-area 429
  string, within D-13's pinned contract (generic, no timing, no header).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pinned contracts (Phase 13 — binding for this phase)
- `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` —
  D-01 (`login_challenges` shape, sessions-stays-pure), D-02 (structural
  anonymity, separate cookie name, no `requireUser()` special-casing),
  D-03 (3 wrong codes / 5 min, budget carry-over, no success-clear between
  steps), D-11/D-12 (`2fa-login|${ip}|${email}` throttle, IP+email keys),
  D-13 (generic lockout copy — includes the scoped replacement of the
  existing `server.js:1235` 429 string in THIS phase), D-14 (in-memory
  throttle state)
- `.planning/phases/13-investigation-invariant-pinning/13-CONTEXT.md` —
  locked ground truth for the challenge mechanism

### Prior phase context
- `.planning/phases/16-totp-core-enrollment/16-CONTEXT.md` — D-50–D-53
  (recovery code shape `xxxx-xxxx`, sha256 hash-only, one-time modal),
  D-57 (the dual-shape code-input precedent this phase's D-64 mirrors),
  TOTP verify + replay-guard behavior on `users.two_fa_last_step`
- `.planning/phases/14-schema-session-ground-truth/14-CONTEXT.md` — D-26
  (route family style), `login_challenges` DDL landed, revoke primitives

### Milestone planning docs
- `.planning/ROADMAP.md` — Phase 17 goal + success criteria (TFA-05,
  401-matrix requirement)
- `.planning/REQUIREMENTS.md` — TFA-05 definition
- `.planning/research/PITFALLS.md` — Pitfall 15 (pending = anonymous,
  matrix test, file route + invite-accept consumers), Pitfall 18 (throttle
  key/constant at the challenge), Pitfall 22 (sameOrigin/length-validate/
  short-lifetime checklist for every new auth endpoint)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `login_challenges` table (`server.js:113-119`): landed dormant in Phase 14 —
  this phase flips behavior onto it; shape is `challenge_token_hash` PK,
  `user_id`, `expires_at`, `attempts`
- Recovery burn primitive from Phase 16: `normalizeRecoveryCode()` +
  `recoveryHash()` (`server.js:49` import; `recovery_codes` table at
  `server.js:150-157`) — reused verbatim for the login burn (D-64/D-72)
- TOTP verify + replay guard: `verifyTotpCode()` and the
  `users.two_fa_last_step` compare-and-store behavior built in Phase 16 —
  the login verify path must exercise the same guard
- `tooMany()` in-memory throttle (`server.js:1163`), `sameOrigin(req)`
  guard, `transaction(fn)` (`server.js:779`) — the D-69 verify route wires
  them in the standard order: sameOrigin → throttle → validate → transact
- `authShell()` + auth state machine (`src/pages/auth.js:24-53`): the
  `s === '2fa'` state (D-60) slots into the existing render switch
- `settings.tfa.*` locale keys + the disable-flow code input
  (`src/pages/settings.js:413-417`) — visual/behavioral reference for the
  dual-shape input (D-64)

### Established Patterns
- Dedicated routes on `/api/auth/*`, `sameOrigin` first, `tooMany` next,
  minimal responses, stable error codes translated client-side via `err.*`
- D-13 override (scoped into this phase): the existing 429 copy at
  `server.js:1235`-area ("Try again in 15 minutes.") is replaced with the
  pinned generic copy when the login flow is reworked
- Server tests never mock SQLite or HTTP; each test file owns its server +
  temp database (`test/tfa-enrollment.test.mjs` is the closest model)
- i18n: every new string catalogued EN+FR before the build-gate scan;
  honest-copy rule for success/banner copy

### Integration Points
- `POST /api/auth/login` (`server.js:1336-1361`): the password-correct path
  branches — 2FA-enabled user → challenge row + challenge cookie +
  `200 {pending2fa, maskedEmail}` (D-68) instead of the session mint; the
  `attempts.delete()` at `server.js:1350` must move to only run when the
  login fully completes (or after verify succeeds) per D-03/Pitfall 18
- New verify route consumes the challenge cookie + `login_challenges` row,
  then mints the session exactly like the current login handler does
  (`sessions` insert + `setSessionCookie`)
- The 401-matrix test holds a challenge cookie and walks API routes,
  `/w/:slug/file/:id`, invite accept (`server.js:1676` area session
  fallback), `/api/auth/me` — the Pitfall 15 named consumers
- Phase 18 consumes: the 401-matrix as part of the Chromium e2e suite and
  the whole login path in both locales

</code_context>

<specifics>
## Specific Ideas

- The user chose the recommended option on all 16 questions: every decision
  above is the established-pattern/least-surface choice. Two security-first
  calls were reaffirmed rather than softened: one generic error code (D-65)
  and D-03's challenge lifecycle without override (D-66).
- The recovery UX mirrors the honest-reporting rule from v1.2: burn → in,
  but the user is told what happened and what to do next (D-73/D-74).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Admin 2FA reset remains
deferred from Phase 16; remember-me remains rejected for this milestone per
PITFALLS.md debt table.)

</deferred>

---

*Phase: 17-Login Second-Factor Flow*
*Context gathered: 2026-10-27*
