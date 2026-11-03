---
phase: 35-honest-undo-deploy-gap
plan: 02
subsystem: deploy
tags: [compose, deploy, key-rotation, env-forwarding]
requires: []
provides:
  - "MASTER_KEY_PREVIOUS forwarding via docker-compose (compose users get rotation without extra steps)"
affects: []
tech-stack:
  added: []
  patterns:
    - "compose optional ${VAR:-} interpolation form (majority convention in docker-compose.yml)"
    - "node:test parse-then-spawn config test with process.env injection"
key-files:
  created:
    - test/compose-config.test.mjs
  modified:
    - docker-compose.yml
    - DEPLOY.md
decisions:
  - "Walkthrough placed inside §14 after the runbook's failure-mode note, framed as 'no extra step' + four-step cycle, adapting rather than duplicating the runbook (D-08)"
  - "Sentinel value 'old-key-sentinel-value' used in the config test; asserted in rendered stdout env, not the file"
metrics:
  duration: ~6 min
  completed: 2026-11-03
  tasks: 2
  commits: 2
status: complete
actuals:
  tokens: 8000
  tasks: 2
  commits: 2
plan_head_before: c5464d3
plan_head_after: 471631f
estimate:
  tokens: 35000
  tasks: 2
---

# Phase 35 Plan 02: Compose MASTER_KEY_PREVIOUS Forwarding + §14 Walkthrough Summary

**One-liner:** Forward MASTER_KEY_PREVIOUS through docker-compose.yml via the optional `${MASTER_KEY_PREVIOUS:-}` form, proven by a parse + two-case `docker compose config` test, with a DEPLOY.md §14 compose rotation walkthrough.

## What Was Built

- **docker-compose.yml** — one line inserted immediately after `MASTER_KEY:` (D-07): `MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}   # old key during rotation (DEPLOY.md §14)`. Optional `:-` form only — fresh installs without the variable keep booting (T-35-03).
- **test/compose-config.test.mjs** (new) — two layers per D-09:
  - Parse case (no docker): asserts the MASTER_KEY_PREVIOUS line exists directly after the MASTER_KEY line, contains the literal `${MASTER_KEY_PREVIOUS:-` form, and never `:?`.
  - Two config cases: `docker compose config` with the three required `:?` vars (ADMIN_EMAIL, ADMIN_PASSWORD, MASTER_KEY) always set, only MASTER_KEY_PREVIOUS varying — unset → exit 0 (fresh-install boot, roadmap Success Criterion 3); set to a sentinel → exit 0 AND rendered stdout carries `MASTER_KEY_PREVIOUS: old-key-sentinel-value` (T-35-05). Docker absent (ENOENT) → explicit `t.skip('docker compose unavailable')` — never a silent pass.
- **DEPLOY.md §14** — new "Compose users: no extra step" subsection (D-08) after the runbook's failure-mode note: the no-extra-step note pointing at the compose line, the four-step `.env` cycle (add-old-key → `docker compose up -d` → verify `TOTP re-wrap:` line + stamped ids → remove-old-key), reuse of the runbook's idioms verbatim (`.env` mode 600, env-only injection, key-id verification), and the image-currency STOP precondition linked rather than restated.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | Compose forwarding line + two-case config test | 197fa16 | docker-compose.yml, test/compose-config.test.mjs |
| 2 | DEPLOY.md §14 compose rotation walkthrough | 471631f | DEPLOY.md |

## Verification

- `node --test test/compose-config.test.mjs` — 3 pass, 0 fail, 0 skip (docker present: both config cases ran live)
- `npm test` — full suite green: 894 pass / 0 fail / 897 total (3 skips are pre-existing baseline skips; new total vs the 803 baseline reflects plans 35-01 + 35-02 additions)
- `grep -c 'MASTER_KEY_PREVIOUS' DEPLOY.md` → 14 (≥ 1; walkthrough present)
- docker-compose.yml carries exactly one new MASTER_KEY_PREVIOUS line in the `:-` form, immediately after MASTER_KEY
- Tracer feedback gate: Task 1's `<verify>` re-run end-to-end before Task 2 — passed, expanded.

## Deviations from Plan

None — plan executed exactly as written. The flagged assumption (empty-string vs unset equivalence) was verified live: both config cases exit 0 with the `:-` empty default, matching the verified server.js:89 normalization.

## Known Stubs

None.

## Threat Model Outcomes

- T-35-03 (fresh-install DoS) — mitigated: `:-` form pinned by parse assertion + unset-case exit 0.
- T-35-04 (key disclosure) — mitigated: walkthrough keeps the env-only discipline; no command-line key material, no new logging.
- T-35-05 (rendered-config drift) — mitigated: set-case asserts the sentinel value in the rendered environment.

## Self-Check: PASSED

- FOUND: docker-compose.yml (line 40, `${MASTER_KEY_PREVIOUS:-}` form)
- FOUND: test/compose-config.test.mjs
- FOUND: DEPLOY.md §14 walkthrough subsection
- FOUND: commit 197fa16 · commit 471631f
