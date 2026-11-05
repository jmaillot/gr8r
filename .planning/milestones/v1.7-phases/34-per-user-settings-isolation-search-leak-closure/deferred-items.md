# Phase 34 — Deferred Items

## 34-05

- **[out-of-scope, pre-existing]** `test/dependencies.test.mjs` — "the Dockerfile runtime stage stays bare node + su-exec with exactly the five COPY targets (D-12)" fails: the repo-root listing now contains `src/` but the test's expected top-level allowlist does not. Reproduced at the 34-05 base commit (3116272) — not caused by this plan. The suite is otherwise green (875 pass + the 5 new notif-hydration pins). Needs the allowlist updated in a separate fix.

  **Status: resolved (2026-11-05).** The allowlist was since extended to include `src` (line 56 comment trail: 7668ece totp.js → phase 30 oidc.js → phase 34 src/) and both D-12 tests pass on the current tree — verified by running `node --test test/dependencies.test.mjs` (2 pass / 0 fail). No code change needed now.
