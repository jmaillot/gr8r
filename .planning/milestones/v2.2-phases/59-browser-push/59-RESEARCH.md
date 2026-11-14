# Phase 59: Browser Push - Research

**Researched:** 2026-11-13
**Domain:** Web Push protocol (VAPID + RFC 8291) integrated into an existing Node monolith with a zero-dependency discipline, dual SQLite/pg adapter, and a Phase 48 notification foundation
**Confidence:** HIGH (codebase claims verified by direct file reads this session; protocol claims from milestone research + RFCs)

## Summary

Phase 59 adds server-sent Web Push to a system that already has: a minimal service worker (`public/sw.js`, 28 lines, zero-strings contract), a foreground poll/toast path (`src/core/push.js` with seen-set discipline), per-user `push_*` prefs in `user_notif_prefs` rows, two proven fan-out sites (the doc-PUT `newNotifs` diff beside `queueNotifEmails`, and `runReminderPass`), and the `tFor()` server-side localization funnel. The phase is **integration, not greenfield**: every architectural pattern needed has a first-party precedent.

The stack decision is pre-locked: `web-push@4.0.0` is runtime dependency #2 (owner-approved, D-12 amended — STATE.md). This session verified v4.0.0 exists on npm (published 2026-11-06, ~13.7M weekly downloads, repo `web-push-libs/web-push`, no postinstall script). **However, the exact-pin dependency contract test currently fails if you add it**: `test/dependencies.test.mjs` asserts `dependencies` is **exactly** `{ @office-kit/xlsx, pg }` and must be updated in the same phase (verified: test/dependencies.test.mjs:32-44).

One naming trap the plan must handle precisely: **`push_due` does not exist in the current prefs whitelist.** G-37-2 removed it (test/notif-hydration.test.mjs:113-124 asserts it is *dropped* as a legacy key; test/notif-prefs.test.mjs:78 asserts the PUT rejects it). D-09 re-livens it, so the phase must **re-add `push_due` to `NOTIF_PREF_KEYS` + `NOTIF_PREF_DEFAULTS`** (server.js:1566-1621), update the merge/drop tests that pin its absence, and add the Settings row. The client `PUSH_TYPE_PREF` map (`src/core/push.js:28`) gains `due_reminder: 'push_due'` / `past_due: 'push_due'` **only for the foreground path's future** — actually D-09 keeps the foreground path unchanged (reminders still never foreground-toast), so `PUSH_TYPE_PREF` stays as-is client-side; only the **server** reads `push_due` at the reminder fan-out site.

**Primary recommendation:** Build in four layers — (1) infra: `push_subscriptions` table through the dual-backend SCHEMA mirror + VAPID env/config custody in /data + `/api/me/push-subscriptions` routes; (2) SW + subscribe client: extend `public/sw.js` with the `push` handler (D-12 suppression, D-15 click), extend the settings `notif-push` case with master toggle, device list, per-device test push; (3) fan-out: `sendPushFor()` beside `queueNotifEmails` at both sites with the 404/410 sweep in the same pass; (4) runbook + tests: DEPLOY.md §16-adjacent section, payload ≤4096-octet test, restart test, sweep test.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
(D-01..D-18, copied from 59-CONTEXT.md — planner MUST honor verbatim)

