# Permissions — Espaces de travail

> Documenté à partir du code réel (server.js + src/). Les références `fichier:ligne` permettent de vérifier chaque affirmation.

## 1. Membres — scope de chaque rôle

Quatre rôles existent côté serveur : `owner`, `admin`, `member`, `viewer` (contrainte CHECK sur `memberships.role`, server.js:214-220). L'interface affiche `Owner / Admin / Member / Guest` — **« Guest » est en réalité le rôle `viewer`**, pas un rôle distinct (src/actions/actions.js:1785-1788).

| Rôle UI | Rôle DB | Scope | Peut faire quoi |
|---------|---------|-------|-----------------|
| Owner | `owner` | **Workspace entier**, toujours | Tout ce qu'un admin peut, + gérer/rétrograder les admins, transférer la propriété, supprimer l'espace (server.js:4188-4212, 4140) |
| Admin | `admin` | **Workspace entier** | Inviter (tous rôles), gérer les membres et leurs équipes, modifier les réglages de l'espace, révoquer des sessions. Les anciennes « limites d'accès » (scope) n'existent plus côté serveur depuis la Phase 49 — les colonnes correspondantes sont vides et ignorées (voir ProjectPermissions.md §5) |
| Member | `member` | Workspace entier | Voir les projets non privés + les privés dont il est explicitement membre (`p.members`), créer/éditer des tâches, créer des projets (si le toggle est actif), commenter |
| Guest | `viewer` (= Guest) | Lecture seule | Lecture + commentaires sur les projets auxquels il a été explicitement ajouté (`p.members`). 403 `readOnlyAccess` sur toute route ≥ member |

**En résumé :** le rôle est toujours **au niveau de l'espace de travail** (workspace), jamais au niveau d'une équipe. Depuis la Phase 49, il n'existe plus de périmètre par membre : la visibilité est décidée uniquement par le flag privé de chaque projet et sa liste explicite `p.members` (voir ProjectPermissions.md).

## 2. Équipes — le formulaire d'invitation

Lors de l'invitation (`inviteModal`, src/overlays/modals.js:259-310), vous choisissez : un ou plusieurs emails, un rôle (`Member / Admin / Guest`), et des équipes à rejoindre.

### Pourquoi Admin = « juste l'équipe »

Quand le rôle sélectionné est **Admin**, la section « Limites d'accès » disparaît entièrement du formulaire (modals.js:286-294). Depuis la Phase 49 cette section n'a plus d'effet pour **aucun** rôle : le serveur n'accepte, ne stocke et ne renvoie plus aucun scope — les colonnes `memberships.scope`/`invites.scope` sont vidées à la migration et ignorées ensuite. Les sélecteurs qui restent dans l'interface sont un résidu client, retiré à la Phase 51.

### Les « options supplémentaires de limites d'accès » (résidu d'interface)

Les sélecteurs « Projets visibles » / « Équipes qui étendent la portée » (modals.js:290-291, actions.js) envoient encore un objet `scope = { teams: [], projects: [] }`, mais **le serveur l'ignore désormais intégralement** : aucune route ne le valide, ne le stocke ni ne le renvoie (Phase 49, MIG-02). La visibilité d'un membre est uniquement : projets non privés de l'espace + projets privés où il figure dans `p.members`.

**Historique (avant Phase 49) :** un scope absent ou `null` donnait tout l'espace ; un scope `{teams:[], projects:[]}` vide était interprété workspace-wide ; un projet lié à une équipe scopée ouvrait ce projet au membre. Toutes ces valeurs stockées ont été **matérialisées en entrées explicites de `p.members`** par la migration de démarrage, puis effacées — personne n'a perdu ni gagné de visibilité lors du basculement (égalité d'ensemble vérifiée par test, test/visibility-migration.test.mjs).

## 3. Le toggle « Invité externe »

Le toggle (`modal.guestToggle` = « Invité externe (projet unique) », fr.json:760) **n'est pas un réglage séparé : c'est le miroir du rôle Guest** dans le select de rôle (modals.js:292 ; handlers `IN.invRole`/`IN.invGuest`, actions.js:1934-1942). Activer l'un met l'autre à jour.

Un guest est un `viewer` dont la visibilité se résume aux projets auxquels il a été explicitement ajouté (`p.members`) — d'où le hint du modal : « Les invités ne voient que les projets auxquels ils sont ajoutés » (fr.json:1234). L'ancienne contrainte serveur « un seul projet » (`guestSingleProject`, basée sur le scope) a été retirée avec le modèle de scope à la Phase 49 ; le même compte guest peut désormais figurer dans `p.members` de plusieurs projets.

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
| `permGuests` | « Les membres peuvent inviter des invités » | Activé | Autoriser les membres à inviter des guests (vs admins seulement) | Toute la workspace |
| `permPublic` | « Autoriser les liens de partage publics » | Désactivé | Autoriser les liens de partage publiques sur les projets | Toute la workspace |
| (tableau) | « Permissions par rôle » | — | Récapitulatif statique, voir §4 | Informationnel |

⚠️ **Important — état actuel :** ces trois toggles sont écrits dans `S.prefs` (les **préférences par utilisateur**, via `IN.prefToggle`, actions.js:2675-2678) et **aucun code serveur ne les lit** : `permCreate|permGuests|permPublic` n'apparaissent nulle part ailleurs. Ils sont donc **cosmétiques** aujourd'hui — les décocher ne restreint rien. Pour qu'ils soient effectifs, il faudrait les déplacer vers les réglages du workspace (doc workspace) et ajouter les gates correspondants côté serveur (création de projet, invitations guest, liens publics).

## Récapitulatif du modèle à deux niveaux

1. **Niveau workspace** : rôle (`owner/admin/member/viewer`), appliqué par `requireWorkspace` sur chaque route serveur → détermine **ce que vous pouvez toucher dans l'espace** (les anciennes « limites d'accès » par scope ont été retirées à la Phase 49).
2. **Niveau projet** : `p.private` (booléen) + `p.members` (liste explicite) — la même règle s'applique à tous les rôles ; le miroir MCP conserve seul un contournement admin/owner (`ROLE_RANK`, mcp.js:184), divergence documentée couverte par les tests de parité (voir ProjectPermissions.md).
