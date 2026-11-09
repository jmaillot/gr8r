# Domain Pitfalls — v2.1 UI/UX features on the v2.0 permission system

**Domain:** Adding per-team perms, an invite-modal projects picker, and a unified settings modal to an app whose security posture is a hard-won single visibility funnel (`memberCanReadProject`), whole-doc PUT with `mergeClientDoc` field pinning, and keyed refusals.
**Researched:** 2026-11-09 (direct code reads of server.js, mcp.js, src/overlays/modals.js, src/actions/actions.js, scripts/i18n-scan.mjs, plus v2.0 phase artifacts)
**Overall confidence:** HIGH — every claim below is anchored to a live file:line read this session; no speculative APIs assumed.

---

## Critical Pitfalls

### Pitfall 1: Per-team perms widen the visibility funnel — and the funnel has five consumers, not one

**What goes wrong:** Per-team perms introduce a *new access-grant dimension* (`p.teamPerms[teamId] → view/comment/edit/full`). The visibility predicate `canSeeProject` (server.js:800-805) — `public ∨ memberId ∈ p.members ∨ member's team ∈ p.teams` — must gain a team-perm term, but the same predicate is consumed through **five doors**, and v2.0 already produced the exact failure mode once:

- The Phase 50 review caught `remindable()` calling the *synchronous* `canSeeProject` without the team term while every other consumer used the async `memberCanReadProject` — team-granted members were silently dropped from due-date reminders (50-REVIEW.md line 101). The parity claim was "true by construction" and false in fact.
- The MCP mirror `canReadProject` (mcp.js:183-197) is a **hand-maintained copy** (comment: "Mirror of memberCanReadProject… without the server import"). If `teamPerms` is added to server.js and not mirrored in the same commit, MCP clients get an over- or under-permissive window that the UI never shows.
- `projectAccessReason` (server.js:828-835) mirrors the short-circuit order for labels; if it lags, the transparency view (Phase 52) labels team-perm grants as `'member'` or omits them — and its `?? 'member'` fallback (server.js:4997 area, flagged in 52-REVIEW.md) would **silently mask the divergence** instead of surfacing it.
- `hiddenFor` (server.js:851-865) resolves the member's teams once per evaluation; the team-perm term must resolve the *perm level* for those same teams, not just existence.
- Send-time consumers: reminder pass, email mirror, digest (server.js:1195, 1360, 1466, 1580) all funnel through `memberCanReadProject` — they inherit the term for free **only if** the term lives inside the funnel, not beside it.

**Why it happens:** The pinned-test doctrine says "never edit `canSeeProject`/`memberCanReadProject`/`hiddenFor`/`normalizeProjects`" (52-PATTERNS.md line 93) — a implementer reading that literally will build a *second* predicate beside the funnel instead of editing it, which is precisely the anti-pattern the one-funnel doctrine exists to prevent (RETROSPECTIVE.md line 256: "never a second pipeline").

**Consequences:** A team granted "Can view" that can't actually see the project (invisible rows, 404s for legitimate users), or worse, the mirror divergence — MCP agents see projects the UI hides. Both are silent; nothing crashes.

**Prevention:**
1. **Edit the funnel in place** — `teamPerms` becomes a fourth term inside `canSeeProject`/`memberCanReadProject`; do NOT create a parallel `teamPermCanRead()` helper.
2. **One lockstep commit** for server.js funnel + `projectAccessReason` + mcp.js `canReadProject`, exactly the Phase 50 pattern (50-01-PLAN: "MCP mirror… no over/under-permissive window").
3. **Extend the pinned tests, don't bypass them** — the Phase 49/50 behavior pins must be updated *in the same phase* as the funnel edit, or the suite blocks the change (which is the pins working, not failing).
4. **Update the hand-derived oracle** `VISIBILITY_MODEL` in test/helpers/visibility-fixture.mjs with new fixture cells (team-perm-view-only, team-perm-revoked, dangling team id) — respecting its anti-tautology contract (:5-8): expectations are never derived from the code under test.
5. **Decide read-vs-write semantics before coding:** a team with "Can edit"/"Full access" gains *visibility + task write rights*, but must NOT gain `canManageProject` rights (server.js:837-840 — lead/admin/owner only). If per-team "Full access" is meant to allow access-list editing, that is an explicit semantic decision the owner must rule on, not an implementation accident.

**Detection:** grep-diff in the phase summary confirming zero edits *outside* the funnel + mirror; fixture cell "m_teamperm (team-perm only) sees p_teamperm through every door (doc GET, MCP list, reminder, digest, transparency)".

