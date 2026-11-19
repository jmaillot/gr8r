# Project Research Summary

**Project:** gr8r — v3.0 Access Control & Hardening (domain admission + maintenance)
**Domain:** Self-hosted PM workspace — env-gated email-domain allowlists, lint cleanup, i18n spot-check
**Researched:** 2026-11-19
**Confidence:** HIGH (stack verified by direct execution; features against GitLab/Gitea docs; architecture against live code; pitfalls CVE-backed)

## Executive Summary

gr8r v3.0 adds instance-level email-domain admission rules (`ALLOW_SIGNUP_DOMAINS` + `ALLOW_INVITE_DOMAINS`) to an already-hardened single-file Node server, plus lint cleanup (17 errors: 15 code fixes + 2 eslint.config.js globals) and an nl/de/es translation spot-check. The entire milestone honors the zero-new-dependency constraint: the domain feature is ~40 lines of stdlib JS inside `server.js` (one parse helper, one email-domain extractor, one funnel-shaped validator copied from the existing `validateGuestInviteShape` precedent), wired at exactly five decision points (signup, invite create, invite accept, OIDC JIT, SSO invite reconciliation). No migration, no schema change, no admin UI, no new file.

Every comparable product (GitLab, Gitea, Outline, OneTimeSecret) restricts new account creation only and treats existing accounts as immune; gr8r's design is *stricter* than all of them by also gating invites at create AND at accept (fail-closed re-validation). The recommended build order is dependency-driven: (1) boot-time tri-state parser + exact-domain validator + adversarial unit tests, (2) the five doors in risk order (signup → invite create → fail-closed accept → OIDC JIT → SSO reconciliation), (3) keyed localized refusals in all 5 locales riding the existing ERR-01/`tFor()` patterns, (4) DEPLOY.md door-matrix documentation. Lint and translation work are independent maintenance tracks.

The dominant risks are parsing bypasses (homoglyph `＠`, trailing dot, quoted local parts — CVE-backed class), fail-open config semantics (unset vs set-but-empty vs whitespace), door-matrix confusion for operators, and the TOCTOU hole of invites minted under a since-tightened list. All are mitigated by one canonicalization funnel (single `split('@')` call site), a tri-state boot resolver with a startup log of the resolved matrix, full-matrix contract tests, and live-list re-validation at accept — with existing-member immunity as a tested invariant, never an accident.

## Key Findings

### Recommended Stack

Zero new dependencies — every capability is Node 24 stdlib plus the repo's existing ESLint 10 flat config. All stdlib behaviors verified by direct execution on Node 24.21.0; lint baseline verified by live `npx eslint .` run (17 errors, exact composition known).

**Core technologies:**
- `String.prototype` env parsing (`split/trim/toLowerCase/filter`) — tolerant comma-list parsing; unset vs empty-string distinction must be made pre-parse via `'ALLOW_INVITE_DOMAINS' in process.env`
- `new Set()` exact-match — `endsWith` is a **verified security bug** here (`'evilexample.com'.endsWith('example.com')` → true)
- `node:test` — pure functions make the door matrix, tri-state semantics and fail-closed behavior cheaply exhaustively testable
- Existing i18n tooling (`scripts/i18n-scan.mjs`, `fr-parity.mjs`, Playwright `selectLanguage` helper) — no new tooling for nl/de/es spot-check
- ESLint ^10.15 flat config — 15 per-line code fixes; 2 `no-undef` fixes are **config** fixes (add `webhook-formats.js`, `webhook-ssrf.js` to the `globals.node` files array); zero `eslint-disable` needed

### Expected Features

**Must have (table stakes, competitor-validated):**
- Allowlist gates new doors only; existing accounts immune (GitLab/Gitea/OneTimeSecret explicit stance)
- Tolerant comma parsing (whitespace, empty entries, case-insensitive both sides)
- Exact-domain matching as default — no implicit subdomain admission
- Localized keyed refusal at every door (`domainNotAllowed` class, ERR-01 pattern)
- Fail-closed accept-time re-validation (gr8r already pioneered this at Phase 33)
- Unset = feature off (no behavior change)

**Should have (differentiators beyond competitors):**
- Two independent doors (signup vs invite list) with unset-inherits — finer-grained than GitLab/Gitea/Mattermost's single knob
- Refusal at invite CREATE, not just accept — admin learns immediately
- OIDC JIT gate — closes the SSO bypass door competitors historically forgot

**Defer (v2+):** wildcards/subdomain matching, per-workspace lists, denylists, admin-UI editing, refusal-audit verbs (P3).

### Architecture Approach

No new abstractions: the whole feature lives in `server.js`'s helper zone next to `emailOk` (:671). Boot-time parse into tri-state module consts (`null` = unset/inherit-or-off; empty Set = deliberate deny-all; populated Set = the list); the inheritance rule is one `??` line at boot. Domain check runs **last among refusals, before any write**, at five decision points, reusing the `fail(res, status, code, msg, extra)` keyed-refusal funnel and the D-50-2 one-shared-validator discipline. Refusals are side-effect-free everywhere.

