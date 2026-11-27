# Feature Research — v3.6: Entra Mappings UI, OIDC Docs, Restore-Source Selection

**Domain:** self-hosted multi-tenant PM tool — SSO group-mapping admin surface + DR restore ergonomics
**Researched:** 2026-11-27
**Confidence:** HIGH (conventions cross-checked against Keycloak, Grafana, Unleash, Netbox, LangSmith, GeoServer, Open WebUI self-hosted SSO docs; Entra manifest behavior confirmed against learn.microsoft.com app-manifest reference)

## Scope note

This covers ONLY the v3.6 delta: (1) Entra ID Mappings operator page, (2) OIDC_TRUST_TENANT_EMAIL linking-policy docs, (3) restore-source selection + availability check. Existing v3.2 group-claim ingestion, group_mappings table, dead-mappings card, and the 4-destination backup registry are dependencies, not features to re-research.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Mappings list with label + GUID visible | Every comparable admin surface (Keycloak role-mappings, Unleash group-sync, Grafana team mapping) shows a flat table of group→target rows; operators can't trust what they can't see | LOW | GET route exists (dead-mappings card already renders it); extend to a real page in the Instance nav section |
| Create mapping via paste + label | Manual GUID paste is the documented pattern for claims-first tools without Graph (LangSmith, GeoServer both instruct "copy Object ID from Entra portal, paste"); a display-name/label field is universal so the table is human-readable | LOW | GUID canonicalize (existing `parseDomainList`-style funnel pattern; reuse the v3.0 canonicalizer discipline), manual label, `kind: 'workspace'` fixed |
| GUID format validation at save | Operators paste from the Entra portal "Object ID" copy button; any tool that accepts garbage GUIDs produces silent-dead mappings (the exact v3.2 dead-mapping pain) | LOW | Strict GUID regex (lowercase/normalize), refuse non-GUID with keyed localized refusal — matches the keyed-refusal/5-locale house pattern |
| Workspace picker from live list | Every mapping admin surfaces a dropdown of targets, not a free-text ID field (Keycloak, Unleash); free-text invites typos that only surface as dead mappings | LOW | Reuse the Edit-Teams selectable picker pattern (v3.4 parity ruling); operators already see all workspaces cross-workspace |
| Role picker excluding viewer | Role choice at mapping time must match what SSO can grant; the locked decision refuses viewer at save — the UI must reflect that, not allow it then fail | LOW | owner/admin/member only; server refuses viewer with a keyed refusal regardless of UI (defense-in-depth, one door one rule) |
| Duplicate-GUID-per-workspace guard | Mapping the same group twice to the same workspace with different roles is the #1 config error in comparable tools; convention is either refuse or explicit "highest wins" note | LOW | Refuse exact duplicate (guid+workspace+kind); v3.2 D-82-1 "highest role wins" semantics already disambiguate legitimate multi-mapping across roles — show that rule inline in the form |
| Delete with honest consequences | Self-hosted admins expect delete to state deferred semantics: "members lose access at next SSO login" (snapshot-at-login model, same as Keycloak's re-login sync and Unleash's documented behavior) | LOW | Confirm dialog states removal-at-next-login; no immediate membership mutation (existing guard funnel handles it at login) |
| Nav visibility gated on `oidcEnabled` + operator | Showing SSO admin pages when SSO is off is dead UI; every self-hosted tool hides IdP-dependent sections behind their enable flag (Grafana `disable_login_form`-style gating convention) | LOW | `/api/config` already exposes gates; render nav item only when `oidcEnabled` && operator, 403 server-side regardless (client hides, server enforces) |
| Docs: exact Azure manifest + assignment steps | The single most common failure mode in the wild (GeoServer, Open WebUI, Broadcom KB, Grafana docs all document it): missing `groupMembershipClaims: "ApplicationGroup"` in the app-registration manifest AND missing group assignment to the Enterprise Application — either omission yields an empty `groups` claim with no error | LOW (docs only) | DEPLOY.md linking-policy rewrite must include: manifest edit path (App registrations → Manifest → `"groupMembershipClaims": "ApplicationGroup"`), Users and groups → Assign groups to the Enterprise Application, and the ApplicationGroup note that only *assigned* groups are emitted (this is precisely why ApplicationGroup was chosen in v3.2 — it caps claim size and avoids the 200-group overage) |
| Restore-source picker listing enabled destinations | Restore tools (rclone, restic, Borgmatic UIs, Proxmox backup restore dialogs) always present the source repository/store as an explicit choice before listing archives | LOW | Registry-driven dropdown (local/s3/ftp/smb), filtered to enabled destinations; runs behind existing restore lock |
| Per-source availability probe before listing | Restore flows must fail fast and clearly when the mirror is unreachable (NAS offline, key wrong); restic/rclone convention is check-then-list with a typed error per source kind | MEDIUM | Registry already carries probe seams (S3 probe-at-save, FTP probe ×5, SMB guest-session probe exist); generalize one `checkSource(kind, cfg)` call + badge/status per source |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dead-mapping awareness built into the page | Most tools only detect dead mappings via logs; gr8r already has the dead-mappings card — surfacing "this GUID no longer arrives in anyone's groups claim" inline on the mappings page (and boot warnings) is operator-grade honesty few self-hosted tools ship | LOW | Existing dead-mapping detection reused; show a "not seen at any login since X" hint per row if the data already exists (v3.2 boot warnings suggest it does) |
| Group label reconciliation display | Show "manual label" vs "label seen at last login" mismatch — catches typo'd GUIDs immediately instead of at the dead-mapping warning weeks later | MEDIUM | Needs the last-seen GUID→display-name snapshot from login reconciliation; additive only if already stored |
| Restore-source health surfaced on the Restore page itself (not Settings) | Proxmox-style: availability shown where the action happens; a green/grey dot per source beside the picker beats a separate diagnostics page | LOW | Same probe call, rendered as badge next to the picker |
| Docs written as the two failure modes, not feature list | Best-in-class SSO docs (Open WebUI, Grafana) organize Entra setup by symptom ("groups claim empty" → these two steps); framing DEPLOY.md's linking policy as claim-guarantee + symptom table is a differentiator in honesty | LOW (docs) | Structure: what the app guarantees (pinned-tenant member substitutes for email_verified, guests require literal claim) → what Entra must emit (manifest + assignment) → symptoms table |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Graph API group lookup / autocomplete in the mapping form | "Just search the directory" | Requires app permissions (GroupMember.Read.All), admin consent, client secrets, secret rotation — the whole reason v3.2 went claims-first; breaks the zero-permission posture | Manual GUID paste + label (locked decision); docs point operators to the Entra portal copy button |
| Immediate member removal on mapping delete | "Delete should take effect now" | Diverges from the snapshot-at-login model everywhere else; requires a live reconcile pass, risks fighting the guard funnel (last-owner/last-operator) outside the login path where it's proven | Deferred removal at next login, stated honestly in the delete confirmation and docs |
| Viewer role mapping | "Some groups are read-only" | Locked decision: viewer refused at save; JIT viewer grants via groups conflict with the invite-hierarchy model (M-01 lineage) | Map to member; viewership is managed per-workspace via invites/teams |
| Instance-role mappings via the same UI | "Same mechanism, one table" | Locked scope: `kind: 'workspace'` only this milestone; instance roles are audited grants (v3.3) with different guards — mixing them in one table muddies audit trails | Keep instance-role grants in the Instance Roles governance tab |
| Live "re-sync all users now" button | "I want changes applied instantly" | A reconcile-everything pass is a new code path with its own race/guard surface; every comparable tool (Keycloak federation sync, Unleash) still defers to login-time sync by default | Ship snapshot-at-login only; note in docs that an operator can ask each affected user to re-login |
| Restore from an *unenabled* destination | "Let me pick any registered destination" | Restoring from a disabled slot contradicts the dormant-slot contract (v3.5) — a dormant slot's custody/probe semantics aren't guaranteed | Picker limited to enabled destinations; disabled rows shown greyed with reason, not selectable |

