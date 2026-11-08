# Permissions — Projets

> Documenté à partir du code réel (server.js + mcp.js + src/), mis à jour à la Phase 52 (sweep de vérification du jalon : références rafraîchies, vue de transparence documentée — D-52-10). Références `fichier:ligne` pour vérification.

## 1. Le bouton « Partager » et le petit bonhomme

Ils font exactement la même chose : les deux ouvrent le **modal de partage** (`shareModal`, src/overlays/modals.js:202). Le bouton « Partager » et l'icône personne sont deux points d'entrée vers le même composant — il n'y a qu'un seul modal de partage par projet.

## 2. Les niveaux d'autorisation par personne

Le modal permet d'ajouter des personnes au projet avec un niveau de permission :

| Label UI | Valeur stockée | Sens voulu |
|----------|----------------|------------|
| Peut voir | `Can view` | Lecture seule |
| Peut commenter | `Can comment` | Lecture + commentaires |
| Peut modifier | `Can edit` | Lecture + écriture |
| Accès complet | `Full access` | Gestion du projet |

**Est-ce le même type d'autorisation que Espaces de travail > Membres ? Non — deux vocabulaires distincts :**

- **Côté workspace** : des rôles hiérarchiques (`owner/admin/member/viewer`) avec un rang numérique, appliqués par le serveur sur chaque route (`ROLE_RANK`, server.js:207 ; `requireWorkspace`, server.js:3225-3240).
- **Côté projet** : des niveaux à plat (`Can view/comment/edit/Full access`, modals.js:195) stockés **en texte anglais dans le document du projet**, dans `p.perms[memberId]`.

**⚠️ Point crucial — application réelle :** le serveur **préserve** `p.perms` (server.js:899, 1094, 1950) mais **ne le lit jamais pour autoriser quoi que ce soit**. Aucune route ne vérifie « cette personne est `Can view` donc elle ne peut pas éditer ». Les règles effectives côté serveur sont :

- qui **voit** le projet : le prédicat à trois termes — `public ∨ membre ∈ p.members ∨ l'équipe du membre ∈ p.teams` — c'est le **modèle complet** (`projectIsPrivate` server.js:771 ; `canSeeProject` server.js:800-806 ; `memberCanReadProject` server.js:813-818 ; filtre `hiddenFor` server.js:851) ;
- qui **gère** le projet : rôle workspace Owner/Admin **ou** responsable du projet (**lead** — D-51-17, voir §4bis ; `canManageProject`, server.js:837-840 : `role admin/owner ∨ p.lead === memberId`) ;
- qui **écrit** des tâches : rôle workspace ≥ member — un `viewer` workspace est bloqué en 403 avant même d'atteindre le projet.

Les niveaux `Can view/comment/edit` sont donc aujourd'hui **affichés et modifiables côté client mais non appliqués côté serveur**. Seuls deux comportements sont réellement effectifs :

1. **Être dans la liste** (`p.members`, via le partage) donne accès au projet s'il est privé — c'est le niveau « peut voir » de fait.
2. **Le responsable du projet** est toujours « Accès complet », non modifiable — et c'est effectif via `canManageProject`.

Valeurs par défaut à l'ajout : `Can edit` pour un membre, `Can comment` pour un Guest.

## 3. Accès général : privé vs workspace

Dans le modal de partage, la ligne « Accès général » est depuis la Phase 51 une **case à cocher à deux états** qui remplace l'ancien sélecteur (D-51-1/2, modals.js:286) :

- **Décochée → « Personnes invitées uniquement »** (`modal.onlyInvited`) : le projet est privé (`p.private = true`) — seules les personnes invitées individuellement (`p.members`) et les membres des équipes liées (`p.teams`) le voient.
- **Cochée → « Tout le monde chez {nom} »** (`modal.everyoneAt`) : le projet est public dans l'espace — tout membre le voit.

Le contrôle réutilise les libellés existants (aucune nouvelle clé pour le contrôle lui-même) et n'apparaît que pour les gestionnaires du projet (`canManage`). Le flip est **optimiste avec retour arrière** (D-51-3) : l'interface bascule immédiatement (`IN.shareAccess` snapshot puis mutation), le changement est poussé en doc-sync, et en cas de refus serveur le snapshot est restauré avec un toast d'erreur localisé. Aucune route REST dédiée — le toggle passe par la même écriture de document que tout le reste.

C'est le **seul** mécanisme de visibilité appliqué au niveau projet, et la règle est identique pour tous les rôles : un projet est visible ⟺ il n'est pas privé **ou** l'utilisateur figure dans `p.members` **ou** une de ses équipes figure dans `p.teams` (`canSeeProject`, server.js:800-806 ; `projectIsPrivate`, server.js:771 ; filtre client `canSee`, store.js). Le serveur applique ce prédicat à chaque lecture de document via `hiddenFor` (server.js:851).

