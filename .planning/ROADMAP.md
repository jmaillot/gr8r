# Roadmap: Projects Studio

## Milestones

🚧 **v3.8 Governance UI Refresh** (current — Phases 109–110)
✅ v3.7 Mappings UX & Team Mapping (Shipped: 2026-11-29 — Phases 106–108 — [archive](milestones/v3.7-ROADMAP.md))
✅ v3.6 Entra ID Mappings & Restore Sources (Shipped: 2026-11-28 — Phases 101–105 — [archive](milestones/v3.6-ROADMAP.md))
✅ v3.5 Backup Destinations SMB & FTP (Shipped: 2026-11-27 — Phases 96–100)
✅ v3.4 UX Polish & Backup Console Refinement (Shipped: 2026-11-24 — Phases 91–95)

*(full shipped-milestone history lives in PROJECT.md + CHANGELOG.md)*

---

## Milestone v3.8 — Governance UI Refresh

**Goal:** All Governance tabs unified on the v3.7 table design language (Super Admin candidates fully converted — owner ruling R-11; Backup/Restore tabs brought to parity — R-12), plus docs/test housekeeping (ROADMAP corrections as annotations, seed marks, the webhook-events due.reminder flake fix).

**Constraints (standing):** zero new deps; ×5 locales same commit; zero server/API changes for GOV-*; D-90-3/4 untouched; baseline 2836 / 2 documented failures (flake fix removes webhook-events from the exceptions).

**Research:** `.planning/research/GOVERNANCE-REFRESH.md` (e4395efe).

---

## Phases

### Phase 109: Governance perm-t Unification — Client Only
**Goal:** Every Governance tab renders perm-t tables in the v3.7 design language.

- SA candidate srow cards → table rows (D-90-3/4 intact) + activity trail idiom (GOV-01, R-11)
- Backup/Restore tabs: When column + standard min-width/table idiom (GOV-02, R-12)
- When-column content documented per table (GOV-03); new keys ×5 same commit; pin watch data-a (GOV-04)

**Success criteria:**
1. All three tabs (SA / Backup Op / Restore Op) render perm-t tables visually consistent with the v3.7 mappings tables; esc() on every cell.
2. D-90-3/4 semantics verified untouched (roster-first, promote-only, 2-char floor, cap-note) — governance-client pins green.
3. ×5 locale parity + i18n:scan clean; data-a/verbs pins annotated same-commit.
4. Zero server.js/api.js diff (client-only phase).

**Depends on:** none. **Plans:** 1 plan
- [ ] 109-01-PLAN.md — Governance perm-t unification: SA tables, trail idiom, Backup/Restore When column (client-only)

### Phase 110: Docs & Test Housekeeping
**Goal:** The accumulated planning-bookkeeping debt and the last flake close out.

- ROADMAP/PROJECT stale anchors corrected via bracketed notes (HK-01) — includes the parallel-safe premise wording
- Seeds annotated implemented (3 files) (HK-01)
- due.reminder flake fixed via fixed-now injection; baseline reworded to exactly 2 failures (HK-02)

**Success criteria:**
1. Stale anchors carry bracketed corrections, no silent rewrites; seeds marked.
2. webhook-events suite green across repeated runs (incl. pre-08:00 UTC timing); full suite = exactly 2 documented failures.
3. Zero server.js change (test-only fix).

**Depends on:** none (parallel-safe with 109 — disjoint files: docs/test vs client code). **Plans:** 1 plan

Plans:
- [x] 110-01-PLAN.md — Bracketed anchor corrections + seed marks (HK-01) and due.reminder fixed-now flake fix + baseline reword (HK-02) — DONE 2026-11-29 (commits 2f1e5b5e/36ae3245; 6 annotations, survival gate proved; webhook-events ×3 green; 2836 tests / exactly 2 documented failures)
