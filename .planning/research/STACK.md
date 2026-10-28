# Stack Research

**Domain:** Auth completion milestone (v1.4) — TOTP secret encryption-at-rest, recovery-code regeneration, admin session revocation
**Researched:** 2026-10-28
**Confidence:** HIGH

## Headline finding: no new stack additions are needed

The zero-runtime-dependency constraint holds for all four features. More importantly, **code
inspection of `server.js` / `totp.js` shows the encryption-at-rest groundwork is already
implemented in v1.3** — the milestone is mostly about completing flows, auditing fail-closed
coverage, and adding two endpoints, not adding libraries.

What already exists in `server.js` (verified by reading the shipped code):

- `MASTER_KEY` env var (line 73) with the D-06/D-58 fail-closed-503 contract documented at the
  definition site.
- `encryptTotpSecret()` / `decryptTotpSecret()` — AES-256-GCM envelope `v1:<iv>:<tag>:<ct>`,
  key = `sha256(MASTER_KEY)`, fresh 12-byte IV per encryption, auth-tag verified on decrypt,
  returns `null` on missing/undecryptable state (lines ~234–262).
- The login second-step path already fails closed (`return 'masterKey'` → 503) before any
  mutation when the secret cannot be decrypted, and the disable path decrypts before clearing.
- Recovery codes: hashed whole (`sha256` of one normalization), burned with a race-safe
  conditional `update … where used_at is null`, rotated on enable — but **there is no
  regenerate-after-enrollment endpoint** (that's the genuine gap).
- Sessions: revocation today is hard `delete` scoped to the caller's own `user_id` (P-F guard);
  **there is no operator/admin cross-user revocation route** (the other genuine gap).

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `node:crypto` — `createCipheriv('aes-256-gcm', …)` | Node 24 (already in use) | TOTP secret encryption-at-rest | Already implemented and verified against v24 docs: GCM authenticates (tampered/`MASTER_KEY`-wrong → `decipher.final()` throws), 32-byte key (sha256 of `MASTER_KEY`), 12-byte IV, `getAuthTag()` after `final()`. No reason to touch it. |
| `node:crypto` — `createHash('sha256')` | Node 24 (already in use) | Key derivation from `MASTER_KEY`; recovery-code hashing | A one-step `sha256` of a server-side secret is acceptable here because `MASTER_KEY` is already a high-entropy operator-supplied value, not a password. If it ever becomes low-entropy, switch to `scrypt`/`hkdf` — see Alternatives. |
| `node:crypto` — `timingSafeEqual` | Node 24 (already in use) | Constant-time comparisons (passwords, tokens) | Already the pattern in `server.js`; reuse for any new token/hash comparison. |
| `node:sqlite` (`DatabaseSync`) transactions | Node 24 (already in use) | Atomic burn-and-replace of recovery codes; atomic admin revocation | v1.3 already proves the transaction pattern (password change revokes sessions in the same transaction as the rehash). Regeneration and admin revoke must reuse it, not invent new patterns. |
| Env-var config (`process.env.MASTER_KEY`) | — (already in use) | Key management | Consistent with `PORT`, `ALLOW_SIGNUP`, etc. Needs exactly one addition to `DEPLOY.md`: document that generating new recovery codes/2FA flows require `MASTER_KEY` set, and that losing it bricks every enrolled TOTP secret (recovery via admin reset). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **None — zero runtime dependencies** | — | — | Hard constraint; nothing here requires one. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `node --test` (existing) | New unit tests: decrypt-failure → 503 matrix, regenerate burn-and-replace, admin revoke across users | Follow the existing `test/*.test.mjs` + fixture-verified pattern from v1.3. |
| Playwright e2e (existing dev dep) | UI flows: regenerate codes, operator revoking another user's session | Already in `devDependencies@^1.64.1`. |
| `DEPLOY.md` | Document `MASTER_KEY` lifecycle: required for 2FA, loss procedure | Docs-only change; part of the encryption feature's definition of done. |

## Installation

```bash
# Nothing to install. The only dev dependency set is unchanged:
npm install -D @playwright/test  # already present
```

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| KMS / Vault / any key-management service | Self-hosted single-Docker-image app; adds a runtime dependency and network dependency for no gain at this scale | `MASTER_KEY` env var + `DEPLOY.md` operational guidance |
| Password-based key derivation (`scrypt` on `MASTER_KEY`) for the TOTP envelope | Unnecessary: `MASTER_KEY` is an operator secret, not a user password; derivation adds a per-request cost and a migration for zero security benefit | Current `sha256(MASTER_KEY)` (only revisit if `MASTER_KEY` becomes human-chosen/low-entropy) |
| A new `crypto` library (libsodium wrappers, `@noble/ciphers`, etc.) | Violates the zero-dependency constraint; duplicates what `node:crypto` GCM already provides and what the code already does correctly | Existing `node:crypto` envelope helpers |
| Separate `revocations` table with soft-delete of sessions | `node:sqlite` hard-delete + `expires_at` index already gives honest sign-out via the v1.3 mid-session 401 teardown; a soft-delete column invites orphaned "expired vs revoked" logic | Keep `sessions` schema as-is; revoke = `delete … where user_id = ?` (optionally extended — see Variants) |
| HKDF/`hkdfSync` now | A versioned envelope (`v1:` prefix) already exists; HKDF buys nothing without multiple derived keys, which there is only one of | sha256; the `v1:` prefix is the correct hook for a future envelope upgrade |
| Storing recovery codes encrypted | Deliberate decision D-09/D-51 in the code: codes are hashes and must survive `MASTER_KEY` loss as the account-recovery path | Keep them sha256-hashed, never encrypted |

## Stack Patterns by Variant

**Encryption-at-rest (scope: audit, don't rewrite):**
- Reuse `encryptTotpSecret`/`decryptTotpSecret` verbatim. The milestone work is:
  1. Audit **every** decrypt call site fails closed with 503 before mutation (login path
     verified at line ~1641; verify the enrollment/enable path too).
  2. Decide and document the legacy-plaintext question: since encryption shipped in v1.3 and
     the columns were dormant before it, no install should hold a plaintext secret — but
     `decryptTotpSecret` returning `null` for any non-`v1:` string means a hypothetical
     plaintext row bricks the account. Either add a one-shot `update users set two_fa_secret = encrypt(…)` migration at boot, or state in writing that no plaintext can exist (planning task).
  3. `DEPLOY.md`: `MASTER_KEY` required-for-2FA + loss procedure.
- Envelope versioning stays at `v1:`; do not add key-rotation machinery this milestone.

**Recovery-code regeneration (new endpoint only):**
- Reuse `generateRecoveryCode` / `recoveryHash` / `normalizeRecoveryCode` from `totp.js`
  verbatim. The rotation transaction already exists in the enable path (delete all + insert N
  inside one transaction); the regenerate endpoint is that same transaction behind a new route
  with password step-up (existing pattern from the disable route).
- No schema change: `recovery_codes` table already supports replace-by-delete-and-insert.

**Admin session revocation (new endpoint, schema decision only):**
- Cross-user revoke = `delete from sessions where user_id = ?` (or `where 1=1` for all users)
  executed by an operator-gated route. `sessions` has `on delete cascade` from users and the
  v1.3 central 401 teardown already handles the revoked-browser side honestly.
- The only real decision is **authorization**, not stack: workspace roles are per-workspace;
  there is no global-admin flag on `users`. Options: (a) `users.is_operator`/`role` column +
  migration, (b) first-account-is-operator, (c) an env-declared operator email
  (`OPERATOR_EMAIL`, matching the `ALLOW_SIGNUP` env style). This is a planning/owner decision,
  not a stack addition.

**If per-session revocation-with-audit is wanted later:** add a nullable `revoked_at` column
via the existing `ensureColumn` machinery — additive, byte-identical second boot proven by
`test/migration.test.mjs`. Not needed for the milestone as scoped.

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| `node:crypto` aes-256-gcm API | Node ≥ 11 (crypto v1 API stable since); verified against Node v24.x docs | Project pins `node:24-alpine` in Dockerfile — no drift risk. |
| `node:sqlite` | Node ≥ 22.5 | Already the shipped DB layer. |
| `MASTER_KEY` envelope `v1:` format | Any future `v2:` | Prefix parse (`split(':')`) is the forward-compat hook. |

## Sources

- Context7 `/websites/nodejs_latest-v24_x_api` (crypto.html) — `createCipheriv` GCM key/IV
  sizes, `getAuthTag`/`setAuthTag` ordering, tamper→`final()` throws — **HIGH** (verified;
  matches shipped implementation exactly).
- `server.js` lines 72–262, 1391–1690, 2106 — existing MASTER_KEY, envelope, fail-closed,
  recovery-burn, session-revoke code — **HIGH** (direct code inspection).
- `totp.js` header contracts (D-04/D-09/D-51/D-54, T-16-07) — **HIGH** (direct code inspection).
- `package.json` / `Dockerfile` — Node 24, engines `>=24`, dev deps — **HIGH**.

---
*Stack research for: Gr8r Studio v1.4 Auth Completion*
*Researched: 2026-10-28*
