---
phase: 36
source: 36-REVIEW.md
recorded: 2026-11-04
---

# Code Review Disposition — Phase 36

| Finding | Severity | Disposition | Reason |
|---------|----------|-------------|--------|
| CR-01 | critical | open | Client-controlled `n.type` injected into HTML unescaped via t() key-fallback (XSS) — inbox.js:72-73 |
| WR-01 | warning | open | `has(n.key)` gate accepts any catalogue key, not just the reminder namespace |
| WR-02 | warning | open | Non-reminder email Subject composed in code, outside the catalogue — FR subjects English-shaped |
| IN-01 | info | open | Fallback verb table in the SC-5 catch omits reminder kinds |
| IN-02 | info | open | Hardcoded French fallback 'Un membre' in the localized email path |
| IN-03 | info | open | i18n-scan gate blind spot — ternary keys check only the first branch |
| IN-04 | info | open | Second HTML-escape table in mailer.js can drift from the canonical one |
