# Pitfalls Research — v3.4 "UX Polish & Backup Console Refinement"

**Domain:** Refinement milestone on an existing, discipline-heavy codebase (frozen archive format D-86, exactly-once outbox claims, ×5-locale i18n gate, db-adapter dual-engine, audit funnel for every mutation).
**Researched:** 2026-11-23
**Confidence:** HIGH (every pitfall below is grounded in read code: `export/backup.js`, `export/cron.js`, `server.js:2815-2925` digest loop, `server.js:3844-4028` GFS rotation, `server.js:5813` `hasInstanceRole`, `server.js:7662-7747` api-keys, `src/pages/backup.js` GFS_SCALE_KEYS)

## Critical Pitfalls

### Pitfall 1: GFS marker drift — creation-time predicted bucket ≠ rotation-time actual bucket

**What goes wrong:** The owner ruling puts the GFS marker (daily/weekly/monthly/yearly) in the archive filename AT CREATION, using the same pure function as rotation. Rotation today derives the bucket lazily from the run's UTC calendar position at rotation time (`server.js:3844-3850`, D-10) — a run created just before a week/month boundary could be named `daily` but rotated into (or counted against) the `weekly` bucket. Worse, two implementation paths (naming at `export/backup.js:573/749` vs. `gfsKeptPositions` at `server.js:3931`) can silently diverge into two bucket definitions.

**Why it happens:** The filename is written once and never renamed (frozen format, manifest-hash dependency); the bucket is *re-derived* at rotation. Two call sites of "which bucket is this run?" is the classic duplication trap.

**How to avoid:**
- Extract ONE pure function, e.g. `gfsBucketFor(task, runStartedAtUtc) -> 'daily'|'weekly'|'monthly'|'yearly'`, unit-pinned, imported by BOTH `archiveName` (creation, `export/backup.js:573`) and the rotation pass (`server.js:3944`). No second implementation, ever.
- Store the bucket ON THE RUN ROW at creation (additive column — mirrored SQLite+Postgres DDL in the same commit) and have rotation read the stored bucket instead of re-deriving. The stored value is truth; re-derivation is the drift vector.
- Never post-hoc rename: the filename recorded in `backup_runs` is authoritative and restore depends on the manifest hash (format frozen since 86).
- The filename marker is the machine token (`daily`), NOT the localized UI label — UI labels come from the existing `GFS_SCALE_KEYS` (`src/pages/backup.js:141`). Localized text in filenames would break grep-based rotation matching and the frozen format.
- Keep the collision-guard suffix (`-N.tar.gz`, `backup.js:756-761`) applied AFTER the GFS segment in the final name, and write the sidecar (`${sha256}  ${filename}`, `backup.js:765`) from the FINAL filename — including the uniquifier. A sidecar written before uniquification is checksum-name drift.

**Warning signs:** A run named `weekly` counted against the daily keep-7 count; `grep daily backupsDir` returns files rotation treats as weekly; a sha256 sidecar whose embedded filename ≠ actual filename after a same-second collision.
**Phase to address:** Backup naming phase (the phase that touches `archiveName`) — the pure-function extraction and stored-bucket DDL are its first task, before any UI label work.

---

### Pitfall 2: Digest aggregation breaks exactly-once — changing the claim key instead of the delivery layer

**What goes wrong:** Today the digest claims per (workspace, user, localDate) (`reminders_sent` key `${ws.id}:${user}:digest:${localDate}`, server.js:2863) and enqueues one outbox row per claim (`digest:${ws.id}:${user}:${localDate}`, :2890). Aggregating to 1 email/day/user across workspaces tempts you to move the claim to `${user}:digest:${date}` — that silently destroys per-workspace exactly-once, the D-11/D-12 tz-change re-window semantics, and the D-12 "empty digest claims nothing" ledger honesty per workspace (a workspace with an empty section must still NOT claim — but the aggregated email still has other sections).

**Why it happens:** The claim and the email are currently 1:1; the ruling makes them N:1 and the path of least resistance is to reshape the claim.

**How to avoid:**
- KEEP the per-(workspace, user, localDate) semantic claim untouched — it is the WHAT-to-send history (POL-02).
- Aggregate at the TRANSPORT layer: after the per-workspace pass, a per-user coalescing step builds one email/day/user with one section per claimed workspace; the outbox dedup key becomes `digest:daily:${userId}:${date}` with `insert or ignore` exactly-once, and the multi-workspace ctx is written inside the SAME `db.tx` as the last claim (shared-connection tx discipline: never a module-level db call inside the pg tx).
- Locale: the aggregate email uses the USER's locale (users.locale), not the per-membership row locale currently read at :2896 — per-workspace rows can disagree.
- This is the root-cause fix for the reported "digest received 4×" bug — pin the 4× reproduction as a failing test first.
- ×5 locales: any new section header/unsubscribe wording lands in en/fr/nl/de/es in the same commit (i18n gate will fail otherwise).

