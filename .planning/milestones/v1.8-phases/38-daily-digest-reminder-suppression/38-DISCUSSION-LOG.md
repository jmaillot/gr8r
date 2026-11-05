# Phase 38: Daily Digest & Reminder Suppression - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-04
**Phase:** 38-Daily Digest & Reminder Suppression
**Areas discussed:** Catch-up & resend policy, Snapshot semantics, Suppression mechanics, Settings copy & toggle

---

## Catch-up & resend policy

| Option | Description | Selected |
|--------|-------------|----------|
| Late, never lost | Window-open predicate + dedup claim; digest fires at first 09:00 tick after boot (mirrors D-27-2 / 37 D-01) | ✓ |
| Skip missed day | Dedup key includes date; missed 09:00 tick = day's digest skipped | |
| Content at send time | Late send lists due-today/overdue as of the send instant; no snapshot replay | ✓ |
| Replay the 09:00 snapshot | Persist the would-have-been 09:00 list; contradicts zero-migration invariant | |
| ws:user:digest:date | Per-user per-workspace per-local-day key in reminders_sent, no due component | ✓ |
| No date component | Key without date; no benefit, semantically wrong | |
| Extend runReminderPass | Same hour gate, tz resolution, catch-up; one invariant set | ✓ |
| Separate pass | Own interval; duplicates 09:00 gate, clock-drift risk between passes | |

**User's choice:** All recommended options — reuse existing machinery end to end.
**Notes:** This settles the STATE.md-flagged blocker (resend-vs-never trade-off): resend semantics, content at send time, no snapshot storage.

---

## Snapshot semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Per membership row | Recipients = memberships with prefs.email_digest === true; doc-only members naturally off | ✓ |
| Assignees only | Recipients derived from task assignees; inconsistent with "recipient's tasks" | |
| Reuse remindable + scope | One visibility definition with the reminder pass; no second pipeline | ✓ |
| New filter | Separate digestTaskFilter(); drift risk | |
| Fresh list, naturally | Rescheduled tasks re-appear; no repeat suppression | ✓ |
| Suppress repeats | Track digest appearances; new ledger semantics, contradicts per-day key | |
| Same pass, one snapshot | Reminder + digest computed in one pass from one doc snapshot | ✓ |
| Digest before reminders | Strict ordering + threaded flag; more state, no benefit | |

**User's choice:** All recommended options.

---

## Suppression mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Emails only | Suppress reminder EMAILS only; inbox + push rows keep appearing (DIGEST-02 verbatim) | ✓ |
| Whole emission | Stop reminder rows too; contradicts DIGEST-02 | |
| At email fan-out | Gate in queueNotifEmails reminder branch; rows always emitted; self-corrects on toggle change | ✓ |
| At emission | Skip offsets in runReminderPass; would kill inbox rows (forbidden) | |
| Digest wins | email_digest === true replaces reminder emails regardless of email_reminder | ✓ |
| Compound gate | Suppress only when both true; more complex, same outcomes | |
| No claim at all | Empty digest consumes no dedup key; ledger stays honest | ✓ |
| Claim + skip | Claim even when empty; misleading ledger row, pure overhead | |

**User's choice:** All recommended options.
**Notes:** Ledger honesty (no phantom claims) flagged for the SC-2 idempotence pin — must assert no-double-send AND no-phantom-claim.

---

## Settings copy & toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Replace-framing copy | EN/FR descriptions explicitly state the digest replaces reminder emails | ✓ |
| Plain description | Simple copy hiding the suppression behavior | |
| Keep key, drop default | email_digest stays whitelisted; default-layer entry removed; stored true = opted in; zero migration | ✓ |
| Rename the key | New opt-in key; whitelist churn + migration question | |
| In place | Toggle stays in the existing notif-prefs block (settings.js:375) | ✓ |
| Own section | New "Email digest" UI section; unnecessary for one toggle | |

**User's choice:** All recommended options.

---

## the agent's Discretion

- Digest email structure/subject/copy (within `notif.*` catalogue family, EN+FR, i18n gate must pass)
- Test harness specifics (extend the internal reminder-pass endpoint pattern; digest, catch-up, idempotence, suppression pins)
- Suppression gate seam (branch in queueNotifEmails vs pre-filter before it)
- Final EN+FR wording polish (writer/planner discretion per 37 D-04 pattern)

## Deferred Ideas

None — discussion stayed within phase scope.
