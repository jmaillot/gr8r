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
let plainSecret2; // plaintext secret of the second (Tablet) factor added in T6
let factorSnap; // totp_factors snapshot after the copy boot (M2 baseline)
let schemaSnap; // pragma table_info snapshot after the copy boot (M2 baseline)

const factors = () => withDb(server.dbPath, db => db.prepare('select * from totp_factors order by created_at').all());
const factorInfo = () => withDb(server.dbPath, db => db.prepare("pragma table_info('totp_factors')").all().map(c => ({ ...c })));
const prefactorBackups = () => fs.readdirSync(dataDir).filter(name => name.startsWith('projects-prefactors-') && name.endsWith('.db'));
const userIdOf = email => withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);
const recoveryRows = email =>
  withDb(server.dbPath, db =>
    db.prepare('select rc.* from recovery_codes rc join users u on u.id = rc.user_id where u.email = ? order by rc.created_at').all(email));
/* Zero a user's per-factor replay guards so a current-window code verifies (D-04). */
const zeroFactorSteps = (email = EMAIL) =>
  withDb(server.dbPath, db => db.prepare('update totp_factors set last_step = 0 where user_id = (select id from users where email = ?)').run(email));
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

/* ---------- Plan 02: add-factor enroll/enable (TOTP2-02, TOTP2-05, T4..T8) ---------- */

test('T4: add-factor without an existing-factor code is refused (TOTP2-05/D-04)', async () => {
  zeroFactorSteps();
  const auth = (await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret, Date.now() / 1000))).client;
  const res = await auth.post('/api/auth/tfa/factors/enroll', { currentPassword: PASSWORD, code: '', label: 'Phone' });
  assert.equal(res.status, 400, 'a missing code is refused by the strict 6-digit gate');
  assert.equal(res.data?.code, 'codeRejected');
  assert.equal(factors().length, 1, 'no factor row was created');
});

test('T5: a wrong existing-factor code is refused at add-factor (TOTP2-05/D-04)', async () => {
  zeroFactorSteps();
  const auth = (await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret, Date.now() / 1000))).client;
  const res = await auth.post('/api/auth/tfa/factors/enroll', { currentPassword: PASSWORD, code: '000000', label: 'Phone' });
  assert.equal(res.status, 400, 'a wrong code never reveals a new secret');
  assert.equal(res.data?.code, 'codeRejected');
  assert.equal(factors().length, 1, 'no factor row was created');
});

test('T6: a second factor enrolls with a label, enables, and verifies at login (TOTP2-02/D-02/D-13)', async () => {
  zeroFactorSteps();
  const auth = (await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret, Date.now() / 1000))).client;
  // Step-up gate: a live code from the EXISTING factor before the QR is shown.
  const enroll = await auth.post('/api/auth/tfa/factors/enroll', {
    currentPassword: PASSWORD,
    // +30s window: the login above already advanced the guard past the
    // current step (D-04) — the ±1 window admits the next-step code.
    code: totpAt(plainSecret, Date.now() / 1000 + 30),
    label: 'Tablet',
  });
  assert.equal(enroll.status, 200, `enroll: ${JSON.stringify(enroll.data)}`);
  assert.equal(enroll.data.label, 'Tablet', 'the label round-trips (D-02)');
  const { secret: s2, stagedId } = enroll.data;
  plainSecret2 = s2;
  assert.ok(stagedId, 'a per-factor stagedId is returned (D-13)');
  const enable = await auth.post('/api/auth/tfa/factors/enable', { stagedId, code: totpAt(s2, Date.now() / 1000) });
  assert.equal(enable.status, 200, `enable: ${JSON.stringify(enable.data)}`);
  assert.equal(enable.data.recoveryCodes, undefined, 'no recovery rotation for an additional factor (D-17)');
  const rows = factors().filter(f => f.user_id === userIdOf(EMAIL));
  assert.equal(rows.length, 2, 'two factor rows for the user');
  const second = rows[1];
  assert.equal(second.name, 'Tablet', 'the stored label (D-02)');
  assert.ok(second.last_step > 0, 'the new factor row carries the matched baseline (D-13)');
  const urow = withDb(server.dbPath, db => db.prepare('select two_fa_enabled from users where email = ?').get(EMAIL));
  assert.equal(urow.two_fa_enabled, 1, '2FA stays enabled');
  // Both factors verify at the login second step (TOTP2-01).
  zeroFactorSteps();
  const l1 = await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret, Date.now() / 1000));
  assert.equal(l1.status, 200, 'the primary factor still authenticates');
  zeroFactorSteps();
  const l2 = await loginTfa(server.base, EMAIL, PASSWORD, totpAt(s2, Date.now() / 1000));
  assert.equal(l2.status, 200, 'the second factor authenticates');
});

test('T7: a blank label is refused — no unnamed factor (D-02)', async () => {
  zeroFactorSteps();
  const auth = (await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret, Date.now() / 1000))).client;
  const res = await auth.post('/api/auth/tfa/factors/enroll', {
    currentPassword: PASSWORD,
    code: totpAt(plainSecret, Date.now() / 1000 + 30),
    label: '   ',
  });
  assert.equal(res.status, 400);
  assert.equal(res.data?.code, 'labelRequired');
  assert.equal(factors().filter(f => f.user_id === userIdOf(EMAIL)).length, 2, 'no factor row was created');
});

