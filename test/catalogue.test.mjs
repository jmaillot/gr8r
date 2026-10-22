/* The catalogue contract: the rules that keep a catalogue a lookup rather than a grammar.
   The lint below READS the catalogue files and REPORTS the breaches. It never rewrites a value,
   never translates one and never softens a rule: a value that cannot be made inert is rewritten
   in the catalogue, not in this file. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BASE_LOCALE } from '../src/core/i18n.js';
import { ROOT } from './helpers/server.mjs';

const LOCALES_DIR = path.join(ROOT, 'src', 'locales');
const BASE_FILE = `${BASE_LOCALE}.json`;

/* D-10: the three characters a catalogue value may never carry. The call sites splice the value
   straight into markup, so a value must not be able to close a text node or an attribute. */
const FORBIDDEN = [
  { char: '<', name: 'a left angle bracket' },
  { char: '>', name: 'a right angle bracket' },
  { char: '"', name: 'a double quote' },
];

/* D-05: a key is flat, dotted and namespaced — at least two segments, each starting with a
   lowercase letter. A bare word is rejected: the lucideSubset() scan matches quoted lowercase
   kebab-case tokens against the Lucide names, so a bare word could be mistaken for an icon.
   The dotted key format is the second layer of defence behind the JSON file format. */
const KEY_SHAPE = /^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

/* D-06: the CLDR plural categories. */
const CLDR_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

/* D-07: an ICU construct is an ARGUMENT — a brace group that names a type. The pattern matches
   the argument form only, so a plain English word that happens to be an ICU keyword ("Select")
   and a bare hash ("C#") stay legitimate plain text. */
const ICU_ARGUMENT = /\{[^{}]*,\s*(?:plural|select|selectordinal|offset)\b/i;

/* D-07: the placeholder. */
const PLACEHOLDER = /\{(\w+)\}/g;

/* D-08: the documented exception to the English-base rule — the phase's contract fixtures.
   contract.englishOnly exists only in English and contract.frenchOnly only in French; they exist
   precisely to prove the two directions of the lookup. */
const CONTRACT_NAMESPACE = 'contract.';

/* ---------- the lint ---------- */

function violation(file, key, rule, where, detail) {
  return { file, key, rule, where, detail };
}

function describeViolation(v) {
  return `${v.file} → ${v.key} (${v.where}): ${v.detail}`;
}

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'a nested object';
  return `a ${typeof value}`;
}

/* The placeholders a value carries. A plural value is compared through the union of its
   members' placeholders, because the call site passes one shape of variables. */
function placeholdersOf(value) {
  if (typeof value === 'string') return new Set([...value.matchAll(PLACEHOLDER)].map(m => m[1]));
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const set = new Set();
    for (const member of Object.values(value)) for (const p of placeholdersOf(member)) set.add(p);
    return set;
  }
  return new Set();
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every(p => b.has(p));
}

function listSet(set) {
  return [...set].sort().join(', ');
}

/* The value rules: no markup, no ICU argument, and a member is a string. */
function lintValue(file, key, where, value, out) {
  if (typeof value !== 'string') {
    out.push(violation(file, key, 'value-shape', where, `the value is ${describeType(value)}, not a string`));
    return;
  }
  for (const { char, name } of FORBIDDEN) {
    if (value.includes(char)) {
      out.push(violation(file, key, 'markup', where, `the value carries ${name} (${JSON.stringify(char)})`));
    }
  }
  if (ICU_ARGUMENT.test(value)) {
    out.push(violation(file, key, 'icu', where, `the value carries an ICU argument: ${JSON.stringify(value)}`));
  }
}

/* The per-file rules: the key shape, the plural shape and the value rules. */
function lintCatalogue(name, data) {
  const out = [];
  for (const [key, value] of Object.entries(data)) {
    if (!KEY_SHAPE.test(key)) {
      out.push(violation(name, key, 'key-shape', 'the key', 'the key is not flat, dotted and namespaced'));
    }
    if (typeof value === 'string') {
      lintValue(name, key, 'the value', value, out);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [category, member] of Object.entries(value)) {
        if (!CLDR_CATEGORIES.includes(category)) {
          out.push(violation(name, key, 'plural-members', `the plural member ${category}`, `"${category}" is not a CLDR category`));
        }
        lintValue(name, key, `the plural member ${category}`, member, out);
      }
      if (!Object.hasOwn(value, 'other')) {
        out.push(violation(name, key, 'plural-other', 'the plural value', 'the plural value carries no other member'));
      }
    } else {
      out.push(violation(name, key, 'value-shape', 'the value', `the value is ${describeType(value)}, not a string or a plural object`));
    }
  }
  return out;
}

/* The cross-file rules: the English catalogue is the base, and a shared key carries the same
   placeholders in both languages. */
