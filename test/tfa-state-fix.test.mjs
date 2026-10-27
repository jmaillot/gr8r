/* =====================================================================
   test: tfa-state-fix — WR-01/WR-02 regression pin (D-84, plan 18-01).

   The login/2FA card switch is DOM-render state, so like locale-negotiate
   these tests assert on the SOURCE. Pins:
   - WR-01: the doTfaLogin success path resets S.ui.auth to 'login' before
     delegating to finishLogin, so any failure render lands on the login
     card — and finishLogin itself never touches S.ui.auth (Pitfall E).
   - WR-02: both doLogin and doTfaLogin clear a stale tfaRecoveryRemaining
     at entry, and the doTfaLogin success path clears it after maskedEmail
     unless a genuine burn count was set — reportRecoveryBurn() must only
     ever see a value from the current login.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const ACTIONS = read('src', 'actions', 'actions.js');

/* The source of one top-level function, from its declaration to the next top-level one. */
function bodyOf(src, header) {
  const start = src.indexOf(header);
  assert.notEqual(start, -1, `${header} not found`);
  const rest = src.slice(start + header.length);
  const end = rest.search(/\n(?:export |async function |function |\/\*)/);
  return src.slice(start, start + header.length + (end === -1 ? rest.length : end));
}

test('WR-01: doTfaLogin resets S.ui.auth to the login card before delegating to finishLogin', () => {
  const fn = bodyOf(ACTIONS, 'A.doTfaLogin = () =>');
  assert.ok(fn.indexOf("S.ui.auth = 'login'") !== -1, 'the reset exists');
  assert.ok(
    fn.indexOf("S.ui.auth = 'login'") < fn.indexOf('await finishLogin('),
    'the reset precedes the finishLogin delegation',
  );
});

test('WR-02: the doTfaLogin success path clears a stale recovery count after maskedEmail', () => {
  const fn = bodyOf(ACTIONS, 'A.doTfaLogin = () =>');
  const masked = fn.indexOf('S.ui.maskedEmail = null');
  assert.notEqual(masked, -1, 'maskedEmail clear exists');
  const lastClear = fn.lastIndexOf('S.ui.tfaRecoveryRemaining = null', fn.indexOf('await finishLogin('));
  assert.ok(lastClear !== -1, 'a recovery-count clear exists before finishLogin');
  assert.ok(lastClear > masked, 'the clear follows maskedEmail=null, preserving the success-path burn value');
});

test('WR-02: both doLogin and doTfaLogin clear a stale recovery count at entry', () => {
  for (const header of ['A.doLogin = () =>', 'A.doTfaLogin = () =>']) {
    const fn = bodyOf(ACTIONS, header);
    const clear = fn.indexOf('S.ui.tfaRecoveryRemaining = null');
    assert.notEqual(clear, -1, `${header}: the entry clear exists`);
    const firstApi = fn.indexOf('await api.');
    assert.ok(firstApi !== -1 && clear < firstApi, `${header}: the entry clear precedes the first api call`);
  }
});

test('Pitfall E: finishLogin never clears S.ui.auth — the normal login path depends on it', () => {
  const fn = bodyOf(ACTIONS, 'async function finishLogin');
  assert.ok(!fn.includes("S.ui.auth = 'login'"), 'no auth reset inside finishLogin');
});
