---
phase: 01-tenancy-foundation
verified: 2026-10-22T00:00:00Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/core/store.js
  - src/main.js
  - src/overlays/palette.js
  - src/overlays/popovers.js
  - src/pages/auth.js
  - src/pages/settings.js
  - test/helpers/server.mjs
  - test/tenancy.test.mjs
  - test/migration.test.mjs
  - test/membership.test.mjs
  - e2e/tenancy.spec.mjs
  - e2e/helpers/setup.mjs
covered_digest: "v2:sha256:f3fca2f0f8edf8a8986462691691145f63c2ce01cbabd162b2c0bd6cd062f76d"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Tenancy foundation — Verification Report

**Phase Goal:** Schema migration, workspace-scoped document API, `/w/:slug` routing, real workspace
switcher, minimal workspace creation. No private-project redaction yet.
**Deliverable:** two accounts in two workspaces never receive each other's document.
**Verified:** 2026-10-22
**Status:** passed
**Re-verification:** No — initial verification (no prior `*-VERIFICATION.md` in the phase directory)

> Scope note: the working tree is at the end of milestone v1.1 (phases 2–4 are also shipped), so the
> evidence below is drawn from the phase-1 commits (`48e3d9a` schema + API, `52dafcc` client routing,
> `df7acab` docs) **and** from the current tree, which only hardened those paths (membership
> endpoints, private-project redaction, `node:test` suites, Playwright UAT). Every phase-1 feature was
> confirmed present *in the phase-1 commits themselves* (`git show 48e3d9a:server.js` already contains
> `migrateTenancy`, `requireWorkspace`, `addMembership`, `createWorkspace`, `workspaces_slug_idx`;
> `git show 52dafcc:src/main.js` already contains the `/w/:slug` boot path).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | R1 — a workspace is a row in `workspaces` with a unique slug and its own document | ✓ VERIFIED | `server.js:95-104` (workspaces row: `slug`, `color`, `doc`, `revision`), `server.js:141-145` (idempotent `ensureColumn` + `create unique index … workspaces_slug_idx`), `server.js:943-962` (`createWorkspace` inserts slug+doc), `server.js:1246-1256` (GET by slug returns that row's own `doc`). HTTP: `test/tenancy.test.mjs:70-84` "each workspace serves its own document" — acme project present in acme, absent in beta. |
| 2 | R2 — an account can hold several memberships, each with a role per workspace | ✓ VERIFIED | `server.js:105-111` (`memberships` PK `(workspace_id, user_id)`, `role` enum, `member_id`), `server.js:220-229` (`membershipsOf`), `server.js:911-928` (`addMembership`), `server.js:231-251` (`workspacePayload`/`userPayload` carry `role`+`memberId` per workspace). HTTP: `test/tenancy.test.mjs:52-68` (one account owns `acme` **and** `beta`, each with role `owner`). Browser: owner = `[["acme","owner"],["beta","owner"]]`; a second account = `[["beta","member"]]` (switcher rendered the right role per workspace). |
| 3 | R3a — `/w/:slug` addresses a workspace | ✓ VERIFIED | Client: `src/main.js:128-129` (slug parsed from `location.pathname`), `src/main.js:160-172` (slug resolved against `api.workspaces`, fallback to first workspace, `history.replaceState` to `/w/<slug>`), `src/core/api.js:143-159` (`loadWorkspace` → `GET /api/workspaces/:slug`). Server: `server.js:1246-1256`, SPA fallback `server.js:1734-1740` (extensionless paths serve `index.html`). Browser: sign-in lands on `/w/acme`; direct load of `/w/acme` keeps the slug; a foreign slug falls back to the caller's own workspace (`e2e/tenancy.spec.mjs:44-56` — 4/4 Playwright tests green). |
| 4 | R3b — share and invite links are workspace-scoped | ✓ VERIFIED | Share links: `src/actions/actions.js:497-512` (`copy(\`${api.url}/w/${D().ws.url}/…\`)`) — the slug comes from the server-derived `data.ws.url` (`server.js:262-271`). Invites: created per workspace (`server.js:1436-1494`, `invites.workspace_id = ctx.ws.id`), the token resolves to exactly one workspace (`server.js:1544-1558` returns that workspace's name/slug) and accepting joins that workspace (`server.js:1560+`; `test/tenancy.test.mjs:16-22`). *Note:* the invite URL shape stays `/join/<token>` — explicitly required unchanged by `01-SPEC.md:117`; the scoping is carried by the invite record, not by the path. |
| 5 | R4 — every API call is authorised against the caller's membership of that workspace | ✓ VERIFIED | `server.js:1068-1084` (`requireWorkspace`: 404 for unknown slug **or** missing membership, 403 when the role is below the minimum). Every workspace route routes through it: GET `server.js:1247`, PUT `:1258` (member+), PATCH `:1292` (admin+), DELETE `:1319` (owner+), members/leave/invites/plan `:1332-1542`. Route inventory checked — the only unscoped endpoints are `health`, `config`, the three `auth/*` routes and the token-based invite routes (no document is returned by any of them). HTTP: cross-tenant GET/PUT/PATCH all `404` (`test/tenancy.test.mjs:111-125`), viewer PUT `403` (`:127-138`), member PATCH `403` (`:140-164`), anonymous `401` (`:185-194`). |
| 6 | R6 — existing installs migrate in place, without data loss, with a pre-migration backup | ✓ VERIFIED | `server.js:814-844` (`migrateTenancy`): `pragma wal_checkpoint(truncate)` + `vacuum into '<DATA_DIR>/projects-premultitenant-<stamp>.db'` **before** the first write, then slug/name/colour derivation; `server.js:850-854` (invite scoping), `server.js:856-878` (`member_id` backfill, `data.workspaces` dropped, `data.me` nulled, revision bumped once). Proof against a real pre-tenancy database: `test/migration.test.mjs` (7 tests green) — exactly one backup, backup is a genuine pre-rewrite snapshot (`slug`/`color` still null, `data.workspaces` still present), projects/tasks/members preserved, both accounts keep access, second boot is a byte-identical no-op. |
| 7 | Goal — `/w/:slug` routing on the client (boot, refresh, deep link, unknown slug) | ✓ VERIFIED | `src/main.js:92-112` (`applyDeepLink` for `project|task|file|member`), `src/main.js:171-179` (canonical slug + `hydrateFromServer`). Browser (Chromium, real server): sign-in → `/w/acme`; reload keeps `/w/gamma`; direct load of `/w/acme` keeps the slug; foreign slug falls back to the caller's workspace with no foreign project rendered (`e2e/tenancy.spec.mjs`, 4/4 green). |
| 8 | Goal — a **real** workspace switcher (not a demo array) | ✓ VERIFIED | `src/overlays/popovers.js:240-252` (sidebar popover lists `workspaceList()` with each workspace's real name/role and a check on the current slug) and `src/overlays/palette.js:68-80` (command palette, same source). `src/actions/actions.js:1977-1993` (`switchWs` → `openWorkspace` → flush, load, `replaceState`, `go('home')`); `src/core/store.js:196-200` (`flushPending` before leaving a workspace). Browser: the popover listed `["Acme","Gamma"]` with exactly one check mark; clicking `gamma` moved the URL to `/w/gamma` and the reload kept it. The demo array is gone from the seed (`test/demo-workspace.test.mjs`) and the server drops `data.workspaces` on every read (`server.js:269`). |
| 9 | Goal + deliverable — minimal workspace creation, and **two accounts in two workspaces never receive each other's document** | ✓ VERIFIED | Creation: `server.js:1224-1244` (`POST /api/workspaces`, policy by `ALLOW_SIGNUP`/admin role, 409 + suggestion on slug collision, `uniqueSlug` fallback), `server.js:943-962` (creator becomes owner), `src/actions/actions.js:2730-2748` (`onbFinish` creates the workspace through the API first, then the starter project inside the loaded document), `src/actions/actions.js:1994-2005` (entry point gated by `api.canCreateWorkspace`, `src/core/api.js:92-94`). Browser: the switcher's "Create workspace" → wizard → landed on `/w/delta`, and `delta` appeared in the switcher. Isolation: dedicated adversarial run — account A (workspace `one`) and account B (workspace `two`) each wrote a secret project; A's `GET /api/workspaces/two` → `404` with no leak in the body, B's `GET /api/workspaces/one` → `404`, cross-tenant PUT/PATCH → `404` and the target document unchanged, workspace lists contained only the caller's own workspace, an invited third account joined `one` and still got `404` on `two`. Browser level: "tenant two sees Beta, and never the Acme document" (`e2e/tenancy.spec.mjs:58-76`). |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified, 0 overrides)

### Deferred Items

None. No phase-1 truth is left to a later phase.

### Requirement Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| **R1** | `01-PLAN.md` T1 | A workspace is a row in `workspaces` with a unique slug and its own document | **VERIFIED** | `server.js:95-104`, `server.js:141-145` (unique index `workspaces_slug_idx`), `server.js:943-962`; HTTP: `test/tenancy.test.mjs:70-84`; 409 on slug collision `test/tenancy.test.mjs:166-176` |
| **R2** | `01-PLAN.md` T1/T2 | An account can hold several memberships with a role per workspace | **VERIFIED** | `server.js:105-111`, `server.js:220-229`, `server.js:911-928`; HTTP: `test/tenancy.test.mjs:52-68` (one account owns two workspaces); browser: per-workspace role rendered in the switcher (owner/`Owner`, second account/`Member`) |
| **R3** | `01-PLAN.md` T4/T5 | `/w/:slug` addresses a workspace; all share/invite links are workspace-scoped | **VERIFIED** | `src/main.js:128-172`, `src/core/api.js:143-159`, `server.js:1246-1256`, `server.js:1734-1740`; share link `src/actions/actions.js:511` → `/w/<slug>/…`; invites bound to one workspace `server.js:1436-1494`, `server.js:1544-1558`; browser + Playwright: `/w/<slug>` boot, fallback, deep links |
| **R4** | `01-PLAN.md` T2 | Every API call is authorised against the caller's membership of that workspace | **VERIFIED** | `server.js:1068-1084` + every workspace route (`:1246-1542`) funnelled through it; 404 unknown/unauthorised, 403 by role (`viewer` < `member` < `admin` < `owner`, `server.js:71`); `test/tenancy.test.mjs:111-164`, `:185-194`; adversarial cross-tenant run (GET/PUT/PATCH → 404, no leak) |
| **R6** | `01-PLAN.md` T1 | Existing installs migrate in place, without data loss, with a pre-migration backup | **VERIFIED** | `server.js:814-844` (`vacuum into` backup before the first write), `server.js:850-878` (invite scoping, `member_id` backfill, demo array dropped, `data.me` nulled); `test/migration.test.mjs` (7/7 green: one backup, genuine pre-rewrite snapshot, rows preserved, second boot a no-op) |
| R5 | phase 3 | Private projects are never sent to non-members | out of phase 1 | Explicitly excluded by the phase goal; implemented in phase 3 (`test/privacy.test.mjs`, green) |
| R7 | phase 2 | Flag-driven creation, workspace-scoped invitations, accept by an existing account | out of phase 1 (creation policy already shipped in phase 1) | `server.js:1228-1230` (`ALLOW_SIGNUP`/admin gate), `server.js:1436-1494`; `test/membership.test.mjs` "ALLOW_SIGNUP=false closes signup and creation but invites still onboard" (green) |
| R8 | phase 4 | Lint, format, build and the server tests pass in CI | out of phase 1 (criterion 9 of the phase-1 SPEC) | `npm run lint`, `npm run format:check`, `npm run build` all green in this run; `npm test` → 44/44 green |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` | schema, migration, workspace-scoped API, authorisation | ✓ VERIFIED | 1859 lines; 4-level check: exists → substantive (no stubs, no debt markers) → wired (every route reaches `requireWorkspace`) → data flows (real `workspaces.doc` rows, no static returns) |
| `src/core/api.js` | slug-scoped client | ✓ VERIFIED | `listWorkspaces/createWorkspace/loadWorkspace/patchWorkspace/putWorkspace` (`:138-181`), `memberId` (`:87`), `canCreateWorkspace` (`:92`) |
| `src/core/store.js` | per-workspace state, `flushPending`, per-account `me` | ✓ VERIFIED | `applyDoc` sets `me` from `api.memberId` (`:168-186`), `hydrateFromServer` (`:188-193`), `flushPending` (`:196-200`), `workspaceList/currentSlug` (`:258-268`) |
| `src/main.js` | `/w/:slug` boot | ✓ VERIFIED | `:92-112`, `:114-188` |
| `src/overlays/popovers.js`, `src/overlays/palette.js` | real switcher | ✓ VERIFIED | `popovers.js:240-252`; `palette.js:68-80` |
| `src/actions/actions.js` | switch, create, save, share links | ✓ VERIFIED | `:497-512`, `:1977-2005`, `:2158-2190`, `:2381-2393`, `:2730-2793` |
| `src/pages/settings.js`, `src/pages/auth.js` | workspace URL field / onboarding prefix | ✓ VERIFIED | `settings.js:97-101`; `auth.js:137-139`, `:163` |
| `.env.example`, `DEPLOY.md`, `README.md` | operator docs (T6) | ✓ VERIFIED | `WORKSPACE_SLUG` `.env.example:21-24`, `DEPLOY.md:274-276`; `/w/<slug>` `README.md:112`; migration backup + rollback `DEPLOY.md:330-373` |
| `test/helpers/server.mjs`, `test/tenancy.test.mjs`, `test/migration.test.mjs` | real-server proof | ✓ VERIFIED | Real `node:sqlite` DB in a `mkdtemp` `DATA_DIR` on an ephemeral port — no mocking (phase-4 artifacts that harden the phase-1 contract) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/core/api.js` | `server.js` | `GET/PUT/PATCH /api/workspaces/:slug` | ✓ WIRED | `api.js:143-181` → `server.js:1246-1317`; live round-trip proven by the tenancy suite |
| `server.js` (workspace route) | `workspaces` row | `wsBySlug` + `membershipOf` | ✓ WIRED | `server.js:212-218`, `:1068-1084`; the served `doc` is the row's own document (`server.js:1254`) |
| `server.js` (auth payload) | `memberships` | `membershipsOf(user.id)` | ✓ WIRED | `server.js:244-251` — `me`/login/signup return `workspaces` with `role` + `memberId` |
| `server.js` (write path) | `docFromClient` guards | stored vs incoming | ✓ WIRED | `server.js:558-584` — `data.me`, `data.workspaces`, `data.ws` always ignored; `data.members` admin+, `data.plan` never from the document |
| `src/main.js` | `src/core/store.js` | `hydrateFromServer(slug)` | ✓ WIRED | `main.js:172` → `store.js:188-193` → `api.js:143-159` |
| `src/overlays/popovers.js` / `palette.js` | `src/actions/actions.js` | `A.switchWs` | ✓ WIRED | `popovers.js:247`, `palette.js:76` → `actions.js:1977-1993` → `openWorkspace` (`actions.js:2381-2393`) |
| `src/actions/actions.js` (share) | `server.js` | `copy(\`${api.url}/w/${slug}/…\`)` | ✓ WIRED | `actions.js:511`; slug originates from the server-derived `data.ws.url` |
| `src/actions/actions.js` (create) | `server.js` | `api.createWorkspace` | ✓ WIRED | `actions.js:2737` → `api.js:162-165` → `server.js:1224-1244`; browser run created `delta` and landed on `/w/delta` |
| `server.js` (migration) | `workspaces`/`memberships`/`invites` | `migrateTenancy` | ✓ WIRED | `server.js:814-878`; proven against a pre-tenancy DB by `test/migration.test.mjs` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `GET /api/workspaces/:slug` | `doc` | `workspaces.doc` (JSON column) | ✓ FLOWING | Real per-workspace document; no static/mocked return |
| `GET /api/workspaces` | `workspaces[]` | `memberships ⋈ workspaces` | ✓ FLOWING | `server.js:220-229`, `:1218-1222` |
| `POST /api/workspaces` | `workspace` | `createWorkspace` → `workspaces` insert | ✓ FLOWING | `server.js:943-962`; a second GET returns the new row |
| client `S.data` | document | `api.loadWorkspace` → `applyDoc` | ✓ FLOWING | `store.js:168-193`; `data.me` set from the server's `memberId`, not from the document |
| client switcher list | `api.workspaces` | `GET /api/workspaces` | ✓ FLOWING | Browser: real names and roles rendered |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-1 tenancy contract over HTTP | `node --test test/tenancy.test.mjs` | 10/10 pass | ✓ PASS |
| Full server suite | `npm test` | 44/44 pass | ✓ PASS |
| Legacy in-place migration + idempotency | `npm test` (test/migration.test.mjs) | 7/7 pass | ✓ PASS |
| Two accounts in two workspaces never see each other's document | `/tmp/opencode/phase1-isolation.mjs` (own harness, real server, real `node:sqlite`) | "ALL PHASE-1 ISOLATION CHECKS PASSED" | ✓ PASS |
| Real switcher: list, check mark, switch, reload | `/tmp/opencode/switcher.mjs` (Chromium) | 6/6 steps | ✓ PASS |
| Creation flow: switcher → wizard → `/w/<slug>` | `/tmp/opencode/create-flow.mjs` (Chromium) | 3/3 steps | ✓ PASS |
| Role per workspace + per-account profile | `/tmp/opencode/roles.mjs`, `/tmp/opencode/per-account-me.mjs` (Chromium) | pass | ✓ PASS |
| Two-tenant browser UAT | `npx playwright test --config e2e/playwright.config.mjs` | 4/4 pass | ✓ PASS |
| Lint / format / build | `npm run lint && npm run format:check && npm run build` | all green | ✓ PASS |

### Probe Execution

Not applicable — this project has no `scripts/*/tests/probe-*.sh` probes; the phase's equivalent
contract suites (`test/tenancy.test.mjs`, `test/migration.test.mjs`) were executed directly.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | No `TBD`/`FIXME`/`XXX` debt markers and no stub patterns (`return null`, empty collections, ignored `fetch` results, static `Response.json`) in the phase-1 files (`server.js`, `src/core/api.js`, `src/core/store.js`, `src/main.js`, `src/overlays/*`, `src/actions/actions.js`, `src/pages/settings.js`, `src/pages/auth.js`). The only `placeholder` matches are HTML input placeholders. |

### Human Verification Required

None outstanding for the phase-1 contract. Every phase-1 truth was exercised behaviourally — over
real HTTP against a real `node:sqlite` database, and in a real Chromium session for the routing,
switcher, creation and per-account-profile claims. Purely visual taste (how the switcher *looks*)
is out of the phase goal's scope and is not recorded as a gap.

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | The phase goal's closing clause "No private-project redaction yet" no longer holds in the tree: the server now redacts private projects on read and merge on write (`server.js:273-347`, `server.js:551-556`). This is the *later* phase 3 work (R5), not a phase-1 regression — but the phase-1 goal text is now historically inaccurate. | other | Informational: the phase-1 scope boundary was superseded by design (ROADMAP phase 3). |
| 2 | `01-SUMMARY.md`'s deviation "the fake `data.workspaces` array stays in the client seed" is stale — phase 4 removed it from the seed (`test/demo-workspace.test.mjs` asserts its absence). The phase-1 guarantee (the server never returns it) still holds and is tested. | other | Documentation drift between the phase summary and the final tree; no functional impact. |
| 3 | A member profile id is derived deterministically from the user id (`m_<user_id prefix>`, `server.js:893`), so the same account carries the same profile id in two different workspaces. Harmless for isolation (documents are per-workspace) and superseded in part by R5, but it is a cross-workspace correlation handle worth noting for any future "same person across tenants" hardening. | security | Informational: no phase-1 requirement is violated, and no leak path was found; flagged for future hardening only. |
| 4 | `migrateTenancy` writes the pre-migration backup only when a workspace row still lacks a slug (`server.js:816`); a crash between the slug write and the document cleanup would leave the next boot writing the document without a fresh backup. The backup taken by the interrupted boot is still a valid pre-migration snapshot, so no data is lost. | other | Edge case in the crash window only; not reachable in normal operation and not a phase-1 requirement. |

### Gaps Summary

None. The phase goal and its deliverable are met: the workspace is the tenant boundary, every
document request is slug-scoped and authorised against the caller's membership, an existing install
migrates in place with a pre-migration backup and no data loss, the client addresses workspaces by
`/w/:slug` with a switcher that lists the caller's real workspaces, workspace creation is available
and goes through the API, and two accounts in two workspaces never receive each other's document
(proven at the HTTP layer, in the `node:test` suite, and in a real Chromium session).

---

_Verified: 2026-10-22_
_Verifier: the agent (gsd-verifier)_
