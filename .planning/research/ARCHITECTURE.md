# Architecture Research — v1.5 Integration

**Domain:** due-date reminder scheduler, task email deep links, MASTER_KEY rotation (key-version envelope), operator audit hardening — grafted onto a single-process, zero-dependency Node/`node:sqlite` app
**Researched:** 2026-10-30
**Confidence:** HIGH (every anchor verified against the live tree; no external novelty — this is integration research, not library research)

## 0. The headline finding: task deep links already exist in the SPA

The biggest scope surprise. The client already resolves `/w/:slug/task/:key`:

- `applyDeepLink()` — `src/main.js:123-147`: at boot, `restFromPath` (`src/main.js:185`) is split and the `seg === 'task'` branch finds the task **by its `key`** and calls `go('task', { id })`, which opens the drawer (`S.ui.route='task'` + `A.openTask` renders `S.ui.drawer` — `src/overlays/drawer.js:22-23`, `src/actions/actions.js:521-530`).
- `A.copyLink` — `src/actions/actions.js:598-615`: already builds the canonical path `task/${task(d.id).key}` for the drawer's link button. Whatever the emails produce must match **this** shape.

So the deep-link milestone item is almost entirely a **server** job: the notification email currently links to the workspace root — `const url = \`${base}/\`` in `queueNotifEmails()` (`server.js:~715`, within the 696–730 block). The change is:

```
url = `${base}/w/${wsRow.slug}/task/${taskKey}`
```

where `taskKey` comes from the task row looked up by `n.task` (the same lookup that already resolves `taskTitle` one line above). **Use `task.key`, not `task.id`** — that's what the SPA route and `copyLink` both use, and keys survive task duplication/export better than opaque ids.

Secondary deep-link work:

- **Anonymous landings.** A signed-out browser opening `/w/:slug/task/ABC-12` goes through `main.js` init: `api.me()` fails → `S.ui.wantedSlug = slugFromPath` + login screen (`src/main.js:214-218`). After sign-in the user lands on the workspace home, **not** the task. The Phase-12 file route already solved this pattern server-side (`server.js:2883-2902`: anonymous navigation → `302 /login?next=<path>`, path-only, no open redirect). Reuse it: extend the SPA-fallback auth check for `/w/:slug/task/:key` to the same `next` redirect, and have the client honor `?next=` post-login (small `main.js` init addition). Alternatively accept the "login → home" UX and defer `next` — decide in discuss-phase; the file-route plumbing makes the `next` variant cheap.
- **Watcher set (task creator).** Notifications are generated **client-side** during mutations; the server only diffs new rows post-commit (`server.js:2183-2200`). "Creator added to watcher set" must therefore ride the client mutation that creates the task / posts the first comment (add a notif row or a `watchers` field in the same `mutate()`), not a server write — a server-side injection would race the client's `revision` and produce 409s. Prefer the existing notif-row mechanism: when the creator comments/assigns, they already receive self-notifs suppressed for email; a `watchers: [creatorId]` on the task consumed by the assign path is the lightest fit.

## 1. Server-side reminder scheduler

### Shape (per sibling research, confirmed viable here)

`setInterval(...).unref()` inside `server.js` + a `reminders` SQLite table with `UNIQUE(task_id, due_date, kind)` as the dedup key. The interval is a scan-and-fire pass, not a timer-per-reminder — matches the zero-dep constraint and the single-process model (one writer, no lock contention).

```
┌──────────────┐   every N s    ┌─────────────────────────────────────┐
│ setInterval  │───────────────▶│ reminderPass()                      │
│ .unref()     │                │  1. select due tasks from all docs  │
└──────────────┘                │  2. dedup vs reminders table        │
                                │  3. per workspace: insert notif rows│
                                │     (fresh read, BEGIN IMMEDIATE,   │
                                │      revision+1, single UPDATE)     │
                                │  4. email via queueNotifEmails      │
                                └─────────────────────────────────────┘
```

### The critical integration: writing notifs into the doc without 409 storms

The workspace doc is one JSON blob guarded by `workspaces.revision` (optimistic PUT). The scheduler is a second writer racing interactive clients. To avoid constant conflicts:

