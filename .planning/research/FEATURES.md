# Feature Research

**Domain:** Self-hosted PM workspace (Asana/Linear/Todoist class) — v1.5 "Reliability & Rotation" features
**Researched:** 2026-10-30
**Confidence:** HIGH for reminder/email/audit behavior (well-documented competitor behavior + audit-logging standards); MEDIUM for key-rotation runbook specifics (pattern is standard envelope-encryption practice, but few PM tools expose it publicly — grounded in AWS KMS/envelope-encryption references)

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Reminder on due date itself ("due today") | Asana's core notification is "tasks due today" email/digest; Linear notifies the assignee on the due date morning. A tool with due dates but no reminder feels broken. | LOW | Server pass once/day (or every 30–60 min picking up "today" in each user's tz). Reuses notifyMembers pattern + notification rows. |
| Reminder the day before due | Todoist's default relative reminders and Asana Rules ("X days before due date") make "1 day before" the single most-expected pre-due timing. | LOW | Same pass, second offset. Offset stored as a `reminders` pref (`['day_before','morning_of']`). |
| Per-user reminder prefs (opt-out / choose timings) | All three competitors gate reminders behind notification settings; nobody force-sends them. Matches existing `notifPrefs` surface. | LOW | Extend `notifPrefs` with a `reminders` key; new email type `email_reminder` gated like `email_mention`. |
| Dedup: one reminder per (task, user, offset) | Users expect exactly one "due tomorrow" reminder even if the server restarts or the pass runs twice. Restart-of-day re-sends are the #1 annoyance reported in Asana forums. | MEDIUM | Store a `reminders_sent`/dedup key (`task_id,user_id,offset,due_date`) before sending, in the same transaction as the notification row. Crash-safe: key written atomically, email fire-and-forget after. |
| Don't remind completed or overdue-snoozed tasks | Linear/Asana stop reminders on completion instantly; reminding about a done task is a trust-breaking bug. | LOW | Filter `done`/`archived` tasks in the pass. Overdue tasks: send one "past due" nudge (Linear does) or nothing (safer MVP) — decide explicitly. |
| Reschedule on due-date change | If the due date moves, the "day before" reminder moves with it. Dedup key includes `due_date`, so a changed date naturally re-arms. | LOW | Falls out of the dedup-key design; document it. |
| Email links straight to the task (deep link) | Every competitor email links to the object, not the app root. "Click → see the thing" is the entire point of the email. | LOW | URL shape `/w/:slug/task/:id` (matches existing SPA routes). Requires route + login-redirect-with-`next` for logged-out clicks (the Phase 12 file-route pattern already proves this pattern). |
| Task creator auto-watches the task | Linear and Asana auto-subscribe the author. Gr8r watchers = assignee + prior commenters, so a creator who never comments never hears about activity — a known gap. | LOW | On task creation, add creator to watcher set (dedup with assignee). |
| Operator actions leave an audit trail | Audit standards (Sonar, Mattermost, Contentful guidance): every privileged action — session revocation, role change, key operation — is recorded append-only with who/when/target. Gr8r already has `security_log` for auth events; extending it to operator revocations is table stakes for the "operator" claim. | MEDIUM | New rows in `security_log` (or an `audit_log` table): actor, action, target user, session count revoked, timestamp, IP. Append-only; never editable through the app. |
| Rotation without re-enrollment | Users (workspace owners) expect that changing the server's master key does NOT invalidate every member's 2FA. AWS KMS ReEncrypt is the canonical pattern: decrypt-with-old, encrypt-with-new, per envelope, transactionally. | MEDIUM | Key-version envelope `v2:<key_id>:…`; boot decrypt tries key by id, falls back through known keys. Rotation = re-wrap pass writing v2 envelopes + marking old key retired. |
| Runbook for key custody | Self-hosted operators get no support desk; DEPLOY.md is their runbook. Must cover: generate key, inject, rotate, verify, recover. | LOW (doc) | See runbook checklist under MVP. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dependency-free scheduler | Asana/Linear need infrastructure; a self-hosted single-image app with an in-process scheduler (setInterval-style pass, no cron/redis) is genuinely rare and matches the zero-dependency constraint. | LOW | Catch-up-on-boot (run missed windows once) is the one non-obvious part; persist last-run marker in DB. |
| Public, documented key-rotation procedure | Even most self-hosted tools (e.g. older Vaultless setups) require re-enrollment on key change. Re-wrap rotation + a written runbook is a real operational differentiator. | MEDIUM | Also earns trust: fail-closed decrypt stays intact; rotation is additive. |
| Operator audit surface visible to workspace owners | Competitors bury audit logs in enterprise tiers. Showing owner-visible "operator revoked N sessions" entries is a small UI with outsized trust value. | LOW–MEDIUM | Reuse activity-log UI patterns; filter by machine verbs (per v1.2 decision ACT-01). |
| Timezone-aware reminder delivery | Linear delivers "morning of" in the *user's* timezone. Doing this correctly (per-user offset vs per-workspace `tz`) is a quiet quality signal. | MEDIUM | Simplest honest version: compute "due date" per the task's workspace dateFmt/tz (existing shared setting), state the limitation in docs. Per-user tz can wait. |
| Batched digest option | Asana sends a daily digest of due tasks instead of N emails. A digest toggle in prefs prevents inbox flooding for users with many tasks. | MEDIUM | Later; single emails per reminder are fine at MVP scale. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Arbitrary N custom reminder offsets ("remind me 3 days, 2 hours, 17 min before") | Todoist offers it per task | Per-task reminder scheduling means per-task timer state, catch-up complexity, and i18n of arbitrary offsets — huge surface for marginal value. | Fixed, pref-level offsets (day-before / morning-of). Covers ~all real usage. |
| Reminding non-assignees / whole team | "Everyone should know" | Reminder spam; duplicates the notification system's job and the existing watcher semantics. | Reminders target assignees (+ watchers as a v1.x option); activity/notifications already cover the rest. |
| Editable/deletable audit entries (an "admin cleanup" feature) | Ops want to remove mistakes | Destroys the audit property; audit logs must be append-only and immutable (Sonar/Mattermost guidance). | Wrong entries are corrected by a new entry, not deletion. |
| Re-encrypt-on-rotation of TOTP secrets with a brand-new algorithm namespace | "Might as well modernize" | Re-enrollment risk, test churn, no user-visible value; envelope format `v1:` → `v2:` re-wrap already achieves rotation. | Key-version re-wrap only; algorithm changes get a future `v3:` envelope, not this milestone. |
| Email reminders for every notification type | "Email me everything" | Inbox flooding is the top complaint driving users to disable email entirely; competitors keep email high-signal. | Email stays prefs-gated per type (existing `email_*` keys); reminders get their own toggle. |

