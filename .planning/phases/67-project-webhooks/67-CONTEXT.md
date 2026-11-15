# Phase 67: Project Webhooks - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Project owners, admins, and project leaders can register per-project outbound webhooks that deliver MS Teams payloads for the 8-event vocabulary (task.created, task.completed, task.assigned, task.deleted, comment.added, due.reminder, project.completed, subtask.tree-changed). Delivery is async, exactly-once via a claim table, fail-absent with bounded retries, and SSRF-hardened (https-only, per-delivery resolved-IP deny-list). Hook config lives in server mirror tables (`webhook_hooks`/`webhook_deliveries`), never in the client-visible doc. UI-only management, no MCP webhook route. WHK-01/02/03/04/05. Delivery/claim design co-specced with POL-02 (Phase 68, SMTP retry).

</domain>

<decisions>
## Implementation Decisions

### Enveloppe & cap 28 Ko
- **D-01:** Enveloppe = whitelist de champs fixe par événement, définie dans le code (liste par événement, auditable) — pas d'enveloppe commune, pas de configuration utilisateur des champs.
- **D-02:** Payload > 28 Ko : tronquer la partie la plus grosse (notes/contenu de commentaire) et livrer quand même — l'événement arrive, texte coupé. Pas d'échec explicite « oversized ».
- **D-03:** Chaque enveloppe inclut le contexte minimal : nom + id du projet + nom de l'auteur de l'événement. Pas de projet enrichi (description, membres, équipes).
- **D-04:** Timestamps en ISO 8601 UTC dans tous les payloads Teams (standard Power Automate).

### Politique de retry
- **D-05:** 5 tentatives max, backoff exponentiel 1 min → 5 min → 30 min → 2 h → 8 h, en honorant Retry-After quand présent.
- **D-06:** Hook « mort » (retries épuisés) visible par un badge d'état (actif / en échec / désactivé) dans la liste des webhooks du projet. Pas de notification in-app.
- **D-07:** Rétention des deliveries : 7 jours puis purge. — **Reversibility:** reversible — purge Cron ou à l'écriture, table miroir dédiée.

### UX de gestion
- **D-08:** Gestion des webhooks dans une section « Webhooks » du projectSettings modal existant (Phase 55 precedent) — cohérent avec le modèle per-project, gate owner/admin/leader.
- **D-09:** Filtre d'événements = checkboxes des 8 événements avec labels i18n FR (EN+FR même commit, standing constraint).
- **D-10:** Secret HMAC généré par le serveur, affiché une seule fois à la création dans un toast/dialog avec bouton copier — jamais re-lisible, jamais dans le doc client, jamais dans les logs (WHK-01 verrouille déjà le « shown once »).
- **D-11:** Bouton « Envoyer un test » par hook — payload d'exemple de l'événement choisi, résultat visible immédiatement.
- **D-12:** Format par défaut à la création : teams-adaptive. Les deux autres (teams-messagecard, raw-json) restent sélectionnables.

### Mention AAD assigné
- **D-13:** L'claim `oid` est persisté sur l'utilisateur à la connexion OIDC Entra dès cette phase — champ serveur, jamais exposé au client. — **Reversibility:** costly — ajouter un champ utilisateur touche le stockage utilisateur et la route de login ; le retirer plus tard exige une migration.
- **D-14:** Mention AAD automatique sans réglage UI : vraie mention `<at>` si l'assigné a un oid persisté, fallback bold-name sinon. Silencieux, aucun toggle par hook.

### the agent's Discretion
- Détails de la claim-table partagée avec POL-02 (timing : design commun, implémentation ici).
- Forme exacte du driver de retry (poll interval vs post-commit scheduler) et mécanisme de purge.
- Structure interne du formatter Teams et du builder d'enveloppe.
- Contenu exact du payload de test du bouton D-11.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase & requirements
- `.planning/ROADMAP.md` §Phase 67 — goal, success criteria 1-5, dépendances Phase 65/66 et co-spec POL-02
- `.planning/REQUIREMENTS.md` WHK-01…WHK-05 — exigences verrouillées (formats, SSRF, claim table, cap 28 Ko)
- `docs/MCP-IDEAS.md` §4 — note historique webhook sortant (contexte d'intention, non contraignant)

### Patterns & standing constraints
- `.planning/phases/66-task-project-templates/66-CONTEXT.md` — funnel/i18n/chunk precedents, décisions D-xx récentes
- `.planning/phases/65-subtask-tree/65-CONTEXT.md` — subtask.tree-changed event source, funnel whitelist precedent
- `.planning/PROJECT.md` — v2.4 milestone context, standing gates (500 kB chunk, i18n EN+FR, tests node --test)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `projectSettings` modal (Phase 55) — accueil de la section Webhooks (D-08)
- `memberCanReadProject` — base du builder d'enveloppe whitelisted (WHK-03)
- `mergeClientDoc` funnel — les hooks ne passent PAS par le doc (tables miroir serveur), mais l'événement `subtask.tree-changed` (Phase 65) et le point de diff du funnel sont les sources d'événements
- Table miroir SQLite+pg pattern (push_subscriptions, saved_views) — modèle pour `webhook_hooks`/`webhook_deliveries`
- OIDC login route — point d'attachement de la persistance `oid` (D-13)

### Established Patterns
- Server-first gating via `projectPermFor` — gate owner/admin/leader sur la section webhooks
- i18n EN+FR même commit — clés de la section Webhooks
- Chunk < 500 kB — lazy-load de la section Webhooks dans projectSettings
- Tests `node --test` comme gate par plan

### Integration Points
- Point de diff du funnel (post-commit, fire-and-forget) — émission des événements via `diffWebhookEvents(storedDoc, next)`
- Delivery engine — nouveau, hors funnel, tables miroir + claim table (co-design POL-02)
- SSRF guard — nouveau module, appelé à chaque livraison

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

*Phase: 67-Project Webhooks*
*Context gathered: 2026-11-15*
