---
phase: 14-schema-session-ground-truth
plan: 01
subsystem: auth-schema
tags: [schema, migration, sqlite, sessions, 2fa, doc-pipeline]
requires:
  - 13-DECISIONS.md D-01/D-04/D-31 (login_challenges DDL, replay-guard column, dormant column set)
  - legacy-fixture pre-phase-14 database (test/helpers/legacy-fixture.mjs)
provides:
  - sessions table with 8 columns (token_hash, user_id, created_at, expires_at, label, ip, last_seen_at, user_agent)
  - users table with dormant two_fa_enabled/two_fa_secret/two_fa_last_step columns
  - login_challenges table + login_challenges_expiry index (ready for Phase 17)
  - doc pipeline stripping sessions/tfa on both read (normalizeDoc) and write (docFromClient) paths
  - migration test proving full column set, definition agreement, served/stored doc shape, byte-identical second boot
affects:
  - 14-02 (client sessions page consumes strip-free docs)
  - 14-03 (session endpoints insert/query the new sessions columns)
  - 16 (Phase 16 writes the two_fa_* columns)
  - 17 (Phase 17 uses the login_challenges table)
tech-stack:
  added: []
  patterns:
    - guarded additive migration (SCHEMA DDL + byte-identical ensureColumn defs, P-B)
    - dual-surface doc sanitization (read + write path strip, P-A)
key-files:
  created: []
  modified:
    - server.js
    - src/data/seed.js
    - test/migration.test.mjs
decisions:
  - ensureColumn defs carry the full clause (integer not null default 0) byte-identical to SCHEMA, per plan P-B override of research Code Example 1
  - stored-clean test actively writes sessions/tfa literals back to prove the write path strips a stale-client resurrection, not just passes through cleanliness
  - pragma dflt_value pinned as string '0' and type pinned uppercase INTEGER/TEXT (node:sqlite normalization, probed live)
metrics:
  duration: 5min
  completed: 2026-10-26
status: complete
estimate:
  tokens: 40000
actuals:
  tokens: 3045
  tasks: 3
  commits: 3
plan_head_before: cea746ef3acf5e254e193255da9a56fd7e6fbee0
plan_head_after: 8cf8b51d84416784c60634dc1dcfef4727c2bfef
commits: 3
---

# Phase 14 Plan 01: Schema & Session Ground Truth — Tracer Migration Summary

Additive AUTH-02 migration landed in one vertical slice: sessions metadata columns, dormant 2FA columns, the login_challenges table, and the doc-field strip across both read and write paths — proven by a 14-test migration suite including definition agreement and a byte-identical second boot.

## What Was Built

### Task 1 — Schema DDL + ensureColumn + login_challenges (commit 9484850)

- `server.js` SCHEMA: sessions table extended in place with `label`, `ip`, `last_seen_at`, `user_agent`; users table extended with `two_fa_enabled integer not null default 0`, `two_fa_secret text`, `two_fa_last_step integer not null default 0`; new `login_challenges` table (`challenge_token_hash` PK per D-01, `user_id`, `expires_at`, `attempts`) plus `login_challenges_expiry` index.
- `openDb()`: seven new `ensureColumn` calls whose `def` arguments are byte-identical to the SCHEMA declarations (the two integer columns carry the full `integer not null default 0` clause — ALTER TABLE accepts it because the default is constant).
- No backfill: no UPDATE anywhere in server.js populates the new columns (D-31, Pitfall 21). `label` is never written server-side (D-18).

### Task 2 — Doc-strip both paths (commit 042fb0b)

- `normalizeDoc()` deletes `sessions` and `tfa` from every served document (read path).
- `docFromClient()` deletes `sessions` and `tfa` from every stored document (write path, P-A) — the stale-client comment extended per plan.
- `emptyDoc()` and `src/data/seed.js` no longer carry the `sessions: []` / `tfa: false` literals (D-33: deleted, not commented).

### Task 3 — Migration test extension (commit 8cf8b51)

