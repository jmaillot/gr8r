---
phase: 30-entra-sso-oidc
plan: 03
subsystem: auth/sso
tags: [oidc, sso, 2fa, totp, challenges, invites, jit, reconciliation]
requires: [30-02 identity resolution + JIT refine, Phase 31 D-68 challenge recipe]
provides:
  - challenge-then-stop branch inside the OIDC callback (verbatim D-68 recipe, 302 → /#tfa) — SSO-05
  - invite reconciliation inside JIT provisioning (single → auto-accept via acceptance recipe; multi → surfaced /#invitations) — SSO-07/D-06
  - sso_invite_accepted security verb
  - SSO-05 + SSO-07 test rows in test/oidc-sso.test.mjs (suite 42 → 46)
affects: [30-04 (client wires #tfa and #invitations fragments + ssoError banner)]
tech-stack:
  added: []            # zero new dependencies (milestone invariant)
  patterns: [verbatim recipe reuse (D-68 + accept route), user-scoped challenge rows, membership-count-gated reconciliation]
key-files:
  created: []
  modified: [server.js, test/oidc-sso.test.mjs]
decisions:
  - "SSO 2FA redirect target is /#tfa — a hash fragment (Pitfall 9: survives mid-challenge refresh); plan 30-04 wires the SPA fragment if missing (it is — authRoutes has no 'tfa' yet)"
  - "Multi-invite surface redirect is /#invitations — no pending-invite listing surface exists today; 30-04 wires the fragment; both invites stay pending so 'never stranded' holds structurally (each is also reachable via its emailed /join/<token> link)"
  - "Reconciliation is gated on ZERO memberships, not on JIT-newness: it covers the linked-existing-account-with-no-membership case, and repeat logins are idempotent by construction (membership exists after first accept)"
  - "OIDC.defaultRole is NOT consumed by a membership write: D-05 mandates the bare account (no invite) writes no membership, and invites carry their own validated role — the clamp stays test-pinned at readConfig from 30-02"
  - "Invite email matching is case-insensitive (collate nocase) to mirror users.email's UNIQUE collate nocase"
metrics:
  duration: ~20 min
  completed: 2026-11-02
status: complete
commits: 2
plan_head_before: 22a8dd9
plan_head_after: e580ea9
actuals:
  tokens: 7678        # chars/4 over the realized diff (30,712 diff chars in the two files)
  tasks: 2
  commits: 2
---

# Phase 30 Plan 03: SSO × 2FA Composition + Invite Reconciliation Summary

**One-liner:** The OIDC callback now stops at the verbatim D-68 challenge for TOTP-enrolled accounts (challenge row + cookie, NO session, 302 → /#tfa; the unchanged /api/auth/tfa/login completes it), and JIT provisioning reconciles pending invitations — auto-accepting a single unexpired invite through the verbatim acceptance recipe, surfacing (never mass-accepting) multiple, ignoring expired — pinned by 6 new test rows.

## What Was Built

- **`server.js`** — two insertions in the OIDC callback, both AFTER identity resolution and BEFORE any session mint:
  - **Invite reconciliation (SSO-07/D-06):** for users with ZERO memberships (covers JIT bare accounts AND linked existing accounts that belong to no workspace; repeat logins skip by construction), query pending unexpired invites by email (`collate nocase`, `used_at is null`, `expires_at > now()` — the accept route's criteria). Exactly one → auto-accept with the acceptance recipe VERBATIM from the accept route: `addMembership(ws, row, invite.role, teams, scope)` (invite's stored role — never a parallel membership insert, T-30-11) + the same single-use clearing writes (consumed token stamped `used_by` + every other pending link for that address in that workspace). `logSecurity(row.id, 'sso_invite_accepted')`. More than one → `ssoRedirect = '/#invitations'`, all invites stay pending. Expired invites are filtered out — neither accepted nor blocking.
  - **Challenge-then-stop (SSO-05/T-30-09):** `row.two_fa_enabled` → the D-68 branch VERBATIM from the login route (same `login_challenges` insert column list, same `setChallengeCookie`, same `CHALLENGE_TTL_MS`, throttle map untouched per D-03/Pitfall 18) except the response is a browser 302 to `/#tfa` (Pitfall 9 hash fragment) instead of XHR JSON. No session exists until a valid code is posted to the UNCHANGED `/api/auth/tfa/login` (challenge rows are user-scoped — zero route changes). The final session-mint 302 now uses `ssoRedirect` (default `/`).
- **`test/oidc-sso.test.mjs`** — 42 → 46 tests:
  - SSO-05 rows: enrolled account via SSO → `/#tfa` + challenge cookie + zero NEW sessions rows; a live TOTP code completes through the unchanged route (session minted, challenge consumed/cleared); the existing revoke route tears the SSO session down (204 → subsequent authenticated GET 401s); replaying the consumed callback URL mints no second challenge and no session; two login attempts for the same user produce two DISTINCT per-attempt challenge rows; a source pin asserting the callback block carries the identical login_challenges insert column list + `setChallengeCookie` + `CHALLENGE_TTL_MS` (and that the login route's recipe is untouched).
  - SSO-07 rows (fresh server, invites seeded via `withDb`): single pending invite auto-accepted (membership carries the invite's role, teams authority row, scope JSON; invite `used_at/used_by` stamped; `sso_invite_accepted` logged); multiple invites → `/#invitations`, zero memberships, both invites still pending; expired admin-role invite ignored (no membership, invite untouched, no elevation); repeat login → still exactly one membership and one identity row.
  - TOTP enrollment rides the real API (signup → tfa/enroll → tfa/enable, the test/tfa-login recipe) with a `MASTER_KEY`-carrying server.

## Verification

- `node --test test/oidc-sso.test.mjs` — 46/46 pass
- `node --test test/tfa-login.test.mjs` — 9/9 pass (route unchanged)
- `npm test` (full suite, `--test-concurrency=2`) — 800 pass / 0 fail / 3 pre-existing skips (not from this plan)

## Deviations from Plan

Behavior executed as written. Documented interpretation calls:

1. **[Interpretation] Redirect targets `/#tfa` and `/#invitations` are hash fragments, not existing routes:** the SPA's pending-2FA state (`S.ui.auth = '2fa'`) is in-memory only — no URL produces it today — and no pending-invite listing surface exists. Pitfall 9 names `#tfa` as the expected fragment and plan 30-04 explicitly owns "adjust the client only if the fragment is missing." Both fragments survive a mid-challenge refresh (hash), and multi-invite stranding is structurally impossible regardless (each invite also remains reachable via its emailed `/join/<token>` link).
2. **[Interpretation] Reconciliation gate = zero memberships, not "first sight of a new identity":** the plan's parenthetical ("linked users who already have memberships skip this") is implemented literally — the membership-count gate covers both JIT-created and linked-but-memberless users, and makes the repeat-login idempotency row true by construction rather than by a parallel check.
3. **[Interpretation] `OIDC.defaultRole` is not consumed by any membership write:** D-05 mandates the bare account (no invitation) writes NO membership (lands on onboarding), and invites carry their own validated role — so the D-04 clamp's call-site application surface does not exist; it remains test-pinned at `readConfig` from 30-02.

Also: a first implementation pass committed both tasks' server blocks in one commit; it was split (soft reset + hunk surgery, both intermediate trees re-verified green) so each task carries its own atomic commit.

## Known Stubs

None in server behavior. One intentional client gap inherited by design: the SPA does not yet render the `/#tfa` pending-2FA state or an invitations surface from the SSO redirect fragments — plan 30-04 owns that client wiring (its behavior row 4 states it verbatim). The server-side state (challenge row, pending invites) is fully live and test-pinned.

## Threat Flags

None — no security surface beyond the plan's threat model was introduced. T-30-09 (2FA bypass — verbatim challenge branch before any session mint, test-pinned), T-30-10 (replay — one challenge max, no second session), T-30-11 (elevation — addMembership with the invite's stored role only, expired filtered, multi surfaces instead of mass-accepting) are all mitigated and pinned; T-30-SC unchanged (zero new packages).

## Self-Check: PASSED

- `git log` verified: `6725a4f` (SSO-05), `e580ea9` (SSO-07) — measured 2 commits from ledger base `22a8dd9`.
- Suites green: 46/46 in-file, 9/9 tfa-login, 800/800 full suite (3 pre-existing skips).
- Source pin test asserts the verbatim D-68 recipe inside the callback block.
