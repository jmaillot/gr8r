---
phase: 62-e2e-baseline-repair
source: 62-REVIEW.md
written: 2026-11-14
status: open-findings-recorded
---

# Phase 62 Review Disposition

Advisory record — one row per REVIEW.md finding, default disposition `open`.
Source review: 0 Critical · 2 Warning · 4 Info (status: issues_found). Review is
advisory and does not block phase completion; findings below remain visible for
triage (e.g. via `/gsd-audit-fix` or a follow-up gap plan).

| ID | Severity | File | Summary | Disposition |
|----|----------|------|---------|-------------|
| WR-01 | warning | e2e/helpers/setup.mjs:113-123 | `selectLanguage` arms unbounded `waitForResponse` on PATCH /api/auth/me — hangs to global timeout if no PATCH fires | open |
| WR-02 | warning | e2e/helpers/setup.mjs:34-45 | assert-once flag `_serverAsserted` not keyed to base URL — different-base call silently no-ops | open |
| IN-01 | info | e2e/french-overflow.spec.mjs, e2e/locale.spec.mjs | option-label read logic duplicated in both specs instead of living in the helper | open |
| IN-02 | info | e2e/french-overflow.spec.mjs | `beforeAll` fixture path skips `assertServerUp` unlike other fixture paths | open |
| IN-03 | info | e2e (cat helper) | missing catalogue key silently falls back to English | open |
| IN-04 | info | e2e (both rewritten specs) | cosmetic re-await of already-resolved response | open |

## Notes

- No Critical findings; helper contracts verified against the real app side.
- WR-01/WR-02 are robustness issues on generic helpers, not on the paths the
  current specs exercise — candidates for a small hardening fix rather than gap
  closure against E2E-01/E2E-02 must-haves.
