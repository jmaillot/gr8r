/* Phase 45 (D-05/D-06/D-10) — permanent static audit over server.js.
   The phase's completion gate, pinned as a test so a regression can never
   silently reintroduce a sync db call:
     (a) zero db.prepare / db.exec sites (the facade has no sync passthrough);
     (b) zero un-awaited facade calls (db.get/all/run/tx always awaited or
         returned — a raw Promise value in a conditional is the exact bug the
         Plan-03 await-hygiene wave gate existed to catch);
     (c) no NEW `collate nocase` outside the SCHEMA legacy DDL (D-10: the
         adapter's rewrite owns the dialect; callsites stay portable);
     (d) no `rowid` outside the gated legacy backfill (the invites.team →
         teams[] migration is its last reader, never ported to pg).
   Source-text scan only — no server boot, no I/O beyond reading server.js,
   so the whole suite stays far under the 120s feedback budget. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const src = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'server.js'), 'utf8');
const lineOf = index => src.slice(0, index).split('\n').length;

test('zero db.prepare / db.exec sites remain in server.js (D-05)', () => {
  const matches = [...src.matchAll(/(^|[^.a-zA-Z_.])db\.(prepare|exec)\(/g)];
  assert.equal(matches.length, 0, `sync prepare/exec sites remain at lines ${matches.map(m => lineOf(m.index)).join(', ')}`);
});

test('every db.get/all/run/tx facade call is awaited or returned (D-05)', () => {
  /* Comments are stripped first — they routinely mention db.tx() — then each
     call's collapsed prefix must end in `await` or `return`. `//` is only
     treated as a comment when not preceded by `:` (http:// URLs stay intact). */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const offenders = [];
  const re = /db\.(get|all|run|tx)\(/g;
  let m;
  while ((m = re.exec(code))) {
    const prefix = code.slice(0, m.index).replace(/\s+/g, ' ');
    if (!/(await|return) $/.test(prefix)) offenders.push(`${m[0]} at line ${lineOf(m.index)}`);
  }
  assert.equal(offenders.length, 0, `un-awaited facade calls:\n${offenders.join('\n')}`);
});

test('collate nocase stays frozen at the seven sanctioned query sites (D-10 — no NEW nocase)', () => {
  /* The SCHEMA template literal (legacy DDL, kept verbatim for SQLite) plus
     seven pinned query callsites are the only sanctioned homes of
     `collate nocase`; the adapter's toPgSql rewrite owns the dialect. The
     count is frozen: any NEW nocase site must fail this test so the pg
     rewrite surface never grows silently. */
  const start = src.indexOf('const SCHEMA');
  assert.ok(start !== -1, 'SCHEMA constant must exist');
  const schemaEnd = src.indexOf('`;', start);
  assert.ok(schemaEnd !== -1, 'SCHEMA template terminator must exist');
  const tail = src.slice(schemaEnd + 2);
  const matches = [...tail.matchAll(/collate\s+nocase/gi)];
  assert.equal(
    matches.length,
    7,
    `collate nocase count drifted (expected 7 pinned query sites): lines ${matches.map(m => lineOf(schemaEnd + 2 + m.index)).join(', ')}`,
  );
});

test('no rowid outside the gated legacy invites backfill (D-10)', () => {
  /* The backfillInvites loop (`select rowid, team from invites …`) is the
     single sanctioned rowid consumer — a SQLite-only legacy migration that is
     never ported to pg. Any other rowid use would break the pg backend. */
  const anchor = src.indexOf("'select rowid, team from invites where team is not null and teams is null'");
  assert.ok(anchor !== -1, 'the sanctioned invites-backfill rowid select must exist');
  const anchorLine = lineOf(anchor);
  const offenders = [...src.matchAll(/\browid\b/g)].filter(m => {
    const line = lineOf(m.index);
    return line < anchorLine - 4 || line > anchorLine + 4;
  });
  assert.equal(offenders.length, 0, `rowid outside the gated invites backfill at lines ${offenders.map(m => lineOf(m.index)).join(', ')}`);
});
