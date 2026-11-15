/* Templates — Wave-0 harness (Phase 66, plan 66-01).
   Pins the D-01/D-02/D-04 storage shape end-to-end: doc.templates[]
   records rebuilt through the whitelist sanitizer on write AND read
   (unknown fields dropped by construction), round-tripped through the
   mergeClientDoc funnel without being stripped. Later plans extend this
   file: project-kind whitelist + embedded-tree gate + position
   normalization (66-01 task 2), MCP writeDoc parity (test/mcp.test.mjs).
   House style: node:test + assert/strict over the isolated-server
   harness (test/subtask-tree.test.mjs structure). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN, client, login, startServer } from './helpers/server.mjs';
import {
  normalizeTemplatesData,
  sanitizeTaskBody,
  sanitizeTemplate,
  sanitizeTemplateSubtask,
} from '../src/core/templates.js';

/* deterministic id factory for normalize tests (the server passes uid();
   the module itself stays import-free, so tests inject their own) */
const fakeUid = (() => {
  let n = 0;
  return () => 'gen' + ++n;
})();

/* ---------- pure pins: sanitizeTemplate keeps the D-02 shape, drops the rest ---------- */

test('sanitizeTemplate rebuilds exactly the D-02 key set; unknown fields drop by construction', () => {
  const src = {
    id: 'tpl1',
    kind: 'task',
    name: 'Weekly report',
    icon: 'clipboard',
    color: 'blue',
    body: { title: 'Write it', notes: 'Friday', priority: 'medium' },
    position: 3,
    createdBy: 'm1',
    createdAt: 1000,
    updatedAt: 2000,
    junk: 'drop me',
    assignees: ['m2'], /* D-14: never whitelisted anywhere in template bodies */
    lead: 'm3',
    customFields: {},
  };
  const out = sanitizeTemplate(src, fakeUid, 0);
  assert.deepEqual(Object.keys(out).sort(), [
    'body',
    'color',
    'createdAt',
    'createdBy',
    'icon',
    'id',
    'kind',
    'name',
    'position',
    'updatedAt',
  ]);
  assert.equal(out.id, 'tpl1');
  assert.equal(out.kind, 'task');
  assert.equal(out.name, 'Weekly report');
  assert.equal(out.icon, 'clipboard');
  assert.equal(out.color, 'blue');
  assert.deepEqual(out.body, { title: 'Write it', notes: 'Friday', priority: 'medium' });
  assert.equal(out.position, 3);
  assert.equal(out.createdBy, 'm1');
  assert.equal(out.createdAt, 1000);
  assert.equal(out.updatedAt, 2000);
  /* injected unknown keys are absent */
  assert.ok(!('junk' in out));
  assert.ok(!('assignees' in out));
  assert.ok(!('lead' in out));
  assert.ok(!('customFields' in out));
});

test('sanitizeTemplate: missing id is generated through the factory; invalid kind falls back to task', () => {
  const out = sanitizeTemplate({ kind: 'widget', name: 'X' }, fakeUid, 2);
  assert.equal(out.id, 'gen1');
  assert.equal(out.kind, 'task');
  /* position fallback = the array index (D-03 tie rule) */
  assert.equal(out.position, 2);
  assert.equal(out.createdBy, null);
  assert.equal(out.createdAt, null);
  assert.equal(out.updatedAt, null);
});

test('sanitizeTemplate: a provided valid id and position are preserved', () => {
  const out = sanitizeTemplate({ id: 'kept', position: 7 }, fakeUid, 0);
  assert.equal(out.id, 'kept');
  assert.equal(out.position, 7);
});

test('sanitizeTaskBody whitelists title/notes/priority/subtasks only', () => {
  const out = sanitizeTaskBody({
    title: 'T',
    notes: 'N',
    priority: 'high',
    junk: 'x',
    assignees: ['m1'],
    subtasks: [{ id: 's1', parentId: null, position: 0, title: 'A', done: false, extra: 'strip' }],
  });
  assert.deepEqual(Object.keys(out).sort(), ['notes', 'priority', 'subtasks', 'title']);
  assert.equal(out.subtasks[0].title, 'A');
  assert.ok(!('extra' in out.subtasks[0]));
});

test('sanitizeProjectBody placeholder-free: unknown body fields never survive (D-14)', () => {
  const out = sanitizeTemplate({ kind: 'project', body: { name: 'P', junk: 1, assignees: ['m1'] } }, fakeUid, 0);
  assert.deepEqual(Object.keys(out.body).sort(), ['name']);
});

