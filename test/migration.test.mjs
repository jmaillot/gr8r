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
      ['workspaces', 'memberships', 'invites'].map(table => [
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

/* Everything the migration owns, compared byte-for-byte across a reboot. */
function snapshot() {
  const row = workspaceRow();
  const invite = withDb(server.dbPath, db => db.prepare('select workspace_id from invites').get());
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
        .prepare('select id, email, locale from users order by id')
        .all()
        .map(r => ({ ...r })),
    ),
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
