---
phase: 23-email-deep-links-creator-watching
secured: 2026-10-31T13:10:00+01:00
asvs_level: 1
register_authored_at_plan_time: true
threats_total: 8
threats_closed: 8
threats_open: 0
block_on: high
---

# Phase 23: Email Deep Links & Creator Watching — Security Review

**State:** B (run from artifacts — no prior SECURITY.md existed; PLAN threat registers authored at plan time)
**Method:** L1 grep-depth verification of each register threat's mitigation against the implementation (ASVS L1 short-circuit: plan-time register, 0 open threats).

## Threat Register Verification

| Threat ID | Category | Component | Severity | Disposition | Status | Evidence |
|-----------|----------|-----------|----------|-------------|--------|----------|
| T-23-01 | Spoofing | queueNotifEmails URL building | high | mitigate | CLOSED | server.js:730 builds emailed links from `APP_URL` unconditionally (`${APP_URL}/w/${wsRow.slug}/task/${encodeURIComponent(task.key)}`); boot guard at server.js (MAILER.enabled && !APP_URL → exit); pinned by test/notif-email-link.test.mjs static case (17/17 pass) |
| T-23-02 | Information Disclosure | applyDeepLink task resolution | medium | mitigate | CLOSED | src/main.js:147 — unknown key / permission-hidden task → identical not-found handling over workspace view, no existence oracle; asserted in e2e/deep-link.spec.mjs (14/14, incl. unknown-id no-oracle cases) |
| T-23-03 | Tampering | finishLogin ?next= → location.assign | high | mitigate | CLOSED | server.js:2921 — `next.startsWith('/') && !next.startsWith('//') && !next.includes('\\\\') && !next.includes('://')` path-only validation; carry built only from `location.pathname` (src/main.js:292), never client echo (test/next-carry.test.mjs asserts no `get('next')` in client) |
| T-23-04 | Spoofing | taskWatchers → notifyMembers self-notification | low | mitigate | CLOSED | Double exclusion verified: client `x !== D().me` in taskWatchers + server.js:715 `if (n.by === n.to) continue`; test/creator-watcher.test.mjs (11 asserts) covers creator-as-commenter zero self-rows |
| T-23-05 | Tampering | popstate → view resolution | low | mitigate | CLOSED | popstate rides the single applyDeepLink resolution path (src/main.js:124-147 comments + code) — same canSee checks, opt.back threads through go(), no new parsing surface; e2e/back-forward.spec.mjs 10/10 |
| T-23-06 | Information Disclosure | queueNotifEmails byline/recipient resolution | low | accept | CLOSED | Accepted risk documented: authority rows are workspace-scoped (memberships filtered by workspace_id, server.js:709-713) — author name revealed only to co-members, matching existing doc-profile behavior. No cross-workspace surface. |
| T-23-07 | Information Disclosure | applyDeepLink team branch (unknown team id) | low | mitigate | CLOSED | src/main.js:181-184 — unknown team id → workspace home, NO toast, NO 404, id never echoed into DOM or URL rewrite; e2e/deep-link.spec.mjs unknown-id no-oracle cases pass |
| T-23-SC | Tampering | npm/pip/cargo installs | high | mitigate | CLOSED | Not applicable: zero runtime dependencies (test/dependencies.test.mjs enforces); no package installs in any phase-23 plan |

## Accepted Risks

- **T-23-06** (low): Outbound email bylines expose account-backed member names to workspace co-members. Accepted — identical exposure surface to the pre-existing doc-profile roster; authority query is workspace-scoped (`where m.workspace_id = ?` on `wsRow.id`, server.js:709-713).

## Code Review Corroboration

Gap-closure review (2026-10-31, 23-REVIEW.md): 0 critical, 0 warning. Explicitly verified clean: parameterized workspace-scoped authority query (server.js:709-713), self-notify/pref gates intact, no new injection surface, team deep-link chain coherent, no-existence-oracle fallback correct.

## Verdict

**SECURED** — 8/8 threats closed (7 mitigated with verified evidence, 1 accepted and documented). No threats at or above the `high` block threshold remain open.
