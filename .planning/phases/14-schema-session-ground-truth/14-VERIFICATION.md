---
phase: 14-schema-session-ground-truth
verified: 2026-10-27T00:00:00Z
status: passed
score: 12/12 must-haves verified
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
  - test/auth-revoked.test.mjs
  - test/i18n-prefs.test.mjs
  - src/actions/actions.js
  - src/main.js
  - src/pages/settings.js
  - .planning/phases/14-schema-session-ground-truth/14-01-PLAN.md
  - .planning/phases/14-schema-session-ground-truth/14-02-PLAN.md
  - .planning/phases/14-schema-session-ground-truth/14-03-PLAN.md
  - .planning/phases/14-schema-session-ground-truth/14-04-PLAN.md
  - .planning/phases/14-schema-session-ground-truth/14-05-PLAN.md
  - .planning/phases/14-schema-session-ground-truth/14-01-SUMMARY.md
  - .planning/phases/14-schema-session-ground-truth/14-02-SUMMARY.md
  - .planning/phases/14-schema-session-ground-truth/14-03-SUMMARY.md
  - .planning/phases/14-schema-session-ground-truth/14-04-SUMMARY.md
  - .planning/phases/14-schema-session-ground-truth/14-05-SUMMARY.md
covered_digest: "v2:sha256:e5eaa7a84dd8da47a92837ba70619cb30c4772a70a68726e33dbe8272d6b6026"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "D-28: a revoked browser's next mid-session API request — document save (gr8r:save-error), boot hydration, settings sessions refresh, or the revoke actions themselves — produces the honest err.signedOutElsewhere toast, a full sign-out teardown, and the login screen, via the central registerAuthRevokedHandler intercept in api.js call() (proven by test/auth-revoked.test.mjs 6/6)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "Sessions tab visual rendering in a real browser (device label from UA, IP, relative last-seen, this-device badge, disabled revoke-all at one session) and the two-browser revocation flow end-to-end (browser B lands on login with the honest toast after its next server interaction)"
    addressed_in: "Phase 18 — Closing Verification"
    evidence: "ROADMAP Phase 18 SC2: 'Chromium e2e covers sessions revocation, password change + revocation, and the full 2FA login path in both locales (AUTH-03)'; SC4 assigns the real-device human UAT to the same phase. The project consciously defers browser e2e there; the client teardown contract itself is now behaviorally proven headlessly (test/auth-revoked.test.mjs 6/6) and the server half by test/sessions.test.mjs 5/5."
advisory: []
behavior_unverified_items: []
coincidental_reliance_items: []
---

# Phase 14: Schema & Session Ground Truth Verification Report

**Phase Goal:** Auth state stops being decorative JSON: sessions and 2FA fields live in per-user rows, the workspace document no longer carries auth fields, and the sessions page drives a real revocation primitive (revoke-others and per-row revoke) that later phases reuse.
**Verified:** 2026-10-27T00:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (14-05)

## Goal Achievement

