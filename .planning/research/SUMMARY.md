# Project Research Summary

**Project:** Gr8r Studio — Milestone v1.4 "Auth Completion"
**Domain:** Self-hosted workspace/PM app (single-file Node server, node:sqlite, zero runtime dependencies) — auth lifecycle gap-closure
**Researched:** 2026-10-28
**Confidence:** HIGH (codebase ground truth verified by direct code inspection; standards claims from OWASP/NIST knowledge, MEDIUM)

## Executive Summary

The single most important finding across all four research files is a **ground-truth correction to the milestone brief**: v1.3 already shipped most of what v1.4 was framed around. Direct inspection of `server.js` confirms `encryptTotpSecret`/`decryptTotpSecret` (AES-256-GCM, `v1:<iv>:<tag>:<ct>` envelope, sha256-derived key, fail-closed 503 `masterKeyMissing`) already exist, the disable-2FA route (16-02) already exists with password step-up, TOTP-or-recovery verification, atomic state reset, and throttle budget, and sessions self-revocation exists. **v1.4 is a gap-closure/audit/migration milestone, not a build-from-scratch milestone.** The genuinely missing pieces are small and well-defined: (1) a boot-time plaintext→envelope migration (likely zero rows, but must exist and be byte-identical on second boot), (2) a first-class recovery-code regeneration route, (3) cross-user admin session revocation, (4) verification/e2e/i18n coverage of the existing disable flow.

The zero-runtime-dependency constraint holds without exception — every feature reduces to `node:crypto`, `node:sqlite` transactions, and new route handlers reusing existing patterns (step-up helper, throttle budgets, central 401 teardown, `ensureColumn` migrations). No new libraries, no new tables, no new schema except possibly one additive operator-flag column. The stack research verdict: **nothing to install; reuse everything verbatim.**

The two real risks are (a) **the admin privilege-model decision** — Gr8r is multi-tenant with workspace-scoped roles and no instance-admin concept; gating cross-user revocation on the existing `isAdminUser()` would let any workspace admin log out any user on the instance, breaking v1.1 tenancy isolation. This is a discuss-phase decision (instance-operator vs workspace-admin, options: `ADMIN_EMAIL`-derived gate, env-var style, or an `is_instance_admin` flag column) and **must be settled before planning Phase 4**. (b) **MASTER_KEY becomes load-bearing**: losing it bricks 2FA for all users; DEPLOY.md must document the loss runbook.

## Key Findings

### Recommended Stack

No changes. Every feature fits existing Node 24 built-ins and existing v1.3 code patterns (see STACK.md for the verified line-by-line inventory).

**Core technologies (all already in use):**
- `node:crypto` AES-256-GCM — TOTP envelope crypto — already implemented and verified against Node 24 docs; do not touch.
- `node:sqlite` transactions — atomic burn-and-replace / admin revoke — the password-change transactional pattern from v1.3 is the template.
- Env-var `MASTER_KEY` — key management — no KMS/Vault/HSM (anti-feature for a zero-dep single-image app).
- `node --test` + Playwright + `scripts/i18n-scan.mjs` — existing test/i18n gates extend to all new routes.

**Explicitly rejected:** plaintext-decrypt fallback (`?? secret`), scrypt/HKDF on MASTER_KEY, a `revocations` soft-delete table, encrypted (retrievable) recovery codes, key-rotation machinery this milestone (the `v1:` prefix is the future hook).

### Expected Features

**Must have (v1.4, per FEATURES.md):**
- Disable-2FA gap closure — verify 16-02 covers server-side password step-up, atomic wipe of `two_fa_*` + recovery codes + pending `login_challenges`, keep-current/revoke-others session policy, activity verb. Build only what's missing (e2e + i18n most likely).
- Boot-time plaintext→envelope TOTP migration — `migrateTotpSecrets()` in `openDb()`, skip-and-warn without MASTER_KEY, byte-identical second boot.
- Recovery-code regeneration — password step-up **plus live TOTP code** (a recovery code must never authorize its own replacement), atomic burn-and-replace, show-once UX reusing enrollment components, own throttle budget.
- Admin session revocation — list + revoke any user's sessions, own-session exclusion, existing central 401 teardown fires, audit entry, privilege gate per the decision below.

**Should have (cheap differentiators):** disable requires password AND live code; "N unused codes destroyed" honest messaging; in-app notification to revocation targets; key-version prefix discipline (already in place).

**Defer (v2+):** instance-wide revoke-all (needs instance-admin concept), WebAuthn/passkeys, MASTER_KEY rotation tooling.

