# Phase 52: Transparency view & milestone verification sweep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 52-transparency-view-milestone-verification-sweep
**Areas discussed:** View placement, Access-reason detail, Agreement check, Milestone sweep scope

---

## View placement

| Option | Description | Selected |
|--------|-------------|----------|
| Members drill-down | 'View access' action per member row on the Members page | |
| New settings page | Dedicated settings page listing members with expansions | |
| Modal | Overlay invoked from a member picker | |

**User's choice:** New settings page → then refined: the page lives **inside the existing
Members section** as expandable rows.
**Notes:** Follow-ups: member selection = expand per member row; refetch per open
(D-50-5 live team semantics); admin/owner only (TRN-02 member self-view stays v3);
expansion lists ALL accessible projects, not just private ones.

---

## Access-reason detail

| Option | Description | Selected |
|--------|-------------|----------|
| With reasons | Each project carries its reason (Everyone/Member/Team/Lead) | ✓ |
| Projects only | Flat list of project names | |

**User's choice:** With reasons.
**Notes:** Follow-ups: first matching reason only (funnel short-circuit order), not all
paths; reasons are plain localized labels (EN+FR i18n gate), no chips/icons.

---

## Agreement check

| Option | Description | Selected |
|--------|-------------|----------|
| Parity tests | Permanent automated fixture suite vs redacted-doc hidden set | ✓ |
| Manual check only | One-time manual verification, no permanent test | |
| Tests + UAT | Both | |

**User's choice:** Parity tests.
**Notes:** Fixture matrix = extended set (public, direct member, team-linked, lead,
no-access, lost-visibility, empty-members private project, zero teams, admin viewing
admin, guest member).

---

## Milestone sweep scope

| Option | Description | Selected |
|--------|-------------|----------|
| Gates + docs refresh | Run all gates AND update domain docs to the shipped model | ✓ |
| Gates only | Run gates, record checklist, docs untouched | |
| Gates + docs + checklist | Plus a persisted verification checklist artifact | |

**User's choice:** Gates + docs refresh.
**Notes:** Sweep reuses Phase 51 verify commands verbatim (no new aggregate script).

---

## the agent's Discretion

- Transparency endpoint shape and route placement
- Member-row expansion UI mechanics, reason-label i18n keys
- How the endpoint samples the funnel per member
- Parity test file placement, docs refresh depth

## Deferred Ideas

- TRN-02 — member self-view (redacted), v3
