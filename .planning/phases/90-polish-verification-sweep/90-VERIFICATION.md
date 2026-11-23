---
phase: 90-polish-verification-sweep
verified: 2026-11-23T18:45:00Z
status: human_needed
score: 36/42 must-haves verified
behavior_unverified: 2
overrides_applied: 0
covered_files:
  - .planning/phases/90-polish-verification-sweep/90-01-PLAN.md
  - .planning/phases/90-polish-verification-sweep/90-01-SUMMARY.md
  - .planning/phases/90-polish-verification-sweep/90-02-PLAN.md
  - .planning/phases/90-polish-verification-sweep/90-02-SUMMARY.md
  - .planning/phases/90-polish-verification-sweep/90-03-PLAN.md
  - .planning/phases/90-polish-verification-sweep/90-03-SUMMARY.md
  - .planning/phases/90-polish-verification-sweep/90-04-PLAN.md
  - .planning/phases/90-polish-verification-sweep/90-04-SUMMARY.md
  - .planning/phases/90-polish-verification-sweep/90-CONTEXT.md
  - .planning/phases/90-polish-verification-sweep/90-UI-SPEC.md
  - .planning/phases/90-polish-verification-sweep/90-REVIEW.md
  - .planning/phases/90-polish-verification-sweep/90-REVIEW-DISPOSITION.md
  - .planning/phases/90-polish-verification-sweep/90-VALIDATION.md
  - .planning/phases/90-polish-verification-sweep/deferred-items.md
  - src/pages/governance.js
  - src/pages/backup.js
  - src/actions/actions.js
  - src/core/api.js
  - server.js
  - export/backup.js
  - export/restore.js
  - db-adapter.mjs
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/de.json
  - src/locales/es.json
  - src/locales/nl.json
  - docs/DEPLOY.md
  - test/governance-console.test.mjs
  - test/governance-client.test.mjs
  - test/backup-download.test.mjs
  - test/backup-checksum.test.mjs
  - test/backup-history-client.test.mjs
  - test/gfs-kept-until.test.mjs
  - test/backup-rotation-preview.test.mjs
  - test/restore-instance.test.mjs
  - test/backup-export.test.mjs
  - test/dst-cron-boundaries.test.mjs
  - test/backup-restore-fullcycle-e2e.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/client-surfaces.test.mjs
behavior_unverified_items:
  - truth: "A successful promote shows the keyed toast, removes the candidate from results and joins the roster WITHOUT a page reload (90-01 truth 4, D-90-5)"
    test: "As Super Admin, open Instance > Governance > Super Admins, type ≥2 chars, promote a candidate"
    expected: "Keyed toast settings.operator.toastPromoted; candidate leaves results; roster gains the user; no page reload (S.ui.operatorUsers refetch reconcile)"
    why_human: "Client refetch-reconcile transition — no behavioral test exercises the live DOM update; source + A.operatorPromote wiring only"
  - truth: "When the polled backup run crosses into a terminal stage, backupPollTick nulls S.ui.restoreList and the in-render kick refetches exactly once (90-03 truth 9, D-90-22)"
    test: "Start a backup run with the backup page open, watch the 1s poll reach a terminal stage"
    expected: "Restore list silently refetches exactly once on the transition; no refetch on non-terminal ticks; no page reload"
    why_human: "Ordering invariant across the 1s tick — only a region-scoped source pin exists (backup-history-client.test.mjs), no test drives the live transition"
insufficient_spec_items: # backstop markers abstained (held-out UI-state claims with no wired test)
  - "90-01 backstop A (partial): esc() half VERIFIED (governance-console.test.mjs tests 8-9 pin esc(u.name)/esc(u.email)/esc(u.id)/esc(qRaw) and forbid raw interpolation); the '.trunc + title' half is NOT implemented — grep 'title=' in src/pages/governance.js returns nothing, roster/candidate trunc spans carry no title attribute"
  - "90-01 backstop B: search input, seg control and cap note wrap without horizontal scroll at 360px — flex-wrap:wrap present in source (governance.js:145, :185) but the visual claim is unexercised"
  - "90-03 backstop A: longest-locale kept-position copy wraps within the row without clipping count figures — no held-out test; visual claim"
  - "90-03 backstop B (partial): detail rows .mono.trunc + title VERIFIED (backup.js:308); the 'list scrolls within the panel, never pushes save/cancel off-screen at 360px' half has no scroll container and no test — visual claim"
