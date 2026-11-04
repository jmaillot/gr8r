---
phase: 36-server-notification-i18n
plan: 04
subsystem: i18n
tags: [i18n, build-gate, server-notifications, parity, tdd]
requires:
  - scripts/i18n-scan.mjs (exported lex/analyse machinery; main() exit contract lines 1446-1452)
  - src/locales/en.json + src/locales/fr.json (notif.* catalogues from 36-01/36-02)
  - server.js / mailer.js tFor call sites (landed in 36-01/36-02, keyed rows in 36-03)
provides:
  - Server-family gate: t/tFor notif.* literals in server.js + mailer.js must resolve in en.json AND fr.json — a missing FR key fails npm run i18n:scan (D-07, SC-4)
  - notifParity gate: notif.* key sets identical EN↔FR both directions — an untranslated key fails the build (D-09, SC-4)
  - Exported scanServerNotifKeys + notifParity for tests
affects:
  - Future catalogue edits (a drifted key now fails the build, not the runtime)
tech-stack:
  added: []
  patterns: [targeted-rule-family, parity-gate-both-directions, pure-fixture-subprocess-probe]
key-files:
  created: []
  modified: [scripts/i18n-scan.mjs, test/i18n-scan.test.mjs]
decisions:
  - "Server key resolution takes the FIRST STRING argument of a t/tFor call (tFor's first argument is the locale) — covers both t(key) and tFor(locale, key) shapes under one bounded rule (D-08 width: notif.* literals only)"
  - "Parity drift findings are emitted as 'unresolved'-class findings with a 'parity:' text marker into main()'s existing violations sum — no new verdict kind, exit contract untouched"
  - "Non-vacuity probe runs through a subprocess exit path on a PURE FIXTURE — the plan's write-probe-on-server.js variant was rejected because node --test runs files in parallel and a temporary server.js mutation crashed 113 server-boot tests (Rule 1 fix during Task 2)"
  - "Empty notif.* namespaces and empty call-site sets are legal empty inputs — the gate reports nothing rather than erroring (I18N-04-empty)"
metrics:
  duration: ~14m
  completed: 2026-11-04
  tasks: 2
status: complete
estimate:
  tokens: 70000
  tasks: 2
actuals:
  tokens: 12000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 5d108c8b4a8f0426b163039eaa1c33b9c0613dcd
plan_head_after: 14c24a9
requirements: [I18N-04]
---

# Phase 36 Plan 04: Server notif.* gate + EN↔FR parity in the i18n scanner Summary

**One-liner:** The i18n build gate now covers the server side — every t/tFor notif.* literal in server.js/mailer.js must resolve in en.json AND fr.json, and the notif.* namespace is parity-checked both directions, so a missing FR key or drifted catalogue entry fails `npm run i18n:scan` (SC-4) while the src-side scan output stays byte-identical.

## What Was Built

**Task 1 (tracer, TDD):** RED-first (suite failed to load — exports missing), then GREEN: `scanServerNotifKeys` in scripts/i18n-scan.mjs — a bounded family over the exported lex machinery that walks t/tFor calls, takes the first string argument (tFor(locale, 'notif.*') and t('notif.*')), skips composed/dynamic keys (existing `+`/`.` skip), and emits 'unresolved' when the key misses en.json OR fr.json. `notifParity` computes both-direction key-set drift. Both wired into main(): the two server files are scanned directly (they live outside src/) and their findings + parity drift join the existing violations sum, so the exit-code contract (unlisted + stale + unresolved + mismatch → exit 1) holds unchanged. callVars placeholder checking deliberately NOT reused for server call sites (runtime snapshot vars — Pitfall 3). Fixture tests: missing-FR fails main(), both-catalogues passes, parity drift fails with no call site, composed keys skipped, non-notif tFor call sites out of family (D-08 width pin), empty namespace is a legal input.

**Task 2:** Live-tree proof and byte-compat pins: the server family over the real server.js/mailer.js reports zero violations (plans 01-03 landed all keys — 23 notif.* keys, parity-clean both directions); a byte-compat pin asserts no server/parity finding leaks into scanTree('src') output and test/fixtures/i18n-pending.json stays [] (Pitfall 8, D-07/D-09 pin); non-vacuity through a real subprocess exit path on a pure fixture tree (missing server key → exit 1). `npm run i18n:scan` exits 0 on the live tree.

## Deviations from Plan

**[Rule 1 - Bug] Write-probe on server.js broke parallel test boots**
- **Found during:** Task 2, `npm test` full suite
- **Issue:** The plan's fallback non-vacuity pattern (write-probe/restore on server.js, mirroring test lines 348-364) temporarily corrupted server.js while node --test ran other test files in parallel — 113 server-boot tests failed with "server did not start".
- **Fix:** Replaced with a subprocess-driven pure fixture: a child node process imports main() with fixture-tree options and its real exit code is asserted (1). The live server.js is never touched.
- **Files modified:** test/i18n-scan.test.mjs
- **Commit:** 14c24a9

## Verification

- `node --test test/i18n-scan.test.mjs` — 36/36 green (RED confirmed before implementation: suite failed on missing exports)
- `npm run i18n:scan` — exit 0, 0 literals/pending/unlisted/stale/unresolved/mismatch
- `npm test` — 932 tests, 929 pass, 0 failures, 3 skipped (pre-existing skips)

## Notes

- Zero packages installed (T-36-SC zero-dependency invariant held — scanner stays plain Node, node:fs/path/url import contract test still green).
- Assumptions held as written: I18N-04-adjacency (parity is namespace-wide, key resolution bounded to server.js/mailer.js call sites), I18N-04-empty (empty sets legal), I18N-04-encoding (exact hasOwn string match, no normalization), I18N-04-ordering (findings ride the existing comparator; parity drift reports in catalogue key order).
- T-36-05 mitigation live: family width pinned by the non-notif tFor test; server findings can never be allow-listed (compare() only covers rule*-kind literals).

## Self-Check: PASSED

- scripts/i18n-scan.mjs exports scanServerNotifKeys + notifParity, both wired into main(); test/i18n-scan.test.mjs = 36 tests green
- Commits 9e174ae and 14c24a9 exist on main
