---
phase: 98-ftp-destination-end-to-end
verified: 2026-11-25T00:00:00Z
status: human_needed
score: 11/11 must-haves verified
covered_files: ["docs/DEPLOY.md", "export/backup.js", "export/ftp.js", "export/restore.js", "server.js", "src/actions/actions.js", "src/core/api.js", "src/locales/de.json", "src/locales/en.json", "src/locales/es.json", "src/locales/fr.json", "src/locales/nl.json", "src/pages/backup.js", "test/backup-ftp-e2e.test.mjs", "test/backup-ftp-wiring.test.mjs", "test/destination-registry-gate.test.mjs"]
covered_digest: "v2:sha256:b0067478497851b264a67c3b38b13bf39c77e8e89554f7d05ffb0c20260e277d"
behavior_unverified: 4
overrides_applied: 0
behavior_unverified_items:
  - truth: "SC-1 — a scheduled ftp_enabled task uploads to FTP after local publish (staged, local-first)"
    test: "Enable FTP + toggle on a task, wait for a scheduled run (or verify against a live vsftpd via the e2e recipe)"
    expected: "run row carries ftp badge, archive present on FTP with .sha256 sidecar, local archive intact"
    why_human: "real-socket FTP I/O not exercised in-process beyond the mock-server test; e2e is env-gated"
  - truth: "SC-2 — probe toast outcomes as the operator sees them (success + per-key refusals + insecureTlsWarning)"
    test: "Toggle FTP on a task with the server down / bad creds / plain FTP endpoint and click probe-at-save"
    expected: "hard refusal 'task was not saved', keyed error toast, insecureTlsWarning on plain endpoint"
    why_human: "toast rendering and form-refusal UX are browser-only"
  - truth: "SC-4 — FTP-only mirror failure lands upload_failed naming FTP, local archive survives, transition-gate alert fires"
    test: "Enable ftp on a task, kill the FTP server, trigger a scheduled run"
    expected: "run terminal upload_failed with raw FTP error text; local archive present; failure email on ok→failed transition"
    why_human: "requires a live FTP server failure injection; the mock test covers the code path, not real failure modes"
  - truth: "SC-5 — vsftpd e2e backup→FTP→restore loop against a real server"
    test: "Run the documented docker recipe in test/backup-ftp-e2e.test.mjs header: docker run vsftpd + VSFTPD_TEST_URL=… node --test test/backup-ftp-e2e.test.mjs"
    expected: "gated loop suite passes end-to-end (upload → SIZE+sidecar verify → restore read-back sha256)"
    why_human: "requires docker; verifier per instruction does NOT attempt docker"
---

# Phase 98: FTP destination end-to-end — Verification Report

**Phase Goal:** An operator can enable FTP/FTPS mirroring per backup task and the full pipeline — upload, verify, probe, restore, badges — works against a real FTP server.
**Verified:** 2026-11-25
**Status:** human_needed (all must-haves code-verified; 4 operator-visible behaviors need human/UAT verification — real-FTP and docker paths env-gated by design)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: scheduled ftp_enabled task uploads after local publish (staged, local-first) | ✓ VERIFIED (presence+wiring; behavior → human) | server.js:3941-3961 install closure gates on ftp_enabled=1; export/backup.js ftp arm :870-906 runs post-publish; mock pipeline test in wiring suite passes |
| 2 | R-4 verify = SIZE + sidecar sha256, no downloadToStaged on ftp arm | ✓ VERIFIED | export/backup.js:888 SIZE mismatch throw; :894 sidecar STOR; s3 read-back confined to else-arm (:916-933) |
| 3 | ftp_uploaded=1 written at exactly ONE site, success-only | ✓ VERIFIED | single grep hit export/backup.js:906, inside ftp success block, after STOR+SIZE+sidecar, never in catch |
| 4 | R-2: manual Run-now never uploads (null return for taskId-less) | ✓ VERIFIED | server.js:3952 `if (!meta?.taskId) return null; // R-2` inside ftp closure |
| 5 | SC-2: probe-at-save hard 400 refusal on BOTH create and edit; no deleteFailed accept-with-warning | ✓ VERIFIED | twins server.js:9227-9231 (create) & :9414-9419 (edit), both `return fail(res, 400, key, '…the task was not saved')`; ftp probe emits deleteFailed only for standalone marker route, never accepted at save; ftp twins have no s3Probe.key==='deleteFailed' bypass |
| 6 | Standalone probe route with verbatim guard chain (sameOrigin→requireUser→throttle→CAP→FTP.enabled), audited | ✓ VERIFIED | server.js:9514-9534, order token-for-token vs S3 funnel; audits backup_probe_refused:backupManageRequired, :ftpNotConfigured, backup_ftp_probe_ok/failed (key-only detail, no config) |
| 7 | SC-2 keys ×5 locales, FTP_INSECURE → insecureTlsWarning (R-3) | ✓ VERIFIED | ftpToggle/ftpNotConfigured/ftpAuthFailed/ftpTlsFailed/ftpPassiveFailed/ftpPathNotFound/ftpQuotaExceeded/insecureTlsWarning/ftpProbeSuccess/ftpProbeUnreachable/locFtp — 11 keys ×5 locale files (grep count 5 each); ftp.js:591 httpWarning = secure==='none'‖insecure; actions.js:5313 toast on fprobe.httpWarning |
| 8 | SC-3: run rows + restore list show FTP badge via ftp_uploaded; restore read-back via fetchToStaged ×2 gates | ✓ VERIFIED | destLocation server.js:3982 returns 'ftp'; RESTORE locFtp ×5; export/restore.js:2080-2081 (import_new) & :2326-2328 (DR), keyed ftp_uploaded===1 && opts.ftpConfig; opts.ftpConfig plumbed server.js:10069 & :10153; local-first ordering preserved (`!archivePath &&`) |
| 9 | SC-4: FTP-only failure → single terminal upload_failed naming FTP via raw slice; local archive survives; handleBackupTaskOutcome untouched | ✓ VERIFIED | export/backup.js:938-948 single-destination path = raw sliced msg, composed branch (≥2) unreachable; upload_failed handler server.js:3739-3752 pre-existing, routes failed outcome through UNCHANGED transition gate; catch keeps published archive (rmStaging only on outer fail) |
| 10 | s3 arm textually recognizable — destination-registry-gate green | ✓ VERIFIED | `node --test test/destination-registry-gate.test.mjs` → 10 pass / 0 fail; s3 arm byte-preserved per :933 `// else — s3 arm (byte-preserved)` |
| 11 | SC-5: env-gated vsftpd e2e skips when absent; DEPLOY §21 lands same commit | ✓ VERIFIED (skip-path; loop → human) | `node --test test/backup-ftp-e2e.test.mjs` → 1 pass / 2 skipped, silent; docker recipe + env gate documented in test header :13-19; DEPLOY.md:1803 `## 21` |

