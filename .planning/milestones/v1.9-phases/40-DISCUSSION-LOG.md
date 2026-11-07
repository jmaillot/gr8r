# Phase 40: Digest Subject & Task Lines - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-05
**Phase:** 40-Digest Subject & Task Lines
**Areas discussed:** Subject format, Task line shape, Subject builder scope, Truncation & length

---

## Subject format

| Option | Description | Selected |
|--------|-------------|----------|
| Bracket prefix | `[Acme] Daily digest: 3 task(s)` — bracket keeps name distinct | ✓ |
| Em-dash prefix | `Acme — Daily digest: 3 task(s)` — matches task-line language but blurs | |
| Colon separation | `Acme : Daily digest: 3 task(s)` | |
| You decide | Agent picks | |

**User's choice:** Bracket prefix
**Notes:** Follow-up — i18n flow: user chose "New key + old fallback" over mutating `notif.digest.subject` or prepending in code. New `notif.digest.subjectWs` ({ws}, {count}); existing key stays as SC-5 English fallback.

---

## Task line shape

| Option | Description | Selected |
|--------|-------------|----------|
| Em-dash, task link | Whole "Project — Task" string is one link to the task | ✓ |
| Project plain, task linked | Project name outside the `<a>` | |
| Drop task link | Line text only, no URL | |

**User's choice:** Em-dash, task link
**Notes:** Follow-ups — (1) name resolution: user chose "Server resolves name" (per-recipient loop post-`memberCanReadProject`, mailer stays pure renderer) over passing a projects map (leak risk); (2) degrade: "Degrade silently" — no placeholder, no leak signal; (3) separator ambiguity when a name contains an em dash: "Accept ambiguity".

---

## Subject builder scope

| Option | Description | Selected |
|--------|-------------|----------|
| Harden encodeWord | CRLF-strip then encode in the shared encoder, hostile-name tests, fixes all 4 builders | ✓ |
| Digest-only builder | New wrapper only for digest; 3 call sites stay vulnerable | |

**User's choice:** Harden encodeWord
**Notes:** Follow-ups — (1) CRLF handling: "Strip control chars" (strip CR/LF/C0, name survives as one line) over replace-with-space or reject; (2) placement: "Sanitize inside encodeWord" (smallest diff) over separate sanitizeSubject step; (3) From-header coverage: "Subject only" — `formatAddress` explicitly NOT this phase.

---

## Truncation & length

| Option | Description | Selected |
|--------|-------------|----------|
| Cap at 64 chars | Workspace name ellipsized at 64 in Subject | ✓ |
| No truncation | encodeWord chunking keeps it legal; inbox renders long | |
| Cap at 128 | Generous cap | |

**User's choice:** Cap at 64 chars
**Notes:** Follow-ups — (1) task lines: "Cap each name" independently (~80 shared cap) before em-dash join, over no cap or joined-line cap; (2) location: "Mailer renders" — truncate helper at render time, server passes full names; (3) marker: `…` (U+2026) over ASCII dots or silent cut.

---

## the agent's Discretion

- Exact task-line cap value (~80) — adjust if tests suggest better
- Placement of `truncate` helper within mailer.js
- FR wording of `notif.digest.subjectWs` per existing catalogue style
- Whether workspace-name strip happens at call site or inside interpolation (encodeWord must sanitize regardless)

## Deferred Ideas

- From-header (`formatAddress`) CRLF hardening — deliberately excluded this phase; candidate follow-up
