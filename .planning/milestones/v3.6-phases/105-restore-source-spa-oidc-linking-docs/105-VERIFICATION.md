---
phase: 105-restore-source-spa-oidc-linking-docs
verified: 2026-11-28T08:25:36Z
status: passed
score: 5/5 roadmap success criteria verified
covered_files:
  - .planning/phases/105-restore-source-spa-oidc-linking-docs/105-01-PLAN.md
  - .planning/phases/105-restore-source-spa-oidc-linking-docs/105-01-SUMMARY.md
  - .planning/phases/105-restore-source-spa-oidc-linking-docs/105-02-PLAN.md
  - .planning/phases/105-restore-source-spa-oidc-linking-docs/105-02-SUMMARY.md
  - src/actions/actions.js
  - src/pages/backup.js
  - src/core/api.js
  - src/locales/en.json
  - src/locales/de.json
  - src/locales/es.json
  - src/locales/fr.json
  - src/locales/nl.json
  - docs/DEPLOY.md
  - .env.example
  - test/oidc-docs.test.mjs
  - test/restore-client.test.mjs
  - server.js
behavior_unverified: 0
overrides_applied: 0
---

# Phase 105: Restore-Source SPA + OIDC Linking Docs — Verification Report

**Phase Goal:** Operators pick a restore source in the dialog with honest per-source availability feedback, and the OIDC linking documentation tells the truth about `OIDC_TRUST_TENANT_EMAIL` and the Azure group-claim setup.
**Verified:** 2026-11-28T08:25:36Z
**Verdict:** **VERIFIED**

## Goal Achievement — Per-Criterion Table

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| SC-1 | Source picker fed by `sources[]` (fail-open), on-demand probe with honest result, NO mid-run swap | `src/pages/backup.js:692` — `sourcePicker` fed by `S.ui.restoreSourcesById` (staged from the restore-backups GET runs[].sources), rendered only when `sources.length > 1`, fail-open (`[]` fallback, comment "fail-open without the feed"); probe badge renders `probe.result.ok ? 'sourceProbeOk' : 'sourceProbeFail'` with raw probe key in esc()d `title` — real probe outcome, never fake success; `A.restoreProbe` (`src/actions/actions.js:6119`) stores `{ok, key, data}` verbatim, refusals → fail badge + keyed toast, a failed probe never disables a chip (pinned by test restore-client.test.mjs:475); `restoreProgress` (`src/pages/backup.js:750+`) contains **zero** source/probe markup (grep = 1 comment hit only, no markup) and test :223 pins `!progress.includes('restoreSource') && !progress.includes('restoreProbe')` | ✓ VERIFIED |
| SC-2 | Zero probes on page load; probe never clears mirror flags | Structural pin holds: `api.restoreProbe(` appears exactly once — inside `A.restoreProbe` (test :444–460 asserts one call site, `!pagesSrc.includes('api.restoreProbe')`, no render-path call); the drawer-open kick calls only `api.restoreBackups()` (list GET, no probe — D-89-14). Probe writes only `S.ui.restoreProbe` — no mirror-flag mutation in `A.restoreProbe` (source read at :6119–6139); `restoreArmedSource` reads only `S.ui.restoreSourcesById` + `S.ui.restoreSource` (zero-derivation guard, test-pinned) | ✓ VERIFIED |
| SC-3 | DEPLOY.md leads with flag, pins guest carve-out, symptom→cause table — fidelity vs server.js | Re-read `server.js:6673–6727` myself: `isPinnedTenant = claims.tid === tenantId` (:6713), `guestShape = idp claim ≠ issuer OR acct==='1'` (:6714), trust-flag tokens `['true','1','yes','on']` (:6723), substitution `trustTenantEmail && isPinnedTenant && !guestShape` (:6724) covering linking AND JIT via `verifiedEmail`. `docs/DEPLOY.md:338+` matches claim-for-claim: flag leads the Azure AD work/school block, guest carve-out (acct=1 / external idp → literal claim required, flag never applies), 3-row symptom table (flag fix / IdP fix for guests / tid–issuer mismatch row). Literal-claim rule + fail-closed + already-linked immunity also present | ✓ VERIFIED |
| SC-4 | Azure GUID copy-path in existing block, no duplication | One bullet added to the existing **ApplicationGroup claim prerequisites** list ("Copy the group's GUID for the mappings form" → Object ID → /governance paste); manifest bullet and Enterprise-app assignment each appear once — no new heading, no reflow | ✓ VERIFIED |
| SC-5 | .env.example comment: why + carve-out + token list + pointer | `.env.example:170–180`: "work/school tokens omit it" (the why), "Guests — acct=1 or an external idp claim — always need the literal `email_verified: true`; flag never applies", "Accepted values: true/1/yes/on", "See docs/DEPLOY.md → Linking policy" | ✓ VERIFIED |

