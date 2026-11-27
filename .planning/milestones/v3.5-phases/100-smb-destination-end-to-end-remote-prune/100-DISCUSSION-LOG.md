# Phase 100 — Discussion Log

**Date:** 2026-11-25 · **Mode:** discuss (3 owner-selected areas + 2 derived)

| Area | Question | Ruling |
|---|---|---|
| Floor-guard (R-1) | mechanical follow vs never-sole-copy | **D-01** mirror pruned ONLY if run also holds S3 copy OR S3 unconfigured; fresh reads at prune time |
| E2E samba recipe | happy-path only vs both SPIKE pins | **D-02** one recipe, 2 containers (SMB2-min + SMB3-min refusal), `SAMBATEST_URL`+`SAMBATEST_SMB3_URL` |
| Prune visibility | audit-only vs badge | **D-03** `pruned` badge visible (additive `remote_pruned` column) + audited `backup_prune_*` tokens |
| SMB wiring | (derived) | **D-04** clone 98 FTP harness site-by-site; guest → `smbGuestAccess` info toast |
| Prune timing | (derived) | **D-05** inside rotation pass after local commit; per-dest best-effort, failures non-blocking |

Owner answers via question tool, 2026-11-25. CONTEXT.md locked with D-01..D-05.
