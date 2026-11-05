# Phase 38: Daily Digest & Reminder Suppression - Research

**Researched:** 2026-11-04
**Domain:** Server-side digest email riding the existing reminder scheduler; pref-default inversion; email fan-out suppression
**Confidence:** HIGH (all claims verified by reading the source files this session; no external packages involved)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Late, never lost — digest fires at the first 09:00 tick after boot, via the same window-open predicate + dedup-claim pattern as reminders. No "skip missed day" logic.
- **D-02:** Content computed at the SEND instant — a late 14:00 catch-up lists what is due-today/overdue at 14:00. No snapshot replay, no persisted task-list storage.
- **D-03:** Dedup claim key: `ws:{userId}:digest:{localDate}` in the existing `reminders_sent` ledger. No `due` component.
- **D-04:** Digest rides `runReminderPass` — same hour gate, same `localParts`/tz resolution, same boot catch-up. No separate scheduler.
- **D-05:** Recipients = membership rows (`memberships`, authority table) whose resolved `prefs.email_digest === true`. Doc-only members carry no account row → naturally excluded.
- **D-06:** Task filter reuses `remindable()` plus the SCOPE-04 scope checks already in the reminder pass — one visibility definition.
- **D-07:** Rescheduled tasks re-appear naturally (fresh content, per-day dedup). No repeat-suppression machinery.
- **D-08:** Reminder emails and digest computed in the same pass from one per-workspace doc snapshot — no digest-before-reminders ordering.
- **D-09:** Digest suppresses reminder EMAILS only. Inbox + push rows keep appearing exactly per Phase 37.
- **D-10:** Gate lives at email fan-out (the reminder branch of `queueNotifEmails` / `NOTIF_EMAIL_KIND`): rows always emitted and claimed; reminder email skipped when recipient's `prefs.email_digest === true`.
- **D-11:** `email_digest === true` wins over `email_reminder` regardless of its value. `email_reminder` governs only digest-OFF members.
- **D-12:** Nothing due/overdue = no claim, no email. Dedup key never consumed on an empty digest.
- **D-13:** Replace-framing copy: EN "Daily digest" / "Get one email at 09:00 with tasks due today and overdue — replaces individual reminder emails"; FR "Résumé quotidien" / "Recevez un email à 09h00 avec les tâches dues aujourd'hui et en retard — remplace les emails de rappel individuels". Exact wording polish is writer/planner discretion. Suppression behavior MUST be visible in the description.
- **D-14:** `email_digest` STAYS in the 16-key whitelist; only its default-layer entry is deleted from `NOTIF_PREF_DEFAULTS` (server.js) and `src/core/notifPrefs.js`. Stored `true` = opted in, stored `false` = off, undefined = off. Zero migration, zero whitelist churn.
- **D-15:** Toggle stays in place at `src/pages/settings.js:375` — only labels + default handling change.

### the agent's Discretion
- Digest email HTML/text structure (subject, section grouping, deep-link format) — follow existing mailer templates and the Phase 36 `tFor` localized-frame pattern; copy within the `notif.*` catalogue family, EN+FR, passing the i18n gate.
- Exact internal test harness approach (extend `POST /api/internal/reminder-pass` with injectable clock).
- Whether the suppression gate is a branch inside `queueNotifEmails` or a dedicated pre-filter — both satisfy D-10.
- Final EN+FR wording of the settings description and any new catalogue keys.

### Deferred Ideas (OUT OF SCOPE)
- Digest content beyond due-today/overdue (AUDIT-01) and "digest AND individual emails" mode — rejected/deferred per REQUIREMENTS.md Future Requirements.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIGEST-01 | Opt-in digest at 09:00 workspace-local, due-today + overdue tasks deep-linked, localized per recipient; silent when nothing qualifies | Digest loop inside `runReminderPass` after the reminder loop (same `localParts`/hour gate); task filter = `t.assignee === member_id` + `remindable()` + scope checks; per-recipient locale from `users.locale` via memberships⋈users join; `MAILER.sendDigest` new method; claim `ws:{userId}:digest:{localDate}` with `insert or ignore` inside a transaction |
| DIGEST-02 | Digest reads tasks directly, transactional claim (idempotent across restarts), type-scoped suppression (mentions/assignments/comments unchanged; push+inbox never suppressed) | Claim in `reminders_sent` (same `INSERT OR IGNORE` + `transaction()` pattern as T-27-03); suppression gate in `queueNotifEmails` reminder branch only (`NOTIF_EMAIL_KIND` maps `due_reminder`/`past_due` → `email_reminder`, lines 1176-1182); row append + email skip are independent |
| DIGEST-03 | `email_digest` real opt-in: removed from default layer (undefined-falsy = off), settings toggle with replace-framing copy EN+FR | Delete `email_digest: true` from `NOTIF_PREF_DEFAULTS` (server.js:1146) and `src/core/notifPrefs.js:19`; replace stale `settings.notif.digestDesc` copy in `src/locales/en.json:1246` and `fr.json:1246`; toggle already exists (settings.js:375) |
</phase_requirements>

