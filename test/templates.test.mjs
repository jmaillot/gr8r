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
  instantiateTemplate,
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

/* =====================================================================
   66-02 task 1 (TDD): instantiateTemplate — the pure builder. Fresh
   ids everywhere (D-16), parentId remapped through the old→new map
   (Pitfall 4 — no lazy-heal flattening), every date anchored to the
   ONE captured instantiation day (D-05/D-07), neg/zero/missing offset
   semantics (D-08), createProject/createTask row vocabulary.
   ===================================================================== */

/* deterministic prefix-aware factory: uidFactory(prefix) → prefix + n */
const seqUid = () => {
  let n = 0;
  return prefix => prefix + ++n;
};

test('instantiateTemplate (project kind): one project row + one task row per tree entry, all ids fresh (D-16)', () => {
  const tmpl = {
    id: 'tplP',
    kind: 'project',
    name: 'Onboarding',
    icon: 'rocket',
    color: 'blue',
    body: {
      name: 'Onboarding',
      description: 'Set the new hire up',
      status: 'planning',
      teams: ['t1', 42, null, 't2'],
      tasks: [{ title: 'Setup' }, { title: 'Later' }],
    },
  };
  const out = instantiateTemplate(tmpl, seqUid(), '2026-06-01', () => 'ONB');
  assert.ok(out.project, 'project kind returns a project row');
  assert.equal(out.tasks.length, 2, 'one task row per template task tree entry');
  assert.equal(out.project.id, 'p1');
  assert.equal(out.project.key, 'ONB');
  assert.equal(out.project.name, 'Onboarding');
  assert.equal(out.project.desc, 'Set the new hire up');
  assert.equal(out.project.status, 'planning');
  assert.deepEqual(out.project.teams, ['t1', 't2']);
  assert.equal(out.project.icon, 'rocket');
  assert.equal(out.project.color, 'blue');
  /* every id in the output differs from every template-era id (D-16) */
  const ids = [out.project.id, ...out.tasks.map(t => t.id), ...out.tasks.flatMap(t => t.subtasks.map(s => s.id))];
  assert.ok(!ids.includes('tplP'), 'no template id survives instantiation');
  assert.equal(new Set(ids).size, ids.length, 'no id collisions');
  /* task rows reference the NEW project id (createTask vocabulary) */
  for (const tk of out.tasks) assert.equal(tk.project, out.project.id);
});

test('instantiateTemplate: every due anchors to the captured day — task AND subtask offsets are absolute (D-05/D-07)', () => {
  const tmpl = {
    id: 'tplD',
    kind: 'project',
    body: {
      name: 'D',
      tasks: [
        {
          title: 'Parent',
          dueOffsetDays: 10,
          startOffsetDays: 0,
          subtasks: [
            { id: 'sa', parentId: null, position: 0, title: 'A', dueOffsetDays: 3 },
            { id: 'sb', parentId: 'sa', position: 1, title: 'B' },
          ],
        },
      ],
    },
  };
  const out = instantiateTemplate(tmpl, seqUid(), '2026-06-01');
  const tk = out.tasks[0];
  assert.equal(tk.due, '2026-06-11', 'task due = today + 10');
  assert.equal(tk.start, '2026-06-01', 'task start = today + 0');
  const [a, b] = tk.subtasks;
  assert.equal(a.due, '2026-06-04', 'subtask offset 3 anchors to the INSTANTIATION day, never the parent due (D-07)');
  assert.ok(!('due' in b), 'missing offset produces NO due field (D-08)');
});

test('instantiateTemplate: negative/zero offsets pass straight through, no clamping (D-08)', () => {
  const tmpl = {
    id: 'tplN',
    kind: 'project',
    body: { name: 'N', tasks: [{ title: 'Past', dueOffsetDays: -2 }, { title: 'Today', dueOffsetDays: 0 }] },
  };
  const out = instantiateTemplate(tmpl, seqUid(), '2026-06-01');
  assert.equal(out.tasks[0].due, '2026-05-30');
  assert.equal(out.tasks[1].due, '2026-06-01');
});

