---
phase: 92-server-payload-contracts
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server.js
  - export/gfs.js
  - export/cron.js
  - export/backup.js
  - db/db-adapter.mjs
  - test/backup-routes.test.mjs
  - test/backup-scopes.test.mjs
  - test/backup-export.test.mjs
  - test/backup-rotation.test.mjs
  - test/gfs-kept-until.test.mjs
  - test/backup-cron.test.mjs
autonomous: false
requirements: [BKNAME-01, BKNAME-02]
user_setup: []

estimate:
  tokens: 130000
  raw_tokens: 100000
  tasks: 6
  confidence: low

must_haves:
  truths:
    - Archive filenames and run labels read `<instance-name>-<scope>-<slug>-<gfs>-<date>` with names resolved server-side; manual runs carry no GFS marker (BKNAME-01, D-01/D-03)
    - Collision suffix `-2`/`-3` lands before `.tar.gz` and the sha256 sidecar is written from the FINAL uniquified filename; archives are never renamed (D-01)
    - Exactly one pure GFS function (export/gfs.js) feeds naming, rotation, gfsKeptPositions, and backfill; new runs store gfs_bucket at creation and rotation reads the stored column (BKNAME-02, D-02)
    - gfs_bucket column exists on SQLite AND Postgres in the same commit; backfill sweep is idempotent over `where gfs_bucket is null` (D-02)
    - describeCron returns `{kind, weekday?, hour?, minute?, raw}` derived from parseCron output only, no server-side translations; backupTaskShape carries the descriptor (D-04)
    - Legacy `GET /api/backup/runs` responses are byte-identical (golden differential test green); `?all=1` serves filtered cross-task history with fail-closed per-run scope checks (D-05)
    - `GET /api/backup/scopes` is gated Super Admin ∨ Backup Op ∨ Restore Op and returns `{workspaces:[{id,name,slug}]}`; `workspacesForUser` is byte-unchanged (D-06)
  artifacts:
    - export/gfs.js
    - export/cron.js describeCron export
    - backup_runs.gfs_bucket column (dual-engine)
    - GET /api/backup/runs?all=1 branch (server.js ~9238–9245)
    - GET /api/backup/scopes route
    - test/backup-scopes.test.mjs
    - golden legacy-response snapshot test in test/backup-routes.test.mjs
  key_links:
    - run insert → assignGfsBuckets([...priorSucceededAsc, newRow]) with `created_at asc, id asc` tiebreak → stored gfs_bucket
    - rotation pass → reads stored gfs_bucket (no re-derivation)
    - archiveName uniquified final name → completeRun (:179) sidecar
    - `?all=1` branch FIRST in the frozen route, legacy branch untouched
---

<objective>
Phase 92: Server Payload Contracts — server-only groundwork for client phases 93–95. Deliver GFS-marked archive naming with instance names and collision suffixes (D-01/D-03), the single pure GFS module with bucket-at-creation persistence plus dual-engine `gfs_bucket` column and idempotent backfill (D-02), the structured cron descriptor (D-04), the `?all=1` unified runs variant on the frozen route with golden byte-identity (D-05), and the operator-gated scopes endpoint (D-06).

Purpose: Phases 93–95 render these contracts verbatim; the client derives nothing.
Output: Working server code + green extended test suite; 92-VALIDATION.md per-task map filled.

Per plan_constraints: instance name = `GR8R_INSTANCE_NAME` env var with slugified hostname fallback (D-03, ruling 2026-11-24). Zero new dependencies. No archive format change (D-86 frozen). No app i18n keys this phase (client t() keys are Phase 94).
</objective>

<execution_context>
@~/.config/opencode/gsd-core/workflows/execute-plan.md
@~/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/92-server-payload-contracts/92-CONTEXT.md
@.planning/phases/92-server-payload-contracts/92-RESEARCH.md

