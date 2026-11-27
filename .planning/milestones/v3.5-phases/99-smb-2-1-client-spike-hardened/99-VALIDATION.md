---
phase: "99"
slug: "smb-2-1-client-spike-hardened"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-25"
---

# Phase 99 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (node v24.21.0) |
| **Config file** | none — package.json:19 `node --test --test-concurrency=2 test/*.test.mjs` |
| **Quick run command** | `node --test test/backup-smb-crypto.test.mjs test/backup-smb-client.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~12s (SMB files) / ~4min (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/backup-smb-crypto.test.mjs test/backup-smb-client.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green at baseline (2 documented pre-existing failures: fr-typography, webhook-routes GET list)
- **Max feedback latency:** ~12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 99-01-01 | 01 | 1 | SMB-01 | T-99-01/T-99-02 | MD4 RFC 1320 golden vectors ×7 + NT-hash pins + transcript chain | unit/golden | `node --test test/backup-smb-crypto.test.mjs` | ✅ | ✅ green |
| 99-01-02 | 01 | 1 | SMB-01 | — | NBSS/SMB2 codec round-trips, 17-bit length refusal, parser partial-feed | unit | same | ✅ | ✅ green |
| 99-01-03 | 01 | 1 | SMB-01 | T-99-02 | smbErrorFrom ×11 statuses + errno map + scrub of poisoned fixture | unit | same | ✅ | ✅ green |
| 99-02-01 | 02 | 2 | SMB-01 | T-99-03 | Handshake ordering, SessionId/TreeId adoption, signatures valid on the wire; forged reply → close + generic (verify-before-dispatch) | integration | `node --test test/backup-smb-client.test.mjs` | ✅ | ✅ green |
| 99-02-02 | 02 | 2 | SMB-01 | T-99-04 | Multi-chunk ≤60416 WRITE offset continuity; partial-write re-issue; read-back equality; TREE_DISCONNECT→LOGOFF order | integration | same | ✅ | ✅ green |
| 99-02-03 | 02 | 2 | SMB-01 | T-99-04/T-99-05/T-99-06 | sessionExpired envelope (fresh MessageId, offset resume, caps); ×9 smbClass scenarios; dialect/signing knobs; D-04 scrub on every error path | integration | same | ✅ | ✅ green |
| 99-02-04 | 02 | 2 | TEST-01 | T-99-SC | Zero new deps + suite at baseline | gate | `npm test` + `git diff package.json` empty | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/backup-smb-crypto.test.mjs` — MD4 + transcript + signing-key vectors (99-01 wave 1)
- [x] `test/backup-smb-client.test.mjs` — scripted NBSS mock + client tests (99-02)
- [x] `test/backup-smb-codec.test.mjs` — covered inside the crypto file (codec round-trips pinned there; no separate file needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-server NEGOTIATE/NTLMv2/signing interop (A1–A4 falsification) | SMB-01 | Requires a live samba/docker server — phase 100's D-02 e2e recipe | 100: dperson/samba env-gated e2e, SMB2-min happy path + SMB3-min refusal path |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < ~15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** executed 2026-11-25 (99-02 Task 3 fill; full suite 2,609 tests / exactly 2 documented pre-existing failures)
