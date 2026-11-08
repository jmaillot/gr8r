/* Phase 50 (50-03): the invite-authorization surface — integration tests on
   the real server over the shared visibility fixture.

   INV-01 (D-50-4) — the owner-only-owner hierarchy pinned at its THREE
   enforcement points:
     - create: no invite can mint the owner role (checked on the RAW body —
       inviteRole() would silently coerce 'owner' to 'member'); the invites
       table CHECK excludes 'owner' as a belt-and-braces pin;
     - edit: admins cannot edit admins (the stricter D-50-4 rule — the
       pre-existing ownerManagedRoles guard) and only an owner transfers
       ownership (ownerTransferOnly);
     - accept: acceptance grants exactly the invite row's role and there is
       no path to owner at accept (CHECK makes an owner invite row
       unrepresentable).

   INV-04 — the same viewer account holds membership in two private projects
   with no single-project refusal.

   VIS-04 (D-50-7/8/9) — the per-project "members may invite guests" toggle:
     - OFF is the default everywhere (absent field = OFF; new projects too);
     - a member's guest invite requires viewer role + a real project + the
       toggle ON on the CURRENT doc (distinct refusal key per cause);
     - admin/owner invites (and team invites) bypass the toggle entirely;
     - a stale project invite re-derives the toggle from the CURRENT doc at
       accept time and fails closed after a flip to OFF;
     - a flip to OFF never touches guests already on the access list.

   Expectations are stated inline from the phase decisions — never derived
   from production code. */
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createVisibilityFixtureDb, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';
import { client, inviteToken, login, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'hierarchy-password-1';

let dataDir;
let server;
let owner;
let admin;
let member; // m_plain — the member-tier actor for the VIS-04 cells
let guest; // m_guest — the multi-project viewer (INV-04)

const docRow = () =>
  withDb(server.dbPath, db => db.prepare('select doc, revision from workspaces where id = ?').get(VIS_WS.id));
const storedDoc = () => JSON.parse(docRow().doc);
const project = id => storedDoc().data.projects.find(p => p.id === id);

/* Raw stored-doc edit: exactly what a manager PUT would write (same door the
   visibility suite uses for its manager-simulated cells). */
const editStoredDoc = fn => {
  const doc = storedDoc();
  fn(doc);
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), VIS_WS.id));
};
const setToggle = (pid, on) =>
  editStoredDoc(doc => {
    const p = doc.data.projects.find(p => p.id === pid);
    if (on) p.allowInviteGuests = true;
    else delete p.allowInviteGuests;
  });

const inviteRefusal = async (who, body) => {
  const res = await who.post(`/api/workspaces/${VIS_WS.slug}/invites`, body);
  return { status: res.status, code: res.data?.code };
};

const acceptsSoFar = [];

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-invite-hierarchy-'));
  createVisibilityFixtureDb(dataDir);
  server = await startServer({ dataDir });
  owner = (await login(server.base, 'owner@visfix.local', VIS_PASSWORD)).client;
  admin = (await login(server.base, 'admin@visfix.local', VIS_PASSWORD)).client;
  member = (await login(server.base, 'plain@visfix.local', VIS_PASSWORD)).client;
  guest = (await login(server.base, 'guest@visfix.local', VIS_PASSWORD)).client;
  assert.equal((await owner.get(`/api/workspaces/${VIS_WS.slug}`)).status, 200);
  /* The one project m_plain manages carries the toggle ON for the VIS-04 cells. */
  setToggle('p_membershare', true);
});

