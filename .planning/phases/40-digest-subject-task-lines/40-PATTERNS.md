# Phase 40: Digest Subject & Task Lines - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 6 (2 modified source, 2 modified locale, 1 modified test, 1 new test)
**Analogs found:** 6 / 6

All named files verified git-tracked via `git ls-files`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `mailer.js` (modify: `encodeWord`, add `truncate`, `buildDigestMessage`) | utility/service (mailer renderer) | request-response (SMTP) | `mailer.js` itself — hardening in place | exact (self) |
| `server.js` (modify: digest send mapping ~1589) | service (background pass) | event-driven (cron tick) | `server.js` digest loop itself + reminder loop at 1434-1443 | exact (self) |
| `src/locales/en.json` (add key) | config (i18n catalogue) | static | `notif.digest.subject` block, en.json:1687 | exact (self) |
| `src/locales/fr.json` (add key) | config (i18n catalogue) | static | `notif.digest.subject` block, fr.json:1687 | exact (self) |
| `test/subject-encode.test.mjs` (new) | test (unit + SMTP integration) | batch | `test/digest.test.mjs` (harness + `decode()`) | exact |
| `test/digest.test.mjs` (extend: two-ws, task-line cases) | test (integration) | batch | existing digest cases at 248, 408, 434 | exact (self) |

## Pattern Assignments

### `mailer.js` — `encodeWord` hardening (SUBJ-03, D-08)

