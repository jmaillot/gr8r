# Glossaire français — Projects Studio

Source de vérité terminologique pour la traduction du catalogue (`src/locales/fr.json`).
Chaque lot de traduction (batches `page`, `settings`, `act`, `a11y`, `toast`, `modal`,
`err`, etc.) lit ce document AVANT d'écrire une seule valeur. Un terme ici fixé n'est
jamais changé rétroactivement — un lot ne peut qu'ajouter des lignes, jamais modifier
un terme existant.

## Registre (register)

- **Vouvoiement** : la forme « vous » partout (aucun tutoiement dans l'interface).
- **Casse** : sentence case — seule la première lettre d'un titre est capitale
  (« Nouvelle tâche », et non « Nouvelle Tâche »). Les noms propres et les sigles
  gardent leur casse (Projects Studio, QA).
- **Pas de point médian** : aucune forme du type « membre·e ». Les formulations
  épicènes ou le masculin générique sont utilisés (« les membres », « chaque membre »).
- **Conventions France** : mois et jours en minuscules (« janvier », « lundi »),
  ordinaux `1er` / `1re` / `2e`, virgule décimale, regroupement des milliers par une
  espace fine insécable (U+202F) — le regroupement est fait par `Intl`, jamais
  codé en dur dans une valeur de catalogue.
- **La voix passive / impersonnelle est préférée** aux tournures lourdes ;
  les boutons restent courts et à l'infinitif (« Créer », « Supprimer »).

## Typographie (règles D-04 — obligatoires dans chaque valeur)

| Règle                                                  | Caractère obligatoire | Interdit                 |
| ------------------------------------------------------ | --------------------- | ------------------------ |
| Espace insécable avant `:`                             | U+00A0                | U+0020, U+202F           |
| Espace fine insécable avant `;` `!` `?`                | U+202F                | U+0020, U+00A0           |
| Espace insécable à l'intérieur de « » (des deux côtés) | U+00A0                | U+0020                   |
| Apostrophe                                             | U+2019 (`’`)          | U+0027 (`'`)             |
| Ellipse                                                | U+2026 (`…`)          | `...`                    |
| Normalisation Unicode                                  | NFC                   | NFD (accents décomposés) |

## Terminologie — vocabulaire stocké (oracles `test/i18n-vocab.test.mjs`)

### Statuts de tâche (`task.status.*`)

| id stocké  | Anglais     | Français  |
| ---------- | ----------- | --------- |
| `backlog`  | Backlog     | Backlog   |
| `todo`     | To Do       | À faire   |
| `progress` | In Progress | En cours  |
| `review`   | Review      | À valider |
| `done`     | Done        | Terminé   |

### Priorités (`task.priority.*`)

| id stocké | Anglais     | Français        |
| --------- | ----------- | --------------- |
| `urgent`  | Urgent      | Urgente         |
| `high`    | High        | Haute           |
| `medium`  | Medium      | Moyenne         |
| `low`     | Low         | Basse           |
| `none`    | No priority | Aucune priorité |

### Étiquettes (`task.label.*`)

| id stocké  | Anglais  | Français    |
| ---------- | -------- | ----------- |
| `design`   | Design   | Design      |
| `frontend` | Frontend | Frontend    |
| `backend`  | Backend  | Backend     |
| `research` | Research | Recherche   |
| `content`  | Content  | Contenu     |
| `bug`      | Bug      | Bug         |
| `qa`       | QA       | QA          |
| `growth`   | Growth   | Acquisition |

### Statuts de projet (`project.status.*`)

| id stocké  | Anglais     | Français      |
| ---------- | ----------- | ------------- |
| `planning` | Planning    | Planification |
| `active`   | In Progress | En cours      |
| `risk`     | At Risk     | À risque      |
| `hold`     | On Hold     | En pause      |
| `complete` | Completed   | Terminé       |

### Rôles (`common.role.*`)

| id stocké | Anglais       | Français       |
| --------- | ------------- | -------------- |
| `owner`   | Owner         | Propriétaire   |
| `admin`   | Admin         | Admin          |
| `member`  | Member        | Membre         |
| `guest`   | Guest         | Invité         |
| `viewer`  | Guest (rendu) | Invité (rendu) |

### Permissions (`common.perm.*`)

| Anglais     | Français       |
| ----------- | -------------- |
| Can view    | Peut voir      |
| Can comment | Peut commenter |
| Can edit    | Peut modifier  |
| Full access | Accès complet  |

### Récurrence (`popover.recur*`)

| Anglais         | Français              |
| --------------- | --------------------- |
| Does not repeat | Ne se répète pas      |
| Daily           | Chaque jour           |
| Weekly          | Chaque semaine        |
| Every 2 weeks   | Toutes les 2 semaines |
| Monthly         | Chaque mois           |

## Terminologie — noms communs du produit

| Anglais      | Français          |
| ------------ | ----------------- |
| workspace    | espace de travail |
| project      | projet            |
| task         | tâche             |
| member       | membre            |
| file         | fichier           |
| comment      | commentaire       |
| activity     | activité          |
| notification | notification      |
| timeline     | chronologie       |
| table        | table             |
| board        | tableau           |
| drawer       | tiroir            |
| modal        | fenêtre modale    |

## Terminologie — verbes

| Anglais | Français    |
| ------- | ----------- |
| create  | créer       |
| edit    | modifier    |
| delete  | supprimer   |
| share   | partager    |
| invite  | inviter     |
| assign  | assigner    |
| filter  | filtrer     |
| sort    | trier       |
| save    | enregistrer |
| comment | commenter   |
| mention | mentionner  |

## Valeurs identiques dans les deux langues

Certaines valeurs sont identiques en anglais et en français — elles doivent
**figurer dans `fr.json`**, jamais être omises pour satisfaire une heuristique de
diff : **Projects Studio**, **Ctrl**, les noms de produits, les sigles **QA**, et toute
valeur dont la forme coïncide (« Frontend », « Backend », « Bug », « Design »).

## Terminologie — lot A (`page.*`, plan 07-04)

Ajoutées par le lot page ; les lots suivants les réutilisent telles quelles.

| Anglais         | Français                     |
| --------------- | ---------------------------- |
| design system   | système de design            |
| token           | token                        |
| saved view      | vue enregistrée              |
| due date        | échéance                     |
| overdue         | en retard                    |
| milestone       | jalon                        |
| inbox           | boîte de réception           |
| sidebar         | barre latérale               |
| side panel      | panneau latéral              |
| breadcrumb      | fil d’Ariane                 |
| subtask         | sous-tâche                   |
| team            | équipe                       |
| workspace admin | admin de l’espace de travail |
| demo data       | données de démo              |
| wireframe       | wireframe                    |
| handoff         | passation                    |
| grid            | grille                       |
| e-mail          | e-mail                       |

## Terminologie — lot A (`a11y.*`, plan 07-04)

Chaînes d’accessibilité : noms accessibles et libellés aria, volontairement
courts et nominal-first (« Close » → « Fermer »), sans ponctuation finale
ajoutée.

| Anglais             | Français                   |
| ------------------- | -------------------------- |
| accessible name     | nom accessible             |
| screen reader label | libellé de lecteur d’écran |
| Esc (key)           | Échap                      |
| Enter (key)         | Entrée                     |

## Terminologie — lot B (`settings.*`, plan 07-05)

Ajoutées par le lot settings ; réutilisées telles quelles par les lots suivants.

| Anglais                   | Français                         |
| ------------------------- | -------------------------------- |
| Settings                  | Paramètres                       |
| accent color              | couleur d’accent                 |
| spellcheck                | vérification orthographique      |
| two-factor authentication | authentification à deux facteurs |
| recovery codes            | codes de récupération            |
| invite link               | lien d’invitation                |
| push notification         | notification push                |
| daily digest              | résumé quotidien                 |
| danger zone               | zone de danger                   |
| member directory          | annuaire des membres             |
| role permissions          | permissions par rôle             |
| target date               | date cible                       |
| lead (of a project)       | responsable (du projet)          |
| upload                    | téléverser                       |
| starter task              | tâche prédéfinie                 |
| later (date shift)        | plus tard                        |
| earlier (date shift)      | plus tôt                         |
| attachment                | pièce jointe                     |
| single-use link           | lien à usage unique              |
| offline                   | hors ligne                       |
| dark mode                 | mode sombre                      |
| light mode                | mode clair                       |
| layout                    | disposition                      |
| preview                   | aperçu                           |

## Terminologie — lot C (batch C, plan 07-06)

Ajoutées par le lot C (palettes, navigation, vocabulaire stocké, permission) ;
réutilisées telles quelles.

| Anglais                           | Français                                              |
| --------------------------------- | ----------------------------------------------------- |
| command menu                      | menu de commandes                                     |
| keyboard shortcuts                | raccourcis clavier                                    |
| sign out                          | se déconnecter                                        |
| toggle sidebar                    | basculer la barre latérale                            |
| switch workspace                  | changer d’espace de travail                           |
| onboarding                        | onboarding                                            |
| assignee                          | Assigné à                                             |
| status                            | statut                                                |
| estimate                          | estimation                                            |
| ascending / descending            | croissant / décroissant                               |
| group by                          | grouper par                                           |
| untitled                          | Sans titre                                            |
| unassigned                        | non assigné                                           |
| broken link                       | lien cassé                                            |
| spreadsheet                       | feuille de calcul                                     |
| byte / kilobyte / megabyte        | o / Ko / Mo                                           |
| theme (light / dark / system)     | thème (clair / sombre / système)                      |
| visible columns                   | colonnes visibles                                     |
| filter connectors (and/is/is not) | et / est / n’est pas                                  |
| role descriptions                 | à la troisième personne (« Gère… », « Ne voit que… ») |
