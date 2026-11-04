# Architecture Patterns — v1.8 Notification Sanity

**Domain:** integration of reminder-cadence rework, server-side notification i18n, daily digest email, and notification audit into the existing Projects Studio server
**Researched:** 2026-11-04
**Overall confidence:** HIGH — every claim below was verified against the live code (server.js, mailer.js, src/pages/settings.js, src/locales/, Dockerfile); no assumptions.

---

## Where the new features plug in (verified integration points)

| # | Feature | Integration point | New vs Modified |
|---|---------|-------------------|-----------------|
| 1 | Server i18n | New module + boot-time catalogue load | **New** `i18n-server.js`-style layer; **modified** `reminderSnippet()` (server.js:1336) and `mailer.js buildNotifMessage()` (:389) |
| 2 | Cadence rework | `runReminderPass()` offset selection (server.js:1385–1390) + `NOTIF_PREF_DEFAULTS` (server.js:1132) | **Modified** — delete `day_before` branch; pref semantics change |
| 3 | Daily digest | New pass inside the same 60s scheduler tick (server.js:5208) | **New** `runDigestPass()`; **modified** `queueNotifEmails()` gate |
| 4 | Audit | No new code — analysis phase over `NOTIF_EMAIL_KIND` / `NOTIF_PREF_KEYS` (server.js:1112–1172) | **Read-only + decision doc** |

---

## 1. Server-side `t()` — where it lives

### The facts

- The client catalogues are **flat-key JSON files** (`src/locales/en.json`, `fr.json`): `"common.cancel": "Cancel"`. No nesting, no ICU, no build step.
- **The server never touches them today.** All server-emitted text is hardcoded English in two places:
  - `reminderSnippet(offset, task)` — server.js:1336–1341 (`Due tomorrow:`, `Due today:`, `Past due:`) — this becomes the inbox snippet AND the email snippet (`n.snippet` → `msg.snippet` → mailer.js:392).
  - `buildNotifMessage()` — mailer.js:389–435 — subject `${actor} ${verb} ${taskTitle}` with a hardcoded English `verbs` map, plus hardcoded body copy ("Hi,", "Open the task:", the footer).
  - Also English: `buildSecurityAlertMessage` (mailer.js:~490) and `buildInviteMessage` (mailer.js:~560) — **out of scope** for this milestone (the v1.2 decision explicitly deferred the invite email), but the audit should note them.
- **The catalogues are already importable by plain Node** — this was a locked v1.2 decision ("The catalogue stays importable by plain Node, so v1.3 needs no relocation", PROJECT.md decision 12). The Docker image ships `src/` whole (Dockerfile:19 `COPY --from=build /app/src ./src`), so `src/locales/*.json` is **present at runtime** — no Dockerfile change needed.

### Recommendation: read the client catalogues directly, one shared loader

Do **not** duplicate a server catalogue. Create a small server module (new file, e.g. `i18n-server.js`, or a section near the top of server.js):

```js
// Load once at boot — the files ship in the image (Dockerfile:19), zero deps.
import { readFileSync } from 'node:fs';
const CATALOGUES = Object.fromEntries(
  ['en', 'fr'].map(loc => [loc, JSON.parse(readFileSync(new URL(`./src/locales/${loc}.json`), 'utf8'))])
);

function t(locale, key, vars = {}) {
  const cat = CATALOGUES[locale] || CATALOGUES.en;
  let s = cat[key] ?? CATALOGUES.en[key] ?? key;   // en fallback, then the key itself
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
```

Why this shape:
- **One source of truth.** The client `t()` and server `t()` read the same files; the existing `scripts/i18n-scan.mjs` build gate keeps working unchanged. A separate server catalogue would silently drift and would need its own gate.
- **Flat keys + `{name}` interpolation** is the whole syntax used in the catalogues today (v1.2 decision 6) — ~20 lines of server code, zero deps, no plural parser needed for notification strings (avoid plural keys in the new server keys; use explicit-key variants like `notif.dueToday` / `notif.pastDue` instead).
- **Locale resolution:** the recipient's locale comes from `users.locale` (the per-user column shipped in v1.2, `locale` on the account). The authority query in `queueNotifEmails` (server.js:1211–1216) already joins `users` — **add `u.locale` to that SELECT** and to the reminder pass's assignee-membership query (server.js:1367). Missing/unknown locale → `en` (the base-language fallback is the existing contract).

### What must change to make text translatable

The current flow bakes English into the **notif row snippet** at emit time (`snippet: reminderSnippet(offset, t)`, server.js:1398), then the email prints that snippet. For per-recipient locale this has to split:

