# Phase 27: Due-Date Reminder Scheduler — Discussion Log

**Date:** 2026-11-01
**Mode:** default (interactive)

## Session Summary

- Phase: 27 — Due-Date Reminder Scheduler
- Prior context loaded: PROJECT.md, REQUIREMENTS.md (REM-01…05), STATE.md, prior CONTEXT.md files (26, 25, 23)
- Codebase scouted: no .planning/codebase maps; grepped server.js notification/email/interval patterns
- Todos matched: none (todo_count 0)
- SPEC.md: none — requirements come from REQUIREMENTS.md REM section

## Gray Areas Presented & Discussed

All four presented areas were selected and discussed (default mode, one decision per area — each area was compact enough that follow-ups weren't needed).

### 1. Reminder clock times
Options: 09:00 both (recommended) / 17:00+09:00 split / 08:00 both.
**Decision:** 09:00 both, in the workspace's shared timezone (D-27-1).

### 2. Tick cadence
Options: every 1 min (recommended) / every 5 min / hourly boundary ticks.
**Decision:** every 1 minute, in-process, unref'd (D-27-2).

### 3. Past-due nudge timing
Options: morning after due date (recommended) / due-date morning / N days after.
**Decision:** first 09:00 tick after the due date passes — morning after, exactly once (D-27-3).

### 4a. In-app notification types
Options: two new types due_reminder + past_due (recommended) / one type / reuse assign.
**Decision:** two new types — `due_reminder` (both offsets) and `past_due` (D-27-4).

### 4b. Prefs UI
Options: 3 toggles (recommended) / email gate only / single master toggle.
**Decision:** email_reminder + due_reminder + past_due toggles, all ON by default (D-27-5).

## Wrap-up

Asked which gray areas remain: user chose "I'm ready for context". No additional areas explored.

## Deferred Ideas

- Per-user timezone for reminders (already deferred by REM-02)
- Recurring tasks / recurring due dates (flagged as future consideration affecting dedup key shape)

## Agent's Discretion

- Reminder email copy/wording (EN+FR, i18n catalogue)
- Dedup-table schema and boot catch-up mechanics (any design meeting REM-03's contract)
- Reminder-to-doc-write integration mechanics (constraint: no idle revision bumps)
