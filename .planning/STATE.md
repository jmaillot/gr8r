---
gsd_state_version: "1.0"
milestone: v1.9
current_phase: 45
current_phase_name: Database adapter — optional Postgres backend via env, SQLite default
status: executing
stopped_at: Completed 45-06-PLAN.md
last_updated: "2026-11-07T14:42:00Z"
last_activity: 2026-11-07
last_activity_desc: Phase 45 plan 06 executed (one-shot SQLite→pg copy script + DEPLOY.md runbook)
state_head: e7be348e12a44d0f0ec1566ba9d171cf22f0ebfd
progress:
  total_phases: 1
  completed_phases: 4
  total_plans: 7
  completed_plans: 13
milestone_name: Digest Context & One-Click Unsubscribe
---

# STATE.md

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-06)

- **Project:** Projects Studio — self-hosted PM workspace, zero runtime dependencies

**Core value:** real auth, real multitenancy, real localization, real notifications — no decorative state
**Current focus:** Phase 45 — Database adapter — optional Postgres backend via env, SQLite default

## Current Position

Phase: 45 (Database adapter — optional Postgres backend via env, SQLite default) — EXECUTING
Plan: 6 of 7
Total Plans in Phase: 7
Status: Executing Phase 45
Last activity: 2026-11-07 — Completed 45-06 (one-shot SQLite→pg copy script: read-only
source, pgSchemaVariant-owned target schema, refuse-non-empty, single-transaction
count-verified transfer, DSN-free output; 4 POSTGRES_TEST_URL-gated contract tests;
DEPLOY.md §15 operator runbook)

## v1.9 Phase Order (roadmap created 2026-11-05)

1. Phase 40 — Digest Subject & Task Lines (SUBJ-01..03; independent, mailer-only;
   byte-identical claim key; hardened RFC 2047 subject builder with hostile-name tests;
   project names through `memberCanReadProject`)
2. Phase 41 — Unsubscribe Tokens & List-Unsubscribe Headers (UNSUB-01, UNSUB-03;
   domain-separated HMAC token format frozen by tests BEFORE the route exists; headers
   omitted when MASTER_KEY absent; DEPLOY.md DKIM caveat)
3. Phase 42 — One-Click Unsubscribe Endpoint (UNSUB-02; first anonymous mutating route —
   security contract first (token model, method allow-list, replay posture, response
   matrix), then route; convergent/replay-safe, no existence oracle, GET no-op)

Milestone-wide invariants (pinned per phase): Phase 38 suppression invariant + second-boot/
no-duplicate digest tests pass unmodified; EN+FR i18n gate (server keys included); zero
runtime dependencies, zero migrations, full suite green.

## Recent Decisions

- [v1.9 roadmap] Phase numbering continues from v1.8 (Phase 39) — v1.9 is Phases 40-42, no reset
- [v1.9 roadmap] Research's 3-phase build order adopted: SUBJ → UNSUB token+headers →
  UNSUB route. 1:1 clustering kept rather than folding to 2 phases so the
  security-contract-first ordering for the anonymous POST route survives as its own phase
- [v1.9 roadmap] Backlog Phase 999.1 (Phase 37 deferred UAT Test 2) is consumed by
  SUBJ-01/02 → Phase 40; Backlog section cleared
- [v1.9 roadmap] UNSUB-03 (footer link stays + Settings re-subscribe path) mapped to
  Phase 41 — it is a message-level guarantee; Phase 42 verifies re-subscribe end-to-end
- [Phase 39]: 39-01: audit recommendations ship as `proposed` pending owner validation —
  only the RFC 8058 digest decision graduated into v1.9 (owner-validated)
- [Phase 38]: 38-02: suppression gate reads STORED email_digest via getStoredNotifPrefs (D-08) —
  Phase 42's unsubscribe upsert must write stored rows, not merged views
- [Phase 45] 45-01: pg is the first runtime dependency — exactly { pg: ^8.23.1 }, plain
  dependencies (never optionalDependencies), loaded via dynamic import only under
  DB_URL=postgres:// (D-02); dependency pins amended in dependencies.test.mjs AND
  catalogue.test.mjs (duplicate pin found at execute time)
