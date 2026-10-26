# Phase 13: Investigation & Invariant Pinning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-26
**Phase:** 13-Investigation & Invariant Pinning
**Areas discussed:** Pending-2FA mechanism, Secret encryption-at-rest, Throttle & lockout numbers, QR vendor pinning

---

## Pending-2FA mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| login_challenges table (Recommended) | New table (challenge_token_hash PK, user_id, expires_at ~5min, attempts). Sessions table stays pure = signed-in-or-nothing; 401 matrix almost free. Costs one guarded `create table`. | ✓ |
| Pending row in sessions | Add a `pending` column to `sessions`. One table fewer, but every `requireUser` read must filter `pending = 0` — one missed WHERE is the auth bypass. | |
| Stateless signed challenge | HMAC-signed stateless token in a temp cookie, no DB row. Can't count attempts or enforce single-use server-side without extra state. | |

**User's choice:** login_challenges table
**Notes:** —

### Invariant enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Structural (Recommended) | Separate `gf2f_pending`-style cookie name; `requireUser()` keeps reading only the session cookie. Pending = zero `sessions` rows → 401 everywhere. Proven by mandatory 401-matrix e2e. | ✓ |
| Structural + deny-list | Plus explicit challenge-cookie deny inside `requireUser()`. Belt-and-braces, but hides regressions rather than revealing them. | |

**User's choice:** Structural
**Notes:** —

### Challenge expiry/attempts

| Option | Description | Selected |
|--------|-------------|----------|
| 3 tries / 5 min (Recommended) | Dies after 3 wrong codes or ~5 minutes; throttle budget carries over from the password step. | ✓ |
| 3 tries / 2 min | Tighter fuse, less forgiving of slow humans / clock drift. | |
| Throttle only, no counter | In-memory budget alone polices attempts; resets on restart. | |

**User's choice:** 3 tries / 5 min
**Notes:** —

### Replay guard location

| Option | Description | Selected |
|--------|-------------|----------|
| Replay column on users (Recommended) | `last_used_step` on `users`, same migration as other 2FA columns — protects both login verify and settings verify paths. | ✓ |
| Replay on challenge only | Keyed to the login attempt; doesn't protect the settings-page verify path. | |

**User's choice:** Replay column on users
**Notes:** —

---

## Secret encryption-at-rest

| Option | Description | Selected |
|--------|-------------|----------|
| Encrypt under MASTER_KEY (Recommended) | AES-256-GCM under host-derived key. DB theft alone doesn't yield live TOTP secrets. Cost: one env var, ~30 lines of `node:crypto`. | ✓ |
| Plaintext, documented risk | No env var, no key management. DB leak = instant takeover of every 2FA account. | |
| Auto-generated sidecar key | Key stored next to the DB — protects nothing except a casual glance. | |

**User's choice:** Encrypt under MASTER_KEY
**Notes:** —

### Fail-closed behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Block 2FA, clear 503 (Recommended) | 2FA endpoints 503 naming the missing variable; enrollment blocked so no half-encrypted rows. Recovery codes survive (hash-only). | ✓ |
| Refuse to boot | Hard guarantee but bricks the app on an upgrade that loses the variable; dev/tests need a key always. | |
| Warn, plaintext fallback | Zero lockout risk but mixes encrypted and unencrypted rows. | |

**User's choice:** Block 2FA, clear 503
**Notes:** —

### Rotation policy

| Option | Description | Selected |
|--------|-------------|----------|
| Simple: re-enroll (Recommended) | Rotation = users with 2FA re-enroll via recovery code. Documented in DEPLOY.md. No MASTER_KEY_OLD machinery. | ✓ |
| MASTER_KEY_OLD re-encrypt | Boot re-encrypts old-key secrets under the new key; transparent but a second env var + more code in a no-feature phase. | |

**User's choice:** Simple: re-enroll — after asking "if i rotate it, everyone that has setup 2FA needs to do it again?"
**Notes:** User asked the rotation question in free text. Answered: yes with a single key, but recovery codes (hash-only) are the escape hatch either way; a MASTER_KEY_OLD design would avoid re-enrollment at the cost of extra machinery. User chose simple.

### Recovery code storage

| Option | Description | Selected |
|--------|-------------|----------|
| Hash only (Recommended) | `sha256` per code; leaked hash can't generate codes; recovery path must survive key loss. | ✓ |
| Encrypt them too | Uniform handling but couples the recovery path to MASTER_KEY availability. | |

