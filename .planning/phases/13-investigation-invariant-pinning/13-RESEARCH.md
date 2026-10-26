# Phase 13: Investigation & Invariant Pinning - Research

**Researched:** 2026-10-26
**Domain:** Auth-hardening decision contracts — stub-root-cause verification, pending-2FA session mechanism, TOTP secret encryption-at-rest, throttle constants, QR vendoring, doc-field removal scoping
**Confidence:** HIGH

## Summary

Phase 13 is a **decision-groundwork phase**: no feature code ships. Its deliverable is a set of
written contracts that constrain Phases 14–18. Every technical question the phase must answer
was already converged during `/gsd-discuss-phase` (D-01…D-17 in CONTEXT.md) — this research's
job was to (1) re-verify the root-cause diagnosis against the live code this session, per the
in-repo value provenance rule, and (2) surface the implementation-shape details the planner
needs to turn each decision into tasks. **All root-cause claims re-verified by direct file
reads today; nothing rests on assumption.**

The verified root cause: auth state (sessions list, 2FA flag) lives as decorative fields in the
tenant-shared workspace JSON document — `emptyDoc()` writes `sessions: []` and `tfa: false`
([VERIFIED: server.js:774-775]), the settings page renders a pseudo-random 11×11 pixel grid as
the "QR" ([VERIFIED: src/pages/settings.js:410-417]), recovery codes are six hardcoded strings
([VERIFIED: src/pages/settings.js:408]), and the client mutates the doc locally — `revokeSession`
filters an array ([VERIFIED: src/actions/actions.js:2371-2375]) and `verify2fa` flips `D().tfa`
([VERIFIED: src/actions/actions.js:2408-2411]) — with **zero backend endpoints** for any of the
three flows (`/api/auth/*` has only login, logout, me GET/PATCH, signup — [VERIFIED:
server.js:1225-1315]). `seed.js` carries the same fake fields ([VERIFIED: src/data/seed.js:509-514]).

The pinned contracts are internally consistent and consistent with the existing machinery: the
`login_challenges` table reuses the guarded-create/`ensureColumn` migration style ([VERIFIED:
server.js:134-137]); the throttle constants plug into the existing in-memory `tooMany()`
([VERIFIED: server.js:1163-1173]); the D-02 "pending = anonymous" invariant is structural —
`requireUser()` reads only the session cookie ([VERIFIED: server.js:1134-1141]) and a
challenge under a different cookie name matches zero rows in `sessions`, so every endpoint
family 401s with no special-casing. The AES-256-GCM scheme (D-05…D-10) uses only
`node:crypto` primitives already documented in the milestone research. The QR vendor pin
(D-15) is checkable: `qrcode-generator@2.0.4` is the registry latest and MIT ([VERIFIED:
npm registry, 2026-10-26]), with the file-level license/ESM verification recorded live during
the discussion ([CITED: CONTEXT.md D-15]).

**Primary recommendation:** Ship Phase 13 as one documentation deliverable (a pinned-decisions
doc committed under `.planning/phases/13-*/`, e.g. `13-DECISIONS.md` or by extending RESEARCH
artifacts) whose content is D-01…D-17 plus the code-verified diagnosis, with task structure
organized per decision area (pending-2FA, crypto-at-rest, throttle, QR, doc-field removal
scoping) and a verification step per task = the decision is written, checkable, and cites its
code evidence. No `package.json` change, no runtime code change, no migration in this phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pending-2FA login mechanism**
- **D-01:** Pending second-factor state lives in a dedicated `login_challenges` table
  (`challenge_token_hash` PK, `user_id`, `expires_at`, `attempts`), created with the existing
  guarded-create pattern. The `sessions` table stays pure — signed-in-or-nothing. One-way
  decision (consumed by Phase 14 migration design AUTH-02 and the Phase 17 401-matrix test).
- **D-02:** The "pending = anonymous" invariant is enforced **structurally**, not by
  deny-lists: challenge lives under a separate cookie name, `requireUser()` keeps reading only
  the session cookie, a pending sign-in matches zero rows in `sessions` — every endpoint family
  answers 401 without special-casing. Proven by the mandatory 401-matrix e2e (Phase 17,
  Pitfall 15). No `if (challenge) deny` checks inside `requireUser()`.
- **D-03:** Challenge expiry/attempt rules: **3 wrong codes or 5 minutes, whichever first.**
  The `tooMany` throttle budget carries over from the password step — a fresh challenge never
  resets the attacker's clock.
- **D-04:** TOTP replay guard (last-used time-step counter) is a column on `users`, in the
  same migration as the other 2FA columns — it protects both the login verify path and the
  settings-page verify path.

**TOTP secret encryption-at-rest**
- **D-05:** **Encrypt.** `users.two_fa_secret` stores AES-256-GCM ciphertext under a key
  derived from a host-provided `MASTER_KEY`. Stealing `/data/gr8r.db` alone must not yield
  live TOTP secrets. One-way decision.
- **D-06:** Fail-closed on missing/undecryptable key: 2FA endpoints answer **503 with an
  admin-facing message naming the missing variable**; enrollment is blocked so no
  half-encrypted rows appear. Rest of the app boots and runs normally. No refuse-to-boot, no
  plaintext fallback. Already-enrolled users can still log in via recovery codes (hash-only).
