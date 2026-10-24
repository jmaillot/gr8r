# Phase 10: Browser coverage in both locales - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 10-browser-coverage-in-both-locales
**Areas discussed:** Spec file organization, Fixture strategy, Route coverage, Locale handling, Fixture error handling, Assertion depth, Criterion 4 completion, UAT-09 English pin, Fixture helpers

---

## Spec file organization

| Option | Description | Selected |
|--------|-------------|----------|
| One flows spec | One new file (e.g. e2e/flows.spec.mjs) grouping the eight flows — matches one-file-per-proof-family and lets them share fixtures in beforeAll | ✓ |
| One file per flow | 8 tiny files — clearest failure isolation, but 8× setup boilerplate, diverges from existing structure | |
| Extend locale.spec.mjs | Flows are about workspace features, not language mechanics; mixing muddies both | |

**User's choice:** One flows spec (recommended)

## Within-file structure

| Option | Description | Selected |
|--------|-------------|----------|
| Per-flow describe blocks | test.describe per flow inside flows.spec.mjs — one look tells which flow failed | ✓ |
| Flat test list | Naming conventions only | |
| Tags per flow | Playwright tags, less obvious in list output | |

**User's choice:** Per-flow describe blocks (recommended)

## Fixture strategy

| Option | Description | Selected |
|--------|-------------|----------|
| beforeAll fixtures | Accounts/workspaces in beforeAll, mutations in test() — matches locale.spec and french-overflow | ✓ |
| Per-test fixtures | More isolation but 8× slower; per-IP signup throttling gets in the way | |
| Global setup | Heavier ceremony, doesn't match current pattern | |

**User's choice:** beforeAll fixtures (recommended)

## Route coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Keep static list | The ROUTES snapshot in french-overflow stays manually maintained | |
| Derive from app source | Import the route list from the app's router source so E2E coverage can't drift from the UI | ✓ |
| Shared config file | One list imported by E2E specs and other tools | |

**User's choice:** Derive from app source (recommended)

## Locale management

| Option | Description | Selected |
|--------|-------------|----------|
| Per-suite throwaway accounts | Language switched via UI on throwaway accounts (locale.spec pattern); isolated from the English-pinned tenancy suite | ✓ |
| Browser-level locale | Playwright `use: { locale: 'fr' }` — but the app's locale is per-account, not per-browser | |
| Mixed approach | Some tests per account, some per browser | |

**User's choice:** Per-suite throwaway accounts (recommended)

## Fixture error handling

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit status checks | Keep `if (status !== 201) throw ...` with hardcoded expected codes | ✓ |
| Auto-throw client wrapper | apiClient throws on non-2xx; less boilerplate but hides intentional error tests | |
| Retry mechanism | Retry flaky fixture creation | |

**User's choice:** Explicit status checks (recommended)

## Assertion depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full happy path | Each flow runs its complete journey, asserting the visible label/toast at each step — naturally satisfies "not only a click" | ✓ |
| First visible label only | Stop after the flow opens — faster but flows aren't really proven | |
| Happy path + error branch | Full path plus one error branch per flow — roughly doubles test code | |

**User's choice:** Full happy path (recommended)

## Assertion convention (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Role/label/text + toast | Suite convention; the eight flows' leak-prone surfaces are exactly aria-label/data-tip/toast | ✓ |
| Plus attribute assertions | Duplicate what getByRole already checks | |
| Plus leak sweep per flow | Overlaps with phase 11's UAT-10 sweep | |

**User's choice:** Role/label/text + toast (recommended)

## Criterion 4 completion

| Option | Description | Selected |
|--------|-------------|----------|
| Extend locale.spec.mjs | The file whose purpose is exactly this scenario; alice(fr)/bob(en) fixtures already exist | ✓ |
| Fold into flows spec | Keeps locale.spec frozen but duplicates its fixture setup | |
| New dedicated spec | Third fixture setup for a scenario locale.spec half-owns | |

**User's choice:** Extend locale.spec.mjs (recommended)

## Second workspace for the switch

| Option | Description | Selected |
|--------|-------------|----------|
| Second ws via API | One extra POST in the fixture step; the switcher test proves the UI switch | ✓ |
| Created in-test via UI | Couples creation and switching in one test | |
| Reuse bob's fixture | More juggling, unclear ownership | |

**User's choice:** Second ws via API (recommended)

## UAT-09 English pin

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit config pin | `use: { locale: 'en-US' }` in playwright.config.mjs with a UAT-09 comment — negotiation path is exactly what phase 8 built | ✓ |
| Guard test only | Fresh-context test asserting English login UI | |
| Leave implicit | Nothing in phase 10 changes it | |

**User's choice:** Explicit config pin (recommended)

## Fixture helpers

| Option | Description | Selected |
|--------|-------------|----------|
| Grow setup.mjs | Shared locale-aware account/workspace helper for flows + locale specs; tenancy fixtures untouched | ✓ |
| Per-spec inline | locale.spec's inline createAccount duplicated per spec | |
| Full factory refactor | Beyond phase scope, risks the English-pinned suites | |

**User's choice:** Grow setup.mjs (recommended)

## the agent's Discretion

- Exact naming of the new spec file (`e2e/flows.spec.mjs` used as the working example)
- The exact shape of the shared fixture helper API in setup.mjs
- Where the derived route list lives (module choice left to the planner/researcher)

## Deferred Ideas

None — discussion stayed within phase scope
