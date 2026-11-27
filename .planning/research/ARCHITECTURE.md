# Architecture Research

**Domain:** v3.6 feature integration — Entra ID Mappings page, OIDC linking docs, restore-source selection
**Researched:** 2026-11-27
**Confidence:** HIGH (all integration points verified against the live codebase; every line reference below was read, not inferred)

## Standard Architecture (current, what v3.6 plugs into)

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ SPA (src/, Vite ES modules, no framework)                            │
│  shell/layout.js  → nav groups (Instance group: backup, governance)  │
│  shell/render.js  → ROUTE_IDS + ROUTE_ICONS + lazy() registry        │
│  shell/layout.js:53-74 → PAGES lazy() map (route id → page chunk)    │
│  pages/governance.js (closest analog, 498 lines)                     │
│  core/api.js      → server payload state (oidcEnabled already here)  │
│  actions/actions.js → event delegation, server calls, re-render      │
├──────────────────────────────────────────────────────────────────────┤
│ server.js (~13.5k lines, route-per-pathname if-ladder)               │
│  /api/config (6583)      → oidcEnabled: OIDC.enabled  ← D-10 DONE    │
│  group_mappings family   → POST :8957, dead-mappings GET :9026       │
│  SSO callback reconcile  → :6597 area, reads resolveGroupsClaim      │
│  restore family          → backups GET :10246, preview :10765,       │
│                            restore :10385, instance :10502,          │
│                            overwrite :10599                          │
├──────────────────────────────────────────────────────────────────────┤
│ export/*.js seams                                                    │
│  backup.js:690 destination registry (dormant-slot contract)          │
│  s3.js / ftp.js / smb.js  → probe*, fetchToStaged* / downloadToStaged│
│  restore.js               → extractArchive, restoreImportAsNew       │
├──────────────────────────────────────────────────────────────────────┤
│ node:sqlite (or pg adapter) — group_mappings table (server.js:800)   │
│   unique index (group_guid, workspace_id); kind, label, role columns │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Where it lives today |
|-----------|----------------|----------------------|
| Destination registry | export mirror order + dormant-slot contract | export/backup.js:690 |
| Staged-fetch ladder | restore read-back, registry order s3 > ftp > smb (D-04) | server.js ×3 sites: 10826/10842/10857, 11004/11018/11032, 11134/11151/11168 |
| `destLocation(r)` | primary location badge derived from run-row truth only (D-89-14) | server.js:4056 |
| Mirror flags | `uploaded` / `ftp_uploaded` / `smb_uploaded` on backup_runs — the truth, never live-probed on list paths | backup_runs schema |
| group_mappings funnel | validation + insert, operator-gated | server.js:8957 (POST), groups.js `guidRefusal`/`roleTokenRefusal` |
| SSO reconcile | claim match → membership sync at login | server.js:6597 area via resolveGroupsClaim (groups.js) |
| Nav gating | UX-only gate, server 403 is the control | src/shell/layout.js:200 (`api.user?.isInstanceAdmin`) |

## Integration 1 — Entra ID Mappings page

### Decision: new lazy route `mappings` + new page file

The closest analog is `/governance` (pages/governance.js), but v3.6 mappings have a
*different gate* (`oidcEnabled` AND operator) and their own route shape. A dedicated
route follows the established per-feature lazy-page pattern (backup, governance are
each one route) and keeps governance.js from growing another card family.

### New vs Modified

| File | New/Modified | Change |
|------|--------------|--------|
| `src/pages/mappings.js` | **NEW** | Page: list of group_mappings rows (guid, label, workspace name, role), create form (GUID paste + label + workspace picker + role owner/admin/member — no viewer), delete with type-of-confirm danger styling per governance.js conventions. Reuse the dead-mappings `{orphans, trail}` payload shape precedent |
| `src/shell/render.js` | **MODIFIED** | Add `'mappings'` to ROUTE_IDS (:21) + ROUTE_ICONS (:44, e.g. `'key-round'`/`'link'`) |
| `src/shell/layout.js` | **MODIFIED** | Instance nav group (:196-201): add `${api.oidcEnabled && api.user?.isInstanceAdmin ? sItem('mappings', routeName('mappings'), '<icon>') : ''}` — this is the **first** `api.oidcEnabled` use in nav gating; the flag is already in core/api.js state (:29, getter :154, hydrate :229) |
| `src/core/api.js` | **MODIFIED** | Add `listGroupMappings()` + `deleteGroupMapping(id)` call helpers near :455 (`/api/auth/operator/dead-mappings` precedent) |
| `src/actions/actions.js` | **MODIFIED** | Event delegation handlers for create/delete/refresh, reusing the governance action idioms (:5896 instance-roles pattern) |
| `src/locales/*.json` ×5 | **MODIFIED** | `nav.route.mappings` + page keys + refusal keys in ALL 5 locales in the same commit (hard gate) |
| `server.js` | **MODIFIED** | Two new routes colocated next to the existing group-mappings POST (:8957): |

### New server routes (shape)

Colocate immediately after the `POST /api/governance/group-mappings` block so the
family reads as one unit. Guard ladder copied VERBATIM from dead-mappings GET
(:9026) — `sameOrigin → requireUser → isInstanceAdmin gate BEFORE any read`
(no throttle: GET read precedent, Phase 78/79):

- **`GET /api/governance/group-mappings`** — list all rows joined to workspace
  name/slug (the page needs names, never raw ids only — the v3.4 "names instead of
  ids" ruling). Return `{ mappings: [...], orphans? }` — or delegate orphans to the
  existing dead-mappings route; recommend returning workspace name inline and
  reusing dead-mappings for the trail card.
- **`DELETE /api/governance/group-mappings/:id`** — sameOrigin → requireUser →
  operator gate before id lookup (no existence oracle, T-80-04 doctrine);
  keyed refusal `groupMappingNotFound` ×5 locales; audit via `logSecurity(operator.id,
  'group_mapping_deleted')` + logInfo in the same shape as the POST (:9004-9006).
  **No DB cascade**: removal sync happens at next SSO login through the existing
  reconcile guard funnel (server.js:6597 area) — deletion only removes the mapping row.
  If `db.tx` is cheap, wrap row-delete + audit-log insert in one tx (BKROLE-03
  audit-rides-the-tx precedent).

**No schema change.** `group_mappings` (server.js:800) already carries every column
the page needs (guid, label, role, kind, workspace_id, timestamps). No Graph, no
new dependencies — the milestone constraint holds trivially.

### What is already done (do NOT redo)

- **D-10 `/api/config` exposure**: server.js:6583 `oidcEnabled: OIDC.enabled` →
  `api.oidcEnabled` hydrated in core/api.js:229. The nav gate and page 403 UX gate
  consume this as-is.
- **Validation funnel**: groups.js `guidRefusal` + `canonicalizeGuid` +
  `roleTokenRefusal` (locked 3-token set, viewer refuses) — reuse at DELETE too
  (nothing to validate there) and any future edit route.
- **`kind: 'workspace'` invariant**: enforced at insert (:8998) — the page is
  read/delete-only over that invariant; nothing new to enforce.

## Integration 2 — Restore-source selection + availability check

### Where source selection lives today

The registry order (s3 > ftp > smb, D-04) is a **hard-coded if/else ladder** applied
identically in **three server.js routes** (preview :10810-10866, overwrite/verify
family :11004-11032, instance :11134-11168 — each route has the local → s3 → ftp →
smb cascade with `mirrorMissing(err)` flag-clearing + keyed 404s). `destLocation()`
(server.js:4056) derives the read-only badge for list routes.

### Decision: extract ONE shared source-picker, add `source` param, probe-gate

**New vs Modified:**

| File | New/Modified | Change |
|------|--------------|--------|
| `server.js` | **MODIFIED** | (a) Extract the ×3 duplicated ladder into one `resolveRestoreSource(row, requested)` helper returning `{ dest: 'local'|'s3'|'ftp'|'smb', archivePath }` or a keyed refusal — the 2026-11-27 UAT transport-404 semantics and `clearMirrorFlag` behavior move with it verbatim. (b) Each restore route accepts optional `body.source` (`'local'|'s3'|'ftp'|'smb'|'local'`); validate against the run's mirror flags (`source:'s3'` with `uploaded !== 1` → keyed `restoreSourceNotMirrored` ×5 locales). Omitted param = today's registry order (zero behavior change — backward compatible). (c) New `GET /api/backup/restore/backups` payload addition: per-run `sources: ['local','s3',...]` derived from flags + `hasLocal` (server-side derivation, D-23 doctrine — the client never derives authority) |
| `server.js` | **MODIFIED** | Availability check: a new `POST /api/backup/restore/source-check { runId, source }` (or fold into the backups GET with `?probe=1` — prefer the dedicated POST, probes are slow and the list route is render-only per D-89-14). Reuses the existing probe seams: `probeS3` (:9403), `probeFtp` (:9417), `probeSmb` (:9430) — all already imported in server.js:90-92. Throttle: this is a write-shaped network route → use the operator-keyed throttle convention (consumes a try even on 403), NOT the read-route no-throttle. Capability gate: `CAP.RESTORE_USE` verbatim from the restore family |
| `src/pages/backup.js` | **MODIFIED** | Restore dialog: source selector rendering only the run's `sources[]` (server-derived), availability badge per source, passes `source` in the restore/preview POST bodies |
| `src/core/api.js` + `src/actions/actions.js` + locales ×5 | **MODIFIED** | call helper + dialog actions + keys (same-commit 5-locale rule) |

**Anti-pattern to avoid:** probing inside `GET /api/backup/restore/backups`. The
list route's no-live-probing posture (D-89-14, "uploaded IS the S3 truth") is a
deliberate contract; the availability check must be an explicit operator action.

### Data Flow (restore with explicit source)

```
Restore dialog → POST /api/backup/restore/preview { runId, source:'ftp' }
    ↓ guard chain (unchanged): sameOrigin → requireUser → throttle → RESTORE_USE
    ↓ resolveRestoreSource(row, 'ftp')  ← NEW shared helper
    ↓   flag check (ftp_uploaded=1?) → FTP.enabled? → fetchToStaged(...)
    ↓     mirrorMissing(err) → clearMirrorFlag + keyed 404 (verbatim from today)
    ↓ streamVerifyArchive → existing restore pipeline (restore.js, untouched)
```

## Integration 3 — OIDC linking docs

Docs-only, zero code. **Modified:** `DEPLOY.md` ("Linking policy" section —
`OIDC_TRUST_TENANT_EMAIL` pinned-tenant member substitute, guests still require the
literal claim; new Azure setup steps: `groupMembershipClaims: "ApplicationGroup"`
manifest edit + group assignment to the Enterprise Application) and
`.env.example` (comment expansion). No architecture impact; schedule it as the
lightest phase or fold into the mappings phase.

## Recommended Build Order

Dependency-driven:

1. **Server: mappings GET + DELETE routes** (server.js, colocated at :8957). No
   client dep; the DELETE semantics ("cleanup at next SSO login") ride the existing
   reconcile — verify with a route test that deleting a mapping then running the
   reconcile removes members.
2. **SPA: mappings page + nav** (render.js → layout.js → api.js → pages/mappings.js
   → actions.js → locales ×5). Depends on (1) and on `api.oidcEnabled` (already
   shipped). Route registration order matters: ROUTE_IDS first or the catch-all
   404s (render.js:141 shows the ROUTE_IDS gate).
3. **Server: restore-source helper extraction** (refactor the ×3 ladders into
   `resolveRestoreSource`, keeping byte-identical behavior — this is a pure
   refactor phase, golden tests pin it). Depends on nothing; do it BEFORE adding
   the param so the param lands in one place, not three.
4. **Server: `source` param + `sources[]` in backups GET + source-check probe
   route.** Depends on (3). The probe route can land in the same phase; locales
   for the new refusal keys ride this commit.
5. **SPA: restore dialog source selector.** Depends on (4).
6. **Docs: DEPLOY.md + .env.example.** Independent; can run parallel to 3-5 or
   ride the mappings phase.

Phases 1-2 = the mappings feature; 3-5 = restore-source; 6 = docs. The refactor
(3) must precede the param (4) or the same ladder gets edited three times —
that's the one ordering trap.

## Architectural Patterns to Follow (verbatim house patterns)

### Pattern 1: Guard ladder (route-per-pathname)
`sameOrigin(req) → requireUser → capability/operator gate BEFORE target lookup →
validate → write+audit`. Copy from dead-mappings GET (server.js:9026) for reads and
the group-mappings POST (:8957) for writes. Never reorder — "sameOrigin first,
house rule".

### Pattern 2: Server-derived truth (D-23/D-89-14 doctrine)
Badges, location, and now `sources[]` are derived server-side from row truth
(mirror flags, hasLocal); the client renders verbatim and never derives. The
availability probe is the ONLY live network check, and it is explicit.

### Pattern 3: Keyed refusals ×5 locales, same commit
Every new refusal key (`groupMappingNotFound`, `restoreSourceNotMirrored`,
`restoreSourceUnavailable`, …) lands in en/fr/nl/de/es in the same commit — the
i18n gate fails the build otherwise.

## Anti-Patterns

### Anti-Pattern 1: Client-side gating as security
Adding `api.oidcEnabled` to the nav hides the entry, but the server 403 remains the
control (layout.js:200 doctrine applies verbatim to the new mappings item).

### Anti-Pattern 2: Graph API creep
The mappings page must stay GUID+label manual entry. No Graph call, no permission
consent — the zero-Graph constraint is a milestone decision, not an oversight.

### Anti-Pattern 3: Editing the staged-fetch ladder three times
Extract before extending. The three duplicate ladders (preview/overwrite/instance)
already drifted once (the 2026-11-27 UAT transport-404 fix had to be applied in
each); a fourth edit (the `source` param) without extraction guarantees drift.

## Sources

- Codebase reads (2026-11-27): server.js :800-820, :6583, :8957-9060, :10231-10290,
  :10795-10880, :4056; export/backup.js :690-1000; export/restore.js imports :74-76;
  src/shell/layout.js :53-74, :186-201; src/shell/render.js :21-60; src/pages/governance.js;
  src/core/api.js :29, :154, :229, :455
- .planning/PROJECT.md (v3.6 milestone context, D-10, D-04)
