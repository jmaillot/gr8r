# Phase 9: Server messages & activity history - Pattern Map

**Mapped:** 2026-10-24
**Files analyzed:** 14 (12 modified, 2 new)
**Analogs found:** 14 / 14 (every file has a same-file or sibling analog; this phase is wiring inside existing homes, not new files)

**Verification note:** every analog path below was checked with `git ls-files` — all tracked source. No gitignored mirrors exist in this repo. `AGENTS.md` and `.claude/skills/` do not exist; project conventions come from the code itself.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (fail helper + ~55 site conversion + 3 catch sites + row.error) | server / route handler | request-response | `server.js` itself — `json()` (1022-1030), `httpError()` (1016-1020), inline sites (1300-1350), catch sites (1268, 1648, 1821) | exact (self-extension) |
| `src/core/i18n.js` (+ `has()`, `tErr()`) | utility (leaf layer) | request-response | `src/core/i18n.js` itself — `t()` (172-182), `negotiate()` (94-104) | exact (self-extension) |
| `src/core/api.js` (`call()` boundary) | service (API client) | request-response | `src/core/api.js` itself — `call()` (38-61) | exact (self-extension) |
| `src/components/task-list.js` (verb path + `actCategory` + extra table) | component (render) | transform | `src/components/task-list.js` itself — `VERB_KEYS`/`verbLabel`/`actExtraHtml`/`actHtml` (130-196) | exact (self-extension) |
| `src/pages/activity.js` (filters) | component (page) | transform | `src/components/task-list.js` `VERB_KEYS` map (lookup-table style) + own lines 12-21 | role-match |
| `src/actions/actions.js` (logAct sites → machine verbs) | action/store layer | event-driven | own `applyPatch` logAct chain (91-139) + `src/pages/inbox.js` `notifText` (legacy/structured precedent) | exact (self-extension) |
| `src/actions/archive.js`, `src/actions/subtasks.js` (logAct sites) | action/store layer | event-driven | `src/actions/actions.js:91-139` chain | role-match |
| `src/core/store.js` (`logAct`) | store | event-driven | `src/core/store.js:264-266` itself (signature likely unchanged; callers change) | exact (context) |
| `src/locales/en.json`, `src/locales/fr.json` (+ ~44 keys) | config (catalogue) | CRUD | the catalogues themselves; lint contract in `test/catalogue.test.mjs` | exact |
| `src/main.js` (save-error surface), `src/overlays/modals.js` (invite row), `src/overlays/drawer.js` (verb line) | component surfaces | event-driven | `src/main.js:76-95`, `modals.js:224-225`, `drawer.js:123` | exact (consumers; mostly unchanged after boundary translation — see per-file notes) |
| `test/error-codes.test.mjs` (NEW) | test | static-scan + server integration | `test/catalogue.test.mjs` (lint style) + `test/i18n-core-features.test.mjs:149-161` (source-scan) + `test/helpers/server.mjs` (real-server integration) | role-match |
| `test/activity-verbs.test.mjs` (NEW) | test | static-scan + unit | `test/i18n-vocab.test.mjs` (stored-vocabulary contract, 1-60 + 101-110) | role-match |

## Pattern Assignments

### `server.js` — server, request-response

**Analog:** itself; the two existing construction patterns it unifies.

**Existing json/httpError helpers** (lines 1016-1030, verbatim):
```js
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function json(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}
```
Copy for `fail()`: place it directly beside `json()`, in the same flat-function style (no classes, no middleware):
```js
// NEW — pattern derived from json(): a thin wrapper, extra spread last so
// existing fields (suggestion, revision, needsSignIn) pass through untouched
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
```
`httpError` gains an optional third arg: `err.code = code` — same 4-line body shape.

**Inline-site pattern to convert** (the dominant pattern, ~55 sites; lines 1300-1350 verbatim):
```js
if (!name) return json(res, 400, { error: 'Enter a workspace name' });
if (!slug) return json(res, 400, { error: 'Use 2–40 lowercase letters, numbers, or hyphens' });
if (wsBySlug(slug)) return json(res, 409, { error: 'That URL is already taken', suggestion: uniqueSlug(slug) });
// ...
if (row.revision !== revision) { db.exec('rollback'); return json(res, 409, { error: 'Workspace changed elsewhere', revision: row.revision }); }
```
Becomes mechanically: `return fail(res, 400, 'workspaceNameRequired', 'Enter a workspace name')` — English message byte-unchanged, `code` added. Sites carrying a second machine field keep it via the extra arg.

