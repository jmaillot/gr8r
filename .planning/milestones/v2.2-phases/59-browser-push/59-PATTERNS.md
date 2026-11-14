# Phase 59: Browser Push - Pattern Map

**Mapped:** 2026-11-13
**Files analyzed:** 9 (created or modified)
**Analogs found:** 9 / 9 (all modify existing tracked files or extend existing suites; the new `test/push-server.test.mjs` clones `test/browser-push.test.mjs` harness patterns)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — `push_subscriptions` SCHEMA entry | config/migration | batch (boot DDL) | `server.js:389-394` `user_notif_prefs` DDL | exact |
| `db-adapter.mjs` — SQLITE_SCHEMA + PK map | model/storage | CRUD | `db-adapter.mjs:44-47` `PG_CONFLICT_TARGETS` + `:272-277` mirror DDL | exact |
| `server.js` — `/api/me/push-subscriptions` + `/api/me/push-config` routes | route | request-response | `server.js:4267-4315` `/api/me/notif-prefs` GET/PUT | exact |
| `server.js` — `sendPushFor()` fan-out + 404/410 sweep | service | event-driven (post-commit fan-out) | `server.js:1664-1752` `queueNotifEmails` | exact |
| `server.js` — fan-out hooks (doc-PUT diff site + `runReminderPass`) | service | event-driven | `server.js:5478-5513` doc-PUT site; `server.js:1877-1898` reminder site | exact |
| `server.js` — VAPID custody (boot) | config | file-I/O | MASTER_KEY/SMTP fail-absent env pattern (docs/DEPLOY.md §13 model) | role-match (first /data key file) |
| `public/sw.js` — `push` handler | middleware (SW) | event-driven | `public/sw.js:10-28` existing `notificationclick` handler | exact |
| `src/core/push.js` — subscribe/unsubscribe/device helpers | client service | request-response | `src/core/push.js` existing module (api seam, test seams) | exact |
| `src/pages/settings.js` — notif-push case (master toggle, device list, per-device test) | component | request-response | `src/pages/settings.js:522-535` existing `notif-push` case | exact |
| `docs/DEPLOY.md` — §16-adjacent VAPID runbook | doc | — | `docs/DEPLOY.md` §13 key custody & rotation | role-match |
| `test/push-server.test.mjs` (NEW) | test | request-response | `test/browser-push.test.mjs` harness + existing server-suite patterns | role-match |
| `test/browser-push.test.mjs` (extend) | test | — | its own sw.js static-contract tests (:123-142) | exact |
| `test/dependencies.test.mjs` (amend) | test | — | its own exact-pin test (:32-48) | exact |

All named analogs verified git-tracked (`git ls-files` → 8/8 files, docs/DEPLOY.md included).

## Pattern Assignments

### `server.js` — SCHEMA entry for `push_subscriptions` (config/migration, boot batch)

**Analog:** `server.js:384-394` (`user_notif_prefs` DDL)

```sql
/* PREFS (Phase 34, D-04/D-10): one row per (workspace, user) — the single
   authority for per-user notification preferences. ... The composite PK
   needs no extra index and no FK — the same shape Plan 02's backfill writes. */
create table if not exists user_notif_prefs (
  workspace_id text not null,
  user_id      text not null,
  prefs        text not null,
  primary key (workspace_id, user_id)
);
```

**Copy:** the comment-then-DDL shape, `text not null` column discipline, composite PK. For `push_subscriptions`, `endpoint` is the UNIQUE lookup key (`insert or replace` on re-subscribe) — see `saved_views` (server.js:405-413) for the recent precedent of a table whose PK differs from the `(workspace_id, user_id)` shape. The mirror must land in BOTH `server.js` SCHEMA and `db-adapter.mjs` SQLITE_SCHEMA (below) — the dual-backend mirror test pins the pair.

### `db-adapter.mjs` — SQLITE_SCHEMA mirror + `PG_CONFLICT_TARGETS` entry (model, CRUD)

**Analog:** `db-adapter.mjs:41-47` (conflict targets) and `:272-288` (mirror DDL verbatim)

