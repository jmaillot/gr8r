# Phase 13: Investigation & Invariant Pinning — Pinned Decisions

**Date:** 2026-10-26
**Scope:** This document is the canonical D-NN citation target for Phases 14–18: every later
plan and test cites `D-NN` by ID instead of re-deriving a decision. It supersedes nothing —
`13-CONTEXT.md` `<decisions>` remains the locked ground truth; the contracts below cite those
IDs verbatim in substance. The decisions that bind this phase are D-01…D-17; implementation
discretion items (exact throttle integers inside D-11's band, the exact admin-facing 503 copy
for D-06, test file placement) stay with the implementing phases — this doc pins the
contracts, not the integers.

## Verified diagnosis

Every claim below was re-verified by direct read the session of 2026-10-26 (carried verbatim
from `13-RESEARCH.md` §Code Examples evidence inventory — nothing re-derived). This is the
written diagnosis satisfying ROADMAP Phase 13 success criterion 1.

**1. `sessions` table — the revocation primitive's ground truth** [VERIFIED: server.js:95-100]:
```sql
create table if not exists sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at integer not null,
  expires_at integer not null
);
```
(create index `sessions_expiry on sessions(expires_at)` at :101.)

**2. The stub root cause — fake fields in the shared doc** [VERIFIED: server.js:774-775]:
```js
        sessions: [],
        tfa: false,
```
Mirrored in seed data [VERIFIED: src/data/seed.js:509-514]:
```js
    sessions: [
      { id: 'se1', dev: 'MacBook Pro · Chrome', loc: 'San Francisco, US', at: 'Active now', cur: true },
      { id: 'se2', dev: 'iPhone 15 · Gr8r app', loc: 'San Francisco, US', at: '2 hours ago' },
      { id: 'se3', dev: 'Windows · Edge', loc: 'Oakland, US', at: 'Sep 12' },
    ],
    tfa: false,
```

**3. Client-side-only mutations (no backend exists)** [VERIFIED:
src/actions/actions.js:2371-2375 and 2408-2411]:
```js
A.revokeSession = el => {
  mutate(() => {
    D().sessions = D().sessions.filter(s => s.id !== el.dataset.id);
  });
  ...
      mutate(() => {
        D().tfa = true;
        S.ui.tfaSetup = false;
      });
```
`savePassword` (2351-2370) is a client-side validation + `loadingBtn` fake delay + toast —
no API call.

**4. Fake QR renderer** [VERIFIED: src/pages/settings.js:410-417]: an 11×11 grid of `<i>`
elements where the "on" pattern is `(i * 7919) % 13 < 6` (pseudo-random) with hardcoded
finder-square coordinates — not a QR code. Hardcoded recovery codes at :408:
`['7KQ2-M8PX', 'D4TN-9WRE', 'HV3C-QZ6L', 'P2YB-J7SK', 'R9FG-4NUD', 'X6MA-T3HE']`.

**5. The complete `/api/auth/*` surface** [VERIFIED: server.js:1225-1315]:
`POST /api/auth/login` (:1225, sameOrigin → readJson → `tooMany(`${clientIp(req)}|${email}`)`
→ scrypt verify vs `DUMMY_HASH` → sessions insert → `setSessionCookie`),
`POST /api/auth/logout` (:1255), `GET /api/auth/me` (:1262, 200-with-null probe),
`PATCH /api/auth/me` (:1270, locale-only mass-assignment guard), `POST /api/auth/signup`
(:1283). **No sessions-list, revoke, password-change, or 2FA endpoints exist.**

**6. `requireUser` — the identity path D-02 must not change** [VERIFIED:
server.js:1134-1141]:
```js
function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    fail(res, 401, 'signInRequired', 'Sign in to continue');
    return null;
  }
  return user;
}
```
`currentUser` joins `sessions`→`users` on `token_hash = sha256(cookie)` with
`expires_at > now()` ([VERIFIED: server.js:1125-1131]) — per-request DB derivation, no cache.