1. **Fresh read inside the transaction.** `BEGIN IMMEDIATE` → re-read the `workspaces` row (doc + revision) → parse → append the notif rows → serialize → `UPDATE workspaces SET doc=?, revision=revision+1 WHERE id=? AND revision=<read>` → `COMMIT`. A revision mismatch inside the transaction is impossible once `BEGIN IMMEDIATE` holds the write lock (node:sqlite serializes writers), so the guard is belt-and-braces; what matters is **never reusing a doc parsed outside the transaction** — that's the 409-storm generator, because a client PUT that committed between parse and write gets silently reverted.
2. **Batch per workspace, one bump per pass** — not one write per notification. N assignees on one task = one transaction.
3. **Skip when a pass has nothing to do** — the common case must be zero writes, or the 30s notif poll (`src/main.js:75-88`) will show spurious revision churn.
4. **Respect the existing notif invariants:** rows need `to`, `type`, `id`, `read`; `mergeClientDoc()` (`server.js:~651`) merges `notifs` by id, so scheduler-inserted ids must never collide with client-generated ones (prefix them, e.g. `rem-`); the redaction filters (`redactDoc`, `server.js:554`) hide notifs of private projects — scheduler notifs inherit this automatically since they're ordinary rows.
5. **Per-type prefs:** mirror `notifPrefs` gating from `queueNotifEmails` (`server.js:699`) — the in-app row always lands, the email is gated.

### The second critical integration: queueNotifEmails is req-shaped

`queueNotifEmails(wsRow, nextDoc, newNotifs, req)` builds links from `appBase(req)` (`server.js:1370-1373`). The scheduler has no `req`. Refactor to `queueNotifEmails(wsRow, nextDoc, newNotifs, base)` — callers pass `appBase(req)` (PUT path, unchanged behavior) or `APP_URL` (scheduler). **`APP_URL` becomes mandatory for the scheduler**: without it the reminder pass has no absolute URL for emails. There is precedent for loud boot warnings (`server.js:2995-2998` warns when the mailer is on without `APP_URL`) — extend that warning (or hard-gate the reminder pass) when reminders + mailer are on and `APP_URL` is unset.

### Doc scan problem

Tasks live inside JSON blobs, not a table — "which tasks are due today?" means parsing every workspace doc each pass. At self-hosted scale (tens of workspaces) parsing every doc on a 60s tick is fine; mitigate by keeping the tick at 60s and parsing lazily (JSON.parse of each doc ≈ µs-ms each). Do **not** normalize tasks into tables for this milestone.

### Reminders table

```sql
create table if not exists reminders (
  id        text primary key,
  workspace_id text not null,
  task_id   text not null,
  due_date  text not null,
  kind      text not null,          -- 'due_soon' | 'due_today' | 'overdue'
  fired_at  integer not null,
  unique(task_id, due_date, kind)
);
```

Delete rows when the task is completed or its due date changes (or just leave them — the UNIQUE key already prevents refiring a changed date; a `(task_id) = completed` cleanup keeps the table small). Prefs changes don't need retroactive handling: the dedup key is per (task, date, kind), and prefs gate only the email side.

## 2. MASTER_KEY rotation: v2 envelope + re-wrap

### Existing machinery (all verified)

- `wrapSecret`/`unwrap` — `server.js:244-262`: `v1:<iv>:<tag>:<ct>` AES-256-GCM, key = `sha256(MASTER_KEY)`.
- `requireTotpSecret(envelope)` — `server.js:284`: **the single decrypt boundary**; every call site routes through it and fails closed with 503 `masterKeyMissing` (D-77/D-79). This is the seam the dual-key path plugs into.
- Boot migration `migrateTotpEncryption` — `server.js:~1102-1180`: trigger count (D-83) → MASTER_KEY check (D-73) → `vacuum into` backup (D-74) → transactional wrap of rows matching `not like 'v1:%'` (`server.js:1114`). This filter is the **known landmine**: the moment `v2:` rows can exist, `not like 'v1:%'` treats a v2 row as plaintext-eligible and the wrap pass corrupts/queries it. The filter must become version-aware *before* v2 ships:
  ```sql
  ... and two_fa_secret not like 'v1:%' and two_fa_secret not like 'v2:%'
  ```
  Better: derive the exclusion from the keyring's known prefixes so the next version can't forget it.
- `logSecurityEvent` — `server.js:1537` inserts into `security_log` — reuse for rotation events.

### The v2 design (keyring map)

Replace the single derived key with a prefix-keyed map:

```js
const KEYRING = {};                      // prefix → derived key
if (MASTER_KEY)        KEYRING.v2 = derive(MASTER_KEY);
if (MASTER_KEY_PREVIOUS) KEYRING.v1 = derive(MASTER_KEY_PREVIOUS);
const CURRENT = 'v2';

wrap(plain)  → `${CURRENT}:${iv}:${tag}:${ct}` signed with KEYRING[CURRENT]
unwrap(env)  → prefix = env.slice(0, env.indexOf(':'));
               key = KEYRING[prefix] ?? null;   // unknown/missing prefix → null
```

- `requireTotpSecret` keeps its signature and fail-closed behavior; internally it dispatches on prefix. With only `MASTER_KEY` set (fresh installs), v1 prefixes are undecryptable — hence the **re-wrap pass**, not dual-key-forever.
- Recovery codes / login challenges don't touch MASTER_KEY (hashed, not encrypted) — rotation scope is exactly `users.two_fa_secret`. Verify no other consumer exists at plan time.
- Rotation = new boot-migration sibling: backup (D-74 pattern) → `select ... where two_fa_secret like 'v1:%'` → unwrap with KEYRING.v1 → re-wrap with CURRENT → single transaction. Runs on boot when `MASTER_KEY_PREVIOUS` is set; completion check: `select count(*) from users where two_fa_secret like 'v1:%'` = 0. Idempotent, byte-identical second boot, same guarantees as the v1 migration. After the count reaches 0 (verified on a later boot, or immediately within the runbook), the operator removes `MASTER_KEY_PREVIOUS` — at which point the `not like` filter list shrinks back.
- **Compromise caveat for DEPLOY.md:** re-wrap protects against key *loss*, not key *compromise*. If MASTER_KEY leaks, the v1 secrets are recoverable from backups regardless of envelope version (old backups carry v1 rows) — the runbook must say "compromise ⇒ force re-enrollment", not "rotate and move on". This belongs in the key-custody runbook explicitly.

## 3. Operator audit hardening

### Current state

`security_log(id, user_id, verb, created_at)` — `server.js:163-169` — actor-keyed, no target, no scope, no ip. Written by `logSecurityEvent(user, verb)` (`server.js:1537`). Fine for "this user did X", insufficient for "operator Y revoked user Z's sessions".

### Recommendation: extend security_log, don't add a table

Two log tables in a single-DB app is fragmentation without payoff — the milestone-audit queries ("every operator action on user Z") want one surface. The additive machinery exists: `ensureColumn(conn, table, name, def)` (`server.js:~173`).

```
security_log += target_type text, target_id text, scope text, ip text   (all nullable)
```

- `target_type`/`target_id`: `'user'`/`users.id`, `'workspace'`/slug, `'session'`/id.
- `scope`: `'operator'` vs `'self'` — makes "show operator actions" a single indexed predicate.
- `ip`: free with the request already in hand; cheap forensics value.
- New helper `auditOperatorAction(actor, verb, target, scope, req)` wrapping the insert — the existing operator-revocation route (`OPREV` surface, v1.4) is retrofitted to call it; the new workspace-admin revocation tier calls it too.
- Index: `security_log(scope, created_at)` (or `(target_id, created_at)`) — the audit query pattern is "recent operator events" and "everything done to user X".
- Keep `verb` machine-form (ACT-02 precedent: verbs are stored data, never prose).
- Watch `on delete cascade` on `user_id`: revoking/deleting a user must not erase the audit trail of actions taken *against* them — target_id is a bare text column precisely so target history survives actor/target row deletion. Consider whether actor rows should cascade at all for operator verbs (log-before-delete ordering, or null the actor id — decide in plan).

## Integration map (new vs modified)

| # | Component | New/Modified | Location | Notes |
|---|-----------|--------------|----------|-------|
| 1 | `reminders` table | **new** | schema block ~`server.js:155-170` | UNIQUE(task, due_date, kind) |
| 2 | `reminderPass()` + interval | **new** | `server.js`, near mailer init (~line 87) | `setInterval(...).unref()`, 60s |
| 3 | `queueNotifEmails` signature | modified | `server.js:696-730` | `req` → `base`; PUT caller updated |
| 4 | Email deep-link URL | modified | `server.js:~715` | `url = base + /w/:slug/task/:key` |
| 5 | `APP_URL` boot guard | modified | `server.js:2995-2998` | warn/gate when reminders need it |
| 6 | Anonymous `?next` for task routes | modified (optional) | `server.js:2883-2902` + `src/main.js` init | reuse Phase-12 pattern |
| 7 | Creator watcher-set | modified (client) | task-create mutation, `src/actions/actions.js` | rides client mutation, not server |
| 8 | `KEYRING` + `CURRENT` | **new** | replaces MASTER_KEY const usage `server.js:73,244-282` | `MASTER_KEY_PREVIOUS` env |
| 9 | `requireTotpSecret` | modified | `server.js:284` | prefix dispatch; signature unchanged |
| 10 | Boot-migration filter | modified | `server.js:1114` | version-aware `not like` list — **must land before v2 rows exist** |
| 11 | Re-wrap migration | **new** | sibling of `migrateTotpEncryption` ~`server.js:1102-1180` | v1→v2, backup + transactional |
| 12 | `security_log` columns | modified | `server.js:163-169` + `ensureColumn` | target/scope/ip |
| 13 | `auditOperatorAction()` | **new** | near `logSecurityEvent` `server.js:1537` | retrofit operator-revoke route |
| 14 | DEPLOY.md runbook | modified | `DEPLOY.md` | key custody, rotation steps, compromise policy |