- **D-07:** Key format: 32-byte hex (`openssl rand -hex 32`), documented in DEPLOY.md
  alongside the existing env block (`DEPLOY.md:142-157`). Ciphertext carries a `v1:` prefix.
- **D-08:** Rotation policy: **rotating `MASTER_KEY` means users with 2FA re-enroll**
  (recovery codes survive rotation — hash-only). No `MASTER_KEY_OLD` re-encrypt machinery.
  DEPLOY.md documents the consequence.
- **D-09:** Recovery codes stay **hash-only** (`sha256` per code) — never encrypted.
- **D-10:** Dev/test/seed use the **same fail-closed rule** as production: absent key → 2FA
  endpoints 503; unit tests set a throwaway key in-process; Phase 18 e2e starts the server
  with a fixed dev key. No ephemeral-key dev mode, no second code path.

**Throttle & lockout constants**
- **D-11:** Attempt budgets (existing in-memory `tooMany()`, `server.js:1163`): password step
  **10 tries / 15 min** (current default); each code endpoint (login 2FA verify, settings
  verify, recovery burn) **5–8 tries / 15 min** with a separate key per endpoint. Exact
  integers fixed at implementation within those bounds — no budget reset between password and
  2FA steps.
- **D-12:** Throttle key is **IP + email** combined, per endpoint.
- **D-13:** Lockout UX: **generic "too many attempts" message, no timing information, no
  `Retry-After` header.** Conscious override of the "show wait time" default — do not
  "improve" it to a countdown.
- **D-14:** Throttle state stays **in-memory** (per-process map). Restart clearing counters is
  an accepted trade-off; no write-per-attempt SQLite table.

**QR provisioning**
- **D-15:** Vendor **`qrcode-generator@2.0.4` `dist/qrcode.mjs`** (≈51 KB) into
  `src/lib/vendor/qrcode.js` with a header comment pinning version + source URL. Verified live
  during discussion: MIT license header intact (© Kazuhiko Arase), clean ESM
  (`export default qrcode` + named `stringToBytes`), Vite-compatible. `src/lib/qr.js` wraps
  it: boolean matrix → inline SVG, replacing the fake pseudo-random grid at
  `src/pages/settings.js:410`. Never hand-written.
- **D-16:** Rendering parameters: error correction level **M**, **auto** typeNumber,
  **quiet zone 4** modules in the SVG — scans reliably at the ~132 px display size.
- **D-17:** QR verification: a `qr.js` unit fixture test (known `otpauth://` URI → expected
  module matrix) catches encoding drift between Phase 16 and 18; the Phase 18 real-device UAT
  (Google Authenticator + one other app) remains the definitive check.

### the agent's Discretion

- Exact throttle integers within the ranges of D-11; the 401-matrix endpoint enumeration
  strategy; unit-test file placement following existing `test/` conventions; the exact
  admin-facing 503 copy for D-06.
- The written diagnosis deliverable (ROADMAP success criterion 1) is already satisfied by the
  verified code reads recorded in CONTEXT.md `<code_context>` — the researcher/planner may
  cite them rather than re-deriving them.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

(Related out-of-scope from REQUIREMENTS.md Future list, for planner awareness: encryption of
recovery codes, `MASTER_KEY_OLD` machinery, remember-me tiers, disable-2FA flow — all
deliberately excluded from v1.3.)
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stub-root-cause diagnosis | Documentation (`.planning/`) | — | Deliverable is written evidence; code is read, not changed |
| Pending-2FA mechanism design | API/Backend (`server.js` — design only) | Database (`login_challenges` schema) | Identity is server-derived; the contract constrains server.js schema + auth routes in Phases 14/17 |
| TOTP secret encryption-at-rest | API/Backend (`server.js` crypto helpers — design only) | Database (`users.two_fa_secret` layout) | Key lives in env (`MASTER_KEY`); ciphertext in DB; DEPLOY.md documents ops contract |
| Throttle constants | API/Backend (`tooMany()` call sites — design only) | — | In-memory per-process; constants pinned per endpoint |
| QR provisioning decision | Frontend (Vite build — design only) | In-repo vendored file | Encoder is a build-time-vendored ESM module, wrapped client-side; no runtime npm dep |
| Doc-field removal plan | Database + Frontend (design only) | API/Backend | `emptyDoc()`/`seed.js` (server-side doc shape) and settings page consume the fields; removal lands Phase 14 |

Nothing in this phase changes runtime behavior — every row above is a *design owner* note for
the consuming phase.

## Standard Stack

**No new dependencies in Phase 13** — zero runtime dependencies is a PROJECT.md core decision,
and this phase writes decisions, not code. The stack below is the pinned technology set the
decisions commit later phases to.

