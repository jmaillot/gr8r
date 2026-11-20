---
phase: "83"
slug: "governance-workspace-rename-slug-edit"
status: secured
threats_open: 0
asvs_level: 1
created: "2026-11-20"
---

# Phase 83 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → operator routes | Unauthenticated/authenticated-but-non-operator requests hit the rename and dead-mappings endpoints | session cookies, workspace ids, name/slug bodies |
| carried DB values → DOM | group_mappings.label, workspace names/slugs, trail action strings interpolate into governance markup | operator-carried opaque strings (XSS-carry class) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-83-01 | Information Disclosure | POST .../rename, GET .../dead-mappings | high | mitigate | `isInstanceAdmin` gate BEFORE target lookup (server.js:7166) — real and fake ids answer identical 403 operatorOnly; pinned by governance-rename suite | closed |
| T-83-02 | Tampering (XSS) | group_mappings.label / trail action carried to client | high | mitigate | server returns raw values unmodified; client escapes at first render (T-83-07) | closed |
| T-83-03 | Spoofing (CSRF) | rename POST | high | mitigate | `sameOrigin` is the FIRST statement before any body read or throttle (server.js:7156); pinned by cross-origin test | closed |
| T-83-04 | Evasion | slug squatting into reserved paths | medium | mitigate | sanitizeSlug enforces SLUG_RE + RESERVED_SLUGS verbatim (server.js:7177); reserved-word refusal pinned ('api', 'login'); UAT-confirmed keyed toast | closed |
| T-83-05 | DoS | rename probing / throttle bypass | medium | mitigate | operator-keyed `tooMany('op-ws-rename\|<id>', 5, 15min)` (server.js:7161) — never per-IP | closed |
| T-83-06 | Information Disclosure | dead-mappings trail exposing internal guids | low | accept | payload is operator-gated and read-only; guids already operator-visible | closed (accepted) |
| T-83-07 | Tampering (XSS) | dead-card orphan label + trail strings, modal fields | high | mitigate | esc() at first render on every interpolated card value and modal field (governance.js:176–198, actions.js:4740s); pinned by governance-client source assertions | closed |
| T-83-08 | Tampering (XSS) | confirm dialog body with old slug | medium | mitigate | `<b>${esc(ws.origSlug)}</b>` in confirmRenameBody (actions.js:4752, actions.js:4665 archive precedent) | closed |
| T-83-09 | Repudiation | silent rename | low | accept | logInfo (governance) line with old→new slug covers the audit need per D-06; no audit_log row | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-83-06 | T-83-06 | Operator-gated read-only endpoint; internal guids are already operator-visible in the mapping surface | planner (plan-time disposition) | 2026-11-20 |
| AR-83-09 | T-83-09 | logInfo governance line satisfies the D-06 audit decision; no audit_log row ruled | planner (plan-time disposition) | 2026-11-20 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|-----------|---------------|--------|------|--------|
| 2026-11-20 | 9 | 9 | 0 | orchestrator L1 grep verification (ASVS L1 short-circuit: threats_open 0 at plan-time register + summaries compliant) |

Verification notes (post-fix re-check): T-83-01/03/05 re-read in server.js:7153–7172 guard order verbatim; T-83-07 esc() re-confirmed on card + modal after WR-02 fix (esc(q) added, governance.js:101/161); T-83-08 esc(ws.origSlug) confirmed in the D-03 confirm fork after WR-01 fix; T-83-02/WR-03 trail LIKE hardened to `escape '\'` (WR-83-03 fix commit ecf6c7b1) — all verified against the post-fix tree. L1 verdict: no implementation gaps.
