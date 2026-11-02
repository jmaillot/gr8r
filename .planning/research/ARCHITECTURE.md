# Architecture Research — v1.7 "Team Visibility & Hardening" seams

**Domain:** Self-hosted PM workspace (single `server.js`, `node:sqlite`, JSON workspace document)
**Researched:** 2026-11-02
**Confidence:** HIGH — every claim below was read in the current tree this session; Node 24.5.0 confirmed (`server.js:1`) and the `node:sqlite` transaction/UDF surface verified against Node docs.

This file maps **where each of the six v1.7 items hooks into the existing architecture**, the minimal-change seam, cross-item interactions, and regression risks to v1.6 behavior. It replaces the generic architecture template with a seam map, which is what the v1.7 roadmapper needs.

---

## System Overview — the funnel the six items must respect

```
                    ┌────────────────────────────────────────────┐
                    │  Authority tables (node:sqlite)            │
                    │  workspaces(doc JSON, revision)  :203      │
                    │  memberships(role, scope)        :213      │
                    │  team_members (D-01 rows)        :227      │
                    │  invites(role, teams, scope)     :235      │
                    └──────────────┬─────────────────────────────┘
                                   │
        READ                       │                      WRITE
  docForClient ──► normalizeDoc ──►│──► PUT /api/workspaces/:slug
  (server.js:1305)  (server.js:603)│    (server.js:1309)
        │                          │          │
        ▼                          │          ▼
  redactDoc(doc, membership)       │    mergeClientDoc(incoming, stored, membership, wsId)
  (server.js:860)                  │    (server.js:922)
        │                          │          │
        └────► hiddenFor(doc, membership) ◄────┘   ← THE single hidden-project funnel
               (server.js:730-739)                  Both sides consume it; neither
               └─ projectScope (server.js:671)      builds a second pipeline.
               └─ hiddenProjectIds / canSeeProject (server.js:782, :649)
```

Line numbers refer to `server.js` unless prefixed (`src/…`, `docker-compose.yml`).

---

## (a) VIS — where visibility resolves today and the team-intersect seam

### Current resolution chain

1. **`hiddenFor(doc, membership)` — server.js:730-739.** The ONE funnel (contract comment at 704-712). Two branches:
   - `projectScope(membership)` returns `null` (unscoped or admin/owner — :672) → `hiddenProjectIds(doc, member_id)` (:782) → `canSeeProject` (:649): private-only hiding. **Team-blind today.**
   - Scoped member → per-project `inScopeProject(p, scope)` (:698-702: `p.id ∈ scope.projects` **OR** `p.teams ∩ scope.teams ≠ ∅`) ∧ `scopeGrants` (:722-728, D-03 inversion). Note the scoped branch *already* intersects `p.teams` — but against the **scope column's** team list, not against the member's `team_members` rows.
2. **`redactDoc`** (:860-885) and **`mergeClientDoc`** (:922-1037) both call `hiddenFor` once (:864, :931). Everything downstream — tasks, comments, files, activity, notifs, events, savedViews, projOrder, per-view filters (`scrubProjectFilters` :797), recent searches (:882) — derives from that one set.

### The minimal-change seam

**Extend `hiddenFor` only — never add a second funnel.** The team-intersect predicate is:

```
visible(p) = p.teams ∩ memberTeams ≠ ∅   OR   p.teams is empty (no-team → workspace-wide)
```

memberTeams comes from the `team_members` authority rows (`select team_id from team_members where workspace_id = ? and user_id = ?`, exact query already at :1379). **Signature caveat:** `hiddenFor(doc, membership)` receives the memberships row and never queries `team_members` — the membership row carries `workspace_id` (schema :213), so either query inside `hiddenFor` or pass the resolved team set in. The former is the smaller diff: one SQL call memoized per request.

Composition with Phase-29 scope (the ordering question):

| Membership shape | Desired result | Composition |
|---|---|---|
| admin/owner | workspace-wide (unchanged) | `projectScope` returns null at :672 — keep that exemption; do NOT let VIS blind admins |
| unscoped, no-team member | private-only ∪ team-gated | `hidden = privateHidden ∪ {p : p.teams nonempty ∧ p.teams ∩ ∅ = ∅}` |
| unscoped, in teams | private-only ∪ projects outside their teams | same, intersect nonempty |
| scoped member (scope ≠ null) | scope already subtracts; VIS is subsumed **except** explicit `scope.projects` entries on projects whose teams the member isn't on — the D-03 explicit-project grant must survive VIS | `hidden = privateHidden ∪ outOfScope ∪ teamGated`, evaluated per project; scope grants short-circuit VIS |

