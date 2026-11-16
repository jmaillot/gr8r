---
phase: 67-project-webhooks
reviewed: 2026-11-15T00:00:00Z
incremental_reviewed: 2026-11-16T12:30:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - server.js
  - db-adapter.mjs
  - webhook-ssrf.js
  - webhook-retry.js
  - webhook-formats.js
  - src/core/webhook-events.js
  - src/overlays/webhooks-settings.js
  - src/overlays/webhooks-labels.json
  - src/overlays/modals.js
  - src/actions/actions.js
  - src/main.js
  - src/locales/en.json
  - src/locales/fr.json
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 67: Code Review Report

**Reviewed:** 2026-11-15
**Depth:** standard
**Files Reviewed:** 13 (server.js, db-adapter.mjs, 3 root webhook modules, src/core/webhook-events.js, client overlays/locales, e2e — tests scanned for reliability)
**Status:** issues_found

## Summary

The delivery substrate is solid overall: guarded attempt claim, HMAC over the exact posted body, per-attempt SSRF re-check, `redirect:'error'` + 10 s timeout, show-once secret, role gating on all five routes, and esc() coverage in the renderer all check out against the threat register. However, the exactly-once claim has a real semantics hole — the dedup key has no occurrence component, so legitimate *repeat* events for the same subject (re-assignment, done→todo→done, project completion re-flip) are silently dropped for the 7-day retention window. Two SSRF hardening gaps (within-attempt DNS-rebinding TOCTOU; IPv4-mapped/non-canonical IPv6 bypass of the deny-list) remain despite the register claiming T-67-01 closed, and the D-13 oid persistence never fires for 2FA-enabled Entra accounts, silently degrading D-14 mentions.

## Critical Issues

### CR-01: Repeat real-world events for the same subject are permanently dropped (dedup_key has no occurrence component)

**File:** `server.js:2530-2539` (enqueueWebhookDelivery), with `src/core/webhook-events.js:129,135,143`
**Issue:** `dedup_key = ${hookId}:${event}:${subjectId}` and `subjectId` is the bare task/project id with no timestamp or occurrence discriminator. `INSERT OR IGNORE` therefore swallows any *later* legitimate occurrence of the same event on the same subject within the 7-day retention window:
- `task.assigned`: assign user B to a task previously assigned to A (any new assignment round on the same task) → same key `hook:task.assigned:<taskId>` → no-op, no delivery.
- `task.completed`: a task moved done → todo → done → the second completion is never delivered.
- `project.completed`: status flips back and forth → only the first flip ever fires.
The inline comment "exactly-once per real-world occurrence" is not honored — the key encodes subject, not occurrence. The reminder path got this right (`subjectId = ${t.id}:${offset}:${due}`); the doc-PUT path did not.
**Fix:** add an occurrence discriminator to the subjectId for the mutable-state events, e.g. stamp the diff-time `occurredAt` into the subject key:
```js
// webhook-events.js — for events whose trigger state can re-occur
events.push({ event: 'task.assigned', subjectId: `${t.id}:${occurredAt}`, ... });
events.push({ event: 'task.completed', subjectId: `${t.id}:${occurredAt}`, ... });
```
(Keep the same-save pitfall fix intact: the within-one-save dedup is already handled by emitting at most one assigned event per task per diff, not by the dedup key.)

## Warnings

### WR-01: SSRF guard is vulnerable to within-attempt DNS rebinding (TOCTOU between resolution and fetch)

**File:** `webhook-ssrf.js:46-59`, `server.js:2629-2641` (deliverWebhook)
**Issue:** `ssrfOk()` resolves the hostname and deny-lists the addresses, then `deliverWebhook` fetches `hook.url` directly — the fetch performs a *second* DNS resolution. An attacker-controlled authoritative DNS can answer the check with a public IP and the fetch with `127.0.0.1`/`169.254.169.254`. Re-resolving "every attempt" (the code comment and T-67-01 audit note) does not close the rebinding window *inside* a single attempt — the comment overstates the mitigation.
**Fix:** resolve first, then fetch by IP with SNI/Host preserved — e.g. use Node's `undici` custom `Agent` with a pinned `connect` address, or resolve in `ssrfOk`, pass the validated IP back, and fetch `https://<ip>` with `servername`/`Host` set to the original hostname. Alternatively run the fetch through a local proxy that enforces the same check at connect time. If neither is feasible short-term, document the residual window honestly in 67-SECURITY.md (T-67-01 disposition) instead of claiming it closed.

### WR-02: IPv4-mapped and non-canonical IPv6 addresses bypass the deny-list