# Source anchors (verified in 92-RESEARCH.md, HIGH confidence)
server.js:3950–3994 (isoWeekKey + assignGfsBuckets — verbatim relocation source)
server.js:4009–4079 (gfsKeptPositions, runBackupRotationPass — consumers to rewire)
server.js:795–830 (SQLITE_SCHEMA backup_runs precedent — additive column, no trailing `;` on comment lines)
server.js:8770 (backupTaskShape — gains descriptor field)
server.js:9238–9301 (frozen GET /api/backup/runs — D-05 target)
server.js:1282 (workspacesForUser — byte-unchanged mandate)
server.js:5874–5940 (hasInstanceRole / isInstanceAdmin / CAP)
server.js:6131–6151 (test-only rotation route + BACKUP_TEST_TOKEN)
export/backup.js:179 (completeRun sidecar site), :534–582 (filename builder + slugify + scopeLabel)
export/cron.js:83–102 (parseCron sets + domRestricted/dowRestricted)
db-adapter.mjs:995–1007 (ensureColumn dual-engine)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wave 0 — golden legacy snapshot, scopes test scaffold, pinned GFS date tests</name>
  <files>test/backup-routes.test.mjs, test/backup-scopes.test.mjs, test/gfs-kept-until.test.mjs</files>
  <action>
  1. In test/backup-routes.test.mjs, add a golden differential test: start the server via the existing `startServer`/`withDb` harness (test/helpers/server.mjs), seed succeeded + failed + manual runs across ≥2 tasks, call `GET /api/backup/runs?taskId=…` as an authorized user, and snapshot the FULL response body to a fixture file (e.g. test/fixtures/backup-runs-legacy-golden.json). The test asserts deep-equality against the fixture — it must be GREEN on the untouched route BEFORE Task 5 modifies it, and stays the byte-identity gate after. Capture the fixture from the live first run (write the fixture in the same commit as the test only after asserting the response matches current route behavior by inspection — do not snapshot a broken response).
  2. Create test/backup-scopes.test.mjs: scaffold using the same harness, with (for now) a placeholder test asserting the route does not exist yet (expect 404) — it flips to real assertions in Task 6. Include the operator-grant helper copied from backup-rotation.test.mjs `makeBackupOp` pattern (POST /api/auth/operator/instance-roles).
  3. In test/gfs-kept-until.test.mjs (or a new test/gfs-pure.test.mjs if cleaner), add pinned unit tests against the CURRENT server.js functions (import or replicate via the test route): ISO nearest-Thursday boundaries — Wednesday (belongs to previous week), Thursday, Sunday (same ISO week); year rollover Dec 29–31 → W01 of next year; Jan 1 → correct isoYear; DST-irrelevance note (pure UTC). These tests keep passing unchanged after Task 2 relocates the functions — they are the verbatim-relocation guard.
  <behavior>
    - Golden fixture test green pre-change; stays green through Tasks 2–4; catches any legacy drift in Task 5.
    - Scopes scaffold asserts 404 pre-Task 6.
    - Pinned date tests green against current implementation and re-verified green after export/gfs.js extraction.
  </behavior>
  </action>
  <verify>
    <automated>node --test test/backup-routes.test.mjs test/backup-scopes.test.mjs test/gfs-kept-until.test.mjs</automated>
  </verify>
  <done>Golden fixture exists and passes; scopes scaffold 404 test passes; pinned ISO-week/year-rollover unit tests pass against the current pure functions.</done>
</task>

