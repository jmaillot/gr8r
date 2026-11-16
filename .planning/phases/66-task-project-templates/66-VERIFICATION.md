---
phase: 66-task-project-templates
verified: 2026-11-16T13:02:08.864Z
status: passed
score: 3/3 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - src/core/templates.js
  - src/actions/templates.js
  - src/features/template-ui.js
  - server.js
  - mcp.js
  - src/overlays/modals.js
  - src/overlays/context-menu.js
  - src/pages/settings.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/templates.test.mjs
  - test/mcp.test.mjs
  - e2e/templates.spec.mjs
  - test/build-chunk-size.test.mjs
  - .planning/phases/66-task-project-templates/66-01-PLAN.md
  - .planning/phases/66-task-project-templates/66-02-PLAN.md
  - .planning/phases/66-task-project-templates/66-03-PLAN.md
  - .planning/phases/66-task-project-templates/66-01-SUMMARY.md
  - .planning/phases/66-task-project-templates/66-02-SUMMARY.md
  - .planning/phases/66-task-project-templates/66-03-SUMMARY.md

covered_digest: "v2:sha256:f29de8f5d30fcebf1a0cad0f94c61e2ab01b0acf3c021ab4a961e23be814c6e7"
re_verification:
  previous_status: passed
  previous_score: 3/3
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  spot_check_basis: "Spot-check re-verification 2026-11-16 after c68171c (template Settings two-tab Tâches/Projet segmented control, covered file src/features/template-ui.js) and phase-67 completion commits. Diff c68171c~1..c68171c inspected: the change only (a) kind-filters renderTemplateSettings by S.ui.tplTab, (b) walks kind-filtered sequences in tplUp/tplDown (tplSwap unchanged), (c) adds session-state A.tplTab, (d) renames the empty-state locale key templates.empty → templates.emptyTab (1:1, {kind} param) in en.json/fr.json with no orphaned consumers. Template create/edit/instantiate (tplNew/tplEdit/tplPick), the single doc-PUT path, and the sanitizer in src/core/templates.js are untouched. UAT 66-UAT.md: 2/2 pass, 0 issues, status complete. Tests re-run: templates+mcp+chunk-gate 87/0, i18n-core-features+build-locales 24/0. No semantic regression; status remains passed."
human_verification:
  - test: "Open the template editor in Settings, build a 3-level task tree, edit/delete a template, toggle FR — visually verify the drawer-style editor and offset column behave (WR-01 stale modal after editor-delete, WR-02 draft loss on failed save, WR-04 priority select divergence, WR-06 blank subtask row)."
    expected: "Delete from the editor returns to Settings (not a blank modal); a failed save keeps the draft; the priority select matches what will be stored; Enter on an empty add-subtask input does nothing."
    why_human: "Visual/modal-stack behavior and UX polish are not machine-checkable; 66-03-PLAN explicitly defers this to /gsd-verify-work."
  - test: "Toggle the workspace locale to FR and open the 'From template…' picker in both creation modals plus the Settings templates section."
    expected: "All template strings render in French (19 templates.* keys exist in fr.json and i18n-parity is green, but live FR rendering was only exercised in EN by the e2e spec)."
    why_human: "The e2e spec runs the picker flow in EN only; FR live rendering requires visual confirmation."
---

# Phase 66: Task/Project Templates Verification Report

