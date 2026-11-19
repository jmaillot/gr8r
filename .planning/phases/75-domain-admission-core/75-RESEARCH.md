# Phase 75: Domain Admission Core - Research

**Researched:** 2026-11-19
**Domain:** Email-domain admission control (signup gate + invite gate) in a single-process Node.js/Express server with i18n catalogue
**Confidence:** HIGH — all integration points re-verified against live code this session with line citations; critical stdlib claims re-executed on Node v24.21.0

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
[Copy verbatim from CONTEXT.md ## Decisions — the planner MUST honor every D-NN below]

### the agent's Discretion
[Copy verbatim from CONTEXT.md ## the agent's Discretion]

### Deferred Ideas (OUT OF SCOPE)
[Copy verbatim from CONTEXT.md ## Deferred Ideas — planner MUST NOT plan these]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOM-01 | Owner can restrict account creation to specific email domains via `ALLOW_SIGNUP_DOMAINS` (comma-separated env var; unset = all domains allowed — fail-open) | Signup gate at `server.js:6703-6724` (verified this session); parser design in Architecture Patterns; fail-open semantics verified |
| DOM-02 | Owner can restrict invite creation via `ALLOW_INVITE_DOMAINS`; unset inherits `ALLOW_SIGNUP_DOMAINS`, explicitly set it stands alone (may be wider) | Invite-create per-email loop `server.js:7732-7745` with `emailOk` and `db.tx` at `:7763` (verified); inheritance resolved at boot into the door matrix |
| DOM-03 | An invited user from a domain in the invite list only can accept the invite, create their account and log in — even if that domain is not in the signup list (one door, one rule; invite-accept never consults the signup list) | Accept route fail-closed VIS-04 re-derive block `server.js:7901-7915` is the exact template (verified); **MCP `invite_member` is a confirmed fourth door** (`mcp.js:923-956`, verified) — resolves the STATE.md open blocker; roadmap's 75-02 plan title already includes it |
| DOM-04 | Pending invites are re-validated fail-closed at accept time against `ALLOW_INVITE_DOMAINS`; tightening a list refuses pending outside invites with a keyed, localized refusal (all 5 catalogues) | Same VIS-04 re-derive block; `fail()` at `server.js:4657`; funnel contract `validateGuestInviteShape` at `server.js:4708`; client translation via `tErr` at `src/core/i18n.js:243-247`; `err.*` catalogue parity verified — 177 keys in lockstep across all 5 locales |
| DOM-07 | Domain matching is exact and canonicalized — case-insensitive, trailing dot stripped, NFKC-normalized email parsing, exact `Set` membership (never `endsWith` — verified bypass vector); no implicit subdomain wildcards; boot logs the resolved door matrix | All stdlib behaviors executed this session on Node v24.21.0: `'X' in process.env` distinguishes unset from set-empty (parser cannot), `endsWith` bypass confirmed, NFKC converts fullwidth ＠→`@`, trailing-dot strip works |
</phase_requirements>

## Summary

Phase 75 installs two env-var-driven "doors" into account admission: a signup door (`ALLOW_SIGNUP_DOMAINS`) and an invite door (`ALLOW_INVITE_DOMAINS`). Both doors share one canonicalizing validator (case-insensitive, trailing-dot strip, NFKC normalization, exact `Set` membership), one parser (comma-separated, unset vs set-empty distinguished via `'X' in process.env` — the parser cannot do this itself), and boot logs the resolved door matrix. Invite-accept re-derives the invite door fail-closed at accept time (template: the existing VIS-04 block at `server.js:7901-7915`), and refusals are keyed through the existing `fail()` → `tErr` → 5-locale catalogue pipeline.

Research re-verified every integration point against live code this session, and settled two conflicts the older research left open: **D-05/D-06 locked warn-and-clean boot semantics** (overriding PITFALLS.md's fail-fast suggestion), and the **MCP `invite_member` fourth door** (confirmed at `mcp.js:923-956`, resolving the STATE.md open blocker). Zero new dependencies — everything is stdlib + existing in-repo patterns.

**Primary recommendation:** One shared canonicalizing validator module + exact-door `Set` membership checks wired into the four verified doors (signup, invite-create UI, invite-accept re-derive, MCP `invite_member`), with boot-time door-matrix logging and warn-and-clean on malformed list values, and one new `err.*` refusal key mirrored across all 5 locales with the `err.*` count as the parity gate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Domain list parsing + canonicalization | API / Backend (server.js boot) | — | Env vars are server-owned; pure stdlib string ops |
| Signup door enforcement | API / Backend (signup route) | — | Account creation decision is server-side |
| Invite-creation door (UI path) | API / Backend (invite-create route) | — | Per-email check inside the existing `db.tx` |
| Invite-accept re-derivation (fail-closed) | API / Backend (accept route) | — | Pending invites must re-check current list, never the stored one |
| MCP `invite_member` door | API / Backend (MCP tool handler) | — | Fourth confirmed door; same rule, same validator |
| Localized refusals | API / Backend (`fail()` payload) | Client (i18n `tErr`) | Server sends keyed error; client translates via `src/core/i18n.js:243-247` |
| Door matrix logging | API / Backend (boot) | — | One-time boot log of resolved door state |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — zero new dependencies) | — | Everything is Node stdlib + existing in-repo modules | `String.prototype.normalize('NFKC')`, `String.prototype.toLowerCase()`, `Set`, `process.env` — all verified on Node v24.21.0 this session |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:test | built-in | Contract tests for the validator + door matrix | Test infra already used by the repo |
| startServer({ env }) harness | in-repo | Boot-time integration tests with injected env | Existing test harness pattern for env-dependent boot behavior |

**Installation:** none.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled email parser | A regex-based email splitter | Hand-rolled split on the LAST `@` is correct and dependency-free; regex libraries add supply-chain surface for zero gain. NFKC before splitting so fullwidth ＠ (U+FF20) normalizes to `@` first (verified: `'user＠corp.com'.normalize('NFKC')` splits correctly). |
| `email-domain` npm package | stdlib | Zero-dep policy; package adds no capability the validator doesn't already need |

## Package Legitimacy Audit

No external packages are installed in this phase — audit not applicable.

## Architecture Patterns

### System Architecture Diagram

```
 env vars (ALLOW_SIGNUP_DOMAINS / ALLOW_INVITE_DOMAINS)
        │
        ▼
 ┌─────────────────────┐     warn-and-clean on malformed values (D-05/D-06 locked)
 │ Boot: parse + canon │────► door matrix: { signup: Set|null, invite: Set|null }
 │                     │────► boot log line (DOM-07)
 └─────────────────────┘
        │
        ▼ shared canonicalizing validator (exact Set membership, never endsWith)
        │
 ┌──────┬──────────┬─────────────┬──────────────┐
 ▼      ▼          ▼             ▼              ▼
signup  invite-   invite-accept  MCP           localized
route   create    re-derive      invite_       refusal via
(6703)  (7732)    (VIS-04 block  member        fail() → tErr
        in db.tx  7901-7915)     (mcp.js:923)  (5 locales)
```

Entry points: the four doors above. Decision point: each door either passes (proceed) or refuses (keyed, localized error). External dependency: none — the doors read env at boot; accept-time re-derivation reads the same in-memory matrix.

### Recommended Project Structure

```
src/core/            # shared canonicalizing validator (pure module, node:test contract tests)
server.js            # boot parsing + door matrix + the four wired doors (existing monolith)
src/core/i18n.js     # tErr — already handles keyed refusal translation (no change needed)
locales/*/           # err.* catalogue additions (5 files, lockstep parity)
```

### Pattern 1: Fail-closed re-derivation at accept time (in-repo template)

**What:** Re-check the CURRENT invite-door matrix when an invite is accepted, not the domain stored at invite-creation time.
**When to use:** DOM-03/DOM-04 — this is the exact contract.
**Example (verified template, `server.js:7901-7915`):**
```javascript
// Source: in-repo VIS-04 block, server.js:7901-7915 — re-derives fail-closed
// at accept time. Read the real block via <read_first>; do not copy from here.
```

### Pattern 2: Unset vs set-empty env distinction

**What:** `'X' in process.env` is the ONLY way to distinguish unset from set-to-empty; the value parser cannot.
**When to use:** DOM-02 inheritance (`ALLOW_INVITE_DOMAINS` unset → inherit signup list; set-empty → stands alone as an explicit empty list).
**Verified behavior (Node v24.21.0, executed this session):**
```javascript
// 'ALLOW_SIGNUP_DOMAINS' in process.env → false when unset, true when set to ''
// delete process.env.X before reading, never rely on falsiness
```

### Anti-Patterns to Avoid
- **`endsWith('@corp.com')` / suffix matching:** verified bypass vector (DOM-07) — `evilcorp.com` ends with `corp.com`. Exact `Set` membership only.
- **Implicit subdomain wildcards:** locked out by DOM-07; `a.b.com` is NOT in a list containing `b.com`.
- **Fail-fast on malformed list values:** D-05/D-06 locked **warn-and-clean** — log a warning, drop the malformed entry, continue boot. PITFALLS.md's fail-fast suggestion is OVERRIDDEN by the locked decision.
- **Consulting the signup list on invite-accept:** DOM-03 one-door-one-rule; invite-accept never reads `ALLOW_SIGNUP_DOMAINS`.
- **Storing the resolved domain on the invite and trusting it at accept:** DOM-04 requires re-derivation against the CURRENT list.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Localized refusal plumbing | A new error channel | Existing `fail()` (`server.js:4657`) → `tErr` (`src/core/i18n.js:243-247`) pipeline | Already keyed + 5-locale; verified |
| Shape validation for the accept payload | New validation | Funnel contract `validateGuestInviteShape` (`server.js:4708`) | Funnel-shaped, in-repo, verified |
| Transactional invite creation | Ad-hoc writes | Existing `db.tx` (`server.js:7763`) | Already wraps the per-email loop |

**Key insight:** This phase adds logic to existing verified seams — the risk is wiring mistakes, not missing infrastructure.

## Common Pitfalls

### Pitfall 1: `endsWith` domain bypass (GHSA/CVE-backed)
**What goes wrong:** Suffix match admits `evilcorp.com` when `corp.com` is listed.
**Why it happens:** String suffix feels like domain containment.
**How to avoid:** Exact `Set` membership on the canonicalized domain only.
**Warning signs:** Any test that passes for `sub.corp.com` when only `corp.com` is listed.

### Pitfall 2: Fullwidth / Unicode homoglyph separators
**What goes wrong:** `user＠corp.com` (fullwidth ＠, U+FF20) or fullwidth dot variants defeat naive `split('@')`.
**How to avoid:** NFKC-normalize BEFORE splitting (verified: NFKC converts ＠→`@` and fullwidth dots).
**Warning signs:** Validator tests only use ASCII inputs.

### Pitfall 3: Trailing-dot equivalence
**What goes wrong:** `corp.com.` listed but `corp.com` submitted (or vice versa) mismatches.
**How to avoid:** Strip one trailing dot during canonicalization (verified working on Node 24).
**Warning signs:** Acceptance test missing the `corp.com.` variant.

### Pitfall 4: Unset vs set-empty `ALLOW_INVITE_DOMAINS`
**What goes wrong:** Treating `""` as unset makes the explicit-standalone-empty case silently inherit the signup list (DOM-02 violation).
**How to avoid:** Presence via `'X' in process.env`, resolved at boot into the door matrix.
**Warning signs:** Parser branches on value falsiness instead of key presence.

### Pitfall 5: Boot-freeze vs live-read drift
**What goes wrong:** If the matrix is read live per-request but tests inject env via `startServer({ env })`, behavior can diverge between boot-frozen and live-read models.
**How to avoid:** Planner discretion (CONTEXT D-discretion) — pick ONE model, document the choice, and make both testable via the `startServer({ env })` harness (research found both are testable with it).
**Warning signs:** Mixed `process.env.X` reads inside request handlers while boot also caches a matrix.

## Code Examples

Verified behaviors this session (Node v24.21.0) — all stdlib claims below were EXECUTED, not assumed:

### Canonicalization pipeline (shape; planner wires the real module)
```javascript
// Source: stdlib behaviors verified this session on Node v24.21.0
// domain.trim().normalize('NFKC').toLowerCase() then strip ONE trailing '.'
// email: normalize('NFKC') FIRST (fullwidth ＠ → @), split on LAST '@'
// membership: canonicalSet.has(canonicalDomain) — exact, never endsWith
```

### Door matrix inheritance (DOM-02)
```javascript
// INVITE unset (key absent) → invite = signup list (may be null = fail-open)
// INVITE set (key present, even '')  → invite = parsed INVITE list, standalone
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Older research suggested fail-fast on malformed env lists | D-05/D-06 locked **warn-and-clean** | Locked in CONTEXT.md | Planner must implement warn-and-clean; do not follow PITFALLS.md fail-fast |
| STATE.md open blocker: is MCP invite a door? | Confirmed fourth door | This session (`mcp.js:923-956`) | 75-02 plan title already includes it; must be wired like the other doors |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Boot-freeze vs live-read: both models are testable via `startServer({ env })`; planner picks one (discretion) | Common Pitfalls 5 | Low — wrong pick is caught by contract tests either way |

All other claims carry `[VERIFIED: <path:lines>]` or executed-stdlib provenance per the source hierarchy.

## Open Questions (RESOLVED)

1. **Signup route lacks an explicit `emailOk` before `createUser`** — (RESOLVED in 75-01-PLAN.md, Task 1 action step 4) the DP-1 gate composes on the route's already-trimmed+lowercased email (:6710-6712) and is inserted between passwordTooWeak (:6716-6718) and createUser (:6721); no added structural check is introduced.
2. **Boot-freeze vs live-read** — (RESOLVED in 75-01-PLAN.md, artifacts decision) planner discretion chose boot-frozen consts (`SIGNUP_DOMAINS`/`INVITE_DOMAINS` at the server.js:135 zone); tightening takes effect on restart, and DOM-04 tighten/loosen tests use the reboot-same-DB harness pattern (test/helpers/server.mjs:40-42).
3. **Refusal key granularity** — (RESOLVED in 75-01-PLAN.md Task 1 step 5 + 75-02-PLAN.md Tasks 1/3 step 3) separate keys per door: `err.signupDomainNotAllowed` (signup, Plan 01), `err.inviteDomainNotAllowed` (invite-create, Plan 02), `err.inviteDomainNoLonger` (accept, Plan 02) — `err.*` parity across all 5 locales maintained, each key landing in the same commit as its first emitting gate.

## Environment Availability

No external dependencies. Node v24.21.0 verified this session; node:test built-in; `startServer({ env })` harness exists in-repo.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in) |
| Config file | none — repo-native test layout |
| Quick run command | `node --test test/domain-admission.test.js` (Wave 0 creates; adjust path to repo layout) |
| Full suite command | existing repo test command (verify via `package.json` scripts during planning) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOM-01 | Signup door: allow/deny/fail-open on unset | unit + integration | `node --test test/domain-admission.test.js` | ❌ Wave 0 |
| DOM-02 | Invite door inheritance (unset/set-empty/set) | unit | same | ❌ Wave 0 |
| DOM-03 | Invite-only domain accept works; signup list never consulted at accept | integration | same | ❌ Wave 0 |
| DOM-04 | Accept-time re-derivation fail-closed + keyed localized refusal (5 locales) | integration | same | ❌ Wave 0 |
| DOM-07 | Canonicalization: case, trailing dot, NFKC, endsWith bypass, subdomain rejection, boot matrix log | unit | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick validator test file
- **Per wave merge:** full suite
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/domain-admission.test.js` (or repo-layout equivalent) — covers DOM-01..04, DOM-07
- [ ] Contract tests for the canonicalizing validator (pure module — test first)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | Env-driven door matrix; exact membership; fail-closed re-derivation at accept |
| V5 Input Validation | yes | NFKC + canonicalizing validator; funnel contract for accept payload |
| V2 Authentication | no | No change to auth mechanics |
| V3 Session Management | no | — |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Suffix-match domain bypass (`endsWith`) | Spoofing | Exact `Set` membership (DOM-07, verified bypass vector) |
| Unicode homoglyph email separator | Spoofing | NFKC normalize before split (verified) |
| Stale stored invite domain trusted at accept | Tampering | Fail-closed re-derivation against current matrix (DOM-04) |
| MCP door bypassing UI-path rules | Elevation of Privilege | Wire MCP `invite_member` through the same validator (`mcp.js:923-956`) |

## Sources

### Primary (HIGH confidence)
- In-repo verified this session: `server.js:6703-6724` (signup), `:7732-7745` (invite-create loop), `:7763` (`db.tx`), `:7901-7915` (VIS-04 re-derive template), `:4657` (`fail()`), `:4708` (funnel contract), `mcp.js:923-956` (MCP `invite_member`), `src/core/i18n.js:243-247` (`tErr`)
- Node v24.21.0 executed stdlib claims: env-key presence, NFKC fullwidth normalization, trailing-dot strip, `endsWith` bypass
- `err.*` catalogue parity: 177 keys in lockstep across all 5 locales (fr's 1985-vs-1946 delta is non-`err.*` FR-specific keys — the `err.*` count is the real parity gate)

### Secondary (MEDIUM confidence)
- GHSA/CVE-backed suffix-bypass class documentation (pattern-level, not version-pinned)

### Tertiary (LOW confidence)
- None — no `[ASSUMED]` claims beyond A1.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero deps; all stdlib behaviors executed this session
- Architecture: HIGH — every integration point read this session with line citations
- Pitfalls: HIGH — GHSA/CVE-backed bypass classes + in-repo precedent blocks verified

**Research date:** 2026-11-19
**Valid until:** 30 days (stable domain — no external dependencies)
