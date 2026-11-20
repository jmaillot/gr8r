# Phase 80: Group Mapping Core — Parser, Resolver, Overage Detection — Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 8 (3 new, 5 modified)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `groups.js` (NEW) | utility (pure module) | transform | `domains.js` | exact |
| `groups.js` claim resolver | utility | transform | `oidc.js` fail-closed contract | role-match |
| `test/groups-core.test.mjs` (NEW) | test | — | `test/domains-*.test.mjs` (node:test pure-unit suites) | exact |
| `test/groups-config-api.test.mjs` (NEW) | test (integration) | request-response | `test/oidc-sso.test.mjs` + `test/helpers/server.mjs` | exact |
| `server.js` SCHEMA (MODIFIED) | model (DDL) | CRUD | `memberships`/`invites` role-CHECK tables (server.js:375-404) | exact |
| `db-adapter.mjs` SQLITE_SCHEMA (MODIFIED) | model (DDL mirror) | CRUD | verbatim mirror of server.js SCHEMA (db-adapter.mjs:146+) | exact |
| `server.js` save route (MODIFIED) | controller | request-response | operator-flag route `server.js:6791-6824` | exact |
| `server.js` boot warning (MODIFIED) | config/boot | event-driven (boot) | D-06/D-11 boot log lines `server.js:9293-9307` | exact |
| `src/locales/*.json ×5` (MODIFIED) | config (i18n) | — | `err.operatorOnly` `src/locales/en.json:1776` | exact |
| `test/dependencies.test.mjs` (MODIFIED) | test (contract) | — | self (G-75-3 domains.js precedent, lines 91-104) | exact |

## Pattern Assignments

### `groups.js` (NEW — pure parser/validator/resolver module)

**Primary analog:** `domains.js` (full read, 92 lines) — same role + data flow: pure exported
functions, no ambient state, canonicalize-then-strict-shape-validate, keyed `{code,message}|null`
funnel.

**Module header + server-only rule** (from `oidc.js:1-8` — the sibling-module convention):
```js
/* =====================================================================
   ... Server-side only: NOT under src/ so Vite never bundles server crypto
   (same rule as totp.js / mailer.js).
   ===================================================================== */
```
groups.js must carry the same header rule (server-only, never imported from `src/`).

**Canonicalization pattern** (domains.js:24-29) — copy for GUID canonicalization
(lowercase before the uniqueness index so `{BRACED}`/uppercase pastes collapse):
```js
export const canonicalizeDomain = domain =>
  String(domain || '')
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.$/, '');
```

**Shape-regex constant** (domains.js:48) — the `DOMAIN_SHAPE` naming/shape precedent; groups.js
adds `GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`:
```js
const DOMAIN_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
```

**Keyed-refusal funnel contract** (domains.js:86-92) — copy verbatim for the save-API validators:
`null` = valid, `{code, message}` = refusal. This is the house shape (mirrors
`validateGuestInviteShape`):
```js
export function emailDomainRefusal(email, domains, code = 'signupDomainNotAllowed', message = '...') {
  if (!domains) return null; // door off — fail-open (unset)
  ...
  if (domain === null || !domains.has(domain)) return { code, message }; // exact membership only
  return null;
}
```

**Fail-closed reason-chain return shape** (oidc.js:88-123) — the resolver/overage detector
returns `{ ok/false-branch, reason }`-style discriminated results, never throws:
```js
export function verifyIdToken(idToken, jwkByKey, { issuer, audience, nonce, now }) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'shape' };
  ...
  return { ok: true, claims };
}
```
`resolveGroupsClaim(claims)` should follow this: every abnormal claim shape returns a
`{ state: 'unmapped', reason: 'overage'|'missing'|'shape' }` — never `[]` (PITFALLS removal-sync
trap).

**DB access injected:** per CONTEXT ("workspace existence check hook") — groups.js takes a
lookup function/callable, like domains.js takes `domains`/`name` as parameters and reads no
`process.env` inside its pure functions (domains.js:50-52 comment).

### `test/groups-core.test.mjs` (NEW — pure unit suite)

