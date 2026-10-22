/* =====================================================================
   The contract of the six small action modules (plan 06-11, task 2):
   archive.js, drag-drop.js, subtasks.js and teams.js read the English
   catalogue for every literal the scanner reports, and events.js and
   keyboard.js — the dispatcher and the shortcut map, whose literals are
   machine identifiers (D-08) — report nothing at all and stay untouched.

   Families:
     1. the English oracle — byte-identical rendering;
     2. the absence — none of the extracted literals survives;
     3. the machine identifiers — the A[el.dataset.a] dispatch and the
        keyboard map's route keys are byte-identical.
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

/* [key, vars, previous English]. toast.deletedTask, toast.createdProject,
   toast.deleted, toast.open, toast.undo, common.noDescriptionYet and
   act.deleteTitle already exist — reused here, not duplicated. */
const ORACLE = [
  // archive.js
  ['toast.taskRestored', { title: 'T' }, 'Restored “T”'],
  ['toast.open', undefined, 'Open'],
  ['act.deleteTaskForeverTitle', undefined, 'Delete task permanently?'],
  ['act.purgeTaskBody', undefined, ", its subtasks, comments, and attachments will be deleted for everyone. This can't be undone."],
  ['act.deletePermanently', undefined, 'Delete permanently'],
  ['toast.deletedTask', { title: 'T' }, 'Deleted “T”'],
  // drag-drop.js
  ['toast.taskMovedTo', { title: 'T', status: 'Done' }, 'Moved “T” to Done'],
  ['toast.sortedManually', undefined, 'Sorted manually to keep your order'],
  ['toast.taskRescheduled', { title: 'T', date: 'Jul 24' }, 'Rescheduled “T” to Jul 24'],
  // subtasks.js
  ['toast.subtaskConverted', { key: 'A-1' }, 'Converted to A-1'],
  // teams.js
  ['err.teamNameRequired', undefined, 'Give the team a name'],
  ['common.noDescriptionYet', undefined, 'No description yet.'],
  ['toast.teamSaved', { name: 'Design' }, 'Saved Design'],
  ['toast.createdProject', { name: 'Design' }, 'Created Design'],
  ['act.deleteTitle', { name: 'Design' }, 'Delete Design?'],
  ['act.teams.noMembers', undefined, 'The team has no members'],
  ['act.deleteTeam', undefined, 'Delete team'],
  ['toast.deleted', { name: 'Design' }, 'Deleted Design'],
  ['toast.undo', undefined, 'Undo'],
];

/* The literal texts the sweep removed from the four modules. */
const GONE = [
  // archive.js
  ", its subtasks, comments, and attachments will be deleted for everyone. This can't be undone.",
  'Delete permanently',
  'Delete task permanently?',
  'Deleted “',
  'Open',
  'Restored “',
  // drag-drop.js
  'Moved “',
  'Rescheduled “',
  'Sorted manually to keep your order',
  // subtasks.js
  'Converted to',
  // teams.js
  'Created',
  'Delete',
  'Delete team',
  'Deleted',
  'Give the team a name',
  'No description yet.',
  'Saved',
  'The team has no members',
  'Undo',
];

const FILES_WITH_FINDINGS = ['src/actions/archive.js', 'src/actions/drag-drop.js', 'src/actions/subtasks.js', 'src/actions/teams.js'];
const MACHINE_ONLY_FILES = ['src/actions/events.js', 'src/actions/keyboard.js'];

test('every value of the six small modules renders its previous English exactly', () => {
  for (const [key, vars, expected] of ORACLE) assert.equal(t(key, vars), expected, key);
});

test('every key of the wave resolves in the English catalogue', () => {
  for (const [key] of ORACLE) assert.ok(Object.hasOwn(en, key), `missing key: ${key}`);
});

for (const file of FILES_WITH_FINDINGS) {
  test(`no extracted literal survives as a finding in ${file}`, () => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const findings = scanSource(src, file);
    const texts = new Set(findings.map(f => f.text));
    const surviving = GONE.filter(text => texts.has(text));
    assert.deepEqual(surviving, [], `these literals are still in the source: ${surviving.join(' | ')}`);
  });
}

test('the dispatcher and the shortcut map report nothing at all', () => {
  for (const file of MACHINE_ONLY_FILES) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const findings = scanSource(src, file);
    assert.deepEqual(findings, [], `${file} reports: ${findings.map(f => `${f.kind}:${f.line} ${f.text}`).join(' | ')}`);
  }
});

/* ---------- the wave's proof (plan 06-11, task 3) ---------- */

test('none of the seven action modules reports a finding any more', () => {
  const files = ['src/actions/actions.js', ...FILES_WITH_FINDINGS, ...MACHINE_ONLY_FILES];
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const findings = scanSource(src, file);
    assert.deepEqual(findings, [], `${file} still reports: ${findings.map(f => `${f.kind}:${f.line} ${f.text}`).join(' | ')}`);
  }
});

test('the allow-list carries no entry of the seven action modules', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  const files = new Set(['src/actions/actions.js', ...FILES_WITH_FINDINGS, ...MACHINE_ONLY_FILES]);
  const left = list.filter(e => files.has(e.file));
  assert.deepEqual(left, [], 'the seven modules still have allow-list entries');
});

test('the A[el.dataset.a] dispatch is unchanged — the action key is a machine identifier', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/actions/events.js'), 'utf8');
  assert.ok(src.includes('const fn = A[el.dataset.a];'), 'the dispatch line moved');
  /* The only action key the file mentions is a comparison against the
     mention picker's key — a machine value, not an attribute literal. */
  assert.ok(src.includes("el.dataset.a === 'pickMention'"), 'the pickMention action key moved');
  assert.deepEqual(
    [...src.matchAll(/data-a="([^"]*)"/g)].map(m => m[1]),
    [],
    'data-a attribute sites of events.js',
  );
});

test('the keyboard map keeps its route keys and its action ids', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/actions/keyboard.js'), 'utf8');
  /* The route map's keys are single-letter shortcuts and its values are
     route ids — machine identifiers (D-08). A byte-stable anchor for the
     map itself and one action call. */
  assert.ok(
    src.includes("{ h: 'home', t: 'mytasks', p: 'projects', i: 'inbox', c: 'calendar', s: 'settings', n: 'notifications', a: 'activity', m: 'members' }"),
    'the route map moved',
  );
  assert.ok(src.includes('A.toggleDark()'), 'an action id moved');
});

test('no two keys of this wave carry the same value', () => {
  const seen = new Map();
  for (const [key] of ORACLE) {
    const value = en[key];
    const flat = typeof value === 'string' ? value : JSON.stringify(value);
    assert.ok(!seen.has(flat), `${key} duplicates ${seen.get(flat)}`);
    seen.set(flat, key);
  }
});

test('the allow-list stays sorted by file then text and no longer carries these files', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list is not sorted');
  const texts = new Set(list.filter(e => FILES_WITH_FINDINGS.includes(e.file)).map(e => e.text));
  const leaked = GONE.filter(text => texts.has(text));
  assert.deepEqual(leaked, [], `this wave's literals are still listed: ${leaked.join(' | ')}`);
});
