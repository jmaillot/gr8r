# Phase 78: Creation Gate & Instance-Owner Identity - Research

**Researched:** 2026-11-19
**Domain:** env-gated authorization (workspace creation), instance-operator identity (multi-seat flag), client post-auth await flow
**Confidence:** HIGH (all findings read directly from source this session)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- `WORKSPACE_CREATION=true|false` — boolean tokens ONLY; strict matching (exactly `true` or `false` lowercase; no aliases, no `''`, no whitespace, no `TRUE`) → boot-refuse otherwise with error naming the variable and the two valid values.
- Unset default = `false` (fail-closed). Upgrade behavior change must be called out in docs.
- Boot log line (D-11 style, adjacent to door-matrix log) with resolved value + effective meaning, e.g. `workspace creation: closed (operator-only)`.
- Gate `true` = any authenticated user; `false` = `isInstanceAdmin(user)` ONLY (never `hasAdminRole`; workspace owner/admin roles do NOT pass). Supersedes `ALLOW_SIGNUP`-derived coupling at server.js:6811.
- `ALLOW_SIGNUP` continues to govern account signup only (server.js:6758) — untouched.
- Rejected users get a new keyed refusal, rendered in all 5 locales in the SAME commit (WSG-11).
- Creator still becomes workspace `owner` in both modes.
- Multi-operator allowed; `stampInstanceAdmin()` seeding unchanged; `--add-user` does NOT auto-flag.
- Promote/demote in existing operator console (`operatorCard`), new operator-gated endpoints (D-121 pattern), audit-logged, last-operator demotion refused with keyed error (needOwner pattern). D-114 manual DB update stays as break-glass fallback in DEPLOY.md.
- Await-access: standalone page (no app shell), message "need to be invited to a workspace", sign-out button, 15 s auto-poll visible-tab only (visibilitychange paused), stops when membership or rights appear → normal app entry. Endpoint choice (reuse `GET /api/workspaces` vs lighter probe) = planner discretion.
- Create-button visibility follows `/api/config` gate value + `/api/me` `isInstanceAdmin`.
- `/api/config` `workspaceCreation` becomes the boolean gate value; client consumers updated in same commit.

### the agent's Discretion
- Refusal key name for the creation refusal (new key required; `operatorOnly` exists but a creation-specific key is cleaner).
- Await-page poll endpoint (reuse `GET /api/workspaces` vs lighter membership probe).
- Await-page route/view shape.

### Deferred Ideas (OUT OF SCOPE)
- Workspace settings editing (rename/slug) from governance page — Phase 79
- Approval queue — future milestone
- Per-workspace creation quotas — future milestone
</user_constraints>

## Summary

This phase is a small-diff, high-surface phase: one env parse + boot log, one condition swap in `POST /api/workspaces`, one `/api/config` field shape change, two new operator endpoints cloning the D-121 revoke-sessions pattern, operatorCard promote/demote actions, and a client await-access state. Critically, **most of the client scaffold already exists**: a `no-workspace` auth view (src/pages/auth.js:129-134) with sign-out already renders for rights-less users at main.js:402 and `enterNoWorkspace()` (actions.js) — the await-access page is an extension of this view with a poll loop, not a new surface.

Zero migrations needed: `users.is_instance_admin` exists in the schema (server.js:287) and the ensureColumn backfill (server.js:665). Zero new dependencies (standing constraint).

