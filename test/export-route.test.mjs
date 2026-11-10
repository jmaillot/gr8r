/* =====================================================================
   EXPORT ROUTE TESTS — Phase 54 (54-01), the gated POST …/export route.
   Boots a real server.js against the Phase 49 visibility fixture database
   and drives raw fetch calls (the CSV bytes cannot ride the JSON client).
   Funnel order IS the security property: workspace → format → docForClient
   → 404 parity → canManageProject → generation → binary headers.
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer, client } from './helpers/server.mjs';
import { VIS_PASSWORD, createVisibilityFixtureDb } from './helpers/visibility-fixture.mjs';

const EMAILS = {
  owner: 'owner@visfix.local',
  admin: 'admin@visfix.local',
  plain: 'plain@visfix.local',
  team: 'team@visfix.local',
};

/* Raw POST — returns the full fetch Response so tests can read bytes and
   headers the JSON client collapses. */
function rawPost(server, actor, pathname, body) {
  return fetch(server.base + pathname, {
    method: 'POST',
    headers: { cookie: actor.cookie(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const exportPath = id => `/api/workspaces/visfix/projects/${id}/export`;

async function bootVisfixServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-route-'));
  createVisibilityFixtureDb(dataDir);
  const server = await startServer({ dataDir });
  t.after(() => server.stop());

  const auth = {};
  for (const [who, email] of Object.entries(EMAILS)) {
    const c = client(server.base, who);
    const res = await c.post('/api/auth/login', { email, password: VIS_PASSWORD });
    assert.equal(res.status, 200, `${who} login`);
    auth[who] = c;
  }
  return { server, auth };
}

/* CSV helpers — BOM, RFC-4180 rows, header detection. */
function csvRows(buffer) {
  const text = buffer.toString('utf8');
  assert.ok(text.charCodeAt(0) === 0xfeff, 'response body starts with the UTF-8 BOM');
  return text.slice(1).split('\r\n').filter(line => line.length > 0);
}

test('export route: member-lead can export a visible project as CSV with proper headers', async t => {
  const { server, auth } = await bootVisfixServer(t);
  const res = await rawPost(server, auth.plain, exportPath('p_membershare'), { format: 'csv', scope: 'all' });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/csv/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const disposition = res.headers.get('content-disposition');
  assert.ok(disposition, 'Content-Disposition present');
  assert.match(disposition, /attachment/i);
  assert.match(disposition, /filename\*?=[^;]*\.csv/, 'filename carries the .csv extension');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

  const buffer = Buffer.from(await res.arrayBuffer());
  const rows = csvRows(buffer);
  assert.ok(rows.length >= 2, 'at least a header row and one task row');
  const header = rows[0];
  assert.ok(header.includes('Key'), `header carries Key column: ${header}`);
  assert.ok(header.includes('Title'), `header carries Title column: ${header}`);
  /* The fixture p_membershare holds exactly one task (t_mshare). */
  assert.equal(rows.length - 1, 1, 'exactly one data row');
  assert.ok(rows[1].includes('Membershare task'), `row carries the task title: ${rows[1]}`);
});

test('export route: owner and admin roles can export any visible project', async t => {
  const { server, auth } = await bootVisfixServer(t);
  for (const who of ['owner', 'admin']) {
    const res = await rawPost(server, auth.plain, exportPath('p_membershare'), { format: 'csv' });
    assert.equal(res.status, 200, `${who} exports p_membershare`);
    assert.match(res.headers.get('content-type'), /^text\/csv/);
  }
});

test('export route: plain member without lead rights gets 403 exportForbidden and no CSV headers', async t => {
  const { server, auth } = await bootVisfixServer(t);
  /* p_teamboth: m_team reaches it through engA team visibility but is NOT
     lead and NOT admin — canManageProject fails. */
  const res = await rawPost(server, auth.team, exportPath('p_teamboth'), { format: 'csv' });
  assert.equal(res.status, 403);
  const body = JSON.parse(await res.text());
  assert.equal(body.code, 'exportForbidden');
  assert.equal(res.headers.get('content-disposition'), null, 'no Content-Disposition on denial');
  assert.doesNotMatch(res.headers.get('content-type') || '', /^text\/csv/);
});

test('export route: invisible project and nonexistent project are byte-identical 404s', async t => {
  const { server, auth } = await bootVisfixServer(t);
  const hidden = await rawPost(server, auth.plain, exportPath('p_hidden'), { format: 'csv' });
  const ghost = await rawPost(server, auth.plain, exportPath('p_does_not_exist_xyz'), { format: 'csv' });

  assert.equal(hidden.status, 404);
  assert.equal(ghost.status, 404);
  const hiddenBody = JSON.parse(await hidden.text());
  const ghostBody = JSON.parse(await ghost.text());
  assert.equal(hiddenBody.code, 'projectNotFound');
  assert.equal(ghostBody.code, 'projectNotFound');
  /* Parity: identical bodies so a 404 can never enumerate private projects. */
  assert.deepEqual(ghostBody, hiddenBody, '404 bodies byte-identical');
  for (const res of [hidden, ghost]) {
    assert.equal(res.headers.get('content-disposition'), null);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
});

test('export route: unsupported format is rejected 400 exportInvalidRequest', async t => {
  const { server, auth } = await bootVisfixServer(t);
  /* 54-02: xlsx is now a supported format, so the unsupported probe is
     'mpp' — which also pins the prohibition that .mpp is never served
     (the MSPDI XML is never labelled .mpp). */
  const res = await rawPost(server, auth.plain, exportPath('p_membershare'), { format: 'mpp' });
  assert.equal(res.status, 400);
  const body = JSON.parse(await res.text());
  assert.equal(body.code, 'exportInvalidRequest');

  const none = await rawPost(server, auth.plain, exportPath('p_membershare'), {});
  assert.equal(none.status, 400);
  assert.equal(JSON.parse(await none.text()).code, 'exportInvalidRequest');
});

test('export route: view scope with foreign ids exports only the caller-owned selection', async t => {
  const { server, auth } = await bootVisfixServer(t);
  /* t_b1 belongs to p_beta — the scope filter must never select it. */
  const res = await rawPost(server, auth.plain, exportPath('p_membershare'), {
    format: 'csv',
    scope: 'view',
    ids: ['t_mshare', 't_b1', 'p_hidden_task_id'],
  });
  assert.equal(res.status, 200);
  const rows = csvRows(Buffer.from(await res.arrayBuffer()));
  assert.equal(rows.length - 1, 1, 'only the in-project id survives the scope filter');
  assert.ok(rows[1].includes('Membershare task'));
});

test('export route: oversized ids array is clamped, not a DoS vector', async t => {
  const { server, auth } = await bootVisfixServer(t);
  const ids = ['t_mshare', ...Array.from({ length: 6000 }, (_, i) => `junk_${i}`)];
  const res = await rawPost(server, auth.plain, exportPath('p_membershare'), {
    format: 'csv',
    scope: 'view',
    ids,
  });
  assert.equal(res.status, 200, 'the route clamps to 5000 ids and still answers');
  const rows = csvRows(Buffer.from(await res.arrayBuffer()));
  assert.equal(rows.length - 1, 1);
});

test('export route: UTF-8 content survives the full HTTP round-trip', async t => {
  const { server, auth } = await bootVisfixServer(t);
  /* Sanity on encoding end-to-end: the CSV of a project whose data path
     normalizes members — decode the buffer as utf8 and confirm no
     replacement characters leak in from a mis-set charset. */
  const res = await rawPost(server, auth.plain, exportPath('p_membershare'), { format: 'csv' });
  const buffer = Buffer.from(await res.arrayBuffer());
  assert.ok(buffer.length > 0);
  const text = buffer.toString('utf8');
  assert.ok(!text.includes('\uFFFD'), 'no U+FFFD replacement chars from charset mishandling');
  assert.ok(text.charCodeAt(0) === 0xfeff, 'BOM survives serialization');
});

test('export route: unauthenticated request hits the workspace gate', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-route-'));
  createVisibilityFixtureDb(dataDir);
  const server = await startServer({ dataDir });
  t.after(() => server.stop());

  const res = await fetch(server.base + exportPath('p_membershare'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ format: 'csv' }),
  });
  assert.ok([401, 403].includes(res.status), `unauthenticated request denied with ${res.status}`);
  assert.equal(res.headers.get('content-disposition'), null);
});
