---
phase: "80"
slug: "group-mapping-core-parser-resolver-overage-detection"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-20"
---

# Phase 80 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Entra ID token → resolver (`groups.js`) | Claim values from a verified token are still attacker-influencable in shape (non-array, overage pointers); resolver must fail closed | Groups claim / `_claim_names` / `_claim_sources` |
| Operator paste → GUID key | Paste variants could create duplicate/dead keys without canonicalization before the unique index | Group GUID |
| HTTP client → save route (`server.js` POST `/api/governance/group-mappings`) | Unauthenticated/authenticated non-operator input crosses into a config-writing endpoint | Request body: GUID, workspaceId, role, label |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-80-01 | Tampering | resolveGroupsClaim / overage detection (`groups.js`) | critical | mitigate | Four-outcome fail-closed detector — overage/missing never resolve to `[]`; verified at `groups.js:73-91` (`state: 'unmapped', reason: 'overage'` branches, fail-closed default) | closed |
| T-80-02 | Tampering | GUID canonicalization → unique index (`groups.js`) | medium | mitigate | `canonicalizeGuid` (lowercase, hyphenated, brace-stripped) at `groups.js:34`; applied before storage/comparison; unique `group_mappings_pair` index (`db-adapter.mjs:627`) as backstop | closed |
| T-80-03 | Elevation of Privilege | mapping role tokens (`groups.js`) | high | mitigate | Strict 3-token allow-list: `ROLE_TOKENS = {'owner','admin','member'}` at `groups.js:62` with `roleTokenRefusal`; pinned by `test/groups-core.test.mjs:92` | closed |
| T-80-04 | Information Disclosure | save route ordering (`server.js:7133-7143`) | high | mitigate | `sameOrigin` → `requireUser` → `isInstanceAdmin` all BEFORE any target lookup (annotated `// T-80-04`); non-operators get an undifferentiated 403 `operatorOnly`, no workspace-ID oracle | closed |
| T-80-05 | Tampering | request body → group_mappings (`server.js:7145-7158`) | high | mitigate | Allow-list validation completes before any write (annotated `// T-80-05`): `guidRefusal` → canonicalized GUID, `roleTokenRefusal`, DB workspace existence, `(guid, workspace)` duplicate pre-check; unique index as backstop | closed |
| T-80-06 | Elevation of Privilege | role field (save route + table CHECK) | high | mitigate | `roleTokenRefusal` refuses non-3-token roles at save; table CHECK is the locked 3-token set (`db-adapter.mjs:389`, `role in ('owner','admin','member')`); a 'viewer' mapping refuses at save — pinned by `test/groups-core.test.mjs:92` | closed |
| T-80-07 | Tampering | label field (`server.js:7160`) | low | accept | Stored as opaque display-only text (trimmed, 200-char cap), never a match key, not rendered until Phase 83 (escaping happens there). Acceptance rationale: no sink exists in this phase | closed (accepted) |
| T-80-SC | Tampering | npm/pip/cargo installs | high | mitigate | Zero new dependencies this phase — no installs occur; `test/dependencies.test.mjs` pins the dep set and Dockerfile COPY list | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-80-01 | T-80-07 | Label is opaque display-only text with no render sink in this phase; XSS escaping deferred to Phase 83 where the sink is introduced | Orchestrator (audit run) | 2026-11-20 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 8 | 8 | 0 | Orchestrator (L1 grep-depth, ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-20