## Summary

Everything this phase needs already exists; the work is three seams in `server.js`, one default deletion on each side of the prefs mirror, and copy edits. The digest rides `runReminderPass()` (server.js:1363-1452): after the per-task reminder loop, a second loop iterates the workspace's membership rows (joined to `users` for email + locale), filters the already-parsed `tasks` snapshot to the recipient's assigned tasks passing `remindable()` + the same SCOPE-04 checks the reminder loop applies, claims `ws:{userId}:digest:{localDate}` in `reminders_sent` via the same `transaction()` + `insert or ignore` pattern, and — only on a successful claim — calls a new `MAILER.sendDigest()` post-commit. Suppression is one branch in `queueNotifEmails` (server.js:1189): when the notification's kind resolves to `email_reminder` and the recipient's resolved `prefs.email_digest === true`, skip the email — notification rows are already appended and claimed by the caller, so inbox and push are untouched. The pref inversion is two default-object edits; the PUT route (server.js:3216-3255) merges only incoming keys over stored, so the whitelist and upsert semantics need no change.

**One genuine spec-level finding** (Pitfall 1 below): the client PUTs its full hydrated prefs object (`IN.npToggle` → `api.putNotifPrefs(wsId, S.notifPrefs)`, src/actions/actions.js:2697), and `S.notifPrefs` carries `email_digest: true` from the current default layer. Any user who has toggled ANY notif pref since Phase 34 therefore has a stored row with explicit `email_digest: true` that is NOT a real opt-in. D-14's parenthetical anticipated exactly this and rules "stored true = opted in" — but that means those users get digests and lose reminder emails on deploy without ever choosing it, in tension with SC-4's "no user receives a digest without explicitly enabling it." This needs an explicit planner/user confirmation (checkpoint) — see Open Questions.

**Primary recommendation:** Build the digest loop as a sibling of the reminder loop inside `runReminderPass`'s per-workspace block (reuse the in-scope `tasks`/`projects` maps), add the suppression branch at the top of the `queueNotifEmails` pref gate, delete the two default-layer entries, replace the stale settings copy, and gate everything on the existing `POST /api/internal/reminder-pass` harness plus the throwaway-SMTP pattern from `test/notif-i18n.test.mjs`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Digest scheduling, task filter, dedup claim | API/Backend (`runReminderPass` in server.js) | — | Same pass owns hour gate, tz, ledger; zero new scheduler (D-04) |
| Reminder-email suppression | API/Backend (`queueNotifEmails` in server.js) | — | Email fan-out is the single email seam; rows already claimed before it (D-10) |
| Inbox + push reminder rows | API/Backend (unchanged doc append) | Client (inbox render) | Never suppressed (D-09); no code change |
| Digest email rendering (EN/FR) | API/Backend (mailer.js via `tFor`) | — | Phase 36 localized-frame pattern; `notif.*` catalogue keys |
| `email_digest` opt-in + settings toggle | API/Backend (prefs row + PUT route) | Client (settings.js, notifPrefs.js defaults) | Default-layer deletion both sides; whitelist unchanged (D-14/D-15) |
| Digest settings copy EN+FR | Client (src/locales) | — | `settings.notif.digest*` keys, plain catalogue parity |

## Standard Stack

### Core
No new packages — the project's zero-runtime-dependency invariant applies. Everything uses existing in-repo machinery:

| Facility | Where | Purpose |
|----------|-------|---------|
| `runReminderPass({ now })` | server.js:1363-1452 | Host the digest loop; injectable clock for tests |
| `reminders_sent` ledger | server.js:298-303 (schema) | Digest dedup claims, new key shape |
| `transaction()` + `insert or ignore` | server.js:1427-1436 | Atomic claim pattern (T-27-03) |
| `getUserNotifPrefs(userId, wsId)` | server.js:1162-1174 | ONLY prefs reader; `{...DEFAULTS, ...stored}` merge |
| `remindable(task, project)` | server.js:1345-1350 | Due-date validity, done/archived, `canSeeProject(project, task.assignee)` |
| `localParts(tzLabel, date)` / `workspaceTzLabel` | server.js:1315-1339 | Workspace-local `date` (YYYY-MM-DD) + `hour` |
| `queueNotifEmails` / `NOTIF_EMAIL_KIND` | server.js:1176-1288 | Suppression seam |
| `tFor(locale, key, vars)` | mailer.js (Phase 36) | Localized digest email frame |
| `buildNotifMessage` internals (`escapeHtml`, `encodeWord`, `base64Body`, `boundary` MIME) | mailer.js:402-511 | Template for a new `buildDigestMessage` |
| memberships⋈users query | server.js:1221-1226 | Recipient `member_id → user_id, email, locale` in one query |
| Test route `POST /api/internal/reminder-pass` | server.js:2844-2851 | Injectable clock, `REMINDER_TEST_TOKEN`-gated |
| Throwaway SMTP peer | test/notif-i18n.test.mjs:27-90 | Capture digest emails in tests (`fakeSmtp()`, `waitFor`, `payloadFor`) |

**Installation:** none. `npm install` is forbidden by the project invariant; the Package Legitimacy Audit is N/A (no external packages installed or recommended).

## Architecture Patterns

### System Architecture Diagram

```
 every minute setInterval / boot catch-up (server.js:5223-5230)
        │
        ▼
 runReminderPass({ now }) ── hour !== 9 ? ── yes → pure read, exit
        │ no
        ▼
 per workspace: parse doc snapshot, localDate/hour via localParts()
        │
        ├────────────── EXISTING reminder loop (unchanged) ──────────────┐
        │  per task: remindable() + SCOPE-04 checks + prefs              │
        │  claim ws:{taskId}:{assignee}:{offset}:{due} ── transaction    │
        │  → notif row appended to doc (inbox) → post-commit             │
        │      queueNotifEmails(...)                                     │
        │            │                                                   │
        │            ▼                                                   │
        │      NEW GATE (D-10/D-11): kind maps to 'email_reminder'       │
        │      AND prefs.email_digest === true ?  skip email : send      │
        │            (inbox/push rows always kept)                       │
        │                                                                │
        └────────────── NEW digest loop (D-04) ──────────────────────────┘
           per membership⋈users row where resolved prefs.email_digest===true
                │
                ▼
           filter tasks: t.assignee === member_id
             + remindable(t, project)
             + same SCOPE-04 scope checks as the reminder loop
             + (localDate >= due || localDate > due)
                │
        empty? ── yes → NO claim, NO email (D-12)
                │ no
                ▼
           transaction: insert or ignore reminders_sent
             key ws:{userId}:digest:{localDate}   (D-03)
             claim lost? → already sent, skip
                │ claimed
                ▼
           POST-commit (never inside tx): MAILER.sendDigest()
             → buildDigestMessage: tFor(locale, 'notif.digest.*'),
               due-today + overdue sections, deep links
               ${APP_URL}/w/{ws.slug}/task/{task.key}
```

### Recommended Project Structure
No new files required. Touch surface:
```
server.js                      # digest loop, suppression gate, DEFAULTS edit, (maybe) route response shape
mailer.js                      # buildDigestMessage + sendDigest (mirrors buildNotifMessage/sendNotif)
src/core/notifPrefs.js         # delete email_digest: true from NOTIF_PREF_DEFAULTS (line 19)
src/pages/settings.js          # no structural change — row at :375 stays; keys unchanged
src/locales/en.json, fr.json   # settings.notif.digestDesc replacement + new notif.digest.* keys
test/digest.test.mjs (new)     # harness reusing due-reminders + notif-i18n patterns
```

