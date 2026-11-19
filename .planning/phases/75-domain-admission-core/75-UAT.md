---
status: complete
phase: 75-domain-admission-core
source: [75-01-SUMMARY.md, 75-02-SUMMARY.md]
started: 2026-11-19T13:32:43Z
updated: 2026-11-19T14:25:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state. Start the application from scratch. Server boots without errors, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass

### 2. Signup domain gate
expected: With ALLOW_SIGNUP_DOMAINS set to a list (e.g. `a.com,b.com`), signing up with an email on another domain is refused with a generic refusal message (code signupDomainNotAllowed); signing up with an allowed-domain email succeeds.
result: pass
reported: "you need to update .env.example for that"
resolved: fixed inline during UAT (commit 5c08866f) — .env.example now documents both vars; re-verified pass after deploy

### 3. Unset variable fail-open
expected: With ALLOW_SIGNUP_DOMAINS unset, signup behaves exactly as before this phase — any structurally valid email is admitted (fail-open).
result: pass
reported: "Node.js cold start: ERR_MODULE_NOT_FOUND Cannot find module '/app/domains.js' imported from /app/mcp.js (Docker production image)"
resolved: fixed inline during UAT (commit beaecfd1) — Dockerfile copies domains.js; re-verified pass after image rebuild

### 4. Empty list deny-all
expected: With ALLOW_SIGNUP_DOMAINS set to an empty value, ALL signups are refused, regardless of email domain.
result: pass

### 5. Canonicalization (case, trailing dot, fullwidth)
expected: Emails that canonicalize into an allowed domain are admitted: `User@A.COM.`, fullwidth ＠ (user＠a.com), and U+FF0E fullwidth dot variants all sign up successfully like their ASCII equivalent.
result: pass

### 6. No suffix / subdomain bypass
expected: With list `a.com`: `evil-a.com` and `sub.a.com` emails are refused — matching is exact, never suffix-based.
result: pass

### 7. Boot logs and warn-and-clean
expected: On boot, source-tagged log lines show the resolved lists (`domains: ALLOW_SIGNUP_DOMAINS: ... (source: own|inherit)`); malformed list entries (empty/whitespace) log a warning at boot but the server still starts.
result: pass

### 8. Refusal localized in 5 locales
expected: The signup refusal message renders in the active UI language (en/fr/nl/de/es) — each locale has the err.signupDomainNotAllowed key.
result: pass

### 9. Invite-create per-email gate (DP-2)
expected: With ALLOW_INVITE_DOMAINS set, creating invites for an out-of-list email is refused per-email (code inviteDomainNotAllowed) and the batch leaves zero invite rows; in-list emails are inserted normally. (Auto-covered by passing integration tests D1/D2.)
result: pass
source: automated
coverage_id: D1

### 10. Invite-door tri-state
expected: Unset ALLOW_INVITE_DOMAINS inherits the signup list; explicit '' denies all invites; own list stands alone.
result: pass
source: automated
coverage_id: D2

### 11. MCP invite_member fourth door
expected: MCP invite_member uses the same funnel — in-list inserts, out-of-list refuses, fullwidth ＠ refused like the UI door. (Auto-covered, D3.)
result: pass
source: automated
coverage_id: D3

### 12. Accept fail-closed re-derivation (DP-3)
expected: A pending invite refused after the list tightens keeps its row (non-consuming) and is revived by loosening; the row email is validated even when the body carries an in-list email; link-only invites re-derive before createUser. (Auto-covered, D4.)
result: pass
source: automated
coverage_id: D4

### 13. One door, one rule (SC3 gmail scenario)
expected: An invited gmail user accepts and logs in; the same email can never self-register. Accept path admits b.com in a process where signup refuses b.com. (Auto-covered, D5.)
result: pass
source: automated
coverage_id: D5

### 14. Cross-door parity (T-75-16)
expected: MCP and UI invite-create doors agree on every adversarial row. (Auto-covered, D6.)
result: pass
source: automated
coverage_id: D6

### 15. Locale catalogues (D7)
expected: err.inviteDomainNotAllowed and err.inviteDomainNoLonger present in all 5 locales; error-codes extraction gates green. (Auto-covered, D7.)
result: pass
source: automated
coverage_id: D7

## Summary

total: 15
passed: 14
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-75-4
  truth: "ALLOW_SIGNUP_DOMAINS set-but-empty denies all signups even under docker compose"
  status: resolved
  resolved_by: inline fix during UAT — docker-compose.yml now passes .env via env_file (commit 65f94703)
  resolved_at: 2026-11-19
  reason: "User reported: with ALLOW_SIGNUP_DOMAINS= empty, signup still succeeded (env var never reached the container, undefined = fail-open)"
  severity: major
  test: 4
  artifacts:
    - path: "docker-compose.yml"
      issue: "explicit environment: allowlist never passed the new domain vars; ${VAR:-} interpolation would also coerce unset to empty (deny-all), so env_file is required"
  missing:
    - "env_file: .env on the projects service"

- gap_id: G-75-2
  truth: "With ALLOW_SIGNUP_DOMAINS set to a list, out-of-list signups are refused and allowed-domain signups succeed"
  status: resolved
  resolved_by: inline fix during UAT
  resolved_at: 2026-11-19
  reason: "User reported: you need to update .env.example for that"
  severity: major
  test: 2
  artifacts: []
  missing: []

- gap_id: G-75-3
  truth: "Server boots in the production Docker image (cold start smoke test)"
  status: resolved
  resolved_by: inline fix during UAT — Dockerfile now copies domains.js (commit beaecfd1)
  resolved_at: 2026-11-19
  reason: "User reported: ERR_MODULE_NOT_FOUND /app/domains.js in Docker container"
  severity: blocker
  test: 3
  artifacts:
    - path: "Dockerfile"
      issue: "production stage copies root JS files individually; domains.js omitted"
  missing:
    - "COPY --from=build /app/domains.js ./domains.js"

## Deferred Follow-Ups

- test: 4
  idea: "Wildcard '*' = allow-all for the domain doors — implemented inline during UAT (commit 968a475): parseDomainList resolves a lone '*' to a wildcard list, emailDomainRefusal admits everything, mixed '*,x.com' stays an exact allowlist, boot log prints '*'. Documented in .env.example"
  deferred_at: 2026-11-19
