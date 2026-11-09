---
phase: 53-member-project-experience
review: REVIEW.md
reviewed: 2026-11-09
critical: 1
warning: 3
info: 3
---

# Phase 53 — Review Disposition

One row per finding in REVIEW.md. Default disposition: `open` — a triaged finding is
distinguishable downstream from a forgotten one.

| ID | Severity | Finding | Disposition | Notes |
|----|----------|---------|-------------|-------|
| CR-01 | critical | Per-team content-write gate bypassable: keyed on incoming row's `project`, `mergeList` replaces rows wholesale; omitted project passes gate; re-pointing `project` rewrites view-only content ("move" without source check). Fix: gate on `prev?.project \|\| t.project`, fail closed, pin with perm.test row | open | Gate built by 53-01 itself — in-phase defect |
| WR-01 | warning | `submitProject` edit branch lacks snapshot/pushNow/409 conflict honesty (Access-tab handlers have it; General tab toasts success before debounced push settles) | open | Consistency gap in 53-03's unified modal |
| WR-02 | warning | 11 red e2e at close-out labelled "pre-existing" but bisect baseline (6e90e59) is post-53-03/53-04 — flows share-modal/creation ×4 are in-phase regressions deferred rather than fixed | open | Conflicts with 53-05 SUMMARY claim; owed before milestone close |
| WR-03 | warning | Admins can mint guest invites to `allowInviteGuests=false` projects (201 + shareable link) that 403 on every accept — dead-on-arrival invites, fail-closed but misleading | open | Validator gap in 53-02 |
| IN-01 | info | Duplicated `PROJECT_PERMS`/`PERMS` literals with no drift guard | open | |
| IN-02 | info | `toast.permChanged` leaks raw English perm value in FR | open | |
| IN-03 | info | `JSON.stringify`-based change detection is key-order sensitive (fails safe) | open | |