**Score:** 11/11 truths verified (4 present, behavior-unverified → human_verification)

### Hard-Gate Re-Checks (all PASS)

| Gate | Result |
|------|--------|
| Single `set ftp_uploaded = 1` write site | PASS — exactly one (export/backup.js:906) |
| s3 arm recognizable (destination-registry-gate 10/10) | PASS — 10 pass / 0 fail re-run this session |
| Composed-error branch untouched | PASS — :944-946 verbatim OQ-3 comment, ≥2 branch unreachable |
| handleBackupTaskOutcome untouched | PASS — upload_failed/fail handlers pre-Phase-98, ftp never special-cased |
| R-2 null-return for manual runs | PASS — server.js:3952 |
| Probe guard chain verbatim order | PASS — route :9514 order = S3 funnel order |
| Probe-at-save twins BOTH create and edit | PASS — :9227 & :9414 |
| NO deleteFailed accept-with-warning on ftp | PASS — ftp twins refuse on !ok unconditionally |
| data-a pin 623 | PASS — i18n-shell + i18n-toast suites re-run: 26 pass / 0 fail (pin asserts 623 data-a sites; ftp toggle is data-in, pin unmoved) |
| membershipsOf byte-gate | PASS — covered by full regression (governance suite green) |
| Zero new deps | PASS — package.json dependencies unchanged (@office-kit/xlsx, pg, web-push) |
| DEPLOY §21 exists | PASS — `grep '^## 21' docs/DEPLOY.md` → :1803 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js ftp closure + FTP.config() | R-2-inverted registry install | ✓ VERIFIED | server.js:3941-3961; config seam consumed by probe + restore |
| export/backup.js descriptor dispatch (s3+ftp arms) | per-destination upload loop | ✓ VERIFIED | :849-933, ftp arm stor+SIZE+sidecar+one-site flag |
| export/restore.js ftp twins ×2 | fetchToStaged read-back gates | ✓ VERIFIED | :2080, :2326 |
| test/backup-ftp-wiring.test.mjs | slice pins + mock pipeline | ✓ VERIFIED | 27 pass / 0 fail re-run |
| test/backup-ftp-e2e.test.mjs | env-gated vsftpd recipe | ✓ VERIFIED | 1 pass / 2 skipped without VSFTPD_TEST_URL |
| docs/DEPLOY.md §21 | env table + recipe + R-3/R-4 deviations | ✓ VERIFIED | :1803 |
| src/pages/backup.js toggle row | render-gated on api.ftpEnabled, after S3 | ✓ VERIFIED | :523 |
| src/actions/actions.js four mirror sites + ftpProbe toasts | default/handler/hydration/payload | ✓ VERIFIED | :5106/:5163/:5230/:5279 + :5304-5313 |
| src/core/api.js ftpEnabled trio | default + getter + config apply | ✓ VERIFIED | :38/:159/:229 |
| i18n ×5 | 11-key ftp family in all locales | ✓ VERIFIED | grep ×5 each key; interleaved-wave insecureTlsWarning landed in 138ba780 (98-03 toast commit) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| ftp closure | descriptor slot | enabled/upload/verify/manualPrefix | ✓ WIRED | server.js:3941 setBackupDestination('ftp',…) |
| ftp arm | 97 client | ftp.stor / ftp.size / sidecar STOR | ✓ WIRED | export/backup.js:883-895 |
| ftp_uploaded flag | 96-02 badge scan | destLocation ordered check | ✓ WIRED | server.js:3982 |
| probe route | probeFtp(FTP.config()) | keyed result | ✓ WIRED | server.js:9527 |
| probe-at-save | audit + keyed 400 | backup_task_refused:ftpProbe:<key> | ✓ WIRED | :9230 / :9418 |
| body.ftpEnabled | ftp_enabled column | INSERT :9254 / UPDATE :9450 | ✓ WIRED | strict-boolean gates :9199/:9388 |
| toggle | payload | body.ftpEnabled gated on api.ftpEnabled | ✓ WIRED | actions.js:5279 |
| restore twins | fetchToStaged + sha256 | opts.ftpConfig seam | ✓ WIRED | restore.js:75 import, :2080/:2326 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| toggle row | api.ftpEnabled | /api/config → server.js:6417 env derivation | Yes | ✓ FLOWING |
| form payload | form.ftpEnabled | checkbox IN handler + task hydration | Yes | ✓ FLOWING |
| run badge | r.ftp_uploaded | backup_runs column written by pipeline | Yes | ✓ FLOWING |
| restore read-back | opts.ftpConfig | FTP.config() at restore routes | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Wiring suite (pins + mock pipeline) | `node --test test/backup-ftp-wiring.test.mjs` | 27 pass / 0 fail | ✓ PASS |
| Registry gate (s3 arm recognizable) | `node --test test/destination-registry-gate.test.mjs` | 10 pass / 0 fail | ✓ PASS |
| e2e skip-path proof | `node --test test/backup-ftp-e2e.test.mjs` | 1 pass / 2 skipped, silent | ✓ PASS |
| data-a pin 623 | `node --test test/i18n-shell.test.mjs test/i18n-toast.test.mjs` | 26 pass / 0 fail | ✓ PASS |
| vsftpd docker loop | not attempted (per instruction) | — | ? SKIP → human |

