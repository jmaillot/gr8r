---
phase: 51-client-surfaces-permissions-page-removal-project-creation
plan: 03
subsystem: client-surfaces
tags: [permissions-teardown, permCreate, settings-router, i18n-gate, dead-keys]
requires: [51-01 server-side permCreate enforcement, 51-02 `=== true` restriction read]
provides: [Permissions-page-free settings router with first-tab deep-link fallback, permCreate row in Workspace > General, dead-key detector gating i18n:scan/prebuild, removed-key leak assertions]
affects: [Phase 52 transparency, future catalogue cleanups (the sweep is now automatic)]
tech-stack:
  added: []
  patterns: [shape-based key-reference collection (full literals + composed prefixes), prefix allow-list for interpolated key families, frozen catalogue-count pins bumped with per-change comments]
key-files:
  created: []
  modified:
    - src/pages/settings.js
    - src/pages/members.js
    - scripts/i18n-scan.mjs
    - src/locales/en.json
    - src/locales/fr.json
    - test/i18n-scan.test.mjs
    - test/catalogue.test.mjs
    - test/i18n-pages.test.mjs
    - test/i18n-toast.test.mjs
    - test/i18n-modal.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-core-features.test.mjs
key-decisions:
  - "permCreate relocated with the toggle polarity ALIGNED to the 51-02 follow-up: tog('permCreate', P.permCreate === true) — the plan's verbatim !== false would have contradicted the phase-wide restriction read the create gating uses"
  - "The dead-key reference collector is SHAPE-BASED and permissive: every catalogue-key-shaped literal (full or dotted-prefix) in src/ + server.js + mailer.js counts as a reference — a missed reference is acceptable, a false positive on a live key (SET_NAV/ACCENT_TIPS value-held keys, tMsg aliases) is not"
  - "The 17 orphaned keys the new detector exposed were deleted (catalogue 1718 → 1701) rather than allow-listed — act.inviteTeam from 51-02 was wired as a11y.inviteTeam, the rest predate this phase; the three t()-mechanics fixtures (greeting.hello, task.count, file.count) are allow-listed as test-suite references, same category as contract.*"
requirements-completed: [CRT-02, UX-01]
duration: 32 min
completed: 2026-11-08T12:26:00Z
commits: 3
plan_head_before: 52f92a7f6e4673edf4f67b0d8f3c886c0670595e
plan_head_after: 3f2f8f8584b456f8ad0e3a311fd956ca5c5b3c6f
estimate:
  tokens: 60000
actuals:
  tokens: 4200
  tasks: 3
  commits: 3
status: complete
---

# Phase 51 Plan 03: Permissions-page teardown, permCreate relocation & dead-key gate Summary

**One-liner:** The Settings > Permissions page is gone end-to-end (nav entry, case body, permGuests/permPublic toggles, 6 catalogue keys EN+FR) with permCreate relocated to Workspace > General under the phase-wide `=== true` polarity, unknown `?sec=` deep-links fall back to the first tab, and the i18n gate gains a dead-key detector — shape-based reference collection over src/ + server surfaces, gated into `i18n:scan`/`prebuild` — whose first sweep deleted 17 more orphaned keys (catalogue 1718 → 1701); full suite 1130 pass / 0 fail / 11 documented skips.

## Accomplishments

- **Task 1 (CRT-02, D-51-10..13):** Deleted the `['permissions', …, 'shield']` SET_NAV entry and the whole `case 'permissions'` body — permGuests and permPublic die outright, no relocation. permCreate's srow moved VERBATIM into `case 'workspace'` reusing `settings.perms.create` and the unchanged `IN.prefToggle` persistence (actions.js:2765-2768) — with the polarity aligned to `=== true` per 51-02's recorded follow-up. Deep-link audit (Pitfall 5): the only `?sec=` consumers are SET_NAV-driven clicks plus two hardcoded `data-sec` popovers (workspace/profile) — no `data-sec="permissions"` anywhere; `pageSettings()` now validates the section against SET_NAV and falls back to the first tab, so a stale `?sec=permissions` URL renders Workspace instead of the 404 body (T-51-08). permsTable stays on the Members page (members.js Roles tab, now carrying the `settings.perms.roleTable` heading); the unused import is gone from settings.js. 6 keys deleted from BOTH catalogues; `settings.perms.create`/`roleTable` survive.
- **Task 2 (UX-01 criterion 5, TDD):** RED first — 6 detector cells in test/i18n-scan.test.mjs + the removed-key leak assertions in test/catalogue.test.mjs. GREEN — `findDeadKeys`/`collectReferencedKeys`/`DEAD_KEY_ALLOWLIST` in scripts/i18n-scan.mjs: every catalogue-key-shaped string literal (full key, or dotted prefix including template heads like ``t(`toast.push${…}`)``) in src/ + server.js + mailer.js is a reference; keys referenced nowhere fail the same exit-code contract as the other families, so `npm run i18n:scan` and `prebuild` gate on them. Allow-list: `project.template.*`, `common.perm.*`, `contract.*`, plus the three t()-mechanics fixtures. The detector's first sweep over the live tree exposed 17 MORE orphaned keys (including 51-02's unwired `act.inviteTeam`) — deleted from both catalogues, test enumerations pruned, count pin 1718 → 1701 with a per-change comment.
- **Task 3 (integration):** `npm run i18n:scan` green (0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 mismatch, **0 dead**), `node --test test/catalogue.test.mjs` green including the removed-key assertions, full `npm test` green — 1141 tests, 1130 pass, 0 fail, 11 skips (the documented pre-existing baseline; 51-02 baseline was 1123 pass + 7 new/adjusted cells here). No settings-rendering repairs needed beyond the first-tab fallback shipped in Task 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] permCreate toggle polarity aligned to `=== true`**
- **Found during:** Task 1
- **Issue:** the plan's verbatim relocation carried the legacy `P.permCreate !== false` read, which 51-02's SUMMARY explicitly gates against (the phase-wide restriction read is `=== true` — an undefined pref would render the toggle ON under `!== false` while the create gating treats it as OFF).
- **Fix:** relocated the row with `tog('permCreate', P.permCreate === true)`.
- **Files modified:** src/pages/settings.js
- **Commit:** f4a8da5

