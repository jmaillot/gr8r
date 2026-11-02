# Phase 33: Membership-Surface Hardening - Research

**Researched:** 2026-11-02
**Domain:** server.js invite/membership surface — sameOrigin guard adoption, role-escalation closure, fail-closed workspace resolution, body whitelisting, proxy-header discipline
**Confidence:** HIGH (every claim below verified against the live source this session; no external packages involved)

## Summary

Phase 33 is pure hardening of existing routes in a single file (`server.js`) plus test pins. No new packages, no migrations, no schema changes, no new user-facing strings — every error code this phase emits (`crossOriginRejected`, `workspaceGone`, `inviteAlreadyUsed`, `inviteExpired`) already exists in both `src/locales/en.json` and `src/locales/fr.json` `[VERIFIED: src/locales/en.json:1561,1599,1604 / fr.json:1561,1599,1604]`. The i18n gate is trivially green. The milestone invariants (additive-migrations-only, zero runtime deps, 803-test baseline) are untouched by design.

All five hardenings are small, surgical edits to code that was read this session. The current state at each integration point:

- **Accept route** (`server.js:4385-4475`): POST `/api/invites/:token/accept`. Today it throttles FIRST (`tooMany` at :4387) with no sameOrigin guard, reads the body at :4396, and resolves the workspace at :4423 with a `|| firstWorkspace()` fallback `[VERIFIED: server.js:4385-4424]`.
- **SSO-reconcile twin** (`server.js:2832-2877`): resolves at :2842 with the same `|| firstWorkspace()` fallback and silently skips membership when `!ws` (:2843), leaving the invite pending — a zombie link `[VERIFIED: server.js:2842-2871]`.
- **Invite-creation route** (`server.js:4217-4313`): validates role via `inviteRole()` (:4224, maps guest→viewer, defaults to member), has the `emails: [null]` link-only branch (:4289), and contains the expired-invite cleanup `delete from invites where expires_at < ?` at :4288 `[VERIFIED: server.js:4217-4313]`.
- **Header readers**: `proto()` :2426-2429 and `clientIp()` :2453-2456 already split on commas and take the first value; `sameOrigin()` :2458-2463 reads `x-forwarded-host` raw (no comma split) `[VERIFIED: server.js:2426-2463]`.

**Primary recommendation:** Five pin-sized tasks — (1) sameOrigin guard first on the accept route (D-08 order: sameOrigin → throttle → token lookup → body read), (2) creation-side 400 + accept-side refusal for admin/owner link-only invites (D-01) plus the legacy-row sweep (D-02), (3) both `firstWorkspace()` twins resolve explicitly in ONE commit — accept fails `410 workspaceGone`, the SSO twin consumes the invite and lands on the generic `ssoError` surface (D-03/D-04/D-05), (4) explicit `{name, email, password}` destructuring + spoof test (D-06), (5) shared `firstForwardedValue()` helper consumed by `proto()`, `clientIp()`, `sameOrigin()` (D-07).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Admin link-only invite mechanism (HARD-02)**
- **D-01:** Defense in depth — the admin-via-link-only block lives at BOTH ends: the invite-creation route rejects with 400 when role is admin/owner AND email is null, AND the accept route refuses to grant an admin role from an email-less invite row. Both enforcement points are test-pinned.
- **D-02:** Existing admin link-only invites already in the database are neutralized by a boot-time sweep (next to the existing expired-invite cleanup) that marks them used_at = now. No schema change, no migration — additive migrations stay reserved for Phase 34's byte-identical-second-boot burden.

**SSO twin failure semantics (HARD-03)**
- **D-03:** The SSO-reconcile twin (server.js:2842) stops silently skipping a missing workspace: it resolves the workspace explicitly; if the row is gone it CONSUMES the invite (used_at = now, never retried) and continues the login through the generic error landing. No silent skip, no cross-tenant join.
- **D-04:** The failed reconcile reports through the existing one-generic `ssoError` surface (Phase-30 decision) — no new error code. — **Reversibility:** reversible — reusing the existing surface adds no contract; a distinct code could be added later.
- **D-05:** The accept route's failure is already locked: resolve first, missing row ⇒ `410 workspaceGone` (never `firstWorkspace()`). Both twins change in ONE commit (roadmap-locked); the read-path `firstWorkspace()` uses (:2235) and the seed-boot call site (:1716) are untouched.

