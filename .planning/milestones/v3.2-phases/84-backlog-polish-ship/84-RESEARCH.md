---
phase: "84"
slug: "backlog-polish-ship"
---

# Phase 84: Backlog Polish & Ship - Research

**Researched:** 2026-11-20
**Domain:** UI picker pattern reuse, e2e failure triage, mobile CSS polish, docs & release chores
**Confidence:** HIGH (all findings from in-repo reads this session; no external packages involved)

## Summary

Phase 84 is a polish-and-ship phase with zero new dependencies and zero new capabilities. Every work item reuses an existing, in-repo pattern: BP-01 clones the 55-04 assignee-picker modal (open/toggle/apply trio + lazy chunk), BP-02 repairs four failing e2e specs (root causes diagnosed below from the retained `test-results/` error contexts — no suite run needed), BP-03 extends two existing mobile specs with a phone-viewport sweep plus a CSS fix for the toolbar, and the ship items are one-line server/ test edits plus documentation.

**Primary recommendation:** Plan four plans — (1) BP-01 pickers, (2) BP-02 e2e repairs (with trace verification of the one undiagnosed failure), (3) BP-03 mobile + sweep, (4) ship items (IN-01, IN-02, DEPLOY.md, 3.2.0 bump last per D-11).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Pickers follow the assignee-picker modal pattern (55-04): searchable modal with multi-select list, applied on confirm — NOT the lightweight tz-combobox inline pattern (44-03).
- **D-02:** Both selection surfaces become searchable pickers: invite-form teams field (`S.ui.inviteTeams`, actions.js:2247/2394) and member-edit teams picker (`mteamToggle`). No other surfaces.
- **D-03:** Chips stay multi-add: search + Enter selects and keeps the input open (chip accumulates), Backspace removes the last chip, same keyboard contract as the tz combobox (aria combobox/listbox roles carried over).
- **D-04:** No waivers. Full e2e suite green with zero `test.skip`/`test.fixme` debt waivers. The one existing conditional skip (demo-locale.spec.mjs, environment-gated) stays.
- **D-05:** Repair in place. Keep every existing assertion unless it pins behavior that genuinely changed in v3.2; no wholesale rewrites.
- **D-06:** Flake policy: a flaky spec is not fixed until it passes 3 consecutive full-suite runs after hardening.
- **D-07:** Mobile scope = 57-UAT deferred truncation item + phone-viewport sweep of dashboard/members/governance.
- **D-08:** Regression assertions extend `e2e/mobile-tasks-table.spec.mjs` / `e2e/mobile-card-hidden.spec.mjs` — no new spec files.
- **D-09:** DEPLOY.md gains an "Entra group mapping" section covering all four: ApplicationGroup claim prerequisites, overage fallback recipe pointer (STACK), dead-mapping runbook, old-slug 404 policy (D-82-5).
- **D-10:** Both Phase-83 advisory findings fixed: IN-01 (rename touches `updated_at`), IN-02 (derived i18n catalogue check).
- **D-11:** Version bump is the phase's final task: package.json → 3.2.0 + CHANGELOG entry.

### the agent's Discretion
- Exact visual treatment of the picker modal (mirrors assignee picker chrome)
- How the viewport sweep findings are triaged (fix now vs note, per item)
- DEPLOY.md section ordering and cross-link placement

### Deferred Ideas (OUT OF SCOPE)
- Graph overage fallback implementation (documented recipe only)
- Any new capabilities beyond the four backlog items
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BP-01 | Searchable token-chip pickers for member/team selection inputs | Assignee-picker precedent fully mapped (state shapes, chunk gate, search filter, i18n); tz combobox keyboard/aria contract read verbatim |
| BP-02 | Fix the 56-02 e2e spec failures | All 4 failures diagnosed from `test-results/*/error-context.md`; drift-vs-regression verdict per spec below |
| BP-03 | Phase 57 mobile layout follow-ups | Columns button implementation located (`src/shell/view-engine.js:227`); truncation root cause identified; mobile spec conventions read |
| (ship) | DEPLOY.md Entra docs, IN-01, IN-02, 3.2.0 bump | Rename route UPDATE statement verified verbatim; i18n parity landscape mapped (interlocks with IN-02 design); DEPLOY.md insertion point and CHANGELOG format read |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Team pickers (invite + member-edit) | Client (SPA) | — | Pure UI state (`S.ui`); POST body shape unchanged, no server work |
| e2e repairs | Test tier | — | Spec drift fixes + one hardening; one possible app-side look |
| Mobile toolbar truncation | Client (CSS) | — | Toolbar flex layout, no logic change |
| IN-01 rename `updated_at` | API/Backend | Database | SQLite UPDATE statement, integer epoch per convention |
| IN-02 derived i18n check | Test tier | — | Node test reads locale JSON directly |
| DEPLOY.md + version bump | Docs/Release | — | Markdown + package.json + CHANGELOG |

