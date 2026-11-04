# Technology Stack — v1.8 "Notification Sanity" additions

**Project:** Projects Studio (gr8r)
**Researched:** 2026-11-04
**Scope:** stack additions/changes for server-side notification i18n, the daily digest email, and the reminder-offset removal — under the HARD zero-runtime-dependency rule.

## Headline verdict

**Zero new packages. Zero new dev dependencies. Zero vendored code.**

Every capability this milestone needs already exists in the repo or in Node 24's built-ins:

| New capability | Stack answer | Where it lives |
|---|---|---|
| `t()` outside the browser | Reuse `src/core/i18n.js` from the server (it is deliberately leaf, plain-Node testable) + a small locale-parameterized variant | `src/core/i18n.js` (extend) |
| FR catalogue server-side | Static ESM import of `src/locales/fr.json` + `registerCatalogue('fr', …)` | new import in server.js / i18n.js |
| Per-recipient locale | Already stored: per-account `locale` column (v1.2), `users.locale` — a JOIN, no migration | existing schema |
| Daily digest composition | Plain JS grouping over `doc.data.tasks` using the existing `localParts` / `addDaysIso` helpers | `server.js` |
| Digest email transport | Extend the hand-rolled SMTP client with one `sendDigest` builder — the MIME/boundary/UTF-8 machinery is proven (`buildNotifMessage`) | `mailer.js` |
| Digest dedup | Existing `reminders_sent` ledger with a new key shape (`…:digest:<due-date>`) — additive, no schema change | `server.js` |
| Remove `day_before` offset | Pure logic deletion in `runReminderPass` + `reminderSnippet`; zero stack | `server.js` |

## What IS new (in-repo, hand-rolled)

### 1. Server-side `t()` — extend `src/core/i18n.js`, don't fork it

`src/core/i18n.js` was designed for exactly this moment: it imports only the catalogues ("the renderer never enters this module"), guards `import.meta.glob` behind a try/catch that no-ops in plain Node, and skips the `document` mutation when absent. It is importable by `server.js` (both are ESM; server.js already does `import { createMailer } from './mailer.js'`).

The one genuine mismatch: the current `t()` reads a **module-level locale singleton** (`getLocale()`), correct for a browser where there is one user per page — wrong for a server sending concurrent emails to recipients with different locales. A per-request or per-recipient loop that calls `setLocale()` between sends works (catalogue loading is async, translation is sync, sends are fire-and-forget), but it is a latent interleaving bug: two queued sends awaited out of order would translate with the wrong locale.

**Recommendation: add a locale-parameterized pure function alongside the singleton — do not replace it.**

```js
// src/core/i18n.js — additive; the browser t() stays untouched
export function tIn(localeCode, key, vars) {
  const active = catalogues.get(localeCode) || catalogues.get(BASE_LOCALE);
  // …same resolution/plural/interpolate logic as t(), parameterized.
}
```

Refactor `t()` to `tIn(locale, key, vars)` internally so there is exactly one resolution path (one escape hatch = one place to fix). Server call sites pass the recipient's locale resolved from `users.locale` via the existing memberships/users JOIN (`queueNotifEmails` already builds that `authority` map — add `u.locale` to its SELECT). Unknown/null locale falls back to `en` — the same clamping `activateLocale` already does.

**Node-side catalogue loading:** `import.meta.glob` is Vite-only, so the FR catalogue must be statically imported in the i18n module (or read with `node:fs` + `registerCatalogue`). Static import is better: it is parsed once at boot, it ships in the Docker image automatically (this is also the moment the v1.2 deferral "the server image ships no catalogue" gets retired — no Dockerfile change needed since `src/` is copied into the runtime stage), and it keeps the i18n-scan gate authoritative. The EN catalogue is already statically imported (`import en from '../locales/en.json' with { type: 'json' }`) — plain Node ≥22 supports import attributes.

