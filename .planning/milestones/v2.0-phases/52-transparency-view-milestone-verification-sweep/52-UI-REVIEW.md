# Phase 52 — UI Review

**Audited:** 2026-11-09
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md exists for this phase) + sibling patterns inside `src/pages/members.js`, `src/components/task-list.js`, `src/ui/helpers.js`
**Screenshots:** Not captured (no dev server on ports 3000/5173/8080 — code-only audit)
**Interaction captures:** off (workflow.ui_interaction_capture is false)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All copy i18n-gated EN+FR, but the inline fetch-error state renders a bare `—` (no message) and the visible loading label reuses an `a11y.*` key |
| 2. Visuals | 3/4 | Expander chevron never changes on open (sibling `task-list.js` swaps chevron-down/right); expanded panel has no heading or affordance |
| 3. Color | 4/4 | Neutral token-based styling only; one hardcoded `rgba(0,0,0,.03)` fallback literal (unreachable in practice) |
| 4. Typography | 4/4 | No new sizes/weights; only token sizes; minor inherited-size inconsistency in state text |
| 5. Spacing | 3/4 | `gap:6px` and `10px…14px` padding are off the `--s-*` scale (consistent with the file's inline-style convention, but off-scale) |
| 6. Experience Design | 3/4 | Excellent stale-guard and refetch-per-open; missing `aria-busy`/`aria-controls`, silent inline error, text loading state instead of skeleton |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **Inline fetch-error state is a bare em-dash** — `src/pages/members.js:78` (`else if (data.err) body = '<span class="faint">—</span>'`). The admin who expanded a row sees a silent `—`; the only explanation is a toast that may already be dismissed, and screen readers get nothing (the `—` is not inside any labelled region). Impact: the diagnostic view (the entire point of TRN-01) reads as "no data" instead of "fetch failed" — an admin could wrongly conclude a member has zero access. Fix: add `page.members.visReasonError` ("Couldn't load project access." / FR equivalent), render it in the `data.err` branch, and keep the toast as reinforcement. No new deps; one EN key + one FR key + one template change.

2. **Expander affordance doesn't change when open** — `src/pages/members.js:90` renders `ic('chevron-down', 14)` unconditionally; only `aria-expanded` changes. The sibling expander pattern in the same codebase (`src/components/task-list.js:60`) swaps `chevron-right` ↔ `chevron-down` based on open state. Impact: an open row looks identical to a closed one apart from the panel below it; discoverability of collapse is zero at a glance. Fix: `${visOpen ? ic('chevron-down', 14) : ic('chevron-right', 14)}` — or a CSS rotate on the existing icon, matching `task-list.js`.

3. **'Team' reason lost the team name** — the endpoint returns only coarse codes (`everyone/lead/member/team`, T-52-03 pin in `test/transparency.test.mjs`), so the UI renders a bare "Team"/"Équipe" (`members.js:83`, keys `en.json:1426`/`fr.json:1426`). D-52-5 explicitly specified `Team: {name}` — the view exists so admins can see WHY. For a member in multiple teams, "Team" is ambiguous: the admin cannot tell which team grants access without cross-referencing the Teams tab. Fix (server+client, no funnel edit): have `projectAccessReason` return an optional `teamName` alongside the coarse code, add the `{name}` placeholder key now that a live call-site exists, and extend the scan allowlist comment. If deferred, at minimum document the ambiguity in `docs/WorkspacePermissions.md` §7.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

All new strings pass the i18n gate with full EN↔FR parity and proper French typography (`Tout le monde` / `Responsable` / `Membre` / `Équipe`, `Aucun projet accessible pour ce membre.` — `en.json`/`fr.json:1423-1427`, `a11y.memberVisibility:1381`). `npm run i18n:scan` re-run during this audit: 0 dead, 0 stale. No generic labels ("Submit", "OK") introduced. Empty state is specific, not generic ("No projects this member can access." — names the subject).

Findings:
- **WARNING — error state has no copy.** `members.js:78` renders `—` on fetch failure. Compare: the empty state gets a full sentence; the failure state gets punctuation. Fix in Top 3 #1.
- **WARNING — visible label from the `a11y.*` namespace.** `members.js:77` uses `t('a11y.loading')` ("Loading"/"Chargement") as visible panel text. Everywhere else that key is an accessibility label only (`src/shell/skeletons.js:32` uses it inside `aria-label`). The codebase has no visible "Loading" precedent — sibling detail rows simply render skeletons. Fix: either add a `page.members.visLoading` key ("Checking access…" / "Vérification de l'accès…") or render the existing page skeleton pattern.
- Informational — the loading copy "Loading" is also context-free: it doesn't say what is loading. Folded into the fix above.

### Pillar 2: Visuals (3/4)

Structure is consistent with the file's conventions: the detail row is an 8-column `colspan` row under the member row (`members.js:87`), project rows are `.row` + name + neutral `.badge`, and the expander is a `.ibtn.ibtn-sm` with `aria-label` + `aria-expanded` (`members.js:90`). Icon-only button correctly paired with an aria-label. Reason badges are deliberately plain per D-52-7 — no chips/icons — so the neutral `.badge` (var(--surface-2)/var(--text-2), `components.css:496-509`) matches the decision.

Findings:
- **WARNING — static chevron** (Top 3 #2). Every other expander in the codebase signals open state through the icon (`task-list.js:60`, `task-list.js:105`).
- **Minor — no visual separation or heading in the expanded panel.** The panel is a bare stack on a `var(--bg)` tint; no "Project access" label, no count. Sibling detail surfaces (e.g. pending-invites panel, `members.js:113`) carry a `<h2>` + count. Acceptable for a one-off row expansion, but a faint header line (`t('page.members.visTitle')` + `data.projects.length`) would match the established panel-h pattern.
- **Minor — project rows lack the project icon.** Sibling project listings use `pIcon(p, …)` (`members.js:172,216`). Here only `esc(p.name || p.id)` renders. D-52-7 bans chips/icons for *reasons*, not for project identity; this is a consistent-but-sparser choice. Low priority.

### Pillar 3: Color (4/4)

No accent (`--accent`) usage anywhere in the new UI — correct for a diagnostic read-only surface. All colors route through tokens: `.faint` → `var(--text-3)` (`base.css:88`), `.badge` → `var(--surface-2)`/`var(--border)`, panel tint `var(--bg)`. Dark mode is safe (both themes define `--bg`, `tokens.css:7/102-107,142`).

Finding:
- **Minor — hardcoded fallback literal.** `members.js:87` uses `background:var(--bg, rgba(0,0,0,.03))`. The `rgba(0,0,0,.03)` fallback is unreachable while `--bg` is defined in `tokens.css` (it always is, both themes), and if it *were* reached, a black-tint fallback would be wrong in dark mode. Drop the fallback: `background:var(--bg)`. Cosmetic.

### Pillar 4: Typography (4/4)

No new font sizes or weights introduced. The only explicit typography in the new UI comes from the `.badge` class (`--fs-xs`, weight 500 — token-driven, `components.css:499-500`). Project names inherit the table's body size. No arbitrary `px` font sizes.

Finding:
- **Minor — state text inherits table body size.** The loading/error/empty text in `members.js:77-79` renders at the table's inherited body size (~14.5px), while the adjacent faint metadata convention in the same row is 12px (`members.js:91` email line, `font-size:12px`). A `font-size:12px` on those state spans would match the row's internal hierarchy. Cosmetic; does not block.

### Pillar 5: Spacing (3/4)

The design system defines a spacing scale `--s-1:4px … --s-12:48px` (`tokens.css:62-70`). The new panel uses:

- `gap:6px` on the panel stack (`members.js:87`) — off-scale (nearest tokens: 4px / 8px)
- `gap:8px` on project rows (`members.js:84`) — on scale (`--s-2`)
- `padding:10px 14px 14px 14px` on the detail cell (`members.js:87`) — 10px is off-scale, and top (10) ≠ sides/bottom (14)

Mitigating context: the whole file uses inline pixel styles extensively (`gap:8px`, `gap:10px`, `gap:14px`, `margin-bottom:12px` at lines 44-116), so the new code follows the file's existing (loose) convention rather than introducing a new one. This is a file-wide debt, not a Phase 52 regression.

Finding:
- **Minor — `gap:6px` and asymmetric `10px…14px` padding.** Fix: `gap:var(--s-1)` (4px) or `var(--s-2)` (8px), and `padding:var(--s-2) 14px var(--s-3) 14px` (or plain `8px 14px 12px`). Any consistent on-scale value is fine; the specific choice matters less than leaving the scale.

### Pillar 6: Experience Design (3/4)

State coverage is genuinely good for a small surface:

- **Loading:** yes — `memberVisibilityData = null` on open (`actions.js:2418`) renders the faint "Loading" line (`members.js:77`)
- **Error:** yes, two paths — no-workspace/no-user pre-flight (`actions.js:2421-2428`) and non-ok response (`actions.js:2430-2438`), the latter with a `tErr` toast and 401 delegation to the central intercept
- **Empty:** yes — `visReasonEmpty` (`members.js:79`)
- **Stale-guard:** excellent — both success (`actions.js:2442`) and error (`actions.js:2435`) paths drop results when `S.ui.memberVisibility !== id`, so a close/re-target mid-flight never renders a stale answer (D-52-3 honored); refetch on every open with no caching (`api.js:332-339`)
- **Unknown data:** unknown reason codes escaped as-is (`members.js:83` — `esc(String(p.reason))`); roster change between render and click handled (`actions.js:2420-2428`)
- **Gating:** expander only for `isAdmin && m.userId` rows (D-52-4 client mirror); server `requireWorkspace('admin')` is the control (verified in 52-01 tests: 403 per non-admin role, keyed neutral 404)
- Destructive-action confirmation: n/a (read-only view)

Findings:
- **WARNING — no `aria-busy` on the loading panel.** `skeletons.js:32` sets `aria-busy="true"` on the loading page; the visRow loading state is plain text with no busy semantics. Fix: add `aria-busy="true"` to the `<td>` when `!data`, or wrap the panel in a region.
- **WARNING — no `aria-controls`/id linkage.** The expander button (`members.js:90`) has `aria-expanded` but no `aria-controls`, and the detail row has no `id`. Screen-reader users get state but no relationship. Fix: `id="vis-${esc(m.id)}"` on the detail `<td>` (or its inner div) + `aria-controls` on the button.
- **WARNING — inline error state is silent** (Top 3 #1) — covered there.
- **Minor — text loading state instead of skeleton.** The codebase has a skeleton convention (`src/shell/skeletons.js`); three shimmer lines would match it better than "Loading" text. Low priority given the panel is small and fetches are fast.

---

## Registry Safety

Skipped — no `components.json` in the repo (shadcn not initialized) and no UI-SPEC registries declared.

## Verification Re-runs Performed During Audit

- `npm run i18n:scan` → 0 literals, 0 dead, 0 stale, 0 unresolved (EN↔FR parity for all Phase 52 keys)
- `data-a` site count: 480 — matches the pin updated in 52-02

---

## Files Audited

- `src/pages/members.js` (Phase 52 surface: lines 67-90 — visRow, expander; sibling patterns at 91-116)
- `src/actions/actions.js` (lines 2403-2445 — `A.memberVisibilityToggle`)
- `src/core/api.js` (lines 332-339 — `api.memberVisibility`)
- `src/locales/en.json` / `src/locales/fr.json` (lines 1381, 1423-1427)
- `src/core/store.js` (S.ui defaults — no `memberVisibility` keys initialized; consistent with `memQ`/`memRole` convention of guard-on-read)
- `src/ui/helpers.js` (`empty()` signature), `src/styles/components.css` (`.badge` 496-544, `.ibtn` 119+), `src/styles/base.css` (`.faint`/`.row`), `src/styles/panels.css` (`.stack`), `src/styles/tokens.css` (spacing scale, `--bg`, font scale)
- `src/components/task-list.js` (sibling expander pattern, lines 55-75)
- `src/shell/skeletons.js` (loading-state precedent, line 32)
- Planning artifacts: 52-CONTEXT.md, 52-01/02/03-SUMMARY.md, 52-02-PLAN.md
