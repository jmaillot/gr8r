# Phase 32: Team-Derived Project Visibility - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-02
**Phase:** 32-Team-Derived Project Visibility
**Areas discussed:** Access-list fate, Predicate shape, Private + no-teams, 404-matrix extent

---

## Access-list fate

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as disjunct (Recommended) | Access-list term survives as additive disjunct; nobody loses access | ✓ |
| Replace with teams | Access list stops granting read for non-scoped members; existing projects would 404 | |
| Keep, deprecate in UI | Identical semantics plus a UI nudge toward teams | |

**User's choice:** Keep as disjunct (Recommended)
**Notes:** Follow-up: legacy private projects on access lists behave identically after VIS — "Unchanged" selected (no doc note, no UI push).

---

## Predicate shape

| Option | Description | Selected |
|--------|-------------|----------|
| Null-scope branch (Recommended) | Team term in hiddenFor's null-scope branch; Phase-29 scoped branch untouched | ✓ |
| Unify in scopeGrants | One predicate for all members; bigger blast radius against scope.test.mjs pins | |
| Shared helper term | New helper added as disjunct wherever invoked | (absorbed below) |

**User's choice:** Null-scope branch (Recommended)
**Notes:** Follow-up confirmed a single named helper (`teamIntersects`) consumed by both the funnel's null-scope branch and send-time surfaces ("Yes, shared helper"). Member's team set read live from `team_members` authority rows ("Authority rows, live").

---

## Private + no-teams

| Option | Description | Selected |
|--------|-------------|----------|
| Private stays gated (Recommended) | Empty-teams private project still gated by access list; not leaked | ✓ |
| Empty ⇒ workspace-wide | Privacy flag overridden for empty teams | |
| Split by privacy flag | (equivalent to option 1) | |

**User's choice:** Private stays gated (Recommended)
**Notes:** Predicate order confirmed: empty-teams first branch (public ⇒ workspace-wide / private ⇒ access list), then team-intersect, admin exemption on top; JIT zero-team fixtures pin it.

---

## 404-matrix extent

| Option | Description | Selected |
|--------|-------------|----------|
| Extend MATRIX sweep (Recommended) | Team-derivation cells across all families the sweep already covers | ✓ |
| Named routes only | Only doc GET + file side door | |

**User's choice:** Extend MATRIX sweep (Recommended)
**Notes:** The 29-REVIEW `serveFileBinary` normalizeProjects gap is folded into Phase 32 ("In scope").

---

## the agent's Discretion

- Helper naming/signature (`teamIntersects` suggested, not contractual)
- Fixture organization within the MATRIX structure
- How send-time surfaces obtain the member's team set

## Deferred Ideas

None — discussion stayed within phase scope.
