# Architecture Research — Domain Admission Rules (v3.0)

**Domain:** Instance-level email-domain admission for a single-file, zero-dependency Node server (`server.js`, 8863 lines)
**Researched:** 2026-11-19
**Confidence:** HIGH (all integration points verified against the live code; prior-art cross-check MEDIUM via GitLab/Appsmith/Outline docs)

## Standard Architecture (gr8r's, as it exists today)

The relevant "architecture" is not a layer diagram — it is the guard-chain idiom every route in `server.js` already follows:

```
request → route regex match
        → sameOrigin(req)            [cross-origin first, before body read/throttle]
        → tooMany(...) throttle      [per-IP budget]
        → requireUser/requireWorkspace(minRole)  [auth + tenant pin; 404 not 403]
        → readJson(req)
        → structural validation      [emailOk, password strength, inviteRole]
        → policy/permission funnels  [validateGuestInviteShape, allowInviteGuests re-derive]
        → db write(s) in db.tx()
```

Every refusal flows through one helper: `fail(res, status, code, message, extra)` (server.js:4657) — the keyed-refusal shape the client translates via the i18n layer (ERR-01/02, decided v1.2 #7: client translates `code`, falls back to the English message).

### Component Responsibilities (what the validator must plug into)

| Existing component | Location (server.js) | Role in v3.0 |
|---|---|---|
| `ALLOW_SIGNUP` env const | :135 | The boot-time fail-absent pattern to copy: parse once at boot into a module const, feature off when unset |
| `emailOk(email)` | :671 | Structural email check that runs BEFORE any policy check — domain validation slots in right after it |
| Signup route `/api/auth/signup` | :6703 | Decision point 1 (self-serve signup) |
| Invite-create route `POST /api/workspaces/:slug/invites` | :7626 | Decision point 2 (invite create); the emails loop + `emailOk` check sits at ~:7745 |
| Invite-accept route `POST /api/invites/:token/accept` | :7852 | Decision point 3 (fail-closed accept re-validation) |
| OIDC callback `/api/auth/oidc/callback` | :5033, JIT branch ~:5120 | Decision point 4 (JIT provision `createUser` inside the `email_verified === true` branch) |
| SSO invite reconciliation (SSO-07) | ~:5155 | Implicit decision point 5 — auto-accepts a pending invite during OIDC login; must NOT silently bypass the accept-time rule |
| `tFor(locale, key, params)` + `registerCatalogue` | :61/:110 | Server-side localized strings (FR catalogue registered at boot from the same `src/locales/*.json` the client ships) |
| `validateGuestInviteShape(role, projects)` | funnel returning `{code, message}` or null | The exact shape the new domain validator should copy |

## Recommended Integration

### One shared validator, funnel-shaped (copy `validateGuestInviteShape`)

No new file, no new dependency — the whole feature is ~40 lines inside `server.js`, placed in the helper zone next to `emailOk` (:671). This respects the single-file posture exactly the way `validateGuestInviteShape`, `projectPermFor` and `memberCanReadProject` do.

```javascript
/* Boot-time parse — fail-absent: unset → null → feature off. Set-but-empty →
   empty Set → deny-all (an operator who sets the var MEANS it). Lowercase,
   trim, strip a leading '@', drop empties. Log-and-skip malformed entries
   (defensive; the regex keeps it honest). */
const parseDomainList = (raw) => {
  if (raw === undefined) return null;                 // unset → inherit / off
  const set = new Set(String(raw).split(',').map(s =>
    s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean));
  return set;
};
const SIGNUP_DOMAINS = parseDomainList(process.env.ALLOW_SIGNUP_DOMAINS);
const INVITE_DOMAINS = parseDomainList(process.env.ALLOW_INVITE_DOMAINS)
  ?? SIGNUP_DOMAINS;                                   // the inheritance rule, one line

/* Exact-domain match — no subdomain or wildcard matching (Outline precedent:
   tom@int.acme.com is denied when acme.com is allow-listed). Case-insensitive
   via lowercasing at parse AND at check time. */
const emailDomain = (email) => String(email).toLowerCase().split('@')[1] || '';

/* The funnel. Returns null when allowed, or {code, message} — the exact
   contract of validateGuestInviteShape, so every call site reads identically. */
const emailDomainRefusal = (email, list) => {
  if (!list) return null;                              // fail-absent: unset → off
  if (list.has(emailDomain(email))) return null;
  return { code: 'domainNotAllowed', message: `Sign-ups from @${emailDomain(email)} are not allowed` };
};
```

**Boot-time vs request-time: parse at boot, decide at request time.** This matches the existing `ALLOW_SIGNUP`/`SESSION_DAYS`/`INVITE_DAYS` posture (all env → module consts at :133–146). Domain sets are immutable per process; recomputing a Set parse per request is waste and creates a mid-request consistency window. Restart is the reload mechanism (same as every other env var in this app — DEPLOY.md documents restart-driven env changes). One deliberate consequence worth stating in the plan: changing the allowlist requires a server restart; that is the established operator contract for ALL env in gr8r.

### The inheritance rule (invite unset → inherit signup)

Implemented entirely in the boot consts above: `parseDomainList` returns **`null` for unset** (distinct from set-but-empty → empty Set), and `??` performs the inheritance once, at boot. Benefits:

- Every decision point tests one variable — no per-site `ALLOW_INVITE_DOMAINS ?? ALLOW_SIGNUP_DOMAINS` re-derivation to get wrong.
- "Set but empty" stays expressible as deny-all-invites-while-signup-list-is-open, which is a real operator need (freeze the invite door without closing signup).
- The unset/empty distinction is unit-testable as three pure cases (unset → off, set-nonempty → exact list, set-empty → deny all; invite unset → equals signup list).

### The 5 decision points, in order relative to existing gates

**DP-1 — Self-serve signup (`/api/auth/signup`, :6703).**
Chain: sameOrigin → `ALLOW_SIGNUP` gate → throttle → readJson → structural (name/password) → **domain check** → `createUser`. Put the domain refusal with the other 400s after `readJson`, i.e. after the password-strength check — it is a policy refusal, not a transport guard. Keyed refusal `fail(res, 400, 'domainNotAllowed', msg, { domain })` (mirrors `invalidEmail` which already passes `{ email }`).

**DP-2 — Invite create (`POST /api/workspaces/:slug/invites`, :7626).**
Chain: `requireWorkspace(..., 'member')` → sameOrigin → owner-escalation guard → `validateGuestInviteShape` → tier gates (member ceiling, `inviteGuestToggleOff`) → teams validation → emails dedupe + `emailOk` → **domain check per email** → HARD-02 admin-email-required → `db.tx()`. The natural insertion point is the existing per-email loop at ~:7745 (`if (!emailOk(email)) return fail(... 'invalidEmail', ..., { email })`) — add the domain refusal immediately after it, keyed with `{ email }`. This runs before any insert and before the invite-replacement write, so a refused batch leaves zero side effects. Note: the admin/owner `inviteAdminEmailRequired` gate runs *after* the email loop for structural reasons (empty array); domain validation of an empty array is vacuously fine, so order between them does not matter.

**DP-3 — Invite accept (`POST /api/invites/:token/accept`, :7852).**
Chain: sameOrigin → throttle → token lookup → expiry/used checks → HARD-02 admin-email gate → `validateGuestInviteShape` re-derive → **allowInviteGuests fail-closed re-derive (current-doc block, ~:7920)** → **domain fail-closed re-derive, immediately after it** → body read → account resolution → membership write. Two rules:

- **Validate the invite row's stored email** (`invite.email`), not the body — the row is the door ticket. For a link-only invite (`invite.email` null), validate the body email that the accept form submits (right after the existing `emailOk(email)` + `inviteForOtherEmail` checks in the account-creation branch, ~:7950).
- **This is the fail-closed heart of the feature** (seed: "fail-closed accept-time re-validation"): an invite minted before the operator tightened the list (or under a previous env) must die at accept without being consumed — exactly the D-50-8 pattern that already kills stale guest invites when the project toggle flips. Place it BEFORE any `createUser`/`addMembership` write so the refusal leaves no side effects, and use 403 (matching the toggle's refusal, which is a "no longer open" policy refusal, not a 400 form error).

**DP-4 — OIDC JIT provision (`/api/auth/oidc/callback` JIT branch, ~:5110–5135).**
Chain: token verify → `emailOk` → identity resolution → `email_verified === true` gate (G-30-1) → **domain check → `createUser`**. Only the *fresh provisioning* branch is gated. Do NOT gate the already-linked-identity path — the callback's own doctrine (comment at :5085–5096) is that established identities resolve without re-checking claims, "repeat logins must not break"; the same immunity logic is the seed's "existing-member immunity". Refusal shape: this route answers with browser 302s to the generic `/login?sso=error` surface (no JSON, no keyed payload — a 302 with a domain-specific query param would leak the rule to unauthenticated callers). Log server-side (`logSecurity(row-having-no-id …)` won't exist yet — use `logInfo`/`logSecurity` with the email domain, not the full address, or a plain `logInfo('sso signup domain refused: <domain>')`) and redirect to the same generic `errorRedirect()`. Optional new security verb only if the plan wants an audit line; keep the client surface generic either way.

**DP-5 — SSO invite reconciliation (SSO-07 block, ~:5155).**
This auto-accepts a pending invite during OIDC login with "the acceptance recipe VERBATIM from the accept route". Verbatim must now include the domain re-validation: check the invite's stored email against `INVITE_DOMAINS` before `addMembership`, and on refusal **consume nothing and skip that invite** (it stays pending; the existing `pendingInvites.length === 1` vs `> 1` branching already handles the "surface, don't guess" outcome — a refused single invite can either fall through to `/#invitations` or be treated as zero candidates; recommend treating it as refused: consume nothing, redirect stays whatever SSO-07 computes, since the user IS signed in and can see invitations). Simplest honest option: filter refused invites out of `pendingInvites` before the branching, so `0` → normal login, `1` → auto-accept only if in-domain, `>1` → surface. This keeps DP-5 a two-line change instead of a new redirect path.

**Note on "invite edit":** there is **no PUT/PATCH invite route today** (verified: only POST create, GET list, DELETE revoke at :7841). The only "edit" semantics that exist are the create-route's replace-a-live-link write (`update invites set used_at ... where ... used_at is null`, one live invite per address). If the seed's 5th decision point means invite *editing*, the honest reading is: (a) re-minting via create is already covered by DP-2, and (b) if a genuine edit route is added later, it must call the same validator — but do not invent a new route to host a decision point. Flag this for the planner to reconcile with the seed wording.

### Validation order relative to the named existing gates (per point)

| Gate | Signup | Invite create | Invite accept | OIDC JIT |
|---|---|---|---|---|
| sameOrigin | before | before | before | n/a (GET browser flow) |
| throttle | before | (route has none; member tier caps abuse) | before | n/a |
| auth / requireWorkspace | n/a (public) | before (member tier) | n/a (token is the credential) | n/a |
| tenant pin | n/a | via requireWorkspace | via token→workspace_id (HARD-03) | n/a (invites carry workspace_id) |
| `ALLOW_SIGNUP` master gate | before domain check | n/a | n/a | n/a |
| `email_verified` | n/a | n/a | n/a | **before** domain check |
| structural (`emailOk`, password) | before | before | before (body email) | before |
| policy funnels (guest shape, toggle) | n/a | before | before (fail-closed re-derive) | n/a |
| **domain check** | last 400 before `createUser` | with the emailOk loop, before `db.tx` | after toggle re-derive, before any write | last gate before `createUser` |
| membership/guest-toggle re-derive | — | — | before domain check (both fail-closed, toggle first) | — |

Rationale for "domain last among refusals": it depends on a parsed email, so structural checks must precede it; and it must precede ALL writes so refusals are side-effect-free everywhere (the invariant every recent hardening phase enforced).

### Existing-member immunity (where it comes for free)

The validator is only ever called at doors — DP-1..DP-5. `requireWorkspace`, `projectPermFor`, `memberCanReadProject` and the member lists never consult domain rules, so existing memberships are immune by construction. The only immunities to state explicitly in the plan: (1) OIDC repeat logins of an already-linked identity (DP-4 skip), (2) an existing account accepting an invite to a NEW workspace is NOT immune — it is a door (DP-3 applies to it; this matches Appsmith/GitLab prior art where invited users pass the signup allowlist only because the invite list is the separate, stricter list).

### Refusal keys → i18n catalogues

Reuse the v1.2-decided keyed-error flow — no new mechanism:

- Server emits stable codes via `fail()`: **`domainNotAllowed`** (signup, invite create, invite accept — one code, disambiguated by the `extra` payload `{ domain }` / `{ email }`; mirroring how `invalidEmail`/`inviteGuestToggleOff` are shared across routes). If the seed wants distinct door wording, a second code `inviteDomainNotAllowed` is the only other key needed — but one code with `{ domain }` interpolation (`t('domainNotAllowed', { domain: 'acme.com' })`) is the lighter, precedent-matching choice.
- Catalogue keys land in **all five** locale files (`src/locales/en|fr|de|es|nl.json`) in the same commit that first emits the code — the build gate (`scripts/i18n-scan.mjs`) is EN+FR-hard and the catalogues are parity-gated at 1946 keys each since v2.7, so a missing nl/de/es entry fails the gate anyway.
- Server-side localized contexts (none needed for the refusal itself — the API returns English + code; the client translates). The invite *email* sent by `MAILER.sendInvite` is unaffected: an invite to a now-forbidden domain can still be created only if the invite list allows it; if the planner wants the operator-facing DEPLOY.md wording, that is documentation, not catalogue.
- OIDC JIT refusal needs NO catalogue key (generic `sso=error` redirect, no keyed payload — see DP-4).

### Anti-patterns to avoid (grounded in this codebase's history)

1. **Validating the body email at accept instead of the invite row's email** — the row is the ticket; the HARD-02/`inviteForOtherEmail` discipline exists precisely because the body is untrusted.
2. **Subdomain/wildcard matching** — seed says exact-domain; Outline's precedent (denied `int.acme.com`) confirms operators expect exactness; wildcards also break the "one shared validator, no config language" simplicity.
3. **Request-time env re-parsing** — boot-time consts only; a mid-request env change would make the 5 decision points disagree with each other within one deploy window.
4. **A new file/module for the validator** — every comparable funnel (`validateGuestInviteShape`, `hiddenFor`, `projectPermFor`) lives in `server.js`; a new `domain-rules.js` would be the first standalone policy module and invites import-tangle for zero gain.
5. **Keyed refusal on the OIDC redirect** — the callback's fail-closed doctrine is a generic error surface; a domain-revealing query param is an oracle.
6. **Gating DP-5 (SSO auto-accept) differently from DP-3** — the code comment says "VERBATIM from the accept route"; keep it verbatim by filtering, not by writing a parallel policy.

## Recommended Build Order (dependency-driven)

1. **Parser + validator + boot consts + unit tests** — pure functions, zero route coupling. Tests pin the three-state semantics (unset/empty/list), the inheritance rule, exact-domain matching, and case-insensitivity. Everything else depends on this.
2. **Signup gate (DP-1)** — smallest consumer, public door, JSON keyed refusal; also brings the first i18n keys (`domainNotAllowed` in all 5 catalogues) so the i18n build gate stays green per commit.
3. **Invite create (DP-2)** — same validator, per-email loop insertion; tests assert zero side effects on refusal (no invite row, no replacement write).
4. **Invite accept fail-closed (DP-3)** — the re-derive block after the guest-toggle re-derive; tests must cover the stale-invite-killed-without-consumption case (the D-50-8 analog).
5. **OIDC JIT (DP-4) + SSO reconciliation (DP-5)** — last because they are redirect-surface (hardest to assert, e2e-only) and DP-5's filter depends on the DP-3 semantics being settled.
6. **DEPLOY.md + contract test sweep** — env documentation in the DEPLOY.md env table (the doc-parsing parity tests from Phase 26 pin DEPLOY.md env documentation).

Phases 2–4 are independent of 5–6 once phase 1 lands, so the milestone can parallelize if plans are split.

## Scalability / Correctness Considerations

| Concern | Assessment |
|---|---|
| Perf | Set lookup per door-crossing; negligible. No new index, no migration, no schema change. |
| Storage | None. The rule is env-declared state; invites store emails as today. |
| Cross-driver | Pure JS on the request path — identical behavior SQLite/pg (no SQL touched). |
| MCP mirror | Out of the 5 decision points, but note for the planner: `mcp.js` write tools ride the same funnels; if MCP can mint invites or provision, it inherits the rule only via the shared validator — verify during planning whether MCP has an invite/provision surface (it operates on existing members, so likely n/a). |

## Sources

- Direct code inspection of `server.js` (routes :6703, :7626, :7841–:7960; OIDC callback :5033–:5250; helpers :671, :4657; env consts :133–146; i18n :61–:110) — HIGH
- Prior art: GitLab sign-up restrictions (docs.gitlab.com/administration/settings/sign_up_restrictions), Appsmith `APPSMITH_SIGNUP_ALLOWED_DOMAINS` (docs.appsmith.com — invited users bypass, existing users unaffected), Outline `ALLOWED_DOMAINS` exact matching + admin bypass (docs.getoutline.com, outline/outline #3412) — MEDIUM (web)
