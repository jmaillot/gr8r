# Audit des notifications

> Documenté à partir du code réel post-Phase-38 (server.js + src/ + mailer.js). Chaque ligne du tableau cite `fichier:ligne` pour re-vérification face au code — une citation qui ne correspond plus signale une dérive du code, pas du document.

## Convention de validation (porte de propriétaire — D-05)

Chaque ligne de recommandation de trim porte une cellule **Status** :

- **`proposed`** — recommandation émise, aucune décision prise. **Rien n'est codeable dans cet état.**
- **`validated`** — le propriétaire a tranché pour ; une ligne `validated-by: <owner>, <date>` est ajoutée à la ligne du tableau, et la décision est recopiée dans `.planning/STATE.md` → « Recent Decisions ».
- **`rejected`** — le propriétaire refuse ; la recommandation ne doit jamais être codée.

Seule une ligne `validated` (avec signalement daté du propriétaire) autorise un changement de code dans une milestone future. Ce document est à la fois le livrable et la porte : c'est la colonne Status qui fait foi — aucun registre annexe, aucun test (D-03). À la livraison de ce document (Phase 39), **toutes les lignes sont `proposed`** — aucune n'a été validée.

---

## Mentions

Les mentions @membre et @équipe sont émises côté client par `emitMentions` (src/actions/actions.js:146-171) : `mention_all` gate le fan-out vers les membres (actions.js:150), `mention_team` gate le fan-out vers les équipes (actions.js:151). Les emails de mention partent ensuite via le fan-out serveur, keyé exclusivement sur `NOTIF_EMAIL_KIND` (server.js:1188-1194). Le toggle `mention_ws` (@workspace) existe dans les réglages mais **aucun lecteur n'a été trouvé** — même motif que les niveaux de permission non lus de ProjectPermissions.md.

| Channel | Pref key | Current default | Storage state | Live ? (consumed by) | Trim recommendation | Status | Source |
|---------|----------|-----------------|---------------|----------------------|---------------------|--------|--------|
| Email | `email_mention` | `true` (server.js:1144) | ligne per-user, `=== false` désactive (server.js:1248) | oui — emails de mention | keep (canal principal, comporté par défaut) | proposed | server.js:1188-1194, :1248 |
| Push | `push_mention` | `true` (server.js:1150) | ligne per-user, mais **inerte** | non — aucune surface d'émission push n'existe (server ni client ; boundary pin 36-02) | trim-to-default OU suppression complète de la clé (les deux sévérités ; précédent `push_due` Phase 37) | proposed | server.js:1130, :1150 ; grep src/ + server.js, 2026-11-05 |
| Inbox (client) | `mention_all` | `true` (server.js:1153) | prefs per-user adoptées côté client (src/core/notifPrefs.js:17-29) | oui — gate du fan-out mentions membres | keep | proposed | src/actions/actions.js:150, :168 |
| Inbox (client) | `mention_team` | aucun défaut (undefined-falsy) (server.js:1121-1122) | clef sans entrée dans NOTIF_PREF_DEFAULTS ; `!== false` dans le gate (actions.js:151) — activée par défaut de fait | oui — gate du fan-out mentions @équipe | keep (le gate lit `!== false`, donc undefined = activé ; formaliser le défaut serait un changement de comportement — hors scope doc-only) | proposed | src/actions/actions.js:151 ; server.js:1121-1122 |
| Inbox (client) | `mention_ws` | aucun défaut (undefined-falsy) (server.js:1121-1122) | toggle affiché (src/pages/settings.js:392) mais **inerte** | non — aucun lecteur trouvé (grep src/ + server.js, 2026-11-05, y compris accès dynamique `np[k]` : aucun résultat) | trim-to-default OU suppression complète (toggle + clé whitelist + i18n) ; ⚠️ aucun lecteur trouvé — absence constatée, pas prouvée | proposed | src/pages/settings.js:392 ; server.js:1137 ; grep 2026-11-05 |

**⚠️ Aucune lecture trouvée :** `mention_ws` — toggle présent (src/pages/settings.js:392) mais aucun lecteur trouvé (grep src/ + server.js, 2026-11-05). Le seul gate d'émission mention est `mention_all` + `mention_team` (src/actions/actions.js:150-151) ; le serveur ne keye l'email que sur `NOTIF_EMAIL_KIND` (server.js:1188-1194).

---

## Assignments

Les notifications d'assignation sont émises à la création d'une tâche déjà assignée (src/actions/actions.js:105) et au changement d'assignée (src/actions/actions.js:231, avec garde de scope). Les emails passent par `NOTIF_EMAIL_KIND` → `email_assign` (server.js:1188-1194). Les trois toggles du panneau « Assign » des réglages (`assign_self`, `assign_status`, `assign_over`) sont affichés mais **aucun lecteur n'a été trouvé** pour l'un des trois.