- **D-01:** Permission prompt lives **Settings-only** (Settings › Notifications › Push tab). No first-mention in-context nudge, never on page load.
- **D-02:** Two-layer UI: a top-level **master enable** toggle (drives `requestPermission` + PushManager.subscribe) with the per-type mention/assign/comment/reminder toggles below as delivery prefs only.
- **D-03:** The Push tab shows a **visible device list** — every subscription of the member with a human label and created/last-seen info.
- **D-04:** Device label is **client-chosen at subscribe time** (e.g. "MacBook — Chrome") and stored with the row; not editable afterwards.
- **D-05:** PUSH-01's test push is **per-device**: each device row gets its own "send test" action, proving that exact subscription endpoint.
- **D-06:** The test push exercises the **real payload/display path** (same SW route, same ticker format) tagged as a test.
- **D-07:** Turning push prefs off **gates delivery only**; subscriptions persist until the 404/410 sweep or explicit unsubscribe.
- **D-08:** **All four notification types** fire server push: mentions, assignments, comments, due-reminders — each honoring its per-type push pref.
- **D-09:** **Standing ruling G-37-2 is amended**: `push_due` becomes the live reminder-push pref. Client foreground behavior unchanged (reminders still never foreground-toast).
- **D-10:** Reminder pushes respect the **Phase 38 digest/suppression invariants** exactly like email: inbox rows never suppressed, digest users get push per digest cadence rules.
- **D-11:** Push mirrors the email fan-out gating: **self-action suppression** and a **`memberCanReadProject` re-check at send time**.
- **D-12:** The SW `push` handler checks for **any open client of this origin** (`clients.matchAll`) and **skips the OS notification** when one exists.
- **D-13:** Suppression is **best-effort inside the SW** — no page↔SW handshake; a rare duplicate while switching tabs is acceptable.
- **D-14:** **One push per notif row** — no burst aggregation (Phase 61 owns it).
- **D-15:** Click path unaffected by suppression: `notificationclick` always deep-links to `/w/:slug/task/:key`.
- **D-16:** Title carries the **sender + action**, pre-localized via `tFor`: "Élodie mentioned you" etc. **Display name only — no avatar icon.**
- **D-17:** Body carries the **task key + title** only, e.g. "WEBS-42 Fix login redirect". Never task bodies.
- **D-18:** Truncate the task title to ~120 chars after localization; **assert serialized payload ≤ 4096 octets in tests** with pathological FR strings.

