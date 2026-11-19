---
phase: 75
plan: 01
subsystem: server-auth
tags: [domain-admission, signup-door, tri-state-env, canonicalization, i18n, security]
requires: []
provides:
  - parseDomainList / canonicalizeDomain / emailFromEmail (boot resolver, server.js)
  - SIGNUP_DOMAINS / INVITE_DOMAINS boot-frozen door consts (DOM-02 ?? inheritance)
  - emailDomainRefusal funnel ({code,message}|null, exact Set.has)
  - DP-1 signup gate (code signupDomainNotAllowed)
  - D-06 source-tagged boot log lines for both admission vars
  - err.signupDomainNotAllowed key in all 5 locales
affects: [75-02 (DP-2 invite-create, DP-3 accept re-derive, MCP door all compose on the funnel + INVITE_DOMAINS)]
tech-stack:
  added: []            # zero new dependencies (stdlib only, per standing constraint)
  patterns:
    - tri-state env parse via strict `raw === undefined` (never falsiness — Pitfall 4)
    - NFKC-normalize BEFORE last-@ split (Pitfall 2) + one trailing-dot strip (Pitfall 3)
    - exact Set.has membership, never endsWith/suffix (Pitfall 1, verified bypass vector)
    - warn-and-clean boot parse (D-05), boot-frozen consts + source-tagged boot logs (D-06)
    - door-agnostic {code,message}|null funnel mirroring validateGuestInviteShape
key-files:
  created: [test/domain-admission.test.mjs]
  modified: [server.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/i18n-core-features.test.mjs, docs/DEPLOY.md]
decisions:
  - Boot-frozen consts (planner discretion per artifacts decision) — tightening takes effect on restart
  - parseDomainList placed after the logWarn/logInfo arrow consts (line ~171 zone) instead of immediately after ALLOW_SIGNUP (:135) — warn-and-clean needs logWarn, which is a const arrow defined at :170; placing the consts at :136 would hit a TDZ ReferenceError at boot
  - emailDomainRefusal carries optional (code, message) params defaulting to the signup refusal so Wave 2 doors compose the same funnel with their own keys without touching the parser
  - Signup route NFKC-normalizes the email before trim/lowercase — admitted fullwidth-＠ emails were otherwise rejected by createUser's pre-existing emailOk structural check
  - Bare-domain list entries (e.g. ' b ') resolve but can never match an email (emailOk requires a dot); the resolved-list boot log is the observable for such matrix cells
metrics:
  duration: ~35 min
  completed: 2026-11-19
  tasks: 3
status: complete
plan_head_before: 624965ff05153deda46b31fb5fecad2a384ef648
plan_head_after: a012d79a3bbc449d1b980e1586a1e11161f7c5be
commits: 3
estimate:
  tokens: 78000
actuals:
  tokens: 31100   # chars/4 over the realized diff: 9 files, +311/-2 (verified diff-size proxy; test file dominates)
  tasks: 3
  commits: 3
---

# Phase 75 Plan 01: Domain Admission Core — Signup Door + Resolver Summary

Signup domain door enforced end-to-end: boot-frozen tri-state resolver (unset=off/fail-open, set-empty=deny-all, list=allowlist), NFKC+last-@+trailing-dot canonicalization with exact Set membership, keyed 5-locale `signupDomainNotAllowed` refusal at DP-1, source-tagged D-06 boot logs, and a 14-test adversarial suite.

## What Was Built