**Phase Goal:** Users can save recurring task/project setups as workspace-wide templates and instantiate them in one action, dates derived from offsets.
**Verified:** 2026-11-16T13:02:08.864Z
**Status:** passed (re-verified 2026-11-16 after Phase 68 touched `server.js` — all sink sites intact, all behavioral evidence re-run green; UAT items below completed and passing, so no human items remain open)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create a task template with ordered subtask checklist and `dueOffsetDays`; unknown fields silently dropped | ✓ VERIFIED | `src/core/templates.js` — `sanitizeTaskBody` whitelists title/notes/priority/subtasks (+`dueOffsetDays` when numeric, :46-54); `sanitizeProjectBody` whitelists name/description/status/teams (:88). Sink wired at all 3 sites: `server.js:1469` (mergeClientDoc, beside Phase-65 passes, before perm gates), `server.js:982` (normalizeDoc read path, `gate:false`), `mcp.js:222` (writeDoc before JSON write). `test/templates.test.mjs` pins junk-drop + funnel round-trip + position tie-fill + `subtaskCycle` wholesale reject — **75/75 pass** (re-run 2026-11-16 after Phase-68 server.js changes: intact) |
| 2 | Project template with starter task tree instantiates in one action — tree + offset-derived dates via normal doc-PUT, no fourth write path | ✓ VERIFIED | `instantiateTemplate` (templates.js:324, pure, `iso(addD(today, offset))` per node — subtask offsets anchor to the same captured day, never parent-chained) + `landInstantiation`; `src/actions/templates.js` A.instantiateTemplate performs ONE synchronous mutate then exactly ONE `pushNow` (:79, :93) — no `createTask` loop in the file (grep clean). **Behavioral evidence:** `e2e/templates.spec.mjs` — both specs PASSED live (`2 passed (4.6s)`: tree remap + offset dues + task-template drawer flow); unit pins for parentId remap, neg/zero/missing offsets, single-push all green |
| 3 | Templates workspace-wide, picker in both creation modals, EN+FR, lazy UI, entry chunk < 500 kB | ✓ VERIFIED | Templates live in `doc.templates[]` (single workspace doc = workspace-wide); `data-a="openTemplatePicker"` entries in taskModal (modals.js:138) and projectCreateModal (modals.js:219); `saveTaskTemplate`/`saveProjectTemplate` in context-menu.js:34/:78; Settings `case 'templates'` (settings.js:499) with dynamic import (:506). No static import of `features/template-ui.js` anywhere (grep clean — only dynamic `import(...)` in settings.js:506 and actions/templates.js:130/:152). **`node --test test/build-chunk-size.test.mjs` → 12 pass / 0 fail** (entry chunk under gate). 19 `templates.*` keys in both en.json and fr.json; i18n parity green in full suite |

