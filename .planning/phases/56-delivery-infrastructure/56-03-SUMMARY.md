---
phase: 56-delivery-infrastructure
plan: 03
subsystem: infra
tags: [vite, manifest, sha256, e2e, fail-closed, build-guard]

requires:
  - phase: 56-delivery-infrastructure
    provides: the shared repo and vite build (56-01 landed the split-chunk build; this plan is build-independent but shares the dist/ output)
provides:
  - dist/.vite/manifest.json + dist/.vite/build-stamp.json emitted by every `npx vite build` (closeBundle stamp plugin)
  - fail-closed stale-dist guard in e2e/server.mjs refusing boot with an actionable message
  - three-case guard test (missing / stale / fresh dist) proving the guard on the real wrapper
affects: [56-04 (i18n registry shares vite.config.js), every later phase running e2e against dist/]

tech-stack:
  added: []
  patterns:
    - build-time content-hash stamp written by a closeBundle plugin into the build's own outDir
    - fail-closed boot guard: console.error with fix named → rmSync dataDir → exit 1

key-files:
  created:
    - test/e2e-server-guard.test.mjs
  modified:
    - vite.config.js
    - e2e/server.mjs

key-decisions:
  - "Stamp plugin resolves outDir from configResolved, not a hardcoded dist/ — --outDir harness builds (test/build-locales.test.mjs) stamp their own temp output instead of overwriting dist/'s stamp with a stale manifest hash"
  - "Missing manifest, missing stamp AND corrupt stamp JSON all refuse with the same stale message (fail-closed on absent evidence, not only on mismatch)"
  - "Missing-dist test case uses a COPY of e2e/server.mjs in a temporary empty root (ROOT derives from the module path) — the real dist/ is never moved for that case"

requirements-completed: [DELIV-01]

duration: 11min
completed: 2026-11-12
status: complete

actuals:
  tokens: 3016
  tasks: 3
  commits: 3

coverage:
  - id: D1
    description: Build records a content-hash stamp of dist/.vite/manifest.json (no mtime in any staleness decision)
    requirement: DELIV-01
    verification:
      - kind: integration
        ref: command 'npx vite build' → stamp hash equals recomputed sha256 of manifest (run twice during execution)
        status: pass
      - kind: unit
        ref: test/build-locales.test.mjs#all 9 tests — --outDir harness build succeeds with manifest option enabled
        status: pass
    human_judgment: false
  - id: D2
    description: e2e/server.mjs refuses a stale dist fail-closed — exit 1, exact message "e2e: dist/ stale — run `npm run build`.", mkdtemp dataDir cleaned
    requirement: DELIV-01
    verification:
      - kind: integration
        ref: test/e2e-server-guard.test.mjs#a stale dist refuses fail-closed: exit 1 and the exact stale message
        status: pass
      - kind: integration
        ref: command — doctored manifest spawned directly, exit 1 + message observed in /tmp/opencode/stale.log
        status: pass
    human_judgment: false
  - id: D3
    description: Fresh build boots normally (no false positive) — server accepts connections, no stale message, clean shutdown
    requirement: DELIV-01
    verification:
      - kind: integration
        ref: test/e2e-server-guard.test.mjs#a fresh dist boots: the server accepts connections and never refuses
        status: pass
    human_judgment: false
  - id: D4
    description: Missing dist/index.html still triggers the pre-existing check with its own message
    requirement: DELIV-01
    verification:
      - kind: integration
        ref: test/e2e-server-guard.test.mjs#a missing dist refuses fail-closed: exit 1 and the message names the fix
        status: pass
    human_judgment: false
---

# Phase 56 Plan 03: DELIV-01 Stale-Dist Guard Summary

