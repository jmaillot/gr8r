# Roadmap: Projects Studio

## Milestones

🚧 **v3.6 Entra ID Mappings & Restore Sources** (current — Phases 101–105)
✅ v3.5 Backup Destinations SMB & FTP (Shipped: 2026-11-27 — Phases 96–100)
✅ v3.4 UX Polish & Backup Console Refinement (Shipped: 2026-11-24 — Phases 91–95)

*(full shipped-milestone history lives in MILESTONES.md)*

---

## Milestone v3.6 — Entra ID Mappings & Restore Sources

**Goal:** Operator UI for Entra group → workspace mappings (manual GUID + manual label, no Graph), honest OIDC linking docs, and the deferred restore-source selection.

**Constraints (standing):** zero new npm dependencies; audit funnel keyed ×5 locales same-commit; dual-engine DDL lockstep (SQLite+Postgres via adapterEnsureColumn) if any schema change — research confirms NO schema change needed (group_mappings already carries every column); npm test baseline 2672 tests / 2 documented pre-existing failures; membershipsOf byte-gate stays green; package.json bumps to 3.6.0 at ship time.

### Owner Rulings baked into this roadmap

- **R-1 No Graph** — mappings created from manually-pasted GUID + manually-typed label; zero API permissions/consent.
- **R-2 Workspace membership only** — roles owner|admin|member (viewer refuses at save); no instance-role mappings.
- **R-3 Lazy revocation** — mapping delete never touches memberships; removal sync at next SSO login; UI copy states this honestly.
- **R-4 Flags are the truth** — restore-source availability derives from run mirror flags; availability check is a dedicated throttled POST, never inside the backups list GET (D-89-14).
- **R-5 Refactor before extension** — the ×3 duplicated staged-fetch ladders are extracted byte-identically (golden-pinned) BEFORE the `source` param lands (Phase 103 before Phase 104 — the milestone's one non-negotiable ordering constraint).

---

## Phases

- [x] **Phase 101: Mappings Backend — Routes & Funnels** - Operator GET list + DELETE routes for group_mappings riding the existing guard ladder and GUID/role funnels, with dead-mapping hint data surfaced server-side
- [x] **Phase 102: Mappings SPA — Entra ID Mappings Page** - New lazy Instance nav page for mappings CRUD with honest delete semantics and the relocated dead-mappings warning card
- [ ] **Phase 103: Restore-Source Refactor — Extract the Shared Ladder** - The ×3 duplicated staged-fetch ladders collapse into ONE `resolveRestoreSource(row, source)` helper, byte-identical and golden-pinned — no `source` param yet (R-5)
- [ ] **Phase 104: Restore-Source Backend — `source` Param & Probe Route** - Restore routes accept an explicit source validated against mirror flags; `sources[]` server-derived; dedicated throttled availability-check POST
- [ ] **Phase 105: Restore-Source SPA + OIDC Linking Docs** - Restore dialog source picker with on-demand availability UI, plus the DEPLOY.md/.env.example OIDC linking-policy rewrite

## Phase Details

### Phase 101: Mappings Backend — Routes & Funnels

**Goal**: Operators can list and delete Entra group→workspace mappings through server routes that are funnel-clean, audited, and dialect-parity safe — before any UI exists to bypass them.
**Depends on**: Nothing (first phase; rides the v3.2 `group_mappings` table and groups.js funnels — NO schema change)
**Requirements**: MAP-01, MAP-02, MAP-03, MAP-04
**Success Criteria** (what must be TRUE):
  1. An operator can retrieve all group mappings with each row carrying group_guid, label, role, kind, server-resolved workspace name (never a bare id) and timestamps; a non-operator gets the uniform 404 posture — no existence oracle.
  2. An operator can delete a mapping; the deletion is audited (`group_mapping_deleted`), unknown ids get the family's generic 404/keyed refusal, and the route never writes to memberships or team_members (lazy revocation intact).
  3. Pasting `{braced}`, no-hyphen or uppercase GUID variants through create/delete collapses to one canonical key via `canonicalizeGuid`/`guidRefusal`; a viewer-role mapping refuses at save; a (group_guid, workspace_id) duplicate maps to the keyed `groupMappingDuplicate` refusal in BOTH SQLite and Postgres — never a raw 500.
  4. The mappings list flags rows pointing at archived/deleted workspaces inline and surfaces label/GUID mismatches from stored provenance where derivable, so dead mappings are visible before they bite.
  5. Every new refusal key exists in all 5 locale catalogues in the same commit as the first emitting gate.

**Plans**: 1/1 plans executed

Plans:
- [x] 101-01-PLAN.md — GET list + DELETE routes, dialect-parity duplicate backstop, full test matrix

### Phase 102: Mappings SPA — Entra ID Mappings Page

**Goal**: Operators manage Entra group mappings end-to-end from a dedicated page in the app, with honest delete semantics and the dead-mapping problem made visible where mappings live.
**Depends on**: Phase 101
**Requirements**: MAPUI-01, MAPUI-02, MAPUI-03, MAPUI-04
**Success Criteria** (what must be TRUE):
  1. The Instance nav shows an "Entra ID Mappings" entry only when `/api/config` reports `oidcEnabled: true`; the page is a lazy route registered in ROUTE_IDS, and a non-operator deep-link is refused by the server 403 (governance-style fullstate) — the nav gate is cosmetic only.
  2. An operator can create a mapping from the page: GUID paste (canonicalizing), label (≤200 chars, esc()d at every render), workspace picker fed by the operator workspaces listing, role picker owner/admin/member — with a keyed localized error toast for every server refusal.
  3. An operator can delete a mapping through an inline-confirm whose copy states the lazy revocation semantics verbatim ("members will lose access at their next Microsoft sign-in"); success shows a toast and refreshes the list; the archived-workspaces audit funnel stays untouched.
  4. The dead-mappings warning card (orphans + guard-refused trail, display-only) renders below the mappings list on the new page and no longer appears on the Governance tab.

**Plans**: 2 plans
**UI hint**: yes

Plans:
- [ ] 102-01-PLAN.md — Structural skeleton: lazy route + cosmetic nav gate, API methods, guid.js port, list + empty state, strict dead-mappings card move out of Governance (MAPUI-01, MAPUI-04)
- [ ] 102-02-PLAN.md — CRUD interactions: always-visible create form with keyed refusal toasts, row hint badges + count chip, staged inline-confirm delete with verbatim lazy-revocation copy (MAPUI-02, MAPUI-03)

### Phase 103: Restore-Source Refactor — Extract the Shared Ladder

**Goal**: The three duplicated staged-fetch ladders (preview, overwrite, instance restore) become ONE `resolveRestoreSource(row, source)` helper with byte-identical behavior, golden-pinned — so Phase 104 edits one place instead of three (R-5: refactor strictly precedes extension; the ladder already drifted once).
**Depends on**: Nothing (independent of Phases 101–102; MUST precede Phase 104)
**Requirements**: RSRC-01
**Success Criteria** (what must be TRUE):
  1. Golden tests pin the extraction's behavior over the full s3 > ftp > smb ordering + local fallback, and they pass against the helper exactly as they passed against the three ladders (byte-identical: no `source` param, no behavior change).
  2. All three restore routes (preview server.js:10826/:10842/:10857, overwrite :11004-11032, instance :11134-11168) call the single helper — zero duplicated ladder logic remains.
  3. The full test suite stays at its documented baseline (2672 tests / 2 documented pre-existing failures) — the refactor introduces no regression and no new dependency.

**Plans**: TBD

### Phase 104: Restore-Source Backend — `source` Param & Probe Route

**Goal**: Operators can restore from an explicitly chosen mirror source (s3/ftp/smb/local), with the choice validated against run mirror flags and an on-demand availability probe — server-side truth, no live probing in the list GET.
**Depends on**: Phase 103 (extraction-before-extension, R-5)
**Requirements**: RSRC-02, RSRC-03
**Success Criteria** (what must be TRUE):
  1. Restore routes accept an explicit `source` parameter validated against the run's mirror flags (uploaded/ftp_uploaded/smb_uploaded — flags ARE the truth); the chosen source flows through the existing sha256 read-back twin seam (dropStagedTmp, mirrorMissing → clearMirrorFlag, restore lock, stage vocabulary frozen); omitting the param keeps today's registry-order behavior (backward compatible).
  2. An invalid or not-mirrored source yields a keyed refusal (`restoreSourceNotMirrored`/`restoreSourceUnavailable` classes) in all 5 locales; no new stage enums — detail lives in error text + audit.
  3. The restore payload surfaces `sources[]` derived server-side from the run's mirror flags, restricted to enabled destinations per the dormant-slot contract.
  4. A dedicated throttled availability-check POST probes the chosen destination via the existing probeS3/probeFtp/probeSmb seams — the backups list GET never probes (D-89-14), and probing never mutates run state.

**Plans**: TBD

### Phase 105: Restore-Source SPA + OIDC Linking Docs

**Goal**: Operators pick a restore source in the dialog with honest per-source availability feedback, and the OIDC linking documentation tells the truth about `OIDC_TRUST_TENANT_EMAIL` and the Azure group-claim setup that feeds the mappings page.
**Depends on**: Phase 104 (restore UI), Phase 102 (docs' "copy the group Object-ID" step pairs with the mappings paste form)
**Requirements**: RSRC-04, OIDCDOC-01, OIDCDOC-02, OIDCDOC-03
**Success Criteria** (what must be TRUE):
  1. The restore dialog offers a source picker fed by `sources[]` (enabled destinations only) with an on-demand availability check UI (per-source or check-all — UX decided at discuss-phase); restoring from a chosen source shows its verification result honestly (badge/toast), and source switching mid-run is not offered.
  2. Zero probes fire on restore-page load — mirror flags render synchronously; probes are explicit, on-demand, and a UI probe never clears a mirror flag.
  3. DEPLOY.md's "Linking policy" section leads with `OIDC_TRUST_TENANT_EMAIL=true` for Azure AD work/school tenants, pins the guest carve-out (acct=1 / external idp still requires the literal claim), and includes a symptom→cause table — every claim verified against server.js:6673-6715, not memory.
  4. DEPLOY.md Azure setup steps document `groupMembershipClaims: "ApplicationGroup"` (assigned-groups-only semantics), assigning the Entra group to the Enterprise Application, and where to copy the group Object-ID GUID for the mappings page.
  5. .env.example's `OIDC_TRUST_TENANT_EMAIL` comment states the why (Azure AD work/school tokens omit the claim), the guest carve-out, and points to the DEPLOY.md section.

**Plans**: TBD
**UI hint**: yes

---

## Phase Ordering Rationale

- **Phases 101–102 = the mappings feature** (server-first, client-second — the house pattern); building routes before UI prevents the UI from inventing a funnel bypass.
- **Phase 103 is standalone and pure-refactor by design**: the extraction-before-extension rule (R-5) is the one non-negotiable ordering trap in this milestone — golden-pinned byte-identical extraction gets its own verification gate before the `source` param can land.
- **Phases 104–105 = restore-source** (backend, then SPA) with the **docs paired here** because they're independent and light, and the "copy the group Object-ID" step directly feeds the Phase 102 paste form (adjacent phases rule).
- Research's suggested 5-phase structure is followed as-is — justified, not imposed: each phase delivers one coherent, verifiable capability and the only single-requirement phase (103) exists because a mechanical refactor pinned by golden tests must not share a gate with behavioral extension.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 101. Mappings Backend — Routes & Funnels | 1/1 | In Progress|  |
| 102. Mappings SPA — Entra ID Mappings Page | 0/? | Not started | - |
| 103. Restore-Source Refactor — Shared Ladder | 0/? | Not started | - |
| 104. Restore-Source Backend — Source & Probe | 0/? | Not started | - |
| 105. Restore-Source SPA + OIDC Docs | 0/? | Not started | - |
