# Permissions — Projets

> Documenté à partir du code réel (server.js + mcp.js + src/), mis à jour à la Phase 50 (liens d'équipes vivants — D-50-5). Références `fichier:ligne` pour vérification.

## 1. Le bouton « Partager » et le petit bonhomme

Ils font exactement la même chose : les deux ouvrent le **modal de partage** (`shareModal`, src/overlays/modals.js:202-255). Le bouton « Partager » et l'icône personne sont deux points d'entrée vers le même composant — il n'y a qu'un seul modal de partage par projet.

## 2. Les niveaux d'autorisation par personne

Le modal permet d'ajouter des personnes au projet avec un niveau de permission :

| Label UI | Valeur stockée | Sens voulu |
|----------|----------------|------------|
| Peut voir | `Can view` | Lecture seule |
| Peut commenter | `Can comment` | Lecture + commentaires |
| Peut modifier | `Can edit` | Lecture + écriture |
| Accès complet | `Full access` | Gestion du projet |

**Est-ce le même type d'autorisation que Espaces de travail > Membres ? Non — deux vocabulaires distincts :**

- **Côté workspace** : des rôles hiérarchiques (`owner/admin/member/viewer`) avec un rang numérique, appliqués par le serveur sur chaque route (`ROLE_RANK`, server.js:193 ; `requireWorkspace`).
- **Côté projet** : des niveaux à plat (`Can view/comment/edit/Full access`, modals.js:195) stockés **en texte anglais dans le document du projet**, dans `p.perms[memberId]` (modals.js:208, 241).

**⚠️ Point crucial — application réelle :** le serveur **préserve** `p.perms` (server.js:1002, 1835, 834) mais **ne le lit jamais pour autoriser quoi que ce soit**. Aucune route ne vérifie « cette personne est `Can view` donc elle ne peut pas éditer ». Les règles effectives côté serveur sont :

- qui **voit** le projet : le prédicat à trois termes — `public ∨ membre ∈ p.members ∨ l'équipe du membre ∈ p.teams` — c'est le **modèle complet** (`projectIsPrivate` server.js ; `canSeeProject` server.js ; `memberCanReadProject` server.js ; filtre `hiddenFor` server.js) ;
- qui **gère** le projet : rôle workspace Owner/Admin **ou** responsable du projet (`canManageProject`, server.js:776-779) ;
- qui **écrit** des tâches : rôle workspace ≥ member — un `viewer` workspace est bloqué en 403 avant même d'atteindre le projet.

Les niveaux `Can view/comment/edit` sont donc aujourd'hui **affichés et modifiables côté client mais non appliqués côté serveur**. Seuls deux comportements sont réellement effectifs :

1. **Être dans la liste** (`p.members`, via le partage) donne accès au projet s'il est privé — c'est le niveau « peut voir » de fait.
2. **Le responsable du projet** est toujours « Accès complet », non modifiable (modals.js:241, 244-246) — et c'est effectif via `canManageProject`.

Valeurs par défaut à l'ajout : `Can edit` pour un membre, `Can comment` pour un Guest (modals.js:241).

## 3. Accès général : privé vs workspace

En bas du modal de partage, le sélecteur « Accès général » (modals.js:252) :

- **« Personnes invitées uniquement »** → `p.private = true` : seules les personnes invitées individuellement (`p.members`) et les membres des équipes liées (`p.teams`) voient le projet.
- **« Tout le monde chez {nom} »** → `p.private = false` : tout membre de l'espace voit le projet.

C'est le **seul** mécanisme de visibilité appliqué au niveau projet, et la règle est identique pour tous les rôles : un projet est visible ⟺ il n'est pas privé **ou** l'utilisateur figure dans `p.members` **ou** une de ses équipes figure dans `p.teams` (`canSeeProject` ; `projectIsPrivate` ; filtre client `canSee`, store.js). Le serveur applique ce prédicat à chaque lecture de document via `hiddenFor`.

**Le miroir MCP applique le même modèle** (`canReadProject`, mcp.js:182+), avec un unique écart documenté : le miroir conserve un contournement admin/owner (admin/owner bypass via `ROLE_RANK`, mcp.js:184) — l'équivalence serveur ↔ miroir est vérifiée par les tests de parité (test/mcp.test.mjs).

## 4. Nouveau projet : visibilité par défaut

**Comportement actuel : un nouveau projet est visible par tout l'espace.** Le formulaire de création (`projectModal`, modals.js:158-194) ne contient **aucun champ de visibilité** (nom, description, icône, couleur, équipes, responsable, échéance, template seulement), et `createProject` ne définit ni `private` ni liste d'accès (actions.js:1503-1536). Il n'existe **aucun workflow à la création** demandant « qui peut voir ce projet » — la vérification faite dans le code est explicite.

**Pour obtenir « seules les personnes invitées voient le contenu »**, il faut donc après création : ouvrir Partager → Accès général → « Personnes invitées uniquement », puis ajouter les personnes.

Un futur toggle privé/public à la création est prévu (Phase 51, VIS-01) : une case dans `projectModal` écrivant `p.private` dès la création, plus un réglage workspace « projets privés par défaut ».

Deux garde-fous serveur existent : un projet privé doit avoir un responsable + des membres, sinon il est « déscellé » (redevient public) au boot (`normalizeProjects`, server.js:807-836).

## 5. Le modèle de visibilité depuis la Phase 50

**Une seule règle décide de l'accès : le prédicat à trois termes**

```
public ∨ (membre ∈ p.members) ∨ (une équipe du membre ∈ p.teams)
```

- **`p.members`** : liste explicite d'invités individuels (le partage ou les routes d'édition d'accès du projet).
- **`p.teams`** : **liens d'équipes vivants**. Le prédicat lit l'état **courant** des liens et des équipes (`team_members`) à **chaque** évaluation, sans cache : rejoindre une équipe donne accès à tous les projets liés à cette équipe **à la requête suivante** ; quitter l'équipe le retire — sauf si la personne figure aussi individuellement dans `p.members`. Les liens d'équipes sont édités via les routes admin/owner (interface prévue Phase 51).
- Les consommateurs au fil de l'envoi (relais d'emails, passe des rappels, digest) et le miroir MCP passent par le même prédicat (parité testée).

