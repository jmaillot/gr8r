---
phase: 03-private-project-isolation
verified: 2026-10-22T07:32:02Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - server.js
  - src/core/store.js
  - src/actions/actions.js
  - src/overlays/modals.js
  - src/pages/project.js
  - src/main.js
  - src/shell/render.js
  - src/ui/select.js
  - test/privacy.test.mjs
  - test/helpers/server.mjs
  - e2e/tenancy.spec.mjs
---

# Phase 3: Private project isolation — Verification Report

**Phase Goal (ROADMAP.md:36-43):** "Server-side redaction on read and merge on write, protection of
`private`/`members` changes, saved views and activity filtered consistently."
**Deliverable:** "a member who is not on a private project receives no trace of it, and cannot write to it
(directly or by clobbering the document)."
**Verified:** 2026-10-22T07:32:02Z
**Status:** passed
**Re-verification:** No — initial verification (no prior VERIFICATION.md in the phase directory)
**Verifier stance:** FORCE. SUMMARY.md was treated as a claim, not evidence. Every truth below was
re-derived from the code and re-proven with independent HTTP and Chromium probes (scripts written to
`/tmp/opencode/`, no repo file touched — `git status` clean).

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | A member not on private project P receives no trace of P: not in `projects`/`projOrder`, and no task, comment, file, activity, notification, event, saved view or `views` key/filter value belonging to P | ✓ VERIFIED | `server.js:401-425` (`redactDoc` — every collection filtered; `redactViews` 350-363 drops `p:`/`sv:` keys and scrubs project filters). `test/privacy.test.mjs:242-268` passes (leak scan over `p_sec`/`t_sec`/`c_sec`/`f_sec`/`a_sec`/`n_sec`/`e_sec`/`sv_sec`/name/`Secret task` + `views` keys + filter scrubbing). **Independent probe** (`/tmp/opencode/probe-privacy.mjs`): full-document JSON scan for a private project's id, key, name, task, subtask, comment, file, activity, notification, event and saved-view ids → `READ LEAK SCAN: clean`; `projOrder=["p_pub"]`, `views keys=["p:p_pub","tasks"]`, `sv_all.filters=[{"f":"project","v":["p_pub"]}]`, `recentSearches=["unrelated"]` |
| 2 | A member who IS on P still receives P and all of its data | ✓ VERIFIED | `test/privacy.test.mjs:286-292` (Cara sees `p_sec`, `p_ownerblind`; legacy `access:'private'` migrated to `private:true` at 290). Probe: `cara sees p_zzqsecret = true | sees t_zzq = true` |
| 3 | A redacted PUT cannot delete or rewrite P: P and its dependent rows survive, byte-for-byte, in stored order | ✓ VERIFIED | `server.js:462-549` (`mergeClientDoc` restores hidden rows from **stored**, never from incoming: `hiddenProjectIds(stored, memberId)` at 469, `mergeList`/`mergeIds` 428-460 re-insert reserved rows at their stored index). `test/privacy.test.mjs:294-374` asserts `JSON.stringify(proj(afterBob.doc,'p_sec')) === secBefore` and the same for `t_sec` (345-346). Probe: `private project rows lost after non-member write = []` (none lost) |
| 4 | A non-member cannot inject, tamper or move data into P (project/task/comment/file/activity/notification/event/view) | ✓ VERIFIED | Reserved-id merge (`server.js:497-517`, `reservedDependants` marks stored *and* incoming hidden rows) + project-id reservation (477). `test/privacy.test.mjs:308-368`: injected `t_evil`/`c_new`/`e_evil`/`sv_evil` dropped, `t_pub`/`f_pub` moved into P undone (352-353). Probe: `injected rows present = []`, `t_pub.project = p_pub` |
| 5 | `private`, `members`, `perms`, `lead` cannot be changed by a non-manager — server-side **and** through the UI | ✓ VERIFIED | Server: `server.js:479-494` copies the four access fields from storage unless `canManageProject` (285-288: owner/admin/lead). `test/privacy.test.mjs:298-301,341-344` (Bob's privatise/clear-lead/empty-members/perms rewrite all reverted). Client: `src/core/store.js:224-227` (`canManageProject`), `src/actions/actions.js:1473,1485,1533,1553` (handler-level guards on `shareAdd`/`shareInvite`/`sharePerm`/`shareAccess`), `src/overlays/modals.js:180-231` (no permission selects, disabled general-access select, manager hint, access list still visible), `src/overlays/modals.js:143,166-169` (lead select read-only). **Chromium probe** (`/tmp/opencode/probe-client.mjs`, non-manager Carol): `shareInviteInputPresent=false`, `shareInviteButtonPresent=false`, `sharePermSelects=0`, `shareAccessDisabled=true`, `shareManagerHint=true`, `accessListVisible=true`, `leadDisabled=true`, `leadHint=true` |
| 6 | A project lead / member owner-admin can change access, add members and flip private→workspace-wide; after the flip the other member sees the project | ✓ VERIFIED | `test/privacy.test.mjs:390-405`: lead renames, adds Bob to `members`, flips `private=false`; then `Bob now sees the shared project` (404). Server keeps the manager in the access list (`server.js:489-493`). Chromium probe: owner (manager on the private project) sees it, `privateNameInTitle=true`, `ownerShareInviteInputPresent=true`, `ownerShareAccessDisabled=false` |
| 7 | An owner/admin who is not on P does not see P | ✓ VERIFIED | `server.js:280-283` (`canSeeProject` — role-independent; membership list only). `test/privacy.test.mjs:236-237` (`p_ownerblind` and legacy `p_legacy` absent for the owner), 251-252 for Bob |
| 8 | A private project can never live with an empty access list: manager added on flip, custodian assigned on read, last-member leave/removal refused `409`, lead promoted on removal, stored `lead:null` repaired | ✓ VERIFIED | `server.js:295-321` (`normalizeProjects`: custodian = lead/first owner, `p.private=false` only when the workspace has no members at all), `server.js:489-493` (flip keeps the manager), `server.js:664-694` (`stripMember`: lead promotion + `409 'Promote someone before removing the last member of a private project'`). `test/privacy.test.mjs:235,290,370-372,407-423,425-441` all pass |
| 9 | Browser: a non-manager sees a read-only share modal; a direct deep link to a hidden project renders the generic 404; the tab title never names an invisible project | ✓ VERIFIED | `src/pages/project.js:33-34` (`page404()` in server mode, `stateDenied` only in demo), `src/main.js:99-103` (unmatched project segment → `go('project',{id:'__missing'})`), `src/shell/render.js:112` (title gated on `canSee`). Repo e2e `e2e/tenancy.spec.mjs:78-110` passes (4/4 in Chromium). Independent Chromium probe: `hiddenDeepLink404=true`, `hiddenNameInBody=false`, `hiddenNameInTitle=false`, `titleOn404="Not found · Acme"` |
| 10 | `views`, saved views and activity are filtered consistently, and newest-first activity ordering survives a merge | ✓ VERIFIED | `server.js:350-363,418-423,530-547` (saved views + per-user view state merged by key, hidden keys kept from storage, filters scrubbed). `test/privacy.test.mjs:247-267` (view keys removed, project filters scrubbed, workspace-level saved view kept), 376-388 (`activity[0].id === 'a_new'`, hidden activity restored exactly once) |
| 11 | **R5** — Private projects are never sent to non-members and cannot be modified by them | ✓ VERIFIED | Read path: `server.js:1246-1256` (`GET` → `docForClient(doc, ws, membership)` → `redactDoc`) — the *only* endpoint that serves the document. Write path: `server.js:1258-1290` (`PUT` → `docFromClient` → `mergeClientDoc`), `409` on stale revision before merging (1277-1280). No other route returns workspace document content (audit of every `.doc` read in `server.js`: 700/831/860/913 are migration+bootstrap paths, 1336/1405 only extract a member profile) |
| 12 | Demo mode keeps its local visibility behaviour; lint, format check and build stay green | ✓ VERIFIED | `src/pages/project.js:34` (`api.enabled ? page404() : stateDenied(p)`), `src/core/store.js:223` (null-safe `canSee`). `npm run lint` → clean, `npm run format:check` → "All matched files use Prettier code style!", `npm run build` → ✓ built in 2.54s, `npm test` → **44/44 pass** |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Requirement Coverage

| Requirement | Description | Phase | Status | Evidence |
| ----------- | ----------- | ----- | ------ | -------- |
| **R5** | Private projects are never sent to non-members and cannot be modified by them. | 3 | ✓ VERIFIED | Read redaction `server.js:401-425` via the sole document-serving route `server.js:1246-1256`; write merge `server.js:462-549` via `server.js:1258-1290`; access-field protection `server.js:479-494`; `test/privacy.test.mjs` 10/10 (70 assertion sites over the original phase-3 matrix ids `p_pub`/`p_sec`/`p_cust`/`p_ownerblind`/`p_promo`/`p_legacy`); independent HTTP probe clean on read and on write; independent Chromium probe confirms the browser-side 404/read-only gates |
| R1, R2, R3, R4, R7 | Tenancy, memberships, routing, authorisation, creation/invites | 1–2 | n/a | Out of scope for phase 3 (verified in phases 1–2) |
| R6 | In-place migration with pre-migration backup | 4 | n/a | Out of scope for phase 3 (verified in phase 4) |
| R8 | Lint, format, build and server tests pass | 4 | ✓ (side effect) | `npm run lint` clean · `npm run format:check` clean · `npm run build` green · `npm test` 44/44 · `npm run test:privacy` 10/10 · `npx playwright test` 4/4 |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` | Redaction helpers, merge, access protection | ✓ VERIFIED | `projectIsPrivate` 273, `canSeeProject` 280, `canManageProject` 285, `normalizeProjects` 295, `hiddenProjectIds` 323, `hiddenTaskIds` 331, `scrubProjectFilters` 338, `redactViews` 350, `redactDoc` 401, `mergeList` 428, `mergeIds` 446, `mergeClientDoc` 462, `docForClient` 551, `docFromClient` 558, `stripMember` 664 |
| `src/core/store.js` | `canSee` null-safe + `canManageProject` | ✓ VERIFIED | 223-227 — role Owner/Admin or `p.lead === D().me` |
| `src/overlays/modals.js` | Share modal + settings gating | ✓ VERIFIED | 143/166-169 lead read-only; 180-231 read-only share modal (no invite form, no perm selects, disabled general access, manager hint, list still visible) |
| `src/actions/actions.js` | Handler-level guards | ✓ VERIFIED | 1473, 1485, 1533, 1553 — `shareAdd`, `shareInvite`, `sharePerm`, `shareAccess` all refuse without `canManageProject` |
| `src/pages/project.js` | 404 for missing/invisible project | ✓ VERIFIED | 33-34 — `page404()` in server mode, `stateDenied` only in demo mode |
| `src/main.js` | Deep link → not-found state | ✓ VERIFIED | 99-103 — unmatched project segment → `go('project', {id:'__missing'})` |
| `src/shell/render.js` | Title must not name an invisible project | ✓ VERIFIED | 112 — title gated on `canSee(proj(...))` |
| `src/ui/select.js` | Custom trigger honours a disabled native select | ✓ VERIFIED | Custom trigger disabled when the native select is disabled (read-only forms cannot open a menu) |
| `test/privacy.test.mjs` | The 70-check matrix, ported to `node:test` | ✓ VERIFIED | 442 lines, **70** `assert.*` call sites over the original fixture ids; `npm run test:privacy` → 10/10 pass. Real server + real SQLite + real HTTP (`test/helpers/server.mjs:43-89` spawns `server.js` on an ephemeral port with its own `DATA_DIR`); no mocking of SQLite or HTTP |
| `e2e/tenancy.spec.mjs` | Browser proof of invisibility + 404 | ✓ VERIFIED | 78-110 — Chromium, real fixtures; 4/4 pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `GET /api/workspaces/:slug` | `redactDoc` | `docForClient(doc, ws, membership)` → `redactDoc` | ✓ WIRED | `server.js:1254`, 551-556 — membership is passed on every read |
| `redactDoc` | every dependent collection | `hiddenProjects` / `hiddenTasks` / `hiddenViews` sets | ✓ WIRED | `server.js:404-423` — projects, projOrder, tasks, comments, files, activity, notifs, events, savedViews, `views` |
| `PUT /api/workspaces/:slug` | `mergeClientDoc` | `docFromClient(doc, stored, row, role, membership)` | ✓ WIRED | `server.js:1281`, 558-584 — hidden set derived from the **stored** doc (469), not from the incoming one |
| `mergeClientDoc` | stored hidden rows | `mergeList` / `mergeIds` with a reserved-id set | ✓ WIRED | `server.js:428-460`, 477-517 — reserved rows come from storage; incoming duplicates dropped |
| `mergeClientDoc` | access fields | `canManageProject(prev, memberId, role)` | ✓ WIRED | `server.js:482-493` |
| `stripMember` | private project access list | 409 + lead promotion | ✓ WIRED | `server.js:681-692`; routes `server.js:1353` (leave) and 1376 (removal) |
| Client share modal | `canManageProject` | `src/overlays/modals.js:180` | ✓ WIRED | Browser-verified: non-manager sees no controls, disabled select, hint |
| `applyDeepLink` | `page404()` | `go('project',{id:'__missing'})` → `pageProject` 33 | ✓ WIRED | Browser-verified: "Not found · Acme", no project name in body or title |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `server.js` `docForClient` | `doc.data.projects` etc. | `workspaces.doc` (SQLite) → `JSON.parse` → `normalizeProjects` → `redactDoc` | ✓ — live SQLite row, filtered per caller | ✓ FLOWING |
| `server.js` `mergeClientDoc` | merged collections | stored row + incoming body, merged by id | ✓ — hidden rows restored from the stored row; visible rows from the client | ✓ FLOWING |
| `src/core/store.js` `canSee` | visibility | `D().projects` (the served, already-redacted document) | ✓ — no client-side leak path left open | ✓ FLOWING |
| `src/pages/project.js` `pageProject` | project page | `proj(id)` + `canSee(p)` | ✓ — absent project → `page404()` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Privacy matrix (read redaction, merge, injection, access protection, lead/409/repair cases) | `npm run test:privacy` | 10 tests, 10 pass, 0 fail (70 assertion sites) | ✓ PASS |
| Full server suite | `npm test` | 44 tests, 44 pass, 0 fail | ✓ PASS |
| Browser UAT (two tenants + private project invisibility, deep-link 404) | `npx playwright test --config e2e/playwright.config.mjs` | 4 passed (Chromium) | ✓ PASS |
| Lint / format / build | `npm run lint` · `npm run format:check` · `npm run build` | clean · clean · built in 2.54s | ✓ PASS |
| Independent read-leak scan (own fixture, own server, whole-document JSON scan) | `node /tmp/opencode/probe-privacy.mjs` | `READ LEAK SCAN: clean`; no trace of id/key/name/task/subtask/comment/file/activity/notification/event/saved-view | ✓ PASS |
| Independent write-protection scan (injection, move-into-P, id reuse, access tampering) | `node /tmp/opencode/probe-privacy.mjs` | rows lost: none; injected rows: none; `t_pub.project` restored to `p_pub`; hidden views key kept from storage | ✓ PASS |
| Independent Chromium probe of the client gates (non-manager read-only modal, disabled lead, 404, title) | `node /tmp/opencode/probe-client.mjs` | all assertions as tabulated in Truth #5 and #9 | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Phase-3 committed matrix | `npm run test:privacy` → `node --test test/privacy.test.mjs` | exit 0 — 10/10 | PASS |
| Repo e2e | `npx playwright test --config e2e/playwright.config.mjs` | exit 0 — 4/4 | PASS |
| Verifier probes (read-leak, write-protection, Chromium client gates) | `node /tmp/opencode/probe-privacy.mjs`, `node /tmp/opencode/probe-client.mjs` | exit 0, all assertions clean | PASS |

**Note on the committed script:** PLAN T4 specified `scripts/verify-private-projects.mjs`. That file was
deleted in phase 4 (commit `0a766cb` "port the 70-check privacy matrix to node:test") and replaced by
`test/privacy.test.mjs`, which keeps all 70 assertion sites over the original fixture ids. `npm run
test:privacy` still resolves (now to the `node:test` file). The SUMMARY's path reference is stale but
the coverage is intact — informational only, not a gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | no `TBD`/`FIXME`/`XXX` debt markers in any phase-3 file (scan of `server.js`, `src/core/store.js`, `src/actions/actions.js`, `src/overlays/modals.js`, `src/pages/project.js`, `src/main.js`, `src/shell/render.js`, `test/privacy.test.mjs`) | — | none |
| — | — | no stub returns (`return null` / `{}` / `[]` placeholders) in the phase-3 paths; no legacy `access` field written anywhere in `src/` (`grep '\.access\b' src/` → 0 hits) | — | none |
| `server.js` | 314 | `if (!p.members.length) p.private = false;` — a private project becomes workspace-wide only when the workspace has **no** members at all (spec-consistent: "if the workspace has no members, it becomes workspace-wide") | ℹ️ Info | none |

### Residual Risks (non-blocking, disclosed)

1. **Recent-search redaction is substring-based (disclosed, confirmed).** `server.js:378`
   (`referencesHidden` uses `term.toLowerCase().includes(name)`), applied at 390 (incoming terms) and 395
   (stored terms). A hidden project name embedded in a longer free-text search string is therefore only
   partially masked. Disclosed as a known limit in `CHANGELOG.md:70-72` and `DEPLOY.md:378-380`; the
   substring nature of the interim fix is spelled out in `.planning/phases/04-hardening-and-ship/04-REVIEW-FIX.md:145-146`
   and `04-REVIEW-DISPOSITION.md:36`. Regression-tested at `test/privacy.test.mjs:270-284`.
   *Verified, not re-litigated.* Note the CHANGELOG/DEPLOY bullets frame the limit as "recent searches are
   workspace-wide"; the substring/partial-match nuance is only implicit there.
2. **Free text naming a private project can reach a non-member through a row that is itself visible.**
   Measured with an independent probe (`/tmp/opencode/probe-freetext.mjs`): a comment on a *public* task,
   a public event title, a public notification and a public activity entry that quote the private project's
   name are served to a non-member, while the project record, id, key, tasks and access list remain fully
   redacted (`non-member sees hidden key: false`, `hidden task: false`; carriers: `comments:c_p`,
   `events:e_p`, `notifs:n_p`, `activity:a_p`). This is a deliberate consequence of the phase-3 model:
   the SPEC scopes redaction to row association and lists "hiding a private project's name from free-text
   fields" as a non-goal (`03-SPEC.md:129`), and no content scanning exists for those fields (unlike the
   workspace-wide recent-search list, which phase 4 did scan). The leak requires a human to deliberately
   type the private project's name on a shared row — it is not the project being served. **Recommendation:**
   add this class to the "Known limits" section of `CHANGELOG.md`/`DEPLOY.md` so the "no trace" wording is
   not read as covering third-party free text. Not scored as a gap: the specified redaction contract
   (AC 1–10) and R5 are fully met.

### Human Verification Required

None. Every observable truth was proven with executable evidence (HTTP against a real server with real
SQLite, and Chromium against the built app). No visual/aesthetic judgement, no external service and no
state-mutating manual step remains open for this phase.

### Gaps Summary

No gaps. The phase goal is achieved in the codebase, not merely in the summary: the server owns the
visibility boundary (`redactDoc` on read, `mergeClientDoc` on write, `normalizeProjects` for legacy rows),
the client is a defence-in-depth layer over an already-redacted document, and the browser gates (generic
404 on a hidden deep link, read-only share modal and project settings for a non-manager, title that never
names an invisible project) were confirmed in a real Chromium session.

---

_Verified: 2026-10-22T07:32:02Z_
_Verifier: the agent (gsd-verifier) — initial verification, FORCE stance_
