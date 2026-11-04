---
phase: 34-per-user-settings-isolation-search-leak-closure
plan: 04
subsystem: notifications-client
tags: [localStorage, per-user-prefs, branching-adapter, snapshot-strip, settings-ui]

requires:
  - phase: 34-per-user-settings-isolation-search-leak-closure
    provides: GET/PUT /api/me/notif-prefs routes + per-user rows (34-01), guarded backfill (34-02)
provides:
  - src/core/notifPrefs.js — per-workspace localStorage prefs adapter (key builder, D-27-5 defaults, whitelisted load/save)
  - api.getNotifPrefs/putNotifPrefs client methods
  - S.notifPrefs — the per-user prefs object in store state the settings page renders
  - store.stripLegacyNotifPrefs + docSnapshot exclusion (client half of the no-resurrect strip)
  - test/local-prefs.test.mjs — 7-test local-mode suite
affects: [34-03 matcher plan, settings UI, verifier]

actuals:
  tokens: 17250
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - one branch, two persistence adapters (IN.langSel shape: optimistic store update → local-storage OR API PUT)
    - strip-on-load + snapshot-exclusion double guard against doc-field resurrection (stripLegacyLang precedent)
    - read-side whitelist + boolean-only sanitizer on localStorage hydration

key-files:
  created:
    - src/core/notifPrefs.js
    - test/local-prefs.test.mjs
  modified:
    - src/core/api.js
    - src/core/store.js
    - src/actions/actions.js
    - src/pages/settings.js
    - src/data/seed.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/i18n-core-features.test.mjs
    - test/error-codes.test.mjs

key-decisions:
  - "Local-mode workspace identity for the prefs key is D().ws.url (API mode uses api.workspace.id) — seed workspaces carry a url, not an id"
  - "emitMentions rewired from D().notifPrefs to S.notifPrefs — with the seed block gone and the doc strip active, the doc read was permanently undefined; gating now honors the per-user object"
  - "npToggle adopts the server's canonical merged prefs on PUT success; API-mode prefs hydrate on first toggle, not on workspace open (no GET-on-load wiring in this plan)"
  - "New err.notifPrefsSaveFailed locale key for the non-401 failure toast, with the four catalogue pins updated (size 1659, err allowlist, French apostrophe, call-site count 42)"

patterns-established:
  - "Per-workspace localStorage key shape: 'projects.notifPrefs.' + workspace id, outside the projects.v2 blob (LOCALE_STORAGE_KEY precedent)"
  - "Client-side strip discipline: strip on load (stripLegacyNotifPrefs in load()) plus delete-before-serialize in docSnapshot()"

requirements-completed: [SETTINGS-02]

coverage:
  - id: D7
    description: "The settings toggle persists through exactly one branch: api.enabled → PUT /api/me/notif-prefs; otherwise per-workspace localStorage — never a doc write"
    requirement: SETTINGS-02
    verification:
      - kind: static
        ref: "grep actions.js npToggle: single api.enabled branch, no D().notifPrefs write"
        status: pass
    human_judgment: false
  - id: D8
    description: "Local mode: prefs survive reload, are scoped per workspace (no bleed), default all-ON when the key is absent, whitelist-validated, exception-swallowing"
    requirement: SETTINGS-02
    verification:
      - kind: tests
        ref: "test/local-prefs.test.mjs (7/7 pass: defaults, reload survival, per-workspace isolation, whitelist, exception swallowing)"
        status: pass
    human_judgment: false
  - id: D6s
    description: "The seed document carries no notifPrefs block; a fresh local workspace starts from defaults (recentSearches 'Sarah' retained for Plan 03)"
    requirement: SETTINGS-02
    verification:
      - kind: static
        ref: "grep seed.js: 0 notifPrefs keys; 'Sarah' recentSearches entry present"
        status: pass
    human_judgment: false
  - id: T34-09c
    description: "An old localStorage blob carrying doc notifPrefs cannot resurrect the field into the document snapshot (client-side strip + docSnapshot exclusion)"
    requirement: SETTINGS-02
    verification:
      - kind: tests
        ref: "test/local-prefs.test.mjs#a legacy snapshot carrying doc.notifPrefs is stripped on load and excluded from docSnapshot"
        status: pass
    human_judgment: false
  - id: UInp
    description: "The settings page renders the per-user prefs object from the new store, not d.notifPrefs; the 17 tog rows stay untouched"
    requirement: SETTINGS-02
    verification:
      - kind: static
        ref: "grep settings.js: const np = S.notifPrefs; tog rows unchanged; npm test 848 pass"
        status: pass
      - kind: command
        ref: "npm test — 848 pass, 0 fail, 3 pre-existing skips"
        status: pass
    human_judgment: false
  - id: ApiModeUX
    description: "API-mode prefs display before the user's first toggle of the session"
    requirement: SETTINGS-02
    verification: []
    human_judgment: true
    rationale: "The plan scoped hydration to the toggle path only: S.notifPrefs adopts the server's canonical merge on the first PUT. A user who opens settings in API mode before toggling sees the D-27-5 defaults rather than their stored row until a fetch-on-workspace-open is wired (future plan). Toggle-persist behavior itself is fully verified."