**2. [Rule 2 - Missing critical] Dead-key detector needed a broader reference universe than the plan described**
- **Found during:** Task 2 (GREEN)
- **Issue:** the plan says "scan all `t('…')` literals under src/" — but notif.* keys are referenced ONLY by server.js/mailer.js (tFor), and dozens of live keys are held as VALUES in lookup tables (SET_NAV, ACCENT_TIPS, SHORTCUTS, the pw-meter key array) or behind local t-aliases (tMsg). A literal-only src-scoped collector false-flagged 374 live keys.
- **Fix:** shape-based, permissive reference collection over src/ + server.js + mailer.js (full literals + composed prefixes, template heads included), plus the documented allow-list. A missed reference is acceptable; a false positive is not (plan Test 4).
- **Files modified:** scripts/i18n-scan.mjs, test/i18n-scan.test.mjs
- **Commit:** 3f2f8f8

**3. [Rule 1 - Plan gap] The first sweep exposed 17 additional orphaned keys**
- **Found during:** Task 2/3 (the gate must pass on the post-teardown tree)
- **Issue:** beyond the 6 teardown keys, the detector flagged 17 keys no source references — `act.inviteTeam` (51-02 wired the button with `a11y.inviteTeam`) and 16 older orphans (disable-2FA confirm copy, toast.twoFa*, settings.tfa recovery/setup/regenDesc/anyDigits, settings.nav.twoFactor, a11y.settings.ownerOnly/qr, a11y.toggleSubPages, nav.tab.files, page.auth.signInTo/welcomeBack, toast.passwordUpdated).
- **Fix:** deleted from BOTH catalogues (1718 → 1701); pruned the test enumeration lists (i18n-pages/toast/modal/shell) and bumped the frozen count pin with a per-change comment. `settings.perms.roleTable` was NOT deleted — it was wired as the Members Roles-tab heading per D-51-13.
- **Files modified:** src/locales/en.json, src/locales/fr.json, src/pages/members.js, test/i18n-{pages,toast,modal,shell,core-features}.test.mjs
- **Commit:** 3f2f8f8

**Total deviations:** 3 auto-fixed (2× Rule 1, 1× Rule 2). **Impact:** none on plan scope — all three are direct consequences of making the phase's success criteria actually true (polarity consistency, a gate that passes without false positives, a catalogue with no unreferenced keys outside the documented fixtures).

## Verification

- `npm run i18n:scan` — 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch, **0 dead** (the new detector included in the exit-code contract)
- `node --test test/catalogue.test.mjs` — 27 pass / 0 fail, including the removed-key leak assertions
- `npm test` full suite — **1141 tests, 1130 pass, 0 fail, 11 skips** (documented pre-existing skips; 51-02 baseline 1123 pass)
- `grep -rn "permGuests\|permPublic\|settings.nav.permissions" src/` — no matches
- `node --check src/pages/settings.js && node --check src/pages/members.js` — both pass

## Coverage

- deliverable: Permissions page removed end-to-end (nav, case, toggles, keys, deep-links)
  verification: [{ kind: command, ref: "grep -rn \"permGuests\\|permPublic\\|settings.nav.permissions\" src/", status: pass }, { kind: tests, ref: "test/catalogue.test.mjs#the removed settings-permissions keys are absent from both catalogues", status: pass }, { kind: tests, ref: "test/i18n-pages.test.mjs (settings section-id enumeration no longer lists permissions)", status: pass }]
  human_judgment: true
  rationale: the settings nav rendering and the stale-deep-link fallback are browser-only; the static greps, catalogue assertions and syntax checks are machine-verified
- deliverable: permCreate relocated to Workspace > General with key and behavior intact
  verification: [{ kind: command, ref: "node --check src/pages/settings.js", status: pass }, { kind: tests, ref: "npm test#removeLogo wiring: every data-a action in settings.js resolves in A or IN", status: pass }]
  human_judgment: true
  rationale: the row's visual placement in the running app is browser-only; the toggle's data-in/data-k wiring and persistence path are unchanged by construction
- deliverable: dead-key detector gating i18n:scan/prebuild (UX-01 criterion 5)
  verification: [{ kind: command, ref: "npm run i18n:scan (0 dead)", status: pass }, { kind: tests, ref: "test/i18n-scan.test.mjs#main() gates on dead keys — exit 1 when one lingers, 0 when the tree is clean", status: pass }, { kind: tests, ref: "test/i18n-scan.test.mjs#the live post-teardown tree is dead-key clean", status: pass }]
  human_judgment: false
- deliverable: orphaned-key sweep — catalogue carries no unreferenced keys outside the documented allow-list
  verification: [{ kind: command, ref: "npm run i18n:scan", status: pass }, { kind: tests, ref: "test/i18n-core-features.test.mjs#the catalogue holds… 1701 keys", status: pass }]
  human_judgment: false

## Known Stubs

None.

## Authentication Gates

None.

**Next:** Phase 51 complete (4/4 plans), ready for `/gsd-verify-work 51`.
