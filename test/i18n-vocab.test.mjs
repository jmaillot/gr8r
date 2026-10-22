/* =====================================================================
   The contract of the stored vocabulary (plan 06-12, task 1): the
   statuses, the priorities, the labels, the project statuses and the
   roles are displayed through the catalogue while the STORED VALUES
   NEVER CHANGE — the document still holds `backlog`, `todo`, `urgent`,
   `design` and `Owner`, and only the display is a catalogue lookup
   keyed on the stored id (I18N-07's groundwork, D-08).

   Families:
     1. the vocabulary coverage — every stored id of every table has a
        catalogue key that renders its previous English;
     2. the English oracle — every value renders its previous English;
     3. the absence — the scanner reports no finding for the two
        vocabulary files, and the allow-list carries none of them;
     4. the machine identifiers — the ids, the capitalised role ids and
        the demo content are byte-identical to what they were.
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

const VOCAB_FILES = ['src/core/constants.js', 'src/core/store.js'];

/* [stored id, the display name the old tables carried] — the ids are what
   the document holds and they never change (D-08). */
const STATUS_ORACLE = [
  ['backlog', 'Backlog'],
  ['todo', 'To Do'],
  ['progress', 'In Progress'],
  ['review', 'Review'],
  ['done', 'Done'],
];
const PRIORITY_ORACLE = [
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
  ['none', 'No priority'],
];
const LABEL_ORACLE = [
  ['design', 'Design'],
  ['frontend', 'Frontend'],
  ['backend', 'Backend'],
  ['research', 'Research'],
  ['content', 'Content'],
  ['bug', 'Bug'],
  ['qa', 'QA'],
  ['growth', 'Growth'],
];
const PROJECT_STATUS_ORACLE = [
  ['planning', 'Planning'],
  ['active', 'In Progress'],
  ['risk', 'At Risk'],
  ['hold', 'On Hold'],
  ['complete', 'Completed'],
];
/* The document stores the capitalised role id; the catalogue key is
   lowercase, so the lookup lowercases the id before it builds the key.
   `viewer` is the workspace role the server returns and renders the
   Guest label, exactly as ROLE_LABELS did. */
const ROLE_ORACLE = [
  ['Owner', 'Owner'],
  ['Admin', 'Admin'],
  ['Member', 'Member'],
  ['Guest', 'Guest'],
  ['viewer', 'Guest'],
];

