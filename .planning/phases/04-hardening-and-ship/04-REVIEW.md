---
phase: 04-hardening-and-ship
reviewed: 2026-10-21T19:52:32Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - .env.example
  - .github/workflows/ci.yml
  - .gitignore
  - .nvmrc
  - .prettierignore
  - CHANGELOG.md
  - DEPLOY.md
  - README.md
  - e2e/helpers/setup.mjs
  - e2e/playwright.config.mjs
  - e2e/server.mjs
  - e2e/tenancy.spec.mjs
  - eslint.config.js
  - package.json
  - server.js
  - src/actions/actions.js
  - src/core/store.js
  - src/data/seed.js
  - src/overlays/palette.js
  - src/overlays/popovers.js
  - test/demo-workspace.test.mjs
  - test/helpers/legacy-fixture.mjs
  - test/helpers/server.mjs
  - test/membership.test.mjs
  - test/migration.test.mjs
  - test/privacy.test.mjs
  - test/tenancy.test.mjs
findings:
  critical: 1
  warning: 9
  info: 2
  total: 12
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-10-21T19:52:32Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

The hardening-and-ship phase adds a real multi-tenant server path, a Node test harness, a
Playwright e2e suite and the deployment documentation. The implementation is generally careful:
redaction is structural rather than field-by-field, writes merge hidden rows back instead of
trusting the client, and the suites boot real `server.js` processes. I ran `npm run lint`,
`npm run format:check`, `npm test` (42/42 pass) and `npm run e2e` (4/4 pass), then probed the
isolation boundary directly.

Two isolation gaps survive the redaction pass, and one is a genuine data leak: `data.recentSearches`
is workspace-wide and never scrubbed, so a non-member of a private project receives that project's
name in their served document. The published promise in `CHANGELOG.md:23-25` is explicit — a private
project and "everything that references it … saved views, project filters" must be omitted — so this
is release-blocking, not cosmetic. The test suite does not catch it because its needle list omits
both `recentSearches` and saved-view filters.

Beyond isolation, the deployment surface has drift between what `.env.example`/`DEPLOY.md` document
and what `docker-compose.yml` actually forwards, a documented rollback that cannot work with a
hard-coded image tag, a DEPLOY claim ("no revoke UI") that contradicts both the code and the same
document, and two test-infrastructure defects that can make the suites test the wrong database.

## Narrative Findings (AI reviewer)

### CR-01: `recentSearches` leaks private project names to non-members

**Severity:** Critical
**File:** `server.js:357-375` (`redactDoc`), surfaced at `src/overlays/palette.js:110` and `src/pages/search.js:44`

**Issue:** `data.recentSearches` is a workspace-wide array of free-text search terms, and `redactDoc`
never touches it. It is seeded and stored as a first-class field (`server.js:679`), written by the
command palette (`src/overlays/palette.js:188-189`), and rendered verbatim to every workspace member
in the palette and on the search page. Because search terms are typed by whoever is working on a
project, a term such as a private project's name becomes visible to every member of the workspace.

Verified against a live server: a non-member's `GET /api/workspaces/acme` returned

```json
"projects": [],
"recentSearches": ["Classified Nebula", ...]
```

while `test/privacy.test.mjs` asserts (line 231) that "a member never receives a private project or
anything that references it". The write path has the same gap in reverse: `recentSearches` is not
merged through `mergeList`, so any member's save replaces the whole array, letting a non-member erase
or rewrite other members' search history. This directly contradicts the release note in
`CHANGELOG.md:23-25`.

**Fix:** The durable fix is to stop treating recent searches as workspace data — scope them per user,
the way view state already is (`doc.views` is keyed by user/workspace). If that is too large for this
release, redact as an interim measure in `redactDoc`:

```js
// after hiddenProjects is computed
const hiddenNames = (doc.data.projects || [])
  .filter(p => p?.id && hiddenProjects.has(p.id))
  .flatMap(p => [p.name, p.key].filter(Boolean))
  .map(n => String(n).toLowerCase());

if (Array.isArray(data.recentSearches)) {
  data.recentSearches = data.recentSearches.filter(
    s => typeof s !== 'string' || !hiddenNames.some(n => s.toLowerCase().includes(n)),
  );
}
```

Substring matching is inherently lossy (and misses renames), so pair it with the per-user move in the
next release. Add both names to the privacy-test needle list (see IN-01).

---

### WR-01: Saved-view project filters still expose hidden project ids

**Severity:** Warning
**File:** `server.js:373` (read), `server.js:467-468` (write); compare `redactViews` at `server.js:336-354`

