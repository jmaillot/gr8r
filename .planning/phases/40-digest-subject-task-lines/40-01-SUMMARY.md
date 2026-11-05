---
phase: 40
plan: 01
subsystem: mailer
tags: [smtp, rfc2047, security, subject-encoding, i18n]
requires: []
provides:
  - hardened encodeWord (C0+DEL strip, RFC 2047 folding) — single builder for all four Subject call sites
  - truncate(name, cap) helper for Plan 02's 64/80-char caps
  - encodeWord/truncate exported as unit-test surface
affects: [40-02, 42]
tech-stack:
  added: []
  patterns: [rfc2047-encoded-word-folding, c0-strip-before-encode-decision]
key-files:
  created: [test/subject-encode.test.mjs]
  modified: [mailer.js]
decisions:
  - "RFC 2047 §6.2 folding ADOPTED — the 400-char hostile name measures 1879 octets single-line (Pitfall 1/2 condition met); folded at 900 octets/line with 'Subject: ' prefix margin"
  - "Export shape (research A2): encodeWord + truncate exported as named module exports; send API unchanged"
  - "D-09 unit matrix landed inside Task 1's commit (authored with the hardening; TDD_MODE false — no RED-phase gate)"
metrics:
  duration: ~14 min
  completed: 2026-11-05
status: complete
commits: 3
plan_head_before: 2e8e92719879cdfabd5ba93ae5436479101a48c8
plan_head_after: c2d8a7ce58eefaccc687115899edfff1191b62f3
actuals:
  tokens: 2300
  tasks: 3
  commits: 3
---

# Phase 40 Plan 01: Hardened Subject Builder (SUBJ-03) Summary

**One-liner:** C0/DEL-stripping + RFC 2047-folding `encodeWord` in mailer.js, pinned by a hostile-name SMTP-harness suite (CRLF injection, emoji, FR accents, 998-octet folding) — the SUBJ-03 foundation for Plan 02's digest subject/task lines.

## What Was Built

1. **Hardened `encodeWord`** (mailer.js): strips all `[\x00-\x1F\x7F]` between `text(value)` and the `/[^\x20-\x7E]/` pure-ASCII encode decision (D-08, T-40-01). `text()` itself untouched (Pitfall 4); `formatAddress` untouched (D-10).
2. **RFC 2047 §6.2 folding** (mailer.js): encoded-words join with `' '` until a line reaches 900 octets, then fold with `'\r\n '` — adopted because the 200+ char emoji test measured a 1879-octet single line (Pitfall 1/2 condition met, per plan's own trigger). Only affects the encoded path; short ASCII subjects stay single-line.
3. **`truncate(name, cap)`** (mailer.js): module-private helper adjacent to `escapeHtml`, reuses `text()`, char-based slice, single U+2026 only on truncation (D-13/D-14). Exported for tests; Plan 02 wires the 64/80-char caps.
4. **`test/subject-encode.test.mjs`** (new, 10 tests): full-builder tracer (CRLF workspace name through a real `sendDigest` against the loopback SMTP capture — exactly one `/^Subject: /m`, no `Bcc:` anywhere) + D-09 unit matrix (CRLF injection, FR accent round-trip, 400-char emoji round-trip + ≤998-octet folding, tab/DEL fast-path, empty-input) + truncate cap tests. SMTP harness and `decode()` copied verbatim from test/digest.test.mjs (byte-identical decoding rules).

## Deviations from Plan

### Auto-fixed Issues

**1. [Task sequencing] D-09 unit matrix landed in Task 1's commit**
- **Found during:** Task 1
- **Issue:** The five D-09 unit tests were authored together with the hardening (implementation pre-existed from Task 1, so a separate RED phase was meaningless; TDD_MODE is false for this phase).
- **Fix:** Tests committed with the Task 1 hardening (`8b16a18`); Task 2's verify re-run confirms both suites green and `test/digest.test.mjs` byte-unmodified. Task 2's commit (`36197a6`) carries the folding work its Pitfall 1/2 evaluation surfaced.
- **Files modified:** test/subject-encode.test.mjs
- **Commit:** 8b16a18, 36197a6

**2. [Planned-conditional] RFC 2047 folding adopted (Pitfall 1/2)**
- **Found during:** Task 2
- **Issue:** `encodeWord('A'.repeat(200) + '😀'.repeat(200))` produced a 1879-octet single Subject line — over the 998-octet relay limit (RFC 5322 §2.1.1).
- **Fix:** Fold between encoded-words at 900 octets/line (margin for the `Subject: ` prefix). Existing digest decoder (test/digest.test.mjs:164-166) still passes unmodified — its `encodedWords.join('')` path spans folded lines transparently.
- **Files modified:** mailer.js, test/subject-encode.test.mjs
- **Commit:** 36197a6

## Verification

- `node --test test/subject-encode.test.mjs` — 10/10 pass
- `node --test test/digest.test.mjs` — 11/11 pass, file byte-unmodified (git diff empty)
- Adjacent mailer suites (`notif-email-link`, `notif-i18n`) — 30/30 pass
- `git diff 2e8e927..HEAD -- mailer.js` shows only: encodeWord C0 strip + folding, truncate helper, export block — nothing else; buildDigestMessage untouched

## Commits

- `8b16a18` feat(40-01): harden encodeWord against C0/DEL injection + hostile-name tracer test
- `36197a6` feat(40-01): fold long encoded Subjects — RFC 2047 §6.2 between encoded-words
- `c2d8a7c` feat(40-01): truncate(name, cap) helper for subject/task-line caps

## Known Stubs

None — no placeholder data paths; truncate/encodeWord are wired helpers awaiting Plan 02's call sites by design.

## Threat Flags

None — no new attack surface beyond the plan's `<threat_model>`; T-40-01/T-40-04 mitigations implemented and tested here.
