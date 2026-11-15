# Phase 64: Mobile Tasks Table & Suite Green - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 4 (2 modified, 1 possibly modified, 1 new)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/styles/responsive.css` (modify) | config/styles | media-query transform | itself — existing 900px tier (lines 16–98), `.hide-m` def (139–141) | exact (self) |
| `src/styles/base.css` (modify, Option B only) | config/styles | media-query transform | itself — `.only-m` flip block (154–161) | exact (self) |
| `src/views/table.js` (modify — card template only, line 94) | component template | transform (state → HTML string) | itself — the card stack being polished; desktop `tcell()` row cells show the same field helpers | exact (self) |
| `e2e/mobile-tasks-table.spec.mjs` (new) | test / e2e spec | request-response (API fixtures) + DOM measurement | `e2e/french-overflow.spec.mjs` (viewport-scoped box/scroll assertions) + `e2e/projects-table.spec.mjs` (API fixture + signIn pattern) | exact |

All analog paths verified git-tracked (`git ls-files` non-empty this session).

## Pattern Assignments

### `src/styles/responsive.css` — the Columns hide rule (D-01..D-04)

**Analog:** the file's own 900px tier, and the `.hide-m` convention at lines 139–141.

**Existing 900px tier header** (line 16):
```css
@media (max-width: 900px) {
```

**Existing `!important` hide convention** (lines 139–141, inside the 640px tier):
```css
.hide-m {
  display: none !important;
}
```

