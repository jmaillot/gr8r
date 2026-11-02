---
audit_acknowledged:
  milestone: v1.5
  at: 2026-11-01
  status: unknown
---

# Debug: unable to login after rotation (UAT G-26-1)

Phase: 26 — re-wrap rotation key custody runbook
Date: 2026-11-01
Severity: blocker

## Symptoms

- expected: DEPLOY.md §14 rotation — set MASTER_KEY (new) + MASTER_KEY_PREVIOUS (old), `docker compose up -d`; boot logs show `pre-migration backup:` and `TOTP re-wrap: N row(s) re-sealed to v2:<key-id>...`; stale-envelope query returns 0; 2FA users log in without re-enrolling.
- actual (user, verbatim): "unable to login after rotation"
- Boot log observed (staging NAS, /volume1/docker/projectsstudio):
  `TOTP encryption: 1 row(s) carry unrecognized secret envelope version(s) (v2) — left as-is; decryption attempts fail closed (D-K7).`
  **No** `TOTP re-wrap:` line and **no** `pre-migration backup:` line in `logs --tail=40`.
- Exactly 1 user row carries a 2FA secret on this deployment.
- Earlier in the session: server had been pushed/rebuilt (`git pull` + `docker compose up -d --build` was instructed, current HEAD ≈ 5c1555a lineage), but image currency on the NAS is not directly attested.

## Evidence

### E1 — D-K7 firing proves the keyring miss (server.js:1291-1310)

The "unrecognized secret envelope version(s)" line is emitted by the D-K7 scan **only** for a row where `decryptTotpSecret` returned null — i.e. the row's key id resolved under **neither** `id(MASTER_KEY)` nor `id(MASTER_KEY_PREVIOUS)` (when present). A 25-02+ build with the OLD key correctly present as PREVIOUS would have decrypted fine and logged **nothing**. D-K7 firing ⇒ the old key was **not** in the container's effective environment at that boot (regardless of build age), or the envelope's stamped key id matches neither key material (e.g. the "old" key pasted into PREVIOUS was not the key that originally sealed the row — wrong copy/paste, or the row was sealed two generations ago and no chain exists).

### E2 — Zero re-wrap lines prove the pass never executed (server.js:1424-1521)

`migrateTotpReWrap` ALWAYS emits at least one log line when it runs with PREVIOUS set: the `TOTP re-wrap: N row(s)...` summary, a D-K9 undecryptable warning, or the D-K12 "stale envelope" nudge. None appeared in tail-40. Two possibilities:
- **Gate never opened:** D-K14 gate at `server.js:1426` requires MASTER_KEY_PREVIOUS in env. Missing PREVIOUS ⇒ pass skipped entirely, zero lines. (Also: with zero stale rows AND a current keyring the D-K12 nudge would still print — it didn't.)
- **Pass doesn't exist in the image:** the re-wrap pass landed only in Phase 26 (26-01: 5956807 / 020cbd7). A NAS image built from a pre-26 checkout has no pass at all.

### E3 — Git archaeology of the exact log wording

- Pre-25-02 builds: keyring concept absent (`8fa712b`), v2 prefixes unrecognized by design. A pre-25-01 build did not log this line — its pending-secrets filter (`not like 'v1:%'`, pre-3f528eb, server.js:1152) would have **double-encrypted** the v2 row silently (worse failure mode; not observed here — no double-seal reported, though DB-level verification wasn't possible from this environment).
- The exact D-K7 wording landed in 25-01 (`1e26f18`); the v2-version-scan text matches the deployed container's output. ⇒ Image is at least 25-02-ish; cannot rule out pre-26 from the log alone, and E2 leaves both branches live.

### E4 — Login failure is the designed fail-closed path (server.js:2191-2193)

2FA verify → `requireTotpSecret` → `decryptTotpSecret` (keyring dispatch, server.js:333-344) → v2 key-id lookup misses → returns null → login endpoint responds 503 `masterKeyMissing`. Per D-78a there is deliberately no plaintext fallback. "Unable to login after rotation" is the expected symptom of the keyring not resolving the row — consistent with E1.

### E5 — §14 accuracy

DEPLOY.md §14 matches the implementation. It does **not** state two preconditions the failure exposed: (a) verify the deployed image actually contains the Phase 26 re-wrap pass before rotating; (b) verify the envelope key id stamped in the DB resolves under the PREVIOUS key being configured (rotation spans exactly one generation; a v2 envelope sealed under a key that is neither current nor previous is unrecoverable by rotation alone).

## Hypotheses considered

| # | Hypothesis | Verdict |
|---|-----------|---------|
| H1 | Code defect in re-wrap pass | Rejected — E2/E4: the pass never executed; 12-test suite (`test/totp-rewrap.test.mjs`, incl. login-after-rotation SC-1) covers the happy path |
| H2 | Pre-25 image double-encrypted the row | Rejected as primary — would not log the observed D-K7 wording; not the seen state |
| H3 | MASTER_KEY_PREVIOUS missing from container env at rotation boot | **Accepted (primary)** — only explanation consistent with E1+E2 on a current image |
| H4 | Stale image without the Phase 26 pass | **Accepted (co-factor)** — consistent with E2; cannot be distinguished from H3 by the pasted log alone; both may be simultaneously true |
| H5 | Envelope sealed under a neither-current-nor-previous key | Possible variant of E1 — distinguishable only by comparing the DB's stamped key id against `id(old key)`; folding into the precondition fix |

## Root Cause

The rotation boot ran without an effective two-key keyring in the **container's actual environment** — MASTER_KEY_PREVIOUS was absent (env/compose misconfig, wrong .env file, or container not recreated) and/or the NAS image predates the Phase 26 re-wrap pass (5956807). The sole v2 envelope remained sealed under the OLD master key, whose key id was absent from the running KEYRING: (a) the D-K14 gate never opened so no re-wrap or pre-migration backup happened; (b) the D-K7 scan flagged the row as an unrecognized version; (c) 2FA verification fails closed with 503 `masterKeyMissing` at `server.js:2191-2193` — by design. Code in `server.js` is correct; the fault locus is the deployment environment (env/image), and DEPLOY.md §14 lacks the preconditions that would have caught it before rotating.

## Files involved

- `server.js` — D-K7 scan 1291-1310; D-K14 gate 1426; re-wrap pass 1424-1521; keyring dispatch 333-344; fail-closed 2FA verify 2191-2193. **No defect.**
- `DEPLOY.md` §14 — correct but missing pre-rotation precondition checks (image currency, key-id coverage).
- Deployment (remote NAS) — actual fault locus: container env / image version.

## Suggested fix direction (non-binding)

Operator recovery (no data loss — row is byte-identical):
1. Confirm env fault: `docker compose exec projects-studio sh -c 'env | grep -c MASTER_KEY_PREVIOUS'` → expect 0.
2. Confirm image currency: `docker compose exec projects-studio grep -c migrateTotpReWrap server.js` → 0 means pre-26 image.
3. Restore login: put the OLD key back as `MASTER_KEY` (remove PREVIOUS), `docker compose up -d` — the row's key id resolves again.
4. Deploy current code, then re-run §14 only after both precondition checks pass.

Gap-closure plan targets (docs-only phase 26 remediation):
- Add §14 preconditions: verify image contains the re-wrap pass; read key ids from the container env and compare against the DB's stamped envelope key id before rotating.
- Add a recovery note: D-K7 + no re-wrap lines ⇒ old key absent from keyring; restore old key as MASTER_KEY to recover.