Every must-have from the prior verification's frontmatter was re-read against the live codebase this session; no prior verdict was carried on trust. The single prior gap (truth 12 / D-28 client teardown wiring) is **closed** with behavioral test evidence, and **no truth regressed** during 14-05's client edits.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sessions list with device label, IP, last-seen, "this session" marker, sourced from the sessions table, not the doc (SESS-01, SC1) | ✓ VERIFIED | `GET /api/auth/sessions` (server.js:1340-1360) selects from the `sessions` table (`token_hash, created_at, last_seen_at, ip, user_agent`); renders via `S.ui.sessions` (settings.js:395-407) with `deviceLabel(s.userAgent)`, `esc(s.ip \|\| '—')`, `ago(s.lastSeenAt \|\| s.createdAt)` (D-25 fallback), `s.current` badge. `test/sessions.test.mjs` SESS-01 test passes against a real server + real SQLite. |
| 2 | Disconnect-all-others: other browser's next request 401, caller stays signed in (SESS-02, SC2) | ✓ VERIFIED | Keep-current SQL `delete ... where user_id = ? and token_hash != ?` (server.js:1370), live post-delete counts (:1371-1372); SESS-02 test proves both halves: `{revoked >= 1, remaining: 1}`, victim cookie → 401, caller `GET /api/auth/me` → 200. `sameOrigin` guard first (server.js:1365). |
| 3 | Per-row revoke kills exactly the targeted session (SESS-03, SC3) | ✓ VERIFIED | User-scoped `delete ... where user_id = ? and token_hash like ?` behind the `[0-9a-f]{12}` regex (server.js:1375-1381); `others` exact-match before the regex (:1362-1364). SESS-03 test: 3 sessions → revoke one non-current id → victim 401, others 200, repeat DELETE still 204. |
| 4 | Workspace doc carries no sessions/tfa on fresh install and after legacy migration; second boot byte-identical (AUTH-02, SC4) | ✓ VERIFIED | `normalizeDoc()` deletes `data.sessions`/`data.tfa` (server.js:305-306); `docFromClient()` strips independently (:629-630); `emptyDoc()`/`seed.js` carry no literals (grep: 0 matches). `test/migration.test.mjs` 14/14 pass, including the legacy served-doc strip, the stored-clean write-side strip, and the byte-identical second-boot snapshot. |
| 5 | Schema: 8-column sessions table, 3 dormant 2FA columns, login_challenges table + expiry index, byte-identical ensureColumn defs | ✓ VERIFIED | SCHEMA (server.js:85-111): sessions 8 columns, users +3 two_fa columns, login_challenges 4 columns + `login_challenges_expiry` index; 7 new ensureColumn calls (:170-176) with defs matching the DDL. Definition-agreement test (pragma type/notnull/dflt_value deep-equal on the migrated legacy DB) passes. |
| 6 | Metadata capture at all 3 insert sites + throttled last_seen (60s band, in-memory map with bounded cleanup) | ✓ VERIFIED | 3 identical 7-column `insert into sessions` (server.js:1296, :1411, :1823) with `ip=clientIp(req)`, `ua`, `last_seen_at=t`. `touchLastSeen` + `lastSeenNext` Map + `LAST_SEEN_BAND` (server.js:1209-1222); the D-22/D-24 throttle test passes (in-band no-write, post-band write). |
| 7 | Prohibitions: no boot-time backfill; `label` never written server-side; no token_hash in any response | ✓ VERIFIED | The only `update sessions` in server.js is the throttle (line 1220) — no UPDATE touches the new columns; inserts carry 7 columns (no `label`); the GET response maps `id: r.token_hash.slice(0, 12)` (server.js:1352) and `current: r.token_hash === tokenHash` (a comparison, not a leak) — sessions test asserts no tokenHash/token_hash key in the response. The CLI `--set-password` sweep at :2272 is a pre-existing admin operation, not the revocation primitive. |
| 8 | Client foundation: 10 dev.* keys + err.signedOutElsewhere in both locales, CLIENT_ONLY_ERR_CODES entry, 3 api methods, deviceLabel() | ✓ VERIFIED | en.json/fr.json:1456 `err.signedOutElsewhere` (honest copy in both); 10 `dev.*` keys each (grep count 10/10); `signedOutElsewhere` in CLIENT_ONLY_ERR_CODES (test/error-codes.test.mjs:243) with the truthful central-teardown comment; api.js:236-243 three `call()` methods, auth-scoped, no slug guard; utils.js:51 `deviceLabel` export. All values flow to render — none hardcoded. |
| 9 | Whitelist: 10 dev.* + err.signedOutElsewhere in both locales; CLIENT_ONLY_ERR_CODES; 3 auth-scoped api methods; deviceLabel catalogue-key-only | ✓ VERIFIED | Same artifacts as truth 8, re-confirmed this session after 14-05's catalogue edits: the retired `err.sessionExpired` is gone from both catalogues and the allowlist, the reverse-parity test passes (error-codes 24/24), `node scripts/i18n-scan.mjs` exits 0 (0 findings), and `deviceLabel` uses only `t('dev.*')` keys plus the neutral `—`/`·` separators. |
| 10 | Settings sessions tab reads S.ui.sessions (server ground truth), wired revoke buttons + refresh-on-mount/after-revoke; 2FA stubs and tab deleted; signOutRevoked() exists | ✓ VERIFIED | actions.js:210 mount hook (`r === 'settings' && p.sec === 'sessions'`); :1800-1808 refreshSessions() → `S.ui.sessions`; :2397-2427 rewired A.revokeSession/A.revokeAll calling the real endpoints with refresh-after-success (D-29); settings.js:389-409 sessions case reading `S.ui.sessions` with deviceLabel/ago/this-device badge/per-row revoke/disabled revokeAll at ≤1 row. Grep gates all zero: `D().sessions\|D().tfa`, `A.setup2fa\|A.cancel2fa\|A.verify2fa\|A.disable2fa`, `'2fa'` in settings.js, no `s.loc`/`s.dev`/`s.at` legacy field names. |
| 11 | D-28 server half: a revoked browser's next request 401s with `code: 'signInRequired'` | ✓ VERIFIED | server.js requireUser → `fail(res, 401, 'signInRequired', 'Sign in to continue')`; test/sessions.test.mjs D-28 test passes 5/5; its assertion message now truthfully cites test/auth-revoked.test.mjs as the client-side proof (no lying comment). |
| 12 | D-28 client teardown wiring (the prior gap): a revoked browser's next mid-session API request produces the honest err.signedOutElsewhere toast, a full sign-out teardown, and the login screen — no silent redirect; fires exactly once per revocation; boot-time no-account 401 stays silent; latch re-arms after re-auth | ✓ VERIFIED | **Closed by 14-05.** `registerAuthRevokedHandler(fn)` export + once-per-revocation latch + intercept in `call()` (api.js:44-53, :80-89) firing only on status 401 + `data?.code === 'signInRequired'` + `state.user` + clear latch; `applyUser()` re-arms (:93-98). actions.js registers `signOutRevoked` at module scope (:2127) — the teardown awaits `A.signOut()` (full teardown: flushPending, logout, clearLocalCache, locale re-prime, login screen) then toasts `t('err.signedOutElsewhere')` (:2123-2126). Per-site 401 branches in the revoke actions retired to bare early returns (:2403, :2421); non-401 fallbacks swapped to the catalogued `err.serverUnreachable` (:2404, :2422). main.js save-error 401 branch keeps the instant login-screen transition with no generic toast (:70-81); hydrate-401 branch keeps the instant redirect and documents that the honest toast arrives from the teardown (:212-218). **Behavioral proof:** test/auth-revoked.test.mjs 6/6 — the real api.js module with stubbed fetch proves boot-guard (spy 0), fire-once (spy 1), latch (still 1 across two 401s), re-arm (spy 2 after re-auth), plus source pins on the registration and gating. Every 401 path a genuinely revoked browser takes flows through `call()`, so the mapping the old test comment claimed now exists and is pinned. |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| SESS-01 | 14-02, 14-03, 14-04 | Real `GET /api/auth/sessions` from sessions table with label/last_seen columns; UI shows device label, IP, last-seen, this-session marker | ✓ SATISFIED | Endpoints + UI verified (truths 1, 6, 10); sessions test 5/5 |
| SESS-02 | 14-02, 14-03, 14-04 | Disconnect-all-others works; revoke-others excludes current token_hash | ✓ SATISFIED | Keep-current SQL + SESS-02 test both halves (truth 2) |
| SESS-03 | 14-02, 14-03, 14-04 | Per-row individual revoke | ✓ SATISFIED | User-scoped DELETE :id + SESS-03 test (truth 3) |
| AUTH-02 | 14-01 | Additive migration, byte-identical second boot, fake sessions/tfa removed from doc | ✓ SATISFIED | migration.test.mjs 14/14 incl. snapshot second-boot test; seed.js/emptyDoc clean (truth 4) |