**New rule shape** (research Pattern 1; place inside the 900px tier, lines 16–98):
```css
[data-pop="cols"] { display: none !important; }
```
- Attribute selector = generic per D-03 (the single render site is `src/shell/view-engine.js:227`: `${opt.cols ? `<button class="btn btn-ghost" data-a="pop" data-pop="cols" data-key="${key}">...` — verified this session).
- `!important` matches the file's own `.hide-m` convention.
- If Option B (band decision): also move/override the `.only-m` flip. Existing flip is at **640px** (`base.css:154-161` — `.only-m { display: none; }` then `@media (max-width: 640px) { .only-m { display: block; } }`), NOT 900px as D-01 assumed. The cheapest Option B is one rule in responsive.css's 900px tier: `.only-m { display: block; }` (later file wins the cascade at ≤900px; base.css 640px rule stays harmless). `.tbl-wrap` already carries `hide-m` inline (`src/views/table.js:83`), but `.hide-m` is only *defined* at 640px (responsive.css:139) — if the band decision wants the desktop table gone at 900px, the 900px tier must also define `.hide-m { display: none !important; }` (or move the def). Flag for planner checkpoint (research Open Question 1).

---

### `src/views/table.js` — card stack polish (D-05..D-08)

**Analog:** the file itself, line 94 — the exact template being polished (verbatim, verified):

```js
<div class="only-m" style="padding:8px 16px 90px">${ts.map(t => `<div class="panel" style="padding:12px;margin-bottom:8px" data-a="openTask" data-id="${t.id}"><div class="row" style="margin-bottom:8px">${stIcon(t.status)}<b style="font-weight:500" class="grow">${esc(t.title)}</b><span class="mono faint" style="font-size:11px">${t.key}</span></div><div class="row" style="flex-wrap:wrap;gap:10px;font-size:12px" class="muted">${prPill(t.priority)}${avStack(t.assignees || [], 3, 'sm', false)}<span class="muted">${esc((t.assignees || []).length ? `${mem(t.assignees[0])?.name || ''}${t.assignees.length > 1 ? ` +${t.assignees.length - 1}` : ''}` : tk('common.unassigned'))}</span>${dueHtml(t)}${t.estimate ? `<span class="faint">${ic('timer', 12)} ${esc(fmtEstimate(t.estimate))}</span>` : ''}<span style="width:64px;display:inline-flex" data-tip="${tk('page.columns.progress')}">${progBar(taskProg(t), t.status === 'done' ? 'green' : '')}</span></div></div>`).join('')}</div>`;
```

Polish-relevant facts (verified from source):
- **Imports block** (lines 2–7) already supplies every helper the card needs: `esc, fmtDate, iso` (utils), `tk, fmtEstimate` (i18n), `ic` (icons), store helpers, `avStack, dueHtml, lbl, prPill, progBar, stIcon, stPill` (`../ui/helpers.js`), `groupTasks, viewOf` (view-engine). No new imports needed for polish.
- **Bug to fix during polish:** duplicate `class` attribute on the second div (`class="row" ... class="muted"`) — parser keeps only `row`; `muted` is inert. One-attribute edit.
- **Title `b.grow` has no `overflow-wrap`** — D-08 wrap-everything requires adding `overflow-wrap: anywhere` (or `break-word`) to the title (and ideally all card children) via a responsive.css rule scoped to the card stack, byte-lean. Do NOT add JS text-measuring (research "Don't Hand-Roll").
- **Known nowrap fighters** (must not reach card children): `white-space: nowrap` at `base.css:93-94,119`, components.css (6 sites), `responsive.css:287`. Check `.mono`/chip classes on mobile.
- **Fixed `width:64px` progress span** is fine — let the row wrap around it, keep the span fixed.
- **Keep the field set fixed** (D-06): status icon/title/key/priority/assignees/assignee-name/due/estimate/progress. No new fields, no `hidden[]` coupling.
- **Keep the `data-a="openTask" data-id` contract** — desktop specs and any mobile tap both open the task; do not change the action wiring.
- **Byte budget:** ~220 B chunk headroom; prefer moving repeated inline styles into 1–2 terse responsive.css classes over adding inline bytes.

---

### `e2e/mobile-tasks-table.spec.mjs` — new spec (D-09..D-12)

**Primary analog:** `e2e/french-overflow.spec.mjs` — the suite's only viewport-scoped spec.

**Header comment + imports convention** (french-overflow lines 1–16):
```js
/* =====================================================================
   PHASE ... : <what the spec proves, which decisions, which conventions>
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, newRunId, ... } from './helpers/setup.mjs';
```

**Viewport via context option** (french-overflow lines 69–72, 75–81) — D-10's mechanism, no second project:
```js
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },   // ← the mobile size this phase asserts
];
async function signIn(browser, account, viewport) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    ...(viewport ? { viewport } : {}),
    extraHTTPHeaders: { 'x-forwarded-for': account.ip },
  });
  ...
}
```

**Fixtures through the real API, never the browser** (french-overflow `beforeAll` lines 435–508 and projects-table's `addProject`): dedicated account via `createAccount(BASE_URL, run, tag, name, { locale, workspace })`, then GET the workspace doc (`/api/workspaces/{slug}`), push a full task object (see french-overflow lines 473–497 for the complete task shape — `id, key, project, title, status, assignee, priority, labels, deps, estimate, created, updated, order, ...`), PUT back with `{ revision, doc }`. **For D-12's 4+ assignees:** seed real members — either create member accounts via `createAccount` + workspace join, or reuse the doc's `memberId` plus invite-accepted members; keep it deterministic with fixed ids/titles.

**Scroll/overflow measurement assertions** (french-overflow lines 710–724) — the closest existing precedent for D-11's truncation check:
```js
const measured = await bar.evaluate(el => ({
  scrollWidth: el.scrollWidth,
  clientWidth: el.clientWidth,
  overflow: [...el.querySelectorAll('[role="tab"]')]
    .filter(t => { const r = t.getBoundingClientRect();
      return r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.width === 0; })
    .map(t => t.textContent.trim()),
}));
expect(measured.overflow, `... clipped at ${vp.width}px`).toEqual([]);
expect(measured.scrollWidth, `...`).toBeLessThanOrEqual(measured.clientWidth);
```
New spec's per-card version (research Pattern 3):
```js
const overflow = await card.evaluate((el) => el.scrollWidth - el.clientWidth);
expect(overflow).toBeLessThanOrEqual(2); // small tolerance per D-11
```
Plus a document-level guard (`french-overflow` lines 211–215 is the precedent):
```js
const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
expect(sw, `${route}: the document overflows horizontally ...`).toBeLessThanOrEqual(cw);
```

**Columns-button assertions:** locator `page.locator('[data-pop="cols"]')` (stable structural selector — the button is the phase's own contract); `await expect(colsBtn).toBeHidden()` at 899px (auto-retrying; passes for `display:none` — desired, Pitfall 3). At 390px assert the card stack visible: `await expect(page.locator('.only-m .panel').first()).toBeVisible()` plus bounding-box width > 0.

**Boundary test:** width **899** (and optionally 900/901 sanity) asserting the post-change band state — which state (table-only vs cards) depends on the planner's Option A/B checkpoint; write the assertion to match the decision.

**Conventions to copy:**
- One `beforeAll` fixture account + workspace; `newRunId()` for uniqueness (french-overflow lines 27–42, 435–441).
- `try { ... } finally { await context.close(); }` around every test body (all french-overflow tests).
- Header comment block naming the phase, decisions (D-01..D-12), and conventions.
- No sleeps, no `networkidle`, no screenshots, no `toHaveCount(0)` on the Columns button (Pitfall 3 — would tempt a JS fork; `toBeHidden()` only).
- Never modify `projects-table.spec.mjs` / `saved-views.spec.mjs` — they are the regression proof (Pitfall 5).

---

### `src/styles/base.css` (conditional — Option B only)

**Analog:** the file's own `.only-m` block (lines 154–161, shown above). If the planner picks Option B, prefer overriding in responsive.css's 900px tier over editing this block — byte-cheap, keeps one file as the breakpoint source of truth, and base.css's 640px flip stays as a harmless no-op under it.

## Shared Patterns

### Wrap-everything overflow policy (D-08)
**Source:** research "Don't Hand-Roll" + Pitfall 2
**Apply to:** card template polish + the responsive.css rules added for it
```css
/* terse, inside the relevant tier — long unbroken keys/estimates need 'anywhere' */
.only-m .panel, .only-m .panel * { overflow-wrap: anywhere; }
```
Never `white-space: nowrap`, never `text-overflow: ellipsis` on card children.

### Per-task triad (build + chunk gate + tests)
**Source:** ROADMAP §Phase 64 + STATE.md anti-features
**Apply to:** every task in the plan
```bash
npm run build        # includes the 500 kB chunk gate — run after EVERY CSS/JS task
npm test             # unit gate (1524+)
npx playwright test e2e/mobile-tasks-table.spec.mjs   # new spec during the phase
npx playwright test  # full parallel close run (D-14) — VIEW-02 included
```

### Suite conventions for new e2e
**Source:** `e2e/french-overflow.spec.mjs`, `e2e/helpers/setup.mjs`
**Apply to:** `e2e/mobile-tasks-table.spec.mjs`
- Fixtures only via real API (`helpers/setup.mjs`), one context per account, `try/finally context.close()`, role/label queries, catalogue-derived strings, zero sleeps/`networkidle`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | none; all four files have exact analogs (three are self-analogs: the phase edits/extends existing patterns in place) |

## Metadata

**Analog search scope:** `src/styles/`, `src/views/`, `src/shell/`, `e2e/`
**Files scanned:** ~10 (read in full: table.js, french-overflow.spec.mjs; targeted: responsive.css 1–160, base.css 140–161, view-engine.js toolbar 220–235, projects-table.spec.mjs head, helpers/setup.mjs exports)
**Tracked-source gate:** all named analogs verified via `git ls-files` — no mirror paths.
**Pattern extraction date:** 2026-11-14
