# Requirements — Milestone v1.5 Reliability & Rotation

Derived from `.planning/research/` (STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY — HIGH
confidence, zero-dependency verified) and the owner's scoping decisions. Builds on the v1.4
notification backbone (P4-a…f: per-recipient rows, notifyMembers, email fan-out post-PUT) and
the operator revocation surface.

**Ground-truth anchors (research-verified):** the SPA already resolves `/w/:slug/task/:key`
(`applyDeepLink`, src/main.js:123) — deep links are mostly a server-side email-URL change;
the boot migration filter `not like 'v1:%'` (server.js:1114) is version-unaware and MUST be
fixed before any `v2:` envelope exists; notification emails need `APP_URL` when built outside
a request (scheduler tick); reminders must write the dedup key transactionally BEFORE the
notification (restart-safe, exactly-once per offset per due date).

**Scheduling constraint (owner-validated):** zero runtime dependencies — the scheduler is an
in-process `setInterval` pass with boot catch-up, no cron/redis.

## v1.5 Requirements

### Due-Date Reminders (REM)

- [ ] **REM-01**: A server-side scheduled pass runs in-process (no external cron) and notifies
  task assignees of approaching due dates via notification rows + optional email; the pass is
  restart-safe (boot catch-up runs missed windows once) and never writes a workspace-doc
  revision unless it has rows to add (no 409 storms on idle ticks)
- [ ] **REM-02**: Reminder timings are "day before" and "morning of" due date — both
  pref-selectable in notifPrefs, both ON by default; due dates are computed per the
  workspace's shared timezone setting (per-user tz explicitly deferred)
- [ ] **REM-03**: Exactly one reminder per (task, assignee, offset, due date) is ever sent —
  the dedup key is written in SQLite transactionally before the notification, so process
  restarts and repeated ticks cannot double-send; changing a due date re-arms its reminders
  naturally via the key
- [ ] **REM-04**: Completed or archived tasks are never reminded; an overdue task gets
  exactly one "past due" nudge (send-one-or-nothing), also deduped
- [ ] **REM-05**: Reminder emails honor a dedicated `email_reminder` prefs gate and link
  straight to the task (deep link); reminders respect the same prefs surface as other
  notification types

### Email Deep Links & Creator Watching (LINK)

- [x] **LINK-01**: Every notification email links directly to the task
  (`/w/:slug/task/:key`), not the app root; URLs built outside a request (scheduler ticks)
  use APP_URL with a boot-time guard/warning, matching the existing invite-email guard
- [ ] **LINK-02**: A logged-out click on a deep link lands on the sign-in page and returns to
  the exact task after sign-in (path carried through, not just the slug)
- [ ] **LINK-03**: The task's creator is added to the watcher set at creation (dedup with the
  assignee) and receives comment/update notifications like any watcher
- [ ] **LINK-04**: Browser back/forward buttons work across SPA views (popstate handler) —
  deep-link routing and manual navigation stay consistent

### MASTER_KEY Rotation (KEY)

- [ ] **KEY-01**: The boot migration filter is version-aware — an existing `v2:` (or any
  `v<n>:`) envelope is never re-wrapped or treated as plaintext; proven by test before any
  v2 envelope can exist
- [ ] **KEY-02**: TOTP secrets support a self-describing key-version envelope
  (`v2:<key-id>:…`); decrypt resolves the key by id through a keyring (current +
  `MASTER_KEY_PREVIOUS`) via `requireTotpSecret` with its fail-closed contract unchanged —
  no plaintext fallback anywhere
- [ ] **KEY-03**: Rotation is a boot-time re-wrap pass (idempotent, transactional, with the
  pre-migration backup guarantee): with the new key set and the old key still configured,
  every old-envelope secret is re-wrapped to the new key id; a second boot is a no-op;
  rotation never requires 2FA re-enrollment
- [ ] **KEY-04**: DEPLOY.md carries a key-custody runbook covering: key generation and
  injection, adding the new key alongside the old, running rotation, verifying zero stale
  envelopes, backup-before-rotation, and the compromise policy (compromised key → honest
  full re-enrollment, rotation alone is not sufficient)

### Operator Audit & Admin Tier (AUD)

- [ ] **AUD-01**: Every operator session revocation writes an append-only audit row (actor,
  action, target, session count revoked, timestamp, IP) in the SAME transaction as the
  revocation; audit rows are never editable or deletable through the app
- [ ] **AUD-02**: A workspace admin can revoke the sessions of members of their own
  workspace (below the operator tier, with the same owner-immunity and self-exclusion
  semantics), and every such action rides the same audited path
- [ ] **AUD-03**: Owners can see the operator/admin action trail (filtered machine verbs) in
  the app; audit rows survive the deletion of the target user (no cascade loss)

## Future Requirements (deferred)

- Watcher reminders (remind all watchers, not just assignees)
- Digest emails (daily summary instead of per-task emails)
- Per-user timezone for "morning of" delivery
- Custom per-task reminder offsets
- Push/Slack delivery channels
- Cryptographic audit-log chaining (hash-chain)
- Per-user + revoke-all operator route shapes (kept from v1.4 deferred list)
- Membership-surface hardening items (carried in PROJECT.md Active)

## Out of Scope (explicit exclusions)

- **Re-encrypt with a new algorithm namespace** — envelope `v1:`→`v2:` re-wrap achieves
  rotation; algorithm changes would be a future `v3:`, not this milestone
- **Cron/redis/queue infrastructure** — zero-dependency constraint; in-process pass only
- **Editable audit entries** — contradicts the audit property; corrections are new entries
- **Reminder spam to non-assignees** — reminders target assignees only at v1.5

## Traceability

| REQ | Phase | Status |
|-----|-------|--------|
| LINK-01 | Phase 23 | Complete |
| LINK-02 | Phase 23 | Pending |
| LINK-03 | Phase 23 | Pending |
| LINK-04 | Phase 23 | Pending |
| AUD-01 | Phase 24 | Pending |
| AUD-02 | Phase 24 | Pending |
| AUD-03 | Phase 24 | Pending |
| KEY-01 | Phase 25 | Pending |
| KEY-02 | Phase 25 | Pending |
| KEY-03 | Phase 26 | Pending |
| KEY-04 | Phase 26 | Pending |
| REM-01 | Phase 27 | Pending |
| REM-02 | Phase 27 | Pending |
| REM-03 | Phase 27 | Pending |
| REM-04 | Phase 27 | Pending |
| REM-05 | Phase 27 | Pending |
