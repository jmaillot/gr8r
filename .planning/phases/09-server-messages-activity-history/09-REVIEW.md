---
phase: 09-server-messages-activity-history
depth: standard
files_reviewed: 61
status: issues_found
findings:
  critical: 3
  warning: 9
  info: 4
---

# Phase 9: Code Review Report — Server Error Codes & Activity History

**Reviewed:** 2026-10-24
**Scope:** `server.js`, `src/core/*` (api, i18n, utils, store), `src/actions/*`, `src/components/task-list.js`, `src/pages/*` (activity, auth, settings), `src/overlays/*`, `src/locales/*.json`, `test/*` (error-codes, activity-verbs, parity suites).
**Stance:** Adversarial, standard depth. Every claim below was verified against the current source with line-level greps and test execution.

## Summary

Three BLOCKERs, all on the phase's own must-have contract (ERR-01 / ERR-02 / ACT-01):

1. The server's **thrown** errors (`httpError(...)`) never carry a machine code, so six catalogued `err.*` keys are dead and French users see raw English for real, reachable errors (last-private-member 409, body-too-large 413, invalid JSON 400, signup conflicts).
2. The **client/server params contract is broken**: `fail()` spreads extras flat into the payload, but `api.js` reads `data.params` — always `undefined` — so interpolated error messages render with literal `{email}`/`{name}` placeholders.
3. Legacy English activity prose is **divulged** at render instead of suppressed, contradicting the phase domain, and the only test that would pin suppression is `skip`ped.

The static parity test (`test/error-codes.test.mjs`) passes — and cannot catch any of the three blockers, because it is one-directional and the params path is never exercised end-to-end.

## Critical Issues

### CR-01: Thrown `httpError` calls never emit a machine code — six catalogued `err.*` keys are dead

**Files:** `server.js:715, 727, 963, 984, 985, 986, 1167, 1178`
**Classification:** BLOCKER

Every `fail(res, status, code, message)` site correctly emits a camelCase code (41 unique codes, all catalogued in EN and FR — verified). But all eight **thrown** `httpError()` calls omit the third `code` argument:

- `server.js:715` — `throw httpError(409, 'Promote someone before removing the last member of a private project')` (reached from member DELETE/leave paths)
- `server.js:727` — `throw httpError(404, 'Workspace not found')` (via `updateDoc`)
- `server.js:963` — `throw httpError(500, 'No workspace available')`
- `server.js:984, 985, 986` — `createUser` throws for invalid email / short password / taken email
- `server.js:1167` — `reject(httpError(413, 'Request body too large'))`
- `server.js:1178` — `reject(httpError(400, 'Invalid JSON body'))`

The three catch sites (1276, 1657, 1830) transfer `code: err.code` — always `undefined` for these throws — and `JSON.stringify` drops the field. The plan's must-have truth explicitly requires "les erreurs levées (lastPrivateMember 715, noWorkspaceReady 963, bodyTooLarge 1159, invalidJson 1170) émettent leur code via les catch sites". This is not satisfied.

Consequences, all user-visible:

- `err.lastPrivateMember`, `err.noWorkspaceReady`, `err.bodyTooLarge`, `err.invalidJson`, `err.passwordTooShort`, `err.accountExists` exist in **both** catalogs (verified by key scan) but are emitted by nothing and referenced by no client code — dead keys plus untranslated UX. A French admin removing the last member of a private project sees English; a French user who triggers 413/400 sees English.
- The signup paths route `createUser` throws through catch sites 1276/1657, so `passwordTooShort` and `accountExists` never reach the client as codes either — only the inline `fail(res, 400, 'passwordTooWeak', ...)` on the direct body check does.

**Why the parity test cannot catch it:** the test's extraction is one-directional (emitted code → catalog entry). There is no reverse check that every `err.*` catalog key is emitted or consumed, and no assertion that the four named thrown errors carry codes. The test's second regex (`httpError(status, 'msg', 'code')`) currently matches zero sites, so it silently pins the buggy shape.

**Fix:**
```js
// server.js — add the code as the third argument at every throw site
throw httpError(409, 'Promote someone before removing the last member of a private project', 'lastPrivateMember');
reject(httpError(413, 'Request body too large', 'bodyTooLarge'));
reject(httpError(400, 'Invalid JSON body', 'invalidJson'));
// createUser:
throw httpError(400, 'Enter a valid email address', 'notValidEmail');
throw httpError(400, 'Use at least 10 characters', 'passwordTooShort');
throw httpError(409, 'An account with that email already exists', 'accountExists');
```
Add a reverse-parity assertion to `test/error-codes.test.mjs` (every `err.<code>` key that is not a documented client-side code must be extractable from `server.js`), and pin the four named throws with a server-integration test.

