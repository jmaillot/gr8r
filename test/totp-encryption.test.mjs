/* ENC-02 decrypt-boundary closure proofs (D-78). Three mechanisms:
   (a) grep — no plaintext-fallback pattern exists in server.js (D-78a);
   (c) exclusivity — decryptTotpSecret is called ONLY inside requireTotpSecret (D-78c);
   (b) behavioral — malformed / non-v1: / missing-MASTER_KEY at both call surfaces
       (login-challenge verify + disable step-up) fail closed 503 masterKeyMissing
       with the per-route copy (D-80/D-81), no state mutation, and non-2FA login
       is untouched (Pitfall 3 negative control).
   server.js cannot be imported by a test (it boots on load) — the static half
   reads the source as text, the house extraction pattern (error-codes.test.mjs). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ADMIN, ROOT, login, signup, startServer, withDb } from './helpers/server.mjs';

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

const VERIFY_COPY = 'MASTER_KEY is not configured — 2FA cannot be verified until the admin sets it';
const DISABLE_COPY = 'MASTER_KEY is not configured or the stored secret is undecryptable';
/* Plant values: malformed, plaintext non-v1:, and a valid-shaped v1: envelope.
   The valid envelope only needs the 4-part shape — with MASTER_KEY unset decrypt
   returns null before parsing; with a wrong key GCM auth fails → null. */
const VARIANTS = [
  ['malformed', 'garbage-not-envelope'],
  ['plaintext-not-v1', 'JBSWY3DPEHPK3PXP'],
  ['valid-envelope-no-key', 'v1:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:CCCCCCCCCCCCCCCCCCCCCCCCCCCC'],
];
const plant = (dbPath, email, value) =>
  withDb(dbPath, db => db.prepare('update users set two_fa_secret = ? where email = ?').run(value, email));
const userRow = (dbPath, email) => withDb(dbPath, db => db.prepare('select * from users where email = ?').get(email));

/* ---------- D-78a: the grep proof — no plaintext fallback can exist ---------- */

test('no decryptTotpSecret expression is followed by a nullish or || fallback (D-78a)', () => {
  assert.ok(!/decryptTotpSecret\([^)]*\)\s*\?\?/.test(serverSource), 'a decrypt(x) ?? x plaintext fallback exists');
  assert.ok(!/decryptTotpSecret\([^)]*\)\s*\|\|/.test(serverSource), 'a decrypt(x) || fallback exists');
  assert.ok(!/decryptTotpSecret\([^)]*\)\s*\|\|\s*String\(/.test(serverSource), 'a || String() fallback exists');
  assert.ok(!/decryptTotpSecret\([^)]*\)\s*\|\|\s*envelope/.test(serverSource), 'a || envelope fallback exists');
});

test('requireTotpSecret returns ok:false on null — never a plaintext pass-through', () => {
  const body = serverSource.slice(
    serverSource.indexOf('function requireTotpSecret'),
    serverSource.indexOf('/* D-46: pending'),
  );
  assert.match(body, /return secret \? \{ ok: true, secret \} : \{ ok: false \};/, 'the wrapper shape moved');
  assert.ok(!/\?\?/.test(body) && !/\|\|/.test(body), 'the wrapper itself carries a fallback');
});

/* ---------- D-78c: the exclusivity proof — wrapper is the only caller ---------- */

