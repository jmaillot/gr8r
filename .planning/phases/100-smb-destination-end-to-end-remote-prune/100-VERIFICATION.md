---
phase: 100-smb-destination-end-to-end-remote-prune
verified: 2026-11-25T00:00:00Z
status: human_needed
score: 7/8 must-haves verified
covered_files: ["docs/DEPLOY.md","export/backup.js","export/restore.js","export/smb.js","package.json","server.js","src/actions/actions.js","src/core/api.js","src/locales/de.json","src/locales/en.json","src/locales/es.json","src/locales/fr.json","src/locales/nl.json","src/pages/backup.js","test/backup-prune.test.mjs","test/backup-smb-client.test.mjs","test/backup-smb-crypto.test.mjs","test/backup-smb-e2e.test.mjs","test/backup-smb-restore-gates.test.mjs","test/backup-smb-wiring.test.mjs","test/destination-registry-gate.test.mjs","test/xws-gate.test.mjs"]
covered_digest: "v2:sha256:7bac99cfb9707d6838975b5366ae4c3e670688685d5b546d1fa0c1810a8b415f"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "SC-5: the dperson/samba e2e recipe proves backup→SMB→restore end-to-end (SMB2 happy + guest pin + SMB3 smbDialectUnsupported refusal)"
    test: "Run the compose recipe from test/backup-smb-e2e.test.mjs header with SAMBATEST_URL=127.0.0.1:1445 SAMBATEST_SMB3_URL=127.0.0.1:1446, then node --test test/backup-smb-e2e.test.mjs"
    expected: "Happy-path gates pass (probe keyed success, write/read-back, sha256 round-trip, guest pin); SMB3 gate rejects with smbDialectUnsupported; A1/A2 falsification status flips from 'pending' to verified"
    why_human: "Gates are env-gated and skipped without docker + samba containers; falsification of 99-SPIKE A1/A2 requires a real SMB server (100-05-SUMMARY records 'mock-verified; real-run pending')"
human_verification:
  - test: "Enable the SMB toggle in the task editor; run smb-probe against a live share (healthy, unreachable, wrong-credentials/guest share)"
    expected: "Toggle renders only when api.smbEnabled; hard save refusal on unreachable; smbGuestAccess INFO toast (not warning) on guest; no httpWarning anywhere"
    why_human: "Real browser UI + real NAS/Samba server interaction"
  - test: "Trigger a scheduled task run with smb_enabled and a reachable share; then kill the share mid-run"
    expected: "Archive + .sha256 sidecar appear on the share, run shows SMB location badge, smb_uploaded=1; killed-share run lands in the single terminal upload_failed state with local archive intact"
    why_human: "Requires live server, live share, and fault injection"
  - test: "Rotate out runs of an SMB-mirrored task (reduce retention); then re-run rotation"
    expected: "Pruned badge under the Rotated filter; file gone from share; audit backup_prune_ok:smb; re-run audits ok again (idempotent); sole-copy run keeps its mirror (backup_prune_skipped:soleCopy)"
    why_human: "Real rotation timing against a real share"
  - test: "Restore a backup whose only location is SMB (import_new + DR paths)"
    expected: "Archive fetched via fetchSmbToStaged with sha256 re-verified; restore completes; restore list shows SMB badge"
    why_human: "End-to-end restore needs live data + UI"
---

# Phase 100: SMB Destination End-to-End + Remote Prune Verification Report

