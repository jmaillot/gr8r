# Roadmap: Projects Studio

## Standing Constraints (milestone-invariant)

- **Zero new npm dependencies** — SMB/FTP clients hand-rolled on node stdlib (`net`/`tls`/`crypto`/`fs`/`stream`), `export/s3.js` precedent.
- **Env-only credential custody (D-88 unchanged)** — `FTP_*`/`SMB_*` boot-frozen consts mirroring `S3_*` (server.js:208-219); never DB rows; secrets never logged (V14; NTLM type-3 + FTP PASS scrubbed).
- **Dual-engine DDL lockstep** — new columns (`ftp_enabled`, `smb_enabled`) via `adapterEnsureColumn` in SQLite AND Postgres; one SQL shape, no JSON columns.
- **Audit funnel** — every probe refusal and mutation keyed + audited; all new keys land ×5 locales (en/fr/nl/de/es) in the same commit.
- **`npm test` baseline** — 2492 tests / 2 documented pre-existing failures; `membershipsOf` byte-gate and existing suites stay green at every phase.

## Shipped Milestones

- **v3.4 UX Polish & Backup Console Refinement** — SHIPPED 2026-11-24 (Phases 91–95, 10 plans) → [v3.4-ROADMAP.md](milestones/v3.4-ROADMAP.md) · [v3.4-REQUIREMENTS.md](milestones/v3.4-REQUIREMENTS.md)

Previous milestones v1.0–v3.3: see [MILESTONES.md](MILESTONES.md) and `.planning/milestones/`.

## v3.5 — Backup Destinations SMB & FTP

**Milestone goal:** Extend the backup destination family (local + S3) with SMB/CIFS and FTP/FTPS mirrors on the existing v1 pipeline — zero-dep, env-only custody, per-task opt-in toggles, probe parity, restore read-back.

Build order per research SUMMARY.md: seam refactor FIRST (unblocks both wirings), then FTP client → FTP wiring → SMB client → SMB wiring (+prune). TEST-01 golden vectors land with each client phase; env-gated e2e recipes land with each wiring phase.

## Phases

- [ ] **Phase 96: Cross-Destination Seam Generalization** - Turn the S3 single-slot seam into a destination registry; columns, custody pattern, run-truth and location-badge seams generalized, S3 behavior byte-identical
- [ ] **Phase 97: FTP/FTPS Client (Zero-Dep)** - Hand-rolled `export/ftp.js` (~350 LOC) on node:net/node:tls with golden-vector tests, no wiring
- [ ] **Phase 98: FTP Destination End-to-End** - FTP wiring on the generalized seam: toggle, staged upload, probe ×5, restore read-back, vsftpd e2e recipe
- [ ] **Phase 99: SMB 2.1 Client (Spike-Hardened)** - Hand-rolled `export/smb.js` SMB2.1 + NTLMv2 client (~1,400–1,600 LOC) pinned by RFC 1320 / transcript golden vectors, no wiring
- [ ] **Phase 100: SMB Destination End-to-End + Remote Prune** - SMB wiring on the proven harness, best-effort follow-local prune (R-1), dperson/samba e2e recipe

## Phase Details

### Phase 96: Cross-Destination Seam Generalization

**Goal**: The S3 single-slot seam becomes a destination registry so FTP and SMB can plug in without S3 behavior changing one byte.
**Depends on**: Nothing (first phase of v3.5)
**Requirements**: DEST-01, TEST-01 (byte-gate portion)
**Success Criteria** (what must be TRUE):
1. `setBackupS3Destination` (export/backup.js:635-645) is a registry accepting multiple destinations; S3 upload, verify, sidecar, probe and restore behave byte-identically for existing tasks (S3 golden-vector suite green, diff-verified).
2. `ftp_enabled` and `smb_enabled` flat boolean columns exist beside `s3_enabled` via `adapterEnsureColumn` in both SQLite and Postgres (dual-engine lockstep proven by test); existing DBs migrate additively, second boot is a no-op.
3. Run truth is per-destination integer flags and the run status stays the single terminal `upload_failed`, whose error text names the failed destination(s); local publish stays valid; alerts ride the `handleBackupTaskOutcome` transition gate verbatim.
4. `FTP_*`/`SMB_*` env custody is boot-frozen mirroring `S3_*` (server.js:208-219) with enabled-derivation and invalid-token warn parity; `membershipsOf` byte-gate and the full suite stay at baseline (2492 tests / 2 documented failures).
5. Restore location-badge seam (`RESTORE_LOCATION_KEYS` + server flag derivation) generalized so a new destination is a one-line extension.

