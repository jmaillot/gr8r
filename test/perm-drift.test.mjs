/* [2026-11-09 IN-01 drift guard] The permission tier ladder is one contract
   stated twice — the server's PROJECT_PERMS (server.js, the gate + merge
   normalizer) and the client's PERMS (src/overlays/modals.js, the dropdown
   and permLabel keys). A re-order or re-wording on either side alone would
   silently change every indexOf comparison on that side. Both literals are
   extracted from source and compared for byte-identity, including order. */
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const serverSrc = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const modalsSrc = readFileSync(new URL('../src/overlays/modals.js', import.meta.url), 'utf8');

const extract = (src, name) => {
  const m = src.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]+)\\]`));
  assert.ok(m, `${name} literal not found — the extraction moved`);
  return m[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
};

test('the permission tier ladder is byte-identical on both sides (IN-01 drift guard)', () => {
  const server = extract(serverSrc, 'PROJECT_PERMS');
  const client = extract(modalsSrc, 'PERMS');
  assert.deepEqual(client, server, 'PERMS (client) drifted from PROJECT_PERMS (server)');
  assert.equal(server[0], 'Can view', 'tier 0 stays the lowest (view)');
  assert.equal(server.at(-1), 'Full access', 'the top tier stays last (the indexOf ladder depends on it)');
});
