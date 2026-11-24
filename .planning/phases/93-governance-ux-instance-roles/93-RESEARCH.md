# Phase 93: Governance UX — Instance Roles - Research

**Researched:** 2026-11-24
**Domain:** Client-side re-skin of the governance operator surface (SPA, no framework, `data-a`/`data-in` handler dispatch, staged `S.ui` state)
**Confidence:** HIGH (all findings from reading the live source this session)

## Summary

The surface is already ~80% of the target shape. `superAdminsView()` (src/pages/governance.js:134) already renders a seg control driven by `S.ui.govSuperSeg` with two values (`admins` | `roles`); D-01 extends it to three values. The roster (`superRosterView`, :157) becomes the SA tab body verbatim; `rolesCard()` (:231) loses its own `<div class="sblock"><h2>` wrapper and its grant rows re-shape into User/Grants/Actions columns; `recentHtml()` (:261) moves under the SA tab (D-04). Zero endpoint work: the frozen Phase 92 payloads (`govRoles`/`govRolesRecent` from GET instance-roles, `operatorUsers` from GET /api/auth/operator/users) already carry everything, including `grantedByName` (D-33).

The Grant dialog's "dead search" is found and it is a one-line class of bug: **`IN.govRoleQ` (src/actions/actions.js:5604-5606) writes `S.ui.govRoleMod.q` but never calls `render()`** — the typed text lands in state, the candidate list never re-filters. Contrast `IN.govOpQ` (:5664-5668) which does call `render()`. The filter expression itself works; only the re-render is missing. The picker upgrade to the Edit-team idiom means adopting the team-pick.js contract (combobox input, `foldForSearch` filter, `role=option`/`aria-selected` options, draft-in-`S.ui`, honest `popover.noMatches` — already present at governance.js:287).

