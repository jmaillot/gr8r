---
phase: 30-entra-sso-oidc
reviewed: 2026-11-02T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - server.js
  - test/oidc-sso.test.mjs
  - DEPLOY.md
  - docker-compose.yml
  - Dockerfile
  - .env.example
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Scope: the plan 30-06 gap-closure delta (G-30-1 — `email_verified === true` gating on OIDC identity resolution, server.js callback) plus the phase's infrastructure files (Dockerfile, docker-compose.yml, .env.example, DEPLOY.md) and the OIDC integration suite. Cross-read for context: `oidc.js`, `docker-entrypoint.sh`, `.dockerignore`, `test/dependencies.test.mjs`, `deferred-items.md`.

The G-30-1 core change itself is sound: the `email_verified === true` gate is strict (boolean identity — `'true'` string does not pass), it gates both linking and JIT provisioning, the no-identity fail-closed path fires before any `users`/`oidc_identities` write, and the concurrency backstop on the unique `(issuer, subject)` index correctly re-resolves to the race winner. The test suite covers both new negatives (verified:false and absent) with fresh isolated servers and DB-level assertions.

However, the review confirmed four cross-file config/test defects around the delta — including one documented operator procedure (MASTER_KEY rotation) that docker-compose silently breaks, causing 2FA lockout — plus the known D-12 allow-list mismatch, re-verified on disk and still failing.

## Critical Issues

### CR-01: `MASTER_KEY_PREVIOUS` is never forwarded to the container — the documented key-rotation procedure silently breaks, locking out every 2FA user

**File:** `docker-compose.yml:8-45` (environment block), `.env.example` (whole file)
**Issue:** DEPLOY.md §14 ("Running a rotation") instructs the operator to edit `/opt/projects/.env` with `MASTER_KEY=<new>` + `MASTER_KEY_PREVIOUS=<old>` and `docker compose up -d`. But the compose `environment:` whitelist forwards only `MASTER_KEY` (line 39) — there is no `MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}` entry, and `.env.example` does not mention the variable either. Compose does not pass unlisted host env vars into the container, so `readConfig`/`migrateTotpReWrap` in server.js (line 2059: `if (!MASTER_KEY || !MASTER_KEY_PREVIOUS) return;`) never see the old key: the re-wrap pass never runs, no warning is logged, and every `v2:<old-key-id>` envelope becomes undecryptable → all 2FA logins answer 503 `masterKeyMissing` until the operator diagnoses the compose gap on their own. This is exactly the "rotation will silently do nothing" failure mode DEPLOY.md's pre-rotation checks were written to prevent — and none of those checks (image currency, key-id coverage) catches a compose-forwarding gap. Pre-existing since Phase 26, but docker-compose.yml and .env.example are in this phase's scope and DEPLOY.md was edited this phase without reconciling the procedure against the compose file.

**Fix:**
```yaml
# docker-compose.yml, environment block (next to MASTER_KEY):
      MASTER_KEY: ${MASTER_KEY:?set MASTER_KEY in .env (32+ random chars; encrypts TOTP secrets — losing it locks out 2FA)}
      MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}
```
```dotenv
# .env.example, after the MASTER_KEY block:
# Only during a planned rotation (DEPLOY.md §14): the key being replaced.
# Empty at all other times.
MASTER_KEY_PREVIOUS=
```

## Warnings

### WR-01: D-12 Dockerfile/allow-list mismatch re-verified on disk — the dependencies suite is still red

**File:** `Dockerfile:19` vs `test/dependencies.test.mjs:52-56`
**Issue:** Confirmed on the current tree (not just per the deferred-items note): the runtime stage now copies six targets (`server.js`, `oidc.js`, `totp.js`, `mailer.js`, `seed.json`, `dist` — line 19 adds `oidc.js`, correctly, since server.js imports it), but the D-12 test still pins `['dist', 'mailer.js', 'seed.json', 'server.js', 'totp.js']`. `npm test` fails on this row. The deferred-items note says it was left untouched per scope boundary — legitimate for 30-06, but it must not ship: CI (`npm test` in the build job) is currently red, which trains the team to ignore failures and masks future regressions.

**Fix:** Update the allow-list with the same rationale comment pattern already used for totp.js:
```js
  // 7668ece: server.js imports totp.js at runtime, so the image ships it too.
  // 59ce617: server.js imports oidc.js at runtime (Phase 30 SSO), so the image ships it too.
  assert.deepEqual(
    copyTargets.sort(),
    ['dist', 'mailer.js', 'oidc.js', 'seed.json', 'server.js', 'totp.js'],
    `the runtime stage must copy exactly server.js, oidc.js, totp.js, mailer.js, seed.json and dist — found: ${copyTargets.join(' | ')} (D-12)`,
  );
```

