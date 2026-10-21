/* The test harness must never open a database outside its own temporary data
   directory, even when the developer or the CI runner exports DB_PATH. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { startServer } from './helpers/server.mjs';

const ambient = path.join(os.tmpdir(), `gr8r-ambient-${process.pid}-${Date.now()}.db`);

after(() => {
  fs.rmSync(ambient, { force: true });
});

test('an ambient DB_PATH cannot redirect the harness outside its data directory', async () => {
  const server = await startServer({ env: { DB_PATH: ambient } });
  try {
    assert.equal(server.dbPath, path.join(server.dataDir, 'gr8r.db'), 'the harness reports the database it actually creates');
    assert.equal(fs.existsSync(server.dbPath), true, 'the database is created inside the temporary data directory');
    assert.equal(fs.existsSync(ambient), false, 'the ambient DB_PATH is ignored');
  } finally {
    await server.stop();
  }
});
