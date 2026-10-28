# Phase 18: Closing Verification — i18n, Migration Proof & Real-Device UAT - Context

**Gathered:** 2026-10-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the three auth flows (session revocation, password change + revocation,
2FA login) as ONE whole surface: both locales everywhere, real Chromium e2e,
final migration purity (additive migration + byte-identical second boot +
zero auth fields in the workspace JSON), the "looks-done-but-isn't" pitfalls
checklist executed as explicit verification, and the QR verified by a human
on a real device (Google Authenticator + one other app).

This is a verification/closure phase. No new capabilities. All the
infrastructure exists: Playwright 1.64 (`npm run e2e`, 5 specs, ~12 tests in
flows.spec.mjs, helpers/setup.mjs, e2e/server.mjs), `test/migration.test.mjs`
(2FA columns + login_challenges + recovery_codes already asserted
byte-identical), `scripts/i18n-scan.mjs` (0 findings today), and the
Phase 16 UAT pattern (16-UAT.md with frontmatter status).

</domain>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning:

- `.planning/ROADMAP.md` — Phase 18 section: the 5 success criteria (AUTH-01,
  AUTH-03, final AUTH-02 check, real-device UAT, pitfalls checklist).
- `.planning/research/PITFALLS.md` — the full pitfall catalog (Pitfalls 1–21+).
  Pitfall 21 (byte-identical second boot; recovery-code backfill = the trap),
  Pitfall 15 (pending-2FA bypass), Pitfall 9 (revoke self-DoS) are
  load-bearing. The audit task walks EVERY item.
- `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` —
  D-01…D-17 pinned contracts (D-11 error catalogue, D-13 lockout copy,
  D-03 throttle budget, D-04 replay guard) — the checklist's ground truth.
- `.planning/phases/17-login-second-factor-flow/17-VERIFICATION.md` —
  documents the deferred items this phase absorbs: Chromium visual
  verification of the 2FA flow in both locales; WR-01/WR-02 findings;
  IN-02 (logout CSRF) as an out-of-scope observation.
- `.planning/phases/17-login-second-factor-flow/17-REVIEW.md` — WR-01/WR-02
  exact behavior (stale `S.ui.auth = '2fa'` card / spurious recovery toast on
  `finishLogin` failure branches).
- `test/migration.test.mjs` — the migration-proof pattern to extend
  (fixture via test/helpers/legacy-fixture.mjs, dump comparisons,
  `a second boot is a no-op` test).
- `e2e/flows.spec.mjs` + `e2e/playwright.config.mjs` — the e2e pattern to
  extend (per-language `for` loops over `[en, fr]`, config pinned locale
  en-US, demo-locale.spec excluded from the main suite, workers=1 in CI).
</canonical_refs>

<decisions>
## Implementation Decisions

### E2E Chromium scope (criterion 2)

- **D-75:** New auth e2e tests extend **`e2e/flows.spec.mjs`** — not a new
  spec file. Continuity with the existing 12 tests, shared setup, one config.
  If flows.spec grows unwieldy the planner may split into a second describe
  block, but no separate file/config.
- **D-76:** TOTP in e2e is obtained by **test-secret + local computation**:
  the test generates/knows the enrollment secret and computes the 6-digit
  code with the same RFC 4226/6238 logic as `totp.js` (import it directly —
  zero-dependency project, the module is importable from e2e). No test-only
  backdoor route in server.js.
- **D-77:** All new auth tests run **parametrically in EN + FR** (the
  `[en, fr]` `describe.for` pattern flows.spec already uses). AUTH-03
  demands both locales; i18n-scan alone is not enough.
- Coverage required by criterion 2: session revocation (revoke other
  sessions → they die, current survives — Pitfall 9), password change +
  revocation of other sessions (Pitfall 12), and the full 2FA login path
  (enroll via API/fixtures, login → pending2fa screen → code → signed in;
  recovery-code path included). This also discharges Phase 17's deferred
  visual verification of the 2FA flow.

### Migration proof (criterion 3)

- **D-78:** Extend **`test/migration.test.mjs`** — no separate final-proof
  test file. Add assertions for the newest schema (post-Phase-17:
  `sessions.pending_tfa` column behavior, `login_challenges` lifecycle
  cleanliness) and keep the existing byte-identical second-boot pattern.
