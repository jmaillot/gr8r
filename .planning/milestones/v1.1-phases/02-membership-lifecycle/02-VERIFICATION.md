---
phase: 02-membership-lifecycle
verified: 2026-10-22T08:05:00Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/02-membership-lifecycle/PLAN.md
  - .planning/phases/02-membership-lifecycle/SPEC.md
  - .planning/phases/02-membership-lifecycle/SUMMARY.md
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/core/store.js
  - src/main.js
  - src/overlays/context-menu.js
  - src/overlays/popovers.js
  - src/pages/auth.js
  - src/pages/home.js
  - src/pages/members.js
  - src/pages/settings.js
  - test/helpers/server.mjs
  - test/membership.test.mjs
covered_digest: "v2:sha256:214a8bd1d62061d0c79486206b7bf829a1ab6ba9dac409b4e2d09c2c1a29a65d"
---

# Phase 2: Membership lifecycle — Verification Report

**Phase Goal (ROADMAP.md:27-34):** "Workspace-scoped invites (including for existing accounts), role
changes, member removal and self-leave, workspace rename/slug/colour, delete/leave, owner-only plan
change. UI for all of it."
**Deliverable:** "the membership table is the single source of truth for access; the members page
works through dedicated endpoints instead of rewriting the document."
**Verified:** 2026-10-22T08:05:00Z
**Status:** passed
**Re-verification:** No — initial verification (no prior VERIFICATION.md in the phase directory)
**Verifier stance:** FORCE. SUMMARY.md was treated as a claim, not evidence. Every truth below was
re-derived from `02-SPEC.md`/`02-PLAN.md` and re-proven independently: a real `server.js` on an
ephemeral port with its own `DATA_DIR` and real SQLite, plus a real Chromium session against the
built app. No repo file was modified — `git status` clean (only the pre-existing untracked
`01-VERIFICATION.md` / `03-VERIFICATION.md`).

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | An admin+ can create a **workspace-scoped** invite for an address; pending invites are listed for admin+ only; an invite can be revoked; a revoked/used/expired link answers 404/410 | ✓ VERIFIED | `server.js:1436-1525` (POST invites — min role `admin`, `workspace_id` bound to `ctx.ws.id`), `:1527-1531` (GET invites, admin), `:1533-1542` (DELETE by `token_hash`, admin), `:1544-1558` (GET token → 404 unknown / 410 used / 410 expired). `test/membership.test.mjs:78-98` (invite list visible to owner **and** admin, empty for a member), `:154-168` (revoke once → 200, second revoke → 404, link → 404), `:170-178` (expired → 410 on GET and accept). Independent HTTP probe: inviting `resend@test.local` twice → first token `410`, second `200`, pending list holds exactly one entry with the new role; inviting an existing member → `409 {"error":"owner@test.local is already a member of Acme"}` |
| 2 | An **existing account** can accept an invite: the preview reports `existing`, accept from the signed-in matching session adds the membership, an unsigned-in existing account gets `409 {needsSignIn:true}` | ✓ VERIFIED | `server.js:1544-1558` (`existing: !!(row.email && <account row>)`), `:1560-1623` (accept: `session.email === invite.email` → `addMembership`; account exists but nobody signed in → `409 {needsSignIn:true}` at 1576; invite marked used at 1602-1605). `test/membership.test.mjs:48-76` (existing account joins the roster with the invited role; membership appears once, invite consumed), `:132-146` (`409` + `needsSignIn:true`, then the signed-in account accepts → 200, used link → 410). Client: `src/pages/auth.js:46-53` ("already has a Projects account. Sign in with it to join"), `src/actions/actions.js:2511-2520` (`needsSignIn` → switch to the login form), `:2444-2447` (the queued token is accepted after login) |
| 3 | Roles change through a dedicated endpoint with the server-side ordering (owner > admin > member/viewer); self-management is refused; only an owner grants/revokes owner; unknown roles are rejected | ✓ VERIFIED | `server.js:1358-1421` (PATCH `members/:userId`, min role `admin`): self → `409 "Use “Leave workspace” to remove yourself"` (1366); admin acting on an admin/owner → `403 "Only an owner can manage admins and owners"` (1368-1370); granting `owner` by a non-owner → `403` (1384-1386); demoting the last owner → `409` (1387-1389); unknown role → `400` (1383); non-member target → `404` (1365). `test/membership.test.mjs:180-206` (promotion, demotion, admin-cannot-manage-admin/owner, admin-cannot-grant-owner, self → 409, unknown role → 400, unknown user → 404) and `:208-212` (last owner cannot leave → 409). Chromium: owner opened the role popover → **4 options** (Owner/Admin/Member/Guest) and picked Admin → toast "Bob is now an Admin"; server confirmed `memberships.role='admin'` and the document profile followed (`role:'Admin'`) |
| 4 | Removing a member deletes the membership **and** cleans their document footprint (profile, task + subtask assignees, project roster, project perms, team roster), bumps the revision, and revokes access — in one transaction | ✓ VERIFIED | `server.js:1372-1379` (DELETE inside `transaction()`: membership delete + `updateDoc(... stripMember(doc, row.member_id, target.id))`; `updateDoc` 697-704 bumps `revision`; `stripMember` 664-694 unassigns tasks/subtasks, filters project members/perms/lead, filters team rosters; `409` if a private project would be left empty, 685-690). `test/membership.test.mjs:224-279` (revision +1, profile gone, task assignee null, subtask assignee null, project roster and perms stripped, team roster stripped, removed account → `GET` 404). Chromium: owner → "Member options" → "Remove from workspace" → confirm → toast "Removed Bob", roster back to 1 person; server confirmed the account's `GET /api/workspaces/acme` → `404` and `workspaces: []` |
| 5 | Self-leave removes the membership and the document footprint, returns `nextSlug`, and the last owner is refused | ✓ VERIFIED | `server.js:1343-1356` (POST `leave`, min role `viewer`): last owner → `409 "Promote someone else to owner before you leave"` (1348-1350); otherwise membership delete + `stripMember` in one transaction, response `{left:true, nextSlug}` (1355). `test/membership.test.mjs:281-298` (leave → 200, `nextSlug:'gamma'`, access → 404; leaving the only workspace → `nextSlug:null`). Chromium: admin clicked "Leave workspace" → confirm ("Leave Acme?") → toast "You left Acme" and the app fell back to the no-workspace/setup screen; server confirmed `GET /api/workspaces/acme` → `404` and `workspaces: []` |
| 6 | An owner can delete the workspace; memberships and invites cascade; the response carries `nextSlug` | ✓ VERIFIED | `server.js:1319-1329` (DELETE, min role `owner`: memberships, invites and the workspace row deleted in one `transaction()`; `{deleted:true, nextSlug}`). `test/membership.test.mjs:300-320` (cascade asserted row-by-row in SQLite: 0 memberships, 0 invites, 0 workspaces; the pending invite link → 404; the other workspace untouched; a non-owner delete → 403 at 282). Chromium: owner → Settings → Workspace → "Delete workspace" → type `acme` to confirm → toast "Acme deleted" and the app fell back to the no-workspace/setup screen; independent SQLite check afterwards: `workspaces 0, memberships 0, invites 0`, `GET /api/workspaces/acme` → 404 |
| 7 | The plan is a label changed **only** by the owner through its own endpoint, and never through the document | ✓ VERIFIED | `server.js:1423-1433` (POST `plan`, min role `owner`; only `Free`/`Team`/`Business`, else 400). `server.js:581` (`next.data.plan = stored?.data?.plan` — the document can never set it). `test/membership.test.mjs:214-222` (admin → 403, member → 403, unknown plan → 400, owner → 200, and the served document shows the new plan). `test/tenancy.test.mjs:140-164` (a member's document write that sets `data.plan='Business'` is discarded: served plan stays `Team`). Adversarial probe (below) — a **document** plan write by an *admin* is also discarded (`plan: Team`). Chromium: owner → Billing → Plan → "Downgrade" → confirm → header becomes "Free · $0 per member / month" / "No renewal · Free forever"; as admin the buttons are disabled ("Contact the owner") |
| 8 | The workspace can be renamed / re-slugged / recoloured by admin+, and the settings UI exposes it | ✓ VERIFIED | `server.js:1292-1317` (PATCH `api/workspaces/:slug`, min role `admin`; name, slug validated `^[a-z0-9-]{2,40}$`, unique-slug 409 with a suggestion, colour `^#[0-9a-f]{6}$`; the row is the source, not the document). `test/tenancy.test.mjs:140-164` (member PATCH → 403), `:166-176` (slug validation/uniqueness). Client: `src/pages/settings.js:92-101` (name, URL and colour swatches; read-only + "Only workspace admins can change these settings." for a member), `src/actions/actions.js:2158-2190` (`saveWorkspace` → `api.patchWorkspace`, URL change behind a confirmation), `:2152-2156` (colour → `api.patchWorkspace({color})`). Chromium as owner: the form is editable and carries a "Save changes" button; as a member: read-only, no save button |
| 9 | **The membership table is the single source of truth for access** — on read the document's roles follow the memberships, on write the document cannot change them | ✓ VERIFIED | Read: `server.js:551-556` (`docForClient` → `syncProfiles(out, ws.id)`), `:646-661` (`syncProfiles` overlays `role`/`status`/`member_id` from `memberships` for every profile with a `userId`, heals a missing profile, converts legacy `last` timestamps). Write: `server.js:558-584` (`docFromClient`: a non-admin's whole roster is restored from storage at 565-566; for an admin, every incoming account profile keeps the **stored** `role`/`status`/`userId`/`email` at 572-578, and a profile whose `userId` has no membership is dropped at 577). **Adversarial probe** (real server, real SQLite, admin account): the admin fetched the document, set its own `role` to `Owner` and the owner's `role` to `Member`/`deactivated`, set `data.plan='Business'`, and appended a fake profile `userId=ghost-user-id` with `role:'Owner'`; after the PUT the served document showed `owner@test.local → Owner/active` and `bob@test.local → Admin/active` (escalation and demotion ignored), the ghost profile was **dropped**, and the plan stayed `Team`; the `memberships` table was unchanged. **Overlay proof** (PLAN T1's own check): flipping `memberships.role` from `admin` to `viewer` by hand in SQLite made the served document follow immediately (`bob@test.local` → `Guest`) and the roster agree (`viewer`) |
| 10 | The members page works through **dedicated endpoints** instead of rewriting the document | ✓ VERIFIED | Client: `src/core/api.js:190-244` (`members`, `setMember`, `removeMember`, `leave`, `setPlan`, `deleteWorkspace`, `invites`, `revokeInvite` — every call is a scoped `/api/workspaces/:slug/...` request); `src/actions/actions.js:1699-1726` (`refreshMembers` reads the roster and mirrors it into `S.data.members`), `:341-359` (role change → `api.setMember` → refetch), `:1792-1827` (removal → `api.removeMember` → refetch), `:1739-1747` (revoke → `api.revokeInvite` → refetch), `:1758-1790` (leave/delete → `api.leave`/`api.deleteWorkspace` → navigate by `nextSlug`). The page never PUTs the document to change a role: `src/pages/members.js` has no document mutation, and the demo-only branch is guarded by `api.enabled` |
| 11 | Members UI: the roster and the pending invites come from the server on route entry; role controls are shown only to actors who may manage the target; invite/resend/revoke are server-backed | ✓ VERIFIED | `src/actions/actions.js:196` + `src/main.js:187` (`refreshMembers()` on entering the members route), `:1699-1726` (mirror the roster into `S.data.members`, keep cosmetic fields, `S.ui.pendingInvites = res.data.invites`), `src/pages/members.js:17-21` (`isAdmin`/`isOwner` gates, `canManage` forbids self and admin/owner targets), `:48` (role dropdown only when `canManage`), `:58-67` (pending-invite panel with Resend + Revoke, admin+ only). Chromium (owner): roster "2 people in Acme · 1 pending", pending panel shows `pending@test.local — Invited as Admin · expires in 7 days` with **Resend**/**Revoke**; invite modal → "Create links" → "1 invite link created" with a `/join/<token>` link; **Revoke** → "Invite for pending@test.local revoked" and the panel empties. Chromium (plain member): **no** "Invite member" button, **no** pending panel ("0 pending"), roles rendered as plain badges, and the member context menu offers only View profile / Assign a task / Copy email — no "Change role…" / "Remove from workspace" (`src/overlays/context-menu.js:61-70`). Chromium (admin): sees the invite button and the pending panel, but the owner's row is a plain badge |
| 12 | Settings UI: Leave workspace for non-owners, Delete workspace for owners (type-the-URL confirmation), owner-only plan buttons, workspace rename/slug/colour — and the leave/delete path navigates by `nextSlug` | ✓ VERIFIED | `src/pages/settings.js:92-118` (workspace section, Danger zone: "Leave workspace" always, "Delete workspace" only when `api.workspace?.role === 'owner'`), `:392-416` (plan: `planAdmin = api.workspace?.role === 'owner'`; otherwise a disabled "Contact the owner" button). `src/actions/actions.js:1750-1757` (`leaveTo(nextSlug)` → `openWorkspace(nextSlug)` or `enterNoWorkspace()`), `:1758-1773` (leave + confirm), `:1774-1790` (delete + `typeName` confirmation). Chromium: owner sees both buttons; admin and member see "Leave workspace" only; admin's plan buttons are disabled; after leave and after delete the app lands on the no-workspace/setup screen (toast "You left Acme" / "Acme deleted") |
| 13 | **R2** — an account can hold several memberships with a role per workspace | ✓ VERIFIED | `server.js:105-111` (`memberships` PK `(workspace_id, user_id)` with a `role` column), `:220-229` (`membershipsOf` — one row per workspace), `:244-251` (`userPayload` lists each workspace with **its own** role and `memberId`), `:231-241` (`workspacePayload` carries the caller's role for that workspace). `test/tenancy.test.mjs:52-68` (one account owns `acme` **and** `beta`; the list shows the role per workspace). `test/membership.test.mjs:281-298` (Eve holds `acme` as member and `gamma` as owner, and the role differs per workspace) |
| 14 | **R3** — `/w/:slug` addresses a workspace; share/invite links are workspace-scoped | ✓ VERIFIED | `src/main.js:128-129` (slug parsed from `/w/:slug/...`), `server.js:1246,1292,1319,1332,1343,1358,1423,1436,1533` (every workspace route is slug-scoped). Invite links: the invite row carries `workspace_id` (`server.js:1477`), the token preview resolves to that one workspace (`server.js:1550-1557`), and the join URL is `/join/<token>` → `src/main.js:127,143`. `test/membership.test.mjs:55-58` (the invite preview reports `workspace.slug === 'acme'` and `workspace.name === 'Acme'`). Chromium: the members page and settings operate on `/w/acme`; the invite link produced by the UI is `http://127.0.0.1:8099/join/<token>` and lands in that workspace |
| 15 | **R4** — every API call is authorised against the caller's membership of that workspace | ✓ VERIFIED | `server.js:1068-1084` (`requireWorkspace`: unknown slug **or** missing membership → `404`; role below the minimum → `403`); every new route funnels through it — members `1334` (viewer), PATCH/DELETE member `1360` (admin), leave `1345` (viewer), plan `1425` (owner), invites POST `1438` (admin), invites GET `1528` (admin), invite DELETE `1535` (admin), workspace DELETE `1320` (owner). `test/membership.test.mjs:93-97` (a member never receives the invite list), `:192-195` (403 for an admin acting on an admin/owner, 409 for self), `:215-216` (403 for admin/member on the plan), `:282` (403 for a non-owner delete). A removed member and a left member both get `404` on the workspace (`:278`, `:292`) — confirmed again in the browser (`404` after leave and after removal) |
| 16 | **R7** — creation is flag-driven (`ALLOW_SIGNUP`), invitations are workspace-scoped, and an existing account can accept an invite | ✓ VERIFIED | `server.js:56` (`ALLOW_SIGNUP`), `:1137-1140` (`/api/config` exposes `signup` and `workspaceCreation: 'open' | 'admins'`), `:1187` (signup closed → 403), `:1228-1230` (workspace creation: open when the flag is on, otherwise owner/admin only). `test/membership.test.mjs:100-130` (with `ALLOW_SIGNUP=false`: signup 403, `workspaceCreation:'admins'`, a plain member cannot create a workspace → 403, an owner can → 201, and **an invite still onboards a new account** → 201). Invites are workspace-scoped: `server.js:1436-1525` (the invite row's `workspace_id` is the caller's workspace; the route is `/api/workspaces/:slug/invites`). Existing-account accept: `server.js:1560-1623` + `test/membership.test.mjs:132-146` (see truth 2) |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified)

### Requirement Coverage

| Requirement | Description | Phase | Status | Evidence |
| ----------- | ----------- | ----- | ------ | -------- |
| **R2** | An account can hold several memberships with a role per workspace. | 2 | ✓ VERIFIED | `server.js:105-111` (memberships PK `(workspace_id, user_id)` + `role`), `:220-229` (`membershipsOf`), `:231-251` (per-workspace role in the payloads); `test/tenancy.test.mjs:52-68` (one account owns `acme` and `beta`); `test/membership.test.mjs:281-298` (Eve: member of `acme`, owner of `gamma`) |
| **R3** | `/w/:slug` addresses a workspace; all share/invite links are workspace-scoped. | 2 | ✓ VERIFIED | `src/main.js:128-129`; every workspace route slug-scoped (`server.js:1246-1542`); invite rows carry `workspace_id` (`server.js:1477`) and the token preview resolves to that workspace (`server.js:1550-1557`, `test/membership.test.mjs:55-58`); Chromium: `/w/acme/members`, `/w/acme/settings` and the `/join/<token>` invite link all address the right workspace |
| **R4** | Every API call is authorised against the caller's membership of that workspace. | 2 | ✓ VERIFIED | `server.js:1068-1084` (`requireWorkspace` — 404 unknown/unauthorised, 403 by role) applied by every new route (`:1334` viewer, `:1360` admin, `:1345` viewer, `:1425` owner, `:1438`/`:1528`/`:1535` admin, `:1320` owner); `test/membership.test.mjs:93-97, 192-195, 215-216, 278, 282, 292`; browser: a removed member and a left member both get `404` |
| **R7** | Creation is flag-driven (`ALLOW_SIGNUP`), invitations are workspace-scoped, and an existing account can accept an invite. | 2 | ✓ VERIFIED | `server.js:56, 1137-1140, 1187, 1228-1230`; `test/membership.test.mjs:100-130` (`ALLOW_SIGNUP=false` → signup 403, creation restricted to owner/admin, invites still onboard) and `:132-146` (existing account → `409 {needsSignIn:true}` → signed-in accept → membership); `server.js:1436-1525` (workspace-scoped invites) |
| R1 | A workspace is a row in `workspaces` with a unique slug and its own document. | 1 | n/a (pre-existing) | Verified in `01-VERIFICATION.md`; unchanged by phase 2 (`server.js:943-962`, `:1304-1309`) |
| R5 | Private projects are never sent to non-members and cannot be modified by them. | 3 | n/a (later phase) | Verified in `03-VERIFICATION.md`; phase 2 does not weaken it (`stripMember` refuses to empty a private project, `server.js:685-690`) |
| R6 | Existing installs migrate in place, without data loss, with a pre-migration backup. | 4 | n/a (later phase) | Verified in phase 4; phase 2 is additive (no schema change) |
| R8 | Lint, format, build and the new server tests pass in CI. | 4 | ✓ (side effect) | `npm run lint` → clean · `npm run format:check` → "All matched files use Prettier code style!" · `npm test` → **44/44 pass** (13 of them the phase-2 membership suite) |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` | Membership helpers, member/leave/plan/invite endpoints, read+write overlay | ✓ VERIFIED | Helpers: `roleRank` 587, `membersOf` 592, `memberPayload` 603, `invitesOf` 622, `ownerCount` 642, `syncProfiles` 647, `stripMember` 664, `updateDoc` 697, `transaction` 706, `ensureMember` 880, `addMembership` 911. Endpoints: members GET 1332, leave 1343, member PATCH/DELETE 1358, plan 1423, invites POST 1436 / GET 1527 / DELETE 1533, invite preview 1544, invite accept 1560, workspace DELETE 1319. Read/write overlay: `docForClient` 551, `docFromClient` 558 |
| `src/core/api.js` | Client calls for the whole lifecycle | ✓ VERIFIED | 190-244 — `members`, `setMember`, `removeMember`, `leave`, `setPlan`, `deleteWorkspace`, `invites`, `revokeInvite`; `acceptInvite` (248-252) surfaces `needsSignIn` through the caller; the local workspace list is updated on leave (211) and delete (228) |
| `src/actions/actions.js` | Server-backed member actions, roster mirroring, leave/delete navigation | ✓ VERIFIED | 1699-1726 `refreshMembers`; 341-359 role change; 1728-1737 resend; 1739-1747 revoke; 1750-1790 leave/delete + `nextSlug`; 1792-1827 removal; 1644-1651 invite submit (server mode) — `addInvitedMember` (1570-1597) is now only reached in demo mode (1619) |
| `src/pages/members.js` | Server roster, role controls, pending invites | ✓ VERIFIED | 16-21 gates; 48 role dropdown only for `canManage`; 58-67 pending panel (admin+ only) |
| `src/pages/settings.js` | Leave/Delete/plan/rename UI | ✓ VERIFIED | 92-118 workspace section + Danger zone; 392-416 plan section |
| `src/overlays/popovers.js` | Role popover (owner 4 options, admin 3) | ✓ VERIFIED | 220-239 — `me()?.role === 'Owner' ? ['Owner','Admin','Member','Guest'] : ['Admin','Member','Guest']` (Chromium confirmed 4 options for the owner) |
| `src/overlays/context-menu.js` | Member context menu gated by role | ✓ VERIFIED | 61-70 — `canRm` requires admin/owner and forbids self and admin/owner targets; Chromium as a plain member: no "Change role…"/"Remove from workspace" |
| `src/pages/auth.js` | "Sign in to accept" for an existing account | ✓ VERIFIED | 40-64 — the `existing` branch renders a sign-in invitation instead of a sign-up form |
| `test/membership.test.mjs` | HTTP coverage of the phase-2 lifecycle | ✓ VERIFIED | 320 lines, **13 tests / 13 pass** — real `server.js`, real SQLite, real HTTP via `test/helpers/server.mjs`; no mocked SQLite or HTTP |
| `DEPLOY.md` | Member management / leave / delete / revocable invites documented | ✓ VERIFIED | phase-2 commit `7538b53` (+32 lines) documents member management, leaving, deleting and revocable pending invites |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `GET /api/workspaces/:slug/members` | `memberships` table | `membersOf(ctx.ws.id)` → `memberPayload(row, doc, selfId)` | ✓ WIRED | `server.js:1337-1340`, 592-619 — the roster is a SQL join over `memberships`, not the document |
| `syncProfiles` | the served document | `docForClient` → `syncProfiles(out, ws.id)` | ✓ WIRED | `server.js:554`, 646-661 — verified live: a hand-edited `memberships.role` changed the served document |
| `docFromClient` | the stored roster | `storedMembers` → `official` map → `role`/`status` from storage; unknown `userId` dropped | ✓ WIRED | `server.js:564-579` — verified live: escalation, demotion, ghost profile and plan tampering all discarded |
| `PATCH members/:userId` | `memberships.role` + document profile | `transaction()` → `update memberships set role` + `updateDoc(ensureMember …)` | ✓ WIRED | `server.js:1392-1404` — Chromium: role change persisted in the table and in the document |
| `DELETE members/:userId` | document cleanup | `transaction()` → `stripMember(doc, memberId, userId)` | ✓ WIRED | `server.js:1374-1377`, 664-694 — `test/membership.test.mjs:264-278` |
| `POST leave` | document cleanup + navigation | `transaction()` → `stripMember` → `{left, nextSlug}` | ✓ WIRED | `server.js:1351-1355`; client `src/actions/actions.js:1750-1770` |
| `POST /invites` | `invites` table | `insert into invites (… workspace_id …)` | ✓ WIRED | `server.js:1477-1487` — the invite belongs to `ctx.ws.id` |
| `POST /invites/:token/accept` | `memberships` | `addMembership(ws, user, invite.role)` | ✓ WIRED | `server.js:1598-1605`; `test/membership.test.mjs:63-76` |
| `POST /plan` | `data.plan` | `transaction(() => updateDoc(… doc.data.plan = plan))` | ✓ WIRED | `server.js:1431`; the document can never set it (`server.js:581`) |
| Client members page | the dedicated endpoints | `refreshMembers` → `api.members()` / `api.setMember()` / `api.removeMember()` / `api.revokeInvite()` | ✓ WIRED | `src/actions/actions.js:1699-1827` — no document PUT carries a role change |
| Client settings | leave / delete / plan | `api.leave()`, `api.deleteWorkspace()`, `api.setPlan()` → `nextSlug` navigation | ✓ WIRED | `src/actions/actions.js:1750-1790`, `:2346` |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `server.js` `membersOf` | `members[]` | SQL join `memberships ⋈ users` | ✓ — live rows, ordered by join date | ✓ FLOWING |
| `server.js` `invitesOf` | `invites[]` | SQL over `invites` (pending, unexpired) | ✓ — live rows; the raw token is never returned, only its hash | ✓ FLOWING |
| `server.js` `docForClient` | `doc.data.members[].role/status` | `memberships` (via `syncProfiles`) | ✓ — live SQL rows overlaid on the stored profiles | ✓ FLOWING |
| `src/actions/actions.js` `refreshMembers` | `S.data.members`, `S.ui.pendingInvites` | `GET /api/workspaces/:slug/members` | ✓ — real roster and real pending list, mirrored with cosmetic fields preserved | ✓ FLOWING |
| `src/pages/members.js` | roster table, pending panel | `D().members` / `S.ui.pendingInvites` | ✓ — Chromium: "2 people in Acme · 1 pending" with the real pending address | ✓ FLOWING |
| `src/pages/settings.js` | plan panel | `D().plan` from the served document | ✓ — Chromium: "Free · $0 per member / month" after the owner-only change | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-2 membership lifecycle over HTTP | `node --test test/membership.test.mjs` | 13 tests, **13 pass**, 0 fail (2.07 s) | ✓ PASS |
| Full server suite (R1–R8 context) | `npm test` | 44 tests, **44 pass**, 0 fail (4.18 s) | ✓ PASS |
| Lint / format | `npm run lint` · `npm run format:check` | clean · "All matched files use Prettier code style!" | ✓ PASS |
| Adversarial "membership table is the source of truth" probe (admin tampers role ×2, plan, ghost profile → PUT → re-read) | independent Python HTTP probe on a real server + SQLite | escalation ignored (`bob` stayed `Admin`), demotion ignored (`owner` stayed `Owner`), ghost profile dropped, plan stayed `Team`, `memberships` unchanged | ✓ PASS |
| Read-overlay probe (flip `memberships.role` admin→viewer in SQLite, re-read the document) | independent Python HTTP probe | served document followed: `bob@test.local` `Admin` → `Guest`; roster agreed (`viewer`) | ✓ PASS |
| Invite replacement / duplicate probe | `POST /invites` twice for one address; `POST /invites` for an existing member | first link `410`, second `200`, one pending entry with the new role; existing member → `409 already a member` | ✓ PASS |
| Browser UAT — owner: roster, role popover (4 options), role change, invite modal, pending panel, Resend/Revoke, remove, leave, plan change, delete workspace | Chromium (MCP) against the built app on a real server | every flow produced the expected server-backed state and toast (details in truths 1–12) | ✓ PASS |
| Browser UAT — admin: invite button + pending panel present, owner row not editable, no "Delete workspace", plan read-only, member context menu restricted | Chromium | `Invite member` shown, `Delete workspace` absent, plan buttons disabled ("Contact the owner") | ✓ PASS |
| Browser UAT — plain member: no invite button, no pending panel, no role dropdowns, no remove/change-role entries, read-only workspace settings | Chromium | `inviteBtn=false`, `pendingPanel=false`, context menu = View profile / Assign a task / Copy email | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Committed phase-2 suite | `node --test test/membership.test.mjs` | exit 0 — 13/13 | PASS |
| Committed full suite | `npm test` | exit 0 — 44/44 | PASS |
| Verifier probes (tamper-proofing, read overlay, invite replacement) | independent Python HTTP clients against `server.js` on an ephemeral port with a private `DATA_DIR` | all assertions as tabulated above | PASS |
| Verifier browser UAT (owner / admin / member) | Chromium (MCP) against `http://127.0.0.1:8099` serving the built `dist/` | all flows as tabulated above | PASS |

**Note on test provenance:** `test/membership.test.mjs` was written in phase 4 (commit `943d87c` "test(04-01):
membership lifecycle suite over HTTP"), after phase 2. It therefore post-dates the phase-2 commits and
is *not* proof that phase 2 was complete on its own; it is used here as an independent, executable
re-statement of the phase-2 contract, alongside the verifier's own probes and browser UAT performed
against the current tree. Nothing in the phase-2 behaviour depends on phase-4 code: the endpoints are
in `server.js` from commit `d8653a5` and the client wiring from `6f82096` / `b581e97`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | no `TBD` / `FIXME` / `XXX` debt markers in any phase-2 file (scan of `server.js`, `src/core/api.js`, `src/actions/actions.js`, `src/pages/members.js`, `src/pages/settings.js`, `src/overlays/popovers.js`, `src/overlays/context-menu.js`, `src/main.js`, `src/pages/auth.js`, `src/pages/home.js`, `src/core/store.js`) | — | none |
| — | — | no stub returns, no `console.log`-only implementations, no hard-coded empty roster in the phase-2 paths: the members page renders from `D().members` / `S.ui.pendingInvites`, which are filled from the server | — | none |
| `src/pages/settings.js` | 105 | "Leave workspace" is rendered for every signed-in user, including the **last owner**, who the server then refuses (`server.js:1348-1350` → `409 "Promote someone else to owner before you leave"`). `02-SPEC.md:129` says the button is for "everyone who is not the last owner" | ⚠️ Warning | Cosmetic only: the invariant the SPEC cares about (the last owner cannot leave) **is** enforced server-side and tested (`test/membership.test.mjs:208-212`); the client shows the server's message. A UI that hides the button for a sole owner would match the SPEC wording more closely. Not scored as a gap |
| `src/actions/actions.js` | 2726-2729 | "Exit setup" (`A.onbExit`) sets `S.ui.auth = null` and renders the shell, which for a signed-in server user with no workspace shows the **local demo document** (the seeded sample workspace) instead of the no-workspace screen | ℹ️ Info | Pre-existing behaviour (introduced in `99dbb3a` "Initial release", not by phase 2) and outside the phase-2 scope; phase 2's own leave/delete paths land on the correct no-workspace/setup screen (verified in Chromium). Disclosed, not a phase-2 gap |
| `server.js` | 1368-1370 | An admin may promote a **member** to admin (the target is still a member at the moment of the action) but may not touch an existing admin or an owner | ℹ️ Info | Matches `02-SPEC.md:73-74` (an admin acting on a member/viewer is allowed; only an owner manages equals and betters) and the client rule at `02-SPEC.md:132-133` (an admin is offered Admin/Member/Guest). The SUMMARY lists it as a deviation from PLAN.md; it is consistent with the SPEC |

### Human Verification Required

None. Every observable truth was proven with executable evidence: real HTTP against a real server with
real SQLite (including adversarial probes), and a real Chromium session against the built app for all
the role-gated UI states (owner, admin, plain member). No visual/aesthetic judgement, no external
service and no state-mutating manual step remains open for this phase.

### Gaps Summary

No gaps. The phase goal is achieved in the codebase, not merely in the summary:

- **The membership table is the single source of truth.** Proven in both directions: on read,
  `syncProfiles` overlays the document's roles from `memberships` (a hand-edited `memberships.role`
  immediately changed the served document); on write, `docFromClient` discards any role/status/plan
  the client sends and drops profiles whose `userId` has no membership (an admin's tampered document
  — self-escalation to Owner, demotion of the owner, a ghost profile, `plan='Business'` — was
  rejected in full while the legitimate edit persisted).
- **The members page works through dedicated endpoints.** `GET/PATCH/DELETE /api/workspaces/:slug/members`,
  `POST .../leave`, `POST .../plan`, `GET/DELETE .../invites` and `DELETE /api/workspaces/:slug` are
  implemented, role-gated, transactional and wired to the client; no member change is expressed as a
  document rewrite.
- **UI for all of it** was confirmed in Chromium for the owner (roster, 4-option role popover, role
  change, invite, resend, revoke, remove, leave, plan change, delete), the admin (invite + pending
  list, no owner-only controls, read-only plan) and a plain member (no invite button, no pending
  list, no role or removal controls, read-only workspace settings).

One cosmetic deviation from the SPEC wording is disclosed above (the "Leave workspace" button is shown
to a sole owner, who the server then refuses) and one pre-existing, out-of-scope behaviour is noted
("Exit setup" falls back to the local demo document). Neither affects the phase goal or the R2/R3/R4/R7
requirements.

---

_Verified: 2026-10-22T08:05:00Z_
_Verifier: the agent (gsd-verifier) — initial verification, FORCE stance_
