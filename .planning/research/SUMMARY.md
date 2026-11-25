# RESEARCH SUMMARY — v3.5 Backup Destinations: SMB & FTP

**Date:** 2026-11-25 · **Mode:** Feasibility (4 dimensions) · **Standing constraint honored:** zero new npm dependencies (D-33-11); env-only config custody (D-88 unchanged, owner ruling 2026-11-25).

---

## Executive Summary

v3.5 adds SMB and FTP/FTPS as off-site backup destinations beside the existing S3 destination. Both are **feasible with zero npm dependencies**, and both are smaller-risk wire clients than the in-repo precedent: `export/s3.js` is a hand-rolled 630-LOC SigV4 client; FTP/FTPS is a ~350-LOC line protocol on `node:net`/`node:tls` (explicit FTPS = one AUTH TLS upgrade; implicit is a transport swap). SMB is the hard one: a hand-rolled **SMB 2.1-only pure-Node client (~1,400–1,600 LOC)** with NTLMv2 auth — requiring a hand-rolled MD4 (~60 LOC, RFC 1320, because OpenSSL 3 dropped MD4) and unconditional HMAC-SHA256 packet signing (mandatory on Server 2025 / Win11 24H2 / hardened Samba). The kernel `cifs` mount alternative is **rejected**: it needs SYS_ADMIN + host kernel module + an image package, and converts connection errors into un-detectable hung mounts — incompatible with gr8r's env-custody and honest-probe posture.

The in-repo extension surface is fully mapped (see Seams). The ratified upload slot (post-verify/publish, export/backup.js:832) is the single insertion point; a second destination is ~8 touch groups per destination (env custody, column, provider seam, `/api/config` + client state + form, probe routes, i18n ×5 locales, restore fetch, tests). Operational semantics are decided-by-default: 3 flat boolean columns (never a JSON blob — D-89-15 + dual-engine discipline), one `upload_failed` terminal status naming failed destinations, alerts ride `handleBackupTaskOutcome` verbatim, restore needs one primitive `fetchToStaged(config, path, expectedSha256, stagingDir)`.

Key risks: (1) SMB2 client complexity — ops research recommends FTPS-first, SMB behind a spike; weighed against the owner's "SMB et FTP" parity ask, the recommendation below is **FTP first, SMB second, both in v3.5**, with SMB's wire-layer pinned by golden vectors before any live-server work. (2) FTPS TLS session-reuse trap (data channel must resume control session — pure-ftpd/FileZilla refuse otherwise). (3) Rotation asymmetry: no lifecycle rules exist on SMB/FTP, so the owner must rule on server-side prune policy. (4) Several owner decisions must be resolved in discuss/plan before execution.

---

## Dimension 1 — SMB client feasibility (HIGH confidence on protocol mechanics; MEDIUM on fleet dialect coverage)

- **Verdict:** hand-rolled `export/smb.js`, SMB **2.1 only** (offer 2.0.2 fallback). Do NOT ship cifs-mount; do NOT build both-with-switch.
- Why 2.1: signing = HMAC-SHA256 (`node:crypto` free); 3.0+ would need hand-rolled AES-128-CMAC; 3.1.1 adds preauth integrity — never negotiate it. Modern servers require signing but not encryption; a signed 2.1 session satisfies Server 2025 / 24H2 / `server signing = required`.
- **NTLMv2:** `NTHash = MD4(UTF-16LE(password))` — MD4 unavailable under OpenSSL 3 → hand-roll (~60 LOC), pin RFC 1320 golden vectors. HMAC-MD5/HMAC-SHA256 native. Kerberos out of scope.
- **Wire surface:** NBSS header + 64-byte SMB2 header (little-endian) → NEGOTIATE → SESSION_SETUP (NTLMSSP type1/2/3) → TREE_CONNECT → CREATE → WRITE×N (≤60KB slices; 2.1 grants 1 credit — strictly serial one-outstanding-write model first) → CLOSE, plus READ (D-88-8 stream-back parity), SET_INFO-DELETE (probe only — D-88-7 parity), ECHO keep-alive, SESSION_SETUP-retry on sessionExpired.
- **LOC:** ~1,400–1,600 + tests ≈ 2.5× s3.js. Pinable: RFC 1320 vectors, NTLMv2 transcript fixtures, captured NEGOTIATE/SESSION_SETUP transcript.
- **Error classes (`err.smbClass`, ×5 locales):** `authFailed`, `guestDenied`, `treeConnectFailed`, `shareNotFound` (BAD_NETWORK_NAME), `unreachable`, `signingRequired`, `dialectRejected`, `noSpace`, `nameConflict` (SHARING_VIOLATION), `sessionExpired`, `generic`. Probe keys: `success`/`deleteFailed` + those classes. NTLM type-3 blob contains credential-equivalent material — scrub from logs/errors (V14 discipline).
- **Fleet reality:** Synology/TrueNAS/Unraid/Windows all speak 2.1; SMB1 never negotiated. Open: fleets with SMB2-min-3.0 (rare in home-NAS land) → adding CMAC+3.0.2 is an additive patch later.

