# Phase 44: Per-Member Timezones - Pattern Map

**Mapped:** 2026-11-06
**Files analyzed:** 8 (5 source, 3 test)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — resolve funnel (replaces `TZ_BY_LABEL`/`workspaceTzLabel`, ~1373–1410) | service (in-file helper) | transform | same file, current `localParts`/`workspaceTzLabel` | exact (in-place refactor) |
| `server.js` — `runReminderPass` per-member refactor (~1434–1636) | service | event-driven scheduler | same file, current workspace-level loops | exact (in-place refactor) |
| `server.js` — tz save-path validation (`docFromClient`/merge, ~1692–1719) | middleware (doc merge guard) | request-response | same file, `docFromClient` membership pinning | exact |
| `src/lib/timezones.js` (new) | utility (static data) | transform (none — static) | `src/core/constants.js` / `scripts/icons.mjs` generator | role-match |
| `src/pages/settings.js` — case `datetime` combobox (~279–286) | component | request-response (render) | `src/overlays/palette.js` + `sel()`/`langSel()` in same file | role-match |
| `src/actions/actions.js` — combobox save handler | store/action | event-driven | `IN.prefSel` (~2727) + `IN.langSel` (~2738) | exact |
| `test/tz-resolve.test.mjs` (new), `test/tz-dedup.test.mjs` (new), `test/settings-tz.test.mjs` (new) | test | batch | `test/due-reminders.test.mjs` harness | exact |
| `test/due-reminders.test.mjs` — re-pin UTC fallback (~380–382) | test | batch | same test, lines 373–383 | exact |

All analog paths verified git-tracked (`git ls-files`).

## Pattern Assignments

### `server.js` — resolveTz funnel (service, transform)

**Analog:** `server.js` lines 1373–1410 (in-place: `TZ_BY_LABEL` + `localParts` + `workspaceTzLabel`)

The funnel replaces the label→zone step *inside* the existing resolution chain. `localParts` already handles everything downstream — do not touch its `Intl.DateTimeFormat` math or the `% 24` midnight guard (line 1398):

**Current label→zone step (lines 1386–1399) — the seam to modify:**
```javascript
function localParts(tzLabel, date = new Date()) {
  const zone = TZ_BY_LABEL[tzLabel] || 'UTC';   // ← becomes: const zone = resolveTz(tzLabel);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}
```

**What gets deleted (lines 1405–1410):**
```javascript
function workspaceTzLabel(doc, wsId) {
  const first = db.prepare('select member_id from memberships where workspace_id = ? order by rowid limit 1').get(wsId);
  const members = Array.isArray(doc?.data?.members) ? doc.data.members : [];
  const member = members.find(x => x?.id && x.id === first?.member_id);
  return member?.tz || '';
}
```

Funnel shape (D-05/06/07) — validation via `Intl.DateTimeFormat` construction throwing `RangeError` on invalid zones:
```javascript
function resolveTz(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (TZ_BY_LABEL[v]) return TZ_BY_LABEL[v];                        // D-05 legacy map
  if (v) { try { new Intl.DateTimeFormat('en-CA', { timeZone: v }); return v; } catch { /* fall through */ } }
  return 'Europe/Paris';                                            // D-07 fallback
}
```
Copy the existing `TZ_BY_LABEL` object verbatim (lines 1378–1384) and ADD `'(GMT-07:00) Pacific Time': 'America/Los_Angeles'` (the client default from `src/core/store.js:17` — currently unmapped). Rewrite the D-27-1 comment block (lines 1360–1377) to per-member semantics.

---

### `server.js` — `runReminderPass` per-member refactor (service, event-driven)

**Analog:** `server.js` lines 1434–1636 (in-place)

Current shape computes ONE `(localDate, hour)` per workspace at line 1442 and gates both loops on it:
```javascript
const { date: localDate, hour } = localParts(workspaceTzLabel(doc, ws.id), at);   // line 1442 — DELETE
if (hour >= 8) for (const t of tasks) { ... }                                     // line 1452 — per-assignee gate
```

**Reminder loop refactor:** move resolution inside the loop, keyed on the assignee's doc member. Resolve the member id → doc profile (`doc.data.members` find by id; doc-only members have no membership row — fall through the funnel):
```javascript
// per-task, INSIDE `for (const t of tasks)`:
const tz = resolveTz((doc.data.members || []).find(m => m?.id === t.assignee)?.tz);
const { date: localDate, hour } = localParts(tz, at);   // Pitfall 3: never hoist out of the loop
if (hour < 8) continue;
```
String compares `localDate >= due` (line 1481) / `localDate > due` (1483) and the claim key `` `${ws.id}:${t.id}:${t.assignee}:${offset}:${due}` `` (line 1509) are UNTOUCHED.

