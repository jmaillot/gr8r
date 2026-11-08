# Permissions — Espaces de travail

> Documenté à partir du code réel (server.js + src/). Les références `fichier:ligne` permettent de vérifier chaque affirmation.

## 1. Membres — scope de chaque rôle

Quatre rôles existent côté serveur : `owner`, `admin`, `member`, `viewer` (contrainte CHECK sur `memberships.role`, server.js:214-220). L'interface affiche `Owner / Admin / Member / Guest` — **« Guest » est en réalité le rôle `viewer`**, pas un rôle distinct (src/actions/actions.js:1785-1788).

| Rôle UI | Rôle DB | Scope | Peut faire quoi |
|---------|---------|-------|-----------------|
| Owner | `owner` | **Workspace entier**, toujours | Tout ce qu'un admin peut, + gérer/rétrograder les admins, transférer la propriété, supprimer l'espace (server.js:4188-4212, 4140) |
| Admin | `admin` | **Workspace entier** | Inviter (tous rôles), gérer les membres et leurs équipes, modifier les réglages de l'espace, révoquer des sessions. Les anciennes « limites d'accès » (scope) n'existent plus côté serveur depuis la Phase 49 — les colonnes correspondantes sont vides et ignorées (voir ProjectPermissions.md §5) |
| Member | `member` | Workspace entier | Voir les projets non privés + les privés dont il est explicitement membre (`p.members`) ou dont une équipe liée inclut son équipe (`p.teams`, lien vivant), créer/éditer des tâches, créer des projets (si le toggle est actif), inviter des viewers sur les projets qui l'autorisent, commenter |
| Guest | `viewer` (= Guest) | Lecture seule | Lecture + commentaires sur les projets auxquels il a été explicitement ajouté (`p.members`, y compris via l'invitation d'un membre sur un projet autorisé). 403 `readOnlyAccess` sur toute route ≥ member |

**En résumé :** le rôle est toujours **au niveau de l'espace de travail** (workspace), jamais au niveau d'une équipe. Il n'existe plus de périmètre par membre : la visibilité est décidée par le flag privé de chaque projet, sa liste explicite `p.members` et ses liens d'équipes vivants `p.teams` (voir ProjectPermissions.md). Depuis la Phase 50 (D-50-10/11), **« guest » n'est qu'un nom d'affichage du rôle `viewer`** : les restrictions passent par les vérifications de rôle existantes (pas de réglages d'espace, pas d'écriture), sans modèle de données distinct.

## 2. Équipes — le formulaire d'invitation

Lors de l'invitation (`inviteModal`, src/overlays/modals.js:259-310), vous choisissez : un ou plusieurs emails, un rôle (`Member / Admin / Guest`), et des équipes à rejoindre.

### Pourquoi Admin = « juste l'équipe »

Quand le rôle sélectionné est **Admin**, la section « Limites d'accès » disparaît entièrement du formulaire (modals.js:286-294). Depuis la Phase 49 cette section n'a plus d'effet pour **aucun** rôle : le serveur n'accepte, ne stocke et ne renvoie plus aucun scope — les colonnes `memberships.scope`/`invites.scope` sont vidées à la migration et ignorées ensuite. Les sélecteurs qui restent dans l'interface sont un résidu client, retiré à la Phase 51.

### Les « options supplémentaires de limites d'accès » (résidu d'interface)

Les sélecteurs « Projets visibles » / « Équipes qui étendent la portée » (modals.js:290-291, actions.js) envoient encore un objet `scope = { teams: [], projects: [] }`, mais **le serveur l'ignore désormais intégralement** : aucune route ne le valide, ne le stocke ni ne le renvoie (Phase 49, MIG-02). La visibilité d'un membre est uniquement : projets non privés de l'espace + projets privés où il figure dans `p.members`.

