---
phase: 59-browser-push
reviewed: 2026-11-13T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - server.js
  - db-adapter.mjs
  - src/core/push.js
  - src/pages/settings.js
  - src/actions/actions.js
  - src/main.js
  - public/sw.js
  - Dockerfile
  - package.json
findings:
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Phase 59: Code Review Report

**Reviewed:** 2026-11-13
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 59 browser-push implementation end to end: VAPID custody ladder, push subscription routes, `sendPushFor` fan-out + 404/410 sweep, the SW push handler, the client push helpers, Settings Push tab wiring, and packaging. The guard ladders (requireUser → sameOrigin → workspace/member 404), mass-assignment discipline on user_id, byte-capped label, payload budget, and the dual-backend schema mirror are all correctly implemented. Two authorization/flow blockers were found: the POST route's endpoint-UNIQUE replace lets one user hijack another user's subscription row, and the post-`api.init()` SW registration never re-fires after a SPA (no-reload) login, dead-locking `enablePush`. Both are paths the green test suite cannot catch because they require a cross-user attacker or a fresh SPA login session.

## Critical Issues

### CR-01: POST /api/me/push-subscriptions lets any member hijack another user's subscription row (endpoint-UNIQUE replace is not owner-scoped)

**File:** `server.js:4609-4614`
**Issue:** The table has a **global** `endpoint` UNIQUE constraint (server.js:401, mirrored in `db-adapter.mjs:284`, pg conflict target `'(endpoint)'` at `db-adapter.mjs:47`). The POST route reads `existing` with `select created_at from push_subscriptions where endpoint = ?` — **not scoped to the session user or workspace** — then `insert or replace` reassigns the row to `(ws.id, user.id)` from the session. Consequences:

1. **Cross-user hijack:** an authenticated user who learns another user's endpoint URL (endpoints are bearer-secret-ish but transit browser devtools, proxies, and any future surface that shows them) can overwrite the victim's row: the row is reparented to the attacker's `(workspace_id, user_id)` and the victim's `p256dh`/`auth` are replaced. The victim is silently unsubscribed (their fan-out query at server.js:1846 is `(workspace_id, user_id)` scoped), and the attacker can fire `POST .../test` pushes into the victim's browser. This contradicts the route's own threat claim at server.js:4627 ("endpoint alone can never address another user's row") — true for DELETE, false for POST.
2. **Cross-workspace self-clobber:** a user enabling push in workspace B silently deletes their workspace A row (same endpoint), with no feedback in workspace A's device list.

**Fix:** Scope the replace to the caller's own row and reject takeovers:

```js
const existing = await db.get(
  'select workspace_id, user_id, created_at from push_subscriptions where endpoint = ?', [endpoint]);
if (existing && (existing.user_id !== user.id || existing.workspace_id !== ws.id)) {
  return fail(res, 409, 'endpointConflict', 'Endpoint registered elsewhere');
}
const createdAt = existing?.created_at ?? t;
await db.run(
  'insert into push_subscriptions (workspace_id, user_id, endpoint, p256dh, auth, label, created_at, last_seen_at) values (?,?,?,?,?,?,?,?) ' +
  'on conflict(endpoint) do update set p256dh=excluded.p256dh, auth=excluded.auth, label=excluded.label, last_seen_at=excluded.last_seen_at',
  [ws.id, user.id, endpoint, keys.p256dh, keys.auth, label, createdAt, t]);
```

(For SQLite, use `insert or replace` only after the ownership check above — the check makes the replace owner-safe.)

### CR-02: SW registration never re-fires after a SPA login — `enablePush` dead-locks on `serviceWorker.ready` and latches `_enabling = true`

**File:** `src/main.js:108-112`, `src/core/push.js:194-226`
**Issue:** The 59-UAT fix calls `registerSw()` once after `api.init()` (main.js:298) and on the `load` event. For a **signed-out** visitor both calls see `api.enabled === false`. Password login without `?next=` is pure SPA (`finishLogin` → `hydrateFromServer` → `enterApp`, actions.js:3881-3886 — no reload), so `registerSw` never runs again for the whole session. Then:

1. `navigator.serviceWorker.ready` (push.js:185, 210, 233) **never resolves** without an existing registration.
2. `enablePush` hangs at push.js:210 with no toast; its `finally` never runs, so **`_enabling` stays `true` forever** — every later click returns `{ ok: false, code: 'busy' }` → generic "pushSubscribeFailed" toast. The feature is permanently dead until the user manually reloads, with zero feedback.
3. `readPushState` (push.js:185) also hangs, so `refreshPushState` never renders — the device list and toggle stay stale/empty.

**Fix:** Re-invoke registration when auth state becomes live — e.g. call `registerSw()` (exported from main.js or moved to a shared module) at the end of `finishLogin`/`enterApp`, or drop the `api.enabled` gate inside `registerSw` and instead register on the first successful `api.init()`/login transition:

```js
// in finishLogin, after hydrateViews():
navigator.serviceWorker?.getRegistration().then(r => { if (!r) registerSw(); });
```

Also add a timeout/reject path around `serviceWorker.ready` in `enablePush` so a hung registration can never latch `_enabling`.

