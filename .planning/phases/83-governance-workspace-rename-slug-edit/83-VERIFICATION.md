---
phase: 83-governance-workspace-rename-slug-edit
verified: 2026-11-21T00:00:00Z
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
covered_digest: "v2:sha256:ea64114fb0228d3c2c95897cd30f1a3a641ae592430f0934ea2fec7c05c6ddfb"
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
    why_human: "Cross-page client state reconciliation after a successful rename is runtime behavior; wiring (api.js:406, actions.js:4809 in govEditSave success path) is verified, the live reconcile is not"
coincidental_reliance_items: []
gaps: []
deferred: []
advisory:
  - finding: "Post-ship quick-task commits re-reviewed this run and confirmed non-regressive: 6b4aa830/39d69094 (SUPER_ACCESS env gate — gates workspace ENTRY, not isInstanceAdmin; rename/dead-mapping operator gates unchanged), 18b75806 (me() crash fix — api.js user access hardened, phase-83 client methods untouched), d62d3f2e (84-03 rename UPDATE now stamps updated_at = now() — additive column write, response shape unchanged)"
    category: other
    reason: "Changed files overlap phase-83 covered files; goal-backward re-check found no must-have affected."
    evidence_status: "re-verified against current tree this run"
  - finding: "WR-02 and WR-03 advisories from earlier rounds are RESOLVED (commits 9f37f946, ecf6c7b1) — esc(q) at governance.js:101/161; LIKE pattern uses 'group\\_%:group:%' escape '\\' at server.js:7547 with a negative-probe test"
    category: other
    reason: "Dispositioned advisory hardening notes; fix pass closed them. Recorded for the audit trail."
    evidence_status: "confirmed present in current source this run"
  - finding: "IN-01 / IN-02 integration review notes (open, advisory)"
    category: other
    reason: "Dispositioned advisory in 83-REVIEW-DISPOSITION.md; no must-have touched"
    evidence_status: "documented; not re-tested here"
---

# Phase 83: Governance — Workspace Rename & Slug Edit Verification Report