**Visibilité perdue côté client (Phase 51, D-51-4) :** quand un client actif perd l'accès à un projet (ex. quelqu'un bascule le projet en privé), la détection d'époque dans `applyDoc` enregistre les projets disparus (`S.ui.lostProjects`, store.js:244-281, déclenchée par l'hydratation du poll) et la route projet rend un état « introuvable » honnête et localisé (`stateNotFound`, src/pages/errors.js:16 ; branché sur `pageProject`, src/pages/project.js:42) — pas de suppression silencieuse, pas d'erreur brute.

**Le miroir MCP applique le même modèle** (`canReadProject`, mcp.js:183), avec un unique écart documenté : le miroir conserve un contournement admin/owner (admin/owner bypass via `ROLE_RANK`, mcp.js:185) — l'équivalence serveur ↔ miroir est vérifiée par les tests de parité (test/mcp.test.mjs).

## 3bis. Inviter une équipe (Phase 51)

Le modal de partage contient une **section « Équipes »** (D-51-5/6/9), visible pour les gestionnaires du projet (`canManage`) :

- Elle liste les équipes de l'espace **non encore liées** au projet, avec une action « Inviter l'équipe » par ligne ; les équipes déjà liées apparaissent dans la note inline avec une action de retrait, et sont exclues de la liste d'invitation.
- **Inviter une équipe confère le rôle Member — pas de choix de rôle sur l'action d'équipe** (D-51-7). Pour donner un rôle plus élevé à quelqu'un, il faut une **invitation individuelle séparée ; le rôle individuel prévaut sur le rôle dérivé de l'équipe**.
- La copie reflète la **sémantique vivante** (D-50-5, D-51-8) : les membres **actuels** de l'équipe ont accès, et l'accès suit l'appartenance à l'équipe — pas un instantané figé.
- Les deux actions (`shareTeamInvite` / `shareTeamRemove`, src/actions/actions.js:1737-1756) passent par le doc-sync uniquement (aucune route REST), suivent la même forme optimiste + restauration de snapshot que le toggle, et sont gated côté client par `canManageProject` — le serveur reste le contrôle réel (les PUT d'équipes membres non-managers sont refusés, épinglé par les tests de liens d'équipes).

## 4. Nouveau projet : visibilité par défaut, lead et restriction de création

**Comportement actuel (Phase 51 incluse) : un nouveau projet est visible par tout l'espace.** Le formulaire de création (`projectModal`) ne contient **aucun champ de visibilité**, et `createProject` ne définit ni `private` ni liste d'accès. Pour rendre un projet privé, on utilise après création le toggle du modal de partage (§3) — **le toggle vit dans le modal de partage, pas à la création** (D-51-1) ; la case « toggle privé à la création » envisagée plus tôt n'a pas été retenue.

**Création restreinte (`permCreate`, réglage réel depuis la Phase 51) :**

- Le réglage vit dans **Paramètres > Espace de travail** (onglet Général, settings.js:299) — la page Permissions a été supprimée (D-51-10, voir WorkspacePermissions.md). Il est stocké dans les préférences du doc et lu avec la convention phase-wide : `permCreate === true` signifie **restreint**.
- **Application serveur** (`mergeClientDoc`, server.js:1041) : le réglage est lu depuis le doc **stocké** à chaque requête (D-51-16 — effet immédiat, pas d'état en cache) ; un acteur sous admin qui introduit un id de projet inconnu se voit opposer un **refus ciblé** `projectCreateForbidden` qui **emprunte la réponse 200 du PUT** (server.js:1077-1081, canal de réponse server.js:4703-4706) — le reste du PUT fusionne normalement, sans casser les éditions concurrentes. Chaque refus est journalisé.
- **Côté client** : avec la restriction active, un membre sous admin voit le bouton de création **désactivé avec une infobulle** (« réservé aux admins ») — jamais caché (D-51-14, src/pages/projects.js:30-32) ; une tentative refusée (ex. client non à jour) est mappée **uniquement** sur le code `projectCreateForbidden` et affiche un toast localisé avec annulation de l'insertion optimiste (src/actions/actions.js:1605-1622).

**Le créateur devient responsable du projet — rôle `lead` (D-51-17, changement de jalon) :**

- À la création par un membre, le serveur pose **`p.lead = créateur`** (server.js:1084-1090, dans `mergeClientDoc` — pas seulement côté client) — le créateur voit et gère son propre projet, même privé.
- Le lead est un **rôle par projet** avec des **droits de gestion sur ce projet** (membres, toggles, réglages) : il gère via `canManageProject` (server.js:837-840) = `role admin/owner ∨ p.lead === memberId`. **Les droits admin/owner du workspace restent inchangés et priment toujours.** Le lead n'a pas d'autres pouvoirs : la visibilité reste le prédicat à trois termes (§5), et le flip de `p.allowInviteGuests` reste réservé admin/owner (voir WorkspacePermissions.md §6).
- Cette décision **supersède partiellement D-50-1** (« pas de rôles par projet ») : le prédicat de visibilité, le gating `canManage` du modal de partage, l'épinglage `mergeClientDoc`, la vue de transparence (§6) en tiennent compte.

Deux garde-fous serveur existent toujours : un projet privé doit avoir un responsable + des membres, sinon il est « déscellé » (redevient public) au boot (`normalizeProjects`, server.js:872-901). Depuis D-51-17, un projet privé créé par un membre a naturellement son créateur comme lead+member — le cas du custodian injecté n'est plus nécessaire.

## 5. Le modèle de visibilité depuis la Phase 50

**Une seule règle décide de l'accès : le prédicat à trois termes**

```
public ∨ (membre ∈ p.members) ∨ (une équipe du membre ∈ p.teams)
```

- **`p.members`** : liste explicite d'invités individuels (le partage ou les routes d'édition d'accès du projet).
- **`p.teams`** : **liens d'équipes vivants**. Le prédicat lit l'état **courant** des liens et des équipes (`team_members`) à **chaque** évaluation, sans cache : rejoindre une équipe donne accès à tous les projets liés à cette équipe **à la requête suivante** ; quitter l'équipe le retire — sauf si la personne figure aussi individuellement dans `p.members`. Les liens sont édités depuis le modal de partage (section Équipes, §3bis) par les gestionnaires du projet.
- Les consommateurs au fil de l'envoi (relais d'emails, passe des rappels, digest) et le miroir MCP passent par le même prédicat (parité testée). La vue de transparence admin (§6) observe ce même prédicat projet par projet — elle ne le duplique pas.

