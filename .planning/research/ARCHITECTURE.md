# Architecture Patterns — v1.3 Auth Hardening Integration

**Domain:** Self-hosted PM workspace (Node 24 built-ins, `node:sqlite`, zero runtime deps)
**Researched:** 2026-10-26 (from real code: `server.js` 2 207 lines, `src/`, `test/`, `src/locales/`)
**Overall confidence:** HIGH — every claim below cites a file/line read today.

---

## 1. Root Cause of the Three Stubs (the premise the investigation phase must confirm)

The three features are not "half-implemented" — **they have no backend at all.** All three are
driven by decorative fields inside the workspace *document* JSON, and the settings actions
mutate that in-memory document only, never calling any server endpoint.

| Evidence | Location |
|----------|----------|
| `sessions: []` and `tfa: false` are **doc fields** of the workspace JSON | `server.js:774-775` (`emptyDoc`) |
| Seed ships 3 fake session rows as doc data | `src/data/seed.js:509-513` |
| `savePassword`: validates locally, then `loadingBtn(... 800, ...)` fake delay → toast. **No `api.*` call** | `src/actions/actions.js:2351-2370` |
| `revokeSession` / `revokeAll`: only `D().sessions = D().sessions.filter(...)` — client-local doc mutation | `src/actions/actions.js:2371-2376, 2377-2390` |
| `verify2fa`: sets `D().tfa = true` locally; `disable2fa` symmetric | `src/actions/actions.js:2400-2427` |
| QR is a fake 11×11 grid: `(i * 7919) % 13 < 6` pseudo-random pixels | `src/pages/settings.js:410-418` |
| Recovery codes are 6 hardcoded strings (`7KQ2-M8PX`…) | `src/pages/settings.js:408` |
| `PATCH /api/auth/me` is the **only** auth PATCH; reads only `body.locale` | `server.js:1270-1281` |
| No `POST /api/auth/password*`, `GET/DELETE /api/auth/sessions*`, `POST /api/auth/2fa*` exists anywhere | grep of `server.js` routes (§3) |

This explains the milestone symptom precisely: the "disconnect other sessions" button is
`disabled` when `d.sessions.length <= 1` (fake seed shows 3 rows so the button is enabled, but
revoking it just filters a local array and does nothing server-side), and the QR is illegible
because it is drawn from a hash function, not a real secret.

Additional finding the investigation phase must decide on: the fake `sessions`/`tfa` doc fields
should be **removed from `emptyDoc()` (`server.js:774-775`), `seed.js`, and `fromServer/merge`
paths**, because `normalizeDoc`/`mergeClientDoc` will otherwise keep re-materializing them.

---

## 2. Current Auth Data Layer (what exists today)

### 2.1 Tables (`server.js:84-132`)

```sql
create table if not exists users (
  id text primary key,
  email text not null unique collate nocase,
  name text not null,
  password_hash text not null,     -- scrypt: "scrypt$16384$8$1$<salt b64>$<key b64>" (:166-170)
  member_id text,
  created_at integer not null,
  last_login_at integer,
  locale text                      -- added by v1.2 additive migration (:153)
);
create table if not exists sessions (
  token_hash text primary key,     -- sha256(cookie token) — the token itself is never stored
  user_id    text not null references users(id) on delete cascade,
  created_at integer not null,
  expires_at integer not null
);
create index if not exists sessions_expiry on sessions(expires_at);
```

Key facts:
- Sessions are **real DB rows already** (opaque token → `token_hash = sha256(token)`,
  `server.js:1122-1132` `currentUser()`). Listing + revocation is therefore a *query shape*
  problem, not a redesign: the table already supports `where user_id = ?`.
- Sessions carry **no device/label/last-seen column** today — the fake UI data (`dev`, `loc`,
  `at`, `cur`) lives only in the doc.
- Whole-document mutation runs inside `transaction()` (`begin immediate`, rollback on throw —
  `server.js:747-757`); new multi-statement endpoints (password change) must reuse it.
