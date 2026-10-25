# Review Disposition — Phase 12

> Ledger of what happened to each finding in 12-REVIEW.md. Advisory; rows default `open`.
> Triage by editing the Disposition column (`fixed` / `skipped` / `deferred`) with a reason.
>
> Written 2026-10-25 after the post-gap-closure re-review (which supersedes the 2026-10-24
> review). Findings from the superseded review that the fresh review no longer reports are
> carried as `no current review` — triage or retire them explicitly.

| Finding | Severity | Disposition | Source |
|---|---|---|---|
| H-1 | high | open | A.dupFile creates a file record whose binary does not exist — duplicate previews and copied links 404 forever |
| H-2 | high | open | Undo of a file delete re-adds the record but the binary was already unlinked — "Undo" silently loses the file |
| M-1 | medium | open | Preview modal renders a broken <img> for svg/heic — client type map disagrees with the D-06 inline map |
| M-2 | medium | open | The disclosed cap is never enforced client-side — oversize files are fully uploaded before failing |
| M-3 | medium | open | A non-numeric MAX_UPLOAD_MB disables the upload cap entirely while the UI reports 25 |
| L-1 | low | open | fileDisposition leaves backslashes in the quoted filename — malformed Content-Disposition for strict parsers |
| L-2 | low | open | File bytes stay in browser caches up to an hour after membership revocation |
| L-3 | low | open | Upload request carries dead query params the server never reads |
| L-4 | low | open | A.rmAttach leaves the Files-tab record (and bytes) — inconsistent with A.delFile |
| L-5 | low | open | handleFiles mutates the doc outside mutate() and crashes if the attached task disappears mid-upload |
| WR-01 | warning | not in the current review | serveFileBinary bypasses canSeeProject for private-project members (superseded review of 2026-10-24) |
| WR-02 | warning | not in the current review | handleFiles XHR onload lacks null check on vanished task (superseded review of 2026-10-24; L-5 covers the vanish-crash variant) |
| WR-03 | warning | not in the current review | Preview modal maps svg/heic to img tile the server won't serve inline (superseded review; M-1 covers it) |
| WR-04 | warning | not in the current review | DEPLOY.md stale "uploads are simulated" claim (superseded review; 12-04 rewrote docs) |
| IN-01 | info | not in the current review | Orphaned binaries when doc-PUT never lands (no GC) |
| IN-02 | info | not in the current review | Zero-byte uploads accepted |
| IN-03 | info | not in the current review | project: undefined records from task-drawer uploads |
| IN-04 | info | not in the current review | Inline-PDF CSP lacks sandbox |

Summary: open: 10 of 10 current findings (0 critical, 2 high, 3 medium, 5 low); 8 carried rows from the superseded review.
