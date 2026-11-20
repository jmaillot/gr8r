# Phase 81: Group Grant Path — Callback Wiring + Provenance - Research

**Researched:** 2026-11-20
**Domain:** Server-side SSO callback wiring (Node.js, no new dependencies) — OIDC callback extension, SQLite/pg schema migration, audit plumbing
**Confidence:** HIGH

## Summary

Phase 81 wires the Phase 80 resolver (`groups.js` — `resolveGroupsClaim` + `resolve`) into the live OIDC callback in `server.js`. Every anchor the planner needs was re-read this session against current line numbers; several drifted from the CONTEXT citations (documented below). No new packages are installed — this is pure server.js/db-adapter.mjs work plus `node:test` suites, so the package-legitimacy gate is trivially satisfied.

The load-bearing insertion point is confirmed: the callback identity-resolution block ends at **server.js:5239** (after the oidc_identities insert + its concurrency backstop at :5230–5238, which MUST NOT be crossed); the DP-5 invite-reconcile block starts at **server.js:5241** (comment) with the zero-memberships guard at **server.js:5249**. The grant block goes between those two lines, inside the existing `try` (D-81-11 fail-closed via `errorRedirect`). The single byte-identical regression surface for the DP-5 guard is exactly one site: `select 1 from memberships where user_id = ?` at :5249 — grep confirms no other guard shares that shape.

`addMembership` (server.js:4632–4669) is the single insert facade and grows a provenance param per D-81-7. Its callers today: :3582 (bootstrap owner), :4711 (workspace-creation owner — NOT :3582 as the task prompt guessed; both are owner-stamp sites), :5272 (SSO-07 auto-accept → `invite`), :8490 (operator accept route → `invite`), :9247 (CLI `create-user` → `manual`). Direct `insert into memberships` sites outside the facade: :7010 (workspace-delete reassign disposition → `manual`), :7111 (operator member reassign → `manual`). The Phase-80 owner decision already moved mapping config into `group_mappings` — no env vars exist; the callback loads rows from the table directly.

**Primary recommendation:** One callback helper function placed after line 5239, one `adapterEnsureColumn('memberships', 'provenance', 'text')` at the :656 migration block, one provenance param threading through addMembership + its 6 callers and 2 direct-insert sites, one provenance-filtered rewrite of the :5249 guard, one operator-flag tx mirroring :6846–6862. All testable via the existing mock-IdP `runFlow` pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-81-1..11 — binding, do not re-open)
- **D-81-1:** DP-5 guard becomes provenance-filtered: `select 1 from memberships where user_id = ? and (provenance is null or provenance not like 'group:%')`. Unmapped users byte-identical; invites always reconcile.
- **D-81-2:** Upgrade-only re-assert — mapped role applied ONLY when HIGHER than existing row's role (any provenance). Same-role no-op; lower = untouched. Downgrades are Phase 82.
- **D-81-3:** Viewer ranks 0 (owner 3 > admin 2 > member 1 > viewer 0); any mapped role upgrades a viewer row; mappings can never map TO viewer.
- **D-81-4:** Hybrid audit — operator flag grant = full `audit_log` row in the SAME `db.tx` as the flag update, action `operator_promoted`, actor = target (self-grant), ip from request. Workspace grants / role upgrades = `logSecurity` verbs `sso_group_grant` / `sso_group_role_change`.
- **D-81-5:** Changes-only auditing — no writes → zero group audit rows; `sso_login` still fires as today.
- **D-81-6:** Stamp ALL writers: group → `group:<guid>`; invite reconcile + accept route → `invite`; manual paths (workspace-creation owner, operator member-add/reassign, CLI, any direct insert) → `manual`. Pre-existing rows stay NULL = manual/invite, immune to group logic. No backfill.
- **D-81-7:** `addMembership(ws, user, role, teams = [], provenance = null)`; on-conflict updates role + member_id ONLY — provenance keeps the row's ORIGINAL creation origin.
- **D-81-8:** Dead/archived workspace → skip grant + logWarn, never fatal, no refusal keys.
- **D-81-9:** Onboarding composes naturally — no bypass flag, no special handling.
- **D-81-10:** Overage/unmapped at login = ONE `logWarn` with fixed message (e.g. `sso groups claim overage — treating as unmapped`); never GUIDs/counts/claim content. Zero grant writes.
- **D-81-11:** Fail closed — the whole grant block rides inside the existing callback `try`; any throw → generic `errorRedirect()`. No new redirect params.
- Binding consequences (treated as decisions): password logins never consume groups; `ssoRedirect` target unchanged by grants; already-operator + operator-mapping match = no write, no audit.

