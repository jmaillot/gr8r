# Architecture Research — v1.4 Auth Completion integration

**Domain:** Self-hosted PM app (single-file Node server, node:sqlite, zero runtime deps) — auth-lifecycle completion features
**Researched:** 2026-10-28
**Confidence:** HIGH (codebase ground truth read directly from `server.js`; standards claims from OWASP ASVS 2.5/2.8, NIST SP 800-63B, RFC 6238 — web search was blocked by anti-bot, so external claims are from established standards knowledge, MEDIUM confidence)

## Critical Ground-Truth Correction (read this first)

The milestone brief says "two_fa_secret stored plaintext today" and implies disable-2FA is missing. **The code says otherwise.** Direct inspection of `server.js` (v1.3 shipped tree):

- `encryptTotpSecret()` / `decryptTotpSecret()` **already exist** (lines ~235–262): AES-256-GCM, `v1:<iv>:<tag>:<ct>` envelope, sha256-derived key from `MASTER_KEY`, fail-closed 503 `masterKeyMissing` (D-05/D-06) on both `/api/auth/tfa/enable` and `/api/auth/tfa/login`.
- A full disable route **already exists**: `POST /api/auth/tfa/disable` (line 1548) with password step-up, TOTP-or-recovery verification, distinct throttle budget (`tfa-disable|<userId>`, 5/15 min), atomic reset of `two_fa_enabled/secret/last_step` + recovery-code wipe, and MASTER_KEY fail-closed 503.
- `/api/auth/sessions` GET, per-row revoke and revoke-others exist — but **self-scoped only**. There is no route where one user revokes another's sessions, and no instance-admin concept beyond `ADMIN_EMAIL` first-run seeding and an `isAdminUser()` helper (line 356: user is owner/admin of ≥1 workspace).

**Implication:** the milestone scope must be re-derived from what planning verifies against this tree, not from the brief's framing. The genuinely missing pieces are: (1) plaintext-secret migration (for installs that enabled 2FA before the envelope — likely zero rows, but the migration must exist for safety), (2) recovery-code regeneration as a first-class route, (3) admin/operator session revocation across users, (4) e2e/i18n coverage of the existing disable flow. Each is small; the risk is in *integration details*, not new machinery.

## Recommended Architecture

### System Overview

