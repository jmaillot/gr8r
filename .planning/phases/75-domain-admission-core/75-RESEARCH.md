# Phase 75: Domain Admission Core - Research

**Researched:** 2026-11-19 (FORCE REFRESH — supersedes prior 75-RESEARCH.md)
**Domain:** Env-gated email-domain admission for a single-file, zero-dependency Node 24 server (signup, invite create, invite accept doors)
**Confidence:** HIGH (all integration points and stdlib behaviors re-verified in this session by direct code read and node execution)

## Summary

Phase 75 adds instance-level email-domain admission via two comma-separated env vars — `ALLOW_SIGNUP_DOMAINS` and `ALLOW_INVITE_DOMAINS` — to three doors: self-serve signup (server.js:6703), invite create (server.js:7626, per-email loop :7745), and invite accept (server.js:7852). The whole feature is reachable with zero new dependencies: one tri-state boot resolver (~15 lines), one canonicalizing domain extractor (~8 lines), one funnel-shaped refusal function mirroring `validateGuestInviteShape` (server.js:4708), and `err.*` catalogue keys in all 5 locales. The milestone-level research (ARCHITECTURE/PITFALLS/STACK, committed df064787) remains the design source; this phase research verifies the integration points against live code **this session** and reconciles the locked D-01..D-08 decisions with that research.

Two tensions between the earlier research and the locked CONTEXT decisions are now settled and the planner must follow CONTEXT, not the older research:

1. **Boot-frozen vs live-read** — ARCHITECTURE.md recommended boot-time consts; STACK.md recommended re-reading at each gate. CONTEXT leaves it to the planner's discretion but notes live-read is recommended for testability. Both are workable; the deciding factor is that `test/helpers/server.mjs` spawns a fresh server process per test with its own env (startServer at test/helpers/server.mjs:43), so **boot-freeze is fully testable too** — but the accept-time fail-closed rule (DOM-04) reads most naturally as "the resolved list in force now," and a boot-frozen read is equivalent as long as the process model stays restart-driven. Either is honest; pick one and document it.
2. **Malformed-entry posture** — PITFALLS.md suggested "refuse-and-exit on syntactically broken values"; **D-05/D-06 override this: warn-and-clean** (lowercase, trim, drop empties, dedupe, boot warning, one structured summary line per var). A typo must not take down the instance.

**Primary recommendation:** One shared canonicalizing funnel in server.js (resolver + extractor + refusal fn, ~40 lines, placed beside `emailOk`), exact `Set` membership after NFKC→lowercase→trailing-dot-strip→last-`@` parse, tri-state env semantics (unset=off/inherit, set-empty=deny-all, populated=allowlist), wired to DP-1/DP-2/DP-3 with keyed `err.domainNotAllowed`-family refusals in all 5 catalogues in the same commit; adversarial table-driven `node:test` suite before any route wiring. MCP `invite_member` (mcp.js:923) is a confirmed fourth door cell and belongs in Wave 2 per the roadmap's existing 75-02 plan title.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `ALLOW_INVITE_DOMAINS=''` (explicitly set but empty) = **deny-all** for invites — not inherit.
- **D-02:** Same ruling for `ALLOW_SIGNUP_DOMAINS=''` = **deny-all for signup**. Symmetric tri-state: null (unset) = off/inherit, empty Set = deny-all, populated Set = allowlist.
- **D-03:** Multi-email invites are refused **per-email inline**: refused emails get their own keyed error next to the field; valid emails proceed. Mirrors the existing `emailOk` per-email loop at server.js:~7745.
- **D-04:** The refusal message is **generic** — "the email is outside the domains allowed for invites" — and never reveals the allowed-domain list (no oracle for probing the admission policy).
- **D-05:** Malformed entries are **warn-and-clean**, not fail-fast: lowercase, trim, drop empty/whitespace entries with a boot warning, dedupe.
- **D-06:** Boot logs **one structured summary line per var**: name, resolved domains, source (own / inherit / deny-all / off). Grep-able, matching the OIDC env-gate boot log pattern. (Full door-matrix log is Phase 76 SC4.)
- **D-07:** A pending invitee hitting a tightened list sees a **generic, keyed refusal** ("this invite can no longer be accepted" family) — no domain details; the refusal is **non-consuming** (invite row not destroyed; loosening revives it).
- **D-08:** The inviter is **not notified** when a pending invite is refused at accept.

