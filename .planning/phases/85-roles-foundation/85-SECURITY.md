---
phase: "85"
slug: "roles-foundation"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-21"
---

# Phase 85 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → /api/auth/operator/instance-roles | untrusted grant/revoke requests cross into the authorization model | role assignments, user ids |
| client → /api/backup/* | untrusted requests against role-gated stub endpoints | capability flags, task list (stub) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-85-01 | Elevation of Privilege | POST /api/auth/operator/instance-roles | high | mitigate | roles.js:65-73 `capabilitiesFor` D-12 short-circuit before row consideration; server.js:7660 operator gate, :7669-7671 D-05 `instanceRoleAdminImplicit` refusal BEFORE duplicate check; pinned test/roles-core.test.mjs:19-72 (D-35a/b) | closed |
| T-85-02 | Information Disclosure | POST/DELETE instance-roles (existence oracle) | medium | mitigate | server.js:7660 (POST) / :7715 (DELETE) — `isInstanceAdmin` gate BEFORE any target/row lookup; test/instance-roles-api.test.mjs:72 pins identical 403 for valid AND invalid bodies | closed |
| T-85-03 | Tampering (CSRF) | all new mutation routes | high | mitigate | `sameOrigin(req)` FIRST on all five new routes (server.js:7653, :7707, :7753, :7769, :7612) — before requireUser, throttle, body read; cross-origin probe pinned test/instance-roles-api.test.mjs:52-65 | closed |
| T-85-04 | Denial of Service | grant/revoke write routes | medium | mitigate | operator-keyed `tooMany` (5/15min) on grant (:7658) and revoke (:7711), incrementing BEFORE the admin gate — 403 refusals consume a try; GET list exempt (read-only) | closed |
| T-85-05 | Repudiation | grant/revoke mutations | medium | mitigate | grant insert + audit row in ONE db.tx (server.js:7678-7700); revoke delete + audit in ONE db.tx (:7723-7742); actor/target snapshot columns; forced-audit-failure rollback pinned both directions (test/instance-roles-api.test.mjs:328-393) | closed |
| T-85-06 | Elevation of Privilege (client trust) | /api/backup/* stubs, payload flags | medium | mitigate | GET /api/backup/tasks re-checks via hasInstanceRole (server.js:7758-7764); POST enforces BACKUP_MANAGE (:7775); payload flags consumed render-only in backup.js:52-63 | closed |
| T-85-07 | Elevation of Privilege (client trust) | nav entry, page actions, api.js getters | medium | mitigate | layout.js:181-183 UX-gate doctrine comment + nav gated on payload flags; api.js:164-168 getters read payload verbatim; every server endpoint re-checks (T-85-06) | closed |
| T-85-08 | Tampering (XSS via payload strings) | governance.js tab rows, activity list, backup page | medium | mitigate | governance.js rolesCard rows esc()d (197-203), activity trail esc()d (224), picker rows esc()d (242); backup.js esc()/text-node discipline declared and followed; no raw payload interpolation | closed |
| T-85-09 | Information Disclosure (role vocab leakage) | role labels | low | accept | role names surface only via i18n labels (D-15); no DB role catalog; grant pool reuses the existing operator user list — see Accepted Risks Log | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-85-1 | T-85-09 | Role names surface only via i18n labels (D-15) — no DB role catalog, no new enumeration surface; the grant pool reuses the existing operator user list (server.js:7608-7650 + governance picker), so no role vocabulary is discoverable beyond what the operator UI already exposes. | user (UAT session) | 2026-11-21 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-21 | 9 | 9 | 0 | gsd-security-auditor (ASVS L1, verified at L2 boundary-placement depth) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-21
