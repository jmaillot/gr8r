# Templates — guide

Deux systèmes de templates coexistent :

1. **Les templates utilisateur** (Phase 66) — créés et gérés dans **Réglages → Modèles**,
   stockés dans le document du workspace (`doc.templates[]`), instanciables depuis la
   création de tâche ou de projet.
2. **Le catalogue de démarrage intégré** (hérité) — sept templates figés dans le code,
   proposés uniquement dans la modale « Nouveau projet » comme point de départ.

## 1. Templates utilisateur (Phase 66)

### Où ils vivent

Chaque record de `doc.templates[]` porte exactement :

```
{ id, kind: 'task'|'project', name, icon, color, body, position,
  createdBy, createdAt, updatedAt }
```

- `body` est **spécifique au kind** et whitelisté par construction (D-04) :
  - `task` → `title`, `notes`, `priority`, `subtasks[]` (arbre `{ id, parentId, position, title, done, note, dueOffsetDays }`)
  - `project` → `name`, `description`, `status`, `teams[]`, `tasks[]` (arbre de tâches
    template avec `dueOffsetDays`/`startOffsetDays`)
- Tout champ inconnu est **silencieusement supprimé** — jamais rejeté. Pas
  d'assignees/lead/membres/milestones nulle part (D-14).
- Les offsets (`dueOffsetDays`) sont **absolus** : chaque sous-tâche ancre au jour
  d'instanciation, jamais en chaîne sur la date calculée du parent (D-07). Un offset
  absent = pas de date à l'instanciation, jamais de défaut (D-08).

### Le funnel

`src/core/templates.js` (zéro import DOM, même discipline que `subtree.js`) :

- `normalizeTemplatesData(data, uid, { gate })` — le sink exécuté à **chaque** écriture
  et lecture du doc (mergeClientDoc, normalizeDoc, mirror MCP writeDoc) : sanitisation,
  rejet wholesale des arbres cyclés/trop profonds (`subtaskCycle`/`subtaskDepth`),
  heal in place des sous-tâches, renumérotation rank-préservée des `position` (D-03).
  Les records inchangés (corps byte-identique) sautent la validation wholesale.
- `instantiateTemplate(tmpl, uid, today, keyFn)` — le builder pur : ids régénérés
  (D-16), `parentId` des sous-tâches remappés old→new, dates = jour + offset.
- `landInstantiation(data, kind, built, opts)` — l'atterrissage en un seul `mutate` :
  projet (lead = créateur, `seq` 200+, clés `<KEY>-201…`, activity row) ou tâche.
- `templateFromItem(kind, item, today, extra)` — l'inverse : « Enregistrer comme
  modèle » depuis une tâche ou un projet vivant (offsets = date vivante − aujourd'hui).

### Les surfaces

- **Réglages → Modèles** : CRUD complet, deux onglets (Tâches / Projet). UI dans
  `src/features/template-ui.js` (lazy chunk) + modales dans `src/overlays/modals.js`.
- **Modale nouvelle tâche / nouveau projet** : bouton « Depuis un modèle »
  (`openTemplatePicker`, `src/actions/templates.js`) → instanciation immédiate.
- **Save-as** : `saveAsTemplate` sur une tâche/projet existant.

### Modifier / ajouter via le code

Les templates utilisateur sont des **données**, pas du code : pour pré-remplir un
workspace (seed, démo), injecter des records dans `doc.templates[]` — le funnel les
sanitise et les renumérote. Voir `test/*.test.mjs` (templates) pour des records
exemplaires conformes D-02/D-04.

## 2. Catalogue de démarrage intégré (hérité)

Proposé uniquement dans la modale « Nouveau projet » (et l'onboarding) comme jeu de
tâches de départ figé. Trois endroits :

1. **Le catalogue** — `src/overlays/modals.js` (tableau `TEMPLATES`) :

   ```js
   export const TEMPLATES = [
     { id: 'blank', icon: 'file', tasks: 0 },
     { id: 'product', icon: 'target', tasks: 6 },
     // … web, mkt, design, software, personal
   ];
   ```

   - `id` : valeur stable stockée ; **l'ordre du tableau = l'ordre d'affichage**.
   - `icon` : un nom [Lucide](https://lucide.dev) existant (`ic()` dans `src/core/icons.js`).
   - `tasks` : nombre de tâches de départ ; `0` affiche la description à la place.

2. **Les textes** — `src/locales/en.json` et `src/locales/fr.json`, clés
   `project.template.<id>.*` (`.name`, `.desc`, `.task.N`).

3. **La création** — `createProject(f, tmplId)` (`src/actions/actions.js`) : tâche 1 en
   `todo`/`high` assignée au créateur, les autres en `backlog`/`medium`, échéances
   échelonnées (+5 jours chacune). Cas `blank` : le projet s'ouvre sur l'onglet
   « overview ». Défaut onboarding : `tmpl: 'web'` dans `src/core/store.js`.

### Ajouter un template au catalogue

Exemple « event » :

```js
// src/overlays/modals.js
{ id: 'event', icon: 'calendar', tasks: 5 },
```

```json
// src/locales/en.json (et l'équivalent fr.json)
"project.template.event.name": "Event Planning",
"project.template.event.desc": "From concept to wrap-up",
"project.template.event.task.1": "Define goals & budget",
"project.template.event.task.2": "Book venue",
"project.template.event.task.3": "Send invitations",
"project.template.event.task.4": "Prepare materials",
"project.template.event.task.5": "Day-of checklist"
```

## Pièges à éviter

- **Oublier une locale** (catalogue intégré) : le nom s'affiche comme clé brute dans la
  langue manquante. La gate i18n scan (`npm run i18n:scan`) le refuse.
- **Désaligner `tasks` et les clés `task.N`** : titres cassés ou jamais utilisés.
- **Reconstruire des objets sous-tâche dans un passage template** : la whitelist
  Phase 65 mute **in place** — un `.map()` qui recrée les objets supprime
  `{ id, parentId, position }` et aplatit l'arbre (piège documenté dans
  `src/core/templates.js`).
- **Titres figés à la création** (les deux systèmes) : une tâche instanciée stocke le
  titre rendu ; changer la langue ensuite ne traduit pas rétroactivement.
- **Arbres cyclés dans un body** : rejetés wholesale par le gate (jamais silencieusement
  normalisés) — le heal ne s'exécute qu'après la validation.