### CR-02: Interpolation params are never transported — translated errors render with literal `{email}` / `{name}` placeholders

**Files:** `server.js:1037-1039` (fail), `src/core/api.js:60`, `src/core/i18n.js:139-144, 195-197`, `src/overlays/modals.js:225`
**Classification:** BLOCKER

The contract is split across three layers, and the middle link is broken:

- Server: `fail()` spreads `extra` flat into the payload: `json(res, status, { error: message, code, ...extra })`. For `alreadyMember` it passes `{ email, name }` — so the payload is `{ error, code, email, name }`. **No `params` field is ever sent.**
- Client: `api.js:60` — `error: data?.code ? tErr(data.code, data?.params, data?.error) : data?.error`. `data.params` is **always `undefined`** for every server response.
- i18n: `t(key, undefined)` → `interpolate(str, undefined)` returns the string unchanged — the placeholders survive as literal braces.

Result: a French user who invites an existing member sees the toast literally `"{email} is already a member of {name}"` (catalog value `"… est déjà membre de {name}"`). Same for `err.inviteForOtherEmail` (`"This invite is for {email}"`) on the join flow. This is exactly the "never an empty/broken message" outcome ERR-02 was supposed to prevent — the message is translated but corrupted.

`src/overlays/modals.js:225` calls `tErr(l.code, l.params, l.error)` with `l.params` equally undefined; it only works today because `err.emailSendFailed` happens to have no placeholders.

**Why the tests can't catch it:** `test/error-codes.test.mjs` calls `tErr('alreadyMember', { email, name }, 'raw')` with **hand-built params** — it validates the resolver, never the transport. No test exercises `api.call()` against a real server response carrying interpolated codes.

**Fix (pick one and pin it):**
1. Server-side: nest extras under `params` — `json(res, status, { error, code, params: extra })` — and keep top-level extras only for machine fields the client reads (`needsSignIn`, `revision`, `suggestion`); or
2. Client-side: pass the whole payload as vars — `tErr(data.code, data, data?.error)` — safe because `interpolate` only replaces keys the message names.
Either way, add an integration test: call the real invite endpoint, assert the rendered string in FR contains no `{`/`}`.

### CR-03: Legacy English activity prose is divulged, not suppressed — the phase domain's own requirement

**Files:** `src/components/task-list.js:254-260` (`actExtraHtml`), `src/data/seed.js:404-418`, `test/activity-verbs.test.mjs` (skipped test)
**Classification:** BLOCKER

The phase domain states: "le prose anglais legacy est supprimé au rendu plutôt que divulgué" (legacy English prose is suppressed at render rather than divulged). The implementation does the opposite:

```js
export function actExtraHtml(e) {
  if (e && typeof e === 'object') { /* structured path */ }
  return `<span class="muted">${esc(e)}</span>`;   // legacy string → rendered verbatim
}
```

Seed data (`src/data/seed.js`) still stores legacy string extras — `'to Review'`, `'to Urgent'`, `'to Sarah Chen'` — so every French user viewing the demo workspace or any pre-migration document sees un-suppressed English prose in the activity feed. The same applies to any activity row persisted before this phase.

The only test that would pin the correct behavior is skipped:

```js
test('a legacy string extra renders nothing — suppressed, never divulged',
  { skip: 'the legacy suppression lands with the full parity gate' }, () => { … });
```

Shipping a phase whose stated goal is removing the last English prose sources with the suppression deferred to an unnamed "full parity gate" (phase 11?) and the pinning test skipped is a requirement violation, not a deferral: the phase's `done` criteria (ACT-01/ACT-02) are not met.

**Fix:** implement the suppression now — `actExtraHtml` must return `''` for non-object extras (keep `esc` only for unknown `kind`s of object extras, which already render nothing). Un-skip the test and delete the seed's legacy extras or convert them to structured extras.

## Warnings

### WR-01: `createdProject` machine verb escapes the Projects filter — conversion regression frozen as a "quirk"

**Files:** `src/components/task-list.js:207-213` (`ACT_CATEGORIES.projects`), `src/actions/actions.js:1354`, `test/activity-verbs.test.mjs`
**Classification:** WARNING

Legacy `'created project'` classifies into `projects`; the machine verb `createdProject` does **not** (`actCategory('createdProject') === null`, asserted by the test as "quirk frozen"). The test's own copy of the old filter proves the legacy behavior selected these rows; the machine-verb conversion silently drops every *new* project-creation row from the Projects filter while legacy rows keep appearing. That is not preserving behavior — it is introducing an inconsistency between old and new documents inside the same feed. D-06 freezes the *status* filter's selection semantics; it does not license losing rows from the *projects* filter.

