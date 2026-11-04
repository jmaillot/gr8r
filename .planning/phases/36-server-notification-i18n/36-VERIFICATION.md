---
phase: 36-server-notification-i18n
verified: 2026-11-04T00:00:00Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - .planning/phases/36-server-notification-i18n/36-01-PLAN.md
  - .planning/phases/36-server-notification-i18n/36-02-PLAN.md
  - .planning/phases/36-server-notification-i18n/36-03-PLAN.md
  - .planning/phases/36-server-notification-i18n/36-04-PLAN.md
  - .planning/phases/36-server-notification-i18n/36-01-SUMMARY.md
  - .planning/phases/36-server-notification-i18n/36-02-SUMMARY.md
  - .planning/phases/36-server-notification-i18n/36-03-SUMMARY.md
  - .planning/phases/36-server-notification-i18n/36-04-SUMMARY.md
  - src/core/i18n.js
  - src/locales/en.json
  - src/locales/fr.json
  - server.js
  - mailer.js
  - src/pages/inbox.js
  - scripts/i18n-scan.mjs
  - test/i18n-tfor.test.mjs
  - test/notif-i18n.test.mjs
  - test/i18n-scan.test.mjs
  - test/i18n-core-features.test.mjs
  - test/notif-email-link.test.mjs
  - test/due-reminders.test.mjs
covered_digest: "v2:sha256:efff370312faa2b99184ee5c77190c6b37082699a1c9453909adbd1110bd4efe"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 36: Server Notification i18n Verification Report

**Phase Goal:** Every server-emitted notification renders in the recipient's locale through a shared EN/FR catalogue, with a build gate against drift
**Verified:** 2026-11-04
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Merged from ROADMAP success criteria + PLAN frontmatter must_haves. Plan truths that restate a roadmap SC keep the roadmap wording.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | FR-locale recipient gets reminder/notification emails (subject AND body) in French; EN-locale recipient of the same workspace notification gets English — same run, no global locale mutation (SC-1) | ✓ VERIFIED | `server.js:1244` `recipientLocale` per-recipient; mailer renders per msg.locale; test/notif-i18n.test.mjs integration (real server + SMTP capture) 16/16 green — FR vs EN asserted in one run, singleton `getLocale()` pinned 'en' |
| 2 | Server renders all notification text through a locale-parameterized function in the shared i18n module using the same EN/FR catalogue files — no fork, no Dockerfile change (SC-2) | ✓ VERIFIED | `src/core/i18n.js:194` exports `tFor`; `server.js:59-67` static-imports `./src/locales/fr.json` + `registerCatalogue('fr', frLocale)`; no forked catalogue copy found; t() delegates to tFor (`i18n.js:209`) |
| 3 | New reminder rows store machine keys; inbox renders them localized per viewer locale; legacy prose rows render unchanged (SC-3) | ✓ VERIFIED | `server.js:1421-1423` writes key+vars+snippet; `src/pages/inbox.js:59-60` keyed branch `has(n.key) ? t(n.key, n.vars) : n.snippet`; legacy branch untouched; pinned by notif-i18n tests |
| 4 | A missing FR key or drifted server notification literal fails the build (SC-4) | ✓ VERIFIED | `scripts/i18n-scan.mjs:1194` `scanServerNotifKeys`, `:1243` `notifParity`, both wired into main() (`:1507-1521`); fixture tests in test/i18n-scan.test.mjs (36/36 green) prove exit 1 on missing-FR + parity-drift; live `npm run i18n:scan` exit 0 |
| 5 | A locale render that would throw (malformed locale, Intl failure) falls back to EN instead of killing the notification (SC-5) | ✓ VERIFIED | tFor clamps unknown/malformed/null locale → EN and degrades Intl plural failure (i18n-tfor tests green); mailer buildNotifMessage try/catch EN fallback; doc-only/NULL/'fr-FR' edge tests in notif-i18n suite |
| 6 | tFor('fr', key, vars) renders FR while singleton stays 'en', plurals threaded (36-01 truth) | ✓ VERIFIED | `src/core/i18n.js:194-209`; test/i18n-tfor.test.mjs 6/6 green |
| 7 | The 23 notif.* server keys exist in BOTH catalogues, flat namespace, 8 existing client keys untouched (36-01 truth) | ✓ VERIFIED | Runtime check: 23 notif.* keys, EN↔FR parity both directions, zero missing; parity gate live |
| 8 | users.locale rides the authority query; doc-only members and NULL locales get EN (36-02 truth) | ✓ VERIFIED | `server.js:1222` selects `u.locale` on memberships⋈users; `server.js:1244` ternary clamps non-'fr' → 'en'; edge tests green |
| 9 | The 'Reminders' by-label and reminder verb/subject render per recipient locale; reminders never fall into 'updated' (36-02 truth) | ✓ VERIFIED | `server.js:1268` tFor byReminders; `mailer.js:420-421` verb.reminder for due_reminder/past_due; `:427` keyed subject.reminder |
| 10 | Security-alert and invitation emails keep English text untouched (36-02 prohibition/truth) | ✓ VERIFIED | mailer.js:516/603 buildSecurityAlertMessage/buildInviteMessage contain no tFor call sites (tFor appears only in buildNotifMessage region) |
| 11 | Unknown catalogue key degrades to stored English snippet, never blank; client-created rows never gain key/vars (36-03 truths) | ✓ VERIFIED | inbox.js:60 fallback `: n.snippet \|\| ''`; purity pins in notif-i18n suite (16/16 green) |
| 12 | The gate is non-vacuous and src-side scan output is byte-compatible; allow-list stays [] (36-04 truths) | ✓ VERIFIED | Fixture tests prove exit 1 through main(); `test/fixtures/i18n-pending.json` = `[]`; `npm run i18n:scan` exit 0 with 0 unresolved/0 mismatch |

