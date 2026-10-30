# Phase 19: TOTP Encryption Closure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-28
**Phase:** 19-TOTP Encryption Closure
**Areas discussed:** Boot migration policy, Decrypt boundary shape, 503 response contract, Migration placement

---

## Boot migration policy

| Option | Description | Selected |
|--------|-------------|----------|
| Defer migration | Loud warning, plaintext untouched, retry next boot when MASTER_KEY exists | ✓ |
| Abort boot | Refuse start until MASTER_KEY set — misconfigured env bricks the instance | |
| Defer + admin surface | Defer + persistent admin banner until migration succeeds | |

**User's choice:** Defer migration (Recommended)
**Notes:** —

### Backup failure (vacuum into fails)

| Option | Description | Selected |
|--------|-------------|----------|
| Skip migration | No backup = no mutation; retry next boot | ✓ |
| Proceed without backup | migrateTenancy's log-and-proceed behavior | |
| Abort boot | Hard precondition for touching user secrets | |

**User's choice:** Skip migration (Recommended)
**Notes:** Deliberately stricter than migrateTenancy.

### Edge rows (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Skip empty secrets | two_fa_enabled=1 with blank secret: encrypt nothing | ✓ |
| Skip invalid base32 | Non-base32 plaintext: log, don't wrap garbage | ✓ |
| Skip v1: rows | Already-envelope rows untouched — byte-identical second boot | ✓ |

**User's choice:** All three.

### Outcome surfacing

| Option | Description | Selected |
|--------|-------------|----------|
| Console only | Backup path, counts, deferred/failed rows — same as migrateTenancy | ✓ |
| Console + admin UI | Persistent banner until migration completes (extra scope) | |

**User's choice:** Console only (Recommended)

---

## Decrypt boundary shape

| Option | Description | Selected |
|--------|-------------|----------|
| Outcome wrapper | requireTotpSecret(envelope) → { ok, secret }; call sites branch + fail 503 | ✓ |
| Keep raw + convention | decryptTotpSecret stays null-returning; enforcement via tests only | |
| HTTP-coupled helper | Helper sends the 503 itself — couples crypto to HTTP | |

**User's choice:** Outcome wrapper (Recommended)
**Notes:** First ask returned all three options selected (ambiguous); re-asked, user picked the outcome wrapper.

### Proof mechanisms (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Grep-level test | Text-level assertion: no decrypt(x) ?? x / fallback pattern anywhere | ✓ |
| Behavioral 503 tests | Malformed / non-v1: / missing MASTER_KEY per call site → 503; non-2FA login unaffected | ✓ |
| Wrapper-exclusivity test | decryptTotpSecret referenced only by the wrapper | ✓ |

**User's choice:** All three.

### Helpers home

| Option | Description | Selected |
|--------|-------------|----------|
| server.js | Next to MASTER_KEY + existing pair and D-xx tags — single-file convention | ✓ |
| Extract to lib/ | Cleaner isolation but moves decision-tagged code out of server.js | |

**User's choice:** server.js (Recommended)

---

## 503 response contract

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse masterKeyMissing | Single existing code; config-missing and corrupt-envelope one triage path | ✓ |
| Split into two codes | Distinct corrupt-envelope code — more diagnostic precision, split triage | |

**User's choice:** Reuse masterKeyMissing (Recommended)

### Body copy

| Option | Description | Selected |
|--------|-------------|----------|
| Keep existing copy | Per-route variants verbatim; corrupt-envelope reuses them | ✓ |
| Unify to one string | Generic "not configured or undecryptable" everywhere | |

**User's choice:** Keep existing copy (Recommended)

---

## Migration placement

| Option | Description | Selected |
|--------|-------------|----------|
| Sibling of migrateTenancy | New migrateTotpEncryption() mirroring its shape; same boot sequence | ✓ |
| Inside migrateTenancy | Folded in — mixes concerns, entangles triggers | |

**User's choice:** Sibling of migrateTenancy (Recommended)

### Idempotency

| Option | Description | Selected |
|--------|-------------|----------|
| Trigger-gated no-op | Zero plaintext rows skips everything incl. backup — true byte-identical second boot | ✓ |
| Per-row conditional update | Naturally idempotent but creates a backup file every boot | |

**User's choice:** Trigger-gated no-op (Recommended)

### Test location

| Option | Description | Selected |
|--------|-------------|----------|
| Extend migration.test.mjs | Existing boot-migration suite gains the ENC-01 cases | ✓ |
| New test file | Cleaner separation if suite is tenancy-specific | |

**User's choice:** Extend migration.test.mjs (Recommended)

---

## the agent's Discretion

- Exact wrapper/trigger naming, console message wording, test structure within migration.test.mjs.

## Deferred Ideas

None — discussion stayed within phase scope.