### Core
| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| `node:crypto` (Node ≥24) | v24.21.0 installed | TOTP HMAC-SHA1, `timingSafeEqual`, `randomBytes`, `aes-256-gcm` | Zero-dep invariant; TOTP is ~40–60 LOC safely hand-rolled; QR is NOT in this tier |
| `node:sqlite` (`DatabaseSync`) | Node 24 built-in | `login_challenges` table, additive migrations | Existing engine; guarded-create pattern proven |
| `qrcode-generator` (vendored file, NOT an npm dep) | 2.0.4 (registry latest, MIT) [VERIFIED: npm registry, 2026-10-26] | QR boolean matrix for TFA-02 | Single audited MIT ESM file; hand-rolling QR is the documented trapdoor (Pitfall 19) |
| node:test | Node built-in | Contract tests extended in later phases | Existing 35-file suite convention |

### Supporting
| Technology | Purpose | When to Use |
|------------|---------|-------------|
| `openssl rand -hex 32` | `MASTER_KEY` generation procedure (D-07) | Documented in DEPLOY.md; openssl 3.5.5 present [VERIFIED: local probe] |
| DEPLOY.md env block | `MASTER_KEY` documentation landing spot | Lines 142–157 hold the existing `GR8R_*` dotenv block [VERIFIED: DEPLOY.md:141-158] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `login_challenges` table (D-01) | Pending row in `sessions` (`pending_tfa` column — Pitfall 15 Option A) | Rejected: pollutes the pure session table, complicates every session query and the revocation primitive; dedicated table keeps "signed-in-or-nothing" |
| AES-256-GCM under `MASTER_KEY` (D-05) | Plaintext secret | Rejected (Pitfall 4): DB theft = permanent offline 2FA bypass |
| Vendored `qrcode-generator` (D-15) | `qrcode` / `otplib` npm runtime deps | Rejected: breaks zero-runtime-deps (PROJECT.md); `otplib@13` API churn; native canvas fallback risks the Docker image [CITED: .planning/research/SUMMARY.md] |
| In-memory throttle (D-14) | SQLite-backed attempt table | Rejected: write-per-attempt on the hottest security path for a single-process self-hosted deployment; restart-clears-counters accepted |

**Installation:** none this phase. Later phases install **nothing** — `qrcode-generator` is
vendored as a file, never `npm install`ed (Phase 16).

## Package Legitimacy Audit

> Phase 13 installs **no external packages** — the phase deliverable is decisions/documentation.
> The audit below covers the one package the phase's decisions pin for later vendoring.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| qrcode-generator | npm | long-established (2.x line current) | high (long-lived canonical QR encoder) | github.com/kazuhikoarase/qrcode-generator | OK | Approved — pinned at 2.0.4 (registry latest, MIT), vendored as a file in Phase 16, never installed |
| qrcode | npm | — | — | — | — | Not used (rejected alternative, not installed) |
| otplib | npm | — | — | — | — | Not used (rejected alternative, not installed) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*File-level vendor QC (license header intact, ESM wrapping, Vite compat) was performed live
during the discussion and is recorded in D-15; the planner should still make Phase 16's first
task re-verify the vendored file's header against the pinned source URL.*

## Architecture Patterns

### System Architecture Diagram

Target-state data flow the decisions pin (Phases 14–17 build this; Phase 13 only fixes it on
paper):

```
                    ┌────────────────────────────────────────────────────┐
                    │                    Browser (Vite)                  │
                    │  settings.js ──► actions.js ──► api.js             │
                    │      │                              │              │
                    │  src/lib/qr.js ◄── src/lib/vendor/qrcode.js        │
                    │  (SVG from boolean matrix)   (vendored MIT 2.0.4)  │
                    └──────┬─────────────────────────────┬───────────────┘
                           │ fetch                        │ fetch
                           ▼                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                             server.js (Node 24)                              │
│                                                                              │
│  POST /api/auth/login ──► scrypt verify ──► two_fa_enabled?                  │
│        (sameOrigin → readJson → tooMany(ip|email))     │                     │
│                                     no ──► sessions INSERT ──► session cookie│
│                                     yes ──► login_challenges INSERT ──►      │
│                                              challenge cookie (separate name)│
│                                                                              │
│  POST /api/auth/login/2fa ──► challenge cookie ──► challenge row lookup      │
│        │                                        (3 wrong codes / 5 min)      │
│        ├─ TOTP verify ──► users.two_fa_secret ──► AES-256-GCM decrypt ──┐    │
│        │                                        (MASTER_KEY, v1: prefix)│    │
│        │                            success ──► promote: sessions INSERT│    │
│        │                                        + challenge DELETE      │    │
│        └─ recovery code ──► sha256 hash compare ──► used_at flip (changes=1) │
│                                                                              │
│  requireUser(req) ──► session cookie ──► sessions row ──► user               │
│        (reads ONLY session cookie — challenge cookie is invisible here;      │
│         pending sign-in = zero sessions rows = 401 structurally)             │
│                                                                              │
│  MASTER_KEY absent/undecryptable ──► 2FA endpoints 503 (fail-closed D-06);   │
│                                       app boots normally                     │
└──────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
                 node:sqlite /data/gr8r.db
   users(+two_fa_*, recovery codes) · sessions (pure) · login_challenges
```

Entry point: password login → branch on `two_fa_enabled`. Decision point: pending challenge
never intersects the session table; the only promotion path is the 2FA verify endpoint.

### Recommended Project Structure

