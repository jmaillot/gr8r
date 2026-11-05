# Phase 39: Notification Audit (doc-only) - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

The owner receives a complete notification audit — every notification type (mention, assign, comment, due-reminder, digest) × channel (email, inbox, push) × current default, with a trim recommendation per row and an explicit RFC 8058 `List-Unsubscribe` decision for the digest email — delivered as a documentation file in the repo. The audit changes no behavior: no threshold or default change is coded in this milestone without recorded owner validation, recorded via a status column in the audit doc itself plus a STATE.md "Recent Decisions" line. No code changes beyond the doc; no migrations, no new tests guarding the doc.

</domain>

<decisions>
## Implementation Decisions

### Document home & shape
- **D-01:** The audit lives at `docs/notification-audit.md` — alongside the code it audits (docs/ProjectPermissions.md precedent), visible to anyone cloning the repo, and the natural home for post-validation follow-up notes. — **Reversibility:** reversible — a moved file, no contract.
- **D-02:** Structure = one section per notification TYPE (mentions, assignments, comments, due-reminders, digest) with a per-type table and narrative; not a single flat matrix. Each per-type table carries rows per type×channel combination with pref key, current default, storage state, and trim recommendation. The RFC 8058 decision is its own section. — **Reversibility:** reversible — doc restructure.

### How the matrix is built
- **D-03:** Hand-written by the researcher/planner from a direct read of the post-38 server reality — `NOTIF_PREF_KEYS` / `NOTIF_PREF_DEFAULTS` / `NOTIF_EMAIL_KIND` in server.js, `runReminderPass`, `queueNotifEmails`, `getUserNotifPrefs` — plus the client mirror in src/core/notifPrefs.js and the settings toggle surface. No inventory script, no regression test pinning the doc: the zero-dependency repo gains no one-shot maintenance asset. Drift is handled by requiring a source-line citation (file:line) on every row so any future editor can re-verify the row against the code it cites. — **Reversibility:** reversible — doc-only.

### RFC 8058 `List-Unsubscribe` decision (AUDIT-01 explicit decision)
- **D-04:** The audit LEANS: it presents the trade-off (header-only change, ~zero dependencies, enables Gmail/Yahoo one-click unsubscribe; most valuable now that the digest is opt-in and reminder emails are rarer post-37/38) and RECOMMENDS implementing `List-Unsubscribe` + `List-Unsubscribe-Post` for the digest email. Coding stays owner-gated: the recommendation is a `proposed` status row until validated. mailer.js currently sends no unsubscribe headers (verified — no List-Unsubscribe anywhere in server.js/mailer.js).

### Owner-validation gate (AUDIT-02)
- **D-05:** Each trim recommendation row carries a status cell (`proposed` / `validated` / `rejected`) plus a `validated-by` + date line once ruled. A recommendation is only codeable once its cell reads `validated` with the owner's recorded sign-off. Additionally, every validated change gets one line in `.planning/STATE.md` → "Recent Decisions" so the planning system sees the ruling without opening the doc. — **Reversibility:** reversible — recorded process, no code contract.

### the agent's Discretion
- Exact table column headers, section ordering, and prose depth within the per-type structure (D-02).
- Which candidate trim recommendations the audit proposes — derive from the post-38 reality (e.g. push-notification keys with no push emission surface per Phase 36 D-02 boundary pin, `mention_ws`/`mention_team` overlap) but the final list is the researcher's judgment.
- The digest section's depth on unsubscribe mechanics (header format, mailer.js insertion point) — recommendation level, not implementation plan level.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` § Notification Audit (AUDIT-01..02) — locked requirement text; § Future Requirements (deferred) — the anti-feature candidates the audit evaluates
- `.planning/ROADMAP.md` § Phase 39 — goal and 3 success criteria

### Prior phase context (the audit audits THIS reality — read all four)
- `.planning/phases/38-daily-digest-reminder-suppression/38-CONTEXT.md` — digest opt-in semantics, suppression gate at email fan-out, `email_digest` stored-value rules (D-14)
- `.planning/phases/37-reminder-cadence-rework/37-CONTEXT.md` — two-offset cadence, `push_due` removal, `day_before` deletion
- `.planning/phases/36-server-notification-i18n/36-CONTEXT.md` — boundary pin 36-02: no server push-emission surface exists (drives the push-channel rows)
- `.planning/phases/34-*/34-CONTEXT.md` (prefs migration) — per-user prefs rows, 16-key whitelist provenance

### Code (primary audit surfaces)
- `server.js` — `NOTIF_PREF_KEYS` (~line 1124), `NOTIF_PREF_DEFAULTS` (~1146), `getStoredNotifPrefs`/`getUserNotifPrefs` (~1160), `NOTIF_EMAIL_KIND` (~1175), `queueNotifEmails` (~1188, incl. the Phase 38 digest-suppression gate), `runReminderPass` (~1367)
- `src/core/notifPrefs.js` — client defaults mirror
- `src/pages/settings.js` — notification-prefs toggle block (digest toggle at ~line 375)
- `mailer.js` — `buildNotifMessage` (~line 402): the MIME frame a future `List-Unsubscribe` header would ride; currently sends no unsubscribe headers

No external specs or ADRs exist for this phase — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NOTIF_PREF_KEYS` (16 keys) + `NOTIF_PREF_DEFAULTS` (12-key default layer, `email_comment` the only false) — the factual backbone of every default row.
- `NOTIF_EMAIL_KIND` map — the authoritative type→email-channel mapping (mention/assign/comment/due_reminder/past_due; `update` type is in-app only).
- Phases 36-38 CONTEXT decisions — the post-rework behavior the audit documents (digest suppression precedence D-11, no push emission surface, retired keys).

### Established Patterns
- docs/ as the home for durable repo documentation (docs/ProjectPermissions.md, docs/WorkspacePermissions.md).
- Every post-v1.8 context decision carries a source citation discipline this phase extends to every audit row (file:line per row).
- Owner-gated change discipline from the milestone invariant: "threshold changes validated by the owner BEFORE any coding".

### Integration Points
- `mailer.js` `buildNotifMessage` — where a validated `List-Unsubscribe` header would land in a future phase.
- `.planning/STATE.md` "Recent Decisions" — where validated rulings get mirrored (D-05).
- ROADMAP.md backlog footer — already lists "other candidates from the Phase 39 audit (per-task offsets, digest content beyond due-today/overdue, RFC 8058 unsubscribe headers)" as the landing zone for validated follow-ups.

</code_context>

<specifics>
## Specific Ideas

- The audit doc is the deliverable AND the gate: its status column is the machine-readable record of what may be coded.
- Rows must cite the exact source line they describe so the doc can be re-verified against code drift without a test pin.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Coding any validated trim recommendation, and the RFC 8058 implementation itself, are follow-up milestones per REQUIREMENTS.md "Future Requirements (deferred)".)

</deferred>

---

*Phase: 39-Notification Audit (doc-only)*
*Context gathered: 2026-11-05*
