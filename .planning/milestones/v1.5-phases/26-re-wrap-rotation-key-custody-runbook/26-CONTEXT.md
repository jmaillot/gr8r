# Phase 26: Re-Wrap Rotation & Key-Custody Runbook - Context

**Gathered:** 2026-10-31
**Status:** Ready for planning

<domain>
## Phase Boundary

An operator can rotate MASTER_KEY by setting an env var and rebooting — no
2FA re-enrollment. A boot-time re-wrap pass converts every old-envelope
secret (v1 and stale-key v2) to `v2:<new-key-id>:…`, idempotent,
transactional, behind the existing pre-migration backup guarantee, with a
DEPLOY.md key-custody runbook covering the whole lifecycle: key generation
and injection, adding the new key alongside the old, running rotation,
verifying zero stale envelopes, backup-before-rotation, and the compromise
policy. Delivers KEY-03, KEY-04.

</domain>

<decisions>
## Implementation Decisions

Decision numbering continues the D-K sequence (D-K8…), per Phase 25
convention.

### v1 row key resolution
- **D-K8:** During a rotation boot, each v1 row's sealing key is resolved by
  trial: decrypt with the CURRENT key first, then MASTER_KEY_PREVIOUS.
  Handles mixed fleets (v1 rows sealed by the current key via the Phase 25
  plaintext migration) without assumptions. — **Reversibility:** reversible —
  local resolution logic inside the re-wrap pass.
- **D-K9:** Rows that decrypt under NEITHER keyring key are left
  byte-identical, counted, and warned in the boot summary (D-76/D-K7 tone).
  Never deleted, never guessed. Decrypt fails closed at runtime anyway.
  — **Reversibility:** reversible — no-op on the rows themselves.
- **D-K10:** The re-wrap pass upgrades EVERY old envelope to the v2 format —
  v1 rows are re-sealed as `v2:<new-key-id>:…` (not re-keyed in place as
  v1). After a completed rotation the fleet is uniformly v2 under one key
  id; no legacy shape remains to support. — **Reversibility:** one-way —
  once v1 rows are rewritten as v2, going back means re-sealing from
  plaintext or restoring the pre-rotation backup; the v1 shape is retired
  for those rows permanently.

### Rotation completion state
- **D-K11:** The runbook instructs removing MASTER_KEY_PREVIOUS after a
  verified rotation boot (zero stale envelopes confirmed), then rebooting.
  Converges the keyring to one key — D-K1's end state. Code stays tolerant:
  PREVIOUS set again later simply means another rotation.
- **D-K12:** The server nudges: a boot with MASTER_KEY_PREVIOUS set but
  ZERO envelopes resolving under it warns that rotation appears complete
  and PREVIOUS can be removed (D-73 warning tone). Prevents the variable
  from living forever forgotten.
- **D-K13:** SC-2's "zero stale envelopes — verified programmatically" is a
  documented SQL count query in the runbook: rows with two_fa_secret set
  that are neither v2-under-current-key-id nor decryptable under any
  keyring key; expected output `0`. The boot summary complements it but is
  not the verification artifact.

### Re-wrap trigger condition
- **D-K14:** The pass runs automatically on EVERY boot when both keys are
  configured (no operator flag, no endpoint). Zero stale rows → no backup
  file, no writes, byte-identical no-op — the same trigger-gated pattern as
  D-83. Matches SC-1's "one boot re-wraps" literally.
- **D-K15:** The re-wrap pass is a SIBLING of migrateTotpEncryption() —
  `migrateTotpReWrap()` beside it, reusing the D-74 backup → transaction →
  D-76 summary shape. Plaintext migration and re-key rotation stay clearly
  separated; migrateTotpEncryption() is not rewritten.
- **D-K16:** Re-wrap backups use the SAME `projects-preenvelope-*.db`
  naming and the WR-02 prune cap (newest 5). One backup convention to
  document; the pre-rotation backup IS the rollback artifact.
  — **Reversibility:** reversible — naming/retention policy.

