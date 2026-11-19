---
phase: 75-domain-admission-core
reviewed: 2026-11-19T00:00:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - server.js
  - mcp.js
  - domains.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/locales/de.json
  - src/locales/es.json
  - test/domain-admission.test.mjs
  - test/i18n-core-features.test.mjs
  - docs/DEPLOY.md
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 75: Code Review Report

**Reviewed:** 2026-11-19
**Depth:** deep (cross-file: server.js ↔ domains.js ↔ mcp.js call chains, full accept-handler trace)
**Files Reviewed:** 11
**Status:** issues_found

## Summary

The shared canonicalizing funnel (domains.js) is solid where it counts: exact `Set.has` membership (no `endsWith`/suffix path exists anywhere), NFKC before the last-`@` split (U+FF20 and fullwidth-dot separators handled), strict `raw === undefined` tri-state with `??` inheritance, boot-frozen Sets shared by both server and MCP imports, and the accept re-derivation uses the ROW's email (never a stored/resolved domain). All 5 locales carry the 3 new keys; the MCP door composes the same `emailDomainRefusal` export — no reimplemented matching.

However, the DP-3 accept gate has a **real bypass**: an already-authenticated user accepting a **link-only** (null-email) invite skips both DP-3 gates entirely. Secondary issues: malformed non-empty list entries are silently accepted into the allowlist (silent dead doors), and email identity normalization is inconsistent between the signup and invite storage paths.

## Critical Issues

### CR-01: DP-3 invite door is bypassed when a logged-in user accepts a link-only invite

