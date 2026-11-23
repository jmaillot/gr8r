---
phase: 90-polish-verification-sweep
verified: 2026-11-23T19:10:05Z
status: passed
score: 42/42 must-haves verified
behavior_unverified: 0
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
covered_digest: v2:sha256:a50e3d9a90d6ae81da63a624a2030f6aec435a7e2bca118f55f361c3c844f7b1
re_verification:
  previous_status: passed # canonicalized per #4663 after UAT 7/7 (90-UAT.md complete); file content was stale — covered source files drifted after the last verifier run
  previous_score: 36/42
  gaps_closed:
    - "90-01 truth 4 — promote no-reload reconcile (behavior-driven PASS, UAT item 1)"
    - "90-01 truth 11 — backstop title= half implemented by 69b6b95c + test-pinned + live re-drive"
    - "90-01 truth 12 — backstop 360px wrap (UAT item 4, measured)"
    - "90-03 truth 9 — restore-list invalidation keys on run identity (fb356ee9), behavior-driven PASS (UAT item 2)"
    - "90-03 truth 10 — backstop longest-locale kept-badge wrap (UAT item 5, measured)"
    - "90-03 truth 11 — backstop scroll half implemented by cf1ba1b5 + test-pinned + live re-drive"
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 90: Polish & Verification Sweep — Verification Report

**Phase Goal:** The trust checklist is closed — operators can verify and retrieve archives themselves, the Super Admin console backlog item ships, and the whole milestone survives a PG-parity + DST verification sweep.
**Verified:** 2026-11-23T19:10:05Z
**Status:** passed
**Re-verification:** Yes — post-UAT re-verification after three fix commits (fb356ee9, cf1ba1b5, 69b6b95c); digest recomputed over the current tree

## Goal Achievement

### Observable Truths

**Plan 90-01 — Super Admins console (SACON-01 / SC-1)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Roster-first default, is_instance_admin rows only, D-118/D-119 inline stages verbatim | ✓ VERIFIED | governance.js:135 (`govSuperSeg \|\| 'admins'`), :161 filter, :174-176 operatorRevoke/operatorDemote stages; governance console+client 32/32 pass (re-run this session) |
| 2 | ≥2-char search ALL users by name AND email; non-admin promote-only candidates; <2 chars roster only | ✓ VERIFIED | governance.js:187 (`q.length >= 2`), :189 pinned name/email lowercase-substring expression, :192 candidates filter |
| 3 | Cap 10 + show-more (+10/click) + visible cap note; slice resets on query change | ✓ VERIFIED | governance.js:202-207 (`slice(0, shown)`, superCapNote shown/total, govSuperMore); actions.js IN.govOpQ resets govSuperShown, +10 step |
| 4 | Promote → keyed toast, candidate leaves, roster joins, NO reload | ✓ VERIFIED | Behavior-driven PASS: UAT item 1 (Playwright headless) — promote showed keyed toast, Bob joined roster, left candidates, `window.__uat_marker_90` stayed `alive` (zero reload); source wiring unchanged (A.operatorPromote refetch reconcile) |
| 5 | Candidate rows carry ONLY promote — no revoke-sessions | ✓ VERIFIED | governance.js candRow renders operatorPromote only (:194-198 region) |
| 6 | Keyed empty states (roster-empty defensive + zero-match search) | ✓ VERIFIED | governance.js:185 (superRosterEmptyTitle/Body), :208 (superNoMatchesTitle/Body via empty('search')) |
| 7 | Seg control mirrors govSeg idiom (role=group, aria-pressed, default 'admins'); roles view relocated verbatim; teardown registered | ✓ VERIFIED | governance.js:135-145 (seg markup, rolesCard() called unchanged :144), teardown of govSuperSeg/govSuperShown + ROUTE_TEARDOWN.governance |
| 8 | Loading renders aria-busy faint panel — never a fabricated roster | ✓ VERIFIED | governance.js:100 (page-level aria-busy loading panel); superRosterView returns '' until the payload arrives (:155) |
| 9 | Rendering identical 1..n admins; 10/10 no show-more, 11 → +1 slice with updated note | ✓ VERIFIED | governance.js:206-207 — cap note `Math.min(shown, total)`, show-more gated on `candidates.length > shown` |
| 10 | 12 keys page.governance.super.* ×5 locales, same-commit as markup | ✓ VERIFIED | 32 phase-90 keys grep 5/5 locales each; keys landed in commits e36f6cc9/49b06b12 (SUMMARY ledger +5/−3/+7) |
| 11 | Backstop: names/emails/query echo via .trunc + title, esc() text nodes only | ✓ VERIFIED | Deviation closed by 69b6b95c: roster row :164 and candidate row :195 now carry `title="${esc(u.name \|\| '')}"` / `title="${esc(u.email)}"` on both truncating cells; esc() discipline preserved and pinned same-commit (governance-console "console roster + candidate rows carry title= on their truncating cells (90-UAT item 3)"); live re-drive observed `title="Admin"` / `title="root@uat.local"` |
| 12 | Backstop: search/seg/cap-note wrap at 360px | ✓ VERIFIED | Behavior-driven PASS: UAT item 4 (Playwright headless, 360×800, locale de) — docWidth 360 = viewport 360, `pageOverflowX: false`; flex-wrap:wrap in source (governance.js:145, :185) |

