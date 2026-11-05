# Phase 36: Server Notification i18n - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-04
**Phase:** 36-Server Notification i18n
**Areas discussed:** Server t() design, Notification key schema, Build gate scope, Emails in scope

---

## Server t() design

| Option | Description | Selected |
|--------|-------------|----------|
| One shared module | tFor() in src/core/i18n.js alongside t(); server and client share one module, zero drift; browser paths already guarded | ✓ |
| Separate server module | New server/i18n.js importing JSON directly; cleaner separation but duplicated interpolation/plural logic — drift risk | |
| You decide | Let the planner decide after research | |

**User's choice:** One shared module
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Boot-loaded | registerCatalogue at server boot; FR loaded once, no I/O mid-send | ✓ |
| Lazy per-locale load | Load catalogue on first use per locale; first French email after restart pays I/O mid-send | |

**User's choice:** Boot-loaded

| Option | Description | Selected |
|--------|-------------|----------|
| Same catalogue files | notif.* namespace in existing en.json/fr.json, loaded by both client and server | ✓ |
| Nested namespace file | Separate keys file imported into both catalogues; more structure, more complexity for ~10 keys | |

**User's choice:** Same catalogue files

| Option | Description | Selected |
|--------|-------------|----------|
| t() delegates | t() routes through tFor(getLocale(), ...); single lookup core, zero call-site churn | ✓ |
| Keep them separate | tFor() duplicates the lookup core; two paths in one file — the drift this phase kills | |

**User's choice:** t() delegates

---

## Notification key schema

| Option | Description | Selected |
|--------|-------------|----------|
| Flat 'notif.' prefix | Flat keys like notif.reminder.due_today; matches existing flat catalogue shape | ✓ |
| Nested objects | Nested objects in catalogue; prettier but needs path resolution added to t() | |

**User's choice:** Flat 'notif.' prefix

| Option | Description | Selected |
|--------|-------------|----------|
| key + vars object | Rows store {key, vars}; client branches: keyed → localize, else legacy prose. Additive, no migration | ✓ |
| Key only, derive vars client-side | Client re-derives vars from task data; leaner rows, duplicated derivation logic | |

**User's choice:** key + vars object

| Option | Description | Selected |
|--------|-------------|----------|
| Dual: key + EN snippet | New rows keep an English prose snippet; legacy/unknown-key rows always have text to show | ✓ |
| Key only, no prose | Empty snippet; unknown-key rows render blank until client catalogue updates | |

**User's choice:** Dual: key + EN snippet

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot vars | Resolved values (title, actor name) captured at send time; pure lookup render, stable history | ✓ |
| IDs, resolve at render | Rows store IDs; names stay current but deleted-task/actor fallback needed at render | |

**User's choice:** Snapshot vars

---

## Build gate scope

| Option | Description | Selected |
|--------|-------------|----------|
| Extend i18n-scan | Add server check family to scripts/i18n-scan.mjs; same scanner, same run, plain Node | ✓ |
| Separate regression test | Dedicated test in test/; runs in test suite only, not the build | |
| Scan + test | Both; redundant belt-and-braces | |

**User's choice:** Extend i18n-scan

| Option | Description | Selected |
|--------|-------------|----------|
| Notification call sites only | Gate mailer.js/server.js notification call sites; not a whole-server prose sweep | ✓ |
| All server prose | Sweep all server user-visible prose; much bigger diff | |
| tFor() calls anywhere | Dynamic scan for tFor( wherever it appears | |

**User's choice:** Notification call sites only

| Option | Description | Selected |
|--------|-------------|----------|
| EN/FR parity check | Verify every notif.* key exists in both locales; catches "forgot translation" | ✓ |
| Existence only | Only check server-referenced keys; EN-only key stays uncaught | |

**User's choice:** EN/FR parity check

---

## Emails in scope

| Option | Description | Selected |
|--------|-------------|----------|
| Notification family only | sendNotif emails only; security alerts and invites stay English this phase; Phase 39 audit can flag them | ✓ |
| All mailer emails | Also localize security-alert and invitation emails; wider diff | |

**User's choice:** Notification family only

| Option | Description | Selected |
|--------|-------------|----------|
| Subject + body | Both localized for the recipient's locale | ✓ |
| Subject only | Only subject line localized this phase | |

**User's choice:** Subject + body

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, inbox labels too | 'Reminders' by-label and kind labels localized per viewing user's locale | ✓ |
| Labels stay English | Only snippets/subjects localize | |

**User's choice:** Yes, inbox labels too

---

## the agent's Discretion

- Exact notif.* key names beyond the flat-prefix convention
- Internal shape of the row payload (additive schema details)
- Internal structure of the new i18n-scan rule family
- Refactor mechanics of t() → tFor() delegation

## Deferred Ideas

- Localizing security-alert and invitation emails — Phase 39 Notification Audit (owner-validated)
