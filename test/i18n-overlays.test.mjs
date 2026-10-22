/* =====================================================================
   The overlay contract (plan 06-13): the task list and the context menu
   (task 1), the drawer and the modals (task 2) and the palette and the
   popovers (task 3) read the English catalogue — while the machine
   identifiers stay exactly as they are: the context menu's action keys
   and icon names, the sort headers' machine keys, the stored permission
   values the share modal compares against, and the keyboard keys.

   Families:
     1. the English oracle — every new value renders its previous English,
        and the values this wave reuses still render theirs;
     2. the absence — the scanner reports no finding for the swept files
        and the allow-list carries none of them;
     3. the machine identifiers — the action keys, the icon names, the
        sort keys, the stored permission values and the keyboard keys
        are byte-identical to what they were.
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

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ---------- task 1: the task list and the context menu ---------- */

const TASK1_FILES = ['src/components/task-list.js', 'src/overlays/context-menu.js'];

/* [key, vars, previous English]. The reused keys are wired here too — the
   oracle is the whole surface this task touches. */
const TASK1_ORACLE = [
  // the task list's column headers (page.field.* reuse)
  ['page.field.status', undefined, 'Status'],
  ['page.field.assignee', undefined, 'Assignee'],
  ['page.field.priority', undefined, 'Priority'],
  ['page.field.due', undefined, 'Due date'],
  ['page.field.labels', undefined, 'Labels'],
  ['page.field.project', undefined, 'Project'],
  // the title column's header
  ['page.columns.task', undefined, 'Task'],
  // the row cells
  ['a11y.taskStatus', { status: 'In Progress' }, 'Status: In Progress'],
  ['common.unassigned', undefined, 'Unassigned'],
  ['common.setDate', undefined, 'Set date'],
  ['act.add', undefined, 'Add'],
  ['a11y.markComplete', { title: 'Design the logo' }, 'Mark Design the logo complete'],
  ['a11y.selectTask', { title: 'Design the logo' }, 'Select Design the logo'],
  ['a11y.hideSubtasks', undefined, 'Hide subtasks'],
  ['a11y.showSubtasks', undefined, 'Show subtasks'],
  ['a11y.taskTitle', undefined, 'Task title'],
  ['a11y.repeats', { freq: 'weekly' }, 'Repeats weekly'],
  ['a11y.moreActions', undefined, 'More actions'],
  ['a11y.completeTask', { title: 'Design the logo' }, 'Complete Design the logo'],
  ['a11y.priorityTip', { priority: 'High' }, 'High priority'],
  // the empty state and the composer
  ['page.tasks.emptyTitle', undefined, 'No tasks here'],
  ['page.tasks.emptyBody', undefined, 'Add a task to get things moving.'],
  ['act.newTask', undefined, 'New task'],
  ['a11y.composerPlaceholder', undefined, 'Task name — press Enter to add, Esc to cancel'],
  ['a11y.newTaskName', undefined, 'New task name'],
  ['act.addTask', undefined, 'Add task'],
  // the list frame, the group header and the bulk bar
  ['a11y.selectAll', undefined, 'Select all'],
  ['a11y.toggleGroup', undefined, 'Toggle group'],
  ['a11y.addTaskTo', { name: 'Design' }, 'Add task to Design'],
  ['a11y.bulkActions', undefined, 'Bulk actions'],
  ['act.selectedCount', { n: 3 }, '3 selected'],
  ['a11y.clearSelection', undefined, 'Clear selection'],
  ['act.delete', undefined, 'Delete'],
  // the activity line
  ['common.you', undefined, 'You'],
  ['common.someone', undefined, 'Someone'],
  // the context menu — the label is display text
  ['toast.open', undefined, 'Open'],
  ['act.edit', undefined, 'Edit'],
  ['act.markComplete', undefined, 'Mark complete'],
  ['act.reopen', undefined, 'Reopen'],
  ['act.statusMenu', undefined, 'Status…'],
  ['act.assignTo', undefined, 'Assign to…'],
  ['act.priorityMenu', undefined, 'Priority…'],
  ['act.moveToProject', undefined, 'Move to project…'],
  ['act.addToFavorites', undefined, 'Add to favorites'],
  ['act.removeFromFavorites', undefined, 'Remove from favorites'],
  ['act.copyLink', undefined, 'Copy link'],
  ['act.duplicate', undefined, 'Duplicate'],
  ['act.archive', undefined, 'Archive'],
  ['act.renameEdit', undefined, 'Rename & edit'],
  ['act.share', undefined, 'Share'],
  ['act.moveUpSidebar', undefined, 'Move up in sidebar'],
  ['act.moveDownSidebar', undefined, 'Move down in sidebar'],
  ['act.archiveProject', undefined, 'Archive project'],
  ['act.deleteProject', undefined, 'Delete project'],
  ['act.collapseColumn', undefined, 'Collapse column'],
  ['act.markAllDone', undefined, 'Mark all as done'],
  ['act.archiveCompleted', undefined, 'Archive completed'],
  ['act.sortByPriority', undefined, 'Sort by priority'],
  ['act.viewProfile', undefined, 'View profile'],
  ['act.assignTask', undefined, 'Assign a task'],
  ['act.copyEmail', undefined, 'Copy email'],
  ['act.changeRole', undefined, 'Change role…'],
  ['act.resendInvite', undefined, 'Resend invite'],
  ['act.removeFromWorkspace', undefined, 'Remove from workspace'],
  ['act.preview', undefined, 'Preview'],
  ['act.rename', undefined, 'Rename'],
  ['act.deleteView', undefined, 'Delete view'],
  ['act.renameView', undefined, 'Rename view'],
];