**Body whitelist strictness (HARD-04)**
- **D-06:** Silent whitelist — the accept route destructures exactly `{name, email, password}` and discards everything else. Unknown fields are NOT rejected with 400 (avoids breaking future client fields and a schema probe). The spoof test pins that smuggled keys (role, teams, scope, name-on-session-accept) never influence the acceptance outcome.

**Proxy-header unification (HARD-05)**
- **D-07:** A small shared `firstForwardedValue(header)` helper implements the first-value discipline and is consumed by `proto()` (:2427), `clientIp()` (:2454) and `sameOrigin()` (:2461 — today it reads `x-forwarded-host` raw, without splitting on commas). One definition, one place to test.

**Guard ordering (HARD-01) — settled without discussion**
- **D-08:** The accept route adopts the house Pitfall-22 order already pinned at :3471/:4162: sameOrigin FIRST, before any body read or throttle (the route today throttles at :4387 before any guard).

### the agent's Discretion
- Exact helper naming/signature (`firstForwardedValue` is a suggestion).
- Which smuggled keys the spoof test enumerates (role/teams/scope minimum).
- Test file placement (existing server/auth test files vs a new hardening file).
- Exact boot-sweep placement and wording of its log line.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HARD-01 | Invite-accept route guarded by existing `sameOrigin()` — same discipline as ~35 routes | Guard site pattern verified at server.js:3471-3472 and :4166 (`fail(res, 403, 'crossOriginRejected', ...)`); accept route currently unguarded, throttles first at :4387. WR-07 test pattern (test/error-codes.test.mjs:476-499) is the exact pin template. |
| HARD-02 | Link-only admin invites impossible server-side, test-pinned | Creation route role+emails handling verified at :4224/:4289; accept grants `invite.role` verbatim at :4429. `ROLE_RANK` exists (:4264 uses it). Boot sweep home near :4288 cleanup (see Pitfall 1 re: placement). |
| HARD-03 | `firstWorkspace()` fallback removed from accept route and SSO twin in one commit; explicit resolution or fail closed | Both fallback sites verified at :4423 and :2842; protected sites :1716 (seed boot), :2235 (read path), :594 (definition), :4891 (slug route) must be untouched. `workspaceGone` 410 already exists at :4424. |
| HARD-04 | Spoof payload (role/name smuggling) rejected — body whitelist pinned by test | Accept body currently reads only `body?.name/email/password` (:4405-4409) and role/teams/scope come solely from the invite row (:4429-4446, SCOPE-05 comment) — the behavior is already correct; the change is explicit destructuring (D-06) + a test that makes it impossible to regress. |
| HARD-05 | `sameOrigin()` and proxy-header readers agree on first-value `x-forwarded-*` discipline, pinned by test | `proto()` :2427 and `clientIp()` :2454 split first-value; `sameOrigin()` :2461 reads `x-forwarded-host` raw. D-07 unifies via shared helper. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| sameOrigin guard on accept | API/Backend (server.js route) | — | CSRF defense is server-side; the SPA client already sends same-origin requests |
| Admin link-only invite block | API/Backend (creation + accept routes) | Boot bootstrap (sweep) | Server-side authority; sweep is a boot-time data hygiene step |
| Fail-closed workspace resolution | API/Backend (both twin routes) | — | Tenancy boundary enforced in the request path |
| Accept body whitelist | API/Backend (accept route) | — | D-06 silent destructure; client is never trusted |
| Proxy-header discipline | API/Backend (header readers) | — | `TRUST_PROXY` opt-in is documented at server.js:24 (`TRUST_PROXY=false opt-in: read X-Forwarded-* (set true behind Traefik)`) `[VERIFIED: server.js:24,78]` |

No frontend work, no e2e/Playwright work. All changes are in `server.js` + `test/*.test.mjs`.

## Standard Stack

### Core

No new packages. This phase uses only what exists:

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| node:test runner | Node built-in | All 60 test files use it; `npm test` = `node --test --test-concurrency=2 test/*.test.mjs` `[VERIFIED: package.json:18]` | zero-dependency invariant |
| node:sqlite DatabaseSync | Node built-in | Direct DB assertions in tests (e.g. scope.test.mjs reads `security_log` via DatabaseSync) `[VERIFIED: test/helpers/server.mjs:10]` | tests boot the real server + DB |
| test/helpers/server.mjs harness | in-repo | Spawns a real server.js per suite on an ephemeral port with its own DATA_DIR `[VERIFIED: test/helpers/server.mjs:1-95]` | the only sanctioned integration-test method |

