# Phase 34: Per-User Settings Isolation & Search Leak Closure - Pattern Map

**Mapped:** 2026-11-03
**Files analyzed:** 12 (5 modified, 4 new, 3 test/infra files)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — `user_notif_prefs` DDL | model (DDL block) | CRUD | `server.js` create-table block :140-288 | exact |
| `server.js` — `migrateUserNotifPrefs()` | migration | batch (one-time backfill) | `server.js` `migrateTeamMembership` :1775-1823 | exact |
| `server.js` — `getUserNotifPrefs()` accessor | service (query) | request-response | accessor shape = research; `emptyDoc` defaults :1654-1668 + `normalizeDoc` D-27-5 merge :633-638 define the default layer | role-match |
| `server.js` — GET/PUT prefs routes | route | request-response | `server.js` `/api/auth/me` GET/PATCH :3017-3036 | exact |
| `server.js` — `normalizeDoc` strip | transform | transform | `server.js` :611-614 (D-30 sessions/tfa strip) | exact |
| `server.js` — `mergeClientDoc` strip | transform | transform | `server.js` :1405-1412 (write-path deletes) | exact |
| `server.js` — reminder gate + `queueNotifEmails` consumers | service | event-driven | existing call sites :1288 and :1114-1116 (modified, not cloned) | role-match |
| `src/lib/redaction.js` (new) | utility (pure fn) | transform | `server.js` `hiddenProjectTerms`/`referencesHidden`/`mergeRecentSearches` :879-912 | role-match (extract + replace predicate) |
| `src/core/store.js` — local prefs strip + docSnapshot exclusion | store | file-I/O (localStorage) | `stripLegacyLang` :26-29 + `load`/`save`/`docSnapshot` :30-147 | exact |
| `src/core/store.js` or actions — local-mode prefs load/save | utility | file-I/O (localStorage) | `src/core/i18n.js` `storeLocale`/`readStoredLocale` :110-127 | exact |
| `src/actions/actions.js` — `npToggle` branch | hook (IN handler) | event-driven | `IN.langSel` api/local branch :2692-2703 | exact |
| `src/pages/settings.js` — np read source | component | request-response | existing `settingsBody` `const np = d.notifPrefs` :167 (modified read source) | role-match |
| `src/data/seed.js` — remove notifPrefs block | config (seed data) | — | existing block :513-525 (deleted) | exact (deletion) |
| `src/core/api.js` — prefs client methods | service (HTTP client) | request-response | `patchMe` :246-252 | exact |
| `test/notif-prefs.test.mjs` (new) | test | request-response | `test/migration.test.mjs` :196-212 (strip pin) + byte-identical pins :418-497 + `test/helpers/server.mjs` | exact |
| Search table suite (new file, discretion) | test | — | end-to-end redaction pins in `test/scope.test.mjs` :1126-1143; unit-table style: `node:test` `test()` rows | role-match |
| `CHANGELOG.md` — SEARCH-01 note | doc | — | existing CHANGELOG entries | exact |

All analog paths verified git-tracked via `git ls-files` (`src/lib/qr.js` confirms `src/lib/` is a tracked home for a new module).

## Pattern Assignments

### `server.js` — `user_notif_prefs` DDL (model, CRUD)

**Analog:** create-table block, `server.js:140-288`

```sql
create table if not exists totp_factors (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  name       text not null,
  secret     text not null,
  last_step  integer not null default 0,
  created_at integer not null
);
create index if not exists totp_factors_user on totp_factors(user_id);
```

Copy: `create table if not exists` inside the same boot block, a Phase-numbered comment block above (see the `/* TOTP2 (Phase 31, D-06): ... */` comment style at :154-160), index after table. New table per D-10: `workspace_id text not null, user_id text not null, prefs text not null, primary key (workspace_id, user_id)` — a composite PK needs no separate index. Byte-identical DDL across boots is pinned in tests (see below).

### `server.js` — `migrateUserNotifPrefs()` (migration, batch)

**Analog:** `migrateTeamMembership`, `server.js:1775-1823` — clone this structure exactly.