const constantsSrc = fs.readFileSync(path.join(ROOT, 'src/core/constants.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'src/core/store.js'), 'utf8');

/* The ids the source still declares, parsed out of the tables — the ids
   must survive the sweep byte-identically, so the coverage is measured
   against the SOURCE, not against this file's expectations. */
function tableIds(name, re) {
  const block = constantsSrc.match(new RegExp(`export const ${name} = [\\[{]([\\s\\S]*?)[\\]}];`));
  assert.ok(block, `the ${name} table moved`);
  return [...block[1].matchAll(re)].map(m => m[1]);
}

const ROLE_IDS = ['Owner', 'Admin', 'Member', 'Guest'];

/* The demo content of TEAMS_SEED — data, not interface text (the plan's
   demo-content rule): the seeded team names and their descriptions are
   copied into the document the first time the feature is used. */
const DEMO_TEAM_ORACLE = [
  ['design', 'Design', 'Product design, brand, and research'],
  ['eng', 'Engineering', 'Web, mobile, and platform engineering'],
  ['mkt', 'Marketing', 'Campaigns, content, and growth'],
  ['product', 'Product', 'Roadmap, planning, and QA'],
];

/* ---------- 1. the vocabulary coverage ---------- */

test('every stored status id has a task.status.* key that renders its previous English', () => {
  const ids = tableIds('STATUSES', /id: '(\w+)'/g);
  assert.deepEqual(
    ids,
    STATUS_ORACLE.map(([id]) => id),
    'the status ids moved',
  );
  for (const [id, name] of STATUS_ORACLE) {
    assert.ok(Object.hasOwn(en, 'task.status.' + id), `missing key: task.status.${id}`);
    assert.equal(t('task.status.' + id), name, `task.status.${id}`);
  }
});

test('every stored priority id has a task.priority.* key that renders its previous English', () => {
  const ids = tableIds('PRIOS', /id: '(\w+)'/g);
  assert.deepEqual(
    ids,
    PRIORITY_ORACLE.map(([id]) => id),
    'the priority ids moved',
  );
  for (const [id, name] of PRIORITY_ORACLE) {
    assert.ok(Object.hasOwn(en, 'task.priority.' + id), `missing key: task.priority.${id}`);
    assert.equal(t('task.priority.' + id), name, `task.priority.${id}`);
  }
});

test('every stored label id has a task.label.* key that renders its previous English', () => {
  const ids = tableIds('LABELS', /id: '(\w+)'/g);
  assert.deepEqual(
    ids,
    LABEL_ORACLE.map(([id]) => id),
    'the label ids moved',
  );
  for (const [id, name] of LABEL_ORACLE) {
    assert.ok(Object.hasOwn(en, 'task.label.' + id), `missing key: task.label.${id}`);
    assert.equal(t('task.label.' + id), name, `task.label.${id}`);
  }
});

test('every stored project-status id has a project.status.* key that renders its previous English', () => {
  const ids = tableIds('PSTAT', /^ {2}(\w+):/gm);
  assert.deepEqual(
    ids,
    PROJECT_STATUS_ORACLE.map(([id]) => id),
    'the project-status ids moved',
  );
  for (const [id, name] of PROJECT_STATUS_ORACLE) {
    assert.ok(Object.hasOwn(en, 'project.status.' + id), `missing key: project.status.${id}`);
    assert.equal(t('project.status.' + id), name, `project.status.${id}`);
  }
});

test('every stored role id has a common.role.* key that renders its previous English', () => {
  const roles = tableIds('ROLES', /'(\w+)'/g);
  assert.deepEqual(roles, ROLE_IDS, 'the role ids moved');
  for (const role of ROLE_IDS) {
    assert.ok(Object.hasOwn(en, 'common.role.' + role.toLowerCase()), `missing key: common.role.${role.toLowerCase()}`);
    assert.equal(t('common.role.' + role.toLowerCase()), ROLE_ORACLE.find(([id]) => id === role)[1], `common.role.${role.toLowerCase()}`);
  }
  assert.equal(t('common.role.viewer'), 'Guest', 'the server workspace role viewer renders the Guest label');
});

/* ---------- 2. the lookup shape ---------- */

test('the display of a stored id is a catalogue lookup built from the id', () => {
  for (const [id] of STATUS_ORACLE) assert.ok(constantsSrc.includes(`t('task.status.${id}')`), `the status display of ${id} is not a catalogue lookup`);
  for (const [id] of PRIORITY_ORACLE) assert.ok(constantsSrc.includes(`t('task.priority.${id}')`), `the priority display of ${id} is not a catalogue lookup`);
  for (const [id] of LABEL_ORACLE) assert.ok(constantsSrc.includes(`t('task.label.${id}')`), `the label display of ${id} is not a catalogue lookup`);
  for (const [id] of PROJECT_STATUS_ORACLE)
    assert.ok(constantsSrc.includes(`t('project.status.${id}')`), `the project-status display of ${id} is not a catalogue lookup`);
  assert.ok(storeSrc.includes("t('common.role.' +"), 'the role display is not an id-keyed lookup');
});

test('the role lookup lowercases the stored id before it builds the key', () => {
  assert.ok(/roleLabel = role =>/.test(storeSrc), 'roleLabel moved');
  assert.ok(/toLowerCase\(\)/.test(storeSrc), 'the lookup does not lowercase the stored id');
});

/* ---------- 3. the absence ---------- */

test('no extracted literal survives as a finding in the two vocabulary files', () => {
  for (const file of VOCAB_FILES) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const findings = scanSource(src, file);
    assert.deepEqual(findings, [], `${file} still reports: ${findings.map(f => `${f.kind}:${f.line} ${f.text}`).join(' | ')}`);
  }
});

test('the allow-list carries no entry of the two vocabulary files and stays sorted', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list is not sorted');
  const left = list.filter(e => VOCAB_FILES.includes(e.file));
  assert.deepEqual(left, [], 'the vocabulary files still have allow-list entries');
});

/* ---------- 4. the machine identifiers and the demo content ---------- */

test('the document still holds the capitalised role ids — the comparison values never changed', () => {
  assert.ok(storeSrc.includes("role === 'Owner'") || storeSrc.includes("'Owner'"), 'the Owner id left the source');
  assert.ok(storeSrc.includes("['Owner', 'Admin']"), 'the admin-membership list moved');
  assert.ok(constantsSrc.includes("export const ROLES = ['Owner', 'Admin', 'Member', 'Guest'];"), 'the ROLES list moved');
});

test('the seeded team names and their descriptions are still data in the source', () => {
  for (const [id, name, desc] of DEMO_TEAM_ORACLE) {
    assert.ok(constantsSrc.includes(`id: '${id}'`), `the seeded team ${id} moved`);
    assert.ok(constantsSrc.includes(`name: '${name}'`), `the seeded team name '${name}' moved`);
    assert.ok(constantsSrc.includes(`desc: '${desc}'`), `the seeded team description moved`);
  }
});

test('the old display tables are gone — no literal display name survives in the source', () => {
  assert.ok(!constantsSrc.includes("name: 'Backlog'"), 'the literal Backlog display name survives');
  assert.ok(!constantsSrc.includes("name: 'Urgent'"), 'the literal Urgent display name survives');
  assert.ok(!constantsSrc.includes("name: 'Design', c"), 'the literal Design label display name survives');
  assert.ok(!constantsSrc.includes("name: 'Planning'"), 'the literal Planning display name survives');
  assert.ok(!storeSrc.includes("ROLE_LABELS = { owner: 'Owner'"), 'ROLE_LABELS still carries literal display names');
});
