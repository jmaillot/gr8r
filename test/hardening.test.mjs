/* Phase 33 Membership-Surface Hardening pins (HARD-01, HARD-04, HARD-05).

   Every test spawns its OWN server: the invite-accept throttle budget is
   `invite|ip` — 5 per hour per IP (Pitfall 2), and each spawned server owns a
   fresh database and budget.

   Accept-budget ledger per server (all link-only invites, member role):
   - "hostile origin" server ................. 0 accepts
   - "budget" server ......................... 1 accept (positive control)
   - TRUST_PROXY servers ..................... 0-1 accept each
   - "spoof" server .......................... 2 accepts (clean + spoofed) */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN, inviteToken, login, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'hardening-password-1';

/* Link-only member invite minted by the admin; returns the /join/<token> token. */
async function linkOnlyInvite(owner) {
  const [inv] = (await owner.post('/api/workspaces/acme/invites', { emails: [null], role: 'member' })).data.invites;
  return inviteToken(inv.url);
}

/* ---------- HARD-01 / D-08: sameOrigin guard FIRST on the accept route ---------- */

test('a hostile-Origin accept POST is rejected 403 crossOriginRejected with the byte-identical no-oracle body (HARD-01)', async () => {
  const server = await startServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const token = await linkOnlyInvite(owner);
    const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'Evil', email: 'evil@test.local', password: PASSWORD }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, 'crossOriginRejected');
    assert.equal(data.error, 'Cross-origin request rejected', 'the message is byte-identical to the other guard sites');
    assert.deepEqual(Object.keys(data).sort(), ['code', 'error'], 'no-oracle body: exactly {code, error}');
  } finally {
    await server.stop();
  }
});

test('the guard runs BEFORE the throttle: hostile probes consume no invite|ip budget and the Origin-less harness client still accepts (HARD-01/D-08 positive control)', async () => {
  const server = await startServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const token = await linkOnlyInvite(owner);

    // Six hostile-Origin probes — one more than the 5-per-hour invite|ip budget.
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ name: 'Evil', email: 'evil@test.local', password: PASSWORD }),
      });
      assert.equal(res.status, 403, `probe ${i} must be a guard 403, never a 429`);
    }

    // Positive control: the harness client sends NO Origin (Pitfall 3) and the
    // guard passes it; the accepts still succeed, proving the 403s consumed no
    // throttle budget.
    const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Clean', email: 'clean@test.local', password: PASSWORD }),
    });
    assert.ok([200, 201].includes(res.status), `the legit accept must succeed, got ${res.status}`);
  } finally {
    await server.stop();
  }
});