```js
// pg needs an explicit conflict target for ON CONFLICT DO UPDATE. The only
// `insert or replace` sites in server.js target user_notif_prefs, whose
// composite PK is (workspace_id, user_id) — server.js SCHEMA.
const PG_CONFLICT_TARGETS = {
  user_notif_prefs: '(workspace_id, user_id)',
  saved_views: '(workspace_id, user_id, key, name)',
};
```

```sql
/* Phase 57 (D-05): per-user saved views + live column state, sentinel name ''
   for the live row — mirrors server.js SCHEMA verbatim. */
create table if not exists saved_views (
  ...
);
```

**Copy:** (a) the "mirrors server.js SCHEMA verbatim" comment convention for the new table block; (b) if `sendPushFor`/routes use `insert or replace into push_subscriptions`, add the conflict-target entry — with `endpoint` UNIQUE, the target is `(endpoint)`. The rewrite layer (`toPgSql`, db-adapter.mjs:74+) handles `insert or replace` → `on conflict do update` mechanically; no callsite dialect code.

### `server.js` — `/api/me/push-subscriptions` + `/api/me/push-config` routes (route, request-response)

**Analog:** `server.js:4267-4315` (`/api/me/notif-prefs` GET/PUT)

```js
if (pathname === '/api/me/notif-prefs' && method === 'GET') {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const wsId = String(url.searchParams.get('workspace') || '');
  const ws = wsId ? await db.get('select id from workspaces where id = ?', [wsId]) : null;
  const member = ws ? await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]) : null;
  // No-oracle: a workspace the caller is not a member of reads as not-found.
  if (!ws || !member) return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
  return json(res, 200, { prefs: await getUserNotifPrefs(user.id, ws.id) });
}
```

```js
if (pathname === '/api/me/notif-prefs' && method === 'PUT') {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const body = await readJson(req);
  // Only body.workspace and body.prefs.prefs-keys are read; user_id always
  // comes from the session — never the body (same mass-assignment discipline ...).
  ...
  for (const key of Object.keys(incoming)) {
    if (!NOTIF_PREF_KEYS.includes(key)) return fail(res, 400, 'unknownPrefKey', 'Unknown preference key');
  }
  ...
  await db.run('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)', [...]);
}
```

**Copy for the push routes:**
- Guard ladder verbatim: `requireUser` → `sameOrigin` → workspace/member resolution → 404 no-oracle (`user_id` never from the body).
- Whitelist-validate the subscribe body (endpoint https URL, p256dh/auth base64url, label length-capped — the `NAMED_VIEW_BLOB_MAX_BYTES` cap pattern at server.js:1597-1598).
- `/api/me/push-config` is the fail-absent VAPID gate: return 404 when VAPID is unconfigured (MCP-01 fail-absent route pattern), `{ vapidPublicKey }` when present. Only the PUBLIC key ever crosses a route.

### `server.js` — `sendPushFor()` + sweep (service, event-driven fan-out)

**Analog:** `server.js:1664-1752` `queueNotifEmails` — the canonical fan-out template.

**Authority/roster setup** (lines 1666-1688) — copy verbatim: profiles map from `nextDoc.data.members`, the memberships⋈users authority join (giving `user_id`, `name`, `email`, `locale`), workspace-scoped:

```js
const authority = new Map(
  (
    await db.all('select m.member_id, m.user_id, u.name, u.email, u.locale from memberships m join users u on u.id = m.user_id where m.workspace_id = ?', [
      wsRow.id,
    ])
  ).map(r => [r.member_id, r]),
);
```

**Per-recipient gates** (lines 1689-1726) — the exact gate order push mirrors (D-11):

