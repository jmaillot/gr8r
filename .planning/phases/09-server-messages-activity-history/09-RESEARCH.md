# Phase 9: Server messages & activity history - Research

**Researched:** 2026-10-24
**Domain:** In-repo error-code transport (server.js ↔ src/core/api.js) and activity-log verb/extra restructure (src/actions, src/components/task-list.js, src/pages/activity.js)
**Confidence:** HIGH — every claim below is a direct in-repo verification; no external dependency is introduced by this phase.

> **Note on the research seam:** No web/docs/provider research was run. This phase touches zero
> external libraries — the questions are codebase inventories, answered by reading the source of
> truth this session. Package installs: none. Graphify: disabled in this project.

## Summary

The scout's headline fact is **wrong in an important way**: `httpError()` is *not* the dominant
error path. It has only 8 call sites (6 domain + 2 body-parse); the dominant pattern is **~55
inline `json(res, status, { error: 'English literal' })` sites** in `server.js` (62 `error:` payload
occurrences deduplicated to ~46 unique messages). A transport design that only instruments
`httpError` would leave ~90% of server errors untranslated. The right shape is a tiny server helper
(`fail(res, status, code, message, extra)`) that emits `{ error, code, ...extra }`, plus a `code`
argument on `httpError` forwarded by the three catch sites. On the client, the single insertion
point is `call()` in `src/core/api.js:60` — every consumer already writes `res.error || t('err.…')`,
so translating `error` at that boundary fixes ~20 surfaces at once with zero call-site churn.

On the activity side, phase 7 already built most of the render machinery: `VERB_KEYS` maps 24 stored
English verb fragments to `act.verb.*` keys, and `actExtraHtml` already renders structured
`{ kind, ...vars }` extras through `act.extra.*` keys. What actually remains: (1) the filters in
`src/pages/activity.js:13-21` still parse English; (2) the verb `changed status of project` is
**unmapped today and leaks English verbatim right now**; (3) legacy string extras render verbatim
(today's leak) and must be suppressed; (4) the current writers store **locale-dependent prose** in
extras — `ST[old].name`, `PR[nv].name` and `PSTAT[v].name` are `t()` getters, so a French actor
stores French prose and an English actor stores English prose into the document. New writes must
store ids and render must resolve them; legacy string extras get dropped at render, never migrated.

One contract conflict must be resolved at planning: D-01's illustrative key `err.EMAIL_TAKEN`
violates the catalogue's own `KEY_SHAPE` lint (`test/catalogue.test.mjs` — segments must start
lowercase, underscore forbidden). The research recommends **camelCase machine codes**
(`emailTaken` → key `err.emailTaken`), which keeps D-01's verbatim rule intact and fits the
existing 63-key `err.*` namespace with zero lint changes.

**Primary recommendation:** server helper `fail(res, status, code, message, extra)` + `httpError(status, message, code)`; client-side `tErr(code, params, raw)` helper in `i18n.js` applied at the `api.js call()` boundary; machine verbs = the existing `act.verb.*` camelCase suffixes; structured extras `{ kind, ...vars }` with id-valued vars resolved at render; legacy string extras suppressed at render; two parity tests (error codes, activity verbs) built on the house source-scan pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** La clé i18n est le **code verbatim** : le code serveur `EMAIL_TAKEN` se traduit
  par la clé `err.EMAIL_TAKEN` dans `src/locales/en.json` et `fr.json`. Aucune table de
  correspondance code→clé — impossible de désynchroniser les deux. — **Reversibility:**
  reversible — les clés vivent uniquement dans les catalogues JSON côté client, un renommage
  est mécanique et ne touche aucune donnée persistée.
- **D-02:** Les traductions sont des **phrases complètes avec interpolation de params**
  (`{name}`, …) — le client compose des messages naturels dans la langue de l'interface,
  pas des fragments génériques.
- **D-03:** Quand le client reçoit un code qu'il ne connaît pas, il affiche le **message
  serveur brut** (anglais) tel quel — jamais de toast vide (ERR-02). Le repli est
  purement client-side.
- **D-04:** Un **test de parité** vérifie que chaque code émis par le serveur a une entrée
  dans en.json ET fr.json — les oublis sont détectés au test, pas à l'exécution.

### the agent's Discretion

- **Transport du code dans le payload** — placement exact du champ (champ `code` à côté de
  `error` vs enveloppe), format de nommage des codes. Contrainte roadmap : la forme du
  payload ne change pas (`error` = message anglais inchangé).
- **Taxonomie des verbes d'activité** — schéma des verbes machine (dot-namespaced ou autre)
  et structure de `extra` structuré. Contrainte roadmap : les filtres classent le verbe
  stocké, plus de parsing anglais.
- **Compatibilité legacy** — mécanisme de classification des anciennes entrées sans
  migration, et suppression du prose legacy au rendu. Contrainte roadmap : les entrées
  antérieures restent listées et filtrables (ACT-02), le détail anglais legacy est
  supprimé, jamais divulgué.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Out of scope per the phase boundary: invitation