**Plan 90-02 — Archive download + verify-checksum (SC-2)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server-derived location badge (local/s3/missing), client never probes | ✓ VERIFIED | historyChrome (server.js:9186 region) derives location from run-row truth; badge backup.js:170 reuses page.restore.loc* keys — file unchanged by post-UAT fixes (digest drift confined to 3 source files, see Post-UAT section) |
| 2 | Download CTA ONLY for location local\|s3 — missing run renders zero CTAs | ✓ VERIFIED | backup.js:180 CTA condition; test "missing run → 404" green |
| 3 | GET /api/backup/download streams with Content-Disposition via fileDisposition; zero staging on local leg | ✓ VERIFIED | server.js:9821 route; behavioral test "200 stream with the stored filename, byte-identical" PASS (live run) |
| 4 | Guard funnel copied verbatim in house order | ✓ VERIFIED | server.js:9827 throttle → :9831 capability refusal → instance tier :9855; funnel-order source pin green |
| 5 | Instance-scope downloads Super-Admin-only, keyed + audited | ✓ VERIFIED | server.js:9855-9856; behavioral test "403 backupDownloadAdminOnly + audit; Super Admin → 200" PASS |
| 6 | Missing run refuses keyed restoreArchiveMissing + audit | ✓ VERIFIED | server.js:9843/:9864/:9868; behavioral test PASS |
| 7 | Success audit `backup_download:<runId>`, success-only | ✓ VERIFIED | server.js:9878; behavioral test PASS |
| 8 | Verify-checksum re-hashes hash-on-the-pipe, local (sha256AndSize) + S3 (downloadToStaged), staged temp rm-finally | ✓ VERIFIED | export/backup.js:300 export; server.js:9917 route; MinIO-gated S3 verify test PASS (live run) |
| 9 | Verify throttle verifychecksum 10/15min BEFORE capability; response discloses only ok/timestamp; preview tier, no scope restriction | ✓ VERIFIED | server.js:9921 (throttle first), :9975 persist; response { ok, checkedAt }; behavioral throttle test PASS |
| 10 | Checksum result = durable keyed badge + faint lastCheck, NO toast on result | ✓ VERIFIED | backup.js:182-183 (green/red badge + checksumLastCheck); backup-history-client pins green |
| 11 | checksum_ok + checksum_checked_at additive trio (SCHEMA + adapterEnsureColumn + pg twin), engine-neutral | ✓ VERIFIED | server.js:809-815 + :1005-1006; db-adapter.mjs:469-474; pg-matrix green (live PG) |
| 12 | Busy state: checksumChecking label, disabled, aria-busy — never fabricated result | ✓ VERIFIED | backup.js:163 (busy flag), :165 (row aria-busy), :181 (label swap + disabled) |
| 13 | Backstop: filenames/sha256 trunc+title, sha256 12-char slice + full digest in title, esc() everywhere | ✓ VERIFIED | backup.js:178 (`slice(0, 12)` + `title="${esc(run.sha256)}"`), :90 filename trunc+title |