- Expired sessions are purged hourly (`server.js:2173-2174`).
- Login is same-origin-guarded, rate-limited per `ip|email` (429, 15 min window,
  `server.js:1225-1253`), uses `DUMMY_HASH` to equalize timing on unknown accounts
  (`server.js:190`). The 2FA challenge must flow through this same throttle.
- `userPayload()` (`server.js:253-260`) exposes `id, email, name, locale, workspaces` — no
  auth-zone fields. Whatever we add (2FA enabled flag, etc.) extends here.

### 2.2 Migration machinery (elder sibling, proven)

- **`ensureColumn()` (`server.js:134-137`)** — additive, idempotent column migration used for
  `workspaces.slug/color`, `memberships.member_id`, `invites.workspace_id`, `users.locale`
  (`server.js:149-153`). This is the pattern to extend.
- **`migrateTenancy()` (`server.js:853-866`)** — one-shot, backup-first migration:
  `vacuum into 'gr8r-premultitenant-<stamp>.db'` before the first write.
- **`test/migration.test.mjs`** proves: backup exists, data preserved, and **a second boot is a
  byte-identical no-op** (anchored on `pragma table_info` snapshots captured pre-boot).
- The no-op guarantee holds because `SCHEMA` is all `create table/index if not exists` and
  `ensureColumn` checks `pragma table_info` before `alter table`. Any new column added via
  `ensureColumn` automatically inherits this; any new **table** must use a guarded create.

---

## 3. Recommended Integration Design

### 3.1 Schema changes (small, additive, no-op-safe)

```js
ensureColumn(db, 'users',   'two_fa_secret',   'text');     // base32 (RFC 6238), null = never set up
ensureColumn(db, 'users',   'two_fa_enabled',  'integer');  // 0 until the 6-digit code is verified
ensureColumn(db, 'users',   'recovery_codes',  'text');     // JSON array of sha256 hashes, null = none
ensureColumn(db, 'sessions','label',           'text');     // device string from User-Agent at login
ensureColumn(db, 'sessions','last_seen_at',    'integer');
```
Precedent: `users.locale` (`server.js:153`). No `migrateTenancy()`-style backup needed for
`ensureColumn` defaults (v1.2 set that precedent: nullable column + server never writes at boot
— PROJECT.md Decision 4). **No new tables required** — recovery codes go in a `users` column
(hashes only), and the 2FA login challenge is handled by a short-TTL pending session (§3.4).

Deliberate decision to encode in the plan: `two_fa_enabled` is separate from a non-null
`two_fa_secret`, so "secret generated but not yet confirmed" is distinguishable from "on"
(needed for setup-then-abandon flows) — and the second boot changes nothing for DBs where the
columns already exist.

### 3.2 Session surface (new endpoints, modified bootstrap)

**New components** — route handlers in `server.js` (place beside the `/api/auth/*` block,
`server.js:1225-1320`) and client methods in `src/core/api.js` (which today only has
`me/login/signup/logout/me PATCH`, `src/core/api.js:137-202`):

