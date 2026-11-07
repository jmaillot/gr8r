---
phase: 41-unsubscribe-tokens-list-unsubscribe-headers
verified: 2026-11-06T14:39:29Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/41-unsubscribe-tokens-list-unsubscribe-headers/41-01-PLAN.md
  - .planning/phases/41-unsubscribe-tokens-list-unsubscribe-headers/41-01-SUMMARY.md
  - .planning/phases/41-unsubscribe-tokens-list-unsubscribe-headers/41-02-PLAN.md
  - .planning/phases/41-unsubscribe-tokens-list-unsubscribe-headers/41-02-SUMMARY.md
  - DEPLOY.md
  - mailer.js
  - package.json
  - server.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/digest.test.mjs
  - test/helpers/server.mjs
  - test/unsubscribe-token.test.mjs
covered_digest: "v2:sha256:8fae8cb018b3fd238080bdc86a46ad6eec39bb46966e9e338200cd6e7e8e8fec"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none (VERIFICATION.md was missing — this is the initial verifier run, produced post-close-out)
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers Verification Report

**Phase Goal:** Digest emails carry RFC 8058 one-click unsubscribe headers built on a stateless, test-pinned HMAC token — the frozen contract the endpoint will consume.
**Verified:** 2026-11-06T14:39:29Z
**Status:** passed
**Re-verification:** No — initial verification (report was missing after phase close-out; produced fresh at HEAD, after Phases 42/43 shipped)

## Goal Achievement

### Observable Truths (roadmap SC-1..SC-5 + plan must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every digest carries `List-Unsubscribe` (HTTPS URL) + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` with an HMAC-SHA256 token over (wsId, userId), domain-separated from MASTER_KEY, purpose-tagged, timing-safe-verifiable; format frozen by unit tests | ✓ VERIFIED | `mailer.js:134-161` (`makeUnsubscribeToken`/`unsubscribeUrl`/`verifyUnsubscribeToken`, base64url, length-guard-then-`crypto.timingSafeEqual`); `server.js:148-151` purpose tag `unsubscribe-tokens:v1` via one `createHash` + two chained updates (never raw MASTER_KEY, never the AES/TOTP envelope path); header gate `mailer.js:752-754`; positive-path integration test `test/digest.test.mjs:719-760` (20/20 digest tests pass, incl. verbatim headers, header ordering Subject→List-Unsubscribe→List-Unsubscribe-Post→Date, and round-trip verify against the server derivation shape); format freeze `test/unsubscribe-token.test.mjs` 10/10 pass (determinism, version byte 0x01, 36-byte UUID framing, base64url/no-padding/no-CRLF, URL shape, domain separation, tamper ×3, timing-safe) |
| 2 | MASTER_KEY unset → digests sent with zero List-Unsubscribe headers, no http:// downgrade — fail-open honestly, pinned by test | ✓ VERIFIED | `server.js:151` `unsubscribeHmacKey()` returns null without MASTER_KEY; send-site conditional spread `server.js:1621-1623` gates on both key and https APP_URL; mailer-side https gate `mailer.js:752` (second line of defense); dedicated gate-1 test `test/digest.test.mjs:826-866` boots a server with `MASTER_KEY: ''` and asserts zero header occurrences + footer link in both parts; gate-2 test (http APP_URL, `:867-882`) asserts zero headers via the existing http fixture |
| 3 | Plain footer settings link still renders alongside the one-click header; Settings digest toggle remains the re-subscribe path | ✓ VERIFIED | `mailer.js:659-672` settings URL `/w/:slug/settings#notif-email` (never the token URL), rendered unconditionally in both text and HTML frames with i18n key `notif.digest.unsubscribe` (`mailer.js:675`) + EN literal fallback; link present in positive AND both gate-negative tests (asserted in both decoded parts each time); Phase 38 suppression/resubscribe tests pass unmodified inside the 20/20 digest suite |
| 4 | DEPLOY.md documents the DKIM caveat (RFC 8058 §4) and MASTER_KEY-rotation-invalidates-links semantics | ✓ VERIFIED | DEPLOY.md §14 subsection (L833-859): one-click headers, DKIM caveat with relay-signing instruction, rotation semantics, both render gates; `grep -c LIST_UNSUBSCRIBE_POST DEPLOY.md` = 0 (no env knob documented, D-07 honored) |
| 5 | Phase 38 suppression invariant + second-boot/no-duplicate tests pass unmodified; zero runtime dependencies, zero migrations | ✓ VERIFIED | Claim key `${ws.id}:${r.user_id}:digest:${localDate}` byte-identical at `server.js:1594`; `test/digest.test.mjs` 20/20 pass; `package.json` has NO `dependencies` block (devDependencies only) — zero runtime deps; no migration files added by the phase |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `mailer.js` — makeUnsubscribeToken / unsubscribeUrl / verifyUnsubscribeToken | exported pure helpers | ✓ VERIFIED | exported at L966; key-free mailer preserved (keys passed as arguments) |
| `server.js` — unsubscribeHmacKey() | purpose-tagged derivation near keyring block | ✓ VERIFIED | L148-151, fail-open-null shape |
| `server.js` — msg.unsubscribeUrl at digest send site | conditional field | ✓ VERIFIED | L1621-1623, both-layer gate, existing msg fields untouched |
| `src/locales/en.json` / `fr.json` — notif.digest.unsubscribe | catalogued both locales | ✓ VERIFIED | L1693 in both; i18n scan green (0 pending, 0 unlisted, 0 stale, 0 placeholder-mismatch) |
| `test/unsubscribe-token.test.mjs` | format-freeze unit tests | ✓ VERIFIED | 10/10 pass |
| `test/digest.test.mjs` — https positive + 2 gate-negative tests | per-gate integration pins | ✓ VERIFIED | L719, L773, L826, L867 |
| `DEPLOY.md` §14 subsection | DKIM + rotation | ✓ VERIFIED | see truth 4 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| server.js digest send site | mailer.js header/footer rendering | `msg.unsubscribeUrl` (only data path; mailer stays key-free) | WIRED | conditional spread → buildDigestMessage header gate + footer frame |
| sha256(MASTER_KEY ‖ 'unsubscribe-tokens:v1') | HMAC signing key | one createHash, two chained updates | WIRED | domain separation proven by freeze test; no raw-MASTER_KEY or envelope-path reuse |
| i18n key notif.digest.unsubscribe | both footer frames (text + HTML) | tFor with EN fallback | WIRED | L675 + catch-block literals; scan green |
| Phase 42 endpoint | verifyUnsubscribeToken | imported at server.js:55 | WIRED | Phase 42 verification passed at HEAD — token helpers production-proven |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite | `npm test` | ℹ tests 1007 · pass 1003 · fail 1 | ✓ PASS (the 1 failure is the pre-existing environmental `totp-rewrap` D-74 EACCES, documented in Phase 43 deferred-items.md — reproduces at HEAD before any Phase 41 change, not a phase failure) |
| Token format freeze | `node --test test/unsubscribe-token.test.mjs` | 10 pass / 0 fail | ✓ PASS |
| Digest integration (headers, gates, footer, suppression) | `node --test test/digest.test.mjs` | 20 pass / 0 fail | ✓ PASS |
| i18n gate (EN+FR, server keys) | `npm run i18n:scan` | 0 literals, 0 pending, 0 unlisted, 0 stale | ✓ PASS |
| No env knob (D-07) | `grep -c LIST_UNSUBSCRIBE_POST DEPLOY.md` | 0 | ✓ PASS |

