# Phase 83: Governance — Workspace Rename & Slug Edit - Research

**Researched:** 2026-11-20
**Domain:** In-repo full-stack feature — new operator API routes (server.js), governance page UI (src/pages/governance.js + src/actions/actions.js), 5-locale i18n, node:test suites
**Confidence:** HIGH (this is an internal-codebase phase; every claim below was verified by reading the source this session — no external packages or APIs involved)

## Summary

Phase 83 is a pure in-repo feature: two new operator routes (`POST /api/auth/operator/workspaces/:id/rename`, `GET /api/auth/operator/dead-mappings`), an Edit modal on the governance page, a dead-mapping warning card, and keyed 5-locale errors. **The entire slug-validation/collision stack already exists and is directly reusable** — `sanitizeSlug` (server.js:941), `uniqueSlug(base, excludeId)` (server.js:947 — the second parameter already supports excluding the workspace being renamed, exactly what self-collision handling needs), and `wsBySlug` (server.js:958). The user-facing `PATCH /api/workspaces/:id` route (server.js:7676–7700) already implements name+slug editing for workspace admins with the same keyed refusals — the operator route mirrors it but with the Phase 79 operator guard order.

The guard-order template is the Phase 79 archive route (server.js:7111–7144): sameOrigin FIRST (before any body read or throttle) → requireUser → operator-keyed throttle → `isInstanceAdmin` gate BEFORE any target lookup (no existence oracle) → target fetch. The rename route must copy this verbatim; the only addition is reading the body after the gate and running the slug checks.

The dead-mapping warning card has two verified data sources: (a) the boot-time orphan predicate at server.js:9616–9624 (group_mappings rows whose `workspace_id` is absent from `workspaces` — the non-cascading FK deliberately leaves them), moved into an on-read route per D-09; and (b) Phase 82's encoded audit trail — guard-refused rows carry action `group_<delta>:group:<guid>:guard-refused` [VERIFIED: server.js:5307–5314] and grant-side skips carry reasons `dead-workspace` / `archived-workspace` [VERIFIED: server.js:5356–5365]. Rendering splits each action string on the first colon per D-82-9.

**Primary recommendation:** Mirror the Phase 79 archive route guard order verbatim for the rename route; reuse `sanitizeSlug`/`uniqueSlug(slug, ws.id)`/`wsBySlug` with no new vocabulary; add `invalidSlug`/`slugTaken` literals explicitly at the server.js call site; query the dead-mapping sources on read (zero rows → hidden card); pin D-82-5 (old slug exact 404, no Location header) in a new `test/governance-rename.test.mjs`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01 row edit modal (Name+Slug) mirroring govOrphanPick/confirmArchive patterns · D-02 per-row Edit beside govArchive/govUnarchive/govDeleteAsk, operator-gated · D-03 confirm ONLY when slug changed; name-only saves directly; confirm body warns old slug will 404 permanently, old slug bold, archive-style dialog · D-04 reuse workspace-creation slug rules verbatim (`sanitizeSlug`, `invalidSlug`/`slugTaken`) · D-05 new route `POST /api/auth/operator/workspaces/:id/rename` with `{name, slug}`, guard order: sameOrigin → requireUser → operator throttle → operator gate BEFORE target lookup; stays in Phase 79 operator family (user-facing /api/workspaces never extended) · D-06 rename audit via logInfo `(governance)` line, no audit_log row · D-07 slug collision returns existing `409 slugTaken` with `uniqueSlug` suggestion; modal offers one-click adopt · D-08 warning card lists BOTH orphaned group_mappings rows AND Phase 82 trail rows (format `group_<delta>:group:<guid>:<reason>`, split on first colon); no heuristic deleted-GUID detection · D-09 derived on read via `GET /api/auth/operator/dead-mappings`; no schema change, no boot snapshot · D-10 top warning card above workspaces table, operator-gated, hidden entirely when zero dead items · D-11 display-only, no mutation actions · D-12 keyed refusals ship with 5-locale translations in the SAME commit as the first emitting gate; refusal literals EXPLICIT at server.js call site; data-a/data-r pins updated same change · D-13 new `test/governance-rename.test.mjs`; client assertions extend `test/governance-client.test.mjs` · D-14 no new e2e (Phase 84) · D-15 regression pin: after rename, old slug URL = exact 404, NO Location header.

