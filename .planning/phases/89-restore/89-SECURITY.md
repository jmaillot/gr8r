---
phase: "89"
slug: "restore"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-23"
---

# Phase 89 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| archive file → export/restore.js reader | untrusted ustar+gzip bytes (operator-supplied or S3-restored archive) cross into the extraction/import engine | table rows, file blobs, logos, manifest metadata — full attacker-controlled surface |
| client → /api/backup/restore/* | untrusted requests against capability-gated restore/preview/overwrite/DR routes | run ids, confirm phrases, archive filenames |
| archive payload → client DOM | payload-derived strings (archive names, skip reports, error text) cross into the restore section rendering | display strings only (render-only doctrine) |
| archive rows → live DB | archive-supplied memberships, roles, doc member arrays, user_id-bearing rows cross into selective-restore inserts | DATA tables only; instance_roles never touched by selective restore |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-89-01 | Tampering | export/restore.js extraction loop (archived filenames) | high | mitigate | Entry-name allow-list BEFORE any extraction (manifest.json / frozen-TABLES ndjson / files/<[A-Za-z0-9_-]{1,64}> / logos/<safe-name>); contained() realpath discipline at every write root; pinned by test/restore-security.test.mjs traversal vectors (D-89-33 family 3) | closed |
| T-89-02 | Denial of Service | export/restore.js size-field parsing (zip-bomb) | high | mitigate | Octal size validated against the writer's own 0o77777777777 bound before any data read; entries streamed past, never accumulated (prohibition P3); pinned by the oversized-header vector | closed |
| T-89-03 | Tampering | export/restore.js entry-name → table-statement gate (manifest/SQL injection) | high | mitigate | Table names must match the frozen TABLES allow-list (export/restore.js:83 ALLOWED_TABLE_NAMES, imported from export/backup.js) before any per-table statement; chksum sum-check on every header; sha-chain fail-closed; pinned by the unknown-table + bad-chksum vectors (D-89-33 family 2 pre-gate) | closed |
| T-89-04 | Tampering | restore_lock CAS + backup trigger/scheduler check sites | high | mitigate | Single-row CAS (WHERE claimed_by IS NULL) is the atomicity point on both engines; manual trigger (server.js:8716+) and scheduler pass (3505+) check the lock BEFORE starting work; stale claims released at boot; pinned by test/restore-routes.test.mjs + test/backup-scheduler.test.mjs (D-89-1/D-89-31) | closed |
| T-89-05 | Elevation of Privilege | /api/backup/restore/backups + /preview gates | high | mitigate | Verbatim guard chain; hasInstanceRole(user.id, CAP.RESTORE_USE) (server.js:8649, :9154) per D-89-21; audited restore_refused:* funnel; runId regex gate before row reads (no 404-vs-400 oracle); pinned in test/restore-preview.test.mjs | closed |
| T-89-06 | Denial of Service | preview streaming + hashing cost | medium | mitigate | Operator-keyed throttle tooMany(restorepreview\|<id>, 10, 15min) consuming a try (D-89-22); zip-bomb bound enforced by the 89-01 reader (T-89-02) | closed |
| T-89-07 | Information Disclosure | S3 error text / sha mismatch messages | low | mitigate | Error text rides the sliceError(300) discipline in the seam (export/s3.js:57-60); no S3 config or secrets enter payloads; error strings esc()'d client-side in plan 06 | closed |
| T-89-08 | Elevation of Privilege | remap planner + doc-splice executor (archive-supplied memberships/roles/doc member arrays) | high | mitigate | Selective restore inserts DATA tables only (D-89-7 — operational rows skipped + reported); doc splices pass post-normalizeDoc whitelisted shapes only (server.js:1261-1318 discipline); membership is restorer-only (D-89-9); authority always from live hasInstanceRole at trigger time — archive contents never grant it (D-89-21/D-33-10); pinned by test/restore-import.test.mjs negatives | closed |
| T-89-09 | Tampering | in-tx insert statements built from archive-supplied names/ids | high | mitigate | Table names gated by the frozen TABLES allow-list (T-89-03) before any per-table statement; every value parameterized; id-format gates on all archive ids entering SQL; pinned by the injection vectors in test/restore-security.test.mjs | closed |
| T-89-10 | Tampering | user_id-bearing row inserts (dangling FK corruption) | high | mitigate | Validate-and-skip-and-report against live users before any insert; user ids never remapped (prohibition P4 / planner flag 3); a crafted row referencing a non-live user can never resurrect an account or wedge the tx; pinned by the dangling-FK negative test | closed |
| T-89-11 | Elevation of Privilege | DR instance_roles rebuild (crafted-archive admin grant) | critical | mitigate | DR gate = CAP.INSTANCE_ROLES_MANAGE (server.js:9330, Super-Admin short-circuit only, roles.js D-12) + server-side RESTORE-INSTANCE confirm phrase re-validation (server.js:9339 — client checkbox never trusted) + audit trail; rebuilt rows validated against live users — skip+report (prohibition P9); selective restore never touches instance_roles at all (D-89-7/8 split); pinned in test/restore-instance.test.mjs (D-89-33 family 4) | closed |
| T-89-12 | Tampering / Repudiation | overwrite + DR as destructive vehicles | high | mitigate | Type-to-confirm re-validated server-side (D-89-27/P8); automatic pre_restore snapshot BEFORE any mutation (D-89-5/P7); one tx per unit (D-89-3); full audit trail + operator-keyed throttle (D-89-22); repair net proven by the mid-tx failure test; pinned in test/restore-overwrite.test.mjs | closed |
| T-89-13 | Tampering | staged swap write roots (FILES_DIR/LOGOS_DIR/DATA_DIR) | high | mitigate | contained() realpath discipline at every swap root (89-01 machinery reused); blob staging under DATA_DIR-level temp EXDEV-safe; swap only after staging verification; pinned by the extraction/containment vectors carried into the overwrite suite | closed |
| T-89-14 | Denial of Service | session revocation ordering (DR) | high | mitigate | delete from sessions executes strictly POST-commit with the run task completed first — a pre-commit revocation can never strand operators against a rolled-back restore; negative test pins the ordering (D-89-25) | closed |
| T-89-15 | Tampering | restore section DOM rendering (payload-derived strings) | high | mitigate | Every payload string field renders through esc() verbatim — render-only doctrine; no raw interpolation of payload fields into HTML; pinned by the esc() source assertions in test/restore-client.test.mjs | closed |
| T-89-16 | Elevation of Privilege | client authority chrome (restore list visibility, overwrite/DR buttons) | high | mitigate | Payload-flag chrome ONLY (canRestore / overwrite-capable / Super-Admin flags from the server payload, D-89-21/D-23) — never recomputed client-side from roles; grep-count assertion pins zero role checks in the restore section | closed |
| T-89-SC | Tampering | npm/pip/cargo installs (package-legitimacy gate) | high | mitigate | N/A by design: zero npm dependencies (D-33-11) — no install tasks exist in any plan of this phase; verified across 89-01..89-06 | closed (n/a) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-89-1 | T-89-07 | S3 error text truncation relies on the existing sliceError(300) seam discipline rather than a restore-specific sanitizer; message content is operator-facing only, esc()'d at render, and carries no credentials. | orchestrator (secure-phase, ASVS L1) | 2026-11-23 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-23 | 17 | 17 | 0 | orchestrator L1 grep classification (plan-time register, short-circuit rule: threats_open 0 + register_authored_at_plan_time true + ASVS L1 — no auditor spawn required) |

Classification evidence (L1): frozen allow-list (export/restore.js:83/:123-124), zip-bomb size bound + streamed-only reading (restore.js header comments + test pins), capability gates CAP.RESTORE_USE (server.js:8649/:9117/:9154) and CAP.INSTANCE_ROLES_MANAGE (server.js:9330), RESTORE-INSTANCE confirm phrase re-validated server-side (server.js:9339), sha-chain fail-closed (restore.js validation-order block), esc() render-only + payload-flag chrome pinned by passing test/restore-client.test.mjs (107-test battery, 106 pass, 0 fail). Independent corroboration: 89-REVIEW.md (5 findings fixed, 0 security-class open) and 89-VERIFICATION.md (gaps_remaining: []).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-23