**Primary recommendation:** boot-frozen const parsed at the server.js:135 env zone (mirroring `ALLOW_SIGNUP` but boot-refusing), gate swap at server.js:6811, boolean `/api/config` field, promote/demote endpoints cloned from the revoke-sessions route (sameOrigin-first, `operatorOnly`, `db.tx` + audit row), extend the existing `no-workspace` auth view into the await page with a 15 s visible-only poll on `GET /api/workspaces`.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WSG-01 | Boolean env parse, strict tokens, boot-refuse, unset=false, boot log | server.js:135 env zone; D-06/D-11 boot lines at 8946-8952; domains.js tri-state precedent (boot-frozen consts, but here boot-REFUSE not warn-and-clean) |
| WSG-02 | POST /api/workspaces gate via isInstanceAdmin | server.js:6807-6832; isInstanceAdmin server.js:4838; fail() server.js:4682 |
| WSG-03 | /api/config exposes boolean | server.js:5020; client consumer src/core/api.js:175 + getter :157 |
| WSG-04 | Creator stays owner | createWorkspace at server.js:4640 area — untouched, no change needed |
| WSG-05 | Operator seeding unchanged, --add-user no flag | stampInstanceAdmin server.js:3542-3548; verify --add-user CLI does not touch the flag |
| WSG-06 | Console promote/demote + last-operator guard + audit | operator endpoints server.js:6685-6760 (D-121); audit_log insert pattern server.js:6723-6740; needOwner server.js:7121/7136; operatorCard settings.js:253-271 |
| WSG-10 | Await-access page + 15s visible-only poll + create-button gating | `no-workspace` view auth.js:129-134; hook points main.js:402 + enterNoWorkspace (actions.js); popover button overlays/popovers.js:262 → A.newWorkspace actions.js:3201 (already checks `api.canCreateWorkspace`); poll precedent pollNotifs main.js:111-126; visibilitychange precedent store.js:285 |
| WSG-11 | All new refusal keys in 5 locales same commit | test/error-codes.test.mjs (static fail() code extraction → err.<code> in en+fr); test/catalogue.test.mjs full en↔fr completeness; 5 catalogues en1950/fr1989/nl1949/de1949/es1949 keys; client maps code→locale via tErr (src/core/i18n.js:244) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Env parse + boot-refuse + boot log | API/Backend (server.js) | — | boot-time concern, fail-closed at startup |
| POST /api/workspaces gate | API/Backend | — | authorization is server-side only (client gating is cosmetic) |
| /api/config `workspaceCreation` | API/Backend | Client (api.js state) | server truth; client mirrors into `state.creation` |
| Promote/demote endpoints | API/Backend | — | operatorOnly gate, tx + audit row |
| operatorCard promote/demote UI | Browser/Client | API | settings.js + actions.js, reuses D-90 inline-confirm stage |
| Await-access page + poll | Browser/Client | API (probe) | SPA auth view; server already rejects creation |
| Create-button visibility | Browser/Client | — | cosmetic; server gate is the enforcement |

## Standard Stack

No new packages — standing constraint (PROJECT.md v3.1: zero new dependencies). Uses existing: node:http server router (server.js), node:test + test/helpers/server.mjs harness, Playwright e2e config (e2e/playwright.config.mjs), JSON locale catalogues + `t()`/`tErr()` (src/core/i18n.js).

## Architecture Patterns

### System Architecture Diagram

```
Boot: env WORKSPACE_CREATION ──strict parse──▶ valid? ──no──▶ logError + process.exit(1)  [boot-refuse]
                                    │yes (or unset→false)
                                    ▼
                     boot-frozen const + logInfo line (adjacent to door matrix, server.js:8952)

Request: POST /api/workspaces
   requireUser ──▶ sameOrigin (FIRST) ──▶ gate?
        gate=true  ──▶ any authenticated user ──▶ createWorkspace (owner role, unchanged)
        gate=false ──▶ isInstanceAdmin(user)? ──yes──▶ create
                                   └──no──▶ fail(403, '<newKey>')  ──▶ client tErr → localized toast

Operator console: operatorCard row ──▶ data-a operatorPromote/operatorDemote ──▶
   POST /api/auth/operator/users/:id/promote|demote
        sameOrigin FIRST ──▶ requireUser ──▶ operatorOnly ──▶ target lookup ──▶
        demote? last-operator count guard ──▶ db.tx(update users + audit_log row)

Client boot: /api/config.workspaceCreation:boolean + /api/me isInstanceAdmin ──▶
   canCreateWorkspace getter ──▶ popover button visibility + boot routing:
   no membership? ──▶ canCreate? 'onboarding' : 'await-access' (extended no-workspace view)
   await page: setInterval 15s ──▶ document.hidden? skip ──▶ GET /api/workspaces ──▶
   memberships appear or rights appear ──▶ enterApp() normal entry
```