coincidental_reliance_items: []
gaps: [] # no FAILED must-have — status is human_needed on the strength of the items above
covered_digest: v2:sha256:0f26fd2e9df0c1b95f0f5e111ee823cf9f279069096412ddee728d9df9461727
re_verification:
  previous_status: human_needed
  previous_score: 36/42
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 90: Polish & Verification Sweep — Verification Report

**Phase Goal:** The trust checklist is closed — operators can verify and retrieve archives themselves, the Super Admin console backlog item ships, and the whole milestone survives a PG-parity + DST verification sweep.
**Verified:** 2026-11-23T18:45:00Z
**Status:** human_needed
**Re-verification:** Yes — delta re-verification after the two code-review warning fixes (b3a2e8fd, da20260e)

## Goal Achievement

### Observable Truths

**Plan 90-01 — Super Admins console (SACON-01 / SC-1)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Roster-first default, is_instance_admin rows only, D-118/D-119 inline stages verbatim | ✓ VERIFIED | governance.js:135 (`govSuperSeg \|\| 'admins'`), :161 filter, :174-176 operatorRevoke/operatorDemote stages; governance-console+client 31/31 pass |
| 2 | ≥2-char search ALL users by name AND email; non-admin promote-only candidates; <2 chars roster only | ✓ VERIFIED | governance.js:187 (`q.length >= 2`), :189 pinned name/email lowercase-substring expression, :192 candidates filter |
| 3 | Cap 10 + show-more (+10/click) + visible cap note; slice resets on query change | ✓ VERIFIED | governance.js:202-207 (`slice(0, shown)`, superCapNote shown/total, govSuperMore); actions.js:5640 (`IN.govOpQ` resets govSuperShown), :5657-5658 (+10) |
| 4 | Promote → keyed toast, candidate leaves, roster joins, NO reload | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | A.operatorPromote (actions.js:2849) refetch reconcile unchanged; toast present; no behavioral test drives the live transition → Human Verification #1 |
| 5 | Candidate rows carry ONLY promote — no revoke-sessions | ✓ VERIFIED | governance.js:194-198 candRow renders operatorPromote only |
| 6 | Keyed empty states (roster-empty defensive + zero-match search) | ✓ VERIFIED | governance.js:185 (superRosterEmptyTitle/Body), :208 (superNoMatchesTitle/Body via empty('search')) |
| 7 | Seg control mirrors govSeg idiom (role=group, aria-pressed, default 'admins'); roles view relocated verbatim; teardown registered | ✓ VERIFIED | governance.js:135-145 (seg markup, rolesCard() called unchanged :144), :422-424 teardown of govSuperSeg/govSuperShown, :429 ROUTE_TEARDOWN.governance |
| 8 | Loading renders aria-busy faint panel — never a fabricated roster | ✓ VERIFIED | governance.js:100 (page-level aria-busy loading panel); superRosterView returns '' until the payload arrives (:155) |
| 9 | Rendering identical 1..n admins; 10/10 no show-more, 11 → +1 slice with updated note | ✓ VERIFIED | governance.js:206-207 — cap note `Math.min(shown, total)`, show-more gated on `candidates.length > shown` (10/10 → hidden, 11 → shown with 1-row slice) |
| 10 | 12 keys page.governance.super.* ×5 locales, same-commit as markup | ✓ VERIFIED | 32 phase-90 keys grep 5/5 locales each; keys landed in commits e36f6cc9/49b06b12 (SUMMARY ledger +5/−3/+7) |
| 11 | Backstop: names/emails/query echo via .trunc + title, esc() text nodes only | ⚠️ INSUFFICIENT_SPEC (partial) | esc() half VERIFIED by wired tests (governance-console.test.mjs:138-155); **`title=` absent from roster/candidate trunc spans** (grep 'title=' governance.js → none) → Human Verification #3 |
| 12 | Backstop: search/seg/cap-note wrap at 360px | ⚠️ INSUFFICIENT_SPEC | flex-wrap:wrap in source (governance.js:145, :185); visual claim unexercised → Human Verification #4 |

