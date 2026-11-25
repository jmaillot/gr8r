---
phase: 100-smb-destination-end-to-end-remote-prune
plan: 02
subsystem: smb-wiring
tags: [smb, backup-upload, destination-registry, r2-inversion, one-site-flag]
requires: [phase 99 SMB client (connectSmb, 99-01 probeSmb/fetchSmbToStaged), phase 96 destination registry, phase 98 ftp closure idiom]
provides: [SMB.config() seam, full smb install closure (R-2 + fail-closed smb_enabled), smb upload arm in export loop, smb_uploaded one-site flag]
affects: [100-03 (probe route consumes SMB.config/probeSmb), 100-04 (prune consumes smb keys + pathNotFound), 100-05 (restore consumes smb_uploaded rows + fetchSmbToStaged)]
tech-stack:
  added: []
  patterns: [ftp-closure clone (R-2 inversion, fail-closed per-task gate), descriptor-dispatched else-if arm, one-site flag rule, in-process fakeSmb pipeline proof]
key-files:
  created:
    - test/backup-smb-wiring.test.mjs
  modified:
    - server.js
    - export/backup.js
    - test/destination-registry-gate.test.mjs
decisions:
  - SMB capability = const SMB { enabled (all-four conjunction, byte-identical to the dormant derivation), config() → 99-client shape with port 445 hard-coded, domain omitted when unset }
  - R-2 inversion first in the closure — manual runs null BEFORE any lookup; 98's key lesson carried over
  - NO verify field on the smb descriptor (no SMB.verify exists; R-4 for SMB = sidecar + read-back at restore, 100-05)
  - smb arm = ftp-arm clone minus SIZE (SMB2 exposes no size query); sidecar byte-exact "<hash>  <name>\n"; smb_uploaded = 1 at exactly ONE success-block site
  - destination-registry-gate updated: backup.js released from the not-wired pin (100-02 is the unlocking wave); server.js (100-03) + restore.js (100-05) stay pinned
metrics:
  duration: 34m
  completed: 2026-11-25
  tasks: 3
status: complete
commits: 3
plan_head_before: bd47b125ebc9f65d6967e007ce72ed317ae615ed
plan_head_after: 954a8126
actuals:
  tokens: 9000
  tasks: 3
  commits: 3
---

# Phase 100 Plan 02: SMB wiring tracer (closure + upload arm + pipeline proof) Summary

**One-liner:** Wired SMB end-to-end as the phase tracer — SMB.config() seam, the full install closure replacing the dormant slot (R-2 inversion + fail-closed smb_enabled), and the smb upload arm beside the ftp arm — proven by 15-test wiring suite with static slice pins and a real runExport pipeline over the in-process fakeSmb mock.

## What was built

- **SMB capability (server.js)**: `const SMB = { enabled, config() }` beside FTP — enabled keeps the exact all-four conjunction (registry-gate regex intact), config() maps the boot-frozen consts to the 99 client shape `{ host, share, port: 445, user, password }`, domain omitted when unset. No secret serialization anywhere (V14).
- **Install closure (server.js)**: dormant slot replaced with a line-by-line ftp-closure clone — `SMB.enabled`, manualPrefix `backup-smb/` (probe marker only), upload with the **R-2 inversion first** (`!meta?.taskId → null` before any lookup), fail-closed `smb_enabled = 1` select with S3-parity warn wording, success returns `{ config: SMB.config() }`, **no verify field**.
- **Upload arm (export/backup.js)**: `else if (destName === 'smb')` beside the ftp arm — `connectSmb(provided.config)` → write `backup-task-<taskId>/<filename>` (same key shape as ftp, Pitfall 6) → sidecar write `${key}.sha256` with byte-exact `${sha256}  ${filename}\n` → `finally smb.close().catch()` → ONE `set smb_uploaded = 1` in the success block only. NO SIZE verify (R-4 documented divergence). s3 arm byte-preserved; failures ride the shared catch → single terminal upload_failed naming smb.
- **Wiring suite (test/backup-smb-wiring.test.mjs, NEW)**: 11 static slice pins (guard order, fail-closed gate, one-site flag, no-SIZE, s3 byte-identity posture, V14) + 4 functional pipeline tests over the real runExport loop against the cloned fakeSmb mock: success (archive+sidecar bytes, flags isolated, session teardown), smb_enabled=0 (zero commands), manual R-2 (zero commands, flag stays 0), write-failure (raw slice names smb, local archive survives).

## Tasks Completed

| Task | Name | Commit |
|------|------|--------|
| 1 | SMB.config() boot-frozen capability beside FTP | cd60f154 |
| 2 | Replace dormant smb slot with the full install closure + slice pins | f84a8234 |
| 3 | smb upload arm + mock-pipeline functional proof (TDD) | 954a8126 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] destination-registry-gate pinned "backup.js must NOT wire smb yet (phase 100's job)"**
- **Found during:** Task 3 gate verification
- **Issue:** the 96-era gate asserted server.js, export/backup.js AND export/restore.js carry no smb import — 100-02 is explicitly the wave that unlocks backup.js, so the gate regressed by design
- **Fix:** released `export/backup.js` from the not-wired list (gate comment names 100-03/100-05 as the owners of the remaining pins); s3 byte-identity and registry-order pins untouched and green
- **Files modified:** test/destination-registry-gate.test.mjs
- **Commit:** 954a8126

## Verification

- `node --test test/backup-smb-wiring.test.mjs` → 15 pass / 0 fail (RED-first TDD on Task 3: arm pins red, then green)
- destination-registry-gate + xws-gate → 0 fail (s3 byte-identity holds; smb import confined to backup.js)
- `grep -c "set smb_uploaded = 1" export/backup.js` → 1
- `npm test` → 2604 pass / 2 fail — exactly the documented pre-existing failures (fr-typography, webhook-routes GET list)
- `git diff HEAD -- package.json` → empty (zero dependency diff)

## Known Stubs

None — the upload path is fully wired and mock-proven; the samba docker e2e is a later-wave deliverable, not a stub of this plan.

## Threat Flags

None — T-100-03 mitigated (closure/arm never serialize config; pins assert no SMB_PASSWORD / no JSON.stringify), T-100-04 mitigated (failure rides the shared catch → single upload_failed, local publish untouched, pipeline test pins it), T-100-SC holds (zero new dependencies, connectSmb from the 99 client only).
