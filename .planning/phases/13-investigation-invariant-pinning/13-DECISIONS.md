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
  **Consumed by:** Phase 16 (migration adds the column with the other 2FA columns; the replay
  guard serves both verify paths).
