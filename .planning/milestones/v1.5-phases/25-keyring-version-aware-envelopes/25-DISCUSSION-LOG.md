# Phase 25: Keyring & Version-Aware Envelopes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-31
**Phase:** 25-keyring-version-aware-envelopes
**Areas discussed:** Keyring depth, Key id derivation, Envelope layout, Unknown versions

---

## Keyring depth

| Option | Description | Selected |
|--------|-------------|----------|
| One previous key | Exactly MASTER_KEY + MASTER_KEY_PREVIOUS; matches roadmap SC-2; Phase 26 re-wrap closes multi-generation gaps | ✓ |
| Open-ended chain | MASTER_KEY_PREVIOUS, _2, _3… loaded until absent; more config surface, never asked for by roadmap | |
| Chain with cap | Arbitrary depth with hard cap + boot warning; belt and braces, more code | |

**User's choice:** One previous key (Recommended)
**Notes:** Follow-up edge case — MASTER_KEY_PREVIOUS set but MASTER_KEY missing →
selected "Fail boot (Recommended)" over "Warn + degraded".

---

## Key id derivation

| Option | Description | Selected |
|--------|-------------|----------|
| Hash-derived | key-id = first 8 hex chars of sha256(key material); no new env var, stable, fingerprint-only in DB | ✓ |
| Explicit env var | Operator sets MASTER_KEY_ID; human-meaningful but one more var to misconfigure | |
| Explicit + validated | Explicit id plus boot validation against derived hash; most robust, most code | |

**User's choice:** Hash-derived (Recommended)
**Notes:** Phase 26 runbook must document how to discover a key's id.

---

## Envelope layout

| Option | Description | Selected |
|--------|-------------|----------|
| v2:key:iv:tag:ct | Pure prefix insertion into the D-05 layout, same AES-256-GCM | ✓ |
| JSON envelope | base64-encoded JSON {v,kid,iv,tag,ct}; extensible but breaks colon convention | |
| Binary framed | Length-prefixed binary; no benefit over colon format | |

**User's choice:** v2:key:iv:tag:ct (Recommended)
**Notes:** Follow-up — parser key-id validation: selected "Strict charset
(Recommended)" — `[0-9a-f]{8}` enforced, non-conforming rows are undecryptable
→ existing fail-closed 503 path.

---

## Unknown versions

| Option | Description | Selected |
|--------|-------------|----------|
| Generic regex | Any `v<digits>:` prefix recognized as an envelope and skipped by the boot filter | ✓ |
| Known list | Enumerate v1, v2 only; unknown prefixes would be re-treated as plaintext (SC-1 forbids) | |

**User's choice:** Generic regex (Recommended)
**Notes:** Follow-up — unrecognized-version reporting: selected "Counted + warned
(Recommended)" — boot log reports skipped-row counts, D-73-style.

---

## the agent's Discretion

- Keyring/decrypt helper placement in server.js (beside D-05 helpers; D-77/D-79 boundary unchanged)
- Test file organization for the SC-1 negative proof
- Exact boot warning wording (match D-73 tone)
- MASTER_KEY_PREVIOUS validation placement in the boot block

## Deferred Ideas

None — rotation/re-wrap explicitly belongs to Phase 26.
