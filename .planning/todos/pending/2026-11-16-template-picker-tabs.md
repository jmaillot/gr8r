---
created: "2026-11-16T13:00:00Z"
status: doing
area: ui
severity: minor
resolves_phase: ""
source: session
title: "Template picker: separate Tasks / Project tabs in Settings"
---

# Template picker: separate Tasks / Project tabs in Settings

## Problem

The template surfaces (Settings → Modèles) currently mix task and project templates in one list. The owner wants two distinct tabs — « Modèles Tâches » and « Modèles Projet » — so each type is browsed separately.

## Solution

Two tabs in the template section of Settings (67-04's template UI lives in `src/overlays/modals.js` + template registry chunks; the Phase 66 template data is doc-embedded `data.templates[]` with per-kind bodies, see `src/core/templates.js`).

## Constraints (project standing rules)

- Zero new runtime/dev deps; 500 kB chunk gate (~2 kB headroom — lazy-load any new chunk or reuse the existing template lazy chunk)
- EN+FR i18n keys same commit (`src/locales/en.json`, `src/locales/fr.json`)
- e2e 115+/115+ green; unit baseline 1688 pass / 13 pre-existing env skips
- No `transition: all`, reduced-motion & hover gating for any animation

## Verification

- [ ] Settings template section shows two tabs; each lists only its kind
- [ ] i18n keys EN+FR committed together
- [ ] npm test baseline holds; build under 500 kB
