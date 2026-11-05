# Requirements: v1.8 Notification Sanity

**Milestone:** v1.8 — Notification Sanity
**Status:** Defined 2026-11-04 (roadmap pending)
**Source:** Kanzo #6 client feedback ("too many notifications", un-localized reminder emails, digest suggestion) + ecosystem research (Todoist/Asana/Workfront/ServiceNow, see `.planning/research/`)
**Constraints (standing):** zero runtime dependencies; additive-only migrations with byte-identical second boot; full suite green; EN+FR i18n gate.

## v1.8 Requirements

### Reminder Cadence (REM)

- [x] **REM-01**: When a task reaches its due date, its assignee receives at most two due-date
  notifications total: one "due today" reminder (the morning of the due date) and one "past due"
  alert (the following morning) — the day-before reminder no longer fires, on any channel
  (email, push, inbox).
- [x] **REM-02**: The `due_reminder` preference governs only the "due today" reminder (its key
  and settings toggle stay, copy updated in EN+FR); the `past_due` preference is unchanged.
- [x] **REM-03**: A past-due task never re-fires "past due" on later days — exactly one past-due
  notification per task per assignee, protected by a regression pin.
- [x] **REM-04**: Removing `day_before` is deploy-safe: no dedup-row sweep or data migration;
  existing `reminders_sent` rows remain untouched (orphaned keys go inert); release notes
  announce the one-time "due today" catch-up burst at first deploy.

### Notification Localization (I18N)

- [x] **I18N-01**: Every server-emitted notification text — email subjects and bodies, push
  text, inbox snippets — is rendered in the recipient's account locale (EN or FR), with English
  fallback; the locale comes from the user record through the existing authority/membership
  queries.
- [x] **I18N-02**: The server renders text through an additive locale-parameterized translation
  function in the shared i18n module (no per-send global locale mutation); the client and server
  share the same EN/FR catalogue files (no forked server copy, no Dockerfile change).
- [x] **I18N-03**: Reminder notification rows store a machine key, not English prose; the client
  localizes keyed rows at render time and still renders legacy prose rows (additive, no
  migration).
- [x] **I18N-04**: The i18n build gate (scan or regression test) covers the server-used key set,
  so a missing FR key or a drifted English literal in server notification text fails the build;
  every locale render is guarded against `Intl` failures with English fallback.

### Daily Digest (DIGEST)

- [x] **DIGEST-01**: An opt-in daily digest email, sent at 09:00 workspace-local time, lists the
  recipient's tasks due today and overdue tasks (each deep-linked), localized per recipient;
  when there is nothing due or overdue, no email is sent.
- [x] **DIGEST-02**: The digest reads tasks directly (not reminder notification rows) and claims
  its send transactionally (dedup ledger) so it is idempotent across restarts; a digest send is
  type-scoped to replace reminder emails only — mentions, assignments and comment emails flow
  unchanged while the digest is enabled; push and inbox notifications are never suppressed.
- [x] **DIGEST-03**: The `email_digest` preference becomes a real opt-in: it is removed from the
  default layer (undefined-falsy = off), so no user receives digests without explicitly enabling
  it; settings UI gains the toggle with "digest replaces reminder emails" copy in EN+FR.

### Notification Audit (AUDIT)

- [x] **AUDIT-01**: An audit document reviews every notification type × channel × default
  (mentions, assignments, comments, reminders, digest) with trim recommendations and an explicit
  RFC 8058 `List-Unsubscribe` decision for the digest.
- [x] **AUDIT-02**: Every threshold/default change recommended by the audit is validated by the
  owner BEFORE any code implements it; the audit itself ships as documentation only (no behavior
  change in this milestone without validation).

## Future Requirements (deferred)

- Per-task custom reminder offsets (the anti-feature causing the noise being fixed) — not
  scheduled.
- Digest content beyond due-today/overdue (mentions, activity, comments in the digest) — needs
  AUDIT-01 validation first.
- "Digest AND individual emails" mode (Asana's "both") — more email, not less; rejected unless
  the audit makes a validated case.
- Unsubscribe headers beyond the RFC 8058 decision recorded in AUDIT-01 — follow-up milestone.
- New languages / machine translation / workspace-locale or Accept-Language axis — out of scope
  since v1.2; per-recipient account locale is the only supported axis.

## Out of Scope

- Any data migration or dedup-row cleanup for the removed `day_before` offset.
- Changing mention/assign/comment notification behavior (that is the AUDIT's input, not this
  milestone's code).
- Push-notification channels beyond the existing in-app/poll mechanism (no FCM/APNs work).
- Localizing anything outside notifications (emails like invitations keep current behavior).

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| I18N-01 | Phase 36 | Complete |
| I18N-02 | Phase 36 | Complete |
| I18N-03 | Phase 36 | Complete |
| I18N-04 | Phase 36 | Complete |
| REM-01 | Phase 37 | Complete |
| REM-02 | Phase 37 | Complete |
| REM-03 | Phase 37 | Complete |
| REM-04 | Phase 37 | Complete |
| DIGEST-01 | Phase 38 | Complete |
| DIGEST-02 | Phase 38 | Complete |
| DIGEST-03 | Phase 38 | Complete |
| AUDIT-01 | Phase 39 | Complete |
| AUDIT-02 | Phase 39 | Complete |

Coverage: 13/13 v1.8 requirements mapped — no orphans, no duplicates.