**Major components / decision points:**
1. Shared validator (`parseDomainList` + `emailDomain` + `emailDomainRefusal`) — the single source of truth; one `split('@')` call site repo-wide
2. DP-1 signup (:6703) and DP-2 invite create (:7626, per-email loop) — JSON keyed refusals, 400
3. DP-3 invite accept (:7852, after the guest-toggle fail-closed re-derive) — validate `invite.email` (row, not body), 403, refuse without consuming
4. DP-4 OIDC JIT (~:5120, after `email_verified`) and DP-5 SSO reconciliation (~:5155) — generic `sso=error` redirect (no domain-revealing query param); DP-5 filters refused invites before the existing branching, verbatim with DP-3 semantics

### Critical Pitfalls

1. **Email-parsing bypass (Critical, CVE-backed)** — homoglyph `＠` (GHSA-7rqj-j65f-68wh), trailing-dot FQDN, quoted local parts, case. Avoid: NFKC-normalize first, reject non-ASCII domains, parse after LAST `@`, strip one trailing dot, exact Set match, single canonicalization funnel with adversarial table tests.
2. **Fail-open config tri-state** — `""` vs unset vs whitespace conflation. Avoid: explicit tri-state boot resolver, env-shape test matrix (`undefined`/`''`/`' '`/`'a,b'`/`'a,,b'`/`' a , B '`), boot log of resolved matrix, refuse-and-exit on broken values.
3. **Door-matrix confusion** — 2 vars × 5 doors; unset-inherits is invisible in the var name. Avoid: literal matrix table in code + DEPLOY.md, full-matrix contract tests, worked operator examples.
4. **TOCTOU invite lifecycle** — invites minted under a since-tightened list. Avoid: live-list re-validation at accept (never a stored snapshot), tighten/loosen contract tests, keyed `inviteDomainRevoked`-class refusal.
5. **Breaking existing flows** — re-invite of out-of-list existing members refused; SSO login blocked after tightening. Avoid: membership lookup short-circuits before the predicate; admission ≠ authentication; three "existing account" contract tests.