### Pattern 1: Boot-frozen env const (server.js:135 zone)
**What:** parse at module top into a const, adjacent to `ALLOW_SIGNUP` (server.js:135). Unlike domains.js's warn-and-clean tri-state, this one must **throw/exit at boot** on invalid tokens — `main().catch` at server.js:8990 already logs and exits 1, so throwing during module eval or early in `main()` is the house mechanism; alternatively explicit `logError` + `process.exit(1)` before listen.
**Strict token rule:** `raw === undefined → false; raw === 'true' → true; raw === 'false' → false; else boot-refuse` — no trim, no case folding (trim alone changes `'' ` vs `' '` semantics; keep it exact).

### Pattern 2: Gate refusal (fail() helper)
`fail(res, status, code, message, extra)` (server.js:4682): `{ error, code, ...extra }`. Client maps `code` → `tErr(code)` → `t('err.'+code)` with English server message fallback (src/core/api.js:86, src/core/i18n.js:244). New key must land in all 5 catalogues same commit; test/error-codes.test.mjs automatically enforces en+fr presence for every `fail(res, N, 'x')` literal.

### Pattern 3: D-121 operator endpoint shape (clone for promote/demote)
Observed order in the revoke-sessions route (server.js:6703-6760) — **Pitfall 22: sameOrigin FIRST**, then requireUser, then throttle (`tooMany`, keyed on caller — refusals consume tries), then `isInstanceAdmin(operator)` → `operatorOnly`, then target lookup (404 no-oracle), then action inside `db.tx()` with the audit row written in the SAME transaction (AUD-01/D-R3). Audit insert is the 12-column literal at server.js:6723-6740 (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at). For promote/demote: no session_count relevance — the existing GET-list route (6685-6701) skips throttle and audit because it's read-only; promote/demote are writes → follow the POST shape (throttle optional, planner discretion; audit row REQUIRED per success criteria #4).

### Pattern 4: last-operator guard (needOwner analog, server.js:7121/7136)
`if (row.role === 'owner' && (await ownerCount(...)) === 0) return fail(res, 409, 'needOwner', ...)`. Instance analog: before demote, `select count(*) from users where is_instance_admin = 1` — if the target is flagged and count === 1, refuse with a new keyed 409 (e.g. `lastOperator`). Also: demote-self should be refused or allowed? The revoke route allows self-target (D-118) but demote-self of the last operator is caught by the guard; demote-self when OTHER operators exist is semantically fine — planner discretion, but the guard is the safety net either way.

### Pattern 5: operatorCard UI wiring (src/pages/settings.js:253-271)
Rows via `srow(left, meta, right)`; actions are `data-a="..." data-id="..."` buttons handled in `A.<name>` in src/actions/actions.js (revoke: A.operatorRevokeAsk at 2749, inline-confirm stage via `S.ui.operatorRevoke`, confirm at 2757 calling `api.operatorRevokeSessions` then `refreshOperatorUsers()` at 2735). Promote/demote: add a button on non-flagged rows (`operatorPromote`) and on flagged rows (currently only the immune/self hint — replace/add `operatorDemote`, possibly with the D-90 inline-confirm stage reusing `S.ui.operatorRevoke` or a parallel `S.ui.operatorDemote`). After action: `await refreshOperatorUsers()` re-render. New i18n keys under `settings.operator.*` namespace.

