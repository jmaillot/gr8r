# Phase 102: Mappings SPA — Entra ID Mappings Page - Research

**Researched:** 2026-11-27
**Domain:** Hand-rolled Vite SPA (zero-dependency ESM) — new lazy operator page consuming Phase 101 routes
**Confidence:** HIGH

## Summary

Every seam this phase needs already exists and has a proven template: the lazy-route + nav-gate pattern (governance/backup), the fill-loop + staged inline-confirm + keyed-toast pattern (`refreshGovernanceWorkspaces` / `A.govRoleRevoke*` / `tErr`), the dead-mappings card (`govDeadCard`, governance.js:381) whose loader already rides a dedicated state slot, and three standing test gates (chunk-size, i18n-scan, static client-source assertions with ×5 locale parity imports). Phase 101's routes are fully wired server-side; **the SPA has zero client code for them yet** — `src/core/api.js` has no `groupMapping*` methods, so the API layer additions are part of this phase.

**Primary recommendation:** Build `src/pages/mappings.js` as a near-verbatim governance analog: register route `mappings` (layout.js P map + render.js ROUTE_IDS/ROUTE_ICONS), nav sItem gated on `api.user?.isInstanceAdmin && api.oidcEnabled`, one `refreshMappings()` fill loop fetching GET group-mappings + operator workspaces (+ dead-mappings after the strict move), port `canonicalizeGuid` into a new `src/core/guid.js` (groups.js is server-only and deliberately unbundled), move `govDeadCard` + its dead-mappings loader wholesale, and add three test files (client-source assertions, chunk prefix, ×5 key parity rides the existing imports).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mappings list + hints | SPA page (lazy chunk) | API GET | Render-only from GET payload; server is ground truth (T-60-05 doctrine) |
| Create/delete mutations | SPA actions → API | server routes | Server re-checks everything; client gates are UX only (D-11) |
| GUID canonicalization | SPA (new core module) | — | groups.js is deliberately NOT under src/ (never bundled) |
| Operator gating | Server 403 | nav cosmetic gate | D-11: the server is the control |
| Dead-mappings card | SPA page (moved) | `/api/auth/operator/dead-mappings` | Strict move, display-only, no data-a (D-06/D-07) |
| Refusal rendering | SPA toast via `tErr` | i18n catalogues | All refusal codes already have `err.*` keys in ×5 locales |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Create form always visible — compact panel at top, list below; no reveal button. Matches governance lead style.
- **D-02:** Row hints = badges + count chip: dead rows get amber badge (`deadReason` → "workspace archived"/"workspace deleted", ×5), every row carries faint `liveMembers` chip ("12 via group").
- **D-03:** Form fields: GUID paste (canonicalized client-side before submit), label ≤200 chars esc()d at every render, workspace picker fed by `GET /api/auth/operator/workspaces`, role picker owner/admin/member.
- **D-04:** Staged inline-confirm (two-click, D-90 pattern): delete → stages "Confirm delete?" with copy at row → click again fires. NO modal.
- **D-05:** Copy = verbatim SC sentence + mechanism: "Members mapped through this group will lose access at their next Microsoft sign-in." + hint SSO login reconcile handles removal. The sentence must appear verbatim in localized copy (×5).
- **D-06:** Strict move: dead-mappings card renders ONLY on Mappings page (below the list); Governance loses it entirely. Same data source, display-only, 8-entry trail, FIRST-colon split.
- **D-07:** Card content stays as-is — orphans + guard trail; existing keys unchanged; zero new card keys.
- **D-08:** Light client pre-checks: GUID shape sanity after canonicalization (8-4-4-4-12 or 32-hex), non-empty label; messages reuse existing server refusal keys where they exist.
- **D-09:** Every server refusal renders as keyed localized err toast (403 operatorOnly, 400 groupMappingDuplicate/groupGuidInvalid/roleToken, 404 notFound, 429 tooManyAttempts) — no raw err text.
- **D-10:** Empty list = quiet hint pointing at the create form above. No guided-setup lecture.