### Alternatives Considered
None — no stack decisions are open. D-01..D-08 are locked.

**Installation:** Nothing to install. No package legitimacy audit required (zero new external packages; zero-dependency invariant pinned by test/dependencies.test.mjs).

## Architecture Patterns

### System Architecture Diagram

```
Attacker POST /api/invites/:token/accept
        │
        ▼
[NEW 1] sameOrigin(req)  ──✗──▶ 403 crossOriginRejected   (before throttle/body: D-08)
        │ ✓
        ▼
     tooMany(invite|ip) ──over──▶ 429 tooManyAttempts
        │
        ▼
     invite lookup (token_hash) ──missing/used/expired──▶ 404/410 (unchanged)
        │
        ▼
[NEW 2] body destructure {name,email,password} ONLY (D-06 silent whitelist;
        smuggled role/teams/scope are discarded by construction — spoof test pins outcome)
        │
        ▼
[NEW 3] accept-side admin refusal: invite.role is admin/owner AND invite.email is null
        ──▶ refuse (D-01, second enforcement point)
        │
        ▼
     ws = select from workspaces where id = invite.workspace_id
        │                                    (firstWorkspace() fallback DELETED)
        ├─ missing ──▶ 410 workspaceGone (D-05, code already exists at :4424)
        ▼
     addMembership(ws, user, invite.role, invite.teams, invite.scope)  (SCOPE-05 unchanged)
        │
        ▼
     invite-clearing writes + session establish (unchanged)

SSO twin (server.js:2832-2877, same commit — D-05):
     pendingInvites.length === 1
        ▼
     ws = select by invite.workspace_id (fallback DELETED)
        ├─ missing ──▶ consume invite (used_at = now) + continue login to
        │              generic ssoError landing (D-03/D-04) — no silent skip,
        │              no membership write
        ▼
     addMembership VERBATIM recipe + clearing writes (unchanged)

Boot (D-02):
     sweep: update invites set used_at = now
     where email is null and role in ('admin','owner') and used_at is null
     (placed next to the existing expired-invite cleanup; log line at discretion)

Invite-creation route (D-01, first enforcement point):
     role in ('admin','owner') AND emails resolved to link-only [null]
        ──▶ 400 reject BEFORE insert
```

### Recommended Project Structure
No new files required. Edits:
```
server.js                      # all five hardenings
test/                          # new pins — placement at agent's discretion:
├── membership.test.mjs        # existing accept-path tests live here (candidates)
├── error-codes.test.mjs       # WR-07 sameOrigin pin pattern lives here (:476-499)
├── oidc-sso.test.mjs          # SSO-07 twin tests live here (:665-694)
└── scope.test.mjs             # SCOPE-05 accept semantics; owns the accept-budget ledger (:3)
```
A single new `test/hardening.test.mjs` is equally acceptable (discretion area) — precedent: suites are one-topic-per-file (tfa-login, operator-revoke, file-route-ordering).

### Pattern 1: The Pitfall-22 guard order (house style)
**What:** sameOrigin → requireUser/tier → throttle → body read. Pinned with the comment `// Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.` at :3471 and the prose mirror at :4159-4163.
**When to use:** Every mutation route; D-08 adopts it for the accept route.
**Example:**
```js
// Source: server.js:3470-3485 (verbatim house pattern)
if (pathname === '/api/auth/tfa/login' && method === 'POST') {
  // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  ...
  if (tooMany(`2fa-login|${clientIp(req)}|${challenge.email}`, 5, 15 * 60 * 10000))
    return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  const body = await readJson(req);
```

