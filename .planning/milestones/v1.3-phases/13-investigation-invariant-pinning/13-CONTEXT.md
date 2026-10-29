# Phase 13: Investigation & Invariant Pinning - Context

**Gathered:** 2026-10-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Decision groundwork only — no feature code ships in this phase. The phase (1) confirms the
stub-auth root cause against the live code (already verified — see `<code_context>`), and
(2) pins, in writing, the contracts that constrain Phases 14–18: the pending-2FA session
mechanism, the TOTP secret encryption-at-rest scheme, the throttle constants, the QR
vendoring decision, and the doc-field removal plan landing in Phase 14.

Success criteria from ROADMAP.md items 1–5 are all satisfied by the diagnosis and the
decisions below; the deliverable of this phase is these pinned contracts.

</domain>

<decisions>
## Implementation Decisions

### Pending-2FA login mechanism

- **D-01:** Pending second-factor state lives in a dedicated `login_challenges` table
  (`challenge_token_hash` PK, `user_id`, `expires_at`, `attempts`), created with the existing
  guarded-create pattern. The `sessions` table stays pure — signed-in-or-nothing.
  — **Reversibility:** one-way — the table shape and the "sessions table never carries
  pending rows" contract are consumed by Phase 14 migration design (AUTH-02) and the
  Phase 17 401-matrix test; changing it after those exist means re-doing the migration
  test and the security matrix.
- **D-02:** The "pending = anonymous" invariant is enforced **structurally**, not by
  deny-lists: the challenge lives under a separate cookie name, `requireUser()`
  (`server.js:1134`) keeps reading only the session cookie, and a pending sign-in matches
  zero rows in `sessions` — so every endpoint family answers 401 without any special-casing.
  Proven by the mandatory 401-matrix e2e across every endpoint family (Phase 17, Pitfall 15).
  No `if (challenge) deny` checks inside `requireUser()`.
- **D-03:** Challenge expiry/attempt rules: **3 wrong codes or 5 minutes, whichever first.**
  The `tooMany` throttle budget carries over from the password step — a fresh challenge
  never resets the attacker's clock.
- **D-04:** TOTP replay guard (last-used time-step counter) is a column on `users`, in the
  same migration as the other 2FA columns — it protects both the login verify path and the
  settings-page verify path (a challenge-scoped counter would not).

### TOTP secret encryption-at-rest

- **D-05:** **Encrypt.** `users.two_fa_secret` stores AES-256-GCM ciphertext under a key
  derived from a host-provided `MASTER_KEY`. Stealing `/data/projects.db` alone must not yield
  live TOTP secrets. — **Reversibility:** one-way — once secrets are stored encrypted and
  enrollment is live, switching to plaintext or a different scheme is a data migration on
  every enrolled user plus a DEPLOY.md contract change.
- **D-06:** Fail-closed on missing/undecryptable key: 2FA endpoints answer **503 with an
  admin-facing message naming the missing variable**; enrollment is blocked so no
  half-encrypted rows appear. The rest of the app boots and runs normally. No
  refuse-to-boot, no plaintext fallback. Users who already enrolled can still log in via
  recovery codes (which are hashed, not encrypted).
- **D-07:** Key format: 32-byte hex (`openssl rand -hex 32`), documented in DEPLOY.md
  alongside the existing env block (`DEPLOY.md:142-157`). Ciphertext carries a `v1:` prefix
  so the algorithm/layout can evolve without a schema change.
- **D-08:** Rotation policy: **simple — rotating `MASTER_KEY` means users with 2FA re-enroll**
  (recovery codes survive rotation because they are hash-only; users log in via a recovery
  code and re-enroll). No `MASTER_KEY_OLD` re-encrypt machinery. DEPLOY.md documents the
  consequence.
- **D-09:** Recovery codes stay **hash-only** (`sha256` per code) — never encrypted. A
  leaked hash cannot generate codes, and the recovery path must survive `MASTER_KEY` loss;
  encrypting would couple the one flow that must survive key loss to the key itself.
- **D-10:** Dev/test/seed use the **same fail-closed rule** as production: absent key → 2FA
  endpoints 503; unit tests set a throwaway key in-process; Phase 18 e2e starts the server
  with a fixed dev key. No ephemeral-key dev mode, no second code path for the key-absent
  case.

### Throttle & lockout constants

- **D-11:** Attempt budgets (existing in-memory `tooMany()`, `server.js:1163`): password
  step **10 tries / 15 min** (current default); each code endpoint (login 2FA verify,
  settings verify, recovery burn) **5–8 tries / 15 min** with a separate key per endpoint.
  Exact integers are fixed at implementation within those documented bounds — no budget
  reset between the password and 2FA steps of a login.
- **D-12:** Throttle key is **IP + email** combined, per endpoint. IP alone creates
  shared-bucket lockouts on CGNAT; email alone lets a botnet burn a victim's budget.
- **D-13:** Lockout UX: **generic "too many attempts" message, no timing information, no
  `Retry-After` header** — do not disclose window expiry to attackers. (This is a conscious
  override of the default "show wait time" recommendation: attack-surface confirmation
  beats convenience here.)
- **D-14:** Throttle state stays **in-memory** (per-process map). A restart clearing
  counters is an accepted trade-off for a single-process self-hosted deployment; no
  write-per-attempt SQLite table.

