---
phase: "40"
slug: "digest-subject-task-lines"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-05"
---

# Phase 40 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| user-input → SMTP Subject header | Workspace/project/task names cross into the Subject via `encodeWord` — hardened C0/DEL strip + RFC 2047 §6.2 folding (T-40-01/05) | User-controlled workspace names |
| recipient → project-name visibility | Invisible/private project names must never reach a recipient's email — single `memberCanReadProject` funnel server-side (T-40-02/06) | Private project metadata |
| user-input → email HTML body | Project/task names cross into the HTML digest body — `escapeHtml` after interpolation (T-40-03/07) | User-controlled task/project names |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-40-01 | Tampering | `encodeWord` (mailer.js:57) — all four Subject call sites | high | mitigate | C0/DEL strip `[\x00-\x1F\x7F]` before encode decision + hostile CRLF-injection test (test/subject-encode.test.mjs, 10/10) | closed |
| T-40-02 | Information Disclosure | digest task lines (server.js:1562) | high | mitigate | Names resolved only AFTER `memberCanReadProject` funnel for this recipient; no-leak test T-40-06 in test/digest.test.mjs | closed |
| T-40-03 | Tampering | `buildDigestMessage` HTML task lines (mailer.js:608) | medium | mitigate | `escapeHtml` applied AFTER interpolation to both href and label; text part never escaped | closed |
| T-40-04 | Tampering | `encodeWord` base64 path — FR subjects | low | mitigate | RFC 2047 `=?UTF-8?B?` encoding pinned by D-09 FR-accent round-trip test | closed |
| T-40-05 | Tampering | Subject header via ws name (subjectWs render) | high | mitigate | subjectWs output routed through the same single `encodeWord` call; hostile-name tests pin it | closed |
| T-40-06 | Information Disclosure | server.js digest send mapping → task lines | high | mitigate | `memberCanReadProject` funnel before name resolution; no-leak test pins absence of invisible project names in raw payload | closed |
| T-40-07 | Tampering | mailer.js task-line HTML rendering | medium | mitigate | `escapeHtml` after interpolation (T-36-01 rule); truncate normalizes control chars | closed |
| T-40-08 | Tampering | FR subject rendering (subjectWs) | low | mitigate | subjectWs flows through `encodeWord` (RFC 2047 base64); accent round-trip pinned by D-09 | closed |
| T-40-SC | Tampering | npm installs | high | accept | Zero new packages this phase (Node stdlib only) — no supply-chain surface introduced | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| T-40-SC | T-40-SC | Zero new npm packages this phase — no supply-chain surface introduced | plan-time register (both PLANs) | 2026-11-05 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-05 | 9 | 9 | 0 | execute-phase orchestrator (L1 grep-depth, ASVS 1, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-05
