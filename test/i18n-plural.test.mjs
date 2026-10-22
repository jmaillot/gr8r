/* =====================================================================
   The plural contract (I18N-04, D-05): every count in the interface is a
   catalogue plural object keyed by the CLDR category, selected by the
   locale's Intl.PluralRules — never by a hand-written rule in the source.

   Three families of assertions:
     1. the shape — every plural value in the catalogue is an object whose
        members are CLDR categories, carrying a mandatory `other`, with the
        same placeholder set on every member;
     2. the English oracle — t() renders every converted message exactly
        what the hand-written `n > 1 ? 's' : ''` rule produced, including
        the zero (English `other` covers 0: "0 tasks", never "0 task");
     3. the absence — no file under src/ carries the hand-written idiom.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import { t } from '../src/core/i18n.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');

/* D-06: the CLDR plural categories, the same set the catalogue lint reads. */
const CLDR_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLACEHOLDER = /\{(\w+)\}/g;

/* The placeholders a value carries — a plural value through the union of its
   members, a string through its own matches. */
function placeholdersOf(value) {
  if (typeof value === 'string') return new Set([...value.matchAll(PLACEHOLDER)].map(m => m[1]));
  if (value && typeof value === 'object') {
    const set = new Set();
    for (const member of Object.values(value)) for (const p of placeholdersOf(member)) set.add(p);
    return set;
  }
  return new Set();
}

/* The fifteen plural objects this phase converted, one per message. */
const CONVERTED_PLURALS = [
  'act.overdueBy',
  'act.tasksUpdated',
  'act.deleteTasksTitle',
  'act.deleteTasksConfirm',
  'act.invitationsSent',
  'act.inviteLinksCreated',
  'act.removeAccess.openTasks',
  'act.teams.membersWithoutTeam',
  'act.teams.projectsWithoutTeam',
  'modal.saveView.filters',
  'page.auth.invitesSent',
  'act.movedByDays',
  'act.bulkInvite.created',
  'act.bulkInvite.copyLink',
  'act.bulkInvite.copyLinks',
];

/* The two-count message: the sentence stays in the catalogue, the pluralised
   noun is its own key, and the call site joins them with a single space. */
const BULK_INVITE_SUMMARY = 'act.bulkInvite.summary';

/* ---------- 1. the shape ---------- */

test('every plural value in the English catalogue is CLDR-shaped', () => {
  const problems = [];
  for (const [key, value] of Object.entries(en)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const members = Object.keys(value);
    for (const member of members) {
      if (!CLDR_CATEGORIES.includes(member)) problems.push(`${key}: "${member}" is not a CLDR category`);
      if (typeof value[member] !== 'string') problems.push(`${key}: the member ${member} is not a string`);
    }
    if (!Object.hasOwn(value, 'other')) problems.push(`${key}: no other member`);
    const sets = members.map(m => [...placeholdersOf(value[m])].sort().join(','));
    if (new Set(sets).size > 1) problems.push(`${key}: the members carry different placeholders (${sets.join(' | ')})`);
  }
  assert.deepEqual(problems, [], `every plural value is CLDR-shaped (${problems.join('; ')})`);
});

test('the French catalogue is still a strict subset of the English one', () => {
  /* D-02: fr.json is not touched in this phase — the French plural members
     arrive in phase 7. Nothing here may drift off the English base. The
     contract.* namespace is the documented exception (the lint exempts it). */
  const extra = Object.keys(fr).filter(k => !k.startsWith('contract.') && !Object.hasOwn(en, k));
  assert.deepEqual(extra, [], `every French key exists in English (${extra.join(', ')})`);
});

/* Three of the fifteen messages select their plural member from the count
   WITHOUT rendering it — "Invite created" vs "Invites created" carries no
   number in the text. The count still travels to t() as { n } and still
   decides the category through Intl.PluralRules; the member text simply has
   no placeholder to interpolate, so both members carry the empty set. */
const SELECTION_ONLY = ['act.bulkInvite.created', 'act.bulkInvite.copyLink', 'act.bulkInvite.copyLinks'];

test('the converted sites are catalogue plural objects carrying {n}', () => {
  const problems = [];
  for (const key of CONVERTED_PLURALS) {
    const value = en[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      problems.push(`${key}: not a plural object`);
      continue;
    }
    for (const member of ['one', 'other']) {
      if (typeof value[member] !== 'string') {
        problems.push(`${key}: no ${member} member`);
        continue;
      }
      if (/\{count\}/.test(value[member])) problems.push(`${key}: the ${member} member spells {count}`);
      if (SELECTION_ONLY.includes(key)) {
        if (/\{\w+\}/.test(value[member])) problems.push(`${key}: the ${member} member carries a placeholder, but the count is never rendered`);
      } else if (!/\{n\}/.test(value[member])) {
        problems.push(`${key}: the ${member} member carries no {n}`);
      }
    }
  }
  assert.deepEqual(problems, [], `every converted value is a {one, other} object with {n} (${problems.join('; ')})`);
});

test('the two-count bulk-invite message keeps the sentence in the catalogue', () => {
  const value = en[BULK_INVITE_SUMMARY];
  assert.equal(typeof value, 'string', 'act.bulkInvite.summary is a plain string, not a plural object');
  assert.deepEqual([...placeholdersOf(value)].sort(), ['failed', 'sent'], 'the sentence carries {sent} and {failed}');
  assert.match(value, /\.$/, 'the sentence carries its own full stop');
});

test('the moved-task message carries the direction words as catalogue values', () => {
  assert.equal(en['common.later'], 'later');
  assert.equal(en['common.earlier'], 'earlier');
});

/* ---------- 2. the English oracle ---------- */

