---
phase: 83-governance-workspace-rename-slug-edit
verified: 2026-11-20T15:22:21Z
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
covered_digest: "v4:sha256:05a68be9d3179aab5a05f3ad8036e1be00a45b2757aa047cc2ad6149e1e0ffa0"
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
  - test: "WR-01 (83-REVIEW.md, open): after a slug rename, navigate/click any link or view that references the workspace's old slug (workspace header, mapping editor, other pages)"
    expected: "Client state refreshes to the new slug — no stale old-slug references or broken actions left in the session UI"
    why_human: "Cross-page client state staleness after a successful rename is a runtime interaction; refreshGovernanceWorkspaces() wiring is verified, the full app-wide refresh surface is not"
coincidental_reliance_items: []
gaps: []
deferred: []
advisory:
  - finding: "WR-02 — unescaped search query interpolation in governance empty states (open, dispositioned advisory in 83-REVIEW.md)"
    category: security
    reason: "Out of Phase 83 must-have scope (search empty states, not the rename modal or dead card); carried value is operator-supplied. Record for a future cleanup pass"
    evidence_status: "present in review; not re-tested here"
  - finding: "WR-03 — trail LIKE 'group_%:group:%' treats _ as a single-char wildcard, so rows with 'group' + one char could over-match the trail list"
    category: other
    reason: "Route returns what the pinned truth literally specifies (LIKE 'group_%:group:%', limit 100) and the test pins that exact query; operator-gated read-only. Does not fail the truth; note for a hardening pass (escape _ or tighten the pattern)"
    evidence_status: "pattern confirmed in server.js:7452"
  - finding: "IN-01 / IN-02 integration review notes (open, advisory)"
    category: other
    reason: "Dispositioned advisory in 83-REVIEW-DISPOSITION.md; no must-have touched"
    evidence_status: "documented; not re-tested here"
---

# Phase 83: Governance — Workspace Rename & Slug Edit Verification Report

**Phase Goal:** Operators can rename a workspace and edit its slug from the /governance page, with honest link death and dead-mapping visibility
**Verified:** 2026-11-20T15:22:21Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

**Server half (83-01 — all behaviorally exercised by `test/governance-rename.test.mjs`, run green in this verification):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator POST {name, slug} to /api/auth/operator/workspaces/:id/rename updates the row, 200 {workspace:{id,slug,name}} | ✓ VERIFIED | server.js:7153–7188; test suite green |
| 2 | Empty name → 400 workspaceNameRequired; bad slug → 400 invalidSlug; collision → 409 slugTaken + uniqueSlug(next, ws.id) suggestion | ✓ VERIFIED | server.js:7176–7181; test suite green |
| 3 | Name trim+slice(0,60); slug validity solely via sanitizeSlug (SLUG_RE + RESERVED_SLUGS) | ✓ VERIFIED | server.js:7173–7178 (verbatim helpers); reserved-slug test green |
| 4 | Own unchanged slug succeeds (self-collision excluded) | ✓ VERIFIED | server.js:7180 `next !== ws.slug &&` gate; test green |
| 5 | Guard order verbatim Phase 79: sameOrigin first → requireUser → op-ws-rename throttle → operator gate BEFORE lookup → fetch by id (no requireWorkspace; archived renameable) | ✓ VERIFIED | server.js:7155–7169 — order read line-by-line; no-existence-oracle + cross-origin tests green |
| 6 | After rename, old slug URL → exact 404, NO Location header (D-15/D-82-5); no redirect machinery anywhere | ✓ VERIFIED | D-15 pin test green ("exact 404 with no Location header; the NEW slug → 200") |
| 7 | GET /api/auth/operator/dead-mappings: exact-Set-membership orphans + audit trail LIKE 'group_%:group:%' limit 100 order created_at desc, raw values | ✓ VERIFIED | server.js:7433–7454; adjacency/ordering/zero-item tests green |
| 8 | Zero dead items → both lists empty server-side; client hides card entirely | ✓ VERIFIED (server half) | server returns `{orphans:[],trail:[]}`; client `govDeadCard` returns '' at zero (governance.js:181) |
| 9 | Rename audit via logInfo (governance) with old→new slug, NO audit_log row | ✓ VERIFIED | server.js:7184–7186; no audit_log insert in the route block |

