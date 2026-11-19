# Phase 76: OIDC/SSO Doors & Immunity Hardening - Research

**Researched:** 2026-11-19
**Domain:** In-repo OIDC/SSO gating extension over the Phase 75 domain-admission machinery (server.js + domains.js + node:test)
**Confidence:** HIGH — every integration point was opened and read line-by-line this session; no external packages involved.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Implementation Decisions
- **D-09:** JIT-provision domain refusal is logged with a plain `logInfo('sso signup domain refused', { domain })` — **domain only, never the full email address** (PII in logs), **no new security verb** for a single call site, no catalogue key. Matches the grep-able boot-log style of D-06. The client surface stays the generic `sso=error` redirect per research DP-4.
- **D-10:** Refused invites are **silently filtered** out of `pendingInvites` before the existing branching — a user whose ONLY pending invite is refused gets a normal login and can still see the pending invite under `/#invitations`. No special-case redirect, no refusal message (the user is signed in; refusal is policy, not failure). Consume nothing; loosening the list revives the invite.
- **D-11:** Boot logs **one combined matrix line** listing each door (signup / invite-create / invite-accept / sso-jit / sso-reconcile) with its resolved list and source (own / inherit / deny-all / off). SC4's promise — "read from the log exactly which doors admit which domains" — verbatim, no assembly by the reader. The Phase 75 D-06 per-var lines remain unchanged.
- **D-12:** **One table-driven node:test file** pinning all five decision points and the inherit matrix (both directions), with the **three existing-account immunity rows as explicit named rows**. Permanent suite, single place to read the whole contract. No per-door split; no e2e OIDC pass in this phase.

### the agent's Discretion
- Exact log-line field names/format for the D-11 matrix line (grep-able, structured)
- Test file naming and placement following existing node:test conventions
- Whether `logInfo` carries the structured payload object or an interpolated string (match whichever pattern the surrounding OIDC code uses)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. New capabilities explicitly out of scope: wildcards (already shipped in 75, see below), refusal audit verb, IDNA conversion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOM-05 | Existing accounts are immune: list changes never block logins, re-invites of existing out-of-list members, or repeat SSO logins of already-linked identities | Immunity is already true **by construction** in the code (see Pattern 3) — no code change; pinned by three named test rows (re-login of linked identity, re-invite of out-of-list member, repeat SSO login of linked identity) |
| DOM-06 | OIDC JIT account creation honors `ALLOW_SIGNUP_DOMAINS` (fresh-provision branch only, after the `email_verified` gate) | Exact insertion site identified: `server.js:5125-5130`, after the `verifiedEmail` gate at :5121, only in the `else` (fresh-provision) arm of the `if (!row)` block |
</phase_requirements>

## Summary

Phase 76 is a small, precision-targeted extension of already-landed machinery. The door matrix (boot-frozen `SIGNUP_DOMAINS`/`INVITE_DOMAINS` Sets, `emailDomainRefusal` funnel) exists in root `domains.js` and is already consumed by four doors (DP-1 signup, DP-2 invite-create, DP-3 accept, MCP invite_member). Phase 76 wires the two remaining doors — OIDC JIT provisioning (DP-4) and SSO invite reconciliation (DP-5) — plus one combined boot-matrix log line and one contract test suite.

The research found the code is **closer to done than the phase suggests**: wildcards (`'*'` allow-all) already shipped as a Phase 75 UAT follow-up despite the CONTEXT note listing them as "new capabilities out of scope" — `isWildcardList` and wildcard parsing are live in `domains.js:21-22, 55-59` and the D-06 log already prints `'*'` [VERIFIED: domains.js:21-22, server.js:8907]. Immunity (DOM-05) needs **zero code**: the already-linked-identity path (`server.js:5112-5151`) short-circuits before any domain predicate, and membership short-circuit precedes the invite accept predicate (`server.js:7952-7960` per Phase 75). The phase is therefore ~40% new code (two gates + one log line) and ~60% contract pinning via tests.