(What Phases 14–17 will create; pinned now so placement is not re-litigated.)

```
src/
├── lib/                  # NEW directory (does not exist today [VERIFIED: ls src/lib → absent])
│   ├── vendor/
│   │   └── qrcode.js     # D-15 vendored qrcode-generator@2.0.4 dist/qrcode.mjs, header-pinned
│   ├── qr.js             # D-15 wrapper: otpauth URI → boolean matrix → inline SVG
│   ├── totp.js           # Phase 16: node:crypto TOTP + Base32 codec
│   └── ua-labels.js      # Phase 14: UA → device label
server.js                 # schema additions, auth routes, crypto helpers (single-file server)
test/
├── migration.test.mjs    # byte-identical second-boot template (AUTH-02)
├── qr.fixture.test.mjs   # D-17 known-URI → expected matrix (Phase 16)
└── helpers/server.mjs    # per-test server + temp DB harness (never mock SQLite/HTTP)
```

### Pattern 1: Guarded create / ensureColumn migration (the only migration style allowed)

**What:** Additive schema changes guarded by existence checks; second boot performs zero writes.
**When to use:** Every Phase 14 schema addition, including `login_challenges`.
**Example:**

```js
// Source: [VERIFIED: server.js:134-137] — verbatim:
// function ensureColumn(conn, table, name, def) {
//   const cols = conn.prepare(`pragma table_info(${table})`).all();
//   if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
// }

// login_challenges follows the same guarded-create style as SCHEMA's `create table if not exists`
// (D-01). Proposed shape (Phase 14 task writes the real DDL):
// create table if not exists login_challenges (
//   challenge_token_hash text primary key,   -- sha256 of challenge cookie value
//   user_id              text not null references users(id) on delete cascade,
//   expires_at           integer not null,    -- now() + 5 min (D-03)
//   attempts             integer not null default 0  -- 3 wrong codes kills it (D-03)
// );
```

### Pattern 2: Structural "pending = anonymous" (D-02)

**What:** The challenge lives under a separate cookie name; `requireUser()` is untouched; a
pending sign-in has zero `sessions` rows, so 401 is the default behavior of every existing
endpoint — no deny-list, no `if (challenge)` branch.
**Why:** Structural enforcement cannot be bypassed by a missed endpoint; a deny-list fails
exactly when a new endpoint forgets the check. Pitfall 15's file-route
(`/w/:slug/file/:id`) and invite-accept consumers are covered automatically because they
resolve identity through the same session-cookie path.

### Pattern 3: AES-256-GCM envelope with versioned prefix (D-05/D-06/D-07)

```js
// Shape pinned by D-05..D-07 (Phase 16 implements). Layout, not literal code:
// key        = createHash('sha256').read()?  — NO: derive once, e.g.
//              crypto.createHash('sha256').update(Buffer.from(MASTER_KEY, 'hex')).digest()
//              (32-byte hex MASTER_KEY per D-07 → 32-byte AES-256 key)
// encrypt(): iv = randomBytes(12); cipher = createCipheriv('aes-256-gcm', key, iv)
//            ct = update(secretBuf) + final(); tag = getAuthTag()
//            store: 'v1:' + iv_hex + ':' + ct_hex + ':' + tag_hex   (D-07 v1: prefix)
// decrypt(): unknown prefix or throw → fail-closed 503 (D-06), never plaintext fallback
```

**Key-availability behavior (D-06/D-10), identical across prod/dev/test:** absent or
undecryptable key → 2FA endpoints (setup/verify/enrollment paths) answer 503 with an
admin-facing message naming `MASTER_KEY`; the rest of the app boots and runs; recovery-code
login still works (hash-only). Unit tests set a throwaway key in-process; Phase 18 e2e starts
the server with a fixed dev key.

### Pattern 4: Throttle call-site contract (D-11…D-14)

```js
// Source: [VERIFIED: server.js:1163-1173] tooMany(key, max = 10, windowMs = 15*60*1000)
// Source: [VERIFIED: server.js:1235] login already keys `${clientIp(req)}|${email}`
//
// Pinned contract per new endpoint (Phase 15/16/17 implement):
//   password step:        tooMany(`${ip}|${email}`)                        — max 10/15min (current default)
//   login 2FA verify:     tooMany(`2fa-login|${ip}|${email}`, 5..8)        — separate key, SAME budget NOT reset
//   settings 2FA verify:  tooMany(`2fa-verify|${ip}|${email}`, 5..8)       — separate key per endpoint
//   recovery burn:        tooMany(`recovery|${ip}|${email}`, 5..8)         — separate key per endpoint
//   signup precedent:     tooMany(`signup|${ip}`, 5, 60*60*1000)  [VERIFIED: server.js:1288]
// NEVER call attempts.delete(mid-flow) between password and 2FA steps (Pitfall 18).
// Generic 429 copy only — no Retry-After, no countdown (D-13).
```

### Anti-Patterns to Avoid

- **Deny-list pending checks in `requireUser()`:** D-02 forbids `if (challenge) deny` inside
  the identity path — enforcement must be structural (separate cookie, zero session rows).
- **Backfilling user data in the boot migration:** Pitfall 21 — columns/tables only; existing
  users get `tfa_enabled = 0` by absence, nothing generated per-user at boot.
