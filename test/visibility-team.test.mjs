/* Phase 50 (50-01, D-50-5 / INV-03): the LIVE team link as the third term of
   the single visibility predicate — end-to-end integration tests on the real
   server. Pins:
     1. join  → grant: a user whose team_members row links them to a team in
        p.teams reads a private project they are NOT individually listed on;
     2. leave → revoke: deleting the team_members row makes the very next
        request a byte-identical 404 (no-existence-oracle: the not-found error
        equals the error for a project the caller never could see) — unless
        they are individually in p.members (the unless-clause cell);
     3. individual membership restores access with NO team link;
     4. second-boot no-churn: the workspace doc bytes are identical across a
        reboot — normalizeProjects never re-adds teams:[], no sweep exists to
        delete p.teams (sweep retired);
     5. stale client doc PUT: a non-manager member cannot delete p.teams or
        flip p.allowInviteGuests on a project they cannot manage
        (mergeClientDoc pinning, T-50-01).

   The fixture DB is shared with the Phase 49/50 matrix harnesses; expectations
   here are stated inline (never read from production code). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createVisibilityFixtureDb, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';

let dataDir;
let server;
let teamSession; // m_team's session (login + client)
let teamKey;
let teamRpcId = 0;
let teamMcpSession;

const docRow = () =>
  withDb(server.dbPath, db => db.prepare('select doc, revision from workspaces where id = ?').get(VIS_WS.id));
const storedDoc = () => JSON.parse(docRow().doc);
const project = id => storedDoc().data.projects.find(p => p.id === id);

async function docGet(session) {
  const res = await session.client.get(`/api/workspaces/${VIS_WS.slug}`);
  return { status: res.status, ids: (res.data?.doc?.data?.projects || []).map(p => p.id).sort() };
}

/* Minimal MCP JSON-RPC helpers (same wire shape as test/mcp.test.mjs). */
const mcpPost = (body, headers = {}) =>
  fetch(`${server.base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${teamKey}`,
      ...(teamMcpSession ? { 'mcp-session-id': teamMcpSession } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });

async function teamRpc(method, params) {
  const res = await mcpPost({ jsonrpc: '2.0', id: ++teamRpcId, method, params });
  assert.equal(res.status, 200);
  const type = res.headers.get('content-type') || '';
  const id = teamRpcId;
  let data;
  if (type.includes('text/event-stream')) {
    const raw = await res.text();
    data = raw
      .split('\n')
      .filter(l => l.startsWith('data:'))
      .map(l => JSON.parse(l.slice(5).trim()))
      .find(m => m.id === id);
  } else {
    data = await res.json();
  }
  const out = data?.result;
  const text = out?.content?.[0]?.text;
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { isError: !!out?.isError, data: parsed, text };
}

async function teamGetProject(ref) {
  return teamRpc('tools/call', { name: 'get_project', arguments: { project: ref } });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-visibility-team-'));
  createVisibilityFixtureDb(dataDir);
  server = await startServer({ dataDir });
  teamSession = await login(server.base, 'team@visfix.local', VIS_PASSWORD);
  assert.equal(teamSession.status, 200, 'm_team signs in');
  const keyRes = await teamSession.client.post('/api/keys', { label: 'team-link', scope: 'read', workspaceId: VIS_WS.id, days: 90 });
  assert.equal(keyRes.status, 201, 'm_team creates a read key');
  teamKey = keyRes.data.key;
  const init = await mcpPost({ jsonrpc: '2.0', id: ++teamRpcId, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'team-link-test', version: '0.0.0' } } });
  assert.equal(init.status, 200);
  teamMcpSession = init.headers.get('mcp-session-id');
  await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' });
});

after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('team join grants live access to a team-linked private project (D-50-5)', async () => {
  /* m_team is NOT in p_teamshare.members — the engA team_members row is the
     only grant. Doc-GET door: */
  const viaDoc = await docGet(teamSession);
  assert.equal(viaDoc.status, 200);
  assert.ok(viaDoc.ids.includes('p_teamshare'), 'the team-linked private project is served');
  assert.ok(viaDoc.ids.includes('p_teamboth'), 'team-linked AND individually listed: served');
  /* MCP mirror door (same-commit parity): */
  const hit = await teamGetProject('p_teamshare');
  assert.equal(hit.isError, false, 'mirror get_project succeeds via the live team link');
  assert.equal(hit.data?.id, 'p_teamshare');
});

