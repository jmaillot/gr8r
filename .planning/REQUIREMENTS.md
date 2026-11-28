# Requirements: Milestone v3.6 — Entra ID Mappings & Restore Sources

**Defined:** 2026-11-27 — from owner request (Entra ID Mappings page conversation) + v3.5 backlog carry-over (restore-source selection) + research SUMMARY.md (4 dimensions, HIGH confidence, zero stack additions).

**Core Value:** Self-hosted, zero-dependency, multi-tenant project-management workspace. v3.6 adds an operator UI for Entra group → workspace mappings (manual GUID + manual label — no Graph, no API permissions), rewrites the now-wrong OIDC linking docs, and ships restore-source selection on the v3.5 destination registry.

## Owner Rulings (2026-11-27, from milestone discussion)

- **R-1 No Graph:** mappings are created with a manually-pasted GUID and a manually-typed label. Zero API permissions, zero admin consent, zero client-credential flow. Graph name-lookup is a future optional enhancement (Option A/C seam) — explicitly out of scope.
- **R-2 Workspace membership only:** mappings target workspace roles owner|admin|member (viewer refuses at save — v3.2 locked decision). NO instance-role (backup/restore operator) mappings in this milestone.
- **R-3 Lazy revocation:** deleting a mapping does NOT touch memberships; group-derived members are cleaned at their next SSO login by the existing removal sync (last-owner guard intact). UI copy states this honestly.
- **R-4 Flags are the truth:** restore-source availability derives server-side from run mirror flags (uploaded/ftp_uploaded/smb_uploaded — D-23 doctrine); the availability check is a dedicated throttled POST, NEVER inside the backups list GET (D-89-14 no-live-probing contract).
- **R-5 Refactor before extension:** the ×3 duplicated staged-fetch ladder is extracted into one `resolveRestoreSource(row, source)` helper byte-identically (golden-pinned) BEFORE the `source` param lands (the ladder already drifted once — 2026-11-27 UAT fix).

## v3.6 Requirements

### Mappings backend (MAP)

