/* TOTP2-01/03 wave 0: the `totp_factors` single source of truth — the
   one-time boot copy of the primary factor (D-06/D-07/D-09), the
   byte-identical second boot, and the any-factor login verify path with
   its per-factor replay guard (D-10/D-11/D-12). RED until the server
   lands the schema, the copy and the shared helper (tracer task). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { loginTfa, signup, startServer, withDb } from './helpers/server.mjs';

const KEY = 'projects-multifactor-suite-key';
const EMAIL = 'legacy-totp@test.local';
const PASSWORD = 'password-1234';
/* D-07: the fixed catalogue key stored on the migrated row, localized at
   display time — never free text. */
const PRIMARY_KEY = 'settings.tfa.factor.primary';

let dataDir;
let server;
let legacy; // { secret, lastStep } captured from users before the copy boot
let plainSecret; // plaintext TOTP secret captured from the enroll response
let factorSnap; // totp_factors snapshot after the copy boot (M2 baseline)
let schemaSnap; // pragma table_info snapshot after the copy boot (M2 baseline)

const factors = () => withDb(server.dbPath, db => db.prepare('select * from totp_factors order by created_at').all());
const factorInfo = () => withDb(server.dbPath, db => db.prepare("pragma table_info('totp_factors')").all().map(c => ({ ...c })));
const prefactorBackups = () => fs.readdirSync(dataDir).filter(name => name.startsWith('projects-prefactors-') && name.endsWith('.db'));
const { totpAt } = await import('../totp.js');

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-multifactor-'));
  /* Build the "legacy" 2FA state through the real enrollment flow, then stop:
     the next boot against the same dataDir IS the migration boot. */
  const boot = await startServer({ dataDir, env: { MASTER_KEY: KEY } });
  const s = await signup(boot.base, { name: 'Legacy', email: EMAIL, password: PASSWORD });
  assert.equal(s.status, 201, `signup: ${JSON.stringify(s.data)}`);
  const enroll = await s.client.post('/api/auth/tfa/enroll', { currentPassword: PASSWORD });
  assert.equal(enroll.status, 200, `enroll: ${JSON.stringify(enroll.data)}`);
  plainSecret = enroll.data.secret;
  /* Zero the users baseline so the enable-time matchedStep is deterministic
     (same pattern as test/totp-encryption.test.mjs's SC-2 reset). */
  withDb(boot.dbPath, db => db.prepare('update users set two_fa_last_step = 0 where email = ?').run(EMAIL));
  const enable = await s.client.post('/api/auth/tfa/enable', { code: totpAt(plainSecret, Date.now() / 1000) });
  assert.equal(enable.status, 200, `enable: ${JSON.stringify(enable.data)}`);
  const row = withDb(boot.dbPath, db => db.prepare('select two_fa_secret, two_fa_last_step from users where email = ?').get(EMAIL));
  legacy = { secret: row.two_fa_secret, lastStep: row.two_fa_last_step };
  assert.ok(legacy.secret, 'the legacy state has a non-empty secret envelope');
  /* Revert to the TRUE legacy shape: a users row with no factor row yet. The
     production enable path now inserts the factor row itself (D-06) — deleting
     it here recreates the pre-migration state the boot copy must migrate. */
  withDb(boot.dbPath, db => db.prepare('delete from totp_factors').run());
  await boot.stop();

  server = await startServer({ dataDir, env: { MASTER_KEY: KEY } }); // the migration boot
  factorSnap = factors();
  schemaSnap = factorInfo();
});

after(async () => {
  await server?.stop();
  /* The harness must never delete a caller-supplied directory; this suite owns it. */
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('M1: the migration boot copies the primary factor into exactly one totp_factors row (D-06/D-09)', () => {
  assert.equal(factorSnap.length, 1, 'exactly one factor row after the copy boot');
  const row = factorSnap[0];
  assert.equal(row.secret, legacy.secret, 'the envelope is copied byte-for-byte (decrypt-free copy)');
  assert.equal(row.last_step, legacy.lastStep, 'last_step continuity from users.two_fa_last_step (D-09)');
  assert.equal(row.name, PRIMARY_KEY, 'the fixed catalogue key is stored (D-07)');
  assert.ok(row.user_id, 'the row is linked to its user');
  assert.ok(row.created_at > 0, 'the row carries a creation timestamp');
});

test('T1: a fresh code from the migrated factor authenticates at the login second step (TOTP2-01)', async () => {
  /* Deterministic baseline: zero the per-factor replay guard so the fresh
     code cannot collide with the enable-time matchedStep (30s window). */
  withDb(server.dbPath, db => db.prepare('update totp_factors set last_step = 0 where user_id = (select id from users where email = ?)').run(EMAIL));
  const res = await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret, Date.now() / 1000));
  assert.equal(res.status, 200, `login step 2: ${JSON.stringify(res.data)}`);
  assert.ok(res.data?.user, 'the session is minted');
});

test('T2: the same code is refused on replay — the per-factor last_step guard (D-10)', async () => {
  const res = await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret, Date.now() / 1000));
  assert.equal(res.status, 400, 'a replayed code is rejected');
  assert.equal(res.data?.code, 'invalidTfaCode', 'the no-oracle error shape (D-65)');
});

test('T3: the shared helper decrypts only through requireTotpSecret — never decryptTotpSecret (D-77/D-12)', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'server.js'), 'utf8');
  const at = src.indexOf('function verifyTotpAgainstFactors(');
  assert.ok(at > -1, 'the shared factor-loop helper exists');
  const nextFn = src.indexOf('\nfunction ', at + 10);
  const body = src.slice(at, nextFn === -1 ? src.length : nextFn);
  assert.match(body, /const wrapped = requireTotpSecret\(/, 'per-factor decrypt goes through the single boundary (D-77)');
  assert.match(body, /if \(!wrapped\.ok\) continue;/, 'an undecryptable factor is skipped alone (D-12)');
  assert.ok(!body.includes('decryptTotpSecret('), 'the helper never calls decryptTotpSecret directly');
});

test('M2: the second boot is byte-identical — zero additional rows, schema unchanged, no copy output', async () => {
  /* Refresh the baseline first: T1's successful login advanced the factor's
     last_step (D-04), and Plan 02 retired the enable-time users write that
     used to keep the pre-login copy in sync. M2 proves boot idempotency —
     the snapshot must reflect the state the second boot starts FROM. */
  factorSnap = factors();
  schemaSnap = factorInfo();
  await server.stop();
  server = await startServer({ dataDir, env: { MASTER_KEY: KEY } }); // second boot, same dataDir
  assert.deepEqual(factors(), factorSnap, 'no additional rows after the second boot');
  assert.deepEqual(factorInfo(), schemaSnap, 'totp_factors schema is byte-identical after the second boot');
  assert.ok(!/totp factors: copied/i.test(server.output()), 'the copy never logs on an idempotent boot');
  assert.equal(prefactorBackups().length, 1, 'exactly one pre-copy backup ever — zero eligible rows skip the backup');
});
