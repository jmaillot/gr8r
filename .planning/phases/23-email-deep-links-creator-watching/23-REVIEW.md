---
phase: 23-email-deep-links-creator-watching
reviewed: 2026-10-30T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/main.js
  - src/shell/render.js
  - src/actions/actions.js
  - server.js
  - src/locales/en.json
  - src/locales/fr.json
  - e2e/helpers/setup.mjs
findings:
  critical: 1
  high: 1
  medium: 2
  low: 3
  total: 7
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-10-30
**Depth:** standard
**Files Reviewed:** 7 source files (e2e specs skimmed, low priority per scope)
**Status:** issues_found

## Summary

Phase 23 wires task deep links into browser history (pushState/popstate), routes emailed task URLs through `APP_URL`, stores the task creator, and adds the creator to the watcher set. The core seams are well-built: `applyDeepLink` is the single URL→view resolver, there is exactly one `popstate` handler registered once at boot, the `?next=` carry is built only from `location.pathname` and validated path-only in `finishLogin`, and emailed URLs use `APP_URL` unconditionally with the boot guard exiting when SMTP is on without it (T-23-01 holds). The no-existence-oracle requirement (T-23-02) holds: unknown and permission-hidden task keys both land on the workspace view with the identical `err.taskNotFound` toast (locales present in en/fr).

However, one crash path is reachable in normal use (Back from the missing-project state throws inside the popstate handler), and the `same`-URL guard that `A.openTask`'s comment claims exists in `go()` does not exist — duplicated history entries are possible.

## Critical Issues

### CR-01: `applyDeepLink` throws TypeError on key-less `project` segment — reachable via Back navigation from the missing-project state

**File:** `src/main.js:132` (reached from `src/main.js:190-204` popstate handler)
**Issue:** `find` unconditionally evaluates `key.toLowerCase()`. When `rest` is `project` with no key segment (`key === undefined`), the comparator throws `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` on the first project examined. This state is now *deterministically produced* by this phase: visiting `/w/acme/project/<bogus>` routes to `go('project', { id: '__missing' }, opt)` and `urlForView` rewrites the URL to `/w/acme/project` (key-less, since `proj('__missing')` has no `key`). Pressing browser Back then fires the popstate handler, which matches `m[2] === 'project'` and calls `applyDeepLink('project', { back: true })` → uncaught throw → the Back navigation silently fails and the view is not restored. Before phase 23 no URL was rewritten on the missing-project path, so this was unreachable from user interaction.
**Fix:**
```js
// src/main.js, applyDeepLink
const [seg, key] = String(rest).split('/');
if (!seg || !key) return;          // or handle key-less segments explicitly
```
Also consider guarding the popstate handler so a resolver throw never breaks navigation:
```js
addEventListener('popstate', () => {
  ...
  try { return applyDeepLink(m[2], { back: true }); }
  catch (err) { console.error('deep link restore failed', err); go('home', {}, { back: true }); }
});
```

## High Issues

### HIGH-01: `go()` pushes duplicate history entries for same-URL navigations — the "same-URL guard" the code relies on does not exist

**File:** `src/shell/render.js:88-93` (vs comment at `src/actions/actions.js:539-543`)
**Issue:** The `A.openTask` comment states "the same-URL guard in go() skips the write when the task URL is already showing (e.g. a popstate re-open)". No such guard exists: `go()` computes `same` but uses it only to skip the fx flags; `history.pushState` runs unconditionally whenever `url` is non-null and `back`/`replace` are unset. Consequences: clicking a task row whose drawer is already open (task URL already in the address bar) pushes an identical entry — Back then appears to do nothing until the duplicate is consumed; the same applies to repeated clicks on the current view's nav item. The internal `S.ui.history` stack is correctly guarded (`noHistory`), but the browser history is not, and the comment documents behavior the code does not have.
**Fix:**
```js
if (api.enabled) {
  const url = urlForView(route, params);
  if (url && url !== location.pathname + location.search) {
    if (opt.back || opt.replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }
}
```
and align the `A.openTask` comment with reality either way.

## Medium Issues

### MED-01: Logged-out `?next=` carry drops the original query string

