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

/* ---------- task 2 + 3: the drawer, the modals, the palette and the popovers ---------- */

const WAVE_FILES = [
  'src/components/task-list.js',
  'src/overlays/context-menu.js',
  'src/overlays/drawer.js',
  'src/overlays/modals.js',
  'src/overlays/palette.js',
  'src/overlays/popovers.js',
];

/* [key, vars, previous English] — the drawer and modal values (task 2). */
const TASK2_ORACLE = [
  ['page.drawer.subtaskHeading', { title: 'T-1 Fix' }, 'Subtask: T-1 Fix'],
  ['page.drawer.taskHeading', { title: 'T-1 Fix' }, 'Task: T-1 Fix'],
  ['a11y.unfavorite', undefined, 'Unfavorite'],
  ['a11y.favorite', undefined, 'Favorite'],
  ['a11y.sidePanel', undefined, 'Side panel'],
  ['a11y.fullPage', undefined, 'Full page'],
  ['a11y.toggleFullPage', undefined, 'Toggle full page'],
  ['a11y.closeTip', undefined, 'Close  Esc'],
  ['a11y.close', undefined, 'Close'],
  ['act.completedAgo', { when: '2h ago' }, 'Completed 2h ago.'],
  ['act.reopenTask', undefined, 'Reopen task'],
  ['act.reschedule', undefined, 'Reschedule'],
  ['act.addLabels', undefined, 'Add labels'],
  ['page.field.repeat', undefined, 'Repeat'],
  ['act.addEstimate', undefined, 'Add estimate'],
  ['page.field.blockedBy', undefined, 'Blocked by'],
  ['a11y.formatting', undefined, 'Formatting'],
  ['modal.description', undefined, 'Description'],
  ['a11y.bold', undefined, 'Bold'],
  ['a11y.italic', undefined, 'Italic'],
  ['a11y.bulletedList', undefined, 'Bulleted list'],
  ['a11y.numberedList', undefined, 'Numbered list'],
  ['a11y.heading', undefined, 'Heading'],
  ['a11y.link', undefined, 'Link'],
  ['a11y.descPlaceholder', undefined, 'Add a description…'],
  ['modal.subtasks', undefined, 'Subtasks'],
  ['a11y.subtaskReopen', { title: 'Draft' }, 'Reopen subtask Draft'],
  ['a11y.subtaskComplete', { title: 'Draft' }, 'Complete subtask Draft'],
  ['a11y.openSubtaskDetails', undefined, 'Open subtask details'],
  ['a11y.addSubtask', undefined, 'Add subtask'],
  ['modal.attachments', undefined, 'Attachments'],
  ['act.upload', undefined, 'Upload'],
  ['a11y.removeAttachment', undefined, 'Remove attachment'],
  ['modal.dropToAttach', undefined, 'Drop files or click to attach'],
  ['modal.activity', undefined, 'Activity'],
  ['page.drawer.noComments', undefined, 'No comments yet. Start the conversation.'],
  ['a11y.commentPlaceholder', undefined, 'Leave a comment… type @ to mention'],
  ['act.comment', undefined, 'Comment'],
  ['a11y.mentionSomeone', undefined, 'Mention someone'],
  ['a11y.mention', undefined, 'Mention'],
  ['a11y.attachFile', undefined, 'Attach file'],
  ['act.taskCreated', undefined, 'Task created'],
  ['a11y.deleteComment', undefined, 'Delete comment'],
  ['a11y.addReaction', undefined, 'Add reaction'],
  ['modal.saveView', undefined, 'Save view'],
  ['modal.saveViewHint', undefined, 'Save the current filters as a tab on this project.'],
  ['a11y.viewNameExample', undefined, 'e.g. Design review queue'],
  ['modal.layout', undefined, 'Layout'],
  ['nav.tab.table', undefined, 'Table'],
  ['modal.saveViewNoFilters', undefined, 'No filters are active — the view will show all tasks. You can add filters after saving.'],
  ['act.editTask', undefined, 'Edit task'],
  ['modal.taskName', undefined, 'Task name'],
  ['a11y.descOptional', undefined, 'Add a description… (optional)'],
  ['modal.duePrefix', undefined, 'Due '],
  ['modal.startsPrefix', undefined, 'Starts '],
  ['act.remove', undefined, 'Remove'],
  ['a11y.subtaskEnter', undefined, 'Add a subtask and press Enter'],
  ['modal.attachFiles', undefined, 'Attach files'],
  ['act.createMore', undefined, 'Create more'],
  ['act.projectSettings', undefined, 'Project settings'],
  ['act.newProject', undefined, 'New project'],
  ['modal.projectHint', undefined, 'Projects hold tasks, files, and conversations for one body of work.'],
  ['modal.projectName', undefined, 'Project name'],
  ['a11y.projectDescExample', undefined, 'What is this project about?'],
  ['modal.icon', undefined, 'Icon'],
  ['modal.color', undefined, 'Color'],
  ['modal.lead', undefined, 'Lead'],
  ['modal.leadLockHint', undefined, 'Only the project lead, an admin or the owner can change this.'],
  ['modal.targetDate', undefined, 'Target date'],
  ['modal.template', undefined, 'Template'],
  ['err.projectNotFound', undefined, 'Project not found'],
  ['modal.shareLockHint', undefined, 'Only the project lead, an admin or the owner can change who has access.'],
  ['modal.shareTitle', { name: 'Acme' }, 'Share “Acme”'],
  ['a11y.inviteByEmail', undefined, 'Invite by email'],
  ['a11y.invitePlaceholder', undefined, 'Add people by name or email'],
  ['modal.permission', undefined, 'Permission'],
  ['act.invite', undefined, 'Invite'],
  ['modal.pressInvite', { email: 'a@b.c' }, 'Press Invite to send an invitation to a@b.c'],
  ['modal.noMatchingMembers', undefined, 'No matching members — enter an email to invite someone new'],
  ['modal.peopleWithAccess', undefined, 'People with access'],
  ['modal.projectLead', undefined, '· Project lead'],
  ['modal.permissionFor', { name: 'Carol' }, 'Permission for Carol'],
  ['act.removeAccess', undefined, 'Remove access'],
  ['modal.generalAccess', undefined, 'General access'],
  ['modal.onlyInvited', undefined, 'Only people invited'],
  ['modal.everyoneAt', { name: 'Acme' }, 'Everyone at Acme'],
  ['modal.privateHint', undefined, 'Only people listed above can open this project.'],
  ['modal.workspaceHint', undefined, 'Anyone in the workspace can view and comment.'],
  ['act.done', undefined, 'Done'],
  ['modal.inviteTo', { name: 'Acme' }, 'Invite to Acme'],
  ['modal.inviteMailHint', undefined, "We'll email each person a private, single-use link. Links expire automatically."],
  ['modal.inviteLinkHint', undefined, 'Create a link for each person, then send it yourself. Links expire automatically.'],
  ['modal.inviteLocalHint', undefined, 'Invited people get an email with a link to join.'],
  ['modal.emailAddresses', undefined, 'Email addresses'],
  ['modal.emailHint', undefined, 'Separate multiple addresses with commas.'],
  ['modal.role', undefined, 'Role'],
  ['modal.guests', undefined, 'Guests'],
  ['modal.guestsHint', undefined, "can only see projects they're added to and can't create projects."],
  ['modal.inviteLinks', undefined, 'Invite links'],
  ['modal.sent', undefined, 'Sent'],
  ['modal.notSent', undefined, 'Not sent'],
  ['modal.inviteLink', undefined, 'Invite link'],
  ['modal.inviteLinkFor', { email: 'a@b.c' }, 'Invite link for a@b.c'],
  ['act.copy', undefined, 'Copy'],
  ['modal.linksHintMail', undefined, 'Emails sent. Copy a link as a backup if you need it.'],
  ['modal.linksHintPartial', undefined, 'Some emails could not be sent. Copy those links and send them yourself.'],
  ['modal.linksHintLink', undefined, 'Each address has its own single-use link.'],
  ['modal.linksHintManual', undefined, 'This link works until it expires.'],
  ['act.copyInviteLink', undefined, 'Copy invite link'],
  ['act.sendInvites', undefined, 'Send invites'],
  ['act.createLinks', undefined, 'Create links'],
  ['modal.confirmTypeLead', undefined, 'Type'],
  ['modal.confirmTypeTail', undefined, 'to confirm'],
  ['act.toggleDarkMode', undefined, 'Toggle dark mode'],
  ['modal.sc.general', undefined, 'General'],
  ['modal.sc.create', undefined, 'Create'],
  ['modal.sc.navigate', undefined, 'Navigate'],
  ['modal.sc.closePanel', undefined, 'Close panel or dialog'],
  ['modal.sc.submitForm', undefined, 'Submit form'],
  ['modal.sc.sendComment', undefined, 'Send comment'],
  ['nav.goSettings', undefined, 'Go to Settings'],
  ['modal.sc.moveSelection', undefined, 'Move selection'],
  ['modal.sc.runCommand', undefined, 'Run command'],
  ['modal.sc.searchMode', undefined, 'Search mode'],
  ['modal.uploadedBy', { name: 'Sam' }, '· Uploaded by Sam'],
  ['modal.attachedTo', undefined, 'Attached to'],
  ['common.perm.view', undefined, 'Can view'],
  ['common.perm.comment', undefined, 'Can comment'],
  ['common.perm.edit', undefined, 'Can edit'],
  ['common.perm.access', undefined, 'Full access'],
];

