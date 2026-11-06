/* Phase 44 plan 02 — tz save-path regression suite (D-09/D-10, Pitfall 1 pin).
   Real server, real SQLite. Proves the self-tz-only carve-out in docFromClient:
   a member-role client's OWN tz persists through the doc PUT, nothing else they
   send ever lands (no cross-member tz, no role/name mutation), hostile/empty/
   legacy values funnel through resolveTz, and the admin pinned-field block is
   unchanged. One shared admin account for the whole file (signup is throttled
   to 5/hour/IP — members join through the invite flow, not signup). */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, client, inviteToken, startServer, withDb } from './helpers/server.mjs';

const GOOD = 'password-1234';

let server;
let admin;
let alice;
let bob;

/* Read the current served doc + revision for a client. */
const read = c => c.get('/api/workspaces/acme').then(r => {
  assert.equal(r.status, 200, `GET /api/workspaces/acme for ${c.name}`);
  return { revision: r.data.revision, doc: r.data.doc };
});

/* PUT a mutated doc snapshot like the settings page does (docSnapshot shape:
   the served doc goes back as `doc` next to the revision). */
const put = (c, snap, mutate) => {
  const doc = structuredClone(snap.doc);
  mutate(doc);
  return c.put('/api/workspaces/acme', { revision: snap.revision, doc });
};

/* The stored doc's members array, read straight from SQLite. */
const storedMembers = () =>
  withDb(server.dbPath, db => JSON.parse(db.prepare('select doc from workspaces where slug = ?').get('acme').doc).data.members);

const byEmail = (members, email) => members.find(m => (m.email || '').toLowerCase() === email);

async function joinMember(email, name, pool) {
  const inv = await admin.post('/api/workspaces/acme/invites', { emails: [email], role: 'Member' });
  assert.equal(inv.status, 201, `invite ${email}`);
  const accepted = await client(server.base, name).post(
    `/api/invites/${encodeURIComponent(inviteToken(inv.data.invites[0].url))}/accept`,
    { name, email, password: GOOD },
  );
  assert.equal(accepted.status, 201, `accept ${email}`);
  const c = client(server.base, email);
  assert.equal((await c.post('/api/auth/login', { email, password: GOOD })).status, 200, `login ${email}`);
  pool.push(c);
  return c;
}