## Dimension 2 — FTP/FTPS client feasibility (HIGH confidence; MEDIUM on server-quirk specifics)

- **Verdict:** one hand-rolled `export/ftp.js`, ~350 LOC (smaller than s3.js). `FTP_SECURE` = `explicit` (default) | `implicit` | `none`.
- **Command surface only:** USER/PASS, AUTH TLS→PBSZ 0→PROT P, FEAT, TYPE I, EPSV (PASV fallback), STOR, DELE, NOOP, QUIT. **No LIST/MLST ever** — probe = STOR+DELE of a marker; upload = STOR to a known path. Never send `EPSV ALL`.
- **REST resume** (RFC 3659): track flushed bytes via counting Transform; on `426` retry with `REST <offset>` + STOR when `REST STREAM` advertised; restart-from-zero fallback (~30 LOC). Direct analog of D-88-16.
- **The #1 FTP failure:** control-channel idle timeout during long data transfers (vsftpd `idle_session_timeout=300`). Mitigation: NOOP keep-alive around transfers + any control error during transfer → REST retry, not hard fail.
- **The #1 FTPS trap: TLS session reuse.** Capture `controlSocket.getSession()` and pass to every data-channel `tls.connect` — pure-ftpd/FileZilla Server/hardened vsftpd require it; skipping ships opaque handshake failures. `minVersion: TLSv1.2`. Never `PROT C`.
- **PASV/NAT:** trust the control-channel host, take only the port from `227`; `FTP_PASV_HOST` env override for NAT. Keyed `passiveFailed` class carries the firewall/port-range hint (Synology pasv range forwarding).
- **Env custody (boot-frozen, S3_* mirror):** `FTP_HOST/PORT/USER/PASSWORD/SECURE/INSECURE/REMOTE_DIR` (+ optional `FTP_PASV_HOST`). Enabled = HOST+USER+PASSWORD present. `FTP_INSECURE=true` → `rejectUnauthorized:false` both channels + keyed `tlsInsecure` probe warning (exact `httpWarning` parity).
- **Error classes:** `ftpAuthFailed` (530), `ftpUnreachable`, `ftpTlsFailed`, `ftpPassiveFailed`, `ftpPathNotFound` (550 w/ path context), `ftpQuotaExceeded` (552), `ftpTransferAborted` (426 exhausted), `ftpGeneric`. 4xx = transient/retryable; 5xx = permanent. Never log the PASS line; 300-char slice on all errors.

## Dimension 3 — In-repo seams (HIGH — all anchors verified against working tree)

S3 end-to-end anchor map (all `file:line` verified 2026-11-25):

