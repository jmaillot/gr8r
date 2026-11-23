---
phase: 86-export-core-gr8r-backup-v1
fixed_at: 2026-11-21T00:00:00Z
review_path: .planning/phases/86-export-core-gr8r-backup-v1/86-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 86: Code Review Fix Report

**Fixed at:** 2026-11-21
**Source review:** .planning/phases/86-export-core-gr8r-backup-v1/86-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, WR-01…WR-05 — Info findings skipped per scope)
- Fixed: 6
- Skipped: 0

**Verification:** full `npm test` green in the main checkout (workflow.use_worktrees=false): 2116 tests, 2102 pass, 0 fail, 14 skipped (env-gated pg-matrix et al., pre-existing). Baseline was 2100 pass — the +2 are the new CR-01/WR-01 pins. Targeted run: `node --test test/backup-export.test.mjs test/backup-routes.test.mjs test/client-surfaces.test.mjs` → 32/32 pass.

## Fixed Issues

### CR-01: Reserved tar-name collision in instance scope

**Files modified:** `export/backup.js`, `test/backup-export.test.mjs`
**Commit:** b43fe96d
**Applied fix:** `RESERVED_ROOT_ENTRIES` = `manifest.json` + all `<table>.ndjson`. A DATA_DIR-root entry matching a reserved name is RECORDED in the manifest with `nameReserved: true` and never staged/hashed/tarred (D-06-consistent skip-and-flag, chosen over fail-the-run so an operator residue cannot brick the run). New pin: reserved residue yields exactly one `manifest.json` entry (still entry 0) and no duplicate table-name entry.

### WR-01: Instance symlinks silently dropped

**Files modified:** `export/backup.js`, `test/backup-export.test.mjs`
**Commit:** b43fe96d (same commit — same collector)
**Applied fix:** explicit `entry.isSymbolicLink()` branch before the isDirectory/isFile checks. Symlinks are never followed: escape → `pathEscaped: true`; in-tree symlink → `symlinkSkipped: true` (target already collected by its real path). Both flags skip the hash + tar loops. New pin covers both link shapes.

### WR-02: Client render→fetch→render poll loop

**Files modified:** `src/actions/actions.js`, `src/pages/backup.js`
**Commit:** 212dd7e3
**Applied fix:** failure path now clears `backupPending`, sets `backupErr {status}` for terminal 403/404 (page renders full403/fullErr), and stamps `backupPollFailedAt`; the page's render-kick honors a 30 s cooldown via exported `backupPollKickAllowed()` — persistent 500/network errors degrade to one retry per 30 s instead of a hot loop. No new user-visible strings → no locale changes (D-12 unaffected).

### WR-03: Unstoppable run at SIGTERM

**Files modified:** `export/backup.js`, `server.js`
**Commit:** 3a2d3478
**Applied fix:** `currentRun.cancelled` token + exported `cancelRun()`; `runExport` checks it at every stage transition (post-fence, pre-archiving, pre-verifying, pre-finalize) and throws "cancelled — server shutdown", so the exporter's own catch path owns failRun + staging removal. Shutdown handler now only calls `cancelRun()` — the rmSync-while-streaming pattern is gone; the boot sweep remains the hard-crash backstop.

### WR-04: dumpTable fd leak on fence error

**Files modified:** `export/backup.js`
**Commit:** 31f9f036
**Applied fix:** pagination loop + finalizer wrapped in try/catch; on error `write.destroy()` before rethrow — no fd leak, no orphaned 'error' listener.

### WR-05: Sidecar failure after rename misreports the run

**Files modified:** `export/backup.js`
**Commit:** 99266a2c
**Applied fix:** sidecar written INTO staging (`archive.sha256.staged`) and renamed together with the tar — a sidecar write failure now fails the run BEFORE the rename, so "failed" status can never coexist with a published archive.

## Skipped Issues

None. Info findings (IN-01…IN-05) out of scope per orchestrator.

**Deferred / notes:**
- `completeRun` (WR-03 token) and the installer-side cancellation of the pg fence client were not altered — the token aborts between stages only; an in-flight `await read(...)` still finishes its page before the next checkpoint. Accepted: within the 5 s exit window this cannot publish a bad archive (verified-only rename) and matches the review's suggested scope.
- WR-02 backoff is a fixed 30 s cooldown, not exponential — adequate for the observed failure mode.

---

_Fixed: 2026-11-21_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
