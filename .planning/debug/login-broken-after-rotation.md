---
status: diagnosed
trigger: "UAT Phase 26 rotation: 'unable to login after rotation' — boot log shows D-K7 '1 row(s) carry unrecognized secret envelope version(s) (v2)', no 'TOTP re-wrap:' line, no 'pre-migration backup:' line"
created: 2026-11-01T00:00:00Z
updated: 2026-11-01T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — the single v2 envelope's key id was NOT resolvable by the running server's keyring at boot, and the Phase 26 re-wrap pass never executed (absent image or D-K14 gate failed because MASTER_KEY_PREVIOUS never reached the container env).
test: log-signature analysis against code paths (done); remote confirmation: `docker compose exec projects env | grep -c MASTER_KEY_PREVIOUS` and check image contains migrateTotpReWrap
expecting: PREVIOUS missing from container env and/or image predating 26-01
next_action: operator runs the two remote distinguisher checks below, then recovers by restoring the OLD key as MASTER_KEY

bug_class: Bohrbug (deterministic configuration/deployment interaction; code verified correct)

## Symptoms

expected: DEPLOY.md §14 rotation — boot logs show `pre-migration backup:` and `TOTP re-wrap: N row(s) re-sealed to v2:<key-id>...`, stale-envelope query returns 0, 2FA logins work without re-enrollment, second boot no-op.
actual: "unable to login after rotation"; boot log shows `TOTP encryption: 1 row(s) carry unrecognized secret envelope version(s) (v2) — left as-is; decryption attempts fail closed (D-K7).` and NO re-wrap/backup lines.
errors: D-K7 warning above; login fails at the 2FA step (503 masterKeyMissing — inferred from code path).
reproduction: live rotation on Synology NAS staging (/volume1/docker/projectsstudio) per DEPLOY.md §14.
started: UAT of Phase 26.

## Eliminated

- hypothesis: a pre-Phase-25 build ran the rotation boot and logged the D-K7 line
  evidence: exact wording introduced in commit 1e26f18 (25-01). Pre-25 builds filtered with `not like 'v1:%'` (3f528eb~1:1152) — a v2 row would have been treated as pending PLAINTEXT and double-encrypted (silent data destruction), never logging "unrecognized version".
  timestamp: 2026-11-01
- hypothesis: a 25-02..8391fc8 build (keyring, no re-wrap pass) with MASTER_KEY_PREVIOUS correctly set ran the boot
  evidence: that build resolves the old key id via KEYRING → decrypt succeeds → D-K7 stays silent; login would work. D-K7 FIRED, so the keyring could not resolve the envelope's id — PREVIOUS was absent or wrong material regardless of build.
  timestamp: 2026-11-01
- hypothesis: row is stale but re-wrap ran and failed
  evidence: re-wrap always emits output when it executes with a stale candidate (backup line + D-K9 warn + summary), and emits the D-K12 nudge when zero stale candidates with PREVIOUS set. User's tail-40 shows NO "TOTP re-wrap" text at all ⇒ the pass never executed (gate at server.js:1426 returned, or pass doesn't exist in image).
  timestamp: 2026-11-01

## Evidence

- checked: server.js:1291-1310 (D-K7 scan)
  found: D-K7 fires only when MASTER_KEY is set AND an envelope row fails decryptTotpSecret — i.e. its key id ∉ KEYRING {id(MASTER_KEY), id(PREVIOUS) if present}.
  implication: the envelope is sealed under a key the running container does not hold (old key not in env, or wrong material).
- checked: server.js:1424-1439 (migrateTotpReWrap, D-K14 gate)
  found: `if (!MASTER_KEY || !MASTER_KEY_PREVIOUS) return;` — silent. Any executed boot with PREVIOUS set produces at least one "TOTP re-wrap" line (summary, D-K9, or D-K12 nudge).
  implication: zero re-wrap lines ⇒ PREVIOUS absent from container env (current build) OR image predates commit 5956807.
- checked: git log -S (server.js)
  found: D-K7 wording landed 1e26f18 (25-01); keyring 8fa712b (25-02); re-wrap pass 5956807 + 020cbd7 (26-01). No backup line is expected from the encryption pass here anyway (pendingRows empty — the row is an envelope), so the absence of `pre-migration backup:` carries no extra signal.
  implication: a NAS image built between 8fa712b and 5956807 has no re-wrap code at all — plausible: Phase 26 was UAT'd locally, NAS image older.
- checked: server.js:338-339, 376-378 (decrypt fail-closed), 2191-2193 (2FA verify)
  found: v2 decrypt resolves key id strictly through KEYRING; unknown id → null → requireTotpSecret not ok → 503 `masterKeyMissing` before any mutation. No plaintext fallback (D-78a).
  implication: "unable to login" is the designed fail-closed behavior for an unresolvable key id — the 2FA code can never verify.
- checked: DEPLOY.md §14 (lines ~770-865)
  found: runbook matches implementation (two-key boot, backup, re-wrap summary, stale query, D-K12 retire step, one-generation-at-a-time note). Gaps: no precondition to verify the deployed image contains the Phase 26 pass, and no check that the envelope's key id is actually the PREVIOUS key's id (rotation spans exactly one generation; a v2 row sealed under an already-dropped key is unrecoverable by rotation).
  implication: runbook is accurate but assumes the new image is already deployed and that only one key generation was ever dropped.

## Resolution

root_cause: The rotation boot ran without MASTER_KEY_PREVIOUS in the container's actual environment (and/or on an image predating the Phase 26 re-wrap pass). The sole v2 envelope — sealed under the OLD master key — could not be resolved by the keyring (D-K7 fired, its key id is neither MASTER_KEY's nor any PREVIOUS id), so no re-wrap occurred, and 2FA login fails closed 503 (masterKeyMissing) at the verify boundary. The row is untouched and still recoverable: its key id corresponds to the old key the operator still possesses.
fix: (not applied — diagnose-only)
verification: (pending operator confirmation of env/image on NAS)
files_changed: []

### Distinguisher checks for the operator (remote, no fixes)
1. `docker compose exec projects sh -c 'env | grep -c MASTER_KEY_PREVIOUS'` — 0 ⇒ env misconfig confirmed (wrong .env, var not passed, or container not recreated with `up -d` after the edit).
2. `docker compose exec projects grep -c migrateTotpReWrap server.js` — 0 ⇒ image predates Phase 26; pull/rebuild before re-running the rotation.
3. Recovery either way: put the OLD key back as MASTER_KEY (remove PREVIOUS), `docker compose up -d` — the row's key id will then resolve and login works. Then deploy current code and redo §14 with both keys verified present in the container env.

### AND-gate / candidate categories
code: implementation verified correct by test/totp-rewrap.test.mjs (12 tests incl. SC-1 login-after-rotation) — not the cause.
config (PRIMARY): MASTER_KEY_PREVIOUS not present in the running container's env (D-K14 gate silently disabled the pass; keyring missed the envelope id).
environment (CO-CAUSE): stale image on the NAS predating commit 5956807 — identical log signature, pass simply absent.
data: single v2 envelope sealed under the old key id — consistent with both above; would only be independently causal if it were sealed under a key ≥2 generations back (operator would need to supply that key manually).
and_gate: yes — the observed log requires BOTH "envelope id unresolvable" (config/data) AND "pass absent or gated" (environment/config); either config fault alone with a current image would still have produced re-wrap lines.
