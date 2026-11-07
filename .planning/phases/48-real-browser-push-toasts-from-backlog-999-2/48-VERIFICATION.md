---
phase: 48-real-browser-push-toasts-from-backlog-999-2
verified: 2026-11-07T16:55:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - public/sw.js
  - src/core/push.js
  - src/main.js
  - src/pages/settings.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/browser-push.test.mjs
  - test/i18n-core-features.test.mjs
  - test/unsubscribe-route.test.mjs
  - .planning/phases/48-real-browser-push-toasts-from-backlog-999-2/48-01-PLAN.md
  - .planning/phases/48-real-browser-push-toasts-from-backlog-999-2/48-02-PLAN.md
  - .planning/phases/48-real-browser-push-toasts-from-backlog-999-2/48-01-SUMMARY.md
  - .planning/phases/48-real-browser-push-toasts-from-backlog-999-2/48-02-SUMMARY.md

covered_digest: "v2:sha256:17387bcc9d80df1cf7306e8c766b511c44178604379119081f80f0d10a8321e7"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  note: "Re-run triggered by a stale covered_digest (algorithm artifact, #4682) — no covered file changed since the prior verification (last impl commit 4ff18f0, 2026-11-07T14:20:24+01:00, predates the 16:20Z prior stamp; git-verified). The new digest uses the current v2:sha256: scheme, which is why it differs from the prior v2:39fb… hash. All conclusions were independently re-checked against the live codebase, not carried over."
human_verification:
  - test: "Real permission flow: open Settings → Notifications, toggle a push_* pref ON, accept the browser permission prompt, hide the tab, trigger a mention from another user, confirm the OS notification appears and clicking it focuses/navigates to the task"
    expected: "Browser prompt appears inside the click gesture; hidden tab yields exactly one OS notification per event; click focuses the existing tab or opens the same-origin deep link"
    why_human: "Browser Notification/permission APIs cannot run under node:test stubs; requires a real browser and a second user"
  - test: "Blocked-permission UX: block notifications for the origin in browser settings, reload, open Settings → Notifications, then re-allow and wait one poll tick"
    expected: "Each push_* row shows the derived 'Browser blocked'/'Navigateur bloqué' badge; the one-time explanatory toast fires exactly once on a denied toggle; the badge clears on the next poll render without a reload"
    why_human: "Requires a real browser permission-denied state and live Notification.permission reads that stubs cannot reproduce"
---

# Phase 48: Real browser push toasts from backlog 999.2 — Verification Report