The structurally safe form mirrors the existing comment at :708-712: build the hidden set **additively** (`privateHidden ∪ outOfScope ∪ teamGated`) rather than conjunctively, so grant inversions keep working.

### Downstream consumers that must adopt the same predicate (regression surface)

- **Send-time scope filtering** — reminders (:1239 uses `inScopeProject`), email mirror (:1110 `projectScope`), assignee write-guard (:1016-1036). These bypass `hiddenFor` and re-derive reach from the scope column alone. If VIS lands only in `hiddenFor`, **team-hidden projects still leak through notification emails and reminder emails**. Each site needs the same team-intersect helper.
- **`mergeClientDoc` restoration** (:939-1009) gets VIS for free via `hiddenFor(stored, membership)` at :931 — but a *scoped caller's* PUT reserves out-of-scope rows; VIS-gated rows will now also be reserved. That is correct behavior; expect test-matrix growth (the v1.6 404-matrix pattern is the model).
- **Seed data** (`src/data/seed.js`): projects with no `teams[]` must read as workspace-wide — `normalizeProjects` (:753-760) already guarantees `p.teams` is an array, so the empty-array case is the rule's anchor. Idempotent.

**Cross-item: VIS × SEARCH.** `hiddenProjectTerms` (:825-834) is derived from the hidden set, so team-hidden projects automatically add redaction terms — the recent-search filter (:882) tightens for free. More terms = more aggressive substring blocking (see (c)).

**Cross-item: UNDO × VIS.** `restore()` re-PUTs a stale doc that flows through `mergeClientDoc`; an admin doing a team undo is workspace-wide so no VIS interference — but document this invariant in tests (undo must be exercised as admin).

---

## (b) HARD — invite accept, firstWorkspace(), guest-profile writes

All sites pinned:

| Site | Location | Current behavior | v1.7 change |
|---|---|---|---|
| Invite **accept route** | `POST /api/invites/:token/accept` — **server.js:4316-4320** | `tooMany` throttle only. **No `sameOrigin(req)` guard** — every other mutation has one (e.g. invite DELETE :4293; the "Pitfall 22 order" comment pattern at :3402). | Add `if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', …)` as the FIRST check, before the throttle (matching :2869-2871 and :3402 order: sameOrigin → throttle). |
| `firstWorkspace()` definition | :594-596 | `select … order by created_at … limit 1`. | Not itself changed; its *fallback uses* are. |
| Fallback in **accept route** | **:4354** | `…get(invite.workspace_id) \|\| firstWorkspace()` — an invite with a dangling `workspace_id` silently lands the member in the oldest workspace. | Remove the fallback; `invite.workspace_id` is non-null on rows created since tenancy — return `410 workspaceGone` (:4355 already handles null ws) when the row is missing. |
| Fallback in **SSO invite reconcile** | **:2773** | Same `\|\| firstWorkspace()` inside the SSO-07 auto-accept (:2755-2808). Must be changed **in the same commit** — the two paths are contract-locked "VERBATIM" copies of each other (comment :2768-2771). | Same removal; keep the `if (ws)` guard at :2774 so a dangling invite is skipped, not fatal to login. |
| `firstWorkspace()` in read paths | :4822 (default workspace payload when no slug), :2166 | Read-side "no slug given" convenience, not a membership surface. | **Leave alone** — the requirement targets membership writes; changing :4822 breaks the SPA's default landing. |
| **Link-only (admin) invites** | invite creation, rows pushed at **:4242** — `email` may be empty for admin-created link invites | Anonymous, unbound token grants membership with the stored role/teams/scope. | Remove the unbound path: require a bound email at creation (:4180-4196 region validates role/scope). The `/join` GET (:4301-4314) stays anonymous for the preview page; only *accept* tightens. |
| **Guest-profile spoof** | accept body handling, **:4327-4352** | With no session and an unbound invite, `createUser(email, name, password)` runs on fully client-supplied name/email (:4335-4348); the `invite.email !== email` check (:4343) only fires for bound invites. A bearer of a link-only token mints an account with any profile, or a mismatched session silently becomes `user = null` (:4330) and mints a fresh one. | Falls out of removing link-only invites: every accept is email-bound, so :4343 covers identity and the spoof window closes. Keep the existing `accountExistsSignIn` 409 (:4331-4333). |

