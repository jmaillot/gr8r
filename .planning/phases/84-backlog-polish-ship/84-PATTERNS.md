# Phase 84: Backlog Polish & Ship - Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 12 (BP-01 pickers ×3-4, BP-02 specs ×3, BP-03 view-engine + 2 specs, ship ×4)
**Analogs found:** 12 / 12 (all clone/extend existing tracked files — no new-file-no-analog case)

All analog paths below verified git-tracked (`git ls-files`). One correction to RESEARCH.md: the keyboard pipeline lives at `src/actions/keyboard.js`, **not** `src/core/keyboard.js`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/features/team-pick.js` (or 2nd export in assignee-pick.js) | component (modal) | request-response (open/search/apply) | `src/features/assignee-pick.js` | exact |
| `src/actions/actions.js` — picker trio additions | controller (actions) | event-driven | actions.js:603-673 assignee trio | exact |
| `src/actions/actions.js` — opener call sites (~2247, ~2454) | controller | event-driven | same file, self | exact |
| `src/actions/keyboard.js` — chip keyboard wiring (Enter/Backspace/Escape) | controller | event-driven | settings.js `pk._flat` → `src/actions/keyboard.js` mechanism | role-match |
| `e2e/operator-revoke-cycle.spec.mjs` (edit) | test (e2e) | request-response | itself — nav-step swap pattern | exact |
| `e2e/flows.spec.mjs` (edit) | test (e2e) | request-response | operator-revoke-cycle.spec.mjs `nextWindow` pattern | exact |
| `e2e/french-overflow.spec.mjs` (edit) | test (e2e) | transform (leak scan) | itself — STOP_LIST cognate pattern | exact |
| `src/shell/view-engine.js` (edit :227) | component | request-response | itself — sibling `hide-m` buttons :225/:226/:228 | exact |
| `e2e/mobile-tasks-table.spec.mjs` / `e2e/mobile-card-hidden.spec.mjs` (extend) | test (e2e) | request-response | their own header-comment conventions | exact |
| `test/i18n-core-features.test.mjs` (edit ~:218) | test (unit) | transform | itself + `test/build-locales.test.mjs` | exact |
| `server.js` (edit, rename route ~:7163) | service (route) | CRUD | itself — line 7760 UPDATE convention | exact |
| `docs/DEPLOY.md` + `CHANGELOG.md` + `package.json` | docs/config | — | DEPLOY.md §Entra (~:271), CHANGELOG `## [2.6.0]` entry | exact |

## Pattern Assignments

### BP-01 — team picker (controller + component, event-driven)

**Analog:** `src/actions/actions.js:603-673` (open/toggle/apply trio) + `src/features/assignee-pick.js` (modal markup)

**Opener with draft-in-`S.ui` + lazy chunk gate** (actions.js:607-628) — clone verbatim, swap `assigneePick`→`teamPick`, `apMod`→`tpMod`, add `surface: 'invite'|'member'` to the state shape:

```js
S.ui.assigneePick = { taskId: id, subtaskIndex: subI, draft: [...cur], q: '' };
if (S.ui.apMod) openModal({ type: 'assigneePick' });
else import('../features/assignee-pick.js').then(m => { S.ui.apMod = m; openModal({ type: 'assigneePick' }); });
```

**Apply = ONE array write on confirm** (actions.js:646-649 excerpt) — `teamPickApply` writes the whole draft back to `S.ui.inviteTeams` or `S.ui.memberTeams.teams`, then `S.ui.teamPick = null; closeModal(); render();`.

**Modal markup** (assignee-pick.js:15-52): `H(title, subtitle)` chrome → search `<input class="input" data-in="assigneePickQ" placeholder="${t('modal.assigneeSearch')}" autofocus>` → accumulated-draft chip row with `data-a=...Toggle` remove `ibtn` (:29-36) → scrollable candidate list of `role="checkbox" aria-checked` `.opt` buttons filtered by `foldForSearch(st.q).text.includes(foldForSearch(name).text)` (:20-45, import `foldForSearch` from `../core/utils.js`) → no-match hint (`t('modal.assigneeNoMatches')` precedent) → footer cancel/`act.done` buttons. Copy this wholesale; team candidates come from workspace teams instead of members.

