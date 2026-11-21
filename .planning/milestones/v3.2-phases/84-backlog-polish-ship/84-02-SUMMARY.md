---
phase: 84-backlog-polish-ship
plan: 02
subsystem: client-pickers
tags: [bp-01, in-02, picker, i18n, lazy-chunk, tdd]
requires: [55-04 assignee picker pattern, 66-03 chunk gate, D-12 locale policy]
provides: [team-pick lazy chunk, teamPick actions trio, D-03 keyboard contract, IN-02 derived i18n check]
affects: [84-03 e2e (picker smoke surface), 84-04 ship (BP-01 requirement closure)]
tech-stack:
  added: []
  patterns: [lazy-modal chunk via S.ui.tpMod, draft-in-S.ui picker state, pk._flat keyboard hook, derived locale parity check]
key-files:
  created: [src/features/team-pick.js, test/team-pick-client.test.mjs]
  modified: [src/actions/actions.js, src/actions/keyboard.js, src/overlays/modals.js, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, src/locales/en.json, src/locales/fr.json, src/locales/es.json, src/locales/de.json, src/locales/nl.json]
decisions:
  - Task 3's locale keys folded into Task 2's commit — the standing "all 5 locales same commit as emitting markup" constraint outranks the plan's task split
  - keyboard.js local branch over the picker input (data-in="teamPickQ") rather than a generic pk._flat consumer — mirrors the settings.js tz branch, per Assumption A3
  - count pins (data-a/data-v tree-wide) bumped as D-12 same-commit pins rather than converted to derived checks (scope: IN-02 covers the catalogue only)
metrics:
  duration: 22 min
  completed: 2026-11-20
status: complete
actuals:
  tokens: 74000
  tasks: 4
  commits: 2
plan_head_before: f14ec95c378a552500be1b9c2a9d26e9513934a4
plan_head_after: 0102028476d172b861e65469d35eca8f02b6a54a
---

# Phase 84 Plan 02: Team picker + IN-02 derived i18n check Summary

**One-liner:** Searchable multi-add team pickers (assignee-modal clone, own lazy chunk) on invite-form and member-edit with D-03 keyboard contract, plus the IN-02 derived i18n catalogue check replacing the 2030 pin.

## What Was Done

**Task 1 (Wave-0, e81a96e6) — IN-02 derived i18n check (D-12):**
- `test/i18n-core-features.test.mjs`: the numeric `assert.equal(keys.length, 2030)` pin is GONE. New derived-parity test: (a) strict en-subset check for es/de/nl; (b) every en key exists in fr except `contract.englishOnly` (fr carries `contract.frenchOnly`); (c) fr's extras must be EXACTLY the documented 40-key allow-list (`webhook.*` lazy-table twins 67-04 + `templates.import*/hide*` lazy-table twins 67-06/07), each group commented with its owner decision (D-12, committed 3647f9ed).
- Closed the 3 real gaps: `pwa.install.hint` added to es/de/nl (properly translated, catalogue position matching en/fr).
- Verified green against the pre-picker key set BEFORE any picker keys existed (Wave-0 ordering satisfied).

**Task 2 (tdd) + Task 3 keys, 01020284 — team picker on both surfaces (BP-01):**
- TDD: `test/team-pick-client.test.mjs` written first (RED: 6 fail), then implementation (GREEN: 7/7).
- `src/features/team-pick.js`: lazy chunk, clone of the 55-04 assignee modal — search via `foldForSearch` containment, draft chips with remove buttons, candidate list, cancel/`act.done` footer.
- `src/actions/actions.js`: teamPickOpen / teamPickToggle / teamPickAdd / teamPickClose / teamPickApply + IN.teamPickQ, mirroring the assignee trio (actions.js:607-673). Draft-in-`S.ui` = `{ surface, draft, q, hl }`. Stored state shapes UNCHANGED (`S.ui.inviteTeams` plain array; `S.ui.memberTeams.teams`; scope/scopeTouched untouched). `S.ui.inviteDraft` silent binding intact (Pitfall 1).
- `src/actions/keyboard.js`: `data-in="teamPickQ"` branch per D-03 — Enter adds the highlighted candidate and KEEPS the input open, Backspace removes the last chip (only when the query is empty), Escape closes. Arrows move the highlight. Hooks `st._flat` (the pk._flat pattern, settings.js:226 precedent — Assumption A3 resolved: the tz branch is input-scoped, so a sibling input-scoped branch is the faithful clone).
- `src/overlays/modals.js`: `case 'teamPick'` renders through the `S.ui.tpMod` lazy cache (stub while importing); invite form and member-edit modal replace their chip-toggle rows with selected chips (remove via invTeamToggle/mteamToggle) + a `teamPickOpen` opener button.
- i18n (Task 3): `modal.teamSearch` / `modal.teamNoMatches` in all 5 locales, same commit as the emitting markup; `act.done` reused for the footer. fr follows the assignee keys' catalogue voice; es/de/nl translated properly.

