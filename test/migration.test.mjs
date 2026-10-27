/* The in-place tenancy migration, proven against a real pre-tenancy database:
   backup-first, slug/name/colour derivation, membership linking, invite scoping,
   document cleanup, preserved rows and second-boot idempotency. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createLegacyDb, LEGACY_PASSWORD } from './helpers/legacy-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';

const SLUG = 'legacy-studio';
const BACKUP_PREFIX = 'gr8r-premultitenant-';

let dataDir;
let server;
let output;
/* Captured from the fixture before the server ever opened it (T-04-04). */
let legacyColumns;

const backups = () => fs.readdirSync(dataDir).filter(name => name.startsWith(BACKUP_PREFIX) && name.endsWith('.db'));
const workspaceRow = () => withDb(server.dbPath, db => db.prepare('select * from workspaces where id = ?').get('ws_legacy'));
const membershipRows = () =>
  withDb(server.dbPath, db => db.prepare('select user_id, member_id from memberships where workspace_id = ? order by user_id').all('ws_legacy'));

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-migration-'));
  createLegacyDb(dataDir);
  legacyColumns = withDb(path.join(dataDir, 'gr8r.db'), db =>
    Object.fromEntries(
      ['workspaces', 'memberships', 'invites', 'users', 'sessions'].map(table => [
        table,
        db
          .prepare(`pragma table_info(${table})`)
          .all()
          .map(c => c.name),
      ]),
    ),
  );
  server = await startServer({ dataDir });
  output = server.output();
});

after(async () => {
  await server?.stop();
  /* The harness must never delete a caller-supplied directory; this suite owns it. */
  assert.ok(fs.existsSync(dataDir), 'the harness leaves a caller-supplied dataDir intact');
  fs.rmSync(dataDir, { recursive: true, force: true });
  assert.equal(fs.existsSync(dataDir), false, 'the test removes its own fixture directory');
});

test('first boot writes exactly one pre-migration backup and logs its path', () => {
  assert.equal(legacyColumns.workspaces.includes('slug'), false, 'fixture has no workspaces.slug');
  assert.equal(legacyColumns.workspaces.includes('color'), false, 'fixture has no workspaces.color');
  assert.equal(legacyColumns.memberships.includes('member_id'), false, 'fixture has no memberships.member_id');
  assert.equal(legacyColumns.invites.includes('workspace_id'), false, 'fixture has no invites.workspace_id');
  assert.equal(legacyColumns.sessions.includes('ip'), false, 'fixture has no sessions.ip');
  assert.equal(legacyColumns.users.includes('two_fa_enabled'), false, 'fixture has no users.two_fa_enabled');

  assert.equal(backups().length, 1, 'exactly one gr8r-premultitenant-*.db');
  assert.match(output, /pre-migration backup: /);
});

test('the backup is a genuine pre-rewrite snapshot', () => {
  const [name] = backups();
  withDb(path.join(dataDir, name), db => {
    /* openDb() adds the tenancy columns before migrateTenancy() backs up:
       they exist, but nothing has been written into them yet. */
    const row = db.prepare('select * from workspaces where id = ?').get('ws_legacy');
    assert.equal(row.slug, null);
    assert.equal(row.color, null);

    const doc = JSON.parse(row.doc);
    assert.deepEqual(
      doc.data.workspaces.map(w => w.id),
      ['w1', 'w2'],
    );
    assert.equal(doc.data.me, 'm_alice');

    assert.equal(db.prepare('select count(*) as n from memberships where member_id is not null').get().n, 0);
    assert.equal(db.prepare('select count(*) as n from invites where workspace_id is not null').get().n, 0);
  });
});

test('the migrated row derives slug, name and colour', () => {
  const row = workspaceRow();
  assert.equal(row.slug, SLUG);
  assert.equal(row.name, 'Legacy Studio');
  assert.equal(row.color, '#3D8E5F');
});