### Reversibility notes
- D-81-6/D-81-7 (provenance column + stamping) rate **costly**: the column and the written values become removal-sync's (Phase 82) selection key; retrofitting provenance semantics later means a data migration over live membership rows.
- The remaining decisions are reversible (callback-local logic, additive migration).
</user_constraints>

<package_decision>
## Package Decision

**No new dependencies.** The phase touches only server.js, db-adapter.mjs, groups.js (already shipped in Phase 80), and node:test suites. `test/dependencies.test.mjs` needs NO change (no new files to ship — verify groups.js is already in the COPY array, it is, per Phase 80). Zero-dependency invariant holds trivially.
</package_decision>

## Current State (verified this session, line-accurate)

### 1. The callback insertion corridor (GW-03)

```
server.js:5121  pathname === '/api/auth/oidc/callback' (GET)
server.js:5125  errorRedirect() — the ONE generic failure surface
server.js:5143  token exchange → verifyIdToken (kid refetch at :5151–5153)
server.js:5157  const claims = verdict.claims   ← the groups claim source
server.js:5162  subject/email gates (emailOk)
server.js:5185  identity resolution (oidc_identities join)
server.js:5191  link gate (canLink && verifiedEmail)
server.js:5206  DP-4 signup door (emailDomainRefusal vs SIGNUP_DOMAINS)
                → returns errorRedirect BEFORE any users/oidc_identities write
server.js:5217  JIT createUser (random scrypt hash)
server.js:5221  oidc_identities insert
server.js:5230  concurrency backstop (UNIQUE → re-resolve row)  ← MUST NOT cross
server.js:5239  }  ← end of identity-resolution block; row guaranteed
                ▼ NEW GRANT BLOCK HERE (D-81: helper call)
server.js:5241  /* SSO-07 (D-06): reconcile pending invitations … */  ← DP-5 comment
server.js:5249  if (!(await db.get('select 1 from memberships where user_id = ?', [row.id]))) {
server.js:5262    single-invite auto-accept → addMembership(ws, row, invite.role, teams) :5272
server.js:5299    multi-invite → ssoRedirect '/#invitations'
server.js:5305  }
server.js:5317  2FA branch (challenge, /#tfa)
server.js:5331  session mint → aad_oid write :5348–5350 → setSessionCookie → sso_login :5352
```

**DP-4 ordering is structural:** the door at :5206 `return`s before any identity row exists, so a domain-refused email can never reach the grant block. The e2e pin (mapped group + blocked domain → refused) tests the DOOR, not the grant code — the grant block is unreachable for that user by construction.

**2FA note:** the grant block runs before the 2FA branch (:5317). A 2FA-enrolled user's group grants COMMIT before the challenge completes. This is correct per the milestone's snapshot-at-login semantics and matches how `aad_oid`/`last_login_at` writes already behave for 2FA users (they also commit at :5349 before the challenge... actually no — the 2FA branch RETURNS at :5326, so :5349 never runs for 2FA users). The grants still commit — membership is server-side state, not identity; the challenge only gates the session cookie. No decision needed; document in the plan.

### 2. addMembership + its callers (GW-04 / D-81-6 / D-81-7)

```js
// server.js:4632–4669 (current)
async function addMembership(ws, user, role, teams = []) {
  ...
  await db.tx(async () => {
    await db.run(
      `insert into memberships (workspace_id, user_id, role, member_id, team, scope) values (?,?,?,?,?,null)
       on conflict(workspace_id, user_id) do update set role = excluded.role, member_id = excluded.member_id`,
      [ws.id, user.id, role, memberId, null],
    );
    ...team_members inserts...
  });
  return memberId;
}
```