### the agent's Discretion
Modal markup/key naming (escape `label` at first render — carried XSS watch-item) · dead-mappings trail lookback window · throttle budget (mirror archive route unless reason not to) · logInfo wording (keep `(governance)` convention, old→new slug visible) · whether archived workspaces are renameable (decide in planning, document).

### Deferred Ideas (OUT OF SCOPE)
Dead-mapping cleanup actions + full mapping editor UI · deleted-group-GUID heuristic detection · rename e2e spec (Phase 84).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GV-01 | Operator edits workspace name+slug from /governance with server validation, collision refusal, keyed 5-locale errors | Reuse sanitizeSlug/uniqueSlug/wsBySlug (server.js:941–960); mirror PATCH ws route semantics (server.js:7676–7700) under operator guard order; `err.invalidSlug`/`err.slugTaken` keys already exist in all locales (en.json:1794–1795) — verify other 4 locales; new keys (confirm/edit/warning toasts) need 5-locale addition |
| GV-02 | Old slug 404s with no redirect; slug-change requires confirm | wsBySlug is the only slug resolver (server.js:9026, 9452, 4913) — no redirect machinery exists anywhere, so 404 is the default behavior; D-15 test pin locks it. Confirm = confirmDlg with typeName-style pattern (actions.js:4655–4682) |
| GV-03 | Operator console warning section lists dead mappings | Orphan predicate (server.js:9616–9624) + Phase 82 encoded trail (`group_<delta>:group:<guid>:guard-refused` server.js:5307–5314; `dead-workspace`/`archived-workspace` skip reasons server.js:5365); on-read route per D-09 |
</phase_requirements>

## Standard Stack

### Core
Zero new dependencies — `test/dependencies.test.mjs` pins the invariant. Everything uses existing in-repo primitives.

| Facility | Location | Purpose | Why Standard |
|---------|----------|---------|--------------|
| `sanitizeSlug` / `SLUG_RE` / `RESERVED_SLUGS` | server.js:941–944, 278–279 | Slug validation | The verbatim creation-time rules (D-04); `SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/`, `RESERVED_SLUGS = new Set(['api', 'w', 'join', 'assets', 'static', 'health', 'login', 'signup', 'onboarding', 'settings', 'admin'])` [VERIFIED: server.js:278–279] |
| `uniqueSlug(base, excludeId)` | server.js:947–956 | Collision suggestion | Already takes `excludeId` and queries `where slug = ? collate nocase and id is not ?` [VERIFIED: server.js:947–956] — pass the renamed ws id for rename-time self-exclusion and suggestions |
| `wsBySlug(slug)` | server.js:958–960 | Collision check | Case-insensitive (`collate nocase`) — collisions must use it, not `=` |
| `fail(res, status, code, msg, extra?)` | server.js (existing helper) | Keyed refusal | 409 pattern with payload: `fail(res, 409, 'slugTaken', 'That URL is already taken', { suggestion: await uniqueSlug(slug) })` [VERIFIED: server.js:7469] |
| `confirmDlg` | src/actions/actions.js | Confirm dialog | Archive/delete precedent with `typeName` type-to-confirm [VERIFIED: src/actions/actions.js:4655–4682] |
| `tooMany(key, n, ms)` | server.js | Operator throttle | Archive uses `tooMany(\`op-ws-archive\|${operator.id}\`, 5, 15 * 60 * 1000)` [VERIFIED: server.js:7117] |

### Alternatives Considered
None — decisions D-01..D-15 lock the approach; no external alternatives exist in a zero-dependency codebase.

**Installation:** none.

## Package Legitimacy Audit

Not applicable — this phase installs zero external packages (`test/dependencies.test.mjs` invariant). No registry checks required.

## Architecture Patterns

### System Architecture Diagram

