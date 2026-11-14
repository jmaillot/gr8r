# Phase 61: Notification Trim - Pattern Map

**Mapped:** 2026-11-13
**Files analyzed:** 7 (modified ×5, new ×1, doc touch ×1)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (NOTIF_PREF_KEYS :1580-1598, NOTIF_PREF_DEFAULTS :1623-1636) | config | request-response | Phase 37 `push_due` removal precedent — comments at server.js:1572-1579 document that prior removal/restoration cycle | exact (self-precedent) |
| `src/core/notifPrefs.js` (mirror whitelist :41-48 + defaults :23-36 + header comment :9-22) | config | transform | Same mirror pattern in the file itself; `sanitize` (:55-63) is the read-side filter that absorbs removal | exact (self-precedent) |
| `src/pages/inbox.js` (groupBursts + BurstSummaryRow + S.ui.inboxBurstOpen) | component | render-transform | `pageInbox()` pipeline + `inboxItem`/`notifIcon`/`notifText` in the same file; `S.ui.inboxCat`/`inboxSel` transient-key pattern | exact (in-file) |
| `test/notif-prefs.test.mjs` (extend: PUT 400 for removed keys, no `assign_self` default) | test | request-response (HTTP) | the file itself — real-server harness via `test/helpers/server.mjs` | exact |
| `test/inbox-burst.test.mjs` (new — pure `groupBursts` unit test) | test | transform | `test/local-prefs.test.mjs` — client-module unit test with globalThis stubs + top-level `await import` | role-match |
| i18n catalogue `src/locales/en.json` + `src/locales/fr.json` (burst keys, CLDR plural) | config | transform | existing `notif.*` keys (e.g. `fr.json:1867 "notif.dueReminder"`) + plural convention in `test/i18n-plural.test.mjs` / `src/core/i18n.js:183+` | exact |
| `docs/notification-audit.md` (citation freshness only, same commit as key removal) | docs | — | the existing doc; Phase 39 D-05 Status-cell convention | exact (self) |

All analog paths verified git-tracked (`git ls-files` non-empty).

## Pattern Assignments

### `server.js` — dead-key removal (config, D-04)

**Analog:** the Phase 37 `push_due` cycle, documented in the file's own comment block (lines 1572-1579). Current state:

```js
/* PREFS (Phase 34, D-03/D-09): the exact 17-key whitelist and the 13-key
   default layer (emptyDoc's set; email_comment is the ONLY false). The legacy
   push toggle for due dates was removed with gap G-37-2 — D-09 (Phase 59)
   amends that standing ruling: ... The 4 extra
   keys (mention_team, mention_ws, assign_status, assign_over) have NO default —
   undefined-falsy preserves the D-09 zero-change switch-over; ... */
const NOTIF_PREF_KEYS = [           // :1580-1598 — remove 'mention_ws', 'assign_self', 'assign_status', 'assign_over'
  'email_mention', 'email_assign', 'email_comment', 'email_digest', 'email_reminder',
  'push_mention', 'push_assign', 'push_comment', 'push_due',
  'due_reminder', 'past_due', 'mention_all', 'mention_team',
  'mention_ws', 'assign_self', 'assign_status', 'assign_over',
];

const NOTIF_PREF_DEFAULTS = {       // :1623-1636 — remove `assign_self: true,` (:1635)
  email_mention: true, email_assign: true, email_comment: false, email_reminder: true,
  due_reminder: true, past_due: true,
  push_mention: true, push_assign: true, push_comment: true, push_due: true,
  mention_all: true, assign_self: true,
};
```

**Pattern to copy:** when removing, ALSO rewrite the owning comment block (:1572-1579) — every prior pref change in this file updated the narrative comment in the same edit (the `push_due` removal + D-09 restoration story is written exactly this way). New count: 17→13 keys.

