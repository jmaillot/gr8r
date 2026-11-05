---
phase: "40"
slug: "digest-subject-task-lines"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-05"
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (Node built-in), concurrency 2 |
| **Config file** | none — glob `test/*.test.mjs` via package.json script |
| **Quick run command** | `node --test test/digest.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/digest.test.mjs` (+ the new hostile-name test file)
- **After every plan wave:** Run `npm test` (full suite; includes `i18n-scan.test.mjs`)
- **Before `/gsd-verify-work`:** Full suite green + `npm run i18n:scan` green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD at planning | 01 | 1 | SUBJ-01 | T-40-* | claim key `${ws.id}:${user_id}:digest:${localDate}` byte-identical; no double-send | integration | `node --test test/digest.test.mjs` | ✅ / ❌ W0 | ⬜ pending |
| TBD at planning | 01 | 1 | SUBJ-02 | T-40-02 | invisible project name never appears in text or HTML part (no leak) | integration | `node --test test/digest.test.mjs` | ❌ W0 | ⬜ pending |
| TBD at planning | 01 | 1 | SUBJ-03 | T-40-01 | CRLF/emoji/accents/200+ names ⇒ one well-formed RFC 2047 Subject, no header injection, no mojibake | unit + integration | `node --test test/subject-encode.test.mjs` | ❌ W0 | ⬜ pending |
| TBD at planning | 01 | 1 | SC-4 | — | `notif.digest.subjectWs` catalogued EN+FR, i18n scan green | gate | `npm run i18n:scan` | ✅ gate | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/subject-encode.test.mjs` (or equivalent) — hostile-name unit tests for SUBJ-03 (CRLF, emoji, FR accents, 200+ chars)
- [ ] Two-workspace subject test + `Project — Task` line tests (text & HTML) — SUBJ-01/02
- [ ] Decide whether `encodeWord` needs exporting for unit tests (A2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual rendering of em dash + HTML-escaped names in a real mail client | SUBJ-02 | Mail-client rendering not reproducible in node harness | Send digest to a real inbox, inspect subject + task lines |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
