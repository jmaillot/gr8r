#!/usr/bin/env node
/* =====================================================================
   scripts: copy-sqlite-to-pg — the one-shot SQLite → Postgres copy.

   Phase 45, D-12/D-13/D-14. It exists so an operator can move a real
   install: stop the server, run this script against the SQLite file,
   boot the next start with DB_URL=postgres://… — the SQLite file stays
   on disk untouched as the rollback artifact.

   Guarantees (each pinned by test/copy-sqlite-to-pg.test.mjs):
     1. REFUSE — the target must be empty. Every table is counted first;
        any nonzero count prints the per-table numbers and exits 1
        without writing a row (D-13).
     2. VERIFY — all rows transfer in dependency order inside ONE
        transaction on a checked-out pg client, and the pg per-table
        count must equal the SQLite count BEFORE the commit; a mismatch
        rolls the whole copy back (D-13).
     3. IMMUTABLE — the source file is opened with node:sqlite and only
        ever read: no write statement is ever issued against it (D-14).

   Secrets: the script never prints DB_URL or any connection detail —
   output carries table names and counts only (T-45-09).

   Schema is NOT duplicated here: the target is created by the
   pgSchemaVariant() export of db-adapter.mjs, the same variant the
   server's runSchema() executes on a pg boot (Plan 05).

   Plain Node plus `pg` (the Phase 45 conditional dependency). Only
   node:sqlite, node:fs and node:path among the built-ins.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/* The 14 server.js SCHEMA tables in DEPENDENCY order — users and
   workspaces first (everything FK-references them), claim tables last.
   This list is the contract D-13 names; test/db-adapter.test.mjs pins
   the SCHEMA table set, and the contract test asserts this list
   matches it. */
const TABLES = Object.freeze([
  'users',
  'workspaces',
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
]);

function usage(code) {
  console.error(`usage: node scripts/copy-sqlite-to-pg.mjs <path-to-projects.db>

Copies every row of a Projects Studio SQLite database into the
Postgres database named by the DB_URL environment variable.

  1. stop the server (the SQLite WAL must be checkpointed)
  2. set DB_URL to the Postgres connection string, then run this script with the SQLite file as the only argument
  3. keep projects.db on disk — it is the rollback backup
  4. boot the server with DB_URL set

The target must be empty; a non-empty target aborts without writing.
The source file is only ever read, never modified.`);
  process.exit(code);
}

const [sourceArg] = process.argv.slice(2);
if (!sourceArg) usage(1);
const sourcePath = path.resolve(sourceArg);
if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
  console.error(`copy-sqlite-to-pg: source file not found: ${sourcePath}`);
  usage(1);
}

const dbUrl = process.env.DB_URL;
if (!dbUrl || !dbUrl.startsWith('postgres://')) {
  console.error('copy-sqlite-to-pg: set DB_URL to a postgres:// URL to name the copy target');
  usage(1);
}

/* (1) Open the source READ-ONLY. `new DatabaseSync(path, { readOnly: true })`
   makes the immutability guarantee (D-14) structural rather than
   behavioral: any accidental write statement would fail at the driver.
   node:sqlite recovers/reads the WAL sidecars transparently on open. */
const src = new DatabaseSync(sourcePath, { readOnly: true });

/* Value mapping (RESEARCH A4): every column of every table is integer or
   text — there is no blob branch because there is no blob. A value
   outside { null, number, string } fails LOUDLY here instead of silently
   corrupting data in transit. */
function mapValue(table, column, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value); // integer → number
  if (typeof value === 'string') return value; // text (JSON docs, prefs) unchanged (D-11)
  console.error(`copy-sqlite-to-pg: unsupported value type in ${table}.${column}: ${typeof value} — refusing (no blob columns exist per RESEARCH A4)`);
  process.exit(1);
}

/* (2) Create the target schema using the shared pg variant — imported,
   NEVER duplicated (Plan 05 contract: db-adapter.mjs pgSchemaVariant is
   the single owner of the pg dialect schema). */
