---
phase: 09-server-messages-activity-history
reviewed: 2026-10-24T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - server.js
  - src/core/api.js
  - src/core/i18n.js
  - src/core/utils.js
  - src/components/task-list.js
  - src/actions/actions.js
  - src/data/seed.js
  - src/overlays/modals.js
  - src/overlays/drawer.js
  - src/overlays/palette.js
  - src/overlays/popovers.js
  - src/pages/inbox.js
  - src/shell/layout.js
  - scripts/i18n-scan.mjs
  - test/error-codes.test.mjs
  - test/activity-verbs.test.mjs
  - test/i18n-locale.test.mjs
  - test/server-boot.test.mjs
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 9: Code Review Report — Server Error Codes & Activity History (re-review after gap closure)

**Reviewed:** 2026-10-24 (re-review of gap-closure plans 09-04..09-07, commits 786715b..c476b37)
**Depth:** standard
**Files Reviewed:** 15 production + 4 test files (diff scope of the fix wave)
**Status:** issues_found (0 critical, 0 warning, 2 new info)

## Summary

All 16 findings from the original review are **resolved and verified in source**. The three blockers (CR-01 dead thrown-error codes, CR-02 broken params transport, CR-03 legacy prose divulged) are fixed, and the test suite now pins each fix: `test/error-codes.test.mjs` grew from a one-directional static scan to 34 tests including reverse parity, a reserved-placeholder guard, real-server payload-shape assertions for all four named thrown errors, and regression tests for WR-03/WR-06/WR-07. `test/activity-verbs.test.mjs` un-skips the legacy-suppression pin. Full suite: **435 tests, 435 pass, 0 fail, 0 skipped**.

Two new Info-level findings were introduced by the fix wave itself (IN-05, IN-06 below); neither blocks the phase.

## Resolution Verification (all 16 original findings)

### CR-01 — Thrown `httpError` calls carry codes — RESOLVED (13804a9)

All eight throw sites now pass a code: `server.js:715` (`lastPrivateMember`), `:727` (`workspaceNotFound`), `:963` (`noWorkspaceReady`), `:984` (`enterValidEmail`), `:985` (`passwordTooShort`), `:987` (`accountExists`), `:1183` (`bodyTooLarge`), `:1194` (`invalidJson`). Pinned by real-server tests: `lastPrivateMember returns 409…`, `bodyTooLarge reaches the client as a full 413 response`, `invalidJson returns 400`, `workspaceNotFound…`, plus reverse parity (`every catalogued err.* code is emitted by server.js or allowlisted as client-side`, test line 249).

### CR-02 — Interpolation params transport — RESOLVED (4058b34)

Client-side whole-payload transport: `src/core/api.js:62` now calls `tErr(data.code, data, data?.error)` — the payload itself is the vars bag, safe because `interpolate` (i18n.js:142-145) only replaces keys the message names. `modals.js:225` likewise passes the whole invite row. Pinned end-to-end: `alreadyMember ships its flat payload and renders in French without braces` (test line 116) and `inviteForOtherEmail carries its email in the payload` (line 158); the reserved-placeholder guard test (line 261) proves no `err.*` message interpolates `code`/`error`.

### CR-03 — Legacy prose divulged — RESOLVED (235523c)

`actExtraHtml` (task-list.js:259-266) returns `''` for any non-object extra. Seed legacy string extras (`'to Review'`, `'to Urgent'`, `'to Sarah Chen'`) converted to structured kinds (`seed.js:405-413`). The pinning test is un-skipped and passing (`a legacy string extra renders nothing — suppressed, never divulged`, activity-verbs.test.mjs:244).

### WR-01 — `createdProject` escapes Projects filter — RESOLVED (ff3ae40)

`ACT_CATEGORIES.projects` now includes `'createdProject'` (task-list.js:214); the pinned assertion updated with rationale (activity-verbs.test.mjs:202).

### WR-02 — `assignedTo` literal `{value}` — RESOLVED (ff3ae40)

`EXTRA_VARS.assignedTo` uses `e.value ?? ''` (task-list.js:222) and `actions.js:325` stores `mem(v)?.name ?? ''`; pinned by `an assignedTo extra without a value renders an empty value` (activity-verbs.test.mjs:249).

### WR-03 — `TRUST_PROXY` defaults true — RESOLVED (3278ff5)

Now strictly opt-in: `const TRUST_PROXY = process.env.TRUST_PROXY === 'true'` (server.js:67); `clientIp`/`proto`/`publicBase` gate every header read on it (server.js:1053, 1058, 1080, 1087). Two throttle regression tests added (error-codes.test.mjs:420, 443).

### WR-04 — Invite URLs host-poisoned — RESOLVED (c748af4)

Boot refuses when mail is enabled without `APP_URL`: `if (MAILER.enabled && !APP_URL) { … process.exit(1) }` (server.js:1928-1931), with the attacker-domain rationale printed to stderr.

### WR-05 — Socket destroyed before 413 — RESOLVED (13804a9)

`readJson` now drains the request after overflow and rejects at `end` (server.js:1179-1194); the 413 with `bodyTooLarge` is delivered — pinned by the full-413-response test.

### WR-06 — Signup TOCTOU — RESOLVED (13804a9)

