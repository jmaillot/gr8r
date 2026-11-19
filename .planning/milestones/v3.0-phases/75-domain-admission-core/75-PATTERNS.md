# Phase 75: Domain Admission Core - Pattern Map

**Mapped:** 2026-11-19
**Files analyzed:** 8 (6 modified/created targets + 2 supporting)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — boot resolver consts (~:135 zone) | config (boot) | batch | `server.js:125-146` (ALLOW_SIGNUP/SESSION_DAYS/APP_URL consts) | exact |
| `server.js` — `emailDomain`/`emailDomainRefusal` funnel (helper zone ~:671) | utility | transform | `server.js:4699-4714` `validateGuestInviteShape` | exact |
| `server.js` — DP-1 signup gate (~:6716) | controller (route) | request-response | `server.js:6703-6741` signup route | exact |
| `server.js` — DP-2 invite-create gate (~:7745 loop) | controller (route) | request-response | `server.js:7745` `emailOk` per-email loop | exact |
| `server.js` — DP-3 accept fail-closed gate (~:7917) | controller (route) | request-response | `server.js:7895-7915` allowInviteGuests fail-closed block | exact |
| `server.js` — D-06 boot log lines (~:8843 zone) | config (logging) | event-driven | `server.js:8835-8845` config-summary logInfo block | exact |
| `mcp.js` — `invite_member` domain gate (planner decision, ~:937) | controller (tool) | request-response | `mcp.js:932-952` invite_member run (toolError refusals) | exact |
| `src/locales/{en,fr,nl,de,es}.json` — new `err.<key>` entries | config (i18n) | transform | `src/locales/en.json:338,810,1802,1808` (err.inviteGuestToggleOff family) | exact |
| `test/domain-admission.test.mjs` (new, Wave 0) | test | batch | `test/error-codes.test.mjs` (harness integration) + `test/webhook-ssrf.test.mjs` (adversarial table) | exact |
| `docs/DEPLOY.md` — env docs for the two vars | doc | — | `docs/DEPLOY.md:140-160` env block + `:165-169` posture paragraph | role-match |

All analog paths verified git-tracked (`git ls-files`).

## Pattern Assignments

### `server.js` — boot resolver consts (config, batch)

**Analog:** `server.js:125-146`

The whole config surface is boot-frozen consts in the top zone — `ALLOW_SIGNUP` at :135 is the direct neighbor and the posture to copy:

```javascript
// server.js:135
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
// server.js:139-140 — number-typed consts, same zone
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const INVITE_DAYS = Number(process.env.INVITE_DAYS || 7);
```

Key discipline for D-01/D-02: `ALLOW_SIGNUP` uses strict `===` comparison — the new tri-state parser must use `raw === undefined` (never truthiness) to distinguish unset from set-but-empty. Place the resolver consts immediately after :135 (before `SEED_DATA`), and the `??` inheritance once at boot:

```javascript
// Pattern (per RESEARCH Pattern 1, adapted to house const posture)
const parseDomainList = (raw, name) => { /* null | Set */ };
const SIGNUP_DOMAINS = parseDomainList(process.env.ALLOW_SIGNUP_DOMAINS, 'ALLOW_SIGNUP_DOMAINS');
const INVITE_DOMAINS = parseDomainList(process.env.ALLOW_INVITE_DOMAINS, 'ALLOW_INVITE_DOMAINS') ?? SIGNUP_DOMAINS;
```

### `server.js` — shared funnel (utility, transform)

**Analog:** `server.js:4699-4714` — `validateGuestInviteShape`

This is the `{code,message}|null` keyed-refusal contract the new funnel must mirror exactly — null = allowed, object = keyed refusal, one cause per key, generic message (no data reveal):

```javascript
// server.js:4708-4714
function validateGuestInviteShape(role, projects) {
  if (role !== 'viewer') return null;
  const list = (Array.isArray(projects) ? projects : []).filter(Boolean);
  if (list.length === 0) return { code: 'inviteGuestProjectRequired', message: 'Guests need exactly one project' };
  if (list.length > 1) return { code: 'inviteGuestProjectSingle', message: 'Guests can only be scoped to one project' };
  return null;
}
```

Placement: helper zone next to `emailOk` (server.js:671) — the shape-validator composes after it:

```javascript
// server.js:671 — email shape; domain check composes after, per-email
const emailOk = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
```

Anti-bypass invariants to copy into the funnel: NFKC **before** parse (homoglyph ＠ class), exactly ONE `split('@')` call site, strip one trailing dot, exact `Set.has` — never `endsWith`/suffix.

### `server.js` — DP-1 signup gate (controller, request-response)

**Analog:** `server.js:6703-6741` — signup route

**Guard chain pattern** (lines 6703-6709) — copy this ordering: `sameOrigin → ALLOW_SIGNUP → throttle → readJson → structural checks`. The domain refusal inserts after `passwordTooWeak` (:6716-6718), **before** `createUser` (:6721):