## Warnings

### WR-01: VAPID key file permissions enforced only at creation

**File:** `server.js:1735`
**Issue:** `fs.writeFileSync(keyFile, ..., { mode: 0o600 })` applies the mode only when the file is **created**. If the file pre-exists with looser permissions (restored from a backup, copied by tooling, created under a permissive umask before this change), the private key remains world/group-readable and is never tightened on load.
**Fix:** `fs.chmodSync(keyFile, 0o600)` after the load-from-file branch (or after every write).

### WR-02: Half-specified VAPID env override silently ignored

**File:** `server.js:1709-1713`
**Issue:** If only one of `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` is set, the env pair is silently discarded and the boot ladder falls through to file/generate-once. An operator who believes the env pins identity gets silently rotating file keys; losing `DATA_DIR` then orphans every subscription with no diagnostic pointing at the half-set env.
**Fix:** If exactly one of the two is set, `logWarn` loudly and (safer) treat push as disabled — a mismatched half-config is a deployment error, not a fallback condition.

### WR-03: Hardcoded French fallback `'Un membre'` in push title for all recipient locales

**File:** `server.js:1828`
**Issue:** `authority.get(n.by)?.name || profiles.get(n.by)?.name || 'Un membre'` injects a French literal into the `tFor(recipientLocale, ...)` template even when the recipient's locale is `en` — an EN recipient sees "Un membre mentioned you". (The email path deliberately fixed this class of bug — see D-27-4 comment at server.js:1878-1881.)
**Fix:** Use a locale-keyed fallback: `tFor(recipientLocale, 'notif.push.unnamedSender')` with EN/FR entries, mirroring the email path's discipline.

### WR-04: All SW-displayed pushes share the fixed tag `'gr8r-push'` — consecutive notifications collapse to the last one

**File:** `public/sw.js:43`
**Issue:** The server payload never sets `tag`, so every background push displays under `tag: 'gr8r-push'`; with the tab closed, a burst of mentions (D-14 sends one push per notif per device) leaves only the **last** OS notification visible — the earlier ones are silently replaced. The foreground path uses unique tags (`gr8r-${n.id}`, push.js:133), so behavior is inconsistent between channels.
**Fix:** Either have the server include `tag: n.id` in the payload (payload budget headroom exists) or derive `tag` in the SW from `p.url`-scoped uniqueness — at minimum, document the collapse as accepted D-14 behavior.

### WR-05: Disable/unsubscribe failures always report success

**File:** `src/core/push.js:230-253`, `src/actions/actions.js:2559-2575`
**Issue:** `disablePush` unconditionally returns `{ ok: true }` even when the `DELETE` call fails, and `A.pushDisable` / `A.pushUnsub` toast `toast.pushDisabled` without inspecting the call result. A network/server failure tells the user push is off while the row survives and keeps receiving pushes (until the 404/410 sweep, which only fires on authoritative dead endpoints). Inconsistent with the enable path, which got an explicit silent-failure fix (commit 26a7644).
**Fix:** Return the call result from `disablePush`/`unsubscribeDevice` and branch the toast on `r.ok` in the two actions, mirroring `pushEnableConfirm`'s error handling.

### WR-06: `sendPushFor` is awaited inside the doc-PUT response path with no send timeout — contradicts the stated "never block the response" contract

**File:** `server.js:5867` (and the twin claim at server.js:1876, T-59-09)
**Issue:** `if (PUSH.enabled && newNotifs.length) await sendPushFor(...)` runs before the doc-PUT response is flushed. The comment promises fire-and-forget ("sends are post-commit... never block the response"), but the await serializes up to N `webpush.sendNotification` calls into the response latency; `web-push` sets no default request timeout, so a hung push-service connection delays (or stalls, until the server's own request timeout) every doc PUT that generates a notification. The reminder site (server.js:2121) has the same shape inside the sweep loop.
**Fix:** Honor the documented contract: `sendPushFor(...).catch(err => logWarn(...))` without `await` at both fan-out sites (the transaction has already committed; per-send errors are already caught inside), or configure a per-request timeout on the web-push calls.

## Info

### IN-01: Redundant membership re-check in the test-send route

**File:** `server.js:4650-4651`
**Issue:** `pushSubscriptionWorkspace` (via the shared guard ladder) has already verified `memberships` for `(ws.id, user.id)`; the immediate re-query duplicates it.
**Fix:** Drop the redundant query, or reuse its `member_id` fetch as the only check.

### IN-02: Hijack path also leaks `created_at` (subsumed by CR-01)

**File:** `server.js:4609-4610`
**Issue:** The unscoped `existing` lookup returns the original row regardless of owner, so a successful CR-01 hijack silently imports the victim's `created_at` into the attacker's row. Fixed by the CR-01 owner-scoped rewrite; tracked separately only so the fixer does not treat `created_at` preservation as optional.

### IN-03: Stray double blank lines

**File:** `server.js:1868-1869`, `src/actions/actions.js:2577-2578`
**Issue:** Double blank lines left between sections (lint passes, but inconsistent with the file's spacing discipline).
**Fix:** Collapse to a single blank line.

---

_Reviewed: 2026-11-13_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