**7. The throttle primitive** [VERIFIED: server.js:1163-1173]:
```js
function tooMany(key, max = 10, windowMs = 15 * 60 * 1000) {
  const t = now();
  const row = attempts.get(key);
  if (!row || t > row.reset) {
    attempts.set(key, { n: 1, reset: t + windowMs });
    if (attempts.size > 5000) for (const [k, v] of attempts) if (t > v.reset) attempts.delete(k);
    return false;
  }
  row.n += 1;
  return row.n > max;
}
```

**8. Migration machinery + no-op guarantee template** [VERIFIED: server.js:134-137;
test/migration.test.mjs:188-196]:
```js
test('a second boot is a no-op and both accounts keep access', async () => {
  const firstBoot = snapshot();
  await server.stop();
  ...
  server = await startServer({ dataDir });
  const secondBoot = snapshot();
  assert.deepEqual(secondBoot, firstBoot, 'no slug/doc/member_id/revision drift');
  assert.equal(secondBoot.backups.length, 1, 'no second backup');
```

**9. DEPLOY.md env block — `MASTER_KEY` documentation lands beside this**
[VERIFIED: DEPLOY.md:141-158] (verbatim keys): `GR8R_HOST`, `APP_URL`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_NAME`, `WORKSPACE_NAME`, `WORKSPACE_SLUG`, `PUID`, `PGID`,
`ALLOW_SIGNUP`, `SEED_DATA`, `SESSION_DAYS`, `SECURE_COOKIE`, `TRUST_PROXY`,
`MAX_BODY_BYTES`, `MAX_UPLOAD_MB`.

**10. `src/lib/` does not exist** [VERIFIED: `ls src/lib` → absent] — D-15's
`src/lib/vendor/qrcode.js` and `src/lib/qr.js` create a new directory in Phase 16.

## Area 1: Pending-2FA login mechanism

- **D-01:** Pending second-factor state lives in a dedicated `login_challenges` table
  (`challenge_token_hash` PK, `user_id`, `expires_at`, `attempts`), created with the existing
  guarded-create pattern ([VERIFIED: server.js:134-137]). The `sessions` table stays pure —
  signed-in-or-nothing; it never carries pending rows, so the revocation primitive
  (`token_hash != sha256(current cookie)`) and every existing session query remain untouched.
  — **Reversibility:** one-way — the table shape and the "sessions table never carries
  pending rows" contract are consumed by Phase 14 migration design (AUTH-02) and the Phase 17
  401-matrix test; changing it after those exist means re-doing the migration test and the
  security matrix.
  **Consumed by:** Phase 14 (AUTH-02 — writes the real `login_challenges` DDL in the additive
  migration) and Phase 17 (login second-factor flow + 401-matrix e2e proof).
- **D-02:** The "pending = anonymous" invariant is enforced **structurally**, not by
  deny-lists: the challenge lives under a separate cookie name, `requireUser()`
  (`server.js:1134`) keeps reading only the session cookie, and a pending sign-in matches
  zero rows in `sessions` — so every endpoint family answers 401 without any special-casing.
  Proven by the mandatory 401-matrix e2e across every endpoint family (Phase 17, Pitfall 15).
  No `if (challenge) deny` checks inside `requireUser()`.
  **Consumed by:** Phase 17 (401-matrix e2e — the proving test — plus the login flow that
  must leave the identity path untouched).
- **D-03:** Challenge expiry/attempt rules: **3 wrong codes or 5 minutes, whichever first.**
  The `tooMany` throttle budget carries over from the password step — a fresh challenge never
  resets the attacker's clock (one logical login = one budget; the `attempts.delete()` at
  `server.js:1241` is a success-clear and must NOT run between the password and 2FA steps,
  Pitfall 18).
  **Consumed by:** Phase 17 (challenge lifecycle and budget carry-over in the login flow).
- **D-04:** TOTP replay guard (last-used time-step counter) is a column on `users`, in the
  same migration as the other 2FA columns — it protects both the login verify path and the
  settings-page verify path (a challenge-scoped counter would not).
  **Consumed by:** Phase 14 adds the replay-guard column in the AUTH-02 additive migration,
  in the same migration as the other 2FA columns, together with its
  byte-identical second-boot test coverage; Phase 16 implements the guard behavior
  itself — reading and updating the column in the login verify path and the settings-page
  verify path.

## Area 2: TOTP secret encryption-at-rest

- **D-05:** **Encrypt.** `users.two_fa_secret` stores AES-256-GCM ciphertext under a key
  derived from a host-provided `MASTER_KEY`. Stealing `/data/gr8r.db` alone must not yield
  live TOTP secrets.
  — **Reversibility:** one-way — once secrets are stored encrypted and enrollment is live,
  switching to plaintext or a different scheme is a data migration on every enrolled user
  plus a DEPLOY.md contract change.
  **Consumed by:** Phase 16 (crypto helpers + `users.two_fa_secret` ciphertext layout;
  DEPLOY.md key documentation lands in the same phase).
- **D-06:** Fail-closed on missing/undecryptable key: 2FA endpoints answer **503 with an
  admin-facing message naming the missing variable** (`MASTER_KEY`); enrollment is blocked so
  no half-encrypted rows appear. The rest of the app boots and runs normally. No
  refuse-to-boot, no plaintext fallback. Users who already enrolled (or enrolled under a key
  later lost) can still log in via recovery codes — which are hashed, not encrypted (D-09).
  The exact 503 copy wording is the implementing phase's discretion; the contract is:
  admin-facing, names `MASTER_KEY`, never user-facing, never discloses anything about the
  key's value.
  **Consumed by:** Phase 16 (fail-closed guard on every 2FA endpoint) and Phase 18 (e2e
  asserts the 503 behavior).
- **D-07:** Key format: 32-byte hex (`openssl rand -hex 32`; fallback
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`),
  documented in DEPLOY.md alongside the existing env block (`DEPLOY.md:141-158` — the
  `GR8R_HOST`…`MAX_UPLOAD_MB` block verified in the diagnosis, item 9). Ciphertext carries a
  `v1:` prefix so the algorithm/layout can evolve without a schema change — the envelope
  layout per RESEARCH Pattern 3 is `v1:` + hex(iv) + hex(ciphertext) + hex(auth-tag), derived
  once from the 32-byte hex key to a 32-byte AES-256 key; the exact serialization is
  implementation discretion, the prefixed-layout contract is what is pinned.
  **Consumed by:** Phase 16 (envelope implementation) and Phase 16's DEPLOY.md edit
  (documented at `DEPLOY.md:141-158` — D-05/D-07/D-08 all land there).