**Keyboard/aria contract** (settings.js:229-240): `role="combobox" aria-expanded aria-controls aria-activedescendant` on the input, `role="listbox"`/`role="option"` with `.hl` highlight on the list — but D-03 semantics differ: **Enter selects and keeps the input open** (chip accumulates), Backspace removes the last chip. Hook via `pk._flat` pattern (settings.js:226 `pk._flat = list; // keyboard.js picks the highlighted entry from here` — implementer reads `src/actions/keyboard.js` first, per RESEARCH assumption A3; fallback = local keydown handlers keeping the same aria contract).

**Files touched:** `src/actions/actions.js` (trio + opener buttons on both surfaces), `src/features/assignee-pick.js` or new `src/features/team-pick.js` (chunk decision per RESEARCH option A/B), `src/actions/keyboard.js` (chip keys), 5 locale files (search placeholder / no-matches keys, cf. `modal.assigneeSearch`/`assigneeNoMatches`).

**Do-not-break constraints (from RESEARCH, load-bearing):** POST reads `[...new Set(S.ui.inviteTeams || [])]` at actions.js:2302 & :2426 stay untouched; `S.ui.inviteDraft` silent binding (actions.js:2404-2410) must survive picker open/confirm; member-edit edit touches only `teams`, never `scope`/`scopeTouched`.

### BP-02 — e2e repairs (test, request-response)

**Analog 1 — nav-step-only drift fix:** `e2e/operator-revoke-cycle.spec.mjs:170/212/238` (and its local `openSettingsSec` helper at :161, duplicated in flows.spec.mjs:1079). Phase 79 moved the operator console to `/governance`; replace only the navigation step with `page.locator(`[data-a='go'][data-r='governance']`).click()` (data-a/data-r sidebar pattern visible in the helper at :155-157); keep `getByText(fmt('settings.operator.title', {}, lang))` and everything after untouched (D-05).

**Analog 2 — TOTP-window hardening:** operator-revoke-cycle.spec.mjs:180-186 + the spec-level comment "Four nextWindow waits … can legitimately cross up to four 30s boundaries" (:171-172):

```js
await nextWindow(first.lastStepSec);
```

