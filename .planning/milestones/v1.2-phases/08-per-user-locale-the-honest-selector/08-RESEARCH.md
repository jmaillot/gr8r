# Phase 8: Per-user locale & the honest selector - Research

**Researched:** 2026-10-23
**Domain:** In-repo refactor — per-account locale storage (SQLite column + new PATCH endpoint),
client boot-time locale negotiation, selector rewire. No new external packages.
**Confidence:** HIGH (every claim below was read from the source files this session; this is a
codebase-only phase — the research-plan/docs seam had no external questions to answer)

## Summary

Phase 8 moves the language preference out of the shared workspace document and onto the account.
Today the language is a workspace-shared display label: `DEFAULT_PREFS.lang` is
`'English (US)'` [VERIFIED: src/core/store.js:16], the selector offers six labels
[VERIFIED: src/pages/settings.js:188], and choosing one routes through the generic preference
write path `IN.prefSel` → `S.prefs[k] = …; save(); render(); toast(…)` [VERIFIED:
src/actions/actions.js:2180-2186] — which means the language rides the whole-document PUT and
moves the workspace revision on every switch. The phase-7 glue maps the stored label to a code:
`const LANG_TO_LOCALE = { Français: 'fr' };` [VERIFIED: src/core/theme.js:10].

The target shape is already scaffolded by prior phases: `setLocale()` resolves unknown codes to
the base locale, sets the singleton synchronously, sets `documentElement.lang`, and dispatches
the bubbling `projects:locale` event that main.js turns into one re-render [VERIFIED:
src/core/i18n.js:47-75, src/main.js:68]. The server has a proven additive-migration helper
`ensureColumn()` [VERIFIED: server.js:127-130] and a single payload shaper `userPayload()`
[VERIFIED: server.js:244-251]; a `PATCH /api/auth/me` endpoint does not exist yet (only GET at
[VERIFIED: server.js:1225-1231]). The second-boot byte-identical no-op is a real, asserted
contract in `test/migration.test.mjs` (`snapshot()` compares doc string, revision, updated_at,
memberships, invites and backup count across a reboot [VERIFIED: test/migration.test.mjs:166-196]).

The research surfaced **three findings that materially shape the plan** (details in Pitfalls):

1. **`prefs.lang` resurrects itself after the registry removal.** `applyDoc()` merges the server
   doc's prefs over `DEFAULT_PREFS` [VERIFIED: src/core/store.js:174], and module init merges the
   localStorage blob the same way [VERIFIED: src/core/store.js:39]. Every existing install's doc
   and blob still carries `prefs.lang`, so after `lang` leaves `DEFAULT_PREFS` the merge copies it
   right back into `S.prefs` — and the next `save()` writes it back into the workspace document.
   Removing the key from `DEFAULT_PREFS` alone silently fails LOC-04's "the document carries no
   language field". The merge points must strip the key, and the seed needs the legacy label
   captured *before* the strip.
2. **`setLocale()` always dispatches `projects:locale`, and that listener re-renders.** The listener
   is registered at module top [VERIFIED: src/main.js:68], before `init()` runs. A boot-time
   negotiation that calls the dispatching `setLocale()` triggers `render()` on a not-yet-initialised
   `S.ui` (`S.ui.auth` is null → renders the full demo shell, [VERIFIED:
   src/shell/render.js:160]), which the browser can paint during the `api.init()` await — a demo-
   data flash on exactly the French browsers LOC-06 protects. The boot path needs a silent prime
   (set singleton + load catalogue, no dispatch); runtime switches keep the dispatching path.
3. **Two write paths carry the language today and both must leave the doc flow.** The selector's
   `data-in="prefSel"` [VERIFIED: src/pages/settings.js:83-92] and the doc-derived prefs merge are
   the doc pipeline; the language needs its own input key and handler (setLocale → re-render →
   background PATCH; demo → localStorage), never `save()`.

**Primary recommendation:** Add `users.locale` via `ensureColumn()`, expose it in `userPayload()`,
add `PATCH /api/auth/me` (requireUser + sameOrigin + whitelist `en`/`fr`), rewire the selector to
`availableLocales()` with its own `data-in` key, and restructure the boot as: silent-prime the
negotiated locale at the top of `init()` → apply the account locale after `api.me()` (still
pre-render) → seed NULL accounts from the legacy label captured during hydration → first render.
Strip `lang` from prefs at both merge points.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**The per-user locale on the server**

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

**The migration seed**

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

**Boot timing & negotiation**

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

**The selector**

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

**Demo mode & failure handling**

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