**Primary recommendation:** Two surgical edits in the OIDC callback of `server.js` (DP-4 gate in the fresh-provision arm, DP-5 filter before the `pendingInvites` branching), one combined D-11 boot log line after the existing D-06 lines, and one new table-driven test file `test/domain-admission-sso.test.mjs` that reuses the existing fake-IdP harness pattern from `test/oidc-sso.test.mjs` (extracted into a shared helper is the cleanest option — the current harness is inline and not exported).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DP-4 JIT domain gate | API/Backend (server.js OIDC callback) | — | The callback is a browser 302 route; refusal is server-side `logInfo` + generic redirect |
| DP-5 invite reconciliation filter | API/Backend (server.js SSO-07 block) | — | Row-based filtering happens before branching; client sees nothing new |
| D-11 combined matrix log | API/Backend (boot sequence) | Ops (docker logs) | Boot-time consts only; operator reads the log — anti-pattern to log at request time |
| Contract tests (D-12) | Test suite (node:test) | — | Permanent integration suite over spawned servers, per existing convention |

## Standard Stack

**No new packages.** Zero-dependency project constraint (STATE.md: "zero new dependencies"). Everything uses what's already in the repo:

### Core
| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| `emailDomainRefusal(email, domains, code, message)` | `domains.js:86-92` | The admission funnel — null = admitted, `{code,message}` = refused | All four existing doors compose it; DP-4/DP-5 must too (T-75-16: no bypass lane) [VERIFIED: domains.js:86-92] |
| `SIGNUP_DOMAINS` / `INVITE_DOMAINS` | `domains.js:79-80` | Boot-frozen tri-state consts (null / Set / wildcard Set) | Frozen once at first import; request-time env re-parsing is a documented anti-pattern [VERIFIED: domains.js:79-80] |
| `isWildcardList(list)` | `domains.js:22` | Wildcard sentinel check (`'*'` allow-all) | DP-4/DP-5 must behave identically to DP-1..DP-3 under `'*'` [VERIFIED: domains.js:22] |
| `logInfo(msg)` | `server.js:~170` (logLine wrapper) | D-09/D-11 logging | Existing grep-able boot-log style [VERIFIED: server.js:170] |
| node:test + `test/helpers/server.mjs` | `test/` | Integration suite harness (spawns real server.js per test, ephemeral port + DATA_DIR) | `npm test` runs `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json:19] |
| Fake IdP pattern | `test/oidc-sso.test.mjs:17-108` | In-process OIDC provider: test-generated RSA key, JWKS, discovery, minted id_tokens with configurable `email_verified` | Already proven for the exact callback under test [VERIFIED: test/oidc-sso.test.mjs:17-108] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Compose `emailDomainRefusal` in DP-4/DP-5 | Inline `Set.has(emailFromEmail(email))` checks | Rejected — bypass lane violates T-75-16; the funnel's wildcard/null tri-state handling must not be reimplemented |
| Extract fake IdP to `test/helpers/oidc-idp.mjs` | Duplicate the ~90-line idp object in the new test file | Extraction is cleaner (D-12 wants ONE contract file; it needs the idp); duplication keeps `oidc-sso.test.mjs` untouched. Planner's call — extraction touches a stable 929-line suite's imports only, low risk |

## Package Legitimacy Audit

**No external packages are installed by this phase** (zero-dependency constraint). Audit table empty — nothing to verify.

*Packages discovered via WebSearch or training data that have not been verified against an authoritative source are tagged `[ASSUMED]` and the planner must gate each install behind a `checkpoint:human-verify` task.* — N/A, none proposed.

## Architecture Patterns

### System Architecture Diagram

```
OIDC login (browser 302 flow)
        │
        ▼
/api/auth/oidc/callback (server.js ~:5033)
        │
        ├─ token verify → emailOk → identity resolution ──────────────┐
        │                                                             │
        ├─ already-linked (issuer, subject) row exists? ── YES ──▶ SKIP all gates (immunity, SC2/DOM-05)
        │                                                             │ NO
        │        existing users.email? ─ YES(link-gated) ─────────────┤
        │                                                             │ NO
        ├─ email_verified === true ? ── NO ──▶ errorRedirect() (G-30-1)
        │                                    YES
        ├─ ▼ DP-4 (NEW): emailDomainRefusal(email, SIGNUP_DOMAINS) refused?
        │        YES ──▶ logInfo('sso signup domain refused', {domain})   ← D-09, domain only
        │                 ──▶ errorRedirect() → /login?sso=error (generic, no params)
        │        NO ──▶ createUser(email, ...) → insert oidc_identities
        │
        ▼
