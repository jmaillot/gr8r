# Phase 38: Daily Digest & Reminder Suppression - Pattern Map

**Mapped:** 2026-11-04
**Files analyzed:** 6 (server.js, mailer.js, src/core/notifPrefs.js, src/pages/settings.js, src/locales/en.json + fr.json, test/digest.test.mjs)
**Analogs found:** 6 / 6 (all are self-analogs or same-role siblings — the phase composes existing machinery)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (digest loop in `runReminderPass`) | service (scheduler) | event-driven / batch | `server.js` reminder loop (lines 1363-1452) | exact (self-extension) |
| `server.js` (suppression gate in `queueNotifEmails`) | service (fan-out) | request-response | `server.js` pref gate (lines 1227-1236) | exact (self-extension) |
| `server.js` (`NOTIF_PREF_DEFAULTS`) | config | — | same object (line 1143-1156) | exact (deletion only) |
| `mailer.js` (`buildDigestMessage` + `sendDigest`) | service (email) | streaming (SMTP) | `buildNotifMessage` (mailer.js:402-511) + `sendNotif` (mailer.js:722-729) | exact (sibling builder) |
| `src/core/notifPrefs.js` | config/model | — | same file (line 19 deletion) | exact (self-edit) |
| `src/pages/settings.js` | component (UI row) | — | same file (line 375 row) | exact (copy only) |
| `src/locales/en.json`, `fr.json` | config (catalogue) | — | `notif.email.*` family (en.json:1675-1686) + `settings.notif.digest*` (en.json:1245-1246) | exact |
| `test/digest.test.mjs` (NEW) | test (integration) | batch | `test/due-reminders.test.mjs` + `test/notif-i18n.test.mjs` | exact (both harnesses reused) |

All analog paths verified git-tracked via `git ls-files` (non-empty for every file listed).

## Pattern Assignments

### `server.js` — digest loop (service, event-driven/batch)

**Analog:** the existing reminder loop inside `runReminderPass` (self-extension; same file, sibling loop after the per-task reminder loop).

**Scheduler shape + hour gate** (lines 1363-1374) — copy verbatim context; the digest loop lives INSIDE this per-workspace block, AFTER the reminder task loop, reusing the in-scope `tasks` array and `projects` Map (D-08, one doc snapshot):
```js
function runReminderPass({ now: at = new Date() } = {}) {
  const emitted = [];
  for (const ws of db.prepare('select * from workspaces').all()) {
    try {
      const doc = JSON.parse(ws.doc);
      /* Per-workspace localDate/hour — never cached across workspaces or ticks. */
      const { date: localDate, hour } = localParts(workspaceTzLabel(doc, ws.id), at);
      /* D-27-1 hour gate: idle outside 09:00 → pure read, zero writes. */
      if (hour !== 9) continue;
      const tasks = Array.isArray(doc?.data?.tasks) ? doc.data.tasks : [];
      const projects = new Map((Array.isArray(doc?.data?.projects) ? doc.data.projects : []).map(p => [p?.id, p]));
```

**Task-visibility predicate to reuse** (lines 1345-1350) — `remindable()` is the D-06 single visibility definition:
```js
function remindable(task, project) {
  if (!task || !/^\d{4}-\d{2}-\d{2}$/.test(task.due || '')) return false;
  if (task.status === 'done' || task.archived) return false;
  if (!project || project.archived) return false;
  return canSeeProject(project, task.assignee);
}
```

**SCOPE-04 per-recipient checks to copy verbatim** (lines 1382-1396) — the digest loop must apply the SAME three checks per (recipient, task):
```js
const assigneeMembership = db
  .prepare('select user_id, role, scope from memberships where workspace_id = ? and member_id = ?')
  .get(ws.id, t.assignee);
const prefs = getUserNotifPrefs(assigneeMembership?.user_id || t.assignee, ws.id);
if (!inScopeProject(project, projectScope(assigneeMembership))) continue;
if (!projectScope(assigneeMembership) && !memberCanReadProject(project, ws.id, t.assignee)) continue;
```

**Window predicates (string compare)** (lines 1398-1404) — the digest's due-today/overdue split uses the identical comparisons:
```js
if (prefs.due_reminder !== false) {
  if (localDate >= due) offsets.push('morning_of');
}
if (prefs.past_due !== false && localDate > due) offsets.push('past_due');
```