**Guard pattern** (:1776-1790):
```js
function migrateTeamMembership(conn) {
  const eligible = () =>
    conn
      .prepare(
        `select count(*) as n from memberships m
          where m.team is not null
            and not exists (select 1 from team_members tm
                             where tm.workspace_id = m.workspace_id and tm.user_id = m.user_id)`,
      )
      .get().n;
  ...
  if (!eligible() && !invitesEligible()) return;
```
Phase-34 guard is row-level in JS, not pure SQL (the field lives in the `workspaces.doc` JSON blob): select workspace rows, `JSON.parse` with try/catch (precedent: `migrateTenancy` :1843-1844 falls back safely on unreadable docs — note migrateTenancy's loop `for (const row of rows) { if (row.slug) continue; ... }`), guard = doc has `data.notifPrefs` AND some member lacks a row.

**Backup pattern** (:1791-1801) — no backup = no mutation:
```js
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-pre-team-members-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    conn.exec('pragma wal_checkpoint(truncate)');
    conn.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
    console.log(`  pre-migration backup: ${backup}`);
  } catch (err) {
    console.error(`  pre-migration backup failed: ${err.message}`);
    return;
  }
```

**Transaction pattern** (:1802-1822) — row copy AND doc-field delete in ONE `begin immediate`:
```js
  conn.exec('begin immediate');
  try {
    conn.prepare(`insert or ignore into team_members (...) select ... and not exists (...)`).run();
    // per-row JS mutation precedent (:1815-1817):
    for (const row of conn.prepare('select rowid, team from invites where team is not null and teams is null').all()) {
      conn.prepare('update invites set teams = ? where rowid = ?').run(JSON.stringify([row.team]), row.rowid);
    }
    conn.exec('commit');
  } catch (err) {
    conn.exec('rollback');
    throw err;
  }
}
```
The doc-strip loop here is the exact analog for "for each workspace row carrying `notifPrefs`, re-serialize the doc without the field". Registration point: the `boot()` migration call sequence :1755-1758 (`migrateTotpFactors(); migrateTotpReWrap(); ...`).

### `server.js` — GET/PUT prefs routes (route, request-response)

**Analog:** `/api/auth/me` PATCH, `server.js:3025-3036` — the per-user, session-authenticated, non-workspace-doc route precedent.

```js
  if (pathname === '/api/auth/me' && method === 'PATCH') {
    const user = requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    // Only body.locale is read; every other field is ignored (mass-assignment guard).
    const locale = String(body?.locale || '');
    if (!LOCALE_CODES.includes(locale)) return fail(res, 400, 'unknownLocale', 'Unknown locale');
    db.prepare('update users set locale = ? where id = ?').run(locale, user.id);
    const fresh = db.prepare('select * from users where id = ?').get(user.id);
    return json(res, 200, { user: userPayload(fresh) });
  }
```

Copy verbatim: hand-rolled `if (pathname === ... && method === ...)` dispatch, `requireUser` → early return, `sameOrigin` guard, `readJson`, whitelist-with-400 (`LOCALE_CODES.includes` is the D-03 whitelist analog; boolean coercion replaces `String()`), prepared statement, `fail(res, code, errKey, msg)` error convention, `json(res, ...)` response. GET route precedent is `/api/auth/me` GET :3017-3023. `user_id` MUST come from `user.id` (session), never from body — the `body.locale` mass-assignment comment is the discipline to quote.

### `server.js` — read-side strip in `normalizeDoc` (transform)

**Analog:** D-30 strip, `server.js:611-614`, plus the block to REMOVE at :630-638.

```js
  // Auth state lives in the sessions table and user columns, never in the
  // document (D-30): drop legacy sessions/tfa keys on every read.
  delete out.data.sessions;
  delete out.data.tfa;
```

Replace (:630-638) the D-27-5 default-merge — this block MUST be deleted, not kept alongside the strip:
```js
  // D-27-5: the three reminder prefs default ON — a stored doc predating them
  // must read as all-ON (=== false disables), never silently silenced.
  out.data.notifPrefs = {
    email_reminder: true,
    due_reminder: true,
    past_due: true,
    ...(out.data.notifPrefs && typeof out.data.notifPrefs === 'object' ? out.data.notifPrefs : {}),
  };
```

### `server.js` — write-side strip in `mergeClientDoc` (transform)

**Analog:** `server.js:1405-1412`.

```js
  // The plan, invoices, sessions and tfa fields are gone; a stale client's copy
  // must never resurrect them. Both the read path (normalizeDoc) and this write
  // path strip independently (D-30, P-A), so a stored document is cleaned on the
  // first load and stays clean after every save.
  delete next.data.plan;
  delete next.data.invoices;
  delete next.data.sessions;
  delete next.data.tfa;
```

Add `delete next.data.notifPrefs;` here. Note: `delete next.data.invoices` ALREADY exists — the SETTINGS-03 pin test (analog below) just asserts it.

### `server.js` — accessor defaults (service)

**Analog:** `emptyDoc` defaults, `server.js:1654-1668` (the exact 13-key set, incl. `email_comment: false`) + the reminder-trio merge at :633-638 above.

```js
        notifPrefs: {
          email_mention: true,
          email_assign: true,
          email_digest: true,
          email_comment: false,   // ONLY non-ON default
          email_reminder: true,
          due_reminder: true,
          past_due: true,
          push_mention: true,
          push_assign: true,
          push_comment: true,
          push_due: true,
          mention_all: true,
          assign_self: true,
        },
```
Accessor shape (research-verified): `{ ...NOTIF_PREF_DEFAULTS, ...JSON.parse(row.prefs) }` — merge-on-read, `=== false` disables; undefined-falsy for the 4 keys with no server default today (mention_team, mention_ws, assign_status, assign_over) preserves zero-change switch-over.

### `src/lib/redaction.js` (utility, transform) — NEW

**Analog:** the leak surface, `server.js:879-912` (extract to the module, swap the predicate).

**`hiddenProjectTerms`** (:879-888) — already lowercases; must add NFC:
```js
function hiddenProjectTerms(doc, hiddenProjects) {
  const terms = [];
  for (const p of doc?.data?.projects || []) {
    if (!p?.id || !hiddenProjects.has(p.id)) continue;
    for (const value of [p.name, p.key]) {
      if (typeof value === 'string' && value.trim()) terms.push(value.trim().toLowerCase());
    }
  }
  return terms;
}
```

**THE LEAK** (:891):
```js
const referencesHidden = (term, hiddenTerms) => typeof term === 'string' && hiddenTerms.some(name => term.toLowerCase().includes(name));
```

**Call sites to re-point** (:898-912 and :936):
```js
function mergeRecentSearches(storedList, incomingList, hiddenTerms, keepStored) {
  ...
  for (const term of incoming) {
    if (typeof term !== 'string' || referencesHidden(term, hiddenTerms) || out.includes(term)) continue;
    out.push(term);
  }
  stored.forEach((term, index) => {
    ...
    if (!keepStored && !referencesHidden(term, hiddenTerms)) return;
    out.splice(Math.min(index, out.length), 0, term);
  });
  return out.slice(0, 5);
}
...
  if (Array.isArray(data.recentSearches)) data.recentSearches = data.recentSearches.filter(term => !referencesHidden(term, hiddenTerms));  // :936 inside redactDoc
```

New module: pure `tokenize` + `referencesHidden(term, hiddenTerms)` per D-13/D-14 (NFC + `toLowerCase` both sides, token-set intersection, no diacritic stripping). server.js imports it; `server.js` itself stays export-free. `src/lib/qr.js` confirms `src/lib/` is a valid tracked home.

### `src/core/store.js` — client strip + snapshot exclusion (store, localStorage)

**Analog:** `stripLegacyLang`, `src/core/store.js:23-29`:
```js
/* The language lives on the account (users.locale), never in the shared document:
   an old localStorage blob or an old server doc must not resurrect prefs.lang into
   S.prefs, or docSnapshot() would write it back into workspaces.doc on every save. */
function stripLegacyLang(prefs) {
  delete prefs.lang;
  return prefs;
}
```
Copy this comment-discipline verbatim for a `stripLegacyNotifPrefs(doc)` applied in `load()` (:30-41, JSON.parse + shape check + try/catch) and excluded in `docSnapshot()`. Save/hydrate flow: `save()` :132-147 (debounced `localStorage.setItem(STORE_KEY, JSON.stringify(docSnapshot()))` + `api.enabled` branch into `push()`), `push()` :110-130 (`api.putWorkspace(docSnapshot())`, 450ms retry), `applyDoc(doc, revision)` :175.

### Local-mode prefs persistence (utility, localStorage) — NEW

**Analog:** `src/core/i18n.js:108-127`:
```js
/* D-15: demo mode's persistence backend. A dedicated key, deliberately outside the
   projects.v2 blob, so the language can never re-enter the prefs/document pipeline. */
export const LOCALE_STORAGE_KEY = 'projects.locale';

export function storeLocale(code) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    /* storage blocked or absent */
  }
}

export function readStoredLocale() {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    return LOCALES.some(l => l.code === v) ? v : null;
  } catch {
    return null;
  }
}
```
Copy: module-level exported key const ('projects.notifPrefs.' + workspace slug satisfies D-08's per-workspace pin), try/catch both directions, read-side validation (whitelist membership check is the analog of `LOCALES.some(...)`).

### `src/actions/actions.js` — `npToggle` branch (hook, event-driven)

**Analog — the code being modified** (:2676-2680):
```js
IN.npToggle = el => {
  D().notifPrefs[el.dataset.k] = el.checked;
  save();
  toast(t('toast.notifPrefsSaved'), { ms: 1500 });
};
```

**Analog — the api/local branch shape** (`IN.langSel`, :2688-2703):
```js
/* D-12: the language is applied instantly and persisted separately. ... */
IN.langSel = async el => {
  const code = el.value;
  await setLocale(code);
  if (!api.enabled) return storeLocale(code);
  const r = await api.patchMe({ locale: code });
  if (r.ok) return;
  if (r.status === 401) {
    window.dispatchEvent(new CustomEvent('projects:save-error', { detail: { status: 401, error: r.error } }));
    return;
  }
  toast(t('toast.localeSaveFailed'), { kind: 'err', ms: 6000 });
};
```
D-07's branch = `IN.langSel` verbatim structure: optimistic local update first, `if (!api.enabled) return <localStorage write>`, then async API call, 401 → save-error event, failure → `toast(t('toast....'), { kind: 'err', ms: 6000 })`.

### `src/core/api.js` — prefs client methods (service, request-response)

**Analog:** `patchMe`, `src/core/api.js:246-252`:
```js
  /* Update the signed-in account's own fields (today: locale). The returned payload is
     adopted so state.user stays fresh without another me() round-trip. */
  async patchMe(patch) {
    const r = await call('PATCH', '/api/auth/me', patch);
    if (r.ok) applyUser(r.data);
    return r;
  },
```
Also note the sessions-family comment style (:253-254): "auth-scoped ... take no workspace slug, so these follow the login/logout pattern above — no slug guard" — but prefs ARE workspace-scoped, so a `workspaceId` param rides in the path/body; copy the comment-and-decision discipline either way.

### `src/pages/settings.js` — np read source (component)

**Analog — code being modified** (:166-167, :367-391):
```js
  const np = d.notifPrefs;
  ...
  srow(t('settings.notif.mentions'), t('settings.notif.mentionsDesc'), tog('email_mention', np.email_mention, 'np')) +
  ...
  srow(t('settings.notif.atTeam'), t('settings.notif.atTeamDesc'), tog('mention_team', np.mention_team !== false, 'np')) +
  srow(t('settings.notif.atWorkspace'), t('settings.notif.atWorkspaceDesc'), tog('mention_ws', !!np.mention_ws, 'np'))
```
Only the `np` binding changes (from `D().notifPrefs` to the new per-user prefs object from the store); the 17 `tog(key, value, 'np')` rows and their undefined-handling coercions (`!== false`, `!!`) stay — the UI already renders the merge-on-read semantics the accessor must reproduce.

### `src/data/seed.js` — removal (config)

**Analog — block to delete**, `src/data/seed.js:513-525`:
```js
    recentSearches: ['homepage', 'Sarah', 'wireframes'],
    notifPrefs: {
      email_mention: true,
      ...
      assign_self: true,
    },
```
Note `'Sarah'` in `recentSearches` (:513) stays — it is the false-positive test seed for the tokenized matcher.

### `test/notif-prefs.test.mjs` (test, request-response) — NEW

**Analogs:**
- Harness: `test/helpers/server.mjs` (:1-60) — `startServer({ dataDir })`, `withDb`, `signup`, `login`, `client`; `DB_PATH: path.join(dir, 'projects.db')`; reboot against the same `dataDir` for migration tests (:38-42 comment).
- Byte-identical boot pin, `test/migration.test.mjs:418-437`:
```js
test('a second boot is a no-op and both accounts keep access', async () => {
  const firstBoot = snapshot();
  await server.stop();
  ...
  server = await startServer({ dataDir });
  const secondBoot = snapshot();
  assert.deepEqual(secondBoot, firstBoot, 'no slug/doc/member_id/revision drift');
  assert.equal(secondBoot.backups.length, 1, 'no second backup');
```
- DDL byte-identity pin (:460-497): `pragma table_info` → column tuples, `sqlite_master` sql, `deepEqual(identitySchema(), firstBoot)` across reboot.
- invoices/doc-strip pin (:196-212) — the SETTINGS-03 pin shape:
```js
test('a legacy document carrying plan and invoices hydrates and saves without them', async () => {
  const read = await signedIn.client.get(`/api/workspaces/${SLUG}`);
  const doc = structuredClone(read.data.doc);
  const saved = await signedIn.client.put(`/api/workspaces/${SLUG}`, { revision: read.data.revision, doc });
  const after = await signedIn.client.get(`/api/workspaces/${SLUG}`);
  assert.equal(after.data.doc.data.invoices, undefined, 'the invoices field is gone after a write');
```
- Doc-fixture planting via `withDb` + `update workspaces set doc = ?` (`test/scope.test.mjs:1126-1136`) — how to seed a stored doc carrying `notifPrefs` before reboot.

### SEARCH-01 table suite (test) — NEW (file home is discretion)

**Analogs:** end-to-end redaction pins in `test/scope.test.mjs:1138-1143`:
```js
test('404-matrix [D-06] the scoped member\u2019s activity feed and recent searches carry zero out-of-scope references', async () => {
  const view = (await scoped.get('/api/workspaces/acme')).data;
  assert.deepEqual(view.doc.data.recentSearches, ['In Scope planning', 'generic term'], 'recent-search terms naming an out-of-scope project are scrubbed');
```
CRITICAL (research-verified): **no test file imports `mergeRecentSearches`/`referencesHidden` directly today** — the pin is indirect. The `{term, hiddenTerms, expected}` table therefore requires the extracted `src/lib/redaction.js` module (unit `import` + `node:test` rows); keep/extend the end-to-end doc-level pins in scope/privacy tests for the call-site wiring (D-15's workspace-wide pin lives there too).

## Shared Patterns

### Prepared statements + fail() error convention
**Source:** `server.js:3033` (statement), `:3032` (`fail(res, 400, 'unknownLocale', ...)`)
**Apply to:** prefs accessor, GET/PUT routes, migration statements
```js
db.prepare('update users set locale = ? where id = ?').run(locale, user.id);
return fail(res, 400, 'unknownLocale', 'Unknown locale');
```

### Strip-both-directions comment discipline
**Source:** `server.js:611-614` and `:1405-1412`
**Apply to:** both strip sites — each carries a comment naming WHY (D-30 precedent); mirror it for notifPrefs.

### Guarded-backfill invariant (no backup = no mutation; guard false forever after)
**Source:** `server.js:1762-1801`
**Apply to:** `migrateUserNotifPrefs` — the D-11 doc-field delete inside the same transaction is what makes the byte-identical second boot structurally true.

### localStorage try/catch + exported key const
**Source:** `src/core/i18n.js:110-127`
**Apply to:** local-mode prefs module and any client strip.

### Optimistic-then-branch toggle handler
**Source:** `src/actions/actions.js:2692-2703` (`IN.langSel`)
**Apply to:** `npToggle`.

### HTTP-driven test harness; server.js exports nothing
**Source:** `test/helpers/server.mjs` (whole file)
**Apply to:** all new tests — only the pure redaction module may be unit-imported; everything server-side goes through `startServer`/`login`/`client`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `getUserNotifPrefs` accessor | service | request-response | First DB-backed per-user accessor in server.js; shape comes from RESEARCH.md code example, defaults cloned from `emptyDoc` (:1654-1668) + reminder trio (:633-638) |
| reminder-gate per-recipient restructure (server.js:1288 area) | service | event-driven | Today's gate reads prefs once per workspace (:1288 `const prefs = doc?.data?.notifPrefs || {}` before the task loop at :1291); no per-recipient consumer exists — the restructure is new plumbing, informed by the existing per-task `assigneeMembership` lookup (:1298-1300) as the placement precedent |

## Metadata

**Analog search scope:** `server.js`, `src/core/`, `src/actions/`, `src/pages/`, `src/data/`, `src/lib/`, `test/`
**Files scanned:** ~15 (targeted section reads on server.js — 7 non-overlapping ranges)
**Git-tracked verification:** all named analogs confirmed via `git ls-files`
**Pattern extraction date:** 2026-11-03
