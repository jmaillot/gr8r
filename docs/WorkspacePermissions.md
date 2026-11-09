# Permissions — Espaces de travail

> Documenté à partir du code réel (server.js + src/). Les références `fichier:ligne` permettent de vérifier chaque affirmation. Mis à jour à la Phase 52 (sweep de vérification du jalon : rafraîchissement des références, documentation de la vue de transparence admin — D-52-10).

## 1. Membres — scope de chaque rôle

Quatre rôles existent côté serveur : `owner`, `admin`, `member`, `viewer` (contrainte CHECK sur `memberships.role`, server.js:294). L'interface affiche `Owner / Admin / Member / Guest` — **« Guest » est en réalité le rôle `viewer`**, pas un rôle distinct (src/actions/actions.js:1817, 1891).

| Rôle UI | Rôle DB | Scope | Peut faire quoi |
|---------|---------|-------|-----------------|
| Owner | `owner` | **Workspace entier**, toujours | Tout ce qu'un admin peut, + gérer/rétrograder les admins, transférer la propriété, supprimer l'espace (server.js:4796, 4874) |
| Admin | `admin` | **Workspace entier** | Inviter (tous rôles), gérer les membres et leurs équipes, modifier les réglages de l'espace, révoquer des sessions, **déplier la vue de transparence d'un membre** (voir §7). Les anciennes « limites d'accès » (scope) n'existent plus côté serveur depuis la Phase 49 — les colonnes correspondantes sont vides et ignorées (voir ProjectPermissions.md §5) |
| Member | `member` | Workspace entier | Voir les projets non privés + les privés dont il est explicitement membre (`p.members`) ou dont une équipe liée inclut son équipe (`p.teams`, lien vivant), créer/éditer des tâches, créer des projets (sauf restriction `permCreate`, voir §5 — le créateur devient alors lead du projet, D-51-17), inviter des viewers sur les projets qui l'autorisent, commenter |
| Guest | `viewer` (= Guest) | Lecture seule | Lecture + commentaires sur les projets auxquels il a été explicitement ajouté (`p.members`, y compris via l'invitation d'un membre sur un projet autorisé). 403 `readOnlyAccess` sur toute route ≥ member |

**En résumé :** le rôle est toujours **au niveau de l'espace de travail** (workspace), jamais au niveau d'une équipe. Il n'existe plus de périmètre par membre : la visibilité est décidée par le flag privé de chaque projet, sa liste explicite `p.members` et ses liens d'équipes vivants `p.teams` (voir ProjectPermissions.md). Depuis la Phase 50 (D-50-10/11), **« guest » n'est qu'un nom d'affichage du rôle `viewer`** : les restrictions passent par les vérifications de rôle existantes (pas de réglages d'espace, pas d'écriture), sans modèle de données distinct.

## 2. Équipes — le formulaire d'invitation

Lors de l'invitation (`inviteModal`, src/overlays/modals.js:293), vous choisissez : un ou plusieurs emails, un rôle (`Member / Admin / Guest`), et des équipes à rejoindre.

### Pourquoi Admin = « juste l'équipe »

Quand le rôle sélectionné est **Admin**, la section « Limites d'accès » disparaît entièrement du formulaire (modals.js:369-378). Depuis la Phase 49 cette section n'a plus d'effet pour **aucun** rôle : le serveur n'accepte, ne stocke et ne renvoie plus aucun scope — les colonnes `memberships.scope`/`invites.scope` sont vidées à la migration et ignorées ensuite. Les sélecteurs qui restent dans l'interface sont un résidu client, retiré à la Phase 51.

### Les « options supplémentaires de limites d'accès » (résidu d'interface)

Les sélecteurs « Projets visibles » / « Équipes qui étendent la portée » (modals.js, actions.js) envoient encore un objet `scope = { teams: [], projects: [] }`, mais **le serveur l'ignore désormais intégralement** : aucune route ne le valide, ne le stocke ni ne le renvoie (Phase 49, MIG-02). La visibilité d'un membre est uniquement : projets non privés de l'espace + projets privés où il figure dans `p.members` ou accessible via une équipe liée vivante (voir ProjectPermissions.md §5).