**Thrown-path catch sites** (lines 1264-1267 and 1645-1648, identical text in both):
```js
try {
  user = createUser(email, name, password);
} catch (err) {
  return json(res, err.status || 500, { error: err.message });
}
```
Copy pattern: forward the code — `return json(res, err.status || 500, { error: err.message, code: err.code })` (a codeless error simply emits no `code` field — that is the D-03 fallback case).

**Outermost catch-all** (lines 1819-1823, verbatim):
```js
} catch (err) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  if (!res.headersSent) json(res, status, { error: status >= 500 ? 'Internal server error' : err.message });
  else res.end();
}
```
Same forwarding shape; keep the `console.error` and `headersSent` guards exactly.

**Per-invite row error inside a 201** (line 1572, verbatim):
```js
row.error = 'Email could not be sent. Copy the link instead.';
```
Not an HTTP error branch — needs its own code path (`emailSendFailed`), consumed at `modals.js:224-225`.

**Import/module style:** zero runtime dependencies (server.js:2-3 comment is an invariant enforced by `test/catalogue.test.mjs`'s "no runtime dependency" test); flat top-level functions, no framework, `node:http` only.

### `src/core/i18n.js` — utility, leaf layer

**Analog:** itself. The leaf-layer contract is the load-bearing pattern:
```js
// lines 1-5 — the module imports the catalogues and nothing else from the app
import en from '../locales/en.json' with { type: 'json' };
```
**The key-on-miss contract** `tErr` must gate against (lines 172-182, verbatim):
```js
export function t(key, vars) {
  const active = catalogues.get(locale);
  let value = active && Object.hasOwn(active, key) ? active[key] : undefined;
  if (value === undefined) {
    const base = catalogues.get(BASE_LOCALE);
    value = base && Object.hasOwn(base, key) ? base[key] : undefined;
  }
  if (typeof value === 'string') return interpolate(value, vars);
  if (value && typeof value === 'object') return resolvePlural(value, vars) ?? key;
  return key;
}
```
Note `Object.hasOwn(active, key)` at line 174 — that exact idiom is the `has()` implementation; a naive `t('err.' + code)` would return the literal key string (Pitfall 2). Copy pattern for the new functions (same placement, same comment style as the surrounding exports):
```js
export function has(key) { const c = catalogues.get(locale); return (c && Object.hasOwn(c, key)) || Object.hasOwn(catalogues.get(BASE_LOCALE) || {}, key); }
export function tErr(code, params, raw) { const k = `err.${code}`; return has(k) ? t(k, params) : raw; }
```
Also copy: the module documents every export with a rationale comment (see `negotiate`, `primeLocale`) — new `has`/`tErr` get the same treatment, plus a leaf-module note (plain-Node testable, no renderer import).

### `src/core/api.js` — service, request-response

**Analog:** itself. The single return point (lines 51-61, verbatim):
```js
let data = null;
const text = await res.text();
if (text) {
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }
}
return { ok: res.ok, status: res.status, data, error: data?.error };
```
Copy pattern: translate `error` at this one line only — `error: data?.code ? tErr(data.code, data?.params, data?.error) : data?.error` — importing `tErr` from `./i18n.js` (the `t` import already exists at line 9; extend the same import). Note the offline branch at line 49 already returns a translated error (`t('err.serverUnreachable')`) — the boundary change must not disturb it (no `code` on that object, so it passes through unchanged).

**Escape discipline:** `toast()` escapes its message (`src/ui/toast.js:15` `esc(msg)`), so interpolated server params stay inert — no new escaping needed at the boundary.

### `src/components/task-list.js` — component, transform

**Analog:** itself. Three existing patterns to extend:

**1. The lookup-table-over-stored-data pattern** (lines 130-160, verbatim):
```js
/* The stored verb is an English fragment (document data, D-06); the display is a
   catalogue lookup keyed on the stored string. An unknown or legacy verb renders
   verbatim — the same rule the notifications follow. The map is explicit, so the
   vocab test can pin every call-site verb against both catalogues. */
export const VERB_KEYS = {
  created: 'act.verb.created',
  'created project': 'act.verb.createdProject',
  completed: 'act.verb.completed',
  moved: 'act.verb.moved',
  /* …24 entries… */
};
export const verbLabel = v => (VERB_KEYS[v] ? tMsg(VERB_KEYS[v]) : v);
```
Copy for the machine-verb path and the filter classifier: data tables keyed on the stored string, `export const` one-liners, no `includes()`/regex over English:
```js
const ACT_CATEGORIES = {
  comments: new Set(['commentedOn', 'commented on']),
  status:   new Set(['moved', 'completed', 'completedSubtaskOn', 'reopenedSubtaskOn', 'moved', 'completed', 'reopened']),
  projects: new Set(['createdProject', 'projectStatusChanged', 'created project', 'changed status of project']),
};
export const actCategory = verb => Object.keys(ACT_CATEGORIES).find(k => ACT_CATEGORIES[k].has(verb)) || null;
```
⚠️ The status/projects sets above are illustrative — D-06 locks today's exact selection (a task moved *between projects* logs `moved` and is selected by the STATUS filter); verify each set against `activity.js:13-21` semantics before writing.

**2. The structured-extra render pattern** (lines 173-183, verbatim):
```js
/* A new row's extra is structured ({ kind, ...vars }) and composes through the
   act.extra.* catalogue keys; a legacy row's extra is a stored English string and
   renders verbatim (D-12's rule, no migration). */
export function actExtraHtml(e) {
  if (e && typeof e === 'object') {
    if (e.kind === 'recur') {
      const k = RECUR_EXTRA[e.id];
      return `<span class="muted">${esc(k ? tMsg(k) : e.id)}</span>`;
    }
    return `<span class="muted">${esc(tMsg(`act.extra.${e.kind}`, e))}</span>`;
  }
  return `<span class="muted">${esc(e)}</span>`;
}
```
Copy: the object branch (kind → key → resolve vars → `esc` at interpolation) is the shape to keep; the **string branch (last line) changes from verbatim render to render nothing** — the one-line suppression edit. New kinds extend the same dispatch: a per-kind var table resolves ids (`t('task.status.' + id)`, `t('task.priority.' + id)`, `t('project.status.' + id)`, `formatDate`, `fmtEstimate` — all already locale-aware, imported or reachable here) **before** interpolation, because `{name}`-style interpolation of the key alone cannot translate an id. New catalogue keys: `act.extra.value` (`"{value}"`), `act.extra.quoted` (`“{value}”`), `act.extra.into` (`into {value}`), plus `act.verb.projectStatusChanged`.

**3. The alias discipline:** `import { t as tMsg } from '../core/i18n.js';` (line 6) — because row functions take a task parameter named `t`. Reuse the alias for new lookups.

**`actHtml` consumer** (line 195, verbatim) shows the composition to preserve:
```js
...${a.extra ? actExtraHtml(a.extra) : ''}...
```

### `src/pages/activity.js` — component, transform

**Analog:** itself (the code being replaced) + `VERB_KEYS` map style. Current English-parsing filters (lines 12-21, verbatim):
```js
if (f !== 'all')
  as = as.filter(a =>
    f === 'comments'
      ? a.verb.includes('comment')
      : f === 'status'
        ? /moved|completed|reopened/.test(a.verb)
        : f === 'projects'
          ? a.verb.includes('project')
          : true,
  );
```
Copy pattern: replace the ternary bodies with `actCategory(a.verb) === f` (one import added from `../components/task-list.js`, which this file already imports for `actHtml` at line 6). The filter ids (`comments`/`status`/`projects`) and the `data-a="set"` mechanics around it stay untouched.

### `src/actions/actions.js` — action layer, event-driven

**Analog:** its own logAct chain (lines 91-139, verbatim excerpt):
```js
if (k === 'status') {
  if (nv === 'done') { t.completedAt = Date.now(); t.prevStatus = old; logAct('completed', t); fxSet({ done: t.id }); }
  else logAct('moved', t, `from ${ST[old].name} to ${ST[nv].name}`);
  ...
} else if (k === 'assignee') logAct('assigned', t, nv ? `to ${mem(nv)?.name}` : '(unassigned)');
else if (k === 'priority') logAct('changed priority of', t, `to ${PR[nv].name}`);
else if (k === 'due') logAct('changed due date of', t, nv ? `to ${fmtDate(nv)}` : '(cleared)');
```
Copy pattern: keep the `else if` chain and `logAct(verb, t, extra)` signature; change **what is stored** — machine verbs (`'changedPriorityOf'`) and structured extras (`{ kind: 'prioritySet', value: nv }`) with **ids/machine values, never `t()`-derived prose** (`ST`/`PR`/`PSTAT` names are locale getters at `src/core/constants.js:30-150` — the current leak).

**Bypass sites to canalize** (verbatim):
```js
// actions.js:332
D().activity.unshift({ id: uid('a'), by: D().me, verb: 'changed status of project', /* … */ extra: 'to ' + PSTAT[v].name });
// actions.js:1348
D().activity.unshift({ id: uid('a'), by: D().me, verb: 'created project', task: null, project: p.id, at: Date.now(), extra: '' });
```
They replicate `logAct`'s row shape (store.js:266: `{ id: uid('a'), by: D().me, verb, task, project, at: Date.now(), extra }`) — keep the row shape, switch verb/extra to the machine forms (or route through `logAct`).

**Error-toast sites:** ~15 `toast(res.error || t('err.…'), { kind: 'err' })` (lines 367, 1717, 1727, 1772, 1784, 1808, 1825, 1846, …) and form-error sites `S.ui.errors = { login: res.error || t('err.fallback') }` — these need **no edit** once the `call()` boundary translates (research A5); do not touch them per-site (anti-pattern).

### `src/locales/en.json` / `fr.json` — config, catalogue

**Analog:** the catalogues + `test/catalogue.test.mjs`'s enforced contract. New `err.*` values must satisfy, from the lint (verbatim rules at catalogue.test.mjs lines 21-33):
```js
const FORBIDDEN = ['<', '>', '"'];                       // markup lint — no angle brackets, no double quote
const KEY_SHAPE = /^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*|\.[0-9]+)+$/;  // camelCase segments, underscore impossible
```
Existing namespace style (from en.json): `"err.changeRole"`, `"err.lastMember"`, `"err.inviteLink"` — all camelCase after the dot; ~63 keys exist. New keys follow D-01+D-05: code `slugTaken` → key `err.slugTaken`, **verbatim, no mapping table**; values are full sentences with `{name}`-style placeholders (D-02) that the lint's placeholder-parity check must find identically in both files. French values must carry U+00A0 before `:`, U+202F before `; ! ?`, « » with U+00A0, U+2019 apostrophes, NFC, `…` (gated by `test/french-typography.test.mjs` — sample fr style: `"Bonjour, {name} !"`). **Key order:** the fr catalogue's key order must mirror en (`test/catalogue.test.mjs` "the French key order mirrors the English key order") — insert new keys at matching positions in both files.

### `src/core/store.js`, `src/main.js`, `src/overlays/modals.js`, `src/overlays/drawer.js` — consumers

**`store.js` `logAct`** (lines 264-266, verbatim):
```js
export function logAct(verb, t, extra = '') {
  D().activity.unshift({ id: uid('a'), by: D().me, verb, task: t?.id || null, project: t?.project || null, at: Date.now(), extra });
  if (t) t.updated = Date.now();
}
```
Signature unchanged — the callers are what change. Keep as the single choke point; do not add a second writer helper.

**`main.js` save-error handler** (lines 76-95, verbatim excerpt):
```js
if (status === 403) return toast(error || tk('err.readOnlyAccess'), { kind: 'err', ms: 6000 });
```
After boundary translation, `error` is already localized; these branches likely need **no change** — verify, don't rewrite. (The `tk()` alias here is main.js's local `t`.)