| Seam | Anchor | v3.5 extension |
|---|---|---|
| Env custody | server.js:208-219, boot-frozen; enabled-derivation :351-365; invalid-token warn :263-266 | `SMB_*` / `FTP_*` mirror |
| Task column | server.js:768 DDL + :966 `adapterEnsureColumn` | `smb_enabled`, `ftp_enabled` (SQLite **and** Postgres lockstep) |
| Run truth | server.js:806 DDL + :1009 ensureColumn; single write site export/backup.js:~873-877 | per-destination `smb_uploaded`/`ftp_uploaded` (decision: see owner list) |
| **THE seam** | `setBackupS3Destination(fn)` export/backup.js:635-645; installed server.js:3821-3828; upload slot :832-838 (D-88-1: ratified post-publish) | generalize to provider list **or** sibling `setBackupFtpDestination`/`setBackupSmbDestination` |
| Upload order | after local publish+verify; `uploaded=1` only after verify AND sidecar; terminal `upload_failed`, local archive survives | verbatim per destination |
| Verify + sidecar | read-back sha256 (s3.js:380-407) + `<key>.sha256` sidecar (:471-475) | SMB: full parity. FTP: SIZE-based verify is the recommended deviation (owner list) |
| Probe | at-save create :9040 / update :9194 with **hard 400 refusal** when probe fails (task not saved, :9025-9039); standalone `POST /api/backup/s3/probe` :9245 (guard chain + throttle 10/15min) | mirror verbatim per destination |
| Restore | `downloadToStaged(config,key,sha256,stagingDir)`; consumed export/restore.js:2069-2071/:2300-2307; location badge flag-derived server.js:9508/9650; `RESTORE_LOCATION_KEYS` src/pages/backup.js:545 | one primitive `fetchToStaged(config,path,expectedSha256,stagingDir)->{tmpPath}`; no ranges; temp survives to post-commit; extend RESTORE_LOCATION_KEYS **first** |
| Client surface | src/core/api.js:34/:152-153/:219; render gate src/pages/backup.js:522; form staging/actions.js:5101-5156/:5219/:5259-5263 | one state field + gate per destination |
| i18n | src/locales/en.json:2172,2232-2242,2264-2266 ×5 locales | all new keys ×5 locales |
| Tests | test/backup-s3-sigv4.test.mjs (golden vectors), backup-s3-upload, backup-s3-e2e (**env-gated MinIO**, docker recipe :12-15), restore-s3-e2e, backup-tasks-api, backup-history-client, error-codes | same shapes per destination |

**8-step extension recipe** (one destination): ① env consts+validation+enabled+config() → ② column DDL+adapterEnsureColumn → ③ destination provider at the ratified slot → ④ run-truth flags → ⑤ /api/config + client state + form → ⑥ probe routes + i18n ×5 → ⑦ restore fetch + location keys → ⑧ tests (golden vectors + env-gated live e2e). **Dispersion warning:** filename↔key mirroring contract and `uploaded` semantics are where a second destination silently diverges if not generalized.

## Dimension 4 — Operational semantics (HIGH — code-anchored)

- **Destination-state model:** 3 flat boolean columns (`s3_enabled`, `smb_enabled`, `ftp_enabled`) via adapterEnsureColumn — **not** a JSON `destinations` column (breaks dual-engine "one SQL shape" discipline + D-89-15 column-not-heuristic ruling). Run truth: per-destination integer columns; location badge = first-true over local→s3→smb→ftp.
- **Rotation:** today local-only by explicit ruling (D-88-7/D-11; server.js:4140-4147 `fs.rmSync` only; DEPLOY.md "pruning is yours"). S3: keep local-only (native lifecycle rules exist). **SMB/FTP have no lifecycle rules** — recommendation: extend rotation to best-effort server-side prune of runs already `status='deleted'` for SMB/FTP destinations, per-destination flag-gated at rotation time, never failing the pass, with a per-destination floor guard (a mirror may be the only surviving copy). ⚠ Needs an owner ruling.
- **Mirror failure:** single terminal `upload_failed` (status CHECK server.js:793; every consumer branches on the single terminal set — do NOT invent per-destination statuses); local publish stays valid; error text names the failed destination(s) (2-of-3 partial failure = one status naming them). Alerts: `handleBackupTaskOutcome(taskId, runId, 'failed', …)` fires on upload_failed (server.js:3660), transition-gated via `last_notified_state` compare-in-UPDATE — reuse verbatim, only sliced error text differs.
- **Probe-at-save:** hard 400 refusal verbatim ("task was not saved") on create and edit, audited; standalone probe route with same guard chain/throttle. Probe must exercise a **real data transfer** (upload+delete marker), not just a control/connect check — FTPS passive-mode silent hangs otherwise.
- **No clock-skew class for SMB/FTP** (no signatures) — replace with `cert-failed` (FTPS) and `passive-failed` (FTP) classes. Timezone/mtime irrelevant (rotation is id-based, GFS is UTC-calendar).
- **Concurrency:** single in-memory `currentRun` serializes all destinations into one run — keep D-10 (one upload at a time; never pipeline FTP STORs on one control channel).
- **Docs:** DEPLOY.md §21 (SMB: share perms read+write for probe-delete, Windows ACL inheritance pitfall) + §22 (FTPS: per-vendor passive port range table, cert trust posture).