**Task 4 — chunk gate + verification:**
- Chunk gate GREEN inside the full suite on the committed tree: every emitted .js chunk ≤ 500000 bytes, entry chunk within the 500 kB gate, lazy qrcode/settings/seed chunks intact (team-pick rides its own dynamic chunk).
- Full `npm test`: **2055 tests, 2042 pass, 0 fail** (was 2055 tests / 2040 pass / 2 fail before the count-pin fix; the +8 net tests = 1 derived-parity + 7 picker pins).
- Targeted suites: team-pick-client 7/7, i18n-core-features 26/26, build-locales 11/11, governance-client 55/55.
- Manual browser smoke of both surfaces: NOT run by this agent (no DOM harness; no e2e spec covers pickers) — recorded in the broken-windows ledger (WINDOWS.md, unrun-verify); deferred to the phase's e2e/verify-work pass. The member-edit Access-tab placement claim is pinned by the markup remaining inside the `memberTeams` modal (unchanged placement — the 1787 comment surface).

## Deviations from Plan

**1. [Plan adaptation] Tasks 2 and 3 share one commit (01020284).**
- The plan's standing constraint "every new string lands in all 5 locales at the same commit as the emitting markup" conflicts with the plan's Task 2 → Task 3 commit split. The constraint wins; Task 3's verify (`node --test` i18n-core-features + build-locales) was re-run green with the keys included.

**2. [Rule 3 - blocking] Added `src/overlays/modals.js` to the touched files** (not in the plan frontmatter files_modified): the opener call sites and the chip rows live there. Unavoidable — the surfaces ARE the modal markup.

**3. [Rule 1 - bug] Tree-wide machine-identifier count pins broke** (`test/i18n-shell.test.mjs`, `test/i18n-toast.test.mjs`): 2 failures on data-a/data-v totals (576/91). Fixed by bumping to 582/93 with the D-12-style same-commit tally comments (+6 data-a: teamPickToggle/teamPickAdd/teamPickClose/teamPickApply + 2 openers; +2 data-v: draft chips + option buttons). data-r unchanged (62).

**4. [Plan gap] New test file `test/team-pick-client.test.mjs`** — the plan's files_modified lists only the i18n test, but TDD needs the behavior pins somewhere; repo convention for client-source pins is per-feature `*-client.test.mjs` suites (dashboard-client / export-client / creation-gate-client precedents), so the pins live there.

## T-84 Threat-Row Compliance

| Row | Disposition | Evidence |
|-----|-------------|----------|
| T-84-02 XSS via interpolated team names | mitigate | team-pick.js: every team name rides `esc()`; zero raw interpolations (pinned by test 7 — `!/\$\{tm\.name\}/`); chip fallback `${esc(tm?.name || id)}` also escaped |
| T-84-03 existence oracle | accept | no new endpoint — candidates come from `teamsList()` (workspace doc the user can already read) |
| T-84-04 mass-assignment | accept | POST body shape unchanged (pinned: `[...new Set(S.ui.inviteTeams || [])]` reads verbatim); server re-validates team ids as before |
| T-84-SC dependency installs | mitigate | zero new dependencies; no install commands run this plan |

## Known Stubs

None. No placeholder/hardcoded-empty rendering paths in the picker.

## Self-Check: PASSED

- [x] src/features/team-pick.js exists (FOUND)
- [x] test/team-pick-client.test.mjs exists (FOUND)
- [x] commits e81a96e6, 01020284 exist in git log (FOUND, measured `f14ec95c..01020284` = 2 commits)
- [x] 2030 pin absent from i18n-core-features.test.mjs (grep count 0)
- [x] es/de/nl carry pwa.install.hint
- [x] full suite green on the committed tree (2055/2042/0)
