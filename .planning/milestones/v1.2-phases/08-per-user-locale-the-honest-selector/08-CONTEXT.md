# Phase 8: Per-user locale & the honest selector - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The locale leaves the shared workspace document and becomes a per-account property: a nullable
`users.locale` column added with the existing `ensureColumn()` helper, delivered by
`userPayload()` and settable through a new `PATCH /api/auth/me` endpoint. The server never
writes it at boot, so the second-boot byte-identical no-op guarantee survives; the column stays
`NULL` until the user chooses. On the client, the account locale is applied before the first
render (the interface never flashes English), the selector offers only the languages that exist,
and switching re-renders without a reload. `prefs.lang` leaves `DEFAULT_PREFS`, `docSnapshot()`
and `applyDoc()`, and the phase-7 throwaway `LANG_TO_LOCALE` mapping is deleted.

In scope by explicit decision: client-side browser negotiation for the unauthenticated surfaces
(login, signup, forgot/reset, verify, `/join`) — a deliberate scope addition beyond the English
default, distinct from the deferred server-side `Accept-Language` email negotiation (LANG-02),
which remains out of scope. Demo mode keeps a working selector persisting to localStorage.

Out of scope: the other four languages (Deutsch, Español, 日本語, English UK — LANG-01), the
invitation email's language (LANG-02), timezone/date-format per-user isolation (FMT-02/FMT-03,
WS-01), and any way back to a NULL locale once chosen.

Requirements: **LOC-01**, **LOC-02**, **LOC-03**, **LOC-04**, **LOC-05**, **LOC-06**.

</domain>

<decisions>
## Implementation Decisions

### The per-user locale on the server

- **D-01:** `users.locale` stores the **locale code** (`'fr'`, `'en'`), not a display label. The
  phase-7 stored label format ('English (US)' / 'Français') and the `LANG_TO_LOCALE`
  `{ Français: 'fr' }` mapping are deleted together with this change; the selector and the
  storage format move as one. — **Reversibility:** one-way — changing the stored format later
  requires a data migration over the `users` table, so the code format is chosen correctly now.
- **D-02:** The column is added by the existing `ensureColumn()` helper as a nullable text
  column, and the server **never writes it at boot** — the second-boot byte-identical no-op
  guarantee (LOC-05) stays intact. The column stays NULL until the user (or the client-side
  migration seed) writes it through `PATCH /api/auth/me`.
- **D-03:** `PATCH /api/auth/me` is a new endpoint that sets `users.locale` and returns the
  updated `userPayload()`. The language is never part of the settings document-save flow, so
  changing the language never touches the workspace row or moves its revision (LOC-04, roadmap
  criterion 4). — **Reversibility:** costly — undoing the decoupling re-wires the selector, the
  API and the document pipeline.

### The migration seed

- **D-04:** Existing installs gain the per-user language through a **client-side seed on first
  boot**: after hydrating the workspace document, if `users.locale` is NULL and the legacy
  `prefs.lang` maps to a valid code ('Français' → 'fr'), the client PATCHes the account once.
  Guard: **NULL + legacy only** — it never overwrites an explicit choice, never rewrites the
  workspace row, and is a no-op for fresh installs.
- **D-05:** The seed effectively applies to **every member** of a workspace whose legacy label
  was 'Français': each member seeds their own account on their first boot. The old preference
  was workspace-shared, so this faithfully reproduces what each user saw before; it is
  idempotent because after the first PATCH the account locale is set and the guard fails.
- **D-06:** The seeded locale **applies in the same boot**: after the seed PATCH succeeds the
  client calls `setLocale()` immediately, so the first post-upgrade session renders in French —
  no English flash, no "switch back" moment. — **Reversibility:** reversible — the seed is a
  self-contained function; deleting it only means future NULL accounts stay negotiated/English.

### Boot timing & negotiation

- **D-07:** The negotiated locale applies **synchronously at the top of `init()`**, before any
  network call and before any possible render. When `api.me()` later returns the account
  locale, `setLocale(account)` replaces the negotiated value — still before the first render, so
  nothing flashes (LOC-06). The unauthenticated early-return renders (login, join) therefore
  render in the negotiated language too. — **Reversibility:** reversible.
- **D-08:** Unauthenticated surfaces (login, signup, forgot/reset, verify, `/join`) use
  **client-side `navigator.language` negotiation**, not a hardcoded English default. This is a
  deliberate scope addition validated in discussion; it is distinct from the deferred server-side
  `Accept-Language` negotiation (LANG-02), which stays out of scope.