**Warning signs:** A user gets N emails again after the fix ships; a workspace whose only content is an empty section appears as a blank heading in the aggregate; duplicate-key errors on `email_outbox.dedup_key` during restarts.
**Phase to address:** Notifications digest-fix phase (the owner's "investigation + fix" item) — it is standalone and should land before/parallel to backup console work since it touches `email_outbox`.

---

### Pitfall 3: Cron humanization drifting from the scheduler's interpretation

**What goes wrong:** The console will display "Every Monday at 00:00" style labels. If the label is generated by a second, UI-side cron interpretation (string split, naive weekday mapping), the label can disagree with `nextRunAt` — especially around DST, where the scheduler deliberately measures wall time through `Intl.DateTimeFormat` per candidate in UTC-millis (`export/cron.js:83/135/160/178`, 18-test DST matrix). A label like "Every day at 00:00" is a lie twice a year if the scheduler keeps 00:00 *wall* time via formatter measurement and the label author assumed fixed offsets.

**Why it happens:** Humanization feels like a display concern, so it gets implemented in the client far from the parser.

**How to avoid:**
- Humanize from the SAME `parseCron(expr)` output (server computes the label or the client imports the shared parser module — no second parse). The builder presets (daily/weekly/monthly/custom) map 1:1 to expressions; only those get humanized sentences.
- Custom expressions outside the supported 5-field subset get an HONEST fallback: show the raw expression, never a guessed sentence ("Every 7 days" for `*/1002 * * * *` is a lie).
- New humanization keys land ×5 locales in the same commit; weekday names must come from locale-aware `Intl` formatting, not hardcoded English arrays.
- Reuse the DST test matrix: add assertions that the humanized label for a `0 0 * * *` task matches what `nextRunAt` actually fires across the existing DST fixtures.

**Warning signs:** A label/schedule mismatch reported on a DST-boundary day; e2e asserting on label text that broke after a locale change; a custom-cron task showing a confident "every N days" sentence.
**Phase to address:** Backup tasks console phase — schedule humanization is one of its deliverables; the shared-parser rule belongs in its plan constraints.

---

### Pitfall 4: Unified run history leaking runs beyond viewer rights (task-scope vs instance-scope)

**What goes wrong:** The unified multi-task history merges runs across tasks of different scopes (project / workspace / instance). A Restore Operator with `hasInstanceRole(userId, RESTORE_USE)` (:9171) may view instance-scope runs but has NO workspace membership on a project-scoped task's workspace — a naive "list all runs for these task ids" endpoint shows workspace/project names (and filenames) the viewer has no right to see. The v3.3 restore-list already needed invalidation keyed on run identity for a cousin of this problem.

**Why it happens:** Cross-workspace visibility for operators is new in v3.4 and it is easy to conflate "can see the Backup/Restore surfaces" with "can see every workspace's data on them".

**How to avoid:**
- Server-side per-row authorization in the unified-history endpoint: for each run, resolve its task's scope and check the matching authority — instance-scope → `hasInstanceRole(BACKUP_MANAGE/RESTORE_USE)`; workspace/project-scope → live workspace role (or the operator's surface-level right only sees rows, redacted of workspace names the caller lacks rights to). Never filter client-side.
- Do NOT widen `workspacesForUser` to make this easy (see Pitfall 7) — compute the visible-set inside the history endpoint only.
- Run rows already record workspace identity; redact name/label fields rather than dropping rows only if the product ruling says so — default fail-closed: drop rows the viewer has no right to, never send redacted ghosts.
- Pin an e2e: Restore-Op (no workspace membership) requesting unified history sees exactly the instance-scope runs and zero workspace names.

**Warning signs:** A non-member workspace name appears in a Restore Op's history filter dropdown; the endpoint returns rows for task ids the caller never had access to; client code doing `.filter(r => canSee)` over an unfiltered payload.
**Phase to address:** Backup tasks console phase (unified history deliverable) — its success criteria must include the cross-scope authorization e2e.

---

### Pitfall 5: Role tabs enabling last-Super-Admin demotion or hiding implicit membership

