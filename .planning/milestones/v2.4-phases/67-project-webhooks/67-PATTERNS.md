# Phase 67: Project Webhooks - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 11 (new + modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/webhook-events.js` (new) | utility (pure) | transform / event-driven | `src/core/subtree.js` | exact (same discipline, Phase 65) |
| Webhook delivery engine (new server module: enqueue + claim + retry pass) | service | event-driven, batch | `runReminderPass` + claim, `server.js:2091-2290, 7822-7833` | exact |
| SSRF guard module (new) | utility | request-response | `oidc.js` fail-closed fetch discipline + research skeleton | role-match (new concern) |
| Teams formatter (new, pure) | utility | transform | `src/core/subtree.js` discipline + `src/export/model.js` pattern | role-match |
| Hook CRUD routes (server.js) | route | request-response CRUD | `saved_views` PUT/DELETE, `server.js:4836-4905`; `push_subscriptions` mass-assignment guard `:402-417` | exact |
| Schema DDL: `webhook_hooks`/`webhook_deliveries`/claims (server.js + db-adapter.mjs) | migration | CRUD | `reminders_sent`/`push_subscriptions`/`api_keys` DDL `server.js:381-458`; `PG_CONFLICT_TARGETS` `db-adapter.mjs:44-48` | exact |
| `users.oid` column + OIDC callback write (D-13) | migration | CRUD | `users` DDL `server.js:237-250`; `oidc_identities` `:272-281`; OIDC callback `server.js:4225-4450` | exact |
| projectSettings "Webhooks" section (src/overlays/modals.js + lazy chunk) | component | CRUD (UI) | `projectSettingsModal` `src/overlays/modals.js:344-374`; checkbox list pattern `exportModal` `:382-435` | exact |
| `src/locales/en.json`, `fr.json` | config | transform | `build-locales.test.mjs` gate (existing) | exact |
| `test/webhook-*.test.mjs` (new, 4 files) | test | — | `test/due-reminders.test.mjs`, `test/copy-sqlite-to-pg.test.mjs` | exact |
| `67-SECURITY.md` (new) | doc | — | `.planning/milestones/v2.0-phases/52-transparency-view-milestone-verification-sweep/52-SECURITY.md` | exact (format mandated by research) |

## Pattern Assignments

### `src/core/webhook-events.js` (pure module, event diff + envelope whitelist)

**Analog:** `src/core/subtree.js` (lines 1-30) — the Phase 65 zero-import pure-module discipline, consumed by BOTH server and client.

**Header/discipline pattern** (lines 1-9):
```js
/* =====================================================================
   SUBTREE — Phase 65 (65-01) — pure, DOM-free subtask-tree helpers.
   =====================================================================
   The one shared definition of subtask-tree ordering and normalization,
   consumed by the server funnel (normalizeSubtasks sink), the client
   actions and the browser bundle. Mirrors the src/export/model.js
   discipline: NO IMPORTS AT ALL, no DOM access, plain comparators only
   (never localeCompare) so ordering is byte-identical across hosts.
   ===================================================================== */
```

**Diff-shape pattern:** `diffWebhookEvents(storedDoc, next)` must reuse the exact Map-building approach of `logDocChanges` (`server.js:2348-2402`), run AFTER `docFromClient` returns `next` (both sides canonical):
```js
const beforeTasks = new Map(
  (Array.isArray(storedDoc?.data?.tasks) ? storedDoc.data.tasks : [])
    .filter(t => t?.id)
    .map(t => { const copy = { ...t }; normalizeTaskAssignees(copy, memberIds); return [t.id, copy]; }),
);
const afterTasks = (Array.isArray(next?.data?.tasks) ? next.data.tasks : []).filter(t => t?.id);
const afterIds = new Set(afterTasks.map(t => t.id));
```
Whole function wrapped in try/catch ("never fail a doc push over logging" — same fail-absent contract for the diff, `:2399-2401`).

