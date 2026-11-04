# Phase 36: Server Notification i18n - Pattern Map

**Mapped:** 2026-11-04
**Files analyzed:** 10 (4 modified source files, 2 catalogue files, 1 scanner, 3 new test files)
**Analogs found:** 10 / 10 (all modified files are self-analogs — extend existing in-file structure; new test files match existing suites)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/i18n.js` (modify) | utility (shared core) | transform | itself — `t()` at lines 175-185, `resolvePlural` at 166-173 | exact (self) |
| `src/locales/en.json` (modify) | config (catalogue) | CRUD (flat map) | itself — existing `notif.*` block lines 1667-1674 | exact (self) |
| `src/locales/fr.json` (modify) | config (catalogue) | CRUD (flat map) | `src/locales/en.json` | exact |
| `server.js` (modify) | controller/service | request-response + batch | itself — boot imports (48-58), `queueNotifEmails` (1179-1268), `runReminderPass` (1348-1429) | exact (self) |
| `mailer.js` (modify) | service | request-response (SMTP) | itself — `buildNotifMessage` (393-475), `sendNotif` (686-693) | exact (self) |
| `src/pages/inbox.js` (modify) | component | transform (render) | itself — `notifText(n)` (44-65) | exact (self) |
| `scripts/i18n-scan.mjs` (modify) | utility (build gate) | batch/transform | itself — `scanCatalogueKeys` (1155-1180), `scanSource` (1226-1246), `main` (1420-1452) | exact (self) |
| `test/i18n-tfor.test.mjs` (new) | test (unit) | — | `test/i18n-core-features.test.mjs` | role-match |
| `test/notif-i18n.test.mjs` (new) | test (integration + client render) | — | `test/due-reminders.test.mjs` (server side), `test/notif-hydration.test.mjs` (client side) | role-match |
| `test/i18n-scan.test.mjs` (extend) | test (unit) | — | itself — `fixtureTree` pattern (25-33) | exact (self) |

## Pattern Assignments

### `src/core/i18n.js` — add `tFor()` (utility, transform)

**Analog:** itself — the exact lookup core that `tFor()` refactors into parameterized form.

**Lookup + fallback core** (`t`, lines 175-185) — this is the body `tFor` generalizes; `t()` must delegate to it:

```js
export function t(key, vars) {
  const active = catalogues.get(locale);
  let value = active && Object.hasOwn(active, key) ? active[key] : undefined;
  if (value === undefined) {
    const base = catalogues.get(BASE_LOCALE);
    value = base && Object.hasOwn(base, key) ? base[key] : undefined;
  }
  if (typeof value === 'string') return interpolate(value, vars);
  if (value && typeof value === 'object') return resolvePlural(value, vars) ?? key;
  return key;
}
```

**Unknown-code clamp pattern** (`activateLocale`, lines 48-51) — copy this clamping semantics into `tFor` (never throw, unknown → base):

```js
const known = LOCALES.some(l => l.code === code);
const target = known ? code : BASE_LOCALE;
```

**CRITICAL — plural resolver reads the singleton** (`resolvePlural`, lines 166-173). `tFor('fr', …)` must thread its code through `rulesFor` or French plurals render with the singleton's locale:

```js
function resolvePlural(value, vars) {
  const raw = vars ? vars.n : undefined;
  const count = raw === undefined || raw === null ? NaN : Number(raw);
  const category = Number.isFinite(count) ? rulesFor(locale).select(count) : 'one';
  ...
}
// rulesFor(code) at lines 154-161 is ALREADY parameterized — only the call site (line 169) is not.
```

**Registration API** (lines 29-36) — already exists, no new machinery needed:

```js
export function registerCatalogue(code, data) {
  catalogues.set(code, data || {});
  return code;
}
registerCatalogue(BASE_LOCALE, en);   // static JSON import, line 6: import en from '../locales/en.json' with { type: 'json' }
```

**Escaping discipline** (lines 135-140): `t()` never escapes; callers escape at the point of interpolation. `tFor` must follow the same split. `interpolate` (lines 144-147) is already locale-free and reusable as-is.

**Leaf-module header contract** (lines 1-5): imports nothing from the app graph — keep it that way; the server imports this module.

---

### `src/locales/en.json` / `src/locales/fr.json` — add `notif.*` server keys (config, flat map)

**Analog:** the existing client `notif.*` block, en.json lines 1667-1674 (verbatim):

```json
  "notif.mention": "mentioned you in",
  "notif.assign": "assigned you",
  "notif.comment": "commented on",
  "notif.update": "moved to {status}",
  "notif.projectAtRisk": "is at risk",
  "notif.taskDueToday": "is due today",
  "notif.dueReminder": "is coming due",
  "notif.pastDue": "is overdue",