```
┌────────────────────────── server.js route handlers (existing) ──────────────────────────┐
│  /api/auth/tfa/enroll · enable · disable (exists) · [NEW] tfa/recovery                  │
│  /api/auth/sessions (self) · [NEW] /api/admin/sessions (cross-user)                     │
│  /api/auth/login → login_challenges → /api/auth/tfa/login (unchanged)                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Helpers (existing → modified)                                                          │
│  encryptTotpSecret/decryptTotpSecret (exists)   · requireWorkspace / requireAuth         │
│  tooMany(key,n,ms) throttle budgets             · fail(res,code,status)                 │
│  [NEW] migrateTotpSecrets() in openDb()         · [NEW] admin-gate helper               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  node:sqlite (existing)                                                                 │
│  users.two_fa_*   sessions   recovery_codes   login_challenges   (no schema change       │
│  needed — all four features fit existing tables/columns)                                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities — new vs modified

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `encryptTotpSecret`/`decryptTotpSecret` | **exists, unchanged** | Envelope crypto; null on missing/undecryptable MASTER_KEY |
| `migrateTotpSecrets()` | **NEW** (in `openDb()`, after `ensureColumn` block) | One-time: any `users.two_fa_secret` not starting with `v1:` and non-empty → encrypt. Fail-closed semantics below |
| `POST /api/auth/tfa/recovery` | **NEW route** | Regenerate recovery codes: password step-up + live TOTP verification, burn-and-replace in one transaction |
| `POST /api/auth/tfa/disable` | **exists — verify, extend** | Planning checks the v1.3 Phase 16 disable contract (T-16-14) against the brief's expectations; likely gaps: recovery-code verification on disable when TOTP unavailable, e2e + i18n keys |
| `DELETE /api/admin/sessions` (+ GET list) | **NEW route(s)** | Operator-revoked sessions across users; admin-gated |
| admin-gate helper | **NEW** (small) | Decision required (see Admin section): `isAdminUser()` (any owner/admin anywhere) vs instance-admin only |
| `recovery_codes` table | **unchanged** | Regeneration is `delete where user_id` + reinsert inside the existing transaction pattern |
| `sessions` table | **unchanged** | Cross-user revoke is just `delete from sessions where user_id in (...)` — the mid-session 401 teardown from v1.3 Phase 14 already handles honest sign-out on revoked clients |
| i18n catalogues (EN+FR) | **modified** | New keys for regenerate + admin-revocation UI; `scripts/i18n-scan.mjs` build gate enforces |
| throttle budgets | **modified (add key)** | New budget for `tfa-recovery|<userId>`, same D-11 band (5/15 min) |

## Architectural Patterns

### Pattern 1: Envelope migration at boot (decrypt-then-reencrypt, with a fail-closed policy decision)

**What:** a `migrateTotpSecrets()` pass in `openDb()`: `select id, two_fa_secret from users where two_fa_enabled = 1 and two_fa_secret is not null and two_fa_secret not like 'v1:%'`, re-encrypt each. Because `encryptTotpSecret` returns null without `MASTER_KEY`, the migration must define behavior: recommended — **skip silently + log one warning** (leave the plaintext row in place; login/enable already fail-closed 503 per D-06, so the plaintext stays inert until the admin sets MASTER_KEY, at which point the next boot encrypts it). This preserves the project's "boot never mutates semantics unexpectedly" posture (the v1.2 decision that "the server never writes the locale at boot" is the analogous precedent — here a boot write is required, but it must be idempotent and never destructive).

**When to use:** always; guard it so second boot is a no-op (the `not like 'v1:%'` predicate delivers the byte-identical-second-boot guarantee the migration tests assert — extend `test/migration.test.mjs`).

**Trade-offs:** boot-time encryption couples DB mutation to MASTER_KEY presence. Alternative (lazy migration on next successful decrypt) spreads plaintext lifetime over time and is harder to test. Boot-time is preferred: testable, one pass, matches `migrateTenancy()` precedent.

```js
function migrateTotpSecrets(db) {
  const rows = db.prepare(
    "select id, two_fa_secret from users where two_fa_enabled = 1 " +
    "and two_fa_secret is not null and two_fa_secret != '' " +
    "and two_fa_secret not like 'v1:%'").all();
  if (!rows.length) return;
  if (!MASTER_KEY) { console.warn(`[auth] ${rows.length} plaintext TOTP secret(s); set MASTER_KEY to encrypt`); return; }
  const upd = db.prepare('update users set two_fa_secret = ? where id = ?');
  for (const r of rows) { const env = encryptTotpSecret(r.two_fa_secret); if (env) upd.run(env, r.id); }
}
```

### Pattern 2: Burn-and-replace regeneration = one transaction, step-up before it

**What:** `POST /api/auth/tfa/recovery`: require `two_fa_enabled`, verify current password (existing scrypt step-up helper from password-change and tfa/disable), then **live TOTP code** (not a recovery code — OWASP ASVS 2.5.3 posture: a code from the set being replaced must never authorize its own replacement). Inside one transaction: `delete from recovery_codes where user_id = ?` + insert N fresh hashed codes (same `generateRecoveryCode`/`recoveryHash` path as enable), return plaintext codes exactly once (the enable route's existing response shape `recoveryCodes: [...]` is the template).

**When to use:** after initial enrollment; UI shows codes once. Consider auto-regeneration hint when the client sees `recoveryRemaining: 0` (already returned by `/api/auth/tfa/login`).

**Trade-offs:** verifying TOTP requires `decryptTotpSecret` → the route inherits the MASTER_KEY fail-closed 503 (`masterKeyMissing`) automatically. That is correct and free — do not special-case it.

### Pattern 3: Cross-user session revocation as a thin extension of the self-revoke machinery

**What:** no new table, no new crypto. `GET /api/admin/sessions` (paginated list joined to `users`) and `DELETE /api/admin/sessions/:userId` (or `/api/admin/sessions` with a user list). Both reduce to existing `sessions`-table deletes; the v1.3 central mid-session 401 teardown (Phase 14) already makes revoked browsers sign out honestly, so the client side needs nothing new.

**The one real decision — who is "admin"?** The app has no instance-admin role; `ADMIN_EMAIL` only seeds the first account, and `isAdminUser()` means "owner/admin of ≥1 workspace". Options: (a) `isAdminUser()` gate — revocation is workspace-staff-like power over all users (too broad for a multi-tenant app?); (b) instance admin = the user matching `ADMIN_EMAIL` (needs an env lookup at runtime or a flag column); (c) both, with a new `is_instance_admin` boolean column (additive migration, fits the machinery). **Recommendation:** (b) or (c) — cross-user revocation is an operator power, not a workspace power; scope it to the instance operator. This must be settled in discuss-phase, not decided in a plan.

**Trade-offs:** an audit-trail question follows: revoking other people's sessions deserves an activity entry (machine verb, per the v1.2 activity decision) — `session_revoked_by_admin` in the target user's or a global log. Currently the activity log lives in workspace documents; instance-level revocation may have no workspace to log into. Simplest acceptable: log into the target user's workspaces, or skip the activity log and rely on server logs for v1.4.

## Data Flow

### Flow 1: plaintext → envelope (boot)

```
boot → openDb() → SCHEMA + ensureColumn (unchanged) → [NEW] migrateTotpSecrets(db)
   ├─ rows already 'v1:*' → no-op (byte-identical second boot ✓)
   ├─ no MASTER_KEY → warn, skip (existing fail-closed 503 still protects logins)
   └─ MASTER_KEY set → per-row encryptTotpSecret → update → next boot no-op
