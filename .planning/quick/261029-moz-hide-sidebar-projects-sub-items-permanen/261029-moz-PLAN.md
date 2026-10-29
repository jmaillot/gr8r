---
phase: quick-261029-moz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/shell/layout.js
  - src/pages/settings.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/i18n-core-features.test.mjs
autonomous: true
requirements: [QUICK-261029-MOZ]
must_haves:
  truths:
    - Sidebar Projects group shows only project rows and the workspace Archive entry — no .sub sub-items (board/list/timeline/files) ever render
    - Expand chevron / toggleExpand affordance is gone or inert on project rows (no dead UI)
    - Workspace settings > Projects shows a read-only inventory of ACTIVE (non-archived) projects above the existing archived section
    - Archived section behavior unchanged (restore/delete buttons, open-archive link)
    - npm test passes with i18n pin values bumped if locale strings changed
  artifacts:
    - src/shell/layout.js (sidebar without .sub block)
    - src/pages/settings.js (active projects inventory)
    - src/locales/en.json + fr.json (new settings.projects.active key, EN+FR)
  key_links:
    - layout.js .sproj render → no .sub div; project row still navigates via data-a="go" data-r="project"
    - settings.js case 'projects' → active list built from d.projects.filter(p => !p.archived)
---

<objective>
Permanently hide the sidebar Projects sub-items (hard-hide per user decision) and add a read-only inventory of active projects to Workspace settings > Projects.
Purpose: sidebar was cluttered with per-project sub-navigation whose destinations already exist inside the project detail page tabs; settings lacked a full active-project inventory.
Output: modified src/shell/layout.js and src/pages/settings.js, EN+FR locale keys, passing npm test.
</objective>

<execution_context>
@/home/jmaillot/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/jmaillot/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/quick/261029-moz-hide-sidebar-projects-sub-items-permanen/261029-moz-RESEARCH.md

Ground truth (verified in RESEARCH.md):
- Sidebar sub-items are hardcoded in src/shell/layout.js renderSidebar(): the `.sub` div inside the `projs.map(...)` block (~lines 130–142), with 4 buttons using data-a="go" data-r="project" data-tab="...". Expansion state S.ui.expanded is NOT persisted (store.js:102 saves only data/prefs/views/collapsed); toggled by A.toggleExpand (src/actions/actions.js:245-248) via project pico icon and chevron (layout.js:123,128).
- All 4 sub-item destinations are reachable inside the project detail page tabs (src/pages/project.js ptabs lines 25–59, default tab 'board').
- Workspace-level Archive entry is a sibling sItem at layout.js ~146 — DO NOT touch it.
- Settings projects tab: src/pages/settings.js case 'projects' (~lines 295–317) renders archived projects via `d.projects.filter(p => p.archived)` plus a `.sblock` with heading t('settings.projects.archived'). Active list pattern exists in src/pages/projects.js visibleProjects() (store.js:238-242 = projOrder.map(proj).filter(!archived)).
- i18n pins in test/i18n-core-features.test.mjs: data-a 448, catalogue 1594, verb 32. Convention: EN+FR locale files in src/locales/, bump pins when strings change.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Hard-hide sidebar Projects sub-items and remove the now-dead expand affordance (per locked decision P1)</name>
  <files>src/shell/layout.js</files>
  <action>
