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

<!-- gsd:write-continue -->
