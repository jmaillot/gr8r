# Project Research Summary

**Project:** Projects Studio — Milestone v1.7 "Team Visibility & Hardening"
**Domain:** Self-hosted PM workspace — debt-closure milestone (no new surface area)
**Researched:** 2026-11-02
**Confidence:** HIGH — every code claim across all four reports was read directly from the current tree this session; Node 24 confirmed (`node:24-alpine` both Dockerfile stages, local v24.21.0).

## Executive Summary

v1.7 is a debt-closure milestone over a mature, heavily-tested codebase (803 tests, zero runtime dependencies, additive-only migrations with byte-identical second boot). All six items (VIS, UNDO, HARD, SEARCH, SETTINGS, DEPLOY) hook into well-understood seams that were pinned to exact `server.js` line numbers during research. Five of the six are localized fixes; only VIS is structural. The recommended approach: extend the single Phase-29 `hiddenFor` redaction funnel (server.js:730) with the team-intersection predicate, never build a second visibility pipeline; implement SETTINGS with the proven `migrateTeamMembership` migration recipe (additive table, row-level eligibility guard, pre-backup); make HARD a set of small, contract-aware edits to the invite surface; keep UNDO client-side; and ship DEPLOY as a one-line compose change with a doc-parity test.

The dominant risk is VIS regression: team-hidden projects leaking through send-time filters (reminder/email paths at server.js:1110 and :1239 re-derive reach from the scope column alone and bypass `hiddenFor`), the D-03 grant inversion being broken by a conjunctive rewrite, the byte-identical-404 no-oracle property being broken by a distinguishable error, or no-team projects accidentally becoming team-restricted. All four are avoidable with an additive (union-of-hidden-sets) predicate, one shared helper consumed by `hiddenFor` **and** the two send-time filter sites, and an extension of the named 404-matrix test pattern. UNDO carries an unresolved owner decision (compensating replay vs. removing the misleading Undo offer); SETTINGS carries one (invoices: purge, not migrate — research strongly recommends purge since the doc field is already stripped on write).

## Key Findings

### Recommended Stack

**No new dependencies — nothing to install.** Zero-runtime-dependency held since v1.1; every v1.7 item uses existing codebase machinery or Node 24 built-ins. No Node upgrade (node:24-alpine stays).

**Core technologies (all already in the codebase):**
- `node:sqlite` (`DatabaseSync` at server.js:54) — the new `user_notif_prefs` table and VIS's `team_members` queries; flat columns over JSON blobs so defaults express in SQL; keep 1/0 explicit boolean binding (boolean binding only landed in 24.21, too new to assume).
- `sameOrigin(req)` (server.js:2389) — battle-tested on ~35 routes; HARD adds call sites, not a new mechanism. Keep the exact string compare (no `new URL()`), mirror `proto()`'s first-value split for `x-forwarded-host` (currently inconsistent), never require Origin (breaks non-browser/server paths and legit email navigation GETs), never add Referer fallback.
- Phase-29 redaction funnel (`projectScope`/`hiddenFor`/`canSeeProject`, server.js:649–880) — VIS's sole seam; the contract comment at :705-711 makes the single-funnel rule explicit and testable.
- Migration recipe (`migrateTeamMembership`, server.js:1693–1741) — SETTINGS copies it: guarded one-time backfill with pre-backup, row-level eligibility, `insert or ignore`.
- Client undo idiom (`snapshot()/restore()` + `api.setMemberTeams`, teams.js:70–167) — UNDO's fix reuses it with the snapshot moved above the purge.

### Expected Features

All six items are the milestone scope; this is a debt milestone — any new surface area is out of scope by brief. Competitor comparison (Plane, Wekan, Focalboard, Taiga) confirms the plan matches the standard: derived access never rewrites stored membership rows, no per-project opt-out exists anywhere, removal is symmetric and immediate (gr8r reads are computed per-request — free), and admins keep wildcard access.

