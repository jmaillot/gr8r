---
phase: 79-governance-surface
reviewed: 2026-11-20T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - db-adapter.mjs
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/locales/de.json
  - src/locales/en.json
  - src/locales/es.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/overlays/modals.js
  - src/pages/governance.js
  - src/pages/settings.js
  - src/shell/layout.js
  - src/shell/render.js
  - test/creation-gate-client.test.mjs
  - test/fixtures/icons-baseline.json
  - test/governance-client.test.mjs
  - test/governance.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/static-db-audit.test.mjs
findings:
  critical: 2
  warning: 2
  info: 3
  total: 7
status: issues_found
---

# Phase 79: Code Review Report

**Reviewed:** 2026-11-20
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed the Phase 79 governance surface end-to-end: the server's new `/api/auth/operator/workspaces` route family (list, archive/unarchive, delete with orphan dispositions, member reassign/release), the `workspaces.archived` column + `requireWorkspace` refusal, and the client half (governance page, orphan modal, actions, api methods, 5 locale catalogues, nav/render wiring) plus the seven test files.

The route-guard ordering (sameOrigin → requireUser → throttle → operator gate before target lookup), the single-tx audit discipline, the mass-assignment role whitelist, the duplicate-membership pre-check, and the full esc() discipline in the page rows are all correctly implemented, and all 129 tests in the touched suites pass. However, the orphan-disposition flow — the centerpiece of D-05/D-06 — is broken end-to-end: the server never implements the GET members route the client calls, and the orphan modal title interpolates a raw workspace name through `t()` into modal HTML (stored XSS into the operator's session). Two warnings cover a broken interpolated toast and reassignment into archived workspaces.

## Critical Issues

### CR-01: GET `/api/auth/operator/workspaces/:id/members` is never implemented — the orphan modal can never resolve

**File:** `server.js:7014` (absent route), `src/actions/actions.js:4742-4749`, `src/core/api.js:369-371`
**Issue:** The client's orphan flow stages `S.ui.govOrphan = { ws, members: null, targets: null }` and calls `refreshGovOrphanMembers(ws.id)` → `api.operatorWsMembers(id)` → `GET /api/auth/operator/workspaces/:id/members`. No route in server.js matches that GET: the only members route in the operator family is `operatorWsMemberMatch` (line 7014), which is `method === 'POST'` and requires a trailing `/(reassign|release)`. The request falls through the router to the generic 404. `refreshGovOrphanMembers` only assigns `members` when `res.ok`, so `S.ui.govOrphan.members` stays `null` forever: `govOrphanBody` renders the `aria-busy` "Loading workspaces…" skeleton indefinitely, no member rows render, and the Delete button (gated on `members.some(...)`) can never exist. The D-05/D-06 delete-with-members flow is dead on arrival; only the 0-member path works. No test exercises the GET (governance.test.mjs builds dispositions directly), which is how this slipped through. The `targets` list (D-08: name + member count, delete target excluded) is likewise never fetched, so even if members arrived the reassign destination select would always be empty.
**Fix:** Add the read route before the POST member route, mirroring the family's guard order and the WSG-07 payload shape:

```js
const operatorWsMembersMatch = pathname.match(/^\/api\/auth\/operator\/workspaces\/([A-Za-z0-9_-]{1,64})\/members$/);
if (operatorWsMembersMatch && method === 'GET') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const ws = await db.get('select id from workspaces where id = ?', [operatorWsMembersMatch[1]]);
  if (!ws) return fail(res, 404, 'notFound', 'Not found');
  const targets = (await db.all(`select w.id, w.slug, w.name, w.archived,
      (select count(*) from memberships m where m.workspace_id = w.id) as member_count
    from workspaces w where w.id is not ? and w.archived = 0`, [operatorWsMembersMatch[1]]))
    .map(r => ({ id: r.id, slug: r.slug, name: r.name, memberCount: r.member_count }));
  return json(res, 200, {
    members: (await membersOf(ws.id)).map(m => ({ userId: m.user_id, name: m.name, email: m.email, role: m.role })),
    targets,
  });
}
```
Then add an integration test that drives `GET /:id/members` through the orphan path (assert members + targets payloads and the 403/404 edges).

### CR-02: Stored XSS — orphan modal title interpolates a raw workspace name into modal HTML

**File:** `src/actions/actions.js` (govOrphan flow), `src/pages/governance.js:187`, `src/core/i18n.js:164-166`
**Issue:** `govOrphanBody` renders `<h2 ...>${t('page.governance.orphanTitle', { n: members.length, name: o?.ws?.name || '' })}</h2>`. `t()`/`interpolate()` explicitly never escapes ("the caller escapes at the point of interpolation", i18n.js:157), and here the caller passes `o.ws.name` raw. A workspace name is user-controlled data (any member able to create/rename a workspace), so a name like `<img src=x onerror="...">` executes in the instance operator's session the moment they open the delete/orphan modal for that workspace — a stored XSS against the highest-privilege account. The same page's own discipline proves the intent: every other variable interpolation in this flow escapes (`esc(ws.slug)` in the confirm bodies, `esc(m.name)` in rows), and the delete confirm title passes the name through `confirmDlg`'s esc'd catalogue path. Only the orphan title missed.
**Fix:** Escape at the interpolation point:

```js
// src/pages/governance.js, govOrphanBody
t('page.governance.orphanTitle', { n: members.length, name: esc(o?.ws?.name || '') })
```

## Warnings

### WR-01: `err.memberAlreadyMember` toast renders with an unresolved `{name}` placeholder

**File:** `src/actions/actions.js:4645-4650` (govRefusalToast), `src/locales/en.json:1780`
**Issue:** `govRefusalToast` maps the three keyed refusal codes via `t('err.' + code)` with no vars. `err.memberAlreadyMember` is `"…is already a member of that workspace…"` parameterized as `{name}` in all five catalogues. `interpolate()` (i18n.js:166) leaves an unresolvable placeholder verbatim, so the operator sees a literal `{name}` in the toast. The other two keys are parameter-free and fine; only this one is broken.
**Fix:** Pass the destination name for that code, or use a parameter-free key:

```js
const keyed = { workspaceNotEmpty: v => t('err.workspaceNotEmpty'),
                dispositionRequired: v => t('err.dispositionRequired'),
                memberAlreadyMember: v => t('err.memberAlreadyMember', { name: S.ui.govOrphan?.ws?.name || '' }) };
```

### WR-02: Governance reassign accepts an ARCHIVED destination workspace — members land somewhere they can never enter

**File:** `server.js:6963-6967` (delete-path dispositions) and `server.js:7045-7050` (standalone reassign)
**Issue:** Both reassign paths look up the target with `select id, name, slug from workspaces where id = ?` and only check existence + duplicate membership. Neither excludes `archived = 1` targets. `requireWorkspace` refuses every `/api/workspaces/:slug` route for archived workspaces (server.js:4884) and `membershipsOf` filters `w.archived = 0` (server.js:939), so a member reassigned into an archived workspace silently loses all access — worse than release, which at least lands in the documented "awaiting access" state. The GET-members targets payload (once CR-01 is fixed) should exclude archived workspaces, but the server is the control (D-11) and must refuse regardless of what the client offers.
**Fix:** In both reassign branches, after the target lookup:

```js
if (target.archived) return fail(res, 409, 'targetArchived', 'The destination workspace is archived. Pick an active destination.');
```
(select `archived` in the target query too), add the `err.targetArchived` key to the five catalogues, and exclude `archived = 1` rows from the targets payload.

## Info

### IN-01: Dead client code — `A.govReleaseAsk`, `api.operatorWsReassign`, `api.operatorWsRelease` have no call sites

**File:** `src/actions/actions.js:4788-4804`, `src/core/api.js:381-385`
**Issue:** No `data-a="govReleaseAsk"` or `api.operatorWsReassign`/`operatorWsRelease` call exists anywhere in src/ after the 79-03 relocation (release/reassign happen only through the orphan dispositions path). The comment "Consumed by the operator-management surface landing in plan 03" describes a surface that shipped without consuming them. The server routes are tested, but the client methods are dead weight that can drift.
**Fix:** Delete `A.govReleaseAsk` and the two unused api methods, or wire them into the orphan modal's per-member rows.

### IN-02: Stale comment in settings.js still points at the relocated operator card

**File:** `src/pages/settings.js:830`
**Issue:** "Revoke follows the operator card's inline-confirm stage" — the operator card (and its `S.ui.operatorRevoke` stage) moved to the governance page in 79-03; the sessions-tab comment now describes code that no longer lives here.
**Fix:** Reword to reference the governance page.

### IN-03: Workspace search input reuses member-search a11y labels

**File:** `src/pages/governance.js:108`
**Issue:** The workspace filter input carries `aria-label="${t('a11y.searchMembers')}"` ("Search members") and placeholder `a11y.searchNameOrEmail` on a table of workspaces — mislabeled for screen-reader users.
**Fix:** Add dedicated `page.governance.searchWs` a11y keys to the five catalogues and use them.

---

_Positive notes (not findings): guard order and throttling on all four operator routes match the Phase 78 precedent; the audit rows share the mutation's transaction; the 0-member vs >0 delete forks, type-to-confirm exact matching, and the disabled-until-resolved footer are all correctly implemented and pinned; all 5 catalogues carry the 40 governance keys + 4 err keys in parity; the static-db-audit / i18n-toast / i18n-shell / i18n-core-features suites all pass (129 tests)._

_Reviewed: 2026-11-20T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
