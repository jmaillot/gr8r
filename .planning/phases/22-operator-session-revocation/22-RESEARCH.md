# Phase 22: Operator Session Revocation - Research

**Researched:** 2026-10-29
**Domain:** Privilege gating + session revocation on a zero-dependency Node.js/better-sqlite3 server; Chromium e2e coverage
**Confidence:** HIGH (all claims verified against in-repo ground truth this session; no external packages introduced)

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-112:** Gate is an **additive `is_instance_admin` flag column** on `users` (integer not null default 0), checked by the route — not `ADMIN_EMAIL` matching, not `isAdminUser()`/workspace role. Workspace roles stay tenant-bound; a workspace admin without the flag fails the privilege-matrix test. ADMIN_EMAIL-derived and first-user-stamp alternatives were rejected. **Reversibility: costly** — schema migration + load-bearing privilege boundary; every consumer keys off it.
- **D-113:** Flag set at **bootstrap + boot stamp**: `ensureAdmin` sets `is_instance_admin = 1` on the ADMIN_EMAIL bootstrap account; a one-time boot migration stamps the ADMIN_EMAIL-matching account on existing databases if no user is flagged. Documented in the migration comment.
- **D-114:** **No operator transfer mechanism this phase.** Reassigning the flag is a documented manual DB update.
- **D-115:** Route is **`POST /api/auth/operator/users/:userId/revoke-sessions`** — auth-family namespace, action-style POST, no body required. Guard order: `sameOrigin` → `requireUser` → throttle → handler, with the operator gate after `requireUser`.
- **D-116:** Throttle key **`operator-revoke|${operator.id}`, 5 attempts / 15 minutes, every attempt consumes a try** — keyed on the operator (caller), not the target.
- **D-117:** Response **200 `{ revoked, remaining }`** — live post-delete counts, `Cache-Control: no-store` via `json()` — exact envelope of `/api/auth/sessions/others`. Successful revocation records **`logSecurity(target.id, 'sessions_revoked_by_operator')`** — log after the transaction commits, before the response.
- **D-118:** Revocation is one delete: `delete from sessions where user_id = target.id and token_hash != currentOperatorToken`. Self-target is **allowed** (acts as revoke-others on self).
- **D-119:** Owner target refused with **403 `ownerImmune` before any session lookup**; a refused attempt consumes a throttle try. Regression test: revoke an owner → 403, owner sessions untouched.
- **D-120:** Trigger is an **operator-only card on the settings page** (`src/pages/settings.js`), not the members page. Lists instance users with per-user revoke + inline confirmation (D-90 pattern). Owner rows show the action disabled/hidden with an "owners are immune" hint.
- **D-121:** Card data from **`GET /api/auth/operator/users`** returning `id, name, email, is_instance_admin, last_login_at` (no session data). Same operator gate, same family guards; reads are not throttled.
- **D-122:** Server-level node:test privilege matrix: operator succeeds on non-owner; workspace-admin-without-flag fails (403-style, target sessions intact); owner target refused; self-target revokes others only; throttle band; revoked token's next request 401s; users-list route gate.
- **D-123:** One Chromium spec in EN + FR covers the **full lifecycle**: enroll → regenerate → login with 2FA → disable → re-enroll → operator revokes → revoked browser shows honest `signedOutElsewhere` teardown while operator's session survives. No v1.3 e2e deleted or weakened; new strings catalogued EN + FR (i18n-scan green) under the settings/operator namespace.

### the agent's Discretion

Exact error code for the privilege-matrix failure (operator-gate rejection vs generic forbidden), i18n key names, card layout details within settings-page patterns, test file placement within existing conventions, route comment wording.

### Deferred Ideas (OUT OF SCOPE)

