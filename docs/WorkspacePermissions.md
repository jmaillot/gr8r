# Permissions — Espaces de travail

> Documenté à partir du code réel (server.js + src/). Les références `fichier:ligne` permettent de vérifier chaque affirmation.

## 1. Membres — scope de chaque rôle

Quatre rôles existent côté serveur : `owner`, `admin`, `member`, `viewer` (contrainte CHECK sur `memberships.role`, server.js:214-220). L'interface affiche `Owner / Admin / Member / Guest` — **« Guest » est en réalité le rôle `viewer`**, pas un rôle distinct (src/actions/actions.js:1785-1788).

| Rôle UI | Rôle DB | Scope | Peut faire quoi |
|---------|---------|-------|-----------------|
| Owner | `owner` | **Workspace entier**, toujours | Tout ce qu'un admin peut, + gérer/rétrograder les admins, transférer la propriété, supprimer l'espace (server.js:4188-4212, 4140) |
| Admin | `admin` | **Workspace entier, jamais limité à une équipe** | Inviter (tous rôles), gérer les membres et leurs équipes/limites d'accès, modifier les réglages de l'espace, révoquer des sessions. Un scope stocké ne peut **jamais** restreindre un admin : `projectScope()` renvoie `null` (workspace-wide) dès que le rang ≥ admin (server.js:707-713). La promotion en admin efface le scope dans la même transaction (server.js:4223-4228) |
| Member | `member` | Workspace entier **par défaut**, ou restreint par des « limites d'accès » (scope) | Voir les projets autorisés, créer/éditer des tâches, créer des projets (si le toggle est actif), commenter |
| Guest | `viewer` (= Guest) | **Un seul projet** (voir §3) | Lecture seule + commentaires sur son projet unique. 403 `readOnlyAccess` sur toute route ≥ member (server.js:2707-2721) |

**En résumé :** le rôle est toujours **au niveau de l'espace de travail** (workspace), jamais au niveau d'une équipe. Ce qui peut être restreint à un périmètre (équipes + projets), c'est le **scope** du membre — et uniquement pour Member/Guest (§2).

## 2. Équipes — le formulaire d'invitation

Lors de l'invitation (`inviteModal`, src/overlays/modals.js:259-310), vous choisissez : un ou plusieurs emails, un rôle (`Member / Admin / Guest`), et des équipes à rejoindre.

### Pourquoi Admin = « juste l'équipe »

Quand le rôle sélectionné est **Admin**, la section « Limites d'accès » disparaît entièrement du formulaire (modals.js:286-294). C'est cohérent avec le modèle : un admin est workspace-wide par définition, lui donner un périmètre n'aurait pas de sens — le serveur **rejette** d'ailleurs toute tentative de scope sur une invitation admin (`scopeNotAllowed`, server.js:4467, 4308). Les équipes sélectionnées pour un admin servent simplement à ses rattachements d'équipe (visibilité dans les équipes, assignation), pas à limiter son accès.

### Pour Member/Guest : les « options supplémentaires de limites d'accès »

Deux sélecteurs apparaissent (labels fr.json:758-759), alimentant `scope = { teams: [], projects: [] }` envoyé au serveur (actions.js:1823-1838), stocké sur l'invitation puis sur le membership à l'acceptation (server.js:4511-4521) :

**« Projets visibles »** (`modal.scopeProjectsLabel`)
Liste explicite de projets ajoutés au périmètre du membre. Pour un membre avec scope, la règle est **« visible ⟺ dans le scope »** : un projet hors scope est caché, même s'il serait accessible par un autre chemin (server.js:739-743, 771-801).

**« Équipes qui étendent la portée »** (`modal.scopeTeamsLabel`)
Équipes dont le membre « hérite » la portée : tout projet lié à ces équipes entre dans son scope (intersection `p.teams` ∩ `scope.teams`, server.js:763-769). Lier une équipe à un projet **ouvre** donc ce projet aux membres scopés sur cette équipe — l'effet des équipes est purement **additif** (elles ne cachent jamais rien, server.js:664-671).

**Cas particuliers :**
- Scope absent ou `null` → le membre voit **tout l'espace** (comportement par défaut historique).
- Scope `{teams:[], projects:[]}` (vide) → également interprété workspace-wide (server.js:733-734).
- Le scope se modifie après coup : `PUT /members/:uid/scope` et `/teams` (server.js:4259-4365), soit la même paire de sélecteurs dans le modal d'édition de membre (« Limites d'accès », modals.js:68-98 — pour un admin, ils y apparaissent en lecture seule « workspace-wide »).

## 3. Le toggle « Invité externe »

Le toggle (`modal.guestToggle` = « Invité externe (projet unique) », fr.json:760) **n'est pas un réglage séparé : c'est le miroir du rôle Guest** dans le select de rôle (modals.js:292 ; handlers `IN.invRole`/`IN.invGuest`, actions.js:1934-1942). Activer l'un met l'autre à jour.

**Pourquoi pas de sélection de projet « en plus » quand Guest est coché ?** Parce que pour un guest, la sélection de projet **est** son accès : Guest = rôle `viewer` + scope réduit à **exactement un projet** (règle D-13). Le sélecteur « Projets visibles » passe en sélection unique (actions.js:1920-1924) et le serveur rejette un guest avec plus d'un projet (`guestSingleProject`, 400, server.js:4468). Il n'y a donc pas deux endroits où choisir des projets — le picker de la section « limites d'accès » sert aux deux cas (multi pour Member, unique pour Guest).

**« Externe » ne correspond à aucun mécanisme technique :** il n'existe ni flag `external`, ni logique de domaine email, ni table à part pour les guests dans le code. Un guest est simplement un `viewer` dont toute la visibilité se résume au projet auquel il a été ajouté — d'où le hint du modal : « Les invités ne voient que les projets auxquels ils sont ajoutés » (fr.json:1234).

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

1. **Niveau workspace** : rôle (`owner/admin/member/viewer`) + scope optionnel (équipes + projets, appliqué par `hiddenFor` sur chaque lecture/écriture de document, server.js:922-923, 988-990) → détermine **ce que vous pouvez toucher dans l'espace**.
2. **Niveau projet** : `p.private` + `p.members` + équipes liées → détermine **qui voit ce projet** (voir ProjectPermissions.md).
