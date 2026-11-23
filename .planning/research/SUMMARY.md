# Project Research Summary

**Project:** gr8r (Projects Studio) — Milestone v3.4 "UX Polish & Backup Console Refinement"
**Domain:** Self-hosted admin console UX refinement (governance roster, backup console, settings, digest email)
**Researched:** 2026-11-23
**Confidence:** HIGH (stack, architecture, pitfalls are all grounded in file:line reads of this repo; features HIGH for patterns, MEDIUM for complexity estimates)

## Executive Summary

v3.4 is a refinement milestone over a discipline-heavy codebase: a vanilla-JS SPA (Vite-bundled, staged `S.ui.*` state, single `data-a` action dispatcher) over a hand-rolled single-file `server.js` (~12k lines) with root-level server-only modules (`export/cron.js`, `export/backup.js`). Every target feature is UI composition on existing idioms or a bug fix inside existing send/naming/rotation machinery. Stack research verdict is unambiguous and owner-confirmed: **zero new dependencies**. Tabs, segs, lazy pickers, row/filter idioms, cron builder, GFS rotation, outbox claims — all already exist and are battle-tested; the work is cloning documented house patterns, not inventing new ones.

The recommended approach follows the repo's standing doctrine: server-first payloads (D-23 — the client renders verbatim, never derives), render-only re-skins of existing audited mutation endpoints, exactly-once semantics carried by DB claims, and i18n ×5 locales in the same commit. Architecture research proposes a dependency-resolved build order: digest dedup fix first (standalone correctness bug), then a server payload-contract phase (roles aggregation, cron descriptor, name resolution, archive naming + `gfs_bucket`, unified runs route, scopes listing), then three client phases (governance, backup console, settings + pickers). The owner's rulings for v3.4 are now LOCKED and settle the two points where research documents had tension: (1) the GFS marker goes BOTH in UI labels AND in the archive filename at creation, using one shared pure function with the bucket stored on the run row; (2) the digest aggregates to 1 email/day/user across workspaces, and the reported 4× duplicate's root cause is the per-workspace claim key — so the claim/transport reshape is the fix, with the pinned 4× reproduction test.

Key risks are concentrated, well-mapped, and each has a named prevention: GFS bucket drift (one pure function + stored bucket, never re-derivation, never post-hoc rename of the frozen format); digest aggregation accidentally destroying per-workspace semantics (guard via pinned tests; aggregated email must handle empty-section honesty); cron label vs scheduler disagreement at DST (humanize from the same `parseCron` output, never a second parser); unified-history authorization leaks (server-side per-row scope check, fail-closed); and the isolation trap of widening `workspacesForUser` (explicitly FROZEN by owner ruling — pickers get their own operator-gated helper).

## Key Findings

### Recommended Stack

**Zero new dependencies — confirmed by stack research and ratified by the owner.** `package.json` is unchanged for v3.4 (`@office-kit/xlsx`, `pg`, `web-push`; dev: eslint, prettier, playwright, vite, lucide). All features ride existing machinery.

**Core technologies (all existing):**
- `.seg`/`.tabs` staged-state idiom (`S.ui.*` + `data-a` handlers) — governance roster tabs clone `govSuperSeg` (`governance.js:135-146`); tabs precedent in inbox/archive/modals
- Lazy-chunk picker clones (`team-pick.js`, `assignee-pick.js`) — the selectable user picker is a third documented clone, never a generic abstraction this milestone; keyboard contract via `pk._flat`
- `export/cron.js` — the ONLY cron grammar owner (prohibition-test-gated away from `src/`); humanization = a server-side descriptor over `parseCron`, localized client-side via `t()`; builder pre-fill seeds from the same descriptor, never client-parsing
- Digest two-layer claim machinery (`reminders_sent` semantic claim + `email_outbox` transport claim, same tx) — the fix surface; no queue/worker library
- `export/backup.js` naming (`archiveName`, `runMeta`) + rotation pass (`gfsKeptPositions`) — GFS marker work; additive `gfs_bucket` column via `adapterEnsureColumn` mirrored SQLite+Postgres
- Existing 60s ticks / sweep ticks (`server.js:12145-12189`) — any new sweep (revoked-key purge) rides them; no new scheduler

**Explicit "do not add" (stack-confirmed + owner-ratified):** no tab/picker framework, no cronstrue-style library, no generic picker abstraction, no client cron import/eval, no digest queue library.

### Expected Features

