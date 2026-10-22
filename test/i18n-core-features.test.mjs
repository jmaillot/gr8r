/* =====================================================================
   The contract of the core modules and the three feature modules (plan
   06-12, task 2): the keyboard hint's Ctrl label, the API client's error
   strings, the brand logo's accessible name and the archive / subtask /
   teams surfaces read the English catalogue — while the HTTP verbs, the
   API paths, the icon names and the seeded demo content stay exactly as
   they are.

   Families:
     1. the English oracle — every new value renders its previous English,
        and the values this wave reuses still render theirs;
     2. the absence — the scanner reports no finding for the six files
        and the allow-list carries none of them;
     3. the machine identifiers — the HTTP verbs and paths, the icon
        names, the ⌘ symbol and the demo content are untouched.
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

const WAVE_FILES = [
  'src/core/utils.js',
  'src/core/api.js',
  'src/core/icons.js',
  'src/features/archive.js',
  'src/features/subtasks.js',
  'src/features/teams.js',
];

const VOCAB_FILES_WAVE_ONE = ['src/core/constants.js', 'src/core/store.js'];

/* The values this wave introduced: [key, previous English]. */
const WAVE_ORACLE = [
  // the keyboard hint (utils.js)
  ['common.ctrl', 'Ctrl'],
  // the API client's error strings (api.js)
  ['err.serverUnreachable', 'Could not reach the server'],
  ['err.noWorkspaceLoaded', 'No workspace loaded'],
  // the brand logo's accessible name (icons.js)
  ['a11y.brand', 'Gr8r'],
  // the archive page (archive.js)
  ['act.restore', 'Restore'],
  ['page.archived', 'Archived'],
  ['page.archivedWhen', 'Archived {when}'],
  ['page.noArchivedTasks', 'No archived tasks'],
  ['page.archiveTasksHint', 'Archive finished or abandoned tasks to keep boards focused. They wait here until you restore them.'],
  ['page.noArchivedProjects', 'No archived projects'],
  ['page.archiveProjectsHint', 'Archived projects disappear from the sidebar and project lists but keep every task, file, and comment.'],
  ['page.archiveSubtitle', 'Archived work is hidden everywhere else. Restore it any time, or delete it for good.'],
  // the subtask detail view (subtasks.js)
  ['a11y.subtaskMarkDone', 'Mark subtask done'],
  ['a11y.subtaskMarkNotDone', 'Mark subtask not done'],
  ['a11y.subtaskTitle', 'Subtask title'],
  ['page.subtask.progress', 'Subtask {i} of {n}'],
  ['page.subtask.done', 'Done'],
  ['page.subtask.open', 'Open'],
  ['common.setDate', 'Set date'],
  ['page.subtask.parent', 'Parent'],
  ['page.subtask.notes', 'Notes'],
  ['a11y.subtaskNotesPlaceholder', 'Add details, links, or acceptance criteria…'],
  ['act.convertToTask', 'Convert to task'],
  ['a11y.subtaskPrev', 'Previous subtask'],
  ['common.previous', 'Previous'],
  ['a11y.subtaskNext', 'Next subtask'],
  ['common.next', 'Next'],
  ['act.delete', 'Delete'],
  // the teams modal (teams.js)
  ['page.team.edit', 'Edit team'],
  ['page.team.subtitle', 'Teams group the people who work on projects together.'],
  ['page.team.name', 'Team name'],
  ['a11y.teamNameExample', 'e.g. Growth'],
  ['page.team.owns', 'What does this team own?'],
  ['a11y.teamDescExample', 'e.g. Acquisition experiments and lifecycle email'],
  ['common.icon', 'Icon'],
  ['common.color', 'Color'],
  ['page.team.membersHint', 'Everyone belongs to one primary team. Adding someone here moves them from their current team.'],
  ['act.saveChanges', 'Save changes'],
  ['act.createTeam', 'Create team'],
];

/* The catalogue values the surfaces reuse — already carried by earlier
   waves or by task 1, asserted here because these surfaces now read them. */
const REUSED_ORACLE = [
  ['act.deletePermanently', 'Delete permanently'],
  ['nav.route.archive', 'Archive'],
  ['nav.route.tasks', 'Tasks'],
  ['nav.route.projects', 'Projects'],
  ['page.field.assignee', 'Assignee'],
  ['page.field.due', 'Due date'],
  ['common.unassigned', 'Unassigned'],
  ['common.cancel', 'Cancel'],
  ['act.deleteTeam', 'Delete team'],
  ['nav.route.members', 'Members'],
  ['a11y.newTeam', 'New team'],
];

/* ---------- 1. the English oracle ---------- */

