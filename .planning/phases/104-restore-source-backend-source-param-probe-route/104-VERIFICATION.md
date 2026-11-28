---
phase: 104-restore-source-backend-source-param-probe-route
verified: 2026-11-28T00:00:00Z
status: passed
score: 4/4 success criteria verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 104: Restore-Source Backend — `source` Param & Probe Route — Verification Report

**Phase Goal:** Operators can restore from an explicitly chosen mirror source (s3/ftp/smb/local), validated against run mirror flags, with a dedicated throttled availability probe — server-side truth, no probing in the list GET.
**Status: VERIFIED**

## Per-Criterion Evidence

| SC | Truth | Status | Evidence |
|----|-------|--------|----------|
| SC-1 | Explicit `source` validated against mirror flags server-side; flows through the existing twin seam; omission = backward-compatible | ✓ VERIFIED | `export/restore.js:1442` — `if (opts.source !== undefined)` guard; `parseRestoreSource` enum {local,s3,ftp,smb} at server.js:6122; flag validation via `restoreSourceFlag` reads the same `uploaded/ftp_uploaded/smb_uploaded` columns the legs array reads (no new truth source). Fetch rides the SAME staged seams (`downloadToStaged`/`fetchToStaged`/`fetchSmbToStaged`), same key derivations, `mirrorMissing → clearMirrorFlag` contract unchanged. 16/16 goldens pass (45/45 across param+goldens run); `git diff` on `test/restore-source-resolution.test.mjs` vs 13dd2155 → clean. Omitted-source default path verified by golden suite + "preview OMITTED source → registry order re-assert" test (line 241). |
| SC-2 | Invalid / not-mirrored source → keyed refusal in all 5 locales; no new stage enums | ✓ VERIFIED | `restoreSourceInvalid` + `restoreSourceNotMirrored` present (grep count 2 each) in src/locales/{en,de,es,fr,nl}.json; wired at all callers (preview/download `restore_refused:`, download `backup_download_refused:`, verify `backup_verify_refused:`, trigger routes pre-lock). Zero stage vocabulary: grep `source_failed\|source_unreachable\|restore_stage` in export/restore.js + server.js → no matches. Structured helper reasons (`sourceInvalid`/`sourceNotMirrored`) map through callers' own keyed funnels; err.code stays `restoreArchiveMissing` (golden contract). |
| SC-3 | `sources[]` server-derived from flags, enabled-only, local truth = fs.existsSync, ordered local>s3>ftp>smb, additive | ✓ VERIFIED | server.js:10461 — sources array: `local` gated on `r.filename && fs.existsSync(path.join(backupsRoot(), r.filename))`; s3/ftp/smb gated on `flag === 1 && <Dest>.enabled` (dormant-slot contract D-23); order local→s3→ftp→smb; raw flags/location/filename/sizeBytes/sha256 untouched (purely additive). Tests: registry-order case, dormant-slot exclusion, local-fs-truth cases (test/restore-source-param.test.mjs:900/926/955), plus the restore-preview payload-shape pin updated to include `sources` with a deepEqual `['local']` fixture assert. |
| SC-4 | Dedicated throttled probe POST; list GET never probes (D-89-14); probing never mutates run state | ✓ VERIFIED | `POST /api/backup/restore/probe` at server.js:9952: dedicated `restoreprobe\|<uid>` throttle 10/15min (separate from `backupprobe\|` — GD-6, test-pinned 11th probe 429 + destination probe unaffected); dual-role gate CAP.RESTORE_USE ∥ CAP.BACKUP_MANAGE; per-source dispatch through EXISTING probeS3/probeFtp/probeSmb seams, results returned VERBATIM. D-89-14: static pin test asserts exactly 12 seam call sites, all under allowed routes (`/api/backup/tasks`, s3/ftp/smb/restore probe routes) AND a behavioral slice assert that the restore backups list GET contains zero seam calls. Probe route body contains no `claimRestoreLock`, no `clearMirrorFlag`, no staging, no `update backup_runs` (grep → none); tests assert flags unchanged on ok/refused/failed probes. |

## Gray-Area Rulings Spot-Check (GD-1..GD-8)

- **GD-2** explicit local fail-closed: helper returns `reason:'missing'` DIRECTLY, no registry walk (export/restore.js — explicit `requested === 'local'` block); test "explicit local with a missing local file → missing DIRECTLY (no mirror fall-through)" ✓.
- **GD-4** transport mapping: query `?source=` on preview/download; `body.source` on the 3 triggers; probe route restricted to s3/ftp/smb (`local` → keyed 400 restoreSourceInvalid, test-pinned).
- **GD-5** explicit+disabled refuses in BOTH disabledBehavior modes: helper returns `sourceNotMirrored` regardless of `disabledBehavior` when flag=1/config absent on the requested leg; test "helper explicit+disabled destination refuses in BOTH disabledBehavior modes" + route-level GD-5 envelope test ✓.
- **GD-6** throttle key separation: dedicated `restoreprobe|` key, test asserts backupprobe budget untouched ✓.
- **GD-7** locales landed in the same commit as the first emitting gate (28ecace6) ✓ (5/5 presence verified live).
- Other rulings (GD-1 dual-role, GD-3 audit prefixes, GD-8 sources[] not on preview — confirmed absent from the preview route payload) all consistent with the decided behavior.

## Standing Gates

| Gate | Result |
|------|--------|
| Zero new deps | `git diff 13dd2155..HEAD -- package.json package-lock.json` → empty |
| No schema change | Probe route does a flag-only SELECT; sources[] read-only; no migration touched |
| Stage vocabulary frozen | grep → no new emissions |
| Full suite baseline | `npm test`: **2757 tests, 2724 pass, 2 fail** — french-typography + webhook-routes GET list, the documented pre-existing failures (due.reminder did not fire this run; within the documented 2–3 allowance). Zero new failures. |
| Golden contract (Phase 103 baseline) | 16/16 goldens pass; golden file diff clean vs pre-phase |

## Real-Test Check

- **Probe tests hit real fake-seam servers**: ftp probe through a LIVE scripted fake-FTP server (USER/PASS/TYPE/EPSV/STOR/DELE transcript asserted — proving the route hit the real probeFtp seam); s3 probe through a live HTTP sink with marker HeadBucket + PUT/DELETE observed; dead-endpoint ftp/s3/smb unreachable classes; verbatim-response shape asserts incl. `httpWarning` (ftp/s3 yes, smb no — R-3).
- **Param matrix exercises the engine harness**: engine tests run `resolveRestoreSource` directly with fake seams — single-leg selection (ftp flag-0 + s3 flag+config → `sourceNotMirrored`, NO s3 fetch attempted), explicit-success through the REQUESTED leg with a fake S3 seam serving the real fixture archive (digest re-verified), dead-ftp fetchFailed restricted to that leg, unit-level keyed mappings through `failWith`/`throw keyed`.

## Anti-Patterns

No TBD/FIXME/XXX/PLACEHOLDER markers in the modified files. No stubs, no console.log-only paths.

## Human Verification Required

None. All success criteria are code-level and test-exercised; UI surface (source picker) is Phase 105 scope.

## Gaps Summary

None. Verdict: **VERIFIED**.

---

_Verified: 2026-11-28 — Verifier: gsd-verifier subagent_