**File:** `src/main.js:281`
**Issue:** `history.replaceState(null, '', '/login?next=' + encodeURIComponent(location.pathname))` carries only the pathname. A logged-out deep link such as `/w/acme/file/<id>?download=1` (or any future link with query params) loses its query after the login round-trip — `finishLogin` re-navigates to a query-less path. Deep links served by the server's file-route 302 shape can carry queries; the client mirror does not.
**Fix:**
```js
history.replaceState(null, '',
  `/login?next=${encodeURIComponent(location.pathname + location.search)}`);
```
(`finishLogin`'s path-only validator is unaffected; a query inside `next` still passes the `//`, `\\`, `://` checks.)

### MED-02: popstate/deep-link task keys are not percent-decoded before lookup

**File:** `src/main.js:127-134` and `src/main.js:202`
**Issue:** Email URLs are built with `encodeURIComponent(task.key)` (`server.js:718`), but `applyDeepLink` compares the raw (still-encoded) `location.pathname` segment against stored keys. Current keys (`nextKey` produces `<projectKey>-<seq>`, e.g. `PROJ-301`) are URL-safe so this cannot trigger today, but any key containing a space, `/`, or non-ASCII character would decode to a different string on popstate/boot restore and produce a false "Task not found". One round of `decodeURIComponent` on `key` makes the resolver match the encoder.
**Fix:** `const key = decodeURIComponent(String(rest).split('/')[1] || '')` (wrapped in try/catch, or use `safeDecodeURIComponent`, since a malformed `%` sequence throws).

## Low Issues

### LOW-01: `urlForView` local `t` shadows the i18n `t` import; stale eslint-disable

**File:** `src/shell/render.js:109-113`
**Issue:** `const t = S.ui.drawer && task(S.ui.drawer);` shadows the module-level `import { t } from '../core/i18n.js'` within the function — legal but a readability trap in a file where `t(...)` means "translate". Also, `// eslint-disable-line no-unused-vars` is stale: the function is exported and used by `go()`.
**Fix:** rename the local to `drawerTask`; drop the eslint-disable comment.

### LOW-02: Locale key indentation inconsistency in en.json

**File:** `src/locales/en.json:256`
**Issue:** `"err.taskNotFound"` is indented with one space while all sibling keys use two. JSON-valid, but inconsistent with the file's formatting (fr.json:257 is correct).
**Fix:** align indentation with neighboring lines.

### LOW-03: `withAcmeDoc` retry loop can exhaust attempts silently returning nothing; `attempts` magic number

**File:** `e2e/helpers/setup.mjs:98-110`
**Issue:** If every attempt 409s up to `attempts - 1`, the loop exits without returning or throwing (the final `throw` after the loop is unreachable-looking but only fires on the impossible path where `i === attempts` never triggered the `put.status !== 409` branch). Test-infra only, no product impact.
**Fix:** restructure so the last failed attempt always throws with its status (it does today only because `i === attempts` is checked inside the branch — keep it, but add a trailing `throw new Error(...)` is already present; verify by test or simplify to a while-loop with an explicit exhaust throw).

## Verified Clean (threat-model checks that pass)

- **T-23-01:** `queueNotifEmails` (`server.js:693-720`) builds task URLs exclusively from `APP_URL` (trimmed, trailing slashes stripped at `server.js:67-70`); the boot guard (`server.js:3005-3010`) exits when SMTP is enabled without `APP_URL`, so request Host cannot poison emailed links.
- **T-23-02:** unknown key and `canSee`-hidden task both route to `go('home')` + identical `err.taskNotFound` toast (`src/main.js:152-159`); key exists in both locales.
- **Open-redirect:** `finishLogin` validator (`src/actions/actions.js:2821-2824`) is path-only (single `/`, no `//`, no `\`, no `://`); the client-built `next` comes only from `location.pathname` (`src/main.js:276-281`).
- **History correctness:** exactly one `popstate` listener, registered once at module load, gated on `api.enabled && api.user && !S.ui.auth`; back/replace paths all use `replaceState`, forward paths `pushState` (`src/shell/render.js:88-93`).
- **Watcher set:** `taskWatchers` (`src/actions/actions.js:158-159`) — `Set` dedupes creator == assignee; `x !== D().me` prevents self-notification including the creator-is-actor case; `filter(Boolean)` handles legacy tasks with no `creator` field.

---

_Reviewed: 2026-10-30_
_Reviewer: gsd-code-reviewer (subagent)_
_Depth: standard_
