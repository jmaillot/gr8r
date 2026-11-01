---
phase: 27-due-date-reminder-scheduler
reviewed: 2026-11-01T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - server.js
  - test/due-reminders.test.mjs
  - test/i18n-core-features.test.mjs
  - src/pages/settings.js
  - src/pages/inbox.js
  - src/locales/en.json
  - src/locales/fr.json
findings:
  critical: 2
  warning: 2
  info: 3
  total: 7
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

The scheduler core is solid: the dedup ledger is fully parameterized (no SQL injection in key construction), the claim+append transaction is correct, idle ticks are provably pure reads (the `hour !== 9` gate precedes every write), the internal test route 404s when the token is unset, and the `=== false` prefs gates match between scheduler and email fan-out. The two CRITICAL findings are both server↔client contract breaks: reminder notification rows are written with field names the client never reads (`ts` instead of `at`, no `read`), so reminder rows render with a blank timestamp and sort unpredictably; and the inbox preview crashes when a reminder's task no longer exists. The test suite is strong on server behavior but does not cover the client-side rendering of an emitted row, which is exactly where both CRITICALs live.

## Critical Issues

### CR-01: Server reminder rows use `ts`; the client contract is `at` + `read` — blank timestamps, broken sort, permanent unread state

**File:** `server.js:972-980` (also `src/pages/inbox.js:22-23`, `src/pages/inbox.js:81`, `src/core/store.js:291`)

**Issue:** `runReminderPass` emits `{ id, type, to, by: null, task, snippet, ts: at.getTime() }`. Every other notification row in the system is produced client-side by `notifyMembers()` (store.js:291), which uses `at` for the timestamp and `read: false` for read-state. Nothing on the read path (server `normalizeDoc`, client `applyDoc`) maps `ts` → `at`. Consequences in the inbox:
- `ns.sort((a, b) => b.at - a.at)` (inbox.js:23) computes `NaN` for reminder rows → array ordering is undefined; reminders appear in arbitrary positions.
- `ago(n.at)` (inbox.js:81) receives `undefined` → `formatRelativeTime` returns `''` → the timestamp cell renders blank.
- `n.read` is `undefined` → `!n.read` is always true, so unread counts and dots treat reminders as unread forever until `markAllRead` (and re-appear "unread" to any logic distinguishing stored `false`).

**Fix:** emit rows in the client's shape (keep `ts` if the tests depend on it, but `at` is the field the UI reads):

```js
const notif = {
  id: uid(),
  type: offset === 'past_due' ? 'past_due' : 'due_reminder',
  to: t.assignee,
  by: null,
  task: t.id,
  snippet: reminderSnippet(offset, t),
  at: at.getTime(),
  read: false,
  ts: at.getTime(), // retained for the dedup tests asserting on ts
};
```

Also extend a due-reminders test to fetch the workspace doc and assert the emitted row carries `at` (number) and `read === false`, so the contract cannot silently drift again.

### CR-02: Inbox preview crashes (TypeError) when a reminder's task was deleted

**File:** `src/pages/inbox.js:86-90`

**Issue:** For a selected notification with no surviving task, `inboxPreview` takes the `!tk` branch and renders `data-id="${p.id}"` where `p = n.project ? proj(n.project) : tk ? proj(tk.project) : null` — for a reminder row (`project` is undefined, task deleted) `p` is `undefined`/`null` and `p.id` throws during template construction, crashing the whole inbox render. `esc(n.text)` also renders an empty `<b>` because reminder rows carry no `text` field. Legacy notification rows always had `text`, so this path was effectively unreachable before phase 27 added system rows with no `text` and no `project`. Deleting a due-dated task and then clicking its reminder (rows persist in `d.notifs`; they are only filtered by recipient, not by task existence) reproduces it.

**Fix:**

```js
if (!tk)
  return `<div style="padding:24px 28px">…<div class="alert danger">${ic('triangle-alert', 16)}<div><b>${esc(n.text || t('notif.' + n.type, {}, ''))}</b><div class="muted" style="margin-top:2px">${esc(n.snippet || '')}</div></div></div>${
    p ? `<div style="margin-top:14px"><button class="btn btn-secondary" data-a="go" data-r="project" data-id="${esc(p.id)}" data-tab="overview">${t('popover.openProject')}</button></div>` : ''
  }</div>`;
```

(Empty-text fallback or a dedicated `notif.deleted` key; guard the project button on `p`.)

## Warnings

### WR-01: Internal reminder-pass token compared with `===`, not timing-safe

**File:** `server.js:2102`

