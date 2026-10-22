/* =====================================================================
   The contract of the shared ui helpers and the view engine (plan
   06-08, task 2): the empty-state helper's callers, the avatars'
   accessible name, the file-type names, the select fallback, the toast
   module's offline message and the view engine's toolbar read the
   English catalogue — and the stored file-type ids never change.

   Families:
     1. the file-type coverage — every stored id has a file.type.* key
        and FT keeps its colour and its icon but loses its display name;
     2. the English oracle — every value renders its previous English;
     3. the absence — the scanner reports no finding for the four files
        and the allow-list carries none of them;
     4. the machine identifiers — fileType() still returns the stored ids.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import en from '../src/locales/en.json' with { type: 'json' };
import { t } from '../src/core/i18n.js';
import { scanSource } from '../scripts/i18n-scan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const HELPER_FILES = ['src/ui/helpers.js', 'src/ui/select.js', 'src/ui/toast.js', 'src/shell/view-engine.js'];

/* The stored file-type ids — the document holds them and they never
   change (D-08, I18N-07's groundwork). */
const FILE_TYPES = ['fig', 'pdf', 'zip', 'img', 'sheet', 'doc', 'code', 'other'];

/* [file-type id, the display name the old FT table carried] */
const FILE_TYPE_ORACLE = [
  ['fig', 'Figma'],
  ['pdf', 'PDF'],
  ['zip', 'Archive'],
  ['img', 'Image'],
  ['sheet', 'Spreadsheet'],
  ['doc', 'Document'],
  ['code', 'Code'],
  ['other', 'File'],
];

/* The other values the wave introduced: [key, previous English]. */
const HELPER_ORACLE = [
  ['common.unassigned', 'Unassigned'],
  ['a11y.choose', 'Choose'],
  ['toast.offlineChanges', "Your changes couldn't be saved. You're offline."],
  ['page.field.status', 'Status'],
  ['page.field.assignee', 'Assignee'],
  ['page.field.priority', 'Priority'],
  ['page.field.due', 'Due date'],
  ['page.field.project', 'Project'],
  ['page.field.labels', 'Labels'],
  ['page.field.created', 'Created date'],
  ['page.field.updated', 'Updated date'],
  ['page.filter.overdue', 'Overdue'],
  ['page.filter.next7Days', 'Next 7 days'],
  ['page.filter.later', 'Later'],
  ['page.filter.noDueDate', 'No due date'],
  ['page.range.last24h', 'Last 24 hours'],
  ['page.range.last7days', 'Last 7 days'],
  ['page.range.last30days', 'Last 30 days'],
  ['page.group.allTasks', 'All tasks'],
  ['page.sort.manual', 'Manual'],
  ['page.sort.title', 'Title'],
  ['page.sort.created', 'Created'],
  ['page.sort.updated', 'Updated'],
  ['page.sort.start', 'Start date'],
  ['page.sort.estimate', 'Estimate'],
  ['page.sortLabel', 'Sort:'],
  ['page.groupLabel', 'Group:'],
  ['common.none', 'None'],
  ['act.add', 'Add'],
  ['act.clearAll', 'Clear all'],
  ['act.filter', 'Filter'],
  ['act.columns', 'Columns'],
  ['a11y.removeFilter', 'Remove filter'],
  ['a11y.searchTasks', 'Search tasks'],
];

/* The catalogue values the helpers reuse — already carried by earlier
   waves, asserted here because these surfaces now read them. */
const REUSED_ORACLE = [['common.today', 'Today']];

/* The literal texts the sweep removed from the four files. */
const GONE = {
  'src/ui/helpers.js': ['data-tip="Unassigned"', 'Figma', 'PDF', 'Archive', 'Image', 'Spreadsheet', 'Document', 'Code', 'File'],
  'src/ui/select.js': ['Choose'],
  'src/ui/toast.js': ["Your changes couldn't be saved. You're offline.", 'Try again'],
  'src/shell/view-engine.js': [
    'Status',
    'Assignee',
    'Unassigned',
    'Priority',
    'Due date',
    'Overdue',
    'Today',
    'Next 7 days',
    'Later',
    'No due date',
    'Project',
    'Labels',
    'Created date',
    'Last 24 hours',
    'Last 7 days',
    'Last 30 days',
    'Updated date',
    'All tasks',
    'Remove filter',
    'Add',
    'Clear all',
    'Manual',
    'Title',
    'Created',
    'Updated',
    'Start date',
    'Estimate',
    'Search tasks',
    'Filter',
    'Sort:',
    'Group:',
    'None',
    'Columns',
  ],
};

/* ---------- 1. the file-type coverage ---------- */