**Must have (table stakes for this milestone):**
- **VIS** — team-intersection visibility inside the single `hiddenFor` funnel: visible ⟺ `p.teams ∩ memberTeams ≠ ∅` ∨ existing rules; empty `teams[]` ⇒ workspace-wide; admin/owner exemption preserved; Phase-29 scope composes on top (D-03 grant inversion must survive).
- **HARD** — `sameOrigin` on invite-accept POST (server.js:4316, before body read/throttle per Pitfall-22 order); remove `firstWorkspace()` fallback at :4354 (accept) and :2773 (SSO reconcile — a verbatim-twin contract, change both in one commit); end link-only invites (:4242) so every accept is email-bound; spoof window (:4330-4352) closes as a consequence. Leave read-path `firstWorkspace()` uses (:4822, :2166) and the seed bootstrap (:1647) alone.
- **SEARCH** — close the two-directional `includes()` leak (server.js:825-854): guard empty hidden terms, bidirectional containment, tighten normalization; document the residual free-text limitation (explicitly sanctioned by the milestone).
- **SETTINGS** — dedicated `user_notif_prefs` table (one-table-per-concern precedent: `totp_factors`, `reminders_sent`); all four notifPrefs read sites (1062, 1226, 633, 1585) routed through one accessor; doc field kept as legacy fallback initially; `invoices` purged, not migrated (it is already stripped on write, server.js:1341).
- **UNDO** — delTeam undo becomes honest: either compensating replay (Option A) or drop the Undo offer (Option C).
- **DEPLOY** — `MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}` in compose (never `:?`), extending the existing DEPLOY.md §14 doc-parity test harness.

**Defer (v1.x+):** moving `recentSearches` per-user (only if SETTINGS infra makes it near-free); "visible via team X" affordance. **Never:** Teamspaces entity model, server-side trash, CSRF tokens, ACL UI, per-user invoice migration — all anti-features at this scale.

### Architecture Approach