### Pattern 2: The WR-07 sameOrigin pin (test template)
**What:** raw `fetch` with a hostile `Origin: https://evil.example`, asserting 403 + `crossOriginRejected` + byte-identical message + exactly `{code, error}` keys, plus a positive control that the Origin-less harness client still passes.
**Example:**
```js
// Source: test/error-codes.test.mjs:476-499 (verbatim)
const res = await fetch(`${server.base}${pathname}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
  body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password, name: 'Evil' }),
});
assert.equal(res.status, 403);
const data = await res.json();
assert.equal(data.code, 'crossOriginRejected');
assert.equal(data.error, 'Cross-origin request rejected');
assert.deepEqual(Object.keys(data).sort(), ['code', 'error']);
```

### Pattern 3: Multi-value header first-value split (what the helper generalizes)
```js
// Source: server.js:2426-2429 and :2453-2456 (verbatim)
function proto(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-proto']) return String(req.headers['x-forwarded-proto']).split(',')[0].trim();
  return req.socket.encrypted ? 'https' : 'http';
}
function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
// sameOrigin at :2458-2463 — the odd one out:
const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host;
// NOTE: no .split(',')[0].trim() — this is exactly the HARD-05 gap D-07 closes.
```

### Anti-Patterns to Avoid
- **Touching the protected `firstWorkspace()` call sites:** :1716 (`ensureAdmin` seed boot — legitimate: brand-new DB has exactly one workspace), :2235 (read path — out of scope per D-05), :594 (definition), :4891 (slug-redirect route, no invite context). Only :4423 and :2842 change `[VERIFIED: grep, all 7 firstWorkspace occurrences read this session]`.
- **Rejecting unknown accept-body fields with 400:** D-06 locks the silent whitelist — a 400 on unknown keys would (a) break future client fields, (b) hand attackers a schema probe. Smuggled keys must be discarded by construction.
- **Parallel membership insert in the SSO twin:** T-30-11 requires the verbatim accept recipe; the twin must keep using `addMembership` with the invite row's stored values (:2844-2865), only changing workspace resolution.
- **Adding new error codes:** D-04 pins the generic `ssoError` surface; no new codes anywhere in this phase (all needed codes exist and are catalogued EN+FR).
- **Schema changes / migrations for the D-02 sweep:** it is an `update ... set used_at` — migrations stay reserved for Phase 34.
- **`transition`-style opportunistic refactors** of nearby code (per global AGENTS.md): note observations, don't touch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test server + DB isolation | Custom spawn/mock logic | `startServer()` from test/helpers/server.mjs | Real boot path proven, ephemeral ports/DATA_DIR, owned cleanup |
| Cross-origin / header manipulation in tests | Custom HTTP client | raw `fetch` with explicit `origin`/`x-forwarded-*` headers (WR-07 and tfa-login raw() patterns) | Harness client sends NO Origin — which is exactly why sameOrigin passes it |
| Invite token extraction from URL | Regex by hand per test | existing `inviteToken()` helper used in locale-account/scope tests `[VERIFIED: test/locale-account.test.mjs:29, test/scope.test.mjs:68]` | one parser, already battle-tested |
| First-value header parsing | Per-site inline `.split(',')[0].trim()` | one `firstForwardedValue(header)` helper (D-07) | three call sites, one test target |

**Key insight:** The entire phase is composed of existing house primitives — `sameOrigin()`, `fail()`, `ROLE_RANK`, `addMembership`, the WR-07 test pattern, the harness. The implementation risk is regression (touching protected sites, breaking the 803-test baseline), not invention.

## Common Pitfalls

### Pitfall 1: The "boot-time sweep" home is not actually at boot
**What goes wrong:** CONTEXT D-02 says "next to the existing expired-invite cleanup", which reads as a boot block — but the only `delete from invites where expires_at < ?` is at **:4288, inside the invite-creation route's transaction**, not at boot `[VERIFIED: server.js:4288 + grep for boot cleanup]`. The actual boot-cleanup block is sessions/login-challenges at :4937-4941.
**Why it happens:** The discuss-phase quote generalized the cleanup's location.
**How to avoid:** Planner picks placement explicitly (it's an agent-discretion item): either (a) the boot cleanup region near :4937-4941 inside the periodic-cleanup block, or (b) inside `bootstrap()` next to `ensureAdmin()`. Either satisfies D-02 ("boot-time"). Recommend (a) — it runs unconditionally at boot where the session cleanup already runs.
**Warning signs:** A sweep placed in a route only runs when an admin happens to create an invite — not "boot-time".

### Pitfall 2: The accept throttle budget is a shared, scarce test resource
**What goes wrong:** The accept budget is `invite|<ip>`, 5 per hour per IP (`tooMany('invite|' + clientIp(req), 5, 3600000)` at :4387). Each spawned test server has its own DB but tests on one server share the IP `127.0.0.1`; scope.test.mjs explicitly ledgers its accepts ("1 of 5 accept budget", :3, :65, :414) `[VERIFIED: test/scope.test.mjs:1-70]`.
**Why it happens:** New accept tests on a suite that already spends accepts can tip over 5/hour → flaky 429s.
**How to avoid:** New pins should spawn their OWN server (standard harness pattern — every suite gets a fresh budget) or ledger accepts in the suite comment like scope.test.mjs does. Spoof-test and cross-origin-rejection tests that expect 403/410 BEFORE grant still matter: 403 sameOrigin rejections no longer consume budget (guard runs first — that's D-08's other benefit, and WR-07 already documents this property for login).
**Warning signs:** Intermittent 429 `tooManyAttempts` in CI only.

### Pitfall 3: The harness client sends no Origin — sameOrigin passes it
**What goes wrong:** A planner might assume existing accept tests will start failing once the guard lands.
**How to avoid:** `sameOrigin()` returns true when `req.headers.origin` is absent (:2460, `// curl / non-browser clients` comment). The harness `client()` sets only cookie/content-type headers `[VERIFIED: test/helpers/server.mjs:100-115]`, so all ~existing accept tests keep passing unmodified. Only tests that deliberately send a hostile Origin (WR-07 pattern) see 403.

