# Phase 16: TOTP Core & Enrollment - Context

**Gathered:** 2026-10-27
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can enroll a real TOTP authenticator from the settings page: a
`node:crypto` secret generated server-side and stored AES-256-GCM encrypted
at rest (D-05, `MASTER_KEY`-derived, fail-closed 503 per D-06/D-10), a live
6-digit code verified before 2FA activates (verify-before-enable, no
unverified-secret lockout, TFA-03), a replay guard on the matched time step
(D-04 behavior — the column landed in Phase 14, this phase implements the
guard), a genuinely scannable QR rendered from the vendored
`qrcode-generator@2.0.4` (D-15–17), and mandatory hashed single-use recovery
codes issued in the same flow (D-09, TFA-04). The settings 2FA section
rebuilt here is the surface Phase 17's login second step verifies against.

No login second-factor flow (Phase 17 owns `login_challenges` lifecycle and
the 401 matrix), no e2e/i18n sweep (Phase 18), no admin 2FA reset (deferred —
see Deferred Ideas).

</domain>

<decisions>
## Implementation Decisions

### Enrollment endpoint & state

- **D-46:** The pending (not-yet-verified) TOTP secret lives in an
  **in-memory Map keyed by `user_id` with a short TTL** — the same pattern as
  the attempts Map (`server.js:1163`). The secret never touches disk until
  2FA is enabled; an abandoned enrollment self-clears on TTL expiry; a server
  restart mid-enrollment just means re-scanning the QR (harmless, the user is
  exactly in their pre-enrollment state — TFA-03's abandonment guarantee).
  No persistence, no `two_fa_secret` write until enable succeeds.
- **D-47:** **Route pair on the `/api/auth/*` family:**
  `POST /api/auth/tfa/enroll` (start: verify password, generate secret,
  stash in the pending Map, return payload) and `POST /api/auth/tfa/enable`
  (verify the live 6-digit code against the pending secret, flip
  `two_fa_enabled=1`, write the D-05 encrypted secret, issue recovery codes,
  set the replay-guard baseline). Matches D-26's flat noun-resource style and
  the Phase 15 dedicated-route pattern; `login_challenges` stays
  login-only (D-02).
- **D-48:** The enroll response is `200 { secret, otpauth }` — the **server
  builds the full `otpauth://` URI** (it owns issuer/label/algorithm/digits/
  period per TFA-02's explicit params); the client feeds the URI to
  `src/lib/qr.js` (D-15) and shows the copyable secret. One source of truth
  for URI format.
- **D-49:** Starting enrollment requires **`{ currentPassword }`** (step-up,
  same shape as `PATCH /api/auth/password`, D-34). Rationale: arming 2FA on a
  stolen cookie would be an attack amplifier; password possession proves
  identity at the sensitive gate. Wrong-password attempts there consume
  throttle budget (the password-change pattern, D-41).

### Recovery codes

- **D-50:** **10 codes** issued at enable (TFA-04 band 8–10; headroom for
  burns across multiple device losses).
- **D-51:** Each code is **lowercase hex `xxxx-xxxx`** (8 hex chars,
  dash-grouped for transcription); stored **sha256-hashed whole** (D-09 —
  hash-only, never encrypted, survives `MASTER_KEY` loss). Codes generated
  with `node:crypto.randomBytes`.
- **D-52:** Hashes live in a **dedicated `recovery_codes` table** (one row
  per code, per-user, with a used/burned marker) — the user chose finer
  per-code state over a compact column on `users`. Lands as an additive
  migration in the established `ensureColumn`/guarded-create style (P-B);
  the byte-identical second-boot guarantee of `test/migration.test.mjs`
  applies.
- **D-53:** Plaintext codes are shown **exactly once in a one-time modal at
  enable**, with a copy-all affordance (`settings.tfa.recovery` /
  `recoveryDesc` keys already catalogued). The server keeps only hashes, so
  codes are never retrievable again. Re-enrollment (the D-08 rotation flow)
  issues a fresh set and invalidates the old rows.

### QR & secret display

- **D-54:** The otpauth URI identity is **`otpauth://totp/Gr8r:<email>?secret=…&issuer=Gr8r&algorithm=SHA1&digits=6&period=30`**
  — the user's email is the account label (unique per user, what
  authenticators display under "Gr8r"). TFA-02's explicit params all present.
- **D-55:** Copyable-secret fallback: a **monospace read-only field under
  the QR with a copy button** and a "can't scan? enter this code manually"
  hint. No otpauth deep-link affordance. QR rendering itself follows D-15/16
  verbatim (vendored encoder, inline SVG, EC level M, quiet zone 4, ~132 px).

### Settings UI & disable flow

- **D-56:** The settings 2FA section is **one inline card with states** —
  off: "Add a second step" button starts enrollment in place (password
  prompt → QR + copyable secret + code input); on: status line
  (`settings.tfa.on/onDesc`) + turn-off. No wizard modal, no new routing —
  matches the settings-page pattern (password tab, sessions tab) and the
  inline flow the retained `settings.tfa.*` keys were written for.
- **D-57:** Turning 2FA off requires **current password AND a code** — the
  code input accepts **either a live 6-digit code or a recovery code**
  (consistent with the login second step's dual shape, TFA-05). A
  lost-device user can still disable with a printed recovery code; the
  password gate matches D-49's step-up symmetry.
- **D-58:** When `MASTER_KEY` is missing/undecryptable (D-06 fail-closed
  503), the client shows the **generic `err.*` fallback** — the admin-facing
  503 body naming `MASTER_KEY` is server-log material, never rendered to the
  user (D-06's "never user-facing" clause).
- **D-59:** Disable is **complete teardown in one transaction**: 
  `two_fa_enabled=0`, secret ciphertext cleared, recovery_codes rows
  deleted — a fresh enroll afterwards is indistinguishable from a first one.

### Agent's Discretion

- Exact pending-Map TTL length and per-user overwrite policy when enroll is
  re-clicked (re-generate and replace — one pending secret per user).
- Exact throttle budget constant for wrong-password attempts at enroll /
  disable start (within D-11's band; distinct key prefix, D-11 table).
- Burn-time normalization detail (strip dash / case-fold before sha256) —
  must be identical at enable-time display, login burn (Phase 17), and
  disable verify.
- Exact toast copy within the honest-copy rule (catalogued EN+FR); i18n
  count-pin updates in-commit (Phase 14 convention).
- The D-06 503 body wording (admin-facing, names `MASTER_KEY`).
- Test file placement following existing `test/` conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pinned contracts (Phase 13 — binding for this phase)
- `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` —
  D-04 (replay-guard behavior lands here), D-05/D-06/D-07/D-08 (AES-256-GCM
  envelope `v1:`, fail-closed 503, DEPLOY.md docs, rotation=re-enroll),
  D-09/D-10 (hash-only recovery, single fail-closed path in tests), D-11/D-12
  (throttle budgets: `2fa-verify|${ip}|${email}` and `recovery|…` 5–8/15min),
  D-15/D-16/D-17 (vendored qrcode-generator@2.0.4, SVG params, fixture test)
- `.planning/phases/13-investigation-invariant-pinning/13-CONTEXT.md` —
  locked ground truth; note `src/lib/` does not exist yet (D-15 creates it)

### Prior phase context
- `.planning/phases/14-schema-session-ground-truth/14-CONTEXT.md` — D-26
  (route family), D-31 (dormant `two_fa_*` columns landed),
  `settings.tfa.*` keys kept for reuse; D-27/D-28/D-29 UX precedents
- `.planning/phases/15-password-change-end-to-end/15-CONTEXT.md` — D-34–D-42
  (the step-up + throttle + minimal-response pattern D-47/D-49 copy)

### Milestone planning docs
- `.planning/ROADMAP.md` — Phase 16 goal + success criteria (TFA-01–04)
- `.planning/REQUIREMENTS.md` — TFA-01–04 definitions
- `.planning/STATE.md` — "Key Decisions for Planning" (zero-deps TOTP,
  vendored QR, recovery-codes-coupled-to-enrollment)
- `.planning/research/PITFALLS.md` — Pitfall 15 (pending sign-in anonymity —
  Phase 17 but informs what this phase must NOT create), Pitfall 19
  (hand-written QR trapdoor), Pitfall 21 (no boot backfill)
- `DEPLOY.md` — env block (`server.js:141-158` area); D-05/D-07/D-08 land
  `MASTER_KEY` + rotation docs here

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `users.two_fa_enabled / two_fa_secret / two_fa_last_step` columns +
  `login_challenges` table: landed dormant by 14-01 — this phase flips
  behavior onto them (D-31)
- `ensureColumn` guarded-create pattern (`server.js:134-137`): template for
  the new `recovery_codes` table's additive migration (D-52)
- `hashPassword` / scrypt + `transaction(fn)` (`server.js:189-204`, `:779`):
  the step-up verify (D-49) and enable/disable atomicity (D-57/D-59) reuse
  them directly
- `tooMany()` in-memory map (`server.js:1163`): both the D-11 throttle call
  sites and the D-46 pending-secret Map copy this pattern
- `settings.tfa.*` locale keys retained from 14-04 (en.json:1255–1265,
  fr.json mirror): the inline-card copy for D-56 already catalogued — only
  new strings (error codes, copy hint, modal bits) need adding
- D-15 vendoring target: `qrcode-generator@2.0.4 dist/qrcode.mjs` →
  `src/lib/vendor/qrcode.js` + `src/lib/qr.js` wrapper (directory does not
  exist yet — 13-DECISIONS diagnosis item 10)

### Established Patterns
- Zero runtime dependencies — TOTP via `node:crypto` (~40–60 lines), Base32
  hand-rolled with known-vector tests, QR vendored never installed
- Dedicated routes on `/api/auth/*`, `sameOrigin(req)` guard, minimal
  `200 { ok: true }` responses, stable error codes translated client-side
  via `err.*` (ERR-01)
- Server tests never mock SQLite or HTTP; each test file owns its server +
  temp database; unit tests inject a throwaway `MASTER_KEY` in-process
  (D-10) — production and test exercise the identical fail-closed path
- i18n: every new string catalogued EN+FR before the build-gate scan; count
  pins updated in-commit
- Honest-copy rule (v1.2): success copy states what actually happened

### Integration Points
- `POST /api/auth/tfa/enable` writes `two_fa_secret` ciphertext (D-05/D-07
  `v1:` envelope) and the replay-guard baseline in `two_fa_last_step` — the
  column Phase 17's login verify reads
- `two_fa_last_step` guard: every successful verify (enable here; login and
  settings verify in Phase 17) must compare and store the matched time step
  with `timingSafeEqual` semantics — one guard behavior, all verify paths
- Recovery-code burn acceptance is built here for disable (D-57) and reused
  verbatim by Phase 17's login second step — one normalization, one hash
  lookup shape
- Settings page 2FA section (`src/pages/settings.js` — stub deleted in
  14-04/D-33): rebuilt as the D-56 inline card; API methods follow the
  auth-scoped `api.sessions` pattern (`src/core/api.js:237-243`)
- Phase 18 consumes: the QR fixture test (`test/qr.fixture.test.mjs`,
  D-17), the 503 e2e assertion (D-06), the real-device UAT

</code_context>

<specifics>
## Specific Ideas

- The user chose security-friction over convenience twice: password
  step-up on enroll-start (D-49) and password + code on disable (D-57) —
  symmetric sensitivity gates on both directions of the 2FA lifecycle.
- The user chose dedicated fine-grained state once: `recovery_codes` as its
  own table (D-52) over compact columns.
- Established-pattern bias held for everything else: in-memory pending Map,
  route pair on the `/api/auth` family, server-built otpauth URI, inline
  settings card, one-time modal for codes.

</specifics>

<deferred>
## Deferred Ideas

- **Admin reset of a user's 2FA** — raised during the disable-flow
  discussion ("an admin can reset 2FA for a user"). New capability: no admin
  role or admin surface exists anywhere in the codebase today. Belongs in
  its own phase after the v1.3 auth surface settles; note for the roadmap
  backlog.

</deferred>

---

*Phase: 16-TOTP Core & Enrollment*
*Context gathered: 2026-10-27*
