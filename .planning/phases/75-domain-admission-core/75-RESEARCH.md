# Phase 75: Domain Admission Core - Research

**Researched:** 2026-11-19
**Domain:** Env-gated email-domain admission in a single-file, zero-dependency Node 24 server (server.js, 8863 lines)
**Confidence:** HIGH — all integration points re-verified against live code this session; milestone-level research (`.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md`) already covers the design deeply and is incorporated here

## Summary

The feature is ~50 lines in `server.js` plus catalogue keys and tests: a tri-state boot resolver for `ALLOW_SIGNUP_DOMAINS` / `ALLOW_INVITE_DOMAINS` (null = unset → off/inherit, empty Set = deny-all per D-01/D-02, populated Set = exact allowlist), one canonicalizing funnel (`normalize → NFKC → lowercase → strip trailing dot → parse after last '@'`), and exact `Set` membership at three doors: signup (server.js:6703), invite create (server.js:7745 per-email loop), invite accept fail-closed (server.js:7868+). Zero new dependencies — everything is stdlib strings and `Set`.

**New finding this session (resolves the STATE.md blocker):** `mcp.js` **does** mint invites — the `invite_member` tool (mcp.js:923–970) runs its own inline email regex and inserts directly into `invites`, never touching server.js routes. It is a real fourth door for Phase 75: an MCP invite currently bypasses any `ALLOW_INVITE_DOMAINS` rule entirely. The planner must either wire the shared validator into `invite_member` (a `toolError` refusal, ~3 lines, same door semantics as DP-2) or explicitly defer it to Phase 76 with a recorded decision. Leaving it unaddressed silently breaks the DOM-02 guarantee "owner can restrict invite creation".

**Testability constraint:** `server.js` cannot be imported by tests (it boots on load) — the house pattern is the `startServer({ env })` harness (test/helpers/server.mjs:43), which spawns a fresh server per case and supports env injection *including unset vars* (an `undefined` value is stripped from the spawned env). This makes the tri-state matrix testable at integration level, one spawned server per matrix cell. Pure-function table tests for the canonicalizer either ride that harness or duplicate the function under test (the established "read the source as text" extraction pattern only works for regex-level assertions).

**Primary recommendation:** Boot-parse both vars into frozen `Set|null` consts next to `ALLOW_SIGNUP` (server.js:135), inherit via `??` once, one shared `emailDomainRefusal(email, list)` funnel mirroring `validateGuestInviteShape`'s `{code,message}|null` contract, wire DP-1/DP-2/DP-3 (+ decide on the MCP door), keys in all 5 catalogues same commit, table-driven adversarial suite first.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `ALLOW_INVITE_DOMAINS=''` (set-but-empty) = **deny-all** for invites — not inherit.
- **D-02:** `ALLOW_SIGNUP_DOMAINS=''` = **deny-all for signup**. Symmetric tri-state: null (unset) = off/inherit, empty Set = deny-all, populated Set = allowlist.
- **D-03:** Multi-email invites refused **per-email inline**; valid emails proceed (mirrors the `emailOk` per-email loop at server.js:7745).
- **D-04:** Refusal message **generic** — never reveals the allowed-domain list (no policy oracle).
- **D-05:** Malformed entries **warn-and-clean** at boot (lowercase, trim, drop empties with warning, dedupe) — not fail-fast.
- **D-06:** Boot logs **one structured summary line per var**: name, resolved domains, source (own / inherit / deny-all / off). Grep-able, OIDC env-gate boot-log pattern.
- **D-07:** Accept-time refusal is **generic, keyed**, non-consuming (invite row not destroyed; loosening revives it).
- **D-08:** Inviter is **not notified** when a pending invite is refused at accept.

