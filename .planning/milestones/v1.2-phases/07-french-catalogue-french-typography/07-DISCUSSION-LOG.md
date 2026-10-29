# Phase 7: French Catalogue & French Typography - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-23
**Phase:** 7-french-catalogue-french-typography
**Areas discussed:** French reachability, typography authority, linter placement, catalogue completeness, project templates, estimates, seed/notification data, billing removal, layout proof, read-through sign-off, translation workflow

---

## French reachability

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal activation now | `applyPrefs()` maps the stored `lang` label to a locale code and calls `setLocale()`; the existing selector becomes functional; phase 8 replaces storage/selector/mapping | ✓ |
| Tests-only | Render functions exercised under `setLocale('fr')` in node tests; browser French waits for phase 8 | |
| Move phase 8 work forward | Build the real selector and persistence now | |

**User's choice:** Minimal activation now
**Notes:** The mapping is explicitly throwaway; phase 8 owns the real locale preference.

---

## Typography authority

| Option | Description | Selected |
|--------|-------------|----------|
| ROADMAP/PROJECT rule | U+00A0 before `:`, U+202F before `; ! ?`, U+00A0 inside `« »`; correct REQUIREMENTS I18N-05 to match | ✓ |
| REQUIREMENTS I18N-05 | Narrow NBSP before all four marks | |
| Defer | Decide per-string during translation | |

**User's choice:** ROADMAP/PROJECT rule
**Notes:** REQUIREMENTS.md I18N-05 wording gets corrected as a phase task.

---

## Linter placement

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated test now | `test/french-typography.test.mjs` on every `npm test`; phase 11 wires the same check into prebuild | ✓ |
| Build gate now | Add it to `prebuild` immediately | |
| Manual review only | No automated typography check | |

**User's choice:** Dedicated test now
**Notes:** Checks plain space before `; : ! ?`, straight apostrophe, `...`, missing NBSP inside guillemets, non-NFC. Times like `14:30` are exempt.

---

## Catalogue completeness

| Option | Description | Selected |
|--------|-------------|----------|
| Failing completeness test now | Every non-`contract.*` English key needs a French value; plurals carry `one` + `other`; identical values must be present | ✓ |
| Report only | Script lists missing keys without failing CI | |
| Defer to phase 11 sweep | Completeness checked at the end | |

**User's choice:** Failing completeness test now
**Notes:** Values that legitimately stay identical (Projects Studio, Ctrl) must exist in `fr.json`, not be omitted. Human read-through remains separate.

---

## Project templates

| Option | Description | Selected |
|--------|-------------|----------|
| Translate templates + stored titles | Template name/description and the 42 starter titles become catalogue values; created tasks store the translated title | ✓ |
| Translate chrome only | Starter tasks keep English titles when stored | |
| Store keys, translate at render | Data model change: template id + task key at render | |

**User's choice:** Translate templates + stored titles
**Notes:** A mixed-language workspace is accepted: an English member sees the French titles a French template created.

---

## Estimates

| Option | Description | Selected |
|--------|-------------|----------|
| Display-only formatter | Storage stays ASCII (`2d`, `30m`); French renders `2 j` / `30 min` | ✓ |
| Leave ASCII | Estimates stay visually English | |

**User's choice:** Display-only formatter

---

## Seed leaks

| Option | Description | Selected |
|--------|-------------|----------|
| Notification fragments | Stored English fragments rendered raw in the inbox become structured data + catalogue keys | ✓ |
| Invoice status `Paid` | Translate the display label, keep the stored value | |
| Plan labels | Translate the displayed label, keep wire values English | |

**User's choice:** Notification fragments; remove all billing info and plans
**Notes:** Invoice status became moot once billing removal was chosen.

---

## Billing removal scope

| Option | Description | Selected |
|--------|-------------|----------|
| Remove end-to-end | Delete Billing settings group, plan modal/prompts, `perm.billing` column, `/plan` endpoint, stored `plan`, seeded invoices, keys and tests; legacy fields ignored | ✓ |
| Remove UI only | Delete screens, keep endpoint and stored field | |
| Keep Plan, remove Payment + Invoices | Partial removal; plans stay in the product | |

**User's choice:** Remove end-to-end
**Notes:** Explicitly labelled a product change, not a translation task; the user chose to absorb it into phase 7. No data migration — legacy `plan`/`invoices` are tolerated and ignored on load.

---

## Layout proof

| Option | Description | Selected |
|--------|-------------|----------|
| Automated overflow spec + spot-check | One Playwright spec at 1280 px and 390 px fails on document overflow / clipped fixed chrome | ✓ |
| Manual visual pass only | Inspect screens and fix reactively | |
| No layout verification | Rely on eyeballing during execution | |

**User's choice:** Automated overflow spec + spot-check

---

## Read-through sign-off

| Option | Description | Selected |
|--------|-------------|----------|
| Your read-through + sign-off | User reviews the app in French across main routes and signs off in a notes file; wording fixes land before close | ✓ |
| Agent audit, you spot-check | Subagent flags awkward phrasing; user checks only flagged items | |
| Defer human review | Postpone to the final milestone audit | |

**User's choice:** Your read-through + sign-off

---

## Notification storage

| Option | Description | Selected |
|--------|-------------|----------|
| Structured kind + render | Seed rows become `{ kind, actor, target }`, rendered via `t('notif.*')`; legacy `text` renders verbatim | ✓ |
| String-matching at render | Map known English strings to keys; unseen strings stay English | |

**User's choice:** Structured kind + render

---

## Translation workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Glossary + namespace batches | Glossary first, then namespace batches (page 512, settings 196, act 144, a11y 132, toast 95, modal 67, err 64, rest ~236), each gated by both tests | ✓ |
| Single pass | One agent translates all 1,446 keys at once | |
| User provides translations | Phase only wires values in and validates | |

**User's choice:** Glossary + namespace batches

---

## the agent's Discretion

- Glossary contents beyond the core nouns.
- Batch order within the namespace list.
- Exact overflow heuristic in the Playwright spec.
- Re-indexing the settings subnav once the Billing group is removed.

## Deferred Ideas

- Removing the remaining demo/seed sample content (D15 keeps it English).
- Per-user locale persistence, selector redesign, locale negotiation — phase 8.
- Wiring the typography check into `prebuild` — phase 11.
- Additional locales (German, Spanish, Japanese).
- Broader billing-adjacent marketing copy removal beyond the D-13 inventory.