### Pattern 1: Claim-then-send (T-27-03, verbatim reuse)
**What:** `transaction(() => { insert or ignore → if changes === 0 return; /* mutate */ claimed = true })`, then post-commit fan-out.
**When to use:** every digest send.
**Example:**
```js
// Source: server.js:1425-1444 (existing reminder pattern)
let claimed = false;
transaction(() => {
  const r = db.prepare('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)')
    .run(`${ws.id}:${userId}:digest:${localDate}`, ws.id, now());   // D-03 key shape
  if (r.changes === 0) return;
  claimed = true;          // NOTE: digest does NOT call updateDoc — no notif row, no revision bump
});
if (!claimed) continue;
if (MAILER.enabled) {
  await MAILER.sendDigest({ to: userRow.email, locale, ws, dueToday, overdue }); // post-commit only
}
```

### Pattern 2: Suppression gate at the pref check (D-10/D-11)
The cleanest seam is inside the existing pref gate at server.js:1235-1236 — one new condition after `prefs` is resolved:
```js
// Source: server.js:1229-1236 (existing), extension per D-10/D-11
const prefKey = NOTIF_EMAIL_KIND[n.type];
if (!prefKey) continue;
const prefs = getUserNotifPrefs(authority.get(n.to)?.user_id || n.to, wsRow.id);
if (prefs[prefKey] === false) continue;
/* Phase 38 (D-10/D-11): digest replaces reminder EMAILS only — the row was
   already claimed and appended by the caller; inbox + push never suppressed.
   email_digest === true wins regardless of email_reminder's value. */
if (prefKey === 'email_reminder' && prefs.email_digest === true) continue;
```
Note this is a NEW gate, distinct from the `=== false` check: a recipient with `email_reminder: true` AND `email_digest: true` must still lose the reminder email (D-11).

### Pattern 3: Per-recipient scope filter (D-06 — copy the reminder loop's checks, not just `remindable`)
`remindable()` (server.js:1345-1350) validates the *assignee's* visibility via `canSeeProject(project, task.assignee)` — for the digest, assignee === recipient, so that is correct. But the reminder loop additionally applies the SCOPE-04 checks on the membership row (server.js:1382-1396: `projectScope` / `inScopeProject` / `memberCanReadProject`). The digest loop must apply the SAME three checks per (recipient, task) — they are cheap, already written, and D-06 forbids a second pipeline.

### Anti-Patterns to Avoid
- **Claiming on an empty digest (D-12):** compute the task list FIRST, claim only if non-empty. SC-2's idempotence pin must assert BOTH no-double-send AND no-phantom-claim (CONTEXT.md § Specifics).
- **Calling `updateDoc` in the digest transaction:** the digest produces no inbox row; a doc write would bump the workspace revision for no client-visible change and violate "no claim → no mutation" symmetry with idle ticks.
- **A second task-visibility filter:** any digest-specific `canSee` variant is a forbidden second pipeline (D-06; Phase 29/32 invariant).
- **Shoehorning the digest into `sendNotif`/`buildNotifMessage`:** that builder renders one task + one sentence; a list needs a new `buildDigestMessage`/`sendDigest` sibling reusing the same MIME bones (escapeHtml AFTER interpolation, `encodeWord` subject, base64 alternative parts, `Auto-Submitted: auto-generated`).
- **Touching the plural push keys:** Phase 37's `dueReminders`/`dueDesc` plural pair is off-limits (37 Pitfall-3 precedent — plan prohibition takes precedence over greps).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduler/catch-up | New interval, cron, or missed-day logic | `runReminderPass` hour gate + absent dedup key = catch-up (D-01/D-04) | Window predicate + ledger already proven; a second scheduler invites clock drift vs suppression |
| Exactly-once send | In-memory "sent today" sets, file locks | `reminders_sent` + `insert or ignore` in `transaction()` | Survives restarts; in-memory state is lost on restart — the exact SC-2 failure |
| tz math | Date-with-offset arithmetic | `localParts()` (Intl.DateTimeFormat over `TZ_BY_LABEL`) | Pure string compare; DST-safe (Pitfall documented at server.js:1330-1332) |
| Localized email frame | Hand-built i18n | `tFor(locale, key, vars)` + `notif.*` catalogue | Phase 36 machinery; the i18n gate (scripts/i18n-scan.mjs:1503-1521) scans server.js + mailer.js for `notif.*` first-string args and enforces EN↔FR parity |
| Email capture in tests | Fake SMTP from scratch per test file | `fakeSmtp()`/`waitFor`/`payloadFor` in test/notif-i18n.test.mjs:27-93 | Proven throwaway net server pattern |
| Clock injection | Fake timers/sleeps | `POST /api/internal/reminder-pass { now }` (server.js:2844-2851) | Real server, real SQLite, deterministic instants |

