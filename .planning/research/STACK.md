# Stack Research

**Domain:** Self-hosted PM app — v2.2 additions (browser push, FTS5 search, code-splitting, saved views)
**Researched:** 2026-11-12
**Confidence:** HIGH (versions verified against npm/Node docs/Vite docs, 2026-11-10..12)

## Recommended Stack

### Core Technologies (additions for v2.2)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `web-push` (npm) | **4.0.0** (released 2026-11-10) | RFC 8291 Web Push payload encryption + VAPID JWT signing for sending push messages from `server.js` | The only mature Node implementation of the Web Push protocol (137k weekly downloads, 11 years maintained, MPL-2.0). Hand-rolling VAPID + RFC 8291 ECDH/AES128GCM encryption over `node:crypto` is feasible but a multi-week, error-prone detour — this is exactly the precedent set by `pg` (v1.10, D-12): one scoped runtime dep where a protocol demands it. v4.0.0 just dropped `mkdirp`/`del`, migrated to ESM + class syntax, and has 0 known vulnerabilities — the dependency footprint is now minimal |
| Service Worker + Push API (browser natives) | — | Receiving/decrypting push, showing notifications, click routing | Already half-built: Phase 48 shipped `sw.js` (badge/permission, notificationclick/focus handling) as a plain file in `public/` with **zero build-time SW tooling**. This milestone only extends it: `push` event handler → `registration.showNotification()` → click routes to `/w/:slug/task/:key`. No library exists or is needed on the client side |
| VAPID keys | — | Server identity for push subscriptions | `web-push` CLI: `npx web-push generate-vapid-keys` → two env vars (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, like `MASTER_KEY` — documented in DEPLOY.md, fail-closed/no-oracle when absent, mirroring the OIDC/MCP unconfigured-feature-absent pattern). Subject should be a `mailto:` on the operator's domain — v4.0.0 explicitly warns against localhost subjects |
| SQLite FTS5 via `node:sqlite` | Node ≥ 22.16 / 24+ | Full-text index over task titles + descriptions | **FTS5 is compiled into upstream `node:sqlite` only from Node 22.16.0+** (nodejs/node PR #57621; Node 22.14/22.15 and all of v23 lack it — verified against nodejs/node#56476 and maintainer cjihrig's comments, Feb–Mar 2026). Older/distro-packaged Node builds silently lack it. Mandate a Node version floor AND ship a startup behavior probe (below) |
| Vite (existing, do not upgrade blindly) | project uses Vite; latest line is **8.3.x** (rolldown-based, `advancedChunks` replaced `manualChunks`) | Code-splitting via dynamic `import()` | Vite already emits every `import()` as its own chunk; `build.chunkSizeWarningLimit` defaults to 500 kB, matching the milestone goal exactly. If the project is on Vite 8, use `build.rolldownOptions.output.advancedChunks`; on Vite ≤7, `manualChunks`. No new packages |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *none for FTS5* | — | — | FTS5 is in-box on a compliant Node. Do NOT add `better-sqlite3` just for FTS5 — it drags a native compiled module into a zero-native-deps project. If the runtime Node can't be floored to 22.16+, the LIKE fallback (below) is the answer, not a dependency |
| *none for saved views* | — | — | A small `saved_views` table through the existing `db-adapter.mjs` facade. No library |
| *none for i18n splitting* | — | — | Vite handles JSON chunks natively: `import(\`./locales/${locale}.json\`)` produces one chunk per locale. No `import.meta.glob` plugin needed beyond Vite built-ins |

## Feature-by-Feature Stack Decisions

### 1. Browser push (mentions + assignments)

- **Protocol, not platform:** this is the standard Web Push protocol (Push API + service worker + VAPID), not a vendor SDK. Works on Chrome/Edge/Firefox/Safari 16.4+ (Safari 16.4 added Web Push for installed web apps/macOS; iOS 16.4+ for home-screen apps — worth a docs note since guests on iOS Safari must add to home screen).
- **Server:** `web-push@4.0.0` — first **new runtime dependency since `pg`**. Owner-approved precedent exists (D-12 amendment). Integration seam: a `push_subs` table (additive migration, pg mirrored in the pg schema), subscription store/delete routes alongside the Phase 48 permission UX, and a `sendPush(userId, payload)` fire-and-forget helper in the notification emit path — same call site as the SMTP mirror, respecting the Phase 38 suppression + no-double-send invariants and per-type notif_prefs gating (a `push` channel key in the 17-key whitelist).
- **Client:** extend existing `public/sw.js` (NOT processed by Vite — plain file, no workbox, no build plugin). `push` event → `self.registration.showNotification(data.title, {...})`; click → `clients.openWindow('/w/:slug/task/:key')`.
- **VAPID keys:** env-var custody like `MASTER_KEY`, one-time generation documented in DEPLOY.md. Endpoint: store the public key where the settings page can read it (existing Phase 48 settings UX already derives "Browser blocked" badges — this extends to subscription).
- **Fallback if owner refuses a 2nd runtime dep:** hand-rolled VAPID (ES256 JWT via `node:crypto`) + RFC 8291 encryption is ~300–500 lines and testable against real endpoints, but it is the single riskiest piece of hand-rolled crypto the project would own. Recommendation: take the dep.

### 2. FTS5 full-text search

- **Availability (verified):** upstream Node builds enable `SQLITE_ENABLE_FTS5` from **Node 22.16.0 / 24+**. The project must (a) pin/declare `engines >= 22.16` or better `>=24`, and (b) probe at boot:
  ```js
  // in db-adapter.mjs, once, on :memory:
  db.exec('CREATE VIRTUAL TABLE _fts5_probe USING fts5(x)');
  ```
  Cache the verdict; fall back to a parameterized `LIKE` scan over the same projection table when absent (documented limitation, not a silent lie — precedent: Phase 34's documented free-text limitation).
- **External-content vs contentless vs standard:** use **external-content** (`content='tasks_projection'`, `content_rowid=id`) only if tasks become rows — **they are not**. Tasks live inside the workspace JSON doc blob, so no SQLite trigger can watch them. The right shape here is a **derived projection table**:
  - `task_fts(workspace_id, task_key, title, description)` (regular columns on SQLite; the FTS5 virtual table indexes those columns via external-content on SQLite only).
  - Maintained **transactionally inside the same write as the doc push** in `server.js` (same commit that bumps the revision), computed as a diff of the changed tasks — not a full rebuild per save.
  - One **rebuild-on-boot sweep** (idempotent, like the Phase 33/34 boot sweeps) heals drift; expose nothing for it — it just runs.
- **Multi-accent/French content:** `tokenize='unicode61'` folds diacritics (the accent-insensitive matching precedent from v1.2 M-16). Do not add porter stemming casually — it changes what tests expect; decide in phase.
- **Postgres backend:** FTS5 does not exist there. The projection table is mirrored through `db-adapter.mjs`; search on pg uses `ILIKE` over the projection (or `websearch_to_tsquery` on a generated tsvector column **only if** the pg search quality gap is proven in phase — recommend starting with ILIKE to keep the two backends behaviorally identical and the tests shared).
- **Permission funnel:** search results MUST pass `memberCanReadProject`/`hiddenFor` before reaching the client — query the projection, filter by project visibility in the same pass (never trust the client to filter).
- **Ctrl-K wiring:** new keyed endpoint (e.g. `GET /api/workspaces/:slug/search?q=`), 404-matrix per family, like every other surface.

### 3. Vite code-splitting

- **Dynamic imports:** the SPA's views/panels become `import('./views/dashboard.js')` style lazy modules; Vite splits each into its own chunk automatically. Locale JSON catalogues: `const cat = await import(\`./locales/${locale}.json\`)` — one chunk per locale (~1 711 keys today), removes them from the entry bundle. **Vite 8 warns on named imports from JSON modules** — import the default and destructure.
- **Config:** `build.chunkSizeWarningLimit` stays at the 500 kB default — that warning IS the milestone's acceptance gate. If a chunk is still over: Vite 8 → `rolldownOptions.output.advancedChunks` groups with `maxSize`; Vite 7 → `manualChunks`. Raising the limit is explicitly the wrong move (it hides, not fixes).
- **Anti-stale-dist guard (companion):** emit `.vite/manifest.json` (`build.manifest: true`) — it maps entry → hashed filenames and is the natural anti-stale signal source for the e2e server guard (compare served dist against manifest mtime/hash, refuse to serve a dist older than the built manifest). No extra dependency.
- **Service worker note:** `public/sw.js` is copied verbatim by Vite (`copyPublicDir`) and never chunk-split — keep it out of any splitting strategy; only its consumers change.

### 4. Saved views (column show/hide + view presets)

- **Server-side rows, not the workspace doc:** storing views inside the workspace JSON doc would (a) bump the shared revision on every personal view tweak → optimistic-concurrency churn and cross-user conflicts, and (b) leak other members' views through `redactDoc`/`mergeClientDoc`. Follow the **Phase 34 `notif_prefs` precedent exactly**: additive migration creating `saved_views(workspace_id, user_id, name, view_json, created_at)` with a keyed GET/PUT/DELETE route family behind `requireWorkspace`, whitelist-validated `view_json`. Multi-device correctness for free; matches the project's per-user-preference pattern.
- **Client:** views are plain objects in `src/`; localStorage is explicitly NOT used (Phase 34 removed doc-based prefs for exactly this class of problem — don't reintroduce it).
- **General-Access granularity** rides the existing `p.perms['team:'+id]` / per-person perms model (M-09/D-53-1) — no stack addition at all.

## Installation

```bash
# The ONLY new runtime dependency in this milestone
npm install web-push@^4.0.0

# Dev: nothing new. (If bundle inspection is wanted during the splitting phase:)
npm install -D rollup-plugin-visualizer
```

Env additions (DEPLOY.md): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:). Node engine floor: `>=22.16` (recommend `>=24` LTS).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `web-push@4.0.0` runtime dep | Hand-rolled VAPID + RFC 8291 over `node:crypto` | Only if owner vetoes the second runtime dep; budget 300–500 lines of crypto + interop testing against Chrome/Firefox/Apple endpoints |
| `web-push` | Firebase Cloud Messaging SDK (`firebase-admin`) | Never — it drags a Firebase account, vendor lock-in and a huge dep tree for what is one HTTP call |
| FTS5 + LIKE fallback in `node:sqlite` | `better-sqlite3` (bundles FTS5) | Only if forced onto Node <22.16 permanently; it's a native compiled module — breaks the zero-native-deps Docker story |
| FTS5 | External search engine (Meilisearch, Typesense) | Never for this milestone — a second stateful service contradicts the single-image self-hosted model |
| Projection table + transactional diff | Contentless FTS5 table rebuilt on boot | Never: contentless tables store only the index (can't recover text), so drift heals require re-reading the doc anyway |
| Server-side `saved_views` rows | localStorage / workspace-doc field | localStorage: multi-device loss + doc drift; doc field: revision churn + redaction complexity |
| Vite native dynamic import | `workbox-*` / `vite-plugin-pwa` | Only if the SW grows precaching ambitions; today's SW is hand-maintained by design (Phase 48, zero tooling) |
| pg `ILIKE` on projection | pg tsvector / `websearch_to_tsquery` | If pg search quality is proven worse in phase testing — keep backends behaviorally identical until then |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `vite-plugin-pwa`, workbox | Build-time SW generation would rewrite the hand-built Phase 48 `sw.js` and add tooling the project explicitly avoids | Plain `public/sw.js`, extended in place |
| `better-sqlite3` (solely for FTS5) | Native addon, node-gyp/ABI churn, contradicts `node:sqlite` default | Node engine floor (≥22.16) + boot probe + LIKE fallback |
| Trigger-based FTS sync | Tasks are JSON-blob fields, not rows — no trigger ever fires | Transactional projection diff inside the doc-push commit |
| localStorage for saved views | Multi-device loss; project already moved prefs server-side in Phase 34 | `saved_views` table via db-adapter |
| Raising `chunkSizeWarningLimit` | Hides the problem; the 500 kB warning is this milestone's gate | Split the chunk (dynamic import / `advancedChunks`), keep 500 |
| Named imports from JSON (`import { x } from './a.json'`) | Vite 8 warns; destructure the default instead | `const cat = await import(...); cat.default` |

## Stack Patterns by Variant

**If the deployment Node is < 22.16:** search degrades to `LIKE` over the projection table (probe-verified at boot, logged loudly); no dependency added, UX difference documented (no stemming/ranking, substring matching).

**If the owner accepts `web-push` (recommended):** push ships as a normal feature phase — subs table, VAPID env, emit-path hook, sw.js extension, DEPLOY.md section.

**If the owner vetoes `web-push`:** make push its own phase with the hand-rolled crypto isolated in one module (`push-crypto.mjs`, like `oidc.js`) so it can be swapped for `web-push` later; phase must include interop tests against at least Chrome + Firefox + Web Push from a real endpoint.

**If Vite is on v8 (rolldown):** use `advancedChunks` and the manifest-based dist guard; if on ≤ v7: `manualChunks`, and verify `manifest` option exists in that line before wiring the guard to it.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `web-push@4.0.0` | Node ≥ 20 (ESM-native, class API; CLI via `npx`) | Major bump from 3.6.7 (Jan 2024) — ESM migration means import style changes if any docs show `require()`; check API surface (`sendNotification`, `generateVAPIDKeys`) still exported |
| FTS5 in `node:sqlite` | Node ≥ 22.16.0, all 24.x, 25.x (RC stability), 26.x | NOT in 22.14/22.15, not in any 23.x (v23 EOL May 2025); distro-packaged Node may still strip it — probe, don't trust `pragma_compile_options` |
| Vite 8.3.x | Node ≥ 20.19 / 22.12+ (rolldown-based) | `advancedChunks` replaces `manualChunks`; JSON named imports warned |
| `pg` (existing) | unchanged | No new pg-native features required for any v2.2 feature |

## Sources

- npm `web-push` — v4.0.0 released 2026-11-10, ESM migration, dep drop (mkdirp/del), 0 vulnerabilities (npm/Snyk/GitHub releases) — HIGH
- nodejs/node#56476 + nodejs/node PR #57621, comments by cjihrig (Feb–Mar 2026): FTS5 enabled in Node ≥ 22.16.0 / 24+ — HIGH
- Node.js v26.13.1 `node:sqlite` docs (stability 1.2 RC, Database options) — HIGH
- Vite docs `build-options` (chunkSizeWarningLimit default 500, manifest, target `baseline-widely-available` 2026) + vite CHANGELOG v8.3.8 (2026-11-11) — HIGH
- SQLite FTS5 external-content/contentless semantics (community-verified, dev.to field guides Oct 2026 cross-checked with SQLite docs) — MEDIUM-HIGH
- Safari/iOS Web Push availability (Safari 16.4+ / iOS 16.4+ home-screen requirement) — MEDIUM, verify in phase UAT on a real device

---
*Stack research for: gr8r v2.2 — Notifications, Search & Delivery*
*Researched: 2026-11-12*
