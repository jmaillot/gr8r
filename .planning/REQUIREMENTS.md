# Requirements: Projects Studio — v1.9

**Defined:** 2026-11-05
**Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state
**Source:** Kanzo threads (Backlog 999.1 + Phase 39 RFC 8058 decision), domain research (`.planning/research/SUMMARY.md`).

## v1.9 Requirements

### SUBJ — Digest context (Backlog 999.1, deferred from Phase 37 UAT Test 2)

- [ ] **SUBJ-01**: A digest user receives one digest email per workspace, with the Workspace
  name in the subject (2 emails if in two workspaces); the existing per-(workspace, user)
  ledger claim key stays byte-identical — no double sends on deploy day
- [ ] **SUBJ-02**: Each task line in the digest reads "Project Name — Task Name"; degrades to
  task-name-only when the project is unknown or invisible to the recipient (names resolved
  through the single `hiddenFor`/`memberCanReadProject` funnel — no CR-01-class leak)
- [x] **SUBJ-03**: User-controlled names in email headers (Subject) are CRLF-stripped and
  RFC 2047-encoded through one tested builder — no SMTP header injection, no mojibake in FR

### UNSUB — RFC 8058 one-click unsubscribe (Phase 39 audit decision)

- [ ] **UNSUB-01**: Digest emails carry `List-Unsubscribe` + `List-Unsubscribe-Post:
  List-Unsubscribe=One-Click` headers built on a stateless HMAC token over (wsId, userId)
  under the MASTER_KEY keyring (domain-separated, timing-safe compare); headers omitted when
  MASTER_KEY is absent; the DKIM caveat (RFC 8058 §4 — relay-signed) documented in DEPLOY.md
- [ ] **UNSUB-02**: `POST /unsubscribe/:token` — anonymous, throttled, sameOrigin-exempt
  (the unguessable token is the CSRF defence), convergent/replay-safe with identical generic
  responses (no existence oracle), GET on the token URL a stateless no-op — flips
  `email_digest=false` for that (workspace, user) prefs row only; individual reminder
  emails then resume per Phase 38 suppression semantics
- [ ] **UNSUB-03**: The plain footer unsubscribe link stays alongside one-click; the settings
  digest pref stays the re-subscribe path

### Cross-cutting invariants (standing constraints, pinned per phase)

- Phase 38 suppression invariant and second-boot/no-duplicate digest tests pass unmodified
- All new user-facing strings catalogued EN+FR (i18n-scan gate green, server keys included)
- Zero runtime dependencies, zero migrations, full suite green

## Future Requirements

*(Per-task reminder offsets, digest content beyond due-today/overdue, and other Phase 39
audit recommendations stay `proposed` pending D-05 owner rulings — they join a future
milestone only when validated.)*

## Out of Scope

| Feature | Reason |
|---------|--------|
| In-repo DKIM signing | Phase 39 deferral holds — instances DKIM-sign at their SMTP relay; documented caveat instead |
| One-click unsubscribe on per-type notification emails (mention, assign…) | Digest first; per-type headers are a separate audit decision |
| Confirmation/landing page after one-click POST | RFC 8058 forbids redirects on the POST path; bare 2xx |
| Global kill-switch unsubscribe tokens | Per-(workspace, user) granularity only |
| Other Phase 39 trim recommendations (per-task offsets, digest content growth) | `proposed` pending D-05 owner validation |
| Combined single-email digest with workspace sections | Owner-validated shape is per-workspace emails ("2 notifications if in two workspaces") |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUBJ-01 | Phase 40 | Pending |
| SUBJ-02 | Phase 40 | Pending |
| SUBJ-03 | Phase 40 | Complete |
| UNSUB-01 | Phase 41 | Pending |
| UNSUB-02 | Phase 42 | Pending |
| UNSUB-03 | Phase 41 | Pending |

**Coverage:**
- v1.9 requirements: 6 total
- Mapped to phases: 6 ✓
- Unmapped: 0

---
*Requirements defined: 2026-11-05*
*Last updated: 2026-11-05 after initial definition*
