# Project Research Summary

**Project:** Projects Studio v3.6 — Entra ID Mappings, OIDC linking docs, restore-source selection
**Domain:** Self-hosted multi-tenant PM tool — SSO group-mapping admin surface + DR restore ergonomics, on a zero-dependency Node.js stdlib app
**Researched:** 2026-11-27
**Confidence:** HIGH (all four research files codebase-grounded with line-level verification)

## Executive Summary

v3.6 is an incremental milestone on an existing, opinionated codebase: a zero-new-dependency Node.js (>=24, `node:sqlite`) server with a hand-rolled Vite SPA, shipping three features — (1) an operator-facing Entra ID group-mappings CRUD page, (2) a docs-only rewrite of the OIDC linking policy in DEPLOY.md, and (3) restore-source selection with per-source availability checks on the v3.5 backup registry. The unanimous research verdict: **zero stack additions**. Every capability rides existing seams — the `group_mappings` table (v3.2), the `oidcEnabled` config flag (D-10), the hand-rolled OIDC flow, the destination registry and probe functions (v3.5), and the house patterns (guard ladder, keyed refusals ×5 locales, server-derived truth). Anyone tempted to add an MS Graph SDK, an OIDC client lib, a form framework, or dotenv should be refused: those are locked-out decisions, not oversights.

The recommended approach is integration, not invention: a new lazy `mappings` route + two colocated server routes (GET list, DELETE), a *refactor-first* restore path (extract the ×3 duplicated staged-fetch ladders into one `resolveRestoreSource` helper, then add the `source` param), and one docs pass covering the Azure `ApplicationGroup` manifest + Enterprise Application assignment steps plus the `OIDC_TRUST_TENANT_EMAIL` decision tree.

The key risks are all documented in PITFALLS.md with codebase line references: raw GUID paste bypassing `canonicalizeGuid` (duplicate/dead mappings), stored XSS via operator labels on re-render paths, delete-copy promising instant member removal (semantics are deferred-to-next-login), existence-oracle leaks via 403/404 mixing, probe-on-page-load freezing the restore console, and bypassing the sha256-guarded read-back twins when restoring from a chosen source. All are preventable with the existing house funnels — provided each is written into its phase plan *before* code.

## Key Findings

### Recommended Stack

**Zero new dependencies.** `package.json` stays byte-identical except the 3.6.0 version bump. The standing invariant (no npm runtime deps since v1.1) holds without exception.

**Core technologies (unchanged):**
- Node.js >=24 (`node:http`, `node:crypto`, `node:sqlite`) — every v3.6 capability is plain stdlib work already proven in v3.2–v3.5
- Vite ^8.3.8 — new Mappings page as its own lazy chunk (Settings/Governance precedent, 500 kB gate)
- Playwright ^1.65.1 — new e2e specs for mappings CRUD + restore-source picker, existing config
- **Explicitly rejected:** MS Graph SDK (no-permission posture), OIDC client libs (`oidc.js` shipped), data-grid/select libs (picker patterns exist), destination SDKs (hand-rolled clients UAT-validated)

### Expected Features

**Must have (table stakes):**
- Mappings page: list / create (GUID paste canonicalized + label + workspace picker + role picker owner/admin/member) / delete — Instance nav, gated on `oidcEnabled` && operator (client hides, server 403 enforces)
- `DELETE /api/governance/group-mappings/:id` — audited, keyed `groupMappingNotFound` ×5 locales, **no membership mutation** (removal at next SSO login)
- Strict GUID validation at save; duplicate (guid+workspace+kind) refused; viewer role refused server-side regardless of UI
- Restore-source picker (enabled destinations only) + per-source availability check behind the existing restore lock
- DEPLOY.md rewrite: `groupMembershipClaims: "ApplicationGroup"` manifest step, Enterprise Application group assignment, `OIDC_TRUST_TENANT_EMAIL` decision tree, symptom table

**Should have (differentiators):**
- Inline dead-mapping hints per row ("not seen at any login since X")
- Manual-vs-seen label mismatch display
- Restore-source health badges on the Restore page itself (Proxmox-style, where the action happens)
- Docs organized by symptom ("groups claim empty" → the two Azure steps)

**Defer (v2+):**
- Bulk CSV mapping import; optional Graph-backed group browser (owner posture change required)

### Architecture Approach