## Feature Dependencies

```
[Server-side scheduler pass]
    └──requires──> [Dedup store (reminders_sent keys)]
    └──requires──> [Reminder prefs in notifPrefs]
    └──requires──> [Email pipeline (exists, post-PUT fire-and-forget)]

[Deep-linked emails]
    └──requires──> [Task URL scheme /w/:slug/task/:id]
    └──requires──> [Logged-out login-redirect with `next` (pattern exists from Phase 12 file route)]
    └──enhances──> [Due-date reminders]  (reminder emails benefit from the same deep link)

[Creator watcher]
    └──requires──> [Watcher set (exists: assignee + prior commenters)]

[MASTER_KEY rotation]
    └──requires──> [v1: envelope (exists) → v2:<key-id> envelope versioning]
    └──requires──> [Runbook in DEPLOY.md]

[Operator audit trail]
    └──requires──> [security_log table (exists)]
    └──enhances──> [Operator session revocation (exists, v1.4)]
```

### Dependency Notes

- **Reminders require dedup + prefs first**: build the dedup key and the pref gate before the pass, or the first server restart after launch spams every user. This ordering is the milestone's main internal dependency.
- **Deep links enhance reminders, not block them**: reminder emails could ship with root links and be upgraded, but shipping both together costs almost nothing since the URL scheme is one function.
- **Rotation conflicts with nothing** but must preserve the fail-closed decrypt boundary (`requireTotpSecret()`): the boundary stays, only the key-selection logic behind it gains version awareness.
- **Audit trail enhances operator revocation**: the v1.4 revocation endpoint is the first writer; workspace-admin revocation tier (also in v1.5 scope) becomes the second, which is why the audit writer should be a shared helper, not inline code.

## MVP Definition

### Launch With (v1.5)

- [ ] Scheduler pass: once-daily (with boot catch-up) pass over tasks with due dates; notifies assignees per pref — the milestone's core "proactive" promise
- [ ] Reminder timings: **day-before + morning-of, both pref-selectable, default both on** — this pair is the table-stakes answer to "what timing options are table stakes"
- [ ] Dedup key `(task, user, offset, due_date)` written transactionally before notification — the table-stakes dedup guarantee is exactly one reminder per offset per due date
- [ ] Reminder prefs + `email_reminder` gate in the existing notifPrefs surface
- [ ] Deep-linked notification emails: `/w/:slug/task/:id`, login-redirect with `next` for logged-out clicks
- [ ] Creator added to watcher set on task creation
- [ ] `v2:<key-id>` envelope + re-wrap rotation command/boot behavior; DEPLOY.md runbook covering: (1) how MASTER_KEY is generated and injected, (2) adding the new key alongside the old, (3) running rotation, (4) verifying zero stale envelopes + tests green, (5) what to do if the old key is compromised (full re-enrollment is the honest answer), (6) backup-before-rotation (mirror of the migration-backup pattern)
- [ ] Audit rows on operator session revocation (actor, target, session count, timestamp) via a shared `auditOperatorAction()` helper; visible to owners