test('sanitizeTemplateSubtask: entries mutate in place, canonical keys kept, offsets only when numeric', () => {
  const s = { id: 's1', parentId: null, position: 0, title: 'A', done: false, note: 'n', junk: 1 };
  assert.equal(sanitizeTemplateSubtask(s), true);
  assert.equal(s.title, 'A');
  assert.equal(s.note, 'n');
  assert.ok(!('junk' in s));
  const s2 = { title: 'No offset', dueOffsetDays: 'junk' };
  sanitizeTemplateSubtask(s2);
  assert.ok(!('dueOffsetDays' in s2));
  const s3 = { title: 'Offset', dueOffsetDays: 5 };
  sanitizeTemplateSubtask(s3);
  assert.equal(s3.dueOffsetDays, 5);
  /* non-objects are filtered out, never normalized */
  assert.equal(sanitizeTemplateSubtask(null), false);
  assert.equal(sanitizeTemplateSubtask('junk'), false);
});

/* ---------- normalizeTemplatesData: array guard + per-record rebuild ---------- */

test('normalizeTemplatesData: non-array/absent templates normalize to []; non-object records drop', () => {
  const data = {};
  normalizeTemplatesData(data, fakeUid);
  assert.deepEqual(data.templates, []);
  const junk = { templates: 'not-an-array' };
  normalizeTemplatesData(junk, fakeUid);
  assert.deepEqual(junk.templates, []);
  const mixed = { templates: [null, 'junk', { id: 'a', kind: 'task', name: 'A' }, 42] };
  normalizeTemplatesData(mixed, fakeUid);
  assert.equal(mixed.templates.length, 1);
  assert.equal(mixed.templates[0].id, 'a');
});

test('normalizeTemplatesData: unknown record fields drop on the sink path too', () => {
  const data = { templates: [{ id: 'a', name: 'A', junk: 'x', body: { title: 'T', bogus: 1 } }] };
  normalizeTemplatesData(data, fakeUid);
  const t = data.templates[0];
  assert.ok(!('junk' in t));
  assert.deepEqual(Object.keys(t.body), ['title']);
});

/* ---------- funnel round-trip: the whitelist sink through a real server ---------- */

async function workspaceWithTemplates(templates) {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    assert.equal((await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200);
    const ws = await admin.get('/api/workspaces/acme');
    assert.equal(ws.status, 200);
    const put = await admin.put('/api/workspaces/acme', {
      revision: ws.data.revision,
      doc: { data: { templates } },
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const read = await admin.get('/api/workspaces/acme');
    assert.equal(read.status, 200);
    const doc = read.data.doc || read.data;
    return { server, doc, admin };
  } catch (err) {
    await server.stop();
    throw err;
  }
}

test('tracer: one task template round-trips the funnel write AND read with D-02 fields intact', async () => {
  const { server, doc } = await workspaceWithTemplates([
    {
      id: 'tpl1',
      kind: 'task',
      name: 'Weekly report',
      icon: 'clipboard',
      color: 'blue',
      body: {
        title: 'Write it',
        notes: 'Friday',
        priority: 'medium',
        subtasks: [{ id: 's1', parentId: null, position: 0, title: 'Draft', done: false, dueOffsetDays: 3 }],
      },
      position: 0,
      createdBy: 'm1',
      createdAt: 1000,
      updatedAt: 2000,
      junk: 'never-persists',
      assignees: ['m2'],
    },
  ]);
  try {
    const templates = doc?.data?.templates;
    assert.ok(Array.isArray(templates) && templates.length === 1, 'the template survives the round-trip');
    const t = templates[0];
    assert.equal(t.id, 'tpl1');
    assert.equal(t.kind, 'task');
    assert.equal(t.name, 'Weekly report');
    assert.equal(t.icon, 'clipboard');
    assert.equal(t.color, 'blue');
    assert.equal(t.position, 0);
    assert.equal(t.createdBy, 'm1');
    assert.equal(t.createdAt, 1000);
    assert.equal(t.updatedAt, 2000);
    assert.deepEqual(t.body, {
      title: 'Write it',
      notes: 'Friday',
      priority: 'medium',
      subtasks: [{ id: 's1', parentId: null, position: 0, title: 'Draft', done: false, dueOffsetDays: 3 }],
    });
    /* the junk record field and the junk body field never persist */
    assert.ok(!('junk' in t));
    assert.ok(!('assignees' in t));
    /* the embedded subtask keeps its Phase 65 canonical shape */
    assert.deepEqual(
      Object.keys(t.body.subtasks[0]).sort(),
      ['done', 'dueOffsetDays', 'id', 'parentId', 'position', 'title'],
    );
  } finally {
    await server.stop();
  }
});

test('a stored doc with a non-array templates key reads back normalized to []', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password });
    const ws = await admin.get('/api/workspaces/acme');
    await admin.put('/api/workspaces/acme', { revision: ws.data.revision, doc: { data: { templates: 'junk' } } });
    const read = await admin.get('/api/workspaces/acme');
    assert.deepEqual(read.data.doc.data.templates, []);
  } finally {
    await server.stop();
  }
});