`test/migration.test.mjs` grew from 9 to 14 tests, all passing:

- `legacyColumns` capture widened to `users` + `sessions`; pre-boot absence pinned (`sessions.ip`, `users.two_fa_enabled` absent from the fixture).
- Post-boot: full eight-column sessions set; the three `two_fa_*` columns on users; **dormancy proven** (`select distinct two_fa_enabled, two_fa_last_step` = exactly `[0, 0]`); `login_challenges` table + expiry index exist and the table starts empty.
- **Definition agreement** (P-B): `type`/`notnull`/`dflt_value` of all seven new columns deep-equal the SCHEMA-declared definitions on the *migrated legacy* database — a default-less nullable `two_fa_enabled` on legacy DBs would fail here.
- Served-doc shape: a legacy alice login reads a document with neither `sessions` nor `tfa` keys.
- Stored-clean: a stale client's `PUT` carrying `sessions`/`tfa` literals is stripped — the stored row's doc JSON contains neither key, and the surviving rows are intact.
- `snapshot()` pins `two_fa_enabled/two_fa_secret/two_fa_last_step` unchanged, so the existing second-boot test proves byte-identical across reboots including the new columns.

## Verification Performed

- `node --test test/migration.test.mjs` — **14/14 pass** (was 9/9 before).
- `npm test` — 450/451 pass; the single failure is **pre-existing and unrelated** (see Deviations / deferred-items.md).
- `npm run lint` — clean (one unused-`db` lint error introduced in Task 3 was fixed during the task).
- `npx prettier --check` on all three touched files — clean.
- Verified greps: no `d.sessions`/`d.tfa`/`doc.sessions`/`doc.tfa` doc-field reads remain in server.js; no backfill UPDATE exists.

## Tracer Feedback Gate

Task 1 is the plan's tracer. Its `<verify>` is automated-only (`node --test test/migration.test.mjs`); it was re-run end-to-end after the commit and passed 9/9 at the time — `⚡ Tracer verified end-to-end — expanding`.

## Deviations from Plan

None — the plan was executed exactly as written. Two in-task clarifications worth recording (not deviations):

1. **node:sqlite pragma normalization probed before asserting**: `pragma table_info` returns `type` uppercased (`INTEGER`/`TEXT`) and `dflt_value` as string `'0'` on both the fresh-DDL and ALTER-migrated surfaces (identical — the P-B contract holds). The test pins these real representations.
2. **[Pre-existing, out of scope — logged to deferred-items.md]** `test/i18n-prefs.test.mjs:243` ("the roadmap carries the phase 6 section") fails in the full suite because the v1.3 ROADMAP rewrite removed the v1.2 Phase 6 section it asserts on. Reproduced on a clean worktree of the base commit `cea746e` (17 pass / 1 fail) — it predates 14-01 and is not caused by any 14-01 change. Per the scope boundary it was logged to `.planning/phases/14-schema-session-ground-truth/deferred-items.md`, not fixed. **The phase gate (`npm test`) will stay at 450/451 until a later plan re-points that test at the v1.2 milestone archive.**

## Threat Model Compliance

- **T-14-05** (Tampering — doc-strip): mitigated — both paths strip independently; the stored-clean test proves the write path strips even a hostile stale-client resurrection.
- **T-14-06** (Information Disclosure — sessions schema): mitigated — all four metadata columns land dormant with NULL defaults and no backfill; the dormancy test proves no per-user data was generated at boot.

No new trust boundaries or attack surface beyond the plan's `<threat_model>`.

## Auth Gates

None.

## Known Stubs

None. All columns land intentionally dormant per D-31 — that is the Phase 16/17 contract, not a stub. Every `<verify>` in the plan was run and passed.

## Self-Check: PASSED

- `server.js`, `src/data/seed.js`, `test/migration.test.mjs` all modified and committed (3 commits on top of `cea746e`).
- Commits verified: `9484850`, `042fb0b`, `8cf8b51`.
- `git rev-list --count cea746e..8cf8b51` = 3 (matches `commits: 3`).