Integration points are all verified in the live codebase. The mappings page follows the governance.js analog: new lazy route registered in ROUTE_IDS first (else 404), nav-gated via the already-shipped `api.oidcEnabled`, routes colocated after the existing group-mappings POST (:8957) with the guard ladder copied verbatim from the dead-mappings GET (:9026). Restore-source selection **must extract first, extend second**: the identical local→s3→ftp→smb ladder appears in three server.js routes (preview/overwrite/instance) and has already drifted once — a fourth edit without extraction guarantees drift. The `source` param validates against mirror flags; `sources[]` is server-derived (D-23/D-89-14); the availability probe is a dedicated POST, never inside the list GET.

**Major components:**
1. **Mappings server routes** (GET + DELETE at server.js:8957 area) — guard ladder, keyed refusals, audit, no schema change
2. **`src/pages/mappings.js`** — new lazy page, one shared escaping template, full repaints only
3. **`resolveRestoreSource(row, requested)` helper** — extracted twin-seam ladder, byte-identical behavior pinned by golden tests before the `source` param lands
4. **`POST /api/backup/restore/source-check`** — on-demand probe dispatch over existing `probeS3/probeFtp/probeSmb`, operator-keyed throttle, CAP.RESTORE_USE
5. **DEPLOY.md + .env.example** — docs only, verified against server.js:6673–6715

### Critical Pitfalls

1. **Raw GUID paste stored without the `canonicalizeGuid` funnel** — every write path routes through `guidRefusal`/`canonicalizeGuid`; regression test proves `{braced}`/uppercase/no-hyphen collapse to one row. (Mappings backend)
2. **Stored XSS via operator labels on re-render paths** — one escaping template, full-table repaints for every state change (poll, locale switch, delete repaint); hostile-label test in the same phase. (Mappings UI)
3. **Delete-copy promising instant member removal** — copy must state deferred revocation at next SSO login; DELETE route never touches `memberships`. (Mappings UI)
4. **Existence oracle via 403/404 mixing** — uniform 404 discipline for non-operators; never echo the requested GUID. (Mappings backend)
5. **Probe-on-page-load freezes the restore console** — mirror flags render synchronously; probes are explicit, on-demand, per-source; a UI probe never clears a mirror flag. (Restore UI)
6. **Twin-seam bypass / mid-run source swap** — selection reorders the existing guarded legs (flag+config+sha256+dropStagedTmp+mirrorMissing); source frozen once staging starts; a switch = a new runId. No new stage enums — detail lives in error text + audit. (Restore backend)

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Mappings backend — server routes + funnels
**Rationale:** The DELETE endpoint is the only genuinely new server surface; building it before any UI prevents the UI from inventing a bypass around the funnels (Pitfall 1). No client dependency.
**Delivers:** `GET /api/governance/group-mappings` (workspace names joined inline), `DELETE /api/governance/group-mappings/:id`, duplicate refusal with try/catch + pre-check (both dialects, parity test), viewer/instance-role refusals, 5-locale keys, audit.
**Addresses:** DELETE endpoint + audit (P1)
**Avoids:** Pitfalls 1, 4, 5, 6

### Phase 2: Mappings SPA — page + nav
**Rationale:** Depends on Phase 1 routes and the already-shipped `api.oidcEnabled`. ROUTE_IDS registration must come first or the catch-all 404s.
**Delivers:** New lazy `mappings` route, nav item in the Instance group, create form (paste + workspace picker + role picker), delete with honest next-login confirmation copy, dead-mapping trail reuse.
**Addresses:** Mappings CRUD page (P1), dead-mapping hints (P2)
**Avoids:** Pitfalls 2, 3

### Phase 3: Restore-source refactor — extract the shared ladder
**Rationale:** **The one hard ordering constraint**: the ×3 duplicated staged-fetch ladders must be extracted into `resolveRestoreSource` *before* the `source` param lands, or the param gets edited in three places. Pure refactor pinned by golden tests.
**Delivers:** One `resolveRestoreSource(row, requested)` helper, byte-identical behavior.
**Addresses:** Prerequisite for restore-source selection (P1)
**Avoids:** Pitfall 10 (twin-seam bypass), the ladder-drift trap

### Phase 4: Restore-source backend — `source` param + probe route
**Rationale:** Depends on Phase 3. The probe route can land here; refusal keys ride the same commit.
**Delivers:** Optional `body.source` on restore routes (omitted = registry order, backward compatible), `sources[]` derived server-side in the backups GET, `POST /api/backup/restore/source-check` with keyed throttle, `restoreSourceNotMirrored`/`restoreSourceUnavailable` ×5 locales.
**Addresses:** Restore-source selection server side (P1)
**Avoids:** Pitfalls 10, 11, 12 (source frozen at staging start; no new stage enums)