**Plans**: 2/2 plans executed

Plans:
- [x] 96-01-PLAN.md — Registry refactor: setBackupDestination(name, dest) + S3 install + dormant ftp/smb slots + Wave-0 byte-identity gate (DEST-01, TEST-01)
- [x] 96-02-PLAN.md — DDL columns + /api/config flat flags + ordered badge scan + i18n ×5 + full-suite baseline (DEST-01)

### Phase 97: FTP/FTPS Client (Zero-Dep)

**Goal**: A tested, standalone FTP/FTPS client module exists — parser, transfers, TLS — with no pipeline wiring yet.
**Depends on**: Phase 96
**Requirements**: FTP-01, TEST-01 (FTP golden vectors)
**Success Criteria** (what must be TRUE):
1. `export/ftp.js` implements USER/PASS, TYPE I, EPSV with PASV fallback (control-host rule + `FTP_PASV_HOST` override), STOR, DELE, PBSZ/PROT P, QUIT, NOOP keep-alive and REST resume — node:net/node:tls only, zero npm additions.
2. `FTP_SECURE` enum `explicit`(default)/`implicit`/`none` works: explicit = AUTH TLS→PBSZ→PROT P; implicit = transport swap; TLS session-reuse is captured from the control socket and passed to every data-channel `tls.connect` (pinned by test).
3. Reply-parser golden vectors (multiline 2xx, 227/229 pasv parsing, 4xx-vs-5xx classification) are first-class tests mirroring the SigV4 suite idiom.
4. The PASS line and credential-bearing command lines are never present in errors or logs (scrub verified by test); error surfaces carry keyed classes (`ftpAuthFailed`, `ftpUnreachable`, `ftpTlsFailed`, `ftpPassiveFailed`, `ftpPathNotFound`, `ftpQuotaExceeded`, `ftpGeneric`).
5. Package.json diff shows zero new dependencies; full suite stays at baseline.

**Plans**: 1/1 plans executed

Plans:
- [x] 97-01-PLAN.md — Standalone zero-dep FTP/FTPS client (export/ftp.js): parser SM + golden vectors, mock-server client tests, TLS modes + session reuse, fetchToStaged, scrub, probeFtp, phase gates (FTP-01, TEST-01)

### Phase 98: FTP Destination End-to-End

**Goal**: An operator can enable FTP/FTPS mirroring per backup task and the full pipeline — upload, verify, probe, restore, badges — works against a real FTP server.
**Depends on**: Phase 97 (client), Phase 96 (seam)
**Requirements**: FTP-02, DEST-03 (FTP probe parity — establishes the pattern SMB reuses), TEST-01 (FTP e2e recipe)
**Success Criteria** (what must be TRUE):
1. A scheduled backup task with `ftp_enabled` uploads its archive to FTP after local publish+verify (staged, local-first preserved); verify = SIZE check + existing sidecar sha256 (R-4, documented deviation from S3 read-back); manual Run-now runs stay local-only (R-2).
2. Probe-at-save is a hard 400 refusal while the destination is enabled-but-unreachable ("task was not saved" parity); a standalone write+delete marker probe route with typed error classes exists, every refusal keyed ×5 locales in the same commit; `FTP_INSECURE=true` produces the keyed insecure-tls warning (S3 `httpWarning` parity, R-3).
3. Run rows and the restore list show the FTP location badge (`RESTORE_LOCATION_KEYS` extended); restore read-back works via `fetchToStaged` with sha256 verification.
4. Mirror failure yields the single terminal `upload_failed` naming FTP, local archive survives, alert fires through the unchanged transition gate; secrets never appear in logs.
5. An env-gated vsftpd docker e2e recipe (mirroring the MinIO recipe, skip-when-absent) proves backup→FTP→restore end-to-end; full suite at baseline.

**Plans**: 4 plans
**UI hint**: yes

Plans:
- [ ] 98-01-PLAN.md — Tracer: ftp install closure (R-2) + FTP.config() + loop generalization + mock-pipeline test (FTP-02)
- [ ] 98-02-PLAN.md — Probe route + probe-at-save twins + ftp_enabled persistence + i18n ×5 (DEST-03)
- [ ] 98-03-PLAN.md — Toggle UI mirror + actions/api wiring + probe toasts + i18n ×5 (FTP-02, DEST-03)
- [ ] 98-04-PLAN.md — Restore read-back twins + vsftpd e2e recipe + DEPLOY §21 (FTP-02, TEST-01)