**What goes wrong:** The Instance Roles tab redesign (one row per user, badges, rename, user picker in the Grant dialog) rebuilds the grant/revoke UI. Two traps: (a) a redesigned revoke affordance that bypasses or duplicates the existing last-operator demotion guard — the group-mapping sync already learned this and routes every removal through the shared guard funnel with last-operator/last-owner guards; (b) Super-Admins are AUTO-members of instance roles (implicit membership) — if the tab hides that, an operator sees themselves as revocable, clicks revoke, gets an opaque 403, and the UI looks broken.

**Why it happens:** UI redesign re-implements affordances instead of riding the existing server funnel.

**How to avoid:**
- All mutations go through the existing audited endpoints (`instance_role_granted`/`instance_role_revoked`, server.js:8513/8615) — the tabs are render-only re-skins; zero new mutation path.
- Render implicit (auto) membership with a distinct honest badge and a disabled/tooltip'd revoke for the last Super Admin; the refusal key for last-operator demotion must exist ×5 locales.
- The broken Grant-dialog search is a picker bug — fix the picker, do not build a second search; reuse the Edit-team selectable picker pattern per the milestone goal.
- Audit funnel for every mutation is already in place — do not add a parallel audit write.

**Warning signs:** A revoke button that always 403s in UAT; a Super Admin row without any indication of auto-membership; two different audit actions for the same demotion.
**Phase to address:** Instance Roles governance phase (first phase of the milestone) — include "last-Super-Admin revoke shows disabled + localized reason" in its UAT.

---

### Pitfall 6: Revoked-key purge deleting the audit trail

**What goes wrong:** "Purge des clés révoquées" naively means `delete from api_keys where revoked_at is not null`. But key lifecycle is audited (`api_key_revoked` logSecurity + audit_log row at server.js:7741-7744, MCP `psk_live_` history, keys list rendering `revokedAt` at :7684) and the transparency/audit surfaces reference key ids. Deleting rows orphans audit entries pointing at nothing, erases the revocation history from the keys list, and can break forensic questions ("who had access in March?").

**Why it happens:** "Purge" is read as "delete rows" when the product intent is "clean up the list".

**How to avoid:**
- Decide and ratify the semantics FIRST: purge = delete revoked ROWS but audit_log entries are append-only and must survive untouched (audit rows do not FK to api_keys — verify, and if any view joins key rows for label/prefix, snapshot label+prefix into the audit ctx at purge time before deletion).
- Purge only `revoked_at IS NOT NULL`; never expired-but-unrevoked, never active. Scoped strictly to the caller's `user_id` (P-F pattern at :7919) if it's a self-service action.
- If the audit entry for the purge itself is desired (`api_keys_purged`, count only), route it through `logSecurity`/audit funnel like every mutation — but never per-key audit re-writes.
- Zero DDL expected here — if any column is added (e.g. a `purged_at`), mirror it SQLite+Postgres in the same commit.

**Warning signs:** Audit-log entries whose target key no longer resolves; a transparency view that renders blank rows; a purge endpoint that deletes rows still referenced by active MCP key-caches.
**Phase to address:** Settings phase (API Keys purge deliverable) — semantics ratification belongs in its discuss-phase questions.

---

### Pitfall 7: Cross-workspace listing implemented by widening `workspacesForUser`

**What goes wrong:** The ruling: operators see ALL workspaces in the Backup/Restore pickers ONLY. The lazy implementation adds operator workspaces into `workspacesForUser` — and every other consumer (sidebar switcher, search, digest loop `server.js:2815`, notif fan-out, invite pickers, MCP tools) immediately inherits the widened authority. That is a full-isolation regression: a Backup Op would appear as a member of every workspace in the UI switcher and could receive digests for workspaces they can't read.

**Why it happens:** `workspacesForUser` is the obvious "list the user's workspaces" seam, and modifying it is one line.

**How to avoid:**
- Explicit ruling out: `workspacesForUser` is FROZEN for this milestone. Compute the picker list inside the Backup/Restore endpoints from task scope + `hasInstanceRole` (a separate pure helper, e.g. `backupScopeWorkspaces(user)`), returning only the fields pickers need (id/slug/name) — never full workspace objects.
- Verify by grep after implementation: no new caller passes the operator role into `workspacesForUser`; the sidebar/switcher payload is unchanged for operators.
- e2e pin: log in as Backup Op → switcher lists only real memberships; Backup page pickers list all workspaces; digest loop skips non-member workspaces.
- The digest loop already iterates real memberships — confirm the aggregated digest (Pitfall 2) cannot be fed workspace sections from the widened list.