```javascript
// server.js:6706-6718
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
if (!ALLOW_SIGNUP) return fail(res, 403, 'signupDisabled', 'Sign-ups are disabled. Ask an admin for an account.');
if (tooMany(`signup|${clientIp(req)}`, 5, 60 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
const body = await readJson(req);
...
if (!name) return fail(res, 400, 'nameRequired', 'Enter your name');
if (password.length < 10 || !/[0-9\W]/.test(password)) {
  return fail(res, 400, 'passwordTooWeak', 'Use at least 10 characters, including a number or symbol');
}
```

Note: there is **no `emailOk` at route level** — shape is enforced inside `createUser` (httpError at server.js:4594). The email here is already trimmed+lowercased (:6710-6712).

**Refusal emission** — use `fail()` (server.js:4657-4659), flat `extra` payload (never a params bag):

```javascript
// server.js:4657-4659
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
```

### `server.js` — DP-2 invite-create gate (controller, request-response)

**Analog:** `server.js:7745` — the per-email `emailOk` loop

D-03 per-email inline refusal rides the exact existing loop — add the domain refusal as the next statement inside the same `for`:

```javascript
// server.js:7745
for (const email of emails) if (!emailOk(email)) return fail(res, 400, 'invalidEmail', `Invalid email: ${email}`, { email });
```

Critical sequencing (research-verified): this loop runs before `db.tx` (starts :7763), so a refused batch leaves zero side effects — the gate must stay ahead of the transaction.

### `server.js` — DP-3 accept fail-closed gate (controller, request-response)

**Analog:** `server.js:7895-7915` — the `allowInviteGuests` fail-closed re-derive block

This is the D-07 non-consuming precedent — refuse BEFORE any write, without consuming the row, keyed 403:

```javascript
// server.js:7901-7915
{
  const wsRow = invite.workspace_id ? await db.get('select doc from workspaces where id = ?', [invite.workspace_id]) : null;
  if (invite.project) {
    ...
    if (!project || project.allowInviteGuests !== true) {
      return fail(res, 403, 'inviteGuestToggleOff', 'Guest invites are no longer open for this project');
    }
  }
}
```

**Insertion point:** immediately after this block (ends ~:7915), before `readJson` (:7917) and account resolution (:7919). Validate `invite.email` (the ROW is the ticket) against the live resolved `INVITE_DOMAINS`.

**Link-only invites** (`invite.email` null): validate the body email right after `inviteForOtherEmail` (server.js:7939), still before `createUser` (:7944):

```javascript
// server.js:7933-7939 — body email is trimmed+lowercased before use
const email = String(rawEmail || '').trim().toLowerCase();
if (!emailOk(email)) return fail(res, 400, 'enterValidEmail', 'Enter a valid email address');
if (invite.email && invite.email !== email) return fail(res, 400, 'inviteForOtherEmail', `This invite is for ${invite.email}`, { email: invite.email });
```

### `server.js` — D-06 boot log lines (config, event-driven)

**Analog:** `server.js:8835-8845` — config-summary `logInfo` block

One grep-able structured line per var, source-tagged (own / inherit / deny-all / off), added inside the same `logInfo` rung:

```javascript
// server.js:8840-8844
/* Config summary at startup (Kanzo #9): the flags that change runtime
   behavior, one line each, so `docker logs` answers "how is this deployed". */
logInfo(`log level: ${LOG_LEVEL} (LOG_LEVEL env: debug | info | warn | error)`);
logInfo(`sessions: ${SESSION_DAYS}d ttl · sign-ups: ${ALLOW_SIGNUP ? 'open' : 'closed'} · secure cookie: ${SECURE_COOKIE} · trust proxy: ${TRUST_PROXY}`);
logInfo(`sso: ${OIDC.enabled ? ... : 'disabled'}`);
```

### `mcp.js` — `invite_member` gate (controller, request-response — planner decision on scope)

**Analog:** `mcp.js:932-952` — the tool's own `run` body

The refusal idiom here is `toolError`, one-line throws mirroring the REST route's order: email shape check at :937-938 is exactly where the domain refusal composes (after shape, before the roster check / insert):

```javascript
// mcp.js:937-938
const email = String(a.email).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw toolError(`Invalid email: ${email}`);
```

This tool inserts directly into `invites` (:957-960) — it is the fourth door; research recommends wiring it (~3 lines) rather than deferring silently.

### `src/locales/{en,fr,nl,de,es}.json` — new keys (config, i18n)

**Analog:** `src/locales/en.json:338, 810, 1802, 1808` — the invite-refusal key family

```json
"err.signupDisabled": "Sign-ups are disabled. Ask a workspace admin for an account.",   // :338
"err.inviteForOtherEmail": "This invite is for {email}",                                // :1802
"err.inviteGuestToggleOff": "Guest invites are off for this project",                   // :1808
```

Conventions to copy: flat `err.<camelCaseCode>` key; `{email}`/`{domain}` placeholder interpolation; generic copy with no policy reveal (D-04). Land keys in **all 5 catalogues in the same commit** as the first emitting gate.