**File:** `server.js:7973-7987` (user resolution + `if (!user)` branch; gate at `7954-7959` and `7982-7987`)
**Issue:** The accept handler resolves `let user = session && (!invite.email || session.email === invite.email) ? session : null`. For a **link-only invite** (`invite.email` is null), ANY authenticated session satisfies the first disjunct, so `user` is set and the entire `if (!user)` block — which contains the ONLY link-only DP-3 gate (`linkRefusal` against `user`'s body email) — is skipped. The row-level gate at 7954 is also skipped because it requires `invite.email`. Net effect: a session whose email is **outside** `ALLOW_INVITE_DOMAINS` accepts the link and gains workspace membership (`addMembership`), the project grant (`ensureMember`/`p.members.push`), and the invite's role/teams — with zero domain check anywhere on the path. This defeats DOM-04/D-07 ("a null-email invite is a live ticket for WHOMEVER holds the link" — apparently only for account-less holders) and the door contract that `ALLOW_INVITE_DOMAINS` governs who can be invited in. The tests cover the no-session create path (`test/domain-admission.test.mjs:487-510`) but never the session-holder path.

**Fix:** Gate on the RESOLVED user's email for every accept path, before any membership write:

```js
// after `user` is resolved (session or freshly created), before addMembership:
if (INVITE_DOMAINS && user) {
  const acceptRefusal = emailDomainRefusal(user.email, INVITE_DOMAINS, 'inviteDomainNoLonger', 'This invite can no longer be accepted');
  if (acceptRefusal) return fail(res, 403, 'inviteDomainNoLonger', acceptRefusal.message);
}
```
This also lets the existing `if (!user)` linkRefusal block be dropped (the fresh user's email was just gated by `createUser`-path logic — keep one gate, one rule). Add a regression test: link-only invite + authenticated session whose email is off-list → 403, invite row still pending.

## Warnings

### WR-01: Malformed non-empty list entries are silently admitted to the allowlist (silent dead doors)

**File:** `domains.js:38-45`
**Issue:** D-05 warn-and-clean only fires for entries that canonicalize to EMPTY (`''`, whitespace). Entries like `@example.com`, `.example.com`, `example .com`, `example.com..`, or `＠example.com` (fullwidth at-sign) are NFKC'd/trimmed and inserted into the Set verbatim — they can never match any email domain (`Set.has` is exact), so the operator's door is silently a much tighter (or fully dead) allowlist with no warning at boot. Fail-closed, but undiagnosable: the D-06 boot log will happily print the broken entries as if they were valid domains.

**Fix:**
```js
const DOMAIN_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
// after canonicalizeDomain, non-empty:
if (!DOMAIN_SHAPE.test(domain)) {
  console['warn'](`${name}: dropping invalid entry "${entry}" (warn-and-clean, D-05)`);
  continue;
}
```
Then the D-06 boot line reflects what is actually enforced.

### WR-02: Email identity normalization is inconsistent between storage paths (duplicate accounts / string-mismatch refusals)

**File:** `server.js:6725-6728` (signup: NFKC→trim→lowercase) vs `server.js:7753-7759` and `mcp.js:941-942` (invite-create: trim→lowercase only)
**Issue:** The signup path NFKCs the email before `createUser` stores it; the invite-create paths (server DP-2 and MCP invite_member) do NOT — an email with fullwidth characters in the LOCAL part (e.g. `usér@…`, or a fullwidth dot like `a。b@example.com` which passes `emailOk`'s `[^\s@]+` classes) is stored verbatim. Domain MATCHING is still correct (`emailFromEmail` NFKCs before the split), so there is no admission bypass — but the same person can end up with two stored identities (`usér@…` via invite vs `user@…` via signup), and the accept-time string compare `invite.email !== email` (`server.js:7980`) is raw, so an account created via signup with the NFKC'd form cannot string-match a stored invite carrying the non-NFKC form → `inviteForOtherEmail` 400 on a legitimately identical address.

**Fix:** Apply the same `String(e||'').normalize('NFKC').trim().toLowerCase()` in the DP-2 `emails` normalization (`server.js:7756`) and in `mcp.js` before the regex, so every stored identity is NFKC-canonical like signup.

## Info

### IN-01: DP-1 runs before any email-shape validation, so door-on signups of malformed emails report the wrong error key

**File:** `server.js:6733-6737`
**Issue:** Signup has no `emailOk` check before DP-1; with the door ON, an email like `foo` (no `@`) gets `signupDomainNotAllowed` ("outside the domains allowed") instead of `enterValidEmail` — misleading keyed refusal, and the domain gate is the de-facto shape check. With the door OFF, `createUser` still rejects (`enterValidEmail`), so no bypass — purely error-contract inconsistency.
**Fix:** Move an explicit `emailOk(email)` check ahead of DP-1 (mirroring the invite-create loop), or accept and document the keyed-refusal difference.

### IN-02: Boot warning path bypasses the structured log pipeline and uses odd bracket notation

**File:** `domains.js:41`
**Issue:** `console['warn']` writes raw stderr while every other boot message goes through `logWarn`/`logLine` (structured, timestamped). The D-05 observable won't appear in `docker logs` with the same shape as other boot lines, and the bracket syntax reads as a lint/i18n-scanner dodge without an explanatory comment.
**Fix:** Either route through the server's `logWarn` (pass a logger into `parseDomainList`) or comment why the raw `console.warn` is intentional.

### IN-03: Boot log "source" tag re-derives the tri-state instead of the module exposing the resolved source

**File:** `server.js:8898`
**Issue:** `'ALLOW_INVITE_DOMAINS' in process.env ? 'own' : 'inherit'` duplicates the inheritance decision that `domains.js` already owns (`?? SIGNUP_DOMAINS`). If the inheritance rule ever changes (e.g. inherit only when signup door is on), the log will silently lie while the actual Set is correct. Also `SIGNUP_DOMAINS` always logs `own` — correct today, but another hardcoded assumption.
**Fix:** Export a `SOURCE = { signup: 'own', invite: 'ALLOW_INVITE_DOMAINS' in process.env ? 'own' : 'inherit' }` (or a `resolveSource(name)`) from `domains.js` and log that.

## Verified mitigations (claimed vs actual)

- **No suffix/endsWith matching** — confirmed: the only membership check is `domains.has(domain)` (`domains.js:61`); no substring/suffix code exists in the diff.
- **NFKC before last-`@` split** — confirmed (`domains.js:22-28`); fullwidth `＠` and fullwidth full-stop both canonicalize before the trailing-dot strip.
- **Stale stored domain not trusted** — confirmed: DP-3 re-derives from `invite.email` (the raw email column), never a stored/resolved domain; refusal is before any write and non-consuming (the `used_at` update happens only after all gates).
- **MCP door parity** — confirmed: `mcp.js:948` calls the same exported `emailDomainRefusal` with the same boot-frozen `INVITE_DOMAINS` Set (same module instance via shared import).
- **Tri-state semantics** — confirmed: strict `raw === undefined` in `parseDomainList` (`domains.js:33`); set-empty → empty Set (deny-all); `??` inheritance only fires on `null`. The D-06 source tag correctly uses `in process.env`, not truthiness.

---

_Reviewed: 2026-11-19T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
