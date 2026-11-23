---
status: complete
phase: 90-polish-verification-sweep
source: [90-VERIFICATION.md]
started: 2026-11-23T17:45:00Z
updated: 2026-11-23T19:20:00Z
---

## Current Test

[COMPLETE — 7/7 PASS (items 2, 3, 6 PASS after same-commit fixes fb356ee9 / 69b6b95c / cf1ba1b5; item 7 owner verify row)]

## Tests

### 1. Promote no-reload reconcile — search ≥2 chars → promote → toast + roster update, zero reload
expected: In Instance > Governance > Super Admins console, typing ≥2 chars in the search shows promote-only candidates (non-super-admins matching name OR email, lowercase substring); promoting a candidate shows the existing keyed toast and reconciles the roster in place (no page reload); below 2 chars only the roster renders; cap 10 + "show more" (+10/click) with visible cap note, reset on query change (D-90-2..5).
result: pass — (2026-11-23, Playwright headless). Seg "Super Admins" roster-first ✓. 1 char → no candidates ✓. "bo" → « Matches for "bo": 1 » promote-only candidate (bob@uat.local) ✓. Promote → keyed toast, roster reconciled in place — `window.__uat_marker_90` stayed `alive` (zero reload), Bob joined roster, left candidates ✓. Cap note + show-more pinned by source-assertion tests (governance client suite). Observation (documented design, not a bug): candidate search filters the `operatorUsers` payload fetched at page entry (governance.js:151) — no per-keystroke server round-trip; promote stays server-gated.

### 2. Restore-list invalidation on terminal backup transition — exactly-once refetch via stage-compare
expected: While the restore list is open, a backup run reaching a terminal state nulls `S.ui.restoreList` inside the existing 1s `backupPollTick` (stage-transition compare, D-90-22) — the list refetches exactly once, never unconditionally/in-tick.
result: pass — after fix (2026-11-23, Playwright headless). **Finding:** the shipped active→terminal stage-compare missed BOTH real shapes on a small instance — (a) a run finishing inside the trigger POST (first poll lands already-terminal, prevStage never active), (b) run N+1 finishing while run N was already the terminal prevStage (terminal→terminal; /current returns the last run even at page load). Live repro: run done, list stayed "No backups yet", zero refetch. **Fix (`fb356ee9`):** invalidation now keys on run IDENTITY (`startedAt`) — `backupFinishedArrived = !backupActive && runId changed` — same invalidation for both shapes, a settled terminal run repeating its identity never re-invalidates (exactly-once per finished run preserved; tick still never calls the refresh action, Pitfall 8). Tests updated same-commit (backup-history-client 16/16). Live re-drive: page load → 1 initial fetch; trigger → run done → list refetched with the NEW archive ✓; no refetch loop across subsequent 1s ticks ✓ (fetches: initial + exactly one per finished run).

### 3. `.trunc + title` deviation — governance roster/candidate rows
expected (per backstop): long names/emails truncate with ellipsis AND carry `title="…"` for hover-full-value. Verifier found `title=` ABSENT from governance roster/candidate rows (the esc() half is test-pinned). Decision: accept the deviation or fix.
result: pass — after fix (2026-11-23). Owner chose FIX. Roster + candidate rows now carry `title="${esc(...)}"` on both the name and email truncating cells (`69b6b95c`); esc() discipline preserved and pinned same-commit (governance-console suite 32/32). Live re-drive: roster spans expose `title="Admin"` / `title="root@uat.local"` ✓.

### 4. 360px wrap backstop — console search / seg / cap note
expected: At 360px viewport the governance console seg-control, search input and cap note wrap without horizontal overflow.
result: pass — (2026-11-23, Playwright headless, viewport 360×800, locale de). docWidth 360 = viewport 360, `pageOverflowX: false`; search input 200px, seg-control 203×28px, cap note renders (« Geben Sie mindestens 2 Zeichen ein… ») — all within viewport, no horizontal overflow.

### 5. Longest-locale kept-badge wrap backstop
expected: The kept-position badge («kept: 3/7 daily»-shape) renders wrapped, not overflowing, in the longest locale (de) at narrow width.
result: pass — (2026-11-23, Playwright headless, 360px, locale de). Task seeded with 8 backdated scheduled runs → history shows GFS badges « behalten: 1/7 täglich » … « behalten: 1/4 wöchentlich », « behalten: 1/5 jährlich » — bucket-position shape per D-90-16 ✓. Badge measured 137×16px, `badgeOverflowX: false`, `pageOverflowX: false`.

### 6. Projection detail-list scroll backstop
expected: Rotation-projection grouped detail lists (per-scale count + expandable run list) scroll within the panel rather than pushing the page; trunc+title implemented (scroll container is the open question — verifier abstained).
result: pass — after fix (2026-11-23, Playwright headless, 1280px). **Finding (the open question resolved):** there was NO scroll container — 48 seeded runs → 33 daily candidates rendered at full height and pushed the page, exactly what this row forbids. **Fix (`cf1ba1b5`):** the expanded detail container (`#backupDel-*`) now carries `max-height:220px;overflow-y:auto`; each row stays `mono trunc` + `title` (trunc+title half confirmed present). Test pinned same-commit (backup-rotation-preview 7/7). Live re-drive: 33 rows, clientH 220 vs scrollH 598 → `scrolls: true`, `pageOverflowX: false` ✓. Also verified: dry-run counts match the offline walk (35 = 33 daily + 2 weekly, retention 7/4/12/5); server task history shows the sched/scheduled shape; note — manual Run-now archives have `task_id NULL` by design (D-11, ratified 2026-11-21), so they don't appear in the per-task history.

### 7. DEPLOY.md accuracy — owner reads the two §9 trust sections
expected: Owner reads §9 additions (backup engines: new scheduler/tasks/run-history vs legacy `node server.js --backup`; NTP/clock posture: chrony, accepted drift, what breaks on drift — crons + GFS retention) against deployment reality. Manual-only (D-90-21, owner verify row).
result: pass — (2026-11-23). Owner read both §9 additions (docs/DEPLOY.md:790–838) and confirmed them conformant to deployment reality — **owner verify row** (D-90-21).