test('the migrated document drops the demo switcher, retires data.me and keeps its rows', () => {
  const doc = JSON.parse(workspaceRow().doc);
  assert.equal('workspaces' in doc.data, false, 'data.workspaces is gone');
  assert.equal(doc.data.me, null);
  assert.equal(doc.data.ws.url, SLUG);
  assert.deepEqual(doc.data.projOrder, ['p_keep']);
  assert.equal(doc.data.projects.find(p => p.id === 'p_keep')?.name, 'Surviving Project');
  assert.equal(doc.data.tasks.find(t => t.id === 't_keep')?.project, 'p_keep', 'the task keeps the project key the client reads');
  assert.deepEqual(
    doc.data.tasks.filter(t => t.project === 'p_keep').map(t => t.id),
    ['t_keep'],
    'the client resolution path (tasks.filter(t => t.project === id)) finds the migrated task',
  );
});

test('both member profiles and memberships are linked to their accounts', () => {
  const doc = JSON.parse(workspaceRow().doc);
  const byId = Object.fromEntries(doc.data.members.map(m => [m.id, m]));
  assert.equal(byId.m_alice?.userId, 'u_alice');
  assert.equal(byId.m_bob?.userId, 'u_bob');
  assert.deepEqual(
    membershipRows().map(r => [r.user_id, r.member_id]),
    [
      ['u_alice', 'm_alice'],
      ['u_bob', 'm_bob'],
    ],
  );
});

test('the pending invite is scoped to the migrated workspace', () => {
  const invite = withDb(server.dbPath, db => db.prepare('select * from invites').get());
  assert.equal(invite.workspace_id, 'ws_legacy');
  assert.equal(invite.email, 'new@legacy.local');
});

test('the migrated owner signs in and reads the preserved workspace', async () => {
  const signedIn = await login(server.base, 'alice@legacy.local', LEGACY_PASSWORD);
  assert.equal(signedIn.status, 200);

  const me = await signedIn.client.get('/api/auth/me');
  assert.equal(me.status, 200);
  const listed = me.data.user.workspaces.find(w => w.slug === SLUG);
  assert.ok(listed, 'legacy-studio is listed');
  assert.equal(listed.role, 'owner');

  const read = await signedIn.client.get(`/api/workspaces/${SLUG}`);
  assert.equal(read.status, 200);
  assert.equal(read.data.doc.data.me, null);
  assert.equal('workspaces' in read.data.doc.data, false);
  assert.equal(read.data.doc.data.projects.find(p => p.id === 'p_keep')?.name, 'Surviving Project');
  assert.deepEqual(
    read.data.doc.data.tasks.filter(t => t.project === 'p_keep').map(t => t.id),
    ['t_keep'],
    'the served document resolves the migrated task through the client path',
  );
});

test('a legacy document carrying plan and invoices hydrates and saves without them', async () => {
  /* The fixture's pre-tenancy document still carries `plan` and `invoices`.
     The served document tolerates them; a client write must drop them. */
  const signedIn = await login(server.base, 'alice@legacy.local', LEGACY_PASSWORD);

  const read = await signedIn.client.get(`/api/workspaces/${SLUG}`);
  assert.equal(read.status, 200, 'a legacy document with plan/invoices hydrates');

  const doc = structuredClone(read.data.doc);
  const saved = await signedIn.client.put(`/api/workspaces/${SLUG}`, { revision: read.data.revision, doc });
  assert.equal(saved.status, 200, 'the legacy document saves');

  const after = await signedIn.client.get(`/api/workspaces/${SLUG}`);
  assert.equal(after.data.doc.data.plan, undefined, 'the plan field is gone after a write');
  assert.equal(after.data.doc.data.invoices, undefined, 'the invoices field is gone after a write');
  assert.equal(after.data.doc.data.projects.find(p => p.id === 'p_keep')?.name, 'Surviving Project', 'the rows survive');
});

/* The AUTH-02 Phase 14 migration: session metadata, dormant 2FA columns and the
   login_challenges table — present, and byte-identical between migration surfaces. */
const col = (table, name) =>
  withDb(server.dbPath, db =>
    db
      .prepare(`pragma table_info(${table})`)
      .all()
      .find(c => c.name === name),
  );

test('the first boot lands the full session metadata column set on a legacy database', () => {
  assert.deepEqual(
    withDb(server.dbPath, db =>
      db
        .prepare('pragma table_info(sessions)')
        .all()
        .map(c => c.name),
    ),
    ['token_hash', 'user_id', 'created_at', 'expires_at', 'label', 'ip', 'last_seen_at', 'user_agent'],
  );
});

