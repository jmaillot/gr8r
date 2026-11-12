# Architecture Patterns — v2.2 feature integration into the existing stack

**Project:** Projects Studio (gr8r) — milestone v2.2 Notifications, Search & Delivery
**Researched:** 2026-11-12
**Mode:** Integration architecture (codebase-grounded; confidence HIGH — every claim below was verified against `server.js`, `src/core/push.js`, `public/sw.js`, `vite.config.js`, `e2e/server.mjs` at HEAD)

## Recommended Architecture

The controlling fact: **tasks, notifs, views and prefs-adjacent state live inside one JSON
workspace document** written through a single funnel — `PUT /api/workspaces/:slug` →
`docFromClient`/`mergeClientDoc` → `db.tx()` with revision check. Every new feature either
(a) hooks that funnel, (b) adds authority rows outside the doc (the established pattern for
per-user state), or (c) is pure client state riding the doc. Three precedents decide where
new state goes:

| Precedent | Established by | Rule it implies |
|-----------|---------------|-----------------|
| Per-user prefs out of the doc | Phase 34 (`user_notif_prefs` rows, doc strip + boot sweep) | Anything per-user and structurally indexed goes in **rows**, never doc blobs |
| Email fan-out off the doc diff | P4-f: `newNotifs` diffed stored-vs-next inside the same tx, sent fire-and-forget **after** commit | Any side-effect fan-out hooks the **same diff site**, never blocks the response |
| Service worker = minimal click router | Phase 48 (`public/sw.js`, no fetch handler, zero strings) | Server push extends this file, does not redesign it |

### Component Boundaries (new vs modified)

| Component | New/Modified | Responsibility | Communicates With |
|-----------|--------------|----------------|-------------------|
| `task_fts` shadow table + `searchDoc` seam in `db-adapter.mjs` | **New** (adapter-level) | Maintains a searchable projection of task titles+descriptions; answers queries | doc-PUT funnel (writes), Ctrl-K client (reads via new GET route) |
| `push_subscriptions` table + `/api/me/push-subscriptions` routes | **New** | Per-user Web Push endpoint/keys rows, VAPID config | push fan-out (reads), settings UI (writes) |
| Server Web Push fan-out (`sendPushFor()` beside `queueNotifEmails`) | **New** | Delivers `web-push`-protocol payloads (hand-rolled `node:crypto` per D-12 constraint) for mention/assign rows | doc-PUT `newNotifs` diff site; `runReminderPass` |
| `public/sw.js` `push` event handler | **Modified** | Receives server push payloads, shows pre-localized notification, reuses existing `notificationclick` router | server fan-out |
| Dashboard | **New client page only** | Overdue/load/upcoming/activity computed from the already-hydrated doc | existing `D` store; no new server route |
| TRN-02 member self-view | **Modified** TRN-01 route | Same `memberCanReadProject`+reason funnel, self-scoped | transparency page |
| Saved views + column show/hide | **Modified** store | `S.views` / column state already syncs through the doc — persist as doc fields, no rows | doc-PUT (free) |
| `e2e/server.mjs` dist guard | **Modified** | mtime/staleness check beside the existing `dist/index.html` existence check | npm scripts |
| Vite config | **Modified** | dynamic `import()` for locales (extension of existing `localeSubset` plugin) and heavy pages | build |

---

## (1) FTS index — where it lives and how it stays in sync

**Verdict: a shadow table maintained by the doc-PUT transaction, in the adapter — not triggers,
not rebuild-on-write of the whole doc.**

- Tasks live in `doc.data.tasks[]` inside the JSON blob; no per-task rows exist, so SQLite
  triggers on `workspaces` would fire on every doc write with no diff knowledge. Triggers
  cannot diff JSON; the server already does.
- The doc-PUT funnel already diffs `storedDoc` vs `next` for exactly this purpose (the
  `newNotifs` / `storedFileIds` pattern at the `db.tx()` body, server.js ~5064–5075). Extend
  the same pass: diff task ids, then within the same transaction upsert/delete rows in
  `task_fts(workspace_id, task_id, title, body)` (FTS5 virtual table on SQLite; a plain
  indexed table on Postgres with ILIKE or tsvector — keep it behind an adapter seam like
  `db.searchTasks(wsId, q)` so both backends pass the same suite, matching the DBA-01..04
  contract).
