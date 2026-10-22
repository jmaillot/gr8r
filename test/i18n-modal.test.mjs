/* =====================================================================
   The modal, confirmation and accessible-name contract of the action
   module (plan 06-11, task 1): every modal title, confirmation body and
   accessible name of src/actions/actions.js reads the English catalogue,
   the rendered English is byte-identical to what the source literal
   rendered, and the literals this wave extracted no longer exist in the
   source.

   Three families of assertions:
     1. the English oracle — t() renders every converted value exactly
        what the hand-written literal rendered;
     2. the absence — the scanner reports none of the extracted
        literals in src/actions/actions.js any more;
     3. the uniqueness — no two keys of this wave carry the same value.
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

/* The modal, confirmation and accessible-name values of the action
   module: [key, vars, previous English]. Keys another wave already
   published (toast.open, toast.undo, toast.deleted, toast.createdProject,
   err.createWorkspace) are wired here too and re-pinned — the oracle is
   the whole surface this task touches, reused keys included. */
const ORACLE = [
  // the defaults a creation flow writes
  ['task.untitled', undefined, 'Untitled'],
  ['member.titleGuest', undefined, 'Guest'],
  ['member.titleMember', undefined, 'Member'],
  ['common.noDescriptionYet', undefined, 'No description yet.'],
  ['common.workspace', undefined, 'Workspace'],
  // task and view modals
  ['act.copySuffix', undefined, '(copy)'],
  ['act.untitledView', undefined, 'Untitled view'],
  ['act.renameView', undefined, 'Rename view'],
  ['act.viewName', undefined, 'View name'],
  ['act.projectKeyFallback', undefined, 'PRJ'],
  ['act.deleteTaskTitle', undefined, 'Delete task?'],
  ['act.deleteTask', undefined, 'Delete task'],
  ['act.deleteTasksBody', undefined, 'The selected tasks, their subtasks, and comments will be permanently deleted.'],
  // project modals
  ['err.taskNameRequired', undefined, 'Give the task a name'],
  ['err.projectNameRequired', undefined, 'Give the project a name'],
  ['act.archiveTitle', { name: 'Alpha' }, 'Archive Alpha?'],
  ['act.archiveProjectBody', undefined, 'The project will be hidden from the sidebar and project lists. Tasks, files, and comments are kept, and you can restore it from Settings → Projects.'],
  ['act.archiveProject', undefined, 'Archive project'],
  ['act.deleteTitle', { name: 'Alpha' }, 'Delete Alpha?'],
  ['act.deleteProjectBodyHead', undefined, 'This permanently deletes the project and its'],
  ['act.deleteProjectBodyTail', undefined, ", files, and comments for everyone. This can't be undone."],
  ['act.deleteProject', undefined, 'Delete project'],
  // member and workspace modals
  ['err.enterEmails', undefined, 'Enter at least one email address'],
  ['err.invitesCreateFailed', undefined, 'Could not create the invites'],
  ['act.leaveTitle', { name: 'Acme' }, 'Leave Acme?'],
  ['act.leaveWorkspaceBody', undefined, "You'll lose access to its projects, tasks and files. Someone will have to invite you back."],
  ['act.leaveWorkspace', undefined, 'Leave workspace'],
  ['act.deleteWorkspaceBody', undefined, 'Every project, task, file, and comment in this workspace will be permanently deleted for all members.'],
  ['act.deleteWorkspace', undefined, 'Delete workspace'],
  ['act.removeTitle', { name: 'Bob' }, 'Remove Bob?'],
  ['act.removeAccess.their', undefined, 'Their'],
  ['act.removeMember', undefined, 'Remove member'],
  // file, demo and settings modals
  ['act.renameFile', undefined, 'Rename file'],
  ['act.fileName', undefined, 'File name'],
  ['act.deleteFileTitle', undefined, 'Delete file?'],
  ['act.deleteFileBody', undefined, 'will be removed from the project'],
  ['act.deleteFileBodyTask', undefined, 'will be removed from the project and its task'],
  ['act.deleteFile', undefined, 'Delete file'],
  ['act.resetDemoTitle', undefined, 'Reset demo data?'],
  ['act.resetDemoBody', undefined, 'All projects, tasks, and settings in this browser go back to the original sample workspace.'],
  ['act.resetData', undefined, 'Reset data'],
  ['act.archiveDemoTitle', undefined, 'Archive Marketing Website?'],
  ['act.archiveDemoBody', undefined, 'The project will be hidden from the sidebar. You can restore it any time.'],
  ['act.changeUrlTitle', undefined, 'Change the workspace URL?'],
  ['act.changeUrlBody', { from: 'acme', to: 'acme-2' }, 'Links to this workspace will change from /w/acme to /w/acme-2. Anyone using the old address will need to sign in again.'],
  ['act.changeUrl', undefined, 'Change URL'],
  // account modals
  ['err.enterName', undefined, 'Enter your name'],
  ['err.enterCurrentPassword', undefined, 'Enter your current password'],
  ['err.passwordWeak', undefined, 'Use at least 10 characters, including a number or symbol'],
  ['err.passwordMismatch', undefined, "Passwords don't match"],
  ['act.signOutOthersTitle', undefined, 'Sign out of all other sessions?'],
  ['act.signOutOthersBody', undefined, "You'll stay signed in on this device. Other devices will need to sign in again."],
  ['act.signOutOthers', undefined, 'Sign out others'],
  ['err.tfaCode', undefined, 'Enter the 6-digit code from your app'],
  ['act.disable2faTitle', undefined, 'Turn off two-factor authentication?'],
  ['act.disable2faBody', undefined, 'Your account will be protected by your password only.'],
  ['act.turnOff', undefined, 'Turn off'],
  // the plan modal
  ['act.downgradeToTitle', { plan: 'Free' }, 'Downgrade to Free?'],
  ['act.upgradeToTitle', { plan: 'Team' }, 'Upgrade to Team?'],
  ['act.planCloudBody', { plan: 'Team' }, 'Every member moves to Team today. Plans are a label for now — nothing is charged.'],
  ['act.planLocalHead', { n: 5, price: 12 }, '5 members × $12/month = '],
  ['act.planLocalTail', undefined, ', prorated from today and billed to Visa ending 4242.'],
  ['act.downgrade', undefined, 'Downgrade'],
  ['act.upgradeTo', { plan: 'Team' }, 'Upgrade to Team'],
  // the auth flows
  ['err.noWorkspace', undefined, 'No workspace to open'],
  ['err.enterEmail', undefined, 'Enter your email address'],
  ['err.emailInvalidExample', undefined, 'Enter a valid email, like name@company.com'],
  ['err.enterPassword', undefined, 'Enter your password'],
  ['err.signinFailed', undefined, 'Could not sign in'],
  ['err.inviteAcceptFailed', undefined, 'Signed in, but the invite could not be accepted.'],
  ['err.workspaceLoadFailed', undefined, 'Signed in, but the workspace could not be loaded.'],
  ['err.emailInvalid', undefined, 'Enter a valid email address'],
  ['err.joinFailed', undefined, 'Could not join the workspace'],
  ['err.accountCreatedLoadFailed', undefined, 'Account created, but the workspace could not be loaded.'],
  ['err.workEmailInvalid', undefined, 'Enter a valid work email'],
  ['err.signupDisabled', undefined, 'Sign-ups are disabled. Ask a workspace admin for an account.'],
  ['err.accountCreateFailed', undefined, 'Could not create the account'],
  ['err.forgotEmailInvalid', undefined, 'Enter the email you use to sign in'],
  ['err.wsNameRequired', undefined, 'Name your workspace to continue'],
  ['common.workspace', undefined, 'Workspace'],
  ['err.createWorkspace', undefined, 'Could not create the workspace'],
  ['act.createdFromTemplate', { name: 'Engineering' }, 'Created during setup from the Engineering template.'],
  // the reused toast labels this task wires
  ['toast.open', undefined, 'Open'],
  ['toast.undo', undefined, 'Undo'],
];

