# Phase 70 Discussion Log

**Date:** 2026-11-17
**Mode:** default (no flags)
**Areas selected:** all 4 presented areas (Composition lanes Board, Rendu Timeline des enfants, SHAPE_CAP avec enfants, Ordre des barres Timeline)

## Pre-discussion decisions (user, before the workflow)
- Périmètre = Timeline + Board (pas seulement Timeline) — user answer to the scoping question
- Statut sous-tâches = modèle actuel done/todo — user answer
- Formalisation = cycle GSD complet (discuss → plan) — user answer

## Q1 — Composition des lanes Board
**Options:** Cartes plates / Badge count seul / Inline dans la carte
**Selected:** Cartes plates (recommandé)
**Notes:** chaque sous-tâche = une carte dans la lane de son statut, clé pointillée, lane.count inclut enfants.

## Q2 — Rendu Timeline des enfants
**Options:** Indent réelle / Indent 1 fixe / Indent + barres distinctes
**Selected:** Indent réelle (recommandé)
**Notes:** indentation = profondeur réelle ; barres identiques aux parents. Met à jour le pin 69-01.

## Q3 — SHAPE_CAP avec enfants
**Options:** Cap 400 strict / Cap relevé / Cap parents seuls
**Selected:** Cap 400 strict (recommandé)
**Notes:** enfants comptés dans le budget ; dégradation R13 inchangée.

## Q4 — Ordre des barres Timeline
**Options:** Groupés DFS / Tri global date
**Selected:** Groupés DFS (recommandé)
**Notes:** parents triés comme aujourd'hui, enfants en DFS immédiatement sous leur parent.

## Deferred ideas
- None raised. The Phase 69 deferred note ("CSV/xlsx hierarchy enrichment — indent depth channel for xlsx") is RESOLVED by this phase for the xlsx Timeline; CSV remains flat by design (not an import channel).

## Agent discretion items
- Composite-sort implementation in buildGantt (pre-order walk vs comparator)
- Undated-child filtering (follow the existing dated-row rule)
- Internal shape of board cards extension (flat merge vs per-card children) — observable contract locked by D-70-1