duration: 12min
completed: 2026-11-03
status: complete
---

# Phase 34 Plan 04: Client Prefs Isolation Summary

**One branching persistence adapter for per-user notif prefs — per-workspace localStorage in local mode, PUT /api/me/notif-prefs in API mode — with the seed block removed and legacy client snapshots stripped so the doc field can never resurrect.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-03T10:39:07Z
- **Completed:** 2026-11-03T10:51:30Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- `src/core/notifPrefs.js`: per-workspace key builder (`projects.notifPrefs.` + workspace id), the 13-key D-27-5 default layer, the 17-key whitelist, and `getLocalNotifPrefs`/`setLocalNotifPrefs` with try/catch both directions and a boolean-only read-side sanitizer
- `api.getNotifPrefs(workspaceId)` / `api.putNotifPrefs(workspaceId, prefs)` — the workspace id rides the request (prefs are workspace-scoped rows; the session still supplies the user)
- `IN.npToggle` restructured to the langSel branch shape (D-07): optimistic write to `S.notifPrefs`, local-mode localStorage persist, API-mode PUT adopting the server's canonical merge, 401 → `projects:save-error`, other failures → `err.notifPrefsSaveFailed` toast; success toast on both branches
- `settings.js` renders `S.notifPrefs` (D-01); the 17 tog rows and coercions untouched; `emitMentions` gates on the per-user object
- `store.js`: `stripLegacyNotifPrefs` in `load()` (T-34-09 client half) and `docSnapshot()` deletes the field before serializing (Pitfall 3); `S.notifPrefs` hydrated from local storage at boot
- `seed.js`: notifPrefs block deleted (D-06); `recentSearches` with 'Sarah' retained for Plan 03's redaction pin
- `test/local-prefs.test.mjs`: 7 tests — defaults, reload survival (fresh module import), per-workspace isolation, whitelist/boolean validation, exception swallowing, and the store-level no-resurrect pin through the real `save()` path

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end prefs path — local module, npToggle branch, settings read, api methods, local pins** - `db1f827` (feat, tracer)
2. **Task 2: Seed block removal + legacy client snapshot strip + docSnapshot exclusion** - `47775be` (feat)

Tracer feedback gate: `<verify>` re-run end-to-end after Task 1 — 6/6 local pins green — before Task 2 expanded the surface.

## Files Created/Modified
- `src/core/notifPrefs.js` - the local prefs adapter (created)
- `test/local-prefs.test.mjs` - 7-test local-mode + no-resurrect suite (created)
- `src/core/api.js` - getNotifPrefs/putNotifPrefs
- `src/core/store.js` - S.notifPrefs hydration, stripLegacyNotifPrefs, docSnapshot exclusion
- `src/actions/actions.js` - npToggle branch, emitMentions gating source
- `src/pages/settings.js` - np binding to S.notifPrefs
- `src/data/seed.js` - notifPrefs block removed
- `src/locales/en.json`, `src/locales/fr.json` - err.notifPrefsSaveFailed
- `test/i18n-core-features.test.mjs`, `test/error-codes.test.mjs` - catalogue/allowlist/call-count pins for the new key and methods

