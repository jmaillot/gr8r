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
