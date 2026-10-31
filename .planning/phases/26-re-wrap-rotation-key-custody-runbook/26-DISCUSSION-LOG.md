# Phase 26: Re-Wrap Rotation & Key-Custody Runbook - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-31
**Phase:** 26-re-wrap-rotation-key-custody-runbook
**Areas discussed:** v1 row key resolution, Rotation completion state, Re-wrap trigger condition, Runbook shape

---

## v1 row key resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Try current, then previous | Decrypt each v1 row with the current key first, then MASTER_KEY_PREVIOUS; handles mixed fleets without assumptions | ✓ |
| Previous key only | Assume every v1 row was sealed by the pre-rotation key; mis-handles v1 rows sealed by the current key | |
| Keyring order (implicit) | Try the keyring in insertion order; no explicit ordering rule, harder to test deterministically | |

**User's choice:** Try current, then previous (D-K8)

| Option | Description | Selected |
|--------|-------------|----------|
| Leave + warn | Row stays byte-identical, counted in boot summary (D-76 tone), never deleted | ✓ |
| Leave + warn + incomplete flag | Additionally refuse to declare rotation complete while undecryptable rows exist | |
| Delete orphans | Destructive — contradicts fail-closed philosophy | |

**User's choice:** Leave + warn (D-K9)

| Option | Description | Selected |
|--------|-------------|----------|
| Upgrade everything to v2 | All v1 rows become v2:<new-key-id>:…; uniform fleet after rotation | ✓ |
| Re-key in place, keep shapes | v1 rows re-encrypted but stay v1; keeps the v1 writer/reader alive forever | |
| Re-key only stale ids | Only touch rows whose key id doesn't match current; leaves mixed v1/v2 fleet permanently | |

**User's choice:** Upgrade everything to v2 (D-K10 — one-way)

---

## Rotation completion state

| Option | Description | Selected |
|--------|-------------|----------|
| Remove after verified boot | Runbook: remove MASTER_KEY_PREVIOUS after a verified rotation boot; keyring converges to one key (D-K1 end state) | ✓ |
| Keep PREVIOUS configured | Two keys stay live forever; old key remains attack surface | |
| Operator's choice | Both options offered; vaguer end-state | |

**User's choice:** Remove after verified boot (D-K11)

| Option | Description | Selected |
|--------|-------------|----------|
| Warn when PREVIOUS unused | Boot warns when MASTER_KEY_PREVIOUS is set but zero envelopes resolve under it | ✓ |
| No boot warning | Runbook is the only reminder | |
| Warn + verification step | Loud warning + SC-2 verification line | |

**User's choice:** Warn when PREVIOUS unused (D-K12)

| Option | Description | Selected |
|--------|-------------|----------|
| SQL count query | Documented SELECT counting stale/undecryptable rows; expected output 0 | ✓ |
| Boot summary only | Trust the summary line alone | |
| CLI/endpoint check | New surface area — beyond boot-time scope | |

**User's choice:** SQL count query (D-K13)

---

## Re-wrap trigger condition

| Option | Description | Selected |
|--------|-------------|----------|
| Auto every boot | Scans when both keys set; zero stale rows → byte-identical no-op (D-83 pattern); matches SC-1 literally | ✓ |
| Explicit env flag | MASTER_KEY_ROTATE=1; forgotten flag means rotation silently never happens | |
| Admin endpoint | Runtime trigger conflicts with boot-time keyring construction | |

**User's choice:** Auto every boot (D-K14)

| Option | Description | Selected |
|--------|-------------|----------|
| Sibling pass | migrateTotpReWrap() beside migrateTotpEncryption(), reusing D-74 backup + txn + D-76 summary shape | ✓ |
| Extend existing migration | One function; D-83 no-op condition tangles with rotation logic | |
| Unified rewrite | Generic envelope-convergence pass; rewrites proven Phase 25 code mid-milestone | |

**User's choice:** Sibling pass (D-K15)

| Option | Description | Selected |
|--------|-------------|----------|
| Same backup pool | projects-preenvelope-*.db naming + WR-02 prune cap (newest 5); pre-rotation backup IS the rollback artifact | ✓ |
| Separate prerotate naming | Two naming schemes in the runbook | |
| Separate + own prune cap | Most isolation, slightly more code | |

**User's choice:** Same backup pool (D-K16)

---

## Runbook shape

| Option | Description | Selected |
|--------|-------------|----------|
| Section in DEPLOY.md | "Key custody & rotation" section; one doc; matches KEY-04 wording literally | ✓ |
| Separate doc + link | More room but a second doc to maintain | |
| DEPLOY.md + appendix | Longest single doc | |

**User's choice:** Section in DEPLOY.md (D-K17)

| Option | Description | Selected |
|--------|-------------|----------|
| All concrete commands | openssl key gen, node -e key-id discovery, env snippet, verification query, expected boot lines | ✓ |
| Prose + reference commands | Operators must invent the sha256 key-id discovery D-K3 requires documented | |

**User's choice:** All concrete commands (D-K18)

| Option | Description | Selected |
|--------|-------------|----------|
| Main flow + compromise subsection | Stark subsection: rotation does NOT respond to compromise; full honest re-enrollment | ✓ |
| Two equal procedures | Equal weight may imply rotation is a valid compromise response | |
| Warning note only | Loses required operational detail | |

**User's choice:** Main flow + compromise subsection (D-K19)

---

## the agent's Discretion

- Ordering of migrateTotpReWrap() relative to migrateTotpEncryption() in the boot sequence
- Test seeding strategy (node:test on real SQLite per project convention)
- Exact boot summary/line wording (D-76/D-K7 tone)
- In-transaction re-check pattern for the re-wrap loop (D-75 mirror; WR-01/WR-02 shared-predicate discipline)

## Deferred Ideas

None — discussion stayed within phase scope.
