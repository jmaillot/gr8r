---
phase: 11-french-sweep-build-gate-ship-hardening
plan: 04
subsystem: docs
tags: [i18n, docs, changelog, deploy, release-notes]
requires: [11-01, 11-02, 11-03]
provides: [readme-i18n-boundary, changelog-120-draft-notes, deploy-docker-build-mention]
affects: []
tech-stack:
  added: []
  patterns: [keep-a-changelog-draft-entry]
key-files:
  created: []
  modified: [README.md, CHANGELOG.md, DEPLOY.md]
decisions:
  - "CHANGELOG 1.2.0 notes written under `## [Unreleased] — 1.2.0 milestone notes (draft)` to make the not-yet-tagged state explicit (D-14)."
metrics:
  duration: ~10 min
  completed: 2026-10-24
  tasks: 2
  commits: 2
status: complete
---

# Phase 11 Plan 04: Documentation — boundary, release notes, ship-verification job Summary

**Docs state the D-13/D-15 boundary (interface en+fr; demo seed and prototype pages not; four languages absent), the 1.2.0 draft release notes, and the new `docker-build` CI job — with the version bump and tag deliberately deferred to milestone close.**

## What was done

- **Task 1 (README, D-13):** Added `## Internationalization` after `## Deploy`, in the file's bold-lead bullet style. States exactly: interface translated into English and French (catalogues, per-locale dates/numbers/plurals/vocabulary, persisted per account); demo seed sample content is English (D-15); the two prototype pages (`design-system`, `states`) are English/excluded; the four other languages the selector once listed are absent until they exist (LANG-01 future); guarded by the 21-route French sweep and the build-time static scan. No version claim ("1.2.0" absent from README).
- **Task 2 (CHANGELOG + DEPLOY, D-14/D-15):**
  - CHANGELOG.md: added `## [Unreleased] — 1.2.0 milestone notes (draft)` with the user-facing outcome — full French interface with persisted per-user locale, browser coverage in both locales, the 21-route sweep with coverage assertion and the build gate, the French catalogue in the shipped image verified by `docker-build`, the French server-less demo, and zero runtime dependencies. No package.json/package-lock.json change, no `chore(release)` commit, no tag — D-14 honored.
  - DEPLOY.md: extended the §12 CI sentence to describe the `docker-build` job (builds the image, boots a throwaway container, asserts the served French catalogue chunk has French content) and that the shipped image carries the French catalogue, using the exact job name from `.github/workflows/ci.yml`.

## Verification

- `grep -c "Internationalization" README.md` → 1; `grep -c "design-system" README.md` → 2; "1.2.0" absent from README.
- `grep -c "docker-build" DEPLOY.md` → 2.
- `git diff --name-only HEAD -- package.json package-lock.json` → empty (no version bump leaked).

## Deviations from Plan

None — plan executed exactly as written. (One naming choice: the plan said "1.2.0 notes text without bumping any version field"; the notes live under an explicit `[Unreleased] (draft)` heading so the untagged state is unambiguous.)

## Commits

- `a144f61` docs(11-04): state the translated-vs-not boundary in README (D-13)
- `b39e5f2` docs(11-04): 1.2.0 draft release notes + docker-build in DEPLOY (D-14, D-15)

Measured: `git rev-list --count c59fd9c..HEAD` → 2 (`plan_head_before: c59fd9c`).

## Known Stubs

None.

## Self-Check: PASSED

- README.md contains `## Internationalization` with both exclusions and the en+fr boundary — confirmed by grep.
- CHANGELOG.md carries the 1.2.0 draft notes under `[Unreleased]`; DEPLOY.md names `docker-build` — confirmed by grep.
- Commits `a144f61` and `b39e5f2` exist on `main` (verified via `git log`).