test('T8: first-ever (post-disable) re-enable rides tfa/enroll → factors/enable and rotates recovery (D-17/D-13)', async () => {
  const email = 'reenable@test.local';
  const s = await signup(server.base, { name: 'Reenable', email, password: PASSWORD });
  assert.equal(s.status, 201);
  const c = s.client;
  // First enable via the legacy password-only pair, then full disable teardown.
  const enroll1 = await c.post('/api/auth/tfa/enroll', { currentPassword: PASSWORD });
  assert.equal(enroll1.status, 200, `enroll1: ${JSON.stringify(enroll1.data)}`);
  const s1 = enroll1.data.secret;
  const enable1 = await c.post('/api/auth/tfa/enable', { code: totpAt(s1, Date.now() / 1000) });
  assert.equal(enable1.status, 200, `enable1: ${JSON.stringify(enable1.data)}`);
  zeroFactorSteps(email);
  const dis = await c.post('/api/auth/tfa/disable', { currentPassword: PASSWORD, code: totpAt(s1, Date.now() / 1000) });
  assert.equal(dis.status, 200, `disable: ${JSON.stringify(dis.data)}`);
  const afterDis = withDb(server.dbPath, db => db.prepare('select two_fa_enabled from users where email = ?').get(email));
  assert.equal(afterDis.two_fa_enabled, 0, 'the teardown ran');
  assert.equal(factors().filter(f => f.user_id === userIdOf(email)).length, 0, 'factor rows died with the disable');
  // Re-enroll via the LEGACY enroll route (password-only, no step-up by
  // design) — its pending entry lands under the LEGACY userId key.
  const enroll2 = await c.post('/api/auth/tfa/enroll', { currentPassword: PASSWORD });
  assert.equal(enroll2.status, 200, `enroll2: ${JSON.stringify(enroll2.data)}`);
  const s2 = enroll2.data.secret;
  // factors/enable with no stagedId resolves the legacy-key fallback.
  const enable2 = await c.post('/api/auth/tfa/factors/enable', { code: totpAt(s2, Date.now() / 1000) });
  assert.equal(enable2.status, 200, `enable2: ${JSON.stringify(enable2.data)}`);
  assert.equal(enable2.data.recoveryCodes?.length, 10, 'first-ever rotation returns the fresh codes exactly once (D-53)');
  const urow = withDb(server.dbPath, db => db.prepare('select two_fa_enabled from users where email = ?').get(email));
  assert.equal(urow.two_fa_enabled, 1, 'two_fa_enabled flips for the first-ever factor (D-13)');
  const rows = factors().filter(f => f.user_id === userIdOf(email));
  assert.equal(rows.length, 1, 'exactly one factor row');
  assert.equal(rows[0].name, 'settings.tfa.factor.primary', 'a legacy pending entry stores the primary catalogue key');
  assert.ok(rows[0].last_step > 0, 'the first factor row carries the matched baseline (D-13)');
  assert.equal(recoveryRows(email).length, 10, 'recovery codes were rotated (D-17)');
  // The re-enabled factor authenticates at login.
  zeroFactorSteps(email);
  const login = await loginTfa(server.base, email, PASSWORD, totpAt(s2, Date.now() / 1000));
  assert.equal(login.status, 200, 'the re-enabled factor verifies at login');
});

/* ---------- Plan 02: remove-factor route (TOTP2-04, D-15/D-16/D-17/D-18, T9..T13) ---------- */

test('T9: removing a factor with a code from the REMOVED factor itself is refused (D-15)', async () => {
  zeroFactorSteps(EMAIL);
  const auth = (await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret, Date.now() / 1000))).client;
  const primaryId = factors().filter(f => f.user_id === userIdOf(EMAIL))[0].id;
  const res = await auth.post('/api/auth/tfa/factors/remove', {
    factorId: primaryId,
    currentPassword: PASSWORD,
    code: totpAt(plainSecret, Date.now() / 1000),
  });
  assert.equal(res.status, 400, 'the removed factor cannot vouch for its own removal');
  assert.equal(res.data?.code, 'codeRejected');
  assert.equal(factors().filter(f => f.user_id === userIdOf(EMAIL)).length, 2, 'no row was deleted');
});