### Phase 99: SMB 2.1 Client (Spike-Hardened)

**Goal**: A golden-vector-pinned, standalone SMB2.1 client exists — the research-heavy risk item contained to a well-tested module before any wiring.
**Depends on**: Phase 96 (seam is ready; client itself is independent of FTP phases)
**Requirements**: SMB-01, TEST-01 (MD4/NTLM golden vectors)
**Success Criteria** (what must be TRUE):
1. `export/smb.js` implements NBSS + SMB2 header codec, NEGOTIATE (2.1, 2.0.2 fallback), SESSION_SETUP with NTLMv2 (hand-rolled MD4), TREE_CONNECT, CREATE, serial ≤60KB WRITE×N, CLOSE, READ, ECHO keep-alive and SESSION_SETUP-retry on sessionExpired — node:crypto only, zero npm additions.
2. MD4 is pinned by RFC 1320 golden vectors; NTLMv2 type-1/2/3 transcript fixtures and SMB2 HMAC-SHA256 signing-key derivation are first-class tests (SigV4-suite idiom); signing is unconditional.
3. Errors carry typed `smbClass` classes (`authFailed`, `treeConnectFailed`, `shareNotFound`, `unreachable`, `signingRequired`, `noSpace`, `nameConflict`, `sessionExpired`, `generic`) and NTLM type-3 material is scrubbed from all errors/logs (V14 parity, test-pinned).
4. A spike report records the actual LOC vs the ~1,400–1,600 MEDIUM-confidence estimate and any dialect surprises; dialect-rejection exposure (SMB2-min-3.0 fleets) is documented as a known risk, not silently absorbed.
5. Package.json diff shows zero new dependencies; full suite stays at baseline.

**Plans**: TBD
**Risk**: SMB LOC estimate is MEDIUM confidence (research) — spike/golden-vector phase is the containment; fleet dialect coverage (SMB 2.1 minimum on home-NAS fleets) is MEDIUM confidence — DEPLOY.md note + feedback loop required.

### Phase 100: SMB Destination End-to-End + Remote Prune

**Goal**: An operator can enable SMB mirroring per backup task on the proven FTP harness, and rotated-out runs are best-effort pruned from remote mirrors.
**Depends on**: Phase 99 (client), Phase 98 (harness pattern)
**Requirements**: SMB-02, DEST-02 (scheduled-only + best-effort follow-local prune, R-1/R-2), DEST-03 (SMB probe classes), TEST-01 (SMB e2e recipe)
**Success Criteria** (what must be TRUE):
1. A scheduled backup task with `smb_enabled` uploads via the same seams as FTP (toggle in the task editor render-gated on `/api/config`, staged upload after local publish, SIZE+sidecar verify per R-4, location badges, restore read-back via `fetchToStaged`); manual runs stay local-only (R-2), proven ×both destinations.
2. Probe parity holds: hard 400 refusal at save while enabled-but-unreachable, standalone write+delete marker probe with SMB typed error classes keyed ×5 locales in the same commit; guest-session surfaces the keyed info class.
3. Best-effort follow-local prune (R-1) deletes SMB/FTP copies of runs whose local status becomes `deleted` by rotation — failure logged, never fatal, floor-guard against deleting a mirror that is the only surviving copy; prune activity audited.
4. Mirror failure yields the single terminal `upload_failed` naming the failed destination(s), local publish stays valid; all DEST-02/DEST-03 refusals are keyed and audited ×5 locales.
5. An env-gated dperson/samba docker e2e recipe (ideally a signing-required variant) proves backup→SMB→restore end-to-end; DEPLOY.md gains §21 (share perms, ACL pitfall) and §22 (FTPS passive ranges, cert trust); `membershipsOf` byte-gate and the full suite stay at baseline.

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 96. Cross-Destination Seam Generalization | 2/2 | In Progress|  |
| 97. FTP/FTPS Client (Zero-Dep) | 1/1 | In Progress|  |
| 98. FTP Destination End-to-End | 0/4 | Not started | - |
| 99. SMB 2.1 Client (Spike-Hardened) | 0/? | Not started | - |
| 100. SMB Destination End-to-End + Remote Prune | 0/? | Not started | - |
