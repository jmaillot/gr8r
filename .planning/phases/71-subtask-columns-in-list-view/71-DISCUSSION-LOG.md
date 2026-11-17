# Phase 71 Discussion Log

**Date:** 2026-11-17
**Mode:** default (no flags)
**Origin:** owner request after Phase 70 close — « peut on afficher egalement les colonnes Statut, Assigné à, Priorité, Echeance sur les sous-tâches dans la visualisation Liste ? »

## Pre-discussion decisions (owner, 2026-11-17)
- 4 columns wanted: Statut, Assigné à, Priorité, Échéance — answered "Toutes les 4 (recommandé)"
- Priority content = inherited from the parent task — answered "Héritée du parent (recommandé)"
- Inline editing = status toggle only; other cells read-only — answered "Statut seul éditable (recommandé)"

## Gray areas
Only one remained after the owner's three answers: interaction model (which cells are editable). Resolved above. The other candidate areas (priority source, status source) were directly covered by the owner's answers.

## Agent discretion items
- Status chip visual (stPill-style vs lighter chip)
- Grid alignment mechanism (shared template vs matching template)
- Priority inherited: dimmed vs identical render
- Board popover layout hint shape (renderer backward-compat, D-71-6)

## Deferred ideas
- None raised. (Editable priority per subtask was offered and declined — model stays done+assignees+dates.)
