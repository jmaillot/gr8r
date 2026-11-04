# Phase 36: Server Notification i18n - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Every server-emitted notification text — email subjects and bodies, push text, inbox snippets — is rendered in the recipient's account locale (EN or FR) with English fallback, through an additive locale-parameterized translation layer shared with the client. New reminder notification rows store machine keys rendered locally by the inbox; legacy prose rows render unchanged. A build gate prevents catalogue drift for the server-used key set.

No migrations, no Dockerfile change, no forked server catalogue copy.
</domain>

<decisions>
## Implementation Decisions

### Server translation function design
- **D-01:** One shared module — the server uses a new additive `tFor(locale, key, vars)` in `src/core/i18n.js`; the client's existing `t()` delegates to the same lookup core (`t()` ≡ `tFor(getLocale(), ...)`). Single implementation of lookup/plural/fallback logic; zero drift. The browser-specific paths in i18n.js (document, localStorage) are already guarded and plain Node can import the module.
- **D-02:** FR catalogue is boot-loaded on the server (registerCatalogue at startup), not lazily — the first French email after a restart never pays file I/O mid-send.
- **D-03:** Notification strings live in the same `src/locales/en.json` / `fr.json` files under a flat `notif.*` namespace — no separate catalogue file, no nested objects. Matches the existing flat catalogue shape and the current flat `hasOwn` lookup in `t()`.

### Notification key schema (stored rows)
- **D-04:** New notification rows store `{ key: 'notif.reminder.due_today', vars: {...} }` (key + vars payload) alongside a rendered English prose snippet. The inbox client branches: keyed row → localize at render time with the viewing user's locale; no key → render legacy prose unchanged. Additive, no migration.
- **D-05:** Vars are snapshot values captured at send time (task title, actor name, workspace name) — not IDs resolved at render. Render is a pure lookup+interpolate with no joins, and the historical text stays stable even after task deletion/rename.
- **D-06:** The dual store (key + EN snippet) means old clients and unknown-key rows always have prose to show; a missing client catalogue key degrades to English text, never blank.

### Build gate
- **D-07:** Extend `scripts/i18n-scan.mjs` with a server check family: every `notif.*` key referenced in server notification code (server.js, mailer.js) must resolve in en.json AND fr.json. Same scanner, same run, plain Node — no new dependency. A missing FR key or drifted literal fails the build (I18N-04).
- **D-08:** Scan width = notification call sites only, not a whole-server prose sweep. server.js's error messages, API labels and other prose stay out of scope this phase.
- **D-09:** The gate also enforces EN/FR catalogue parity within the `notif.*` namespace (every key in en.json exists in fr.json and vice versa) — catches "added key, forgot translation".

### Scope of localized text
- **D-10:** Only the notification email family in `mailer.js` (`sendNotif`) is localized this phase — subject AND body both. Security-alert emails and invitation emails keep their English text.
- **D-11:** Inbox "by" labels (`'Reminders'` in server.js) and kind labels are localized too, rendered per viewing user's locale (supports SC-3).

### the agent's Discretion
- Exact `notif.*` key names beyond the flat-prefix convention.
- Internal shape of the row payload (column names / where the key+vars object lives) — planner picks the additive schema.
- How i18n-scan structures the new server rule family internally, as long as it follows the scanner's existing position-based, plain-Node style.
- Refactor mechanics of making `t()` delegate to `tFor()` (internal change, zero call-site churn expected).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` § Notification Localization (I18N-01..04) — locked requirement text
- `.planning/ROADMAP.md` § Phase 36 — goal and 5 success criteria

### Code (primary integration surfaces)
- `src/core/i18n.js` — the shared translation core: `t()`, `registerCatalogue()`, plural rules, guarded interpolation, English fallback. D-01 builds `tFor()` here.
- `src/locales/en.json`, `src/locales/fr.json` — the shared catalogues; `notif.*` namespace lands here (D-03)
- `mailer.js` — all notification email templates; subjects and bodies to extract (~705 lines, notification family only per D-10)
- `server.js` — notification creation/persistence (~line 1240+), `reminderSnippet()` (English prose source), inbox "by" labels, `users.locale` column (line ~149, ~338)
- `scripts/i18n-scan.mjs` — the build gate to extend (D-07..D-09); note its position-based rule design and why it lives outside src/

No external specs or ADRs exist for this phase — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/i18n.js`: `registerCatalogue(code, data)` already exists and works in plain Node — the server path needs no new loading machinery beyond a boot call. `interpolate()` and `resolvePlural()` are locale-parameterizable once `tFor()` threads locale instead of reading the singleton.
- `escHtml` escaping discipline: t() never escapes; callers escape at interpolation — the server email path should follow the same split (encodeWord/HTML escaping stays in mailer.js).
- `scripts/i18n-scan.mjs` allow-list (`test/fixtures/i18n-pending.json`): the progress-meter pattern; new server rules should follow it.
- `users.locale` column and the existing account-locale endpoint (server.js ~3174) — locale authority already exists; no new storage.

### Established Patterns
- House pattern: leaf modules import nothing from the app graph (i18n.js header comment) — keeps server import safe.
- No runtime dependencies, plain Node scripts, position-based literal scanning.
- Reminder scheduler notes (D-27-1..3 in server.js) document timezone/locale invariants — reminder rows written there are the first keyed-row producers (feeds Phase 37).
- Zero-migration discipline: additive columns/payload only (REQUIREMENTS.md invariant).

### Integration Points
- Notification insert path in server.js (~1240-1260): where key+vars rows start being written and where `tFor()` is called with the recipient's locale for email/push text.
- `reminderSnippet()` in server.js: replaced by catalogue lookups (its `day_before` branch goes inert in Phase 37).
- Inbox client render: keyed-row branch reading the stored key+vars, localizing with the viewing user's locale.
- `MAILER.sendNotif` in mailer.js (~686): receives locale or pre-rendered text — planner decides; render happens through `tFor()` per recipient (I18N-01 forbids global locale mutation).

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The user consistently chose the "one shared mechanism" option over duplicates/splits: one module (D-01), one catalogue file (D-03), one scanner (D-07). Prefer consolidation when the planner faces a similar trade-off.

</specifics>

<deferred>
## Deferred Ideas

- Localizing security-alert and invitation emails — belongs with the Phase 39 Notification Audit (owner-validated trim/localize pass). Noted in D-10.

</deferred>

---

*Phase: 36-Server Notification i18n*
*Context gathered: 2026-11-04*