### Runbook shape
- **D-K17:** The runbook is a "Key custody & rotation" section in DEPLOY.md
  (single doc, matches KEY-04's wording literally).
- **D-K18:** Every step is copy-pasteable: `openssl rand -hex 32` generation,
  a `node -e` one-liner for key-id discovery (sha256 first 8 hex — D-K3's
  requirement), docker-compose env snippet, the D-K13 verification query,
  expected boot log lines.
- **D-K19:** Compromise policy is a short, stark SUBSECTION under the main
  planned-rotation flow — not a co-equal procedure: rotation does NOT
  respond to a compromised key (the compromised key could have exported
  every secret); all users re-enroll 2FA honestly. Matches KEY-04's wording.

### the agent's Discretion
The user delegated these to the researcher/planner (lean guidance recorded):
- Exact ordering of migrateTotpReWrap() relative to migrateTotpEncryption()
  in the boot sequence (lean: re-wrap after the plaintext pass so new v1
  writes are immediately visible to it — or same boot ordering argument).
- Test seeding strategy (seed v1-under-previous, v2-under-previous,
  v2-under-current, undecryptable rows; node:test on real SQLite per
  project convention).
- Exact boot summary/line wording (match D-76/D-K7 reporting tone).
- In-transaction re-check pattern for the re-wrap loop (mirror the D-75
  re-check; shared predicate discipline from WR-01/WR-02 applies).

### Reversibility summary
- D-K8/D-K9/D-K11/D-K12/D-K13/D-K14/D-K15/D-K16/D-K17/D-K18/D-K19: reversible.
- D-K10: **one-way** — retires the v1 shape for rewritten rows; undo
  requires the pre-rotation backup or re-enrollment.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §KEY-03, KEY-04 — full requirement wording
  (incl. the compromise policy wording)
- `.planning/ROADMAP.md` §Phase 26 — goal and 4 success criteria (SC-1
  one-boot re-wrap, SC-2 idempotent no-op + zero stale envelopes, SC-3
  backup guarantee, SC-4 DEPLOY.md runbook)
- `.planning/PROJECT.md` §Milestone v1.5 — milestone context

### Prior-phase decisions this phase builds on
- `.planning/phases/25-keyring-version-aware-envelopes/25-CONTEXT.md` —
  D-K1 (two-key keyring, no chain), D-K2 (PREVIOUS without MASTER_KEY →
  boot fails), D-K3 (key id = sha256 first 8 hex; runbook documents id
  discovery), D-K4/D-K5 (frozen v2 format + strict id parsing), D-K6/D-K7
  (version-aware filter, unrecognized-version warning)
- `.planning/phases/25-keyring-version-aware-envelopes/25-REVIEW.md` +
  `25-REVIEW-FIX.md` — WR-01 (shared `/^v\d+:/i` predicate),
  WR-02 (JS predicate authoritative, prunePreenvelopeBackups cap)

### Code anchors
- `server.js:74-93` — keyring construction, MASTER_KEY_PREVIOUS, D-K2
  validation, duplicate-key-id warning
- `server.js:285-349` — encryptTotpSecret (v1/v2 writer) and
  decryptTotpSecret (v1 resolves against CURRENT key only — the constraint
  that forces D-K8)
- `server.js:1217-1232` — prunePreenvelopeBackups (WR-02 cap, reused per
  D-K16)
- `server.js:1243-1359` — migrateTotpEncryption(): D-82/D-83 trigger gate,
  D-73 defer, D-74 backup, D-75 in-txn re-check, D-76 summary — the shape
  migrateTotpReWrap() mirrors (D-K15)
- `server.js:1923` — enable path v2 writer (`encryptTotpSecret(pending.secret, 'v2')`)
- `DEPLOY.md` — where the runbook section lands (D-K17); no MASTER_KEY docs
  exist there yet

No external specs/ADRs — requirements fully captured in REQUIREMENTS.md and
decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- KEYRING map + keyIdFor() (server.js:81-93) — re-wrap targets the new key's
  id; the id discovery one-liner in the runbook mirrors keyIdFor()
- encryptTotpSecret(secret, 'v2') — the only writer the re-wrap pass needs
- decryptTotpSecret() v2 branch — keyring dispatch by id; the pass's
  trial-decrypt for v1 (D-K8) mirrors its key-derivation shape but must
  accept explicit key material (a decrypt-with-material helper is the
  likely shape — planner's call)
- D-74 backup block + prunePreenvelopeBackups — copy for the re-wrap pass
  (D-K16)
- Boot summary pattern (D-76/D-K7) — reporting tone for re-wrap outcomes

### Established Patterns
- Fail-closed everywhere; no plaintext fallback; undecryptable rows are
  counted + warned, never mutated destructively (D-K9)
- Trigger-gated no-op: zero eligible rows → no backup, no writes, no summary
  noise (D-83 → D-K14 idempotence)
- In-transaction re-check with the SAME shared predicate (D-75, WR-01/WR-02
  discipline — filter and re-check must not drift)
- node:test suites on real SQLite, no mocks

### Integration Points
- Boot sequence in server.js where migrations run (migrateTotpEncryption's
  caller) — the sibling pass slots beside it
- DEPLOY.md — new "Key custody & rotation" section (D-K17)
- The D-K12 unused-PREVIOUS warning naturally lives in/near the re-wrap pass
  (it knows the zero-resolved count)

</code_context>

<specifics>
## Specific Ideas

- The compromise-policy subsection must be stark and unmissable — "rotation
  alone is not sufficient" is the exact phrase KEY-04 uses; keep it.
- The runbook's key-id discovery one-liner should exactly reproduce
  keyIdFor() (sha256, first 8 hex, lowercase) so operator-derived ids match
  server-derived ids.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 26-Re-Wrap Rotation & Key-Custody Runbook*
*Context gathered: 2026-10-31*
