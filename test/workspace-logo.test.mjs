/* =====================================================================
   Workspace logo routes (Phase 43, LOGO-01): pins the server-side
   upload → store → public-serve contract —

   - POST /w/:slug/logo is Owner/Admin gated (sameOrigin → admin gate)
   - GET /w/:slug/logo is PUBLIC and session-free (D-02): fixed mime from
     the server-verified stored ext, nosniff, immutable cache, sandbox CSP
     on svg — and must be intercepted BEFORE the SPA fallback (Pitfall 1,
     the file-route-ordering regression class)
   - unknown slug / unset logo → identical 404, never a 302 (D-10)
   - non-image bodies → 400 invalidLogo (magic bytes, Pitfall 7)
   - POST/DELETE responses carry the fresh revision (Pitfall 2)
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, client, inviteToken, login, startServer } from './helpers/server.mjs';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SVG_BYTES = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
const HTML_BYTES = Buffer.from('<!DOCTYPE html><html><body>not an image</body></html>');

/* Raw-body POST like the settings page XHR: no JSON, no ?name= params. */
function postLogo(base, cookie, bytes, extraHeaders = {}) {
  return fetch(`${base}/w/acme/logo`, {
    method: 'POST',
    headers: { ...(cookie ? { cookie } : {}), ...extraHeaders },
    body: bytes,
  });
}

/* Sign a second account up as a workspace member via invite + accept. */
async function inviteMember(server, admin) {
  const inv = await admin.client.post('/api/workspaces/acme/invites', { emails: ['mate@test.local'], role: 'member' });
  assert.equal(inv.status, 201, `invite failed: ${JSON.stringify(inv.data)}`);
  const accepted = await client(server.base, 'mate').post(
    `/api/invites/${encodeURIComponent(inviteToken(inv.data.invites[0].url))}/accept`,
    { name: 'Mate', email: 'mate@test.local', password: 'password-1234' },
  );
  assert.equal(accepted.status, 201);
  return login(server.base, 'mate@test.local', 'password-1234');
}

test('admin upload → public no-cookie GET with fixed mime, immutable cache, payload logo field (D-02/D-03/D-11)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    assert.equal(admin.status, 200);

    const up = await postLogo(server.base, admin.client.cookie(), PNG_BYTES);
    assert.equal(up.status, 200);
    const upBody = await up.json();
    assert.ok(upBody.revision !== undefined, 'POST response carries the fresh revision (Pitfall 2)');
    assert.equal(upBody.logo.ext, 'png');
    assert.match(upBody.logo.url, /^\/w\/acme\/logo\?v=\d+$/);

    /* workspacePayload exposes the versioned URL (D-11). */
    const ws = await admin.client.get('/api/workspaces/acme');
    assert.equal(ws.status, 200);
    assert.equal(ws.data.logo.url, upBody.logo.url);
    assert.equal(ws.data.logo.ext, 'png');

    /* Public GET with NO cookie — the SPA-fallback regression assertion. */
    const res = await fetch(`${server.base}/w/acme/logo`);
    assert.equal(res.status, 200);
    assert.notEqual(res.headers.get('content-type'), 'text/html', 'the logo GET fell into the SPA fallback');
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG_BYTES);

    /* The ?v= param is ignored for lookup (D-11). */
    const versioned = await fetch(`${server.base}${upBody.logo.url}`);
    assert.equal(versioned.status, 200);
  } finally {
    await server.stop();
  }
});

test('member POST is rejected 403 adminOnly (D-01 role gate)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const member = await inviteMember(server, admin);
    const res = await postLogo(server.base, member.client.cookie(), PNG_BYTES);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'adminOnly');
  } finally {
    await server.stop();
  }
});

test('cross-origin POST is rejected 403 before the body read', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const res = await postLogo(server.base, admin.client.cookie(), PNG_BYTES, { origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'crossOriginRejected');
  } finally {
    await server.stop();
  }
});

test('an html body is rejected 400 invalidLogo — no client-mime trust (Pitfall 7)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const res = await postLogo(server.base, admin.client.cookie(), HTML_BYTES);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'invalidLogo');
    /* nothing stranded on disk */
    assert.deepEqual(fs.readdirSync(path.join(server.dataDir, 'logos')), []);
  } finally {
    await server.stop();
  }
});