**`modals.js` invite row** (lines 224-225, verbatim):
```js
const status = l.sent ? t('modal.sent') : l.error ? t('modal.notSent') : '';
...title="${esc(l.error || '')}"...
```
This surface consumes the per-invite `row.error` (server.js:1572) — it needs its own `tErr('emailSendFailed', …)` treatment where the row is rendered, since no `code` travels through the 201 payload today (decide: server adds `row.code`, or client keys off the fixed string's new code — planner's call).

**`drawer.js` verb line** (line 123, verbatim):
```js
${esc(VERB_KEYS[a.verb] ? verbLabel(a.verb) : a.verb.replace(/ of$/, ''))}${a.extra ? ' ' + actExtraHtml(a.extra) : ''}
```
It already imports `VERB_KEYS`, `verbLabel`, `actExtraHtml` from task-list.js but keeps a divergent fallback. Research recommends unifying through `verbLabel` (whose verbatim fallback covers unknowns) so the suppression/translation policy lives in one place.

## Shared Patterns

### Single choke point, both directions
**Source:** `server.js:1022` (`json`), `src/core/api.js:60` (`call()` return), `src/core/store.js:265` (`logAct`)
**Apply to:** every error construction (→ `fail`), every error consumption (→ boundary translation), every activity write (→ `logAct`/machine verbs). The parity tests enumerate exactly these choke points; anything bypassing them is untestable.

