# Requirements: Gr8r Studio — Milestone v1.2 Localization

**Defined:** 2026-10-22
**Core Value:** A calm, self-hosted workspace for teams, where a workspace is a real tenant and
the server is the only boundary that counts.
**Milestone:** v1.2 — Localization
**Research:** `.planning/research/SUMMARY.md` (stack, features, architecture, pitfalls)

## v1.2 Requirements

### Internationalisation

- [ ] **I18N-01**: Every user-visible string in the interface comes from a catalogue lookup; the
      English catalogue is the base and no user-visible literal is left inline in the source.
- [ ] **I18N-02**: The French catalogue covers every key of the English one, and the whole
      interface renders in French — navigation, pages, modals, popovers, toasts, empty states,
      validation messages, the command palette, the settings, the authentication pages and the
      404 page.
- [ ] **I18N-03**: Dates, times, durations and numbers are formatted for the active locale: a
      24-hour clock and `JJ/MM/AAAA` in French, a decimal comma, a narrow no-break thousands
      separator, and relative times ("il y a 2 jours").
- [ ] **I18N-04**: Plural forms follow the locale's CLDR categories, so French says "0 fichier"
      where English says "0 files" and a million takes its own category.
- [ ] **I18N-05**: French typography is respected: a narrow no-break space before `: ; ! ?` and
      inside guillemets, and the curly apostrophe.
- [ ] **I18N-06**: A catalogue value can never inject markup — catalogue values are plain text,
      and a test rejects any value containing `<`, `>` or a double quote.
- [ ] **I18N-07**: The vocabulary the app stores as data — statuses, priorities, roles,
      permissions, project templates — is translated where it is displayed, without changing the
      stored values.
- [ ] **I18N-08**: The French catalogue is built as its own chunk, so an English-only build
      carries no French string.

### Language preference

- [ ] **LOC-01**: The language selector switches the interface language immediately, without a
      reload.
- [ ] **LOC-02**: The selector offers only the languages that are actually translated: English
      and French. The four other languages it listed until now are gone until they exist.
- [ ] **LOC-03**: The language is a per-user preference, stored on the account, and it survives
      signing out, signing in again and opening the app from another browser.
- [ ] **LOC-04**: The language is no longer part of the shared workspace document — the account
      is the only source of truth for it.
- [ ] **LOC-05**: An existing installation gains the per-user language without data loss, without
      writing a migration backup, and without touching the workspace row: a second boot stays a
      byte-identical no-op.
- [ ] **LOC-06**: The account's language is applied before the first render, so the interface
      never flashes English.

### Server messages

- [ ] **ERR-01**: A server error carries a stable machine code next to its English message, and
      the interface shows the translated message.
- [ ] **ERR-02**: An error whose code is unknown to the client still shows the server's message,
      so no toast is ever empty.

### Activity

- [ ] **ACT-01**: The activity log is displayed in the interface language, and its filters —
      comments, status changes, project changes — keep selecting the right entries.
- [ ] **ACT-02**: Activity entries written before this milestone are still displayed and still
      filterable.

### Browser coverage

- [ ] **UAT-01**: The onboarding wizard that creates a workspace is covered by a browser test.
- [ ] **UAT-02**: The invite modal is covered by a browser test.
- [ ] **UAT-03**: The `/join` page that accepts an invitation is covered by a browser test.
- [ ] **UAT-04**: The project share modal is covered by a browser test.
- [ ] **UAT-05**: Removing a member from the members page is covered by a browser test.
- [ ] **UAT-06**: Switching between two workspaces is covered by a browser test.
- [ ] **UAT-07**: Changing the workspace plan is covered by a browser test.
- [ ] **UAT-08**: Creating a project from the interface is covered by a browser test.
- [ ] **UAT-09**: The existing Chromium tests are pinned to English, so they keep asserting what
      they assert today.
- [ ] **UAT-10**: A French sweep over the 21 routes proves no untranslated English string is
      served, and a static scan of the sources fails the build on a new user-visible literal that
      was never put in a catalogue.

## Future Requirements

Deferred, tracked but not in this roadmap.

### Languages

- **LANG-01**: German, Spanish, Japanese and British English are offered once they are
  genuinely translated — a locale is never listed before it exists.
- **LANG-02**: The invitation email is sent in the recipient's or the inviter's language. The
  server image ships no catalogue today, so this needs the catalogue in the image and an
  `Accept-Language` negotiation.

### Search and formats

- **FMT-01**: Search matches an accented name from an unaccented query ("elodie" finds
  "Élodie").
- **FMT-02**: The time zone preference becomes an IANA zone, so `Intl` can format with it. It
  stores display labels today, which `Intl` rejects.
- **FMT-03**: The date format preference follows the locale by default and stays an explicit
  override when the user picks one.

### Workspace

- **WS-01**: The remaining shared per-user fields (`notifPrefs`, `tfa`, `sessions`,
  `invoices`) become per-user. The language moving to the account is the first step.

## Out of Scope

| Feature | Reason |
|---------|--------|
| The invitation email in the user's language | the server image ships no catalogue; it would need a Dockerfile change and `Accept-Language` negotiation — materially larger than the interface itself |
| Translating the demo seed's sample content (project names, task titles, comments) | sample data, not interface chrome — the demo should read as a neutral playground, not as a French product |
| A translation-management UI or runtime machine translation | the catalogues are files in the repository, edited like code |
| Right-to-left support | no RTL locale is offered; the catalogue format must not block one later |
| Locale-specific currency formatting | the plan prices are display-only labels; nothing is billed |
| Machine-translated or partially translated locales | a locale is offered only when it is complete — a half-translated interface is the exact failure this milestone exists to end |
| Per-user isolation of `notifPrefs`, `tfa`, `sessions`, `invoices` | still shared document fields; that is its own migration, tracked as WS-01 |
| Real-time collaboration | saves still carry a revision; a stale write is rejected with `409` |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| _pending_ | _pending_ | Pending |

**Coverage:**
- v1.2 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28 ⚠️

---
*Requirements defined: 2026-10-22*
*Last updated: 2026-10-22 after initial definition*
