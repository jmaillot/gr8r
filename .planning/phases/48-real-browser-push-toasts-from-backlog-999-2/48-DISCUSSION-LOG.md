# Phase 48 — Discussion Log

**Date:** 2026-11-07
**Participant:** owner (Jérémy) + opencode (GSD discuss-phase)

## Areas selected (all 4)

1. Mécanisme de push
2. Déclenchement des toasts
3. UI des réglages
4. Permission refusée

## Q1 — Mécanisme de push

**Options:** (a) Poll + Notification API, service worker minimal, ~100 lignes / (b) Vrai Web
Push complet (VAPID + RFC 8291 à la main, 500-600 lignes, souscriptions à stocker).

**Decision:** (a) Poll + Notification API. Rationale accepted: email covers closed-tab
delivery; zero-dep crypto disproportionate.

## Q2 — Combinaison toast / notification

**Options:** (a) foreground toast / background notification, jamais les deux, jamais pour un
événement déjà lu / (b) cumulés / (c) toasts seuls.

**Decision:** (a) Foreground toast / background notification, gated by the push_* pref keys,
seen-state respected.

## Q3 — UI des réglages

**Options:** (a) 3 toggles granulaires conservés (clés existantes, zéro migration) / (b) un
seul toggle global (migration nécessaire).

**Decision:** (a) 3 toggles granulaires; permission requested on first activation; "Coming
soon" badge removed.

## Q4 — Permission refusée

**Options:** (a) toggle persiste + badge « navigateur bloqué » + toast explicatif, badge
clairé au poll suivant si permission accordée / (b) bloquer le toggle / (c) silencieux.

**Decision:** (a) Badge « bloqué » + toast; toggle saves regardless (intent), badge clears
when permission returns.