## Data flow after the milestone

```
Reminder flow:   interval tick → scan docs → dedup(reminders) → BEGIN IMMEDIATE
                 → fresh-read ws row → append notif rows → revision+1 → COMMIT
                 → queueNotifEmails(base=APP_URL) → email links /w/:slug/task/:key
                 → recipient browser: SPA boot → applyDeepLink (main.js:134-137)
                 → go('task') → drawer opens

Rotation flow:   deploy with MASTER_KEY + MASTER_KEY_PREVIOUS → boot:
                 backup → re-wrap v1 rows under v2 → count(v1)=0 → runbook:
                 remove MASTER_KEY_PREVIOUS → later boots: v1 prefix = fail-closed
                 (correct: nothing left to decrypt)

Audit flow:      operator route → authz → auditOperatorAction(actor, verb,
                 target, 'operator', req) → security_log (+target/scope/ip)
                 → (existing) admin/log surface
```

## Anti-patterns (specific to this codebase)

1. **Writing scheduler notifs from a pre-transaction doc parse.** Reverts concurrent client PUTs; manifests as mysterious "my edit vanished" + 409 chains. Fresh read inside `BEGIN IMMEDIATE`, always.
2. **Shipping `v2:` while `not like 'v1:%'` still guards the boot migration.** The filter will classify v2 rows as plaintext-eligible. Land #10 before #8 in the build order.
3. **Building deep-link URLs from `task.id`.** The SPA and `copyLink` both use `key`; mismatched ids produce dead links after task re-creation.
4. **A second security table for operator actions.** Forks the audit query surface; extend `security_log` with nullable columns instead.
5. **Per-notification transactions in the reminder pass.** N writes per tick × revision bumps = poll churn for every member. Batch per workspace.
6. **Assuming rotation protects a compromised key.** It doesn't (old backups still decrypt under the leaked key). Runbook must separate loss (rotate) from compromise (re-enroll).

## Suggested build order (dependency-driven)

1. **Deep links + APP_URL plumbing** (#4, #5, optionally #6) — smallest, unblocks email quality for everything after; largely one-line URL change + `next` reuse. Include creator-watcher (#7) here (same feature surface).
2. **Audit hardening** (#12, #13) — independent of 1; land before the workspace-admin revocation tier so the new tier is audited from birth.
3. **Version-aware migration filter** (#10) — hard prerequisite for #8/#11, trivial to land early.
4. **v2 keyring + dual-key decrypt** (#8, #9) — after #3; tests with both keys, one key, no key.
5. **Re-wrap rotation + runbook** (#11, #14) — depends on #4's keyring; ship runbook in same phase.
6. **Reminder scheduler** (#1, #2, #3) — biggest surface (transaction discipline, prefs, dedup); depends on #4 for email links and #5 for APP_URL; do last so its email fan-out exercises the finished link path.

## Sources

- Verified anchors: `server.js` (73, 87, 163-169, 244-284, 396-399, 554, 651, 689-730, 1102-1180, 1370-1373, 1537, 1744-1747, 2183-2200, 2883-2902, 2995-2998); `src/main.js` (75-88, 123-147, 183-185, 214-218); `src/actions/actions.js` (521-530, 598-615, 2160); `src/overlays/drawer.js` (19-31); `.planning/PROJECT.md` (v1.5 scope, v1.4 encryption decisions D-05/D-06/D-58/D-73/D-74/D-77/D-79/D-83).
- Confidence: HIGH throughout — all claims are read from the current tree; scheduler/rotation/audit patterns are sibling-researcher-established and here confirmed against actual call sites.