test('every stored file-type id has a file.type.* key that renders its previous English', () => {
  for (const [id, name] of FILE_TYPE_ORACLE) {
    assert.ok(Object.hasOwn(en, 'file.type.' + id), `missing key: file.type.${id}`);
    assert.equal(t('file.type.' + id), name, `file.type.${id}`);
  }
});

test('FT keeps its colour and its icon and loses its display name', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/ui/helpers.js'), 'utf8');
  const ft = src.match(/export const FT = \{[\s\S]*?\};/);
  assert.ok(ft, 'the FT table moved');
  assert.ok(!/\bn:/.test(ft[0]), 'FT still carries a display name');
  assert.ok(ft[0].includes("fig: { c: '#8662C9', i: 'pen-tool' }"), 'the colour/icon shape moved');
  assert.ok(ft[0].includes("other: { c: '#6B7280', i: 'file' }"), 'the colour/icon shape moved');
});

test('the file-type display is a catalogue lookup built from the stored id', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/ui/helpers.js'), 'utf8');
  assert.ok(src.includes("fileTypeName = type => t('file.type.' + "), 'the fileTypeName lookup moved');
});

/* ---------- 2. the English oracle ---------- */

test('every helper value renders its previous English exactly', () => {
  for (const [key, expected] of HELPER_ORACLE) {
    assert.ok(Object.hasOwn(en, key), `missing key: ${key}`);
    assert.equal(t(key), expected, key);
  }
});

test('the values the helpers reuse still render their English', () => {
  for (const [key, expected] of REUSED_ORACLE) assert.equal(t(key), expected, key);
});

test('no two keys of this wave carry the same value', () => {
  const seen = new Map();
  for (const [id] of FILE_TYPE_ORACLE) seen.set(en['file.type.' + id], 'file.type.' + id);
  for (const [key] of HELPER_ORACLE) {
    const flat = typeof en[key] === 'string' ? en[key] : JSON.stringify(en[key]);
    assert.ok(!seen.has(flat), `${key} duplicates ${seen.get(flat)}`);
    seen.set(flat, key);
  }
});

/* ---------- 3. the absence ---------- */

for (const file of HELPER_FILES) {
  test(`no extracted literal survives as a finding in ${file}`, () => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const findings = scanSource(src, file);
    const texts = new Set(findings.map(f => f.text));
    const surviving = GONE[file].filter(text => texts.has(text));
    assert.deepEqual(surviving, [], `these literals are still in the source: ${surviving.join(' | ')}`);
  });
}

test('the scanner reports nothing at all for the four helper files', () => {
  for (const file of HELPER_FILES) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const findings = scanSource(src, file);
    assert.deepEqual(findings, [], `${file} still reports: ${findings.map(f => `${f.kind}:${f.line} ${f.text}`).join(' | ')}`);
  }
});

test('the allow-list carries no entry of the four helper files and stays sorted', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list is not sorted');
  const left = list.filter(e => HELPER_FILES.includes(e.file));
  assert.deepEqual(left, [], 'the helper files still have allow-list entries');
});

/* ---------- 4. the machine identifiers ---------- */

test('fileType() still returns the stored ids — the extension lists are byte-identical', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/ui/helpers.js'), 'utf8');
  assert.ok(src.includes("if (['zip', 'rar', '7z'].includes(e)) return 'zip';"), 'the zip list moved');
  assert.ok(src.includes("if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(e)) return 'img';"), 'the img list moved');
  assert.ok(src.includes("if (['xlsx', 'xls', 'csv', 'numbers'].includes(e)) return 'sheet';"), 'the sheet list moved');
  assert.ok(src.includes("if (['doc', 'docx', 'txt', 'md', 'pages', 'rtf'].includes(e)) return 'doc';"), 'the doc list moved');
  assert.ok(src.includes("if (['js', 'ts', 'json', 'html', 'css', 'py'].includes(e)) return 'code';"), 'the code list moved');
  assert.ok(src.includes("return 'other';"), 'the other fallback moved');
});

test('the select fallback is a catalogue value, not a literal', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/ui/select.js'), 'utf8');
  assert.ok(!src.includes("|| 'Choose'"), "the || 'Choose' fallback survives");
  assert.ok(src.includes("t('a11y.choose')"), 'the fallback is not a catalogue lookup');
});

test('the view engine keeps its machine keys — the sort field ids and the data-a action keys', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/shell/view-engine.js'), 'utf8');
  assert.ok(src.includes("sort: { f: 'manual', dir: 1 }"), 'the default sort moved');
  assert.ok(src.includes("hidden: ['start', 'created', 'deps']"), 'the hidden columns moved');
  const actions = [...src.matchAll(/data-a="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(actions, ['pop', 'rmFilter', 'pop', 'clearFilters', 'pop', 'pop', 'pop', 'pop'], 'the action keys moved');
});
