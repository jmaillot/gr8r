# Roadmap: Projects Studio

## v1.5 — Reliability & Rotation

**Milestone goal:** the notification system becomes proactive and operationally closed — due-date
reminders fire from a server-side pass, notification emails land on the task, and the v1.4
operator/key-custody tech debt is paid down.

**Ground rules (owner-validated):** zero runtime dependencies; in-process `setInterval`
scheduler with boot catch-up; dedup keys persisted transactionally in SQLite; the boot
migration's version-aware filter MUST land before any `v2:` envelope exists.

**Build order (from research):** deep links → audit hardening → version-aware filter + keyring →
re-wrap rotation + runbook → reminder scheduler last (largest surface, consumes the finished
deep-link path).

## Phases

- [ ] **Phase 23: Email Deep Links & Creator Watching** - Every notification email links straight to the task, a logged-out click returns to that task after sign-in, and the task creator is auto-watched
- [ ] **Phase 24: Operator Audit & Workspace-Admin Tier** - Every operator/admin session revocation writes a same-transaction, append-only audit row, and workspace admins get their own revocation tier on the same audited path
- [ ] **Phase 25: Keyring & Version-Aware Envelopes** - The boot migration filter becomes version-aware before any v2 envelope exists, and TOTP secrets carry a self-describing key-version envelope decrypted through a keyring
- [ ] **Phase 26: Re-Wrap Rotation & Key-Custody Runbook** - MASTER_KEY rotates via an idempotent boot-time re-wrap pass with no 2FA re-enrollment, and DEPLOY.md documents the full custody runbook
- [ ] **Phase 27: Due-Date Reminder Scheduler** - A dependency-free server-side pass notifies assignees before/on due dates, restart-safe and exactly-once, honoring per-type prefs and email deep links

## Phase Details

### Phase 23: Email Deep Links & Creator Watching

**Goal**: A notification email is a door to the task, not the app root — and the people who should hear about a task's activity (including its creator) actually do
**Depends on**: Nothing (first phase of v1.5)
**Requirements**: LINK-01, LINK-02, LINK-03, LINK-04
**Success Criteria** (what must be TRUE):
  1. A user clicking a task link in any notification email (including one built outside a request, e.g. by a scheduler tick) lands directly on that task in the SPA, not the app root
  2. A logged-out user clicking a deep link lands on the sign-in page and, after signing in, returns to the exact task they clicked (path carried through, no open redirect)
  3. When a user creates a task and someone else comments on or updates it, the creator receives the notification like any watcher — and the creator is not duplicated when they are also the assignee
  4. Using the browser's back/forward buttons across SPA views returns to the previous view (popstate works); deep-link navigation and manual navigation stay consistent
  5. The `/w/:slug/file/:id` byte route still serves bytes (route ordering unchanged) — proven by test

**Plans**: 1/4 plans executed

Plans:
**Wave 1**
- [x] 23-01-PLAN.md — Tracer: deep link → task drawer with persisted URL; APP_URL email task links; not-found toast; file-route ordering regression test (LINK-01)
- [ ] 23-03-PLAN.md — Creator field + creator in watcher set, no self-notify (LINK-03)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 23-02-PLAN.md — Logged-out deep-link `?next=` carry and sign-in return (LINK-02)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 23-04-PLAN.md — go() pushState + popstate handler, back/forward e2e (LINK-04)

**UI hint**: yes

### Phase 24: Operator Audit & Workspace-Admin Tier

**Goal**: Every privileged session revocation — operator and workspace-admin — leaves a tamper-proof, owner-visible trail written in the same transaction as the action
**Depends on**: Nothing (independent of Phase 23)
**Requirements**: AUD-01, AUD-02, AUD-03
**Success Criteria** (what must be TRUE):
  1. An operator revoking sessions sees — and an owner later sees — an audit record with actor, action, target, session count, timestamp and IP
  2. A workspace admin can revoke the sessions of members of their own workspace (with owner immunity and self-exclusion), and that action produces the same audited record
  3. A failed or interrupted revocation leaves NO audit row and NO revoked sessions — the audit write rolls back with the revocation (same transaction)
  4. An owner can view the operator/admin action trail in the app, filtered by machine verbs, including actions against a user who has since been deleted (no cascade loss)
  5. No route in the app can edit or delete an audit row

**Plans**: TBD

