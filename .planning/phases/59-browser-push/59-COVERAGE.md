# API Coverage — web-push / browser Push API

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Source of capabilities: web-push@4.0.0 public API + browser Push API / ServiceWorker surface.

## Server: `web-push@4.0.0`

| capability | decision | reason |
|---|---|---|
| `webpush.generateVAPIDKeys()` | `INTEGRATE` | PUSH-05 boot custody generates keys on first run (Pattern 3) |
| `webpush.setVapidDetails(subject, pub, priv)` | `INTEGRATE` | VAPID identity for every send; `VAPID_SUBJECT` mailto: per Pitfall 2 |
| `webpush.sendNotification(sub, payload, opts)` | `INTEGRATE` | The core send path for PUSH-02/03 (sendPushFor + test-send route) |
| `WebPushError.statusCode` (404/410 detection) | `INTEGRATE` | PUSH-04 dead-subscription sweep rides exactly this signal |
| aes128gcm payload encryption (RFC 8291 internals) | `INTEGRATE` | Implicit inside sendNotification; hand-rolling forbidden (STACK.md) |
| `web-push` CLI (`npx web-push generate-vapid-keys`) | `OPT-OUT` | Boot-time `generateVAPIDKeys()` covers custody; CLI is a manual fallback documented in DEPLOY.md §16 only |
| Legacy `gcm`/`FCM` API key options | `OPT-OUT` | Browser Web Push only; no Chrome proprietary legacy channel wanted |
| Proxy / HTTP options param of `sendNotification` | `OPT-OUT` | Self-hosted push services not in scope; default fetch path suffices |
| `webpush.generateRequestDetails` (low-level request inspection) | `OPT-OUT` | Test mocks stub `sendNotification` directly; no need for request-level seam |

## Client: Push API + Service Worker

| capability | decision | reason |
|---|---|---|
| `pushManager.subscribe({ userVisibleOnly, applicationServerKey })` | `INTEGRATE` | PUSH-01 opt-in via master toggle (D-02) |
| `Notification.requestPermission()` | `INTEGRATE` | Settings-only, user-gesture driven (D-01) — never on load |
| `navigator.serviceWorker.ready` registration reuse | `INTEGRATE` | Existing eager SW registration (Phase 48); subscribe rides it |
| SW `push` event listener | `INTEGRATE` | PUSH-02/03 tab-closed delivery (D-12 suppression, display) |
| `registration.showNotification(title, opts)` | `INTEGRATE` | Ticker display: icon/tag/data per existing client path |
| `clients.matchAll({type:'window', includeUncontrolled:true})` suppression | `INTEGRATE` | D-12/D-13: any open client = visible-tab path owns delivery |
| `notificationclick` deep-link | `INTEGRATE` (already shipped) | Phase 48 router reused unchanged (D-15) |
| `pushManager.getSubscription()` state read | `INTEGRATE` | Master-toggle render + device list state reconciliation |
| `pushManager.unsubscribe()` | `INTEGRATE` | Master-toggle OFF path (D-07 discretion: explicit unsubscribe) |
| `pushmanagerpermissionstate` change events / `permissionstatechange` | `OPT-OUT` | Derived blocked badge already re-reads permission per render (D-48-4); no listener needed |
| Background sync / periodicsync | `OPT-OUT` | No offline queuing in scope; fan-out is server-side |
| Notification `renotify`/`silent`/`vibrate`/`actions` options | `OPT-OUT` | D-14: plain one-push-per-row ticker; actions/stacking = Phase 61 |
| Payload `data` beyond `{url,title,body,tag,test}` shape | `OPT-OUT` | D-16/D-17/D-18 budget discipline: ticker only, ≤4096 octets |

**Deferred (not opt-outs, out-of-phase scope):** burst coalescing / tag stacking (Phase 61), avatar icons, editable device labels (CONTEXT.md deferred list).
