/* Real file uploads (Phase 12): the raw-body upload endpoint at
   POST /w/:slug/files stores exact bytes flat under DATA_DIR/files/<id>
   behind sameOrigin + member auth, and rejects oversize uploads mid-stream
   with 413 and the stable uploadTooLarge code. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, client, inviteToken, login, signup, startServer } from './helpers/server.mjs';

/* PREVIEW-01 static guard: the client's upload transport is real XHR —
   the simulated setInterval timer never returns to the upload path. */
test('handleFiles uploads real bytes via XMLHttpRequest with upload.onprogress, no simulated timer (PREVIEW-01)', () => {
  const src = fs.readFileSync(new URL('../src/actions/actions.js', import.meta.url), 'utf8');
  const at = src.indexOf('export function handleFiles');
  assert.ok(at > -1, 'handleFiles exists in actions.js');
  const region = src.slice(at, src.indexOf('IN.uploadFiles', at));
  assert.ok(region.includes('XMLHttpRequest'), 'the upload transport must be XMLHttpRequest (fetch has no upload progress)');
  assert.ok(region.includes('upload.onprogress'), 'the XHR upload progress event drives the bar contract');
  assert.ok(!region.includes('setInterval'), 'the simulated setInterval timer is gone from the upload path');
  assert.ok(region.includes("getElementById('upbar-'"), 'the upbar-<id> progress contract is preserved');
  assert.ok(region.includes("getElementById('upct-'"), 'the upct-<id> percentage contract is preserved');
  assert.ok(region.includes('if (S.ui.offline)'), 'the demo-mode metadata-only early return is preserved (D-12)');
});

/* The harness client only sends JSON; uploads are raw bodies, so POST them
   with plain fetch carrying the captured gr8r_session cookie. */
