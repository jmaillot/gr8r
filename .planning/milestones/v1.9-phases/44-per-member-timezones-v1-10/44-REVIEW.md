---
phase: 44-per-member-timezones-v1-10
reviewed: 2026-11-06T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - tz.js
  - server.js
  - scripts/gen-timezones.mjs
  - src/lib/timezones.js
  - src/pages/settings.js
  - src/actions/actions.js
  - src/actions/keyboard.js
  - src/locales/en.json
  - src/locales/fr.json
  - scripts/i18n-scan.mjs
  - test/tz-resolve.test.mjs
  - test/tz-dedup.test.mjs
  - test/due-reminders.test.mjs
  - test/settings-tz.test.mjs
  - test/settings-tz-combobox.test.mjs
  - test/i18n-scan.test.mjs
  - src/pages/members.js
  - src/core/store.js
  - src/shell/render.js
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 44: Code Review Report

**Reviewed:** 2026-11-06
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Reviewed the per-member timezone implementation end to end: the `resolveTz` funnel (tz.js), both scheduler loops in `runReminderPass`, the `docFromClient` self-tz carve-out, the combobox UI/save path, the generator, locales, and all six test files.

The core mechanics are sound: the funnel never throws and deterministically falls back to Europe/Paris; `(localDate, hour)` is computed per assignee/recipient inside both loops (never hoisted); claim keys are byte-identical shapes (`ws:id:offset:due` for reminders, `ws:user:digest:localDate` for digests); the carve-out is genuinely self-only (`'tz' in m` own-key check against `membership.member_id`) and single-field; every interpolated zone id/name/offset in the combobox passes through `esc()`, and the members-table tz cell is `esc()`'d (members.js:176 verified). Dedup-under-tz-change semantics are pinned by four real-server tests.

No Critical findings. Two Warnings: the admin doc-PUT path still stores **other** members' tz verbatim (bypassing the D-10 funnel), and `resolveTz`'s non-canonical success values (aliases, case variants) cause the combobox preselect to silently display and re-save Paris for a valid stored tz. Five Info findings.

## Critical Issues

None.

## Warnings

### WR-01: Admin doc-PUT path stores other members' tz raw, bypassing the D-10 funnel

**File:** `server.js:1699-1705` (admin branch of `docFromClient`); test gap at `test/settings-tz.test.mjs:168-184`
**Issue:** The Phase 44 carve-out validates only the **requester's own** tz (server.js:1718-1720). On the admin path, incoming members pass through as `{ ...m, id: prev.id, userId, email, role, status }` — every other property, including `tz`, is taken verbatim from the untrusted incoming array (and doc-only members without `userId` pass through wholly as `return m`). An admin can therefore store an arbitrary/hostile string (e.g. `<img src=x onerror=…>`, a 10 KB blob) in **any** member's `tz`, contradicting D-10's locked invariant "never arbitrary strings stored in the doc" and the "never stored raw" comment at server.js:1717. Downstream reads are currently safe (scheduler funnels through `resolveTz`; members.js:176 and the combobox escape/funnel), so this is defense-in-depth, not an exploitable XSS today — but the invariant the phase pins ("the funnel is the only validator") is broken on the write side for everyone except self. The regression suite only exercises a *valid* value (`Asia/Tokyo`) on the admin path, so the hole is untested and undetected.
**Fix:** Funnel every incoming member's tz on the admin path (e.g. in the `.map()`: `tz: m.tz === undefined ? prev.tz : resolveTz(m.tz)`, and `resolveTz` on doc-only members), or strip `tz` from all non-self incoming members so only the carve-out can write it. Add a hostile-value admin-path case to `test/settings-tz.test.mjs`.

### WR-02: Valid but non-canonical stored tz silently rewrites to Europe/Paris via the preselect

