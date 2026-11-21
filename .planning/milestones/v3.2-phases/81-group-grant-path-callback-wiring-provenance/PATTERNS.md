# Phase 81: Group Grant Path — Callback Wiring + Provenance — Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 5 (server.js grant block + helper, addMembership, server.js SCHEMA + db-adapter.mjs mirrors, test/groups-sso.test.mjs NEW; groups.js = import-only, NO edits)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server.js` grant-block helper (inserted ~:5240, inside callback try) | service (inline route logic) | event-driven (login-driven writes) | inline SSO-07 reconcile block `server.js:5241–5305` + console promote tx `:6847–6867` | exact |
| `server.js` `addMembership` :4632–4669 (+ 6 caller sites, 2 direct-insert sites) | service | CRUD | itself — extend signature; direct-insert analogs at :7010/:7111 | exact |
| `server.js` SCHEMA memberships DDL (~:585–598 area) + `db-adapter.mjs` :214–220 | schema/migration | batch | archived column migration `server.js:656–660` (`adapterEnsureColumn` block) | exact |
| `groups.js` | utility (pure resolver) | transform | **NO EDITS** — Phase 80 shipped, test-locked. Import `resolveGroupsClaim` + `resolve` only | n/a (read-only) |
| `test/groups-sso.test.mjs` (NEW) | test | integration (HTTP + db asserts) | `test/domain-admission-sso.test.mjs` (whole-file structure); `runFlow` from `test/oidc-sso.test.mjs:140–156` | exact |

## Pattern Assignments

### Grant-block helper — `server.js` insertion at :5240 (between backstop end :5239 and DP-5 comment :5241)

**Analog:** the SSO-07 reconcile block `server.js:5241–5305` (same corridor, same "resolve-then-write-then-log" shape) and console promote `:6817–6868`.

**Placement rule (research Pitfall 1):** strictly AFTER the oidc_identities concurrency backstop (`:5229–5239` — `catch (err)` re-resolves `row`; crossing it means grants keyed to a stale `row.id`). Inside the existing `try` (:5131) → any throw funnels to `errorRedirect()` (D-81-11).

**House helper calls to reuse (verbatim signatures):**
```js
// server.js:189–190 — single-argument, message-string interpolation style
const logInfo = msg => logLine('info', msg);
const logWarn = msg => logLine('warn', msg);
// server.js:4956–4958 — verb-keyed, no CHECK constraint on verb
async function logSecurity(userId, verb) {
  await db.run('insert into security_log (id, user_id, verb, created_at) values (?,?,?,?)', [uid(), userId, verb, now()]);
}
```

**Claim-ingestion shape (per RESEARCH §7):**
```js
const claimState = resolveGroupsClaim(claims);        // groups.js four-outcome, never throws
if (claimState.state === 'unmapped') {
  if (claimState.reason === 'overage') logWarn('sso groups claim overage — treating as unmapped'); // D-81-10 fixed msg
} else {
  const mappings = await db.all('select group_guid, workspace_id, role, kind from group_mappings');
  const { grants, operatorFlag } = resolve(claimState.groups, mappings);
  ...
}
```

**Upgrade-only pre-compare (D-81-2/3, Pitfall 2):** read existing membership row, skip when `RANK[mapped] <= RANK[existing]` — do NOT call `addMembership` unconditionally (its on-conflict UPDATE is an unconditional write, breaking D-81-5 changes-only). Callback-local rank const only:
```js
const ROLE_RANK_WITH_VIEWER = { owner: 3, admin: 2, member: 1, viewer: 0 };
```
**Do NOT add viewer to `groups.js` ROLE_RANK (:120) — test-locked Phase 80 surface** (Pitfall 5).

**Workspace legitimacy/dead-ws check (D-81-8):** `db.get('select * from workspaces where id = ?')` then archived flag skip+logWarn — archived flag pattern at `server.js:377/:660`; never fatal, no refusal keys.

**Operator self-grant tx (D-81-4):** mirror `:6843–6867` EXACTLY, but actor = target = granted user:
```js
const out = await db.tx(async () => {
  await db.run('update users set is_instance_admin = ? where id = ?', [1, row.id]);
  await db.run(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), row.id, row.id, 'operator_promoted', 0, clientIp(req), null, row.name, row.email, row.name, row.email, now()],
  );
});
```
Audit row MUST share the tx (AUD-01, Pitfall 6). `clientIp(req)` precedent at `:5334`/`:6857`; `is_instance_admin` read path `:4892`.

**DP-5 guard rewrite (D-81-1):** exactly ONE site, `server.js:5249`:
```js
if (!(await db.get("select 1 from memberships where user_id = ? and (provenance is null or provenance not like 'group:%')", [row.id]))) {
```
Do NOT filter any other membership read (Pitfall 4).

### `addMembership` — `server.js:4632–4669`

**Analog:** itself; caller-threading analog = SSO-07 auto-accept call at `:5272–5283` (positional args incl. teams).

**Change:** signature → `addMembership(ws, user, role, teams = [], provenance = null)`; INSERT values gain `provenance`; **ON CONFLICT SET stays `role, member_id` ONLY** (D-81-7 — Pitfall 3):
```js
`insert into memberships (workspace_id, user_id, role, member_id, team, scope, provenance) values (?,?,?,?,?,?,?)
 on conflict(workspace_id, user_id) do update set role = excluded.role, member_id = excluded.member_id`,
[ws.id, user.id, role, memberId, null, provenance],
```

**Caller stamps (D-81-6):** :3582 `manual`, :4711 `manual`, :5272 `invite`, :8490 `invite`, :9247 `manual`; direct inserts :7010 and :7111 → `, null` provenance (planner discretion to convert to facade).

