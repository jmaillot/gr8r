# Pitfalls Research

**Domain:** Instance-level email-domain admission (env-gated allowlists) added to an existing multi-tenant invite system with OIDC JIT, hardened invite-accept, i18n parity gate and contract tests — plus lint cleanup and locale verification.
**Researched:** 2026-11-19
**Confidence:** HIGH (prior-art from GitLab, Gitea, Outline, OneTimeSecret; CVE/GHSA-backed email-parsing findings; ESLint rule documentation) with project-specific analysis from `PROJECT.md` and the codebase.

> Scope note: this milestone's features are exactly where the historical bugs live. Every
> "prior art" reference below shipped a real bypass or lockout that v3.0 must not repeat.

## Critical Pitfalls

### Pitfall 1: Raw `split('@')` email parsing — the door the attacker walks through

**What goes wrong:**
The domain check is implemented as `email.split('@').pop()` or a naive regex, and admission is decided on whatever string arrives. RFC 5321/5322 allow quoted local parts (`"a@b"@corp.com`), comments (`user@(comment)corp.com`), and — critically for an allowlist — the *domain* side itself can arrive in non-canonical forms:

- **Unicode homoglyph separators:** a fullwidth `＠` (U+FF0E / U+FF20 class) that normalizes to `@` under NFKC. Auth.js shipped exactly this bug (GHSA-7rqj-j65f-68wh, Critical): "Email normalizer validates the address *before* Unicode normalization, allowing a homoglyph `@` bypass." A check run on the raw string sees `user@corp.com` where mail libraries later see a different domain — or vice versa: a hostile domain that *renders* like `corp.com` passes a length/shape check and then canonicalizes INTO the allowed domain on the wrong side of the comparison.
- **Trailing dot FQDN:** `user@corp.com.` is a fully equivalent DNS name per RFC 1034/1035, so mail actually delivers to corp.com — but `String.endsWith('corp.com')` or a Set lookup on the raw string misses it. The trailing-dot trick is a documented origin/allowlist bypass class (soltanali0 write-up; the same trick broke GitLab and Express origin checks).
- **Case:** `CORP.COM`, `Corp.Com` — Set lookups are case-sensitive.
- **Quoted local parts / multiple `@`:** `"evil@corp.com"@attacker.io` — splitting on the first or last `@` naively yields the *wrong* domain either way.

**Why it happens:**
The check is written against the happy-path email the invite modal produces, and unit tests only cover lowercase ASCII. The PortSwigger paper "Splitting the email atom" documents parser-discrepancy access-control bypasses as a whole class: the validation parser and the *delivery* parser are different programs.

**How to avoid:**
One shared canonicalization funnel, used by every door (JIT, signup, invite create/edit/accept — exactly the gr8r pattern of one shared validator like D-53-2):

1. Normalize FIRST: `String(email).trim().normalize('NFKC').toLowerCase()` — then reject any residual non-ASCII in the domain part (gr8r is not an IDN deployment; refuse `xn--` and non-ASCII domains outright rather than punycoding them).
2. Parse LAST: take the substring after the LAST `@`, and if the local part contains a quoted section (starts with `"`), reject or parse strictly — do not hand-roll.
3. Strip one trailing `.` from the domain before lookup.
4. Compare against an allowlist that was itself normalized at boot (lowercase, trailing dots stripped, no whitespace entries) with **exact equality** — the seed design says exact-domain matching, so resist any temptation to add `endsWith`/suffix or wildcard matching "for convenience": `notcorp.com` and `evilcorp.com` both end with `corp.com`.
5. Store the canonical email at account/invite creation, never the raw string.

**Warning signs:**
Contract tests that only use `alice@corp.com`; any `endsWith`, `includes('.')` or non-lowercased comparison in the diff; the canonicalizer existing but not being the single call site (grep for `split('@')` — it must appear once).