- **D-08:** Rotation policy: **simple — rotating `MASTER_KEY` means users with 2FA re-enroll**
  (recovery codes survive rotation because they are hash-only; users log in via a recovery
  code and re-enroll). No `MASTER_KEY_OLD` re-encrypt machinery. DEPLOY.md documents the
  consequence.
  — **Reversibility:** one-way — the no-machinery rotation contract is consumed by DEPLOY.md's
  operations story; adding re-encrypt machinery later would be new code AND a changed ops
  contract, so it must be decided (as it now is) before enrollment ships.
  **Consumed by:** Phase 16 (DEPLOY.md rotation-consequence documentation).
- **D-09:** Recovery codes stay **hash-only** (`sha256` per code) — never encrypted. A
  leaked hash cannot generate codes, and the recovery path must survive `MASTER_KEY` loss;
  encrypting would couple the one flow that must survive key loss to the key itself.
  **Consumed by:** Phase 16 (recovery-code generation/storage alongside TOTP enrollment).
- **D-10:** Dev/test/seed use the **same fail-closed rule** as production: absent key → 2FA
  endpoints 503; unit tests set a throwaway key in-process; Phase 18 e2e starts the server
  with a fixed dev key. No ephemeral-key dev mode, no second code path for the key-absent
  case — production and test must exercise the identical code path.
  **Consumed by:** Phase 16 (single fail-closed path; test harness key injection) and
  Phase 18 (e2e server bootstrap with the fixed dev key).

