---
phase: 34-per-user-settings-isolation-search-leak-closure
verified: 2026-11-03T13:05:00Z
status: human_needed
score: 15/15 must-haves verified
behavior_unverified: 0
covered_files:
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-01-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-01-SUMMARY.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-02-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-02-SUMMARY.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-03-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-03-SUMMARY.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-04-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-04-SUMMARY.md
  - server.js
  - src/lib/redaction.js
  - src/core/notifPrefs.js
  - src/core/store.js
  - src/core/api.js
  - src/actions/actions.js
  - src/pages/settings.js
  - src/data/seed.js
  - test/notif-prefs.test.mjs
  - test/migration.test.mjs
  - test/redaction.test.mjs
  - test/local-prefs.test.mjs
  - test/scope.test.mjs
covered_digest: "v2:sha256:1ee6c2acf9ee5903048c5ccd63803a7cdc8302c7f1294d59eee155f832ee53b9"
behavior_unverified_items: []
human_verification:
  - test: "Open the settings page in API mode as two different users of the same workspace and toggle prefs for each"
    expected: "Each user sees their own stored prefs after their first toggle; the two users' toggles stay independent (no shared state)"
    why_human: "UI rendering and per-user visual differentiation can't be asserted by grep; server-side independence is test-pinned but the rendered page is not"
  - test: "In API mode, open settings BEFORE toggling anything"
    expected: "KNOWN LIMITATION (Plan 04, ApiModeUX, human_judgment): the page shows all-ON defaults, not the user's stored row, until the first PUT of the session adopts the server merge. Confirm this is acceptable or schedule a fetch-on-workspace-open"
    why_human: "Product-acceptance decision on a deliberately scoped-out hydration path; executor flagged it for human review"
  - test: "In local mode, toggle a pref, reload the page, switch to another local workspace and back"
    expected: "Prefs survive reload, no bleed between local workspaces (per-workspace localStorage keys)"
    why_human: "Browser localStorage + reload behavior is outside node test reach (local-prefs.test.mjs covers the adapter logic, not the live page)"
re_verification:
  previous_status: human_needed
  previous_score: 15/15
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  note: "Report had gone stale only because src/actions/actions.js carries an uncommitted comment-only reword (the 401-path comment now reads 'the langSel shape'). Diff inspected: zero code change; IN.npToggle wiring identical. Digest recomputed over current on-disk content. All suites re-ran this session."
---

# Phase 34: Per-User Settings Isolation & Search Leak Closure — Verification Report

**Phase Goal:** Notification preferences stop living in the shared workspace document and become real per-user rows (`user_notif_prefs`, additive guarded migration, byte-identical second boot) with one accessor for every consumer; `invoices` pinned out; the substring recent-search leak closed by tokenized `referencesHidden`.
**Verified:** 2026-11-03T13:05:00Z
**Status:** human_needed (UI/UX acceptance only — all technical truths verified)
**Re-verification:** Yes — after stale-report detection (uncommitted comment-only reword in src/actions/actions.js)

## Why Re-Verification

