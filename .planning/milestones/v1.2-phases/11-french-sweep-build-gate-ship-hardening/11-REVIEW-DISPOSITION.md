---
phase: 11-french-sweep-build-gate-ship-hardening
updated: 2026-10-24
total: 5
open: 5
fixed: 0
skipped: 0
---

# Review Disposition Ledger

One row per finding from `11-REVIEW.md`. Default disposition: `open`.
Edit a row's Disposition to triage it (`fixed` / `skipped` / `deferred` — include the reason).

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | Demo-spec API probe misclassifies a 404 as "API present" — the demo proof silently skips in a reachable configuration |
| WR-02 | warning | open | The demo-mode proof is not wired into any automated entry point |
| IN-01 | info | open | `fmt()` helper duplicated across three spec files |
| IN-02 | info | open | STOP_LIST is a hand-maintained literal list that permanently masks matches |
| IN-03 | info | open | CI failure diagnostics lose container logs under `--rm` |
