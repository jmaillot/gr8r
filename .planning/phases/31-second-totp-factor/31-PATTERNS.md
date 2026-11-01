# Phase 31: Second TOTP Factor - Pattern Map

**Mapped:** 2026-11-01
**Files analyzed:** 9 (4 modified, 3 extended, 2 new)
**Analogs found:** 9 / 9

All analog paths verified git-tracked (`git ls-files`). This is a single-file-server codebase — new server work lands inside `server.js` alongside existing regions, not in new modules.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — SCHEMA + boot copy | migration | batch (boot) | `migrateTotpEncryption` (server.js:1605) | exact |
| `server.js` — `verifyTotpAgainstFactors()` helper | service (auth) | transform | `requireTotpSecret` (server.js:405) + disable route verify block (2473-2482) | exact |
| `server.js` — `/api/auth/tfa/factors` routes (add/list/remove) | route | CRUD / request-response | enroll/enable/disable routes (server.js:2391-2504) | exact |
| `server.js` — login challenge + regen verify blocks (modify) | route | request-response | server.js:2608-2616, 2531-2543 | self (call-site conversion) |
| `src/pages/settings.js` — 2FA card (modify) | component | request-response | settings.js:462-537 (`case 'tfa'`) + sessions list (538-557) | exact |
| `src/actions/actions.js` — add-factor/remove actions | action handlers | event-driven | `A.tfaBeginEnroll` / `A.tfaDisableConfirm` / `A.tfaRegenConfirm` (actions.js:2748-2861) | exact |
| `src/core/api.js` — new wrappers | client API | request-response | `tfaEnroll/tfaEnable/tfaDisable/tfaRecover` (api.js:291-306) | exact |
| `src/locales/en.json` + `fr.json` | config (i18n) | transform | existing `settings.tfa.*` key trees | exact |
| `test/tfa-multi-factor.test.mjs` (new) | test (integration) | — | `test/migration.test.mjs` harness + `test/totp-encryption.test.mjs` pins | exact |
| `test/migration.test.mjs`, `test/totp-encryption.test.mjs` (extend) | test (pins) | — | self (existing discipline) | self |

## Pattern Assignments

### `server.js` — `totp_factors` table in SCHEMA (migration, batch)

**Analog:** users table block, server.js:113-127 (append after it, same style)

```sql
-- server.js:113-127 (existing shape to mirror)
create table if not exists users (
  id            text primary key,
  email         text not null unique collate nocase,
  ...
  two_fa_enabled   integer not null default 0,
  two_fa_secret    text,
  two_fa_last_step integer not null default 0,
  ...
);
```

New table rides `create table if not exists` inside `SCHEMA` (boot-time idempotent by construction — second boot is a no-op for free). Mirror the `integer not null default 0` sentinel style; cascade FK like `sessions.user_id` (line 130): `references users(id) on delete cascade`.

### `server.js` — boot copy (migration, batch)

**Analog:** `migrateTotpEncryption`, server.js:1605-1679. Copy its skeleton verbatim:

**Imports/structure pattern** — the trigger-gate → defer → backup → transaction order (lines 1632-1677):
```js
// server.js:1640-1646 — trigger-gated no-op: compute eligible rows first, return early
const pendingRows = () =>
  db.prepare("select id, two_fa_secret from users where ...").all();
let rows = pendingRows();
if (rows.length === 0) return;

// server.js:1648-1656 — D-73 defer when MASTER_KEY missing (planner may apply or
// drop this for the copy — the copy is decrypt-free, see RESEARCH Open Question 3)
if (!MASTER_KEY) { console.warn(`...deferred...`); return; }

// server.js:1658-1671 — backup-first, skip on backup failure
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(DATA_DIR, `projects-preenvelope-${stamp}.db`);
try {
  db.exec('pragma wal_checkpoint(truncate)');
  db.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
  ...
} catch (err) { console.error(`...skipped...`); return; }

let migrated = 0; /* counters for the console summary */
transaction(() => { /* per-row re-check inside the tx (D-75 pattern, 1678+) */ });
```