```

Rules to copy: flat `"notif.*"` keys (never nested objects), `{name}` placeholders for interpolation, plural values as `{ "one": "…", "other": "…" }` objects (see `common.starterTasks`, lines 1678-1681, for the plural shape). **Do not touch the 8 existing keys** — server keys go under a distinct flat sub-prefix (`notif.reminder.*`, `notif.email.*`). fr.json mirrors the same shape; its existing values use typographic apostrophes (U+2019).

---

### `server.js` — boot registration, keyed rows, per-recipient locale (controller/service, batch)

**Analog:** itself — three distinct in-file patterns to extend.

**1. Import precedent** (lines 55-58) — the server already imports from `./src/`:

```js
import { createMailer } from './mailer.js';
...
import { referencesHidden } from './src/lib/redaction.js';
```

Boot registration (D-02) follows this shape:
```js
import fr from './src/locales/fr.json' with { type: 'json' };
import { registerCatalogue } from './src/core/i18n.js';
registerCatalogue('fr', fr);
```

**2. Recipient authority query** (`queueNotifEmails`, lines 1211-1216) — add `u.locale` to exactly this query:

```js
const authority = new Map(
  db
    .prepare('select m.member_id, m.user_id, u.name, u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = ?')
    .all(wsRow.id)
    .map(r => [r.member_id, r]),
);
```

**3. Per-recipient send loop** (lines 1217-1267) — locale is resolved per recipient inside the loop (never `setLocale()`); the `'Reminders'` by-label at line 1250 is the D-11 literal (note the inlined-reminder-check comment at 1174-1177: source-extraction tests evaluate this line standalone — read `test/notif-email-link.test.mjs` before editing):

```js
const by = ['due_reminder', 'past_due'].includes(n.type) ? 'Reminders' : authority.get(n.by)?.name || profiles.get(n.by)?.name || 'Un membre';
...
MAILER.sendNotif({
  to,
  workspace: wsName,
  by,
  task: taskTitle,
  snippet: n.snippet || '',
  kind: n.type,
  url,
}).catch(err => console.warn(`notif email ${n.id} → ${to}: ${err.message}`));
```

**4. Keyed reminder row producer** (`runReminderPass`, lines 1391-1414) — the new `key`/`vars` fields are additive on this exact object:

```js
const notif = {
  id: uid(),
  type: offset === 'past_due' ? 'past_due' : 'due_reminder',
  to: t.assignee,
  by: null, // system actor — queueNotifEmails' self-skip must never drop a reminder
  task: t.id,
  snippet: reminderSnippet(offset, t),
  /* Client notif contract is `at` + `read` (store.js notifyMembers) —
     `ts` kept only for existing test assertions. */
  at: at.getTime(),
  read: false,
  ts: at.getTime(),
};
...
updateDoc(ws.id, d => {
  d.data.notifs.push(notif);
});
```

**5. `reminderSnippet` — the prose being replaced** (lines 1336-1341, verbatim):

```js
function reminderSnippet(offset, task) {
  const title = task?.title || 'a task';
  if (offset === 'day_before') return `Due tomorrow: ${title}`;
  if (offset === 'morning_of') return `Due today: ${title}`;
  return `Past due: ${title}`;
}
```

Three offsets → three `notif.reminder.*` keys. Keep writing the EN snippet (D-06 dual store); add `key` + `vars: { title }` snapshot (D-05).

**6. Locale vocabulary** (line 137): `const LOCALE_CODES = ['en', 'fr'];` — note TWO locale vocabularies exist in-repo (server's `LOCALE_CODES`, i18n's `LOCALES`); `tFor` should clamp against the i18n one.

---

### `mailer.js` — localized sendNotif family (service, request-response)

**Analog:** itself — `buildNotifMessage` (lines 393-475) is the D-10 localization site; the security-alert builder (480+) stays English.

**Verbs table + subject composition** (lines 403-411, verbatim):

```js
const verbs = {
  mention: 'mentioned you in',
  assign: 'assigned you to',
  comment: 'commented on',
  update: 'updated',
};
const verb = verbs[msg.kind] || 'updated';