### Historique du modèle (pour lecture des anciens artifacts)

- **Avant Phase 49** : intersection équipes (`project.teams ∩ member.teams`) et « limites d'accès » par scope (Phase 29, inversion D-03).
- **Phase 49** : effondrement à `private + p.members` — les chemins équipe/scope furent matérialisés en entrées `p.members` puis `p.teams` supprimé. **Ce sweep n'existe plus** : `materializeVisibilityGrants`/`sweepNeeded` ont été supprimés du code ; les colonnes de scope sont dormantes (présentes en base, ignorées).
- **Phase 50 (D-50-5)** : `p.teams` **revient** comme lien vivant — décision du propriétaire (2026-11-08) qui remplace le modèle de matérialisation. La migration de démarrage `restoreTeamLinks()` reconvertisse les entrées d'équipe matérialisées par la Phase 49 en liens `p.teams[]` (à partir des sauvegardes d'avant-sweep quand elles existent ; à défaut, comportement fail-open : rien n'est modifié, un avertissement au boot nomme les espaces à relier manuellement). Les invitations individuelles authentiques sont préservées.

**Conséquence volontaire (Phase 50) :** l'appartenance à une équipe est la source d'accès vivante — un arrivant dans l'équipe voit les projets liés sans nouvelle invitation, un partant les perd (sauf invitation individuelle).

## 6. La vue de transparence admin (Phase 52)

Depuis Espace de travail > Membres, chaque ligne est **dépliable par un admin/owner** : pour le membre choisi, l'endpoint `GET /api/workspaces/:slug/members/:memberId/visibility` (server.js:4977-5005) liste les projets lisibles — calculés **uniquement** via `memberCanReadProject` (server.js:813-818), jamais depuis le doc client expurgé — chacun accompagné de sa **première raison d'accès** en ordre d'entonnoir (`projectAccessReason`, server.js:828-836) : Tout le monde → Responsable (lead, D-51-17) → Membre → Équipe. La gate `requireWorkspace(..., 'admin')` est le contrôle réel ; le panneau refetch à chaque ouverture (sémantique vivante D-50-5/D-52-3) et la perte d'accès récente se traduit par l'état « introuvable » honnête (D-51-4, §3). La vue de soi du membre reste différée (v3).

## Récapitulatif

| Question | Réponse courte |
|----------|----------------|
| Partager vs bonhomme | Même modal, deux boutons |
| Niveaux projet (voir/commenter/éditer/complet) | Vocabulaire distinct des rôles workspace ; stockés mais **non appliqués** côté serveur aujourd'hui |
| Seule exception effective | Le responsable (lead, D-51-17) = Accès complet ; la liste d'accès `p.members` ouvre un projet privé |
| Nouveau projet | Public par défaut ; le créateur en devient le lead (D-51-17) ; création restreignable via `permCreate` (réglage serveur réel, refus ciblé `projectCreateForbidden`) |
| Toggle privé/public | Case à deux états dans le modal de partage (D-51-1/2), flip optimiste avec retour arrière (D-51-3) |
| Inviter une équipe | Section « Équipes » du modal de partage — rôle Member, invitation individuelle prévaut (D-51-7) ; sémantique vivante (D-50-5) |
| Équipes liées au projet | **Liens vivants** (`p.teams`, D-50-5) — l'appartenance à l'équipe donne/retire l'accès à la requête suivante, sauf invitation individuelle |
| Qui décide de la visibilité | `p.private` booléen + `p.members` explicite + `p.teams` vivant, même règle pour tous les rôles |
| Qui gère le projet | Workspace Owner/Admin **ou** lead (D-51-17) — `canManageProject`, server.js:837-840 |
| Voir l'accès d'un membre | Vue de transparence admin (§6) — endpoint `…/members/:memberId/visibility`, calculé par l'unique entonnoir, première raison d'accès par projet |
