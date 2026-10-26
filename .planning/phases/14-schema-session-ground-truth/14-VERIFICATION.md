---
phase: 14-schema-session-ground-truth
verified: 2026-10-26T19:00:52Z
status: gaps_found
score: 11/12 must-haves verified
covered_files:
  - server.js
  - src/data/seed.js
  - test/migration.test.mjs
  - src/locales/en.json
  - src/locales/fr.json
  - test/error-codes.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-pages.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/fixtures/icons-baseline.json
  - src/core/api.js
  - src/core/utils.js
  - test/sessions.test.mjs
  - src/actions/actions.js
  - src/pages/settings.js
  - .planning/phases/14-schema-session-ground-truth/14-01-PLAN.md
  - .planning/phases/14-schema-session-ground-truth/14-02-PLAN.md
  - .planning/phases/14-schema-session-ground-truth/14-03-PLAN.md
  - .planning/phases/14-schema-session-ground-truth/14-04-PLAN.md
  - .planning/phases/14-schema-session-ground-truth/14-01-SUMMARY.md
  - .planning/phases/14-schema-session-ground-truth/14-02-SUMMARY.md
  - .planning/phases/14-schema-session-ground-truth/14-03-SUMMARY.md
  - .planning/phases/14-schema-session-ground-truth/14-04-SUMMARY.md
