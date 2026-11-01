# Phase 23: Email Deep Links & Creator Watching - Pattern Map

**Mapped:** 2026-10-30
**Files analyzed:** 7 modified + 5 new test files
**Analogs found:** 7 / 7 (this is a wiring phase — all analogs are the files being modified; new test files have clear in-repo templates)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (queueNotifEmails URL line, ~712; boot guard message, ~2999) | service | batch (notification fan-out) | itself + `server.js:2899-2906` (file-route 302 `?next=` shape) | exact |
| `src/main.js` (applyDeepLink task branch ~134-137; logged-out boot branch ~212-218) | boot/controller | request-response (URL→state) | itself + `src/actions/actions.js:2793-2806` (finishLogin `?next=`) | exact |
| `src/shell/render.js` (`go()` 64-83 — add URL sync/pushState) | shell/router | event-driven (state→URL) | itself (only navigation choke point in codebase) | exact |
| `src/shell/layout.js` or `src/main.js` (new popstate listener) | shell/router | event-driven (popstate) | `src/main.js` init() (single boot-time registration pattern) | role-match (no popstate exists yet) |
| `src/actions/actions.js` (`createTask` 61+ add `creator`; `taskWatchers` 156-158 add creator) | model/store | CRUD (workspace-doc) | itself (P4-d/e watcher model) | exact |
| `test/notif-email-link.test.mjs` (new) | test | batch | `test/error-codes.test.mjs` (static-extraction + helpers/server.mjs pattern); mailer `buildNotifMessage` is pure | role-match |
| `test/creator-watcher.test.mjs` (new) | test | CRUD | `test/activity-verbs.test.mjs` / `test/membership.test.mjs` (doc-level mutation tests via client helpers) | role-match |
| `test/next-carry.test.mjs` (new) | test | request-response | `test/error-codes.test.mjs` header + `startServer/login/signup` helpers | role-match |
| `test/notif-email-link.test.mjs` (new; also carries the boot-guard assertion as Test 4 — no standalone `test/app-url-guard.test.mjs` in this phase) | test | config | `test/server-boot.test.mjs` (boot-failure assertions) | role-match |
| `e2e/*` deep-link + back-forward spec (new, EN+FR) | test (e2e) | event-driven | `e2e/flows.spec.mjs` (describe conventions, catalogue-backed strings, per-run X-Forwarded-For) | exact |

All analog paths verified git-tracked (`git ls-files` non-empty for server.js, src/main.js, src/shell/render.js, src/shell/layout.js, src/actions/actions.js, src/overlays/drawer.js, mailer.js).

## Pattern Assignments

### `server.js` — queueNotifEmails URL (LINK-01)

**Analog:** `server.js:700-723` (the code being modified) + `server.js:1370` (`appBase()`)

**Core pattern — the exact line to change** (lines 704-721):
```javascript
for (const n of newNotifs) {
  if (n.by === n.to) continue; // never email the author about their own action
  const prefKey = NOTIF_EMAIL_KIND[n.type];
  if (!prefKey || prefs[prefKey] === false) continue;
  const profile = profiles.get(n.to);
  const to = (profile && emailByUserId.get(profile.userId)) || emailByMemberEmail.get(n.to);
  if (!to) continue;
  const taskTitle = n.task ? (nextDoc?.data?.tasks || []).find(x => x?.id === n.task)?.title || 'a task' : 'a task';
  const url = `${base}/`;          // ← replace: resolve key from nextDoc like taskTitle does
  MAILER.sendNotif({ to, workspace: wsName, by: …, task: taskTitle, snippet: …, kind: n.type, url })
    .catch(err => console.warn(`notif email ${n.id} → ${to}: ${err.message}`));
}
```
Planned shape (per RESEARCH Pitfall 2): `const task = nextDoc?.data?.tasks?.find(x => x?.id === n.task); const url = task?.key ? `${APP_URL}/w/${wsRow.slug}/task/${encodeURIComponent(task.key)}` : `${APP_URL}/w/${wsRow.slug}/`;` — note `n.task` is a task **id**, not a key; id→key lookup happens here at email-build time.

**Boot guard to widen (message only, not condition)** (server.js:2995-3004):
```javascript
if (MAILER.enabled && !APP_URL) {
  console.error('invite email: refusing to start — SMTP_HOST is set but APP_URL is empty.');
  console.error("Invitation links are built from APP_URL; …");
  process.exit(1);
}
```
Widen wording to cover notification links; condition already gates all MAILER use.

### `src/main.js` — applyDeepLink task branch (D-01/D-02)

