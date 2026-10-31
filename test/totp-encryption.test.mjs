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
import crypto from 'node:crypto';
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

/* ---------- D-78c: the exclusivity proof — the wrapper is the ONLY plaintext producer ---------- */

test('decryptTotpSecret is referenced ONLY by its definition, requireTotpSecret, and the D-K7 boot probe', () => {
  /* Call-syntax occurrences: the `function decryptTotpSecret(` definition line,
     the call inside requireTotpSecret, and the D-K7 (Phase 25) decryptability
     probe in migrateTotpEncryption — a boolean check whose result is DISCARDED,
     never exposed as plaintext. Comment mentions use a space before "(" and
     never match. */
  const callSites = [...serverSource.matchAll(/decryptTotpSecret\(/g)].map(m => m.index);
  assert.equal(callSites.length, 3, `expected definition + wrapper call + D-K7 probe, found ${callSites.length} call-syntax occurrences`);

  const defAt = serverSource.indexOf('function decryptTotpSecret(');
  const wrapperAt = serverSource.indexOf('function requireTotpSecret(');
  const wrapperBodyEnd = serverSource.indexOf('/* D-46: pending');
  const migrationAt = serverSource.indexOf('function migrateTotpEncryption(');
  const migrationBodyEnd = serverSource.indexOf('/*\n * Invites created before');
  assert.ok(defAt !== -1, 'the decryptTotpSecret definition is missing');
  assert.ok(wrapperAt !== -1 && wrapperBodyEnd > wrapperAt, 'the requireTotpSecret wrapper is missing');
  assert.ok(migrationAt !== -1 && migrationBodyEnd > migrationAt, 'the migrateTotpEncryption block is missing');
  for (const at of callSites) {
    const inDef = at >= defAt && at < defAt + 'function decryptTotpSecret('.length;
    const inWrapper = at > wrapperAt && at < wrapperBodyEnd;
    const inMigration = at > migrationAt && at < migrationBodyEnd;
    assert.ok(inDef || inWrapper || inMigration, `a direct decryptTotpSecret call site exists outside the sanctioned regions at offset ${at}`);
  }
  assert.equal(serverSource.indexOf('function requireTotpSecret('), wrapperAt, 'requireTotpSecret defined exactly once');
});

test('both call sites branch on wrapped.ok and feed wrapped.secret to verifyTotpCode', () => {
  /* Phase 20 added the third surface (regen route); every added surface must
     keep the wrapper + fail-closed shape (D-77/D-89), so the count is a
     tracked floor per route, not a hard 2. */
  assert.equal((serverSource.match(/const wrapped = requireTotpSecret\(/g) || []).length, 3, 'expected three wrapped call sites (disable, verify, regen)');
  assert.equal((serverSource.match(/if \(!wrapped\.ok\) return 'masterKey';/g) || []).length, 3, 'all call sites must branch on ok:false');
  assert.equal((serverSource.match(/verifyTotpCode\(wrapped\.secret/g) || []).length, 3, 'wrapped.secret must feed verifyTotpCode');
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
  keyDir = fs.mkdtempSync(path.join(fs.tmpdir !== undefined ? fs.tmpdir() : '/tmp', 'projects-totpe-key-'));
  keyServer = await startServer({ dataDir: keyDir, env: { MASTER_KEY: 'projects-enc-suite-key' } });
  noKeyDir = fs.mkdtempSync(path.join(fs.tmpdir !== undefined ? fs.tmpdir() : '/tmp', 'projects-totpe-nokey-'));
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

/* ---------- KEY-01 (Phase 25): structural drift guards on the migration ---------- */

test('the migration filter and re-check share exactly ONE version-recognizer predicate (KEY-01, D-75)', () => {
  /* Exactly one definition, and it is the generic /^v\d+:/ pattern — never a
     known-versions list (D-K6 prohibition). */
  const defs = [...serverSource.matchAll(/function isEnvelopeVersion\(/g)].length;
  assert.equal(defs, 1, `expected exactly one predicate definition, found ${defs}`);
  const defAt = serverSource.indexOf('function isEnvelopeVersion(');
  assert.ok(
    serverSource.includes('const ENVELOPE_VERSION_RE = /^v\\d+:/;') && defAt > -1,
    'the predicate must be backed by the generic /^v\\d+:/ envelope pattern',
  );

  /* The two v1-only shapes are gone for good: a resurfaced `not like 'v1:%'`
     sole filter or `startsWith('v1:')` re-check would destroy future-version
     envelope rows on boot (T-25-01). */
  assert.ok(!serverSource.includes("not like 'v1:%'"), "a v1-only SQL filter resurfaced");
  assert.ok(!serverSource.includes("startsWith('v1:')"), "a v1-only startsWith re-check resurfaced");

  /* The in-transaction D-75 re-check calls the shared predicate — the
     defense-in-depth layers cannot silently drift apart. */
  const recheckAt = serverSource.indexOf('// D-75: per-row re-check');
  assert.ok(recheckAt > -1, 'the D-75 re-check anchor moved');
  const recheckRegion = serverSource.slice(recheckAt, recheckAt + 900);
  assert.match(recheckRegion, /if \(isEnvelopeVersion\(value\)\) \{/, 'the in-transaction re-check must call the shared predicate');
});

test('requireTotpSecret keeps its D-77/D-79 signature and single-decrypt-boundary shape (SC-4 guard)', () => {
  const at = serverSource.indexOf('function requireTotpSecret(');
  assert.ok(at > -1, 'requireTotpSecret moved');
  const body = serverSource.slice(at, at + 300);
  assert.match(body, /function requireTotpSecret\(envelope\) \{/, 'the single-decrypt-boundary signature changed');
  assert.match(body, /decryptTotpSecret\(envelope\)/, 'requireTotpSecret must keep delegating to decryptTotpSecret');
});

/* ---------- KEY-02 (Phase 25): keyring + v2 envelope ---------- */

const SUITE_KEY = 'projects-enc-suite-key';
const sha256Hex = (m) => crypto.createHash('sha256').update(m).digest('hex');
const idOf = (m) => sha256Hex(m).slice(0, 8); // D-K3 mirror: first 8 hex of sha256(raw material)
const encKey = (m) => crypto.createHash('sha256').update(m).digest();

/* Test-side v2 mirror (envelope mirror pattern): wraps a known secret exactly
   as D-K4 specifies, against an explicit key material — used to plant
   hand-built envelopes. One sha256 call yields both the AES key and the id. */
function wrapV2(secret, material) {
  const digest = crypto.createHash('sha256').update(material);
  const key = digest.digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return `v2:${key.toString('hex').slice(0, 8)}:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

const enableFor = (server, email) =>
  withDb(server.dbPath, db =>
    db.prepare('update users set two_fa_enabled = 1, two_fa_last_step = 0 where email = ?').run(email));

test('tracer: a planted v2 envelope with the current key id verifies through the real login path (SC-2)', async () => {
  const email = 'v2-current@test.local';
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const s = await signup(keyServer.base, { name: 'V2', email, password: GOOD });
  assert.equal(s.status, 201);
  plant(keyServer.dbPath, email, wrapV2(secret, SUITE_KEY));
  enableFor(keyServer, email);
  assert.match(wrapV2(secret, SUITE_KEY), /^v2:[0-9a-f]{8}:/, 'the envelope mirror must produce the 5-part v2 shape');
  const { totpAt } = await import('../totp.js');
  const res = await verifyLogin(keyServer, email, totpAt(secret, Date.now() / 1000));
  assert.equal(res.status, 200, `v2 round-trip verify must succeed: ${JSON.stringify(res.data)}`);
});

test('D-K3 determinism: key-id derivation is a stable 8-hex-char mirror of sha256(raw material)', () => {
  const id = idOf(SUITE_KEY);
  assert.match(id, /^[0-9a-f]{8}$/, 'the key id must be exactly 8 lowercase hex chars');
  assert.equal(id, idOf(SUITE_KEY), 'the derivation must be deterministic');
  assert.equal(id, sha256Hex(SUITE_KEY).slice(0, 8), 'id and AES key must come from the same hash input (Pitfall 3)');
  assert.notEqual(idOf(SUITE_KEY), idOf('another-material'), 'different material must yield a different id');
});

test('D-K2: MASTER_KEY_PREVIOUS set without MASTER_KEY fails boot loudly', async () => {
  await assert.rejects(
    () => startServer({ env: { MASTER_KEY: undefined, MASTER_KEY_PREVIOUS: 'orphaned-previous' } }),
    /MASTER_KEY_PREVIOUS is set but MASTER_KEY is not/,
    'boot must fail with the D-K2 message',
  );
});

test('previous-key v2 envelope: decrypts with both keys configured, 503 fail-closed when only the current key is set', async () => {
  const dir = fs.mkdtempSync(path.join(fs.tmpdir !== undefined ? fs.tmpdir() : '/tmp', 'projects-totpe-ring-'));
  const CURRENT = 'ring-current-key';
  const PREVIOUS = 'ring-previous-key';
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const email = 'v2-previous@test.local';
  const { totpAt } = await import('../totp.js');
  try {
    const both = await startServer({ dataDir: dir, env: { MASTER_KEY: CURRENT, MASTER_KEY_PREVIOUS: PREVIOUS } });
    const s = await signup(both.base, { name: 'Prev', email, password: GOOD });
    assert.equal(s.status, 201);
    const envelope = wrapV2(secret, PREVIOUS);
    assert.match(envelope, new RegExp(`^v2:${idOf(PREVIOUS)}:`), 'the planted envelope must carry the PREVIOUS key id');
    plant(both.dbPath, email, envelope);
    enableFor(both, email);
    const ok = await verifyLogin(both, email, totpAt(secret, Date.now() / 1000));
    assert.equal(ok.status, 200, `previous-key envelope must decrypt with both keys: ${JSON.stringify(ok.data)}`);
    await both.stop();

    const currentOnly = await startServer({ dataDir: dir, env: { MASTER_KEY: CURRENT, MASTER_KEY_PREVIOUS: undefined } });
    const missing = await verifyLogin(currentOnly, email, totpAt(secret, Date.now() / 1000));
    assert.equal(missing.status, 503, 'a v2 row whose key left the keyring must 503 (D-K5 fail-closed)');
    assert.equal(missing.data.code, 'masterKeyMissing', 'wrong error code');
    assert.equal(missing.data.error, VERIFY_COPY, 'verify-route copy changed');
    const row = userRow(dir + '/projects.db', email);
    assert.equal(row.two_fa_secret, envelope, 'the stored row must never be mutated');
    assert.equal(row.two_fa_enabled, 1, 'the row must never be disabled or rewritten');
    await currentOnly.stop();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('D-K5 strictness: malformed-id, unknown-id and corrupt-tag v2 rows each 503 fail-closed with rows unmutated', async () => {
  const email = 'v2-bad@test.local';
  const s = await signup(keyServer.base, { name: 'Bad', email, password: GOOD });
  assert.equal(s.status, 201);
  enableFor(keyServer, email);
  const good = wrapV2('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', SUITE_KEY);
  const [v, kid, ivB64, tagB64, ctB64] = good.split(':');
  const corruptTag = [v, kid, ivB64, `${tagB64.slice(0, -2)}AA`, ctB64].join(':');
  const variants = [
    ['malformed-id-non-hex', 'v2:zzzzzzzz:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:CCCCCCCCCCCCCCCCCCCCCCCCCCCC'],
    ['malformed-id-wrong-length', 'v2:abc:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:CCCCCCCCCCCCCCCCCCCCCCCCCCCC'],
    ['unknown-id', good.replace(`v2:${kid}:`, 'v2:00000000:')],
    ['corrupt-tag', corruptTag],
  ];
  for (const [variant, value] of variants) {
    plant(keyServer.dbPath, email, value);
    const res = await verifyLogin(keyServer, email);
    assert.equal(res.status, 503, `${variant}: expected the fail-closed 503`);
    assert.equal(res.data.code, 'masterKeyMissing', `${variant}: wrong error code`);
    const row = userRow(keyServer.dbPath, email);
    assert.equal(row.two_fa_secret, value, `${variant}: the stored value must not be rewritten`);
    assert.equal(row.two_fa_enabled, 1, `${variant}: two_fa_enabled must not be mutated`);
  }
});
