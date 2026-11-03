---
status: partial
phase: 34-per-user-settings-isolation-search-leak-closure
source: [34-01-SUMMARY.md, 34-02-SUMMARY.md, 34-03-SUMMARY.md, 34-04-SUMMARY.md]
started: 2026-11-03T13:20:00Z
updated: 2026-11-03T15:00:00Z
---

## Current Test

[diagnosed G-34-6 — awaiting gap-closure plan]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, the notif-prefs migration completes (first boot backs up + backfills; second boot is a byte-identical no-op), and a primary query returns live data.
result: pass

### 2. Two-user per-workspace settings isolation (live UI)
expected: In API mode, open the settings page as two different users of the same workspace and toggle prefs for each. Each user sees their own stored prefs after their first toggle; the two users' toggles stay independent (no shared state).
result: issue
reported: "false, it changed for everyone (for example in notifications) but i didnt rebuild yet so push it in case it was changed in last phases"
severity: major

### 3. API-mode pre-toggle hydration gap (product acceptance)
expected: KNOWN LIMITATION (Plan 04, ApiModeUX, human_judgment): in API mode, opening settings BEFORE toggling anything shows all-ON defaults, not the user's stored row, until the first PUT of the session adopts the server merge. Confirm this is acceptable or schedule a fetch-on-workspace-open.
result: pass
reason: "User accepted the all-ON-until-first-toggle display as product behavior (the G-34-4 hydration FIX is still planned as a gap-closure; this row records the acceptance of the default display itself, distinct from the reload regression). The earlier ERR_MODULE_NOT_FOUND report on this row was reclassified to G-34-3 (Dockerfile), not a hydration issue."

### 4. Settings toggle persistence branch (live UI)
expected: Toggling a notification pref persists through exactly one branch: API mode → PUT /api/me/notif-prefs; local mode → per-workspace localStorage. The toggle state survives and never writes into the shared workspace document.
result: issue
reported: "after rebuild when i remove one notification and i click F5, it toggles on everytime"
severity: major

### 5. Local-mode reload + workspace-switch (live UI)
expected: In local mode, toggle a pref, reload the page, switch to another local workspace and back. Prefs survive reload, no bleed between local workspaces (per-workspace localStorage keys).
result: issue
reported: "the pref doesnt survive a F5"
severity: major

### 6. Tokenized recent-search redaction (live search)
expected: Search for a term that shares a full token with a hidden entry — it is dropped from recent searches. A substring-only collision (e.g. searching "Sara Corp" while "Sarah" is hidden) is KEPT in recent searches. Accented variants: NFC/NFD encodings match identically, Café does not match cafe.
result: pass
reason: "Agent-verified: scope.test.mjs 79/79 (D-13 e2e pin incl. sarah smith dropped / Sara Corp kept) and redaction.test.mjs 22/22 (NFC/NFD, Cafe!=cafe) all green in this session against the built tree.

### 7. Migration observability (backup artifact)
expected: On the boot where the notif-prefs backfill first runs, a timestamped backup file `projects-pre-notif-prefs-<stamp>.db` appears under DATA_DIR before any mutation, and a second boot creates no additional backup.
result: pass
reason: "Agent-verified: migration.test.mjs 37/37 incl. backups.length === 1 after second boot and byte-identical reboot snapshot, all green in this session.

### 8. Re-run Test 4 after gap closure G-34-4 (live UI, rebuilt client)
expected: In API mode with the rebuilt client, toggle a notification pref OFF and press F5 — the pref stays OFF. hydrateNotifPrefs fetches the stored row at workspace open and adopts it before the next render (fixed by commits cf72c1d/f88ec88/353f156).
result: issue
reported: "faux, apres rebuild ca remet sur ON"
severity: major

## Summary

total: 8
passed: 4
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-34-6
  truth: "In API mode, an unchecked notification pref stays unchecked after F5 reload (re-run of Test 4 after G-34-4 closure)"
  status: open
  resolved_by: ""
  resolved_at: ""
  reason: "User reported (Test 8): faux, apres rebuild ca remet sur ON"
  severity: major
  test: 8
  root_cause: "AGENT-PLAYWRIGHT-DIAGNOSED (real browser, API-backed e2e server): the G-34-4 fix wired hydrateNotifPrefs at 5 hydrateFromServer call sites in src/actions/actions.js, but there is a 6th call site — src/main.js ~line 328 (boot for /w/<slug> URLs) — which is exactly the path F5 uses. Network trace after page.reload(): PUT 200 stored email_mention:false correctly (server row NOT clobbered), but NO GET /api/me/notif-prefs fires on reload; S.notifPrefs stays at all-ON defaults. Hydration fires only on the login path. Secondary factor: dist/ was stale (built 14:44, fix commits 15:48+); even a fresh build still fails on the reload path because of the missing main.js call."
  artifacts:
    - path: "src/main.js"
      issue: "boot path hydrates the doc via hydrateFromServer(slug) but never calls hydrateNotifPrefs — the F5/reload route renders defaults"
  missing:
    - "Await hydrateNotifPrefs() after the successful hydrateFromServer(slug) in src/main.js (~line 328), mirroring the actions.js pattern"
  debug_session: ""