**Change per D-81-7:** signature → `addMembership(ws, user, role, teams = [], provenance = null)`; INSERT gains `provenance` in the values list; **the ON CONFLICT clause does NOT touch provenance** (keeps creation origin on upgrade).

Caller census (all 8 write sites, verified this session):

| # | Site | Path | Provenance (D-81-6) |
|---|------|------|---------------------|
| 1 | server.js:3582 | CLI bootstrap owner stamp (`ensureAdminBootstrap`-style) | `manual` |
| 2 | server.js:4711 | `createWorkspace` owner grant | `manual` |
| 3 | server.js:5272 | SSO-07 auto-accept (invite reconcile) | `invite` |
| 4 | server.js:8490 | operator accept route (`/api/invites/accept`-family) | `invite` |
| 5 | server.js:9247 | CLI `create-user` workspace attach | `manual` |
| 6 | server.js:7010 | workspace-delete reassign disposition (direct INSERT) | `manual` |
| 7 | server.js:7111 | operator member reassign (direct INSERT) | `manual` |
| 8 | NEW | callback grant block | `group:<guid>` |

For sites 6–7 (direct inserts, no facade): add `, null` provenance or rewrite to use addMembership — planner's discretion, but the INSERT statement must yield provenance 'manual' going forward. Note site 3's call passes teams; site 2/4 may pass teams too — the 5th positional param threads cleanly.

**Migration (D-81-6):** one line in the server.js:656–670 `adapterEnsureColumn` block:
`await adapterEnsureColumn('memberships', 'provenance', 'text');`
- SCHEMA mirror (server.js memberships DDL ~:600–614 + db-adapter.mjs:214–222): add `provenance text` to BOTH, byte-consistent (mirror test enforces). Place after `member_id`/`team` — column order in CREATE TABLE is cosmetic for existing DBs (ensureColumn appends), but keep both mirrors identical.
- pg: plain text column — `pgSchemaVariant` needs nothing (no epoch, no collate).
- No index this phase. Phase 82's removal-sync filter (`provenance like 'group:%'`) runs per-login over one user's rows (<10); if it ever needs an index, that's a Phase 82 decision with real cardinality data.

### 3. The provenance-filtered DP-5 guard (D-81-1)

server.js:5249 is the ONLY site of this guard shape (grep `"from memberships where user_id"` → 1 hit). Rewrite:

```js
if (!(await db.get("select 1 from memberships where user_id = ? and (provenance is null or provenance not like 'group:%')", [row.id]))) {
```

Unmapped users: their rows are NULL/manual/invite → guard behavior identical → **byte-identical regression surface is this one statement**. The plan must pin: full `npm test` green + a targeted test that a group-mapped user with a pending invite STILL auto-accepts (the new behavior) and an unmapped user's invite path is untouched (existing DP-5 suite already pins this — test/domain-admission-sso.test.mjs:174–296 stays green verbatim).

### 4. Upgrade-only re-assert + viewer rank (D-81-2 / D-81-3)

- groups.js `ROLE_RANK` (`{owner:3, admin:2, member:1}`) is **test-locked Phase 80 surface — do not extend to viewer there**. The 4-token comparison lives in the callback helper:
  `const ROLE_RANK_WITH_VIEWER = { owner: 3, admin: 2, member: 1, viewer: 0 };` (callback-local const).
- Grants arrive from `resolve()` as owner/admin/member only (mapping CHECK forbids viewer). Existing row role can be viewer (memberships CHECK allows it). Rule: apply mapped role iff `RANK[mapped] > RANK[existing]`; viewer(0) loses to any mapped role; equal = no-op.
- First-grant (no existing row) → addMembership with `group:<guid>`; existing row + upgrade → the on-conflict UPDATE inside addMembership already rewrites role — so the helper can simply call addMembership for BOTH cases... **NO**: addMembership's on-conflict fires whenever a row exists (even same-role/lower). The helper MUST pre-compare: read existing row, skip when not upgrading, else call addMembership (whose conflict-UPDATE then applies the higher role). This keeps D-81-5 (changes-only audit) honest — no-op logins write nothing.

