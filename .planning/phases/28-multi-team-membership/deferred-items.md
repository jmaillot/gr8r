# Deferred Items — Phase 28 (found during 28-01 execution)

- **Pre-existing eslint errors (15) in files outside this plan's scope** — `npm run lint` reports
  18 problems; the 3 in files touched by 28-01 were fixed (commit 17d644b), the remaining 15 sit
  in untouched files. Per the scope-boundary rule these were logged, not fixed. Run
  `npx eslint .` to enumerate before the phase gate if lint-clean CI is required.
- **`estimate` note:** plan estimated `tokens: 90000`; the realized diff is ~437 insertions /
  79 deletions across 8 files — well under estimate (no deviation action needed, recorded for
  calibration only).

# Deferred Items — Phase 28 (found during 28-02 execution)

- **Pre-existing eslint error `myNotifs is not defined` in src/actions/actions.js** (2 call sites
  in `A.markAllRead`; present at HEAD before 28-02 — 28-01's "15 pre-existing" bucket). Not
  touched by this plan's sweep; logged, not fixed.
- **delTeam undo does not roll back authority rows** — `restore(snap)` restores the document only;
  the `team_members` purge of a deleted team is not reversible via the toast Undo (same
  irreversibility class as role changes, which are also not undoable). Cosmetic only: the team
  definition reappears, memberships stay cleared.
- **TEAM-05 concurrency test passed green on first run (no RED evidence)** — the server already
  serialized doc PUTs vs membership PUTs after 28-01's revisionless contract, so the regression
  pin was born green. The pin's value is protection against future reintroduction, documented
  per the TDD fail-fast rules as an intentional no-RED.