**Plan 90-03 — Retention visibility + polissages (SC-3)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Kept-position badge server-computed per request from CURRENT policy, never stored, never client-computed | ✓ VERIFIED | server.js:3931 gfsKeptPositions, :9215 per-request compute; badge backup.js:167/:173 payload verbatim; gfs-kept-until 5/5 green |
| 2 | Manual task_id-null runs carry no badge (payload-flag chrome) | ✓ VERIFIED | server.js:9215 (task branch only); backup.js:167 renders only when payload carries keptPosition |
| 3 | Preview deletions → GET /api/backup/rotation-preview dry-run, STOP after candidates | ✓ VERIFIED | server.js:9239 route; mutation-freedom assertion green (rows byte-identical, zero audit rows) |
| 4 | Four fixed groups with honest zeros; count>0 groups collapsible (aria-expanded + trunc+title rows) | ✓ VERIFIED | backup.js:293-318 (GFS_GROUP_ORDER, aria-expanded/:307, :309 trunc+title rows) |
| 5 | Never-run task → keyed empty state, no fabricated projection | ✓ VERIFIED | backup.js:295 (noRuns → deletionsEmpty); route returns { noRuns: true } |
| 6 | rotationproj throttle 10/15min; result ephemeral in S.ui cleared on save/cancel/edit | ✓ VERIFIED | server.js route throttle; actions.js clears on save/cancel/edit; behavioral 429 test PASS |
| 7 | missingBlob ⚠ badge (red + triangle-alert + {n}) ONLY when payload count > 0 | ✓ VERIFIED | backup.js:172 exact conditional render |
| 8 | Writer stamps missing_blob_count at the single write site beside uploaded, before terminal, never catch path | ✓ VERIFIED | export/backup.js:827-835; backup-export writer-stamp case green |
| 9 | backupPollTick invalidates S.ui.restoreList when a finished run lands → in-render kick refetches once; no direct refresh in tick | ✓ VERIFIED | Fix fb356ee9: invalidation keys on run IDENTITY (`startedAt`) — actions.js:4859 (`backupPrevRunId` captured before payload write), :4860-4862 (`backupFinishedArrived = !backupActive && !!backupNowRunId && backupNowRunId !== backupPrevRunId` → `S.ui.restoreList = null`). Covers BOTH UAT-90 shapes (trigger-POST-terminal first poll; terminal→terminal run N+1); a settled run repeating its identity never re-invalidates (exactly-once). Tick still never calls the refresh action (Pitfall 8); kick backup.js:614 (`!S.ui.restoreList` guard). Behavior-driven PASS: UAT item 2 live re-drive — fetches = initial + exactly one per finished run, no refetch loop. Source pins in backup-history-client.test.mjs:314/:316 (16/16 pass, re-run this session) |
| 10 | Backstop: longest-locale kept badge wraps, never clips figures | ✓ VERIFIED | Behavior-driven PASS: UAT item 5 (Playwright headless, 360px, locale de) — « behalten: 1/7 täglich »-class badges, badge 137×16px, `badgeOverflowX: false`, `pageOverflowX: false` |
| 11 | Backstop: detail rows trunc+title; list scrolls within panel at 360px | ✓ VERIFIED | Both halves closed: trunc+title backup.js:309; scroll container added by cf1ba1b5 — `#backupDel-*` expanded detail carries `max-height:220px;overflow-y:auto` (backup.js:309). Test pinned same-commit (backup-rotation-preview "90-UAT item 6: the expanded projection detail list scrolls within the panel", 7/7 pass, re-run this session); live re-drive: 33 rows, clientH 220 vs scrollH 598 → scrolls, `pageOverflowX: false` |