- Operator transfer route (reassign `is_instance_admin` via UI) — D-114.
- Revoke-all-users shape, audit trail entries, workspace-admin revocation tier — REQUIREMENTS.md deferred list.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPREV-01 | Operator revokes all sessions of a target user via operator-authorized route; own sessions excluded from self revoke-others; rides existing mid-session 401 teardown so revoked browsers sign out honestly | D-115/D-118 delete shape mirrors three verified in-repo precedents (`server.js:1896`, `:1587`, `:1697`); honest teardown already triggers on any `signInRequired` 401 — no new push mechanism needed (see Architecture Pattern 3) |
| OPREV-02 | Owner accounts immune; operator cannot revoke an owner's sessions (regression-tested) | D-119: 403 `ownerImmune` before session lookup, gate order verified against auth-family guard convention; immunity = `is_instance_admin` rows (the only owner marker in the schema) |

</phase_requirements>

## Summary

Phase 22 is the smallest surface in the milestone: one boolean column, one boot migration, two routes sharing an operator gate, one settings card, and a proof layer. Everything is gap-closure on verified precedents — the revocation delete, the response envelope, the throttle band, the logSecurity verb, the settings-card inline-stage confirmation, and the honest 401 teardown all exist and were read this session. The only genuinely new constructs are (a) the `is_instance_admin` column + its bootstrap/boot-stamp provisioning and (b) the operator gate function the two routes share.

The critical non-obvious finding: **the honest `signedOutElsewhere` teardown needs zero server-side additions.** The client's central teardown (`src/actions/actions.js:2131–2141`) fires on *any* mid-session 401 carrying the `signInRequired` code, and `requireUser` (`server.js:1364–1367`) emits exactly that on a missing/invalid session. A deleted session row therefore produces the full honest teardown on the browser's next request — the Phase 21 D-106 e2e already proved this against the revoke-others delete, so the Phase 22 e2e asserts a mechanism with a working in-repo precedent.

**Primary recommendation:** Add `ensureColumn(db, 'users', 'is_instance_admin', 'integer not null default 0')` + a boot-stamp migration, write one shared `isInstanceAdmin(user)` gate, wire the two routes into the auth family with the D-115 guard order, add the settings card reusing the D-90 inline-stage machinery, then split proof per D-109/D-110: server node:test for the privilege matrix, one parametric EN+FR Chromium spec for the lifecycle.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Privilege gate (`is_instance_admin`) | Database/Storage (column) + API (route check) | — | Server is the hard boundary; UI hiding is defense-in-depth only (established project pattern) |
| Session revocation | API/Backend (one DELETE in the route) | Database/Storage | Row deletion; no push channel — revocation propagates via next-request 401 |
| Honest sign-out of revoked browsers | Browser/Client (central teardown) | API (401 `signInRequired`) | Existing D-28 mechanism; server does nothing beyond deleting rows |
| Operator users list | API (GET route) + Browser (settings card) | — | Read route feeds the card; card is display + confirm only |
| i18n of new strings | Browser/Client (locales) | — | EN + FR catalogues; i18n-scan test enforces |

## Standard Stack

No new packages. The project is **zero runtime dependencies** (STATE.md) — this phase uses only existing in-repo machinery:

| Component | Where | Purpose | Why |
|-----------|-------|---------|-----|
| `node:test` + `node:assert/strict` | test/*.test.mjs | Server-level privilege matrix | Convention from Phases 19–21 suites [VERIFIED: test/tfa-disable.test.mjs:11] |
| `test/helpers/server.mjs` | `startServer({ dataDir, env })`, `login`, `signup`, `withDb` | Real server + real SQLite, throwaway MASTER_KEY | Verified pattern: `test/tfa-disable.test.mjs:24–30` spins two servers because signup is IP-throttled 5/hour — the privilege matrix needs >5 users, plan for a second instance from day one [VERIFIED: test/tfa-disable.test.mjs:23–30] |
| `@playwright/test` (Chromium) | e2e/*.spec.mjs | Lifecycle e2e EN + FR | `e2e/tfa-disable-cycle.spec.mjs` is the direct template [VERIFIED: e2e/tfa-disable-cycle.spec.mjs:1–24] |
| `totp.js` (`totpAt`) | e2e + tests | Compute live TOTP codes locally — no test backdoor | [VERIFIED: e2e/tfa-disable-cycle.spec.mjs:25] |
| `ensureColumn(conn, table, name, def)` | server.js:171–174 | Additive column migration helper | [VERIFIED: server.js:171–174 — `function ensureColumn(conn, table, name, def) { const cols = conn.prepare(\`pragma table_info(${table})\`).all(); if (!cols.some(c => c.name === name)) conn.exec(\`alter table ${table} add column ${name} ${def}\`); }`] |
| `logSecurity(userId, verb)` | server.js:1425–1427 | Security verb recording | [VERIFIED: server.js:1425–1427 — inserts into `security_log (id, user_id, verb, created_at)`] |

**Installation:** none — zero new dependencies. If any task proposes `npm install`, it violates the project constraint and must be reworked.

## Package Legitimacy Audit

Not applicable — this phase installs zero external packages (project is zero-runtime-dependencies by design; all Phase 22 needs are in-repo). No registry checks required.

## Architecture Patterns

### System Architecture Diagram

```
Operator browser                  Server (server.js)                    SQLite                Target browser
       |                                |                                  |                        |
       |  GET /api/auth/operator/users  |                                  |                        |
       |-------------------------------->  sameOrigin→requireUser          |                        |
       |                                |  →isInstanceAdmin gate           |                        |
       |                                |---------------------------------->  select users          |
       |  200 [{id,name,email,is_instance_admin,last_login_at}]            |                        |
       |<--------------------------------                                 |                        |
       |                                |                                  |                        |
       |  POST .../users/:id/revoke-sessions                               |                        |
       |-------------------------------->  sameOrigin→requireUser          |                        |
       |                                |  →isInstanceAdmin gate           |                        |
       |                                |  →ownerImmune 403 if target is_instance_admin             |
       |                                |    (before any session lookup)   |                        |
       |                                |  →throttle 5/15min (consumes try on ALL outcomes)         |
       |                                |---------------------------------->  delete sessions      |
       |                                |    (user_id=target AND           |  where token_hash      |
       |                                |     token_hash != operator's)    |  != operator hash      |
       |                                |  →logSecurity(target,'sessions_revoked_by_operator')      |
       |  200 { revoked, remaining }    |    (after commit, before resp)   |                        |
       |<--------------------------------                                 |                        |
       |                                                                   |   next any-API request |
       |                                                                   |----------------------->|
       |                                                                   |   requireUser → 401    |
       |                                                                   |   signInRequired       |
       |                                                                   |                        |
       |                                                                   |   central teardown     |
       |                                                                   |   → signOut + honest   |
       |                                                                   |   signedOutElsewhere   |
```

### Pattern 1: Additive column + boot stamp (D-112/D-113)

**What:** `ensureColumn` adds `is_instance_admin` idempotently; then, if no user has the flag, stamp the ADMIN_EMAIL-matching account. In `bootstrap()` (server.js:954–959) order matters only in that the stamp runs after `openDb`/schema creation.

**Verified current bootstrap sequence:** [VERIFIED: server.js:954–959 — `function bootstrap(opts) { ensureWorkspace(); migrateTenancy(); migrateTotpEncryption(); ensureAdmin(opts); }`]

**Verified current ensureAdmin** (no flag logic yet — Phase 22 adds it): [VERIFIED: server.js:936–952 — returns early if any user exists (`if (db.prepare('select count(*) as n from users').get().n > 0) return;`), then reads `process.env.ADMIN_EMAIL || 'admin@example.com'`, creates user, adds 'owner' membership]. Note the early-return: on existing databases `ensureAdmin` does nothing, which is exactly why D-113 needs a **separate boot-stamp migration** — it cannot live inside the early-returned bootstrap branch.

**Verified users schema** (additive column site): [VERIFIED: server.js:92–105 — `create table if not exists users (id text primary key, email text not null unique collate nocase, name text not null, password_hash text not null, member_id text, created_at integer not null, last_login_at integer, locale text, two_fa_enabled integer not null default 0, two_fa_secret text, two_fa_last_step integer not null default 0)`]

**When to use:** As-is. `ensureColumn` is the established additive-migration helper (same family as migrateTotpEncryption/migrateTenancy).

### Pattern 2: The keep-current revocation delete (D-118)

Three verified in-repo instances of the identical shape:

- [VERIFIED: server.js:1896 — `db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash)`] (revoke-others route)
- [VERIFIED: server.js:1587 — same statement in the password-change transaction] with comment `// Keep-current (P-H): the caller's own session is excluded by the != clause.`
- [VERIFIED: server.js:1697 — same statement in the disable-2FA transaction, D-105]

For the operator route the caller's `tokenHash` is `sha256(parseCookies(req.headers.cookie)[COOKIE])` — the exact derivation at [VERIFIED: server.js:1894]. The operator's hash differs from the target's rows for any non-self target, so **one statement serves both cases**: self-target = revoke-others (success criterion 2); other-target = full revoke (criterion 1).

### Pattern 3: Honest 401 teardown — zero server work (D-28)

The chain, fully verified:

1. Deleted session row → next authenticated request hits `requireUser`, which [VERIFIED: server.js:1364–1367 — `function requireUser(req, res) { … fail(res, 401, 'signInRequired', 'Sign in to continue'); }`]
2. The client's central teardown is "Registered once at module load as the central teardown: api.js call() invokes it on any mid-session 401 carrying the server's signInRequired code — save path, boot hydration, sessions refresh and revoke actions all inherit it" [VERIFIED: src/actions/actions.js:2131–2141 — `async function signOutRevoked() { await A.signOut(); toast(t('err.signedOutElsewhere'), { kind: 'err' }); } registerAuthRevokedHandler(signOutRevoked);`]
3. Copy source: [VERIFIED: src/locales/en.json:1489 — `"err.signedOutElsewhere": "You have been signed out from another device. Sign in again to continue."`]

**Consequence for planning:** no server-side push/notify task exists. The e2e asserts existing behavior (Phase 21's D-106 did exactly this with two cookie-jar contexts).

### Pattern 4: Response envelope + logSecurity placement (D-117)

The route's template is the revoke-others route: [VERIFIED: server.js:1888–1899 — `if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', …); const user = requireUser(req, res); if (!user) return; const tokenHash = sha256(…); const del = db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(…); const left = db.prepare('select count(*) as n from sessions where user_id = ? and expires_at > ?').get(user.id, now()); return json(res, 200, { revoked: del.changes, remaining: left.n }); // live post-delete counts (Pitfall 10)`]

Note the `remaining` count filters `expires_at > now()` — mirror that predicate exactly so the envelope matches.

logSecurity placement precedent: "D-107: the security verb records only on committed success — after the transaction, before the response" [VERIFIED: server.js:1703–1705 — `logSecurity(user.id, 'tfa_disabled')` immediately before the 200 return]. Verified verbs in the catalogue so far: `tfa_disabled` (1705), `tfa_recovery_regenerated` (1754). `sessions_revoked_by_operator` is new — check whether the security-log UI renders verbs via the i18n catalogue (an activity-verbs test exists: `test/activity-verbs.test.mjs`) and catalogue the verb accordingly.

### Pattern 5: Guard order + throttle band (D-115/D-116)

Guard order is a hard convention ("Pitfall 22"): `sameOrigin` → `requireUser` → throttle → handler, with the operator gate inserted after `requireUser`. The throttle band 5/15min keyed on the actor is the D-11 band reused by Phases 20–21 — the disable suite already regression-tests its band [VERIFIED: test/tfa-disable.test.mjs header — "the verified throttle/503 band (D-108)"]. Per D-116 **every attempt consumes a try** including 403s (owner-immune refusals and gate rejections), so the throttle call precedes the gate decision or the gate path also records a try — follow how the Phase 21 route orders this and mirror it.

### Anti-Patterns to Avoid

- **ADMIN_EMAIL checks inside the route handler:** rejected by D-112 (env dependency at request time). The gate reads the DB flag, nothing else.
- **Reusing workspace role/`isAdminUser()` as the gate:** rejected by D-112; workspace roles are tenant-bound and the privilege-matrix test exists precisely to fail this.
- **Extending the members page as the operator surface:** rejected by D-120 (workspace-scoped data source contradicts instance-wide reach).
- **Revoking via token enumeration or a per-session loop:** D-118 is one DELETE; a loop breaks the self-target case and adds races.
- **A push/notification mechanism to signed-out browsers:** none exists; the 401 teardown is the whole mechanism.
- **New npm dependencies:** zero-dependency project — no install tasks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Additive column | Custom pragma/alter logic | `ensureColumn` (server.js:171–174) | Idempotent, established |
| Keep-current revoke | Token enumeration | `… and token_hash != ?` single DELETE | Verified 3×; handles self-target free |
| Security verb | New audit table | `logSecurity` (server.js:1425–1427) | Phase 20/21 mechanism |
| Inline confirm UI | New dialog component | Settings tfa-card inline-stage (D-90 pattern, settings.js:391–432 area — `const stage = S.ui.tfaStage` [VERIFIED: src/pages/settings.js:399]) | Phase 20–21 convention |
| EN+FR assertion strings | Raw literals in specs | `fmt()` catalogue helper copied from `e2e/tfa-disable-cycle.spec.mjs:29–42` | i18n-scan + zero-raw-literal convention |
| Live TOTP in e2e | Mock codes | `totpAt` from `totp.js` | No-test-backdoor rule |

## Runtime State Inventory

Not a rename/refactor/migration-of-names phase — it is an additive-schema phase. Still, the relevant runtime-state answer: **existing databases** pre-v1.4 have no `is_instance_admin` column and no flagged user; the D-113 boot stamp is the runtime-data backfill task (data migration, not code edit — it must UPDATE an existing row, not just touch bootstrap). Fresh installs get the flag via `ensureAdmin`'s create path. Both paths must be tested (a fresh-DB test and an old-schema DB test, mirroring how `test/migration.test.mjs` covers migrateTotpEncryption).

## Common Pitfalls

### Pitfall 1: Boot stamp skipped because `ensureAdmin` early-returns
**What goes wrong:** Putting the flag logic inside `ensureAdmin`'s create path only — existing databases (the common self-hosted case) never get an operator.
**Why:** `ensureAdmin` returns immediately when any user exists [VERIFIED: server.js:937].
**Avoid:** Separate boot-stamp migration in `bootstrap()` per D-113, gated on "no user is currently flagged".
**Warning signs:** Fresh-install tests pass, existing-DB tests fail.

### Pitfall 2: Owner immunity checked after session lookup (or after deletion)
**What goes wrong:** Partial revocation before the 403, or information leak via target-existence differences.
**Why:** D-119 requires refusal "before any session lookup".
**Avoid:** Order: resolve target → check `is_instance_admin` → 403 `ownerImmune` → only then touch sessions.
**Warning signs:** A regression test that revokes an owner and finds sessions deleted.

### Pitfall 3: Throttle not consuming tries on refusals
**What goes wrong:** Privilege-matrix probe attacks for free; D-116 violated.
**Avoid:** Every attempt (success, 403 owner-immune, gate rejection) consumes a try; keyed `operator-revoke|${operator.id}`.
**Warning signs:** 6th attempt succeeding when 5 earlier ones were 403s.

### Pitfall 4: Gate rejection vs workspace-admin confusion in tests
**What goes wrong:** The matrix test proves the wrong thing — a "workspace admin" fixture that happens to also carry the flag, or the gate accidentally reading workspace role.
**Avoid:** Create a user with an owner/admin membership in a workspace but `is_instance_admin = 0` and assert 403 + target sessions intact [D-122]. The two flags are independent by construction: `addMembership` (workspace role) vs the users-table column [VERIFIED: server.js:947 — `addMembership(firstWorkspace(), user, 'owner')` is workspace-scoped, separate from the new column].
**Warning signs:** Test passes for the wrong reason (gate reading memberships).

### Pitfall 5: e2e throttle starvation
**What goes wrong:** The lifecycle spec performs many auth actions; signup is IP-throttled 5/hour and revoke is throttled 5/15min — the FR parametric run doubles every budget.
**Avoid:** Phase 21's convention: "every account/context presents its own run-unique X-Forwarded-For so throttle budgets never cross" [VERIFIED: e2e/tfa-disable-cycle.spec.mjs:20–21]. Reuse `clientIp`/`newRunId` from `e2e/helpers/setup.mjs`.
**Warning signs:** Flaky 429s in the second language run.

### Pitfall 6: Verb/i18n scan failures
**What goes wrong:** New `settings.operator.*` strings or the new verb missing from one locale; `test/i18n-scan.test.mjs` and `test/catalogue.test.mjs` fail.
**Avoid:** Add every new string to **both** `src/locales/en.json` and `fr.json` at authoring time; check `test/activity-verbs.test.mjs` for whether the security verb needs catalogue entries.
**Warning signs:** Red i18n suite before code review.

### Pitfall 7: Self-target edge in the UI
**What goes wrong:** The card lets the operator revoke their own row and the "current browser" dies mid-action, confusing the operator.
**Note:** D-118 allows self-target (server-side). The UI may label the operator's own row ("this device survives — your other browsers are signed out") at planner's discretion; the response `{ revoked, remaining }` gives the client nothing special to handle — the current session is not among the deleted rows.

## Code Examples

### Route skeleton (assembling verified precedents — operator-gate specifics are new)

```js
// POST /api/auth/operator/users/:userId/revoke-sessions — shape per D-115/D-117/D-118.
// Guard order (auth-family convention): sameOrigin → requireUser → throttle → gate → handler.
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
const operator = requireUser(req, res);
if (!operator) return;
// throttle: key operator-revoke|operator.id, 5 / 15min, every attempt consumes a try (D-116)
if (!isInstanceAdmin(operator)) return fail(res, 403, /* code at discretion */, '…'); // gate AFTER requireUser (D-115)
const target = db.prepare('select id, is_instance_admin from users where id = ?').get(targetId);
if (!target) return fail(res, 404, /* existing not-found family */, '…');
if (target.is_instance_admin) return fail(res, 403, 'ownerImmune', '…'); // BEFORE any session lookup (D-119)
const operatorTokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]); // derivation at server.js:1894
const del = db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(target.id, operatorTokenHash);
const left = db.prepare('select count(*) as n from sessions where user_id = ? and expires_at > ?').get(target.id, now());
logSecurity(target.id, 'sessions_revoked_by_operator'); // after commit, before response (D-117, D-107 precedent)
return json(res, 200, { revoked: del.changes, remaining: left.n });
```

(`notFound`/404 handling for a missing targetId: match whatever the auth family uses today — planner verifies at planning time; not pre-verified here.)

### Boot stamp (D-113)

```js
// In bootstrap(), after schema creation, before/after ensureAdmin per ordering decision:
ensureColumn(db, 'users', 'is_instance_admin', 'integer not null default 0');
// One-time stamp: pre-v1.4 installs must get a working operator.
if (db.prepare('select count(*) as n from users where is_instance_admin = 1').get().n === 0) {
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim();
  db.prepare('update users set is_instance_admin = 1 where email = ? collate nocase').run(email);
  // migration comment: documents D-113 (per CONTEXT.md)
}
```

Note the `collate nocase` match — emails are stored with `collate nocase` in the schema [VERIFIED: server.js:95].

### Test matrix (D-122) → files

| Scenario | Suite | Command |
|----------|-------|---------|
| Operator revokes non-owner; 200 `{revoked, remaining}`; target's other browser 401s | node:test | `node --test test/operator-revoke.test.mjs` |
| Workspace admin (no flag) → 403, target sessions intact | node:test | same |
| Owner target → 403 ownerImmune, owner sessions untouched | node:test | same |
| Self-target → others revoked, own session alive | node:test | same |
| Throttle band 5/15min, every attempt consumes | node:test | same |
| Users-list gate (non-operator 403; payload fields exactly `id, name, email, is_instance_admin, last_login_at`) | node:test | same |
| Full lifecycle EN + FR; honest `signedOutElsewhere` | Playwright Chromium | existing e2e runner (`e2e/tfa-disable-cycle.spec.mjs` conventions) |

Existing test harness details (verified conventions to reuse): two-server setup to escape the 5/hour signup IP throttle [VERIFIED: test/tfa-disable.test.mjs:23–30]; throwaway MASTER_KEY per server so tests exercise the same envelope path; `withDb(srv.dbPath, db => …)` for direct assertion of session rows [VERIFIED: test/tfa-disable.test.mjs:33–36].

## State of the Art

N/A — no external technology evolves here. All mechanisms are in-repo and current.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The auth family's guard/throttle ordering for a refused attempt consuming a throttle try mirrors the Phase 21 route's exact placement (CONTEXT asserts the D-116 rule; I did not read the Phase 21 throttle call site line-by-line) | Pattern 5 | Throttle budget semantics differ slightly; trivially fixable in plan verification |
| A2 | The security-log UI surfaces verbs via catalogue/i18n such that `sessions_revoked_by_operator` may need catalogue entries (suggested by `test/activity-verbs.test.mjs` existing; the UI path itself not read) | Pattern 4 | Missed i18n/verb-catalogue test failures — caught by the suite, cheap to fix |
| A3 | Missing `:userId` target → 404 using the auth family's existing not-found shape (code name not pre-verified) | Route skeleton | Wrong error code; planner verifies against `fail(…404…)` call sites |
| A4 | "Owner" == any user with `is_instance_admin = 1` is the correct immunity predicate (D-119 says "owner accounts"; the schema has no other owner marker, and D-112 makes the flag the privilege boundary, so flagged-rows-are-immune is the consistent reading — including the operator's own row for owner-target refusals) | OPREV-02 | If "owner" means workspace-membership owners instead, the immunity check changes shape; discuss-phase wording strongly implies the flag reading, but planner should confirm the matrix covers both readings or lock one |

## Open Questions

1. **Immunity predicate scope (A4)** — Does owner immunity protect only `is_instance_admin` rows, or also workspace-`owner` memberships? Recommendation: implement the flag reading (D-112's logic) and note in the plan that the privilege matrix pins it; if the user wants workspace-owner immunity too, it's a one-line predicate change — flag as a checkpoint if unsure.
2. **Gate-rejection error code** — discretion area; pick within the existing auth-family 403 codes (`forbidden` vs a new operator-specific code). Verify against `fail(res, 403, …)` call-site codes before locking.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node:test | Server suite | ✓ | Node built-in (existing suites run) | — |
| better-sqlite3 (`DatabaseSync`) | Schema/migration | ✓ | in use | — |
| @playwright/test + Chromium | Lifecycle e2e | ✓ | existing e2e specs run | — |
| node | all | ✓ | see repo engines | — |

(Verified by the existence and recent-green status of `test/tfa-disable.test.mjs` and `e2e/tfa-disable-cycle.spec.mjs`; no new tooling required. No missing dependencies.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (server suites) + @playwright/test Chromium (e2e) |
| Config file | e2e runner config per existing specs; node:test needs none |
| Quick run command | `node --test test/operator-revoke.test.mjs` |
| Full suite command | `node --test test/` + e2e suite |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPREV-01 | Revoke route + envelope + honest teardown + self-target | server (node:test) | `node --test test/operator-revoke.test.mjs` | ❌ Wave 0 |
| OPREV-01 | Lifecycle EN+FR e2e with `signedOutElsewhere` | e2e (Chromium) | Playwright spec (mirrors tfa-disable-cycle runner) | ❌ Wave 0 |
| OPREV-02 | Owner immunity regression | server (node:test) | same suite | ❌ Wave 0 |
| (D-112) | Privilege matrix: workspace-admin-without-flag blocked | server (node:test) | same suite | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick node:test file(s) touched
- **Per wave merge:** full node:test + i18n-scan/catalogue suites
- **Phase gate:** full suite + e2e green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/operator-revoke.test.mjs` (or per-convention naming) — privilege matrix per D-122
- [ ] e2e spec file — lifecycle EN+FR per D-123 (helpers copied locally per tfa-disable-cycle convention, not imported from flows.spec.mjs)
- [ ] Locale strings for the operator card + verb entries (EN + FR simultaneously)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | **yes — this phase IS an access-control change** | DB flag gate in-route; privilege matrix tests; UI hiding as defense-in-depth only |
| V2 Authentication | yes (inherits) | `requireUser` on both routes |
| V5 Input Validation | yes | `:userId` regex-constrained like the auth family (`[0-9a-f]{12}` pattern at server.js:1901 for session ids — verify the users id format at planning time) |
| V3 Session Management | yes | One-statement revoke; live counts; no token enumeration |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via workspace-admin confusion | Elevation of Privilege | Flag-based gate; privilege-matrix regression (D-122) |
| Throttle-bypass probing of the gate | DoS/Recon | D-116: every attempt consumes a try, keyed on operator |
| Cross-origin CSRF on destructive route | Tampering | `sameOrigin` first guard (family convention) |
| Owner account lockout by operator | Elevation/Denial | 403 `ownerImmune` before any lookup (D-119) |

