# Requirements — v3.9 Backup & Settings UI Refresh

*Research: `.planning/research/BACKUP-SETTINGS-REFRESH.md` (committed 8cb00689, HIGH — both pages read in full, all anchors line-verified).*

## Standing constraints

- Zero new npm dependencies. ×5 locales (en/de/es/fr/nl) same commit as first emitting usage. esc() discipline on every cell. D-12 same-commit pin doctrine (current: data-a 635, data-v 94, data-r 64, verbs 86). No brittle hard counts. Baseline 2836 tests / exactly 2 documented pre-existing failures (french-typography content, webhook-routes GET list).
- **Zero server/API changes** — every When-column field is already served (started_at, lastSeenAt, expiresAt, lastUsedAt, created_by_name…). One plan-phase verification: members joined-date payload field (if absent, the members table ships WITHOUT a When column rather than extending the payload — never a server change for this).

## Owner rulings

- **R-14 All 6 settings tables** — Sessions, API keys, Projects (active/archived), push devices, tfa factors, members all convert to perm-t; preference/toggle rows KEEP their srow shape (the research's #1 taste risk).
- **R-15 Superset headers** — the merged backup/restore run-history table gets ONE header set (superset); each row kind fills what applies, honest `—` elsewhere.
- **R-16 Flake documented, not chased** — the v3.3-era scheduler/load flake is resource contention (never reproduces isolated): document-as-known-flake (test-file comment + PROJECT.md annotation), runner serialization parked as future housekeeping.
- **R-17 Design language applies to data lists only** — pickers, comboboxes, member pickers, and toggle rows are exempt from conversion.

## Requirements

### Backup console detailing (Phase 111 — client-only, small)

- [x] **BK-01**: min-width drift closed — runs-history table (:429) and restore table (:320) from 860/820 → the 880 standard.
- [x] **BK-02**: restore-row header alignment — initiator data currently renders under the "Task" header (backup.js:827); per R-15 the run-history table gets superset headers (Task / Workspace / Project / Initiator / When / …) with per-kind rows filling what applies, `—` elsewhere; malformed :826 line fixed in the same commit.
- [x] **BK-03**: any residual backup.js surface failing the 11-point design checklist (research §Q3) brought to compliance; no data-a churn expected (net-zero).

### Settings unification (Phase 112 — client-only, larger)

- [x] **SET-01**: the 6 data lists convert to perm-t per R-14: Sessions (:860–866), API keys (:811–820), Projects active/archived (:460/:483), push devices, tfa factors, members. Preference/toggle rows keep srow (R-17).
- [x] **SET-02**: When columns from served fields (lastSeenAt/expiresAt for sessions; lastUsedAt/createdAt for keys; etc.). Members ship without a When column if the joined-date field isn't already served (never a payload extension).
- [x] **SET-03**: settings-client.test.mjs literal regex pins (:56–58, :97–101) updated same-commit with the markup; one data-a per markup occurrence preserved — verify counts, annotate same-commit if any shift.
- [x] **SET-04**: new page.settings.* keys ×5 same commit (headers/When labels); settings.audit.* removal already clean.

### Housekeeping (Phase 113 — rides parallel)

- [ ] **HK-03**: v3.3-era scheduler/load flake documented per R-16 — test-file comment at the known-flake family + PROJECT.md deferred-items annotation ("documented-known-flake, runner serialization parked as future housekeeping"); zero behavior change.
- [ ] **HK-04**: STATE.md header drift fixed (says v3.6 — auto-refresh at milestone intake); optional PROJECT.md:90 annotation; no other wording residue (ROADMAP clean, seeds marked — verified by research).

## Requirement → phase map

| Req | Phase |
|---|---|
| BK-01..03 | 111 |
| SET-01..04 | 112 |
| HK-03, HK-04 | 113 |
