---
phase: 48-real-browser-push-toasts-from-backlog-999-2
reviewed: 2026-11-07T14:35:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - public/sw.js
  - src/core/push.js
  - src/main.js
  - src/pages/settings.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/browser-push.test.mjs
  - test/i18n-core-features.test.mjs
  - test/unsubscribe-route.test.mjs
findings:
  critical: 1
  warning: 1
  info: 3
  total: 5
status: issues_found
---

# Phase 48: Code Review Report

**Reviewed:** 2026-11-07T14:35:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the phase 48 push/toast slice at standard depth: the minimal service worker (`public/sw.js`), the new `src/core/push.js` dispatch core, the `main.js` poll/registration hooks, the settings badge swap, the `npToggle` permission pre-step, the four push-related i18n keys in both locales, and the three touched test files.

The implementation is largely faithful to the plans: sw.js holds zero strings and no network/lifecycle handlers (T-48-02 holds), the npToggle persistence body is untouched below the pre-step (D-07 style), the badge is derived per render, i18n keys are in EN+FR parity (`toast.pushMention/pushAssign/pushComment/pushBrowserBlocked` at en.json:225-228 / fr.json:226-229, `settings.notif.pushBrowserBlocked` at both :1258) with `pushComingSoon` fully removed, and the mark-seen-before-dispatch ordering plus synchronous candidate prelude close the intra-turn double-dispatch race.

Two substantive defects were proven: the sw.js click-URL guard does not actually enforce same-origin (the T-48-03 mitigation is ineffective as written), and the session prime does not re-prime on an SPA workspace switch, so Pitfall 3's notification storm resurfaces on that path.

## Critical Issues

### CR-01: sw.js click-URL resolution does not enforce same-origin — the T-48-03 mitigation is ineffective as claimed

**File:** `public/sw.js:11`
**Issue:** The plan's threat register (T-48-03) claims the click URL is "same-origin only" structurally, and the code comment repeats the claim (`same-origin only, never openWindow(rawString)`). But `new URL(e.notification.data?.url || '/', self.location.origin)` does NOT constrain the result to the worker's origin: a URL string with an absolute form overrides the base entirely — `new URL('https://evil.example/phish', 'https://app.example')` resolves to `https://evil.example/phish`, and that is exactly what `openWindow(url)` then opens. The check only sanitizes relative paths. No current producer feeds an absolute URL (`src/core/push.js:123` only ever builds relative `/w/...` paths), so there is no live exploit path today — but the mitigation the threat model relies on is not present, and any future code path (or template/variation) that puts a user-influenced absolute string into `notification.data.url` turns the notification click into an open-redirect/navigated-phishing vector launched from a trusted-origin surface.

**Fix:** Enforce origin equality explicitly and fall back to the workspace root otherwise:

```js
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let url = '/';
  try {
    const u = new URL(e.notification.data?.url || '/', self.location.origin);
    if (u.origin === self.location.origin) url = u.href;
  } catch { /* malformed data.url → workspace root */ }
  // ...focus/navigate with url as before
});
```

## Warnings

### WR-01: Session prime never re-primes after an SPA workspace switch — unread backlog of the target workspace fires a toast/notification storm

**File:** `src/core/push.js:22,99-104`
**Issue:** `_primed` is a module-level session flag, but the seen-set is keyed per user+workspace (`seenKey`, line 45) and `notifyNewEvents()` only primes on the FIRST call of the whole session. Workspace switching is a pure SPA transition (`A.switchWs` → `openWorkspace` → `hydrateFromServer` at `src/actions/actions.js:2591-2607,3361-3374`; no reload, `_primed` survives), and the poll calls `notifyNewEvents()` after every successful hydration (`src/main.js:98`). On the next poll tick after switching to a workspace whose hydrated document contains unread `mention`/`assign`/`comment` rows, none of their ids exist under the NEW seen key, so `deriveCandidates` returns the entire unread backlog and every row toasts/notifies at once — the exact login-storm scenario Pitfall 3 was written to prevent, resurfacing on workspace switch. If the tab is hidden, this is also an OS-notification burst, not just toasts.

**Fix:** Track the last primed context instead of a single boolean, and re-prime when it changes:

```js
let _primedFor = null; // seenKey(wsId, userId) the prime covered
// in notifyNewEvents(), after resolving wsId/userId:
const key = seenKey(wsId, userId);
if (_primedFor !== key) {
  _primedFor = key;
  markSeen(wsId, userId, myNotifs().filter(n => !n.read).map(n => n.id));
  return;
}
```

## Info

### IN-01: `Notification` constructor fallback drops tag, icon, and data.url — the fallback notification's click is inert

**File:** `src/core/push.js:124`
**Issue:** When no SW registration is active yet, `new Notification(line, { body: line })` omits `tag`, `icon`, and `data.url`. A page-constructed notification has no `notificationclick` routing, so clicking it does nothing at all (and it carries no icon). The plan pinned this MDN fallback shape, so behavior matches intent — noted only because the deep link silently exists in every other path. The `tag` omission also means two rapid fallback notifications stack instead of collapsing.

**Fix:** Acceptable as pinned; if revisited, pass `{ tag: \`gr8r-\${n.id}\`, icon: '/favicon.svg' }` to the constructor as well (click routing is still impossible without a SW, but dedupe/icon come free).

### IN-02: Seen-set truncation (`slice(-200)`) can evict genuinely-unseen ids and re-notify them

**File:** `src/core/push.js:59`
**Issue:** `markSeen` persists only the last 200 ids. If a workspace accrues >200 unseen candidate rows between reads (vacation backlog with push prefs enabled), the oldest ids fall out of the seen-set; those rows remain unread, so on the next poll they re-qualify as candidates and re-notify. The email channel is the documented backstop and the poll interval rate-limits the blast, so this is an edge case, but the truncation is applied to the candidate-list accumulation where `seen` is the input (`[...seen, ...candidates]`, line 109) — the eviction is silent.

**Fix:** Truncate only on write when the input exceeds the cap, or filter out rows already evicted by tracking a high-water mark; alternatively document the 200-row re-notify window in the header comment.

### IN-03: Fire-and-forget `notifyNewEvents()` without a `.catch` at the poll dispatch site

**File:** `src/main.js:98`
**Issue:** `notifyNewEvents()` is async and its promise is discarded. Internal awaits are individually guarded (`getRegistration`/`showNotification` inside the try at `push.js:121-127`, storage in try/catch), and `t()` never throws (returns the key on miss, `src/core/i18n.js:205`), so no live rejection path was found — but the call site has no rejection safety net if a future edit adds a throwing await outside the guarded blocks.

**Fix:** `void notifyNewEvents().catch(() => {});` — matches the silent-degradation posture of the SW registration one-liner at `src/main.js:108`.

---

_Reviewed: 2026-11-07T14:35:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