test('the 2FA columns and the login_challenges table land dormant', () => {
  const userCols = withDb(server.dbPath, db =>
    db
      .prepare('pragma table_info(users)')
      .all()
      .map(c => c.name),
  );
  for (const name of ['two_fa_enabled', 'two_fa_secret', 'two_fa_last_step']) {
    assert.ok(userCols.includes(name), `users.${name} exists after boot`);
  }
  // Dormant means untouched: no per-user backfill (Pitfall 21).
  assert.deepEqual(
    withDb(server.dbPath, db =>
      db
        .prepare('select distinct two_fa_enabled, two_fa_last_step from users order by 1, 2')
        .all()
        .map(r => [r.two_fa_enabled, r.two_fa_last_step]),
    ),
    [[0, 0]],
    'every user row reads integer-not-null-default 0 by absence',
  );
  assert.equal(
    withDb(server.dbPath, db => db.prepare(`select count(*) as n from sqlite_master where type = 'table' and name = 'login_challenges'`).get()).n,
    1,
    'the login_challenges table exists',
  );
  assert.equal(
    withDb(server.dbPath, db => db.prepare(`select count(*) as n from sqlite_master where type = 'index' and name = 'login_challenges_expiry'`).get()).n,
    1,
    'the login_challenges expiry index exists',
  );
  assert.equal(withDb(server.dbPath, db => db.prepare('select count(*) as n from login_challenges').get()).n, 0, 'login_challenges starts empty');
});

test('the seven new columns agree between SCHEMA DDL and ensureColumn on a legacy database', () => {
  /* A name-only check would let an ensureColumn def silently diverge from the SCHEMA
     declaration (a default-less, nullable two_fa_enabled on legacy DBs would pass);
     type, notnull and dflt_value are exactly where the P-B drift surfaces. */
  const expected = {
    'sessions.label': { type: 'TEXT', notnull: 0, dflt_value: null },
    'sessions.ip': { type: 'TEXT', notnull: 0, dflt_value: null },
    'sessions.last_seen_at': { type: 'INTEGER', notnull: 0, dflt_value: null },
    'sessions.user_agent': { type: 'TEXT', notnull: 0, dflt_value: null },
    'users.two_fa_enabled': { type: 'INTEGER', notnull: 1, dflt_value: '0' },
    'users.two_fa_secret': { type: 'TEXT', notnull: 0, dflt_value: null },
    'users.two_fa_last_step': { type: 'INTEGER', notnull: 1, dflt_value: '0' },
  };
  for (const [key, want] of Object.entries(expected)) {
    const [table, name] = key.split('.');
    const got = col(table, name);
    assert.ok(got, `${key} exists`);
    assert.deepEqual({ type: got.type, notnull: got.notnull, dflt_value: got.dflt_value }, want, `${key} definition matches the SCHEMA declaration`);
  }
});

/* Phase 17 post-17 auth surface: the pending-2FA state lives in the
   login_challenges table (challenge cookie + D-66 5-minute TTL), not in a
   sessions column — asserted against the SCHEMA declaration (A2). */
test('the login_challenges table lands with its SCHEMA definition and stays empty through legacy logins', () => {
  const expected = {
    'login_challenges.challenge_token_hash': { type: 'TEXT', notnull: 0, dflt_value: null },
    'login_challenges.user_id': { type: 'TEXT', notnull: 1, dflt_value: null },
    'login_challenges.expires_at': { type: 'INTEGER', notnull: 1, dflt_value: null },
    'login_challenges.attempts': { type: 'INTEGER', notnull: 1, dflt_value: '0' },
  };
  for (const [key, want] of Object.entries(expected)) {
    const [table, name] = key.split('.');
    const got = col(table, name);
    assert.ok(got, `${key} exists`);
    assert.deepEqual({ type: got.type, notnull: got.notnull, dflt_value: got.dflt_value }, want, `${key} definition matches the SCHEMA declaration`);
  }
  /* The owner signed in above; a password login never creates a challenge, so the
     lifecycle on this fixture is: empty at first boot, still empty after logins. */
  assert.equal(
    withDb(server.dbPath, db => db.prepare('select count(*) as n from login_challenges').get()).n,
    0,
    'login_challenges stays empty across the legacy logins (no login activity in the fixture)',
  );
});