**Phase to address:**
Domain-admission phase — the canonicalization funnel + an adversarial table-driven contract test (`＠`, trailing dot, mixed case, quoted local, subdomain, `notcorp.com`) is the first task, before any route is wired to it.

---

### Pitfall 2: Fail-open on unset vs empty, and on config-parse errors

**What goes wrong:**
The gate answers "allowed" when the env var is missing *or malformed or empty*, and those are not the same state. Documented cases: OneTimeSecret's SSO docs state "an explicitly empty, readable allowlist is the configured allow-all state, not a fallback for missing or corrupt configuration" — i.e. they had to distinguish three states. The classic accident: `ALLOW_SIGNUP_DOMAINS=""` in docker-compose (set-but-empty) silently means open-to-all, while the operator believes the variable's *presence* means restricted. The other classic: `"corp.com, corp.com "` or a stray newline from a YAML fold produces a list containing `""` and `" corp.com"`, and depending on implementation the whole check throws (fail-open via catch) or matches nothing (silent total lockout).

**Why it happens:**
`process.env.X || DEFAULT_OPEN` and `env.X?.split(',')` both quietly conflate undefined/empty/whitespace, and JavaScript's falsy `""` does the rest.

**How to avoid:**
- Parse env once at boot into an explicit tri-state: `unset` (per seed design: inherit — signup list for invites; signup unset = open), `set-and-empty` (owner decision: what does the seed design say? — document it in code as a named constant with a comment, never an accident), `set-with-values`.
- Boot-time validation: strip whitespace/empties, dedupe, lowercase, log the effective resolved list at startup ("signup doors restricted to: corp.com, corp.dev; invite doors inherit"), and refuse-and-exit on a syntactically broken value (e.g. a `*` or `http://` prefix) rather than failing open at request time. gr8r already has loud boot validation precedent (D-K2 for MASTER_KEY) — reuse that posture.
- Fail-closed at *accept* time is already the seed design: accept-time re-validation must treat "cannot determine list" as refuse, never as allow. The `firstWorkspace()` fail-closed twins (v1.7 HARD) are the in-house pattern.

**Warning signs:**
A `try/catch` around the list parse that returns `true`; `.split(',')` with no trim/filter(Boolean); tests that never boot with the var absent, empty, and whitespace-padded.

**Phase to address:**
Domain-admission phase — boot resolver as its own unit with a test matrix of env shapes (`undefined`, `''`, `' '`, `'a,b'`, `'a,,b'`, `' a , B '`), plus a DEPLOY.md section pinning the semantics.

---

### Pitfall 3: Door-matrix confusion — admin sets only `ALLOW_INVITE_DOMAINS` expecting signup to be restricted (or vice versa)

**What goes wrong:**
Two variables × four doors (OIDC JIT, direct signup, invite create/edit, invite accept) = an eight-cell matrix, and operators — and developers — fill in cells from intuition. The specific surprise named in the seed design: **unset-inherits-signup** means `ALLOW_INVITE_DOMAINS` unset does NOT mean "invites unrestricted" — it means "invites follow the signup list". An admin who sets only the invite list while signup is open gets: invites restricted to corp.com, but anyone with any email can self-signup through the signup door (and then... is already in). Conversely, an admin who tightens `ALLOW_SIGNUP_DOMAINS` after onboarding and expects OIDC JIT to be "invite-adjacent" may leave JIT governed by the signup list and lock out a partner domain that invites were still allowed to bring in. Gitea's docs record the sibling trap: `EMAIL_DOMAIN_ALLOWLIST` applies to *registration* only, and issue #27457 is exactly the confusion when an admin-created (invite-like) user path behaved differently from registration.

**Why it happens:**
"Signup" and "invite" sound like one policy; the inheritance rule is invisible in the env var name. Nobody re-reads the door matrix after the first route works.