**Phase Goal:** Operators can rename a workspace and edit its slug from the /governance page, with honest link death and dead-mapping visibility
**Verified:** 2026-11-21T00:00:00Z
**Status:** human_needed
**Re-verification:** Yes — stale-verification refresh (#4682): post-ship quick-task commits (super-access gate 6b4aa830/39d69094, me() crash fix + Super-Admin rename 18b75806, 84-03 updated_at stamp d62d3f2e) changed covered source files after the 2026-11-20 verification

## Goal Achievement

### Re-verification Scope

The prior verification (11/16, human_needed) passed with all server truths behaviorally exercised. Since then, owner quick-task commits modified `server.js`, `src/core/api.js`, `src/actions/actions.js`, and `src/pages/governance.js` — stale fingerprint. This pass re-verified the phase's load-bearing code paths against the CURRENT tree and regression-ran the phase suites; no rubber-stamping — every previously passed truth was re-checked at source level.

**Post-ship change impact assessment:**

| Commit | Change | Impact on Phase 83 must-haves | Verdict |
|--------|--------|-------------------------------|---------|
| 6b4aa830 / 39d69094 | SUPER_ACCESS env gate + boot log/docs | Gates workspace ENTRY (super-access), NOT `isInstanceAdmin`. Rename route (server.js:7247–7278) and dead-mappings route (server.js:7527–7558) still gate on `isInstanceAdmin(operator)` verbatim | ✓ Non-regressive |
| 18b75806 | me() undefined crash fix + "Operator" → "Super Admin" label rename | api.js client hardening; `operatorWsRename` (:395), `renameWorkspaceLocal` (:406), `operatorDeadMappings` (:413) unchanged and wired; governance.js gates still `api.user?.isInstanceAdmin` (server ground truth) | ✓ Non-regressive |
| d62d3f2e | 84-03: rename UPDATE stamps `updated_at = now()` | Additive column write inside the same UPDATE; response shape `{workspace:{id,slug,name}}` unchanged; suite green | ✓ Non-regressive |

**Regression check:** the three phase suites re-ran green in this verification — `node --test test/governance-rename.test.mjs test/governance-client.test.mjs test/i18n-toast.test.mjs` → 47 pass / 0 fail / 0 skipped.

### Observable Truths

**Server half (83-01 — all behaviorally exercised by `test/governance-rename.test.mjs`, re-run green in this verification):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator POST {name, slug} to /api/auth/operator/workspaces/:id/rename updates the row, 200 {workspace:{id,slug,name}} | ✓ VERIFIED | server.js:7247–7278 re-read in current tree (now stamps updated_at); suite re-run green |
| 2 | Empty name → 400 workspaceNameRequired; bad slug → 400 invalidSlug; collision → 409 slugTaken + uniqueSlug(next, ws.id) suggestion | ✓ VERIFIED | refusal tests green in re-run |
| 3 | Name trim+slice(0,60); slug validity solely via sanitizeSlug (SLUG_RE + RESERVED_SLUGS) | ✓ VERIFIED | verbatim helpers in current source; reserved-slug test green |
| 4 | Own unchanged slug succeeds (self-collision excluded) | ✓ VERIFIED | self-collision test green (server.js:7271 `next !== ws.slug && await wsBySlug(next)`) |
| 5 | Guard order verbatim Phase 79: sameOrigin → requireUser → throttle → operator gate BEFORE lookup → fetch by id | ✓ VERIFIED | guard-order tests green; route re-read confirms order intact post-SUPER_ACCESS |
| 6 | After rename, old slug URL → exact 404, NO Location header (D-15/D-82-5) | ✓ VERIFIED | D-15 pin test green in re-run |
| 7 | GET /api/auth/operator/dead-mappings: exact-Set-membership orphans + audit trail LIKE (now `_`-escaped) limit 100 order created_at desc, raw values | ✓ VERIFIED | server.js:7527–7558 re-read; WR-03 hardened predicate + negative probe test green |
| 8 | Zero dead items → both lists empty server-side; client hides card entirely | ✓ VERIFIED (server half) | zero-item test green; client `govDeadCard` returns '' at zero |
| 9 | Rename audit via logInfo (governance) with old→new slug, NO audit_log row | ✓ VERIFIED | route block re-read (server.js:7276); no audit_log insert |

**Client half (83-02 — wired and source-asserted; runtime rendering not exercised by any test):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 10 | Edit action + Name+Slug modal on every wsRow (D-01/D-02) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | governance.js `data-a="govEditAsk"`; govEditBody modal; actions.js staging. Client-source assertions green; unchanged by post-ship commits |
| 11 | Name-only edit saves directly; slug-change opens danger confirm with bold esc() old slug + type-to-confirm (D-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | actions.js:4784–4820 fork logic re-read and correct; calls `api.renameWorkspaceLocal` (WR-01) before refresh |
| 12 | 409 slugTaken → suggestion surfaced, one-click adopt (D-07) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | actions.js slugTaken branch + govEditAdopt control in modal; unchanged |
| 13 | Refusals render keyed 5-locale messages via govRefusalToast/tErr; zero new err.* vocabulary | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | 5-locale key parity test green; toast runtime not exercised |
| 14 | Dead-mapping card: operator-gated, esc() everywhere, first-colon-only trail split, hidden entirely at zero, no mutation controls (D-08/D-10/D-11) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | governance.js govDeadCard (:176) re-read; render gated on `api.user?.isInstanceAdmin` (:105); unchanged |
| 15 | All new page.governance.*/toast.* keys exist in en/fr/nl/de/es; data-a/data-r pins updated | ✓ VERIFIED | i18n parity suites green in re-run; 55 page.governance keys present in en.json |
| 16 | Display-only card — no mutation actions (D-11) | ✓ VERIFIED | no `data-a` attribute in govDeadCard markup |

**Score:** 11/16 truths verified (5 present, behavior-unverified) — unchanged from prior verification; the post-ship quick-task commits introduced no regressions.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| test/governance-rename.test.mjs | Wave 0 e2e rename/dead-mapping suite | ✓ VERIFIED | green in re-run; WR-03 negative probe present |
| server.js rename route | POST .../:id/rename in operator family | ✓ VERIFIED | guard order verbatim; updated_at stamp additive |
| server.js dead-mappings route | GET /api/auth/operator/dead-mappings | ✓ VERIFIED | hardened LIKE predicate at :7547 |
| src/core/api.js client methods | operatorWsRename + operatorDeadMappings + renameWorkspaceLocal | ✓ VERIFIED | api.js:395, 413, 406 — wired via call() / state map |
| src/pages/governance.js | Edit button, edit modal, dead card, esc(q) empty states | ✓ VERIFIED | esc(q) at :101 and :161 confirmed in current tree |
| src/actions/actions.js | govEditAsk/Adopt/Save/Cancel with D-03 fork + WR-01 reconcile call | ✓ VERIFIED | actions.js:4784–4820 re-read |
| 5 locale files | 14 new keys, zero new err.* | ✓ VERIFIED | parity test green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| actions.js govEditSave | server rename route | api.operatorWsRename (api.js:395 → POST /api/auth/operator/workspaces/:id/rename) | ✓ WIRED | actions.js:4791; encodeURIComponent(id) |
| actions.js govEditSave success | client state reconcile | api.renameWorkspaceLocal (api.js:406) | ✓ WIRED | actions.js:4809 before refreshGovernanceWorkspaces |
| governance.js dead card | dead-mappings route | api.operatorDeadMappings (api.js:413 → GET /api/auth/operator/dead-mappings) | ✓ WIRED | actions.js:4692 fetch; card gated :105 |
| server rename route | slug helpers | sanitizeSlug/uniqueSlug(base, excludeId)/wsBySlug | ✓ WIRED | verbatim reuse; suggestion carries excludeId=ws.id |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| govDeadCard | orphans/trail | GET dead-mappings → db.all queries (group_mappings, audit_log) | Yes | ✓ FLOWING |
| governance workspaces table | govWs listing | refreshGovernanceWorkspaces → server listing | Yes | ✓ FLOWING |
| govEdit modal fields | staged ws row | S.ui.govEditWs from live listing payload | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase suites (rename + client + i18n) | `node --test test/governance-rename.test.mjs test/governance-client.test.mjs test/i18n-toast.test.mjs` | 47 pass / 0 fail / 0 skipped | ✓ PASS |

### Probe Execution

None — no probes declared for this phase; deterministic coverage is the node:test suites above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| GV-01 | 83-01 | Operator rename + slug edit API with honest 404 link death | ✓ SATISFIED | server half truths 1–6, 9 all verified behaviorally against current tree |
| GV-02 | 83-02 | Governance UI: edit modal, refusal UX, locale parity | ✓ SATISFIED | truths 10–13, 15 wired + source-asserted; DOM truths route to UAT |
| GV-03 | 83-01/83-02 | Dead-mapping visibility (orphans + guard trail), display-only | ✓ SATISFIED | truths 7, 8, 14, 16; WR-03 hardening confirmed at server.js:7547 |

No orphaned requirement IDs — all three IDs claimed by plans and evidenced.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | — |

No TBD/FIXME/XXX/PLACEHOLDER markers in the phase-touched files (re-scanned this run).

### Human Verification Required

1. **WR-01 client-state reconcile (fixed in code — verify the logic live):** rename a workspace, confirm the session UI shows the new slug immediately with no stale old-slug references, then exercise a link referencing the old slug.
   - Expected: no reload needed; no 404s from stale client state. `renameWorkspaceLocal` wiring verified at api.js:406 / actions.js:4809; live reconcile is not.
2. **Edit modal flow (D-01/D-02/D-03):** click Edit on a workspace row; name-only save → direct save + toast; slug change → danger dialog with bold esc() old slug + type-to-confirm.
3. **409 slugTaken adopt (D-07):** rename to a taken slug → hint + one-click Adopt fills the field.
4. **Refusal toasts per locale (D-04/D-12):** trigger workspaceNameRequired / invalidSlug / slugTaken and check keyed text in all 5 locales.
5. **Dead-mapping card (D-08/D-10/D-11):** seed dead mapping + guard-refused audit row as operator → card renders escaped rows with first-colon split; remove → card disappears entirely.

### Gaps Summary

No gaps. The stale-verification refresh re-validated every truth against the current tree: the post-ship quick-task commits (SUPER_ACCESS gate, me() crash fix + Super-Admin rename, updated_at stamp, .env docs) do not touch any phase-83 must-have — the operator gates remain `isInstanceAdmin`, the rename and dead-mapping routes are intact, the client methods and modal/card wiring are unchanged, and the phase suites re-ran 47/47 green. Fingerprint recomputed over the covered_files set (fresh v4 digest embedded in frontmatter). The 5 client DOM truths and the WR-01 live reconcile remain routed to human verification, as before.

---

_Verified: 2026-11-21T00:00:00Z_
_Verifier: the agent (gsd-verifier)_