**Claim-then-send transaction** (lines 1425-1444) — the digest claim is this pattern with the new key `ws:{userId}:digest:{localDate}` and NO `updateDoc` call (no notif row, no revision bump):
```js
let claimed = false;
transaction(() => {
  const r = db
    .prepare('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)')
    .run(`${ws.id}:${t.id}:${t.assignee}:${offset}:${due}`, ws.id, now());
  if (r.changes === 0) return; // already sent — exactly-once
  updateDoc(ws.id, d => { d.data.notifs.push(notif); });
  claimed = true;
});
if (!claimed) continue;
emitted.push(notif);
/* Post-commit fan-out — NEVER inside the transaction (a hung SMTP server
   would hold the SQLite write lock). */
if (MAILER.enabled) {
  const nextDoc = JSON.parse(db.prepare('select doc from workspaces where id = ?').get(ws.id).doc);
  queueNotifEmails(ws, nextDoc, [notif]);
}
```

**Per-workspace error boundary** (lines 1447-1449) — digest failures are caught by the existing try/catch; no new wrapper:
```js
} catch (err) {
  console.warn(`reminder pass ${ws.id}: ${err.message}`);
}
```

---

### `server.js` — suppression gate (service, request-response fan-out)

**Analog:** `queueNotifEmails` pref gate (self-extension; one new condition, lines 1227-1236).

**Existing gate where the digest branch lands** (lines 1229-1236) — D-10/D-11: the new gate is a SEPARATE condition from the `=== false` check, placed after `prefs` resolution:
```js
const prefKey = NOTIF_EMAIL_KIND[n.type];
if (!prefKey) continue;
/* PREFS (Phase 34, D-04): prefs resolve PER RECIPIENT through the accessor. */
const prefs = getUserNotifPrefs(authority.get(n.to)?.user_id || n.to, wsRow.id);
if (prefs[prefKey] === false) continue;
/* Phase 38 (D-10/D-11): digest replaces reminder EMAILS only — the row was
   already claimed and appended by the caller; inbox + push never suppressed.
   email_digest === true wins regardless of email_reminder's value. */
if (prefKey === 'email_reminder' && prefs.email_digest === true) continue;
```

**Kind map (untouched)** (lines 1176-1182) — only kinds mapping to `'email_reminder'` are affected (`due_reminder`, `past_due`):
```js
const NOTIF_EMAIL_KIND = {
  mention: 'email_mention',
  assign: 'email_assign',
  comment: 'email_comment',
  due_reminder: 'email_reminder',
  past_due: 'email_reminder',
};
```

**Recipient resolution + locale + deep link to reuse for the digest send** (lines 1221-1226, 1245, 1276):
```js
const authority = new Map(
  db
    .prepare('select m.member_id, m.user_id, u.name, u.email, u.locale from memberships m join users u on u.id = m.user_id where m.workspace_id = ?')
    .all(wsRow.id)
    .map(r => [r.member_id, r]),
);
const recipientLocale = authority.get(n.to)?.locale === 'fr' ? 'fr' : 'en';
const url = task?.key ? `${APP_URL}/w/${wsRow.slug}/task/${encodeURIComponent(task.key)}` : `${APP_URL}/w/${wsRow.slug}/`;
```
(D-05: digest recipients iterate THIS authority join, never `doc.data.members`.)

**Fire-and-forget failure discipline** (lines 1277-1286) — the digest send mirrors it:
```js
MAILER.sendNotif({ to, workspace: wsName, by, task: taskTitle, snippet: n.snippet || '', kind: n.type, url, locale: recipientLocale })
  .catch(err => console.warn(`notif email ${n.id} → ${to}: ${err.message}`));
```

**Prefs reader — the ONLY one** (lines 1162-1174) — digest recipients resolve prefs through this accessor:
```js
function getUserNotifPrefs(userId, workspaceId) {
  const row = db.prepare('select prefs from user_notif_prefs where workspace_id = ? and user_id = ?').get(workspaceId, userId);
  let stored = {};
  if (row) {
    try { stored = JSON.parse(row.prefs); } catch { stored = {}; }
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = {};
  }
  return { ...NOTIF_PREF_DEFAULTS, ...stored };
}
```

---

### `server.js` + `src/core/notifPrefs.js` — default-layer deletion (config)

**Analog:** the current default objects themselves (lines verified this session; D-14 = delete one line each, whitelist unchanged).