## Sources

### Primary (HIGH confidence — all read this session)
- `server.js` lines 92–105 (users schema), 168–174 (security_log DDL + ensureColumn), 936–959 (ensureAdmin/bootstrap), 1364–1367 (requireUser 401 signInRequired), 1425–1427 (logSecurity), 1585–1592 (password-change revoke precedent), 1690–1705 (disable-2FA revoke + D-107 log placement), 1888–1899 (sessions/others envelope)
- `src/actions/actions.js:2118–2142` — central honest teardown, registerAuthRevokedHandler
- `src/main.js:66–95` — D-28 save-401 path
- `src/locales/en.json:1489` — err.signedOutElsewhere copy
- `test/tfa-disable.test.mjs:1–36` — server-suite conventions (two servers, MASTER_KEY, withDb)
- `e2e/tfa-disable-cycle.spec.mjs:1–42` — e2e conventions (parametric EN+FR, fmt(), run-unique IPs, local TOTP)
- `.planning/phases/22-operator-session-revocation/22-CONTEXT.md` — all D-decisions
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json`

### Secondary / Tertiary
- None needed — fully in-repo phase.

## Metadata

**Confidence breakdown:**
- Route/UI/test shape: HIGH — every pattern verified against source this session
- Gate/migration mechanics: HIGH — ensureColumn/bootstrap/ensureAdmin read verbatim
- Edge semantics (A1–A4): MEDIUM — flagged in Assumptions Log for planner confirmation

**Research date:** 2026-10-29
**Valid until:** 2026-11-28 (in-repo subject; code moves only if the repo does)
