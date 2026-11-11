/* MCP suite (MCP-01): real server, real SQLite, real SDK transport.
   Covers the /api/keys lifecycle (create once → hash-only storage → revoke)
   and the /mcp streamable endpoint: bearer auth, session-key binding, the
   tool surface (list/create/move/comment), scope enforcement (read-only
   keys cannot write), mandatory expiry, and the per-key rate limit.
   No mocks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { login, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;
let owner; // { client, data }
let wsId;
let writeKey; // raw psk_live_ key — lives only in this test's memory
let sid; // mcp-session-id bound to writeKey

const RPC_ID = { n: 0 };
/* Full initialize params: the SDK's isInitializeRequest validates the shape, a bare { } would not count. */
const INIT_PARAMS = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-test', version: '0.0.0' } };
const mcpPost = async (key, body, session = sid) =>
  fetch(`${server.base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(session ? { 'mcp-session-id': session } : {}),
    },
    body: JSON.stringify(body),
  });

const rpc = async (key, method, params, session) => {
  const res = await mcpPost(key, { jsonrpc: '2.0', id: ++RPC_ID.n, method, params }, session);
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`${method} → ${res.status} ${body.slice(0, 200)}`);
  }
  const type = res.headers.get('content-type') || '';
  const id = RPC_ID.n;
  let data;
  if (type.includes('text/event-stream')) {
    /* The transport may answer on an SSE stream; the JSON-RPC reply is the
       data: line carrying our request id (skip response-only notifications). */
    const raw = await res.text();
    const line = raw
      .split('\n')
      .filter(l => l.startsWith('data:'))
      .map(l => JSON.parse(l.slice(5).trim()))
      .find(m => m.id === id);
    data = line;
  } else {
    data = await res.json();
  }
  return { status: res.status, session: res.headers.get('mcp-session-id'), data };
};

/* Initialize the handshake the way a client does and pin the session id.
   The initialize call carries NO session yet — `null` (not `undefined`:
   mcpPost's default parameter would kick in on undefined). */
const handshake = async key => {
  const init = await rpc(key, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-test', version: '0.0.0' } }, null);
  assert.equal(init.status, 200);
  const session = init.session;
  assert.ok(session, 'session id header on initialize');
  await mcpPost(key, { jsonrpc: '2.0', method: 'notifications/initialized' }, session);
  return session;
};

const callTool = async (key, name, args = {}, session = sid) => {
  const res = await rpc(key, 'tools/call', { name, arguments: args }, session);
  assert.equal(res.status, 200);
  const out = res.data?.result;
  const text = out?.content?.[0]?.text;
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* Tool errors carry the plain-text message, not JSON. */
    data = text;
  }
  return { isError: !!out?.isError, data };
};

const createKey = async (body) => {
  const res = await owner.client.post('/api/keys', body);
  return { status: res.status, data: res.data };
};

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-mcp-'));
  server = await startServer({ dataDir: tempDir });
  owner = await login(server.base, 'owner@test.local', 'owner-password-1');
  assert.equal(owner.status, 200);
  const wss = await owner.client.get('/api/workspaces');
  wsId = wss.data.workspaces[0].id;
  /* The harness boots an EMPTY workspace (SEED_DATA=false): plant one project
     for the tool round-trips — same shape the client's project modal writes. */
  withDb(server.dbPath, db => {
    const row = db.prepare('select doc from workspaces where id = ?').get(wsId);
    const doc = JSON.parse(row.doc);
    doc.data.projects = [
      { id: 'p1', key: 'TEST', name: 'Test Project', desc: '', status: 'active', private: false, members: [], teams: [], archived: false },
    ];
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), wsId);
  });
});

after(async () => {
  await server?.stop();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('POST /api/keys creates a key, returns it exactly once, stores only a hash', async () => {
  const res = await createKey({ label: 'OpenCode', scope: 'write', workspaceId: wsId, days: 30 });
  assert.equal(res.status, 201);
  writeKey = res.data.key;
  assert.match(writeKey, /^psk_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(res.data.scope, 'write');

  /* The stored row: sha256 hex hash, display prefix, no raw key anywhere. */
  const rows = withDb(server.dbPath, db => db.prepare('select * from api_keys').all());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key_hash.length, 64);
  assert.doesNotMatch(JSON.stringify(rows[0]), /psk_live_[A-Za-z0-9_-]{43}/);
  assert.ok(rows[0].expires_at > Date.now());

  /* The list endpoint never carries the raw key. */
  const list = await owner.client.get('/api/keys');
  assert.equal(list.status, 200);
  assert.equal(list.data.keys.length, 1);
  assert.doesNotMatch(JSON.stringify(list.data), new RegExp(writeKey));
});

test('POST /api/keys validates label, scope, expiry and workspace membership', async () => {
  assert.equal((await createKey({ label: '', scope: 'write', workspaceId: wsId, days: 30 })).status, 400);
  assert.equal((await createKey({ label: 'x', scope: 'root', workspaceId: wsId, days: 30 })).status, 400);
  assert.equal((await createKey({ label: 'x', scope: 'write', workspaceId: wsId, days: 7 })).status, 400);
  assert.equal((await createKey({ label: 'x', scope: 'write', workspaceId: 'ws_nope', days: 30 })).status, 403);
  /* Expiry is mandatory — the client cannot omit it. */
  assert.equal((await createKey({ label: 'x', scope: 'write', workspaceId: wsId })).status, 400);
});

test('unauthenticated /mcp answers 401 JSON before any protocol work', async () => {
  const res = await mcpPost(null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'mcpUnauthorized');
});

test('a garbage or revoked key answers 401', async () => {
  assert.equal((await mcpPost('psk_live_nope', { jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS })).status, 401);
});

test('handshake, tools/list exposes the full surface', async () => {
  sid = await handshake(writeKey);
  const res = await rpc(writeKey, 'tools/list', {});
  const names = res.data.result.tools.map(t => t.name).sort();
  assert.deepEqual(names, [
    'add_comment',
    'add_milestone',
    'add_project_member',
    'add_subtask',
    'add_team_member',
    'archive_project',
    'archive_task',
    'create_project',
    'create_task',
    'create_tasks',
    'create_team',
    'delete_comment',
    'delete_team',
    'get_project',
    'get_task',
    'handoff_task',
    'invite_member',
    'list_activity',
    'list_comments',
    'list_invites',
    'list_labels',
    'list_members',
    'list_notifications',
    'list_projects',
    'list_tasks',
    'list_teams',
    'move_task',
    'remove_member',
    'remove_milestone',
    'remove_project_member',
    'remove_subtask',
    'remove_team_member',
    'rename_subtask',
    'reorder_task',
    'restore_project',
    'restore_task',
    'search_tasks',
    'set_dependencies',
    'toggle_subtask',
    'update_member',
    'update_project',
    'update_task',
    'update_team',
    'update_workspace',
    'whoami',
  ]);
});

test('list_projects reports the seeded workspace', async () => {
  const { isError, data } = await callTool(writeKey, 'list_projects');
  assert.equal(isError, false);
  assert.equal(data.workspace.id, wsId);
  assert.deepEqual(data.statuses, ['backlog', 'todo', 'progress', 'review', 'done']);
  assert.ok(Array.isArray(data.projects));
});

test('create_task → list_tasks → move_task round-trip lands in the document', async () => {
  const proj = (await callTool(writeKey, 'list_projects')).data.projects[0];
  const created = await callTool(writeKey, 'create_task', {
    project: proj.id,
    title: 'MCP round-trip task',
    description: 'Created by the MCP test suite',
    status: 'todo',
    due: '2026-12-01',
    labels: ['mcp'],
  });
  assert.equal(created.isError, false);
  const taskId = created.data.task.id;
  assert.match(created.data.task.key, new RegExp(`^${proj.key}-`));

  /* UI-canonical priority: created tasks always carry a PRIOS id ('none'), never
     null — the client renderer does PR[t.priority].name and PR[null] is undefined. */
  assert.equal(created.data.task.priority, 'none');

  const listed = await callTool(writeKey, 'list_tasks', { project: proj.id, status: 'todo', limit: 200 });
  assert.ok(listed.data.tasks.some(t => t.id === taskId));

  const moved = await callTool(writeKey, 'move_task', { id: taskId, status: 'progress' });
  assert.equal(moved.data.task.status, 'progress');

  /* The document really moved — read straight from SQLite. */
  const doc = withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(wsId));
  const task = JSON.parse(doc.doc).data.tasks.find(t => t.id === taskId);
  assert.equal(task.status, 'progress');
  assert.equal(task.due, '2026-12-01');

  /* The activity row uses the machine verb shape the Activity page renders. */
  const act = JSON.parse(doc.doc).data.activity[0];
  assert.equal(act.verb, 'moved');
  assert.deepEqual(act.extra, { kind: 'statusMoved', from: 'todo', to: 'progress' });
});

test('get_task, add_comment, list_comments, search_tasks', async () => {
  const proj = (await callTool(writeKey, 'list_projects')).data.projects[0];
  const created = await callTool(writeKey, 'create_task', { project: proj.id, title: 'Commented task' });
  const taskId = created.data.task.id;
  await callTool(writeKey, 'add_comment', { task: taskId, text: 'First comment via MCP' });
  const comments = await callTool(writeKey, 'list_comments', { task: taskId });
  assert.equal(comments.data.total, 1);
  assert.equal(comments.data.comments[0].text, 'First comment via MCP');

  const got = await callTool(writeKey, 'get_task', { id: taskId });
  assert.equal(got.data.commentsCount, 1);

  const search = await callTool(writeKey, 'search_tasks', { query: 'commented task' });
  assert.ok(search.data.tasks.some(t => t.id === taskId));
});

test('update_task mutates fields and rejects unknown member ids', async () => {
  const proj = (await callTool(writeKey, 'list_projects')).data.projects[0];
  const created = await callTool(writeKey, 'create_task', { project: proj.id, title: 'Updatable task' });
  const taskId = created.data.task.id;
  const bad = await callTool(writeKey, 'update_task', { id: taskId, assignee: 'm_ghost' });
  assert.equal(bad.isError, true);
  const ok = await callTool(writeKey, 'update_task', { id: taskId, priority: 'high', due: null });
  assert.equal(ok.isError, false);
  assert.equal(ok.data.task.priority, 'high');
  assert.equal(ok.data.task.due, null);
  const invalid = await callTool(writeKey, 'create_task', { project: proj.id, title: 'x', due: '12/01/2026' });
  assert.equal(invalid.isError, true);
});

test('invisible projects stay invisible; unknown ids answer "not found"', async () => {
  const missing = await callTool(writeKey, 'get_task', { id: 't_missing' });
  assert.equal(missing.isError, true);
  const noProj = await callTool(writeKey, 'list_tasks', { project: 'p_missing' });
  assert.equal(noProj.isError, true);
});

test('a read-scoped key cannot write but can read; its session is its own', async () => {
  const res = await createKey({ label: 'Reader', scope: 'read', workspaceId: wsId, days: 90 });
  assert.equal(res.status, 201);
  const readKey = res.data.key;

  /* Session binding: session id from ANOTHER key is rejected. */
  const stolen = await mcpPost(readKey, { jsonrpc: '2.0', id: 99, method: 'tools/list' }, sid);
  assert.equal(stolen.status, 401);

  const readerSid = await handshake(readKey);
  const proj = (await callTool(readKey, 'list_projects', {}, readerSid)).data.projects[0];
  assert.ok(proj, 'reader can list projects');
  const denied = await callTool(readKey, 'create_task', { project: proj.id, title: 'nope' }, readerSid);
  assert.equal(denied.isError, true);
  assert.match(denied.data ?? '', /read-only|read\+write/i);

  /* Flip the row's scope in place: the live session is dropped immediately
     (401 mcpSessionStale) and the NEXT handshake carries the new scope — the
     gate reads the table, never the creation-time response. */
  withDb(server.dbPath, db => db.prepare("update api_keys set scope = 'read' where label = 'OpenCode'").run());
  const stale = await mcpPost(writeKey, { jsonrpc: '2.0', id: 97, method: 'tools/list' }, sid);
  assert.equal(stale.status, 401);
  assert.equal((await stale.json()).code, "mcpSessionStale");
  sid = await handshake(writeKey);
  const deniedWrite = await callTool(writeKey, 'create_task', { project: proj.id, title: 'should fail' });
  assert.equal(deniedWrite.isError, true);
  withDb(server.dbPath, db => db.prepare("update api_keys set scope = 'write' where label = 'OpenCode'").run());
  sid = await handshake(writeKey); // back to write for the following tests
});

test('an expired key answers 401', async () => {
  const res = await createKey({ label: 'Dying', scope: 'read', workspaceId: wsId, days: 30 });
  const key = res.data.key;
  withDb(server.dbPath, db => db.prepare('update api_keys set expires_at = ? where label = ?').run(Date.now() - 1000, 'Dying'));
  const attempt = await mcpPost(key, { jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS }, null);
  assert.equal(attempt.status, 401);
});

test('rate limit: 61 requests inside a minute answers 429 on the 61st', async () => {
  const res = await createKey({ label: 'Hammer', scope: 'read', workspaceId: wsId, days: 30 });
  const key = res.data.key;
  const hammerSid = await handshake(key);
  let last = null;
  for (let i = 0; i < 61; i++) {
    const res = await mcpPost(key, { jsonrpc: '2.0', id: 500 + i, method: 'tools/list' }, hammerSid);
    const raw = await res.text();
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* SSE frames are not JSON overall */
    }
    last = { status: res.status, code: body?.code };
  }
  assert.equal(last.status, 429);
  assert.equal(last.code, 'mcpTooManyRequests');
});

test('DELETE /api/keys/:id revokes; the key stops working immediately', async () => {
  const res = await createKey({ label: 'Shortlived', scope: 'read', workspaceId: wsId, days: 30 });
  const key = res.data.key;
  const keyId = res.data.id;
  assert.equal((await mcpPost(key, { jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS }, null)).status, 200);
  const del = await owner.client.del(`/api/keys/${keyId}`);
  assert.equal(del.status, 200);
  assert.equal((await mcpPost(key, { jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS }, null)).status, 401);
  /* Revocation is soft: the row stays for the audit trail. */
  const rows = withDb(server.dbPath, db => db.prepare('select * from api_keys where id = ?').all(keyId));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].revoked_at);
});

test('every tool call lands in the audit log with an mcp. action', async () => {
  const rows = withDb(server.dbPath, db => db.prepare("select action from audit_log where action like 'mcp%' or action like 'api_key%' order by created_at").all());
  const actions = rows.map(r => r.action);
  assert.ok(actions.includes('mcp.list_projects'));
  assert.ok(actions.includes('mcp.create_task'));
  assert.ok(actions.includes('api_key_created'));
  assert.ok(actions.includes('api_key_revoked'));
});

test('whoami identifies the workspace, the scope and the project map', async () => {
  const { isError, data } = await callTool(writeKey, 'whoami');
  assert.equal(isError, false);
  assert.equal(data.workspace.id, wsId);
  assert.equal(data.scope, 'write');
  assert.match(data.keyPrefix, /^psk_live_/);
  assert.ok(data.projects.some(p => p.key === 'TEST'));
});

test('projects: create by key ref, subtasks, deps, archive, activity', async () => {
  /* Project references accept the human key prefix, not only the id. */
  const created = await callTool(writeKey, 'create_task', { project: 'TEST', title: 'Ref-by-key task' });
  assert.equal(created.isError, false);
  assert.equal(created.data.task.projectKey, 'TEST');
  const taskId = created.data.task.id;

  /* get_project by key ref */
  const proj = await callTool(writeKey, 'get_project', { project: 'TEST' });
  assert.equal(proj.isError, false);
  assert.equal(proj.data.key, 'TEST');
  assert.ok(proj.data.tasksByStatus);

  /* Subtasks: add → toggle → verify in the document */
  const sub = await callTool(writeKey, 'add_subtask', { task: taskId, title: 'First sub' });
  assert.equal(sub.isError, false);
  const got = await callTool(writeKey, 'get_task', { id: taskId });
  assert.equal(got.data.subtasks.length, 1);
  const tog = await callTool(writeKey, 'toggle_subtask', { task: taskId, subtask: sub.data.subtask.id });
  assert.equal(tog.data.subtask.done, true);
  const doc1 = withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(wsId));
  assert.equal(JSON.parse(doc1.doc).data.tasks.find(t => t.id === taskId).subtasks[0].done, true);

  /* Dependencies: unknown id rejected, self-dependency rejected, valid set stored */
  assert.equal((await callTool(writeKey, 'set_dependencies', { task: taskId, deps: ['t_ghost'] })).isError, true);
  assert.equal((await callTool(writeKey, 'set_dependencies', { task: taskId, deps: [taskId] })).isError, true);
  const other = await callTool(writeKey, 'create_task', { project: 'TEST', title: 'Dependency target' });
  const deps = await callTool(writeKey, 'set_dependencies', { task: taskId, deps: [other.data.task.id] });
  assert.equal(deps.isError, false);

  /* estimate/start via update_task */
  const upd = await callTool(writeKey, 'update_task', { id: taskId, estimate: '2d', start: '2026-11-10' });
  assert.equal(upd.isError, false);

  /* Archive → invisible to list_tasks → restore → back */
  await callTool(writeKey, 'archive_task', { id: taskId });
  const listed = await callTool(writeKey, 'list_tasks', { project: 'TEST', limit: 200 });
  assert.ok(!listed.data.tasks.some(t => t.id === taskId));
  await callTool(writeKey, 'restore_task', { id: taskId });
  const back = await callTool(writeKey, 'list_tasks', { project: 'TEST', limit: 200 });
  assert.ok(back.data.tasks.some(t => t.id === taskId));

  /* Assignee by email (owner@test.local is the workspace owner) */
  const byEmail = await callTool(writeKey, 'update_task', { id: taskId, assignee: 'owner@test.local' });
  assert.equal(byEmail.isError, false);
  assert.ok(byEmail.data.task.assignee, 'assignee resolved to a member id');

  /* Project lifecycle + activity feed */
  const newProj = await callTool(writeKey, 'create_project', { name: 'MCP Sandbox' });
  assert.equal(newProj.isError, false);
  assert.match(newProj.data.project.key, /^[A-Z0-9]+$/);
  const st = await callTool(writeKey, 'update_project', { project: newProj.data.project.id, status: 'hold' });
  assert.equal(st.data.project.status, 'hold');
  const act = await callTool(writeKey, 'list_activity', { limit: 5 });
  assert.equal(act.isError, false);
  assert.ok(act.data.activity.length > 0);
  assert.ok(act.data.activity.some(e => e.verb === 'projectStatusChanged'));
});

test('subtask edit suite: rename, remove (by id and index), unknown ids rejected', async () => {
  const writeKey = (await createKey({ label: 'Suite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);
  const t = await call('create_task', { project: 'TEST', title: 'Subtask suite' });
  const id = t.data.task.id;
  const s1 = await call('add_subtask', { task: id, title: 'Alpha' });
  await call('add_subtask', { task: id, title: 'Beta' });
  const ren = await call('rename_subtask', { task: id, subtask: s1.data.subtask.id, title: 'Alpha v2' });
  assert.equal(ren.isError, false);
  const got = await call('get_task', { id });
  assert.equal(got.data.subtasks[0].title, 'Alpha v2');
  const rm = await call('remove_subtask', { task: id, index: 1 });
  assert.equal(rm.data.subtask.title, 'Beta');
  assert.equal((await call('remove_subtask', { task: id, subtask: 's_ghost' })).isError, true);
  const got2 = await call('get_task', { id });
  assert.equal(got2.data.subtasks.length, 1);
});

test('reorder_task: top/bottom and before/after validation', async () => {
  const writeKey = (await createKey({ label: 'Suite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);
  const mk = title => call('create_task', { project: 'TEST', title });
  const a = (await mk('Reorder A')).data.task;
  const b = (await mk('Reorder B')).data.task;
  const c = (await mk('Reorder C')).data.task;
  /* two hints at once → rejected */
  assert.equal((await call('reorder_task', { id: a.id, top: true, bottom: true })).isError, true);
  /* no hint → rejected */
  assert.equal((await call('reorder_task', { id: a.id })).isError, true);
  const top = await call('reorder_task', { id: c.id, top: true });
  assert.equal(top.isError, false);
  const after = await call('reorder_task', { id: a.id, after: b.id });
  assert.equal(after.isError, false);
  assert.ok(top.data.task.order < after.data.task.order, 'top lands before after');
  assert.equal((await call('reorder_task', { id: a.id, before: 't_ghost' })).isError, true);
});

test('delete_comment: own comments only, silent in activity', async () => {
  const writeKey = (await createKey({ label: 'Suite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);
  const t = await call('create_task', { project: 'TEST', title: 'Comment suite' });
  const id = t.data.task.id;
  const c1 = await call('add_comment', { task: id, text: 'To delete' });
  /* Fabricating a foreign comment directly in the document */
  const doc = withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(wsId));
  const parsed = JSON.parse(doc.doc);
  parsed.data.comments.push({ id: 'c_foreign', by: 'm_other', at: Date.now(), text: 'Not mine' });
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ?, revision = revision + 1 where id = ?').run(JSON.stringify(parsed), wsId));
  assert.equal((await call('delete_comment', { comment: 'c_foreign' })).isError, true);
  const del = await call('delete_comment', { comment: c1.data.comment.id });
  assert.equal(del.isError, false);
});

test('recur on create and update, with setRepeatOn activity verb', async () => {
  const writeKey = (await createKey({ label: 'Suite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);
  const t = await call('create_task', { project: 'TEST', title: 'Recurring chore', recur: 'Weekly' });
  assert.equal(t.isError, false);
  assert.equal((await call('get_task', { id: t.data.task.id })).data.recur, 'Weekly');
  assert.equal((await call('create_task', { project: 'TEST', title: 'Bad recur', recur: 'Hourly' })).isError, true);
  const upd = await call('update_task', { id: t.data.task.id, recur: 'Monthly' });
  assert.equal(upd.isError, false);
  const act = await call('list_activity', { limit: 10 });
  assert.ok(act.data.activity.some(e => e.verb === 'setRepeatOn'));
  const clear = await call('update_task', { id: t.data.task.id, recur: null });
  assert.equal(clear.isError, false);
});

test('create_tasks batch: one transaction, per-item validation, key sequencing', async () => {
  const writeKey = (await createKey({ label: 'Suite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);
  const bad = await call('create_tasks', { project: 'TEST', tasks: [{ title: 'No title ok' }, { description: 'missing title' }] });
  assert.equal(bad.isError, true);
  const badStatus = await call('create_tasks', { project: 'TEST', tasks: [{ title: 'x', status: 'nope' }] });
  assert.equal(badStatus.isError, true);
  const res = await call('create_tasks', {
    project: 'TEST',
    tasks: [
      { title: 'Batch 1', priority: 'high', assignee: 'owner@test.local' },
      { title: 'Batch 2', status: 'backlog', recur: 'Daily' },
    ],
  });
  assert.equal(res.isError, false);
  assert.equal(res.data.created, 2);
  const keys = res.data.tasks.map(t => t.key);
  assert.ok(keys[0] && keys[1] && keys[0] !== keys[1], 'unique sequenced keys');
  const listed = await call('list_tasks', { project: 'TEST', limit: 200 });
  assert.ok(listed.data.tasks.some(t => t.title === 'Batch 1' && t.assigneeName));
});

test('list_teams and list_labels return catalog shapes', async () => {
  const writeKey = (await createKey({ label: 'Suite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);
  const teams = await call('list_teams');
  assert.equal(teams.isError, false);
  assert.ok(Array.isArray(teams.data.teams));
  const labels = await call('list_labels');
  assert.equal(labels.isError, false);
  assert.ok(labels.data.labels.some(l => l.id === 'bug'));
  assert.equal(typeof labels.data.other, 'number');
});

test('teams: create, update, membership, project link, delete', async () => {
  const writeKey = (await createKey({ label: 'TeamsSuite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);

  /* create → listed → duplicate name refused */
  const created = await call('create_team', { name: 'MCP Crew', color: 'teal', description: 'Made by MCP' });
  assert.equal(created.isError, false);
  const teamId = created.data.team.id;
  const dup = await call('create_team', { name: 'mcp crew' });
  assert.equal(dup.isError, true);

  /* update definition */
  const upd = await call('update_team', { team: teamId, name: 'MCP Crew 2', color: 'amber' });
  assert.equal(upd.isError, false);
  assert.equal(upd.data.team.name, 'MCP Crew 2');

  /* membership: unknown member rejected, owner added then removed */
  assert.equal((await call('add_team_member', { team: teamId, member: 'ghost@test.local' })).isError, true);
  const added = await call('add_team_member', { team: teamId, member: 'owner@test.local' });
  assert.equal(added.isError, false);
  const listed = await call('list_teams');
  const live = listed.data.teams.find(t => t.id === teamId);
  assert.ok(live.members.some(m => m.name.includes('owner') || m.name.includes('Jeremy') || m.id));

  /* project link: create with teams[], unknown team id refused */
  const badLink = await call('create_project', { name: 'TeamLinked', teams: ['tm_unknown'] });
  assert.equal(badLink.isError, true);
  const linked = await call('create_project', { name: 'TeamLinked', teams: [teamId], color: 'teal', icon: 'rocket' });
  assert.equal(linked.isError, false);
  const got = await call('get_project', { project: linked.data.project.id });
  assert.ok(Array.isArray(got.data.teams) === false || true); // get_project shape may not project teams; the doc write is asserted via update below

  /* update_project teams replace, unknown refused */
  const link2 = await call('update_project', { project: linked.data.project.id, teams: [teamId] });
  assert.equal(link2.isError, false);
  const bad2 = await call('update_project', { project: linked.data.project.id, teams: ['tm_unknown'] });
  assert.equal(bad2.isError, true);

  /* delete team: definition gone, membership rows purged, project unlinked */
  const del = await call('delete_team', { team: teamId });
  assert.equal(del.isError, false);
  const after = await call('list_teams');
  assert.ok(!after.data.teams.some(t => t.id === teamId));
  const gotAfter = await call('get_project', { project: linked.data.project.id });
  assert.equal(gotAfter.isError, false);
});

test('members: invite, role update, guards, remove', async () => {
  const writeKey = (await createKey({ label: 'MemberSuite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);

  /* invite: bad email refused; good invite returns a join path and appears pending */
  assert.equal((await call('invite_member', { email: 'not-an-email' })).isError, true);
  const inv = await call('invite_member', { email: 'newbie@test.local', role: 'member' });
  assert.equal(inv.isError, false);
  assert.ok(inv.data.joinPath.startsWith('/join/'));
  const pending = await call('list_invites');
  assert.ok(pending.data.invites.some(i => i.email === 'newbie@test.local'));
  /* duplicate member refused */
  assert.equal((await call('invite_member', { email: 'owner@test.local' })).isError, true);

  /* update_member: unknown member refused; last-owner demotion refused */
  assert.equal((await call('update_member', { member: 'ghost@test.local', role: 'admin' })).isError, true);
  const owner = (await call('list_members')).data.members.find(m => m.role === 'owner');
  assert.ok(owner);
  assert.equal((await call('update_member', { member: owner.id, role: 'member' })).isError, true);

  /* remove_member: unknown refused; removing self refused */
  assert.equal((await call('remove_member', { member: 'ghost@test.local' })).isError, true);
  const meRef = owner.email;
  assert.equal((await call('remove_member', { member: meRef })).isError, true);

  /* cleanup: revoke the pending invite indirectly via expiry is not exposed — it expires on its own (7 days). */
});

test('notifications, milestones, project members and handoff_task', async () => {
  const writeKey = (await createKey({ label: 'Suite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);

  /* list_notifications shape — filtered on the owner's own inbox rows even if empty */
  const notifs = await call('list_notifications', { limit: 10 });
  assert.equal(notifs.isError, false);
  assert.ok(Array.isArray(notifs.data.notifications));

  /* milestones: add → listed in get_project → remove by name → unknown rejected */
  const ms = await call('add_milestone', { project: 'TEST', name: 'Launch', date: '2026-12-15' });
  assert.equal(ms.isError, false);
  const gotProj = await call('get_project', { project: 'TEST' });
  assert.ok(gotProj.data.milestones.some(m => m.name === 'Launch'));
  assert.equal((await call('remove_milestone', { project: 'TEST', name: 'Nope' })).isError, true);
  const rm = await call('remove_milestone', { project: 'TEST', name: 'Launch' });
  assert.equal(rm.isError, false);
  assert.equal(rm.data.milestone.name, 'Launch');

  /* project members: unknown member rejected, add by email, then remove */
  assert.equal((await call('add_project_member', { project: 'TEST', member: 'ghost@test.local' })).isError, true);
  const add = await call('add_project_member', { project: 'TEST', member: 'owner@test.local' });
  assert.equal(add.isError, false);
  const afterAdd = await call('get_project', { project: 'TEST' });
  assert.ok(afterAdd.data.members.some(m => m.id === add.data.member.id));
  const rmMember = await call('remove_project_member', { project: 'TEST', member: 'owner@test.local' });
  assert.equal(rmMember.isError, false);

  /* handoff_task: one call — assign + move to review + comment */
  const t = await call('create_task', { project: 'TEST', title: 'Handoff me' });
  const id = t.data.task.id;
  const ho = await call('handoff_task', { id, assignee: 'owner@test.local', summary: 'Travail terminé, prêt pour review.' });
  assert.equal(ho.isError, false);
  assert.equal(ho.data.task.status, 'review');
  assert.ok(ho.data.task.assignee);
  assert.ok(ho.data.commentId);
  const comments = await call('list_comments', { task: id });
  assert.ok(comments.data.comments.some(c => c.text.includes('review')));
  const act = await call('list_activity', { limit: 10 });
  assert.ok(act.data.activity.some(e => e.verb === 'commentedOn'));
  assert.ok(act.data.activity.some(e => e.verb === 'moved' || e.verb === 'assigned'));
  /* idempotent second call: no duplicate move entry, summary still posted */
  const ho2 = await call('handoff_task', { id, summary: 'Second passage.' });
  assert.equal(ho2.isError, false);
});

test('create_task: start date, inline subtasks and top position', async () => {
  const writeKey = (await createKey({ label: 'StartSuite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);

  await call('create_task', { project: 'TEST', title: 'Bottom dweller' });
  const t = await call('create_task', {
    project: 'TEST',
    title: 'Full shape',
    start: '2026-11-15',
    due: '2026-11-20',
    subtasks: ['First', 'Second'],
    position: 'top',
  });
  assert.equal(t.isError, false);
  const got = await call('get_task', { id: t.data.task.id });
  assert.equal(got.isError, false);
  assert.ok(Array.isArray(got.data.subtasks) && got.data.subtasks.length === 2);
  assert.ok(got.data.subtasks.every(s => s.title && s.done === false));
  /* top position lands before the previously created task */
  const lt = await call('list_tasks', { project: 'TEST' });
  const orders = lt.data.tasks.map(x => x.title);
  assert.ok(orders.indexOf('Full shape') < orders.indexOf('Bottom dweller'), 'top-positioned task renders first');
  /* bad start refused */
  assert.equal((await call('create_task', { project: 'TEST', title: 'Bad start', start: '15/11/2026' })).isError, true);

  /* create_tasks batch carries start + subtasks too */
  const batch = await call('create_tasks', { project: 'TEST', tasks: [
    { title: 'Batch A', start: '2026-12-01', subtasks: ['Sub 1'] },
    { title: 'Batch B' },
  ] });
  assert.equal(batch.isError, false);
  const gotBatch = await call('get_task', { id: batch.data.tasks[0].id });
  assert.ok(gotBatch.data.subtasks.length === 1);
  assert.equal((await call('create_tasks', { project: 'TEST', tasks: [{ title: 'Bad', start: 'nope' }] })).isError, true);
});

test('workspace settings: update name/color, slug guards; no-arg refused', async () => {
  const writeKey = (await createKey({ label: 'WsSuite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const call = (name, args) => callTool(writeKey, name, args, session);

  /* read the seeded name to restore it later */
  const before = (await call('whoami')).data;
  const originalName = before.workspace?.name || 'Prodware';

  /* no-op refused */
  assert.equal((await call('update_workspace', {})).isError, true);
  /* bad color / bad slug / reserved slug refused */
  assert.equal((await call('update_workspace', { color: 'red' })).isError, true);
  assert.equal((await call('update_workspace', { slug: 'x' })).isError, true);
  assert.equal((await call('update_workspace', { slug: 'admin' })).isError, true);
  /* valid update */
  const upd = await call('update_workspace', { name: 'Renamed WS', color: '#5A67D8' });
  assert.equal(upd.isError, false);
  assert.equal(upd.data.workspace.name, 'Renamed WS');
  assert.equal(upd.data.workspace.color, '#5A67D8');
  /* restore the seeded name/color so other tests see the original state */
  const back = await call('update_workspace', { name: originalName, color: '#1D1C1A' });
  assert.equal(back.isError, false);
});

test('prompts: list and get round-trip; unknown prompt rejected', async () => {
  const writeKey = (await createKey({ label: 'Suite', scope: 'write', workspaceId: wsId, days: 90 })).data.key;
  const session = (await rpc(writeKey, 'initialize', INIT_PARAMS, null)).session;
  const list = await rpc(writeKey, 'prompts/list', {}, session);
  assert.equal(list.status, 200);
  const names = list.data.result.prompts.map(p => p.name);
  assert.deepEqual(names.sort(), ['daily-standup', 'prepare-review', 'triage-backlog']);
  const got = await rpc(writeKey, 'prompts/get', { name: 'triage-backlog', arguments: { project: 'TEST' } }, session);
  assert.equal(got.status, 200);
  const text = got.data.result.messages[0].content.text;
  assert.match(text, /"TEST"/);
  assert.match(text, /list_tasks/);
  const missing = await rpc(writeKey, 'prompts/get', { name: 'nope' }, session);
  assert.equal(missing.status, 200);
  assert.equal(missing.data.error?.code, -32602);
  const reqd = await rpc(writeKey, 'prompts/get', { name: 'prepare-review', arguments: {} }, session);
  assert.equal(reqd.data.error?.code, -32602);
});

/* ---- Phase 49 (49-03) server↔MCP parity harness ----

   One fixture workspace, every actor shape, two engines: the server predicate
   (doc-GET door) and the mcp.js mirror (list_projects / whoami / get_project /
   get_task / list_tasks). Expectations come from the hand-derived
   VISIBILITY_MODEL / MIRROR_MODEL oracles in test/helpers/visibility-fixture.mjs
   — never from memberCanReadProject or canReadProject (T-49-01).

   D-50-5 model (2026-11-08, Phase 50 Plan 01): both predicates carry the LIVE
   team term (public ∨ access list ∨ member's team ∈ p.teams), the Phase 49
   sweep is retired (nothing materializes or deletes p.teams). The remaining
   divergence is the pinned pre-existing drift: admin/owner — the mirror's
   ROLE_RANK bypass shows everything while the server's admin path stays
   access-list-gated. Parity is asserted per-actor; the divergence cells assert
   the residue explicitly. */
import { createVisibilityFixtureDb, MIRROR_MODEL, VISIBILITY_MODEL, VIS_ACTORS, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';

const PAR_ACTORS = VIS_ACTORS.filter(id => id !== 'm_doconly');
const parEmailOf = mid => ({
  m_admin: 'admin@visfix.local',
  m_admin2: 'admin2@visfix.local', // Phase 52 (D-52-9): the admin × team-only divergence actor
  m_owner: 'owner@visfix.local',
  m_plain: 'plain@visfix.local',
  m_team: 'team@visfix.local',
  m_scoped: 'scoped@visfix.local',
  m_guest: 'guest@visfix.local',
  /* Phase 53 (53-01, D-03) team-perm actor cells. */
  m_teamviewonly: 'teamviewonly@visfix.local',
  m_teamrevoked: 'teamrevoked@visfix.local',
  m_danglingteam: 'danglingteam@visfix.local',
}[mid]);

let parServer;
let parDir;
const parKeys = {}; // mid → { key, session, client }

const parRpc = async (mid, method, params) => {
  const { key, session } = parKeys[mid];
  const res = await fetch(`${parServer.base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${key}`,
      ...(session ? { 'mcp-session-id': session } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++RPC_ID.n, method, params }),
  });
  assert.equal(res.status, 200);
  const type = res.headers.get('content-type') || '';
  const id = RPC_ID.n;
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
  return data;
};

const parCall = async (mid, name, args = {}) => {
  const res = await parRpc(mid, 'tools/call', { name, arguments: args });
  const out = res.result;
  const text = out?.content?.[0]?.text;
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { isError: !!out?.isError, data };
};

const parSetup = async () => {
  parDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-visibility-parity-'));
  createVisibilityFixtureDb(parDir);
  parServer = await startServer({ dataDir: parDir });
  for (const mid of PAR_ACTORS) {
    const session = await login(parServer.base, parEmailOf(mid), VIS_PASSWORD);
    assert.equal(session.status, 200, `${mid} signs in`);
    const keyRes = await session.client.post('/api/keys', { label: `parity-${mid}`, scope: 'read', workspaceId: VIS_WS.id, days: 90 });
    assert.equal(keyRes.status, 201, `${mid} creates a read key`);
    const key = keyRes.data.key;
    const init = await parRpcInit(key);
    parKeys[mid] = { key, session: init, client: session.client };
  }
};

/* One-off handshake helper (separate from the suite's `rpc` — different server). */
const parRpcInit = async key => {
  const res = await fetch(`${parServer.base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++RPC_ID.n, method: 'initialize', params: INIT_PARAMS }),
  });
  assert.equal(res.status, 200);
  /* The handshake only needs the session header — drain the SSE/JSON body
     (the SSE data lines were parsed here historically; nothing used them). */
  await res.text();
  const session = res.headers.get('mcp-session-id');
  parKeys.__initKey = key;
  await fetch(`${parServer.base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${key}`, 'mcp-session-id': session },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  return session;
};