**How to avoid:**
- Write the door matrix as a **literal table in code and in DEPLOY.md** (rows: JIT / signup / invite create / invite edit / invite accept; columns: which list, which fallback), and make the resolver the only place that reads the two env vars.
- A boot-time advisory log when the lists diverge ("signup open, invites restricted to X — is that intended?"), like GitLab surfaces sign-up restrictions in admin settings.
- Contract tests assert every cell of the matrix, including both inherit directions and the accept-time re-validation cell — the seed design already demands a contract suite; make the matrix the suite's table of contents.
- DEPLOY.md gets one worked example per confusion ("I set only ALLOW_INVITE_DOMAINS and signup is still open — why") because this is an operator-education bug as much as a code bug.

**Warning signs:**
Any route checking the list inline (`if (ALLOW_SIGNUP_DOMAINS...)`) instead of calling the resolver; contract tests that cover signup and invite-accept but not JIT or invite-edit.

**Phase to address:**
Domain-admission phase — resolver + matrix table + full-matrix contract tests are the milestone's spine; DEPLOY.md section in the same phase.

---

### Pitfall 4: Timing-of-check — the list changes between invite send and accept (TOCTOU)

**What goes wrong:**
Invite created when `corp.com` was allowed; list tightened (or rotated to a new corporate domain) a week later; invitee clicks the token and gets admitted to a domain that is now forbidden. If the check lives only at invite-create, the tightened list is a lie. The reverse also bites: list *loosened* so a re-invite passes create, but a stale pending invite from the strict era is accepted — fine, but the audit trail then shows a member whose admission contradicts the list in force at their signup. This is why the seed design mandates **fail-closed accept-time re-validation**.

**Why it happens:**
Invites are long-lived tokens; the natural implementation validates once at issuance. The hardened accept route (sameOrigin-first, silent body whitelist) already treats accept as an untrusted re-entry point — but the domain check must be added *to that re-validation pass*, not only to create.

**How to avoid:**
- Accept-time re-validation as the authority (seed-mandated): the pending invite is checked against the list *in force at accept*, with a **keyed localized refusal** (`inviteDomainRevoked`-class key, not a generic error) so the invitee understands the invite expired by policy.
- Invite **edit** also re-validates (changing the email on a pending invite to a now-forbidden domain must refuse).
- Decide and document the existing-member-immunity interaction at accept: re-validation applies to the *admission email*, not to the inviter or to already-members (seed: existing-member immunity). A test proving immunity survives accept-time re-validation is essential — it is the easiest invariant to accidentally break by reusing one helper on both sides.
- Contract test: create invite under list A, tighten to list B, accept → refused with the keyed reason; loosen, accept → admitted.

**Warning signs:**
A `domains` snapshot stored on the invite row "for audit" that the accept path reads back *instead of* the live list; the accept handler importing only the create-time validator.

**Phase to address:**
Domain-admission phase — the re-validation branch of the hardened accept route, with the tighten/loosen contract tests.

---

### Pitfall 5: Breaking existing flows — pre-existing members blocked from re-invite, and SSO-linked accounts locked out after tightening

**What goes wrong:**
Two documented lockout modes:

1. **Re-invite of a pre-existing member refused.** Admin invites `alice@oldpartner.com` (already a member from before the list existed, or with an out-of-list email) → invite-create refuses even though the target is already in the workspace and the invite is really just a re-share. GitLab's MR 76272 is the canonical *adjacent* bug: "a user can bypass the domain allowlist by creating an account with an allowed email, then *changing* their email" — meaning GitLab had to add email-change re-validation, i.e. the *account-update* door must be in the matrix too, and it must not be confused with re-invite.
2. **SSO-linked accounts locked out after list tightening.** The signup list now excludes a domain whose OIDC accounts already exist. If JIT/allowlist logic accidentally gates *login* rather than *account creation*, existing members can't sign in. OneTimeSecret documents the correct stance explicitly: "Restrictions apply to **new account creation only** — existing linked accounts can still log in" and "Do not clear or bypass an allowlist for returning accounts." Also: their "missing email yields `missing_email`; malformed yields `invalid_email`; disallowed yields `domain_not_allowed`" — distinct keyed refusals, never one generic error.

