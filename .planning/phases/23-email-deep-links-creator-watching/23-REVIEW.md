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
gap_closure_review:
  reviewed: 2026-10-31T00:00:00Z
  scope: commits d2caf49 (23-05), 87947d5 + a660379 (23-06)
  files_reviewed_list:
    - server.js
    - test/notif-email-link.test.mjs
    - src/shell/render.js
    - src/main.js
    - e2e/deep-link.spec.mjs
  findings:
    critical: 0
    warning: 0
    info: 3
    total: 3
  status: clean_with_notes
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

---

# Gap-Closure Review (2026-10-31) — plans 23-05 & 23-06

**Reviewed:** 2026-10-31T00:00:00Z
**Depth:** standard
**Scope:** commits `d2caf49` (23-05: server.js, test/notif-email-link.test.mjs), `87947d5` + `a660379` (23-06: src/shell/render.js, src/main.js, e2e/deep-link.spec.mjs)
**Files Reviewed:** 5
**Status:** clean (no critical or warning findings in the gap-closure changes; 3 info notes below)

## Summary

Reviewed the two gap-closure plans on top of the phase-wide review of 2026-10-30.

**23-05 (`server.js` `queueNotifEmails`, G-23-1):** The new workspace-scoped authority map (memberships ⋈ users, `server.js:709-713`) is parameterized (`where m.workspace_id = ?`), keyed by `member_id`, and correctly takes precedence for account-backed members while doc-only members still fall through `emailByUserId` → `emailByMemberEmail`. Byline resolution (`server.js:723`) preserves the co-member-visibility guarantee (T-23-06): names come only from rows scoped to `wsRow.id`. The `n.by === n.to` self-notify guard and the pref gates are unchanged and still run before any lookup. URL construction untouched (pinned by notifUrlBuilder tests). The test change (`test/notif-email-link.test.mjs:92,113`) correctly threads `wsRow` into the extracted `new Function` and still asserts the workspace-scoping clause.

**23-06 (team deep link, G-23-4):** `urlForView`'s team branch (`src/shell/render.js:124-126`) sits before the ROUTE_IDS catch-all, eliminating the lossy `/team` write; the no-id path addresses `/w/slug/teams`, which re-enters `applyDeepLink` through `ROUTE_IDS` (includes `'teams'`, `render.js:34`) → `go('teams')` → `pageTeams` (`src/shell/layout.js:60`) — a closed, consistent loop. `applyDeepLink`'s team branches (`src/main.js:181-182, 187`) mirror the established member branch: found id → `go('team', {id})` through `go()`'s single URL write; unknown id → silent home (no oracle, T-23-07, verified against `pageTeam`'s own `page404` path which is now unreachable via URL resolution); bare `/team` → teams list ahead of the catch-all. `pageTeam` (`src/pages/members.js:114-117`) reads `S.ui.params.id` via the `team()` helper; navigation between two team ids re-renders (`go()`'s `same` compares route + JSON params). Server-side SPA fallback (`server.js:2676-2689`) serves `index.html` for extensionless `/w/:slug/team/:id`, so direct load and F5 resolve. E2E fixtures prune stale `dl-` prefixed tasks/teams before appending, making `beforeAll` idempotent on a persistent server; `newRunId()` (`e2e/helpers/setup.mjs:37-39`) is URL-safe base36, so the raw `TEAM_ID` in URL and `RegExp` assertions is safe.

No security issues found: no new injection surface (all queries parameterized, all URL params `encodeURIComponent`'d), no new listener beyond the existing single popstate handler, unknown-id handling leaks no existence signal.

**Verified clean checks:** authority query parameterized and workspace-scoped; self-notify and pref gates precede email build; team/member id matching consistent with each other; `ROUTE_IDS`/`layout.js`/`pageTeam`/`pageTeams` route chain coherent; e2e fixture pruning correct (`t.key !== TASK_KEY`, `!String(t.id).startsWith('tm_dl_')`).

## Info (new findings in gap-closure code)

### IN-G1: Bare `/w/:slug/team` silently rewrites the address bar to `/w/:slug/teams` on boot

**File:** `src/main.js:187` (+ `src/shell/render.js:125`)
**Issue:** Boot resolution runs `applyDeepLink(deepLink, { replace: true })` (`src/main.js:327`), so a legacy bookmark to `/team` is `replaceState`'d to `/teams` — the user's bookmarked address changes in the bar without any indication. Intentional per the plan ("no-id write lands on the list"), and harmless, but a visible URL mutation worth being aware of.
**Fix:** None required; if the rewrite is unwanted, address the list view via hash or keep the bare path with `opt.replace` skipped for this branch.

### IN-G2: Id matching is case-sensitive in team/member branches, case-insensitive in project/task branches

**File:** `src/main.js:132` vs `src/main.js:175,181`
**Issue:** The `find` helper lowercases both sides for project keys and task keys, while the member and team branches compare `m.id === key` / `t.id === key` exactly. Internally generated ids make this moot today, but the two conventions coexist in one function; a future externally-supplied id with mixed case would resolve in one branch and not the other.
**Fix:** If ids can ever be user-visible-typed, normalize both branches through a case-insensitive comparison (or document why ids are exact-match).

### IN-G3: Authority map is built on every `queueNotifEmails` call, even when no email can be sent

**File:** `server.js:709-713`
**Issue:** The memberships ⋈ users query runs before the notification loop, including when `newNotifs` is empty or every email pref is `false`. A wasted query per doc write in the common case. Correctness is unaffected; performance findings are out of v1 scope, noted here only as a cheap future guard (`if (!newNotifs.length) return;` or build lazily on first use).
**Fix:** Early-return when `newNotifs` is empty, or construct the map lazily inside the loop on first need.

## Prior findings — still open, unchanged in code

Re-verified against current file state; the gap-closure commits did not touch any of these:

- **HIGH-01** — `src/shell/render.js:88-93`: `go()` pushes duplicate history entries for same-URL navigations; the "same-URL guard" relied on by the `A.openTask` comment does not exist (only skips fx flags). Fix proposed in prior review stands.
- **MED-01** — `src/main.js:292`: logged-out `?next=` carry uses `location.pathname` only; query strings are lost across the login round-trip. Fix: `encodeURIComponent(location.pathname + location.search)`.
- **MED-02** — `src/main.js:128, 146, 181`: deep-link segments are not percent-decoded before lookup. Now also applies to team ids (`main.js:181`), though internally generated ids are URL-safe so it cannot trigger today. Fix: one round of `decodeURIComponent` (guarded) on `key`.
- **LOW-01** — `src/shell/render.js:109-113`: local `t` shadows the i18n `t` import; `// eslint-disable-line no-unused-vars` is stale (function is exported and used).
- **LOW-02** — `src/locales/en.json:256`: `"err.taskNotFound"` one-space indent vs sibling two-space keys.
- **LOW-03** — `e2e/helpers/setup.mjs:98-110`: `withAcmeDoc` retry loop exhaust-silently edge case + `attempts` magic number (test-infra only).

---

_Reviewed: 2026-10-31_
_Reviewer: gsd-code-reviewer (subagent)_
_Depth: standard_
