# Phase 39: Notification Audit (doc-only) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-05
**Phase:** 39-Notification Audit (doc-only)
**Areas discussed:** Audit doc format & home; How the audit matrix is built; RFC 8058 decision framing; Owner-validation gate mechanics

---

## Audit doc format & home

| Option | Description | Selected |
|--------|-------------|----------|
| docs/notification-audit.md | Next to the code it audits; visible to repo cloners; natural home for follow-ups | ✓ |
| .planning/phases/39-.../AUDIT.md | Inside the GSD planning system; less discoverable | |
| Phase dir, promote later | Working doc during milestone, promoted post-validation | |

**User's choice:** docs/notification-audit.md
**Notes:** Follow-up on matrix shape chose per-type sections with tables over a single flat matrix (richer prose per type; RFC 8058 as its own section).

## How the audit matrix is built

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-written, cite source lines | Direct read of server.js/mailer.js constants; every row cites file:line; no new code | ✓ |
| Inventory script | scripts/notif-inventory.mjs introspects constants — rejected as a one-shot maintenance asset in a zero-dependency repo | |
| Doc + regression test pin | test asserting doc matches constants — rejected: test churn on every prefs change | |

**User's choice:** Hand-written, cite source lines
**Notes:** Drift handled by per-row source citations instead of tooling.

## RFC 8058 decision framing

| Option | Description | Selected |
|--------|-------------|----------|
| Audit recommends, you validate | Doc presents the trade-off, leans implement, coding stays owner-gated | ✓ |
| Lean defer / follow-up | Record "not now" with rationale | |
| Open decision, no lean | Both options, empty decision cell until owner rules | |

**User's choice:** Audit recommends, you validate
**Notes:** Verified mailer.js currently sends no unsubscribe headers.

## Owner-validation gate mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Status column + STATE.md line | Row status (proposed/validated/rejected) + validated-by/date; validated changes mirrored in STATE.md Recent Decisions | ✓ |
| STATE.md only | Doc stays a static snapshot | |
| Roadmap backlog entries | Each validated change gets its own backlog entry | |

**User's choice:** Status column + STATE.md line
**Notes:** —

## Wrap-up

| Option | Description | Selected |
|--------|-------------|----------|
| Satisfied — write CONTEXT.md | All four areas decided | ✓ |
| Continue discussing | More depth on one or more areas | |

**User's choice:** Satisfied — write CONTEXT.md
**Notes:** —

---

**Deferred ideas:** none — discussion stayed within phase scope.
**Agent discretion:** table columns/section ordering, candidate trim list (push keys with no emission surface, mention_ws/mention_team overlap), digest section depth.