**Warning signs:** An operator sees extra workspaces in the workspace switcher after this milestone; search results include non-member workspaces; `workspacesForUser` diff touches its signature or return shape.
**Phase to address:** Cross-workspace pickers phase — "workspacesForUser untouched" is a hard success criterion to write into REQUIREMENTS out-of-scope notes.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Second GFS bucket implementation in the naming path | Fast UI label work | Silent retention drift, wrong archives deleted | Never |
| Collapsing the digest per-workspace claim into a per-user claim | Shorter code | Destroys D-11/D-12 semantics + ledger honesty | Never |
| Client-side cron humanization | No server round-trip | Label lies at DST, dual parser forever | Never |
| Filtering unified history on the client | One simple endpoint | Authorization leak (server sent everything) | Never |
| Widening `workspacesForUser` for pickers | One-line change | Isolation regression across every consumer | Never (explicitly ruled out) |
| Redesigning role tabs with new mutation endpoints | Fresher UX | Duplicated guards, split audit trail | Never — re-skin existing endpoints |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unified history returns unfiltered rows | Cross-workspace data leak to Restore Ops | Server-side per-run scope check (Pitfall 4) + e2e pin |
| Widening `workspacesForUser` | Global authority widening beyond Backup/Restore | Frozen seam; separate picker helper |
| Purge deleting audit rows | Forensic trail loss | Append-only audit_log; snapshot label/prefix into audit ctx before key-row deletion |
| Existence oracle in pickers | Non-operator learns workspace names/slugs | Operators-only endpoints answer the full list; others keep 404/fail-closed |

## "Looks Done But Isn't" Checklist

- [ ] **GFS naming:** pure function shared by `archiveName` AND rotation; bucket stored on run row; sidecar filename = final uniquified name
- [ ] **GFS labels:** UI uses `GFS_SCALE_KEYS` ×5 locales; filename uses machine tokens — no localized text in filenames
- [ ] **Digest:** per-workspace claim intact; one outbox row per user/day; restart + MAILER-disabled paths don't double-send; empty sections don't claim
- [ ] **Cron labels:** generated from `parseCron`; custom subset falls back to raw expr; ×5 locales; DST matrix extended to labels
- [ ] **Unified history:** server-side scope filter; non-member workspaces absent even as redacted ghosts; e2e for Restore-Op visibility
- [ ] **Role tabs:** implicit membership badge; last-Super-Admin revoke disabled with localized reason; zero new mutation endpoints
- [ ] **Key purge:** audit trail survives; only `revoked_at` rows deleted; caller-scoped
- [ ] **Cross-workspace:** `workspacesForUser` byte-unchanged; e2e switcher-vs-picker differential
- [ ] **Milestone-wide:** every new i18n key lands ×5 in the same commit; any DDL mirrored SQLite+Postgres; every mutation audited

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 GFS drift | Backup naming phase | Unit pin on shared pure function; rotation-preview e2e; sidecar hash/filename match test |
| 2 Digest aggregation | Notifications digest-fix phase | 4×-repro regression test; claim-intact unit tests; per-user/day outbox pin |
| 3 Cron humanization | Backup tasks console phase | Label↔`nextRunAt` DST matrix extension; ×5 locale gate |
| 4 History leak | Backup tasks console phase | Restore-Op-no-membership e2e (0 workspace names) |
| 5 Role tabs | Instance Roles governance phase | Last-Super-Admin disabled revoke UAT; audit single-source check |
| 6 Key purge | Settings phase | Audit-entry survival test post-purge; revoked-only assertion |
| 7 Scope widening | Cross-workspace pickers phase | `workspacesForUser` untouched grep gate + switcher/picker differential e2e |

## Sources

- Code read directly (HIGH confidence): `server.js:2815-2925` (digest claim/outbox), `server.js:3844-4028` (GFS rotation, `gfsKeptPositions`), `server.js:9203-9310` (rotation projection), `server.js:5813` + capability gates, `server.js:7662-7747` (api keys), `export/backup.js:536-575, 707-846` (naming, sidecar, S3), `export/cron.js:83-178` (parser + DST walk), `src/pages/backup.js:136-380` (GFS_SCALE_KEYS, retention form)
- `.planning/PROJECT.md` v3.3 shipped record + owner rulings for v3.4 (D-86 frozen format, D-10/D-11/D-12/D-13, POL-02, D-88-6/8/9, D-90-12/15/16)

---
*Pitfalls research for: gr8r v3.4 UX Polish & Backup Console Refinement*
*Researched: 2026-11-23*