---

## Constraints (standing, all research honors these)

- **Zero new npm dependencies** — both clients are pure stdlib (`net`/`tls`/`crypto`/`fs`/`stream`).
- **Env-only config custody (D-88 unchanged)** — SMB_*/FTP_* boot-frozen consts, never DB rows; per-task opt-in stays an additive boolean column.
- **D-88 invariants preserved:** local-first publish before upload; terminal `upload_failed` keeps local archive; probe is the only sanctioned delete; read-back verify + sidecar (SMB full parity; FTP deviation pending owner ruling); keyed errors ×5 locales, secrets never in logs/errors (V14; NTLM type-3 and FTP PASS scrubbed).
- **Dual-engine DDL lockstep** (SQLite + Postgres via adapterEnsureColumn); one SQL shape — no JSON columns.
- **D-10:** single in-flight backup run; single in-flight data transfer per client.

---

## Phased-build recommendation

Ops research flags SMB as the single biggest risk (hand-rolling SMB2 is "a real project") and suggests FTPS-first. The owner's ask is "SMB et FTP" parity. **Recommendation: both ship in v3.5, FTP first** — the FTP client is low-risk and its wiring de-risks the seam generalization (provider list, columns, probes, restore fetch) that SMB then reuses; SMB's wire layer is separately golden-vector-pinned before any live-server integration, containing its risk to a well-tested module.