test('task 1: the oracle renders the previous English', () => {
  for (const [key, vars, expected] of TASK1_ORACLE) {
    assert.equal(t(key, vars), expected, key);
  }
});

test('task 1: every oracle key exists in the English catalogue file', () => {
  for (const [key] of TASK1_ORACLE) {
    assert.ok(Object.hasOwn(en, key), key);
  }
});

test('task 1: no two keys of the wave carry the same value', () => {
  const seen = new Map();
  for (const [key, , expected] of TASK1_ORACLE) {
    if (seen.has(expected)) assert.fail(`${key} duplicates ${seen.get(expected)} (${expected})`);
    seen.set(expected, key);
  }
});

test('task 1: the scanner reports no finding for the two files', () => {
  for (const file of TASK1_FILES) {
    const found = scanSource(read(file), file).filter(f => f.kind.startsWith('rule'));
    assert.deepEqual(
      found.map(f => `${f.line}:${f.text}`),
      [],
      file,
    );
  }
});

test('task 1: the allow-list carries no entry of the two files and stays sorted', () => {
  const list = JSON.parse(read('test/fixtures/i18n-pending.json'));
  const offending = list.filter(e => TASK1_FILES.includes(e.file));
  assert.deepEqual(offending, []);
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual([...keys].sort(), keys, 'the allow-list is sorted by file then text');
});

test('task 1: the context menu action keys and icon names are byte-identical', () => {
  const src = read('src/overlays/context-menu.js');
  const pairs = [...src.matchAll(/I\('([^']+)', '([^']+)'/g)].map(m => [m[1], m[2]]);
  // the action keys and the icon names, in source order (the toggleDone row's
  // icon is a ternary over the task's status and is asserted separately)
  assert.deepEqual(pairs, [
    ['openTask', 'panel-right-open'],
    ['editTask', 'pencil'],
    ['ctxStatus', 'circle-dot'],
    ['ctxAssign', 'user'],
    ['ctxPrio', 'signal-high'],
    ['ctxMove', 'folder-input'],
    ['toggleFavTask', 'star'],
    ['copyLink', 'link'],
    ['dupTask', 'copy'],
    ['archiveTask', 'archive'],
    ['delTask', 'trash-2'],
    ['openProject', 'arrow-up-right'],
    ['toggleFavProj', 'star'],
    ['editProject', 'pencil'],
    ['share', 'share-2'],
    ['copyLink', 'link'],
    ['dupProject', 'copy'],
    ['projUp', 'arrow-up'],
    ['projDown', 'arrow-down'],
    ['archiveProject', 'archive'],
    ['delProject', 'trash-2'],
    ['colAdd', 'plus'],
    ['colCollapse', 'fold-horizontal'],
    ['colDoneAll', 'check-check'],
    ['colArchive', 'archive'],
    ['colSortPrio', 'arrow-down-wide-narrow'],
    ['viewProfile', 'user'],
    ['assignToMember', 'plus'],
    ['copyEmail', 'mail'],
    ['ctxRole', 'shield'],
    ['resendInvite', 'send'],
    ['removeMember', 'user-minus'],
    ['previewFile', 'eye'],
    ['renameFile', 'pencil'],
    ['copyLink', 'link'],
    ['dupFile', 'copy'],
    ['delFile', 'trash-2'],
  ]);
  assert.ok(/I\('toggleDone', t\.status === 'done' \? 'rotate-ccw' : 'circle-check'/.test(src), 'the toggleDone action key and its status ternary icons moved');
  // the Del key hint is a keyboard key, not a label
  assert.ok(src.includes(", 'danger', 'Del'"), 'the Del key hint moved');
});