**Phase Goal:** An operator can enable SMB mirroring per backup task on the proven FTP harness, and rotated-out runs are best-effort pruned from remote mirrors.
**Verified:** 2026-11-25
**Status:** human_needed (all automated truths verified; 1 behavior-unverified truth + 4 live-environment UAT items)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: scheduled `smb_enabled` uploads archive+sidecar via the same seams as FTP; manual runs stay local-only (R-2 inversion) | ✓ VERIFIED | server.js:4018-4029 closure (`if (!meta?.taskId) return null` BEFORE lookup, fail-CLOSED on lookup error); export/backup.js:908-939 smb arm; behavioral: `pipeline: manual run (taskId-less) → closure returns null, nothing written to the mock (R-2)` PASSES |
| 2 | SC-1: restore read-back via fetchSmbToStaged (sha256 verified BEFORE staging write) | ✓ VERIFIED | export/smb.js:1167; export/restore.js smbConfig plumbing; test/backup-smb-restore-gates.test.mjs in run — 0 fail |
| 3 | SC-2: smb-probe route + hard save-refusal twins (create :9401, edit :9619), no deleteFailed accept, keyed errors, guest → smbGuestAccess INFO toast, NO httpWarning in SMB path (R-3) | ✓ VERIFIED | server.js:9750 route with ftp guard chain; actions.js:5352 `sprobe.guest === true → toast kind:'info'`; `grep -c httpWarning export/smb.js` = 0; static pins in wiring suite PASS |
| 4 | SC-3: prune = floor-guard fresh reads (soleCopy = uploaded!==1 && S3.enabled), per-destination best-effort (D-05), idempotent not-found→ok, audits backup_prune_ok/failed/skipped:soleCopy, remote_pruned badge | ✓ VERIFIED | server.js:4336-4378 pruneRunMirrors + pruneFtp/pruneSmb wrappers (:4299-4322); behavioral tests PASS: floor-guard skip, no-S3 branch, idempotency (550/0xc0000034), per-destination containment, badge render gate, golden payload set |
| 5 | SC-4: single terminal `upload_failed` naming the failed destination; local publish valid; handleBackupTaskOutcome untouched | ✓ VERIFIED | export/backup.js:971-987 failedUploads composition + `stage: 'upload_failed'`; registry gate pin "S3 byte-identity: RAW sliced error on single-destination path" PASS; smb_uploaded written only in success block (grep: 1 write site in export/backup.js, 0 in server.js) |
| 6 | SC-5: e2e recipe proves backup→SMB→restore end-to-end (both pins), skip-when-absent; DEPLOY §21-append + §22 | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | test/backup-smb-e2e.test.mjs present with both gates (SAMBATEST_URL happy+guest pin, SAMBATEST_SMB3_URL smbDialectUnsupported refusal) + always-on skip proof; gates SKIPPED in this environment (no docker); A1/A2 falsification honestly recorded "real-run pending" in 100-05-SUMMARY. DEPLOY.md §21 SMB sub-section + §22 FTPS confirmed at :1803/:1897/:1935 |
| 7 | Hard gates: zero new deps; single-site `smb_uploaded=1` / `remote_pruned=1`; S3 arm byte-identity; membershipsOf/xws byte-gates; strip lists untouched (remote_pruned rides all SELECTs, NOT strip-destructured); i18n ×5 (smb family ×16 + pruned label ×5); `npm run build` exit 0 | ✓ VERIFIED | `git status package.json` clean; grep write-site counts; destination-registry-gate 10/10 in run; xws-gate + membership suites PASS (71/71); prune test asserts remote_pruned NOT in strip destructure; locales en/fr/de/es/nl each carry 16 smb keys + pruned; build exit 0 |
| 8 | Half-landed check: no cross-wave residue (pins released in 01/05 never re-tightened; fixtures consistent) | ✓ VERIFIED | Suites run together in one node --test invocation (client+crypto+wiring+prune+restore-gates+registry+e2e = 105 pass / 0 fail / 4 env-skips); crypto-suite pin accepts the additive pathNotFound; ftp pin widened to 98 consistent — no contradictory pins across suites |

