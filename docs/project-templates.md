# Templates de projet — guide de modification

Les templates proposés à la création d'un projet (et pendant l'onboarding) sont
centralisés. Trois endroits suffisent pour en ajouter ou en modifier un.

## Où vivent les templates

1. **Le catalogue** — `src/overlays/modals.js` (tableau `TEMPLATES`, ~lignes 103-111) :

   ```js
   export const TEMPLATES = [
     { id: 'blank',    icon: 'file',      tasks: 0 },
     { id: 'product',  icon: 'target',    tasks: 6 },
     { id: 'web',      icon: 'globe',     tasks: 6 },
     { id: 'mkt',      icon: 'megaphone', tasks: 6 },
     { id: 'design',   icon: 'palette',   tasks: 5 },
     { id: 'software', icon: 'code',      tasks: 6 },
     { id: 'personal', icon: 'heart',     tasks: 4 },
   ];
   ```

   - `id` : valeur stable stockée (minuscules, sans espace) ; sert de clé pour tout le reste.
   - `icon` : un nom [Lucide](https://lucide.dev) existant (`ic()` dans `src/core/icons.js`).
   - `tasks` : nombre de tâches de départ ; `0` affiche la description à la place du compteur.
   - **L'ordre du tableau = l'ordre d'affichage** dans la modale et l'onboarding.

2. **Les textes** — `src/locales/en.json` et `src/locales/fr.json` (~lignes 1445-1491),
   clés au format `project.template.<id>.*` :

   ```json
   "project.template.web.name": "Website",
   "project.template.web.desc": "IA, design, build, launch",
   "project.template.web.task.1": "Sitemap & information architecture",
   ...
   ```

   - `.name` : nom affiché du template.
   - `.desc` : affichée uniquement quand `tasks: 0` (cas de `blank`).
   - `.task.N` : titre de la N-ième tâche de départ.

## Comment ils sont consommés

- **Modale nouveau projet** (`projectModal`, `modals.js`) : rend le groupe de radios,
  uniquement à la création (pas en édition de projet).
- **Création** (`createProject(f, tmplId)`, `src/actions/actions.js`) : boucle sur
  `tm.tasks` ; la tâche 1 part en `todo` / priorité `high` / assignée au créateur, les
  autres en `backlog` / `medium`, avec des échéances échelonnées (+5 jours chacune).
- **Onboarding** (`src/pages/auth.js`) ; défaut `tmpl: 'web'` dans `src/core/store.js`.
- Cas spécial `blank` : le projet s'ouvre sur l'onglet « overview » après création.

## Modifier un template existant

1. Titres de tâches : éditer `project.template.<id>.task.N` dans **les deux** locales.
2. Nombre de tâches : mettre à jour `tasks: N` dans `TEMPLATES` — il doit correspondre
   exactement au nombre de clés `task.N`.
3. Icône : changer `icon` dans l'entrée `TEMPLATES`.
4. Nom / description : uniquement dans les locales.

## Ajouter un nouveau template

Exemple « event » :

```js
// src/overlays/modals.js
{ id: 'event', icon: 'calendar', tasks: 5 },
```

```json
// src/locales/en.json (et l'équivalent dans src/locales/fr.json)
"project.template.event.name": "Event Planning",
"project.template.event.desc": "From concept to wrap-up",
"project.template.event.task.1": "Define goals & budget",
"project.template.event.task.2": "Book venue",
"project.template.event.task.3": "Send invitations",
"project.template.event.task.4": "Prepare materials",
"project.template.event.task.5": "Day-of checklist"
```

Rien d'autre : la modale et l'onboarding rendent automatiquement tout le tableau
`TEMPLATES`, et `createProject` gère tout id présent dans les locales.

## Pièges à éviter

- **Oublier une locale** : le nom s'affiche comme clé brute (`project.template.event.name`)
  dans la langue manquante.
- **Désaligner `tasks` et les clés `task.N`** : titres cassés (clés brutes) ou titres
  jamais utilisés.
- **Titres figés à la création** : une tâche créée depuis un template stocke le titre
  rendu dans la langue courante ; changer la langue ensuite ne traduit pas
  rétroactivement les tâches déjà créées. Seul le catalogue (nom/desc) est traduit
  dynamiquement via `t()`.
