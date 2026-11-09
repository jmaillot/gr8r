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
describe('VIS-04 — the per-project guest-invite toggle', () => {
  test('new projects default the toggle OFF', async () => {
    const get = await owner.get(`/api/workspaces/${VIS_WS.slug}`);
    const revision = get.data.revision;
    const doc = JSON.parse(JSON.stringify(get.data.doc));
    doc.data.projects.push({ id: 'p_fresh', key: 'fresh', name: 'Fresh', private: true, members: ['m_owner'], lead: 'm_owner', teams: [], status: 'active', perms: {} });
    const put = await owner.put(`/api/workspaces/${VIS_WS.slug}`, { revision, doc });
    assert.equal(put.status, 200, 'the owner creates a private project via the doc PUT');
    assert.equal(project('p_fresh').allowInviteGuests, undefined, 'the creation path never writes the toggle true');

    const refused = await inviteRefusal(member, { role: 'viewer', project: 'p_fresh' });
    assert.equal(refused.status, 403);
    assert.equal(refused.code, 'inviteGuestToggleOff', 'absent toggle = OFF (deny-by-default)');
  });

  test('a member guest invite needs viewer role + a real project + the toggle ON (distinct key per cause)', async () => {
    /* [2026-11-09 53-02] The shared guest validator (T-53-05) now runs before
       the member-tier branching, so a guest with no project carries the
       guest-invariant key; the unknown-project cause keeps the member key. */
    const noProject = await inviteRefusal(member, { role: 'viewer' });
    assert.equal(noProject.status, 400);
    assert.equal(noProject.code, 'inviteGuestProjectRequired');

    const unknownProject = await inviteRefusal(member, { role: 'viewer', project: 'p_nonexistent' });
    assert.equal(unknownProject.status, 400);
    assert.equal(unknownProject.code, 'inviteMemberProjectRequired');

    const toggleOff = await inviteRefusal(member, { role: 'viewer', project: 'p_hidden' });
    assert.equal(toggleOff.status, 403);
    assert.equal(toggleOff.code, 'inviteGuestToggleOff');

    const aboveViewer = await inviteRefusal(member, { role: 'member', project: 'p_membershare' });
    assert.equal(aboveViewer.status, 403);
    assert.equal(aboveViewer.code, 'inviteMemberRoleCeiling');

    const withTeams = await inviteRefusal(member, { role: 'viewer', project: 'p_membershare', teams: ['engA'] });
    assert.equal(withTeams.status, 403);
    assert.equal(withTeams.code, 'inviteTeamsAdminOnly', 'team invites are a trusted admin/owner act (D-50-9)');

    const ok = await member.post(`/api/workspaces/${VIS_WS.slug}/invites`, { role: 'guest', project: 'p_membershare' });
    assert.equal(ok.status, 201, 'the guest role normalizes to viewer and passes');
    const inv = ok.data.invites[0];
    assert.equal(inv.role, 'viewer');
    assert.equal(inv.project, 'p_membershare', 'the invite carries its project');
    const raw = withDb(server.dbPath, db =>
      db.prepare('select role, project from invites where token_hash = ?').get(createHash('sha256').update(inviteToken(inv.url)).digest('hex')),
    );
    assert.equal(raw.role, 'viewer');
    assert.equal(raw.project, 'p_membershare', 'invites.project is persisted');
  });

  test('admin invites bypass the toggle entirely (D-50-9) — but not the guest invariant (T-53-05)', async () => {
    /* [2026-11-09 53-02] A guest with zero projects is refused regardless of
       the inviter tier; the toggle bypass still holds once the one-project
       invariant is satisfied (p_hidden has the toggle OFF). */
    const linkOnly = await admin.post(`/api/workspaces/${VIS_WS.slug}/invites`, { emails: ['direct@visfix.local'], role: 'viewer' });
    assert.equal(linkOnly.status, 400, 'a zero-project guest invite is refused on the admin path too');
    assert.equal(linkOnly.data.code, 'inviteGuestProjectRequired');
    const onOff = await admin.post(`/api/workspaces/${VIS_WS.slug}/invites`, { emails: ['direct2@visfix.local'], role: 'viewer', project: 'p_hidden' });
    assert.equal(onOff.status, 201, 'an admin guest invite succeeds even with the toggle OFF');
    assert.equal(onOff.data.invites[0].project, 'p_hidden', 'the admin invite carries its project');
  });

  test('toggle flip: member refused, admin/owner allowed, stored on the doc', async () => {
    const flipUrl = `/api/workspaces/${VIS_WS.slug}/projects/p_membershare`;
    const asMember = await member.patch(flipUrl, { allowInviteGuests: true });
    assert.equal(asMember.status, 403);
    assert.equal(asMember.data.code, 'adminOnly', 'even the project lead cannot flip it — the gate is workspace rank');

    const badBody = await admin.patch(flipUrl, {});
    assert.equal(badBody.status, 400);
    assert.equal(badBody.data.code, 'allowInviteGuestsRequired');

    const off = await admin.patch(flipUrl, { allowInviteGuests: false });
    assert.equal(off.status, 200);
    assert.equal(project('p_membershare').allowInviteGuests, false, 'the flip is stored on the doc');
    const on = await owner.patch(flipUrl, { allowInviteGuests: true });
    assert.equal(on.status, 200);
    assert.equal(project('p_membershare').allowInviteGuests, true);

    const missing = await admin.patch(`/api/workspaces/${VIS_WS.slug}/projects/p_nonexistent`, { allowInviteGuests: true });
    assert.equal(missing.status, 404);
    assert.equal(missing.data.code, 'projectNotFound');
  });

  test('a stale member guest invite fails closed at accept (D-50-8)', async () => {
    const [row] = (await member.post(`/api/workspaces/${VIS_WS.slug}/invites`, { emails: ['stale@visfix.local'], role: 'viewer', project: 'p_membershare' })).data.invites;
    assert.equal(row.project, 'p_membershare');
    const token = inviteToken(row.url);

    await owner.patch(`/api/workspaces/${VIS_WS.slug}/projects/p_membershare`, { allowInviteGuests: false });
    const refused = await client(server.base, 'stale-anon').post(`/api/invites/${token}/accept`, {
      name: 'Stale Guest',
      email: 'stale@visfix.local',
      password: PASSWORD,
    });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'inviteGuestToggleOff', 'the accept re-derives the toggle from the CURRENT doc');
    const pending = withDb(server.dbPath, db => db.prepare('select used_at from invites where token_hash = ?').get(withDb(server.dbPath, db => db.prepare("select token_hash from invites where email = 'stale@visfix.local'").get().token_hash)));
    assert.equal(pending.used_at, null, 'the refusal does not consume the invite');

    await owner.patch(`/api/workspaces/${VIS_WS.slug}/projects/p_membershare`, { allowInviteGuests: true });
    const accepted = await client(server.base, 'stale-anon').post(`/api/invites/${token}/accept`, {
      name: 'Stale Guest',
      email: 'stale@visfix.local',
      password: PASSWORD,
    });
    assert.equal(accepted.status, 201, 'with the toggle back ON the same invite accepts');
  });

  test('a flip to OFF never touches guests already on the access list', async () => {
    await owner.patch(`/api/workspaces/${VIS_WS.slug}/projects/p_membershare`, { allowInviteGuests: false });
    const stale = await login(server.base, 'stale@visfix.local', PASSWORD);
    assert.equal(stale.status, 200);
    const res = await stale.client.get(`/api/workspaces/${VIS_WS.slug}`);
    const ids = (res.data?.doc?.data?.projects || []).map(p => p.id);
    assert.ok(ids.includes('p_membershare'), 'the accepted guest keeps access after the flip');
    const guestRes = await guest.get(`/api/workspaces/${VIS_WS.slug}`);
    assert.ok((guestRes.data?.doc?.data?.projects || []).map(p => p.id).includes('p_membershare'), 'the pre-existing guest keeps access too');
    /* leave the fixture toggle ON for the hierarchy cells that read it */
    await owner.patch(`/api/workspaces/${VIS_WS.slug}/projects/p_membershare`, { allowInviteGuests: true });
  });

  test('an existing workspace member accepting a project-scoped guest invite lands on the access list (WR-01, 50-05)', async () => {
    /* m_scoped is already a workspace member (memberships row, role member)
       and is NOT on p_membershare's access list. m_plain (member tier, toggle
       ON) mints a link-only viewer invite scoped to p_membershare. */
    const before = (await member.get(`/api/workspaces/${VIS_WS.slug}`)).data;
    assert.equal(before.revision >= 1, true);

    const ok = await member.post(`/api/workspaces/${VIS_WS.slug}/invites`, { role: 'viewer', project: 'p_membershare' });
    assert.equal(ok.status, 201);
    const token = inviteToken(ok.data.invites[0].url);

    const scoped = await login(server.base, 'scoped@visfix.local', VIS_PASSWORD);
    assert.equal(scoped.status, 200, 'the existing member signs in');
    const accepted = await scoped.client.post(`/api/invites/${token}/accept`, {
      name: 'Sam Scoped',
      email: 'scoped@visfix.local',
      password: VIS_PASSWORD,
    });
    assert.equal(accepted.status, 200, 'an existing member accepts via their session');

    /* The hoisted grant: m_scoped's member_id is on p.members... */
    const entry = project('p_membershare').members.includes('m_scoped');
    assert.equal(entry, true, 'p_membershare access list now contains the existing member');

    /* ...and the grant is live on the very next request. */
    const res = await scoped.client.get(`/api/workspaces/${VIS_WS.slug}`);
    assert.equal(res.status, 200);
    assert.ok(
      (res.data?.doc?.data?.projects || []).map(p => p.id).includes('p_membershare'),
      'the project is readable on the next request',
    );

    /* No role clobber: the pre-existing membership row keeps its role, and
       ensureMember was never called for the already-member acceptor. */
    const role = withDb(server.dbPath, db =>
      db.prepare('select role from memberships where workspace_id = ? and user_id = ?').get(VIS_WS.id, 'u_scoped'),
    );
    assert.equal(role.role, 'member', 'the existing workspace role is not rewritten by the accept');
    assert.equal(project('p_membershare').members.includes('m_plain'), true, 'pre-existing entries untouched');
  });
});
