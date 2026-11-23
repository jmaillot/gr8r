# Architecture Research — v3.4 Integration Map

**Domain:** Refinement milestone over the existing gr8r architecture (vanilla-JS SPA + hand-rolled server.js)
**Researched:** 2026-11-23
**Confidence:** HIGH — every integration point below is grounded in a file:line read from this repo.

## Existing Architecture (the canvas)

```
┌────────────────────── Client (Vite-bundled ES modules) ──────────────────────┐
│  src/pages/governance.js   src/pages/backup.js   src/pages/settings.js       │
│           │                        │                      │                  │
│  src/actions/actions.js  (single action dispatcher, state in S.ui.*)         │
│           │                                                                  │
│  src/core/api.js  (typed endpoint getters, hasInstanceRole-aware gates)      │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ fetch (sameOrigin + session cookie)
┌──────────────────────────────┴───────────────────────────────────────────────┐
│  server.js (single file, ~12k lines)                                         │
│   • boot: migrations (adapterEnsureColumn, CHECK-rebuild), seeded schedulers │
│   • 60s ticks: runReminderPass (:12170), runBackupSchedulerPass (:12182),    │
│     webhook driver (:12191+)                                                 │
│   • funnels: hasInstanceRole (:5813), capabilitiesFor, isInstanceAdmin       │
│     (:5796), workspacesForUser super-access union (:1274-1291), audit_log    │
│   • routes: /api/auth/operator/instance-roles (:8492), /api/backup/*         │
│     (:8697-9975), /api/keys (:7667), /api/auth/operator/users (:7981)        │
│   • email: reminders_sent claims (:2862) → email_outbox (:2876) →            │
│     transition-only driver (:3351+, kind==='digest' → sendDigest :3401)      │
└──────────────────────────────────────────────────────────────────────────────┘
   root modules (server-only, never imported from src/): export/cron.js,
   export/backup.js, export/s3.js, tz.js
```

Standing invariants every change must respect: zero new dependencies; render-only client (D-23 — the client never derives authority, location, retention or schedule math); i18n ×5 locales in the same commit; keyed refusals; audited mutations inside one `db.tx`; shared-connection tx discipline.

---

## 1. Role-Tabs Roster (Governance)

**Where roles render today:** `rolesCard()` in `src/pages/governance.js:231` — one table row per `instance_roles` GRANT, fed by `api.instanceRoles()` (`src/core/api.js:548`) → `GET /api/auth/operator/instance-roles` (`server.js:8492`), payload `{ roles: [{id, userId, role, grantedBy, grantedAt, userName, userEmail, grantedByName}], recent: [...] }`. The seg control (`S.ui.govSuperSeg`, 'admins' | 'roles') is at `src/pages/governance.js:131-142`; the grant picker (`govRolePick`, :284) searches via `GET /api/auth/operator/users` (`server.js:7981`) — this is the search the milestone calls broken.

**Recommendation: server-side aggregation, one row per user.** Per the D-23 doctrine (server-first, client renders verbatim), reshape the GET payload rather than regrouping grant rows client-side:

```js
// server.js:8500 query changes from "select from instance_roles" to a
// users-anchored join that aggregates roles per user:
{
  users: [{ userId, name, email, isInstanceAdmin: 0|1,
            roles: ['backup_operator', ...],          // grants inside
            grants: [{id, role, grantedBy, grantedByName, grantedAt}] }],
  recent: [...]   // unchanged
}
```

- The `isInstanceAdmin` flag is the implicit Super-Admin membership (Super-Admins auto-hold every role — the funnel at `server.js:5810`, `capabilitiesFor`); carrying it in the payload lets the tabs render Super Admins without new client logic and without a second request.
- Tab counts (Super Admin / Backup Op / Restore Op) derive from `users[]` client-side — that's counting, not authority derivation, so it respects render-only.
- **Keep the POST grant / DELETE revoke routes and their tx + audit discipline untouched** (`server.js:8536`, `:8589`) — only the read shape changes. Revoke continues to target the grant `id` inside `grants[]`.
- The Edit-team-style selectable picker belongs in `src/actions/actions.js` (the grant flow lives at :5577-5653) reusing the token-chip picker idiom already shipped for teams (`src/actions/teams.js`), pointed at `/api/auth/operator/users` with fixed accent-insensitive search.

