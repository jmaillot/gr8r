# Phase 15: Password Change End-to-End - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-27
**Phase:** 15-Password Change End-to-End
**Areas discussed:** Endpoint design, Response & errors, Throttle policy, Client UX after change

---

## Endpoint design

| Option | Description | Selected |
|--------|-------------|----------|
| Route dédiée | `PATCH /api/auth/password` — cohérent avec la famille /api/auth/* (D-26), ne surcharge pas /me | ✓ |
| Étendre PATCH /me | body avec currentPassword + newPassword — mélange un changement sensible avec les préférences | |
| Style RPC | `POST /api/auth/change-password` — s'écarte du style existant | |

**User's choice:** Route dédiée (Recommandé)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| PATCH | Modification d'une ressource existante (le compte), cohérent avec PATCH /api/auth/me | ✓ |
| POST | Style action, comme POST /api/auth/login | |
| Vous décidez | Le chercheur/planificateur tranche | |

**User's choice:** PATCH
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| sameOrigin requis | Même garde que PATCH /me, pattern établi | ✓ |
| Sans sameOrigin | Se fie au cookie SameSite — plus faible | |

**User's choice:** sameOrigin requis
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Mêmes règles que signup | 10+ caractères + chiffre/symbole, validé serveur | ✓ |
| Longueur seule | Plus permissif que l'inscription | |
| Pas de validation serveur | Le client décide — contredit « le serveur ne ment pas » | |

**User's choice:** Mêmes règles que signup
**Notes:** —

## Response & errors

| Option | Description | Selected |
|--------|-------------|----------|
| ok minimal | `200 { ok: true }` — pas de revokedCount exposé | ✓ |
| Avec revokedCount | Le toast pourrait dire « 2 autres sessions déconnectées » | |

**User's choice:** ok minimal
**Notes:** Le toast reste count-free.

| Option | Description | Selected |
|--------|-------------|----------|
| Codes dédiés | `wrongCurrentPassword`, `passwordTooWeak` (existant), `passwordRequired` | ✓ |
| invalidCredentials | Réutiliser le code du login — moins clair ici | |

**User's choice:** Codes dédiés
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Garder les champs | Seul le champ actuel est effacé, l'erreur s'affiche sous ce champ | ✓ |
| Tout effacer | Plus prudent mais pénible | |

**User's choice:** Garder les champs
**Notes:** —

## Throttle policy

| Option | Description | Selected |
|--------|-------------|----------|
| Clé user_id | tooMany() 10 essais / 15 min (borne D-11) ; l'appelant est déjà authentifié par cookie | ✓ |
| IP + email | Forme login (D-12) — redondant ici, CGNAT punitif | |
| Double clé | Plus strict mais double comptage | |

**User's choice:** Clé user_id
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Oui, échec = tentative | Le mauvais mot de passe actuel est le vecteur d'attaque | ✓ |
| Nuance par type d'échec | Sans valeur réelle | |

**User's choice:** Oui, échec = tentative
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Copy D-13 | Générique, pas de timing, pas de Retry-After | ✓ |
| Avec délai affiché | Contredit D-13 | |

**User's choice:** Copy D-13
**Notes:** —

## Client UX after change

| Option | Description | Selected |
|--------|-------------|----------|
| Toast + refresh sessions | Champs effacés, toast honnête (PASS-03), onglet sessions rafraîchi (D-29), reste connecté | ✓ |
| Sign-out complet | Déconnecte aussi la session courante — plus brutal | |

**User's choice:** Toast + refresh sessions
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Réutilise 14-05 | Intercept 401 central → signOutRevoked() + err.signedOutElsewhere ; test de vérification seulement | ✓ |
| Notification push | Polling/SSE — hors scope | |

**User's choice:** Réutilise 14-05
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Identiques à signup | Cohérent avec la validation serveur (D-36) | ✓ |
| Assoupli | Divergent du serveur, incohérent | |

**User's choice:** Identiques à signup
**Notes:** —

## the agent's Discretion

- Exact toast copy within the honest-copy rule (catalogued EN+FR)
- Test file placement following existing `test/` conventions
- Handler ordering within the `/api/auth/*` route block

## Deferred Ideas

None — discussion stayed within phase scope.
