---
phase: 66-task-project-templates
verified: 2026-11-15T18:33:15Z
status: human_needed
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
covered_digest: "v2:sha256:c6104f3bea0a36fa47c20137bd22d0401605ce9ae54d66b38260ec2bc095b697"
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
**Verified:** 2026-11-15T18:33:15Z
**Status:** human_needed (all machine-checkable truths verified; visual/FR-rendering items routed to human)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create a task template with ordered subtask checklist and `dueOffsetDays`; unknown fields silently dropped | ✓ VERIFIED | `src/core/templates.js` — `sanitizeTaskBody` whitelists title/notes/priority/subtasks (+`dueOffsetDays` when numeric, :46-54); `sanitizeProjectBody` whitelists name/description/status/teams (:88). Sink wired at all 3 sites: `server.js:1361` (mergeClientDoc, beside Phase-65 passes, before perm gates), `server.js:874` (normalizeDoc read path, `gate:false`), `mcp.js:222` (writeDoc before JSON write). `test/templates.test.mjs` pins junk-drop + funnel round-trip + position tie-fill + `subtaskCycle` wholesale reject — **75/75 pass** |
| 2 | Project template with starter task tree instantiates in one action — tree + offset-derived dates via normal doc-PUT, no fourth write path | ✓ VERIFIED | `instantiateTemplate` (templates.js:324, pure, `iso(addD(today, offset))` per node — subtask offsets anchor to the same captured day, never parent-chained) + `landInstantiation`; `src/actions/templates.js` A.instantiateTemplate performs ONE synchronous mutate then exactly ONE `pushNow` (:79, :93) — no `createTask` loop in the file (grep clean). **Behavioral evidence:** `e2e/templates.spec.mjs` — both specs PASSED live (`2 passed (4.6s)`: tree remap + offset dues + task-template drawer flow); unit pins for parentId remap, neg/zero/missing offsets, single-push all green |
| 3 | Templates workspace-wide, picker in both creation modals, EN+FR, lazy UI, entry chunk < 500 kB | ✓ VERIFIED | Templates live in `doc.templates[]` (single workspace doc = workspace-wide); `data-a="openTemplatePicker"` entries in taskModal (modals.js:138) and projectCreateModal (modals.js:219); `saveTaskTemplate`/`saveProjectTemplate` in context-menu.js:34/:78; Settings `case 'templates'` (settings.js:499) with dynamic import (:506). No static import of `features/template-ui.js` anywhere (grep clean — only dynamic `import(...)` in settings.js:506 and actions/templates.js:130/:152). **`node --test test/build-chunk-size.test.mjs` → 12 pass / 0 fail** (entry chunk under gate). 19 `templates.*` keys in both en.json and fr.json; i18n parity green in full suite |

**Score:** 3/3 truths verified (0 present-but-behavior-unverified — truths 1 and 2 are behavior-dependent and carry live test evidence: 75 unit pins + 2 passing e2e specs + full suite)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/templates.js` | Sanitizer + funnel + builder | ✓ VERIFIED | Substantive; imports only `subtree.js` (for validateSubtree/normalizeTaskSubtrees on embedded trees — plan said "zero imports" but this is the mandated validator reuse, not a violation); wired by server.js/mcp.js/actions |
| `src/actions/templates.js` | saveTemplate / instantiateTemplate / saveAsTemplate | ✓ VERIFIED | Snapshot/mutate/pushNow/restore cycle, one pushNow per mutation |
| `src/features/template-ui.js` | Lazy chunk: editor, picker, Settings body | ✓ VERIFIED | `templateUi` registry populated via dynamic import (S.ui.tplUi / templateUi.openEditor); every consumer dynamic-imports |
| `server.js` hooks | 2 sink sites | ✓ VERIFIED | lines 874 (read) and 1361 (mergeClientDoc) |
| `mcp.js` call site | Same sink in writeDoc | ✓ VERIFIED | line 222, imported from core module — one validator, second call site |
| `e2e/templates.spec.mjs` | 2 e2e cases | ✓ VERIFIED | Ran live: 2 passed |
| i18n en/fr | templates.* namespace | ✓ VERIFIED | 19 keys each, parity test green |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| mergeClientDoc (server.js:1361) | normalizeTemplatesData | import :68 | ✓ WIRED | Before perm gates, beside Phase-65 passes |
| normalizeDoc (server.js:874) | normalizeTemplatesData | same | ✓ WIRED | Read path, gate:false |
| mcp.js writeDoc (:222) | normalizeTemplatesData | import :37 | ✓ WIRED | Before JSON.stringify write |
| modals picker / ctx-menu / settings | template-ui lazy chunk | dynamic import + registry | ✓ WIRED | No static imports (grep clean) |
| A.instantiateTemplate | pushNow single doc-PUT | actions/templates.js | ✓ WIRED | Test-pinned single push; no createTask loop |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Funnel/whitelist/cycle/builder pins | `node --test test/templates.test.mjs test/mcp.test.mjs` | 75 pass / 0 fail | ✓ PASS |
| Chunk gate | `node --test test/build-chunk-size.test.mjs` | 12 pass / 0 fail | ✓ PASS |
| Full unit suite | `npm test` | 1615 tests, 1602 pass, 0 fail, 13 skipped (pre-existing skips) | ✓ PASS |
| E2E instantiation flows | `npx playwright test e2e/templates.spec.mjs` (e2e/) | 2 passed (4.6s) | ✓ PASS |

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

See frontmatter `human_verification` — visual editor polish (WR-01..04, WR-06 UX paths) and live FR rendering of the picker.

### Gaps Summary

No gaps. All three roadmap success criteria are implemented, wired, and behaviorally proven by tests (75 unit pins, full suite green, chunk-gate green, both e2e instantiation specs passing live). The six open review warnings are real but none blocks goal achievement; they are recorded for triage in 66-REVIEW-DISPOSITION.md and partially folded into the human verification list above.

---

_Verified: 2026-11-15T18:33:15Z_
_Verifier: the agent (gsd-verifier)_