SSO-07 reconciliation (zero memberships only)  [server.js:5153-5206]
        │
        ├─ pendingInvites = invites WHERE email=row.email (nocase, unused, unexpired)
        │
        ├─ ▼ DP-5 (NEW): filter pendingInvites by emailDomainRefusal(invite.email, INVITE_DOMAINS)
        │        (row email, verbatim DP-3 semantics; non-consuming; silently dropped — D-10)
        │
        ├─ 1 left  → auto-accept (verbatim recipe) → logSecurity('sso_invite_accepted')
        ├─ >1 left → ssoRedirect = '/#invitations'
        └─ 0 left  → normal login to '/'
        │
        ▼
2FA gate? → /#tfa challenge  :  session mint → 302 ssoRedirect
```

### Pattern 1: DP-4 — domain gate as the LAST gate in the fresh-provision arm
**What:** One `emailDomainRefusal` call between the `verifiedEmail` check and `createUser`.
**Where exactly:** `server.js:5121-5130`. Current verbatim code:

```js
      if (!row) {
        const existing = await db.get('select * from users where email = ?', [email]);
        if (existing && !(canLink && verifiedEmail)) return errorRedirect();
        if (existing) {
          row = existing;
        } else if (!verifiedEmail) {
          /* G-30-1: no verified email → no JIT account, guest or not —
             fail closed BEFORE any users/oidc_identities write. */
          return errorRedirect();
        } else {
          /* Pitfall 5: JIT accounts get a RANDOM unusable scrypt hash — never
             a constant — into the password_hash NOT NULL column. Bare account,
             no workspace (D-05); the onboarding flow lands them next. */
          const created = await createUser(email, String(claims.name || ''), crypto.randomBytes(24).toString('base64url'));
          row = await db.get('select * from users where id = ?', [created.id]);
        }
```
[VERIFIED: server.js:5116-5130]

**Placement rule (from CONTEXT/ARCHITECTURE):** the refusal check goes inside the final `else` arm only — i.e. the gate is `!existing && verifiedEmail && out-of-list`. Critically, `emailDomainRefusal(email, SIGNUP_DOMAINS)` returns `null` when `SIGNUP_DOMAINS === null` (door off) and when wildcard — so unset env means zero behavior change, and the check costs nothing to add [VERIFIED: domains.js:87-88]. Refusal shape: `logInfo` with domain (never full email — D-09), then `return errorRedirect()` (the helper at `server.js:5052-5054` writes `302 → /login?sso=error` [VERIFIED: server.js:5052-5054]).

### Pattern 2: DP-5 — filter before branching, consume nothing (D-10)
**What:** After fetching `pendingInvites` (`server.js:5162`), filter the array through the invite door before the `length === 1` / `length > 1` branching:

```js
const pendingInvites = (await db.all('select * from invites where email = ? collate nocase and used_at is null and expires_at > ?', [row.email, now()]))
  .filter(invite => emailDomainRefusal(invite.email, INVITE_DOMAINS) === null);
```

Semantics that must hold (verbatim DP-3, from `server.js:7955-7960` which validates `invite.email` — the ROW email, never a client body [VERIFIED: server.js:7955-7960]):
- Filter on the **invite row's stored email**, not `row.email` (they match by the SQL, but the row is the ticket — DP-3 discipline).
- **Non-consuming:** a filtered invite is untouched — no `used_at` write; loosening the list revives it on next login (mirrors DP-3's non-consuming refusal at :7952 comment) [VERIFIED: server.js:7952-7956].
- **Silent (D-10):** no log verb, no redirect change. Edge case: an SSO user whose ONLY invite is refused lands on `ssoRedirect = '/'` (normal login) with zero memberships — they can reach `/#invitations`, but the SPA's invitations surface must tolerate an empty pending list gracefully; verify the SPA surface doesn't error when the reconcile produced no accept and no invitations redirect. **Note for the planner:** D-10 says the user "can still see the pending invite under `/#invitations`" — but with the invite filtered, `pendingInvites.length` is 0, so `ssoRedirect` stays `'/'` and the SPA invitations view is user-navigated, not redirected. The invitation listing API (`/api/invitations` or equivalent) does NOT consult domain rules (the validator is only ever called at doors — ARCHITECTURE.md), so the invite is visible there. Confirm this endpoint exists and is list-not-gated during planning; grep shows the API surface for pending invitations is read-side and un-gated.

### Pattern 3: Existing-account immunity — no code, three named test rows (DOM-05)
The immunity argument is **by construction**, line-verified:
1. **Repeat SSO login of a linked identity (SC2):** `row` resolves from `oidc_identities` join (`server.js:5112-5115`) before any predicate; the whole `if (!row)` block including the new DP-4 gate is skipped [VERIFIED: server.js:5112-5151].
2. **Re-invite of an existing out-of-list member (SC3):** the accept route's membership short-circuit precedes the `INVITE_DOMAINS` gate — `server.js:7952-7960` shows the gate is `if (invite.email && INVITE_DOMAINS)` guarded after membership/pre-existing-user checks; Phase 75 SC3 test already pins the UI path (`gmail` one-door-one-rule test). The re-invite-at-CREATE side: an out-of-list existing member being invited again is refused at DP-2 create-time — wait: **careful.** DP-2 refuses out-of-list invites at create regardless of existing membership (verified: `server.js:7774` has no membership exemption). The seed's SC3 ruling says "re-inviting an existing member whose email is outside the current lists succeeds (membership short-circuit precedes the predicate)" — this refers to **accept** of an invite to a NEW workspace, not create-time. Verify against the seed wording at plan time; the ARCHITECTURE.md immunity section states the two explicit immunities are (1) OIDC repeat logins and (2) NOT accept-time (accept IS a door). **Open Question 1 covers the ambiguity.**
3. **Tightening never locks out an existing member:** memberships and member lists never consult domain rules (ARCHITECTURE.md, verified against server code: only doors 1–5 call the funnel).

### Pattern 4: D-11 combined matrix boot log
Existing D-06 lines to preserve unchanged (`server.js:8906-8909`):

```js
    const domainListLog = list => (list === null ? 'off' : isWildcardList(list) ? '*' : list.size === 0 ? 'deny-all' : [...list].sort().join(', '));
    logInfo(`domains: ALLOW_SIGNUP_DOMAINS: ${domainListLog(SIGNUP_DOMAINS)} (source: own)`);
    logInfo(`domains: ALLOW_INVITE_DOMAINS: ${domainListLog(INVITE_DOMAINS)} (source: ${'ALLOW_INVITE_DOMAINS' in process.env ? 'own' : 'inherit'})`);
```
[VERIFIED: server.js:8906-8909]

**D-11:** append ONE combined line after these, reusing `domainListLog` — e.g. (discretion format):

```js
logInfo(`domains: door matrix — signup: ${domainListLog(SIGNUP_DOMAINS)} | invite-create: ${domainListLog(INVITE_DOMAINS)} | invite-accept: ${domainListLog(INVITE_DOMAINS)} | sso-jit: ${domainListLog(SIGNUP_DOMAINS)} | sso-reconcile: ${domainListLog(INVITE_DOMAINS)}`);
```

Note the door→list mapping is structural: signup + sso-jit ride `SIGNUP_DOMAINS`; invite-create + invite-accept + sso-reconcile ride `INVITE_DOMAINS` (which already carries resolved inherit). "Source" for the invite doors is the resolved source of `ALLOW_INVITE_DOMAINS` from the D-06 line — the combined line may repeat it or rely on the D-06 lines for source (discretion). Tests pin the line by regex like the existing D-06 test (`test/domain-admission.test.mjs:260` "boot logs one source-tagged line per admission var (D-06)").

### Recommended Project Structure
No new source files. `domains.js` untouched. All edits in `server.js` (two gates, one log line, comments). One new test file + optionally one extracted test helper.

### Anti-Patterns to Avoid
(from `.planning/research/ARCHITECTURE.md` — all re-verified against current code)
- **Keyed refusal on the OIDC redirect:** a domain-revealing query param on `/login?sso=error` is an oracle for unauthenticated callers. Generic surface only. (That's why D-09 logs server-side instead.)
- **Gating the already-linked path:** `server.js:5103-5107` comment is explicit — "repeat logins must not break". The DP-4 gate lives in the fresh-provision arm ONLY.
- **Filtering DP-5 with a parallel policy:** the SSO-07 acceptance recipe is "VERBATIM from the accept route" (comment :5165-5166); DP-5's filter must mirror DP-3's semantics (row email, INVITE_DOMAINS, non-consuming), not invent a second rule.
- **Request-time env re-parsing:** boot-frozen consts only.
- **Refusing unparseable emails differently per door:** `emailFromEmail` returns null → funnel refuses; DP-4 inherits this for free by composing the funnel.
- **PII in logs:** D-09 mandates domain-only. `emailOk` shape at :5089 guarantees the email has a domain before DP-4 runs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Domain canonicalization/matching | Any new normalize/split/has logic | `emailDomainRefusal` from domains.js | Wildcard, tri-state, NFKC, warn-and-clean already handled; 5 doors must share ONE pipeline |
| Fake OIDC IdP for tests | New JWT signing/JWKS code | The harness pattern in `test/oidc-sso.test.mjs:17-108` | Battle-tested RS256/kid/alg-confusion harness with per-test `tokenConfig` incl. `email_verified` |
| Server-under-test | Any HTTP stubbing | `test/helpers/server.mjs` `startServer({env})` | Spawns real server.js, ephemeral port/DATA_DIR, cookie jar, env-absence stripping |
| Tri-state/wildcard assertions | Ad-hoc env tests | Existing env-matrix tests in `domain-admission.test.mjs:159-234` as template | Same spawn/regex/reboot idioms |

## Common Pitfalls

### Pitfall 1: Gate placement — the "existing && canLink" arm
**What goes wrong:** Putting the DP-4 check before the `if (existing)` branches would block a verified-email LINK of an existing account whose domain fell off the list — that link is not provisioning; blocking it changes existing behavior beyond DOM-06 scope.
**Avoid:** The gate goes ONLY in the final `else` (fresh provision) arm, per CONTEXT: "fresh-provision branch only, after the `email_verified` gate".
**Warning signs:** Test row "existing account + email_verified + out-of-list → still links" fails.

### Pitfall 2: DP-5 consuming a refused invite
**What goes wrong:** Filtering then running the existing auto-accept's clearing writes on the wrong array index, or an off-by-one where a filtered invite still gets consumed.
**Avoid:** Filter produces a NEW array; the branching consumes only from the filtered array. Assert in tests: after a refused-only reconcile, the invite row still has `used_at IS NULL`.

### Pitfall 3: Wildcard door semantics for the new gates
**What goes wrong:** Treating `'*'` as literal string or refusing under wildcard. `'*'` = allow-all via `isWildcardList` short-circuit inside the funnel (`domains.js:88`) — the new gates get it free ONLY if they compose the funnel.
**Warning signs:** Test `ALLOW_SIGNUP_DOMAINS='*'` + out-of-list SSO email → must provision (same as DP-1's wildcard test at `domain-admission.test.mjs:56`).

### Pitfall 4: `ssoRedirect` state after a fully-filtered reconcile
**What goes wrong:** Assuming a refused-only reconcile should redirect somewhere special (D-10 forbids it) or accidentally leaving `ssoRedirect = '/'` when the user EXPECTS `/#invitations`.
**Avoid:** D-10 explicitly: normal login, user navigates to `/#invitations` themselves. Pin with a test asserting the 302 Location is `/`.

### Pitfall 5: Log-line test flakiness
**What goes wrong:** D-11 line assertions colliding with the D-06 lines when regexes are too loose (`/domains:/` matches three lines).
**Avoid:** Assert on the distinctive combined-line prefix (e.g. `door matrix`) and assert the D-06 lines still appear unchanged (SC4 requires both).

### Pitfall 6: i18n scan gate
**What goes wrong:** Adding literal user-facing strings in server.js trips nothing (server returns code+message, client translates) — but a stray catalogue key edit without all 5 locales fails the parity gate. Phase 76 needs **zero** catalogue changes (D-09/D-10 are generic/silent). Don't touch `src/locales/*`.

## Code Examples

### DP-4 gate (sketch — final wording per plan)
```js
        } else if (!verifiedEmail) {
          /* G-30-1 ... (unchanged) */
          return errorRedirect();
        } else {
          /* DP-4 (Phase 76, DOM-06): the signup door gates JIT provisioning —
             fresh-provision branch only, AFTER the email_verified gate; an
             already-linked identity never reaches this arm (immunity, DOM-05).
             Refusal is domain-only in logs (D-09) and the generic sso=error
             surface on the client — no domain-revealing param. */
          const signupRefusal = emailDomainRefusal(email, SIGNUP_DOMAINS);
          if (signupRefusal) {
            logInfo('sso signup domain refused', { domain: emailFromEmail(email) });
            return errorRedirect();
          }
          const created = await createUser(...);
```
Note: `emailFromEmail` is not currently imported into server.js's OIDC scope check — grep shows imports at `server.js:180-185` are `SIGNUP_DOMAINS, INVITE_DOMAINS, emailDomainRefusal, isWildcardList`. Add `emailFromEmail` to that import list, or take the domain from `email.slice(email.lastIndexOf('@') + 1)` (email already lowercased/trimmed at :5086-5088 — but prefer the shared canonicalizer for exactness). [VERIFIED: server.js:180-185]

### DP-5 filter (sketch)
```js
        const pendingInvites = (await db.all('select * from invites where email = ? collate nocase and used_at is null and expires_at > ?', [row.email, now()]))
          /* DP-5 (Phase 76, DOM-05/SC3): refuse invites the accept door would
             refuse — row email against the live boot-frozen INVITE_DOMAINS,
             verbatim DP-3 semantics. Silent (D-10): a filtered invite is
             neither consumed nor messaged; loosening the list revives it. */
          .filter(invite => emailDomainRefusal(invite.email, INVITE_DOMAINS) === null);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wildcards listed as Phase 76 "new capability" in CONTEXT | Already shipped in Phase 75 (UAT G-75-5 follow-up): `'*'` allow-all, tolerant parse, `'*'` in D-06 log | Before 75 completion | DP-4/DP-5 must simply compose the funnel; no wildcard work, and tests should still pin wildcard behavior on the new doors |
| D-06 two per-var lines | D-11 adds one combined 5-door matrix line | This phase | Operator reads full matrix without assembly |

**Deprecated/outdated:** None. No dependency changes.

## Runtime State Inventory

Not a rename/migration phase — but the tightened/loosened-list interaction with **stored invite rows** is the only runtime state concern: invites store emails as strings; DP-5 re-derives against the live boot list at login time (no stored snapshot — the Phase 75 "fail-closed re-derivation, never a stored snapshot" decision carries over). No data migration needed. Mid-life list tightening takes effect on restart (boot-frozen consts) — D-11's matrix line tells the operator what's live.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The SPA invitations surface tolerates a signed-in user with zero pending invites navigating to `/#invitations` (no error) | Pattern 2 (D-10) | Minor UX edge; test-only impact |
| A2 | The pending-invitations read API is un-gated by domain rules (validator called only at doors), so a filtered invite remains visible under `/#invitations` | Pattern 2 | If the listing API were gated, D-10's "can still see the pending invite" needs a small read-side carve-out — planner should grep the invitations list route |
| A3 | SC3's "re-inviting an existing out-of-list member succeeds" refers to accept-of-invite / reconciliation, not create-time DP-2 (which currently refuses out-of-list regardless of membership, `server.js:7774`) | Pattern 3 | Wrong gate exemption added to DP-2 would break DOM-02 pinning; resolve via seed wording before coding |
| A4 | Extracting the fake IdP from `test/oidc-sso.test.mjs` into `test/helpers/` doesn't disturb that suite's behavior (imports only) | Standard Stack | Low; if worried, duplicate the ~90-line idp object instead |

## Open Questions

1. **SC3 scope: create-time vs accept-time re-invite**
   - What we know: `server.js:7774` (DP-2) refuses out-of-list invite creation with no existing-member exemption; seed SC3 says "re-inviting an existing member whose email is outside the current lists succeeds (membership short-circuit precedes the predicate)".
   - What's unclear: whether "membership short-circuit precedes the predicate" applies at create-time (would require a DP-2 change) or only at accept/reconcile (matches DP-3's current shape and ARCHITECTURE's immunity framing).
   - Recommendation: read `SEED-261119-f3w` verbatim during planning; default to accept/reconcile-only (no DP-2 change — matches "do not re-derive" guidance) unless the seed explicitly exempts create-time.

2. **Fake IdP extraction vs duplication**
   - What we know: the idp harness is inline in `test/oidc-sso.test.mjs` (not exported).
   - Recommendation: extract to `test/helpers/oidc-idp.mjs` (D-12 wants one contract file that still needs the idp); falls back to duplication if extraction shows any behavioral risk.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server + node:test | ✓ (project runs it) | per repo engines | — |
| node --test | D-12 suite | ✓ | `npm test` = `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json:19] | — |
| node:sqlite (harness) | test DB | ✓ (helpers/server.mjs imports it) | — | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), integration style |
| Config file | none — `npm test` globs `test/*.test.mjs` |
| Quick run command | `node --test test/domain-admission-sso.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOM-06/SC1 | Out-of-list JIT email → refused after email_verified, generic redirect, no session, no user row | integration (fake IdP, `email_verified: true`, out-of-list domain) | `node --test test/domain-admission-sso.test.mjs` | ❌ new (D-12) |
| DOM-06 | In-list SSO email provisions normally | integration | same | ❌ new |
| DOM-05/SC2 | Already-linked identity logs in repeatedly with lists tightened mid-life; never consults lists | integration (boot with list, login, reboot same DB with tighter list, login again) | same | ❌ new — **named immunity row 1** |
| DOM-05/SC2 | Repeat SSO login of linked identity (no re-check) | integration | same | ❌ new — **named immunity row 2** |
| DOM-05/SC3 | Re-invite of out-of-list member succeeds at accept/reconcile; SSO reconciliation filters refused invite before branching, non-consuming | integration | same | ❌ new — **named immunity row 3** |
| SC4/D-11 | Combined 5-door matrix line at boot; D-06 lines unchanged | integration (log regex) | same | ❌ new |
| D-12 | Inherit matrix both directions on the new doors (unset inherit / own / deny-all / wildcard) | table-driven rows in same file | same | ❌ new |
| Regression | Existing DP-1..DP-3 + wildcard + env-matrix behavior | existing suite | `node --test test/domain-admission.test.mjs` | ✅ (720 lines) |
| Regression | OIDC callback flows (linking, guest shape, alg confusion) | existing suite | `node --test test/oidc-sso.test.mjs` | ✅ (929 lines) |

### Sampling Rate
- **Per task commit:** `node --test test/domain-admission-sso.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/domain-admission-sso.test.mjs` — the D-12 contract suite (new)
- [ ] (optional) `test/helpers/oidc-idp.mjs` — extracted fake IdP, if planner chooses extraction

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing OIDC verification chain untouched; DP-4 adds a policy gate, never relaxes one |
| V4 Access Control | yes | Door-matrix policy at provisioning/reconciliation only; membership checks unchanged |
| V7 Logging (PII) | yes | D-09: domain only in refusal log — never the full email |
| V14 Config | yes | Boot-frozen env consts; fail-absent; no request-time re-parse |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Domain-revealing redirect params (rule oracle) | Information Disclosure | Generic `sso=error` surface only (errorRedirect, server.js:5052-5054) |
| Suffix attacks (`evil-a.com`) | Spoofing | Exact Set.has in funnel — never endsWith (already in funnel) |
| PII leakage in logs | Information Disclosure | D-09 domain-only logging |
| Refused-invite consumption races | Tampering | DP-5 filter is read-side only; no writes on refusal |

## Sources

### Primary (HIGH confidence — all read this session)
- `server.js:5033-5261` — OIDC callback verbatim (errorRedirect, gates, JIT arm, SSO-07 reconciliation, session mint)
- `server.js:180-185` — domains.js import list; `server.js:6735-6738`, `7767-7774`, `7952-8005` — DP-1/2/3 door call sites; `server.js:8906-8909` — D-06 log
- `domains.js:1-92` — full funnel: wildcard sentinel, canonicalize, parseDomainList, tri-state consts, emailDomainRefusal
- `test/oidc-sso.test.mjs:1-108` — fake IdP harness (RSA/JWKS/discovery/mintIdToken with email_verified)
- `test/domain-admission.test.mjs` (720 lines) — env matrix, D-06 log test, DP-2/DP-3 suites as templates
- `test/helpers/server.mjs` — spawn harness, env stripping, cookie jar
- `.planning/research/ARCHITECTURE.md` DP-4/DP-5 sections; `.planning/REQUIREMENTS.md` DOM-05/06 verbatim; ROADMAP Phase 76 SC1–SC4; `75-02-SUMMARY.md`

### Secondary (MEDIUM)
- Prior-art references in ARCHITECTURE.md (GitLab/Appsmith/Outline) — context only, not load-bearing

### Tertiary (LOW)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every API read line-by-line in-repo
- Architecture: HIGH — insertion sites are exact line ranges quoted verbatim
- Pitfalls: HIGH — grounded in code comments and Phase 75 suite behavior

**Research date:** 2026-11-19
**Valid until:** codebase-internal research; valid until Phase 76 code lands (no drift risk beyond this phase)
