# Stack Research — v3.0 Access Control & Hardening (domain admission + maintenance)

**Domain:** Self-hosted PM workspace — env-gated domain allowlists, lint cleanup, i18n spot-check
**Researched:** 2026-11-19
**Confidence:** HIGH (all stdlib behaviors verified by direct execution on Node 24.21.0; ESLint behavior from official docs via Context7 + live `npx eslint .` run on this repo)

**Headline:** ZERO new dependencies. Every piece of this milestone is reachable with `String.prototype`, one helper function, and the ESLint config the repo already has. The only code additions are: one env-parse/allowlist helper (~15 lines, pure, fully unit-testable), one domain-extraction function (~5 lines), and 2–3 new eslint.config.js entries.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24.21 (repo engines: `>=24`) | Runtime for all new logic | Already the runtime; every needed capability is stdlib |
| `String.prototype.split/trim/toLowerCase/filter` | ES2023, stable | Parse `ALLOW_SIGNUP_DOMAINS` / `ALLOW_INVITE_DOMAINS` | Idiom below verified; empty-string → `[]` means unset/empty are naturally equivalent |
| `node:url` → `domainToASCII` | Stable since v15 | Optional IDN (punycode) normalization | Available if IDN domains ever land; simplest policy is to reject non-ASCII entries instead (verified: `'münchen.example'` → `'xn--mnchen-3ya.example'`, garbage → `''`) |
| ESLint | ^10.15.0 (flat config, `eslint.config.js`) | Lint cleanup | Already installed; the 17 errors are per-line code fixes, not config changes (mostly) |

### Supporting Libraries

**None.** The zero-new-dependency constraint is fully honored. No validator, no dotenv, no i18n-testing library.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `node:test` | Unit-test the allowlist helper & domain matcher | Pure functions → exhaustive matrix tests cheap (door matrix, unset-inherits, fail-closed) |
| `scripts/i18n-scan.mjs` + `scripts/fr-parity.mjs` | Locale verification | Already exist; nl/de/es spot-check extends this, no new tooling needed |
| Playwright e2e (existing) | Render nl/de/es in the real app | Existing `selectLanguage` helper (v2.3, openSettings/selectLanguage shared helpers) is the exact hook for spot-check specs |
| `npx eslint .` | Baseline gate | Live run 2026-11-19: **17 errors — composition matters, see breakdown below** |

## Verified Integration Patterns (stdlib only — all executed on Node 24.21.0)

### 1. Parsing comma-separated env vars

```js
const parseDomainList = (raw) =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
```

Verified behaviors:
- `' a.com , b.com,, C.COM '` → `['a.com','b.com','c.com']` (whitespace, empty entries, case all handled)
- `''` → `[]` — so `ALLOW_SIGNUP_DOMAINS=""` behaves as "deny all", distinct from *unset* (`undefined`). **The unset-inherits-signup rule must check `process.env.ALLOW_INVITE_DOMAINS === undefined` (or `'ALLOW_INVITE_DOMAINS' in process.env`) BEFORE calling the parser**, because the parser cannot distinguish unset from empty-string.
- No dependency on `dotenv` — the server already reads `process.env` directly.

### 2. Email-domain extraction from verified emails

```js
const emailDomain = (email) => {
  const at = email.lastIndexOf('@');
  return at > 0 ? email.slice(at + 1).toLowerCase() : '';
};
```

Verified:
- `'Foo.Bar+tag@EXAMPLE.co.uk'` → `'example.co.uk'`
- Trap documented: quoted local parts (`'"a@b"@example.com'`) make `lastIndexOf` return the wrong index — but this app never accepts such addresses (signup regex + `email_verified` OIDC gate upstream). Extract only *after* the existing email validation; never trust the raw claim first.
- Lowercase **at extraction time** and compare against an already-lowercased allowlist, so both sides normalize identically.

### 3. Exact-domain matching semantics

```js
const allowed = (list, dom) => list.includes(dom); // === only
```