| Endpoint | Behavior |
|---|---|
| `GET /api/auth/sessions` | `select rowid, user_id, created_at, expires_at, label, last_seen_at from sessions where user_id = ? and expires_at > ?`; derive `cur` by comparing `token_hash = sha256(cookie)` server-side. Never expose `token_hash`. |
| `POST /api/auth/sessions/revoke-others` | `delete from sessions where user_id = ? and token_hash != sha256(cookie)` — single statement, `sameOrigin`-guarded. Returns `{ sessions }` so the client re-renders. |
| `DELETE /api/auth/sessions/:id` (by rowid) | `delete ... where rowid = ? and user_id = ?` (user_id in WHERE prevents revoking another user's session). Optional; "revoke-others" satisfies the milestone target. |

**Modified:** `label` is stamped at login (parse `User-Agent` into a short string, e.g.
"MacBook · Chrome" via a tiny server-side `ua` helper); `last_seen_at` updated in
`currentUser()` (`server.js:1122-1132`) **but throttled** (write at most once per 5 min per
session) to avoid a synchronous SQLite write every request.

**Modified (cleanup):** delete `sessions`/`tfa` from `emptyDoc()` (`server.js:774-775`) and
`seed.js:509-514`; the settings page reads its data from `GET /api/auth/sessions` +
`/api/auth/me` instead of `D().sessions`.

### 3.3 Password change (new endpoint, atomic)

`POST /api/auth/password-change { currentPassword, newPassword }`:

```
requireUser → sameOrigin guard → throttle reuse (per ip|user, like login :1235)
currentPassword must verifyPassword(...) against user.password_hash (:172-187)
  (use DUMMY_HASH for unknown-user uniformity only if email lookup was needed — here the
   session already pins the user, so straight verify; add a small artificial delay-stable
   path: verify against password_hash always spends the same work)
newPassword policy must mirror signup (:1296): >=10 chars AND /[0-9\W]/
inside transaction() (:747):
  update users set password_hash = hashPassword(new) where id = ?
  delete from sessions where user_id = ? and token_hash != sha256(current cookie)
```

The last two statements are exactly what the CLI already does destructively
(`--set-password`, `server.js:2158-2161`) — minus the "keep the caller's session" condition.
That condition is the one behavioral nuance to test explicitly.

**Modified:** `A.savePassword` (`actions.js:2351-2370`) → real `api.changePassword(...)` call;
error rendering via the stable-code path (`err.passwordWeak` etc. — codes already exist in the
i18n layer per PROJECT.md Decision 7).

### 3.4 2FA — TOTP with zero runtime dependencies

TOTP (RFC 6238) is implementable in ~60 lines with `node:crypto`: base32-decode secret,
`HMAC-SHA1(secret, unixTime / 30)`, dynamic truncation, 6 digits, `±1` window,
`crypto.timingSafeEqual` for compare. Recommended placement: **new `src/lib/totp.js`**
(module directory to decide with the owner — server-resident if colocated with `server.js`,
but `src/lib/` keeps it testable; it must import only `node:crypto`).

Endpoint set:

| Endpoint | Notes |
|---|---|
| `POST /api/auth/2fa/setup` | generate 20 random bytes → base32; store in `users.two_fa_secret` with `two_fa_enabled = 0`; return `{ otpauth: 'otpauth://totp/Gr8r:<email>?secret=...&issuer=Gr8r', secret }`. Also requires current password (policy: sensitive change). |
| `POST /api/auth/2fa/verify { code }` | TOTP window ±1; on success `two_fa_enabled = 1`, generate 8 recovery codes (`<8 chars>-<8 chars>`), store **sha256 hashes** in `users.recovery_codes`, return plaintext codes **once**. |
| `POST /api/auth/2fa/disable { currentPassword }` | password-gated; clears secret/flag/codes. |
| `POST /api/auth/login/2fa { challenge, code }` | consumes the pending challenge (§ below); accepts a *recovery code* too and burns its hash. Flows through the same per-IP throttle. |

**Login-with-2FA challenge flow** (modifies `server.js:1225-1253`) — the only structural change
to the login path:

```
POST /api/auth/login {email,password}          ← unchanged throttling, verification
  password invalid            → 401 (unchanged)
  valid AND two_fa_enabled=0  → create session + cookie (unchanged, :1242-1252)
  valid AND two_fa_enabled=1  → do NOT set the cookie.
      Create a short-lived pending row: insert into sessions (token_hash=sha256(jwt-无),
      ...) — cleanest: a dedicated pending table
          create table if not exists login_challenges (
            token_hash text primary key, user_id text not null, created_at, expires_at)
          (guarded create → second-boot no-op holds)
      → 200 { user: null, twoFaRequired: true, challenge: <token> }
Client shows the 6-digit input (page component already shaped: settings.js:420 form markup
serves as the model; login page `src/pages/auth.js` gains a challenge phase).
POST /api/auth/login/2fa { challenge, code }
  → verify; success: insert into sessions + cookie + delete pending row.
```

Why a separate `login_challenges` table: it keeps `sessions` rows meaning "authenticated
device" (so the sessions list never shows half-authed rows), and the expiry sweep
(`server.js:2173-2174`) trivially extends to it.

**QR rendering — the second zero-dependency subsystem:** the current canvas is a fake
(`settings.js:410-418`). Recommended **new client module `src/lib/qr.js`**: a small QR encoder
(version 3, byte mode, EC level M is enough for a ~110-char otpauth URI) rendering to the
existing grid-div pattern. No npm dependency, consistent with the zero-runtime rule
(project constraint) — but it is the largest genuinely *new* frontend component of the
milestone and deserves its own task. Renders exactly for the string returned by
`/api/auth/2fa/setup`.

**Recovery codes UI change:** the fake array at `settings.js:408` is replaced by the one-time
reveal from the `verify` response, with a copy button and the existing `settings.tfa.recovery*`
strings. "Regenerate" can be deferred to a later milestone (not in scope).

### 3.5 Settings UI wiring (modified, mostly already-built)

Everything under `settings.js` nav `password`/`sessions`/`2fa` (`src/pages/settings.js:72-74,
378-421`) already renders, and all strings (`settings.sessions.*`, `settings.tfa.*`) are
already in `src/locales/en.json` + `fr.json`. So the UI work is **rewiring data sources and
actions, plus a short i18n sweep**:
- New catalogue keys required (build gate `scripts/i18n-scan.mjs` fails otherwise): reauth/
  password prompt for 2FA setup, "secret key" manual-entry box, "copy" for codes and
  otpauth URI, "this will sign you out everywhere" fine-print, and the login-page challenge
  strings. Both `en.json` and `fr.json` in the same commit.
- Sessions list rendering follows its current shape (`s.dev`/`s.cur`) — map API rows onto
  `{ dev: label, cur, at: relTime(last_seen_at) }` and dedupe labels server-side in English,
  translated client-side where applicable (active-now is computed client-side; timestamps
  stay raw — consistent with the i18n date formatting layer).
- Login page (`src/pages/auth.js`) gains the challenge state; the 6-digit input markup is
  modelable on `settings.js:420`.

### 3.6 New vs Modified — explicit ledger

| Component | Status | Purpose |
|-----------|--------|---------|
| `server.js` SCHEMA + `openDb()` | **modified** | `ensureColumn` users/sessions additions; guarded `login_challenges` table |
| `server.js` route block `:1225-1320` | **modified** + **new handlers** | password-change, 2FA x3-4, login challenge branch |
| `server.js` `currentUser()` `:1122-1132` | **modified** | throttled `last_seen_at` update |
| `server.js` `userPayload()` `:253-260` | **modified** | expose `twoFaEnabled` (display only — setup helpers are their own routes) |
| `server.js` `setPasswordCli()` `:2158-2161` | reference only, unchanged | existing precedent for password+session revoke |
| `src/lib/totp.js` | **new** | base32 decode, TOTP verify (node:crypto only) |
| `src/lib/qr.js` | **new** | zero-dep QR encoder → container grid |
| `src/lib/ua-labels.js` (or in server) | **new (small)** | User-Agent → "MacBook · Chrome" |
| `src/core/api.js` `:137-202` | **modified** | `listSessions`, `revokeOthers`, `changePassword`, `2faSetup/verify/disable`, `login2fa` |
| `src/actions/actions.js` `:2351-2427` | **modified** | 6 stub actions → real calls |
| `src/pages/settings.js` `:378-421` | **modified** | real QR, recovery reveal, session rows from API |
| `src/pages/auth.js` | **modified** | 2FA challenge phase |
| `src/data/seed.js` `:509-514`, `server.js:774-775` | **modified** | remove fake doc fields |
| `src/locales/en.json` + `fr.json` | **modified** | new keys (build-gated) |
| `test/migration.test.mjs` (+ helper) | **modified** | assert new columns exist post-boot; byte-identical no-op re-check |
| `test/` server tests, `e2e/` | **new** | the three flows; reuse real-server/real-db helpers |

---

## 4. Suggested Build Order (investigate-first)

**Phase 13 — Investigation (as scoped by the milestone).** Expected findings (from this
research; confirmation is the phase's job): no endpoints exist; stubs are doc-field only;
removal of `emptyDoc`/seed fake fields; decision on `login_challenges` table vs pending
sessions row; decision on TOTP/QR module placement and whether the recovery-code "regenerate"
stays out of scope. Deliverable: pinned findings + the go/deps choices above.

**Phase A — Session truth + revocation.** Schema columns (`label`, `last_seen_at`), table
sweep of fake doc fields, `GET /api/auth/sessions` + `revoke-others`, `api.js` + settings
wiring, i18n additions, server tests. Smallest vertical slice, and it unblocks a real
sessions page the next phase can depend on ("revoke others" is reused by password change).

**Phase B — Password change.** Endpoint with atomic rehash + revoke-others-others, action/
view wiring, e2e proof that (a) login works with the new password, (b) other sessions die and
the current one survives, (c) old password rejects. Depends on Phase A only for the
sessions-page-verification surface.

**Phase C — TOTP enablement.** `users.two_fa_*` columns, `src/lib/totp.js`, QR module,
setup/verify/disable endpoints, recovery codes, settings page transformation. Independent of
Phases A/B — can parallelize if two executors exist, but sequenced last because it is the
widest slice and its login-path change (§3.4) touches the login route.

**Phase D — Login challenge + hardening.** The `login_challenges` table, the login-route
branch, `POST /login/2fa` incl. recovery-code burn, throttle integration, e2e in both locales.
Sequencing it after C keeps the login route in one coherent change rather than two.

**Phase E — Verification + i18n + migration test.** extension of `test/migration.test.mjs`
(both fresh and pre-locale DBs: columns appear, second boot byte-identical), full e2e pass, FR
sweep of the new keys, changelog/DEPLOY notes.

Each phase keeps R6 alive (in-place migration, no data loss) because only `ensureColumn`/guarded
creates are used — the pre-migration `vacuum into` backup pattern is invoked only if a
non-additive change emerges during implementation (none is expected from this research).

---

## 5. Anti-Patterns to Avoid in This Codebase

| Anti-pattern | Why bad here | Instead |
|---|---|---|
| Adding npm `otpauth`/`speakeasy`/`qrcode` packages | contradicts the zero-runtime-dep constraint that governed v1.1/v1.2 | ~60-line TOTP + small QR module (`src/lib/`) |
| Reusing the workspace document for auth state | is exactly the root cause of the three stubs; doc fields are tenant-shared, not per-account | real tables/columns (§3.1); drop doc fields |
| Storing TOTP secret in plaintext without encryption-at-rest beyond DB | acceptable for a self-hosted single-node tool whose threat model is web-forgeries (sameOrigin guards, throttle) — but **hash recovery codes**, they're password-equivalent | sha256 hashes + password-gated disable |
| Unthrottled `last_seen_at` write per request | turns every API call into a SQLite sync write | throttle to ≥5 min per session |
| Cookie-set before 2FA verified ("verify after cookie") | leaks a usable session from the login route | no cookie until the challenge is consumed (§3.4) |
| `ALTER TABLE ... '` outside `ensureColumn` guard | breaks the second-boot no-op guarantee tested by `test/migration.test.mjs` | `ensureColumn`/guarded create only |

## Sources

- `server.js` lines 84-132 (schema), 134-156 (migrations), 166-190 (scrypt), 253-260
  (userPayload), 747-789 (transaction/emptyDoc), 1090-1141 (cookie/currentUser), 1225-1320
  (auth routes incl. PATCH /me), 2158-2174 (CLI + expiry sweep) — read directly.
- `src/actions/actions.js` 2351-2427 (stub actions), 505-540 (context around simulated
  branches) — read directly.
- `src/pages/settings.js` 72-74, 378-437 (nav, three stub views incl. fake QR + codes) — read
  directly.
- `src/data/seed.js` 498-527 (fake session rows) — read directly.
- `src/core/api.js` 137-202 (existing auth client surface) — grep, read directly.
- `test/migration.test.mjs` 1-40 (fixture + byte-identical assertions) — read directly.
- `.planning/PROJECT.md` (project constraints, i18n build gate, zero-dep precedent) — read
  directly.
