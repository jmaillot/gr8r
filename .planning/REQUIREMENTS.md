# Requirements — Milestone v2.7 Installable App (PWA)

Owner-validated 2026-11-18. Research ground truth: `.planning/research/SUMMARY.md`.

**Milestone goal:** make the self-hosted app installable on desktop and mobile as a real app —
the browser tab experience in a standalone window, with no offline cache.

**Standing constraints (every phase):** zero new runtime or dev dependencies; 500 kB chunk gate
(~2 kB headroom — banner JS lazy or minimal); EN+FR i18n keys same commit; **zero edits to
`public/sw.js`** (pinned structural tests in `test/browser-push.test.mjs` forbid
`fetch|install|activate|import` tokens — the existing push SW is already the pass-through
install SW); root-domain deployments only (absolute manifest paths frozen).

## v2.7 Requirements

### Manifest & Integration

- [x] **PWA-01**: The app ships a valid web app manifest (`public/manifest.webmanifest`, served
  no-cache with correct MIME): name/short_name "Projects Studio", `start_url` and `id` of `/`,
  `display: standalone`, theme/background colors consistent with the existing tokens, and the
  full icon set referenced. `index.html` gains the manifest link, theme-color meta and iOS meta
  tags; the per-workspace logo favicon swap (D-06 boundary) is unaffected.

### Icons

- [x] **PWA-02**: Real PNG icons rasterized from the existing brand mark are committed under
  `public/`: 192×192 and 512×512 with `purpose: any`, 192×192 and 512×512 dedicated
  maskable variants (padded safe-zone redesign, not blind padding), and a 180×180
  `apple-touch-icon`. Maskable icons render without clipping on Android adaptive launchers.

### Service Worker Verification (no build work)

- [ ] **PWA-03**: Installability's service-worker requirement is met by the EXISTING push
  service worker (`public/sw.js`, root scope, registered from `src/core/push.js`) with zero
  code changes. Verification pins: sw.js served at `/sw.js` with no-cache, registered with
  `scope === '/'`, registration not broken by the push-gated path, and sw.js byte-identical
  to the Phase 48/59 contract (forbidden-token test still green).

### Install Hint Banner

- [x] **PWA-04**: On browsers that fire `beforeinstallprompt` (Chromium desktop/Android), the
  app shows an honest install affordance (banner or Settings entry, EN+FR catalogued) whose
  activation triggers the native install prompt; accepting installs the standalone app.
  On iOS and Firefox, which never fire the event, the affordance either does not appear or
  shows platform-appropriate static instructions ("Share → Add to Home Screen" on iOS) —
  never a broken or lying prompt.

## Future Requirements (deferred)

- App shortcuts in the manifest (`shortcuts`) — pending a non-workspace-scoped route decision
- `share_target` / protocol handlers
- Offline caching of any kind (owner decision: strictly online)
- Scheduled report emails / dashboards (explored this cycle, explicitly out of scope)

## Out of Scope (explicit exclusions)

- **Any caching in the service worker** — precache, runtime cache, offline pages. The SW stays
  the contract-frozen push router; caching would re-open the T-48-02 cache-poisoning surface.
- **A second service worker** — one SW per scope; push and install share the existing one.
- **sw.js lifecycle listeners** (`skipWaiting`/`clients.claim`) — unnecessary without a fetch
  handler and structurally forbidden by pinned tests.
- **iOS splash-screen matrix and safe-area polish** beyond the meta tags — accepted as-is.
- **Dashboards/reports** (personal dashboard, project report view, scheduled report email) —
  explored and explicitly dropped by the owner this cycle.
- **Subpath deployments** — DEPLOY.md documents root-domain deploys; absolute paths frozen.

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PWA-01 | Phase 72 | Complete |
| PWA-02 | Phase 72 | Complete |
| PWA-03 | Phase 74 | Pending |
| PWA-04 | Phase 73 | Complete |

Coverage: 4/4 v1 requirements mapped, no orphans, no duplicates.
