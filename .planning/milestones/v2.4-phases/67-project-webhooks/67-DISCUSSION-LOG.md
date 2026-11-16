# Discussion Log — Phase 67: Project Webhooks

**Date:** 2026-11-15
**Mode:** default (interactive)
**Language:** French (user-facing)

## Areas Discussed

### Enveloppe & cap 28 Ko
| Question | Options presented | Decision |
|----------|-------------------|----------|
| Définition des champs de l'enveloppe | Whitelist fixe par événement (rec.) / Enveloppe unique commune / Je précise | Whitelist fixe par événement |
| Payload > 28 Ko | Tronquer & livrer (rec.) / Échec explicite / Vous décidez | Tronquer & livrer |
| Contexte projet | Projet + auteur (rec.) / Projet enrichi / Minimal sans projet | Projet + auteur |
| Format des timestamps | ISO UTC (rec.) / Locale FR / Vous décidez | ISO UTC |

### Politique de retry
| Question | Options presented | Decision |
|----------|-------------------|----------|
| Tentatives & cadence | 5 essais, backoff expo 1m→5m→30m→2h→8h (rec.) / 3 essais rapides / Je précise | 5 essais, backoff expo |
| Visibilité du hook mort | Badge dans la liste (rec.) / Notification owner / Silencieux | Badge dans la liste |
| Rétention deliveries | 7 jours (rec.) / 30 jours / 24 h | 7 jours |

### UX de gestion
| Question | Options presented | Decision |
|----------|-------------------|----------|
| Emplacement | Paramètres projet (rec.) / Paramètres workspace / Onglet projet | Paramètres projet |
| Filtre événements | Checkboxes 8 events (rec.) / Pas de filtre / Chips assignees | Checkboxes 8 events |
| Secret HMAC | Généré + toast 1× (rec.) / Fourni par l'utilisateur / Hybride | Généré + toast 1× |
| Bouton test | Bouton test (rec.) / Pas de test | Bouton test |
| Format par défaut | teams-adaptive (rec.) / teams-messagecard / raw-json | teams-adaptive |

### Mention AAD assigné
| Question | Options presented | Decision |
|----------|-------------------|----------|
| Persistance oid | Persister oid dès cette phase (rec.) / Fallback bold-name seulement / oid en plan séparé | Persister oid dès cette phase |
| Activation de la mention | Auto, sans réglage (rec.) / Toggle par hook / Vous décidez | Auto, sans réglage |

## Deferred Ideas
- None — discussion stayed within phase scope

## the agent's Discretion
- Claim-table shared design with POL-02, retry driver shape, purge mechanism
- Teams formatter / envelope builder internals
- Test-delivery payload contents