email language, `Accept-Language` negotiation (LANG-02), files (phase 12), browser coverage
(phase 10), French sweep & build gate (phase 11).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ERR-01 | A server error carries a stable machine code next to its English message, and the interface shows the translated message. | Transport design (§ Transport design): `fail()` helper + `httpError` code param; full inventory of all 55+ construction sites (§ Server error inventory); proposed ~46-code catalogue mapped onto the existing `err.*` namespace (§ Proposed code catalogue); client insertion point at `api.js call()` (§ Client insertion point). |
| ERR-02 | An error whose code is unknown to the client still shows the server's message, so no toast is ever empty. | Fallback mechanics: `t()` returns the key on miss (`i18n.js:181`) so a presence check (`has()`) must gate the lookup; raw `error` field is never removed from the payload (§ Client insertion point, § Pitfall 2). |
| ACT-01 | The activity log is displayed in the interface language, and its filters keep selecting the right entries. | Render machinery already exists (§ What phase 7 already built); the unmapped-verb leak and the filter-classification design with exact current semantics preserved (§ Filter semantics to preserve, § Machine verb scheme, § Structured extra kinds). |
| ACT-02 | Activity entries written before this milestone are still displayed and still filterable. | Zero-migration compatibility: legacy verbs stay in `VERB_KEYS`, classifier covers both vocabularies, legacy string extras suppressed not deleted (§ Legacy compatibility, § Suppression semantics). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Error code emission | API / Backend (`server.js`) | — | The server is the only constructor of HTTP error payloads; the doc-persistence endpoint just stores what the client sends. |
| Error translation + fallback | Frontend (client) | — | The server ships no catalogue (locked in REQUIREMENTS.md out-of-scope note); only the client knows the interface language. |
| Activity write shape (verb + extra) | Frontend (client) | — | `logAct()` and the two direct `unshift` sites write into the workspace document client-side; the server persists the doc opaquely. |
| Activity classification (filters) | Frontend (client) | — | Filtering happens at render time in `src/pages/activity.js` over the in-memory document. |
| Activity rendering | Frontend (client) | — | `actHtml`/`actExtraHtml` in `src/components/task-list.js`; three pages + the drawer consume them. |
| Persistence of both | Database / Storage (SQLite doc row) | — | Activity lives inside the workspace JSON document; error codes are transient payload fields, never stored. |

## Standard Stack

### Core

No new packages. The phase is served entirely by the existing zero-dependency stack.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — existing codebase) | — | — | Zero runtime dependencies by design (server.js header: "one process, zero runtime dependencies") [VERIFIED: server.js:2-3]. |

