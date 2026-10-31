# Phase 25: Keyring & Version-Aware Envelopes - Context

**Gathered:** 2026-10-31
**Status:** Ready for planning

<domain>
## Phase Boundary

The database can hold a `v2:` (or any `v<n>:`) envelope row without the boot
migration corrupting or re-wrapping it, and TOTP secrets written in the new
`v2:<key-id>:…` envelope decrypt by key id through a two-key keyring (current
`MASTER_KEY` + `MASTER_KEY_PREVIOUS`), all behind the unchanged `requireTotpSecret`
fail-closed contract. No rotation / re-wrap logic — that is Phase 26. Delivers
KEY-01, KEY-02.

</domain>

<decisions>
## Implementation Decisions

### Keyring depth
- **D-K1:** Exactly two keys in the keyring: current `MASTER_KEY` + one
  `MASTER_KEY_PREVIOUS`. No open-ended chain, no `_2`/`_3` variables — Phase 26's
  re-wrap pass closes multi-generation gaps. — **Reversibility:** reversible —
  extending to a chain later is additive config + a lookup loop.
- **D-K2:** `MASTER_KEY_PREVIOUS` set but `MASTER_KEY` missing/empty → boot fails
  loudly (fail-closed philosophy; a crypto phase without a current key is
  useless).

### Key id derivation
- **D-K3:** Key id is hash-derived — first 8 hex chars of sha256(key material).
  No new env var; ids are stable, unique per key, and never leak key material
  (only a fingerprint is stored in the envelope). Phase 26's runbook must
  document how to discover a key's id.

### Envelope layout
- **D-K4:** `v2:<key-id>:<iv>:<tag>:<ct>` — pure prefix insertion into the D-05
  layout, same AES-256-GCM. v1 and v2 differ only by the key-id field inserted
  after the version tag.
- **D-K5:** Parser validates the key-id field strictly as `[0-9a-f]{8}`; any
  non-conforming `v2:` row is undecryptable → the existing fail-closed 503
  `masterKeyMissing` path (no new error codes, no plaintext fallback).

### Version handling
- **D-K6:** The boot migration filter is version-aware by generic pattern — any
  `v<digits>:` prefix is recognized as an envelope and excluded from the
  plaintext re-wrap filter (SC-1: "proven by test before any v2-writing code
  exists"). Not a known-versions list.
- **D-K7:** The boot migration counts and warns about rows carrying unrecognized
  version prefixes (e.g. a `v3:` envelope before v3 decrypt support exists) —
  D-73-style boot reporting, skip silently never.

### the agent's Discretion
The user delegated these to the researcher/planner (lean guidance recorded):
- Where the keyring/decrypt helpers live in server.js (lean: beside the D-05
  helpers, keep `requireTotpSecret` as the single boundary — D-77/D-79 stay).
- Test file organization for the SC-1 negative proof (new version-aware filter
  tests vs extending existing suites).
- Exact boot log wording for the D-K7 warning (match D-73 reporting tone).
- Whether `MASTER_KEY_PREVIOUS` validation belongs in the same boot block as
  the existing MASTER_KEY check (D-06/D-73 area).

### Reversibility summary
- D-K1: reversible (additive config).
- D-K2: reversible (fail-fast behavior).
- D-K3: **one-way** — once v2 envelopes with hash-derived ids exist in the DB,
  changing the derivation breaks decryption of every existing v2 secret; the
  fix would be a re-enrollment or re-wrap migration.
- D-K4/D-K5: one-way for the same reason — the on-disk format is a data
  contract the moment a v2 row is written.
- D-K6/D-K7: reversible (filter logic local to boot).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §KEY-01, KEY-02 — full requirement wording
- `.planning/ROADMAP.md` §Phase 25 — goal and 4 success criteria (SC-1: version-aware filter proven by test before any v2-writing code exists)
- `.planning/ROADMAP.md` §Phase 26 — downstream consumer: rotation re-wrap reads the keyring + envelope format designed here
- `.planning/PROJECT.md` §Milestone v1.5 — milestone context

### Prior-phase decisions this phase builds on
- `.planning/phases/24-operator-audit-workspace-admin-tier/24-CONTEXT.md` — D-1xx decision-numbering convention; transaction/boot-block patterns
- `server.js:264-296` — D-05 envelope helpers (`v1:` AES-256-GCM, sha256 key derivation)
- `server.js:299-310` — D-77/D-79/D-80: `requireTotpSecret` single decrypt boundary + fail-closed 503 `masterKeyMissing` (signature unchanged per SC-4)
- `server.js:1140-1220` — boot migration: plaintext filter (`not like 'v1:%'`, line 1152), D-73 MASTER_KEY defer, D-74 backup, migration reporting
- `server.js:1782-1832` — enable/login paths branching on `requireTotpSecret` result (the fail-closed call sites that must not change)

No external specs/ADRs — requirements fully captured in REQUIREMENTS.md and decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- D-05 envelope helpers (server.js:264-296) — wrap/decrypt primitives; v2 wraps
  the same AES-256-GCM primitives with a keyring-resolved key
- `requireTotpSecret(envelope)` (server.js:304) — the unchanged decrypt
  boundary; its internals gain version dispatch + keyring lookup, signature and
  fail-closed contract stay
- Boot migration block (server.js:1140+) — filter + reporting patterns to extend

### Established Patterns
- Fail-closed everywhere; no plaintext fallback (D-06/D-77/D-80)
- sha256(key material) key derivation (D-05) — D-K3 extends this to ids
- Decision numbering continues (D-K ids used here; planner may renumber into
  the D-1xx sequence per project convention)
- node:test suites on real SQLite, no mocks; i18n not implicated (no UI)

### Integration Points
- Boot migration plaintext filter (server.js:1152) — becomes version-aware (D-K6)
- `requireTotpSecret` internals — version dispatch: `v1:` → current key (legacy),
  `v2:<kid>:…` → keyring lookup by id
- SCHEMA/env boot section — `MASTER_KEY_PREVIOUS` read + D-K2 validation

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Rotation/re-wrap explicitly
belongs to Phase 26.)

</deferred>

---

*Phase: 25-Keyring & Version-Aware Envelopes*
*Context gathered: 2026-10-31*
