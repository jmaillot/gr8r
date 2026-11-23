# Phase 90: Polish & Verification Sweep - Context

**Gathered:** 2026-11-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Fermer la checklist de confiance du milestone v3.3 : console Super Admin role-first (roster + recherche promote), action verify-checksum et download d'archive hiérarchisé sur le détail des runs, visibilité de la rétention (prévisualisation des suppressions + « kept until »), sweep e2e PG-parity du cycle backup/restore complet + tests DST du cron, et documentation DEPLOY.md (timezone/NTP, nouveau moteur vs CLI legacy). Plus deux polissages post-89 validés en discussion : invalidation de la liste restore après un backup terminal, et warning backup sur blob manquant.

**Hors périmètre (deferred) :** sweep d'intégrité doc↔disque (orphelins files[], blobs perdus) — nouvelle capacité transverse, voir `<deferred>`.

</domain>

<decisions>
## Implementation Decisions

### Console Super Admin (SC-1)

- **D-90-1:** La console vit dans Instance > Governance comme un **tab « Super Admins »** à côté du tab Instance Roles existant (rolesCard) — pattern seg-tabs existant réutilisé, operatorCard actuel remplacé par le nouveau tab. — **Reversibility:** reversible — local page structure, no contract change
- **D-90-2:** Liste par défaut = **roster uniquement** (users avec is_instance_admin = true) avec les actions inline existantes (démotion inline-confirm, revoke sessions — sémantique D-118/D-119 inchangée).
- **D-90-3:** La **recherche** (≥ **2 caractères** — en-dessous, seul le roster s'affiche) interroge **tous les users** sur nom ET email (substring case-insensitive, comportement du filtre client actuel maintenant piné) ; les matches non-admin sont rendus comme **candidats « Make Super Admin » (promote-only)** — la rétrogradation reste une action du roster. Séparation claire : chercher = ajouter, roster = gérer.
- **D-90-4:** **Cap de résultats : 10 candidats + bouton « afficher plus »** révélant par tranches de 10. Prévisible, le cap est visible. — **Reversibility:** reversible
- **D-90-5:** Post-promotion : **toast à clé de succès, le candidat disparaît des résultats et apparaît dans le roster sans rechargement de page** (SC-1 verbatim). Mécanique exacte (refetch vs mutation locale) à la discrétion du planner.
- **D-90-6 (discrétion agent):** empty state du roster, format de la requête de recherche (endpoint dédié vs extension de GET /api/auth/operator/users), garde dernier-admin (le guard serveur existant D-118/D-119 suffit — affichage du refus à clé).

### Download + checksum (SC-2)

- **D-90-7:** **Nouveau endpoint stream** `GET /api/backup/download?runId=` : réponse en stream `Content-Disposition: attachment`, zéro staging disque. Garde à étages : Backup Operator = runs project/workspace seulement ; **instance-scope = Super Admin uniquement** (la tiering Phase 85 appliquée au binaire). — **Reversibility:** one-way — le endpoint devient la contract surface de download ; toute UI/download futur s'y accroche
- **D-90-8:** **Filename du Content-Disposition = le nom d'archive stocké** (backup-instance-….tar.gz), échappé — pas de nom générique.
- **D-90-9:** Un run **`missing`** (archive introuvable local + S3) **n'expose pas le bouton download** (chrome honnête D-89-21) ; le endpoint refuse à clé de toute façon (fail-closed double).
- **D-90-10:** **Audit log sur chaque download réussi** (qui, quel run) — cohérent avec la surface backup (les refus de preview/download sont déjà audités en 89).
- **D-90-11:** L'action **« Vérifier le checksum »** sur le détail du run fait un **re-hash complet** de l'archive : local = re-hash du fichier ; S3-located = stream-back via le seam 88-01 downloadToStaged (temp nettoyé). Comparaison au sha256 stocké → **badge vert/rouge à clé + timestamp** du dernier check. **Throttle opérateur** type preview D-89-22 (le re-hash lit tout l'archive).

### Rotation & rétention (SC-3)

- **D-90-12:** Prévisualisation des suppressions projetées = **bouton on-demand** « Prévisualiser les suppressions » dans le form de tâche → **endpoint de projection** (dry-run de la policy GFS sur les runs existants de la tâche) → liste affichée. Jamais de calcul client, jamais d'appel à chaque frappe. — **Reversibility:** reversible
- **D-90-13:** La preview est **groupée par échelle GFS** (daily/weekly/monthly/yearly) avec compte par groupe, liste détaillée dépliable (trunc + title sur les noms de fichiers — idiom existant).
- **D-90-14:** Tâche jamais exécutée → **empty state à clé** (« aucun run à évaluer ») — pas de projection fictive.
- **D-90-15:** La preview est **throttle opérateur** (type D-89-22) — la projection lit tous les runs de la tâche.
- **D-90-16:** **« Kept until » rendu comme position de bucket** (« kept: 3/7 daily »), PAS comme une date : la rétention GFS est comptée par bucket (keep-N, assignGfsBuckets server.js:3839-3945) et la suppression dépend des runs futurs — une date littérale serait fausse à chaque nouveau run. Calculé à la volée par le serveur par requête, affiché dans l'historique des runs. Décision affinée post-research (le chercheur a établi que la sémantique date n'existe pas dans la mécanique GFS). — **Reversibility:** reversible

### Sweep e2e PG-parity + DST (SC-4)

- **D-90-17:** L'e2e PG-parity couvre le **cycle complet en un scénario** : tâche → run backup → upload S3 → suppression locale → list (badge s3) → preview → **DR restore sur PG**, assertions sur le rapport de run + révocation de sessions. Instruments : conteneurs déjà validés en UAT 89 (`gr8r-pg-test` :5433 postgres:18-alpine, `gr8r-minio-e2e` :9001).
- **D-90-18:** Tests DST sur les **frontières EU + US** (transitions spring-forward/fall-back des deux zones) : run cron à 02:30 le jour de transition, digest 08:00, assertions sur l'heure locale workspace (tz.js).
- **D-90-19:** Les tests restent **env-gated uniquement** (POSTGRES_TEST_URL / MINIO_TEST_URL, skip propre sans env) — pas de wiring CI, cohérent avec 87/88/89 ; lancement manuel avant ship.
- **D-90-20:** Nouvelles clés i18n **gated ×5 locales** (de/en/es/fr/nl) — convention du projet, déjà outillée.

### Documentation (SC-5)

- **D-90-21:** DEPLOY.md documente : posture timezone/NTP (chrony, drift accepté, ce qui casse si l'horloge dérive — les crons et la rétention GFS en dépendent) et la **distinction nouveau moteur backup vs `node server.js --backup` CLI legacy** (ce que fait chaque one, quand utiliser lequel).

### Polissages post-89 (validés en discussion)

- **D-90-22:** **Invalidation de la liste restore** : quand un backup run atteint un statut terminal, S.ui.restoreList est invalidé (quelques lignes dans le poll tick existant) — la liste se recharge sans reload complet de la page.
- **D-90-23:** **Warning blob manquant au backup** : quand le writer flagge un missingBlob, le run le porte (colonne ou summary — au planner) et l'historique affiche « ⚠ N blob(s) manquant(s) — le DR refusera cette archive ». L'opérateur l'apprend à la création, pas au DR. Touché writer (87/88) + client — le plus gros des deux polissages.

### the agent's Discretion

- Mécanique post-promotion (refetch vs mutation locale optimiste)
- Format exact de la recherche candidats (endpoint dédié ou extension de GET /api/auth/operator/users)
- Emplacement de l'action verify-checksum dans le détail du run (bouton dans la rangée sha vs menu)
- Colonne vs summary pour porter le flag missingBlob
- Shape exact de l'endpoint de projection de rotation
- Structure des plans (le sweep e2e en dernier plan, après les surfaces)

### Folded Todos

Aucun todo plié (todo_count: 0).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § Phase 90 — goal, dépendances, 5 success criteria (SC-1..5)
- `.planning/REQUIREMENTS.md` § SACON-01 — la seule exigence active de la phase
- `.planning/seeds/super-admin-console-role-first-listing.md` — le seed d'origine de la console (comportement actuel vérifié dans le code + desired behavior + additions owner 2026-11-21)

### Contrats des phases 85–89 (fondations directes)
- `.planning/phases/85-roles-foundation/85-CONTEXT.md` — la tiering des droits (D-85-x) que le download applique au binaire ; D-118/D-119 (last-operator/last-owner guards)
- `.planning/phases/87-scheduler-tasks-run-history-rotation/87-CONTEXT.md` — policy GFS, crons tz.js, historique des runs, sémantique de rétention
- `.planning/phases/88-s3-destination/88-CONTEXT.md` — seam downloadToStaged, uploaded column, stream-back verify (D-88-8), sidecar sha256
- `.planning/phases/89-restore/89-CONTEXT.md` — D-89-21 (payload-flag chrome), D-89-22 (throttle opérateur), keyed refusals, D-89-14/15 (run-row truth), RESTORE_REFUSAL_TOASTS closed map
- `.planning/phases/89-restore/89-LEARNINGS.md` — patterns hash-on-the-pipe, keyed refusals end-to-end, payload-flag authority ; lessons (liste restore stale, warning blob)

### Décisions ratifiées transverses
- `.planning/phases/89-restore/89-UAT.md` — observations post-89 (les deux polissages D-90-22/23 y sont tracés) ; instruments e2e validés
- `DEPLOY.md` — cible du SC-5 (posture NTP + distinction moteurs)
- `src/core/i18n.js` — convention ×5 locales, LOCALE_NAME_MAP, gated keys

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/pages/governance.js` (rolesCard, seg-tabs, operatorCard) — le tab Super Admin s'insère dans le pattern existant ; la recherche client actuelle (S.ui.govOpQ) est le point de départ de la recherche étendue
- `GET /api/auth/operator/users` (server.js ~7052) — retourne déjà tous les users avec is_instance_admin ; base de la recherche candidats
- `export/s3.js` downloadToStaged + s3BackupKey — le seam du re-hash S3 (verify-checksum) et du DR
- `export/backup.js` sha256AndSize + stream patterns — le re-hash local du verify-checksum
- Throttle opérateur D-89-22 (preview 10/15min operator-keyed) — à réutiliser tel quel pour verify-checksum et la projection de rotation
- Audit-log idiom des routes backup/restore (89) — pour les downloads réussis
- RESTORE_REFUSAL_TOASTS closed map + catalogue err ×5 — le vocabulaire des nouveaux refus (download denied, checksumMismatch…)
- Poll tick backup existant (src/actions/actions.js backupPollTick) — le point d'invalidation de S.ui.restoreList (D-90-22)

### Established Patterns
- Payload-flag authority chrome (D-89-21) : le bouton download n'existe pas pour un run missing ; les CTAs rendent ce que le payload décide
- Keyed refusals end-to-end : `<code>: <message>` persisté, toasts à clés fermées, ×5 locales
- Guard chains verbatim sur les routes destructives/lourdes (sameOrigin → requireUser → throttle → capability → validation)
- Hash-on-the-pipe : jamais buffer-then-hash (re-hash du verify-checksum en stream)
- Env-gated e2e avec skip propre (restore-s3-e2e, pg-matrix) — instruments validés en UAT 89
- Type-to-confirm + inline-confirm pour les actions destructives (roster demote existant)

### Integration Points
- Historique des runs (87) : « kept until » s'affiche dans les rangées existantes ; verify-checksum s'ancre sur le détail du run
- Form de tâche backup (87, retention form-staged UAT r3) : le bouton « Prévisualiser les suppressions » s'y insère
- backup_runs.uploaded (88-03) : le badge location feed le download (local direct vs S3 stream-back)
- instance_roles / users (85) : le promote-search écrit via le endpoint promote existant (guard funnel partagé)
- DEPLOY.md : existe, à étendre (section timezone/NTP + moteurs)

</code_context>

<specifics>
## Specific Ideas

- Le seed super-admin-console est explicite : « je ne veux lister ici que les personnes disposant de ce rôle par défaut, avec la recherche servant à ajouter d'autres Super Admins sélectionnables » — le roster-first N'EST PAS négociable, c'est le cœur du SC-1.
- Le cap 10 + show-more est un choix affirmé (pas de scroll incrémental, pas de liste infinie).
- « Kept until » doit rester vrai si la policy change → calculé à la volée, jamais stocké.
- L'e2e est UN scénario complet bout-en-bout (backup→S3→DR restore sur PG), pas un éclaté par tranches.
- Les envs de test sont déjà montées et validées (gr8r-pg-test :5433, gr8r-minio-e2e :9001) — les plans peuvent les supposer disponibles.

</specifics>

<deferred>
## Deferred Ideas

### Sweep d'intégrité doc↔disque
Détection périodique (boot ou cron) des incohérences entre le graphe doc et le disque : entrées orphelines dans doc.files[] (tâche supprimée, entrée restée — bug pré-existant catalogué en 89-UAT), blobs référencés mais absents de /data/files (perte silencieuse). Rapport à l'admin, éventuellement réparation assistée. — **Nouvelle capacité transverse**, hors périmètre 90 ; candidate pour un futur milestone. Tracé dans 89-UAT.md test 4 observations.

</deferred>
