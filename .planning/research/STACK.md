# Stack Research — v3.6 Entra ID Mappings & Restore Sources

**Domain:** Operator UI + documentation + restore-source selection on an existing zero-dependency Node.js stdlib app
**Researched:** 2026-11-27
**Confidence:** HIGH

## Verdict: ZERO new stack additions

All three v3.6 features are expressible entirely in the existing stack. The zero-new-npm-dependencies invariant holds without exception — this milestone needs **no new runtime deps, no new dev deps, no vendored files**.

## Recommended Stack (unchanged)

### Core Technologies

| Technology | Version (pinned in use) | Purpose | Why Recommended |
|------------|-------------------------|---------|-----------------|
| Node.js | >=24 (`node --test`, `node:sqlite`) | Server, stdlib-only HTTP, SQLite | Every v3.6 capability (CRUD routes, JSON env, per-source probe) is plain `node:http` + `node:crypto` + `node:sqlite` work already proven in v3.2–v3.5 |
| Vite | ^8.3.8 (dev dep) | SPA bundling, lazy chunks | New Mappings page rides the existing lazy-chunk pattern (Settings/Governance precedents) under the 500 kB chunk gate |
| Playwright | ^1.65.1 (dev dep) | e2e | Existing config; new specs for mappings CRUD + restore-source picker |
| ESLint/Prettier | ^10.15.1 / ^3.10.1 (dev deps) | lint/format gates | No config changes needed |

### Supporting Libraries — NONE required

| Candidate library (what a normal project would add) | Verdict | What to use instead |
|---------|---------|---------------------|
| MS Graph SDK / `@azure/ms-graph-client`, `@microsoft/microsoft-graph-client` | ❌ REJECT | Feature is explicitly **no Graph / no API permissions / no consent**: operator pastes GUIDs manually. `group_mappings` rows are plain SQLite rows via existing table helpers |
| Azure AD B2C / OIDC client libs (`openid-client`, `oidc-client-ts`) | ❌ REJECT | `oidc.js` hand-rolled authorization-code+PKCE is shipped and verified; v3.6 only *documents* `OIDC_TRUST_TENANT_EMAIL` — zero code-path change beyond existing claims logic in `groups.js` |
| Frontend data-grid / select2 / form lib for the mappings page | ❌ REJECT | The SPA already ships token-chip pickers (v3.2 multi-add pickers), selectable user pickers (v3.4 Edit-Teams picker), and per-role tabs. Workspace picker = a `<select>` from an existing operator workspaces listing; role picker = owner/admin/member radio pair |
| Backup destination SDKs (`aws4fetch`, `basic-ftp`, `samba-client`) | ❌ REJECT | s3/ftp/smb clients are hand-rolled (`export/s3.js`, `export/ftp.js`, `export/smb.js`) and UAT-validated against real hardware (v3.5, owner NAS). Restore-source selection is *routing* over the existing destination registry — no new protocol code |

## Integration Points (existing seams to reuse — do not reinvent)

1. **Entra ID Mappings page**
   - Gate: `/api/config` already exposes `oidcEnabled`; nav entry follows the existing Instance-section gating pattern (`isInstanceAdmin` 403 server-side, nav-hidden client-side — Governance precedent, v3.1–v3.3).
   - Data: `group_mappings` table exists (v3.2); list/create/delete are new routes beside the existing reconcile read route (`src/core/api.js:452`, `groups.js:107`). Reuse the Phase 82 encoded guard trail; `kind: 'workspace'` rows only.
   - GUID input: canonicalization follows the `parseDomainList`/`canonicalizeDomain` funnel precedent (v3.0, `domains.js`) — hand validation, not a UUID library.
   - i18n: every new refusal/label key lands in all 5 locale catalogues (en/fr/nl/de/es) in the same commit — standing gate.

2. **OIDC_TRUST_TENANT_EMAIL docs**
   - Pure DEPLOY.md + `.env.example` edits. No library, no code. Content sourced from the shipped v1.6 SSO semantics (pinned-tenant verified-email linking) — document the claim-substitution policy and the Azure manifest steps (`groupMembershipClaims: "ApplicationGroup"`, group assignment to the Enterprise Application).

3. **Restore-source selection + availability check**
   - Destination registry (v3.5 cross-destination seam) is the routing surface: operator picks a mirror source, restore pipeline reads through the existing staged read-back.
   - Per-source availability check = the existing keyed probe functions (`probeS3` `export/s3.js:344`, `probeFtp` `export/ftp.js:590`, `probeSmb` `export/smb.js:1559`) + a trivial local check. Reuse the keyed-result shape verbatim (success/unreachable/badCreds/… — already surfaced in client toasts at `src/actions/actions.js:5297–5335`). Do NOT design a new availability protocol.

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any npm runtime dependency | Standing invariant since v1.1; v3.5 shipped 4 destination clients with zero new deps; every prior attempt to justify a dep (pg D-12, web-push D-12) required explicit owner amendment — assume refusal | node:crypto / node:net / node:tls / node:sqlite |
| Graph API integration for group names | Would need Azure consent, app-permission changes, network dependency, and a secrets surface — milestone explicitly excludes it | Manual GUID + manual label |
| A new "availability" abstraction layer | Risk of diverging from the probe contract | Thin dispatch over existing probeX functions |
| Env-parse library (dotenv, zod) | Boot-refuse strict-token parsing already exists | Existing tri-state env parse pattern |

## Installation

```bash
# Nothing. package.json stays byte-identical except the version bump to 3.6.0 at ship.
npm install   # unchanged lockfile
```

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| Node 24 `node:sqlite` | all existing tables | `group_mappings` already migrated in v3.2 — no schema change needed for CRUD |
| Vite 8 lazy chunks | 500 kB gate | Mappings page should be its own lazy chunk like Settings; add it to the chunk-gate manifest if the gate enumerates chunks |
| Playwright 1.65 | existing webServer readiness contract (`/api/health`) | new specs reuse fixtures, no config change |

## Sources

- Codebase inspection (grep + read, 2026-11-27): `groups.js`, `export/{s3,ftp,smb}.js`, `src/actions/actions.js`, `src/core/api.js`, `package.json` — HIGH
- `.planning/PROJECT.md` v3.2–v3.5 shipped records (probe contracts, picker patterns, gating precedents) — HIGH
- No external docs fetched: no new technology is introduced, so Context7 lookup is not applicable; Entra manifest steps are documentation of already-shipped behavior — n/a

---
*Stack research for: Projects Studio v3.6 — Entra ID Mappings, OIDC docs, Restore-source selection*
*Researched: 2026-11-27*
