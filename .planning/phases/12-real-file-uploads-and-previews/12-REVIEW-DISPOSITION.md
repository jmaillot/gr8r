# Review Disposition — Phase 12

> Ledger of what happened to each finding in 12-REVIEW.md. Advisory; rows default `open`.
> Triage by editing the Disposition column (`fixed` / `skipped` / `deferred`) with a reason.
>
> Written 2026-10-25 after the 12-07 incremental re-review (base 5e8a257), which reported
> CR-01 only. Findings from the earlier reviews that this review no longer reports are
> carried as `not in the current review` — triage or retire them explicitly.

| Finding | Severity | Disposition | Source |
|---|---|---|---|
| CR-01 | critical | open | Suffix range on a zero-byte stored file produces a malformed 206 (`bytes 0--1/0`) and a synchronous `ERR_OUT_OF_RANGE` throw after headers are sent (server.js:1982-1985) |
| H-1 | high | not in the current review | A.dupFile creates a file record whose binary does not exist — duplicate previews and copied links 404 forever (re-review of 2026-10-25, base 5e8a257) |
| H-2 | high | not in the current review | Undo of a file delete re-adds the record but the binary was already unlinked — "Undo" silently loses the file (re-review of 2026-10-25, base 5e8a257) |
| M-1 | medium | not in the current review | Preview modal renders a broken <img> for svg/heic — client type map disagrees with the D-06 inline map (re-review of 2026-10-25, base 5e8a257) |
| M-2 | medium | not in the current review | The disclosed cap is never enforced client-side — oversize files are fully uploaded before failing (re-review of 2026-10-25, base 5e8a257) |
| M-3 | medium | not in the current review | A non-numeric MAX_UPLOAD_MB disables the upload cap entirely while the UI reports 25 (re-review of 2026-10-25, base 5e8a257) |
| L-1 | low | not in the current review | fileDisposition leaves backslashes in the quoted filename — malformed Content-Disposition for strict parsers (re-review of 2026-10-25, base 5e8a257) |
| L-2 | low | not in the current review | File bytes stay in browser caches up to an hour after membership revocation (re-review of 2026-10-25, base 5e8a257) |
| L-3 | low | not in the current review | Upload request carries dead query params the server never reads (re-review of 2026-10-25, base 5e8a257) |
| L-4 | low | not in the current review | A.rmAttach leaves the Files-tab record (and bytes) — inconsistent with A.delFile (re-review of 2026-10-25, base 5e8a257) |
| L-5 | low | not in the current review | handleFiles mutates the doc outside mutate() and crashes if the attached task disappears mid-upload (re-review of 2026-10-25, base 5e8a257) |
| WR-01 | warning | not in the current review | serveFileBinary bypasses canSeeProject for private-project members (superseded review of 2026-10-24) |
| WR-02 | warning | not in the current review | handleFiles XHR onload lacks null check on vanished task (superseded review of 2026-10-24; L-5 covers the vanish-crash variant) |
| WR-03 | warning | not in the current review | Preview modal maps svg/heic to img tile the server won't serve inline (superseded review; M-1 covers it) |
| WR-04 | warning | not in the current review | DEPLOY.md stale "uploads are simulated" claim (superseded review; 12-04 rewrote docs) |
| IN-01 | info | not in the current review | Orphaned binaries when doc-PUT never lands (no GC) |
| IN-02 | info | not in the current review | Zero-byte uploads accepted (CR-01's fix closes the range-serving face of this state; the acceptance itself remains) |
| IN-03 | info | not in the current review | project: undefined records from task-drawer uploads |
| IN-04 | info | not in the current review | Inline-PDF CSP lacks sandbox |

Summary: open: 1 of 1 current findings (1 critical, 0 warning, 0 info); 18 carried rows from earlier reviews.