| Channel | Pref key | Current default | Storage state | Live ? (consumed by) | Trim recommendation | Status | Source |
|---------|----------|-----------------|---------------|----------------------|---------------------|--------|--------|
| Email | `email_assign` | `true` (server.js:1145) | ligne per-user, `=== false` désactive (server.js:1248) | oui — emails d'assignation | keep | proposed | server.js:1188-1194, :1248 |
| Push | `push_assign` | `true` (server.js:1151) | ligne per-user, mais **inerte** | non — aucune surface d'émission push (boundary pin 36-02) | trim-to-default OU suppression complète (précédent `push_due` Phase 37) | proposed | server.js:1131, :1151 ; grep src/ + server.js, 2026-11-05 |
| Inbox (client) | `assign_self` | `true` (server.js:1154) | toggle affiché (src/pages/settings.js:397) mais **inerte** | non — aucun lecteur trouvé (grep src/ + server.js, 2026-11-05, y compris accès dynamique `np[k]` : aucun résultat) | trim-to-default OU suppression complète ; ⚠️ absence constatée, pas prouvée | proposed | src/pages/settings.js:397 ; server.js:1154 ; grep 2026-11-05 |
| Inbox (client) | `assign_status` | aucun défaut (undefined-falsy) (server.js:1121-1122) | toggle affiché (src/pages/settings.js:398) mais **inerte** | non — aucun lecteur trouvé (grep 2026-11-05). NB : le type `update` notifie les watchers à chaque changement de statut (actions.js:203-210) **sans lire aucune préférence** | trim-to-default OU suppression complète ; ⚠️ absence constatée, pas prouvée | proposed | src/pages/settings.js:398 ; server.js:1140 ; grep 2026-11-05 |
| Inbox (client) | `assign_over` | aucun défaut (undefined-falsy) (server.js:1121-1122) | toggle affiché (src/pages/settings.js:399) mais **inerte** | non — aucun lecteur trouvé (grep 2026-11-05). NB : les retards sont couverts par `past_due` (server.js:1440), qui lit `prefs.past_due`, pas `assign_over` | trim-to-default OU suppression complète ; ⚠️ absence constatée, pas prouvée | proposed | src/pages/settings.js:399 ; server.js:1141, :1440 ; grep 2026-11-05 |

## Commentaires

Un commentaire notifie d'abord les @mentionnés (src/actions/actions.js:1125), puis les watchers restants (src/actions/actions.js:1129). `email_comment` est le **seul défaut à `false`** des 11 clés par défaut — un opt-out volontaire pour un canal bruyant.