test('task 2: the oracle renders the previous English', () => {
  for (const [key, vars, expected] of TASK2_ORACLE) assert.equal(t(key, vars), expected, key);
});

test('task 2: the scanner reports no finding for the drawer and the modals', () => {
  for (const file of ['src/overlays/drawer.js', 'src/overlays/modals.js']) {
    const found = scanSource(read(file), file).filter(f => f.kind.startsWith('rule'));
    assert.deepEqual(
      found.map(f => `${f.line}:${f.text}`),
      [],
      file,
    );
  }
});

test('task 2: the stored permission values are byte-identical and the share modal compares the stored id', () => {
  const src = read('src/overlays/modals.js');
  assert.ok(src.includes("export const PERMS = ['Can view', 'Can comment', 'Can edit', 'Full access'];"), 'the PERMS stored values moved');
  assert.ok(src.includes("x === 'Can edit'"), 'the default-permission comparison moved');
  assert.ok(src.includes('q === perm'), 'the member-permission comparison moved');
  // the option lists carry explicit value attributes so the stored id survives a translation
  assert.ok(src.includes('<option value="${x}"'), 'the share-perm option lost its stored value');
  assert.ok(src.includes('<option value="${q}"'), 'the member-perm option lost its stored value');
  // the permLabel bridge derives the key from the stored value — no icon-name token quoted
  assert.ok(!/"view"|"edit"/.test(src), 'an icon-name token is quoted in modals.js');
});

