---
phase: 82-removal-sync-guards-audit
source: 82-REVIEW.md
updated: 2026-11-20T00:00:00Z
---

Open: 5 of 5 rows.

| Finding | Title | Severity | Disposition | Source |
|---------|-------|----------|-------------|--------|
| WR-01 | AUD-01 atomicity guarantee holds only for the delete path — downgrade/grant/skip delta rows are committed separately from their membership writes | warning | open | |
| WR-02 | Removal-side archived-workspace skip is silent — asymmetric with the audited grant-side skip | warning | open | |
| IN-01 | D-82-7 upgrade path converts manual/invite-origin rows into removal-sync-eligible rows | info | open | |
| IN-02 | Skip audit row references the mapping's guid, not the existing row's provenance guid — audit/provenance skew under multi-group mappings | info | open | |
| IN-03 | Per-login accumulation of duplicate skip/guard audit rows | info | open | |
