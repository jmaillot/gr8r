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
    'archive_project',
    'archive_task',
    'create_project',
    'create_task',
    'create_tasks',
    'delete_comment',
    'get_project',
    'get_task',
    'handoff_task',
    'list_activity',
    'list_comments',
    'list_labels',
    'list_members',
    'list_notifications',
    'list_projects',
    'list_tasks',
    'list_teams',
    'move_task',
    'remove_milestone',
    'remove_project_member',
    'remove_subtask',
    'rename_subtask',
    'reorder_task',
    'restore_project',
    'restore_task',
    'search_tasks',
    'set_dependencies',
    'toggle_subtask',
    'update_project',
    'update_task',
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

/* ---- Phase 49 (49-01) server↔MCP parity harness ----

   One fixture workspace, every actor shape, two engines: the server predicate
   (doc-GET door) and the mcp.js mirror (list_projects / whoami / get_project /
   get_task / list_tasks). Expectations come from the hand-derived
   VISIBILITY_MODEL / MIRROR_MODEL oracles in test/helpers/visibility-fixture.mjs
   — never from memberCanReadProject or canReadProject (T-49-01).

   Documented divergence (old model, 2026-11-07): for actors with a scope
   column (m_scoped, m_guest) and for admin/owner (mirror ROLE_RANK bypass vs
   access-list-gated server doc-GET), mirror ≠ server. The mirror model asserts
   the mirror's true old semantics; the parity claim is asserted on the actors
   whose predicates coincide today (null-scope non-admin shapes: m_plain,
   m_team) and the divergence cells are asserted explicitly with dated
   comments. Plan 02's sweep + Plan 03's collapse converge the engines; Plan 03
   flips the divergence assertions to parity in this file. */
import { createVisibilityFixtureDb, MIRROR_MODEL, POST_SWEEP_MIRROR_DELTA, POST_SWEEP_SERVER_DELTA, VISIBILITY_MODEL, VIS_ACTORS, VIS_PASSWORD, VIS_WS, postSweepIds } from './helpers/visibility-fixture.mjs';

const PAR_ACTORS = VIS_ACTORS.filter(id => id !== 'm_doconly');
const parEmailOf = mid => ({
  m_admin: 'admin@visfix.local',
  m_owner: 'owner@visfix.local',
  m_plain: 'plain@visfix.local',
  m_team: 'team@visfix.local',
  m_scoped: 'scoped@visfix.local',
  m_guest: 'guest@visfix.local',
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

test('parity fixture: server doc-GET sets equal the VISIBILITY_MODEL oracle + sweep delta for every actor', async () => {
  /* 2026-11-07 (Phase 49 Plan 02): the one-boot sweep materialized grants and
     cleared the scope columns during boot, so doc-GETs now ride the old
     predicate over swept data — VISIBILITY_MODEL plus the dated
     POST_SWEEP_SERVER_DELTA (fixture helper). Plan 03 replaces this with the
     collapsed-model oracle. */
  for (const mid of PAR_ACTORS) {
    const { status, ids } = await parVisibleDocIds(mid);
    assert.equal(status, 200, `${mid} reads the doc`);
    assert.deepEqual(ids, postSweepIds(VISIBILITY_MODEL, mid, POST_SWEEP_SERVER_DELTA), `${mid}: server set matches the oracle + dated sweep delta`);
  }
});

test('parity: null-scope member/team actors agree across BOTH engines (green under both models)', async () => {
  /* These two shapes are where old-server and old-mirror predicates coincide:
     member/team semantics (public ∨ access list ∨ teamIntersects) with no
     scope column. After Plan 03 they remain the parity canaries. */
  for (const mid of ['m_plain', 'm_team']) {
    const server = await parVisibleDocIds(mid);
    const mirror = await parMirrorIds(mid);
    assert.deepEqual(mirror, server.ids, `${mid}: mirror set === server set`);
    assert.deepEqual(mirror, [...VISIBILITY_MODEL[mid]].sort(), `${mid}: both engines match the oracle`);
  }
});

test('parity: the mirror matches MIRROR_MODEL + sweep delta for every keyed actor (old-mirror semantics pinned)', async () => {
  /* 2026-11-07 (Phase 49 Plan 02): the sweep materialized grants onto the
     STORED access lists the mirror reads — MIRROR_MODEL plus the dated
     POST_SWEEP_MIRROR_DELTA (fixture helper). Plan 03 collapses the predicate
     and replaces this with the converged pins. */
  for (const mid of PAR_ACTORS) {
    const mirror = await parMirrorIds(mid);
    assert.deepEqual(mirror, postSweepIds(MIRROR_MODEL, mid, POST_SWEEP_MIRROR_DELTA), `${mid}: mirror set matches the hand-derived mirror oracle + dated sweep delta`);
  }
});

test('documented divergence (old model): mirror lacks the scope term mcp.js:180-189 (D-49-7)', async () => {
  /* 2026-11-07 (Phase 49 Plan 02): the sweep cleared the scope columns and
     materialized the grants, so the SERVER no longer subtracts scope — scoped
     actors gain the public projects (A3) and their D-03 grants sit on the
     stored access lists the mirror reads. The remaining divergences below are
     the narrowed residue: p_scopeddeny (dissolved entry, server-visible only
     via the owner-injection path for the doc owner) — Plan 03 collapses the
     predicate and replaces this test with the converged pins. */
  const scopedServer = (await parVisibleDocIds('m_scoped')).ids;
  const scopedMirror = await parMirrorIds('m_scoped');
  assert.ok(!scopedServer.includes('p_scopeddeny') && !scopedMirror.includes('p_scopeddeny'), 'dissolved entry hidden on both engines (sweep removed the scoped lead)');
  assert.ok(scopedServer.includes('p_scopeproj') && scopedMirror.includes('p_scopeproj'), 'D-03 grant materialized on the stored list — visible to BOTH engines now');
  assert.ok(!scopedMirror.includes('p_sealed') && !scopedServer.includes('p_sealed'), 'sealed project stays sealed for scoped actors');
});

test('documented divergence (old model): mirror ROLE_RANK bypass vs access-list-gated server for admins', async () => {
  /* 2026-11-07: server hiddenFor's admin path is hiddenProjectIds
     (server.js:894) — access-list gated — while mcp.js:182 grants admins
     everything. This is PRE-EXISTING drift (not introduced by Phase 49); the
     parity harness documents it rather than hides it. Plan 03's lockstep edit
     decides the mirror's admin semantics. */
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