### Pattern 6: Await page = extend the existing `no-workspace` auth view
The scaffolding exists:
- View: `s === 'no-workspace'` in src/pages/auth.js:129-134 — authShell card, "noWorkspaceTitle/noWorkspaceBody" copy, signed-in-as panel, **sign-out button already present** (`data-a="signOut"`).
- Entry point 1 (boot): main.js:402 `S.ui.auth = api.canCreateWorkspace ? 'onboarding' : 'no-workspace'` when signed in with zero memberships.
- Entry point 2 (post-login/signup): `finishLogin` (actions.js:4000) → `enterNoWorkspace()` when no slug — actions.js:~4033 `S.ui.auth = api.canCreateWorkspace ? 'onboarding' : 'no-workspace'`.
- So the exact change: `canCreateWorkspace` getter must become gate-aware (below), and the `no-workspace` view gains the poll. Poll mechanism: setInterval 15s; **visible-tab only** — precedent: store.js:285 uses `document.addEventListener('visibilitychange')`; simplest conforming shape is a guard `if (document.hidden) return;` at the top of the tick (the 30s pollNotifs in main.js:111 shows the house tick pattern: guards, hydrate, memo-diff render). Poll action: `GET /api/workspaces` (server.js:6803-6806 — returns `userPayload(user).workspaces`, cheap enough) or a membership probe — reuse of GET /api/workspaces is recommended (no new endpoint, zero-dep, no new payload plumbing; `/api/me` also works since `api.me()` refreshes workspaces + isInstanceAdmin). On success (workspaces non-empty OR `api.user.isInstanceAdmin` OR gate now open): re-run the `canCreateWorkspace ? enter onboarding-flow : hydrate first workspace` logic (mirroring main.js:402-410 / enterNoWorkspace's happy path) — planner picks whether to full-reload or soft-enter; `hydrateFromServer(slug)` + `enterApp()` is the existing soft path in finishLogin.
- Naming: CONTEXT says "standalone await-access page"; this IS the standalone no-app-shell surface (authShell renders without app chrome). Rename the view key or keep `no-workspace` — planner discretion; keys `page.auth.noWorkspaceTitle/Body` may be reworded + a poll-hint key added (5 locales, same commit).

### Pattern 7: canCreateWorkspace must become gate-aware (client)
Current getter (src/core/api.js:157-159):
```js
get canCreateWorkspace() {
  return state.creation === 'open' || state.workspaces.some(w => w.role === 'owner' || w.role === 'admin');
}
```
and state adoption (api.js:175): `state.creation = r.data?.workspaceCreation === 'open' ? 'open' : 'admins'`.
New shape: server sends `workspaceCreation: <boolean>`; client stores `state.creation = !!r.data?.workspaceCreation`; getter becomes roughly `state.creation === true || state.user?.isInstanceAdmin || <legacy owner/admin path>` — note the current getter ALSO grants creation to workspace owners/admins, which the server gate (`false` = operators only) will now refuse. Per D-112 tenant-bound semantics, when gate is closed the getter must NOT pass workspace owner/admin — but when gate is OPEN anyone passes anyway, so the owner/admin clause becomes dead; recommend simplifying to `state.creation || state.user?.isInstanceAdmin`. Verify no other consumer relies on the old semantics: `grep canCreateWorkspace src/` → api.js getter + usages in main.js:402, enterNoWorkspace, A.newWorkspace (actions.js:3201 — already toasts `err.askAdmin` when false; that toast stays as the belt-and-braces path).

### Create-button visibility
The create item in the workspace-switcher popover (src/overlays/popovers.js:262) is currently ALWAYS rendered; gating lives in A.newWorkspace (toast on refusal). Success criterion #5 wants it hidden: wrap the `<button data-a="newWorkspace">` in a condition on the new getter (`api.canCreateWorkspace`). Verify popovers.js renders reactively off state (it does — `S.ui.pop` + render cycle).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Boot-fail on bad env | custom try/catch gymnastics | throw in main() → main().catch exits 1 (server.js:8988-8991) | existing mechanism, logError already wired |
| Operator-gated write endpoint | new gate helpers | clone D-121 route order (sameOrigin→requireUser→operatorOnly) | house-verified ordering, Pitfall 22 |
| Transactional audit write | hand-rolled BEGIN/COMMIT | `db.tx()` (AUD-01/D-R3, server.js:6723) | forced audit failure must roll back the action |
| Last-operator guard | new counting helper reuse | count query + keyed 409, needOwner shape (7121) | precedent with test coverage |
| Client poll loop | new timer lib | setInterval + `document.hidden` guard (pollNotifs main.js:111, visibilitychange store.js:285) | existing precedents |
| Localized refusal | server-side i18n | keyed code + client tErr (i18n.js:244) | the established pipeline |

## Runtime State Inventory

Rename/migration phases only — **N/A (greenfield behavior change, no rename)**. Migration check: **none needed** — `users.is_instance_admin integer not null default 0` exists in the schema DDL (server.js:287) AND the adapter backfill `adapterEnsureColumn('users','is_instance_admin','integer not null default 0')` (server.js:665) covers legacy DBs. Flag persists across restarts (plain column). Confirmed: no schema change required for multi-operator (the flag was never constrained to one row).

## Common Pitfalls

### Pitfall 1: sameOrigin ordering (Pitfall 22, house-named)
**What goes wrong:** reading the body or hitting the throttle before `sameOrigin(req)`.
**Avoid:** clone the exact order of the revoke-sessions route (server.js:6705-6707): sameOrigin FIRST, then requireUser, then throttle, then operator gate.

### Pitfall 2: isInstanceAdmin vs hasAdminRole
**What goes wrong:** reusing `hasAdminRole(user.id)` (server.js:947, membership-derived) — D-112 forbids it: workspace roles never pass the instance gate. Only `user.is_instance_admin === 1` (server.js:4838).
**Note:** requireUser returns the users row (is_instance_admin present) — isInstanceAdmin is directly callable in the route context (proven: the operator routes call it after requireUser).

### Pitfall 3: /api/config shape change breaking clients mid-deploy
**What goes wrong:** old client (`=== 'open'`) vs new server (boolean) → `state.creation` becomes 'admins' for everyone → create buttons vanish for operators until client deploys.
**Avoid:** ship both in same release window (single-repo app: server+client build together — same commit is sufficient here); the client's `!!r.data?.workspaceCreation` adoption handles both shapes if written tolerantly. Flag in the plan as a deploy note.

### Pitfall 4: unset ≠ empty
**What goes wrong:** treating `''` as unset. Contract: unset = `false` (valid, fail-closed); `''` = **boot-refuse** (invalid token). Strict presence comparison `process.env.WORKSPACE_CREATION === undefined` distinguishes them.

### Pitfall 5: harness BASE_ENV collides with the new gate
**What goes wrong:** test/helpers/server.mjs BASE_ENV (line 17-26) does not set WORKSPACE_CREATION → with unset=false default, every existing suite's workspace-creating fixtures (signup → create workspace flows in dozens of suites) start failing: non-operator admin user can no longer create the fixture workspace.
**Avoid:** add `WORKSPACE_CREATION: 'true'` to BASE_ENV so existing suites keep today's behavior; dedicated suites override with `false`/invalid tokens. This is the single biggest test blast-radius item — audit which suites create workspaces via non-operator users (e.g. domain-admission, tenancy, flows).

### Pitfall 6: boot-refuse test mechanics
**What goes wrong:** startServer harness waits for health/ready; a boot-refusing server exits fast — harness behavior on early exit must be asserted via `server.output()` stderr content + child exit code (harness captures stderr at test/helpers/server.mjs:65 and exposes output(); domain-admission.test.mjs:100-212 shows the boot-log-assertion pattern via `server.output()`).
**Avoid:** for invalid-token cases assert exit + the error text names WORKSPACE_CREATION and both valid values; for the unset=false and valid-token cases boot succeeds and the new logInfo line is greppable in output().

### Pitfall 7: locale parity is 5-way, tests enforce 2-way statically + full en↔fr
error-codes.test.mjs auto-extracts fail() literals → en+fr err keys. test/catalogue.test.mjs enforces en↔fr completeness. nl/de/es are asserted by the e2e locale-refusal pattern (imports catalogues directly, e2e/locale-refusal.spec.mjs:30-33) and the standing same-commit rule. Add all 5 keys in the gate commit; consider extending the locale-refusal-style exact-match e2e for the new refusal (planner discretion; error-codes covers the static half).

### Pitfall 8: audit_log 12-column literal
The insert at server.js:6723 requires all 12 columns (NOT NULL on actor_name/actor_email/target_name/target_email/created_at). A promote/demote insert missing any NOT NULL column throws inside db.tx and rolls back the flag update. Copy the full literal; `session_count` and `workspace_id` are nullable (pass null).

### Pitfall 9: demote-self / last-operator interaction
The last-operator guard must count BEFORE the UPDATE and inside awareness of self: `count(*) where is_instance_admin=1` — if target is the only flagged user, refuse regardless of who calls. Consider also: operator demoting themselves while others exist is legal (planner decision; document in plan).

### Pitfall 10: CLIENT routing double-hook
Two entry points set `no-workspace` (main.js:402 boot and `enterNoWorkspace()` in actions.js used by finishLogin). Both must route to the await state consistently — changing only one leaves signup-then-boot vs login divergent. Also A.newWorkspace (actions.js:3201) manually sets `S.ui.auth='onboarding'` after checking canCreateWorkspace — with the popover button hidden this is a dead path but keep the guard.

## Code Examples

### Env parse (server.js:135 zone)
```js
// Source: server.js:135 zone pattern (ALLOW_SIGNUP) + CONTEXT locked decision
const _WC_RAW = process.env.WORKSPACE_CREATION;
const WORKSPACE_CREATION = _WC_RAW === undefined ? false
  : _WC_RAW === 'true' ? true
  : _WC_RAW === 'false' ? false
  : null; // sentinel → boot-refuse
// in main() before listen (or immediately after const resolution):
if (WORKSPACE_CREATION === null) {
  logError(new Error(`WORKSPACE_CREATION: invalid value "${_WC_RAW}" — only 'true' or 'false' are accepted (unset defaults to false)`));
  process.exit(1);
}
```

### Boot log line (adjacent to server.js:8952 door-matrix line)
```js
logInfo(`workspace creation: ${WORKSPACE_CREATION ? 'open (any authenticated user)' : 'closed (instance operators only)'}`);
```

### Gate swap (server.js:6807-6812)
```js
if (pathname === '/api/workspaces' && method === 'POST') {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected'); // stays
  // OLD (delete): if (!ALLOW_SIGNUP && !(await hasAdminRole(user.id))) return fail(... 'askAdminForWorkspace' ...)
  if (!WORKSPACE_CREATION && !isInstanceAdmin(user)) {
    return fail(res, 403, 'workspaceCreationClosed', 'Workspace creation is closed. Ask the instance operator.');
  }
```
(Note: `askAdminForWorkspace` at server.js:6812 becomes unused — decide whether to delete the code+5 locale keys or leave; error-codes test only asserts presence-for-emitted, not absence-for-unemitted. Deleting is cleaner.)

### Promote/demote endpoint skeleton
```js
// Clone of server.js:6703-6760 (D-121 POST shape)
const opMemberMatch = pathname.match(/^\/api\/auth\/operator\/users\/([A-Za-z0-9_-]{1,64})\/(promote|demote)$/);
if (opMemberMatch && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const target = await db.get('select id, name, email, is_instance_admin from users where id = ?', [opMemberMatch[1]]);
  if (!target) return fail(res, 404, 'notFound', 'Not found');
  const promoting = opMemberMatch[2] === 'promote';
  if (target.is_instance_admin === (promoting ? 1 : 0)) return json(res, 200, { users: ... }); // idempotent no-op or 409 — planner picks
  if (!promoting) {
    const n = (await db.get('select count(*) as c from users where is_instance_admin = 1')).c;
    if (n <= 1) return fail(res, 409, 'lastOperator', 'The instance needs at least one operator');
  }
  await db.tx(async () => {
    await db.run('update users set is_instance_admin = ? where id = ?', [promoting ? 1 : 0, target.id]);
    await db.run('insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
      [uid(), operator.id, target.id, promoting ? 'operator_promoted' : 'operator_demoted', null, clientIp(req), null, operator.name, operator.email, target.name, target.email, now()]);
  });
  logInfo(`operator ${promoting ? 'promoted' : 'demoted'}: ${target.email} by ${operator.email}`);
  return json(res, 200, { user: { id: target.id, is_instance_admin: promoting ? 1 : 0 } });
}
```
Check audit-log read route (server.js:6635-6676) verb chips: it filters by action strings — promote/demote actions will simply appear in "all"; optionally add verb chips + `settings.audit.verb*` keys (nice-to-have, planner discretion).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node:test + helpers/server.mjs harness | gate/boot-refuse suites | ✓ | node built-in | — |
| Playwright + e2e/server.mjs | await-page e2e | ✓ | e2e/playwright.config.mjs | skip e2e, unit covers |
| eslint/prettier | standing gates | ✓ | package.json scripts | — |

No missing dependencies. No external services.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), `--test-concurrency=2`; Playwright for e2e |
| Config file | none for node:test (glob via package.json `test` script); e2e/playwright.config.mjs |
| Quick run command | `node --test test/creation-gate.test.mjs` (new suite) |
| Full suite command | `npm test` (test/*.test.mjs, ~concurrency 2) + `npm run e2e` |

### Phase Requirements → Test Map (Nyquist dimensions)
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WSG-01 | Token matrix: `true`→boot ok+log; `false`→ok; unset→ok+closed log; `TRUE`/`''`/`' '`/`'yes'`/`'1'`→exit 1 + error names var + both valid values | integration (boot-observable) | `node --test test/creation-gate.test.mjs` | ❌ Wave 0 |
| WSG-01 | Boot log line present with effective meaning | integration (server.output() grep, domain-admission.test.mjs:100 pattern) | same | ❌ Wave 0 |
| WSG-02 | gate=true: any authenticated user creates → 201, creator role=owner | integration | same | ❌ Wave 0 |
| WSG-02 | gate=false: non-operator → 403 keyed refusal (exact key); operator → 201; workspace owner/admin (non-operator) → 403 (D-112) | integration | same | ❌ Wave 0 |
| WSG-02 | ALLOW_SIGNUP=true + gate=false: signup still 201 (signup decoupled) AND creation refused (coupling dead) | integration | same | ❌ Wave 0 |
| WSG-02 | ALLOW_SIGNUP=false: signup still 403 signupDisabled (untouched scope) | integration | same | ❌ Wave 0 |
| WSG-03 | /api/config `workspaceCreation` is boolean in both modes | integration | same | ❌ Wave 0 |
| WSG-05 | stampInstanceAdmin still seeds first operator; second operator survives restart (persistence via reboot-same-DB harness, test/helpers/server.mjs dataDir param) | integration | same | ❌ Wave 0 |
| WSG-06 | promote: operator flags a user → GET list reflects; audit row written; non-operator caller → operatorOnly; unknown id → 404 | integration | same | ❌ Wave 0 |
| WSG-06 | demote last operator → 409 lastOperator (keyed); demote when ≥2 → ok; demote self (when others exist) → planner-decided | integration | same | ❌ Wave 0 |
| WSG-06 | forced audit failure rolls back the flag update (db.tx discipline — mirror audit-log.test.mjs pattern) | integration | same | ❌ Wave 0 |
| WSG-11 | every new code (`workspaceCreationClosed`, `lastOperator`, …) has err.<code> in en+fr | static (auto via error-codes.test.mjs) | `npm test` | ✅ (existing, auto-covers) |
| WSG-11 | 5-locale key presence for new UI keys (settings.operator.* / await page keys) | static | extend test/catalogue or build-locales pattern | ❌ Wave 0 (small) |
| WSG-10 | client: closed gate + non-operator + no membership → await view (no app shell, sign-out present); poll enters app after membership appears; poll paused while document.hidden | e2e Playwright (visibility mocking: CDP/`page.emulateVisibility`? — no; use a second browser context or directly assert the guard code path via unit + manual; the store.js visibilitychange precedent is event-driven, so drive by dispatching the event) | `npx playwright test e2e/await-access.spec.mjs` | ❌ Wave 0 |
| WSG-10 | create button hidden in popover for gated user; visible for operator | e2e | same | ❌ Wave 0 |
| WSG-10 | operator sees create path with gate=false | e2e | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** new suite quick run (`node --test test/creation-gate.test.mjs`) + lint
- **Per wave merge:** `npm test` full
- **Phase gate:** full suite + `npm run e2e` green before /gsd-verify-work

### Wave 0 Gaps
- [ ] `test/creation-gate.test.mjs` — gate matrix, boot-refuse, operator endpoints, last-operator, audit tx (WSG-01/02/05/06)
- [ ] `e2e/await-access.spec.mjs` — await page + poll + button visibility (WSG-10)
- [ ] **BASE_ENV update in test/helpers/server.mjs** — add `WORKSPACE_CREATION: 'true'` or audit+patch affected suites (Pitfall 5 — decide in plan; this is the main regression risk)
- [ ] Possibly extend error-codes.test.mjs expectations? No — it auto-extracts; zero edits needed.

## Sources

### Primary (HIGH confidence)
- Direct source reads this session: server.js (135, 287, 399-418, 665, 939-945, 3542-3548, 4640 area, 4682, 4838, 5000-5032, 6685-6760, 6803-6832, 7110-7140, 8900-8990); domains.js (tri-state precedent); src/core/api.js (15, 110-200, 337); src/pages/auth.js (96, 129-134); src/pages/settings.js (240-330); src/actions/actions.js (2735-2768, 3201-3216, 4000-4040); src/main.js (100-126, 320-432); src/core/store.js (280-289); src/overlays/popovers.js (262); test/helpers/server.mjs; test/domain-admission.test.mjs; test/error-codes.test.mjs; test/catalogue.test.mjs; e2e/playwright.config.mjs; e2e/locale-refusal.spec.mjs; package.json scripts; locale key counts via node.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `--add-user` CLI does not touch is_instance_admin (per D-78-2 owner decision; not re-verified by reading the CLI flag code) | WSG-05 | low — decision is contractual regardless |
| A2 | Playwright visibility can be driven by dispatching `visibilitychange` events / hidden-state mocking; if flaky, poll-pause covered by unit-level assertion of the guard condition instead | Validation | e2e flake — fallback documented |
| A3 | `createWorkspace` assigns creator role 'owner' unchanged (server.js:4640 area; WSG-04 says "behavior unchanged" — I did not re-read the exact owner-assignment line) | WSG-04 | low — no code change planned there |

## Open Questions (RESOLVED)

1. **Await-page entry after poll success: full reload vs soft-enter?**
   - **Resolved: soft-enter** (mirrors finishLogin) — picked in 78-02 Task 2; full reload kept as documented fallback.
2. **Refusal key naming** — **Resolved: `workspaceCreationClosed`** (78-01 Task 2).
3. **Idempotent promote/demote on already-flagged target** — **Resolved: 200 no-op with current state** (78-01 Task 3).

## Estimation Basis

- Server: env parse+refuse+log (~15 lines), gate swap (~5), /api/config (~1), 2 endpoints (~60, cloned), audit keys — one focused server task.
- Client: api.js getter+state (~10), popover gate (~3), await view + poll (~50), actions (~30), operatorCard buttons + actions (~40).
- Locales: ~8-12 new keys × 5 catalogues.
- Tests: 1 integration suite (~15-20 tests), 1 e2e spec (~3-5 tests), BASE_ENV/suite audit (the hidden cost — Pitfall 5).
- Historical calibration: phase 75 (similar shape: env machinery + gates + locales + suites) shipped in 2 plans; this phase is smaller — 2-3 plans, ~5-8 tasks.

## RESEARCH COMPLETE

1. Env gate: strict-token parse at server.js:135 zone, boot-refuse via logError+exit, log line adjacent to door matrix (server.js:8952); unset=false fail-closed.
2. Gate swap is a 3-line change at server.js:6811 (`WORKSPACE_CREATION && isInstanceAdmin(user)`, new keyed refusal; delete `askAdminForWorkspace` coupling); /api/config boolean at 5020, one client consumer (api.js:175/157).
3. Promote/demote = clone of D-121 revoke route (sameOrigin-first, operatorOnly, db.tx + 12-column audit row, server.js:6703-6760); last-operator guard = needOwner count pattern (server.js:7121).
4. Client await page ALREADY EXISTS as the `no-workspace` auth view (auth.js:129) routed from main.js:402 + enterNoWorkspace — extend it with a 15s `document.hidden`-guarded poll (pollNotifs/visibilitychange precedents) and gate the popover button (overlays/popovers.js:262) on the new `canCreateWorkspace`.
5. Biggest hidden cost: test/helpers/server.mjs BASE_ENV must set WORKSPACE_CREATION='true' or dozens of suites break under unset=false; no DB migration needed (is_instance_admin at server.js:287/665); zero new deps.