- **D-09:** The negotiation maps by **language-subtag prefix with a clamp to the base**:
  `fr`, `fr-CA`, `fr-*` → `'fr'`; `en`, `en-GB`, `en-*` → `'en'`; anything else (`de`, `ja`, …) →
  `'en'`. This mirrors the existing `setLocale()` contract (unknown code resolves to base).
- **D-10:** On **sign-out** the locale falls back to the negotiated value — the account is gone,
  so the account locale is gone with it. Nothing is cached in localStorage for this.
- **D-11:** A **signed-in account with NULL locale keeps the negotiated value**: the browser's
  preference is honoured until the user makes an explicit account-level choice. A brand-new
  signup with a French browser sees French immediately, across reloads, without ever having
  chosen.

### The selector

- **D-12:** Choosing a language **applies instantly and persists separately**: the selector
  calls `setLocale()` and re-renders immediately (LOC-01), then persists via a background
  `PATCH /api/auth/me`. The selector is never part of the settings document-save flow — the
  language never enters the workspace document.
- **D-13:** The selector **stays in Settings → Appearance** (the existing row) but shrinks to
  exactly two options labelled **'English' and 'Français'** — each language's own name, the
  standard convention. The 'English (US)' / 'English (UK)' / 'Deutsch' / 'Español' / '日本語'
  labels disappear (LOC-02).
- **D-14:** When the account locale is NULL, the row **displays the negotiated (browser)
  language as selected** — the row shows what the user is actually seeing. Choosing either
  option writes `users.locale` immediately; **there is no way back to NULL** once chosen. The
  account is the only source of truth from then on (LOC-03).

### Demo mode & failure handling

- **D-15:** In **demo mode** (no server, no account) the selector stays visible and working:
  choosing a language calls `setLocale()` and re-renders exactly as in server mode, and the
  choice persists in **localStorage** as a browser-local preference. The demo stays a complete,
  honest product — only the persistence backend differs (account vs. localStorage). The
  phase-7 `LANG_TO_LOCALE` mapping is replaced by this storage abstraction.
- **D-16:** When `PATCH /api/auth/me` **fails** after an instant switch (offline, 500), the
  interface **keeps the newly applied language for the session** and a toast warns the choice
  could not be saved; the next boot applies the account's old locale. This mirrors the existing
  optimistic-save pattern (`projects:save-error` toasts). A **401** routes to the login screen as
  today — the existing session-expired handling is reused, not duplicated.

### the agent's Discretion

- Where the seed function lives (e.g. `main.js` boot vs `store.js` hydration) and where the
  negotiation helper lives (e.g. `src/core/i18n.js` vs a small helper) — implementation detail
  for research/planning, as long as the guard (D-04), the timing (D-07) and the failure behaviour
  (D-16) hold.