### Key-on-miss gate (D-03)
**Source:** `src/core/i18n.js:174` (`Object.hasOwn(active, key)`) and `:181` (`return key`)
**Apply to:** `tErr`/`has()` — and by extension any dynamic `t()` lookup in this phase (`t('act.verb.' + verb)` in the new verb path needs the same `has()`-style gate so unknown verbs fall back verbatim, not to a key string).

### Lookup-table over stored data, never parsing English
**Source:** `src/components/task-list.js:134-160` (`VERB_KEYS`, `RECUR_EXTRA`)
**Apply to:** `ACT_CATEGORIES`, the per-kind extra var table, and the machine-verb render path. A stored string is data; a `key → catalogue key` map is code; `a.verb.includes(...)` is the anti-pattern being removed.

### Escaping at the interpolation point
**Source:** `src/core/i18n.js:133-137` (`escHtml`, "t() never calls it: the caller escapes at the point of interpolation"); `actExtraHtml` lines 176-182
**Apply to:** every new render line (`actCategory` output goes into `class=`/filter comparisons — ids, not user text; new extra values are `esc()`ed).

### En↔fr catalogue parity + key order + typography
**Source:** `test/catalogue.test.mjs` (english-base, placeholders, key order) + `test/french-typography.test.mjs`
**Apply to:** every new key in both catalogues, inserted at matching positions.