**Whitelist precedent:** the constant-table whitelist shape of `NOTIF_PREF_DEFAULTS` / `NOTIF_PREF_KEYS` (`src/core/notifPrefs.js:23-45`) — a code-defined, auditable key list per event (D-01).

---

### Delivery engine (enqueue + claim + retry pass) (service, event-driven)

**Analog:** `runReminderPass` claim sites, `server.js:2091-2290` + scheduler `:7822-7833`.

**Exactly-once claim pattern** (claim BEFORE send, INSERT OR IGNORE, `:2172`, schema `:381-390`):
```js
/* REM-03: exactly-once reminder ledger. One row per (workspace, task, assignee,
   offset, due date) — the dedup key carries the due date, so editing a due
   date re-arms the reminder. Claimed with INSERT OR IGNORE inside the same
   transaction that appends the notification row. */
create table if not exists reminders_sent (
  dedup_key    text primary key,
  workspace_id text not null,
  created_at   integer not null
);
// claim site:
const r = await db.run('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)', [...]);
```
**Anti-pattern (Phase 38 invariant):** never mark-then-send — claim first, send after.

**Scheduler tick house rules** (`server.js:7822-7833`) — copy verbatim for the webhook retry pass:
```js
await runReminderPass();
setInterval(() => {
  runReminderPass().catch(err => logWarn(`reminder tick: ${err.message}`));
}, 60_000).unref();
```
Comment contract: "try/catch inside the interval callback is mandatory — an uncaught throw in a setInterval callback kills the process. unref() keeps the timer from holding the event loop open." The pass must ALSO carry try/catch inside AND `.catch` on the promise.

**Collect-in-tx / fire-after-commit** (`server.js:5935-5979`) — the emission point for 7 of 8 events:
```js
/* P4-f: notifications ... Diffed against the stored doc so each row emails
   exactly once. Collected now, sent after the commit — the response
   must never wait on SMTP. */
const newNotifs = (Array.isArray(next?.data?.notifs) ? next.data.notifs : []).filter(n => n?.id && !storedNotifIds.has(n.id));
// ... inside db.tx, return { row, storedDoc, next, ..., newNotifs, t };
// AFTER tx resolves, before response flush:
if (MAILER.enabled && newNotifs.length) await queueNotifEmails(row, next, newNotifs);
if (PUSH.enabled && newNotifs.length) await sendPushFor(row, next, newNotifs);
```
The webhook twin: diff inside `db.tx` at `:5918-5955`, claim rows inside the same tx, deliver fire-and-forget next to `queueNotifEmails`/`sendPushFor` at `:5972-5979`.

**Outbound HTTP + timeout** (`oidc.js:28-31, 126-130`) — house rule to copy:
```js
const FETCH_TIMEOUT_MS = 10_000;
async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`oidc fetch failed: ${res.status}`);
  return res.json();
}
```
"Every outbound fetch carries AbortSignal.timeout(10_000) … every expected failure returns a fail-closed { ok:false, reason } — never a throw the callback could accidentally turn into a 500."

---

### SSRF guard module (utility, per-delivery)

**Analog:** `oidc.js` header/comment + fail-closed style (lines 1-43) — zero-dep, server-only (NOT under src/, same rule as totp.js/mailer.js: "Server-side only: NOT under src/ so Vite never bundles server crypto"). Use the research skeleton (67-RESEARCH.md Code Examples §SSRF guard skeleton): `node:dns/promises` lookup per attempt, deny loopback/10/172.16-31/192.168/169.254/0 + IPv6 `::1`, `fe[89ab]`, `f[cd]`; `redirect: 'error'`. No existing analog — this is new, but keep the oidc.js comment contract style (env/behavior contract block at top, fail-closed returns).

---

### Teams formatter (utility, pure transform)

**Analog:** `src/core/subtree.js` discipline (NO IMPORTS, byte-identical across hosts, header contract block). Payload shapes come from 67-RESEARCH.md Code Examples (adaptive card envelope + `msteams.entities` mention + HMAC header) — those are the reference, not in-repo code. Truncation: measure `Buffer.byteLength(JSON.stringify(fullPayload))` after formatting (Pitfall 4).

