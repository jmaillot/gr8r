# Phase 93: Governance UX — Instance Roles - Context

**Gathered:** 2026-11-24
**Status:** Ready for planning

<domain>
## Phase Boundary

The governance section's operator surface becomes a role-tabbed "Instance Roles" view: one tab per role (Super Admin / Backup Operator / Restore Operator), one row per user per tab with grants aligned to shared columns, the section renamed from "Super Admins" to "Instance Roles", and working selectable pickers (Edit-team style) with a functional Grant dialog search. Re-skin ONLY — every mutation rides the existing audited grant/revoke endpoints; zero new mutation endpoints.

</domain>

<decisions>
## Implementation Decisions

### Tab structure
- **D-01:** The section keeps ONE seg control with THREE tabs: Super Admin / Backup Operator / Restore Operator. The current Super Admins ROSTER (search = adding, `S.ui.operatorUsers` ground truth) becomes the Super Admin tab's content. The separate "Instance Roles" card/tab disappears as its own seg value — the rename applies to the whole section (`superTitle` key). Implicit Super-Admin membership stays visible in the SA tab (existing roster behavior). — **Reversibility:** reversible — presentation only, seg idiom reuse (`govSuperSeg` → extended state).

### Table columns (per role tab)
- **D-02:** Columns: **User** (name + email) · **Grants** (badges stacked vertically: role grant with date + granted-by) · **Actions** (revoke per grant — never per user). One row per user per tab (a user holding the tab's role appears exactly once; the unique `(user_id, role)` index guarantees at most one live grant per role). Badges align to the shared columns (ROLE-02). Backup/Restore tabs stay lean: table + picker + Grant button. — **Reversibility:** reversible.

### Pickers & Grant dialog
- **D-03:** The user picker in each role tab and in the Grant dialog is the selectable Edit-team-style list picker (mteamToggle idiom, actions.js:2399): a live-filtering list with in-list selection. Typing text filters the list; if no user matches, an honest "no results" message — NO user creation from the dialog. The Grant dialog search must actually filter (fixes the reported dead search). — **Reversibility:** reversible.

### Audit trail placement
- **D-04:** The recent-activity trail (GET payload `recent`, capped 8) lives inside the Super Admin tab, under the roster. Backup/Restore tabs render without it. — **Reversibility:** reversible.

### Agent's Discretion
- Exact seg-state key naming (extend `govSuperSeg` to 3 values vs new key) — planner's call, teardown on route exit per the existing idiom.
- Whether the tab-switch resets the picker/dialog state (recommended: yes, per-tab state isolation).
- i18n key structure for the three tab labels + rename (×5 locales same commit as the emitting code — hard rule).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The surface being re-skinned
- `src/pages/governance.js:135` — `superAdminsView()` (seg admins|roles) and :80–133 (page body, gates, in-render kicks).
- `src/pages/governance.js` `rolesCard()` — the Instance Roles card being dissolved into tabs.
- Roster view (`superRosterView`) — becomes the SA tab content verbatim where possible.

### Server contracts (frozen — payload from Phase 92-era GETs)
- `server.js:8633` — GET /api/auth/operator/instance-roles (`roles[]` with grantedByName resolved D-33, `recent[]` trail D-32).
- `server.js:8677` / `:8730` — POST grant / DELETE revoke (audited funnel; the ONLY mutation paths).
- `GET /api/auth/operator/users` (~server.js:7981 region) — roster/picker ground truth.
- Last-Super-Admin revoke guard: server-side refusal ×5 locales (existing) — surfaced verbatim in UI.

### Picker idiom
- `src/actions/actions.js:2399` — mteamToggle / invite-teams selectable picker (the ROLE-03 reference pattern).
- `.seg` / `.tabs` idioms — governance.js:91–146 region, research-confirmed reusable.

### Locked invariants
- `.planning/ROADMAP.md` § Phase 93 (4 success criteria: rename×5+tabs+stacked grants, working pickers, audited-endpoints-only + last-SA guard + implicit membership visible, zero new mutation endpoints).
- `.planning/REQUIREMENTS.md` ROLE-01..03.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.seg` control + `aria-pressed` toggling (governance.js) — the 3-tab control is a value extension, not a new component.
- `refreshInstanceRoles()` / `refreshOperatorUsers()` in-render kicks — per-tab ground truth already in place.
- Edit-team picker (actions.js) — selectable list + live filter, the ROLE-03 reference.
- `esc()` discipline (T-79-10) — every payload string through text nodes.

### Established Patterns
- Server-payload-driven gating (`api.user?.isInstanceAdmin` + 403 control).
- Dead-mappings payload shape `{roles, recent}` consumed in one GET.
- i18n ×5 same-commit; audit funnel untouched.

### Integration Points
- `superAdminsView()` seg — becomes the 3-value control.
- Grant/revoke action handlers (actions.js:5577 region) — wire the fixed dialog search; no endpoint changes.

</code_context>

<specifics>
## Specific Ideas

- Owner's original complaint: the roles area reads as blocks-in-blocks, multi-role users are hard to scan, the Grant dialog search does nothing, and pickers are not selectable like the Teams one — all four addressed by D-01..D-03.
- Rename touches the section title key AND nav/aria labels where they echo "Super Admins" — grep ×5 locale files in the same commit.

</specifics>

<deferred>
## Deferred Ideas

- Per-grant history beyond the live row (grant/revoke cycles are replaced by the unique index; full history lives in audit_log).
- "Invite user" from the Grant dialog (rejected — no creation at dialog).
- Bulk grant/revoke operations.

</deferred>

---

*Phase: 93-Governance UX — Instance Roles*
*Context gathered: 2026-11-24*
