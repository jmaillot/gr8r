---
phase: "90"
slug: "polish-verification-sweep"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-23"
---

# Phase 90 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` runner (Node 24 built-in), `--test-concurrency=2` |
| **Config file** | none — glob-driven via package.json `"test": "node --test --test-concurrency=2 test/*.test.mjs"` |
| **Quick run command** | `node --test test/backup-routes.test.mjs` (per-file) |
| **Full suite command** | `npm test` (includes catalogue/locale-parity/dependency-pin tests) |
| **Estimated runtime** | ~30–60 s full suite; env-gated e2e +2–3 min |

**Env-gated instruments (containers already live, validated in 89 UAT):**
- `POSTGRES_TEST_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` (gr8r-pg-test, postgres:18-alpine)
- `MINIO_TEST_URL=http://127.0.0.1:9001` (gr8r-minio-e2e)
- **pg-matrix discipline:** per-file `node --test` runs only — never `--test-concurrency=2` on the shared live DB (89-UAT lesson)

---

## Sampling Rate

- **After every task commit:** the touched `node --test test/<area>-*.test.mjs` file
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite green; PG-parity + MinIO e2e green with env set at least once before ship (D-90-19: env-gated only, manual pre-ship run)
- **Max feedback latency:** 60 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 90-xx-xx | TBD | 0+ | SACON-01 | T-90-01 | console roster-first; promote-search ≥2 chars server-validated; last-operator guard D-118/119 intact | route+source-assertion | `node --test test/governance-console.test.mjs` | ❌ W0 | ⬜ pending |
| 90-xx-xx | TBD | 0+ | SACON-01 (SC-2) | T-90-02 | download stream tiering: backup-op = project/workspace runs, instance = super-admin only; missing-run keyed refusal; audit on success | route | `node --test test/backup-download.test.mjs` | ❌ W0 | ⬜ pending |
| 90-xx-xx | TBD | 0+ | SC-2 | T-90-02 | verify-checksum: full re-hash local / S3 stream-back; operator throttle D-89-22; mismatch keyed refusal | route+MinIO e2e | `MINIO_TEST_URL=http://127.0.0.1:9001 node --test test/backup-checksum.test.mjs` | ❌ W0 | ⬜ pending |
| 90-xx-xx | TBD | 0+ | SC-3 | — | rotation projection dry-run: GFS walk minus deletes, empty-state 0-run, operator throttle; kept-until bucket position per request | route | `node --test test/backup-rotation-preview.test.mjs` | ❌ W0 | ⬜ pending |
| 90-xx-xx | TBD | 0+ | SC-3 | — | assignGfsBuckets bucket-position rendering: kept N/M per scale, moves on arrival simulation | unit | `node --test test/gfs-kept-until.test.mjs` | ❌ W0 | ⬜ pending |
| 90-xx-xx | TBD | 0+ | SC-4 | — | full-cycle e2e: task → backup → S3 upload → local delete → list badge s3 → preview → DR restore ON PG; run report + session revocation asserts | e2e (env-gated) | `POSTGRES_TEST_URL=… MINIO_TEST_URL=… node --test test/backup-restore-fullcycle-e2e.test.mjs` | ❌ W0 | ⬜ pending |
| 90-xx-xx | TBD | 0+ | SC-4 | — | DST boundaries EU+US (2026/2027 transitions): 02:30 cron spring-forward = no fire, fall-back = first occurrence; digest 08:00 | unit (pure nextRunAt) | `node --test test/dst-cron-boundaries.test.mjs` | ❌ W0 | ⬜ pending |
| 90-xx-xx | TBD | 0+ | D-90-22 | — | restoreList invalidation on terminal backup run (poll tick) | source-assertion | `node --test test/backup-history-client.test.mjs` (extend) | ⚠️ W0 (extend) | ⬜ pending |
| 90-xx-xx | TBD | 0+ | D-90-23 | — | missingBlob flag surfaces on run + ⚠ history badge; writer emits at creation | route+unit | `node --test test/backup-export.test.mjs` (extend) | ⚠️ W0 (extend) | ⬜ pending |
| 90-xx-xx | TBD | 0+ | D-90-20 | — | new i18n keys gated ×5 locales (de/en/es/fr/nl) | catalogue test (existing) | `npm test` (locale-parity included) | ✅ exists | ⬜ pending |
| 90-xx-xx | TBD | 0+ | SC-5 | — | DEPLOY.md sections exist (timezone/NTP posture, engine vs legacy CLI) | doc assertion | manual review at verify-work | — | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `test/governance-console.test.mjs` — stubs for console roster/search/promote (SACON-01)
- [ ] `test/backup-download.test.mjs` + `test/backup-checksum.test.mjs` — stubs for SC-2
- [ ] `test/backup-rotation-preview.test.mjs` + `test/gfs-kept-until.test.mjs` — stubs for SC-3
- [ ] `test/backup-restore-fullcycle-e2e.test.mjs` + `test/dst-cron-boundaries.test.mjs` — stubs for SC-4
- [ ] Extend existing `test/backup-history-client.test.mjs` (D-90-22 pins) and `test/backup-export.test.mjs` (D-90-23 writer-stamp case) rather than new files — per 90-03-PLAN.md assignments

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DEPLOY.md accuracy (NTP posture, engine distinction) | SC-5 | doc prose, not code | owner reads the two new sections; confirm they match the real crontab + `--backup` CLI behavior |
| Console promote UX feel (toast, roster update no-reload, show-more pacing) | SACON-01 | interaction quality | live click-through as Super Admin: search 1 char (roster only), 2+ chars (candidates), promote, verify no reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