- gap_id: G-34-2
  truth: "Two users of one workspace see independent notification prefs after their first toggle (no shared state)"
  status: resolved
  resolved_by: "agent-playwright-run: two isolated browser contexts proved server rows independent; observation was the G-34-4 display bug + stale build"
  resolved_at: 2026-11-03
  reason: "User reported: false, it changed for everyone (for example in notifications) but i didnt rebuild yet so push it in case it was changed in last phases"
  severity: major
  test: 2
  root_cause: "RESOLVED BY AGENT TESTING: scripted two-browser-context Playwright run against the real e2e server showed server rows ARE independent (owner OFF, carol still ON). The user's 'changed for everyone' observation was the G-34-4 display bug (all-ON defaults after reload) plus a stale client build at test time — not a server-layer leak. No code gap remains for this truth."
  artifacts: []
  missing: []

- gap_id: G-34-4
  truth: "In API mode, an unchecked notification pref stays unchecked after F5 reload"
  status: resolved
  resolved_by: "gap-closure plan 34-05 (commits cf72c1d, f88ec88, 353f156): pure mergeNotifPrefs helper + hydrateNotifPrefs wired at all 5 API-mode hydrateFromServer success paths; local mode untouched. Code-verified by re-verification (16/16 must-haves); live-browser re-test pending as Test 8."
  resolved_at: 2026-11-03
  reason: "User reported: after rebuild when i remove one notification and i click F5, it toggles on everytime"
  severity: major
  test: 4
  root_cause: "GET-on-open never wired: api.getNotifPrefs exists (src/core/api.js:257) but no caller fetches prefs when settings opens or on boot. S.notifPrefs hydrates only from the PUT response (actions.js:2695 adopts server merge), so after F5 the store starts empty and the page renders all-ON defaults — the exact ApiModeUX gap flagged human_judgment in 34-04 (Test 3), manifesting as a reload regression. The PUT itself persists server-side; the display is the problem."
  artifacts:
    - path: "src/actions/actions.js"
      issue: "no GET hydration on settings open / boot; S.notifPrefs only populated after first PUT"
    - path: "src/pages/settings.js"
      issue: "renders S.notifPrefs defaults without fetching stored row"
  missing:
    - "Wire api.getNotifPrefs(wsId) on settings open (or workspace open) in API mode and merge into S.notifPrefs before render"
  debug_session: ""

- gap_id: G-34-5
  truth: "In local mode, notification prefs survive F5 reload (per-workspace localStorage)"
  status: resolved
  resolved_by: "agent-playwright-run (vite preview): toggle OFF survives F5 in local mode; user's failure was API-mode G-34-4"
  resolved_at: 2026-11-03
  reason: "User reported: the pref doesnt survive a F5"
  severity: major
  test: 5
  root_cause: "RESOLVED BY AGENT TESTING: local mode verified in a real browser via vite preview (demo config) — toggle OFF, F5, toggle stays OFF. localStorage per-workspace path is correct. The user's F5 failure was the API-mode deployment (G-34-4), not local mode."
  artifacts: []
  missing: []
  debug_session: ""

- gap_id: G-34-3
  truth: "Deployed server boots: server.js imports src/lib/redaction.js and the runtime image resolves it"
  status: resolved
  resolved_by: "commit 4af1d9b — Dockerfile runtime stage now COPYs /app/src (user to confirm on rebuild)"
  resolved_at: 2026-11-03
  reason: "User reported: Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/src/lib/redaction.js' imported from /app/server.js"
  severity: blocker
  test: 3
  root_cause: "Dockerfile runtime stage copies only server.js/oidc.js/totp.js/mailer.js/seed.json/dist — never src/. Plan 34-03 added a server-side import of src/lib/redaction.js to server.js, so the deployed image cannot resolve it. Pre-34-03, server.js had no src/ imports, so the omission was invisible."
  artifacts:
    - path: "Dockerfile"
      issue: "runtime stage lacks COPY of src/lib/redaction.js (new server.js dependency from 34-03)"
  missing:
    - "Add src/lib (or at least src/lib/redaction.js) to the Dockerfile runtime-stage COPY set"
  debug_session: ""