**Analog:** existing node:test pure-unit suites (`test/domains-*.test.mjs` family). Shape:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDomainList } from '../domains.js';
```
No server boot; imports `groups.js` directly. Pin the FOUR fixtures (CONTEXT decision):
1. `_claim_names` present alone → unmapped/overage
2. `_claim_names` + `_claim_sources` → unmapped/overage
3. missing `groups` claim → unmapped/missing
4. `groups: []` → genuinely-empty (distinct outcome)

### `server.js` SCHEMA — `group_mappings` table (MODIFIED)

**Analog:** `memberships` table (server.js:375-381) — the role-CHECK precedent, plus `invites`
(:397-404). Copy the DDL style verbatim (lowercase SQL, aligned columns, D-tag comments):
```js
create table if not exists memberships (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  role         text not null check (role in ('owner','admin','member','viewer')),
  member_id    text,
  primary key (workspace_id, user_id)
);
```
For `group_mappings`, the role CHECK narrows to the CONTEXT-locked 3-token set
(`'owner','admin','member'`) and the workspace reference **omits `on delete cascade`**
(dead mappings must survive — D-82-6). Suggested shape from RESEARCH Pattern 2:
```sql
create table if not exists group_mappings (
  id           text primary key,
  group_guid   text not null,
  workspace_id text not null,        -- NO cascade: dead mappings survive (D-82-6)
  role         text not null check (role in ('owner','admin','member')),
  label        text,
  created_by   text references users(id) on delete set null,
  created_at   integer not null,
  updated_at   integer not null
);
create unique index if not exists group_mappings_pair on group_mappings(group_guid, workspace_id);
```

### `db-adapter.mjs` SQLITE_SCHEMA (MODIFIED)

**Analog:** the mirror itself (db-adapter.mjs:141-165). Add the IDENTICAL table text to
`SQLITE_SCHEMA`, mirroring server.js SCHEMA verbatim modulo comments. The mirror test
(`test/db-adapter.test.mjs:245-250`) normalizes both (strip comments + whitespace) and deepEquals
— drift fails `npm test`:
```js
test('SQLITE_SCHEMA mirror stays identical to server.js SCHEMA modulo comments/whitespace', () => {
  const normalize = sql => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
  const expected = `${normalize(SERVER_SCHEMA)} create unique index if not exists workspaces_slug_idx on workspaces(slug);`;
  assert.equal(normalize(adapter.SQLITE_SCHEMA), expected, 'the adapter mirror drifted from server.js SCHEMA');
});
```
Note: the TABLES list at `test/db-adapter.test.mjs:252+` may also enumerate table names — check
and add `group_mappings` there too. Avoid `collate nocase` in the new table (pg-variant strips
it; never introduce pg-incompatible DDL, db-adapter.mjs:141-145 doc).

### `server.js` save route (MODIFIED)

**Analog:** operator-flag route `server.js:6791-6824` — the exact gate order house pattern:
```js
const operatorFlagMatch = pathname.match(/^\/api\/auth\/operator\/users\/([A-Za-z0-9_-]{1,64})\/(promote|demote)$/);
if (operatorFlagMatch && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  // D-112: the gate reads the DB flag only — never workspace role, never env.
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const target = await db.get('select ... from users where id = ?', [operatorFlagMatch[1]]);
  if (!target) return fail(res, 404, 'notFound', 'Not found');
  ...
}
```
Order is mandatory: `sameOrigin → requireUser → isInstanceAdmin → THEN validate guid/workspace/role`
— operator gate BEFORE any target lookup (no existence leak, no 403-vs-400 oracle for
non-operators). Only after all validation passes does the INSERT run (nothing invalid stored).

**Keyed refusal funnel** (server.js:4706-4712):
```js
/* The single error constructor beside json(): every HTTP error payload leaves
   here, so no route builds an error object by hand. `code` is the machine
   identifier the client translates; `message` stays the English string the
   client falls back to when it does not know the code. */
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
```
Define refusal codes: malformed GUID, unknown workspace, invalid role token, duplicate
(guid, workspace) pair — each a `fail(res, 400, '<code>', '<message>')`.

**Route registration shape:** regex match on `pathname` + `method === 'POST'` at the top of the
route dispatch (same file, same style as :6796-6797). ID generation uses the house
`const uid = () => crypto.randomUUID();` (server.js:726).

### `server.js` boot dead-mapping warning (MODIFIED)

**Analog:** D-06/D-11 boot log block `server.js:9293-9307` — grep-able, source-tagged, one line
per concern, placed in the boot `logInfo` block:
```js
/* D-06 (Phase 75): one grep-able, source-tagged line per admission var —
   `docker logs` answers "how are the doors configured". */