- **Task 1 (tracer)** — `server.js`: `canonicalizeDomain`, `emailFromEmail`, pure `parseDomainList` (warn-and-clean D-05, no process.env reads inside), boot-frozen `SIGNUP_DOMAINS`/`INVITE_DOMAINS` consts with `??` inheritance (DOM-02/D-01/D-02), `emailDomainRefusal` funnel next to the helpers, DP-1 gate inserted between `passwordTooWeak` and `createUser` (guard chain untouched), one grep-able source-tagged logInfo line per var in the boot summary. `err.signupDomainNotAllowed` in all 5 catalogues same commit; pinned i18n count 1946→1947 with the test name annotated. `test/domain-admission.test.mjs` with allow/refuse/unset-fail-open/deny-all/inherit + boot-log cases.
- **Task 2 (TDD)** — DOM-07 table: 8-row adjacency table (case+trailing dot, fullwidth ＠, U+FF0E fullwidth dot, uppercase trailing dot, `evil-a.com` suffix bypass, `sub.a.com` subdomain, unlisted control) one server per row (5/hour signup throttle), symmetric trailing-dot equivalence, 6-cell env tri-state matrix (unset/unset off, `a.com/''` D-01 deny-all-own, `''/unset` inherit deny-all, `' a , B '` canonicalization, `'a,,b'` + `' , '` warn-and-clean with observable D-05 boot warnings), dedupe-idempotency cell. One canonicalization gap found and fixed (see deviations).
- **Task 3** — `docs/DEPLOY.md`: both vars in the dotenv block next to `ALLOW_SIGNUP` + tri-state posture paragraph (unset/set-empty/list, exact matching, no subdomain inheritance, warn-and-clean, boot-frozen + boot logs, non-consuming accept refusal forward reference).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fullwidth-＠ emails rejected by createUser after the funnel admitted them**
- **Found during:** Task 2 (RED: `user＠a.com` → 400 `enterValidEmail`)
- **Issue:** The route only trimmed+lowercased the email; `createUser`'s pre-existing `emailOk` regex then rejected the raw fullwidth ＠ char even though the funnel (NFKC-aware) had admitted it — violating the DOM-07 must-have truth.
- **Fix:** `.normalize('NFKC')` added before trim/lowercase in the signup route email derivation (server.js ~:6771).
- **Files modified:** server.js
- **Commit:** 1dd62738

**2. [Deviation - placement] parseDomainList block placed after the log helpers, not at :135**
- **Issue:** logWarn/logInfo are const arrows defined at server.js:169-171; boot-evaluating parseDomainList at :136 would throw a TDZ ReferenceError on the first warn-and-clean call.
- **Fix:** Parser block placed immediately after `logError` (:171), still boot-frozen before any request handler. Const posture and neighbors unchanged.
- **Commit:** 401c211a

**3. [Test-authoring fix] Two of my own Task 2 test rows were wrong (not code bugs): `x@B.COM.` against list {a,b} (domain is `b.com` ∉ list) and an 8-row shared-server table that tripped the 5/hour signup throttle.** Fixed by anchoring the cell on the resolved-list boot log and one server per row.

## Verification

- `node --test test/domain-admission.test.mjs` — 14/14 pass, 0 fail
- `npm test` — 1823 tests / 1810 pass / 0 fail / 13 skipped (error-codes extraction gate + pinned i18n count green with the new key). One pre-existing flake in `test/email-outbox.test.mjs` (timing) observed in a first run, passes standalone and in the recorded run — out of scope, not touched.
- `npm run lint` — 17 errors, all pre-existing `no-unused-vars` debt (scoped to Phase 77); zero new lint issues (my test's unused import fixed during Task 1)
- D-06 boot lines observable in captured output: `domains: ALLOW_SIGNUP_DOMAINS: ... (source: own)` / `domains: ALLOW_INVITE_DOMAINS: ... (source: own|inherit)`
- unset `ALLOW_SIGNUP_DOMAINS` fail-open regression pinned in suite (byte-identical pre-phase behavior via the same route path)

## Threat Model Compliance

- T-75-12 ✓ exact Set.has only; literal `endsWith` appears nowhere in the admission code paths
- T-75-13 ✓ NFKC before last-@ split; one split call site; trailing-dot strip; route-level NFKC added
- T-75-14 ✓ generic refusal copy in all 5 locales; suite asserts no allowed-domain reveal and a flat {code,error} payload
- T-75-15 ✓ warn-and-clean: D-05 boot warnings asserted observable for empty/whitespace entries; boot never aborts
- T-75-SC ✓ zero package installs

## Known Stubs

None — every wired surface is fully functional.

## Wave 2 Contract (75-02)

Compose DP-2 (invite-create per-email), DP-3 (accept fail-closed re-derive) and the MCP `invite_member` door purely from `emailDomainRefusal(email, INVITE_DOMAINS, '<code>', '<message>')` + the boot-frozen `INVITE_DOMAINS` const — no parser changes needed. Note: the funnel's default code is the signup key; each new door passes its own key (`err.inviteDomainNotAllowed`, `err.inviteDomainNoLonger`) and lands it in all 5 catalogues in its gate's commit. For the fail() extraction gate, keep the code literal inline at each fail() call site (the funnel returns the message; the code literal stays static in the route, as DP-1 does).

## Self-Check: PASSED

- Files exist: server.js (modified), test/domain-admission.test.mjs, 5×src/locales/*.json, test/i18n-core-features.test.mjs, docs/DEPLOY.md ✓
- Commits exist: 401c211a, 1dd62738, a012d79a ✓ (git log verified; measured 624965ff..a012d79a = 3 commits)
