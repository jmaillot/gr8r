---
phase: 26-re-wrap-rotation-key-custody-runbook
reviewed: 2026-11-01T00:00:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - server.js
  - DEPLOY.md
  - test/totp-rewrap.test.mjs
  - test/totp-encryption.test.mjs
findings:
  critical: 0
  high: 0
  medium: 2
  low: 3
  total: 5
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** deep (cross-file: server.js ↔ tests ↔ DEPLOY.md runbook)
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the Phase 26 re-wrap rotation pass (`migrateTotpReWrap`, `decryptV1WithMaterial`, `isStaleEnvelope` in server.js), the key-custody runbook in DEPLOY.md, and the new/extended test suites. Commits 5956807, b3c4025, 020cbd7, 761a4af, 15bf26a.

**Security posture is solid.** Verified: no key material, ciphertext, or plaintext appears in any console line (counts, version tags, user ids only — T-26-01 honored); keys enter via env only in both code and every runbook command (no argv exposure, Pitfall 5 respected); `MASTER_KEY_PREVIOUS` without `MASTER_KEY` throws at boot (D-K2 fail-closed); identical-material warning present; the `vacuum into` path is quote-escaped; undecryptable rows are never mutated or deleted (D-K9); the shared `isStaleEnvelope` predicate is genuinely closed over by both the scan and the in-transaction re-check (no WR drift, T-26-04); `node --test test/totp-rewrap.test.mjs` passes 11/11. The runbook-parity tests reading DEPLOY.md's literal commands are a strong anti-drift mechanism.

The findings below are consistency gaps between the case-insensitive stale predicate and the case-sensitive runtime decrypt, one silently self-undoing rollback path in the runbook, one low-probability backup-name collision, and two info-level items.

## Findings

| # | Severity | Location | Description | Suggested fix |
|---|----------|----------|-------------|---------------|
| 1 | **medium** | server.js:1241-1248 vs server.js:321 (`decryptTotpSecret`) | **Case-sensitivity mismatch silently strands an uppercased `V2:` envelope.** `isStaleEnvelope` compares the version tag case-insensitively (`parts[0].toLowerCase() === 'v2'`), so a row like `V2:<currentId>:…` is deemed *converged* — it is never a stale candidate, so it is never re-wrapped and no D-K9 warn fires. But `decryptTotpSecret` matches the tag case-sensitively (`parts[0] === 'v2'`) and returns null at runtime → login fails closed for that user forever. Worse, the DEPLOY.md D-K13 query (`not like 'v2:<id>:%'`) is also case-insensitive via SQLite LIKE, so it reports `0` — the operator is told the fleet is converged. Three layers disagree on the same row. | Make the layers agree. Cheapest: in `decryptTotpSecret`'s v2 branch use `const tag = (parts[0] \|\| '').toLowerCase(); if (tag !== 'v2') return null;` (same for the v1 branch). Alternatively make `isStaleEnvelope` case-sensitive on the tag so odd-cased rows land in the D-K9 warn path instead of the converged path. Add a seed-matrix case for an uppercased tag. |
| 2 | **medium** | DEPLOY.md, "Backup-before-rotation / rollback" section | **Rollback is silently undone if `MASTER_KEY_PREVIOUS` is kept.** The runbook says to restore the backup, then put the old key back "and remove `MASTER_KEY_PREVIOUS` unless you keep both deliberately." If both keys remain configured, the very next boot re-runs `migrateTotpReWrap` over the restored (old-format) rows and re-rotates them to the new key — the restore is reverted within seconds, with a fresh backup minted and only console lines as a trace. An operator who "keeps both deliberately" gets the incident back. | Rewrite the instruction: after a rollback, `MASTER_KEY` must be the old key and `MASTER_KEY_PREVIOUS` must be **removed** — no "unless". Add one sentence: "Keeping both keys configured re-runs the rotation on the next boot and undoes this restore." |
| 3 | **low** | server.js:1322-1324 and server.js:1476-1479 | **Backup filename collision between the two sibling passes.** Both passes derive the backup name from `new Date().toISOString()` (millisecond precision). On a boot where *both* the plaintext pass and the re-wrap pass have work, if they reach the backup block within the same millisecond (fast, small DBs), the second `vacuum into '<same-name>'` fails ("file already exists") and the re-wrap pass logs the skip line and returns — SC-1's "one boot re-wraps everything" is intermittently violated with no retry hint. Probability is tiny but nonzero, and the failure is silent (a skip line that looks like the tested D-74 failure). | Append a per-pass discriminator to the stamp, e.g. `projects-preenvelope-${stamp}-rewrap.db`, or retry once with a suffixed name before giving up. The runbook already documents two backup lines per rotation boot, so the suffix costs nothing there. |
| 4 | **low** | server.js:1496-1501 vs server.js:377 (`requireTotpSecret`) | **Empty-plaintext success criterion inconsistency.** The re-wrap treats `plaintext === null` as the only failure, so a v1 envelope decrypting to `''` would be re-sealed into a v2 envelope of the empty string — which `requireTotpSecret` (`secret ? ok : fail`) then treats as a permanent failure at runtime, even though the pass reported the row re-sealed. Unreachable today (the only v1 writer, `migrateTotpEncryption`, skips blank rows), but the two criteria should match to stay future-proof. | In the re-wrap loop, treat `!plaintext` (not `plaintext === null`) as undecryptable, or assert non-empty before re-sealing. |
| 5 | **low (info)** | server.js:1456-1457 | **Dead branch in the D-K12 nudge.** The `resolvesPrevious` probe has a `tag === 'v1'` trial-decrypt branch, but a v1 row is *always* stale per `isStaleEnvelope` (tag ≠ `v2:<currentId>`), so a zero-candidate boot can never contain a v1 row — the branch is unreachable. Harmless, but it implies a guarantee ("the nudge knows about v1 rows") that cannot fire and slightly misleads readers of the nudge condition. | Either delete the v1 branch (with a comment that v1 rows are always stale so the zero-candidate scan cannot contain one) or add a test proving the branch is dead. |

## Verified non-issues (explicitly checked)

- **No key material in logs/argv/env dumps**: grep-audited all new console lines in `migrateTotpReWrap`/`migrateTotpEncryption` — counts, ids, version tags only; the runbook key-id one-liner passes the key via env, never argv; parity test enforces this (`T-26-05`).
- **Transactionality/idempotency**: `begin immediate` + in-transaction re-scan via the *same* `staleCandidates()` closure; boot-twice byte-identity asserted; D-74 backup-before-write with skip-on-failure asserted both for the happy path and a forced `vacuum into` failure.
- **D-K2 fail-closed**: `MASTER_KEY_PREVIOUS` without `MASTER_KEY` throws before serving; identical-material collision only warns (correct — rotation then re-wraps zero rows, which the D-K12 nudge will surface).
- **D-K9**: undecryptable rows proven byte-identical, counted, warned, never deleted.
- **Runbook SQL**: uses `like` (codebase prefilter convention), quote-safe, and the parity test proves it returns ≥1 on a stale fixture and 0 after rotation — both directions, so it cannot rubber-stamp.
- **D-78c decrypt exclusivity**: call-site audit extended to 4 sanctioned regions and passes.

---

_Reviewed: 2026-11-01_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