**Plan 90-04 — Verification sweep (SC-4 + SC-5)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DST matrix EU+US × spring/fall × 2026/2027 on the pure cron contract; no 03:30 substitute; fall-back first occurrence | ✓ VERIFIED | `node --test test/dst-cron-boundaries.test.mjs` — 18/18 pass, 0 skips (live run at initial verification; file unchanged since — digest confirms) |
| 2 | 08:00 digest control fires on every transition day via localParts wall-time reads | ✓ VERIFIED | 8 control cases, one per transition date, green in the same run |
| 3 | Full-cycle PG-parity e2e: task → run → S3 → local delete → s3 badge → preview → DR restore on PG; run report + zero sessions | ✓ VERIFIED | 1/1 PASS on live containers (gr8r-pg-test:5433 + gr8r-minio-e2e:9001; live run at initial verification; test file unchanged since) |
| 4 | E2E cleans before boot (dropPgSchema), clean-skips without env, per-file only | ✓ VERIFIED | clean-skip idiom + dropPgSchema-before-boot in the test file |
| 5 | DEPLOY.md documents timezone/NTP posture + engine distinction | ✓ VERIFIED | docs/DEPLOY.md:790 "The two backup engines", :814 "Timezone & clock posture (NTP)"; owner re-read both §9 additions against deployment reality — PASS (UAT item 7, owner verify row D-90-21) |
| 6 | All phase-90 i18n keys gated ×5 at the final gate | ✓ VERIFIED | 32 keys ×5 locales grep-confirmed; full `npm test` baseline: only the two documented pre-existing failures (see Deferred Items) |

**Score:** 42/42 truths verified (0 present-behavior-unverified — all six previously-unverified items closed with behavioral or owner evidence; see Post-UAT Fix Re-Verification)

### Deferred Items

