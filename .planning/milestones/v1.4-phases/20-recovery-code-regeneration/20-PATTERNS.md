# Phase 20: Recovery-Code Regeneration - Pattern Map

**Mapped:** 2026-10-29
**Files analyzed:** 7 (2 new, 5 modified; 1 reuse-verbatim)
**Analogs found:** 7 / 7 (all tracked source, verified via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (new route block `POST /api/auth/tfa/recovery`) | route | request-response + transactional batch | `server.js:1642–1686` (disable route) + `server.js:1600–1640` (enable route) | exact (structural sibling) |
| `server.js` (D-99 activity mechanism, TBD at planning) | service | event-driven (write-once log) | none | no analog |
| `src/pages/settings.js` (tfa card on-state row + inline regen stage) | component | request-response | `src/pages/settings.js:391–419` (tfa card, disable stage) | exact |
| `src/actions/actions.js` (regen action handlers) | store/controller | request-response | `src/actions/actions.js:2504–2534` (A.tfaAskDisable / A.tfaDisableConfirm / A.recoveryDismiss) | exact |
| `src/core/api.js` (client method `tfaRecover(currentPassword, code)`) | service | request-response | `src/core/api.js:262–270` (tfaEnroll/tfaEnable/tfaDisable) | exact |
| `src/locales/en.json`, `src/locales/fr.json` (new `settings.tfa.*` keys) | config | static | `src/locales/en.json:1265–1291` (existing `settings.tfa.*` block) | exact |
| `test/tfa-recovery-regen.test.mjs` (new) | test | batch (integration) | `test/tfa-enrollment.test.mjs:1–50` | exact (same harness) |
| `src/overlays/modals.js` (D-53 recovery modal) | component | — | **NO CHANGE — reuse verbatim** (`modals.js:48–57`) | reuse |

---

## Pattern Assignments

### `server.js` — new route block (route, request-response + transaction)

**Analog A (front half — guards, step-up, transaction shape):** disable route, `server.js:1642–1686`
**Analog B (back half — burn-and-replace + response):** enable route, `server.js:1600–1640`

**Guard order pattern** (disable route lines 1642–1652; D-96 mirrors it exactly):
```js
if (pathname === '/api/auth/tfa/disable' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = requireUser(req, res);
  if (!user) return;
  // T-16-14: a distinct budget from the other tfa routes (D-11 band).
  if (tooMany(`tfa-disable|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  const body = await readJson(req);
  const cur = String(body?.currentPassword || '');
  const code = String(body?.code || '').trim();
  if (!cur) return fail(res, 400, 'passwordRequired', 'Enter your current password');
  if (!code) return fail(res, 400, 'codeRejected', 'Enter a verification code');
```
> Copy this, changing the throttle key to `` `tfa-regen|${user.id}` `` (D-93) and replacing the empty-code check with the strict D-85 gate: `if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', ...)` — **omit the recovery else-branch entirely** (the disable route's `else` at lines 1666–1674 does a `recovery_codes` lookup; the regen route must contain no such lookup, D-85).

**In-transaction fresh re-select + factor order** (disable route lines 1656–1665; D-86/D-88):
```js
const outcome = transaction(() => {
  const fresh = db.prepare('select password_hash, two_fa_secret, two_fa_last_step from users where id = ?').get(user.id);
  if (!fresh || !verifyPassword(cur, fresh.password_hash)) return 'password';
  // Live-code shape. D-06: an undecryptable secret ... fails closed 503 before any mutation. D-77: the
  // decrypt runs only through requireTotpSecret — no plaintext fallback.
  const wrapped = requireTotpSecret(fresh.two_fa_secret);
  if (!wrapped.ok) return 'masterKey';
  if (!verifyTotpCode(wrapped.secret, code, fresh.two_fa_last_step || null, Math.floor(now() / 1000)).ok) return 'code';
```
> Extend the select to also fetch `two_fa_enabled` (D-95 in-transaction check → return `'notEnabled'`). Keep password → TOTP order (D-86). D-94: the throttle try is already consumed before this transaction runs — do not refund on wrong password.

