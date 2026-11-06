---
phase: 44-per-member-timezones-v1-10
verified: 2026-11-06T12:00:00Z
status: human_needed
score: 14/15 must-haves verified
behavior_unverified: 1
overrides_applied: 0
covered_files:
  - tz.js
  - server.js
  - src/lib/timezones.js
  - src/pages/settings.js
  - src/actions/actions.js
  - src/actions/keyboard.js
  - scripts/gen-timezones.mjs
  - src/locales/en.json
  - src/locales/fr.json
  - test/tz-resolve.test.mjs
  - test/tz-dedup.test.mjs
  - test/settings-tz.test.mjs
  - test/settings-tz-combobox.test.mjs
covered_digest: "v2:sha256:445506a031429a125eb2c7540d6a3931851ee9bb31ca4208846f26ab3ba2feee"
behavior_unverified_items:
  - truth: "Settings > Date & time shows a searchable combobox over the full bundled IANA zone list (44-03 truth 1)"
    test: "Open Settings > Date & time in a browser as a member; type in the combobox; arrow/enter select a zone; reload and confirm the selection persisted"
    expected: "Combobox renders with live offset labels, filters as you type, keyboard selection saves via toast, and the choice survives reload from members[me].tz"
    why_human: "Live DOM rendering and interaction are pinned only by structural source-assertion tests; no browser test exercises the rendered combobox"
human_verification:
  - test: "Browser UAT of the tz combobox: open Settings > Date & time as a member, type to filter (e.g. 'tokyo'), select with mouse and again with arrow/enter, reload the page"
    expected: "Options show IANA id + city + live GMT offset; selection persists in the member profile after reload; Paris is preselected when no tz stored; a stored legacy label like '(GMT+08:00) Singapore' displays Singapore, not Paris"
    why_human: "Rendered combobox behavior, focus/caret behavior, and preselect display are DOM-level; only structural wiring assertions exist in test/"
  - test: "Confirm review warnings WR-01/WR-02 are acceptable as deferred hardening (optionally file follow-up)"
    expected: "Human decision to accept admin-path raw tz storage (WR-01, defense-in-depth) and alias/case preselect degradation (WR-02) or schedule a fix phase"
    why_human: "Both are accepted-risk judgments, not code defects blocking the goal"
---

# Phase 44: Per-Member Timezones Verification Report

**Phase Goal:** Each member's reminders and digest fire at their own 09:00 — multiple timezones supported, Paris as the default — replacing the single workspace-timezone model built on five hard-coded `TZ_BY_LABEL` labels.
**Verified:** 2026-11-06
**Status:** human_needed (1 present-but-behavior-unverified truth → browser UAT; 0 gaps)

## Requirement Traceability: TZ-01

