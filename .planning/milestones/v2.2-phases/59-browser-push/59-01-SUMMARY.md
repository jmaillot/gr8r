---
phase: 59
plan: 01
subsystem: server/infra
tags: [push, web-push, vapid, dual-backend, prefs]
requires: [Phase 34 notif_prefs whitelist, Phase 45 db-adapter dual-backend, Phase 48 SW/permission surface]
provides: [push_subscriptions table (both backends), VAPID custody (env > file > generate-once), /api/me/push-config + GET/POST/DELETE /api/me/push-subscriptions, live push_due pref, web-push@4.0.0 exact pin]
affects: [59-02 (fan-out reads push_subscriptions + push prefs), 59-03 (client subscribe + settings Push tab)]
tech-stack:
  added: [web-push@4.0.0 (exact pin, runtime dep #3)]
  patterns: [dual-backend SCHEMA mirror, fail-absent feature gating (MCP-01), guarded-create additive DDL, dynamic-import mock seam]
key-files:
  created: [test/push-server.test.mjs]
  modified: [server.js, db-adapter.mjs, package.json, package-lock.json, test/dependencies.test.mjs, test/db-adapter.test.mjs, test/catalogue.test.mjs, src/core/notifPrefs.js, src/locales/en.json, src/locales/fr.json, test/notif-hydration.test.mjs, test/notif-prefs.test.mjs, test/local-prefs.test.mjs, test/migration.test.mjs, test/i18n-core-features.test.mjs, docs/DEPLOY.md]
decisions:
  - "Client whitelist parity: push_due also joined src/core/notifPrefs.js defaults/whitelist (Rule 3 — the pinned client tests pin that file); foreground PUSH_TYPE_PREF untouched per D-09"
  - "Subscription GET omits p256dh/auth from responses; POST preserves original created_at on endpoint replace (D-03 device-list semantics)"
  - "Routes take workspace via ?workspace= query param (client POSTs the canonical toJSON() body verbatim)"
metrics:
  duration: ~75 min
  completed: 2026-11-13
status: complete
plan_head_before: 905f7e5
plan_head_after: 0d34fc0
commits: 3
actuals:
  tokens: 58000
  tasks: 3
  commits: 3
---

# Phase 59 Plan 01: Push Infra — Schema, Custody, Routes Summary

**One-liner:** push_subscriptions mirrored on SQLite+pg with endpoint-UNIQUE replace, env-overridable /data-persisted VAPID custody proven by a restart tracer test, fail-absent push-config, self-service subscribe/list/delete routes, web-push@4.0.0 exact-pinned, push_due re-livened per D-09.

## What was built

- **Task 1** (68154c5): `web-push@4.0.0` installed as runtime dep #3 (D-12 amended ×2, owner pre-lock on record; A1 API-surface sanity check passed). Dependency contract tests amended in both `test/dependencies.test.mjs` and `test/catalogue.test.mjs` (a second pin found by the full-suite run).
- **Task 2** (620eda8, tracer/BLOCKING): `push_subscriptions` DDL in server.js SCHEMA + byte-equivalent db-adapter.mjs SQLITE_SCHEMA mirror + `PG_CONFLICT_TARGETS.push_subscriptions = '(endpoint)'`; 15-table parity coverage + endpoint-upsert toPgSql pin. Boot custody ladder: env → `DATA_DIR/vapid-keys.json` (0600) → generate-once with loud log; unpersistable = `PUSH.enabled=false`. Routes: `GET /api/me/push-config` (fail-absent 404 `pushUnavailable`), GET/POST/DELETE `/api/me/push-subscriptions` behind the requireUser → sameOrigin → workspace/member-404 ladder, session-only user_id, canonical `{endpoint, keys:{p256dh,auth}, label}` body validated (https endpoint, base64url keys, 200-byte label cap), replace-preserves-created_at. `test/push-server.test.mjs` (11 tests) proves custody restart, env override, fail-absent, route whitelist/replace/delete. DEPLOY.md §16 runbook.
- **Task 3** (0d34fc0): `push_due` live in server whitelist (17 keys) + defaults (default true) and client `notifPrefs.js` parity; five G-37-2 pinned assertions flipped deliberately; +2 i18n keys (`err.pushUnavailable`, `err.invalidSubscription` EN+FR) with catalogue-pin drift note.

## Verification

- `node --test test/dependencies.test.mjs test/db-adapter.test.mjs test/push-server.test.mjs` — green (43 tests)
- `node --test test/notif-hydration.test.mjs test/notif-prefs.test.mjs test/local-prefs.test.mjs test/migration.test.mjs` — green (66 tests)
- **Full suite: 1482 tests, 1470 pass, 0 fail, 12 skipped (pg matrix gating)** — `npm test`
- `npm run lint` — clean
- `grep src/core/push.js PUSH_TYPE_PREF` — no due_reminder mapping (foreground path unchanged)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SQL statement-splitter vs comment semicolon**
- **Found during:** Task 2 (boot probe)
- **Issue:** the SCHEMA comment ended a line with `);` — `runSchema` splits on `/;\s*\n/` and cut inside the comment, producing a comment-only statement (`The SQL query contains no statements.` at boot).
- **Fix:** reworded the comment (no end-of-line semicolons); boot probe `--db-init` green.
- **Files modified:** server.js

**2. [Rule 3 - Blocking] Client whitelist parity for push_due**
- **Found during:** Task 3
- **Issue:** `files_modified` omitted `src/core/notifPrefs.js`, but the flipped client pins (local-prefs, notif-hydration) pin that file's whitelist — without it the D-09 flips cannot pass.
- **Fix:** push_due added to the client defaults/whitelist (12 defaults / 17 keys); foreground `PUSH_TYPE_PREF` untouched as required.
- **Files modified:** src/core/notifPrefs.js

**3. [Rule 2 - Missing critical] i18n keys for the new error codes**
- **Found during:** full-suite run (error-codes contract + i18n gate)
- **Issue:** `err.invalidSubscription` / `err.pushUnavailable` uncatalogued in EN+FR; catalogue-size pin drifted.
- **Fix:** both keys added EN+FR; `i18n-core-features` pin 1842 → 1844 with drift note.
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs

**4. [Rule 1 - Bug] Label byte-cap accumulator string-concat**
- **Found during:** Task 2 test run
- **Issue:** first cut of the label cap used a reduce whose `acc + byteLength` concatenated a string with a number, corrupting the label.
- **Fix:** plain loop with `Buffer.byteLength(label + ch, 'utf8')` break condition; covered by the oversized-label test.
- **Files modified:** server.js

**5. [Rule 1 - Bug] Second/third dependency pins**
- **Found during:** full-suite run
- **Issue:** `test/catalogue.test.mjs` and a second block in `test/db-adapter.test.mjs` also pin the runtime dependency list — plan listed only `test/dependencies.test.mjs`.
- **Fix:** both amended for web-push 4.0.0.

## Threat mitigations delivered (T-59-01/02/03/SC)

- T-59-01: endpoint https-only, base64url key validation, byte-capped label, session-only user_id (mass-assignment test proves body `user_id` ignored).
- T-59-02: notif-prefs guard ladder cloned; stranger 404 no-oracle pinned; DELETE constrained to `(workspace_id, user_id, endpoint)`.
- T-59-03: only the public key crosses `/api/me/push-config`; custody logs presence/source only; private key never logged (pinned).
- T-59-SC: legitimacy satisfied by recorded owner pre-lock + A1 API-surface check.

## Known Stubs

None — all routes are live against storage; send/fan-out is deliberately Plan 02 scope (the seam note in server.js documents it), and the per-device test-send route is deferred to Plan 02 per the plan text.

## Self-Check: PASSED

- Commits verified: 68154c5, 620eda8, 0d34fc0 (3 commits over 905f7e5..0d34fc0).
- All key files exist; full suite green at SUMMARY time.
