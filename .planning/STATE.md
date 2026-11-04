---
gsd_state_version: "1.0"
milestone: v1.8
milestone_name: Notification Sanity
current_phase: 37
current_phase_name: Reminder Cadence Rework
status: verifying
stopped_at: Completed 37-03-PLAN.md
last_updated: "2026-11-04T15:39:30.026Z"
last_activity: 2026-11-04
last_activity_desc: Phase 37 execution started
state_head: e0aa1a997071ed03fa057dbff355cbc52bb4837b
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 7
  completed_plans: 7
  percent: 25
---

# STATE.md

## Project Reference

- **Project:** Projects Studio — self-hosted PM workspace, zero runtime dependencies
- **Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state
- **Current focus:** v1.8 Notification Sanity — Phase 37 Reminder Cadence Rework ready to plan

## Current Position

Phase: 37 (Reminder Cadence Rework) — EXECUTING
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-11-04 — Completed 37-01-PLAN.md (day_before offset removed, suite 930/0/3)

## v1.8 Phase Order (research-validated build order; numbering continues from v1.7's Phase 35)

1. Phase 36 — Server Notification i18n (I18N-01..04; leaf infrastructure — REM and DIGEST
   both render localized text through it; decide the shared-catalogue contract + server-key
   build gate here; verify whether scripts/i18n-scan.mjs scans server files)