### Pitfall 4: The ONE-COMMIT constraint for the twins (D-05, roadmap-locked)
**What goes wrong:** Splitting the :4423 and :2842 edits across commits leaves one twin fail-open while the other is closed.
**How to avoid:** The planner must structure the twin fix as a single task/commit. The other edits (guard, admin block, whitelist, helper) can be their own atomic commits. Suggested commit split: (1) HARD-05 helper + adoption, (2) HARD-01 guard, (3) HARD-03 twins (both), (4) HARD-02 creation+accept+sweep, (5) HARD-04 destructure+spoof pin — or any split that keeps :4423+:2842 together.

### Pitfall 5: The SSO twin's new consume-path must not write a membership or leak state
**What goes wrong:** Making the twin "fail closed" could accidentally (a) insert a membership with a wrong workspace, (b) clear the OTHER pending invites for the address (the :2869 clearing write is scoped to `ws.id` — with ws gone, skip it), or (c) bypass the generic `ssoError` landing.
**How to avoid:** The consume path is exactly: `update invites set used_at = ?, used_by = ? where token_hash = ?` for the one invite, then continue the normal login flow toward the generic error surface. Do NOT run the address-wide clearing write (:2869) when ws is missing (no ws.id to scope it to); do NOT call `logSecurity('sso_invite_accepted')` — that verb would be a lie. Consider whether a distinct log verb is wanted; D-04 forbids a new error code but a security-log verb is an honest option at planner discretion (keep it minimal — no new user-facing string).
**Warning signs:** `sso_invite_accepted` in security_log for an invite whose workspace no longer exists.

### Pitfall 6: Role comparison must include owner, not just admin
**What goes wrong:** D-01/D-02 say "admin role", but the role ladder includes owner above admin (`ROLE_RANK` used at :4264; memberships check `role in ('owner','admin')` at :599).
**How to avoid:** The creation-side 400 and the accept-side refusal must block BOTH `admin` and `owner` on an email-less invite (owner is always workspace-creator-scoped; a link-only owner invite is strictly worse). Note `inviteRole()` never maps anything to 'owner' (:2446-2451 returns only admin/member/viewer), so owner link-only rows could only predate that mapping — exactly the legacy-row case D-02 sweeps. Match the house idiom `role in ('owner','admin')` `[VERIFIED: server.js:599]`.

### Pitfall 7: TRUST_PROXY gating means the HARD-05 pin needs two server configs
**What goes wrong:** A first-value test without `TRUST_PROXY=true` exercises nothing — all readers ignore x-forwarded-* when TRUST_PROXY is false.
**How to avoid:** Spawn with `startServer({ env: { TRUST_PROXY: 'true' } })` for the header-discipline suite (harness supports arbitrary env overrides `[VERIFIED: test/helpers/server.mjs:35-44]`). With TRUST_PROXY true, `sameOrigin` compares `origin` against `proto://first-forwarded-host` — a request with `x-forwarded-host: real.host, evil.host` must behave identically to one with `x-forwarded-host: real.host`.

## Code Examples