function lintAgainstBase(name, data, base) {
  const out = [];
  if (name === BASE_FILE) return out;
  for (const key of Object.keys(data)) {
    if (key.startsWith(CONTRACT_NAMESPACE)) continue;
    if (!Object.hasOwn(base, key)) {
      out.push(violation(name, key, 'english-base', 'the key', `the English catalogue carries no ${key}`));
    }
  }
  for (const key of Object.keys(data)) {
    if (!Object.hasOwn(base, key)) continue;
    const mine = placeholdersOf(data[key]);
    const theirs = placeholdersOf(base[key]);
    if (!sameSet(mine, theirs)) {
      out.push(violation(name, key, 'placeholders', 'the value', `the placeholders differ: {${listSet(mine)}} against {${listSet(theirs)}}`));
    }
  }
  return out;
}

/* The lint applied to a synthetic catalogue: a rule is proven on a fixture, never by editing a
   real catalogue. */
function lintSynthetic(data, name = 'fr.json', base = {}) {
  return [...lintCatalogue(name, data), ...lintAgainstBase(name, data, base)];
}

function catalogueFiles() {
  return fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name)
    .sort();
}

function readCatalogue(name) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), 'utf8'));
}

/* Every locale file on disk is linted, so a new catalogue is covered the day it lands. */
function lintAll() {
  const files = catalogueFiles();
  const catalogues = new Map(files.map(name => [name, readCatalogue(name)]));
  const base = catalogues.get(BASE_FILE) || {};
  const violations = [];
  for (const [name, data] of catalogues) {
    violations.push(...lintCatalogue(name, data), ...lintAgainstBase(name, data, base));
  }
  return { files, catalogues, violations };
}

/* ---------- the markup-injection lint (D-10, I18N-06) ---------- */