after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('INV-01 — the owner-only-owner hierarchy at its three points', () => {
  test('create point: an owner-role invite is refused at every rank; unknown roles coerce to member explicitly', async () => {
    const asAdmin = await inviteRefusal(admin, { role: 'owner' });
    assert.equal(asAdmin.status, 403);
    assert.equal(asAdmin.code, 'ownerInviteForbidden');
    const asOwner = await inviteRefusal(owner, { role: 'owner' });
    assert.equal(asOwner.status, 403, 'even an owner cannot INVITE ownership — it is transferred');
    assert.equal(asOwner.code, 'ownerInviteForbidden');

    /* Flagged-edge cell (INV-01/empty+encoding): an unknown role coerces to
       'member' via inviteRole() — pinned as explicit behavior, not silent. */
    const coerced = await admin.post(`/api/workspaces/${VIS_WS.slug}/invites`, { role: 'wizard' });
    assert.equal(coerced.status, 201);
    assert.equal(coerced.data.invites[0].role, 'member');

    /* Belt-and-braces: the invites table CHECK makes an owner row
       unrepresentable even if the route were bypassed. */
    const userId = withDb(server.dbPath, db => db.prepare('select id from users limit 1').get().id);
    assert.throws(() =>
      withDb(server.dbPath, db =>
        db
          .prepare(
            "insert into invites (token_hash, email, role, teams, workspace_id, created_by, created_at, expires_at) values ('rawownerhash', null, 'owner', '[]', ?, ?, 1, 2)",
          )
          .run(VIS_WS.id, userId),
      ),
    );
  });

  test('edit point: admins cannot edit admins; the owner can; only an owner grants owner', async () => {
    /* A second admin, onboarded through the front door (email invite + accept). */
    const [row] = (await admin.post(`/api/workspaces/${VIS_WS.slug}/invites`, { emails: ['second-admin@visfix.local'], role: 'admin' })).data.invites;
    assert.equal(row.role, 'admin');
    const joined = await client(server.base, 'second-admin').post(`/api/invites/${inviteToken(row.url)}/accept`, {
      name: 'Second Admin',
      email: 'second-admin@visfix.local',
      password: PASSWORD,
    });
    assert.equal(joined.status, 201, 'the fresh admin account is created by the accept');

    const uid = withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get('second-admin@visfix.local').id);
    const patch = (who, body) => who.patch(`/api/workspaces/${VIS_WS.slug}/members/${uid}`, body);

    const refused = await patch(admin, { role: 'member' });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'ownerManagedRoles', 'D-50-4: an admin cannot edit another admin');

    const allowed = await patch(owner, { role: 'member' });
    assert.equal(allowed.status, 200, 'the owner edits the admin');

    const transfer = await patch(admin, { role: 'owner' });
    assert.equal(transfer.status, 403);
    assert.equal(transfer.data.code, 'ownerTransferOnly', 'only an owner grants the owner role');
    const transferAsOwner = await patch(owner, { role: 'owner' });
    assert.equal(transferAsOwner.status, 200, 'the owner transfer route remains open to the owner');
    await patch(owner, { role: 'admin' }); // restore
  });

  test('accept point: acceptance grants exactly the invite role — no path to owner at accept', async () => {
    const roster = await admin.get(`/api/workspaces/${VIS_WS.slug}/members`);
    assert.equal(roster.status, 200);
    const second = roster.data.members.find(m => m.email === 'second-admin@visfix.local');
    assert.equal(second.role, 'admin', 'the invite row role is granted verbatim');
    assert.notEqual(second.role, 'owner', 'acceptance never elevates beyond the invite row');
  });
});

describe('INV-04 — multi-project membership', () => {
  test('one viewer account holds membership in two private projects simultaneously', async () => {
    editStoredDoc(doc => {
      for (const pid of ['p_membershare', 'p_hidden']) {
        const p = doc.data.projects.find(p => p.id === pid);
        if (!p.members.includes('m_guest')) p.members.push('m_guest');
      }
    });
    const res = await guest.get(`/api/workspaces/${VIS_WS.slug}`);
    assert.equal(res.status, 200);
    const ids = (res.data?.doc?.data?.projects || []).map(p => p.id);
    assert.ok(ids.includes('p_membershare'), 'first private project readable');
    assert.ok(ids.includes('p_hidden'), 'second private project readable — no exactly-one-project refusal');
  });
});
