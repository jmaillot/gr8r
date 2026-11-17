---
status: testing
phase: 70-subtasks-in-timeline-and-board-xlsx
source: [70-01-SUMMARY.md]
started: 2026-11-17T00:00:00Z
updated: 2026-11-17T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Timeline — sous-tâches indentées avec statut
expected: |
  Exporter un workbook xlsx avec l'option `subtasks` active sur un projet contenant une arborescence 3 niveaux. Dans la feuille Timeline : chaque sous-tâche apparaît sous son parent avec son titre indenté à sa profondeur réelle (sous-sous-tâche plus indentée qu'une sous-tâche), les parents sont en gras non indentés, et la colonne statut affiche done/todo par sous-tâche (pas le statut d'une autre ligne).
awaiting: user response

## Tests

### 1. Timeline — sous-tâches indentées avec statut
expected: Chaque sous-tâche apparaît sous son parent dans la feuille Timeline, titre indenté à sa profondeur réelle, parents en gras, colonne statut correcte par ligne (done/todo).
result: pending

### 2. Timeline — barres groupées DFS sous le parent
expected: Les barres des sous-tâches sont dessinées immédiatement sous la barre de leur parent (à chaque niveau), alignées sur les lignes de table ; les parents gardent le tri par date/titre ; aucune ligne vide ni décalage entre la table et les formes.
result: pending

### 3. Board — cartes de sous-tâches dans les lanes
expected: Dans la feuille Board, chaque sous-tâche est une carte à part entière dans la lane de son statut (done/todo), avec sa clé pointillée (ex. ALPHA-9.1) et ses champs ; le compte de lane inclut parents + enfants ; une lane vide au-dessus d'une lane avec cartes enfants garde son label directement suivi des cartes.
result: pending

### 4. Régression — sans sous-tâches et autres canaux
expected: Avec l'option `subtasks` désactivée, le workbook est identique à avant (aucune ligne enfant) ; les feuilles Tasks, MSPDI et CSV sont inchangés ; la dégradation SHAPE_CAP au-delà de 400 formes (enfants compris) fonctionne comme avant.
result: pending

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
