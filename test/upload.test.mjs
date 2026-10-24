/* Real file uploads (Phase 12): the raw-body upload endpoint at
   POST /w/:slug/files stores exact bytes flat under DATA_DIR/files/<id>
   behind sameOrigin + member auth, and rejects oversize uploads mid-stream
   with 413 and the stable uploadTooLarge code. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, client, inviteToken, login, signup, startServer } from './helpers/server.mjs';

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