Maintenance pitfalls: lint cleanup must be one commit per site (side-effectful initializers — no autofix is safe, per typescript-eslint #3456); locale spot-check must cover refusal states (placeholders, silent fallbacks) not just happy-path nav labels.

## Implications for Roadmap

Based on research, suggested phase structure (milestone is small; 3 phases + carryovers):

### Phase 1: Domain Admission Core (parser + signup + invite doors)
**Rationale:** Everything depends on the shared validator; the JSON-refusal doors are the cheapest to build and test, and the first i18n keys must land in this phase (parity gate fails otherwise).
**Delivers:** Tri-state boot resolver + exact-domain funnel + unit tests; DP-1 signup gate; DP-2 invite create gate; DP-3 fail-closed accept re-validation; `domainNotAllowed` keyed refusals in all 5 catalogues with placeholder-parity unit test; DEPLOY.md door-matrix section.
**Addresses:** Signup gate, invite gates, accept re-validation, localized refusals (all P1)
**Avoids:** Pitfalls 1, 2, 4 (canonicalization, tri-state, TOCTOU) — the funnel and its adversarial tests are the first task

### Phase 2: OIDC/SSO Doors + Door-Matrix Hardening
**Rationale:** Redirect-surface doors are e2e-only to assert and DP-5's filter depends on DP-3 semantics being settled; grouping the SSO work together keeps the "existing-account immunity" contract tests in one place.
**Delivers:** DP-4 JIT gate (after `email_verified`, generic error redirect, server-side domain-only logging); DP-5 SSO reconciliation filter; existing-member immunity contract tests (re-invite of out-of-list member succeeds; existing SSO account logs in); full-matrix contract suite incl. both inherit directions; boot-time resolved-matrix log.
**Addresses:** OIDC JIT gate (P1), immunity invariants, door-matrix documentation
**Avoids:** Pitfalls 3 and 5 (matrix confusion, lockouts)

### Phase 3: Maintenance — Lint Cleanup + Locale Spot-Check
**Rationale:** Fully independent of Phases 1–2 (except that new refusal keys give the locale spot-check a real refusal path to screenshot); safe to run in parallel or last.
**Delivers:** 17 lint errors resolved (15 per-site code fixes, one commit per site, suite green per commit; 2 config fixes adding webhook files to `globals.node`); nl/de/es rendering spot-check via Playwright incl. per-locale refusal-path screenshots; WR-01/WR-02/IN advisory carryovers as scoped.
**Avoids:** Pitfalls 6 and 7 (side-effectful lint deletions, silent locale fallbacks)

### Phase Ordering Rationale

- Phase 1 first because the shared validator is the dependency root and its i18n keys cannot slip past the parity gate
- Phase 2 second because JIT/SSO semantics depend on accept-route semantics (DP-3) being settled, and DP-5's "verbatim from accept" doctrine requires it
- Phase 3 parallelizable — no coupling to the domain feature; ARCHITECTURE.md notes Phases "2–4 independent of 5–6 once phase 1 lands" if plans are split
- Architect's note for the planner: there is **no PUT/PATCH invite route today** (verified) — reconcile the seed's "invite edit" decision point with reality; re-minting via create is already covered by DP-2

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (OIDC/SSO doors):** redirect-surface refusal UX and DP-5 invite-filtering behavior need e2e design decisions; verify whether MCP mirror has any invite/provision surface (likely n/a but unconfirmed)
- **Phase 3 (carryovers):** WR-01/WR-02/IN advisory items were not re-researched this cycle — scope them at discuss-phase

Phases with standard patterns (skip research-phase):
- **Phase 1:** every integration point verified against live code with line numbers; stdlib verified by execution; house patterns (Phase 33/50/53, ERR-01, tFor) fully established

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All stdlib behaviors executed on Node 24.21.0; live eslint run on HEAD; Context7-verified ESLint docs |
| Features | HIGH | GitLab/Gitea verified against official docs 2026-11-19; Mattermost/Outline/Authelia rows LOW/MEDIUM (rate-limited) — not load-bearing for design |
| Architecture | HIGH | All decision points verified in live server.js with line numbers; prior-art cross-check MEDIUM (web) |
| Pitfalls | HIGH | CVE/GHSA-backed bypass class + official docs (GitLab MR 76272, OneTimeSecret posture, ESLint #3456) |

**Overall confidence:** HIGH

### Gaps to Address

- **Mattermost/Outline competitor rows:** model-knowledge only; re-verify only if a competitor-comparison claim becomes load-bearing (it isn't for implementation)
- **"Invite edit" decision point:** no edit route exists — planner must reconcile seed wording (treat re-minting as covered by DP-2; don't invent a route)
- **MCP mirror invite surface:** confirm during Phase 1 planning whether mcp.js can mint invites; if yes it's a sixth matrix cell on the shared validator
- **Email-change door:** if gr8r supports account email change, it must re-validate (GitLab MR 76272 lesson); if not, add a contract test documenting the door's absence
- **Set-but-empty semantics for ALLOW_INVITE_DOMAINS:** research recommends "deliberate deny-all" (FEATURES) and the tri-state design supports it — needs owner ratification at planning
- **WR-01/WR-02/IN carryovers:** advisory items carried from prior milestones — scope not re-researched this cycle

## Sources

### Primary (HIGH confidence)
- Direct execution on Node 24.21.0 — env parsing, email extraction, `endsWith` bypass, `domainToASCII` (STACK)
- Live `npx eslint .` on gr8r HEAD 2026-11-19 + `eslint.config.js` inspection (STACK)
- GitLab sign-up restrictions docs + MR 76272 (bypass via email change) — docs.gitlab.com
- Gitea config cheat sheet `EMAIL_DOMAIN_ALLOWLIST`/`BLOCKLIST` + issue #27457 — docs.gitea.com
- OneTimeSecret SSO docs — new-account-only semantics, distinct keyed refusals, never reveal allowlist
- GHSA-7rqj-j65f-68wh (Auth.js homoglyph-@ bypass, Critical); PortSwigger "Splitting the email atom"; BlackHat HostSplit 2019
- typescript-eslint #3456 (no autofix for no-unused-vars — side effects) + Oxlint write-only-read docs
- Context7 `/eslint/eslint` official docs (caughtErrorsIgnorePattern v9 change, disable-comment guidance)
- Direct code inspection: server.js routes :6703/:7626/:7852, OIDC :5033–:5250, helpers :671/:4657, env consts :133–146 (ARCHITECTURE)
- gr8r PROJECT.md (SEED-261119-f3w, HARD-01..05, D-50-2/D-53-2, ERR-01/02, tFor, i18n parity gates)

### Secondary (MEDIUM confidence)
- Appsmith `APPSMITH_SIGNUP_ALLOWED_DOMAINS` (invited users bypass, existing users unaffected)
- Outline `ALLOWED_DOMAINS` exact matching + issue #3412
- Trailing-dot origin-bypass write-up (soltanali0)
- Outline .env.sample / Mattermost config (partial)

### Tertiary (LOW confidence)
- Mattermost `RestrictCreationToDomains`, Authelia sub-addressing — model knowledge, rate-limited search; re-verify at phase research if load-bearing
- Generic searxng results on allowlist practice — superseded by direct verifications

---
*Research completed: 2026-11-19*
*Ready for roadmap: yes*
