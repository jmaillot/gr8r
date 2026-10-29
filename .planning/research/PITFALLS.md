# Pitfalls Research

**Domain:** Adding auth-completion features (2FA disable, TOTP encryption-at-rest, recovery-code regeneration, admin session revocation) to an existing self-hosted auth system
**Researched:** 2026-10-28
**Confidence:** HIGH (standard security-engineering failure modes, well documented across OWASP, NIST SP 800-63B, and public post-mortems; mapped to Projects's v1.3 ground truth)

> Context that shapes every pitfall below: Projects has real `sessions`, `login_challenges`, `recovery_codes` tables, dormant `users.two_fa_*` columns, a password step-up pattern, and a v1.3 disable route (16-02) whose actual coverage must be verified before scoping. Zero runtime dependencies. Single Docker image, `/data/projects.db`, `MASTER_KEY` to be introduced.

## Critical Pitfalls

### Pitfall 1: Encrypting the TOTP secret but silently keeping the plaintext migration path open

**What goes wrong:**
The migration writes encrypted values for enrolled users, but the code still treats `users.two_fa_secret` as "either plaintext or ciphertext" with no version marker. Months later nobody knows which rows are which; a row written by an old code path (or restored from a pre-migration backup — and Projects keeps `vacuum into` backups) lands as plaintext and is decrypted by accident or read raw. Worse: the "migration" is implemented as encrypt-on-next-read, so plaintext secrets persist indefinitely for users who never log in again.

**Why it happens:**
Naive code does `decrypt(x) ?? x` — the fallback-to-plaintext pattern. It feels like a safe migration; it is actually a permanent downgrade path that makes plaintext a valid encoding forever.

**How to avoid:**
- Add an explicit version column or value prefix (e.g. `v1:<iv>:<tag>:<ct>`) and make the decryptor *reject* anything without the marker — fail-closed on format, not fall-open to plaintext.
- One-shot migration at deploy time, inside a transaction: read all plaintext secrets, encrypt, write, and assert zero unmarked rows remain. A second boot must be a no-op (Projects already has this guarantee for migrations — extend it).
- Add a test asserting no plaintext-looking secret can ever be accepted as ciphertext input.

**Warning signs:** decrypt code contains `|| secret` / `?? secret` fallback; a migration that runs lazily per-read; no version marker in the stored format.

**Phase to address:** the encryption-at-rest phase (same phase that introduces `MASTER_KEY`).

---

### Pitfall 2: No key-rotation story — `MASTER_KEY` becomes a single unrotatable secret

**What goes wrong:**
`MASTER_KEY` is read from env at boot and used directly as the AES-256-GCM key. When it leaks or must be changed (ops rotation, suspected compromise, moving hosts), every TOTP secret is undecryptable → every enrolled user is locked out, or worse the code "recovers" by decrypting with the old key from somewhere it was cached.

**Why it happens:** envelope encryption feels like overkill for a single-node self-hosted app, so the key is used raw. The cost only appears the first time the key must change.

**How to avoid:**
- Use envelope structure from day one even with one KMS-less deployment: encrypt TOTP secrets with a per-database *data key* (DEK); encrypt the DEK with `MASTER_KEY` (KEK) and store the wrapped DEK alongside (in a `key_metadata` row or table). Rotation of `MASTER_KEY` then = re-wrap the DEK, a millisecond operation touching no user data.
- Version the wrapped key (`k:v1:...`) so multiple KEKs can coexist during rotation.
- If even this is refused: at minimum store `key_version` per row so future rotation can be lazy. Never acceptable to have zero versioning.
- Document in DEPLOY.md that losing `MASTER_KEY` means all users must re-enroll 2FA (this is the honest fail-closed consequence, and the recovery runbook must exist before ship).

**Warning signs:** `MASTER_KEY` passed straight to `createCipheriv`; no `key_version` anywhere; no doc for "I lost MASTER_KEY, now what".

**Phase to address:** encryption-at-rest phase (design the envelope in the same phase — retrofitting it later is a rewrite).

---

### Pitfall 3: Fail-closed 503 that bricks the *entire app*, not just 2FA verification

**What goes wrong:**
`MASTER_KEY` missing/garbled → decrypt throws → the error handler returns 503. But if the decrypt call sits in shared middleware or a helper used by login, the whole instance becomes unusable: users without 2FA cannot log in, existing sessions break, workspace reads fail. For a self-hosted product this is the difference between "2FA temporarily unverifiable" and "my install is down and I think it's a bug".

**Why it happens:** the natural implementation decrypts inside the auth middleware path, so key failure poisons every request that touches the user row.

**How to avoid:**
- Scope the failure precisely: when decryption fails, only the endpoints that *need the TOTP secret* (verify second factor, disable-2FA verification) return 503 with a clear machine code (`totpUnavailable`); login for non-2FA accounts and all workspace features must continue working.
- Fail loudly at boot if `MASTER_KEY` is required but absent — better a fast, obvious startup failure with a DEPLOY.md message than a mysterious runtime 503.
- Validate `MASTER_KEY` at boot (correct length, decrypts the wrapped DEK) so corruption is detected once, not per-request.
- Keep the 503 machine code in the i18n catalogue from day one (v1.2's stable-code pattern) — otherwise the client shows raw English and the self-hosted admin can't tell what broke.

**Warning signs:** decrypt call reachable from middleware shared with non-2FA routes; no boot-time key validation; 503 handled as a generic server error.

**Phase to address:** encryption-at-rest phase; boot validation must land before the feature ships.

---

### Pitfall 4: Disable-2FA with password step-up only — stolen session turns 2FA off

**What goes wrong:**
Disable-2FA requires only the session cookie (plus maybe password step-up). An attacker who steals a session cookie (malware, log injection, XSS residue) calls the disable route and removes the second factor without ever knowing the password if step-up is absent or cacheable. This is the canonical account-takeover via 2FA-disable.

**Why it happens:** the step-up pattern already exists (v1.3), so it's tempting to reuse a "recently verified password" timestamp — but a stolen session that just *changed the password* also satisfies it, and reuse makes disable indistinguishable from a benign settings change.

**How to avoid:**
- Require password step-up **fresh for the disable action** (no reused step-up cache), and additionally require a valid current TOTP code — mirroring NIST 800-63B guidance that disabling a second factor is as sensitive as enabling it. Recovery codes must NOT be sufficient to disable (they're a login fallback, not proof of authenticator possession).
- On successful disable: invalidate all other sessions in the same transaction (same pattern as password change in v1.3 Phase 15), delete/zero `two_fa_secret` (now the encrypted blob), delete pending `login_challenges` for the user, and burn remaining recovery codes — half-cleanup here is how "ghost 2FA state" bugs are born.
- Log the disable in the activity feed as a machine verb so the legitimate owner sees it (this is a self-hosted app: the audit trail the user has is the activity log).

**Warning signs:** disable route accepts a recovery code; step-up result cached from an earlier request; `two_fa_enabled=false` flipped while `two_fa_secret` or pending challenges remain.

**Phase to address:** disable-2FA phase — but first verify what v1.3's 16-02 route already covers, per PROJECT.md, so this hardening is scoped against reality.

---

### Pitfall 5: Recovery-code regeneration with non-atomic burn-and-replace

**What goes wrong:**
Regeneration implemented as: read old codes → verify one → delete old → insert new, in separate statements without a transaction. Two consequences: (a) a concurrent login attempt burning the last old code between delete and insert ends in an inconsistent state; (b) regeneration while a pending-2FA login challenge exists can race the challenge verification — the challenge validates against codes that were just replaced, or worse an in-flight brute-force attempt survives regeneration and keeps trying the new codes.

**Why it happens:** regeneration feels like a settings mutation, not a security-critical concurrent flow, so it doesn't get the transactional treatment password change already got in v1.3.

**How to avoid:**
- Wrap the whole regeneration (verify session/step-up, delete all old hashed codes, insert new set) in one transaction — same pattern as v1.3's password-change-plus-session-revocation, which already proved the pattern.
- On regeneration, delete the user's pending `login_challenges` rows: an attacker mid-challenge must not survive the credential rotation.
- Keep burn semantics identical to v1.3: single-use, hashed at rest, and the new codes returned to the client **exactly once** (plaintext shown in the response, hashes stored) — never retrievable again.
- Regeneration requires step-up (fresh password) and invalidates other sessions, matching the sensitivity of the action.

**Warning signs:** multi-statement regeneration without a transaction; pending challenges untouched; new codes fetchable via a later GET.

**Phase to address:** recovery-regeneration phase.

---

### Pitfall 6: Admin revocation that creates a privilege paradox — admin locks out owner, or becomes unremovable super-user

**What goes wrong:**
Two failure directions. (1) Admin revokes the owner's sessions (or the last admin's own) with no recovery path — the owner of a self-hosted instance is locked out of their own server. (2) The reverse: the revocation feature is usable by any workspace `admin` against any user, including admins of *other* workspaces, because the route checks "is admin" but not "admin of a workspace that shares membership with the target" — Projects is multi-tenant; session revocation is an *account-level* action while every existing admin power is *workspace-scoped* (`requireWorkspace`).

**Why it happens:** "admin session revocation" sounds like one feature, but Projects has two distinct admin surfaces (workspace admins vs. the instance operator). Conflating them breaks the tenancy isolation shipped in v1.1.

**How to avoid:**
- Decide explicitly and document: is this *instance-operator* revocation (arguably should require a server-side mechanism, e.g. an env-configured operator identity or CLI) or *workspace-admin* revocation (then it must only revoke sessions used for that workspace — hard with account-level sessions, so scope it: workspace admins can revoke *their own* sessions and possibly members of their workspace, never other admins/owners, never accounts they don't share a workspace with)?
- Never let an admin revoke the session of a higher-or-equal role except their own. Owner is immune to non-owner revocation.
- Guard the "lockout" case: if the operator revokes their own session via the admin UI, require step-up and warn; there is no email fallback in this self-hosted app — the recovery path is direct DB access, and that must be written into DEPLOY.md.
- Audit: record every revocation (who, whom, when, which session) as an activity entry with a machine verb — the operator will need this the first time a "revoked" user calls support.

**Warning signs:** revocation route authorized by role only, with no workspace relationship check; owner not excluded; no audit record.

**Phase to address:** admin-revocation phase — the privilege-boundary decision is a planning-phase decision, not an implementation detail.

---

### Pitfall 7: Encrypted secret changes TOTP replay-guard and login flow semantics invisibly

**What goes wrong:**
Encryption-at-rest lands and, while touching the verify path, someone changes when decryption happens relative to the replay guard, the pending-2FA challenge lifetime, or the throttle budget. Classic result: the replay window (same code accepted twice across a time-step) reopens, or the fail-closed 503 path skips the throttle increment so a key outage becomes a free brute-force window once the key returns.

**Why it happens:** the verify path is being edited anyway for decryption; the v1.3 replay guard and challenge throttle are in different code spots and no test pins their interaction with the decrypt step.

**How to avoid:**
- Decrypt at the boundary (single helper returning the secret or a typed error), never inline inside the TOTP comparison logic — replay-guard and step-counter updates stay byte-identical to v1.3.
- The 503 path must still consume throttle budget / increment failed-attempt counters: fail-closed for *verification* must not be fail-open for *rate limiting*.
- Port the v1.3 RFC fixture tests unchanged (TOTP in `totp.js` is fixture-verified — don't touch it), and add tests: encrypted-secret verify passes fixtures; decrypt-failure consumes throttle; decrypt-failure does not touch the replay table.

**Warning signs:** diff touches `totp.js` or the replay-guard table in the same commit as decryption; 503 short-circuits before the throttle code.

**Phase to address:** encryption-at-rest phase, with regression tests; verified again in disable-2FA phase (both touch the verify path).

---

### Pitfall 8: Recovery codes burned during the encryption migration, or challenge rows referencing stale code sets

**What goes wrong:**
The migration that encrypts `two_fa_secret` also rewrites adjacent auth rows "while we're in there" — or the regeneration feature ships before encryption does, so codes are stored under assumptions that the later encryption phase silently changes. Cross-feature ordering bugs: regeneration written against plaintext-era helpers, encryption phase refactors those helpers, regeneration tests go stale or are deleted as "flaky".

**Why it happens:** four features in one milestone, all touching the same tables; per-feature work without an integration pass over the shared `users.two_fa_*` / `recovery_codes` / `login_challenges` surface.

**How to avoid:**
- Fix feature ordering: **encryption-at-rest first** (it's the foundation — disable and regeneration both read/write the secret), then disable, then regeneration, then admin revocation. Regeneration and disable should be written against the encrypted reality, not retrofitted.
- One integration plan at milestone end covering the full matrix: enroll → regenerate → login with new code → disable → re-enroll → admin revoke, in one e2e flow, EN+FR per the v1.2/v1.3 posture.
- Never delete a v1.3 test that starts failing during this milestone — failing tests here are the integration bug.

**Warning signs:** phases planned in an order where regeneration precedes encryption; v1.3 tests deleted/renamed rather than passing; no cross-feature e2e.

**Phase to address:** milestone-level plan structure (ordering) + a final integration phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `decrypt() ?? plaintext` fallback | Migration "just works" for old rows | Plaintext becomes a permanent valid encoding; undetectable regression | Never |
| Raw `MASTER_KEY` as AES key, no envelope | Less code, one secret to manage | Key rotation = full user-visible 2FA re-enrollment | Only if documented as a known consequence; envelope is cheap enough that "never" is honest |
| Lazy encrypt-on-read migration | No deploy-time migration step | Plaintext rows persist for inactive users forever | Never — one-shot transactional migration is barely harder |
| Admin revocation without audit entries | Ship faster | No answer to "who revoked whom, when" — first support request exposes it | Never |
| Skipping session invalidation on 2FA disable | Simpler UX (user stays signed in everywhere) | A hijacked *other* session survives the 2FA removal | Never — reuse the v1.3 password-change pattern |
| Storing recovery codes retrievable (encrypted instead of hashed) | "Lets users view codes later" | Breaks the v1.3 burn-once semantics; encrypted-at-rest ≠ single-use | Never |

## Integration Gotchas

| Integration point | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `users.two_fa_*` dormant columns | Assuming columns are clean/nullable-consistent; v1.3 shipped them dormant and planning must verify actual shape before writing migrations | Read the v1.3 schema and Phase 16 code first; migrate additively with the byte-identical-second-boot guarantee (`test/migration.test.mjs` pattern) |
| `MASTER_KEY` + Docker deploy | Key baked into image or defaulted in code when absent | Key from env only; boot fails fast with a DEPLOY.md-documented message; never log it |
| `MASTER_KEY` + pre-migration backups (`vacuum into`) | Restoring a backup leaves plaintext secrets / old key versions the new code can't parse | Migrations stay backward-safe: version markers let restored old data either migrate again or be rejected loudly, never silently mis-decrypted |
| Pending `login_challenges` | Disable/regeneration leaves live challenges → attacker mid-challenge survives credential change | Delete the user's challenges in the same transaction as any 2FA state change |
| i18n catalogue (EN/FR + i18n-scan gate) | New 503/error machine codes added without catalogue entries; build gate fails late | Add stable codes + EN/FR entries in the same plan; run i18n-scan per phase, not at milestone end |
| Client central 401 teardown | Revoked-by-admin session gets an inconsistent sign-out experience vs. the v1.3 mid-session 401 flow | Admin revocation must flow through the *same* central teardown — do not build a second sign-out path |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Decrypt per request for every user-row read (not just 2FA verify) | Unnecessary AES-GCM + wrapped-key unwrap on hot paths; latency grows with every endpoint that touches `users` | Decrypt only in TOTP-verify/disable paths; cache nothing secret, but decrypt lazily and narrowly | Immediately wasteful; noticeable with many sessions |
| Scrypt step-up + regeneration in one synchronous request | Multi-second response, client timeouts | Step-up already costs scrypt — keep the response to regeneration O(1) besides it; this is a self-hosted app, load is low, just don't stack two scrypt verifications | Low load hides it; never a real issue at this scale |
| Migration encrypting all users on the request thread at boot | Slow first boot after upgrade for large installs | Projects scale (self-hosted teams) makes this a non-issue — a one-shot synchronous transactional migration is *correct* here | Only if installs reach thousands of users; not a realistic concern |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Disable-2FA accepting a recovery code as proof | Stolen recovery code = permanently remove 2FA | Recovery codes authenticate *login*, never configuration changes |
| Allowing admin to read/return decrypted TOTP secrets | Secret disclosure defeats the encryption feature | Decrypted secret never leaves the server; the only exposure is the one-time QR at enrollment (v1.3 behavior, preserved) |
| Regeneration codes returned over a cached/logged response | New codes leak via proxy logs or client cache | `Cache-Control: no-store` on the regeneration response; codes never re-served |
| Admin revocation without excluding owners | Privilege escalation path: admin locks out owner, or revokes across tenants | Role-hierarchy check + workspace-relationship check per Pitfall 6 |
| 503 fail-closed skipping throttle budget | Key outage = brute-force window | Consume throttle in the 503 path (Pitfall 7) |
| Swallowing decrypt errors into a generic 500 | Undistinguishable from a bug; admin can't tell key problem from app bug | Distinct stable machine code (`totpUnavailable`), catalogued EN/FR |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Disable-2FA shows a success toast while other sessions are silently killed | Users think they've been hacked | Copy stating explicitly that other sessions were signed out (v1.3 password-change honesty pattern) |
| Regeneration reveals new codes in a toast that disappears | User loses codes before saving → locked out of 2FA backup | Modal with copy/download + explicit "codes shown only once" acknowledgment |
| Fail-closed 503 during login shows generic "server error" | Self-hosted admin spends hours debugging a missing env var | Machine code translated client-side + DEPLOY.md troubleshooting entry |
| Admin revokes a session with no confirmation of *which device* | Operator revokes the wrong row | Session rows already carry label/IP/last-seen (v1.3) — the confirm dialog should repeat them |

## "Looks Done But Isn't" Checklist

- [ ] **Encryption-at-rest:** Often missing version markers + rotation path — verify a second `MASTER_KEY` version can decrypt old data in a test
- [ ] **Encryption-at-rest:** Often missing boot-time key validation — verify boot fails fast with a clear message when `MASTER_KEY` is absent/garbled
- [ ] **Migration:** Often missing "second boot is a no-op" and "restored backup boots" tests — verify both
- [ ] **Disable-2FA:** Often missing cleanup of `two_fa_secret`, recovery codes, and pending challenges — verify all three are gone after disable; re-enroll works immediately after
- [ ] **Disable-2FA:** Often missing other-session revocation — verify a second browser is signed out
- [ ] **Regeneration:** Often missing transaction + challenge invalidation — verify concurrent-burn race and mid-challenge invalidation
- [ ] **Regeneration:** Often missing "codes shown exactly once" — verify GET after regeneration does not return them
- [ ] **Admin revocation:** Often missing privilege boundary (owner immunity, cross-tenant block) — verify matrix: owner→owner, admin→owner, admin→admin-other-workspace, self-revocation
- [ ] **Admin revocation:** Often missing audit entries — verify each revocation writes an activity row with a machine verb
- [ ] **Integration:** Often missing cross-feature e2e — verify enroll→regenerate→login→disable→re-enroll→revoke as one Chromium flow, EN+FR
- [ ] **i18n:** Often missing catalogue entries for new error codes — verify i18n-scan green per phase

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Plaintext rows post-migration | LOW | Re-run one-shot migration idempotently (version markers make this safe) |
| `MASTER_KEY` lost | HIGH | All users re-enroll 2FA; documented runbook: admin clears `two_fa_*` via direct DB access, users re-scan QR; passwords and data unaffected |
| Owner locked out by revocation | MEDIUM | Direct DB session deletion (self-hosted); document in DEPLOY.md |
| Half-cleaned disable state (ghost 2FA) | MEDIUM | Manual DB cleanup script + fix; hence the all-three-objects-in-one-transaction rule |
| Key version mismatch after restore-from-backup | LOW | Loud parse rejection; re-run migration for the older version marker |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Plaintext fallback / lazy migration | Encryption-at-rest | Test: unmarked secret rejected; migration idempotent; second boot no-op |
| 2. No rotation story | Encryption-at-rest | Test: two key versions decrypt same DEK; DEPLOY.md runbook exists |
| 3. 503 bricks whole app | Encryption-at-rest | Test: non-2FA login + workspace routes work with key absent; boot validation |
| 4. Disable = account takeover | Disable-2FA (after verifying v1.3 16-02 coverage) | Test: recovery code rejected for disable; sessions revoked; full cleanup asserted |
| 5. Regeneration races | Recovery regeneration | Transaction test + concurrent-burn race test; challenge deletion asserted |
| 6. Revocation privilege paradox | Admin revocation (boundary decision in planning) | Privilege matrix tests; audit-entry assertion |
| 7. Verify-path regressions | Encryption-at-rest + disable | v1.3 fixture tests unchanged and passing; 503 consumes throttle |
| 8. Cross-feature ordering | Milestone planning (ordering: encryption → disable → regeneration → revocation) + final integration phase | Cross-feature Chromium e2e, EN+FR; no v1.3 tests deleted |

## Sources

- OWASP Authentication Cheat Sheet & MFA statements ("second factor required to modify second factor")
- NIST SP 800-63B (verifier/factor lifecycle, re-authentication for sensitive operations)
- Public post-mortems on TOTP-at-rest designs (GitLab 2FA seed encryption, GitHub's TOTP migration notes) and on "decrypt-with-plaintext-fallback" incidents
- Projects v1.3 ground truth: PROJECT.md (sessions/password-change transactional pattern, pending-2FA challenge anonymity, replay guard, throttle budget surviving abandon, central 401 teardown)
- Personal experience / known integration-failure patterns in additive auth features

---
*Pitfalls research for: Projects Studio v1.4 auth completion (adding to an existing auth system)*
*Researched: 2026-10-28*