No orphaned requirements: REQUIREMENTS.md maps exactly SESS-01/02/03 + AUTH-02 to Phase 14, all four appear in plan frontmatter (14-05 is `gap_closure: true` with `requirements: []` — correct for a gap-closure plan), and coverage is 14/14 with no orphan.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| settings.js sessions case | GET /api/auth/sessions | `S.ui.sessions` ← `refreshSessions()` ← `api.sessions()` | WIRED | actions.js:210/1800, settings.js:395 |
| A.revokeSession | DELETE /api/auth/sessions/:id | `api.revokeSession(id)` | WIRED | actions.js:2397-2408; endpoint server.js:1375-1387; refresh after success |
| A.revokeAll | DELETE /api/auth/sessions/others | `api.revokeAllSessions()` (confirmDlg kept) | WIRED | actions.js:2409-2427; endpoint server.js:1362-1373 |
| server 401 `signInRequired` (server.js requireUser) | `call()` intercept in api.js | `res.status === 401 && data?.code === 'signInRequired' && state.user && !revokedHandled` | WIRED | api.js:86; **pinned behaviorally** by test/auth-revoked.test.mjs (fire/latch/boot-guard/re-arm) |
| `call()` intercept | `signOutRevoked()` in actions.js | `registerAuthRevokedHandler(signOutRevoked)` registered at module load | WIRED | actions.js:29 (import) + :2127 (registration); source-as-text pin in auth-revoked test |
| `signOutRevoked()` | A.signOut teardown + honest toast | existing 14-04 implementation | WIRED | actions.js:2123-2126 (`await A.signOut(); toast(t('err.signedOutElsewhere'))`) |
| save-error/hydrate/refresh 401 paths | central teardown | all flow through `call()` | WIRED | main.js:70-81 (no generic toast), :212-218 (documented), actions.js:1803 (silent null is intentional — honesty delivered centrally) |
| SCHEMA DDL | ensureColumn defs | byte-identical column defs (fresh + legacy surfaces) | WIRED | Definition-agreement test (migration.test.mjs 14/14) |
| Client golden gate | locale catalogue | dev.* keys are t() catalogue keys | WIRED | `node scripts/i18n-scan.mjs` exits 0 this session |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| settings.js:395 `rows` | `S.ui.sessions` | GET /api/auth/sessions → sessions table SELECT | Yes | ✓ FLOWING |
| deviceLabel output | `s.userAgent` | `sessions.user_agent` column (3 insert sites) | Yes | ✓ FLOWING |
| last-seen display | `s.lastSeenAt` | `sessions.last_seen_at` (throttled touch; NULL → createdAt per D-25) | Yes | ✓ FLOWING |
| badge "this device" | `s.current` | token_hash comparison server-side | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| D-28 client teardown contract (fire-once, latch, boot guard, re-arm, source pins) | `node --test test/auth-revoked.test.mjs` | 6/6 pass | ✓ PASS |
| SESS-01/02/03 + throttle + D-28 server code, real servers/DBs | `node --test test/sessions.test.mjs` | 5/5 pass | ✓ PASS |
| Migration: columns, doc shape, definition agreement, byte-identical second boot | `node --test test/migration.test.mjs` | 14/14 pass | ✓ PASS |
| Error-code bilateral parity incl. the sessionExpired retirement | `node --test test/error-codes.test.mjs` | 24/24 pass | ✓ PASS |
| i18n golden gate | `node scripts/i18n-scan.mjs` | 0 findings, exit 0 | ✓ PASS |
| Full workspace suite | `npm test` | **462/462 pass, 0 fail** — the prior advisory's pre-existing `test/i18n-prefs.test.mjs:243` failure is resolved (commit 30ea824 re-points the test at the v1.2 milestone archive); no regressions from 14-05's client edits | ✓ PASS |
| No doc-field reads remain in client | `grep -rn "D().sessions\|D().tfa" src/` | 0 matches | ✓ PASS |
| sessionExpired fully retired | `grep -rln "sessionExpired" src/ test/` | no files | ✓ PASS |
| No 2FA stubs remain | `grep -rn "A.setup2fa\|A.cancel2fa\|A.verify2fa\|A.disable2fa" src/` | 0 matches | ✓ PASS |
| Zero-deps held | `git diff HEAD -- package.json` | empty | ✓ PASS |

