# Feature Research

**Domain:** Instance-level domain admission rules for a self-hosted PM workspace (v3.0 Access Control & Hardening)
**Researched:** 2026-11-19
**Confidence:** HIGH for verified prior art (GitLab/Gitea official docs fetched directly); MEDIUM/LOW where noted (Mattermost/Outline/Authelia from model knowledge — search infrastructure was rate-limited; flag for phase-specific re-verification)

> Scope note: the seed design (two env vars, door matrix, unset-inherits, fail-closed accept-time re-validation, existing-member immunity, exact-domain matching, keyed localized refusals) is owner-validated and NOT re-litigated here. This file maps the feature landscape around it, with complexity and dependencies on the existing Phase 30 (OIDC JIT), Phase 33 (hardened accept route) and Phase 50 (invite refusals) code.

## Feature Landscape

### Table Stakes (Users Expect These)

What comparable self-hosted products treat as the baseline for domain admission.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Allowlist gates new doors, never existing accounts | GitLab documents this explicitly: restrictions apply "only during new account creation by an external user"; admins can add disallowed-domain users, and users can later change their email to a disallowed domain. Gitea's `EMAIL_DOMAIN_ALLOWLIST` applies to registration only. | LOW | gr8r plan already states "existing accounts never touched". Implement as pure gate functions at the door matrix points; no membership scan, no migration. |
| Comma-separated env-var list, tolerant parsing | Gitea: comma-separated list. GitLab accepts whitespace/semicolon/comma/newline. Operators copy-paste lists from mail/notes; whitespace and empty entries (`a.com,,b.com`, `a.com, ,b.com`) are routine. | LOW | Parse at boot once: split on `,`, trim each entry, drop empties, lowercase both sides at comparison time (see edge cases below). Tolerant parsing is table stakes; strict parsing produces "why is my list ignored?" bug reports. |
| Case-insensitive matching | Email domains are case-insensitive per RFC 5321 (`User@EXAMPLE.com` == `user@example.com`). Every comparable implementation normalizes case; none treat `Example.com` and `example.com` as different entries. | LOW | Lowercase the parsed list once at boot; lowercase the email's domain part at check time. Do NOT lowercase the local part. |
| Exact-domain matching as the default semantics | No major product silently admits `sub.example.com` when `example.com` is allowed — wildcard admission is opt-in syntax (`*.company.com` in GitLab and Gitea), never implicit. | LOW | Matches the seed ruling. Compare the email's domain string exactly against the list; document that subdomains must be listed explicitly. |
| Localized refusal to the person at the door | Comparable products return a specific error at signup ("email domain not allowed" class) rather than a generic failure. gr8r has the ERR-01 keyed-code precedent plus Phase 50 keyed invite refusals — this is the established house pattern. | LOW | New leaf i18n keys in all 5 catalogues (EN base; full nl/de/es catalogues exist since v2.7, parity-gated). Server returns a stable code; client translates; unknown codes fall back to the English message (ERR-02). |
| Fail-closed behavior when state changed between invite and accept | The hardened Phase 33 accept route and the Phase 50 guest re-derivation already establish the fail-closed-at-accept pattern; operators of self-hosted tools expect policy re-checked at use time, not just at issue time. | MEDIUM | Re-validate `invite.email` (and the body email when creating a new account) against the invite list inside the accept route, after the existing guest-shape re-derivation block and before any account/membership write. |
| Unset variable = feature off (no behavior change) | Every env-based allowlist in this class (Gitea `EMAIL_DOMAIN_ALLOWLIST: **empty**`, Outline, Authelia) is a no-op when unset. | LOW | Empty/whitespace-only value should also be treated as "feature off" (an operator setting the var but leaving it blank must not lock everyone out). A explicitly-set-but-every-entry-invalid value is a boot-time warning, not a lockout. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Two independent doors (signup list vs invite list) with unset-inherits | GitLab/Gitea/Mattermost have ONE domain knob; separating self-serve admission from admin-mediated admission is finer-grained than any of them. Admins can invite contractors from outside the company while signup stays company-only. | LOW (already the validated design) | Implementation is one extra parse + a validator parameterized by which list applies. Inheritance resolved at boot: `ALLOW_INVITE_DOMAINS` unset → use the signup list; set (even empty after cleaning) → use as-is. Decide and document set-but-empty = deny-all-invites vs inherit; recommend set-but-empty = explicit deny-all (the operator wrote the var deliberately). |
| Zero-dependency, env-only configuration | Outline and Mattermost put domain restriction behind admin-UI or SSO-provider settings; a pure env var matches gr8r's zero-runtime-dependency constraint and Docker/DEPLOY.md posture. | LOW | No config table, no migration, no admin UI. Boot-parsed constants following the existing `ALLOW_SIGNUP` pattern. |
| Exact-domain (no wildcard syntax) | GitLab/Gitea accept wildcards; supporting `*.corp.com` invites regex-adjacent parsing, IDN-wildcard interactions, and confusion about whether bare `corp.com` also matches. Exact matching keeps the validator ~10 lines and auditable. | LOW | Anti-differentiator on purpose: document "no subdomain matching" in DEPLOY.md and the refusal copy if feasible. |
| Refusal at the earliest door point (invite CREATE, not just accept) | Comparable products validate at account creation only; gr8r can refuse at invite create/edit so the admin learns immediately that the email is inadmissible — better UX than a silent invite that fails at accept. | LOW | New check in the invite create route next to the existing email-shape check (Phase 50 keyed-refusal precedent, e.g. `invalidEmail` with `{email}` extra). Also covered at accept per fail-closed ruling. |
| OIDC JIT admission consistent with password signup | GitLab gates SSO signups under the same allowlist; gr8r's Phase 30 JIT provisioning is a signup door and should honor `ALLOW_SIGNUP_DOMAINS` — many self-hosted tools forgot the SSO door and had to retrofit (Mattermost's domain restriction applies to email signup but SSO behavior historically needed separate configuration). | MEDIUM | Gate the JIT provision branch (bare-account creation) in the OIDC callback after the existing `emailOk` + verified-email checks. Existing linked accounts keep logging in (immunity). Refusal is a browser redirect surface, not JSON — reuse the existing OIDC error-redirect pattern. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Subdomain wildcards (`*.example.com`) | "Our subsidiaries have subdomains" | Adds parser complexity, IDN interactions, ambiguity with bare-domain entries; GitLab/Gitea needed wildcards only because they also have denylists/regex use-cases gr8r doesn't | Exact-domain matching; operators list the subdomains explicitly (seed ruling) |
| Admin-UI editable allowlist | "Nicer than editing docker-compose" | Needs a config table, migration, cache invalidation, admin permission surface — violates the zero-migration/env-only posture of this milestone | Env vars documented in DEPLOY.md; change = restart |
| Denylist in addition to allowlist | Spam blocking | Doubles the decision matrix (allow∧deny interactions, precedence debates); gr8r is private-workspace oriented, not open-registration | Allowlist only; an unset allowlist = open door remains the operator's choice |
| Retroactive enforcement against existing members | "Kick out people whose domain changed" | Breaks the owner-validated "existing accounts never touched" ruling; GitLab explicitly does NOT retro-enforce either | Immunity for existing accounts; policy applies only at doors |
| Per-email validation beyond the domain (MX checks, disposable-email lists) | Anti-spam | Network calls in the signup path, external list dependencies, nondeterministic failures | Exact domain list; refuse fast and locally |

