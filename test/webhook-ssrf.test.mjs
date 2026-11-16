/* SSRF guard suite (Phase 67, WHK-05 / T-67-01). Zero network: the DNS
   lookup is injected (fake resolver), so every case is a pure deny-list
   assertion. Fail-closed contract: refusals and lookup errors both return
   { ok:false, reason } — never a throw. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ssrfOk, pinnedFetch } from '../webhook-ssrf.js';

/* Fake dns.lookup({all:true}) — returns [{ address, family }] entries. */
const resolve = ips => async () => ips.map(a => ({ address: a, family: a.includes(':') ? 6 : 4 }));

const LOOKUP_OK = resolve(['20.42.0.1']);

test('https URL over a public IP passes — the verdict carries the VERIFIED address set (WR-01 pinned-fetch handoff)', async () => {
  const r = await ssrfOk('https://out.logic.azure.com/workflows/x', { lookup: LOOKUP_OK });
  assert.deepEqual(r, { ok: true, addresses: ['20.42.0.1'] });
});

test('http:// is refused — https-only (WHK-05)', async () => {
  const r = await ssrfOk('http://out.logic.azure.com/workflows/x', { lookup: LOOKUP_OK });
  assert.equal(r.ok, false);
  assert.ok(r.reason);
});

test('IPv4 deny-list: loopback, RFC1918, link-local, 0/8', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.5.5', '169.254.1.1', '0.0.0.1']) {
    const r = await ssrfOk('https://host.example/hook', { lookup: resolve([ip]) });
    assert.equal(r.ok, false, `IP ${ip} must be denied`);
  }
});

test('172.32.0.1 passes — one step outside the 172.16/12 boundary', async () => {
  const r = await ssrfOk('https://host.example/hook', { lookup: resolve(['172.32.0.1']) });
  assert.equal(r.ok, true);
});

test('172.15.255.255 passes — one step below the 172.16/12 lower edge (block spans 172.16.0.0–172.31.255.255)', async () => {
  const r = await ssrfOk('https://host.example/hook', { lookup: resolve(['172.15.255.255']) });
  assert.equal(r.ok, true);
});

test('IPv6 deny-list: ::1, unspecified, link-local, unique-local', async () => {
  for (const ip of ['::1', '::', 'fe80::1', 'fd00::1']) {
    const r = await ssrfOk('https://host.example/hook', { lookup: resolve([ip]) });
    assert.equal(r.ok, false, `IP ${ip} must be denied`);
  }
});

test('multi-IP host: ANY denied IP blocks the whole URL (WHK-05 adjacency)', async () => {
  const r = await ssrfOk('https://host.example/hook', { lookup: resolve(['20.42.0.1', '10.1.2.3']) });
  assert.equal(r.ok, false);
});

test('fail-closed: lookup errors return ok:false, never throw', async () => {
  const r = await ssrfOk('https://host.example/hook', { lookup: async () => { throw new Error('ENODATA'); } });
  assert.equal(r.ok, false);
  assert.ok(r.reason);
});

test('unparseable URL is refused', async () => {
  const r = await ssrfOk('not-a-url', { lookup: LOOKUP_OK });
  assert.equal(r.ok, false);
});

/* ---- WR-01 fix (v2.4 audit): pinnedFetch — the connect resolves the
   hostname THROUGH the guard-validated set, closing the within-attempt
   rebinding window. request is injected: zero network. ---- */

test('pinnedFetch fail-closed: no pinned addresses or non-https URL reject without connecting', async () => {
  await assert.rejects(() => pinnedFetch('https://host.example/hook', { addresses: [] }), /no pinned addresses/);
  await assert.rejects(() => pinnedFetch('http://host.example/hook', { addresses: ['20.42.0.1'] }), /https-only/);
});

test('pinnedFetch pins the TLS connect to the validated set: the lookup yields ONLY validated IPs, servername keeps the cert host', async () => {
  const seen = {};
  const fakeRes = { statusCode: 200, headers: { 'retry-after': '7' }, on(ev, fn) { if (ev === 'end') process.nextTick(fn); } };
  const requestImpl = (url, opts, cb) => {
    seen.url = url;
    seen.servername = opts.servername;
    /* the pinned lookup is exercised in place — a rebinding flip of the
       real DNS can never reach it: it returns the validated set, always */
    opts.lookup('whatever-dns-says.example', {}, (err, addr) => { seen.resolved = err ? null : addr; });
    process.nextTick(() => cb(fakeRes));
    return { on() {}, write() {}, end() {}, destroy() {} };
  };
  const r = await pinnedFetch('https://host.example/hook', { addresses: ['20.42.0.1'], method: 'POST', body: '{}', request: requestImpl });
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('retry-after'), '7');
  assert.equal(seen.url, 'https://host.example/hook');
  assert.equal(seen.servername, 'host.example', 'SNI/cert validation stays on the real hostname');
  assert.equal(seen.resolved, '20.42.0.1', 'the connect resolves through the validated set, never live DNS');
});

test('pinnedFetch surfaces transport errors and honors an already-aborted signal', async () => {
  const requestImpl = (url, opts, cb) => ({ on() {}, write() {}, end() {}, destroy() {} });
  await assert.rejects(
    () => pinnedFetch('https://host.example/hook', { addresses: ['20.42.0.1'], request: () => { throw new Error('ECONNREFUSED'); } }),
    /ECONNREFUSED/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => pinnedFetch('https://host.example/hook', { addresses: ['20.42.0.1'], signal: controller.signal, request: requestImpl }),
    /aborted/,
  );
});