### Schema mirrors — `server.js` SCHEMA (~:585–598 memberships DDL) + `db-adapter.mjs:214–220`

**Analog:** migration block `server.js:656–670` — one `adapterEnsureColumn` line per column, each with a dated D-xx citation comment:
```js
// server.js:658–661 house shape
// Phase 79 (D-02): soft-archive flag — def byte-identical to the SCHEMA
// declaration (Pitfall P-B).
await adapterEnsureColumn('workspaces', 'archived', 'integer not null default 0');
await adapterEnsureColumn('memberships', 'member_id', 'text');
```
**Change:** add `await adapterEnsureColumn('memberships', 'provenance', 'text');` after the `team` line (:663); add `provenance text` to BOTH memberships DDLs (server.js SCHEMA + `db-adapter.mjs:214–220`, after `member_id`) — **mirrors must be byte-identical** (db-adapter mirror test enforces). pg: plain text, no `pgSchemaVariant` change. No index this phase.

### `test/groups-sso.test.mjs` (NEW)

**Analog:** `test/domain-admission-sso.test.mjs` — copy whole-file skeleton:

- Header comment block citing phase + decisions (:1–7).
- Imports: `node:assert/strict`, `node:test { after, before, test }`, `./helpers/oidc-idp.mjs { idp, startMockIdp }`, `./helpers/server.mjs { startServer, withDb, ... }` (:8–14).
- `nav()` manual-redirect fetch helper (:19–24), cookie/query extractors (:26–28).
- `before`/`after` mock-IdP lifecycle (:32–38).
- `runFlow` (:43–51) / verbatim twin in `test/oidc-sso.test.mjs:140–156`:
```js
idp.tokenConfig = { code, claims: { nonce: q.get('nonce'), ...claims } };
```
  Groups claim injection: `claims: { ..., groups: ['guid-a'] }` or overage via `{ _claim_names: { groups: 'src1' } }`.
- `oidcEnv()` factory (:53) — reuse verbatim.
- Per-case `startServer({ env })` + `try/finally server.stop()` (:69–92).
- Seeding via `withDb(server.dbPath, db => db.prepare('insert into group_mappings ...').run(...))` (DDL server.js:616–627; `kind` default 'workspace'; unique (group_guid, workspace_id)).
- Assertions: memberships rows + provenance, `users.is_instance_admin`, `audit_log` action/actor/target, `security_log` verbs, `server.output()` for the overage logWarn line (DP-4 test :84–88 is the log-line assertion template).
- Archived fixture: `update workspaces set archived = 1` via withDb.

## Shared Patterns

### Fail-closed funnel (D-81-11)
**Source:** `server.js:5122–5129` (`errorRedirect`) — every grant-path failure mode is either skip+logWarn (D-81-8, D-81-10) or a plain throw caught by the existing `try` → generic `/login?sso=error`. Never a new redirect param, never a cause-revealing message.

### Comment doctrine
**Source:** block-comment style throughout server.js — every non-obvious block opens with a dated/cited comment (`/* Phase 79 (D-02): … */`, `/* DP-4 (Phase 76, DOM-06): … */`, `/* AUD-01/D-R3: … */`). New code cites `Phase 81 (D-81-x)` per decision. Comments explain WHY + invariants ("MUST NOT", "fail closed", "never a parallel write"), not what.

### Logging
- `logInfo/logWarn` = single interpolated string, lowercase-prefixed verb style: `'sso groups claim overage — treating as unmapped'` (matches `'sso signup domain refused — domain: …'` :5211, `'sso login …'`). PII ban (D-09/V7): never GUIDs, counts, emails, or claim content in the overage line (D-81-10).
- `logSecurity(userId, verb)` for user-attached security verbs; new verbs `sso_group_grant`, `sso_group_role_change` (no CHECK constraint, :4956).
- `audit_log` full-row only for the operator flag flip, inside `db.tx`.

### Transaction discipline
`db.tx` = atomic multi-write with audit row sharing the tx (console promote :6847–6867; addMembership :4654–4667). Never audit outside the tx that performs the change.

## Anti-Patterns to Avoid

1. **Crossing the concurrency backstop** (:5229–5239) — insert strictly at :5240.
2. **Unconditional addMembership on existing rows** — pre-compare rank, skip no-ops (D-81-5).
3. **Provenance in ON CONFLICT SET** — clobbers creation origin (D-81-7).
4. **"Helpfully" provenance-filtering other membership reads** — exactly one guard site (:5249).
5. **Viewer in groups.js ROLE_RANK** — test-locked Phase 80 contract; callback-local map only.
6. **Audit outside db.tx** — forced audit failure must roll back the promotion.
7. **Interpolating claim content/GUIDs/counts into the overage logWarn** — fixed message (D-81-10).
8. **Moving grants after the 2FA branch** — grants are server state; challenge gates the cookie only.
9. **Schema mirror drift** — server.js SCHEMA and db-adapter.mjs memberships DDL must stay byte-identical.
10. **New redirect params / refusal keys on the callback path** — the ONE `errorRedirect` surface (D-81-11), like DP-4's no-oracle redirect (:75–76 of the test).

## No Analog Found

None — every unit maps to an in-corridor analog. (`groups.js` needs no analog: import-only, contract fixed at groups.js:85–154.)

## Metadata

**Analog search scope:** server.js (:585–670, :189, :4630–4675, :4950–4960, :5121–5315, :6815–6870), db-adapter.mjs (:214–225), groups.js (full), test/domain-admission-sso.test.mjs (:1–130), test/oidc-sso.test.mjs (:140–156 via RESEARCH, verified structurally)
**Pattern extraction date:** 2026-11-20