- [Phase 45] 45-01: adapter normalizes rows to plain objects and run() returns exactly
  { changes } on both backends — callsite conventions for Plans 03–04
- [Phase 45] 45-03: module-level `let db` shim { prepare, exec, close, get, all, run, tx }
  keeps un-converted regions sync while converted regions call the async facade — the
  one-way conversion D-05 was user-approved at the plan's Task 0 checkpoint
- [Phase 45] 45-03: adapter gained close() export and ensureColumn (pragma vs
  information_schema branch); transaction() helper retired in favor of db.tx()
- [Phase 45] 45-02: single image variant — runtime stage COPYs node_modules +
  db-adapter.mjs (D-03); D-12 COPY pin amended to the 10-target set; package.json/lock
  stay out of the runtime stage (pin doesn't demand them)
- [Phase 45] 45-02: DB_URL is the only deployment env added — empty default = SQLite
  (zero-dependency posture documented in .env.example); POSTGRES_TEST_URL deferred to
  Plan 07 files; DEPLOY.md cross-reference lands in Plan 06

- [Phase 45] 45-05: D-11 locked as `text` (user "confirm" recorded before schema work) —
  workspaces.doc stays a plain text column on pg, jsonb out of scope (one-way)
- [Phase 45] 45-05: epoch-ms columns widen to bigint in the pg schema variant only
  (Date.now() overflows pg integer); booleans/counters stay integer so `= 1`
  comparisons are preserved verbatim
- [Phase 45] 45-05: pg execution proof deferred to the Plan 07 matrix — this plan pins
  the SQL text (whitelist lint, seed determinism on SQLite, runSchema idempotency)
- [Phase 45] 45-06: copy script reads the source via DatabaseSync({ readOnly: true }) —
  D-14 immutability enforced at the driver; the copy uses the source∩target column
  intersection so legacy boot-migration columns (memberships.team/scope) absent from
  the pg variant are skipped
- [Phase 45] 45-06: pg client MUST be released before pool.end() — end() waits on
  checked-out clients; discovered as a child-hang in the contract tests

## Milestone History

- ✅ v1.1 Multitenant — shipped, archived
- ✅ v1.2 Localization — shipped 2026-10-25, archived
- ✅ v1.3 Auth Hardening — shipped 2026-10-28, archived
- ✅ v1.4 Auth Completion — shipped 2026-10-30, archived (audit passed)
- ✅ v1.5 Reliability & Rotation — shipped 2026-11-01, archived (audit tech_debt; 16/16 REQs)
- ✅ v1.6 Team Access & Federation — shipped 2026-11-02 (4 phases, 17 plans, 24/24 REQs,
  803 tests, security audit 17/17 threats closed)
- ✅ v1.7 Team Visibility & Hardening — shipped 2026-11-04 (4 phases, 12 plans, archived)
- ✅ v1.8 Notification Sanity — shipped 2026-11-05 (4 phases, 12 plans, 13/13 REQs,
  archived; audit passed — 1 newly acknowledged + 9 carried-forward deferred items)
- 🚧 v1.9 Digest Context & One-Click Unsubscribe — roadmap created 2026-11-05

## Accumulated Context

### Decisions

- Zero-dependency scheduling: in-process `setInterval` pass + boot catch-up, no cron/redis
- Keyring format frozen: `v2:<key-id>:<iv>:<tag>:<ct>` — unsubscribe HMAC derives
  domain-separated from MASTER_KEY, never the raw AES key (v1.9 Phase 41)
- [Phase 38]: digest window is hour >= 9; claim key `${ws.id}:${user_id}:digest:${localDate}`
  is the no-double-send guarantee — v1.9 must keep it byte-identical
- [Phase 34]: notif prefs are sparse SQLite rows keyed (workspace_id, user_id); consumers
  read STORED values via getStoredNotifPrefs — the unsubscribe upsert creates missing rows
- [v1.6 Phase 30]: the SSO routes are the no-oracle/404 template; the unsubscribe route is
  the first anonymous MUTATING route — invite-accept family minus sameOrigin is the shape
- [Phase 40]: 40-01: RFC 2047 folding adopted for encodeWord (Pitfall 1/2 fired — 1879 octets single-line); folded at 900 octets/line
- [Phase 40]: 40-01: encodeWord + truncate exported as named exports for tests (A2); send API unchanged
- [Phase 40]: 40-02: SC-5 digest fallback tested via poisoned catalogue on exported buildDigestMessage (Plan 01 A2 precedent); FR digest subjects use NBSP before ':' (pre-existing typography breach fixed)
- [Phase 43]: 43-01: svg sniff tightened to `<?xml`/`<svg` prefixes (bare `<` would admit HTML as svg); served mime always derives from the server-verified stored ext (Pitfall 7)
- [Phase 43]: 43-02: digest logoUrl composed server-side from APP_URL at the sendDigest call site with NO https gate (an <img> URL is not a security-header contract, unlike the Phase 41 unsubscribe gating)
- [Phase 43]: 43-03: G-43-3 fixed as a namespace alias (A.removeLogo = IN.removeLogo) — one code path serves both dispatch namespaces; wiring regression test pins every data-a in settings.js
- [Phase 43]: G-43-4 closed as deployment staleness — the public /w/:slug/logo route (D-02) must bypass forward-auth; resolved by a Traefik router exclusion on the deployment host, no source change
- [Phase 43]: 43-01: svg magic-byte sniff tightened to <?xml / <svg prefixes (plan's bare leading-< would admit html masquerading as images); logo files are bare uids under DATA_DIR/logos, ext lives in doc.data.logo; replace unlinks the old file only after updateDoc succeeds (D-09)
- [Phase 43]: Plan 43-02: logo lives on api.workspace (payload state), never on the doc's ws object — avoids echoing a redundant/staleable field into the server doc
- [Phase 43]: Plan 43-02: digest logoUrl composed server-side at sendDigest with no https gate (img URL ≠ security-header contract, unlike 41 unsubscribe)
- [Phase 43]: G-43-3 fixed via click-namespace alias A.removeLogo (RED→GREEN wiring regression test)
- [Phase 43]: G-43-4 closed as deployment staleness — /w/:slug/logo must bypass forward-auth (public route D-02); Traefik router exclusion added on deployment host; no source change
- [Phase 44]: 44-01: resolveTz funnel lives in tz.js (server.js unimportable — boots+opens DB); labels resolve on read, Paris fallback (D-07) replaces legacy UTC fallback
- [Phase 44]: Coerce-to-Paris on invalid tz saves (D-10) — no new error strings; empty submits store '' (Paris on read, D-07)
- [Phase 44]: Self-tz carve-out applies after BOTH docFromClient role gates; test fixture seeds stored roster via withDb (backfillMemberships is boot-only)
- [Phase 44]: 44-03: the client imports tz.js's resolveTz as the single legacy-label funnel (no second client mapping); picker writes me().tz on S.data.members via the 43-03 alias A.tzSel = IN.tzSel — never S.prefs (D-09)
- [Phase 44]: 44-03: src/lib/timezones.js exempted from i18n-scan (EXCLUDED_FILES — generated machine data, seed.js family); generator is the only supportedValuesOf site
- [Phase 44]: 44-03: IANA ids keep underscores (58 valid zones); only display names normalize `_` → space — plan's "no underscore ids" assertion was wrong (Rule 1)

### Roadmap Evolution

- Phase 45 added: Database adapter — optional Postgres backend via env, SQLite default (Kanzo projectsstudio#5; Postgres-only scope confirmed by owner 2026-11-07)

### Pending Todos

None yet.

### Blockers/Concerns

- [v1.9] Phase 42: first anonymous mutating route — run discuss-phase to pin the security
  contract (token model, method allow-list, replay posture, response matrix) before
  plan-phase, per research flag
- [v1.9] Phase 41: confirm the owner accepts the documented DEPLOY.md DKIM caveat
  (research recommendation: ship-with-caveat, no env-gating of `List-Unsubscribe-Post`)

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 261106-b46 | Move the daily digest and due-date reminder scheduler window from 09:00 to 08:00 local workspace time (both scheduler predicates hour >= 9 -> hour >= 8, update D-27-1 comments, re-pin T09 test fixtures) | 2026-11-06 | aea0cb6 | Verified | [261106-b46-move-the-daily-digest-and-due-date-remin](./quick/261106-b46-move-the-daily-digest-and-due-date-remin/) |
- [v1.9] MASTER_KEY rotation invalidates previously emailed unsubscribe links — document
  in DEPLOY.md; no other consumer depends on old links
- [carried] v1.5 deferred items (2 unknown debug sessions, phase 26 WR-01/WR-02) — see
  Deferred Items
- [carried] `DatabaseSync` deprecation alias (DEP0210) noted as deferred, not a v1.9 concern

### Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | admin-revoke-only-own-session | unknown | 2026-11-01 | v1.5 |
| debug_sessions | login-broken-after-rotation | unknown | 2026-11-01 | v1.5 |
| uat_gaps | 26/26-UAT.md | diagnosed (0 pending scenarios) | 2026-11-01 | v1.5 |
| deferred_items | 28-02 TEAM-05 pin born green | acknowledged (intentional no-RED per TDD rules) | 2026-11-02 | v1.6 |
| deferred_items | DatabaseSync DEP0210 alias | noted (not a v1.7 concern) | 2026-11-02 | — |
| deferred_items | 34/deferred-items.md: D-12 COPY-pin allowlist resolved | acknowledged | 2026-11-05 | v1.8 |
| debug_sessions | G-44-3 | diagnosed→resolved (44-04 gap closure executed; session closed at v1.9 close) | 2026-11-07 | v1.9 |
| deferred_items | 41/deferred-items.md: concurrent-session WIP contamination (feat/landing-signup-redesign) | deferred (out of scope, owning session's WIP) | 2026-11-07 | v1.9 |
| deferred_items | 43/deferred-items.md: totp-rewrap D-74 EACCES pre-existing test failure | deferred (environmental, fixture DATA_DIR strategy to rework) | 2026-11-07 | v1.9 |
| deferred_items | 43/deferred-items.md: ~12 pre-existing lint errors in untouched files | deferred (documented, 0 introduced by v1.9) | 2026-11-07 | v1.9 |

## Session Continuity

Last session: 2026-11-07T14:42:00.000Z
Stopped at: Completed 45-06-PLAN.md (one-shot SQLite→pg copy script + 4 pg-gated
contract tests + DEPLOY.md §15 runbook — 2 code commits + summary commit)
Resume file: None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 43 P03 | 3m | 2 tasks | 2 files |
| Phase 42 P01 | 17m | 3 tasks | 7 files |
| Phase 42 P02 | 8m | 2 tasks | 5 files |
| Phase 40 P01 | 14m | 3 tasks | 2 files |
| Phase 40 P02 | 35m | 3 tasks | 6 files |
| Phase 43 P01 | 24m | 2 tasks | 5 files |
| Phase 43 P02 | 47m | 3 tasks | 14 files |
| Phase 43 P03 | resumed-session | 2 tasks | 2 files |
| Phase 44 P01 | 35m | 4 tasks | 5 files |
| Phase 44 P02 | 25m | 2 tasks | 2 files |
| Phase 45 P03 | ~2h | 4 tasks | 3 files |
| Phase 44 P03 | 19m | 3 tasks | 14 files |
| Phase 45 P02 | ~15m | 2 tasks | 4 files |
| Phase 45 P06 | ~21m | 2 tasks | 4 files |

*(v1.8 metrics archived with the milestone record.)*

## Operator Next Steps

- Approve the v1.9 roadmap, then `/gsd-plan-phase 40`