## Feature Dependencies

```
[Env parsing + validator (shared module)]
    └──requires──> nothing new (node built-ins only)

[Signup gate (ALLOW_SIGNUP_DOMAINS)]
    └──requires──> [Env parsing + validator], [i18n keys]

[Invite create/edit gate (ALLOW_INVITE_DOMAINS, inherit)]
    └──requires──> [Env parsing + validator], [Phase 50 keyed-refusal pattern]

[Fail-closed accept-time re-validation]
    └──requires──> [Env parsing + validator], [Phase 33 hardened accept route]

[OIDC JIT admission gate]
    └──requires──> [Env parsing + validator], [Phase 30 JIT branch]

[i18n localized refusals] ──enhances──> all four gates
```

### Dependency Notes

- **All gates require the shared validator:** one module (e.g. `parseDomainList()` + `domainRefusal(email, list, kind)`) used by signup, invite create, accept and OIDC JIT. D-50-2's lesson applies: one shared validator, not per-route logic.
- **Accept re-validation requires the Phase 33 route structure:** it slots into the existing re-derivation block after token/expiry checks, before account creation or membership writes.
- **OIDC JIT gate depends on Phase 30's verified-email ordering:** the check must run after `email_verified` is established (a provider-supplied unverified email must not satisfy the allowlist).
- **i18n keys land with the first gate:** the i18n-scan build gate fails any uncatalogued literal, so refusal keys must be added (all 5 catalogues) in the same phase as the first user-facing refusal.

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] Shared env parser + exact-domain validator (tolerant parsing, lowercase, drop empties, boot warning for invalid entries) — the single source of truth
- [ ] `ALLOW_SIGNUP_DOMAINS` gate on self-serve signup — simplest door, no dependencies
- [ ] `ALLOW_INVITE_DOMAINS` gate on invite create (and edit if a PUT path exists) with unset-inherits — Phase 50 keyed-refusal pattern
- [ ] Fail-closed re-validation at accept — the owner-validated security invariant
- [ ] OIDC JIT gate — closes the second signup door; without it the feature is bypassable via SSO
- [ ] Keyed localized refusals in all 5 catalogues — table stakes + build-gate requirement
- [ ] DEPLOY.md section documenting the door matrix, exact-domain semantics and edge-case parsing

