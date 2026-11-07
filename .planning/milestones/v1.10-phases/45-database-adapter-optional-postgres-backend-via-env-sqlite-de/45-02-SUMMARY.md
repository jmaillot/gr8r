---
phase: 45-database-adapter-optional-postgres-backend-via-env-sqlite-de
plan: 02
subsystem: deployment
tags: [docker, pg, env-surface, d-02, d-03, copy-pin]
requires: ["45-01"]
provides: ["pg-enabled single Docker image", "DB_URL documented env surface"]
affects: ["45-06 (DEPLOY.md doc link)", "45-07 (POSTGRES_TEST_URL docs)"]
tech-stack:
  added: []
  patterns: [single-image-variant, pin-amendment, env-passthrough]
key-files:
  created: []
  modified:
    - Dockerfile
    - test/dependencies.test.mjs
    - .env.example
    - docker-compose.yml
decisions:
  - "node_modules + db-adapter.mjs enter the runtime stage with a dated Phase 45/D-03 comment; package.json/lock stay out (pin test does not demand them)"
  - "DB_URL block styled after the SMTP optional block; cross-reference points at the DEPLOY.md section Plan 06 will ship"
  - "POSTGRES_TEST_URL deliberately NOT added (test-only env, Plan 07 files)"
metrics:
  duration: ~15 min
  completed: 2026-11-07
  commits: 2
  tasks: 2
status: complete
---

# Phase 45 Plan 02: Deployment surface (Docker + DB_URL env) Summary

**One-liner:** Single pg-enabled Docker image (runtime stage now COPYs node_modules + db-adapter.mjs) with the D-12 COPY pin amended to match exactly, and DB_URL documented in .env.example + forwarded via docker-compose with the SQLite-default posture explicit.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Dockerfile runtime stage + COPY-pin amendment | 01f7dea | Dockerfile, test/dependencies.test.mjs |
| 2 | DB_URL env surface (.env.example + docker-compose.yml) | 4a7299c | .env.example, docker-compose.yml |

## Task 1 — Dockerfile + pin

- Runtime stage: added `COPY --from=build /app/node_modules ./node_modules` and `COPY --from=build /app/db-adapter.mjs ./db-adapter.mjs` with a dated `Phase 45 (2026-11-07, D-03)` comment following the existing per-line convention. package.json/package-lock NOT copied (pin test doesn't demand them).
- `test/dependencies.test.mjs`: expected COPY array amended to `['db-adapter.mjs','dist','mailer.js','node_modules','oidc.js','seed.json','server.js','src','totp.js','tz.js']` with a dated D-03 comment line; sort() and message shape preserved.
- `docker-entrypoint.sh` verified unchanged — env passes through as-is (DB_URL flows via compose `environment:`).

## Task 2 — DB_URL surface

- `.env.example`: new `# ---- Database backend (optional) ----` block (SMTP-block style): live empty `DB_URL=`, commented `postgres://user:password@host:5432/dbname` example, password-lives-in-.env warning, explicit "empty keeps the zero-dependency SQLite default" note, cross-reference to DEPLOY.md section (ships in Plan 06).
- `docker-compose.yml`: `DB_URL: ${DB_URL:-}` passthrough with one-line comment. POSTGRES_TEST_URL intentionally omitted (Plan 07 scope).

## Verification

- `node --test test/dependencies.test.mjs` → 2 pass, 0 fail
- `docker build -q .` → `build:0` (single image builds end-to-end incl. pg tree + vite dist)
- `npm run i18n:scan` → exit 0
- `git ls-files --error-unmatch .env.example docker-compose.yml` → both tracked
- `npm test` full suite → 1060 tests, 1052 pass, 5 fail — **byte-identical to the pre-existing baseline failures documented in 45-01-SUMMARY.md** (D-74 backup, i18n catalogue ×3, SPA deep-link); zero regressions introduced by this plan

## Deviations from Plan

None — plan executed exactly as written.

## Pre-existing failures (out of scope)

The 5 baseline failures above predate this plan (verified against HEAD in the 45-01 summary via a throwaway worktree at e7be348); not touched per the scope boundary.

## Known Stubs

None.

## Self-Check: PASSED

- Commits 01f7dea, 4a7299c verified in `git log`
- All four modified files present in the working tree and committed