### Real-server test harness (never mock SQLite/HTTP)
**Source:** `test/helpers/server.mjs` (verbatim above: `startServer()` spawns `server.js` on an ephemeral port with a temp `DATA_DIR`; `client()` is a cookie-bearing fetch wrapper; `signup()`/`login()`/`withDb()` helpers)
**Apply to:** the payload-shape integration test in `test/error-codes.test.mjs` (e.g. duplicate signup → assert `status: 409`, `data.error` English unchanged, `data.code === 'invalidCredentials'`-family, and extra fields like `suggestion` intact).

### Source-scan extraction (server.js and src/ are not importable in tests)
**Source:** `test/i18n-core-features.test.mjs:149-161`:
```js
const src = fs.readFileSync(path.join(ROOT, 'src/core/api.js'), 'utf8');
const verbs = [...src.matchAll(/call\('(\w+)'/g)].map(m => m[1]);
```
and `test/i18n-vocab.test.mjs:101-110` (`readFileSync` + block `matchAll` over source). `server.js` boots on import (top-level side effects), so the D-04 parity test reads it as text: extract `fail(res, <status>, '<code>'` and `httpError(<status>, '<msg>', '<code>'` codes by regex, assert `err.<code>` exists non-empty in both catalogues, and assert no bare `json(res, <status>, { error:` survives (Pitfall 1's scan assertion). Same technique extracts `logAct('verb'` / `unshift({...verb:` from src for the activity-verb test.

### Zero runtime dependencies
**Source:** `server.js:2-3` header + `test/catalogue.test.mjs` "no runtime dependency" test + `package.json` (empty `dependencies`)
**Apply to:** all new code — pure Node / existing modules only.

## No Analog Found

None. Every file in this phase extends an existing home with a same-file or sibling analog; the only genuinely new files are the two tests, which have strong siblings (`catalogue.test.mjs`, `i18n-vocab.test.mjs`, `helpers/server.mjs`, the source-scan idiom).

## Metadata

**Analog search scope:** `server.js`, `src/core/`, `src/components/`, `src/pages/`, `src/actions/`, `src/overlays/`, `test/`, `scripts/`
**Files scanned:** ~24 (14 tracked analogs read or range-read; all verified `git ls-files`-tracked)
**Pattern extraction date:** 2026-10-24
