---
phase: 43-workspace-logo
plan: 03
subsystem: workspace-logo
tags: [gap-closure, uat, email, deployment]
requires: ["43-01", "43-02"]
provides: ["remove-logo wiring (A.removeLogo click alias)", "wiring regression test", "G-43-3 closed", "G-43-4 closed"]
affects: [digest-email, workspace-settings]
tech-stack:
  added: []
  patterns: ["click-namespace alias registration (data-a → A action map)"]
key-files:
  created: ["test/workspace-logo.test.mjs (client-wiring regression test)"]
  modified: ["src/actions/actions.js (A.removeLogo registration)"]
decisions:
  - "G-43-3 fixed via click-namespace alias A.removeLogo = removeLogo — no restructuring of IN/A namespaces"
  - "G-43-4 closed as deployment staleness: no source change; image rebuild + Traefik router exclusion of /w/:slug/logo from Authentik forward-auth"
  - "Forward-auth interception of the public logo route documented in SUMMARY (not DEPLOY.md) for a future docs pass"
metrics:
  duration: "resumed session; Task 1 commit 60e1b76, checkpoint G-43-4 verified by human"
  completed: 2026-11-06
  tasks: 2
  commits: 2
plan_head_before: 600a6cf
plan_head_after: 482f0b5
status: complete
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
---

# Phase 43 Plan 03: Gap Closure (G-43-3, G-43-4) Summary

**One-liner:** Wired the dead Remove-logo button via a click-namespace alias with a RED→GREEN regression test, and closed the digest-logo gap as a deployment-staleness issue (image rebuild + Traefik forward-auth exclusion of the public logo route — no source change).

## What Was Done

### G-43-3 — Remove-logo button silently no-ops (code fix)

- **Root cause:** the settings markup dispatches `data-a="removeLogo"` through the click namespace `A`, but the handler was only reachable via `IN`. The click delegation (`A[el.dataset.a]`) resolved to `undefined` → silent no-op. Server route, `api.removeLogo()`, and the adoptRevision chain were confirmed intact (not touched, per plan prohibitions).
- **Fix:** registered `A.removeLogo` as an alias to the existing handler in `src/actions/actions.js` (commit `60e1b76`).
- **Test:** `test/workspace-logo.test.mjs` — TDD wiring regression test asserting every click-dispatched action name used in settings markup resolves to a function in `A` (RED before the alias, GREEN after). Human confirmed live: the Remove logo button now functions in the app.

### G-43-4 — Digest email logo missing (deployment staleness — closed, no source change)

- **Diagnosis:** the running deployment was a stale `projects-studio:1.1.1` image predating `e893ae9`; the digest logo header never reached production.
- **Resolution (human-verified):**
  1. Docker image rebuilt on the deployment host (≥ `e893ae9`).
  2. **Infra fix:** a Traefik router was routing `/w/:slug/logo` through the Authentik forward-auth chain, so the app's **public** logo endpoint (D-02) returned an auth redirect instead of the SVG. A router exclusion now bypasses forward-auth for that path — `curl` returns `200` `image/svg+xml` with the sandbox CSP.
  3. Digest email re-triggered: the workspace logo renders above the greeting.

## Deviations from Plan

None — plan executed as written. The Traefik/Authentik finding is a deployment-level discovery, not a plan deviation: G-43-4's must-have truth explicitly stated "no code work — closed by rebuild/redeploy only." The forward-auth exclusion is the concrete form that redeploy fix took on the host.

## Deployment Finding (for future DEPLOY.md work — deliberately NOT edited here)

If the team self-hosts gr8r behind Authentik forward-auth, the **public** workspace logo route `/w/:slug/logo` must be excluded from the forward-auth chain, or digest-email clients receive a 302 to the IdP instead of the SVG. This is a Traefik-router-level exclusion on the deployment host. Note for a future docs pass; no DEPLOY.md change was made per plan scope.

## Requirements

- Plan frontmatter lists `requirements: [LOGO-01]`, but LOGO-01 has **no row in REQUIREMENTS.md** (known traceability gap — predates this plan). `requirements mark-complete` skipped; noted here for a future REQUIREMENTS.md reconciliation.

## Known Stubs

None.

## Commits (measured)

- Base (`plan_head_before`): `600a6cf`
- `60e1b76` — feat(43-3): register A.removeLogo click-namespace alias + wiring regression test (G-43-3)
- `482f0b5` — docs(43): UAT gap diagnoses (remove-logo wiring bug; digest logo stale deployment) — docs-only commit already on the branch at resume; included in the measured range
- `git rev-list --count 600a6cf..HEAD` = **2** at SUMMARY write

## Self-Check: PASSED

- SUMMARY file exists on disk.
- `src/actions/actions.js` contains removeLogo references (alias registered).
- `test/workspace-logo.test.mjs` exists.
- Commit `60e1b76` present in history.
