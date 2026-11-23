---
phase: "90"
slug: "polish-verification-sweep"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-23"
---

# Phase 90 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Server HTTP routes (server.js) | The server is the authority for every new surface: download stream, verify-checksum, rotation projection, promote search — guard funnel sameOrigin → requireUser → throttle → capability → validation → lookup on each | Archive bytes (credential dumps), checksum results, retention projections, operator role data |
| Client chrome (src/pages/*.js, src/actions/*.js) | Payload-flag authority (D-89-21/D-23): the client renders payload fields verbatim, never recomputes capability or GFS math | Server-derived `location`, `keptPosition`, projection counts |
| Restore staging dir | Staged S3 temps during verify-checksum re-hash and DR fallback | Full instance archives — rm-finally lifecycle, dropped on ALL failure exits (WR-01 fix b3a2e8fd) |
| Shared test DB (gr8r-pg-test :5433) | e2e against live PG | Test-only fixtures; dropPgSchema before boot; per-file execution |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-90-01 | EoP | POST /api/auth/operator/users/:id/promote | medium | mitigate | Server boundary untouched in phase range (D-112 isInstanceAdmin gate, one tx, idempotent); client renders promote-only candidates from payload — no client authority math (D-89-21) | closed |
| T-90-02 | EoP | GET /api/backup/download (tiering bypass) | high | mitigate | Instance gate `scope?.kind === 'instance' && !isInstanceAdmin(user)` at server.js:9854 — AFTER role gate (9830), BEFORE location resolution (9858); keyed refusal `backupDownloadAdminOnly` + audited; `fileDisposition` RFC 5987 escaping (11690); filename from DB rows only | closed |
| T-90-03 | Info Disclosure | Download endpoint existence oracle | low | mitigate | Capability gate before lookup (9830 vs 9838); runId regex (9835); every refusal audited `backup_download_refused:<code>`; identical `restoreArchiveMissing` 404 for missing-row and gone-archive | closed |
| T-90-04 | DoS | Verify-checksum / download re-hash cost | medium | mitigate | D-89-22 operator-keyed throttles BEFORE capability gates: `verifychecksum` (9921 vs 9924), `backupdownload` (9827 vs 9830), 10/15min, refused attempt consumes a try | closed |
| T-90-05 | DoS | Rotation projection cost | medium | mitigate | `rotationproj` throttle (9245) BEFORE `backupManageRequired` (9248) BEFORE taskId regex + lookup (9251–9253) | closed |
| T-90-06 | Tampering | keptPosition / projection rendering | low | mitigate | All GFS math server-side per request (9255–9287, reuses `assignGfsBuckets`); client renders payload verbatim (backup.js:167/173); nothing persisted (D-90-16); pinned by backup-history-client.test.mjs:276–278 | closed |
| T-90-07 | Info Disclosure | Cross-suite contamination on shared pg-test DB | low | mitigate | `dropPgSchema(POSTGRES_TEST_URL)` before boot (e2e l.111); env-gated clean skip (l.57); per-file-only execution documented (ll.29–35) — never --test-concurrency=2 (89-UAT lesson) | closed |
| T-90-08 | XSS | Candidate-search echo + roster names/emails | low | mitigate | `esc()` text nodes only — query echo (governance.js:205/207), names + emails (164/195); pinned by governance-console.test.mjs:138–156 | closed |
| T-90-SC | Tampering | npm installs (×3 plan rows, identical) | high | mitigate | Zero new npm dependencies: `git diff 84331f6f..08799b39 -- package.json package-lock.json` empty; no install tasks in any plan; all SUMMARYs declare `tech-stack.added: []` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · accept (documented risk) · transfer (third-party)*

Post-plan additions (WR-01 `b3a2e8fd`, WR-02 `da20260e`) are fixes to surfaces already covered by T-90-02/T-90-05 — no new attack surface; verified by the auditor.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

*Accepted risks do not resurface in future audit runs.*

*If none: "No accepted risks."*

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-23 | 12 | 12 | 0 | gsd-security-auditor (ASVS L1, block_on: high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-23