**Burn-and-replace + response envelope** (enable route lines 1623–1639; D-97/D-100):
```js
const codes = [];
for (let i = 0; i < 10; i++) codes.push(generateRecoveryCode());
transaction(() => {
  db.prepare('update users set two_fa_enabled = 1, ...').run(...);
  db.prepare('delete from recovery_codes where user_id = ?').run(user.id);
  const insert = db.prepare('insert into recovery_codes (id, user_id, code_hash, used_at, created_at) values (?,?,?,null,?)');
  for (const code0 of codes) {
    // D-09/D-51: hash of the ONE normalization (Pitfall 6) — plaintext never stored.
    insert.run(uid(), user.id, recoveryHash(normalizeRecoveryCode(code0)), now());
  }
  ...
});
return json(res, 200, { ok: true, recoveryCodes: codes });
```
> In the regen route, replace the `two_fa_enabled = 1` update with the D-87 replay-guard update: `update users set two_fa_last_step = ? where id = ?` with `verified.matchedStep` (same precedent: login route updates `two_fa_last_step` inside its transaction, `server.js:1742` region). Generate plaintext codes BEFORE the transaction (anti-pattern warning in RESEARCH.md — mirror enable route).

**Error-mapping pattern** (disable route lines 1682–1685):
```js
if (outcome === 'password') return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
if (outcome === 'masterKey') return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured or the stored secret is undecryptable');
if (outcome === 'code') return fail(res, 400, 'codeRejected', 'That code is not valid');
return json(res, 200, { ok: true });
```
> Add the D-95 mapping: `if (outcome === 'notEnabled') return fail(res, 409, 'tfaNotEnabled', 'Enable two-factor authentication first');` — new error code; needs a client i18n key (`err.tfaNotEnabled`) or the client falls back to the English body.

**Response helper — `Cache-Control: no-store` is free** (`server.js:1227–1243`):
```js
function json(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...
```
> D-100's no-store requirement is satisfied by using `json()`; still add the SC-4 assertion test.

**Decrypt boundary** (`server.js:266–269`, comment contract): `requireTotpSecret` is the ONLY caller of `decryptTotpSecret`; call sites branch on `ok` and fail closed 503 `masterKeyMissing` (D-89). Do not call `decryptTotpSecret` directly.

**Placement:** insert the new block immediately after the disable route block (line 1686), alongside the other tfa routes, with the `D-xx` inline decision tags continuing the sequence (D-85..D-100).

---

### `src/pages/settings.js` — tfa card regenerate stage (component, request-response)

**Analog:** `src/pages/settings.js:391–419` (the `case 'tfa'` card, on-state row + disable inline stage)

**On-state row with stage-gated button** (lines 404–419):
```js
if (on) {
  return (
    H(t('settings.tfa.lead')) +
    srow(
      t('settings.tfa.on'),
      t('settings.tfa.onDesc'),
      stage === 'disable' ? '' : `<button class="btn btn-danger-ghost" data-a="tfaAskDisable">${t('settings.tfa.turnOff')}</button>`,
    ) +
    (stage === 'disable'
      ? `<form data-submit="tfaDisableConfirm" class="col" style="gap:14px;max-width:400px;margin-top:14px">
          ${fld('tfa-off-pw', t('settings.tfa.pwLabel'), 'tfaOffPw', 'type="password" autocomplete="current-password"')}
          ${fld('tfa-off-code', t('settings.tfa.codeLabel'), 'tfaOffCode', 'autocomplete="one-time-code"')}
          <div class="row"><button class="btn btn-danger" data-a="tfaDisableConfirm" id="tfa-off-save">${t('settings.tfa.turnOff')}</button><button type="button" class="btn btn-secondary" data-a="tfaCancel">${t('common.cancel')}</button></div>
        </form>`
      : '')
  );
}
```
> D-90 extends exactly this shape: add a second button in the on-state row (e.g. `data-a="tfaAskRegen"`, `btn-secondary` styling — it is not a destructive turn-off), and a `stage === 'regen'` branch rendering a password + 6-digit-code form with `data-submit="tfaRegenConfirm"`, plus the D-92 warning line (`settings.tfa.regenWarning` key). Note the disable stage hides the row buttons (`stage === 'disable' ? '' : ...`) — the regen stage should follow the same mutual-exclusion discipline (hide both row buttons while any stage is open). The `fld()` helper at line 401–402 is the field-with-error pattern to reuse. `S.ui.tfaStage` already exists as the stage state; `'regen'` is just a new value.