`server.js:1146` inside `NOTIF_PREF_DEFAULTS` (1143-1156) — delete `  email_digest: true,`:
```js
const NOTIF_PREF_DEFAULTS = {
  email_mention: true,
  email_assign: true,
  email_digest: true,     // ← DELETE this line (undefined-falsy = off after Phase 38)
  email_comment: false,
  email_reminder: true,
  ...
};
```

`src/core/notifPrefs.js:19` inside its mirror (lines 16-29) — delete the same line. `NOTIF_PREF_KEYS` (lines 34-40) spreads `Object.keys(NOTIF_PREF_DEFAULTS)` plus 4 extras — the whitelist is NOT affected by the deletion (key stays via the PUT route's 16-key `NOTIF_PREF_KEYS` in server.js:1124-1141). Update the header comment (lines 9-15) which currently documents the defaults shape.

---

### `mailer.js` — `buildDigestMessage` + `sendDigest` (service, streaming SMTP)

**Analog:** `buildNotifMessage` (lines 402-511) + the `sendNotif` method (lines 722-729). Research anti-pattern: do NOT shoehorn the list digest into `buildNotifMessage` — build a sibling with the same MIME bones.

**Localized frame via tFor + SC-5 fallback** (lines 402-446) — copy the structure: `tFor(locale, 'notif.digest.*')` in a try/catch with English-literal fallback:
```js
const locale = msg.locale === 'fr' ? 'fr' : 'en';
let frame;
try {
  frame = {
    greeting: tFor(locale, 'notif.email.greeting'),
    subject: tFor(locale, 'notif.digest.subject', { count }),
    ...
  };
} catch {
  /* SC-5 boundary guard: any render failure degrades to English literals. */
  frame = { greeting: 'Hi,', ... };
}
```
`tFor` import (line 27): `import { tFor } from './src/core/i18n.js';`

**Escape-after-interpolation + HTML layout** (lines 448-476) — catalogue renders raw; `escapeHtml` applied AFTER interpolation in the HTML body; same table-based card layout to reuse:
```js
const textBody = [greeting, '', sentence, ...].join('\r\n');
const htmlBody = `<!doctype html>
<html lang="${locale}">
<body style="...">
  <table role="presentation" ...>
    <tr><td align="center">
      <table ... style="max-width:520px;...">
        <tr><td>
          <p style="...">${escapeHtml(sentence)}</p>
          <p style="..."><a href="${escapeHtml(url)}" ...>${escapeHtml(button)}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
```

**MIME assembly (verbatim bones)** (lines 478-510) — `encodeWord` subject, base64 alternative parts, `Auto-Submitted: auto-generated`:
```js
const boundary = `projects_${crypto.randomBytes(12).toString('hex')}`;
const headers = [
  `From: ${formatAddress(config.fromName || workspace, config.from)}`,
  `To: <${to}>`,
  `Subject: ${encodeWord(subject)}`,
  `Date: ${new Date().toUTCString()}`,
  `Message-ID: <${crypto.randomUUID()}@${domainOf(config.from)}>`,
  'MIME-Version: 1.0',
  `Content-Type: multipart/alternative; boundary="${boundary}"`,
  'Auto-Submitted: auto-generated',
  'X-Mailer: Projects Studio',
];
const body = [
  `--${boundary}`,
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: base64',
  '', base64Body(textBody),
  `--${boundary}`,
  'Content-Type: text/html; charset=UTF-8',
  'Content-Transfer-Encoding: base64',
  '', base64Body(htmlBody),
  `--${boundary}--`, '',
].join('\r\n');
return { to, data: [...headers, '', body].join('\r\n') + '\r\n' };
```

**sendDigest method** (analog lines 720-729) — sibling of `sendNotif` in the returned MAILER object:
```js
/* P4-f: one notification row = one short email. Fire-and-forget from the
   caller — failures are logged, never surfaced to the client. */
async sendNotif(msg) {
  const session = new SmtpSession(config);
  try { await session.send(buildNotifMessage(config, msg)); }
  finally { session.destroy(); }
},
```

**Deep links** (from server.js:1276 pattern): `${APP_URL}/w/${ws.slug}/task/${encodeURIComponent(task.key)}` per task.

---

### `src/pages/settings.js` — digest toggle copy (component)

**Analog:** the existing row at line 375 (self-edit; labels/desc keys only — no structural change, D-15):
```js
srow(t('settings.notif.digest'), t('settings.notif.digestDesc'), tog('email_digest', np.email_digest, 'np')) +
srow(t('settings.notif.emailReminder'), t('settings.notif.emailReminderDesc'), tog('email_reminder', np.email_reminder, 'np'))
```
Note: the row's ON-render is `np.email_digest` (truthiness) — after the default deletion, `undefined` renders OFF naturally (D-14). No coercion change needed here (contrast `!!P.permPublic` rows — no new pattern required).

---

### `src/locales/en.json` + `fr.json` — copy + new keys (config)

**Analog 1 — settings copy being replaced** (en.json:1245-1246; fr.json same lines — stale wording):
```json
"settings.notif.digest": "Daily digest",
"settings.notif.digestDesc": "A summary of what changed, every weekday at 8:00.",
```
Replace per D-13 (EN: "Get one email at 09:00 with tasks due today and overdue — replaces individual reminder emails"; FR twin with the same suppression framing visible). Surrounding sibling keys (1243-1250) show the naming family: `settings.notif.*` / `settings.notif.*Desc`.

**Analog 2 — server `notif.*` family shape** (en.json:1675-1686) — new `notif.digest.*` keys slot next to these; keys must be literal strings in `tFor` calls (no template-built key names) or the i18n-scan gate fails:
```json
"notif.email.byReminders": "Reminders",
"notif.email.greeting": "Hi,",
"notif.email.subject.reminder": "Reminder: {title}",
"notif.email.body.sentence": "{actor} {verb} “{title}” on {workspace}.",
"notif.email.body.openTask": "Open the task:",
"notif.email.body.button": "Open the task",
"notif.email.body.footer": "You receive this because of your notification settings. ...",
```
Research-proposed shape: `notif.digest.subject` ({count} var), `notif.digest.dueToday`, `notif.digest.overdue`, `notif.digest.footer`. Add EN+FR together; `node scripts/i18n-scan.mjs` must stay green (extracts first-string `t`/`tFor` args from server.js AND mailer.js, enforces bidirectional EN↔FR parity).

---

### `test/digest.test.mjs` (NEW) — integration test

**Analog A:** `test/due-reminders.test.mjs` — harness skeleton, prefs seeding, exactly-once/idle-tick/restart pins.

**Harness constants + clock-injected trigger** (lines 17-41):
```js
const GOOD = 'correct-horse-9';
const TOKEN = 'reminder-test-token';
const TZ = '(GMT+00:00) London'; // UTC in winter — clock math is trivial
/* Clock-injected reminder run against the real server. */
const trigger = (nowIso, srv = server) =>
  fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => {
    assert.equal(r.status, 200, `trigger status ${r.status}`);
    return (await r.json()).emitted;
  });