**File:** `src/pages/settings.js:159-172` (`tzPreselect`), with `tz.js:25-37` (`resolveTz` returns raw input, not the canonical id)
**Issue:** `resolveTz` returns the **trimmed input as-is** on successful Intl validation — aliases (`US/Pacific` → `US/Pacific`, not `America/Los_Angeles`) and case variants (`europe/paris`) are accepted, per the A2 alias policy pinned in test/tz-resolve.test.mjs:46. But `tzPreselect` only accepts the result if it exactly matches a canonical id in `TIMEZONES` (settings.js:163); aliases and case variants are not in the supportedValuesOf-derived list. Result: a member with a perfectly valid stored tz (reachable via WR-01's admin path, or legacy client-default writes) has the scheduler firing in `US/Pacific` while the picker shows **Europe/Paris preselected** — and one careless save persists Paris over a working value. That violates SC-4's "degrade without loss" intent: the degradation loses the actual zone. (Stored legacy labels `(GMT±xx)` are unaffected — they map to canonical ids inside the funnel.)
**Fix:** In `resolveTz`, return the Intl-canonicalized id instead of the raw input (`new Intl.DateTimeFormat('en-CA', { timeZone: v }).resolvedOptions().timeZone`), so aliases collapse to their canonical IANA id before both the list match and the stored value. Alternatively, in `tzPreselect`, fall back to displaying the resolved zone from a canonicalization pass rather than Paris when `resolveTz(s)` validates but misses the list.

## Info

### IN-01: Dangling `aria-activedescendant` when the filtered list is empty

**File:** `src/pages/settings.js:186-195`
**Issue:** The input always sets `aria-activedescendant="tz-opt-${pk.hl}"`, but when `tzFilter` returns zero rows the listbox renders only a `noResults` hint div with no `role="option"` elements — the ARIA reference points at a nonexistent node.
**Fix:** Omit `aria-activedescendant` (or set it to `""`) when `list.length === 0`.

### IN-02: `tz: null` submit overwrites a stored tz with 'Europe/Paris'

**File:** `server.js:1718-1720`
**Issue:** `'tz' in m` is true for `{ tz: null }`, and the carve-out's ternary only special-cases empty **strings**; `null` falls into `resolveTz(null)` → `'Europe/Paris'` is persisted. This is asymmetric with the documented empty-submit semantics ('' stores '', "clearing a tz is allowed") — a client sending `null` (a natural "no value" encoding) gets a hard Paris write instead of either a clear or a no-op. Untested edge.
**Fix:** Treat non-string values the same as absence (skip the write), or document the null→Paris coercion in the D-10 comment and pin it in the test.

### IN-03: Digest claim is committed even when MAILER is disabled — permanently consumed

**File:** `server.js:1571-1586`
**Issue:** The digest claim row is inserted in the transaction, then the send is gated on `if (MAILER.enabled)`. With MAILER disabled the claim is still consumed, so once the mailer is enabled the digest for that (user, localDate) never delivers (exactly-once blocks the retry). Pre-existing pattern the phase's loop refactor preserved, but the phase now sits adjacent to it and the D-11/D-12 comment at the claim key documents exactly-once without noting this caveat.
**Fix (when in scope):** Skip the claim (or the whole loop body) when `!MAILER.enabled`, mirroring the reminder loop's pre-existing behavior check.

### IN-04: Combobox display falls back to the disconnected legacy `S.prefs.tz`

**File:** `src/pages/settings.js:177`
**Issue:** `const stored = me()?.tz || S.prefs.tz || ''` reads the legacy blob pref for display. D-09 declares `prefs.tz` disconnected/inert, so a member with an empty profile tz but a stale pref sees the old pref preselected as if it were their active zone — a value the scheduler never reads. The comment acknowledges the degrade-without-loss intent, but showing an inactive value as the selection can mislead a user into believing it is in effect.
**Fix:** Preselect from `me()?.tz` only (empty → browser zone → Paris), and at most show the stale pref as a one-line hint rather than the selection.

### IN-05: Success toast fires optimistically before the doc PUT resolves

**File:** `src/actions/actions.js:2763-2772`
**Issue:** `IN.tzSel` shows `toast(t('toast.prefSaved'))` synchronously after `save()`, but `save()` is debounced (store.js:195-209) and the actual `push()` may fail (network, 409 conflict). The user is told the tz was saved even when the PUT never landed; the local `S.data.members[me].tz` mutation is optimistic and may later be reverted by `applyDoc`. Contrast the adjacent `langSel` handler, which surfaces failure toasts explicitly.
**Fix:** Drop the immediate success toast (the global save/conflict error path already reports failures) or move it into the push-resolution path.

---

_Reviewed: 2026-11-06_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
