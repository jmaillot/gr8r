/* Phase 54 (54-01): the CSV writer — RFC 4180 quoting, BOM, formula
   neutralisation, round-trip encoding. Pure unit tests, no server. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildExportModel } from '../src/export/model.js';
import { toCsv } from '../src/export/csv.js';
import { makeDoc, makeEmptyProjectDoc } from './fixtures/export-fixtures.mjs';

const NOW = new Date(2026, 1, 1, 12, 0, 0);
const build = opts => buildExportModel(makeDoc(), 'p_alpha', opts || { scope: 'all' }, { translate: k => k, labelName: id => 'L:' + id, now: NOW });
const parseLines = csv => csv.replace(/^\uFEFF/, '').split('\r\n').filter(l => l !== '');

test('the first character is the UTF-8 BOM', () => {
  const csv = toCsv(build());
  assert.equal(csv.charCodeAt(0), 0xfeff);
});

test('the header equals the model column labels, ; separated (owner request 2026-11-10)', () => {
  const m = build();
  const header = parseLines(toCsv(m))[0];
  assert.equal(header, m.columns.map(c => c.label).join(';'));
});

test('a known task cell carries the member name, never the raw member id', () => {
  const csv = toCsv(build());
  const row = parseLines(csv).find(l => l.includes('Backlog idea'));
  assert.ok(row.includes('Pat Plain'));
  assert.equal(row.includes('m_plain'), false);
});

test('lines are CRLF-terminated and one row per exported task plus the header', () => {
  const m = build();
  const csv = toCsv(m);
  assert.ok(csv.endsWith('\r\n'));
  const lines = parseLines(csv);
  assert.equal(lines.length, m.rows.length + 1);
});

test('semicolon, comma, quote and newline quoting per RFC 4180', () => {
  const doc = makeDoc();
  doc.tasks.push(
    { id: 't_q1', project: 'p_alpha', key: 'Q-1', title: 'has, comma', status: 'todo', priority: 'none', assignees: [], labels: [], estimate: '', subtasks: [], deps: [], order: 200 },
    { id: 't_q2', project: 'p_alpha', key: 'Q-2', title: 'has "quote"', status: 'todo', priority: 'none', assignees: [], labels: [], estimate: '', subtasks: [], deps: [], order: 201 },
    { id: 't_q3', project: 'p_alpha', key: 'Q-3', title: 'has\nnewline', status: 'todo', priority: 'none', assignees: [], labels: [], estimate: '', subtasks: [], deps: [], order: 202 },
  );
  const csv = toCsv(buildExportModel(doc, 'p_alpha', { scope: 'all' }, { translate: k => k, labelName: i => i, now: NOW }));
  assert.ok(csv.includes('"has, comma"'), 'a comma is now a quotable character (the separator is ;) — the title contains a comma so it must be quoted');
  assert.ok(csv.includes('"has ""quote"""'));
  assert.ok(csv.includes('"has\nnewline"'));
  /* the quoted title sits as the second cell of the Q-1 row */
  const row = parseLines(csv).find(l => l.includes('Q-1'));
  assert.ok(row.startsWith('Q-1;"has, comma"'), `title cell quoted: ${row}`);
});

test('= + - and @ leading values all gain the apostrophe', () => {
  const doc = makeDoc();
  doc.tasks.push(
    { id: 't_f1', project: 'p_alpha', key: 'F-1', title: '=1+1', status: 'todo', priority: 'none', assignees: [], labels: [], estimate: '', subtasks: [], deps: [], order: 210 },
    { id: 't_f2', project: 'p_alpha', key: 'F-2', title: '+SUM(A1)', status: 'todo', priority: 'none', assignees: [], labels: [], estimate: '', subtasks: [], deps: [], order: 211 },
    { id: 't_f3', project: 'p_alpha', key: 'F-3', title: '-2 degrees', status: 'todo', priority: 'none', assignees: [], labels: [], estimate: '', subtasks: [], deps: [], order: 212 },
    { id: 't_f4', project: 'p_alpha', key: 'F-4', title: '@risk', status: 'todo', priority: 'none', assignees: [], labels: [], estimate: '', subtasks: [], deps: [], order: 213 },
  );
  const csv = toCsv(buildExportModel(doc, 'p_alpha', { scope: 'all' }, { translate: k => k, labelName: i => i, now: NOW }));
  assert.ok(csv.includes("'=1+1"));
  assert.ok(csv.includes("'+SUM(A1)"));
  assert.ok(csv.includes("'-2 degrees"));
  assert.ok(csv.includes("'@risk"));
});

test('A & <B> survives literally; angle brackets are never interpreted', () => {
  const csv = toCsv(build());
  assert.ok(csv.includes('A & <B>'));
});