```js
for (const n of newNotifs) {
  if (n.by === n.to) continue; // never email the author about their own action
  const prefKey = NOTIF_EMAIL_KIND[n.type];
  if (!prefKey) continue;
  const prefs = await getUserNotifPrefs(authority.get(n.to)?.user_id || n.to, wsRow.id);
  if (prefs[prefKey] === false) continue;
  /* Phase 38 (DIGEST-02, D-09/D-10/D-11): digest users lose individual
     reminder EMAILS at the fan-out — inbox rows and push are never
     suppressed ... */
  if (prefKey === 'email_reminder' && (await getStoredNotifPrefs(...)).email_digest === true) continue;
  ...
  const projectId = n.project || task?.project || null;
  if (projectId && !(await memberCanReadProject(projectById.get(projectId), wsRow.id, n.to))) continue;
```

**Localization + URL shaping** (lines 1714-1740):

```js
const recipientLocale = authority.get(n.to)?.locale === 'fr' ? 'fr' : 'en';
...
const url = task?.key ? `${APP_URL}/w/${wsRow.slug}/task/${encodeURIComponent(task.key)}` : `${APP_URL}/w/${wsRow.slug}/`;
```

**Fire-and-forget with logged failure** (lines 1741-1750):

```js
MAILER.sendNotif({ ... }).catch(err => logWarn(`notif email ${n.id} → ${to}: ${err.message}`));
```

**Deltas for push (from RESEARCH.md Pattern 1):**
- `NOTIF_EMAIL_KIND` (server.js:1651-1657) is the map to clone as `PUSH_NOTIF_KIND = { mention: 'push_mention', assign: 'push_assign', comment: 'push_comment', due_reminder: 'push_due', past_due: 'push_due' }`.
- Do NOT gate on `MAILER.enabled` — gate on `PUSH.enabled` (VAPID presence).
- Push is NOT digest-suppressed (D-10: "inbox rows and push are never suppressed" — the email digest gate at line 1710 has NO push analog; only `push_due` gates reminder pushes).
- Per-device loop over `push_subscriptions where workspace_id = ? and user_id = ?`; `webpush.sendNotification(...).catch` with 404/410 → `delete from push_subscriptions where endpoint = ?` (PUSH-04), other errors → `logWarn` only.
- Truncate task title (~120 chars after `tFor` localization, D-18); payload `{url, title, body, test}` only.
- `tFor` funnel: line 1731-1733 shows the inline `tFor(recipientLocale, 'notif.email.byReminders')` usage — clone for `notif.push.*` keys (EN+FR catalogue gate).

### `server.js` — fan-out hook sites (service, event-driven)

**Analog 1 — doc-PUT diff site** (`server.js:5478-5483` inside tx, `:5511-5513` post-commit):

```js
/* P4-f: notifications that arrived with this PUT are candidates for a
   notification email. Diffed against the stored doc so each row emails
   exactly once. Collected now, sent after the commit — the response
   must never wait on SMTP. */
const storedNotifIds = new Set(...);
const newNotifs = (...).filter(n => n?.id && !storedNotifIds.has(n.id));
...
/* P4-f: fire-and-forget email fan-out. Authored here so a hung SMTP
   server delays nothing: errors logged, response already flushed. */
if (MAILER.enabled && newNotifs.length) await queueNotifEmails(row, next, newNotifs);
```

**Copy:** `sendPushFor(row, next, newNotifs)` goes beside line 5513, gated `if (PUSH.enabled && newNotifs.length)` — same "collected in tx, sent after commit" shape. `newNotifs` is already in scope; no diff logic changes.

**Analog 2 — reminder site** (`server.js:1877-1898`):

```js
let claimed = false;
await db.tx(async () => {
  const r = await db.run('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)', [...]);
  if (r.changes === 0) return; // already sent — exactly-once (REM-03)
  await updateDoc(ws.id, d => { d.data.notifs.push(notif); });
  claimed = true;
});
if (!claimed) continue;
emitted.push(notif);
/* Post-commit fan-out — NEVER inside the transaction (a hung SMTP
   server would hold the SQLite write lock). Uses the post-write doc. */
if (MAILER.enabled) {
  const nextDoc = JSON.parse((await db.get('select doc from workspaces where id = ?', [ws.id])).doc);
  await queueNotifEmails(ws, nextDoc, [notif]);
}
```

