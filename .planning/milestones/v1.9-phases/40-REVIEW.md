---
phase: 40-digest-subject-task-lines
reviewed: 2026-11-05T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - mailer.js
  - server.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/digest.test.mjs
  - test/i18n-core-features.test.mjs
  - test/subject-encode.test.mjs
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 40: Code Review Report

**Reviewed:** 2026-11-05
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the Phase 40 changes: hardened `encodeWord` (C0/DEL strip + RFC 2047 folding), the `truncate` helper, `notif.digest.subjectWs` bracketed subjects, `Project — Task` digest lines, and their tests. Cross-traced `buildDigestMessage` against `tFor`/`interpolate` in `src/core/i18n.js`, the digest loop in `server.js` (lines 1533–1593), and both locale catalogues.

The core hardening is sound: the C0/DEL strip before the encode decision genuinely closes the SMTP header-injection path (verified: `text()` only collapses CR/LF, so the added `[\x00-\x1F\x7F]` strip at `mailer.js:57` is the only thing catching tabs/NULs on the ASCII fast path — the D-09 unit test pins this). Folding logic is correct (chunks are whole code points, per-word base64 round-trips, `lineLen` accounting has ~98 octets of margin against the 998 limit). The server-side digest mapping (`server.js:1589-1590`) resolves project names only after `assignee === recipient` + `inScopeProject` + `memberCanReadProject`, and the mailer degrades `''` to title-only — the T-40-06 no-leak pin holds. Both `subjectWs` keys exist in en.json/fr.json (lines 1688) and the FR NBSP assertion matches the catalogue byte-for-byte.

No critical findings. Two warnings: the 998-octet fix only covers the encoded-word path, and `truncate` can split a surrogate pair.

## Warnings

### WR-01: encodeWord's pure-ASCII fast path still emits unbounded Subject lines (>998 octets)

**File:** `mailer.js:58` (fast path), with untruncated call sites at `mailer.js:456`, `mailer.js:468` (notif subjects), `mailer.js:776` (invite subject)

**Issue:** Phase 40's Pitfall 1 fix (RFC 2047 folding, 900-octet budget) applies only when input contains a non-ASCII char. On the fast path (`if (!/[^\x20-\x7E]/.test(input)) return input;`) the string is returned with no length cap and no folding. `buildNotifMessage` builds its Subject from `taskTitle = text(msg.task)` and `buildInviteMessage` from `workspace` — both user-controlled and untruncated. A ~1000-character ASCII task title produces `Subject: ...` over the RFC 5322 §2.1.1 998-octet relay limit — exactly the failure mode the folding was added to prevent, surviving through the ASCII path. The digest subject is safe (it goes through `truncate(workspace, 64)`), but the notif and invite paths are not. No injection risk (C0 strip still applies), but delivery of that mail can be rejected/mangled by strict relays.

**Fix:** Cap or fold the ASCII path too. Minimal fix — bound the fast path with the same line budget:

```js
function encodeWord(value) {
  const input = text(value).replace(/[\x00-\x1F\x7F]/g, '');
  if (!/[^\x20-\x7E]/.test(input)) return foldAscii(input); // wrap at ~900 octets, CRLF+SP
  ...
```

or, cheaper: truncate the notif/invite subjects before header assembly (`truncate(taskTitle, 120)` in `buildNotifMessage`, matching the digest builder's discipline).

### WR-02: truncate() slices UTF-16 code units — can split a surrogate pair at the cap boundary

**File:** `mailer.js:103-106`

**Issue:** `s.slice(0, cap)` operates on UTF-16 code units. A workspace name whose 64th code unit is the high half of an astral pair (emoji) yields a lone trailing surrogate; `Buffer.from(..., 'utf8')` then encodes it as U+FFFD, so the Subject shows `…�` — corrupted user content at exactly the boundary the D-13/D-14 tests exercise (their fixtures use BMP chars, so the tests don't catch it). Same risk for task/project labels at the 80 cap (`mailer.js:600`).

**Fix:**

```js
function truncate(name, cap) {
  const s = text(name);
  if (s.length <= cap) return s;
  let cut = Array.from(s.slice(0, cap)); // code points
  return cut.join('') + '…';
}
```

(If byte-length fidelity matters more than code-point count, slice on a code-point boundary of the UTF-8 encoding instead.)

## Info

### IN-01: console.error debug artifact in the hostile tracer test

**File:** `test/subject-encode.test.mjs:108`

**Issue:** `console.error('SEND ERROR:', ...)` inside the catch-rethrow block. It's diagnostic and the error is rethrown, so the test still fails loudly — but it's a debug artifact that will fire on every legitimate transport error run.

**Fix:** Drop the try/catch wrapper entirely (the rethrow adds nothing) or remove the console line and let the thrown error surface.

### IN-02: buildInviteMessage assembles its body differently from its three sibling builders

**File:** `mailer.js:823-840`

**Issue:** The invite builder joins with the `CRLF` constant and omits the trailing `''` element, so its payload termination (`...+ CRLF + CRLF + body + CRLF`) differs structurally from `buildNotifMessage`/`buildDigestMessage`/`buildSecurityAlertMessage` (which join `[..., '']` with `'\r\n'`). Functionally equivalent today, but four MIME frames in one file with two assembly idioms invites drift — this phase touched two of the four and left the inconsistency in place. Pre-existing, noted as observation only.

**Fix:** Align the invite builder on the `[...headers, '', body].join('\r\n') + '\r\n'` shape used by the other three.

### IN-03: fakeSmtp/decode/waitFor harness duplicated verbatim across two test files

**File:** `test/subject-encode.test.mjs:17-77` vs `test/digest.test.mjs:117-176`

**Issue:** ~60 lines of SMTP capture harness copied byte-for-byte (the comment at the top of subject-encode.test.mjs says this was deliberate, to prove decoding-rule identity). The copy is now a maintenance liability: a fix to the fake server or the decode regex must be applied twice, and the "byte-identity" property is enforced only by comment, not by test.

**Fix:** Extract `fakeSmtp`/`decode`/`waitFor` into `test/helpers/` (the file already imports from `./helpers/server.mjs`) and have both suites import them; add a one-line assertion that both files use the same module if byte-identity is still worth pinning.

---

_Reviewed: 2026-11-05_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