### HARD-01 — guard adoption (accept route head, after change)
```js
// Based on verbatim house pattern: server.js:3470-3472, :4165-4170; current route: server.js:4385-4387
const acceptMatch = pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{16,128})\/accept$/);
if (acceptMatch && method === 'POST') {
  // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  if (tooMany(`invite|${clientIp(req)}`, 5, 60 * 60 * 1000)) { ... }  // unchanged
```

### HARD-03 — accept twin, fail closed
```js
// Current: server.js:4423-4424
const ws = db.prepare('select * from workspaces where id = ?').get(invite.workspace_id) || firstWorkspace();
if (!ws) return fail(res, 410, 'workspaceGone', 'This workspace no longer exists');
// After: drop the "|| firstWorkspace()" — the 410 body already exists and is correct.
```

### HARD-03 — SSO twin, consume + generic landing (D-03/D-04)
```js
// Current: server.js:2842-2843
const ws = db.prepare('select * from workspaces where id = ?').get(invite.workspace_id) || firstWorkspace();
if (ws) { ...addMembership verbatim recipe... }
// After: explicit resolve; on miss consume the invite and skip to the normal
// (generic ssoError) landing — no membership write, no address-wide clearing
// write (no ws.id to scope it), no sso_invite_accepted log verb.
const ws = db.prepare('select * from workspaces where id = ?').get(invite.workspace_id);
if (!ws) {
  db.prepare('update invites set used_at = ?, used_by = ? where token_hash = ?').run(now(), row.id, invite.token_hash);
  // fall through to the existing generic-error landing; no other writes
}
```
(Exact wiring into the existing SSO error surface is plan work; the Phase-30 one-generic-ssoError decision governs.)

### HARD-04 — silent whitelist (D-06)
```js
// Current reads at server.js:4405-4409 are already field-scoped; make it structural:
const { name: rawName, email: rawEmail, password } = body || {};
const name = String(rawName || '').trim();
const email = String(rawEmail || '').trim().toLowerCase();
// role/teams/scope continue to come ONLY from the invite row (:4429-4446) — unchanged.
```

