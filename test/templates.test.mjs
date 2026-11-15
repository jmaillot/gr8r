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
import { ADMIN, client, startServer } from './helpers/server.mjs';
import {
  normalizeTemplatesData,
  sanitizeProjectBody,
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

/* =====================================================================
   66-01 task 2 (TDD): project-kind whitelist (D-14), D-03 position
   normalization, embedded-tree wholesale gate, junk subtask heal.
   ===================================================================== */

test('sanitizeProjectBody whitelists exactly {name, description, status, teams} (D-14)', () => {
  const out = sanitizeProjectBody({
    name: 'New site',
    description: 'Build it',
    status: 'planning',
    teams: ['t1', 42, null, 't2'],
    lead: 'm1',
    members: ['m2'],
    milestones: [{}],
    assignees: ['m3'],
    customFields: { x: 1 },
  });
  assert.deepEqual(Object.keys(out).sort(), ['description', 'name', 'status', 'teams']);
  assert.deepEqual(out.teams, ['t1', 't2']);
  assert.ok(!('lead' in out));
  assert.ok(!('members' in out));
  assert.ok(!('milestones' in out));
  assert.ok(!('assignees' in out));
  assert.ok(!('customFields' in out));
});

test('sanitizeTemplate dispatches per kind: a project template never carries task-body fields', () => {
  const p = sanitizeTemplate({ kind: 'project', body: { name: 'P', title: 'task-only', subtasks: [] } }, fakeUid, 0);
  assert.deepEqual(Object.keys(p.body).sort(), ['name']);
  const t = sanitizeTemplate({ kind: 'task', body: { title: 'T', name: 'project-only', teams: ['t1'] } }, fakeUid, 0);
  assert.deepEqual(Object.keys(t.body).sort(), ['title']);
});

test('position ties/missing values normalize to distinct safe integers, rank-preserving (D-03)', () => {
  const data = {
    templates: [
      { id: 'a', position: 2 },
      { id: 'b' }, /* missing → array-index fallback (storage order), then ranked */
      { id: 'c', position: 2 }, /* tie with 'a' → array order */
      { id: 'd', position: 0 },
      { id: 'e', position: 'junk' }, /* array-index fallback (4), then ranked */
    ],
  };
  normalizeTemplatesData(data, fakeUid);
  const byId = Object.fromEntries(data.templates.map(t => [t.id, t.position]));
  /* ranks: d(0)→0, b(fallback 1)→1, a(2,i0)→2, c(2,i2)→3, e(fallback 4)→4 —
     the relative order of explicit positions is preserved, ties break by
     storage order, everything lands a distinct safe integer */
  assert.deepEqual([byId.d, byId.b, byId.a, byId.c, byId.e], [0, 1, 2, 3, 4]);
  const seen = new Set(data.templates.map(t => t.position));
  assert.equal(seen.size, data.templates.length, 'positions are distinct');
  /* idempotent: a repeat normalize of the normalized output is a no-op */
  const snapshot = JSON.stringify(data.templates.map(t => [t.id, t.position]));
  normalizeTemplatesData(data, fakeUid);
  assert.equal(JSON.stringify(data.templates.map(t => [t.id, t.position])), snapshot);
});

test('junk embedded subtask entries are healed in place, never stripped', () => {
  const data = {
    templates: [
      {
        id: 'a',
        kind: 'task',
        body: {
          title: 'T',
          subtasks: [
            { title: 'no id' }, /* missing id/parentId/position */
            { id: 's2', position: 'junk', title: 'junk position' },
          ],
        },
      },
    ],
  };
  normalizeTemplatesData(data, fakeUid);
  const subs = data.templates[0].body.subtasks;
  assert.equal(subs.length, 2, 'entries are healed, not dropped');
  assert.ok(typeof subs[0].id === 'string' && subs[0].id, 'the missing id was generated through the factory');
  assert.equal(subs[0].parentId, null);
  assert.equal(subs[0].position, 0);
  assert.equal(subs[1].id, 's2');
  assert.equal(subs[1].parentId, null);
  assert.equal(subs[1].position, 1);
  assert.equal(subs[0].title, 'no id');
});

test('a self-parent cycle inside an embedded template tree is rejected wholesale with code subtaskCycle', () => {
  const data = {
    templates: [
      {
        id: 'a',
        kind: 'task',
        body: {
          title: 'T',
          subtasks: [{ id: 's1', parentId: 's1', position: 0, title: 'self', done: false }],
        },
      },
    ],
  };
  assert.throws(() => normalizeTemplatesData(data, fakeUid), err => err.code === 'subtaskCycle' && err.status === 400);
});

test('a mutual cycle and a depth overflow in a template body reject with the stable codes', () => {
  const mutual = {
    templates: [
      { id: 'a', kind: 'task', body: { subtasks: [
        { id: 'x', parentId: 'y', position: 0 },
        { id: 'y', parentId: 'x', position: 1 },
      ] } },
    ],
  };
  assert.throws(() => normalizeTemplatesData(mutual, fakeUid), err => err.code === 'subtaskCycle');
  const six = {
    templates: [
      { id: 'a', kind: 'task', body: { subtasks: [
        { id: 'd1', parentId: null, position: 0 },
        { id: 'd2', parentId: 'd1', position: 0 },
        { id: 'd3', parentId: 'd2', position: 0 },
        { id: 'd4', parentId: 'd3', position: 0 },
        { id: 'd5', parentId: 'd4', position: 0 },
        { id: 'd6', parentId: 'd5', position: 0 },
      ] } },
    ],
  };
  assert.throws(() => normalizeTemplatesData(six, fakeUid), err => err.code === 'subtaskDepth');
});

test('gate=false (read path) heals instead of throwing: a stored cyclic template never breaks reads', () => {
  const data = {
    templates: [
      {
        id: 'a',
        kind: 'task',
        body: {
          title: 'T',
          subtasks: [{ id: 's1', parentId: 's1', position: 0, title: 'self', done: false }],
        },
      },
    ],
  };
  normalizeTemplatesData(data, fakeUid, { gate: false });
  assert.equal(data.templates[0].body.subtasks[0].parentId, null, 'self-parent healed to root');
});

test('funnel: a PUT carrying a cyclic template subtask tree is rejected 400 subtaskCycle, doc unchanged', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    assert.equal((await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200);
    const ws = await admin.get('/api/workspaces/acme');
    const put = await admin.put('/api/workspaces/acme', {
      revision: ws.data.revision,
      doc: {
        data: {
          templates: [
            {
              id: 'tplcyc',
              kind: 'task',
              name: 'Cyclic',
              body: { title: 'T', subtasks: [{ id: 's1', parentId: 's1', position: 0, title: 'self', done: false }] },
            },
          ],
        },
      },
    });
    assert.equal(put.status, 400, JSON.stringify(put.data));
    assert.equal(put.data.code, 'subtaskCycle');
    /* tx rolled back: no template persisted */
    const read = await admin.get('/api/workspaces/acme');
    const templates = read.data.doc.data.templates || [];
    assert.ok(!templates.some(t => t.id === 'tplcyc'), 'the cyclic template must not persist');
  } finally {
    await server.stop();
  }
});

test('funnel: a legal template PUT with embedded junk subtasks heals and persists', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password });
    const ws = await admin.get('/api/workspaces/acme');
    const put = await admin.put('/api/workspaces/acme', {
      revision: ws.data.revision,
      doc: {
        data: {
          templates: [
            {
              id: 'tplheal',
              kind: 'task',
              name: 'Heals',
              body: { title: 'T', subtasks: [{ title: 'no id' }, { id: 's2', position: 'junk', title: 'B' }] },
            },
          ],
        },
      },
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const read = await admin.get('/api/workspaces/acme');
    const tpl = read.data.doc.data.templates.find(t => t.id === 'tplheal');
    assert.ok(tpl, 'the legal template persists');
    const subs = tpl.body.subtasks;
    assert.equal(subs.length, 2);
    assert.ok(subs[0].id, 'the id-less entry was healed with a generated id');
    assert.equal(subs[0].parentId, null);
    assert.equal(subs[1].position, 1);
  } finally {
    await server.stop();
  }
});
