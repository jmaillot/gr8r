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
