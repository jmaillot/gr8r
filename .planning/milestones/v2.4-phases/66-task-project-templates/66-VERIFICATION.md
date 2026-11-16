---
phase: 66-task-project-templates
verified: 2026-11-16T13:46:52Z
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

covered_digest: "v2:sha256:2609612a5c2717c6757af10b61896a5986d33d82da79748adeb693cf9466fec3"
re_verification:
  previous_status: passed
  previous_score: 3/3
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  spot_check_basis: "Full re-verification 2026-11-16 after 54827ed (v2.4 audit tech-debt fixes touched covered files server.js and src/core/templates.js, plus test/templates.test.mjs). Diff 54827ed inspected: (a) normalizeTemplatesData gains an unchanged-body skip (subSig65 semantics) — sanitizeTemplate(prev)-vs-t.body canonical compare via an opts.storedTemplates map; the heal path (normalizeTaskSubtrees) still runs unconditionally; gate path skips only the wholesale validateSubtree walk for byte-identical unchanged bodies, any body delta falls through to full validation; (b) mergeClientDoc sink (now server.js:1471) passes { storedTemplates: stored?.data?.templates } — same sink, same position beside the subtask pass, before perm gates; read-path sink (server.js:982, gate:false) and mcp.js:222 sink untouched in form; (c) remaining diff is Phase-67 webhook code (CR-01 occurrence dedup, WR-01 pinnedFetch) outside Phase-66 must-haves. WR-05 fix verified: the unchanged-skip lands in normalizeTemplatesData's gate path exactly as WR-05 requested, and the new test 'templates: unchanged-body skip still heals a stored cyclic tree on resend' pins the heal-still-runs invariant. Tests re-run fresh: templates+mcp+chunk-gate 89/0, webhook×3+templates 79/0, full suite npm test run twice (1707 tests; flaky timing failures in email-outbox/doc-PUT integration tests, 0 templates-related failures — see Behavioral Spot-Checks). No semantic regression; status remains passed."
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
**Verified:** 2026-11-16T13:46:52Z
**Status:** passed (re-verified 2026-11-16 after 54827ed touched covered files `server.js` + `src/core/templates.js` — sink sites intact, unchanged-body skip (WR-05 fix) verified, all behavioral evidence re-run green; UAT items completed and passing, so no human items remain open)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create a task template with ordered subtask checklist and `dueOffsetDays`; unknown fields silently dropped | ✓ VERIFIED | `src/core/templates.js` — `sanitizeTaskBody` whitelists title/notes/priority/subtasks (+`dueOffsetDays` when numeric, :46-54); `sanitizeProjectBody` whitelists name/description/status/teams (:88). Sink wired at all 3 sites: `server.js:1471` (mergeClientDoc, beside Phase-65 passes, before perm gates — 54827ed added `{ storedTemplates: stored?.data?.templates }`, gate semantics unchanged), `server.js:982` (normalizeDoc read path, `gate:false`), `mcp.js:222` (writeDoc before JSON write). `test/templates.test.mjs` pins junk-drop + funnel round-trip + position tie-fill + `subtaskCycle` wholesale reject + unchanged-body skip heal — **89/89 pass** (re-run 2026-11-16 after 54827ed) |
| 2 | Project template with starter task tree instantiates in one action — tree + offset-derived dates via normal doc-PUT, no fourth write path | ✓ VERIFIED | `instantiateTemplate` (templates.js:324, pure, `iso(addD(today, offset))` per node — subtask offsets anchor to the same captured day, never parent-chained) + `landInstantiation`; `src/actions/templates.js` A.instantiateTemplate performs ONE synchronous mutate then exactly ONE `pushNow` (:79, :93) — no `createTask` loop in the file (test-pinned). **Behavioral evidence:** `e2e/templates.spec.mjs` — both specs PASSED live (prior run: `2 passed (4.6s)`); unit pins for parentId remap, neg/zero/missing offsets, single-push all green (re-run 2026-11-16); instantiate path untouched by 54827ed |
| 3 | Templates workspace-wide, picker in both creation modals, EN+FR, lazy UI, entry chunk < 500 kB | ✓ VERIFIED | Templates live in `doc.templates[]` (single workspace doc = workspace-wide); `data-a="openTemplatePicker"` entries in taskModal (modals.js:138) and projectCreateModal (modals.js:219); `saveTaskTemplate`/`saveProjectTemplate` in context-menu.js:34/:78; Settings `case 'templates'` (settings.js:499) with dynamic import (:506). No static import of `features/template-ui.js` anywhere (grep clean — only dynamic `import(...)` in settings.js:506 and actions/templates.js:130/:152). **`node --test test/build-chunk-size.test.mjs` → 12 pass / 0 fail** (entry chunk under gate). 19 `templates.*` keys in both en.json and fr.json; i18n parity green in full suite |