- **Rebuild sweep at boot** (the `migrateTotpReWrap`-style one-pass pattern): converges any
  drift (crashed PUT, manual DB edit, copy-sqlite-to-pg). Cheap — one full-doc parse per
  workspace at boot, idempotent.
- Reads: new admin-free but membership-gated route `GET /api/workspaces/:slug/search?q=`
  that filters results through `memberCanReadProject` before returning — **search must
  inherit the redaction funnel** (a private-project task title leaking through FTS is the
  one security trap here; the client-side tokenizer from SEARCH-01 only redacts recent
  searches, not index contents).
- Client: Ctrl-K currently searches in-memory; wire it to prefer the server route when the
  doc is large, fall back to local for offline/demo mode.

Why not rebuild-on-write of the full doc index: doc PUTs are frequent and diffing is already
required for emails; a whole-index rebuild per PUT duplicates work and would break the
"one transaction, one diff" shape the funnel is built around. Why not in the client only:
push mentions and MCP mirror also need to find tasks; and search must be server-side to
respect redaction.

## (2) Push subscriptions and fan-out

**Verdict: new `push_subscriptions` table; fan-out at the same two sites that emit notif
rows.**

- **Storage:** `push_subscriptions(workspace_id, user_id, endpoint unique, p256dh, auth,
  created_at)` — structural clone of the `user_notif_prefs` migration (additive
  `ensureTable`, pre-backup, byte-identical second boot). Rows not doc: subscriptions are
  per-browser, per-user, high-churn — exactly the shape Phase 34 ruled belongs in rows.
  One user may hold several rows (desktop + phone); delete on 404/410 from the push service
  (standard subscription-expiry hygiene).