**Must have (table stakes — ship gate):**
- Role-tabbed governance roster, one row per user with cumulative role badges; rename « Super Admins & Roles » → « Instance Roles » (i18n ×5 + e2e assertion)
- Working searchable user picker in Grant dialog (broken search is a defect) + teams picker in Invite Member → Edit Teams (third picker consumer)
- Unified multi-task run-history table with task/status/trigger filters
- Schedule builder pre-filled with current cron; humanized schedule display (« Every Monday at 00:00 »); Next run + Last run (status) columns
- Workspace/project names instead of ids in backup lists (deleted-entity fallback)
- Archive filenames + UI labels carrying scope + GFS bucket marker (LOCKED ruling: marker at creation, format `<instance-name>-<scope>-<slug>-<gfs>-<date>`, machine token not localized label, one pure function shared with rotation, bucket stored on run row)
- Run-now hint « manual archives are under no retention » (`task_id NULL` invariant preserved)
- Cross-workspace visibility of all workspaces in Backup/Restore pickers for operators (LOCKED ruling: pickers ONLY, `workspacesForUser` frozen)
- Digest aggregated to 1 email/day/user across workspaces with sections per workspace, root-caused fix + pinned regression test (LOCKED ruling: root cause = per-workspace claim key)
- Settings polish: revocable-key list purge, My Access column/icon view, one-line Workspace URL

**Should have (differentiators):**
- Cron round-trip: builder pre-fill and humanized display share ONE cron-subset interpretation
- GFS legibility end-to-end: kept-until badges + filename marker + unified history telling one coherent rotation story
- Pinned 4×-digest regression test as a fixture of engineering honesty

**Defer (not committed):** bulk "purge all revoked" trigger, history retention-window controls, general cron DSL, manual-archive retention rules, global operator visibility, re-run from history.

### Architecture Approach

Refinement, not re-architecture. Read-shape changes are server-first (payload aggregation at `server.js:8500`, structured cron descriptor in `backupTaskShape:8692`, name resolution server-side, new operator-gated `GET /api/backup/scopes`); the unified runs route is a new variant on the existing GET (`?all=1` + filter params) leaving the frozen per-task GET and `/api/backup/runs/current` untouched. All mutations ride existing audited endpoints — zero new mutation paths. Sweeps ride existing ticks.

**Major components:**
1. **Governance read reshape** — users-anchored join with `roles[]` + `isInstanceAdmin`; tabs/badges are render-only; grant/revoke routes + audit funnel untouched
2. **Backup payload contracts** — cron descriptor, `gfs_bucket` column, scope/name resolution, unified runs variant, operator-gated scopes listing (never touching `workspacesForUser:1282`)
3. **Digest send path** (`server.js:2815-2925` + outbox driver `:3401`) — per-user coalescing after the per-workspace pass; one `digest:daily:${userId}:${date}` outbox row per user/day inside the shared tx

### Critical Pitfalls

1. **GFS bucket drift** — filename written once at creation, bucket re-derived at rotation = classic duplication trap. Prevention (LOCKED as owner ruling): ONE pure function `gfsBucketFor(task, runStartedAtUtc)` imported by both `archiveName` and rotation; bucket stored on run row at creation; rotation reads the stored value. Machine token in filename (`daily`), localized label in UI (`GFS_SCALE_KEYS` ×5). Collision suffix `-N` and sha256 sidecar written from the FINAL uniquified filename.
2. **Digest aggregation breaking exactly-once** — the LOCKED ruling makes the reshape itself the fix; pin the 4× reproduction as a failing test FIRST, then assert: per-workspace WHAT-to-send history stays honest, one outbox row per user/day, empty sections don't claim, restart/MAILER-disabled paths don't double-send, aggregate uses the USER's locale.
3. **Cron label vs scheduler divergence at DST** — humanize from `parseCron` output only; honest raw-cron fallback for anything outside the 5-field subset; extend the existing DST test matrix to labels; weekday names via locale-aware `Intl`, ×5 locales same commit.
4. **Unified history authorization leak** — server-side per-row scope check (instance-scope → operator role; workspace/project-scope → membership), fail-closed drop (no redacted ghosts), e2e pin: Restore-Op with no memberships sees zero workspace names.
5. **`workspacesForUser` widening** (FROZEN by ruling) — separate pure helper `backupScopeWorkspaces(user)` inside the capability-gated backup surface only; grep gate + switcher-vs-picker differential e2e.

