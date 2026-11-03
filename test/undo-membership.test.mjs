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

/* UNDO-02 (D-03): a member who gained a different team between deletion and
   undo keeps it after the undo replay — the union PUT (current ∪ captured)
   lands rows {team_a, team_c}; the newer team_c row survives. */
test('UNDO-02: a newer independent team change survives the undo union replay', async () => {
  const { s, boss, putDoc, inviteMember } = await boot();
  try {
    const base = structuredClone((await boss.get('/api/workspaces/acme')).data.doc);
    base.data.teams = [
      { id: 'team_a', name: 'Alpha', members: [] },
      { id: 'team_c', name: 'Gamma', members: [] },
    ];
    await putDoc(base);

    const { row } = await inviteMember('undo2@test.local');
    const uid = row.userId;
    const wsId = (await boss.get('/api/workspaces/acme')).data.id;

    // Member starts on team_a; the delete purges it to an empty set.
    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_a'] })).status, 200);
    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: [] })).status, 200);

    // The newer independent change: the member moved to team_c meanwhile.
    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_c'] })).status, 200);

    // The undo replay: doc PUT restores team_a's definition, then the union
    // PUT (current {team_c} ∪ captured {team_a}).
    const restored = structuredClone((await boss.get('/api/workspaces/acme')).data.doc);
    restored.data.teams = [...restored.data.teams, { id: 'team_a', name: 'Alpha', members: [] }];
    await putDoc(restored);
    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_c', 'team_a'] })).status, 200);

    withDb(s.dbPath, db => assert.deepEqual(teamRows(db, wsId, uid), ['team_a', 'team_c'], 'the newer team_c row survives the undo'));
  } finally {
    await s.stop();
  }
});

/* D-04 stale-before-map corner: the server's teams PUT is a full-set replace,
   so a degenerate client replaying ONLY the captured set would clobber the
   newer team_c row — the union shape the real client sends is what keeps the
   corner safe. The pin demonstrates both sides. */
test('UNDO-02/D-04: only the union PUT shape keeps a newer row safe over the full-set replace', async () => {
  const { s, boss, inviteMember } = await boot();
  try {
    const live = (await boss.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    doc.data.teams = [
      { id: 'team_a', name: 'Alpha', members: [] },
      { id: 'team_c', name: 'Gamma', members: [] },
    ];
    assert.equal((await boss.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

    const { row } = await inviteMember('undo3@test.local');
    const uid = row.userId;
    const wsId = (await boss.get('/api/workspaces/acme')).data.id;

    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_a'] })).status, 200);
    // The newer change the stale before-map cannot know about.
    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_c'] })).status, 200);

    // The degenerate shape (captured set ONLY): full-set replace erases team_c
    // — this is exactly what the union contract exists to prevent.
    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_a'] })).status, 200);
    withDb(s.dbPath, db => assert.deepEqual(teamRows(db, wsId, uid), ['team_a'], 'a captured-only PUT would clobber the newer row'));

    // The UNION shape the client actually sends: both rows land.
    assert.equal((await boss.put(`/api/workspaces/acme/members/${uid}/teams`, { teams: ['team_c', 'team_a'] })).status, 200);
    withDb(s.dbPath, db => assert.deepEqual(teamRows(db, wsId, uid), ['team_a', 'team_c'], 'the union PUT keeps the corner safe'));
  } finally {
    await s.stop();
  }
});

/* Flagged assumption (UNDO-01 empty): a deleted team with a zero-member
   captured roster — the undo sequence performs zero teams PUTs and leaves the
   authority table clean; no error path fires. */
test('UNDO-01 empty roster: a memberless team undo restores the definition and writes zero rows', async () => {
  const { s, boss, putDoc } = await boot();
  try {
    const base = structuredClone((await boss.get('/api/workspaces/acme')).data.doc);
    base.data.teams = [{ id: 'team_e', name: 'Empty', members: [] }];
    await putDoc(base);

    // Delete: the doc PUT removes the definition; the affected list is empty,
    // so no membership PUT fires at all (zero rows to purge or restore).
    const deleted = structuredClone((await boss.get('/api/workspaces/acme')).data.doc);
    deleted.data.teams = deleted.data.teams.filter(t => t.id !== 'team_e');
    await putDoc(deleted);
    withDb(s.dbPath, db => assert.equal(db.prepare('select count(*) as n from team_members where team_id = ?').get('team_e').n, 0));

    // Undo: the doc PUT restores the definition; zero teams PUTs needed.
    const restored = structuredClone((await boss.get('/api/workspaces/acme')).data.doc);
    restored.data.teams = [...restored.data.teams, { id: 'team_e', name: 'Empty', members: [] }];
    await putDoc(restored);
    withDb(s.dbPath, db =>
      assert.equal(db.prepare('select count(*) as n from team_members where team_id = ?').get('team_e').n, 0, 'zero rows for a memberless team'),
    );
    const rostered = (await boss.get('/api/workspaces/acme')).data.doc.data.teams.some(t => t.id === 'team_e');
    assert.equal(rostered, true, 'the restored doc carries the team definition again');
  } finally {
    await s.stop();
  }
});

/* D-06 local-mode pin (source-level, mirroring the i18n-actions-modules.test.mjs
   file-scan style): the undo onAction's restore(snap) sits OUTSIDE any
   api.enabled conditional — local mode runs the plain restore and stops — and
   every setMemberTeams call in the undo path is lexically inside the
   api.enabled branch. No production-code changes here: a failure means Task 1's
   implementation regressed. */
test('D-06: the local-mode undo stays a plain restore(snap) with zero API calls', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/actions/teams.js', import.meta.url), 'utf8');

  const actionStart = src.indexOf('onAction: async () => {');
  assert.ok(actionStart > -1, 'the undo onAction closure exists');
  const body = src.slice(actionStart);

  assert.match(body, /^onAction: async \(\) => \{\s*restore\(snap\);/, 'the onAction body opens with an unguarded restore(snap)');
  const idxRestore = body.indexOf('restore(snap);');
  const idxApi = body.indexOf('api.enabled');
  assert.ok(idxRestore > -1 && idxApi > -1 && idxRestore < idxApi, 'restore(snap) runs before any api.enabled check');

  const idxGate = body.indexOf('if (!api.enabled) return;');
  const idxSet = body.indexOf('setMemberTeams', idxGate);
  assert.ok(idxGate > -1 && idxSet > -1, 'the undo path gates on api.enabled before any membership write');
  assert.ok(
    !body.slice(idxRestore, idxGate).includes('setMemberTeams'),
    'no membership write appears before the api.enabled gate',
  );
  assert.equal(
    [...body.matchAll(/setMemberTeams/g)].length,
    1,
    'the undo path performs exactly one membership-write call site',
  );
});

