# Projects Studio — Serveur MCP

Guide complet du serveur MCP (Model Context Protocol) de Projects Studio :
installation, connexion d'un agent (OpenCode, Claude Desktop, Cursor…), et
**le manuel d'utilisation de chacune des 35 commandes**, avec paramètres et
exemples d'appels/réponses.

- Transport : streamable HTTP, endpoint `https://<domaine>/mcp`
- Zéro dépendance runtime (protocole implémenté à la main dans `mcp.js`)
- Un agent = une clé API = **un espace de travail**
- Audit complet de chaque appel dans le journal d'audit (`mcp.<outil>`)
- Limite : 60 requêtes/minute par clé (HTTP 429 au-delà)

---

## Sommaire

1. [Créer une clé API](#1-créer-une-clé-api)
2. [Connecter l'agent](#2-connecter-lagent)
3. [Lier un dossier local à un projet](#3-lier-un-dossier-local-à-un-projet)
4. [Concepts](#4-concepts)
5. [Manuel des commandes](#5-manuel-des-commandes)
   - [Contexte](#contexte) — `whoami`, `list_projects`, `get_project`, `list_members`, `list_teams`, `list_labels`, `list_notifications`, `list_activity`
   - [Tâches — lecture](#tâches--lecture) — `list_tasks`, `get_task`, `search_tasks`, `list_comments`
   - [Tâches — écriture](#tâches--écriture) — `create_task`, `create_tasks`, `update_task`, `move_task`, `reorder_task`, `handoff_task`, `archive_task`, `restore_task`
   - [Sous-tâches & dépendances](#sous-tâches--dépendances) — `add_subtask`, `toggle_subtask`, `rename_subtask`, `remove_subtask`, `set_dependencies`
   - [Commentaires](#commentaires) — `add_comment`, `delete_comment`
   - [Projets — écriture](#projets--écriture) — `create_project`, `update_project`, `add_milestone`, `remove_milestone`, `add_project_member`, `remove_project_member`, `archive_project`, `restore_project`
   - [Prompts](#prompts) — `daily-standup`, `triage-backlog`, `prepare-review`
6. [Erreurs](#6-erreurs)
7. [Notes d'implémentation](#7-notes-dimplémentation)

---

## 1. Créer une clé API

1. Connectez-vous à Projects Studio dans le navigateur (login + 2FA).
2. **Paramètres → Clés API** → « Nouvelle clé API ».
3. Renseignez :
   - **Libellé** — ex. « OpenCode — portable » (affiché dans la liste des clés) ;
   - **Espace de travail** — la clé n'accédera **qu'à celui-ci**, pour toujours ;
   - **Permissions** — `Lecture seule` (les 12 outils de lecture) ou `Lecture + écriture` (les 35) ;
   - **Expiration** — 30, 90 ou 365 jours (obligatoire, pas de clé permanente).
4. **Copiez la clé immédiatement** : elle n'est affichée qu'une seule fois. Le
   serveur ne stocke que son hash SHA-256 ; une clé perdue se remplace.

La clé ressemble à `psk_live_` suivi de 43 caractères aléatoires.

Révoquer une clé (bouton « Révoquer » de la carte) coupe l'accès immédiatement.
Si les permissions d'une clé sont modifiées en base, ses sessions MCP en cours
sont closes (`401 mcpSessionStale`) — le client refait le handshake.

## 2. Connecter l'agent

### OpenCode

Dans `opencode.json` (global `~/.config/opencode/opencode.json`, ou par projet) :

```json
{
  "mcp": {
    "projects-studio": {
      "type": "remote",
      "url": "https://votre-domaine.example/mcp",
      "headers": {
        "Authorization": "Bearer psk_live_…"
      }
    }
  }
}
```

### Claude Desktop / Cursor

Ces clients utilisent la même shape `mcpServers` standard :

```json
{
  "mcpServers": {
    "projects-studio": {
      "url": "https://votre-domaine.example/mcp",
      "headers": { "Authorization": "Bearer psk_live_…" }
    }
  }
}
```

Le protocole est le streamable HTTP standard : `initialize` →
`notifications/initialized` → `tools/list` / `tools/call` avec l'en-tête
`mcp-session-id` retourné par `initialize`. Le flux SSE serveur→client (GET)
n'est pas proposé — le serveur ne pousse jamais de message spontané.

## 3. Lier un dossier local à un projet

Le serveur MCP ne voit pas votre système de fichiers. La correspondance
dossier → projet vit dans le repo, là où l'agent la lit à chaque session
(c'est l'équivalent de l'URL git que Kanzo stocke dans ses réglages) :

```markdown
<!-- AGENTS.md à la racine du repo -->
## Projects Studio
Le MCP `projects-studio` est connecté à l'espace « Acme ».
Toute tâche de ce repo vit dans le projet `KAN` (Kanban).
```

Les outils acceptent **le préfixe de clé** partout où un projet est attendu
(`create_task {"project": "KAN"}`), et `whoami` renvoie la carte des projets —
pas besoin d'ids internes ni d'aller-retours.

## 4. Concepts

**Statuts de tâche** (colonnes du tableau) :

| id | Colonne |
|---|---|
| `backlog` | Backlog |
| `todo` | À faire |
| `progress` | En cours |
| `review` | À valider |
| `done` | Terminé |

**Priorités** : `urgent`, `high`, `medium`, `low`.
**Statuts de projet** : `planning`, `active`, `risk`, `hold`, `complete`.
**Dates** : toujours `YYYY-MM-DD`. **Estimation** : chaîne libre, ex. `2d`, `4h`.

**Visibilité** : un agent voit exactement ce que voit son propriétaire dans le
navigateur — projets publics, projets privés dont il est membre ou partagés à
ses équipes. Une tâche d'un projet invisible répond « not found » (pas d'oracle
d'existence). Un `viewer` ne peut pas écrire, même avec une clé `write`.

**Références** : les paramètres `project` acceptent l'id interne **ou** le
préfixe de clé (`KAN`) ; `assignee` accepte l'id de membre, **l'email** ou le
**nom exact**. Les réponses sont du JSON dans `content[0].text`.

**Concurrence** : chaque écriture passe par la même transaction immédiate que
les synchronisations navigateur (lecture de la ligne courante, édition,
`revision + 1`) — jamais d'écrasement aveugle.

---

## 5. Manuel des commandes

Pour chaque commande : les paramètres (★ = obligatoire), un exemple
d'`arguments` tel qu'envoyé dans `tools/call`, et la réponse.

### Contexte

#### `whoami`

Identifie la clé et l'espace — **à appeler en premier** quand on reprend une
session. Paramètres : aucun.

```json
{}
```

```json
{
  "workspace": { "id": "ws_default", "name": "Acme", "slug": "acme" },
  "user": { "id": "u1", "name": "Marie", "email": "marie@example.com" },
  "role": "Owner",
  "scope": "write",
  "keyPrefix": "psk_live_9xk2ab",
  "expiresAt": 1798761600000,
  "statuses": ["backlog", "todo", "progress", "review", "done"],
  "projects": [
    { "id": "p1", "key": "KAN", "name": "Kanban" },
    { "id": "p2", "key": "WEB", "name": "Site web" }
  ]
}
```

#### `list_projects`

Liste les projets avec compteurs de tâches. Paramètres : aucun.

```json
{}
```

```json
{
  "workspace": { "id": "ws_default", "name": "Acme", "slug": "acme" },
  "statuses": ["backlog", "todo", "progress", "review", "done"],
  "projects": [
    { "id": "p1", "key": "KAN", "name": "Kanban", "description": "Le board produit",
      "status": "active", "openTasks": 12, "totalTasks": 40 }
  ]
}
```

#### `get_project`

Le détail d'un projet.

| Param | Type | Notes |
|---|---|---|
| `project` ★ | string | id **ou préfixe de clé** (`KAN`) |

```json
{ "project": "KAN" }
```

Réponse : `id`, `key`, `name`, `description`, `status`, `private`, `lead`,
`leadName`, `members[]` (`{id, name}`), `milestones[]`, `tasksByStatus`
(compteurs par statut, tâches non archivées).

#### `list_members`

Les membres de l'espace — la source des `assignee`. Paramètres : aucun.

```json
{ "members": [ { "id": "m1", "name": "Marie", "email": "marie@example.com", "role": "Owner" } ] }
```

#### `list_teams`

Les équipes de l'espace (définitions + membres résolus). Paramètres : aucun.

```json
{
  "teams": [ { "id": "dev", "name": "Dév", "color": "#5B8DEF",
               "members": [ { "id": "m1", "name": "Marie" }, { "id": "m2", "name": "Karim" } ] } ]
}
```

#### `list_labels`

Le catalogue fermé des labels du workspace, avec compteurs de tâches non
archivées. Les tâches ne stockent que ces ids dans `labels[]`.

```json
{ "labels": [ { "id": "design", "tasks": 4 }, { "id": "bug", "tasks": 9 } ], "other": 0 }
```

#### `list_activity`

Le fil d'activité récent de l'espace, du plus récent au plus ancien, avec les
noms résolus.

| Param | Type | Défaut | Notes |
|---|---|---|---|
| `limit` | entier 1–100 | 30 | Nombre d'entrées |

```json
{ "limit": 5 }
```

```json
{
  "total": 5,
  "activity": [
    { "verb": "moved", "by": "m1", "byName": "Marie",
      "task": "t9", "taskTitle": "Corriger le tri",
      "project": "p1", "projectName": "Kanban",
      "at": 1762400000000, "extra": { "kind": "statusMoved", "from": "todo", "to": "progress" } }
  ]
}
```

Les verbes sont les mêmes que la page Activité de l'app : `created`, `moved`,
`completed`, `renamed`, `assigned`, `commentedOn`, `addedSubtaskTo`,
`completedSubtaskOn`, `reopenedSubtaskOn`, `archived`, `restored`,
`createdProject`, `projectStatusChanged`, `changedPriorityOf`,
`changedDueDateOf`, `changedStartDateOf`, `updatedLabelsOn`, `estimated`,
`updatedDependenciesOf`…

#### `list_notifications`

La boîte de réception de l'espace (mentions, attributions, déplacements),
du plus récent au plus ancien, avec les noms résolus.

| Param | Type | Défaut | Notes |
|---|---|---|---|
| `unreadOnly` | booléen | `false` | Ne montrer que les non-lues |
| `limit` | entier 1–100 | 30 | |

```json
{ "unreadOnly": true, "limit": 10 }
```

```json
{
  "total": 1,
  "notifications": [
    { "id": "n7", "to": "m1", "toName": "Marie", "type": "assigned", "by": "m2", "byName": "Karim",
      "task": "t42", "taskTitle": "Ajouter le mode sombre", "project": "p1", "projectName": "Kanban",
      "snippet": "", "at": 1762400000000, "read": false }
  ]
}
```

### Tâches — lecture

#### `list_tasks`

| Param | Type | Défaut | Notes |
|---|---|---|---|
| `project` | string | — | id ou préfixe de clé |
| `status` | enum | — | un des 5 statuts |
| `assignee` | string | — | id de membre (voir `list_members`) |
| `limit` | entier 1–200 | 50 | Triées par mise à jour décroissante |

```json
{ "project": "KAN", "status": "todo", "limit": 20 }
```

```json
{
  "total": 2,
  "tasks": [
    { "id": "t9", "key": "KAN-104", "title": "Corriger le tri", "status": "todo",
      "project": "p1", "projectKey": "KAN", "assignee": "m1", "assigneeName": "Marie",
      "priority": "high", "due": "2026-11-20", "labels": ["bug"],
      "subtasksTotal": 3, "subtasksDone": 1, "updated": 1762400000000 }
  ]
}
```

#### `get_task`

Une tâche en détail.

| Param | Type | Notes |
|---|---|---|
| `id` ★ | string | id de la tâche |

```json
{ "id": "t9" }
```

Réponse : tout de `list_tasks` plus `description` (HTML simple), `start`,
`estimate`, `dependencies` (ids), `subtasks[]` (`{id, title, done}` — les `id`
servent à `toggle_subtask`), `projectName`, `commentsCount`.

#### `search_tasks`

Recherche plein-texte (titres, descriptions, clés), insensible à la casse et
aux accents.

| Param | Type | Défaut | Notes |
|---|---|---|---|
| `query` ★ | string | — | ex. `tri`, `kan-104` |
| `limit` | entier 1–50 | 20 | |

```json
{ "query": "kan-104" }
```

#### `list_comments`

Les commentaires d'une tâche, du plus ancien au plus récent.

| Param | Type | Notes |
|---|---|---|
| `task` ★ | string | id de la tâche |

```json
{
  "task": "t9",
  "total": 1,
  "comments": [ { "id": "c1", "by": "m1", "authorName": "Marie", "at": 1762400000000, "text": "Reproduit sur staging." } ]
}
```

### Tâches — écriture

Toutes ces commandes exigent une clé `write` **et** un rôle au moins membre.

#### `create_task`

| Param | Type | Notes |
|---|---|---|
| `project` ★ | string | id ou préfixe de clé |
| `title` ★ | string ≤ 200 | |
| `description` | string ≤ 20000 | texte brut ou HTML simple |
| `status` | enum | défaut `todo` |
| `assignee` | string | id, **email** ou **nom exact** |
| `priority` | enum | `urgent`/`high`/`medium`/`low` |
| `due` | string | `YYYY-MM-DD` |
| `labels` | string[] ≤ 10 | ids du catalogue (`list_labels`) |
| `recur` | enum | `Daily` / `Weekly` / `Every 2 weeks` / `Monthly` — à l'accomplissement, l'échéance glisse automatiquement |

```json
{ "project": "KAN", "title": "Ajouter le mode sombre", "status": "backlog",
  "assignee": "marie@example.com", "priority": "medium", "due": "2026-12-01", "labels": ["ui"] }
```

```json
{ "created": true, "task": { "id": "t42", "key": "KAN-107", "title": "Ajouter le mode sombre", "status": "backlog", "assignee": "m1", "assigneeName": "Marie", "projectKey": "KAN", "due": "2026-12-01" } }
```

La clé de tâche (`KAN-107`) est séquencée automatiquement d'après les clés
existantes du projet.

#### `update_task`

Tous les paramètres sont optionnels sauf `id` ; seuls ceux fournis sont
modifiés. Champs date/`priority`/`assignee` acceptent `null` pour effacer.

| Param | Type | Notes |
|---|---|---|
| `id` ★ | string | |
| `title` | string ≤ 200 | |
| `description` | string ≤ 20000 | |
| `due` / `start` | string \| null | `YYYY-MM-DD`, ou `null` pour effacer |
| `estimate` | string \| null | ex. `2d`, `4h` |
| `priority` | enum \| null | |
| `labels` | string[] ≤ 10 | remplace la liste |
| `recur` | enum \| null | `Daily`/`Weekly`/`Every 2 weeks`/`Monthly`, ou `null` pour arrêter la récurrence |
| `assignee` | string \| null | id, email, nom exact — ou `null` pour désattribuer |

```json
{ "id": "t42", "priority": "high", "estimate": "3d", "due": null }
```

Pour changer de colonne, utiliser `move_task` (les verbes d'activité diffèrent :
`moved`/`completed` vs `changedPriorityOf` etc.).

#### `move_task`

Déplace une tâche dans une colonne — toute transition est permise.

| Param | Type | Notes |
|---|---|---|
| `id` ★ | string | |
| `status` ★ | enum | un des 5 statuts |

```json
{ "id": "t42", "status": "review" }
```

Aller vers `done` produit le verbe `completed` avec `extra.statusMoved` ;
les autres transitions produisent `moved`.

#### `reorder_task`

Change la position d'une tâche **dans sa colonne** (projet + statut inchangés).
Fournir exactement un des quatre indicateurs de position.

| Param | Type | Notes |
|---|---|---|
| `id` ★ | string | tâche à déplacer |
| `top` | booléen | place en tête de colonne |
| `bottom` | booléen | place en fin de colonne |
| `before` | string | id de la tâche devant laquelle s'insérer (même colonne) |
| `after` | string | id de la tâche derrière laquelle s'insérer (même colonne) |

```json
{ "id": "t42", "top": true }
```

```json
{ "reordered": true, "task": { "id": "t42", "order": 41.5, "columnSize": 7 } }
```

#### `create_tasks`

Crée plusieurs tâches **en une transaction** (max 20) — idéal quand un agent
découpe un ticket en sous-livrables : un seul aller-retour, atomicité garantie,
clés de tâche séquencées sans collision. Chaque élément de `tasks[]` porte les
champs de `create_task` **moins** `project`.

| Param | Type | Notes |
|---|---|---|
| `project` ★ | string | id ou préfixe de clé — commun à toutes les tâches |
| `tasks` ★ | object[] ≤ 20 | `{title ★, description, status, assignee, priority, due, labels, recur}` |

```json
{
  "project": "KAN",
  "tasks": [
    { "title": "Écrire les tests du tri", "priority": "high", "assignee": "marie@example.com" },
    { "title": "Mettre à jour la doc", "status": "backlog" }
  ]
}
```

```json
{ "created": 2, "tasks": [ { "id": "t51", "key": "KAN-108", "title": "Écrire les tests du tri", … }, { "id": "t52", "key": "KAN-109", … } ] }
```

#### `handoff_task`

Le geste de fin de travail d'un agent, **atomique** : déplace la tâche vers
`review`, réattribue optionnellement, et publie un commentaire de synthèse —
une transaction, un fil d'activité cohérent.

| Param | Type | Notes |
|---|---|---|
| `id` ★ | string | |
| `summary` | string ≤ 4000 | synthèse publiée en commentaire (vous comme auteur) |
| `assignee` | string | re-attribue avant le déplacement (id, email, nom) |

```json
{ "id": "t42", "assignee": "karim@example.com", "summary": "Mode sombre livré : tokens + tests visuels passés." }
```

```json
{ "handedOff": true, "task": { "id": "t42", "status": "review", "assignee": "m2", … }, "commentId": "c9" }
```

Idempotent : rappelé sans changement, il ne duplique pas l'entrée `moved` ;
le commentaire est republié seulement si `summary` est fourni.

#### `archive_task` / `restore_task`

Archiver rend la tâche invisible partout (elle reste en base, avec
`archivedAt`) ; restaurer la ramène.

```json
{ "id": "t42" }
```

### Sous-tâches & dépendances

#### `add_subtask`

| Param | Type | Notes |
|---|---|---|
| `task` ★ | string | id de la tâche |
| `title` ★ | string ≤ 200 | |

```json
{ "task": "t42", "title": "Choisir les tokens de couleur" }
```

```json
{ "added": true, "subtask": { "id": "b7c1…", "title": "Choisir les tokens de couleur", "done": false } }
```

#### `toggle_subtask`

Coche/décoche une sous-tâche. L'`id` vient de `get_task` (`subtasks[].id`) ;
à défaut, un `index` (base 0) fonctionne.

| Param | Type | Notes |
|---|---|---|
| `task` ★ | string | |
| `subtask` | string | id de la sous-tâche |
| `index` | entier ≥ 0 | utilisé si `subtask` absent |

```json
{ "task": "t42", "subtask": "b7c1…" }
```

```json
{ "toggled": true, "subtask": { "id": "b7c1…", "title": "Choisir les tokens de couleur", "done": true, "total": 4, "doneCount": 2 } }
```

#### `rename_subtask` / `remove_subtask`

Renommer ou supprimer une sous-tâche. Ces deux actions n'écrivent pas
d'entrée d'activité (cohérent avec le client web).

| Param | Type | Notes |
|---|---|---|
| `task` ★ | string | |
| `subtask` | string | id — obligatoire pour `rename_subtask` |
| `index` | entier ≥ 0 | accepté par `remove_subtask` si l'id n'est pas fourni |
| `title` | string ≤ 200 | obligatoire pour `rename_subtask` |

```json
{ "task": "t42", "subtask": "b7c1…", "title": "Choisir les tokens (v2)" }
{ "task": "t42", "index": 1 }
```

```json
{ "renamed": true }
{ "removed": true, "subtask": { "id": "b8d2…", "title": "Ancienne sous-tâche" } }
```

#### `set_dependencies`

Remplace **toute** la liste des dépendances blocked-by d'une tâche.

| Param | Type | Notes |
|---|---|---|
| `task` ★ | string | |
| `deps` ★ | string[] ≤ 50 | ids de tâches existantes ; auto-dépendance rejetée |

```json
{ "task": "t42", "deps": ["t9", "t12"] }
```

### Commentaires

#### `add_comment`

| Param | Type | Notes |
|---|---|---|
| `task` ★ | string | |
| `text` ★ | string ≤ 4000 | l'auteur affiché est le propriétaire de la clé |

```json
{ "task": "t42", "text": "Terminé côté CSS, reste les tests visuels." }
```

```json
{ "posted": true, "comment": { "id": "c8", "at": 1762400000000 } }
```

#### `delete_comment`

Supprime un commentaire — **uniquement les vôtres** (ceux postés par la clé
API). N'écrit pas d'entrée d'activité.

| Param | Type | Notes |
|---|---|---|
| `comment` ★ | string | id du commentaire (`list_comments`) |

```json
{ "comment": "c8" }
```

```json
{ "deleted": true }
```

### Prompts

Le serveur expose aussi trois **prompts** MCP (commands slash des clients),
disponibles via `prompts/list` et `prompts/get` :

| Prompt | Arguments | Usage |
|---|---|---|
| `daily-standup` | `project` ? | Prépare le standup : en cours, en review, bloqué — à partir des données réelles. |
| `triage-backlog` | `project` ★, `limit` ? | Analyse le Backlog, propose un ordre pour To-do, **attend confirmation** avant de déplacer. |
| `prepare-review` | `task` ★, `summary` ? | Prépare le handoff review : résumé proposé, puis (après accord) commentaire + `move_task` vers `review`. |

```json
{ "method": "prompts/get", "params": { "name": "triage-backlog", "arguments": { "project": "KAN" } } }
```

La réponse est un message `role: "user"` prêt à injecter dans la conversation
de l'agent. Les prompts à deux temps (`triage-backlog`, `prepare-review`)
demandent explicitement une confirmation humaine avant toute écriture.

### Projets — écriture

#### `create_project`

| Param | Type | Notes |
|---|---|---|
| `name` ★ | string ≤ 60 | |
| `key` | string | préfixe `A-Z0-9` (2–8 car.) ; dérivé du nom si absent, unicité vérifiée |
| `description` | string ≤ 2000 | |
| `status` | enum | défaut `active` |
| `private` | booléen | défaut `false` ; si privé, vous en êtes le membre initial et le lead |

```json
{ "name": "Kanban", "description": "Le board produit", "status": "active" }
```

```json
{ "created": true, "project": { "id": "p7", "key": "KANB", "name": "Kanban", "status": "active" } }
```

#### `update_project`

| Param | Type | Notes |
|---|---|---|
| `project` ★ | string | id ou préfixe de clé |
| `name` | string ≤ 60 | verbe d'activité `renamed` |
| `description` | string ≤ 2000 | |
| `status` | enum | `planning`/`active`/`risk`/`hold`/`complete` |

```json
{ "project": "KAN", "status": "hold" }
```

#### `add_milestone` / `remove_milestone`

Les jalons (`{name, date}`) apparaissent sur la vue d'ensemble du projet et la
timeline. `remove_milestone` cible par **nom exact** ou `index` (base 0).

| Param | Type | Notes |
|---|---|---|
| `project` ★ | string | id ou préfixe de clé |
| `name` ★ (`add`) | string ≤ 120 | |
| `date` ★ (`add`) | string | `YYYY-MM-DD` — date cible |
| `name` / `index` (`remove`) | string / entier | un des deux |

```json
{ "project": "KAN", "name": "Public launch", "date": "2026-12-15" }
```

```json
{ "added": true, "milestone": { "name": "Public launch", "date": "2026-12-15" }, "total": 3 }
```

#### `add_project_member` / `remove_project_member`

Gère l'accès à un projet (indispensable pour les projets **privés**). Réservé
au **lead du projet** ou à un **admin/owner** de l'espace — même règle que le
client web. `member` accepte id, email ou nom exact.

```json
{ "project": "KAN", "member": "karim@example.com" }
```

```json
{ "added": true, "member": { "id": "m2", "name": "Karim" } }
```

#### `archive_project` / `restore_project`

```json
{ "project": "KAN" }
```

---

## 6. Erreurs

**Erreurs HTTP** (avant tout travail de protocole) :

| Statut | Code | Signification |
|---|---|---|
| 401 | `mcpUnauthorized` | Clé absente, inconnue, révoquée, expirée — ou session d'une autre clé |
| 401 | `mcpSessionStale` | Les permissions de la clé ont changé — refaire `initialize` |
| 429 | `mcpTooManyRequests` | 60 requêtes/minute dépassées |
| 400 | `mcpInvalidRequest` | Corps non JSON / trop volumineux |
| 405 | `methodNotAllowed` | Méthode autre que POST/DELETE |

**Erreurs métier** : en résultat d'outil avec `isError: true` et un message
lisible — tâche introuvable, clé en lecture seule (« This API key is
read-only… »), argument inconnu, préfixe de projet inconnu, membre inconnu,
clé de projet déjà prise, auto-dépendance… Chaque erreur métier est aussi
audité (`mcp.<outil>.error`).

## 7. Notes d'implémentation

- **Endpoint** : `POST /mcp` (JSON-RPC 2.0), `DELETE /mcp` (fermeture de
  session), monté avant la chaîne `/api/` dans `server.js`.
- **Clés** : table `api_keys` (hash SHA-256, préfixe d'affichage, scope,
  expiration obligatoire, révocation douce). Routes navigateur :
  `GET/POST /api/keys`, `DELETE /api/keys/:id` — session + 2FA + same-origin.
- **Audit** : chaque appel écrit dans `audit_log` (`mcp.<outil>`, ou
  `mcp.<outil>.error`), visible dans la carte Journal d'audit des opérateurs.
- **D-12** : zéro dépendance runtime ; le protocole et les outils vivent dans
  `mcp.js`, sur les modules intégrés de Node.
- **Postgres futur** : le document d'espace reste une colonne JSON opaque ;
  la migration n'aura à remplacer que le handle `db` transmis par `server.js`.
