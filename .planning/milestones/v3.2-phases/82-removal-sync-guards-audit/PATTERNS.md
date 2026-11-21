# Phase 82: Removal Sync + Guards + Audit - Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 3 (server.js grant block + on-conflict clause, test/groups-sso.test.mjs suite, shared helpers)
**Analogs found:** 6 / 6

## File Classification

| New/Modified Surface | Role | Data Flow | Closest Analog | Match Quality |
|----------------------|------|-----------|----------------|---------------|
| Reconcile pass (replaces grant block, server.js:5246–5311) | service (in-callback) | transform (diff per workspace) | Phase 81 grant block itself, server.js:5246–5305 | exact (self-extension) |
| On-conflict provenance SET (D-82-7) | model write | CRUD | `addMembership` clause, server.js:4660–4664 | exact (in-place edit) |
| Guarded delete tx | service | CRUD (delete) | member-DELETE route tx, server.js:7626–7636 (leave tx :7599–7607 twin) | exact |
| Guard funnel (delete + owner-downgrade) | middleware-ish pre-write check | request-response guard | ownerCount guards :7627 (DELETE), :7644 (PATCH), :7599 (leave); lastOperator :6907–6910 (documented-unreachable, D-82-8) | exact |
| Encoded audit rows `group_<delta>:group:<guid>:<reason>` (D-82-9/11) | model write (audit) | CRUD | Phase 81 operator_promoted tx, server.js:5297–5303 + console promote :6914–6924 | role-match (shape exact, action format NEW — no precedent) |
| Overage skip extension (:5252–5257) | control flow | event-driven (login) | existing branch itself, server.js:5252–5257 | exact (in-place edit) |
| Reconcile tests (extend test/groups-sso.test.mjs) | test | e2e two-login | existing suite pins (fixtures :111, seeded rows :391, stdout scan :236–237, fault trigger :344–346) | exact |

## Pattern Assignments

### 1. Reconcile pass — `server.js:5246–5311` (the block being converted)

**Analog:** itself — Phase 81's grant block. Every structural element of the reconcile already lives here; the pass extends, does not relocate.

**Corridor placement** (:5246–5251): the comment block documents WHY the block sits where it does — after identity resolution, before DP-5, inside the fail-closed try. Update the comment prefix to `/* Phase 82 (D-82-x): ... */` and rewrite the tracer-minimal line.

**Overage skip** (:5252–5257) — the whole pass must stay inside this `else`:
```js
const claimState = resolveGroupsClaim(claims);
if (claimState.state === 'unmapped') {
  if (claimState.reason === 'overage') logWarn('sso groups claim overage — treating as unmapped');
} else {
  // ALL grant AND removal logic lives here — overage never removes (SC5)
```

**Existing per-grant loop to convert** (:5265–5284):
```js
for (const grant of grants) {
  const ws = await db.get('select * from workspaces where id = ?', [grant.workspaceId]);
  if (!ws || ws.archived === 1) { logWarn('sso group grant skipped — workspace missing or archived'); continue; }  // :5268 D-81-8
  const existing = await db.get('select role from memberships where workspace_id = ? and user_id = ?', [ws.id, row.id]);  // :5277 — must widen to `select role, member_id, provenance`
  if (existing && !(ROLE_RANK_WITH_VIEWER[grant.role] > ROLE_RANK_WITH_VIEWER[existing.role])) continue;  // :5278 changes-only
  await addMembership(ws, row, grant.role, [], 'group:' + grant.groupGuid);  // :5279
  await logSecurity(row.id, existing ? 'sso_group_role_change' : 'sso_group_grant');  // :5284 — CONVERTS to encoded audit row per D-82-11
}
```
Copy: the changes-only pre-compare (→ diff cells), the dead/archived skip (→ reason `archived-workspace`), the `ROLE_RANK_WITH_VIEWER` map (:5264). Replace: `logSecurity` verbs → `audit_log` rows in the same tx.

### 2. Guarded delete tx — `server.js:7626–7636` (member DELETE route)

**Analog:** the exact tx to mirror — a group-removed member must be indistinguishable from a route-removed member. Twin at the leave route (:7602–7607).
```js
if (row.role === 'owner' && (await ownerCount(ctx.ws.id, target.id)) === 0) return fail(res, 409, 'needOwner', 'Every workspace needs an owner');  // :7627 count-BEFORE-tx
await db.tx(async () => {
  await db.run('delete from memberships where workspace_id = ? and user_id = ?', [ctx.ws.id, target.id]);       // :7629
  await db.run('delete from team_members where workspace_id = ? and user_id = ?', [ctx.ws.id, target.id]);      // :7631 TEAM-01 authority rows
  await updateDoc(ctx.ws.id, doc => stripMember(doc, row.member_id, target.id));                                 // :7632 doc profile strip
});
```
Differences for the reconcile: no `fail(res,...)` — refusal is skip+logWarn+audit+`continue`; the audit row joins the same `db.tx`; requires the row's `member_id` — hence widening the :5277 select to `role, member_id, provenance`. `ownerCount` helper (:3409–3411) counts OTHER owners (`user_id is not ?`) — refusal fires when the user is the sole owner.