- **Store a machine key in the row, not English prose.** Add to the reminder (and eventually other) notif rows: `key: 'notif.dueToday'` (or keep `type`+`offset` and derive), plus `taskTitle` available via the row's `task` id. The inbox snippet then gets localized **client-side at render** when the row has a `key` (fallback to the stored English snippet for pre-migration rows — additive, no data migration).
- **`reminderSnippet()` becomes `reminderKey(offset)`** returning a catalogue key; the English fallback text stays derivable for the legacy `snippet` field.
- **`buildNotifMessage()` gains a locale parameter.** The `verbs` map and body copy move to catalogue keys (`email.notif.subject.mention` etc.). `queueNotifEmails` resolves the recipient locale and passes `t()`-built subject/body pieces in `msg` — mailer.js stays a dumb builder (preferred) or imports `t` itself. **Keep the mailer dumb**: resolve all localized strings in server.js before calling `MAILER.sendNotif()`, so mailer.js remains pure template + the existing `escapeHtml` discipline.
- **Key inventory (new catalogue keys, EN+FR, gate-enforced):** ~3 reminder keys, ~5 subject verbs, ~4 email body frames (greeting, snippet lead, CTA, footer), ~4 digest email keys, plus digest settings UI strings. The i18n-scan gate must be pointed at the server files too (check whether it scans only `src/` — new keys used from server.js need to be either referenced from `src/` or allow-listed; verify in the plan phase).

**Anti-pattern to avoid:** localizing at *send* time inside mailer.js with an `Accept-Language`-style negotiation. There is no request context in the scheduler path; the per-user `locale` column is the only truth. Resolve in the pass, pass strings down.

---

## 2. Digest email — new pass, not a reminder-pass mutation

### Recommendation: a sibling `runDigestPass({ now })` in the same tick

Do **not** fold digest composition into `runReminderPass()`. The reminder pass is per-workspace-per-task with transactional per-(task,assignee) dedup claims; the digest is per-user over an aggregate. Two functions, same clock, same tick:

```
boot / every 60s:
  runReminderPass({ now })   // existing — unchanged shape
  runDigestPass({ now })     // new — 09:00 workspace-local, same localParts gate
```