`createUser` wraps the insert and maps UNIQUE-constraint errors to `httpError(409, …, 'accountExists')` (server.js:991-1001); pinned by `accountExists maps the signup race` (error-codes.test.mjs:407).

### WR-07 — Login CSRF — RESOLVED (ec0c945)

`sameOrigin` guard added to both `/api/auth/login` and `/api/auth/signup`, before body read and throttle (server.js:1223, 1268); pinned with a hostile-Origin 403 test plus a positive control (error-codes.test.mjs:470, 490).

### WR-08 — `MOD` frozen at module load — RESOLVED (c88b115)

Replaced by the lazy getter `modKey()` (utils.js:47); all six call sites updated (drawer, palette, popovers, modals, layout, inbox) and the `SHORTCUTS` table now stores the `'MOD'` sentinel, substituted at render (modals.js:246-291). Laziness pinned in test/i18n-locale.test.mjs:145.

### WR-09 — Skipped suppression test — RESOLVED (235523c)

Test un-skipped and green; see CR-03.

### IN-01 — One-directional parity test — RESOLVED (695e8c4)

Reverse parity (every catalogued `err.*` emitted or client-allowlisted, error-codes.test.mjs:249), reserved-placeholder guard (261), and nine real-server payload-shape/transport tests added.

### IN-02 — Duplicate escaper — RESOLVED (2ea5438)

`src/core/utils.js:15` re-exports `escHtml as esc` from i18n.js; one escaping table; pinned in i18n-locale.test.mjs:183.

### IN-03 — Bespoke `emailSendFailed` transport — RESOLVED (4058b34)

The row code/error transport is unchanged but the consumer now uses the whole-payload contract (`tErr(l.code, l, l.error || '')`, modals.js:225); the parity test asserts the row carries its code (error-codes.test.mjs:39).

### IN-04 — Weak `uid()` — RESOLVED (2ea5438)

`uid()` draws 6 bytes from `crypto.getRandomValues`, base36-padded to a deterministic 12 chars (utils.js:38-39); pinned in i18n-locale.test.mjs:169.

## New Findings (this re-review)

### IN-05: `readJson` drains oversized bodies without any cap

**File:** `server.js:1179-1187`
**Severity:** INFO (security/robustness, defense-in-depth)

On overflow the handler now drains the request until `end` — deliberately, so the 413 is deliverable (WR-05). But there is no cap on how much is drained and no explicit destroy: a client that keeps streaming after the limit is hit keeps the handler promise pending until Node's default `requestTimeout` (300s) eventually kills it. The `chunks` array stops growing, so memory is safe, but each oversized request pins a connection and an in-flight handler for up to the request timeout.

**Fix:** after the overflow marker, count drained bytes and call `req.destroy()` once a bounded amount (e.g. 2× `MAX_BODY`) has passed, after `res` has already been sent by the outer catch — or set an explicit short `req.setTimeout` on the overflow path.

### IN-06: Known-kind extras with malformed values render a literal catalogue key

**File:** `src/components/task-list.js:221-238` (`EXTRA_VARS` resolvers)
**Severity:** INFO

The unknown-kind gate returns `''`, but a *known* kind carrying a value that misses its catalogue sub-key (e.g. `{ kind: 'statusMoved', from: 'oops' }`, or a corrupted row with `from: undefined`) renders `tMsg('task.status.oops')` → `t()` returns the key itself on miss, so the feed shows the raw string `task.status.oops` (or `task.status.undefined`). Data is client-local so this cannot be attacker-controlled in the reviewed scope, but it is inconsistent with the suppression policy the same function enforces one branch earlier.

**Fix:** guard the resolvers, e.g. `vars: e => e.from && e.to && { from: tMsg('task.status.' + e.from), to: tMsg('task.status.' + e.to) }` with a falsy vars result falling through to `''`, or check `i18n.has('task.status.' + e.from)` before resolving.

## Verified Clean (notable, this pass)

- Whole-payload vars transport cannot leak control fields into messages: `interpolate` replaces only names present in the catalogue string, and the reserved-placeholder guard test enforces `code`/`error` never appear as placeholders in any `err.*` value in either locale.
- `uid()`'s byte→base36 mapping is correct: every byte value is < 36² so `padStart(2,'0')` yields exactly 12 deterministic chars.
- The `commands()` list in palette.js is rebuilt per render, so `modKey()` inside it re-evaluates on locale switch — no residual frozen-label path found in the six call sites.
- `esc` re-export keeps every importer path unchanged; no behaviour change in escaping tables (verified byte-identical replacement).
- `scripts/i18n-scan.mjs` runs clean (0 unresolved, 0 placeholder mismatches) and correctly excludes `src/data/seed.js` as demo content.
- The signup-race mapping rethrows non-UNIQUE SQL errors to the catch-all 500 per D-03 — no over-broad error masking.

## Next Steps

1. Phase unblocked: no critical or warning findings remain. IN-05/IN-06 can ride the next maintenance pass (or a quick task each).
2. Keep the new parity/throttle/CSRF tests in the regression gate — they are the contract that prevented the original blockers from re-shipping.

---

_Reviewed: 2026-10-24T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard (re-review)_
