# Projects Studio — project context

*Last updated: 2026-11-29 — Milestone v3.8 Governance UI Refresh started.*

## Current State

**v3.7 shipped 2026-11-29** (3 phases, 106–108, all verified; audit passed — 15/15 requirements wired, 4/4 E2E flows). The project is a
self-hosted, zero-dependency, multi-tenant project-management workspace: hand-rolled Node server
(server.js ~14k lines), Vite SPA under src/, dual-engine SQLite/Postgres, backup/restore with
local+S3+FTP+SMB destinations, OIDC SSO with Entra group→workspace mappings **now with optional team
targets and mapping edit**, per-source restore selection with availability probes **now with per-run
archive presence stat** (stat-only, three-state badge). Test baseline: ~2836 tests with 2 documented
pre-existing failures (french-typography content, webhook-routes GET list; webhook-events due.reminder flake).

## Current Milestone: v3.8 Governance UI Refresh (started 2026-11-29)

**Goal:** Unify all Governance tabs on the v3.7 table design language (Super Admin candidates fully converted — owner ruling; Backup/Restore tabs brought to visual parity), plus docs/test housekeeping (ROADMAP corrections as bracketed annotations, seed marks, webhook-events due.reminder flake fix).

**Phase shape (owner-approved):** 109 Governance perm-t unification (client-only, zero server changes) → 110 housekeeping (docs annotations + flake fix; parallel-safe, disjoint files).

**Research:** `.planning/research/GOVERNANCE-REFRESH.md` (e4395efe — HIGH; drift located to governance.js:165–218/:239–292/:301–312; flake root-caused: live `new Date()` vs 08:00 UTC window, fix = fixed-now injection, route already accepts it).

## Milestone v3.7 Mappings UX & Team Mapping — SHIPPED (2026-11-29)

**Goal:** Team-level group mapping (optional team, role unchanged — owner ruling), mapping edit (GUID immutable), the Mappings page restructured into three sections (mappings table / dead mappings table / usage log), and the four v3.6 closeout items.

**Shipped:**
- **Team mapping** — optional `team_id` on group_mappings (dual-engine DDL); a mapping with a team grants team membership AND the workspace role from the same row; reconcile pass extends to team memberships via `team_members.provenance` (group-keyed sweep, manual rows immune); `team-deleted` orphan class; distinct `group_team_granted` audit verb; latent teams-PUT purge bug fixed
- **Mapping edit** — PATCH route + staged edit modal (GUID immutable, dead rows refuse, dup-pair guard, `group_mapping_updated` same-tx audit)
- **Mappings page restructure** — three `perm-t` tables: Mappings (7 cols incl. Team + Users added + When), Dead group mappings, Usage Log (all lifecycle actions incl. team verbs, cap-100 with visible cap-note); workspace-scoped team picker on the create form
- **Per-run archive probing** — stat-only per-seam presence check (FTP SIZE, S3 HeadObject keyed off status, SMB CREATE-frame) with dedicated `restorestat|` throttle; three-state badge (present/missing/unreachable); zero marker writes (frame-level pinned)
- **Restore initiator** — `restore_runs.created_by` + left-join name render in run history (legacy rows `—`)
- **SSO closeout** — fixed non-interpolated callback logWarn; DEPLOY.md email-claim symptom row

