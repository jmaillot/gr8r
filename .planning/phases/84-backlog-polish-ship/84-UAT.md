---
phase: "84"
status: in_progress
tests_total: 5
tests_passed: 0
tests_failed: 0
tests_blocked: 0
created: "2026-11-20"
---

# Phase 84 — UAT

## Tests

### Test 1: Searchable team picker — invite form (BP-01, D-01/D-02/D-03)

**Expected:** Open the invite form (Members → invite). The old teams chip-row is replaced by selected chips + a picker opener button. Clicking it opens a searchable modal (clone of the assignee picker): type to filter teams (accent-insensitive/folded), Enter adds the highlighted team AND KEEPS the input open (chip accumulates), Backspace removes the last chip (with empty query), Escape closes. "Done" applies the draft. The typed invite email field must NOT be wiped by picker open/confirm. Submit the invite — it goes through with the chosen teams.

**Result:** (pending)

---

### Test 2: Searchable team picker — member edit (BP-01, D-01/D-02)

**Expected:** In a member's drawer/modal → Access tab (NOT General), the teams field is the same searchable picker. Pick/apply updates the member's teams; submission works.

**Result:** (pending)

---

### Test 3: Tasks-table Columns button at phone width (BP-03, 57-UAT deferred)

**Expected:** At a phone viewport (~390×844), the tasks-table toolbar's Columns button shows icon-only (label collapsed, like the Sort/Group buttons) — no truncation. The popover still opens and toggles drive both the desktop table columns and the mobile card stack. At desktop width (≥901px) the label is visible again.

**Result:** (pending)

---

### Test 4: No horizontal overflow on main screens at phone width (BP-03 sweep, D-07)

**Expected:** At ~390×844, dashboard, members and governance render without horizontal scrolling (body scrollWidth ≤ viewport width).

**Result:** (pending)

---

### Test 5: Ship artifacts (D-09/D-11/D-13) — docs & version

**Expected:** docs/DEPLOY.md has an "Entra group mapping" section covering ApplicationGroup claim prerequisites, overage fallback pointer, dead-mapping runbook, old-slug 404 policy. CHANGELOG.md has dated 3.0.0 / 3.1.0 / 3.2.0 entries above 2.6.0. package.json version is 3.2.0.

**Result:** PASS (orchestrator-verified, static evidence — commit 1b217442 + 4cf10d42):
- docs/DEPLOY.md: "Entra group mapping" heading present; ApplicationGroup prerequisites (line 357); 7 overage mentions; dead-mapping runbook present (2 mentions); old-slug policy present (2 mentions)
- CHANGELOG.md: `## [3.2.0] — 2026-11-20`, `## [3.1.0] — 2026-11-20`, `## [3.0.0] — 2026-11-19` all above `## [2.6.0]`
- package.json: `3.2.0` (programmatic assert exit 0)

---

## Coverage notes

- Test 1 is the `unrun-verify` smoke item deferred from 84-02 (no e2e covers pickers).
- Tests 3–4 were also e2e-verified in-suite; UAT confirms visually on a real screen.
- Test 5 is static-file verification (can be checked by the orchestrator directly if preferred).