**Phase Goal:** Real browser notifications replace the inert push_* toggles, and toast feedback lands for mention/assign events.
**Verified:** 2026-11-07T16:55:00Z
**Status:** human_needed (all must-haves re-verified; two live-browser flows remain manual-only)
**Re-verification:** Yes — digest regenerated after the #4682 stale gate; full goal-backward re-check performed (prior conclusions not trusted, re-derived from code and test runs)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | New unseen mention/assign/comment row, gated by its push_* pref, produces exactly ONE feedback — browser Notification (via SW) when `document.hidden`, in-app toast when visible — never both (D-48-2) | ✓ VERIFIED | `src/core/push.js:115-123`: visible → `showToast(line)` (117) and `continue`; hidden → permission check (120) then `reg.showNotification()` (123) with constructor fallback (124). Branches are mutually exclusive. Behavioral tests pass: "a hidden-tab mention yields exactly ONE showNotification…", "a visible-tab mention fires the toast seam once and never showNotification" (`node --test test/browser-push.test.mjs`: 17/17 pass, re-run this verification) |
| 2 | Seen rows, read rows, and update/reminder rows never notify; push-pref=false swallows rows; session prime is silent | ✓ VERIFIED | `deriveCandidates` (push.js:68-74) filters `n.read || seen.includes(n.id)` and requires a mapped type with a truthy pref; `_primed` block (99-104) seeds the seen-set and returns silently on first call; `markSeen` before dispatch (109). Passing tests: "a second notifyNewEvents call re-notifies nothing", "a push_assign=false gate swallows…", "update and due_reminder rows never dispatch", "a read row never dispatches", "the first notifyNewEvents call of a session primes…" — all green in the 17/17 run |
| 3 | sw.js registered from main.js at absolute scope `/sw.js`, contains `notificationclick` and NO fetch/install/activate handler or imports | ✓ VERIFIED | Read `public/sw.js` in full (23 lines): single `notificationclick` listener, zero imports, zero fetch/install/activate handlers, zero strings. `src/main.js:108` `navigator.serviceWorker.register('/sw.js')` behind `'serviceWorker' in navigator && api.enabled`, load-gated, `.catch(() => {})`. Structural absence assertions in the passing harness |
| 4 | "Coming soon" badge removed; push_* toggles persist via the EXISTING single-branch `IN.npToggle` path (D-48-3) | ✓ VERIFIED | `grep -r pushComingSoon src/ test/` → only the i18n catalogue-pin changelog comment (test/i18n-core-features.test.mjs:216/218); zero occurrences in src/. settings.js:505-514 renders the three push_* rows with only the derived badge. `IN.npToggle` (actions.js:2781+) prepends the permission pre-step then falls through to the unchanged persistence body. Catalogue pin at 1710 asserted by the passing i18n test (14/14); `test/unsubscribe-route.test.mjs:365` asserts the badge string is gone (15/15 pass) |
| 5 | Toggle-ON with permission `default` calls `requestPermission()` inside the user gesture; denied → pref still saves + one-time explanatory toast; denied badge is derived per render and clears without reload (D-48-4) | ✓ VERIFIED | actions.js:2782-2792: pre-step gates on `el.checked && dataset.k.startsWith('push_') && permission==='default'`; every outcome falls through to `S.notifPrefs[el.dataset.k] = el.checked` + persistence. `blockedToastOnce()` module-scoped one-shot (push.js:38-43). settings.js:507 reads `window.Notification.permission` fresh per render (never stored). `permChanged` memo wired into the poll re-render condition (main.js:91). Passing tests: requestPermission-fires-once-and-pref-persists, blocked-toast-once-across-two-toggles, permChanged-fires-on-denied→granted-flip, main.js-wires-the-memo — all in the 17/17 run |
| 6 | Zero new runtime dependencies (D-12) — SW + Notification API are browser built-ins | ✓ VERIFIED | `node --test test/dependencies.test.mjs` green (2/2, re-run); `git status` clean for package.json, Dockerfile, and test/dependencies.test.mjs; sw.js imports nothing; push.js imports only pre-existing project modules (store/api/i18n/toast) |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `public/sw.js` | Minimal notificationclick router | ✓ VERIFIED | 23 lines re-read in full; single handler; zero imports/strings; no fetch/install/activate |
| `src/core/push.js` | Dispatch core: notifyNewEvents, seen-set, deriveCandidates, toast-vs-notification branch | ✓ VERIFIED | 129 lines, substantive; exports test seams (showToast/deriveCandidates/buildNotifUrl/permChanged); all logic real |
| `src/core/push.js` wiring | Poll hook in main.js | ✓ VERIFIED | Imported (main.js:64) and called at main.js:98 after successful hydration, behind poll guards |
| `src/pages/settings.js` | Derived blocked badge swap | ✓ VERIFIED | Lines 505-514; fresh permission read per render; `.badge.red` reuse (no new CSS) |
| `src/actions/actions.js` | requestPermission pre-step in npToggle | ✓ VERIFIED | Lines 2782-2792 prepended; persistence body unchanged below |
| `test/browser-push.test.mjs` | Behavioral harness | ✓ VERIFIED | 17 tests, all passing (re-run this verification: 17 pass / 0 fail) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| src/main.js poll | src/core/push.js notifyNewEvents() | one dispatch site inside pollNotifs, after hydrateFromServer success, behind poll guards | ✓ WIRED | main.js:98; never a parallel fetch channel |
| src/core/push.js | myNotifs() from store.js | import (push.js:13) | ✓ WIRED | No raw `D().notifs` filtering anywhere in push.js |
| src/core/push.js | registration.showNotification(title, options) | hidden branch (push.js:122-123) | ✓ WIRED | body/tag/icon + `data.url` present; sw.js holds zero strings and zero imports |
| src/core/push.js toast branch | toast() from src/ui/toast.js | exported live binding (push.js:30-33) | ✓ WIRED | Plain composed string; toast.js esc()s |
| src/pages/settings.js | fresh Notification.permission per render | derived `blocked` const (settings.js:507) | ✓ WIRED | Never stored; clears on next poll re-render via permChanged memo (main.js:91) |
| IN.npToggle | Notification.requestPermission() | prepended pre-step (actions.js:2789) | ✓ WIRED | All outcomes fall through to unchanged persistence |
| src/main.js | service worker registration | absolute `/sw.js` (main.js:108) | ✓ WIRED | Failure silently ignored; poll+email remain the delivery guarantee |
| Build/deploy chain | dist/sw.js served no-cache | vite publicDir copy + server.js | ✓ WIRED | Prior verification confirmed `dist/sw.js` identical to `public/sw.js`; Dockerfile COPYs dist/ (unchanged since — git status clean) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| push.js candidates | `myNotifs()` + `S.notifPrefs` | server-hydrated store (30s poll) | Yes | ✓ FLOWING |
| Notification title/body | `t('toast.push*', {name, title})` | i18n catalogue + task store (mem/task) | Yes | ✓ FLOWING |
| sw.js click URL | `e.notification.data?.url` | `buildNotifUrl(n)` — live ws slug + task key | Yes | ✓ FLOWING |
| Blocked badge | `Notification.permission` | live browser API read per render | Yes | ✓ FLOWING |

