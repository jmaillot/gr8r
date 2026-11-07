# Projects Studio — MCP : idées en attente

Fonctionnalités **non implémentées**, proposées lors de la revue du serveur MCP
(branche `feat/mcp`). Classées par rapport effort/valeur, à reprendre plus tard
si le besoin se confirme. Le serveur expose aujourd'hui 35 commandes
(voir `MCP.md`) ; tout ce qui suit est un ajout, pas un chantier ouvert.

---

## 1. Flux SSE serveur → client (`GET /mcp`)

**Protocole — effort moyen**

Aujourd'hui `GET /mcp` répond `405` : le serveur ne pousse jamais de message
spontané. Ouvrir le flux SSE (le transport streamable HTTP du protocole MCP le
prévoit) permettrait les notifications serveur → agent :

- « ta tâche a été déplacée », « un commentaire t'est adressé » ;
- `notifications/tools/list_changed` si de nouveaux outils apparaissent.

Utile surtout si **plusieurs agents** travaillent le même board en parallèle.
Pour un usage mono-agent qui interroge, le polling `list_notifications`
suffit — c'est pourquoi ce point est resté en attente.

## 2. MCP Resources

**Protocole — effort faible à moyen**

Exposer des ressources lisibles (`resources/list`, `resources/read`) en plus
des tools, que certains clients indexent différemment (contexte passif) :

- `projects-studio://workspace/labels` — le catalogue de labels ;
- `projects-studio://project/{KEY}/summary` — résumé d'un projet (statuts,
  compteurs, jalons, membres) ;
- `projects-studio://project/{KEY}/board` — snapshot des colonnes.

Les résumés seraient générés à la volée depuis le document d'espace, sans
nouvelle persistance.

## 3. Favoris

**App — effort trivial**

`toggle_fav` sur projets et tâches (le champ `fav` existe déjà dans les
documents). Intérêt limité côté agent ; à ne faire que si l'UI de l'agent
s'en sert (tri des réponses `list_projects` avec `fav` en premier, par
exemple).

## 4. Webhook sortant

**Hors MCP — effort moyen**

Un `POST` signé (HMAC) vers une URL déclarée par clé API à chaque mutation
(`task.created`, `task.moved`, `comment.added`…). Permet de brancher des
systèmes **non-agents** : CI, Slack, automations n8n/Zapier. Nécessite :

- une table `webhooks` (url, secret, clé, événements) ;
- la config UI sur la carte Clés API ;
- la livraison avec retry + désactivation après échecs répétés.

## 5. Pièces jointes

**App — effort élevé (binaire)**

`attach_file` via MCP implique un upload binaire (multipart ou base64 dans
`tools/call`), du stockage, et des limites de taille. Le champ
`attachments` existe déjà sur les tâches mais le client web n'en fait
qu'un usage léger. À ne considérer que si un agent doit réellement déposer
un artefact (rapport de tests, capture…).

## 6. Gestion fine des invitations / rôles

**App — effort moyen**

`invite_member`, `change_role` — aujourd'hui réservées à l'UI d'admin.
Délibérément écarté : donner à un agent le pouvoir de faire entrer des gens
dans l'espace pose un problème de confiance disproportionné avec le gain.
Ne l'ouvrir que derrière un scope dédié (`admin`) distinct de `write`.

---

## Recommandation si on reprend le chantier

1. **Resources (2)** d'abord — faible coût, complément naturel des tools.
2. **Webhook sortant (4)** si l'usage s'étend au-delà des agents.
3. SSE (1) seulement en cas de multi-agents constaté.

Le point de départ documenté reste `MCP.md` (manuel des 35 commandes) et
`mcp.js` (registre `TOOLS` — chaque ajout suit le même schéma : entrée
déclarative + schéma d'arguments maison, contrainte zéro-dépendance D-12).
