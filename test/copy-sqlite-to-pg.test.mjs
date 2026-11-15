/* Contract tests for scripts/copy-sqlite-to-pg.mjs (Phase 45, D-12/D-13/D-14).
   POSTGRES_TEST_URL-gated (D-08 style): with the variable unset every test
   reports skipped and the file exits 0 — zero CI dependency. Point the
   variable at an ephemeral Postgres (docker run -d -p 5432:5432 -e
   POSTGRES_PASSWORD=… postgres:17-alpine) to run the real contract.

   Pinned contract:
     (a) refuse-non-empty — a populated target aborts with exit 1 and the
         D-13 refusal string, writing nothing;
     (b) happy path — a real server-created SQLite file transfers with
         per-table pg counts equal to the source counts, exit 0, the
         workspace JSON doc preserved verbatim (D-11), including a sparse
         user_notif_prefs row (PROJECT.md Phase 34);
     (c) source immutability — the source file's SHA-256 is byte-identical
         before and after every run (D-14);
     (d) no-secret-leak — child stdout/stderr never contain the connection
         string (T-45-09). */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as adapter from '../db-adapter.mjs';
import { foldForSearch } from '../search-terms.mjs';
import { dropPgSchema, ROOT, startServer, withDb, withPg } from './helpers/server.mjs';

const PG_URL = process.env.POSTGRES_TEST_URL;
const maybe = PG_URL ? test : test.skip;

const TABLES = Object.freeze([
  'users',
  'workspaces',
  'api_keys', /* Phase 46 (MCP) — mirrored from scripts/copy-sqlite-to-pg.mjs */
  'totp_factors',
  'oidc_identities',
  'sessions',
  'login_challenges',
  'memberships',
  'team_members',
  'invites',
  'recovery_codes',
  'security_log',
  'audit_log',
  'reminders_sent',
  'user_notif_prefs',
  'webhook_hooks', /* Phase 67 (WHK-05) — mirror-table parity */
  'webhook_deliveries', /* Phase 67 (WHK-03) — mirror-table parity */
]);

/* Run the script as a real child process — the contract under test IS the CLI. */
function runCopy(dbPath, env = {}) {
  return new Promise(resolve => {
    const finalEnv = { ...process.env, DB_URL: PG_URL, ...env };
    for (const key of Object.keys(finalEnv)) if (finalEnv[key] === undefined) delete finalEnv[key];
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'copy-sqlite-to-pg.mjs'), dbPath], {
      env: finalEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (output += chunk));
    child.on('exit', code => resolve({ code, output }));
  });
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function pgCounts() {
  return withPg(PG_URL, async pool => {
    const counts = {};
    for (const table of TABLES) {
      const { rows } = await pool.query(`select count(*)::int as n from ${table}`);
      counts[table] = rows[0].n;
    }
    return counts;
  });
}

function sqliteCounts(dbPath) {
  return withDb(dbPath, db => {
    const counts = {};
    for (const table of TABLES) counts[table] = Number(db.prepare(`select count(*) as n from ${table}`).get().n);
    return counts;
  });
}

/* Build the source fixture by booting a REAL server (the tables, admin user,
   workspace, membership and team backfill come from boot, not from hand-written
   inserts), then enrich it with the two shapes the plan names: a sparse
   user_notif_prefs row and a workspace JSON document. The caller owns the
   directory and removes it. */
