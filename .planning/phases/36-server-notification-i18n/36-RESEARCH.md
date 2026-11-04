# Phase 36: Server Notification i18n - Research

**Researched:** 2026-11-04
**Domain:** Server-side localization of notification text (shared i18n core, keyed notification rows, i18n build-gate extension)
**Confidence:** HIGH (all claims verified against this repo's source this session; no external packages involved)

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** One shared module — server uses a new additive `tFor(locale, key, vars)` in `src/core/i18n.js`; client's existing `t()` delegates to the same lookup core (`t()` ≡ `tFor(getLocale(), ...)`). Single implementation of lookup/plural/fallback logic; zero drift. Browser-specific paths in i18n.js are already guarded; plain Node can import the module.
- **D-02:** FR catalogue is boot-loaded on the server (registerCatalogue at startup), not lazily — first French email after a restart never pays file I/O mid-send.
- **D-03:** Notification strings live in the same `src/locales/en.json` / `fr.json` under a flat `notif.*` namespace — no separate catalogue file, no nested objects. Matches existing flat `hasOwn` lookup.
- **D-04:** New notification rows store `{ key: 'notif.reminder.due_today', vars: {...} }` (key + vars payload) alongside a rendered English prose snippet. Inbox client branches: keyed row → localize at render time with the viewing user's locale; no key → render legacy prose unchanged. Additive, no migration.
- **D-05:** Vars are snapshot values captured at send time (task title, actor name, workspace name) — not IDs resolved at render. Pure lookup+interpolate, no joins; historical text stable after task deletion/rename.
- **D-06:** Dual store (key + EN snippet) means old clients and unknown-key rows always have prose to show; missing client catalogue key degrades to English text, never blank.
- **D-07:** Extend `scripts/i18n-scan.mjs` with a server check family: every `notif.*` key referenced in server notification code (server.js, mailer.js) must resolve in en.json AND fr.json. Same scanner, same run, plain Node — no new dependency. Missing FR key or drifted literal fails the build (I18N-04).
- **D-08:** Scan width = notification call sites only, not a whole-server prose sweep. server.js error messages, API labels and other prose stay out of scope.
- **D-09:** Gate also enforces EN/FR catalogue parity within the `notif.*` namespace (every key in en.json exists in fr.json and vice versa).
- **D-10:** Only the notification email family in `mailer.js` (`sendNotif`) is localized — subject AND body. Security-alert and invitation emails keep English text.
- **D-11:** Inbox "by" labels (`'Reminders'` in server.js) and kind labels are localized too, rendered per viewing user's locale (supports SC-3).

### the agent's Discretion
- Exact `notif.*` key names beyond the flat-prefix convention.
- Internal shape of the row payload (column names / where key+vars object lives) — planner picks the additive schema.
- How i18n-scan structures the new server rule family internally, as long as it follows the scanner's existing position-based, plain-Node style.
- Refactor mechanics of making `t()` delegate to `tFor()` (internal change, zero call-site churn expected).

### Deferred Ideas (OUT OF SCOPE)
- Localizing security-alert and invitation emails — belongs with Phase 39 Notification Audit.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| I18N-01 | Server-emitted notification text rendered in recipient's account locale, EN fallback | `users.locale` column exists (`[VERIFIED: server.js:149]`), nullable → fallback 'en'; `queueNotifEmails` already resolves per-recipient authority rows (user_id) via `memberships join users` — add `u.locale` to that query (`[VERIFIED: server.js:1211-1216]`); render through per-recipient `tFor()` |
| I18N-02 | Additive locale-parameterized function in shared i18n module; shared EN/FR catalogues; no per-send global mutation | `tFor(locale, key, vars)` design in i18n.js; Node ≥24 supports JSON import attributes — the static `import en from '../locales/en.json' with { type: 'json' }` already works in plain Node `[VERIFIED: src/core/i18n.js:6]`; Dockerfile runtime stage already `COPY --from=build /app/src ./src` so server import of `src/core/i18n.js` needs no Dockerfile change `[VERIFIED: Dockerfile runtime stage]`; precedent: server.js already imports `./src/lib/redaction.js` `[VERIFIED: server.js:58]` |
| I18N-03 | Reminder rows store machine key; client localizes keyed rows; legacy prose rows render unchanged | Reminder rows are the only server-created rows (`runReminderPass`, `[VERIFIED: server.js:1392-1404]`); mention/assign/comment rows are client-created via `notifyMembers` and carry NO prose sentence — the client composes them from `n.type` keys already `[VERIFIED: src/core/store.js:346-365, src/pages/inbox.js:44-65]`. Legacy reminder rows carry `n.snippet` prose rendered verbatim via `fmtComment(n.snippet)` `[VERIFIED: src/pages/inbox.js:38,80]` |
| I18N-04 | i18n build gate covers server-used key set; every locale render guarded against `Intl` failures | Scanner extension per D-07/D-09; scanner exports `scanSource`/`lex`/`analyse` reusable for a targeted server rule family `[VERIFIED: scripts/i18n-scan.mjs:1226-1246,382-464]`; guard pattern: `t()` already never throws on missing keys; wrap `tFor` calls in try/catch + unknown-locale → 'en' clamp |

## Summary

This phase is almost entirely in-repo work with the hard design decisions already locked (D-01..D-11). The shared i18n core (`src/core/i18n.js`) is a leaf module with zero app imports; its browser paths (`document`, `localStorage`, `import.meta.glob`) are already guarded, so plain Node can import it today — `import.meta.glob` throws in Node and the catch leaves the loader map empty, which is documented behaviour `[VERIFIED: src/core/i18n.js:20-27]`. The server (Node ≥24, `engines` in package.json) supports JSON import attributes, so a static `import fr from '../locales/fr.json' with { type: 'json' }` + one boot `registerCatalogue('fr', fr)` satisfies D-02 with no new loading machinery and no Dockerfile change (the Dockerfile already copies `src/` into the runtime image, and server.js already imports from `./src/`).

The critical architectural fact the planner must build around: **mention/assign/comment notification rows are created by the CLIENT** (`notifyMembers` in store.js) and carry no stored sentence — the inbox composes their text from `notif.*` catalogue keys it already ships (8 keys exist in both catalogues). **Reminder rows are the only server-created rows** (runReminderPass), and they are exactly the rows carrying English prose today (`reminderSnippet()`). So the keyed-row schema (D-04) applies to the reminder producer; the inbox already has the two-branch shape (legacy `n.text` verbatim vs structured) — the new keyed branch slots between them.

The build gate needs genuine design care: `scripts/i18n-scan.mjs` scans only `src/` and its `t()`-key family only fires for files importing from `core/i18n.js`; running its display-literal rule families over server.js would flood with out-of-scope prose (D-08 forbids that). The new server family must be a targeted rule over `tFor('notif.…')` call sites in server.js/mailer.js only — the scanner's exported `lex`/`analyse`/`scanSource` machinery supports this without a rewrite.

**Primary recommendation:** Build in this order — (1) `tFor()` in i18n.js with `t()` delegation + tests, (2) server boot catalogue registration, (3) keyed reminder rows + locale-parameterized email rendering in queueNotifEmails/mailer, (4) inbox keyed-row branch, (5) scanner server family + parity gate, (6) guard/fallback regression tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `tFor(locale,…)` translation core | Shared core (src/core/i18n.js) | — | Leaf module, imported by both server and client; single lookup/plural/fallback implementation (D-01) |
| Catalogue boot-loading (FR on server) | Server (server.js boot) | — | Static JSON import + registerCatalogue at startup (D-02); client keeps its Vite-glob lazy path |
| Recipient locale resolution | API/Backend (queueNotifEmails) | — | `users.locale` authority via the existing `memberships join users` query; doc-only members have no account → EN fallback |
| Localized email subject/body | API/Backend (mailer.js buildNotifMessage) | — | Only `sendNotif` family localized (D-10); encoding/escaping stays in mailer |
| Keyed reminder rows | Server (runReminderPass) | Database (workspace doc JSON, additive fields) | Server-created rows gain `key`+`vars` snapshot (D-04/D-05); zero migration |
| Inbox keyed-row localization | Browser/Client (src/pages/inbox.js) | — | Render-time localization with the viewing user's active locale; legacy rows verbatim (D-04) |
| Server key build gate | Build tooling (scripts/i18n-scan.mjs) | — | Same scanner, same run, plain Node (D-07); wired into `prebuild` already via package.json `[VERIFIED: package.json scripts]` |
| 'Reminders' by-label localization | Server (queueNotifEmails, email) + Client (inbox render) | — | D-11: email side rendered per recipient; inbox side rendered per viewing user's locale |

## Standard Stack

### Core
No new packages — the project's standing invariant is **zero runtime dependencies**, and the scanner must stay plain Node `[VERIFIED: REQUIREMENTS.md constraints; scripts/i18n-scan.mjs header]`. Everything needed ships with Node ≥24:

| Capability | Tool | Why Standard |
|------------|------|--------------|
| JSON import attributes | `import … with { type: 'json' }` (Node ≥22/24) | The i18n module already uses it for en.json; works in plain Node for fr.json boot-load (D-02) `[VERIFIED: src/core/i18n.js:6]` |
| Catalogue registration | `registerCatalogue(code, data)` — already exported `[VERIFIED: src/core/i18n.js:29-32]` | Existing API; no new machinery |
| Static scan | scripts/i18n-scan.mjs lexer (`lex`, `analyse`, `scanSource` all exported) `[VERIFIED: scripts/i18n-scan.mjs exports]` | Position-based rule design; extend, don't fork |
| Test runner | `node --test` via `npm test` (`node --test --test-concurrency=2 test/*.test.mjs`) `[VERIFIED: package.json]` | Existing suite (803 tests); server suites spawn the real server via test/helpers/server.mjs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending i18n-scan.mjs | Dedicated regression test file | D-07 locks the scanner extension — one gate, one run; a separate test would drift from the src-side gate |
| Server-side regex key extraction | Reusing the scanner's lexer | A regex over tFor calls would miss template/composed keys and can't reuse line reporting; the lexer is exported and dependency-free |

## Package Legitimacy Audit

No external packages are installed in this phase (zero-dependency invariant). Audit table: **n/a — no packages to verify.** The planner must reject any plan task that adds an npm dependency (including "convenience" parsers for the scanner).

## Architecture Patterns

### System Architecture Diagram

```
Reminder pass (server, 09:00 / boot catch-up)          Client (mention/assign/comment rows)
        │                                                       │
        ▼                                                       ▼
 runReminderPass()                                     notifyMembers() [client]
  builds notif row { type, to, snippet,                        │
    key: 'notif.reminder.*', vars: {…snapshot} }               ▼
        │                                        workspace doc JSON ──► inbox render
        ▼                                                  (src/pages/inbox.js)
 queueNotifEmails(ws, doc, [notif])                          branch:
  resolves recipient: memberships ⋈ users                     ├─ n.text (legacy)   → verbatim
    → user_id, email, u.locale  (locale: null → 'en')        ├─ n.key + n.vars    → tFor(viewer locale)  ← NEW
        │                                                   └─ structured types   → t('notif.<type>') (existing)
        ▼
 MAILER.sendNotif({ locale, …pre-rendered? })         ── planner decides locale vs pre-rendered text
        ▼
 buildNotifMessage() — renders subject+body through tFor(locale, 'notif.email.*', vars)
        │
        ▼
   SMTP ──► recipient email (EN or FR per account locale)

Boot: server.js ─► registerCatalogue('fr', fr.json)  (D-02, one-time)

Build gate (prebuild): i18n-scan.mjs
  ├─ existing src/ families (unchanged)
  ├─ NEW server family: tFor('notif.*') keys in server.js + mailer.js resolve in en.json AND fr.json
  └─ NEW parity family: notif.* namespace keys identical in en.json ↔ fr.json
```

### Recommended Integration Points (existing files, no new structure)

```
src/core/i18n.js        # add tFor(); t() delegates; thread locale through resolvePlural
src/locales/en.json     # add notif.* server keys (flat, alongside the 8 existing client notif.* keys)
src/locales/fr.json     # same, FR
server.js               # boot registerCatalogue('fr'); runReminderPass keyed rows; queueNotifEmails locale + by-label
mailer.js               # buildNotifMessage localized subject/body (sendNotif family only)
src/pages/inbox.js      # keyed-row branch in notifText() (+ snippet localization of keyed rows)
scripts/i18n-scan.mjs   # server key family + notif.* parity family
test/                   # new test files following existing i18n-*.test.mjs patterns
```

### Pattern 1: Additive `tFor()` with singleton `t()` delegation (D-01)

**What:** `tFor(code, key, vars)` is the parameterized core; `t(key, vars)` ≡ `tFor(getLocale(), key, vars)`.
**Critical detail:** the current plural resolver reads the module singleton, not a parameter — `rulesFor(locale)` at `src/core/i18n.js:166-173` `[VERIFIED verbatim: 'const category = Number.isFinite(count) ? rulesFor(locale).select(count) : 'one';']`. `tFor` must thread its `code` through `resolvePlural` (and any future formatter use) or a French-locale server render would pluralize with the singleton's locale. The catalogues map is already the shared store, so the lookup core is a pure refactor.

**Example shape (planner finalizes):**
```js
export function tFor(code, key, vars) {
  const target = LOCALES.some(l => l.code === code) ? code : BASE_LOCALE; // malformed → EN, never throw
  const active = catalogues.get(target);
  let value = active && Object.hasOwn(active, key) ? active[key]
    : catalogues.get(BASE_LOCALE)?.[key];                                  // EN fallback (existing semantics)
  … lookup + interpolate + resolvePlural(target, …) …                      // never throws → returns key
}
export function t(key, vars) { return tFor(locale, key, vars); }
```

### Pattern 2: Boot catalogue registration (D-02)

```js
// server.js (boot, near imports)
import fr from './src/locales/fr.json' with { type: 'json' };
import { registerCatalogue } from './src/core/i18n.js';
registerCatalogue('fr', fr);
```
Static import = no file I/O mid-send; Node ≥24 supports the import attribute; the try/catch `import.meta.glob` in i18n.js is inert in Node `[VERIFIED: src/core/i18n.js:20-27]`.

### Pattern 3: Keyed reminder row (D-04/D-05)

```js
const notif = {
  id: uid(), type, to, by: null, task: t.id,
  snippet: reminderSnippetEn(offset, vars),   // English prose kept (D-06 dual store)
  key: 'notif.reminder.due_today',            // machine key — new additive fields
  vars: { title: t.title || 'a task' },       // snapshot values, NOT ids (D-05)
  at: at.getTime(), read: false, ts: at.getTime(),
};
```
Stored inside the workspace doc JSON (`d.data.notifs.push`) — additive fields on a JSON payload, no schema migration `[VERIFIED: server.js:1412-1414]`.

### Pattern 4: Per-recipient locale in queueNotifEmails

Extend the existing authority query to carry locale:
```js
// current: select m.member_id, m.user_id, u.name, u.email from memberships m join users u …
//          → add u.locale
const recipientLocale = authority.get(n.to)?.locale === 'fr' ? 'fr' : 'en'; // null/unknown → 'en'
```
Then render all email text (snippet, by-label, mailer subject/body inputs) through `tFor(recipientLocale, …)` **per recipient inside the loop** — never `setLocale()` (I18N-01 forbids global mutation; the module singleton belongs to the client only).

### Pattern 5: Targeted server scan family (D-07/D-08)

The scanner's `t()`-key family only fires for files importing from `core/i18n.js` (`importsT` check, `scripts/i18n-scan.mjs:1235` `[VERIFIED]`) and its display-literal rules would flood on server.js prose (D-08 forbids). The new family must:
- run `lex`/`analyse` (both exported) over server.js and mailer.js only,
- collect string-literal arguments of `tFor(` / `t(` calls starting with `notif.` (skip composed keys, matching the existing `+`/`.` skip at line 1165 `[VERIFIED]`),
- emit `unresolved` when a key misses en.json **or** fr.json (place a `notif.*`-scoped check, not the whole-catalogue check),
- add a parity pass: key sets of the `notif.*` namespace in en.json vs fr.json must be identical (D-09),
- follow the `main()` exit-code contract (`violations → 1` at lines 1446-1452 `[VERIFIED]`) so `npm run prebuild` keeps failing the build.
Keep the src-side allow-list (`test/fixtures/i18n-pending.json`) untouched — the server findings should be un-allow-listed from day one (they are new keys; failing output would mean the keys are genuinely missing).

### Anti-Patterns to Avoid
- **Calling `setLocale()`/`primeLocale()` on the server per send:** mutates the module singleton — I18N-01 forbids it and it races concurrent sends. Always `tFor(code, …)`.
- **Storing rendered FR/EN text per locale in rows:** D-04/D-05 lock key+snapshot-vars; storing rendered text per locale duplicates the forked-catalogue problem.
- **Resolving vars as IDs at render time:** D-05 — snapshot values at send; the inbox has no authority access to resolve names, and historical text must survive task deletion.
- **Running the scanner's display-literal families over server.js:** floods with out-of-scope prose (D-08). Targeted family only.
- **Forking a server catalogue copy or touching the Dockerfile:** forbidden by the phase boundary; Dockerfile already ships `src/` `[VERIFIED]`.
- **Escaping inside tFor:** house rule — `t()` never escapes; interpolation targets are escaped at the call site (`escHtml` client-side, `escapeHtml`/`encodeWord` in mailer) `[VERIFIED: src/core/i18n.js:135-140 comment; mailer.js escapeHtml usage]`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale lookup + plural + fallback | A second server-only translation helper | `tFor()` in src/core/i18n.js (D-01) | Zero-drift requirement; plural CLDR rules already implemented and tested |
| FR catalogue loading on server | Lazy per-send read, custom loader | Static JSON import + `registerCatalogue` (D-02) | No I/O mid-send; import attribute is platform-native |
| Recipient locale storage | New column/table | `users.locale` (ensureColumn at server.js:338, endpoint at ~3174) `[VERIFIED]` | Authority already exists; null → EN fallback |
| JS lexer for the gate | Regex/ad-hoc parser | Exported `lex`/`analyse` from i18n-scan.mjs | Position-based rules are the scanner's proven design; a regex misses composed/dynamic keys |
| Locale clamping/fallback | Per-call-site try/catch everywhere | One clamp inside `tFor` (unknown/malformed code → BASE_LOCALE) + one try/catch wrapper at the mailer call boundary (SC-5) | Single choke point; mirrors `activateLocale`'s unknown-code→base semantics `[VERIFIED: src/core/i18n.js:48-51]` |

**Key insight:** every mechanism this phase needs already exists and is tested — the work is threading a locale parameter through them, not building translation infrastructure.

## Common Pitfalls

### Pitfall 1: Plural/formatting still reads the singleton
**What goes wrong:** `tFor('fr', …)` renders a plural value with `rulesFor(locale)` where `locale` is the module singleton (EN) — French plurals silently wrong; a future formatter call inside tFor would likewise ignore the code.
**Why it happens:** `resolvePlural(value, vars)` closes over the singleton `[VERIFIED: src/core/i18n.js:166-173]`.
**How to avoid:** thread the code through `resolvePlural`/`rulesFor` in the same refactor; add a unit test rendering a plural value via `tFor('fr', …)` while the singleton stays 'en'.
**Warning signs:** plural test passing only when `setLocale` was called first.

### Pitfall 2: `notif.*` namespace already exists with different semantics
**What goes wrong:** the catalogues already ship 8 client keys `notif.mention, notif.assign, notif.comment, notif.update, notif.projectAtRisk, notif.taskDueToday, notif.dueReminder, notif.pastDue` `[VERIFIED: src/locales/en.json:1667-1674 verbatim]`. Naively "extract reminderSnippet into notif.*" collides with `notif.dueReminder`/`notif.pastDue` (client sentence fragments: "is coming due" / "is overdue") which are NOT the email copy.
**How to avoid:** keep the existing 8 keys untouched; put server email/inbox keys under a distinct flat sub-prefix (e.g. `notif.reminder.*`, `notif.email.*` — planner's discretion) and have the parity gate scope to the whole `notif.*` namespace so both families are covered.
**Warning signs:** a scan diff showing `notif.dueReminder`'s English value changed.

### Pitfall 3: Placeholder-mismatch checks can't work for server call sites
**What goes wrong:** the src-side `callVars` check assumes the vars argument is an inline object literal; server vars are snapshots built at runtime (`{ title: … }` sometimes, sometimes spread) — a naive reuse of `scanCatalogueKeys` emits false `placeholder-mismatch` or misses keys.
**How to avoid:** the server family checks key resolution only (en+fr); placeholder discipline for server keys is covered by unit tests rendering each server key with its documented vars, not by the static gate.
**Warning signs:** gate failures with no corresponding catalogue change.

### Pitfall 4: Locale-null users silently get nothing
**What goes wrong:** `users.locale` is nullable and existing rows are mostly NULL (`locale: user.locale ?? null` at server.js:599 `[VERIFIED]`) — a `tFor(null, …)` implementation that throws or returns the key would blank/ugly the email (SC-5).
**How to avoid:** clamp at the single choke point: anything not in `LOCALES` → `BASE_LOCALE`. `LOCALE_CODES = ['en', 'fr']` at server.js:137 `[VERIFIED: server.js:137 verbatim]` — note there are TWO locale vocabularies in-repo (`LOCALE_CODES` server-side, `LOCALES` i18n-side); prefer the i18n one inside `tFor`.
**Warning signs:** an email whose subject renders as `notif.email.reminder.due_today.subject`.

### Pitfall 5: Doc-only members have no users row
**What goes wrong:** a reminder to a member with no membership/user row (doc-only assignee) has no locale — the authority map lookup misses.
**How to avoid:** default to 'en' when the authority map has no row (same defensive default the prefs accessor already uses, Phase 34 pattern). SC-1 only demands EN/FR per account locale; doc-only members are EN.
**Warning signs:** test with a doc-only assignee expecting French.

### Pitfall 6: Legacy rows and the dual-store contract
**What goes wrong:** existing reminder rows in real databases carry only `snippet` prose (no key) — a client that renders only keyed rows blanks the entire history (SC-3's "legacy prose rows still render unchanged").
**How to avoid:** the inbox branches in order: `n.text` verbatim (existing) → `n.key`+`n.vars` (new; unknown key → fall back to `n.snippet` prose per D-06) → structured-type composition (existing). Never remove the `snippet` write (D-06).
**Warning signs:** UAT against a pre-upgrade workspace doc.

### Pitfall 7: Email HTML subject/body escaping order
**What goes wrong:** localized strings carry accents/apostrophes ("échéance", "vous a assignée"); French typography uses typographic apostrophes (existing fr.json values use U+2019 `[VERIFIED: fr.json:1668]`) — double-encoding through `encodeWord` or HTML escaping at the wrong layer mangles them.
**How to avoid:** render raw via tFor, escape exactly where the current code does (`escapeHtml` into HTML, `encodeWord` on the Subject header) — same split as the client's escHtml discipline.
**Warning signs:** mojibake in a French test email.

### Pitfall 8: The scanner allow-list is a progress meter with staleness semantics
**What goes wrong:** `compare()` flags allow-list entries not found in the scan as `stale` violations `[VERIFIED: scripts/i18n-scan.mjs:1391-1409]` — restructuring the scanner must not change which src literals are found, or unrelated build failures appear.
**How to avoid:** the server family is additive inside `main()`/`scanSource` — keep `scanTree('src')` output byte-compatible; add a separate scan of the two server files feeding only the new key-resolution findings.
**Warning signs:** `npm run i18n:scan` failing on files this phase never touched.

## Code Examples

### Reading the recipient locale (extend the existing query)
```js
// server.js queueNotifEmails — current query at lines 1211-1216 [VERIFIED]
const authority = new Map(
  db
    .prepare('select m.member_id, m.user_id, u.name, u.email, u.locale from memberships m join users u on u.id = m.user_id where m.workspace_id = ?')
    .all(wsRow.id)
    .map(r => [r.member_id, r]),
);
```

### The by-label (D-11) — current verbatim source
```js
// server.js:1250 [VERIFIED verbatim]
const by = ['due_reminder', 'past_due'].includes(n.type) ? 'Reminders' : authority.get(n.by)?.name || profiles.get(n.by)?.name || 'Un membre';
```
The 'Reminders' literal becomes `tFor(recipientLocale, 'notif.email.byReminders')`; note `'Un membre'` is a pre-existing French actor-name fallback for doc-only members (data quirk, not this phase's target — leave unless trivially adjacent).

### reminderSnippet — the prose being replaced
```js
// server.js:1336-1341 [VERIFIED verbatim]
function reminderSnippet(offset, task) {
  const title = task?.title || 'a task';
  if (offset === 'day_before') return `Due tomorrow: ${title}`;
  if (offset === 'morning_of') return `Due today: ${title}`;
  return `Past due: ${title}`;
}
```
Three offsets → three `notif.reminder.*` keys (day_before branch goes inert in Phase 37 but the key must exist and be gate-covered until then).

### mailer verbs table — the sendNotif family surface
```js
// mailer.js:403-409 [VERIFIED verbatim]
const verbs = {
  mention: 'mentioned you in',
  assign: 'assigned you to',
  comment: 'commented on',
  update: 'updated',
};
const verb = verbs[msg.kind] || 'updated';
```
D-10 localizes this family: verbs table, "Hi,", "Open the task", the settings footer line, subject composition — all become `tFor(locale, 'notif.email.*')` keyed strings. Reminder rows currently hit `verbs[msg.kind] || 'updated'` (`kind` = 'due_reminder'/'past_due' → 'updated') — the keyed redesign should give reminders their own verb/subject keys instead of falling into 'updated'.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server rows carry English prose (`reminderSnippet`) | Keyed rows + snapshot vars, localized at render | This phase | Feeds Phase 37 (producer) and 38 (digest renders localized text through the same layer) |
| Client-only i18n (singleton locale) | Shared parameterized core (`tFor`) | This phase | Server never touches the singleton |
| Gate scans src/ only | Gate covers server notif.* keys + namespace parity | This phase | I18N-04 satisfied |

**Deprecated/outdated:** none — no library churn; JSON import attributes are the current standard syntax on Node ≥24.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `users.locale` is mostly NULL on real production rows (inferred from `user.locale ?? null` write shape and no visible default-on-create assignment); NULL → 'en' is the intended fallback | Pitfall 4 | If some installs store a non-`LOCALES` value (e.g. 'fr-FR'), the clamp handles it; only risk is a locale value outside en/fr that users expect to map to FR — the account endpoint already 400s unknown values `[VERIFIED: server.js:3176]`, so exposure is minimal |
| A2 | French plural/formatter behaviour inside `tFor` is only needed for lookups, not Intl formatters (email copy uses no dates) — `resolvePlural` threading is sufficient | Pattern 1 | If Phase 38's digest wants localized dates, it should reuse the existing formatters with a locale parameter added then; not a Phase 36 blocker |
| A3 | No existing test asserts reminder rows must NOT carry extra fields (additive JSON payload is safe) | Pattern 3 | A strict shape assertion in due-reminders.test.mjs would need updating — planner should grep `snippet` in that file during planning |

## Open Questions (RESOLVED — plan 36-02, checker iteration 2)

1. **Locale vs pre-rendered text across the MAILER boundary** (CONTEXT explicitly leaves this to the planner)
   - What we know: `sendNotif(msg)` takes a plain payload; `buildNotifMessage` composes subject/body from it.
   - What's unclear: pass `{ locale, key inputs }` and render inside mailer.js, or render all strings in queueNotifEmails and pass pre-rendered text?
   - Recommendation: pass `locale` + raw values and render inside `buildNotifMessage` — mailer.js is named as the D-10 localization site, and the scanner's gate covers mailer.js `tFor` call sites naturally. Either is defensible; pick one and keep all `notif.email.*` call sites in exactly one file.
   - RESOLVED: render inside `buildNotifMessage` with `msg.locale` — plan 36-02's tracer passes `locale` into the MAILER.sendNotif msg and renders the frame via `tFor(msg.locale, 'notif.email.*')` in mailer.js (all notif.email.* call sites in exactly one file), per the recommendation.

2. **Does `sendNotif`'s notif-email-link source-extraction test constrain the by-line shape?**
   - What we know: server.js comment at line 1174-1177 says the reminder check is inlined "so the notif-email-link source-extraction tests keep evaluating that line standalone" `[VERIFIED]` — test/notif-email-link.test.mjs extracts source lines.
   - What's unclear: whether editing line 1250 breaks that extraction contract.
   - Recommendation: read test/notif-email-link.test.mjs before touching line 1250; adjust the test in the same commit if its extraction pattern changes.
   - RESOLVED: plan 36-02 task 2 step (1) reads/adjusts test/notif-email-link.test.mjs alongside the server.js:1250 edits — keeping the line's standalone-evaluability or adjusting the extraction test in the same commit, per the recommendation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node ≥24 (JSON import attributes, node:test, node:sqlite) | everything | ✓ | engines field enforces >=24; CI/dev run Node 24 `[VERIFIED: package.json engines]` | — |
| Intl.PluralRules with FR CLDR data | plural rendering | ✓ | platform ICU (full-icu is default since Node 13) `[ASSUMED]` | tFor falls back to `other`/`one` per existing resolvePlural semantics — never throws |
| scripts/i18n-scan.mjs + test suite | build gate, validation | ✓ | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (Node built-in runner), `--test-concurrency=2` |
| Config file | none — glob `test/*.test.mjs` via package.json `test` script |
| Quick run command | `node --test test/i18n-core-features.test.mjs` (or the new phase test file) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| I18N-01 | FR-locale recipient gets FR email; EN recipient same workspace gets EN; same run; no singleton mutation | integration (spawn real server via test/helpers/server.mjs + SMTP capture pattern from existing mailer tests) | `node --test test/notif-i18n.test.mjs` | ❌ Wave 0 |
| I18N-02 | `tFor` renders per-locale while singleton locale unchanged; `t()` ≡ `tFor(getLocale(),…)`; FR catalogue boot-registered | unit | `node --test test/i18n-tfor.test.mjs` | ❌ Wave 0 |
| I18N-03 | Keyed rows render localized per viewer locale in notifText(); legacy prose rows unchanged; unknown key → EN snippet | unit (client render, following test/notif-hydration.test.mjs patterns) | `node --test test/notif-i18n.test.mjs` | ❌ Wave 0 |
| I18N-04 | Scanner server family: missing FR key fails; drifted literal fails; notif.* parity enforced; tFor render never throws on malformed locale | unit (scanSource on synthetic source + catalogue fixtures, following test/i18n-scan.test.mjs patterns) | `node --test test/i18n-scan.test.mjs` (extended) | ✅ (extend) |
| SC-5 guard | `tFor('xx-YY', …)` and Intl-throw path return EN instead of throwing | unit | `node --test test/i18n-tfor.test.mjs` | ❌ Wave 0 |

Existing suites that must stay green and pin current behaviour: `test/due-reminders.test.mjs`, `test/notif-email-link.test.mjs`, `test/locale-account.test.mjs`, `test/i18n-scan.test.mjs`, `test/catalogue.test.mjs`.

### Sampling Rate
- **Per task commit:** the touched test file(s) via `node --test <file>`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green + `npm run i18n:scan` exit 0 before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/i18n-tfor.test.mjs` — tFor/t delegation, locale clamping, throw-guard (I18N-02, SC-5)
- [ ] `test/notif-i18n.test.mjs` — keyed rows server+client, per-recipient email locale (I18N-01, I18N-03)
- [ ] `test/i18n-scan.test.mjs` — extend with server-family + parity cases (I18N-04)
- [ ] `test/fixtures/i18n-pending.json` — unchanged; verify no new src findings (regression pin)

## Security Domain

> `security_enforcement` not set in config → treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `tFor` clamps unknown locales (fail-safe to EN); vars are snapshot strings interpolated through the existing escape-at-callsite discipline; no new request surface |
| V6 Cryptography | no | no crypto surface touched |
| V2/V3/V4 | no | no auth/session/access-control change; locale reads ride the existing authority query with the same workspace scoping |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Injection via interpolated vars (task title, actor name) into email HTML/Subject | Tampering | Existing `escapeHtml` / `encodeWord` in mailer.js applied AFTER tFor interpolation — never inside the catalogue lookup (house rule: t() never escapes) |
| Locale-driven info leak (locale from wrong tenant row) | Information Disclosure | locale comes from the same `memberships join users` row already used for name/email — no new join, no new exposure |
| Mass-assignment of `key`/`vars` fields into doc notifs by clients | Tampering | keyed rows are written only by the server pass; the client doc-merge path for notifs is unchanged — planner should confirm `notifyMembers` rows never gain a `key` field from client callers |

## Sources

### Primary (HIGH confidence)
- `src/core/i18n.js` (full read) — t()/registerCatalogue/activateLocale/resolvePlural semantics, guarded browser paths, escaping discipline
- `scripts/i18n-scan.mjs` (full read) — rule families, catalogue-key family, importsT gate, allow-list compare, exit-code contract
- `server.js` (targeted reads: imports, reminder pass, queueNotifEmails, locale column/endpoint) — all integration points
- `mailer.js` (buildNotifMessage + createMailer) — sendNotif family surface, verbs table, escaping layers
- `src/pages/inbox.js`, `src/core/store.js` — client notif render branches, client-created rows
- `src/locales/en.json` / `fr.json` — existing `notif.*` keys (verbatim, lines 1667-1674)
- `Dockerfile`, `package.json` — runtime ships src/, zero-dependency scripts, test command

### Secondary (MEDIUM confidence)
- None needed — no external technology claims.

### Tertiary (LOW confidence)
- Node ICU fullness (A2-related) — training knowledge, guarded by never-throw fallback design.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; every mechanism read in-source this session
- Architecture: HIGH — all integration points read verbatim with line citations
- Pitfalls: HIGH — derived from actual code semantics (singleton plural, existing notif.* keys, allow-list staleness, extraction tests), not speculation

**Research date:** 2026-11-04
**Valid until:** ~2026-12-04 (in-repo facts; re-verify only if catalogues/scanner change before planning)
