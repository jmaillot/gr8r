# Phase 27: Due-Date Reminder Scheduler - Context

**Gathered:** 2026-11-01
**Status:** Ready for planning

<domain>
## Phase Boundary

The server itself notifies task assignees of approaching due dates: an
in-process scheduled pass generates notification rows (and pref-gated emails)
for the "day before" and "morning of" offsets, plus exactly one "past due"
nudge for overdue tasks. Every reminder fires exactly once per
(task, assignee, offset, due date), deduped transactionally in SQLite,
restart-safe with boot catch-up, idle ticks never bump the workspace revision.
Delivers REM-01, REM-02, REM-03, REM-04, REM-05. Depends on Phase 23
(deep-link email path + APP_URL plumbing); independent of Phases 24–26.

</domain>

<decisions>
## Implementation Decisions

### Reminder clock times
- **D-27-1:** Both reminder offsets fire at **09:00 in the workspace's shared
  timezone** — the day-before reminder and the morning-of reminder use the
  same hour. One consistent send time per day, simple mental model.

### Scheduler cadence
- **D-27-2:** The scheduler ticks **every 1 minute** (in-process, `unref()`'d
  like the existing session-cleanup intervals). Worst-case send delay is one
  minute past 09:00; idle ticks run one cheap indexed SQLite query and must
  not bump the workspace revision (REM-01 / SC-5).

### Past-due nudge
- **D-27-3:** The overdue "past due" nudge fires at the **first 09:00 tick
  after the due date passes** (i.e. the morning after the due date), exactly
  once per task per overdue episode, never repeating while the task stays
  overdue (REM-04, send-one-or-nothing, deduped like the other offsets).

### Notification types
- **D-27-4:** Two new in-app notification types: **`due_reminder`** (covers
  both the day-before and morning-of offsets, with distinguishing copy) and
  **`past_due`** (the nudge). Distinct from `assign`/`mention` so the inbox
  stays filterable and the reminder semantics don't pollute existing types.

### Prefs surface
- **D-27-5:** Three toggles in Settings → notifications, all ON by default,
  alongside the existing notifPrefs toggles: **`email_reminder`** (REM-05
  email gate) + **`due_reminder`** (in-app reminders on/off) +
  **`past_due`** (in-app nudge on/off). Same prefs surface and toggle
  pattern as the other notification types.

### the agent's Discretion
- Exact reminder email copy/wording (reuse the P4-f email structure and i18n
  catalogue approach; EN+FR).
- Internal dedup-table schema and boot catch-up mechanics — any design that
  satisfies REM-03's transactional-exactly-once contract is acceptable.
- How reminder generation integrates with the existing doc-write/notification
  pipeline (the constraint is REM-01's no-idle-revision rule, not the
  mechanism).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` § Due-Date Reminders (REM-01…REM-05) — the five
  locked requirements this phase implements
- `.planning/ROADMAP.md` § Phase 27 — goal, success criteria (1–5), and the
  note that this phase is deliberately scheduled LAST (largest surface)

### Email & notification machinery (from prior phases — reuse, don't reinvent)
- `server.js` § `queueNotifEmails` (~line 789) and the `NOTIF_EMAIL_KIND` map
  (~line 787) — prefs-gated, fire-and-forget email pattern reminders must
  follow; failures logged, never surfaced
- `server.js` (~line 2609) — where queued emails are flushed after a doc
  write; the notification pipeline reminders plug into
- Deep-link contract from Phase 23: emails link via `APP_URL` +
  `/w/:slug/task/:key` (LINK-01); APP_URL is boot-guarded when SMTP is on —
  reminder emails must reuse this exact link shape

### Deployment
- `DEPLOY.md` — SMTP/APP_URL configuration the reminder emails ride on

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `queueNotifEmails()` / `MAILER.sendNotif` — the entire email delivery path
  (authority-row recipient resolution, prefs gating, fire-and-forget) is
  directly reusable for reminder emails
- Workspace timezone setting `P.tz` (Settings select, city-based) — the
  shared timezone REM-02 requires; no per-user tz work
- `notifPrefs` object on the workspace doc (`email_mention/assign/comment/
  digest` toggles) + the Settings → notifications toggle renderer
  (`settings.js` `srow(..., tog('email_digest', np.email_digest, 'np'))`) —
  the three new toggles follow this exact pattern
- In-process interval pattern: `setInterval(...).unref()` (session cleanup at
  `server.js:3443`) — the scheduler uses the same shape
- `transaction()` helper (Phase 24) — for the transactional dedup write

### Established Patterns
- Notification rows are appended as part of a workspace-doc write; the
  revision bump is what pushes them to polling clients. Reminders must NOT
  idle-bump the revision (REM-01/SC-5) — a no-rows tick must be a pure read.
- Emails never block a response and never email the actor about their own
  action (P4-f) — applies to reminder sends
- Deep links resolve the task key at email-build time with a workspace-root
  fallback if the task vanished

### Integration Points
- Notification pipeline (`server.js:2609` post-write email flush) — reminder
  notification rows must reach the same per-recipient row structure and 30s
  client polling
- `src/pages/settings.js` notifications section — 3 new toggles
- Boot sequence (`server.js` startup, alongside migration/keyring passes) —
  boot catch-up runs missed windows once (REM-01); Phase 26's boot-time
  re-wrap pass shows the established boot-pass pattern

</code_context>

<specifics>
## Specific Ideas

- 09:00 was chosen explicitly over 08:00 and 17:00/09:00 splits — the user
  wants one consistent send hour, not differentiated per-offset times.
- 1-minute cadence chosen over hourly boundary-ticking: the user preferred
  near-instant delivery with cheap idle ticks over fragile exact-second
  scheduling.
- The past-due nudge deliberately fires the morning AFTER the due date (not
  the due-date morning, which is already covered by the morning-of reminder).

</specifics>

<deferred>
## Deferred Ideas

- Per-user timezone for reminders (per-user tz explicitly deferred by
  REM-02; workspace-shared tz only in this phase)
- Recurring tasks / recurring due dates (would change the dedup key shape) —
  not mentioned by the user, flagged only as a known future consideration

</deferred>

---

*Phase: 27-Due-Date Reminder Scheduler*
*Context gathered: 2026-11-01*