**Plurals and dates:** already solved with zero dependencies. `Intl.PluralRules` (cached per locale in i18n.js) handles FR's `one/many/other`; `Intl.DateTimeFormat` with `timeZone` already powers `localParts()`. `Intl.MessageFormat` does **not** exist in Node 24 (verified: `typeof Intl.MessageFormat === 'undefined'` on v24.21.0) — so no richer ICU syntax; the existing `{name}` + `{n, plural}` subset is the ceiling. Same subset, same house style (no-break space before `:` in FR, curly apostrophe) applies to the new email keys.

**i18n-scan gate:** the new server keys (`notif.digest.subject`, `notif.digest.body`, `notif.reminder.dueToday`, …) land in the same flat `src/locales/{en,fr}.json` catalogues, so `scripts/i18n-scan.mjs` coverage and the EN+FR milestone gate apply unchanged. New keys are EN+FR complete at commit time.

### 2. Digest email — one new builder in `mailer.js`

The SMTP client (`mailer.js`, ~700 lines, `node:net`/`node:tls`/`node:crypto` only) already does the hard parts: EHLO/STARTTLS/AUTH, RFC 2047 header encoding (`encodeWord`), UTF-8 base64 bodies, `multipart/alternative` with boundary + dot-stuffing, `Auto-Submitted: auto-generated`. A digest is not a new transport — it is a **new message builder** following the `buildNotifMessage` pattern:

- `buildDigestMessage(config, { to, locale, workspace, dueToday[], overdue[], url })` — same table-layout HTML + plain-text alternative, a `<ul>` of task links instead of one sentence, subject via `tIn(locale, 'notif.digest.subject', { workspace })`.
- Add `sendDigest(msg)` next to `sendNotif` in the `createMailer` return object (and a throwing stub in the disabled branch, same as `sendSecurityAlert`).
- One SMTP session per digest (already the pattern — `new SmtpSession(config)` per send, `destroy()` in `finally`). Digest is fire-and-forget like every other send: failures logged, never surfaced.

No templating library. No `nodemailer`. No `mjml`/`handlebars`. The existing inline-styled HTML template approach (boring, table-based, email-client-proof) is the right one and is already battle-tested in this codebase.

### 3. Digest composition & scheduling — reuse the reminder pass skeleton

The digest runs in the same 09:00 workspace-local window as reminders, so it rides `runReminderPass`'s existing scaffolding: injectable clock, per-workspace `localParts()` hour gate, `TZ_BY_LABEL`, `addDaysIso` string arithmetic, boot catch-up, `reminders_sent` dedup. Grouping is a plain `for` over `doc.data.tasks` filtered by `remindable()` (due === localDate → today; due < localDate → overdue), bucketed per recipient (assignee), gated on the now-real `email_digest` pref.

Dedup key: `${ws.id}:${userId}:digest:${dueDate}` — one digest per user per local day, exactly-once, using the same `insert or ignore` transactional claim. The stub pref needs no migration: it is already in `NOTIF_PREF_KEYS`/`NOTIF_PREF_DEFAULTS` (default `true`; the roadmap may want to flip the default to `false` for opt-in — that is a one-line defaults change, not a stack item).

### 4. `day_before` removal — delete, don't deprecate

No stack. Remove the `localDate >= addDaysIso(due, -1)` branch and the `day_before` string from `reminderSnippet`. Historical `reminders_sent` rows with `:day_before:` keys simply never match again (the key shape includes the offset, so no collision, no migration, no cleanup pass needed — the ledger is append-only history). The `NOTIF_PREF_DEFAULTS.due_reminder` toggle continues to govern "due today" alone.

## Alternatives considered (and rejected under the zero-dep rule)

