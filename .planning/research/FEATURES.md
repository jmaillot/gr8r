# Feature Research — Auth Completion (v1.4)

**Domain:** Self-hosted PM/workspace app — auth lifecycle completion (disable-2FA, TOTP encryption-at-rest, recovery-code regeneration, admin session revocation)
**Researched:** 2026-10-28
**Confidence:** HIGH (flows and policy are standardized by OWASP cheat sheets and implemented consistently across comparable self-hosted apps; only deployment-specific details are MEDIUM)

## Scope Note

v1.3 already shipped: sessions table, password change with atomic revocation, TOTP enroll/enable/**disable route (16-02)** with password step-up, hashed single-use recovery codes, pending-2FA login challenge. Planning must diff this landscape against the shipped 16-02 route and scope **only the gap**. The "table stakes" below describe what a *complete* disable/2FA-off flow typically includes, per comparable apps — not what must be newly built.

## Feature Landscape

### Table Stakes (Users/Operators Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Disable-2FA: password step-up before disable** | OWASP MFA Cheat Sheet explicitly lists "Disabling MFA" as a sensitive action requiring re-authentication (password or MFA). GitHub, GitLab, Gitea, Nextcloud all require password confirmation to turn 2FA off. | LOW | v1.3 already has the password step-up pattern and the disable route (16-02). Verify it's enforced server-side on the disable route, not just client-gated. |
| **Disable-2FA: confirmation dialog with explicit warning** | Users expect a "this removes your 2FA" warning; GitHub/GitLab show consequences (account becomes password-only). | LOW | Frontend-only; copy in EN+FR via existing i18n gate. |
| **Disable-2FA: tear down pending login challenge** | If a disable happens mid-challenge (or the user has an in-flight pending-2FA login), the challenge must not keep demanding codes. | LOW | Check: does 16-02 clear `login_challenges` rows for the user? This is the most likely genuine gap. |
| **Disable-2FA: session policy decision** | Comparable apps vary: GitHub keeps the session; many apps revoke *other* sessions when 2FA is removed (treat as risk event, cf. OWASP Session Mgmt "Reauthentication After Risk Events"). | LOW | A product decision, but the defensible default: keep current session, revoke others (mirrors the password-change transactional pattern already in v1.3). |
| **Disable-2FA: wipe/clear 2FA state atomically** | `two_fa_*` columns cleared, recovery codes invalidated, replay-window state reset — in one transaction. Leaving hashed recovery codes behind is a known bug class. | LOW | Same transaction discipline as Phase 15 password change. |
| **Disable-2FA: audit/activity entry** | Disabling 2FA is the single most security-sensitive account event; comparable apps log it. Projects already has the activity-verb infrastructure. | LOW | New machine verb, EN+FR copy. |
| **Recovery-code regeneration: password step-up** | Regenerating invalidates the user's only remaining recovery factor — GitHub/GitLab require password confirmation. | LOW | Reuse existing step-up helper. |
| **Recovery-code regeneration: burn-and-replace semantics** | Old codes become invalid immediately and permanently; new hashed codes returned once, shown once. Must be atomic (delete-all + insert-all in one transaction) — a partial failure must never leave a user with zero codes or duplicated codes. | MEDIUM | v1.3 has the hashing + single-use machinery; regeneration is a transactional wrapper. |
| **Recovery-code regeneration: show-once UX with download/copy** | Identical to enrollment UX (v1.3 already built this); regeneration reuses it. | LOW | No new component; maybe a "you regenerated on <date>" note. |
| **Recovery-code regeneration: rate limiting** | Password-gated, but still throttle (the v1.3 throttle budget pattern exists). | LOW | Reuse challenge throttle. |
| **TOTP encryption-at-rest: AES-256-GCM with AAD** | Standard: authenticated encryption of `two_fa_secret`, with the user id (or row id) as AAD to prevent ciphertext swapping between accounts. RFC/industry norm (Nextcloud uses master-key + AEAD after the 2020 crypto findings; Vaultwarden encrypts TOTP secrets under the vault key). | MEDIUM | `node:crypto` only — zero-dependency constraint holds. Random 12-byte nonce per encryption, stored alongside ciphertext (`nonce:ciphertext` or separate column). |
| **TOTP encryption-at-rest: MASTER_KEY from env, fail-closed 503** | The milestone decision. Fail-closed = if MASTER_KEY is missing/wrong, 2FA verification endpoints answer 503 (with stable error code, translated client-side per ERR-01 pattern) rather than falling back to plaintext. Enrollment should be blocked too (can't safely store). | MEDIUM | Distinct error code so the client can say "server key misconfigured" vs "wrong code". Log loudly. |
| **TOTP encryption-at-rest: migration of existing plaintext secrets** | Any v1.3 install has plaintext `two_fa_secret` values; the migration must encrypt in place (backup-first, like `migrateTenancy()`), and a second boot must be a byte-identical no-op. | MEDIUM | This is the real complexity center of the encryption feature — the crypto itself is ~30 lines; the migration is the work. |
| **Admin session revocation: list + revoke sessions of any user** | Operators expect to see a user's active sessions and revoke them (Nextcloud, Gitea admin panels; Microsoft Entra "Revoke sessions"). | LOW-MEDIUM | New admin surface on the existing `sessions` table; role gate (`admin`/`owner` at workspace level — note Projects roles are per-workspace, so decide: workspace-admin revokes sessions of their members, vs instance-admin only). |
| **Admin session revocation: revoked browsers get the honest 401 teardown** | v1.3's central mid-session 401 teardown must fire for admin-revoked sessions too — zero new teardown code, just verify it does. | LOW | Existing SESS-01…03 machinery. |
| **Admin session revocation: never revoke the operator's own session accidentally** | Comparable UIs mark the operator's own session and either block or warn (Entra's "Revoke sessions" works only on *other* users). | LOW | Simplest: admin revocation targets *other* users; self-revocation stays on the user's own sessions page. |
| **Admin session revocation: audit entry** | Revoking someone's sessions is an administrative action; log who did it to whom. | LOW | Activity verb + actor. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Encryption key versioning (`v1:` prefix on ciphertext)** | Lets MASTER_KEY rotation happen later without a rewrite; comparable apps that skip this get a painful one-time migration later. | LOW | Prefix ciphertext with a key-version byte; costs nothing now, saves a migration later. |
| **Admin "revoke all sessions instance-wide"** | Emergency response (breach panic). Gitea/GitLab have it at instance level. | LOW | One loop over the sessions table + 401 teardown. Only meaningful once Projects has an instance-admin concept — may be premature given per-workspace roles. |
| **Disable-2FA requires both password AND a current TOTP code (or recovery code)** | Stronger than GitHub's password-only; proves the person disabling has live possession of the factor. OWASP endorses MFA-or-password step-up; requiring both is above the bar. | LOW | Tiny policy choice; consider making it the default since the code path exists. |
| **Notify user (in-app activity) when admin revokes their sessions** | Trust/observability; the user sees why they were logged out. | LOW | Activity entry visible to the affected member. |
| **Post-disable recovery-code purging with count reported** | "3 unused recovery codes were destroyed" — honest messaging consistent with v1.3's "honesty regression guard" test posture. | LOW | Cheap, on-brand for the project's honesty pattern. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Admin can disable a user's 2FA directly** | "Locked-out user calls support" | Defeats the point of user-held factors; every comparable app that allows it (WordPress) has it as a footgun. Out of scope for self-hosted peer trust, and the milestone didn't ask for it. | Operator instructs the user, or the user regenerates recovery codes via password login. |
| **Plaintext secret retained "for admin recovery"** | Tempting alongside encryption-at-rest | Negates the entire feature; breaks threat model (DB leak alone must not yield TOTP secrets). | Fail-closed 503 + recovery codes as the human fallback. |
| **Key escrow / split MASTER_KEY / HSM integration** | Enterprise checkboxes | Massive complexity for a zero-dependency single-image app; no comparable self-hosted peer requires it. | One MASTER_KEY env var, documented in DEPLOY.md, with key-version prefix for future rotation. |
| **"Soft disable" / grace period for 2FA** | Reduce friction | 2FA is either enforced or not; a grace window is a phishing window. | Immediate disable, one transaction. |
| **Admin session revocation by IP or user-agent matching** | "Kick everyone on that device" | Unreliable matching, collateral revocations. | Per-user, per-session, and optionally per-user revoke-all. |
| **Recovery-code "count remaining" always visible** | User convenience | Leakage of account state; not offered by comparable apps. | Show codes once at generation/regeneration; show "used" feedback only at burn time (already v1.3 behavior). |

## Feature Dependencies

```
[Password step-up helper (v1.3, shipped)]
    └──requires──> nothing new
    └──reused-by──> [Disable-2FA complete flow]
                 └──reused-by──> [Recovery-code regeneration]

[Sessions table + 401 teardown (v1.3, shipped)]
    └──requires──> nothing new
    └──reused-by──> [Admin session revocation]
    └──reused-by──> [Disable-2FA session policy]

[MASTER_KEY encryption]
    └──enhances──> [TOTP enrollment (v1.3)]  — secret becomes ciphertext at rest
    └──requires──> [Plaintext → ciphertext migration]
    └──must-not-block──> [login flow for users without 2FA]

[Disable-2FA complete flow]
    └──depends on──> [encryption migration complete]  (ordering, not logic —
                       disabling reads/destroys the secret, so it must handle
                       both plaintext legacy rows and ciphertext during transition)
```

### Dependency Notes

- **Encryption migration is the bottleneck phase.** Everything touching `two_fa_secret` (enroll, verify, login challenge, disable) must go through a single decrypt helper *before* the disable flow is built on top, or the disable route will need dual-mode code forever. Recommend: encryption first, then disable/regeneration/admin on the clean surface.
- **Disable-2FA session policy reuses the password-change transactional revocation** — same code path, same tests to mirror.
- **Admin revocation conflicts with nothing** but needs a role-model decision (workspace-admin vs instance-admin) before planning; Projects has no instance-admin today, which may constrain scope.

## MVP Definition

### Launch With (v1.4)

- [ ] Disable-2FA gap closure — verify 16-02 covers: server-side password step-up, atomic wipe of `two_fa_*` + recovery codes, pending-challenge teardown, "keep current / revoke other sessions" policy, activity entry. Build only what's missing.
- [ ] TOTP secret AES-256-GCM under MASTER_KEY, AAD-bound, fail-closed 503 with translated stable error code, backup-first plaintext migration, byte-identical second boot.
- [ ] Recovery-code regeneration — password step-up + atomic burn-and-replace + show-once UX (reusing enrollment components).
- [ ] Admin session revocation — list and revoke a user's sessions, own-session exclusion, 401 teardown fires, audit entry.

### Add After Validation (v1.x)

- [ ] Key-version prefix enabling MASTER_KEY rotation — trivial if done at encrypt time, painful if retrofitted.
- [ ] Disable requiring password *and* live TOTP/recovery code.
- [ ] In-app notification to the target user on admin revocation.

### Future Consideration (v2+)

- [ ] Instance-wide revoke-all (needs an instance-admin concept first).
- [ ] WebAuthn/passkeys as a second factor (would interact with disable flow).
- [ ] MASTER_KEY rotation tooling (command or boot-time re-encrypt).

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Disable-2FA gap closure | HIGH | LOW (likely small diff vs 16-02) | P1 |
| TOTP encryption-at-rest + migration | HIGH (milestone decision made real) | MEDIUM (crypto trivial, migration is the work) | P1 |
| Recovery-code regeneration | HIGH | LOW-MEDIUM | P1 |
| Admin session revocation | HIGH (operator trust) | MEDIUM (role-model decision + admin surface) | P1 |
| Key-version prefix | MEDIUM (future-proofing) | LOW | P2 |
| Password+code step-up on disable | MEDIUM | LOW | P2 |

## Competitor Feature Analysis

| Feature | GitHub / GitLab | Gitea / Nextcloud | Vaultwarden | Projects Approach |
|---------|-----------------|-------------------|-------------|----------------|
| Disable 2FA | Password confirmation, warning copy, session kept, activity emailed | Password confirmation; Nextcloud blocks disable when provider-locked by admin | N/A (TOTP optional) | Server-side password step-up, atomic wipe, revoke-others policy, activity verb |
| Secret at rest | Not exposed | Nextcloud: master-key AEAD after 2020 audit findings | Encrypted under vault key | AES-256-GCM + AAD under `MASTER_KEY`, fail-closed 503, backup-first migration |
| Recovery codes | Regenerate on demand, password-gated, show once | Same pattern | Regenerate invalidates old | Password-gated atomic burn-and-replace, show-once |
| Admin session revoke | Admin can force sign-out of any user | Gitea admin panel deletes sessions; Entra "Revoke sessions" replaces per-factor revoke | N/A | Reuse `sessions` table + existing 401 teardown; decide workspace-admin vs instance-admin scope |

## Sources

- OWASP MFA Cheat Sheet — disabling MFA listed as sensitive action requiring re-authentication (fetched 2026-10-28, HIGH confidence)
- OWASP Session Management & Authentication Cheat Sheets — reauthentication after risk events (HIGH confidence)
- Nextcloud server-side encryption docs + IACR eprint 2020/1439 (Nextcloud crypto audit motivating master-key AEAD) (HIGH confidence)
- Microsoft Entra "Revoke sessions" consolidation — admin revoke semantics, own-session restrictions (MEDIUM confidence)
- Comparable-app behavior (GitHub, GitLab, Gitea, Vaultwarden) from established product behavior; exact current UI details MEDIUM confidence — verify at phase research if a specific flow is copied

---
*Feature research for: Projects Studio v1.4 auth completion*
*Researched: 2026-10-28*