**Copy:** add `if (PUSH.enabled) { ... await sendPushFor(ws, nextDoc, [notif]); }` beside it — note the reminder site already re-parses the post-write doc at line 1896; reuse that parse for push (RESEARCH open question 3: one parse, two consumers, or keep a separate parse — planner's call; Phase 38 invariants byte-identical either way).

### `server.js` — VAPID custody (config, file-I/O, boot)

**No exact in-codebase analog** (first /data key file). **Patterns to combine:**
- Fail-absent env discipline (SMTP/MASTER_KEY class): env `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` wins → else `/data/vapid-keys.json` → else generate via `webpush.generateVAPIDKeys()` + write to `DATA_DIR`; never regenerate over an existing file; unconfigured-and-unpersistable = feature absent.
- Boot logging conventions: `logInfo`/`logWarn`/`logError` ladder (mirrored in db-adapter.mjs:23-29); log presence, never key values.
- Runbook model: `docs/DEPLOY.md` §13 "Key custody & rotation" (line ~757) — write the new §16-adjacent section in the same structure (generate, persist, env-override, restart behavior).

### `public/sw.js` — `push` handler (service worker, event-driven)

**Analog:** `public/sw.js:1-28` (the entire file — extend in place)

```js
/* public/sw.js — the notification click router (Phase 48, D-48-2). ... */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let url = '/';
  try {
    const u = new URL(e.notification.data?.url || '/', self.location.origin);
    if (u.origin === self.location.origin) url = u.href;
  } catch { /* malformed data.url → workspace root */ }
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    ...
    await self.clients.openWindow(url);
  })());
});
```

**Copy for the `push` handler (D-12/D-13/D-15):**
- Same `e.waitUntil((async () => {...})())` wrapper.
- Suppression: `await self.clients.matchAll({ type: 'window', includeUncontrolled: true })` — the EXACT call already used at line 18; non-empty → return (skip display).
- `showNotification(title, { body, tag, icon: '/favicon.svg', data: { url } })` — the icon/tag/data shape matches the client foreground path (`src/core/push.js:132`: `tag: 'gr8r-${n.id}', icon: '/favicon.svg', data: { url: buildNotifUrl(n) }`).
- Click routing needs ZERO changes — `notificationclick` already deep-links via `new URL(..., self.location.origin)`.
- **HARD CONTRACT** (test/browser-push.test.mjs:123-142, stays green): no `fetch|install|activate|import` token anywhere — including comments (token-based regex); keep the exact substrings `new URL(e.notification.data?.url || '/', self.location.origin)`, `u.origin === self.location.origin`, `openWindow(url)`; no skipWaiting/claim machinery (Pitfall 12). Payload is pre-localized by the server — SW holds zero strings (T-48-02).

### `src/core/push.js` — subscribe/unsubscribe/device helpers (client service, request-response)

**Analog:** `src/core/push.js:13-16` (imports), `:30-35` (test seam pattern), `:104-137` (api + SW registration usage)

```js
import { S, D, myNotifs, mem, task } from './store.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { toast } from '../ui/toast.js';
...
export let showToast = toast;
export function setToastSink(fn) { showToast = fn || toast; }
```

```js
const reg = await navigator.serviceWorker.getRegistration();
if (reg) await reg.showNotification(line, { body: line, tag: `gr8r-${n.id}`, icon: '/favicon.svg', data: { url: buildNotifUrl(n) } });
```

**Copy:** export named helpers (`enablePush`/`disablePush`/device-list fetchers) using the `api` import for route calls; use `navigator.serviceWorker.ready` + `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` with the standard `atob`+`Uint8Array.from` base64url decode (RESEARCH Code Examples). Keep the export/test-seam style (`export let` live bindings for anything a test observes). **DELIV-02 note:** push.js already rides the lazy push chunk (comment at lines 40-43) — new settings UI handlers belong here; SW *registration* stays eager elsewhere. Do not change `PUSH_TYPE_PREF` (line 28) — D-09 keeps the foreground path untouched.

### `src/pages/settings.js` — notif-push case (component, request-response)

**Analog:** `src/pages/settings.js:522-535` (existing case)

```js
case 'notif-push': {
  /* D-48-4: the badge is DERIVED per render from a live permission read,
     never stored — a later grant clears it on the next poll re-render. */
  const blocked = typeof window.Notification !== 'undefined' && window.Notification.permission === 'denied';
  const bad = blocked ? `<span class="badge red">${t('settings.notif.pushBrowserBlocked')}</span>` : '';
  return (
    H(t('settings.notif.pushLead')) +
    srow(t('settings.notif.mentions'), bad, tog('push_mention', np.push_mention, 'np')) +
    srow(t('settings.notif.assignments'), bad, tog('push_assign', np.push_assign, 'np')) +
    srow(t('settings.notif.comments'), bad, tog('push_comment', np.push_comment, 'np')) +
    srow(t('settings.notif.dueReminder'), t('settings.notif.dueReminderDesc'), tog('due_reminder', np.due_reminder, 'np')) +
    srow(t('settings.notif.pastDue'), t('settings.notif.pastDueDesc'), tog('past_due', np.past_due, 'np'))
  );
}
```

**Copy:** `H()` header + `srow(label, desc, tog(key, value, 'np'))` row grammar; the derived-blocked-badge pattern stays. Extend with: master enable toggle above the per-type rows (drives `requestPermission` + subscribe — the existing `IN.npToggle` action path, browser-push.test.mjs:307-317), a device list section (rows like the archive list at settings.js:510 — `srow`/btn grammar), and per-device "send test" buttons (`data-a="..."` action buttons as at line 510). `push_due` row lands alongside `due_reminder`/`past_due` (research Pitfall 4) — and i18n keys need both EN+FR catalogues.

### `test/push-server.test.mjs` (NEW) and test extensions

**Analog:** `test/browser-push.test.mjs` — harness shape: stub globals FIRST, then dynamic `import()` of the module under test (lines 100-109), then seed state:

```js
/* Dynamic imports AFTER the stubs. */
const store = await import('../src/core/store.js');
const push = await import('../src/core/push.js');
...
S.data = (await import('../src/data/seed.js')).seed();
```

And the static-contract style for sw.js (lines 123-142): `source('public/sw.js')` + substring/regex assertions — extend these deliberately if the push handler changes any pinned substring.

**Analog:** `test/dependencies.test.mjs:32-48` — the exact-pin test to AMEND:

```js
test('package.json runtime dependencies are exactly { @office-kit/xlsx, pg } (D-12 as amended by Phase 45 D-02 + Phase 54)', () => {
  ...
  assert.deepEqual(
    Object.keys(pkg.dependencies).sort(),
    ['@office-kit/xlsx', 'pg'],
    `package.json runtime dependencies must be exactly { @office-kit/xlsx, pg } ... — found: ...`,
  );
  assert.match(pkg.dependencies.pg, /^\^8\./, 'pg must stay on the 8.x line (D-01 pin)');
  assert.equal(pkg.dependencies['@office-kit/xlsx'], '0.26.1', ...);
});
```

**Copy:** update the sorted-key list to include `'web-push'`, the explanatory message, and add an exact-pin assertion `assert.equal(pkg.dependencies['web-push'], '4.0.0', ...)` in the same style as the xlsx pin. Header comment gains the Phase 59 amendment paragraph (lines 6-20 precedent).

**Sweep/custody test mechanics:** mock `web-push` (module-mock via an import seam — import web-push inside one function — or Node's `mock.module`); assert 404/410 → row deleted, 429/5xx → row kept; VAPID restart test writes `/data`-temp JSON, re-boots, asserts the same key loads. Payload-budget test per RESEARCH Code Examples (`Buffer.byteLength(payload) <= 4096` with pathological FR titles).

**G-37-2 amendments (Pitfall 4):** flip `push_due` pins in `test/notif-hydration.test.mjs:113-124`, `test/notif-prefs.test.mjs:78`, `test/local-prefs.test.mjs:56-57`, `test/migration.test.mjs:493`, `test/helpers/legacy-fixture.mjs:137` — these currently assert push_due is a DROPPED legacy key; D-09 reverses that. Add `push_due: true` to `NOTIF_PREF_KEYS` (server.js:1570-1572 region) and `NOTIF_PREF_DEFAULTS` (server.js:1613-1615 region).

## Shared Patterns

### Fail-absent configuration (VAPID = feature absent)
**Source:** SMTP/MASTER_KEY discipline; `docs/DEPLOY.md` §13 for the runbook shape.
**Apply to:** VAPID custody (server.js boot), `/api/me/push-config` route, settings master toggle rendering.
```js
// Unconfigured VAPID → no config route content, UI hides the toggle,
// sendPushFor no-ops. Never a silent new env requirement for existing installs.
```

### Post-commit fire-and-forget fan-out (P4-f)
**Source:** `server.js:5511-5513` and `server.js:1893-1898`
**Apply to:** both `sendPushFor` call sites; per-send `.catch(err => logWarn(...))`.
```js
if (MAILER.enabled && newNotifs.length) await queueNotifEmails(row, next, newNotifs);
// push beside it: if (PUSH.enabled && newNotifs.length) await sendPushFor(row, next, newNotifs);
```

### Per-recipient gate order (fan-out)
**Source:** `queueNotifEmails` (server.js:1689-1726)
**Apply to:** `sendPushFor` per-recipient loop.
```js
if (n.by === n.to) continue;                    // self-suppression (D-11)
const prefKey = PUSH_NOTIF_KIND[n.type];
if (!prefKey) continue;
const prefs = await getUserNotifPrefs(authority.get(n.to)?.user_id || n.to, wsRow.id);
if (prefs[prefKey] === false) continue;
const projectId = n.project || task?.project || null;
if (projectId && !(await memberCanReadProject(projectById.get(projectId), wsRow.id, n.to))) continue;
```
(No digest-suppression branch for push — D-10 keeps push never suppressed.)

### Route guard ladder + mass-assignment discipline
**Source:** `server.js:4267-4294`
**Apply to:** `/api/me/push-subscriptions` GET/POST/DELETE + test-send routes; `user_id` always from the session; rows only ever for the caller's own user_id.

### Dual-backend schema mirror
**Source:** `server.js:389-394` ↔ `db-adapter.mjs:272-277`; conflict targets `db-adapter.mjs:44-47`
**Apply to:** `push_subscriptions` DDL in both files + `PG_CONFLICT_TARGETS.push_subscriptions = '(endpoint)'` if `insert or replace` is used.

### SW minimal-file contract (T-48-02/T-48-03)
**Source:** `public/sw.js` + `test/browser-push.test.mjs:123-142`
**Apply to:** every sw.js edit — no lifecycle/network tokens, zero strings, pinned substrings stay byte-identical.

### Derived-state, never-stored UI + i18n gate
**Source:** settings.js:522-535 (derived blocked badge); `t`/`tFor` funnels
**Apply to:** the extended Push tab; all new `notif.push.*`/`settings.notif.*` keys in EN + FR catalogues (phase gate).

## No Analog Found

| File | Role | Data Flow | Reason | Fallback |
|------|------|-----------|--------|----------|
| VAPID /data key-file custody (boot) | config | file-I/O | First /data-persisted key file; MASTER_KEY is env-only | RESEARCH.md Pattern 3 + DEPLOY.md §13 runbook model |
| `web-push` send loop (404/410 sweep) | service | event-driven | No existing external-HTTP-failure sweep precedent (email failures only log) | RESEARCH.md Pattern 1 skeleton + Pitfall 1 semantics |

## Metadata

**Analog search scope:** `server.js` (targeted reads: 380-419, 910-949, 1566-1765, 1870-1929, 2627-2676, 4255-4314, 5460-5529), `db-adapter.mjs` (1-110, 240-299), `public/sw.js` (full), `src/core/push.js` (full), `src/pages/settings.js` (505-559), `test/browser-push.test.mjs` (100-159), `test/dependencies.test.mjs` (1-55)
**Files scanned:** ~10 tracked files, all excerpted with line numbers
**Pattern extraction date:** 2026-11-13