**User's choice:** Hash only
**Notes:** —

### Dev/test/seed key handling

| Option | Description | Selected |
|--------|-------------|----------|
| Same rule everywhere (Recommended) | Absent key → 2FA 503 in all environments; tests use throwaway in-process keys; Phase 18 e2e uses a fixed dev key. | ✓ |
| Ephemeral key in dev | Auto-generate when not production; second code path for key-absent case. | |

**User's choice:** Same rule everywhere
**Notes:** —

---

## Throttle & lockout numbers

### Budgets

| Option | Description | Selected |
|--------|-------------|----------|
| 10/15m pwd, 5-8/15m codes (Recommended) | Password 10/15min (existing default); code endpoints 5-8 tries/15min, separate keys. Integer exactness at implementation. | ✓ |
| Strict: 3-5 per code endpoint | Maximal resistance; self-hosted users hit it on legitimate clock drift. | |
| Defer exact values | Decide in Phase 14/16 with test evidence; risks mid-build tuning the roadmap wanted fixed here. | |

**User's choice:** 10/15m pwd, 5-8/15m codes
**Notes:** —

### Throttle key

| Option | Description | Selected |
|--------|-------------|----------|
| IP + email (Recommended) | Standard compromise: IP alone locks out shared-bucket users; email alone lets botnets burn a victim's budget. | ✓ |
| Email only | Matches victim experience; botnet keeps victim permanently throttled. | |
| IP only | Simplest, matches current login throttle; CGNAT users lock each other out. | |

**User's choice:** IP + email
**Notes:** —

### Lockout UX

| Option | Description | Selected |
|--------|-------------|----------|
| Show wait time (Recommended) | Honest window reporting ("try again in 12 minutes") + Retry-After header. | |
| Generic message, no timing | Denies attackers confirmation of window expiry. | ✓ |
| Fixed '15 min' message | Simple, slightly dishonest on the short end. | |

**User's choice:** Generic message, no timing
**Notes:** Conscious override of the recommended honest-window option — attack-surface confirmation beat user convenience.

### State persistence

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory is enough (Recommended) | Existing `tooMany()` map; restart clears counters — accepted for single-process self-hosted. | ✓ |
| Persist to SQLite | Survives restarts; adds a write per failed attempt and cleanup queries. | |

**User's choice:** In-memory is enough
**Notes:** —

---

## QR vendor pinning

| Option | Description | Selected |
|--------|-------------|----------|
| qrcode.mjs verified (Recommended) | Vendor `dist/qrcode.mjs` (51 KB, verified live: MIT header, export default qrcode, ESM) into `src/lib/vendor/qrcode.js`, version+source header. `src/lib/qr.js` wraps matrix → inline SVG. | ✓ |
| Different library | e.g. nayuki's QR-Code-generator; reopens vendor QC for no identified gain. | |

**User's choice:** qrcode.mjs verified
**Notes:** File was fetched from unpkg during the discussion and its license header + ESM exports verified live.

### Rendering parameters

| Option | Description | Selected |
|--------|-------------|----------|
| ECC M, auto type (Recommended) | Level M (~15% recovery), auto typeNumber, quiet zone 4; scans reliably at ~132px. | ✓ |
| ECC H, denser matrix | ~30% recovery, denser matrix, harder for old cameras at small sizes. | |

**User's choice:** ECC M, auto type
**Notes:** —

### Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Fixture test + device UAT (Recommended) | Unit fixture (known otpauth URI → expected matrix) + Phase 18 real-device UAT as definitive. | ✓ |
| Device UAT only | Less test surface; regression would surface late. | |

**User's choice:** Fixture test + device UAT
**Notes:** —

---

## the agent's Discretion

- Exact throttle integers within the pinned ranges (D-11).
- 401-matrix endpoint enumeration strategy (Phase 17 test design).
- Unit-test file placement following existing `test/` conventions.
- Exact admin-facing 503 copy for the fail-closed message (D-06).
- The written diagnosis deliverable may cite the live code reads recorded in CONTEXT.md's
  `<code_context>` (`server.js:774-775`, `seed.js:509-514`, `actions.js:2371-2425`,
  `settings.js:408-421`) rather than re-deriving them.

## Deferred Ideas

None — discussion stayed within phase scope.