- [x] **MAP-01**: Operator can list all group mappings via `GET /api/governance/group-mappings` — each row carries group_guid, label, role, kind, workspace name resolved server-side (client never names workspaces by bare id), created/updated timestamps; guard ladder identical to dead-mappings GET (sameOrigin → requireUser → operator gate before any lookup → operator-keyed throttle).
- [x] **MAP-02**: Operator can delete a mapping via `DELETE` (id-keyed) — sameOrigin + operator gate + keyed throttle; audited (`group_mapping_deleted`); refusal codes ×5 locales (unknown id = same generic 404-or-keyed-refusal posture as the family, no existence oracle); the route NEVER writes to memberships/team_members (lazy revocation is the callback's job).
- [x] **MAP-03**: Mapping create (existing POST) and delete funnel every write through `canonicalizeGuid`/`guidRefusal`/`roleTokenRefusal` (groups.js:34/54/64) — paste variants ({braced}, no-hyphen, uppercase) collapse to one key; viewer role refuses at save; (group_guid, workspace_id) unique-index collision maps to the keyed `groupMappingDuplicate` refusal in BOTH SQLite and Postgres dialects (never a raw 500).
- [x] **MAP-04**: The mappings list surfaces dead-mapping hints — rows pointing at archived/deleted workspaces flagged inline, and label/GUID mismatches surfaced from stored provenance (`group:<guid>` membership rows) where derivable, so the dead-mapping problem the v3.2 card warns about becomes visible before it happens.

### Mappings UI (MAPUI)

- [x] **MAPUI-01**: Instance nav gains an "Entra ID Mappings" entry visible only when `/api/config` reports `oidcEnabled: true` (D-10 server ground truth); the page is a lazy SPA route whose real gate is the server 403 (non-operator deep-link gets the governance-style fullstate — nav gate is cosmetic, D-11).
- [x] **MAPUI-02**: The page lists mappings (group label + GUID mono, workspace name, role badge, timestamps) and offers a create form: GUID paste field (canonicalizing), label field (≤200 chars, esc()d at every render), workspace picker fed by the operator workspaces listing, role picker owner/admin/member — with keyed err toasts for every refusal code.
- [x] **MAPUI-03**: Delete rides an inline-confirm (D-90 pattern) whose copy states the lazy revocation semantics verbatim ("members will lose access at their next Microsoft sign-in"); success toast + list refresh; the archived workspaces audit funnel stays untouched.
- [x] **MAPUI-04**: The dead-mappings warning card (orphans + guard-refused trail) moves from the Governance tab to the Entra ID Mappings page (same data source, same display-only discipline, no data-a in the card) — Governance loses the card, the new page gains it below the mappings list.

### Restore-source selection (RSRC)

- [x] **RSRC-01**: The three duplicated staged-fetch ladders (preview server.js:10826/:10842/:10857, overwrite :11004-11032, instance :11134-11168) collapse into ONE `resolveRestoreSource(row, source)` helper — byte-identical behavior pinned by golden tests over the s3 > ftp > smb ordering + local fallback; no `source` param in this phase (refactor is purely mechanical).
- [ ] **RSRC-02**: Restore routes accept an explicit `source` parameter validated against the run's mirror flags (uploaded/ftp_uploaded/smb_uploaded — flags ARE the truth, D-23); chosen source flows through the existing sha256 read-back twin seam (dropStagedTmp, mirrorMissing → clearMirrorFlag, restore lock, stage vocabulary frozen — detail lives in error text + audit, never new statuses); invalid/disabled source = keyed refusal ×5.
- [ ] **RSRC-03**: Restore payload surfaces `sources[]` derived server-side from the run's mirror flags, and a dedicated throttled availability-check POST probes the chosen destination on demand (probeS3/probeFtp/probeSmb seams — never on list GET, D-89-14); probing never mutates run state.
- [ ] **RSRC-04**: The restore dialog offers a source picker fed by `sources[]` (picker restricted to enabled destinations per the dormant-slot contract), with an on-demand availability check UI (per-source or check-all — UX decided at discuss-phase); restoring from a chosen source shows its verification result honestly (badge/toast), and source switching mid-run is not offered (new runId semantics).

### OIDC documentation (OIDCDOC)

- [ ] **OIDCDOC-01**: DEPLOY.md "Linking policy — verified email required" section is rewritten to lead with `OIDC_TRUST_TENANT_EMAIL=true` for Azure AD work/school tenants (tokens omit `email_verified`), pinning the guest carve-out (acct=1 / external idp still requires the literal claim), with a symptom→cause table ("Sign-in with Microsoft failed" → missing claim → set the flag) replacing the now-wrong "check tenant email verification" operator note — verified against server.js:6673-6715, not memory.
- [ ] **OIDCDOC-02**: DEPLOY.md Azure setup steps gain the two missing group-claim prerequisites: manifest edit `groupMembershipClaims: "ApplicationGroup"` (assigned-groups-only semantics stated) and assigning the Entra group to the Enterprise Application (Users and groups), plus where to copy the group Object-ID GUID for the mappings page — feeding the MAPUI-02 paste form.
- [ ] **OIDCDOC-03**: .env.example's `OIDC_TRUST_TENANT_EMAIL` comment expands to state the why (Azure AD work/school tokens omit the claim), the guest carve-out, and the pointer to the DEPLOY.md section.

## Future Requirements (deferred — not this milestone)

- **Graph group-name lookup** (Option A/C): resolve displayName at save or on-demand via client-credentials + `GroupMember.Read.All` admin consent; store/stale-name policy TBD. Blocked on owner's willingness to add the API permission.
- **Instance-role group mappings** (backup/restore operator via group): new `kind`, reconcile extension, overlap rules with manual grants — deferred per R-2.
- **MCP server mirror** of mappings save/delete: fourth-door funnel re-use — flagged by research, owner to decide when the MCP surface needs it.
- **Restore-source granularity**: per-destination run statuses (single `upload_failed` retained per v3.5 debt note).

## Out of Scope (explicit exclusions)

- **Microsoft Graph integration of any kind** (R-1) — including read-only displayName lookup; the mappings page is fully functional without it.
- **Immediate membership removal on mapping delete** (R-3) — the removal sync at next login is the only revocation path; no new race/guard surface.
- **Viewer-role mappings** — v3.2 locked decision (mappings narrow to the 3-token set).
- **Probing inside the backups list GET** (R-4) — D-89-14 contract.
- **Live source swap mid-restore** — new runId semantics only.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MAP-01 | Phase 101 | Complete |
| MAP-02 | Phase 101 | Complete |
| MAP-03 | Phase 101 | Complete |
| MAP-04 | Phase 101 | Complete |
| MAPUI-01 | Phase 102 | Pending |
| MAPUI-02 | Phase 102 | Pending |
| MAPUI-03 | Phase 102 | Pending |
| MAPUI-04 | Phase 102 | Pending |
| RSRC-01 | Phase 103 | Complete |
| RSRC-02 | Phase 104 | Pending |
| RSRC-03 | Phase 104 | Pending |
| RSRC-04 | Phase 105 | Pending |
| OIDCDOC-01 | Phase 105 | Pending |
| OIDCDOC-02 | Phase 105 | Pending |
| OIDCDOC-03 | Phase 105 | Pending |

Coverage: 15/15 v1 requirements mapped, no orphans, no duplicates.