test('an empty description writes an empty field, never the word undefined', () => {
  const m = build({ scope: 'all', options: { descriptions: true } });
  const csv = toCsv(m);
  assert.equal(csv.includes('undefined'), false);
  const row = parseLines(csv).find(l => l.includes('ALPHA-2'));
  /* description column exists; this row's desc is empty → trailing empty field */
  const fields = row.split(';');
  assert.equal(fields[fields.length - 1], '');
});

test('option toggles widen the header exactly as the model does', () => {
  const base = build().columns.map(c => c.label).join(';');
  assert.equal(parseLines(toCsv(build({ scope: 'all', options: { descriptions: true } })))[0], base + ';export.col.description');
  assert.equal(parseLines(toCsv(build({ scope: 'all', options: { comments: true } })))[0], base + ';export.col.comments;export.col.latestComment;export.col.thread');
});

test('accented and non-Latin text round-trips through UTF-8 bytes', () => {
  const csv = toCsv(build());
  const bytes = Buffer.from(csv, 'utf8');
  const back = bytes.toString('utf8');
  assert.equal(back, csv);
  assert.ok(back.includes('Données — naïve café 日本語'));
});

test('an empty model still produces a valid BOM + header CSV', () => {
  const m = buildExportModel(makeEmptyProjectDoc(), 'p_empty', {}, { translate: k => k, labelName: i => i, now: NOW });
  const csv = toCsv(m);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(parseLines(csv).length, 1);
});

test('static-mode Blob equivalent: Buffer from toCsv starts with the BOM and parses to the expected row count', () => {
  /* What A.exportSubmit's static branch produces: a Buffer (Blob equivalent)
     of toCsv output, type text/csv;charset=utf-8. */
  const model = buildExportModel(makeDoc(), 'p_alpha', { scope: 'all' }, { translate: k => k, labelName: i => 'L:' + i, now: NOW });
  const csv = toCsv(model);
  const blobEquivalent = Buffer.from(csv, 'utf8');
  assert.equal(blobEquivalent.length, Buffer.byteLength(csv), 'the buffer is the exact byte payload');
  const text = blobEquivalent.toString('utf8');
  assert.equal(text.charCodeAt(0), 0xfeff, 'the payload still starts with the BOM');
  const lines = text.replace(/^\uFEFF/, '').split('\r\n').filter(l => l !== '');
  assert.equal(lines.length, model.rows.length + 1, 'header plus one row per exported task');
});

test('65-05: nested rows appear in model order with per-level keys on the CSV (SUB-04)', () => {
  const doc = makeDoc();
  const t = doc.tasks.find(x => x.id === 't_a9');
  t.subtasks = [
    { id: 's_c1', parentId: null, position: 0, title: 'Root child', done: false },
    { id: 's_c2', parentId: 's_c1', position: 0, title: 'Nested child', done: false },
  ];
  const m = buildExportModel(doc, 'p_alpha', { scope: 'all', options: { subtasks: true } }, { translate: k => k, labelName: id => 'L:' + id, now: NOW });
  const lines = parseLines(toCsv(m));
  const rowOf = key => lines.findIndex(l => l.startsWith(key + ';'));
  const taskRow = rowOf('ALPHA-9');
  const rootRow = rowOf('ALPHA-9.1');
  const nestedRow = rowOf('ALPHA-9.1.1');
  assert.ok(taskRow > 0 && rootRow === taskRow + 1, 'the root subtask row directly follows its task');
  assert.ok(nestedRow === rootRow + 1, 'the nested row directly follows its parent in model order');
  assert.ok(lines[nestedRow].includes('Nested child'), 'the nested row carries its own title');
});

/* =====================================================================
   Phase 69 (69-01 Task 3): the 3-level fixture tree on the CSV — flat
   DFS rows, dotted keys, NO outline column (flat by design, scope
   guards: recorded as-is, no enrichment). Add-only (NFR-03).
   ===================================================================== */
import { makeMspdiDoc } from './fixtures/export-fixtures.mjs';

test('69-01: the 3-level tree exports flat DFS rows with dotted keys and no outline column (CSV)', () => {
  const m = buildExportModel(makeMspdiDoc(), 'p_msp', { scope: 'all', options: { subtasks: true, descriptions: true } }, { translate: k => k, labelName: id => id, now: NOW });
  const lines = parseLines(toCsv(m));
  const rowOf = key => lines.findIndex(l => l.startsWith(key + ';'));
  const order = ['MSP-13', 'MSP-13.1', 'MSP-13.1.1', 'MSP-13.1.2', 'MSP-13.2'].map(rowOf);
  assert.ok(order.every(i => i > 0), 'all 3-level rows are present');
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] < order[i], 'DFS order: t_x13, Sub A, Sub A.1, Sub A.2, Sub B');
  assert.ok(lines[order[2]].includes('Sub A.1 (deepest)'), 'the deepest row carries its own title');
  assert.ok(!/outline|level/i.test(lines[0]), 'the CSV header carries no outline/level column (flat by design)');
});