test('the lint rejects a value carrying a left angle bracket', () => {
  const breaches = lintSynthetic({ 'nav.projects': 'a < b' }, 'en.json').filter(v => v.rule === 'markup');
  assert.equal(breaches.length, 1, `the breach is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
  assert.equal(breaches[0].file, 'en.json');
  assert.equal(breaches[0].key, 'nav.projects');
  assert.match(breaches[0].detail, /left angle bracket/);
  assert.match(breaches[0].detail, /</);
});

test('the lint rejects a value carrying a right angle bracket', () => {
  const breaches = lintSynthetic({ 'nav.projects': 'Projects > Files' }, 'en.json').filter(v => v.rule === 'markup');
  assert.equal(breaches.length, 1, `the breach is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
  assert.equal(breaches[0].key, 'nav.projects');
  assert.match(breaches[0].detail, /right angle bracket/);
  assert.match(breaches[0].detail, />/);
});

test('the lint rejects a value carrying a double quote', () => {
  const breaches = lintSynthetic({ 'nav.projects': 'The "Projects" panel' }, 'en.json').filter(v => v.rule === 'markup');
  assert.equal(breaches.length, 1, `the breach is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
  assert.equal(breaches[0].key, 'nav.projects');
  assert.match(breaches[0].detail, /double quote/);
  assert.match(breaches[0].detail, /"/);
});

test('the lint walks the members of a plural object, not only the top-level values', () => {
  const breaches = lintSynthetic({ 'task.count': { one: 'a < b', other: '{n} tasks' } }, 'en.json').filter(v => v.rule === 'markup');
  assert.equal(breaches.length, 1, `the breach is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
  assert.equal(breaches[0].key, 'task.count');
  assert.equal(breaches[0].where, 'the plural member one');
  assert.match(breaches[0].detail, /left angle bracket/);
});

/* ---------- the key shape (D-05) ---------- */

test('the lint rejects a key that is not flat, dotted and namespaced', () => {
  const rejected = ['cancel', 'nav.', 'nav..projects', 'nav projects', 'Nav.projects', 'nav.1projects'];
  for (const key of rejected) {
    const breaches = lintSynthetic({ [key]: 'a value' }, 'en.json').filter(v => v.rule === 'key-shape');
    assert.equal(breaches.length, 1, `the key ${key} is rejected (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
    assert.equal(breaches[0].key, key);
    assert.equal(breaches[0].file, 'en.json');
  }
});

test('the lint accepts a flat, dotted and namespaced key', () => {
  for (const key of ['nav.projects', 'settings.language.title', 'contract.englishOnly']) {
    const breaches = lintSynthetic({ [key]: 'a value' }, 'en.json').filter(v => v.rule === 'key-shape');
    assert.deepEqual(breaches, [], `${key} is a legitimate key (${breaches.map(describeViolation).join(' | ')})`);
  }
});

/* ---------- the plural shape (D-06) ---------- */

test('the lint rejects a plural value whose members are not CLDR categories', () => {
  const breaches = lintSynthetic({ 'task.count': { one: '{n} task', other: '{n} tasks', singular: '{n} task' } }, 'en.json').filter(
    v => v.rule === 'plural-members',
  );
  assert.equal(breaches.length, 1, `the breach is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
  assert.equal(breaches[0].key, 'task.count');
  assert.match(breaches[0].detail, /singular/);
});

test('the lint rejects a plural value with no other member', () => {
  const breaches = lintSynthetic({ 'task.count': { one: '{n} task' } }, 'en.json').filter(v => v.rule === 'plural-other');
  assert.equal(breaches.length, 1, `the breach is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
  assert.equal(breaches[0].key, 'task.count');
});

test('the lint rejects a value that is neither a string nor a plural object', () => {
  const rejected = [['a', 'b'], 3, null, { one: { other: 'nested' } }];
  for (const value of rejected) {
    const breaches = lintSynthetic({ 'nav.projects': value }, 'en.json').filter(v => v.rule === 'value-shape');
    assert.equal(breaches.length, 1, `the value ${JSON.stringify(value)} is rejected (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
    assert.equal(breaches[0].key, 'nav.projects');
  }
});

/* ---------- the English base (D-08) ---------- */

test('the lint rejects a key the English catalogue does not carry', () => {
  const base = { 'nav.projects': 'Projects' };
  const breaches = lintSynthetic({ 'nav.projects': 'Projets', 'nav.extra': 'Extra' }, 'fr.json', base).filter(v => v.rule === 'english-base');
  assert.equal(breaches.length, 1, `the breach is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
  assert.equal(breaches[0].key, 'nav.extra');
  assert.equal(breaches[0].file, 'fr.json');
});

test('the contract fixture namespace is the documented exception to the English-base rule', () => {
  const base = { 'nav.projects': 'Projects' };
  const breaches = lintSynthetic({ 'contract.frenchOnly': 'Français seulement' }, 'fr.json', base).filter(v => v.rule === 'english-base');
  assert.deepEqual(breaches, [], `the contract namespace is exempt (${breaches.map(describeViolation).join(' | ')})`);
});

test('the English catalogue may carry keys a non-base catalogue does not', () => {
  const base = { 'nav.projects': 'Projects', 'app.name': 'Gr8r Studio' };
  const breaches = lintSynthetic({ 'nav.projects': 'Projets' }, 'fr.json', base).filter(v => v.rule === 'english-base');
  assert.deepEqual(breaches, [], `the English fallback case is not a breach (${breaches.map(describeViolation).join(' | ')})`);
});

/* ---------- the placeholder parity (D-07) ---------- */

test('the lint rejects a value whose placeholders drift from the English one', () => {
  const base = { 'greeting.hello': 'Hello, {name}!', 'task.count': { one: '{n} task', other: '{n} tasks' } };
  const drifted = [
    { 'greeting.hello': 'Bonjour !' },
    { 'greeting.hello': 'Bonjour, {nom} !' },
    { 'task.count': { one: '{count} tâche', other: '{n} tâches' } },
  ];
  for (const data of drifted) {
    const breaches = lintSynthetic(data, 'fr.json', base).filter(v => v.rule === 'placeholders');
    assert.equal(breaches.length, 1, `the drift is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
    assert.equal(breaches[0].key, Object.keys(data)[0]);
  }
});

test('the lint accepts a value carrying the same placeholders as the English one', () => {
  const base = { 'greeting.hello': 'Hello, {name}!', 'task.count': { one: '{n} task', other: '{n} tasks' } };
  const aligned = [{ 'greeting.hello': 'Bonjour, {name} !' }, { 'task.count': { one: '{n} tâche', other: '{n} tâches', many: '{n} de tâches' } }];
  for (const data of aligned) {
    const breaches = lintSynthetic(data, 'fr.json', base).filter(v => v.rule === 'placeholders');
    assert.deepEqual(breaches, [], `the placeholders agree (${breaches.map(describeViolation).join(' | ')})`);
  }
});

/* ---------- the interpolation subset (D-07) ---------- */

test('the lint rejects a value carrying an ICU argument', () => {
  const value = '{count, plural, one {# task} other {# tasks}}';
  const breaches = lintSynthetic({ 'task.count': value }, 'en.json').filter(v => v.rule === 'icu');
  assert.equal(breaches.length, 1, `the breach is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
  assert.equal(breaches[0].key, 'task.count');
  assert.match(breaches[0].detail, /ICU argument/);
});

test('the lint accepts a plain English word that reads like an ICU keyword', () => {
  /* "Select…" is the literal the app renders at src/overlays/popovers.js:414 and a phase-6
     catalogue value: the keyword is plain text, and the lint must not block it. */
  for (const value of ['Select', 'Select…', 'Select a project']) {
    const breaches = lintSynthetic({ 'settings.select': value }, 'en.json').filter(v => v.rule === 'icu');
    assert.deepEqual(breaches, [], `${value} is plain text, not an ICU argument (${breaches.map(describeViolation).join(' | ')})`);
  }
});

test('the lint accepts a bare hash', () => {
  for (const value of ['C#', 'F#']) {
    const breaches = lintSynthetic({ 'common.hash': value }, 'en.json').filter(v => v.rule === 'icu');
    assert.deepEqual(breaches, [], `${value} is plain text (${breaches.map(describeViolation).join(' | ')})`);
  }
});

/* ---------- the seed catalogues ---------- */

test('the seed catalogues pass every rule', () => {
  const { files, violations } = lintAll();
  assert.deepEqual(violations, [], `the seed catalogues are clean (${violations.map(describeViolation).join(' | ')})`);
  assert.ok(files.length >= 2, `every locale file is linted (${files.join(', ')})`);
});
