# Phase 37: Reminder Cadence Rework - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Due-date reminders drop to their honest minimum: at most two per task per assignee per due-date value — one "due today" (morning of, with catch-up if the server was down) and one "past due" (the following morning). The `day_before` offset is removed outright, deploy-safely: no migration, no dedup-row sweep, existing `reminders_sent` rows untouched (orphaned keys go inert). Settings copy for `due_reminder` is updated in EN+FR, and reminder email copy gets an accuracy-only pass. No new notification types, no digest (Phase 38), no audit (Phase 39).

</domain>

<decisions>
## Implementation Decisions

### "Due today" window semantics
- **D-01:** Keep the `localDate >= due` window-open predicate for the "due today" (morning_of) reminder — do NOT tighten to `=== due`. Late beats never: if the server is down over the due-date morning, the reminder fires at the first 09:00 after boot, and that one-time catch-up burst is what SC-5's release notes document. No predicate change beyond removing the `day_before` arm. — **Reversibility:** reversible — local predicate change, no contract.
- **D-02:** Reminders re-arm when a task's due date changes: the dedup key keeps its `due` component (`ws:task:assignee:offset:due`). "At most two per task" means per due-date value, per task, per assignee — a rescheduled task legitimately gets a fresh "due today" + "past due" for the new date. The REM-03 regression pin targets the no-re-fire-on-later-days guarantee for an unchanged due date, not the re-arm case. — **Reversibility:** one-way — dropping `due` from the dedup key would require a reminders_sent re-derivation/sweep to take effect, which REM-04 forbids.

### day_before removal: delete outright
- **D-03:** Delete, don't neuter: remove the `day_before` offset branch in `runReminderPass`, the `dayBefore` arm of the key-mapping ternary, `reminderSnippet`'s day_before branch, AND both EN+FR `notif.reminder.dayBefore` catalogue entries. Legacy inbox rows carrying the `notif.reminder.dayBefore` key degrade safely to their stored English prose snippet (Phase 36 D-06 dual store) — no blank text, no migration. The catalogue stays honest; the i18n parity gate keeps guarding only reachable strings. — **Reversibility:** reversible — additive re-addition possible; orphaned ledger rows were never swept.

### Settings copy + email copy
- **D-04:** Rename the `due_reminder` toggle copy to "Due-day reminder" (EN) / "Rappel le jour d'échéance" (FR) with descriptions that state exactly what remains: EN "Get a reminder on the morning a task is due" / FR "Recevez un rappel le matin de l'échéance d'une tâche". The `due_reminder` preference key and settings toggle itself stay (REM-02); only copy changes. Where the copy lives (client locale entries vs server catalogue) follows the existing string architecture — planner verifies which surface holds the settings labels.
- **D-05:** Reminder email copy gets an ACCURACY-ONLY pass, not a rewrite: subjects/bodies already say "Due today: <task>" / "Past due: <task>" via the `notif.*` catalogue keys and remain accurate post-change. Adjust only wording that implies additional reminders are coming (e.g. if the past-due body suggests further notices, fix it). No explicit "this is your only notice" cadence messaging — keys stay within the existing `notif.reminder.*` family, and the Phase 36 build gate (EN+FR parity, all server-referenced keys resolve) must pass.

### Regression pin (REM-03)
- **D-06:** The pin is a multi-morning clock replay using the existing test harness: drive the clock via `POST /api/internal/reminder-pass` (`REMINDER_TEST_TOKEN`) across several consecutive mornings after the due date (e.g. due, due+1, due+2, due+5) and assert exactly one morning_of notification, exactly one past_due notification, and nothing further on later days. Same pattern as the Phase 27 scheduler tests — no new harness, no schema-level ledger assertions.

### the agent's Discretion
- Exact copy final wording in EN+FR (user approved direction: rename + accuracy-only; planner/writer polishes strings).
- Whether the due_reminder/past_due settings labels are client-side locale entries or server catalogue strings — follow the existing architecture, don't restructure.
- Internal test file placement and assertion style, following the Phase 27 reminder test conventions.
- Release-notes format/location for the catch-up burst note (SC-5) — follow existing release-notes convention if any, else document in the phase summary.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` § Reminder Cadence (REM-01..04) — locked requirement text
- `.planning/ROADMAP.md` § Phase 37 — goal and 5 success criteria

### Prior phase context (feeds directly into this phase)
- `.planning/phases/36-server-notification-i18n/36-CONTEXT.md` — keyed reminder rows (D-04/D-05), dual store prose fallback (D-06), `notif.*` catalogue + build gate (D-07..D-09). Phase 37 deletes `dayBefore` keys within that scheme.

### Code (primary integration surfaces)
- `server.js` — `runReminderPass()` (~line 1367): offset loop, dedup claim (`ws:task:assignee:offset:due`), keyed-row construction (~line 1421); `reminderSnippet()` (~1355, day_before branch to delete); D-27 scheduler header comments (~1290) documenting the 09:00 / catch-up invariants
- `src/locales/en.json`, `src/locales/fr.json` — `notif.reminder.dayBefore` entries to delete; `notif.reminder.morningOf` / `notif.reminder.pastDue` stay
- Client settings surface holding the `due_reminder` toggle label (planner locates; Phase 34 pref system, `getUserNotifPrefs` in server.js ~1126)
- `scripts/i18n-scan.mjs` — build gate must stay green after key deletion (EN+FR parity, server-referenced keys resolve)

No external specs or ADRs exist for this phase — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Clock-injectable test harness: `POST /api/internal/reminder-pass` guarded by `REMINDER_TEST_TOKEN` (server.js ~2844) — the regression pin (D-06) needs no new infrastructure.
- Phase 36 keyed-row payload: `{ key, vars: { title }, snippet }` already in place — Phase 37 only removes the dayBefore mapping arm.
- `reminders_sent` ledger with `INSERT OR IGNORE` inside a transaction — exactly-once machinery unchanged.

### Established Patterns
- Zero-migration discipline: additive only (REQUIREMENTS.md invariant); REM-04 extends it to "removal must also need no sweep".
- Window-open predicate + dedup key = boot catch-up; idle ticks outside 09:00 are pure reads.
- String catalogue changes must pass `scripts/i18n-scan.mjs` (Phase 36 D-07..D-09).

### Integration Points
- `runReminderPass` offsets block (~line 1404-1411): delete the `day_before` push; `morning_of` (gated by `prefs.due_reminder`) and `past_due` (gated by `prefs.past_due`) remain as-is.
- Key-mapping ternary (~line 1421): remove the `dayBefore` arm.
- `users` notification prefs defaults (`due_reminder: true, past_due: true`) — unchanged; only copy around them.

</code_context>

<specifics>
## Specific Ideas

The user again chose consolidation/honesty options consistent with Phase 36 (delete dead code outright; keep the shared catch-up predicate; accuracy-only copy). Reversibility-sensitive choice: the dedup key keeps `due` (D-02) — flag this as the one one-way decision if the planner is tempted to "simplify" the ledger.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 37-Reminder Cadence Rework*
*Context gathered: 2026-11-04*