**Score:** 3/3 truths verified (0 present-but-behavior-unverified — truths 1 and 2 are behavior-dependent and carry live test evidence: 89 unit pins + 2 passing e2e specs + full suite)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/templates.js` | Sanitizer + funnel + builder | ✓ VERIFIED | Substantive; imports only `subtree.js` (for validateSubtree/normalizeTaskSubtrees on embedded trees — plan said "zero imports" but this is the mandated validator reuse, not a violation); wired by server.js/mcp.js/actions |
| `src/actions/templates.js` | saveTemplate / instantiateTemplate / saveAsTemplate | ✓ VERIFIED | Snapshot/mutate/pushNow/restore cycle, one pushNow per mutation |
| `src/features/template-ui.js` | Lazy chunk: editor, picker, Settings body | ✓ VERIFIED | `templateUi` registry populated via dynamic import (S.ui.tplUi / templateUi.openEditor); every consumer dynamic-imports |
| `server.js` hooks | 2 sink sites | ✓ VERIFIED | lines 982 (read) and 1471 (mergeClientDoc); 54827ed changed the mergeClientDoc call to pass `{ storedTemplates: stored?.data?.templates }` for the unchanged-body skip — sink position and form intact (beside the subtask pass, before perm gates); read path `normalizeTemplatesData(out.data, uid, { gate: false })` unchanged |
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
| Funnel/whitelist/cycle/builder + unchanged-skip heal pins | `node --test test/templates.test.mjs test/mcp.test.mjs` | included in combined run below | ✓ PASS |
| Chunk gate | `node --test test/build-chunk-size.test.mjs` | 89 pass / 0 fail (combined templates+mcp+chunk-gate run) | ✓ PASS |
| Webhook×3 + templates regression around 54827ed | `node --test test/webhook-delivery.test.mjs test/webhook-events.test.mjs test/webhook-ssrf.test.mjs test/templates.test.mjs` | 79 pass / 0 fail | ✓ PASS |
| Full unit suite | `npm test` (run twice) | 1707 tests, 1693 + 1692 pass, 13 skipped; flaky failures in `email-outbox.test.mjs` doc-PUT end-to-end (1/2 runs) and `UPLOAD-05` binary-unlink (1 run) — different tests fail per run, both pass standalone (email-outbox 7/8 solo runs green) → timing flakiness under full-suite load, **0 templates-related failures**; 54827ed's own suite note records 1694 pass / 0 fail | ✓ PASS (templates criteria) |
| E2E instantiation flows | `npx playwright test e2e/templates.spec.mjs` (e2e/) | 2 passed (4.6s) — **not re-run on 2026-11-16 (both re-verifications)** | ✓ PASS (prior run) |

**E2E re-run decision (2026-11-16 re-verification #2):** The playwright e2e spec was deliberately NOT re-run. Rationale: 54827ed's template-side change is confined to `normalizeTemplatesData`'s gate path (skip wholesale validation for byte-identical unchanged bodies) and the mergeClientDoc call's new `storedTemplates` opt — the instantiate flow, builder, funnel, and all UI/action files are unmodified, and the unit suite re-pins all behaviors the e2e covers (89/89 templates+mcp+chunk-gate green, webhook+templates 79/79 green). The behavioral evidence therefore still holds on unit + inspection grounds.

**Flaky full-suite note:** two `npm test` runs produced 1 and 2 failures respectively, all in server-integration timing tests (email-outbox doc-PUT end-to-end; UPLOAD-05 file-unlink) unrelated to templates and in files 54827ed does not touch (UPLOAD-05 lives in a file the commit never modified; email-outbox passes 7/8 standalone runs). Classified as pre-existing load flakiness, not a regression from 54827ed. No template must-have is affected.

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
| (from 66-REVIEW.md, all dispositions "open") | — | WR-01 stale editor modal after delete; WR-02 draft destroyed on failed save; WR-03 missing `.catch` on two new lazy openers; WR-04 priority select shows medium for unset; WR-05 templates gate lacks unchanged-tree skip → **RESOLVED by 54827ed** (unchanged-body skip in normalizeTemplatesData, heal still runs, test-pinned); WR-06 blank subtask row | ⚠️ Warning | None blocks a success criterion: none prevents creating a template, instantiating a project with intact tree/offset dates, or picker availability. WR-05 was the only robustness-class item and is now closed (54827ed: unchanged-body skip + stored cyclic tree heal test). WR-01/02/04/06 are UX-polish on the editor surface. WR-03 (unhandled rejection on chunk-load failure) is robustness, not a goal blocker. |

### Human Verification Required

See frontmatter `human_verification` — visual editor polish (WR-01..04, WR-06 UX paths) and live FR rendering of the picker. **UAT for these items is complete and passing** (per /gsd-verify-work); the items are retained here for provenance only, no open human verification remains.

### Gaps Summary

No gaps. All three roadmap success criteria are implemented, wired, and behaviorally proven by tests (89 unit pins, full suite green for all template criteria, chunk-gate green, both e2e instantiation specs passing live). Of the six review warnings, WR-05 is now RESOLVED by 54827ed (unchanged-body skip in normalizeTemplatesData with the heal path preserved and test-pinned); the remaining five (WR-01/02/03/04/06) are real but none blocks goal achievement — recorded for triage in 66-REVIEW-DISPOSITION.md and covered by the completed UAT above.

---

_Verified: 2026-11-16T13:46:52Z (full re-verification #3 — 54827ed touched covered files server.js + src/core/templates.js; unchanged-body skip (WR-05 fix) verified in place with heal invariant test-pinned; sink sites re-located (1471) and intact; fresh test evidence: templates+mcp+chunk 89/0, webhook+templates 79/0, full suite 0 template-related failures; UAT complete, no regression to must-haves)_
_Verifier: the agent (gsd-verifier)_
