# Phase 37: Reminder Cadence Rework - Pattern Map

**Mapped:** 2026-11-04
**Files analyzed:** 6
**Analogs found:** 6 / 6 (all self-analog — this phase modifies existing files; patterns come from the files' own established conventions)

**Nature of phase:** Pure logic deletion + test rewrite. No new files, no new dependencies, no schema change. The "pattern" for each surface is the file's own current code — excerpts below are the exact regions to delete or edit, plus the exact conventions the rewritten tests must follow.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (runReminderPass / reminderSnippet) | service (scheduler) | event-driven (09:00 tick / boot / test clock) | self — `server.js:1355-1360, 1404-1421` | exact (self) |
| `src/locales/en.json` | config (i18n catalogue) | transform (key→string) | self — `:1249-1250, :1675` | exact (self) |
| `src/locales/fr.json` | config (i18n catalogue) | transform | self — `:1249-1250, :1675` | exact (self) |
| `test/due-reminders.test.mjs` | test (integration, clock replay) | event-driven | self — full file (Phase 27 harness) | exact (self) |
| `test/notif-i18n.test.mjs` | test (i18n render pins) | transform | self — `:316-457` | exact (self) |
| `test/i18n-pages.test.mjs` | test (settings copy table) | transform | self — `:440-463` | exact (self) |

All analog paths verified git-tracked (`git ls-files` non-empty for all).

## Pattern Assignments

### `server.js` — runReminderPass deletion surface (service, event-driven)

**Analog:** self, `server.js:1355-1360, 1404-1421` (verified verbatim in RESEARCH.md session reads)

**Delete — reminderSnippet day_before branch** (line ~1357):
```js
function reminderSnippet(offset, task) {
  const title = task?.title || 'a task';
  if (offset === 'day_before') return `Due tomorrow: ${title}`;   // ← DELETE
  if (offset === 'morning_of') return `Due today: ${title}`;
  return `Past due: ${title}`;
}
```

**Delete — offsets block day_before arm** (lines ~1404-1411). KEEP the `>=` window predicates (D-01) and the prefs gates exactly as positioned (security: scope predicates must not be reordered):
```js
const offsets = [];
if (prefs.due_reminder !== false) {
  if (localDate >= addDaysIso(due, -1)) offsets.push('day_before');  // ← DELETE
  if (localDate >= due) offsets.push('morning_of');                   // ← KEEP (catch-up predicate)
}
if (prefs.past_due !== false && localDate > due) offsets.push('past_due');
```

**Simplify — key-mapping ternary** (line ~1421):
```js
// BEFORE:
key: `notif.reminder.${offset === 'day_before' ? 'dayBefore' : offset === 'morning_of' ? 'morningOf' : 'pastDue'}`,
// AFTER:
key: `notif.reminder.${offset === 'morning_of' ? 'morningOf' : 'pastDue'}`,
```

**DO NOT TOUCH:** dedup claim (`INSERT OR IGNORE` into `reminders_sent`, ~1432-1441) — key keeps its `:due` component (D-02, one-way decision); notif row construction `{ key, vars: { title }, snippet }`; email fan-out (`queueNotifEmails`); D-27 scheduler header comments (~1290) documenting the 09:00/catch-up invariants.

**DO NOT "fix":** `localDate >= due` for morning_of — the open window is the boot catch-up mechanism; the post-deploy one-time burst is documented in SC-5 release notes, not prevented (Pitfall 4).

---

### `src/locales/en.json` / `src/locales/fr.json` (config, transform)

**Analog:** self, lines 1249-1250 (settings copy) and 1675 (catalogue).

**Delete both dayBefore catalogue entries** (line 1675 in each file):
```json
"notif.reminder.dayBefore": "Due tomorrow: {title}",                     // EN
"notif.reminder.dayBefore": "À échéance demain : {title}",               // FR
```
Keep `notif.reminder.morningOf` / `notif.reminder.pastDue` (en.json:1676-1677) untouched.

**Update settings copy** (lines 1249-1250 in each file — singular pair only):
```json
// EN — target values (final wording at planner's discretion per D-04):
"settings.notif.dueReminder": "Due-day reminder",
"settings.notif.dueReminderDesc": "Get a reminder on the morning a task is due.",
// FR:
"settings.notif.dueReminder": "Rappel le jour d'échéance",
"settings.notif.dueReminderDesc": "Recevez un rappel le matin de l'échéance d'une tâche.",
```

**DO NOT TOUCH:** the PLURAL pair `settings.notif.dueReminders` / `settings.notif.dueDesc` (en.json:1254) — labels the `push_due` toggle, a different preference (Pitfall 3). Email copy keys (`mailer.js:415-428`, en/fr.json:1684-1685) are cadence-neutral already — expect zero changes (D-05).

**Shared-label trap (Pitfall 2):** `settings.notif.dueReminder` is rendered in TWO places — `src/pages/settings.js:385` (toggle) AND `src/pages/inbox.js:16` (inbox filter label for `due_reminder`). Renaming the value changes both. Planner decides: accept collateral or split a new key for the inbox filter. No code change needed in settings.js/inbox.js either way — they read via `t()`.

**Gate:** catalogue deletion and server.js deletion MUST land in the same commit — `npm run i18n:scan` fails if either side lands alone (unresolved server key OR EN↔FR parity mismatch).

---

### `test/due-reminders.test.mjs` (test, event-driven clock replay) — REWRITE pins + ADD D-06 pin

**Analog:** self — the file IS the pattern. Verified conventions the new/rewritten tests must follow:

**Harness pattern** (lines 9-41, 109-117):
```js
import { startServer, withDb, signup, client } from './helpers/server.mjs';
const TOKEN = 'reminder-test-token';
/* Clock injection — no sleeps, no fake timers. */
const trigger = (nowIso, srv = server) =>
  fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => { assert.equal(r.status, 200); return (await r.json()).emitted; });
const at9 = iso => new Date(`${iso}T09:00:00Z`).toISOString();  // 09:00 local → UTC instant
// before(): server = await startServer({ dataDir: tempDir, env: { MASTER_KEY, REMINDER_TEST_TOKEN: TOKEN } });
```

**Fixture pattern** (`makeWorkspace`, lines 48-88): one shared owner account per server (signup throttled 5/hour/IP — line 43), unique task ids per fixture (the pass scans ALL workspaces — line 7), prefs via `user_notif_prefs` DB row not doc fields (lines 76-85), assertions filter with `own(emitted)`.

**Tests to REWRITE (currently pin day_before — go red on deletion):**
- Line 133-174 (`REM-02/03`): due-date-morning assertion `emitted.length === 2` → `=== 1` (morning_of only); drop the `:day_before:2026-01-15` key assertion (line 152); keep the re-arm-on-due-edit block (lines 164-174, proves D-02) and second-pass no-op block (159-162, REM-03).
- Lines 193-215 (`day_before` window matrix) and 217-230 ("both offsets in one pass"): delete or restate for morning_of/past_due only — the month-rollover pure-string-math idea can survive as a morning_of/past_due variant if useful, but no day_before content.
- Lines 234-262 (`REM-04` gating): `['tOk', 'tOk']` → `['tOk']` (one offset now).
- Lines 283-295, 299-327 (prefs gates): `emitted.length === 2` → `=== 1` where it counts due-day offsets; gating logic itself unchanged.
- Line 331-341 (DST): drop the day_before arm (line 337); keep the PDT morning_of and UTC-fallback assertions.
- Lines 415-459 (REM-05 email): `emitted.length === 2` → `=== 1` in the email fan-out sub-tests; SMTP sink, deep-link and self-skip assertions survive unchanged.

**Test to ADD (D-06 / REM-03 regression pin)** — skeleton from RESEARCH.md, following the file's own conventions verbatim:
```js
test('REM-03: past-due fires exactly once across many mornings (regression pin)', async () => {
  const { ws, own } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })]);
  const onDue = own(await trigger(at9('2026-01-15')));
  assert.equal(onDue.filter(n => n.type === 'due_reminder').length, 1, 'exactly one morning_of');
  const after = own(await trigger(at9('2026-01-16')));
  assert.equal(after.filter(n => n.type === 'past_due').length, 1, 'exactly one past_due');
  for (const day of ['2026-01-17', '2026-01-20']) {
    assert.equal(own(await trigger(at9(day))).length, 0, `nothing re-fires on ${day}`);
  }
});
```
No schema-level `reminders_sent` assertions in the new pin (D-06) — behavior assertions only.

---

### `test/notif-i18n.test.mjs` (test, transform) — REWRITE one pin, KEEP one untouched

**Analog:** self, lines 360-457.

**REWRITE** the dayBefore emission pin (lines 365-380): the test at ~356 triggers a reminder pass and asserts `keys.has('notif.reminder.dayBefore')` (line 374) and `rows.length >= 2` (372), drains 2 emails (368). Restate using morning_of as the keyed-row source: `keys.has('notif.reminder.morningOf')`, `rows.length >= 1`, `waitFor(smtp, 1, ...)`, snippet match `/Due today: Clé à molette/`.

**KEEP UNTOUCHED — this is the REM-04 inert-rows guarantee** (lines 448-457):
```js
test('I18N-03: the day_before key renders despite its producer going inert in Phase 37 (coverage continuity)', async () => {
  const { notifText } = compileInbox({ task: fixtureTask });
  await primeLocale('fr');
  try {
    assert.ok(squeeze(notifText(keyedRow({ key: 'notif.reminder.dayBefore', snippet: 'Due tomorrow: Rapport naïf' }))).includes('À échéance demain : Rapport naïf'));
  } finally { await primeLocale('en'); }
  ...
});
```
⚠️ NOTE: this test builds the dayBefore row fixture INLINE (`keyedRow({...})`) — it does not depend on the deleted catalogue entries at all; it must keep passing after they are deleted. Do not "fix" it to a different key.
Also untouched: fallback-edge tests at 385-434 (unknown-key → snippet, client purity, tamper resistance).

---

### `test/i18n-pages.test.mjs` (test, transform) — verify, likely untouched

**Analog:** self, lines 440-463. The settings-copy value table (each row `['key', undefined, 'expected EN value']`) pins EN values. Verified: line 452 pins the PLURAL `dueReminders` and 453 the `dueDesc` (push_due row) — neither changes. Grep for a pin of the SINGULAR `settings.notif.dueReminder` / `dueReminderDesc` values; if found, update to the new D-04 copy. If absent, the rename passes without touching this file.

---

### `scripts/i18n-scan.mjs` — read-only gate, NO modification

Runs as `npm run i18n:scan` (prebuild hook). Scans server.js + mailer.js for `t()/tFor()` `notif.*` first-string-arg keys resolving in EN AND FR, plus notif.* EN↔FR parity (verified :1182-1251, :1503-1521). After the deletion, the gate passes ONLY because the server reference disappears in the same commit. Run it as the per-task check.

## Shared Patterns

### Exactly-once dedup claim (unchanged machinery)
**Source:** `server.js:1432-1441`
```js
// INSERT OR IGNORE into reminders_sent inside a transaction;
// key `${ws}:${task}:${assignee}:${offset}:${due}` — D-02: `:due` component STAYS.
```
**Apply to:** any edit in runReminderPass — the deletion must not touch the claim order or key shape.

### Zero-migration removal (REM-04)
**Source:** REQUIREMENTS.md standing invariant; proof pinned at `test/notif-i18n.test.mjs:448-457`
**Apply to:** whole phase — no sweep of `:day_before:` ledger rows, no rewrite of legacy inbox rows, no schema change; second boot byte-identical.

### Clock-injection test harness
**Source:** `test/due-reminders.test.mjs:28-40` + `server.js:2849-2856` (`POST /api/internal/reminder-pass`, `REMINDER_TEST_TOKEN` guard, body `{ now }`)
**Apply to:** the D-06 pin — no new harness, no fake timers.

### i18n gate discipline
**Source:** `scripts/i18n-scan.mjs` (Phase 36 D-07..D-09)
**Apply to:** every commit touching server.js references or locale JSON — `npm run i18n:scan` per task, `npm test` per wave.

## No Analog Found

None — every modified file is self-analog; the codebase fully covers this phase.

## Metadata

**Analog search scope:** `server.js`, `test/`, `src/locales/`, `src/pages/`, `scripts/`
**Files scanned:** 11 (6 analogs read/extracted, 5 verified via RESEARCH.md session reads + git ls-files)
**Pattern extraction date:** 2026-11-04
