# Phase 68: Backlog Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-16
**Phase:** 68-backlog-polish
**Areas discussed:** POL-01 carte mobile × hidden[], POL-02 retry SMTP claim-based, POL-03 scoping CSS WR-01, POL-04 réconciliation 64-VALIDATION

---

## POL-01 — Champs minimum-identity

| Option | Description | Selected |
|--------|-------------|----------|
| Statut + titre + key | Le trio identifiant la tâche | |
| Statut + titre + key + assignees | Les trois plus les assignees | ✓ |

**User's choice:** Statut + titre + key + assignees
**Notes:** —

## POL-01 — Contrôle mobile des champs

| Option | Description | Selected |
|--------|-------------|----------|
| Réutiliser le popover cols | Le popover existant devient utilisable ≤900px, une seule UI | ✓ |
| Sheet dédié mobile | Panneau dédié listant uniquement les champs carte | |

**User's choice:** Réutiliser le popover cols
**Notes:** Les entrées sans équivalent carte restent togglables (voir décision suivante).

## POL-01 — Colonnes sans équivalent carte

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle global | Cacher la colonne table cache aussi son équivalent carte ; la carte lit juste hidden[] | ✓ |
| Griser sans équivalent carte | Entrées désactivées avec hint | |

**User's choice:** Toggle global
**Notes:** —

## POL-02 — Périmètre retry

| Option | Description | Selected |
|--------|-------------|----------|
| Notifs + digest | Les deux sites fire-and-forget passent en claim-based ; invites/2FA restent fire-and-forget | ✓ |
| Tous les emails | Notifs, digest, invites ET 2FA | |
| Notifs seules | Le digest garde sa ledger D-12 existante | |

**User's choice:** Notifs + digest
**Notes:** —

## POL-02 — Stockage des claims

| Option | Description | Selected |
|--------|-------------|----------|
| Table email_outbox dédiée | Même shape que webhook_deliveries, domaines séparés | ✓ |
| Réutiliser webhook_deliveries | Une seule table avec channel='email' | |

**User's choice:** Table email_outbox dédiée
**Notes:** —

## POL-02 — Politique de retry

| Option | Description | Selected |
|--------|-------------|----------|
| Mêmes backoffs que WHK | 5 tentatives, 1m→5m→30m→2h→8h — un seul mental model | ✓ |
| Plus de tentatives | 8 tentatives sur 24h — deux politiques | |

**User's choice:** Mêmes backoffs que WHK
**Notes:** —

## POL-02 — Articulation avec la ledger digest D-12

| Option | Description | Selected |
|--------|-------------|----------|
| Ledger sémantique + outbox transport | La ledger claim le QUOI, outbox le COMMENT ; une rangée outbox par digest claimé | ✓ |
| Tout dans outbox | Supprimer la ledger D-12 | |

**User's choice:** Ledger sémantique + outbox transport
**Notes:** —

## POL-02 — Sort des emails morts

| Option | Description | Selected |
|--------|-------------|----------|
| Dead silencieux + purge 7j | Statut dead, purge, aucun badge — les notifs restent visibles in-app | ✓ |
| Badge d'échec visible | Nouvelle surface UI | |

**User's choice:** Dead silencieux + purge 7j (après REASK — la première réponse « Badge d'échec visible » a été re-questionnée à la demande de l'utilisateur)
**Notes:** —

## POL-03 — Toolbars hors .page.flush

| Option | Description | Selected |
|--------|-------------|----------|
| Scope strict WR-01 | `.page.flush .toolbar` uniquement, non-régression prouvée par la suite e2e | ✓ |
| Audit des autres toolbars | Élargir le périmètre au-delà de POL-03 | |

**User's choice:** Scope strict WR-01
**Notes:** —

## POL-04 — Réconciliation 64-VALIDATION

| Option | Description | Selected |
|--------|-------------|----------|
| Acceptation formelle | Section Formal Acceptance (statut accepted, rationale §5.5, evidence suite 115/115) | ✓ |
| Valider rétroactivement | Re-exécuter validate-phase — les résultats ne diraient rien sur le milestone d'origine | |

**User's choice:** Acceptation formelle
**Notes:** —

## the agent's Discretion

- Forme du driver de retry email et mécanisme de purge
- Structure de la section Formal Acceptance
- Détails d'implémentation du filtrage carte par hidden[]

## Deferred Ideas

None — discussion stayed within phase scope