**Issue:** `redactViews` scrubs `filters[].v` for hidden project ids, but that logic is only applied to
`doc.views`. `data.savedViews` is filtered by its own `project` field only (`server.js:373`), and its
`filters` array is copied through untouched. A workspace-level saved view (one with no `project`, e.g.
a board filtered across projects) therefore keeps `{"f":"project","v":["p_secret"]}` in the document
served to non-members. Verified against a live server: `savedViews[].filters` retained the hidden
project id while `projects` was empty. The write path is equally unguarded — `mergeList` at line 468
restores hidden *views* but never scrubs filters on visible ones — so the ids are re-persisted on
every save. `CHANGELOG.md:23-25` promises that "project filters" are omitted.

**Fix:** Extract the filter scrubber and use it in both places:

```js
function scrubProjectFilters(filters, hiddenProjects) {
  if (!Array.isArray(filters)) return filters;
  return filters
    .map(f => {
      if (!f || f.f !== 'project' || !Array.isArray(f.v)) return f;
      const v = f.v.filter(id => !hiddenProjects.has(id));
      return v.length ? { ...f, v } : null;
    })
    .filter(Boolean);
}
```

Then in `redactDoc`, after line 373:

```js
data.savedViews.forEach(v => { if (v) v.filters = scrubProjectFilters(v.filters, hiddenProjects); });
```

and in the merge at line 468, apply the same helper to `nextData.savedViews`. `redactViews` can then
call the shared helper instead of duplicating the map/filter block.

---

### WR-02: A malformed session cookie returns HTTP 500 instead of 401

**Severity:** Warning
**File:** `server.js:965-973` (`parseCookies`), reached from `server.js:987` (`currentUser`)

**Issue:** `decodeURIComponent(part.slice(i + 1).trim())` throws `URIError` on malformed percent-encoding,
and `parseCookies` has no guard. A request with `Cookie: gr8r_session=%` therefore throws inside
`currentUser`, which is called by `requireUser` on every authenticated route. Verified against a live
server: `GET /api/auth/me` and `GET /api/workspaces/acme` both returned **500** with that header.
Any client with a truncated or corrupted cookie (proxies, stale browser data, scanners) sees a server
error instead of a clean "sign in again", and every such request writes a stack trace to the log.

**Fix:**

```js
function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    let value;
    try {
      value = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      continue; // malformed cookie: ignore it, the request is simply unauthenticated
    }
    out[part.slice(0, i).trim()] = value;
  }
  return out;
}
```

---

### WR-03: An ambient `DB_PATH` silently redirects the test suites to a real database

**Severity:** Warning
**File:** `test/helpers/server.mjs:16-25` and `:50-54`; same pattern in `e2e/server.mjs:26-38`

**Issue:** `BASE_ENV` sets `DATA_DIR` but not `DB_PATH`, and the child is spawned with
`{ ...process.env, ...BASE_ENV, ... }`. `server.js:53` resolves `DB_PATH` *before* falling back to
`DATA_DIR`, so a developer (or CI runner) with `DB_PATH` exported gets a server that ignores the
harness's temporary directory and opens the exported database instead. The harness then reports
`dbPath: path.join(dir, 'gr8r.db')` for a file that was never created, and every `withDb` assertion
reads an empty database — or worse, the suite mutates a developer's real workspace. Verified: with
`DB_PATH` exported, `startServer()` produced no database in its temp `dataDir` and wrote to the
ambient path.

**Fix:** Force the path in both harnesses and make the override absolute:

```js
env: {
  ...process.env,
  ...BASE_ENV,
  PORT: String(port),
  DATA_DIR: dir,
  DB_PATH: path.join(dir, 'gr8r.db'), // DB_PATH wins over DATA_DIR in server.js
  ...env,
},
```

Apply the same change in `e2e/server.mjs` (add `DB_PATH: path.join(dataDir, 'gr8r.db')`). If callers
must be able to override it, at least assert that the resolved `DB_PATH` starts with the temp dir
before returning.

---

### WR-04: The "exact pre-tenancy" fixture uses a task key the app never wrote

**Severity:** Warning
**File:** `test/helpers/legacy-fixture.mjs:114`, asserted in `test/migration.test.mjs:97`

**Issue:** The fixture claims to be "a real pre-tenancy database: the exact single-workspace schema and
rows that existed before the multitenant milestone" (lines 1-2), but its task row uses
`projectId: 'p_keep'`. The application has always stored a task's project as `project` — `seed.js`,
`store.js` (`tasksOf`, `logAct`), the privacy fixtures and every redaction filter in `server.js`
(`t.project`) read that key. `projectId` appears nowhere in production code. The migration test then
asserts `tasks.find(...).projectId === 'p_keep'`, so it enshrines the wrong field and would happily
pass even if migration dropped or renamed the real `project` field. The "preserved workspace" test
that follows only checks sign-in and listing, not that the task is visible after migration.

