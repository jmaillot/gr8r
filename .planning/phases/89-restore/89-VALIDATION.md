---
phase: "89"
slug: "restore"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-22"
---

# Phase 89 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` runner (Node 24 built-in), `--test-concurrency=2` |
| **Config file** | none — glob-driven via package.json `"test": "node --test --test-concurrency=2 test/*.test.mjs"` |
| **Quick run command** | `node --test test/restore-routes.test.mjs` (per-file) |
| **Full suite command** | `npm test` (includes catalogue/locale-parity/dependency-pin tests) |
| **Estimated runtime** | ~30–60 s full suite |

---

## Sampling Rate

- **After every task commit:** the touched `node --test test/restore-*.test.mjs` file
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite green; PG-parity + MinIO e2e green with env set at least once before ship
- **Max feedback latency:** 60 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 89-xx-xx | TBD | 0+ | BKRST-01 | T-89-02/03 | manifest preview streams + sha256 re-verify; corrupt manifest keyed refusal | unit+route | `node --test test/restore-preview.test.mjs` | ❌ W0 | ⬜ pending |
| 89-xx-xx | TBD | 0+ | BKRST-01 | — | S3-located preview via 88-01 download seam | route+MinIO e2e | `MINIO_TEST_URL=http://127.0.0.1:9001 node --test test/restore-s3-e2e.test.mjs` | ❌ W0 | ⬜ pending |
| 89-xx-xx | TBD | 0+ | BKRST-02 | T-89-01 | import-as-new: remap totality pre-insert, `-restored` counter, restorer-only membership, one tx, skip report | unit+route | `node --test test/restore-import.test.mjs` | ❌ W0 | ⬜ pending |
| 89-xx-xx | TBD | 0+ | BKRST-03 | T-89-01 | overwrite: type-to-confirm, automatic pre_restore snapshot, single tx, operational tables untouched | route | `node --test test/restore-overwrite.test.mjs` | ❌ W0 | ⬜ pending |
| 89-xx-xx | TBD | 0+ | BKRST-04 | T-89-01/04 | DR: Super-Admin-only, RESTORE-INSTANCE, instance_roles rebuild with user_id validation, global session revocation post-commit | route | `node --test test/restore-instance.test.mjs` | ❌ W0 | ⬜ pending |
| 89-xx-xx | TBD | 0+ | D-89-31 | — | tx/lock parity both engines; stale restore_runs + lock release at boot | parity (env-gated) | `POSTGRES_TEST_URL=… node --test test/pg-matrix.test.mjs` (extended) | ❌ W0 (extend) | ⬜ pending |
| 89-xx-xx | TBD | 0+ | D-89-33 | T-89-02/03 | tar-reader path traversal + manifest injection refusals | unit (security) | `node --test test/restore-security.test.mjs` | ❌ W0 | ⬜ pending |
| 89-xx-xx | TBD | 0+ | UI wiring | — | restore card/drawer/confirm render-only + esc() discipline | source-assertion | `node --test test/restore-client.test.mjs` | ❌ W0 | ⬜ pending |
| 89-xx-xx | TBD | 0+ | D-89-01 | — | restore↔export mutual exclusion (keyed refusals both directions) | route | covered in `test/restore-routes.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — Task ID / Plan / Wave columns filled by the planner; rows re-keyed per actual plan task IDs.*

---

## Wave 0 Requirements

- [ ] `test/restore-preview.test.mjs` — BKRST-01 (incl. golden round-trip vs 86-written archives)
- [ ] `test/restore-import.test.mjs` — BKRST-02
- [ ] `test/restore-overwrite.test.mjs` — BKRST-03
- [ ] `test/restore-instance.test.mjs` — BKRST-04
- [ ] `test/restore-security.test.mjs` — D-89-33 refusal pins (traversal, injection, escalation)
- [ ] `test/restore-client.test.mjs` — UI wiring source assertions
- [ ] extend `test/pg-matrix.test.mjs` — restore tx/lock parity pins (needs `POSTGRES_TEST_URL` docker-run step — no local Postgres)
- [ ] `test/restore-s3-e2e.test.mjs` — MinIO download→restore e2e (env-gated, `gr8r-minio-e2e` :9001)
- [ ] No framework install needed (node:test built-in)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DR re-login wall felt end-to-end (all sessions incl. initiator revoked after commit) | BKRST-04 | Multi-client browser behavior | Two logged-in clients; run DR restore; both land on re-login |
| 5-locale consequence-text overflow in confirm modal | BKRST-03/04 | Visual | Switch locale de/fr; open overwrite + DR confirm; verify text wraps, modal scrolls |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
