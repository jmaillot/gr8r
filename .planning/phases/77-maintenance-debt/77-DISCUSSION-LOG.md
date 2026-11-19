# Phase 77: Maintenance Debt - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-19
**Phase:** 77-Maintenance Debt
**Areas discussed:** Lint-fix strategy, Locale spot-check depth, Review-advisory dispositions, Plan/test gate order

---

## Lint-fix strategy

### Commit granularity
| Option | Description | Selected |
|--------|-------------|----------|
| File-grouped fixes | Fix per file-group, suite after each group; no-undef via config | ✓ |
| One commit per site | Strict ROADMAP reading: 15 commits + 15 suite runs | |
| Config-suppress some sites | Per-line silencing — violates SC1's zero-disable rule | |

**User's choice:** File-grouped fixes
**Notes:** ROADMAP's per-site wording was written before the count was known; with 15 verified sites across 10 files, per-site runs were judged not worth the wall-clock.

### Unused-code policy (live source)
| Option | Description | Selected |
|--------|-------------|----------|
| Delete unused code | Read surroundings, confirm zero side effects, delete | ✓ |
| Underscore-prefix | Keep names visible, `_`-prefixed | |
| Case-by-case per site | Executor judges each site | |

**User's choice:** Delete unused code

### no-undef files (webhook-formats.js, webhook-ssrf.js)
| Option | Description | Selected |
|--------|-------------|----------|
| Globals block | eslint.config.js Node-globals addition, no code change | ✓ |
| Convert to modules | ES-module imports — riskier for standalone scripts | |

**User's choice:** Globals block
**Notes:** Files stay as-is beyond lint; not part of the .mjs test ecosystem.

### Scope lock
| Option | Description | Selected |
|--------|-------------|----------|
| Count verified, proceed | 17 live errors match ROADMAP scope exactly (checked 2026-11-19) | ✓ |
| Re-verify at planning | Researcher re-enumerates during plan-phase | |

**User's choice:** Count verified, proceed

---

## Locale spot-check depth

### Evidence shape
| Option | Description | Selected |
|--------|-------------|----------|
| Refusal-path e2e ×3 | One spec, nl/de/es each: switch, trigger refusal, assert localized toast | ✓ |
| 1 e2e + catalogue tests | nl-only browser e2e + node:test catalogue checks | |
| Extend existing specs | Fold into locale.spec.mjs / french-overflow.spec.mjs | |

**User's choice:** Refusal-path e2e ×3

### Refusal surfaces
| Option | Description | Selected |
|--------|-------------|----------|
| Signup refusal only | DP-1 flow × 3 locales — canonical DOM refusal path | ✓ |
| All door refusals | DP-1/2/3 (+SSO if feasible) × 3 — heavy multi-account setup | |
| Signup + one invite path | Middle ground | |

**User's choice:** Signup refusal only

### Placeholder parity pinning
| Option | Description | Selected |
|--------|-------------|----------|
| Assert substituted value | Rendered text contains the interpolated value | ✓ |
| Assert no raw tokens | Only checks absence of `{placeholder}` remnants | |

**User's choice:** Assert substituted value

### Expected-string source
| Option | Description | Selected |
|--------|-------------|----------|
| Import catalogue JSONs | Assert rendered == src/locales/*.json entry + placeholder | ✓ |
| Hardcode expected strings | Independent of code under test, brittle to edits | |

**User's choice:** Import catalogue JSONs

---

## Review-advisory dispositions

### WR-02 (only Warning-tier carryover)
| Option | Description | Selected |
|--------|-------------|----------|
| Fix it properly | stripFlavour tracking, keep ref until remove(), clear deferred; ~30 lines + pin | ✓ |
| Waive with reason | Latent-only, guarded at call sites today | |

**User's choice:** Fix it properly

### 73-review infos (IN-01..05 + WR-01)
| Option | Description | Selected |
|--------|-------------|----------|
| Fix all | WR-01 hint key (D-08), IN-04 wall-clock budget, IN-05 comment; IN-01/02/03 fixed too | ✓ |
| Fix WR-01, waive IN-04/05 | Only the user-visible copy bug | |
| Waive IN-01..03 | House-style / harmless | |

**User's choice:** Fix all — no waivers selected; all nine advisories get fixes + regression pins.

### 74-review infos
| Option | Description | Selected |
|--------|-------------|----------|
| Fix both | gateIdx exact-line anchor + import.meta.dirname fallback | ✓ |
| Fix IN-02, waive IN-01 | Crash-before-assert is worse | |
| Waive both | Node pinned, gate currently correct | |

**User's choice:** Fix both

### Regression protection
| Option | Description | Selected |
|--------|-------------|----------|
| Fix = pin + ledger | Each fix carries a regression pin; dispositions in 77-REVIEW-DISPOSITION.md | ✓ |
| Ledger only, no pins | Lighter, but SC3's wording expects pins | |

**User's choice:** Fix = pin + ledger

---

## Plan shape and test gate order

### Plan organization
| Option | Description | Selected |
|--------|-------------|----------|
| 3 plans: lint → advisories → locale | Independently verifiable; locale e2e last | ✓ |
| 2 plans: lint → advisories+locale | Both touch banner surface | |
| 1 plan, all tasks | Simplest tracking, large plan | |

**User's choice:** 3 plans: lint → advisories → locale

### Test gate granularity
| Option | Description | Selected |
|--------|-------------|----------|
| Suite per commit-group | Full suite after each file-group/fix commit; e2e at end of plan 3 | ✓ |
| Suite per plan | Once at end of each plan | |

**User's choice:** Suite per commit-group

### Remaining discretion
| Option | Description | Selected |
|--------|-------------|----------|
| Standard discretion set | e2e naming, pin placement, IN-02 mechanism, ledger format | ✓ |
| Pin e2e config too | Also fix browser/project config now | |

**User's choice:** Standard discretion set

---

## the agent's Discretion

- e2e locale spec file name/placement and helper reuse
- Regression-pin test placement per fix
- IN-02 single-source-of-truth mechanism (JS-driven CSS vs shared token)
- 77-REVIEW-DISPOSITION.md ledger format (follow repo convention)
- Exact commit grouping within a file

## Deferred Ideas

None — discussion stayed within phase scope.
