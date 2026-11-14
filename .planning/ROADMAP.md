# Roadmap: Projects Studio

## Milestones

- ✅ **v2.2 Notifications, Search & Delivery** — Phases 56-61 (shipped 2026-11-14)
- ✅ **v2.1 Member & Project Experience** — Phases 53-55 (shipped 2026-11-11)

## Phases

<details>
<summary>✅ v2.2 Notifications, Search & Delivery (Phases 56-61) — SHIPPED 2026-11-14</summary>

- [x] Phase 56: Delivery Infrastructure (4/4 plans) — completed 2026-11-12 — e2e anti-stale-dist guard, Vite code-splitting under the 500 kB gate, i18n-ready locale infrastructure
- [x] Phase 57: Views, Columns & General Access (3/3 plans) — completed 2026-11-12 — column show/hide, saved views in server rows, General-Access granularity beyond private/public
- [x] Phase 58: Full-Text Search (4/4 plans incl. gap closure) — completed 2026-11-13 — FTS5 + pg dialect-complete task search, Ctrl-K hybrid palette merge, /search page
- [x] Phase 59: Browser Push (3/3 plans) — completed 2026-11-13 — web-push VAPID custody, per-type pref gating, service-worker handler with deep links, owner UAT 6/6
- [x] Phase 60: Admin Dashboard & Member Self-View (3/3 plans incl. gap closure) — completed 2026-11-13 — power-admin four-panel dashboard, byte-level-redacted member self-view
- [x] Phase 61: Notification Trim (2/2 plans) — completed 2026-11-14 — D-04 dead-prefs removal, inbox burst coalescing (render-only), audit-backed ruling doc

Full details: `milestones/v2.2-ROADMAP.md` · Requirements: `milestones/v2.2-REQUIREMENTS.md`

</details>

<details>
<summary>✅ v2.1 Member & Project Experience (Phases 53-55) — SHIPPED 2026-11-11</summary>

Archived: `milestones/v2.1-ROADMAP.md`

</details>

## Backlog

### Phase 999.1: Follow-up — Phase 57 deferred UAT follow-up: Test 1 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 57 verification
**Source phase:** 57
**Deferred at:** 2026-11-12 during /gsd-verify-work 57 session completion
**Follow-ups:**
- [ ] Test 1: Affichage sur téléphone fortement tronqué avec le bouton colonnes (layout mobile de la table des tâches) (deferred 2026-11-12)
