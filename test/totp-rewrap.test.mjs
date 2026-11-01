/* Phase 26 — re-wrap rotation (KEY-03). Proves that setting MASTER_KEY (new) +
   MASTER_KEY_PREVIOUS (old) and rebooting converges every old-envelope secret
   to `v2:<new-key-id>:…` in one boot (SC-1), idempotently (SC-2), behind the
   pre-migration backup guarantee (SC-3, D-74/D-K16), on REAL SQLite via REAL
   boots — no mocks. Seeds are planted with in-suite AES mirrors (wrapV1 /
   wrapV2) of the server's own format (D-K3/D-K4/D-K5). */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const GOOD = 'password-1234';
const BACKUP_PREFIX = 'projects-preenvelope-';

/* ---------- seed mirrors (house pattern: totp-encryption.test.mjs) ---------- */

const sha256Hex = s => crypto.createHash('sha256').update(s).digest('hex');
const idOf = material => sha256Hex(material).slice(0, 8);

const sealAesGcm = (secret, material, version) => {
  const key = crypto.createHash('sha256').update(material).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag().toString('base64');
  const ctB64 = ct.toString('base64');
  const ivB64 = iv.toString('base64');
  return version === 'v2'
    ? `v2:${key.toString('hex').slice(0, 8)}:${ivB64}:${tag}:${ctB64}`
    : `v1:${ivB64}:${tag}:${ctB64}`;
};
const wrapV1 = (secret, material) => sealAesGcm(secret, material, 'v1');
const wrapV2 = (secret, material) => sealAesGcm(secret, material, 'v2');

/* In-suite decrypt mirror: resolves the key id through the supplied material
   map — never touches server code — so assertions prove the ciphertext really
   decrypts to the original secret under the expected key. */
const unwrapWith = (envelope, materials) => {
  const parts = String(envelope).split(':');
  const material = parts[0] === 'v1' ? materials.v1 : materials[parts[1]];
  if (!material) return null;
  const key = crypto.createHash('sha256').update(material).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[parts.length - 3], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[parts.length - 2], 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(parts[parts.length - 1], 'base64')), decipher.final()]).toString('utf8');
};

/* ---------- row/backup helpers (migration.test.mjs / totp-encryption pattern) ---------- */

const plant = (dbPath, email, value) =>
  withDb(dbPath, db => db.prepare('update users set two_fa_secret = ? where email = ?').run(value, email));
const userRow = (dbPath, email) => withDb(dbPath, db => db.prepare('select * from users where email = ?').get(email));
const backups = dataDir => fs.readdirSync(dataDir).filter(name => name.startsWith(BACKUP_PREFIX) && name.endsWith('.db'));
const enableFor = (dbPath, email) =>
  withDb(dbPath, db => db.prepare('update users set two_fa_enabled = 1, two_fa_last_step = 0 where email = ?').run(email));

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const K1 = 'rewrap-old-key'; // becomes MASTER_KEY_PREVIOUS
const K2 = 'rewrap-new-key'; // becomes MASTER_KEY

/* ---------- tracer: the whole vertical slice with ONE row ---------- */

const tracerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-rewrap-tracer-'));
const tracerEmail = 'tracer-v1prev@test.local';
let tracerRowAfterRotation = null;

after(async () => {
  fs.rmSync(tracerDir, { recursive: true, force: true });
});