**Regression risk (HARD):** the Chromium e2e suite covers `/join` acceptance (PROJECT.md Phase 10) — those tests drive a real browser, so `sameOrigin` holds; but any test that POSTs accept directly with `fetch` from another origin, or accepts an email-less admin link, will fail and must be rewritten, not skipped. The SSO reconcile path (:2763-2808) has its own tests (SSO-07) that must keep passing with the fallback removed — fixture invites must carry a valid `workspace_id`.

---

## (c) SEARCH — recent-search redaction mechanics today

Exact mechanism, both sides of the funnel:

- **Term extraction:** `hiddenProjectTerms(doc, hiddenProjects)` (:825-834) — lower-cased `name` and `key` of every hidden project.
- **The predicate:** `referencesHidden` (:837) — `term.toLowerCase().includes(hiddenName)`; **one-directional substring** (term ⊇ name).
- **Read side:** `redactDoc` :882 drops any term containing a hidden name.
- **Write side:** `mergeRecentSearches(stored, incoming, hiddenTerms, keepStored)` (:844-858) — incoming terms matching a hidden name are dropped (:849); stored terms are re-admitted only when `keepStored` (true iff the caller hides ≥1 project, :989), preserving position (:852-856), capped at 5 (:857). This is what stops a redacted save from erasing shared history.
- **`normalizeDoc`** (:607) guarantees the array exists on every read.

**The leak, mechanically:** `includes` is one-directional, so two classes slip through:
1. A term that is a *substring of* a hidden name (`"Apo"` for project "Apollo") is never filtered — and the workspace-shared list means every member sees it.
2. Terms naming non-project surfaces (task titles, people) inside a hidden project are not in `hiddenTerms` at all.

The milestone's "document the free-text limitation" acknowledges class 2 is unfixable without indexing everything. **Minimal seam:** strengthen `referencesHidden` to bidirectional matching (`term.includes(name) || name.includes(term)`) — one expression, both call sites (:849 inside merge, :882 in redact) already route through it — and pair it with a `CHANGELOG.md`/docs note for the residual class-2 limitation. Going full word-boundary or `Intl.Segmenter` (available in Node 24) is over-treatment for a 5-item list and will over-block legitimate shared terms; if the owner wants it, it is still a single-function change.

**Regression risk:** the `keepStored` asymmetry tests (v1.6) assert exact list contents; bidirectional matching will filter more — update fixtures, verify the cap-5 splice indices stay stable.

---

## (d) SETTINGS — notifPrefs/invoices today and the per-user migration shape

### Today

- **`notifPrefs` is workspace-shared, inside the document.** Defaults merged on every read in `normalizeDoc` (:633-638 — the three reminder prefs default ON, read-only merge, never rewritten). Written by the settings UI through the ordinary doc PUT. Read at exactly two behavior-bearing sites: notification email gating (:1062) and the reminder scheduler's prefs gate (:1226). Seeded at :1584-1585.
- **`invoices` is already gone from the document.** Both write paths strip it (:1340-1341) alongside `plan`/`sessions`/`tfa` (D-30 precedent). So the SETTINGS item is effectively: **move `notifPrefs` (and give `invoices` a real per-user home if the owner still wants invoice rows) into per-user storage**, following the pattern every post-v1.1 table already established.

### Migration shape — copy the proven pattern, not a new one

The boot discipline to copy is `migrateTeamMembership` (:1706, with its rationale comment at :1692-1705):