**Digest loop refactor:** the loop iterates memberships⋈users rows carrying `r.member_id` (lines 1551–1553):
```javascript
// per-recipient, INSIDE the recipient loop (before the opt-in gate is fine; before any claim):
const tz = resolveTz((doc.data.members || []).find(m => m?.id === r.member_id)?.tz);
const { date: localDate, hour } = localParts(tz, at);
if (hour < 8) continue;
```
Claim key `` `${ws.id}:${r.user_id}:digest:${localDate}` `` (line 1594) keeps its byte-identical SHAPE — `localDate` is now per-recipient (D-11). Ship the D-notation dedup comment here (D-12). The `transaction(() => …)` claim+append pattern (lines 1506–1515) and the post-commit MAILER fan-out (never inside the transaction, lines 1520–1523, 1599–1600) are copied as-is — do not restructure.

---

### `server.js` — tz save path (middleware, request-response)

**Analog:** `server.js` lines 1692–1719 (`docFromClient`) — the "access fields belong to the membership" precedent

Non-admins currently get their members array wholesale-replaced (line 1699–1700), which is exactly why the tz save needs a self-only exception here (Option A) or a dedicated route. Copy this merge-pinning style for the self-tz carve-out:
```javascript
if (ROLE_RANK[role] < ROLE_RANK.admin) {
  next.data.members = storedMembers;
}
```
The analog precedent for a pinned-field write is lines 1704–1712 (admins: incoming members keep `id/userId/email/role/status` pinned). A self-tz exception mirrors it: find the incoming member matching `membership.member_id`, funnel-validate its `tz` (`resolveTz`), and write ONLY `tz` onto the stored member — never letting member A touch member B. Add a regression test: member-role client sets own tz → persists; attempt to set another member's tz → ignored.

---

### `src/lib/timezones.js` (new — utility, static data)

**Analog (shape):** `src/core/constants.js` conventions (plain ES module exporting a `const` map/array). **Analog (generation):** `scripts/icons.mjs` (lines 16–29) — the established build-time generator pattern: a `scripts/*.mjs` Node ESM script that walks/computes and emits a committed static artifact.

```javascript
// scripts/icons.mjs — the generator pattern to copy: node:fs/node:path, no deps, sorted output
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => { ... });
export function lucideIconNames(srcDir = 'src') { ... return [...new Set(tokens)].filter(...).sort(); }
```
`scripts/gen-timezones.mjs` (optional, planner discretion) would do the same one-shot: `Intl.supportedValuesOf('timeZone')` at BUILD time only (D-03 bans runtime enumeration), emit a sorted array of `{ id, name }` to `src/lib/timezones.js`, committed. The static module is a plain export:
```javascript
export const TIMEZONES = [ { id: 'Africa/Abidjan', name: 'Abidjan' }, /* …sorted… */ ];
```
City label = last IANA segment (deterministic, zero i18n catalogue entries — keeps `npm run i18n:scan` green per A3).

---

### `src/pages/settings.js` — combobox in case `datetime` (component, render)

**Analog A (markup contract):** same file, `sel()`/`langSel` (lines 84–97) — every settings control is an HTML string with `data-in` hook + `data-k` key:
```javascript
export const sel = (k, opts, v) =>
  `<select class="select" style="width:auto;min-width:180px" data-in="prefSel" data-k="${k}" aria-label="${k}">${opts
    .map(o => { const [val, n] = Array.isArray(o) ? o : [o, o];
      return `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${n}</option>`; })
    .join('')}</select>`;
```
Replace the call at line 285 (`sel('tz', [5 labels], P.tz)`) with the combobox. **Preselect (D-04):** `P.tz` when set and resolvable, else `Intl.DateTimeFormat().resolvedOptions().timeZone`, else `Europe/Paris` — computed at render, never auto-saved.

**Analog B (searchable list + keyboard):** `src/overlays/palette.js` — the only existing searchable-filter-list in the codebase. Copy its discipline:
- Filtering via `foldForSearch(q)` (core/utils.js:22–34) — accent-folded substring match, so "etats-unis"/"états" both find `America/New_York`-adjacent entries.
- Highlight index with clamp (`clamp(pl.hl, 0, flat.length - 1)`, palette.js:209) and per-item `data-a`/`data-i`/`data-hover-i` markup (palette.js:236).
- ARIA: `role="combobox"` input with `aria-expanded`/`aria-controls`/`aria-activedescendant` driving a `role="listbox"` of `role="option"` items (palette.js:213, 228).
- Every option label interpolated through `esc()` (palette.js:236; `esc` is the named re-export at core/utils.js:15) — Pitfall 7 defence.

Live offset (D-02, computed at render, never stored):
```javascript
const offsetLabel = zone => new Intl.DateTimeFormat(undefined, { timeZone: zone, timeZoneName: 'shortOffset' })
  .formatToParts(new Date()).find(p => p.type === 'timeZoneName').value; // e.g. "GMT+1"
```

---

### `src/actions/actions.js` — save handler (store/action, event-driven)

**Analog:** `IN.prefSel` (lines 2727–2733) and `IN.langSel` (lines 2738+) in the same file