### 3. Guard funnel — templates at :7599 / :7627 / :7644; lastOperator :6907–6910

**Analog:** three identical count-before-write guards already exist:
- `:7599` (leave): `ctx.membership.role === 'owner' && (await ownerCount(ctx.ws.id, ctx.user.id)) === 0`
- `:7627` (DELETE): `row.role === 'owner' && (await ownerCount(ctx.ws.id, target.id)) === 0`
- `:7644` (PATCH owner-downgrade): `row.role === 'owner' && nextRole !== 'owner' && (await ownerCount(...)) === 0` ← **this is the analog for the owner-downgrade guard arm** (downgrading the sole owner removes the only owner — research cell 10 / A5).

lastOperator (:6907–6910): `count of is_instance_admin <= 1 → fail 409 'lastOperator'`. Structurally unreachable from group logic (grants only add operators; removal-sync never touches the flag) — cite in the plan comment, do NOT duplicate defensively (D-82-8).

### 4. Encoded audit rows — shape from :5297–5303 (operator_promoted tx)

**Analog:** Phase 81's in-corridor audit tx — the row shape to copy verbatim:
```js
await db.tx(async () => {
  await db.run('update users set is_instance_admin = ? where id = ?', [1, row.id]);
  await db.run(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), row.id, row.id, 'operator_promoted', 0, clientIp(req), null, row.name, row.email, row.name, row.email, now()],
  );
});
```
For group deltas: `actor_id = target_id = row.id` (self-driven), `workspace_id = ws.id` (non-null, unlike operator rows), `action = 'group_membership_removed:group:<guid>:lost-claim'` etc. Console twin with the same 12-column shape: :6914–6924 (`operator_demoted` arm included).

**No precedent for the encoded action format** — the `action` column today holds free-text verbs only (`operator_promoted`, `operator_demoted`, the two D-T1 revoke verbs). Confirmed safe: the `/api/audit-log` verb filter (:6765–6808) compares only fixed verbs; unknown values match zero rows, never error. Colon-separated encoded strings are a NEW pattern — keep the D-82-9 format exactly (`group_<delta>:group:<guid>:<reason>`), reason vocabulary fixed: `lost-claim | mapped-lower | guard-refused | dead-workspace | archived-workspace`. GUID comes from `row.provenance.slice('group:'.length)` (server-side), never from claims.

**D-82-11 conversion note:** the :5284 `logSecurity` call disappears from the delta path (`sso_group_grant`/`sso_group_role_change` verbs move to audit_log rows per the updated pins at test :241, :277, :324, :402–403). `logSecurity` helper itself (:4961–4963) stays untouched for `sso_login`/`sso_invite_accepted` heartbeats.

### 5. Conditional on-conflict SET — edit site `server.js:4660–4664`

**Analog:** the existing clause:
```js
on conflict(workspace_id, user_id) do update set role = excluded.role, member_id = excluded.member_id
```
(no provenance clause today — D-81-7 preservation-by-omission). D-82-7 makes group provenance the only overwriting value; the recommended edit keeps Pin C green:
```sql
provenance = case when excluded.provenance like 'group:%'
                  then excluded.provenance
                  else memberships.provenance end
```
Rewrite the Phase 81 comment nearby and at :5282–5283 ("provenance keeps the row's ORIGINAL creation origin") to the D-82-7 role-source semantics.

### 6. Reconcile tests — extend `test/groups-sso.test.mjs`

**Analog patterns already in the suite (copy these idioms):**

| Idiom | Site | Reuse for |
|-------|------|-----------|
| `seedMapping(db, { guid, workspaceId, role })` | :111, :162, :394 | set up mapped workspaces |
| Direct group-row seed: `insert into memberships (..., provenance) values (..., 'group:<guid>')` | :391 (same idiom seeds `'invite'`) | seed group-derived rows to delete/downgrade |
| Two-login flow with fresh code per call | :387 + :395 (`code-viewer-up-1` → `code-viewer-up-2`) | grant login → mutate claims/mappings → removal login (`idp.tokenConfig` claims override) |
| `server.output()` stdout scan + no-PII regex assert | :236–237, :270–271 | assert loud logWarn on guard refusal, no GUID/email in the line |
| Fault injection via SQLite trigger | :344–346, :357 | fail-closed pin on the reconcile (throw → `/login?sso=error`, no partial writes) |
| `audit_log` count + actor/target assertions | :170–175, :182 | delta-row assertions per GS-04 |