- **`endsWith` is a security bug here — verified:** `'evilexample.com'.endsWith('example.com')` → `true`. Exact `===` (`Set`/`includes`) is the owner-validated "exact-domain matching" rule; never use `endsWith(dom)`.
- If subdomain matching is *ever* wanted later, the correct form is `dom === entry || dom.endsWith('.' + entry)` (verified `'evilexample.com'` correctly rejected) — do not ship it now; the seed design says exact.
- Non-ASCII/IDN: with exact matching, simply normalize via `toLowerCase()` and let unmatched IDN variants fail closed. `domainToASCII()` from `node:url` exists if the operator needs to write punycode entries — document it in DEPLOY.md rather than building an IDN pipeline.
- Comparison domain should be built from a `new Set(parsedList)` at boot (once, not per-request) — the three gate sites (OIDC JIT, signup, invite create/edit/accept) re-check per request, and accept-time re-validation must re-read env (or reuse the boot-parsed, env-frozen value — pick one and document; re-parsing per call is trivially cheap here and avoids stale-boot surprises in tests).

### 4. Where the gates hook in (server.js, no new abstractions)

- **OIDC JIT creation** (oidc.js Phase 30 path): after `email_verified` gate, before account creation — `ALLOW_SIGNUP_DOMAINS` check, keyed localized refusal code (existing ERR-01 code+message pattern; add `enrolKey`-style keys to EN catalogue first, i18n-scan gate does the rest).
- **Self-serve signup** (workspace-create / join paths using `ALLOW_SIGNUP`): same list, same refusal.
- **Invite create/edit/accept**: `ALLOW_INVITE_DOMAINS`, with unset → inherit `ALLOW_SIGNUP_DOMAINS` (owner-validated), and **fail-closed at accept time** (re-check the invitee's email domain against the *current* list; do not trust list cached at invite-create time).
- **Existing-member immunity**: check domain only on the *creation/acceptance* path — never re-validate existing memberships (no new middleware; each site is a 2-line call to the shared helper, mirroring the Phase 33 hardened-accept precedent of one shared validator).

## Lint cleanup (17 no-unused-vars) — ESLint 10 idioms

**Live baseline (2026-11-19, `npx eslint .`): the 17 are NOT all `no-unused-vars`:**

| File:line | Rule | Right fix |
|-----------|------|-----------|
| test/email-outbox.test.mjs:284 `'mem'` | no-unused-vars | Code fix (delete var or use it) |
| test/mcp.test.mjs:78,1067 | **no-useless-assignment** | Code fix: delete the dead assignment (v2.7 shipped eslint 10 which checks this by default in `js.configs.recommended`) |
| test/pwa-banner.test.mjs:77 `'c'` | no-unused-vars | Code fix: rename unused callback param to `_c` *or* drop the param — see convention below |
| test/subtask-tree.test.mjs:10 `'login'` | no-unused-vars | Code fix: delete unused import |
| test/visibility-team.test.mjs:77 | **no-useless-assignment** | Code fix |
| webhook-formats.js:43 `'Buffer'`, webhook-ssrf.js:84 `'process'` | **no-undef** | **Config fix, not code fix**: these two files are missing from the Node-globals block in eslint.config.js line 15 — add `'webhook-formats.js'`, `'webhook-ssrf.js'` to the `files` array of the `globals.node` entry |

**Decision order (per official ESLint guidance, Context7-verified):**
1. **Code fix first** — delete the variable/import or actually use the value. That's 15 of 17.
2. **Config fix** when the error is environmental (the two `no-undef` in webhook files: upstream packaging quirks of a vendored pattern → extend the existing `globals.node` files list, the same mechanism already used for `src/lib/vendor`).
3. **Inline `eslint-disable-next-line rule -- reason`** only as last resort, and only with a documented reason after `--` (official rule: config-file > disable comment > never bare disable). For these 17, **zero disables should be needed**.
4. **Do NOT** add a blanket `argsIgnorePattern: '^_'` to the config to silence things wholesale — one genuine unused import (subtask-tree `login`) shouldn't be permanently exempted. If the repo later wants an underscore convention for intentionally-unused callback params (pwa-banner `'c'`), add `argsIgnorePattern: '^_'` *then*, scoped to test files, and rename those params.

**Trap (v9+ semantics, applies to eslint 10):** `varsIgnorePattern` no longer covers `catch` bindings — only `caughtErrorsIgnorePattern` does (`caughtErrors` is `'all'` by default in flat config). None of the 17 are catch-bindings today, so this is awareness-only.

## Locale catalogue rendering verification (nl/de/es)

No new tooling needed — three existing mechanisms compose:

1. **Static gate** (already runs at build): `scripts/i18n-scan.mjs` + `scripts/fr-parity.mjs`. v2.7 already brought nl/de/es to 1946 keys each with parity gating. The spot-check is about *rendering*, not key parity.
2. **Playwright e2e rendering spot-check**: the shared `openSettings` / `selectLanguage` helpers (from the v2.3 e2e baseline repair, phase 62) make a `switch to nl/de/es → assert visible strings render` spec trivial — mirror the existing FR locale e2e pattern (Phase 10 UAT-01..09 precedent). Assert 2–3 representative strings per language + "no English leak" on a sampled surface (reuse the existing leak-test approach from Phase 11, which already has the design-system allow-list).
3. **Keyed server refusals**: the new domain-refusal keys ride the existing ERR-01 code pattern — client translates code, falls back to English server message. Add the new keys to ALL catalogue files (en/fr/nl/de/es) in the same commit or the parity gate will fail the build — which is itself the spot-check safety net for the new feature.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Hand-rolled env parse + exact-match `Set` | `validator.js` / `tldts` PSL parsing | Never under zero-deps; PSL subdomain logic is explicitly out of scope (exact matching) |
| `lastIndexOf('@')` extraction | `new URL('mailto:'+email)` parsing | Only if quoted local parts ever needed to be supported — they aren't (validation upstream) |
| Per-site duplicated checks | One shared `domainAllowedForSignup()` / `domainAllowedForInvite()` helper | Never — Phase 33/53 precedent: shared validator, tested once |
| Code fixes for lint | `eslint-disable` comments | Only with documented reason; not needed for any of the 17 |
| Reject non-ASCII domains | `node:url domainToASCII` IDN pipeline | Only if an operator actually reports needing IDN entries (document punycode in DEPLOY.md instead) |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `endsWith(domain)` matching | Verified bypass: `evilexample.com` passes | Exact `===` via `Set` |
| Parsing env at module top-level then trusting it forever in accept re-validation | Fail-closed accept-time rule requires *current* env; a cached boot value is a stale-admission bug if the process model ever becomes reloadable — and tests need env mutation | Small helper called at each gate (cost is nanoseconds) |
| `dotenv`, `validator`, `tldts`, `psl` | Violates zero-new-deps standing constraint | `process.env` + stdlib strings |
| Blanket `no-unused-vars` config loosening (ignore patterns across the board) | Masks future real dead-code errors | Line-level fixes + at most scoped `argsIgnorePattern` for tests |
| Making `ALLOW_INVITE_DOMAINS=""` mean "inherit" | Empty string is indistinguishable from deny-all via the parser; unset must be detected pre-parse | `'ALLOW_INVITE_DOMAINS' in process.env` check before parsing |

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| eslint 10.15 | flat config `eslint.config.js` (already migrated) | `caughtErrors: 'all'` default since v9; `no-useless-assignment` now active from recommended |
| Node 24 | everything above | `node:url domainToASCII` stable; `node:test` sufficient for helper matrix tests |
| i18n registry | all 5 locales | New refusal keys must land in en+fr+nl+de+es simultaneously (parity gate enforces) |

## Sources

- Direct execution on Node 24.21.0 (node-repl) — env parsing, email extraction, endsWith bypass, `domainToASCII` — **HIGH** (verified)
- Context7 `/eslint/eslint` official docs — no-unused-vars options, caughtErrorsIgnorePattern v9 change, disable-comment guidance — **HIGH**
- Live `npx eslint .` run on gr8r HEAD 2026-11-19 — exact 17-error composition — **HIGH**
- `eslint.config.js` + `scripts/i18n-scan.mjs`/`fr-parity.mjs` repo inspection — integration points — **HIGH**
- Web search (searxng) on domain-allowlist security practice — corroborated exact-match/homograph concerns; mostly generic results — **LOW**, superseded by the direct verifications above

---
*Stack research for: gr8r v3.0 Access Control & Hardening*
*Researched: 2026-11-19*
