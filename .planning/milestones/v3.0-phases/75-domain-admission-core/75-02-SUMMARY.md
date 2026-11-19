---
phase: 75-domain-admission-core
plan: 02
subsystem: server-auth
tags: [domain-admission, invite-doors, fail-closed, canonicalization, i18n, mcp, security]
requires:
  - phase: 75-01
    provides: boot-frozen SIGNUP/INVITE_DOMAINS consts, emailDomainRefusal funnel, NFKC+last-@+trailing-dot canonicalization, keyed refusal pattern
provides:
  - DP-2 per-email invite-create gate (code inviteDomainNotAllowed, flat { email } extra, zero-side-effect batches)
  - DP-3 fail-closed accept re-derivation (code inviteDomainNoLonger, row-email, non-consuming, link-only body-email check)
  - MCP invite_member fourth admission door composing the same funnel (T-75-16)
  - shared canonicalization module domains.js (root) — one split('@') call site across all four doors
  - err.inviteDomainNotAllowed + err.inviteDomainNoLonger in all 5 locales
  - 12 new tests: DP-2 matrix, DP-3 tighten/loosen, gmail SC3, link-only, cross-door parity/isolation/source invariants
affects: [76 (OIDC/SSO doors compose the same funnel), verify-work (phase 75 UAT)]
tech-stack:
  added: []
  patterns:
    - shared funnel in a root-level module so server routes AND mcp.js compose one pipeline (no bypass lane)
    - fail-closed re-derivation against the boot-frozen live list, validating the ROW email before any write
    - non-consuming keyed refusal (invite row survives tightening; loosening revives)
    - TDD RED evidence via gsd_run check tdd-red-evidence (RED_EVIDENCE_OK gate)
key-files:
  created: [domains.js]
  modified: [server.js, mcp.js, eslint.config.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/domain-admission.test.mjs, test/i18n-core-features.test.mjs]
key-decisions:
  - "Canonicalization pipeline extracted from server.js into root domains.js (not src/core/) so mcp.js composes the EXACT same funnel — the i18n literal scan keeps its client-only src/ scope (a src/core placement tripped the scan gate)"
  - "Both door consts (SIGNUP_DOMAINS/INVITE_DOMAINS) freeze once in domains.js at first import — server doors and the MCP door see the same Set objects"
  - "D-05 warn-and-clean boot warnings moved with the parser (console.warn) — same observable message text, harness regex unaffected"
  - "MCP does NOT NFKC-normalize before its shape check: fullwidth ＠ is refused at the shape gate in BOTH the UI invite door (emailOk) and MCP — parity preserved; the funnel still NFKC-canonicalizes anything that reaches membership"
  - "DP-3 comment worded to avoid the literal signup-list identifier so the source-reading invariant scans the real region"
patterns-established:
  - "Fourth-door parity table: MCP tools/call vs UI REST verdicts over the Plan 01 adversarial rows, asserted equal per row"
  - "Reboot-same-DB tighten/loosen harness: one dataDir, three startServer calls, row persistence asserted between reboots"