### 5. Operator grant (GO-01 / D-81-4)

Console promote reference (server.js:6817–6868): count guard (`lastOperator` — NOT needed for grant-only: granting INCREASES the count; the guard is structurally unreachable, document in plan), then:

```js
const out = await db.tx(async () => {
  await db.run('update users set is_instance_admin = ? where id = ?', [1, target.id]);
  await db.run('insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), row.id, row.id, 'operator_promoted', 0, clientIp(req), null, row.name, row.email, row.name, row.email, now()]);
});
```

actor = target = the granted user (self-grant per D-81-4). Note: the console route logs via `logInfo` too — the callback already has `sso_login` logging; a distinct `logInfo` for the self-promotion is discretion. D-82-3 (re-grant after demotion) is automatic: demoted user logs in → mapping matches → flag flips 0→1 → that IS a change → audit row (D-81-5).
`is_instance_admin` read path: server.js:4892 (`user?.is_instance_admin === 1`) — no session-cache concerns (flag read per-request from user row).

### 6. Audit verbs (GO-02 / D-81-4)

security_log is verb-string keyed (server.js:4956, no CHECK constraint) — `sso_group_grant`, `sso_group_role_change` collide with nothing (grep confirms; existing sso verbs: `sso_login`, `sso_invite_accepted`). No i18n keys needed this phase (no API/client surface reads these verbs; the settings audit trail humanizes only two operator verbs — group verbs are Phase 83+ display concern at most).

### 7. Claim ingestion + mapping load

```js
const claimState = resolveGroupsClaim(claims);            // groups.js (four-outcome, never throws)
if (claimState.state === 'unmapped') {
  if (claimState.reason === 'overage') logWarn('sso groups claim overage — treating as unmapped');  // D-81-10: fixed message
} else {
  const mappings = await db.all('select group_guid, workspace_id, role, kind from group_mappings');
  const { grants, operatorFlag } = resolve(claimState.groups, mappings);   // D-82-1 highest-role-wins
  ...grant loop (workspace existence + archived check :377/:1001 pattern, skip+logWarn D-81-8)...
  ...operator flag flip in tx (D-81-4)...
}
```

`resolve()` canonicalizes both sides (Phase 80) — callback passes claim GUIDs verbatim. Zero mappings table + groups claim present → grants=[] operatorFlag=null → no writes (byte-identical). Empty mappings load is cheap (SELECT per SSO login of a mapped-or-not user — research ARCHITECTURE scalability table already blessed O(mapped workspaces) per login).

### 8. Test architecture (existing harness, verified)

- **Mock IdP:** `test/helpers/oidc-idp.mjs` — `idp.tokenConfig = { code, claims: {...} }`; claims spread over defaults (tid 't-1' pinned). `groups: ['guid-a']` and `_claim_names: { groups: 'src1' }` inject directly. One id_token per token-endpoint call.
- **Flow helper:** `runFlow({ srv, code, claims })` in test/oidc-sso.test.mjs:140–156 — nav to /api/auth/oidc/start → capture flow cookie → callback → `{ callback, q, flowCookie }`. Reusable verbatim.
- **Server-per-case:** `startServer({ env, dataDir })` + `withDb(server.dbPath, db => ...)` (test/helpers/server.mjs:48, :172) — group_mappings rows seeded per-test via `db.run('insert into group_mappings ...')` (columns per DDL server.js:616; `kind` default 'workspace'; unique pair index on (group_guid, workspace_id)).
- **Archived workspace fixture:** `update workspaces set archived = 1` via withDb (flag at :377/:660).
- **Assertions:** memberships rows + provenance via withDb; users.is_instance_admin; audit_log rows (action/actor_id/target_id); security_log verbs; server.output() for logWarn strings.
- **Existing suites that must stay green untouched:** test/oidc-sso.test.mjs, test/domain-admission-sso.test.mjs (DP-4/DP-5 pins), test/groups-core.test.mjs, test/groups-config-api.test.mjs, test/db-adapter.test.mjs (mirror test now sees the provenance column in both schemas — keep mirrors identical).

