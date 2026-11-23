# Phase 90: Polish & Verification Sweep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-23
**Phase:** 90-polish-verification-sweep
**Areas discussed:** Console Super Admin, Download + checksum, Rotation & rétention, Sweep e2e + DST, Observations post-89

---

## Console Super Admin

| Option | Description | Selected |
|--------|-------------|----------|
| Tab Governance | Nouveau tab « Super Admins » à côté du tab Instance Roles existant | ✓ |
| Refondre operatorCard | Remplacer le contenu actuel — casse les actions revoke-sessions | |

**User's choice:** Tab Governance
**Notes:** — (recommandation suivie)

| Option | Description | Selected |
|--------|-------------|----------|
| Cap 10 + show-more | 10 candidats + révélation par tranches de 10 | ✓ |
| Scroll incrémental | Infinite scroll — plus fluide mais complexe pour ~10 lignes | |
| Pas de cap | Instance petite, liste non bornée | |

**User's choice:** Cap 10 + show-more
**Notes:** — (recommandation suivie)

| Option | Description | Selected |
|--------|-------------|----------|
| Promote-only | Recherche = ajouter ; la rétrogradation reste sur le roster | ✓ |
| Promote + demote | Les deux actions dans les résultats | |

**User's choice:** Promote-only
**Notes:** Séparation claire du modèle mental.

| Option | Description | Selected |
|--------|-------------|----------|
| Tu décides | Mécanique post-promotion à la discrétion du planner | ✓ |
| Refetch complet | Préciser maintenant le refetch après promote | |

**User's choice:** Tu décides
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Recherche ≥ 2 caractères | Recherche étendue seulement à partir de 2 caractères | ✓ |
| Empty state roster | Copy d'empty state à clé pour un roster vide | (discrétion agent) |
| Garde dernier admin inchangé | Guard serveur existant D-118/D-119 suffit | (discrétion agent) |

**User's choice:** Recherche ≥ 2 caractères (verrouillé) ; les deux autres laissés à la discrétion
**Notes:** —

---

## Download + checksum

| Option | Description | Selected |
|--------|-------------|----------|
| Endpoint stream | GET /api/backup/download?runId=, Content-Disposition attachment, zéro staging, tiering 85 appliqué | ✓ |
| Stage puis servir | Fichier stagé puis servi — double le disque | |

**User's choice:** Endpoint stream
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Re-hash complet | Re-hash local ou stream-back S3 comparé au sha256 stocké + throttle | ✓ |
| Compare sidecar seulement | Ne détecte pas la corruption du binaire | |

**User's choice:** Re-hash complet
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Nom d'archive stocké | Content-Disposition = nom stocké, échappé | ✓ |
| Bouton caché si missing | Chrome honnête D-89-21 | ✓ |
| Audit des downloads | Audit log sur chaque download réussi | ✓ |

**User's choice:** Les trois
**Notes:** —

---

## Rotation & rétention

| Option | Description | Selected |
|--------|-------------|----------|
| Bouton on-demand | Endpoint de projection (dry-run GFS) appelé par un bouton du form | ✓ |
| Live dans le form | Recalculé à chaque changement — endpoint appelé à chaque frappe | |

**User's choice:** Bouton on-demand
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Calculé à la volée | kept-until calculé par le serveur depuis la policy actuelle — toujours exact | ✓ |
| Stocké au run | Figé à la création, devient faux si la policy change | |

**User's choice:** Calculé à la volée
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Groupée par échelle GFS | Compte par groupe + liste dépliable trunc/title | ✓ |
| Empty state si 0 run | Aucun run → empty state à clé, pas de projection fictive | ✓ |
| Throttle opérateur | Type D-89-22 — la projection lit tous les runs | ✓ |

**User's choice:** Les trois
**Notes:** —

---

## Sweep e2e + DST

| Option | Description | Selected |
|--------|-------------|----------|
| Cycle complet e2e | UN scénario : tâche → backup → S3 → suppression locale → list → preview → DR restore sur PG | ✓ |
| Par tranches | Rafraîchir/étendre les e2e existants sans scénario unique | |

**User's choice:** Cycle complet e2e
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Frontières EU+US | Transitions des deux zones, run 02:30 jour de transition, digest 08:00 | ✓ |
| EU seulement | Instance en France, moins de tests | |

**User's choice:** Frontières EU+US
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Env-gated seulement | Skip propre sans env, lancement manuel avant ship — cohérent 87/88/89 | ✓ |
| Wiring CI | GitHub Actions — hors périmètre historique du projet | |

**User's choice:** Env-gated seulement
**Notes:** —

---

## Observations post-89

| Option | Description | Selected |
|--------|-------------|----------|
| Liste restore → 90 | Invalider S.ui.restoreList à la terminaison d'un run backup | ✓ |
| Warning blob → 90 | Run porte le flag missingBlob + ⚠ dans l'historique (« le DR refusera cette archive ») | ✓ |
| Sweep intégrité → deferred | Détection périodique doc↔disque — nouvelle capacité, backlog | ✓ |
| Tout deferred | Aucune des trois en 90 | |

**User's choice:** Liste restore + warning blob en 90 ; sweep intégrité deferred
**Notes:** —

## the agent's Discretion

- Mécanique post-promotion (refetch vs mutation locale optimiste)
- Format de la recherche candidats (endpoint dédié vs extension GET /api/auth/operator/users)
- Emplacement de l'action verify-checksum dans le détail du run
- Colonne vs summary pour porter le flag missingBlob
- Shape de l'endpoint de projection de rotation
- Structure des plans (sweep e2e en dernier)

## Deferred Ideas

- Sweep d'intégrité doc↔disque (orphelins doc.files[], blobs perdus) — future phase, tracé dans 89-UAT.md
