# Phase 35: Discussion Log

**Date:** 2026-11-03
**Mode:** default (no flags)
**Areas selected:** 4/4

| Area | Options presented | Decision | Notes |
|---|---|---|---|
| Fenêtre & fiabilité de l'undo | Toast-only / Undo persistant | **Toast-only** — closure-captured before-map, same ephemeral toast as all other undos | Follow-up: PUT failure → **error toast, no compensating rollback** (same compromise as delTeam's early return) |
| Sémantique de réconciliation | Union additif / Replay strict | **Union additif** — PUT = current team set ∪ deleted-team-if-in-before-map | Follow-up: stale-client corner (member added to deleted team during window) → covered by union, **pinned by test**, no server guard |
| Où vit la logique | Côté client onAction / Route serveur dédiée | **Client-side onAction** — mirror of delTeam via existing PUT route, zero new server surface | Follow-up: local mode → **restore(snap) unchanged** (doc snapshot already honest, no authority rows) |
| Compose forwarding | Ligne + note §14 / + walkthrough | **Walkthrough** — line after MASTER_KEY with `:-` form + full compose rotation walkthrough in §14 | Follow-up: test = **parse + `docker compose config`, both cases** (var set / unset); skip with explicit reason if docker binary unavailable |

## Agent's discretion items
- Toast copy / i18n keys (EN+FR)
- Test file placement (membership.test.mjs vs new file)
- before-map helper shape (reuse modal Map idiom or inline)

## Deferred
- Persistent admin restore surface (own phase if ever)
- Server-side dedicated restore route (rejected this phase, revisit if client orchestration proves brittle)

*User selected all four proposed areas; every recommendation offered was accepted.*