### Phase 25: Keyring & Version-Aware Envelopes

**Goal**: The database can hold a `v2:` envelope without corrupting itself on boot, and secrets decrypt by key id through a keyring — the prerequisite that makes rotation possible
**Depends on**: Nothing (must land before any v2 envelope can exist — hard prerequisite for Phase 26)
**Requirements**: KEY-01, KEY-02
**Success Criteria** (what must be TRUE):
  1. A database containing `v2:` (or any `v<n>:`) envelope rows boots without re-wrapping, corrupting or treating them as plaintext — proven by test before any v2-writing code exists
  2. A TOTP secret written in the new `v2:<key-id>:…` envelope verifies successfully at login when the matching key is configured in the keyring (current + `MASTER_KEY_PREVIOUS`)
  3. When neither key can decrypt a secret, the existing fail-closed 503 `masterKeyMissing` behavior is unchanged — no plaintext fallback anywhere
  4. 2FA login, enrollment and disable flows behave exactly as before for existing `v1:` secrets (signature of `requireTotpSecret` unchanged)

**Plans**: TBD

### Phase 26: Re-Wrap Rotation & Key-Custody Runbook

**Goal**: An operator can rotate MASTER_KEY by setting an env var and rebooting — no 2FA re-enrollment — with a documented runbook for the whole custody lifecycle
**Depends on**: Phase 25 (keyring + version-aware filter)
**Requirements**: KEY-03, KEY-04
**Success Criteria** (what must be TRUE):
  1. With a new key and `MASTER_KEY_PREVIOUS` configured, one boot re-wraps every old-envelope secret to the new key id; users with 2FA enabled log in afterward without re-enrolling
  2. A second boot after rotation is a no-op (idempotent); zero stale envelopes remain after rotation — verified programmatically
  3. The pre-migration backup guarantee holds for the re-wrap pass (backup taken before any rewrite, transactional, rollback-safe)
  4. DEPLOY.md carries a runbook an operator can follow end-to-end: key generation/injection, adding the new key alongside the old, running rotation, verifying zero stale envelopes, backup-before-rotation, and the compromise policy (compromised key → honest full re-enrollment; rotation alone is not sufficient)

**Plans**: TBD

### Phase 27: Due-Date Reminder Scheduler

**Goal**: Assignees hear about approaching due dates from the server itself — exactly once per offset per due date, honoring prefs, restart-safe, without disturbing active clients
**Depends on**: Phase 23 (deep-link email path + APP_URL plumbing); independent of Phases 24–26
**Requirements**: REM-01, REM-02, REM-03, REM-04, REM-05
**Success Criteria** (what must be TRUE):
  1. A task due tomorrow (or today) generates a notification row for each assignee — delivered the day before and the morning of, per the workspace's shared timezone — and both reminder types are pref-selectable, ON by default
  2. A user who disables one or both reminder types in notifPrefs stops receiving those reminders; the `email_reminder` gate controls the email copy, which links straight to the task
  3. Restarting the server (deploy, crash) never double-sends: each (task, assignee, offset, due date) reminder fires exactly once, with the dedup key persisted transactionally in SQLite before the notification
  4. Completed and archived tasks never receive reminders; an overdue task receives exactly one "past due" nudge, also deduped; changing a due date re-arms its reminders via the key
  5. Idle scheduler ticks never bump the workspace revision — active clients see no 409 storms; an interval-callback failure cannot kill the process

**Plans**: TBD

## Coverage

| Requirement | Phase |
|-------------|-------|
| LINK-01, LINK-02, LINK-03, LINK-04 | Phase 23 |
| AUD-01, AUD-02, AUD-03 | Phase 24 |
| KEY-01, KEY-02 | Phase 25 |
| KEY-03, KEY-04 | Phase 26 |
| REM-01, REM-02, REM-03, REM-04, REM-05 | Phase 27 |

16/16 v1.5 requirements mapped — no orphans, no duplicates.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 23. Email Deep Links & Creator Watching | 1/4 | In Progress|  |
| 24. Operator Audit & Workspace-Admin Tier | 0/? | Not started | - |
| 25. Keyring & Version-Aware Envelopes | 0/? | Not started | - |
| 26. Re-Wrap Rotation & Key-Custody Runbook | 0/? | Not started | - |
| 27. Due-Date Reminder Scheduler | 0/? | Not started | - |