---

### Hook CRUD routes (route, request-response)

**Analog:** `saved_views` PUT/DELETE, `server.js:4836-4905` — the closest mirror-table CRUD route family.

**Route validation + byte-cap + 409 pattern** (lines 4836-4858):
```js
const name = body?.name == null ? '' : String(body.name).trim();
if (name.length > NAMED_VIEW_NAME_MAX) return fail(res, 400, 'invalidViewName', 'Invalid view name');
if (Buffer.byteLength(blobStr, 'utf8') > NAMED_VIEW_BLOB_MAX_BYTES) {
  return fail(res, 413, 'viewBlobTooLarge', 'Saved view is too large (2 kB max)');
}
if (dup && dup.name !== name) return fail(res, 409, 'viewNameConflict', 'A view with this name already exists');
```
Workspace-membership resolution pattern (`:4841-4844`): look up ws + membership, 404 if absent — hooks will additionally gate on `projectPermFor`/`canManageProject` (owner/admin/leader).

**Mass-assignment guard** (push_subscriptions comment, `:402-407`): "user_id and workspace_id always come from the session (mass-assignment guard)" — hook `workspace_id`/`project_id`/`created_by` must come from ctx, never the body.

**Server gate = the control:** `canManageProject` (server.js:1037) / `projectPermFor` (`:1057-1059`) — UI gating is UX only (T-52-02 precedent).

**Show-once secret** (`api_keys` contract comment, `:437-456`):
```
Only the sha256 hash is stored — the raw psk_live_ key is shown exactly once at creation …
'prefix' carries the first chars for display/leak-scanning, never enough to reconstruct.
```
Note (research Pattern 5): unlike api_keys, webhook_hooks MUST store the plaintext secret server-side (needed to sign); show-once applies to the CLIENT surface only — never in docForClient, client payloads, or log lines (log host only — the Workflows URL is itself a bearer secret).

---

### Schema DDL (migration, SQLite+pg same commit)

**Analog:** schema block `server.js:381-458` (annotated CREATE TABLE IF NOT EXISTS with phase/decision references), pg twin + dialect map `db-adapter.mjs:44-48`:
```js
const PG_CONFLICT_TARGETS = {
  user_notif_prefs: '(workspace_id, user_id)',
  saved_views: '(workspace_id, user_id, key, name)',
  push_subscriptions: '(endpoint)',
};
```
Checklist (research): SQLite DDL → server.js schema block; pg DDL → db-adapter.mjs; add PG_CONFLICT_TARGETS entries for any unique/conflict target; check `test/copy-sqlite-to-pg.test.mjs` table list.

**`users.oid` additive column (D-13):** `users` DDL at `server.js:237-250`; only one `alter table` precedent exists (`server.js:533`, invites rebuild) — use an idempotent guarded `alter table users add column oid text` at boot (additive create-if-not-exists style of totp_factors `:251-266`). Write site: OIDC callback `server.js:4225-4450` (single site); `oidc_identities` (`:272-281`) is the issuer+subject join precedent. Never expose `oid` in any client payload.

---

### projectSettings "Webhooks" section (component, CRUD UI)

**Analog:** `projectSettingsModal`, `src/overlays/modals.js:344-374` — the exact D-08 home (Phase 55 precedent).

**Tab pattern** (lines 353-365):
```js
export function projectSettingsModal(m, H) {
  const p = proj(m.id);
  if (!p) return H(t('err.projectNotFound'));
  const tab = S.ui.settingsTab === 'access' ? 'access' : 'general';
  const tabBar = `<nav class="tabs" role="tablist" ...>${[
    ['general', 'modal.settingsTabGeneral'],
    ['access', 'modal.settingsTabAccess'],
  ].map(([k, key]) =>
    `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-a="settingsTab" data-v="${k}">${t(key)}</button>`).join('')}</nav>`;
```
A third tab (or section) keys off `S.ui.settingsTab`; tab state rides `S.ui`, seeded by the open action.