test('task 2: the SHORTCUTS table holds catalogue keys and its kbd arrays are byte-identical', () => {
  const src = read('src/overlays/modals.js');
  assert.ok(src.includes("'modal.sc.general'"), 'the General group key moved');
  assert.ok(src.includes("['nav.goHome', ['G', 'H']]"), 'the Go-to-Home kbd array moved');
  assert.ok(src.includes("[MOD, 'Shift', 'L']"), 'the dark-mode kbd array moved');
  assert.ok(src.includes("['modal.sc.searchMode', ['Tab']]"), 'the search-mode kbd array moved');
  // the settings renderer reads the catalogue
  assert.ok(read('src/pages/settings.js').includes('${t(g)}') && read('src/pages/settings.js').includes('${t(n)}'), 'the settings shortcuts render moved');
});

/* [key, vars, previous English] — the palette and popover values (task 3). */
const TASK3_ORACLE = [
  ['palette.switchToLight', undefined, 'Switch to light mode'],
  ['palette.switchToDark', undefined, 'Switch to dark mode'],
  ['palette.group.switchWs', undefined, 'Switch workspace'],
  ['palette.group.recentSearches', undefined, 'Recent searches'],
  ['palette.highPriorityIn', { name: 'Acme' }, 'High priority in Acme'],
  ['palette.filesIn', { name: 'Acme' }, 'Files in Acme'],
  ['palette.group.suggested', undefined, 'Suggested'],
  ['palette.viewAllResults', { q: 'fix' }, 'View all results for “fix”'],
  ['palette.scope.all', undefined, 'All'],
  ['palette.noResults', undefined, 'No results found'],
  ['palette.noResultsHint', undefined, 'Try a different keyword, or press Tab to search everything.'],
  ['popover.noMatches', undefined, 'No matches'],
  ['a11y.prevMonth', undefined, 'Previous month'],
  ['a11y.nextMonth', undefined, 'Next month'],
  ['common.youSuffix', undefined, ' (you)'],
  ['a11y.assignSubtask', undefined, 'Assign subtask to…'],
  ['a11y.filterLabels', undefined, 'Filter labels…'],
  ['popover.recurNone', undefined, 'Does not repeat'],
  ['popover.recurDaily', undefined, 'Daily'],
  ['popover.recurWeekly', undefined, 'Weekly'],
  ['popover.recurBiweekly', undefined, 'Every 2 weeks'],
  ['popover.recurMonthly', undefined, 'Monthly'],
  ['popover.clearEstimate', undefined, 'Clear estimate'],
  ['popover.nextWeek', undefined, 'Next week'],
  ['popover.in2Weeks', undefined, 'In 2 weeks'],
  ['common.clear', undefined, 'Clear'],
  ['popover.roleFor', { name: 'Carol' }, 'Role for Carol'],
  ['popover.roleDescOwner', undefined, 'Full control, including the plan and deleting the workspace'],
  ['popover.roleDescAdmin', undefined, 'Manage members, settings, and all projects'],
  ['popover.roleDescMember', undefined, 'Create projects and work on tasks'],
  ['popover.roleDescGuest', undefined, 'Only sees projects they are invited to'],
  ['popover.workspaceSettings', undefined, 'Workspace settings'],
  ['popover.inviteMembers', undefined, 'Invite members'],
  ['popover.workspaces', undefined, 'Workspaces'],
  ['popover.createWorkspace', undefined, 'Create workspace'],
  ['popover.localDemo', undefined, 'Your local demo workspace'],
  ['popover.accountSettings', undefined, 'Account settings'],
  ['popover.theme', undefined, 'Theme'],
  ['popover.themeLight', undefined, 'Light'],
  ['popover.themeDark', undefined, 'Dark'],
  ['popover.themeSystem', undefined, 'System'],
  ['sort.ascending', undefined, 'Ascending'],
  ['sort.descending', undefined, 'Descending'],
  ['sort.groupBy', undefined, 'Group by'],
  ['sort.none', undefined, 'No grouping'],
  ['popover.visibleColumns', undefined, 'Visible columns'],
  ['popover.resetWidths', undefined, 'Reset widths'],
  ['popover.openProject', undefined, 'Open project'],
  ['a11y.react', { e: '👍' }, 'React 👍'],
  ['filter.and', undefined, 'and'],
  ['filter.where', undefined, 'Where'],
  ['filter.is', undefined, 'is'],
  ['filter.isNot', undefined, 'is not'],
  ['common.select', undefined, 'Select…'],
  ['popover.filterBy', undefined, 'Filter by'],
  ['popover.addFilter', undefined, 'Add filter:'],
  ['a11y.blockedBy', undefined, 'Blocked by…'],
  ['a11y.filterField', undefined, 'Field'],
  ['a11y.filterOperator', undefined, 'Operator'],
  ['common.plusEnter', undefined, '+Enter'],
];

