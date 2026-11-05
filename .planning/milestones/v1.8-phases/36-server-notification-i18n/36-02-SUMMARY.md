---
phase: 36-server-notification-i18n
plan: 02
subsystem: i18n
tags: [i18n, server-notifications, email, tdd]
requires:
  - src/core/i18n.js (tFor + registerCatalogue from 36-01)
  - src/locales/fr.json (notif.email.* keys from 36-01)
provides:
  - Per-recipient locale notification emails (subject AND body) via msg.locale → buildNotifMessage → tFor
  - FR catalogue boot-registered in server.js (static JSON import, shared catalogue, no fork)
  - Reminder email family: keyed by-label (notif.email.byReminders), verb (notif.email.verb.reminder) and subject (notif.email.subject.reminder)
affects:
  - 36-03 (inbox rows render through the client-locale t() singleton — email side is done here)
  - 36-04 (key-parity gate — all notif.email.* call sites now live in exactly one file, mailer.js)
tech-stack:
  added: []
  patterns: [locale-threaded-render, clamp-to-en-fallback, render-try-catch-degradation, boundary-pin-grep]
key-files:
  created: [test/notif-i18n.test.mjs]
  modified: [server.js, mailer.js, test/notif-email-link.test.mjs, test/due-reminders.test.mjs]
decisions:
  - "Boundary pin (I18N-01-adjacency): grep over server.js + src/ found NO push-emission surface (web-push/VAPID/service-worker/Notification) — push_* are preference-whitelist keys only (settings toggles, src/pages/settings.js:381). Server-emitted text is exactly: emails (localized here) + inbox rows (client-rendered via viewer locale, plan 03, D-11)."
  - "Render inside mailer per Open Question 1: server passes msg.locale, buildNotifMessage is the only notif.email.* call site; escapeHtml/encodeWord applied AFTER tFor interpolation (T-36-01)."
  - "HTML body now renders the full catalogue sentence (one <p>) instead of the old bold-fragment composition — the sentence shape lives in the catalogue, not the template."
metrics:
  duration: ~50m (dominated by a test-harness concurrency investigation)
  completed: 2026-11-04
  tasks: 2
status: complete
estimate:
  tokens: 80000
  tasks: 2
actuals:
  tokens: 6800
  tasks: 2
  commits: 3
commits: 3
plan_head_before: 7c0e79f
plan_head_after: ce807d7
requirements: [I18N-01, I18N-02]
---

# Phase 36 Plan 02: Server notification email i18n Summary

**One-liner:** Recipient-locale notification emails — server.js boot-registers the shared FR catalogue, resolves `u.locale` on the authority query and passes `msg.locale` into a fully tFor-rendered `buildNotifMessage` frame (greeting/verb/sentence/openTask/button/footer), with reminders getting their own keyed by-label, verb and subject; FR and EN recipients of the same workspace notification get their own language in one run.

## What Was Built

**Task 1 (tracer, TDD):** RED-first test/notif-i18n.test.mjs (real server + loopback SMTP capture) proving a FR-locale recipient gets a French mention email (subject + text + HTML button) while an EN-locale recipient of the SAME workspace notification gets English, and that the i18n module singleton `getLocale()` stays 'en' after server-side sends. GREEN implementation: (1) server.js boot registers the FR catalogue via a static `import frLocale from './src/locales/fr.json' with { type: 'json' }` + `registerCatalogue('fr', frLocale)` — same files the client ships, no fork, no Dockerfile change (I18N-02/D-02); (2) the authority query now selects `u.locale` (same workspace-scoped memberships⋈users row, T-36-02 — no new join); (3) `msg.locale` = `authority.get(n.to)?.locale === 'fr' ? 'fr' : 'en'` — doc-only members, NULL and malformed locales clamp to EN; (4) mailer.js `buildNotifMessage` renders greeting/verb/sentence/openTask/button/footer through `tFor(msg.locale, 'notif.email.*')` wrapped in one try/catch degrading to the previous English literals on any throw (SC-5 boundary guard). buildSecurityAlertMessage and buildInviteMessage untouched (D-10).