Key discipline to copy: **zero eligible rows → return before backup or console output** (byte-identical second boot), and per-row re-check *inside* the transaction (server.js:1678 "defense in depth against double-encryption" — here, against double-copy).

**Eligibility predicate for the copy** (per D-06/D-09):
```sql
select id, two_fa_secret, two_fa_last_step from users
 where two_fa_enabled = 1 and two_fa_secret is not null and two_fa_secret != ''
```
plus a JS-side anti-join: skip users that already have any `totp_factors` row.

### `server.js` — `verifyTotpAgainstFactors()` helper (service, transform)

**Analog:** `requireTotpSecret` wrapper, server.js:405-408 (the boundary the helper MUST call) and the verify blocks it replaces.

```js
// server.js:405-408 — the ONLY runtime decrypt boundary (D-77/D-78c); the helper
// calls this per factor, never decryptTotpSecret directly
function requireTotpSecret(envelope) {
  const secret = decryptTotpSecret(envelope); // already returns null on EVERY failure
  return secret ? { ok: true, secret } : { ok: false };
}
```

**The verify shape being replaced** (each of the three call sites, e.g. disable route server.js:2479-2482):
```js
const wrapped = requireTotpSecret(fresh.two_fa_secret);
if (!wrapped.ok) return 'masterKey';
// ±1 window + D-04 replay guard vs the stored two_fa_last_step.
if (!verifyTotpCode(wrapped.secret, code, fresh.two_fa_last_step || null, Math.floor(now() / 1000)).ok) return 'code';
```

**New helper skeleton** (keeps the exact `wrapped`/`verifyTotpCode` shapes so the pin tests stay structurally valid — see Shared Patterns for the pin updates):
```js
// server.js — new helper, placed after requireTotpSecret / pendingTfa (before routes)
function verifyTotpAgainstFactors(userId, code, nowSec) {
  const rows = db.prepare('select id, secret, last_step from totp_factors where user_id = ? order by created_at').all(userId);
  let decrypted = 0;
  for (const row of rows) {
    const wrapped = requireTotpSecret(row.secret);
    if (!wrapped.ok) continue; // D-12: undecryptable factor skipped alone
    decrypted++;
    const verified = verifyTotpCode(wrapped.secret, code, row.last_step || null, nowSec);
    if (verified.ok) return { ok: true, factorId: row.id, matchedStep: verified.matchedStep, decrypted };
  }
  return { ok: false, decrypted }; // decrypted === 0 → caller 503s (Pitfall 3)
}
```

**Anti-pattern (hard):** any `decryptTotpSecret(` occurrence outside the four sanctioned regions fails `test/totp-encryption.test.mjs:53-83`. Name a constant `wrapped` at each converted call site so the existing regex pins keep matching structurally.

### `server.js` — new `/api/auth/tfa/*` routes (route, CRUD / request-response)

**Analog:** enroll + disable routes, server.js:2391-2504. Every new route clones this preamble and transaction discipline:

**Route preamble** (enroll, server.js:2391-2402):
```js
if (pathname === '/api/auth/tfa/enroll' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = requireUser(req, res);
  if (!user) return;
  if (tooMany(`tfa-enroll|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  const body = await readJson(req);
  const cur = String(body?.currentPassword || '');
  if (!cur) return fail(res, 400, 'passwordRequired', 'Enter your current password');
  if (!verifyPassword(cur, user.password_hash)) return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
  ...
}
```

**Atomic enable transaction** (server.js:2440-2449 — the D-13 per-factor insert mirrors this):
```js
transaction(() => {
  db.prepare('update users set two_fa_enabled = 1, two_fa_secret = ?, two_fa_last_step = ? where id = ?').run(envelope, verified.matchedStep, user.id);
  db.prepare('delete from recovery_codes where user_id = ?').run(user.id);
  ...
  pendingTfa.delete(user.id);
});
```
For a second-ever factor: insert the `totp_factors` row + update its `last_step` in the same transaction, and flip `two_fa_enabled = 1` **only if no factor row existed before** (first-ever). Recovery codes are only generated/rotated on the first-ever enable (D-17).

**Last-factor removal = the disable transaction verbatim** (D-18). Copy exactly, server.js:2486-2494:
```js
db.prepare("update users set two_fa_enabled = 0, two_fa_secret = '', two_fa_last_step = 0 where id = ?").run(user.id);
db.prepare('delete from recovery_codes where user_id = ?').run(user.id);
db.prepare('delete from login_challenges where user_id = ?').run(user.id);
db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
```
Plus the strict 6-digit gate with no else-branch (server.js:2463-2467):
```js
if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', 'Enter a 6-digit verification code');
```

**Envelope write** (enable path, server.js:2432-2433) — the ONLY v2 writer shape:
```js
const envelope = encryptTotpSecret(pending.secret, 'v2');
if (!envelope) return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured — 2FA cannot be enabled until the admin sets it');
```

**Staging map** (D-13 extension), server.js:414-421:
```js
const PENDING_TFA_TTL = 10 * 60 * 1000;
const pendingTfa = new Map();
function stashPendingTfa(userId, secret, otpauth) {
  const t = now();
  pendingTfa.set(userId, { secret, otpauth, expiresAt: t + PENDING_TFA_TTL });
  if (pendingTfa.size > 5000) for (const [k, v] of pendingTfa) if (t > v.expiresAt) pendingTfa.delete(k);
}
```
Extend the key (e.g. `` `${userId}:${factorName}` `` or a staged factor id) rather than adding a second map; keep the TTL + lazy-sweep shape.

### `server.js` — login challenge TOTP branch (modify, request-response)

**Analog:** server.js:2608-2616 (convert) and 2593-2601 (attempt counter — do NOT touch).

```js
// server.js:2593-2595 — the attempt is consumed BEFORE any code comparison;
// iterating N factors still costs exactly one attempt (D-11). Leave as-is.
db.prepare('update login_challenges set attempts = attempts + 1 where challenge_token_hash = ?').run(fresh.challenge_token_hash);