**Key insight:** the entire phase composes existing, individually-tested mechanisms — the risk is not building new machinery but perturbing the reminder loop's invariants (idle-tick purity, exactly-once, revision discipline). Keep every existing behavior bit-identical when digest is OFF.

## Common Pitfalls

### Pitfall 1: Historical prefs rows carry a non-consensual `email_digest: true` (⚠ spec-level, needs confirmation)
**What goes wrong:** `IN.npToggle` PUTs the full hydrated object `S.notifPrefs` (src/actions/actions.js:2697 → src/core/api.js:260-262), which today includes `email_digest: true` from `NOTIF_PREF_DEFAULTS`. The PUT route merges incoming keys over stored (server.js:3251-3253), so any user who toggled any notif pref since Phase 34 has a stored row with explicit `email_digest: true`. After the default-layer deletion, `getUserNotifPrefs` returns that stored `true` — these users start receiving digests AND lose reminder emails on deploy without ever opting in, colliding with SC-4 ("no user receives a digest without explicitly enabling it").
**Why it happens:** the client echoes defaults into the stored row; "stored true = opted in" (D-14) can't distinguish an echo from a choice.
**How to avoid:** planner must surface this explicitly. D-14's parenthetical ("verify against Phase 34 upsert semantics whether historical rows carry explicit true") is now answered: **they can.** Resolution options: (a) accept stored-true-as-opt-in per D-14's literal text and document it in release notes; (b) treat deploy-day as a forced re-confirmation (e.g. the settings page shows the toggle ON-state honestly but no code change). This is a user-confirmation checkpoint, not a code decision — CONTEXT.md says "an explicit stored true IS the opt-in", so option (a) is the locked reading; the planner should still confirm SC-4's wording is satisfied by that reading in the user's eyes.
**Warning signs:** first 09:00 after deploy produces digests for users who never touched the digest toggle.

### Pitfall 2: Suppressing the wrong layer
**What goes wrong:** gating the reminder *emission* (inside `runReminderPass`) instead of the email fan-out would kill inbox/push rows too (violates D-09/DIGEST-02), or would change dedup-claim behavior.
**How to avoid:** the notif row append + claim in `runReminderPass` stay byte-identical; only `queueNotifEmails` changes, and only for kinds whose `NOTIF_EMAIL_KIND` value is `'email_reminder'` (server.js:1180-1181: `due_reminder` and `past_due`). Mention/assign/comment kinds map to other pref keys and are structurally untouched.
**Warning signs:** any test asserting fewer notif rows in the doc after enabling digest.

### Pitfall 3: Digest-before-reminders / stale snapshot ordering
**What goes wrong:** if the digest loop runs before the reminder loop and calls `updateDoc`, or re-parses the doc mid-pass, the "one per-workspace doc snapshot" invariant (D-08) breaks and revision behavior becomes order-dependent.
**How to avoid:** digest loop placed AFTER the reminder task loop, using the same in-scope `tasks`/`projects` maps (the reminder loop only appends to `doc.data.notifs` via `updateDoc`; tasks are untouched, so the snapshot stays valid). Digest transaction does no doc write (see anti-patterns).
**Warning signs:** flaky revision-count assertions; digest content differing between a 09:00 tick and a same-instant catch-up.