test('leaving the team revokes on the very next request — byte-identical 404, unless individually listed', async () => {
  withDb(server.dbPath, db =>
    db.prepare('delete from team_members where workspace_id = ? and team_id = ? and user_id = ?').run(VIS_WS.id, 'engA', 'u_team'),
  );
  /* No caching: the VERY next read already sees the revocation. */
  const viaDoc = await docGet(teamSession);
  assert.ok(!viaDoc.ids.includes('p_teamshare'), 'the live team grant is revoked immediately');
  assert.ok(!viaDoc.ids.includes('p_publicgain') === false, 'public projects are unaffected');
  /* Byte-identical no-existence-oracle: the revoked project's not-found error
     is identical to the error for a project the caller never could see (the
     only difference is the requested id echoed back). */
  const revoked = await teamGetProject('p_teamshare');
  const neverHad = await teamGetProject('p_hidden');
  assert.equal(revoked.isError, true, 'mirror get_project 404s after the leave');
  assert.equal(revoked.text.replace('p_teamshare', '§'), neverHad.text.replace('p_hidden', '§'), 'byte-identical not-found (no existence oracle)');
  /* The unless-clause: p_teamboth carries m_team in p.members individually. */
  const stillListed = await teamGetProject('p_teamboth');
  assert.equal(stillListed.isError, false, 'individual p.members entry survives the team leave');
  assert.ok(viaDoc.ids.includes('p_teamboth'), 'the individually-listed project stays served');
});

test('individual membership restores access with NO team link', async () => {
  /* Re-add m_team to p_teamshare.members individually (the manager's door —
     simulated here with a raw stored-doc edit, exactly what a manager PUT
     would write). team_members still has NO engA row for u_team. */
  const doc = storedDoc();
  const p = doc.data.projects.find(p => p.id === 'p_teamshare');
  if (!p.members.includes('m_team')) p.members.push('m_team');
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), VIS_WS.id));
  const hit = await teamGetProject('p_teamshare');
  assert.equal(hit.isError, false, 'access restored via the individual entry');
  const viaDoc = await docGet(teamSession);
  assert.ok(viaDoc.ids.includes('p_teamshare'), 'doc-GET door agrees');
});

test('second boot is a byte-identical no-op with p.teams intact (no sweep, no teams:[] re-add)', async () => {
  const firstBoot = docRow();
  await server.stop();
  server = await startServer({ dataDir });
  const secondBoot = docRow();
  assert.deepEqual(secondBoot, firstBoot, 'workspace doc bytes identical across reboot');
  assert.deepEqual(project('p_teamshare').teams, ['engA'], 'p.teams survived the reboot');
  assert.deepEqual(project('p_teamboth').teams, ['engA'], 'p_teamboth keeps its team link too');
  /* New port → fresh session (the API key persists in the database). */
  teamSession = await login(server.base, 'team@visfix.local', VIS_PASSWORD);
  assert.equal(teamSession.status, 200);
  const viaDoc = await docGet(teamSession);
  assert.ok(viaDoc.ids.includes('p_teamshare'), 'the individual grant still serves after reboot');
});

test('stale client doc PUT cannot delete p.teams or flip p.allowInviteGuests (T-50-01)', async () => {
  const get = await teamSession.client.get(`/api/workspaces/${VIS_WS.slug}`);
  assert.equal(get.status, 200);
  const revision = get.data.revision;
  const doc = JSON.parse(JSON.stringify(get.data.doc));
  const open = doc.data.projects.find(p => p.id === 'p_open');
  assert.ok(open, 'the public project is visible to the non-manager');
  open.teams = ['engA']; // forge a team link the caller cannot manage
  open.allowInviteGuests = true; // forge the per-project invite toggle
  /* Also attempt the delete direction on the team-linked private project the
     caller CAN see (individual entry) but cannot manage (lead is m_admin). */
  const both = doc.data.projects.find(p => p.id === 'p_teamboth');
  both.teams = [];
  const res = await teamSession.client.put(`/api/workspaces/${VIS_WS.slug}`, { revision, doc });
  assert.equal(res.status, 200, 'the doc PUT itself succeeds (visibility fields are pinned, not rejected)');

  const after = storedDoc();
  const openAfter = after.data.projects.find(p => p.id === 'p_open');
  assert.deepEqual(openAfter.teams, [], 'p_open teams:[] pin held — forged link rejected');
  assert.equal(openAfter.allowInviteGuests, undefined, 'allowInviteGuests flip rejected');
  const bothAfter = after.data.projects.find(p => p.id === 'p_teamboth');
  assert.deepEqual(bothAfter.teams, ['engA'], 'stale PUT cannot delete p.teams on an unmanaged project');
});

