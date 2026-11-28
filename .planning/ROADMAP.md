# Roadmap: Projects Studio

## Milestones

🚧 **v3.7 Mappings UX & Team Mapping** (current — Phases 106–108)
✅ v3.6 Entra ID Mappings & Restore Sources (Shipped: 2026-11-28 — Phases 101–105 — [archive](milestones/v3.6-ROADMAP.md))
✅ v3.5 Backup Destinations SMB & FTP (Shipped: 2026-11-27 — Phases 96–100)
✅ v3.4 UX Polish & Backup Console Refinement (Shipped: 2026-11-24 — Phases 91–95)

*(full shipped-milestone history lives in MILESTONES.md)*

---

## Milestone v3.7 — Mappings UX & Team Mapping

**Goal:** Team-level group mapping (optional team per mapping, role unchanged), mapping edit, the Mappings page restructured into proper sections (mappings table / dead mappings table / usage log), and the four v3.6 closeout items.

**Owner rulings:** R-6 optional-team role-unchanged · R-7 usage log = all lifecycle actions · R-8 edit exists, GUID immutable · R-9 Governance UI → v3.8 · R-10 carried items ride phase 108.

**Constraints (standing):** zero new npm deps; audit funnel keyed ×5 locales same commit; dual-engine DDL lockstep (adapterEnsureColumn — v3.7 opens the schema freeze: `team_id`, `team_members.provenance`, `restore_runs.created_by`); test baseline ~2767 / 2–3 documented pre-existing failures; no brittle hard counts.

**Research:** `.planning/research/TEAM-MAPPING.md` · `MAPPINGS-UX.md` · `CARRIED-ITEMS.md` (all committed).

---

## Phases

### Phase 106: Team Mapping & Mapping Edit — Backend

**Goal:** The mapping row optionally targets a team; group-driven team memberships reconcile at SSO sign-in; mappings are editable.

- `team_id` nullable column on group_mappings + `team_members.provenance` (TEAM-01/02, DDL lockstep both engines)
- Reconcile-pass team extension: grant/clean team rows keyed by row provenance, team-only sweep cell, opportunistic doc-orphan sweep (TEAM-03)
- Latent-bug fix: manual teams PUT narrows its delete-all to non-group rows (TEAM-04)
- Semantics: non-winner mappings still grant their team (TEAM-05); distinct `group_team_granted` audit verb (TEAM-06); `team-deleted` orphan class + dead-team skip-still-grants (TEAM-07); route validation + honest delete copy (TEAM-08)
- PATCH edit route: partial update, GUID immutable keyed refusal, `group_mapping_updated` audit, dead rows refuse edit, duplicate-pair guard (EDIT-01/02)

**Success criteria:**
1. A mapping with team_id grants team membership AND workspace role at next SSO sign-in; mapping deletion removes the group team rows at next sign-in (provenance-keyed), never manual rows.
2. Manual teams edit never purges group-stamped team rows (regression-pinned).
3. PATCH changes role/label/workspace/team and audits; GUID tamper and dead-row edit are keyed refusals; ×5 locale parity.
4. Deleted team → `team-deleted` orphan surfaces; workspace role still granted. Dual-engine DDL verified (SQLite + Postgres matrix).

**Plans:** 1/2 plans executed

Plans:
- [x] 106-01-PLAN.md — DDL lockstep + SSO reconcile team sync cell (grant/sweep/dead-team skip) + TEAM-04 PUT narrowing + team-deleted orphan machinery (TEAM-01..07)
- [x] 106-02-PLAN.md — PATCH edit route + POST/GET team validation + refusal keys ×5 locales (TEAM-08, EDIT-01/02)

---

### Phase 107: Mappings SPA — Sections, Tables, Edit UI, Usage Log

**Goal:** The Mappings page becomes three sections with proper tables; mappings get an edit UI.

- "Mappings" table (perm-t idiom): Label / Group ID / Workspace / Team / Role / Users added (liveMembers = current-members semantics) / When (SPA-01)
- Edit UI consistent with staged-delete flow; GUID read-only (SPA-02)
- "Dead group mappings" table replaces the v3.6 card (SPA-03)
- "Usage Log" table: five lifecycle actions, Who = target_name, cap-100 + cap-note (SPA-04)
- Create-form team picker fed by the chosen workspace's doc.teams (SPA-05)

**Success criteria:**
1. All three sections render as tables from the extended list GET; esc() discipline on every cell.
2. Edit flow round-trips through PATCH; GUID immutability visible client-side too.
3. Usage log shows granted/upgraded/downgraded/removed/guard-refused rows with honest Group Name (raw GUID when mapping deleted); cap-note visible at cap.
4. Team picker only offers teams of the selected workspace; ×5 locale parity; i18n-scan + client test pins green.

**Depends on:** 106 (edit route + team fields). **Plans:** 1 plan

Plans:
- [x] 107-01-PLAN.md — Three table sections + edit modal + usage log + team picker + TEAM-08 clause (tracer-first, 3 tasks) — DONE 2026-11-28 (commits 40a73fc0/90632c95/59cd3471; 2814 tests / 2 documented failures)

---

### Phase 108: Restore Probing, Run Attribution & Closeout

**Goal:** The probe badge verifies the run's archive exists on the leg; run history shows who restored; the two small SSO/docs items land. (Parallel-safe with 106/107 — zero shared files except test baseline.)

- Stat-only per-run probe: FTP `size()`, S3 `headObject` (new, generic s3Request), SMB CREATE+CLOSE stat (CARRY-01); three-state badge + toasts ×5; no marker writes
- `restore_runs.created_by` (CARRY-02): ensureColumn both engines, stamp at trigger, render on run card, legacy → `—`
- Fixed non-interpolated logWarn in the SSO callback catch (CARRY-03)
- DEPLOY.md symptom row: email optional claim (CARRY-04)

**Success criteria:**
1. Probe of a leg whose archive was deleted out-of-band returns reachable+missing and the badge shows the third state honestly; present/unreachable states unchanged semantics; run state never mutated; D-89-14 pins green.
2. Run history card shows the operator; legacy rows show `—`; dual-engine DDL verified.
3. SSO failure logs exactly one fixed line; DEPLOY.md row present.
4. No marker PUT/DELETE traffic from restore probes (NAS-observable).

**Depends on:** none (parallel wave with 106). **Plans:** 2 plans

Plans:
- [x] 108-01-PLAN.md — CARRY-01: shared restoreRemoteKey helper, statS3/statFtp/statSmb seams, POST /restore/stat route, additive third badge state, locales ×5, extended D-89-14 pin
- [x] 108-02-PLAN.md — CARRY-02/03/04: restore_runs.created_by (DDL + 3 emit sites + writer + runs GET join + Trigger-cell render), fixed SSO logWarn, DEPLOY.md email-claim row