**Primary recommendation:** Three presentation tasks — (1) seg extension to 3 values + wrapper surgery in governance.js, (2) a selectable user-picker body shared by tab and dialog (state shape like team-pick's `{draft, q, hl}` over `operatorUsers`), (3) fix `IN.govRoleQ` to `render()` and adopt `foldForSearch` filtering. Plus one i18n commit: rename `superTitle`, add 3 tab labels ×5 locales, retire orphaned keys.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** ONE seg control, THREE tabs (Super Admin / Backup Operator / Restore Operator). Roster becomes the SA tab's content (`S.ui.operatorUsers` ground truth). The separate "Instance Roles" card disappears as its own seg value; rename applies to the whole section (`superTitle`). Implicit Super-Admin membership stays visible in the SA tab.
- **D-02:** Columns User (name+email) · Grants (badges stacked vertically: role grant with date + granted-by) · Actions (revoke per grant, never per user). One row per user per tab; unique `(user_id, role)` index guarantees at most one live grant per role. Backup/Restore tabs lean: table + picker + Grant button.
- **D-03:** Selectable Edit-team-style list picker (mteamToggle idiom, actions.js:2399) with live filtering, honest no-results, NO user creation from the dialog. Grant dialog search must actually filter.
- **D-04:** Recent-activity trail (GET `recent`, capped 8) inside the SA tab under the roster only.

### the agent's Discretion
- Exact seg-state key naming (extend `govSuperSeg` to 3 values vs new key); teardown on route exit per existing idiom.
- Tab-switch resets picker/dialog state (recommended: yes, per-tab isolation).
- i18n key structure for tab labels + rename (×5 locales same commit — hard rule).

### Deferred Ideas (OUT OF SCOPE)
- Per-grant history beyond the live row; "invite user" from dialog; bulk grant/revoke.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROLE-01 | Role-tabbed view, renamed "Instance Roles" | Seg extension pattern (governance.js:134-147), key renames (i18n inventory below) |
| ROLE-02 | One row per user per tab, stacked grants, shared columns | rolesCard row reshaping (:237-252); server payload already one row per `(user_id, role)` |
| ROLE-03 | Selectable picker in tab + dialog; dialog search filters | team-pick.js contract + the `IN.govRoleQ` missing-`render()` bug |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Seg control / tab bodies | Browser/Client (governance.js) | — | Presentation over staged payloads; zero API change |
| Grant/revoke mutations | API (frozen endpoints) | — | server.js:8677/:8730 audited funnel untouched |
| Picker filtering/search | Browser/Client (shared body fn) | — | Client-side over already-fetched `operatorUsers` |
| Last-SA / owner guards | API | Client (verbatim message surfacing) | `err.ownerImmune` ×5 (en.json:1785), surfaced via `tErr(code)` toasts — do not re-word |
| i18n rename | Client + build gate | — | `i18n:scan` prebuild gate enforces ×5 parity |

## Standard Stack

No new packages. Zero-dependency project — everything ships in the existing bundle idioms.

### Core (existing, reused)
| Asset | Location | Purpose | Why |
|-------|----------|---------|-----|
| `.seg` control + `data-a="govSuperSeg"` | governance.js:136-141 | The 3-tab control is a value extension | Research-confirmed reusable |
| `srow()` / `perm-t` table / `empty()` / `badge` | governance.js helpers | Row/column/empty markup | Existing page vocabulary |
| team-pick.js picker contract | src/features/team-pick.js | Combobox + option list + chips + keyboard | The Edit-team reference (D-03) |
| `foldForSearch` | src/core/utils.js | Accented/diacritic-insensitive filter | team-pick.js:21 uses it; plain `.includes` (current dialog) is the weaker idiom |
| `esc()` discipline | everywhere | All payload strings through text nodes | T-79-10 hard rule |
| `refreshInstanceRoles` / `refreshOperatorUsers` | actions.js:5568-5590 | In-render kicks + refetch reconcile | Already wired (governance.js:86, :90) |

## Architecture Patterns

### What dissolves vs becomes tab content (Q1)

Verified anatomy (all line refs read this session):

| Piece | Location | Fate |
|-------|----------|------|
| `superAdminsView()` | governance.js:134-147 | Stays; seg array gains a 3rd (and 4th? no — 3) entries; `superTitle` key renamed to "Instance Roles"; `lead` hint becomes SA-tab-only |
| `S.ui.govSuperSeg` | `'admins'\|'roles'` (governance.js:135, actions.js:5679-5684) | Extends to `'admins'\|'backup'\|'restore'` (discretion D-01: naming is planner's call); teardown at :422 clears it — keep |
| `superRosterView()` | :157-210 | SA tab body verbatim (search = adding, candidates block, promote-only rows) |
| `rolesCard()` | :231-253 | DISSOLVED as a card: its own `<div class="sblock"><h2>` wrapper and `rolesLead` go away; the table body is re-shaped into per-role tab content (D-02 columns); empty-state Grant button idiom stays |
| `recentHtml()` | :261-269 | Moves under the SA roster (`hasRows` gate becomes "always when SA tab active + payload present" — D-04) |
| `roleBadge()` | :229-230 | Reused for grant badges in the stacked Grants column |
| `govRoleBody()` modal | :278-297 | Kept, body re-rendered with the new selectable picker; role `<select>` may become a seg or stay a select (discretion) |
| `govOrphanTeardown` | :404-424 | Extend: clear per-tab picker/dialog stages on route exit |

### Pattern 1: Seg extension (the 3-tab control)
**Example (current, :136-141):**
```js
const seg = `<div class="seg" role="group" aria-label="${t('page.governance.superSegAria')}">${[
  ['admins', 'page.governance.superSegAdmins'],
  ['roles',  'page.governance.rolesTitle'],
].map(([v, k]) => `<button class="${segV === v ? 'on' : ''}" data-a="govSuperSeg" data-v="${v}" aria-pressed="${segV === v}">${t(k)}</button>`).join('')}</div>`;
```
Add two rows to the array (`['backup', …]`, `['restore', …]`); tab labels may reuse `page.backup.flagBackup` / `page.backup.flagRestore` ([VERIFIED: governance.js:230, :288 — these keys already label the backup/restore roles]) or new dedicated keys (discretion).

### Pattern 2: The Edit-team picker contract (Q2 — what to reuse vs adapt)

Two sibling idioms exist; D-03 names the mteamToggle family:

**A. mteamToggle toggle** (actions.js:2477-2484; chips in src/overlays/modals.js:102): state array in `S.ui.memberTeams.teams` / `S.ui.inviteTeams`, `data-a="mteamToggle" data-v="${id}"`, includes→filter/append toggle, `render()`. This is the **selection mutation** half.

**B. team-pick.js modal** (the full Edit-team experience): `S.ui.teamPick = { surface, draft, q, hl }`; combobox input `id="tp-q" data-in="teamPickQ"` with `role="combobox" aria-expanded aria-controls aria-activedescendant`; options `role="option" aria-selected class="opt hl/on" data-a="teamPickAdd" data-v="<id>"`; filtering via `foldForSearch(st.q).text.includes(needle)` (team-pick.js:21-22); keyboard contract in keyboard.js (Enter select-and-keep-open, Backspace remove chip, Escape close); honest no-results via `popover.noMatches`.

**Adaptation for the user picker:** source list = `S.ui.operatorUsers` (GET /api/auth/operator/users payload — roster/picker ground truth, [VERIFIED: governance.js:86, :158, actions.js:5592 D-07 comment]); identity field `u.id`, display `u.name` + `u.email`; exclude `is_instance_admin` users from Backup/Restore picker pools (server refuses those grants — `instanceRoleAdminImplicit`, server.js:8696). Reuse: draft/q/hl state, aria contract, foldForSearch, noMatches. Adapt: single-select not multi (outline-select as current `pick()` at :283-284 does), no chips needed for a grant target, no dynamic chunk import needed if the picker body lives in governance.js (already the modal's render source via `S.ui.tpMod`-style lazy import at actions.js:5594-5603 — keep that lazy-import gate for the chunk-size gate, 498/500 kB headroom).

### Pattern 3: Per-tab state isolation (discretion, recommended)
`S.ui.govRoleMod = { userId, role, q }` — on seg switch, null it (or fork per-tab: `{backup: …, restore: …}`); staged state, never DOM ground truth.

### Anti-Patterns to Avoid
- **Filtering the DOM or reading input value on confirm** — staged state only (Pitfall 4 in repo doctrine).
- **Client-side role vocabulary** — role names only via i18n labels (D-15).
- **Filtering SA-tab rows client-side** — SA implicit membership comes from `is_instance_admin`, server truth.
- **New mutation endpoints** — hard SC; grant/revoke ride POST server.js:8677 / DELETE :8730 only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diacritic-insensitive search | custom normalize | `foldForSearch` (utils.js) | Existing idiom, tested |
| No-results empty state | ad-hoc `<p>` | `empty()` helper + `popover.noMatches` key | Consistent honest-nulls doctrine (D-34) |
| Time display | date formatting | `ago()` | Used in every roster row |
| Keyboard nav | bespoke | keyboard.js contract (team-pick pattern) | Pinned by test (6) below |

## Runtime State Inventory

Not a rename/refactor of stored data — presentation only. No stored-data, live-config, OS-registered, secrets, or build-artifact migrations. The only "rename" is i18n catalogue strings (code, same-commit ×5). **All five categories: none.**

## Common Pitfalls

### Pitfall 1: The dead-search bug class — input handler without `render()`
**What:** `IN.govRoleQ` (actions.js:5604-5606) writes state but never re-renders — exactly the owner's complaint. **Avoid:** every filter input handler must end in `render()` (contrast `IN.govOpQ` :5664-5668). **Warning sign:** typed text "works" only after clicking elsewhere.

### Pitfall 2: chunk-size gate
Repo runs a 498 kB < 500 kB chunk gate (STATE.md). Adding picker markup: keep it in governance.js (already in the governance chunk) or behind the existing lazy-import gate (`S.ui.tpMod` idiom, actions.js:5595). Do not statically import new features modules.

### Pitfall 3: i18n parity gate
`prebuild` runs `scripts/i18n-scan.mjs`; missing/extra keys in any of the 5 catalogues fail the build. Same commit for emitting code + all 5 locales (hard rule, CONTEXT).

### Pitfall 4: stale seg/picker state across routes
Teardown (governance.js:404-424) must null the new per-tab stages; a stale `govSuperSeg` value referencing a removed tab value would render an empty body — extend teardown alongside the state change.

### Pitfall 5: server guard toasts must stay verbatim
`err.ownerImmune` (en.json:1785; server.js:8157/:11135) and `err.instanceRoleAdminImplicit`/`err.instanceRoleDuplicate` (en.json:1790-1791) exist ×5 — surface via `tErr(code)`; do NOT re-word (SC: "surfaced verbatim"). Verify all 5 catalogues carry any key you newly reference (governance-client test (e) pattern does exactly this).

## i18n Inventory (Q4)

**Rename:** `page.governance.superTitle` = "Super Admins & roles" → "Instance Roles" ×5. Check `superSegAria` ("Switch between Super Admin management and instance roles") still reads correctly with 3 tabs — likely reword ×5.

**Existing keys reused as tab labels:** `page.governance.superSegAdmins` ("Super Admins") for tab 1; `page.backup.flagBackup` / `page.backup.flagRestore` already label the roles (governance.js:230, :288) and can serve as tabs 2/3, or add dedicated `superSegBackup`/`superSegRestore` keys (discretion — new keys recommended for clean parity scan).

**New:** tab labels ×2 (if dedicated), a Grants-column header key (`rolesColGrants`), per-grant "granted by/date" composition reuses `rolesColGrantedBy`/`rolesColGranted`, honest-no-results key exists (`popover.noMatches`, governance.js:287).

**Retire:** `page.governance.rolesLead` (card lead dissolved), `rolesColRole` (Role column folds into stacked Grants badges), `page.governance.rolesTitle` as a *seg label* (may stay for other uses or fold into superTitle). `superLead` becomes SA-tab-only (keep).

**Server refusal keys (verify ×5, already present in en):** `err.ownerImmune` (en.json:1785), `err.instanceRoleAdminImplicit` (:1790), `err.instanceRoleDuplicate` (:1791). The last-Super-Admin/owner revoke guard is `ownerImmune` — server-side refusal, client surfaces the keyed toast verbatim; no new server strings needed.

## Test Landscape & Validation Architecture (Q5)

This repo has **no DOM harness** — client behaviors are pinned by **static source assertions** (regex over file content) per the `creation-gate-client` precedent, plus Playwright e2e for real DOM.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (unit/static) + Playwright (e2e) |
| Config file | none for node:test; `e2e/playwright.config.mjs` |
| Quick run command | `node --test test/governance-client.test.mjs test/team-pick-client.test.mjs` |
| Full suite command | `npm test` (node --test --test-concurrency=2 test/*.test.mjs) + `npm run lint` + `npm run build` (chunk + i18n gates) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| ROLE-01 | 3-value seg, `superTitle` rename, rolesCard wrapper gone | static source assertions | `node --test test/governance-console.test.mjs` | extend `test/governance-console.test.mjs` / new `governance-tabs-client.test.mjs` (Wave 0) |
| ROLE-02 | One row per user per tab; User/Grants/Actions columns; stacked badges | static source assertions + `instance-roles-api.test.mjs` payload pins | `node --test test/governance-tabs-client.test.mjs` | ❌ Wave 0 |
| ROLE-03 | `IN.govRoleQ` renders; foldForSearch filter; selectable option aria contract; no user creation | static source assertions (team-pick-client pattern, incl. keyboard.js pin (6)) + optional Playwright dialog spec | `node --test test/team-pick-client.test.mjs` (regression) + new assertions | ❌ Wave 0 (extend governance-tabs file) |
| i18n | rename + new keys ×5 parity | existing catalogue-pin pattern (governance-client (e): import all 5 json, assert key presence) | `npm run build` (i18n-scan) + node:test | pattern exists, new asserts Wave 0 |
| SC "working picker" e2e | Playwright spec drives real DOM (open dialog, type, list filters, select, grant) | e2e | `npx playwright test e2e/<new>.spec.mjs` | ❌ Wave 0 / optional |

### Sampling Rate
- Per task commit: quick node --test on the touched client-test files
- Per wave merge: `npm test` + `npm run lint` + `npm run build`
- Phase gate: full suite + e2e green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/governance-tabs-client.test.mjs` — seg 3-value, rename, column/stack pins, picker contract, `IN.govRoleQ` render pin
- [ ] Extend `test/governance-rename.test.mjs` patterns for ×5 key parity of renamed/new keys
- [ ] Optional Playwright spec for the dialog filter (feasible; existing specs like `e2e/admin-revoke-cycle.spec.mjs` show the harness)

## Sources

### Primary (HIGH confidence — all read this session)
- `src/pages/governance.js:26,80-147,157-297,404-427` — view anatomy, seg, modal, teardown
- `src/actions/actions.js:2399-2560,5568-5690` — mteamToggle, team-pick trio, instance-roles handlers, **the `IN.govRoleQ` missing-`render()` bug at :5604-5606**
- `src/features/team-pick.js:7-46` — picker contract (combobox/foldForSearch/aria)
- `src/overlays/modals.js:102` — mteamToggle chip markup
- `server.js:8633-8760` — frozen GET/grant/revoke routes, `instanceRoleAdminImplicit` (:8696), `instanceRoleDuplicate` (:8700), audited revoke tx
- `src/locales/en.json:1785,1790-1791` — guard refusal keys; `page.governance.*` catalogue dump (×5 files exist: de/es/fr/nl/en)
- `test/governance-client.test.mjs`, `test/team-pick-client.test.mjs` — static-assertion harness patterns
- `package.json` scripts — test/lint/build/e2e, `i18n:scan` prebuild gates

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `foldForSearch` is exported from `src/core/utils.js` (seen imported in team-pick.js:14) | Pattern 2 | Trivial — verify at implementation |
| A2 | keyboard.js carries the team-pick Enter/Backspace/Escape contract (pinned by test (6) header comment) | Test map | Keyboard nicety only; test pin optional |
| A3 | Chunk gate currently at 498/500 kB (STATE.md snapshot) | Pitfall 2 | If slack grew, lazy-import discipline is still safe |

## Metadata

**Confidence breakdown:** anatomy/pitfalls/i18n HIGH (direct reads); test feasibility HIGH (harness seen); e2e exact spec MEDIUM (didn't open a full spec file).
**Research date:** 2026-11-24
