# Deferred Items — Phase 28 (found during 28-01 execution)

- **Pre-existing eslint errors (15) in files outside this plan's scope** — `npm run lint` reports
  18 problems; the 3 in files touched by 28-01 were fixed (commit 17d644b), the remaining 15 sit
  in untouched files. Per the scope-boundary rule these were logged, not fixed. Run
  `npx eslint .` to enumerate before the phase gate if lint-clean CI is required.
- **`estimate` note:** plan estimated `tokens: 90000`; the realized diff is ~437 insertions /
  79 deletions across 8 files — well under estimate (no deviation action needed, recorded for
  calibration only).
