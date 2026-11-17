# Phase 69 Discussion Log — 2026-11-17

Mode: default (interactive), no flags. Response language: French (user-facing), decisions recorded in English.

## Areas discussed (all 4 selected by user)

### Fixture 3 niveaux
| Question | Options presented | Decision |
|---|---|---|
| Build approach | Extend existing fixtures / Separate fixture / You decide | **Extend existing** (`export-fixtures.mjs` + `make-export-samples.mjs`) → D-69-1 |
| Content | Rich 1 complete tree / Minimal / Rich + edge cases | **Rich** (2 roots, 3 levels, offsets, milestone, notes, partial completion) → D-69-2 |
| Continue? | Next area | Next |

### Méthode de pré-screen
| Question | Options presented | Decision |
|---|---|---|
| Assertion home | Extend existing suites / New file | **Extend existing suites** → D-69-3 |
| UAT file generation | Extend make-export-samples / e2e UI export | **Extend generator** (standalone, no deps) → D-69-5 |
| MSPDI assertion target | Serialized XML / Model only | **Serialized XML** → D-69-4 |
| Continue? | Next area | Next |

### Procédure UAT
| Question | Options presented | Decision |
|---|---|---|
| MS Project target | Desktop / Online / Both | **Desktop** (XML Import Wizard) → D-69-6 |
| Evidence | Screenshot + verbatim dialogs / Oral verdict | **Screenshot + dialogs** in phase dir → D-69-7 |
| Continue? | Next area | Next |

### Critère de verdict
| Question | Options presented | Decision |
|---|---|---|
| PASS threshold | Hierarchy correct despite repair dialog / Strict zero-dialog | **Hierarchy is the criterion** (dialog + correct Gantt = PASS) → D-69-8 |
| Fix scope if FAIL | Minimal spot patch / Full canonical alignment | **Full canonical alignment** of the writer on Microsoft's Task element sequence → D-69-9 |
| Done? | Ready for context | Ready |

## Deferred ideas
- CSV/xlsx hierarchy enrichment — product decision unless UAT forces a fix
- Incoming MSPDI import feature — separate milestone
- MPXJ-based round-trip automation — rejected per NFR-01

## Agent's discretion
- Exact fixture tree shape (titles, offsets, counts) within the "rich" envelope
- Test naming and assertion helpers within existing suite conventions
