/* Phase 35 honest undo (UNDO-01/UNDO-02): the delTeam toast undo must be
   honest in API mode — after restore(snap), the restored doc PUT lands
   server-side FIRST (the membership route whitelists team ids against the
   stored doc: a premature PUT 400s unknownTeam), then each affected member's
   union team set (current ∪ captured, D-03) is re-PUT through the existing
   admin membership route, re-creating the purged team_members authority rows
   without erasing newer independent changes (D-04).

   Every test boots its own server instance — the invite-accept throttle is
   five per IP per hour and each test spends exactly one accept. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'member-password-1';
const ACCOUNT = (name, email) => ({ name, email, password: PASSWORD });

const teamRows = (db, wsId, userId) =>
  db
    .prepare('select team_id from team_members where workspace_id = ? and user_id = ? order by team_id')
    .all(wsId, userId)
    .map(r => r.team_id);

/* One fresh server + admin client + one invited member; the caller gets the
   pieces it needs. The shared doc PUT helper always fetches a fresh revision. */
async function boot() {
  const s = await startServer();
  const boss = (await login(s.base, ADMIN.email, ADMIN.password)).client;
  const putDoc = async doc => {
    const live = (await boss.get('/api/workspaces/acme')).data;
    const res = await boss.put('/api/workspaces/acme', { revision: live.revision, doc });
    assert.equal(res.status, 200, 'the doc PUT is accepted');
    return res;
  };
  const inviteMember = async email => {
    const [inv] = (await boss.post('/api/workspaces/acme/invites', { emails: [email], role: 'member' })).data.invites;
    const account = (await signup(s.base, ACCOUNT('Undo', email))).client;
    assert.ok([200, 201].includes((await account.post(`/api/invites/${inv.url.split('/').pop()}/accept`)).status));
    const row = (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === email);
    assert.ok(row, 'the member joined the roster');
    return { account, row };
  };
  return { s, boss, putDoc, inviteMember };
}

/* UNDO-01 (tracer pin): the exact HTTP sequence the undo onAction performs —
   doc PUT restoring the team definition FIRST (awaited), THEN the union teams
   PUT — re-creates the purged authority rows. The negative variant pins WHY
   the sequencing matters: the same membership PUT with the definition absent
   from the stored doc is refused 400 unknownTeam. */
test('UNDO-01: the undo sequence (doc PUT awaited, then union PUT) re-creates purged team_members rows', async () => {
  const { s, boss, putDoc, inviteMember } = await boot();
  try {
    // Doc defines team_a + team_b (definitions stay in the doc, Phase 28 D-02).
    const base = structuredClone((await boss.get('/api/workspaces/acme')).data.doc);
    base.data.teams = [
      { id: 'team_a', name: 'Alpha', members: [] },
      { id: 'team_b', name: 'Beta', members: [] },
    ];
    await putDoc(base);

    const { row } = await inviteMember('undo1@test.local');
    const uid = row.userId;

    // The member sits on team_a (plus team_b, so the union shape is exercised).
    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_b', 'team_a'] })).status, 200);
    const wsId = (await boss.get('/api/workspaces/acme')).data.id;
    withDb(s.dbPath, db => assert.deepEqual(teamRows(db, wsId, uid), ['team_a', 'team_b'], 'baseline rows landed'));

    // delTeam replay: purge the authority rows (team_a filtered out)...
    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_b'] })).status, 200);
    withDb(s.dbPath, db => assert.deepEqual(teamRows(db, wsId, uid), ['team_b'], 'the purge removed team_a'));
    // ...then remove the team definition from the doc (the doc mutation).
    const deleted = structuredClone((await boss.get('/api/workspaces/acme')).data.doc);
    deleted.data.teams = deleted.data.teams.filter(t => t.id !== 'team_a');
    await putDoc(deleted);

    // NEGATIVE sequencing proof: the union PUT while team_a is absent from
    // the stored doc must 400 unknownTeam — the doc push cannot be skipped.
    const premature = await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_b', 'team_a'] });
    assert.equal(premature.status, 400);
    assert.match(String(premature.data?.code || premature.data?.error), /unknownTeam/i, 'a premature authority PUT is whitelisted out');

    // THE UNDO SEQUENCE, in onAction order: doc PUT restoring the definition
    // FIRST (awaited to 200), THEN the union teams PUT (current ∪ captured).
    const restored = structuredClone((await boss.get('/api/workspaces/acme')).data.doc);
    restored.data.teams = [...restored.data.teams.filter(t => t.id !== 'team_a'), { id: 'team_a', name: 'Alpha', members: [] }];
    await putDoc(restored);
    const undoPut = await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_b', 'team_a'] });
    assert.equal(undoPut.status, 200, 'the union PUT lands after the awaited doc push');

    withDb(s.dbPath, db => assert.deepEqual(teamRows(db, wsId, uid), ['team_a', 'team_b'], 'the purged rows are re-created'));
    const rostered = (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.userId === uid);
    assert.deepEqual(rostered.teams, ['team_a', 'team_b'], 'the roster projection reflects the restored team');
  } finally {
    await s.stop();
  }
});
