---
phase: "14"
slug: "schema-session-ground-truth"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-26"
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `14-RESEARCH.md` → `## Validation Architecture`. Research-verified values are cited to
> file:line in that section; this file distills them into the executable sampling contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` (no test-framework dependency) |
| **Config file** | none — `npm test` = `node --test --test-concurrency=2 test/*.test.mjs` (package.json:18) |
| **Quick run command** | `node --test test/sessions.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds (full suite) |
| **Harness** | `test/helpers/server.mjs` — spawns the real `server.js` on an ephemeral loopback port with an isolated `DATA_DIR`; never mocks SQLite or HTTP |
| **Build gate** | `npm run build` runs `scripts/i18n-scan.mjs` as `prebuild` (package.json:10-11) — rejects uncatalogued UI literals |

---

## Sampling Rate

- **After every task commit:** `node --test test/sessions.test.mjs` (and `node --test test/migration.test.mjs` for any schema or workspace-document change)
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** full phase gate green — `npm test && npm run lint && npm run format:check && npm run build` (the build includes the `prebuild` i18n-scan gate)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-0X-0X | 0X | 1 | SESS-01 | T-14-01 | No `token_hash` in any session payload; sessions listed are the caller's own rows only | unit (real server) | `node --test test/sessions.test.mjs` | ❌ W0 | ⬜ pending |
| 14-0X-0X | 0X | 1 | SESS-02 | T-14-02 | Revoke-others deletes every row except the caller's; the other cookie gets 401 and the caller stays signed in | unit (real server) | `node --test test/sessions.test.mjs` | ❌ W0 | ⬜ pending |
| 14-0X-0X | 0X | 1 | SESS-03 | T-14-03 | Per-row revoke is scoped to the caller — a foreign id deletes nothing | unit (real server) | `node --test test/sessions.test.mjs` | ❌ W0 | ⬜ pending |
| 14-0X-0X | 0X | 2 | AUTH-02 | T-14-04 | Migration is additive; second boot is a byte-identical no-op | unit (real server, existing harness) | `node --test test/migration.test.mjs` | ✅ exists — extend | ⬜ pending |
| 14-0X-0X | 0X | 2 | AUTH-02 | T-14-05 | Served and stored workspace documents carry no `sessions` or `tfa` keys (read AND write path) | unit (real server) | `node --test test/migration.test.mjs` | ✅ exists — extend | ⬜ pending |
| 14-0X-0X | 0X | 2 | AUTH-01 (threaded) | T-14-06 | Every new UI string catalogued EN+FR; new server codes have `err.<code>` in both; client-only codes allowlisted | unit (static + build) | `npm test && npm run build` | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/sessions.test.mjs` — SESS-01, SESS-02, SESS-03, `last_seen_at` banding, non-leakage of
  `token_hash`, revoked-session 401 teardown. Follows the harness contract of
  `test/helpers/server.mjs` exactly (no mocks; own server + temp DB).
- [ ] `test/migration.test.mjs` **extension** (not a new file): widen the `legacyColumns` capture to
  `users` + `sessions`, add pre-boot absence assertions, post-boot `pragma table_info` assertions for
  the full column set plus `login_challenges`, and the served/stored workspace-doc shape assertions.
- [ ] Locale entries in `src/locales/en.json` + `fr.json` for `dev.*` labels and the revoked-session
  toast key, plus the `CLIENT_ONLY_ERR_CODES` allowlist entry in `test/error-codes.test.mjs`.
- [ ] None for framework install — `node:test` is built into the required Node version.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two-browser revocation UX | SESS-02 | Requires two independent authenticated browser contexts (cookie isolation) | Sign in on two browsers as the same user → open Sessions in both → click "Disconnect all other sessions" in browser A → reload browser B → expect forced sign-out; browser A remains signed in |
| Device label legibility on a real UA | SESS-01 | Label rendering depends on the host's real User-Agent string | Sign in from a phone and a desktop, confirm both labels read correctly on the sessions page |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
