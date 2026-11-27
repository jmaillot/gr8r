---
phase: 100-smb-destination-end-to-end-remote-prune
plan: 01
subsystem: smb-client
tags: [smb, probe, restore-seam, guest-session, path-not-found]
requires: [phase 99 SMB client (connectSmb, SMB_ERROR_CLASSES, session engine)]
provides: [probeSmb, fetchSmbToStaged, guestSession flag, pathNotFound error class]
affects: [100-02 (wiring consumes probeSmb), 100-04/05 (restore twins consume fetchSmbToStaged; prune consumes pathNotFound)]
tech-stack:
  added: []
  patterns: [keyed probe result (ftp probeFtp parity, minus TLS warning), staged-fetch sha256 seam (T-98-06 discipline)]
key-files:
  created: []
  modified:
    - export/smb.js
    - test/backup-smb-client.test.mjs
    - test/backup-smb-crypto.test.mjs
decisions:
  - probeSmb marker rm failure = HARD refuse (deleteFailed, warning stays false) — no ftp D-88-15 accept-with-warning analog for SMB
  - probe result carries keys only (smbClass | unreachable | deleteFailed | success) — never raw error text or config (T-100-01)
  - fetchSmbToStaged verifies sha256 BEFORE writing any staging file (T-100-02 — mismatch leaves nothing behind); returns { tmpPath, sha256 } mirroring ftp
  - guestSession read at SESSION_SETUP reply-body offset 2, bit 0x0001 (MS-SMB2 §2.2.5, ASSUMED A1 — 100-05 e2e falsifies); read-only observation
  - 0xc0000034 mapped additively to pathNotFound (prune idempotency, Pitfall 1)
metrics:
  duration: 28m
  completed: 2026-11-25
  tasks: 2
status: complete
commits: 3
plan_head_before: b9b9e78cb71add678b824b1e1d19f24a8d3a919f
plan_head_after: c3bee78c
actuals:
  tokens: 4028
  tasks: 2
  commits: 3
---

# Phase 100 Plan 01: SMB client additions (probeSmb, fetchSmbToStaged, guest detection, pathNotFound) Summary

**One-liner:** Filled the three 99-client gaps every SMB wiring/prune/restore plan consumes — keyed probeSmb (marker write+rm, guest surfacing, R-3-clean), sha256-gated fetchSmbToStaged restore seam, SessionFlags guest detection, and the additive 0xc0000034 → pathNotFound error class.

## What was built

- **pathNotFound class** (`export/smb.js`): 0xc0000034 STATUS_OBJECT_NAME_NOT_FOUND added to the SMB_ERROR_CLASSES closed enum (now 10 entries; all 9 pre-existing mappings regression-pinned). Message added to SMB_CLASS_MESSAGES. Prune (100-04) treats it as already-pruned success.
- **Guest detection**: SESSION_SETUP round-2 reply — SessionFlags u16 read at body offset 2, `s.guestSession = (flags & 0x0001) !== 0`; exposed via `__debug().guestSession`. No signing/retry/frame changes.
- **probeSmb(config, opts)**: connect → echo → write marker `backup-smb/probe-<ts>-<uuid>.probe` → rm marker. Keyed result `{ ok, key, warning }`; rm failure = HARD refuse `deleteFailed` (warning false); other errors map through smbClass, fallback `unreachable`; `guest: true` rides success when the session is guest. Zero TLS-warning fields anywhere in smb.js (R-3, grep-pinned).
- **fetchSmbToStaged(config, remoteKey, expectedSha256, stagingDir)**: whole-file read → sha256 compare BEFORE any file write (mismatch = keyed `smbSha256Mismatch`, nothing left behind) → staging file `smb-download-<pid>-<uuid>.tmp`; returns `{ tmpPath, sha256 }` (ftp shape parity).
- Zero new dependencies (all smb.js imports node: builtins, test-pinned); no wiring, no UI, no locales.

## Tasks Completed

| Task | Name | Commit |
|------|------|--------|
| 1 | pathNotFound class + guest-session detection (TDD) | 60f06886 |
| 2 | probeSmb + fetchSmbToStaged (TDD) | 4f4ccbc5 |
| — | [Rule 1 - Bug] crypto-suite error-map pin updated for the additive enum | c3bee78c |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] test/backup-smb-crypto.test.mjs pinned 0xc0000034 → 'generic' (unmapped)**
- **Found during:** full-suite verification after Task 2
- **Issue:** the pre-existing SC-3 enum pin asserted the unmapped default for 0xc0000034, so the plan's additive entry regressed that suite (full `npm test` showed 3 fails instead of the 2 documented pre-existing ones)
- **Fix:** updated the case to `[0xc0000034, 'pathNotFound']` — additive intent of the plan; all other pins untouched
- **Files modified:** test/backup-smb-crypto.test.mjs
- **Commit:** c3bee78c

## Verification

- `node --test test/backup-smb-client.test.mjs` → 26 pass / 0 fail (8 new pins)
- `node --test test/backup-smb-crypto.test.mjs test/backup-smb-client.test.mjs` → 46 pass / 0 fail
- `npm test` → baseline: 2589 pass / 2 fail — exactly the documented pre-existing failures (fr-typography, webhook-routes GET list)
- `grep -c httpWarning export/smb.js` → 0
- destination-registry-gate + xws-gate → 14 pass / 0 fail
- `git diff HEAD -- package.json` → empty (zero dependency diff)

## Known Stubs

None.

## Threat Flags

None — error surfaces are keyed-only (T-100-01) and staging writes are sha256-gated (T-100-02), both test-pinned; no new surface outside the plan's threat model.