**Fix:** Change line 114 to `project: 'p_keep'` and line 97 to
`assert.equal(doc.data.tasks.find(t => t.id === 't_keep')?.project, 'p_keep')`. Add one assertion that
the migrated document still resolves the task through the same path the client uses (e.g.
`tasks.filter(t => t.project === 'p_keep')` returns `t_keep`), which is what the fixture is meant to
prove.

---

### WR-05: The e2e suite can silently reuse a Vite preview server on port 4173

**Severity:** Warning
**File:** `e2e/playwright.config.mjs:5` and `:27`; `e2e/server.mjs:15`; `e2e/helpers/setup.mjs:16`

**Issue:** The suite defaults to port `4173`, which is Vite preview's default port, and sets
`reuseExistingServer: !process.env.CI`. A developer who ran `npm run preview` before `npm run e2e`
(locally, as the README instructs for checking a build) has a server on that port; Playwright probes
`/api/health`, and Vite's SPA fallback answers unknown paths with `index.html` and a 200, so the probe
succeeds and Playwright reuses the plain preview server. The fixtures then fail with confusing
`/api/auth/login` errors, or worse, the suite exercises static assets with no API at all. The failure
is environment-dependent and does not reproduce in CI, which is exactly the kind of flake that gets
misdiagnosed.

**Fix:** Move the default to a port the app never uses in development (e.g. `4317`) and do not reuse
by default:

```js
const PORT = Number(process.env.E2E_PORT || 4317);
// ...
reuseExistingServer: process.env.E2E_REUSE_SERVER === 'true',
```

Keep the same constant in `e2e/server.mjs` and `e2e/helpers/setup.mjs` so the three cannot drift.

---

### WR-06: Documented environment knobs are inert in the shipped Compose deployment

**Severity:** Warning
**File:** `docker-compose.yml:8-35`; documented at `.env.example:24,78-85`, `DEPLOY.md:148,155-156,163-170`

**Issue:** Three variables that the docs present as operator controls are not forwarded to the
container:

- `WORKSPACE_SLUG` (`.env.example:24`, `DEPLOY.md:148`) — the compose `environment` block forwards
  `WORKSPACE_NAME` but not `WORKSPACE_SLUG`, so the documented first-boot URL is silently ignored and
  the slug is derived from the name. An operator who sets `WORKSPACE_SLUG=studio` gets `/w/gr8r-studio`.
- `MAX_BODY_BYTES` (`.env.example:83-85`, `DEPLOY.md:168-170`) — not forwarded at all, so the
  documented "raise it if a workspace grows past 8 MiB" advice cannot be followed without editing the
  compose file.
- `TRUST_PROXY` — hard-coded to `'true'` at line 34, so the documented escape hatch
  (`DEPLOY.md:163-166`, "set it to `false` when nothing proxies the app") is unreachable through
  `.env`. An operator who needs direct exposure cannot disable spoofable `X-Forwarded-*` handling.

These are the three variables the changelog specifically calls out as newly documented
(`CHANGELOG.md:39-41`), which makes the gap between docs and deployment more likely to be trusted.

**Fix:** Forward them with the documented defaults:

```yaml
WORKSPACE_SLUG: ${WORKSPACE_SLUG:-}
MAX_BODY_BYTES: ${MAX_BODY_BYTES:-8388608}
TRUST_PROXY: ${TRUST_PROXY:-true}
```

---

### WR-07: DEPLOY.md says there is no invite revoke UI, contradicting the code and itself

**Severity:** Warning
**File:** `DEPLOY.md:432` versus `DEPLOY.md:386-388`, `src/pages/members.js:63`, `src/actions/actions.js:1739`, `src/core/api.js:240`