**Historique (avant Phase 49) :** un scope absent ou `null` donnait tout l'espace ; un scope `{teams:[], projects:[]}` vide était interprété workspace-wide ; un projet lié à une équipe scopée ouvrait ce projet au membre. Toutes ces valeurs stockées ont été **matérialisées en entrées explicites de `p.members`** par la migration de démarrage, puis effacées — personne n'a perdu ni gagné de visibilité lors du basculement (égalité d'ensemble vérifiée par test, test/visibility-migration.test.mjs).

## 3. Le toggle « Invité externe » (supprimé côté serveur — Phase 50)

Le toggle (`modal.guestToggle` = « Invité externe (projet unique) », en.json:757) était le miroir du rôle Guest dans le select de rôle. **Depuis la Phase 50 (D-50-10), il n'existe plus côté serveur** : le terme « guest » a disparu du modèle de données — les lignes `role='guest'` de `memberships`/`invites` sont normalisées en `'viewer'` par la migration de démarrage `normalizeGuestRoles()`. Côté client, la case à cocher reste présente dans le formulaire d'invitation (modals.js:326) comme simple raccourci de rôle — elle sélectionne le rôle affiché « Guest » (c'est-à-dire `viewer`) ; le serveur n'honore et ne reflète aucun concept « invité externe » distinct.

Un viewer reste simplement un lecteur dont la visibilité se résume aux projets auxquels il a été explicitement ajouté (`p.members`) — d'où le hint du modal (« Les invités ne voient que les projets auxquels ils sont ajoutés… », `modal.guestsHint`, fr.json:798). L'ancienne contrainte serveur « un seul projet » (`guestSingleProject`, basée sur le scope) a été retirée à la Phase 49 : **le même compte viewer peut figurer dans `p.members` de plusieurs projets** (INV-04).

## 4. Rôles et autorisations (tableau des rôles)

Le tableau « Permissions par rôle » (`permsTable`, src/pages/members.js:124) est affiché sur la page **Espace de travail > Membres** (onglet Rôles, src/pages/members.js:56) avec l'intitulé `settings.perms.roleTable` — l'ancienne page Permissions n'existe plus (voir §5). Il récapitule :

| Action | Owner | Admin | Member | Guest |
|--------|:-----:|:-----:|:------:|:-----:|
| Voir les projets | ✓ | ✓ | ✓ | ✓ (son projet) |
| Commenter les tâches | ✓ | ✓ | ✓ | ✓ |
| Créer / éditer des tâches | ✓ | ✓ | ✓ | — |
| Créer des projets | ✓ | ✓ | ✓ | — |
| Inviter des membres | ✓ | ✓ | — | — |
| Gérer les rôles | ✓ | ✓ | — | — |
| Réglages de l'espace | ✓ | ✓ | — | — |
| Supprimer l'espace | ✓ | — | — | — |

⚠️ **Ce tableau est purement informatif** : les valeurs sont codées en dur, aucune logique ne le lit. L'application effective des droits passe par `requireWorkspace(req,res,slug,minRole)` sur chaque route serveur (server.js:3225-3240) — c'est le rang de rôle DB (`ROLE_RANK`, server.js:207) qui décide, pas ce tableau.

## 5. Paramètres > Espace de travail — état actuel (Phase 51)

**La page « Permissions » des réglages a été supprimée end-to-end à la Phase 51** (D-51-10..13) : entrée de navigation, corps de page, toggles et clés i18n (les clés orphelines sont détectées automatiquement par le garde i18n — aucune fuite de clé supprimée). Un lien profond obsolète (`?sec=permissions`) retombe sur le premier onglet au lieu d'un corps 404.

| Réglage | Destination à la Phase 51 | Effet réel |
|---------|---------------------------|------------|
| « Les membres peuvent créer des projets » (`permCreate`) | **Déplacé** dans l'onglet Général (settings.js:299), même clé et même persistance (`IN.prefToggle`) | **Réglage serveur réel depuis la Phase 51** : stocké dans les préférences du doc, lu à chaque requête (`permCreate === true` = restreint) ; un acteur sous admin qui crée un projet reçoit un refus ciblé `projectCreateForbidden` (server.js:1077-1081). Voir ProjectPermissions.md §4 |
| « Permissions par rôle » | **Déplacé** sur la page Membres (onglet Rôles, D-51-13) | Reste purement informatif (voir §4) |
| Les deux autres toggles de l'ancienne page | **Supprimés** — aucun remplacement | Le premier est supersédé par le toggle **par projet** `p.allowInviteGuests` (Phase 50, voir §6 — D-51-11) ; le second portait sur des liens de partage publics, un concept qui n'existe pas dans le modèle resserré (D-51-12) |

⚠️ **Point d'attention (héritage) :** l'ancienne page écrivait ces réglages dans les préférences **par utilisateur** sans qu'aucun code serveur ne les lise — ils étaient cosmétiques. Seul `permCreate` a été rendu réel (lecture du doc stocké dans `mergeClientDoc`) ; les deux autres sont morts avec la page, sans relocalisation.

## 6. Le toggle par projet « les membres peuvent inviter des invités » (Phase 50)

**C'est le seul réglage d'invitation de viewers qui a un effet réel (Phase 50, VIS-04) : `p.allowInviteGuests`, porté par le document du projet.**

- **Défaut OFF partout** (D2.0-1 / D-50-7) : un nouveau projet naît sans ce champ (= OFF), la création ne l'écrit jamais à true ; les projets existants migrent OFF.
- **Un membre** peut inviter un viewer **uniquement sur un projet précis** (le champ projet est obligatoire), avec le rôle plafonné à viewer, et **seulement si le toggle du projet est ON**. Sinon : refus (dont `inviteGuestToggleOff` quand le toggle est OFF).
- **Un admin/owner** n'est pas soumis au toggle (il peut inviter tous rôles, équipes comprises) — son chemin d'invitation est inchangé ; **les invitations d'équipes contournent le toggle** (D-50-9).
- **Le flip est réservé admin/owner** (route `PATCH /api/workspaces/:ws/projects/:pid`) — même le responsable d'un projet membre simple ne peut pas le retourner (D-50-8).
- **Ré-derivation fail-closed à l'acceptation** : une invitation de viewer acceptée après que le toggle est repassé OFF est refusée d'après l'état **courant** du doc, sans créer de compte ni consommer l'invitation (motif fail-closed Phase 33). Les viewers déjà membres ne sont pas touchés par un flip OFF.
- Le champ est épinglé côté `mergeClientDoc` : un PUT client obsolète ne peut pas le modifier ; une invitation de membre ne peut pas cibler une équipe (`inviteTeamsAdminOnly`).

Interface de ce toggle (Partager → accès) et de l'invitation de viewers : livrées à la Phase 51 — l'invitation de membres sur un projet autorisé et le toggle vivent dans le modal de partage (voir ProjectPermissions.md §3 et §3bis).

## 7. La vue de transparence admin (Phase 52)

**Chaque ligne de la page Espace de travail > Membres est dépliable (admin/owner uniquement)** : l'expansion liste les projets que CE membre peut lire, avec la raison d'accès de chacun. C'est une vue de diagnostic — elle ne change aucune sémantique de visibilité.

- **Endpoint : `GET /api/workspaces/:slug/members/:memberId/visibility`** (server.js:4977-5005), réservé aux **admins/owners** via `requireWorkspace(..., 'admin')` — la gate serveur est le contrôle réel, le chevron côté client n'est qu'un miroir UX. Un id de cible inconnu ou absent renvoie le **même 404 clé `notAMember`** (pas d'oracle d'existence).
- **Le calcul passe par l'UNIQUE entonnoir** : la liste est construite projet par projet avec `memberCanReadProject` (server.js:813-818) sur une copie de lecture normalisée du doc stocké — jamais depuis le doc client expurgé. Les équipes du membre sont résolues **une fois par requête** (motif `hiddenFor`, server.js:851), sans mémoïsation (D-50-3).
- **Une seule raison par projet, en ordre d'entonnoir** (D-52-5/D-52-6) : `projectAccessReason` (server.js:828-836) reproduit l'ordre de court-circuit de `canSeeProject` (server.js:800-806) — « Tout le monde » (projet non privé) → « Responsable » (lead, D-51-17) → « Membre » (`p.members`) → « Équipe » (lien d'équipe vivant). Ce sont des codes machine grossiers (`everyone`/`lead`/`member`/`team`) rendus en libellés localisés EN+FR côté client — jamais de noms d'équipes ni de listes d'accès.
- **Sémantique vivante** : le panneau **refetch à chaque ouverture** (D-52-3) — rejoindre/quitter une équipe peut changer l'accès entre deux ouvertions. Une expansion ouverte est un instantané daté de son ouverture.
- **Honnêteté sur la perte de visibilité** : si un admin bascule un projet en privé, le membre perd l'accès à la requête suivante et le projet disparaît de sa liste (comportement D-51-4 côté client, voir ProjectPermissions.md §3).
- **La vue de soi du membre** (chaque membre verrait sa propre visibilité) **n'existe pas** — elle reste différée à la v3.

## Récapitulatif du modèle à deux niveaux

1. **Niveau workspace** : rôle (`owner/admin/member/viewer`), appliqué par `requireWorkspace` sur chaque route serveur → détermine **ce que vous pouvez toucher dans l'espace** (les anciennes « limites d'accès » par scope ont été retirées à la Phase 49 ; le terme « guest » n'est plus qu'un label du rôle viewer, Phase 50). Les admins/owners disposent en plus de la vue de transparence dépliable (§7) pour diagnostiquer l'accès d'un membre.
2. **Niveau projet** : `p.private` (booléen) + `p.members` (liste explicite) + `p.teams` (liens d'équipes vivants) — la même règle s'applique à tous les rôles ; le droit d'inviter des viewers par un membre est réglé par le toggle par projet `p.allowInviteGuests` (défaut OFF, flip admin/owner) ; le miroir MCP conserve seul un contournement admin/owner (`ROLE_RANK`, mcp.js), divergence documentée couverte par les tests de parité (voir ProjectPermissions.md). Depuis la Phase 53, les **permissions par équipe** (`p.perms['team:'+teamId]`, quatre niveaux, précédence du meilleur rang) gated les **écritures de contenu** côté serveur — la visibilité reste booléenne (D-03) ; voir ProjectPermissions.md §5bis.
