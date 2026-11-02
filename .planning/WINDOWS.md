---
schema_version: 1
open_count: 6
waived_count: 0
fixed_count: 0
total_count: 6
last_updated: 2026-11-01T21:04:05.746Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 07 | unmet-truth | src/actions/actions.js | 2180 | The preference-saved toast at the language switch renders in English for ~1.5s (t() resolves before the async catalogue load); phase 8 replaces the wiring | open |  | 2026-10-23T12:23:41.426Z |  |
| 2 | 12 | unrun-verify | .planning/phases/12-real-file-uploads-and-previews/12-UAT.md |  | Manual Firefox re-run of 12-UAT.md tests 1-2 deferred to the verifier (Chromium e2e cannot exercise Firefox's built-in PDF viewer; geometry + redirect round trip pinned in Chromium) | open |  | 2026-10-25T09:39:48.779Z |  |
| 3 | 13 | deviation | .planning/phases/13-investigation-invariant-pinning/13-01-SUMMARY.md |  | Pre-existing v1.2 test failure (test/i18n-prefs.test.mjs:246 '## Phase 6' ROADMAP assertion) predates Phase 13; not caused by this docs-only plan, documented in SUMMARY Issues Encountered | open |  | 2026-10-26T10:55:09.610Z |  |
| 4 | 13 | unmet-truth | .planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md |  | D-04 landing-phase contradiction + D-13 copy-scope ambiguity (VERIFICATION gaps, fix via gap closure) | open |  | 2026-10-26T11:23:47.982Z |  |
| 5 | 31 | deviation | server.js |  | Interim replay-guard divergence: disable/regen step-ups still verify against users.two_fa_last_step until Plan 02 converts them to verifyTotpAgainstFactors (D-10) | open |  | 2026-11-01T20:01:00.340Z |  |
| 6 | 31 | deviation | test/totp-rewrap.test.mjs |  | Pre-existing lint debt (13 errors) cleared by 31-03 to make the phase gate green; verified identical at pre-phase 47367c6d | open |  | 2026-11-01T21:04:05.746Z |  |

````json
[
  {
    "id": 1,
    "kind": "unmet-truth",
    "phase": "07",
    "file": "src/actions/actions.js",
    "line": 2180,
    "description": "The preference-saved toast at the language switch renders in English for ~1.5s (t() resolves before the async catalogue load); phase 8 replaces the wiring",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-23T12:23:41.426Z",
    "resolved_at": null,
    "milestone": "v1.2"
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "12",
    "file": ".planning/phases/12-real-file-uploads-and-previews/12-UAT.md",
    "line": null,
    "description": "Manual Firefox re-run of 12-UAT.md tests 1-2 deferred to the verifier (Chromium e2e cannot exercise Firefox's built-in PDF viewer; geometry + redirect round trip pinned in Chromium)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-25T09:39:48.779Z",
    "resolved_at": null,
    "milestone": "v1.2"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "13",
    "file": ".planning/phases/13-investigation-invariant-pinning/13-01-SUMMARY.md",
    "line": null,
    "description": "Pre-existing v1.2 test failure (test/i18n-prefs.test.mjs:246 '## Phase 6' ROADMAP assertion) predates Phase 13; not caused by this docs-only plan, documented in SUMMARY Issues Encountered",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-26T10:55:09.610Z",
    "resolved_at": null,
    "milestone": "v1.3"
  },
  {
    "id": 4,
    "kind": "unmet-truth",
    "phase": "13",
    "file": ".planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md",
    "line": null,
    "description": "D-04 landing-phase contradiction + D-13 copy-scope ambiguity (VERIFICATION gaps, fix via gap closure)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-26T11:23:47.982Z",
    "resolved_at": null,
    "milestone": "v1.3"
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "31",
    "file": "server.js",
    "line": null,
    "description": "Interim replay-guard divergence: disable/regen step-ups still verify against users.two_fa_last_step until Plan 02 converts them to verifyTotpAgainstFactors (D-10)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-01T20:01:00.340Z",
    "resolved_at": null,
    "milestone": "v1.6"
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "31",
    "file": "test/totp-rewrap.test.mjs",
    "line": null,
    "description": "Pre-existing lint debt (13 errors) cleared by 31-03 to make the phase gate green; verified identical at pre-phase 47367c6d",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-01T21:04:05.746Z",
    "resolved_at": null,
    "milestone": "v1.6"
  }
]
````