## User Constraints (from AGENTS.md / STATE.md standing constraints)

- Zero new dependencies (pinned by `test/dependencies.test.mjs`) — phase installs nothing.
- Every new i18n string lands in all 5 locales (en/fr/es/de/nl) in the same commit as the emitting markup; the en catalogue size test is touched by any key change (D-12 pin — IN-02 un-pins it, but the moment picker keys land, the mechanism matters).
- Server refusals are keyed + localized (83 precedent) — pickers introduce no new refusals, so no server vocabulary this phase.

## Standard Stack

### Core
No new packages. Everything uses the existing zero-dependency stack (vanilla-JS SPA, `node:test`, Playwright, Vite).

### Supporting (existing, verified in-repo)
| Facility | Location | Purpose |
|----------|----------|---------|
| `foldForSearch` | `src/core/utils.js` (imported by assignee-pick.js:8) | Diacritic-folding search filter — reuse for team-name search |
| Modal harness (`openModal`/`closeModal`, `H()` chrome) | `src/actions/actions.js`, assignee-pick.js:25 | Picker modal shell |
| Lazy-chunk gate | `test/build-chunk-size.test.mjs` — real `vite build`, every emitted .js chunk ≤ 500000 bytes [VERIFIED: test/build-chunk-size.test.mjs:15-17] | Decide whether team picker needs its own chunk |
| `esc`, `av` (avatar), `chip` markup | assignee-pick.js | Picker visual vocabulary |

## BP-01 — Searchable token-chip pickers

### The assignee-picker precedent (verified verbatim this session)

**State shape** `[VERIFIED: src/actions/actions.js:607-628]`:
```js
S.ui.assigneePick = { taskId: id, subtaskIndex: subI, draft: [...cur], q: '' };
```
- Opener is a dynamic-import gate: `if (S.ui.apMod) openModal({ type: 'assigneePick' }); else import('../features/assignee-pick.js').then(m => { S.ui.apMod = m; openModal(...) })` — the module cache in `S.ui.apMod` makes repeat opens synchronous.
- Draft-in-`S.ui` survives background re-renders (Pitfall 4 pattern); confirm applies the whole draft as ONE array write (`A.assigneePickApply`, actions.js:644-673).
- Search filter: `foldForSearch(st.q).text.includes(foldForSearch(name).text)` over candidates (assignee-pick.js:20-23).

**Search input handler**: `IN.assigneePickQ` stores `q` and calls `render()` (actions.js:639-643).

**Tz combobox keyboard/aria contract to carry over** `[VERIFIED: src/pages/settings.js:229-236]`:
- Input: `role="combobox" aria-expanded="${pk.open}" aria-controls="tz-list" aria-activedescendant="tz-opt-${pk.hl}"` with `autocomplete="off"`.
- List: `role="listbox"`; options `role="option" aria-selected="${i===pk.hl}"` with `.hl` highlight class; no-results hint (`settings.tz.noResults`).
- Keyboard wiring lives in `keyboard.js`, which "picks the highlighted entry from here" via `pk._flat = list` (settings.js:226) — **the picker's Enter/Backspace/Escape handling must hook the same keyboard.js mechanism or replicate it locally**; this is the one wiring detail the executor must trace in `src/core/keyboard.js` (not read this session — flagged below).
- D-03 semantics: Enter selects and keeps the input open (multi-add), Backspace removes last chip, Escape closes.

### Target surface 1: invite-form teams

Current state `[VERIFIED: src/actions/actions.js:2245-2256, 2393-2400]`:
```js
S.ui.inviteTeams = [];            // A.invite reset
A.invTeamToggle = el => {         // chip toggle, state rides S.ui.inviteTeams
  const cur = S.ui.inviteTeams || [];
  S.ui.inviteTeams = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
};
```
Consumers that MUST keep working unchanged:
- `A.submitInvite` (actions.js:2302): `const teams = [...new Set(S.ui.inviteTeams || [])];` — feeds `api.createInvites(list, role, teams, scope)` and the offline `addInvitedMember` path.
- `A.copyInviteLink` (actions.js:2426): same `[...new Set(S.ui.inviteTeams || [])]` read.

**Constraint: the stored state stays a plain array of team ids in `S.ui.inviteTeams`.** The picker replaces the *toggle UI*, not the state shape. Recommended: a draft state `S.ui.teamPick = { surface: 'invite'|'member', draft: [...], q: '' }` opened from the field, applied back to `S.ui.inviteTeams` / `S.ui.memberTeams.teams` on confirm (D-01 confirm pattern) — the chip row *inside the invite form* can render from `S.ui.inviteTeams` as today (or as read-only chips with a remove button, mirroring assignee-pick.js:30-35).

