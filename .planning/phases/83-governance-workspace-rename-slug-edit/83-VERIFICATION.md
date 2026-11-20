---
phase: 83-governance-workspace-rename-slug-edit
verified: 2026-11-20T16:05:00Z
status: human_needed
score: 11/16 must-haves verified
behavior_unverified: 5
overrides_applied: 0
covered_files:
  - .planning/phases/83-governance-workspace-rename-slug-edit/83-01-PLAN.md
  - .planning/phases/83-governance-workspace-rename-slug-edit/83-02-PLAN.md
  - .planning/phases/83-governance-workspace-rename-slug-edit/83-01-SUMMARY.md
  - .planning/phases/83-governance-workspace-rename-slug-edit/83-02-SUMMARY.md
  - server.js
  - src/core/api.js
  - src/pages/governance.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/locales/de.json
  - src/locales/es.json
  - test/governance-rename.test.mjs
  - test/governance-client.test.mjs
  - test/i18n-toast.test.mjs
covered_digest: "v2:sha256:9eb2857468b3ba5f634853223013c1553159fa2448bf645930150c00cc61c227"
behavior_unverified_items:
  - truth: "Each workspace row has an operator-gated Edit action opening a Name+Slug modal (D-01, D-02)"
    test: "Open /governance as operator, click Edit on a workspace row"
    expected: "Modal opens with Name and Slug fields pre-filled, Cancel/Save footer"
    why_human: "Modal opening/rendering is pinned only by client-source regex assertions — no DOM/browser test exercises it"
  - truth: "Slug-changed edit opens a danger confirm dialog with the bold old slug and permanent-404 warning; name-only edit saves directly (D-03)"
    test: "Edit a workspace changing only the name → direct save + success toast; then edit again changing the slug → confirm dialog appears requiring the old slug typed"
    expected: "Name-only: immediate save + toast.governanceRenamed. Slug change: danger dialog, bold esc() old slug, type-to-confirm on the old slug"
    why_human: "Dialog fork and type-to-confirm UX are runtime rendering behavior; source assertions cannot see interaction flow"
  - truth: "A 409 slugTaken refusal surfaces the suggestion payload with a one-click adopt (D-07)"
    test: "Rename a workspace to a slug already taken by another workspace"
    expected: "Modal stays open, shows slugTakenHint with suggested slug and an Adopt button that fills the slug field"
    why_human: "Refusal UX flow needs a live server round-trip and visual confirmation"
  - truth: "Every refusal reaching the modal renders a keyed 5-locale message (D-04, D-12)"
    test: "Trigger workspaceNameRequired / invalidSlug / slugTaken refusals and check the toast text in each of the 5 locales"
    expected: "Keyed toast text matching err.* entries per locale; no raw code strings shown"
    why_human: "Toast rendering per locale is runtime; only locale parity is test-verified"
  - truth: "Dead-mapping warning card renders above the workspaces table, operator-gated, escaped, hidden entirely at zero items (D-08, D-10, D-11)"
    test: "As operator, seed a dead group_mapping + a guard-refused audit row, load /governance; then remove them and reload"
    expected: "Card appears with escaped orphan/trail rows (first-colon split visible: delta | ns | guid | reason); disappears entirely when payload is empty"
    why_human: "DOM rendering and visual escaping cannot be exercised by node:test; source assertions prove structure, not render"
human_verification:
  - test: "WR-01 (fixed in code, commit 1086497b — verify the reconcile): after a slug rename, confirm the session UI shows the new slug immediately (workspace header, mapping editor, other pages) with no stale old-slug references, then navigate/click a link referencing the old slug"
    expected: "api.renameWorkspaceLocal maps state.workspaces by id and updates state.workspace when ids match — client state refreshes to the new slug with no reload; the fixer flagged this logic for human verification"
    why_human: "Cross-page client state reconciliation after a successful rename is runtime behavior; wiring (api.js:395, actions.js:4740 in govEditSave success path) is verified, the live reconcile is not"
coincidental_reliance_items: []
gaps: []
deferred: []
advisory:
  - finding: "WR-02 and WR-03 advisories from the prior verification are now RESOLVED (commits 9f37f946, ecf6c7b1) — esc(q) at governance.js:101/161; LIKE pattern uses 'group\\_%:group:%' escape '\\' at server.js:7454 with a negative-probe test"
    category: other
    reason: "Both were dispositioned advisory hardening notes; the fix pass closed them. Recorded for the audit trail."
    evidence_status: "fixed and re-verified this run"
  - finding: "IN-01 / IN-02 integration review notes (open, advisory)"
    category: other
    reason: "Dispositioned advisory in 83-REVIEW-DISPOSITION.md; no must-have touched"
    evidence_status: "documented; not re-tested here"