## Decisions Made
- Local-mode workspace identity for the prefs key: `D().ws.url` (API mode: `api.workspace.id`) — seed workspaces carry a url, not an id
- emitMentions now reads `S.notifPrefs`: with the seed block gone and the server doc strip active, `D().notifPrefs` was permanently undefined — the rewiring makes client-side mention gating honor the user's stored prefs
- npToggle adopts the server-returned merged prefs on PUT success; no GET-on-load wiring (scoped to the toggle path per plan)
- Added `err.notifPrefsSaveFailed` (en/fr) rather than reusing the saved-success toast text for the error path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] S.notifPrefs needed a home in store.js (Task 1 file list omitted store.js)**
- **Found during:** Task 1
- **Issue:** The plan's optimistic "per-user prefs object held in store state" and the settings binding both need an S field, but store.js was only listed under Task 2
- **Fix:** Added `notifPrefs: getLocalNotifPrefs(saved?.data?.ws?.url)` to S with the local hydration in Task 1
- **Files modified:** src/core/store.js
- **Verification:** settings renders, npToggle persists, 7/7 tests
- **Committed in:** db1f827

**2. [Rule 1 - Bug] stripLegacyNotifPrefs targeted the blob wrapper, not blob.data**
- **Found during:** Task 2
- **Issue:** First draft deleted `blob.notifPrefs`, but the field rides on the doc at `blob.data.notifPrefs` — the no-resurrect pin caught it immediately
- **Fix:** Strip `blob.data.notifPrefs` in load(); docSnapshot deletes `S.data.notifPrefs`
- **Files modified:** src/core/store.js
- **Verification:** no-resurrect pin passes; rewritten blob carries no notifPrefs
- **Committed in:** 47775be

**3. [Rule 1 - Bug] npToggle comment contained the literal "IN.langSel", hijacking a test's source-slice anchor**
- **Found during:** Task 2 (full suite)
- **Issue:** i18n-pages.test.mjs slices actions.js from `indexOf('IN.langSel')` to `A.wsColor`; the comment's mention made the slice include prefSel's `S.prefs`/`save(` and fail "no document write path is reachable from the language handler"
- **Fix:** Reworded the comment to "the langSel shape"
- **Files modified:** src/actions/actions.js
- **Verification:** full suite green
- **Committed in:** 47775be

**4. [Rule 1 - Bug] New locale key required four catalogue pins to move**
- **Found during:** Task 2 (full suite)
- **Issue:** Adding err.notifPrefsSaveFailed tripped the catalogue-size pin (1658→1659), the reverse-parity err.* allowlist, the French D-05 typography rule (straight apostrophe), and the api call-site count pin (40→42 from the two new methods)
- **Fix:** Updated all four pins with 34-04 annotations; French value uses the typographic apostrophe
- **Files modified:** test/i18n-core-features.test.mjs, test/error-codes.test.mjs, src/locales/fr.json
- **Verification:** npm test 848 pass / 0 fail
- **Committed in:** 47775be

---

**Total deviations:** 4 auto-fixed (4 × Rule 1/3, all test-or-comment corrections surfaced by the existing pin suite). **Impact on plan:** none on behavior — all fixes required for the plan's own acceptance criteria (`npm test` exits 0).

## Issues Encountered
None beyond the deviations above. Pre-existing: 3 suite skips (unchanged).

## Known Stubs
None.

## Threat Surface Scan
No new surface beyond the plan's threat model: the localStorage adapter is the T-34-10 accepted boundary (same-origin, boolean-only prefs, per-workspace keyed); the strip + exclusion implement T-34-09's mitigation with its proving pin. The PUT path reuses the existing Plan-01 route.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Client half of SETTINGS-02 done: one branching adapter, per-workspace local storage, no doc writes, no resurrection — Plan 03's matcher work is unblocked and the seed 'Sarah' term is intact for its redaction pin
- Note for a future plan: API-mode settings could fetch prefs on workspace open (GET method already exists) so the UI shows stored rows before the first toggle

---
*Phase: 34-per-user-settings-isolation-search-leak-closure*
*Completed: 2026-11-03*