## Feature Dependencies

```
[Entra Mappings page]
    └──requires──> group_mappings table + POST route (exists, v3.2)
    └──requires──> DELETE route (NEW — one endpoint)
    └──requires──> oidcEnabled gate via /api/config (exists)
    └──requires──> i18n keys in all 5 locales (standing gate)

[OIDC docs rewrite]
    └──requires──> nothing code-side (DEPLOY.md + .env.example only)
    └──enhances──> Mappings page (docs explain where GUIDs come from)

[Restore-source selection]
    └──requires──> destination registry (v3.5, exists)
    └──requires──> probe seams per destination (exist: s3/ftp/smb probe, local trivially available)
    └──requires──> restore preview/read-back pipeline (v3.5, exists) — selection feeds the staged read-back, does not change it
    └──conflicts with──> nothing; additive behind existing restore lock
```

### Dependency Notes

- **Mappings page requires DELETE endpoint:** the only genuinely new server surface is `DELETE /api/governance/group-mappings/:id` (audited like POST, keyed refusals, 5-locale).
- **Restore selection requires generalization, not invention:** all four probe implementations already exist at save/backup time; the work is exposing one availability check against a chosen source + wiring the picker into restore's source resolution.
- **Docs and page enhance each other:** the docs' "copy Object ID" step pairs with the form's paste field — ship in adjacent phases.

