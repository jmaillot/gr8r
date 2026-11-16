/* The template-md parser (67-06): a pure string→draft function, tested
   DOM-free the same way src/core/subtree.js is. The contract is the draft
   shape openTemplateEditor consumes — the editor is the review surface, and
   the funnel sanitizes again on save, so the parser only guarantees
   structure, never validity. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTemplateMarkdown, templateExampleText } from '../src/core/template-md.js';

const TASK_MD = [
  '---',
  'kind: task',
  'name: Weekly report',
  'icon: clipboard',
  'color: blue',
  'priority: high',
  '---',
  'The template notes.',
  '',
  '## +2d Collect the numbers',
  '  Pull the metrics before Friday.',
  '## +3d Write the summary',
  '## Send it out',
].join('\n');

const PROJECT_MD = [
  '---',
  'kind: project',
  'name: Website launch',
  '---',
  'A full site rebuild.',
  '',
  '## +1d Kickoff',
  '### +0d Sitemap',
  '  IA review with the team.',
  '### +2d Wireframes',
  '## Build',
  '## Launch',
].join('\n');

test('task kind: front matter drives name/icon/color/priority, headings become subtasks with offsets', () => {
  const d = parseTemplateMarkdown(TASK_MD);
  assert.equal(d.kind, 'task');
  assert.equal(d.name, 'Weekly report');
  assert.equal(d.icon, 'clipboard');
  assert.equal(d.color, 'blue');
  assert.equal(d.body.title, 'Weekly report');
  assert.equal(d.body.notes, 'The template notes.');
  assert.equal(d.body.priority, 'high');
  assert.equal(d.body.subtasks.length, 3);
  const [s1, s2, s3] = d.body.subtasks;
  assert.equal(s1.title, 'Collect the numbers');
  assert.equal(s1.dueOffsetDays, 2);
  assert.equal(s1.note, 'Pull the metrics before Friday.');
  assert.equal(s2.dueOffsetDays, 3);
  /* D-08: a heading with no offset never invents a due date. */
  assert.equal(s3.title, 'Send it out');
  assert.equal('dueOffsetDays' in s3, false);
  /* draft ids/positions are generated; the record is editor-ready */
  assert.deepEqual(d.body.subtasks.map(s => s.position), [0, 1, 2]);
  assert.deepEqual(d.body.subtasks.map(s => s.done), [false, false, false]);
  assert.equal(d.id, null);
  assert.equal(d.position, null);
});

test('project kind: ## tasks carry ### subtask trees, prose becomes the description', () => {
  const d = parseTemplateMarkdown(PROJECT_MD);
  assert.equal(d.kind, 'project');
  assert.equal(d.body.description, 'A full site rebuild.');
  assert.equal(d.body.status, 'planning');
  assert.deepEqual(d.body.teams, []);
  assert.deepEqual(d.body.tasks.map(t => t.title), ['Kickoff', 'Build', 'Launch']);
  assert.equal(d.body.tasks[0].dueOffsetDays, 1);
  const subs = d.body.tasks[0].subtasks;
  assert.deepEqual(subs.map(s => s.title), ['Sitemap', 'Wireframes']);
  assert.equal(subs[0].dueOffsetDays, 0);
  assert.equal(subs[0].note, 'IA review with the team.');
  assert.equal(subs[1].dueOffsetDays, 2);
});

test('no front matter: defaults to the task kind with the layer icon and no colour', () => {
  const d = parseTemplateMarkdown('## Do the thing');
  assert.equal(d.kind, 'task');
  assert.equal(d.name, '');
  assert.equal(d.icon, 'layers');
  assert.equal(d.color, '');
  assert.equal(d.body.subtasks.length, 1);
  assert.equal(d.body.subtasks[0].title, 'Do the thing');
});

test('negative offsets parse and junk offsets drop to no-due (D-08)', () => {
  const d = parseTemplateMarkdown('## -1d Before the fact\n## +abc Not an offset\n## 7d Bare number');
  const [a, b, c] = d.body.subtasks;
  assert.equal(a.dueOffsetDays, -1);
  assert.equal('dueOffsetDays' in b, false);
  assert.equal(c.dueOffsetDays, 7);
});

test('a heading without a title is dropped, not invented as an empty subtask', () => {
  const d = parseTemplateMarkdown('## +3d\n## Real one');
  assert.deepEqual(d.body.subtasks.map(s => s.title), ['Real one']);
});

test('templateExampleText returns parseable example markdown for both kinds', () => {
  for (const which of ['task', 'project']) {
    const text = templateExampleText(which);
    assert.ok(text.includes('kind:'), `${which} example carries front matter`);
    const d = parseTemplateMarkdown(text);
    assert.equal(d.kind, which);
    assert.ok(d.name.length > 0);
    const tree = which === 'task' ? d.body.subtasks : d.body.tasks.flatMap(x => x.subtasks || []);
    assert.ok(d.body[which === 'task' ? 'subtasks' : 'tasks'].length > 0);
    assert.ok(tree.some(s => s.parentId), `${which} example exercises nesting`);
    /* every child links to a real parent in the same tree */
    const ids = new Set(tree.map(s => s.id));
    assert.ok(tree.filter(s => s.parentId).every(s => ids.has(s.parentId)), `${which} child parentId links resolve`);
  }
});

test('nesting: ### nests under the last ## for task kind', () => {
  const md = '## Root one\n  root note\n### Child of one\n  child note\n### Second child\n## Root two\n### Child of two\n#### Grandchild';
  const d = parseTemplateMarkdown(md);
  const [r1, r2] = d.body.subtasks.filter(s => !s.parentId);
  const kids = d.body.subtasks.filter(s => s.parentId === r1.id);
  assert.deepEqual(kids.map(s => s.title), ['Child of one', 'Second child']);
  assert.equal(kids[0].note, 'child note');
  const grand = d.body.subtasks.find(s => s.title === 'Grandchild');
  const kid2 = d.body.subtasks.find(s => s.title === 'Child of two');
  assert.equal(grand.parentId, kid2.id);
  assert.deepEqual(kids.map(s => s.position), [0, 1]);
  /* r2 has one direct child; the Grandchild is a grandchild under it */
  assert.deepEqual(d.body.subtasks.filter(s => s.parentId === r2.id).map(s => s.position), [0]);
});

test('nesting: #### nests under the last ### for project kind, orphan deep headings drop', () => {
  const md = ['---', 'kind: project', 'name: P', '---', '## Task A', '### Sub root', '#### Sub child', '#### Sub child two', '## Task B', '#### Orphan — no ### above'].join('\n');
  const d = parseTemplateMarkdown(md);
  const [ta, tb] = d.body.tasks;
  const root = ta.subtasks.find(s => !s.parentId);
  assert.equal(root.title, 'Sub root');
  const kids = ta.subtasks.filter(s => s.parentId === root.id);
  assert.deepEqual(kids.map(s => s.title), ['Sub child', 'Sub child two']);
  assert.deepEqual(kids.map(s => s.position), [0, 1]);
  /* Task B carries no subtasks — the orphan #### dropped (no ### anchor) */
  assert.deepEqual(tb.subtasks, []);
});

test('orphan ### in task kind (no ## above) drops rather than inventing a parent', () => {
  const d = parseTemplateMarkdown('### Orphan child\n## Real root');
  assert.deepEqual(d.body.subtasks.map(s => s.title), ['Real root']);
});