**Anti-features (refuse):** admin disabling a user's 2FA directly; plaintext secret "for admin recovery"; soft-disable grace periods; revocation by IP/user-agent matching; always-visible recovery-code counts.

### Architecture Approach

All four features are thin extensions of the v1.3 auth surface — no new tables, no new crypto, one small helper (`migrateTotpSecrets`), one new small gate helper, two new routes, one route verified/extended (see ARCHITECTURE.md for component table and flow diagrams).

**Major components:**
1. `migrateTotpSecrets()` in `openDb()` — one-shot encrypt of non-`v1:` rows; no-op on second boot; warn-and-skip without MASTER_KEY (login already fail-closed).
2. `POST /api/auth/tfa/recovery` — regeneration route; inherits MASTER_KEY fail-closed 503 for free via `decryptTotpSecret`.
3. `GET`/`DELETE /api/admin/sessions[/:userId]` — cross-user revocation; reduces to existing `sessions`-table deletes; victims get the existing mid-session 401 teardown.
4. `POST /api/auth/tfa/disable` — exists; verify against the brief's bar and add e2e/i18n coverage.

### Critical Pitfalls

1. **Plaintext fallback / lazy migration** (P1) — decryptor must reject anything without the `v1:` marker (fail-closed on format, never fall-open); one-shot transactional boot migration; no `?? secret` anywhere.
2. **Privilege paradox on admin revocation** (P6) — never gate on `isAdminUser()` alone; cross-tenant/owner-immunity rules required; the instance-operator-vs-workspace-admin decision is a discuss-phase blocker.
3. **Recovery code authorizing its own regeneration** (Anti-Pattern 3) — step-up must be fresh password + live TOTP only.
4. **Fail-closed 503 with side effects** (P7) — the 503 path must still consume throttle budget and must not touch the replay guard; decrypt only at a single boundary helper; v1.3 fixture tests pass unchanged.
5. **Cross-feature ordering** (P8) — encryption migration first, then regeneration, then disable closure, then admin revocation; never delete a failing v1.3 test; close with one cross-feature e2e (enroll→regenerate→login→disable→re-enroll→revoke, EN+FR).

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: TOTP Encryption Audit + Plaintext Migration
**Rationale:** Everything touching `two_fa_secret` must run on a single decrypt surface before any route work; the migration is testable in isolation against `test/migration.test.mjs` and every later phase inherits its fail-closed semantics. Do it first so tests never see plaintext rows.
**Delivers:** `migrateTotpSecrets()` boot pass, decrypt-call-site audit (every site fails closed before mutation), boot-time MASTER_KEY validation, DEPLOY.md key-lifecycle + loss runbook, migration tests (first boot encrypts, second boot byte-identical, restored-backup boots).
**Addresses:** Encryption-at-rest gap closure; the brief's "migration" obligation.
**Avoids:** Pitfalls 1, 2, 3, 7.

### Phase 2: Recovery-Code Regeneration
**Rationale:** Smallest new route; depends on Phase 1's decrypt path; reuses the enable route's transaction and response shape verbatim; warms up the step-up + throttle + i18n pattern used by later phases.
**Delivers:** `POST /api/auth/tfa/recovery` (fresh password + live TOTP step-up, atomic delete-all + insert-all in one transaction, pending-challenge invalidation, show-once response, `Cache-Control: no-store`, new throttle budget), UI reuse of enrollment show-once components, tests including concurrent-burn race.
**Addresses:** Regeneration gap (the genuine missing endpoint).
**Avoids:** Pitfalls 5, 8; Anti-Pattern 3.

### Phase 3: Disable-2FA Verification & Closure
**Rationale:** Mostly verification of shipped 16-02 plus closure of whatever the diff reveals (most likely: pending-challenge teardown, e2e, i18n keys); benefits from Phase 2 because disable and regeneration UI are siblings on the settings 2FA card.
**Delivers:** Verified disable contract (server-side password step-up, atomic `two_fa_*` + recovery + challenge wipe, keep-current/revoke-others policy, activity verb), e2e + EN/FR coverage, re-enroll-immediately-after test.
**Addresses:** Disable-2FA table stakes; honest-messaging UX.
**Avoids:** Pitfall 4 (verify recovery codes are NOT accepted for disable — or make that an explicit documented policy decision), ghost-2FA-state bug class.

