---
phase: 100-smb-destination-end-to-end-remote-prune
plan: 03
subsystem: backup-destinations
tags: [smb, probe, probe-at-save, i18n, client-wiring]
requires: ["100-01 (smb client + probeSmb)", "100-02 (closure + upload arm)"]
provides: ["POST /api/backup/tasks/smb-probe", "probe-at-save CREATE/EDIT smb twins", "smbEnabled client trio", "err.smb*/toast.smbProbe*/smbGuestAccess i18n family ×5"]
affects: ["100-04 (prune reuses probe classes)", "100-05 (restore twins; server.js released from not-wired pin)"]
tech-stack:
  added: []
  patterns: ["guard-chain clone (ftp-probe verbatim)", "probe-at-save twin (hard refuse, no deleteFailed exemption)", "client trio (state/getter/payload)", "keyed toast chain + guest INFO branch"]
key-files:
  created: []
  modified:
    - server.js
    - src/pages/backup.js
    - src/actions/actions.js
    - src/core/api.js
    - src/locales/{en,fr,nl,de,es}.json
    - test/backup-smb-wiring.test.mjs
    - test/destination-registry-gate.test.mjs
    - test/backup-ftp-wiring.test.mjs
    - test/backup-history-client.test.mjs
    - test/error-codes.test.mjs
decisions:
  - "Toast chain keys on probeSmb smbCLASSES (authFailed, …) mapped onto the err.smb* family — explicit branches so the dead-key gate stays honest; smbDialectUnsupported branch guards the OQ-3 err-code path (sentinel currently maps to class generic)"
  - "Locale keys folded into the Task-2 emitting commit — the build's dead-key/refusal gate fails without them (same-commit discipline enforced by the toolchain, not by commit order)"
  - "destination-registry not-wired pin released for server.js (probe route landed); export/restore.js stays pinned until 100-05"
metrics:
  duration: ~55 min
  completed: 2026-11-25
  tasks: 3
status: complete
commits: 4
plan_head_before: e2987e21
plan_head_after: b2654985
actuals:
  tokens: 96000
  tasks: 3
  commits: 4
---

# Phase 100 Plan 03: SMB Probe Surface + Client Trio + i18n Summary

**One-liner:** smb-probe route + hard-refuse probe-at-save twins + SMB toggle/actions/api trio with the keyed smb toast chain (incl. guest INFO branch) and the full smb i18n family ×5 locales.

## What Was Built

- **smb-probe route** (`server.js`): POST `/api/backup/tasks/smb-probe` cloning the ftp-probe guard chain verbatim (sameOrigin → requireUser → `backupprobe|` 10/15min → CAP.BACKUP_MANAGE → SMB.enabled → probeSmb). Refusals keyed + audited (`backup_probe_refused:smbNotConfigured` / `:backupManageRequired`); outcome audits `backup_smb_probe_ok|failed` with detail = `result.key` only; guest flag rides the result through (SC-2/D-23); NO httpWarning (R-3).
- **Probe-at-save twins** (CREATE + EDIT): `invalidSmbEnabled`/`smbNotConfigured` boolean+configured gates, probeSmb BEFORE the write with hard 400 "task was not saved" refusal on ANY !ok (no deleteFailed exemption, 98-02 precedent), `smb_enabled` in task object/INSERT and updated object/UPDATE, probe ride + audit symmetry on both paths. EDIT gates on the resolved `smbEnabled` read/keep variable.
- **Client trio**: api.js smbEnabled state default (fail-closed)/getter/V5 strict-boolean config read; backup.js `backupTaskSmb` toggle row after the ftp row, render-gated on `api.smbEnabled`; actions.js ×5 twins (form default, IN handler no-re-render, edit prefill `task.smb_enabled === 1`, body gate, toast chain). Toast chain maps probeSmb class keys onto the err.smb* family with a fallback unreachable toast; `guest === true` → `toast.smbGuestAccess` INFO (worded informational, never a warning).
- **i18n ×5** (en/fr/nl/de/es): `page.backup.smbToggle`, 12 `err.smb*` keys, `toast.smbProbeSuccess`/`toast.smbProbeUnreachable`, `toast.smbGuestAccess` — natural translations, placed beside the ftp analogs.
- **Wiring test**: +8 slice pins (route guard order, key-only audits, twin hard-refuse, client trio, toast chain, no-httpWarning).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] destination-registry-gate released server.js**
- **Found during:** post-task gate run
- **Issue:** the gate pinned server.js as "must NOT wire the smb client" until 100-03 — this plan IS 100-03, the release was pre-planned in the gate's own comment.
- **Fix:** dropped server.js from the not-wired list; export/restore.js stays pinned until 100-05 (same release pattern 100-02 used for export/backup.js).
- **Commit:** 583b457c

**2. [Rule 1 - Pin drift] additive pins updated in 3 sibling suites**
- **Found during:** full `npm test`
- **Issue:** ftp-wiring INSERT/UPDATE byte pins, the ftp form-default pin, the ftpProbe NO-deleteFailed seg, the backup-history 5600-char handler slice, and the error-codes reverse-parity allowlist all broke on the additive smb changes.
- **Fix:** pins widened additively (smb_enabled named in the pins); ftp toast seg scoped to the ftp block; handler slice 5600→8400; 10 err.smb* probe-class codes allowlisted client-side (smbNotConfigured/invalidSmbEnabled remain server-emitted and are NOT allowlisted).
- **Commit:** b2654985

**3. [Process] Task 3 locale keys folded into the Task 2 commit (c47a9699)**
- **Issue:** `npm run build` runs the i18n scan; the emitting code without catalogue keys = 13 violations. The plan's "same-commit discipline" is enforced by the toolchain, so Task 2's verify cannot pass before Task 3's edits exist. Tasks 2+3 landed as one commit; Task 3's verify (build + i18n-toast) ran green before it.

## Verification

- `node --test test/backup-smb-wiring.test.mjs` → 23 pass / 0 fail
- `npm run build` → exit 0 (i18n scan clean, data-a pin 623 unchanged)
- `node --test test/i18n-toast.test.mjs` → 8 pass / 0 fail
- destination-registry-gate + xws-gate → 14 pass / 0 fail
- `npm test` → 2612 pass / 2 fail — exactly the documented pre-existing failures (fr-typography, webhook-routes GET list)

## Threat Model Check

T-100-05 (guard chain): mitigated — chain order pinned by slice test; T-100-06 (disclosure): mitigated — audits carry `result.key` only, toasts keyed, no config/error text (grep-verified in pins); T-100-SC: zero new dependencies. No new threat surface beyond the plan's register.

## Known Stubs

None.

## Self-Check: PASSED

- Commits c15fcb6a / c47a9699 / 583b457c / b2654985 present in `git log`.
- All modified files tracked and committed (`git status` clean at SUMMARY time).