## Standing Gates

| Gate | Evidence | Status |
|------|----------|--------|
| Zero new deps | `git diff 9a60849d..HEAD -- package.json` empty | ✓ PASS |
| ×5 locale parity (6 new keys) | sourcePickLabel/sourcePickHint/sourceProbeCheck/sourceProbeChecking/sourceProbeOk/sourceProbeFail each present in exactly 5 of `src/locales/*.json` | ✓ PASS |
| esc() on data-source/data-id/title | backup.js:707/712 — `data-id="${esc(d.runId)}" data-source="${esc(s)}"`, badge `title="${esc(...)}"` | ✓ PASS |
| Verb pin 85 / data-a 632 | test/i18n-shell.test.mjs:349 pins `assert.equal(a, 632)` with the `+2 (105-01)` D-12 entry; suite passes | ✓ PASS |
| Full suite baseline | Re-ran full suite: **2767 tests, 2734 pass, 2 fail — exactly the two documented pre-existing failures** (D-05 French typography golden list; webhook-routes D-06 GET-list health). No new failures | ✓ PASS |
| 89-05 outbox flake re-check | `node --test test/email-outbox.test.mjs` → 14/14 pass; outbox did not fail in the full-suite re-run either | ✓ PASS |
| Docs-fidelity pins | `node --test test/oidc-docs.test.mjs` → 5/5 pass | ✓ PASS |
| Restore-source matrix | `node --test test/restore-client.test.mjs` (with oidc-docs) → 32/32 pass, incl. transport pins, zero-derivation guard, 6 reset sites, probe-only structural pin | ✓ PASS |

## Transport (6 restore calls)

| Call | Transport | Evidence |
|------|-----------|----------|
| preview (GET) | `?source=` | api.js:581 — appended only when set; byte-identical otherwise |
| download (GET) | `&source=` | actions.js:5661 — omitted when unarmed, byte-identical URL |
| verify (POST) | `body.source` | actions.js:5705 — `api.backupVerifyChecksum(id, { source: restoreArmedSource(id) })` |
| restoreRun / new (POST) | `body.source` | actions.js:5940 |
| restoreOverwrite ×2 (POST) | `body.source` | actions.js:6009, 6038 |
| restoreInstance (POST) | `body.source` | actions.js:6070 |

`restoreArmedSource` (actions.js:5819) is a mirror-guard: only values that arrived in `sources[]` are ever sent, non-default only (`armed !== sources[0]` → `undefined` → param omitted). All pinned by test matrix. camelCase `source` in every body. ✓ VERIFIED

## Real-Test Check

The probe UI tests are **structural** (source-slicing string assertions, node:test with no DOM harness): they pin the one probe call site inside `A.restoreProbe`, esc()d data attributes, chip-never-disabled, and the zero-markup progress panel. No behavioral harness (jsdom/puppeteer) exists in this project, so the probe click → badge → toast round-trip is not machine-exercised; wiring is fully traced and the honest-result logic is 4 lines of straight-line code (`result.ok = res.data?.key === 'success'`). Noted, not a gap — routed as a human-verification item below for completeness at milestone closeout.

## Human Verification (milestone-closeout UAT, optional)

1. **Probe click round-trip on a live instance** — open the restore preview drawer with >1 source, click a per-source probe icon against a reachable and an unreachable destination; expect green OK badge on reachable, fail badge with raw key in title + keyed toast on unreachable, and the mirror flag unchanged either way. Why human: no DOM harness; badge rendering/toast copy is visual.
2. **Chip pick → restore origin check** — arm a non-default source, run a restore, confirm the server audit shows the carried source; confirm no source control renders in the pending-run panel. Why human: end-to-end flow with real backend state.

## Anti-Patterns / Notes

- No debt markers (TBD/FIXME/XXX) in any phase-touched file.
- SUMMARY deviations (pin widenings, fr apostrophe fix) are rule-compliant and verified by the passing suite.

---

_Verified: 2026-11-28T08:25:36Z_
_Verifier: gsd-verifier (GLM subagent)_