### Phase 4: Admin Session Revocation
**Rationale:** Independent of crypto but **blocked on the privilege-model decision** (instance-operator vs workspace-admin) which must be resolved in discuss-phase before planning; consumes the gate/throttle/audit patterns established in Phase 2.
**Delivers:** Admin-gated session list + cross-user revoke routes, own-session exclusion, central 401 teardown fires for victims, audit entry (or documented deferral to server logs), privilege-matrix tests (owner immunity, cross-tenant block, self-revocation).
**Addresses:** The other genuine gap; operator trust.
**Avoids:** Pitfall 6 (privilege paradox — the top architectural risk of the milestone).

### Phase Ordering Rationale

- **Dependency order, not feature order:** encryption migration touches `openDb()` and defines the decrypt surface; regeneration and disable both read/write the secret and must be written against the encrypted reality, not retrofitted (Pitfall 8).
- **Risk ordering:** the migration phase is the highest-certainty, highest-leverage work; the privilege decision is the only unknown, so it sits last where discuss-phase has maximal codebase context.
- **Integration closure:** a final cross-feature e2e pass (can be part of Phase 4 or a short Phase 5) covering enroll→regenerate→login→disable→re-enroll→revoke in one Chromium flow, EN+FR, with the rule that no v1.3 test may be deleted.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** moderate — audit must enumerate *every* decrypt call site; verify the enrollment/enable path fails closed too (login path already verified at line ~1641).
- **Phase 4:** the privilege-model decision requires a discuss-phase round with the owner; also settle the audit-log location question (workspace activity log vs server logs for instance-level actions).

Phases with standard patterns (skip research-phase):
- **Phase 2:** regeneration is the enable route's transaction behind a new route; all patterns exist.
- **Phase 3:** verification of shipped code + e2e/i18n; well-documented OWASP patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against shipped code and Node 24 docs (Context7); zero additions needed. |
| Features | HIGH | OWASP-backed table stakes; comparable-app behavior consistent; only deployment details MEDIUM. |
| Architecture | HIGH | Ground truth read directly from `server.js`; external standards claims MEDIUM (web search blocked). |
| Pitfalls | HIGH | Standard security-engineering failure modes mapped to verified v1.3 ground truth. |

**Overall confidence:** HIGH

### Gaps to Address

- **Admin privilege model (BLOCKING for Phase 4):** instance-operator vs workspace-admin. Options documented in ARCHITECTURE.md Pattern 3 — (a) `isAdminUser()` gate (rejected: tenant-boundary privilege inflation), (b) `ADMIN_EMAIL`-derived instance operator, (c) additive `is_instance_admin` flag column. Resolve in discuss-phase with the owner.
- **Audit-log location for instance-level actions:** activity log lives in workspace documents; instance-level revocation may have no workspace to log into. Decide: log to target user's workspaces, or defer to server logs for v1.4.
- **Disable via recovery code:** line ~1575 of `server.js` suggests the shipped disable route accepts recovery codes; FEATURES/PITFALLS argue recovery codes must never authorize disable. This is a policy conflict to resolve (tighten vs document) in Phase 3 discussion.
- **Plaintext-row reality check:** encryption shipped in v1.3 and columns were dormant before, so likely zero plaintext rows exist — but the migration must still be built for safety (restored backups, hypothetical old installs). ARCHITECTURE recommends skip-and-warn without MASTER_KEY; confirm the fail-closed policy with the owner.
- **Standards clause citations:** OWASP/NIST claims are from established knowledge (search was blocked); verify exact clause numbers if cited externally during planning.

## Sources

### Primary (HIGH confidence)
- Codebase inspection — `server.js` (MASTER_KEY line 73, envelope crypto ~235–262, disable route 1548, isAdminUser 356, auth routes 1371–1740), `totp.js` contracts, `package.json`/`Dockerfile`, `test/migration.test.mjs` — ground truth for all four features.
- Context7 `/websites/nodejs_latest-v24_x_api` (crypto.html) — GCM key/IV/auth-tag semantics, verified to match shipped implementation.

### Secondary (MEDIUM confidence)
- OWASP MFA, Authentication, and Session Management Cheat Sheets — disable-as-sensitive-action, reauthentication after risk events (fetched 2026-10-28).
- NIST SP 800-63B (AAL2), OWASP ASVS 2.5.3/2.8, RFC 6238 — step-up, factor lifecycle (established knowledge; search blocked by anti-bot).
- Nextcloud server-side encryption + IACR eprint 2020/1439; Microsoft Entra "Revoke sessions" semantics; GitHub/GitLab/Gitea/Vaultwarden comparable behavior.

### Tertiary (LOW confidence — validate during planning)
- Exact current UI details of comparable apps (MEDIUM, could have drifted).
- Assumption that zero plaintext `two_fa_secret` rows exist in the wild.

---
*Research completed: 2026-10-28*
*Ready for roadmap: yes*