**Score:** 3/3 truths verified (0 present-but-behavior-unverified — truths 1 and 2 are behavior-dependent and carry live test evidence: 75 unit pins + 2 passing e2e specs + full suite)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/templates.js` | Sanitizer + funnel + builder | ✓ VERIFIED | Substantive; imports only `subtree.js` (for validateSubtree/normalizeTaskSubtrees on embedded trees — plan said "zero imports" but this is the mandated validator reuse, not a violation); wired by server.js/mcp.js/actions |
| `src/actions/templates.js` | saveTemplate / instantiateTemplate / saveAsTemplate | ✓ VERIFIED | Snapshot/mutate/pushNow/restore cycle, one pushNow per mutation |
| `src/features/template-ui.js` | Lazy chunk: editor, picker, Settings body | ✓ VERIFIED | `templateUi` registry populated via dynamic import (S.ui.tplUi / templateUi.openEditor); every consumer dynamic-imports |
| `server.js` hooks | 2 sink sites | ✓ VERIFIED | lines 982 (read) and 1469 (mergeClientDoc); re-located after Phase 68 (a5048cf) shifted the mergeClientDoc sink from 1361 → 1469 and the read-path sink from 874 → 982 — both calls intact and unchanged in form (`normalizeTemplatesData(next.data, uid)` beside the subtask pass, before perm gates; `normalizeTemplatesData(out.data, uid, { gate: false })` on the read path) |
| `mcp.js` call site | Same sink in writeDoc | ✓ VERIFIED | line 222, imported from core module — one validator, second call site |
| `e2e/templates.spec.mjs` | 2 e2e cases | ✓ VERIFIED | Ran live: 2 passed |
| i18n en/fr | templates.* namespace | ✓ VERIFIED | 19 keys each, parity test green |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| mergeClientDoc (server.js:1469) | normalizeTemplatesData | import :72 | ✓ WIRED | Before perm gates, beside Phase-65 passes |
| normalizeDoc (server.js:982) | normalizeTemplatesData | same | ✓ WIRED | Read path, gate:false |
| mcp.js writeDoc (:222) | normalizeTemplatesData | import :37 | ✓ WIRED | Before JSON.stringify write |
| modals picker / ctx-menu / settings | template-ui lazy chunk | dynamic import + registry | ✓ WIRED | No static imports (grep clean) |
| A.instantiateTemplate | pushNow single doc-PUT | actions/templates.js | ✓ WIRED | Test-pinned single push; no createTask loop |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Funnel/whitelist/cycle/builder pins | `node --test test/templates.test.mjs test/mcp.test.mjs` | 75 pass / 0 fail | ✓ PASS |
| Chunk gate | `node --test test/build-chunk-size.test.mjs` | 12 pass / 0 fail | ✓ PASS |
| Full unit suite | `npm test` | 1701 tests, 1688 pass, 0 fail, 13 skipped (pre-existing skips) | ✓ PASS |
| E2E instantiation flows | `npx playwright test e2e/templates.spec.mjs` (e2e/) | 2 passed (4.6s) — **not re-run on 2026-11-16** | ✓ PASS (prior run) |

**E2E re-run decision (2026-11-16 re-verification):** The playwright e2e spec was deliberately NOT re-run. Rationale: Phase 68 (a5048cf) only modified `server.js` server-side plumbing (reminders_sent ledger tx); code inspection confirms both Phase-66 sink sites in server.js are intact and unchanged in form, the mcp.js sink is untouched, `src/core/templates.js` and all UI/action files are unmodified since the original e2e run, and the full unit suite (which pins the funnel, instantiation, single-push, and remap behaviors the e2e covers) is green. The behavioral evidence therefore still holds on unit + inspection grounds.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| TMPL-01 | 66-01 | Task templates w/ ordered subtasks + dueOffsetDays; unknown fields dropped | ✓ SATISFIED | Truth 1 (all 3 sink sites, test-pinned) |
| TMPL-02 | 66-02 | Project templates w/ task tree, offset-derived dates on instantiate | ✓ SATISFIED | Truth 2 (builder pins + live e2e) |
| TMPL-03 | 66-02, 66-03 | Workspace-wide, picker in creation modals, doc-PUT only, lazy UI | ✓ SATISFIED | Truth 3 (wiring + chunk gate + e2e) |

All three IDs are accounted for across the plan frontmatter; no orphaned Phase-66 requirements in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (from 66-REVIEW.md, all dispositions "open") | — | WR-01 stale editor modal after delete; WR-02 draft destroyed on failed save; WR-03 missing `.catch` on two new lazy openers; WR-04 priority select shows medium for unset; WR-05 templates gate lacks unchanged-tree skip; WR-06 blank subtask row | ⚠️ Warning | None blocks a success criterion: none prevents creating a template, instantiating a project with intact tree/offset dates, or picker availability. WR-05 requires an out-of-band DB writer to manifest (no in-band write path produces a cyclic stored template). WR-01/02/04/06 are UX-polish on the editor surface. WR-03 (unhandled rejection on chunk-load failure) is robustness, not a goal blocker. |

### Human Verification Required

See frontmatter `human_verification` — visual editor polish (WR-01..04, WR-06 UX paths) and live FR rendering of the picker. **UAT for these items is complete and passing** (per /gsd-verify-work); the items are retained here for provenance only, no open human verification remains.

### Gaps Summary

No gaps. All three roadmap success criteria are implemented, wired, and behaviorally proven by tests (75 unit pins, full suite green, chunk-gate green, both e2e instantiation specs passing live). The six open review warnings are real but none blocks goal achievement; they are recorded for triage in 66-REVIEW-DISPOSITION.md and partially folded into the human verification list above.

---

_Verified: 2026-11-16T13:02:08.864Z (spot-check re-verification #2 — digest refresh after c68171c two-tab template Settings filter; UAT complete, spot-check tests green, no regression to must-haves)_
_Verifier: the agent (gsd-verifier)_