test('task 3: the oracle renders the previous English', () => {
  for (const [key, vars, expected] of TASK3_ORACLE) assert.equal(t(key, vars), expected, key);
});

test('tasks 2+3: the scanner reports no finding for the palette and the popovers', () => {
  for (const file of ['src/overlays/palette.js', 'src/overlays/popovers.js']) {
    const found = scanSource(read(file), file).filter(f => f.kind.startsWith('rule'));
    assert.deepEqual(
      found.map(f => `${f.line}:${f.text}`),
      [],
      file,
    );
  }
});

test('tasks 2+3: the popovers sort keys and the stored recur values are byte-identical', () => {
  const src = read('src/overlays/popovers.js');
  for (const k of ['manual', 'priority', 'due', 'start', 'title', 'status', 'assignee', 'created', 'updated']) {
    assert.ok(src.includes(`'${k}'`), `the sort key ${k} moved`);
  }
  for (const v of ['Does not repeat', 'Daily', 'Weekly', 'Every 2 weeks', 'Monthly']) {
    assert.ok(src.includes(`stored: '${v}'`), `the stored recur value ${v} moved`);
  }
  assert.ok(src.includes("tMsg('common.role.' + r.toLowerCase())"), 'the role display moved off the stored id');
});

test('tasks 2+3: the wave files carry no allow-list entry and the list stays sorted', () => {
  const list = JSON.parse(read('test/fixtures/i18n-pending.json'));
  const left = list.filter(e => WAVE_FILES.includes(e.file));
  assert.deepEqual(left, []);
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual([...keys].sort(), keys, 'the allow-list is sorted by file then text');
});

test('tasks 2+3: no two keys of the wave carry the same value', () => {
  const seen = new Map();
  for (const [key, , expected] of [...TASK1_ORACLE, ...TASK2_ORACLE, ...TASK3_ORACLE]) {
    if (seen.has(expected)) assert.fail(`${key} duplicates ${seen.get(expected)} (${JSON.stringify(expected)})`);
    seen.set(expected, key);
  }
});