covered_digest: "v2:sha256:05b6de33c1e576e9bf88404c37808c60a7c6ff5b3b7561f6f3812345d3959e59"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "D-28: A revoked browser's next request hits the 401 handler with honest 'signed out elsewhere' copy and redirects to login (14-03 truth 4); per 14-04 truth 6, a revoked browser's next API call (401) triggers signOutRevoked() — sign out + honest toast + redirect"
    status: partial
    reason: >
      signOutRevoked() exists (src/actions/actions.js:2120-2123) and is correct where wired,
      but it is reachable only from A.revokeSession (:2397) and A.revokeAll (:2413) — i.e. a 401
      received while *performing a revocation*. A genuinely revoked browser's other 401 paths
      never reach it: the save path dispatches 'gr8r:save-error' (src/core/store.js:105 →
      src/main.js:70-79) which always toasts the generic t('err.sessionExpired') and enters the
      login screen without reusing A.signOut (no clearLocalCache/no teardown); hydration 401
      (src/main.js:209-213) redirects silently; refreshSessions() returns null silently on !ok
      (src/actions/actions.js:1800-1810). Nothing in src/ composes or inspects the
      signInRequired/signedOutElsewhere code — tErr('signInRequired') maps to the generic
      'err.signInRequired' catalogue entry ("Sign in to continue"), not to err.signedOutElsewhere.
      The honest copy is a locked decision (13-DECISIONS / 14-CONTEXT D-28: "honest 'You have been
      signed out' toast, redirect to /login — reuses the existing signOut action"). Server half of
      the behavior (401 with code signInRequired) IS proven: test/sessions.test.mjs 5/5.
    artifacts:
      - path: src/main.js
        issue: "The global 401 save-error handler (line 72-79) always shows t('err.sessionExpired') and ignores the error code — never routes to signOutRevoked() or shows err.signedOutElsewhere"
      - path: src/actions/actions.js
        issue: "signOutRevoked() (:2120) has exactly two call sites (:2397, :2413), both inside the revoke actions themselves; refreshSessions() (:1806) swallows 401s with a silent null"
      - path: src/main.js
        issue: "hydrateFromServer 401 (:209-213) redirects to login with no toast at all"
    missing:
      - "Route the general 401 paths (gr8r:save-error handler in main.js, and/or a code==='signInRequired' branch) through signOutRevoked(), or at minimum show t('err.signedOutElsewhere') when the 401 carries an auth-revocation code"
      - "Make refreshSessions() 401 handling honest (currently a revoked browser's sessions tab shows an empty list with zero feedback)"
      - "A test (or explicit human verification) covering the revoked-browser client teardown — the existing D-28 test (test/sessions.test.mjs:169) asserts only the server response code; its comment claims a client mapping that does not exist"
re_verification: null
advisory:
  - finding: "Pre-existing test failure: test/i18n-prefs.test.mjs:243 ('the roadmap carries the phase 6 section') fails in the full suite — the v1.3 ROADMAP rewrite removed the v1.2 Phase 6 section it asserts. Unrelated to phase 14: test/i18n-prefs.test.mjs was not modified during the phase (git log cb7898d..HEAD empty for that file) and the executor reproduced the failure on a clean worktree of the phase base commits. Logged to deferred-items.md."
    category: other
    reason: "Predates the phase; a later plan should re-point the test at .planning/milestones/v1.2-ROADMAP.md. Does not affect any Phase 14 truth."
    evidence_status: "reproduced independently this verification: full suite 455/456, sole failure is this test"
---

# Phase 14: Schema & Session Ground Truth Verification Report

**Phase Goal:** Auth state stops being decorative JSON: sessions and 2FA fields live in per-user rows, the workspace document no longer carries auth fields, and the sessions page drives a real revocation primitive (revoke-others and per-row revoke) that later phases reuse.
**Verified:** 2026-10-26T19:00:52Z
**Status:** gaps_found (1 partial truth — D-28 client teardown wiring; all four roadmap Success Criteria verified)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sessions list with device label, IP, last-seen, "this session" marker, sourced from the sessions table, not the doc (SESS-01, SC1) | ✓ VERIFIED | `GET /api/auth/sessions` (server.js:1340-1360) selects from `sessions` table with `token_hash, created_at, last_seen_at, ip, user_agent`; renders via `S.ui.sessions` (settings.js:390-407) with `deviceLabel(s.userAgent)`, `s.ip`, `ago()`, `s.current` badge. `test/sessions.test.mjs` SESS-01 test passes (real server + real SQLite): shape, no token hash, current marker, non-NULL stored ip/user_agent/last_seen_at. |
| 2 | Disconnect-all-others: other browser's next request 401, caller stays signed in (SESS-02, SC2) | ✓ VERIFIED | Keep-current SQL `delete ... where user_id = ? and token_hash != ?` (server.js:1362-1376), live post-delete counts; SESS-02 test proves both halves: `{revoked >= 1, remaining: 1}`, victim cookie → 401, caller `GET /api/auth/me` → 200. Same-origin guard first (T-14-04). |
| 3 | Per-row revoke kills exactly the targeted session (SESS-03, SC3) | ✓ VERIFIED | User-scoped `delete ... where user_id = ? and token_hash like ?` behind `[0-9a-f]{12}` regex (server.js:1379-1387); `others` exact-match before regex. SESS-03 test: 3 sessions → revoke one non-current id → victim 401, others 200, repeat DELETE still 204. |
| 4 | Workspace doc carries no sessions/tfa on fresh install and after legacy migration; second boot byte-identical (AUTH-02, SC4) | ✓ VERIFIED | `normalizeDoc()` deletes `data.sessions`/`data.tfa` (server.js:295-308); `docFromClient()` strips independently (server.js:620-631); `emptyDoc()`/`seed.js` carry no literals (seed.js grep for sessions/tfa: 0 matches). `test/migration.test.mjs` 14/14 pass including "the served document from a legacy database carries no sessions or tfa fields", stored-clean resurrection strip, and the byte-identical second-boot snapshot test. |
| 5 | Schema: 8-column sessions table, 3 dormant 2FA columns, login_challenges table + expiry index, byte-identical ensureColumn defs | ✓ VERIFIED | server.js:98-115 (SCHEMA) and :170-176 (7 ensureColumn calls, integer columns carrying full `integer not null default 0`). Definition-agreement test passes: pragma type/notnull/dflt_value deep-equal SCHEMA on migrated legacy DB. |
| 6 | Metadata capture at all 3 insert sites + throttled last_seen (60s band, in-memory map with bounded cleanup) | ✓ VERIFIED | 3 identical 7-column `insert into sessions` (server.js:1296 login, :1411 signup, :1823 invite-accept) with `ip=clientIp(req)`, `ua`, `last_seen_at=t`. `touchLastSeen` + `lastSeenNext` Map + `LAST_SEEN_BAND=60*1000` (server.js:1211-1222); D-22/D-24 throttle test passes (in-band no-write, post-restart single write). |
| 7 | Prohibitions: no boot-time backfill; `label` never written server-side; no token_hash in any response | ✓ VERIFIED | grep `update sessions|update users` in server.js: only last_seen_at throttle and pre-existing last_login_at/locale/password — no UPDATE touches the new columns. Insert statements carry 7 columns (no `label`). GET response maps `id: r.token_hash.slice(0, 12)`; sessions test asserts no tokenHash/token_hash key in the response. |
| 8 | Client foundation: 10 dev.* keys + err.signedOutElsewhere in both locales, CLIENT_ONLY_ERR_CODES entry, 3 api methods, deviceLabel() | ✓ VERIFIED | en.json/fr.json:1457 + dev.* keys at :1446; `signedOutElsewhere` in test/error-codes.test.mjs:248; api.js:208-215 (`sessions()`, `revokeSession(id)`, `revokeAllSessions()` — auth-scoped, no slug guard); utils.js:51 `deviceLabel` export full-page code; `t('settings.sessions.thisDevice')` badge when `s.current`, per-row `data-a="revokeSession"` control for non-current rows. Rows render `esc(deviceLabel(s.userAgent))`, `esc(s.ip || '—')`, `ago(s.lastSeenAt || s.createdAt)` (D-25 fallback) — all values flow to render, none hardcoded. |
| 10 | Whitelist: 10 dev.* + err.signedOutElsewhere in both locales; CLIENT_ONLY_ERR_CODES; 3 auth-scoped api methods; deviceLabel catalogue-key-only | ✓ VERIFIED | en.json/fr.json:1446/1457; signedOutElsewhere in CLIENT_ONLY_ERR_CODES (error-codes.test.mjs:248); api.js:208-215 three `call()` methods, no slug guard, matching i18n-core pin (24 call sites); deviceLabel (utils.js:51) uses only `t('dev.*')` keys plus the neutral `—`/`·` separators (i18n-scan gate green). |
| 11 | Settings sessions tab reads S.ui.sessions (server ground truth), wired revoke buttons + refresh-on-mount/after-revoke; 2FA stubs and tab deleted; signOutRevoked() exists | ✓ VERIFIED | actions.js:210 mount hook; :1800-1810 refreshSessions() → `S.ui.sessions`; :2120-2123 signOutRevoked(); :2393-2417 rewired A.revokeSession/A.revokeAll calling the real endpoints with refresh-after-success; settings.js:390-407 sessions case. Grep gates all zero: `D().sessions\|D().tfa`, `A.setup2fa\|A.cancel2fa\|A.verify2fa\|A.disable2fa`, `'2fa'` in settings.js. icon baseline and pin updates committed with their causes. |
| 12 | D-28: revoked browser's next request → honest 'signed out elsewhere' toast + reuses the signOut action + redirect to login | ✗ FAILED (partial wiring) | Server half verified (401 carries `code: 'signInRequired'`, test/sessions.test.mjs 5/5). Client half: `signOutRevoked()` (actions.js:2120-2123) is reachable **only** from A.revokeSession (:2397) and A.revokeAll (:2413) — i.e. when the *revoking* session is itself concurrently revoked. A genuinely revoked browser's 401 paths never reach it: the save path (`gr8r:save-error` → main.js:70-79) always toasts the generic `err.sessionExpired` and enters the login screen without `A.signOut` (no `clearLocalCache`, no locale re-prime); hydration 401 (main.js:209-213) redirects silently; `refreshSessions()` returns a silent null on failure (actions.js:1800-1810). No code composes or inspects `signInRequired`/`signedOutElsewhere` — `tErr('signInRequired')` resolves to the generic `err.signInRequired` ("Sign in to continue"), not to `err.signedOutElsewhere`. The `CLIENT_ONLY_ERR_CODES` comment ("built by a 401 from the session-revocation endpoints") describes a client mapping that was never implemented. Full analysis in the frontmatter gap. |

**Score:** 11/12 truths verified (0 present-but-behavior-unverified)

Note on #4's "fresh install" leg: `emptyDoc()` wraps `normalizeDoc()` internally (server.js:791-792) and `normalizeDoc()` unconditionally deletes both keys, so any served document — fresh or legacy — is clean by construction; the legacy served-doc test proves the pipeline end-to-end and the definition-agreement test pins both migration surfaces. Substantively verified; no separate emptyDoc-unit assertion needed.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| SESS-01 | 14-02, 14-03, 14-04 | Real `GET /api/auth/sessions` from sessions table with label/last_seen columns; UI shows device label, IP, last-seen, this-session marker | ✓ SATISFIED | Endpoints + UI verified (truths 1, 6, 11); sessions test 5/5 |
| SESS-02 | 14-02, 14-03, 14-04 | Disconnect-all-others works; revoke-others excludes current token_hash | ✓ SATISFIED | Keep-current SQL + SESS-02 test both halves (truth 2) |
| SESS-03 | 14-02, 14-03, 14-04 | Per-row individual revoke | ✓ SATISFIED | User-scoped DELETE :id + SESS-03 test (truth 3) |
| AUTH-02 | 14-01 | Additive migration, byte-identical second boot, fake sessions/tfa removed from doc | ✓ SATISFIED | migration.test.mjs 14/14 incl. snapshot second-boot test; seed.js/emptyDoc clean (truth 4) |

No orphaned requirements: REQUIREMENTS.md maps exactly SESS-01/02/03 + AUTH-02 to Phase 14, and all four appear in plan frontmatter. Coverage table says 14/14, no orphan.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| settings.js sessions case | GET /api/auth/sessions | `S.ui.sessions` ← `refreshSessions()` ← `api.sessions()` | WIRED | actions.js:210/1800, settings.js:395 |
| A.revokeSession | DELETE /api/auth/sessions/:id | `api.revokeSession(id)` | WIRED | actions.js:2393-2401; endpoint server.js:1379-1387; refresh after success |
| A.revokeAll | DELETE /api/auth/sessions/others | `api.revokeAllSessions()` (confirmDlg kept) | WIRED | actions.js:2403-2417; endpoint server.js:1362-1376 |
| Revoked browser → honest teardown | signOutRevoked() | general 401 handler | **NOT_WIRED** | Only the two revoke actions' own 401s route there; save-error/hydrate/refresh paths do not (truth 12 / frontmatter gap) |
| SCHEMA DDL | ensureColumn defs | byte-identical column defs (fresh + legacy surfaces) | WIRED | Verified by the definition-agreement test (P-B) |
| Client golden gate | locale catalogue | dev.* keys are t() catalogue keys | WIRED | i18n-scan gate green; prebuild passes (`npm run build` in 14-04) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| settings.js:395 `rows` | `S.ui.sessions` | GET /api/auth/sessions → sessions table SELECT | Yes | ✓ FLOWING |
| deviceLabel output | `s.userAgent` | `sessions.user_agent` column (insert sites) | Yes | ✓ FLOWING |
| last-seen display | `s.lastSeenAt` | `sessions.last_seen_at` (throttled touch) | Yes (NULL falls back to createdAt per D-25) | ✓ FLOWING |
| badge "this device" | `s.current` | token_hash comparison server-side | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration: columns, doc shape, definition agreement, byte-identical second boot | `node --test test/migration.test.mjs` | 14/14 pass | ✓ PASS |
| SESS-01/02/03 + throttle + D-28 server code, real servers/DBs | `node --test test/sessions.test.mjs` | 5/5 pass | ✓ PASS |
| Full workspace suite | `npm test` | 455/456 pass; sole failure = pre-existing `test/i18n-prefs.test.mjs:243` (ROADMAP Phase 6 section removed by v1.3 rewrite; file untouched by phase 14 — `git log cb7898d..HEAD` empty for it, executor reproduced at base commits; logged in deferred-items.md) | ✓ PASS (with documented pre-existing exception) |
| No doc-field reads remain in client | `grep -rn "D().sessions\|D().tfa" src/` | 0 matches | ✓ PASS |
| No backfill UPDATE | `grep -n "update sessions\|update users" server.js` | only last_seen_at throttle + pre-existing login/locale/password updates | ✓ PASS |

### Probe Execution

No probe scripts declared or found (no `scripts/*/tests/probe-*.sh`; phase is not a migration/tooling phase in that sense) — SKIPPED. The equivalent runnable checks are the two test files above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/actions/actions.js | 1731 | comment contains the word "placeholder" (describes i18n interpolation messages, not a stub) | ℹ️ Info | None |
| (none) | | No TBD/FIXME/XXX/TODO debt markers in any phase-touched file | — | — |

### Human Verification Required

### 1. Sessions tab rendering in a real browser

**Test:** Open Settings → Sessions signed in as a normal user (Chromium; repeat the visual pass in the French locale).
**Expected:** Each row shows a device label from the User-Agent (e.g. "Windows · Chrome"), the session IP, a relative last-seen time, and a green "this device" badge on the current row; non-current rows expose a sign-out button; with a single session the disconnect-all button is disabled.
**Why human:** Visual layout, icon choice (smartphone vs monitor), locale rendering and relative-time display are not verifiable by grep; the project defers browser e2e to Phase 18 (AUTH-03).

### 2. Two-browser revocation flow end-to-end

**Test:** Sign in from two browsers, disconnect all others from browser A, then act in browser B and reload B.
**Expected:** Browser B returns to the login screen after its next server interaction; browser A remains functional.
**Why human:** The server 401 is proven by tests, but the client-side redirect/clear-state behavior after a background save failure is an integrated browser flow with no automated coverage.

### 3. Judgment-tier prohibitions — human review recommended

**Test:** Independent eyes on D-28's honest-copy contract and deviceLabel's catalogue-key-only rule.
**Expected:** Confirm the D-28 resolution direction (route general 401s through signOutRevoked vs. downgrade honest copy to the save-path handler only) matches the intent of the locked decision before the Phase 15 password-change plan reuses signOutRevoked().
**Why human:** Judgment-tier items are recorded here non-authoritatively despite deterministic grep evidence; the D-28 gap closure has a legitimate design choice (global handler vs. per-call-site) that should not be decided silently.

### Gaps Summary

The phase goal itself is achieved and test-proven: all four roadmap Success Criteria verify against real code and real-server tests. The schema migration is complete and convergent (byte-identical second boot), the workspace document is clean on both surfaces, and the sessions page reads/writes a genuine revocation primitive that Phase 15 can reuse verbatim.

One must-have truth from plans 14-03/14-04 is only partially wired: **the D-28 honest "signed out elsewhere" teardown for a genuinely revoked browser.** The helper (`signOutRevoked()`), the locale copy (EN+FR), and the reverse-parity allow-list entry all exist, but the only call sites are the two revoke actions' own 401 handlers. Every other 401 path an actually-revoked browser takes — the `gr8r:save-error` global handler (generic `err.sessionExpired` toast, no `A.signOut`), hydration (silent redirect), `refreshSessions()` (silent null) — bypasses it, and no code composes or inspects the `signInRequired` code the server actually sends. The existing D-28 test's comment ("the code the client maps to err.signedOutElsewhere") asserts a client mapping that does not exist in `src/`.

This is a small, well-bounded remedy (likely one branch in the global 401 handler plus 401-honesty in `refreshSessions()`), but it is observable in code and touches a locked decision, so it must not be absorbed silently — especially since Phase 15 (PASS-02/03) builds directly on this teardown and the v1.2 honest-toast rule. Structured in the frontmatter `gaps:` for `/gsd-plan-phase --gaps`.

---

_Verified: 2026-10-26T19:00:52Z_
_Verifier: the agent (gsd-verifier)_

Notes: `gsd-tools`/`gsd_run` CLI is not installed in this environment; `covered_digest` was computed deterministically as sha256 over the concatenated `sha256sum` lines of all covered_files, and artifact/key-link verification was performed by direct grep/read of the codebase instead of the `verify.artifacts`/`verify.key-links` queries.