Also tracked: role-tab redesign must not bypass last-Super-Admin demotion guards (implicit membership badge + disabled revoke with localized reason); revoked-key purge must delete rows but NEVER audit trail (append-only audit survives; snapshot label/prefix into audit ctx; explicit user-triggered purge, never silent auto-purge; 7-day grace sweep riding existing tick).

## Implications for Roadmap

Based on research + LOCKED owner rulings, suggested phase structure:

### Phase 1: Digest Dedup — One Digest Per User Per Day
**Rationale:** Standalone correctness bug, highest user pain, touches `email_outbox` — independent of all backup/governance work. Owner ruling fixes the mechanism direction (aggregate 1 email/day/user across workspaces; root cause = per-workspace claim key).
**Delivers:** Aggregated digest (sections per workspace), root-caused send path, pinned regression test (4× reproduction as failing test first).
**Addresses:** Digest 4× fix (P1).
**Avoids:** Pitfall 2 (exactly-once destruction) — via pinned tests on claim honesty, empty-section non-claiming, restart paths; locale from `users.locale`; ×5 i18n for new section headers/unsubscribe wording.

### Phase 2: Server Payload Contracts (the foundation phase)
**Rationale:** Every client phase below renders from these payloads; naming + `gfs_bucket` MUST land before unified-history labels consume them. All read-shape changes in one phase, client untouched.
**Delivers:** (1) instance-roles aggregation, (2) `describeCron` structured descriptor in `backupTaskShape`, (3) server-side task/scope name resolution, (4) archive naming with GFS marker at creation + `gfs_bucket` column + shared pure function, (5) unified runs route variant, (6) operator-gated `GET /api/backup/scopes`.
**Addresses:** Foundation for roles roster, schedule display/prefill, unified history, names-not-ids, GFS naming, cross-workspace pickers.
**Avoids:** Pitfall 1 (GFS drift — pure function + stored bucket as FIRST task), Pitfall 7 (`workspacesForUser` frozen), anti-pattern of renaming files post-hoc (frozen format D-86 — marker composed into the name at creation).

### Phase 3: Governance UX — Instance Roles
**Rationale:** Depends only on Phase 2.1; can run parallel with Phase 4. Owner-named first surface.
**Delivers:** Role-tabbed roster (Super Admin / Backup Op / Restore Op tabs as filters), per-user rows + cumulative badges, rename to « Instance Roles », working searchable picker in Grant dialog, teams picker in Invite → Edit Teams.
**Addresses:** Governance features (P1).
**Avoids:** Pitfall 5 (last-Super-Admin revoke disabled + localized reason, implicit-membership badge, zero new mutation endpoints, single audit source).

### Phase 4: Backup Console UX
**Rationale:** Depends on Phase 2.2–2.6; biggest honesty gap in the console.
**Delivers:** Unified run-history table with task/status/trigger filters, Next run + Last run columns, humanized schedule display, pre-filled schedule editor, names instead of ids, Run-now "no retention" hint, GFS badge on labels.
**Addresses:** Backup console features (P1).
**Avoids:** Pitfall 3 (cron divergence — DST matrix extension to labels), Pitfall 4 (history leak — server-side per-row scope check + Restore-Op e2e pin).

### Phase 5: Settings Polish + Cross-Workspace Pickers
**Rationale:** Depends on Phase 2.6 for the picker half; settings items (API-key purge, My Access, Workspace URL) are independent and may split off if heavy.
**Delivers:** Revocable-key purge (explicit, user-triggered, audit-surviving), My Access column/icon polish, one-line Workspace URL, Backup/Restore cross-workspace operator pickers.
**Addresses:** Settings polish + operator visibility (P2).
**Avoids:** Pitfall 6 (audit trail survives purge; only `revoked_at` rows; caller-scoped), Pitfall 7 (`workspacesForUser` byte-unchanged — hard success criterion + grep gate + switcher/picker differential e2e).

### Phase Ordering Rationale