**Issue:** Line 432 states: "There is no revoke UI; let links expire. To invalidate every pending link
immediately, delete them from the database and restart." This is false. `src/pages/members.js:63`
renders a **Revoke** button for every pending invite; `actions.js:1739` calls
`api.revokeInvite(id)`; the server implements the endpoint and returns `{ revoked: true }`
(`server.js:1481`). The same document says the opposite eight lines earlier (387: "revoking it
invalidates the link immediately"). The paragraph is left over from a pre-implementation draft, and an
operator who trusts it will either think the feature is missing or run an unnecessary
`delete from invites` that bypasses the UI.

**Fix:** Delete the "There is no revoke UI" paragraph. Keep the SQL snippet only as a labelled bulk
emergency procedure ("To invalidate *every* pending link at once…"), and mention the per-invite
**Revoke** button as the normal path.

---

### WR-08: Release version and image tag disagree, and the documented rollback cannot work

**Severity:** Warning
**File:** `docker-compose.yml:4`, `DEPLOY.md:347-363`, `DEPLOY.md:505`, `package.json:3`

**Issue:** The release is `1.1.0` (`package.json`, `CHANGELOG.md:8`, `DEPLOY.md:326`), but the compose
service pins `image: gr8r-studio:1.0.0`. Two consequences:

1. The upgrade procedure at `DEPLOY.md:347-363` tells the operator to "note the tag you are replacing"
   and later "redeploy the previous image tag" — but `docker compose up -d --build` rebuilds *into the
   same tag* (`1.0.0`). The previous image is untagged, and `1.0.0` now points at the new build, so
   there is no previous tag to redeploy.
2. `DEPLOY.md:505` (restore) hard-codes `gr8r-studio:1.0.0`, so the documented restore path depends on
   the drifted tag rather than the running version.

The result is that the one recovery path the phase ships (a pre-migration backup plus a rollback) is
documented but not executable as written.

**Fix:** Tag the release correctly (`image: gr8r-studio:1.1.0`) and make rollback identity-based:

```sh
# before upgrading
docker image inspect --format '{{.Id}}' gr8r-studio:1.1.0 > /tmp/previous-image-id
# rollback
docker tag "$(cat /tmp/previous-image-id)" gr8r-studio:rollback
# set image: gr8r-studio:rollback temporarily, or docker run that id
```

At minimum, replace `1.0.0` with the current version in both compose and DEPLOY.md and change the
rollback text to reference the image id, not the tag.

---

### WR-09: The command palette crashes on a workspace document without `recentSearches`

**Severity:** Warning
**File:** `src/overlays/palette.js:110`; same unguarded read at `src/pages/search.js:44`

**Issue:** Both render sites call `D().recentSearches.map(...)` / `.recentSearches.map(...)` with no
fallback. The server's canonical document normaliser (`normalizeDoc` at `server.js:262-269`) creates
`recentSearches` only in `emptyDoc` (`server.js:664-699`, the new-workspace path); for an existing
document it passes `data` through untouched. A workspace restored from a pre-feature backup, or any document saved
by an older client, therefore has no `recentSearches`, and opening the palette or the search page
throws `TypeError: Cannot read properties of undefined (reading 'map')` — which, in this app, blanks
the overlay rather than degrading.

**Fix:** Guard at the read sites, or better, default the collection centrally when a document is
applied:

```js
// store.js applyDoc
S.data.recentSearches = Array.isArray(S.data.recentSearches) ? S.data.recentSearches : [];
S.data.savedViews = Array.isArray(S.data.savedViews) ? S.data.savedViews : [];
```

and in `normalizeDoc`, add the same defaults server-side so a malformed write cannot persist the gap.

---

### IN-01: The privacy test's needle list cannot catch the two leaks above

**Severity:** Info
**File:** `test/privacy.test.mjs:231-242`

**Issue:** The test claims "a member never receives a private project or anything that references it"
but only searches for `p_sec`, `t_sec`, `c_sec`, `f_sec`, `a_sec`, `n_sec`, `e_sec`, `sv_sec`,
`Classified Nebula` and `Secret task`. It never inspects `data.recentSearches` (which is how
`Classified Nebula` is present in the served document) and never inspects
`data.savedViews[].filters` (only the per-user `views.tasks.filters` at line 238). Both CR-01 and
WR-01 pass this suite today.

**Fix:** Extend the assertions:

```js
assert.deepEqual(bobView.doc.data.recentSearches, [], 'no recent search references a hidden project');
for (const v of bobView.doc.data.savedViews) {
  const ids = (v.filters || []).flatMap(f => (f.f === 'project' && Array.isArray(f.v) ? f.v : []));
  assert.equal(ids.includes('p_sec'), false, `saved view ${v.id} has no hidden project filter`);
}
```

### IN-02: Palette suggestions hard-code the demo's `p1` project id

**Severity:** Info
**File:** `src/overlays/palette.js:125-133`

**Issue:** The "Suggested" group is static and points at `p1` ("Website Redesign") for both
"High priority in Website Redesign" and "Files in Website Redesign". `p1` exists only in the bundled
demo seed. In any real workspace — including the seeded server workspace, which also happens to use
`p1`, and every workspace created after signup — the second entry navigates to a project id that does
not exist, landing the user on an empty project route. This is pre-existing code, but the phase is the
point at which the app stopped being demo-only.

**Fix:** Derive the suggestions from the current document, or drop them when the target is absent:

```js
const p = D().projects?.find(x => x.id === 'p1') || D().projects?.[0];
// only push the suggestion when p exists, and use p.id / p.name
```

---

_Reviewed: 2026-10-21T19:52:32Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