**Content-hash staleness detection: every `vite build` stamps sha256 of dist/.vite/manifest.json, and e2e/server.mjs refuses to boot a stale dist fail-closed with `e2e: dist/ stale — run \`npm run build\`.` — proven by a three-case spawn test on the real wrapper.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-12T10:37:54Z
- **Completed:** 2026-11-12T10:48:32Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `vite.config.js`: `build.manifest: true` + a `buildStamp` closeBundle plugin writing `dist/.vite/build-stamp.json` (sha256 of the manifest content, resolved to the build's own outDir); a missing manifest warns loudly and writes no bogus hash
- `e2e/server.mjs`: staleness guard directly below the existing dist/index.html check — missing manifest, missing/corrupt stamp, or hash mismatch all refuse exit 1 with the actionable message and clean the mkdtemp dataDir; mtime never read
- `test/e2e-server-guard.test.mjs`: four tests proving missing-dist refusal (via a wrapper copy in a temp root), stale-dist refusal (doctored manifest byte), dataDir cleanup on refusal, and fresh-dist boot with port poll + clean shutdown; manifest restored byte-identical in after()

## Task Commits

Each task was committed atomically:

1. **Task 1: build.manifest + sha256 stamp via closeBundle hook** - `7a4d705` (feat)
2. **Task 2: fail-closed staleness guard in e2e/server.mjs** - `cc73660` (feat)
3. **Task 3: three-case guard test** - `cd5b005` (test)

## Files Created/Modified

- `vite.config.js` — build.manifest + buildStamp closeBundle plugin (outDir-resolved)
- `e2e/server.mjs` — fail-closed staleness guard below the dist/index.html check
- `test/e2e-server-guard.test.mjs` — three-case spawn test on the real wrapper

## Decisions Made

- Stamp outDir resolved via `configResolved` (not hardcoded dist/): a `--outDir` harness build would otherwise overwrite dist/'s stamp with a hash of its STALE manifest — stamping the build's own output is the only correct resolution
- Fail-closed extended to absent evidence: missing manifest file, missing stamp and corrupt stamp JSON all refuse (a crash stack trace would be neither fail-closed nor actionable)
- Missing-dist test case documented in-file: uses a wrapper copy in a temporary empty root because ROOT derives from `import.meta.dirname` and the server has no ROOT env override

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing-dist test spawned the real wrapper and hung forever**
- **Found during:** Task 3
- **Issue:** the first draft's `spawnGuard` always spawned the real `e2e/server.mjs`; against a fresh dist it boots a real server and never exits, hanging the whole suite
- **Fix:** `spawnGuard` takes a server-path parameter; the missing-dist case spawns the copy in the temp root
- **Files modified:** test/e2e-server-guard.test.mjs
- **Verification:** full suite 4/4 in ~2.2s, no hang
- **Committed in:** cd5b005

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test-harness fix only; guard and build behavior exactly as planned. No scope creep.

## Issues Encountered

None.

## TDD Gate Compliance

- Task 3 carries `tdd="true"`. RED never ran as a failing state: the guard implementation already exists from Task 2 (the plan's own sequencing commits the guard before its test), so the freshly written test passed on first run — the tdd.md "feature may already exist" branch. Investigated and confirmed genuine (the same behavior was separately proven by the Task 2 manual verify: doctored manifest → exit 1 + message, before any test existed).
- Commit sequence is `feat(56-03)` ×2 then `test(56-03)` — no zero-padded RED-first sequence. Noted here per the gate rules; the test commit is labeled `test(56-03)` per the plan's done-criteria.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DELIV-01 complete; e2e can never silently serve a stale build again — every later phase's e2e runs behind this guard (sequencing rationale)
- 56-04 (i18n registry) edits `vite.config.js` next — the `buildStamp` plugin and `manifest: true` must survive that edit
- The guard test's stale case doctors `dist/.vite/manifest.json` in place; parallel executors building into dist/ concurrently should not run the guard test simultaneously with another plan's build (same coupling note as the plan frontmatter)

---
*Phase: 56-delivery-infrastructure*
*Completed: 2026-11-12*
