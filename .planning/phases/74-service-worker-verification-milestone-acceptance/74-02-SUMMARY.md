---
phase: 74-service-worker-verification-milestone-acceptance
plan: 02
subsystem: pwa-docs
tags: [pwa, docs, uat]
requires: [PWA-03, 74-01]
provides: ["docs/DEPLOY.md §18 operator posture", "74-UAT.md acceptance record (human_needed)"]
affects: []
tech-stack:
  added: []
  patterns: [append-only numbered docs section, 73-UAT-format evidence record]
key-files:
  created:
    - .planning/phases/74-service-worker-verification-milestone-acceptance/74-UAT.md
  modified:
    - docs/DEPLOY.md
decisions:
  - "§18 documents the no-custom-SW rationale (fetch-handler requirement dropped Chrome 108/112) rather than restating banner behavior"
metrics:
  duration: ~10 min
  completed: 2026-11-19
status: human_needed
estimate:
  tokens: 40000
  raw_tokens: 28000
  tasks: 2
  confidence: med
actuals:
  tokens: 5600
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 85066ddc90c5b21ae71be88d8b1bc4a42a848d0e
plan_head_after: fb190a59
---

# Phase 74 Plan 02: Deploy Docs + Milestone UAT Summary

**One-liner:** DEPLOY.md §18 documents the full PWA operator posture (root-domain-only, iOS manual A2HS, no-back-button stance, strictly-online, no-custom-SW rationale, Lighthouse troubleshooting) and 74-UAT.md defines the 4-test real-device acceptance matrix — currently `human_pending` at a blocking-human checkpoint.

## What Was Built

- **Task 1 (done):** `docs/DEPLOY.md §18. Installable app (PWA)` appended (+53 lines, sections 1–17 byte-unchanged, verified via `git diff --stat`: 53 insertions / 0 deletions). Covers all five required topics: root-domain-only constraint (`start_url`/`scope`/`id` frozen to `/`), iOS limitations (no `beforeinstallprompt`, manual Share → Add to Home Screen, standalone no-back-button stance), strictly-online/no-caching decision, why-no-custom-SW note (push SW satisfies installability; sw.js diff is STOP-and-justify, hash-pinned by `test/sw-contract.test.mjs`), and a Lighthouse PWA troubleshooting paragraph (manifest MIME/no-cache, icon resolution, root-scope SW registration).
- **Task 2 (automated portion done, human portion PENDING):** `.planning/phases/74-.../74-UAT.md` created following the 73-UAT.md pattern — frontmatter `status: human_needed`, four numbered `### N. Title` blocks with `expected:`/`result: human_needed` lines, Summary tally (0 passed / 4 pending), Gaps section. Committed. **The blocking-human checkpoint is NOT resolved**: no test results were fabricated or self-approved.

## Tasks Delivered

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | DEPLOY.md §18 — Installable app (PWA) (D-02) | e7f74046 | docs/DEPLOY.md |
| 2 | 74-UAT.md — 4 real-device tests (human_needed) | fb190a59 | .planning/phases/74-.../74-UAT.md |

## Verification

- `grep -n "^## 18\. Installable app (PWA)" docs/DEPLOY.md` → line 1399 ✅
- Required-topic count grep (`beforeinstallprompt|Add to Home Screen|STOP-and-justify|Lighthouse`) → 6 ✅
- `git diff --stat docs/DEPLOY.md` → 53 insertions, 0 deletions (append-only) ✅
- `grep -c '^### [1-4]\.' 74-UAT.md` → 4 ✅

## Deviations from Plan

None — plan executed as written. No auth gates. No production code changes (docs + planning artifacts only, per plan). No stubs introduced. No new threat surface (T-74-03 mitigation: UAT evidence will be committed once the owner supplies results; T-74-SC N/A — zero packages installed).

## ⚠️ BLOCKING-HUMAN CHECKPOINT — PENDING

**Task 2 is not complete.** The owner must perform the 4 tests on real devices:

1. Desktop Chromium: install prompt appears → standalone launch.
2. Android Chrome: A2HS flow → standalone launch.
3. iOS Safari: no auto prompt; manual Share → Add to Home Screen; standalone; no back button.
4. Push notification still fires on an existing subscription (regression across Phases 72–74).

**Resume signal:** reply **"UAT passed"** — the continuation agent then commits result lines (+ optional screenshots) into each block, flips frontmatter to `status: complete`, marks **PWA-03 complete** in REQUIREMENTS.md, and records v2.7 milestone acceptance. Any failure: paste test numbers + observations; failures become Gaps and the "zero code changes" premise is revisited (STOP-and-justify — no silent patching).

Until then: PWA-03 remains open, milestone v2.7 is **not** accepted.

## Self-Check: PASSED

- docs/DEPLOY.md §18 exists ✅
- 74-UAT.md exists with 4 numbered tests ✅
- Commits e7f74046 and fb190a59 present ✅
- `git rev-list --count 85066ddc..HEAD` = 2 ✅
- STATE.md / ROADMAP.md untouched (orchestrator-owned) ✅