**Fix:** add `'createdProject'` to `ACT_CATEGORIES.projects` and change the pinned assertion — the old-copy equivalence test should carry an explicit, documented exception for the two fixed quirk cases, not a blanket freeze.

### WR-02: `assignedTo` extra renders a literal `{value}` placeholder when the member is gone

**Files:** `src/actions/actions.js:126`, `src/components/task-list.js:195` (`EXTRA_VARS.assignedTo`)
**Classification:** WARNING

`applyPatch` stores `value: mem(nv)?.name`. If the member is removed before the activity row is rendered (or a stale document references a deleted profile), `mem(nv)` is `undefined` and `act.extra.to` (`"to {value}"`) renders as `to {value}` — the exact literal-placeholder defect CR-02 describes, this time produced client-side. `movedToProject` handles this correctly with `proj(e.value)?.name || e.value`; the assigned path has no fallback.

**Fix:** `vars: e => ({ value: e.value ?? '' })`, or store the member id and resolve at render with the same `|| id` fallback `movedToProject` uses.

### WR-03: `TRUST_PROXY` defaults to true — login throttle and Secure-cookie detection are spoofable when directly exposed

**Files:** `server.js:67, 1068-1078, 1211`
**Classification:** WARNING (Security)

`TRUST_PROXY = process.env.TRUST_PROXY !== 'false'` — **default true**. With no proxy in front:

- `clientIp()` reads `x-forwarded-for`, so the login throttle key (`ip|email`) is attacker-chosen per request — rotate the header, bypass the 10-attempt limit entirely. The throttle is the only brute-force defense on `/api/auth/login`.
- `proto()` reads `x-forwarded-proto` and `setSessionCookie` derives `Secure` from it; `sameOrigin` compares against the spoofed host/proto too.

**Fix:** default `TRUST_PROXY` to false (opt-in behind a real proxy), or gate header trust on `req.socket.encrypted || 'x-forwarded-by'` sanity. At minimum, key the login throttle on `req.socket.remoteAddress` when the connection is not known-secure.

### WR-04: Invite URLs are host-header poisoned when `APP_URL` is unset

**Files:** `server.js:64-66, 1046-1053, 1549`
**Classification:** WARNING (Security)

`appBase(req)` falls back to `publicBase(req)`, which uses `req.headers.host` / `x-forwarded-host`. Invite links (`${appBase(req)}/join/${token}`) are generated per request and emailed; a request with a hostile `Host` header produces invite emails pointing at the attacker's domain. `APP_URL` mitigates this but is optional — nothing warns or refuses to send email links when it is unset.

**Fix:** require `APP_URL` when `MAILER.enabled` (fail loudly at boot), or pin invite URLs to `APP_URL` and refuse to build them from request headers.

### WR-05: `readJson` destroys the socket before the 413 response can be delivered

**Files:** `server.js:1160-1183`
**Classification:** WARNING