### Probe Execution

No phase-declared probes (`scripts/*/tests/probe-*.sh`): none exist and none declared in plans. Behavioral verification carried by the test suite above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| UNSUB-01 | 41-01, 41-02 | RFC 8058 one-click headers on digest mail with stateless HMAC token | ✓ SATISFIED | truths 1, 2 |
| UNSUB-03 | 41-01, 41-02 | Footer unsubscribe path preserved; settings toggle remains re-subscribe path | ✓ SATISFIED | truth 3 |

No orphaned requirements: REQUIREMENTS.md maps only UNSUB-01/UNSUB-03 to Phase 41.

### Prohibitions (must_haves.prohibitions, judgment-tier — resolved by direct inspection)

| Prohibition | Verdict |
| ----------- | ------- |
| One-click URL: opaque single path segment, no query string, no readable identifiers (D-09/D-12) | ✓ holds — freeze test asserts; base64url UUID-framed token |
| No env knob gates `List-Unsubscribe-Post` (D-07) | ✓ holds — zero occurrences in DEPLOY.md and codebase grep |
| HMAC key never raw MASTER_KEY / never AES-TOTP envelope path (D-10) | ✓ holds — dedicated purpose tag, separate createHash call |
| Headers never render for non-https URL; no http:// downgrade (D-05/D-06) | ✓ holds — both-layer gates, gate tests pass |
| Footer link never points at the token URL (D-01) | ✓ holds — settings anchor only |
| Claim key byte-identical (SC-5) | ✓ holds — L1594 unchanged |

### Milestone Invariants

| Invariant | Verdict |
| --------- | ------- |
| Zero runtime dependencies | ✓ package.json has no dependencies block |
| EN+FR i18n gate (server keys included) | ✓ scan green, key in both locales |
| Phase 38 suppression invariant | ✓ digest suite 20/20, claim key untouched |

### Anti-Patterns Found

None in phase-modified files. No TBD/FIXME/XXX/placeholder markers introduced; Phase-41-tagged comments are documentation, not debt.

### Human Verification Required

None. UAT (41-UAT.md, complete 2026-11-06) covered the interactive checks; every remaining behavior is test-pinned.

### Gaps Summary

None. The phase goal is achieved in the codebase at HEAD, with the frozen token contract subsequently consumed and proven by Phase 42's shipped, verified one-click route.

---

_Verified: 2026-11-06T14:39:29Z_
_Verifier: the agent (gsd-verifier)_