The previous report's `covered_digest` no longer matched disk: `src/actions/actions.js` has an uncommitted diff. The full diff was inspected this session — it is a **comment-only reword** inside the `IN.npToggle` doc comment (`401 rides the session-expired path like IN.langSel` → `401 rides the session-expired path (the langSel shape)`). No executable line changed; wiring, branching, and state handling are byte-identical. The current on-disk content is what was verified below, and the digest was recomputed accordingly.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `notifPrefs` lives as per-user rows after a guarded backfill; second boot byte-identical; doc no longer carries the field | ✓ VERIFIED | `migrateUserNotifPrefs` (server.js:1912) — JS guard, `vacuum into` backup gate, one `begin immediate` tx copying every member + `delete stripped.data.notifPrefs`. Tests: migration.test.mjs "first boot backfills…", "second boot leaves user_notif_prefs byte-identical", "second boot is a no-op" — 37/37 pass (re-ran this session, 5.3s) |
| 2 | Every consumer reads through one accessor `getUserNotifPrefs`; stale-client doc writes stripped not merged; two users differ | ✓ VERIFIED | server.js:1152 the only prefs reader; reminder gate :1373 and `queueNotifEmails` :1225 both resolve per recipient via memberships map; `normalizeDoc` :646 and `mergeClientDoc` :1489 strip. notif-prefs.test.mjs 10/10 pass incl. "PUT carrying notifPrefs has the field dropped" and per-user routing |
| 3 | PUT stores (workspace_id, user_id) keyed on the SESSION user; GET returns defaults merged under stored row; 17-key whitelist 400 + Boolean coercion | ✓ VERIFIED | server.js:3182–3219 — `user.id` from `requireUser`, `NOTIF_PREF_KEYS` loop → 400 `unknownPrefKey`, `Boolean()` coercion, no-oracle 404 for non-members. Pinned in notif-prefs.test.mjs (unknown-key 400, boolean coercion, merged GET) |
| 4 | `invoices` never re-enters the workspace document write path — pinned, no migration | ✓ VERIFIED | migration.test.mjs:1005 "SETTINGS-03: a doc carrying invoices hydrates and the field is gone after a write" — pass in the 37/37 run |
| 5 | Corrupt doc blob never crashes the boot; eligibility guard false forever after first migrating boot; later joiners read defaults | ✓ VERIFIED | try/catch per doc (server.js:1923), guard requires a member lacking a row. Pinned: "corrupt doc skipped without crashing the boot (T-34-05)" and "a later workspace joiner reads the all-default prefs (D-11)" — pass |
| 6 | Full-token collision drops, substring-only collision ("Sara Corp" vs hidden "Sarah") survives | ✓ VERIFIED | src/lib/redaction.js `referencesHidden` — token-set intersection, no `includes`. 22-test table in test/redaction.test.mjs rows (a)/(b) + end-to-end scope.test.mjs D-13 pin (`["sarah smith","Sara Corp"]` → `["Sara Corp"]`) — pass |
| 7 | NFC+toLowerCase both sides; Café ≠ cafe; NFC/NFD variants match identically; no diacritic stripping, no Intl casefold | ✓ VERIFIED | redaction.js:20 `.normalize('NFC').toLowerCase()` split on `[^\p{L}\p{N}]+`; server.js:892 hiddenProjectTerms NFC-normalizes. Table rows for Café≠cafe and NFC/NFD both directions — pass |
| 8 | Recent searches remain one workspace-wide list (D-15), explicitly pinned | ✓ VERIFIED | test/redaction.test.mjs D-15 source-assertion pin on the `redactDoc` filter shape + absence of any per-user side table — pass |
| 9 | Residual free-text limitation documented in CHANGELOG.md | ✓ VERIFIED | CHANGELOG.md:30 "Recent-search redaction is token-boundary exact (SEARCH-01)" with residual note |
| 10 | Backstops: non-string terms / empty or hostile hidden lists never throw or drop | ✓ VERIFIED | redaction.js type guards; redaction.test.mjs backstop tests (null/42/{}/non-array hiddenTerms) — pass |
| 11 | Settings toggle persists through exactly one branch: api.enabled → PUT /api/me/notif-prefs, else per-workspace localStorage — never a doc write | ✓ VERIFIED | actions.js:2685–2702 (current on-disk content incl. reworded comment) single `IN.npToggle` handler with one `if (!api.enabled)` branch; optimistic write lands on `S.notifPrefs` store state only; no `D().notifPrefs` write anywhere |
| 12 | Settings page renders `S.notifPrefs`, not `d.notifPrefs`; seed carries no notifPrefs block | ✓ VERIFIED | settings.js:169 `const np = S.notifPrefs`; seed.js: 0 `notifPrefs` occurrences; recentSearches 'Sarah' retained for the D-13 fixture |
| 13 | Legacy localStorage blob cannot resurrect doc notifPrefs (strip on load + docSnapshot exclusion) | ✓ VERIFIED | store.js:39 `delete blob.data.notifPrefs` on load, :123 `delete S.data.notifPrefs` in docSnapshot; local-prefs.test.mjs pin — 7/7 pass |
| 14 | Local mode: per-workspace key (`projects.notifPrefs.` + ws id), all-ON defaults when absent, whitelist sanitize, survives reload | ✓ VERIFIED | notifPrefs.js:41,58,67; local-prefs.test.mjs defaults/isolation/whitelist/reload pins — pass (browser-level reload behavior routed to human) |
| 15 | 34-01 backstop truths: no-row reads defaults; two equal rows stay distinct (no collapse) | ✓ VERIFIED | accessor `{...DEFAULTS, ...stored}`; PK (workspace_id,user_id) makes collapse structurally impossible; `insert or replace` is per-row — notif-prefs.test.mjs pass |