function uploadFetch(server, cookie, body, { slug = 'acme', name = 'hello.txt' } = {}) {
  return fetch(`${server.base}/w/${slug}/files?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/octet-stream' },
    body,
  });
}

test('uploadTooLarge 413: oversize upload rejected mid-stream with its stable code, partial file unlinked, server alive', async () => {
  const server = await startServer({ env: { MAX_UPLOAD_MB: '1' } });
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    assert.equal(admin.status, 200);

    /* 2 MB against a 1 MB cap — only MAX_UPLOAD_MB matters here, the default
       8 MB MAX_BODY limit is irrelevant to this path. */
    const big = Buffer.alloc(2 * 1024 * 1024, 7);
    const res = await uploadFetch(server, admin.client.cookie(), big, { name: 'big.bin' });
    assert.equal(res.status, 413);
    const data = await res.json();
    assert.equal(data.code, 'uploadTooLarge');
    assert.equal(data.error, 'Upload too large');

    /* the half-written file must be gone — no partial entry under files/ */
    const filesDir = path.join(server.dataDir, 'files');
    assert.deepEqual(fs.readdirSync(filesDir), []);

    /* WR-05 drain contract: fetch resolved above with the full response, and
       the server still answers on the same port. */
    const alive = await fetch(`${server.base}/api/health`);
    assert.ok(alive.ok);
  } finally {
    await server.stop();
  }
});

/* Plant a file record through the doc-PUT channel (the same way the client
   persists upload metadata) and its binary flat under DATA_DIR/files. */
async function putDoc(admin, mutate) {
  const cur = await admin.client.get('/api/workspaces/acme');
  assert.equal(cur.status, 200);
  const doc = cur.data.doc;
  mutate(doc);
  return admin.client.put('/api/workspaces/acme', { revision: cur.data.revision, doc });
}

async function plantFile(server, admin, id, name, bytes) {
  fs.writeFileSync(path.join(server.dataDir, 'files', id), bytes);
  const res = await putDoc(admin, doc => {
    doc.data = doc.data || {};
    doc.data.files = Array.isArray(doc.data.files) ? doc.data.files : [];
    doc.data.files.push({ id, name, size: bytes.length, type: 'img' });
  });
  assert.equal(res.status, 200, `doc-PUT planting ${name}: ${JSON.stringify(res.data)}`);
}

/* Plain fetch carrying a captured cookie — the harness client is JSON-only.
   Any extra headers (Sec-Fetch-Dest, …) ride through as-is. */
function fileFetch(server, cookie, pathname, { accept = '*/*', ...extra } = {}) {
  return fetch(`${server.base}${pathname}`, { headers: { cookie, accept, ...extra } });
}

test('file GET serves exact bytes to members; outsiders, unknown ids and unknown workspaces all 404 (UPLOAD-03)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    await plantFile(server, admin, 'f_png1', 'shot.png', bytes);

    /* byte-identical content for an authorized member */
    const res = await fileFetch(server, admin.client.cookie(), '/w/acme/file/f_png1');
    assert.equal(res.status, 200);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);

    /* an outsider (valid account, no membership) gets 404 with no oracle */
    const outsider = await signup(server.base, { name: 'Outsider', email: 'outsider@test.local' });
    assert.equal(outsider.status, 201);
    const noMembership = await fileFetch(server, outsider.client.cookie(), '/w/acme/file/f_png1');
    assert.equal(noMembership.status, 404);

    /* unknown id on a real workspace → 404 fileNotFound */
    const unknownId = await fileFetch(server, admin.client.cookie(), '/w/acme/file/f_missing');
    assert.equal(unknownId.status, 404);
    assert.equal((await unknownId.json()).code, 'fileNotFound');

    /* unknown workspace slug → 404 (code workspaceNotFound, no record probe) */
    const unknownWs = await fileFetch(server, admin.client.cookie(), '/w/nope-ws/file/f_png1');
    assert.equal(unknownWs.status, 404);
  } finally {
    await server.stop();
  }
});

test('D-06 header policy: svg serves attachment/octet-stream, png serves inline/image/png (UPLOAD-04)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    await plantFile(server, admin, 'f_svg1', 'drawing.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    await plantFile(server, admin, 'f_png2', 'pic.png', Buffer.from('png-bytes'));

    const svg = await fileFetch(server, admin.client.cookie(), '/w/acme/file/f_svg1');
    assert.equal(svg.status, 200);
    assert.equal(svg.headers.get('content-type'), 'application/octet-stream');
    assert.ok(svg.headers.get('content-disposition').startsWith('attachment'), 'svg must download, never render');
    assert.equal(svg.headers.get('x-content-type-options'), 'nosniff');

    const png = await fileFetch(server, admin.client.cookie(), '/w/acme/file/f_png2');
    assert.equal(png.status, 200);
    assert.equal(png.headers.get('content-type'), 'image/png');
    assert.ok(png.headers.get('content-disposition').startsWith('inline'));
    assert.equal(png.headers.get('x-frame-options'), null, 'inline previews must not carry X-Frame-Options: DENY');

    /* T-12-08: a hostile record name cannot split or inject the header */
    await plantFile(server, admin, 'f_evil', 'bad"\r\ninjected: 1.png', Buffer.from('x'));
    const evil = await fileFetch(server, admin.client.cookie(), '/w/acme/file/f_evil');
    assert.equal(evil.status, 200);
    /* T-12-08 strips CR/LF/quotes/control chars from the value (spaces and
       colons are legal inside the quoted filename) — the header stays one
       line with the delimiting quotes only, and no injected header exists. */
    assert.equal(evil.headers.get('content-disposition'), `inline; filename="badinjected: 1.png"; filename*=UTF-8''badinjected%3A%201.png`);
    assert.equal(evil.headers.get('injected'), null);
  } finally {
    await server.stop();
  }
});

/* D-13 (revised, plan 12-05): /w/:slug/file/:id is a byte-only route — text/html
   navigations (the old SPA-branch trigger, and what iframe navigations send)
   receive the D-06-governed bytes, never the SPA shell with its X-Frame-Options
   DENY. That holds for inline types under both navigation markers, and for
   attachment types (Always octet-stream + Content-Disposition: attachment). */
test('byte-only file route: Accept: text/html and Sec-Fetch-Dest: document receive the bytes, never the SPA (G-12-1)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const bytes = Buffer.from('negotiation-png-bytes');
    await plantFile(server, admin, 'f_png4', 'nav.png', bytes);
    await plantFile(server, admin, 'f_bin1', 'archive.bin', Buffer.from('archive-bytes'));

    /* Accept: text/html — exactly what Chromium sends on the preview modal's
       iframe navigation and on a top-level paste: the inline PNG bytes, the
       inline disposition, and NO X-Frame-Options of any value. */
    const html = await fileFetch(server, admin.client.cookie(), '/w/acme/file/f_png4', { accept: 'text/html' });
    assert.equal(html.status, 200);
    assert.equal(html.headers.get('content-type'), 'image/png');
    assert.ok(html.headers.get('content-disposition').startsWith('inline'));
    assert.deepEqual(Buffer.from(await html.arrayBuffer()), bytes);
    assert.equal(html.headers.get('x-frame-options'), null, 'inline responses must never carry X-Frame-Options');

    /* Sec-Fetch-Dest: document — a real top-level navigation marker — gets the
       same byte answer (the route does not read fetch-metadata). */
    const doc = await fileFetch(server, admin.client.cookie(), '/w/acme/file/f_png4', {
      accept: 'text/html',
      'sec-fetch-dest': 'document',
    });
    assert.equal(doc.status, 200);
    assert.equal(doc.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await doc.arrayBuffer()), bytes);
    assert.equal(doc.headers.get('x-frame-options'), null);

    /* Attachment type under the same navigation Accept: attachment +
       octet-stream per D-06, so a pasted attachment URL downloads. */
    const bin = await fileFetch(server, admin.client.cookie(), '/w/acme/file/f_bin1', { accept: 'text/html' });
    assert.equal(bin.status, 200);
    assert.ok(bin.headers.get('content-disposition').startsWith('attachment'));
    assert.equal(bin.headers.get('content-type'), 'application/octet-stream');
  } finally {
    await server.stop();
  }
});

test('doc-PUT removing a file record unlinks its binary in the same mutation, idempotently (UPLOAD-05)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    await plantFile(server, admin, 'f_keep', 'kept.png', Buffer.from('keep-me'));
    await plantFile(server, admin, 'f_drop', 'dropped.png', Buffer.from('drop-me'));
    /* a binary on disk with NO record must never be swept (strict same-PUT diff) */
    fs.writeFileSync(path.join(server.dataDir, 'files', 'f_orphan'), Buffer.from('no record'));
    const filesDir = path.join(server.dataDir, 'files');

    const res = await putDoc(admin, doc => {
      doc.data.files = doc.data.files.filter(f => f.id !== 'f_drop');
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const after = fs.readdirSync(filesDir).sort();
    assert.ok(after.includes('f_keep') && after.includes('f_orphan'), `after: ${after}`);
    assert.ok(!after.includes('f_drop'), 'the removed record binary must be unlinked');

    /* idempotent: a repeat doc-PUT with the same doc does not throw or touch the rest */
    const again = await putDoc(admin, doc => {
      doc.data.files = doc.data.files.filter(f => f.id !== 'f_drop');
    });
    assert.equal(again.status, 200, JSON.stringify(again.data));
    const still = fs.readdirSync(filesDir).sort();
    assert.deepEqual(still, after);
  } finally {
    await server.stop();
  }
});

test('uploads are gated: unauthenticated callers get 401 and viewers get 403 readOnlyAccess', async () => {
  const server = await startServer({ env: { MAX_UPLOAD_MB: '25' } });
  try {
    /* an unauthenticated POST is rejected before anything is stored */
    const anon = await uploadFetch(server, '', Buffer.from('no cookies'));
    assert.equal(anon.status, 401);
    assert.equal((await anon.json()).code, 'signInRequired');

    /* a read-only member cannot upload either (D-05 / no-oracle rule intact) */
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const invite = await admin.client.post('/api/workspaces/acme/invites', { emails: ['viewer@test.local'], role: 'Viewer' });
    assert.equal(invite.status, 201);
    const accepted = await client(server.base, 'viewer').post(
      `/api/invites/${encodeURIComponent(inviteToken(invite.data.invites[0].url))}/accept`,
      { name: 'Viewer', email: 'viewer@test.local', password: 'password-1234' },
    );
    assert.equal(accepted.status, 201);
    const viewer = await login(server.base, 'viewer@test.local', 'password-1234');
    const res = await uploadFetch(server, viewer.client.cookie(), Buffer.from('viewer bytes'));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'readOnlyAccess');
    assert.deepEqual(fs.readdirSync(path.join(server.dataDir, 'files')), []);
  } finally {
    await server.stop();
  }
});