Design context (OWNER-VALIDATED in SEED-261119-f3w, not re-litigated): door matrix, unset-inherits-signup, fail-closed accept-time re-validation, existing-account immunity, exact `Set` matching.

### the agent's Discretion
- Exact catalogue wording for the new refusal keys (EN first, translated in same commit)
- Internal shape of the validator/resolver functions (pure, funnel-shaped, unit-testable)
- Whether `process.env` is read live or boot-frozen at the door call-sites (research: live-read recommended for testability — planner's call)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (OIDC/SSO doors, immunity contract tests and boot door-matrix log are Phase 76; DOM-05/06 are Phase 76.)

## Project Constraints (from AGENTS.md)

No project AGENTS.md or project skills directory exists (verified this session). The global user AGENTS.md rules apply: max 2 attempts on a failing tool then escalate; verify before inventing any API/signature/path; every verification command cited with its result; update project docs at phase end (DEPLOY.md env table belongs in this phase's tasks per the roadmap plan title).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOM-01 | Restrict signup via `ALLOW_SIGNUP_DOMAINS` (comma-separated; unset = all allowed, fail-open) | DP-1 signup door at server.js:6703; tri-state resolver; gate after structural checks, before `createUser` (:6721) |
| DOM-02 | `ALLOW_INVITE_DOMAINS` for invites; unset inherits signup, set stands alone | `??` inheritance at resolver; unset detection must be `'X' in process.env` (verified: parser cannot distinguish unset from `''`) |
| DOM-03 | Invite-list-only domain accepts invite, creates account, logs in; accept never consults signup list | DP-3 accept re-derive uses `INVITE_DOMAINS` only; validated against the invite ROW's email, body email only for link-only invites |
| DOM-04 | Pending invites re-validated fail-closed at accept; keyed localized refusal, all 5 catalogues | Accept route fail-closed block pattern at server.js:7901-7915 (`inviteGuestToggleOff` re-derive is the exact precedent); refusal before any write (:7954); non-consuming per D-07 |
| DOM-07 | Exact, canonicalized matching: case-insensitive, trailing dot stripped, NFKC, exact Set membership, never `endsWith`, no subdomain wildcards, boot summary logs | All stdlib behaviors re-verified this session (see Code Examples); single `split('@')`/`lastIndexOf('@')` call-site discipline |
</phase_requirements>
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Env parsing / tri-state resolution / inheritance | Server boot (module scope) | — | Env-declared state, immutable per process; matches `ALLOW_SIGNUP` const posture (server.js:135) |
| Canonicalization + exact-match validator | Server (single-file helper zone beside `emailOk` :671) | — | One shared funnel; every comparable policy funnel (`validateGuestInviteShape` :4708) lives in server.js — no new file |
| DP-1 signup gate | Server route (server.js:6703-6741) | Client i18n render | Policy refusal after structural checks, before `createUser` |
| DP-2 invite create gate (per-email) | Server route (server.js:7745 loop, before `db.tx` :7763) | Client inline field error | D-03 per-email keyed refusal |
| DP-3 accept re-validation (fail-closed) | Server route (server.js:7901-7948 insertion zone) | — | Must run after guest-toggle re-derive, before ANY write (:7954+) |
| MCP invite_member door | mcp.js tool (mcp.js:923-956) | — | Verified MCP invite surface exists — rides the same shared validator |
| Refusal translation | Client i18n (`tErr`, src/core/i18n.js:243-247) | Server English fallback message | `err.<code>` catalogue keys; unknown code → raw server message (D-03 of v1.2) |
| Operator docs | DEPLOY.md env table | — | Docs update required at phase end |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.21.0 (engines `>=24`) [VERIFIED: `node --version` this session] | Runtime for all logic | Everything needed is stdlib |
| `String.prototype` (split/trim/toLowerCase/normalize/slice) | ES2023 | Env parse, email canonicalization | Zero-deps standing constraint; behaviors re-verified on Node 24.21.0 this session |
| `node:test` | stdlib | Tri-state env matrix + adversarial domain table tests | Established repo pattern (`import { test } from 'node:test'`) |
| `test/helpers/server.mjs` | existing | Spawned per-test servers with custom env (`startServer({ env })`, test/helpers/server.mjs:43) | How every hardening contract test boots the feature under specific env |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `scripts/i18n-scan.mjs` + build gate | existing | Locale parity enforcement | New `err.*` keys in all 5 catalogues same commit |
| Playwright e2e | existing | Boot summary log grep / refusal-path smoke | Optional; unit suite covers the contract |

**No new packages. Package Legitimacy Audit: n/a — zero external installs (standing constraint, verified: no package additions in any recommendation).**

## Architecture Patterns

### System Architecture Diagram

```
env: ALLOW_SIGNUP_DOMAINS / ALLOW_INVITE_DOMAINS
        │
        ▼
[Boot resolver]  tri-state: unset→null / ''→empty Set / list→canonical Set
        │ inherit: INVITE = parse(own) ?? SIGNUP
        │ D-05 warn-and-clean; D-06 one summary line per var
        ▼
[Shared funnel] emailDomainRefusal(email, list)
   NFKC → lowercase → strip 1 trailing '.' → lastIndexOf('@') → Set.has()
        │  returns null (allow) or {code, message}
        ▼
   ┌────┴─────────────┬──────────────────────┬─────────────────────┐
   ▼                  ▼                      ▼                     ▼
DP-1 signup       DP-2 invite create     DP-3 invite accept     MCP invite_member
server.js:6703    server.js:7745 loop    server.js:7852         mcp.js:923
after structural  per-email, BEFORE      fail-closed, AFTER     before mint
checks, BEFORE    db.tx (:7763)          guest-toggle re-derive,
createUser        (zero side effects)    BEFORE any write (:7954)
        │                  │                      │
        ▼                  ▼                      ▼
   fail(res, code, msg, extra)  →  client tErr(`err.<code>`) → localized refusal
```

### Pattern 1: Tri-state boot resolver (D-01/D-02/D-05/D-06)

**What:** Parse each var into `null` (unset) / empty Set (deny-all) / populated Set (allowlist). Unset detection MUST precede the parser — verified: `(raw ?? '').split(',')` cannot distinguish `undefined` from `''`.

```javascript
// Source: STACK.md idioms, re-verified by execution on Node 24.21.0 this session
const parseDomainList = (name) => {
  const raw = process.env[name];
  if (raw === undefined) return null;                       // unset → off / inherit
  const set = new Set(
    String(raw).split(',')
      .map(s => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
  );
  return set;
};
const SIGNUP_DOMAINS = parseDomainList('ALLOW_SIGNUP_DOMAINS');
const INVITE_DOMAINS = parseDomainList('ALLOW_INVITE_DOMAINS') ?? SIGNUP_DOMAINS; // inheritance, one line
// D-06: one logInfo per var — name, resolved domains, source (own/inherit/deny-all/off)
```

### Pattern 2: Canonicalizing domain extractor + exact-match funnel

```javascript
// Source: PITFALLS.md Pitfall 1 recipe; every step verified on Node 24.21.0 this session
const emailDomain = (email) => {
  const s = String(email).trim().normalize('NFKC').toLowerCase();
  const at = s.lastIndexOf('@');
  const dom = at > 0 ? s.slice(at + 1) : '';
  return dom.replace(/\.$/, '');                            // strip ONE trailing FQDN dot
};
const emailDomainRefusal = (email, list) => {
  if (!list) return null;                                   // fail-absent: unset → off
  if (list.has(emailDomain(email))) return null;
  return { code: 'domainNotAllowed', message: '...' };      // D-04: generic, never lists domains
};
```

Verified this session (paste of outputs): `parse(' a.com , b.com,, C.COM ')` → `["a.com","b.com","c.com"]`; `''` → `[]`; `'ALLOW_INVITE_DOMAINS' in process.env` → `false` unset vs `true` set-empty; `'evilexample.com'.endsWith('example.com')` → `true` (bypass confirmed); `'user＠corp.com'.normalize('NFKC')` → `'user@corp.com'`; `'corp.com.'.replace(/\.$/,'')` → `'corp.com'`.

### Pattern 3: The funnel contract (mirror `validateGuestInviteShape`)

**What:** Return `null` when allowed, `{code, message}` when refused — the exact contract of `validateGuestInviteShape` (server.js:4708), consumed via `fail(res, status, shape.code, shape.message, extra)`. One shared validator for all four doors; exactly ONE `lastIndexOf('@')` canonicalization call-site in the codebase (grep-able invariant: only `emailOk`'s regex and the funnel touch email structure).

### Pattern 4: Keyed localized refusal (existing machinery, no new mechanism)

`fail(res, status, code, message, extra)` (server.js:4657-4659, verified) emits `{error, code, ...extra}`. Client translates via `tErr(code)` → lookup `err.<code>` in the locale catalogue, falling back to the raw English message for unknown codes (src/core/i18n.js:243-247, verified). New keys MUST be added to all 5 catalogues (`src/locales/{en,fr,nl,de,es}.json`) in the same commit — verified: each catalogue carries 177 `err.*` keys in lockstep (including `err.inviteGuestToggleOff`); fr's total (1985 vs 1946) differs only by non-`err.*` FR-specific keys, so `err.*` parity is the real gate.

### Pattern 5: Fail-closed accept re-derive (the D-50-8 precedent)

The VIS-04 block (server.js:7901-7915) is the template: re-derive the policy from the CURRENT state, refuse 403 before `readJson`/account resolution/any write, consume nothing. The domain re-derive slots immediately after it (before :7917 `readJson` for a row-email invite; for link-only invites, in the account-creation branch after `emailOk(email)` + `inviteForOtherEmail` checks at :7938-7939, before `createUser` :7944). Validate the invite ROW's stored email (`invite.email`, set at mint :7777) — the row is the door ticket.

### Recommended Project Structure

No new files. All changes land in: `server.js` (resolver + funnel + 3 gates + boot logs), `mcp.js` (1 gate in `invite_member`), `src/locales/*.json` ×5 (`err.*` keys), `test/` (new domain-admission contract suite), `DEPLOY.md` (env docs). The single-file posture is intentional — a new `domain-rules.js` would be the first standalone policy module for zero gain.

### Anti-Patterns to Avoid

- **`endsWith` / suffix / wildcard matching:** verified bypass (`evilexample.com` passes `example.com`). Exact `Set.has()` only. Subdomains NOT implicitly admitted (seed ruling).
- **Checking the body email at accept instead of the invite row's email** — the row is the ticket; body is untrusted (HARD-04 discipline).
- **`process.env.X || DEFAULT` falsy parsing** — conflates unset and `''`; must use `'X' in process.env` pre-parse (verified distinction).
- **Revealing the allowed list in a refusal message** (D-04) — no oracle; generic wording only. OIDC-side this extends to no domain-specific query params (Phase 76 concern, but keep the precedent).
- **Snapshotting the list onto the invite row** — accept must read the resolved list in force NOW (DOM-04 fail-closed).
- **Gating login/authenticated surfaces** — admission ≠ authentication; the domain check must be unreachable from session/membership-lookup paths (existing-account immunity is DOM-05/76, but DP-1..3 must be structured so it stays free).
- **Fail-fast on malformed env entries** — D-05 overrides the older research: warn-and-clean.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email → domain | Custom regex parser | `lastIndexOf('@')` after NFKC+lowercase, run AFTER `emailOk` | RFC quirks (quoted locals) are unreachable — `emailOk` (:671) rejects them upstream; extraction composes after structural validation |
| Keyed localized refusal | New i18n mechanism | `fail()` + `err.*` catalogue keys + `tErr` | Entire pipeline exists and is parity-gated |
| Env tri-state | `||`/`?.` fallback chains | Explicit `'X' in process.env` + parser returning null/Set | Falsy chains conflate the three states |
| Fail-closed re-derive | New route guard framework | Copy the VIS-04 block (:7901-7915) | Proven pattern, non-consuming, side-effect-free |
| IDN/punycode | Conversion pipeline | Reject non-ASCII domains (fail closed); document punycode form in DEPLOY.md | Milestone-level decision; `domainToASCII` exists if ever needed |

**Key insight:** The feature is ~40 lines + catalogue keys + tests. Every mechanism it needs (funnel contract, keyed refusals, fail-closed re-derive, per-test server harness) already exists in the repo — the work is wiring and adversarial verification, not construction.

## Common Pitfalls

### Pitfall 1: Parsing bypass class (homoglyph ＠, trailing dot, case, quoted local)
**What goes wrong:** Admission decided on a non-canonical string (GHSA-7rqj-j65f-68wh class — Auth.js validated before NFKC normalization). **Avoid:** NFKC → lowercase → strip one trailing `.` → `lastIndexOf('@')`, always after `emailOk`. **Warning signs:** >1 `split('@')` call-site; tests only lowercase ASCII. Verified this session: NFKC converts fullwidth ＠ → `@`.

### Pitfall 2: Fail-open unset-vs-empty conflation
**What goes wrong:** `ALLOW_SIGNUP_DOMAINS=""` in docker-compose silently means open-to-all. **Avoid:** tri-state resolver; `'X' in process.env` before parse; env-shape test matrix (`undefined`, `''`, `' '`, `'a,b'`, `'a,,b'`, `' a , B '`). **Warning signs:** `||` on the env var anywhere.

### Pitfall 3: Door-matrix confusion (inherit direction)
**What goes wrong:** Admin sets only the invite list expecting signup restricted, or vice versa (Gitea #27457 analog). **Avoid:** the resolver is the ONLY reader of the two env vars; D-06 summary log lines; contract tests assert both inherit directions. **Warning signs:** any route touching `process.env.ALLOW_*_DOMAINS` directly.

### Pitfall 4: TOCTOU between mint and accept
**What goes wrong:** Invite minted under a wider list accepted after tightening. **Avoid:** DP-3 re-derive against the resolved list in force at accept, before any write, non-consuming (D-07). Contract test: mint under list A → tighten to B → accept refused, row intact → loosen → accept succeeds. **Warning signs:** a stored `domains` column or snapshot read at accept.

### Pitfall 5: Existing-flow lockout via accidental login-path gating
**What goes wrong:** Domain check reachable from authentication/session code blocks existing members (DOM-05 regression). **Avoid:** predicate called only at the four door sites; immunity is structural. Note: an existing member being *re-invited* to the same workspace is already refused earlier by `alreadyMember` (:7768-7770) — out-of-scope for the domain gate by construction. **Warning signs:** the funnel imported anywhere except the door sites.

### Pitfall 6: Locale key drop / placeholder mismatch
**What goes wrong:** `err.domainNotAllowed` present in EN only → silent English fallback everywhere; or `{domain}` dropped in nl/de → broken render the parity gate can't see. **Avoid:** all 5 catalogues same commit (parity gate enforces count); a mechanical unit test asserting every EN placeholder appears in each translation; unknown-code → English fallback pinned (never an empty toast). **Warning signs:** `err.*` key-count divergence across catalogues in the diff.

## Code Examples

### DP-1 signup gate insertion (server.js:6715-6718 zone)

```javascript
// Source: live read of server.js:6703-6724 this session
// After nameRequired/passwordTooWeak checks, BEFORE createUser (:6721):
const domRefusal = emailDomainRefusal(email, SIGNUP_DOMAINS);
if (domRefusal) return fail(res, 400, domRefusal.code, domRefusal.message, { email });
```

Note: signup lowercases email at :6710-6712 already; the funnel is idempotent over that.

### DP-2 per-email inline refusal (server.js:7745 — extend the existing loop)

```javascript
// Source: live read of server.js:7732-7745 this session. The loop already does
// trim/lowercase/dedupe (:7733-7743) and emailOk (:7745). D-03: refused email
// gets its own keyed error; valid emails proceed. Placement: after emailOk in
// the loop, BEFORE the ROLE_RANK admin check (:7751) and db.tx (:7763) — zero
// side effects on refusal.
for (const email of emails) if (!emailOk(email)) return fail(res, 400, 'invalidEmail', `Invalid email: ${email}`, { email });
for (const email of emails) {
  const domRefusal = emailDomainRefusal(email, INVITE_DOMAINS);
  if (domRefusal) return fail(res, 400, domRefusal.code, domRefusal.message, { email });
}
```

(The planner may fuse these into one loop — order emailOk first either way.)

### DP-3 fail-closed accept re-derive (after server.js:7915)

```javascript
// Source: live read of server.js:7880-7948 this session. Slot AFTER the
// guest-toggle re-derive block (:7901-7915), BEFORE readJson (:7917).
// Row-email invites: validate invite.email. 403, non-consuming (D-07).
{
  const doorEmail = invite.email; // link-only invites: re-check in the :7938-7939 branch instead
  if (doorEmail) {
    const domRefusal = emailDomainRefusal(doorEmail, INVITE_DOMAINS);
    if (domRefusal) return fail(res, 403, 'inviteNotAcceptable', 'This invite can no longer be accepted');
  }
}
```

For link-only invites (`invite.email` null), check the body `email` in the account-creation branch immediately after the `inviteForOtherEmail` check (:7939), before `createUser` (:7944).

### Boot summary log (D-06)

```javascript
// Mirrors the grep-able boot line convention (server.js:8843 logs `sign-ups: open|closed`)
logInfo(`domain admission: signup ${describeDomains(SIGNUP_DOMAINS)} · invites ${describeDomains(INVITE_DOMAINS)}`);
// describeDomains: null → 'off', empty → 'deny-all', else 'allowed: a.com, b.com'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `endsWith` domain suffix match | Exact `Set` membership | Verified bypass published (`evilexample.com`) | Never suffix-match |
| Validate-then-normalize email | NFKC-normalize FIRST, validate/parse after | GHSA-7rqj-j65f-68wh (Auth.js) | Normalization precedes every structural check on the door path |
| Single-state env config (set/unset) | Tri-state (unset/empty/populated) | OneTimeSecret & GitLab prior art | Operators can close a door deliberately with `''` |

**Deferred (milestone-level, do not build):** `*.domain` wildcards, refusal audit verb, IDNA/punycode pipeline (document punycode form in DEPLOY.md instead).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Signup route has no `emailOk` call today (email structural check happens inside/after `createUser`); planner should confirm whether `emailOk` should be added alongside the domain gate or the funnel alone suffices | DP-1 example | Low — funnel is tolerant of unvalidated input (returns '' domain, which never matches a populated Set, failing closed) |
| A2 | Boot-freeze vs live-read both satisfy DOM-04; equivalence holds only while env changes require restart (the established gr8r operator contract) | Summary #1 | Low — either choice tested via per-test spawned servers |
| A3 | Client signup/invite UIs surface `fail()` `code` + `extra` payloads such that per-email inline errors are renderable with existing components (D-03) — assumed from `invalidEmail` precedent at :7745 carrying `{ email }` | DP-2 | Medium if client needs a new inline-error component; the `inviteGuestToggleOff`/`invalidEmail` rendering paths are the analogs to inspect during planning |

All other claims are `[VERIFIED: live read / execution this session]` with file:line citations inline, or `[CITED: .planning/research/{ARCHITECTURE,PITFALLS,STACK}.md]` from the committed milestone research (itself line-verified and node-execution-verified).

## Open Questions

1. **DP-1 emailOk gap** (A1): signup currently has no explicit `emailOk` before `createUser` — decide whether the domain gate composes after an added `emailOk` or runs alone.
2. **Boot-freeze vs live-read** (A2): planner's discretion per CONTEXT; document the choice in the plan and DEPLOY.md.
3. **Refusal key naming:** one code (`domainNotAllowed`) for all doors vs separate `inviteNotAcceptable` for DP-3. CONTEXT D-07 says "this invite can no longer be accepted" family — distinct wording for accept suggests a second key; both must land in all 5 catalogues.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | 24.21.0 | — |
| `node:test` + `test/helpers/server.mjs` | contract suite | ✓ | existing | — |
| Playwright | optional e2e smoke | ✓ (existing config) | — | unit suite alone suffices |
| `node --test --test-concurrency=2 test/*.test.mjs` | full suite | ✓ | — | — |

**Missing dependencies:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (stdlib), per-test spawned real servers via `test/helpers/server.mjs` (`startServer({ env })` — custom env per process) |
| Config file | none needed — `npm test` globs `test/*.test.mjs` |
| Quick run command | `node --test test/domain-admission.test.mjs` |
| Full suite command | `npm test` (plus `npm run e2e` for UI paths) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOM-01 | Signup gate: out-of-list refused keyed+localized; in-list passes; unset = byte-identical old behavior | contract (spawned server) | `node --test test/domain-admission.test.mjs` | ❌ Wave 0 |
| DOM-02 | Invite create per-email refusal; unset inherits signup; set-empty deny-all; set stands alone | contract | same file | ❌ Wave 0 |
| DOM-03 | Invite-list-only domain accepts, creates account, logs in; accept never consults signup list | contract (canonical gmail scenario from CONTEXT) | same file | ❌ Wave 0 |
| DOM-04 | Tighten → pending invite refused at accept, non-consuming, 403, all-5-locale key parity; loosen revives | contract | same file | ❌ Wave 0 |
| DOM-07 | Tri-state env matrix (`undefined`/`''`/`' '`/`'a,b'`/`'a,,b'`/`' a , B '`); homoglyph ＠; trailing dot; case; suffix (`evil-a.com`); subdomain not admitted; one canonicalization call-site; boot summary log lines | unit table-driven + contract | same file | ❌ Wave 0 |
| i18n | `err.*` keys present in en/fr/nl/de/es; placeholder parity; unknown-code → English fallback | unit | same file (catalogue assertion like `test/catalogue.test.mjs`) | ❌ Wave 0 |
| MCP | `invite_member` door refuses out-of-list email (roadmap 75-02) | contract | same file | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run of the new test file + `npm run i18n:scan` (locale parity gate)
- **Per wave merge:** full `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/domain-admission.test.mjs` — covers all rows above (fixture boot via `startServer({ env: { ALLOW_SIGNUP_DOMAINS: ... } })`)
- [ ] Boot-summary-log assertion (D-06) — spawn with vars set, grep stderr/log output

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | Door-matrix funnel; admission only at doors, never auth path |
| V5 Input Validation | yes | `emailOk` upstream + NFKC-canonicalizing funnel; exact Set membership |
| V6 Cryptography | no | untouched |
| V2/V3 Auth/Session | no | untouched; immunity contract keeps them outside the gate |
| Information disclosure (D-04) | yes | Generic refusal wording; allowed list never leaves server; no oracle |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Homoglyph-＠ / trailing-dot / case canonicalization bypass (GHSA-7rqj-j65f-68wh class) | Elevation of Privilege | NFKC → lowercase → dot-strip → last-`@`, before any comparison; adversarial table test |
| Suffix attack `evil-a.com` vs `a.com` | Elevation of Privilege | Exact `Set.has()`; `endsWith` verified bypassable |
| Policy oracle via refusal wording | Information Disclosure | D-04 generic messages; distinct keys, no domain details |
| Stale-invite admission after tightening (TOCTOU) | Tampering | DP-3 fail-closed re-derive vs live resolved list, before writes |

## Sources

### Primary (HIGH confidence — verified this session)
- Live reads: server.js:135, :4657-4659, :4708, :671, :6703-6741, :7626 route, :7732-7819 (create loop + tx), :7841-8004 (accept route), mcp.js:923-956; `src/core/i18n.js:235-247`; `test/helpers/server.mjs:43`; locale files (`err.*` count 177 ×5)
- Live execution on Node 24.21.0: parser matrix, unset-vs-empty `'in process.env'` distinction, `endsWith` bypass, NFKC ＠→@, trailing-dot strip
- `.planning/research/{ARCHITECTURE,PITFALLS,STACK}.md`, `SEED-261119-f3w`, `.planning/ROADMAP.md` §Phase 75, `75-CONTEXT.md`

### Secondary (MEDIUM)
- Prior art cited in PITFALLS.md: GitLab sign-up restrictions + MR 76272, Gitea `EMAIL_DOMAIN_ALLOWLIST` + #27457, OneTimeSecret SSO allowlist posture, Outline `ALLOWED_DOMAINS`

### Tertiary (LOW)
- None material.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero deps, all stdlib behaviors executed this session
- Architecture: HIGH — all integration points read this session with line citations
- Pitfalls: HIGH — CVE/GHSA-backed class + in-repo precedent blocks verified

**Research date:** 2026-11-19
**Valid until:** 2026-12-19 (stable; single-file server, slow-moving integration points)