**Score:** 15/15 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js: user_notif_prefs DDL | composite PK ws+user | ✓ VERIFIED | :300 `create table if not exists user_notif_prefs` |
| server.js: getUserNotifPrefs | only reader | ✓ VERIFIED | :1152; all 3 consumer call sites route through it |
| server.js: GET/PUT /api/me/notif-prefs | session-keyed, whitelist | ✓ VERIFIED | :3182/:3195, requireUser + sameOrigin + readJson |
| server.js: migrateUserNotifPrefs | in boot sequence | ✓ VERIFIED | :1816 `migrateUserNotifPrefs(db)` after migrateTeamMembership |
| src/lib/redaction.js | pure tokenize + referencesHidden | ✓ VERIFIED | 38 lines, exports only these two; server imports at :58 |
| src/core/notifPrefs.js | localStorage adapter | ✓ VERIFIED | imported by store.js:6 and actions.js:8 |
| src/core/api.js getNotifPrefs/putNotifPrefs | client methods | ✓ VERIFIED | used by actions.js:2693 npToggle (current disk content) |
| src/core/store.js strip | load strip + snapshot exclusion | ✓ VERIFIED | :39, :123 |
| src/pages/settings.js np binding | S.notifPrefs | ✓ VERIFIED | :169 |
| test/notif-prefs.test.mjs | server integration suite | ✓ VERIFIED | 10/10 pass (re-ran) |
| test/migration.test.mjs | migration pins incl. SETTINGS-03 invoice pin | ✓ VERIFIED | 37/37 pass (re-ran) |
| test/redaction.test.mjs | 22-test table suite | ✓ VERIFIED | 22/22 pass (re-ran) |
| test/local-prefs.test.mjs | 7-test local suite | ✓ VERIFIED | 7/7 pass (re-ran) |
| CHANGELOG.md | SEARCH-01 note | ✓ VERIFIED | line 30 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| reminder gate | getUserNotifPrefs per task assignee | memberships map → user_id | ✓ WIRED | server.js:1373 |
| queueNotifEmails | getUserNotifPrefs per recipient | authority.get(n.to) | ✓ WIRED | server.js:1225 |
| normalizeDoc / mergeClientDoc | notifPrefs strip both directions | delete out.data.notifPrefs | ✓ WIRED | server.js:646, :1489 |
| boot sequence | migrateUserNotifPrefs | migration chain | ✓ WIRED | server.js:1816 |
| mergeRecentSearches + redactDoc | referencesHidden | ES import | ✓ WIRED | server.js:58, :908, :913, :941 |
| npToggle | PUT /api/me/notif-prefs or localStorage | api.enabled branch | ✓ WIRED | actions.js:2690/:2693 — verified against current on-disk content (reword is comment-only) |
| settings.js np | S.notifPrefs store object | store render | ✓ WIRED | settings.js:169 |
| store load/docSnapshot | legacy strip | stripLegacyNotifPrefs + delete | ✓ WIRED | store.js:39, :123 |

### Behavioral Spot-Checks

All five suites were re-executed this session (Step 7b re-run for re-verification):

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server prefs routes + double strip | `node --test test/notif-prefs.test.mjs` | 10 pass / 0 fail | ✓ PASS |
| Guarded backfill, byte-identical reboot, corrupt doc, invoices pin | `node --test test/migration.test.mjs` | 37 pass / 0 fail | ✓ PASS |
| Tokenized matcher table + backstops | `node --test test/redaction.test.mjs` | 22 pass / 0 fail | ✓ PASS |
| Local adapter defaults/isolation/whitelist | `node --test test/local-prefs.test.mjs` | 7 pass / 0 fail | ✓ PASS |
| D-13 e2e + D-15 pin + regression scope | `node --test test/scope.test.mjs` | 79 pass / 3 pre-existing skips / 0 fail | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SETTINGS-01 | 34-01, 34-02 | notifPrefs → per-user rows, additive guarded migration, byte-identical reboot, doc stripped | ✓ SATISFIED | Truths 1–5; migration + notif-prefs suites pass |
| SETTINGS-02 | 34-01, 34-04 | All consumers through one accessor; per-user isolation; client branching adapter | ✓ SATISFIED | Truths 2, 11–14 |
| SETTINGS-03 | 34-02 | invoices stays out, write-path pin, no migration | ✓ SATISFIED | Truth 4; migration.test.mjs:1005 pin passes |
| SEARCH-01 | 34-03 | Substring leak closed; tokenized matching; normalization/collision table tests; CHANGELOG note | ✓ SATISFIED | Truths 6–10 |

All 4 phase requirement IDs are claimed by plans and accounted for. No orphaned requirements (REQUIREMENTS.md trace table maps exactly SETTINGS-01..03 + SEARCH-01 to Phase 34, all marked Complete).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/placeholder markers in any phase-modified file | — | Clean |

### Human Verification Required

See frontmatter `human_verification`: (1) two-user per-workspace settings isolation in the live UI, (2) the known API-mode pre-toggle hydration gap the executor flagged for product acceptance, (3) local-mode reload/workspace-switch behavior in a real browser.

### Gaps Summary

None. All server-side, migration, and matcher truths are verified with passing behavioral tests; all wiring and requirement IDs accounted for. The stale-report trigger (uncommitted diff in `src/actions/actions.js`) was inspected and is a comment-only reword with zero behavioral impact — the report was refreshed against current on-disk content and the digest recomputed. The phase routes to `human_needed` solely for UI-level acceptance (the phase carries `UI hint: yes`), including one deliberate scope decision (API-mode prefs hydrate only on first toggle) that the executor itself escalated to human judgment.

---

_Verified: 2026-11-03T13:05:00Z_
_Verifier: the agent (gsd-verifier)_