flows.spec.mjs:1086 gets this pattern: after a failed `submitTfaCode`, assert the honest error (`err.invalidTfaCode`/`err.challengeExpired`), recompute from fresh `Date.now()` (don't reuse stale `nowStep`), `nextWindow()` between submits, and widen the `toHaveURL` timeout. Executor gate: read `test-results/flows-…pending2fa…/trace.zip` first. D-06: 3 consecutive green full-suite runs.

**Analog 3 — STOP_LIST cognate entry:** `e2e/french-overflow.spec.mjs:560-580`:

```js
// 'Admin' — the role label's French catalogue value is identical to the
// English one (common.role.admin).
'Admin',
```

Add `'Instance'` in the same style: cognate comment citing the key (`common.instance`), after verifying `src/locales/fr.json` value is literally `"Instance"` (assumption A2). No app change.

### BP-03 — mobile toolbar (component + test extension)

**Analog:** `src/shell/view-engine.js:225-228` — sibling toolbar buttons collapse their label at phone width; the Columns button (:227) is the only one without `hide-m`:

```js
// :226 (Sort — the pattern to copy)
<button class="btn btn-ghost" data-a="pop" data-pop="group" data-key="${key}">${ic('rows-3', 14)}<span class="hide-m">${t('page.groupLabel')}</span> ...</button>
// :227 (Columns — the fix site)
<button class="btn btn-ghost" data-a="pop" data-pop="cols" data-key="${key}">${ic('columns-3', 14)}${t('act.columns')}</button>
```

Fix = wrap `${t('act.columns')}` in `<span class="hide-m">` (+ optional `.toolbar` flex-wrap CSS — grep the stylesheet for `hide-m` / `.toolbar` definitions; locator work the executor does). Pitfall 4: never `display:none` the button itself — Phase 68 D-02 re-enabled it ≤900px. i18n impact: none.

**Spec extension analogs:** `e2e/mobile-tasks-table.spec.mjs:1-14` header conventions — context-level `viewport` option (never `setViewportSize`), no new spec files (D-08), one context per account, fixtures via real API, web-first assertions (`expect.poll` for `scrollWidth <= innerWidth`), no sleeps, no image capture.

### Ship — IN-01, IN-02, docs, version

**IN-01 analog:** `server.js:7760` convention vs the rename route (~:7163):

```js
// current (rename route):  await db.run('update workspaces set name = ?, slug = ? where id = ?', [name, next, ws.id]);
// convention (line 7760):  update workspaces set name = ?, slug = ?, color = ?, updated_at = ? where id = ?  with now()
```

One line: add `updated_at = ?` + `now()` (`const now = () => Date.now()`, server.js:755). Grep the slug-rename e2e for byte-exact row assertions first (assumption A6).

**IN-02 analog:** `test/i18n-core-features.test.mjs:216-218` (the pin) + `test/build-locales.test.mjs` (existing parity-assertion style to align with, not duplicate) + `scripts/locales.mjs` (locale file discovery pattern: readdir `src/locales/*.json`, sorted — reuse for the derived check's per-locale iteration). Replace `assert.equal(keys.length, 2030, ...)` with: strict en-superset check for es/de/nl (fix the 3 real gaps: add `pwa.install.hint` to es/de/nl), en-vs-fr modulo documented exceptions (`contract.englishOnly`/`frenchOnly` pair + fr-legacy extras allow-list), numeric pin dropped.

**DEPLOY.md analog:** `docs/DEPLOY.md:271-290` — §"Optional: single sign-on with Microsoft Entra" voice: activation rules, exact `.env` dotenv blocks, "nothing is rendered from a client-side guess". Add the "Entra group mapping" subsections inside this section (claim prerequisites, overage-fallback pointer, dead-mapping runbook, old-slug 404 policy per D-82-5).

**CHANGELOG analog:** `CHANGELOG.md:8-15` — format `## [2.6.0] — 2026-11-18 — <Title>` + `N phases… Highlights:` bullets (Keep a Changelog). Per D-13: backfill 3.0.0/3.1.0 from milestone summaries, then add 3.2.0. `package.json:3` → `3.2.0`, last task per D-11.

## Shared Patterns

### Draft-in-`S.ui` survives re-renders
**Source:** `src/actions/actions.js:607` (comment block) — apply to picker state (`S.ui.teamPick`) so background renders and the invite-draft silent binding (`IN.inviteDraft`, actions.js:2404-2410) never wipe user input.

### Lazy-chunk gate ≤500 kB
**Source:** `src/features/assignee-pick.js:1-7` header + `test/build-chunk-size.test.mjs:15-17` — picker bytes leave the entry chunk via dynamic-import + `S.ui.<mod>` module cache; run the chunk-size test after BP-01.

### i18n all-5-locales same commit
**Source:** `test/i18n-core-features.test.mjs` running-tally comment — every new picker key lands in en/fr/es/de/nl in the same commit as the emitting markup (D-12); locale discovery via `scripts/locales.mjs`.

### Web-first e2e assertions
**Source:** `e2e/mobile-tasks-table.spec.mjs:1-14` header — extend, don't rewrite; no sleeps, no image capture, no second Playwright project.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | | | Every BP-01..ship item maps to a tracked in-repo analog; the phone-viewport sweep reuses the two existing mobile specs as conventions sources |

## Metadata

**Analog search scope:** `src/actions/`, `src/features/`, `src/pages/`, `src/shell/`, `src/core/`, `src/overlays/`, `e2e/`, `test/`, `scripts/`, `docs/`, root
**Files scanned:** ~25 (read/grep); 12 named as analogs, all tracked
**Pattern extraction date:** 2026-11-20
**Corrections to RESEARCH.md:** keyboard pipeline is `src/actions/keyboard.js` (not `src/core/keyboard.js`)