### Add After Validation (v1.x)

- [ ] Boot log summarizing the effective door matrix (which doors are gated, inherited lists resolved) — trigger: operator confusion reports
- [ ] Allowlist-aware admin UI hint in the invite modal — trigger: admins complaining about refused invites

### Future Consideration (v2+)

- [ ] Wildcard support — only if a real operator asks; exact matching is the documented contract
- [ ] Per-workspace domain lists — current need is instance-level only

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shared validator + env parsing | HIGH | LOW | P1 |
| Signup gate | HIGH | LOW | P1 |
| Invite create gate + inheritance | HIGH | LOW | P1 |
| Accept-time fail-closed re-validation | HIGH | MEDIUM | P1 |
| OIDC JIT gate | HIGH | MEDIUM | P1 |
| Localized refusals (5 catalogues) | MEDIUM | LOW | P1 |
| Boot-time door-matrix log | LOW | LOW | P3 |
| Wildcards / per-workspace lists | LOW | HIGH | P3 |

## Competitor Feature Analysis

| Feature | GitLab (self-managed) | Gitea | Mattermost* | Outline* | gr8r v3.0 plan |
|---------|----------------------|-------|-------------|----------|----------------|
| Allowlist + denylist | Both (admin UI) | Both (env) | Allowlist only (admin UI) | Allowlist via SSO domain config | Allowlist only (env) |
| Wildcards | Yes (`*.company.com`) | Yes | Yes (documented) | Provider-dependent | No (exact, deliberate) |
| List separators | whitespace / semicolon / comma / newline | comma | comma | n/a | comma, tolerant of whitespace/empties |
| When enforced | Account creation only; admin adds + later email changes bypass | Registration only | Signup (+ email-change in recent versions) | SSO account provisioning | All doors: signup, invite create, accept (fail-closed), OIDC JIT; existing accounts immune |
| SSO door covered | Yes (same restriction) | Partially (external registration flag separate) | Historically separate config | Via provider domain restriction | Yes, via JIT gate |
| Refusal feedback | Error at signup form | Registration error page | Form error | Provider-level error | Keyed localized refusal (toast/form), 5 languages |
| Case sensitivity | Normalized | Not documented* | Normalized* | n/a | Normalized both sides |

\* Mattermost/Outline rows from model knowledge (docs unreachable during research — search rate-limited); confidence LOW/MEDIUM. GitLab and Gitea rows verified directly against official docs on 2026-11-19.

## Edge-Case Behavior Recommendations

Concrete recommended behavior per edge case (these are recommendations, to be ratified at phase planning — not owner-validated rulings):