### Target surface 2: member-edit teams picker

Current state `[VERIFIED: src/actions/actions.js:2454-2478]`:
```js
S.ui.memberTeams = { id, name, teams: [...memberTeams(m)], scope: ..., scopeTouched: false };
A.mteamToggle = el => { st.teams = st.teams.includes(id) ? filter : [...st.teams, id]; };
```
Consumed by `A.submitMemberTeams` (actions.js:2482+). The picker targets the `teams` array only; `scope`/`scopeTouched` fields untouched. Context-note: team chips live in the Access tab per the 1787 comment.

### Chunk decision

The team picker is small markup + handlers. Two options, both legitimate:
- **Option A (recommended): ride the existing `S.ui.apMod` pattern** — add the team-pick modal to `src/features/assignee-pick.js` (rename-prone; alternatively keep file and export a second function, e.g. `teamPickModal`) and gate its import from the openers. No new chunk; entry chunk impact ~2-3 kB.
- **Option B: own lazy chunk** `src/features/team-pick.js` — only if the assignee-pick chunk is near the gate. The gate is per-chunk ≤500 kB [VERIFIED: test/build-chunk-size.test.mjs:17], and adding to an existing chunk cannot break the gate unless that chunk is already close (executor: check `node -e` build output or just run the test).

### i18n needs

New user-facing strings needed (suggested keys, planner to name):
- search placeholder/aria (cf. `modal.assigneeSearch` precedent) for teams
- no-matches hint (cf. `modal.assigneeNoMatches`)
- possibly a picker title / "Done" reuse (`act.done` exists)

**Locale set is en/fr/es/de/nl — five files, verified present in `src/locales/`** [VERIFIED: directory listing]. All five in the same commit as the emitting markup (D-12).

### Anti-patterns to avoid
- **Do NOT use the tz-combobox inline pattern as the picker** (D-01 forbids it) — the combobox contract supplies keyboard/aria only.
- **Do NOT change the POST body shape** — `[...new Set(S.ui.inviteTeams)]` reads at actions.js:2302/2426 are load-bearing.
- **Do NOT re-render the invite textarea on chip changes** — the `IN.inviteDraft` silent-binding comment (actions.js:2404-2410) documents the wipe bug; picker opens/confirm must preserve typed emails via `S.ui.inviteDraft`.

## BP-02 — e2e red set: root-cause diagnosis