**Analog:** `mailer.js:32-66` (self — harden in place, don't rewrite)

**Current `text()` + `encodeWord`** (lines 32-36, 52-66):
```js
function text(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function encodeWord(value) {
  const input = text(value);
  if (!/[^\x20-\x7E]/.test(input)) return input;
  const chunks = [];
  let current = '';
  for (const char of input) {
    if (current && Buffer.byteLength(current + char) > 30) {
      chunks.push(current);
      current = '';
    }
    current += char;
  }
  if (current) chunks.push(current);
  return chunks.map(chunk => `=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`).join(' ');
}
```

**The one-line hardening pattern:** strip `[\x00-\x1F\x7F]` BEFORE the encode decision, i.e. between `text(value)` and the `/[^\x20-\x7E]/` test. Keep `text()` untouched (Pitfall 4 — its trim/normalize behavior is accepted). Keep single-line `' '` join first; only adopt `'\r\n '` folding if the 200+-char hostile test proves the 998-octet line breaks, and re-run the existing digest suite if so (decoder at test/digest.test.mjs:164-166 won't span folded lines).

Do NOT touch `formatAddress` (lines 68-73) — D-10 scope freeze.

### `mailer.js` — `truncate` helper (D-11..D-14)

**Analog:** `escapeHtml` (mailer.js:75-77) — module-private, single-purpose string helper placed in the same helper block (~line 75-85, between `escapeHtml` and `base64Body`):
```js
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
```
**Copy this shape:**
```js
function truncate(name, cap) {
  const s = text(name);           // reuse the same CRLF-stripping text() for consistency
  return s.length > cap ? s.slice(0, cap) + '…' : s;
}
```
Char-based `slice` is correct here — subjects are RFC 2047-encoded so char caps are the UX measure. Single `…` only when truncation occurred.

### `mailer.js` — `buildDigestMessage` subject (D-01/D-02, SC-5)

**Analog:** `mailer.js:525-557` (self — extend the existing try/catch frame)

The SC-5 fallback frame (lines 538-556) is the pattern to extend — do NOT invent a second frame:
```js
try {
  frame = {
    greeting: tFor(locale, 'notif.email.greeting'),
    subject: tFor(locale, 'notif.digest.subject', { count }),   // stays as fallback key
    ...
  };
} catch {
  frame = { greeting: 'Hi,', subject: `Daily digest: ${count} task(s)`, ... };  // English literal
}
```
New: inside the try frame use `notif.digest.subjectWs` with `{ws, count}` (bracket in the catalogue value, `ws` truncated once before passing); the catch fallback stays `Daily digest: ${count} task(s)` (possibly with the truncated `[${wsName}] ` prefix — agent's discretion, but the literal must exist).

### `mailer.js` — task-line rendering (D-04/D-06/D-07/D-12)

**Analog:** `mailer.js:559-572` (self — modify `section`/`htmlItems` in place)

Current line shapes to extend:
```js
const section = (label, items) => (items.length ? [`${label}:`, ...items.map(t => `- ${t.title}\r\n  ${taskUrl(t)}`)] : []);
```
```js
// htmlItems, line 566 — escape AFTER interpolation (T-36-01 rule):
`<li style="margin:0 0 8px"><a href="${escapeHtml(taskUrl(t))}" style="color:#3b5bdb;text-decoration:none">${escapeHtml(t.title)}</a></li>`
```
**New label pattern** (computed once, used by both text and HTML):
```js
const label = t.project ? `${truncate(t.project, ~80)} — ${truncate(t.title, ~80)}` : truncate(t.title, ~80);
// text:  `- ${label}\r\n  ${taskUrl(t)}`
// html:  escapeHtml(label) inside the single <a>
```
Rules pinned by decision: falsy `project` ⇒ title-only, no placeholder (D-06); separator literal `"—"` (D-07); never `escapeHtml` the text part; one `<a>` per line covering the whole string.

### `server.js` — project-name resolution (SUBJ-02, D-05)

**Analog:** `server.js:1583-1591` (self — modify the send mapping only)

Current mapping (lines 1589-1590):
```js
dueToday: dueToday.map(t => ({ key: t.key, title: t.title || 'a task' })),
overdue: overdue.map(t => ({ key: t.key, title: t.title || 'a task' })),
```
becomes (Pitfall 5 — add `project` to BOTH arrays):
```js
dueToday: dueToday.map(t => ({ key: t.key, title: t.title || 'a task', project: projects.get(t?.project)?.name || '' })),
overdue:  overdue.map(t => ({ key: t.key, title: t.title || 'a task', project: projects.get(t?.project)?.name || '' })),
```
`projects` map is built from the doc snapshot at server.js:1426: `new Map((doc.data.projects ?? []).map(p => [p?.id, p]))` — values are full project rows carrying `name` [VERIFIED — assumption A3 resolved]. Visibility was already proven per (recipient, task) at lines 1561-1562:
```js
if (!inScopeProject(project, projectScope(assigneeMembership))) continue;
if (!projectScope(assigneeMembership) && !memberCanReadProject(project, ws.id, t.assignee)) continue;
```
**HARD FREEZE (SUBJ-01):** the claim block at server.js:1572-1579 —
```js
transaction(() => {
  const res = db
    .prepare('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)')
    .run(`${ws.id}:${r.user_id}:digest:${localDate}`, ws.id, now());
  claimed = res.changes !== 0;
});
```
must not change by one byte. `memberCanReadProject` (server.js:719-727) is not called anew — resolution happens inside the loop where checks already ran; no second lookup path (D-06).

### `src/locales/en.json` / `src/locales/fr.json` — new key pair (D-02/D-03)

**Analog:** the `notif.digest.*` block at line 1687 in both files:
```json
"notif.digest.subject": "Daily digest: {count} task(s)",          // en.json:1687
"notif.digest.subject": "Résumé quotidien : {count} tâche(s)",    // fr.json:1687 (note NBSP-ish " : " FR spacing)
```
Add immediately after, both files in the SAME task:
- EN: `"notif.digest.subjectWs": "[{ws}] Daily digest: {count} task(s)"`
- FR: `"notif.digest.subjectWs": "[{ws}] Résumé quotidien : {count} tâche(s)"` (exact wording = agent's discretion, follow catalogue style incl. FR spacing before `:`)

Existing `notif.digest.subject` is NOT deleted (D-02). Gate: `npm run i18n:scan` — the notif family is bounded to literal `notif.*` call sites and EN↔FR key sets must be identical both directions; a literal `tFor(locale, 'notif.digest.subjectWs', …)` in mailer.js keeps it green.

### `test/subject-encode.test.mjs` (new) — hostile-name tests (D-09)

**Analog:** `test/digest.test.mjs` SMTP harness + `decode()` (lines ~150-172):
```js
function decode(raw) {
  const parts = [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map(m =>
    Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'),
  );
  const encodedWords = [...raw.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)].map(m => Buffer.from(m[1], 'base64').toString('utf8'));
  const rawSubject = (raw.match(/^Subject: (.*)$/m) || [])[1] || '';
  const subject = encodedWords.length ? encodedWords.join('') : rawSubject;
  return { to: (raw.match(/^To: <([^>]+)>/m) || [])[1] || '', subject, text: parts[0] || '', html: parts[1] || '' };
}
```
**Copy:** reuse this exact `decode()` so byte-identity is provable; reuse the raw-socket SMTP server harness (`smtpServer.listen(0, '127.0.0.1')` pattern) and the `waitFor` polling helper. Copy the helper block verbatim or extract into `test/helpers/` (a `test/helpers/` dir already exists).

**Assertions to pin (D-09):**
```js
assert.ok(!encodeWord('name\r\nBcc: victim@x').includes('\r\nBcc'), 'no CRLF injection');
assert.ok(encodeWord('Résumé').startsWith('=?UTF-8?B?'), 'FR accents encoded');
assert.ok(!/[\x00-\x1F]/.test(encodeWord('A'.repeat(200) + '😀'.repeat(200))), 'no C0 survives');
// through the full builder: exactly one /^Subject: /m match in the raw payload; full name decodes intact
```
`encodeWord` is currently module-private (mailer.js:52, not exported). Exporting it for tests is the lower-friction option (the module already exports builder functions via its send API — check export shape at mailer.js:816-848); otherwise test through `buildDigestMessage` payloads. Decide at Wave 0.

### `test/digest.test.mjs` — extensions (SUBJ-01/02)

**Analog:** existing subject assertions (self):
- Line 248: `assert.match(digest.subject, /Daily digest: 2 task/, 'EN subject renders through notif.digest.subject with the count var');`
- Line 408: `assert.match(mine[0].subject, /Daily digest/, ...)` — these `/Daily digest/` regexes stay green with a `[WS] ` prefix (existing suite must pass UNMODIFIED).
- `digestFor` helper (~line 176) filters by recipient email + slug — reuse for two-workspace and task-line cases.

New cases: two workspaces ⇒ each subject carries its own `[{ws}]`; text part contains `Project — Task`; HTML part renders one `<a>` with the full label; an invisible project's task line degrades to title-only in BOTH parts (no leak assertion).

## Shared Patterns

### Escape AFTER interpolation (T-36-01)
**Source:** `mailer.js:566,580-583`
**Apply to:** all new HTML rendering (task lines). Never escape the text/plain part.

### RFC 2047 always for non-ASCII subjects (Pitfall 7)
**Source:** `mailer.js:596` — `Subject: ${encodeWord(subject)}`
**Apply to:** the new subject flows through the same single `encodeWord` call; FR accents must encode.

### One visibility pipeline
**Source:** `server.js:1561-1562` (in-scope check + `memberCanReadProject`)
**Apply to:** project-name resolution. Names reaching the mailer are pre-cleared; no second lookup, no existence markers.

### SC-5 English-literal try/catch fallback
**Source:** `mailer.js:539-556`
**Apply to:** the new `subjectWs` render stays inside the existing try frame; catch keeps the English literal.

### Post-commit fire-and-forget; mailer never touches DB
**Source:** `server.js:1581-1591` (`.catch(err => logWarn(...))`), mailer.js has no db import
**Apply to:** unchanged — only the mapped item shape grows.

### Helper placement & style
**Source:** `mailer.js:32-99` — module-private, single-purpose, no JSDoc, explanatory comment blocks for cross-phase invariants (see 513-524 `Phase 38 (DIGEST-01)` block as the comment style to mimic with a `Phase 40 (SUBJ-…)` header).
**Apply to:** `truncate` lives in this block (near `escapeHtml`).

## No Analog Found

None — every change point has an exact in-file analog. The only "new" file is the test file, whose harness/decoder analogs exist in `test/digest.test.mjs`.

## Anti-Patterns (from decisions + research, planner should encode as plan guards)

- Resolving project names in the mailer or a second name-lookup path (D-05/D-06).
- "Unknown project"/"Private project" placeholders (D-06 — confirm-existence leak).
- Truncating server-side (D-13).
- Touching the claim block (server.js:1572-1579) or `formatAddress` (D-10).
- Adding `project` to only one of `dueToday`/`overdue` (Pitfall 5).
- Adding the key to one locale file only, or dropping `{ws}`/`{count}` params (Pitfall 6).

## Metadata

**Analog search scope:** `mailer.js`, `server.js`, `src/locales/`, `test/`, `scripts/i18n-scan.mjs` (verified via grep)
**Files scanned:** 8 read/grep targets; all excerpts verbatim from current source
**Pattern extraction date:** 2026-11-05