In src/shell/layout.js renderSidebar(), inside the `projs.map(...)` block:
1. Remove the entire `<div class="sub ...">` block (the one containing the 4 buttons for board/list/timeline/files) — per user decision P1, a hard-hide, not a CSS/`u.collapsed` conditional.
2. Handle the now-dead expand affordance: since the removed sub-items were the only content of `.sub` and the only purpose of `u.expanded`, remove both `data-a="toggleExpand"` triggers on the project row — (a) on the `.pico` icon span (layout.js ~123) keep the icon but drop the data-a="toggleExpand" attribute and its aria-label usage; (b) remove the chevron `<span class="ibtn ibtn-xs" data-a="toggleExpand" ...>${ic('chevron-right', ...)}</span>` from the `.hov` span (layout.js ~128). Do NOT delete the A.toggleExpand action itself in this task (other call sites may exist — grep first; if grep shows layout.js is the only renderer and no other references remain, leaving the action definition in actions.js is acceptable dead code for this quick task; do not touch store.js persistence logic).
3. Keep everything else: project row navigation (data-a="go" data-r="project" data-id), drag, favorite/lock badges, status dot, context menu, and the workspace Archive sItem (~line 146) untouched.
4. If the removed code makes `nav.tab.board/list/files` or `nav.route.timeline` sidebar-uses disappear, verify with grep that the keys are still used elsewhere (project tabs use them) — do NOT delete locale keys.
  </action>
  <verify>
    <automated>grep -c 'class="sub' src/shell/layout.js | grep -vx '^0$' && exit 1 || true; grep -c 'toggleExpand' src/shell/layout.js | grep -vx '^0$' && exit 1 || grep -q "sItem('archive'" src/shell/layout.js && npm test -- --silent 2>&1 | tail -5</automated>
  </verify>
  <done>No `.sub` sub-item rendering and no toggleExpand attribute remain in src/shell/layout.js; Archive sidebar entry intact; npm test passes.</done>
</task>

<task type="auto">
  <name>Task 2: Read-only active-projects inventory in Workspace settings > Projects, above the archived section (per locked decision P2b)</name>
  <files>src/pages/settings.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs</files>
  <action>
In src/pages/settings.js case 'projects':
1. Add `const active = d.projects.filter(p => !p.archived)` alongside the existing `arch` filter (line ~296).
2. Render a read-only inventory block of active projects ABOVE the existing archived `.sblock`, using existing list-row markup patterns (mirror the archived row style: `<div class="srow"><div class="row">${pIcon(p, '', 14)}<b style="font-weight:500">${esc(p.name)}</b></div>...</div>`). Each row: project icon + name + team name and lead if available on the project object (check the project shape in src/core/store.js; if team/lead are not directly on the project, resolve via the same helpers settings.js/projects.js already use — do not invent new data plumbing; omit a field gracefully if absent).
3. Make rows link to the project using the existing navigation convention (data-a="go" data-r="project" data-id="${p.id}") — read-only means NO create/edit/archive/delete controls in this inventory.
4. Add a section heading using a NEW locale key `settings.projects.active` (EN: "Active projects", FR: "Projets actifs") in src/locales/en.json and src/locales/fr.json next to the existing settings.projects.* keys. Reuse existing keys for everything else. If the active list is empty, show a faint empty-state line reusing the pattern of the noArchived message with the new key or an existing generic key.
5. Bump the i18n pin values in test/i18n-core-features.test.mjs (current: data-a 448, catalogue 1594, verb 32) to whatever the locale changes produce — run the test first to read the expected values, then pin them.
Do NOT scope-creep into multi-team or notifications work.
  </action>
  <verify>
    <automated>grep -q "settings.projects.active" src/locales/en.json src/locales/fr.json src/pages/settings.js && npm test -- --silent 2>&1 | tail -5</automated>
  </verify>
  <done>Settings > Projects shows active (non-archived) projects as a read-only list above the archived section; archived section unchanged; EN+FR keys present; i18n pins bumped; npm test passes.</done>
</task>

</tasks>

<verification>
- npm test passes end-to-end (unit suite incl. i18n pin guards).
- grep confirms no `class="sub` block and no `toggleExpand` in src/shell/layout.js.
- grep confirms `settings.projects.active` present in both locale files and used in src/pages/settings.js.
- Visual/manual: sidebar Projects group shows only project rows + Archive; settings Projects tab lists active projects then archived projects.
</verification>

<success_criteria>
Both locked decisions implemented exactly (P1 hard-hide with dead chevron handled; P2b read-only active inventory above archived section), no scope creep, tests green.
</success_criteria>

<output>
Create `.planning/quick/261029-moz-hide-sidebar-projects-sub-items-permanen/261029-moz-SUMMARY.md` when done
</output>
