---
phase: 63-view-02-de-flake
reviewed: 2026-11-14T12:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - e2e/saved-views.spec.mjs
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 63: Code Review Report

**Reviewed:** 2026-11-14T12:00:00Z
**Depth:** standard
**Files Reviewed:** 1 (`e2e/saved-views.spec.mjs`, commits e6da5d4, b40c3e5, 1ee1e99)
**Status:** issues_found (no critical issues)

## Summary

Phase 63 rewrote the flaky VIEW-02 spec: semantic Escape dismissal, `.last()`-scoped toast assertions, and arm-before-act `waitForResponse` signals for the live-PUT, apply-PUT, and delete-flow GETs/DELETE. Every structural claim in the spec's comments was verified against the app source and holds:

- Toast lifetime/order: `src/ui/toast.js:20` (`host.appendChild(el)`) and `:27` (`setTimeout(kill, opt.ms || 4200)`) — `.last()` selects the newest toast and the 4.2 s race window is real. ✓
- Live-PUT discriminator: `src/core/viewSync.js:12-13` — `putViews` body has no `name`, `putViewsNamed` body does; both PUT to `/api/me/views` with no query string, so `endsWith('/api/me/views')` + `!body.name` correctly isolates the live row. ✓
- Fixed GET counts: `src/core/savedViews.js:81` — `NAMED_VIEW_KEYS = ['tasks', 'mytasks']`, and `refreshNamedViews` (`src/core/viewSync.js:93-96`) issues one GET per key, sequentially → exactly 2 GETs on popover open and exactly 2 GETs after a successful DELETE (called from `deleteViewRow`, `src/core/viewSync.js:150`). The `Promise.all` waits of 2 match. ✓
- Delete-ordering guarantee: `deleteTableView` (`src/views/savedViewsUi.js:134-143`) awaits the DELETE, then `deleteViewRow` awaits `refreshNamedViews` (the 2 post-delete GETs), and only then rebuilds `S.ui.pop.html` — so awaiting DELETE + 2 GETs before asserting the empty state genuinely guarantees the post-delete rebuild is the last writer. ✓
- Escape dismissal: `src/actions/keyboard.js:163-166` — `e.key === 'Escape'` with `S.ui.pop` set calls `closePop()`. ✓
- Arm-before-act (D-08) is respected at all four armed sites (lines 68/72, 131/135, 173/177, 179-186/184). ✓

No critical defects found. The 10× serial and 112/112 parallel gate results are consistent with the verified mechanics. Two robustness warnings and three info items below.

## Warnings

### WR-01: Delete-flow GET counts are hardcoded to 2, coupled to `NAMED_VIEW_KEYS`

**File:** `e2e/saved-views.spec.mjs:173-176, 180-183`
**Issue:** Both delete-flow waits allocate exactly two identical GET predicates and block on `Promise.all`. This silently hard-codes `NAMED_VIEW_KEYS.length === 2` (`src/core/savedViews.js:81`). Adding a third named-view key (e.g. a future `'projects'` key) makes `refreshNamedViews` issue 3 GETs; one listener never fires and both `Promise.all` waits hang to the 30 s test timeout with an opaque `waitForResponse` timeout — a new flake class introduced by any app-side key addition. The same coupling applies to the open-time waits.
**Fix:** Make the waits count-agnostic — e.g. wait for the popover's end state instead of transport counting:
```js
await page.locator(`.pop.floating [aria-label="${fmt('a11y.deleteTableView', { name: VIEW_NAME })}"]`).click();
await deleted;
/* the post-delete rebuild (savedViewsUi.js:140) is the last writer by
   construction; assert state, not GET count */
await expect(page.locator('.pop.floating').getByText(fmt('popover.noSavedViews'))).toBeVisible();
```
or at minimum cite `NAMED_VIEW_KEYS` in the comment and add a `// updates needed if a key is added` tripwire.

### WR-02: `JSON.parse` inside `waitForResponse` predicates can throw and kill the wait

**File:** `e2e/saved-views.spec.mjs:68-71, 131-134`
**Issue:** `!JSON.parse(r.request().postData() || '{}').name` runs inside the response predicate. If a PUT body is ever non-JSON (error envelope, HTML error page from a proxy during a broken build) the predicate throws, rejecting the `waitForResponse` promise with a confusing SyntaxError instead of a diagnostic timeout. Additionally, a body of `{"name":null}` or `{"name":""}` is misclassified as the live PUT (falsy `name`), which would let the applied-PUT wait bind the wrong request.
**Fix:** Guard the parse and tighten the discriminator:
```js
const isLivePut = r => {
  if (!r.url().endsWith('/api/me/views') || r.request().method() !== 'PUT') return false;
  try { const b = JSON.parse(r.request().postData() || '{}');
        return typeof b.name === 'string' && b.name.length > 0 ? false : b.blob != null; }
  catch { return false; }
};
```

## Info

### IN-01: Inconsistent URL matching between PUT and GET/DELETE predicates

**File:** `e2e/saved-views.spec.mjs:69, 132 vs 174-175, 179, 181-182`
**Issue:** PUT waits use `url().endsWith('/api/me/views')` (correct today: `putViews`/`putViewsNamed` send no query string, `src/core/viewSync.js:12-13`) while GET/DELETE waits use `includes` (correct: they carry `?workspace=...&key=...`). If a future PUT gains a query parameter, both PUT predicates silently stop matching and hang. A shared comment or helper documenting the contract would prevent this.
**Fix:** Consider `r.url().split('?')[0].endsWith('/api/me/views')` uniformly, with a one-line comment.

### IN-02: `signIn` uses hardcoded English labels while everything else reads from `en.json`

**File:** `e2e/saved-views.spec.mjs:31-33`
**Issue:** `'Email'`, `'Password'`, `'Sign in'` are string literals, whereas the file's own header (lines 8-10) mandates "every asserted string read from src/locales/en.json — never hardcoded". Pre-existing lines outside this phase's diff, noted for consistency only.
**Fix:** `fmt('auth.email')`, `fmt('auth.password')`, `fmt('auth.signIn')` (or the actual catalogue keys) in a future touch of this file.

### IN-03: `setColumn`'s live-PUT waiter could bind a stale in-flight live PUT

**File:** `e2e/saved-views.spec.mjs:68-73`
**Issue:** Arming immediately before the click is correct D-08 practice, but the predicate matches *any* nameless PUT — if an unrelated live PUT were still in flight when the waiter arms (e.g. a write-through triggered outside this helper), the await would resolve before the toggle's own debounced PUT. In the current flow every prior live PUT is awaited (previous `setColumn` / applied-PUT), so this cannot fire today; it is a latent coupling only. The comment at lines 127-130 acknowledges the same class of risk for the apply site.
**Fix:** None required now; if it ever bites, correlate on the toggled column being present in the PUT blob.

---

_Reviewed: 2026-11-14T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
