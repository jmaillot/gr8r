# Permissions — Projets

> Documenté à partir du code réel (server.js + src/). Références `fichier:ligne` pour vérification.

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

- **Côté workspace** : des rôles hiérarchiques (`owner/admin/member/viewer`) avec un rang numérique, appliqués par le serveur sur chaque route (`ROLE_RANK`, server.js:130 ; `requireWorkspace`, 2707-2721).
- **Côté projet** : des niveaux à plat (`Can view/comment/edit/Full access`, modals.js:195) stockés **en texte anglais dans le document du projet**, dans `p.perms[memberId]` (modals.js:208, 241).

**⚠️ Point crucial — application réelle :** le serveur **préserve** `p.perms` (server.js:1007, 1671, 839) mais **ne le lit jamais pour autoriser quoi que ce soit**. Aucune route ne vérifie « cette personne est `Can view` donc elle ne peut pas éditer ». Les règles effectives côté serveur sont :

- qui **voit** le projet : `projectIsPrivate` + liste `p.members` + intersection équipes (`canSeeProject`/`memberCanReadProject`, server.js:650-693) + scope du membre (`hiddenFor`, 771-801) ;
- qui **gère** le projet : rôle workspace Owner/Admin **ou** responsable du projet (`canManageProject`, server.js:695-698) ;
- qui **écrit** des tâches : rôle workspace ≥ member (ex. server.js:4050, 4867) — un `viewer` workspace est bloqué en 403 avant même d'atteindre le projet.

Les niveaux `Can view/comment/edit` sont donc aujourd'hui **affichés et modifiables côté client mais non appliqués côté serveur**. Seuls deux comportements sont réellement effectifs :

1. **Être dans la liste** (via le partage) donne accès au projet s'il est privé — c'est le niveau « peut voir » de fait.
2. **Le responsable du projet** est toujours « Accès complet », non modifiable (modals.js:241, 244-246) — et c'est effectif via `canManageProject`.

Valeurs par défaut à l'ajout : `Can edit` pour un membre, `Can comment` pour un Guest (modals.js:241).

## 3. Accès général : privé vs workspace

En bas du modal de partage, le sélecteur « Accès général » (modals.js:252) :

- **« Personnes invitées uniquement »** → `p.private = true` : seules les personnes de la liste `p.members` (et les membres des équipes liées, voir §5) voient le projet.
- **« Tout le monde chez {nom} »** → `p.private = false` : tout membre de l'espace voit le projet.

C'est le seul mécanisme de visibilité réellement appliqué au niveau projet (`projectIsPrivate`, server.js:650-654 ; filtre client `canSee`, store.js:285-286).

## 4. Nouveau projet : visibilité par défaut

**Comportement actuel : un nouveau projet est visible par tout l'espace.** Le formulaire de création (`projectModal`, modals.js:158-194) ne contient **aucun champ de visibilité** (nom, description, icône, couleur, équipes, responsable, échéance, template seulement), et `createProject` ne définit ni `private` ni liste d'accès (actions.js:1503-1536). Il n'existe **aucun workflow à la création** demandant « qui peut voir ce projet » — la vérification faite dans le code est explicite.

**Pour obtenir « seules les personnes invitées voient le contenu »**, il faut donc après création : ouvrir Partager → Accès général → « Personnes invitées uniquement », puis ajouter les personnes.

**Votre idée de workflow est pertinente** et correspondrait à deux ajouts :
1. une case « Projets privés (invités uniquement) » dans `projectModal` (un toggle de plus, écrivant `p.private` dès la création) ;
2. si vous voulez une préférence globale, un réglage workspace « projets privés par défaut » — à noter que les toggles de la page Permissions actuels ne sont pas appliqués (voir WorkspacePermissions.md §5), il faudrait câbler ce réglage côté serveur.

Deux garde-fous serveur existent déjà et s'appliqueraient : un projet privé doit avoir un responsable + des membres, sinon il est « déscellé » (redevient public) au boot (server.js:825-838).

## 5. Le sélecteur d'équipes dans les paramètres du projet

Dans les paramètres d'un projet, la sélection d'équipes (« Un projet peut appartenir à plusieurs équipes », fr.json:756) stocke `p.teams[]`. **Son influence — elle ne fait qu'ouvrir des accès, jamais en fermer :**

| Effet | Détail |
|-------|--------|
| **Visibilité élargie** | Un projet **privé** lié à une équipe devient visible pour tout membre de cette équipe (intersection des lignes `team_members` live avec `p.teams`, server.js:662-693). Pour un projet public, l'effet est invisible (tout le monde voit déjà) |
| **Portée des membres scopés** | Pour un membre avec « limites d'accès », un projet entre dans son scope si ses équipes scopées intersectent `p.teams` (server.js:739-743) ; l'équipe scopée ouvre aussi les projets privés liés (server.js:763-769) |
| **Éligibilité à l'assignation** | Les membres des équipes liées sont considérés comme co-membres éligibles pour l'assignation de tâches (store.js:455-467 ; validation serveur server.js:1071-1090) |
| **Vue admin** | La grille des équipes affiche les projets rattachés à chaque équipe (members.js:120+) |

**En pratique :** attacher une équipe à un projet privé revient à dire « toute l'équipe a accès en lecture ». Pour un accès plus fin (une personne de l'équipe en écriture, une autre en lecture seule), il faudrait passer par la liste de partage individuelle — mais rappelez-vous que les niveaux fins n'y sont pas encore appliqués côté serveur (§2).

## Récapitulatif

| Question | Réponse courte |
|----------|----------------|
| Partager vs bonhomme | Même modal, deux boutons |
| Niveaux projet (voir/commenter/éditer/complet) | Vocabulaire distinct des rôles workspace ; stockés mais **non appliqués** côté serveur aujourd'hui |
| Seule exception effective | Le responsable = Accès complet ; la liste d'accès ouvre un projet privé |
| Nouveau projet | Public par défaut, pas de workflow de visibilité à la création (à ajouter) |
| Équipes du projet | Ouvre le projet privé aux membres des équipes + alimente le scope des membres limités ; jamais restrictif |
