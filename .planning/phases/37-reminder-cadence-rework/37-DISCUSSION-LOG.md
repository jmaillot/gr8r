# Phase 37: Reminder Cadence Rework - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-04
**Phase:** 37-Reminder Cadence Rework
**Areas discussed:** "Due today" window semantics, day_before removal (delete vs inert), Settings copy + email copy, Regression pin shape

---

## "Due today" window semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Keep >= (late beats never) | localDate >= due; late reminder arrives rather than never; matches catch-up design and SC-5 burst | ✓ |
| Tighten to exactly-due | localDate === due; missed window means no "due today" at all | |

**User's choice:** Keep >= (late beats never)
**Notes:** Follow-up — dedup key includes `due`, so due-date changes re-arm reminders. User chose re-arm on due change (Recommended) over once-ever-regardless.

---

## day_before removal (delete vs inert)

| Option | Description | Selected |
|--------|-------------|----------|
| Delete outright | Remove branch, ternary arm, snippet branch, and EN+FR `notif.reminder.dayBefore` keys; legacy rows degrade to stored prose (Phase 36 D-06) | ✓ |
| Keep keys, kill the branch | Branch removed, catalogue keys left as dead code | |

**User's choice:** Delete outright
**Notes:** Catalogue stays honest; parity gate keeps guarding only reachable strings.

---

## Settings copy + email copy

| Option | Description | Selected |
|--------|-------------|----------|
| Rename to "Due-day reminder" | Explicit EN+FR rename of the due_reminder toggle copy | ✓ |
| Keep label, fix description only | Only adjust description text | |

**User's choice:** Rename to "Due-day reminder"
**Notes:** Follow-up — scope of copy change: user selected "Also touch email copy" over "Client locale entries only", then chose "Accuracy-only pass" (fix wording implying more reminders are coming) over explicit cadence messaging ("this is your only notice").

---

## Regression pin shape

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-morning clock replay | Existing REMINDER_TEST_TOKEN route + injected clock across due, due+1, due+2, due+5; assert one morning_of, one past_due, nothing later | ✓ |
| Clock replay + ledger assertion | Additionally assert schema-level ledger uniqueness | |

**User's choice:** Multi-morning clock replay
**Notes:** Same pattern as Phase 27 scheduler tests.

---

## the agent's Discretion

- Final EN+FR copy wording polish
- Which surface holds the settings labels (client locale vs server catalogue) — follow existing architecture
- Test file placement / assertion style (Phase 27 conventions)
- Release-notes format for the catch-up burst note (SC-5)

## Deferred Ideas

None — discussion stayed within phase scope.