test('instantiateTemplate: subtask parentId values are remapped through the old→new map; ordering preserved (D-16/Pitfall 4)', () => {
  const tmpl = {
    id: 'tplM',
    kind: 'project',
    body: {
      name: 'M',
      tasks: [
        {
          title: 'T1',
          subtasks: [
            { id: 'old1', parentId: null, position: 0, title: 'Root A' },
            { id: 'old2', parentId: 'old1', position: 1, title: 'Child of A' },
            { id: 'old3', parentId: 'old2', position: 2, title: 'Grandchild' },
          ],
        },
        { title: 'T2', subtasks: [{ id: 'old4', parentId: null, position: 0, title: 'Root B' }] },
      ],
    },
  };
  const out = instantiateTemplate(tmpl, seqUid(), '2026-06-01');
  const t1 = out.tasks[0];
  const [na, nb, nc] = t1.subtasks;
  assert.equal(na.parentId, null);
  assert.equal(nb.parentId, na.id, 'child remapped to the NEW root id — the tree never flattens');
  assert.equal(nc.parentId, nb.id);
  assert.ok(![na.id, nb.id, nc.id].some(id => ['old1', 'old2', 'old3'].includes(id)), 'no template-era subtask id survives');
  assert.deepEqual(t1.subtasks.map(s => s.position), [0, 1, 2], 'sibling ordering preserved');
  assert.equal(out.tasks[1].subtasks[0].parentId, null);
  /* stale/cross-task parent references land null (funnel-safe) */
  const orphan = instantiateTemplate(
    { id: 'x', kind: 'project', body: { name: 'X', tasks: [{ title: 'T', subtasks: [{ id: 'o', parentId: 'ghost', position: 0, title: 'B' }] }] } },
    seqUid(),
    '2026-06-01',
  );
  assert.equal(orphan.tasks[0].subtasks[0].parentId, null);
});

test('instantiateTemplate (task kind): one task row, subtasks regenerated + remapped, project ref null', () => {
  const tmpl = {
    id: 'tplT',
    kind: 'task',
    body: {
      title: 'Weekly report',
      notes: 'Friday',
      priority: 'medium',
      subtasks: [
        { id: 'sa', parentId: null, position: 0, title: 'X', dueOffsetDays: 1 },
        { id: 'sb', parentId: 'sa', position: 1, title: 'Y', dueOffsetDays: 5 },
      ],
    },
  };
  const out = instantiateTemplate(tmpl, seqUid(), '2026-06-01');
  assert.equal(out.project, null, 'task kind returns no project row — the caller assigns the ref');
  assert.equal(out.tasks.length, 1);
  const tk = out.tasks[0];
  assert.equal(tk.project, null);
  assert.equal(tk.title, 'Weekly report');
  assert.equal(tk.notes, 'Friday');
  assert.equal(tk.priority, 'medium');
  assert.equal(tk.status, 'todo');
  const [x, y] = tk.subtasks;
  assert.equal(x.due, '2026-06-02');
  assert.equal(y.due, '2026-06-06');
  assert.equal(y.parentId, x.id);
  assert.ok(![x.id, y.id].some(id => ['sa', 'sb'].includes(id)), 'subtask ids regenerated (D-16)');
});

test('instantiateTemplate: output rows carry the createProject/createTask field vocabulary (funnel gates accept unchanged)', () => {
  const tmpl = {
    id: 'tplV',
    kind: 'project',
    body: {
      name: 'V',
      description: 'd',
      status: 'active',
      teams: ['t1'],
      tasks: [{ title: 'T', notes: 'n', priority: 'high', dueOffsetDays: 2, subtasks: [{ id: 's1', parentId: null, position: 0, title: 'S', done: true, note: 'nt' }] }],
    },
  };
  const out = instantiateTemplate(tmpl, seqUid(), '2026-06-01', () => 'VX');
  assert.deepEqual(Object.keys(out.project).sort(), ['color', 'desc', 'fav', 'icon', 'id', 'key', 'last', 'milestones', 'name', 'status', 'teams']);
  const tk = out.tasks[0];
  /* 66-03: buildTaskRow carries the FULL createTask field vocabulary — the
     client drawer/labels/deps/attachments surfaces read .length unguarded,
     and a fresh instantiation must render without a reload (the funnel
     refills these on the next server sync regardless). */
  assert.deepEqual(Object.keys(tk).sort(), [
    'assignees', 'attachments', 'created', 'creator', 'deps', 'desc', 'due', 'estimate', 'fav', 'id',
    'labels', 'notes', 'order', 'priority', 'project', 'start', 'status', 'subtasks', 'title', 'updated',
  ]);
  const s = tk.subtasks[0];
  assert.deepEqual(Object.keys(s).sort(), ['done', 'id', 'note', 'parentId', 'position', 'title']);
  assert.equal(s.done, true, 'done carried through from the template body');
});

