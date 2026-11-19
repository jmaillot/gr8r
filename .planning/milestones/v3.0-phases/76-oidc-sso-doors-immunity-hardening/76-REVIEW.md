---
phase: 76-oidc-sso-doors-immunity-hardening
reviewed: 2026-11-19T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - server.js
  - test/helpers/oidc-idp.mjs
  - test/domain-admission-sso.test.mjs
  - test/oidc-sso.test.mjs
  - docs/DEPLOY.md
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 76: Code Review Report

**Reviewed:** 2026-11-19
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found (2 info only)

## Summary

Reviewed the Phase 76 scope (commits 4edca91d..ea34a76c against milestone base v2.7): the DP-4 OIDC JIT-provisioning gate, the DP-5 silent invite filter in SSO-07 reconciliation, the D-11 combined door-matrix boot line, the extracted fake-IdP helper, the D-12 contract suite, and the DEPLOY.md operator docs.

All security invariants were verified against actual source, not just the SUMMARY claims:

- **Exact-domain matching, no bypass lane:** `server.js` contains zero `Set.has` hits; both new doors (server.js:5134 DP-4, server.js:5188 DP-5) compose the single `emailDomainRefusal` funnel from domains.js:86-92 (exact Set membership, never endsWith; unparseable email refuses, never throws).
- **Fail-closed accept-time re-validation:** DP-5 filters on the ROW's stored `invite.email` against boot-frozen `INVITE_DOMAINS` before the length branching consumes only the filtered array (server.js:5187-5232); no `used_at` write, no log, no redirect change on refusal — loosening revives (pinned by DP-5 revive row and immunity 3).
- **PII ban holds:** DP-4 refusal logs `emailFromEmail(email)` only (server.js:5139); verified `logInfo` really is single-argument (`server.js:169`), so the SUMMARY's interpolation deviation is real and correct — a `{ domain }` payload would have been dropped. The suite asserts the local part never appears (test:88). `emailOk` (server.js:687) gates the email before the domain can reach the log.
- **Placement:** DP-4 sits in the final fresh-provision `else` arm only (server.js:5126-5141), after the `!verifiedEmail` fail-closed arm and the existing-account link arm — the anti-oracle `/login?sso=error` surface is the only client-visible result, and the suite asserts the exact Location with no extra params.
- **Unset fail-open preserved:** `parseDomainList(undefined)` → null → funnel returns null (domains.js:54, 87); pinned by test row.
- **Extraction is drift-free:** test/oidc-sso.test.mjs diff is imports-only (removed inline IdP + `http` import, added the helper import; no dangling references to `b64u`/`KID`/`PUBLIC_JWK` remain — grep-verified).
- **Docs accurate:** DEPLOY.md diff extends (does not duplicate) the Phase 75 section; every claim (fresh-provision-only gate, never-re-checked linked identities, non-consuming reconcile, matrix line legend) matches the code.

Tests were re-run during review: `test/domain-admission-sso.test.mjs` 18/18, `test/oidc-sso.test.mjs` 47/47, `test/domain-admission.test.mjs` 32/32 — all pass, 0 fail.

No critical or warning findings. The two info items below are test-hygiene nits; nothing blocks ship.

## Info

### IN-01: Dead assertion in immunity 3 — `invite` variable is fetched but its value is never checked

**File:** `test/domain-admission-sso.test.mjs:411-416`
**Issue:** `const invite = db.prepare('select used_at from invites where email = ?').get('member@x.com')` runs against TWO invite rows sharing one email (A consumed, B pending); `.get()` returns an arbitrary first row (in practice the consumed A row), and the code then only asserts `assert.ok(invite, 'the invite rows survive the refusal')` — a check that passes even if every row were consumed. The real non-consumption guarantee comes from the count assertion on line 413, so this is not a contract hole, but the named fetch and its message ("the invite rows survive the refusal") suggest a guarantee it does not deliver. The inline comment on line 412 acknowledges the ambiguity but the assertion is still vacuous.
**Fix:** Either drop the `invite` fetch entirely (line 413 already pins non-consumption), or select the B row by its token: `db.prepare('select used_at from invites where token_hash = ?').get(sha256(tokenB))` and assert `used_at === null` explicitly.

### IN-02: D-11 matrix line has no wildcard ('*') test row

**File:** `test/domain-admission-sso.test.mjs:441-523`
**Issue:** The D-11 section covers own-lists, inherit both directions, deny-all, and fully-off — but not the wildcard tri-state. `domainListLog` (server.js:8936) renders `isWildcardList` as `*`, and the funnel treats WILDCARD as allow-all, so the behavior is correct by construction, but the operator-facing matrix legend in DEPLOY.md ("`off` = variable unset, `deny-all` = set-but-empty, otherwise the canonicalized list") does not mention the `*` case either, and no D-11 row pins it. A future refactor of `domainListLog` could silently render wildcard as an empty/garbage value with no test failing.
**Fix:** Add one cheap D-11 row booting with `ALLOW_SIGNUP_DOMAINS: '*'` and asserting the matrix line shows `signup: *` and `sso-jit: *`; optionally add `'*' = wildcard` to the DEPLOY.md legend sentence.

---

_Reviewed: 2026-11-19_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