| Edge case | Recommendation | Rationale |
|-----------|----------------|-----------|
| Case sensitivity | Lowercase list entries at boot; lowercase the email's domain part at check; keep local part untouched | RFC 5321 domains are case-insensitive; matches competitor normalization |
| Trailing dot (`example.com.`) | Normalize: strip one trailing dot from list entries AND from the checked domain before comparing | FQDN vs relative form ambiguity; a trailing dot is never a distinct registrable domain |
| IDN / Unicode domains | No IDN conversion in the validator (zero-dep); if the env var contains Unicode, normalize with the IDN-mapped form being the operator's responsibility — document in DEPLOY.md; the check compares the email's raw domain string | `URL.parse()` / `URLDomainToASCII` exist in Node but adding IDNA semantics invites homograph confusion; document punycode (`xn--…`) as the canonical entry form |
| Empty entries in comma lists (`a.com,,b.com`) | Dropped silently at parse | Tolerant parsing is table stakes; empty string must never become "match nothing" or "match everything" |
| Whitespace (` a.com , b.com`) | Trimmed at parse; list-level whitespace around commas tolerated | GitLab accepts multiple separators for exactly this reason |
| Whitespace INSIDE an entry (`ex ample.com`) | Invalid entry → boot-time warning + dropped (do NOT silently keep as an unmatchable literal) | An unmatchable literal entry = silent policy hole; loud boot warning surfaces typos |
| Entire list invalid / set-but-empty-after-clean | Warning + treated as... decision point: recommend "deny-all" for explicitly-set-but-empty (deliberate), "feature-off" for unset/whitespace-only | Distinguishes "operator wrote nothing" from "operator wrote an empty deny-all" |
| Multiple email domains per user | Irrelevant at gr8r's doors — each door sees exactly one email (signup email, invite email, OIDC verified email). No per-user multi-domain concept exists | GitLab-style "user later changes email to a disallowed domain" is accepted behavior in gr8r too: existing-account immunity covers it |
| Sub-addressing (`user+tag@domain`) | Transparent: domain check reads only the part after the LAST `@`; `user+tag@example.com` matches allowlist entry `example.com` | Domain-level checks are inherently sub-address-agnostic; do NOT strip or reject `+tag` — that's an email-shape concern already handled by the existing email validation |
| Email with no `@` / multiple `@` | Refused by the existing email-shape check BEFORE the domain check runs (ordering matters) | Keeps the domain validator simple; ordering: shape check → domain check |
| Bare domain in email (`user@localhost`, `user@internal`) | Valid domain string for matching purposes — if `localhost` is on the allowlist it passes | Don't add registrable-domain (PSL) logic; zero-dep and deterministic |

## Admin-facing feedback in comparable products (when an invite/signup is refused)

- **GitLab:** the signup form rejects inline with a domain-specific validation error; the admin sees nothing special (no per-refusal audit). Admin-facing feedback is limited to the settings UI itself.
- **Gitea:** registration fails with a generic error page; the admin learns from the log, not from structured feedback.
- **Mattermost:** inline form error at signup; admins get no refusal event stream.
- **Pattern conclusion (MEDIUM confidence):** inline, immediate, user-facing refusal at the door is table stakes; server-side admin telemetry (audit verbs, boot logs) is the differentiator. gr8r already has the audit-verb infrastructure (Phase 24) — a `signup_domain_refused`-class activity verb at invite-create refusals would exceed competitor practice at LOW cost; recommend as optional polish (P3), not MVP.
- **For gr8r specifically:** the admin who creates the invite gets the keyed refusal toast immediately at invite create (better than GitLab/Gitea, which only check at account creation). The invitee gets the localized refusal at accept if the list changed between create and accept (fail-closed) — this asymmetry should be documented in DEPLOY.md so admins aren't surprised.

## MVP Recommendation

Prioritize:
1. Shared env parser + exact-domain validator (single funnel, D-50-2 pattern)
2. The four doors in order: signup → invite create → accept (fail-closed) → OIDC JIT
3. Keyed localized refusals in all 5 catalogues

Defer: wildcards, per-workspace lists, denylists, admin-UI editing, refusal-audit verbs (P3, none block the milestone).

## Sources

- GitLab "New user account restrictions" — https://docs.gitlab.com/administration/settings/sign_up_restrictions/ (fetched 2026-11-19; allow/denylist, wildcards, separators, creation-time-only enforcement — HIGH confidence, direct read)
- Gitea Configuration Cheat Sheet — https://docs.gitea.com/administration/config-cheat-sheet (`EMAIL_DOMAIN_ALLOWLIST`/`EMAIL_DOMAIN_BLOCKLIST`, comma-separated, wildcard supported — HIGH confidence, direct read)
- Outline `.env.sample` — https://github.com/outline/outline (SSO-provider env vars inspected; domain restriction via provider config — MEDIUM confidence)
- Mattermost configuration docs — unreachable during research (404s/rate limits); `RestrictCreationToDomains` behavior from model knowledge — LOW confidence, re-verify at phase research if load-bearing
- Authelia sub-addressing semantics — model knowledge — LOW confidence
- gr8r internal: PROJECT.md (Phases 30/33/50 records), existing email-shape and keyed-refusal patterns — HIGH confidence
