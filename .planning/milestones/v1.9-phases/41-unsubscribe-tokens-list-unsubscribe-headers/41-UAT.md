---
status: complete
phase: 41-unsubscribe-tokens-list-unsubscribe-headers
source: [41-01-SUMMARY.md, 41-02-SUMMARY.md]
started: 2026-11-05T17:20:00Z
updated: 2026-11-06T09:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass

### 2. Digest carries one-click unsubscribe headers
expected: With MASTER_KEY set and https APP_URL, a triggered digest email contains exactly `List-Unsubscribe: <https://…/unsubscribe/<opaque token>>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, positioned between Subject and Date headers. Token is a single opaque base64url path segment (no query string, no readable identifiers).
result: pass

### 3. Footer unsubscribe link renders in both MIME parts
expected: The digest email's footer shows a localized "Unsubscribe from these emails" (EN) / "Se désabonner de ces e-mails" (FR) link pointing to `/w/:slug/settings#notif-email` — visible in both the plain-text part and the HTML part, even when the headers are omitted.
result: pass

### 4. Header gates: no headers without key or https
expected: Without MASTER_KEY set (or with an http:// APP_URL), the digest email contains zero List-Unsubscribe headers — no http:// downgrade — while the footer settings link still renders in both parts.
result: pass

### 5. DEPLOY.md operator docs present
expected: DEPLOY.md §14 contains a "One-click unsubscribe (RFC 8058)" subsection documenting the two render gates, the DKIM relay-signing caveat, and MASTER_KEY rotation semantics (emailed tokens invalidated, footer link as fallback), with no LIST_UNSUBSCRIBE_POST-style env knob anywhere.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]

## Deferred Follow-Ups

- test: 2
  idea: "Étendre le désabonnement one-click aux emails de notification par type (mention, assign, comment…) — actuellement digest uniquement (Out of Scope v1.9, décision audit séparée)"
  deferred_at: 2026-11-06
