# Phase 73 Discussion Log — Install Hint Banner

**Date:** 2026-11-18
**Mode:** default (interactive)
**Prior context loaded:** PROJECT.md (v2.2 shipped record), REQUIREMENTS.md (PWA-04), STATE.md, 72-CONTEXT.md (done dependency), research/SUMMARY.md

## Discussion

### Area: Placement & visual form
**Options presented:** Fixed bottom strip / Toast-style card / Inline under header
**Selected:** Fixed bottom strip
**Notes:** Classic PWA pattern; dismiss X + Install button.

### Area: Dismissal persistence
**Options presented:** Forever / Cooldown (N days) / Per-session
**Selected:** Cooldown — **Follow-up:** 14 days chosen over 7 and 30.
**Notes:** localStorage client-side; not the workspace doc.

### Area: Degradation depth — iOS
**Options presented:** One-line strip / Expandable walkthrough / Nothing on iOS
**Selected:** One-line strip
**Notes:** Same fixed strip, static "Share → Add to Home Screen" copy, feature-based detection.

### Area: Degradation depth — Firefox
**Options presented:** Total silence / Explanatory strip
**Selected:** Total silence (desktop and Android).

### Area: Trigger & routing behavior
**Options presented:** On event anytime / Delay or interaction gate — selected **On event, anytime** (boot listener, lazy chunk, no interaction prerequisite).
**Route scope options:** Authed routes only / Everywhere incl. login / Root shell only — selected **Authed routes only** (suppressed on `/login`, `/join`, demo screens; shell-level so it survives workspace switching).

### the agent's Discretion
- Exact module path/name for the banner module, DOM/CSS structure of the strip, and
  exact i18n key names.

## Deferred Ideas
None.