**Historique (avant Phase 49) :** un scope absent ou `null` donnait tout l'espace ; un scope `{teams:[], projects:[]}` vide était interprété workspace-wide ; un projet lié à une équipe scopée ouvrait ce projet au membre. Toutes ces valeurs stockées ont été **matérialisées en entrées explicites de `p.members`** par la migration de démarrage, puis effacées — personne n'a perdu ni gagné de visibilité lors du basculement (égalité d'ensemble vérifiée par test, test/visibility-migration.test.mjs).

## 3. Le toggle « Invité externe » (supprimé côté serveur — Phase 50)

Le toggle (`modal.guestToggle` = « Invité externe (projet unique) », fr.json:760) était le miroir du rôle Guest dans le select de rôle. **Depuis la Phase 50 (D-50-10), il n'existe plus côté serveur** : le terme « guest » a disparu du modèle de données — les lignes `role='guest'` de `memberships`/`invites` sont normalisées en `'viewer'` par la migration de démarrage `normalizeGuestRoles()`. Le serveur n'honore plus et ne reflète plus ce toggle ; sa suppression côté client est prévue à la Phase 51.

Un viewer reste simplement un lecteur dont la visibilité se résume aux projets auxquels il a été explicitement ajouté (`p.members`) — d'où le hint du modal : « Les invités ne voient que les projets auxquels ils sont ajoutés » (fr.json:1234). L'ancienne contrainte serveur « un seul projet » (`guestSingleProject`, basée sur le scope) a été retirée à la Phase 49 : **le même compte viewer peut figurer dans `p.members` de plusieurs projets** (INV-04).

## 4. Rôles et autorisations (tableau de la page Permissions)

Le tableau « Permissions par rôle » (`permsTable`, src/pages/members.js:100-118) récapitule :

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

⚠️ **Ce tableau est purement informatif** : les valeurs sont codées en dur, aucune logique ne le lit. L'application effective des droits passe par `requireWorkspace(req,res,slug,minRole)` sur chaque route serveur (server.js:2707-2721) — c'est le rang de rôle DB qui décide, pas ce tableau.

## 5. Paramètres > Espace de travail > Permissions

Trois toggles sont affichés (src/pages/settings.js:362-367) :

| Ligne | Intitulé | Default | À quoi ça sert (théoriquement) | Scope |
|-------|----------|---------|-------------------------------|-------|
| `permCreate` | « Les membres peuvent créer des projets » | Activé | Autoriser ou non les membres (non-admin) à créer des projets | Toute la workspace |
| `permGuests` | « Les membres peuvent inviter des invités » | Activé | ~~Autoriser les membres à inviter des guests~~ **Supplanté à la Phase 50** : le réglage qui fait foi est le toggle **par projet** `p.allowInviteGuests` (voir ci-dessous) | Toute la workspace |
| `permPublic` | « Autoriser les liens de partage publics » | Désactivé | Autoriser les liens de partage publiques sur les projets | Toute la workspace |
| (tableau) | « Permissions par rôle » | — | Récapitulatif statique, voir §4 | Informationnel |

⚠️ **Important — état actuel :** ces trois toggles sont écrits dans `S.prefs` (les **préférences par utilisateur**, via `IN.prefToggle`, actions.js:2675-2678) et **aucun code serveur ne les lit** : `permCreate|permGuests|permPublic` n'apparaissent nulle part ailleurs. Ils sont donc **cosmétiques** — les décocher ne restreint rien. Toute la page est supprimée à la Phase 51.

## 6. Le toggle par projet « les membres peuvent inviter des invités » (Phase 50)

**C'est le seul réglage d'invitation de viewers qui a un effet réel (Phase 50, VIS-04) : `p.allowInviteGuests`, porté par le document du projet.**

- **Défaut OFF partout** (D2.0-1 / D-50-7) : un nouveau projet naît sans ce champ (= OFF), la création ne l'écrit jamais à true ; les projets existants migrent OFF.
- **Un membre** peut inviter un viewer **uniquement sur un projet précis** (le champ projet est obligatoire), avec le rôle plafonné à viewer, et **seulement si le toggle du projet est ON**. Sinon : refus (dont `inviteGuestToggleOff` quand le toggle est OFF).
- **Un admin/owner** n'est pas soumis au toggle (il peut inviter tous rôles, équipes comprises) — son chemin d'invitation est inchangé ; **les invitations d'équipes contournent le toggle** (D-50-9).
- **Le flip est réservé admin/owner** (route `PATCH /api/workspaces/:ws/projects/:pid`) — même le responsable d'un projet membre simple ne peut pas le retourner (D-50-8).
- **Ré-derivation fail-closed à l'acceptation** : une invitation de viewer acceptée après que le toggle est repassé OFF est refusée d'après l'état **courant** du doc, sans créer de compte ni consommer l'invitation (motif fail-closed Phase 33). Les viewers déjà membres ne sont pas touchés par un flip OFF.
- Le champ est épinglé côté `mergeClientDoc` : un PUT client obsolète ne peut pas le modifier ; une invitation de membre ne peut pas cibler une équipe (`inviteTeamsAdminOnly`).

Interface de ce toggle et de l'invitation de viewers : Phase 51.

## Récapitulatif du modèle à deux niveaux

1. **Niveau workspace** : rôle (`owner/admin/member/viewer`), appliqué par `requireWorkspace` sur chaque route serveur → détermine **ce que vous pouvez toucher dans l'espace** (les anciennes « limites d'accès » par scope ont été retirées à la Phase 49 ; le terme « guest » n'est plus qu'un label du rôle viewer, Phase 50).
2. **Niveau projet** : `p.private` (booléen) + `p.members` (liste explicite) + `p.teams` (liens d'équipes vivants) — la même règle s'applique à tous les rôles ; le droit d'inviter des viewers par un membre est réglé par le toggle par projet `p.allowInviteGuests` (défaut OFF, flip admin/owner) ; le miroir MCP conserve seul un contournement admin/owner (`ROLE_RANK`, mcp.js), divergence documentée couverte par les tests de parité (voir ProjectPermissions.md).
