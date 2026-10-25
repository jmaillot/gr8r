# Phase 7 — French read-through (D-16)

**Purpose:** the roadmap's exit criterion for this phase is *your* read of the app in French.
The catalogue is 100 % translated, the typography lint is green and the browser proof passes —
what only a human can judge is whether it reads like a French product. Review the routes below,
note any wording that should change, and sign off. Any wording fixes are applied before the
phase closes.

---

## How to run the app in French

1. Start the app:
   - dev: `npm run dev` (Vite, http://localhost:5173), or
   - the built bundle: `npm run build && npm start` (http://localhost:8080).
2. Sign in (or create an account), open a workspace.
3. **Paramètres → Général → Langue → Français.** The interface re-renders immediately, without
   a reload. Every surface below then renders in French.
4. To compare, switch back to English (US) at any time — the other four selector labels
   (English UK, Deutsch, Español, 日本語) are intentionally still non-functional this phase.

## Routes to review

- **Shell:** sidebar (Accueil, Boîte de réception, Mes tâches, Favoris, Notifications, Vue
  d'ensemble, Projets, Tâches, Calendrier, Chronologie, Membres, Activité, Archives), top bar,
  workspace switcher, account menu.
- **Workspace pages:** Accueil, Boîte de réception, Mes tâches, Favoris, Notifications,
  Recherche, Vue d'ensemble, Projets, Tâches, Calendrier, Chronologie, Membres, Équipes,
  Activité, Paramètres, Archives.
- **Project views:** Vue d'ensemble, Tableau, Liste, Tableau (table), Calendrier, Chronologie,
  Fichiers, Activité.
- **Overlays:** the new-task and new-project modals, the task drawer, the command palette
  (Ctrl+K), popovers (status/priority/assignee/date), context menus, toasts.
- **Empty states and errors:** an empty project, the 404 page (« Page introuvable »), the auth
  pages (connexion, inscription), the onboarding flow.

## Register notes (what "correct" looks like)

- **Vous** everywhere — no « tu », no imperative shortcuts that assume tutoiement.
- Sentence case for headings (« Nouvelle tâche », not « Nouvelle Tâche »).
- No middle-dot gender forms (« Membre », never « Membre·te »).
- French-France conventions: lowercase months and weekdays, `1er`/`1re`/`2e`, decimal comma,
  narrow no-break space digit grouping.

## Typography spot-checks

Open any screen and look for these — a wrong one is a bug (the lint should have caught it):

- A (no-break) space **before** `:` and before `; ! ?` — e.g. « Statut : À faire ».
- Guillemets with inner padding: « citation », never «citation».
- Curly apostrophe `’` (jamais `'`) inside words (« d’autres tâches »).
- Ellipsis `…` rather than `...`.
- Lowercase months in dates (« 1 oct. », « 22 nov. »); `14:30` keeps its plain colon.

## Stored vocabulary stays English underneath

Statuses, priorities, roles, permissions, project templates and estimates are stored and
transmitted as English ids; only the display is translated (« À faire », « Urgente »,
« Propriétaire », `30 min`/`2 j`). If you see a raw English id *displayed* where a label should
be, note it.

## Wording fixes

Record anything that should read differently. For each: the route/surface, the current French
text, and your proposed fix. Fixes are applied to `src/locales/fr.json` (and
`docs/i18n-fr-glossary.md` when a term changes), then the gates re-run.

| # | Route / surface | Current text | Proposed fix | Applied |
|---|-----------------|--------------|--------------|---------|
| 1 | Barre d'onglets projet (`page.project.tab.*`) | Onglets restés en anglais après le passage en Français — `PTABS` figeait `t()` à l'import | Converti en `ptabs()` évaluée au rendu (`77c0d45`) ; test Chromium de régression ajouté (13/13) | ☑ |
| 2 | Activité (projet + drawer) | Verbes stockés rendus bruts en anglais (`created project`, `commented on`…), extras composés en anglais, « in » codé en dur | `VERB_KEYS` (24 verbes) + extras structurés `act.extra.*` avec fallback legacy verbatim (`ef9289d`) | ☑ |
| 3 | Paramètres → Équipes | La page ne se charge plus : le paramètre de map de `teamsGrid()` masquait le `t` catalogue → TypeError (`t('page.teams.nMembers')`) | Paramètre renommé `tm` (`ef9289d`) ; même shadow dans l'onglet Archive → Tâches corrigé ; test Chromium 14/14 | ☑ |
| 4 | | | | ☐ |

## Sign-off

- [x] I reviewed the app in French across the routes above.
- [x] The interface reads as a French product (register, typography, wording).
- [x] Wording fixes above (if any) are applied or explicitly deferred.

**Read-through performed by:** Jérémy Maillot  **Date:** 2026-10-23
