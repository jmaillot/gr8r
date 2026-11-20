/* Creation gate suite (Phase 78, WSG-01/02/03/05/06). Proves the single path
   from the WORKSPACE_CREATION env token to boot-refuse / boot-log / the
   POST /api/workspaces gate / the /api/config boolean, plus the operator
   promote/demote identity endpoints. Pattern: startServer-per-case with env
   overrides, server.output() grep for boot lines, await server.stop() in
   finally (domain-admission.test.mjs precedent). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startServer } from './helpers/server.mjs';

/* ---------- scaffold (Task 1) — replaced by the full matrix in Task 2 ---------- */

test('scaffold: the harness boots a server with the shielded gate', async () => {
  const server = await startServer({});
  try {
    const res = await fetch(`${server.base}/api/config`);
    assert.equal(res.status, 200);
  } finally {
    await server.stop();
  }
});