---

# Phase 83: Governance — Workspace Rename & Slug Edit Verification Report

**Phase Goal:** Operators can rename a workspace and edit its slug from the /governance page, with honest link death and dead-mapping visibility
**Verified:** 2026-11-20T16:05:00Z
**Status:** human_needed
**Re-verification:** Yes — after code-review fixes (WR-01/02/03) changed covered source files

## Goal Achievement

### Re-verification Scope

The prior verification (11/16, human_needed) passed, but the three WR fixes (1086497b, 9f37f946, ecf6c7b1) modified `server.js`, `src/pages/governance.js`, `src/actions/actions.js`, `src/core/api.js`, and `test/governance-rename.test.mjs` — stale fingerprint. This pass re-verified the fixes and regression-checked the previously passed truths.

**Fix verification results:**

| Fix | Commit | Evidence (code + tests) | Verdict |
|-----|--------|------------------------|---------|
| WR-01 client state reconcile | 1086497b | `api.renameWorkspaceLocal(id, {name, slug})` at api.js:395 (maps state.workspaces by id, updates state.workspace on id match); called in `A.govEditSave` success path at actions.js:4740 before `refreshGovernanceWorkspaces()` | ⚠️ Wired, code logic read correct — runtime reconcile routes to human verification |
| WR-02 esc(q) in empty states | 9f37f946 | governance.js:101 `t('page.governance.noMatchesBody', { query: esc(q) })`, governance.js:161 same for noMatchesOpBody | ✓ VERIFIED |
| WR-03 trail LIKE escape | ecf6c7b1 | server.js:7454: `where action like 'group\_%:group:%' escape '\'` — `_` pinned, comment documents intent; test updated to real encoded format + negative probe (`groupX:group:zzz:…` must NOT appear) | ✓ VERIFIED |

**Regression check:** the three phase suites re-ran green in this verification — `node --test test/governance-rename.test.mjs test/governance-client.test.mjs test/i18n-toast.test.mjs` → 47 pass / 0 fail / 0 skipped. Full-suite gate (2034 pass / 0 fail / 13 pre-existing skips) ran green in the fix pass per 83-REVIEW-FIX.md.

### Observable Truths

**Server half (83-01 — all behaviorally exercised by `test/governance-rename.test.mjs`, re-run green in this verification):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator POST {name, slug} to /api/auth/operator/workspaces/:id/rename updates the row, 200 {workspace:{id,slug,name}} | ✓ VERIFIED | server.js rename route; suite re-run green (regression check) |
| 2 | Empty name → 400 workspaceNameRequired; bad slug → 400 invalidSlug; collision → 409 slugTaken + uniqueSlug(next, ws.id) suggestion | ✓ VERIFIED | refusal tests green in re-run |
| 3 | Name trim+slice(0,60); slug validity solely via sanitizeSlug (SLUG_RE + RESERVED_SLUGS) | ✓ VERIFIED | verbatim helpers; reserved-slug test green |
| 4 | Own unchanged slug succeeds (self-collision excluded) | ✓ VERIFIED | self-collision test green |
| 5 | Guard order verbatim Phase 79: sameOrigin → requireUser → throttle → operator gate BEFORE lookup → fetch by id | ✓ VERIFIED | guard-order tests green |
| 6 | After rename, old slug URL → exact 404, NO Location header (D-15/D-82-5) | ✓ VERIFIED | D-15 pin test green in re-run |
| 7 | GET /api/auth/operator/dead-mappings: exact-Set-membership orphans + audit trail LIKE (now `_`-escaped) limit 100 order created_at desc, raw values | ✓ VERIFIED | server.js:7439–7455; WR-03 hardened predicate + negative probe test green |
| 8 | Zero dead items → both lists empty server-side; client hides card entirely | ✓ VERIFIED (server half) | zero-item test green; client `govDeadCard` returns '' at zero |
| 9 | Rename audit via logInfo (governance) with old→new slug, NO audit_log row | ✓ VERIFIED | route block re-read; no audit_log insert |

