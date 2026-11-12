# Project Research Summary

**Project:** Projects Studio (gr8r) — milestone v2.2 Notifications, Search & Delivery
**Domain:** Self-hosted project-management workspace (Node monolith, JSON workspace docs, dual SQLite/pg, vanilla-JS SPA)
**Researched:** 2026-11-12
**Confidence:** HIGH (architecture & pitfalls codebase-grounded at HEAD; stack versions verified against npm/Node/Vite docs; feature UX from canonical product behaviors)

## Executive Summary

v2.2 adds nine features to an already-disciplined system, and the research converges on one controlling fact: **everything data-bearing either hooks the single doc-PUT funnel or follows the Phase 34 authority-rows precedent**. The recommended approach is: deliver infrastructure first (e2e dist guard + Vite code-splitting, so every later phase's verification runs on it), then doc-model client work (saved views + column show/hide), then the two new server surfaces that share the funnel diff (FTS search and push fan-out), then read-only views (dashboard, TRN-02), and last the owner-blocked NOTIF-TRIM. No architectural novelty is required anywhere — only discipline in reusing four proven patterns: diff-at-the-funnel, additive authority rows, env-gated feature absence, and the `memberCanReadProject` redaction funnel.

The stack story is minimal by design: **one candidate new runtime dep (`web-push@4.0.0`)** and one hard runtime constraint (**Node ≥ 22.16 for FTS5 in `node:sqlite`**, with a boot probe + LIKE fallback). Everything else is built-ins: Vite native dynamic imports for splitting, `unicode61`/`remove_diacritics` for FR accent tolerance, and an extended `public/sw.js` that stays out of the build pipeline. A spike should verify the deployment Node actually ships FTS5 before the search phase plans anything.

The risks are all known classes with in-house precedents: push subscription churn (404/410 sweep, never retry), VAPID key loss on restart (persist like MASTER_KEY — the v1.5 keyring lesson), FTS index drift from non-funnel write paths (single chokepoint hook + boot rebuild + consistency count), privacy leaks in search/dashboard/self-view results (everything routes `memberCanReadProject` or its dedicated redaction funnel, tested byte-level), and locale-chunk races at first paint (EN base catalogue in the entry chunk, boot-gated await).

## Key Findings

### Recommended Stack (STACK.md)

The only possible new runtime dependency is `web-push@4.0.0` (ESM, deps dropped, 0 vulnerabilities). FTS5 comes free inside `node:sqlite` on Node ≥ 22.16 (not 22.14/22.15, not any 23.x — and distro builds may strip it: probe at boot, don't trust). Vite already emits every `import()` as a chunk; no splitting plugin is wanted. Nothing else is added.

**Core technologies:**
- **`web-push@4.0.0`**: RFC 8291 payload encryption + VAPID signing from `server.js` — the `pg`-precedent scoped dep (D-12 amendment); hand-rolled fallback (~300–500 lines crypto, the riskiest hand-rolled piece the project would own) only if the owner vetoes
- **Service Worker + Push API (browser natives)**: extend the existing Phase 48 `public/sw.js` in place — no workbox, no `vite-plugin-pwa`, never through the Vite pipeline
- **VAPID keys as env vars** (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`): MASTER_KEY custody pattern, DEPLOY.md section, fail-closed when absent
- **SQLite FTS5 via `node:sqlite`**: engine floor `>=22.16` (recommend 24 LTS) + boot probe on `:memory:` + parameterized-LIKE fallback; never `better-sqlite3` (native dep) and never an external engine (breaks single-image self-hosting)
- **Vite native code-splitting**: dynamic `import()` for locales and heavy views; keep `chunkSizeWarningLimit` at 500 kB — that warning is the milestone's acceptance gate; `build.manifest: true` feeds the e2e dist guard

### Expected Features (FEATURES.md)

**Must have (table stakes):**
- Browser push for mentions + assignments only — settings-surface opt-in, deep-link click-through to `/w/:slug/task/:key`, prefs-gated (`push_mention`/`push_assignment`), per-device test button
- FTS5 search over titles + descriptions, permission-filtered, grouped palette results + "see all" results page, accent-insensitive (FR is first-class), highlighting
- Admin dashboard with the **4 fixed widgets** (overdue per project, workload per member — per-assignee since v2.1 `assignees[]`, upcoming dues, recent activity) — anti-builder
- TRN-02 member self-view: pure re-surface of TRN-01's `memberCanReadProject` + reason codes, strictly self-scoped
- NOTIF-TRIM: apply the already-written D-05-ruling-gated audit recommendations + generalize RFC 8058 one-click unsubscribe to all notification emails
- Column show/hide per user (highest-value, lowest-risk slice of saved views)

**Should have (competitive differentiators):**
- Saved views as named bundles ({filters, sort, visible columns}) with reset/manage — one "saved filter" primitive shared with search and dashboard drill-downs
- Watch/unwatch (GitHub's best trim idea; auto-watch already exists), quiet hours, burst coalescing, per-type digest routing
- General-Access granularity riding the existing `p.perms` model — zero new stack

**Defer (v2.x+):**
- Search operators/saved searches (hidden-by-default), cross-project/workspace saved views, shared views, "request access" flow, access-change history (each needs an owner ruling), comment/attachment search, dashboard builder, NL date queries

**Hard anti-features:** push for low-intent events, per-notification email actions, fully shareable view URLs, per-project velocity/burndown (needs untracked task history).

### Architecture Approach (ARCHITECTURE.md)

Everything integrates through three precedents: per-user state goes in **rows** (Phase 34), side-effect fan-out hooks the **doc-PUT diff site** fire-and-forget after commit (P4-f email fan-out), and the SW stays a **minimal dependency-free click router** (Phase 48). The FTS index is a shadow `task_fts` projection table maintained transactionally inside the doc-PUT tx (triggers can't diff JSON; a full rebuild per PUT breaks the funnel's one-diff shape) behind an adapter seam `db.searchTasks()` so both backends pass the same suite, healed by a boot sweep. Push subscriptions are a `push_subscriptions` table with fan-out at **two** sites (doc-PUT `newNotifs` diff + `runReminderPass`); payloads are pre-localized tickers (`{url, title, body}` via `tFor`), the SW keeps zero strings. Dashboard is **client-computed** from the already-hydrated doc (pure functions, no server aggregate route). TRN-02 branches the TRN-01 route on role — one funnel, one test matrix. The e2e dist guard lives inside `e2e/server.mjs` beside the existing dist check, failing loudly rather than auto-rebuilding.

### Critical Pitfalls (PITFALLS.md)

1. **Push subscription churn** — treat `404`/`410` as authoritative and sweep dead rows in the same pass as the fan-out; re-subscribe replaces, never accumulates. Never retry them.
2. **VAPID keys not persisted** — every restart would silently orphan all subscriptions; persist in `/data` like MASTER_KEY, never regenerate when stored, restart-integration test required (the MASTER_KEY/keyring lesson, verbatim).
3. **FTS index drift** — non-funnel write paths (MCP mirror, bulk PUT, boot migrations, pg copy) silently break search; hook the **one real write chokepoint** (the doc-PUT funnel diff site, same site as email fan-out), rebuild on boot, log consistency counts, test the bulk/MCP paths.
4. **Transparency self-view leaking others' data** — reusing the admin TRN-01 path as-is leaks team rosters/leads/invitees; a separate self-scoped redaction funnel with byte-level response-shape tests per role (Phase 29 404-matrix style).
5. **Permission leaks in dashboard aggregates** — admin-gated ≠ sufficient; each aggregate item routes `memberCanReadProject`/`hiddenFor`; count-only leaks are still leaks. Private-project collapse-vs-hide is an owner decision for discuss-phase.

Moderate: push payload ≤ 4096 octets (ticker, never task bodies — size test with worst-case FR titles); FTS5 MATCH injection + tokenizer locked at table creation (`remove_diacritics` decision is unchangeable without full rebuild); saved-view schema versioning with lenient-load intersect; locale chunk race at first paint (EN base in entry chunk); dist guard staleness via content-hash stamp inside `dist/`.

## Implications for Roadmap

Based on research, suggested phase structure (ordering follows ARCHITECTURE's dependency-respecting build order):

### Phase 1: Delivery infrastructure — e2e dist guard + code-splitting + i18n infra
**Rationale:** every later phase's e2e runs on this; splitting changes the bundle shape for all subsequent verification. Small, low-risk, no dependencies.
**Delivers:** content-hash staleness guard in `e2e/server.mjs` (refuse-to-start, fail-closed); dynamic-import locales + heavy views (no >500 kB chunk, warning limit untouched); i18n catalogue-loader contract so every later phase adds keys under the new regime.
**Addresses:** e2e guard, Vite splitting, i18n infrastructure (milestone targets).
**Avoids:** Pitfall 9 (locale chunk race), 10 (stale/rebuild-every-run guard), 11 (over-splitting).

### Phase 2: Saved views + column show/hide + General-Access granularity
**Rationale:** doc-only client work, no server deps; exercises the doc-PUT normalizer before bigger server changes land.
**Delivers:** column picker, named view bundles with reset/manage, General-Access via existing `p.perms['team:'+id]`.
**Addresses:** column show/hide, saved views, General-Access granularity.
**Avoids:** Pitfall 8 (versioned schema + lenient-load), 15 (doc-sink bloat).
**⚠ Owner decision:** saved views storage — see Gaps.

### Phase 3: FTS5 full-text search
**Rationale:** depends on Phase 1 for verified e2e; new adapter seam + funnel diff + boot sweep + redacted search route + Ctrl-K integration.
**Delivers:** `task_fts` shadow table behind `db.searchTasks()`, transactional diff sync at the doc-PUT funnel (same site as email fan-out), boot rebuild sweep, `GET /api/workspaces/:slug/search?q=` filtered through `memberCanReadProject`, grouped palette results + results page.
**Addresses:** full-text search wired into Ctrl-K.
**Avoids:** Pitfall 3 (drift), 7 (MATCH injection; tokenizer decision as a logged phase decision), plus the dual-backend suite gate.
**Flag:** needs `--research-phase` if boot probe reveals the deployment Node lacks FTS5 (LIKE fallback path changes the plan).

### Phase 4: Server push fan-out (mentions + assignments)
**Rationale:** lands after Phase 3 so the `newNotifs` diff site isn't edited twice mid-milestone; notification pipeline already exists (Phase 36/38 + Phase 48 UX foundation).
**Delivers:** `push_subscriptions` table, VAPID env + DEPLOY.md section, `sendPushFor()` beside `queueNotifEmails` (fire-and-forget, post-commit), `push` handler in `sw.js`, per-device test, 404/410 sweep, ticker payloads.
**Addresses:** browser push for mentions + assignments.
**Avoids:** Pitfall 1 (churn), 2 (VAPID persistence), 6 (payload size), 12 (SW staleness), 13 (prompt only on explicit intent — never page-load).
**⚠ Owner decision:** `web-push@4.0.0` vs hand-rolled RFC 8291 — see Gaps. Needs `--research-phase` (RFC 8291/VAPID crypto + Safari/iOS real-device UAT).

### Phase 5: Admin dashboard + TRN-02 self-view
**Rationale:** read-only client/funnel work, no ordering risk; benefits from Phase 1 i18n infra; can absorb NOTIF-TRIM UI outcomes.
**Delivers:** 4 fixed widgets (client-computed pure functions), TRN-02 self-scoped redaction funnel with byte-level response-shape tests.
**Addresses:** admin dashboard, TRN-02 member transparency.
**Avoids:** Pitfall 4 (self-view leak), 5 (aggregate leaks — funnel per item).
**⚠ Owner decision:** private-project contributions in dashboard — collapsed "N more private" count vs hidden entirely.

### Phase 6: NOTIF-TRIM
**Rationale:** blocked on owner D-05 rulings by design; can run in parallel with Phases 4–5 once rulings arrive.
**Delivers:** decided default matrix applied, one-click unsubscribe generalized, Phase 38 suppression + no-double-send invariants re-run unmodified.
**Addresses:** NOTIF-TRIM.
**Avoids:** Pitfall 14 (no speculative trims before rulings).

### Phase Ordering Rationale

- **Infrastructure → doc-model → server surfaces → read-only views → owner-blocked.** Phases 3–4 share the funnel diff site, so they are sequenced to edit it once each, not concurrently.
- **Push is the most self-contained item** (Phase 48 foundation done); saved views is the most entangled — hence Phase 2 lands it early while the doc normalizer is the only thing changing.
- **Every phase must respect the convergent hard rules:** search/dashboard/TRN-02 results all route `memberCanReadProject` or their dedicated redaction funnel (a bypass is a security regression, not a shortcut); push payloads are tickers ≤ 4096 octets, never task bodies; FTS sync lives at the doc-PUT funnel diff site (same site as email fan-out) plus a boot rebuild; VAPID keys persist server-side (MASTER_KEY lesson); permission prompts fire only on explicit intent.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (push):** RFC 8291/VAPID crypto spike (hand-roll feasibility, ~150 lines vs `web-push` import), Safari/iOS push on real device, endpoint-404/410 semantics testing.
- **Phase 3 (FTS):** FTS5 availability probe on the actual deployment Node; tokenizer (`remove_diacritics 2` vs input-side NFC+lowercase normalization) — creation-time constant, decide before table creation; pg-side parity query shape.
- **Phase 1 (splitting):** confirm project's Vite major (8.x → `advancedChunks`; ≤7 → `manualChunks`); SW/chunk-hash contract must settle here before push ships.

Phases with standard patterns (skip research-phase):
- **Phase 2 (saved views):** established Phase 34 rows pattern + plain-DOM client state; only the storage-location owner decision needs resolving in discuss-phase.
- **Phase 5 (dashboard + TRN-02):** pure re-surface of existing funnels and hydrated-doc computation; no new technology.
- **Phase 6 (NOTIF-TRIM):** doc/audit-driven execution of already-cited recommendations.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm/Node/Vite docs 2026-11-10..12; FTS5 availability floor verified against nodejs/node PRs; Safari/iOS push MEDIUM — verify in real-device UAT |
| Features | HIGH | All six comparator products' behaviors are documented, canonical, and stable; gr8r ground truth codebase-verified |
| Architecture | HIGH | Every claim verified against `server.js`, `src/core/push.js`, `public/sw.js`, `vite.config.js`, `e2e/server.mjs`, `db-adapter.mjs` at HEAD |
| Pitfalls | HIGH | RFC/SQLite canonical sources + this codebase's own incident history (Phase 34 leak, MASTER_KEY keyring) |

**Overall confidence:** HIGH

### Gaps to Address

- **Saved views storage — owner decision (researchers diverged):** STACK recommends server rows (`saved_views(workspace_id, user_id, name, view_json)` via db-adapter, following the Phase 34 `notif_prefs` precedent: multi-device sync for free, no revision churn, no redaction complexity). ARCHITECTURE recommends the existing doc-synced `S.views` (no new table/sync discipline; the 409 hydrate-wins recovery already proven in Phase 55). Trade-off: server rows win on multi-device correctness and avoid revision churn + `mergeClientDoc` whitelisting; doc fields win on zero new plumbing but churn the shared revision on every personal tweak and leak other members' views if not stripped. **Resolve in discuss-phase with the owner; the Phase 34 precedent is the recommended default.**
- **`web-push@4.0.0` vs hand-rolled RFC 8291 — owner decision (researchers diverged):** STACK recommends the dep (second D-12 amendment, like `pg`; the hand-roll is the single riskiest piece of hand-rolled crypto the project would own). ARCHITECTURE flags the hand-roll option (ECDH P-256 + HKDF + AES-GCM all in `node:crypto`, ~150 lines, Phase 30 RS256/JWKS precedent; if chosen, isolate in `push-crypto.mjs` like `oidc.js` so it can swap for `web-push` later). **Both viable; owner ruling in discuss-phase; either way the phase needs the crypto spike.**
- **Private-project contributions in admin dashboard aggregates** — collapsed "N more private" count vs hidden entirely: owner decision, discuss-phase (Pitfall 5).
- **FTS tokenizer** — `remove_diacritics 2` (creation-time constant) vs input-side NFC+lowercase normalization only: small phase decision with an accent-pair test matrix ("elodie" ↔ "Élodie"); decide before table creation since changing it requires a full rebuild.
- **Deployment Node FTS5 availability** — probe at boot; if the runtime can't be floored to ≥22.16, the documented LIKE fallback over the projection table is the answer, not `better-sqlite3`.
- **Vite major line** — verify 8.x vs ≤7 in the repo to pick `advancedChunks` vs `manualChunks` and confirm the `manifest` option before wiring the dist guard to it.
- **Exact current setting labels/limits in comparator products** — LOW-authority (live search degraded during FEATURES research); not load-bearing for verdicts, irrelevant to implementation.

## Sources

### Primary (HIGH confidence)
- npm `web-push` v4.0.0 release notes / Snyk / GitHub releases — ESM migration, dep drop, 0 vulnerabilities
- nodejs/node#56476 + PR #57621 (cjihrig comments) — FTS5 in `node:sqlite` from Node 22.16.0
- Node.js v26 `node:sqlite` docs (stability 1.2 RC); Vite docs `build-options` + v8.3.8 changelog
- RFC 8291 (≤4096 octets), RFC 8030 (push status semantics), RFC 8058 (one-click unsubscribe), SQLite FTS5 source (`ext/fts5`)
- Codebase at HEAD: `server.js` (doc-PUT tx, `newNotifs` diff, reminder pass), `src/core/push.js`, `public/sw.js`, `vite.config.js`, `e2e/server.mjs`, `db-adapter.mjs`; PROJECT.md phase records (27/29/32/34/36/38/39/45/48/52/55)
- Linear / GitHub / Asana / Trello / Todoist / Basecamp / Airtable / Notion product docs — canonical, stable UX patterns

### Secondary (MEDIUM confidence)
- SQLite FTS5 external-content/contentless field guides (community, cross-checked with SQLite docs)
- Hand-roll RFC 8291 feasibility over `node:crypto` (assessed, needs the phase spike)
- Safari 16.4+ / iOS 16.4+ home-screen Web Push availability (verify in UAT)

### Tertiary (LOW confidence)
- Live web search during FEATURES research (degraded by engine rate limits) — used only to confirm no contradiction; comparator setting labels/limits not relied upon

---
*Research completed: 2026-11-12*
*Ready for roadmap: yes*