/* The literal texts the sweep removed from src/actions/actions.js — the
   texts of the allow-list entries this wave owns, 'Every 2 weeks'
   included (it leaves through the scanner's quoted-object-key rule, not
   through an extraction: it is the stored recurrence value RECUR_DAYS
   matches against). */
const GONE = [
  '(copy)',
  ", files, and comments for everyone. This can't be undone.",
  ', prorated from today and billed to Visa ending 4242.',
  'Account created, but the workspace could not be loaded.',
  'All projects, tasks, and settings in this browser go back to the original sample workspace.',
  'Archive',
  'Archive Marketing Website?',
  'Archive project',
  'Change URL',
  'Change the workspace URL?',
  'Could not create the account',
  'Could not create the invites',
  'Could not create the workspace',
  'Could not join the workspace',
  'Could not sign in',
  'Created during setup from the',
  'Delete',
  'Delete file',
  'Delete file?',
  'Delete project',
  'Delete task',
  'Delete task?',
  'Delete workspace',
  'Downgrade',
  'Enter a valid email address',
  'Enter a valid email, like name@company.com',
  'Enter a valid work email',
  'Enter at least one email address',
  'Enter the 6-digit code from your app',
  'Enter the email you use to sign in',
  'Enter your current password',
  'Enter your email address',
  'Enter your name',
  'Enter your password',
  'Every 2 weeks',
  'Every member moves to',
  'Every project, task, file, and comment in this workspace will be permanently deleted for all members.',
  'File name',
  'Give the project a name',
  'Give the task a name',
  'Guest',
  'Leave',
  'Leave workspace',
  'Member',
  'Name your workspace to continue',
  'No description yet.',
  'No workspace to open',
  'PRJ',
  "Passwords don't match",
  'Remove',
  'Remove member',
  'Rename file',
  'Rename view',
  'Reset data',
  'Reset demo data?',
  'Sign out of all other sessions?',
  'Sign out others',
  'Sign-ups are disabled. Ask a workspace admin for an account.',
  'Signed in, but the invite could not be accepted.',
  'Signed in, but the workspace could not be loaded.',
  'The project will be hidden from the sidebar and project lists. Tasks, files, and comments are kept, and you can restore it from Settings → Projects.',
  'The project will be hidden from the sidebar. You can restore it any time.',
  'The selected tasks, their subtasks, and comments will be permanently deleted.',
  'Their',
  'This permanently deletes the project and its',
  'Turn off',
  'Turn off two-factor authentication?',
  'Untitled',
  'Untitled view',
  'Upgrade',
  'Upgrade to',
  'Use at least 10 characters, including a number or symbol',
  'View name',
  'Workspace',
  "You'll stay signed in on this device. Other devices will need to sign in again.",
  'Your account will be protected by your password only.',
];