### WR-02: `.env.example` ships `TRUST_PROXY=false`, defeating docker-compose's Traefik-specific `true` default — cookies lack `Secure` on the bundled deployment

**File:** `.env.example:87` vs `docker-compose.yml:35`
**Issue:** compose sets `TRUST_PROXY: ${TRUST_PROXY:-true}` (correct for the bundled Traefik deployment), but compose interpolation reads `.env` first — and the file users copy is `.env.example`, which sets `TRUST_PROXY=false`. So every fresh install following DEPLOY.md §5 (`cp .env.example .env`) runs behind Traefik with the proxy headers untrusted: `SECURE_COOKIE=auto` cannot detect HTTPS (no `Secure` flag on session/challenge cookies), `proto(req)` reports http, HSTS is never emitted (server.js:4440), and all per-IP throttles (login, `oidc|ip`, signup) key on the proxy's address — one shared budget for the whole internet. DEPLOY.md §5 claims "The bundled docker-compose passes `TRUST_PROXY=true` explicitly" — that is only true when `.env` does not override it, which the shipped template does. Not exploitable (untrusted headers are the fail-safe direction), but it silently degrades the cookie/TLS posture and collapses throttle isolation on the default install path.

**Fix:** Change `.env.example:87` to `TRUST_PROXY=true` (matching the bundled Traefik topology), keeping the comment explaining when to set `false` (direct exposure / no proxy). Alternatively remove the value from `.env.example` so the compose default governs.

### WR-03: OIDC integration tests run ~9 start-route attempts against one shared server — one test away from the 10-per-15-min throttle

**File:** `test/oidc-sso.test.mjs:169-433` (shared `server` instance) vs `server.js:2631` (`tooMany('oidc|ip')`, max 10)
**Issue:** The SSO-03/G-30-1 negative rows correctly moved to `freshMatrixServer()` for throttle/database isolation, but the happy path, the linking test, the three guest-shape tests, the no-email test, idempotency, and both JIT-hash tests still share the module-level `server`, each consuming one `/api/auth/oidc/start` attempt from the same in-memory per-IP budget (I count 9). The suite passes today, but any added test against the shared instance (or a reordering) trips 429 `tooManyAttempts` at `runFlow`'s `start` assertion — an order-dependent flake that will look like an auth regression.

**Fix:** Route those tests through `freshMatrixServer()` too (the helper already exists and handles stop/replace), or assert-free comment the budget so the next author knows the ceiling. Minimal: change `guestShape`/no-email/idempotency tests to `runFlow({ srv: await freshMatrixServer(), ... })`.

### WR-04: Email-match lookup in the OIDC callback omits `collate nocase`, inconsistent with the schema and the rest of the auth family

**File:** `server.js:2722` (`select * from users where email = ?` — the linking gate)
**Issue:** `users.email` is declared `unique ... collate nocase` (server.js:142), and every other email lookup in the auth family uses an explicit `collate nocase` (e.g. lines 2292, 2765, 3664's update, stampInstanceAdmin at 1664). Line 2722 compares exactly: a pre-existing account stored with uppercase characters (hand-inserted, restored backup, or a future migration path) will not match the lowercase-normalized claim, so the linking gate falls through to the JIT branch, whose `createUser` insert then fails on the nocase UNIQUE constraint → `httpError(409)` → swallowed by the callback's catch → generic `?sso=error`. Fail-closed (no security impact), but the operator-visible behavior is an SSO error for a legitimate tenant user, and it diverges from the file's own convention.

**Fix:**
```js
const existing = db.prepare('select * from users where email = ? collate nocase').get(email);
```

## Info

### IN-01: Leftover debug diagnostic in the happy-path test

**File:** `test/oidc-sso.test.mjs:197-198`
**Issue:** `if (callback.location !== "/") console.log("SERVER OUT:", server.output());` is a debugging aid left in the suite. It only fires on failure (where the assertion message would follow anyway) but adds output noise and a nonstandard dependency on the helper's `output()` API.
**Fix:** Remove it, or keep it deliberately and comment why it exists.

### IN-02: SSO invite auto-accept clearing is not transactional with the membership insert

**File:** `server.js:2775-2800` vs `addMembership`'s internal `begin immediate` (2267-2284)
**Issue:** The auto-accept recipe calls `addMembership` (own transaction), then runs the two invite-clearing updates (2799-2800) as bare statements outside any transaction — unlike the password accept route's surrounding flow. A crash between them strands an accepted invite as pending. Impact is bounded: repeat SSO logins skip reconciliation once a membership exists (2763), so the stray row is inert until expiry and cannot double-accept. Still, the comment at 2797 claims "same single-use clearing as the accept route", which overstates the atomicity.
**Fix:** Either wrap membership + clearing in one `transaction()` (accepting that `addMembership` needs a non-self-transacting variant), or soften the comment to document the crash window and its idempotent recovery.

---

_Reviewed: 2026-11-02_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
