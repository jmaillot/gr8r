/* SSRF guard suite (Phase 67, WHK-05 / T-67-01). Zero network: the DNS
   lookup is injected (fake resolver), so every case is a pure deny-list
   assertion. Fail-closed contract: refusals and lookup errors both return
   { ok:false, reason } — never a throw. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ssrfOk } from '../webhook-ssrf.js';

/* Fake dns.lookup({all:true}) — returns [{ address, family }] entries. */
const resolve = ips => async () => ips.map(a => ({ address: a, family: a.includes(':') ? 6 : 4 }));

const LOOKUP_OK = resolve(['20.42.0.1']);

test('https URL over a public IP passes', async () => {
  const r = await ssrfOk('https://out.logic.azure.com/workflows/x', { lookup: LOOKUP_OK });
  assert.deepEqual(r, { ok: true });
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

test('172.15.255.255 is denied — one step inside the 172.16/12 lower edge', async () => {
  const r = await ssrfOk('https://host.example/hook', { lookup: resolve(['172.15.255.255']) });
  assert.equal(r.ok, false);
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