test('every modal and accessible-name value of the action surface renders its previous English exactly', () => {
  for (const [key, vars, expected] of ORACLE) assert.equal(t(key, vars), expected, key);
});

test('every key of the wave resolves in the English catalogue', () => {
  for (const [key] of ORACLE) assert.ok(Object.hasOwn(en, key), `missing key: ${key}`);
});

test('no extracted literal survives as a finding in src/actions/actions.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/actions/actions.js'), 'utf8');
  const findings = scanSource(src, 'src/actions/actions.js');
  const texts = new Set(findings.map(f => f.text));
  const surviving = GONE.filter(text => texts.has(text));
  assert.deepEqual(surviving, [], `these literals are still in the source: ${surviving.join(' | ')}`);
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

test('the machine identifiers of the action module are byte-identical to what they were', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/actions/actions.js'), 'utf8');
  /* Measured before the wave: the file writes two data-a sites (the confirm
     dialog's OK button) and no data-r / data-v / data-k — those identifiers
     are written by the pages and the settings row, not here. */
  const a = [...src.matchAll(/data-a="([^"]*)"/g)].map(m => m[1]);
  const r = [...src.matchAll(/data-r="([^"]*)"/g)].map(m => m[1]);
  const v = [...src.matchAll(/data-v="([^"]*)"/g)].map(m => m[1]);
  const k = [...src.matchAll(/data-k="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(a, ['confirmOk', 'confirmOk'], 'data-a');
  assert.deepEqual(r, [], 'data-r');
  assert.deepEqual(v, [], 'data-v');
  assert.deepEqual(k, [], 'data-k');
});

test('the allow-list stays sorted by file then text and no longer carries this file', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list is not sorted');
  const texts = new Set(list.filter(e => e.file === 'src/actions/actions.js').map(e => e.text));
  const leaked = GONE.filter(text => texts.has(text));
  assert.deepEqual(leaked, [], `this wave's literals are still listed: ${leaked.join(' | ')}`);
});
