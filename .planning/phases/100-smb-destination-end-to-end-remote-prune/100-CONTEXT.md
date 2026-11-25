---
phase: 100-smb-destination-end-to-end-remote-prune
captured: 2026-11-25
status: locked
decisions: 5
---

# Phase 100 — Context: SMB Destination End-to-End + Remote Prune

**Phase goal (ROADMAP):** An operator can enable SMB mirroring per backup task on the proven FTP harness, and rotated-out runs are best-effort pruned from remote mirrors.

**Carried forward:** R-1 (prune follow-local best-effort), R-2 (manual runs stay local-only — proven ×both destinations), R-3 (SMB has no TLS variant — the FTP_INSECURE warning does NOT apply; guest-session keyed info class per SC-2), R-4 (SIZE+sidecar verify), D-88 env-only custody, harness pattern 98 (mirror discipline), client 99 (1,106 LOC, GO verdict). Standing: zero new deps, i18n ×5 same-commit, dual-engine lockstep if new columns, `membershipsOf` byte-gate, data-a pin 623, baseline 2609 tests / 2 documented pre-existing failures.

## Decisions

- **D-01:** Floor-guard semantics (R-1): a mirror copy (SMB or FTP) may be pruned ONLY if the run ALSO holds an S3 copy (`uploaded = 1`) OR S3 is not configured instance-wide (no S3 custody → no doubt about another off-site copy). Never delete a mirror that is the only surviving off-site copy — the local `deleted` status alone is never sufficient. Guard evaluated per-run at prune time (fresh reads, not cached rotation state).
- **D-02:** E2E recipe = ONE compose recipe, TWO dperson/samba containers: default profile `min protocol = SMB2` (happy path backup→SMB→restore) + second container with `SMB3-min` asserting the keyed `smbDialectUnsupported` refusal — both SPIKE-99 pins in one recipe, env-gated `SAMBATEST_URL` + `SAMBATEST_SMB3_URL` skip-when-absent.
- **D-03:** Prune is VISIBLE: runs whose mirrors were pruned show a `pruned` badge in the history list (additive column `remote_pruned` integer on backup_runs, dual-engine ensureColumn; runs payload gains the key in the standard additive way — golden-identity of EXISTING keys preserved). Prune activity audited: `backup_prune_ok:<dest>` / `backup_prune_failed:<dest>` / `backup_prune_skipped:soleCopy`.
- **D-04 (derived):** SMB wiring clones the 98 FTP harness site-by-site (closure inversion R-2, `smb-probe` route + save twins ×5, toggle mirror, badge already in the 96-02 scan, restore fetchToStaged twins, guest-session → keyed `smbGuestAccess` info toast per SC-2).
- **D-05 (derived):** Prune timing = inside the rotation pass (same transactional boundary that marks runs `deleted`), after the local status commit — best-effort per destination: one mirror's failure never blocks the other's prune nor the rotation itself.

## Specifics

- SC-5 DEPLOY: §22 gains FTPS passive ranges + cert trust notes (from 98 §21 baseline) AND the SMB share-perms/ACL pitfall section; §21 (SMB) written in the e2e commit.
- The SMB3-min refusal path doubles as the mock→real falsification point for SPIKE assumptions A1-A4.
- npm test baseline: 2609 tests / 2 documented pre-existing failures (fr-typography, webhook-routes GET list).

## Deferred Ideas

- Prune retry queue (failures logged only, per R-1 best-effort)

## Canonical refs

- .planning/phases/99-smb-2-1-client-spike-hardened/99-SPIKE.md (§3 DEPLOY note, A1-A4 assumptions)
- .planning/phases/98-ftp-destination-end-to-end/98-RESEARCH.md (harness anchors)
- .planning/phases/96-cross-destination-seam-generalization/96-RESEARCH.md (rotation/`deleted` status site)