### Supporting (existing, reused)

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/core/i18n.js` `t(key, vars)` | catalogue lookup + `{name}` interpolation | the translation mechanism for codes and extras [VERIFIED: src/core/i18n.js:172-182] |
| `test/helpers/server.mjs` | real-server harness for node:test | the code-shape server test |
| `scripts/i18n-scan.mjs` pattern | position-based source extraction | the model for the two parity tests |
| `test/catalogue.test.mjs` | catalogue lint incl. en↔fr parity | where D-04's test lives or siblings it |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Translate at the `api.js call()` boundary | Translate at each of ~20 consumption sites | Per-site translation is 20 edit points and every new consumer can forget it; boundary translation is one edit point and D-03 falls out naturally. Rejected: violates the single-choke-point house style. |
| camelCase codes (recommended) | SCREAMING_SNAKE codes + a documented `err.`-namespace exception in the `KEY_SHAPE` lint | SCREAMING_SNAKE matches D-01's illustrative casing but permanently breaks the catalogue's own key grammar (needs an exception like the existing `contract.` one) and mismatches the 63 existing camelCase `err.*` keys. |
| Server-side params object in payload | Server interpolates into `error` only | Server can't translate (no catalogue — locked), so interpolation must happen client-side; params must travel structured. |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed by this phase — the audit gate does not apply.
**Packages removed due to [SLOP] verdict:** none. **Packages flagged as suspicious [SUS]:** none.

## Research Findings

### F1 — Server error construction: two patterns, not one [VERIFIED: server.js]

Pattern A — thrown errors (8 sites):

```js
// server.js:1016-1020 — verbatim
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
```

Call sites: 715, 727, 963, 984, 985, 986 (domain) and 1159, 1170 (body-parse). Three catch
sites convert them to payloads:

```js
// server.js:1268 and 1648 — verbatim (identical text in both)
return json(res, err.status || 500, { error: err.message });
// server.js:1821 — verbatim (the outermost catch-all)
if (!res.headersSent) json(res, status, { error: status >= 500 ? 'Internal server error' : err.message });
```

Pattern B — the dominant one: **55 inline `json(res, status, { error: … })` returns** spread
across every endpoint family (auth 1202-1262, workspace CRUD 1292-1376, members 1412-1453,
invites 1494-1653, misc 1113-1131, 1679). Examples verbatim:

```js
// server.js:1305
if (wsBySlug(slug)) return json(res, 409, { error: 'That URL is already taken', suggestion: uniqueSlug(slug) });
// server.js:1344
return json(res, 409, { error: 'Workspace changed elsewhere', revision: row.revision });
// server.js:1630
return json(res, 409, { error: 'An account with this email already exists. Sign in to accept the invite.', needsSignIn: true });
```

Three payloads carry a **second machine field beside `error` already** (`suggestion`,
`revision`, `needsSignIn`) — the `code` field must not disturb them; spreading `extra` last is
safe because none of the existing extra fields is named `code` or `error`.

A fourth, easily missed surface: the **per-invite row error** inside a 201 success payload:

```js
// server.js:1572 — verbatim
row.error = 'Email could not be sent. Copy the link instead.';
```

consumed at `src/overlays/modals.js:224-225` (`l.sent ? t('modal.sent') : l.error ? t('modal.notSent') : ''`, with `l.error` as a tooltip). It is not an HTTP error and never passes through an error branch — it needs its own code (`emailSendFailed`) translated where the row is rendered.

Non-JSON leftovers: `notFound(res)` (server.js:1715-1719) serves a plain-text `Not found` body for
missing static paths — not user-visible chrome (the SPA fallback covers app routes); recommend
leaving it unchanged and noting it in the plan's out-of-scope list.

### F2 — Proposed code catalogue (~46 unique messages)

Deduplicated from the 62 `error:` occurrences. Naming proposal (see F6 for why camelCase):
**code = camelCase identifier; catalogue key = `err.` + code verbatim.** Where an existing
`err.*` key already carries the same English, reuse its suffix as the code (no duplicate key).

| Code (proposed) | English message (unchanged) | Status | Params / extra |
|---|---|---|---|
| signInRequired | Sign in to continue | new | — |
| workspaceNotFound | Workspace not found | new | — (3 sites share it) |
| adminOnly | Only workspace admins can do that | new | — |
| readOnlyAccess | Your account has read-only access | **reuse existing `err.readOnlyAccess`** | — |
| emailAndPasswordRequired | Email and password are required | new | — |
| tooManyLoginAttempts | Too many attempts. Try again in 15 minutes. | new | — |
| invalidCredentials | Email or password is incorrect | new | — |
| crossOriginRejected | Cross-origin request rejected | new | — (10 sites share it) |
| unknownLocale | Unknown locale | new | — |
| signupDisabled | Sign-ups are disabled. Ask an admin for an account. | new (client has `err.signupDisabled` — check wording) | — |
| tooManyAttempts | Too many attempts. Try again later. | new | — (2 sites) |
| nameRequired | Enter your name | new | — (2 sites) |
| passwordTooWeak | Use at least 10 characters, including a number or symbol | new | — (2 sites) |
| askAdminForWorkspace | Ask a workspace administrator to create one for you | new | — |
| workspaceNameRequired | Enter a workspace name | new | — (2 sites) |
| invalidSlug | Use 2–40 lowercase letters, numbers, or hyphens | new | — (2 sites) |
| slugTaken | That URL is already taken | new | `suggestion` passes through |
| missingRevision | Missing revision | new | — |
| missingDocument | Missing workspace document | new | — |
| documentTooLarge | Workspace document is too large | new | — |
| revisionConflict | Workspace changed elsewhere | new (client `err.workspaceChanged` exists with same meaning — reuse) | `revision` passes through |
| lastOwnerLeaves | Promote someone else to owner before you leave | new | — |
| notAMember | That person is not a member of this workspace | new | — |
| removeSelfViaLeave | Use “Leave workspace” to remove yourself | new | — |
| ownerManagedRoles | Only an owner can manage admins and owners | new | — |
| needOwner | Every workspace needs an owner | new | — (2 sites) |
| unknownRole | Unknown role | new | — |
| ownerTransferOnly | Only an owner can transfer ownership | new | — |
| inviteBatchLimit | Create at most 20 invites at a time | new | — |
| invalidEmail | `Invalid email: ${email}` | new | params `{ email }` |
| alreadyMember | `${email} is already a member of ${ctx.ws.name}` | new | params `{ email, name }` |
| inviteNotPending | That invite is no longer pending | new | — |
| inviteInvalid | This invite link is not valid | **reuse existing `err.inviteInvalid`** | — (2 sites) |
| inviteAlreadyUsed | This invite has already been used | new | — (2 sites) |
| inviteExpired | This invite has expired | new | — (2 sites) |
| accountExistsSignIn | An account with this email already exists. Sign in to accept the invite. | new | `needsSignIn` passes through |
| enterValidEmail | Enter a valid email address | new | — (2 sites; distinct from invalidEmail) |
| inviteForOtherEmail | `This invite is for ${invite.email}` | new | params `{ email }` |
| workspaceGone | This workspace no longer exists | new | — |
| notFound | Not found | new | — |
| internalError | Internal server error | new | — |
| lastPrivateMember | Promote someone before removing the last member of a private project | new | — (httpError 409, line 715) |
| noWorkspaceReady | No workspace available | new | — (httpError 500, line 963) |
| bodyTooLarge | Request body too large | new | — (httpError 413, line 1159) |
| invalidJson | Invalid JSON body | new | — (httpError 400, line 1170) |
| emailSendFailed | Email could not be sent. Copy the link instead. | new | per-invite row (line 1572) |

The thrown-path catch sites (`1268`, `1648`) must forward a code when present:
`httpError(status, message, code)` sets `err.code`, and the catch sites emit
`{ error: err.message, code: err.code }` — a codeless error (the outermost 500 catch-all at
1821, e.g. a raw SQLite failure) emits no `code` field, which is exactly the D-03 fallback case.

### F3 — Transport design (discretion zone — recommendation)

Payload shape stays `{ error: <unchanged English>, ... }`; `code` (and optional `params`) are
added fields beside it:

```json
{ "error": "Invalid email: bad@x", "code": "invalidEmail", "params": { "email": "bad@x" } }
```

Server-side mechanics (recommended):

```js
// new helper beside json()
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
// httpError gains an optional third argument
function httpError(status, message, code) { const err = new Error(message); err.status = status; err.code = code; return err; }
```

All 55 inline sites become `fail(res, 409, 'slugTaken', 'That URL is already taken', { suggestion: uniqueSlug(slug) })` — mechanical, greppable, and the parity test's enumeration source (D-04).

**D-04 enumeration mechanism:** `server.js` cannot be imported by a test (top-level boot side
effects — the suite spawns it as a process instead). The house pattern is position-based source
extraction (`scripts/i18n-scan.mjs`, `test/i18n-core-features.test.mjs:162` already extracts
`call('GET')` verbs by regex). The parity test reads `server.js` and extracts:
`/fail\(res,\s*\d+,\s*'([A-Za-z]+)'/g` plus the `httpError(..., 'code')` third arguments, then
asserts every extracted code has a non-empty value under `err.<code>` in **both** `en.json` and
`fr.json`. This also pins the rule that a `code:` may never be built dynamically server-side.

### F4 — Client error surfaces (complete inventory) [VERIFIED: src]

| Surface | File:line | Pattern |
|---|---|---|
| Save/conflict handler | `src/main.js:76-95` | 401 → `t('err.sessionExpired')`; 403 → **`toast(error || tk('err.readOnlyAccess'))` — raw server message today**; 409 → translated reload toast; default → translated retry toast |
| Document-save notify | `src/core/store.js:122` | `notify({ status: res.status, error: res.error })` → the event above |
| Action toasts | `src/actions/actions.js` ×15 (367, 1717, 1727, 1772, 1784, 1808, 1825, 1846, 2029, 2219, 2240, 2781, 2829…) | `toast(res.error || t('err.fallback'))` |
| Auth form errors | `src/actions/actions.js:2477, 2489, 2560, 2622, 2780` | `S.ui.errors = { login/join/email/ws: res.error || t('err.fallback') }` → rendered by `src/pages/auth.js:41,58` and `ferr()` |
| Invite modal form | `src/actions/actions.js:1684` | `S.ui.errors = { invite: res.error || … }` |
| Join (deep-link) page | `src/main.js:172` | `S.ui.join = { …, error: inv.error || tk('err.inviteInvalid') }` → `auth.js:56-58` renders `esc(j.error)` |
| Per-invite rows | `src/overlays/modals.js:224-225` | `l.sent ? t('modal.sent') : l.error ? t('modal.notSent') : ''`, tooltip `esc(l.error)` |

Every one of these reads the `error` string returned by `api.js call()` — which is why the
boundary translation (F5) fixes them all at once.

### F5 — Client insertion point (discretion zone — recommendation)

`src/core/api.js:60` is the single return point of every HTTP call:

```js
// src/core/api.js:60 — verbatim
return { ok: res.ok, status: res.status, data, error: data?.error };
```

Recommended: add to `src/core/i18n.js` a leaf helper (i18n is the catalogue layer; api.js
already imports `t` from it):

```js
/* Translate a server error code; unknown code → the raw server message (D-03). */
export function has(key) { const c = catalogues.get(locale); return (c && Object.hasOwn(c, key)) || Object.hasOwn(catalogues.get(BASE_LOCALE) || {}, key); }
export function tErr(code, params, raw) { const k = `err.${code}`; return has(k) ? t(k, params) : raw; }
```

and in `call()`: `error: data?.code ? tErr(data.code, data?.params, data?.error) : data?.error`.

**Why the presence check is mandatory:** `t()` returns the *key itself* on a miss
(`src/core/i18n.js:181` — `return key;`). A naive `t('err.' + code)` would render the literal
string `err.unknownCode` in the toast — an even worse failure than an empty one. D-03's
"never an empty toast" requires gating on `has()` (or comparing `t(k) !== k`, which is brittle).
Locale is always resolved before any render (LOC-06), so the boundary translation is never
premature. `toast()` escapes its message (`src/ui/toast.js:15` — `esc(msg)`), so interpolated
server params (emails, workspace names) stay inert.

### F6 — Code naming vs the catalogue's own lint (conflict to resolve)

`test/catalogue.test.mjs:33` pins the key grammar verbatim:

```js
const KEY_SHAPE = /^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*|\.[0-9]+)+$/;
```

`err.EMAIL_TAKEN` breaks it twice: the second segment must start with a lowercase letter, and
`_` is not in the segment alphabet at all. Two resolutions:

- **A (recommended): camelCase codes.** `emailTaken` → `err.emailTaken` — verbatim per D-01,
  fits `KEY_SHAPE` unchanged, and matches the 63 existing `err.*` keys (all camelCase:
  `err.sessionExpired`, `err.readOnlyAccess`, …). No lint change, no exception.
- **B: SCREAMING_SNAKE codes** exactly as D-01's example, plus a documented `err.`-namespace
  exemption in `KEY_SHAPE` (precedent: the `CONTRACT_NAMESPACE = 'contract.'` exemption at
  `test/catalogue.test.mjs:40-42`).

Both honor D-01's *essence* (key = code verbatim, no mapping table). Option A reinterprets
D-01's illustrative casing — flag this at planning so the choice is conscious.

### F7 — Activity inventory: writers, verbs, extras [VERIFIED: src]

One choke point plus two bypasses:

```js
// src/core/store.js:264-266 — verbatim
export function logAct(verb, t, extra = '') {
  D().activity.unshift({ id: uid('a'), by: D().me, verb, task: t?.id || null, project: t?.project || null, at: Date.now(), extra });
```

Direct `unshift` bypasses: `src/actions/actions.js:332` (verb `changed status of project`,
extra `'to ' + PSTAT[v].name`) and `src/actions/actions.js:1348` (verb `created project`,
extra `''`).

**All 25 stored verbs today** (site → verb → extra shape):

| Verb (stored, verbatim) | Site(s) | Extra today |
|---|---|---|
| created | actions.js:92 | '' |
| completed | actions.js:107 | '' |
| moved (status change) | actions.js:109 | `` `from ${ST[old].name} to ${ST[nv].name}` `` — **t()-derived prose** |
| assigned | actions.js:126 | `` `to ${mem(nv)?.name}` `` or `'(unassigned)'` |
| changed priority of | actions.js:127 | `` `to ${PR[nv].name}` `` — **t()-derived prose** |
| changed due date of | actions.js:128 | `` `to ${fmtDate(nv)}` `` or `'(cleared)'` — frozen-at-write date |
| changed start date of | actions.js:129 | same |
| moved (project change) | actions.js:133 | `` `to ${p.name}` `` |
| updated labels on | actions.js:134 | '' |
| renamed | actions.js:135 | `` `to “${nv}”` `` |
| set repeat on | actions.js:136 | repeat id lowercased or `'off'` |
| estimated | actions.js:137 | estimate string or `'none'` |
| updated dependencies of | actions.js:138 | '' |
| assigned a subtask on | actions.js:320-328 | `to <name>` / `(unassigned)` |
| set a subtask due date on | actions.js:320-328 | date / `(cleared)` |
| archived | actions.js:558 | '' |
| completed subtask on / reopened subtask on | actions.js:824 | `` `“${s.title}”` `` |
| removed a file from | actions.js:856 | '' |
| added a file to | actions.js:894 | file name |
| commented on | actions.js:956 | '' |
| restored | src/actions/archive.js:16 | '' |
| converted a subtask of | src/actions/subtasks.js:74 | `` `into ${n.key}` `` |
| changed status of project | actions.js:332 | `'to ' + PSTAT[v].name` — **t()-derived prose** |
| created project | actions.js:1348 | '' |

`ST`/`PR`/`PSTAT`/`LB` names are `get name() { return t('task.status.…') }` getters
(`src/core/constants.js:30-150`) — the stored extra prose is whatever locale the *actor* had
active. This is the concrete leak machine extras must end.

### F8 — What phase 7 already built (do not rebuild) [VERIFIED: src/components/task-list.js:130-196]

- `VERB_KEYS`: explicit map of 24 stored English fragments → `act.verb.*` keys; `verbLabel(v)`
  falls back to verbatim for unknown verbs. All current writers are covered **except**
  `changed status of project` — it renders as raw English **today**, in every locale. This is a
  live ACT-01 bug the phase fixes (new key `act.verb.projectStatusChanged` in en+fr + map entry).
- `actExtraHtml(e)` already renders structured extras: `{ kind: 'recur', id }` →
  `RECUR_EXTRA` keys; any other object → `t(`act.extra.${e.kind}`, e)`; **a legacy string extra
  renders verbatim** (`return `<span class="muted">${esc(e)}</span>`;`) — the exact line the
  suppression policy changes.
- Existing `act.extra.*` keys ready for reuse (verbatim values): `statusMoved: "from {from} to {to}"`,
  `to: "to {value}"`, `unassigned: "(unassigned)"`, `cleared: "(cleared)"`,
  `renamedTo: "to “{value}”"`, `off: "off"`, `none: "none"`, `inProject: "in"`.
- Render consumers: `actHtml` used by `pages/activity.js:41`, `pages/home.js:107`,
  `pages/members.js:167`, `views/project-overview.js:53,69`; the task drawer
  (`overlays/drawer.js:128`) has its **own** inline verb rendering with a different fallback
  (`a.verb.replace(/ of$/, '')`) — unify both through one exported helper.
- Notifications are **not** activity writers: the only `notifs` writer is the demo seed
  (`src/data/seed.js:419`); `notifText` already follows the legacy-verbatim/structured-compose
  pattern. Out of scope, but the established precedent.

### F9 — Machine verb scheme (discretion zone — recommendation)

**Machine verb = the camelCase suffix of its `act.verb.*` key.** New writers store
`verb: 'commentedOn'`; rendering becomes `t('act.verb.' + verb)` gated on catalogue presence,
with `VERB_KEYS` retained for legacy fragments. The vocabularies overlap by design: the 8
single-word legacy verbs (`created`, `completed`, `moved`, `assigned`, `renamed`, `archived`,
`restored`, `estimated`) are byte-identical to their machine forms, so one lookup path serves
both; multi-word legacy fragments (`'changed priority of'`, …) keep their `VERB_KEYS` entries.

Full machine set (26): `created, createdProject, completed, moved, assigned, changedPriorityOf,
changedDueDateOf, changedStartDateOf, updatedLabelsOn, renamed, setRepeatOn, estimated,
updatedDependenciesOf, archived, restored, commentedOn, addedAFileTo, removedAFileFrom,
addedSubtaskTo, convertedASubtaskOf, assignedASubtaskOn, setASubtaskDueDateOn,
completedSubtaskOn, reopenedSubtaskOn, projectStatusChanged` — 25 map to existing keys, only
`projectStatusChanged` is new (en + fr). Note: `moved` deliberately stays ONE verb for both
status moves and project moves (matching legacy) — see Open Question 1.

**Filter classification (replaces `activity.js:13-21` English parsing):** an explicit
`verb → category` table covering BOTH vocabularies, e.g. `comments: [commentedOn, 'commented
on']`, `status: [moved, completed, completedSubtaskOn, reopenedSubtaskOn, 'moved',
'completed', 'reopened', …]`, `projects: [createdProject, projectStatusChanged, 'created
project', 'changed status of project']`. It is a data lookup keyed on the stored string — the
"no English parsing" constraint is satisfied because no `includes()`/regex over English runs at
render time; the table is pinned by a test (see Validation Architecture).

### F10 — Structured extra kinds (proposal)

Writers store `{ kind, ...vars }` with **ids/dates/names as machine values**; the render-side
per-kind var table resolves ids through the existing vocab keys before interpolation:

| Kind | Writer stores | Key | Vars resolved at render by |
|---|---|---|---|
| statusMoved | `{ from: 'todo', to: 'review' }` | `act.extra.statusMoved` ✅ exists | `t('task.status.'+id)` |
| assignedTo | `{ value: <member name> }` | `act.extra.to` ✅ | name is data — as-is |
| unassigned | `{}` | `act.extra.unassigned` ✅ | — |
| prioritySet | `{ value: 'urgent' }` | `act.extra.to` ✅ | `t('task.priority.'+id)` |
| dateSet (due/start) | `{ value: '2026-11-01' }` | `act.extra.to` ✅ | `formatDate` (locale at render — never frozen) |
| dateCleared | `{}` | `act.extra.cleared` ✅ | — |
| renamedTo | `{ value: <new title> }` | `act.extra.renamedTo` ✅ | title is data |
| repeatSet | `{ id: 'daily' }` / `{}` | `RECUR_EXTRA` / `act.extra.off` ✅ | existing RECUR_EXTRA map |
| estimateSet | `{ value: '30m' }` / `{}` | `act.extra.none` ✅ | `fmtEstimate` (already locale-aware) |
| fileAdded / fileRemoved | `{ value: <file name> }` | new `act.extra.value` (`"{value}"`) | name is data |
| subtaskAdded | `{ value: <title> }` | new `act.extra.quoted` (`“{value}”`) | title is data |
| subtaskConverted | `{ value: <key> }` | new `act.extra.into` (`into {value}`) | key is data |
| movedToProject | `{ value: <project name> }` | `act.extra.to` ✅ | name is data |
| projStatusSet | `{ value: 'active' }` | `act.extra.to` ✅ | `t('project.status.'+id)` |

Net new catalogue keys: `act.verb.projectStatusChanged` + ~3 `act.extra.*` (value/quoted/into) ×
2 locales. French values must satisfy `test/french-typography.test.mjs` (U+00A0 before `:`,
U+202F before `; ! ?`, « » with U+00A0, U+2019 apostrophe, NFC).

### F11 — Suppression semantics (discretion zone — recommendation)

Legacy compatibility has three layers, all zero-migration:

1. **Legacy verbs** keep rendering translated via `VERB_KEYS` (24/25 already mapped; the 25th
   gets its key). Unknown legacy verbs render verbatim — the D-12 rule notifications already
   follow; a verb we cannot translate is data, not prose.
2. **Legacy string extras** (`'to Review'`, `'from To Do to In Progress'`, `'to Sarah Chen'`):
   change `actExtraHtml`'s string branch to render **nothing**. This drops mechanical legacy
   values too (a legacy `'30m'` estimate detail) — that is what "dropped rather than leaked"
   means, and no information the interface can still localize is lost. The drawer line inherits
   the same helper, so one edit covers both.
3. **Filters** classify via the table (F9), so a legacy `moved` filters identically after the
   change — the table is the only place the old strings appear.

## Architecture Patterns

### System Architecture Diagram

```
 HTTP error path (transient, never stored):
   route handler ──throw httpError(status, msg, code)──► catch site ─┐
   route handler ──return fail(res, status, code, msg, extra)────────┤
                                                                     ▼
                                              json(res, status, { error, code, params?, …extra })
                                                                     │ fetch
                                                                     ▼
                                    api.js call() → tErr(code, params, raw)   ← D-03 fallback
                                                                     │
                                       ┌─────────────────────────────┼──────────────────┐
                                       ▼                             ▼                  ▼
                                 toast(res.error)            S.ui.errors (forms)   save-error event
                                                                (auth / modals / settings)

 Activity path (stored inside the workspace document):
   action ──► logAct(machineVerb, task, {kind,...ids}) ──► D().activity.unshift
   action ──► direct unshift (2 sites) ──────────────────► same shape
                                                                     │ save/push
                                                                     ▼
                                              server persists doc verbatim (no codes, no parsing)
                                                                     │ render
                                                                     ▼
                     verbLabel(verb) → act.verb.*   actExtraHtml({kind}) → act.extra.* + id resolution
                                                                     │
                                                       filter: actCategory(verb) ∈ {comments,status,projects}
                                                       (legacy English fragments classified by the same table)
```

### Recommended Project Structure

No new files required; additions land in existing homes:

```
src/core/i18n.js            # + has(), tErr() (leaf, plain-Node testable)
src/core/api.js             # call() translates at the boundary
server.js                   # + fail() helper; httpError gains code; 55 sites converted
src/components/task-list.js # VERB_KEYS + machine-verb path + actCategory() + per-kind var table
src/actions/actions.js      # logAct call sites → machine verbs + structured extras
src/actions/{archive,subtasks}.js
src/pages/activity.js       # filters call actCategory()
src/locales/{en,fr}.json    # + err.<code> ×~40, + act.verb.projectStatusChanged, + ~3 act.extra.*
test/error-codes.test.mjs   # D-04 parity + payload-shape server test
test/activity-verbs.test.mjs# verb/extra/filter parity
```

### Pattern 1: Single choke point both directions

**What:** one constructor per artifact (`fail()` server-side, `tErr()` client-side) and one
translation point (`call()`).
**When to use:** every error and every activity write goes through them; the parity tests then
have a complete, greppable surface to enumerate.
**Example:** see F3/F5 code blocks (all verbatim-anchored above).

### Anti-Patterns to Avoid

- **Translating at consumption sites:** 20+ `toast(res.error …)` edits, each a chance to forget
  the fallback; one boundary edit instead.
- **Storing display prose in the document:** `logAct('moved', t, \`from ${ST[old].name} to …\`)`
  freezes the actor's locale into shared data — store ids, resolve at render.
- **A dynamic code lookup without a presence check:** `t('err.' + code)` renders the key string
  on a miss; gate with `has()` (D-03).
- **Migrating legacy activity rows:** explicitly forbidden by the roadmap constraint; render and
  classify instead.
- **Regex/includes over stored verbs at render:** the exact pattern being removed
  (`a.verb.includes('comment')`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Param interpolation | custom message composer | `t(key, vars)` (`{name}` subset, CLDR plurals) | already contract-tested; scan knows its placeholders |
| Date rendering in extras | storing formatted dates | store ISO/timestamp, `formatDate` at render | a stored `7/24/26` is English-shaped and frozen |
| Code→translation presence check | `try { t(k) } catch` or key-echo comparison | `has()` via `Object.hasOwn` on the catalogue map | deterministic, testable in plain Node |
| Parity enumeration | a runtime registry imported by the test | source regex extraction (i18n-scan style) | server.js is not importable (boots on import); the house pattern already exists |
| Legacy classification | a migration script over stored docs | static two-vocabulary table + render suppression | no data write, no backup, byte-identical legacy docs |

**Key insight:** the catalogue and the scan infrastructure from phases 5-7 already solve every
sub-problem; the phase is wiring, not inventing.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Activity entries inside each workspace document (`workspaces.doc` JSON in SQLite): legacy English verb fragments + prose extras; the demo seed carries the same shapes (`src/data/seed.js:404+`, e.g. `A('m2','moved','t3','p1',38,'to Review')`) | none — legacy stays byte-identical (roadmap constraint); only render/classify adapt |
| Live service config | None — no external service holds verbs or error text (verified: server state is SQLite + process env only) | none |
| OS-registered state | None | none |
| Secrets/env vars | None — no new env keys; codes are not configuration | none |
| Build artifacts | `dist/` bundles + the French catalogue chunk; `fr.json`/`en.json` gains keys, so a rebuild is required for the chunk to carry them | run `npm run build` (prebuild scan runs first) |

## Common Pitfalls

### Pitfall 1: Instrumenting only `httpError` and calling it done
**What goes wrong:** 6 of 61 error sites translated; every auth/invite/member error stays English.
**Why it happens:** the scout brief overstated httpError's share.
**How to avoid:** the `fail()` conversion covers all inline sites; the parity test greps for
`fail(` AND `httpError(` third args, so an unconverted inline `json(res, …, { error:` site…
**Warning signs:** add a scan assertion that no `json(res, \d+, { error:` pattern remains in
server.js after conversion (the test fails while any site is missed).

### Pitfall 2: `t()` silently returning the key
**What goes wrong:** unknown code renders the literal `err.someCode` — worse than English.
**Why it happens:** `t()` returns the key on miss by contract (`i18n.js:181`).
**How to avoid:** `tErr` gates on `has()`; D-03 test covers known + unknown code paths.
**Warning signs:** any toast text matching `/^err\.[a-z]/`.

### Pitfall 3: Forgetting the three catch sites and the per-invite row
**What goes wrong:** thrown `httpError`s (private-project 409, body limits) and the
`emailSendFailed` row stay codeless.
**How to avoid:** the parity test also extracts the catch-site emission shape; the row error is
translated at `modals.js:224-225` via its own code.
**Warning signs:** payload-shape server test asserting `code` on a thrown-path endpoint.

### Pitfall 4: Breaking filter selection with a "better" taxonomy
**What goes wrong:** today the STATUS filter selects `moved` entries — including task-to-project
moves — and the subtask complete/reopen verbs; a naive namespace split (`project.moved`) changes
which entries each filter selects, violating success criterion 3.
**How to avoid:** the classifier table is written to reproduce today's selection exactly
(verified semantics in § F9); any deliberate semantic change is an explicit planner decision.
**Warning signs:** diff of filter output over the seed's activity array before/after.

### Pitfall 5: New French values failing the typography gate
**What goes wrong:** `Adresse e-mail invalide: {email}` (plain space) fails
`test/french-typography.test.mjs`; `…` vs `…`, straight quotes in fr values.
**How to avoid:** write fr values with U+00A0/U+202F/U+2019/U+2026 from the start; run the
typography test per batch.
**Warning signs:** the test names the offending rule and position.

### Pitfall 6: The i18n-scan tripping on new shapes
**What goes wrong:** a new user-visible literal left inline (e.g. a hardcoded fallback string in
`actExtraHtml`) fails `npm run build` via prebuild.
**How to avoid:** every new display string goes into both catalogues; dynamic keys
(`t('act.verb.' + v)`) are skipped by the scan (`scripts/i18n-scan.mjs:1158` — "a dynamic key is
not checked here") which is precisely why D-04-style parity tests must exist.

## Code Examples

### The translated boundary (client)

```js
// src/core/api.js — call() return, after the change
const code = data?.code;
return { ok: res.ok, status: res.status, data, error: code ? tErr(code, data?.params, data?.error) : data?.error };
```

### The classifier (render)

```js
// src/components/task-list.js — beside VERB_KEYS
const ACT_CATEGORIES = {
  comments: new Set(['commentedOn', 'commented on']),
  status:   new Set(['moved', 'completed', 'completedSubtaskOn', 'reopenedSubtaskOn', 'moved', 'completed', 'reopened']),
  projects: new Set(['createdProject', 'projectStatusChanged', 'created project', 'changed status of project']),
};
export const actCategory = verb => Object.keys(ACT_CATEGORIES).find(k => ACT_CATEGORIES[k].has(verb)) || null;
```

### The parity test skeleton (D-04)

```js
// test/error-codes.test.mjs — plain Node, no server boot
import serverSource from 'node:fs'.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const codes = new Set();
for (const m of serverSource.matchAll(/fail\(res,\s*\d+,\s*'([A-Za-z][A-Za-z0-9]*)'/g)) codes.add(m[1]);
for (const m of serverSource.matchAll(/httpError\(\s*\d+,\s*'[^']*',\s*'([A-Za-z][A-Za-z0-9]*)'/g)) codes.add(m[1]);
for (const code of codes) {
  assert.ok(typeof en[`err.${code}`] === 'string' && en[`err.${code}`] !== '', `en missing err.${code}`);
  assert.ok(typeof fr[`err.${code}`] === 'string' && fr[`err.${code}`] !== '', `fr missing err.${code}`);
}
assert.ok(!/json\(res,\s*\d+,\s*\{\s*error:/.test(serverSource), 'an inline error payload survived the fail() conversion');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Locale-dependent prose frozen into stored extras (`from ${ST[old].name} to …`) | ids in structured extras, resolved at render | this phase | stored docs become locale-neutral going forward |
| HTTP error payloads without codes (HTTP status + English prose only) | `code` field beside `error` (Stripe-style machine code + human message) | industry-standard pattern [ASSUMED] | client-side translation without a server catalogue |

**Deprecated/outdated:** none in-repo; `notFound()` plain-text body stays (out of scope).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | camelCase codes (option A) faithfully implement D-01's verbatim rule despite D-01's `EMAIL_TAKEN` example casing | F6 | Low — planner/user confirms the casing choice; option B is the ready alternative |
| A2 | Success criterion 3 means "filters select exactly what they select today" (behavior-preserving), including the `moved`-project-move-in-status-filter quirk | F9/Pitfall 4 | Medium — if the user intends the quirk fixed, the classifier table changes; flagged as Open Question 1 |
| A3 | Suppressing ALL legacy string extras (including mechanical ones like a legacy `'30m'` estimate) satisfies "dropped rather than leaked" | F11 | Low — a stricter per-kind whitelist is possible but adds a table keyed on English prose |
| A4 | "Stripe-style code field" as industry pattern | State of the Art | None — informational only |
| A5 | No other consumer of `res.error` needs the raw English string once translated | F5 | Low — all found consumers render it to users; server tests assert English via direct HTTP, not via api.js |

## Open Questions

1. **Filter semantics: preserve or fix the `moved` quirk?**
   - What we know: a task moved *between projects* logs verb `moved` and is selected by the
     STATUS filter today; the PROJECTS filter only matches the two project verbs.
   - What's unclear: whether "keep selecting the right entries" freezes today's selection or
     licenses moving project-moves into the projects filter.
   - Recommendation: preserve today's selection (single machine verb `moved`, classified as
     status) — behavior-preserving is this project's standing discipline; note the quirk in the
     plan.
2. **Code casing: option A (camelCase) vs option B (SCREAMING_SNAKE + lint exception).**
   - Recommendation: A; requires consciously reinterpreting D-01's example casing.
3. **Should `err.signupDisabled` / `err.workspaceChanged` reuse existing client keys whose
   wording nearly matches the server's?** Recommendation: reuse when the English matches the
   server message (or adjust the catalogue value to match the server verbatim — the English
   catalogue may be edited; the *server* message may not).
4. **The drawer's divergent verb fallback** (`a.verb.replace(/ of$/, '')`): unify with
   `verbLabel` or keep? Recommendation: unify; the strip hack exists only for unmapped legacy
   verbs.

## Environment Availability

SKIPPED — no external dependencies: no new packages, no services, no CLIs beyond Node 24
(engines: ">=24" [VERIFIED: package.json]); all tooling (node:test, vite, playwright) already
installed and exercised by 391 passing node tests + 6 Chromium tests.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in), 391 cases across 34 files, all green [VERIFIED: run this session] |
| Config file | none — `npm test` globs `test/*.test.mjs` |
| Quick run command | `node --test test/error-codes.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ERR-01 | every server code has en+fr entries | static parity | `node --test test/error-codes.test.mjs` | ❌ Wave 0 |
| ERR-01 | payload carries `{error, code}` beside unchanged English | server integration (real server, e.g. duplicate signup → 409 + code) | same file | ❌ Wave 0 |
| ERR-01 | no unconverted inline error payload remains | static scan assertion | same file | ❌ Wave 0 |
| ERR-02 | unknown code → raw server message, never empty/never the key | unit (`tErr` known/unknown/missing-params) | same file or `test/i18n-locale.test.mjs` | ❌ Wave 0 |
| ACT-01 | every written verb (legacy + machine) is classified and has en+fr keys | static verb parity (extract logAct/unshift verbs from src) | `node --test test/activity-verbs.test.mjs` | ❌ Wave 0 |
| ACT-01 | filters select the same entries as today | unit over the seed's activity array + synthetic legacy/machine rows | same file | ❌ Wave 0 |
| ACT-02 | legacy rows render translated, prose suppressed | unit (`actExtraHtml('to Review') === ''`, `verbLabel('commented on')` translated) | same file | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test test/error-codes.test.mjs test/activity-verbs.test.mjs`
- **Per wave merge:** `npm test` (391+ cases) + `npm run lint && npm run format:check && npm run build`
- **Phase gate:** full suite green before `/gsd-verify-work`; e2e untouched (phase 10 pins it).

### Wave 0 Gaps

- [ ] `test/error-codes.test.mjs` — parity + shape + fallback (ERR-01/02)
- [ ] `test/activity-verbs.test.mjs` — verb/extra/filter parity + suppression (ACT-01/02)

*(Test infra otherwise complete — harness, catalogue tests and source-scan patterns all exist.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | untouched by this phase |
| V3 Session Management | no | untouched |
| V4 Access Control | no | `requireWorkspace` role gates unchanged; error *messages* gain codes, gates do not move |
| V5 Input Validation | yes | catalogue values stay plain text (I18N-06 lint: no `<`, `>`, `"`); server-sent params rendered only through escaping sinks (`toast` esc; form errors — see observation below) |
| V6 Cryptography | no | none |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Catalogue value injecting markup (I18N-06) | Tampering | existing FORBIDDEN-char lint in `test/catalogue.test.mjs` — new `err.*`/`act.*` values are scanned automatically |
| Server-sent `params`/`code` reflected into DOM | Tampering/Info Disclosure | `code` is matched against a fixed key set (`has()`), never interpolated into markup; params flow through the same escaping sinks as today |
| **Pre-existing observation (not introduced here):** `src/pages/auth.js:41` renders the login error `${e.login}` unescaped inside an alert span | Tampering | server messages are fixed strings + email values gated by `emailOk`; recommend escaping it while touching this surface (one-line hardening, planner's call) |

## Sources

### Primary (HIGH confidence — in-repo, read this session)
- `server.js` — httpError (1016-1020), json(), catch sites (1268, 1648, 1821), all 62 `error:` sites, invite row error (1572), notFound (1715)
- `src/core/api.js` — call() return shape (60), existing `t` import
- `src/core/i18n.js` — t()/interpolate/return-key-on-miss (172-182), leaf-module contract
- `src/components/task-list.js:130-196` — VERB_KEYS, verbLabel, RECUR_EXTRA, actExtraHtml, actHtml
- `src/pages/activity.js:1-46` — the English-parsing filters
- `src/actions/actions.js`, `src/actions/archive.js`, `src/actions/subtasks.js` — all 25 verb writes
- `src/core/store.js:264-266` — logAct; `src/core/constants.js` — t()-getter vocab names
- `src/main.js:76-95,172`, `src/pages/auth.js`, `src/overlays/modals.js`, `src/overlays/drawer.js:128` — client surfaces
- `test/catalogue.test.mjs` (KEY_SHAPE), `test/french-typography.test.mjs`, `test/i18n-vocab.test.mjs`, `test/helpers/server.mjs`, `scripts/i18n-scan.mjs` (dynamic-key skip at 1158), `scripts/fr-parity.mjs`, `package.json`

### Secondary (MEDIUM confidence)
- none required

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new stack; existing modules read in full
- Architecture: HIGH — every construction/consumption site enumerated from source this session
- Pitfalls: HIGH — each anchored to a verified line or an existing test gate

**Research date:** 2026-10-24
**Valid until:** 2026-11-23 (in-repo facts; re-verify only if server.js/task-list.js are refactored before planning)
