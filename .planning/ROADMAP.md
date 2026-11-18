# Roadmap: Projects Studio

## Milestones

- 🚧 **v2.7 Installable App (PWA)** — Phases 72-74, started 2026-11-18 (current)
- ✅ **v2.6 Exports Verification (Test 11)** — Phase 69: real MS Project round-trip proof (A1 closed), Phase 70: subtasks in Timeline/Board XLSX, Phase 71: subtask columns in List view (shipped 2026-11-18) — [archive](milestones/v2.6-ROADMAP.md)
- ✅ **v2.5 Template Polish & Import** — 67-05/06/07 quick work: favourites, MD import with complete per-kind examples, starters toggle, 65-05 indent fix (shipped 2026-11-16) — [archive](milestones/v2.5-ROADMAP.md)
- ✅ **v2.4 Automation & Productivity** — Phases 65-68 (shipped 2026-11-16) — [archive](milestones/v2.4-ROADMAP.md)
- ✅ **v2.3** — shipped (see `.planning/milestones/`)

## Phases

- [x] **Phase 72: Manifest, Icons & Head Integration** - Inert static install assets: web manifest, PNG icon set from the brand mark, index.html head tags (completed 2026-11-18)
- [ ] **Phase 73: Install Hint Banner** - Honest install affordance on `beforeinstallprompt` browsers with graceful iOS/Firefox degradation (the only JS surface)
- [ ] **Phase 74: Service Worker Verification & Milestone Acceptance** - Verify the existing push SW satisfies installability untouched, plus end-to-end acceptance and real-device UAT

## Backlog

- Manifest `shortcuts` (needs a non-workspace-scoped route decision)
- `share_target` / protocol handlers
- Offline caching of any kind (owner decision: strictly online)
- Scheduled report emails / dashboards (explored this cycle, explicitly dropped)
- Phase 999.1 (Phase 65 UAT Test 11 — exports in MS Project, carried from v2.4)

## Standing Constraints (all phases)

- Zero new runtime or dev dependencies
- **Zero edits to `public/sw.js`** — pinned structural tests in `test/browser-push.test.mjs` forbid the tokens `fetch|install|activate|import` (even in comments) and pin byte-identical substrings; any sw.js diff is a STOP-and-justify event
- 500 kB chunk gate (~2 kB headroom, entry at 499,995/500,000) — banner JS lazy via the D-02 pattern, entry delta target < 200 bytes
- EN+FR i18n keys in the same commit (i18n gate)
- Root-domain deployments only — absolute manifest paths (`start_url`/`scope`/`id` = `/`) frozen
- No offline caching of any kind (owner decision: strictly online); no second service worker; no SW lifecycle listeners

## Phase Details

### Phase 72: Manifest, Icons & Head Integration

**Goal**: The app presents itself as an installable web app — a valid manifest, a complete
icon set derived from the existing brand mark, and the HTML head integration every platform
reads — all as inert static assets with zero JS and zero gate risk.
**Depends on**: Nothing (first phase)
**Requirements**: PWA-01, PWA-02
**Success Criteria** (what must be TRUE):
  1. `GET /manifest.webmanifest` returns valid JSON with the correct
     `application/manifest+json` MIME and no-cache headers; its `name`/`short_name` is
     "Projects Studio", `display` is `standalone`, and `start_url`/`scope`/`id` are `/`
     (frozen and pinned by a static contract test)
  2. The five PNG icons exist under `public/` (192/512 `any`, 192/512 maskable, 180
     apple-touch-icon), referenced by the manifest; the maskable variants use a padded
     safe-zone redesign and render without clipping on Android adaptive launchers
  3. `index.html` carries the manifest link, `theme-color` meta and iOS meta tags, with
     theme/background colors consistent with the existing design tokens
  4. The per-workspace logo favicon swap (Phase 43 D-06 boundary) is unaffected — every
     existing favicon test stays green; unit + lint + i18n + chunk gates all pass unmodified
**Plans**: 2/2 plans complete

Plans:
**Wave 1**
- [x] 72-01-PLAN.md — Manifest file + 3-touch server.js diff + index.html head tags, pinned by contract test and e2e live header check

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 72-02-PLAN.md — Five-PNG icon set rendered from favicon.svg (D-07 owner approval) + icon contract test

**UI hint**: yes

### Phase 73: Install Hint Banner

**Goal**: On browsers that can install the app, users get an honest in-app install
affordance that triggers the real native prompt; on browsers that cannot (iOS, Firefox),
they either see nothing or platform-appropriate manual instructions — never a broken or
lying prompt.
**Depends on**: Phase 72 (an incomplete manifest means no `beforeinstallprompt` — the
banner silently never fires)
**Requirements**: PWA-04
**Success Criteria** (what must be TRUE):
  1. On a browser firing `beforeinstallprompt` (stubbed in e2e — the real event never
     fires in Playwright), the install banner appears in EN and FR, and activating it
     triggers the native install prompt
  2. Accepting the native prompt installs the standalone app; the banner suppresses
     itself on `appinstalled`, on user dismissal (persisted, non-nagging), and when the
     app is already running standalone
  3. On iOS, the affordance shows static "Share → Add to Home Screen" instructions
     (feature-based detection, not timeout-based); on Firefox it never appears — no
     fake or dead prompt on any platform
  4. Banner logic is a lazy chunk (entry delta < 200 bytes, chunk gate green) and every
     banner string is catalogued EN+FR in the same commit (i18n gate green)
**Plans**: TBD
**UI hint**: yes

### Phase 74: Service Worker Verification & Milestone Acceptance

**Goal**: Installability's service-worker requirement is proven satisfied by the EXISTING
push service worker with zero code changes, and the whole milestone is accepted
end-to-end on real devices.
**Depends on**: Phase 72, Phase 73
**Requirements**: PWA-03
**Success Criteria** (what must be TRUE):
  1. `public/sw.js` is byte-identical to the Phase 48/59 contract — served at `/sw.js`
     with no-cache, registered with `scope === '/'` from `src/core/push.js` on all boot
     paths, registration not broken by the push-gated path; the forbidden-token contract
     test (`test/browser-push.test.mjs`) stays green
  2. Header/registration pins are locked by new static tests (sw.js + manifest no-cache,
     one `serviceWorker.register` call site, manifest scope agrees with SW scope) so the
     pass-through SW contract is regression-proof
  3. DEPLOY.md documents the PWA posture: root-domain-only deployment constraint, iOS
     limitations (no `beforeinstallprompt`, manual Add to Home Screen), standalone
     no-back-button stance, and the strictly-online/no-caching decision
  4. Real-device UAT passed (human_needed): the app installs and launches standalone on
     desktop Chrome and Android Chrome; iOS shows the honest manual-install path; push
     notifications still work after all changes
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 72. Manifest, Icons & Head Integration | 2/2 | Complete    | 2026-11-18 |
| 73. Install Hint Banner | 0/? | Not started | - |
| 74. Service Worker Verification & Milestone Acceptance | 0/? | Not started | - |
