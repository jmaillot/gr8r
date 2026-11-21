---
phase: 84-backlog-polish-ship
plan: 04
status: complete
commits:
  - "1b217442"
  - "4cf10d42"
  - "6f605219"
---

# 84-04 Summary — DEPLOY.md + CHANGELOG + 3.2.0 ship gate

## What was done

- **Task 1 (D-09):** `docs/DEPLOY.md` "Entra group mapping" section (commit `1b217442`) — four subsections: ApplicationGroup claim prerequisites; overage fallback recipe pointer to `.planning/research/STACK.md` (documentation pointer ONLY, per deferred-ideas ruling); dead-mapping runbook; old-slug 404 policy per D-82-5. Voice matches the surrounding Entra SSO section; automated greps verified all four present.
- **Checkpoint (blocking, ratified):** owner approved THREE separate dated entries + dates as drafted (3.0.0 — 2026-11-19, 3.1.0 — 2026-11-20, 3.2.0 — 2026-11-20). Answer carried back to the executor; executor died mid-Task-2 (see Incident) with the CHANGELOG already written.
- **Task 2 (D-11/D-13):** CHANGELOG entries written verbatim per ratification; ship-gate e2e run green; package.json 3.0.0 → 3.2.0 (commit `4cf10d42`, completed by the orchestrator after the executor stall).

## Ship-gate evidence

- `npm run e2e`: **145 passed / 0 failed / 0 skipped (7.3m)** — clean run after removing an environmental saboteur (below). Zero `test.skip`/`test.fixme` debt waivers; the only conditional skip remains the environment-gated demo-locale spec (D-04 satisfied).
- `npm test`: 2055 tests / 2042 pass / 0 fail / 13 pre-existing env-gated skips.
- Version assert: `node -e "…version==='3.2.0'…"` exit 0; CHANGELOG greps 3.2.0/3.0.0/3.1.0 all non-zero.

## Incident (environmental, documented for future runs)

The stalled 84-04 executor left a background retry loop (`E2E_REUSE_SERVER=true npx playwright … ; pkill -f "e2e/server.mjs"`) in an orphaned pty session. It repeatedly killed the live e2e webServer mid-suite, producing phantom `ECONNREFUSED`/`fetch failed` cascades across four gate attempts. Root-caused via a watcher (`/proc` fd/RSS sampling — server stayed healthy under the false failures) and a stray-process listing; killing the loop and leftovers restored a green run on the first clean attempt. No app or spec change was involved. Spec-side residue from the stalled executor (`e2e/invite.spec.mjs` team-pick interaction repair, `e2e/locale-refusal.spec.mjs` await-access routing) was verified legitimate and committed (`6f605219`).

## Threat model compliance

- T-84-SC: zero installs (docs + version only). All other T-84 rows belong to other plans.

## Deviations

- Executor process died mid-Task-2; Task 2 completed by the orchestrator with the owner-ratified content unchanged.