| Channel | Pref key | Current default | Storage state | Live ? (consumed by) | Trim recommendation | Status | Source |
|---------|----------|-----------------|---------------|----------------------|---------------------|--------|--------|
| Email | `email_comment` | `false` (server.js:1146) — le SEUL défaut false | ligne per-user, `=== false` désactive (server.js:1248) | oui — emails de commentaire (désactivés par défaut) | keep (seul défaut false, opt-out intentionnel d'un canal bruyant) | proposed | server.js:1146, :1188-1194, :1248 |
| Push | `push_comment` | `true` (server.js:1152) | ligne per-user, mais **inerte** | non — aucune surface d'émission push (boundary pin 36-02) | trim-to-default OU suppression complète (précédent `push_due` Phase 37) | proposed | server.js:1132, :1152 ; grep src/ + server.js, 2026-11-05 |
| Inbox | — (pas de clé) | — | — | oui — lignes `comment` émises sans gate de préférence | n/a (pas de clé à trimer ; le comportement suit mention/comment watchers) | proposed | src/actions/actions.js:1129 |

## Mises à jour (update)

Le type `update` notifie les watchers d'une tâche (assignée, créateur, commentateurs — src/actions/actions.js:177-185) à chaque changement de statut (src/actions/actions.js:203-210). **In-app uniquement** : aucun pref key ne le gate, et il est absent de `NOTIF_EMAIL_KIND` (server.js:1188-1194).

| Channel | Pref key | Current default | Storage state | Live ? (consumed by) | Trim recommendation | Status | Source |
|---------|----------|-----------------|---------------|----------------------|---------------------|--------|--------|
| Inbox | — (aucun pref key) | — | — | oui — émis à tout changement de statut vers les watchers, sans gate | n/a (aucune clé) ; candidat anti-feature : gate `update` par pref — à évaluer dans une future milestone, jamais codé sans validation | proposed | src/actions/actions.js:203-210 |
| Email | — (absent de NOTIF_EMAIL_KIND) | — | — | non — `update` n'est pas mappé, le fan-out email le saute (`if (!prefKey) continue`, server.js:1242) | n/a (état documenté, rien à changer) | proposed | server.js:1188-1194, :1241-1242 |

## Rappels d'échéance (due_reminder / past_due)

Cadence à deux offsets post-Phase-37 : `morning_of` le jour de l'échéance (server.js:1436-1439) et `past_due` le lendemain et au-delà (server.js:1440). Chaque notif est exactly-once via un claim `reminders_sent` (server.js:1463-1472). Les emails passent par `email_reminder` (les deux types, server.js:1188-1194) mais sont **supprimés** pour les membres en digest : quand le `email_digest` **stocké** vaut strictement `true`, le fan-out saute l'email reminder (server.js:1260) — les lignes inbox ne sont jamais supprimées (server.js:1249-1252).

| Channel | Pref key | Current default | Storage state | Live ? (consumed by) | Trim recommendation | Status | Source |
|---------|----------|-----------------|---------------|----------------------|---------------------|--------|--------|
| Inbox (offset) | `due_reminder` | `true` (server.js:1148) | lu via `prefs.due_reminder !== false` (server.js:1437) | oui — offset morning_of | keep | proposed | server.js:1148, :1437-1439 |
| Inbox (offset) | `past_due` | `true` (server.js:1149) | lu via `prefs.past_due !== false` (server.js:1440) | oui — offset past_due | keep | proposed | server.js:1149, :1440 |
| Email | `email_reminder` | `true` (server.js:1147) | ligne per-user, `=== false` désactive (server.js:1248) ; **supprimé si digest opt-in** (`email_digest === true` stocké, server.js:1260) | oui — emails due_reminder + past_due (les deux mappent sur `email_reminder`) | keep (la suppression digest-on est documentée dans la section Digest) | proposed | server.js:1147, :1188-1194, :1248, :1260 |
| Push | — (`push_due` retiré Phase 37) | — | — | — | n/a — précédent de retrait : clé supprimée end-to-end, PUT rejeté 400 unknownPrefKey, lignes historiques inertes | proposed | server.js:1116-1119 ; STATE.md 37-03 |

## Digest

⚠️ Le digest **n'est pas un type de notification** : il n'écrit **aucune ligne notif**. C'est un email direct `MAILER.sendDigest` post-commit (server.js:1558-1566), précédé d'un claim exactly-once par (workspace, user, date locale) (server.js:1548-1553).

**Asymétrie de gate à connaître :** l'opt-in digest lit la valeur **stockée** strictement (`email_digest !== true` → skip, server.js:1517), **jamais** les défauts fusionnés de `getUserNotifPrefs`. Tous les autres types d'email utilisent le gate inversé : défauts fusionnés, `=== false` désactive (server.js:1248). Conséquence : un utilisateur sans ligne de prefs reçoit des emails mention/assign (défaut `true`) mais **jamais** de digest (pas de `true` stocké) — l'opt-in est réel depuis l'inversion Phase 38 (D-14). La même valeur stockée supprime aussi les emails reminder (server.js:1260) : digest ON gagne sur `email_reminder` quelle que soit sa valeur (D-11).

| Channel | Pref key | Current default | Storage state | Live ? (consumed by) | Trim recommendation | Status | Source |
|---------|----------|-----------------|---------------|----------------------|---------------------|--------|--------|
| Email (direct, pas de notif row) | `email_digest` | aucun défaut (undefined-falsy = OFF) (server.js:1121-1122 ; opt-in réel D-14 Phase 38) | valeur **stockée** lue strictement `=== true` (server.js:1517) — PAS la fusion defaults | oui — gate d'envoi digest + suppression des emails reminder (server.js:1260) | keep (l'inversion default a déjà eu lieu en spec Phase 38 ; le contenu du digest au-delà de due-today/overdue est un candidat backlog) | proposed | server.js:1508-1567, :1260 |

## Décision RFC 8058 List-Unsubscribe (email digest)

Recommendation (`proposed` — en attente de validation propriétaire) :

1. **MAINTENANT :** ajouter un header `List-Unsubscribe: <https://example.com/unsubscribe/opaquepart>` (RFC 2369, header-only) aux **emails digest uniquement** — changement de header uniquement dans `buildDigestMessage` (mailer.js:592-603, bloc de headers actuel From/To/Subject/…/Auto-Submitted/X-Mailer sans aucun header unsubscribe), zéro dépendance.
2. **DIFFÉRER :** `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) exige une signature DKIM couvrant les deux headers (RFC 8058 §3.1/§4 : « MUST apply at least one valid DKIM signature » sans laquelle le sender « SHOULD NOT offer a one-click unsubscribe »). Ce mailer ne signe rien — aucun DKIM dans mailer.js ni server.js (grep 2026-11-05, zéro résultat). Le one-click n'atterrira qu'avec une milestone DKIM future. Ne pas promettre de conformité one-click Gmail/Yahoo à partir des seuls headers.
3. L'URI de désabonnement nécessite un identifiant destinataire difficile à forger (RFC 8058 §6) et un endpoint POST — détail d'implémentation pour la milestone de suivi, noté ici sans être conçu. Exemples d'URI avec parties placeholder/opaque uniquement (voir l'exemple ci-dessus) — jamais d'URI réel ou forgeable.

| Recommandation | Portée | Status | Source |
|----------------|--------|--------|--------|
| Header `List-Unsubscribe` (RFC 2369) sur les emails digest | buildDigestMessage, mailer.js:592-603 | proposed | mailer.js:525, :592-603 ; RFC 8058 §3.1/§4/§6 |
| Header `List-Unsubscribe-Post` one-click | déféré à une milestone DKIM | proposed | RFC 8058 §3.1/§4 ; grep dkim mailer.js + server.js → 0 résultat (2026-11-05) |