### Historique du modèle (pour lecture des anciens artifacts)

- **Avant Phase 49** : intersection équipes (`project.teams ∩ member.teams`) et « limites d'accès » par scope (Phase 29, inversion D-03).
- **Phase 49** : effondrement à `private + p.members` — les chemins équipe/scope furent matérialisés en entrées `p.members` puis `p.teams` supprimé. **Ce sweep n'existe plus** : `materializeVisibilityGrants`/`sweepNeeded` ont été supprimés du code ; les colonnes de scope sont dormantes (présentes en base, ignorées).
- **Phase 50 (D-50-5)** : `p.teams` **revient** comme lien vivant — décision du propriétaire (2026-11-08) qui remplace le modèle de matérialisation. La migration de démarrage `restoreTeamLinks()` reconvertisse les entrées d'équipe matérialisées par la Phase 49 en liens `p.teams[]` (à partir des sauvegardes d'avant-sweep quand elles existent ; à défaut, comportement fail-open : rien n'est modifié, un avertissement au boot nomme les espaces à relier manuellement). Les invitations individuelles authentiques sont préservées.

**Conséquence volontaire (Phase 50) :** l'appartenance à une équipe est la source d'accès vivante — un arrivant dans l'équipe voit les projets liés sans nouvelle invitation, un partant les perd (sauf invitation individuelle).

## Récapitulatif

| Question | Réponse courte |
|----------|----------------|
| Partager vs bonhomme | Même modal, deux boutons |
| Niveaux projet (voir/commenter/éditer/complet) | Vocabulaire distinct des rôles workspace ; stockés mais **non appliqués** côté serveur aujourd'hui |
| Seule exception effective | Le responsable = Accès complet ; la liste d'accès `p.members` ouvre un projet privé |
| Nouveau projet | Public par défaut, pas de workflow de visibilité à la création (toggle prévu Phase 51) |
| Équipes liées au projet | **Liens vivants** (`p.teams`, retour à la Phase 50) — l'appartenance à l'équipe donne/retire l'accès à la requête suivante, sauf invitation individuelle |
| Qui décide de la visibilité | `p.private` booléen + `p.members` explicite + `p.teams` vivant, même règle pour tous les rôles |