- **D-79:** The "zero auth fields in workspace JSON" check is a **direct
  DB assertion** in the same test file: open each workspace document and
  assert absence of `tfa` / `sessions` keys (and any auth-bearing keys).
  This re-proves AUTH-02's doc-field removal as a final package; no API/
  client surface re-test (Phase 14 owns that and it was verified).

### Pitfalls checklist (criterion 5)

- **D-80:** The checklist runs as a **dedicated audit task producing
  `18-PITFALLS-AUDIT.md`** in the phase dir: a table — every PITFALLS.md
  item / verified-or-not / evidence (test file & test name, or code cite) /
  gap. Committed.
- **D-81:** A failing item becomes a **documented gap with a fix plan, not
  an inline fix**. No scope creep in the closing phase: red items are filed
  (roadmap backlog / next milestone), green items are evidenced. Exception:
  WR-01/WR-02 (below) which are pre-approved for fix here.

### Real-device UAT (criterion 4)

- **D-82:** UAT happens **after e2e is green** — the human tests a surface
  already automated. Pattern = Phase 16's `16-UAT.md`: frontmatter status,
  numbered tests with expected/result. Content: QR scan with Google
  Authenticator + one other app (per ROADMAP), enroll → verify next code,
  then the full 2FA login on the device.
- **D-83:** The UAT file is created by the plan and executed by the human;
  `/gsd-verify-work` routes on its completion (status: complete in
  frontmatter) before the phase can verify.

### Carried-forward fixes (scope-approved by user)

- **D-84:** **WR-01 and WR-02 are fixed in this phase** (small client task):
  clear `S.ui.auth` before calling `finishLogin` on the verify success path,
  and clear `S.ui.tfaRecoveryRemaining` at the same point — see
  17-REVIEW.md for exact behavior. A regression test pins both.
- **D-85:** **IN-02 (logout route has no sameOrigin guard) is NOT in this
  phase** — pre-existing, precedes v1.3; noted as a backlog observation in
  18-PITFALLS-AUDIT.md when the audit passes over it. No logout CSRF work
  here.

### Order of work (implied by decisions)

1. WR-01/WR-02 fix (D-84) — small, unblocks clean e2e of the 2FA path
2. e2e auth suite (D-75/76/77)
3. Migration proof extension (D-78/79)
4. Pitfalls audit → 18-PITFALLS-AUDIT.md (D-80/81)
5. UAT file + human device verification (D-82/83) — the phase's
   human_needed gate

</decisions>

<code_context>
## Codebase Context

- **e2e infra:** `e2e/playwright.config.mjs` (port 4317, locale en-US pinned,
  workers=1 CI, trace retain-on-failure), `e2e/helpers/setup.mjs`,
  `e2e/server.mjs` (API-backed server for tests). flows.spec loops
  `[en, fr]` with `describe.for`. `@playwright/test` ^1.64.1 in devDeps;
  `npm run e2e` script exists. `test:e2e` is NOT part of `npm test` — the
  plan should decide whether the closing gate runs both.
- **totp.js** is importable and pure (RFC 4226/6238) — e2e can compute codes
  locally (D-76). Test fixtures for TOTP secrets exist
  (test/totp.fixture.test.mjs, test/qr.fixture.test.mjs patterns).
- **migration.test.mjs** uses test/helpers/legacy-fixture.mjs (pre-v1.3 DB)
  with dump-and-compare helpers; new columns were already added to its
  schema assertions in Phases 14/16 — Phase 18 extends for post-17 surface
  and the JSON key scan (D-78/79).
- **i18n-scan.mjs**: currently 0 findings. The whole-surface check is a
  re-run over the final tree plus the FR overflow spec
  (e2e/french-overflow.spec.mjs) as the visual half.
- **Throttle in e2e:** login attempts share one budget per ip+email (D-03);
  e2e tests doing repeated logins must reset or isolate state per test to
  avoid cross-test 429s (helpers/setup.mjs likely already isolates; planner
  verifies).
- **Deferred UI fixes:** WR-01/WR-02 exact sites are in
  `src/actions/actions.js` (`doTfaLogin` success path) per 17-REVIEW.md.
</code_context>

<deferred>
## Deferred Ideas

- **IN-02 logout CSRF (sameOrigin on logout route)** — real but pre-existing;
  backlog for a v1.3.x hardening pass (D-85).
- Any new capability suggestions from the audit → roadmap backlog, not this
  phase (D-81).
</deferred>

---
*Context gathered via /gsd-discuss-phase 18 — decisions D-75…D-85 are locked
for research and planning.*