### Pitfall 4: i18n gate failures on new keys
**What goes wrong:** `scripts/i18n-scan.mjs` (lines 1503-1521) extracts the first STRING argument of every `t`/`tFor` call in `server.js` AND `mailer.js`, requires each key to resolve in BOTH catalogues, and enforces `notif.*` EN↔FR parity in both directions. A `notif.digest.*` key used in code but missing from one locale file — or a key added to one file only — fails the gate.
**How to avoid:** every new key is a literal (no template-built key names); add EN+FR together; run the scan (`node scripts/i18n-scan.mjs` or the suite's i18n-scan.test.mjs) before commit. The settings copy keys (`settings.notif.digest*`) are client-side, not in the server `notif.*` family, but both locale files must stay in general parity (existing build-locales/i18n tests).
**Warning signs:** `i18n-scan.test.mjs` red in the suite; FR sentence missing from the digest email.

### Pitfall 5: `localParts` hour semantics and the boot tick
**What goes wrong:** assuming the digest needs its own hour gate or a "did we already run at 09:00" memo. The pass fires at the first hour===9 local tick after boot; the dedup key makes the second tick a no-op (D-01). Also `hour` is `Number(get('hour')) % 24` — midnight reads as 0, not 24.
**How to avoid:** reuse the existing gate verbatim; never cache `localDate` across workspaces/ticks (existing comment at server.js:1368-1370).
**Warning signs:** double digest when the interval fires twice within the 09:00 hour — impossible with the claim, fatal without it.

### Pitfall 6: Doc-only members and email resolution
**What goes wrong:** iterating `doc.data.members` for digest recipients would include doc-only members (no account, no email, no prefs row → they'd read the old default true).
**How to avoid:** iterate the AUTHORITY rows (`select m.member_id, m.user_id, u.email, u.locale from memberships m join users u on u.id = m.user_id where m.workspace_id = ?` — the exact join shape at server.js:1221-1226) and resolve prefs through `getUserNotifPrefs(user_id, wsId)` (D-05). A membership row with NULL `user_id` or NULL email is skipped naturally.
**Warning signs:** a digest sent to a member email that has no account.

### Pitfall 7: Deep-link and subject rendering discipline
**What goes wrong:** interpolating task titles into the subject without `encodeWord`, or into HTML without `escapeHtml`, breaks MIME headers or injects markup.
**How to avoid:** mirror `buildNotifMessage`'s order — catalogue renders raw, escaping applied AFTER interpolation; deep links use `${APP_URL}/w/${ws.slug}/task/${encodeURIComponent(task.key)}` with the workspace-root fallback for a missing key (server.js:1270-1276).
**Warning signs:** raw HTML in plain-text part; header fold errors on accented subjects (the FR copy has accents).

## Code Examples

### Digest recipient + content computation (per workspace, after the reminder loop)
```js
// Source: composed from server.js:1221-1226 (authority join), 1345-1350 (remindable),
// 1382-1396 (SCOPE-04 checks), 1398-1404 (window predicates) — all read this session
const digestRecipients = db.prepare(
  'select m.member_id, m.user_id, u.email, u.locale from memberships m join users u on u.id = m.user_id where m.workspace_id = ?'
).all(ws.id);
for (const r of digestRecipients) {
  if (!r.user_id || !r.email) continue;
  const prefs = getUserNotifPrefs(r.user_id, ws.id);
  if (prefs.email_digest !== true) continue;           // D-05/D-14: explicit stored true only
  const mem = db.prepare('select role, scope from memberships where workspace_id = ? and member_id = ?').get(ws.id, r.member_id);
  const scope = projectScope(mem);
  const dueToday = [], overdue = [];
  for (const t of tasks) {
    if (t.assignee !== r.member_id) continue;
    const project = projects.get(t.project);
    if (!remindable(t, project)) continue;
    if (!inScopeProject(project, scope)) continue;
    if (!scope && !memberCanReadProject(project, ws.id, r.member_id)) continue;  // VIS-04 branch
    if (localDate >= t.due) dueToday.push(t);          // same string compare as morning_of
    else if (localDate > t.due) overdue.push(t);       // past_due predicate
  }
  if (!dueToday.length && !overdue.length) continue;   // D-12: no claim on empty
  // ... claim ws:{r.user_id}:digest:{localDate} in transaction, then post-commit sendDigest
}
```

### New catalogue keys (family must start with `notif.` to pass the server scan)
```jsonc
// Source: src/locales/en.json:1675-1686 (existing notif.email.* family shape)
"notif.digest.subject": "Your daily digest — {count} task(s)",
"notif.digest.dueToday": "Due today",
"notif.digest.overdue": "Overdue",
"notif.digest.footer": "…replaces individual reminder emails…"
// + FR twins; parity gate is bidirectional (scripts/i18n-scan.mjs:1519-1521)
```

### Test harness skeleton (new test/digest.test.mjs)
```js
// Source: test/due-reminders.test.mjs:29-40 (trigger), 111 (startServer env),
// test/notif-i18n.test.mjs:27-93 (fakeSmtp + waitFor + payloadFor)
const trigger = (nowIso) => fetch(`${server.base}/api/internal/reminder-pass`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
  body: JSON.stringify({ now: nowIso }),
}).then(r => (await r.json()).emitted);
// Seed prefs: insert or replace into user_notif_prefs (workspace_id, user_id, prefs)
//   values (?,?,JSON.stringify({ email_digest: true }))   [due-reminders.test.mjs:100-108 shape]
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), zero-dependency |
| Config file | none — `package.json` script: `"test": "node --test --test-concurrency=2 test/*.test.mjs"` |
| Quick run command | `node --test test/digest.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIGEST-01 | 09:00-local digest lists due-today + overdue with deep links, per-recipient locale | integration (clock-injected pass + fake SMTP capture) | `node --test test/digest.test.mjs` | ❌ Wave 0 |
| DIGEST-01 | Nothing due/overdue → no email AND no ledger claim (D-12, both halves of SC-2) | integration | `node --test test/digest.test.mjs` | ❌ Wave 0 |
| DIGEST-01 | Late catch-up (inject 14:00 after missed 09:00) → digest arrives, content-at-send (D-01/D-02) | integration | `node --test test/digest.test.mjs` | ❌ Wave 0 |
| DIGEST-02 | Second pass at same 09:00 (simulated restart) → zero emails, ledger unchanged (exactly-once) | integration | `node --test test/digest.test.mjs` | ❌ Wave 0 |
| DIGEST-02 | Digest ON → reminder emails absent (SMTP), notif rows still appended to doc, revision still bumps | integration | `node --test test/digest.test.mjs` | ❌ Wave 0 |
| DIGEST-02 | Digest ON → mention/assign/comment emails still fire; push/inbox rows untouched | integration | `node --test test/digest.test.mjs` | ❌ Wave 0 |
| DIGEST-02 | Digest wins over `email_reminder: true` AND `email_reminder: false` (D-11 matrix) | integration | `node --test test/digest.test.mjs` | ❌ Wave 0 |
| DIGEST-03 | Default layer: `email_digest` undefined-falsy on both server accessor and client merge; stored false/true respected | unit/integration | `node --test test/digest.test.mjs test/notif-prefs.test.mjs` | partial (notif-prefs exists; new pins Wave 0) |
| DIGEST-03 | Settings copy EN+FR present, suppression framing visible; i18n-scan server-key gate green | suite | `node --test test/i18n-scan.test.mjs test/i18n-prefs.test.mjs` | ✅ (gates exist; new keys must satisfy) |

### Sampling Rate
- **Per task commit:** `node --test test/digest.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/digest.test.mjs` — covers all DIGEST pins (harness: `startServer` + `REMINDER_TEST_TOKEN` + `fakeSmtp` from test/notif-i18n.test.mjs)
- [ ] Regression pin: existing due-reminders suite must stay green UNCHANGED when digest is off (run `node --test test/due-reminders.test.mjs` per task — it already pins idle-tick purity, exactly-once, revision discipline)
- [ ] Framework install: none needed (node:test built-in)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | SCOPE-04 checks (projectScope/inScopeProject/memberCanReadProject) copied verbatim from the reminder loop; `remindable`'s canSeeProject — one visibility pipeline (D-06) |
| V5 Input Validation | yes | Prefs: 16-key whitelist + Boolean coercion in PUT (server.js:3229-3252); stored blob JSON.parse with try/catch (server.js:1164-1172) |
| V6 Cryptography | no | No new crypto; email MIME encoding reuses existing base64/encodeWord |
| V7 Error handling | yes | Digest failures inside the per-workspace try/catch (server.js:1447-1449 pattern); SMTP send is fire-and-forget with `console.warn` (server.js:1286 pattern) |
| Mass-assignment | yes | Digest recipients from authority rows keyed by session-side ids only; no user input touches the digest path |
| Email header safety | yes | `escapeHtml` after interpolation, `encodeWord` for subjects, existing `Auto-Submitted: auto-generated` header |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Digest leaking out-of-scope tasks to a scoped member | Information Disclosure | Same SCOPE-04 predicate per (recipient, task) — never a digest-specific filter (D-06; T-29-09 defense-in-depth precedent) |
| Reminder suppression as a DoS on visibility (gate drops rows) | Denial of Service | Gate is email-only; rows always appended + claimed first (D-10) — suppression cannot lose notification state |
| Prompt-injection-style content in task titles reaching email HTML | Tampering | Existing escape-after-interpolation discipline in the new `buildDigestMessage` |

## Open Questions — RESOLVED (at planning, 2026-11-04)

1. **Historical `email_digest: true` rows (Pitfall 1) — is "stored true = opted in" acceptable for SC-4?** **(RESOLVED — 38-02 Task 1 checkpoint:human-verify)**
   - What we know: D-14's parenthetical asked exactly this question; verified this session that the client PUT echoes defaults, so historical rows CAN carry explicit true without a user choice. D-14's ruling is "stored true = opted in".
   - What's unclear: whether the owner accepts that deploy-day behavior (some users silently switch from reminder emails to digests) or wants SC-4 read strictly.
   - Resolution: an explicit `checkpoint:human-verify` (38-02 Task 1) presents the deploy-day behavior to the owner and gates the default-layer inversion (38-02 Task 2); default position is D-14's literal ruling (stored true = opted in) with a release-note announcement, mirroring the Phase 37 deploy-note precedent. The owner's answer is recorded in the 38-02 SUMMARY. This checkpoint mechanism implements D-14's "verify against Phase 34 upsert semantics" clause — no locked decision is overridden.

2. **Does the digest pass need to appear in the `/api/internal/reminder-pass` response?** **(RESOLVED — 38-01 Task 2, additive response shape)**
   - What we know: the route returns `{ emitted }` (notification rows). Digest sends produce no rows.
   - Resolution: planner discretion was exercised for the additive shape — 38-01 returns `{ emitted, digests }` from the token-gated test-only route, per Assumption A1. Tests assert `digests` counts directly (e.g. `digests === 0` on double-trigger) alongside SMTP captures and ledger queries.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Adding a `digests` count to the internal test route response is acceptable (route is test-only, token-gated) | Open Questions 2 | Low — tests fall back to SMTP+ledger assertions |
| A2 | `MAILER.sendDigest` can be async fire-and-forget like `sendNotif` (`.catch(console.warn)`) without needing await-before-return | Pattern 1 | Low — matches existing discipline; a hung SMTP must not hold the SQLite lock either way (post-commit rule already covers it) |

All other claims are `[VERIFIED: server.js / mailer.js / src/* files, read this session]` with line ranges cited inline. No external packages are involved, so no package-legitimacy or environment-availability concerns exist; the suite runs via the existing `npm test` script (package.json:18).

## Sources

### Primary (HIGH confidence — all read this session)
- `server.js:1124-1174` — NOTIF_PREF_KEYS (16 keys incl. `email_digest`), NOTIF_PREF_DEFAULTS, `getUserNotifPrefs` merge semantics
- `server.js:1176-1288` — NOTIF_EMAIL_KIND, `queueNotifEmails` (pref gate at 1229-1236, locale at 1245, deep link at 1270-1276)
- `server.js:1290-1452` — scheduler header, TZ_BY_LABEL, `localParts`, `workspaceTzLabel`, `remindable`, `runReminderPass` (hour gate 1370-1372, claim transaction 1425-1436, post-commit fan-out 1439-1444)
- `server.js:2840-2851` — `/api/internal/reminder-pass` route (REMINDER_TEST_TOKEN gate, injectable clock)
- `server.js:3206-3255` — prefs GET/PUT routes (merge-over-stored upsert, whitelist + Boolean coercion)
- `server.js:298-303` — `reminders_sent` schema
- `mailer.js:392-511` — `buildNotifMessage` (tFor frame, escaping order, MIME structure, `Auto-Submitted` header)
- `src/core/notifPrefs.js:9-40, 47-76` — client defaults (line 19), NOTIF_PREF_KEYS, sanitize/merge
- `src/pages/settings.js:372-385` — notif toggle rows incl. digest row at :375
- `src/actions/actions.js:2685-2703` — `IN.npToggle` PUTs full hydrated `S.notifPrefs`
- `src/locales/en.json:1245-1246, 1675-1686` — stale digest copy + notif.email.* family
- `scripts/i18n-scan.mjs:1182-1251, 1503-1521` — server notif.* key extraction + EN↔FR parity gate
- `test/due-reminders.test.mjs` — harness: trigger helper, prefs seeding, exactly-once/restart pins
- `test/notif-i18n.test.mjs:27-93` — throwaway SMTP peer pattern
- `package.json:18` — test script

## RESEARCH COMPLETE