test('tracer: one v1-under-previous row re-wraps to v2 under the NEW key id in one boot, then idempotent', async () => {
  // Boot 1: both keys configured from the start — a pre-25-style fleet is
  // simulated purely by planting rows (the signup itself stores no secret).
  const boot1 = await startServer({ dataDir: tracerDir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
  const s = await signup(boot1.base, { name: 'Tracer', email: tracerEmail, password: GOOD });
  assert.equal(s.status, 201);
  await boot1.stop();

  // Pitfall-1 seed: v1 sealed by the OLD key — decryptTotpSecret cannot resolve it.
  plant(path.join(tracerDir, 'projects.db'), tracerEmail, wrapV1(SECRET, K1));
  assert.equal(backups(tracerDir).length, 0, 'no backup before the rotation boot');

  // Boot 2: the rotation boot.
  const boot2 = await startServer({ dataDir: tracerDir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
  const row = userRow(path.join(tracerDir, 'projects.db'), tracerEmail);
  tracerRowAfterRotation = row.two_fa_secret;
  assert.match(
    tracerRowAfterRotation,
    new RegExp(`^v2:${idOf(K2)}:[^:]+:[^:]+:[^:]+$`),
    'the re-sealed envelope must carry the NEW key id (D-K10: target is always v2)',
  );
  assert.equal(unwrapWith(tracerRowAfterRotation, { [idOf(K2)]: K2 }), SECRET, 'the new envelope must decrypt to the original secret');
  assert.equal(
    backups(tracerDir).length,
    1,
    `exactly one pre-migration backup for the rotation boot, found: ${backups(tracerDir).join(', ')}`,
  );
  assert.match(boot2.output(), /  TOTP re-wrap: 1 row\(s\) re-sealed/, 'the re-wrap summary line must report the re-seal');
  await boot2.stop();

  // Boot 3: idempotence core — byte-identical no-op, zero new backups (SC-2).
  const boot3 = await startServer({ dataDir: tracerDir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
  const after = userRow(path.join(tracerDir, 'projects.db'), tracerEmail).two_fa_secret;
  assert.equal(after, tracerRowAfterRotation, 'second rotation boot must be byte-identical');
  assert.equal(backups(tracerDir).length, 1, 'a converged boot mints no new backup');
  await boot3.stop();
});

/* ---------- Task 2: full seed matrix — every envelope shape, one rotation boot ---------- */

test('seed matrix: v1-under-previous, v1-under-current, v2-under-previous, v2-under-current, plaintext, undecryptable, blank', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-rewrap-matrix-'));
  const seed = [
    ['matrix-v1prev@test.local', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'],
    ['matrix-v1cur@test.local', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'],
    ['matrix-v2prev@test.local', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'],
    ['matrix-v2cur@test.local', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'],
    ['matrix-plain@test.local', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'],
    ['matrix-undec@test.local', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'],
    ['matrix-blank@test.local', ''],
  ];
  const dbPath = path.join(dir, 'projects.db');
  const servers = [];
  try {
    const boot1 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
    servers.push(boot1);
    /* Signup throttles at 5/IP/hour — the first five users sign up through the
       real route; the last two are direct inserts (their envelopes are planted
       either way, so the signup path is not what this suite exercises). */
    for (const [email] of seed.slice(0, 5)) {
      const r = await signup(boot1.base, { name: 'M', email, password: GOOD });
      assert.equal(r.status, 201, `signup ${email}`);
    }
    await boot1.stop();
    withDb(dbPath, db => {
      const ins = db.prepare('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)');
      ins.run(crypto.randomUUID(), seed[5][0], 'M', 'x', Date.now());
      ins.run(crypto.randomUUID(), seed[6][0], 'M', 'x', Date.now());
    });

    plant(dbPath, seed[0][0], wrapV1(seed[0][1], K1)); // v1 under the OLD key — D-K8 trial must reach PREVIOUS
    plant(dbPath, seed[1][0], wrapV1(seed[1][1], K2)); // v1 under the CURRENT key — trial stops at CURRENT
    plant(dbPath, seed[2][0], wrapV2(seed[2][1], K1)); // v2 carrying the PREVIOUS key id
    const v2curBefore = wrapV2(seed[3][1], K2);
    plant(dbPath, seed[3][0], v2curBefore); // v2 under the CURRENT key — must end byte-identical
    plant(dbPath, seed[4][0], seed[4][1]); // plaintext — migrateTotpEncryption's stock in the same boot (Pitfall 2)
    const iv = crypto.randomBytes(12);
    plant(
      dbPath,
      seed[5][0],
      `v2:zzzzzzzz:${iv.toString('base64')}:${Buffer.alloc(16).toString('base64')}:${crypto.randomBytes(24).toString('base64')}`,
    ); // undecryptable under every keyring key (D-K9)
    plant(dbPath, seed[6][0], ''); // blank — nobody's stock

    const boot2 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
    servers.push(boot2);
    const materials = { [idOf(K2)]: K2 };
    const rowOf = email => userRow(dbPath, email).two_fa_secret;

    assert.match(rowOf(seed[0][0]), new RegExp(`^v2:${idOf(K2)}:`), 'v1-under-previous must re-seal to v2 under the new key id (D-K8 trial reaches PREVIOUS)');
    assert.equal(unwrapWith(rowOf(seed[0][0]), materials), seed[0][1], 'v1-under-previous plaintext preserved');
    assert.match(rowOf(seed[1][0]), new RegExp(`^v2:${idOf(K2)}:`), 'v1-under-current must re-seal (D-K8: current-first)');
    assert.equal(unwrapWith(rowOf(seed[1][0]), materials), seed[1][1], 'v1-under-current plaintext preserved');
    assert.match(rowOf(seed[2][0]), new RegExp(`^v2:${idOf(K2)}:`), 'v2-under-previous must re-seal to the new key id');
    assert.equal(unwrapWith(rowOf(seed[2][0]), materials), seed[2][1], 'v2-under-previous plaintext preserved');
    assert.equal(rowOf(seed[3][0]), v2curBefore, 'v2-under-current must stay byte-identical');
    assert.match(rowOf(seed[4][0]), new RegExp(`^v2:${idOf(K2)}:`), 'plaintext must land as v2 after BOTH sibling passes cooperate');
    assert.equal(unwrapWith(rowOf(seed[4][0]), materials), seed[4][1], 'plaintext secret preserved through both passes');
    const undecAfter = rowOf(seed[5][0]);
    assert.ok(undecAfter.startsWith('v2:zzzzzzzz:'), 'D-K9: never deleted, never mutated — the planted id survives byte-identical');
    assert.equal(rowOf(seed[6][0]), '', 'the blank row must stay blank');

    const undecId = userRow(dbPath, seed[5][0]).id;
    assert.ok(
      boot2.output().includes(`user ${undecId} carries an envelope that decrypts under neither keyring key`),
      'a D-K9 warn naming the user id must have been emitted',
    );
    assert.match(boot2.output(), /  TOTP re-wrap: 4 row\(s\) re-sealed/, 'summary counters must match the candidates: 3 planted stale + the plaintext the encryption pass sealed earlier in the same boot');
    assert.match(boot2.output(), /  TOTP re-wrap: 4 row\(s\) re-sealed to v2:<current-key-id>, 1 undecryptable/, 'the undecryptable count must be reported');
    const minted = backups(dir);
    assert.ok(minted.length >= 1 && minted.length <= 2, `one backup per pass at most (encryption + re-wrap), found ${minted.length}`);
    await boot2.stop();

    // SC-2 candidate coverage: a third boot converges nothing new.
    const before = seed.map(([email]) => rowOf(email));
    const boot3 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
    servers.push(boot3);
    assert.deepEqual(seed.map(([email]) => rowOf(email)), before, 'every row byte-identical after the second rotation boot');
    /* The D-K9 row is a stale candidate FOREVER (it must never be mutated or
       guessed), so the pass re-scans it and D-74 mints one backup per rotation
       boot before discovering nothing is re-sealable — the rows themselves are
       the idempotence contract, and the churn is bounded by WR-02 pruning. */
    assert.ok(backups(dir).length <= minted.length + 1, 'at most one bounded re-scan backup on the converged boot');
    assert.ok(
      boot3.output().includes('1 undecryptable left as-is'),
      'the D-K9 row is still counted and warned on every rotation boot — never silently dropped',
    );
    await boot3.stop();
  } finally {
    for (const server of servers) await server?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------- Task 2: D-74 backup guarantee — failure skips the pass entirely ---------- */

test('D-74: a failed pre-migration backup leaves every stale row byte-identical and logs the skip line', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-rewrap-bkfail-'));
  const badDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-rewrap-bkfail-dd-'));
  fs.mkdirSync(path.join(badDataDir, 'files'), { recursive: true }); // boot mints DATA_DIR/files — pre-create it
  fs.chmodSync(badDataDir, 0o555); // backup `vacuum into` can no longer create a file here
  const email = 'bkfail@test.local';
  const dbPath = path.join(dir, 'projects.db');
  const servers = [];
  try {
    const boot1 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
    servers.push(boot1);
    assert.equal((await signup(boot1.base, { name: 'B', email, password: GOOD })).status, 201);
    await boot1.stop();
    const stale = wrapV1(SECRET, K1);
    plant(dbPath, email, stale);

    // DATA_DIR (hence the backup target) points at the unwritable directory;
    // DB_PATH stays in the writable one, so the boot itself is healthy.
    const boot2 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1, DATA_DIR: badDataDir } });
    servers.push(boot2);
    assert.equal(userRow(dbPath, email).two_fa_secret, stale, 'a failed backup must leave the row byte-identical (no backup = no mutation)');
    assert.match(boot2.output(), /TOTP re-wrap skipped: pre-migration backup failed/, 'the skip line must be logged');
    assert.doesNotMatch(boot2.output(), /row\(s\) re-sealed/, 'no re-seal may happen after a failed backup');
    await boot2.stop();
  } finally {
    for (const server of servers) await server?.stop();
    fs.chmodSync(badDataDir, 0o755);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(badDataDir, { recursive: true, force: true });
  }
});

/* ---------- Task 2: D-K14 gate silence — single-key boots never touch rows ---------- */

test('D-K14: boots with only MASTER_KEY never scan, never warn, never touch stale rows, never back up', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-rewrap-gate-'));
  const email = 'gated@test.local';
  const dbPath = path.join(dir, 'projects.db');
  const servers = [];
  try {
    const boot1 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2 } });
    servers.push(boot1);
    assert.equal((await signup(boot1.base, { name: 'G', email, password: GOOD })).status, 201);
    await boot1.stop();
    const v1prev = wrapV1(SECRET, K1);
    const v2prev = wrapV2(SECRET, K1);
    plant(dbPath, email, v1prev);
    const other = 'gated-2@test.local';
    const boot1b = await startServer({ dataDir: dir, env: { MASTER_KEY: K2 } });
    servers.push(boot1b);
    assert.equal((await signup(boot1b.base, { name: 'G2', email: other, password: GOOD })).status, 201);
    await boot1b.stop();
    plant(dbPath, other, v2prev);

    const boot2 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: undefined } });
    servers.push(boot2);
    assert.equal(userRow(dbPath, email).two_fa_secret, v1prev, 'v1-under-previous untouched on a single-key boot');
    assert.equal(userRow(dbPath, other).two_fa_secret, v2prev, 'v2-under-previous untouched on a single-key boot');
    assert.ok(!boot2.output().includes('TOTP re-wrap'), 'Pitfall 7: the gated pass emits nothing — no summary, no D-K9 warn');
    assert.equal(backups(dir).length, 0, 'no backup from the re-wrap pass (the gate precedes the backup)');
    await boot2.stop();
  } finally {
    for (const server of servers) await server?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------- Task 2: SC-1 tail — no 2FA re-enrollment after rotation ---------- */

test('SC-1 tail: a real 2FA login verifies with the SAME enrolled device secret after a rotation boot', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-rewrap-login-'));
  const email = 'noreenroll@test.local';
  const dbPath = path.join(dir, 'projects.db');
  const servers = [];
  try {
    const boot1 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
    servers.push(boot1);
    assert.equal((await signup(boot1.base, { name: 'L', email, password: GOOD })).status, 201);
    await boot1.stop();
    enableFor(dbPath, email);
    plant(dbPath, email, wrapV1(SECRET, K1));

    const boot2 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
    servers.push(boot2);
    assert.match(userRow(dbPath, email).two_fa_secret, new RegExp(`^v2:${idOf(K2)}:`), 'the rotation boot re-sealed the enrolled secret');
    await boot2.stop();

    const { totpAt } = await import('../totp.js');
    const boot3 = await startServer({ dataDir: dir, env: { MASTER_KEY: K2, MASTER_KEY_PREVIOUS: K1 } });
    servers.push(boot3);
    const c = await login(boot3.base, email, GOOD);
    assert.equal(c.status, 200);
    assert.ok(c.data?.pending2fa, 'the re-wrapped account still answers pending2fa');
    const verify = await c.client.post('/api/auth/tfa/login', { code: totpAt(SECRET, Date.now() / 1000) });
    assert.equal(verify.status, 200, `verification with the SAME enrolled secret must succeed post-rotation: ${JSON.stringify(verify.data)}`);
    await boot3.stop();
  } finally {
    for (const server of servers) await server?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
