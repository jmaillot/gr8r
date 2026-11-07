# Roadmap: gr8r

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2025-11-27)
- ✅ **v1.1 Security** — Phases 10-15 (shipped 2026-01)
- ✅ **v1.2 Authentication (SSO/OIDC)** — Phases 16-20 (shipped 2026-03)
- ✅ **v1.3 Invitations & Onboarding** — Phases 21-24 (shipped 2026-05)
- ✅ **v1.4 Admin Experience** — Phases 25-27 (shipped 2026-06)
- ✅ **v1.5 Integrations & Email** — Phases 28-30 (shipped 2026-09)
- ✅ **v1.6 Membership Refinement** — Phase 31 (shipped 2026-11-02)
- ✅ **v1.7 Team Visibility & Hardening** — Phases 32-35 (shipped 2026-11-04)
- ✅ **v1.8 Notification Sanity** — Phases 36-39 (shipped 2026-11-05)
- ✅ **v1.9 Digest Context & One-Click Unsubscribe** — Phases 40-44 (shipped 2026-11-07)

<details>
<summary>✅ v1.9 Digest Context & One-Click Unsubscribe (Phases 40-44) — SHIPPED 2026-11-07</summary>

- [x] Phase 40: Digest Subject & Task Lines (2/2 plans) — completed 2026-11-05
- [x] Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers (2/2 plans) — completed 2026-11-06
- [x] Phase 42: One-Click Unsubscribe Endpoint (2/2 plans) — completed 2026-11-06
- [x] Phase 43: Workspace Logo (3/3 plans) — completed 2026-11-06
- [x] Phase 44: Per-Member Timezones (4/4 plans incl. gap closure 44-04) — completed 2026-11-07

Details: [.planning/milestones/v1.9-ROADMAP.md](milestones/v1.9-ROADMAP.md)

</details>

## Backlog

*(Empty — Phase 999.1 (Phase 37 deferred UAT Test 2: workspace name in digest subject +
project name on task lines) is consumed by v1.9 SUBJ-01/02, mapped to Phase 40. Remaining
Phase 39 audit recommendations stay `proposed` pending D-05 owner rulings and join only
when validated.)*

### Phase 999.2: Follow-up — Phase 41 email-notification audit decision: real browser push + toasts (BACKLOG)

**Goal:** Implement real browser push notifications and toast notifications, replacing the inert `push_mention`/`push_assign`/`push_comment` toggles (currently visible with a "coming soon" badge) and adding toast feedback for mentions/assignments.
**Source phase:** 41 (email-notification audit, Kanzo task projectsstudio#6)
**Deferred at:** 2026-11-05 during /gsd-verify-work 41 session (audit decisions)
**Follow-ups:**
- [ ] Test 1: Real web push (service worker + browser Notification) wired to the existing push_* pref keys, with a "coming soon" badge added to the Push section in Settings in the meantime (deferred 2026-11-05)
- [ ] Test 3: Toast notifications for mention/assign events (deferred 2026-11-05)

### Phase 45: Database adapter — optional Postgres backend via env, SQLite default

**Goal:** Optional Postgres backend selected by env — `DB_URL` postgres:// runs the server on the
`pg` driver through a minimal async adapter (`db.get/all/run/tx`); unset stays byte-identical
SQLite (`node:sqlite`), zero-dependency and default. Fail-closed pg boot, dialect branches owned
by the adapter, one-shot SQLite→pg copy script, opt-in `POSTGRES_TEST_URL` matrix. SQL Server
out of scope.
**Requirements**: D-01..D-14 (requirement IDs of record = CONTEXT.md decision IDs; see CONTEXT.md `<decisions>` and each plan's `requirements:` frontmatter)
**Depends on:** Phase 44
**Plans:** 4/7 plans executed

Plans:
**Wave 1**
- [x] 45-01-PLAN.md — db-adapter.mjs facade + SQL rewrite + fail-closed probe + Wave 0 tests (tracer)
- [x] 45-03-PLAN.md — server.js boot-path swap, sqliteOnly gating, tx + auth/claims/scheduler conversion (checkpoint:decision — D-05 one-way async conversion)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 45-02-PLAN.md — Docker image node_modules/db-adapter COPY + dependency/COPY pins + DB_URL env surface

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 45-04-PLAN.md — remaining callsite conversion, legacy shim removal, static audit gate

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 45-05-PLAN.md — pg SCHEMA variant, idempotent pg migrations, portable seed (checkpoint:decision — D-11 doc column shape)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 45-06-PLAN.md — scripts/copy-sqlite-to-pg.mjs + contract tests + DEPLOY.md runbook
- [ ] 45-07-PLAN.md — POSTGRES_TEST_URL-gated pg matrix (boot, auth, claims, dialect pins)