/* The English rendering must be byte-identical to what the hand-written
   `n > 1 ? 's' : ''` rule produced. Each row is one converted message: the
   singular at 1, the plural at 2, and — because English `other` covers zero —
   the plural at 0. */
const ORACLE = [
  ['act.overdueBy', 'Overdue by 1 day.', 'Overdue by 2 days.'],
  ['act.tasksUpdated', 'Updated 1 task', 'Updated 2 tasks'],
  ['act.deleteTasksTitle', 'Delete 1 task?', 'Delete 2 tasks?'],
  ['act.deleteTasksConfirm', 'Delete 1 task', 'Delete 2 tasks'],
  ['act.invitationsSent', '1 invitation sent', '2 invitations sent'],
  ['act.inviteLinksCreated', '1 invite link created', '2 invite links created'],
  ['act.removeAccess.openTasks', '1 open task', '2 open tasks'],
  ['act.teams.membersWithoutTeam', '1 member', '2 members'],
  ['act.teams.projectsWithoutTeam', '1 project', '2 projects'],
  ['modal.saveView.filters', '1 filter will be saved with this view.', '2 filters will be saved with this view.'],
  ['page.auth.invitesSent', '1 invite sent', '2 invites sent'],
  ['act.bulkInvite.created', "Invite created, but email couldn't be sent.", "Invites created, but email couldn't be sent."],
  ['act.bulkInvite.copyLink', 'Copy the link.', 'Copy the links.'],
  ['act.bulkInvite.copyLinks', 'Copy the missing link.', 'Copy the missing links.'],
];

test('t() renders the English oracle for every converted message, zero included', () => {
  const problems = [];
  for (const [key, one, other] of ORACLE) {
    if (t(key, { n: 1 }) !== one) problems.push(`${key} at 1: ${JSON.stringify(t(key, { n: 1 }))} !== ${JSON.stringify(one)}`);
    if (t(key, { n: 2 }) !== other) problems.push(`${key} at 2: ${JSON.stringify(t(key, { n: 2 }))} !== ${JSON.stringify(other)}`);
    /* English other covers zero: "0 tasks", never "0 task" — the rendering is
       the other member with the count interpolated, never the one member. */
    const zeroExpected = en[key].other.replace('{n}', '0');
    if (t(key, { n: 0 }) !== zeroExpected) {
      problems.push(`${key} at 0: ${JSON.stringify(t(key, { n: 0 }))} !== ${JSON.stringify(zeroExpected)} (English other covers zero)`);
    }
  }
  assert.deepEqual(problems, [], `the English oracle holds (${problems.join('; ')})`);
});

test('the moved-task message renders with its title and direction', () => {
  assert.equal(t('act.movedByDays', { title: 'Task', n: 1, direction: 'later' }), 'Moved “Task” 1 day later');
  assert.equal(t('act.movedByDays', { title: 'Task', n: 2, direction: 'later' }), 'Moved “Task” 2 days later');
  assert.equal(t('act.movedByDays', { title: 'Task', n: 0, direction: 'earlier' }), 'Moved “Task” 0 days earlier');
  assert.equal(t('common.later', {}), 'later');
  assert.equal(t('common.earlier', {}), 'earlier');
});

test('the two-count bulk-invite message composes into the original sentence', () => {
  const composed = `${t('act.bulkInvite.summary', { sent: 3, failed: 1 })} ${t('act.bulkInvite.copyLinks', { n: 1 })}`;
  assert.equal(composed, "3 sent, 1 couldn't be emailed. Copy the missing link.");
  const plural = `${t('act.bulkInvite.summary', { sent: 3, failed: 2 })} ${t('act.bulkInvite.copyLinks', { n: 2 })}`;
  assert.equal(plural, "3 sent, 2 couldn't be emailed. Copy the missing links.");
  const created = `${t('act.bulkInvite.created', { n: 1 })} ${t('act.bulkInvite.copyLink', { n: 1 })}`;
  assert.equal(created, "Invite created, but email couldn't be sent. Copy the link.");
  const createdPlural = `${t('act.bulkInvite.created', { n: 2 })} ${t('act.bulkInvite.copyLink', { n: 2 })}`;
  assert.equal(createdPlural, "Invites created, but email couldn't be sent. Copy the links.");
});

/* ---------- 3. the absence of the hand-written rule ---------- */

/* The English rule written into the source: the idiom this phase removes. */
const IDIOM = "? 's' : ''";

/* The six expressions outside src/actions/actions.js live in five files. */
const CONVERTED_FILES = ['src/overlays/drawer.js', 'src/overlays/modals.js', 'src/pages/auth.js', 'src/actions/drag-drop.js', 'src/actions/teams.js'];

function readSrc(rel) {
  const p = rel.startsWith('src/') ? rel.slice('src/'.length) : rel;
  return fs.readFileSync(path.join(SRC, p), 'utf8');
}

test('no hand-written plural rule survives in the five converted files', () => {
  const offenders = CONVERTED_FILES.filter(f => readSrc(f).includes(IDIOM));
  assert.deepEqual(offenders, [], `the idiom is gone from every converted file (${offenders.join(', ')})`);
});

function jsFilesUnder(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? jsFilesUnder(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
}

test('no hand-written plural rule survives anywhere under src/', () => {
  /* The direct proof of I18N-04's "never by a hand-written rule": every .js
     file under src/ is read and the `n > 1 ? 's' : ''` idiom must appear in
     none of them. It fails the moment one is written back. */
  const offenders = jsFilesUnder(SRC)
    .map(f => path.relative(SRC, f).split(path.sep).join('/'))
    .filter(rel => readSrc(rel).includes(IDIOM));
  assert.deepEqual(offenders, [], `the idiom is gone from every file under src/ (${offenders.join(', ')})`);
});