| Category | Recommended | Alternative | Why not |
|---|---|---|---|
| Server i18n | Extend `src/core/i18n.js` with `tIn()` | `i18next` (~40 kB, full framework) | Massively larger than the layer it replaces; the v1.2 decision already measured this: "every candidate library measured is bigger than the layer it would replace." Also `import.meta`-bundled, awkward under plain Node ESM. |
| Server i18n (2) | `tIn()` pure function | Reusing the singleton `t()` with `setLocale()` per send | Interleaving bug across concurrent fire-and-forget sends; two pipelines to keep in sync. |
| Message formatting | Existing `{name}` + `Intl.PluralRules` subset | `@formatjs/intl-messageformat`, `ICU4X` | Needs a parser for richer ICU syntax; `Intl.MessageFormat` doesn't exist in Node 24; the subset covers every planned email string. |
| Email composition | Hand-rolled `buildDigestMessage` in `mailer.js` | `nodemailer`, `email-templates`, `handlebars` | All violate the hard rule; `nodemailer` alone would be the project's first runtime dependency. The SMTP session layer already works and is tested. |
| Digest scheduling | Inside `runReminderPass` (same tick) | Separate `setInterval` / `node-cron` | `node-cron` is a dependency; a second timer duplicates the clock-injection, boot-catch-up and DST handling the reminder pass already solved. Same 09:00 gate = one window, one set of DST semantics. |
| Template engine | String building + existing `escapeHtml` | Template libs | The three existing builders show the pattern scales to a fourth; escapeHtml + table HTML is enough for a two-section list email. |

## Versions / platform anchors

| Anchor | Version | Verified |
|---|---|---|
| Node runtime | `node:24-alpine` (Dockerfile), `node >= 24` (package.json), local v24.21.0 | ✅ read from repo |
| `Intl.PluralRules` / `Intl.DateTimeFormat` with `timeZone` | full-icu built into Node since v13 | ✅ used in production code paths today |
| `Intl.MessageFormat` | does not exist in Node 24 | ✅ `typeof Intl.MessageFormat === 'undefined'` |
| Import attributes (`import … with { type: 'json' }`) | stable in Node ≥ 22 | ✅ already imported by `src/core/i18n.js` |
| Runtime npm dependencies | **0** (dev: `@playwright/test` only) | ✅ unchanged by this milestone |

No third-party library is proposed, so no Context7 version pin applies — the honest stack statement is *nothing to install*.

## What NOT to add (zero-dep rule, explicit)

- **No i18n/npm library** — even a "tiny" one. The catalogue files + `tIn()` are smaller than any candidate's install size.
- **No nodemailer / SMTP library** — `mailer.js` speaks enough SMTP and is proven against the operator's relay.
- **No scheduler/cron package** — the unref'd 1-minute tick + hour gate + ledger dedup is the scheduler.
- **No HTML email framework** — one static inline-styled table template, same as the three existing builders.
- **No database migration** — the digest dedup rides `reminders_sent` with a new key shape; the `email_digest` pref row already exists; `users.locale` already exists. (If the roadmap adds a *per-workspace digest send time*, that would need an additive column — current scope says fixed 09:00, so nothing.)
- **No Dockerfile change** — `src/` is already copied into the runtime image; the FR catalogue ships automatically. This formally retires the v1.2 out-of-scope note "the server image ships no catalogue."

## Installation

```bash
# Nothing. Zero new packages — the milestone's stack work is all in-repo:
#   - extend src/core/i18n.js with tIn() + server-side catalogue registration
#   - extend mailer.js with buildDigestMessage / sendDigest
#   - extend server.js: locale JOIN in queueNotifEmails, digest pass, offset removal
npm ci   # unchanged; suite still runs on the same deps
```

## Sources

- `server.js` — NOTIF_PREF_KEYS/PREFS (l.1107–1164), queueNotifEmails (l.1179–1268), reminder pass + localParts/addDaysIso/reminderSnippet (l.1270–1429) — read directly, HIGH confidence
- `mailer.js` — full SMTP client, buildNotifMessage/buildSecurityAlertMessage/buildInviteMessage pattern — read directly, HIGH confidence
- `src/core/i18n.js` — leaf-module design, singleton locale, PluralRules caching, Node-safe loader no-op — read directly, HIGH confidence
- `src/locales/en.json` — flat key → string | plural-object shape — read directly, HIGH confidence
- `.planning/PROJECT.md` — zero-dep standing constraint, v1.2 decision #12 (server catalogue deferral), Node 24 platform — HIGH confidence
- Node 24 runtime probes (`node -e`, Dockerfile) — HIGH confidence