**Guards that make removal safe (verify, don't re-implement):**
- PUT whitelist reject (server.js:4516-4517):
```js
for (const key of Object.keys(incoming)) {
  if (!NOTIF_PREF_KEYS.includes(key)) return fail(res, 400, 'unknownPrefKey', 'Unknown preference key');
}
```
- Stored-blob read filter — legacy rows vanish with no migration (server.js:1651-1654):
```js
const out = {};
for (const key of NOTIF_PREF_KEYS) {
  if (typeof stored[key] === 'boolean') out[key] = stored[key];
}
```

### `src/core/notifPrefs.js` — client mirror (config, parity rule)

**Analog:** the file itself. Its structure IS the pattern: comment narrative (:9-22) documents every key lifecycle event; `NOTIF_PREF_DEFAULTS` (:23-36, remove `assign_self: true` at :35); `NOTIF_PREF_KEYS` (:41-48, remove `'mention_ws'`, `'assign_status'`, `'assign_over'`):

```js
export const NOTIF_PREF_KEYS = [
  ...Object.keys(NOTIF_PREF_DEFAULTS),
  'email_digest', // opt-in key (Phase 38, D-14): toggleable but NOT defaulted — undefined-falsy
  'mention_team',
  'mention_ws',
  'assign_status',
  'assign_over',
];
```

**Hard rule (RESEARCH Pitfall 1):** both whitelists + both defaults change in the SAME commit. `sanitize` (:55-63) and server `getStoredNotifPrefs` (:1651-1654) need NO edits — they iterate the whitelist. Post-removal grep for `assign_self` must hit only the audit doc + git history.

### `src/pages/inbox.js` — burst grouping (component, render-transform, NOTIF-03)

**Analog:** the file's own render pipeline. Current pipeline (:24-30):

```js
let ns = myNotifs()
  .slice()
  .sort((a, b) => b.at - a.at);
const count = k => ns.filter(n => (k === 'all' || inCat(n, k)) && !n.read).length;   // :27 — counts computed RAW
ns = ns.filter(n => cat === 'all' || inCat(n, cat));
if (S.ui.inboxUnread) ns = ns.filter(n => !n.read);
const sel = myNotifs().find(n => n.id === S.ui.inboxSel) || null;                    // :30 — inboxSel expects a real notif id
```

**Insertion point:** `groupBursts(ns)` AFTER the filters (:28-29), BEFORE the render map (:40). Counts at :27 must stay computed from the RAW filtered list (Pitfall 2 — grouping must not shift tab badges).

**Transient expand state — copy the `S.ui.inboxCat`/`inboxSel` pattern (:20, :30):**
```js
const cat = S.ui.inboxCat;                  // transient S.ui key, toggled via data-a="set" data-k="inboxCat" data-v="..." (:38)
```
→ new key `S.ui.inboxBurstOpen` (Set of group keys), toggled by a dedicated `data-a="toggleBurst" data-gk="..."` action — do NOT route it through the generic `set` handler if the Set semantics don't fit.

**Summary row — copy `inboxItem`'s row anatomy (:87-96):**
```js
return `<div class="row" style="align-items:flex-start;gap:10px;padding:12px var(--gutter);border-bottom:1px solid var(--divider);cursor:pointer;..." data-a="selNotif" data-id="${n.id}" role="button" tabindex="0">
    ${!n.read ? `<span ... aria-label="${t('page.inbox.unread')}"></span>` : ''}
    ${notifIcon(n)}
    ...
    <button class="ibtn ibtn-xs" data-a="toggleRead" data-id="${n.id}" data-tip="..." aria-label="...">${ic(n.read ? 'mail' : 'mail-open', 13)}</button>
  </div>`;
```
Key idioms to preserve: `role="button" tabindex="0"`, `esc()` on every interpolated task title/key (Pitfall 4 / Security V5 — same as :54-55, :106, :109), `ibtn ibtn-xs` for the chevron, `ago(n.at)` for timestamps, `notifIcon(first)` for the group avatar. Summary-row PRIMARY click = `data-a="openTask" data-id="${tk.id}"` (the drawer deep-link pattern already at :107); expand is a SEPARATE chevron button; never set `inboxSel` to a non-id (Pitfall 3). Expanded members render via `inboxItem(m, false)` unchanged (:83-97).

**Group key:** `n.task + '|' + n.type` among **unread only** (`!n.read`); read rows standalone, groups never absorb read siblings (D-11). Summary placement = position of newest member (list already time-sorted). Render a synthesized i18n summary line — never `notifText()` of a member (legacy rows at :51-56 carry stored English prose).

### `test/notif-prefs.test.mjs` — extend (test, HTTP)

**Analog:** the file itself. Copy its harness setup verbatim (:6-58): real server via `startServer({ dataDir, env: { MASTER_KEY } })` from `./helpers/server.mjs`, real workspace via signup + `/api/workspaces`, raw row inspection via `withDb(server.dbPath, ...)`. Also update its local `DEFAULTS` copy (:26-39 — remove `assign_self: true`) — the test pins the default layer with `assert.deepEqual`.

New cases copy existing assertion idioms:
```js
test('PUT carrying push_due stores it — the pref is live again (D-09, G-37-2 amendment)', async () => {
  const res = await owner.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { push_due: false } });
```
→ mirror shape: `owner.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { mention_ws: true } })` → assert `400` + `unknownPrefKey`; assert `got.data.prefs.assign_self === undefined`; legacy-row filter case: seed a raw row containing removed keys via `withDb`, GET must drop them. Keep/extend the server↔client whitelist parity assertion (Phase 34 established it).

### `test/inbox-burst.test.mjs` — NEW (test, pure transform)

**Analog:** `test/local-prefs.test.mjs` (:1-21) — the established pattern for unit-testing a client-side module without a DOM/server:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
/* stubs installed before the module under test loads */
globalThis.localStorage = { getItem: ..., setItem: ..., removeItem: ..., clear: ... };
globalThis.document = { querySelectorAll: () => [] };   /* store.js import graph touches document */
const { ... } = await import('../src/core/notifPrefs.js');
```

**Implication for the planner:** `groupBursts` must be an exported pure function from `src/pages/inbox.js` (or a small `src/core/` module) taking `(ns, openSet)` or reading a passed-in state — the stub above satisfies `store.js`'s document access at import time (proven pattern). Cover: same task+type unread → group; read rows standalone; groups never cross task/type; summary at newest-member position; expand/collapse flag; single-member stays a plain row.

### i18n catalogue — burst keys EN+FR

**Analog:** existing `notif.*` keys (e.g. `src/locales/fr.json:1867 "notif.dueReminder": "arrive à échéance"`); the catalogue is flat dot-namespaced strings in `src/locales/en.json` + `src/locales/fr.json`. New keys follow D-13's shape: `t('notif.burst.comments', { n, key, title })` → « 5 nouveaux commentaires — WEBS-42 Fix login ».

**Plural pattern (src/core/i18n.js:183+):** a plural value is an object keyed by CLDR category (`one`/`other`/...), selected by the rules of the REQUESTED locale, `other` as fallback — convention pinned in `test/i18n-plural.test.mjs`. Add both catalogues in the same commit; `node scripts/i18n-scan.mjs` must stay at 0 literals / 0 pending (standing CI gate).

### `src/pages/settings.js` — NO changes expected

**Analog (if anything):** the `notif-email` case (:548-556) — `srow(t('settings.notif.X'), t('settings.notif.XDesc'), tog('email_X', np.email_X, 'np'))`. Per RESEARCH Tension Resolution, NO new Settings buttons this phase (D-04 is a code change; coalescing is render-only; keep-rows are live toggles). Listed here only so the planner can state the interpretation explicitly.

## Shared Patterns

### Whitelist parity (server ↔ client)
**Source:** `server.js:1580` ↔ `src/core/notifPrefs.js:41`
**Apply to:** the key-removal commit
Both lists change together; a parity assertion lives in `test/notif-prefs.test.mjs`. Warning sign of drift: `unknownPrefKey` 400s or client-stripped keys.

### Read-side whitelist filtering (no migration for removed keys)
**Source:** `server.js:1651-1654` (`getStoredNotifPrefs`), `src/core/notifPrefs.js:55-63` (`sanitize`)
**Apply to:** D-04 safety argument — removed keys in legacy rows are silently dropped at the single read points; plans need NO migration task.

### `S.ui` transient render state + data-a action handlers
**Source:** `src/pages/inbox.js:20, :30, :38, :95, :107`
**Apply to:** burst expand/collapse (`S.ui.inboxBurstOpen`) and summary-row actions (`openTask` for navigation, `toggleBurst` for expand, optional group mark-read reusing the `toggleRead` idiom).

### esc() every interpolation in row markup
**Source:** `src/pages/inbox.js:54-55, :87, :93, :106, :109`
**Apply to:** burst summary row (task key + title are user-controlled → XSS, ASVS V5).

### Real-server test harness vs client-module stubs
**Source:** `test/notif-prefs.test.mjs` (server path) / `test/local-prefs.test.mjs` (client-module path with `globalThis` stubs + top-level `await import`)
**Apply to:** the two test files respectively.

### Gates to keep green (unchanged)
- `npm test` (full suite = SC4 Phase 38 invariants gate)
- `node scripts/i18n-scan.mjs` (EN+FR catalogue gate)
- `test/build-chunk-size.test.mjs` (Phase 56 chunk discipline — new burst code stays inside page-scoped `inbox.js`)

## No Analog Found

None — every touchpoint has a direct in-repo precedent (D-04 is the `push_due` self-precedent; NOTIF-03 slots into inbox.js's existing pipeline; burst test follows the local-prefs stub pattern).

## Metadata

**Analog search scope:** `server.js`, `src/core/`, `src/pages/`, `src/locales/`, `test/`
**Files read in full or targeted:** server.js (:1565-1664, :4505-4524), notifPrefs.js (1-92), inbox.js (1-116), settings.js (:545-579), notif-prefs.test.mjs (1-80), local-prefs.test.mjs (1-30), locales probe
**Pattern extraction date:** 2026-11-13
