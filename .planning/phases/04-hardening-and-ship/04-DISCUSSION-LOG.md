# Phase 4: Hardening and ship - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-21
**Phase:** 4-Hardening and ship
**Areas discussed:** Test suite, Two-tenant UAT, Demo workspace switch, Migration proof and release

---

## Test suite

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Regression of the 3 phases | Move the existing privacy matrix under `node:test` and add tenancy + membership lifecycle coverage. Keep `npm run test:privacy` as an alias. | ✓ |
| Privacy only | Wrap only `verify-private-projects.mjs`, without broader phase 1/2 coverage. | |
| Broad API | Also add validation, error, revision-conflict and permission edge cases beyond shipped flows. | |

**User's choice:** Regression of the 3 phases (recommended).
**Notes:** `npm test` becomes the suite entry point; the phase 3 privacy command remains valid.

---

## Two-tenant UAT

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Playwright suite in CI | Add Playwright Test, Chromium only, owner/member scenarios in two workspaces, CI installs the browser. | ✓ |
| Playwright local only | Commit the suite but do not run it in CI to avoid browser installation cost. | |
| Documented manual UAT | No Playwright dependency; reproducible checklist executed by hand before release. | |

**User's choice:** Playwright suite in CI (recommended).
**Notes:** Must use two genuinely separate workspaces and prove private-project invisibility for a non-member.

---

## Demo workspace switch

| Option | Description | Selected |
| ------ | ----------- | -------- |
| One demo workspace | Remove `data.workspaces` and the switch/create menu; demo keeps a single workspace and no workspace creation. | ✓ |
| Remove all demo creation | As above, and demo onboarding only picks a project template in the single workspace. | |
| Disabled selector | Keep the selector visible with one entry and an explanation that multiple workspaces need the server. | |

**User's choice:** One demo workspace (recommended).
**Notes:** Server-mode switcher, creation and settings stay unchanged.

---

## Migration proof and release

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Legacy fixture + 1.1.0 | `node:test` builds a pre-tenancy DB, runs the migration, checks backup/slug/memberships; bump 1.1.0 and add CHANGELOG.md. | ✓ |
| Manual dry-run + 1.1.0 | Documented procedure against a copy of a real DB, plus 1.1.0 and release notes, no automated fixture. | |
| Legacy fixture only | Automate migration but leave version and release notes to a manual post-merge step. | |

**User's choice:** Legacy fixture + 1.1.0 (recommended).
**Notes:** The migration test must assert the backup before asserting rewritten rows, and a second start must be idempotent.

---

## Agent's Discretion

- Exact test-file split and helper naming.
- Whether the privacy matrix keeps its standalone script wrapper.
- Playwright project layout and whether e2e runs in the same CI job or a separate required job.
- CHANGELOG wording and whether a GitHub release is created after the push.

## Deferred Ideas

- Real billing/plan enforcement, per-user settings isolation, file storage.
- A GitHub release/tag can follow the merge and is not a phase deliverable.