### the agent's Discretion
- Exact truncation mechanics (within D-18's assert-test constraint)
- Last-seen tracking mechanics (created_at always; last-seen optional if cheap)
- Whether the master-enable toggle also offers explicit unsubscribe (D-07 permits either)
- SW suppression check details (`clients.matchAll` type/windowClient options)
- Which existing icon/badge assets the notification reuses (`/favicon.svg` is the Phase 48 icon — the natural default)
- Test-push "test" marker mechanics (server-side tag in title, still string-free SW)

### Deferred Ideas (OUT OF SCOPE)
- Burst coalescing / per-task notification stacking — Phase 61 (D-14)
- Avatar icons on notifications
- Editable device labels
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUSH-01 | Settings-only explicit opt-in reusing the Phase 48 surface, per-device test push | settings.js:522-535 `notif-push` case is the surface; master toggle wraps `Notification.requestPermission` (the existing `IN.npToggle` pre-step pattern, browser-push.test.mjs:307-317) + `pushManager.subscribe` with `applicationServerKey` from a new env-gated config route |
| PUSH-02 | Tab-closed push on mention/assign honoring prefs | `sendPushFor()` cloned from `queueNotifEmails` gating (server.js:1664-1752), hooked at the `newNotifs` diff site (server.js:5483, 5513) |
| PUSH-03 | Ticker ≤4096 octets, never task bodies, deep-link click | Payload `{url, title, body}` pre-localized via `tFor`; `notificationclick` router already exists in sw.js:10-28 |
| PUSH-04 | 404/410 dead-subscription sweep on send failure | `web-push` throws `WebPushError` with `statusCode` — sweep in the send pass, mirroring the Phase 27 `reminders_sent` transactional pattern |
| PUSH-05 | VAPID keys persist across restarts, DEPLOY.md runbook | env-overridable + /data-persisted key file, MASTER_KEY custody precedent (docs/DEPLOY.md §13); restart test required |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Push subscription storage | Database/Storage (adapter) | API/Backend routes | Rows-not-doc (Phase 34 ruling); per-browser, high-churn, needs endpoint uniqueness |
| VAPID key custody | Server (boot) | — | Identity material, /data durability class like MASTER_KEY (Pitfall 2) |
| Push send/fan-out + sweep | API/Backend | — | Same gating/funnel as email fan-out; never blocks response (P4-f) |
| Notification display + suppression | Service Worker | — | Only the SW can show notifications when the tab is closed (D-12) |
| Opt-in UX, device list, test push | Browser/Client (settings page) | API/Backend | Extends the Phase 48 permission surface; server routes execute test sends |
| Deep-link routing | Service Worker | — | Existing `notificationclick` router, unchanged (D-15) |
| Localization of ticker | API/Backend (`tFor`) | — | SW holds zero strings (T-48-02) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `web-push` | **4.0.0** (pinned exact per the dependency contract style: D-12 amendment) | RFC 8291 payload encryption (aes128gcm) + VAPID ES256 JWT signing + `generateVAPIDKeys` CLI | Only mature Node Web Push implementation; owner-approved runtime dep #2 (STATE.md locked decision) |
| Service Worker + Push API (browser natives) | — | `push` event, `PushManager.subscribe`, `showNotification`, `clients.matchAll` | Already half-built (sw.js); no client library exists or is wanted |
| `node:crypto` | built-in | Only if any key-file integrity is wanted (not required by web-push itself) | Zero-dep discipline |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none | — | — | No other additions. Do NOT add `vite-plugin-pwa`/workbox (STACK.md explicitly rejects: would rewrite the hand-built sw.js) |

**Installation:**
```bash
npm install web-push@4.0.0   # exact pin — matches the D-12/dep-contract style (plain dependency, never optional)
```

**Version verification (this session):** `npm view web-push version` → `4.0.0`; `time` map shows 4.0.0 published **2026-11-06** (3.6.7 was 2024-01-16). Node runtime is **v24.21.0** — web-push@4 ESM is compatible (Node ≥ 20). [VERIFIED: npm registry this session]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| web-push | npm | published 2026-11-06 (v4.0.0; package itself 11+ yrs) | ~13.7M/wk | github.com/web-push-libs/web-push | **SUS** (reason: "too-new" — the 4.0.0 major is days old) | **Approved with flag** — the package is pre-locked by an owner decision (D-12 amendment in STATE.md, REQUIREMENTS.md line 3), 13.7M weekly downloads, canonical repo, no postinstall. The SUS verdict is purely the major-version age. Planner must still add a `checkpoint:human-verify` task before install per protocol, or record the pre-lock as the verification. |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `web-push` — flagged on version age only; owner pre-approval is on record. Alternative if the operator balks at 4.0.0: pin `web-push@3.6.7` (proven since Jan 2024, CJS) — but STATE.md names 4.0.0 explicitly, so 4.0.0 is the plan default.

## Architecture Patterns

### System Architecture Diagram

```
 Settings master toggle (user gesture, D-01)
   └─▶ requestPermission + pushManager.subscribe(vapidPublicKey)
         └─▶ POST /api/me/push-subscriptions {endpoint, p256dh, auth, label}
               └─▶ push_subscriptions row (workspace_id, user_id, endpoint UNIQUE,
                   keys, label, created_at)

 Doc-PUT funnel ──▶ db.tx: newNotifs diff (server.js:5483)
   └─ after commit ──▶ sendPushFor(row, next, newNotifs)   [NEW, beside queueNotifEmails:5513]
 runReminderPass (server.js:1897 site)
   └─ after commit ──▶ sendPushFor(ws, nextDoc, [notif])    [reminder site, push_due gate]

 sendPushFor per recipient:
   prefs gate (push_mention/assign/comment/due via getUserNotifPrefs)
   ──▶ self-suppression (n.by === n.to skip)
   ──▶ memberCanReadProject re-check (D-11)
   ──▶ tFor(local, 'notif.push.*', vars)  → title; "KEY-12 title" → body (D-16/D-17)
   ──▶ truncate body ≈120 chars (D-18)
   ──▶ webpush.sendNotification(sub, JSON payload, {vapid})  fire-and-forget
         ├─ ok → done
         └─ 404/410 → DELETE push_subscriptions row (same pass, PUSH-04)

 Browser (tab closed) ──▶ sw.js 'push' event
   └─ clients.matchAll({type:'window'}) non-empty → skip (D-12)
   └─ else showNotification(title, {body, tag:'gr8r-<notifId>', icon:'/favicon.svg',
              data:{url}})  ──▶ notificationclick (EXISTING router, sw.js:10-28)
              ──▶ focus-or-open /w/:slug/task/:key (D-15)
```

### Recommended Project Structure
```
public/sw.js                     # +push handler (extend in place; NO build tooling)
server.js                        # SCHEMA entry, boot custody, routes, sendPushFor, fan-out hooks
db-adapter.mjs                   # SQLITE_SCHEMA + pg variant + PK map entry for push_subscriptions
src/core/push.js                 # subscribe/unsubscribe client helpers (rides the lazy push chunk)
src/pages/settings.js            # notif-push case: master toggle, device list, per-device test
docs/DEPLOY.md                   # new §16 runbook: VAPID generation/custody
test/browser-push.test.mjs       # extend (SW contract tests pin the file's shape)
test/push-server.test.mjs        # NEW: fan-out, sweep, payload budget, VAPID custody
```

### Pattern 1: Fan-out beside queueNotifEmails (P4-f)
**What:** `sendPushFor(wsRow, nextDoc, newNotifs)` — same signature shape, same per-recipient gates, fire-and-forget after commit with `.catch(err => logWarn(...))`.
**When to use:** Both fan-out sites. Reminder site note: `runReminderPass` currently calls `queueNotifEmails` only under `if (MAILER.enabled)` — push must NOT be gated on MAILER.enabled; it needs its own enabled flag (`VAPID` configured).
**Example skeleton:**
```js
// server.js — beside queueNotifEmails (gating cloned from lines 1664-1752)
const PUSH_NOTIF_KIND = { mention: 'push_mention', assign: 'push_assign', comment: 'push_comment', due_reminder: 'push_due', past_due: 'push_due' };
async function sendPushFor(wsRow, nextDoc, newNotifs) {
  if (!PUSH.enabled) return;
  for (const n of newNotifs) {
    if (n.by === n.to) continue;                          // D-11 self-suppression
    const prefKey = PUSH_NOTIF_KIND[n.type];
    if (!prefKey) continue;
    const prefs = await getUserNotifPrefs(authority.get(n.to)?.user_id || n.to, wsRow.id);
    if (!prefs[prefKey]) continue;                        // note: push prefs default TRUE in NOTIF_PREF_DEFAULTS
    const projectId = n.project || task?.project || null;
    if (projectId && !(await memberCanReadProject(projectById.get(projectId), wsRow.id, n.to))) continue; // D-11
    const title = tFor(recipientLocale, 'notif.push.title', { name, action });  // D-16
    const body = `${task.key} ${truncatedTitle}`;         // D-17 + D-18
    const payload = JSON.stringify({ url, title, body, test: !!isTest });
    assertPayloadBudget(payload);                         // ≤4096 octets, D-18 (dev/test assert)
    for (const sub of await db.all('select * from push_subscriptions where workspace_id = ? and user_id = ?', [wsRow.id, recipientUserId])) {
      try { await webpush.sendNotification(subToWebPushFormat(sub), payload, { vapid: PUSH.vapid }); }
      catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) await db.run('delete from push_subscriptions where endpoint = ?', [sub.endpoint]); // PUSH-04
        else logWarn(`push ${n.id}: ${err.message}`);
      }
    }
  }
}
```

### Pattern 2: Dual-backend table via SCHEMA mirror
**What:** Add `push_subscriptions` to **both** `server.js` SCHEMA (~line 389 region, `create table if not exists`) and `db-adapter.mjs` `SQLITE_SCHEMA` + the pg variant + the PK map (db-adapter.mjs:42-44). The mirror-sync test pins the pair so neither drifts [VERIFIED: db-adapter.mjs:140-150].
**Schema (from milestone ARCHITECTURE.md §2, pre-locked):**
```sql
create table if not exists push_subscriptions (
  workspace_id text not null,
  user_id      text not null,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  label        text not null default '',
  created_at   text,
  last_seen_at text
);
```
Plan choice: composite lookup key `(workspace_id, user_id)` in the PK map (like `user_notif_prefs`) or per-endpoint. Endpoint must be UNIQUE — a re-subscribe to the same endpoint replaces (`insert or replace`, the established composite-PK pattern db-adapter.mjs:42-44 documents). The D-04 label and D-03 created/last-seen columns ride the same table — no second migration.

### Pattern 3: VAPID custody — env-overridable, /data-persisted
**What:** On boot: if `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` env set → use them (fail-absent discipline, same class as SMTP/MASTER_KEY). Else if `/data/vapid-keys.json` exists → load it. Else → generate via `webpush.generateVAPIDKeys()` and write the JSON file into `DATA_DIR`; **never regenerate when a stored key exists** (Pitfall 2). Log loudly at first generation. Unconfigured-and-unpersistable (read-only /data) → feature absent (no config route content, UI hides the toggle).
**Why both:** Pitfall 2 (restart must not orphan subscriptions) is a hard success criterion; env-only custody recreates the MASTER_KEY-v1.5 mistake. MASTER_KEY precedent: docs/DEPLOY.md §13 "Key custody & rotation" is the runbook model [VERIFIED: docs/DEPLOY.md exists, §13 at line 757; file lives at docs/DEPLOY.md, not repo root].

### Pattern 4: SW push handler — extend, don't redesign (T-48-02)
**What:** One new listener. Existing static-contract tests (browser-push.test.mjs:123-142) assert sw.js has NO `fetch|install|activate|import` tokens and carries the exact `new URL(...origin)` click lines — **those assertions stay green**: the push handler adds only `addEventListener('push', ...)` and `showNotification`.
```js
// public/sw.js — the only addition
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); // D-12/D-13
    if (cs.length) return;                      // any open client → visible-tab path owns delivery
    let p = {};
    try { p = e.data ? e.data.json() : {}; } catch {}
    await self.registration.showNotification(p.title || '', {
      body: p.body || '', tag: p.tag || 'gr8r-push', icon: '/favicon.svg', data: { url: p.url || '/' },
    });
  })());
});
```
**Constraint:** the `import`-free/no-lifecycle contract means no skipWaiting/claim machinery may be added casually — Pitfall 12 (SW update staleness) is mitigated by the server serving sw.js no-cache and click-time URL resolution (already true). Keep it that way; do not introduce version logging that breaks the minimal-file tests without updating them deliberately.

### Pattern 5: Client subscribe (rides the lazy push chunk)
**What:** `src/core/push.js` gains `enablePush()` / `disablePush()` / device-list fetchers, called from settings. `pushManager.subscribe` needs `applicationServerKey` (base64url → `Uint8Array` via `URL.createObjectURL`-free standard decode: `atob` + `Uint8Array.from`). GET the key from a small env-gated route (`GET /api/me/push-config` → `{ vapidPublicKey }` or 404 when absent — MCP-01 fail-absent pattern). **The SW registration must stay eager** (not chunk-gated): the registration call already lives in the eager path per ARCHITECTURE.md §6 — a chunk that never loads = silent push loss.
**Important DELIV-02 note:** push.js already rides a lazy chunk (Phase 57 split, commented at src/core/push.js:40-43). Keep SW *registration* eager; only the *settings UI handlers* live in the lazy chunk — this matches the existing arrangement.

### Anti-Patterns to Avoid
- **Putting subscriptions in the workspace doc** — revision churn + redaction complexity; Phase 34 moved prefs out for exactly this (Pitfall 15).
- **Gating push on `MAILER.enabled`** — separate channels; push is gated on VAPID presence only.
- **Retrying 404/410** — authoritative dead-subscription signals; retry everything else (429/5xx) never or via the next natural fan-out.
- **Running sw.js through Vite** — breaks the zero-dependency/zero-string contract.
- **Suppressing inbox rows in the push path** — Phase 38 invariant: only email is ever suppressed.
- **`requestPermission` on load or on first mention** — permanently burns the permission (Pitfall 13); D-01 forbids it anyway.
- **Avatar/body content in payloads** — 4096-octet budget + privacy (D-16/D-17: ticker only).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RFC 8291 encryption + VAPID JWT | Hand-rolled ECDH/HKDF/AES-GCM crypto | `web-push@4.0.0` | The pre-locked decision; hand-rolling is 300–500 lines of risky crypto (STACK.md) |
| Key generation | Manual curve math | `npx web-push generate-vapid-keys` (CLI) or `webpush.generateVAPIDKeys()` | Same library, no drift |
| Push-service status semantics | Custom HTTP error mapping | `webpush.WebPushError.statusCode` | 404/410 already surfaced by the library |
| Payload→notification display | Page-side rendering | SW `showNotification` with pre-localized payload | Only the SW works tab-closed |

**Key insight:** every protocol-hard part is inside the one approved dependency; everything the project hand-writes is its own established patterns (fan-out, rows, env custody, minimal SW).

## Common Pitfalls

### Pitfall 1: Dead-endpoint churn (PUSH-04 is its fix)
Endpoints die constantly (browser rotation, cleared site data, revoked permission → 410 with reason header). Treating failures as retryable accumulates corpses and slows every fan-out. **Fix:** delete the row in the same send pass; never retry 404/410. Detection: monotonic row growth; unit test with a mocked 410 asserting deletion. [CITED: RFC 8030 status semantics; web.dev push docs, via milestone PITFALLS.md]

### Pitfall 2: VAPID keys lost on restart
Regenerated keys silently orphan every existing subscription (browser still shows "granted", pushes 404, no re-prompt). **Fix:** Pattern 3 custody + a restart integration test (subscribe → restart → push still delivers with mocked push service). This is the project's own MASTER_KEY v1.5 scar tissue. **`VAPID_SUBJECT` should be a `mailto:` on the operator's domain — web-push v4 explicitly warns against localhost subjects** [CITED: STACK.md / web-push docs].

### Pitfall 3: Payload 413 mid-fan-out
RFC 8291 caps payload at 4096 octets; FR titles with accents inflate UTF-8 byte counts. **Fix:** truncate the *title* portion to ~120 chars (D-18), keep the payload `{url,title,body,test}` minimal, and write a test with pathological FR strings asserting `Buffer.byteLength(payload) <= 4096`.

### Pitfall 4: The G-37-2 test pins must be *amended, not just added to*
`test/notif-hydration.test.mjs:113-124`, `test/notif-prefs.test.mjs:78`, `test/local-prefs.test.mjs:56-57`, `test/migration.test.mjs:493`, `test/helpers/legacy-fixture.mjs:137` all encode `push_due` as a **dropped legacy key** [VERIFIED: grep this session]. D-09 reverses the ruling — those assertions must flip deliberately, and `NOTIF_PREF_KEYS`/`NOTIF_PREF_DEFAULTS` gain `push_due` (default `true`, matching the other push_* defaults — server.js:1612-1614). The settings Push tab currently shows `due_reminder`/`past_due` toggles (settings.js:532-533 — those gate the *inbox/foreground* reminder rows, distinct from `email_reminder`); the plan should place `push_due` alongside them and be explicit in tests about which pref gates which channel.

### Pitfall 5: Foreground vs push double-notify
D-12/D-13 resolve it: SW skips when any window client exists. The client poll/seen-set path stays untouched (D-48-2). A rare duplicate during tab-switch is accepted (D-13) — do not build a page↔SW handshake.

### Pitfall 6: Dependency contract test
`test/dependencies.test.mjs:32-44` asserts dependencies are **exactly** `{ @office-kit/xlsx, pg }` with `pg` on `^8` [VERIFIED this session]. Adding web-push fails this test; the phase must update the exact-pin list and the explanatory assertion text (this is D-12-as-amended, not a violation).

### Pitfall 7: The static sw.js contract tests
browser-push.test.mjs:123-142 asserts exact substrings of sw.js (`u.origin === self.location.origin`, no `import` token, `openWindow(url)`). Any push-handler edit must keep these byte-compatible or consciously update the tests. Notably: the push handler's `clients.matchAll` call is fine, but avoid the word `import` in comments (the regex is token-based).

### Pitfall 8: Reminder fan-out site has no nextDoc in scope at push time
`runReminderPass` re-parses the post-write doc for the email fan-out (line 1899). `sendPushFor` needs the same post-write doc for `memberCanReadProject` (project map) and task key/title resolution — clone the email site's re-parse, or refactor both to share one parse (discretion; keep the email site untouched if risk-averse — the standing Phase 38 invariants pass unmodified).

## Code Examples

### Server: web-push v4 ESM import + send
```js
// Source: web-push README (web-push-libs/web-push), v4 ESM API [CITED: STACK.md version-compat table]
import webpush from 'web-push';
webpush.setVapidDetails('mailto:ops@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payloadJson);
// throws WebPushError with .statusCode — 404/410 = sweep (PUSH-04)
```

### Client: subscribe with VAPID key
```js
// Standard Web Push API [CITED: MDN PushManager.subscribe; web.dev push]
const reg = await navigator.serviceWorker.ready;
const keyUrlSafe = (await api.call('/api/me/push-config')).vapidPublicKey;
const raw = Uint8Array.from(atob(keyUrlSafe.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
await api.post('/api/me/push-subscriptions', {
  endpoint: sub.endpoint,
  keys: sub.toJSON().keys,       // { p256dh, auth }
  label: `${deviceLabel()}`,     // D-04: client-chosen once, e.g. "MacBook — Chrome"
});
```

### Payload budget test (D-18)
```js
test('serialized push payload stays under 4096 octets with pathological FR titles', () => {
  const title = 'ÀÉÎÕÜçœ'.repeat(200);                 // pathological multi-byte FR
  const payload = JSON.stringify(buildPushPayload({ url: '/w/x/task/WEBS-42', title, body: 'WEBS-42 ' + title }));
  assert.ok(Buffer.byteLength(payload) <= 4096, 'payload budget violated');
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| web-push 3.6.7 (CJS, mkdirp/del deps) | web-push 4.0.0 (ESM, class syntax, deps dropped) | 2026-11-06 | Import style is ESM; API surface (`sendNotification`, `generateVAPIDKeys`) unchanged in name — verify at first use [CITED: STACK.md, verified npm this session] |
| Hand-rolled RFC 8291 considered | Owner-approved web-push dep | 2026-11-12 (D-12 amendment) | No crypto spike needed |
| G-37-2: push_due dead | D-09: push_due live for server reminder push | 2026-11-13 (this phase) | Whitelist + tests amended |

**Deprecated/outdated:** Phase 30 oidc.js RS256 hand-roll precedent does NOT extend here — the dep decision supersedes it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `web-push@4.0.0` API: `sendNotification(sub, payload, opts)`, `generateVAPIDKeys()`, `WebPushError.statusCode`, `setVapidDetails` all survive the v4 ESM rewrite with the same names | Code Examples / Pattern 1 | Executor hits a renamed API; cheap to verify from the installed package at execution (`node -e "import('web-push').then(m=>console.log(Object.keys(m)))"`) |
| A2 | `push_subscriptions` schema columns (label/last_seen_at names, created_at text epoch convention) | Pattern 2 | Column-name mismatch vs existing epoch conventions; check the workspaces/users DDL date conventions at execution |
| A3 | `/api/me/push-config` as the VAPID public-key route name (not pre-locked) | Pattern 5 | Cosmetic; planner may rename |
| A4 | `atob`+Uint8Array decode of the base64url applicationServerKey is correct for all target browsers | Code Examples | Standard pattern, LOW risk; Safari 16.4+ UAT on real device covers it (STATE.md flags real-device UAT) |
| A5 | `push_due` default `true` (matching push_mention/assign/comment defaults) | Pitfall 4 | If owner wanted opt-in-default-false, Settings seed changes — discuss-phase did not specify; flag at plan review |

## Open Questions

1. **Last-seen tracking mechanics** (discretion per CONTEXT): cheapest is updating `last_seen_at` on each successful send for that row. Recommend: update on successful send only — no extra probe traffic.
2. **Master-toggle unsubscribe** (D-07 permits either): recommend the master OFF also calls `pushManager.unsubscribe()` + deletes this device's row (clean, matches "enable" symmetry); per-type toggles stay delivery-only.
3. **Shared parse at the reminder site**: reuse the email fan-out's post-write doc parse for push too (one parse, two consumers) vs separate. Planner's call; keep Phase 38 invariants byte-identical either way.
4. **web-push@4.0.0 vs 3.6.7** if the SUS age flag bothers the operator at the checkpoint — STATE.md names 4.0.0; default to it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | server runtime | ✓ | v24.21.0 | — (≥ web-push@4 floor of 20) |
| npm registry access | install | ✓ | — | — |
| `/data` writable dir | VAPID persistence | ✓ (production image convention; docs/DEPLOY.md documents /data) | — | env-only VAPID custody (weaker; Pitfall 2) |
| Real browser device (UAT) | PUSH-01/02 acceptance, Safari/iOS quirks | human-provided | — | mocked-push-service unit tests + Playwright SW tests cover logic; real-device check remains owner UAT |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (built-in runner), Playwright for e2e |
| Config file | none for unit (`test/*.test.mjs` glob); `e2e/playwright.config.mjs` |
| Quick run command | `node --test test/browser-push.test.mjs` |
| Full suite command | `npm test` (node --test --test-concurrency=2 test/*.test.mjs) + `npm run lint` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUSH-01 | Settings-only opt-in, master toggle, per-device test push API | unit (extend harness pattern) | `node --test test/browser-push.test.mjs` | ✅ extend |
| PUSH-01 | Test push exercises real payload path with test tag | unit | `node --test test/push-server.test.mjs` | ❌ Wave 0 |
| PUSH-02 | prefs-off = no push; self-suppression; memberCanReadProject at send | unit (server fan-out with mocked webpush) | `node --test test/push-server.test.mjs` | ❌ Wave 0 |
| PUSH-02 | reminder push gated by push_due; digest users still pushed per D-10 | unit | `node --test test/push-server.test.mjs test/due-reminders.test.mjs` | ❌/✅ |
| PUSH-03 | payload ≤4096 octets pathological FR; deep-link url shape | unit | `node --test test/push-server.test.mjs` | ❌ Wave 0 |
| PUSH-03 | SW push handler: suppress-with-open-client, display contract, click routing | unit (static + stubbed SW globals) | `node --test test/browser-push.test.mjs` | ✅ extend |
| PUSH-04 | 404/410 deletes the row in the send pass; 429/5xx does not | unit (mocked WebPushError) | `node --test test/push-server.test.mjs` | ❌ Wave 0 |
| PUSH-05 | VAPID generated→persisted→loaded across restart; env override wins | unit/integration | `node --test test/push-server.test.mjs` | ❌ Wave 0 |
| — | dependency exact-pin updated for web-push | unit | `node --test test/dependencies.test.mjs` | ✅ extend |
| — | dual-backend parity for push_subscriptions (DBA suite) | unit | `node --test test/db-adapter.test.mjs` | ✅ extend |
| — | G-37-2 amendments (push_due whitelisted again) | unit | `node --test test/notif-hydration.test.mjs test/notif-prefs.test.mjs test/local-prefs.test.mjs` | ✅ amend |

### Sampling Rate
- **Per task commit:** targeted `node --test <touched files>`
- **Per wave merge:** `npm test` + `npm run lint`
- **Phase gate:** full suite green (standing constraint: EN+FR i18n gate — new `notif.push.*` keys need both catalogues; `node --test test/catalogue.test.mjs` or the i18n gate script) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/push-server.test.mjs` — new server-side suite (fan-out, sweep, budget, custody) with a mocked `web-push` module (module-mock via import seam: import web-push inside one function so tests can stub, or Node's `mock.module`)
- [ ] Extend `test/browser-push.test.mjs` SW static contract + push-handler stubs
- [ ] i18n keys `notif.push.*` in EN + FR catalogues (gate: server keys included)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V1 Access Control | yes | `/api/me/push-subscriptions` keyed to the session's own user_id only (404-matrix per family, established route pattern); test-send route sends only to the caller's own device rows |
| V5 Input Validation | yes | Whitelist-validate subscribe body: endpoint must be https URL of a known-ish form, p256dh/auth base64url strings, label length-capped (the NAMED_VIEW_BLOB_MAX_BYTES pattern); never trust stored rows at send time |
| V6 Cryptography | yes | All push crypto inside `web-push`; VAPID private key custody like MASTER_KEY (never logged, never returned by any route — only the PUBLIC key reaches the client) |
| V7 Error handling | yes | `fail(res, ...)` family with existing error codes; no key material in logs (logWarn pattern carries messages only) |
| V14 Config | yes | Fail-absent VAPID → feature absent; no new env var silently required for existing installs |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Push payload leaks task content on lock screens | Information disclosure | D-17: key + title only, never bodies; D-16 display-name-only sender |
| Subscription forgery/injection (POST fake endpoints) | Tampering | Validate endpoint shape; only rows for the caller's own user_id; sends are authenticated by the push service's VAPID signature anyway |
| Cross-workspace row reads | Elevation | Routes scope by session workspace (requireWorkspace + user_id match), like `/api/me/notif-prefs` (server.js:4276) |
| Cross-origin SW data poisoning | Tampering | Existing T-48-03 origin check in notificationclick; payload urls resolved through `new URL(…, origin)` |
| VAPID private key exfiltration via logs | Information disclosure | Custody code logs key ids/presence, never values |

## Sources

### Primary (HIGH confidence)
- Direct file reads this session: `server.js` (queueNotifEmails 1664-1752, doc-PUT diff 5460-5524, runReminderPass 1799-1905, prefs whitelist 1566-1660, SCHEMA boot patterns ~2627-2671), `src/core/push.js` (full), `public/sw.js` (full), `src/pages/settings.js` (notif-push 522-535), `db-adapter.mjs` (SQLITE_SCHEMA 140-330), `test/browser-push.test.mjs` (full), `test/dependencies.test.mjs`, `test/notif-hydration.test.mjs`/`notif-prefs`/`local-prefs` push_due pins, `docs/DEPLOY.md` section map, `.planning/research/{STACK,ARCHITECTURE,PITFALLS}.md`
- npm registry: `web-push@4.0.0` (2026-11-06), Node v24.21.0 runtime — verified this session
- gsd package-legitimacy seam: web-push = SUS (too-new major only; 13.7M downloads, canonical repo, no postinstall)

### Secondary (MEDIUM confidence)
- web-push v4 API surface (README/STACK.md) — names assumed stable across the ESM rewrite (A1)
- Safari/iOS Web Push availability (16.4+, home-screen requirement) — real-device UAT in phase

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pre-locked by owner decision, version verified on registry this session
- Architecture/fan-out integration: HIGH — every seam read directly at HEAD this session
- web-push v4 exact API names: MEDIUM — package is 7 days old; verify at execution (A1)
- Pitfalls: HIGH — derived from this codebase's own tests and milestone research

**Research date:** 2026-11-13
**Valid until:** ~2026-12-13 (stack stable; web-push v4 API surface worth a re-check if execution slips >30 days)