**Why it happens:**
The check gets attached to "user with this email appears" rather than "new admission event". OIDC JIT's existing gate (tenant pin + `email_verified`) is a natural place to bolt on the domain check — and the wrong variable (invite list) or wrong semantics (login-blocking) gets bolted on.

**How to avoid:**
- One predicate: `isAdmissible(domain, door)` where door ∈ {jit, signup, inviteCreate, inviteEdit, inviteAccept}; **membership lookup short-circuits before the predicate** for re-invite and for login — the allowlist never applies to authentication of an existing account.
- Invite-create: check the *new-admission* semantics — if a membership row already exists for that email in that workspace, the domain check is skipped (re-share), and the UI copy stays the existing "already a member" path.
- Email-change on an account (if gr8r supports it) re-validates the *new* email against the signup list — the GitLab MR 76272 lesson; if email change isn't supported, add a contract test documenting the door is absent.
- OIDC JIT keeps its existing gate order (tenant pin → email_verified → admissible) and refuses with a **keyed localized refusal** distinct from the tenant-pin refusal, so logs and support can tell the two apart.
- Contract tests: pre-existing member + out-of-list email re-invite → succeeds; existing SSO account of a now-forbidden domain logs in → succeeds; new JIT on forbidden domain → refused with key.

**Warning signs:**
The domain check reachable from the login/session code path; an `await membershipLookup` that happens *after* `isAdmissible`; a single refusal key for both JIT-tenant and JIT-domain failures.

**Phase to address:**
Domain-admission phase — predicate + door wiring with the three "existing account" contract tests; this is also the phase's primary regression risk against the pinned contract suite (any pre-existing contract test that pins un-restricted behavior on these routes must be consciously updated, never loosened).

---

### Pitfall 6: eslint `no-unused-vars` cleanup — deleting code that had side effects

**What goes wrong:**
The 17 pre-existing unused-vars errors get "fixed" by deleting the variable *and its initializer*, and the initializer was load-bearing: `const server = startServer()` (never started), `const rev = bumpRevision(doc)` (mutation skipped), a destructured import whose module had side-effectful top-level code, or a function parameter removed from a callback whose arity the caller depends on. ESLint itself does not autofix this rule for precisely this reason — the typescript-eslint maintainers' stance on issue #3456: "No-unused-vars does not have an autofixer. It's not safe to remove random variables from code automatically. Side effects are everywhere." Write-only reads are another trap Oxlint documents: `y = 5` counts as unused (self-increment `z = z + 1` too), so "cleanup" of an accumulator or counter silently removes state transitions.

**Why it happens:**
The errors accumulated across 17 sites and get batch-fixed mechanically; each fix looks locally harmless and the diff reads as noise.

**How to avoid:**
- One commit per site (or per cluster), never one sweep — gr8r's atomic-commit discipline applies to lint debt too.
- For each site, classify before touching: dead local (delete all of it including any call), intentional discard (rename `_x` per the `argsIgnorePattern`/`varsIgnorePattern` convention), or side-effectful initializer (keep the call, drop the binding: `{ startServer(); }`).
- The standing gates are the safety net and must run per commit: full unit suite (1809 tests), e2e, build. A deletion that breaks a contract test is the suite doing its job — investigate the side effect, don't update the test to match.
- Beware the second-order case: a variable becomes "unused" only *because* an earlier cleanup removed its last consumer — chain removals one at a time.

**Warning signs:**
A single commit touching multiple unrelated files "lint cleanup"; any `--fix`-style bulk change; test counts that shift between commits.

**Phase to address:**
Maintenance phase (lint/translation phase) — but the rule "one commit per site, suite per commit" belongs in the plan's task breakdown.

