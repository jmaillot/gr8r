# Phase 19: TOTP Encryption Closure - Context

**Gathered:** 2026-10-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Every TOTP secret lives in the `v1:` AES-256-GCM envelope, and every decrypt path fails closed. Two deliverables (ENC-01, ENC-02):

1. **Boot-time migration** — legacy plaintext `users.two_fa_secret` rows are encrypted into the `v1:` envelope at boot, inside a transaction, with a pre-migration backup; second boot is a byte-identical no-op.
2. **Fail-closed decrypt closure** — every `decryptTotpSecret` call site routes through a single boundary wrapper; malformed/non-`v1:` secrets produce a fail-closed 503 on TOTP-verify/disable endpoints only, with grep-level proof no plaintext fallback exists.

New capabilities (key rotation, key-custody runbook) are explicitly out of scope — deferred in REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

### Boot Migration Policy
- **D-73:** MASTER_KEY missing at boot with plaintext rows → **defer migration**: loud console warning, plaintext rows untouched, normal boot; migration retries next boot when MASTER_KEY exists. (Fail closed at decrypt is the safety net meanwhile.) — **Reversibility:** reversible — deferral changes only whether the mutation happens this boot or a later one.
- **D-74:** Pre-migration backup failure (`vacuum into`) → **skip migration entirely this boot**, retry next boot. No backup = no mutation. Deliberately stricter than `migrateTenancy`, which logs and proceeds. — **Reversibility:** reversible — a skipped migration is retried automatically next boot.
- **D-75:** Edge-row rules (all three): skip empty/blank secrets; skip non-empty non-base32 values (log, never wrap garbage into an envelope — they fail closed at decrypt later); skip existing `v1:` rows (this is what makes the second boot byte-identical).
- **D-76:** Migration outcomes surfaced via **console only** (backup path, per-row count summary, deferred/failed rows) — same visibility model as migrateTenancy; no admin UI surface.

### Decrypt Boundary Shape
- **D-77:** Single outcome wrapper `requireTotpSecret(envelope)` in server.js returning `{ ok, secret }` / `{ ok: false }`; call sites branch on `ok` and fail 503. decryptTotpSecret is called only by the wrapper. — **Reversibility:** costly — every decrypt call site depends on the wrapper's shape.
- **D-78:** Proof mechanisms (all three): (a) grep-level test reading server.js as text asserting no `decrypt(x) ?? x` / plaintext-fallback pattern exists; (b) behavioral tests — malformed envelope, non-`v1:` value, missing MASTER_KEY at each call site → 503, and non-2FA login still works; (c) wrapper-exclusivity test — `decryptTotpSecret` referenced only by the wrapper (zero direct call sites).
- **D-79:** Wrapper lives in **server.js** next to MASTER_KEY and the existing encrypt/decrypt pair — single-file app convention; all D-xx decision tags live there. (totp.js stays pure TOTP math.)

### 503 Response Contract
- **D-80:** Reuse the single existing `masterKeyMissing` error code at every fail-closed 503 — config-missing and corrupt-envelope are one admin triage path. Zero client changes; error handling already wired on both surfaces.
- **D-81:** Keep the existing per-route body copy verbatim ("MASTER_KEY is not configured — 2FA cannot be verified/enabled until the admin sets it"); corrupt-envelope cases reuse the same strings. Do not unify to the generic disable-route string.

### Migration Placement
- **D-82:** New `migrateTotpEncryption()` as a sibling of `migrateTenancy()`, following its shape: conditional trigger → wal_checkpoint + `vacuum into` backup → transaction of updates → console summary. Called from the same boot migration sequence. Not folded into migrateTenancy (concerns stay separate). — **Reversibility:** costly — placement inside the boot sequence is load-bearing for the backup guarantee.
- **D-83:** Idempotency via **trigger-gated no-op**: trigger query counts rows where `two_fa_secret is not null and != '' and not like 'v1:%'` — zero rows skips everything including the backup. Second boot produces no backup file and no writes.
- **D-84:** ENC-01 tests extend the existing `test/migration.test.mjs` (already covers boot migrations): plaintext→v1: encrypt, second-boot no-op, backup-failure skip, MASTER_KEY-missing defer, edge-row cases.

### the agent's Discretion
- Exact wrapper/trigger naming, console message wording, test structure within migration.test.mjs — the agent has flexibility; decisions above fix behavior, not prose.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ground-truth code (server.js)
- `server.js:230–262` — `encryptTotpSecret` / `decryptTotpSecret` (D-05 envelope format `v1:<iv>:<tag>:<ct>`, sha256(MASTER_KEY) key; decrypt returns null on any failure — callers fail closed 503 per D-06)
- `server.js:948–970` — `migrateTenancy()` backup pattern (wal_checkpoint + `vacuum into`, timestamped filename under DATA_DIR) — the shape D-82 mirrors
- `server.js:1525–1536` — enable route: MASTER_KEY fail-closed before any state mutation
- `server.js:1563–1588` — disable route: decrypt + fail-closed `masterKey` outcome handling (the existing generic 503 string lives at ~1588)
- `server.js:1636–1652` — login-challenge decrypt call site (the other of the two call sites)
- `server.js:72–73` — MASTER_KEY definition

### Tests
- `test/migration.test.mjs` — existing boot-migration test suite to extend (D-84)

### Planning docs
- `.planning/REQUIREMENTS.md` § ENC-01/ENC-02 — locked requirement text; also lists deferred items (key-version envelope upgrade, DEPLOY.md key-custody runbook)
- `.planning/ROADMAP.md` Phase 19 details — success criteria this phase is verified against

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `encryptTotpSecret` / `decryptTotpSecret` (server.js:230–262): complete envelope machinery; migration needs only encrypt + the trigger query.
- `migrateTenancy()` backup recipe (server.js:948–970): wal_checkpoint + `vacuum into` snapshot pattern to copy.
- `verifyTotpCode` in totp.js — unaffected; TOTP math stays pure.
- Existing `masterKeyMissing` 503 plumbing on enable/verify/disable routes — D-80 reuses it as-is.

### Established Patterns
- D-xx decision tags as inline comments in server.js — new code should carry tags continuing the sequence (D-73…D-84 here).
- Boot migration sequence runs migrations unconditionally; each is internally trigger-gated for idempotency.
- Single-file app: crypto, migrations and routes all in server.js; lib/totp.js holds only pure math.

### Integration Points
- Boot migration call site — same place migrateTenancy() is invoked.
- The two decrypt call sites: login-challenge verification (~server.js:1641) and disable/step-up (~server.js:1568) — both swap to `requireTotpSecret`.
- `test/migration.test.mjs` — extend for ENC-01; ENC-02 proofs (grep/behavioral/exclusivity) follow the existing test conventions.

</code_context>

<specifics>
## Specific Ideas

- The migration must be **stricter than migrateTenancy**: backup failure skips migration (migrateTenancy proceeds). This asymmetry is intentional — user secrets demand the guarantee.
- "No backup = no mutation" and "skip, never wrap garbage" are the two safety invariants the user emphasized through option choices.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Key rotation re-enrollment and DEPLOY.md key-custody runbook remain deferred per REQUIREMENTS.md scoping.)

</deferred>

---

*Phase: 19-TOTP Encryption Closure*
*Context gathered: 2026-10-28*
