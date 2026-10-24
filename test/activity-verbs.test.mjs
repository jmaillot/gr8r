/* =====================================================================
   The contract of the activity journal (plan 09-03): the writers store
   machine verbs — camelCase suffixes of their act.verb.* keys — with
   structured { kind, ... } extras, and the render/filter layer classifies
   the STORED verb through one explicit table. The legacy English fragments
   keep their act.verb.* keys and their filter membership, so no migration
   of stored documents is needed and no written verb can escape the en+fr
   catalogue parity.

   The dynamic module imports need the same virtual:icons loader and the
   document stubs the vocabulary suite sets up.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import { t } from '../src/core/i18n.js';

/* The modules that depend on the Vite-generated virtual:icons module are loaded
   dynamically after the stub loader is registered — under plain Node, the
   default ESM loader cannot resolve 'virtual:icons'. The DOM-touching core
   modules (utils.js) run their font/link setup at import time, so the document
   is stubbed before the dynamic imports load. */
globalThis.document = {
  querySelectorAll: () => [],
  documentElement: { lang: 'en' },
  addEventListener: () => {},
  removeEventListener: () => {},
  body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
};
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ addEventListener: () => {} }) };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ addEventListener: () => {} });
register('./virtual-icons-loader.mjs', import.meta.url);
const { VERB_KEYS, actCategory, actExtraHtml } = await import('../src/components/task-list.js');
const { esc } = await import('../src/core/utils.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

function walkJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/* The first argument of a logAct( call — the call stops at the first top-level
   comma, honouring quotes and nesting. The verb is a string literal or one of
   the branches of a ternary; the condition's comparison operands (a field key,
   never a verb) are skipped. */
function firstArg(src, start) {
  let depth = 1;
  let quote = null;
  let arg = '';
  for (let i = start; i < src.length && depth > 0; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') {
        arg += c + (src[i + 1] || '');
        i++;
        continue;
      }
      if (c === quote) quote = null;
      arg += c;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      arg += c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) break;
    } else if (c === ',' && depth === 1) break;
    arg += c;
  }
  return arg;
}

/* Every verb the writers store, extracted from the logAct( call sites in src/
   and the canalized activity.unshift bypass sites in src/actions. */
function writtenVerbs() {
  const verbs = new Set();
  const actionsDir = path.join(ROOT, 'src', 'actions');
  for (const file of walkJs(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\blogAct\s*\(/g)) {
      const arg = firstArg(src, m.index + m[0].length);
      for (const lit of arg.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
        const before = arg.slice(Math.max(0, lit.index - 6), lit.index);
        if (/(===|!==|==|!=)\s*$/.test(before)) continue;
        verbs.add(lit[1].replace(/\\'/g, "'"));
      }
    }
    if (file.startsWith(actionsDir)) {
      for (const m of src.matchAll(/verb:\s*'((?:[^'\\]|\\.)*)'/g)) verbs.add(m[1].replace(/\\'/g, "'"));
    }
  }
  return verbs;
}

/* A test-local copy of the English-parsing filters the activity page runs today
   (activity.js) — the classifier must reproduce this selection exactly, quirk
   included: a task moved BETWEEN projects logs `moved` and the status filter
   keeps selecting it. The copy lives here so the equivalence is measured
   against the code being replaced, not against the replacement's intent. */
const oldClassify = verb =>
  verb.includes('comment') ? 'comments' : /moved|completed|reopened/.test(verb) ? 'status' : verb.includes('project') ? 'projects' : null;

/* The stored vocabulary, both shapes: the legacy English fragments the
   pre-milestone documents hold (seed.js included) and the machine verbs the
   converted writers store — the classifier table must cover both. */