- Exact test file naming/structure — follow the established one-contract-per-file pattern
  (`node --test --test-concurrency=2 test/*.test.mjs`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning documents
- `.planning/ROADMAP.md` §Phase 8 — goal, success criteria 1–5, deliverable
- `.planning/REQUIREMENTS.md` §Language preference — LOC-01…LOC-06 are the locked requirements
- `.planning/PROJECT.md` §Decisions for milestone v1.2 (D2–D5, D14) — selector honesty, per-user
  locale, server never writes at boot, `dateFmt`/`weekStart`/`tz` stay workspace-shared
- `.planning/phases/05-i18n-foundation-catalogue-contract/05-CONTEXT.md` — D-02 (`projects:locale`
  event), and the `<specifics>` registry test recommendation that makes LOC-02 cheap to enforce
- `.planning/phases/06-english-extraction-locale-aware-formats/06-CONTEXT.md` — D-04 (`'auto'`
  sentinel: an unset `dateFmt`/`timeFmt` follows the locale)
- `.planning/phases/07-french-catalogue-french-typography/07-CONTEXT.md` — D-01 (the throwaway
  `LANG_TO_LOCALE` mapping this phase deletes), D-02 (`documentElement.lang`), D-03 (unknown
  stored values resolve to `en`)

### Code
- `src/core/i18n.js` — `LOCALES` registry (frozen to en/fr), `setLocale()` (unknown → base),
  the bubbling `projects:locale` event
- `src/core/theme.js` — `applyPrefs()` and the `LANG_TO_LOCALE` mapping to delete
- `src/core/store.js` — `DEFAULT_PREFS.lang`, `docSnapshot()`, `applyDoc()` (lang removal)
- `src/pages/settings.js` — the language row (`sel('lang', …)`, ~line 188) to shrink to two
  options
- `src/main.js` — the `init()` boot sequence (where D-07 applies) and the `projects:locale` listener
- `server.js` — `users` schema (~line 79), `ensureColumn()` (~line 127), `userPayload()`
  (~line 244), the PATCH endpoint surface (no `/api/auth/me` PATCH exists yet)
- `src/core/api.js` — `api.me()` and the `call()` path the new PATCH joins
- `src/actions/actions.js` — `setPref`/`prefValue` for `prefs.lang` (the prefs-flow removal)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `setLocale()` / the `LOCALES` registry — already resolves unknown codes to base and dispatches
  the bubbling `projects:locale` event; the selector and the negotiation layer build on it as-is.
- `ensureColumn()` (`server.js:127`) — the proven idempotent additive-migration helper for the
  new `users.locale` column.
- `userPayload()` (`server.js:244`) — the single place where the account payload is shaped; the
  locale field joins it.
- The `'auto'` sentinel pattern (phase 6 D-04) — the model for "unset follows the locale" that
  the NULL account locale follows.
- The phase-5 registry-test recommendation — a test asserting the registry and the catalogue
  files agree makes LOC-02 a lint, not a hope.

### Established Patterns
- Locale as a module-level singleton read at call time, never threaded through signatures.
- `applyPrefs()` runs at the top of every render with a loop guard — the account-locale
  application must preserve that guard discipline.
- Optimistic UI with toasts on save errors (`projects:save-error`) — the PATCH-failure path reuses it.
- Demo mode honestly single-workspace: server-dependent controls are hidden or no-op'd; the
  selector instead stays functional with a localStorage backend (D-15).
- Tests are `node:test` against real servers and real SQLite; nothing mocked.

### Integration Points
- `src/main.js` `init()` — boot order: `api.init()` → `api.me()` → `hydrateFromServer(slug)` →
  `render()`; negotiation lands at the top, account locale after `api.me()`, seed after
  hydration, all before the first render.
- `server.js` — new `PATCH /api/auth/me` endpoint alongside the existing GET at line 1225.
- `src/pages/settings.js` — the language row leaves the settings save flow; the save-path
  assertions that mention `lang` need updating.
- `src/core/store.js` — `prefs.lang` exits `DEFAULT_PREFS`, `docSnapshot()` and `applyDoc()`.
- Tests touching the language today — `test/i18n*.test.mjs`, `test/membership.test.mjs`,
  `test/tenancy.test.mjs`, `test/migration.test.mjs`, and the phase-7 e2e specs.

</code_context>

<specifics>
## Specific Ideas

- The two selector labels are exactly 'English' and 'Français' — no 'English (US)', no
  'English (UK)'; the five extra labels vanish everywhere, not just in the selector.
- The seed maps only the French legacy label; every other legacy label resolves to `en`
  implicitly (NULL already resolves to the negotiated/base locale).
- The second-boot byte-identical no-op test must stay green: the server writes `users.locale`
  only from the new PATCH endpoint, never at boot.
- LOC-02 is enforced as an agreement test (registry ↔ catalogue ↔ selector options), not by
  vigilance.
- A French-browser first visit to `/join` (unauthenticated) sees the join page in French via
  negotiation — this is intended, not a leak.

</specifics>

<deferred>
## Deferred Ideas

- LANG-02: the invitation email in the recipient's language, with server-side
  `Accept-Language` negotiation — out of scope (PROJECT.md), unchanged by this phase's
  client-side negotiation decision.
- LANG-01: Deutsch, Español, 日本語, English UK — future milestone; the registry makes adding
  one a matter of dropping in a catalogue file.
- WS-01: the remaining shared per-user fields (`notifPrefs`, `tfa`, `sessions`, `invoices`) —
  its own migration; the language is the first step.
- FMT-02: the timezone preference as an IANA zone.
- A "reset to browser default" selector option that restores NULL — rejected this phase
  (D-14: no way back to NULL); revisit only if requested later.

</deferred>

---

*Phase: 8-Per-user locale & the honest selector*
*Context gathered: 2026-10-23*