<task type="tracer">
  <name>Task 2: export/gfs.js extraction + gfs_bucket storage end-to-end (one vertical slice)</name>
  <files>export/gfs.js, server.js, db/db-adapter.mjs, test/backup-rotation.test.mjs, test/db-adapter.test.mjs</files>
  <action>
  One path through every layer: pure module → DDL → bucket-at-creation → backfill → rotation read.
  1. Create export/gfs.js (zero imports, matching cron.js discipline) and RELOCATE VERBATIM `isoWeekKey` (server.js:3950) and `assignGfsBuckets` (server.js:3968) — no logic edits. Export both, plus `gfsBucketFor(priorSucceededAsc, newRow)` implemented by calling `assignGfsBuckets([...priorSucceededAsc, newRow])` and returning the last entry — zero new math, exactly one definition. Rewire ALL current consumers in server.js (`gfsKeptPositions` :4009, `runBackupRotationPass` :4047, rotation-preview dry-run ~:9311) to import from export/gfs.js in this commit. The Task-1 pinned date tests must pass unchanged.
  2. Add `gfs_bucket` to backup_runs: append the column to SQLITE_SCHEMA as nullable TEXT with no default (null = not-yet-backfilled marker; matches `uploaded`/`checksum_ok` precedent server.js:803 area — comments must never end a line with a semicolon, runSchema splits on ';-newline'), let `pgSchemaVariant` derive pg DDL, and add boot-time `ensureColumn('backup_runs','gfs_bucket', …)` in db-adapter.mjs (precedent :995–1007). Same commit for both engines (BKNAME-02).
  3. Bucket-at-creation (D-02): at the succeeded-run insert/complete site (writeBackupRunRow :3592–3821 region), query the task's prior succeeded runs ordered `created_at asc, id asc` (IDENTICAL tiebreak to rotation, Pitfall 1) and store `gfsBucketFor(...)` on the new row. NULL bucket stays legal only for non-succeeded runs.
  4. Backfill sweep (D-02): at boot after ensureColumn, per task, idempotent `update backup_runs set gfs_bucket = ? where id in (…)` over succeeded rows where `gfs_bucket is null`, calling the shared `assignGfsBuckets` — same function, same ordering. Document in code as migration-not-mutation (not audit-funnel).
  5. Rotation switch: `runBackupRotationPass` READS stored `gfs_bucket` and never re-derives from created_at. Defensive fallback: if a succeeded row's bucket is unexpectedly NULL at read time, run the per-task backfill inline for that task (keeps one definition; no duplicate math).
  6. Extend test/backup-rotation.test.mjs: seeded two runs at identical created_at asserting the stored bucket matches batch derivation (same-second tiebreak pin, Pitfall 1); extend test/db-adapter.test.mjs (or migration.test.mjs) for dual-engine column presence + idempotent backfill (run sweep twice, second is a no-op).
  This is the D-02 one-way data migration → the checkpoint below gates it.
  </action>
  <verify>
    <automated>node --test test/backup-rotation.test.mjs test/gfs-kept-until.test.mjs test/db-adapter.test.mjs test/migration.test.mjs</automated>
  </verify>
  <done>export/gfs.js is the single definition; new succeeded runs store gfs_bucket at creation; backfill is idempotent and dual-engine; rotation reads the stored column; pinned date tests pass unchanged.</done>
</task>

<task type="checkpoint:decision" gate="blocking-human">
  <name>Checkpoint: gfs_bucket backfill migration gate</name>
  <action>Before committing the backfill sweep (Task 2 step 4 touches existing rows — one-way data migration per D-02): confirm with the owner that the boot-time idempotent `where gfs_bucket is null` backfill over succeeded runs may run automatically at deployment. Additive nullable column, benign degradation (NULL reads fall back to inline per-task backfill), but the write to historical rows is irreversible without restore. Proceed on approval; skip this gate only if the orchestrator already carries a waiver for D-02.</action>
  <verify><automated>echo "checkpoint resolved"</automated></verify>
  <done>Owner approves (or waives) the deployment-time backfill write to existing backup_runs rows.</done>
</task>

