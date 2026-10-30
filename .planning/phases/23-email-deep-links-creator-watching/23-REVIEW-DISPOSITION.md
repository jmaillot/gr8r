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

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved.