**Plan 90-02 — Archive download + verify-checksum (SC-2)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server-derived location badge (local/s3/missing), client never probes | ✓ VERIFIED | historyChrome (server.js:9186 region) derives location from run-row truth; badge backup.js:170 reuses page.restore.loc* keys |
| 2 | Download CTA ONLY for location local\|s3 — missing run renders zero CTAs | ✓ VERIFIED | backup.js:180 CTA condition; test "missing run → 404" green |
| 3 | GET /api/backup/download streams with Content-Disposition via fileDisposition; zero staging on local leg | ✓ VERIFIED | server.js:9821 route; behavioral test "200 stream with the stored filename, byte-identical" PASS (live run) |
| 4 | Guard funnel copied verbatim in house order | ✓ VERIFIED | test "funnel order pinned in source" PASS; server.js:9827 throttle → :9831 capability refusal → instance tier :9855 |
| 5 | Instance-scope downloads Super-Admin-only, keyed + audited | ✓ VERIFIED | server.js:9855-9856; behavioral test "403 backupDownloadAdminOnly + audit; Super Admin → 200" PASS |
| 6 | Missing run refuses keyed restoreArchiveMissing + audit | ✓ VERIFIED | server.js:9843/:9864/:9868; behavioral test PASS |
| 7 | Success audit `backup_download:<runId>`, success-only | ✓ VERIFIED | server.js:9878; behavioral test PASS |
| 8 | Verify-checksum re-hashes hash-on-the-pipe, local (sha256AndSize) + S3 (downloadToStaged), staged temp rm-finally | ✓ VERIFIED | export/backup.js:300 export; server.js:9917 route; MinIO-gated S3 verify test PASS (live run, 7/7 with env) |
| 9 | Verify throttle verifychecksum 10/15min BEFORE capability; response discloses only ok/timestamp; preview tier, no scope restriction | ✓ VERIFIED | server.js:9921 (throttle first), :9975 persist; response { ok, checkedAt }; behavioral throttle test PASS |
| 10 | Checksum result = durable keyed badge + faint lastCheck, NO toast on result | ✓ VERIFIED | backup.js:182-183 (green/red badge + checksumLastCheck); "NO toast on the result path" comment :157-160; backup-history-client pins green |
| 11 | checksum_ok + checksum_checked_at additive trio (SCHEMA + adapterEnsureColumn + pg twin), engine-neutral | ✓ VERIFIED | server.js:809-815 + :1005-1006; db-adapter.mjs:469-474; pg-matrix green (live PG) |
| 12 | Busy state: checksumChecking label, disabled, aria-busy — never fabricated result | ✓ VERIFIED | backup.js:163 (busy flag), :165 (row aria-busy), :181 (label swap + disabled) |
| 13 | Backstop: filenames/sha256 trunc+title, sha256 12-char slice + full digest in title, esc() everywhere | ✓ VERIFIED | backup.js:178 (`slice(0, 12)` + `title="${esc(run.sha256)}"`), :90 filename trunc+title; esc() on all interpolations |

