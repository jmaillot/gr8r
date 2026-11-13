/* Phase 58 (58-03, D-01/D-02/D-03): the client search-server seam.
   Pins, from plain node --test:
     - demo mode (api.enabled false) never fetches and resolves { tasks: [] }
     - ANY fetch failure (throw / abort / non-2xx) silently resolves { tasks: [] }
     - the merge dedupes by task id: shared ids appear once, server-only ids append
     - the palette dispatcher aborts the prior request the moment a newer
       keystroke dispatches (D-02)
   The fetch layer is stubbed at globalThis.fetch — the same seam api.call()
   itself drives, so no server process is needed. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from '../src/core/api.js';
import { createDebouncedSearch, searchTasksServer, serverOnlyTasks } from '../src/core/search-server.js';

const realFetch = globalThis.fetch;
const jsonResponse = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('demo mode: api.enabled false resolves { tasks: [] } without any fetch (D-03)', async () => {
  assert.equal(api.enabled, false);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return jsonResponse({});
  };
  try {
    const r = await searchTasksServer('design', undefined);
    assert.deepEqual(r, { tasks: [] });
    assert.equal(calls, 0, 'demo mode must not fetch');
  } finally {
    globalThis.fetch = realFetch;
  }
});

async function enableApi(fetchImpl) {
  globalThis.fetch = async (path, opts) => {
    if (path === '/api/config') return jsonResponse({ app: 'projects' });
    if (path === '/api/workspaces/acme') return jsonResponse({ id: 'ws1', name: 'Acme', slug: 'acme', color: '#123456', role: 'owner', revision: 1 });
    return fetchImpl(path, opts);
  };
  assert.equal(await api.init(), true);
  const r = await api.loadWorkspace('acme');
  assert.equal(r.ok, true);
}

test('a rejected fetch resolves { tasks: [] } — no throw (silent degrade)', async () => {
  try {
    await enableApi(async () => {
      throw new Error('network down');
    });
    const r = await searchTasksServer('design', undefined);
    assert.deepEqual(r, { tasks: [] });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('an aborted fetch resolves { tasks: [] } — no throw', async () => {
  try {
    await enableApi(async () => {
      throw new DOMException('This operation was aborted', 'AbortError');
    });
    const r = await searchTasksServer('design', AbortSignal.abort());
    assert.deepEqual(r, { tasks: [] });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a non-2xx response resolves { tasks: [] } (no error surface)', async () => {
  try {
    await enableApi(async () => new Response(JSON.stringify({ code: 'forbidden' }), { status: 403 }));
    const r = await searchTasksServer('design', undefined);
    assert.deepEqual(r, { tasks: [] });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a successful fetch returns the route payload { tasks: [...] } with the AbortSignal passed through', async () => {
  let seenSignal = null;
  try {
    await enableApi(async path => {
      assert.ok(path.startsWith('/api/workspaces/acme/search?'), path);
      return jsonResponse({ tasks: [{ id: 't9', key: 'A-9', title: 'Server hit', snippet: 'plain text', projectId: 'p1' }] });
    });
    // capture the signal the client passes to fetch
    const wrapped = globalThis.fetch;
    globalThis.fetch = async (path, opts) => {
      seenSignal = opts?.signal ?? null;
      return wrapped(path, opts);
    };
    const ctrl = new AbortController();
    const r = await searchTasksServer('design', ctrl.signal);
    assert.deepEqual(r.tasks, [{ id: 't9', key: 'A-9', title: 'Server hit', snippet: 'plain text', projectId: 'p1' }]);
    assert.equal(seenSignal, ctrl.signal, 'the caller-owned AbortSignal must reach fetch');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('merge dedupe: a shared id appears exactly once; server-only ids append after local (D-01)', () => {
  const local = [{ id: 't1' }, { id: 't2' }];
  const server = [{ id: 't2' }, { id: 't3' }, { id: 't1' }];
  const merged = local.concat(serverOnlyTasks(local, server));
  const ids = merged.map(t => t.id);
  assert.deepEqual(ids, ['t1', 't2', 't3']);
  assert.equal(ids.filter(id => id === 't2').length, 1);
  // local-first ordering preserved
  assert.deepEqual(serverOnlyTasks(local, server).map(t => t.id), ['t3']);
});

test('abort semantics: dispatching query B cancels query A immediately (D-02)', async () => {
  const fired = [];
  const d = createDebouncedSearch((q, signal, isCurrent) => fired.push({ q, signal, isCurrent }), 5);
  d('a');
  const sigA = d.signal();
  d('b'); // newer keystroke — must abort A's controller synchronously
  assert.equal(sigA.aborted, true, 'prior dispatch aborted the moment B dispatches');
  await new Promise(r => setTimeout(r, 30));
  assert.equal(fired.length, 1, 'only the surviving dispatch runs');
  assert.equal(fired[0].q, 'b');
  assert.equal(fired[0].signal.aborted, false);
  assert.equal(fired[0].isCurrent(), true);
});