**Files:** `server.js` (GET reshape ~:8500-8533), `src/core/api.js:548`, `src/pages/governance.js` (rolesCard + new tabs), `src/actions/actions.js` (grant/revoke + picker).

## 2. Unified Run History

**Today:** `GET /api/backup/runs` **requires** `taskId` (`server.js:9167-9175`; `taskId=manual` lists task_id-NULL rows). Per-task history card renders in `src/pages/backup.js:195` (`historyCard`), opened per task via `S.ui.backupHistoryOpen`.

**Recommendation: a new read variant on the same route family — do not touch the frozen per-task GET or `/api/backup/runs/current` (:9125).** Accept "no taskId / `taskId=all`" on the existing GET and add filter params:

```
GET /api/backup/runs?all=1&status=succeeded&scope=workspace:<id>&limit=100
→ { runs: [ ...existing row shape + location (historyChrome :9186)
          + taskName, taskScopeHuman ], total }
```

- Reuse `historyChrome()` verbatim (location derivation is server-side fs membership, D-89-14).
- Join `backup_tasks` for `taskName` and resolve the scope JSON (`backupTaskShape` idiom, `server.js:8692`) into human names — this is where archive naming (point 4) feeds labels, hence the ordering constraint.
- Filters are SQL WHERE clauses on `backup_runs(status, task_id, created_at)` — index `backup_runs_task` (:827) exists; add `status` to the WHERE without a new index at this scale (< 100k rows).
- Client: new unified-history card/section in `src/pages/backup.js` with filter selects bound through `S.ui.*`; extend `api.js` getter (`src/core/api.js` — the runs getter near :548 region).

## 3. Humanized Cron

**Today:** the client NEVER evaluates cron (T-87-11, `src/pages/backup.js:27-30, 326-335` — the builder only emits the raw 5-field string; summary is `summaryCustom` interpolating the raw cron). The single parser is `parseCron()` in `export/cron.js:83`, server-side only, and `src/` cannot import root modules (prohibition test).

**Recommendation: server-side derived display string, never stored.** Add a pure `describeCron(cron, tz)` to `export/cron.js` (it already holds the grammar; the function is a renderer over `parseCron` output — deterministic mapping, no time math). Attach it at read time inside `backupTaskShape` (`server.js:8692`) as `cronHuman` — mirroring the keptPosition precedent: computed per request, never persisted (`server.js:9202`), so a cron edit re-renders truthfully. Client renders `task.cronHuman || task.cron` verbatim. Storing a display string would drift on locale change (×5 locales) — derive per read, localize client-side from a structured payload instead: prefer `{ cronHumanKey: 'weeklyAt', params: { dow: 'Mon', time: '00:00' } }`-style structured fields OR send the canonical English + let i18n keys cover the patterns. Cleanest for i18n: payload carries **structured** description (`kind: 'weeklyAt' | 'dailyAt' | 'monthlyOn' | 'custom'`, plus typed params) and `src/pages/backup.js` maps it through `t()` — no English strings in the payload at all.

**Files:** `export/cron.js` (new pure describer + tests in `test/backup-cron.test.mjs` matrix style), `server.js:8692` (shape), `src/pages/backup.js` (render), `src/locales/*.json` ×5.

## 4. Archive Naming

**Today:** `archiveName(scope, now, meta)` at `export/backup.js:573` → `backup-<kind>-<label|id>-<ts>.tar.gz`; friendly label resolved best-effort from workspace/project names (`:552-569`, `runMeta.label` at `:626` — UAT 2026-11-22 added the slug; `:666` is the known logo junk-name quirk from v3.3 deferred items). Run labels in the UI come from `backup_runs.filename` + the per-task card — there is no independent display-name store.