const subject = `${actor} ${verb} ${taskTitle}`;
```

**Body literals to extract** (lines 412-434): `'Hi,'`, `` `${actor} ${verb} "${taskTitle}" on ${workspace}.` ``, `'Open the task:'` (both text and the HTML button at line 433), and the footer sentence (line 421 text + line 434 HTML). All become `tFor(locale, 'notif.email.*', vars)`.

**Escaping layers to preserve exactly** (lines 431, 433, 447):

```js
<strong>${escapeHtml(actor)}</strong> ${escapeHtml(verb)} ...      // HTML body: escapeHtml AFTER interpolation
`Subject: ${encodeWord(subject)}`                                   // header: encodeWord AFTER interpolation
```

tFor renders raw; `escapeHtml`/`encodeWord` stay applied AFTER interpolation — never inside the catalogue lookup (mojibake pitfall with French U+2019 apostrophes).

**sendNotif entry** (lines 686-693): fire-and-forget, `.catch` logging at the caller. Pass `locale` in `msg` (or pre-render — planner decides per Open Question 1, but keep all `notif.email.*` call sites in exactly one file).

---

### `src/pages/inbox.js` — keyed-row render branch (component, transform)

**Analog:** itself — `notifText(n)` (lines 44-65) already has the two-branch shape the keyed branch slots into:

```js
export function notifText(n) {
  ...
  /* Legacy rows still carry a stored English text fragment — render it verbatim (D-12, no migration). */
  if (n.text) {
    ...
  }
  /* Structured rows compose the sentence through the notif.* catalogue keys in the active locale. */
  /* D-27-4: reminder rows are system-actor (by:null) — guard them BEFORE the
     generic !n.by branch ... */
  if ((n.type === 'due_reminder' || n.type === 'past_due') && tgt)
    return `<b style="font-weight:600">${esc(tgt.title)}</b> <span class="muted">${t(n.type === 'due_reminder' ? 'notif.dueReminder' : 'notif.pastDue')}</span>`;
  ...
}
```

New keyed branch order (D-04/D-06): `n.text` verbatim (existing) → `n.key` + `n.vars` via `t(n.key, n.vars)` with unknown-key fallback to `n.snippet` prose → structured-type composition (existing). The snippet line (line 80, `${fmtComment(n.snippet)}`) is where keyed rows localize their preview too. Imports pattern (lines 2-8): `import { t } from '../core/i18n.js'` — client uses singleton `t()`, which reads the viewer's locale automatically.

---

### `scripts/i18n-scan.mjs` — server key family + parity gate (utility, batch)

**Analog:** itself — the catalogue-key family to mirror.

**The rule pattern to copy** (`scanCatalogueKeys`, lines 1155-1180) — position-based, token-walk, skip composed keys:

```js
function scanCatalogueKeys(tokens, file, findings, lineAt, catalogue) {
  if (!catalogue) return;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'ident' || t.value !== 't') continue;
    const open = tokens[i + 1];
    if (!open || open.type !== 'punc' || open.value !== '(') continue;
    const key = tokens[i + 2];
    if (!key || key.type !== 'str') continue; // a dynamic key is not checked here
    const after = tokens[i + 3];
    if (after && after.type === 'punc' && (after.value === '+' || after.value === '.')) continue; // a composed key
    const name = key.value;
    if (!Object.hasOwn(catalogue, name)) {
      emit(findings, file, lineAt, key.start, 'unresolved', name);
      continue;
    }
    ...
  }
}
```

The new server family: same walk, but match `tFor` (and `t`) calls whose first literal starts with `notif.`, over server.js + mailer.js only, checking resolution in **en.json AND fr.json** (D-07). Do NOT reuse the `callVars` placeholder check for server call sites (server vars are runtime snapshots — false mismatches; Pitfall 3).

**The exported lexer machinery** (lines 382-464): `lex` (exported via `scanSource`'s use; `lex`, `analyse`, `scanSource`, `scanTree`, `compare`, `main` all exported) — reuse, no rewrite.

**Exit-code contract** (`main`, lines 1446-1452) — the server family must feed `violations` the same way:

```js
const violations = verdict.unlisted.length + verdict.stale.length + verdict.unresolved.length + verdict.mismatch.length;
if (violations) {
  console.error(`i18n scan FAILED — ${violations} violation(s).`);
  return 1;
}
return 0;
```

**Allow-list isolation** (lines 1385-1409): `compare()` flags allow-list entries not found as `stale` — keep `scanTree('src')` output byte-compatible; the server family is a separate additive scan so the `test/fixtures/i18n-pending.json` progress meter is untouched.

**Parity gate** (D-09): a new check that the `notif.*` key sets in en.json ↔ fr.json are identical — plain Node over the two catalogue JSONs (see `readCatalogue`, lines 1201-1207, for the load pattern).

---

### `test/i18n-tfor.test.mjs` (new, unit)

**Analog:** `test/i18n-core-features.test.mjs`

Imports pattern (lines 17-24):

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import en from '../src/locales/en.json' with { type: 'json' };
import { t } from '../src/core/i18n.js';
import { scanSource } from '../scripts/i18n-scan.mjs';
```

