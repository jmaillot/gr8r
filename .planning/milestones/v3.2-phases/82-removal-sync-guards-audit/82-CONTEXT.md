---
phase: 82-removal-sync-guards-audit
discussed: 2026-11-20
status: decided
---

# Phase 82 Context: Removal Sync + Guards + Audit

<domain>
Lost group membership at login now removes only group-derived access, safely:
a single reconcile pass converts Phase 81's grant-only block into a full
diff engine (delete / downgrade / upgrade / no-op per workspace), routed
through a count-before-write owner guard. Manual/invite grants are immune.
Every group-driven delta is audit-logged with GUID + reason. Unmapped and
overage logins never remove anything.
</domain>

<spec_lock>
None — no SPEC.md for this phase.
</spec_lock>

<decisions>

## D-82-7: Provenance follows role (amends D-81-7)

When a group drives ANY role change on a membership row (Phase 81's upgrade,
Phase 82's downgrade), the row's provenance updates to `group:<guid>`. The
on-conflict clause in addMembership (and the reconcile's downgrade path) now
sets `provenance = excluded.provenance` — group logic owns the role it set.
Rows groups never touched keep their creation origin and stay immune to
downgrade forever.

**This is a deliberate amendment of D-81-7** ("provenance keeps the row's
ORIGINAL creation origin"): that rule made GS-03 undetectable — an invite row
group-upgraded to admin would have been permanently immune to downgrade while
carrying a group-set role. Executor note: update the Phase 81 comment at the
on-conflict site; the 81 test suite has a pin asserting provenance-preservation
on upgrade — that pin's expectation changes for the GROUP writer only (manual/
invite writers keep preserving origin).

## D-82-8: Owner guard only — operator flag structurally out of scope

Removal-sync never touches `is_instance_admin` (D-82-3 stands: grant-only, no
code path clears it). SC2's "last operator" clause is satisfied vacuously: the
`lastOperator` count guard (server.js:6841) is unreachable from group logic.
The guard funnel protects WORKSPACE OWNERS only (ownerCount before delete,
mirroring :7473). Document the unreachable-guard reasoning in the plan; no
defensive operator check, no operator sync.

## D-82-9: Audit GUID+reason via encoded action string

Zero schema change: group-driven deltas land in `audit_log` with the GUID and
reason encoded in the action string — e.g. `group_membership_removed:group:<guid>:lost-claim`,
`group_role_downgraded:group:<guid>:mapped-lower`. Format: `group_<delta>:group:<guid>:<reason>`
(split on first colon for Phase 83 rendering). Existing `operator_promoted`
row shape (Phase 81) is unchanged. `logSecurity` verbs stay verb-only heartbeat
entries (sso_group_grant etc. as today) — they are NOT the delta trail.

Reason vocabulary (fixed set, grep-able): `lost-claim`, `mapped-lower`,
`guard-refused`, `dead-workspace`, `archived-workspace`.

## D-82-10: One reconcile pass (never delete-then-reinsert)

Removal-sync is not a separate pass: Phase 81's grant block becomes a single
reconcile INSIDE the existing corridor (after identity resolution, before DP-5).
For each workspace where the user has a group-derived row (or a grant pending):

1. Compute mapped role (highest-role-wins via resolve(); none = no mapping).
2. Apply ONE delta in place: delete (no mapping + row is group-derived) /
   downgrade (mapped < current + current group-derived) / upgrade (mapped >
   current, Phase 81 rule) / no-op.
3. Owner guard runs count-before-write inside the same pass, BEFORE the delete:
   refusal → skip + logWarn loudly + audit `guard-refused` row — **login still
   succeeds** (GS-02 skip-and-audit).
4. Overage/unmapped = whole pass skipped: no grants AND no removals (SC5 /
   D-82-4 owner ruling (REQUIREMENTS) — overage never behaves as empty).

Byte-identical regression surface: users with no group-derived rows and no
pending grants produce zero writes, zero audit rows beyond sso_login.

## D-82-11: Uniform delta trail — grants included (GS-04 literal)

Phase 81's grant/upgrade paths convert from `logSecurity` verbs to encoded
`audit_log` rows in the D-82-9 format (`group_granted:group:<guid>:` /
`group_role_upgraded:group:<guid>:`). One uniform delta trail for ALL
group-driven changes: grants, upgrades, downgrades, removals, guard refusals,
skips. `logSecurity` keeps only the non-delta heartbeats (`sso_login`,
`sso_invite_accepted`). Executor note: update the Phase 81 tests that pin
`sso_group_grant`/`sso_group_role_change` security_log verbs — those pins move
to audit_log assertions. Operator self-grant keeps its existing
`operator_promoted` audit row (D-81-4 unchanged).

## Agent discretion

- Exact reconcile helper shape (extend Phase 81's grant helper vs sibling
  function) — single pass mandatory, structure free.
- Exact encoded-action spellings within the D-82-9 format.
- Guard refusal log wording (logWarn, loud, never fatal).
- Test file placement (extend test/groups-sso.test.mjs — the reconcile suite
  lives there now).
- Whether the delete path bypasses addMembership (it's an insert facade) and
  uses a direct guarded delete — likely yes; keep the tx boundary.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & rulings
- .planning/REQUIREMENTS.md — GS-01..04; owner rulings D-82-1..6
- .planning/ROADMAP.md §Phase 82 — success criteria 1–5

### Prior phase decisions (binding + one amendment)
- .planning/phases/81-group-grant-path-callback-wiring-provenance/81-CONTEXT.md —
  D-81-1..11 (grant corridor, upgrade-only, hybrid audit, fail-closed);
  D-81-7 amended by D-82-7 of THIS file
- .planning/phases/81-group-grant-path-callback-wiring-provenance/81-VERIFICATION.md —
  the live Phase 81 code anchors (grant block :5246–5311, guard :7473, etc.)

### Research
- .planning/research/ARCHITECTURE.md — Decision 3 (grant/reconcile diff table),
  guard composition, "group mapping grants is_instance_admin, never clears it"
- .planning/research/PITFALLS.md — overage-as-empty trap (SC5), audit expectations

### Code anchors (re-verify; +4 drift already applied in Phase 81)
- server.js:5246–5311 — the Phase 81 grant block (becomes the reconcile pass)
- server.js:4660 — addMembership on-conflict clause (provenance now follows role)
- server.js:7473 — owner-removal count guard (the shape to mirror)
- server.js:6841 — lastOperator guard (structurally unreachable, document)
- groups.js — resolve() contract unchanged
- test/groups-sso.test.mjs — suite home for reconcile tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 81 grant block + helper — the corridor exists; convert grant-only → diff
- provenance column + 8 stamped writers — GS-01's selection key is live
- resolve() highest-role-wins — the per-workspace target-role source
- audit_log row shape + db.tx discipline (AUD-01)
- Owner-removal guard at :7473 — count-before-write template

### Established Patterns
- Changes-only auditing (D-81-5) extends to removals/skips
- Fail-closed corridor (D-81-11) — reconcile throws still funnel to errorRedirect
- Guard refusal ≠ login failure: skip + logWarn + audit, login proceeds

### Integration Points
- Phase 83 renders the encoded actions (split on first colon)
- Phase 84 DEPLOY.md note unchanged

</code_context>

<specifics>
## Specific Ideas

- The load-bearing trick: D-82-7 makes provenance a ROLE-source tracker, not a
  creation log — GS-01's delete filter and GS-03's downgrade filter become the
  same predicate (`provenance like 'group:%'`).
- Guard-refused removals must be LOUD: logWarn + audit row + login succeeds —
  the operator console (Phase 83) surfaces the refusal.

</specifics>

<deferred>
## Deferred Ideas

- Mapping editor UI + dead-mapping console section — Phase 83 (GV-01..03)
- `label` XSS escape at first render — Phase 83 watch-item (carried)
- Graph overage fallback recipe — DEPLOY.md, Phase 84
- Any operator-flag clearing — permanently out of scope (D-82-3 owner ruling)

</deferred>

---

*Phase: 82-removal-sync-guards-audit*
*Context gathered: 2026-11-20*
