---
phase: "84"
slug: "backlog-polish-ship"
status: secured
threats_open: 0
asvs_level: 1
created: "2026-11-20"
---

# Phase 84 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| e2e spec edits → CI gate | Repaired specs could mask real regressions behind softened assertions | test assertions |
| picked team names/ids → DOM & POST body | Picker renders workspace team names; picked ids ride the existing invite/member-edit POST bodies | operator/owner-carried strings, existing ids |
| rename UPDATE → workspaces table | The IN-01 change touches a parameterized write on an operator-gated route | updated_at integer stamp |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-84-01 | Tampering | e2e spec edits masking real regressions | medium | mitigate | D-05 repair-in-place verified: `git show 86df8df0` touches only the 2 navigation steps, 0 assertion removals; D-14 trace-first gate honored (classification documented in 84-01-SUMMARY); D-06 satisfied with 155/155 × 3 consecutive green runs | closed |
| T-84-02 | Tampering (XSS) | XSS via interpolated team names in picker markup | medium | mitigate | esc() at every interpolation in src/features/team-pick.js (3 sites verified by grep); candidate list, draft chips, and option buttons all escape exactly like the assignee-pick.js precedent; pinned by team-pick-client source pins | closed |
| T-84-03 | Information Disclosure | Existence oracle via picker data | low | accept | Picker lists come from members/teams the calling user can already read; no new endpoint added (grep: zero new route registrations this phase) | closed (accepted) |
| T-84-04 | Tampering | Mass-assignment via picked team ids | low | accept | POST body shape unchanged verbatim (`[...new Set(S.ui.inviteTeams \|\| [])]` at actions.js:2302 and :2426); server-side team-id revalidation unchanged (existing err.teamsRequired/unknownTeam codes) | closed (accepted) |
| T-84-05 | Tampering | workspace rename UPDATE altered | low | mitigate | Verified post-fix (server.js:7183): additive parameterized write `updated_at = ?` with now(); route still behind isInstanceAdmin + operator-keyed throttle + sameOrigin-first; no new inputs accepted | closed |
| T-84-06 | Repudiation | rename no longer leaving timestamp trace | low | mitigate | IN-01 IS the fix: updated_at stamped (GV-01 unit pin asserts integer ≥ pre-rename value); D-06 logInfo governance line preserved verbatim; no audit_log row (pinned, per D-82 decisions) | closed |
| T-84-07 | Repudiation | inaccurate release changelog misstating shipped behavior | low | mitigate | Backfill sourced from .planning/milestones/v3.0-*/v3.1-* summaries, not memory; owner ratified entry scope/dates at the blocking checkpoint; ship gate (145/145 e2e green, zero waivers) verified before the 3.2.0 entry landed | closed |
| T-84-SC | Tampering | npm/pip/cargo installs | high | mitigate | Zero new dependencies: test/dependencies.test.mjs pins runtime deps to exactly {@office-kit/xlsx, pg, web-push} — green post-ship (2/2); no install tasks in any plan | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-84-03 | T-84-03 | Picker surfaces only data the user already has read access to; no new endpoint | planner (plan-time disposition) | 2026-11-20 |
| AR-84-04 | T-84-04 | POST shapes unchanged; server-side revalidation is the standing control | planner (plan-time disposition) | 2026-11-20 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|-----------|---------------|--------|------|--------|
| 2026-11-20 | 8 (7 unique + SC) | 8 | 0 | orchestrator L1 grep verification (ASVS L1 short-circuit: plan-time register + summaries compliant + 0 open) |

Verification notes: T-84-01 proven by commit diff (`86df8df0` — 0 assertion deletions); T-84-02 by esc() grep on team-pick.js; T-84-04 by verbatim POST-shape reads at actions.js:2302/:2426; T-84-05/06 by post-fix read of server.js:7183–7186 (guards unchanged, logInfo preserved); T-84-SC by dependencies.test.mjs 2/2 green post-ship. All verified against the shipped tree at 4cf10d42.