**Analog:** `src/main.js:122-147` (function being modified)

```javascript
if (seg === 'task') {
  const t = find(data.tasks || [], 'key');
  if (t) return go('task', { id: t.id });   // ← replace: drawer-open path (go('task') renders page404)
}
```
Critical (Pitfall 1): `'task'` is not in `renderPage()`'s page map (`src/shell/layout.js:45-67`) — there is NO task page. The deep link must drive the drawer exactly as `A.openTask` does (see next pattern) over an underlying page (`go('project', { id: t.project })` or home).

**Analog for the drawer-open mutations — `A.openTask`** (`src/actions/actions.js:521-540`):
```javascript
A.openTask = el => {
  const id = el.dataset.id;
  if (!task(id)) return;
  if (!canSee(proj(task(id).project))) {
    toast(t('err.taskAccess'), { kind: 'err' });   // ← permission-hidden: keep no-oracle (D-02 lean: same "not found" notice)
    return;
  }
  …
  S.ui.drawer = id;
  S.ui.drawerFull = S.prefs.openTasks === 'full' || …;
  S.ui.pop = null; S.ui.palette = null; S.ui.modals = [];
  S.ui.mention = null; S.ui.subOpen = null;
  S.ui.drawerTab = S.ui.drawerTab || 'comments';
  render();
  const dr = $('.drawer');
  if (dr && !dr.contains(document.activeElement)) dr.focus({ preventScroll: true });
};
```
Drawer renders via `src/overlays/drawer.js:22-23`: `if (u.drawer && task(u.drawer)) h += … drawerHtml(task(u.drawer));`

**Logged-out `?next=` carry site** (`src/main.js:212-218`, current):
```javascript
if (!user) {
  S.ui.wantedSlug = slugFromPath || null;
  S.ui.auth = authRoutes.includes(h) ? h : 'login';
  render();                                  // ← insert history.replaceState(null, '', `/login?next=${encodeURIComponent(location.pathname)}`) BEFORE render, only when restFromPath is non-empty
  return;
}
```
Mirror the server file-route 302 shape (`server.js:2902`): `const next = `/login?next=${encodeURIComponent(url.pathname)}`;` so both paths converge in `finishLogin`.

### `src/shell/render.js` — `go()` URL sync (LINK-04)

**Analog:** `src/shell/render.js:64-83` (the function being modified)
```javascript
export function go(route, params = {}, opt = {}) {
  if (route === 'project' && !params.tab) params.tab = 'board';
  if (!opt.back) S.ui.history.push({ route: S.ui.route, params: S.ui.params });
  const same = S.ui.route === route && JSON.stringify(S.ui.params) === JSON.stringify(params);
  S.ui.route = route;
  S.ui.params = params;
  …
  render();
  …
}
```
Recommended (RESEARCH Pattern 4): after state mutation, `history.pushState(null, '', urlForView(route, params))` — **skip when `opt.back`** (use replaceState or nothing, so popstate→`go(…, {back:true})` never double-pushes, Pitfall 4). The 12 existing `history.replaceState` sites (actions.js:2252, 2448, 2763, 2822, 2843, 2968, 3022, 3034, 3094; main.js:197, 230) are auth/workspace transitions — leave untouched.

**Popstate handler** (new, register once in main.js init after boot): map URL back through an `applyDeepLink`-style resolver and call `go(target, params, { back: true })`.

### `src/actions/actions.js` — creator watcher (LINK-03, D-05)

**Analog:** `src/actions/actions.js:153-158` (the function being extended)
```javascript
/* P4-d/e: watchers of a task = its assignee plus everyone who commented on it.
   The author is excluded inside notifyMembers, but pre-filtering here keeps the
   notification lists honest for dedup and cap accounting. */
export function taskWatchers(t) {
  return [...new Set([t.assignee, ...commentsOf(t.id).map(c => c.by)].filter(Boolean).filter(x => x !== D().me))];
}
```
Planned: add `t.creator` into the Set input — `[t.assignee, t.creator, …]` — the `Set` dedups creator-with-assignee and `filter(Boolean)` already tolerates legacy tasks with no creator (no backfill per CONTEXT.md). D-05 self-exclusion already exists twice: client `x !== D().me` here + server `if (n.by === n.to) continue;` (server.js:705).