### HARD-05 — shared first-value helper (D-07)
```js
// Consolidates the verbatim pattern at server.js:2427, :2434, :2454; fixes :2461.
function firstForwardedValue(req, header) {
  const raw = req.headers[header];
  return raw ? String(raw).split(',')[0].trim() : '';
}
// proto(): if (TRUST_PROXY && firstForwardedValue(req, 'x-forwarded-proto')) return that
// clientIp(): if (TRUST_PROXY && firstForwardedValue(req, 'x-forwarded-for')) return that
// sameOrigin(): const host = (TRUST_PROXY && firstForwardedValue(req, 'x-forwarded-host')) || req.headers.host;
```
(Signature/naming at agent discretion; the requirement is: one definition, consumed by all three, first-value semantics identical to today's proto/clientIp.)

### HARD-02 — creation-side rejection (D-01, first point)
```js
// After role resolution at server.js:4224 and email normalization at :4268-4279,
// before the insert loop at :4286:
if (ROLE_RANK[role] >= ROLE_RANK.admin && (emails.length === 0)) {
  return fail(res, 400, 'inviteRoleEmailRequired', 'Admin invites require an email address');
}
```
⚠️ This example invents an error code. **All existing 4xx codes are catalogued EN+FR and the i18n-scan gate polices new strings** — the planner must either (a) reuse an existing fitting code, or (b) add the new code to BOTH locale files (the gate then requires EN+FR). Check `src/locales/en.json` and test/error-codes.test.mjs conventions before locking. Flagged as the phase's only likely new-string decision.
- Correction on reuse feasibility: candidates like `emailRequired`/`invalidEmail` may exist — verify in `src/locales/en.json` at plan time.

### HARD-02 — legacy-row sweep (D-02)
```js
// Boot-time, next to the expired cleanup (see Pitfall 1 for placement):
db.prepare("update invites set used_at = ? where email is null and role in ('owner','admin') and used_at is null").run(now());
```
Update only — no delete, no schema change, matches "marks them used_at = now" verbatim from D-02.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Accept route throttled first, unguarded | Pitfall-22 order house-wide | WR-07 (v1.5) pinned login/signup; :3471/:4162 show the settled order | Phase 33 closes the last unguarded mutation surface |
| Twin silently skips dead workspace | Fail-closed / consume | This phase (D-03) | Zombie invite links eliminated |
| Per-site header splitting | Shared `firstForwardedValue` | This phase (D-07) | One test target for HARD-05 |

**Deprecated/outdated:** None relevant — no library or framework churn; this is all in-house discipline.

## Runtime State Inventory

**Trigger check:** Phase involves no rename/rebrand, but D-02 explicitly targets **stored data** — inventoried anyway.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Legacy link-only admin/owner invite rows: `invites where email is null and role in ('admin','owner') and used_at is null`. Verified schema: `invites.email` nullable (link-only branch inserts `null` at :4289), `role` check constraint `in ('admin','member','viewer')` per test/helpers/legacy-fixture.mjs legacy schema `[VERIFIED: test/helpers/legacy-fixture.mjs invites DDL]` — note the check constraint names admin/member/viewer (owner may be impossible to store today; the sweep's `in ('owner','admin')` is harmless belt-and-braces) | D-02 boot-time update sweep (`used_at = now`), no migration |
| Live service config | None — no external services hold invite state | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no env var names change | None |
| Build artifacts | None — no rename, no rebuild needed | None |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `invites.role` check constraint may not admit 'owner' (legacy fixture DDL shows `in ('admin','member','viewer')`); the live production schema may differ | Runtime State Inventory, Pitfall 6 | Cosmetic — sweep's `in ('owner','admin')` is safe either way; creation-side block keyed on ROLE_RANK covers both |
| A2 | Placing the D-02 sweep in the boot cleanup region (:4937-4941 area) is what D-02 intends by "boot-time" | Pitfall 1 | Low — both candidate placements satisfy the decision; either is defensible |
| A3 | The exact SSO twin consume-path wiring (how "continue the login through the generic error landing" maps onto the code after :2878) | Pitfall 5, HARD-03 example | Medium — plan should read :2878-2900 (post-reconcile flow) before locking the exact jump; the D-03/D-04 semantics are fixed, only the wiring is open |
| A4 | A new error code for the creation-side 400 (or reuse of an existing one) — the phase's only possible new EN+FR string | Code Examples (HARD-02) | Low — i18n gate catches it; decide at plan time |

All other claims: `[VERIFIED: server.js + test/ — file and line cited inline]`.

## Open Questions

1. **Creation-side 400: new code vs reuse?**
   - What we know: all codes in use today are catalogued EN+FR; D-01 only says "rejects with 400".
   - What's unclear: whether a fitting existing code exists (e.g. an emailRequired-family code).
   - Recommendation: planner greps `src/locales/en.json` for an existing err.* key; add a new key to both locales only if none fits (i18n-scan gate will enforce).

2. **Post-reconcile landing wiring for the SSO twin (A3).**
   - What we know: D-03/D-04 fix the semantics (consume + generic ssoError landing); code after :2878 continues the OIDC callback.
   - What's unclear: whether the existing error landing is reachable by a simple fall-through or needs a small redirect/flag.
   - Recommendation: plan task should read server.js:2878-2920 and mirror how the existing generic error path is entered today.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node --test runner | Full suite / new pins | ✓ | `npm test` script verified in package.json:18 | — |
| Node runtime | server.js + tests | ✓ | harness spawns `process.execPath` | — |
| Playwright | NOT required this phase | n/a | present (dev dep) but no e2e work | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.
(No package installs; zero-dependency invariant untouched.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node built-in), suites spawn real servers via test/helpers/server.mjs |
| Config file | none — `npm test` globs `test/*.test.mjs` `[VERIFIED: package.json:18]` |
| Quick run command | `node --test --test-concurrency=2 test/hardening.test.mjs` (or the chosen pin file) |
| Full suite command | `npm test` (803-test baseline must stay green) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HARD-01 | Hostile-Origin POST to /api/invites/:token/accept → 403 crossOriginRejected, byte-identical body; positive control (no Origin) passes | integration | `node --test test/hardening.test.mjs` (WR-07 template, error-codes.test.mjs:476-499) | ❌ Wave 0 |
| HARD-01 | Guard-before-throttle: a hostile-Origin POST does not consume the invite\|ip budget (probe 6x hostile, then a legit accept still passes) | integration | same | ❌ Wave 0 |
| HARD-02a | Creation: admin invite with no emails → 400 (D-01 point 1) | integration | same | ❌ Wave 0 |
| HARD-02b | Accept: email-less invite row with admin role refuses to grant admin (D-01 point 2; seed the row directly via DatabaseSync to bypass creation) | integration | same | ❌ Wave 0 |
| HARD-02c | Boot sweep: legacy email-null admin invite row has used_at set after boot | integration | same (needs reboot against same dataDir — harness supports explicit dataDir) | ❌ Wave 0 |
| HARD-03a | Accept with invite.workspace_id pointing at a deleted workspace → 410 workspaceGone, no membership row, no firstWorkspace join | integration | same | ❌ Wave 0 |
| HARD-03b | SSO twin with deleted workspace → invite consumed (used_at set), NO membership row, login lands on generic error surface; pinned in the same commit's tests as HARD-03a | integration | `node --test test/oidc-sso.test.mjs` (extends SSO-07 tests at :665-694) | ❌ Wave 0 |
| HARD-04 | Spoof payload `{role:'admin', teams:[...], scope:{...}, name:'X'}` in accept body: outcome identical to clean payload; granted role/teams/scope come only from the invite row | integration | same | ❌ Wave 0 |
| HARD-05 | TRUST_PROXY=true server: `x-forwarded-host: a.com, evil.com` on sameOrigin behaves as first value; proto/clientIp unchanged behavior (regression pin) | integration | same (own server, env TRUST_PROXY:'true') | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run of the pin file (or the touched suite)
- **Per wave merge:** `npm test` full suite
- **Phase gate:** full 803+ baseline green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Pin file placement decision (new `test/hardening.test.mjs` vs extending membership/error-codes/oidc-sso suites) — discretion area, decide at plan time
- [ ] TRUST_PROXY-enabled server config for HARD-05 pins
- [ ] Direct DatabaseSync row-seeding pattern for HARD-02b/02c (bypassing the (soon-blocked) creation route)

*(No framework install needed — infrastructure exists.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (tangential) | existing session/createUser flows — untouched this phase |
| V3 Session Management | no | no session logic changes |
| V4 Access Control | yes | D-01 both-endpoint admin block; ROLE_RANK ladder; SCOPE-05 admin-validated values only |
| V5 Input Validation | yes | D-06 silent body whitelist; existing emailOk/password policy unchanged |
| V6 Cryptography | no | sha256 token hashing unchanged |
| CSRF / Origin integrity | yes | sameOrigin guard (HARD-01); no CSRF token synchronizer (explicitly out of scope per REQUIREMENTS.md) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Login/accept CSRF via hostile Origin | Tampering | sameOrigin guard before throttle/body (Pitfall-22 order) |
| Privilege escalation via link-only admin invite | Elevation of Privilege | D-01 both endpoints + D-02 legacy-row sweep |
| Cross-tenant join via firstWorkspace() fallback | Elevation of Privilege | D-05 explicit workspace_id resolution, fail closed |
| Role/name smuggling in accept body | Tampering | D-06 silent destructure whitelist + outcome-pinning test |
| Header smuggling via multi-value x-forwarded-* | Spoofing | D-07 first-value discipline unified in one helper, test-pinned |

## Sources

### Primary (HIGH confidence)
- server.js read this session: :24-78 (TRUST_PROXY), :594-596 (firstWorkspace def), :1716 (seed boot), :2235 (read path), :2426-2463 (proto/publicBase/clientIp/sameOrigin), :2820-2878 (SSO twin), :3470-3489 (Pitfall-22 pattern), :4145-4172 (admin revoke order), :4210-4313 (invite creation), :4380-4478 (accept route), :4891, :4937-4941 (boot cleanup)
- test/ read this session: helpers/server.mjs (harness, env overrides, Origin-less client), error-codes.test.mjs:470-499 (WR-07 pin), scope.test.mjs:1-70 (accept budget ledger), oidc-sso.test.mjs:665-694 (SSO-07 twin tests), helpers/legacy-fixture.mjs (legacy invites DDL)
- package.json:18 (test script)
- src/locales/en.json + fr.json:1561,1599,1604 (error-code cataloguing)

### Secondary (MEDIUM confidence)
- None needed — all claims from primary source.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nothing to install; harness and runner verified in-repo
- Architecture: HIGH — every integration point read verbatim; line numbers from CONTEXT.md confirmed accurate (one placement nuance documented as Pitfall 1)
- Pitfalls: HIGH — budget, Origin-less harness, one-commit constraint, role-ladder, TRUST_PROXY gating all verified in source

**Research date:** 2026-11-02
**Valid until:** 2026-12-02 (stable — single-file in-house code, no external churn)