`runDigestPass()` shape (mirrors REM-01..05 discipline):
1. Iterate workspaces; `localParts(workspaceTzLabel(doc, ws.id), at)`; skip `hour !== 9` — the digest fires at the **same 09:00 workspace time** as reminders (PROJECT.md DIGEST spec). Idle ticks stay pure reads.
2. For each account-backed member (memberships ⋈ users): read prefs via the **single accessor** `getUserNotifPrefs(userId, wsId)` (server.js:1152 — no second reader; this stays a locked invariant from Phase 34).
3. Gate: `prefs.email_digest === true` is NOT the trigger — see §4 for the opt-in inversion; the digest fires when the member opted in **and** their reminder emails are suppressed.
4. Collect tasks where `remindable(task, project)` is true (reuse the predicate verbatim — server.js:1329) **and** (`localDate === due` or `localDate > due`) **and** the project passes the member's scope check (`projectScope`/`inScopeProject`/`memberCanReadProject` — the exact Phase-29/32 chain at server.js:1374–1381; reuse, never a second pipeline).
5. Dedup: insert one `reminders_sent` row per (workspace, user, localDate) — e.g. key `digest:${ws.id}:${userId}:${localDate}` — inside a transaction before sending, so boot catch-up is harmless exactly like REM-03. **Reuses the existing table, additive key namespace, no migration.**
6. Compose one email per user from their locale's catalogue (§1): subject from `email.digest.subject`, body listing due-today + overdue tasks with deep links (`APP_URL + /w/:slug/task/:key`, same LINK-01 construction as server.js:1257).
7. Send via a new `MAILER.sendDigest(msg)` — a sibling of `sendNotif` reusing the same MIME scaffolding (`buildNotifMessage`'s boundary/headers/body assembly generalizes or is copied; mailer.js is already a copy-paste family). Fire-and-forget outside any transaction, same failure discipline (`catch → console.warn`).

**Anti-pattern to avoid:** composing the digest from the notif rows emitted by `runReminderPass`. The digest must list tasks, not notifications — a user who opted into the digest gets **no individual reminder emails at all**, so there are no reminder rows to summarize; the digest reads tasks directly from the doc (step 4). Also avoids the "reminder emitted at 09:00, digest needs it at 09:00" ordering coupling.

### Existing `email_digest` pref surprise (important)

`email_digest` **defaults to `true`** in `NOTIF_PREF_DEFAULTS` (server.js:1135) — a stub leftover. If the digest semantics were "send when true", every existing user gets a digest on day one. **The default must flip to the digest model's semantics** (see §4) — this is a deliberate behavior change to document, not an accident to preserve.

---

## 3. Cadence rework — how removing `day_before` interacts with dedup + prefs

### `reminders_sent` interaction — benign, but explicit about it

- Dedup keys are `ws:task:assignee:offset:due` (server.js:1410). Existing rows with `day_before` are **never read again** — they're only matched on insert-ignore. Removing the `day_before` offset from the offsets array (server.js:1387) means:
  - Old `day_before` rows simply become dead ballast. **No migration, no purge needed.** (Optionally a boot sweep could delete them for hygiene — additive-only migration constraint says leave them; they cost one row per historical reminder.)
  - `morning_of` and `past_due` rows keep their meaning — those keys are unchanged, so a user who already got today's `morning_of` before a deploy will not get it again. **Deploy-safe.**
- **Boot catch-up hazard, the one real trap:** the window predicate `localDate >= addDaysIso(due, -1)` for `day_before` is removed together with the offset. After deploy, the next 09:00 pass emits `morning_of` for every currently-due task whose `morning_of` key is absent — i.e. users get a one-time burst of "Due today" emails for tasks that were already at or past due. This is the same catch-up semantics REM-01 already designed (window-open + absent key = fire once); it is correct but should be called out in the release notes, and the digest rollout (which suppresses those emails for opted-in users) partially shields it.

### Pref semantics — `due_reminder` and `past_due` keep working, naming bends

- `prefs.due_reminder !== false` currently gates **both** `day_before` and `morning_of` (server.js:1386–1389). After the rework it gates **only `morning_of`** — the settings row `settings.notif.dueReminder` ("due reminders") stays semantically honest ("notify me when a task becomes due"), just with one notification instead of two. **Keep the pref key and the settings toggle unchanged**; only the description copy in the catalogue changes ("the day before and the morning of" → "the morning it is due").
- `prefs.past_due` unchanged.
- **Do NOT delete `day_before` keys** — checking `NOTIF_PREF_KEYS` (server.js:1112) and the defaults, there is no `day_before` key (it never had one; it rode `due_reminder`). Zero whitelist churn. Verify in plan phase that no stored row carries a stray `day_before` key (17-key whitelist PUT would have rejected it anyway).

---

## 4. Digest opt-in suppressing individual reminder emails

### The suppression point is `queueNotifEmails` (server.js:1219–1226), not the reminder pass

The reminder pass emits **notif rows unconditionally** (inbox + push depend on them; the milestone says push unchanged). The email decision happens downstream in `queueNotifEmails` via `NOTIF_EMAIL_KIND` → `email_reminder` gate (server.js:1166–1172, 1219–1226). Two clean options:

**Recommended — resolve in `queueNotifEmails`, one line of gate logic:**

```js
const prefs = getUserNotifPrefs(userId, wsRow.id);
if (n.type === 'due_reminder' || n.type === 'past_due') {
  if (prefs.email_digest === true && prefs.email_reminder !== false) continue; // digest replaces reminder emails
}
```

Why here:
- **Single choke point.** `queueNotifEmails` is the *only* path from reminder notif rows to email (server.js:1258 and the scheduler's post-commit fan-out at 1421–1424). Gate it once and every reminder email — boot catch-up, tick, and the test route at server.js:2829 — is suppressed consistently.
- **Pref model stays additive:** `email_digest === true` means "I read reminders in the digest" → individual reminder emails stop. `email_reminder === false` still kills all reminder email (digest or not). The existing `=== false` disables / otherwise-on convention (server.js:1150–1151) is preserved for both keys.
- **The `email_digest` default inversion (the pref-semantics change):** today `email_digest: true` by default (server.js:1135) but it's a dead stub. With real semantics, `default true` + the gate above would silently suppress ALL reminder emails for everyone on deploy unless digests are also sent to everyone — a mass behavior change. **Decision needed (flag for roadmap):** either (a) flip the default to `false`/undefined-falsy so the digest is genuine opt-in (matches "Opt-in daily digest" in the milestone goal — recommended), accepting that the default-layers comment at server.js:1107 and the settings UI (`srow` at settings.js:375) need the updated copy, or (b) keep default-on and make the digest itself on by default. The milestone text says **opt-in** → recommendation is (a): change `NOTIF_PREF_DEFAULTS.email_digest` to `false`... but note the v1.2 "zero-change switch-over" pattern (D-09) prefers *undefined-falsy* over explicit `false`: **remove `email_digest` from `NOTIF_PREF_DEFAULTS` entirely** so it reads undefined-falsy = off, and only an explicit PUT turns it on. That also keeps `getUserNotifPrefs` untouched.
- Settings UI: settings.js:375 already renders the `email_digest` toggle with `settings.notif.digest` copy — copy updated to describe the real behavior ("a single daily email at 09:00 listing due-today and overdue tasks; replaces individual reminder emails"). No new toggle needed.

**Rejected alternative — skip emitting reminder notif rows for digest users:** wrong layer; it would kill inbox notifications and push for those users, and the milestone says push unchanged.

---

## Component Boundaries (new + modified)

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `i18n` server layer (new ~30 lines in server.js or a small module) | Boot-time catalogue load from `src/locales/*.json`; `t(locale, key, vars)` with EN fallback | reminderSnippet replacement, queueNotifEmails, digest composer |
| `runReminderPass` (modified) | Drop `day_before` offset; store machine `key` (+ per-recipient resolution unchanged) | reminders_sent, notifs in doc, queueNotifEmails, users.locale |
| `runDigestPass` (new) | Per-user 09:00 aggregate over remindable tasks; dedup in reminders_sent (`digest:` namespace); localized one-email-per-user | getUserNotifPrefs, remindable, scope chain, MAILER.sendDigest |
| `queueNotifEmails` (modified) | Resolve recipient locale (`u.locale`); digest-suppression gate; pass localized strings to mailer | users, getUserNotifPrefs, MAILER.sendNotif |
| `mailer.js buildNotifMessage` / `sendDigest` (modified/new) | Dumb template builder; all copy arrives pre-localized in `msg` | MAILER callers |
| `reminders_sent` (unchanged schema) | Dedup ledger; `day_before` rows go inert; `digest:` keys added | reminder + digest passes |
| `NOTIF_PREF_DEFAULTS` (modified) | `email_digest` removed from defaults (undefined-falsy = off, opt-in) | getUserNotifPrefs, settings UI copy |
| Settings notif pages (copy-only) | Updated descriptions for due_reminder + email_digest | catalogue files |

### Data Flow (digest path, end to end)

```
tick 09:00 local → runDigestPass
  → for each member: prefs (accessor) → gate digest opt-in
  → scan doc tasks: remindable ∧ (due==localDate ∨ due<localDate) ∧ scope chain
  → transactional claim reminders_sent("digest:ws:user:date")
  → t(locale, ...) compose subject + task list + deep links
  → MAILER.sendDigest (fire-and-forget, post-commit)
```

---

## Suggested build order (dependency-driven)

1. **Server i18n layer first** (loader + `t()` + new catalogue keys EN+FR + gate coverage). Everything else localizes through it; it is a leaf with no deps.
2. **Cadence rework** (drop `day_before`, machine-key notif rows, client render of keyed snippets, pref copy). Depends on 1 for the reminder keys; smallest risk; deploy-safe via unchanged dedup keys.
3. **Localized reminder/notification emails** (queueNotifEmails locale resolution + mailer verb/body keys). Depends on 1; independent of 2's timing but naturally pairs with it since reminder snippets are the main email text.
4. **Digest pass + suppression gate + `email_digest` default inversion + MAILER.sendDigest.** Depends on 1, 3 (reuses localized frame + mailer scaffolding) and benefits from 2 (digest lists exactly the surviving offsets).
5. **Audit** last (or parallel): review every `NOTIF_EMAIL_KIND` type + `NOTIF_PREF_KEYS` toggle against the new defaults; owner-validated threshold changes only then adjust code (milestone constraint: thresholds validated by owner *before* coding).

Phases 2 and 3 can swap; 4 must follow 1+3; the audit gates any further threshold edits.

---

## Open items to verify in plan phase

- Whether `scripts/i18n-scan.mjs` scans `server.js`/`mailer.js` literals or only `src/` — new server-referenced keys may need an allow-list entry or a scanner scope extension.
- Confirm `users.locale` is populated (non-null) for all real rows or that the EN fallback path is exercised by tests.
- Exact catalogue key naming convention to adopt for server-only strings (suggest `notif.*`, `email.*` prefixes) so the client's unused-key linting doesn't fight them.
- Whether the digest email needs an unsubscribe/one-click header (RFC 8058 `List-Unsubscribe`) — likely deferred, but the audit should decide.

## Sources

- server.js:1100–1432 (prefs, queueNotifEmails, scheduler, reminder pass), :5200–5212 (boot + tick), :1258/:4108 (other queueNotifEmails call sites), :2829 (test route)
- mailer.js:389–478 (buildNotifMessage), :664–716 (createMailer API)
- src/pages/settings.js:369–401 (notif settings rows), src/locales/en.json (flat-key format)
- Dockerfile:19 (`COPY src ./src` — catalogues ship at runtime), vite.config.js:48 (client locale inlining)
- .planning/PROJECT.md (v1.2 decisions 12, 6; v1.5 REM-01..05; v1.7 SETTINGS-01..03)