```

### Flow 2: regeneration

```
client POST /api/auth/tfa/recovery {password, code}
   → tooMany('tfa-recovery|'+uid, 5, 15min)  → sameOrigin check (Pitfall-22 order: gate first)
   → verifyPassword (step-up) → decryptTotpSecret (null ⇒ 503 masterKeyMissing)
   → verifyTotpCode ±1 window + replay guard (two_fa_last_step updated on success)
   → tx: delete recovery_codes(user) + insert 10 fresh hashed → return plaintext once
```

### Flow 3: admin revocation

```
admin DELETE /api/admin/sessions/:userId
   → admin gate (Pattern 3 decision) → tx: delete from sessions where user_id = :userId
   → victim's next authenticated call: no session row → central 401 teardown → honest sign-out UI (exists)
```

### Flow 4: disable (exists — verify only)

Existing route already: gate → budget → password step-up → decrypt → verify TOTP **or** burn a recovery code → tx reset of `two_fa_*` + recovery wipe → 503 `masterKeyMissing` before any mutation. Confirm it matches the brief's "proper verification" bar (does it allow recovery-code disable? — line 1575 suggests yes) and add missing e2e/i18n coverage.

## Integration Points

| Boundary | Communication | Notes |
|----------|---------------|-------|
| New routes ↔ throttle | `tooMany(key, 5, 15*60*1000)` | Reuse D-11 band constants; key by `userId` for cookie-auth routes (D-40/D-41 precedent), never by client-supplied identifier |
| New routes ↔ i18n gate | error `code` + English message | Client translates codes (ERR-01/02 machinery); add every new literal to EN+FR catalogues or `i18n-scan.mjs` fails the build |
| Migration ↔ test/migration.test.mjs | extend fixture | Prove: first boot encrypts, second boot byte-identical (same contract as AUTH-02) |
| Regeneration ↔ pendingTfa | none | Do not touch the in-memory pending map; regeneration operates only on enabled accounts |
| Admin revoke ↔ sessions table | plain delete | No token list response; victims discover revocation via existing 401 teardown |
| `--set-password` CLI | precedent | Cross-user session revoke already exists in CLI form (line 38); the HTTP route should behave identically server-side |

## Anti-Patterns

### Anti-Pattern 1: GCM without a version prefix or key-versioning plan
**What people do:** raw AES-256-GCM blob, key derived from a single env var forever.
**Why it's wrong:** a later key rotation forces a full decrypt/encrypt sweep with no way to tell which rows use which key.
**Do this instead:** keep the existing `v1:` prefix (already present) and, if rotation ever lands, bump to `v2:` — the migrate function's `not like` predicate generalizes per version. No work needed now beyond preserving the prefix discipline.

### Anti-Pattern 2: Migrating secrets lazily inside request handlers
**What people do:** re-encrypt on decrypt in every read path.
**Why it's wrong:** plaintext lifetime becomes unbounded (a user who never logs in stays plaintext forever), and writes scattered across handlers break the migration test contract.
**Do this instead:** one boot pass, one test.

### Anti-Pattern 3: Letting a recovery code authorize its own regeneration
**What people do:** accept "any second factor" as the step-up for regeneration.
**Why it's wrong:** an attacker who phished one recovery code burns it and mints ten fresh ones — the compromise becomes permanent.
**Do this instead:** password + live TOTP only (Pattern 2).

### Anti-Pattern 4: Admin revocation without a defined admin
**What people do:** gate the route on `isAdminUser()` because the helper exists.
**Why it's wrong:** in a multi-tenant app any workspace admin could log out every user on the instance — privilege inflation across tenant boundaries.
**Do this instead:** instance-operator gate (env-derived or a migrated flag column).

## Suggested Build Order (dependency-driven)

1. **MASTER_KEY migration first** — it touches `openDb()`, is testable in isolation against `migration.test.mjs`, and every later feature (disable verification, regeneration, login) inherits its fail-closed semantics. Do it before any route work so tests never see plaintext rows.
2. **Recovery-code regeneration second** — depends on (1)'s decrypt path and reuses the enable route's transaction/response shape; it is the smallest new route and warms up the step-up + throttle + i18n pattern.
3. **Disable-2FA verification/closure third** — mostly verification of what Phase 16-02 shipped plus e2e/i18n; benefits from (2) because the disable UI and regeneration UI are siblings on the settings 2FA card.
4. **Admin session revocation last** — independent of crypto but blocked on the *admin definition decision* (discuss-phase question); it should also consume the throttle/gate patterns established in (2).

## Scaling / Scope Notes

Not scale-relevant (single Docker image, node:sqlite, hundreds of users max). The only "scale" concern is operational: **MASTER_KEY is now load-bearing for every TOTP login** — losing it bricks 2FA for all users. `DEPLOY.md` must document: set it once, never rotate casually; a lost key means users must disable-2FA via recovery codes or an operator must clear `two_fa_*` (an escape-hatch CLI path worth considering explicitly). This is the single biggest non-code risk of the milestone.

## Sources

- Codebase ground truth (HIGH): `server.js` lines 72–345 (MASTER_KEY, SCHEMA, ensureColumn migrations, envelope crypto, pendingTfa), 1371–1740 (auth routes, budgets, disable, sessions), 356 (isAdminUser); `totp.js`; `.planning/PROJECT.md` v1.3 record.
- Standards (MEDIUM — web search blocked by anti-bot; from established knowledge of OWASP ASVS 2.5.3/2.8, NIST SP 800-63B AAL2, RFC 6238): TOTP-at-rest encryption, step-up verification on sensitive operations, single-use hashed recovery codes, session revocation semantics. Verify specific clause numbers during phase planning if citing externally.

---
*Architecture research for: Gr8r Studio v1.4 Auth Completion*
*Researched: 2026-10-28*