---

### Pitfall 7: Locale verification — missing keys falling back silently, and the three spots where the parity gate can't see

**What goes wrong:**
The nl/de/es spot-check passes a screenshot review, but real failures hide in three blind spots of a static parity scan:

1. **Silent fallback-to-key or fallback-to-EN:** `t('inviteDomainRevoked')` on a missing key renders the raw key or English, with no error — users see `"inviteDomainRevoked"` (or unexplained English) in Dutch. The existing i18n gate catches *uncatalogued new literals* in EN/FR; it does not by itself guarantee nl/de/es have the *new* domain-refusal keys, unless the catalogue scan is key-parity across all locales (gr8r's post-v2.7 full catalogues are parity-gated — confirm the new keys join that parity, not just EN+FR).
2. **Server-side keys vs client-side catalogues:** the refusal keys are emitted by the *server* (`tFor()` core, v1.8 precedent) and rendered by the client's code-translation layer (ERR-01/02). A key present in the server catalogue but missing from a client locale catalogue falls back to the English server message — by design — which *is* correct behavior but must be *verified*, not assumed: a typo'd key (EN exists, `inviteDomainRevoke` emitted) shows English everywhere and the parity gate stays green on both sides.
3. **Interpolation differences:** `{domain}` in "…is not allowed for {door}" — the Dutch/German/Spanish word order puts the variable elsewhere; a translation that drops `{domain}` renders the placeholder literally or empty, and no parity scan catches it (same key count, wrong content).

**Why it happens:**
Parity scans count keys; they don't validate placeholders or rendered output. Spot-checking is done on happy-path screens, not on refusal states that only appear behind an env-gated feature.

**How to avoid:**
- Emit the refusal keys server-side through `tFor()` (established funnel), and add the new keys to the parity scan's catalogue in the same commit as the routes — the "no-French-byte" style gate pattern from v2.5 (label keys) generalizes: no refusal key ships without all-locale entries.
- A unit test per new key asserting all locales resolve AND every `{placeholder}` present in EN is present in each translation (mechanical placeholder-diff — cheap and catches the word-order drop).
- The translation spot-check phase drives the *refusal path* in the real app per locale (e.g. set `ALLOW_INVITE_DOMAINS=corp.com`, attempt an out-of-domain invite with locale=de) — screenshot the refusal toast, not just nav labels. That makes the pitfall 3/5 refusals and the locale check the same UAT flow.
- Client fallback posture is already pinned (ERR-02: unknown code → server English message): add one contract test asserting the unknown-code fallback still fires for the new keys so "missing key" degrades to readable English, never an empty toast (v1.2 decision: "No toast is ever empty").

**Warning signs:**
Spot-check limited to Settings/dashboard; new keys added to EN+FR only; any `{` count mismatch between locales in the diff.

**Phase to address:**
Maintenance/translation phase for the spot-check — but the placeholder-parity unit test belongs in the domain-admission phase's i18n task, not deferred.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline domain check per route instead of one resolver | Faster wiring | Door matrix drifts; Gitea #27457-style inconsistency; untestable cells | Never — the resolver IS the feature |
| Suffix/wildcard matching instead of exact-domain | Operators ask for `*.corp.com` | `notcorp.com` matches; seed design says exact — ambiguity | Never in v3.0; document as a future opt-in if ever needed |
| Snapshotting the allowed list onto the invite row | "Audit trail" | Accept reads the snapshot → TOCTOU hole returns | Never for the gate; a *log* line is fine |
| `_`-prefix ignore pattern for all 17 lint errors | One commit, lint green | Side-effectful initializers survive undeleted; debt re-accumulates | Only for genuine discard params, case by case |
| Skipping placeholder-parity test ("translators are careful") | Zero extra code | Broken Dutch refusal string ships; silent fallback masks it | Never — it's 10 lines |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OIDC JIT (Entra) | Gating JIT with `ALLOW_INVITE_DOMAINS` (wrong list) or blocking *login* of existing linked accounts | JIT uses the signup list (or its own resolved cell of the matrix); existing linked accounts authenticate unconditionally (OneTimeSecret stance) |
| Hardened invite-accept route | Domain check added *before* the sameOrigin/whitelist hardening so a refusals' error shape leaks whether the token exists | Keep the silent-body-whitelist posture: refusal for bad token and revoked-by-domain indistinguishable externally, keyed reason only for the legitimate holder |
| Env/config (docker-compose, Traefik stack) | `ALLOW_SIGNUP_DOMAINS=""` believed to mean "restrict" | Boot resolver tri-state + DEPLOY.md examples + startup log of the effective matrix |
| i18n parity gate | New server refusal keys only in EN+FR catalogues | All-locale parity in same commit; `tFor()` is the only emission path |
| MCP mirror | MCP invite tools forget the domain gate (v1.10 MCP has invite-like ops) | Same shared predicate; the MCP mirror is a fifth row of the door matrix |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-splitting/re-normalizing the env list on every request | Immeasurable at small scale but per-request string churn in hot invite paths | Parse once at boot; resolver reads a frozen normalized Set | Only stylistic — no real scale risk here |
| Unbounded allowlist acceptance (no validation) | Operator pastes 5,000 domains; Set is fine but the boot log floods | Cap size, log count not full list above N | Large operators |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exact-match done with `endsWith` "for robustness" | `evil-corp.com` / `notcorp.com` admitted | Strict Set membership on the canonical domain |
| No Unicode normalization before the check | Homoglyph `@`/domain bypass (GHSA-7rqj-j65f-68wh class, Critical) | NFKC normalize → reject non-ASCII domain → parse |
| Trailing dot not stripped | `corp.com.` delivered as corp.com but refused-or-missed inconsistently across doors | Strip one trailing dot in the canonicalizer |
| Refusal message lists the allowed domains | Instance policy disclosure to attackers (OneTimeSecret explicitly never reveals them) | Keyed localized refusal, generic wording; allowed list stays server-side |
| Domain check on the login path "for defense in depth" | Legitimate existing members locked out after tightening; availability incident | Admission ≠ authentication; immunity for existing accounts is a tested invariant |
| Accept-time re-validation reading a stored snapshot | List tightening defeated by pre-tightening invites | Read the live list at accept (seed-mandated fail-closed) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Generic "Invite failed" for domain refusal | Admin can't tell policy refusal from bug | Keyed localized refusal per door (`inviteDomainNotAllowed`-class) |
| Invitee gets raw English on a tightened list | Looks like a broken link | Recipient-locale `tFor()` message; suggest contacting the admin |
| No operator feedback at boot | Misconfigured list discovered via a failed invite weeks later | Startup log of the resolved door matrix (Pitfall 3) |

## "Looks Done But Isn't" Checklist

- [ ] **Canonicalization funnel:** verify exactly ONE `split('@')` call site exists; adversarial table test covers `＠`, trailing dot, case, quoted local, `notcorp.com`, whitespace-padded env entries
- [ ] **Door matrix:** every cell (JIT / signup / invite create / edit / accept / MCP) has a contract test, including both inherit directions of unset `ALLOW_INVITE_DOMAINS`
- [ ] **Existing-member immunity:** re-invite of out-of-list pre-existing member succeeds; existing SSO account of a removed domain still logs in
- [ ] **Timing:** tighten-between-create-and-accept contract test refuses with keyed reason; loosen-then-accept admits
- [ ] **Fail-closed accept:** "cannot determine list" state refuses at accept; unset/empty semantics pinned by boot-resolver tests
- [ ] **Refusal i18n:** every new key exists in en/fr/nl/de/es AND placeholder sets match across locales; unknown-key fallback shows English, never an empty toast
- [ ] **Contract suite integrity:** any pre-existing pinned test touched by the new gates was consciously re-approved, not weakened
- [ ] **Lint cleanup:** one commit per site; unit suite + e2e green per commit; no bulk `--fix`

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bypass discovered (homoglyph/trailing dot) | LOW | Fix canonicalizer, rotate/re-validate: audit accounts+invites created since the hole opened, deny/delete the rogue admissions |
| Operator lockout (existing members blocked) | MEDIUM | Correct env, restart; memberships were never deleted — access restored immediately; audit whether any invite deletes happened |
| Admitted under stale list after tightening | MEDIUM | Remove members via existing admin revocation tier (audited); consider listing `inviteDomainRevoked` audit verb |
| Lint cleanup broke a flow | LOW | `git revert` that commit; re-classify the site (side-effectful initializer) |
| Locale string broken/missing | LOW | Fix catalogue; ERR-02 fallback meant users saw English meanwhile — no data harm |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Parsing/normalization bypass | Domain-admission phase (funnel first) | Adversarial contract table green; single `split('@')` site |
| 2 Fail-open config | Domain-admission phase (boot resolver) | Env-shape test matrix; DEPLOY.md doc-parity test (v1.9 KEY-03 pattern) |
| 3 Door-matrix confusion | Domain-admission phase | Full-matrix contract tests; startup log e2e |
| 4 TOCTOU invite lifecycle | Domain-admission phase (accept re-validation) | Tighten/loosen contract tests |
| 5 Existing-flow lockouts | Domain-admission phase | Re-invite immunity + SSO-login immunity contract tests |
| 6 Lint side-effect deletion | Maintenance phase | Per-commit suite; test counts stable |
| 7 Locale silent fallback | Both (test in admission phase, spot-check in maintenance) | Placeholder-parity unit test; per-locale refusal-path UAT screenshot |

## Sources

- GHSA-7rqj-j65f-68wh — Auth.js email normalizer validated before Unicode normalization (homoglyph `@` bypass), Critical — HIGH confidence
- Birch, "HostSplit: Exploitable Antipatterns in Unicode Normalization" (BlackHat USA 2019) — HIGH confidence
- PortSwigger, "Splitting the email atom: exploiting parsers to bypass access controls" — HIGH confidence
- "Bypassing Origin Checks Using Trailing Dot Trick" (soltanali0) — MEDIUM confidence (write-up, technique sound)
- GitLab docs: Sign-up restrictions (email domain allowlist/denylist) + MR 76272 "Prevent user from bypassing domain signup restrictions" via post-signup email change — HIGH confidence
- Gitea docs: Configuration Cheat Sheet `EMAIL_DOMAIN_ALLOWLIST`/`BLOCKLIST` (registration-only semantics, wildcard support) + issue #27457 (admin registration vs allowlist) — HIGH confidence
- OneTimeSecret docs: per-install SSO `ALLOWED_SIGNUP_DOMAIN` — new-account-only semantics, distinct keyed refusals (`missing_email`/`invalid_email`/`domain_not_allowed`), never reveal allowed domains, empty-vs-unset distinction — HIGH confidence (directly citable design posture)
- Outline self-host docs: `ALLOWED_DOMAINS` restricting signups — MEDIUM confidence (third-party setup guide)
- ESLint docs + typescript-eslint #3456 ("not safe to remove random variables… side effects are everywhere"), Oxlint `no-unused-vars` (write-only/self-increment reads) — HIGH confidence
- Project context: `PROJECT.md` (seed design SEED-261119-f3w, hardened accept route HARD-01..05, D-53-2 shared validator, `tFor()` server i18n, ERR-01/02, i18n parity gates, 17 lint errors, standing gates)

---
*Pitfalls research for: v3.0 Access Control & Hardening (domain admission + maintenance debt)*
*Researched: 2026-11-19*