// server.js:2611-2616 — the block that becomes the helper call:
const wrapped = requireTotpSecret(user.two_fa_secret);
if (!wrapped.ok) return 'masterKey';
const verified = verifyTotpCode(wrapped.secret, code, user.two_fa_last_step || null, Math.floor(now() / 1000));
if (!verified.ok) return 'code';
db.prepare('update users set two_fa_last_step = ? where id = ?').run(verified.matchedStep, user.id);
```
Replacement shape: `const result = verifyTotpAgainstFactors(user.id, code, Math.floor(now()/1000)); if (result.decrypted === 0) return 'masterKey'; if (!result.ok) return 'code'; db.prepare('update totp_factors set last_step = ? where id = ?').run(result.matchedStep, result.factorId);` — and sweep for leftover `two_fa_last_step` writes (Pitfall 5). The recovery branch (2617-2625, D-64 burn) stays untouched and outside the loop (D-14).

Same conversion for the regen route's verify block (server.js:2537-2543), keeping its `update users set two_fa_last_step` → `update totp_factors set last_step` swap.

### `src/pages/settings.js` — 2FA card (component, request-response)

**Analog:** `case 'tfa'`, settings.js:462-537, plus the sessions list for the row pattern (538-557).

**Existing staged-state rendering** (the pattern "Add factor" re-launches):
```js
// settings.js:469-474 — stage read from S.ui.tfaStage; server ground truth only
const e = S.ui.errors;
const stage = S.ui.tfaStage;
const on = api.enabled && !!api.user?.twoFa;
...
if (stage === 'pw') { /* D-49: the password step-up renders in place — no wizard. */ ... }
if (stage === 'verify') { /* QR + secret + live code form (503-520) */ ... }
```

**Factor-list row pattern** — copy from sessions rows (settings.js:548-553), which already does `srow()` + `ago()` + per-row action buttons with `data-id`:
```js
rows.map(s =>
  srow(
    `<span class="row" style="gap:8px">${ic(...)}${esc(deviceLabel(s.userAgent))}...</span>`,
    `${esc(s.ip || '—')} · ${esc(... ? ago(s.lastSeenAt || s.createdAt) : '—')}`,
    s.current ? '' : `<button class="btn btn-secondary btn-sm" data-a="revokeSession" data-id="${esc(s.id)}">${t('palette.signOut')}</button>`,
  ),
).join('')
```
Each factor row: name (catalogue-localized for the migrated row) + `ago(...)` last-used (D-05) + a remove button carrying `data-id`. The remove confirm "modal" is actually the same in-place staged form as `stage === 'disable'` (settings.js:483-489) — reuse that staged-form pattern with the factor name echoed, per D-19.

`ago()` is already imported/available in settings.js (used at lines 114, 145, 551).

### `src/actions/actions.js` — new staged actions (event-driven)

**Analog:** `A.tfaBeginEnroll` (2748-2767) and `A.tfaDisableConfirm` (2804-2825). Clone this handler skeleton exactly:

```js
// actions.js:2748-2766 — validation-then-loadingBtn-then-api-then-error-map
A.tfaBeginEnroll = () => {
  const e = (S.ui.errors = {});
  const pw = $('#tfa-pw')?.value || '';
  if (!pw) e.tfaPw = t('err.enterCurrentPassword');
  if (Object.keys(e).length) return render();
  loadingBtn('tfa-pw-save', 0, async () => {
    const res = await api.tfaEnroll(pw);
    if (!res.ok) {
      const code = res.data?.code;
      if (code === 'wrongCurrentPassword' || code === 'passwordRequired') e.tfaPw = t('err.' + code);
      else if (code === 'tooManyAttempts') e.tfaPw = t('err.tooManyAttempts');
      else e.tfaPw = res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable'); // D-58: the 503 body never renders
      return render();
    }
    S.ui.tfaSecret = res.data.secret;
    S.ui.tfaOtpauth = res.data.otpauth;
    S.ui.tfaStage = 'verify';
    render();
  });
};
```

Conventions to preserve: clear `S.ui.errors` at stage entry (`A.tfaAskDisable`, 2799-2803); stage-cleared **before** modal/refresh on success (2820-2823, 2854-2858); `await refreshTfa()` after every server state change; error keys per form field. Name new stages/actions consistently, e.g. `A.tfaAddFactor`, stage `'addName'`/`'addVerify'`, and a per-factor remove stage echoing the factor name.

### `src/core/api.js` — wrappers (client API, request-response)

**Analog:** api.js:291-306. Add alongside, same style:
```js
async tfaEnroll(currentPassword) {
  return call('POST', '/api/auth/tfa/enroll', { currentPassword });
},
async tfaDisable(currentPassword, code) {
  return call('POST', '/api/auth/tfa/disable', { currentPassword, code });
},
```
New wrappers, e.g. `tfaFactors()` (GET list), `tfaAddEnroll({currentPassword, code?, label})`, `tfaAddEnable({code, label...})`, `tfaFactorRemove({factorId, currentPassword, code})`. Note the family is auth-scoped — no workspace slug.

### `src/locales/en.json` + `fr.json` (config, i18n)

**Analog:** existing `settings.tfa.*` key tree in both files. Rules: every new key added to BOTH files in the same task (gated by `test/i18n-scan.test.mjs`, `test/build-locales.test.mjs`), catalogue key for the migrated row (D-07) stored server-side as a key (e.g. `tfa.factor.primary`), localized at display time via `t()` — never free text. Add per-form labels, "Add factor" button, factor-list copy, remove-modal copy, and `err.*` keys mirroring the route failure codes.

### `test/tfa-multi-factor.test.mjs` (new, integration)

**Analog:** `test/migration.test.mjs` harness usage + `test/helpers/server.mjs`.

```js
// test/migration.test.mjs:1-11 — the import/harness shape
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createLegacyDb, LEGACY_PASSWORD } from './helpers/legacy-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';

