---
status: in-progress
phase: 90-polish-verification-sweep
source: [90-VERIFICATION.md]
started: 2026-11-23T17:45:00Z
updated: 2026-11-23T17:45:00Z
---

## Current Test

[in progress — 7 human items from 90-VERIFICATION.md]

## Tests

### 1. Promote no-reload reconcile — search ≥2 chars → promote → toast + roster update, zero reload
expected: In Instance > Governance > Super Admins console, typing ≥2 chars in the search shows promote-only candidates (non-super-admins matching name OR email, lowercase substring); promoting a candidate shows the existing keyed toast and reconciles the roster in place (no page reload); below 2 chars only the roster renders; cap 10 + "show more" (+10/click) with visible cap note, reset on query change (D-90-2..5).
result: pending

### 2. Restore-list invalidation on terminal backup transition — exactly-once refetch via stage-compare
expected: While the restore list is open, a backup run reaching a terminal state nulls `S.ui.restoreList` inside the existing 1s `backupPollTick` (stage-transition compare, D-90-22) — the list refetches exactly once, never unconditionally/in-tick.
result: pending

### 3. `.trunc + title` deviation — governance roster/candidate rows
expected (per backstop): long names/emails truncate with ellipsis AND carry `title="…"` for hover-full-value. Verifier found `title=` ABSENT from governance roster/candidate rows (the esc() half is test-pinned). Decision: accept the deviation or fix.
result: pending

### 4. 360px wrap backstop — console search / seg / cap note
expected: At 360px viewport the governance console seg-control, search input and cap note wrap without horizontal overflow.
result: pending

### 5. Longest-locale kept-badge wrap backstop
expected: The kept-position badge («kept: 3/7 daily»-shape) renders wrapped, not overflowing, in the longest locale (de) at narrow width.
result: pending

### 6. Projection detail-list scroll backstop
expected: Rotation-projection grouped detail lists (per-scale count + expandable run list) scroll within the panel rather than pushing the page; trunc+title implemented (scroll container is the open question — verifier abstained).
result: pending

### 7. DEPLOY.md accuracy — owner reads the two §9 trust sections
expected: Owner reads §9 additions (backup engines: new scheduler/tasks/run-history vs legacy `node server.js --backup`; NTP/clock posture: chrony, accepted drift, what breaks on drift — crons + GFS retention) against deployment reality. Manual-only (D-90-21, owner verify row).
result: pending
