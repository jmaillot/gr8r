---
phase: "64"
slug: "mobile-tasks-table-suite-green"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-15"
---

# Phase 64 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser DOM (mobile card stack) | User-controlled task fields (title, labels, dates) rendered into `.only-m .panel` card template | Task text → innerHTML via `esc()` |
| Build pipeline | CSS/JS bundle size and content into `index` chunk | Source assets → 500 kB chunk gate |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-64-01 | Tampering | responsive.css hide rule vs desktop flows | low | mitigate | Generic attribute-selector rule `[data-pop='cols']` scoped to the existing `@media (max-width: 900px)` tier; desktop 1280×720 unaffected — proven by unmodified projects-table/saved-views specs (15 passed) | closed |
| T-64-02 | DoS | 500 kB chunk gate (~220 B headroom, 64-01 rules) | medium | mitigate | Three terse rules only; `npm run build` chunk gate green at 498.11–498.24 kB; threshold untouched (review-verified `MAX_CHUNK_BYTES = 500000`) | closed |
| T-64-03 | Tampering | table.js card template edit vs desktop row rendering | low | mitigate | Edits confined to the `.only-m` template string (mobile-only DOM) + inert `muted` class fix; desktop `.trow` path untouched; regression net = mobile spec + 115/115 close run | closed |
| T-64-04 | Repudiation | close evidence | low | mitigate | 64-CLOSE.md records commands verbatim + summary lines (115/115, gates green) — auditable, not asserted | closed |
| T-64-05 | Tampering | D-16 fixes weakening the suite | medium | mitigate | Not triggered: close run fully green, D-16 skipped with documented precondition; zero waivers — no weakening fix entered the suite | closed |
| T-64-06 | DoS | chunk gate byte pressure from polish CSS | medium | mitigate | Inline styles moved to terse classes (net-neutral); `npm run build` gate green in Task 2 verify (498.11 kB) | closed |
| T-64-SC | Tampering | npm/pip/cargo installs | high | mitigate | Zero installs this phase (`git diff <milestone>..HEAD -- package.json package-lock.json` empty); any install attempt out of plan scope and blocked | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-15 | 7 | 7 | 0 | orchestrator (L1 grep verification, register authored at plan time, ASVS L1 short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-15