**Client half (83-02 — wired and source-asserted; runtime rendering not exercised by any test):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 10 | Edit action + Name+Slug modal on every wsRow (D-01/D-02) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | governance.js:64 `data-a="govEditAsk"`; govEditBody modal (governance.js:208–223); actions.js:4683 staging. Client-source assertions green — but no DOM/behavioral test |
| 11 | Name-only edit saves directly; slug-change opens danger confirm with bold esc() old slug + type-to-confirm (D-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | actions.js:4715–4754 — fork logic read and correct (`slugChanged` vs origSlug, `danger: true`, `typeName: ws.origSlug`, `<b>${esc(ws.origSlug)}</b>`) |
| 12 | 409 slugTaken → suggestion surfaced, one-click adopt (D-07) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | actions.js:4726–4730; govEditAdopt (actions.js:4705); adopt control in governance.js:216 |
| 13 | Refusals render keyed 5-locale messages via govRefusalToast/tErr; zero new err.* vocabulary | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | actions.js:4731 govRefusalToast; 5-locale key parity test-verified; toast runtime not exercised |
| 14 | Dead-mapping card: operator-gated, esc() everywhere, first-colon-only trail split, hidden entirely at zero, no mutation controls (D-08/D-10/D-11) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | governance.js:176–198 — splitFirst double first-colon peel, esc() on every interpolated value, zero data-a in card, early return '' at zero; render gated `api.user?.isInstanceAdmin ? govDeadCard() : ''` (governance.js:105). Source assertions green; DOM render not exercised |
| 15 | All new page.governance.*/toast.* keys exist in en/fr/nl/de/es in the same commit; data-a/data-r pins updated | ✓ VERIFIED | confirmRenameTitle present once in each of the 5 locale files (grepped); i18n/build-locales/error-codes suites green; catalogue pin bumped in 83-02 commits |
| 16 | Display-only card — no mutation actions (D-11) | ✓ VERIFIED | governance.js:176–198 read — no `data-a` attribute in govDeadCard markup |

**Score:** 11/16 truths verified (5 present, behavior-unverified)

Note on score honesty: the 5 behavior-unverified client truths are fully wired with correct logic verified by direct code reading plus 8 green client-source assertions — the risk is rendering/interaction, which node:test cannot see. Per plan 83-02's own verification section, these route to manual UAT.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| test/governance-rename.test.mjs | Wave 0 e2e rename/dead-mapping suite | ✓ VERIFIED | 22 tests pass in this run |
| server.js rename route | POST .../:id/rename in operator family | ✓ VERIFIED | server.js:7153–7188, guard order verbatim |
| server.js dead-mappings route | GET /api/auth/operator/dead-mappings | ✓ VERIFIED | server.js:7433–7454 |
| src/core/api.js client methods | operatorWsRename + operatorDeadMappings | ✓ VERIFIED | api.js:384, 390 — wired via call() |
| src/pages/governance.js | Edit button, edit modal, dead card | ✓ VERIFIED | govEditBody, govDeadCard present and rendered from pageGovernance |
| src/actions/actions.js | govEditAsk/Adopt/Save/Cancel with D-03 fork | ✓ VERIFIED | actions.js:4683–4754 |
| 5 locale files | 14 new keys, zero new err.* | ✓ VERIFIED | confirmRenameTitle ×1 each; parity test green |
| test/governance-client.test.mjs | 8 new source assertions | ✓ VERIFIED | suite green (22 tests) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js rename route | sanitizeSlug/uniqueSlug(base, excludeId)/wsBySlug | direct calls | WIRED | server.js:7177–7181; suggestion carries excludeId=ws.id |
| server.js dead-mappings route | group_mappings + workspaces + audit_log | SQL on read | WIRED | exact Set membership + LIKE trail query |
| actions.js govEditSave | api.operatorWsRename | direct call | WIRED | actions.js:4722 |
| actions.js govEditSave | refreshGovernanceWorkspaces + toast.governanceRenamed | on success | WIRED | actions.js:4736–4737 |
| actions.js confirm body | esc(oldSlug) bold interpolation | template literal | WIRED | actions.js:4747 |
| governance.js govDeadCard | api.operatorDeadMappings payload | S.ui.govDead fill | WIRED | actions.js:4623 fetch; governance.js:177 read |
| governance.js card | esc(label) on orphan rows | template | WIRED | governance.js:190 |
| governance.js Edit button | api.user?.isInstanceAdmin gating | conditional | WIRED | governance.js:105 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| Rename route response | ws row | workspaces table (db.get by id) | Yes | ✓ FLOWING |
| dead-mappings payload | orphans/trail | group_mappings + workspaces + audit_log live queries | Yes | ✓ FLOWING |
| govDeadCard rows | S.ui.govDead | api.operatorDeadMappings() live fetch in refreshGovernanceWorkspaces | Yes | ✓ FLOWING |
| govEditBody fields | S.ui.govEditWs | staged from real workspace row (govWsById) | Yes | ✓ FLOWING |
| suggestion adopt | res.data.suggestion | server uniqueSlug(next, ws.id) | Yes | ✓ FLOWING |

No static/hardcoded data paths found.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rename + dead-mapping + D-15 suite | `node --test test/governance-rename.test.mjs test/governance-client.test.mjs` | tests 39, pass 39, fail 0 | ✓ PASS |
| Full workspace suite | `npm test` | tests 2047, pass 2034, fail 0, skipped 13 | ✓ PASS |

### Probe Execution

None declared — no probe-*.sh scripts referenced in plans; SKIPPED per contract.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GV-01 | 83-01, 83-02 | Operator edits workspace name+slug from /governance with validation, collision refusal, keyed 5-locale errors | ✓ SATISFIED (server behavior verified; UI rendering → UAT) | rename route + modal + locales, all wired and test-pinned |
| GV-02 | 83-01, 83-02 | Old slug 404s with no redirect; slug change requires confirm | ✓ SATISFIED | D-15 pin test green; D-03 confirm fork present and source-asserted |
| GV-03 | 83-01, 83-02 | Operator console warning section lists dead mappings | ✓ SATISFIED (server verified; card render → UAT) | dead-mappings route + govDeadCard wired, escaped, hidden at zero |

No orphaned requirements: REQUIREMENTS.md maps exactly GV-01..03 to Phase 83; both plans declare all three. No deferred items — no later milestone phase covers the unverified UI rendering; it belongs to this phase's UAT.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | 7452 | LIKE pattern with unescaped `_` wildcard (WR-03, advisory) | 📋 Advisory | Over-broad trail match possible; operator-gated, bounded 100 — review dispositioned open |
| src/pages/governance.js | empty states | unescaped search query (WR-02, advisory) | 📋 Advisory | Out of phase must-have scope; review dispositioned open |

No TBD/FIXME/XXX debt markers in any phase-modified file. No stub patterns: all data flows from live DB queries.

### Review Findings Impact (83-REVIEW.md)

- **WR-01** (stale client state after rename): does not falsify any must-have — the rename flow itself is correct and refreshes governance state — but the app-wide refresh surface is a real open risk. Promoted to a dedicated human-verification item above.
- **WR-02 / WR-03 / IN-01 / IN-02**: advisory, out of must-have scope, recorded above.

### Human Verification Required

### 1. Edit modal opens and renders (Truth 10)
**Test:** Open /governance as operator, click Edit on a workspace row.
**Expected:** Name+Slug modal, pre-filled, Cancel/Save.
**Why human:** rendering not exercisable by node:test.

### 2. D-03 confirm fork (Truth 11)
**Test:** Edit name only → direct save + success toast; edit slug → danger confirm requiring the bold old slug typed.
**Expected:** correct fork both ways; old slug bold in confirm body.
**Why human:** interaction flow.

### 3. slugTaken suggestion adopt (Truth 12)
**Test:** Rename to a taken slug.
**Expected:** modal stays open, suggestion shown, one-click adopt fills the field.
**Why human:** live refusal UX.

### 4. Refusal toasts per locale (Truth 13)
**Test:** Trigger the three refusals; check toast text (spot-check fr at minimum).
**Expected:** keyed err.* messages, no raw codes.
**Why human:** runtime toast rendering.

### 5. Dead-mapping card render + empty hiding (Truth 14)
**Test:** Seed a dead mapping + guard-refused audit row → card lists escaped rows with first-colon split; clear them → card gone entirely.
**Expected:** per D-08/D-10/D-11.
**Why human:** DOM rendering + escaping visual check.

### 6. WR-01 stale-state sweep (see frontmatter)
**Test:** After a slug rename, click/navigate to every view referencing the workspace.
**Expected:** no stale old-slug references.
**Why human:** cross-page runtime state.

### Gaps Summary

No gaps. Every server-side must-have is behaviorally verified by a green test run in this verification (39/39 phase tests, full suite 2034 pass / 0 fail). All client artifacts exist, are substantive, and are wired to the 83-01 routes; the 5 client truths remain ⚠️ PRESENT_BEHAVIOR_UNVERIFIED solely because modal/card/toast rendering and the interaction flows are pinned by source assertions only — they route to the manual UAT session per the phase's own verification plan. Status: human_needed, no structured gaps.

---

_Verified: 2026-11-20T15:22:21Z_
_Verifier: the agent (gsd-verifier)_
