# Phase 38: Daily Digest & Reminder Suppression - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

An opt-in daily digest email — sent at 09:00 workspace-local time, riding the existing reminder scheduler — lists the recipient's due-today and overdue tasks with deep links, localized per recipient, and is silent when nothing qualifies. When the digest is enabled for a member, their individual reminder EMAILS are suppressed at the email fan-out; reminder notification rows (inbox + push) are never suppressed, and mention/assignment/comment emails flow unchanged. The `email_digest` preference becomes a real opt-in: its default-layer entry is removed (undefined-falsy = off) with the settings toggle and "digest replaces reminder emails" copy in EN+FR. No migrations, no new scheduler, no digest content beyond due-today/overdue (deferred to AUDIT-01), no "digest AND individual emails" mode.

</domain>

<decisions>
## Implementation Decisions

### Catch-up & resend policy
- **D-01:** Late, never lost — the digest fires at the first 09:00 tick after boot, via the same window-open predicate + dedup-claim pattern as reminders (D-27-2 / Phase 37 D-01). A missed digest arrives late, never lost. No "skip missed day" logic. — **Reversibility:** reversible — local predicate, no contract.
- **D-02:** Content is computed at the SEND instant: a late 14:00 catch-up send lists what is due-today/overdue at 14:00. No 09:00 snapshot replay, no persisted task-list storage (would violate the zero-migration invariant). Due-today stays accurate; overdue is only overstated by the downtime hours.
- **D-03:** Dedup claim key: `ws:{userId}:digest:{localDate}` in the existing `reminders_sent` ledger — one digest per user per workspace per local calendar day. No `due` component (digest content is computed fresh, not keyed to a due-date value). — **Reversibility:** reversible — orphaned keys go inert, no sweep.
- **D-04:** The digest rides `runReminderPass` — same hour gate, same `localParts`/tz resolution, same boot catch-up. No separate scheduler; one invariant set, no clock drift between suppression and send.

### Snapshot semantics
- **D-05:** Recipients = membership rows (`memberships`, the authority table) whose resolved `prefs.email_digest === true`. Doc-only members carry no account row and read undefined-falsy off post-DIGEST-03 — naturally excluded, no special case.
- **D-06:** Task filter reuses `remindable()` plus the SCOPE-04 scope checks already in the reminder pass — one visibility definition. A digest line can never show a task the reminder email would have been blocked from mentioning; no second pipeline.
- **D-07:** Rescheduled tasks re-appear naturally: content computed fresh at each send from live tasks, per-day dedup key. No repeat-suppression machinery.
- **D-08:** Reminder emails and digest are computed in the same pass from one per-workspace doc snapshot — no digest-before-reminders ordering. Digest OFF means reminder emails flow exactly as Phase 37 shipped.

### Suppression mechanics
- **D-09:** The digest suppresses reminder EMAILS only. Reminder notification rows (inbox + push) keep appearing exactly per Phase 37 — DIGEST-02's "push and inbox notifications are never suppressed" is verbatim. Inbox users keep per-task reminder rows while email users get the digest.
- **D-10:** The gate lives at email fan-out (the reminder branch of `queueNotifEmails` / `NOTIF_EMAIL_KIND` handling): notification rows are always emitted and claimed; the reminder email is skipped when the recipient's `prefs.email_digest === true`. Self-corrects on mid-day toggle changes at the next pass.
- **D-11:** `email_digest === true` wins over `email_reminder`: the digest replaces reminder emails regardless of `email_reminder`'s value. `email_reminder` governs only digest-OFF members. One clear precedence matching the shipped copy — no compound gate.
- **D-12:** Nothing due/overdue = no claim, no email. The per-day dedup key is never consumed on an empty digest — the ledger stays honest about actual sends (DIGEST-01 "no email is sent").

### Settings copy & toggle
- **D-13:** Replace-framing copy: EN "Daily digest" / "Get one email at 09:00 with tasks due today and overdue — replaces individual reminder emails"; FR "Résumé quotidien" / "Recevez un email à 09h00 avec les tâches dues aujourd'hui et en retard — remplace les emails de rappel individuels". Exact wording polish is writer/planner discretion (37 D-04 pattern). The suppression behavior MUST be visible in the description.
- **D-14:** `email_digest` STAYS in the 16-key whitelist (`NOTIF_PREF_KEYS` in server.js, `src/core/notifPrefs.js`); only its default-layer entry is deleted from `NOTIF_PREF_DEFAULTS` (server.js) and the client defaults (src/core/notifPrefs.js). Stored values keep meaning: stored `true` = opted in (an explicit stored true IS the opt-in — verify against Phase 34 upsert semantics whether historical rows carry explicit true), stored `false` = off, undefined = off. Zero migration, zero whitelist churn.
- **D-15:** The toggle stays in place in the existing notification-prefs block next to the reminder-email row (the `tog('email_digest', ...)` row at src/pages/settings.js:375). Only labels + default handling change — no new UI section.

