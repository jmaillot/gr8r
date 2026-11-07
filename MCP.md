# MCP — connecter un agent AI (OpenCode & co) à Projects Studio

Projects Studio expose un serveur **MCP** (Model Context Protocol) sur `/mcp`, en
streamable HTTP. Un agent connecté peut consulter les projets, lister et rechercher
les tâches, en créer, les déplacer entre colonnes et commenter — dans **un seul
espace de travail**, avec une **clé API personnelle**.

- **Aucune dépendance runtime** (règle D-12 du projet) : le protocole JSON-RPC est
  implémenté à la main dans `mcp.js`, sur les modules intégrés de Node, comme
  `oidc.js` et `totp.js`.
- Chaque appel d'outil est tracé dans le journal d'audit (`action` préfixé `mcp.`)
  et limité à **60 requêtes/minute par clé** (au-delà : HTTP 429).

---

## 1. Créer une clé API

1. Connectez-vous à Projects Studio dans le navigateur (login + 2FA).
2. **Paramètres → Clés API** → « Nouvelle clé API ».
3. Choisissez :
   - **Libellé** — ex. « OpenCode — portable » ;
   - **Espace de travail** — la clé n'accédera qu'à celui-ci ;
   - **Permissions** — `Lecture seule` ou `Lecture + écriture` ;
   - **Expiration** — 30, 90 ou 365 jours (obligatoire, pas de clé permanente).
4. **Copiez la clé immédiatement** : elle n'est affichée qu'une seule fois. Le
   serveur n'en conserve que le hash SHA-256 ; une clé perdue se remplace.

La clé ressemble à :

```
psk_live_9xk2…(43 caractères aléatoires)
```

Révoquer une clé (bouton « Révoquer » de la carte) coupe l'accès immédiatement.
Changer les permissions d'une clé (en base) invalide aussi les sessions MCP en
cours — le client doit refaire le handshake.

## 2. Configurer OpenCode

Dans `opencode.json` (ou via `/mcp` dans l'UI) :

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

Le transport est le streamable HTTP standard du protocole MCP : le client fait
`initialize`, envoie `notifications/initialized`, puis appelle `tools/list` et
`tools/call` avec l'en-tête `mcp-session-id` retourné. Le flux SSE serveur→client
(GET) n'est pas proposé ; le serveur ne pousse jamais de message spontané.

## 3. Outils exposés

Statuts natifs (identiques aux colonnes du tableau) :
`backlog` (Backlog) → `todo` (À faire) → `progress` (En cours) → `review` (À valider) → `done` (Terminé).

### Lecture (clé `read` ou `write`)

| Outil | Description |
|---|---|
| `list_projects` | Projets de l'espace, avec compteurs de tâches ouvertes/total. |
| `list_tasks` | Tâches, filtres `project`, `status`, `assignee`, `limit` (1–200, défaut 50). Triées par mise à jour décroissante. |
| `get_task` | Une tâche en détail : description, sous-tâches, dépendances, nb de commentaires. |
| `search_tasks` | Recherche plein-texte titres/descriptions/clés (insensible à la casse et aux accents), `limit` (défaut 20). |
| `list_members` | Membres de l'espace — les `id` servent au paramètre `assignee`. |
| `list_comments` | Commentaires d'une tâche, du plus ancien au plus récent. |

### Écriture (clé `write` + rôle au moins membre)

| Outil | Description |
|---|---|
| `create_task` | `project`, `title`, puis optionnels : `description`, `status` (défaut `todo`), `assignee`, `priority` (`urgent`/`high`/`medium`/`low`), `due` (`YYYY-MM-DD`), `labels` (≤10). |
| `update_task` | `title`, `description`, `due` (ou `null` pour effacer), `priority`, `labels`, `assignee` (ou `null` pour désattribuer). Pour changer de statut, utiliser `move_task`. |
| `move_task` | `id` + `status` cible — toute transition est permise, y compris retour en `backlog`. |
| `add_comment` | `task` + `text` (≤ 4000 caractères). L'auteur affiché est le propriétaire de la clé. |

Les réponses sont du JSON sérialisé dans le contenu texte de l'outil (`content[0].text`).

## 4. Sémantique de visibilité et de permissions

- **Un espace de travail, un utilisateur** : la clé est épinglée à l'espace choisi
  à la création et aux droits de son propriétaire. Si le propriétaire perd sa
  place dans l'espace (retrait, changement de rôle), la clé cesse de fonctionner.
- **Projets privés** : un agent ne voit que les projets publics, ceux où son
  propriétaire est membre, ou ceux partagés à ses équipes — exactement la même
  visibilité que dans le navigateur. Les tâches d'un projet invisible répondent
  « not found » (pas d'oracle d'existence).
- **Scope vérifié en base à chaque appel** : passer une clé `read` en `write`
  directement en base prend effet au prochain appel ; à l'inverse, une clé
  rétrogradée voit sa session MCP close (401 `mcpSessionStale`).
- **Écritures concurrentes** : les mutations passent par la même transaction
  immédiate que les synchronisations navigateur (lecture de la ligne courante,
  édition, `revision + 1`) — jamais d'écrasement aveugle.
- **Journal d'activité** : chaque écriture produit une entrée d'activité native
  (`created`, `moved`/`completed`, `renamed`, `assigned`, `commentedOn`…) au nom
  du propriétaire de la clé, rendue par la page Activité comme les autres.

## 5. Codes d'erreur HTTP

| Statut | Code | Signification |
|---|---|---|
| 401 | `mcpUnauthorized` | Absente, inconnue, révoquée, expirée, ou session d'une autre clé. |
| 401 | `mcpSessionStale` | Les permissions de la clé ont changé — refaire `initialize`. |
| 429 | `mcpTooManyRequests` | Limite de 60 requêtes/minute par clé atteinte. |
| 400 | `mcpInvalidRequest` | Corps non JSON / trop volumineux. |
| 405 | `methodNotAllowed` | Méthode non POST/DELETE (pas de flux GET). |

Les erreurs métier (tâche introuvable, clé en lecture seule, argument inconnu…)
arrivent en résultat d'outil avec `isError: true` et un message lisible.

## 6. Détails d'implémentation

- **Endpoint** : `POST /mcp` (JSON-RPC 2.0), `DELETE /mcp` (fermeture de session),
  monté avant la chaîne `/api/` dans `server.js`.
- **Clés** : table `api_keys` (hash, préfixe d'affichage, scope, expiration
  obligatoire, révocation douce). Routes navigateur : `GET/POST /api/keys`,
  `DELETE /api/keys/:id` — protégées par la session + 2FA et la garde same-origin.
- **Audit** : chaque appel d'outil écrit dans `audit_log` (`mcp.<outil>` et
  `mcp.<outil>.error`), visible dans la carte Journal d'audit des opérateurs.
- **Fichier** : tout le protocole et les outils vivent dans `mcp.js` ; la
  migration Postgres future n'aura à remplacer que le handle `db` transmis par
  `server.js` (le document d'espace reste une colonne JSON opaque).