## Area 3: Throttle & lockout constants

- **D-11:** Attempt budgets (existing in-memory `tooMany()`, [VERIFIED: server.js:1163-1173])
  per endpoint — all on the 15-minute window:

  | Endpoint | Budget | Key (see D-12) |
  |----------|--------|----------------|
  | Password step (login, and later password-change) | **10 tries / 15 min** (current default) | `${clientIp(req)}|${email}` — existing call-site precedent [VERIFIED: server.js:1235] |
  | Login 2FA verify | **5–8 tries / 15 min** | `2fa-login|${ip}|${email}` — distinct prefix |
  | Settings 2FA verify | **5–8 tries / 15 min** | `2fa-verify|${ip}|${email}` — distinct prefix |
  | Recovery burn | **5–8 tries / 15 min** | `recovery|${ip}|${email}` — distinct prefix |

  (Per-endpoint key convention precedent: `signup|${ip}` [VERIFIED: server.js:1288].)
  Exact integers are fixed at implementation within the documented 5–8 band — the agent's
  Discretion, decided in the Phase 16/17 plans. **No budget reset between the password and
  2FA steps of a login**: one logical login = one budget. The `attempts.delete()` success
  clear at `server.js:1241` must not run between those steps (Pitfall 18).
  **Consumed by:** Phase 15 (password-change endpoint throttle), Phases 16/17 (code-endpoint
  throttles and the login budget carry-over).
- **D-12:** Throttle key is **IP + email** combined, per endpoint. IP alone creates
  shared-bucket lockouts on CGNAT; email alone lets a botnet burn a victim's budget.
  **Consumed by:** Phases 15–17 (every new throttle call site keys `${ip}|${email}`).
- **D-13:** Lockout UX: **generic "too many attempts" message, no timing information, no
  `Retry-After` header** — do not disclose window expiry to attackers. This is a conscious
  override of the "show wait time" default recommendation: attack-surface confirmation beats
  convenience. **Explicitly, this overrides the existing 429 string at `server.js:1235`**
  ("Try again in 15 minutes.") — Phase 16/17 must NOT copy that string to new endpoints; the
  pinned replacement copy is generic "too many attempts" with no countdown, no window, no
  header.
  **Scope resolution:** the override applies to the existing string itself, not only to new
  endpoints — when Phase 17 touches the login flow, the existing `server.js:1235` 429 copy
  ("Try again in 15 minutes.") is also replaced with the pinned generic copy; the password
  and 2FA steps share one budget (per D-03/D-11: one logical login = one budget) — they
  must disclose identically — or not at all.
  **Consumed by:** Phases 15–17 (every throttle response's failure copy — including the
  replacement of the pre-existing `server.js:1235` 429 copy on the login password step,
  landing when Phase 17 reworks the login flow).
- **D-14:** Throttle state stays **in-memory** (per-process `attempts` map). A restart
  clearing counters is an accepted trade-off for a single-process self-hosted deployment; no
  write-per-attempt SQLite table on the hottest security path.
  **Consumed by:** Phases 15–17 (all throttle state uses the existing in-memory primitive;
  no persistence built).

## Area 4: QR provisioning

- **D-15:** Vendor **`qrcode-generator@2.0.4` `dist/qrcode.mjs`** (≈51 KB, MIT, © Kazuhiko
  Arase) into `src/lib/vendor/qrcode.js` with a header comment pinning version + source URL.
  Verified live during the phase discussion: MIT license header intact, clean ESM
  (`export default qrcode` + named `stringToBytes`), Vite-compatible. `src/lib/qr.js` wraps
  it: otpauth URI → boolean matrix → inline SVG, replacing the fake pseudo-random grid at
  `src/pages/settings.js:410`. Never hand-written (QR encoding — Reed-Solomon, masking,
  version selection — is the documented trapdoor, Pitfall 19). The vendored file is never
  `npm install`ed: zero runtime dependencies held (PROJECT.md core decision).
  — **Consumed by:** Phase 16 (vendor pin — its first task re-verifies the file header
  against the pinned source URL; the `src/lib/vendor/qrcode.js` pin is named here for that
  re-verification task, plus the `src/lib/qr.js` wrapper).