**Plan 90-03 — Retention visibility + polissages (SC-3)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Kept-position badge server-computed per request from CURRENT policy, never stored, never client-computed | ✓ VERIFIED | server.js:3931 gfsKeptPositions beside assignGfsBuckets, :9215 per-request compute; badge backup.js:167/:173 payload verbatim; gfs-kept-until 5/5 green |
| 2 | Manual task_id-null runs carry no badge (payload-flag chrome) | ✓ VERIFIED | server.js:9215 (task branch only); backup.js:167 renders only when payload carries keptPosition |
| 3 | Preview deletions → GET /api/backup/rotation-preview dry-run, STOP after candidates | ✓ VERIFIED | server.js:9239 route; mutation-freedom assertion in backup-rotation-preview.test.mjs 5/5 green (rows byte-identical, zero audit rows) |
| 4 | Four fixed groups with honest zeros; count>0 groups collapsible (aria-expanded + trunc+title rows) | ✓ VERIFIED | backup.js:293-318 (GFS_GROUP_ORDER, count always rendered, aria-expanded/:307, :308 trunc+title rows) |
| 5 | Never-run task → keyed empty state, no fabricated projection | ✓ VERIFIED | backup.js:295 (noRuns → deletionsEmpty); route returns { noRuns: true } (test PASS) |
| 6 | rotationproj throttle 10/15min; result ephemeral in S.ui cleared on save/cancel/edit | ✓ VERIFIED | server.js route throttle; actions.js:5079/:5110/:5154 clears; behavioral 429 test PASS |
| 7 | missingBlob ⚠ badge (red + triangle-alert + {n}) ONLY when payload count > 0 | ✓ VERIFIED | backup.js:172 exact conditional render |
| 8 | Writer stamps missing_blob_count at the single write site beside uploaded, before terminal, never catch path | ✓ VERIFIED | export/backup.js:827-835 (beside uploaded site, pre-terminal); backup-export writer-stamp case green |
| 9 | backupPollTick terminal-transition invalidates S.ui.restoreList (null) → in-render kick refetches once; no direct refresh in tick | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | actions.js:4846 stage compare + null; kick backup.js:614 (`!S.ui.restoreList` guard); region-scoped source pin only → Human Verification #2 |
| 10 | Backstop: longest-locale kept badge wraps, never clips figures | ⚠️ INSUFFICIENT_SPEC | no held-out test; visual claim → Human Verification #5 |
| 11 | Backstop: detail rows trunc+title; list scrolls within panel at 360px | ⚠️ INSUFFICIENT_SPEC (partial) | trunc+title VERIFIED (backup.js:308); scroll/360px half has no container/test → Human Verification #6 |

**Plan 90-04 — Verification sweep (SC-4 + SC-5)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DST matrix EU+US × spring/fall × 2026/2027 on the pure cron contract; no 03:30 substitute; fall-back first occurrence | ✓ VERIFIED | `node --test test/dst-cron-boundaries.test.mjs` — **18/18 pass, 0 skips** (run live this session) |
| 2 | 08:00 digest control fires on every transition day via localParts wall-time reads | ✓ VERIFIED | control cases green in the same run (8 control tests, one per transition date) |
| 3 | Full-cycle PG-parity e2e: task → run → S3 → local delete → s3 badge → preview → DR restore on PG; run report + zero sessions | ✓ VERIFIED | **1/1 PASS on live containers** (gr8r-pg-test:5433 + gr8r-minio-e2e:9001, run live this session, 30s) |
| 4 | E2E cleans before boot (dropPgSchema), clean-skips without env, per-file only | ✓ VERIFIED | clean-skip idiom + dropPgSchema-before-boot in the test file; executed per-file as required |
| 5 | DEPLOY.md documents timezone/NTP posture + engine distinction | ✓ VERIFIED | docs/DEPLOY.md:790 "The two backup engines", :814 "Timezone & clock posture (NTP)" — chrony + drift consequences + --backup legacy CLI named |
| 6 | All phase-90 i18n keys gated ×5 at the final gate | ✓ VERIFIED | 32 keys ×5 locales grep-confirmed; `npm test` full suite: 2385 tests, **2359 pass / 2 fail / 24 skipped** — the 2 failures are the documented pre-existing pair |

**Score:** 36/42 truths verified (2 present-behavior-unverified; 4 backstop abstentions insufficient_spec)

### Deferred Items

