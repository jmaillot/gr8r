/* =====================================================================
   File byte-route ordering regression (roadmap SC-5, plan 23-01): the
   /w/:slug/file/:id GET/HEAD byte route must match BEFORE the SPA
   fallback (server.js's own comment block documents the constraint),
   the logged-out document navigation 302s to /login?next=<path>, and
   the new /w/:slug/task/:key deep-link shape needs NO server route —
   it rides the SPA fallback (index.html, text/html) without disturbing
   the ordering. No server.js routing change here; this test pins it.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, ROOT, login, startServer } from './helpers/server.mjs';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/* Plant a file record through the doc-PUT channel and its binary flat under
   DATA_DIR/files (the same way test/upload.test.mjs fixtures uploads). */
async function plantFile(server, admin, id, name, bytes) {
  fs.writeFileSync(path.join(server.dataDir, 'files', id), bytes);
  const cur = await admin.client.get('/api/workspaces/acme');
  assert.equal(cur.status, 200);
  const doc = cur.data.doc;
  doc.data = doc.data || {};
  doc.data.files = Array.isArray(doc.data.files) ? doc.data.files : [];
  doc.data.files.push({ id, name, size: bytes.length, type: 'img' });
  const res = await admin.client.put('/api/workspaces/acme', { revision: cur.data.revision, doc });
  assert.equal(res.status, 200, `doc-PUT planting ${name}: ${JSON.stringify(res.data)}`);
}

test('authenticated file GET returns the stored bytes before the SPA fallback can claim them', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    assert.equal(admin.status, 200);
    await plantFile(server, admin, 'f_order1', 'shot.png', PNG_BYTES);

    const res = await fetch(`${server.base}/w/acme/file/f_order1`, {
      headers: { cookie: admin.client.cookie() },
    });
    assert.equal(res.status, 200);
    /* The failing signal the byte route regressed: an index.html body or a
       text/html content-type for a byte route. */
    assert.notEqual(res.headers.get('content-type'), 'text/html', 'the byte route answered with the SPA fallback');
    assert.match(res.headers.get('content-type'), /^image\/png/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG_BYTES);
  } finally {
    await server.stop();
  }
});

test('logged-out file GET 302s to /login?next=<encoded path> built from the pathname only', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    await plantFile(server, admin, 'f_order2', 'shot.png', PNG_BYTES);

    /* No cookie and no Fetch Metadata at all — the navigation branch. */
    const res = await fetch(`${server.base}/w/acme/file/f_order2`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.ok(location.startsWith('/login?next=%2Fw%2F'), `the 302 target must be /login?next=<encoded path>, got ${location}`);
    assert.equal(location, `/login?next=${encodeURIComponent('/w/acme/file/f_order2')}`);
  } finally {
    await server.stop();
  }
});

test('the /w/:slug/task/:key deep-link path rides the SPA fallback — no byte-route interference', async () => {
  /* STATIC_DIR: the harness serves no dist by default; the fallback needs the
     built index.html to prove the app shell actually lands (not a JSON 404). */
  const server = await startServer({ env: { STATIC_DIR: path.join(ROOT, 'dist') } });
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    await plantFile(server, admin, 'f_order3', 'shot.png', PNG_BYTES);

    const res = await fetch(`${server.base}/w/acme/task/dl-roadmap-201`, {
      headers: { cookie: admin.client.cookie() },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^text\/html/, 'the task deep link must be served by the SPA fallback');
    const body = await res.text();
    assert.ok(body.includes('<div id="app"'), 'the SPA fallback must serve the app shell (index.html)');
  } finally {
    await server.stop();
  }
});
