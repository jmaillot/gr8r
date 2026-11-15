# Phase 64: Mobile Tasks Table & Suite Green - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 64-Mobile Tasks Table & Suite Green
**Areas discussed:** Breakpoint & gating, Card stack approach, Mobile e2e shape, Suite close gate

---

## Breakpoint & gating

| Option | Description | Selected |
|--------|-------------|----------|
| 900px, same as cards | Same tier as the .only-m card stack flip — button and cards in sync | ✓ |
| 640px | Tightest mobile tier, but an inconsistent 900–640 band with cards but a visible button | |
| New dedicated tier | Extra @media cut-off; a third breakpoint to maintain | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pure CSS hide | One rule in responsive.css; no render fork; blobs untouched | ✓ |
| JS-gated render | view-engine skips rendering — the Pitfall 4 render fork | |
| CSS + opt strip | Defense in depth, two mechanisms to keep in sync | |

| Option | Description | Selected |
|--------|-------------|----------|
| All views with a Columns button | Generic rule at view-engine.js:227 button; future views inherit the contract | ✓ |
| Tasks table only | Scoped to the tasks-table key; new views would silently miss the contract | |

| Option | Description | Selected |
|--------|-------------|----------|
| Viewport only | Pure width gate; saved-view blobs never change either way | ✓ |
| Viewport + pointer media | (pointer: coarse) nuance; second mechanism, hybrid state on small desktop windows | |

**User's choice:** 900px / pure CSS / generic across views / viewport only
**Notes:** One-breakpoint sync with the existing card flip was the deciding factor.

---

## Card stack approach

| Option | Description | Selected |
|--------|-------------|----------|
| Polish existing .only-m cards | Upgrade table.js:94 panel cards (55-07 A1 pattern); smallest diff | ✓ |
| Extend .trow CSS stacking | Delete the .only-m block, restack via responsive.css only | |
| New mobile component | Dedicated component — the parallel render fork SC-3 forbids | |

| Option | Description | Selected |
|--------|-------------|----------|
| Honor hidden[] now | Cards filter by v.hidden — absorbs the deferred requirement into Phase 64 | |
| Fixed field set | Cards keep today's fields; hidden[]-driven cards stay deferred | ✓ (after scope check) |

| Option | Description | Selected |
|--------|-------------|----------|
| Toolbar + overflow rows | Cards complete with toolbar visible; long titles, many assignees, labels, estimates | ✓ |
| Toolbar + no h-scroll | Also require zero horizontal scroll — brittle with legitimate chip overflow | |
| Render-only check | Only assert render + tap — too weak for "honestly usable" | |

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap everything | Titles/chips wrap, overflow-wrap only, never clipped or ellipsis | ✓ |
| Ellipsis + tap-to-expand | Compact but reintroduces truncation by design | |

**User's choice:** Polish existing cards / fixed fields (kept deferred) / toolbar + overflow rows / wrap everything
**Notes:** Owner initially selected "Honor hidden[] now", was shown the explicit scope-check tradeoff vs the REQUIREMENTS.md deferred listing, and confirmed keep-deferred.

---

## Mobile e2e shape

| Option | Description | Selected |
|--------|-------------|----------|
| One dedicated spec file | e2e/mobile-tasks-table.spec.mjs, per-domain file pattern | ✓ |
| Into existing specs | Entangles the mobile contract with desktop specs that must pass unmodified | |

| Option | Description | Selected |
|--------|-------------|----------|
| 390×844 + boundary test | iPhone-ish viewport plus one test just under the 900px cut-off | ✓ |
| Single viewport | Nothing proves the 900px gate | |
| Multi-width sweep | 320/390/768 loop — mostly redundant | |

| Option | Description | Selected |
|--------|-------------|----------|
| toBeHidden + scroll checks | toBeHidden() on button; scrollWidth ≤ clientWidth + visibility/box checks on cards | ✓ |
| Visibility only | Passes with clipped cards — doesn't prove "without truncation" | |
| Screenshot diff | Explicitly forbidden by SC-2 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Main config only | setViewportSize on main config; no second project/webServer (SC-2) | ✓ |
| Add mobile project | Against SC-2 and locked anti-features | |

| Option | Description | Selected |
|--------|-------------|----------|
| Purpose-built long task | Deterministic fixture: very long title, 4+ assignees, labels, estimate | ✓ |
| Existing seed data | Fragile against seed changes | |

**User's choice:** Dedicated file / 390×844 + boundary / toBeHidden + scroll checks / main config / purpose-built fixture
**Notes:** All web-first, auto-retrying assertions; no sleeps, no screenshots.

---

## Suite close gate

| Option | Description | Selected |
|--------|-------------|----------|
| N/N all green | Existing 111 stay green + new mobile spec passes; SC-4's intent is zero known failures | ✓ |
| Literal 111 | Would forbid adding the mobile spec — contradicts SC-2 | |

| Option | Description | Selected |
|--------|-------------|----------|
| One full run, VIEW-02 included | Same instrument Phase 63 D-02 pre-validated; no repeat proof re-run | ✓ |
| Re-run 10× VIEW-02 proof | Re-opens a closed phase; redundant | |

| Option | Description | Selected |
|--------|-------------|----------|
| All standing gates green | Unit suite, lint, 500 kB chunk gate (~220 B headroom), i18n gate | ✓ |
| e2e only | Lets lint/chunk/i18n regress silently at close | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fix in-phase, no waivers | Zero known failures; no deferred-debt acknowledgment at close | ✓ |
| Allow deferred-debt waiver | The v2.2 precedent Phases 62–63 spent repairing — not repeated | |

**User's choice:** N/N / one full run / all standing gates / fix in-phase no waivers
**Notes:** Owner explicitly rejected repeating the v2.2 deferred-debt precedent.

---

## Agent's Discretion

- Card polish specifics (spacing, tap targets, wrap details) — contract is "no truncation, wrap everything"
- Placement of the new CSS rule; optional unit tests for the card polish

## Deferred Ideas

- hidden[]-driven card fields on mobile — REQUIREMENTS.md Future Requirements; owner re-confirmed keep-deferred after explicit scope check