Everything hangs off the one funnel: `hiddenFor(doc, membership)` (server.js:730) is consumed by both `redactDoc` (:860) and `mergeClientDoc` (:922); everything downstream (tasks, comments, recent searches, filters) derives from that one set. VIS's minimal seam is extending `hiddenFor` with a memoized per-request `team_members` query plus one shared team-intersect helper that the two send-time filter sites (:1110 email mirror, :1239 reminders) must also adopt — otherwise team-hidden projects leak through emails. The hidden set must be built **additively** (`privateHidden ∪ outOfScope ∪ teamGated`) so the D-03 scope-grant inversion keeps working; scope grants short-circuit VIS per project. SETTINGS's per-user rows change the email/reminder pref gates to per-recipient lookups with workspace-shared fallback (normalizeDoc's merge stays as the legacy fallback). There is no server-side team-delete route today — team deletion is a client doc edit plus a pre-PUT authority purge — which is exactly why the undo snapshot (client-only) cannot restore memberships.

### Critical Pitfalls

1. **VIS-1: Second visibility predicate beside the funnel** — the easiest silent fork of the Phase-29 invariant. Avoid by extending `hiddenFor` itself and adopting the same helper at :1110/:1239; never compute team visibility at call sites.
2. **VIS-2: 404 no-oracle broken** — team-invisible projects answering 403/400 with descriptive codes is an existence oracle. Pin byte-identical 404 per endpoint family in the extended 404-matrix (test/scope.test.mjs:512 SCOPE-03 pattern), including the file-serve side door.
3. **VIS-3: Teamless breakage** — naive intersection hides every no-team project from everyone, and zero-team members (SSO JIT) see nothing. Empty-`teams[]` ⇒ workspace-wide must be the predicate's first branch, tested with JIT-shaped fixtures.
4. **UNDO-1: Blind undo resurrects stale rows** — compensating replay must reconcile captured rows against live `memberships` (`insert or ignore`), never blind-restore; a member removed or re-invited between delete and undo must not get stale teams; undo must be exercised as admin (workspace-wide VIS invariant).
5. **SETTINGS-1: Byte-identical second boot dies** — a global (not row-level) eligibility guard resurrects changed prefs; route all four read sites through one accessor or split-brain prefs return; handle stale clients PUTting `notifPrefs` back (write-path strip decision made explicitly, not by default).
6. **DEPLOY-1: Compose mis-edit makes the previous key required** — `:?` breaks fresh installs; only the optional `:-` form is correct, pinned by a compose-config test both with and without the var.

## Implications for Roadmap

Based on research (presented as evidence for the roadmapper's decision, not a decision in itself), the reports' combined dependency analysis supports a 5-phase structure:

### Phase 1: VIS — Team-Derived Visibility (the headline, structural item)
**Rationale (evidence):** VIS must land **before or with** SEARCH tuning and before any send-time-filter test updates — the reminder/email paths (:1110, :1239) and the hidden-term list (:825) all derive their behavior from what VIS makes hidden (ARCHITECTURE.md: "the one ordering decision that matters"). Landing VIS first means every later phase tests against the final visibility semantics.
**Delivers:** team-intersection inside `hiddenFor`, shared team-intersect helper adopted at :1110/:1239, additive hidden-set composition preserving D-03, empty-teams ⇒ workspace-wide, admin exemption intact; extended 404-matrix with team-visible rows.
**Avoids:** VIS-1, VIS-2, VIS-3.

### Phase 2: HARD — Membership-Surface Hardening
**Rationale:** independent of VIS but high-value audit closure; small, well-pinned edits. Doing it early keeps the security surface settled while later phases touch adjacent routes.
**Delivers:** `sameOrigin` first on accept POST (:4316, Pitfall-22 order), strict workspace resolution on :4354 + :2773 in one commit (410 `workspaceGone`, never a cross-tenant join), email-bound invites only (:4242), spoof-payload whitelist test.
**Avoids:** HARD-1 (guard only the POST, never the GET; test behind proxy headers), HARD-2, HARD-3.

### Phase 3: SETTINGS — Per-User Settings Isolation
**Rationale:** the only additive-migration item, so it carries the byte-identical-second-boot test burden; also provides the per-user row pattern SEARCH can optionally reuse.
**Delivers:** `user_notif_prefs` table + guarded backfill (row-level eligibility, `insert or ignore`, pre-backup), one accessor over all four read sites, per-user routes beside the membership routes, `invoices` purge decision executed.
**Avoids:** SETTINGS-1.

### Phase 4: SEARCH — Substring-Leak Closure (+ UNDO if kept separate, see below)
**Rationale:** SEARCH's filter tightens for free once VIS lands (team-hidden projects add redaction terms) — tuning it after VIS avoids double test churn. Can be folded into Phase 3 if the owner opts to move `recentSearches` per-user.
**Delivers:** bidirectional containment in `referencesHidden`, empty-term guard, variant-normalization leak tests, documented free-text limitation in `CHANGELOG.md`.
**Avoids:** SEARCH-1 (keep conservative `includes()`; document false-positives).

### Phase 5: UNDO + DEPLOY — Honesty Fixes & Operator Gap
**Rationale:** UNDO is independent and small; DEPLOY is trivial (one line + parity test) and can bundle anywhere — pairing it with UNDO gives the milestone a light close. Alternatively DEPLOY ships inside Phase 2 as a rider.
**Delivers:** honest delTeam undo per the owner's decision (A or C below), or removal of the offer; compose `MASTER_KEY_PREVIOUS` passthrough with `:-` form + compose-config parity test.
**Avoids:** UNDO-1, DEPLOY-1.

### Phase Ordering Rationale

- **VIS first is forced by data flow, not preference:** SEARCH and the send-time filters both consume what VIS hides; landing VIS later would mean revisiting their tests twice.
- **HARD and SETTINGS are independent of each other** and could swap; SETTINGS placed third because its migration machinery deserves a full phase of attention and its infra optionally serves SEARCH.
- **UNDO × VIS interaction is managed by ordering:** undo re-PUTs flow through `mergeClientDoc`, so undo tests are written after VIS semantics are final (exercised as admin — workspace-wide, no VIS interference, pinned as an invariant in tests).
- **DEPLOY is trivially cheap** and schedulable anywhere; its only coupling is to the DEPLOY.md parity-test harness.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (VIS):** the composition semantics (VIS × scope × admin × guest) have genuine design decisions — the exact additive predicate form, whether guests see team-gated projects at all, and the 404-matrix extension shape. Recommend `--research-phase` or at minimum a thorough discuss-phase.
- **Phase 3 (SETTINGS):** migration-order placement in `bootstrap()` is load-bearing; write-path strip vs. tolerate-and-ignore for stale clients is an explicit decision.

Phases with standard patterns (skip research-phase):
- **Phase 2 (HARD):** every fix is a one-line guard or fallback removal at pinned lines, following established in-repo idioms; the SSO twin-contract and e2e email-link flow are already mapped.
- **Phase 4 (SEARCH):** single-function change to an existing helper with existing tests.
- **Phase 5 (UNDO/DEPLOY):** both use existing patterns verbatim (`submitTeam`'s before-map, doc-parity test harness).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; every capability verified in the tree or Node 24 docs; no install step at all. |
| Features | HIGH (codebase claims) / MEDIUM-HIGH (competitor comparisons) | All code claims read directly; competitor details from official docs (Plane, Wekan) with some community sources treated as directional. |
| Architecture | HIGH | Seam map pinned to exact line numbers across server.js (4,920 lines), teams.js, actions.js, compose file; Node sqlite transaction surface doc-verified. |
| Pitfalls | HIGH | Every pitfall verified at HEAD; the two general-practice items (proxy/Origin misconfig, stale-undo reconcile) are labeled and structural, not speculative. |

**Overall confidence:** HIGH — unusually so; this is a research-informed hardening milestone over a fully mapped codebase, with every fix anchored to a verified seam.

### Gaps to Address

- **UNDO direction (owner decision):** Option A (compensating client-side replay of `setMemberTeams`, snapshot moved above the purge, with failure-rollback and concurrent-edit reconciliation) vs. Option C (drop the Undo offer, keep the honest confirm dialog with impact counts). The research recommends A but flags it as a feature-vs-honesty call, not a technical one. Note: research found the server purge happens in the per-member re-PUT loop (:136-144) before `snapshot()` (:150) — whichever option, the client capture must move before the purge.
- **Invoices disposition (owner confirmation):** research strongly recommends purge-not-migrate (the doc field is already stripped on write at server.js:1341 and the migration test proves the pattern); milestone text says "invoices already purged" — confirm no per-user invoice rows are actually wanted.
- **VIS × guest semantics:** does a guest (viewer + exactly one project) see team-gated projects at all? Recommended reading: no (guests are already maximally restricted), but pin it in the 404-matrix.
- **`x-forwarded-host` first-value discipline:** making `sameOrigin` consistent with `proto()` changes behavior behind multi-hop proxies — verify the actual Traefik topology during Phase 2 planning.
- **Stale-client handling for `notifPrefs`:** write-path strip vs. tolerate-and-ignore once per-user rows exist — decide explicitly in the phase, don't default.
- **`DatabaseSync` deprecation alias (DEP0210):** not a v1.7 concern; note in STATE.md deferred items.

## Sources

### Primary (HIGH confidence)
- `server.js` (full read, ~4,920 lines, current tree) — all cited seams: funnel (:649–880), sameOrigin (:2389), invite surface (:4180–4390), migration machinery (:1558–1741), notifPrefs reads (:633, :1062, :1226, :1585), recent searches (:825–882)
- `src/actions/teams.js:70–167`, `src/actions/actions.js:265–272` — undo trap verified end to end
- `docker-compose.yml` — MASTER_KEY forwarded (:39), MASTER_KEY_PREVIOUS absent [file-verified]
- `test/scope.test.mjs`, `test/migration.test.mjs`, `test/totp-encryption.test.mjs`, `test/due-reminders.test.mjs` — 404-matrix, byte-identical second boot, D-K2 loud-fail, legacy all-ON pins
- Node.js official `node:sqlite` docs (Context7, `/nodejs/node`) — transaction/UDF/boolean-binding surface on 24.x

### Secondary (MEDIUM-HIGH confidence)
- Plane official docs (Teamspaces, roles, project members) — derived-access semantics the VIS predicate mirrors
- Wekan docs (GitHub) — per-user watch/mute prefs, board visibility
- UX standards: vocab.design "Undo", Marigold UI "Destructive Actions", undo-toast catalogs (2026-06/2026-10)

### Tertiary (LOW confidence, directional only)
- Focalboard/Taiga positioning via Pi Stack (2026-04) and TechRepublic (2026-03) comparisons

---
*Research completed: 2026-11-02*
*Ready for roadmap: yes*