<task type="auto">
  <name>Task 3: Archive naming — instance name, GFS marker, collision suffix, run labels</name>
  <files>export/backup.js, server.js, test/backup-export.test.mjs</files>
  <action>
  BKNAME-01 / D-01 / D-03, all at the naming stage (archives never renamed post-creation):
  1. Instance name (D-03): read `process.env.GR8R_INSTANCE_NAME`; when unset, fall back to the machine hostname slugified via the existing `slugify` (export/backup.js:543). Resolve ONCE per export run (Pitfall 5 — not per path join).
  2. Filename builder (`archiveName` :573–582): emit `<instance-name>-<scope>-<slug>-<gfs>-<date>` for scheduled runs, where `<gfs>` is the stored `gfs_bucket` of the run row; `<scope>` comes from `scopeLabel` (:555–571, server-side resolution — never raw ids). Manual runs (`meta.taskId` null, :622–633) carry NO GFS marker: their segment set omits `<gfs>` entirely. Uniquify INSIDE the name resolution before any fs write: if the target exists, append `-2`, `-3`, … BEFORE `.tar.gz` (D-01) — never a rename/retry loop on the final name.
  3. Sidecar integrity: ensure the uniquified FINAL filename is the single variable flowing to both the tar write and `completeRun(filename, sha256)` (:179) so the .sha256 sidecar is written from the final name (Pitfall 3; verify the exact sidecar call site in runExport's publish step after :638 — Assumption A4 — and fix the wiring if the pre-uniquification name leaks).
  4. Run labels (UI-facing): server-side run-label shape gets the same instance-scope-gfs structure so Phase 94 renders identical strings without derivation.
  5. Extend test/backup-export.test.mjs: format pin for scheduled filename (instance+scope+slug+bucket+date), manual-run no-marker assertion, `-2` collision suffix before `.tar.gz` (pre-existing target file seeded), sidecar filename equals final uniquified filename, GR8R_INSTANCE_NAME env respected + hostname fallback slugified. Update any test pinning the OLD format (Pitfall 4: rotation is id-based, so the format change is inert to it — confirm test/backup-export.test.mjs filename-shape tests are updated, not reverted).
  </action>
  <verify>
    <automated>node --test test/backup-export.test.mjs test/backup-rotation.test.mjs</automated>
  </verify>
  <done>Filenames and run labels carry the full five-segment shape with server-resolved names; manual runs have no GFS marker; collision suffixes precede `.tar.gz`; sidecar carries the final name; archives never renamed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: describeCron descriptor + backupTaskShape field</name>
  <files>export/cron.js, server.js, test/backup-cron.test.mjs</files>
  <behavior>
    - `0 3 * * *` → `{kind:'daily', hour:3, minute:0, raw:'0 3 * * *'}` (domRestricted=false && dowRestricted=false, singleton hour/minute sets)
    - `0 0 * * 1` → `{kind:'weekly', weekday:1, hour:0, minute:0, raw:…}` (dowRestricted only, singleton dow)
    - `0 4 1 * *` → `{kind:'monthly', hour:4, minute:0, raw:…}` (domRestricted singleton dom, dow unrestricted)
    - `0 5 1 1 *` → `{kind:'yearly', hour:5, minute:0, raw:…}` (singleton dom + singleton mon)
    - `*/15 * * * *` → `{kind:'custom', raw:'*/15 * * * *'}` (multi-value minute set)
    - `0 6 * * 1-5` → `{kind:'custom', raw:…}` (dow range, not singleton)
    - malformed expression (parseCron null) → `{kind:'custom', raw:<expr>}` honest fallback
    - Fields weekday/hour/minute ABSENT on custom kind.
  </behavior>
  <action>
  D-04: implement `describeCron(expr)` in export/cron.js deriving ONLY from `parseCron` output (:83–102: minute/hour/dom/mon/dow Sets + domRestricted/dowRestricted booleans). Classification: daily = unrestricted dom+dow + singleton hour and minute sets; weekly = dowRestricted with singleton dow; monthly = domRestricted (singleton dom); yearly = domRestricted AND mon singleton; everything else (steps, ranges, multi-values, any non-singleton set) = `custom` with `raw`. Always include `raw`. NO server-side translated strings — client t() keys are Phase 94. Wire `backupTaskShape` (server.js:8770) to include the descriptor field (per CONTEXT discretion, name it `schedule`). Tests first (behavior block above), then implementation.
  </action>
  <verify>
    <automated>node --test test/backup-cron.test.mjs</automated>
  </verify>
  <done>describeCron maps all five kinds + honest custom fallback from parseCron sets alone; backupTaskShape carries the descriptor; zero translated strings server-side.</done>
</task>

<task type="auto">
  <name>Task 5: Unified runs variant — ?all=1 on the frozen route</name>
  <files>server.js, test/backup-routes.test.mjs</files>
  <action>
  D-05 at server.js:9238–9245:
  1. Branch on `url.searchParams.get('all') === '1'` FIRST, before any existing param parsing. The legacy branch code stays VERBATIM untouched — the Task-1 golden fixture test proves byte-identity after this change (grep-gate: no new params read on the legacy path per D-05).
  2. New branch: same guard chain (sameOrigin → requireUser → hasInstanceRole(BACKUP_MANAGE) ∨ hasInstanceRole(RESTORE_USE)), then filters: `task` (task id or 'manual' for task_id NULL), `trigger` (manual|scheduled), `status`, `limit` + `offset` (validated integers, limit capped — no pagination beyond this per deferred scope). Same row projection as legacy plus `task_id` and `gfs_bucket`; task path may omit keptPosition here (Phase 94 renders history, not keep positions).
  3. Per-run scope authorization, server-side and fail-closed: instance-scope rows are covered by the route's role gate; workspace/project-scope rows pass a live-membership check mirroring the download-route idiom (verify the exact helper around server.js:5874–5940 at implementation time — Assumption A3). A run the caller cannot see is DROPPED from results (fail-closed), never error'd.
  4. Extend test/backup-routes.test.mjs: golden legacy test still green (byte-identity); ?all=1 returns cross-task rows; each filter param narrows correctly; limit/offset respected; a workspace-scope run is invisible to a caller without live membership; 'manual' filter matches task_id NULL rows only.
  </action>
  <verify>
    <automated>node --test test/backup-routes.test.mjs</automated>
  </verify>
  <done>Legacy responses byte-identical (golden test green); ?all=1 serves filtered, scope-checked, fail-closed cross-task history.</done>
</task>

<task type="auto">
  <name>Task 6: Operator-gated GET /api/backup/scopes</name>
  <files>server.js, test/backup-scopes.test.mjs</files>
  <action>
  D-06: mount beside the other /api/backup/* routes (~server.js:8775 region). Gate: `(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) || (await hasInstanceRole(user.id, CAP.RESTORE_USE)) || isInstanceAdmin(user)` (roles.js:24–40; Super Admin = isInstanceAdmin + SUPER_ACCESS per server.js:1282 pattern). Payload: `{ workspaces: [{ id, name, slug }] }` from a SEPARATE direct query (`select id, name, slug from workspaces where archived = 0 order by …`) — do NOT call `workspacesForUser` (server.js:1282, byte-unchanged mandate). No nested projects, no role echo (deferred). Flip the Task-1 scaffold tests to real assertions: 401/403 for unprivileged user (fail-closed), 200 + exact minimal payload for each of the three granted roles, payload shape strictness (only id/name/slug keys).
  </action>
  <verify>
    <automated>node --test test/backup-scopes.test.mjs test/backup-routes.test.mjs</automated>
  </verify>
  <done>Scopes endpoint returns the minimal payload for the three operator roles, 403 otherwise; workspacesForUser untouched (grep/golden guard).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client→frozen route | `?all=1` filter params are untrusted input on a frozen surface |
| client→scopes endpoint | role gate must fail closed for unprivileged callers |
| env/hostname→filename | GR8R_INSTANCE_NAME and hostname flow into filenames — must be slugified |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-92-01 | Information Disclosure | GET /api/backup/runs?all=1 | high | mitigate | Per-run fail-closed scope check (live membership for ws/project rows); unauthorized runs dropped, never leaked; Task 5 test pins cross-scope invisibility |
| T-92-02 | Elevation/Privilege abuse | GET /api/backup/scopes | high | mitigate | Three-role disjunction gate via hasInstanceRole/isInstanceAdmin; Task 6 pins 403 for unprivileged callers |
| T-92-03 | Tampering | Legacy route query parsing | medium | mitigate | Golden fixture differential test (Task 1/5) proves byte-identity; legacy branch verbatim, branch on ?all=1 first |
| T-92-04 | Tampering | Filename construction | low | mitigate | Instance name slugified via existing slugify before entering filenames; collision suffix before .tar.gz only |
| T-92-05 | Repudiation | Backfill writes to historical rows | low | accept | Documented as migration-not-mutation; additive nullable column, benign degradation; gated by checkpoint:decision |
| T-92-SC | Tampering | npm installs | high | mitigate | Not applicable this phase — zero new dependencies (package audit N/A per 92-RESEARCH.md) |
</threat_model>

<verification>
- Task 1 golden fixture green across all later tasks (byte-identity, D-05)
- `node --test test/backup-export.test.mjs test/backup-rotation.test.mjs test/gfs-kept-until.test.mjs test/backup-cron.test.mjs test/backup-routes.test.mjs test/backup-scopes.test.mjs test/db-adapter.test.mjs test/migration.test.mjs` all green
- Full `npm test` green before /gsd-verify-work
- grep guards: `workspacesForUser` definition unchanged (D-06); single GFS definition lives only in export/gfs.js (no duplicate assignGfsBuckets/isoWeekKey bodies elsewhere); rotation reads gfs_bucket column rather than re-deriving (BKNAME-02)
- Dual-engine: gfs_bucket present via both SQLITE_SCHEMA and ensureColumn/pgSchemaVariant in the same commit (D-02)
</verification>

<success_criteria>
1. Filenames and run labels carry `<instance-name>-<scope>-<slug>-<gfs>-<date>` server-resolved; manual runs no marker; collision suffix + sidecar from FINAL name (ROADMAP criterion 1)
2. One pure GFS function shared naming/rotation/backfill; gfs_bucket stored at creation, dual-engine same commit; rotation reads stored value (criterion 2)
3. describeCron structured descriptor from parseCron only; honest raw fallback; backupTaskShape carries it (criterion 3)
4. ?all=1 unified variant live; frozen per-task GET and /runs/current untouched (criterion 4)
5. Operator-gated scopes endpoint with minimal payload; workspacesForUser byte-unchanged (criterion 5)
</success_criteria>

<output>
Create `.planning/phases/92-server-payload-contracts/92-SUMMARY.md` when done
</output>
