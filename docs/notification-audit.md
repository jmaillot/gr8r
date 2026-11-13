# Audit des notifications — v2 (Phase 61)

> Reconstruit à partir du code réel post-Phase-60 (server.js + src/ + mailer.js, 2026-11-13).
> Remplace le doc Phase 39 (supprimé par `b16010f`, récupérable à `85785a2`) — **input, not gospel** :
> chaque ligne est re-dérivée et chaque citation re-vérifiée contre le code d'aujourd'hui. Une citation
> qui ne correspond plus signale une dérive du code, pas du document.

## Changements majeurs depuis l'audit Phase 39

1. **Push est vivant** (Phase 59) : `sendPushFor` (server.js:1798) + `PUSH_NOTIF_KIND`
   (server.js:1770-1776) consomment `push_mention` / `push_assign` / `push_comment` / `push_due`.
   Les lignes push ne sont plus inertes — les recommandations de trim Phase 39 « trim push » sont
   **obsolètes** : ces clés ont maintenant un lecteur et un défaut `true` délibéré.
2. **`push_due` est restauré et vivant** (Phase 59 D-09) : les notifs `due_reminder`/`past_due`
   pushent désormais (server.js:1784-1785), toggle présent dans Settings › Push (settings.js:610).
   Le précédent de retrait Phase 37 est inversé.
3. **Les toggles morts ne rendent plus** (cleanup propriétaire `projectsstudio#18`) :
   `mention_ws`, `assign_status`, `assign_over` ont disparu de l'UI settings ;
   `assign_self` n'a plus de toggle non plus. Les 4 clés restent **whitelistées des deux côtés**
   (server.js:1583-1601 ; src/core/notifPrefs.js:42-48) pour que les rows legacy round-trippent —
   mais `assign_self` traîne encore un défaut `true` (server.js:1635, notifPrefs.js:35) sans lecteur.
4. **RFC 8058 implémenté** : `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` sur les
   digests (mailer.js:754), tokens signés + endpoint de désabonnement qui re-merge
   `email_digest=false` (server.js:7421-7468). Les deux rows Phase 39 sont **résolues** — sorties
   du périmètre de ruling.
5. **Fan-out push miroir de l'email** (Phase 59 D-11) : self-skip → pref → `memberCanReadProject`
   au send ; jamais de suppression digest côté push (D-10).

## Convention de validation (porte propriétaire — D-05)

Chaque ligne de recommandation porte une cellule **Status** :

- **`proposed`** — recommandation émise, aucune décision prise. **Rien n'est codeable dans cet état.**
- **`validated`** — le propriétaire a tranché pour ; une ligne `validated-by: <owner>, <date>` est
  ajoutée, et la décision est recopiée dans `.planning/STATE.md` → Recent Decisions.
- **`rejected`** — le propriétaire refuse ; la recommandation ne doit jamais être codée.

À la livraison de ce doc (Phase 61, avant plan-phase), **toutes les lignes sont `proposed`** —
les rulings sont collectés en session (D-02) et les cellules mises à jour avant `/gsd-plan-phase 61`.

---

## Mentions

Les mentions @membre et @équipe sont émises côté client par `emitMentions`
(src/actions/actions.js:155-186) : `mention_all` gate le fan-out membres (actions.js:159),
`mention_team` gate le fan-out équipes (actions.js:160). Les emails passent par `NOTIF_EMAIL_KIND`
→ `email_mention` (server.js:1870-1876, gate :1919-1921), les pushs par `PUSH_NOTIF_KIND` →
`push_mention` (server.js:1770-1776).