**Phase:** the server/funnel phase (per-team perms, server half) — this is the phase's core, not a cleanup.

---

### Pitfall 2: Forgetting `p.teamPerms` in the `mergeClientDoc` pin block — a stale PUT silently revokes a whole team's grant

**What goes wrong:** `mergeClientDoc` (server.js:1041) pins manager-owned access fields for non-managers at :1090-1101:

```js
if (prev && !canManageProject(prev, memberId, role)) {
  p.private = prev.private; p.members = prev.members; p.perms = prev.perms;
  p.lead = prev.lead; p.teams = prev.teams; p.allowInviteGuests = prev.allowInviteGuests;
}
```

This pin list is the security posture (T-50-01: a stale non-manager PUT "can never delete p.teams — which would silently revoke a whole team"). Adding `teamPerms` without adding it to this block means a member whose client doc predates an admin's team grant can PUT and **delete the entire teamPerms map** — silently revoking every team grant at once, with no refusal, no 409 (their revision may be current), and no visible symptom until the team reports losing access.

**Why it happens:** The pin list is an imperative sequence of field assignments, not a data-driven rule — every new access field must be *remembered* into it. The same field must also be considered in the `wasPrivate` re-add logic (:1103-1107) and `normalizeProjects` (:872-889, which validates members/lead but must learn to validate team ids in `teamPerms` — dangling team ids after a team deletion must be swept, following the p.teams precedent).

**Consequences:** Silent mass-revocation; the exact class of bug the v2.0 milestone spent four phases eliminating.

**Prevention:**
1. Every new manager-owned access field (`teamPerms`, plus anything the unified Access section introduces, e.g. a general-access enum if it replaces the boolean) is added to the pin block **in the same commit** as the field's introduction, with a test: non-manager PUT carrying a stale/missing `teamPerms` → stored value survives byte-identical.
2. Mirror the D-51-15/16 lesson (server.js:1048-1053): any server-authoritative value read during merge (perm levels for enforcement) comes from the **STORED** doc, never the incoming one.
3. If the milestone decides to restructure access fields (e.g. folding `perms` + `teamPerms` into one object), that restructuring must go through `normalizeProjects` + a boot sweep like Phase 49's — not a free-form client write.

**Detection:** pin-block grep (`p.private = prev.private` region) reviewed in code review; regression test named after the T-50-01 pattern (e.g. T-XX-01 "stale non-manager PUT cannot delete teamPerms").

**Phase:** the server half of per-team perms AND the unified-settings phase — both touch this block; the second phase must re-verify the first's pin rather than assume it.

---

### Pitfall 3: The unified settings modal writes access fields from a client doc that was redacted or stale — pinning breaks in the *other* direction

**What goes wrong:** Today the Share modal edits access fields per-project from a freshly-read project (`proj(m.id)` at shareModal, modals.js:204). The unified modal merges General + Access into ONE write path replacing two — meaning one PUT now carries both lead-editable General fields (desc/icon/color/due) and manager-only Access fields (private/members/perms/teams/teamPerms/allowInviteGuests). Three distinct failure modes:

- **Manager-of-target but not workspace-manager, stale doc:** the client's doc snapshot predates another admin's change (e.g. a new team link). The PUT is not pinned (caller IS a manager of that project) — it *legitimately* overwrites and silently reverts the other admin's grant. Revision 409 only helps if the modal actually adopted the latest revision after its own refetch; a modal built once at open-time and submitted minutes later is a stale-PUT machine.
- **Non-manager lead confusion:** per-team perms M-09 means a team member with "Can edit" opens the unified modal and sees the Access section. If the modal renders it editable client-side, the PUT carries modified access fields — the server pins them (Pitfall 2), so the user's edit silently vanishes on save with a success toast. The client must render the Access section read-only using the same `canManageProject` semantics as the server (it already imports it — modals.js:159).
- **Redacted-doc write:** the settings modal is reachable from both Workspace > Projects and the project page. A guest/viewer opening it on the projects table must not build a PUT from a doc where the project row exists but its access fields are manager-owned values they shouldn't echo back — the merge tolerates it, but only if the pin list is complete (circular dependency with Pitfall 2).

**Why it happens:** The whole-doc PUT model means "the modal saves" is really "the modal edits the in-memory doc and the app pushes the whole document." Any modal that caches a doc slice at open-time instead of mutating live store state reintroduces the stale snapshot.

**Consequences:** Silent permission reverts between admins; silent save-failure for non-managers; possible 409 loops.