### the agent's Discretion
- Exact catalogue wording for new refusal keys (EN first, translated in same commit)
- Internal shape of the validator/resolver functions (pure, funnel-shaped, unit-testable)
- Whether `process.env` is read live or boot-frozen at the door call-sites (research recommends boot-freeze; planner's call — see Open Questions)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope. (OIDC/SSO doors, immunity contract tests, boot door-matrix log are Phase 76; DOM-05/06 are Phase 76.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOM-01 | Signup restriction via `ALLOW_SIGNUP_DOMAINS`, unset = fail-open | DP-1 wiring at server.js:6703 (after structural checks, before `createUser` at :6717); tri-state resolver; `ALLOW_SIGNUP` gate precedes it (:6707) |
| DOM-02 | Invite restriction via `ALLOW_INVITE_DOMAINS`, unset inherits signup, explicit stands alone | Boot `??` inheritance; DP-2 per-email loop at server.js:7745; **MCP `invite_member` door (mcp.js:923) — NEW finding, planner decision required** |
| DOM-03 | Invited user from invite-only domain accepts, creates account, logs in; accept never consults signup list | DP-3 checks only `INVITE_DOMAINS`; canonical gmail.com scenario pinned as acceptance test |
| DOM-04 | Pending invites re-validated fail-closed at accept; non-consuming keyed refusal, 5 catalogues | Insert after the `allowInviteGuests` re-derive block (ends ~server.js:7917), before `readJson`/account resolution; D-50-8 non-consumption precedent |
| DOM-07 | Exact canonicalized matching; no `endsWith`; NFKC/trailing-dot/case; no subdomain wildcards | Canonicalizer funnel + adversarial table suite; `endsWith` bypass verified on Node 24 (`'evilexample.com'.endsWith('example.com') === true`); GHSA-7rqj-j65f-68wh homoglyph-＠ class |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Env parsing / inheritance / deny-all semantics | API/Backend (server.js boot consts) | — | Pure boot-time derivation; one place reads both env vars |
| Canonicalization + exact-match predicate | API/Backend (server.js helper zone, next to `emailOk` :671) | — | Single funnel, single `split('@')` call site — the anti-bypass invariant |
| Signup door refusal | API/Backend (signup route) | Client i18n (translates `code`) | Server emits keyed code; client renders localized refusal (ERR-01/02 flow) |
| Invite-create door (REST) | API/Backend (invite route, per-email loop) | Client i18n | D-03 per-email inline refusal via existing `{email}` payload pattern |
| Invite-create door (MCP) | API/Backend (mcp.js `invite_member`) | — | Inserts directly into `invites`; must call the same validator |
| Invite-accept fail-closed re-derive | API/Backend (accept route) | Client i18n | Row email is the ticket; live list at accept; non-consuming 403 |
| Localized refusal rendering | Client (i18n catalogues) | Server (catalogue registration :110) | Keys land in all 5 locale files in the same commit; parity gate enforces |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib strings | 24.21 (engines `>=24`) [VERIFIED: package.json engines + STACK.md node-repl execution] | Parse, trim, lowercase, NFKC, `lastIndexOf('@')`, Set membership | Zero-dep constraint; every needed behavior verified on Node 24 |
| `node:test` | bundled | Table-driven tri-state/adversarial suite | House pattern (`test/*.test.mjs`, ~1800 tests) |
| `test/helpers/server.mjs` `startServer({ env })` | existing | Per-cell integration tests with env injection (unset supported via undefined-stripping, server.mjs:53-56) [VERIFIED: test/helpers/server.mjs:43-61] | Only way to test server.js behavior (it cannot be imported — boots on load) |
| `scripts/i18n-scan.mjs` (prebuild gate) | existing | Enforces catalogue parity for new refusal keys | Runs automatically on `npm run build` [VERIFIED: package.json scripts] |

### Supporting
None. Zero new dependencies — the standing constraint is fully honored.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled canonicalizer | `validator.js` / `tldts` / PSL | Violates zero-deps; PSL subdomain logic explicitly out of scope |
| `new URL('mailto:'+email)` parsing | `lastIndexOf('@')` | Only if quoted local parts needed — they aren't (regex + OIDC gate upstream) |
| Live env re-read per gate | Boot-frozen consts | Both work with the spawned-server harness; boot-freeze matches `ALLOW_SIGNUP` posture (:135) and the established restart-to-reload operator contract |

**Installation:** none — no packages added.

## Package Legitimacy Audit

No external packages are installed in this phase — the feature is stdlib-only. Audit skipped (nothing to verify). This satisfies the standing "no new runtime dependency" constraint from REQUIREMENTS.md.

## Architecture Patterns

### System Architecture Diagram

```
env: ALLOW_SIGNUP_DOMAINS / ALLOW_INVITE_DOMAINS
        │  boot parse (tri-state: unset→null / ''→empty Set / list→Set)
        │  inherit: INVITE = parse(invite) ?? SIGNUP   (once, at boot)
        ▼
  [SIGNUP_DOMAINS] [INVITE_DOMAINS]  (frozen Sets or null)
        │
        │  shared funnel: emailDomainRefusal(email, list)
        │    null → allowed   |   {code, message} → keyed refusal
        │
  ┌─────┼──────────────┬─────────────────────┐
  ▼     ▼              ▼                     ▼
DP-1   DP-2          DP-3                 MCP door (decision)
signup invite-create  invite-accept        mcp.js invite_member
:6703  :7745 loop     :7868 route          :923 tool
400    400 per-email  403 fail-closed      toolError refusal
       before db.tx   validates invite.ROW email
                      non-consuming        (planner decides:
                                            in-scope now or Phase 76)

OIDC JIT (~:5120) and SSO reconciliation (~:5155) → Phase 76, untouched here.
```

### Recommended Project Structure

No new files (anti-pattern #4 in milestone ARCHITECTURE: every comparable funnel lives in server.js). Changes land in:

```
server.js                  # resolver consts (~:135 zone) + funnel (helper zone ~:671)
                           #   + 3 gate insertions + 2 boot log lines (~:8843 zone)
mcp.js                     # (decision) invite_member domain gate
src/locales/{en,fr,nl,de,es}.json   # err.<key> entries, same commit
test/domain-admission.test.mjs      # new suite: tri-state matrix + adversarial table + doors
DEPLOY.md                           # env docs (doc-parity test precedent, v1.9 KEY-03)
```

### Pattern 1: Tri-state resolver + inheritance (the whole config surface)

```javascript
// Boot zone, next to ALLOW_SIGNUP (server.js:135). D-01/D-02/D-05/D-06.
const parseDomainList = (raw, name) => {
  if (raw === undefined) return null;                  // unset → off / inherit
  const set = new Set(
    String(raw).split(',')
      .map(s => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean));                               // D-05: warn-and-clean, dedupe
  // D-06: logInfo one structured line: name, resolved domains, source
  return set;                                          // '' → empty Set = deny-all
};
const SIGNUP_DOMAINS = parseDomainList(process.env.ALLOW_SIGNUP_DOMAINS, 'ALLOW_SIGNUP_DOMAINS');
const INVITE_DOMAINS = parseDomainList(process.env.ALLOW_INVITE_DOMAINS, 'ALLOW_INVITE_DOMAINS')
  ?? SIGNUP_DOMAINS;                                   // DOM-02 inheritance, once
```

### Pattern 2: The shared funnel (mirrors `validateGuestInviteShape`, server.js:4708)

```javascript
// Canonicalize FIRST (NFKC catches homoglyph ＠, GHSA-7rqj-j65f-68wh class),
// parse LAST (after last '@'), strip one trailing dot, exact Set membership only.
const emailDomain = (email) => {
  const dom = String(email).trim().normalize('NFKC').toLowerCase().split('@').pop() || '';
  return dom.endsWith('.') ? dom.slice(0, -1) : dom;
};
const emailDomainRefusal = (email, list) => {
  if (!list) return null;                              // fail-absent: unset → off
  if (list.has(emailDomain(email))) return null;       // exact === via Set — never endsWith
  return { code: 'domainNotAllowed', message: '...' }; // D-04: generic, no list reveal
};
```

### Pattern 3: Gate insertion order (verified against live code this session)

- **DP-1 signup** [VERIFIED: server.js:6703-6740]: route does `sameOrigin → ALLOW_SIGNUP (:6707) → throttle → readJson → name/password checks`. Note: there is **no `emailOk` at route level** — email shape is enforced inside `createUser` (via the `httpError` at server.js:4594). Insert the domain refusal after the `passwordTooWeak` check (~:6716), before `createUser` (:6717). 400 keyed `fail(res, 400, 'domainNotAllowed', msg, { email })`.
- **DP-2 invite create** [VERIFIED: server.js:7745]: `for (const email of emails) if (!emailOk(email)) return fail(res, 400, 'invalidEmail', …, { email });` — add the domain refusal as the next statement in the same loop (D-03 per-email inline). Runs before `db.tx` → refused batch leaves zero side effects.
- **DP-3 invite accept** [VERIFIED: server.js:7868-7946]: chain is `sameOrigin → throttle → token lookup → used/expiry → HARD-02 admin-email → viewer-shape re-derive → allowInviteGuests fail-closed re-derive (block ends ~:7917) → readJson (:7921) → account resolution`. Insert the domain re-derive **immediately after the toggle block, before `readJson`**, validating `invite.email` when present (the row is the ticket; 403, non-consuming — the D-50-8 precedent lives in the very block above). For link-only invites (`invite.email` null), validate the body email right after `inviteForOtherEmail` [VERIFIED: server.js:7939], still before any write.
- **Boot logs (D-06)** [VERIFIED: server.js:8843]: config-summary `logInfo` lines exist here; add one per var with source (own / inherit / deny-all / off).

### Anti-Patterns to Avoid
- **`endsWith`/suffix/wildcard matching** — verified bypass: `'evilexample.com'.endsWith('example.com')` → `true` [VERIFIED: STACK.md Node 24 execution]. Exact `Set.has` only.
- **Checking before NFKC normalization** — homoglyph `＠` bypass class (GHSA-7rqj-j65f-68wh).
- **Multiple `split('@')` call sites** — grep gate: exactly ONE in the funnel.
- **Refusal message containing the allowed list** — policy oracle (D-04; OneTimeSecret precedent).
- **Consuming the invite on accept refusal** — must be non-consuming (D-07); loosening revives it.
- **New file/module for the validator** — every house funnel lives in server.js.
- **Snapshotting the list onto the invite row** — accept must read the live resolved list.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Localized refusals | Custom message plumbing | `fail(res, status, code, msg, extra)` + `err.<code>` catalogue keys | error-codes.test.mjs auto-extracts `fail()` codes and enforces EN+FR catalogue entries [VERIFIED: test/error-codes.test.mjs:1-29] |
| Per-server test boot | Importing server.js | `startServer({ env })` harness | server.js boots on load; harness supports unset-var simulation |
| IDN/punycode | Conversion pipeline | Reject non-ASCII domains; document punycode entries in DEPLOY.md | Explicitly deferred in REQUIREMENTS.md Future section |

## Common Pitfalls

### Pitfall 1: Raw parsing bypasses (homoglyph ＠, trailing dot, case, quoted local)
**What goes wrong:** check passes on raw string, delivery parser sees a different domain. **Why:** tests cover only lowercase ASCII. **Avoid:** NFKC-first funnel, one call site, adversarial table (`＠`, `corp.com.`, `CORP.COM`, `"a@b"@x.com`, `notcorp.com`, subdomain). **Warning signs:** any `endsWith` in the diff. [CITED: PITFALLS.md Pitfall 1, GHSA-7rqj-j65f-68wh]

### Pitfall 2: Conflating unset / empty / whitespace in env parse
**Why:** `process.env.X || DEFAULT` and falsy `""` merge the tri-states. **Avoid:** detect unset with `raw === undefined` (or `'X' in process.env`) BEFORE parsing; `' a , B '` → `['a','b']`; `'a,,b'` drops the empty with D-05 semantics. [CITED: STACK.md §1, PITFALLS.md Pitfall 2]

### Pitfall 3: Door-matrix drift (route checks env inline)
**Why:** intuition fills cells; inheritance is invisible in the var name. **Avoid:** every door calls the same funnel; contract tests enumerate the matrix as the suite's table of contents. [CITED: PITFALLS.md Pitfall 3]

### Pitfall 4: Accept-time TOCTOU
**Why:** invite is a long-lived token; list tightens between create and accept. **Avoid:** re-derive against the live resolved list at accept, before any write; tighten/loosen contract tests. [CITED: PITFALLS.md Pitfall 4]

### Pitfall 5: Catalogue key-count test breaks the build
**What goes wrong:** `test/i18n-core-features.test.mjs:216` mega-test pins the exact catalogue key count in its test name; adding keys without appending to that changelog name fails the suite. **Avoid:** follow the house pattern — append `+N err.<key>… phase 75 plan X` to the test name in the same commit. Also: `error-codes.test.mjs` requires the code be a static camelCase literal in `fail(res, N, 'code', …)` shape to be extracted. [VERIFIED: test/i18n-core-features.test.mjs:216, test/error-codes.test.mjs:18-21]

### Pitfall 6: MCP door forgotten
**What goes wrong:** `invite_member` (mcp.js:923) mints invites with its own inline regex, bypassing `ALLOW_INVITE_DOMAINS` — the restriction is silently porous. **Avoid:** wire the funnel into the tool run (refusal via `toolError`) or record an explicit deferral decision. [VERIFIED: mcp.js:923-970 this session]

## Code Examples

Verified test-harness pattern for the tri-state matrix (one spawned server per cell):

```javascript
// Source: test/helpers/server.mjs:43-61 (undefined-stripping lets a test
// simulate a genuinely UNSET var — the tri-state's null arm).
for (const [label, env, expect] of [
  ['unset',          { ALLOW_SIGNUP_DOMAINS: undefined }, 'open'],
  ['set-but-empty',  { ALLOW_SIGNUP_DOMAINS: '' },        'deny-all'],
  ['whitespace',     { ALLOW_SIGNUP_DOMAINS: ' ' },       'deny-all'],
  ['a,,b',           { ALLOW_SIGNUP_DOMAINS: 'a,,b' },    'only a'],
  [' a , B ',        { ALLOW_SIGNUP_DOMAINS: ' a , B ' }, 'a and b'],
]) {
  test(`signup tri-state: ${label}`, async () => {
    const s = await startServer({ env });
    // signup outside list → expect refusal code; inside → 201
  });
}
```

Canonical acceptance scenario to pin (SC3 / DOM-03): `ALLOW_INVITE_DOMAINS=gmail.com` with gmail NOT in the signup list → invited gmail user accepts, creates account, logs in; the same email can never self-register.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `split('@').pop()` / `endsWith` allowlists | NFKC-first canonicalize + exact Set | Auth.js GHSA fix; trailing-dot bypass write-ups | Phase must pin the adversarial table, not just happy path |
| Fail-open on malformed config | Tri-state unset/empty/populated with deny-all on set-but-empty | OneTimeSecret/GitLab prior art | D-01/D-02 already ratify the modern posture |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Refusal key names (`domainNotAllowed` family) follow the `err.<code>` catalogue convention and one code can serve signup/create/accept disambiguated by `{email}`/`{domain}` extra | Architecture Patterns | Wrong key shape → error-codes parity test fails; caught immediately by suite (LOW) |
| A2 | Boot-freeze (consts at :135 zone) is the recommended env-read posture; live-read also viable | Open Questions | Either works with the harness; purely a style/restart-contract choice (LOW) |
| A3 | Exact catalogue wording is at the agent's discretion; placeholder `{domain}`/`{email}` interpolation follows existing keys | User Constraints | Cosmetic; parity gate catches structural misses (LOW) |
| A4 | MCP `invite_member` gating can ride `toolError` refusal semantics analogous to `fail()` | Pitfall 6 | If the planner defers it, DOM-02 is porous via MCP — must be a recorded decision, not an omission |

## Open Questions

1. **MCP `invite_member` door — in Phase 75 or Phase 76?**
   - What we know: it mints invites bypassing any domain rule [VERIFIED: mcp.js:923-970]; the phase covers "three doors" but DOM-02 says "owner can restrict invite creation" without qualification.
   - Recommendation: include it in Phase 75 (~3 lines, same funnel, `toolError` refusal) — deferring it leaves a live bypass for the milestone's core guarantee. Needs an owner checkpoint if deferred.
2. **Boot-freeze vs live-read (planner's call per CONTEXT discretion).**
   - Recommendation: boot-freeze consts with `??` inheritance — matches `ALLOW_SIGNUP`/`SESSION_DAYS` posture (server.js:133-146), makes D-06's boot log natural, and the spawned-server harness makes every tri-state cell testable despite freezing.
3. **Whether the existing `i18n-core-features` count test or the build-chunk-size gate needs the 500 kB envelope re-checked when 5 catalogue keys land** — Pitfall 5; suite will surface it at execution.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all logic | ✓ | 24.x (engines `>=24`) | — |
| node:test | unit suite | ✓ | bundled | — |
| Playwright | (not needed this phase — JSON refusals assert at API level) | ✓ | existing config | skip |
| eslint | `npm run lint` gate | ✓ | ^10.15.0 | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (bundled, Node 24) + existing helpers/server.mjs harness |
| Config file | none needed — house pattern `test/*.test.mjs`, run via `node --test` |
| Quick run command | `node --test test/domain-admission.test.mjs` |
| Full suite command | `npm test` (all `test/*.test.mjs`, concurrency 2) [VERIFIED: package.json scripts] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOM-01 | Signup tri-state + refusal + fail-open unset | integration (harness, env matrix) | `node --test test/domain-admission.test.mjs` | ❌ Wave 0 |
| DOM-02 | Inheritance (unset→signup list; explicit stands alone; ''→deny-all) + MCP door | integration | same | ❌ Wave 0 |
| DOM-03 | gmail-only-invite-list scenario: accept OK, self-signup refused | integration | same | ❌ Wave 0 |
| DOM-04 | Tighten → accept refused, non-consuming; loosen → accepts | integration (reboot-same-DB harness pattern) | same | ❌ Wave 0 |
| DOM-07 | Adversarial canonicalization table (＠, trailing dot, case, quoted local, `notcorp.com`, subdomain, ` a , B `, `a,,b`) | table-driven unit/integration | same | ❌ Wave 0 |
| i18n | New keys in all 5 catalogues + placeholder parity + err-codes extraction | unit | `npm test` (error-codes + i18n-core-features + catalogue suites) | ✅ existing |

### Sampling Rate
- **Per task commit:** quick run + `npm run lint`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/domain-admission.test.mjs` — covers DOM-01..04, DOM-07 (created as first task; the funnel lands with its tests)
- [ ] No framework install needed — node:test + existing harness suffice

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | (signup/invite admission, not auth) |
| V4 Access Control | yes | Door-matrix funnel; admission ≠ authentication (never on login path) |
| V5 Input Validation | yes | Canonicalizing funnel after `emailOk`; NFKC; exact Set membership |
| V7 Errors/Logging | yes | Keyed generic refusals, no policy oracle; D-06 grep-able boot lines |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `endsWith`/suffix allowlist bypass | Elevation | Exact `Set.has` only |
| Homoglyph `＠` (GHSA-7rqj-j65f-68wh class) | Spoofing | NFKC before parse; reject residual non-ASCII domains |
| Trailing-dot FQDN origin confusion | Spoofing | Strip one trailing dot in canonicalizer |
| Policy oracle via refusal wording | Info Disclosure | D-04 generic copy; allowed list server-side only |
| Stale-invite admission (TOCTOU) | Elevation | Fail-closed live-list re-derive at accept, before any write |

## Sources

### Primary (HIGH confidence)
- Live code inspection this session: server.js:135, :671, :4657, :4708, :6703-6740, :7745, :7868-7946, :8843; mcp.js:923-970; test/helpers/server.mjs:43-61; test/error-codes.test.mjs:1-29; test/i18n-core-features.test.mjs:216; package.json scripts; src/locales/
- `.planning/research/{ARCHITECTURE,PITFALLS,STACK}.md` (2026-11-19, line-verified against same HEAD)

### Secondary (MEDIUM confidence)
- GHSA-7rqj-j65f-68wh (Auth.js homoglyph-@ bypass); PortSwigger "Splitting the email atom"; GitLab/Appsmith/Outline/OneTimeSecret domain-allowlist prior art — via milestone PITFALLS.md

### Tertiary (LOW confidence)
- None — all load-bearing claims verified or cited above.

## Metadata

**Confidence breakdown:**
- Integration points: HIGH — every line range read this session against live HEAD
- Semantics (tri-state, inheritance, fail-closed): HIGH — owner-validated seed + D-01..D-08 ratified in CONTEXT
- MCP door scope: HIGH on the fact, OPEN on the decision (planner/owner)

**Research date:** 2026-11-19
**Valid until:** 2026-12-19 (stable — single-file codebase, no dependency churn)