### Probe Execution

No scripts/*/tests/probe-*.sh convention in this project; phase verification probes are the test suites above (run, PASS).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FTP-02 | 98-01/03/04 | FTP destination wired end-to-end (toggle, staged upload, SIZE+sidecar, badges, restore read-back) | ✓ SATISFIED | truths 1,2,3,8 + UI wiring |
| DEST-03 | 98-02 | Probe parity — hard 400 refusal + marker probe route + typed classes ×5 (+ FTP insecureTls warning) | ✓ SATISFIED | truths 5,6,7; ftpAuthFailed/TlsFailed/PassiveFailed/PathNotFound/QuotaExceeded + unreachable keys all present |
| TEST-01 | 98-01/04 | Golden vectors / env-gated e2e recipes / byte-gates stay green | ✓ SATISFIED (98 portion) | e2e recipe + skip-proof; registry-gate + i18n pins green; full regression 2543 pass w/ exactly the 2 documented pre-existing failures |

No orphaned requirements: REQUIREMENTS.md maps FTP-02→98, DEST-03→98 (FTP portion; SMB classes → Phase 100), TEST-01→98 portion — all claimed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | Working tree clean except .planning state file; no TBD/FIXME/XXX in phase files; no console.log stubs |

### Interleaved Wave-3 Commit Check

git log sequence 90184e2a→5d71179f clean: 98-02/98-03/98-04 commits interleave but touch disjoint files (documented deviation — verified no file overlap in the four plans' files_modified: actions.js/i18n owned by 98-03 only, restore.js/DEPLOY/e2e by 98-04 only). Working tree clean of code changes. All re-run suites green now.

### Secrets-in-logs check

Probe route logs `result.key` + httpWarning only (server.js:9532); audit detail carries key only; ftp arm errors flow through s3SliceError (V14 slicing, no headers/credentials). PASS.

### Human Verification Required

Operator-visible SCs — candidate UAT on Prod after push:

1. **SC-1 scheduled mirror + badge** — enable FTP + toggle on a task; after a scheduled run, expect FTP badge on the run row, archive + .sha256 on the server, local archive intact.
2. **SC-2 probe UX** — probe with server down / bad creds / plain-FTP endpoint; expect keyed error toasts, hard "task was not saved" refusal, insecureTlsWarning toast on plain endpoint.
3. **SC-4 failure path** — kill the FTP server mid-schedule; expect terminal upload_failed naming FTP, local archive surviving, transition-gate failure email.
4. **SC-5 docker e2e** — run the vsftpd recipe from the test header (`docker run -d --name gr8r-vsftpd-e2e …` + `VSFTPD_TEST_URL=127.0.0.1:2121 node --test test/backup-ftp-e2e.test.mjs`); expect full backup→FTP→restore loop green.

### Gaps Summary

None. All 11 must-haves code-verified with re-run test evidence; the 4 behavior-unverified items are by-design env-gated (real FTP / docker / browser UX) and routed to human verification.

---

_Verified: 2026-11-25_
_Verifier: the agent (gsd-verifier)_