**Issue:** `req.headers['x-reminder-token'] !== process.env.REMINDER_TEST_TOKEN` is a byte-comparison that can leak the token length/prefix via timing (ASVS L1 §2.5 / T-27 threat model). The 404-when-unset behavior is correct; only the comparison is weak. The route is test-gated today, but the token's presence is what makes the route live, and an operator could leave it set in production.

**Fix:**

```js
const expected = process.env.REMINDER_TEST_TOKEN;
const given = String(req.headers['x-reminder-token'] || '');
const ok =
  !!expected &&
  given.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
if (!ok) return fail(res, 404, 'notFound', 'Not found');
```

### WR-02: Assignee-less tasks with a due date produce `to: null` notification rows and dead ledger claims

**File:** `server.js:927-932` (with `server.js:975`)

**Issue:** `remindable()` requires a valid `due`, a live project, and visibility — but never requires `task.assignee`. For a public project, `canSeeProject(project, null)` returns true, so a due-dated task with no assignee claims a dedup key (`…:<id>:null:<offset>:<due>`) and calls `updateDoc`, bumping the workspace revision for a row that is then stripped from every client view (`normalizeDoc` drops rows whose `to` is not a non-empty string). Every such task leaks one phantom revision bump per offset on its due morning, and the email pass silently skips it. If the task is later assigned, the assignee change produces a new key and fires — so the gating error is invisible, just wrong.

**Fix:** gate on the assignee in the predicate:

```js
function remindable(task, project) {
  if (!task || !task.assignee || !/^\d{4}-\d{2}-\d{2}$/.test(task.due || '')) return false;
  ...
}
```

## Info

### IN-01: Boot catch-up `runReminderPass()` runs without a try/catch

**File:** `server.js:3656`

**Issue:** The comment correctly states a throwing `setInterval` callback kills the process, and the interval is wrapped — but the boot call itself is not. `runReminderPass` catches per-workspace errors, yet a failure before the loop (e.g. the `select * from workspaces` prepare/`all()`) would crash startup. Same failure would also crash the first interval tick, but a boot crash is a guaranteed outage.

**Fix:** wrap it: `try { runReminderPass(); } catch (err) { console.warn(`reminder boot pass: ${err.message}`); }`

### IN-02: Reminder email byline is a hardcoded English literal

**File:** `server.js:848`

**Issue:** `by = ['due_reminder', 'past_due'].includes(n.type) ? 'Reminders' : …` — French-locale users get an English "Reminders" byline in reminder emails. The in-app side correctly routes through `notif.dueReminder`/`notif.pastDue` catalogue keys; the email path cannot (server has no per-recipient locale today), but the hardcoded string deserves at least a comment or a constant noting it is a known D-27-4 limitation.

**Fix:** hoist to a named constant (`const SYSTEM_BYLINE = 'Reminders'`) with a comment, or accept `MAILER` locale config when one exists.

### IN-03: `reminders_sent` ledger grows without bound

**File:** `server.js:215-220`

**Issue:** No pruning: one row per (workspace, task, assignee, offset, due date) forever, plus an index. Rows are tiny, but a long-lived instance with heavy task churn accumulates millions of dead keys that are only ever queried by primary-key `insert or ignore`. The existing hourly sweeps (`sessions`, `login_challenges`) are the natural home for a `delete from reminders_sent where created_at < ?` (e.g. 90 days).

**Fix:** add a dated sweep to the existing hourly maintenance intervals in `main()`.

---

### Verified-clean checklist (adversarial pass)

- Dedup key construction (`${ws.id}:${t.id}:${t.assignee}:${offset}:${due}`) is interpolated only into a bound parameter — no SQL injection (T-27-02) ✓
- Idle-tick revision purity: `hour !== 9` `continue` at `server.js:955` precedes all writes; covered by REM-01 test ✓
- Internal route: 404 when token unset, no enumeration difference between unset and wrong token ✓; missing `sameOrigin` on this POST is acceptable only because the token gates it (see WR-01)
- Email fan-out is strictly post-commit (`server.js:995-1000`) — no SMTP inside the write transaction ✓
- Prefs gates `=== false` are consistent between scheduler (966-970), email fan-out (842), and both are seeded ON in `emptyDoc` (1263-1265) and read-normalized in `normalizeDoc` (506-511) ✓
- `localParts` handles the `hour24` "24:00" quirk via `% 24`; `addDaysIso` is pure string arithmetic, DST-safe ✓
- `by: null` self-skip interaction handled (840 + 848), client guard precedes the generic `!n.by` branch (inbox.js:59-60) ✓
- EN/FR catalogue keys present for all six settings strings and both notif keys; i18n count test updated ✓
- Client XSS: all new interpolations in `settings.js`/`inbox.js` pass through `esc` or fixed catalogue keys ✓

---

_Reviewed: 2026-11-01_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