| Channel | Pref key | Current default | Live ? (consumed by) | Trim recommendation | Status | Source |
|---------|----------|-----------------|----------------------|---------------------|--------|--------|
| Email | `email_mention` | `true` (server.js:1630) | oui — emails de mention | **keep** (canal principal) | proposed | server.js:1870-1876, :1921 |
| Push | `push_mention` | `true` (server.js:1635) | **oui depuis Phase 59** — push de mention | **keep** (défaut true délibéré, Phase 59) | proposed | server.js:1770-1776 ; src/core/push.js:29 |
| Inbox | `mention_all` | `true` (server.js:1639) | oui — gate fan-out membres | **keep** | proposed | src/actions/actions.js:159 |
| Inbox | `mention_team` | undefined-falsy = ON (server.js:1577) | oui — gate fan-out @équipe | **keep** (gate lit `!== false`) | proposed | src/actions/actions.js:160 |
| Inbox | `mention_ws` | undefined-falsy (server.js:1577) | **non** — aucun lecteur (toggle ne rend plus depuis #18 ; grep src/ + server.js 2026-11-13 : whitelist/défauts uniquement) | **ruling D-04** : trim-to-default (retirer de la whitelist client) OU suppression complète (les 2 whitelist + i18n résiduels ; précédent `push_due` Phase 37 pour le retrait end-to-end avec PUT 400) | **validated** — full removal (option A) · validated-by: owner, 2026-11-13 | server.js:1594 ; src/core/notifPrefs.js:45 ; grep 2026-11-13 |

## Assignments

Les notifs d'assignation partent à la création d'une tâche déjà assignée (actions.js:114) et au
changement d'assignée (actions.js:249). Emails via `email_assign`, pushs via `push_assign`.

| Channel | Pref key | Current default | Live ? | Trim recommendation | Status | Source |
|---------|----------|-----------------|--------|---------------------|--------|--------|
| Email | `email_assign` | `true` (server.js:1631) | oui | **keep** | proposed | server.js:1870-1876, :1921 |
| Push | `push_assign` | `true` (server.js:1636) | **oui depuis Phase 59** | **keep** | proposed | server.js:1770-1776 |
| Inbox | `assign_self` | `true` (server.js:1635 ; notifPrefs.js:35) | **non** — aucun lecteur, plus de toggle | **ruling D-04** : trim-to-default OU suppression complète des 2 whitelist. ⚠️ c'est la seule des 4 clés mortes qui porte encore un **défaut** : elle pollue `getUserNotifPrefs`/GET pour tous | **validated** — full removal (option A) · validated-by: owner, 2026-11-13 | server.js:1583-1601, :1635 ; src/core/notifPrefs.js:35, :47 ; grep 2026-11-13 |
| Inbox | `assign_status` | undefined-falsy | **non** — aucun lecteur, plus de toggle | **ruling D-04** : trim-to-default OU suppression complète. NB : le type `update` (section ci-dessous) est le vrai canal des changements de statut, sans lecteur de pref | **validated** — full removal (option A) · validated-by: owner, 2026-11-13 | server.js:1596 ; src/core/notifPrefs.js:46 |
| Inbox | `assign_over` | undefined-falsy | **non** — aucun lecteur, plus de toggle (les retards = `past_due`, qui lit `prefs.past_due`, server.js:2075) | **ruling D-04** : trim-to-default OU suppression complète | **validated** — full removal (option A) · validated-by: owner, 2026-11-13 | server.js:1597 ; src/core/notifPrefs.js:47 |

## Commentaires

Un commentaire notifie d'abord les @mentionnés (actions.js:1263), puis les watchers restants
(actions.js:1265) — type `comment`, snippet 70 car.

| Channel | Pref key | Current default | Live ? | Trim recommendation | Status | Source |
|---------|----------|-----------------|--------|---------------------|--------|--------|
| Email | `email_comment` | **`false`** (server.js:1632) — le SEUL défaut false | oui | **keep** (opt-in volontaire d'un canal bruyant) | proposed | server.js:1872, :1921 |
| Push | `push_comment` | `true` (server.js:1637) | **oui depuis Phase 59** | **keep** | proposed | server.js:1772 ; src/core/push.js:29 |
| Inbox | — (pas de clé) | — | oui — rows `comment` sans gate de pref | n/a (pas de clé) ; **candidat burst NOTIF-03** (voir section Burst) | proposed | src/actions/actions.js:1263-1265 |

## Mises à jour (update) — recommandation de gating (D-06)

Le type `update` notifie les watchers (assignée(s), créateur, commentateurs — actions.js:184-192)
à **chaque** changement de statut (actions.js:213-220). **In-app uniquement**, **aucun pref key**
ne le gate, absent de `NOTIF_EMAIL_KIND` (server.js:1870-1876 → `if (!prefKey) continue`) et de
`PUSH_NOTIF_KIND` — jamais emailé ni pushé.

| Channel | Pref key | Current default | Live ? | Trim recommendation | Status | Source |
|---------|----------|-----------------|--------|---------------------|--------|--------|
| Inbox | — (aucun pref key) | — | oui — émis à tout statut vers les watchers, sans gate | **ruling D-06** : (a) laisser tel quel, (b) **gater par un nouveau pref** (ex. `notify_updates`, défaut true — additive, recette Phase 34), (c) supprimer le type. NB : c'est aussi le **plus gros candidat burst** avec les commentaires | **validated** — (a) laisser tel quel ; le burst est traité par NOTIF-03 · validated-by: owner, 2026-11-13 | src/actions/actions.js:213-220 ; server.js:1870-1876, :1911-1912 |

## Rappels d'échéance (due_reminder / past_due)

Cadence deux offsets (Phase 37) : `morning_of` le jour J (server.js:2073) et `past_due` au-delà
(server.js:2075), exactly-once via claim `reminders_sent` (server.js:2099). Chaque offset produit
désormais **une row inbox + un email (`email_reminder`) + un push (`push_due`)** — soit jusqu'à
6 émissions par tâche en retard (2 inbox + 2 emails + 2 pushs).

| Channel | Pref key | Current default | Live ? | Trim recommendation | Status | Source |
|---------|----------|-----------------|--------|---------------------|--------|--------|
| Inbox | `due_reminder` | `true` (server.js:1633) | oui — offset morning_of (gate `!== false`, server.js:2073) | **keep** | proposed | server.js:2073 |
| Inbox | `past_due` | `true` (server.js:1634) | oui — offset past_due (server.js:2075) | **keep** | proposed | server.js:2075 |
| Email | `email_reminder` | `true` (server.js:1630) | oui — les deux offsets mappent sur `email_reminder` ; **supprimé si digest opt-in** (stored `email_digest === true`, server.js:1929) | **keep** | proposed | server.js:1874-1875, :1921, :1929 |
| Push | `push_due` | `true` (server.js:1638) | **oui depuis Phase 59** — les deux offsets (server.js:1784-1785) | **keep** (restauré Phase 59 D-09, toggle Settings › Push settings.js:610). NB : le push reminder n'a **pas** de branche de suppression digest (D-10 : push jamais supprimé) | proposed | server.js:1770-1776, :1784-1785 ; src/core/notifPrefs.js:12-14 |

## Digest

Le digest n'écrit aucune row notif : email direct post-commit, opt-in **strict sur la valeur
stockée** `email_digest === true` (server.js:2169), jamais les défauts fusionnés. Le digest
gagne sur `email_reminder` quelle que soit sa valeur (server.js:1929). Unsubscribe one-click
implémenté (mailer.js:754 ; endpoint server.js:7421-7468) — **résolu, hors ruling**.

| Channel | Pref key | Current default | Live ? | Trim recommendation | Status | Source |
|---------|----------|-----------------|--------|---------------------|--------|--------|
| Email (direct) | `email_digest` | undefined-falsy = OFF (opt-in réel, Phase 38 D-14) | oui — gate digest + suppression reminder emails | **keep** | proposed | server.js:1929, :2169 ; mailer.js:754 |

---

## Candidats burst (D-05 — alimente NOTIF-03, coalescing inbox render-only)

Le trigger de grouping verrouillé en contexte : **même tâche + même type parmi les non-lues**
(D-11 contexte), inbox uniquement, zéro changement serveur. Les classes burst-prones :

| Classe | Mécanisme | Profil de burst | Recommandation de coalescing | Status | Source |
|--------|-----------|-----------------|------------------------------|--------|--------|
| Storm de commentaires | chaque commentaire → 1 row `comment` + 1 row `mention` par mentionné (actions.js:1263-1265) | N comments sur une tâche active = 2N rows pour un watcher mentionné | **coalescer** (résumé « N nouveaux commentaires — KEY Titre ») | **validated** — coalescer · validated-by: owner, 2026-11-13 | src/actions/actions.js:1263-1265 |
| Rafale `update` | 1 row par changement de statut, sans gate (actions.js:213-220) | déplacement d'une tâche entre colonnes = 1 row par mouvement, watchers inclus | **coalescer** (même trigger que comments) | **validated** — coalescer · validated-by: owner, 2026-11-13 | src/actions/actions.js:213-220 |
| Stack de rappels | 2 offsets × 3 canaux par tâche en retard (server.js:2073-2075, 1874-1875, 1784-1785) | max 2 rows inbox par tâche — burst modéré, borné par le claim exactly-once | recommandation : **ne pas coalescer** | **validated** — **coalescer quand même** (ruling propriétaire, override de la recommandation) · validated-by: owner, 2026-11-13 | server.js:2073-2075, :2099 |
| Mentions en rafale | `emitMentions` par description/commentaire (actions.js:155-186, :961, :978, :1263) | import/collage d'un doc avec N mentions = N rows | **coalescer** (même trigger) — mention d'un doc entier rare mais réel | **validated** — coalescer · validated-by: owner, 2026-11-13 | src/actions/actions.js:961, :978 |

---

*Phase 61 — Notification Trim. Audit reconstruit 2026-11-13 ; rulings D-05 à collecter en session avant plan-phase (D-02).*