### Deferred Ideas (OUT OF SCOPE)

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
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOC-01 | Selector switches the interface language immediately, without a reload | `setLocale()` already dispatches `projects:locale` → one re-render [i18n.js:47-75, main.js:68]; new selector handler must call it then background-PATCH (D-12). e2e no-reload pattern exists [french-overflow.spec.mjs:136-166] |
| LOC-02 | Selector offers only English and French; the four phantom labels are gone everywhere | Registry `LOCALES` already frozen to exactly en/fr with names 'English'/'Français' [i18n.js:8-12]; derive options from `availableLocales()`; agreement test (registry ↔ locales dir ↔ selector source) |
| LOC-03 | Language is a per-user preference on the account; survives sign-out, re-login, other browsers | `users.locale` column + `userPayload()` delivery + `PATCH /api/auth/me`; sessions are cookie-based, so any browser gets the same account row |
| LOC-04 | Language leaves the shared workspace document; changing it never touches the workspace row/revision | Language must exit `DEFAULT_PREFS`/`docSnapshot()`/`applyDoc()` AND the merge points must strip the legacy key (Pitfall 1); selector must leave the `prefSel`/`setPref` doc-write path (Pitfall 3) |
| LOC-05 | Existing install gains the column without data loss, no migration backup, second boot byte-identical no-op | `ensureColumn()` is pragma-guarded and idempotent [server.js:127-130]; boot code must never write the column; extend the migration-style second-boot snapshot to include `users.locale` |
| LOC-06 | Account language applied before first render; never flashes English | Boot order in `init()`: silent prime → `api.me()` → hydration → seed → render (D-06/D-07); silent-prime variant needed because `setLocale()` dispatches a render (Pitfall 2) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Locale storage (per-account truth) | Database/Storage (`users.locale` column) | API (PATCH endpoint) | The account row is the single source of truth (LOC-03); the server owns the write |
| Locale delivery to the client | API (`userPayload()` on login/signup/me) | — | One payload shaper already feeds login, signup, me, and workspaces list [server.js:244-251, 1215, 1230, 1261, 1268] |
| Locale mutation | API (`PATCH /api/auth/me`) | — | Mutating endpoints validate, authorise, and never touch the workspace doc (D-03) |
| Boot-time negotiation & application | Browser/Client (`init()` + i18n singleton) | — | D-07/D-08: synchronous, pre-network, pre-render; the server is not involved |
| Legacy migration seed | Browser/Client (first boot after hydration) | API (the PATCH it calls) | D-04: client-driven, guarded, idempotent; the server stays passive |
| Selector UI & instant switch | Browser/Client (settings row + `setLocale()`) | API (background PATCH) | D-12: apply locally, persist separately; never the doc pipeline |
| Demo-mode persistence | Browser/Client (localStorage) | — | D-15: no account exists; the storage backend is the only difference |
| Workspace document | Database/Storage (`workspaces.doc`) | — | Explicitly *loses* the language field; untouched by any locale change (LOC-04) |

## Standard Stack

### Core

No new packages. This phase is built entirely from existing in-repo primitives:

| Facility | Location | Purpose | Why Standard |
|----------|----------|---------|--------------|
| `setLocale()` / `LOCALES` / `availableLocales()` | `src/core/i18n.js:8-12, 47-81` | Locale switch, registry, catalogue availability | Already resolves unknown → base, sets `documentElement.lang`, dispatches `projects:locale` |
| `ensureColumn()` | `server.js:127-130` | Additive, idempotent `users.locale` column | Proven by four prior columns; pragma-guarded; writes no backup |
| `userPayload()` | `server.js:244-251` | Deliver `locale` on every auth response | Single shaping point for login/signup/me/workspaces |
| `requireUser()` | `server.js:1105-1113` | 401 guard for the new PATCH | The established auth gate |
| `sameOrigin()` | `server.js:1059` (used at 1274, 1308, 1342) | CSRF guard every mutating endpoint carries | The new PATCH must follow suit |
| `call()` client path | `src/core/api.js:38-61` | The new `api.patchMe()` joins this | Cookie credentials, JSON body, status/error normalised |
| `node:test` + real server harness | `test/helpers/server.mjs` (client has `.patch()` at line 123) | All server-side contracts | House rule: never mock SQLite or HTTP |
| Playwright `newContext({ locale })` | e2e | Negotiation proof (`fr-FR` context) | Browser-level `navigator.language` control without OS changes |

**Installation:** none. `package.json` is untouched by this phase.

**Version verification:** N/A — no external packages are installed. Node is v24.21.0
[VERIFIED: `node --version` this session]; the server uses the built-in `node:sqlite`
`DatabaseSync` (no SQLite package) [VERIFIED: server.js imports / `new DatabaseSync(DB_PATH)` at
server.js:134].

## Package Legitimacy Audit

Not applicable — this phase installs zero external packages (no npm/PyPI/crates additions). The
gate is satisfied vacuously; there is nothing to audit and no `checkpoint:human-verify` to insert.

## Architecture Patterns

### System Architecture Diagram

```
                       BOOT (src/main.js init())
                                │
   ┌────────────────────────────▼─────────────────────────────┐
   │ 1. negotiate(navigator.languages) → 'fr' | 'en'          │
   │    silent-prime locale (singleton + catalogue, NO event) │
   ├──────────────────────────────────────────────────────────┤
   │ 2. api.init() → api.me()                                 │
   │    account.locale non-NULL and ≠ active → silent-apply   │  (still pre-render)
   ├──────────────────────────────────────────────────────────┤
   │ 3. hydrateFromServer(slug)                               │
   │    capture legacy doc.prefs.lang BEFORE prefs merge/strip│
   │    if account.locale is NULL and legacy === 'Français':  │
   │        PATCH /api/auth/me {locale:'fr'} → silent-apply   │  (D-04/D-06)
   ├──────────────────────────────────────────────────────────┤
   │ 4. first render() — t() reads the final locale           │  (LOC-06: no flash)
   └──────────────────────────────────────────────────────────┘

   SELECTOR (Settings → Appearance)
   user picks 'English' | 'Français'
        │
        ├─► setLocale(code) ──► projects:locale ──► render()   (instant, no reload, LOC-01)
        │
        ├─► server mode:  api.patchMe({locale}) background
        │        ├─ ok    → account row updated (users.locale)
        │        ├─ fail  → keep language for session + toast warn (D-16)
        │        └─ 401   → login screen (existing session-expired path)
        │     ✗ never S.prefs / save() / workspace doc / revision
        │
        └─► demo mode:  localStorage['projects.locale'] = code (D-15)

   SERVER (server.js)
   PATCH /api/auth/me  { locale }
        │ requireUser ─► sameOrigin ─► whitelist ('en'|'fr') ─► UPDATE users SET locale
        └─► 200 { user: userPayload(row) }   (locale joins every auth payload)
   BOOT: never writes users.locale (ensureColumn only adds the column)

   UNAUTHENTICATED (login/signup/forgot/reset/verify//join)
   negotiation at top of init() applies before the early-return render (D-07/D-08)
```