// test/migration.test.mjs:27-43 — before(): real server on a real temp DATA_DIR
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-migration-'));
  createLegacyDb(dataDir);
  legacyColumns = withDb(path.join(dataDir, 'projects.db'), db => ...);
  server = await startServer({ dataDir });
  output = server.output();
});
```
Helpers available: `startServer({ dataDir, env })` (spawns real server.js, ephemeral port, explicit `dataDir` for reboot tests — server.mjs:43-59), `login`, `withDb(dbPath, fn)`, `server.dbPath`, `server.output()` for console-summary assertions. Enroll a factor over HTTP exactly as a user would (enroll → read secret → generate code → enable); the RESEARCH.md Validation Architecture maps TOTP2-01..05 onto this suite.

### `test/migration.test.mjs` + `test/totp-encryption.test.mjs` (extend, pins)

**Self-analog.** Extend, don't restructure:

- migration.test.mjs:30-40 — the `pragma table_info` snapshot loop gains `'totp_factors'` in the table list; a second-boot `startServer` against the same `dataDir` (server.mjs supports explicit `dataDir` "when a test needs to reboot against the same database (migration tests)") asserts zero writes/byte-identical state.
- totp-encryption.test.mjs:85-92 — the tracked-count pins:
```js
assert.equal((serverSource.match(/const wrapped = requireTotpSecret\(/g) || []).length, 3, 'expected three wrapped call sites (disable, verify, regen)');
assert.equal((serverSource.match(/if \(!wrapped\.ok\) return 'masterKey';/g) || []).length, 3, 'all call sites must branch on ok:false');
assert.equal((serverSource.match(/verifyTotpCode\(wrapped\.secret/g) || []).length, 3, 'wrapped.secret must feed verifyTotpCode');
```
These move into the helper by design — schedule a deliberate Wave 0 update: new expected counts (one in the helper, possibly zero/one remaining at route level), plus a new assertion that every factor decrypt flows through `requireTotpSecret` inside `verifyTotpAgainstFactors`. Also lines 53-83 pin `decryptTotpSecret(` to exactly 4 sanctioned regions — the new helper region may need adding there if the scan is region-based (it indexes by offset, so keep the helper between `requireTotpSecret` and the `/* D-46: pending` marker or extend the region list explicitly).

## Shared Patterns

### Route security preamble
**Source:** server.js:2391-2394 (identical in all tfa routes)
**Apply to:** every new `/api/auth/tfa/*` route
```js
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
const user = requireUser(req, res);
if (!user) return;
if (tooMany(`tfa-<verb>|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
```

### Single decrypt boundary
**Source:** server.js:405-408; pinned by test/totp-encryption.test.mjs:53-92
**Apply to:** the factor helper and every route touching factor secrets — `requireTotpSecret` only, `wrapped.ok` branch, 503 `masterKeyMissing` on failure; never `decryptTotpSecret` directly, never a `??`/`||` fallback.

### Strict 6-digit gate
**Source:** server.js:2463-2467, 2520-2523
**Apply to:** every new step-up/verify route — `if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', ...)` with NO recovery lookup in the route body (D-14/D-59/D-72 boundary).

### Atomic transactions
**Source:** server.js:2440-2449, 2473-2496 (`transaction(() => {...})` returning an outcome string; verify inside, fail without writes; `logSecurity` inside on success or after commit — copy whichever the cloned route does)
**Apply to:** enable-with-insert, single-factor remove, last-factor remove (teardown verbatim).

### One failed attempt per submission (D-11)
**Source:** server.js:2593-2601 (attempt increment before verify); `tooMany` budgets per route
**Apply to:** login challenge and any new route — no per-factor attempt writes.

### Error-code → client mapping (D-58)
**Source:** actions.js:2755-2759 (`res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable')` — 503 body never renders)
**Apply to:** all new client action handlers.

### Refresh-on-mount server ground truth
**Source:** settings.js:463-465 comment + `refreshTfa()` usage (actions.js:2795, 2822, 2858)
**Apply to:** the factor list — populated by a refresh action after mount and after every add/remove; never a client flag.

## No Analog Found

None — every file in scope has an exact in-repo analog. `totp.js` is explicitly untouched.

## Metadata

**Analog search scope:** server.js (regions 100-135, 320-430, 1605-1680, 2389-2663), src/pages/settings.js, src/actions/actions.js, src/core/api.js, test/{migration,totp-encryption}.test.mjs, test/helpers/server.mjs, src/locales/
**Files scanned:** 9 tracked source files + helpers
**Pattern extraction date:** 2026-11-01
