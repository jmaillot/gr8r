---
status: testing
phase: 61-notification-trim
source: [61-01-SUMMARY.md, 61-02-SUMMARY.md]
started: 2026-11-14T09:00:00Z
updated: 2026-11-14T09:00:00Z
---

## Current Test

number: 1
name: Settings › Notifications — toggles intact après retrait D-04
expected: |
  Ouvrir Réglages › Notifications (onglets E-mail / Push / Mentions).
  Les toggles habituels sont là (email : mentions/assignments/comments/digest/reminder ;
  push : mentions/assignments/comments/due/reminder/past-due ; mentions : @all/@équipe).
  AUCUN toggle résiduel mention_ws / assign_self / assign_status / assign_over n'apparaît.
  Basculer un toggle (ex. email comment) et recharger la page : la valeur est conservée
  (pas d'erreur 400, pas de retour à la valeur précédente).
awaiting: user response

## Tests

### 1. Settings › Notifications — toggles intact après retrait D-04
expected: Onglets E-mail/Push/Mentions rendus, aucun toggle mort résiduel, un toggle sauvegarde et survit au rechargement
result: pending

### 2. Burst — coalescing dans l'inbox
expected: Enchaîner plusieurs commentaires rapides sur la même tâche (avec un autre compte ou en tant que watcher) → les rows non-lues de même type+tâche se replient en UNE row résumé « N nouveaux commentaires — KEY Titre » ; les badges de compteur restent exacts
result: pending

### 3. Burst — click résumé → drawer tâche
expected: Cliquer la row résumé ouvre le drawer de la tâche (chemin /w/:slug/task/:key), PAS la sélection inbox
result: pending

### 4. Burst — expand/collapse
expected: Le chevron de la row résumé développe le groupe : les rows individuelles d'origine s'affichent inchangées ; re-clic replie. Les toggles read par-row fonctionnent dans le groupe développé
result: pending

### 5. Burst — mark-all-read du groupe
expected: Le bouton « tout marquer lu » du groupe passe toutes les rows du groupe en lu ; le badge unread chute du nombre exact ; les autres rows non touchées
result: pending

### 6. Burst — labels FR pluriels
expected: En locale FR, le résumé affiche la bonne forme plurielle (« 1 nouveau commentaire » / « 3 nouveaux commentaires ») ; EN correct aussi
result: pending

### 7. Routes Notifications & Archive désormais lazy — première visite OK
expected: Ouvrir la page Notifications puis la page Archive depuis la nav : chacune se rend au premier clic (skeleton bref acceptable), contenu complet, pas d'écran vide ni d'erreur console ; retour et re-visite fluides
result: pending

## Summary

total: 7
passed: 0
issues: 0