**File:** `webhook-ssrf.js:20-33`
**Issue:** `deniedIp` handles IPv6 only via `/^(::1|f[cd]|fe[89ab])/i || ip === '::'`. Addresses such as `::ffff:10.0.0.1` (IPv4-mapped), `::ffff:169.254.169.254`, or fully-spelled `0:0:0:0:0:0:0:1` are valid IPv6 (`net.isIPv6` → true), match none of those patterns, and pass the guard. getaddrinfo can return mapped forms for AAAA records carrying them.
**Fix:** normalize before testing:
```js
function deniedIp(ip) {
  if (net.isIPv4(ip)) { /* existing IPv4 checks */ }
  // unwrap IPv4-mapped/translated IPv6, then canonicalize via a parsed view
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (m) return deniedIp(m[1]);
  const v6 = new URL(`http://[${ip}]`).hostname; // node normalizes lowercase canonical form
  if (v6 === '[::1]' || ip.replace(/^0+(?=:)/g, '') === '::1') return true;
  return /^(f[cd]|fe[89ab])/i.test(ip) || ip === '::' || ip === '::1';
}
```
plus explicit tests for `::ffff:127.0.0.1`, `::ffff:10.9.9.9`, and `0:0:0:0:0:0:0:1` in test/webhook-ssrf.test.mjs.

### WR-03: Hook-deleted dead-letter write can clobber a concurrent delivered status (unguarded UPDATE)

**File:** `server.js:2610-2614` (deliverWebhook, hook-missing branch)
**Issue:** `update webhook_deliveries set status = 'dead', last_error = ? where id = ?` has no `attempt`/`status` guard, unlike every other write-back. Race: pass B claims attempt 0→1 and is in-flight; the hook is then deleted; pass A (stale row, attempt 0) reaches the hook-missing branch and writes `status='dead'` unconditionally — after B commits `'delivered' where attempt = 1`, the row reads dead although the delivery succeeded (wrong D-06 badge, wrong audit).
**Fix:** guard the write like the others:
```js
await db.run("update webhook_deliveries set status = 'dead', last_error = ? where id = ? and status in ('pending','failed')", ['hook removed or disabled', d.id]);
```

### WR-04: users.oid is never persisted for 2FA-enabled Entra accounts — D-14 mentions silently degrade

**File:** `server.js:4985-4998` (Entra callback) and `server.js:5916-5990` (/api/auth/tfa/login)
**Issue:** The single oid write site sits *after* the `two_fa_enabled` early-return 302 (`server.js:4971-4979`), and the TOTP-completion route never writes oid. Every Entra user with TOTP enrolled — a common configuration — never persists `oid`, so D-14's real `<at>` mention permanently falls back to bold-name for exactly the users most likely to be assigned tasks. No error, no log: a silent feature gap.
**Fix:** persist the oid claim in the Entra callback *before* the 2FA branch (the claim is verified at that point), or capture it on the login challenge row and write it in `/api/auth/tfa/login`'s success tx alongside `last_login_at`.

## Info

### IN-01: truncateToCap truncates the first designated field, not the biggest

**File:** `webhook-formats.js:171-181`
**Issue:** D-02 says truncate "la partie la plus grosse"; `BIG_FIELDS.find(...)` shrinks fields in fixed order (`body`, then `taskTitle`, then `title`) rather than by size. Consequence is mild (a large title + small body truncates the body first, repeatedly).
**Fix:** `const field = BIG_FIELDS.filter(f => typeof out[f] === 'string' && out[f].length > MARKER.length).sort((a, b) => out[b].length - out[a].length)[0];`

### IN-02: events filter accepts duplicates

**File:** `server.js:2906-2913` (webhookValidateBody)
**Issue:** `events: ["task.created", "task.created"]` passes validation and is stored as-is; harmless (emit matches via `includes`) but dirty data in the mirror table and a redundant checkbox state after reload.
**Fix:** `fields.events = [...new Set(body.events)];`

### IN-03: unknown hook format renders a raw i18n key in the UI

**File:** `src/overlays/webhooks-settings.js:117`
**Issue:** `wt('format.' + (FORMATS.indexOf(h.format) + 1))` yields `format.0` when `h.format` is outside the three known values (e.g. a row written by a newer server), showing the literal string `format.0` to the user.
**Fix:** fall back: `const fk = FORMATS.includes(h.format) ? 'format.' + (FORMATS.indexOf(h.format) + 1) : 'format.1';`

### IN-04: send-test route can block the HTTP response up to ~10 s per call

**File:** `server.js:6308-6317`
**Issue:** The test route `await`s `deliverWebhook`, whose fetch can run the full 10 s `AbortSignal.timeout` (plus DNS). A manager can serially hold request handlers for ~10 s each. Manager-gated and bounded, so acceptable — noting for the record against T-67-04, which covers the doc-PUT path only.
**Fix (optional):** accept-and-poll (return the delivery id, let the UI poll the hook list) or lower the test-path timeout to ~3 s.

## Verified clean (no findings)

- **HMAC signing:** `sha256=<hex>` over the exact posted body string, raw-json included (`server.js:2652`, `webhook-formats.js:153-163`) — correct.
- **Role gating:** all five routes run `requireWorkspace → sameOrigin → 404 parity → canManageProject` (server.js:6186-6191, 6230-6238, 6269-6273); PATCH/DELETE/test scope the hook by (workspace_id, project_id). Member/viewer get 403.
- **Secret handling:** `webhookHookView` builds from named columns, no spread; secret rides only the POST create response; log sites print id + status + host only; renderer esc()s the secret and the host. Verified against every log line added in the range.
- **Claim machine:** guarded `attempt = attempt + 1 where attempt = ? and status in ('pending','failed')` before fetch; `delivered` written only after 2xx; Retry-After only on 429/5xx; D-05 table matches the spec (1 min→5 min→30 min→2 h→8 h, dead at 5).
- **28 KB cap:** measured with `Buffer.byteLength` (UTF-8 bytes) on the full formatted body; re-measured after each halve; exactly-28672 untruncated; code-unit slicing is JSON-safe (lone surrogates are escaped, never invalid UTF-8).
- **XSS:** every dynamic value in `webhooks-settings.js` passes `esc()` (`hostOf(h.url)` :116, `form.url` :147, secret :130); ids/events/formats come from server-validated enums; `wt()` output is catalogue-controlled.
- **users.oid exposure:** `userPayload` (server.js:867) is a field whitelist without oid; no route in the diff serializes it.
- **D-07 purge:** 7-day delete piggybacks the 30 s tick, count-only logging.
- **pg parity:** `PG_CONFLICT_TARGETS webhook_deliveries '(dedup_key)'` and both epoch columns added to `PG_EPOCH_COLUMNS`; ctx column ensured additively in both dialects.

---

_Reviewed: 2026-11-15_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

---

# Incremental Review — post-67-05 (gap closure G-67-2) — 2026-11-16

**Diff base:** `5e357fa..c7a27ca` — single commit `c7a27ca`, one line changed in `server.js`.
**Scope:** plan 67-05 only; Phase 68 files (db-adapter.mjs, src/views/table.js, responsive.css, e2e/mobile-*.spec.mjs) were reviewed in 68-REVIEW.md and are out of scope. Prior findings CR-01 / WR-01..WR-04 / IN-01..IN-04 above are **not re-reported** and remain open as filed.

```yaml
incremental:
  files_reviewed_list:
    - server.js
  findings:
    critical: 0
    warning: 0
    info: 0
    total: 0
  status: clean