test('every new value of this wave renders its previous English exactly', () => {
  for (const [key, expected] of WAVE_ORACLE) {
    assert.ok(Object.hasOwn(en, key), `missing key: ${key}`);
    const args = key === 'page.archivedWhen' ? { when: '5m ago' } : key === 'page.subtask.progress' ? { i: 2, n: 5 } : undefined;
    const rendered = t(key, args);
    assert.equal(
      rendered,
      expected
        .replace(/\{when\}/, '5m ago')
        .replace(/\{i\}/, 2)
        .replace(/\{n\}/, 5),
      key,
    );
  }
});

test('the values the surfaces reuse still render their English', () => {
  for (const [key, expected] of REUSED_ORACLE) assert.equal(t(key), expected, key);
});

test('the interpolated archive and subtask values escape nothing by themselves', () => {
  assert.ok(!en['page.archivedWhen'].includes('&'), 'the archivedWhen value carries markup');
  assert.ok(!en['page.subtask.progress'].includes('&'), 'the subtask progress value carries markup');
});

/* ---------- 2. the absence ---------- */

test('no extracted literal survives as a finding in the six files', () => {
  for (const file of WAVE_FILES) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const findings = scanSource(src, file);
    assert.deepEqual(findings, [], `${file} still reports: ${findings.map(f => `${f.kind}:${f.line} ${f.text}`).join(' | ')}`);
  }
});

test('theme.js carries no user-visible literal — the scanner reports nothing for it', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/core/theme.js'), 'utf8');
  assert.deepEqual(scanSource(src, 'src/core/theme.js'), []);
});

test('the allow-list carries no entry of the six files and stays sorted', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list is not sorted');
  const left = list.filter(e => WAVE_FILES.includes(e.file));
  assert.deepEqual(left, [], 'the wave files still have allow-list entries');
});

/* ---------- 3. the machine identifiers and the demo content ---------- */

test('the HTTP verbs and the API paths are byte-identical', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/core/api.js'), 'utf8');
  assert.ok(src.includes("call('GET', '/api/config')"), 'the config call moved');
  assert.ok(src.includes("call('PUT', `/api/workspaces/${encodeURIComponent(slug)}`"), 'the put call moved');
  assert.ok(src.includes("call('DELETE', `/api/workspaces/${encodeURIComponent(slug)}/members/"), 'the delete call moved');
  const verbs = [...src.matchAll(/call\('(\w+)'/g)].map(m => m[1]);
  assert.ok(
    verbs.every(v => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(v)),
    'a verb changed',
  );
  assert.equal(verbs.length, 21, 'a call site moved');
});

test('the icon names and the brand path are untouched', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/core/icons.js'), 'utf8');
  assert.ok(src.includes("ICONS[name] || '<rect"), 'the icon fallback moved');
  assert.ok(src.includes('M99.1462 184.663'), 'the brand path moved');
  assert.ok(src.includes('viewBox="45.53 114.5 241.47 102.27"'), 'the logo viewBox moved');
});

test('the ⌘ symbol is not a catalogue value — only the Ctrl label is', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/core/utils.js'), 'utf8');
  assert.ok(src.includes("isMac ? '⌘' :"), 'the ⌘ symbol moved');
  assert.ok(!src.includes("'Ctrl'"), 'the literal Ctrl label survives');
  assert.ok(src.includes("t('common.ctrl')"), 'the Ctrl label is not a catalogue lookup');
});

test('the seeded team names and their descriptions are still data in the source', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/core/constants.js'), 'utf8');
  for (const text of [
    'Design',
    'Engineering',
    'Marketing',
    'Product',
    'Product design, brand, and research',
    'Web, mobile, and platform engineering',
    'Campaigns, content, and growth',
    'Roadmap, planning, and QA',
  ]) {
    assert.ok(src.includes(`'${text}'`), `the demo content '${text}' moved`);
  }
});

test('the stored role comparison in the members page is untouched', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/pages/settings.js'), 'utf8');
  assert.ok(src.includes("'Owner'"), 'the stored role id left the settings page');
});

/* ---------- 4. the wave's proof (task 3, green-first pins) ---------- */

test('the allow-list carries no entry of the nine files of the wave and stays sorted', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list is not sorted');
  const waveFiles = [...VOCAB_FILES_WAVE_ONE, ...WAVE_FILES];
  const left = list.filter(e => waveFiles.includes(e.file));
  assert.deepEqual(left, [], 'the wave files still have allow-list entries');
});

test('the catalogue grew to the wave boundary — 1201 keys, none under the reserved namespace', () => {
  const keys = Object.keys(en);
  assert.equal(keys.length, 1201, 'the catalogue size moved');
  assert.ok(
    keys.every(k => !k.startsWith('contract.') || k === 'contract.englishOnly'),
    'a phase key sits under contract.*',
  );
});

test('the icon baseline holds at 174 names', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/icons-baseline.json'), 'utf8'));
  const names = Array.isArray(baseline) ? baseline : baseline.icons || Object.keys(baseline);
  assert.equal(names.length, 174, 'the icon baseline moved');
});
