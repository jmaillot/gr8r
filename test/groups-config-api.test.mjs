/* =====================================================================
   Group-mapping config API suite (Phase 80, GM-01 — plan 80-02).

   Pins the operator-gated POST /api/governance/group-mappings save
   route over the 80-01 groups.js core:
   - the MANDATORY gate order (sameOrigin → requireUser → isInstanceAdmin
     BEFORE any target lookup — T-80-04: no 403-vs-400 existence oracle);
   - the four keyed 400 refusals (bad guid / unknown workspace / bad role /
     duplicate pair) with NOTHING stored on any refusal (T-80-05);
   - the success path (canonicalized GUID stored, 3-token role).
   Pattern: test/governance.test.mjs — startServer-per-case with the shared
   harness, withDb for direct row inspection, BASE_ENV stamps the operator
   (ADMIN_EMAIL).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, client, login, signup, startServer, withDb } from './helpers/server.mjs';

const mappingRows = srv => withDb(srv.dbPath, db => db.prepare('select * from group_mappings order by created_at, id').all());
const acmeId = srv => withDb(srv.dbPath, db => db.prepare('select id from workspaces where slug = ?').get('acme').id);

/* Hex GUID fixtures (GUID shape — groups.js GUID_SHAPE). */
const GUID_OK = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const GUID_BRACED = '{a1b2c3d4-e5f6-7890-abcd-ef1234567890}'; // paste variant of the SAME group

const mappingsCount = srv => mappingRows(srv).length;

/* ---------- the operator gate (T-80-04) ---------- */

test('unauthenticated POST → 401 signInRequired before any workspace probing (no oracle)', async () => {
  const server = await startServer({});
  try {
    const anon = client(server.base, 'anon');
    // bad-guid body and unknown-workspace body MUST be indistinguishable to
    // a caller the gate has not passed — same status, same keyed refusal.
    const badGuid = await anon.post('/api/governance/group-mappings', { groupGuid: 'not-a-guid', workspaceId: 'whatever', role: 'member' });
    const badWs = await anon.post('/api/governance/group-mappings', { groupGuid: GUID_OK, workspaceId: '00000000-0000-0000-0000-000000000000', role: 'member' });
    assert.equal(badGuid.status, 401, `expected 401, got ${badGuid.status}: ${JSON.stringify(badGuid.data)}`);
    assert.equal(badWs.status, 401);
    assert.deepEqual({ status: badWs.status, code: badWs.data.code }, { status: badGuid.status, code: badGuid.data.code }, 'the gate must not leak which body part was wrong');
    assert.equal(mappingsCount(server), 0);
  } finally {
    await server.stop();
  }
});

test('cross-origin POST with a valid session → 403 crossOriginRejected (sameOrigin runs FIRST)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const cookie = operator.cookie();
    assert.ok(cookie, 'the operator session cookie is present');
    // Raw fetch with a foreign Origin header — the CSRF door before anything else.
    const res = await fetch(`${server.base}/api/governance/group-mappings`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ groupGuid: GUID_OK, workspaceId: acmeId(server), role: 'member' }),
    });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.code, 'crossOriginRejected');
    assert.equal(mappingsCount(server), 0);
  } finally {
    await server.stop();
  }
});

test('non-operator authenticated POST → EXACT 403 operatorOnly regardless of body validity (no 403-vs-400 oracle)', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain User', email: 'plain@test.local' });
    assert.equal(joined.status, 201);
    for (const body of [
      { groupGuid: 'not-a-guid', workspaceId: 'whatever', role: 'member' }, // invalid body
      { groupGuid: GUID_OK, workspaceId: acmeId(server), role: 'member' }, // fully valid body
    ]) {
      const res = await joined.client.post('/api/governance/group-mappings', body);
      assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'operatorOnly', 'the same keyed refusal for an invalid and a valid body — validity is never probed');
      assert.deepEqual(Object.keys(res.data).sort(), ['code', 'error']);
    }
    assert.equal(mappingsCount(server), 0);
  } finally {
    await server.stop();
  }
});

/* ---------- the keyed refusals (T-80-05/T-80-06) ---------- */

test('operator refusals: bad guid, unknown workspace, bad role, duplicate — 400 with the keyed code and ZERO rows stored', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const wsId = acmeId(server);

    const badGuid = await operator.post('/api/governance/group-mappings', { groupGuid: 'not-a-guid', workspaceId: wsId, role: 'member' });
    assert.equal(badGuid.status, 400);
    assert.equal(badGuid.data.code, 'groupMappingBadGuid');

    const unknownWs = await operator.post('/api/governance/group-mappings', { groupGuid: GUID_OK, workspaceId: '00000000-0000-0000-0000-000000000000', role: 'member' });
    assert.equal(unknownWs.status, 400);
    assert.equal(unknownWs.data.code, 'groupMappingUnknownWorkspace');

    for (const role of ['Owner', 'viewer', 'guest', '']) {
      const badRole = await operator.post('/api/governance/group-mappings', { groupGuid: GUID_OK, workspaceId: wsId, role });
      assert.equal(badRole.status, 400, `role ${JSON.stringify(role)} must refuse`);
      assert.equal(badRole.data.code, 'groupMappingBadRole', `role ${JSON.stringify(role)} carries the role code — 'viewer' refuses at save (locked decision)`);
    }

    const first = await operator.post('/api/governance/group-mappings', { groupGuid: GUID_OK, workspaceId: wsId, role: 'member' });
    assert.equal(first.status, 200, `the first save must succeed: ${JSON.stringify(first.data)}`);
    const duplicate = await operator.post('/api/governance/group-mappings', { groupGuid: GUID_BRACED, workspaceId: wsId, role: 'admin' });
    assert.equal(duplicate.status, 400);
    assert.equal(duplicate.data.code, 'groupMappingDuplicate', 'the braced paste variant collapses to the same key — the pair pre-check refuses');

    // exactly ONE row (the successful first save), nothing from the refusals
    assert.equal(mappingsCount(server), 1);
  } finally {
    await server.stop();
  }
});