test('GET before any upload and GET unknown slug both 404 — never a 3xx redirect (D-10)', async () => {
  const server = await startServer({});
  try {
    const unset = await fetch(`${server.base}/w/acme/logo`, { redirect: 'manual' });
    assert.equal(unset.status, 404);
    const unknown = await fetch(`${server.base}/w/does-not-exist/logo`, { redirect: 'manual' });
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).code, 'logoNotFound');
  } finally {
    await server.stop();
  }
});

test('svg upload serves image/svg+xml with the sandbox CSP header (D-03/T-43-02)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const up = await postLogo(server.base, admin.client.cookie(), SVG_BYTES);
    assert.equal(up.status, 200);
    const res = await fetch(`${server.base}/w/acme/logo`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/svg+xml');
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    assert.equal((await res.text()).includes('<svg'), true);
  } finally {
    await server.stop();
  }
});

test('the stored logo survives a server restart (SC-1)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-logo-restart-'));
  try {
    const first = await startServer({ dataDir: dir });
    const admin = await login(first.base, ADMIN.email, ADMIN.password);
    const up = await postLogo(first.base, admin.client.cookie(), PNG_BYTES);
    assert.equal(up.status, 200);
    await first.stop(); // owned=false: the explicit dataDir is kept

    const second = await startServer({ dataDir: dir });
    try {
      const res = await fetch(`${second.base}/w/acme/logo`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG_BYTES);
    } finally {
      await second.stop();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('workspace delete with no logo still works — cleanup is a no-op', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const res = await admin.client.del('/api/workspaces/acme');
    assert.equal(res.status, 200);
    assert.deepEqual(fs.readdirSync(path.join(server.dataDir, 'logos')), []);
  } finally {
    await server.stop();
  }
});

/* ------------------------- D-09 lifecycle (task 2) ------------------------ */

test('replacing the logo unlinks the previous file — exactly one file remains (D-09)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const a = await postLogo(server.base, admin.client.cookie(), PNG_BYTES);
    assert.equal(a.status, 200);
    const b = await postLogo(server.base, admin.client.cookie(), SVG_BYTES);
    assert.equal(b.status, 200);

    const logos = path.join(server.dataDir, 'logos');
    assert.equal(fs.readdirSync(logos).length, 1, `expected a single stored logo, got ${fs.readdirSync(logos).join(', ')}`);
    const res = await fetch(`${server.base}/w/acme/logo`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/svg+xml', 'the GET serves the replacement');
    /* the payload URL version-bumped (D-11) */
    const ws = await admin.client.get('/api/workspaces/acme');
    assert.notEqual(ws.data.logo.url, (await a.json()).logo.url);
  } finally {
    await server.stop();
  }
});

test('DELETE removes the stored file and the GET falls back to 404; response carries the revision', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const up = await postLogo(server.base, admin.client.cookie(), PNG_BYTES);
    assert.equal(up.status, 200);

    const logos = path.join(server.dataDir, 'logos');
    assert.equal(fs.readdirSync(logos).length, 1);

    const del = await fetch(`${server.base}/w/acme/logo`, { method: 'DELETE', headers: { cookie: admin.client.cookie() } });
    assert.equal(del.status, 200);
    const delBody = await del.json();
    assert.equal(delBody.ok, true);
    assert.ok(delBody.revision !== undefined, 'DELETE response carries the fresh revision (Pitfall 2)');

    assert.deepEqual(fs.readdirSync(logos), [], 'the stored file is unlinked from disk (D-09)');
    const res = await fetch(`${server.base}/w/acme/logo`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, 'logoNotFound');

    /* DELETE when no logo is set → 404, not a silent 200. */
    const again = await fetch(`${server.base}/w/acme/logo`, { method: 'DELETE', headers: { cookie: admin.client.cookie() } });
    assert.equal(again.status, 404);
    assert.equal((await again.json()).code, 'logoNotFound');
  } finally {
    await server.stop();
  }
});

test('deleting the workspace unlinks its logo file — no orphan (D-09/A4)', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const up = await postLogo(server.base, admin.client.cookie(), PNG_BYTES);
    assert.equal(up.status, 200);
    assert.equal(fs.readdirSync(path.join(server.dataDir, 'logos')).length, 1);

    const del = await admin.client.del('/api/workspaces/acme');
    assert.equal(del.status, 200);
    assert.deepEqual(fs.readdirSync(path.join(server.dataDir, 'logos')), [], 'workspace delete leaves zero logo files behind');
  } finally {
    await server.stop();
  }
});