- **Hand-rolling QR:** the current fake pseudo-random grid at settings.js:410 is exactly this
  failure mode; QR encoding (Reed-Solomon, masking, version selection) is never hand-written.
- **Encrypting recovery codes:** D-09 — hash-only, so the recovery path survives
  `MASTER_KEY` loss.
- **Resetting throttle budget mid-login:** one logical login = one budget (D-03/D-11,
  Pitfall 18).
- **`Retry-After` / countdown lockout copy:** explicitly overridden by D-13.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR encoding | A pixel grid / custom encoder (today's fake) | Vendored `qrcode-generator@2.0.4` (D-15) | Reed-Solomon ECC, masking, version selection — ~6 algorithm trapdoors |
| TOTP | An npm OTP library (otplib etc.) | ~40–60 LOC on `node:crypto` + RFC 4226 truncation | Zero-dep invariant; HMAC-SHA1 is exact in Node; libraries buy unwanted HOTP plumbing |
| Base32 | Node built-in (none exists) | ~20-line RFC 4648 codec with named alphabet constant + known-vector test | Node's encodings list has no base32; a tiny tested codec is the honest zero-dep answer |
| Constant-time compare | `===` on codes | `crypto.timingSafeEqual` (length-validate BEFORE — it throws on unequal lengths) | One-call fix; the most-cited TOTP review flaw |
| GCM AEAD | Custom encrypt-then-MAC | `createCipheriv('aes-256-gcm')` with auth tag | Never hand-roll authenticated encryption |

**Key insight:** the zero-deps constraint splits the work correctly — *crypto primitives*
(HMAC, AES-GCM, SHA, timingSafeEqual) are already built into Node and safe to compose by hand;
*data formats with trapdoors* (QR) are not, and get a vendored audited file instead.

## Runtime State Inventory

> Phase 13 changes no runtime state itself, but its diagnosis IS the inventory of stubbed
> runtime state that Phases 14–17 replace. Documented here so the planner has the complete
> picture with today's verification stamps.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Workspace JSON doc fields `sessions: []` and `tfa: false` in every workspace row (`emptyDoc()` server.js:774-775; seed data seed.js:509-514) — tenant-shared, client-mutable | Phase 14: remove doc fields (`emptyDoc()`, `seed.js`) + real per-user tables (AUTH-02); removal scoped to Phase 14 with byte-identical second-boot guarantee |
| Live service config | None — no external services hold auth state (single-process node:sqlite app) | None |
| OS-registered state | None — no cron/launchd/systemd registrations involved [VERIFIED: no scheduler references; app is `node server.js` in Docker per DEPLOY.md] | None |
| Secrets/env vars | New env var `MASTER_KEY` (32-byte hex, D-07) documented at DEPLOY.md env block lines 141-158 (existing block: `GR8R_HOST`, `APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `WORKSPACE_NAME`, `WORKSPACE_SLUG`, `PUID`, `PGID`, `ALLOW_SIGNUP`, `SEED_DATA`, `SESSION_DAYS`, `SECURE_COOKIE`, `TRUST_PROXY`, `MAX_BODY_BYTES`, `MAX_UPLOAD_MB` — verbatim, quoted this session) | Phase 16 lands DEPLOY.md documentation + D-08 rotation consequence |
| Build artifacts | None — no compiled/stale artifacts; zero-dep Vite build | None |

## Common Pitfalls

### Pitfall A: Pending-2FA session becomes an auth bypass (Pitfall 15 — the load-bearing one)
**What goes wrong:** A session cookie (or signed-in-looking 200 payload) issued before TOTP
verification makes the second factor decorative; every `requireUser` endpoint accepts a
password-only attacker.
**Why it happens:** Reusing the session mechanism for pre-2FA state is the path of least
resistance.
**How to avoid:** D-01/D-02 as pinned: dedicated `login_challenges` table, separate cookie
name, zero session rows until verify, `requireUser()` untouched. Mandatory 401-matrix e2e in
Phase 17 across every endpoint family.
**Warning signs:** Any code path returning an identity for a pending challenge; challenge
cookie inheriting `SESSION_DAYS` max-age; missing "POST /api/workspaces with pending challenge
→ 401" test.

### Pitfall B: Encryption decision leaks into a second code path (D-06/D-10)
**What goes wrong:** Dev-mode "ephemeral key" fallback or a silent-plaintext fallback creates
two code paths; tests then pass on a path production never takes.
**How to avoid:** One fail-closed rule everywhere: absent/undecryptable key → 503 on 2FA
endpoints, app boots fine, recovery codes still work. Unit tests set a throwaway key
in-process.
**Warning signs:** `NODE_ENV` branching in the crypto helper; a test that boots 2FA endpoints
without `MASTER_KEY` and expects success.

### Pitfall C: Throttle constants quietly diverge per endpoint (Pitfall 18)
**What goes wrong:** Each new endpoint picks its own key/max; a mid-flow `attempts.delete()`
resets the attacker's budget between password and 2FA steps.
**How to avoid:** D-11/D-12 constants table pinned now; one logical login = one budget;
separate key per code endpoint; IP+email composite.
**Warning signs:** A 2FA/recovery endpoint with no `tooMany(` call; `.delete(` near the login
handler between steps.

### Pitfall D: Doc-field removal drifts out of Phase 14
**What goes wrong:** `sessions`/`tfa` JSON fields survive past the schema work → shared-tenant
auth state ships wrong; the byte-identical no-op test can't cover what wasn't removed.
**How to avoid:** Success criterion 5 pins the plan to Phase 14: removal of `emptyDoc()`
fields (server.js:774-775) + `seed.js` fields (509-514) lands WITH the additive migration
(AUTH-02), extended `test/migration.test.mjs` (template at :188) proves no drift.
**Warning signs:** `tfa`/`sessions` keys still present in workspace JSON after Phase 14;
migration test diff missing.

### Pitfall E: QR vendor file drifts silently between Phase 16 and 18
**What goes wrong:** The vendored file gets edited/regenerated with different parameters and
the QR stops scanning on real devices, discovered only at final UAT.
**How to avoid:** D-17: `qr.js` fixture test (known `otpauth://` URI → expected module matrix)
runs from Phase 16 onward; Phase 18 real-device UAT (Google Authenticator + one other) is the
definitive check.
**Warning signs:** No fixture test in the Phase 16 plan; header comment missing version/source
URL.

## Code Examples

### Verified evidence inventory (the written diagnosis — success criterion 1)

Every claim below was re-verified by direct read this session (2026-10-26). The planner may
cite these verbatim; nothing needs re-derivation.

**1. `sessions` table — the revocation primitive's ground truth** [VERIFIED: server.js:95-100]:
```sql
create table if not exists sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at integer not null,
  expires_at integer not null
);
```
(create index `sessions_expiry on sessions(expires_at)` at :101.)

**2. The stub root cause — fake fields in the shared doc** [VERIFIED: server.js:774-775]:
```js
        sessions: [],
        tfa: false,
```
Mirrored in seed data [VERIFIED: src/data/seed.js:509-514]:
```js
    sessions: [
      { id: 'se1', dev: 'MacBook Pro · Chrome', loc: 'San Francisco, US', at: 'Active now', cur: true },
      { id: 'se2', dev: 'iPhone 15 · Gr8r app', loc: 'San Francisco, US', at: '2 hours ago' },
      { id: 'se3', dev: 'Windows · Edge', loc: 'Oakland, US', at: 'Sep 12' },
    ],
    tfa: false,
```

**3. Client-side-only mutations (no backend exists)** [VERIFIED:
src/actions/actions.js:2371-2375 and 2408-2411]:
```js
A.revokeSession = el => {
  mutate(() => {
    D().sessions = D().sessions.filter(s => s.id !== el.dataset.id);
  });
  ...
      mutate(() => {
        D().tfa = true;
        S.ui.tfaSetup = false;
      });
```
`savePassword` (2351-2370) is a client-side validation + `loadingBtn` fake delay + toast —
no API call.

**4. Fake QR renderer** [VERIFIED: src/pages/settings.js:410-417]: an 11×11 grid of `<i>`
elements where the "on" pattern is `(i * 7919) % 13 < 6` (pseudo-random) with hardcoded
finder-square coordinates — not a QR code. Hardcoded recovery codes at :408:
`['7KQ2-M8PX', 'D4TN-9WRE', 'HV3C-QZ6L', 'P2YB-J7SK', 'R9FG-4NUD', 'X6MA-T3HE']`.

**5. The complete `/api/auth/*` surface** [VERIFIED: server.js:1225-1315]:
`POST /api/auth/login` (:1225, sameOrigin → readJson → `tooMany(`${clientIp(req)}|${email}`)`
→ scrypt verify vs `DUMMY_HASH` → sessions insert → `setSessionCookie`),
`POST /api/auth/logout` (:1255), `GET /api/auth/me` (:1262, 200-with-null probe),
`PATCH /api/auth/me` (:1270, locale-only mass-assignment guard), `POST /api/auth/signup`
(:1283). **No sessions-list, revoke, password-change, or 2FA endpoints exist.**

**6. `requireUser` — the identity path D-02 must not change** [VERIFIED:
server.js:1134-1141]:
```js
function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    fail(res, 401, 'signInRequired', 'Sign in to continue');
    return null;
  }
  return user;
}
```
`currentUser` joins `sessions`→`users` on `token_hash = sha256(cookie)` with
`expires_at > now()` ([VERIFIED: server.js:1125-1131]) — per-request DB derivation, no cache.

**7. The throttle primitive** [VERIFIED: server.js:1163-1173]:
```js
function tooMany(key, max = 10, windowMs = 15 * 60 * 1000) {
  const t = now();
  const row = attempts.get(key);
  if (!row || t > row.reset) {
    attempts.set(key, { n: 1, reset: t + windowMs });
    if (attempts.size > 5000) for (const [k, v] of attempts) if (t > v.reset) attempts.delete(k);
    return false;
  }
  row.n += 1;
  return row.n > max;
}
```

**8. Migration machinery + no-op guarantee template** [VERIFIED: server.js:134-137 (quoted in
Pattern 1); test/migration.test.mjs:188-196]:
```js
test('a second boot is a no-op and both accounts keep access', async () => {
  const firstBoot = snapshot();
  await server.stop();
  ...
  server = await startServer({ dataDir });
  const secondBoot = snapshot();
  assert.deepEqual(secondBoot, firstBoot, 'no slug/doc/member_id/revision drift');
  assert.equal(secondBoot.backups.length, 1, 'no second backup');
```

**9. DEPLOY.md env block — `MASTER_KEY` documentation lands beside this**
[VERIFIED: DEPLOY.md:141-158] (verbatim keys): `GR8R_HOST`, `APP_URL`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_NAME`, `WORKSPACE_NAME`, `WORKSPACE_SLUG`, `PUID`, `PGID`,
`ALLOW_SIGNUP`, `SEED_DATA`, `SESSION_DAYS`, `SECURE_COOKIE`, `TRUST_PROXY`,
`MAX_BODY_BYTES`, `MAX_UPLOAD_MB`.

**10. `src/lib/` does not exist** [VERIFIED: `ls src/lib` → absent] — D-15's
`src/lib/vendor/qrcode.js` and `src/lib/qr.js` create a new directory in Phase 16.

### otpauth URI contract (pins TFA-02's QR content)

[CITED: Google Authenticator KeyUriFormat wiki, via .planning/research/PITFALLS.md Pitfall 7]
Build with `new URL()` + `searchParams`: label `<issuer>:<accountName>` percent-encoded,
`secret` uppercase base32, `issuer=Gr8r`, `algorithm=SHA1`, `digits=6`, `period=30` — all
explicit (Authy refuses/warns on absent params). Fixture-vector test per D-17.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `qrcode-generator` 1.x (CommonJS/UMD) | 2.0.4 ships clean ESM (`dist/qrcode.mjs`) | 2.x line | Vite-importable without interop shims — D-15's pin is the modern artifact |
| `otplib@12` (deprecated presets) | `otplib@13` full rewrite | 2023+ | API churn; still rejected here (zero-deps) |
| Optional TOTP-secret encryption | Encrypted-at-rest as the honest default for self-hosted | OWASP guidance drift | D-05 encodes the strict option, with fail-closed semantics |

**Deprecated/outdated:** none adopted — the zero-deps posture means no library versions move
underneath the project; only the vendored file is pinned, and D-17's fixture test detects drift.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `login_challenges` DDL column list in Pattern 1 (`challenge_token_hash`, `user_id`, `expires_at`, `attempts`) matches D-01's intent; exact DDL is written in Phase 14 | Architecture Patterns | Cosmetic — planner may adjust names within D-01's four fields |
| A2 | The AES-GCM envelope layout in Pattern 3 (`v1:iv:ct:tag`, hex segments) is a faithful rendering of D-07's "`v1:` prefix so the algorithm/layout can evolve" — the exact serialization is an implementation choice | Architecture Patterns | Low — prefix contract is what's pinned; segment format may differ |
| A3 | "No scheduler/OS-registered state" in the Runtime State Inventory (inferred from the single-process Docker deployment shape described in DEPLOY.md, not an exhaustive host audit) | Runtime State Inventory | Low — phase changes no runtime state regardless |
| A4 | `qrcode-generator` package age/download counts described qualitatively (long-established, high) from its canonical status; registry version/license verified today but npm stats not pulled | Package Legitimacy Audit | None — vendored file is additionally QC'd at Phase 16 start |

All other claims carry `[VERIFIED]` or `[CITED]` tags with sources.

## Open Questions

1. **Where does the pinned-decisions document live?**
   - What we know: The deliverable is the D-01…D-17 contracts + verified diagnosis. CONTEXT.md
     already holds them; RESEARCH.md now holds the verified evidence.
   - What's unclear: Whether the planner emits a separate `13-DECISIONS.md` or treats
     CONTEXT.md + RESEARCH.md as the deliverable of record.
   - Recommendation: Treat CONTEXT.md `<decisions>` + this RESEARCH.md's verified-evidence
     inventory as the deliverable; no separate doc unless the planner wants one canonical
     citation target for later phases. Low-stakes either way.

2. **Exact integers within D-11's 5–8 band.**
   - What we know: The agent's discretion covers the exact values, fixed at implementation.
   - What's unclear: Which of 5/6/7/8 per endpoint.
   - Recommendation: Default to 5 for recovery burn (highest entropy value per guess), 8 for
     TOTP verify (legitimate ±1-window retry headroom), decided in Phase 16/17 plans.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥24 | `node:sqlite`, `node:crypto`, node:test | ✓ | v24.21.0 | — |
| openssl | `MASTER_KEY` generation procedure (D-07) | ✓ | 3.5.5 | `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` |
| Vite | Vendor ESM import (Phase 16) | ✓ | ^6.4.4 | — |
| Playwright | Phase 17 401-matrix, Phase 18 e2e | ✓ | ^1.64.1 (devDep) | — |
| npm registry access | Version pin verification only | ✓ | — | Pinned file vendoring needs no registry at build time |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node built-in), `--test-concurrency=2`; Playwright for e2e |
| Config file | none needed for node:test (`node --test test/*.test.mjs`); `e2e/playwright.config.mjs` |
| Quick run command | `node --test test/migration.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

Phase 13 has no requirement IDs and ships no runtime code — its verification is documentation
review, not tests. The contracts it pins are validated in the phases that implement them:

| Pinned contract | Consuming phase | Test Type | Automated Command |
|-----------------|-----------------|-----------|-------------------|
| D-01/D-02 pending=anonymous | Phase 17 | e2e (401-matrix) | `npm run e2e` (new matrix spec) |
| D-03 challenge 3-codes/5-min | Phase 17 | integration | `node --test test/login-challenge.test.mjs` (new) |
| D-05…D-10 crypto/fail-closed | Phase 16 | unit/integration | `node --test test/totp.test.mjs` (new) |
| D-11…D-14 throttle | Phase 16/17 | integration | included in endpoint test files |
| D-15…D-17 QR | Phase 16 | unit fixture | `node --test test/qr.fixture.test.mjs` (new) |
| Doc-field removal + byte-identical boot | Phase 14 | integration | `node --test test/migration.test.mjs` (extended) |

### Sampling Rate
- **Per task commit:** `npm run lint && npm run format:check` (docs-only phase; no test impact)
- **Per wave merge:** `npm test` (must stay green — phase adds no code)
- **Phase gate:** full suite green; the decisions doc reviewed against CONTEXT.md D-01…D-17

### Wave 0 Gaps
- None — Phase 13 introduces no code requiring new test infrastructure. Existing 35-file
  suite covers the no-regression gate.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | TOTP per RFC 6238 (±1 window, replay counter D-04, `timingSafeEqual`), recovery codes hash-only (D-09), scrypt existing |
| V3 Session Management | yes | Opaque DB-backed tokens (existing), structural pending=anonymous (D-02), `sessions` purity (D-01) |
| V4 Access Control | yes | `requireUser`/`requireWorkspace` unchanged; challenge cookie invisible to identity path |
| V5 Input Validation | yes | Existing `readJson` size guard, mass-assignment guards; challenge token length/charset validation before compare |
| V6 Cryptography | yes | `node:crypto` only — AES-256-GCM (D-05), `randomBytes` tokens, `timingSafeEqual`, never hand-rolled primitives |
| V7 Error/Logging | partial | Generic throttle copy (D-13), one undifferentiated `invalidRecoveryCode` code (Pitfall 16/17 — no oracle) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pending-2FA bypass (password alone authenticates) | Elevation of Privilege | D-01/D-02 structural separation + 401-matrix e2e |
| Offline 2FA bypass via DB theft | Information Disclosure | AES-256-GCM under `MASTER_KEY` (D-05), fail-closed (D-06) |
| Recovery-code brute force / oracle | Spoofing | Hash-only storage (D-09), single-use `changes` check, per-endpoint throttle (D-11), one error code |
| Lockout-window disclosure | Information Disclosure | Generic message, no `Retry-After` (D-13 — user override of convenience) |
| CGNAT shared-bucket lockout / botnet budget burn | Denial of Service | IP+email composite key (D-12) |
| CSRF on new auth mutations | Tampering | `sameOrigin` guard-first pattern (existing at server.js:1228/1286) — contract for every Phase 15–17 endpoint |

## Sources

### Primary (HIGH confidence)
- Direct reads this session (2026-10-26): `server.js` (:84-163 SCHEMA/ensureColumn, :745-804
  transaction/emptyDoc, :1125-1199 requireUser/tooMany, :1225-1339 auth routes);
  `src/pages/settings.js` :370-429; `src/actions/actions.js` :2351-2430;
  `src/data/seed.js` :495-528; `test/migration.test.mjs` :170-207; `DEPLOY.md` :135-164;
  `package.json`; `.planning/config.json`
- `.planning/research/SUMMARY.md` and `.planning/research/PITFALLS.md` — milestone research,
  all claims code-read-backed (HIGH confidence)
- `.planning/phases/13-investigation-invariant-pinning/13-CONTEXT.md` — D-01…D-17 decisions

### Secondary (MEDIUM confidence)
- npm registry (`npm view qrcode-generator`) — version 2.0.4 = latest, MIT [VERIFIED today]
- RFC 6238 §5.2 / RFC 4226 §5.3 / RFC 4648 / Google Authenticator KeyUriFormat wiki
  [CITED: via PITFALLS.md, grounded in the milestone research]

### Tertiary (LOW confidence)
- None — no claim in this document rests on unverified web search.

## Metadata

**Confidence breakdown:**
- Decisions/contracts: HIGH — every load-bearing code claim re-verified by direct read this
  session with verbatim quotes; decisions are user-locked, not research guesses
- Root-cause diagnosis: HIGH — stub evidence (doc fields, fake QR, client-only mutations,
  endpoint absence) all read live today
- Implementation-shape details (DDL, envelope layout, key derivation): MEDIUM — faithful
  renderings of locked decisions, exact serialization is implementation discretion (A1, A2)

**Research date:** 2026-10-26
**Valid until:** 2026-11-25 (30 days — decisions are stable; code underpinning is the v1.2
shipped state and won't move until Phase 14 executes)