**TZ-01 is NOT registered in REQUIREMENTS.md** (grep returns no match). This is consistent with the ROADMAP, which scopes Phase 44 as v1.10 work with the annotation "TZ-01 (to be added at milestone start — Kanzo task #14)". It is not orphaned (no later phase claims it) and not blocked: verification was contract-checked against the ROADMAP Phase 44 Success Criteria 1–5 and each plan's `must_haves`. Explicit note recorded here rather than failing the phase; TZ-01 should be registered in REQUIREMENTS.md at the next milestone boundary if traceability is desired.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Reminder/digest window resolves from the member's OWN stored tz through one resolveTz funnel — never a shared workspace tz | ✓ VERIFIED | `server.js:1423` (per-assignee: `resolveTz(members.find(…assignee)?.tz)`), `server.js:1533` (per-recipient); `(localDate, hour)` computed inside each loop, never hoisted; test/tz-dedup.test.mjs D-09 ordering test passes |
| 2 | Empty / unknown / hostile / non-string input deterministically resolves to Europe/Paris, never throws | ✓ VERIFIED | tz.js resolveTz — trim, TZ_BY_LABEL, Intl-in-try/catch validator, Paris fallback; 6 pins in test/tz-resolve.test.mjs all pass |
| 3 | All 6 legacy labels resolve to IANA zones; Phase 27/37/38 fixtures pass unmodified or deliberately re-pinned | ✓ VERIFIED | TZ_BY_LABEL (6 entries incl. client default '(GMT-07:00) Pacific Time') pinned by D-08 test; `test/due-reminders.test.mjs` 19/19 pass — the UTC-fallback test at ~line 380 was deliberately re-pinned to Paris with rationale comment |
| 4 | Changing a member's tz never re-fires a claimed reminder for the same localDate; a different localDate fires exactly one new claim | ✓ VERIFIED | test/tz-dedup.test.mjs D-11a/D-11b + reminder-variant tests pass; claim keys byte-identical to pre-phase shapes (`${ws.id}:${t.id}:${t.assignee}:${offset}:${due}`, `${ws.id}:${r.user_id}:digest:${localDate}`) |
| 5 | Two members with different tzs fire their own windows in one pass | ✓ VERIFIED | D-09 ordering test (Paris + LA assignees, no leakage, idempotent) passes |
| 6 | A member-role client saves THEIR OWN tz via doc PUT; it persists in members[me].tz | ✓ VERIFIED | server.js:1716–1720 self-tz carve-out applied after role gates for both paths; test/settings-tz.test.mjs member-save test passes |
| 7 | Member A can never write member B's tz (member-role payloads) | ✓ VERIFIED | non-admin path replaces members with storedMembers (`next.data.members = storedMembers`); self-only test passes. **Caveat (WR-01):** the ADMIN path still takes other members' tz verbatim from the incoming array — pre-existing admin member-management behavior, downstream-safe (all reads funnel through resolveTz), classified Warning not Blocker (see Review Findings) |
| 8 | Submitted tz validated server-side through resolveTz; hostile coerces to Paris; empty stores '' | ✓ VERIFIED | carve-out ternary + resolveTz; hostile/empty/legacy-label submit tests all pass |
| 9 | Admin merge pinning + non-admin replacement otherwise unchanged | ✓ VERIFIED | admin pinned-field test passes; carve-out applied only to the requester's own member |
| 10 | Settings > Date & time shows a searchable combobox over the full bundled IANA zone list | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wiring pinned structurally (data-in/data-a hooks, keyboard.js routing, A.tzSel alias) by passing tests; `tzCombobox()` renders from 418-zone static list with Paris present; live browser rendering/interaction not exercised by any test → Human Verification #1 |
| 11 | Option offsets computed live at render via Intl shortOffset — never cached/static | ✓ VERIFIED | `tzOffsetLabel()` constructs Intl.DateTimeFormat per call; test pins "no module-level cached offset map" |
| 12 | Zone list is a committed static array; no runtime `Intl.supportedValuesOf` under src/ | ✓ VERIFIED | src/lib/timezones.js (418 zones, generated header); grep shows supportedValuesOf only in scripts/gen-timezones.mjs; test pins it |
| 13 | Preselect chain: stored+resolvable → browser zone → Europe/Paris; nothing auto-saves; legacy labels display resolved zone | ✓ VERIFIED | `tzPreselect()` pure function tested (stored → resolveTz → list match → browser → Paris); `tzCombobox()` asserted save()-free; browser display aspect folded into Human Verification #1 |
| 14 | Choosing a zone writes the CURRENT member's tz in S.data.members and saves through the real doc PUT (never S.prefs) | ✓ VERIFIED | IN.tzSel handler: `m.tz = el.dataset.v; save();` — test asserts handler writes S.data.members, calls save(), never touches S.prefs; lands in 44-02 carve-out |
| 15 | New strings catalogued EN+FR; i18n:scan green; all interpolated labels esc()-escaped | ✓ VERIFIED | `npm run i18n:scan` → 0 literals/pending/unlisted/stale/unresolved; EN+FR parity + esc() pins in combobox test pass |

**Score:** 14/15 truths verified (1 present, behavior-unverified)