### QR provisioning

- **D-15:** Vendor **`qrcode-generator@2.0.4` `dist/qrcode.mjs`** (≈51 KB) into
  `src/lib/vendor/qrcode.js` with a header comment pinning version + source URL. Verified
  live during this discussion: MIT license header intact (© Kazuhiko Arase), clean ESM
  (`export default qrcode` + named `stringToBytes`), Vite-compatible. `src/lib/qr.js` wraps
  it: boolean matrix → inline SVG, replacing the fake pseudo-random grid at
  `src/pages/settings.js:410`. Never hand-written.
- **D-16:** Rendering parameters: error correction level **M**, **auto** typeNumber,
  **quiet zone 4** modules in the SVG — scans reliably at the ~132 px display size the
  settings page already uses.
- **D-17:** QR verification: a `qr.js` unit fixture test (known `otpauth://` URI → expected
  module matrix) catches encoding drift between Phase 16 and Phase 18; the Phase 18
  real-device UAT (Google Authenticator + one other app) remains the definitive check.

### Agent's Discretion

- Exact throttle integers within the ranges of D-11; the 401-matrix endpoint enumeration
  strategy; unit-test file placement following existing `test/` conventions; the exact
  admin-facing 503 copy for D-06.
- The written diagnosis deliverable (ROADMAP success criterion 1) is already satisfied by
  the verified code reads recorded in `<code_context>` — the researcher/planner may cite
  them rather than re-deriving them.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone research (root cause + pitfalls)
- `.planning/research/SUMMARY.md` — root-cause confirmation, stack recommendation,
  phase-by-phase architecture approach; HIGH confidence, all claims code-read-backed
- `.planning/research/PITFALLS.md` — the full pitfall catalog; Pitfall 15 (pending-2FA
  bypass) and Pitfall 9 (revoke self-DoS) are load-bearing for this phase's invariants
- `.planning/research/ARCHITECTURE.md` — §4 build order backing the roadmap phase split

### Milestone planning docs
- `.planning/ROADMAP.md` — Phase 13 success criteria (items 1–5) and Phase 14–18 goals
- `.planning/REQUIREMENTS.md` — SESS-01–03, PASS-01–03, TFA-01–05, AUTH-01–03 definitions
  and the v1.3 deferred/out-of-scope lists
- `.planning/STATE.md` — "Key Decisions for Planning" section (zero-deps stack, headline
  invariant, revocation keep-current SQL, migration guarantees)

### Deploy documentation
- `DEPLOY.md` — env var block at lines 142–157 where `MASTER_KEY` will be documented;
  rotation consequence (D-08) must land here in the phase that enables encryption

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sessions` table (`server.js:95-101`): opaque token_hash PK, user FK, created/expires —
  revocation primitive (keep-current via `token_hash != sha256(current cookie)`) is pure
  SQL on it; Phase 14 adds `label`/`last_seen_at` via `ensureColumn`
- `ensureColumn(conn, table, name, def)` (`server.js:134-137`): the established additive
  migration pattern; `login_challenges` uses the same guarded-create style
- `tooMany(key, max=10, windowMs=15min)` (`server.js:1163`): the throttle primitive all
  D-11 constants plug into; in-memory `attempts` map with self-cleaning
- `requireUser()` (`server.js:1134`) and the `/api/auth/*` route family
  (`server.js:1225-1330`): the identity surface D-02 must not change
- `test/migration.test.mjs` (207 lines): second-boot byte-identical no-op test at line 188
  — the template AUTH-02 extends

### Established Patterns
- Auth state is workspace-document JSON (`emptyDoc()` `server.js:759`, fake fields at
  774-775) — the root cause; Phases 14+ move auth state to per-user rows
- Zero runtime dependencies (PROJECT.md core decisions) — TOTP from `node:crypto`, Base32
  hand-rolled with known-vector tests, QR vendored as a single ESM file (D-15)
- Client mutates doc locally in `src/actions/actions.js` (`revokeSession` filters an array
  at 2371, `verify2fa` flips `D().tfa` at 2409) — stubs to rewire in later phases
- Honest-copy rule (v1.2): success/error toasts state what actually happened

### Integration Points
- `POST /api/auth/login` (`server.js:1225`): the login route branches on
  `two_fa_enabled` in Phase 17 — edited once, coherently
- `src/pages/settings.js:378-421`: settings UI for password/sessions/2FA exists with all
  strings catalogued (EN+FR); work is rewiring, not rebuilding
- `DEPLOY.md` env block (lines 142-157): `MASTER_KEY` documentation lands here
- Fake QR grid at `src/pages/settings.js:410` and hardcoded recovery codes at line 408:
  replaced by `src/lib/qr.js` + real enrollment flow

</code_context>

<specifics>
## Specific Ideas

- The user explicitly chose the **generic throttle message with no timing disclosure**
  (D-13) over the standard "show wait time" pattern — respect this in every error-copy
  plan; do not "improve" it to a countdown.
- The user asked directly whether `MASTER_KEY` rotation forces re-enrollment for everyone —
  the answer (yes, via recovery-code login, documented in DEPLOY.md) is the pinned policy
  (D-08). Transparency about this trade-off mattered to them.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-Investigation & Invariant Pinning*
*Context gathered: 2026-10-26*
