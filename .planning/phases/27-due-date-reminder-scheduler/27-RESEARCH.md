# Phase 27: Due-Date Reminder Scheduler - Research

**Researched:** 2026-11-01
**Domain:** In-process reminder scheduling (setInterval), workspace-timezone math (Intl), transactional dedup in SQLite, doc-write/revision semantics
**Confidence:** HIGH (in-repo surfaces verified by reading server.js/src this session; tz mapping is the one assumed design area)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-27-1:** Both reminder offsets fire at **09:00 in the workspace's shared timezone** — day-before and morning-of use the same hour. One consistent send time per day.
- **D-27-2:** Scheduler ticks **every 1 minute** (in-process, `unref()`'d like the existing session-cleanup intervals). Worst-case send delay one minute past 09:00; idle ticks run one cheap indexed SQLite query and must not bump the workspace revision (REM-01 / SC-5).
- **D-27-3:** The overdue "past due" nudge fires at the **first 09:00 tick after the due date passes** (morning after), exactly once per task per overdue episode, never repeating while the task stays overdue.
- **D-27-4:** Two new in-app notification types: **`due_reminder`** (covers both offsets, distinguishing copy) and **`past_due`** (the nudge). Distinct from `assign`/`mention`.
- **D-27-5:** Three toggles in Settings → notifications, all ON by default: **`email_reminder`** + **`due_reminder`** + **`past_due`**. Same prefs surface and toggle pattern as existing notifPrefs toggles.

### the agent's Discretion
- Exact reminder email copy/wording (reuse the P4-f email structure and i18n catalogue approach; EN+FR).
- Internal dedup-table schema and boot catch-up mechanics — any design satisfying REM-03's transactional-exactly-once contract.
- How reminder generation integrates with the existing doc-write/notification pipeline (constraint is REM-01's no-idle-revision rule, not the mechanism).

### Deferred Ideas (OUT OF SCOPE)
- Per-user timezone for reminders (workspace-shared tz only).
- Recurring tasks / recurring due dates.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REM-01 | In-process scheduled pass, restart-safe boot catch-up, no revision write on idle ticks | Tick pattern (server.js:3443), boot pass precedent (bootstrap() server.js:1166), "window-open + not-deduped" catch-up predicate, read-only idle tick |
| REM-02 | Day-before + morning-of, pref-selectable, ON by default, workspace tz | P.tz label → IANA zone map (settings.js:266 labels), Intl.DateTimeFormat timeZone math (verified on Node 24), notifPrefs defaults (server.js:1087) |
| REM-03 | Exactly once per (task, assignee, offset, due date), transactional dedup write before notification, due-date change re-arms via key | New `reminders_sent` table + INSERT OR IGNORE inside transaction() together with the doc write |
| REM-04 | Completed/archived never reminded; exactly one past-due nudge, deduped | Task gating predicates (t.status==='done', t.archived, project.archived — store.js:262,269; utils.js:270) |
| REM-05 | `email_reminder` gate on reminder emails, deep link to task | queueNotifEmails / NOTIF_EMAIL_KIND (server.js:787-837), APP_URL deep link (server.js:828-829), APP_URL boot guard (server.js:3448-3456) |
</phase_requirements>

## Summary

Everything this phase needs already exists as reusable machinery. The email path (`queueNotifEmails`, `NOTIF_EMAIL_KIND`, `MAILER.sendNotif`) is a drop-in reuse: add two entries to the kind map and reminder emails ride the exact same prefs-gated, fire-and-forget, deep-linked pipeline. The transactional dedup fits inside the existing `transaction()` helper (server.js:1057), which is explicitly documented as "read-modify-write the workspace document inside the caller's transaction" — the dedup-key INSERT and the doc-notif append can be made atomic in one `begin immediate` block, and the email fan-out happens after commit exactly like the PUT path at server.js:2609.

Two genuinely new pieces: (1) a **timezone mapping** — `P.tz` is a display-label string (`'(GMT-08:00) Pacific Time'`) chosen from five fixed options, and the server has *never* consumed it, so a small label→IANA-zone table plus `Intl.DateTimeFormat` zone math is needed (Node ≥24 has full ICU — verified this session); (2) a **scheduler pass** with a `reminders_sent` dedup table, following the established `setInterval(...).unref()` pattern.

**Primary recommendation:** One scheduler function run both at boot and every 60s (unref'd, try/catch-isolated); it computes "which reminders have a window open (window-open, not equality) and no dedup key", and for each hit runs one `transaction()` that does INSERT OR IGNORE into `reminders_sent` and, only if the insert landed, appends the notif row via the doc write; emails queued after commit through the existing path.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reminder clock/window computation | API/Backend (server.js) | — | Server owns scheduling; client never knows |
| Workspace tz interpretation (P.tz → IANA) | API/Backend | — | P.tz lives on the workspace doc; server needs it first |
| Dedup ledger | Database/Storage (SQLite table) | — | Must survive restarts, so not in the JSON doc |
| Notification row delivery | API/Backend doc write | Client (30s poll / inbox render) | Rows appended to `doc.data.notifs`; client renders by `n.type` |
| Reminder emails | API/Backend (queueNotifEmails) | SMTP (MAILER) | Existing path, gated by `email_reminder` |
| Settings toggles | Client (settings.js) | API/Backend (defaults in doc bootstrap) | Existing srow/tog pattern |
| Inbox display of new types | Client (inbox.js + i18n) | — | `t('notif.${n.type}')` rendering + filter list |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:sqlite (existing `db`) | — | Dedup table + transactional writes | Project is already SQLite-native; no new deps allowed |
| `Intl.DateTimeFormat` (node built-in) | Node ≥24 full ICU [VERIFIED: ran `Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'})` on this machine, Node v24.21.0 → '2026-11-01'] | Compute workspace-local date and hour; DST-correct | Zero deps, handles DST, guaranteed available (engines node>=24) |
| `setInterval(...).unref()` | — | 1-minute tick | Established pattern (server.js:3443) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `transaction()` helper (server.js:1057) | existing | Atomic dedup-write + doc-write | Every reminder emission |
| `queueNotifEmails` / `MAILER.sendNotif` (server.js:787-837) | existing | Reminder emails | After commit, never blocking |
| `node:test` harness (test/helpers) | existing | Reminder tests with injectable clock | Wave 0 |

**Installation:** none — no new npm dependencies (project constraint; `node:sqlite` + builtins only).

## Package Legitimacy Audit

**No external packages are installed in this phase** — the no-new-dependencies constraint plus node builtins cover everything (Intl for tz math is a language builtin). Audit table omitted; nothing to verify.

## Architecture Patterns

### System Architecture Diagram

```
 boot ──────────────► runReminderPass() ───────────┐
 setInterval(60s).unref() ─► tick ─► try/catch ────┤   (every workspace)
                                                   ▼
                          for each workspace:
                            localDate = localNow(P.tz)   ← Intl + label→IANA map
                            for each task (due set, not done/archived, not project-archived):
                              windowOpen(task.due, localDate)?   ── no ─► next
                                     │ yes
                                     ▼
              transaction():  INSERT OR IGNORE reminders_sent(dedup_key)
                                     │ inserted?                     ignored → done
                                     ▼
                              append notif row(s) to doc.data.notifs via doc write
                              (revision bumps ONLY here — rows exist)
                                     ▼
              after commit: queueNotifEmails-style fan-out
                            gate: prefs.email_reminder, deep link APP_URL/w/:slug/task/:key
                                     ▼
              clients pick rows up on next 30s poll; idle ticks wrote nothing
```

### Recommended Project Structure
```
server.js          # reminders_sent table in SCHEMA; tick + runReminderPass near session-cleanup interval; boot call inside bootstrap() or main()
src/pages/settings.js      # 3 new srow/tog rows in notif sections
src/pages/inbox.js         # filter list + rendering for new types
src/core/i18n.js           # notif.due_reminder / notif.past_due + settings labels, EN+FR
test/due-reminders.test.mjs# new — clock-injectable pass tests
```

### Pattern 1: Atomic "claim then emit" (dedup + doc write in one transaction)
**What:** The dedup key INSERT and the notification-row append commit together or not at all.
**When to use:** Every emission. `updateDoc()` (server.js:1039-1047) is documented as read-modify-write *inside the caller's transaction*, so:
```js
// Source: server.js:1057 transaction() + server.js:1039 updateDoc() contract
const emitted = transaction(() => {
  const res = db.prepare('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)')
    .run(key, ws.id, now());
  if (res.changes === 0) return false;      // already sent — exactly-once
  updateDoc(ws.id, doc => { doc.data.notifs.push(makeReminderNotif(...)); });
  return true;
});
if (emitted && MAILER.enabled) queueReminderEmail(ws, notifs); // after commit, fire-and-forget
```
Crash before commit → key AND row both absent → next tick re-sends (no loss). Crash after commit → both persisted → never re-sent (no duplicate). Note the tradeoff: a crash *between* commit and email delivery loses the email but keeps the in-app row — at-most-once email is consistent with the existing email path's fire-and-forget contract (P4-f failures are logged, never surfaced).

### Pattern 2: Window-open predicate (catch-up for free)
**What:** Fire a reminder when its window *has opened* and the key is absent — not on exact-time equality.
**When to use:** Window logic. With `localDate` = workspace-local date today:
- `day_before`: fire when `localDate >= dueDate − 1 day`
- `morning_of`: fire when `localDate >= dueDate`
- `past_due`: fire when `localDate > dueDate`

Dedup keys carry the due date, so exactly-once holds regardless of how many ticks occur during the open window, and a server that was down at 09:00 fires the missed windows once at boot (REM-01's catch-up requires no separate replay mechanism). Firing "some hours late after downtime" is the accepted semantics of "runs missed windows once".
**Hour gating:** gate on `localHour === 9` (Intl hour component) rather than `minute === 0` — with a 1-minute cadence the whole 09:00 hour qualifies, dedup keeps it to one send, and this tolerates skipped/late ticks. Outside the send hour the tick is a pure read (cheap indexed query, no writes — REM-01/SC-5).

### Pattern 3: Fire-and-forget email after commit
**What:** `queueNotifEmails(row, next, newNotifs)` diffs new notif ids against the stored doc and emails each recipient once, gated by `NOTIF_EMAIL_KIND[n.type]` and `prefs[prefKey] === false` (server.js:787-837). Deep link: `${APP_URL}/w/${wsRow.slug}/task/${encodeURIComponent(task.key)}` with workspace-root fallback if the task vanished (server.js:828-829). APP_URL is boot-guarded when SMTP is on (server.js:3448-3456).
**Reminder integration notes (planner decision, both viable):**
- Extend `NOTIF_EMAIL_KIND` with `due_reminder: 'email_reminder'` and `past_due: 'email_reminder'` — prefs gating comes free. **Caution:** queueNotifEmails skips `n.by === n.to` (server.js:814) — reminder rows must use `by: null`/`undefined` (system actor), which passes the skip; but the email's `by` name falls back to 'Un membre', so either pass a custom builder or set a system label. It also expects `nextDoc` + `newNotifs` shaped like the PUT path — the scheduler has exactly that after its doc write.
- Or a thin `queueReminderEmails()` sibling reusing `MAILER.sendNotif` + the same URL builder. Cleaner copy control, slightly duplicated logic.

### Pattern 4: Idle tick is a pure read
**What:** A tick with nothing to send must not touch `workspaces.doc`/`revision`.
**Why:** Clients hold a revision; every doc write bumps `revision = revision + 1` (server.js:1045, 2605), and a stale-revision PUT is rejected 409 `workspaceChanged` (server.js:2582-2585). Read-only ticks therefore cannot cause 409 storms. When reminders *do* fire, the revision bump is correct and required — polling clients pick the rows up.

### Pattern 5: Settings toggles + prefs defaults
**What:** notifPrefs defaults are seeded server-side in the doc bootstrap (server.js:1087-1097 — `email_mention/email_assign/email_digest/email_comment/push_* ...`); settings.js renders toggles via `srow(t('settings.notif.X'), t('settings.notif.XDesc'), tog('key', np.key, 'np'))` (settings.js:370-372). The three new toggles follow exactly; add defaults `email_reminder: true, due_reminder: true, past_due: true` to the same defaults object so **existing** workspaces that already stored notifPrefs also need a normalize-on-read (check how `np.email_comment === false` default interacts — toggles read `np.key`, `undefined` is truthy in the tog check, so add the keys in `normalizeDoc`/default merge so old docs behave as ON).
**Inbox:** filter chips come from a literal list (inbox.js:13-15) and text via `t('notif.' + n.type)` (inbox.js:55) — add entries + `notif.due_reminder` / `notif.past_due` catalogue keys (EN+FR).

### Anti-Patterns to Avoid
- **Equality-based firing (`minute === 0`):** a GC pause, deploy, or skipped tick silently misses the day's reminder. Window-open + dedup is robust.
- **Dedup key in the JSON doc:** doc state is client-writable and revision-coupled; a per-key ledger must live in SQLite to survive restarts and be written before the doc rows without a race.
- **Sending the email inside the transaction:** SMTP hangs would hold the SQLite write lock. Commit first, email after (existing P4-f contract).
- **Reminder rows with `by` set to the recipient** (queueNotifEmails's self-skip would drop them silently).
- **Second setInterval writing per-workspace unconditionally** — the pass must early-exit (cheap SELECT) before any doc parse/write when the hour gate or workspace scan yields nothing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DST-correct local time | Manual GMT-offset arithmetic from the label | `Intl.DateTimeFormat` with IANA zone | Fixed offsets are wrong half the year for Pacific/Eastern/London/Berlin; Intl handles DST and is a builtin [VERIFIED: node v24.21.0 full-ICU run] |
| Exactly-once ledger | In-memory Maps, doc flags, file markers | SQLite `reminders_sent` table, INSERT OR IGNORE | Crash/restart safety is the whole point of REM-03 |
| Transactionality | Manual begin/commit around two statements | `transaction()` helper (server.js:1057) | Established, handles rollback |
| Email delivery | New SMTP path | `MAILER.sendNotif` via the queueNotifEmails pattern | Prefs gating, fire-and-forget, error logging already solved |
| Date formatting in copy | Reimplementing iso()/parse() server-side | Server-side is new: minimal `YYYY-MM-DD` string comparison | Task `due` values are plain `YYYY-MM-DD` strings (client `parse()` in src/core/utils.js:92-95); lexicographic compare on zero-padded ISO dates is already correct — no Date objects needed for the window math, only for "today in tz" |

## Runtime State Inventory

Rename/refactor/migration phase? No — this is a feature-add phase. Inventory is trivially:
| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New `reminders_sent` table (empty at boot; SCHEMA uses `create table if not exists` like all others — server.js:114-210) | None (additive) |
| Live service config | None — no external services involved | None |
| OS-registered state | None | None |
| Secrets/env vars | None new (APP_URL/SMTP already guarded) | None |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: P.tz is a display label, not a timezone
**What goes wrong:** Parsing `'(GMT-08:00)'` from the label and applying a fixed offset produces 09:00 in the wrong season (Pacific is GMT-07:00 in DST).
**Why it happens:** The five settings options (settings.js:266) embed static offsets; nothing in the codebase has ever mapped them (`tz` appears only in settings.js/store.js — no server consumer exists yet [VERIFIED: grep]).
**How to avoid:** A five-entry literal map label→IANA zone: Pacific→`America/Los_Angeles`, Eastern→`America/New_York`, London→`Europe/London`, Berlin→`Europe/Berlin`, Singapore→`Asia/Singapore`. Compute local date/hour via `Intl.DateTimeFormat('en-CA', { timeZone, ... })`. Unknown/empty tz → fall back to UTC (store.js default is a Pacific label; legacy docs may have `tz: ''` — server.js:1575 seeds `tz: ''` in one doc path, so the fallback is mandatory).
**Warning signs:** Test assertions pinning "09:00 local" that fail when run during the other DST phase.

### Pitfall 2: Reminder rows re-notified by the client's own PUT diff
**What goes wrong:** `queueNotifEmails` is only invoked from the PUT path (server.js:2609); scheduler-appended rows are invisible to it, and conversely a later client PUT re-serializes the doc (reminder rows are now in `storedNotifIds`, so no re-email — the diff is safe [VERIFIED: server.js:2596-2599]).
**How to avoid:** The scheduler performs its own post-commit email fan-out; don't try to route scheduler writes through the PUT handler.

### Pitfall 3: Tick failure killing the process
**What goes wrong:** An uncaught exception inside a `setInterval` callback is an uncaughtException → process death, taking every active client down.
**How to avoid:** Wrap the entire pass body in try/catch (log + return), matching how the email path logs `.catch(err => console.warn(...))` (server.js:835). If the pass is async, attach `.catch` to the promise as well.
**Warning signs:** Any `throw` reachable from doc parsing (corrupt doc JSON in a workspace row) — guard `JSON.parse` like migrateTenancy does (server.js:1212-1216).

### Pitfall 4: Double-purposing completion gating
**What goes wrong:** `isOver` in the client is `t.due && t.status !== 'done'` (src/core/utils.js:270); the server must also exclude `t.archived` and `project.archived` (src/core/store.js:262,268-269), and private-project visibility should be respected so reminders aren't generated for members who can't see the task.
**How to avoid:** One `remindable(task, project)` predicate: has `due`, `status !== 'done'`, not `task.archived`, not `project.archived`, assignee can see the project.
**Warning signs:** Test with an archived-project task due today still generating rows.

### Pitfall 5: Old workspaces missing the new pref keys
**What goes wrong:** Stored docs' `notifPrefs` predate the three new keys; `prefs.email_reminder === false` is false when the key is `undefined`, so gating reads "enabled" — fine — but a strict `=== true` check would silence everyone on upgrade.
**How to avoid:** Treat missing keys as ON (default-true semantics), matching how queueNotifEmails gates (`prefs[prefKey] === false` disables, server.js:811).

### Pitfall 6: 09:00-hour window + dedup interplay across workspaces
**What goes wrong:** A workspace scanned at 08:59 today and 09:01 tomorrow is fine, but a pass that caches `localDate` across a midnight rollover (long tick) can mislabel windows.
**How to avoid:** Compute `localDate`/`localHour` per workspace inside the pass, not once globally; the pass is small enough that per-workspace computation is cheap.

## Code Examples

### Workspace-local date and hour (dependency-free, DST-correct)
```js
// Verified pattern: Intl with timeZone on Node v24.21.0 (full ICU), node:sqlite project
const TZ_BY_LABEL = {
  '(GMT-08:00) Pacific Time': 'America/Los_Angeles',
  '(GMT-05:00) Eastern Time': 'America/New_York',
  '(GMT+00:00) London': 'Europe/London',
  '(GMT+01:00) Berlin': 'Europe/Berlin',
  '(GMT+08:00) Singapore': 'Asia/Singapore',
};
function localParts(tzLabel, date = new Date()) {
  const zone = TZ_BY_LABEL[tzLabel] || 'UTC';           // '' / unknown → UTC
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}
```
Then window math is pure string arithmetic on `YYYY-MM-DD` (use a tiny `addDaysIso(iso, n)` via Date UTC methods to avoid local-midnight DST traps — construct with `Date.UTC` and read back `toISOString().slice(0,10)`).

### Dedup schema (add to SCHEMA, server.js ~line 210)
```sql
create table if not exists reminders_sent (
  dedup_key    text primary key,   -- `${wsId}:${taskId}:${memberId}:${offset}:${dueDate}`
  workspace_id text not null,
  created_at   integer not null
);
create index if not exists reminders_sent_ws on reminders_sent(workspace_id, created_at);
```
Offsets (enum, internal): `day_before`, `morning_of`, `past_due`. The key includes the due date, so editing a due date yields new keys — re-arm is automatic (REM-03). Old rows are harmless; an optional periodic prune is discretion-area.

### Tick skeleton
```js
function runReminderPass() {           // sync or async; caller isolates failures
  for (const ws of db.prepare('select * from workspaces').all()) {
    try {
      const { date: localDate, hour } = localParts(JSON.parse(ws.doc)?.data?.ws?.tz ?? ws.tzLabel /* P.tz lives in doc data */);
      if (hour !== 9) continue;        // idle → pure read, no writes (REM-01/SC-5)
      // scan doc tasks (JSON.parse already done), build candidate (task, assignee, offset, due) tuples
      // per candidate: transaction(claim + updateDoc append) → post-commit email fan-out
    } catch (err) { console.warn(`reminder pass ${ws.id}: ${err.message}`); }
  }
}
// main(), after the APP_URL guard (server.js:3448-3456) so SMTP+APP_URL invariant holds before any send:
runReminderPass();                                  // boot catch-up (REM-01)
setInterval(() => { try { runReminderPass(); } catch (err) { console.warn(`reminder tick: ${err.message}`); } }, 60_000).unref();
```
**Note (verified):** `P.tz` is stored in the workspace **doc data** (seeded `tz: ''` server.js:1575; client default `'(GMT-07:00) Pacific Time'` src/core/store.js:16; select options settings.js:266). The scheduler reads it from `doc.data.*`, not a workspace column — confirm the exact path (`doc.data.ws?.tz` vs `doc.data.prefs?.tz`) when implementing; grep for `sel('tz'` handler in actions/settings save path.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-cron / external crond | In-process setInterval + dedup ledger | Project constraint (no new deps) | This phase's shape is already fixed by D-27-2 |
| Manual GMT-offset tables | Intl timeZone (full ICU default since Node 13) | long-standing | Node ≥24 guarantees ICU; no locale data install needed |

**Deprecated/outdated:** nothing in this stack is deprecated; note `node:sqlite` (already in use) is the blessed SQLite path for Node ≥22.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact storage path of `P.tz` inside the workspace doc (readable server-side) — verified it exists in doc data (server.js:1575) but not which sub-object the settings save writes to | Code Examples / Tick skeleton | Tick reads undefined tz → UTC fallback → wrong send hour until fixed; low blast radius |
| A2 | Five tz options in settings.js:266 are the complete set (no other writer of `tz`) | Pitfall 1 | Unknown label → UTC fallback; reminders at 09:00 UTC instead of local |
| A3 | Task `assignee` is a single member id string (plus optional subtask assignees); reminder recipients = task.assignee only (subtasks out of scope) — consistent with `t.assignee` usage in stripMember (server.js:1016-1021) | Pitfall 4 | Missing recipients if subtask assignees were expected (REQUIREMENTS say "task assignees" — singular task-level reading) |
| A4 | A reminder email that's lost to a crash-between-commit-and-send is acceptable (at-most-once email, in-app row still exactly-once) | Pattern 1 | If user wants email exactly-once too, email send must move inside the transaction or get its own outbox table — needs confirmation only if unacceptable |
| A5 | Private-project visibility gating for reminders should mirror canSee() semantics | Pitfall 4 | Minor: reminders to members who can't see the task (cosmetic) |

## Open Questions

1. **Where does the settings save write `tz`?**
   - What we know: select exists (settings.js:266), server seeds `tz: ''` (server.js:1575).
   - What's unclear: exact doc path (`data.ws.tz` vs `data.prefs.tz`).
   - Recommendation: planner adds a 2-minute verification task (grep `tz` in src/actions or the save handler); trivial.

2. **Reminder email copy shape** — reuse `MAILER.sendNotif`'s existing kind labels or add a dedicated reminder template? Discretion per CONTEXT.md; recommend the thin sibling builder (Pattern 3, option B) for clean copy.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node ≥24 with full ICU | Intl timeZone math | ✓ [VERIFIED: v24.21.0 on this machine] | 24.21.0 | — |
| SQLite (node:sqlite, existing `db`) | Dedup table | ✓ (existing) | — | — |
| SMTP / APP_URL (optional) | Reminder emails | Existing MAILER machinery, boot-guarded | — | In-app rows unaffected when SMTP off |

No missing dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (real server + SQLite harness, e.g. test/audit-log.test.mjs pattern) |
| Config file | none — package.json `test` script |
| Quick run command | `node --test test/due-reminders.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REM-01 | Idle tick writes nothing (revision unchanged); boot catch-up fires missed window once | unit (clock-injectable pass) | `node --test test/due-reminders.test.mjs` | ❌ Wave 0 |
| REM-02 | day-before & morning-of rows per assignee at 09:00 local; pref default ON | unit | same | ❌ Wave 0 |
| REM-03 | Two ticks / restart → exactly one row; due-date change re-arms | unit | same | ❌ Wave 0 |
| REM-04 | done/archived task & archived project → no rows; overdue → exactly one past_due | unit | same | ❌ Wave 0 |
| REM-05 | email_reminder=false → no email; true → deep-link URL present | unit | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/due-reminders.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/due-reminders.test.mjs` — covers REM-01..05; must expose `runReminderPass({ now, workspaces })` (or injectable clock/date) so 09:00-local and DST cases are testable without sleeping
- [ ] Clock injection design: pass localDate/hour in as parameters (pure function of (tz, Date) → keep `localParts` pure and test it directly for DST dates like 2026-03-08/2026-11-01)

## Security Domain

security_enforcement not disabled in config → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface |
| V3 Session Management | no | No session changes |
| V4 Access Control | yes | Recipients resolved from authority rows (memberships/users) exactly as queueNotifEmails does; workspace-scoped name/email reveal (T-23-06 precedent); private-project visibility gating on candidates |
| V5 Input Validation | yes | Dedup key built from internal ids only (no user input); tz label matched against a literal allow-list map |
| V6 Cryptography | no | Nothing new |
| V7 Logging | yes | Tick/email failures logged via console.warn, never thrown to clients |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Host-header poisoning of emailed links | Tampering | APP_URL used unconditionally + boot guard (existing, server.js:3448-3456) — reuse, never request Host |
| Email flooding on dedup failure | DoS | Transactional INSERT OR IGNORE claim-before-send; idempotent by construction |
| Information exposure to non-members | Information Disclosure | Recipient resolution + name reveal already workspace-scoped in queueNotifEmails (G-23-1 comment, server.js:796-806) |

## Sources

### Primary (HIGH confidence)
- server.js:787-837 (`NOTIF_EMAIL_KIND`, `queueNotifEmails`, deep link), :1039-1060 (`updateDoc`, `wsRevision`, `transaction`), :1087-1097 (notifPrefs defaults), :114-210 (SCHEMA), :1166-1173 (`bootstrap`), :2560-2619 (PUT revision/409/email flush), :3440-3456 (unref'd intervals, APP_URL guard)
- src/core/store.js:16, :262-269; src/core/utils.js:85-101, :270; src/pages/settings.js:266, :370-380; src/pages/inbox.js:13-15, :55
- Live probe: `Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles'})` on Node v24.21.0 → '2026-11-01'

### Secondary (MEDIUM confidence)
- None needed beyond the above; ECMAScript Intl spec knowledge for formatToParts marked ASSUMED only in A2's scope

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is existing in-repo machinery read this session
- Architecture: HIGH — patterns map 1:1 onto established code (transaction, queueNotifEmails, unref'd interval, boot pass)
- Pitfalls: HIGH — all grounded in read code; tz mapping (A1/A2) is the only assumed area and has a safe UTC fallback
- Timezone math: HIGH for Intl mechanism (verified live), MEDIUM for label→zone table (A2)

**Research date:** 2026-11-01
**Valid until:** 2026-12-01 (stable, no external deps)