**Task 2:** The 'Reminders' by-label (server.js) renders per recipient through `tFor(recipientLocale, 'notif.email.byReminders')`; due_reminder/past_due get their own keyed verb (`notif.email.verb.reminder`) and subject (`notif.email.subject.reminder`) — never the 'update' fallback. Edge tests added: doc-only member (authority-map miss), NULL locale and malformed stored 'fr-FR' all produce EN emails (fan-out never blanks or dies, T-36-07).

## Deviations from Plan

**[Rule 3 - Blocking] byline source-extraction test needed a tFor stub**
- **Found during:** Task 2 verify
- **Issue:** test/notif-email-link.test.mjs extracts the `const by = …` line and evaluates it standalone; the new `tFor(recipientLocale, …)` call throws ReferenceError in the extraction harness.
- **Fix:** `bylineResolver` now builds `new Function('tFor', …)` and callers pass a stub (`byTFor`) — the line keeps its standalone-evaluability contract.
- **Files modified:** test/notif-email-link.test.mjs
- **Commit:** ce807d7

**[Rule 3 - Blocking] due-reminders by-label assertion decoded the text part**
- **Found during:** Task 2 verify (npm test)
- **Issue:** the old assertion checked `raw.includes('Reminders')` — it matched the plain-ASCII Subject header (`Reminders updated K-M1`). Reminders now have their own keyed subject, and the by-label lives only in the base64 body.
- **Fix:** assertion runs against `textPart(raw)` (decoded text/plain) — same intent (system by-label, never 'Un membre').
- **Files modified:** test/due-reminders.test.mjs
- **Commit:** ce807d7

**[Rule 1 - Bug, test-infra] fakeSmtp per-connection state (in new test file)**
- **Found during:** Task 1 RED bring-up
- **Issue:** the fakeSmtp pattern copied from test/notif-email-link.test.mjs declares `inData`/`current` in the server closure — SHARED across connections. Concurrent sends (the normal server fan-out) make session B's commands get swallowed as session A's message data.
- **Fix:** scoped per-connection in test/notif-i18n.test.mjs. The latent copy in notif-email-link.test.mjs is correct for its single-send usage and was left untouched (out of scope; flagged below).
- **Commit:** 5b5f8f6

## Verification

- `node --test test/notif-i18n.test.mjs` — 6/6 green (RED confirmed before implementation: FR recipient received an English email)
- Tracer chain: notif-i18n + due-reminders + notif-email-link — all green
- Task 2 chain: notif-i18n + notif-email-link + locale-account — all green
- `npm test` — 911 tests, 0 failures, 3 skipped (pre-existing skips)

## Boundary Pin (I18N-01-adjacency)

`grep -rniE "web-push|vapid|serviceworker|service-worker|new Notification|pushManager"` over server.js/, src/, mailer.js → zero emission surface (sole hit: the word "senders" in a comment). `push_mention/push_assign/push_comment/push_due` are preference-whitelist keys rendered as settings toggles (src/pages/settings.js:381). Decision: server-emitted notification text = emails (localized here) + inbox rows (client-rendered via the viewer-locale t() singleton, plan 03 per D-11).

## Notes

- The 'Un membre' doc-only-actor fallback (server.js) stays as-is — pre-existing data quirk, out of scope (D-08 width discipline).
- Observed, not fixed (out of scope): test/notif-email-link.test.mjs's fakeSmtp shares `inData`/`current` across connections — latent only (single send today); fix if that suite ever asserts multiple messages.
- Zero packages installed (T-36-SC zero-dependency invariant held).

## Self-Check: PASSED

- test/notif-i18n.test.mjs exists; server.js registers 'fr' at boot; mailer.js imports tFor
- Commits 5b5f8f6, 380e651, ce807d7 exist on main