test('decryptTotpSecret is referenced ONLY by its definition and requireTotpSecret (D-78c)', () => {
  /* Call-syntax occurrences: the `function decryptTotpSecret(` definition line and the
     single call inside requireTotpSecret. Comment mentions use a space before "(" and
     never match. */
  const callSites = [...serverSource.matchAll(/decryptTotpSecret\(/g)].map(m => m.index);
  assert.equal(callSites.length, 2, `expected definition + one wrapper call, found ${callSites.length} call-syntax occurrences`);

  const defAt = serverSource.indexOf('function decryptTotpSecret(');
  const wrapperAt = serverSource.indexOf('function requireTotpSecret(');
  const wrapperBodyEnd = serverSource.indexOf('/* D-46: pending');
  assert.ok(defAt !== -1, 'the decryptTotpSecret definition is missing');
  assert.ok(wrapperAt !== -1 && wrapperBodyEnd > wrapperAt, 'the requireTotpSecret wrapper is missing');
  for (const at of callSites) {
    const inDef = at >= defAt && at < defAt + 'function decryptTotpSecret('.length;
    const inWrapper = at > wrapperAt && at < wrapperBodyEnd;
    assert.ok(inDef || inWrapper, `a direct decryptTotpSecret call site exists outside requireTotpSecret at offset ${at}`);
  }
  assert.equal(serverSource.indexOf('function requireTotpSecret('), wrapperAt, 'requireTotpSecret defined exactly once');
});

test('both call sites branch on wrapped.ok and feed wrapped.secret to verifyTotpCode', () => {
  assert.equal((serverSource.match(/const wrapped = requireTotpSecret\(/g) || []).length, 2, 'expected exactly two swapped call sites');
  assert.equal((serverSource.match(/if \(!wrapped\.ok\) return 'masterKey';/g) || []).length, 2, 'both call sites must branch on ok:false');
  assert.equal((serverSource.match(/verifyTotpCode\(wrapped\.secret/g) || []).length, 2, 'wrapped.secret must feed verifyTotpCode');
});

test('the per-route 503 body copies are byte-identical to pre-refactor server.js (D-81)', () => {
  assert.equal((serverSource.match(new RegExp(VERIFY_COPY.replaceAll('—', '—'), 'g')) || []).length, 1, 'verify-route copy changed');
  assert.equal((serverSource.match(new RegExp(DISABLE_COPY, 'g')) || []).length, 1, 'disable-route copy changed');
});

test('the two_fa_enabled gate in the login-challenge verify stays intact (Pitfall 3)', () => {
  assert.ok(/if \(!user \|\| !user\.two_fa_enabled\) \{/.test(serverSource), 'the two_fa_enabled gate moved or was weakened');
});

/* ---------- D-78b: the behavioral proof — fail-closed 503 at both surfaces ---------- */

let keyServer; // MASTER_KEY set — corrupt-envelope variants must still 503
let noKeyServer; // MASTER_KEY absent — every variant (including a valid envelope) 503s
let keyDir;
let noKeyDir;

before(async () => {
  keyDir = fs.mkdtempSync(path.join(fs.tmpdir !== undefined ? fs.tmpdir() : '/tmp', 'gr8r-totpe-key-'));
  keyServer = await startServer({ dataDir: keyDir, env: { MASTER_KEY: 'gr8r-enc-suite-key' } });
  noKeyDir = fs.mkdtempSync(path.join(fs.tmpdir !== undefined ? fs.tmpdir() : '/tmp', 'gr8r-totpe-nokey-'));
  noKeyServer = await startServer({ dataDir: noKeyDir, env: { MASTER_KEY: undefined } });
});

after(async () => {
  await keyServer?.stop();
  await noKeyServer?.stop();
  for (const dir of [keyDir, noKeyDir]) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

const GOOD = 'correct-horse-9';
/* 2FA-enabled row planted straight into SQL — this suite proves the decrypt boundary,
   not enrollment (covered by tfa-enrollment.test.mjs). */
async function make2faUser(server, email) {
  const s = await signup(server.base, { name: email.split('@')[0], email, password: GOOD });
  assert.equal(s.status, 201, `signup of ${email}`);
  withDb(server.dbPath, db =>
    db.prepare('update users set two_fa_enabled = 1, two_fa_secret = ?, two_fa_last_step = 7 where email = ?').run('v1:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:CCCCCCCCCCCCCCCCCCCCCCCCCCCC', email),
  );
  return s.client;
}

/* Disable step-up: a live-code shape is what reaches decryptTotpSecret. */
async function disableWithCode(client, code = '123456') {
  return client.post('/api/auth/tfa/disable', { currentPassword: GOOD, code });
}
/* Login-challenge verify: password step mints the challenge cookie, then the code step. */
async function verifyLogin(server, email, code = '123456') {
  const c = await login(server.base, email, GOOD);
  assert.equal(c.status, 200, 'the password step never decrypts and must succeed');
  assert.ok(c.data?.pending2fa, 'a 2FA-enabled account must answer pending2fa at the password step');
  const account = c.client;
  return account.post('/api/auth/tfa/login', { code });
}

test('D-78b disable step-up: every corrupt-secret variant fails closed 503 with the disable copy, no state mutation (keyed server)', async () => {
  const email = 'dis-key@test.local';
  const c = await make2faUser(keyServer, email);
  for (const [variant, value] of VARIANTS) {
    plant(keyServer.dbPath, email, value);
    const res = await disableWithCode(c);
    assert.equal(res.status, 503, `${variant}: expected the fail-closed 503`);
    assert.equal(res.data.code, 'masterKeyMissing', `${variant}: wrong error code`);
    assert.equal(res.data.error, DISABLE_COPY, `${variant}: disable-route copy changed`);
    const row = userRow(keyServer.dbPath, email);
    assert.equal(row.two_fa_enabled, 1, `${variant}: two_fa_enabled must not be mutated`);
    assert.equal(row.two_fa_last_step, 7, `${variant}: two_fa_last_step must not be mutated`);
    assert.equal(row.two_fa_secret, value, `${variant}: the stored value must not be rewritten`);
  }
});

test('D-78b login-challenge verify: every corrupt-secret variant fails closed 503 with the verify copy, no state mutation (keyed server)', async () => {
  const email = 'ver-key@test.local';
  await make2faUser(keyServer, email);
  for (const [variant, value] of VARIANTS) {
    plant(keyServer.dbPath, email, value);
    const res = await verifyLogin(keyServer, email);
    assert.equal(res.status, 503, `${variant}: expected the fail-closed 503`);
    assert.equal(res.data.code, 'masterKeyMissing', `${variant}: wrong error code`);
    assert.equal(res.data.error, VERIFY_COPY, `${variant}: verify-route copy changed`);
    const row = userRow(keyServer.dbPath, email);
    assert.equal(row.two_fa_enabled, 1, `${variant}: two_fa_enabled must not be mutated`);
    assert.equal(row.two_fa_last_step, 7, `${variant}: two_fa_last_step must not be mutated (no replay-step write)`);
  }
});

test('D-78b disable step-up with MASTER_KEY unset: valid envelope and every variant 503 — never plaintext verification', async () => {
  const email = 'dis-nokey@test.local';
  const c = await make2faUser(noKeyServer, email);
  for (const [variant, value] of VARIANTS) {
    plant(noKeyServer.dbPath, email, value);
    const res = await disableWithCode(c);
    assert.equal(res.status, 503, `${variant} (no key): expected the fail-closed 503`);
    assert.equal(res.data.code, 'masterKeyMissing', `${variant} (no key): wrong error code`);
    assert.equal(res.data.error, DISABLE_COPY, `${variant} (no key): disable-route copy changed`);
  }
  const row = userRow(noKeyServer.dbPath, email);
  assert.equal(row.two_fa_enabled, 1, 'no mutation across the no-key disable attempts');
});

test('D-78b login-challenge verify with MASTER_KEY unset: valid envelope and every variant 503', async () => {
  const email = 'ver-nokey@test.local';
  await make2faUser(noKeyServer, email);
  for (const [variant, value] of VARIANTS) {
    plant(noKeyServer.dbPath, email, value);
    const res = await verifyLogin(noKeyServer, email);
    assert.equal(res.status, 503, `${variant} (no key): expected the fail-closed 503`);
    assert.equal(res.data.code, 'masterKeyMissing', `${variant} (no key): wrong error code`);
    assert.equal(res.data.error, VERIFY_COPY, `${variant} (no key): verify-route copy changed`);
  }
  const row = userRow(noKeyServer.dbPath, email);
  assert.equal(row.two_fa_enabled, 1, 'no mutation across the no-key verify attempts');
  assert.equal(row.two_fa_last_step, 7, 'no replay-step write across the no-key verify attempts');
});

test('Pitfall 3 negative control: a non-2FA account logs in normally with MASTER_KEY unset', async () => {
  const s = await signup(noKeyServer.base, { name: 'Plain', email: 'plain@test.local', password: GOOD });
  assert.equal(s.status, 201);
  const res = await login(noKeyServer.base, 'plain@test.local', GOOD);
  assert.equal(res.status, 200, 'non-2FA login must be untouched by the decrypt boundary');
  assert.equal(res.data.pending2fa, undefined, 'a non-2FA login must never answer pending2fa');
  assert.ok(res.data.user, 'the password alone must mint the session');
});

test('positive control: with a valid envelope AND a matching MASTER_KEY nothing 503s at the disable surface', async () => {
  /* Enable a real 2FA user through the production flow on the keyed server, then
     disable with a live code — proves the wrapper still verifies when decrypt
     succeeds (the closure must not break the happy path). */
  const s = await signup(keyServer.base, { name: 'Happy', email: 'happy@test.local', password: GOOD });
  const c = s.client;
  const enroll = await c.post('/api/auth/tfa/enroll', { currentPassword: GOOD });
  assert.equal(enroll.status, 200);
  const { totpAt } = await import('../totp.js');
  withDb(keyServer.dbPath, db => db.prepare('update users set two_fa_last_step = 0 where email = ?').run('happy@test.local'));
  const enable = await c.post('/api/auth/tfa/enable', { code: totpAt(enroll.data.secret, Date.now() / 1000) });
  assert.equal(enable.status, 200, `enable succeeded: ${JSON.stringify(enable.data)}`);
  withDb(keyServer.dbPath, db => db.prepare('update users set two_fa_last_step = 0 where email = ?').run('happy@test.local'));
  const res = await disableWithCode(c, totpAt(enroll.data.secret, Date.now() / 1000));
  assert.equal(res.status, 200, `disable with a live code must succeed: ${JSON.stringify(res.data)}`);
  const row = userRow(keyServer.dbPath, 'happy@test.local');
  assert.equal(row.two_fa_enabled, 0, 'the teardown ran');
});