**Checkbox-list pattern** (D-09 event filter, `exportModal` `:422-425`):
```js
const includeList = EXP_OPTIONS.map(([key, icon]) =>
  `<label class="xinc ${opts[key] ? 'on' : ''}"><input type="checkbox" data-in="exportOption" data-key="${key}" ${opts[key] ? 'checked' : ''}>${ic(icon, 14)}<span class="grow">${t('export.option.' + key)}</span>${ic('check', 14)}</label>`).join('');
```
**Guard + lazy-load pattern** (`:391, :396-399`): render-time `canManageProject(p)` re-check ("so a tampered DOM cannot post for a non-manager"); lazy module loaded into `S.ui` before render (`S.ui.expMod?.buildExportModel` pattern) — the Webhooks section must lazy-load the same way (500 kB chunk gate, ~2 kB headroom).

---

### Tests (`test/webhook-*.test.mjs`)

**Analog:** `test/due-reminders.test.mjs` (claim/reminder logic, node --test), `test/copy-sqlite-to-pg.test.mjs` (extend for new tables), `test/db-adapter.test.mjs` (dialect parity). Framework: `node --test --test-concurrency=2 test/*.test.mjs` (package.json:19); no config file. SSRF tests must be network-free (fake IP lists). Chunk + i18n gates: `test/build-chunk-size.test.mjs`, `test/build-locales.test.mjs` (existing — extend, don't rewrite).

---

### Threat model (67-SECURITY.md)

**Analog format mandated by research:** `.planning/milestones/v2.0-phases/52-transparency-view-milestone-verification-sweep/52-SECURITY.md:1-15` (front-matter `threats_open: 0`, `asvs_level: 1`) + Threat Register format `:33-41` (T-67-xx ids, severity, disposition, mitigation, status, file:line citations).

---

## Shared Patterns

### Fail-absent / never-fail-the-PUT
**Source:** `server.js:2399-2401` (logDocChanges), `:5973-5979` (fire-and-forget fan-outs), oidc.js:29-31 (fail-closed returns)
**Apply to:** diff, enqueue, delivery engine — errors logged, the doc PUT and response flush never wait or fail.

### Exactly-once claim before send
**Source:** `server.js:381-390, 2172, 2272`
**Apply to:** webhook deliveries AND the due.reminder emission (reuse reminders_sent-style dedup — Pitfall 3: reminder + webhook claims must not double-fire).

### Server-first gating
**Source:** `projectPermFor` `server.js:1057-1059`, `canManageProject` `:1037`, `memberCanReadProject` `:984-989`
**Apply to:** all hook CRUD routes (owner/admin/leader) and to envelope building (WHK-03: only fields `memberCanReadProject` would expose).

### Zero new dependencies
**Source:** oidc.js (node:crypto + global fetch), REQUIREMENTS.md:46-47; pinned by `test/dependencies.test.mjs`
**Apply to:** everything — HMAC = `createHmac('sha256', secret)`, HTTP = fetch + `AbortSignal.timeout(10_000)`, DNS = `node:dns/promises`.

### Secret hygiene
**Source:** `api_keys` comment `server.js:437-456`; push_subscriptions mass-assignment guard `:402-417`
**Apply to:** hooks never enter the doc/docForClient; secrets + URLs never logged (log host + delivery id + status code only).

### i18n EN+FR same commit
**Source:** existing `src/locales/` + `test/build-locales.test.mjs` gate
**Apply to:** all webhook.* UI keys (D-09).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| SSRF guard module | utility | request-response | First outbound-URL-fetch feature in repo — oidc.js is the closest discipline, but the DNS-resolve deny-list is new (use research skeleton) |
| Teams formatters (3 formats) | utility | transform | Payload shapes come from MS Learn (research Code Examples), not in-repo code |

## Metadata

**Analog search scope:** `server.js`, `db-adapter.mjs`, `oidc.js`, `src/core/`, `src/overlays/`, `src/core/notifPrefs.js`, `test/`
**Files scanned:** ~20; deep-read 10 analog regions
**Pattern extraction date:** 2026-11-15