const domainListLog = list => (list === null ? 'off' : ...);
logInfo(`domains: ALLOW_SIGNUP_DOMAINS: ${domainListLog(SIGNUP_DOMAINS)} (source: own)`);
...
/* Phase 78 (WSG-03, D-11 style): one grep-able line ... */
logInfo(`workspace creation: ${WORKSPACE_CREATION ? 'open ...' : 'closed ...'}`);
```
Placement: after the workspace-creation line (:9307), inside the same listener. With zero
mappings, log exactly one `group mappings: off`-style line (matching this vocabulary) and run no
dead-mapping query — byte-identical boot is a standing criterion. With mappings, dead rows
(workspace_id not in workspaces) emit one `logWarn` line each (D-82-6 boot half).

### `src/locales/*.json ×5` (MODIFIED)

**Analog:** `err.operatorOnly` at `src/locales/en.json:1776` — the keyed-refusal naming
precedent. Add `err.<code>` keys for each new refusal code to `en/fr/nl/de/es` in the SAME
commit as the save route (5-locale parity test auto-covers; standing constraint).

### `test/dependencies.test.mjs` (MODIFIED)

**Analog:** self, lines 91-104 — the Phase 75 G-75-3 precedent for adding a runtime-imported
file. Append `groups.js` to the exact COPY-target deepEqual AND update the message string:
```js
// Phase 75 (UAT G-75-3): server.js and mcp.js import domains.js at runtime — ship it too (boot crash without it).
assert.deepEqual(
  copyTargets.sort(),
  ['db-adapter.mjs', 'dist', 'domains.js', 'export', 'mailer.js', 'mcp.js', 'node_modules', 'oidc.js', 'search-terms.mjs', 'seed.json', 'server.js', 'src', 'totp.js', 'tz.js', 'webhook-formats.js', 'webhook-retry.js', 'webhook-ssrf.js'],
  `the runtime stage must copy exactly ... (D-12 as amended by ...)`,
);
```
Add `'groups.js'` (alphabetical slot) plus a `// Phase 80: server.js imports groups.js at runtime — ship it too (boot crash without it).` comment line. Missing this fails `npm test` the moment server.js imports groups.js.

## Shared Patterns

### Keyed-refusal funnel (`null | {code, message}`)
**Source:** `domains.js:86-92` (validator side), `server.js:4710` (HTTP side)
**Apply to:** groups.js validators AND every save-API refusal
```js
if (domain === null || !domains.has(domain)) return { code, message };
return null;
// HTTP: fail(res, 400, code, message) → { error, code } → err.<code> in 5 locales
```

### Operator gate BEFORE target lookup (no-oracle)
**Source:** `server.js:6791-6802`
**Apply to:** the save/refuse route only
```js
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', ...);
const operator = await requireUser(req, res); if (!operator) return;
if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
// only NOW validate guid shape / workspace existence / role token
```

### Canonicalize-then-validate, Set/dedupe idempotent
**Source:** `domains.js:24-29, 48-72`
**Apply to:** GUID handling (lowercase-hyphenated before the unique index)

### Fail-closed discriminated returns, never throws on bad input
**Source:** `oidc.js:88-123`
**Apply to:** `resolveGroupsClaim` — every abnormal claim shape returns `{ state: 'unmapped', reason }`; never `[]`

### Additive DDL, dual-mirror discipline
**Source:** `server.js:290+` SCHEMA ↔ `db-adapter.mjs:146+` SQLITE_SCHEMA; pinned by `test/db-adapter.test.mjs:245-250`
**Apply to:** `group_mappings` — write BOTH, no `collate nocase`, no `adapterEnsureColumn` needed (new table via `create table if not exists`)

### Grep-able boot log line vocabulary
**Source:** `server.js:9293-9307`
**Apply to:** boot mapping-status line + dead-mapping warnings

### Server-only module rule
**Source:** `oidc.js:5-8`
**Apply to:** `groups.js` header comment + never import from `src/`

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none — every new/modified file has a strong in-repo analog) | | | |

Note: the `group_mappings` table with a NON-cascading workspace FK has no verbatim precedent
(every existing workspace reference cascades) — the FK omission is a deliberate deviation per
CONTEXT D-82-6; `invites.workspace_id` (nullable cascade, server.js:403) is the closest DDL
neighbor for reference-column style.

## Metadata

**Analog search scope:** repo root (`domains.js`, `oidc.js`, `server.js`, `db-adapter.mjs`), `test/` (dependencies, db-adapter), `src/locales/`
**Files scanned:** ~12 (4 full or large reads, targeted Grep/Glob for the rest)
**Pattern extraction date:** 2026-11-20
