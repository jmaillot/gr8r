---
phase: 99-smb-2-1-client-spike-hardened
plan: 02
subsystem: backup-destinations
tags: [smb, smb2.1, session-engine, ntlmv2, signing, verify-before-dispatch, sessionexpired, mock-server, spike]
requires: ["99-01 pure crypto+codec layer (md4, NTLMv2 chain, codecs, smbErrorFrom)", "node:net (NBSS transport)"]
provides: ["export/smb.js complete client — connectSmb(config, opts) promise API { connect, write, read, rm, echo, close } over a signed serial session engine", "SMB_ECHO_INTERVAL_S=60 / SMB_MAX_WRITE_BYTES / SMB2_COM exports", "test/backup-smb-client.test.mjs (17 mock tests incl. fakeSmb scripted NBSS frame server)", "99-SPIKE.md (D-03: LOC vs estimate, dialect surprises, fleet risk, OQ-3 record, GO verdict)", "99-VALIDATION.md filled (nyquist_compliant: true)"]
affects: ["phase 100 (descriptor wiring, dperson/samba e2e, probe locale work — reads 99-SPIKE.md)"]
tech-stack:
  added: []
  patterns: ["one-command-in-flight serial session engine with MessageId correlation", "verify-before-dispatch signature gate (verify → correlate → resolve)", "structural retry envelope (re-auth + single replay, offset-resume, lifetime caps)", "scripted non-reflexive NBSS frame mock with server-side signature validation"]
key-files:
  created: [test/backup-smb-client.test.mjs, ".planning/phases/99-smb-2-1-client-spike-hardened/99-SPIKE.md"]
  modified: [export/smb.js, ".planning/phases/99-smb-2-1-client-spike-hardened/99-VALIDATION.md"]
decisions:
  - "Signing key derived BEFORE the type-3 SESSION_SETUP goes on the wire — the round-2 setup is the first signed request (signing-required-server ordering)"
  - "sessionExpired envelope is structural: re-auth on same transport, replay exactly once with fresh MessageId at the failed WRITE offset; caps 1/command + 2/session lifetime cannot loop (pitfall 6)"
  - "Expiry injection in the mock splits two knobs: per-occurrence (command-cap proof) vs attempt-parity (session-cap storm)"
  - "Failed-logon final reply is UNSIGNED in the mock (session never established) — real-server semantics kept in the class-map test"
metrics:
  duration: 68m
  completed: 2026-11-25T17:05:00Z
  tasks: 3
  commits: 3
  plan_head_before: 80fec37123517574d0e7a2cb75b550f37ec200ab
  plan_head_after: 4c7db8ef
actuals:
  tokens: 88000
  tasks: 3
  commits: 3
status: complete
---

# Phase 99 Plan 02: Session Engine + Client + Spike Report Summary

**One-liner:** Complete SMB2.1 client in export/smb.js — signed serial session engine (MessageId correlation, verify-before-dispatch, NTLMv2 handshake with pre-wire key derivation), full D-01 promise surface (serial ≤60,416-byte offset-tracked WRITE×N / READ-to-EOF / rm / echo / close), capped sessionExpired retry envelope with offset resume, and 17 scripted-mock tests pinning every class-map, scrub, and signing path — plus the D-03 spike report with an explicit GO for phase 100.

## What Was Built

- **export/smb.js (session engine + client, now 1,106 LOC total)**: dial → NBSS 0x81/0x82 → NEGOTIATE (offer {0x0210, 0x0202}, SecurityMode 0x3; dialect refusal → `smbDialectUnsupported` per OQ-3; signing-not-agreed → `signingRequired` abort, T-99-05) → SESSION_SETUP type-1/type-3 (MORE_PROCESSING_REQUIRED round adopted, SessionId/TreeId taken from reply headers) → TREE_CONNECT. `sendRequest` enforces one-command-in-flight, signs everything post-key-derivation (HMAC-SHA256, first 16 bytes @48), and dispatches through a single gate: verify signature BEFORE MessageId correlation, ASYNC/STATUS_PENDING replies keep the command waiting, mismatch destroys + keys generic (T-99-03). Command layer: CREATE/WRITE×N (Offset advances by server-ACKNOWLEDGED Count — partial-final-write re-issues from the un-acked offset, never restarts from 0)/READ-to-EOF (DataOffset/DataLength)/CLOSE/rm (delete-on-close)/ECHO keep-alive (`SMB_ECHO_INTERVAL_S = 60` const, unref'd, OQ-1); close = TREE_DISCONNECT → LOGOFF → destroy (ftp quit parity). Timeout/error/close ownership keyed unreachable with destroy (ftp.js parity).
- **sessionExpired envelope (T-99-04)**: on 0xC000005A — re-run SESSION_SETUP NTLMv2 on the SAME transport, replay the command once with a fresh MessageId; WRITE chains resume at the failed chunk offset via closure-pinned offsets; caps 1 replay/command + 2/session lifetime then surface `smbClass sessionExpired`.
- **test/backup-smb-client.test.mjs**: fakeSmb — scripted NBSS frame server (pre-baked reply content, server-side signature validation of client frames, per-file storage for read-back equality). Knobs: wrongSigningKey, dialectReply, securityMode, sessionSetupStatus/treeConnectStatus/createStatus/writeStatus, partialWrite, nbssRefuse, expireCounts (per-occurrence), expireAttemptCounts (attempt-parity storms). 17 tests: tracer handshake ordering + signature validity on the wire, forged-reply rejection, multi-chunk offset continuity, partial-write re-issue, write/read round-trip, rm, expiry replay (fresh MessageId + offset resume proven in the recording), expiry-storm caps, 5-class status map, dialect/signing knobs, D-04 scrub across ALL error paths.
- **99-SPIKE.md (D-03)**: actual 1,106 LOC vs 1,400–1,600 estimate (−18% with honest reasons), 6 dialect/spec surprises (header byte trap, MD4 erratum, NBSS 17-bit carry, pre-wire signing, OQ-3 split, envelope structure), SMB2-min-3.0 fleet exposure as known risk with DEPLOY note for 100's e2e recipe, OQ-3 decision record, explicit **GO** verdict conditioned on the real-server e2e running before user-visible wiring.
- **99-VALIDATION.md**: filled — nyquist_compliant: true, per-task map all ✅ green.

## Deviations from Plan

None — plan executed exactly as written (3 tasks, in order, tracer gate passed before expansion).

## Verification

- `node --test test/backup-smb-client.test.mjs test/backup-smb-crypto.test.mjs` — 37/37 pass
- `npm test` — 2,609 tests, 2,580 pass, exactly the 2 documented pre-existing failures (fr-typography, webhook-routes GET list)
- `git diff package.json` — empty (T-99-SC trivially clean: node stdlib only)
- No wiring files touched: server.js / export/backup.js / export/restore.js unmodified
- destination-registry-gate + xws-gate green (inside the full suite)

## Known Stubs

None — every export is a final, tested implementation. `probeSmb` is deliberately NOT in phase 99 (probe is 100's DEST-03 scope per the research mapping), not a stub.

## Threat Flags

None — no new trust-boundary surface beyond the plan's threat model (T-99-03 verify-before-dispatch, T-99-04 caps, T-99-05 signing abort, T-99-06 scrub — all implemented and test-pinned; T-99-SC zero installs).

## Self-Check: PASSED

- export/smb.js (1,106 LOC), test/backup-smb-client.test.mjs, 99-SPIKE.md, 99-VALIDATION.md — exist on disk
- Commits 09ac93b3, 2b8619c5, 4c7db8ef — present in git log