## MVP Definition

### Launch With (v1)

- [ ] Mappings page (Instance nav, oidcEnabled+operator gated): list / create (GUID paste canonicalized + label + workspace picker + role picker owner/admin/member, viewer refused) / delete with next-login-removal confirmation
- [ ] `DELETE /api/governance/group-mappings/:id` — audited, operator-403 server-side, duplicate + viewer refusals keyed in 5 locales
- [ ] Restore-source picker + per-source availability check behind the existing restore lock
- [ ] DEPLOY.md linking-policy rewrite: ApplicationGroup manifest step, Enterprise Application group-assignment step, trust-tenant-email policy, symptom table; .env.example comment expansion

### Add After Validation (v1.x)

- [ ] Dead-mapping hints inline per row (if last-seen data already stored)
- [ ] Manual-vs-seen label mismatch display
- [ ] Restore-source health badges on the Backup console too (source-side, not just restore)

### Future Consideration (v2+)

- [ ] Bulk CSV mapping import (matters only at >20 mappings; pasted GUIDs scale poorly but honestly)
- [ ] Optional Graph-backed group browser as an explicit opt-in feature flag (permission + consent posture change — owner decision required)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Mappings CRUD page | HIGH | LOW-MED | P1 |
| DELETE endpoint + audit | HIGH | LOW | P1 |
| Restore-source picker + availability | HIGH (deferred since v3.5) | MEDIUM | P1 |
| DEPLOY.md Entra setup + linking policy | HIGH (unblocks real SSO rollout) | LOW | P1 |
| Dead-mapping inline hints | MEDIUM | LOW | P2 |
| Label mismatch display | MEDIUM | MEDIUM | P2 |
| Bulk import | LOW | MEDIUM | P3 |

## Competitor Feature Analysis

| Feature | Keycloak / Grafana (SSO mapping) | restic / Proxmox (restore source) | Our Approach |
|---------|----------------------------------|-----------------------------------|--------------|
| Group mapping UI | Admin console table of group→role mappings; Entra guides require manifest + assignment steps | n/a | Operator page, manual GUID + label, viewer refused — claims-first, no Graph |
| Delete semantics | Sync-at-relogin or periodic federation sync (default: not immediate) | n/a | Removal at next SSO login via existing guard funnel; stated in confirm dialog |
| Source selection | n/a | Explicit repository selection + lock/readiness check before listing archives | Registry-driven picker restricted to enabled destinations, probe before listing |
| Failure honesty | Grafana/Open WebUI docs organize Entra setup by missing-claim symptom | Typed per-source errors (restic exit codes) | Symptom-table DEPLOY.md + typed availability refusal per source kind |

## Sources

- learn.microsoft.com — Entra app manifest `groupMembershipClaims` reference (ApplicationGroup = only groups assigned to the Enterprise Application) — HIGH
- Grafana Entra ID OAuth docs, GeoServer Azure OIDC, Open WebUI Entra group-name sync, Broadcom KB (empty groups claim failure mode) — HIGH
- Keycloak Server Administration (group/role mapping admin conventions, sync-at-login semantics), Unleash Keycloak group-sync docs, Netbox SSO discussion — MEDIUM
- restic/Proxmox restore conventions (explicit source selection + readiness) — MEDIUM (established tool behavior, general knowledge)
- Project internals: PROJECT.md v3.2/v3.5 shipped records, locked decisions (no Graph, viewer refused, kind: workspace only, dormant-slot contract) — HIGH

---
*Feature research for: Projects Studio v3.6 — Entra Mappings, OIDC docs, Restore-source selection*
*Researched: 2026-11-27*