**Client half (83-02 — wired and source-asserted; runtime rendering not exercised by any test):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 10 | Edit action + Name+Slug modal on every wsRow (D-01/D-02) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | governance.js `data-a="govEditAsk"`; govEditBody modal; actions.js staging. Client-source assertions green; unchanged by fixes |
| 11 | Name-only edit saves directly; slug-change opens danger confirm with bold esc() old slug + type-to-confirm (D-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | actions.js fork logic read and correct; now additionally calls `api.renameWorkspaceLocal` (WR-01) before refresh |
| 12 | 409 slugTaken → suggestion surfaced, one-click adopt (D-07) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | actions.js adopt path + govEditAdopt control in modal; unchanged by fixes |
| 13 | Refusals render keyed 5-locale messages via govRefusalToast/tErr; zero new err.* vocabulary | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | 5-locale key parity test green; toast runtime not exercised |
| 14 | Dead-mapping card: operator-gated, esc() everywhere, first-colon-only trail split, hidden entirely at zero, no mutation controls (D-08/D-10/D-11) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | governance.js govDeadCard read; render gated on isInstanceAdmin; unchanged by fixes |
| 15 | All new page.governance.*/toast.* keys exist in en/fr/nl/de/es; data-a/data-r pins updated | ✓ VERIFIED | i18n parity suites green in re-run |
| 16 | Display-only card — no mutation actions (D-11) | ✓ VERIFIED | no `data-a` attribute in govDeadCard markup |

**Score:** 11/16 truths verified (5 present, behavior-unverified) — unchanged from prior verification; the fix pass introduced no regressions.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| test/governance-rename.test.mjs | Wave 0 e2e rename/dead-mapping suite | ✓ VERIFIED | green in re-run; WR-03 negative probe added |
| server.js rename route | POST .../:id/rename in operator family | ✓ VERIFIED | guard order verbatim |
| server.js dead-mappings route | GET /api/auth/operator/dead-mappings | ✓ VERIFIED | hardened LIKE predicate |
| src/core/api.js client methods | operatorWsRename + operatorDeadMappings + renameWorkspaceLocal | ✓ VERIFIED | api.js:384, 390, 395 — wired via call() / state map |
| src/pages/governance.js | Edit button, edit modal, dead card, esc(q) empty states | ✓ VERIFIED | esc(q) at :101 and :161 |
| src/actions/actions.js | govEditAsk/Adopt/Save/Cancel with D-03 fork + WR-01 reconcile call | ✓ VERIFIED | actions.js:4683–4754 |
| 5 locale files | 14 new keys, zero new err.* | ✓ VERIFIED | parity test green |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase suites (rename + client + i18n) | `node --test test/governance-rename.test.mjs test/governance-client.test.mjs test/i18n-toast.test.mjs` | 47 pass / 0 fail / 0 skipped | ✓ PASS |

### Probe Execution

None — no probes declared for this phase; deterministic coverage is the node:test suites above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| GV-01 | 83-01 | Operator rename + slug edit API with honest 404 link death | ✓ SATISFIED | server half truths 1–6, 9 all verified behaviorally |
| GV-02 | 83-02 | Governance UI: edit modal, refusal UX, locale parity | ✓ SATISFIED | truths 10–13, 15 wired + source-asserted; DOM truths route to UAT |
| GV-03 | 83-01/83-02 | Dead-mapping visibility (orphans + guard trail), display-only | ✓ SATISFIED | truths 7, 8, 14, 16; WR-03 hardening verified |

No orphaned requirement IDs — all three IDs claimed by plans and evidenced.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | — |

No TBD/FIXME/XXX markers or stub patterns in the phase-touched files.

### Human Verification Required

1. **WR-01 client-state reconcile (fixed in code — verify the logic live):** rename a workspace, confirm the session UI shows the new slug immediately with no stale old-slug references, then exercise a link referencing the old slug.
   - Expected: no reload needed; no 404s from stale client state. `renameWorkspaceLocal` wiring verified; live reconcile is not.
2. **Edit modal flow (D-01/D-02/D-03):** click Edit on a workspace row; name-only save → direct save + toast; slug change → danger dialog with bold esc() old slug + type-to-confirm.
3. **409 slugTaken adopt (D-07):** rename to a taken slug → hint + one-click Adopt fills the field.
4. **Refusal toasts per locale (D-04/D-12):** trigger workspaceNameRequired / invalidSlug / slugTaken and check keyed text in all 5 locales.
5. **Dead-mapping card (D-08/D-10/D-11):** seed dead mapping + guard-refused audit row as operator → card renders escaped rows with first-colon split; remove → card disappears entirely.

### Gaps Summary

No gaps. The three code-review warnings are fixed and verified: WR-02 and WR-03 are deterministically verified in code and tests; WR-01's `renameWorkspaceLocal` is present, wired, and logically correct but remains runtime client-state behavior — routed to human verification per fixer protocol and the client DOM truth routing. All previously verified truths regression-checked green. Fingerprint recomputed over the same covered_files set (fresh digest embedded in frontmatter).

---

_Verified: 2026-11-20T16:05:00Z_
_Verifier: the agent (gsd-verifier)_