1. **Phase — FTP/FTPS client (golden vectors + module):** `export/ftp.js`, ~350 LOC: reply parser, EPSV/PASV, STOR/DELE/REST, explicit+implicit TLS with session-reuse, NOOP keep-alive. Pure tests incl. RFC vectors; no wiring yet. (Test idiom: sigv4 golden vectors.)
2. **Phase — FTP wiring end-to-end:** 8-step recipe: FTP_* custody, `ftp_enabled` column, provider seam, probe routes + i18n ×5, restore `fetchToStaged`, DEPLOY.md §22, env-gated live e2e (**vsftpd docker image** mirroring the MinIO recipe — real NAS can't be CI). Include the owner decisions below.
3. **Phase — SMB client (spike-hardened):** `export/smb.js`, ~1,400-1,600 LOC: NBSS/SMB2 codec, NEGOTIATE/SESSION_SETUP/NTLMv2 (+ hand-rolled MD4), TREE_CONNECT/CREATE/WRITE/READ/CLOSE, unconditional HMAC-SHA256 signing. Golden vectors: RFC 1320 (MD4), NTLMv2 transcript fixtures, signing key derivation. This phase is the research-heavy one — flag for `/gsd-plan-phase --research-phase`.
4. **Phase — SMB wiring end-to-end:** SMB_* custody, `smb_enabled` column, provider, probes, restore, DEPLOY.md §21, env-gated live e2e (**dperson/samba docker image**), rotation prune (if owner rules yes) landing here or as a small follow-on plan.
5. **(Alternative split if owner prefers strict parity):** one seam-generalization phase (provider list + columns + client surface shared) followed by FTP and SMB destination phases — costs an extra planning cycle; choose if the owner wants symmetric UX landing at once.

Order rationale: wiring lessons (seam generalization, probe/restore/id paths) are learned on the cheap client; the expensive client then plugs into a proven harness. If the owner instead rules SMB-first, the phases swap with no content change.

---

## Owner decision list (resolve in discuss/plan)

1. **Remote-prune policy for SMB/FTP** — best-effort server-side prune of `deleted` runs (recommended), or keep mirrors outliving local indefinitely (operator-managed)? Includes the per-destination floor-guard rule.
2. **SMB timing/order** — FTP-first then SMB (recommended), strict parity split, or defer SMB to a later milestone?
3. **Manual-run mirroring** — do Run-now runs (task_id NULL) mirror to SMB/FTP (today they upload to S3 whenever configured, D-88-4)?
4. **FTPS cert-trust posture** — `FTP_INSECURE=true` warning parity only, or add fingerprint-pin env var for self-signed NAS certs?
5. **FTP verify-parity deviation** — SIZE-based check + sidecar (recommended) vs full RETR read-back (heavy egress) vs documented skip.
6. **Run-truth granularity** — per-destination `smb_uploaded`/`ftp_uploaded` columns (recommended) vs reuse the single generic `uploaded`.
7. **`FTP_INSECURE` warning posture parity** — confirm plain-FTP (`FTP_SECURE=none`) gets the same keyed probe-warning treatment as plain `http://` on S3.
8. (Minor, from FTP research) REST retry budget / restart-from-zero threshold for very large archives.

---

## Confidence assessment

| Claim | Confidence | Basis |
|---|---|---|
| FTP/FTPS client feasible ~350 LOC, stdlib-only | HIGH | RFC 959/2228/4217/2428/3659 (stable specs) + verified in-repo precedent |
| Node TLS session-reuse mechanism (`tls.connect({session})`) | HIGH | documented Node API |
| Server quirks (vsftpd idle timeout, pure-ftpd/FileZilla session-reuse requirement) | MEDIUM | community-documented, version-variable → live probe in UAT (docker recipes) |
| SMB 2.1-only strategy (HMAC-SHA256 signing suffices for modern servers) | HIGH | MS-SMB2 §3.1.4.1 + MS hardening docs + Samba signing semantics |
| MD4 unavailable under OpenSSL 3 → hand-roll required | HIGH | documented provider limitation; pin with RFC 1320 vectors |
| ~1,400-1,600 LOC SMB estimate | MEDIUM | spec-surface estimate; confirm via spike/golden-vector phase |
| Home-NAS fleets accept SMB 2.1 minimum | MEDIUM | defaults documented; no fleet telemetry — DEPLOY.md note + feedback loop |
| In-repo seam anchors (all file:line) | HIGH | read directly from working tree 2026-11-25 |
| Ops semantics (statuses, alerts, rotation, probe) | HIGH | code-anchored, verified |
| Rotation prune recommendation for SMB/FTP | MEDIUM | design recommendation, not code fact — owner ruling required |

**Gaps to address in planning:** SMB dialect-rejection exposure (no data on SMB2-min-3.0 fleets); REST-for-RETR-only servers (vsftpd edge); Windows-share filename edge cases (verify at UAT); guest-session behavior variance on Synology/TrueNAS.

---

## Test strategy notes

- **Golden vectors (pure, no network):** SigV4 idiom (`test/backup-s3-sigv4.test.mjs`) → MD4 RFC 1320 vectors, NTLMv2 type-1/2/3 transcript fixtures, SMB2 signing-key derivation, FTP reply-parser multiline cases, EPSV/PASV parse fixtures.
- **Env-gated live e2e:** real NAS cannot be CI — follow the MinIO pattern (`test/backup-s3-e2e.test.mjs:12-15` docker recipe, skip-when-absent): **vsftpd image** for FTP/FTPS (configure explicit TLS + passive range) and **dperson/samba image** for SMB (share + user; ideally a second variant with signing required). Restore e2e mirrors `test/restore-s3-e2e.test.mjs`.
- **API/client tests:** `backup-tasks-api` + `backup-history-client` shapes per destination (gating, refusals, badges); `error-codes.test.mjs` for the new keyed classes ×5 locales.

## Sources

- In-repo (HIGH, read directly): export/s3.js, export/backup.js:590-905, export/restore.js:2069-2403, export/gfs.js, server.js:200-266/351-365/764-1021/3660/3810-3830/4071-4173/9023-9271/9508-9681, src/core/api.js, src/pages/backup.js, src/actions/actions.js, src/locales/*.json, docs/DEPLOY.md §19-20, test/backup-s3-*.
- Specs (HIGH): MS-SMB2 (§3.1.4.1 signing, §3.1.5.2 key derivation), MS-NLMP, RFC 1320, RFC 959, RFC 2228/4217, RFC 2428, RFC 3659.
- Ecosystem (MEDIUM where noted): MS SMB hardening guidance (Win11 24H2 / Server 2025 signing defaults), Samba `smb.conf` signing semantics, NAS vendor passive-port/cert documentation, community-documented vsftpd/pure-ftpd/FileZilla server quirks.