requirements-completed: [DOM-02, DOM-03, DOM-04, DOM-07]
coverage:
  - id: D1
    description: "DP-2 per-email invite-create gate: out-of-list email refused with inviteDomainNotAllowed next to the field; refused batch leaves zero invite rows"
    requirement: DOM-02
    verification:
      - kind: integration
        ref: "test/domain-admission.test.mjs#DP-2: an out-of-list email is refused per-email with inviteDomainNotAllowed and zero invite rows"
        status: pass
      - kind: integration
        ref: "test/domain-admission.test.mjs#DP-2: a batch with one refused email refuses with that email and zero rows"
        status: pass
    human_judgment: false
  - id: D2
    description: "Invite-door tri-state through the door: unset inherits the signup list; explicit '' denies all; own list stands alone (may be wider)"
    requirement: DOM-02
    verification:
      - kind: integration
        ref: "test/domain-admission.test.mjs#DP-2 inheritance: unset ALLOW_INVITE_DOMAINS reads the signup list through the invite door"
        status: pass
      - kind: integration
        ref: "test/domain-admission.test.mjs#DP-2 standalone: ALLOW_INVITE_DOMAINS='' denies all invites while a signup list exists"
        status: pass
    human_judgment: false
  - id: D3
    description: "MCP invite_member fourth door: same funnel — in-list inserts, out-of-list refuses, no bypass lane"
    requirement: DOM-07
    verification:
      - kind: integration
        ref: "test/domain-admission.test.mjs#MCP invite_member composes the same funnel: in-list inserts, out-of-list refuses, fullwidth ＠ refused like the UI door"
        status: pass
    human_judgment: false
  - id: D4
    description: "DP-3 fail-closed accept re-derivation: tightened list refuses with inviteDomainNoLonger, row survives, loosening revives (SC4, D-07), no inviter notification (D-08)"
    requirement: DOM-04
    verification:
      - kind: integration
        ref: "test/domain-admission.test.mjs#DP-3 tighten/loosen: a pending invite refused after the list tightens keeps its row and is revived by loosening (SC4, D-07)"
        status: pass
      - kind: integration
        ref: "test/domain-admission.test.mjs#DP-3 row-email invariant: the refusal validates the ROW email even when the body carries an in-list email"
        status: pass
      - kind: integration
        ref: "test/domain-admission.test.mjs#DP-3 link-only invite: the body email is re-derived against the live list before createUser"
        status: pass
    human_judgment: false
  - id: D5
    description: "One door, one rule (SC3): invited gmail user accepts, creates account, logs in; same email can never self-register"
    requirement: DOM-03
    verification:
      - kind: integration
        ref: "test/domain-admission.test.mjs#DOM-03 gmail scenario (SC3): an invited gmail user accepts and logs in; the same email can never self-register"
        status: pass
      - kind: integration
        ref: "test/domain-admission.test.mjs#accept-path isolation: with a.com signup / b.com invites, the accept route admits b.com in the same process where signup refuses b.com"
        status: pass
      - kind: other
        ref: "test/domain-admission.test.mjs#source invariant: the accept-route region never references the signup-list const"
        status: pass
    human_judgment: false
  - id: D6
    description: "Cross-door parity: MCP and UI invite-create doors agree on every adversarial row (T-75-16)"
    requirement: DOM-07
    verification:
      - kind: integration
        ref: "test/domain-admission.test.mjs#cross-door parity: the MCP door and the UI invite-create door agree on every adversarial row (T-75-16)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Both new refusal keys catalogued in all 5 locales with pinned counts; error-codes extraction gates green"
    requirement: DOM-04
    verification:
      - kind: unit
        ref: "test/error-codes.test.mjs#every error code the server emits has a non-empty err.<code> entry in both catalogues"
        status: pass
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#the catalogue holds ... (+1 err.inviteDomainNoLonger ...) — 1949 keys"
        status: pass
    human_judgment: false
duration: 29min
completed: 2026-11-19
status: complete
plan_head_before: c1cf518877dd9f163ee9ac3319de2f16e5d4d434
plan_head_after: 1f574bd7
commits: 4
estimate:
  tokens: 84000
actuals:
  tokens: 53300   # chars/4 over the realized diff: 11 files, +533/-62
  tasks: 3
  commits: 4
---

# Phase 75 Plan 02: Invite Doors + MCP Gate + Accept Re-derivation Summary

**All four admission doors (signup, invite-create per-email, invite-accept fail-closed re-derive, MCP invite_member) compose one canonicalizing funnel from a shared root module, with keyed 5-locale refusals, non-consuming tighten/loosen semantics, and a proven MCP↔UI parity table.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-11-19T12:35:59Z
- **Completed:** 2026-11-19T13:04:28Z
- **Tasks:** 3
- **Files modified:** 11 (+533/−62)

## Accomplishments

- DP-2: per-email `inviteDomainNotAllowed` refusal inside the invite-create emailOk loop, before `db.tx` — refused batches leave zero invite rows; flat `{ email }` extra for inline per-field rendering (D-03)
- DP-3: fail-closed accept-time re-derivation against the live boot-frozen `INVITE_DOMAINS` validating the invite ROW's email — 403 `inviteDomainNoLonger` before any write, non-consuming (loosening revives the same row, SC4/D-07); link-only invites re-derive the body email before createUser; no inviter notification (D-08)
- MCP `invite_member` wired as the fourth door through the same funnel (T-75-16, no bypass lane)
- Canonicalization pipeline extracted into root `domains.js` — one `split('@')` call site, same Set objects for every door
- `err.inviteDomainNotAllowed` + `err.inviteDomainNoLonger` in all 5 catalogues (en/fr/nl/de/es); pinned i18n count 1947→1949
- 12 new tests: DP-2 zero-side-effect matrix, inherit/standalone, MCP door, TDD tighten/loosen reboot-same-DB, row-email invariant, gmail SC3, link-only, cross-door parity table, accept/signup mutual exclusion, accept-region source invariant

## Task Commits

1. **Task 1: DP-2 + MCP doors (tracer)** — `1ac3db05` (feat)
2. **Task 2 RED: failing DP-3 tests** — `ff25cc9a` (test, RED_EVIDENCE_OK via `gsd_run check tdd-red-evidence`)
3. **Task 2 GREEN: DP-3 implementation** — `e99094e0` (feat; REFACTOR not needed — implementation minimal, mirrors DP-1/DP-2)
4. **Task 3: cross-door invariants sweep** — `1f574bd7` (test)

## Files Created/Modified