before(async () => {
  server = await startServer();
  admin = client(server.base, 'admin');
  assert.equal((await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200, 'admin login');

  const joined = [];
  alice = await joinMember('alice-tz@test.local', 'Alice', joined);
  bob = await joinMember('bob-tz@test.local', 'Bob', joined);

  /* Joined members reach the STORED doc only through backfillMemberships at
     boot; within a live server the roster is repaired on read. Seed the stored
     roster directly (memberProfile shape — the same fields ensureMember would
     write) so the member-role replacement path carries real profiles for the
     carve-out to touch. */
  withDb(server.dbPath, db => {
    const ws = db.prepare('select * from workspaces where slug = ?').get('acme');
    const doc = JSON.parse(ws.doc);
    const rows = db
      .prepare(
        `select m.member_id, m.user_id, m.role, u.name, u.email
           from memberships m join users u on u.id = m.user_id
          where m.workspace_id = ? order by m.rowid`,
      )
      .all(ws.id);
    const label = { owner: 'Owner', admin: 'Admin', member: 'Member' };
    doc.data.members = rows.map((r, i) => ({
      id: r.member_id,
      userId: r.user_id,
      name: r.name,
      email: r.email,
      role: label[r.role] || 'Member',
      teams: [],
      title: '',
      c: ['#5A67D8', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5F6'][i % 6],
      status: 'active',
      last: 0,
      tz: '',
    }));
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id);
  });
  const roster = storedMembers();
  assert.ok(byEmail(roster, 'alice-tz@test.local'), 'alice is on the stored roster');
  assert.ok(byEmail(roster, 'bob-tz@test.local'), 'bob is on the stored roster');
});

after(async () => server.stop());

test('member-role client saves their OWN tz and it persists (Pitfall 1: the disconnected flow)', async () => {
  const snap = await read(alice);
  const res = await put(alice, snap, doc => {
    byEmail(doc.data.members, 'alice-tz@test.local').tz = 'Asia/Tokyo';
  });
  assert.equal(res.status, 200, 'member doc PUT accepted');
  const after = await read(alice);
  assert.equal(byEmail(after.doc.data.members, 'alice-tz@test.local').tz, 'Asia/Tokyo', 'own tz persisted through re-GET');
  assert.equal(byEmail(storedMembers(), 'alice-tz@test.local').tz, 'Asia/Tokyo', 'own tz persisted in the stored doc');
});

test('member-role client can never write ANOTHER member\'s tz (self-only carve-out)', async () => {
  const snap = await read(alice);
  const res = await put(alice, snap, doc => {
    byEmail(doc.data.members, 'bob-tz@test.local').tz = 'America/Sao_Paulo';
    byEmail(doc.data.members, 'alice-tz@test.local').tz = 'Europe/Madrid';
  });
  assert.equal(res.status, 200);
  const after = await read(alice);
  assert.equal(byEmail(after.doc.data.members, 'bob-tz@test.local').tz, '', 'bob tz untouched (still seeded empty)');
  assert.equal(byEmail(after.doc.data.members, 'alice-tz@test.local').tz, 'Europe/Madrid', 'own tz still applies');
});

test('carve-out is single-field: role/name mutations in the same member object never land', async () => {
  const snap = await read(alice);
  const res = await put(alice, snap, doc => {
    const me = byEmail(doc.data.members, 'alice-tz@test.local');
    me.tz = 'Asia/Tokyo';
    me.role = 'Admin';
    me.name = 'Hacked';
    me.status = 'suspended';
  });
  assert.equal(res.status, 200);
  const after = await read(alice);
  const me = byEmail(after.doc.data.members, 'alice-tz@test.local');
  assert.equal(me.tz, 'Asia/Tokyo', 'tz is the one field that lands');
  assert.equal(me.role, 'Member', 'role unchanged');
  assert.equal(me.name, 'Alice', 'name unchanged');
  assert.equal(me.status, 'active', 'status unchanged');
});

test('hostile tz submit coerces to Europe/Paris at save time (D-10, T-44-04)', async () => {
  const snap = await read(alice);
  const res = await put(alice, snap, doc => {
    byEmail(doc.data.members, 'alice-tz@test.local').tz = '<script>alert(1)</script>';
  });
  assert.equal(res.status, 200);
  assert.equal(byEmail(storedMembers(), 'alice-tz@test.local').tz, 'Europe/Paris', 'hostile string never stored raw');
});

test('empty tz submit stores \'\' (D-07: resolves to Europe/Paris on read)', async () => {
  const snap = await read(alice);
  const res = await put(alice, snap, doc => {
    byEmail(doc.data.members, 'alice-tz@test.local').tz = '';
  });
  assert.equal(res.status, 200);
  assert.equal(byEmail(storedMembers(), 'alice-tz@test.local').tz, '', 'empty submit stored verbatim, not Paris');
});

test('legacy label submit stores the mapped IANA zone through the funnel (D-05)', async () => {
  const snap = await read(alice);
  const res = await put(alice, snap, doc => {
    byEmail(doc.data.members, 'alice-tz@test.local').tz = '(GMT+01:00) Berlin';
  });
  assert.equal(res.status, 200);
  assert.equal(byEmail(storedMembers(), 'alice-tz@test.local').tz, 'Europe/Berlin', 'legacy label mapped at save');
});

test('admin PUT keeps the pinned-field block intact (id/userId/email/role/status)', async () => {
  const snap = await read(admin);
  const res = await put(admin, snap, doc => {
    const me = byEmail(doc.data.members, 'bob-tz@test.local');
    me.role = 'Admin';
    me.email = 'hijacked@test.local';
    me.status = 'suspended';
    me.tz = 'Asia/Tokyo';
  });
  assert.equal(res.status, 200);
  const after = await read(admin);
  const storedBob = byEmail(storedMembers(), 'bob-tz@test.local');
  assert.equal(storedBob.role, 'Member', 'admin cannot rename a role through the doc (pinned to membership)');
  assert.equal(storedBob.email, 'bob-tz@test.local', 'email pinned');
  assert.equal(storedBob.status, 'active', 'status pinned');
  assert.equal(storedBob.tz, 'Asia/Tokyo', 'tz write still flows for the admin path');
});
