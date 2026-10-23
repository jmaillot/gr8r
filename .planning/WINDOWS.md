---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-10-23T12:23:41.426Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 07 | unmet-truth | src/actions/actions.js | 2180 | The preference-saved toast at the language switch renders in English for ~1.5s (t() resolves before the async catalogue load); phase 8 replaces the wiring | open |  | 2026-10-23T12:23:41.426Z |  |

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
  }
]
````