### Phase 5: Restore-source SPA + OIDC docs
**Rationale:** Depends on Phase 4; docs are independent and light — they can ride this phase or run parallel. The docs' "copy Object ID" step pairs with the mappings paste field (adjacent phases rule).
**Delivers:** Restore dialog source selector rendering `sources[]` with on-demand availability badges; DEPLOY.md linking-policy rewrite (ApplicationGroup manifest, Enterprise App assignment, trust-tenant-email decision tree, guest carve-out, symptom table); `.env.example` expansion.
**Addresses:** Restore picker + availability UI (P1), DEPLOY.md rewrite (P1)
**Avoids:** Pitfalls 7, 8, 9 (docs verified against server.js:6673–6715; zero probes on page load)

### Phase Ordering Rationale

- **Phases 1–2 = the mappings feature; 3–4–5 = restore-source + docs.** Each feature is a server-first, client-second pair — the house pattern.
- **The extraction-before-extension rule (Phase 3 before Phase 4) is the only non-negotiable ordering trap** in this milestone.
- Every phase carries the standing gates: keyed refusals ×5 locales in the same commit, pg-parity suite, Playwright e2e on existing fixtures, chunk-gate for the new lazy route.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (ladder extraction):** refactor with behavioral-pinning requirements — golden tests must be designed carefully before touching three call sites
- **Phase 4 (restore-source backend):** touches the sha256-guarded twin seam, restore lock, and run-state machine — the highest-consequence integration in the milestone

Phases with standard patterns (skip research-phase):
- **Phase 1:** guard ladder + funnel reuse is copy-verbatim from two existing routes
- **Phase 2:** governance.js is the direct analog; picker patterns shipped in v3.2/v3.4
- **Phase 5 (docs):** content verified against shipped v1.6 SSO semantics; no code paths change

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero additions; verified against package.json and shipped v3.2–v3.5 seams |
| Features | HIGH | Cross-checked against Keycloak, Grafana, Unleash, restic/Proxmox conventions + learn.microsoft.com manifest reference |
| Architecture | HIGH | Every line reference read directly in the live codebase, not inferred |
| Pitfalls | HIGH | Codebase-grounded (groups.js, server.js, export/restore.js, DEPLOY.md) with per-pitfall phase mapping |

**Overall confidence:** HIGH — this is integration research on a well-documented internal codebase with locked decisions; external docs were only needed for the Entra manifest behavior (confirmed).

### Gaps to Address

- **Label mismatch display feasibility:** FEATURES.md marks it additive *only if* the last-seen GUID→display-name snapshot is already stored — verify during Phase 1 planning whether v3.2 reconciliation persists that data; defer to v1.x if not.
- **Dead-mapping inline hints data availability:** the "not seen since X" hint assumes last-seen timestamps exist; confirm the exact payload shape during Phase 1/2 planning.
- **Chunk-gate manifest:** confirm whether the 500 kB chunk gate enumerates chunks explicitly; if so, add `mappings` to it in Phase 2.
- **Restore probe UX placement:** health badges on the Backup console (source-side) are v1.x — decide during Phase 5 planning whether to include.

## Sources

### Primary (HIGH confidence)
- Codebase reads (2026-11-27): `groups.js`, `server.js` (multiple verified ranges), `export/{backup,restore,s3,ftp,smb}.js`, `db-adapter.mjs`, `src/shell/{layout,render}.js`, `src/core/api.js`, `src/pages/governance.js`, `docs/DEPLOY.md`, `package.json`
- learn.microsoft.com — Entra app manifest `groupMembershipClaims` reference (ApplicationGroup semantics)
- Grafana Entra ID OAuth docs, GeoServer Azure OIDC, Open WebUI Entra group sync, Broadcom KB (empty-groups-claim failure mode)

### Secondary (MEDIUM confidence)
- Keycloak Server Administration (mapping admin conventions, sync-at-login semantics), Unleash Keycloak group-sync docs, Netbox SSO discussion
- restic/Proxmox restore conventions (explicit source selection + readiness checks)

### Tertiary (LOW confidence)
- None material — no speculative sources; the only MEDIUM items above are established tool behaviors

---
*Research completed: 2026-11-27*
*Ready for roadmap: yes*
