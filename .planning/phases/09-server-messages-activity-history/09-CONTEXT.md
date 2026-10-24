# Phase 9: Server messages & activity history - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Les deux dernières sources d'anglais du milestone v1.2. Côté serveur, chaque erreur HTTP gagne
un **code machine stable** à côté de son message anglais inchangé — la forme du payload ne
change pas (`error` reste le message), le code voyage en supplément. Côté client, le code est
traduit via le catalogue i18n existant, avec repli sur le message serveur quand le code est
inconnu. Le journal d'activité est restructuré en **verbes machine** avec `extra` structuré :
les filtres (commentaires, changements de statut, changements de projet) classent le verbe
stocké au lieu de parser de l'anglais, si bien qu'aucune migration des documents existants
n'est nécessaire, et le prose anglais legacy est supprimé au rendu plutôt que divulgué.

Out of scope : email d'invitation, négociation `Accept-Language` (LANG-02), tout ce qui
touche aux fichiers (phase 12), la couverture navigateur (phase 10), le sweep final et le
build gate (phase 11).

Requirements: **ERR-01**, **ERR-02**, **ACT-01**, **ACT-02**.

</domain>

<decisions>
## Implementation Decisions

### Catalogue des traductions des erreurs

- **D-01:** La clé i18n est le **code verbatim** : le code serveur `EMAIL_TAKEN` se traduit
  par la clé `err.EMAIL_TAKEN` dans `src/locales/en.json` et `fr.json`. Aucune table de
  correspondance code→clé — impossible de désynchroniser les deux. — **Reversibility:**
  reversible — les clés vivent uniquement dans les catalogues JSON côté client, un renommage
  est mécanique et ne touche aucune donnée persistée.
- **D-02:** Les traductions sont des **phrases complètes avec interpolation de params**
  (`{name}`, …) — le client compose des messages naturels dans la langue de l'interface,
  pas des fragments génériques.
- **D-03:** Quand le client reçoit un code qu'il ne connaît pas, il affiche le **message
  serveur brut** (anglais) tel quel — jamais de toast vide (ERR-02). Le repli est
  purement client-side.
- **D-04:** Un **test de parité** vérifie que chaque code émis par le serveur a une entrée
  dans en.json ET fr.json — les oublis sont détectés au test, pas à l'exécution.

### Agent's Discretion (zones non discutées — recherche/planning décident)

Les zones suivantes n'ont pas été sélectionnées pour discussion ; la recherche et le planning
tranchent dans le cadre des contraintes de la roadmap :

- **Transport du code dans le payload** — placement exact du champ (champ `code` à côté de
  `error` vs enveloppe), format de nommage des codes. Contrainte roadmap : la forme du
  payload ne change pas (`error` = message anglais inchangé).
- **Taxonomie des verbes d'activité** — schéma des verbes machine (dot-namespaced ou autre)
  et structure de `extra` structuré. Contrainte roadmap : les filtres classent le verbe
  stocké, plus de parsing anglais.
- **Compatibilité legacy** — mécanisme de classification des anciennes entrées sans
  migration, et suppression du prose legacy au rendu. Contrainte roadmap : les entrées
  antérieures restent listées et filtrables (ACT-02), le détail anglais legacy est
  supprimé, jamais divulgué.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrats du milestone
- `.planning/ROADMAP.md` — section « Phase 9: Server messages & activity history » (goal,
  critères de succès 1-4)
- `.planning/REQUIREMENTS.md` — ERR-01, ERR-02, ACT-01, ACT-02 (et le tableau de couverture
  phase 9)
- `.planning/phases/05-i18n-foundation-catalogue-contract/05-CONTEXT.md` — le contrat du
  catalogue i18n (structure des clés, mécanisme `t()`) que D-01 prolonge
- `.planning/phases/06-english-extraction-locale-aware-formats/06-CONTEXT.md` — pattern
  d'extraction et de parité des catalogues

### Code existant
- `server.js` — `httpError(status, message)` (≈ligne 1016) : point de passage unique des
  erreurs ; tous les sites d'appel à instrumenter
- `src/main.js` — handler `gr8r:save-error` (≈lignes 75-95) : surface d'affichage des
  erreurs ; le 403 affiche déjà le message serveur brut
- `src/core/i18n.js` — `t(key, params)` et la registry de locales (D-01/D-02 s'y rattachent)
- `src/locales/en.json`, `src/locales/fr.json` — catalogues, namespace `err.*` existant
- `src/core/store.js` — `logAct(verb, t, extra)` (≈ligne 265) : point de passage unique des
  écritures d'activité
- `src/pages/activity.js` — filtres parsant `a.verb.includes('comment'/'project')`
  (≈lignes 13-22) : le code à remplacer par la classification machine

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `t(key, params)` (src/core/i18n.js) — interpolation déjà en place pour D-02
- Namespace `err.*` dans les catalogues — prolonger, pas créer
- `httpError()` — un seul point de construction des erreurs serveur
- `logAct()` — un seul point d'écriture d'activité côté client

### Established Patterns
- Catalogues JSON en/fr maintenus en parité (phases 6-7)
- Tests `node --test` avec vrais serveurs, jamais de mock SQLite/HTTP
- Tests de parité catalogue existants (phase 6-7) — le test D-04 suit le même gabarit

### Integration Points
- `gr8r:save-error` (main.js) et les toasts d'erreur — là où le code machine sera consommé
- `logAct` et les `unshift` directs d'activité dans actions.js — à canaliser vers les verbes
  machine
- Filtres d'activité (activity.js) — à réécrire sur la classification du verbe stocké

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-server-messages-activity-history*
*Context gathered: 2026-10-24*
