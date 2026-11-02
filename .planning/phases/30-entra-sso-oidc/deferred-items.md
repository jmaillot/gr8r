# Deferred items — phase 30

- [pre-existing] test/dependencies.test.mjs D-12 row fails at plan-30-06 start: Dockerfile runtime stage copies oidc.js (added in commit 59ce617 because server.js imports it) but the test's five-COPY allow-list was never extended. Unrelated to G-30-1; left untouched per scope boundary. Recorded in 30-06-SUMMARY.md.
- [resolved 2026-11-02] D-12 fixed at regression gate (commit 75f21bb): oidc.js added to the test's COPY allow-list; dependencies suite green. REVIEW.md WR-01 → resolved.