**Prevention:**
1. The modal mutates **live store state** (`S.ui.*` form objects, the `pform`/`data-in` pattern) and the submit path reads the doc at push time — never a frozen copy captured at open.
2. After opening, refetch (or adopt the pushed revision) before allowing save if the store's revision moved — the existing "every endpoint reports the new revision and the client adopts it" contract (PROJECT.md:323-324) is the mechanism; the modal must not break it.
3. Client-side `canManageProject` gate on the Access section, matching server.js:837-840 exactly — one shared helper, not a re-implementation.
4. Test matrix mirroring the 404-matrix tradition: {manager, lead, team-edit-member, plain member, guest} × {open modal, edit general, edit access, save} with assertions on which fields actually persisted.

**Detection:** a UAT scenario "two admins edit the same project's settings concurrently — second save must 409, not silently win".

**Phase:** the unified settings modal phase (this is *the* risk of that phase).

---

### Pitfall 4: Full re-render wiping unsaved modal input — the bug being fixed will be reintroduced by the unified modal, and other modals share the disease

**What goes wrong:** Modals are template-string functions of state (modals.js:41-43, 156, 202) re-rendered on state change. Inputs survive only when bound via `data-in`/`data-f` to persistent state (`pform.name` etc.). The v2.1 headline bug is exactly the miss: the invite email draft doesn't survive role/team changes because its binding or its state slot resets. The unified settings modal is a much larger multi-section form — the blast radius of one missed binding is bigger: description textarea, target date, per-team perm dropdowns (one per linked team — dynamically generated rows are the classic miss), member search input, general-access radio group.

**Why it happens:** Any state change that re-renders the open modal — role select change, team chip toggle, `shareQ` typing driving a filtered list re-render (shareModal:203-224 re-renders on every keystroke of the search), a background 30s notif poll triggering a store update, or a post-save revision adoption — wipes unbound input. The `shareQ` pattern (`data-in="shareQ"` at modals.js:218) is the proven fix; the invite draft bug proves it's easy to forget on new fields.

**Consequences:** Users lose typed text mid-form; worst in the Access section where a lost team-perm edit might be re-saved wrong.

**Prevention:**
1. **Every keystroke-able field in the unified modal gets a `data-in` binding to a durable state slot** before any interaction logic is written — this is a plan-level checklist item, not a code-review hope.
2. Dynamically generated rows (per-team perm selects) key their state by team id (`S.ui.settingsForm.teamPerms[teamId]`), not by DOM position.
3. Gate background re-renders: a poll/push-driven store update must not re-render an open modal mid-typing (or must merge through the data-in bindings, which it does only if they exist).
4. Chromium e2e in both locales: type into every field → toggle role/team/search/select → assert all values survived. Mirror the existing invite-modal e2e (Phase 10 covered it) and extend it to the new picker.
5. Sweep the *other* modals while in there: Edit Team's searchable members box (`foldForSearch` pattern is cited in the milestone plan) and any modal with a search input should get the same survives-interaction e2e — the bug class is shared even when the specific fix is scoped to the invite modal.

**Detection:** e2e assertion per field; a review rule "new modal input without data-in = blocking".

**Phase:** the invite-modal phase introduces the fix pattern; the unified-modal phase applies it at scale; a small sweep item belongs to whichever phase ships last.

---

### Pitfall 5: Guest one-project invariant enforced client-side only on the NEW picker paths

**What goes wrong:** The guest = viewer + exactly one project invariant is currently enforced at three server points: member-tier invite requires a project and caps the role (`inviteMemberRoleCeiling`/`inviteMemberProjectRequired`, server.js:5215-5218), the accept path re-derives `allowInviteGuests` fail-closed (:5411 region), and the legacy-role boot normalization (:2850-2894). Client-side, the picker "degrades to single-select on the guest path" (actions.js:2023-2029) — and the role checkbox mirrors the Guest role (:2044-2045). The v2.1 picker + unified modal add **new write paths** that can break the invariant if they only re-implement the client rule:

- **Invite edit path:** M-02 "everything editable post-invite" — changing an existing invite's role Member→Guest must now *require* a project server-side. If the edit route predates the per-project model or only re-checks role at creation, a guest invite with zero projects slips through.
- **Role flip on the stored invite:** Guest→Member must be allowed to keep/drop the project deliberately; Member→Guest with multiple selected projects must be refused (or coerced) **server-side**, not just de-selected in the UI.
- **MCP invite tools:** the MCP server shares "the same permission funnel" (PROJECT.md:193-194) — its invite tool must carry the same guest ceiling and project requirement, or an agent creates the invite the UI would have refused.
- **Lifecycle drift:** removing the guest's only project (project member removal, project archive/delete, team unlink) leaves a guest with zero projects — define the behavior (downgrade? invite stays but inert?) before the picker makes it easy to trigger.