- **D-16:** Rendering parameters: error correction level **M**, **auto** typeNumber,
  **quiet zone 4** modules in the SVG — scans reliably at the ~132 px display size the
  settings page already uses.
  **Consumed by:** Phase 16 (`src/lib/qr.js` SVG renderer parameters).
- **D-17:** QR verification: a `qr.js` unit fixture test (known `otpauth://` URI → expected
  module matrix) catches encoding drift between Phase 16 and Phase 18; the Phase 18
  real-device UAT (Google Authenticator + one other app) remains the definitive check.
  **Consumed by:** Phase 16 (fixture test `test/qr.fixture.test.mjs`) and Phase 18
  (real-device UAT as the definitive gate).

## Doc-field removal scope (lands in Phase 14)

The stub doc fields whose diagnosis is recorded above are removed **in Phase 14**, as part of
AUTH-02's schema work — not in this phase, not later:

- **Removal targets:** the fake fields in `emptyDoc()` — `sessions: []` and `tfa: false` —
  [VERIFIED: server.js:774-775], and the seed mirror [VERIFIED: src/data/seed.js:509-514].
- **Guarantee:** removal lands WITH the additive migration (AUTH-02, same guarded-create /
  `ensureColumn` style — [VERIFIED: server.js:134-137]); the byte-identical second-boot
  guarantee is proven by the extended `test/migration.test.mjs` (template at :188 — the
  no-op snapshot test cited in diagnosis item 8).
- **No backfill at boot:** the boot migration adds columns/tables only — existing users get
  `tfa_enabled = 0` by absence, nothing is generated per-user at boot (Pitfall 21).
- **Drift guard:** `tfa` / `sessions` JSON keys must not survive past Phase 14 — the
  byte-identical second-boot test cannot cover fields that were never removed.

## Prohibitions

Binding anti-patterns; each cites its owning decision ID:

1. **No deny-list pending check inside the identity path** (D-02) — no `if (challenge)`
   special-casing inside `requireUser()`; enforcement is structural (separate cookie name,
   zero `sessions` rows for a pending sign-in).
2. **No timing disclosure in lockout copy** (D-13) — no wait-time text, no `Retry-After`
   header, no countdown; generic "too many attempts" only.
3. **No dev-mode ephemeral key and no second code path for the key-absent case** (D-06/D-10)
   — one fail-closed 503 rule everywhere; no plaintext fallback.
4. **No encrypted recovery codes** (D-09) — hash-only (`sha256` per code), so the recovery
   path survives `MASTER_KEY` loss.
5. **No key-rotation re-encrypt machinery** (D-08) — rotating `MASTER_KEY` means users with
   2FA re-enroll via recovery codes; no `MASTER_KEY_OLD` code.

## Downstream consumer map

| Decision area / scope | Decisions | Consuming phase(s) |
|-----------------------|-----------|--------------------|
| Pending-2FA login mechanism | D-01…D-04 | Phase 14 (AUTH-02 migration: `login_challenges` DDL, replay-guard column with byte-identical second-boot test coverage), Phase 16 (replay-guard behavior in the login and settings-page verify paths), Phase 17 (login flow, challenge lifecycle, 401-matrix e2e) |
| TOTP secret encryption-at-rest | D-05…D-10 | Phase 16 (crypto helpers, fail-closed guards, DEPLOY.md env + rotation docs), Phase 18 (e2e 503 assertions, fixed dev key) |
| Throttle & lockout constants | D-11…D-14 | Phase 15 (password-change endpoint), Phases 16/17 (code endpoints, budget carry-over, generic lockout copy) |
| QR provisioning | D-15…D-17 | Phase 16 (vendor pin + re-verification task, `src/lib/qr.js`, fixture test), Phase 18 (real-device UAT) |
| Doc-field removal scope | (diagnosis + removal section) | Phase 14 (removal with AUTH-02 migration; byte-identical second-boot test extension) |