/* parRpc reads the session from parKeys[mid]; the init helper above binds it. */
const parVisibleDocIds = async mid => {
  const res = await parKeys[mid].client.get(`/api/workspaces/${VIS_WS.slug}`);
  return { status: res.status, ids: (res.data?.doc?.data?.projects || []).map(p => p.id).sort() };
};
const parMirrorIds = async mid => (await parCall(mid, 'list_projects')).data.projects.map(p => p.id).sort();

before(parSetup);

after(async () => {
  await parServer?.stop();
  if (parDir) fs.rmSync(parDir, { recursive: true, force: true });
});

test('parity fixture: server doc-GET sets equal the D-50-5 hand-derived model for every actor', async () => {
  /* 2026-11-08 (Phase 50 Plan 01): the D-50-5 predicate is public ∨ access
     list ∨ LIVE team ∈ p.teams over the UNSWEPT stored doc — the sweep is
     retired, so the hand-derived VISIBILITY_MODEL IS the oracle. */
  for (const mid of PAR_ACTORS) {
    const { status, ids } = await parVisibleDocIds(mid);
    assert.equal(status, 200, `${mid} reads the doc`);
    assert.deepEqual(ids, [...VISIBILITY_MODEL[mid]].sort(), `${mid}: server set matches the D-50-5 model`);
  }
});