**Why it happens:** The invariant is behavior-only by design (D-50-11: guest "specialness survives via behavior only — viewer-role checks"); there is no schema constraint backing it, so every new write path must re-derive it by hand.

**Consequences:** A guest account with workspace-wide read (viewer role, no project) — a real privilege escalation relative to the documented model, invisible in the UI.

**Prevention:**
1. One shared server-side validation helper (e.g. `validateGuestInviteShape(role, projects)`) called from create, edit, and accept paths — not three inline copies.
2. MCP invite tool routes through the same helper; add a fixture to test/mcp.test.mjs.
3. Client single-select degradation stays (UX), but is treated as cosmetic — tests assert the server refuses, not that the UI prevents.
4. Decide and document the zero-projects-guest lifecycle in this milestone (it becomes reachable via the new picker's un-select UX).

**Detection:** server test: PUT/POST invite edit {role: guest, projects: []} → keyed refusal; MCP tool test for the same.

**Phase:** the invite-modal picker phase (server half); the unified settings modal phase for the lifecycle decision.

---

## Moderate Pitfalls

### Pitfall 6: i18n gate — dead keys from removed modals, and the dead-key allowlist accidentally killing future checks

**What goes wrong:** Replacing projectModal + shareModal with one unified modal orphans keys (`modal.shareTitle`, `modal.shareLockHint`, `modal.teamsHint`, `modal.projectHint`…). The dead-key family (scripts/i18n-scan.mjs:1258-1356) fails the build on them — which is correct behavior, but the temptation is to add prefixes to `DEAD_KEY_ALLOWLIST` (:1270, "extend, never replace — an entry added here hides a real dead key, T-51-09"). A broad prefix like `'modal.'` would permanently blind the gate to every future dead modal key. Conversely, the *new* modal's keys must exist in EN **and** FR with matching placeholders (catalogue-key family :1115-1195, EN↔FR parity enforced), and PROJECT.md pins the catalogue at 1711 keys — the pin test needs a deliberate bump, not a surprise failure.

**Why it happens:** Deleting a modal deletes its `t()` call sites; the catalogue entries become dead. People "fix" the build by allowlisting instead of pruning.

**Prevention:** Delete dead keys in the same phase that removes the modal (the Phase 51 dead-key gate exists precisely for this — UX-01 criterion 5 precedent). Add only *narrow* allowlist entries with a comment each. Update the catalogue-size pin intentionally, in the phase summary.

**Detection:** `node scripts/i18n-scan.mjs` exit 0 with 0 dead / 0 stale; diff of the allowlist reviewed in code review.

**Phase:** the unified settings modal phase; the projects-table phase if it removes the duplicate Share affordances' strings.

### Pitfall 7: `data-a` action-name pin drift during the modal consolidation

**What goes wrong:** Action names wired through event delegation (`data-a="pformSet"`, `"pformTeamToggle"`, `"shareInvite"`, `"closeModal"`, `"submitProject"`) are behaviorally pinned by Chromium e2e and the i18n scanner's position logic (i18n-scan.mjs:145 documents the modals.js catalogue-key patterns). Merging two modals invites renaming handlers ("submitSettings" instead of "submitProject") — which breaks delegation silently if the dispatcher's switch isn't updated in the same commit, and breaks e2e pins.

**Prevention:** Rename in one commit with the dispatcher + all data-a attributes + e2e selectors; grep `data-a="` and the handler map before declaring done. Prefer *reusing* existing action names where semantics match (submitProject already handles create+edit — the unified modal can extend it).

**Phase:** unified settings modal phase.

### Pitfall 8: Projects-table columns leaking data the funnel redacts

**What goes wrong:** New columns Lead / Teams / Members (count) / Status / Target date render data the client already has — but for a *member who cannot manage* a project, `p.members`, `p.teams` and `p.perms` are manager-owned fields they can *see* (redaction removes whole projects, not fields). Rendering member counts and team names is fine; rendering per-team perm levels or the access list in a tooltip is a disclosure decision, and the transparency doctrine (T-52-03: coarse codes, never rosters) should govern it. Also the guest's table view: guests see exactly one project — the table must not render sibling-project hints via column aggregates.

**Prevention:** Columns render only fields that pass through `hiddenFor` on the read side; no new field joins the doc without a redaction consideration. Tooltip content follows the reason-code doctrine.

**Phase:** projects-table phase.

---

## Minor Pitfalls

### Pitfall 9: `normalizeProjects` and legacy docs vs the new `teamPerms` field

Old documents (and crafted ones) lack `teamPerms` or carry dangling team ids after team deletion. `normalizeProjects` must treat it like `members`: default absent → `{}`, drop ids pointing at deleted teams (the doc is the source of truth; a deleted team's id must not silently grant anything through the funnel's new term). **Prevention:** normalize on every read (the function is already called in mergeClientDoc on both copies, :1044-1045) + a boot sweep decision only if cleanup matters. **Phase:** per-team perms server phase.

### Pitfall 10: PSTAT pill + progress column double-painting i18n

PSTAT labels (planning/active/risk/hold/complete) are new catalogue keys with `common.perm.*`-style derived naming opportunity — reuse the PERM_KEYS lowercase-bridging pattern (modals.js:195-201) so stored values map to keys without quoting tokens; a missing mapping currently falls back to the first perm silently (:201) — the same silent fallback on a status value would render wrong labels without an error. **Prevention:** explicit map + test that every stored PSTAT value resolves. **Phase:** projects-table phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Per-team perms (server) | Funnel consumers diverge (reminder/digest/MCP/transparency) — the Phase 50 `remindable()` lesson | Edit `canSeeProject` in place, mirror mcp.js:183 in the same commit, extend `VISIBILITY_MODEL` oracle with team-perm cells |
| Per-team perms (server) | `p.teamPerms` missing from the mergeClientDoc pin block (:1090-1101) | Add field + pin + stale-PUT regression test in one commit |
| Per-team perms (server) | Team "Can edit" accidentally granting `canManageProject` | Decide read/write semantics with the owner first; keep access-list editing manager-only unless ruled otherwise |
| Unified settings modal | Stale doc snapshot at open-time → silent revert of another admin's grants (Pitfall 3) | Mutate live store state; adopt revision; concurrent-edit UAT scenario |
| Unified settings modal | Non-manager sees editable Access section, save silently no-ops | Client gate via shared `canManageProject`; render read-only |
| Unified settings modal | Missed `data-in` binding wipes input on any re-render (Pitfall 4) | Bind every field first; per-field e2e; dynamic rows keyed by team id |
| Unified settings modal | Dead i18n keys + broad allowlist entry (Pitfall 6) | Prune keys in-phase; narrow allowlist entries only; bump catalogue pin deliberately |
| Invite modal picker | Guest single-select enforced client-side only (Pitfall 5) | Shared server validator across invite create/edit/accept/MCP; zero-projects-guest lifecycle decided |
| Projects table columns | Access-field disclosure beyond the reason-code doctrine (Pitfall 8) | Coarse values only; no rosters/perm levels in tooltips |

---

## Sources

- server.js:771-865 (projectIsPrivate / teamsOfMember / canSeeProject / memberCanReadProject / projectAccessReason / canManageProject / hiddenFor / normalizeProjects) — read this session
- server.js:1041-1159 (mergeClientDoc pin block, D-51-15/16 stored-doc rule, create refusal) — read this session
- mcp.js:176-218 (canReadProject mirror, visibleProjects, readableProjectIds) — read this session
- server.js:5215-5218, :5411 (guest invite ceiling, fail-closed accept re-derivation), :2850-2894 (guest role normalization) — read this session
- src/overlays/modals.js:156-225 (projectModal, shareModal, data-in bindings, PERM_KEYS derived keys) — read this session
- src/actions/actions.js:2023-2045 (guest single-select degradation, role-checkbox mirror) — read this session
- scripts/i18n-scan.mjs:10-19, 1258-1356 (gate families, dead-key allowlist doctrine) — read this session
- .planning/PROJECT.md (v2.1 targets, M-09..M-13 decisions, standing constraints) — read this session
- .planning/milestones/v2.0-phases/50-*/50-REVIEW.md (the `remindable()` parity failure — the canonical consumer-divergence post-mortem), 52-PATTERNS.md:93 (funnel pin doctrine), 52-REVIEW.md (`?? 'member'` fallback masking), test/helpers/visibility-fixture.mjs:5-8 (anti-tautology contract) — via grep, line-quoted

**Confidence: HIGH** — code-verified file:line anchors throughout; the one forward-looking item (MCP invite-tool guest check) is flagged as "verify at plan time" rather than asserted.