test('sanitizeProjectBody whitelists the embedded task tree with offsets (66-02 handoff from 66-01)', () => {
  const out = sanitizeProjectBody({
    name: 'P',
    tasks: [
      { title: 'T', notes: 'n', priority: 'high', dueOffsetDays: 3, startOffsetDays: 0, junk: 'x', subtasks: [{ id: 's1', parentId: null, position: 0, title: 'S', dueOffsetDays: 2, junk: 1 }] },
      'junk-entry',
      { title: 'No offsets' },
    ],
    notAnArray: 'keep-out',
  });
  assert.deepEqual(Object.keys(out).sort(), ['name', 'tasks']);
  assert.equal(out.tasks.length, 2, 'non-object entries drop, real entries keep');
  const [e1, e2] = out.tasks;
  assert.deepEqual(Object.keys(e1).sort(), ['dueOffsetDays', 'notes', 'priority', 'startOffsetDays', 'subtasks', 'title']);
  assert.equal(e1.dueOffsetDays, 3);
  assert.equal(e1.startOffsetDays, 0);
  assert.ok(!('junk' in e1));
  assert.deepEqual(Object.keys(e1.subtasks[0]).sort(), ['done', 'dueOffsetDays', 'id', 'parentId', 'position', 'title']);
  assert.ok(!('dueOffsetDays' in e2) && !('startOffsetDays' in e2), 'missing offsets stay absent');
});

test('funnel: a project template with an embedded task tree round-trips with offsets intact', async () => {
  const { server, doc } = await workspaceWithTemplates([
    {
      id: 'tplProj',
      kind: 'project',
      name: 'Launch',
      body: {
        name: 'Launch',
        description: 'd',
        status: 'planning',
        teams: ['t1'],
        tasks: [{ title: 'T1', dueOffsetDays: 4, subtasks: [{ id: 's1', parentId: null, position: 0, title: 'S1', dueOffsetDays: 1 }] }],
      },
    },
  ]);
  try {
    const tpl = doc?.data?.templates?.[0];
    assert.ok(tpl, 'the project template survives');
    assert.deepEqual(Object.keys(tpl.body).sort(), ['description', 'name', 'status', 'tasks', 'teams']);
    const e = tpl.body.tasks[0];
    assert.equal(e.dueOffsetDays, 4);
    assert.equal(e.subtasks[0].dueOffsetDays, 1);
    assert.equal(e.subtasks[0].parentId, null);
  } finally {
    await server.stop();
  }
});

/* =====================================================================
   66-02 task 2: the single-pass instantiation pin (D-15) + the landing
   shape the action's ONE mutate produces. src/actions/templates.js is
   DOM-coupled (render/toast/store) so the node suite pins the landing
   logic through the pure landInstantiation + a real funnel PUT, and the
   push discipline STRUCTURALLY (the action module carries exactly one
   pushNow per action and zero createTask calls).
   ===================================================================== */