test('the served document from a legacy database carries no sessions or tfa fields', async () => {
  /* The fixture document still carries the retired sessions/tfa literals; the
     served copy must be sanitized on every read (D-30). Mirrors the workspaces
     absence check above and the plan/invoices precedent. */
  const signedIn = await login(server.base, 'alice@legacy.local', LEGACY_PASSWORD);
  const read = await signedIn.client.get(`/api/workspaces/${SLUG}`);
  assert.equal(read.status, 200);
  assert.equal('sessions' in read.data.doc.data, false, 'data.sessions is absent from the served document');
  assert.equal('tfa' in read.data.doc.data, false, 'data.tfa is absent from the served document');
});

test('a client write persists a legacy document without sessions or tfa', async () => {
  /* The served document strips the retired fields (normalizeDoc); the write path
     (docFromClient) must strip independently, so the STORED row comes out clean.
     Follows the plan/invoices write-then-stored-clean precedent. */
  const signedIn = await login(server.base, 'alice@legacy.local', LEGACY_PASSWORD);
  const read = await signedIn.client.get(`/api/workspaces/${SLUG}`);
  assert.equal(read.status, 200, 'the legacy document hydrates');
  assert.equal('tfa' in read.data.doc.data, false, 'the served document is already stripped');

  const doc = structuredClone(read.data.doc);
  doc.data.sessions = [{ id: 'se1', dev: 'Stale Client · Chrome', cur: true }]; // a stale client tries to resurrect
  doc.data.tfa = { enabled: true };
  const saved = await signedIn.client.put(`/api/workspaces/${SLUG}`, { revision: read.data.revision, doc });
  assert.equal(saved.status, 200, 'the document saves');

  const stringified = withDb(server.dbPath, () => JSON.stringify(workspaceRow().doc));
  assert.equal(/"tfa"/.test(stringified), false, 'the stored doc JSON contains no tfa key');
  assert.equal(/"sessions"/.test(stringified), false, 'the stored doc JSON contains no sessions key');

  const rows = JSON.parse(workspaceRow().doc);
  assert.equal('sessions' in rows.data, false, 'the stored document has no sessions data key');
  assert.equal('tfa' in rows.data, false, 'the stored document has no tfa data key');
  assert.equal(rows.data.projects.find(p => p.id === 'p_keep')?.name, 'Surviving Project', 'the rows survive the write');
});

/* D-79 final re-proof of AUTH-02's doc-field removal: a direct-DB walk of EVERY
   workspace document (no row filter), asserting zero auth-bearing keys. The
   enumerated set mirrors the strip list in server.js normalizeDoc/docFromClient
   (D-30): `sessions` and `tfa` — no other auth-bearing keys exist in the doc. */
const AUTH_BEARING_DOC_KEYS = ['sessions', 'tfa'];

test('every workspace document in the database carries zero auth-bearing keys', () => {
  const rows = withDb(server.dbPath, db => db.prepare('select id, doc from workspaces').all());
  assert.ok(rows.length > 0, 'the fixture database has workspace rows to walk');
  for (const row of rows) {
    const parsed = JSON.parse(row.doc);
    for (const key of AUTH_BEARING_DOC_KEYS) {
      assert.equal(key in parsed.data, false, `workspace ${row.id}: data.${key} must be absent from the stored document`);
      assert.equal(key in parsed, false, `workspace ${row.id}: top-level ${key} must be absent from the stored document`);
    }
  }
});

/* Everything the migration owns, compared byte-for-byte across a reboot. */
function snapshot() {
  const row = workspaceRow();
  const invite = withDb(server.dbPath, db => db.prepare('select workspace_id from invites').get());
  const ddl = name => withDb(server.dbPath, db => db.prepare('select sql from sqlite_master where type = ? and name = ?').get(name.type, name.name)?.sql);
  return {
    backups: backups(),
    slug: row.slug,
    name: row.name,
    color: row.color,
    revision: row.revision,
    doc: row.doc,
    updatedAt: row.updated_at,
    memberIds: membershipRows().map(r => [r.user_id, r.member_id]),
    inviteWorkspaceId: invite.workspace_id,
    users: withDb(server.dbPath, db =>
      db
        .prepare('select id, email, locale, two_fa_enabled, two_fa_secret, two_fa_last_step from users order by id')
        .all()
        .map(r => ({ ...r })),
    ),
    /* Pitfall C: the byte-identity proof must cover the post-17 auth state too. */
    sessions: withDb(server.dbPath, db =>
      db
        .prepare('select token_hash, user_id, created_at, expires_at, label, ip, last_seen_at, user_agent from sessions order by token_hash')
        .all()
        .map(r => ({ ...r })),
    ),
    loginChallenges: {
      count: withDb(server.dbPath, db => db.prepare('select count(*) as n from login_challenges').get()).n,
      columns: withDb(server.dbPath, db =>
        db
          .prepare('pragma table_info(login_challenges)')
          .all()
          .map(c => ({ ...c })),
      ),
      tableDdl: ddl({ type: 'table', name: 'login_challenges' }),
      indexDdl: ddl({ type: 'index', name: 'login_challenges_expiry' }),
    },
  };
}