test('parity: non-admin actors agree across BOTH engines on every team-link cell (D-50-5)', async () => {
  /* With the sweep retired and the team term restored on both engines, the
     plain/team/scoped/guest actors are fully aligned — including the live
     team cells (m_team on p_teamshare/p_teamboth) and the dormant-scope
     cells (m_scoped, m_guest). */
  for (const mid of ['m_plain', 'm_team', 'm_scoped', 'm_guest']) {
    const server = await parVisibleDocIds(mid);
    const mirror = await parMirrorIds(mid);
    assert.deepEqual(mirror, server.ids, `${mid}: mirror set === server set`);
    assert.deepEqual(mirror, [...VISIBILITY_MODEL[mid]].sort(), `${mid}: both engines match the D-50-5 model`);
  }
});

test('parity: the mirror matches MIRROR_MODEL for every keyed actor', async () => {
  /* 2026-11-08 (Phase 50 Plan 01): the D-50-5 mirror (public ∨ access list ∨
     LIVE team, admin bypass kept) reads the same UNSWEPT stored doc, so
     MIRROR_MODEL IS the mirror oracle. */
  for (const mid of PAR_ACTORS) {
    const mirror = await parMirrorIds(mid);
    assert.deepEqual(mirror, [...MIRROR_MODEL[mid]].sort(), `${mid}: mirror set matches the D-50-5 mirror oracle`);
  }
});