No static/hardcoded data paths found.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Push slice harness | `node --test test/browser-push.test.mjs` | 17 pass / 0 fail | ✓ PASS |
| i18n catalogue pin (1710, EN+FR parity) | `node --test test/i18n-core-features.test.mjs` | 14 pass / 0 fail | ✓ PASS |
| Coming-soon removal regression | `node --test test/unsubscribe-route.test.mjs` | 15 pass / 0 fail | ✓ PASS |
| D-12 dependency gate | `node --test test/dependencies.test.mjs` | 2 pass / 0 fail | ✓ PASS |

All four commands re-run during this verification (2026-11-07). i18n keys spot-checked directly: `toast.pushMention`, `toast.pushBrowserBlocked`, `settings.notif.pushBrowserBlocked` present in BOTH `src/locales/en.json` and `src/locales/fr.json` (3 matches each).

### Probe Execution

None declared (no scripts/*/tests/probe-*.sh for this phase; not a migration/tooling phase). The VALIDATION.md per-task map is fully covered by the automated tests above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| PUSH-01 | 48-01, 48-02 | Three inert push toggles gain real behavior: minimal SW + Notification API from the existing poll cycle; "coming soon" badge removed | ✓ SATISFIED | Truths 3, 4, 6 |
| PUSH-02 | 48-01 | Foreground tab → toast; background tab → SW notification; never both, never already-seen, gated by each push_* pref (D-48-2) | ✓ SATISFIED | Truths 1, 2 |
| PUSH-03 | 48-02 | Denied permission: toggle still persists, "browser blocked" badge + explanatory toast, badge clears when permission returns (D-48-4); zero schema migration (D-48-3) | ✓ SATISFIED | Truth 5 |

No orphaned requirements: REQUIREMENTS.md maps PUSH-01..03 to Phase 48 and all three are claimed across the two plans; traceability line 106 shows all complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER/coming-soon markers in any phase-modified file (grep re-run: clean) | — | Clean |

### Review Findings Awareness (from 48-REVIEW.md — recorded, not phase gaps)

Surfaced by the phase code review and deliberately left open (48-REVIEW-DISPOSITION.md). Judged against the phase's success criteria, neither invalidates a must-have truth; both are recorded for human awareness and follow-up:

- **CR-01 (sw.js same-origin guard)** — `new URL(data?.url || '/', origin)` at public/sw.js:11 does not reject absolute cross-origin URLs. No live exploit path: the only producer (`buildNotifUrl`, push.js:78-82) emits relative `/w/…` paths from internal data. Recommend a follow-up enforcing `u.origin === self.location.origin` so the T-48-03 claim is structural, not producer-trust. If accepted as a deliberate deviation, an override may be added to this file.
- **WR-01 (workspace-switch re-prime storm)** — `_primed` is a session-wide boolean while the seen-set is keyed per user+workspace; an SPA workspace switch to a workspace with unread rows could fire a backlog burst (a path the must-haves did not name — they say "login"). Login prime is tested and holds. Recommend a follow-up re-priming on `seenKey(wsId, userId)` change.
- IN-01 (fallback notification inert click — plan-pinned), IN-02 (200-id seen-set truncation edge), IN-03 (no `.catch` on the fire-and-forget poll call; all internal awaits guarded) — informational.
- Pre-existing totp-rewrap D-74 EACCES environmental test failure (STATE.md Deferred Items) predates this phase — not a phase gap.

### Human Verification Required

### 1. Real permission flow end-to-end (PUSH-01)

**Test:** Open Settings → Notifications → toggle a push_* pref ON; accept the browser prompt; hide the tab; trigger a mention from another user; confirm the OS notification and click-through navigation.
**Expected:** One prompt inside the click gesture; exactly one OS notification per event; click focuses/navigates to the same-origin deep link.
**Why human:** Real Notification/permission APIs cannot execute under node:test stubs; recorded as manual-only in 48-VALIDATION.md.

### 2. Blocked-permission UX (PUSH-03, D-48-4)

**Test:** Block notifications for the origin in browser settings, reload, open Settings → Notifications; toggle a pref (observe the one-time explanatory toast); re-allow permission and wait one poll tick.
**Expected:** Derived "Browser blocked" badge on all three push_* rows; toast fires exactly once; badge clears on the next poll render without reload.
**Why human:** Requires a real browser permission-denied state and live `Notification.permission` reads.

### Gaps Summary

No gaps. All six must-have truths re-verified directly against the live codebase (full file reads of sw.js and push.js, wiring greps in main.js/settings.js/actions.js, fresh test runs: 17+14+15+2 all green, i18n keys confirmed in EN and FR, dependency files untouched in git). The two live-browser flows cannot be exercised programmatically and are routed to human verification per the plan's own manual-only table.

---

_Verified: 2026-11-07T16:55:00Z_
_Verifier: the agent (gsd-verifier)_