const at9 = iso => new Date(`${iso}T09:00:00Z`).toISOString();
```

**Workspace fixture + prefs seeding** (lines 48-88) — the digest test's `email_digest: true` pref goes in `user_notif_prefs` the same way (D-05 authority-row path):
```js
withDb(srv.dbPath, db => {
  const uid = db.prepare('select user_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id).user_id;
  db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(ws.id, uid, JSON.stringify(prefs));
});
```

**Ledger/doc inspection helpers** (lines 90-107) — reuse verbatim for the no-phantom-claim pin (D-12):
```js
const revisionOf = (slug, srv = server) =>
  withDb(srv.dbPath, db => db.prepare('select revision from workspaces where slug = ?').get(slug).revision);
const notifRows = (slug, srv = server) =>
  withDb(srv.dbPath, db => JSON.parse(db.prepare('select doc from workspaces where slug = ?').get(slug).doc).data.notifs);
const reminderKeys = wsId =>
  withDb(server.dbPath, db => db.prepare('select dedup_key from reminders_sent where workspace_id = ?').all(wsId).map(r => r.dedup_key));
const task = (memberId, over = {}) => ({ id: `t${++uid}`, key: `P1-${uid}`, title: 'Ship it', status: 'todo', assignee: memberId, project: 'p1', ...over });
```

**Server lifecycle** (lines 109-117):
```js
before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-reminders-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-reminders-key', REMINDER_TEST_TOKEN: TOKEN } });
});
after(async () => { await server?.stop(); if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true }); });
```
Imports (lines 9-15): `import { startServer, withDb, signup, client } from './helpers/server.mjs';` + node:test `after/before/test` + `assert/strict`.

**Idle-tick / exactly-once pin shapes to mirror** (lines 121-129, 133-146): assert `revisionOf` unchanged + `reminderKeys` empty on the empty-digest case; double-trigger at 09:00 → second run sends nothing and the ledger holds exactly one `ws:{userId}:digest:{localDate}` key.

**Analog B:** `test/notif-i18n.test.mjs` — throwaway SMTP capture for digest email assertions.

**fakeSmtp peer** (lines 28-70) — minimal net server capturing DATA payloads:
```js
function fakeSmtp() {
  const payloads = [];
  const server = net.createServer(socket => {
    let current = null; let inData = false;
    socket.write('220 test ESMTP\r\n');
    let buf = '';
    socket.on('data', chunk => { /* line-split; '.' terminates DATA; pushes into payloads */ });
  });
  return { payloads, listen: () => new Promise(r => server.listen(0, '127.0.0.1', r)), port: () => server.address().port, close: () => new Promise(r => server.close(r)) };
}
```
(A simpler variant also exists at due-reminders.test.mjs:350-390 with a `textPart` base64 decoder at 393-400 — either copy works.)

**decode + waitFor + payloadFor** (lines 74-94) — for per-recipient locale and subject assertions:
```js
const waitFor = async (smtp, n, label) => { /* poll payloads until +n, 10s deadline */ return smtp.payloads.slice(start).map(decode); };
const payloadFor = (msgs, email) => { const m = msgs.filter(x => x.to === email); assert.ok(m.length >= 1, ...); ... };
```

## Shared Patterns

### Prefs resolution — ONE accessor
**Source:** `server.js:1162-1174` (`getUserNotifPrefs`)
**Apply to:** digest recipient loop AND the suppression gate — never a direct `user_notif_prefs` read or a doc-field read.
```js
const prefs = getUserNotifPrefs(assigneeMembership?.user_id || t.assignee, ws.id);
```

### One visibility pipeline (D-06)
**Source:** `server.js:1345-1350` (`remindable`) + `server.js:1382-1396` (SCOPE-04: `projectScope`/`inScopeProject`/`memberCanReadProject`)
**Apply to:** the digest task filter. Copy the reminder loop's three checks verbatim per (recipient, task); NEVER add a digest-specific filter.

### Claim-then-send with post-commit fan-out
**Source:** `server.js:1425-1444` (T-27-03)
**Apply to:** every digest send. `transaction()` + `insert or ignore into reminders_sent`; key `ws:{userId}:digest:{localDate}` (D-03); NO `updateDoc` inside; `MAILER.sendDigest` strictly post-commit; claim ONLY when the task list is non-empty (D-12).

### Fire-and-forget email failure discipline
**Source:** `server.js:1286` (.catch console.warn) + `mailer.js:720-729` (SmtpSession try/finally destroy)
**Apply to:** `sendDigest` call site and method.

### Localized email frame + escaping order
**Source:** `mailer.js:402-510` (tFor try/catch SC-5 fallback, escapeHtml after interpolation, encodeWord subject, base64 parts, Auto-Submitted)
**Apply to:** `buildDigestMessage` — same bones, new list structure.

### i18n gate discipline
**Source:** `scripts/i18n-scan.mjs` (parity gate, per Phase 36 D-07..D-09); key-family precedent `en.json:1675-1686`
**Apply to:** every new key — literal key names in code, EN+FR added together, run `node scripts/i18n-scan.mjs` before commit.

### Test harness reuse
**Source:** `test/due-reminders.test.mjs` (trigger/fixture/ledger helpers, lines 17-117) + `test/notif-i18n.test.mjs` (fakeSmtp/decode/waitFor/payloadFor, lines 28-94)
**Apply to:** `test/digest.test.mjs` — no new infrastructure; clock injection via `POST /api/internal/reminder-pass { now }`.

## No Analog Found

None — every touched surface has a same-role analog in the current tree (most are self-extensions of files the phase already names). The only genuinely NEW artifact is `buildDigestMessage`/`sendDigest` in mailer.js, which copies `buildNotifMessage`/`sendNotif` directly.

## Metadata

**Analog search scope:** repo root (`server.js`, `mailer.js`), `src/core/`, `src/pages/`, `src/locales/`, `test/`
**Files scanned:** 8 read this session + line-verified grep targets
**Tracked-source gate:** all analog paths confirmed via `git ls-files` (8/8 tracked; no gitignored mirrors exist in this repo)
**Pattern extraction date:** 2026-11-04