async function buildSource() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-sqlite-src-'));
  const server = await startServer({ dataDir: dir });
  await server.stop(); // explicit dataDir → the harness does NOT delete it
  const { dbPath } = server;
  withDb(dbPath, db => {
    const ws = db.prepare('select id from workspaces order by created_at limit 1').get();
    const user = db.prepare('select id from users order by created_at limit 1').get();
    // stored sparse prefs row (Phase 34 contract: rows are STORED, not merged views)
    db.prepare('insert into user_notif_prefs (workspace_id, user_id, prefs) values (?, ?, ?)').run(
      ws.id,
      user.id,
      JSON.stringify({ email_digest: true, mention: false }),
    );
    const doc = JSON.stringify({ name: 'Copy Contract', projects: [{ id: 'p1', title: 'Hello', tasks: [] }] });
    db.prepare('update workspaces set doc = ? where id = ?').run(doc, ws.id);
  });
  return { dbPath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

maybe('happy path: full transfer with per-table count parity, doc verbatim, exit 0', async () => {
  const { dbPath, cleanup } = await buildSource();
  try {
    await dropPgSchema(PG_URL);
    const { code, output } = await runCopy(dbPath);
    assert.equal(code, 0, `expected exit 0, got ${code}\n${output}`);
    assert.deepEqual(await pgCounts(), await sqliteCounts(dbPath), 'per-table pg counts must equal SQLite counts');
    const doc = JSON.stringify({ name: 'Copy Contract', projects: [{ id: 'p1', title: 'Hello', tasks: [] }] });
    await withPg(PG_URL, async pool => {
      const ws = (await pool.query('select doc from workspaces limit 1')).rows[0];
      assert.equal(ws.doc, doc, 'workspace JSON doc must transfer verbatim (D-11)');
      const prefs = (await pool.query('select prefs from user_notif_prefs')).rows;
      assert.equal(prefs.length, 1, 'sparse stored prefs row must transfer');
      assert.deepEqual(JSON.parse(prefs[0].prefs), { email_digest: true, mention: false });
    });
    assert.ok(output.includes('committed'), 'completion summary must be printed');
  } finally {
    cleanup();
  }
});

maybe('refuse-non-empty: populated target aborts exit 1 with the D-13 string', async () => {
  const { dbPath, cleanup } = await buildSource();
  try {
    // The happy-path test left the target populated; a second run must refuse.
    const { code, output } = await runCopy(dbPath);
    assert.equal(code, 1, `expected exit 1, got ${code}`);
    assert.ok(output.includes('refusing — target non-empty (D-13)'), `refusal string missing:\n${output}`);
    assert.ok(output.includes('workspaces: 1 row(s)'), 'per-table counts of the occupied target must be printed');
  } finally {
    cleanup();
  }
});

maybe('source immutability: source file hash is byte-identical after runs (D-14)', async () => {
  const { dbPath, cleanup } = await buildSource();
  try {
    const before = sha256(dbPath);
    await dropPgSchema(PG_URL);
    const first = await runCopy(dbPath);
    assert.equal(first.code, 0, `first run must succeed\n${first.output}`);
    const second = await runCopy(dbPath); // refusal run also touches the source (open)
    assert.equal(second.code, 1);
    assert.equal(sha256(dbPath), before, 'source file must be byte-identical after copy AND refusal runs');
  } finally {
    cleanup();
  }
});

maybe('no-secret-leak: child output never contains the connection string (T-45-09)', async () => {  const { dbPath, cleanup } = await buildSource();
  try {
    await dropPgSchema(PG_URL);
    const first = await runCopy(dbPath);
    const second = await runCopy(dbPath);
    for (const { output } of [first, second]) {
      assert.ok(!output.includes(PG_URL), 'connection string must never appear in script output');
      assert.ok(!output.includes('postgres://'), 'no DSN fragment may appear in script output');
    }
  } finally {
    cleanup();
  }
});

/* 65-05 (D-06): byte-identical folded index text across backends. The same
   two-level subtask fixture is synced through the adapter seam on SQLite and
   on pg; the pg `folded` column must equal the SQLite row's title/body
   composition byte for byte — the folded subtask-title suffix is computed
   ONCE per task in db-adapter and fed to both dialects (symmetry rule). */
maybe('FTS byte parity: identical folded text SQLite vs pg on a two-level subtask fixture (65-05, D-06)', async () => {
  const doc = {
    data: {
      tasks: [
        {
          id: 't_par',
          project: 'p1',
          title: 'Élodie fiche carte',
          desc: '<b>Livraison</b> rapide',
          status: 'todo',
          subtasks: [
            { id: 's1', parentId: null, position: 0, title: 'Dossier cartes 2026', done: false },
            { id: 's2', parentId: 's1', position: 0, title: 'Feuille Élodie', done: false },
            { id: 's3', parentId: null, position: 1, title: 'Autre racine', done: false },
          ],
        },
      ],
    },
  };

  /* SQLite side: real temp db through the adapter, read the raw row. */
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fts-parity-src-')), 'projects.db');
  await adapter.connectDb({ dbPath });
  assert.equal(adapter.backendKind, 'sqlite');
  await adapter.ensureSearchIndex();
  await adapter.tx(async scope => adapter.syncTaskFts(scope, 'ws-par', null, doc));
  const srow = withDb(dbPath, db => db.prepare('select title, body from task_fts where task_id = ?').get('t_par'));
  await adapter.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });

  /* pg side: same doc, same seam. */
  await adapter.connectDb({ dbUrl: PG_URL });
  assert.equal(adapter.backendKind, 'pg');
  await adapter.ensureSearchIndex();
  await adapter.run('delete from task_search_projection where workspace_id = ?', ['ws-par']);
  await adapter.run('delete from fts_meta where workspace_id = ?', ['ws-par']);
  await adapter.tx(async scope => adapter.syncTaskFts(scope, 'ws-par', null, doc));
  const prow = await adapter.get('select folded from task_search_projection where workspace_id = ? and task_id = ?', ['ws-par', 't_par']);
  await adapter.close();

  /* Byte-identical: pg folded === SQLite title + ' ' + body. */
  assert.equal(prow.folded, `${srow.title} ${srow.body}`, 'pg folded text must be byte-identical to the SQLite row composition');
  /* The subtask titles are IN the shared text, folded, in buildTree order. */
  assert.ok(prow.folded.includes('dossier cartes 2026'), 'depth-1 subtask title folded in');
  assert.ok(prow.folded.includes('feuille elodie'), 'depth-2 subtask title folded (accent folded)');
  assert.ok(prow.folded.indexOf('dossier cartes 2026') < prow.folded.indexOf('feuille elodie'), 'parent title precedes child');
  assert.ok(prow.folded.indexOf('feuille elodie') < prow.folded.indexOf('autre racine'), 'second root follows the first subtree');
  /* And nothing but folding changed the words. */
  const expectedSuffix = ['Dossier cartes 2026', 'Feuille Élodie', 'Autre racine'].map(x => foldForSearch(x).text).join(' ');
  assert.ok(prow.folded.endsWith(expectedSuffix), 'the folded suffix rides the body verbatim');
});
