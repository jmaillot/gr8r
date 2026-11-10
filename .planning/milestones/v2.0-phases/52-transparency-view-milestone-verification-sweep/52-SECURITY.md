---
phase: "52"
slug: "transparency-view-milestone-verification-sweep"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-09"
---

# Phase 52 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| admin browser → GET /api/workspaces/:slug/members/:memberId/visibility | Requester role + target member id are untrusted inputs; response exposes private project names of the workspace | Role + target id in; readable-project list + coarse reason codes out |
| server response → members.js renderer | Server-provided project names/reason codes are rendered as HTML in the members table | Project names + reason codes, escaped before interpolation |
| docs → readers | Documentation describes security posture; stale/incorrect docs are an operational security risk | file:line citations vs live server.js |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-52-01 | Information Disclosure | GET /members/:memberId/visibility — existence oracle via probing | medium | mitigate | Unknown target (`!target`, server.js:4982-4984) and known-but-absent (`!row`) share the same keyed `fail(res, 404, 'notAMember', ...)` body — no existence oracle; pinned by test/transparency.test.mjs:104 | closed |
| T-52-02 | Elevation of Privilege | endpoint called by non-admin (member/viewer/guest) | high | mitigate | Server-side `requireWorkspace(..., 'admin')` gate before any logic (server.js:4979; 403 `adminOnly` at :3234-3237) — the real control (D-52-4); test/transparency.test.mjs:90-93 pins 403 for every non-admin role; client gating is UX only. Live-verified in UAT test 7 (403 for real + nonexistent targets) | closed |
| T-52-03 | Information Disclosure | reason payload leaking team rosters/access lists | medium | mitigate | `projectAccessReason` (server.js:828-835) returns coarse codes only (everyone/lead/member/team, null); route payload `{id, name, reason}` exactly — no rosters; pinned by test/transparency.test.mjs:66-67 | closed |
| T-52-04 | Tampering | rendering of server-provided project names in members.js | low | mitigate | `esc(p.name \|\| p.id)` (members.js:84) and `esc(String(p.reason))` for unknown codes (:83) before HTML interpolation | closed |
| T-52-05 | Information Disclosure | client-side expansion control shown to non-admins | low | mitigate | Expander + detail row gated on `isAdmin && m.userId` (members.js:71,90); the T-52-02 server gate is the actual control. Implementation uses the page's `isAdmin` variable rather than the plan-named `isMemberAdmin()` — same boundary, informational deviation | closed |
| T-52-06 | Repudiation | docs describing a model that no longer matches the code | medium | mitigate | All 18 file:line citations (7 + 11) in docs/WorkspacePermissions.md and docs/ProjectPermissions.md re-verified against the live tree at doc time and re-spot-checked during this audit (requireWorkspace 3225-3240 ✓, route 4977-5005 ✓, memberCanReadProject 813-818 ✓, projectAccessReason 828-836 ✓) | closed |
| T-52-SC | Tampering | npm/pip/cargo installs | high | mitigate | Zero new runtime dependencies (package.json: `pg` only); `node --test test/dependencies.test.mjs test/transparency.test.mjs` → 13 pass / 0 fail, run live during the audit | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-09 | 7 | 7 | 0 | gsd-security-auditor (ASVS L1, register authored at plan time) |

**Unregistered flags:** none — no `## Threat Flags` section in any SUMMARY (no new attack surface declared during implementation).

**Audit notes (informational, non-blocking):**
- Endpoint `?? 'member'` default (server.js:4997) is consistent with the funnel — a project listed by `memberCanReadProject` is by definition readable, so the label fallback cannot leak.
- Plan 02's `'Team: {name}'` key was dropped per the endpoint's coarse-code contract (T-52-03) — documented deviation in 52-02-SUMMARY.md.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-09
