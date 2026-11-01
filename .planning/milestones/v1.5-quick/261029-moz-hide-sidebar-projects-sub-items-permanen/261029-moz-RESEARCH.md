# Quick Task Research (from prior explore-session findings, verified against source)

## P1 — Hide sidebar Projects sub-items permanently
- Sub-items are HARDCODED in src/shell/layout.js renderSidebar(), lines 130-142: a `.sub` div per project with 4 buttons (board/list/timeline/files) using data-a="go" data-r="project" data-tab="...".
- There is NO "Archives" sub-item: archive is a workspace-level sibling entry at layout.js:146 (sItem('archive', ...)).
- Expansion state S.ui.expanded (src/core/store.js:58) is NOT persisted (docSnapshot store.js:102 saves only data/prefs/views/collapsed). Toggled by A.toggleExpand (src/actions/actions.js:245-248) via project icon/chevron (layout.js:123,128). u.collapsed forces .sub closed (layout.js:130).
- All 4 destinations are reachable inside the project detail page: src/pages/project.js pageProject(), tab catalogue ptabs() lines 25-34 (overview, board, list, table, calendar, timeline, files, activity), default tab 'board' (line 40). Handlers at lines 45-59.
- Chosen fix (user decision): remove the .sub block rendering entirely (hard-hide). Consider whether the chevron/expand toggle (layout.js:123,128 + A.toggleExpand) becomes dead UI once sub-items are gone — if sub-items are the only content of .sub and the only purpose of expanded, remove or hide the toggle too. Keep archive workspace entry untouched.
- i18n keys nav.tab.board/list/files (en.json:341-343), nav.route.timeline (en.json:323) may become unused for the sidebar (still used inside project tabs? verify with grep before deleting keys — prefer NOT deleting keys if referenced elsewhere).

## P2b — Full active-project inventory in Workspace settings > Projects
- src/pages/settings.js:295-317 currently renders ONLY archived projects (d.projects.filter(p => p.archived), line 296) plus default-new-project-view select and 'show done on board' toggle.
- Active projects appear on the main Projects page via visibleProjects() (src/pages/projects.js:27-34; src/core/store.js:238-242 = projOrder.map(proj).filter(!archived)).
- Chosen fix (user decision, option b): in settings, ALSO render the active (non-archived) projects as a read-only inventory list (name + team + lead, maybe link to project) ABOVE the existing archived section. Keep existing archived behavior.
- Use existing list-row patterns from settings.js / projects.js. Labels: reuse existing locale keys where possible (nav.projects etc.); add EN+FR keys only if needed, and bump catalogue/data-a pin values if locale strings change (project convention: pins in test/i18n-core-features.test.mjs; current pins data-a 448, catalogue 1594, verb 32).