## Validation Architecture

**Framework:** node:test + node:assert/strict (house style; no config file)
**Quick run:** `node --test test/groups-sso.test.mjs` (new callback integration suite)
**Full suite:** `npm test` (currently 2000 tests, 13 pg-skips; must stay green with new suites added)
**Regression pins:** test/oidc-sso.test.mjs + test/domain-admission-sso.test.mjs untouched and green (byte-identical gate)

| Dimension | Requirement |
|-----------|-------------|
| Per-plan sampling | Each plan's tasks carry node:test commands with `<fails_when>` (non-zero exit / named assertion string) |
| Wave 0 | Provenance column lands BEFORE any writer stamps it (mirror test + fresh-boot proof: `pragma table_info(memberships)` contains provenance on SQLite; pg variant via existing pg test path) |
| Integration floor | ≥1 e2e per success criterion 1–5: mapped grant (JIT + existing), upgrade-only re-assert (incl. viewer→member), DP-4 blocked-domain e2e, provenance on all 3 writer classes, operator self-grant + audit row, overage logWarn, unmapped byte-identical |

## Pitfalls (phase-specific, verified)

1. **Crossing the concurrency backstop (:5230–5238).** The grant block must sit AFTER it — a parallel-login race re-resolves `row`; grants keyed to a stale row.id would write for the loser identity. Insert strictly at :5239–5241.
2. **addMembership's unconditional on-conflict.** Calling it for an existing same-role/lower row would rewrite role + member_id (a WRITE, breaking D-81-5 and D-81-2). The helper MUST pre-compare and skip.
3. **Provenance on conflict-update.** Adding provenance to the ON CONFLICT SET clause would clobber creation origin on every group upgrade — D-81-7 forbids; keep SET to `role, member_id` only.
4. **Guard-shape drift.** Exactly ONE site (:5249) gets the provenance filter. Do NOT "helpfully" filter other membership reads (rosters, dashboards) — group rows are full members everywhere else.
5. **ROLE_RANK pollution.** Do not add viewer to groups.js (test-locked Phase 80 contract; mappings can't produce viewer anyway). Callback-local rank map only.
6. **Audit outside tx.** The operator self-grant audit row MUST share the flag-update tx (AUD-01 discipline, :6843–6862 shape). A forced audit failure rolls back the promotion.
7. **Overage message leakage.** D-81-10 fixes the message; never interpolate claim content, GUIDs, or counts into it.
8. **2FA interplay misconception.** Grants commit before the 2FA challenge (challenge gates the cookie, not server state) — same as today's behavior where server-side login bookkeeping precedes the challenge. No special handling; do not move grants after 2FA.

## Assumptions

- **A1 (negligible):** `group_mappings` reads at login load ALL rows (no user pre-filter) — table is operator-curated (tens of rows); fine per ARCHITECTURE scalability note. Phase 82+ can add SQL-side filtering if the table grows.
- **A2 (negligible):** `clientIp(req)` is available at the grant block (callback already has `req`; session mint uses it at :5334).
- **A3 (negligible):** `row.name`/`row.email` are populated for the audit snapshots (row re-resolved from users join; JIT path sets both at :5217).

None blocking; all three are planner-verifiable one-liners.

## Sources

- Codebase-verified (HIGH): server.js :5121–5360, :4632–4669, :3582, :4711, :7010, :7111, :8490, :9247, :656–670, :377, :1001, :4892, :6817–6868, :4956, :5334; groups.js :60–154; db-adapter.mjs :214–222, :385–396, :867–878; test/helpers/oidc-idp.mjs :19–50; test/oidc-sso.test.mjs :140–156; test/domain-admission-sso.test.mjs :67–296; test/helpers/server.mjs :48/:172; src/main.js :390–410.
- .planning/research/ARCHITECTURE.md (Decision 2/3, waves), STACK.md (claim config), PITFALLS.md (DP-4 bypass, overage trap) — read this session; env-var content superseded by Phase 80 DB-config decision.
- .planning/phases/80-*/80-RESEARCH.md + VERIFICATION.md — resolver contract provenance.