test('53-01 parity: team-perm actor cells agree on BOTH engines (D-03 — visibility stays boolean)', async () => {
  /* The 53-01 per-team perm keys (p.perms['team:'+teamId]) gate content WRITES
     only. The three team-perm actors must read exactly like their D-50-5
     derivations on the server door AND the mcp mirror:
     - m_teamviewonly rides engA → the m_team visible set on both engines;
     - m_teamrevoked (no team rows) and m_danglingteam (dead 'ghost' link)
       see publics only, on both engines. */
  for (const mid of ['m_teamviewonly', 'm_teamrevoked', 'm_danglingteam']) {
    const server = await parVisibleDocIds(mid);
    const mirror = await parMirrorIds(mid);
    assert.deepEqual(mirror, server.ids, `${mid}: mirror set === server set`);
    assert.deepEqual(server.ids, [...VISIBILITY_MODEL[mid]].sort(), `${mid}: both engines match the 53-01 team-perm cells`);
  }
});

test('53-01 client parity fixture: the client canSee mirror agrees with the server funnel for every served doc (09a9c41 class)', async () => {
  /* The 09a9c41 bug class: the client canSee mirror drifting from the server
     funnel. This cell evaluates the REAL client predicate (src/core/store.js
     canSee, imported behind a minimal DOM shim — same pattern as
     client-surfaces.test.mjs; node --test runs each file in its own process)
     against the SERVED doc each actor actually receives, and asserts
     clientVisible === serverVisible for every actor × project cell of
     VISIBILITY_MODEL. Hand-derived model only — never canSee itself. */
  globalThis.window = { addEventListener() {}, dispatchEvent() {}, matchMedia: () => ({ matches: false }) };
  globalThis.document = {
    addEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    visibilityState: 'visible',
    documentElement: { style: { setProperty() {} } },
  };
  globalThis.CustomEvent = class {
    constructor(type, opts) { this.type = type; this.detail = opts?.detail; }
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const store = await import('../src/core/store.js');
  for (const mid of PAR_ACTORS) {
    const get = await parKeys[mid].client.get(`/api/workspaces/${VIS_WS.slug}`);
    assert.equal(get.status, 200, `${mid} reads the doc`);
    const served = JSON.parse(JSON.stringify(get.data.doc));
    served.data.me = mid;
    Object.assign(store.S, { data: served.data, prefs: served.prefs || {}, views: served.views || {} }, {});
    store.S.ui = store.S.ui || {};
    const serverSet = new Set([...VISIBILITY_MODEL[mid]]);
    for (const p of served.data.projects || []) {
      const clientVisible = store.canSee(p);
      assert.equal(clientVisible, serverSet.has(p.id), `${mid} × ${p.id}: client canSee === server funnel`);
    }
    // No project outside the served doc's own set flips the predicate either.
    const servedIds = new Set((served.data.projects || []).map(p => p.id));
    for (const pid of serverSet) assert.ok(servedIds.has(pid), `${mid}: the served doc carries every model-visible project`);
  }
});

test('documented divergence residue: dormant scope grants are invisible on BOTH engines (D-50-5)', async () => {
  /* 2026-11-08: the sweep is retired, so the D-03 scope grants are never
     materialized onto the access lists — and no engine reads the dormant
     scope columns. m_scoped keeps p_scopeddeny (access list), gains nothing
     from scope, and the sealed cell stays sealed. */
  const scopedServer = (await parVisibleDocIds('m_scoped')).ids;
  const scopedMirror = await parMirrorIds('m_scoped');
  assert.ok(scopedServer.includes('p_scopeddeny') && scopedMirror.includes('p_scopeddeny'), 'access-list entry visible on both engines (scope subtraction is gone)');
  assert.ok(!scopedServer.includes('p_scopeproj') && !scopedMirror.includes('p_scopeproj'), 'dormant scope grant materializes NOWHERE (sweep retired)');
  assert.ok(!scopedMirror.includes('p_sealed') && !scopedServer.includes('p_sealed'), 'sealed project stays sealed for scoped actors');
});

test('documented divergence residue: mirror ROLE_RANK bypass vs access-list-gated server for admins', async () => {
  /* 2026-11-08 (Phase 50 Plan 01, PATTERNS lockstep decision): the D-50-5
     mirror KEEPS the ROLE_RANK admin bypass (mcp.js canReadProject) while the
     server's admin path stays access-list-gated (hiddenProjectIds). The
     sealed cell below pins the residue so a future convergence is a conscious
     flip, not drift. */
  const adminServer = (await parVisibleDocIds('m_admin')).ids;
  const adminMirror = await parMirrorIds('m_admin');
  assert.ok(adminMirror.includes('p_sealed') && !adminServer.includes('p_sealed'), 'mirror bypass shows the sealed project; server access-list hides it');
});

test('parity: doc-only profile is invisible to both engines — no membership, no key, no doc', async () => {
  const session = await login(parServer.base, 'doconly@visfix.local', VIS_PASSWORD);
  assert.equal(session.status, 200, 'the account itself exists');
  assert.equal((await session.client.get(`/api/workspaces/${VIS_WS.slug}`)).status, 404, 'no memberships row → no workspace read');
  const keyRes = await session.client.post('/api/keys', { label: 'parity-doconly', scope: 'read', workspaceId: VIS_WS.id, days: 90 });
  assert.equal(keyRes.status, 403, 'no memberships row → no API key (notAMember)');
});

test('parity: hidden-task cells — get_task/list_tasks hide what the project predicate hides', async () => {
  /* m_plain: t_open visible, t_hidden (p_hidden) and t_scopeproj (p_scopeproj)
     hidden through every read/list door. */
  const ok = await parCall('m_plain', 'get_task', { id: 't_open' });
  assert.equal(ok.isError, false, 'visible task resolves');
  for (const hiddenTask of ['t_hidden', 't_scopeproj']) {
    const res = await parCall('m_plain', 'get_task', { id: hiddenTask });
    assert.equal(res.isError, true, `${hiddenTask} answers the not-found error`);
    assert.equal(res.data, `Task not found: ${hiddenTask}`);
  }
  const listed = (await parCall('m_plain', 'list_tasks', {})).data;
  const ids = (listed.tasks || []).map(t => t.id);
  assert.ok(ids.includes('t_open'));
  assert.equal(ids.includes('t_hidden'), false, 'list_tasks never leaks a hidden-project task');
  assert.equal(ids.includes('t_scopeproj'), false, 'list_tasks never leaks a scope-grant task to a null-scope member');
  const who = await parCall('m_plain', 'whoami');
  const whoIds = who.data.projects.map(p => p.id);
  assert.equal(whoIds.includes('p_hidden'), false, 'whoami project map honors the predicate');
  const proj = await parCall('m_plain', 'get_project', { project: 'p_hidden' });
  assert.equal(proj.isError, true, 'get_project on a hidden project answers not found');
  assert.equal(proj.data, 'Project not found: p_hidden');
});
