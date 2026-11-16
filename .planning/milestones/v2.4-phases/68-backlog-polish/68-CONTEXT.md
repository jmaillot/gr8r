# Phase 68: Backlog Polish - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Quatre items de dette v2.3 fermés, tous indépendants sauf POL-02 qui reutilise le design de claim de la Phase 67 :

- **POL-01** : la carte mobile (.mcard, ≤900px) rend ses champs pilotés par le view state `hidden[]` existant — minimum-identity toujours visibles, contrôle via le popover cols réactivé sur mobile, prouvé par une e2e dédiée 390×844.
- **POL-02** : les emails notification + digest passent par une machine à claims (table `email_outbox`) avec retries bounded — jamais mark-then-send, jamais blanket re-drive, invariant no-double-send Phase 38 préservé.
- **POL-03** : le scoping CSS `.toolbar { flex-shrink: 0 }` est restreint à `.page.flush .toolbar` ≤900px ; comportement board prouvé inchangé par la suite e2e existante.
- **POL-04** : le draft 64-VALIDATION (milestone v2.3 archivé) reçoit une acceptation formelle per audit-milestone §5.5 — plus aucun artefact de validation ouvert à la clôture du milestone.

Hors périmètre : invites et alertes 2FA (restent fire-and-forget), toute nouvelle surface UI au-delà de ce qui est décidé ci-dessous.

</domain>

<decisions>
## Implementation Decisions

### POL-01 — Carte mobile × hidden[]
- **D-01:** Minimum-identity toujours visibles sur la carte : statut + titre + key + assignees — jamais affectés par hidden[].
- **D-02:** Le popover cols existant devient utilisable ≤900px (suppression du `display:none` responsive.css:107) — une seule UI de contrôle, la carte et la table partagent le même view state `hidden[]`.
- **D-03:** Toggle global : cacher une colonne table cache aussi son équivalent carte si elle en a un ; les entrées sans équivalent carte (labels, deps…) restent togglables — la carte lit simplement `hidden[]` et ignore ce qu'elle ne rend pas. — **Reversibility:** reversible — lecture pure du view state existant, aucun contrat publié.

### POL-02 — Retry SMTP claim-based
- **D-04:** Périmètre : notifications email (site fire-and-forget server.js:2126) + digest (server.js:2419) passent en claim-based. Invites et alertes 2FA restent fire-and-forget (échec = log, l'utilisateur peut renvoyer une invite manuellement).
- **D-05:** Table dédiée `email_outbox` (même shape que webhook_deliveries : status/next_attempt_at/last_status_code/last_error/ctx) — séparée des webhooks, ni le même volume ni le même cycle de vie. — **Reversibility:** costly — nouvelle table miroir sur les 2 backends (SQLite + pg, byte-identique, Pitfall P-B) ; la retirer plus tard exige une migration de données.
- **D-06:** Politique de retry identique aux webhooks (Phase 67 D-05) : 5 tentatives max, backoff 1m → 5m → 30m → 2h → 8h — un seul mental model, code de backoff partageable.
- **D-07:** Articulation avec la ledger digest D-12 : la ledger reste le claim sémantique (QUOI envoyer, historique qui-a-été-notifié), email_outbox est le claim de transport (COMMENT livrer). Le digest écrit dans outbox au moment du claim D-12, une seule rangée outbox par digest — pas de double envoi possible.
- **D-08:** Email mort (retries épuisés) : statut dead dans email_outbox, purge 7 jours après, silencieux — pas de badge, pas de notification (les notifs restent visibles in-app).

### POL-03 — Scoping CSS WR-01
- **D-09:** Scope strict : `.toolbar { flex-shrink: 0 }` devient `.page.flush .toolbar` ≤900px — les autres toolbars (board, settings…) ne sont pas dans un flex column à hauteur fixe et n'ont jamais eu le bug. Non-régression prouvée par la suite e2e existante.

### POL-04 — Réconciliation 64-VALIDATION
- **D-10:** Acceptation formelle : le draft reçoit une section « Formal Acceptance » (statut accepted, rationale audit-milestone §5.5, evidence : suite 115/115 verte au close + audit intégration 5/5 chaînes). Pas de re-validation rétroactive — le code a changé depuis (65/66/67), les résultats ne diraient rien sur le milestone d'origine.

### the agent's Discretion
- Forme exacte du driver de retry email (réutiliser/s'inspirer du driver webhook) et mécanisme de purge (cron vs à l'écriture).
- Structure de la section Formal Acceptance dans 64-VALIDATION.md (tant que statut + rationale + evidence y figurent).
- Détails d'implémentation du filtrage carte par hidden[] (render-time filter vs computed fields), tant que D-01 garantit les 4 minimum-identity.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design de claim (POL-02)
- `.planning/phases/67-project-webhooks/67-CONTEXT.md` — D-05 (backoff), D-07 (purge 7j), shape webhook_deliveries : le design de claim email DOIT le miroir
- `webhook-retry.js` — code de backoff partageable (D-06)
- `db-adapter.mjs` § SCHEMA + PG_EPOCH_COLUMNS — contrat miroir 2 backends, epoch columns bigint côté pg

### View state & colonnes (POL-01)
- `src/views/table.js` §70-94 — `v.hidden[]` (lecture) + `.mcard` (cible de modification)
- `src/styles/responsive.css` §98-112 — bande ≤900px : `.mcard`, `[data-pop='cols'] { display:none }` (D-02), `.toolbar { flex-shrink: 0 }` (D-09)
- `server.js:1759` — contrat `hidden[]` persisté (filters + columns (hidden + widths) + sort + group + showDone)

### Invariant no-double-send (POL-02)
- Ledger digest D-12 in `server.js` (~2374-2427) — claim sémantique existant, à articuler (D-07)
- `.planning/REQUIREMENTS.md` POL-02 — formulation exacte de l'invariant Phase 38

### Audit milestone (POL-04)
- `.planning/v2.3-MILESTONE-AUDIT.md` §5.5 + §53 — classification NOT-VALIDATED, ce que l'acceptation formelle doit citer
- `.planning/milestones/v2.3-phases/64-mobile-tasks-table-suite-green/64-VALIDATION.md` — le draft à accepter

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `webhook-retry.js` : math de backoff pure — réutilisable pour email_outbox (D-06)
- Popover cols (`data-pop='cols'`) : UI de contrôle complète, juste masquée ≤900px — réactivation plutôt que nouvelle UI (D-02)
- Pattern ensureColumn (`db-adapter.mjs:828`) : migration additive idempotente pour `email_outbox` si boot-time

### Established Patterns
- `.catch(err => logWarn(...))` fire-and-forget : le pattern à remplacer sur les 2 sites D-04 — contraste utile pour l'e2e
- Claim-then-deliver webhook (`enqueueWebhookDeliveries`, scheduler tick) : le template architectural de POL-02
- Pitfall P-B : toute colonne additive doit être byte-identique SCHEMA ↔ ensureColumn, et non-reserved name (leçon `aad_oid` : jamais `oid`/`rowid`/`_rowid_` — SQLite 3.54 les refuse en ADD COLUMN)

### Integration Points
- `MAILER.sendNotif` / digest builder : les producteurs qui écrivent dans email_outbox au lieu d'envoyer directement
- Reminder pass + digest pass (server.js ~2374-2427) : points d'injection du claim transport
- Suite e2e existante : prouve la non-régression board (POL-03) ; nouvelle spec dédiée pour POL-01 à 390×844

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

*Phase: 68-backlog-polish*
*Context gathered: 2026-11-16*