const LEGACY_VERBS = [
  'created',
  'created project',
  'completed',
  'moved',
  'assigned',
  'changed priority of',
  'changed due date of',
  'changed start date of',
  'updated labels on',
  'renamed',
  'set repeat on',
  'estimated',
  'updated dependencies of',
  'archived',
  'restored',
  'commented on',
  'added a file to',
  'removed a file from',
  'added subtask to',
  'converted a subtask of',
  'assigned a subtask on',
  'set a subtask due date on',
  'completed subtask on',
  'reopened subtask on',
  'changed status of project',
];
const MACHINE_VERBS = [
  'created',
  'createdProject',
  'completed',
  'moved',
  'assigned',
  'changedPriorityOf',
  'changedDueDateOf',
  'changedStartDateOf',
  'updatedLabelsOn',
  'renamed',
  'setRepeatOn',
  'estimated',
  'updatedDependenciesOf',
  'archived',
  'restored',
  'commentedOn',
  'addedAFileTo',
  'removedAFileFrom',
  'addedSubtaskTo',
  'convertedASubtaskOf',
  'assignedASubtaskOn',
  'setASubtaskDueDateOn',
  'completedSubtaskOn',
  'reopenedSubtaskOn',
  'projectStatusChanged',
];

/* ---------- 1. the classifier ---------- */

test('actCategory exists and reproduces the old English parsing for every verb of both vocabularies', () => {
  assert.equal(typeof actCategory, 'function', 'the classifier is not exported');
  for (const verb of [...LEGACY_VERBS, ...MACHINE_VERBS])
    assert.equal(actCategory(verb), oldClassify(verb), `actCategory(${JSON.stringify(verb)}) moved from the old selection`);
});

test('the D-06 quirk pins the exact selections the filters make today', () => {
  assert.equal(actCategory('moved'), 'status', 'a project move is still a status entry (quirk preserved)');
  assert.equal(actCategory('commented on'), 'comments');
  assert.equal(actCategory('changed status of project'), 'projects', 'the unmapped legacy verb must classify');
  assert.equal(actCategory('changedPriorityOf'), null, 'priority changes sit outside the three filters');
  assert.equal(actCategory('createdProject'), null, 'the old includes(project) is case-sensitive — the machine verb escapes it (quirk frozen)');
  assert.equal(actCategory('projectStatusChanged'), 'projects');
  assert.equal(actCategory('created'), null);
});

/* ---------- 2. the writers store classified verbs ---------- */

test('the writers store machine verbs — the priority path is converted first', () => {
  const verbs = writtenVerbs();
  assert.ok(verbs.has('changedPriorityOf'), 'the machine priority verb is not written yet');
  for (const verb of verbs) {
    assert.ok(LEGACY_VERBS.includes(verb) || MACHINE_VERBS.includes(verb), `the writers store a verb outside the known vocabulary: ${JSON.stringify(verb)}`);
    const key = VERB_KEYS[verb];
    assert.ok(key, `a written verb has no act.verb.* mapping: ${JSON.stringify(verb)}`);
    assert.ok(en[key], `the mapping key has no en entry: ${key}`);
    assert.ok(fr[key], `the mapping key has no fr entry: ${key}`);
  }
});

/* ---------- 3. the structured extra path ---------- */

test('the priority extra renders the translated priority value', () => {
  assert.equal(
    actExtraHtml({ kind: 'prioritySet', value: 'urgent' }),
    `<span class="muted">${esc(t('act.extra.to', { value: t('task.priority.urgent') }))}</span>`,
    'the priority extra is not composing through act.extra.to with the translated priority id',
  );
});

test('a hostile extra value is escaped at the interpolation point', () => {
  const html = actExtraHtml({ kind: 'prioritySet', value: '<script>' });
  assert.doesNotMatch(html, /<script>/, 'a stored value reached the DOM unescaped');
});

test('an unknown extra kind renders nothing — never echoed, never interpolated', () => {
  assert.equal(actExtraHtml({ kind: 'aKindThatNeverShips', value: 'x' }), '', 'an unknown kind must be suppressed, not echoed');
});

test('the recur extra keeps its resolver', () => {
  assert.equal(actExtraHtml({ kind: 'recur', id: 'daily' }), `<span class="muted">${t('popover.recurDaily')}</span>`);
});

test('a legacy string extra renders nothing — suppressed, never divulged', () => {
  assert.equal(actExtraHtml('to Review'), '');
  assert.equal(actExtraHtml('30m'), '');
});

test('the structured extras the converted seed stores render translated', () => {
  assert.equal(
    actExtraHtml({ kind: 'statusMoved', from: 'todo', to: 'review' }),
    `<span class="muted">${esc(t('act.extra.statusMoved', { from: t('task.status.todo'), to: t('task.status.review') }))}</span>`,
    'the converted seed extras must render through the catalogue, not just be suppressed',
  );
});
