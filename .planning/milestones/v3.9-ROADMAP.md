# Roadmap: Projects Studio

## Milestones

🚧 **v3.9 Backup & Settings UI Refresh** (current — Phases 111–113)
✅ v3.8 Governance UI Refresh (Shipped: 2026-11-29 — Phases 109–110 — [archive](milestones/v3.8-ROADMAP.md))
✅ v3.7 Mappings UX & Team Mapping (Shipped: 2026-11-29 — Phases 106–108 — [archive](milestones/v3.7-ROADMAP.md))
✅ v3.6 Entra ID Mappings & Restore Sources (Shipped: 2026-11-28 — Phases 101–105 — [archive](milestones/v3.6-ROADMAP.md))
✅ v3.5 Backup Destinations SMB & FTP (Shipped: 2026-11-27 — Phases 96–100)
✅ v3.4 UX Polish & Backup Console Refinement (Shipped: 2026-11-24 — Phases 91–95)

*(full shipped-milestone history lives in PROJECT.md + CHANGELOG.md)*

---

## Milestone v3.9 — Backup & Settings UI Refresh

**Goal:** The v3.7/v3.8 design language completed across the two remaining surfaces: Backup console detailing (min-width drift, run-history superset headers — R-15) and Settings unification (all 6 data lists → perm-t per R-14, preference rows keep srow per R-17), plus the housekeeping fold-in (scheduler flake documented per R-16, STATE.md drift).

**Constraints (standing):** zero new deps; ×5 locales same commit; **zero server/API changes** (all When fields already served — members joined-date exception: ship without When rather than extend payload); pins at data-a 635 / data-v 94 / data-r 64 / verbs 86, D-12 same-commit annotations; baseline 2836 / exactly 2 documented failures.

**Research:** `.planning/research/BACKUP-SETTINGS-REFRESH.md` (8cb00689 — backup.js ~85% compliant already, drift is detailing only; settings srow on preference rows is NOT drift).

---

## Phases

### Phase 111: Backup Console Detailing — Client Only
**Goal:** The Backup surface fully on the 11-point design checklist.

- min-width drift 860/820 → 880 (BK-01)
- Run-history superset headers per R-15 (initiator out from under the Task header, backup.js:827; malformed :826 fixed same commit) (BK-02)
- Residual checklist compliance sweep, net-zero data-a (BK-03)

**Success criteria:**
1. Every backup.js data table passes the design checklist (min-width:880, overflow panel, When headers, keyed empty states, esc()).
2. Run-history renders one table with superset headers; restore rows show initiator under the Initiator header, honest `—` where not applicable.
3. Zero server.js/api.js diff; data-a/data-v/data-r/verbs pins unchanged (annotated same-commit if any shifts).
4. ×5 parity + i18n:scan clean; backup/restore client suites green.

**Depends on:** none. **Plans:** 1 plan

Plans:
- [x] 111-01-PLAN.md — Superset run-history headers (R-15/BK-02) as the tracer, then min-width 880 (BK-01) + 11-point checklist sweep (BK-03); zero server diff → 111-01-SUMMARY.md (2 commits, pins unchanged, full-suite baseline held)

### Phase 112: Settings Unification — Client Only
**Goal:** All 6 settings data lists on the design language (R-14); preference rows untouched (R-17).

- Sessions, API keys, Projects (active/archived), push devices, tfa factors, members → perm-t with When columns from served fields (SET-01/02)
- settings-client literal regex pins updated same-commit; data-a counts verified/annotated (SET-03)
- New keys ×5 same commit (SET-04)

**Success criteria:**
1. All 6 lists render perm-t tables consistent with mappings/governance; preference/toggle rows unchanged (srow).
2. When columns populated from served fields only (members may ship without When — documented if so).
3. settings-client pins green after same-commit re-alignment; pin counts annotated if shifted.
4. ×5 parity + i18n:scan clean; zero server diff.

**Depends on:** none (sequential with 111 — both touch the shared i18n pin lines; v3.7 corrected premise). **Plans:** 1 plan

Plans:
- [x] 112-01-PLAN.md — All 6 settings data lists → perm-t (R-14), srow keep-list preserved (R-17), pins net-zero (635/94/64/86), ×5 keys same commit (SET-01..04)

### Phase 113: Housekeeping Fold-In
**Goal:** The small debts close.

- Scheduler/load flake documented-as-known-flake (test-file comment + PROJECT.md annotation; runner serialization parked) (HK-03)
- STATE.md header drift fixed; PROJECT.md:90 optional annotation (HK-04)

**Success criteria:**
1. Flake family carries the documented-known-flake marker; no behavior change attempted.
2. STATE.md header names the right milestone; zero code diff.

**Depends on:** none (disjoint files from 111/112 — .planning docs only).
**Plans:**
- [x] 113-01-PLAN.md — Flake documented-as-known-flake (test comments + PROJECT.md annotation, HK-03/R-16) + STATE.md v3.6→v3.9 drift fix (HK-04)