**Analog for adding creator — `createTask` defaults literal** (`src/actions/actions.js:61-90`):
```javascript
export function createTask(f) {
  const p = proj(f.project) || visibleProjects().find(canSee);
  const maxO = Math.max(0, ...D().tasks.map(t => t.order));
  const tk = Object.assign(
    {
      project: p.id,
      title: t('task.untitled'),
      status: 'todo',
      assignee: null,
      …
      created: Date.now(),
      updated: Date.now(),
      order: maxO + 1,
      …
```
Add `creator: D().me` to the defaults literal (verified: no creator field exists today).

### Sign-in return (LINK-02, D-04) — already built, reuse verbatim

**Analog:** `src/actions/actions.js:2793-2806` (`finishLogin`) — do NOT reinvent:
```javascript
const next = new URLSearchParams(location.search).get('next');
if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.includes('://')) {
  location.assign(next);
  return;
}
```
This is the codebase's path-only open-redirect rule, duplicated at `server.js:2903`. If a third copy is needed, extract a tiny shared helper (RESEARCH "Don't Hand-Roll"). Invalid next falls through to the wantedSlug flow (line 2807+).

### `test/notif-email-link.test.mjs` (new) — test analog

**Analog:** `test/error-codes.test.mjs` header + `test/helpers/server.mjs`:
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, ROOT, login, signup, startServer, client, inviteToken } from './helpers/server.mjs';
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
```
Key fact: server.js cannot be imported by a test (boots on load) — either test statically via source-text extraction (house pattern) or test the pure `buildNotifMessage` (`mailer.js:393-417`, interpolates `msg.url` into text+HTML bodies with `escapeHtml`). Run: `node --test test/<file>.test.mjs`.

### e2e deep-link + back-forward spec (new) — test analog

**Analog:** `e2e/flows.spec.mjs` conventions (from its header):
- Chromium full happy paths, role/label/text selectors + toast assertions
- **EN + FR parametric** (every asserted string read from `src/locales/en.json` / `fr.json`, never hardcoded)
- Fixtures only through the real API (`helpers/setup.mjs`); every account/context presents its own run-unique `X-Forwarded-For`
- Run: `npx playwright test --config e2e/playwright.config.mjs`

### i18n strings (D-02 "task not found" notice)

**Analog:** catalogue gates `test/catalogue.test.mjs` / `test/i18n-scan.test.mjs` — every new UI string must exist in BOTH `src/locales/en.json` and `src/locales/fr.json` in the same commit (Pitfall 5). Toast pattern: `toast(tk('err.taskAccess'), { kind: 'err' })` (actions.js:525).

## Shared Patterns

### Path-only `?next=` validation (open-redirect guard)
**Source:** `src/actions/actions.js:2802-2803` and `server.js:2902-2903`
**Apply to:** the new logged-out boot carry in `src/main.js`; any code reading `?next=`
```javascript
next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.includes('://')
```
Invalid → fall back to workspace root (CONTEXT.md D-04 lean). Server never echoes client-supplied next — build from `location.pathname`/`url.pathname` only.

### Never self-notify (D-05) — double exclusion
**Source:** `src/actions/actions.js:157` (`x !== D().me`) + `server.js:705` (`if (n.by === n.to) continue;`)
**Apply to:** creator-watcher work; assert in `test/creator-watcher.test.mjs` that creator-as-commenter generates zero self-rows.

### APP_URL for emailed absolute URLs (never request Host)
**Source:** `server.js:2995-3004` (boot guard) + RESEARCH anti-pattern
**Apply to:** `queueNotifEmails` URL building; phase 27 reminder emails will inherit the same helper.

### No existence oracle
**Source:** `server.js:2890-2896` (file-route 302 byte-identical for real/unknown/foreign slugs)
**Apply to:** deep-link task resolution — unknown task and permission-hidden task produce the identical "task not found" notice (D-02).

### Zero runtime dependencies
**Source:** project constraint (RESEARCH)
**Apply to:** everything — native `history` API via `go()`, `URLSearchParams`; no router library, no npm installs (`test/dependencies.test.mjs` enforces).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| popstate handler (in `src/main.js` or `src/shell/`) | shell/router | event-driven | No popstate listener exists anywhere yet — shape comes from RESEARCH Pattern 4 (`go(target, params, { back: true })`, replaceState-skip on `opt.back`) |
| `urlForView(route, params)` helper | utility | transform | New; start with task case (`/w/:slug/task/:key`) + workspace root; extensible per "View URL scope" discretion |

## Metadata

**Analog search scope:** `server.js`, `src/main.js`, `src/shell/`, `src/actions/`, `src/overlays/`, `mailer.js`, `test/`, `e2e/`
**Files scanned:** ~20 (all analog excerpts above read and line-verified this session)
**Pattern extraction date:** 2026-10-30