**Recommendation: enrich `runMeta` in the same file; add the GFS marker at rotation time, not creation time.** Two constraints meet here:
- At run creation, the GFS bucket is unknown — `assignGfsBuckets` runs in the rotation pass over *succeeded* runs (`server.js:3846+`), after the file is written. Putting `daily`/`monthly` into the filename at creation is impossible without reordering the pipeline.
- Therefore: (a) widen the label — instance label + workspace name + project name fully resolved server-side in `runMeta` (today it's best-effort and empty on failure, `:626`); (b) GFS marker lands **where truth lives**: persist `gfs_bucket` on the `backup_runs` row when the rotation pass assigns it (additive `adapterEnsureColumn`, `server.js:1001-1009` idiom), and append the marker to the **UI label and the stored filename via the existing rotation-deletion preview machinery**, not by renaming files on disk (renaming breaks S3 keys + sidecar checksum files `:765`).

Honest split: filename = instance/workspace/project + timestamp (rename-free, GFS-free); UI labels = filename-derived + `gfs_bucket` badge ("monthly"). The milestone's "marqueur GFS" is satisfied in labels; if the owner insists on in-filename markers, that is a STOP-and-justify (S3 key churn, checksum sidecar rewrite, restore-path assumptions at `export/backup.js:17`).

**Files:** `export/backup.js` (`runMeta` :626, `archiveName` :573, label resolution :552-569), `server.js` (rotation pass ~:3846-4013 + ensureColumn), `src/pages/backup.js` (badge render). **This lands before Phase-2's unified history**, because history labels derive from it.

## 5. Digest Dedup (4× digest bug)

**Today's send path:** boot catch-up + 60s tick (`server.js:12170-12173`) → `runReminderPass({now})` (`:2644`) → per-workspace block → per-recipient digest loop (`:2815`) → insert-or-ignore claim `reminders_sent(dedup_key = '<ws>:<user>:digest:<localDate>')` (`:2862`) inside `db.tx` → one `email_outbox` row per claim in the SAME tx (`:2876-2890`, dedup token `digest:<ws>:<user>:<date>`) → outbox driver picks it up, `kind === 'digest'` → `MAILER.sendDigest` (`:3401`), with the existing transition-only gate.

**Where the guard belongs — hypotheses ranked by the code:**
1. **localDate drift**: the claim key embeds the recipient's *doc-member tz* resolved per pass (`:2824`, `resolveTz(doc.data.members[].tz)`). A member whose tz entry is missing/unstable flips between `Europe/Paris` fallback and their real tz across passes → two distinct claim keys in one day → two outbox rows → 4× if several flips. Guard: stabilize tz resolution (persist the resolved zone or read `users`-side tz), and/or widen the claim to one-per-user-per-UTC-day with the window check unchanged.
2. **Claim succeeds, outbox rows multiply**: if anything re-enters the digest branch after a claim (retry path, manual trigger at `:6001` via `POST` test route), the `insert or ignore` protects but the *outbox insert* (:2876) sits inside the same tx only when claimed — verify no second insert site. Audit: grep shows the outbox digest insert is single-site.
3. **Outbox retry without idempotency**: the driver's transition-only gate should prevent resend; confirm the digest claim's outbox row can't re-enter `queued` after a SMTP timeout (the known SMTP-retry semantics).

**Fix shape: a dedup guard in `runReminderPass` at claim time (site 1), plus an assertion test** — do NOT add a client or outbox-level filter; the claim table is the exactly-once authority (Phase 38 D-01/D-02). Milestone explicitly scopes this as investigation + fix with a pinned test ("avec test épinglé") — a `test/` regression proving 4 passes in one window produce exactly 1 outbox row.

**Files:** `server.js:2815-2925` (claim + tz resolution), `:3401` (verify only), new regression test.

## 6. Revoked-Key Purge (api_keys)

**Today:** revoke sets `revoked_at` (`server.js:7740`), rows are never deleted; `GET /api/keys` (:7670) returns **all** rows including revoked, and `src/pages/settings.js:828-839` renders them with a `revoked` amber badge.

**Recommendation: hide-then-purge (soft-hide in payload + hard delete sweep), not a schema flag.** The `revoked_at` column IS the hide flag already. Concretely:
- `GET /api/keys` filters to `WHERE revoked_at IS NULL` in the list (or returns them but the milestone goal "purge des clés révoquées" implies removal — filtering the list is the UI-honest half).
- Hard delete is safe: MCP auth (:11907+) checks the hash of live keys only — deleting a revoked row cannot resurrect access; there is no FK consumer of `api_keys.id` beyond auth. So a purge is lossless.
- Purge placement: ride the **existing session/challenge sweep tick** (`server.js:12145-12148` pattern) with a new `sweepRevokedApiKeys()` — delete rows `revoked_at < now - 7d` (7-day grace matches the webhook outbox retention precedent, D-07). Zero new schema, zero migration.

**Files:** `server.js` (:7670 list filter, new sweep + tick registration ~:12148), `src/pages/settings.js:828` (render already handles absence), `src/locales/*.json` (none needed if no copy change).

## 7. Cross-Workspace Scope Listing (operator bypass)

**Today:** the only all-workspaces bypass is the **super-access union** in `workspacesForUser` (`server.js:1282-1290`): `is_instance_admin && SUPER_ACCESS` unions every workspace as pseudo-`owner`. Backup/Restore Operators holding only `instance_roles` do NOT pass that gate, so the Backup/Restore pickers (task scope kind `workspace`/`project`) see only real memberships.

**Recommendation: an operator-scoped listing endpoint, NOT a widening of `workspacesForUser`.** Widening the union would leak all workspaces into the sidebar switcher and every membership-driven surface — the milestone restricts the bypass to Backup/Restore pickers *only*. Concretely: extend the capability-gated backup surface — e.g. `GET /api/backup/scopes` (or piggyback on `GET /api/backup/tasks` :8697) returning `{ workspaces: [{id, name, slug}], projects: [{id, name, workspaceId}] }` behind the exact existing guard `hasInstanceRole(user.id, CAP.BACKUP_MANAGE) || hasInstanceRole(user.id, CAP.RESTORE_USE)` (:8703 pattern). Names resolved server-side (D-23), fail-closed 403 for everyone else, refusal keyed + audited like the existing `backupRoleRequired`.

**Files:** `server.js` (new listing near :8697; never touch `:1282`), `src/core/api.js` (getter), `src/pages/backup.js` (scope pickers feed from it), restore page scope browse likewise.

---

## Data Flow (new/changed)

```
instance-roles GET  ──reshape──▶ { users[{roles[], isInstanceAdmin}] } ──▶ governance tabs
backup tasks GET    ──+cronHuman(structured)+ names──▶ backup table / edit prefilled
backup runs GET(all)──+taskName+scopeHuman+location──▶ unified history + filters
runReminderPass     ──stable tz──▶ single claim ──▶ 1 outbox row ──▶ 1 digest email
rotation pass       ──+gfs_bucket column──▶ UI labels (never filename churn)
api_keys sweep      ──delete revoked>7d──▶ settings list stays honest
backup scopes GET   ──operator-gated all-workspaces──▶ Backup/Restore pickers only
```

## Build Order (dependency-resolved)

**Phase A — Digest dedup fix (independent, highest user pain).**
Investigation + claim-site guard + pinned regression test. No dependency on anything else; ships first as its own small phase.

**Phase B — Server payload contracts (the foundation phase).**
All read-shape changes in one phase, client untouched:
1. instance-roles aggregation (:8500), 2. `describeCron` + `cronHuman` in `backupTaskShape` (:8692), 3. task/scope name resolution server-side, 4. **archive naming + `gfs_bucket`** (`export/backup.js` + rotation pass), 5. unified runs route (depends on 3+4 for labels), 6. `GET /api/backup/scopes`.
Rationale: every Phase-C/D client change renders from these payloads; naming lands before unified history labels consume it.

**Phase C — Governance UX.**
Tabs per role, rename to "Instance Roles", per-user rows + cumulative badges, Edit-team-style picker (fixes broken grant search). Depends on Phase B.1 only — can run parallel with Phase D.

**Phase D — Backup console UX.**
Edit pre-filled with current cron + header placement, monthly/annual retention fields, tasks table with Next run + Last run + status, humanized schedule, workspace/project names, unified multi-task history with filters, Run-now manual-retention hint. Depends on Phase B.2–B.6.

**Phase E — Settings polish + cross-workspace pickers.**
API-keys purge (independent of B — could slot earlier), My Access columns/icon view, one-line Workspace URL, teams picker in Invite Member, Backup/Restore cross-workspace pickers (depends on B.6). Settings items are independent and can be split off if the phase gets heavy.

**Dependency graph:** A ∥ (B → {C, D, E-backup-pickers}); E-settings ∥ everything.

## Anti-Patterns to Avoid (repo-specific)

1. **Client-side cron or retention math** — violates T-87-11/D-90-12 render-only doctrine; the builder precedent (`src/pages/backup.js:326`) already shows the correct shape.
2. **Renaming archive files on disk for GFS markers** — breaks S3 keys, checksum sidecars (`export/backup.js:765`) and restore assumptions (:17).
3. **Widening `workspacesForUser` union for backup operators** — leaks all workspaces into the switcher; the bypass must stay scoped to the capability-gated backup surface.
4. **Storing humanized schedule strings** — locale drift ×5; carry structured fields, localize at render.
5. **New scheduler/interval for the digest guard or key purge** — ride the existing ticks (`server.js:12145-12189` house rules: try/catch + `.catch` + `unref()`).
6. **Second cron parser** — `export/cron.js` is the only grammar owner; the describer extends it, never forks it (Pitfall 6 precedent).

## Integration Points Summary

| # | Feature | Server file:line | Client file | New vs modified |
|---|---------|------------------|-------------|-----------------|
| 1 | Role tabs | `server.js:8492-8533` | `src/pages/governance.js:231`, `src/actions/actions.js:5577`, `src/core/api.js:548` | Modified (read shape) + new tabs |
| 2 | Unified history | `server.js:9167` (new variant) | `src/pages/backup.js:195` | New route variant + new UI section |
| 3 | Humanized cron | `export/cron.js` + `server.js:8692` | `src/pages/backup.js:335` | New pure fn + shape field |
| 4 | Archive naming | `export/backup.js:552-626,573`; `server.js:3846+` | `src/pages/backup.js` badges | Modified + additive column |
| 5 | Digest dedup | `server.js:2815-2925` (+ `:3401` verify) | — (server-only) | Fix + regression test |
| 6 | Key purge | `server.js:7670`, `:7740`, new sweep near `:12148` | `src/pages/settings.js:828` | Filter + new sweep |
| 7 | Scope listing | `server.js:8697` area (new); `:1282` UNTOUCHED | `src/pages/backup.js` pickers | New endpoint + picker feed |

## Sources

- Direct reads: `server.js` (:1274-1291, :2644-2925, :3351-3401, :5796-5813, :7640-7745, :7981, :8692-8711, :8488-8608, :9157-9211, :12145-12189), `src/pages/governance.js`, `src/pages/backup.js`, `src/pages/settings.js`, `src/core/api.js`, `src/actions/actions.js`, `export/cron.js`, `export/backup.js`
- `.planning/PROJECT.md` (v3.4 goals, v3.3 shipped record + deferred items)

---
*Architecture research for: gr8r v3.4 UX Polish & Backup Console Refinement*
*Researched: 2026-11-23*