**Gates that enforce parity (must not be tripped):**
- `test/error-codes.test.mjs:20` — auto-extracts `fail(res, N, 'code', …)` codes from server.js source text; requires a non-empty `err.<code>` in en **and** fr. The code must be a static camelCase literal in the fail() call shape.
- `test/error-codes.test.mjs:271-280` — reverse parity: a catalogued err.* code not present in server.js must be in the CLIENT_ONLY_ERR_CODES allowlist (:192-269).
- `test/i18n-core-features.test.mjs:216-218` — pins exact catalogue size (`assert.equal(keys.length, 1946)`). **Append `+N err.<key> … phase 75 plan X` to the test name AND update the count** in the same commit (Pitfall 5).

### `test/domain-admission.test.mjs` (new — test, batch)

**Analog A:** `test/error-codes.test.mjs` — harness-driven integration shape

```javascript
// test/error-codes.test.mjs:44-56 — one spawned server per case, try/finally stop
test('a failed login keeps the English message byte-for-byte and carries the machine code', async () => {
  const server = await startServer();
  try {
    ...
    assert.equal(res.status, 401);
    assert.equal(res.data.code, 'invalidCredentials');
  } finally {
    await server.stop();
  }
});
```

**Tri-state env injection** — the harness strips `undefined`-valued keys from the spawned env, so each D-01/D-02 matrix cell is one `startServer({ env })`:

```javascript
// test/helpers/server.mjs:50-58 (finalEnv merge + undefined-stripping)
const finalEnv = { ...process.env, ...BASE_ENV, PORT: String(port), DATA_DIR: dir, ...env, ... };
// A test passes `undefined` for a variable it wants ABSENT; strip those keys instead of spawning with the string "undefined"
for (const key of Object.keys(finalEnv)) if (finalEnv[key] === undefined) delete finalEnv[key];
```

Useful helpers already exported by the harness (imported in error-codes.test.mjs:11): `ADMIN, ROOT, login, signup, startServer, client, inviteToken`. For DOM-04 tighten/loosen, pass an explicit `dataDir` to reboot against the same DB (server.mjs:40-42 comment).

**Analog B:** `test/webhook-ssrf.test.mjs` — adversarial table-driven structure

```javascript
// test/webhook-ssrf.test.mjs:25-30 — deny-list table, one assertion per row
test('IPv4 deny-list: loopback, RFC1918, link-local, 0/8', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', ...]) {
    const r = await ssrfOk('https://host.example/hook', { lookup: resolve([ip]) });
    assert.equal(r.ok, false, `IP ${ip} must be denied`);
  }
});
```

This is the shape for the DOM-07 canonicalization table (＠, `corp.com.`, `CORP.COM`, `"a@b"@x.com`, `notcorp.com`, subdomain). Header-comment convention: every suite opens with a phase-tagged docstring (`/* SSRF guard suite (Phase 67, WHK-05 / T-67-01). ... */`, webhook-ssrf.test.mjs:1-4) — copy that for the new file.

### `docs/DEPLOY.md` (doc)

**Analog:** `docs/DEPLOY.md:140-160` env dotenv block + `:165-169` posture paragraph

Document both vars in the env block next to `ALLOW_SIGNUP=false` (:152), plus a posture paragraph explaining the tri-state (unset = off/inherit, `''` = deny-all, list = allowlist) and exact matching, matching the style of the TRUST_PROXY paragraph.

## Shared Patterns

### Keyed refusal via `fail()` / `toolError`
**Source:** `server.js:4657-4659` (`fail`), `mcp.js:935` (`toolError`)
**Apply to:** All three server doors + MCP tool
```javascript
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
```
Rules: static camelCase literal code (extraction gate), flat extra payload (`{ email }`), generic message, no list reveal (D-04).

### `{code,message}|null` funnel contract
**Source:** `server.js:4708-4714` (`validateGuestInviteShape`)
**Apply to:** `emailDomainRefusal` — and note the funnel is called in two modes: decide-and-emit at signup/invite-create (DP-1/DP-2 use the returned code in `fail()`), and defensive re-derive at accept (DP-3, like the accept path already does at server.js:7891-7893).

### Boot-frozen env consts + structured boot logs
**Source:** `server.js:135` (const posture), `server.js:8840-8844` (logInfo block)
**Apply to:** Resolver consts at :135 zone; one grep-able logInfo line per var in the boot summary.

### Same-origin-before-throttle guard ordering
**Source:** `server.js:6704-6708`, `server.js:7870-7874`
**Apply to:** New gates must NOT reorder the existing chains — insert strictly after the existing structural checks and before any write/`createUser`/`db.tx`.

## No Analog Found

None — every target file has a tracked, current analog.

## Metadata

**Analog search scope:** `server.js`, `mcp.js`, `src/locales/`, `test/`, `docs/DEPLOY.md`
**Files scanned:** ~12 (5 targeted server.js zones, mcp.js tool, 2 test suites, harness, en.json, DEPLOY.md, i18n count test)
**Tracked-source gate:** all named analogs verified via `git ls-files` (DEPLOY.md resolves to tracked `docs/DEPLOY.md`)
**Pattern extraction date:** 2026-11-19
