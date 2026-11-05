---
phase: 39-notification-audit-doc-only
reviewed: 2026-11-05T12:00:00Z
depth: quick
files_reviewed: 1
files_reviewed_list:
  - docs/notification-audit.md
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 39: Code Review Report (doc-only)

**Reviewed:** 2026-11-05
**Depth:** quick
**Files Reviewed:** 1
**Status:** clean

## Summary

Doc-only phase: no code files changed (boundary verified — `git diff 0e64d67..HEAD` touches only `docs/notification-audit.md` + `.planning/`). The deliverable `docs/notification-audit.md` was reviewed against the plan's three prohibitions and its citations were spot-verified against the committed code (`0e64d67`, the phase-base pin):

- **No real emails / tokens / forgeable unsubscribe URIs** — PASS. The only URI is the placeholder `<https://example.com/unsubscribe/opaquepart>` (RFC 8058 §6 hard-to-forge pattern, explicitly labeled placeholder). No secrets, no real addresses.
- **No proven-negative claims for dead keys** — PASS. Every dead-key row (`mention_ws`, `assign_self`, `assign_status`, `assign_over`, push rows) uses dated absence-of-evidence phrasing ("aucun lecteur trouvé (grep …, 2026-11-05)", "⚠️ absence constatée, pas prouvée" ×4) and includes the dynamic `np[k]` access caveat.
- **No one-click-without-DKIM compliance claims** — PASS. `List-Unsubscribe-Post` one-click is explicitly deferred to a DKIM milestone; the doc states the mailer signs nothing (grep verified: 0 DKIM occurrences in `server.js`/`mailer.js`) and warns "Ne pas promettre de conformité one-click Gmail/Yahoo à partir des seuls headers." RFC 8058 §3.1/§4 quotes verified against the RFC text ("MUST apply at least one valid DKIM signature"); the hard-to-forge recipient identifier is correctly cited to §6 (Security Considerations).

Citation spot-checks all matched the committed code at `0e64d67`: `NOTIF_EMAIL_KIND` (server.js:1188), `email_mention` default (1144), `=== false` email gate (1248), digest suppression of reminder emails (1260), offsets morning_of/past_due (1437/1440), reminders_sent claim (1463–1472), strict stored digest opt-in `!== true` (1517), `sendDigest` post-commit (1558–1566), `buildDigestMessage` header block (mailer.js:592–603, mailer.js:525), `emitMentions` gates (actions.js:146–151), watchers/update emission (actions.js:177–210), settings toggles (settings.js:392, 397–399), `NOTIF_PREF_DEFAULTS` (11 keys, `email_comment` the only `false`). All 16 whitelist keys appear in the doc. All rows carry `proposed` status (D-05 gate intact).

## Info

### IN-01: Citations already drifting against the live working tree

**File:** `docs/notification-audit.md` (throughout)
**Issue:** The doc's citations match committed HEAD (`0e64d67`) exactly, but the current working tree has uncommitted `server.js` changes (140 insertions) that shift the cited lines (e.g. `NOTIF_EMAIL_KIND` 1188 → 1213, `=== false` gate 1248 → 1273, digest opt-in 1517 → 1542). This is the documented intended behavior — the doc's preamble states a mismatching citation "signale une dérive du code, pas du document" — so it is not a defect in the deliverable. Note for the owner: any future implementation milestone must re-cite against the code state at that time, not transcribe these line numbers.
**Fix:** None required in the doc. When the uncommitted server.js work lands, treat every server.js citation as stale by design and re-verify per row before coding.

### IN-02: Code comment vs doc count mismatch on the default layer (12 vs 11)

**File:** `docs/notification-audit.md:47` (vs `server.js:1142`)
**Issue:** The doc correctly states `email_comment` is the only `false` of **11** default keys (verified: `NOTIF_PREF_DEFAULTS` at server.js has exactly 11 entries). The adjacent code comment in server.js says "12-key default layer" — the code comment is off by one, the doc is right.
**Fix:** None in the doc. The server.js comment discrepancy is pre-existing code, outside this doc-only phase's scope; worth correcting whenever server.js is next touched (note only, not fixed here — read-only review).

---

_Reviewed: 2026-11-05_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: quick_