```javascript
IN.prefSel = el => {
  const k = el.dataset.k;
  S.prefs[k] = prefValue(k, el.value);
  save();
  render();
  toast(t('toast.prefSaved'), { ms: 1500 });
};
```
The combobox CANNOT simply reuse `IN.prefSel` for `tz`: blob `S.prefs.tz` is the disconnected store (research Critical Finding). Copy `IN.langSel`'s dedicated-handler pattern instead — a distinct `data-in` key with its own async handler that calls the real save path (per the planner's Option A/B choice) rather than writing `S.prefs`. `IN.langSel` also shows the error-toast convention (`toast(t('err.…'), { kind: 'err' })`) if reject-on-invalid (D-10) is chosen. New action handlers must carry the Phase 43 wiring-regression treatment (`A.<action>` namespaces, every `data-a` pinned by test — STATE.md 43-03).

Members-table display (`tz: '—'` placeholder at actions.js:1754) reads member profiles — verify it renders the resolved zone label through the same client-side helpers, still `esc()`-escaped.

---

### `test/tz-resolve.test.mjs` (new), `test/tz-dedup.test.mjs` (new), `test/settings-tz.test.mjs` (new) — test, batch

**Analog:** `test/due-reminders.test.mjs` — the injectable-clock harness all new tests drive:

```javascript
// imports + real-server harness (lines 9–16, 28–36):
import { startServer, withDb, signup, client } from './helpers/server.mjs';
const trigger = (nowIso, srv = server) =>
  fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => { assert.equal(r.status, 200); return (await r.json()).emitted; });

// fixture with tz override (lines 50–77): makeWorkspace(tasks, prefs, tz) overwrites
// the whole doc via withDb(... update workspaces set doc = ?), members carry `tz`
// — same pattern for per-member fixtures (two members, different tzs).
```
Dedup edge tests (D-12) assert on claim behavior via `emitted` filters and `withDb` ledger reads — copy the "one shared account PER SERVER, unique task ids per fixture, filter own rows" discipline documented in the file header (lines 1–8).

### `test/due-reminders.test.mjs` — re-pin (test, batch)

**Analog:** same file, lines 373–383 — the test to re-pin is inside `REM-02`:
```javascript
/* Unknown/empty label → UTC fallback (legacy docs seed tz: ''). */
const { own: ownU } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })], {}, '');
assert.ok(ownU(await trigger(at8('2026-01-15'))).some(n => n.snippet === 'Due today: Ship it'), 'empty tz label falls back to UTC');
```
Re-pin to Paris per D-07: inject `2026-01-15T07:00:00Z` (08:00 Europe/Paris CET in winter) instead of `at8()` (08:00 UTC); update the comment to "→ Paris fallback" with D-07 rationale. All other fixtures use `'(GMT+00:00) London'` / `'(GMT-08:00) Pacific Time'` — the D-05 alias map keeps them resolving identically, so the rest of the suite passes unmodified (Pitfall 5).

## Shared Patterns

### Single-choke-point funnel
**Source:** `server.js` `hiddenFor`/`memberCanReadProject` discipline (referenced by comments at server.js:1467–1473) + `localParts` seam (1387)
**Apply to:** all tz resolution — server funnel (`resolveTz`) is the ONLY legacy-map/IANA-validation/fallback site; client picker resolves display values independently but never invents a second server mapping.

### `esc()` on every interpolated string
**Source:** `src/core/utils.js:15` (`export { escHtml as esc }`), used throughout palette.js:236 and select.js:26/69
**Apply to:** all combobox option markup, offset labels, and any member-table tz rendering.

### i18n catalogue (EN+FR) for new user-facing strings
**Source:** `t()` usage in every analog above; `src/locales/en.json` / `fr.json`
**Apply to:** combobox placeholder/aria labels, any reject-on-invalid toast (`err.invalidTimezone`). IANA ids, city segments and `Intl`-derived offsets are machine values — NOT catalogue strings.

### Transaction-wrapped claim + post-commit side effects
**Source:** `server.js:1506–1515` (claim+append in one `transaction`), `server.js:1518–1523` (mailer AFTER commit)
**Apply to:** untouched in this refactor — per-recipient claims reuse the exact pattern; never add SMTP work inside a transaction.

### Injectable-clock test discipline
**Source:** `test/due-reminders.test.mjs:1–43` (`/api/internal/reminder-pass` + `REMINDER_TEST_TOKEN`, no fake timers)
**Apply to:** `test/tz-dedup.test.mjs` and per-member window tests.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/timezones.js` (data content) | utility | static | No existing ~400-entry IANA list in the codebase — content must be generated/hand-curated; only the module SHAPE has analogs (`constants.js`, `scripts/icons.mjs` generator) |

## Metadata

**Analog search scope:** `server.js`, `src/pages/`, `src/actions/`, `src/overlays/`, `src/ui/`, `src/core/`, `src/lib/`, `scripts/`, `test/`
**Files scanned:** ~70 (glob) → 11 read in depth
**Pattern extraction date:** 2026-11-06
