---
status: testing
phase: 70-subtasks-in-timeline-and-board-xlsx
source: [70-01-SUMMARY.md]
started: 2026-11-17T00:00:00Z
updated: 2026-11-17T01:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 0
name: (session complete)
expected: |
  G-1 (70-02), G-2 (c63017a), G-3 (70-03) all shipped. Owner re-test pending on real exports.
awaiting: none

## Tests

### 1. Timeline — sous-tâches indentées avec statut
expected: Chaque sous-tâche apparaît sous son parent dans la feuille Timeline, titre indenté à sa profondeur réelle, parents en gras, colonne statut correcte par ligne (done/todo).
result: pass
note: |
  Owner feedback 2026-11-17 — BUG (gap G-1) : la date d'échéance d'une sous-tâche n'reflecte pas la vraie due date. Règle attendue : hériter du parent par défaut, mais prendre la valeur si elle est posée manuellement. Diagnostic : src/export/model.js:227 `due: t.due || ''` ignore systématiquement `s.due` (le modèle UI porte pourtant une due par sous-tâche — champ `subdue`, tooltip `page.subtask.inheritedDue`). Fix : `due: s.due || t.due || ''` (miroir de la ligne start:226). Impact modèle = tous canaux (xlsx + MSPDI), pin export-model à mettre à jour.

### 2. Timeline — barres groupées DFS sous le parent
expected: Les barres des sous-tâches sont dessinées immédiatement sous la barre de leur parent (à chaque niveau), alignées sur les lignes de table ; les parents gardent le tri par date/titre ; aucune ligne vide ni décalage entre la table et les formes.
result: pass

### 3. Board — cartes de sous-tâches dans les lanes
expected: Dans la feuille Board, chaque sous-tâche est une carte à part entière dans la lane de son statut (done/todo), avec sa clé pointillée (ex. ALPHA-9.1) et ses champs ; le compte de lane inclut parents + enfants ; une lane vide au-dessus d'une lane avec cartes enfants garde son label directement suivi des cartes.
result: pass

### 4. Régression — sans sous-tâches et autres canaux
expected: Avec l'option `subtasks` désactivée, le workbook est identique à avant (aucune ligne enfant) ; les feuilles Tasks, MSPDI et CSV sont inchangés ; la dégradation SHAPE_CAP au-delà de 400 formes (enfants compris) fonctionne comme avant.
result: issue
note: |
  Owner 2026-11-17 — à l'ouverture Excel affiche « Désolé… problème dans le contenu de .xlsx, nous pouvons essayer de récupérer le maximum de contenu ». Sinon le contenu a l'air correct après réparation. = XML invalide quelque part (souvent : id dupliqué, attribut hors plage, ou cellule/style incohérent). Suspects principaux : indentCell multi-niveaux (style id) sur les lignes enfants Timeline, ancres de formes child bars, ou cartes Board enfants. Diagnostic en cours (G-2).

## Summary

total: 4
passed: 3
issues: 2
pending: 0
skipped: 0

## Gaps

### G-1 — Subtask due inheritance ignores a manually-set due date (owner, 2026-11-17)
- **Symptom:** exported subtask rows always carry the TOP-LEVEL task's due date, even when the subtask has its own.
- **Root cause:** `src/export/model.js:227` — `due: t.due || ''` (never reads `s.due`). The start field on line 226 already does the right thing: `s.start || t.start || ''`.
- **Expected rule (owner):** default = inherit parent task's due; manual value wins → `due: s.due || t.due || ''`.
- **Evidence of the UI contract:** subtasks carry their own `due` (`S.ui` field `subdue`, popovers.js:66/191, subtask-detail.js:27 with `page.subtask.inheritedDue` tooltip shown only when `s.due` is empty).
- **Blast radius:** model-level fix → all channels (xlsx Tasks/Timeline/Board AND MSPDI rows derive dates from `row.due`). Pin `test/export-model.test.mjs` (due inheritance from top-level task) must be UPDATED to the new rule; Phase 69's "subtask end = parent end" MSPDI criterion stays true for subtasks WITHOUT their own due (the `|| t.due` fallback).
- **Status:** ✅ FIXED — commit `368e35f` (70-02 gap closure, TDD): model.js:227 `due: s.due || t.due || ''` (mirror of :226 start). Pins rewritten with inherited + manual-override cases (nested included). Phase 69 fallback preserved (`|| t.due`). Tests 1725/1738 grow-only (+2 override pins, RED confirmed first), lint 15, chunk 499.94 kB, frozen files byte-identical. **Owner re-test pending.**

### G-3 — Board cards missing the start date (owner, 2026-11-17)
- **Symptom:** la feuille Board n'affiche pas la date de début des tâches (ni parents ni sous-tâches).
- **Not a Phase 70 regression:** the Board never had a start column — Phase 54 design (`headers.board` = lane/count/key/title/assignees/priority/due/progress, cards in C..H).
- **Fix scope:** model.js — `headers.board` gains 'start' before 'due', card projection gains `start: r.start`; export/xlsx.js — Board cards write start (real date, SHORT_DATE_CODE) shifting due→H, progress→I. WIDTHS.start already exists; i18n `export.col.start` exists in EN+FR already.
- **Pins to update:** test/export-xlsx.test.mjs :450 (card fields), :498-512 (due column G→H), :515-528 (progress H→I), :962 (child cards).
- **Status:** ✅ FIXED — commits `6f118f6` (RED pins) + `bb51726` (fix, 70-03 gap closure, TDD): model headers.board gains 'start' + card projection `start: r.start`; writer cards C..I (start@G real date SHORT_DATE_CODE, due→H, progress→I); initSheet keys mirror. 2 minor deviations documented in 70-03-SUMMARY.md (walker ISO-date skip extended to start; initSheet keys). Tests 1726/1739 grow-only, lint 15, chunk 499.94 kB, frozen files byte-identical, G-1/G-2 preserved. **Owner re-test pending.**

### G-2 — Excel repair prompt on open (owner, 2026-11-17) — BLOCKER
- **Symptom:** « Désolé… Nous avons trouvé un problème dans le contenu de ".xlsx"… récupérer le maximum de contenu ». Content correct after repair, but the file is not clean OOXML.
- **Regression introduced by:** Phase 70 (file opened fine in Phase 69 owner UAT).
- **Suspects:** indentCell multi-level style on Timeline child rows (style index out of range?), child bar drawing anchors, Board child card cells (date/percent codes on child rows?).
- **Status:** ✅ FIXED — commit `c63017a`. Root cause: LINK_ROW_OFF_PRED/SUCC (700000/300000 EMU) overshoot the 15pt = 190500 EMU default row height; Excel repairs the out-of-bounds drawing anchor. Sample files had no connectors, so it survived 54-05/69 UAT. Fix: offsets 150000/40000 (visual intent kept) + guard test pinning every Timeline rowOff ≤ 190500 EMU. Suite 1723/1736, lint 15, chunk 499.94 kB, frozen files untouched. **Owner re-test pending** (regenerate a real export, expect no repair prompt).
