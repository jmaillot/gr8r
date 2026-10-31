# Phase 23: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | Guard verified in live code (src/main.js:134 `if (key)`) — reconciled per verifier cross-check |
| HIGH-01 | warning | open | go() pushes duplicate history entries for same-URL navigations |
| MED-01 | warning | open | Logged-out ?next= carry drops the original query string |
| MED-02 | warning | open | popstate/deep-link task keys are not percent-decoded before lookup |
| LOW-01 | info | open | urlForView local t shadows the i18n t import; stale eslint-disable |
| LOW-02 | info | open | Locale key indentation inconsistency in en.json |
| LOW-03 | info | open | withAcmeDoc retry loop can exhaust attempts silently; attempts magic number |

## Gap-closure review (2026-10-31, 23-05 + 23-06)

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| IN-G1 | info | open | bare /w/:slug/team rewritten to /teams via replaceState on boot — intentional, URL-bar mutation only (src/main.js:187) |
| IN-G2 | info | open | team/member id match case-sensitive vs case-insensitive key find convention split (src/main.js:181) |
| IN-G3 | info | open | authority-map query runs even when no email can be sent; cheap early-return possible (server.js:709-713) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved.