None. The two suite failures are pre-existing (french-typography Phase-88 S3 keys; webhook-routes health) — byte-identical at the phase-start tree a7e59e51 per deferred-items.md, NOT phase gaps. No phase gap matches a later milestone phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| src/pages/governance.js | seg-staged superAdminsView (roster + search + roles) | ✓ VERIFIED | :134-208 + teardown :422-424 |
| src/pages/backup.js | location badge, download/verify CTAs, kept badge, ⚠ badge, deletions panel | ✓ VERIFIED | :163-183, :293-318, :383 |
| server.js | 3 new routes + payload extensions + schema trio | ✓ VERIFIED | :9239 (rotation-preview), :9821 (download), :9917 (verify-checksum), :809-824/:1005-1009 |
| export/backup.js | sha256AndSize export + missingBlob stamp | ✓ VERIFIED | :300, :827-835 |
| export/restore.js | DR S3-fallback seam (90-04 Rule-1 fix) | ✓ VERIFIED | exercised live by the full-cycle e2e (uploaded-only archive restored from S3) |
| db-adapter.mjs | pg twin columns | ✓ VERIFIED | :469-480; pg-matrix green on live PG |
| docs/DEPLOY.md | two trust sections | ✓ VERIFIED | :790, :814 |
| test/dst-cron-boundaries.test.mjs | pure DST matrix | ✓ VERIFIED | 18/18 live |
| test/backup-restore-fullcycle-e2e.test.mjs | env-gated e2e | ✓ VERIFIED | 1/1 live |
| test/governance-console.test.mjs (new) + governance-client pins | source assertions | ✓ VERIFIED | 31/31 |
| test/backup-download.test.mjs + backup-checksum.test.mjs | route suites | ✓ VERIFIED | 7/7 + 7/7 offline; 14/14 with MINIO_TEST_URL |
| src/locales/*.json ×5 | 32 phase-90 keys | ✓ VERIFIED | 32/32 in each of en/fr/de/es/nl |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| governance console | S.ui.operatorUsers payload | roster/candidate client-side split (seed Option B) | WIRED | governance.js:155/:189; zero API change confirmed (server promote family untouched per 90-01 diff claim + review) |
| candidate row | A.operatorPromote reconcile | data-a="operatorPromote" | WIRED | governance.js:197 → actions.js:2849 |
| seg/slice state | ROUTE_TEARDOWN.governance | govOrphanTeardown | WIRED | governance.js:422-424, :429 |
| runRow download CTA | GET /api/backup/download | A.backupDownload → saveBlob | WIRED | backup.js:180 → actions.js:5277 |
| runRow verify CTA | POST /api/backup/verify-checksum | api.backupVerifyChecksum | WIRED | backup.js:181 → actions.js:5315-5321 → server.js:9917 |
| refusal codes | RESTORE_REFUSAL_TOASTS closed map | backupDownloadAdminOnly entry | WIRED | actions.js:4894; toast() wrap :252 pin green |
| kept badge | gfsKeptPositions | per-request history payload | WIRED | server.js:9215 → backup.js:167/:173 |
| poll tick | in-render kick | S.ui.restoreList = null → refreshRestoreBackups guard | WIRED | actions.js:4846 → backup.js:614 |
| full-cycle e2e | downloadToStaged + dropPgSchema | env-gated seams | WIRED | live-container PASS |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Roster/candidates | S.ui.operatorUsers | GET /api/auth/operator/users | Yes | ✓ FLOWING |
| Location badge | run.location | server-side fs.existsSync/uploaded derivation | Yes | ✓ FLOWING |
| Checksum badge | run.checksum_ok / checksum_checked_at | backup_runs columns persisted by the verify route | Yes | ✓ FLOWING |
| Kept badge | run.keptPosition | gfsKeptPositions over live backup_runs rows | Yes | ✓ FLOWING |
| Deletions panel | S.ui.backupDeletions | GET /api/backup/rotation-preview over live runs | Yes | ✓ FLOWING |

No static fallbacks, no hollow props — every rendered value traces to a live DB/payload source.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| DST matrix | `node --test test/dst-cron-boundaries.test.mjs` | 18 pass / 0 fail / 0 skip | ✓ PASS |
| Governance console + client | `node --test test/governance-console.test.mjs test/governance-client.test.mjs` | 31 pass / 0 fail | ✓ PASS |
| Download + checksum (S3 legs) | `MINIO_TEST_URL=… node --test test/backup-download.test.mjs test/backup-checksum.test.mjs` | 14 pass / 0 fail (first concurrent run hit one staging-dir assertion flake — cross-file race on the shared restore-staging dir; per-file runs clean 7/7 + 7/7; same family as the documented 89-05/webhook flakes) | ✓ PASS |
| Full-cycle PG e2e | `POSTGRES_TEST_URL=… MINIO_TEST_URL=… node --test test/backup-restore-fullcycle-e2e.test.mjs` (per-file) | 1 pass / 0 fail on live containers | ✓ PASS |
| Full offline suite (final D-90-20 gate) | `npm test` (run once) | 2385 tests: 2359 pass / 2 fail / 24 skipped — both failures are the documented pre-existing pair (french-typography, webhook-routes health) | ✓ PASS (baseline) |

### Probe Execution

SKIPPED — no `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase; the runnable checks are the node:test suites above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SACON-01 | 90-01 | Super Admin console lists Super Admins by default; search by name+email; promote candidates with cap + show-more; keyed toast; no-reload reconcile | ✓ SATISFIED | governance.js:134-208 (all behaviors code-verified; the live no-reload transition itself is Human Verification #1); REQUIREMENTS.md:83 marks it Complete for Phase 90 |
| SC-1 | 90-01 | Roster-first console (ROADMAP success criterion) | ✓ SATISFIED | see Plan 90-01 truths 1-10 |
| SC-2 | 90-02 | Verify-checksum action + archive download tiered above run rights | ✓ SATISFIED | see Plan 90-02 truths 1-13 |
| SC-3 | 90-03 | Rotation preview + kept-until retention visibility | ✓ SATISFIED | see Plan 90-03 truths 1-8 |
| SC-4 | 90-04 | PG-parity e2e + DST cron tests + keys gated ×5 | ✓ SATISFIED | see Plan 90-04 truths 1-2, 3, 6 |
| SC-5 | 90-04 | DEPLOY.md NTP posture + engine distinction | ✓ SATISFIED | see Plan 90-04 truth 5 |

No orphaned requirements — REQUIREMENTS.md maps only SACON-01 to Phase 90 and no plan omitted it; SC-1..5 are ROADMAP success criteria (not REQUIREMENTS.md IDs) and all five are accounted for above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/pages/governance.js | :162-172 | Dead non-admin branch in rosterRow (IN-01) | ℹ️ Info | Unreachable render path; polish |
| server.js | :9878-9882 | Audit-before-stream TOCTOU (IN-02) | ℹ️ Info | D-90-10 audit contract; hardening backlog |
| server.js / src/pages/backup.js | :9186/:175 | `deleted` runs with S3 copy render live CTAs (IN-03) | ℹ️ Info | Semantic wrinkle, owner decision |
| src/actions/actions.js | :5343 | Preview button no busy guard (IN-04) | ℹ️ Info | Throttle covers server cost |
| export/restore.js | :2055-2094 | WR-01: staged S3 temp leaks on 4 failure exits (disposition: **fixed** — b3a2e8fd, verified post-fix, see below) | ⚠️→✓ | Fix verified with file:line evidence; regression test green |
| src/actions/actions.js | :5343-5363 | WR-02: stale-projection race re-stages after cancel (disposition: **fixed** — da20260e, verified post-fix, see below) | ⚠️→✓ | Fix verified with file:line evidence; regression test green |

No TBD/FIXME/XXX debt markers in any phase-modified file; zero new npm dependencies.

### Human Verification Required

### 1. Promote no-reload reconcile (SACON-01 behavior; also the VALIDATION.md manual UX item)

**Test:** As Super Admin: Instance > Governance > Super Admins → type 1 char (roster only), then ≥2 chars (candidates appear, capped 10 with cap note, show-more reveals +10) → promote a candidate.
**Expected:** Keyed toast; candidate leaves results; roster gains the user; no page reload; search reverts to roster-only below 2 chars.
**Why human:** Client refetch-reconcile DOM transition — no behavioral test drives it.

### 2. Restore-list invalidation on terminal backup run (D-90-22)

**Test:** With the backup page open, start a run and watch it reach a terminal stage.
**Expected:** The restore list refetches exactly once on the active→terminal transition; no refetch on non-terminal ticks; no reload.
**Why human:** Ordering invariant across the 1s tick; only a region-scoped source pin exists.

### 3. Governance rows `.trunc + title` backstop — explicit deviation found

**Test:** Hover a truncated roster/candidate name or email.
**Expected (per the plan truth):** full value in a title tooltip. **Actual:** `title=` is absent from roster/candidate trunc spans (grep 'title=' in governance.js → none) — the esc() half is test-pinned, the title half was not implemented. Decide: add title attributes or amend the backstop statement.
**Why human:** cosmetic-contract decision; the code does not match the stated must-have wording.

### 4. 360px wrap backstop (console)

**Test:** At 360px width, type a long search query with ≥10 candidates.
**Expected:** search input, seg control and cap note wrap; no horizontal scroll.
**Why human:** visual UI-state claim, no held-out test.

### 5. Longest-locale kept-badge wrap backstop

**Test:** Switch locale to de/nl, view history rows with kept badges.
**Expected:** `kept: 3/7 monatlich`-class copy wraps within the row; figures never clipped.
**Why human:** visual claim across locales.

### 6. Projection detail-list scroll backstop (partial)

**Test:** Preview deletions on a task with many runs; expand a group at 360px.
**Expected (per plan truth):** detail list scrolls within the panel, save/cancel stays on-screen. Note: the markup has no scroll container — verify actual behavior and either add one or amend the truth (the trunc+title half IS implemented, backup.js:308).
**Why human:** visual/overflow claim.

### 7. DEPLOY.md accuracy (from VALIDATION.md manual list)

**Test:** Owner reads the two new §9 subsections against the real crontab and the `--backup` CLI behavior.
**Expected:** Sections match reality.
**Why human:** doc prose accuracy, not code.

### Gaps Summary

No FAILED must-haves — every route, column, chrome surface, i18n key, test file and doc section claimed by the four SUMMARYs exists, is substantive, and is wired, and the behavioral suites were re-run live by the verifier (DST 18/18, governance 31/31, download+checksum 14/14 with MinIO, full-cycle PG e2e 1/1, npm test 2359/2/24 with only the two documented pre-existing failures). The phase goal is achieved in code.

Status is human_needed, not passed, because: (a) two behavior-dependent truths (promote no-reload reconcile; restore-list refetch-once) have no behavioral test and route to human verification per the honest-verifier contract; (b) four backstop markers abstained as insufficient_spec — including one explicit deviation (missing `title=` on governance trunc rows, Human Verification #3) that a human should accept or fix. The two open review warnings (WR-01 staged-temp leak on failure exits; WR-02 stale-projection race) do not invalidate any must-have but are real defects tracked in 90-REVIEW-DISPOSITION.md — recommend closing both before ship.

## Post-review fix re-verification

**Delta re-verification** (2026-11-23T18:06:46Z) after two fix commits. Previously verified must-haves kept; 3 spot-checked against the live tree — no drift (governance.js:190 `q.length >= 2` [was :187, shift only]; export/backup.js:300 `sha256AndSize` exact; actions.js:5083/:5114/:5158 ephemeral clears exact). Neither fix broke a previously verified must-have; the 7 human items remain → status stays `human_needed`.

### Fix commits

| Commit | Finding | Files |
| ------ | ------- | ----- |
| b3a2e8fd | WR-01 — DR S3-fallback staged-temp leak on early failure exits | export/restore.js, test/restore-instance.test.mjs |
| da20260e | WR-02 — stale rotation-projection race (re-stages after cancel/save/new/edit) | src/actions/actions.js, test/backup-rotation-preview.test.mjs |

### Per-fix verdicts — verified_with_evidence

**WR-01: ✓ VERIFIED.** Every exit between `stagedTmp` creation (export/restore.js:2037) and commit/cleanup now drops the staged temp:

| Exit | Drop mechanism | Evidence |
| ---- | -------------- | -------- |
| downloadToStaged throw | explicit `dropStagedTmp()` | restore.js:2039 |
| archive-missing at :2043 | nothing to leak — `stagedTmp` points at a nonexistent file (downloadToStaged digest-verifies before returning, so a set `stagedTmp` always exists here) | restore.js:2043-2045 |
| pre-DR snapshot `!snapshot.ok` return | explicit `dropStagedTmp()` (predates `cleanup`'s declaration) | restore.js:2059 (the fix) |
| snapshot-block catch | explicit `dropStagedTmp()` before rmStaging(swap/staging) | restore.js:2074 (the fix) |
| verify-fail / targetMismatch / remap / blob / swap / tx-catch / unexpected-throw | ride the `cleanup()` funnel, now folding `dropStagedTmp()` first | restore.js:2091 + exits :2106, :2111, :2125-2126, :2144, :2171, :2300, :2336, :2413+:2419, :2467-2468 |
| success path | `dropStagedTmp()` only POST-commit :2424; `cleanup()` success sweep :2451 is a no-op then (stagedTmp already null) | restore.js:2424, :2451 |

D-89-30 in-tx re-hash semantics preserved: `cleanup()` never executes on the success path before the in-tx `sha256File(archivePath)` at restore.js:2406 — its only pre-commit calls are failure-path returns (:2106, :2111, :2125, :2144, :2171, :2300, :2336, :2419), and the success-path call (:2451) follows the post-commit drop (:2424). Refusal classes untouched (every `cleanup()` precedes a `return failWith(...)`).

**WR-02: ✓ VERIFIED.** The stale guard covers both staging writes and the defense-in-depth clear is in place:

- Request-side gate: `const form = S.ui.backupTaskForm; if (!form || form.editing !== taskId) return;` — actions.js:5355-5356.
- Post-await form-identity guard sits BEFORE every write: `if (S.ui.backupTaskForm !== form) return;` — actions.js:5361; both the refusal-clear (`S.ui.backupDeletions = null`, :5363) and the result-staging (:5368) execute only after it. Cancel (5112-5114 → form = null), edit (5085 → new object), save (5157 → null), new (5073 → fresh object) and task-delete (5204 → null) all reassign the form, so a mid-flight response always fails the identity check.
- Defense in depth: `A.backupTaskNew` clears `S.ui.backupDeletions = null` — actions.js:5077.

### Regression suites — per-file, this tree (2026-11-23T18:06Z)

| Suite | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| restore-instance (WR-01 regression) | `node --test test/restore-instance.test.mjs` | 10 pass / 0 fail / 0 skip — includes "90-review WR-01: the staged S3-fallback temp never outlives the response on the post-download failure exits" | ✓ PASS |
| backup-rotation-preview (WR-02 regression) | `node --test test/backup-rotation-preview.test.mjs` | 6 pass / 0 fail / 0 skip — includes "90-review WR-02: the preview action stage-guards its response on the mounted form" (pins guard-after-await + every staging write behind it + backupTaskNew clear) | ✓ PASS |
| backup-export | `node --test test/backup-export.test.mjs` | 14 pass / 0 fail / 0 skip | ✓ PASS |
| gfs-kept-until | `node --test test/gfs-kept-until.test.mjs` | 5 pass / 0 fail / 0 skip | ✓ PASS |

No env-gated extras required — all four suites are self-contained offline. Per-file execution as established; no `--test-concurrency` overrides.

### Verdict

Both fixes verified_with_evidence against the live tree; zero regressions in the previously verified 36 must-haves; the documented pre-existing pair remains the only suite failures. The two review warnings are closed — no new gaps. Status remains **human_needed** (the 7 human items stand unchanged).

Observed during verification (advisory, non-blocking): running `backup-download.test.mjs` and `backup-checksum.test.mjs` concurrently in one `node --test` invocation failed once on a shared restore-staging-dir emptiness assertion and passes per-file — same cross-file shared-state family as the documented 89-05/webhook flakes; per-file execution (the established discipline) is clean.

---

_Verified: 2026-11-23T18:45:00Z (initial) · 2026-11-23T18:06:46Z (post-review fix re-verification)_
_Verifier: the agent (gsd-verifier)_