### Probe Execution

No probe scripts declared or found (no `scripts/*/tests/probe-*.sh`; the phase is not a migration/tooling phase in that sense) — SKIPPED. The equivalent runnable checks are the behavioral spot-checks above, all green.

### Requirements Cross-Reference Note

Every requirement ID mapped to Phase 14 in REQUIREMENTS.md (SESS-01, SESS-02, SESS-03, AUTH-02) appears in at least one plan's frontmatter and is satisfied by verified code + tests. No orphaned requirements, no duplicates.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/actions/actions.js | 1731 | comment contains the word "placeholder" (describes i18n interpolation messages, not a stub) | ℹ️ Info | None |
| (none) | | No TBD/FIXME/XXX/TODO debt markers in any phase-touched file; no stub returns (`return {}`, `=> {}`, hardcoded empty data) in any 14-05-modified file; the `return null` guards in refreshMembers/refreshSessions are intentional `!res.ok` guards whose honesty is delivered centrally | — | — |

### Human Verification Required

None blocking. The two browser-flow observations from the prior report (sessions-tab visual rendering; two-browser revocation flow end-to-end in real Chromium) are **deferred, not dropped** — see Deferred Items. They are explicitly owned by Phase 18's success criteria (Chromium e2e over sessions revocation in both locales + real-device UAT), and the client-side teardown contract they would have exercised is now behaviorally proven headlessly.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Sessions tab visual rendering in a real browser (device label from UA, IP, relative last-seen, this-device badge, disabled revoke-all at one session) and the two-browser revocation flow end-to-end | Phase 18 — Closing Verification | ROADMAP Phase 18 SC2: "Chromium e2e covers sessions revocation, password change + revocation, and the full 2FA login path in both locales (AUTH-03)"; SC4 assigns the real-device human UAT to the same phase |