### Recommended Project Structure

No new directories. Touched files (all existing):

```
server.js                     # ensureColumn line, userPayload(), new PATCH /api/auth/me
src/core/i18n.js              # silent-prime/boot variant of the switch + negotiation helper
src/core/theme.js             # delete LANG_TO_LOCALE and the locale block of applyPrefs()
src/core/store.js             # lang leaves DEFAULT_PREFS; strip legacy key at both merge points
src/core/api.js               # api.patchMe()
src/pages/settings.js         # selector row → two options from the registry, new data-in key
src/actions/actions.js        # new language-change handler (IN.* key), sign-out/in locale steps
src/main.js                   # boot ordering: negotiate → me → hydrate → seed → render
test/*.test.mjs               # new contracts + updated phase-7 wiring assertions
e2e/french-overflow.spec.mjs  # persistence path comments/assertions follow the new backend
```

### Pattern 1: Silent prime vs dispatching switch

**What:** Two ways to set the locale. The runtime switch (`setLocale`) dispatches `projects:locale`
so listeners re-render. The boot path needs the same singleton + catalogue effect **without**
the event, because nothing has rendered yet and a dispatch would render an uninitialised shell.
**When to use:** any `setLocale` call that happens before `init()`'s first `render()`.
**Example:**

```js
// src/core/i18n.js — shape only; the dispatching setLocale (lines 47-75) is the model.
// Boot variant: identical resolution + catalogue load, minus the CustomEvent and the
// render-inducing dispatch. The existing loop guard discipline is preserved by callers.
export async function primeLocale(code) {
  const known = LOCALES.some(l => l.code === code);
  const target = known ? code : BASE_LOCALE;
  locale = target;
  if (!catalogues.has(target)) {
    const loader = loaders[`../locales/${target}.json`];
    if (loader) {
      const mod = await loader();
      registerCatalogue(target, (mod && mod.default) || mod);
    }
  }
  if (typeof document !== 'undefined' && document?.documentElement) {
    document.documentElement.lang = target;   // same D-02 contract as setLocale
  }
  return target;
}
```

**Why not just call `setLocale()` at boot:** the `projects:locale` listener at [src/main.js:68] runs
`render()` immediately; during `init()` that renders the full shell with `S.ui.auth === null`
([src/shell/render.js:160] renders `renderShell()` when auth is falsy), and the pending
`await api.init()` gives the browser a paint opportunity — demo data flashes before the login
screen or the workspace. The runtime selector keeps using `setLocale()` unchanged.

### Pattern 2: The guarded locale application (loop safety carries over)

`applyPrefs()` today guards the switch with `if (getLocale() !== target) setLocale(target)`
[VERIFIED: src/core/theme.js:19-20]. Every new application point (boot prime, account apply,
sign-out fallback) must keep that guard: `setLocale`/`primeLocale` dispatch or mutate
unconditionally, so a caller that fires on every render without the guard recreates the
render → applyPrefs → setLocale → event → render loop the phase-7 research documented. The
preferred structure: the locale is applied **at explicit lifecycle moments only** (boot, me
resolved, seed, selector, sign-out, sign-in) — `applyPrefs()` stops touching the locale
entirely, which removes the per-render guard obligation instead of replicating it.

### Pattern 3: Mutating endpoint shape (the PATCH follows the house pattern)

```js
// server.js — placement: immediately after GET /api/auth/me (line 1225-1231).
if (pathname === '/api/auth/me' && method === 'PATCH') {
  const user = requireUser(req, res);
  if (!user) return;
  if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-origin request rejected' });
  const body = await readJson(req);
  const locale = String(body?.locale || '');
  if (!LOCALES.includes(locale)) return json(res, 400, { error: 'Unknown locale' });
  db.prepare('update users set locale = ? where id = ?').run(locale, user.id);
  return json(res, 200, { user: userPayload(db.prepare('select * from users where id = ?').get(user.id)) });
}
```

Whitelist exactly the registry codes (`'en'`, `'fr'`). The server must never persist a value the
client's `setLocale()` would silently resolve away — an unresolvable stored code would make the
account claim a language the interface does not render. Payload validation, `sameOrigin`, and
`requireUser` mirror `PATCH /api/workspaces/:slug` [VERIFIED: server.js:1305-1342 pattern].

### Pattern 4: Negotiation (D-09)