None. The two suite failures are pre-existing (french-typography Phase-88 S3 keys; webhook-routes health) — byte-identical at the phase-start tree a7e59e51 per deferred-items.md, NOT phase gaps. No phase gap matches a later milestone phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| src/pages/governance.js | seg-staged superAdminsView (roster + search + roles) + title= on trunc cells | ✓ VERIFIED | :134-208 + teardown; title= at :164/:195 (69b6b95c) |
| src/pages/backup.js | location badge, download/verify CTAs, kept badge, ⚠ badge, deletions panel with scroll container | ✓ VERIFIED | :163-183, :293-318 (scroll container :309, cf1ba1b5), :614 kick |
| server.js | 3 new routes + payload extensions + schema trio | ✓ VERIFIED | :9239 (rotation-preview), :9821 (download), :9917 (verify-checksum), :809-824/:1005-1009 |
| src/actions/actions.js | promote reconcile, ephemeral clears, identity-keyed poll invalidation | ✓ VERIFIED | backupPollTick :4791-4862 (fb356ee9); clears + WR-02 guard intact |
| export/backup.js | sha256AndSize export + missingBlob stamp | ✓ VERIFIED | :300, :827-835 |
| export/restore.js | DR S3-fallback seam + WR-01 staged-temp funnel (b3a2e8fd) | ✓ VERIFIED | exercised live by the full-cycle e2e; post-fix verification below |
| db-adapter.mjs | pg twin columns | ✓ VERIFIED | :469-480; pg-matrix green on live PG |
| docs/DEPLOY.md | two trust sections | ✓ VERIFIED | :790, :814; owner-confirmed conformant (UAT item 7) |
| src/locales/*.json ×5 | 32 phase-90 keys | ✓ VERIFIED | 32/32 in each of en/fr/de/es/nl |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| governance console | S.ui.operatorUsers payload | roster/candidate client-side split (seed Option B) | WIRED | governance.js:155/:189; zero API change |
| candidate row | A.operatorPromote reconcile | data-a="operatorPromote" | WIRED | governance.js candRow → actions.js A.operatorPromote; behavior UAT-verified |
| seg/slice state | ROUTE_TEARDOWN.governance | govOrphanTeardown | WIRED | governance.js teardown + :429 |
| runRow download CTA | GET /api/backup/download | A.backupDownload → saveBlob | WIRED | backup.js:180 → actions.js |
| runRow verify CTA | POST /api/backup/verify-checksum | api.backupVerifyChecksum | WIRED | backup.js:181 → actions.js → server.js:9917 |
| refusal codes | RESTORE_REFUSAL_TOASTS closed map | backupDownloadAdminOnly entry | WIRED | actions.js; toast() wrap pin green |
| kept badge | gfsKeptPositions | per-request history payload | WIRED | server.js:9215 → backup.js:167/:173 |
| poll tick | in-render kick | S.ui.restoreList = null (identity-keyed) → refreshRestoreBackups guard | WIRED | actions.js:4860-4862 (fb356ee9) → backup.js:614; behavior UAT-verified |
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
| Restore-list identity-keyed invalidation | `node --test test/backup-history-client.test.mjs` | 16 pass / 0 fail — pins `backupPrevRunId` capture-before-write (:314) and the `backupFinishedArrived` identity compare (:316) | ✓ PASS |
| Projection scroll container | `node --test test/backup-rotation-preview.test.mjs` | 7 pass / 0 fail — includes "90-UAT item 6: the expanded projection detail list scrolls within the panel" | ✓ PASS |
| Governance title= + esc discipline | `node --test test/governance-console.test.mjs test/governance-client.test.mjs` | 32 pass / 0 fail — includes "console roster + candidate rows carry title= on their truncating cells (90-UAT item 3)" | ✓ PASS |
| Download route regression (backup.js touched) | `node --test test/backup-download.test.mjs` | pass / 0 fail / 1 skip (MinIO-gated leg; offline) | ✓ PASS |
| DST matrix | `node --test test/dst-cron-boundaries.test.mjs` | 18 pass / 0 fail / 0 skip (initial verification; file unchanged since per digest) | ✓ PASS |
| Full offline suite (final D-90-20 gate) | `npm test` (run once, initial verification) | 2385 tests: 2359 pass / 2 fail / 24 skipped — both failures are the documented pre-existing pair | ✓ PASS (baseline) |
| UAT behavioral drives | Playwright headless per 90-UAT.md | 7/7 PASS (items 2, 3, 6 after same-commit fixes) | ✓ PASS |

### Probe Execution

SKIPPED — no `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase; the runnable checks are the node:test suites above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SACON-01 | 90-01 | Super Admin console lists Super Admins by default; search by name+email; promote candidates with cap + show-more; keyed toast; no-reload reconcile | ✓ SATISFIED | governance.js:134-208 — all behaviors code-verified AND the live no-reload transition behavior-driven PASS (UAT item 1, Playwright); REQUIREMENTS.md maps SACON-01 to Phase 90 |
| SC-1 | 90-01 | Roster-first console (ROADMAP success criterion) | ✓ SATISFIED | see Plan 90-01 truths 1-12 |
| SC-2 | 90-02 | Verify-checksum action + archive download tiered above run rights | ✓ SATISFIED | see Plan 90-02 truths 1-13 |
| SC-3 | 90-03 | Rotation preview + kept-until retention visibility | ✓ SATISFIED | see Plan 90-03 truths 1-11 |
| SC-4 | 90-04 | PG-parity e2e + DST cron tests + keys gated ×5 | ✓ SATISFIED | see Plan 90-04 truths 1-4, 6 |
| SC-5 | 90-04 | DEPLOY.md NTP posture + engine distinction | ✓ SATISFIED | see Plan 90-04 truth 5 (+ UAT item 7 owner confirm) |

No orphaned requirements — REQUIREMENTS.md maps only SACON-01 to Phase 90 and no plan omitted it; SC-1..5 are ROADMAP success criteria and all five are accounted for above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/pages/governance.js | :162-172 | Dead non-admin branch in rosterRow (IN-01) | ℹ️ Info | Unreachable render path; polish |
| server.js | :9878-9882 | Audit-before-stream TOCTOU (IN-02) | ℹ️ Info | D-90-10 audit contract; hardening backlog |
| server.js / src/pages/backup.js | :9186/:175 | `deleted` runs with S3 copy render live CTAs (IN-03) | ℹ️ Info | Semantic wrinkle, owner decision |
| src/actions/actions.js | :5343 region | Preview button no busy guard (IN-04) | ℹ️ Info | Throttle covers server cost |
| export/restore.js | staged-temp funnel | WR-01: staged S3 temp leak on failure exits — **fixed** (b3a2e8fd), regression suite green | ⚠️→✓ | Closed |
| src/actions/actions.js | preview stage | WR-02: stale-projection race — **fixed** (da20260e), regression suite green | ⚠️→✓ | Closed |

No TBD/FIXME/XXX debt markers in any phase-modified file (re-checked this session over the three post-UAT-touched files); zero new npm dependencies.

## Post-UAT Fix Re-Verification

**Delta re-verification** (2026-11-23T19:10Z) after UAT completed 7/7 (90-UAT.md status complete) and three fix commits landed. Prior state: 36/42 verified, 2 behavior-unverified, 4 backstop abstentions — all six now closed with behavioral or owner evidence. Scope of post-verification drift verified via `git show --name-only`: exactly src/actions/actions.js, src/pages/backup.js, src/pages/governance.js + 3 same-commit test files + 90-UAT.md — no other covered file moved, so the 36 previously verified truths carry over with zero regressions.

### Fix commits

| Commit | Finding | Files | Same-commit test |
| ------ | ------- | ----- | ---------------- |
| fb356ee9 | Restore-list invalidation keys on run identity (startedAt) — covers trigger-POST-terminal first poll AND terminal→terminal run N+1 (the two shapes invisible to a stage-only compare; UAT item 2 finding) | src/actions/actions.js | test/backup-history-client.test.mjs — 16/16 green (re-run this session) |
| cf1ba1b5 | Projection detail list scrolls within the panel — `max-height:220px;overflow-y:auto` on `#backupDel-*` (UAT item 6 finding: 33 candidates pushed the page) | src/pages/backup.js | test/backup-rotation-preview.test.mjs — 7/7 green (re-run this session) |
| 69b6b95c | Governance roster/candidate rows carry `title=` on truncating name/email cells (UAT item 3 — owner chose fix; esc() discipline preserved) | src/pages/governance.js | test/governance-console.test.mjs — 32/32 green console+client (re-run this session) |

(An earlier narrow fix 50c9d0f7 for the same UAT item 2 was superseded by fb356ee9's identity-keying.)

### Per-fix verdicts — verified_with_evidence

**fb356ee9: ✓ VERIFIED.** `backupPrevRunId = S.ui.backupRun?.startedAt || null` captured BEFORE the payload write (actions.js:4859); after the fetch, `backupFinishedArrived = !backupActive && !!backupNowRunId && backupNowRunId !== backupPrevRunId` gates `S.ui.restoreList = null` (:4860-4862). Identity change catches both real-world shapes; identity REPEAT on a settled terminal run keeps the tick silent (exactly-once per finished run preserved). The tick still never invokes the refresh action itself (Pitfall 8); the in-render kick (backup.js:614 `!S.ui.restoreList` guard) refetches at the render boundary. Behavior-driven PASS: UAT item 2 live re-drive — page load 1 initial fetch; trigger → run done → list refetched with the NEW archive; no refetch loop across subsequent 1s ticks.

**cf1ba1b5: ✓ VERIFIED.** backup.js:309 — the expanded per-scale detail container now carries `style="padding:4px 0 0 16px;max-height:220px;overflow-y:auto"`; each row stays `mono trunc` + `title="${esc(r.filename || '')}"`. Behavior-driven PASS: UAT item 6 live re-drive — 33 rows, clientH 220 vs scrollH 598 → scrolls within the panel, `pageOverflowX: false`.

**69b6b95c: ✓ VERIFIED.** governance.js:164 (roster row) and :195 (candidate row) — both truncating cells (name + email) carry `title="${esc(...)}"`; esc() discipline preserved on every interpolation. Test-pinned same-commit (governance-console "console roster + candidate rows carry title=…"); live re-drive observed `title="Admin"` / `title="root@uat.local"`.

### Human Verification Resolution

All 7 human-verification items from the prior report are CLOSED per 90-UAT.md (status: complete, 7/7 PASS):

| Prior item | Resolution |
| ---------- | ---------- |
| 1. Promote no-reload reconcile | PASS — Playwright headless; `__uat_marker_90` stayed alive (zero reload) |
| 2. Restore-list invalidation | PASS after fix fb356ee9 — exactly-once refetch per finished run, live re-drive |
| 3. Governance `.trunc + title` deviation | Owner chose FIX → 69b6b95c → PASS (live re-drive) |
| 4. 360px wrap backstop (console) | PASS — measured, no horizontal overflow |
| 5. Longest-locale kept-badge wrap | PASS — measured (de), `badgeOverflowX: false` |
| 6. Projection detail-list scroll | PASS after fix cf1ba1b5 — measured scroll container |
| 7. DEPLOY.md accuracy | PASS — owner verify row (D-90-21) |

### Regression suites — per-file, this tree (2026-11-23T19:10Z)

| Suite | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| backup-history-client (fb356ee9) | `node --test test/backup-history-client.test.mjs` | 16 pass / 0 fail | ✓ PASS |
| backup-rotation-preview (cf1ba1b5) | `node --test test/backup-rotation-preview.test.mjs` | 7 pass / 0 fail | ✓ PASS |
| governance-console + client (69b6b95c) | `node --test test/governance-console.test.mjs test/governance-client.test.mjs` | 32 pass / 0 fail | ✓ PASS |
| backup-download (backup.js regression) | `node --test test/backup-download.test.mjs` | pass / 0 fail / 1 skip (MinIO-gated, offline) | ✓ PASS |

## Prior Post-Review Fix Verification (historical record — b3a2e8fd / da20260e)

The earlier delta re-verification (2026-11-23T18:06Z) of the two code-review warning fixes remains accurate: WR-01 staged-temp funnel (export/restore.js — dropStagedTmp on every failure exit, D-89-30 in-tx re-hash semantics preserved) and WR-02 stale-projection race (actions.js form-identity guard before every staging write + backupTaskNew defense-in-depth clear) were verified with file:line evidence and regression suites green (restore-instance 10/10, backup-rotation-preview 6/6 at the time, backup-export 14/14, gfs-kept-until 5/5). Neither file region was touched by the three post-UAT fixes; the WR-02 guard region survives intact in the current tree.

## Gaps Summary

None. Every must-have across the four plans is verified — the 36 previously code-verified truths carry over (drift confined to the three post-UAT fix files, each re-verified with file:line evidence and same-commit regression suites re-run green this session), and the six previously-unverified items (2 behavior-dependent truths + 4 backstop markers, including one explicit deviation) are closed with behavioral evidence (Playwright UAT drives with measured assertions) or owner verification. The 32-key i18n gate, DST matrix, PG-parity full-cycle e2e and DEPLOY.md trust sections all stand. Security: threats_open 0, ASVS L1 (90-SECURITY.md). The only open items in the whole milestone remain the two documented pre-existing test failures (french-typography Phase-88 keys; webhook-routes health) tracked in deferred-items.md — outside this phase's scope by verified pre-existence.

---

_Verified: 2026-11-23T18:45:00Z (initial) · 2026-11-23T18:06:46Z (post-review fix re-verification) · 2026-11-23T19:10:05Z (post-UAT re-verification, status passed)_
_Verifier: the agent (gsd-verifier)_