2. Phase 37 — Reminder Cadence Rework (REM-01..04; pure logic deletion over verified paths,
   smallest risk, directly fixes the Kanzo #6 feedback; no external research needed)
3. Phase 38 — Daily Digest & Reminder Suppression (DIGEST-01..03; composes 36+37; the
   idempotence/catch-up window and 09:00-pass-collision snapshot semantics deserve an
   explicit spec decision — resend-vs-never trade-off)
4. Phase 39 — Notification Audit (AUDIT-01..02; doc-only, owner-gated: threshold changes
   validated by the owner BEFORE any coding; can start in parallel but audits the post-38
   reality)

Milestone-wide invariants: zero runtime dependencies, zero migrations (day_before removal is
deploy-safe with orphaned dedup keys going inert), full suite green, EN+FR i18n gate extended
to server notification keys, `email_digest` default inversion decided in spec not code.

## Recent Decisions

- [v1.8 roadmap] Phase numbering continues from v1.7 (Phase 35) — v1.8 is Phases 36-39, no reset
- [v1.8 roadmap] 4 phases following research build order: I18N → REM → DIGEST → AUDIT.
  I18N first is forced (REM and DIGEST both render localized text through it); REM before
  DIGEST (digest lists post-REM offsets, suppression gate interacts with REM pref semantics);
  AUDIT last as doc-only owner gate
- [v1.8 roadmap] Research's 4-phase structure adopted unchanged — requirements already
  cluster 1:1 with the suggested phases (I18N→36, REM→37, DIGEST→38, AUDIT→39); no folding
  needed (each is 2-4 requirements with a distinct delivery boundary)
- [v1.8 roadmap] `email_digest` default inversion (undefined-falsy opt-in) is an explicit
  spec decision for Phase 38, never decided implicitly by code
- [v1.7 roadmap] Phase structure: 4 phases — VIS first (data-flow-forced), HARD second
  (independent, settles security surface early), SETTINGS+SEARCH third (migration burden +
  post-VIS search tuning in one phase), UNDO+DEPLOY last (light closer)
- [v1.7 roadmap] Backlog 999.1 (team-derived visibility) is now Phase 32; the Backlog
  section is empty
- [v1.7 roadmap] SEARCH folded into the SETTINGS phase rather than standing alone
  (single-requirement phases avoided; post-VIS ordering preserved)
- [v1.7 roadmap] UNDO after VIS (Phase 35 > Phase 32) — undo re-PUTs flow through
  `mergeClientDoc`, so tests need final VIS semantics
- [v1.6 roadmap]: Team membership lives ONLY in authority rows (`teams` + `team_members`);
  doc `teams[].members` is a rebuilt display projection — never client-mergeable
- [v1.6 roadmap]: Scope restricts, role governs; no per-team roles inside the role ladder
- [Phase 29]: hiddenFor() composes private-hidden ∪ out-of-scope disjunctively — VIS's
  team-gated set must join this union additively (D-03 grant inversion survives)

## Milestone History

- ✅ v1.1 Multitenant — shipped, archived
- ✅ v1.2 Localization — shipped 2026-10-25, archived
- ✅ v1.3 Auth Hardening — shipped 2026-10-28, archived
- ✅ v1.4 Auth Completion — shipped 2026-10-30, archived (audit passed)
- ✅ v1.5 Reliability & Rotation — shipped 2026-11-01, archived (audit tech_debt; 16/16 REQs)
- ✅ v1.6 Team Access & Federation — shipped 2026-11-02 (4 phases, 17 plans, 24/24 REQs,
  803 tests, security audit 17/17 threats closed)

## Accumulated Context

### Decisions

- Zero-dependency scheduling: in-process `setInterval` pass + boot catch-up, no cron/redis
- Version-aware boot migration filter must land before any `v2:` envelope exists
- Keyring format frozen: `v2:<key-id>:<iv>:<tag>:<ct>` — rotation re-wrap covers factor rows
- [v1.6 roadmap]: Team membership lives ONLY in authority rows; doc `teams[].members` is a
  display projection — never client-mergeable
- [v1.6 roadmap]: SSO links on verified email only, keyed by (issuer, subject)
- [Phase 29]: 29-01: hiddenFor() composes private-hidden ∪ out-of-scope disjunctively
- [Phase 29]: 29-02: D-03 grant inversion — scopeGrants() short-circuits the private check;
  the 404-matrix artifact (MATRIX in test/scope.test.mjs) is the named sweep future
  endpoint families must extend (VIS-05 extends it with team-derivation cells)
- [Phase 29]: 29-03: send-time-only enforcement — reminder pass, email mirror and assignee
  write-guard are the authority (VIS-04 adopts the same team-intersect helper there)
- [Phase 33]: 33-01: accept route adopts Pitfall-22 order (sameOrigin before throttle/body); unknown accept-body keys silently discarded, never 400'd (D-06)
- [Phase 33]: 33-01: firstForwardedValue() shared helper unifies proto/clientIp/sameOrigin; multi-value x-forwarded-host now first-value in sameOrigin (D-07)
- [Phase 33]: 33-02: both firstWorkspace() invite twins fail closed in one commit — accept 410 workspaceGone, SSO twin consumes the dead invite and lands the generic /login?sso=error (D-03/D-04/D-05)
- [Phase 33]: 33-02: link-only admin/owner invites blocked at creation (400), refused at accept (403), swept update-only at boot (D-01/D-02); err.inviteAdminEmailRequired catalogued EN+FR
- [Phase 34]: 34-01: consumers map member_id→user_id via memberships before getUserNotifPrefs (accessor keyed by user_id)
- [Phase 34]: 34-01: due-reminders prefs pins migrated to per-user rows; doc-carried notifPrefs retired + stripped both directions
- [Phase 34]: migrateUserNotifPrefs guard is JS over stored doc blobs with per-row JSON.parse try/catch; one begin immediate copies prefs to EVERY member (insert or ignore) and deletes the doc field; pre-backup gate = no backup no mutation
- [Phase 34]: Client prefs: local mode keys localStorage per workspace url (projects.notifPrefs.<id>); npToggle is a single api.enabled branch adopting the server's merged prefs; emitMentions gates on S.notifPrefs — D-01/D-05/D-07/D-08; seed workspaces have url not id; doc field permanently undefined after the strips
- [Phase 34]: G-34-4 closed: GET-on-open notif-prefs hydration via pure mergeNotifPrefs (server row canonical, mirrors PUT adoption); wired at all 5 API-mode workspace entries, local mode untouched
- [Phase 34]: G-34-4 closed: GET-on-open notif-prefs hydration via pure mergeNotifPrefs (server row canonical, mirrors PUT adoption); wired at all 5 API-mode workspace entries, local mode untouched
- [Phase 35]: 35-03: WR-01 undo gate unconditional (err.changeTeam before any authority PUT on failed doc push); WR-02 pushNow() shares the pushing mutex released in finally
- [Phase 36]: 36-01: tFor locale-parameterized core (camelCase keys dayBefore/morningOf/pastDue per KEY_SHAPE gate; 15 notif.* server keys EN+FR)
- [Phase 36]: Boundary pin 36-02: no server push-emission surface exists; server-emitted text = emails (mailer, tFor) + inbox rows (client-rendered, plan 03)
- [Phase 36]: Email locale rides the memberships⋈users authority row (msg.locale), render inside buildNotifMessage via tFor — all notif.email.* call sites in one file
- [Phase 36]: Boundary-pin-36-02-no-push-emission-surface
- [Phase 36]: 36-02: email locale rides the memberships-users authority row (msg.locale); render inside buildNotifMessage via tFor - all notif.email call sites in one file
- [Phase 36]: Per-recipient locale rides the workspace-scoped authority query; malformed/NULL locale clamps to EN
- [Phase 36]: 36-03: reminder rows store key+vars snapshot alongside the EN snippet (D-05/D-06 dual store); inbox localizes keyed rows via the viewer-locale singleton, unknown key degrades to the snippet
- [Phase 36]: 36-03: client rows proven key-free (T-36-03 purity pins); keyed-branch renders the full catalogue sentence as one muted span
- [Phase 36]: Keyed inbox rows render the full catalogue sentence as one muted span (bold split would duplicate the title via vars)
- [Phase 36]: 36-04: i18n gate covers server.js/mailer.js — t/tFor notif.* keys resolve in EN AND FR; notif.* namespace parity-checked both directions (D-07/D-09, SC-4)
- [Phase 36]: 36-04: server key resolution = first STRING arg of t/tFor (covers t(key) and tFor(locale,key)); callVars placeholder check NOT reused (runtime snapshot vars, Pitfall 3)
- [Phase 37]: 37-01: legacy dayBefore-keyed inbox rows degrade to their stored EN snippet in BOTH locales (catalogue entry deleted) — the honest REM-04 inert-rows pin, not the pre-deletion FR sentence
- [Phase 37]: 37-01: two-offset cadence shipped — morning_of on due date + past_due next morning; dedup key keeps :due component (D-02), no migration/sweep (REM-04)
- [Phase 37]: Plural push_due pair (dueReminders/dueDesc) left untouched despite conflicting acceptance-criterion grep — plan prohibition (Pitfall 3) takes precedence
- [Phase 37]: 37-03: push_due removed end-to-end (G-37-2) — server+client whitelists 16/12 keys, retired-key PUT rejected 400 unknownPrefKey, historical rows inert via spread-then-sanitize, no migration
- [Phase 37]: 37-03: dist/ is gitignored — rebuilt + grep-verified locally, not committed
- [Phase 37]: 37-03: push_due removed end-to-end (G-37-2) - server+client whitelists 16/12 keys, retired-key PUT rejected 400 unknownPrefKey, historical rows inert, no migration

### Pending Todos

None yet.

### Blockers/Concerns

- [v1.8] Phase 36: verify whether `scripts/i18n-scan.mjs` scans `server.js`/`mailer.js` —
  pick the server-key gate mechanism (scan extension vs dedicated regression test); confirm
  `users.locale` population on real rows and exercise the EN fallback path regardless.
- [v1.8] Phase 38: digest idempotence/catch-up window and 09:00-pass-collision snapshot
  semantics need an explicit spec decision (resend-vs-never trade-off).
- [v1.8] Deploy-day catch-up burst after `day_before` removal (one-time "due today" emails)
  must be announced in release notes — scheduled as Phase 37 success criterion 5.
- [v1.7] (carried) v1.5 deferred items (2 unknown debug sessions, phase 26 WR-01/WR-02) — see
  Deferred Items.
- [v1.7] (carried) `DatabaseSync` deprecation alias (DEP0210) noted as deferred, not a v1.8 concern.

### Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | admin-revoke-only-own-session | unknown | 2026-11-01 | v1.5 |
| debug_sessions | login-broken-after-rotation | unknown | 2026-11-01 | v1.5 |
| uat_gaps | 26/26-UAT.md | diagnosed (0 pending scenarios) | 2026-11-01 | v1.5 |
| deferred_items | 28-02 TEAM-05 pin born green | acknowledged (intentional no-RED per TDD rules) | 2026-11-02 | v1.6 |
| deferred_items | DatabaseSync DEP0210 alias | noted (not a v1.7 concern) | 2026-11-02 | — |
| uat_gaps | test/dependencies.test.mjs Dockerfile COPY-pin (D-12) | out-of-scope, pre-existing (reproduced at 34-05 base 3116272) — allowlist needs the new repo-root listing | 2026-11-03 | v1.7 |

*(28-02 delTeam undo deferred item is now scheduled — Phase 35 UNDO-01/02.)*

## Session Continuity

Last session: 2026-11-04T15:39:29.976Z
Stopped at: Completed 37-03-PLAN.md
Resume file: None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| *(v1.7 — no plans executed yet)* | | | |
| Phase 33 P01 | 25m | 3 tasks | 2 files |
| Phase 33 P02 | 22m | 2 tasks | 6 files |
| Phase 34 P01 | 11 min | 2 tasks | 3 files |
| Phase 34 P02 | 24min | 2 tasks | 5 files |
| Phase 34 P02 | 24min | 2 tasks | 5 files |
| Phase 34 P04 | 12min | 2 tasks | 10 files |
| Phase 34 P03 | 14min | 2 tasks | 5 files |
| Phase 34 P05 | 25m | 2 tasks | 3 files |
| Phase 34 P05 | 25m | 2 tasks | 3 files |
| Phase 35 P03 | 6m | 2 tasks | 3 files |
| Phase 36 P01 | 5m | 2 tasks | 4 files |
| Phase 36 P02 | ~50m | 2 tasks | 5 files |
| Phase 36 P02 | ~50m | 2 tasks | 5 files |
| Phase 36 P03 | ~10m | 2 tasks | 3 files |
| Phase 36 P04 | ~14m | 2 tasks | 2 files |
| Phase 37 P01 | ~25 min | 2 tasks | 6 files |
| Phase 37 P02 | 12 min | 2 tasks | 3 files |
| Phase 37 P03 | 11 min | 3 tasks | 12 files |

*(v1.6 metrics archived with the milestone record.)*

## Operator Next Steps

- Plan Phase 36: /gsd-discuss-phase 36 (i18n-scan corpus question) then /gsd-plan-phase 36