const { Pool } = await import('pg');
const { pgSchemaVariant } = await import(path.join(REPO_ROOT, 'db-adapter.mjs'));
const pool = new Pool({ connectionString: dbUrl, max: 2 });

/* Apply the variant to the (empty) target — same statement split as the
   adapter's runSchema(). */
for (const stmt of pgSchemaVariant().split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) {
  await pool.query(stmt);
}

/* (3) Refuse a non-empty target BEFORE writing anything (D-13). */
const preCounts = {};
for (const table of TABLES) {
  const { rows } = await pool.query(`select count(*)::bigint as n from ${table}`);
  preCounts[table] = Number(rows[0].n);
}
const occupied = TABLES.filter(t => preCounts[t] > 0);
if (occupied.length) {
  for (const table of occupied) console.error(`  ${table}: ${preCounts[table]} row(s)`);
  console.error('refusing — target non-empty (D-13)');
  await pool.end();
  src.close();
  process.exit(1);
}

const client = await pool.connect();
let failure = null;
try {
  await client.query('begin');
  const counts = {};
  /* The source may carry legacy columns added by boot migrations (e.g.
     memberships.team/scope) that the pg variant does not create — copy the
     INTERSECTION of source and target columns so the insert always matches
     the target table. */
  const { rows: pgColRows } = await pool.query(
    `select table_name, column_name from information_schema.columns where table_schema = current_schema()`,
  );
  const pgCols = new Map();
  for (const { table_name, column_name } of pgColRows) {
    if (!pgCols.has(table_name)) pgCols.set(table_name, new Set());
    pgCols.get(table_name).add(column_name);
  }
  for (const table of TABLES) {
    const cols = src
      .prepare(`pragma table_info(${table})`)
      .all()
      .map(c => c.name)
      .filter(name => pgCols.get(table)?.has(name));
    if (!cols.length) throw new Error(`no shared columns found for ${table} — schema mismatch`);
    const rows = src.prepare(`select * from ${table}`).all();
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const insert = `insert into ${table} (${cols.join(', ')}) values (${placeholders})`;
    for (const row of rows) {
      await client.query(insert, cols.map(name => mapValue(table, name, row[name])));
    }
    counts[table] = rows.length;
  }

  /* (5) Per-table count verification BEFORE commit: pg must equal
     SQLite on all 14 tables; any mismatch rolls the ENTIRE copy back
     and exits 1 naming the offending table (D-13). */
  const mismatches = [];
  for (const table of TABLES) {
    const { rows } = await client.query(`select count(*)::bigint as n from ${table}`);
    if (Number(rows[0].n) !== counts[table]) mismatches.push(`${table}: pg=${rows[0].n} sqlite=${counts[table]}`);
  }
  if (mismatches.length) {
    await client.query('rollback');
    failure = `count verification failed — ROLLED BACK, nothing committed\n  ${mismatches.join('\n  ')}`;
  } else {
    await client.query('commit');

    /* (6) Completion summary — table names and counts only. NEVER print
       DB_URL or any connection detail (T-45-09). */
    console.log('copy-sqlite-to-pg: committed. rows per table:');
    let total = 0;
    for (const table of TABLES) {
      console.log(`  ${table}: ${counts[table]}`);
      total += counts[table];
    }
    console.log(`copy-sqlite-to-pg: ${total} row(s) across ${TABLES.length} tables. Keep the SQLite file on disk as the rollback backup (D-14).`);
  }
} catch (err) {
  try {
    await client.query('rollback');
  } catch {
    /* the transaction may already be aborted by pg — nothing left to undo */
  }
  failure = `failed, ROLLED BACK, nothing committed — ${err.message}`;
} finally {
  client.release(); // release BEFORE pool.end() — end() waits on checked-out clients
}
await pool.end();
src.close();
if (failure) {
  console.error(`copy-sqlite-to-pg: ${failure}`);
  process.exit(1);
}
process.exit(0);