```
Operator on /governance
        │
        ▼
governance.js page (operator-gated route) ── loads workspaces list + dead-mappings on refresh
        │                                      │
        │ Edit button (per row)                │ GET /api/auth/operator/dead-mappings
        ▼                                      ▼
Edit modal (Name + Slug fields)        dead-mappings route (sameOrigin → requireUser →
        │                              operator gate; no throttle if read-only)
        │ Save                                 │
        │                                      ├─ query A: group_mappings LEFT-JOIN workspaces
        ▼                                      │  (orphan workspace_id rows, incl. label+guid)
POST /api/auth/operator/workspaces/:id/rename  ── query B: recent audit_log rows
        │                                        LIKE 'group_%:group:%' (Phase 82 trail)
        ├─ sameOrigin → requireUser → throttle → isInstanceAdmin → fetch ws by id
        │
        ├─ name: trim/slice(0,60), refuse workspaceNameRequired
        ├─ slug changed? sanitizeSlug → invalidSlug (400) →
        │   wsBySlug excluding self → slugTaken 409 {suggestion: uniqueSlug(slug, ws.id)}
        ├─ update row + logInfo `workspace renamed ... (governance)` old→new
        ▼
{workspace} → modal closes → table refresh + toast
(err path: keyed refusal toast via govRefusalToast pattern)
```

Decision points: slug-changed → confirm dialog first (D-03); zero dead items → card hidden entirely (D-10/D-11); non-operator on either route → exact `403 operatorOnly`, no target lookup (SC4, no existence leak).

### Recommended Project Structure

No new files except tests. Touch points:

```
server.js                          # rename route + dead-mappings route (inside the Phase 79
                                   #   operator family block, ~line 7110+; dead-mappings can
                                   #   sit near the mappings save route ~7345)
src/core/api.js                    # operatorWsRename(id, {name, slug}) + operatorDeadMappings()
src/pages/governance.js            # Edit row action markup + warning card render + modal body
src/actions/actions.js             # A.govEditAsk / A.govRenameSave + confirm fork (D-03)
src/locales/{en,fr,nl,de,es}.json  # page.governance.* + toast.* keys (5 locales, same commit)
test/governance-rename.test.mjs    # NEW server suite (D-13)
test/governance-client.test.mjs    # extend with client-source assertions
test/i18n-toast.test.mjs           # update data-a / data-r count pins (currently 572 / 62) [VERIFIED: test/i18n-toast.test.mjs:301,303]
```

### Pattern 1: Operator route guard order (copy verbatim)