## Roadmap Success Criteria (Phase 44)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Per-member 09:00 window from THEIR timezone (Paris default); different-tz members fire at own local 09:00 | ✓ | Truths 1, 5 + tz-dedup suite |
| 2 | Arbitrary IANA zones accepted; unknown/empty → Paris deterministically, pinned by test | ✓ | Truth 2 (A2 aliases test, D-07 tests) |
| 3 | Exactly-once ledger keys correct under tz change; dedup semantics documented and tested | ✓ | Truth 4 (D-11 tests; key shapes byte-identical) |
| 4 | Settings > Date & time exposes picker with common IANA zones (Paris preselected); stored labels migrate/degrade without loss | ⚠️/✓ | Picker present + preselect chain tested (truths 10, 13); live-combobox aspect → Human Verification #1. Legacy labels degrade without loss via TZ_BY_LABEL (WR-02 affects only non-canonical aliases reachable via WR-01's admin path — Warning, not loss of legacy data) |
| 5 | Existing scheduler tests pass unmodified or deliberately re-pinned; full suite green | ✓ | due-reminders 19/19 (one deliberate re-pin with rationale comment); full suite 1030/1034 pass, 3 skipped, 1 fail = pre-existing `totp-rewrap` D-74 (EACCES on /tmp fixture dir; reproduces at pre-phase c5e7669 — not a phase regression) |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| localParts (tz.js) | resolveTz funnel | single choke point | ✓ WIRED | `localParts` calls `resolveTz(tzLabel)`; all resolution sites (scheduler ×2, save path ×1, preselect) route through it |
| IN.tzSel handler | S.data.members[me].tz → save() → PUT | docFromClient carve-out | ✓ WIRED | handler writes member profile and calls save(); carve-out re-validates via resolveTz (server.js:1720) |
| scripts/gen-timezones.mjs | src/lib/timezones.js | build-time generation | ✓ WIRED | committed 418-zone list generated by the script; client imports static array only |
| Combobox | keyboard.js ARIA/keyboard discipline | data-in="tzSel" routing | ✓ WIRED | ArrowUp/Down/Enter/Escape handled; structural test pins it |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| runReminderPass | assigneeTz / recipientTz | doc.data.members[*].tz via resolveTz | ✓ real doc store | ✓ FLOWING |
| tzCombobox | stored tz | me()?.tz (member profile) with prefs.tz degrade fallback | ✓ real | ✓ FLOWING |
| docFromClient carve-out | incomingSelfTz | request body, self-member only | ✓ validated write | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Funnel + dedup + save-path + combobox suites | `node --test test/tz-resolve.test.mjs test/tz-dedup.test.mjs test/settings-tz.test.mjs test/settings-tz-combobox.test.mjs` | 27/27 pass | ✓ PASS |
| Scheduler regression (re-pinned) | `node --test test/due-reminders.test.mjs` | 19/19 pass | ✓ PASS |
| Full suite | `npm test` | 1030 pass / 1 fail (pre-existing totp-rewrap D-74, reproduces at c5e7669) / 3 skip | ✓ PASS (no phase regression) |
| i18n | `npm run i18n:scan` | 0 issues | ✓ PASS |
| Static list importable | `node -e import src/lib/timezones.js` | 418 zones, Europe/Paris present | ✓ PASS |

## Review Findings Assessment (44-REVIEW: 0 Critical / 2 Warning / 5 Info)

- **WR-01 (admin path stores other members' tz raw, bypassing the funnel):** Does NOT block a must_have. Truth #7 is scoped to member-role payloads ("Member A can never write member B's tz… role-crafted payloads"), which is enforced; the admin branch's wholesale member merge is pre-existing behavior. All read paths funnel through resolveTz, so no exploitable path exists today — defense-in-depth. Recommend follow-up: funnel/strip tz for non-self members on the admin path + hostile admin-path test.
- **WR-02 (non-canonical alias/case stored tz shows Paris preselect):** Does NOT block. Legacy labels (the SC-4 "degrade without loss" target) map to canonical ids inside the funnel and are unaffected; the degradation only bites for alias/case variants reachable via WR-01. Recommend `resolvedOptions().timeZone` canonicalization in resolveTz as follow-up.
- Info findings (aria-activedescendant on empty list, null→Paris asymmetry, etc.): cosmetic/edge, none touch a must_have.

## Human Verification Required

### 1. Combobox browser UAT

**Test:** Open Settings > Date & time as a member; filter ("tokyo"), select via mouse and via arrow/enter; reload; verify persistence and preselect (Paris when unset; Singapore for stored legacy label '(GMT+08:00) Singapore').
**Expected:** Live offsets render, selection persists in the member profile, preselect chain displays as specified.
**Why human:** Rendered DOM behavior is pinned only structurally; no browser test exists.

### 2. Accept/defer WR-01 and WR-02 hardening

**Test:** Decide whether the two review warnings are accepted risks or a follow-up fix phase.
**Expected:** Explicit acceptance or scheduled follow-up.
**Why human:** Risk-acceptance judgment.

## Gaps Summary

None. All three plans' must_haves are verified in code (not just claimed): the resolveTz funnel is the single choke point, the scheduler resolves per-assignee/per-recipient inside the loops, dedup claim keys are byte-identical to pre-phase shapes, the save-path carve-out is self-only and funnel-validated, and the combobox writes the member profile through the real doc PUT. The full test suite is green modulo the documented pre-existing totp-rewrap failure. One truth (live combobox behavior) is present-but-behavior-unverified and routed to human verification; status is human_needed per the decision tree, not gaps_found.

---

_Verified: 2026-11-06T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