**Decisions:** R-6 optional-team role-unchanged · R-7 usage log = all lifecycle actions · R-8 edit exists, GUID immutable · R-9 Governance UI refresh → v3.8 · R-10 carried items ride phase 108. Phase 107/108 executed sequentially (shared i18n pin lines — checker finding; ROADMAP's parallel-safe premise corrected).

<!-- Next Milestone Goals placeholder — filled by /gsd-new-milestone -->

## Milestone v3.6 Entra ID Mappings & Restore Sources — SHIPPED (2026-11-28)

**Goal:** Operator UI for Entra group → workspace mappings (manual GUID + manual label, no Graph), honest OIDC linking docs, and the deferred restore-source selection.

**Target features:**
- **Entra ID Mappings page** — new Instance nav section gated on `oidcEnabled` + operator 403; list/create/delete `group_mappings` rows (manual GUID paste canonicalized + manual group label, workspace picker, role owner/admin/member — no viewer, no instance-role mappings, `kind: 'workspace'` only); delete cleans up members at next SSO login (removal sync, existing guards); no Graph/API permissions/consent
- **OIDC linking docs** — DEPLOY.md "Linking policy" rewrite for `OIDC_TRUST_TENANT_EMAIL` (pinned-tenant member substitutes for `email_verified`; guests still require the literal claim), + the missing Azure setup steps (`groupMembershipClaims: "ApplicationGroup"` manifest, group assignment to the Enterprise Application); .env.example comment expansion
- **Restore-source selection + availability check** — operator chooses which mirror source (s3/ftp/smb/local) a restore reads from, with per-source availability check (v3.5 carry-over)

<!-- Next Milestone Goals placeholder — filled by /gsd-new-milestone -->

## Milestone v3.5 Backup Destinations — SMB & FTP — SHIPPED (2026-11-27)

**Phases 96–100, 14 plans.** Cross-destination seam generalization (destination registry replacing the S3 single-slot seam, dormant-slot contract, Wave-0 static gate); hand-rolled FTP/FTPS client (export/ftp.js, node:net/node:tls, golden-vector parser contract); FTP destination end-to-end (toggle, staged upload + SIZE verify, badges, restore read-back, probe ×5); hand-rolled SMB2.1 client (export/smb.js, node:crypto, RFC 1320 MD4 vectors, unconditional signing, NTLM scrub); SMB destination end-to-end (same seams + guest-session semantics); follow-local remote prune (remote_pruned additive, rotation-integrated). Owner UAT validated all four destinations (local/S3/FTP/SMB) against the real Synology NAS: backup → mirror → restore → overwrite, scheduled badges, out-of-band deletion badge clearing, SMB e2e 5/5 vs real samba. Zero new npm dependencies.

## Milestone v3.4 UX Polish & Backup Console Refinement — SHIPPED (2026-11-24)

**Phases 91–95, 10 plans.** One digest email per user/day (4× duplicate fixed, pinned regression); server payload contracts (GFS naming + gfs_bucket dual-engine, describeCron, unified runs `?all=1`, `/api/backup/scopes`); Instance Roles governance UX (role tabs, stacked grants, selectable pickers); honest Backup console (real task table, humanized schedules, 4 GFS retention scales, unified filtered run history); Settings polish (My Access card grid, revoked-key purge with append-only audit, one-line Workspace URL, Edit-Teams picker parity); BKRST-05 project-overwrite restore (doc-splice engine, pre-restore snapshot, typed collision refusal, global restore lock unchanged — owner-confirmed D-04).

---

## Current Milestone: v3.4 UX Polish & Backup Console Refinement

**Goal:** Consolider l'UX des surfaces opérationnelles (gouvernance, backup, settings) et corriger les bugs remontés à l'usage de v3.3 — picker réutilisables, tables honnêtes, naming parlant, digest email unique.

**Target features:**
- Instance Roles (Governance): tabs par rôle (Super Admin / Backup Op / Restore Op), une ligne par user avec badges cumulés, renommage « Super Admins & Roles » → « Instance Roles », user picker sélectionnable style Edit-team (y compris dans le dialog Grant, dont la recherche est cassée)
- Backup tasks console: refonte légère — édition pré-remplie (cron courant), rétention mensuelle/annuelle, header « Edit backup task » au-dessus du bloc, table des tâches avec Next run + Last run (statut), schedule humanisé (« Every Monday at 00:00 »), noms workspace/projet au lieu des ids, historique unifié multi-tâches avec filtres
- Backup naming: fichiers d'archive ET libellés UI portant instance / nom de workspace / nom de projet + marqueur GFS (daily/weekly/monthly/yearly); hint « les manuels ne sont sous aucune rétention » sur Run now
- Cross-workspace: opérateurs (Super Admin / Backup Op / Restore Op) voient tous les workspaces dans les pickers Backup/Restore uniquement
- Settings: My Access (icône projet / vue colonnes), API Keys (purge des clés révoquées), Workspace URL sur une ligne; Teams picker sélectionnable dans Invite Member > Edit Teams
- Notifications: investigation + fix du digest quotidien reçu 4× (même destinataire), avec test épinglé

<details>
<summary>Milestone v3.3 Instance Operations — Backup, Restore & Roles — SHIPPED (2026-11-23)</summary>

**Shipped:** 6 phases (85–90), 21 plans, 12/12 requirements traced, all phases verified at close (fresh v2 digests 6/6 passed).

**What the app does now (delta from v3.2):**
- **Roles:** `instance_roles` table + `hasInstanceRole` funnel (Super-Admins auto-members, ARCHIVE_READ reserved), Instance Roles governance tab, audited grant/revoke; Backup Operators = full task CRUD, Restore Operators = browse/preview/restore only.
- **Backup:** multi-scope tasks (project/workspace/instance), 5-field cron subset with builder presets, at-most-once catch-up, no-overlap (skipped_overlap), GFS rotation (7/4/12/5) after verified runs, run history + Run now, transition-based failure emails; manual Run-now archives (task_id NULL, no retention).
- **S3 destination:** zero-dep SigV4 client (AWS/MinIO/B2), boot-frozen env custody, streamed uploads + post-upload checksum verify, probe-at-save, s3Enabled task gate.
- **Restore:** preview-from-manifest, import-as-new (-restored) default, guarded overwrite (type-to-confirm + pre-restore snapshot), Super-Admin-only instance DR + security contract (threats_open 0, ASVS L1), restore authority scoped by live rights, DR revokes all sessions.
- **Polish:** Super Admin console role-first listing + promote-search, verify-checksum + archive download tiering, rotation-deletion preview + kept-until badges, restore-list invalidation keyed on run identity, PG-parity e2e (full backup→S3→DR cycle), 18-test DST cron matrix, DEPLOY.md trust docs.

**Known gaps carried forward:** webhook-events/webhook-routes test family, french-typography Phase-88 fr keys, logo junk-name quirk (export/backup.js:666 — origin of the removed "[object Promise]/" debris), scheduler overlap load-flake; all documented in deferred-items, acknowledged at close.

</details>

<!-- Next Milestone Goals placeholder — filled by /gsd-new-milestone -->

<details>
<summary>Milestone v3.2 Entra Group Mapping & Governance Backlog — SHIPPED (2026-11-21)</summary>

**Shipped:** 5 phases (80–84), 12 plans, 19/19 requirements traced, all phases verified
(closeout: verified_closeout; ship gate e2e 157/157 green, unit 2050/0).

**What the app does now (delta from v3.1):**
- **Entra group → workspace mapping at SSO login** (claims-first, zero new dependencies): the
  `groups` claim (Entra Object-ID GUIDs, `ApplicationGroup` mode) is matched against
  operator-managed mappings on `/governance` — highest role wins (D-82-1); grants only,
  removals sync at next login through the shared guard funnel with last-operator/last-owner
  guards; >200-group overage resolves as UNMAPPED, never silently empty; unmapped users
  behave byte-identically to v3.1.
- **Governance surface:** workspace rename + slug edit from `/governance` with honest link
  death (old slug 404s), type-to-confirm danger fork, one-click slugTaken-suggestion adopt,
  dead-mapping warning card + boot warnings.
- **Backlog cleared:** searchable multi-add team pickers (invite + member-edit), e2e spec
  debt repaired, mobile columns-button fix + phone-viewport sweep, DEPLOY.md Entra/SSO
  docs (incl. SUPER_ACCESS/WORKSPACE_CREATION), CHANGELOG 3.0.0/3.1.0/3.2.0, version 3.2.0.
- **Operator super-access** (post-ship quick tasks, ratified): instance admins enter any
  workspace owner-like; opt-out via `SUPER_ACCESS=false` (strict-token, boot-refuse).

**Known gaps carried forward:** Nyquist VALIDATION.md missing for 80/81/82/84 (see
MILESTONES.md); Super Admin console role-first listing captured as a seed for the next
milestone (`.planning/seeds/super-admin-console-role-first-listing.md`).

</details>

<details>
<summary>Milestone v3.2 (in-progress record, archived 2026-11-21)</summary>

**Goal:** Let Entra ID groups drive gr8r workspace membership and operator rights at SSO login, and finish the deferred governance/backlog work.

**Target features:**
- Group claim ingestion: read the `groups` claim (Entra Object IDs) from the ID token in the SSO callback; document/handle the >200-group overage case
- Group → workspace mapping: config mapping that auto-assigns workspace membership + role at JIT-provision and login
- Group → operator mapping: members of a mapped group are auto-promoted to instance operator
- Sync removals at login: removed from group = membership removed/demoted at next login, with last-operator and last-owner guards still enforced
- Workspace settings editing (rename/slug) from the /governance page (v3.1 deferral)
- Older backlog: searchable token-chip pickers, 56-02 e2e spec failures, Phase 57 mobile layout follow-up

**Key context:** zero new dependencies (no Graph SDK — claims-first design); group claims are
snapshot-at-login (no periodic reconcile); unmapped users behave exactly as today (fail-closed);
group match is a parallel admission concept beside the v3.0 domain door matrix, which is unchanged.

</details>

## Milestone v3.1 Workspace Governance — SHIPPED (2026-11-20)

**Goal:** Instance operators control who can create workspaces and can see and manage every
workspace on the instance — no shadow workspaces.

**Target features:**
- `WORKSPACE_CREATION=true|false` boolean env (strict tokens; invalid = boot-refuse; unset =
  `false` fail-closed) gating `POST /api/workspaces` via `isInstanceAdmin` — replacing the
  implicit `ALLOW_SIGNUP` coupling (today: any signed-up user creates a workspace and becomes
  its owner when signup is open, server.js:6811). *(D-78-1: owner collapsed the original
  tri-state to boolean.)*
- Instance-operator identity: the existing `users.is_instance_admin` flag (D-112), multi-seat,
  seeded by `stampInstanceAdmin()`; promote/demote from the operator console with last-operator
  demotion refused; D-114 manual DB update kept as break-glass fallback *(D-78-2)*
- Operator-scoped workspace-management page: list ALL workspaces (creator, member count, created
  date), full management (delete/archive empty or shadow workspaces, reassign orphaned
  members) — no shadow workspaces, no env edits
- Client: regular signups (non-operators, when creation is closed) land on a **standalone
  "await access" page stating they need to be invited to a workspace to get access**, with
  15 s visible-tab-only auto-poll entry once invited; create button follows `/api/config`'s
  gate value + `isInstanceAdmin`
- Creator remains workspace `owner`; admins promoted afterward (optional, not enforced)

**Key context:** zero new dependencies; same keyed-refusal/5-locale pattern as phase 75
(all new refusal keys in en/fr/nl/de/es in the same commit); owner-scoped endpoints must not
leak workspace existence to non-owners; package.json bumps to 3.1.0 at ship time.

<!-- Next Milestone Goals placeholder — filled by /gsd-new-milestone -->

## Current Milestone: v3.0 Access Control & Hardening — SHIPPED (2026-11-19)

<details>
<summary>Milestone v2.7 Installable App (PWA) — shipped record (2026-11-19)</summary>

**Shipped:** 3 phases (72–74), 7 plans, 4/4 requirements, all phases verified
(closeout: verified_closeout). Manifest & head (72): hand-written
`manifest.webmanifest` served `application/manifest+json` + no-cache (3-touch
server.js diff), index.html head tags (single theme-color, iOS metas, D-06 favicon
swap boundary intact), contract test + live e2e header check; five PNG install icons
rendered from the brand mark (any 192/512, maskable 192/512, apple-touch 180×180) —
post-milestone owner feedback re-rendered the `any` icons with TRANSPARENT corners
(RGBA, contract-pinned) to kill the baked-in white launcher frame. Install banner
(73): lazy `install-banner` chunk — `beforeinstallprompt` capture with bounded
300-frame rAF retry surviving pre-hydration boot, gesture-bound native prompt,
14-day localStorage dismissal cooldown, iOS static hint / Firefox total silence;
post-milestone owner feedback promoted the CTA from a ghost icon-button to a solid
`.btn-primary` (the grey text was illegible on the dark strip). SW verification (74):
`public/sw.js` proven installability-satisfying with ZERO production code changes —
sha256 pin to the Phase 48/59 contract, single `navigator.serviceWorker.register`
call site, `/sw.js` literal, `api.enabled` gate, both boot paths, manifest↔SW scope
agreement; DEPLOY.md §18 operator posture (root-domain-only, iOS manual A2HS,
strictly-online, no-custom-SW rationale, Lighthouse troubleshooting); 4/4 real-device
UAT PASS — milestone accepted end-to-end. Gates at close: 1809 tests / 1796 pass /
0 fail (13 skipped), build green, lint at its pre-existing 17 (unused-vars, outside
milestone scope). Post-milestone maintenance in the same window (owner-directed,
not part of v2.7 scope): dependency upgrades (prettier, playwright, xlsx 0.27.0 with
T-54-SC re-approval, globals, lucide 1.76, vite 8, eslint 10) and full Dutch/German/
Spanish catalogues (1946 keys each, parity-gated). Full record:
`milestones/v2.7-ROADMAP.md`, `milestones/v2.7-REQUIREMENTS.md`,
`milestones/v2.7-phases/`.

</details>

### v2.7 milestone decisions

- Zero edits to `public/sw.js` — the existing root-scope push SW IS the install SW
  (no fetch handler needed since Chrome 108/112 removed the requirement); any sw.js
  diff is STOP-and-justify
- Manifest icons: `any` variants transparent-cornered (owner ruling 2026-11-19), maskable
  + apple-touch stay fully opaque (iOS flattens transparency to black)
- Banner CTA is a real solid button, not a text/icon affordance (owner ruling 2026-11-19)


<details>
<summary>Milestone v2.2 Notifications, Search & Delivery — shipped record (2026-11-14)</summary>

**Shipped:** 6 phases, 19 plans, 24/24 requirements. Delivery infrastructure (56): e2e
dist staleness guard (fail-closed manifest hash), Vite code-splitting under the D-02
500 kB gate (entry 606 kB → 498 kB), i18n-ready locale registry. Views & columns (57):
column show/hide, saved views in a server `saved_views` table (`/api/me/views`),
`prefs.defaultPrivate` owner toggle, General-Access granularity beyond private/public.
Full-text search (58): contentless FTS5 shadow index + pg `task_search_projection`
(byte-identical parity suite), membership-gated `/search` route, Ctrl-K hybrid palette
merge (cmd+search), 250 ms debounced dispatcher. Browser push (59): `push_subscriptions`
SQLite+pg mirror, /data-persisted VAPID custody, `sendPushFor()` mirroring the email
gate order, service-worker handler with open-tab suppression + deep links, owner UAT
6/6 on production. Admin dashboard & self-view (60): power-admin four-panel dashboard
over the raw stored doc, byte-level-redacted member self-view (Settings › My access).
Notifications trim (61): notification audit v2 with D-04/D-05/D-06 owner rulings, dead
notif-prefs keys removed, inbox burst coalescing (render-only, D-11/D-12/D-13), UAT
7/7 with live browse-MCP evidence. Gates at close: 1524 unit tests / 0 fail, e2e 111
(+1 flaky VIEW-02 pre-existing), lint fully clean, chunk gate 11/11 green. Known
overrides: no v2.2 milestone audit run (closeout override, 2026-11-14); init.manager
stale bookkeeping on phases 56-60 (STATE.md is source of truth); 56-02's 9 pre-existing
e2e spec failures acknowledged as deferred debt (dedicated plan later). Full record:
`milestones/v2.2-ROADMAP.md`, `milestones/v2.2-REQUIREMENTS.md`,
`milestones/v2.2-phases/`.

</details>

### v2.2 milestone decisions (owner-validated 2026-11-12 + during execution)

- M-2.2 web-push@4.0.0 as runtime dep #2 (D-12 precedent amended, owner-approved)
- M-2.2 saved views/columns live in a server `saved_views` table (Phase 34 notif_prefs precedent)
- M-2.2 admin dashboard is power-admin: private projects fully visible in aggregates
- D-05 rulings (2026-11-13): D-04 full removal of the 4 dead notif-prefs keys; D-06
  `update` type unchanged; coalescing applies to comments + updates + mentions + reminders
- Post-61 UAT ruling (2026-11-14): `notifyMembers` refreshes a duplicate unread row in
  place (same id — no e-mail re-send) instead of dropping the event

<details>
<summary>Milestone v2.1 Member & Project Experience — shipped record (2026-11-11)</summary>

**Shipped:** 3 phases, 18 plans, 13/13 requirements. Per-team permission levels on
projects (`p.perms['team:'+id]`, server-first `projectPermFor` gating); one unified
`projectSettings` modal (General + Access) replacing projectModal + shareModal; invite
modal round-3 (draft survives re-renders, guest = exactly-one-project radio picker,
Owner invitable by owners, Member/Admin invites workspace-wide); projects table Members
count + PSTAT status/target columns; teams polish (accent-insensitive member search,
multi-team wording, team-page invite removed); project export (six-sheet Excel workbook
with native charts + Gantt, ordered MSPDI XML with real task links and custom fields,
flat CSV); multi-assignee full parity (`assignees[]` arrays end-to-end — migration,
per-assignee reminder fan-out, chip-pattern picker modal, subtask assignees + start
dates, avStack everywhere, export model rows); invite-accept revision fix (55-08: no
revision bump on project-scoped grant, 409 hydrate-wins recovery). Verification: 53
17/17 · 54 13/13 · 55 8/8, all re-verified post-fix. Gates: 1385 unit tests / 0 fail,
e2e 109/109, lint 0 errors, i18n gate 0 dead / 0 stale. Known override: the human
Microsoft Project/xlsx visual check (54-05) is owner-acknowledged as skipped (no
Project machine); the mechanical suite is the verification of record. Full record:
`milestones/v2.1-ROADMAP.md`, `milestones/v2.1-REQUIREMENTS.md`,
`milestones/v2.1-phases/`.

</details>

### v2.1 milestone decisions (owner-validated 2026-11-09)

- M-09 per-team perms on projects reuse the existing per-person perms model
  (Can view/Can comment/Can edit/Full access) — no new role concept
- M-10 status labels = PSTAT values (planning/active/risk/hold/complete → Planning /
  In Progress / At Risk / On Hold / Completed); progress = task-based `progressOf`
- M-11 Date column = target date (p.due)
- M-12 one unified settings modal replaces projectModal + share modal
- M-13 one Share button on the project page (keep the labeled one)

### v2.1 phase decisions (Phase 53, 2026-11-09)

- D-53-1 Per-team permission levels live as `p.perms['team:'+teamId]` keys — no new
  top-level field, so `mergeClientDoc`/normalize/removal sweeps needed no new sink and
  visibility stays boolean (M-09 write-only gating).
- D-53-2 The guest = exactly-one-project invariant is re-derived server-side by ONE shared
  validator used by invite create, edit and accept (plus the MCP mirror), not by the UI.
- D-53-3 One `projectSettings` modal (General + Access) replaces both legacy modals; the
  General tab does not edit team links, which live only in Access.
- D-53-4 **Owner ruling (5ca7a26):** the labeled Share button in the project header was
  removed as redundant with the settings gear/context-menu entry. There is exactly one
  Share affordance (context-menu → Access tab). This overrides the literal PROJ-02 /
  ROADMAP SC5 wording "single labeled Share button"; REQUIREMENTS.md and ROADMAP.md
  text should be reconciled at milestone close. Recorded as an accepted override in
  53-VERIFICATION.md.

<details>
<summary>Milestone v2.3 Consolidation & Hardening — shipped record (2026-11-15)</summary>

**Shipped:** 3 phases (62–64), 9 plans, 7/7 requirements. E2E baseline repair (62):
fail-closed webServer readiness contract race-free (`/api/health` sole readiness owner,
`assertServerUp()` fail-fast in all 3 fixture paths), 9 drifted specs repaired via
role-based queries + auto-retrying waits on the lazy Settings chunk (shared
`openSettings`/`selectLanguage` helpers — no sleeps, no `networkidle`, no weakened
assertions). VIEW-02 de-flake (63): root cause proven by trace evidence (coordinate-click
dismissal + un-awaited debounced view PUT), replaced with semantic Escape dismissal +
`waitForResponse` arm-before-act — passes deterministically at retries=0 (10× proof).
Mobile tasks table (64): hide-the-button ruling shipped — Columns popover hidden ≤900px
via generic `[data-pop='cols']` rule, card stack honestly usable (wrap-everything,
zero-overflow at 390×844 proven red→green TDD), Option B band (641–900px), desktop
byte-untouched. Close run: **115/115 e2e (0 failed, 0 flaky, VIEW-02 included),
zero waivers**; unit 1524/1524, lint clean, chunk gate 498.11 kB < 500 kB (threshold
untouched), EN+FR i18n green. Closeout: verified_closeout — milestone audit PASSED
(7/7 requirements, 5/5 integration chains wired live, 0 open artifacts). Known notes:
REQUIREMENTS E2E-03 "111/111" wording superseded by 115 (111 + 3 mobile + 1); WR-01
CSS-scope follow-up deferred; 64-VALIDATION draft (Nyquist not reconciled). Full record:
`milestones/v2.3-ROADMAP.md`, `milestones/v2.3-REQUIREMENTS.md`,
`milestones/v2.3-phases/`; audit `v2.3-MILESTONE-AUDIT.md`.

</details>

### v2.3 milestone decisions (owner-validated 2026-11-14)

- M-2.3 Consolidation first: owner chose a hardening milestone over new features
  (items 1, 2, 3 of the post-v2.2 debt scan only)
- D-04 (Phase 64): the 641–900px band gets the card stack (not the desktop table)
- D-04 (Phase 64): hide-the-button mobile contract — no second Playwright project,
  no chunk-gate edits, zero waivers at close

## Current Milestone: v3.0 Access Control & Hardening — SHIPPED (2026-11-19)

**Shipped:** 3 phases (75–77), 7 plans, 10/10 requirements, all phases verified
(verified_closeout). Domain admission (75): one shared canonicalizing funnel
(`domains.js` — `parseDomainList`/`emailDomainRefusal`/`canonicalizeDomain`), exact
`Set` matching (never `endsWith` — verified bypass vector), tri-state env parse
(unset = inherit/fail-open, empty = deny-all — ratified with the owner), boot-frozen
`SIGNUP_DOMAINS`/`INVITE_DOMAINS` with `??` inheritance, `'*'` wildcard allow-all
added during UAT (commit 968a475); doors DP-1 signup (server.js:6774), DP-2
per-email invite-create (:7803), DP-3 fail-closed non-consuming invite-accept
(:7991–8042, INVITE list only — one-door-one-rule), MCP `invite_member` fourth door
(mcp.js:948); every refusal key landed in all 5 locale catalogues in the same commit.
SSO hardening (76): DP-4 JIT gate (fresh-provision arm only, after `email_verified`,
generic `sso=error` redirect — no domain-revealing param), DP-5 reconcile filter
(mirrors DP-3 verbatim), three named existing-account immunity rows (authentication
never consults the lists; tightening never locks out members), D-11 combined 5-door
boot-matrix log; TRUTH AMENDED Option B (owner-approved): accept-time re-validation
applies to ALL admits, immunity covers authentication/logins only. Maintenance debt
(77): lint exit 0 with zero suppressions added (15 code fixes + 2 config-only
no-undef files, hazard-safe restructures per typescript-eslint #3456), 9/9 carried
review advisories fixed with regression pins (ledger open: 0), nl/de/es refusal
rendering verified end-to-end in the built app — which uncovered and fixed a real
production bug (server `LOCALE_CODES` was still `['en','fr']`; now derived from
`src/locales/*.json`, commit 0b660e76). Gates at close: lint exit 0, 1854 unit pass
/ 0 fail, 152 e2e / 0 fail, all 3 phases verification-passed. Full record:
`milestones/v3.0-ROADMAP.md`, `milestones/v3.0-REQUIREMENTS.md`,
`milestones/v3.0-phases/`.

### v3.0 milestone decisions

- One door, one rule — the accept path never consults the signup list (gmail-only-in-
  invite-list scenario canonical)
- Exact-domain Set matching only; `*.domain` wildcards explicitly deferred
- Set-but-empty = deny-all (set semantics differ from unset inheritance)
- Existing-account immunity covers authentication only, never invite acceptance (Option B)
- File-grouped lint commits with suite green per group; zero eslint-disable as a policy

<details>
<summary>Milestone v3.0 planning context (pre-ship)</summary>

**Goal:** instance-level domain admission rules plus the accumulated maintenance debt.

**Target features:**
- Domain admission rules (SEED-261119-f3w): `ALLOW_SIGNUP_DOMAINS` + `ALLOW_INVITE_DOMAINS` —
  door matrix, unset-inherits-signup, fail-closed accept-time re-validation, existing-member
  immunity, exact-domain matching, keyed localized refusals
- Lint cleanup: resolve the 17 pre-existing `no-unused-vars` errors
- Translation spot-check: verify nl/de/es render correctly in the real app
- Review carryovers: WR-01/WR-02/IN-01..05 advisories from 73/74 reviews

**Key context:** seed design owner-validated — no re-litigation; zero new dependencies;
package.json bumps to 3.0.0 at ship time.

</details>

## Current Milestone: v2.7 Installable App (PWA) — SHIPPED (2026-11-19)

**Shipped:** 3 phases, 7 plans, 4/4 requirements (PWA-01..04), verified_closeout.
Archived to `.planning/milestones/v2.7-ROADMAP.md` (details) and
`v2.7-REQUIREMENTS.md` (outcomes). Post-ship owner polish in the same window:
transparent `any` icon corners, solid banner CTA button.

<details>
<summary>v2.5 Template Polish & Import — SHIPPED (2026-11-16) — shipped record</summary>

**Shipped:** owner-directed quick work (67-05/06/07 + 65-05 fix), 8 commits, audit
passed 4/4. Archived to `.planning/milestones/v2.5-ROADMAP.md`.

- 65-05 fix: subtask indent now ADDS (`--ind` var + `calc(base + var(--ind))`) —
  list view pulled depth-1 children 48px LEFT of root; e2e asserts real content-box geometry
- 67-05: template favourites — persistent `fav` flag, favourites-first pickers, create-modal block
- 67-06: template import from Markdown — pure parser, editor-review flow, lazy EN-label split
- 67-07: complete per-kind downloadable examples (nesting for both kinds, `priority`),
  `prefs.hideStarters` toggle; Projet vierge always shows

**Notable decisions:** hideStarters is display-only (code catalogue stays — onboarding
needs it); examples EN-only (no-French-byte build gate); label keys must not collide
with Lucide icon names (`importBtn`, the icon-scanner trap documented in
docs/project-templates.md §3).

</details>

## Current Milestone: v2.4 Automation & Productivity — SHIPPED (2026-11-16)

**Shipped:** 4 phases, 17 plans, 16/16 requirements, all phases verified. Archived to
`.planning/milestones/v2.4-ROADMAP.md` (details) and `v2.4-REQUIREMENTS.md` (outcomes).

- SUB — Subtask tree ✓: multi-level `{id, parentId, position}` trees; cycle/depth rejected at the
  mergeClientDoc funnel (localized `subtaskCycle`/`subtaskDepth`); completion cascade + leaf-only
  progress rollups; tree survives views, FTS (both dialects), MSPDI/xlsx/CSV exports, MCP writeDoc
- TMPL — Task & project templates ✓: workspace-wide templates with `dueOffsetDays`, pure
  `instantiateTemplate` builder riding the normal doc-PUT; lazy-chunk picker/editor UI
- WHK — Per-project webhooks ✓: 8-event vocabulary diffed at the funnel, claim-once delivery,
  SSRF-guarded HMAC-signed fetch (redirect:'error', pinned addresses), 5-strike retry honoring
  Retry-After, 7-day purge; Teams adaptive/messagecard/raw-json under the 28 KB cap; real AAD
  mentions from persisted `users.oid`
- POL — v2.3 backlog ✓: mobile card fields driven by `hidden[]` (cols popover re-enabled ≤900px),
  email claim-then-deliver on the webhook machinery (`email_outbox`, identical backoff), WR-01 CSS
  scoping, 64-VALIDATION Nyquist reconciliation accepted

**Notable decisions:** D-01 flat tree storage shape; D-13 reopen cascades nothing; D-14 template
kinds; dedup_key carries diff `occurredAt` (CR-01); `pinnedFetch` closes the within-attempt DNS
rebinding window (WR-01-fix).

**Next milestone:** goals not yet defined — start with `/gsd-new-milestone`. Open backlog item:
Phase 999.1 (Phase 65 UAT Test 11 — exports in MS Project).

<details>
<summary>v2.4 planning record (pre-ship) — kept for context</summary>

**Goal:** automate repetitive work — hierarchical subtasks, task/project templates,
and per-project outbound webhooks delivering to Microsoft Teams — while clearing
the v2.3 deferred backlog (mobile hidden[] card fields, SMTP retry semantics,
WR-01 CSS scoping, Nyquist reconciliation).

**Target features:**
- SUB — Subtask tree: multi-level hierarchical subtasks with aggregated progress,
  not the flat list
- TMPL — Task & project templates: create tasks or whole projects from reusable templates
- WHK — Per-project outbound webhooks: owner/admin/project-leader configurable,
  Microsoft Teams incoming-webhook format, fail-absent + per-hook secret + rate-limit
- POL — v2.3 backlog: mobile card fields driven by `hidden[]`, SMTP-down email retry
  semantics, WR-01 `.page.flush .toolbar` CSS scoping, 64-VALIDATION Nyquist reconciliation

**Constraints (standing):** zero new runtime or dev dependencies; standing gates
intact (500 kB chunk gate, EN+FR i18n gate, lint, 1524+-test unit suite, e2e 115/115).

**Out of scope:** real file storage (names/sizes only today), realtime collaboration,
billing, time tracking, per-team webhooks (project-scoped only this milestone).

</details>

## Current Milestone: v2.0 Project-level Permissions & Invitations — SHIPPED (2026-11-09)

**Goal:** make access simple and predictable — visibility is decided at the project level
(toggle private/public; a member sees only what they were invited to plus non-private
projects), and the right to invite guests moves down to each project.

**Target features:**
- Strict invitation hierarchy: only an owner names another owner; admins invite
  admin/member/guest; members invite guests only where the project allows it
- Everything editable after the invite: role, scope and status changeable at any time,
  effective immediately
- Team sharing: link whole teams to a project through its share options; team
  membership is a LIVE access source (updated 2026-11-08, D-50-5 — join/leave
  the team grants/revokes access to linked projects; restores a live form of
  the v1.7 team rule, superseding the Phase 49 snapshot materialization)
- One guest concept: the "Invité externe" toggle is removed
- Per-project private/public toggle replaces the current dropdown; non-private =
  workspace-visible, private = explicit invitees (people or teams) only
- Per-project "members may invite guests" toggle (admins/owner always allowed);
  the workspace Settings > Permissions page is removed
- Project creation: all members can create (become project members), with a workspace
  setting to restrict to admins when desired
- Transparency: a view showing exactly what a given member can see

### v2.0 milestone decisions (owner-validated 2026-11-07)

- M-01 Strict invitation hierarchy (owner↔owner only); M-02 everything editable post-invite
- M-03 team invite = live team link to the project (updated 2026-11-08, Phase 50
  D-50-5 — originally a snapshot bulk invite; the owner chose live roster-following
  access: join team → access to linked projects, leave team → revoked unless
  individually invited; `p.teams[]` returns, reversing Phase 49 D-49-5)
- M-04 single guest concept, toggle removed
- M-05 private/public toggle per project replaces the dropdown; visibility = explicit
  invitees + non-private projects (replaces v1.7 team-derived visibility and Phase 29 D-03
  scope columns as the primary model)
- M-06 per-project member-invite-guest toggle; Settings > Permissions page removed
- M-07 creation stays open to all members with a workspace restriction setting
- M-08 member-visibility transparency view
- Scope: permissions/invitations only — notif debt, lint and DEP0210 stay out

<details>
<summary>Milestone v2.0 Project-level Permissions & Invitations (shipped 2026-11-09)</summary>

**Shipped:** visibility collapse to boolean-private ∨ access list with one live funnel
(`memberCanReadProject`) across server + MCP mirror; strict invite hierarchy (owner-only
owner grants), post-invite editability (role/scope/status), live team→project links
(join/leave grants/revokes on next request), one guest concept (viewer + exactly one
project), per-project "members may invite guests" toggle, Settings > Permissions page
removed with permCreate relocated to Workspace > General, lead-on-create + keyed
`projectCreateForbidden` refusal, admin transparency view of any member's exact access
through the funnel with reason labels. 4 phases, 17 plans, 15/15 requirements, 1141-test
suite green, i18n gate 0 dead/0 stale. Milestone audit: **passed** (12/12 requirements,
14/14 integration connections, 6/6 E2E flows). Full record:
`milestones/v2.0-ROADMAP.md`, `milestones/v2.0-REQUIREMENTS.md`,
`milestones/v2.0-MILESTONE-AUDIT.md`, `milestones/v2.0-phases/`.

</details>

**Next milestone:** v2.3 Consolidation & Hardening — started 2026-11-14
(see Current Milestone above).

<details>
<summary>Milestone v1.10 Extensions & Adapters (shipped 2026-11-07)</summary>

**Goal:** extend Projects Studio outward and upward — an optional Postgres backend chosen
purely by environment (SQLite default unchanged), an authenticated MCP server exposing real
workspace operations to external agents, real browser push, and command-palette hardening.

**Shipped:** the database adapter (DBA-01..04) — `DB_URL` postgres:// selects the `pg` driver
through a minimal async facade (first runtime dependency, D-12 amended with owner approval),
SQLite stays the zero-config default, one-shot copy script, pg schema/migrations/seed and a
`POSTGRES_TEST_URL` test matrix; the MCP server (MCP-01..04) — 35 authenticated,
workspace-scoped tools over hand-rolled JSON-RPC 2.0 at `/mcp`, personal `psk_live_` API keys
(hash storage, revocation, expiry), same permission funnel as UI/API, documented in `MCP.md`
+ `DEPLOY.md` §15; real browser push & toasts (PUSH-01..03) — service worker + Notification
API wired to the existing prefs, "coming soon" removed, zero deps; two-letter G shortcuts in
the command palette (FIX-01) with behavioral regression tests. 4 phases (2 branch-delivered
with retrospective artifacts), 14/14 requirements, 1133-test suite green. Milestone audit:
**passed**. All four phase verifications passed (45: 8/8, 46: 4/4, 47: 2/2, 48: 6/6). Full
record: `milestones/v1.10-ROADMAP.md`, `milestones/v1.10-REQUIREMENTS.md`,
`milestones/v1.10-MILESTONE-AUDIT.md`, `milestones/v1.10-phases/`, `milestones/v1.10-quick/`.

</details>

**Next milestone:** v2.0 Project-level Permissions & Invitations — started 2026-11-07
(see Current Milestone above).

<details>
<summary>Milestone v1.9 Digest Context & One-Click Unsubscribe (shipped 2026-11-07)</summary>
<details>
<summary>Milestone v1.9 Digest Context & One-Click Unsubscribe (shipped 2026-11-07)</summary>

**Shipped:** digest self-identification + revocability (SUBJ-01..03, UNSUB-01..03) via
subject builder hardening, "Project — Task" lines, HMAC tokens and the anonymous one-click
route; plus v1.10 polish pulled forward — workspace logo (43) and per-member timezones
(44) with the canonicalizing resolveTz funnel and gap-closure 44-04. 5 phases, 13 plans,
6/6 REQs, 1042-test suite (1038 pass, 1 pre-existing environmental). Full record:
`milestones/v1.9-ROADMAP.md`, `milestones/v1.9-REQUIREMENTS.md`,
`v1.9-MILESTONE-AUDIT.md`.

</details>

<details>
<summary>Milestone v1.8 Notification Sanity (shipped 2026-11-05)</summary>

**Shipped:** recipient-locale server notification emails + keyed inbox rows through the
shared `tFor()` core with the server-side i18n gate (I18N-01..04); honest two-offset
reminder cadence with `day_before` removed and `push_due` pref retired (REM-01..06);
opt-in 09:00 daily digest replacing individual reminder emails with a recipient-scoped
filter (DIGEST-01..03); full cited notification audit with all trim recommendations
`proposed` pending D-05 owner rulings (AUDIT-01/02). 4 phases, 12 plans, 13/13 REQs,
943-test suite green. Full record: `milestones/v1.8-ROADMAP.md`,
`milestones/v1.8-REQUIREMENTS.md`, `milestones/v1.8-MILESTONE-AUDIT.md`,
`milestones/v1.8-phases/`.

</details>

**Constraints (standing):** zero runtime dependencies; zero migrations; full suite green;
EN+FR i18n gate (server keys included); Phase 38 suppression + no-double-send invariants
pass unmodified.

<details>
<summary>Milestone v1.7 Team Visibility & Hardening (shipped 2026-11-04)</summary>

**Goal:** close every open thread from previous milestones — no new features, all debt:
team-derived project visibility, the delTeam undo trap, membership-surface hardening,
the recent-search leak, per-user settings isolation, and the compose key-rotation gap.

**Shipped:** team-derived project visibility through the single `hiddenFor()` funnel with
the shared `memberCanReadProject` helper (VIS-01..03); invite-accept hardening — sameOrigin
first, shared `firstForwardedValue()`, silent body whitelist, fail-closed `firstWorkspace()`
twins, no admin link-only invites (HARD-01..05); per-user notification preferences as real
SQLite rows with additive migration (SETTINGS-01..03); tokenized NFC+lowercase
recent-search matcher closing the substring leak (SEARCH-01); honest delTeam undo with
awaited `pushNow()`, shared mutex and fail-closed gate (UNDO-01/02); `MASTER_KEY_PREVIOUS`
forwarded in docker-compose (DEPLOY-01). 4 phases, 12 plans, 116 commits, 17/17
requirements. All four phase verifications passed 2026-11-04 (32: 7/7, 33: 5/5, 34: 16/16,
35: 16/16); full suite 896 pass / 0 fail / 3 skips. Full record:
`milestones/v1.7-ROADMAP.md`, `milestones/v1.7-REQUIREMENTS.md`,
`milestones/v1.7-MILESTONE-AUDIT.md`, `milestones/v1.7-phases/`.

</details>

## What it is

A self-hosted project-management workspace: dashboard, inbox, my tasks, projects with
board / list / table / calendar / timeline / files views, members, teams, activity, settings.

- Frontend: plain ES modules + CSS, bundled by Vite. No UI framework, no runtime dependency.
- Backend: `server.js`, Node's built-in `node:sqlite`, opaque session cookies, scrypt passwords.
- Deploy: single Docker image behind Traefik (see `DEPLOY.md`), data in `/data/projects.db`.
- Seed/demo data in `src/data/seed.js`; the server seeds a new database from it unless
  `SEED_DATA=false`.
- **Multi-tenant since v1.1**: a workspace is a real tenant with its own URL, document and
  membership list. An account can belong to several workspaces with a role in each.
- **Postgres-capable since v1.10**: `DB_URL` (postgres://) runs the server on `pg` through a
  minimal async adapter; without it, embedded SQLite (`node:sqlite`) remains the default.
- **Agent-facing since v1.10**: an authenticated MCP server at `/mcp` lets external MCP
  clients (Claude Desktop, coding agents) operate on real workspace data with personal API
  keys and the same permission funnel as the UI/API.
- **Real auth since v1.3**: sessions, password change and TOTP 2FA are server-backed
  (`sessions`, `login_challenges`, `recovery_codes` tables) — no auth state in the document.
- **2FA lifecycle complete since v1.4**: secrets encrypted at rest (`v1:` AES-256-GCM envelope,
  fail-closed decrypt), recovery codes regenerable behind password + live TOTP step-up, disable
  verified end-to-end (a recovery code can never disable), and instance-operator session
  revocation with owner immunity.
- **Productized since the v1.4 window** (same commit range, outside the GSD cycle): app rebrand
  to Projects Studio, multi-team projects (a project lives in every team it belongs to), and a
  full notification system — per-recipient rows, assign/mention/comment/update types, @member
  and @team parsing with autocomplete, 30s polling, per-type email delivery via SMTP
  (prefs-gated, fire-and-forget), member team persisted in `memberships`.

<details>
<summary>Milestone v1.4 Auth Completion (shipped 2026-10-30)</summary>

**Goal:** every auth item deferred out of v1.3 lands — the 2FA lifecycle and session control
become complete.

**Shipped:** TOTP encryption closure (ENC-01/02), recovery-code regeneration (REGEN-01/02),
disable-2FA closure (DIS-01/02), operator session revocation (OPREV-01/02). 4 phases, 9 plans.
Milestone audit: **passed** (integration: 12 seams wired, 0 orphaned). Full record:
`milestones/v1.4-ROADMAP.md`, `milestones/v1.4-REQUIREMENTS.md`,
`milestones/v1.4-MILESTONE-AUDIT.md`.

</details>

- **Proactive since v1.5**: the notification system became proactive and operationally closed —
  every notification email deep-links to its task (`/w/:slug/task/:key`, logged-out carry via
  `?next=`), every SPA view mirrors into browser history (popstate works), the task creator is
  auto-watched, workspace admins get an audited revocation tier, TOTP secrets ride a
  version-aware keyring (`v2:<key-id>:…` envelopes) with one-reboot MASTER_KEY rotation, and a
  zero-dependency scheduler sends exactly-once due-date reminders (day-before / morning-of /
  past-due) with per-type prefs and workspace-shared timezone.

<details>
<summary>Milestone v1.5 Reliability & Rotation (shipped 2026-11-01)</summary>

**Goal:** the notification system becomes proactive and operationally closed — due-date
reminders fire from a server-side pass, notification emails land on the task, and the v1.4
operator/key-custody tech debt is paid down.

**Shipped:** email deep links + creator watching (LINK-01..04), operator audit trail +
workspace-admin tier (AUD-01..03), keyring & version-aware envelopes (KEY-01/02), re-wrap
MASTER_KEY rotation + DEPLOY.md §14 key-custody runbook (KEY-03/04), due-date reminder
scheduler (REM-01..05). 5 phases, 17 plans, 16/16 requirements. Milestone audit:
**tech_debt** (no blockers — 15/15 REQs, integration 6/6, flows 5/5; accumulated deferred
items documented in the audit + STATE.md). Full suite 649/649 tests green, zero new runtime
dependencies. Full record: `milestones/v1.5-ROADMAP.md`, `milestones/v1.5-REQUIREMENTS.md`,
`milestones/v1.5-MILESTONE-AUDIT.md`.

</details>

<details>
<summary>Milestone v1.6 Team Access & Federation (shipped 2026-11-02)</summary>

**Goal:** membership and sign-in get real team scoping and a second door — multi-team
membership, team/project-scoped permissions, optional Microsoft Entra SSO, and a second
2FA method. Zero new runtime dependencies throughout.

**Shipped:** `team_members` authority rows with multi-team membership everywhere rosters,
pickers and mentions read; team/project-scoped permissions with the D-03 grant inversion,
`hiddenFor` redaction funnel and 404-matrix proof; hand-rolled Entra OIDC (PKCE S256, RS256
via JWKS over `node:crypto` only) with pinned-tenant verified-email linking, JIT bare
accounts, SSO×2FA challenge-then-stop and SSO-only mode; multiple named TOTP factors on the
`v2:` keyring with per-factor replay guards and survivor-code removal. 4 phases, 17 plans,
24/24 requirements. Full suite 803 tests (800 pass, 3 env-gated skips), lint clean, zero new
runtime dependencies. Phase 30 carried a full security contract (17 threats closed,
`threats_open: 0`). Full record: `milestones/v1.6-ROADMAP.md`,
`milestones/v1.6-REQUIREMENTS.md`, `milestones/v1.6-phases/`.

</details>

## Milestone v1.3 Auth Hardening — SHIPPED (2026-10-28)

**Goal:** the auth surface becomes real — sessions, password change and 2FA stop being
doc-field stubs and work end to end.

**Status:** shipped 2026-10-28 (6 phases, 19 plans + 2 gap-closure plans, 29 tasks; milestone
audit `tech_debt` — 14/14 requirements satisfied, integration clean, no blockers). Full record:
`milestones/v1.3-ROADMAP.md`, `milestones/v1.3-REQUIREMENTS.md`,
`milestones/v1.3-MILESTONE-AUDIT.md`, `milestones/v1.3-phases/`.

**Target features:**
- Sessions page backed by a real `sessions` table: device label, IP, last-seen, revoke-others
  and per-row revoke; a central mid-session 401 teardown signs revoked browsers out honestly
- Password change: current password verified server-side, new password works at next login,
  all other sessions revoked atomically in the same transaction as the scrypt rehash
- 2FA: real TOTP — `node:crypto` secret with replay guard, genuinely scannable QR from a
  vendored MIT encoder, verify-before-enable, hashed single-use recovery codes, and a
  pending-2FA login challenge that is anonymous across every endpoint family until verified

## Milestone v1.2 Localization — SHIPPED (2026-10-25)

**Goal:** the interface stops lying about languages — the selector becomes real, the app speaks
French, every user has their own locale — and the full app journey is covered by a browser test.

**Status:** shipped 2026-10-25 (8 phases, 50 plans, 68 tasks; audit all-clear, all 8 phases
re-verified with fresh digests). Full record: `milestones/v1.2-ROADMAP.md`,
`milestones/v1.2-REQUIREMENTS.md`, `milestones/v1.2-MILESTONE-AUDIT.md`, `milestones/v1.2-phases/`.
No milestone is currently planned — scope v1.3 with `/gsd-new-milestone`.

**Target features:**
- A dependency-free i18n layer: `t()` + JSON catalogues per locale, plurals, locale-aware dates
  and numbers, English as the base language.
- The whole interface translated into French (~600–900 keys). The language selector only offers
  what actually exists (EN, FR).
- The locale becomes a per-user preference (new column + migration) instead of a workspace
  preference.
- The 8 untested UI flows covered by Chromium: the onboarding wizard, the invite modal, the
  `/join` page, the share modal, member removal, the workspace switcher, the plan change and
  project creation.
- A regression test that proves the interface is in French when the locale is `fr`, and that no
  English string leaks.

## Current state (v1.1 shipped)

- **A workspace is a row.** `workspaces(id, slug unique, name, color, doc, revision)` — one JSON
  document per workspace. `memberships(workspace_id, user_id, role)` is the single source of
  truth for access; `invites(workspace_id, …)` holds workspace-scoped invitations.
- **Every call is slug-scoped and authorised.** `requireWorkspace(req, res, slug, minRole)`
  resolves the slug, looks up the caller's membership and enforces `viewer < member < admin <
  owner`. An unknown or unauthorised slug answers `404`, so there is no existence oracle.
- **The document is redacted on read and merged on write.** `redactDoc()` removes a private
  project and every row that references it; `mergeClientDoc()` restores hidden rows from
  storage so a redacted document cannot delete or rewrite what it cannot see. Access fields
  (`private`, `members`, `perms`, `lead`) are restored unless the caller is an owner, an admin
  or the project lead.
- **Optimistic concurrency.** The row carries a `revision`; `PUT /api/workspaces/:slug` answers
  `409` on a mismatch. Every endpoint that edits the document reports the new revision, and the
  client adopts it.
- **The demo is honestly single-workspace.** The seed has no `data.workspaces` array; the demo
  list is derived from the current `ws` object, and the switcher, create path and palette
  command only exist in server mode.
- **Migration is in place and lossless.** `migrateTenancy()` writes a `vacuum into` backup
  before the first write, derives the slug from the old document, links members and invites,
  drops the demo array and retires `data.me`. A second boot is a byte-identical no-op.
- **The interface speaks English and French.** The language selector is real: a leaf `t()`
  layer over 1 538-key JSON catalogues per locale, locale-aware dates/numbers/plurals, a
  per-user locale preference (new `locale` column + migration) instead of the shared
  workspace preference, a 21-route French sweep, and a build-gate scan
  (`scripts/i18n-scan.mjs`) that fails the build on any new uncatalogued literal. Files are
  real too: raw-body uploads to `DATA_DIR/files/`, byte-only `/w/:slug/file/:id` serving with
  ranges (206/416) and the D-06 fixed inline/attachment mime policy, PDF/image previews in a
  wide modal, login-redirect for anonymous file navigations.

## Decisions for the multitenant milestone (validated by the owner)

### Milestone v1.9 phase decisions (Phase 40)

- [Phase 40]: RFC 2047 §6.2 folding adopted in `encodeWord` at 900 octets/line — a 400-char hostile
  name measures 1879 octets single-line; existing digest decoder passes unmodified
- [Phase 40]: `encodeWord` + `truncate` exported as named module exports (research A2) — send API unchanged
- [Phase 40]: digest task lines resolve project names strictly AFTER `inScopeProject` +
  `memberCanReadProject` per recipient; `|| ''` is snapshot defense only (D-05/D-06)

1. **Many workspaces per user.** An account can be a member of N workspaces with a different
   role in each; the sidebar switcher lists the account's real workspaces. — shipped
2. **Creation is flag-driven.** `ALLOW_SIGNUP=true` → any signed-in user may create a
   workspace; `ALLOW_SIGNUP=false` → only a user who is `owner`/`admin` of at least one
   workspace may create one; everyone else joins by invitation. — shipped
3. **Slug in the path.** `/w/:slug/...`, single domain, no wildcard DNS/TLS. The workspace
   URL shown in Settings became real. — shipped
4. **Strict isolation.** Roles are checked server-side per workspace, and private projects
   are redacted server-side — not merely hidden in the UI. — shipped
5. **Migrate in place.** The existing database became the first workspace: name, colour and
   slug derived from `data.ws`; accounts, roles and memberships preserved. — shipped

## Decisions for milestone v1.2 (validated by the owner, or defaulted from the research)

1. **The i18n layer is hand-made.** No runtime dependency: `t()` plus JSON catalogues, the
   English source strings as the base catalogue. The app has no framework and no runtime
   dependency, and adding one for translations would break that. Every candidate library
   measured is bigger than the layer it would replace.
2. **French is the second language, and it is complete.** The selector only lists what really
   exists — English and French. The four other languages (Deutsch, Español, Français, 日本語
   are currently listed) disappear from the selector until they are genuinely translated.
3. **The locale is per user.** A French speaker in an English workspace keeps their own
   language. That needs a per-account column and a migration; the migration machinery exists
   and is proven by `test/migration.test.mjs`.
4. **The server never writes the locale at boot.** A nullable column and a client-side
   `PATCH /api/auth/me` keep the "second boot is a byte-identical no-op" guarantee intact.
5. **`t()` never escapes.** `toast()` and `empty()` already escape, and `document.title` and
   the ARIA live region are `textContent` sinks. Catalogue values are plain text, made inert
   by a test; interpolated values are escaped at the call site with the existing `esc()`.
6. **The plural subset is `{name}` plus `{count, plural, …}`**, selected with
   `Intl.PluralRules` — which has three categories in French (`one`, `many`, `other`) and says
   "0 fichier" where English says "0 files". `Intl.MessageFormat` does not exist in Node 24 or
   Chromium, so any richer ICU syntax would need a hand-written parser.
7. **Server errors gain a stable code beside their unchanged English message.** The payload
   shape does not change; the client translates the code and falls back to the English string
   when it does not know it. No toast is ever empty.
8. **The activity log stores machine verbs, not prose.** The filters stop parsing English and
   classify the stored verb instead, so existing documents keep filtering correctly with no
   migration, and legacy English detail is suppressed at render rather than leaked.
9. **Vouvoiement**, applied consistently across the whole catalogue.
10. **No middle-dot forms** (`invité·e`): noun forms ("Invité", "Membre") and invariable
    constructions, which read naturally in chips, table cells and `aria-label`s.
11. **French-France house style**: a no-break space before `:`, a narrow no-break space before
    `; ! ?`, a no-break space inside guillemets, the curly apostrophe, the ellipsis, NFC
    accents, lowercase months.
12. **The invitation email is deferred out of this milestone.** The server image ships no
    catalogue; it would need a Dockerfile change, a Node-side `t()` and `Accept-Language`
    negotiation. The catalogue stays importable by plain Node, so v1.3 needs no relocation.
13. **The plan wire values stay English** ("Free", "Team", "Business" — the server validates
    those ids); only the displayed label is translated.
14. **`dateFmt`, `weekStart` and `tz` stay workspace-shared.** This milestone must not
    half-solve the open per-user-settings requirement. An `'auto'` sentinel lets an unset
    date format follow the locale while an explicit user choice still wins.
15. **The demo seed content stays English.** It is sample data, not interface chrome. The two
    prototype pages (`design-system`, `states`) are excluded from the catalogue and
    allow-listed out of the leak test; their link labels are translated.
16. **Accent-insensitive search is in scope** — "elodie" finds "Élodie" — because it is a basic
    expectation as soon as the interface is French. The `Intl.Collator` sort order is
    deferred, because it changes an order the existing tests assume.

## Decisions from Phase 12 (validated by the owner through UAT)

1. **Zero-runtime-dependency held.** Uploads, previews and range streaming use only Node
   built-ins (`node:http` raw body, `fs.createReadStream`) and the browser's native XHR/iframe —
   no new package.
2. **Fixed Content-Type map (D-06).** An allow-list decides inline vs attachment: png/jpg/jpeg/
   gif/webp/pdf inline (PDF gets `frame-ancestors 'self'` for the embed), everything else —
   including svg — `application/octet-stream` + attachment. No sniffing, no user-supplied mime.
3. **Byte-only file route (T-12-13, reopened then refined).** `/w/:slug/file/:id` serves bytes;
   an anonymous top-level navigation 302-redirects to the login page with a path-only `next`
   (no open redirect); iframe/embed/fetch destinations get the bytes or JSON errors, never the SPA.
4. **Narrow-viewport fallback accepted.** Below ~816px window width the Firefox pdf.js toolbar
   collapses again, but the PDF-only footer Download button keeps the save path — accepted by
   the owner in UAT round 3 (WR-01 triage).
5. **Deferred hardening is explicit.** Quotas per workspace/user, antivirus scanning and
   external object storage stay out of scope. CR-01 (suffix Range on a zero-byte file →
   malformed 206) was **fixed post-review** in commit `54cead4` (zero-byte files ignore the
   Range header per RFC 9110, clean 200; regression test added) — no residual risk.

## Requirements

### Validated

- ✓ SACON-01 — Super Admin console role-first listing + trust-checklist sweep: promote-only
  candidate search (name OR email, 2-char floor, cap 10 + show-more), keyed-toast no-reload
  reconcile, verify-checksum action + instance-admin-only archive download tiering, rotation
  dry-run projection with scrollable detail lists, kept-position GFS badges, PG-parity e2e +
  DST cron boundaries, DEPLOY.md §9 engines/NTP sections (Phase 90; verification 42/42,
  UAT 7/7 live, security 12/12 threats closed ASVS L1)
- ✓ PSET-02, PSET-03, PSET-01, PSET-04, INVT-01..03, PROJ-01, PROJ-02, TEAM-01..03,
  UX-01 — Member & Project Experience (Phase 53; verification 17/17 against HEAD
  `cec43bd`, unit suite 1164 pass, phase e2e 20/20 EN+FR, i18n gate 0 dead/0 stale;
  PROJ-02 override: owner ruling removed the header labeled Share button — see D-53-4)
- ✓ MIG-01..03, VIS-02, VIS-03 — visibility model collapse + grant materialization (Phase 49)
- ✓ INV-01..04, VIS-04 — project-level invite hierarchy, live team links, per-project guest
  toggle, one guest concept (Phase 50)
- ✓ VIS-01, CRT-01, CRT-02, UX-01 — per-project private/public toggle + member visibility
  refetch, lead-on-create + permCreate restriction setting, Settings > Permissions page
  removed (dead-key i18n gate), honest not-found + refusal toasts (Phase 51; verification
  6/6 must-haves; UAT 3/3 self-run)
- ✓ TRN-01 — Admin transparency view: exactly what a member can access, computed live
  through `memberCanReadProject` with coarse reason codes + team name, admin-gated keyed
  404 route, member-row expander (Phase 52; verification 3/3 fresh digest, UAT 9/9,
  security threats_open 0)
- ✓ R1 — A workspace is a row in `workspaces` with a unique slug and its own document — v1.1
- ✓ R2 — An account can hold several memberships with a role per workspace — v1.1
- ✓ R3 — `/w/:slug` addresses a workspace; all share/invite links are workspace-scoped — v1.1
- ✓ R4 — Every API call is authorised against the caller's membership of that workspace — v1.1
- ✓ R5 — Private projects are never sent to non-members and cannot be modified by them — v1.1
- ✓ R6 — Existing installs migrate in place, without data loss, with a pre-migration backup — v1.1
- ✓ R7 — Creation is flag-driven (`ALLOW_SIGNUP`), invitations are workspace-scoped, and an
  existing account can accept an invite — v1.1
- ✓ R8 — Lint, format, build and the new server tests pass in CI — v1.1
- ✓ ERR-01 — A server error carries a stable machine code next to its English message; the
  client translates the code — Phase 9
- ✓ ERR-02 — An error whose code is unknown to the client still shows the server's message — Phase 9
- ✓ ACT-01 — The activity log renders in the interface language; filters classify the stored
  machine verb, not English prose — Phase 9
- ✓ ACT-02 — Activity entries written before this milestone still display and filter — Phase 9
- ✓ The language selector changes the interface: a real `t()` layer, JSON catalogues, French
  translated end to end, EN and FR the only offered languages — Phases 5–8
- ✓ The locale is a per-user preference, stored on the account and returned by the server,
  with a migration for existing installs — Phase 8 (LOC-01…LOC-06 verified; UAT 11/11)
- ✓ The remaining UI flows are covered by Chromium in both locales (onboarding, invite modal,
  `/join`, share modal, member removal, workspace switcher, plan change) — Phase 10
  (UAT-01…UAT-09; UAT 11/11)
- ✓ No route serves an untranslated English string; the build gate blocks new uncatalogued
  literals and the shipped Docker image proves the French catalogue — Phase 11
  (UAT-10; UAT 3/3)
- ✓ Real file uploads: raw-body streaming endpoint under `DATA_DIR/files/`, real XHR
  progress, oversize 413 `uploadTooLarge`, per-member auth gates — Phase 12
  (UPLOAD-01…05; verification 21/22, UAT round 3 4/4)
- ✓ Real previews for PDF and images: byte-only `/w/:slug/file/:id` route (D-06 header
  policy, byte-range 206 support), tall scrollable PDF iframe wide enough for Firefox's
  full viewer toolbar, PDF-only footer Download — Phase 12 (PREVIEW-01…03, LINK-01;
  G-12-1…G-12-6 all closed and human-confirmed)
- ✓ A logged-out browser pasting a file URL lands on the login page (not raw JSON) and
  returns to the file after sign-in — Phase 12 (T-12-13 reopened decision)
- ✓ Real session management: sessions listed from the `sessions` table with device label, IP,
  last-seen and this-session marker; revoke-others and per-row revoke; a central mid-session
  401 teardown routes every revoked browser through one honest sign-out — Phase 14
  (SESS-01…03; verification 12/12)
- ✓ Additive migration with byte-identical second boot; the fake `sessions`/`tfa` doc fields
  removed from the workspace document — Phase 14 (AUTH-02; extended test/migration.test.mjs)
- ✓ Password change: current password verified inside the transaction, new password works at
  next login, all other sessions revoked atomically with the scrypt rehash, honest success
  copy — Phase 15 (PASS-01…03; verification 6/6, honesty regression guard)
- ✓ TOTP enrollment core: RFC-verified TOTP with replay guard, real QR from a vendored
  encoder, enroll/enable/disable routes with password step-up and one-time hashed
  recovery codes — Phase 16 (TFA-01…04; verification 14/17 automated + UAT 3/3)
- ✓ Login second-factor flow: pending-2FA sign-in is anonymous across every endpoint family
  until the code verifies; challenge abandon is a real logout; recovery burn reported
  post-landing — Phase 17 (TFA-05; 401 matrix, throttle budget survives abandon)
- ✓ Auth surface closed as a whole: all new user-facing strings catalogued EN+FR with the
  i18n-scan build gate green, all three flows covered by Chromium e2e in both locales, and
  the QR verified by human UAT on a real device (Google Authenticator + Microsoft
  Authenticator) — Phase 18 (AUTH-01, AUTH-03; verification 9/9, UAT 3/3)
- ✓ TOTP secrets at rest in the `v1:` AES-256-GCM envelope: boot-time migration wraps every
  legacy plaintext `two_fa_secret` (trigger-gated, transactional, backup-guaranteed,
  byte-identical second boot, loud deferral when MASTER_KEY is absent), and every decrypt
  call site routes through a single `requireTotpSecret()` boundary that fails closed with
  503 `masterKeyMissing` — no plaintext fallback, non-2FA login untouched — Phase 19
  (ENC-01, ENC-02; verification 12/12, UAT 7/7 live + isolated container)
- ✓ Recovery-code regeneration: burn-and-replace after initial enrollment, with throttling
  and a fully verified lifecycle — Phase 20 (REGEN-01, REGEN-02; UAT 2/2 passed,
  G-20-1 closed via 20-03 and re-verified)
- ✓ Keyring & version-aware envelopes: the boot migration's plaintext-re-wrap filter is
  version-aware (generic `/^v\d+:/` predicate — any version-tagged envelope survives boot
  byte-identical), TOTP secrets write the frozen `v2:<key-id>:<iv>:<tag>:<ct>` envelope on
  enrollment, and decrypt dispatches by key id through a two-key keyring (`MASTER_KEY` +
  optional `MASTER_KEY_PREVIOUS`) with loud D-K2 boot validation and fail-closed 503 on
  unknown/tampered envelopes — the prerequisite that makes rotation (Phase 26) possible —
  Phase 25 (KEY-01, KEY-02; verification 9/9, 621/621 tests, security audit 6/6 threats
  closed, format freeze decision D-K3/D-K4 approved)
- ✓ Re-wrap MASTER_KEY rotation + key-custody runbook: `migrateTotpReWrap()` boot pass
  converges every old-envelope secret to `v2:<new-key-id>:…` in one reboot with two env
  vars, idempotently and transactionally behind the pre-migration backup (no 2FA
  re-enrollment); DEPLOY.md §14 documents the full key-custody lifecycle with
  copy-pasteable, env-only commands pinned by doc-parsing parity tests, gated by two
  pre-rotation preconditions (image currency + key-id coverage) and a no-data-loss
  recovery note for the keyring-miss signature — Phase 26 (KEY-03, KEY-04; verification
  5/5 after gap-closure re-verification, 632/632 tests; G-26-1 closed via 26-03)
- ✓ Disable-2FA verified against the full contract: strict password + live-TOTP gate only
  (a recovery code can never disable 2FA), one-transaction teardown of `two_fa_*` columns
  + recovery codes + pending login challenges, explicit revoke-others session policy with
  the caller kept signed in, `tfa_disabled` activity verb, EN+FR Chromium e2e of the full
  disable→re-enroll cycle, i18n-scan green — Phase 21 (DIS-01, DIS-02; verification 9/9,
  555/555 node tests, 59/59 e2e; 2 advisory review findings open — WR-01 missing
  `two_fa_enabled` 409 pre-check, WR-02 verb insert outside the transaction)

- ✓ Email deep links + creator watching: every notification email links to
  `APP_URL + /w/:slug/task/:key` (task drawer over the board, URL persisted across reload,
  localized not-found toast), logged-out clicks carry the path via `?next=` and land on the
  exact task after sign-in (open-redirect-guarded), every SPA view mirrors into browser
  history (go() pushState + boot popstate handler), the task creator joins the computed
  watcher set, and email bylines/recipients resolve from authority rows — Phase 23
  (LINK-01..04; verification 1/1, 575/575 suite at the time, G-23-1/G-23-4 closed)
- ✓ Operator audit trail & workspace-admin tier: same-transaction, append-only audit rows for
  operator revocations, a workspace-admin revocation route on the same audited path (owner
  immunity, self-exclusion), tier-scoped keyset audit read endpoint + owner Settings trail,
  and workspace-scoped audit visibility for workspace admins — Phase 24 (AUD-01..03;
  verification 1/1, G-24-5 closed)
- ✓ Keyring & version-aware envelopes (validated in v1.5, see above)
- ✓ Re-wrap MASTER_KEY rotation + key-custody runbook (validated in v1.5, see above)
- ✓ Due-date reminder scheduler: clock-injectable `runReminderPass()` with 09:00
  workspace-local window scan, transactional exactly-once dedup in `reminders_sent`,
  day-before / morning-of / past-due offsets, `by:null` reminder rows behind the
  `email_reminder` gate, boot catch-up + unref'd tick that never writes off-hour or bumps
  revisions, three notifPrefs toggles (ON by default), inbox filter chips + system-actor
  rendering with EN+FR keys — Phase 27 (REM-01..05; verification 11/11, 646/646 suite)
- ✓ Multi-team membership via `team_members` authority rows: guarded additive migration
  (pre-backup, byte-identical second boot), admin PUT route, `teams[]` projection read by
  every roster/picker/mention surface, @team mention dedup, picker intersection guard
  (`assignableInProject`), multi-team invites with `invites.teams` backfill — Phase 28
  (TEAM-01..05; re-verified 13/13, 803-test suite green)
- ✓ Team/project-scoped permissions: membership scope columns, shared `projectScope`/
  `hiddenFor` read/write funnel, D-03 grant inversion (scope OPENS private projects),
  byte-identical 404 `fileNotFound` on the file-serve side door, named 404-matrix per
  endpoint family, send-time scope filtering (reminders, email mirror, assignee write-guard,
  client emit pre-filter), invite-carried scope, guest collaborator model (viewer + exactly
  one project), invite-form/member-modal UI with EN+FR strings — Phase 29 (SCOPE-01..06;
  re-verified 18/18, UAT walkthrough pass)
- ✓ Microsoft Entra SSO (OIDC): hand-rolled authorization-code flow (confidential client,
  PKCE S256, RS256 id_token via JWKS) over Node built-ins only; env-gated no-oracle routes
  (404 when unconfigured, identical bodies when partially configured); pinned-tenant
  verified-email linking with guest-shape rejection; JIT bare accounts (no default role);
  SSO×2FA challenge-then-stop (no session minted pre-TOTP); SSO-only mode 404s the password
  door; one generic `ssoError` surface; `OIDC_DEFAULT_ROLE` removed end-to-end; strict
  `email_verified === true` gate on linking/JIT/invite reconciliation — Phase 30 (SSO-01..08;
  verification passed, UAT 2/2 live-tenant, security audit 17/17 threats closed)
- ✓ Second TOTP factor: `totp_factors` single source of truth with one-time boot copy,
  shared `verifyTotpAgainstFactors()` helper across login/challenge/step-ups, per-factor
  replay guards, enroll (password + existing-factor code + required label), enable (staged
  secret, per-factor baseline), remove (survivor-code guard), last-factor teardown runs the
  existing disable transaction, localized factor list + staged wizard + remove confirm —
  Phase 31 (TOTP2-01..05; re-verified 9/9, UAT 3/3)
- ✓ Team-derived project visibility: `project.teams ∩ member.teams ≠ ∅` opens projects
  through the single `hiddenFor()` funnel via one shared `memberCanReadProject` helper also
  adopted by the reminder pass and email mirror; no-team projects stay workspace-wide;
  Phase-29 explicit scope remains an optional admin restriction (D-03 grant inversion
  survives, byte-identical 404s preserved) — Phase 32 (VIS-01..03; verification 7/7)
- ✓ Membership-surface hardening: sameOrigin guard ordered FIRST on the invite-accept route,
  shared `firstForwardedValue()` closing the multi-value x-forwarded-host gap, structural
  silent `{name,email,password}` body whitelist with spoof pins, both `firstWorkspace()`
  invite twins fail closed in one commit (accept 410, SSO twin lands generic ssoError), and
  link-only admin/owner invites impossible at creation, harmless at accept, extinct in
  stored data (update-only boot sweep) — Phase 33 (HARD-01..05; verification 5/5)
- ✓ Per-user notification preferences as SQLite rows keyed (workspace_id, user_id): single
  `getUserNotifPrefs` accessor, GET/PUT `/api/me/notif-prefs` with a 17-key whitelist,
  notifPrefs stripped from the workspace document (dual strip + boot sweep), additive
  migration with pre-backup and byte-identical second boot — Phase 34 (SETTINGS-01..03;
  verification 16/16, UAT 8/8)
- ✓ Recent-search leak closure: tokenized NFC+lowercase matcher in `src/lib/redaction.js`
  replaces the substring `includes`, with table-driven tests; free-text search limitation
  documented — Phase 34 (SEARCH-01; verification 16/16)
- ✓ Honest delTeam undo: before-map captured at confirm, doc push awaited via `pushNow()`
  (shared pushing mutex, 5s deadline), fail-closed `!pushed.ok` gate with err.changeTeam
  toast, union replay of purged memberships — Phase 35 (UNDO-01/02; verification 16/16)
- ✓ docker-compose forwards `MASTER_KEY_PREVIOUS` (compose-config pin) — Phase 35
  (DEPLOY-01; verification 16/16)
- ✓ Every server-emitted notification renders in the recipient's locale through a shared
  EN/FR catalogue: per-recipient emails via `tFor`, machine-keyed reminder rows + localized
  inbox render (legacy prose rows pinned byte-identical), and a build gate against catalogue
  drift (server notif.* key resolution + EN↔FR parity, live exit 0) — Phase 36 (I18N-01..04;
  verification 12/12)
- ✓ REM-01..04 — Honest reminder cadence: at most two due-date notifications per task per
  assignee ("Due today" morning-of, "Past due" the following morning), exactly-once via a
  transactional `reminders_sent` claim, `day_before` removed deploy-safely, push_due pref
  removed end-to-end, and a post-09:00 boot catch-up window (`hour >= 9`, REM-06 regression
  pin) — Phase 37 (UAT re-passed live 2026-11-05)
- ✓ Daily digest email at 09:00 workspace-local with today's + overdue tasks, transactional
  send claim, strict opt-in (`email_digest`), and individual reminder emails suppressed for
  digest users while inbox/push rows stay untouched — Phase 38 (DIGEST-01..03; verification
  7/7, UAT passed)
- ✓ AUDIT-01/02 — Full notification audit doc (`docs/notification-audit.md`): every type ×
  channel × default with file:line citations, trim recommendation per row, RFC 8058
  List-Unsubscribe decision for the digest (plain header proposed; one-click deferred to a
  DKIM milestone), D-05 owner-validation status column (all rows `proposed` until the owner
  rules) — Phase 39 (doc-only; verification 5/5, UAT 1/1)
- ✓ **PUSH-01..03** — Real browser push + toasts (from backlog 999.2): Web Push subscription
  with VAPID, service-worker notification click/focus handling, settings-page permission
  UX with derived "Browser blocked" badge and one-time explanatory toast — Phase 48
  (verification 6/6 must-haves; UAT 2/2; security threats_open 0)
- ✓ **DBA-01..04** — Database adapter: `DB_URL` selects Postgres via the `pg` driver through
  a minimal async facade (`db.get/all/run/tx`), absent config stays byte-identical SQLite,
  both backends pass the same suite, pg schema/migrations/seed + one-shot SQLite→pg copy
  script + DEPLOY.md env matrix — Phase 45 (verification 8/8; UAT 2/2 owner-accepted)
- ✓ **MCP-01..04** — MCP server: 35-tool authenticated workspace-scoped surface over
  hand-rolled JSON-RPC 2.0 (D-12 respected — zero protocol dependencies), personal
  `psk_live_` API keys with hash storage/revocation/expiry, same permission funnel as
  UI/API, unconfigured = feature absent, `MCP.md` + `DEPLOY.md` §15 — Phase 46
  (branch feat/mcp merged e541e45; verification 4/4; UAT 5/5)
- ✓ **FIX-01** — Command/UI hardening: two-letter G shortcuts in the command palette
  (shared `gPending` G-nav map, query-typing guard, initials-across-words filter
  behaviorally pinned by test/palette-filter.test.mjs) — Phase 47 (branch fix/commands
  merged 62b1826; verification 2/2; UAT recorded 5fe7f67)
- ✓ **PUSH-01..05** — Browser push v2: `push_subscriptions` SQLite+pg mirror with
  endpoint-UNIQUE replace, env-overridable /data-persisted VAPID custody (restart
  tracer test), `sendPushFor()` mirroring the email gate order with the 404/410
  same-pass row sweep and the 4096-octet payload budget, service-worker push handler
  with open-tab suppression + deep-link display, gesture-gated Settings opt-in with
  device list + per-device test push — Phase 59 (3/3 plans; owner UAT 6/6 on production)
- ✓ **DELIV-01/02, I18N-01** — Delivery infrastructure: e2e dist staleness guard
  (content-hash manifest check, fail-closed spawn test), Vite code-splitting under
  the D-02 500 kB gate (entry 606 kB → 498 kB), locale registry/loaders/gate
  accepting a new locale by adding one JSON file (fixture-locale proven) — Phase 56
  (4/4 plans; chunk gate 11/11 green)
- ✓ **VIEW-01..03** — Views, columns & General Access: column show/hide with
  debounced write-through, saved views in server `saved_views` rows behind
  `/api/me/views` (≤20/member/key, 2 kB blobs, overwrite confirm),
  `prefs.defaultPrivate` owner toggle, General-Access granularity beyond
  private/public — Phase 57 (3/3 plans; VIEW-02 flaky noted pre-existing at baseline)
- ✓ **NOTIF-01..03** — Notification trim: audit doc v2 (`docs/notification-audit.md`)
  with D-04/D-05/D-06 owner rulings, the 4 dead notif-prefs keys removed end-to-end
  (PUT 400 guard), inbox burst coalescing render-only (`groupBursts`, same
  type+task among unread, D-11/D-12/D-13; summary row → task drawer; expand/
  collapse; mark-group-read; EN/FR plurals) + post-UAT ruling: duplicate unread
  rows refresh in place, never re-email — Phase 61 (2/2 plans; verification 4/4
  passed; UAT 7/7 with live browse-MCP evidence)
- ✓ **SEARCH-01..04** — Full-text search: server-side FTS over task titles + descriptions
  (SQLite FTS5 / pg equivalent through db-adapter.mjs), redacted route
  `/api/workspaces/:slug/search` through `memberCanReadProject` with byte-level leak tests,
  funnel diff sync + boot sweep, accent-insensitive matching, `/search` page, hybrid Ctrl-K
  palette merge (cmd+search modes; graceful local-only degrade when the server is down) —
  Phase 58 (4/4 plans incl. gap closure 58-04; verification 4/4 passed, UAT 3/3 with the
  cmd-mode dispatch gap re-verified live; review CR-01 pg tx-atomicity advisory open in
  58-REVIEW-DISPOSITION.md)
- ✓ **DASH-01..04, TRN-02** — Admin dashboard (power-admin aggregates over the raw stored
  doc per DASH-04, four panels, 30 s poll with abort+teardown on route exit) + member
  self-view (Settings › My access, caller-scoped Phase 52 funnel, zero identity exposure)
  — Phase 60 (3/3 plans incl. gap closure 60-03; verification 14/14 re-run passed with the
  CR-01/WR-01/WR-02 gaps closed test-first; review disposition ledger 3 fixed, WR-03 + info
  advisories open)
- ✓ **REQ-EXP-01..03** — Exports verification: automated 3-level pre-screen in the existing
  node:test suites (MSPDI OutlineLevel/Summary re-derived from serialized XML, DFS order,
  zero new deps); owner UAT per format with real MS Project (MSPDI PASS, evidence captured);
  verdict recorded, A1 closed, conditional fix wave (MSPDI duration zeroing for Type=0
  Fixed Units) re-verified — Phase 69 (verification passed; milestone audit 8/8)
- ✓ **REQ-70-*** (D-70-1..7) — Subtask rows in Timeline/Board XLSX per D-70 decisions —
  Phase 70 (goal-backward verification, all criteria traced in live code)
- ✓ **REQ-71-COLUMNS** (D-71-1..7) — Subtask meta columns in List view aligned to the
  parent grid — Phase 71 (12/12 must-haves, standing visual UAT passed)
- ✓ PWA-04 — Honest install hint banner: lazy install-banner chunk, `beforeinstallprompt`
  capture with bounded rAF retry surviving pre-hydration boot (CR-01 closure), 14-day
  dismissal cooldown, gesture-bound native prompt, iOS static hint / Firefox silence
  (Phase 73; verification 4/4, UAT real-Chromium pass, security SECURED, review CR-01/WR-03
  fixed — WR-01/WR-02/IN-01..05 open as advisory carryovers)
- ✓ PWA-01 — Web app manifest served with correct MIME/no-cache, frozen identity fields,
  head tags integrated, favicon-swap boundary intact — Phase 72 (verification 4/4)
- ✓ PWA-02 — Five-PNG install icon set from the brand mark with maskable safe-zone redesign;
  post-ship owner ruling: `any` icons re-rendered with transparent corners (contract-pinned
  RGBA) — Phase 72 (verification 4/4; icon transparency pinned post-milestone)
- ✓ PWA-03 — Service-worker installability proven by the EXISTING push SW with zero code
  changes: sha256 pin, registration call-site pins, scope agreement, DEPLOY.md §18, 4/4
  real-device UAT — Phase 74 (verification 7/7 passed)
- ✓ WSG-07, WSG-08, WSG-09 — Governance Surface: operator-only /governance page listing ALL
  workspaces (name/slug/members/creator/created/status), filter + seg, type-to-confirm
  archive with amber archived badge + unarchive, empty-only delete with per-member orphan
  disposition modal (reassign destination+role / release), keyed toasts, 403 fullstate for
  non-operators; Operators section relocated from Settings (single operator surface, D-01) —
  Phase 79 (verification 18/18 passed; UAT walkthrough 1/1 pass)

### Active

- **Next milestone:** not yet planned — v3.1 Workspace Governance is complete; start with
  `/gsd-complete-milestone` then `/gsd-new-milestone`.
- **Backlog:** MS Project/xlsx visual checks (first Project-equipped machine);
  UI round-3 invite follow-ups (53-VERIFICATION.md); searchable token-chip pickers;
  56-02's 9 pre-existing e2e spec failures (locale/french-overflow — dedicated plan);
  999.1 Phase 57 mobile layout follow-up (ROADMAP Backlog).

### Out of scope

- Real billing and plan enforcement (quotas, seats, storage, invoices). The plan stays a
  display value, but only an owner may change it.
- Subdomain tenancy, SAML/SCIM (Entra OIDC shipped in v1.6; SAML/SCIM stay out).
- File storage hardening beyond Phase 12: upload quotas per workspace/user, antivirus
  scanning, and external object storage (real binary uploads under `DATA_DIR/files/`
  shipped in Phase 12).
- Translating the remaining languages (日本語, English UK). The selector will not offer a
  language that is not translated. (Dutch, German and Spanish shipped 2026-11-19 — full
  1946-key catalogues, parity-gated; they left this list.)
- The invitation email in the user's language — the server image ships no catalogue, so it would
  need a Dockerfile change and `Accept-Language` negotiation.
- A translation-management UI or machine-translation pipeline: the catalogues are files in the
  repository, edited like code.
- Right-to-left support: no RTL locale is offered, and the catalogue format must not block one
  later.
- Locale-specific currency formatting: the plan prices are display-only labels.
- The demo seed's sample content and the two prototype pages: sample data and design-system
  demonstrations, not product surfaces.
- Accent-insensitive *sorting* (`Intl.Collator`): it changes an order the existing tests assume,
  so it is deferred even though accent-insensitive *matching* is in scope.

## Context

- Shipped v2.6 (2026-11-18) with 3 phases, 8/8 requirements; unit 1737/0, e2e 140
  (+1 pre-existing env flake), chunk ≤500 kB, zero new runtime dependencies. Exports
  ground truth: subtask tree rides every channel — xlsx Timeline (DFS child bars),
  Board (flat lane cards), MSPDI (`OutlineLevel = depth+1`, re-derived Summary), CSV
  (dotted key); due inheritance `s.due || t.due || ''` model-wide in `src/export/model.js`.
- Shipped v2.2 (2026-11-14) with 6 phases, 24/24 requirements; full suite 1524 tests
  / 0 fail; e2e 111 (+1 pre-existing flaky); lint fully clean; chunk gate 11/11 green.
- ~25k+ lines of JavaScript across `server.js`, `mcp.js`, `db-adapter.mjs`, `oidc.js`,
  `test/`, `public/` and `src/`; runtime dependencies: `{ pg, web-push }` only
  (dynamic import under `DB_URL=postgres://`; SQLite default unchanged; web-push
  exact-pinned, env-overridable VAPID keys in /data).
- Search ground truth: `task_fts` shadow index (SQLite FTS5) + `task_search_projection`
  (pg), one in-transaction `syncTaskFts` path, boot-sweep healing, membership-gated
  `/api/workspaces/:slug/search`.
- Push ground truth: `push_subscriptions` table (SQLite+pg), VAPID keys in /data,
  service worker registered after `api.init()`, per-type pref gating mirrors email.
- Auth ground truth: `sessions` / `login_challenges` / `recovery_codes` / `totp_factors`
  tables, `v2:` keyring envelopes, `team_members` authority rows with scope columns,
  `oidc_identities` + `oidc.js` (raw OIDC, `node:crypto` only), per-user `notif_prefs` rows,
  `api_keys` for MCP/personal API keys.
- Data ground truth: `db-adapter.mjs` async facade (SQLite `node:sqlite` default, `pg` via
  `DB_URL`), pg schema variant with bigint epoch columns, `scripts/copy-sqlite-to-pg.mjs`.
- Known deferred items: ensureColumn defs stay `integer` on pg (harmless today — documented
  in the phase 45 deferred-items); 56-02's 9 pre-existing e2e spec failures (acknowledged
  2026-11-14, dedicated plan later); carried v1.5 debug-session unknowns — see STATE.md.
- Known issues are tracked in `CHANGELOG.md` (limits) and `DEPLOY.md`.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