import { landInstantiation, templateFromItem } from '../src/core/templates.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('landInstantiation (project kind): one mutate lands project + all tasks + activity with nextKey-shaped keys', () => {
  const data = {
    projects: [],
    tasks: [{ id: 'existing', order: 7 }],
    projOrder: [],
    activity: [],
  };
  const built = instantiateTemplate(
    {
      id: 'tpl',
      kind: 'project',
      name: 'P',
      body: { name: 'P', tasks: [{ title: 'T1' }, { title: 'T2', subtasks: [{ id: 's1', parentId: null, position: 0, title: 'S' }] }] },
    },
    seqUid(),
    '2026-06-01',
    () => 'PX',
  );
  let actN = 0;
  const p = landInstantiation(data, 'project', built, { me: 'm1', actId: () => 'act' + ++actN, now: 1000 });
  assert.equal(data.projects.length, 1);
  assert.equal(data.tasks.length, 3, 'the 2 new tasks + the pre-existing one');
  assert.deepEqual(data.projOrder, [p.id], 'projOrder.unshift');
  assert.equal(data.activity.length, 1, 'one activity row, not one per task');
  assert.equal(data.activity[0].verb, 'createdProject');
  assert.equal(data.activity[0].project, p.id);
  assert.equal(p.lead, 'm1');
  assert.deepEqual(p.members, ['m1']);
  /* nextKey semantics: seq seeds 200, first key <key>-201 */
  assert.equal(data.tasks[1].key, 'PX-201');
  assert.equal(data.tasks[2].key, 'PX-202');
  assert.deepEqual(data.tasks.map(t => t.order).sort((a, b) => a - b).slice(1), [8, 9], 'orders renumbered past the live max');
  /* the tree survived landing: T2's subtask keeps its canonical shape */
  const parent = data.tasks.find(t => t.title === 'T2');
  assert.equal(parent.subtasks.length, 1);
  assert.equal(parent.subtasks[0].parentId, null);
});

test('landInstantiation (task kind): one task row with the assigned project ref and a nextKey key', () => {
  const data = { projects: [{ id: 'p1', key: 'AB', seq: 5 }], tasks: [], projOrder: [], activity: [] };
  const built = instantiateTemplate({ id: 'tpl', kind: 'task', body: { title: 'T', subtasks: [] } }, seqUid(), '2026-06-01');
  const tk = landInstantiation(data, 'task', built, { me: 'm1', project: 'p1', nextKey: () => 'AB-6', actId: () => 'a1', now: 1000 });
  assert.equal(data.tasks.length, 1);
  assert.equal(tk.project, 'p1');
  assert.equal(tk.key, 'AB-6');
  assert.equal(data.activity[0].verb, 'created');
  assert.equal(data.activity[0].task, tk.id);
});

test('action module discipline: src/actions/templates.js has ZERO createTask calls and exactly one pushNow per action (D-15/TMPL-03)', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/actions/templates.js', import.meta.url)), 'utf8');
  assert.ok(!src.includes('createTask'), 'no createTask anywhere in the instantiation path');
  const pushCalls = src.match(/await pushNow\(\)/g) || [];
  assert.equal(pushCalls.length, 2, 'exactly one settled pushNow per writing action (save/instantiate; saveAsTemplate only drafts)');
  /* every writing action follows the snapshot/restore failure contract */
  assert.equal((src.match(/snapshot\(\)/g) || []).length >= 2, true, 'snapshot before mutate');
  assert.equal((src.match(/restore\(snap\)/g) || []).length >= 2, true, 'restore on failure');
});

