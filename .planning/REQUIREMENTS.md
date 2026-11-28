# Requirements — v3.8 Governance UI Refresh

*Research: `.planning/research/GOVERNANCE-REFRESH.md` (committed e4395efe, HIGH — all anchors line-verified).*

## Standing constraints

- Zero new npm dependencies. ×5 locales (en/de/es/fr/nl) same commit as first emitting usage. esc() discipline on every cell. D-90-3/4 semantics untouched (roster-first, promote-only, 2-char floor, cap-note). No brittle hard counts. Test baseline 2836 / 2 documented pre-existing failures (french-typography content, webhook-routes GET list) — the flake fix in HK-02 removes webhook-events from the exceptions list.
- **Zero server/API changes** for GOV-* (presentation-only over three existing GETs).

## Owner rulings

- **R-11 Full conversion** — the Super Admin candidate srow list converts to the perm-t table too (D-90-3/4 semantics preserved).
- **R-12 Unify Backup/Restore tabs** — they must visually match Super Admin and the v3.7 design language (perm-t tables, When column, same min-width).
- **R-13 Housekeeping rides phase 110** — ROADMAP corrections as bracketed notes (never silent rewrites), seed marks, flake fix.

## Requirements

### Governance UI unification (Phase 109 — client-only)

- [ ] **GOV-01**: Super Admin tab converts to perm-t tables — the candidate srow cards (governance.js:165–218) become table rows; recent-activity trail (:301–312) follows the section/table idiom; D-90-3/4 semantics intact (roster-first, promote-only, 2-char floor, cap-note rendered per idiom).
- [ ] **GOV-02**: Backup Operator + Restore Operator tabs gain the When column and adopt the standard min-width/table idiom (roleTabView :239–292) — all three tabs visually unified with the v3.7 mappings tables.
- [ ] **GOV-03**: "When" column content per table decided in-plan (last_login_at vs grantedAt — trivial either way, documented).
- [ ] **GOV-04**: ~2–4 new `page.governance.*` keys ×5 same commit; pin watch: verbs unchanged (no api calls); data-a bumped same-commit only if a markup occurrence moves (D-12).

### Housekeeping (Phase 110)

- [ ] **HK-01**: ROADMAP.md + PROJECT.md stale anchors corrected via bracketed annotation notes (v3.6 archive :81–82 anchor family + "2672 tests", v3.7 archive :20 baseline, :44 plan count, :77/:90 parallel-safe premise) — never silent rewrites; seed files annotated as implemented (all three in `.planning/seeds/`).
- [ ] **HK-02**: webhook-events due.reminder flake fixed at the test — inject a fixed `now` (`${today}T08:05:00Z`, route already accepts it at server.js:6546) into both reminder passes; baseline becomes exactly 2 documented failures; zero server change.

## Requirement → phase map

| Req | Phase |
|---|---|
| GOV-01..04 | 109 |
| HK-01, HK-02 | 110 |