```

## Incremental Findings

None. The pass is **clean** (0 critical / 0 warning / 0 info).

### What was verified

- **The change itself (`server.js:6505`):** `sampleCtx.body` now reads `This is a test payload sent from Projects Studio.` — exactly the G-67-2 gap closure, no side effects. `sampleCtx` is a fixed sample envelope for the test-send endpoint (`POST …/webhooks/:id/test`, ~server.js:6460-6540); the string only flows into the formatted payload body via `webhook-formats.js` (`formatTeamsAdaptive` / `formatSlack`), is JSON-serialized and HMAC-signed like any real body — a text swap cannot break signing, field whitelisting, or the 28 KB cap (81-byte sample, orders of magnitude under the cap).
- **No other legacy-name occurrences in the payload path:** `grep -i "gr8r"` across `server.js` (excluding `x-gr8r-*` headers), `webhook-formats.js`, `webhooks-labels.json`, `en.json`, `fr.json` → zero user-visible matches. The only remaining occurrences are the wire-contract header `x-gr8r-signature` (server.js:2828, plus the test-harness read at 3020) — intentionally unchanged, correct per the 67-05 diagnosis (header naming is a protocol identifier, renaming it would silently break consumers that verify signatures).
- **No test pins the payload text:** `grep -rn "sent from gr8r|sent from Projects Studio" server.js test/` → exactly one match, the changed line itself. The 67-05 claim (23/23 webhook suites green, no pinned string) is consistent with the repo state.
- **Surrounding handler re-checked:** the test-send endpoint is unchanged apart from the string — role gating (`canManageProject`), hook scoping by `(workspace_id, project_id)`, 409 on inactive hook, `WEBHOOK_EVENTS` whitelist on `body.event`, per-call nonce `test-${uid()}` exempting the test from subject dedup, post-enqueue delivery lookup, and the `WEBHOOK_TEST_TOKEN`-gated fetch/lookup/now test hooks (`tokenOk` guards at server.js:6527-6529) all intact. No regression surface introduced by the one-line swap.

_Reviewed: 2026-11-16 (incremental pass, post-67-05)_
_Reviewer: the agent (gsd-code-reviewer)_