### Add After Validation (v1.6+)

- [ ] Watcher reminders (not just assignees) — trigger: user requests
- [ ] "Past due" nudges — trigger: users complain about silent overdue tasks
- [ ] Digest emails instead of per-task emails — trigger: inbox-volume complaints
- [ ] Workspace-admin revocation tier emitting the same audit rows (in v1.5 scope list but sequenced after the audit helper exists)
- [ ] Per-user timezone for "morning of" — trigger: multi-timezone workspaces

### Future Consideration (v2+)

- [ ] Custom per-task reminders — why defer: timer-state complexity, low demand
- [ ] Push/Slack delivery channels — why defer: no runtime deps constraint
- [ ] Cryptographic audit-log chaining (hash-chain per entry) — why defer: self-hosted trust model makes tamper-evidence via file/DB backups adequate

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Scheduler pass + day-before/morning-of reminders | HIGH | MEDIUM | P1 |
| Reminder dedup (transactional sent-keys) | HIGH | LOW | P1 |
| Reminder prefs + email gate | HIGH | LOW | P1 |
| Deep-linked emails + login-redirect | HIGH | LOW | P1 |
| Creator auto-watch | MEDIUM | LOW | P1 |
| MASTER_KEY v2 envelope + rotation | MEDIUM (ops) | MEDIUM | P1 |
| DEPLOY.md key-custody runbook | MEDIUM (ops) | LOW | P1 |
| Operator audit trail + owner visibility | MEDIUM | MEDIUM | P2 |
| Workspace-admin revocation tier (audited) | MEDIUM | MEDIUM | P2 |
| Past-due nudges / digest / watcher reminders | LOW–MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Asana | Linear | Todoist | Our Approach |
|---------|-------|--------|---------|--------------|
| Pre-due reminders | No native pre-reminder; Rules workarounds ("approaching due date") + "tasks due today" email | Due-date reminders: assignee notified around due date; due dates can have times | Per-task relative ("30 min before") or fixed-time reminders, premium-tier | Pref-level fixed offsets (day-before + morning-of); no per-task scheduling |
| Reminder prefs | Granular notification settings incl. email digest | Per-channel notification settings | Per-reminder toggles | Extend existing `notifPrefs`; reminders as a new gated type |
| Dedup | Skips redundant notifications (documented complaint when it fails) | "Redundant notifications are skipped" (e.g. duplicate view-add) — explicit dedup philosophy | N/A (local reminders) | Transactional dedup key per (task, user, offset, due date) |
| Email deep links | Emails link to the task | Emails/Slack link to the issue | Emails link to the task | `/w/:slug/task/:id` + login-redirect `next` |
| Creator watching | Author auto-follows task | Author auto-subscribed | — | Creator joins watcher set at creation |
| Key rotation | N/A (SaaS) | N/A (SaaS) | N/A (SaaS) | Differentiator: re-wrap rotation, no re-enrollment, public runbook |
| Audit trail | Enterprise tier | Admin API, limited | No | Differentiator at this price point: owner-visible append-only operator log built on `security_log` |

## Sources

- Asana forum: "Reminder Alert Before Due Date" (forum.asana.com/t/3794), "How can I automatically be reminded about past due dates?" (/t/101405), "Reminder Notifications for Due Dates set with Specific Times" (/t/1041429) — confirms no native pre-due reminder, "due today" email is the built-in
- Linear docs/changelog: Issue properties (linear.app/docs/issue-properties-home), "Redundant notifications are skipped" changelog entry — dedup philosophy, due-date reminder behavior
- Todoist help: "Add an urgent reminder in Todoist" — relative vs fixed reminder model
- AWS KMS ReEncrypt / EKS envelope-encryption docs; qcecuring.com key-rotation strategies — re-wrap rotation pattern
- Sonar (audit-logging), Mattermost (18 tips tamper-proof audit logs), Contentful (essential audit logs) — append-only, event-context, separate-from-app-logs guidance
- Gr8r PROJECT.md — existing systems: notifyMembers, notifPrefs, security_log, v1: envelopes, requireTotpSecret boundary, Phase-12 login-redirect pattern

---
*Feature research for: Projects Studio v1.5 — Reliability & Rotation*
*Researched: 2026-10-30*