**What:** sameOrigin → requireUser → operator-keyed throttle → operator gate → target lookup.
**When to use:** both new routes.
**Example:**
```js
// Source: server.js:7111–7125 (archive route — re-verify exact lines before editing)
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
const operator = await requireUser(req, res);
if (!operator) return;
if (tooMany(`op-ws-rename|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
const ws = await db.get('select id, slug, name, archived from workspaces where id = ?', [match[1]]);
if (!ws) return fail(res, 404, 'notFound', 'Not found');
```
Governance routes NEVER ride `requireWorkspace` — rows are fetched by id so archived workspaces stay actionable [VERIFIED: server.js:7091–7099 comment block].

### Pattern 2: Keyed refusal with explicit literal + suggestion payload

**What:** refusal codes passed explicitly at the server.js call site (error-codes reverse-parity test greps server.js source; default codes inside a module stay invisible to it — Phase 80-02 lesson).
**Example:**
```js
// Source: server.js:7467–7469 (creation route — the exact shape D-04 mandates)
const slug = sanitizeSlug(body.slug);
if (!slug) return fail(res, 400, 'invalidSlug', 'Use 2–40 lowercase letters, numbers, or hyphens');
if (await wsBySlug(slug)) return fail(res, 409, 'slugTaken', 'That URL is already taken', { suggestion: await uniqueSlug(slug) });
```
Rename variant: self-collision. Either compare `next !== ws.slug` before the check (PATCH route pattern, server.js:7686) or use `uniqueSlug(next, ws.id)` for the suggestion. Note `wsBySlug` alone cannot exclude self — check `found.id !== ws.id` or gate on slug-changed first (recommended: gate first, matching D-03/D-04).

### Pattern 3: Dead-mapping orphan predicate (boot parity)

**What:** the boot loop is the source of truth for query A.
**Example:**
```js
// Source: server.js:9616–9624
const groupMappings = await db.all('select group_guid, workspace_id from group_mappings');
const wsIds = new Set((await db.all('select id from workspaces')).map(r => r.id));
for (const m of groupMappings) {
  if (!wsIds.has(m.workspace_id)) logWarn(`group mapping dead: group ${m.group_guid} → missing workspace ${m.workspace_id}`);
}
```
On-read route: same predicate — one `select group_guid, workspace_id, kind, label from group_mappings` + `select id from workspaces`, filter in JS (or a LEFT JOIN). Include `kind` (values `'workspace'|'operator'`) and `label` [VERIFIED: server.js:618–630 schema] — `label` is display-only and MUST be escaped at first render (Phase 80 watch-item).

### Pattern 4: Phase 82 encoded trail rendering

**What:** trail rows are audit_log rows whose `action` matches the encoded format; split on the FIRST colon only.
**Example:**
```js
// Source: server.js:5305–5314 (guardRefuse) — action written as:
//   `group_${delta}:group:${guid}:guard-refused`    delta ∈ {'membership_removed','role_downgraded'}
// Source: server.js:5356–5365 (grant-side skip) — same wrapper with:
//   const skipReason = ws ? 'archived-workspace' : 'dead-workspace';
// Render: action.split(/:(.+)/) → ["group_membership_removed", "group:<guid>:guard-refused"]
```
Query B shape (discretion — lookback window): `select action, workspace_id, created_at from audit_log where action like 'group_%:group:%' order by created_at desc limit <N>` — a bounded N (e.g. 50–100) keeps the route O(recent).

### Anti-Patterns to Avoid
- **Extending `/api/workspaces` (user family):** D-10 ruling — new routes live only under `/api/auth/operator/...`.
- **Existence oracle:** fetching/404-ing the target before the operator gate leaks workspace existence to non-operators (Pitfall 22 / D-09). Gate first.
- **Redirect on old slug:** no redirect machinery exists and D-82-5 forbids it; a "helpful" 301/302 in any slug resolver violates SC2. D-15 pins exact-404 + no Location header.
- **Boot-time snapshot for dead mappings:** goes stale mid-session (D-09) — derive on read.
- **Rendering `group_mappings.label` unescaped:** opaque carried value; escape at first render (esc()).
- **New slug vocabulary:** no new error codes beyond `invalidSlug`/`slugTaken`/`workspaceNameRequired`/`notFound`/`operatorOnly`/`tooManyAttempts`/`crossOriginRejected` — reuse verbatim (D-04).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slug validation | New regex/trimming | `sanitizeSlug` | Encodes SLUG_RE + RESERVED_SLUGS + slugify, single source of truth |
| Collision + suggestion | Custom query loop | `uniqueSlug(base, excludeId)` | Already handles nocase matching, `-2` suffixing, self-exclusion |
| Confirm dialog | Custom modal | `confirmDlg` with typeName | Type-to-confirm + danger styling already accessibility-tested |
| Keyed error toast | Custom handling | `govRefusalToast` (actions.js:4649–4654) | Extend its `keyed` list with any new codes (or reuse existing ones) |
| Operator gating | New auth check | `isInstanceAdmin(operator)` | Same flag all Phase 78/79 routes use |

**Key insight:** every validation/refusal/dialog primitive this phase needs shipped in Phases 78–80; Phase 83 is composition, not construction.

## Common Pitfalls

### Pitfall 1: Self-collision on rename
**What goes wrong:** `wsBySlug(next)` returns the workspace's own row → operator gets `slugTaken` for their own slug.
**Why:** the creation-route check has no exclusion context.
**How to avoid:** only run the collision check when `next !== ws.slug` (PATCH precedent, server.js:7686), and generate the suggestion with `uniqueSlug(next, ws.id)`.
**Warning signs:** rename with unchanged slug field fails with 409.

### Pitfall 2: Existence leak via early target lookup
**What goes wrong:** non-operator probing `/rename` on a real vs fake id distinguishes responses.
**How to avoid:** operator gate BEFORE `db.get(... workspaces where id = ?)`; non-operator always gets exact `403 operatorOnly`. Same for dead-mappings route (it has no target, just the gate).

### Pitfall 3: requireWorkspace on the rename route
**What goes wrong:** riding requireWorkspace means archived workspaces 404 and non-member operators can't reach their own governance target.
**How to avoid:** fetch by id (Pattern 1) — the Phase 79 comment block mandates this [VERIFIED: server.js:7091–7099]. Decision needed in planning: archived workspaces renameable or not (both are defensible; fetch-by-id makes them reachable — recommend allowing rename, matching archive/unarchive reachability).

### Pitfall 4: case-insensitive collision miss
**What goes wrong:** checking `where slug = ?` with `=` lets "Team-A" pass when "team-a" exists.
**How to avoid:** all slug lookups use `collate nocase` (wsBySlug and uniqueSlug already do) [VERIFIED: server.js:950–960].

### Pitfall 5: locale pin drift
**What goes wrong:** i18n-toast counts (`data-a=572`, `data-r=62`) or error-codes reverse-parity fail in CI.
**How to avoid:** update pins in the SAME commit (D-12); pass refusal literals explicitly at the server.js call site (Phase 80-02 lesson: reverse-parity test greps server.js source).

### Pitfall 6: sameOrigin after body read
**What goes wrong:** reading JSON before `sameOrigin(req)` breaks the guard-order invariant the client tests pin.
**How to avoid:** sameOrigin is the FIRST statement, before readJson and before throttle (Pitfall 22).

### Pitfall 7: Trail rows mis-split
**What goes wrong:** GUIDs and reasons contain no colons but `group:` prefixes do — splitting on every colon corrupts rendering.
**How to avoid:** split on the FIRST colon only (D-08): `action.split(/:(.*)/s)` → `[delta, "group:<guid>:<reason>"]`, then split the remainder on first colon again for guid/reason.

## Code Examples

### Rename route skeleton (guard order + reuse)

```js
// Composition of verified patterns: guard order server.js:7111–7125; slug rules server.js:7467–7469;
// PATCH precedent server.js:7686–7693; logInfo convention server.js:7145.
const operatorWsRenameMatch = pathname.match(/^\/api\/auth\/operator\/workspaces\/([A-Za-z0-9_-]{1,64})\/rename$/);
if (operatorWsRenameMatch && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  if (tooMany(`op-ws-rename|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const ws = await db.get('select id, slug, name, archived from workspaces where id = ?', [operatorWsRenameMatch[1]]);
  if (!ws) return fail(res, 404, 'notFound', 'Not found');
  const body = await readJson(req);
  const name = String(body?.name || '').trim().slice(0, 60);
  if (!name) return fail(res, 400, 'workspaceNameRequired', 'Enter a workspace name');
  const next = sanitizeSlug(body?.slug);
  if (!next) return fail(res, 400, 'invalidSlug', 'Use 2–40 lowercase letters, numbers, or hyphens');
  if (next !== ws.slug && await wsBySlug(next))
    return fail(res, 409, 'slugTaken', 'That URL is already taken', { suggestion: await uniqueSlug(next, ws.id) });
  await db.run('update workspaces set name = ?, slug = ?, updated_at = ? where id = ?', [name, next, now(), ws.id]);
  logInfo(`workspace renamed "${ws.name}" (${ws.slug}) → "${name}" (${next}) (governance) by ${operator.email}`);
  return json(res, 200, { workspace: { id: ws.id, slug: next, name } });
}
```

### Client confirm fork (D-03)

```js
// Mirrors actions.js:4655–4682 (confirmArchive) — re-verify pattern before writing.
A.govEditSave = el => {
  const form = /* read modal fields */;
  const slugChanged = form.slug !== S.ui.govEditWs.slug;
  const run = async () => {
    const res = await api.operatorWsRename(S.ui.govEditWs.id, form);
    if (!res.ok) return govRefusalToast(res);          // extend keyed list if new codes added
    closeModal();
    await refreshGovernanceWorkspaces();
    toast(t('toast.governanceRenamed'));
  };
  if (!slugChanged) return run();                      // name-only: direct save (D-03)
  confirmDlg({
    title: t('page.governance.confirmRenameTitle'),
    body: t('page.governance.confirmRenameBody', { old: `<b>${esc(S.ui.govEditWs.slug)}</b>` }),
    ok: t('page.governance.okRename'), danger: true, typeName: S.ui.govEditWs.slug,
    run,
  });
};
```

### i18n keys (en.json shape)

`err.invalidSlug` and `err.slugTaken` already exist ("Use 2–40 lowercase letters, numbers, or hyphens" / "That URL is already taken") [VERIFIED: src/locales/en.json:1794–1795]. New keys needed: `page.governance.edit`, modal title/labels, `confirmRenameTitle/Body/okRename`, `toast.governanceRenamed`, warning-card strings (`page.governance.deadTitle`, dead-row reason labels, and per D-11 a zero/off vocabulary line if the card renders a hidden-state marker — check how other D-11 sections do it). All 5 locale files in the same commit.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Env-var group-mapping config | DB-backed group_mappings (Phase 80) | v3.2 | Dead mappings are rows, not env parse — the orphan query is SQL-side |
| No slug edit for operators | User-facing PATCH already edits slug (pre-existing) | Prior milestone | Operator route adds the no-oracle governance path; semantics must match |
| sso_group% security verbs | Uniform `group_<delta>:group:<guid>:<reason>` trail (D-82-11) | Phase 82 | One LIKE query surfaces all trail rows |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact line numbers of anchors (7110+, 5305+, 9616+) drift slightly; re-verify before editing | Architecture Patterns | Low — patterns quoted verbatim, planner greps by content |
| A2 | Throttle budget 5/15min (mirrors archive) is acceptable for rename; dead-mappings as read-only route with NO throttle (Phase 78 read precedent, server.js:7104–7105 comment) | Pattern 1 | Low — discretion explicitly granted (CONTEXT.md) |
| A3 | `readJson` exists as the body-reading helper at this scope (used at server.js:7466) | Code Examples | Low — verified in creation route |
| A4 | `err.*` keys for invalidSlug/slugTaken exist in all 5 locales (only en verified this session) | i18n keys | Medium — planner should grep the other 4 files before assuming reuse |
| A5 | `refreshGovernanceWorkspaces` is the canonical table refresh fn (referenced in actions.js:4668) | Code Examples | Low |

## Open Questions (RESOLVED)

1. **Are archived workspaces renameable?** — RESOLVED: YES.
   - What we know: fetch-by-id makes them reachable; archive/unarchive actions on the row are state-flips, rename is a metadata edit.
   - Resolution: archived workspaces ARE renameable — the rename route fetches by id (never requireWorkspace), giving them reachability parity with archive/unarchive and satisfying the "no existence oracle" gate order. Decision implemented in 83-01.
2. **Dead-mappings route: throttle or not?** — RESOLVED: NO throttle.
   - What we know: Phase 78/79 GET reads carry no throttle; the trail LIKE query is cheap with a bounded limit.
   - Resolution: the dead-mappings route carries NO throttle (read-only read precedent); the trail query stays bounded with a limit. Decision implemented in 83-01.
3. **Does the warning card need a zero-rows "off" line in S.ui or is full hiding enough?** — RESOLVED: full hiding, no off-line markup.
   - What we know: D-10 says hidden ENTIRELY; other D-11 sections render exactly one off-line at the LOG level, not necessarily in the UI.
   - Resolution: per D-10 the card hides entirely at zero dead items — no zero-rows "off" line in S.ui and no off-line markup. Decision implemented in 83-02.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies; node:test + node:sqlite (DatabaseSync) test harness already in use (test/governance.test.mjs imports `startServer`, `withDb`, `login`, `signup`, `ADMIN` from `./helpers/server.mjs`) [VERIFIED: test/governance.test.mjs:14].

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (node:sqlite DatabaseSync) — no framework install |
| Config file | none needed; helpers in `test/helpers/server.mjs` |
| Quick run command | `node --test test/governance-rename.test.mjs` |
| Full suite command | `node --test test/` (or project's npm test — verify package.json script) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GV-01 | rename route: valid save, invalidSlug 400, slugTaken 409+suggestion, self-slug OK, workspaceNameRequired | server unit | `node --test test/governance-rename.test.mjs` | ❌ Wave 0 (D-13) |
| GV-01 | non-operator gets exact 403 operatorOnly, no existence oracle (fake vs real id identical) | server unit | same | ❌ Wave 0 |
| GV-02 | D-15 pin: after rename, old slug URL → exact 404, NO Location header | server unit | same | ❌ Wave 0 |
| GV-03 | dead-mappings route: orphan row + guard-refused trail row surfaced; zero items → hidden/empty payload; label escaped | server unit | same | ❌ Wave 0 |
| GV-01/03 | client source: Edit action, confirm fork on slug-changed only, warning card markup, esc(label) | client-source assertions | `node --test test/governance-client.test.mjs` | ✅ extend |
| D-12 | locale parity + data-a/data-r pins | suite pins | `node --test test/i18n-toast.test.mjs test/error-codes.test.mjs test/build-locales.test.mjs` | ✅ update pins |

### Sampling Rate
- **Per task commit:** new/updated test files touched by the task
- **Per wave merge:** full node --test suite
- **Phase gate:** full suite green before /gsd-verify-work

### Wave 0 Gaps
- [ ] `test/governance-rename.test.mjs` — server suite (D-13), using startServer/withDb/ADMIN harness
- [ ] Pin updates in `test/i18n-toast.test.mjs` (data-a 572→+N, data-r 62→+N) ride the UI task, not Wave 0

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (reuse) | requireUser session auth (existing) |
| V3 Session Management | no new surface | existing session middleware |
| V4 Access Control | yes | isInstanceAdmin gate BEFORE target lookup; no existence leak (SC4) |
| V5 Input Validation | yes | sanitizeSlug + name trim/slice(0,60); esc() on all rendered values incl. group_mappings.label |
| V6 Cryptography | no | n/a |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Existence oracle via differential 404/403 | Information Disclosure | operator gate before target fetch; exact operatorOnly for all non-operators |
| XSS via opaque label / slug in modal + card | Tampering | esc() at first render (Phase 80 watch-item — carried label never trusted) |
| CSRF on state-changing POST | Spoofing | sameOrigin FIRST, before body read/throttle (guard-order invariant) |
| Slug squatting to a reserved path | Evasion | sanitizeSlug enforces RESERVED_SLUGS — renaming INTO a reserved slug is refused |
| Brute-force rename probing | DoS | operator-keyed tooMany throttle (never per-IP — Pitfall 10) |

## Sources

### Primary (HIGH confidence)
- server.js:278–279, 941–960, 7110–7160, 7460–7470, 7676–7700, 5305–5365, 618–630, 9616–9624 — read this session; all quoted values verbatim
- src/actions/actions.js:4649–4741; src/pages/governance.js:34–217; src/core/api.js:369–380 — read this session
- test/governance.test.mjs:1–30; test/governance-client.test.mjs:1–40; test/i18n-toast.test.mjs:285–309 — read this session
- src/locales/en.json:1794–1795 — read this session

### Secondary (MEDIUM confidence)
- None needed — no external claims.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive verified in source this session
- Architecture: HIGH — guard-order and refusal patterns quoted verbatim from Phase 79/80 code
- Pitfalls: HIGH — derived from pinned in-repo invariants (Pitfall 22, D-82-5, D-11, Phase 80-02 reverse-parity lesson)

**Research date:** 2026-11-20
**Valid until:** indefinite (internal codebase; re-verify line numbers at execution time)