test('T10: removing with a REMAINING factor\'s code succeeds and the survivor still logs in (D-15/D-16)', async () => {
  zeroFactorSteps(EMAIL);
  const auth = (await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret, Date.now() / 1000))).client;
  const [primaryId, tabletId] = factors().filter(f => f.user_id === userIdOf(EMAIL)).map(f => f.id);
  const recoveryBefore = recoveryRows(EMAIL).map(r => r.code_hash).sort();
  // The code comes from the SURVIVOR (Tablet), not the removed primary.
  zeroFactorSteps(EMAIL);
  const res = await auth.post('/api/auth/tfa/factors/remove', {
    factorId: primaryId,
    currentPassword: PASSWORD,
    code: totpAt(plainSecret2, Date.now() / 1000),
  });
  assert.equal(res.status, 200, `remove: ${JSON.stringify(res.data)}`);
  const rows = factors().filter(f => f.user_id === userIdOf(EMAIL));
  assert.equal(rows.length, 1, 'only the target row died');
  assert.equal(rows[0].id, tabletId, 'the remaining factor survives');
  assert.equal(recoveryRows(EMAIL).map(r => r.code_hash).sort().join(), recoveryBefore.join(), 'recovery codes untouched (D-17)');
  // The survivor still authenticates at login.
  zeroFactorSteps(EMAIL);
  const l = await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret2, Date.now() / 1000));
  assert.equal(l.status, 200, 'the remaining factor still verifies at login');
});

test('T11: removing the LAST factor runs the disable teardown verbatim (D-18/TOTP2-04)', async () => {
  // A second session must die with the teardown (revoke-others-keep-current).
  const other = (await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret2, Date.now() / 1000))).client;
  zeroFactorSteps(EMAIL); // the first login advanced the guard — the second needs a fresh window
  const keep = (await loginTfa(server.base, EMAIL, PASSWORD, totpAt(plainSecret2, Date.now() / 1000))).client;
  zeroFactorSteps(EMAIL);
  const tabletId = factors().filter(f => f.user_id === userIdOf(EMAIL))[0].id;
  const res = await keep.post('/api/auth/tfa/factors/remove', {
    factorId: tabletId,
    currentPassword: PASSWORD,
    code: totpAt(plainSecret2, Date.now() / 1000),
  });
  assert.equal(res.status, 200, `last removal: ${JSON.stringify(res.data)}`);
  assert.equal(recoveryRows(EMAIL).length, 0, 'recovery codes wiped (disable contract)');
  const othersGone = await other.get('/api/auth/tfa/factors');
  assert.equal(othersGone.status, 401, 'other sessions were revoked');
  const keepAlive = await keep.get('/api/auth/tfa/factors');
  assert.equal(keepAlive.status, 200, 'the caller\'s own session survives (revoke-others-keep-current)');
});

test('T13: no half-state after the last removal — zero factors, 2FA off (Pitfall 4)', async () => {
  const rows = factors().filter(f => f.user_id === userIdOf(EMAIL));
  assert.equal(rows.length, 0, 'factor count is 0');
  const urow = withDb(server.dbPath, db => db.prepare('select two_fa_enabled, two_fa_secret from users where email = ?').get(EMAIL));
  assert.equal(urow.two_fa_enabled, 0, 'two_fa_enabled is 0');
  assert.equal(urow.two_fa_secret, '', 'the users envelope is cleared by the verbatim teardown');
});

test('T12: a single (non-last) factor removal does NOT rotate recovery codes (D-17)', async () => {
  const email = 'solo@test.local';
  const s = await signup(server.base, { name: 'Solo', email, password: PASSWORD });
  assert.equal(s.status, 201);
  const c = s.client;
  const enroll = await c.post('/api/auth/tfa/enroll', { currentPassword: PASSWORD });
  assert.equal(enroll.status, 200);
  const s1 = enroll.data.secret;
  const enable = await c.post('/api/auth/tfa/enable', { code: totpAt(s1, Date.now() / 1000) });
  assert.equal(enable.status, 200);
  const before = recoveryRows(email).map(r => r.code_hash).sort();
  assert.equal(before.length, 10);
  // Add a second factor (step-up from the first), then remove it.
  zeroFactorSteps(email);
  const add = await c.post('/api/auth/tfa/factors/enroll', { currentPassword: PASSWORD, code: totpAt(s1, Date.now() / 1000), label: 'Spare' });
  assert.equal(add.status, 200, `add: ${JSON.stringify(add.data)}`);
  const enable2 = await c.post('/api/auth/tfa/factors/enable', { stagedId: add.data.stagedId, code: totpAt(add.data.secret, Date.now() / 1000) });
  assert.equal(enable2.status, 200, `enable2: ${JSON.stringify(enable2.data)}`);
  assert.equal(enable2.data.recoveryCodes, undefined, 'no rotation on the additional enable (D-17)');
  zeroFactorSteps(email);
  const spareId = factors().filter(f => f.user_id === userIdOf(email)).map(f => f.id)[1];
  const rm = await c.post('/api/auth/tfa/factors/remove', {
    factorId: spareId,
    currentPassword: PASSWORD,
    code: totpAt(s1, Date.now() / 1000),
  });
  assert.equal(rm.status, 200, `remove: ${JSON.stringify(rm.data)}`);
  assert.equal(recoveryRows(email).map(r => r.code_hash).sort().join(), before.join(), 'recovery codes byte-identical — no rotation');
  const urow = withDb(server.dbPath, db => db.prepare('select two_fa_enabled from users where email = ?').get(email));
  assert.equal(urow.two_fa_enabled, 1, '2FA stays on with one factor left');
});