test('a second boot is a no-op and both accounts keep access', async () => {
  const firstBoot = snapshot();
  await server.stop();
  assert.ok(fs.existsSync(dataDir), 'the harness keeps the caller-supplied fixture directory');

  server = await startServer({ dataDir });
  const secondBoot = snapshot();
  assert.deepEqual(secondBoot, firstBoot, 'no slug/doc/member_id/revision drift');
  assert.equal(secondBoot.backups.length, 1, 'no second backup');

  const bob = await login(server.base, 'bob@legacy.local', LEGACY_PASSWORD);
  assert.equal(bob.status, 200);
  const me = await bob.client.get('/api/auth/me');
  assert.equal(me.data.user.workspaces.find(w => w.slug === SLUG)?.role, 'member');

  const read = await bob.client.get(`/api/workspaces/${SLUG}`);
  assert.equal(read.status, 200);
  assert.equal(read.data.doc.data.projects.find(p => p.id === 'p_keep')?.name, 'Surviving Project');
  assert.equal((await bob.client.get('/api/workspaces/unknown-tenant')).status, 404);
});

/* Phase 16 plan 02: the recovery_codes additive migration (D-52). The guarded
   create must land the table + index on a pre-16 database and be a byte-identical
   no-op on every boot after that (P-B). */
const sqliteHas = (type, name) =>
  withDb(server.dbPath, db => db.prepare(`select count(*) as n from sqlite_master where type = ? and name = ?`).get(type, name)).n;

test('the first boot lands recovery_codes and its index on the legacy database', () => {
  assert.equal(sqliteHas('table', 'recovery_codes'), 1, 'the recovery_codes table exists');
  assert.equal(sqliteHas('index', 'recovery_codes_user'), 1, 'the recovery_codes_user index exists');
  assert.deepEqual(
    withDb(server.dbPath, db =>
      db
        .prepare('pragma table_info(recovery_codes)')
        .all()
        .map(c => [c.name, c.type, c.notnull, c.pk]),
    ),
    [
      // SQLite reports notnull=0 for a bare `text primary key` (rowid-table quirk)
      ['id', 'TEXT', 0, 1],
      ['user_id', 'TEXT', 1, 0],
      ['code_hash', 'TEXT', 1, 0],
      ['used_at', 'INTEGER', 0, 0],
      ['created_at', 'INTEGER', 1, 0],
    ],
    'the guarded-create definition matches the SCHEMA declaration (P-B)',
  );
  assert.equal(withDb(server.dbPath, db => db.prepare('select count(*) as n from recovery_codes').get()).n, 0, 'no boot backfill (Pitfall 21)');
});

test('a second boot leaves the recovery_codes schema byte-identical (P-B)', async () => {
  const schemaSnapshot = () =>
    withDb(server.dbPath, db => ({
      table: db.prepare('select sql from sqlite_master where type = ? and name = ?').get('table', 'recovery_codes')?.sql,
      index: db.prepare('select sql from sqlite_master where type = ? and name = ?').get('index', 'recovery_codes_user')?.sql,
      columns: db
        .prepare('pragma table_info(recovery_codes)')
        .all()
        .map(c => ({ ...c })),
    }));

  const firstBoot = schemaSnapshot();
  await server.stop();
  server = await startServer({ dataDir });
  const secondBoot = schemaSnapshot();
  assert.deepEqual(secondBoot, firstBoot, 'the recovery_codes DDL is byte-identical across boots');
  assert.equal(sqliteHas('table', 'recovery_codes'), 1, 'the table survives the reboot');
});