- `domains.js` (new) — the ONE canonicalizing domain module: `canonicalizeDomain`, `emailFromEmail`, `parseDomainList`, `emailDomainRefusal`, boot-frozen `SIGNUP_DOMAINS`/`INVITE_DOMAINS`
- `server.js` — imports the shared module; DP-2 gate in the invite-create loop; DP-3 row gate + link-only gate in the accept route
- `mcp.js` — `invite_member` domain gate after the email shape check, before the roster check/insert
- `eslint.config.js` — `domains.js` registered in the Node-globals file list
- `src/locales/{en,fr,nl,de,es}.json` — the two new err.* keys
- `test/domain-admission.test.mjs` — 12 new tests (26 total in the suite)
- `test/i18n-core-features.test.mjs` — pinned count 1947→1949, test name annotated

## Decisions Made

- Extracted the Plan 01 funnel to root `domains.js` (not `src/core/`): the i18n literal scan treats `src/` as client-source scope and flagged the funnel's EN message as an unlisted literal; a root module (like `webhook-ssrf.js`) keeps one funnel AND the scan scope intact
- Both door consts freeze inside `domains.js` — server.js and mcp.js import the same Sets; the `??` inheritance and D-06 boot-log lines in server.js are unchanged
- MCP deliberately does NOT NFKC before its shape check: fullwidth ＠ is refused at the shape gate by BOTH the UI invite door (`emailOk`) and MCP — parity preserved; the funnel still NFKC-canonicalizes anything that reaches membership
- D-05 boot warnings moved with the parser to `console.warn` — same message text, D-05 tests still observe them

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Shared funnel module extracted so mcp.js need not reimplement matching**
- **Found during:** Task 1
- **Issue:** mcp.js cannot import server.js (circular import; server.js boots on load) — composing "the same code path/constants" required the pipeline in a module both can import
- **Fix:** moved `canonicalizeDomain`/`emailFromEmail`/`parseDomainList`/`emailDomainRefusal` + the boot-frozen consts from server.js into root `domains.js`; server.js imports them (const names unchanged, boot logs untouched); mcp.js imports the funnel + `INVITE_DOMAINS`
- **Files modified:** domains.js (new), server.js, mcp.js, eslint.config.js
- **Verification:** full suite green; one `split('@')` call site; i18n scan gate clean (after the root-not-src/core placement fix)
- **Committed in:** 1ac3db05

**2. [Rule 3 - Blocking] domains.js placement: root, not src/core/ (i18n scan scope)**
- **Found during:** Task 1 verification (npm test — i18n-scan gate flagged the funnel's EN default message in `src/core/domains.js:65` as an unlisted user-visible literal)
- **Fix:** relocated to root `domains.js`, imports updated; `scripts/i18n-scan.mjs --report` clean
- **Committed in:** 1ac3db05

**3. [Rule 1 - Test bug] Parity-test MCP helper dropped the `mcp-session-id` header**
- **Found during:** Task 3 (tools/call → 400 "Server not initialized")
- **Fix:** the compact rpc helper now returns the session header like the Task 1/mcp.test.mjs helpers
- **Committed in:** 1f574bd7

---

**Total deviations:** 3 auto-fixed (2 blocking-infrastructure, 1 test bug). **Impact on plan:** all necessary to satisfy the plan's own no-reimplementation invariant and the existing scan gates. No scope creep.

## Issues Encountered

- My first DP-3 edit accidentally dropped the `session`/`account`/`user` lines of the accept route; caught by reading the diff before commit and restored byte-identically (net diff shows only the gate additions).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 75 success criteria: SC1–SC5 all provable from the suite (26 domain-admission tests; full suite 1822 pass / 0 fail / 13 skipped)
- Phase 76 (OIDC/SSO doors + door-matrix log) composes the same `emailDomainRefusal` funnel + boot consts from `domains.js`
- Pre-existing lint debt (22 errors, e.g. `webhook-ssrf.js` no-undef, unused vars elsewhere) untouched — out of scope, none in files this plan touched

---
*Phase: 75-domain-admission-core*
*Completed: 2026-11-19*

## Self-Check: PASSED

- Files exist: domains.js, server.js (modified), mcp.js (modified), 5×src/locales/*.json, test/domain-admission.test.mjs, test/i18n-core-features.test.mjs, eslint.config.js ✓
- Commits exist: 1ac3db05, ff25cc9a, e99094e0, 1f574bd7 ✓ (git log verified; measured c1cf5188..1f574bd7 = 4 production commits)
- Final verification re-run: `node --test test/domain-admission.test.mjs` 26/26 pass · `npm test` 1822 pass / 0 fail / 13 skipped · `npm run lint` zero errors in files this plan touched
- TDD gate: RED evidence verdict RED_EVIDENCE_OK (gsd_run check tdd-red-evidence) before GREEN
