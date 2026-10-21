---
phase: 04-hardening-and-ship
fixed_at: 2026-10-21T20:03:15Z
review_path: .planning/phases/04-hardening-and-ship/04-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-10-21T20:03:15Z
**Source review:** `.planning/phases/04-hardening-and-ship/04-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 12
- Fixed: 12
- Skipped: 0

## Fixed Issues

### CR-01: `recentSearches` leaks private project names to non-members

**Files modified:** `server.js`, `CHANGELOG.md`, `DEPLOY.md`
**Commit:** `2201ad6`
**Applied fix:** `redactDoc` now derives the hidden projects' names and keys before filtering
`data.projects`, and drops any recent-search term that contains one of them (case-insensitive,
non-string entries are skipped rather than throwing). The write path merges recent searches with
the stored list: a caller who cannot see every project keeps the stored history, so a redacted
document can neither erase nor rewrite it, and a term naming a hidden project cannot be injected.
Per-user storage was intentionally not attempted in this release; the workspace-wide list and the
substring redaction are documented as a known limit in `CHANGELOG.md` and `DEPLOY.md`.

### WR-01: Saved-view project filters still expose hidden project ids

**Files modified:** `server.js`
**Commit:** `c51c659`
**Applied fix:** Extracted `scrubProjectFilters(filters, hiddenProjects)` and used it for
`redactViews`, `data.savedViews` on read, the saved-view write merge and the per-user view-state
merge. A workspace-level saved view now serves `[{ "f": "project", "v": ["p_pub"] }]` instead of
retaining a hidden project id, and the scrub is re-applied on every save.

### WR-02: A malformed session cookie returns HTTP 500 instead of 401

**Files modified:** `server.js`
**Commit:** `d17e262`
**Applied fix:** `parseCookies` wraps `decodeURIComponent` in a `try`/`catch` and skips a value
that cannot be decoded, so a corrupted `gr8r_session` cookie is treated as unauthenticated.

### WR-03: An ambient `DB_PATH` silently redirects the test suites to a real database

**Files modified:** `test/helpers/server.mjs`, `e2e/server.mjs`, `test/harness.test.mjs`
**Commit:** `f52e8df`
**Applied fix:** Both harnesses now set `DB_PATH` to `<temp data dir>/gr8r.db` after the
environment spread, so an exported or caller-supplied `DB_PATH` cannot redirect them. Added
`test/harness.test.mjs`, which starts a server with an ambient `DB_PATH` and asserts the database
is created inside the harness data directory and the ambient path is untouched.

### WR-04: The "exact pre-tenancy" fixture uses a task key the app never wrote

**Files modified:** `test/helpers/legacy-fixture.mjs`, `test/migration.test.mjs`
**Commit:** `b66d8fc`
**Applied fix:** The fixture task now uses `project: 'p_keep'`. The migration test asserts the
real key and the client resolution path (`tasks.filter(t => t.project === 'p_keep')`), both in the
stored document and in the document served to the migrated owner.

### WR-05: The e2e suite can silently reuse a Vite preview server on port 4173

**Files modified:** `e2e/playwright.config.mjs`, `e2e/server.mjs`, `e2e/helpers/setup.mjs`
**Commit:** `c0a4390`
**Applied fix:** The default `E2E_PORT` is now `4317` in all three files (no longer Vite preview's
`4173`), and `reuseExistingServer` is opt-in via `E2E_REUSE_SERVER === 'true'` instead of being on
whenever `CI` is unset.

### WR-06: Documented environment knobs are inert in the shipped Compose deployment

**Files modified:** `docker-compose.yml`
**Commit:** `167b9b5`
**Applied fix:** Compose now forwards `WORKSPACE_SLUG: ${WORKSPACE_SLUG:-}`,
`MAX_BODY_BYTES: ${MAX_BODY_BYTES:-8388608}` and `TRUST_PROXY: ${TRUST_PROXY:-true}`, matching the
defaults documented in `.env.example` and `DEPLOY.md`.

### WR-07: DEPLOY.md says there is no invite revoke UI, contradicting the code and itself

**Files modified:** `DEPLOY.md`
**Commit:** `961f471`
**Applied fix:** Replaced the "There is no revoke UI" paragraph with the per-invite **Revoke**
button as the normal path, and relabelled the SQL snippet as the bulk emergency procedure for
invalidating every pending link at once.

### WR-08: Release version and image tag disagree, and the documented rollback cannot work

**Files modified:** `docker-compose.yml`, `DEPLOY.md`
**Commit:** `ff25e79`
**Applied fix:** The compose image is now `gr8r-studio:1.1.0`, and the restore procedure references
the same tag. The upgrade records the running container's image id
(`docker inspect --format '{{.Image}}' gr8r-studio`) before rebuilding; the rollback re-tags that
id as `gr8r-studio:rollback`, points Compose at it for the rollback and reverts the compose line
afterwards.

### WR-09: The command palette crashes on a workspace document without `recentSearches`

**Files modified:** `server.js`, `src/core/store.js`, `src/overlays/palette.js`, `src/pages/search.js`
**Commit:** `d232a16`
**Applied fix:** `normalizeDoc` defaults `savedViews` and `recentSearches` to arrays server-side,
`applyDoc` does the same when a document is applied, and the palette and search page fall back to
`[]` at their read sites (including the recent-search write in the palette).

### IN-01: The privacy test's needle list cannot catch the two leaks above

**Files modified:** `test/privacy.test.mjs`
**Commit:** `2f00465`
**Applied fix:** The fixture now seeds recent searches naming the private project and its key plus
a workspace-level saved view whose filters include a hidden id. The privacy suite asserts the
served `recentSearches` are scrubbed, every served saved view is free of hidden project ids, and a
dedicated test proves a non-member cannot erase or rewrite hidden-project search history on save.

### IN-02: Palette suggestions hard-code the demo's `p1` project id

**Files modified:** `src/overlays/palette.js`
**Commit:** `69772ab`
**Applied fix:** The "Suggested" group now derives its project from the current document (`p1`
when present, otherwise the first project) and only pushes the project-specific entries when that
project exists, using its real id and name.

## Verification

All gates ran in the main checkout (`.`), because `.planning/config.json` sets
`workflow.use_worktrees: false` for this repository.

| Gate                 | Result                                                      |
| -------------------- | ----------------------------------------------------------- |
| `npm run lint`       | pass                                                        |
| `npm run format:check` | pass                                                      |
| `npm test`           | 44/44 pass (was 42; +harness isolation, +recent-search test) |
| `npm run build`      | pass                                                        |
| `npm run e2e`        | 4/4 pass                                                    |

## Notes

- CR-01's interim redaction is substring-based, so it is inherently lossy and does not track
  renames; it removes the release-blocking leak and is covered by regression tests, but it is not
  a substitute for the per-user `recentSearches` migration planned next release.
- No findings were skipped and no uncommitted changes remain.

---

_Fixed: 2026-10-21T20:03:15Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