**Pins that change expectation (D-82-7/D-82-11):**
- :401 `provenance, 'invite'` on group upgrade → expect `'group:<guid>'` (group writer only; invite/manual writers still preserve).
- :125 Pin C (invite auto-accept over group row) → UNCHANGED, must stay green.
- :241, :277, :324, :402–403 `security_log ... 'sso_group%'` verb pins → convert to `audit_log` action assertions.

---

## Shared Patterns

### Fail-closed corridor (D-81-11)
**Source:** server.js:5246–5251 comment + test pin :338–370.
**Apply to:** the entire reconcile. Any throw → existing catch → `/login?sso=error`, no partial login. Guard refusals and dead/archived skips are `continue`s, NOT throws — two distinct failure vocabularies.

### Count-before-write guard (owner funnel)
**Source:** server.js:3409–3411 (`ownerCount`), :7599/:7627/:7644 (templates).
**Apply to:** every delete AND owner-downgrade write, checked BEFORE the tx opens.

### AUD-01 (audit in the write's tx)
**Source:** server.js:5297–5303, :6911–6924.
**Apply to:** every delta row — forced audit failure rolls back the delta; never a write un-logged.

### Changes-only writes (D-81-5 extended)
**Source:** :5278 pre-compare.
**Apply to:** diff table cells — mapped == existing and immune (manual/invite/NULL) rows write nothing, audit nothing.

### Fixed logWarn strings, zero PII (D-81-10 posture)
**Source:** :5256, :5269; enforced by test regexes :237, :271.
**Apply to:** guard-refusal and archived-skip warn lines — no GUID, no email, no counts.

## Naming / Comment Conventions

- Comment prefix: `/* Phase 81 (D-81-x): ... */` → **`/* Phase 82 (D-82-x): ... */`** for new/rewritten blocks; when amending Phase 81 behavior, rewrite the old comment in place (do not stack a second block) and reference the amendment: e.g. `/* Phase 82 (D-82-7, amends D-81-7): provenance follows role ... */`.
- Encoded actions: `group_membership_removed`, `group_role_downgraded`, `group_role_upgraded`, `group_granted`, `group_membership_skipped` — format `group_<delta>:group:<guid>:<reason>`, split on first colon downstream (Phase 83).
- Fixed reason strings, lowercase-hyphenated: `lost-claim`, `mapped-lower`, `guard-refused`, `dead-workspace`, `archived-workspace`.

## Anti-Patterns (house doctrine)

- **No delete-then-reinsert:** one delta in place per workspace per login (D-82-10) — never clear-and-regenerate.
- **No global `provenance = excluded.provenance`:** clobbers group rows on invite auto-accept and breaks Pin C (:105–125) + the Phase 81 viewer pin (:379–401 pre-update). Conditional `case` clause or dedicated group update — decide in plan.
- **No provenance clobber for non-group writers:** manual/invite/NULL rows stay at creation origin and are immune to delete AND downgrade — predicate `provenance like 'group:%'` selects only group-derived rows (GS-01/GS-03).
- **Never parse the delete GUID from a live mapping row:** mappings can be deleted between logins — parse from `provenance`.
- **Overage never behaves as empty:** the reconcile lives entirely inside the `else` at :5257; a pre-seeded group row must SURVIVE an overage login (extend the :226 test pattern).
- **No fatal guard refusal:** skip + logWarn + audit `guard-refused`, login proceeds (GS-02); route-style 409s do not translate to the login corridor.
- **No audit rows outside the delta tx** (AUD-01), **no touching `is_instance_admin`** (D-82-8), **no unmapped-surface writes:** no group-derived rows + no pending grants → zero writes, zero delta audit rows (byte-identical regression).
- **Guideline:** delete tx mirrors the route tx EXACTLY (:7628–7633) — omitting `team_members` or `stripMember` orphans authority rows and the doc profile (research Pitfall 3).

## No Analog Found

| Surface | Role | Reason |
|---------|------|--------|
| Encoded `group_*:group:<guid>:<reason>` action strings | audit naming | No precedent — `audit_log.action` holds flat verbs only; new format, cite :6765–6808 filter safety |
| Conditional SQL `case` in on-conflict | model | No conditional-SET precedent in server.js writes (grep `case when excluded` — none); plain SQL, low risk |

## Metadata

**Analog search scope:** server.js (corridor :5240–5320, addMembership :4635–4669, ownerCount :3405–3412, logSecurity :4958–4965, leave/member routes :7595–7664, operator promote/demote :6880–6924); test/groups-sso.test.mjs :100–409.
**Files scanned:** 3
**Pattern extraction date:** 2026-11-20
**Anchor verification:** all cited line numbers read live this session (post-Phase-81 drift state).