- **Dependency-resolved:** Digest (A) is parallel-safe; payload contracts (B) feed all client phases; naming/GFS in B strictly precedes unified-history labels; governance (C) and backup console (D) can run in parallel once B lands; settings split (E-settings ∥ everything).
- **Grouping follows architecture seams:** one server-payload phase avoids scattering read-shape changes across client phases; each client phase owns one page (`governance.js` / `backup.js` / `settings.js`).
- **Pitfall placement matches research mapping:** GFS pure-function extraction is the FIRST task of Phase 2.4; the 4× repro test is the FIRST task of Phase 1; `workspacesForUser` freeze is written into Phase 5 requirements as out-of-scope.
- **LOCKED rulings embedded:** filename format `<instance-name>-<scope>-<slug>-<gfs>-<date>`, one pure function shared with rotation, bucket stored on run row, digest per-user aggregation, pickers-only visibility — all become phase constraints/success criteria, not discussion topics.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Digest):** root cause is now ruled (per-workspace claim key), but the exact coalescing point in `runReminderPass`, outbox-row-per-user restructure, and empty-section semantics need a discuss/plan pass. Pitfall 2's pinned-test list becomes the plan's test matrix.
- **Phase 2.4 (Archive naming):** highest landmine density — frozen format D-86, collision suffix ordering, sidecar-from-final-name, S3 key compatibility, and reordering creation-time bucket assignment vs rotation read. Small but needs careful planning, not research-phase literature.
- **Phase 4 (Unified history):** the cross-scope authorization model (per-row check, fail-closed drop) deserves a discuss-phase ruling on whether non-visible rows are dropped or redacted (research default: drop).

Phases with standard patterns (skip research-phase):
- **Phase 3 (Governance):** pure clone of documented idioms (`govSuperSeg`, picker siblings, row idioms) — file:line map complete.
- **Phase 5 (Settings):** sweep-tick + list-filter patterns fully precedented; zero DDL expected.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every claim cites a verified repo file:line; zero-dep verdict ratified by owner |
| Features | HIGH | 1:1 map to owner's v3.4 list, no invented scope; complexity estimates MEDIUM (touch points now largely mapped by architecture research) |
| Architecture | HIGH | All integration points grounded in direct reads; build order dependency-resolved; LOCKED rulings integrated |
| Pitfalls | HIGH | Every pitfall grounded in read code (`export/backup.js`, `export/cron.js`, `server.js` digest/rotation/keys sections) |

**Overall confidence:** HIGH

### Gaps to Address

- **Digest coalescing design detail:** the ruling fixes WHAT (1 email/day/user, per-workspace claim key was the bug) but the plan must specify the coalescing point, outbox restructure, and empty-section honesty — resolve in Phase 1 discuss/plan with the pinned test as the arbiter.
- **Archive naming pipeline order:** creation-time bucket assignment requires the run row to carry the bucket before rotation reads it; verify the DDL mirror (SQLite+Postgres same commit) and that rotation switches from re-derivation to stored-value in the same phase — no mixed state.
- **Unified-history drop-vs-redact:** research default is fail-closed drop; confirm as a phase ruling before building.
- **Instance-roles aggregation payload shape:** the proposed `{users[]}` shape is a recommendation; validate against e2e assertions during Phase 2 planning.
- **Manual-archive GFS semantics:** manual Run-now runs have `task_id NULL` and no retention — confirm they carry NO bucket marker in filename or label (per owner ruling, the marker applies to GFS scopes; manuals are outside the scheme).

## Sources

### Primary (HIGH confidence)
- Direct repo reads this session: `server.js` (:1274-1291, :2644-2925, :3347-3401, :3844-4028, :5796-5813, :7662-7747, :7981, :8488-8711, :9157-9310, :12145-12189), `src/pages/governance.js`, `src/pages/backup.js`, `src/pages/settings.js`, `src/core/api.js`, `src/actions/actions.js`, `src/actions/keyboard.js`, `src/features/team-pick.js`, `src/features/assignee-pick.js`, `export/cron.js`, `export/backup.js`, `package.json`
- `.planning/PROJECT.md` (v3.3 shipped record, v3.4 goals, D-86 frozen format, POL-02, D-88/D-90 rulings)
- Owner LOCKED rulings for v3.4 (GFS marker both-in-UI-and-filename at creation with shared pure function + stored bucket; digest 1 email/day/user with per-workspace claim key as root cause; pickers-only cross-workspace visibility with frozen `workspacesForUser`; zero new dependencies)

### Secondary (MEDIUM confidence)
- Proxmox PBS / Borg / restic / Jenkins / Grafana / GitHub / Stripe console conventions — pattern sources for roster, history, naming, key-purge tables
- Outbox + idempotency-key dedup literature (morling.dev, ByteByteGo) — digest dedup pattern backing
- Digest enrollment multi-workspace complexity estimates — gr8r-specific cost estimates unexercised until Phase 1 planning

### Tertiary (LOW confidence)
- None — all low-confidence hypotheses from research files were either resolved by owner rulings or flagged above as gaps.

---
*Research completed: 2026-11-23*
*Ready for roadmap: yes*
