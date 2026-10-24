# Review Disposition — Phase 12

> Ledger of what happened to each finding in 12-REVIEW.md. Advisory; rows default `open`.
> Triage by editing the Disposition column (`fixed` / `skipped` / `deferred`) with a reason.

| Finding | Severity | Disposition | Source |
|---|---|---|---|
| WR-01 | warning | open | serveFileBinary bypasses canSeeProject for private-project members |
| WR-02 | warning | open | handleFiles XHR onload lacks null check on vanished task |
| WR-03 | warning | open | Preview modal maps svg/heic to img tile the server won't serve inline |
| WR-04 | warning | open | DEPLOY.md stale "uploads are simulated" claim |
| IN-01 | info | open | Orphaned binaries when doc-PUT never lands (no GC) |
| IN-02 | info | open | Zero-byte uploads accepted |
| IN-03 | info | open | project: undefined records from task-drawer uploads |
| IN-04 | info | open | Inline-PDF CSP lacks sandbox |

Summary: open: 8 of 8 (0 critical, 4 warning, 4 info).