### the agent's Discretion
- Exact CSS/class reuse (house `sblock`/`panel`/`srow`/`badge` patterns from governance.js).
- Client GUID canonicalization implementation (port vs re-derive; must accept {braced}/no-hyphen/uppercase identically).
- State slot naming in S.ui and action wiring shape (A.* handlers), following governance.js conventions.
- Loading state treatment (house convention).

### Deferred Ideas (OUT OF SCOPE)
- Merging dead card into row hints; guided-setup empty state; full client mirror of server validation; edit-in-place (PATCH); sort/filter controls.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAPUI-01 | Nav "Entra ID Mappings" when `oidcEnabled:true`; lazy route; server 403 fullstate on deep-link | layout.js sItem pattern (:140, :200), `api.oidcEnabled` getter (api.js:154, set from /api/config at :229), governance full403 (governance.js:33-34) |
| MAPUI-02 | List + create form (canonicalizing GUID, label ≤200 esc, workspace picker, role picker), keyed err toasts | api.js additions ride `call()` (:415-431 pattern); all refusal `err.*` keys already exist ×5 (en.json:1777-1863, 1818-1821); port of groups.js:34-55 canonicalizeGuid |
| MAPUI-03 | Inline-confirm delete with verbatim lazy-revocation copy; success toast + refresh | A.govRoleRevokeAsk/Cancel/Confirm (actions.js:5998-6017) is the exact template; new toast keys ×5 |
| MAPUI-04 | Dead-mappings card moves from Governance to Mappings page | govDeadCard (governance.js:381-403); loader at actions.js:4734 rides refreshGovernanceWorkspaces — move fetch + card; remove call site governance.js:109 |
</phase_requirements>

## Standard Stack

### Core
No new packages — zero-dependency SPA. All reuse of existing house modules:

| Module | Purpose | Anchor |
|--------|---------|--------|
| `src/core/api.js` `call()` | All three routes + workspaces listing | :415-431 operatorWorkspaces family [VERIFIED: src/core/api.js:415-431] |
| `src/core/i18n.js` `t`/`tErr`/`has` | Localized copy + keyed refusal toasts | tErr at :243-246 [VERIFIED: src/core/i18n.js:243-246] |
| `src/core/utils.js` `esc` | Stored-XSS discipline on label/GUID/name | governance.js:18 import [VERIFIED] |
| `src/ui/toast.js` `toast`, `mutate` | Success/err toasts | actions.js:45 import [VERIFIED] |
| `src/ui/helpers.js` `empty`, `av` | Quiet empty state (D-10) | governance.js:23 import [VERIFIED] |
| `src/pages/settings.js` `srow` | Row markup for list | governance.js:25 import [VERIFIED: src/pages/settings.js:105-107] |
| `src/core/icons.js` `ic` | Nav + button icons | governance.js:19 [VERIFIED] |

### GUID canonicalization — importability verdict (explicit)
**`groups.js` `canonicalizeGuid` (groups.js:34-55) is NOT importable from src/.** groups.js is a server-root module, deliberately outside `src/` so Vite never bundles it ("Pure server-side module: NOT under src/ so Vite never bundles it (same rule as oidc.js / totp.js / mailer.js)" — groups.js header, lines 5-7). There is **no existing client port** (grep for `canonicalizeGuid` hits only server.js and groups.js) [VERIFIED: grep across repo]. **Planner must create a new client module** (recommended `src/core/guid.js`) porting the logic verbatim:

```js
// Port of groups.js:27-55 — semantics must accept {braced}, uppercase, no-hyphen identically.
const GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const canonicalizeGuid = raw => {
  const s = String(raw ?? '').trim().replace(/^\{/, '').replace(/\}$/, '').toLowerCase();
  if (GUID_SHAPE.test(s)) return s;
  if (/^[0-9a-f]{32}$/.test(s)) {
    const hyphenated = `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
    if (GUID_SHAPE.test(hyphenated)) return hyphenated;
  }
  return '';
};
```
[VERIFIED: groups.js:27-55 — quoted from the file this session; values copied verbatim]

**Package Legitimacy Audit:** no external packages installed by this phase — audit table not applicable.

## Architecture Patterns

### System Architecture Diagram

```
[Nav sItem (layout.js, Instance group)]
   gate: api.user?.isInstanceAdmin && api.oidcEnabled  (cosmetic)
        │ go('mappings')
        ▼