/* ---------------- Phase 51 (51-01): team-link WRITE-path invariants ----------------
   The cells Wave 2's Teams section depends on (D-51-9 unlink, RESEARCH
   Validation Architecture): manager-gated p.teams writes, the private-project
   unlink invariant (Pitfall 6), and the live-link regression guard for links
   written THROUGH doc-sync. */

async function docPutAs(session, mutate) {
  const get = await session.client.get(`/api/workspaces/${VIS_WS.slug}`);
  assert.equal(get.status, 200);
  const doc = JSON.parse(JSON.stringify(get.data.doc));
  mutate(doc);
  return session.client.put(`/api/workspaces/${VIS_WS.slug}`, { revision: get.data.revision, doc });
}

test('manager-gated team-link writes: owner and lead persist, member PUT is pinned', async () => {
  /* Setup: give the public p_open a plain-member lead (a manager by D-51-17),
     simulated with the raw stored-doc edit a manager write produces. */
  const doc = storedDoc();
  const open = doc.data.projects.find(p => p.id === 'p_open');
  open.lead = 'm_plain';
  if (!open.members.includes('m_plain')) open.members.push('m_plain');
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), VIS_WS.id));

  const ownerSession = await login(server.base, 'owner@visfix.local', VIS_PASSWORD);
  const leadSession = await login(server.base, 'plain@visfix.local', VIS_PASSWORD);
  assert.equal(ownerSession.status, 200);
  assert.equal(leadSession.status, 200);

  /* Owner (workspace manager) links engA — persists. */
  const ownerPut = await docPutAs(ownerSession, d => {
    d.data.projects.find(p => p.id === 'p_open').teams = ['engA'];
  });
  assert.equal(ownerPut.status, 200);
  assert.deepEqual(project('p_open').teams, ['engA'], 'the owner team link persists');

  /* Member (m_team — not a manager of p_open) attempts removal — pinned. */
  const memberPut = await docPutAs(teamSession, d => {
    d.data.projects.find(p => p.id === 'p_open').teams = [];
  });
  assert.equal(memberPut.status, 200, 'the doc PUT itself succeeds — fields are pinned, not rejected');
  assert.deepEqual(project('p_open').teams, ['engA'], 'a member cannot unlink a team (whole-team revocation guard)');

  /* Lead (m_plain, non-admin) links a second team — the D-51-17 manage right persists. */
  const leadPut = await docPutAs(leadSession, d => {
    d.data.projects.find(p => p.id === 'p_open').teams = ['engA', 'scopedTeam'];
  });
  assert.equal(leadPut.status, 200);
  assert.deepEqual(project('p_open').teams, ['engA', 'scopedTeam'], 'the lead team link persists');
});

test('unlinking the ONLY team from a private project neither seals it nor opens it (Pitfall 6)', async () => {
  /* p_teamshare: private, lead m_admin, teams ['engA'] — the ONLY link. The
     admin (manager) unlinks it through doc-sync. */
  const adminSession = await login(server.base, 'admin@visfix.local', VIS_PASSWORD);
  assert.equal(adminSession.status, 200);
  const res = await docPutAs(adminSession, d => {
    d.data.projects.find(p => p.id === 'p_teamshare').teams = [];
  });
  assert.equal(res.status, 200);
  const p = project('p_teamshare');
  assert.deepEqual(p.teams, [], 'the unlink persisted');
  assert.equal(p.private, true, 'the private project did not silently open');
  assert.ok(Array.isArray(p.members) && p.members.includes('m_admin'), 'a manager stays on the access list — not sealed');
});

test('live-link sanity: a team link written through doc-sync grants a current team member on the next read', async () => {
  /* Restore m_team's engA row (the earlier leave-revoke test deleted it), then
     link engA onto p_hidden (private, access list [m_admin]) via the admin's
     doc PUT. The 3-term predicate must honor the doc-sync-written link. */
  withDb(server.dbPath, db =>
    db.prepare('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)').run(VIS_WS.id, 'engA', 'm_team', 'u_team'),
  );
  const adminSession = await login(server.base, 'admin@visfix.local', VIS_PASSWORD);
  const res = await docPutAs(adminSession, d => {
    d.data.projects.find(p => p.id === 'p_hidden').teams = ['engA'];
  });
  assert.equal(res.status, 200);
  assert.deepEqual(project('p_hidden').teams, ['engA'], 'the link persisted');
  const viaDoc = await docGet(teamSession);
  assert.ok(viaDoc.ids.includes('p_hidden'), 'the current team member reads the newly linked project');
});