Baseline: 151 passed / 4 failed / 0 skipped. All four failures retain `test-results/*/error-context.md` (error text + aria snapshot + trace.zip). WAIVER AUDIT: the only `test.skip` in `e2e/*.spec.mjs` is the environment-gated demo-locale skip (e2e/demo-locale.spec.mjs:60) — zero debt waivers, D-04 already satisfied. **No other skip/fixme exists** [VERIFIED: grep of e2e/*.spec.mjs].

### Failure 1+2: operator-revoke-cycle.spec.mjs:170 (en) and :… (fr) — **SPEC DRIFT, not regression** (HIGH confidence)

Error: after `openSettingsSec(opPage, 'sessions')`, `getByText(fmt('settings.operator.title'))` ("Operator console" / "Console opérateur") not visible.

Root cause: **Phase 79 moved the operator console off Settings → Sessions onto the /governance page.** The heading now renders in `src/pages/governance.js:162` [VERIFIED: grep hit + locale line 1483 in all 5 files: `"settings.operator.title": "Operator console"` / `"Console opérateur"`]. The sessions settings section still exists (`SET_NAV` entry `'sessions'` at src/pages/settings.js:100) but no longer hosts the operator console. The aria snapshot in the error context confirms the operator page rendered fine (full workspace sidebar, no error state).

Fix per D-05: change the **navigation step only** — replace `openSettingsSec(opPage, 'sessions')` with navigation to the governance route (e.g. click the Governance sidebar entry `[data-a='go'][data-r='governance']`, which exists per the snapshot). Keep the heading assertion and everything after. Note the helper `openSettingsSec` is local to each spec (duplicated in flows.spec.mjs:1079 and operator-revoke-cycle.spec.mjs:161) — only the operator spec's call sites (2 per lang: lines ~212, ~238) need the new navigation.

### Failure 3: french-overflow.spec.mjs:617 — **SPEC DRIFT, not regression** (HIGH confidence)

Error: `route home: untranslated English served` — one hit: `{ surface: "text", value: "Instance" }` (6 objects in diff = same hit represented per expectation format; the leak value is exactly `"Instance"`).

Root cause: Phase 79 added the governance sidebar group label `common.instance` ("Instance"). The French catalogue value is the identical word ("Instance" is the same in French), and the leak scanner compares normalized text against EN_VALUES (all English catalogue leaves, french-overflow.spec.mjs:386) minus the STOP_LIST. The scanner already documents this exact class of case: "strings below all have identical French and English catalogue values … cognates that French UI convention keeps as-is" (STOP_LIST comment, lines 566-569), with precedents 'Notifications', 'Table', 'Admin', 'Sessions'.

Fix per D-05: add `'Instance'` to `STOP_LIST` with the same cognate comment (executor: verify `common.instance` in `src/locales/fr.json` is literally `"Instance"` before adding — assertion of the pattern, not assumed). No app change.

### Failure 4: flows.spec.mjs:1086 (en only) — **likely FLAKE/timing; one hypothesis unverifiable without the trace** (MEDIUM confidence)

Error: `Error: retry with the next step code` — the final `await expect(submitTfaCode(...), 'retry…').toBe(true)` received false, i.e. **two** consecutive `submitTfaCode` attempts failed to land on `/w/<slug>$` within 4 s each.

Candidate causes (executor must read `test-results/flows-…pending2fa-screen-en--chromium/trace.zip` before writing the fix):
1. **TOTP window race under load (most likely).** `enabledStep` is computed at enroll time; the test then computes `nowStep` and picks offset 31 or 1. If the login POST lands ≥1 step later than computed (slow machine / parallel workers), the D-04 replay guard (`two_fa_last_step`) can reject the first code, and the retry at +31 can also miss if another boundary was crossed between computing and submitting. The sibling spec (operator-revoke-cycle) handles this class explicitly with `nextWindow()` + retry-on-`err.invalidTfaCode|err.challengeExpired` — flows.spec.mjs's retry is narrower.
2. **URL assertion too strict.** `submitTfaCode` waits for `new RegExp(`/w/${slug}$`)` with a 4 s timeout — if the app now lands on a redirect variant (e.g. trailing slash or `#/` suffix) the URL never matches even though login succeeded. fr variant passed, making a pure URL-shape change less likely (same landing logic), which pushes diagnosis toward (1).
3. Real regression in pending2fa (src/pages/auth.js:155 renders `tfaTitle`/`tfaSubtitle` — both keys verified present; nothing in the 80-83 commits touched auth.js per git log of settings/server/locales) — **no evidence for this**; git log since the specs were green shows only governance/group-mapping changes (ecf6c7b1…2bab03d2).

Fix per D-06 (hardening, keep assertions): read the trace to classify; expected remedy is the operator-spec's proven pattern — after the first failed submit, assert the honest error (`err.invalidTfaCode` / `err.challengeExpired` visible) and compute the retry code from a fresh `Date.now()` (the spec already does `Math.floor(Date.now()/1000)+31` at retry but reuses the stale `nowStep` decision), plus widen the `toHaveURL` timeout for the 2FA landing. Then per D-06: 3 consecutive green full-suite runs.

**Only this spec may reveal a real regression** — the executor gate is: trace shows a code-rejection toast → flake/hardening; trace shows the landing page never rendered → re-open as app bug.

## BP-03 — Mobile follow-ups

### The 57-UAT deferred item
`57-UAT.md` test 1 note: *"L'affichage sur téléphone est fortement tronqué avec le bouton colonnes (layout mobile de la table des tâches)"* — deferred 2026-11-12 [VERIFIED: .planning/milestones/v2.2-phases/57-…/57-UAT.md deferred follow-up block]. English: tasks-table layout heavily truncated on phone with the columns button.

### Columns button implementation
The toolbar renders in `src/shell/view-engine.js:227` [VERIFIED: read]:
```js
${opt.cols ? `<button class="btn btn-ghost" data-a="pop" data-pop="cols" data-key="${key}">${ic('columns-3', 14)}${t('act.columns')}</button>` : ''}
```
- `act.columns` = "Columns" / "Colonnes" [VERIFIED: en.json:436, fr.json:437].
- Unlike the Sort/Group/Saved-views buttons, the Columns button has **no `hide-m` span** around its label — every other toolbar button collapses its text label at mobile (`class="hide-m"`), the Columns one keeps full "Columns"/"Colonnes" text, which is the likely truncation driver.
- The popover body is `case 'cols'` in `src/overlays/popovers.js:331-340` (checkbox list over `TCOLS`, reset button) — no change needed there.
- Phase 68 D-02 deliberately re-enabled this button ≤900px — the fix must keep it visible and functional on phone (only the *layout* changes).

**Likely fix (CSS + one-line markup):** add the same `<span class="hide-m">${t('act.columns')}</span>` pattern as sibling buttons, and/or let `.toolbar` wrap at phone widths (flex-wrap / gap tightening). Where the fix lands: `src/shell/view-engine.js` (markup) + the stylesheet owning `.toolbar`/`.btn-ghost` (CSS file not located this session — executor finds the `.hide-m` definition and toolbar rules by grep). i18n impact: none (existing key).

### Existing mobile specs (to extend per D-08)
- `e2e/mobile-tasks-table.spec.mjs` — Phase 64 (MOB-01): card stack 641–900 px band, boundary pinned at 899 px, desktop-unchanged proof at 1280×720. Conventions: **context-level `viewport` option (never `setViewportSize`), no second Playwright project, one context per account, fixtures through the real API, web-first assertions, no sleeps, no image capture, no `(pointer: coarse)`** [VERIFIED: header comment lines 1-14].
- `e2e/mobile-card-hidden.spec.mjs` — Phase 68 (POL-01): `.mcard` ≤900 px renders hideable fields as a pure function of `hidden[]`; minimum-identity fields (status, title, key, assignees) unconditional. Same conventions.

### Phone-viewport sweep design (D-07)
Assert at a phone viewport (the existing specs' band; suggest ~390×844 or reuse 899-boundary style) on dashboard, members, governance:
- No horizontal document overflow (`document.documentElement.scrollWidth <= innerWidth` style assertion — web-first via `expect.poll`).
- Key headers/toolbars render without truncation (the fixed columns-button case on the tasks view; governance toolbar/dashboard headers).
- Existing 57-UAT regression: hide/show a column via the Columns popover at the phone viewport and verify both table and card stack respond (extends mobile-tasks-table).
Findings triage per the discretion clause: obvious CSS overflow fixed now; deeper layout work noted as deferred follow-ups in the phase summary.

## Ship items

### IN-01 — workspace rename touches `updated_at`

The rename route UPDATE statement, verified verbatim at `server.js` (operator rename route, ~line 7163) [VERIFIED: read of the route block]:
```js
await db.run('update workspaces set name = ?, slug = ? where id = ?', [name, next, ws.id]);
```
The `workspaces` table declares `updated_at integer not null` [VERIFIED: server.js:368-376 create-table block] and the project convention is `const now = () => Date.now()` [VERIFIED: server.js:755]. Every other workspace write touches it, e.g. line 7760: `update workspaces set name = ?, slug = ?, color = ?, updated_at = ? where id = ?` with `now()`.

**Fix:** add `updated_at = ?` + `now()` to the rename UPDATE (one line). Also grep the slug-rename e2e (83-01) for any byte-exact row assertion that would need a bump — the D-06 logInfo line is unchanged.

### IN-02 — unpin the hard-coded catalogue size

Current pin at `test/i18n-core-features.test.mjs` (~line 218) [VERIFIED: read]:
```js
const keys = Object.keys(en);
assert.equal(keys.length, 2030, 'the catalogue size moved');
```
**Critical design input — full key parity across locales does NOT hold today** (computed this session):
- `fr` has 40 keys not in `en` (incl. `contract.frenchOnly`, `templates.importTip/…`, `webhook.serverOnly`, …) and lacks only `contract.englishOnly`.
- `es`, `de`, `nl` each lack exactly `pwa.install.hint` (documented as en+fr same-commit at 77-02).
- en top-level keys = 2030 (matches the pin); fr = 2069.

So a naive "all locales share en's key set" derived check would fail immediately. Options, in order of safety:
1. **Derive from en itself:** replace the literal `2030` with `Object.keys(en).length` computed from the same loaded catalogue — keeps the "size moved" test meaningless though (tautology; loses all value).
2. **Derived + documented-exceptions parity (recommended):** assert (a) every key in es/de/nl exists in en (strict subset check — passes today), (b) every en key exists in fr modulo the two documented exceptions (`contract.englishOnly` ↔ `contract.frenchOnly` and the fr-only legacy extras — the fr side needs an explicit allow-list or a follow-up cleanup decision), and (c) drop the numeric pin. Also check `test/build-locales.test.mjs` — it already asserts fr parity for some families; align rather than duplicate.
3. Pair the derived check with a short human-readable count comment (the test title's running tally prose becomes informational only).

The planner should treat option 2 as the default and confirm the fr-exceptions handling with the owner if the allow-list feels heavy (checkpoint candidate).

### DEPLOY.md — Entra group mapping section (D-09)

Insertion point: extend §"Optional: single sign-on with Microsoft Entra" (`docs/DEPLOY.md`, starts ~line 271 — verified: section header read at the listed location). Four subsections to draft, sourced from 83-CONTEXT + REQUIREMENTS D-82-1..6:

1. **ApplicationGroup claim prerequisites** — Entra admin must configure the app to emit `groups` as Object-ID GUIDs; document the direct-membership-only semantics (ApplicationGroup = direct membership; no app-side nesting resolution — STATE.md blocker note) and that matching is by GUID, never display label.
2. **Overage fallback recipe pointer** — if the tenant exceeds the claim-size limit, the ID token carries an `_claim_names` overage pointer; the app treats it as UNMAPPED (D-82-4: no grants, no removals, login succeeds, warning logged). Point to the STACK recipe for enabling the Graph fallback (getMemberObjects via client-credentials) — **documentation pointer only, not implemented** (deferred item).
3. **Dead-mapping runbook** — mappings become dead when the Entra group is deleted or the workspace ID disappears; they surface as a warning section in the operator console (D-82-6) and a boot log warning; runbook = how to read the console card and remove/re-point the dead rows.
4. **Old-slug 404 policy (D-82-5)** — after a slug rename the old URL 404s permanently, no redirect; renamed workspaces keep reachability via the governance surface; destructive slug change requires confirm.

Ordering/cross-links per discretion. Audiences: self-hosting operators; keep the existing doc's voice (activation rules, exact env vars, "nothing rendered from a client-side guess").

### Version bump (D-11, final task)

- `package.json` version is `3.0.0` [VERIFIED: line 3] → bump to `3.2.0`.
- CHANGELOG.md latest entry is `## [2.6.0] — 2026-11-18` [VERIFIED: line 8] — **there is no 3.0.0 or 3.1.0 entry** (changelog debt; v3.0/v3.1 milestones shipped without CHANGELOG rows). The 3.2.0 entry should follow the established format (Keep a Changelog headings, dated, phase highlights) and the planner should decide whether to note the missing 3.0/3.1 entries or fold their highlights into the 3.2.0 row (checkpoint-worthy one-liner).
- Date of the entry: the ship date.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diacritic-insensitive search | custom `toLowerCase/normalize` | `foldForSearch` (src/core/utils.js) | Already handles folding exactly as assignee picker does |
| Picker modal chrome | new modal CSS/markup | `openModal` + `H()` + assignee-pick markup | Consistent UX per D-01; proven accessible |
| Keyboard handling for chips | ad-hoc keydown listeners | tz combobox contract via `keyboard.js` (`pk._flat` mechanism) | One keyboard pipeline; Enter/Backspace/Escape semantics already solved |
| Catalogue parity checks | regex source scans | Node test over the loaded JSON objects | The files are the ground truth; source-greps miss nested plurals |

**Key insight:** this phase's entire value is *reuse* — every item is a clone, a selector swap, or a one-line server edit.

## Runtime State Inventory

Rename/refactor? No — nothing renamed this phase. Explicitly: None in all five categories — verified by scope review (no rename, no data migration, no service config, no OS registrations, no build-artifact names change; the 3.2.0 bump changes `package.json` version only).

## Common Pitfalls

### Pitfall 1: breaking the invite draft binding
**What goes wrong:** picker confirm triggers `render()` and the typed emails vanish.
**Why:** the invite textarea renders `esc(S.ui.inviteDraft)`; only the silent `IN.inviteDraft` binding survives chip toggles (actions.js:2404-2410 comment).
**Avoid:** keep `S.ui.inviteDraft` as the single source; picker open/apply must not clear it; render reads it back.

### Pitfall 2: "fixed" flaky spec that isn't
**What goes wrong:** one green run after hardening ships a still-flaky test.
**Avoid:** D-06 — 3 consecutive full-suite green runs before declaring BP-02 done.

### Pitfall 3: IN-02 derived check stricter than reality
**What goes wrong:** parity assertion fails on the documented fr extras / `pwa.install.hint` gap.
**Avoid:** the exceptions landscape documented above; build the check to pass today, tighten later.

### Pitfall 4: mobile fix hides the columns button
**What goes wrong:** `display:none` on narrow widths "fixes" truncation but breaks the 68-D-02 re-enabled popover.
**Avoid:** collapse the *label* (`hide-m`) or wrap the toolbar; keep the button itself.

### Pitfall 5: entry chunk regression
**What goes wrong:** picker code added to the entry chunk trips the 500 kB gate.
**Avoid:** ride the lazy `features/assignee-pick.js` chunk (or own chunk); run the chunk-size test after BP-01.

## Code Examples

### Picker state + opener skeleton (cloning the verified pattern)
```js
// src/actions/actions.js — mirrors actions.js:607-628
A.teamPickOpen = el => {
  const surface = el.dataset.surface; // 'invite' | 'member'
  const cur = surface === 'invite' ? S.ui.inviteTeams || [] : S.ui.memberTeams?.teams || [];
  S.ui.teamPick = { surface, draft: [...cur], q: '' };
  if (S.ui.tpMod) openModal({ type: 'teamPick' });
  else import('../features/team-pick.js').then(m => { S.ui.tpMod = m; openModal({ type: 'teamPick' }); });
};
A.teamPickApply = () => {
  const st = S.ui.teamPick; if (!st) return;
  const draft = [...st.draft];
  if (st.surface === 'invite') S.ui.inviteTeams = draft;
  else if (S.ui.memberTeams) S.ui.memberTeams.teams = draft;
  S.ui.teamPick = null; closeModal(); render();
};
```
*(Shape provenance: every expression above mirrors a verified line from actions.js:607-673; the team names/ids are the picker's own.)*

### IN-01 fix (verbatim current line + patch)
```js
// server.js — rename route, current [VERIFIED: read]:
await db.run('update workspaces set name = ?, slug = ? where id = ?', [name, next, ws.id]);
// becomes (matches line 7760's convention):
await db.run('update workspaces set name = ?, slug = ?, updated_at = ? where id = ?', [name, next, now(), ws.id]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Operator console on Settings → Sessions | Operator console on /governance page | Phase 79 | operator-revoke-cycle spec navigation is stale (BP-02 fix) |
| `mteamToggle`/`invTeamToggle` chip toggles, no search | searchable picker modals | Phase 84 (this phase) | state shape preserved |
| Pinned en catalogue size 2030 | derived parity check | Phase 84 (IN-02) | catalogue growth no longer requires pin bumps |

**Deprecated/outdated:** CHANGELOG has no 3.0.0/3.1.0 entries despite package.json 3.0.0 — noted above.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | flows 2FA failure is a TOTP-window/timing flake, not an app regression | BP-02 Failure 4 | If it's a real pending2fa regression, the fix needs app work, not hardening — trace must be read first (executor gate written into the research) |
| A2 | `common.instance` fr value is literally `"Instance"` | BP-02 Failure 3 | If fr differs, the leak has a different source — executor verifies fr.json before STOP_LIST edit |
| A3 | keyboard.js `pk._flat` mechanism is the right hook for picker keyboard handling | BP-01 | If keyboard.js can't serve a modal picker, the picker wires its own keydown handlers with the same aria contract — plan impact only |
| A4 | The `.toolbar` truncation fix is label-collapse + wrap (CSS-side) | BP-03 | If the root cause is a different rule, the sweep reveals it — triage per discretion |
| A5 | Adding team-pick modal to the existing lazy chunk keeps chunks under 500 kB | BP-01 | Chunk-size test would catch it; fallback is a new chunk (cheap) |
| A6 | No slug-rename e2e pins a byte-exact `updated_at` that IN-01 would break | Ship items | One extra grep at execution time; trivial |

## Open Questions (RESOLVED at planning)

1. **flows 2FA trace classification** — RESOLVED as policy, gate kept: 84-01 Task 3 hard-gates on the trace read before hardening; if the landing page never rendered it is an app regression and 84-01 halts (owner ratified D-14, committed 3647f9ed).
2. **fr-locale extras policy for IN-02** — RESOLVED: owner chose "Subset + fix gaps" (D-12, committed 3647f9ed) — explicit allow-list of the fr-legacy extras with documented exceptions, no full-parity backfill. Implemented in 84-02 Task 1.
3. **CHANGELOG 3.0/3.1 gap** — RESOLVED: owner chose full backfill of 3.0.0/3.1.0 then the 3.2.0 entry (D-13, committed 3647f9ed). Implemented in 84-04 with a blocking checkpoint on entry scope/dates.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node (npm scripts, node:test) | all | ✓ | project-managed | — |
| Playwright (`npm run e2e`) | BP-02/03 | ✓ | suite runs today (baseline recorded) | — |
| `test-results/` traces | BP-02 diagnosis | ✓ | 4 failure dirs present | re-run single spec |
| Vite build (chunk gate) | BP-01 | ✓ | runs in test suite | — |

**Missing dependencies with no fallback:** none. (Environment audit: no new external tools needed — phase is code/config-only plus the existing e2e stack.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (unit/integration) + Playwright (e2e), existing |
| Config file | `e2e/playwright.config.mjs` (pinned en-US locale, workers, retries) |
| Quick run command | `npm run e2e` (full suite, ~6.9 min — the phase's unit of proof); unit: `node --test test/i18n-core-features.test.mjs` |
| Full suite command | `npm run e2e` + `npm test` (node suites incl. build-chunk-size, dependencies) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BP-01 | Pickers searchable, chips multi-add, POST shape intact | unit (actions/source pins per repo precedent) + manual smoke | `npm test` (picker source pins + catalogue size stays derived) | ❌ Wave 0 (new pins) |
| BP-02 | 4 red specs green | e2e | `npx playwright test e2e/operator-revoke-cycle.spec.mjs e2e/french-overflow.spec.mjs e2e/flows.spec.mjs` then full `npm run e2e` | ✅ (existing specs) |
| BP-02/D-06 | Flake-free | e2e ×3 | `npm run e2e` three consecutive green runs | ✅ |
| BP-03 | Columns button usable at phone viewport; no overflow on dashboard/members/governance | e2e (mobile) | `npx playwright test e2e/mobile-tasks-table.spec.mjs e2e/mobile-card-hidden.spec.mjs` | ✅ extended, no new files (D-08) |
| IN-01 | Rename stamps `updated_at` | unit/e2e (grep-pin + existing rename e2e) | `npm test` / `npx playwright test` rename spec | ✅/❌ pin may be Wave 0 |
| IN-02 | Derived catalogue check passes | unit | `node --test test/i18n-core-features.test.mjs` | ✅ (edit) |
| Ship | 3.2.0 in package.json + CHANGELOG | manual/CI | `node -p "require('./package.json').version"` | ✅ trivial |

### e2e-green criterion (the phase gate)
Full `npm run e2e` green: **155/155, zero `test.skip`/`test.fixme` debt waivers** (the environment-gated demo-locale conditional skip is the only allowed skip, per D-04). Flaky specs require **3 consecutive green full-suite runs** (D-06) before being declared fixed.

### Sampling Rate
- **Per task commit:** the touched unit suite(s) (`npm test` fast subset) + the touched spec file.
- **Per wave merge:** full `npm run e2e`.
- **Phase gate:** full suite green × (1 for drift fixes, 3 for the flake-hardened flows 2FA spec) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Picker source pins (BP-01) in the established i18n/core-features style
- [ ] IN-02 rewrite of the catalogue test (before picker keys land, so D-12 bumping dies with the pin)
- [ ] (conditional) `updated_at` pin if the rename e2e lacks one

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V4 Access Control | yes (IN-01 touches an operator-gated route) | Route already behind `isInstanceAdmin` + throttle + sameOrigin — unchanged |
| V5 Input Validation | yes (BP-01 sends team ids) | Server-side invite/team validation already keyed; client picker sends existing ids only |
| V7 Errors/Logging | yes | Rename keeps D-06 logInfo convention; no audit-row change |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Existence oracle via picker data | Information Disclosure | Picker lists come from workspace doc members/teams the user already can read — no new endpoint |
| Mass-assignment via picked ids | Tampering | POST body shape unchanged; server re-validates team ids (existing err.teamsRequired/unknownTeam codes) |

No new endpoints, no new secrets, no new dependencies — security surface is unchanged except the one-line IN-01 write.

## Sources

### Primary (HIGH confidence)
- Direct file reads this session: `src/actions/actions.js` (602-689, 2230-2489), `src/features/assignee-pick.js`, `src/pages/settings.js` (57-110, 205-264), `src/shell/view-engine.js` (215-240), `src/overlays/popovers.js` (325-360), `src/pages/governance.js` (grep hit :162), `server.js` (rename route + schema :368-376, now :755), `test/i18n-core-features.test.mjs` (~200-240), `test/build-chunk-size.test.mjs` (1-25), `e2e/flows.spec.mjs` (1012-1130), `e2e/french-overflow.spec.mjs` (380-395, 546-640), `e2e/operator-revoke-cycle.spec.mjs` (140-200), `e2e/mobile-*.spec.mjs` headers, `docs/DEPLOY.md` (~260-300), `package.json`, `CHANGELOG.md`, locale JSON key-set diff (computed).
- `test-results/*/error-context.md` — the four failure error texts + aria snapshot.

### Secondary (MEDIUM confidence)
- `.planning/STATE.md`, `84-CONTEXT.md`, ROADMAP Phase 84 section, REQUIREMENTS D-82-1..6 / BP-01..03, `57-UAT.md` deferred note — planning artifacts, read verbatim.

### Tertiary (LOW confidence)
- flows-2FA flake hypothesis (A1) — needs trace confirmation.

## Metadata

**Confidence breakdown:**
- BP-01 pattern reuse: HIGH — every precedent line read verbatim
- BP-02 root causes: HIGH for 3 failures (error contexts), MEDIUM for flows-2FA (trace pending)
- BP-03: HIGH for the columns-button finding; MEDIUM for sweep details (CSS file not located)
- Ship items: HIGH — all fix sites read

**Research date:** 2026-11-20
**Valid until:** 2026-12-20 (stable; repo-local facts)