- **Keys:** VAPID keys from env (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`),
  same fail-absent pattern as SMTP/MASTER_KEY: unconfigured → feature absent (existing
  client push-toasts keep working; no new server push). Generating a keypair is a one-time
  deploy step documented in DEPLOY.md.
- **Protocol dependency conflict to resolve early:** real Web Push payload encryption
  (aes128gcm, RFC 8291) is significant hand-rolled crypto. The zero-runtime-dependency
  constraint (D-12) was amended once for `pg` with owner approval — either hand-roll RFC
  8291 + JWT (VAPID) over `node:crypto` (feasible: ECDH P-256 + HKDF + AES-GCM are all
  built-in, ~150 lines, and Phase 30 already hand-rolled RS256/JWKS) or seek a second
  owner-approved exception for `web-push`. **Recommendation: hand-roll**, following the
  oidc.js precedent; flag as phase-specific research.
- **Fan-out sites (both, not one):**
  1. The doc-PUT `newNotifs` diff — right beside `queueNotifEmails` (fire-and-forget,
     response never waits). Mention/assign/comment rows only; gated by the existing
     `push_mention`/`push_assign`/`push_comment` prefs (`PUSH_TYPE_PREF` in
     `src/core/push.js` already names them — server reads them via the same
     `user_notif_prefs` accessor).
  2. `runReminderPass` — due reminders ride the same row pipeline; push there respects the
     Phase 38 suppression/digest invariants (inbox rows never suppressed; push, like inbox,
     flows for digest users).
- Payload: `{ url, title, body }` pre-localized per-recipient via `tFor` (the I18N-01
  pattern) — the SW holds zero strings by design (T-48-02), keep that contract.
- The 30s poll + `notifyNewEvents()` foreground path stays untouched (D-48-2): server push
  covers the *tab-closed* case; the seen-set discipline prevents double-notify when both
  fire (SW notification only when no visible client, or dedupe by notif id in the seen set).

## (3) Dashboard — computed on read, client-side

**Verdict: no new aggregation path. Compute in the client from the already-hydrated doc.**

- The SPA hydrates the *entire* workspace document; an admin sees all of it. Overdue per
  project, load per member, upcoming dues, recent activity are all derivable from
  `D.data.tasks/projects/notifs/activity` with the same pure functions used elsewhere
  (`progressOf`, due-date helpers). Zero server work, zero staleness, free EN+FR via t().
- Anti-pattern to avoid: a server `GET /dashboard` that re-reads and aggregates the doc —
  it duplicates redaction logic, adds a second read path to keep in sync with the funnel,
  and buys nothing at this scale (single Node process, doc already in memory per request).
- If a later milestone needs cross-workspace or scheduled reporting, revisit; the client
  compute functions should be written as pure module exports (e.g. `src/features/dashboard/compute.js`)
  so a server route could reuse them in Node without a rewrite.

## (4) TRN-02 — redaction boundary for the member self-view

**Verdict: same funnel, strictly self-scoped, admin route gains a self variant.**

- TRN-01 (Phase 52) already computes "exactly what a member can access" live through
  `memberCanReadProject` with coarse reason codes + team name, admin-gated keyed 404 route.
  TRN-02 reuses the computation unchanged — the boundary work is *who may call it for whom*:
  - A member may request the view for **their own id only** (`ctx.user.id === :uid` or 404).
  - The response for a self-view redacts cross-member information: **no other members'
    grants, no other members' emails/roles beyond what the member list already exposes**,
    and per-project rows limited to *their* effective access + reason. Team names may show
    (they explain the "why") but the roster of the team should render only through the
    existing team visibility the member already has.
  - Admins keep the full any-member view; the route branches on role, not a second route —
    one funnel, one test matrix.
- The security property to pin in tests: a member's self-view contains no row their own
  session cannot otherwise derive — transparency, not escalation.

## (5) Saved views — client state in the doc, no server rows

**Verdict: doc state. `S.views` (and column show/hide) already round-trip through the
workspace document; persist there.**

- The store's doc-sync already carries client state blobs (the store S/D sync writes the
  doc; `mergeClientDoc` normalizes on write). Saved views are per-user UI preference but
  workspace-scoped and small — the doc is the established carrier for exactly this
  (S.views is already synced per the milestone context).
- Adding server rows would require a new table + sync discipline for data the doc sync
  already transports, for zero isolation benefit. The one real risk — doc-PUT revision
  conflicts when two tabs save views concurrently — is the existing 409
  hydrate-wins recovery, already proven (Phase 55).
- Constraint to respect: keep view blobs whitelisted/normalized in `mergeClientDoc` (the
  notifPrefs strip shows what happens when a doc field escapes its validator). Cap count
  and size (e.g. ≤20 views, ≤2 kB each) in the normalizer.

## (6) Service worker — location, build, routing

- **Lives at `public/sw.js`** — Vite copies `public/` verbatim to `dist/`, so it ships
  un-minified and un-versioned; the server serves it no-cache (already true). No build
  integration is needed *or wanted*: the SW must stay dependency-free (no imports) per
  T-48-02 — do not be tempted to run it through the Vite pipeline.
- v2.2 change: **add a `push` event listener** only. Parse the payload (pre-localized,
  server-supplied), `showNotification` with `data.url`, done. The existing
  `notificationclick` handler (origin-checked URL, focus-or-openWindow) already handles
  click-through routing — **push payloads must carry the same `/w/:slug/task/:key`
  deep-link shape as email** (LINK-01) so the router is unchanged.
- Push subscription registration joins the existing settings-page permission UX (Phase 48
  UI already has permission state + blocked badge); `pushManager.subscribe` needs the VAPID
  public key from a small `GET /api/push-config` (env-gated absent → UI hides the toggle).
- Registration path (`/sw.js`) must not be affected by code-splitting: keep the SW
  registration in `src/core/push.js`, not in any lazily-loaded chunk (a chunk that never
  loads = a browser that never registers = silent push loss).

## (7) E2E dist guard — inside `e2e/server.mjs`, not a pretest hook

**Verdict: extend the check that already exists in `e2e/server.mjs`.**

- `e2e/server.mjs` already refuses to boot without `dist/index.html` ("run `npm run build`
  before `npm run e2e`"). Add the staleness comparison at the same site: newest mtime under
  `src/`, `public/`, `index.html`, `vite.config.js` vs `dist/index.html` mtime → exit with
  the same loud message. Single enforcement point; runs for every config and every direct
  invocation of the e2e server, including `npm run e2e` and Playwright's `webServer`.
- Why not a package.json `pretest` hook: it only covers one script invocation, can drift
  from how e2e is actually launched, and a build inside pretest would *mask* staleness
  instead of failing loudly — the guard's job is to fail, not to auto-fix.

## Data Flow (new paths)

```
doc-PUT tx ──▶ newNotifs diff ──▶ queueNotifEmails (existing, post-commit, fire-and-forget)
            │                  └──▶ sendPushFor()   (new, same shape, same gating)
            └──▶ task diff ──▶ task_fts upsert/delete   (new, inside the tx)
boot ──▶ fts rebuild sweep (new)   |   boot ──▶ push_subscriptions ensureTable (new)
SW push event ──▶ showNotification ──▶ notificationclick (existing router)
Ctrl-K ──▶ GET /search?q= ──▶ memberCanReadProject filter ──▶ results
```

## Patterns to Follow

### Pattern: diff-at-the-funnel (P4-f)
Every side effect of a doc write derives from the stored-vs-next diff computed once inside
the `db.tx()` body, executed after commit, fire-and-forget. FTS sync and push fan-out are
two more consumers of the *same* diff — not new pipelines.

### Pattern: additive authority rows (Phase 34/45)
Per-user, per-browser state → own table + `ensureTable`/`ensureColumn` migration with
pre-backup and byte-identical second boot. Never a doc blob for structurally indexed data.

### Pattern: env-gated feature absence
No VAPID config → server push routes 404 and UI hides the toggle (MCP-01 pattern). No
behavior change for existing installs unless configured.

## Anti-Patterns to Avoid

- **SQLite triggers on the JSON doc** for FTS — triggers see the blob, not tasks; drift and
  stale entries guaranteed.
- **A server-side dashboard aggregate route** — duplicates redaction and read paths.
- **Saved views as new server rows** — duplicates the doc sync that already exists.
- **Running `public/sw.js` through Vite** — breaks the zero-dependency, zero-string SW
  contract and adds a cache/poisoning surface.
- **Push fan-out that suppresses or filters inbox rows** — Phase 38 invariant: email is the
  only suppressed channel; inbox and push always flow.

## Build Order (dependency-respecting)

1. **Delivery infrastructure first** — e2e dist guard + Vite code-splitting (locales via
   the existing `localeSubset` extension + heavy-page dynamic imports; SW registration kept
   eager). Rationale: every later phase's e2e runs on this; code-splitting changes what the
   bundle looks like for all subsequent verification. Small, low-risk.
2. **Saved views + column show/hide + General-Access granularity** — doc-only client work;
   no server deps; exercises the doc-PUT normalizer before bigger changes land.
3. **FTS search** — depends on (1) for verified e2e and (2)-adjacent store wiring; new
   adapter seam + funnel diff + boot sweep + redacted search route + Ctrl-K integration.
4. **Server push** — depends on nothing new being built first except the notification
   pipeline (exists), but lands after (3) so the `newNotifs` diff site isn't edited twice
   mid-milestone; needs the phase-specific RFC 8291/VAPID hand-roll spike first.
5. **Dashboard + TRN-02** — read-only, client/funnel work, no ordering risk; late because
   they benefit from i18n infra (1) and can absorb NOTIF-TRIM UI outcomes.
6. **NOTIF-TRIM** — doc/audit-driven, blocked on owner D-05 rulings; can execute in
   parallel with 4–5 once rulings arrive.
7. **i18n infrastructure** — technically a (1)-companion (dead-key gate exists in
   `scripts/i18n-scan.mjs`); do it with phase 1 so every later phase adds keys under the
   new regime rather than migrating later.

Ordering rationale: build/verification infrastructure → doc-model changes → new server
surfaces (FTS, push share the funnel diff) → read-only views → owner-blocked items last.

## Sources

- Code read directly at HEAD (HIGH confidence): `server.js` (doc-PUT tx, newNotifs diff,
  notif prefs pipeline, runReminderPass), `src/core/push.js` (client push, PUSH_TYPE_PREF,
  seen-set), `public/sw.js` (click router contract), `vite.config.js` (localeSubset, public/
  copying), `e2e/server.mjs` (existing dist check), `db-adapter.mjs` structure.
- PROJECT.md v2.2 milestone target features and standing constraints (zero runtime deps,
  zero migrations, EN+FR i18n gate, Phase 38 invariants).
- RFC 8291/8292 (Web Push encryption, VAPID) — hand-roll feasibility assessed against
  `node:crypto` surface and the oidc.js precedent (MEDIUM confidence — needs a phase spike).