1. **Additive `create table if not exists`** in the schema block (model: `team_members` at :227, `reminders_sent` at :288) — e.g. `user_settings(workspace_id, user_id, key, value_json, …)` or one table per concern; per-user rows keyed like `totp_factors` (:161).
2. **A `migrate*()` boot pass** registered in `bootstrap()` (:1670-1690), ordered after `migrateTeamMembership` (:1680) and before `ensureAdmin` (:1688). Migration order is load-bearing (the comment at :1673-1679 and v1.5's "Pitfall 2" discipline).
3. **Row-level eligibility guard**, not a global "table empty" check (:1693-1701) — this is what makes the second boot byte-identical: eligible iff the user has prefs in the doc AND no row yet. **`insert or ignore`** (pattern at :2277, :4007).
4. **No backup = no mutation** (:1703-1705 policy) — reuse the same pre-migration backup guarantee.
5. Transactions: `db.exec('begin immediate')` envelope (:1558) / `transaction()`; `node:sqlite` has no transaction API — BEGIN/COMMIT via exec or prepared statements (verified against Node 24 docs).

### Route + read-path changes

- New per-user read/write routes beside the membership routes (:3986-4010 region is the model for "dedicated route, own transaction, doc untouched, no revision claim"). `sameOrigin` first (:3988 pattern).
- The two doc-read sites (:1062, :1226) become per-user lookups with **workspace-shared fallback**: a user with no row inherits the doc's `notifPrefs` (which `normalizeDoc` keeps defaulting at :633-638). Do **not** delete `normalizeDoc`'s merge — it is the legacy/absent-row fallback and preserves the "existing workspaces are not rewritten" guarantee (:630-632).
- Keep `delete next.data.notifPrefs`? No — leave the doc field in place as fallback initially; stripping it from the doc is a separate, optional cleanup that would break older clients mid-flight. Decide explicitly in the phase; additive-only is the stated constraint (PROJECT.md).

**Regression risk:** the reminder-scheduler tests (REM-01..05) assert pref gating from the doc. Per-user rows change the lookup, not the semantics — keep the merged effective-prefs shape identical so the tests diff only in fixture setup.

---

## (e) UNDO — what the team undo captures today, and the trap

Verified end to end:

1. **Client `A.delTeam`** (`src/actions/teams.js:119-167`): purge happens **first** — every affected member is re-PUT through `api.setMemberTeams` (:136-144), which hits the admin route (`PUT …/members/:id/teams`, server.js:3986-4010) that does the transactional `delete from team_members … ; insert or ignore` (:4006-4009). Only **then** `snapshot()` (:150) and the doc mutate (:152-161), then the toast with `onAction: () => restore(snap)` (:164).
2. **The snapshot is client-state only** (`src/actions/actions.js:265-272`): `snapshot()` is `JSON.stringify(S.data)`; `restore()` parses it back and `save()`s — a doc PUT. Nothing outside `S.data` (i.e. **no `team_members` authority rows**) is captured.
3. **The trap:** undo re-PUTs a doc that still defines the team and still lists members in the (stale) projection — but the server strips doc-carried membership (:1344-1354) and the authority rows are already deleted. The server has **no reconcile pass** that re-derives `team_members` from a doc PUT (confirmed: no orphan-sweep exists; :3803 explicitly disclaims one). Result: team definition restored, memberships silently gone. This matches the recorded defect (PROJECT.md "Known deferred items").
4. There is also **no server-side team-delete route** — team deletion is purely a doc edit by the client plus the pre-PUT authority purge, so the server cannot currently offer a richer undo.

### Seam options (choose one in the phase; all are small)

| Option | Change | Trade-off |
|---|---|---|
| **A. Client compensating restore (recommended)** | `A.delTeam` already computes `affected` (:135) and the before-map pattern exists in `A.submitTeam` (:70, `before` Map). On `restore(snap)` for a team delete, replay `api.setMemberTeams` for each affected member from the captured before-map. The snapshot call must move **above** the purge (:150 → before :136) so the map is captured pre-delete. | Stays client-side; matches the D-01 "server call is the authority" discipline already in `submitTeam` (:80-109). Undo becomes multi-request — needs failure handling (the `results.some(r => !r?.ok)` rollback pattern at :101-108 is the model). |
| B. Dedicated server delete route | New admin route that deletes the team definition + purges rows in ONE transaction and records an undo payload (like the audit rows, :268). | Bigger change; a new membership-write surface in a milestone whose spirit is hardening, not new surface. |
| C. Remove the Undo offer for teams | Delete the `onAction` at :164; keep the confirm dialog's honest copy (:126). | Smallest possible diff; already sanctioned by the milestone wording ("or removes the misleading Undo offer"). |

**Regression risk (A):** undo after another admin has concurrently re-assigned members — the re-PUT would clobber their sets; the idempotent per-row guard style of `migrateTeamMembership` (insert only what's missing) or an `If-Match`-style guard on the teams PUT should be considered.

---

## (f) DEPLOY — compose key-rotation gap

- `docker-compose.yml` `environment:` forwards `MASTER_KEY` (line 39, required via `${MASTER_KEY:?…}`) but **not** `MASTER_KEY_PREVIOUS` — confirmed by grep: `MASTER_KEY_PREVIOUS` appears in `server.js` and `DEPLOY.md` only, never in the compose file.
- The server already supports the two-key keyring (`MASTER_KEY` + *optional* `MASTER_KEY_PREVIOUS`, v1.5 KEY-02; PROJECT.md L333-335) and `migrateTotpReWrap()` (:1687) performs the one-reboot rotation.
- **Minimal seam:** one line in the compose `environment:` block — `MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}` (empty default; absent key is a normal keyring state, and D-K2 validation only fails on *malformed* values, not absence). Optionally mirror the `:?` required-comment style. Then check `DEPLOY.md §14`'s parity tests (doc-parsing tests pin the runbook — v1.5 KEY-04) still pass; if they parse the compose file too, they may need the line added to their fixture.
- **Regression risk:** effectively none — this is the only item with no behavior change when the var is unset.

---

## Cross-Item Interaction Matrix

| | VIS | UNDO | HARD | SEARCH | SETTINGS | DEPLOY |
|---|---|---|---|---|---|---|
| **VIS** | — | undo re-PUT flows through `mergeClientDoc` → VIS; exercise undo as admin (workspace-wide) | no direct coupling | `hiddenProjectTerms` grows with team-hidden projects → SEARCH filters more aggressively; tune tests together | no coupling | none |
| **UNDO** | above | — | undo replay uses `setMemberTeams` PUT — its `sameOrigin`/admin gates apply | none | none | none |
| **HARD** | none | above | — | none | none | none |
| **SEARCH** | above | none | none | — | none | none |
| **SETTINGS** | none | none | none | none | — | none |
| **DEPLOY** | none | none | none | none | none | — |

**The one ordering decision that matters:** VIS must land **before or with** SEARCH tuning and **before** any send-time-filter test updates, because both the reminder/email paths (:1110, :1239) and the term list (:825) derive their behavior from what VIS makes hidden. Implement the team-intersect as one shared helper consumed by `hiddenFor`, `inScopeProject` callers at :1110/:1239, and nothing else.

## Regression Risks to v1.6 Behavior (ranked)

1. **Send-time filter bypass** (VIS): emails/reminders leak team-hidden projects unless :1110/:1239 adopt the predicate — the easiest silent regression.
2. **`scopeGrants` inversion broken** (VIS): a conjunctive rewrite of `hiddenFor` would forbid the D-03 scoped-guest-opens-private-project case, which has named tests.
3. **Admin blinding** (VIS): team-intersect must not apply above `ROLE_RANK.admin` (:672 exemption).
4. **SSO reconcile divergence** (HARD): :2773 and :4354 are contract-locked verbatim twins — change both in one commit or the SSO-07 tests and the accept route drift.
5. **Byte-identical second boot** (SETTINGS): a global (not row-level) eligibility guard would resurrect prefs a user has since changed — the exact bug class `migrateTeamMembership` was written to avoid (:1693-1701).
6. **Undo clobber** (UNDO): option A's replay can overwrite concurrent team edits by another admin.

## Open Questions for Phase Planning

- VIS: does the admin/owner workspace-wide exemption extend to team visibility (recommended: yes), and does a *guest* (viewer + one project, v1.6) see team-gated projects at all?
- SETTINGS: one generic `user_settings` table vs. dedicated `user_notif_prefs` — dedicated matches the codebase's one-table-per-concern precedent (`totp_factors`, `reminders_sent`) and is recommended.
- UNDO: option A vs C is an owner decision (feature vs honesty), not a technical one.
- SEARCH: whether the residual free-text limitation note goes in `CHANGELOG.md` (limits), per the existing convention (PROJECT.md L439).

## Sources

- All file:line claims read directly from `server.js` (4920 lines, current tree), `src/actions/teams.js`, `src/actions/actions.js`, `docker-compose.yml`, `.planning/PROJECT.md` — this session, 2026-11-02. HIGH confidence throughout.
- Node 24 `node:sqlite` transaction + `db.function()` surface verified against Node.js official docs (Context7, `/nodejs/node`) — not relied upon beyond confirming the existing `transaction()`/exec pattern is the correct idiom.

---
*Architecture research for: Projects Studio v1.7 "Team Visibility & Hardening"*
*Researched: 2026-11-02*