[render.js go()] ──► lazy import src/pages/mappings.js ──► pageMappings()
        │                                        │
        │ in-render kick (governance.js:76 pattern)│
        ▼                                        ▼
[actions.js refreshMappings()] ── GET /api/governance/group-mappings (S.ui.mapRows)
        │                        ── GET /api/auth/operator/workspaces (S.ui.mapWs → picker)
        │                        ── GET /api/auth/operator/dead-mappings (S.ui.govDead → card, moved)
        ▼
[pageMappings()] ── create form panel (D-01) ── A.mapCreate ── POST ──► refusal → tErr toast (D-09)
        │          list w/ badges + count chip (D-02) ── A.mapDeleteAsk/Confirm (D-04) ── DELETE ──► toast + refresh
        ▼
[govDeadCard moved] (orphans + trail, display-only, no data-a — D-06/D-07)
```

Server refusal funnel (Phase 101, verbatim from server.js POST region):
- POST: `crossOriginRejected` 403, `operatorOnly` 403, `groupMappingBadGuid`/`groupMappingUnknownWorkspace`/`groupMappingBadRole`/`groupMappingDuplicate` 400 [VERIFIED: server.js:8962-9035 region, fail() calls read this session]
- DELETE: `crossOriginRejected` 403, `tooManyAttempts` 429 (5 per 15 min), `operatorOnly` 403, `notFound` 404; success 200 `{deleted:true}` [VERIFIED: server.js:9081 region]
- GET payload key: `mappings` (array of flat rows; field names id/groupGuid/workspaceId/workspaceName/workspaceSlug/role/kind/label/createdAt/updatedAt/dead/deadReason/liveMembers) [VERIFIED: server.js:9043-9060]

### Route registration (exact seams)
1. **`src/shell/render.js`** — add `'mappings'` to `ROUTE_IDS` (:21-45, after 'backup') and `mappings: '<icon>'` to `ROUTE_ICONS` (:47-69). The `urlForView` catch-all (`if (ROUTE_IDS.includes(route) && route !== 'home') return /w/${slug}/${route}` at render.js:148) picks the URL up for free — no urlForView edit needed [VERIFIED: src/shell/render.js:130-148].
2. **`src/shell/layout.js`** — add to the `P` map next to governance (:68-70): `mappings: lazy(() => import('../pages/mappings.js'), 'pageMappings')` [VERIFIED: src/shell/layout.js:53-78].
3. **Nav** — in the Instance `sgroup` (layout.js:191-201), after the governance sItem: `${api.user?.isInstanceAdmin && api.oidcEnabled ? sItem('mappings', routeName('mappings'), '<icon>') : ''}`. Precedent: backup gates on `canBackup || canRestore` (:197), governance on `isInstanceAdmin` (:200) — both cosmetic; the server 403 is the control [VERIFIED: src/shell/layout.js:196-201].

### Recommended file list
```
src/pages/mappings.js          # NEW — pageMappings + moved govDeadCard + export pageMappings
src/core/guid.js               # NEW — client canonicalizeGuid port
src/core/api.js                # EDIT — groupMappings()/groupMappingCreate()/groupMappingDelete()
src/actions/actions.js         # EDIT — refreshMappings() fill loop + A.*/IN.* handlers + teardown
src/shell/layout.js            # EDIT — P.mappings + nav sItem
src/shell/render.js            # EDIT — ROUTE_IDS + ROUTE_ICONS
src/pages/governance.js        # EDIT — remove govDeadCard + call site (:109) + S.ui.govDead lifecycle from this page
src/locales/{en,fr,nl,de,es}.json  # EDIT — new keys + moved keys
test/mappings-client.test.mjs  # NEW — static client-source assertions
test/build-chunk-size.test.mjs # EDIT — lazy 'mappings' chunk prefix test
```

### Pattern 1: Fill loop with monotonic sequence + abort (actions.js:4722-4746)
**What:** One loader per surface; sequence guards against stale overwrites; AbortController kills in-flight on re-entry; NO auto-poll.
**When to use:** The new `refreshMappings()` — copy `refreshGovernanceWorkspaces` structure verbatim, including the 401 bail (D-28: central intercept owns teardown) and the non-401 error landing in a dedicated err slot that the page renders as fullErr [VERIFIED: src/actions/actions.js:4722-4746].

### Pattern 2: Staged inline-confirm (actions.js:5998-6017 + governance.js:269-270)
`A.<x>Ask = el => { S.ui.stage = el.dataset.id; render(); }` → row re-renders with hint copy + Confirm/Cancel buttons → `A.<x>Confirm = async el => { const id = el.dataset.id; ...; S.ui.stage = null; ... }`. Cleanup stage in ROUTE_TEARDOWN (registry pattern, render.js:76; governance registers at governance.js:498).

### Pattern 3: Keyed refusal toast
```js
if (res.status === 401) return;                    // D-28: central intercept
const code = res.data?.code;
return toast(tErr(code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
```
`tErr(code)` → `err.${code}` if the catalogue has it, else the raw server message [VERIFIED: src/core/i18n.js:243-246].

### Pattern 4: In-render kick for boot-time deep links
`if (!S.ui.mapRows && !S.ui.mapErr) refreshMappings();` inside pageMappings() before rendering (governance.js:76 and :86-90 precedent).

### Anti-Patterns to Avoid
- **Raw interpolation of payload strings:** label/groupGuid/workspaceName must ride `esc()` at EVERY render (stored-XSS watch-item, T-79-10; re-render paths: poll/refresh, locale switch, delete repaint).
- **Client-derived gating:** never hide rows or pre-filter on client guesses; server is the funnel of record (T-79-09).
- **Composite row key for delete:** use the opaque row `id` only (Phase 101 D-08) — never GUID+workspace composite.
- **Leaving staged state across route exit:** register ROUTE_TEARDOWN.mappings; governance's govOrphanTeardown (governance.js:475-498) is the template.
- **Importing groups.js into src/:** breaks the bundling doctrine (server-only module) — port, don't import.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyed refusal messages | per-code switch in page | `tErr(code, null, raw)` | One funnel, catalogue-driven, ×5 coverage enforced by tests |
| Empty state markup | custom div | `empty(icon, title, body, '', 'sm', 3)` | House a11y/spacing conventions |
| URL routing for the new route | custom history code | ROUTE_IDS membership | urlForView catch-all covers it |
| GUID regex | new shape rules | port of canonicalizeGuid | Server must accept exactly what client sends; divergence creates 400s |

## Common Pitfalls

### Pitfall 1: Chunk naming assumption
**What goes wrong:** Assuming the lazy chunk is named `mappings-*.js`. Vite names lazy chunks after the module file (`src/pages/mappings.js` → `mappings-*.js`), but the gate asserts on REAL bytes by prefix (build-chunk-size.test.mjs:47-49 `chunksByPrefix`). **Avoid:** add the split-existence test (`chunksByPrefix('mappings')`) and run it — if the prefix misses, the assertion names the actual chunk list [VERIFIED: test/build-chunk-size.test.mjs:1-61, 74-125].

### Pitfall 2: govDead loader is currently entangled with governance refresh
**What goes wrong:** Deleting the card from governance.js but leaving the dead-mappings fetch inside `refreshGovernanceWorkspaces` (actions.js:4734) leaves an orphaned state slot and an extra fetch on the Governance page. **Avoid:** move BOTH the fetch and the card in one task; governance refresh keeps only workspaces; the new page's refresh fetches mappings + dead-mappings.

### Pitfall 3: Verbatim copy enforcement
The verifier greps ×5 locale files for "next Microsoft sign-in". En copy must carry the exact sentence "Members mapped through this group will lose access at their next Microsoft sign-in." (MAPUI-03 wording: "members will lose access at their next Microsoft sign-in") — planner should pin the EN sentence in the test file (governance-client.test.mjs precedent imports the 5 catalogue JSONs and asserts keys).

### Pitfall 4: i18n-scan flags raw display literals
scripts/i18n-scan.mjs walks src/ and reports HTML text nodes / display attributes not routed through t(). Every new string in mappings.js must be a t('page.mappings.…') key [VERIFIED: test/i18n-scan.test.mjs:19, scanner contract].

### Pitfall 5: oidcEnabled freshness
`api.oidcEnabled` is set from the /api/config response (api.js:229) — it's boot-time state, fine for the cosmetic gate, but the page must NOT gate its own fetch on it (fetch regardless; server 403 decides) [VERIFIED: src/core/api.js:154-155, 229].

## Code Examples

### API additions (src/core/api.js, mirroring :415-431)
```js
async groupMappings({ signal } = {}) {
  return call('GET', '/api/governance/group-mappings', undefined, { signal });
},
async groupMappingCreate(body) {
  return call('POST', '/api/governance/group-mappings', body);
},
async groupMappingDelete(id) {
  return call('DELETE', `/api/governance/group-mappings/${encodeURIComponent(id)}`);
},
```
(Verify `call('DELETE', …)` is the established verb form — check an existing DELETE in api.js before writing.)

### Create-form pre-check (D-08)
```js
A.mapCreate = async () => {
  const st = S.ui.mapForm || {};
  const guid = canonicalizeGuid(st.groupGuid || '');
  if (!guid) return toast(t('err.groupMappingBadGuid'), { kind: 'err' }); // existing key ×5
  if (!(st.label || '').trim()) return toast(t('err.groupMappingBadLabel'), { kind: 'err' }); // if new label key needed — see i18n inventory
  const res = await api.groupMappingCreate({ groupGuid: guid, workspaceId: st.workspaceId, role: st.role, label: st.label.trim() });
  /* keyed refusal funnel, Pattern 3 above; success → S.ui.mapForm reset + refreshMappings() + success toast */
};
```
`err.groupMappingBadGuid` already exists in all 5 catalogues (en.json:1818) [VERIFIED: src/locales/en.json:1818-1821; fr/es seen in grep, nl/de present per groups-config test asserting ×5 codes at test/groups-config-api.test.mjs:156].

## i18n Key Inventory

### Moved keys (D-06/D-07 — governance loses, mappings gains; either move-namespace or reuse is allowed by CONTEXT)
- `page.governance.deadTitle`, `page.governance.deadLead`, `page.governance.deadOrphans`, `page.governance.deadTrail` — en.json:2137-2140 [VERIFIED: read this session]. **Recommendation: move to `page.mappings.dead*` namespace** (card code moves anyway; the 4 old keys are deleted from all 5 catalogues in the same commit).

### New keys (×5, same commit)
| Key | Purpose |
|-----|---------|
| `nav.route.mappings` | Nav + fullstate h1 (routeName reads `nav.route.<id>`) |
| `page.mappings.subtitle` | Page lead |
| `page.mappings.loading` | aria-busy body |
| `page.mappings.emptyTitle` / `page.mappings.emptyBody` | Quiet empty state (D-10) |
| `page.mappings.formTitle` / `formLead` | Create panel heading |
| `page.mappings.guidLabel` / `guidPlaceholder` | GUID paste field |
| `page.mappings.labelLabel` | Label field (maxlength=200) |
| `page.mappings.wsLabel` / `wsPlaceholder` | Workspace select |
| `page.mappings.roleLabel` | Role select (role names ride existing `common.role.*` keys — governance.js:461 precedent) |
| `page.mappings.create` | Submit button |
| `page.mappings.createdToast` | Success toast |
| `page.mappings.viaGroup`: `"{n} via group"` | Count chip — placeholder convention `{n}` [VERIFIED: interpolate convention, en.json:2361-2362 use `{n}`, `{query}`] |
| `page.mappings.deadBadgeArchived` | deadReason 'workspace-archived' badge |
| `page.mappings.deadBadgeDeleted` | deadReason 'workspace-deleted' badge |
| `page.mappings.delete` / `deleteConfirm` | Inline stage buttons |
| `page.mappings.deleteCopy` | **Carries the verbatim SC sentence** + SSO reconcile hint |
| `page.mappings.deletedToast` | Delete success toast |
| `page.mappings.badLabelToast` | Client pre-check flag (D-08) — or reuse `err.groupMappingBadGuid`; planner verifies whether a distinct label-empty key exists (grep showed none) → one new key likely needed |

**Existing err keys cover D-09 fully:** `err.tooManyAttempts` (en:1777), `err.operatorOnly` (en:1782), `err.notFound` (en:1863), `err.groupMappingBadGuid` / `err.groupMappingUnknownWorkspace` / `err.groupMappingBadRole` / `err.groupMappingDuplicate` (en:1818-1821) — zero new err keys required [VERIFIED: src/locales/en.json, grep this session].

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| groups.js canonicalization (server-only) | Client port required — no shared module exists | New `src/core/guid.js` |
| Dead card on Governance | Moves to Mappings (this phase) | Governance.js:109 call site removed; refreshGovernanceWorkspaces sheds the dead-mappings fetch |

## Test Patterns (named by file)

1. **Static client-source assertions** — `test/governance-client.test.mjs` is the template: node:test, no DOM harness; `readFileSync` the page/actions/api sources and `assert.match` regex-pinned invariants; imports the 5 catalogue JSONs (`with { type: 'json' }`) to assert key parity ×5 [VERIFIED: test/governance-client.test.mjs:1-85]. New file `test/mappings-client.test.mjs` should pin: (a) canonicalizeGuid accepts {braced}/no-hyphen/uppercase → same key, '' on garbage (direct unit calls — the module is pure, import it directly like i18n tests do); (b) delete inline-confirm stage keys; (c) `data-a` absence inside govDeadCard (D-06/D-07: no interactive controls); (d) verbatim EN sentence in `page.mappings.deleteCopy`; (e) refusal codes map to existing `err.*` keys in all 5 catalogues; (f) esc() coverage on label/GUID/name in the row template; (g) ROUTE_TEARDOWN.mappings registration.
2. **Chunk gate** — `test/build-chunk-size.test.mjs`: 500 000-byte per-chunk gate over real `vite build` bytes + split-existence prefix tests (:74-125). Add `test('the build emits a lazy mappings chunk')` with `chunksByPrefix('mappings')` [VERIFIED: file read this session].
3. **i18n coverage** — `test/i18n-scan.test.mjs` (static scan flags unt-localized literals; runs against fixture tree + live machine-identifier guard) and the ×5 parity enforced inside the client-source test's catalogue imports. `test/build-locales.test.mjs` covers build-time bundling — no edit needed.
4. **Nav visibility** — no DOM harness exists; pin the layout.js condition via regex on the source (governance-client style: `assert.match(layoutSrc, /isInstanceAdmin && api\.oidcEnabled \? sItem\('mappings'/)`).
5. **Backend already tested** — `test/group-mappings-api.test.mjs` + `test/groups-config-api.test.mjs` pin all refusal codes/payload shapes; no backend test changes.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vite names the lazy chunk with prefix `mappings` from `src/pages/mappings.js` | Pitfalls 1 / test plan | Split-existence test fails on first run; rename assertion per actual chunk list (self-correcting) |
| A2 | `call('DELETE', …)` is an established api.js verb form | Code examples | Trivial fix at write time; check an existing DELETE method |
| A3 | No distinct label-empty refusal key exists server-side → one new pre-check key may be needed | i18n inventory | If server silently trims empty labels, the new key is unnecessary (harmless) |
| A4 | `workspaceId` (not `workspace_id`) is the POST body field name | API additions | Phase 101 test imports confirm `groupGuid` casing (:39, :99); `workspaceId` casing not read verbatim in the POST body region — planner verifies against server.js:8962 POST handler or test/group-mappings-api.test.mjs fixtures |

## Open Questions (RESOLVED — decided in plans, commit eb0a2506)

1. POST body field casing — RESOLVED: camelCase `groupGuid`/`workspaceId`/`role`/`label`, read verbatim from server.js:8962 POST handler (102-01/102-02 plans).
2. Moved-key namespace — RESOLVED: rename to `page.mappings.dead*` (card code moves wholesale; 4 old keys deleted, 4 new added per locale in the same commit — 102-01 Task 3).

1. **POST body field casing** — `groupGuid` is confirmed (groups-config test :39); `workspaceId`/`role`/`label` casing highly likely camelCase but not read verbatim from the POST handler this session. Recommendation: planner reads server.js:8962-8990 before writing the api method (2-minute check, no user input needed).
2. **Moved-key namespace** — CONTEXT allows either reuse (`page.governance.dead*`) or rename (`page.mappings.dead*`). Recommendation: rename, since the card code physically moves and governance.js keeps no dead references.

## Environment Availability

Node-based test suite (`node --test`), vite build for chunk gate — both already exercised by existing tests; no new tooling.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (node:assert/strict), zero-dep |
| Config file | none — convention-based test/*.test.mjs |
| Quick run command | `node --test test/mappings-client.test.mjs` |
| Full suite command | `npm test` (confirm script name in package.json at plan time) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAPUI-01 | Nav gate + lazy route + 403 fullstate | static source assertions | `node --test test/mappings-client.test.mjs` | ❌ Wave 0 |
| MAPUI-02 | Canonicalization + form + refusal keys ×5 | unit + source assertions | same | ❌ Wave 0 |
| MAPUI-03 | Inline-confirm delete + verbatim copy | source assertions | same | ❌ Wave 0 |
| MAPUI-04 | Card move; governance loses card; no data-a in card | source assertions + chunk gate | same + `node --test test/build-chunk-size.test.mjs` | ❌ Wave 0 (chunk test: edit existing) |

### Sampling Rate
- Per task commit: `node --test test/mappings-client.test.mjs test/build-locales.test.mjs`
- Per wave merge: full suite incl. build gates
- Phase gate: chunk gate + i18n-scan green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/mappings-client.test.mjs` — covers MAPUI-01..04 (source-assertion + canonicalizeGuid unit tests)
- [ ] `src/core/guid.js` must exist before its unit tests import it
- [ ] chunk-gate prefix test added to existing `test/build-chunk-size.test.mjs`

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | Server `isInstanceAdmin` gate per route; client nav cosmetic only |
| V5 Input Validation | yes | canonicalizeGuid port; label maxlength=200 + esc() at render; server re-validates (funnel of record) |
| V6 Cryptography | no | — |
| V2/V3 Auth/Session | existing | Central 401 intercept (D-28) — never re-handled in page code |

| Threat | STRIDE | Mitigation |
|--------|--------|-----------|
| Stored XSS via mapping label | Tampering | esc() every render; test pins coverage |
| CSRF on mutations | Tampering | sameOrigin server gate (existing) |
| GUID enumeration | Information disclosure | GET is operator-only; dead rows render null names server-side |

## Sources

### Primary (HIGH confidence)
- Direct file reads this session: src/pages/governance.js (full), src/shell/layout.js, src/shell/render.js, src/core/api.js (grep anchors), src/core/i18n.js (tFor/tErr), src/actions/actions.js (:4722-4746, :5908-6030, :2840-2870), groups.js (:1-55), server.js (:8962-9110 region), test/build-chunk-size.test.mjs, test/governance-client.test.mjs, test/i18n-scan.test.mjs, src/locales/en.json anchors, 102-CONTEXT.md, REQUIREMENTS.md MAPUI section, ROADMAP.md Phase 102 entry.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every anchor read this session
- Architecture: HIGH — governance is a byte-level template
- Pitfalls: HIGH — all verified against real files; A1/A2/A4 are trivially self-correcting at implementation

**Research date:** 2026-11-27
**Valid until:** 2026-12-27