On body overflow the handler rejects with `httpError(413, ...)` **and** immediately calls `req.destroy()`. The outer catch then tries `json(res, 413, …)` on a destroyed socket — the client never receives the status or the code (compounding CR-01's dead `err.bodyTooLarge` key: even with the code fixed, the payload cannot arrive). Browsers surface this as a network error (`err.serverUnreachable`), a misleading message for a payload-limit failure.

**Fix:** send the 413 response first (`res.writeHead(413 …); res.end()`), *then* destroy the incoming stream only if the client keeps uploading.

### WR-06: `createUser` email uniqueness is check-then-insert (TOCTOU) — race yields a code-less 500

**Files:** `server.js:986, 1274-1277, 1654-1658`
**Classification:** WARNING

`createUser` checks `select 1 from users where email = ?` and then inserts. Two concurrent signups with the same email: the loser hits the unique index and throws a raw SQLite error (`err.status` undefined), which the catch sites turn into a code-less `500 Internal server error`. Correct status is 409 `accountExists`. The schema already guarantees uniqueness (`unique collate nocase`) — the pre-check is only an optimization.

**Fix:** wrap the insert in a try/catch that maps constraint violations to `httpError(409, …, 'accountExists')` and rethrows; keep the pre-check for a fast path.

### WR-07: `/api/auth/login` and `/api/auth/signup` skip the `sameOrigin` check — login CSRF

**Files:** `server.js:1204-1229, 1259-1288` vs. every other mutation endpoint
**Classification:** WARNING (Security)

Every state-changing endpoint (PATCH workspace, invites, member changes) guards with `sameOrigin(req)` — except the two endpoints that establish sessions. An attacker page can post credentials to `/api/auth/login` (form-encoded or fetch with `no-cors`) and log the victim into an attacker-controlled account (login CSRF), enabling silent exfiltration of the victim's next actions. `SameSite=Lax` blocks cross-site *fetch with cookies* but not top-level form posts, which still set the cookie here. Add `if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', …)` to both routes for consistency and defense-in-depth.

### WR-08: `MOD` keyboard hint is resolved once at module load — live locale switch leaves stale English/French labels

**Files:** `src/core/utils.js:36-38`, `src/overlays/drawer.js:124`, `src/overlays/palette.js`, `src/overlays/modals.js`
**Classification:** WARNING

```js
export const MOD = isMac ? '⌘' : t('common.ctrl');
```
The adjacent comment claims "phase 8's live locale switch re-evaluates the hint on re-render" — a `const` cannot re-evaluate. `MOD` is interpolated into `kbd` hints in four overlay components at render time; after a live switch to French, the hint keeps the English `'Ctrl'` (or vice-versa) until a full reload. Same class of bug as the frozen `LCOLS` pattern this codebase explicitly fixed elsewhere via lazy getters.

**Fix:** `export const modKey = () => (isMac ? '⌘' : t('common.ctrl'));` and update the four call sites; or read the key lazily in each template.

### WR-09: Activity-verbs test suite ships a skipped test as its only legacy-suppression pin

**Files:** `test/activity-verbs.test.mjs`
**Classification:** WARNING

Beyond CR-03, the skipped test's rationale ("lands with the full parity gate") names no artifact, no phase, and no owner. A suite whose central behavioral guarantee (legacy suppression) is enforced by a `skip`ped test will pass green while the requirement is unmet. If the suppression is genuinely deferred to phase 11, the skip reason must reference that phase and plan; if it is in scope for this phase (the domain text says it is), the test must be enabled and failing today.

## Info

### IN-01: Parity test is one-directional and shape-blind

`test/error-codes.test.mjs` verifies emitted→catalog only. It cannot detect dead catalog keys (CR-01), flat-vs-nested params (CR-02), or codes attached to the wrong status. Add: (a) reverse extraction (catalog `err.*` minus a client-side allow-list must appear in `server.js`), (b) an integration test asserting the exact payload shape for an interpolated code. Classification: INFO (test infrastructure), but it is what allowed all three blockers to ship green.

### IN-02: `esc` duplicated across modules

`src/core/utils.js:32` (`esc`) and `src/core/i18n.js:135-136` (`escHtml`) are byte-identical escaper tables. Two copies will diverge. Export one (`escHtml`) and alias or import it in `utils.js`. Classification: INFO.

### IN-03: `err.emailSendFailed` rides a bespoke transport

The invite worker sets `row.code = 'emailSendFailed'` and `row.error` directly on the row (server.js:1580-1581) rather than through `fail()`; the client (modals.js:225) resolves it via `tErr(l.code, l.params, l.error)`. It works only because that message has no placeholders — the same flat-extra contract that breaks CR-02. When CR-02 is fixed, update this path with it. Classification: INFO.

### IN-04: Client-side `uid()` collision risk

`src/core/utils.js:32` — `uid()` is `p + Math.random().toString(36).slice(2, 9)` (6-7 chars of entropy) used for tasks, members, and activity rows in the same document. Acceptable for a single-user demo; with `uid('t')` used for task ids that are matched across the activity journal and notifications, a collision would silently corrupt references. Server mode derives ids server-side for accounts but not for document objects. Classification: INFO.

## Verified Clean (notable)

- `fail()` / `httpError()` centralization, the `sameOrigin` guard on mutating workspace/member/invite routes, scrypt with per-user salt plus a dummy-hash timing equalizer, opaque session tokens stored hashed, and `timingSafeEqual` — all correctly implemented.
- `actExtraHtml`'s hostile-value handling (escaped at interpolation, unknown kinds suppressed) is verified by passing tests.
- The activity classifier correctly reproduces the legacy English-parsing selection for both vocabularies (test executed green).
- `normalizeProjects` / `redactDoc` / `mergeClientDoc` tenancy logic was spot-checked against private-project edge cases; no injection or leak found in the reviewed scope.

## Next Steps

1. Fix CR-01 → CR-03 (order: CR-02 changes payload shape, so fix it together with CR-01's throw-site codes).
2. Re-run `node --test test/error-codes.test.mjs test/activity-verbs.test.mjs` and extend both with the reverse-parity and integration assertions.
3. Address WR-01..WR-09 in the fix wave; WR-03/WR-04 are deployment-config security fixes that should not wait for the next phase.