```js
// Prefix match with a clamp to the base language subtag; anything unknown → 'en'.
// navigator.languages is ordered by preference; the first supported entry wins.
function negotiate(codes = navigator.languages || [navigator.language]) {
  for (const tag of codes) {
    const base = String(tag || '').toLowerCase().split('-')[0];
    if (base === 'fr') return 'fr';
    if (base === 'en') return 'en';
  }
  return 'en';
}
```

`fr-CA` and any `fr-*` clamp to `'fr'`; `en-GB` clamps to `'en'`; `de`/`ja`/… fall to `'en'` —
byte-for-byte the D-09 table. Where the helper lives is the agent's discretion (CONTEXT), but a
pure function with no DOM dependency is testable from bare Node like the rest of `i18n.js`.

### Pattern 5: The seed (D-04/D-05/D-06)

```js
// After hydrateFromServer(slug) resolves, still before the first render:
//   guard: api.user?.locale is NULL  AND  legacy label === 'Français'
//   legacy label comes from the server doc's prefs.lang, captured before applyDoc strips it
//   action: await api.patchMe({ locale: 'fr' })  →  silent-apply 'fr'
//   failure: log/ignore — the seed is retried next boot; NULL stays negotiated (D-11)
```

- Every member of a formerly-French workspace seeds their own account on their own first boot
  (D-05) — no server coordination needed, the guard makes it idempotent.
- Only the `'Français'` label maps; every other legacy label ('English (US)', 'English (UK)',
  unknown) resolves to `en` implicitly because NULL + negotiation already lands there (CONTEXT
  specifics).
- The seed must never write the workspace row — the PATCH touches `users` only.

### Anti-Patterns to Avoid

- **Leaving `lang` readable after removing it from `DEFAULT_PREFS`:** the merge at
  [store.js:39] and [store.js:174] resurrects the legacy key from old docs/blobs, and
  `docSnapshot()` then writes it back to the server on the next save — LOC-04 fails silently.
  Strip the key at both merge points.
- **Routing the selector through `data-in="prefSel"` or `data-a="setPref"`:** both writers do
  `S.prefs[k] = …; save()` [actions.js:2180-2186, 281-285] — a document write and revision bump
  per language change, the exact thing LOC-04 forbids. Give the row its own `data-in` key and
  handler.
- **Keeping the locale inside `applyPrefs()`:** it runs at the top of every render; owning the
  locale there means the next doc-derived prefs value can fight the account locale every render
  (the reverse flash). Locale application moves to lifecycle moments.
- **Dispatching `projects:locale` during boot** (Pitfall 2) — premature render of an uninitialised
  shell.
- **Storing a display label or an unvalidated locale string server-side** — D-01 fixes the
  format to the code; the PATCH whitelist enforces it.
- **Caching the locale in localStorage in server mode** (D-10 explicitly forbids it) — the
  account is the only persistent truth; localStorage is demo-mode-only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Additive column migration | Custom `alter table` + existence bookkeeping | `ensureColumn()` [server.js:127-130] | Pragma-guarded, idempotent, proven by four columns, no-backup by construction |
| Locale resolution/unknown-code fallback | A new mapping or normalisation layer | `setLocale()`'s registry check [i18n.js:48-49] | Already the documented contract (unknown → base); a second resolver invites drift |
| "Which languages exist" | A hardcoded option array in settings.js | `availableLocales()` / `LOCALES` [i18n.js:8-12, 79-81] | The registry is the single truth; deriving the selector makes LOC-02 structural and the agreement test trivial |
| Session-expired UX on PATCH 401 | A new logout-and-redirect routine | The existing `projects:save-error` 401 branch [main.js:70-78] | D-16 says reuse, not duplicate |
| Session/cookie handling for the PATCH | Custom auth plumbing | `requireUser()` + the existing cookie parse | Identical to every other authenticated endpoint |
| Language-tag parsing | A full BCP-47 parser | Subtag-prefix split + clamp (D-09) | The requirement is a two-language clamp, not a locale database |

