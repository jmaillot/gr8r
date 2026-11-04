# Roadmap: gr8r

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2025-11-27)
- ✅ **v1.1 Security** — Phases 10-15 (shipped 2026-01)
- ✅ **v1.2 Authentication (SSO/OIDC)** — Phases 16-20 (shipped 2026-03)
- ✅ **v1.3 Invitations & Onboarding** — Phases 21-24 (shipped 2026-05)
- ✅ **v1.4 Admin Experience** — Phases 25-27 (shipped 2026-06)
- ✅ **v1.5 Integrations & Email** — Phases 28-30 (shipped 2026-09)
- ✅ **v1.6 Membership Refinement** — Phase 31 (shipped 2026-11-02)
- ✅ **v1.7 Team Visibility & Hardening** — Phases 32-35 (shipped 2026-11-04)
- 🚧 **v1.8 Notification Sanity** — Phases 36-39

## Phases

<details>
<summary>✅ v1.7 Team Visibility & Hardening (Phases 32-35) — SHIPPED 2026-11-04</summary>

- [x] Phase 32: Team-Derived Project Visibility (1/1 plan) — completed 2026-11-03
- [x] Phase 33: Membership-Surface Hardening (2/2 plans) — completed 2026-11-03
- [x] Phase 34: Per-User Settings Isolation & Search-Leak Closure (6/6 plans) — completed 2026-11-03
- [x] Phase 35: Honest Undo & Deploy Gap (3/3 plans) — completed 2026-11-04

Details: [.planning/milestones/v1.7-ROADMAP.md](milestones/v1.7-ROADMAP.md)

</details>

### v1.8 Notification Sanity (Phases 36-39)

- [ ] **Phase 36: Server Notification i18n** - Every server-emitted notification renders in the recipient's locale through a shared EN/FR catalogue, with a build gate against drift
- [ ] **Phase 37: Reminder Cadence Rework** - Due-date reminders capped at two per task ("due today" + one "past due"); `day_before` removed deploy-safely
- [ ] **Phase 38: Daily Digest & Reminder Suppression** - Opt-in 09:00 digest email replaces individual reminder emails when enabled; silent when nothing is due
- [ ] **Phase 39: Notification Audit (doc-only)** - Full notification type × channel × default audit with trim recommendations, owner-validated before any coding

## Phase Details

### Phase 36: Server Notification i18n
**Goal**: Every server-emitted notification text — email subjects and bodies, push text, inbox snippets — is rendered in the recipient's account locale (EN or FR) with English fallback, through a shared translation layer that cannot drift.
**Depends on**: Nothing (first phase; leaf infrastructure for Phases 37-38)
**Requirements**: I18N-01, I18N-02, I18N-03, I18N-04
**Success Criteria** (what must be TRUE):
  1. A French-locale recipient receives reminder emails (subject and body) in French; an English-locale recipient on the same workspace receives them in English — no global locale mutation, both in the same test run.
  2. The server renders all notification text through a locale-parameterized function in the shared i18n module, importing the same EN/FR catalogue files the client uses — no forked server copy, no Dockerfile change.
  3. New reminder notification rows store machine keys; the inbox renders them localized per the viewing user's locale, and legacy prose rows still render unchanged.
  4. A missing FR key or a drifted English literal in server notification text fails the build (scan or regression test covering the server-used key set).
  5. A locale render that would throw (malformed locale, `Intl` failure) falls back to English instead of killing the notification.
**Plans**: TBD

### Phase 37: Reminder Cadence Rework
**Goal**: Due-date reminders drop to their honest minimum — at most two per task per assignee ("due today" morning-of, "past due" once the following morning) — with the `day_before` offset removed deploy-safely.
**Depends on**: Phase 36 (reminder notif rows store machine keys rendered through the i18n layer)
**Requirements**: REM-01, REM-02, REM-03, REM-04
**Success Criteria** (what must be TRUE):
  1. A task reaching its due date produces exactly one "due today" notification (the morning of) and one "past due" notification (the next morning) — and nothing else, on email, push and inbox alike.
  2. A past-due task never re-fires on later days — exactly one past-due notification per task per assignee, protected by a regression pin.
  3. The `due_reminder` preference toggles only the "due today" reminder; the `past_due` preference is unchanged; settings copy is updated in EN+FR.
  4. Deploying the change requires no migration and no dedup-row sweep: existing `reminders_sent` rows stay untouched (orphaned `day_before` keys go inert), and the second boot is byte-identical.
  5. Release notes document the one-time "due today" catch-up burst at first deploy.
**Plans**: TBD
**UI hint**: yes

### Phase 38: Daily Digest & Reminder Suppression
**Goal**: Users can opt into a single daily digest email (09:00 workspace-local) listing tasks due today and overdue, which replaces individual reminder emails when enabled — mentions, assignments and comment emails flow unchanged.
**Depends on**: Phases 36-37 (localized frames; digest lists the post-REM surviving offsets)
**Requirements**: DIGEST-01, DIGEST-02, DIGEST-03
**Success Criteria** (what must be TRUE):
  1. An opted-in user receives at 09:00 workspace-local one localized email listing their due-today and overdue tasks, each deep-linked to the task; a user with nothing due or overdue receives no email.
  2. A digest send is idempotent across restarts (transactional claim in the dedup ledger) — a server restart never loses the day's digest or double-sends it.
  3. With the digest enabled, individual reminder emails stop but mention, assignment and comment emails still arrive immediately; push and inbox notifications are never suppressed.
  4. No user receives a digest without explicitly enabling it: the `email_digest` pref is undefined-falsy by default, the settings toggle works, and its "digest replaces reminder emails" copy is catalogued in EN+FR.
**Plans**: TBD
**UI hint**: yes

### Phase 39: Notification Audit (doc-only)
**Goal**: The owner receives a complete notification audit — every type × channel × default with trim recommendations — and every threshold/default change it recommends is validated by the owner BEFORE any code implements it. The audit itself changes no behavior.
**Depends on**: Phases 36-38 (audits the post-rework reality; runs as a doc that gates further edits)
**Requirements**: AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):
  1. An audit document exists covering every notification type (mention, assign, comment, reminder, digest) × channel (email, push/inbox) × default, with a trim recommendation per row.
  2. The audit records an explicit decision on RFC 8058 `List-Unsubscribe` for the digest email.
  3. No threshold or default change from the audit is coded in this milestone without recorded owner validation; the audit ships as documentation only.
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 36. Server Notification i18n | 0/? | Not started | - |
| 37. Reminder Cadence Rework | 0/? | Not started | - |
| 38. Daily Digest & Reminder Suppression | 0/? | Not started | - |
| 39. Notification Audit (doc-only) | 0/? | Not started | - |

## Backlog

*(Empty — candidates from the Phase 39 audit (per-task offsets, digest content beyond due-today/overdue, RFC 8058 unsubscribe headers) land here only if the owner validates them.)*
