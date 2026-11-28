---
phase: 103-restore-source-refactor-extract-the-shared-ladder
plan: 02
subsystem: backup/restore
tags: [refactor, restore, staged-fetch-ladder, single-source, rsrc-01, r-5]
requires: [RSRC-01, R-5, test/restore-source-resolution.test.mjs (plan 01 golden)]
provides: [resolveRestoreSource (export/restore.js) — the ONE restore-source ladder for Phase 104's `source` param]
affects: [104 (source param edits ONE place)]
tech-stack:
  added: []
  patterns: [single-source helper with structured result (ok/dest/reason/err.raw), disabledBehavior parameterization (refuse/skip — divergence encoded, not unified), caller-owned envelope reconstruction from err.detail]
key-files:
  created: []
  modified:
    - export/resolveRestoreSource added to export/restore.js; 3 unit ladders replaced by helper calls
    - server.js (3 route ladders replaced by helper calls; seam imports dropped)
    - test/backup-ftp-restore-gates.test.mjs (re-targeted, same strength)
    - test/backup-smb-restore-gates.test.mjs (re-targeted, same strength)
decisions:
  - "Helper returns err.raw (the raw seam error) so the verify route keeps its own sha-mismatch classification (ok=false RESULT semantics, else-throw passthrough) — the helper never interprets mismatches."
  - "Caller envelope strings stay verbatim AT the callers (audit tokens, lives-in-X, fetched-from-X, seam-failed templates) — the plan-01 golden pins them per-caller-slice by design, so helper-provided messages were rejected; callers build messages from src.dest + src.err.detail."
  - "Helper seam dispatch is a single line (`await (leg.dest === 's3' ? downloadToStaged : ...)`) so the helper-only staged-fetch gate counts exactly one call site."
  - "runRestore's s3 leg lacked the backupRun.filename guard the other 5 sites had — the helper gates ALL legs on filename (normalized edge: flag set + filename falsy + s3 config today produced a `backup-task-undefined/undefined` fetch attempt; unreachable in production since every server caller guards row.filename)."
metrics:
  duration: 1h5m
  completed: 2026-11-28T01:30:00Z
status: complete
plan_head_before: 3a5cb3ee
plan_head_after: 8633382d
commits: 2
actuals:
  tokens: 45000
  tasks: 3
  commits: 2
---

# Phase 103 Plan 02: Extract the Shared Ladder Summary

**ONE `resolveRestoreSource(rowLike, configs, opts)` helper (export/restore.js) now owns selection + flag gates + staged fetch + mirrorMissing→clearMirrorFlag for all six ladder sites; callers keep their refusal envelopes verbatim; plan-01's golden passes UNCHANGED; net −31 lines.**

## What Was Built

- **`resolveRestoreSource` (export/restore.js, exported beside mirrorMissing/clearMirrorFlag):** normalizes both row shapes (task_id/taskId, id/opts.runId, filename, sha256, uploaded/ftp_uploaded/smb_uploaded — explicit, never guessed), resolves local-first (`fs.existsSync`), then legs s3 > ftp > smb gated on `flag === 1 && config` (D-05 seam — routes pass `S3.enabled ? S3.config() : null`, units pass opts configs), fetches through the existing seams with the exact key derivations (`s3BackupKey({taskId}, filename)` / `backup-task-${taskId}/${filename}`), performs `mirrorMissing → clearMirrorFlag` on fetch failure inside the helper, and returns a structured result: `{ ok, dest, archivePath, stagedPath, sha256, localPath }` / `{ ok: false, dest, reason: 'disabled'|'missing'|'fetchFailed', localPath, err: { code, detail, mirrorLost, raw } }`. The ONLY structural branch is `opts.disabledBehavior: 'refuse'|'skip'` — the documented routes-keyed-404 vs units-silent-skip divergence is encoded, not unified.
- **Three server.js routes** (preview, download, verify-checksum) replaced their ladders with one helper call + inline envelope mapping; **three restore.js units** (restoreOverwriteUnit, runRestore, restoreInstanceUnit) likewise with `disabledBehavior: 'skip'`, keeping failWith/throw-keyed delivery, dropStagedTmp contracts, and their keyed terminals verbatim.
- **verify-checksum's RESULT semantics preserved:** the helper hands back `err.raw`; the route still classifies `s3Class === 'sha256Mismatch'` / `ftpSha256Mismatch` / `smbSha256Mismatch` → `ok = false`, `mirrorMissing(err)` → keyed 404 with the fetched-from template, `else throw err` passthrough — all pinned by the plan-01 golden's site-3 source slice, which passes unchanged.
- **Twin-gate tests re-targeted, same strength, in the same commit** (checker W3 parity recorded below).

## Twin-Gate Rewrite — Pre/Post Assertion Parity (checker W3)

| Metric | ftp file | smb file |
|---|---|---|
| `grep -c 'serverSrc\|restoreSrc'` (the W3 parity metric) | **12 → 12** | **14 → 14** |
| test blocks | 10 → 10 | 12 → 12 |
| assert.ok/equal/match calls | 21 → 25 | 26 → 30 |

Assertion strength INCREASED slightly at equal relocation: the inline-gate pins became helper pins (gate shape + one-occurrence counts + delegation checks per unit + helper ordering by indexOf), the per-destination plumbing/rotated-row/zero-badge pins re-targeted (the `ftp_uploaded`/`smb_uploaded` file-wide counts went 6 → 4: three inline gates collapsed into one helper leg + row normalization). Nothing deleted because it moved — everything re-targeted.

## Verification

- Plan-01 golden `test/restore-source-resolution.test.mjs`: **16/16 pass, byte-unchanged** (git: never touched in this plan).
- Task-2 verify suite (golden + both gates + registry-gate + preview/download/checksum/instance/overwrite + s3/ftp/smb e2e): **131 tests, 118 pass, 0 fail** (13 skips = env-gated MinIO/FTP/SMB e2e legs).
- Full suite: **2728 tests, 2694 pass, 3 fail, 31 skipped** — exactly the 3 documented pre-existing failures (french-typography, webhook-routes GET list, webhook-events due.reminder date-boundary drift per 103-01-SUMMARY). **Zero new failures.**
- Grep gates: `grep -c 'fetchToStaged\|downloadToStaged\|fetchSmbToStaged' server.js` = **0** ✓ (seam imports dropped; comment mentions reworded). export/restore.js: seam **call sites = exactly 1** (the helper's single dispatch line); plain-name occurrences = 9 lines (3 imports + 5 doctrine comments + 1 helper call — see Deviation 1).
- `package.json`: unchanged (git diff empty). Zero new dependencies (T-103-SC not triggered).
- No temporary Task-1 sanity file was created (the golden itself exercised the dead helper).

## Deviations from Plan

**1. [Rule 3 — gate rewording] The plan's literal `grep -c 'fetchToStaged\|downloadToStaged\|fetchSmbToStaged' export/restore.js -eq 1` is unsatisfiable as written**
- The three seams are imported from three different modules (restore.js:74–76), so ≥3 lines mention the names by necessity, plus the helper's call line and doctrine comments.
- Realization: the gate's intent (checker W2, "helper-only staged-fetch calls") is satisfied exactly — call sites = 1 (`await (leg.dest === 's3' ? downloadToStaged : leg.dest === 'ftp' ? fetchToStaged : fetchSmbToStaged)(leg.config, key, ...)`), and server.js's plain-name count IS 0 as written. Documented here rather than weakening the intent.

**2. [Rule 1 — edge normalization, documented] runRestore's s3 leg had no `backupRun.filename` guard**
- The other 5 sites gate every leg on filename; runRestore's s3 leg did not (a `backup-task-undefined/undefined` fetch attempt was possible when flag set + filename falsy + s3 config — unreachable in production since every server caller guards `row.filename` before the unit runs). The helper gates ALL legs on filename (verified against the plan-01 golden: all its unit fixtures carry filename).

**3. [Noted, not fixed — carried scope ruling] ROADMAP.md stale anchors ("2672" baseline; stale SC-2 anchors) untouched**, per plan-01/plan-02 scope rulings.

**4. [Pre-existing, not touched] The 3 documented baseline failures** (incl. the webhook-events date-boundary drift proven pre-existing in 103-01) remain the regression gate — same 3 before and after, nothing else.

## Known Stubs

None — the helper is fully wired to all six call sites; no placeholder code, no skipped tests introduced (twin-gate tests were re-targeted, not skipped; all 22 blocks green).

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surfaces (funnel order, runId regex gates, boot-frozen config seams unchanged; `destLocation()` untouched). T-103-02 mitigated: the flag-order selection is now single-source and pinned by the plan-01 golden + re-targeted gate tests, so a future ordering regression fails the suite rather than serving the wrong archive.

## Commits

- ac098940 — refactor(103-02): add resolveRestoreSource helper (single-source restore ladder, dead code until call sites move)
- 8633382d — refactor(103-02): collapse all six staged-fetch ladders onto resolveRestoreSource; re-target twin-gate tests to the single-source pattern

## Self-Check: PASSED

- [x] `resolveRestoreSource` exported from export/restore.js; definitions = 1
- [x] Commits ac098940 + 8633382d present in git log
- [x] Golden 16/16 unchanged; twin-gate parity 12→12 / 14→14; full suite 3-fail baseline, zero new
- [x] package.json untouched