### Gaps Summary

**None.** The prior verification's single gap — truth 12 / D-28 client teardown wiring — is closed by executed plan 14-05 and re-verified against the live codebase this session:

- The central intercept lives at the single fetch choke point (`call()` in api.js) and fires on exactly the mid-session condition (401 + `signInRequired` + signed-in + clear latch); the once-per-revocation latch absorbs the teardown's own logout 401 and concurrent 401s, and re-arms inside `applyUser()` after a successful re-auth.
- Every 401 path a genuinely revoked browser takes — save (`gr8r:save-error`), boot hydration, sessions refresh, revoke actions — now flows through `call()`, so all inherit the teardown; the bypassing per-site branches are retired and the generic session-expired copy is fully gone (zero matches in `src/` and `test/`).
- The behavior is proven, not merely present: test/auth-revoked.test.mjs (6/6) exercises the real api.js module and pins fire-once, latch, boot-guard, and re-arm, plus source-as-text pins on the cross-module registration.
- No truth regressed: the server-side surface was untouched by 14-05, all grep gates are clean, all targeted suites pass, and the full suite is **462/462** — the previously documented pre-existing i18n-prefs failure was fixed (commit 30ea824) and is not carried forward.

All four roadmap Success Criteria verify against real code and real-server tests. The phase goal is achieved: the schema migration is complete and convergent (byte-identical second boot), the workspace document is clean on both surfaces, the sessions page reads/writes a genuine revocation primitive, and a revoked browser's teardown is honest, once-per-revocation, and reusable by Phase 15 (PASS-02/03) verbatim.

---

_Verified: 2026-10-27T00:00:00Z_
_Verifier: the agent (gsd-verifier)_

Notes: `gsd-tools`/`gsd_run` CLI is not installed in this environment; `covered_digest` was computed deterministically as sha256 over the concatenated `sha256sum` lines of all covered_files, and artifact/key-link verification was performed by direct grep/read of the codebase plus the behavioral test runs instead of the `verify.artifacts`/`verify.key-links` queries.