/* ---------- the success path ---------- */

test('operator + valid body → 200, row readable with the CANONICALIZED guid and the 3-token role', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const wsId = acmeId(server);

    const res = await operator.post('/api/governance/group-mappings', { groupGuid: GUID_BRACED, workspaceId: wsId, role: 'admin', label: 'Platform Team' });
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.mapping.groupGuid, GUID_OK.toLowerCase(), 'the stored GUID is the canonical lowercase-hyphenated key');
    assert.equal(res.data.mapping.workspaceId, wsId);
    assert.equal(res.data.mapping.role, 'admin');
    assert.equal(res.data.mapping.kind, 'workspace');
    assert.equal(res.data.mapping.label, 'Platform Team');

    const [row] = mappingRows(server);
    assert.equal(row.group_guid, GUID_OK.toLowerCase());
    assert.equal(row.workspace_id, wsId);
    assert.equal(row.role, 'admin');
    assert.equal(row.created_by, withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get(ADMIN.email).id));
    assert.equal(row.created_at, row.updated_at);
  } finally {
    await server.stop();
  }
});

/* ---------- the 5-locale keyed-refusal contract ---------- */

test('every new refusal code has a non-empty err.<code> entry in ALL FIVE locales (same-commit constraint)', async () => {
  const codes = ['groupMappingBadGuid', 'groupMappingUnknownWorkspace', 'groupMappingBadRole', 'groupMappingDuplicate'];
  for (const locale of ['en', 'fr', 'nl', 'de', 'es']) {
    const catalogue = JSON.parse(fs.readFileSync(new URL(`../src/locales/${locale}.json`, import.meta.url), 'utf8'));
    for (const code of codes) {
      assert.equal(typeof catalogue[`err.${code}`], 'string', `${locale} is missing err.${code}`);
      assert.ok(catalogue[`err.${code}`].length > 0, `${locale} err.${code} is empty`);
    }
  }
});

/* ---------- D-82-6: dead mappings survive + boot warns ---------- */

/* Boot logs flush asynchronously after listen() (the group-mapping block
   awaits its DB reads); poll the captured output instead of racing it. */
async function bootLog(srv, regex, ms = 3000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const m = srv.output().match(regex);
    if (m) return m;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.fail(`boot log never matched ${regex}:\n${srv.output().slice(-2000)}`);
}

test('dead-mapping survival: the mapping row SURVIVES workspace deletion and the reboot WARNS naming the pair (D-82-6)', async () => {
  // this test owns the dataDir lifecycle: the SAME database must be booted twice
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'groups-config-'));
  const server = await startServer({ dataDir: dir });
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;

    // a fresh workspace mapped to a group, then deleted via the operator route
    const joined = await signup(server.base, { name: 'Doomed Owner', email: 'doomed-owner@test.local' });
    assert.equal(joined.status, 201);
    const created = await joined.client.post('/api/workspaces', { name: 'Doomed Co' });
    assert.equal(created.status, 201, `workspace create must succeed: ${JSON.stringify(created.data)}`);
    const wsId = created.data.workspace.id;
    const saved = await operator.post('/api/governance/group-mappings', { groupGuid: GUID_OK, workspaceId: wsId, role: 'member' });
    assert.equal(saved.status, 200, `mapping save must succeed: ${JSON.stringify(saved.data)}`);

    const ownerId = withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get('doomed-owner@test.local').id);
    const del = await operator.post(`/api/auth/operator/workspaces/${wsId}/delete`, { dispositions: [{ userId: ownerId, type: 'release' }] });
    assert.equal(del.status, 200, `operator delete must succeed: ${JSON.stringify(del.data)}`);

    // the non-cascading FK: the mapping row STAYS after the workspace is gone
    const survivors = withDb(server.dbPath, db => db.prepare('select * from group_mappings where workspace_id = ?').all(wsId));
    assert.equal(survivors.length, 1, 'the dead mapping row must survive workspace deletion (D-82-6)');
    await server.stop();

    // reboot on the SAME database: boot warns naming guid → workspace, and does NOT refuse
    const reboot = await startServer({ dataDir: dir });
    try {
      await bootLog(reboot, /group mappings: 1/);
      await bootLog(reboot, new RegExp(`group mapping dead: group ${GUID_OK.toLowerCase()} → missing workspace ${wsId}`));
      const probe = await fetch(`${reboot.base}/api/config`);
      assert.ok(probe.ok, 'boot did not refuse on the dead mapping');
    } finally {
      await reboot.stop();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('empty-config boot: exactly one `group mappings: off` line, no dead-mapping warnings', async () => {
  const server = await startServer({});
  try {
    await bootLog(server, /group mappings: off/);
    assert.doesNotMatch(server.output(), /group mapping dead/);
    assert.equal((server.output().match(/group mappings:/g) || []).length, 1, 'exactly one grep-able group-mappings line');
    const probe = await fetch(`${server.base}/api/config`);
    assert.ok(probe.ok, 'behavior is unchanged');
  } finally {
    await server.stop();
  }
});