**Score:** 12/12 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/i18n.js` | tFor export, t delegates, locale-threaded plural | ✓ VERIFIED | lines 194/209; not orphaned (server.js, mailer.js import it) |
| `src/locales/en.json` / `fr.json` | notif.reminder.* + notif.email.* keys, parity | ✓ VERIFIED | 23 notif.* keys, both directions clean |
| `server.js` | boot registration, u.locale, msg.locale, keyed rows, byReminders | ✓ VERIFIED | lines 59-67, 1222, 1244, 1268, 1284, 1421-1423 |
| `mailer.js` | buildNotifMessage via tFor, keyed verbs/subject, try/catch fallback | ✓ VERIFIED | lines 27, 395-431, 461 |
| `src/pages/inbox.js` | keyed branch in notifText + has()-gated preview | ✓ VERIFIED | lines 59-60, 89 |
| `scripts/i18n-scan.mjs` | scanServerNotifKeys + notifParity wired into main() | ✓ VERIFIED | lines 1194, 1243, 1507-1521 |
| `test/i18n-tfor.test.mjs` | tFor contract tests | ✓ VERIFIED | 6/6 green |
| `test/notif-i18n.test.mjs` | FR/EN email integration + row shape + edges | ✓ VERIFIED | 16/16 green |
| `test/i18n-scan.test.mjs` | gate fixture tests | ✓ VERIFIED | 36/36 green |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js boot | fr.json catalogue | static import + registerCatalogue | ✓ WIRED | server.js:60-67 |
| queueNotifEmails authority query | recipient locale → mailer | `u.locale` select + `msg.locale` | ✓ WIRED | server.js:1222, 1244, 1284 |
| mailer buildNotifMessage | notif.email.* catalogue keys | tFor(msg.locale, …) | ✓ WIRED | mailer.js:416-431 |
| runReminderPass | keyed rows | key+vars+snippet on notif object | ✓ WIRED | server.js:1421-1423 |
| inbox notifText | t()/has() singleton | viewer-locale render | ✓ WIRED | inbox.js:59-60, 89 |
| scanServerNotifKeys/notifParity | main() exit contract | violations sum | ✓ WIRED | i18n-scan.mjs:1516, 1521 |
| tFor | resolvePlural/rulesFor(target) | locale threaded, not singleton | ✓ WIRED | i18n.js:167, 194 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| tFor contract (clamp, delegation, plurals) | `node --test test/i18n-tfor.test.mjs` | 6 pass, 0 fail | ✓ PASS |
| FR vs EN email same-run, keyed rows, inbox render, edges | `node --test test/notif-i18n.test.mjs` | 16 pass, 0 fail | ✓ PASS |
| Gate fixtures (drift → exit 1, clean → exit 0) | `node --test test/i18n-scan.test.mjs` | 36 pass, 0 fail | ✓ PASS |
| Live tree gate | `npm run i18n:scan` | exit 0, 0 unresolved, 0 mismatch | ✓ PASS |

### Probe Execution

No phase-declared probe scripts (`scripts/*/tests/probe-*.sh`); the i18n:scan gate and integration suites above serve as the runnable checks. SKIPPED (no conventional probes).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| I18N-01 | 36-02 | Server-emitted notification text (emails + push + inbox) in recipient locale with EN fallback | ✓ SATISFIED | Truths 1, 8, 9, 10. Push boundary pinned: no push-emission surface exists (push_* are settings-whitelist keys only); emails + inbox rows cover the entire server-emitted text surface |
| I18N-02 | 36-01, 36-02 | Additive locale-parameterized function in shared i18n module, same catalogue files, no global mutation, no fork | ✓ SATISFIED | Truths 2, 6, 7 |
| I18N-03 | 36-03 | Keyed reminder rows, localized inbox render, legacy rows unchanged | ✓ SATISFIED | Truths 3, 11 |
| I18N-04 | 36-04 | Build gate covers server-used key set with EN+FR resolution and parity | ✓ SATISFIED | Truths 4, 12 |

No orphaned requirements: REQUIREMENTS.md maps exactly I18N-01..04 to Phase 36; all appear in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/placeholder/stub markers in any phase-modified file | — | — |

### Human Verification Required

None. All behavior-dependent truths (per-recipient FR/EN email render, keyed-row state transitions, gate exit-code contract, fallback/never-throw invariants) are exercised by passing behavioral tests (SMTP-capture integration + fixture-based gate tests).

### Gaps Summary

None. All five roadmap success criteria are observably true in the codebase, backed by passing behavioral tests and a live gate run (exit 0). Prohibitions held: no setLocale/primeLocale on the server, no forked catalogue, no Dockerfile change, snippet dual-store retained, allow-list stays [].

---

_Verified: 2026-11-04_
_Verifier: the agent (gsd-verifier)_