**D-53 recovery modal — reuse verbatim** (`src/overlays/modals.js:48–57`):
```js
case 'recovery':
  /* D-53/T-16-10: the one-time recovery-codes modal. The codes live ONLY
     in the transient S.ui.recoveryCodes render state — cleared by
     A.recoveryDismiss on dismiss, never written to localStorage/
     sessionStorage, never re-displayed afterwards. Copy-all is the only
     duplication path. */
  return wrap('sm', `...${(S.ui.recoveryCodes || []).map(esc).join('\n')}...`);
```
> Zero changes to modals.js. The regen action sets `S.ui.recoveryCodes = res.recoveryCodes` and calls `openModal({ type: 'recovery' })` — identical to the enable-time flow.

---

### `src/actions/actions.js` — regen handlers (controller, request-response)

**Analog:** `src/actions/actions.js:2504–2534`

**Stage-open + confirm + error-code switch + modal-open pattern** (lines 2504–2534):
```js
A.tfaAskDisable = () => {
  S.ui.errors = {};
  S.ui.tfaStage = 'disable';
  render();
};
A.tfaDisableConfirm = () => {
  const e = (S.ui.errors = {});
  const pw = $('#tfa-off-pw')?.value || '';
  const code = $('#tfa-off-code')?.value?.trim() || '';
  if (!pw) e.tfaOffPw = t('err.enterCurrentPassword');
  if (!code) e.tfaOffCode = t('err.codeRequired');
  if (Object.keys(e).length) return render();
  loadingBtn('tfa-off-save', 0, async () => {
    const res = await api.tfaDisable(pw, code);
    if (!res.ok) {
      const c = res.data?.code;
      if (c === 'wrongCurrentPassword' || c === 'passwordRequired') e.tfaOffPw = t('err.' + c);
      else if (c === 'codeRejected' || c === 'tooManyAttempts') e.tfaOffCode = t('err.' + c);
      else e.tfaOffPw = res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable');
      return render();
    }
    S.ui.tfaStage = null;
    render();
    await refreshTfa();
    toast(t('settings.tfa.disabledToast'));
  });
};
A.recoveryDismiss = () => {
  S.ui.recoveryCodes = null; // D-53: gone for good — no re-render can show them
  closeModal();
};
```
> `A.tfaAskRegen` = clone of `tfaAskDisable` with `S.ui.tfaStage = 'regen'`. `A.tfaRegenConfirm` = clone of `tfaDisableConfirm` calling `api.tfaRecover(pw, code)`; on success: clear `S.ui.tfaStage` (Pitfall 6 — don't leave the password field mounted), set `S.ui.recoveryCodes = res.recoveryCodes`, `render()`, `openModal({ type: 'recovery' })`, toast — mirroring the enable-time success block (`actions.js:2495–2502`: stage/secret cleared → render → openModal recovery → refreshTfa → toast). Add `tfaNotEnabled` to the error-code switch. `A.recoveryDismiss` needs no change (shared dismiss path).

### `src/core/api.js` — client method (service, request-response)

**Analog:** `src/core/api.js:262–275`
```js
async tfaDisable(currentPassword, code) {
  return call('POST', '/api/auth/tfa/disable', { currentPassword, code });
},
```
> Add: `async tfaRecover(currentPassword, code) { return call('POST', '/api/auth/tfa/recovery', { currentPassword, code }); }` beside the other tfa methods, in the same comment style (enable returns one-time codes, never persisted client-side).

### `src/locales/en.json` / `src/locales/fr.json` — new keys (config)

**Analog:** `src/locales/en.json:1265–1291` (the `settings.tfa.*` block; FR mirrors line-for-line at `fr.json:1265+` region, e.g. `"settings.tfa.turnOff": "Désactiver l'authentification à deux facteurs"`)
> New keys (exact names at planner discretion, D-92): a regen button label, a regen form stage lead, the old-codes-invalidate warning (`settings.tfa.regenWarning`), the 6-digit-only label (note the existing disable label `"settings.tfa.codeLabel": "6-digit code or recovery code"` is dual-shape — the regen form needs its own 6-digit-only label), a success toast, plus `err.tfaNotEnabled`. Both files in the same commit — `test/i18n-scan.test.mjs` enforces catalogued keys (Pitfall 4).

### `test/tfa-recovery-regen.test.mjs` — new test file (test, batch)

**Analog:** `test/tfa-enrollment.test.mjs:1–50`

**Harness pattern** (lines 1–48):
```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { totpAt, recoveryHash } from '../totp.js';
import { login, loginTfa, signup, startServer, withDb } from './helpers/server.mjs';
let server;
let tempDir;
let enablemeCodes = [];          // plaintext codes captured from the enable response
const enabledSecrets = new Map(); // secret per user, tracked at enable time
async function signIn2fa(email) { /* reset two_fa_last_step=0 via withDb, then loginTfa with totpAt(secret, Date.now()/1000) */ }
before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-tfa-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-tfa-suite-key' } });
});
after(async () => { await server?.stop(); fs.rmSync(tempDir, { recursive: true, force: true }); });
```
> Reuse verbatim: real server + real SQLite, `signup`/`login`/`loginTfa`, `totpAt(secret, Date.now()/1000)` for live codes, `withDb(server.dbPath, db => ...)` for direct DB assertions (code-set hashes, `used_at is null` invariants, `two_fa_last_step` update), `recoveryHash` from `../totp.js` to compute expected hashes. Key test-shape precedent: the enable test captures the plaintext codes from the one-time response — the regen test captures the enable response's codes (to post one as `code` for the D-85 regression) and the regen response's codes (to verify the old set burns and the new set validates for login).

---

## Shared Patterns

### Route guard order (Pitfall 22)
**Source:** `server.js:1642–1652` (disable route — every tfa sibling)
**Apply to:** the new route block
`sameOrigin(req)` → `requireUser(req, res)` → `tooMany(key, 5, 15*60*1000)` → `readJson(req)` — in that order, with `fail()`/`json()` only.

### Identity-keyed throttle, every attempt counts (D-93/D-94)
**Source:** `server.js:1646–1647` (`tfa-disable|${user.id}`); precedent comment `server.js:1586–1588`
**Apply to:** throttle key `tfa-regen|${user.id}` placed before any factor verification.

### Single transaction + fresh re-select (Pitfall 4)
**Source:** `server.js:1656–1658` (disable), `server.js:1629–1638` (enable)
**Apply to:** all reads (`password_hash`, `two_fa_enabled`, `two_fa_secret`, `two_fa_last_step`) and all writes (`two_fa_last_step` update, delete-all, hash-inserts) inside one `transaction(() => {...})` returning an outcome string mapped to `fail()` calls after.

### One normalization + hash recipe (Pitfall 6)
**Source:** `server.js:1635` / `totp.js:96–99`
**Apply to:** `recoveryHash(normalizeRecoveryCode(c))` for every insert; plaintext returned exactly once in the response, never stored or logged.

### Fail-closed decrypt boundary (D-89)
**Source:** `server.js:266–269` + usage `server.js:1663–1664`
**Apply to:** `const wrapped = requireTotpSecret(fresh.two_fa_secret); if (!wrapped.ok) return 'masterKey';` → 503 `masterKeyMissing`.

### Error-code translation on the client
**Source:** `src/actions/actions.js:2518–2523`
**Apply to:** the regen confirm handler's `res.data?.code` switch — every new server `error_code` (`tfaNotEnabled`) gets an `err.*` key in both locales.

### D-xx inline decision tags
**Source:** throughout `server.js:1586–1686` (e.g. `// D-49: ...`, `// T-16-14: ...`)
**Apply to:** comment every decision-bearing line in the new route with its D-tag (D-85..D-100), continuing the established convention.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| D-99 activity/security-log mechanism (shape TBD at planning) | service/log | event-driven write | `logAct` (`src/core/store.js:264`) is the only activity writer and is task/workspace-document-scoped; **no auth route records any activity today** (password change, enable and disable 2FA record nothing). The planner must define a minimal honest mechanism (e.g. a small server-side security-event table reusable by Phase 21's DIS-01) or document a deferral. Do not force-fit the task activity feed. |

## Metadata

**Analog search scope:** `server.js`, `totp.js`, `src/pages/`, `src/actions/`, `src/core/`, `src/overlays/`, `src/locales/`, `test/`
**Files scanned:** 9 (all analog paths verified tracked via `git ls-files`)
**Pattern extraction date:** 2026-10-29