Header-comment + test-family structure (lines 1-16): a `/* ==== */` header naming the contract, then numbered families of `test()` blocks with English-oracle assertions (`assert.equal(t('key'), 'exact English')`). For i18n-tfor: oracle tests for `tFor('en'|'fr', …)`, `t()` ≡ `tFor(getLocale(),…)`, singleton-unchanged while rendering FR (plural pin — Pitfall 1), unknown-locale clamp, never-throw guard.

### `test/notif-i18n.test.mjs` (new, integration + client render)

**Analogs:** `test/due-reminders.test.mjs` (server side) and `test/notif-hydration.test.mjs` (client side).

Server harness pattern (`due-reminders.test.mjs`, lines 9-40): real server + SQLite via helpers, clock injection:

```js
import { after, before, test } from 'node:test';
import { startServer, withDb, signup, client } from './helpers/server.mjs';
...
const trigger = (nowIso, srv = server) =>
  fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
    body: JSON.stringify({ now: nowIso }),
  })...
```

Client-module pattern (`notif-hydration.test.mjs`, lines 10-21): stub browser globals BEFORE loading the module under test:

```js
const backing = new Map();
globalThis.localStorage = { getItem: ..., setItem: ..., removeItem: ..., clear: ... };
globalThis.document = { querySelectorAll: () => [] };
const { ... } = await import('../src/core/notifPrefs.js');
```

For the inbox branch: stub `localStorage`/`document`, `primeLocale('fr')`, import `notifText` from `../src/pages/inbox.js`, assert keyed row renders FR, legacy `n.text` row renders verbatim, unknown key falls back to `n.snippet`. For the email side: SMTP capture following the existing mailer-test pattern (due-reminders' `node:net` capture or the notif-email-link source-extraction precedent).

### `test/i18n-scan.test.mjs` (extend, unit)

**Analog:** itself — `fixtureTree` (lines 25-33) is the pattern for the new server-family and parity cases:

```js
function fixtureTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-scan-'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
  return dir;
}
```

Scan synthetic server.js/mailer.js snippets through `scanSource` (or the new exported family function) with catalogue fixtures; assert missing-FR → violation, parity drift → violation.

---

## Shared Patterns

### Leaf-module import discipline
**Source:** `src/core/i18n.js` lines 1-5; precedent `server.js:58` (`import { referencesHidden } from './src/lib/redaction.js'`)
**Apply to:** server boot registration and all `tFor` call sites — i18n.js imports nothing from the app graph; the server imports i18n.js, never the reverse.

### Fail-safe clamping (never throw)
**Source:** `src/core/i18n.js` lines 48-51 (unknown code → base) and `t()`'s return-the-key fallback (line 184)
**Apply to:** `tFor()` — one clamp inside `tFor` (unknown/malformed/null locale → `'en'`), one try/catch at the mailer call boundary (SC-5). Missing catalogue key → EN text, never blank (D-06).

### Escape at the call site, never in the lookup
**Source:** `src/core/i18n.js` lines 135-140; `mailer.js` lines 431, 433, 447
**Apply to:** all server render paths — `escapeHtml` into HTML bodies and `encodeWord` on Subject headers applied AFTER `tFor` interpolation.

### Per-recipient resolution inside the loop (no global mutation)
**Source:** `server.js` lines 1211-1267 (prefs resolve per recipient via the authority map — same shape locale uses)
**Apply to:** queueNotifEmails and every server render — always `tFor(code, …)`, never `setLocale()`.

### Additive JSON payload, zero migration
**Source:** `server.js` lines 1392-1414 (notif row pushed into `d.data.notifs`); house invariant REQUIREMENTS.md
**Apply to:** keyed rows — `key`/`vars` are additive fields on the existing object; `snippet` write is never removed (D-06).

### Test file conventions
**Source:** `test/i18n-core-features.test.mjs` (unit + oracle), `test/due-reminders.test.mjs` (server integration), `test/notif-hydration.test.mjs` (client module with stubbed globals)
**Apply to:** all three test files — `node:test` + `node:assert/strict`, header comment naming the contract, `/* ---- label ---- */` section separators.

## No Analog Found

None — every new file has an existing in-repo analog.

## Metadata

**Analog search scope:** `src/core/`, `src/pages/`, `src/locales/`, repo root (`server.js`, `mailer.js`), `scripts/`, `test/`
**Files scanned:** ~14 (10 primary reads, all git-tracked via `git ls-files`)
**Pattern extraction date:** 2026-11-04