test('funnel: instantiated rows from one builder pass ride ONE doc-PUT — one revision bump, all rows persist', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    assert.equal((await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200);
    const before = await admin.get('/api/workspaces/acme');
    const revBefore = before.data.revision;
    /* build exactly what A.instantiateTemplate lands: builder output +
       landInstantiation into a full doc data shape, ONE PUT */
    const doc = before.data.doc;
    const built = instantiateTemplate(
      {
        id: 'tplOne',
        kind: 'project',
        name: 'One-Pass',
        body: {
          name: 'One-Pass',
          description: 'd',
          status: 'planning',
          teams: [],
          tasks: [
            { title: 'T1', dueOffsetDays: 5, subtasks: [{ id: 'sa', parentId: null, position: 0, title: 'A', dueOffsetDays: 2 }, { id: 'sb', parentId: 'sa', position: 1, title: 'B' }] },
            { title: 'T2', dueOffsetDays: 0 },
          ],
        },
      },
      seqUid(),
      '2026-06-01',
      () => 'OP',
    );
    let actN = 0;
    const p = landInstantiation(doc.data, 'project', built, { me: 'm1', actId: () => 'act' + ++actN });
    const put = await admin.put('/api/workspaces/acme', { revision: revBefore, doc });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const after = await admin.get('/api/workspaces/acme');
    assert.equal(after.data.revision, revBefore + 1, 'exactly ONE revision bump for the whole instantiation (D-15)');
    const data = after.data.doc.data;
    assert.ok(data.projects.some(x => x.id === p.id), 'the project persisted');
    assert.equal(data.tasks.filter(x => x.project === p.id).length, 2, 'both task rows persisted in the same pass');
    const t1 = data.tasks.find(x => x.project === p.id && x.title === 'T1');
    assert.equal(t1.due, '2026-06-06');
    assert.equal(t1.key, 'OP-201');
    assert.equal(t1.subtasks.length, 2, 'the subtask tree persisted — not flattened');
    assert.equal(t1.subtasks[1].parentId, t1.subtasks[0].id, 'parentId survived the funnel (remapped, never healed to null)');
    const t2 = data.tasks.find(x => x.project === p.id && x.title === 'T2');
    assert.equal(t2.due, '2026-06-01');
  } finally {
    await server.stop();
  }
});

test('templateFromItem: the saveAsTemplate draft is the inverse of the builder, D-14 whitelist only (T-66-05)', () => {
  const tk = {
    id: 't1',
    title: 'Weekly report',
    notes: 'n',
    priority: 'high',
    assignees: ['m2'], /* never captured (D-14/T-66-05) */
    lead: 'm3',
    due: '2026-06-08',
    start: '2026-06-01',
    subtasks: [{ id: 's1', parentId: null, position: 0, title: 'A', done: true, note: 'nt', due: '2026-06-04' }],
  };
  const draft = templateFromItem('task', tk, '2026-06-01');
  assert.equal(draft.kind, 'task');
  assert.equal(draft.name, 'Weekly report');
  assert.deepEqual(draft.body.subtasks, [{ id: 's1', parentId: null, position: 0, title: 'A', done: false, note: 'nt', dueOffsetDays: 3 }]);
  /* the project flavor: offsets from each task's own due, member data out */
  const p = { name: 'P', desc: 'd', status: 'active', teams: ['t1'], lead: 'm9', members: ['m9', 'm1'], milestones: [{}] };
  const tasks = [
    { title: 'T1', due: '2026-06-11', start: '2026-06-03', subtasks: [], assignees: ['m2'], priority: 'high', notes: 'n' },
    { title: 'T2', subtasks: [{ id: 'x', parentId: null, position: 0, title: 'S' }] },
  ];
  const pdraft = templateFromItem('project', p, '2026-06-01', { tasks });
  assert.equal(pdraft.kind, 'project');
  assert.deepEqual(Object.keys(pdraft.body).sort(), ['description', 'name', 'status', 'tasks', 'teams']);
  assert.deepEqual(pdraft.body.teams, ['t1']);
  assert.equal(pdraft.body.tasks[0].dueOffsetDays, 10, 'due 2026-06-11 − today 2026-06-01');
  assert.equal(pdraft.body.tasks[0].startOffsetDays, 2);
  assert.equal(pdraft.body.tasks[0].priority, 'high');
  assert.ok(!('lead' in pdraft.body) && !('members' in pdraft.body) && !('milestones' in pdraft.body), 'D-14 whitelist holds');
  assert.ok(!('dueOffsetDays' in pdraft.body.tasks[1]), 'missing due → missing offset');
  /* round-trip honesty: the draft re-instantiates to equivalent offsets */
  const back = instantiateTemplate({ ...pdraft, id: 'tplX' }, seqUid(), '2026-06-01', () => 'PX');
  assert.equal(back.tasks[0].due, '2026-06-11');
  assert.equal(back.tasks[0].start, '2026-06-03');
});
