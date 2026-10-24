# Phase 9: Server messages & activity history - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 09-server-messages-activity-history
**Areas discussed:** Catalogue des traductions des erreurs

---

## Catalogue des traductions des erreurs

| Option | Description | Selected |
|--------|-------------|----------|
| Clé = code verbatim | Le code serveur `EMAIL_TAKEN` → clé `err.EMAIL_TAKEN`, pas de table de mapping | ✓ |
| Clés sémantiques + mapping | Table de correspondance code→clé côté client | |
| Phrases complètes avec params | Interpolation `{name}` etc., messages naturels | ✓ |
| Phrases simples sans params | Phrase générique par code | |
| Message serveur brut | Code inconnu → message anglais du serveur affiché tel quel | ✓ |
| Message générique traduit | Message générique traduit à la place du texte anglais | |
| Test de parité oui | Chaque code émis doit exister dans en.json ET fr.json | ✓ |
| Test de parité non | Le fallback couvre les oublis à l'exécution | |

**User's choice:** les quatre recommandations (verbatim, params, brut, test de parité)
**Notes:** décision rapide, sans hésitation — le pattern catalogue existant (phases 6-7)
servait de référence implicite.

---

## Zones non discutées (laissées à la discrétion de l'agent)

- Transport & nommage des codes (placement dans le payload, format)
- Taxonomie des verbes d'activité (schéma des verbes, structure de `extra`)
- Compatibilité legacy (classification sans migration, suppression du prose au rendu)

## the agent's Discretion

Les trois zones ci-dessus ont été proposées mais non sélectionnées par l'utilisateur ;
elles sont documentées comme discretion dans CONTEXT.md avec leurs contraintes roadmap.

## Deferred Ideas

None — discussion stayed within phase scope