**Score:** 7/8 truths verified (1 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| export/smb.js | probeSmb, fetchSmbToStaged, guestSession, pathNotFound | ✓ VERIFIED | :406, :419, :886, :1131, :1167 |
| server.js | SMB.config + closure, smb-probe route, twins, prune hook, remote_pruned DDL | ✓ VERIFIED | :244, :4018-4029, :4299-4378, :9401/:9428-9435, :9619/:9654-9659, :9750 |
| export/backup.js | smb upload arm beside ftp arm | ✓ VERIFIED | :69, :908-939 |
| export/restore.js | smbConfig plumbing both triggers | ✓ VERIFIED | restore-gates suite |
| src/pages/backup.js | render-gated toggle + pruned badge | ✓ VERIFIED | :534 (api.smbEnabled gate), :217-225 (deleted+remote_pruned gate) |
| src/actions/actions.js | toggle setter + probe twins + toast chain | ✓ VERIFIED | :5171, :5352 |
| src/locales/{en,fr,de,es,nl}.json | smb family + pruned label ×5 | ✓ VERIFIED | 16 smb keys each; pruned ×5 |
| test/backup-smb-*.test.mjs, backup-prune.test.mjs | client/wiring/prune/restore/e2e suites | ✓ VERIFIED | 105 pass / 0 fail (4 env-gated skips) |
| docs/DEPLOY.md | §21 SMB append + §22 FTPS | ✓ VERIFIED | :1803, :1897, :1935 |
| package.json | zero new deps | ✓ VERIFIED | clean git status |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| closure upload() | SMB.config() → connectSmb | server.js:4029 | ✓ WIRED | smb arm consumes provided.config |
| smb arm | smb_uploaded=1 | export/backup.js:939 | ✓ WIRED | single write site, success-block only |
| rotation commit | prune hook | server.js:4364 | ✓ WIRED | D-05 after rotation, per-dest containment |
| route | probeSmb | server.js:9763 | ✓ WIRED | guard chain order pinned |
| probe result guest | smbGuestAccess toast | actions.js:5352 | ✓ WIRED | rides response verbatim |
| restore triggers | fetchSmbToStaged | export/restore.js | ✓ WIRED | restore-gates suite |
| toggle | api.smbEnabled | src/pages/backup.js:534 | ✓ WIRED | render-gated |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| SMB/prune/gates suites | `node --test test/backup-smb-{client,crypto,wiring,restore-gates,e2e}.test.mjs test/backup-prune.test.mjs test/destination-registry-gate.test.mjs` | 105 pass / 0 fail / 4 env-skips | ✓ PASS |
| FTP/rotation/byte-gates | `node --test test/backup-ftp-wiring.test.mjs test/backup-rotation.test.mjs test/xws-gate.test.mjs test/membership.test.mjs` | 71 pass / 0 fail | ✓ PASS |
| R-2 manual run never uploads | wiring test "pipeline: manual run (taskId-less) → closure returns null" | pass | ✓ PASS |
| Floor-guard / idempotency / containment | prune suite tests :236/:312/:343 | pass | ✓ PASS |
| Build | `npm run build` | exit 0, 308ms | ✓ PASS |
| e2e live (docker samba) | SAMBATEST_URL run | skipped (env absent) | ? SKIP → human |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| test/backup-smb-e2e.test.mjs (env-gated recipe) | node --test (no env) | skip-when-absent proof passes; live gates skipped | ? SKIP (needs docker + samba — see behavior_unverified_items) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| SMB-02 | 100-02/03/05 | SMB destination wired end-to-end, same seams as FTP-02 | ✓ SATISFIED | Truths 1-2, 5 |
| DEST-02 | 100-02/04 | Scheduled-only (R-2) + best-effort prune (R-1), keyed audited refusals | ✓ SATISFIED | Truths 1, 4 |
| DEST-03 | 100-01/03 | Probe parity with SMB typed error classes + guest info ×5 locales | ✓ SATISFIED | Truth 3 |
| TEST-01 | 100-01/05 | Golden vectors + env-gated dperson/samba recipe + byte-gates green | ✓ SATISFIED | Truths 6-8 (live recipe run deferred to human) |

No orphaned requirements — all four phase requirement IDs claimed by plans and covered.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (none) | — | no TBD/FIXME/XXX/placeholder markers in phase files | — | — |

### Human Verification Required

See frontmatter `human_verification` — 4 live-environment UAT items (probe toasts, scheduled run + fault injection, rotation prune on a real share, restore from SMB), plus the docker e2e recipe run (behavior_unverified_items).

### Gaps Summary

None blocking. All presence/wiring/behavioral-automated truths verified; the single unexercised behavior is the env-gated live e2e (recipe exists, honestly documented as pending in 100-05-SUMMARY). Rulings R-1/R-2/R-3/R-4 all hold in code: R-1 best-effort containment, R-2 inversion before lookup, R-3 zero httpWarning in smb.js, R-4 sidecar sha256 + restore read-back (documented no-SIZE divergence).

---

_Verified: 2026-11-25_
_Verifier: the agent (gsd-verifier)_