**Key insight:** every hard part of this phase (event-driven re-render, idempotent migration,
auth gating, optimistic-failure UX) already exists in the codebase. The phase is wiring, not
construction — the risk is in *removal* (the legacy label's resurrection paths) and *timing*
(boot ordering), not in building anything new.

## Runtime State Inventory

This phase relocates a stored preference — the inventory applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `workspaces.doc` JSON carries `prefs.lang` (e.g. `"lang":"English (US)"`) in every existing install; `localStorage['projects.v2']` blobs carry it too [VERIFIED: docSnapshot at src/core/store.js:96 includes all of `S.prefs`; DEFAULT_PREFS.lang at store.js:16]. New `users.locale` column starts NULL. | Code edit + implicit data migration: strip `lang` at both merge points so the next natural document save drops the field (LOC-04 does not demand an explicit doc rewrite — the field disappears with the first ordinary save); seed PATCHes `users.locale` per account (D-04/D-05) |
| Live service config | None — self-hosted Node server; no external SaaS holds the locale. Verified: no external service in the phase's surface. | None |
| OS-registered state | None — no Task Scheduler/pm2/launchd/systemd registrations embed the locale. | None |
| Secrets/env vars | None — no secret key or env var name references the language. | None |
| Build artifacts | The French catalogue builds as its own chunk (`import.meta.glob`, [src/core/i18n.js:22-27]) — unchanged. Old `projects.v2` localStorage blobs are schema-tolerant (`Object.assign` merge). No egg-info/compiled artifacts (plain JS + Vite). | None — but note the localStorage blob keeps carrying the stale `prefs.lang` key until overwritten by the next `save()`; it must be *ignored*, not trusted |

## Common Pitfalls

### Pitfall 1: `prefs.lang` resurrects through the merge points (LOC-04 killer)
**What goes wrong:** `lang` is deleted from `DEFAULT_PREFS`, but `S.prefs = Object.assign({},
DEFAULT_PREFS, saved?.prefs)` at module init [VERIFIED: src/core/store.js:39] and
`S.prefs = Object.assign({}, DEFAULT_PREFS, doc.prefs || {})` in `applyDoc()`
[VERIFIED: src/core/store.js:174] copy `prefs.lang` from every legacy localStorage blob and every
legacy server doc back into `S.prefs`. `docSnapshot()` serialises all of `S.prefs`
[VERIFIED: src/core/store.js:96], so the next debounced `save()` writes `"lang"` back into
`workspaces.doc` — the workspace document carries a language field forever and the roadmap's
criterion 4 fails without any test noticing at boot time.
**Why it happens:** the merge is additive; removing the default only stops *seeding* the key, it
does not remove incoming keys.
**How to avoid:** after each merge, delete the key (`delete S.prefs.lang` in both the init merge
and `applyDoc`), and capture the legacy value *before* stripping so the seed (D-04) can read it.
The cleanest capture point is inside/at the hydration call, where the raw server doc is in hand
before `applyDoc` runs.
**Warning signs:** a server test that PATCHes nothing but boots a legacy-fixture DB, saves any
preference, and still finds `"lang"` in `workspaces.doc`; or `applyDoc` tests where the merged
prefs carry `lang`.

### Pitfall 2: boot-time `setLocale()` renders an uninitialised shell
**What goes wrong:** the `projects:locale` listener [src/main.js:68] calls `render()` on every
dispatch, and it registers at module load — before `init()`. Negotiation that uses the
dispatching `setLocale()` therefore renders the shell while `S.ui.auth` is still `null`, which
renders `renderShell()` (demo seed data) [src/shell/render.js:160]; the subsequent `await
api.init()` / `await api.me()` network awaits give the browser time to paint it. On a French
browser the user sees a demo-data flash before the real surface — worse than the English flash
LOC-06 forbids.
**Why it happens:** `setLocale()` was designed for runtime switches, where a re-render is the
point; boot needs the state change without the announcement.
**How to avoid:** a silent prime variant (Pattern 1) for every pre-render application: boot
negotiation, account-locale adoption after `api.me()`, and the seed's application (D-06). The
first dispatching switch is the user's selector click.
**Warning signs:** an e2e run where a `fr-FR` context shows workspace/demo content before login;
a unit test that counts `render()` calls during `init()`.

### Pitfall 3: the selector's change event rides the document-save pipeline
**What goes wrong:** `sel()` emits `data-in="prefSel" data-k="…"`
[VERIFIED: src/pages/settings.js:83-92] and `IN.prefSel` writes `S.prefs[k]`, calls `save()`
(document write → workspace revision bump) and toasts [VERIFIED:
src/actions/actions.js:2180-2186]. If the language row keeps that key, every language switch
mutates the shared workspace row — LOC-04's negative criterion violated on the happy path.
`A.setPref` [actions.js:281-285] is the same trap via `data-a`.
**How to avoid:** a dedicated `data-in` key (e.g. `langSel`) whose handler does
`setLocale()` → re-render (arrives via the event) → background `api.patchMe()` (server mode) or
localStorage write (demo mode). Never call `save()` from it. Assertions that the language is
absent from the save path belong in the server test (PATCH me → workspaces row byte-identical)
and a source-level assertion that the language row no longer uses `prefSel`/`setPref`.
**Warning signs:** a revision change after a language switch in any test; `toast.prefSaved`
firing on language change (the doc-save toast).

### Pitfall 4: the server writes `users.locale` at boot (LOC-05 killer)
**What goes wrong:** any convenient-looking boot "normalisation" (e.g. defaulting NULL to
`'en'`, or writing during `createUser` for existing rows) breaks the byte-identical second-boot
contract and writes a choice the user never made (D-02).
**How to avoid:** the column is written from exactly one place — the PATCH endpoint. `createUser`
[server.js:985] inserts without a locale (NULL by default); `openDb()` only adds the column.
Extend the migration-style test's `snapshot()` to include the `users` table so a future boot
write is caught.
**Warning signs:** a second-boot diff that includes `users.locale`.

### Pitfall 5: silent divergence between the stored code and the rendered locale
**What goes wrong:** the PATCH accepts an unvalidated string (e.g. `'FR'`, `'fr-CA'`,
`'Deutsch'`); the account then claims a locale the interface doesn't render (`setLocale`
silently resolves unknown → `en`), and the selector shows a selection the UI contradicts.
**How to avoid:** server-side whitelist of exactly `'en'`/`'fr'` (the registry's codes); 400 on
anything else. The client sends only registry codes because the selector derives from
`availableLocales()`.
**Warning signs:** a 200 from `PATCH /api/auth/me` with `{"locale":"de"}`.

### Pitfall 6: phase-7 test contracts assert the throwaway machinery
**What goes wrong:** deleting `LANG_TO_LOCALE` and the six-label selector breaks existing green
tests that pin them: `test/i18n-locale.test.mjs:95` asserts `/LANG_TO_LOCALE/` *exists*;
`test/i18n-pages.test.mjs:619` asserts the six-label array string exists in settings.js;
`test/i18n-prefs.test.mjs:272` asserts `prefValue('lang', 'English (US)')` passes through.
**How to avoid:** plan explicit test updates — invert the locale-wiring assertions (assert the
map is *gone*, assert `applyPrefs` no longer references `lang`), rewrite the selector-options
assertion for the two-language array, drop the `lang` case from the `prefValue` pass-through
test. These are contract updates required by the phase, not test regressions to be feared.
**Warning signs:** red `i18n-*` tests immediately after the removal task.

### Pitfall 7: account-locale adoption after sign-in / sign-out is missing from the boot-only plan
**What goes wrong:** the plan covers boot, but a user who signs in *without* a page reload
(`A.signIn` → `api.login` → shell render) never passes through `init()`'s negotiation/account
step; likewise `A.signOut` [actions.js:2046-2062] renders the login screen without touching the
locale. The stale account locale would persist visually after sign-out (D-10 violated), and a
different account signing in on the same tab would keep the previous account's language.
**How to avoid:** apply the locale at the lifecycle moments: after a successful
login/signup/accept-invite (adopt `user.locale` if non-NULL; NULL → keep negotiated, D-11), and
in `A.signOut` (fall back to negotiated, D-10). Both are silent-apply candidates only if a render
follows anyway — the sign-out/sign-in paths already end in `render()`, so a silent apply before
that render is correct and cheap.
**Warning signs:** switching accounts in one tab keeps the first account's language.

### Pitfall 8: new user-visible strings must enter both catalogues
**What goes wrong:** D-16 needs a "could not be saved" toast message; a hardcoded literal fails
the phase-6 build gate (`scripts/i18n-scan.mjs` runs before the bundler) and a new English key
without a French member fails the phase-7 parity gate (`scripts/fr-parity.mjs`).
**How to avoid:** every new user-visible string goes into `en.json` **and** `fr.json` in the same
task. Expected new keys: exactly one failure toast (and nothing else — selector labels are
registry `name` values, not catalogue strings).
**Warning signs:** `npm run build` exit 1 (scan) or the parity script failing.

## Code Examples

All snippets are verbatim from this session's reads — the surfaces the plan will touch.

### The registry and switch (the foundation — unchanged)

```js
// src/core/i18n.js:8-12
export const BASE_LOCALE = 'en';
export const LOCALES = Object.freeze([
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
]);
```

The `name` values are already exactly D-13's two labels — the selector can render
`availableLocales().map(l => [l.code, l.name])` and satisfy LOC-02 structurally.

### The throwaway mapping to delete

```js
// src/core/theme.js:6-20
const LANG_TO_LOCALE = { Français: 'fr' };
...
const target = LANG_TO_LOCALE[p.lang] || 'en';
if (getLocale() !== target) setLocale(target);
```

Both lines leave `theme.js`; `applyPrefs()` keeps theme/accent/side/density/motion/dateFmt only.

### The prefs merge points to strip

```js
// src/core/store.js:39   (module init, localStorage blob)
prefs: Object.assign({}, DEFAULT_PREFS, saved?.prefs || {}),
// src/core/store.js:174  (applyDoc, server doc)
S.prefs = Object.assign({}, DEFAULT_PREFS, doc.prefs || {});
// src/core/store.js:96   (docSnapshot — what makes Pitfall 1 bite)
const docSnapshot = () => ({ data: S.data, prefs: S.prefs, views: S.views, collapsed: S.ui.collapsed });
```

### The server surfaces

```js
// server.js:127-130 — the migration helper (add: ensureColumn(db, 'users', 'locale', 'text'))
function ensureColumn(conn, table, name, def) {
  const cols = conn.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
}

// server.js:79-87 — the users schema (locale column joins via ensureColumn for legacy DBs;
// fresh installs get it from this CREATE TABLE if added there too — both paths must exist)
create table if not exists users (
  id            text primary key,
  email         text not null unique collate nocase,
  name          text not null,
  password_hash text not null,
  member_id     text,
  created_at    integer not null,
  last_login_at integer
);

// server.js:244-251 — the payload shaper (locale: user.locale ?? null joins here)
function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    workspaces: membershipsOf(user.id).map(row => workspacePayload(row, row)),
  };
}

// server.js:1225-1231 — the GET the PATCH sits beside
if (pathname === '/api/auth/me' && method === 'GET') {
  const user = currentUser(req);
  if (!user) return json(res, 200, { user: null });
  return json(res, 200, { user: userPayload(user) });
}
```

Note the SCHEMA/`ensureColumn` duality: for a **fresh** database the `create table` shapes the
table, so `locale` must be added to the SCHEMA string as well; for an **existing** database the
`create table if not exists` is a no-op and `ensureColumn` adds the column. Both paths are
needed; either alone leaves one install shape without the column.

### The write paths that must not own the language

```js
// src/actions/actions.js:2180-2186 — the doc-saving handler the language row must leave
IN.prefSel = el => {
  const k = el.dataset.k;
  S.prefs[k] = prefValue(k, el.value);
  save();
  render();
  toast(t('toast.prefSaved'), { ms: 1500 });
};
```

### The boot sequence to restructure

```js
// src/main.js:157-192 — today: me → hydrate → render. The new order interleaves
// negotiate (top) → me + account apply → hydrate + seed → render, per D-06/D-07.
if (withServer) {
  const user = await api.me();
  ...
  const ws = await hydrateFromServer(slug);
  ...
}
...
render();
```

### The sign-out fallback point

```js
// src/actions/actions.js:2046-2062 — D-10: after clearLocalCache(), before render(),
// the locale falls back to the negotiated value.
A.signOut = async () => {
  if (api.enabled) {
    await flushPending();
    await api.logout();
    api.revision = 0;
    clearLocalCache();
    history.replaceState(null, '', '/');
  }
  ...
  render();
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Locale as stored display label (`'English (US)'`) mapped by throwaway `LANG_TO_LOCALE` | Locale as registry code on the account | This phase | One format, one source of truth; the label↔code seam disappears |
| Locale inside the shared workspace doc (per-workspace, revision-moving writes) | Nullable `users.locale`, PATCH-only writes | This phase | Per-user isolation (LOC-03/04); document writes never carry language |
| English default everywhere until the doc loads | `navigator.language` negotiation pre-render | This phase (D-08) | Unauthenticated surfaces render in the browser's language |
| `applyPrefs()` owns the locale every render | Locale applied at lifecycle moments only | This phase | Simpler loop-safety story; no per-render prefs→locale coupling |

**Deprecated/outdated:**
- `LANG_TO_LOCALE` [theme.js:10]: deleted this phase (D-01).
- The six-label selector array [settings.js:188]: replaced by registry-derived two options.
- `prefs.lang` in `DEFAULT_PREFS` [store.js:16]: removed; legacy values in old docs/blobs are
  read once by the seed, then stripped.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `navigator.languages` (falling back to `navigator.language`) is the right input for client-side negotiation and is stable across supported browsers | Pattern 4 / D-08 | LOW — negotiation degrades to 'en', which is today's behaviour |
| A2 | `render()` with `S.ui.auth === null` renders the demo shell (making Pitfall 2 a real flash, not a theoretical one) | Pitfall 2 | MEDIUM — if render() early-returns on uninitialised state instead, the silent-prime variant is still correct but less critical; the plan should keep the silent prime regardless |
| A3 | The `projects:save-error` 401 branch is safe to trigger from the locale PATCH path (dispatching the event with `{status:401}`) or equivalent inline handling | D-16 | LOW — either reuse or a small inline mirror of main.js:70-78 satisfies D-16 |
| A4 | Playwright's `newContext({ locale })` reliably controls `navigator.languages` for the negotiation e2e | Validation Architecture | LOW — standard Playwright feature; fallback is launching Chromium with a language flag |
| A5 | The seed can rely on the *server* doc carrying `prefs.lang` (not just localStorage) — i.e. hydration happens before the seed decision in every relevant flow | Pattern 5 / D-04 | MEDIUM — a member who never hydrated (e.g. 401 path) simply doesn't seed that boot and retries later; behaviour stays correct, only the timing of the seed shifts |

## Open Questions — (RESOLVED)

1. **Should the PATCH response drive the client's account cache, or is the request enough?** (RESOLVED)
   - What we know: the PATCH returns `userPayload(user)`; `api.applyUser()` is the existing
     cache-writer [api.js:63-67].
   - **Resolved: adopt the payload.** `api.patchMe()` calls `applyUser(r.data)` on success —
     `state.user.locale` stays fresh without another `api.me()` round-trip. Adopted in
     08-02 Task 1 (step 4).
2. **Does the demo-mode localStorage key need a store.js export or a local constant?** (RESOLVED)
   - What we know: D-15 wants localStorage persistence; `STORE_KEY` ('projects.v2') is the existing
     blob key and the locale must NOT ride inside it (it would re-enter the prefs/doc pipeline).
   - **Resolved: a dedicated `projects.locale` key owned by the i18n module**, deliberately outside
     the projects.v2 blob — keeps the doc snapshot clean by construction. Implemented in
     08-02 Task 1 (step 3).
3. **First-boot ordering edge: `join` early-return happens before `api.me()` in today's code**
   ([main.js:138-155] calls `api.me()` only when signed in). (RESOLVED)
   - What we know: D-07 covers the unauthenticated early-return via negotiation; the join flow
     for a *signed-in* visitor does call `api.me()`.
   - **Resolved: no special handling needed.** Negotiation already applies at the top of init()
     (08-02 Task 2 step 2); account adoption follows the same rules wherever `api.me()` runs,
     per the boot order reflected in 08-02's must_haves.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server, node:test suites | ✓ | v24.21.0 | — |
| node:sqlite (built-in) | users column, PATCH endpoint | ✓ | Node 24 built-in | — |
| Playwright + Chromium | negotiation e2e, LOC-01/LOC-06 proofs | ✓ | configured in e2e/playwright.config.mjs | — |
| Vite build + i18n scan gate | catalogue/parity gates (Pitfall 8) | ✓ | existing scripts | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node v24.21.0), Playwright for browser proofs |
| Config file | none needed for node:test (glob invocation); `e2e/playwright.config.mjs` |
| Quick run command | `node --test test/i18n-locale.test.mjs` (and the new suite) |
| Full suite command | `npm test` (335+ cases, real servers, real SQLite) then `npm run e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOC-01 | Selector switch re-renders without reload | e2e | `npx playwright test --config e2e/playwright.config.mjs french-overflow` (no-reload sentinel pattern already present) | ✅ (extend) |
| LOC-02 | Exactly two options; no phantom labels anywhere | unit (agreement: registry ↔ `src/locales/*.json` ↔ settings.js source) | `node --test test/i18n-locale.test.mjs` | ❌ Wave 0 (new/updated contract) |
| LOC-03 | Locale survives sign-out/re-login/other browser; per-user in one workspace | integration (real server) | `node --test test/locale-account.test.mjs` (new) | ❌ Wave 0 |
| LOC-04 | Language change never touches workspace row/revision; doc carries no lang | integration (real server) | same new suite: PATCH me → `workspaces` row snapshot identical | ❌ Wave 0 |
| LOC-05 | Legacy DB gains column, no data loss, no backup, second boot byte-identical | integration (real server + fixture) | `node --test test/migration.test.mjs` (extended users snapshot) / new locale-migration test | ✅ (extend) |
| LOC-06 | Account/negotiated locale applied before first render; no English flash | e2e (`newContext({ locale: 'fr-FR' })`, unauthenticated + authenticated) | playwright run of the new spec | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** the touched suite(s) via `node --test <file>`.
- **Per wave merge:** `npm test` full suite.
- **Phase gate:** `npm test` + `npm run e2e` green before `/gsd-verify-work`; `npm run build`
  (scan + parity gates) for any catalogue change.

### Wave 0 Gaps

- [ ] New server-side suite for the account locale (LOC-03/LOC-04 contracts: PATCH validation,
      payload delivery, workspace-row immutability, second-boot no-op including `users`)
- [ ] Updated `test/i18n-locale.test.mjs` wiring assertions (map deleted, not present)
- [ ] Updated `test/i18n-pages.test.mjs` selector-options assertion (two options)
- [ ] Updated `test/i18n-prefs.test.mjs` `prefValue('lang', …)` case
- [ ] New/extended e2e spec for negotiation + no-flash boot (fr-FR context)

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json` (the file carries only
workflow keys), so the section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | `requireUser()` — the PATCH mutates only the caller's own row (`user.id` from the session, never from the body) |
| V5 Input Validation | yes | Server-side whitelist of the locale code (`'en'`/`'f'` registry codes only); typed body read via `readJson` |
| V3 Session Management | yes | Existing cookie session; 401 on expired session routes to login (D-16) |
| V6 Cryptography | no | No new crypto surface |
| V2 Authentication | no | No new auth surface (the endpoint *requires* auth) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF on the new mutating endpoint | Tampering | `sameOrigin(req)` — every existing mutating route carries it [server.js:1274, 1308, 1342]; the PATCH must too |
| Mass assignment / parameter tampering (client sends extra fields) | Tampering | Read only `body.locale`; ignore everything else |
| Stored invalid state (unvalidated locale code) | Tampering | Whitelist before `update users set locale` |
| SQL injection | Tampering | Prepared statements throughout (`db.prepare(...).run(...)`) — the new UPDATE follows |
| Account enumeration via error differences | Information Disclosure | Not applicable — the endpoint requires a valid session; failures are uniform 400/401/403 |

## Sources

### Primary (HIGH confidence)
- `src/core/i18n.js` (full read) — registry, `setLocale`, event contract, formatters
- `src/core/theme.js` (full read) — `applyPrefs`, `LANG_TO_LOCALE`
- `src/core/store.js` (full read) — `DEFAULT_PREFS`, merge points, `docSnapshot`, `applyDoc`
- `src/core/api.js` (full read) — `call()`, `applyUser`, endpoint surface
- `src/main.js` (full read) — boot sequence, `projects:locale` listener, save-error handling
- `server.js` (lines 70-289, 1160-1342 + greps) — schema, `ensureColumn`, `userPayload`, auth
  routes, PATCH pattern, `requireUser`, `sameOrigin`
- `src/pages/settings.js` (language/datetime sections, `sel()` helper)
- `src/actions/actions.js` (`IN.prefSel`, `A.setPref`, `A.signOut`)
- `src/ui/select.js` (select enhancement + change dispatch)
- `src/shell/render.js` (`render()` entry, `applyPrefs()` call site, auth-null branch)
- `test/migration.test.mjs` (snapshot/second-boot mechanics), `test/i18n-locale.test.mjs`,
  `test/i18n-prefs.test.mjs`, `test/i18n-pages.test.mjs` (contracts to update)
- `e2e/french-overflow.spec.mjs` (selector interaction + persistence proof pattern)
- `test/helpers/server.mjs` (harness client has `.patch()`)

### Secondary (MEDIUM confidence)
- `.planning/phases/05…/05-CONTEXT.md`, `06-CONTEXT.md`, `07-CONTEXT.md` (referenced decisions
  D-02/D-04/D-01-D-03 via 08-CONTEXT.md's canonical refs; the referenced contract points were
  re-verified directly in source this session)

### Tertiary (LOW confidence)
- Playwright `newContext({ locale })` semantics [ASSUMED: A4]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; every facility read in source this session
- Architecture: HIGH — boot ordering and write paths traced end-to-end in the real code
- Pitfalls: HIGH — each pitfall is anchored to a specific verified line (merge points, event
  listener, prefSel handler, test assertions)

**Research date:** 2026-10-23
**Valid until:** 2026-11-22 (stable — in-repo refactor; re-verify only if phases 5-7 artifacts
are edited)

---
*Phase: 8-Per-user locale & the honest selector*
*Researched: 2026-10-23*
