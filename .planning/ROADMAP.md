# Roadmap: Projects Studio

## Standing Constraints (milestone-invariant)

- **Zero new npm dependencies** — SMB/FTP clients hand-rolled on node stdlib (`net`/`tls`/`crypto`/`fs`/`stream`), `export/s3.js` precedent.
- **Env-only credential custody (D-88 unchanged)** — `FTP_*`/`SMB_*` boot-frozen consts mirroring `S3_*` (server.js:208-219); never DB rows; secrets never logged (V14; NTLM type-3 + FTP PASS scrubbed).
- **Dual-engine DDL lockstep** — new columns (`ftp_enabled`, `smb_enabled`) via `adapterEnsureColumn` in SQLite AND Postgres; one SQL shape, no JSON columns.
- **Audit funnel** — every probe refusal and mutation keyed + audited; all new keys land ×5 locales (en/fr/nl/de/es) in the same commit.
- **`npm test` baseline** — 2609 tests / 2 documented pre-existing failures; `membershipsOf` byte-gate and existing suites stay green at every phase.

## Shipped Milestones

- **v3.4 UX Polish & Backup Console Refinement** — SHIPPED 2026-11-24 (Phases 91–95, 10 plans) → [v3.4-ROADMAP.md](milestones/v3.4-ROADMAP.md) · [v3.4-REQUIREMENTS.md](milestones/v3.4-REQUIREMENTS.md)
- **v3.5 Backup Destinations SMB & FTP** — SHIPPED 2026-11-27 (Phases 96–100, 14 plans) → [v3.5-ROADMAP.md](milestones/v3.5-ROADMAP.md) · [v3.5-REQUIREMENTS.md](milestones/v3.5-REQUIREMENTS.md)

Previous milestones v1.0–v3.4: see [MILESTONES.md](MILESTONES.md) and `.planning/milestones/`.

## Backlog

- **GFS rotation UAT** (v3.5 carry / owner UAT 2026-11-27): owner will create a backup job with 2-day retention to observe the GFS rotation, prune badges (remote_pruned) and the rotation-deletion preview against the real NAS. Deferred from the v3.5 owner-UAT checklist — scheduled-run badges validated OK the same day.
- **Restore-source selection + availability check** (v3.5 carry, phase 101 candidate): let the operator choose which mirror source (s3/ftp/smb/local) a restore reads from, with an availability check per source.
