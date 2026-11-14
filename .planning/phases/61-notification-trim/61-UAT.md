---
status: complete
phase: 61-notification-trim
source: [61-01-SUMMARY.md, 61-02-SUMMARY.md]
started: 2026-11-14T09:00:00Z
updated: 2026-11-14T08:05:00Z
---

## Current Test

number: —
name: —
expected: |
  UAT terminée : 7/7 pass.
awaiting: none

## Tests

### 1. Settings › Notifications — toggles intact après retrait D-04
expected: Onglets E-mail/Push/Mentions rendus, aucun toggle mort résiduel, un toggle sauvegarde et survit au rechargement
result: pass

### 2. Burst — coalescing dans l'inbox
expected: Enchaîner plusieurs commentaires rapides sur la même tâche (avec un autre compte ou en tant que watcher) → les rows non-lues de même type+tâche se replient en UNE row résumé « N nouveaux commentaires — KEY Titre » ; les badges de compteur restent exacts
result: pass

### 3. Burst — click résumé → drawer tâche
expected: Cliquer la row résumé ouvre le drawer de la tâche (chemin /w/:slug/task/:key), PAS la sélection inbox
result: pass
note: |
  Première tentative = faux positif (rows déjà lues → burst absent). Refait proprement
  avec 2 mentions non lues multi-auteurs sur MAR-212 (Jeremy Test + Jma Prodware) :
  row résumé « 2 mentions — MAR-212 Délégation par pays » affichée ; clic sur le texte →
  URL /w/prod/task/MAR-212 + dialog "Tâche : Délégation par pays", inbox sur
  « Sélectionnez une notification ». Vérifié en live (browse MCP).

### 4. Burst — expand/collapse
expected: Le chevron de la row résumé développe le groupe : les rows individuelles d'origine s'affichent inchangées ; re-clic replie. Les toggles read par-row fonctionnent dans le groupe développé
result: pass
note: |
  Vérifié en live (browse MCP) : chevron « Déplier/Replier le groupe » toggle expand=true/false ;
  les 2 rows individuelles (testUAT2 Jma Prodware, test1 Jeremy Test) s'affichent inchangées.
  Toggle « Marquer comme lue » sur une row du groupe → 1 seule row passe en lu côté serveur,
  le groupe se dissout (1 seule mention non lue restante → rows individuelles, conforme D-11).

### 5. Burst — mark-all-read du groupe
expected: Le bouton « tout marquer lu » du groupe passe toutes les rows du groupe en lu ; le badge unread chute du nombre exact ; les autres rows non touchées
result: pass
note: |
  Vérifié en live (browse MCP) : groupe « 2 mentions — MAR-212 » reformé (Jeremy Test + Jma Prodware,
  à l'instant) ; « Marquer comme lue » du groupe → serveur 17 → 15 unread, les 2 mentions du groupe
  read:true, toutes les autres rows (comment/assign/past_due) intactes.

### 6. Burst — labels FR pluriels
expected: En locale FR, le résumé affiche la bonne forme plurielle (« 1 nouveau commentaire » / « 3 nouveaux commentaires ») ; EN correct aussi
result: pass
note: |
  Preuve live FR : résumé rendu « 2 mentions — MAR-212 Délégation par pays » (pluriel correct).
  Libellés définis en objets pluriels {one}/{other} pour FR et EN (src/locales/*.json:1869-1876),
  résolus via Intl.PluralRules (src/core/i18n.js:177-199) — rendu vérifié en isolation :
  FR « 1 nouveau commentaire / 2, 3 nouveaux commentaires », EN « 1 new comment / 2, 3 new comments ».
  NB : la forme singulière ne s'affiche jamais dans un burst (le groupe exige ≥2 non lues),
  les chaînes restent correctes pour tout usage futur.

### 7. Routes Notifications & Archive désormais lazy — première visite OK
expected: Ouvrir la page Notifications puis la page Archive depuis la nav : chacune se rend au premier clic (skeleton bref acceptable), contenu complet, pas d'écran vide ni d'erreur console ; retour et re-visite fluides
result: pass
note: |
  Vérifié en live (browse MCP) après reload frais : Notifications se rend au 1ᵉʳ clic
  (liste complète, 0 erreur console), Archive idem (onglets Tâches/Projets, empty state OK),
  re-visites fluides, 0 pageError sur les 2 routes.

## Summary

total: 7
passed: 7
issues: 0