### the agent's Discretion
- Digest email HTML/text structure (subject line, section grouping due-today vs overdue, deep-link format) — follow the existing mailer templates and the Phase 36 `tFor` localized-frame pattern; subject/body copy within the `notif.*` catalogue family, EN+FR, passing the i18n gate.
- Exact internal test harness approach (extend the `POST /api/internal/reminder-pass` pattern with an injectable clock, per Phase 27/37 conventions) for digest sends, catch-up replay, idempotence across restarts, and suppression pins.
- Whether the suppression gate is a branch inside `queueNotifEmails` or a dedicated pre-filter before it — both satisfy D-10; planner picks the cleaner seam.
- Final EN+FR wording of the settings description and any new catalogue keys.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` § Daily Digest (DIGEST-01..03) — locked requirement text
- `.planning/ROADMAP.md` § Phase 38 — goal and 4 success criteria

### Prior phase context (feeds directly into this phase)
- `.planning/phases/37-reminder-cadence-rework/37-CONTEXT.md` — two-offset cadence shipped, dedup-key conventions (D-02), zero-migration removal discipline (D-03), copy-pass pattern (D-04/D-05), regression-pin harness (D-06)
- `.planning/phases/36-server-notification-i18n/36-CONTEXT.md` — `tFor` localized email frames, per-recipient locale via the memberships⋈users row, `notif.*` catalogue + EN+FR build gate, keyed-row dual store

### Code (primary integration surfaces)
- `server.js` — `runReminderPass()` (~line 1367): hour gate, tz resolution, dedup claim transaction, email fan-out; `queueNotifEmails()` + `NOTIF_EMAIL_KIND` (~line 1260-1300): where the reminder-email suppression gate lands (D-10); `NOTIF_PREF_KEYS`/`NOTIF_PREF_DEFAULTS` (~line 1127/1146): drop `email_digest: true` from defaults only; `getUserNotifPrefs()` (~line 1160): the only prefs reader
- `src/core/notifPrefs.js` — client defaults mirror: remove `email_digest: true` from the default layer (line 19)
- `src/pages/settings.js` — digest toggle row (line 375): labels/copy update per D-13/D-15
- `src/locales/en.json`, `src/locales/fr.json` — new digest settings copy + any `notif.digest.*` catalogue keys, EN+FR
- `scripts/i18n-scan.mjs` — build gate must stay green (EN+FR parity, server-referenced keys resolve, per Phase 36 D-07..D-09)

No external specs or ADRs exist for this phase — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `runReminderPass` with injectable clock + `POST /api/internal/reminder-pass` (`REMINDER_TEST_TOKEN`) — the digest send, catch-up replay, and restart-idempotence tests need no new infrastructure.
- `reminders_sent` ledger with `INSERT OR IGNORE` inside a transaction — the digest claim (D-03) reuses it with the new key shape.
- `queueNotifEmails` / `tFor` per-recipient locale rendering — digest emails ride the same localized frame; locale rides the memberships⋈users row.
- Settings toggle row for `email_digest` already exists (`settings.js:375`) — copy/labels only.

### Established Patterns
- Window-open predicate + dedup key = boot catch-up; idle ticks outside 09:00 are pure reads.
- Zero-migration discipline: additive changes only; removed things go inert, never swept.
- One visibility pipeline: `remindable()` + SCOPE-04 scope checks — never a second filter.
- String catalogue changes must pass `scripts/i18n-scan.mjs` (EN+FR parity, server keys resolve).
- Prefs accessor `getUserNotifPrefs` is the ONLY prefs reader; defaults merge `{...DEFAULTS, ...stored}` with `=== false` disabling and undefined-falsy for opt-in keys — DIGEST-03 slots into the existing 4-key undefined-falsy pattern (mention_team, mention_ws, assign_status, assign_over).

### Integration Points
- Digest loop inside `runReminderPass` after the per-workspace doc snapshot: iterate memberships, filter tasks via `remindable` + scope, claim `ws:{userId}:digest:{localDate}`, build + send localized email post-commit.
- Suppression branch at the reminder kind of `NOTIF_EMAIL_KIND` in `queueNotifEmails` (or an equivalent pre-fan-out filter).
- Default-layer deletions in `NOTIF_PREF_DEFAULTS` (server.js) and `src/core/notifPrefs.js` — whitelist keys unchanged.

</code_context>

<specifics>
## Specific Ideas

The user consistently chose the option that reuses existing machinery and avoids new state: extend `runReminderPass`, reuse `remindable` + scope, claim in the existing ledger, keep the whitelist key and only drop the default. The one flagged STATE.md blocker (catch-up window / resend-vs-never) is settled as "late, never lost" with content-at-send-time — no snapshot storage. Flag for the planner: the ledger-honesty choice (D-12, no claim on empty digest) means the SC-2 idempotence pin must assert BOTH no-double-send AND no-phantom-claim.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Digest content beyond due-today/overdue and "digest AND individual emails" mode remain rejected/deferred per REQUIREMENTS.md Future Requirements.)

</deferred>

---

*Phase: 38-Daily Digest & Reminder Suppression*
*Context gathered: 2026-11-04*
