/* =====================================================================
   The toast contract of the action module (plan 06-07): every toast
   message of src/actions/actions.js reads the English catalogue, the
   rendered English is byte-identical to what the source literal
   rendered, and the literals this wave extracted no longer exist in
   the source.

   Three families of assertions:
     1. the English oracle — t() renders every converted message exactly
        what the hand-written literal rendered (the interpolated values
        travel raw: toast() escapes the whole message at its own
        boundary, D-07);
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

/* The toast messages of the action module: [key, vars, previous English].
   The count toasts keep the source's own plural spelling ("3 tasks"),
   which the message hard-coded — introducing a plural object would
   change the English at n = 1, and the wave is behaviour-preserving. */
const ORACLE = [
  ['toast.linkCopied', undefined, 'Link copied'],
  ['toast.copyUnavailable', { link: 'x' }, "Copy isn't available here — x"],
  ['toast.copiedToClipboard', undefined, 'Copied to clipboard'],
  ['toast.emailCopied', undefined, 'Email copied'],
  ['toast.inviteLinkCopied', undefined, 'Invite link copied'],
  ['toast.emailFailedLinkCopied', undefined, 'Email failed — new invite link copied'],
  ['toast.newInviteLinkCopied', undefined, 'New invite link copied'],
  ['toast.darkModeOn', undefined, 'Dark mode on'],
  ['toast.lightModeOn', undefined, 'Light mode on'],
  ['toast.projectMarked', { name: 'Alpha', status: 'On track' }, 'Alpha marked On track'],
  ['err.noAccountYet', { name: 'Bob' }, 'Bob has no account yet'],
  ['err.changeRole', undefined, 'Could not change that role'],
  ['toast.roleChanged', { name: 'Bob', article: 'an', role: 'Admin' }, 'Bob is now an Admin'],
  ['err.taskAccess', undefined, "You don't have access to that task"],
  ['toast.moved', { name: 'Alpha', direction: 'up' }, 'Moved Alpha up'],
  ['toast.completed', { title: 'T' }, 'Completed “T”'],
  ['toast.addedToFavorites', undefined, 'Added to favorites'],
  ['toast.removedFromFavorites', undefined, 'Removed from favorites'],
  ['toast.projectAddedToFavorites', { name: 'Alpha' }, 'Added Alpha to favorites'],
  ['toast.taskDuplicated', undefined, 'Task duplicated'],
  ['toast.changesSaved', undefined, 'Changes saved'],
  ['toast.created', { key: 'A-1' }, 'Created A-1'],
  ['toast.createdIn', { key: 'A-1', name: 'Alpha' }, 'Created A-1 in Alpha'],
  ['toast.removed', { name: 'f.txt' }, 'Removed f.txt'],
  ['err.uploadOffline', undefined, "Upload failed — you're offline."],
  ['toast.uploaded', { name: 'a.png' }, 'Uploaded a.png'],
  ['toast.replyPosted', undefined, 'Reply posted'],
  ['toast.commentDeleted', undefined, 'Comment deleted'],
  ['toast.selectUrlToLink', undefined, 'Select a URL starting with https:// to turn it into a link'],
  ['toast.savedView', { name: 'V' }, 'Saved view “V”'],
  ['toast.deletedView', { name: 'V' }, 'Deleted view “V”'],
  ['toast.markedDone', { n: 3 }, 'Marked 3 tasks as done'],
  ['toast.archivedCompleted', { n: 2 }, 'Archived 2 completed tasks'],
  ['toast.projectUpdated', undefined, 'Project updated'],
  ['toast.createdProject', { name: 'Alpha' }, 'Created Alpha'],
  ['toast.createdStarters', { name: 'Alpha', n: 4 }, 'Created Alpha with 4 starter tasks'],
  ['toast.duplicated', { name: 'Alpha' }, 'Duplicated Alpha'],
  ['toast.archived', { name: 'Alpha' }, 'Archived Alpha'],
  ['toast.restored', { name: 'Alpha' }, 'Restored Alpha'],
  ['toast.deleted', { name: 'Alpha' }, 'Deleted Alpha'],
  ['toast.accessRequested', { name: 'the owner' }, "Access requested. We'll notify you when the owner responds."],
  ['err.cannotChangeAccess', undefined, 'Only the project lead, an admin or the owner can change access'],
  ['toast.memberCanEdit', { name: 'Bob', project: 'Alpha' }, 'Bob can now edit Alpha'],
  ['toast.sharedWith', { name: 'Bob' }, 'Shared with Bob'],
  ['err.inviteFirst', undefined, 'Invite them to the workspace first, then add them to this project'],
  ['err.invalidEmail', undefined, 'Enter a valid email address, like name@company.com'],
  ['toast.invitationSentTo', { email: 'a@b.co' }, 'Invitation sent to a@b.co'],
  ['err.lastMember', undefined, 'Promote someone else before removing the last member'],
  ['toast.permChanged', { name: 'Bob', perm: 'Can edit' }, 'Bob: Can edit'],
  ['toast.privateProject', undefined, 'Only people invited can open this project'],
  ['toast.publicProject', { name: 'Acme' }, 'Everyone at Acme can open this project'],
  ['err.inviteLink', undefined, 'Could not create an invite link'],
  ['toast.inviteResent', { email: 'a@b.co' }, 'Invite resent to a@b.co'],
  ['err.newInvite', undefined, 'Could not create a new invite'],
  ['err.revokeInvite', undefined, 'Could not revoke that invite'],
  ['toast.inviteRevoked', { email: 'a@b.co' }, 'Invite for a@b.co revoked'],
  ['err.leaveWorkspace', undefined, 'Could not leave this workspace'],
  ['toast.leftWorkspace', { name: 'Acme' }, 'You left Acme'],
  ['err.deleteWorkspace', undefined, 'Could not delete this workspace'],
  ['toast.workspaceDeleted', { name: 'Acme' }, 'Acme deleted'],
  ['err.noAccountToRemove', { name: 'Bob' }, 'Bob has no account to remove'],
  ['err.removeMember', undefined, 'Could not remove that member'],
  ['toast.fileDuplicated', undefined, 'File duplicated'],
  ['toast.allCaughtUp', undefined, "You're all caught up."],
  ['err.switchWorkspace', undefined, 'Could not switch workspace'],
  ['toast.switchedTo', { name: 'Acme' }, 'Switched to Acme'],
  ['toast.demoSingleWorkspace', undefined, 'The local demo has a single workspace.'],
  ['err.askAdmin', undefined, 'Ask a workspace administrator to create one for you'],
  ['err.offlineMode', undefined, 'Offline mode on — edits will fail to save'],
  ['toast.backOnline', undefined, 'Back online'],
  ['toast.reconnected', undefined, 'Reconnected. All changes are synced.'],
  ['toast.demoResetLocal', undefined, 'Demo data can only be reset in local demo mode.'],
  ['toast.demoRestored', undefined, 'Demo data restored'],
  ['err.changesNotSaved', undefined, "Your changes couldn't be saved."],
  ['toast.saved', undefined, 'Saved'],
  ['toast.retrying', undefined, 'Retrying…'],
  ['toast.loadedSuccessfully', undefined, 'Loaded successfully'],
  ['toast.demoMoved', undefined, 'Moved “Create homepage wireframes” to Review'],
  ['toast.undone', undefined, 'Undone'],
  ['toast.demoPreview', undefined, 'This was a preview — nothing was archived'],
  ['toast.loaded', undefined, 'Loaded'],
  ['toast.notifPrefsSaved', undefined, 'Notification preferences saved'],
  ['toast.prefSaved', undefined, 'Preference saved'],
  ['err.wsColor', undefined, 'Could not save the workspace color'],
  ['err.wsNameEmpty', undefined, "Workspace name can't be empty"],
  ['err.wsSettings', undefined, 'Could not save workspace settings'],
  ['toast.wsSettingsSaved', undefined, 'Workspace settings saved'],
  ['toast.deleteWsUnavailable', undefined, 'Deleting a workspace is not available yet.'],
  ['toast.wsDeletedDemo', undefined, 'Workspace deleted. Demo data was restored for this prototype.'],
  ['toast.profileUpdated', undefined, 'Profile updated'],
  ['toast.passwordUpdated', undefined, 'Password updated'],
  ['toast.sessionSignedOut', undefined, 'Session signed out'],
  ['toast.signedOutOthers', undefined, 'Signed out of other sessions'],
  ['toast.twoFaEnabled', undefined, 'Two-factor authentication enabled'],
  ['toast.twoFaDisabled', undefined, 'Two-factor authentication turned off'],
  ['toast.socialNotConfigured', undefined, 'Social sign-in is not configured on this server.'],
  ['toast.verificationSent', { email: 'a@b.co' }, 'Verification email sent to a@b.co'],
  ['toast.resetSent', { email: 'a@b.co' }, 'Reset link sent to a@b.co'],
  ['err.projectName', undefined, 'Give your project a name'],
  ['err.notValidEmail', { email: 'x' }, "x isn't a valid email address"],
  ['err.wsCreatedNotLoaded', undefined, 'Workspace created, but it could not be loaded'],
  ['err.sendInvites', undefined, 'Could not send the invites'],
  ['toast.welcomeTo', { name: 'Acme' }, 'Welcome to Acme'],
  ['toast.signedInAs', { name: 'Bob' }, 'Signed in as Bob'],
  ['toast.signedInWith', { provider: 'Google' }, 'Signed in with Google'],
  ['toast.welcomeUser', { name: 'Bob' }, 'Welcome, Bob'],
  ['toast.recurringNext', { title: 'T', date: 'Jul 24' }, 'Next “T” scheduled for Jul 24'],
  // Task 2: the toast options' action-button labels (the display-named
  // `action:` property). The kind: and ms: options are machine values and
  // stay as they are.
  ['toast.undo', undefined, 'Undo'],
  ['toast.open', undefined, 'Open'],
  ['toast.tryAgain', undefined, 'Try again'],
];

/* The literal texts the sweep removed from the file — the trimmed
   segments the scanner used to report on the toast surface. The
   "Could not create the workspace" fallback also feeds a form error
   (the modal half plan 06-11 owns), so its entry stays in the
   allow-list and out of this list. */
const GONE = [
  'Link copied',
  "Copy isn't available here —",
  'Dark mode on',
  'Light mode on',
  'Could not change that role',
  "You don't have access to that task",
  'Moved',
  'Completed “',
  'Added to favorites',
  'Removed from favorites',
  'Added',
  'Copied to clipboard',
  'Email copied',
  'Task duplicated',
  'Archived “',
  'Deleted “',
  'Changes saved',
  'Created',
  'Removed',
  "Upload failed — you're offline.",
  'Uploaded',
  'Reply posted',
  'Comment deleted',
  'Deleted',
  'Saved view “',
  'Deleted view “',
  'Marked',
  'Archived',
  'Project updated',
  'Duplicated',
  'Restored',
  "Access requested. We'll notify you when",
  'Only the project lead, an admin or the owner can change access',
  'Shared with',
  'Invite them to the workspace first, then add them to this project',
  'Enter a valid email address, like name@company.com',
  'Invitation sent to',
  'Promote someone else before removing the last member',
  'Only people invited can open this project',
  'Everyone at',
  'Invite link copied',
  'Could not create an invite link',
  'Invite resent to',
  'Could not create a new invite',
  'Email failed — new invite link copied',
  'New invite link copied',
  'Could not revoke that invite',
  'Invite for',
  'Could not leave this workspace',
  'You left',
  'Could not delete this workspace',
  'Could not remove that member',
  'File duplicated',
  "You're all caught up.",
  'Could not switch workspace',
  'Switched to',
  'The local demo has a single workspace.',
  'Ask a workspace administrator to create one for you',
  'Offline mode on — edits will fail to save',
  'Back online',
  'Reconnected. All changes are synced.',
  'Demo data can only be reset in local demo mode.',
  'Demo data restored',
  "Your changes couldn't be saved.",
  'Saved',
  'Retrying…',
  'Loaded successfully',
  'Moved “Create homepage wireframes” to Review',
  'Undone',
  'This was a preview — nothing was archived',
  'Loaded',
  'Notification preferences saved',
  'Preference saved',
  'Could not save the workspace color',
  "Workspace name can't be empty",
  'Could not save workspace settings',
  'Workspace settings saved',
  'Deleting a workspace is not available yet.',
  'Workspace deleted. Demo data was restored for this prototype.',
  'Profile updated',
  'Password updated',
  'Session signed out',
  'Signed out of other sessions',
  'Two-factor authentication enabled',
  'Two-factor authentication turned off',
  'Social sign-in is not configured on this server.',
  'Verification email sent to',
  'Reset link sent to',
  'Give your project a name',
  'Workspace created, but it could not be loaded',
  'Could not send the invites',
  'Welcome to',
  // Task 2: the action-button labels
  'Undo',
  'Open',
  'Try again',
];

test('every toast message of the action surface renders its previous English exactly', () => {
  for (const [key, vars, expected] of ORACLE) assert.equal(t(key, vars), expected, key);
});

test('every key of the wave resolves in the English catalogue', () => {
  for (const [key] of ORACLE) assert.ok(Object.hasOwn(en, key), `missing key: ${key}`);
});

test('no extracted toast literal survives as a finding in src/actions/actions.js', () => {
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

/* ---------- the wave's proof (plan 06-07, task 3) ---------- */

test('the toast surface of src/actions/actions.js reports nothing at all', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/actions/actions.js'), 'utf8');
  const findings = scanSource(src, 'src/actions/actions.js');
  const toastFindings = findings.filter(f => f.kind === 'ruleToast');
  assert.deepEqual(toastFindings, [], `ruleToast findings survive: ${toastFindings.map(f => `${f.line} ${f.text}`).join(' | ')}`);
  const unresolved = findings.filter(f => f.kind === 'unresolved' || f.kind === 'placeholder-mismatch');
  assert.deepEqual(unresolved, [], `catalogue-key violations: ${unresolved.map(f => `${f.kind}:${f.line} ${f.text}`).join(' | ')}`);
});

test('the machine identifiers survived the wave — tree-wide data-a / data-r / data-v counts', () => {
  // 430 / 57 / 75, measured after the 2FA tab deletion (14-04): a translated identifier
  // resolves A[el.dataset.a] to undefined and no test would show it.
  let a = 0,
    r = 0,
    v = 0;
  const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : /\.js$/.test(e.name) ? [p] : [];
    });
  for (const file of walk(path.join(ROOT, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    a += [...text.matchAll(/data-a="/g)].length;
    r += [...text.matchAll(/data-r="/g)].length;
    v += [...text.matchAll(/data-v="/g)].length;
  }
  assert.equal(a, 440, 'data-a sites'); // +10 for the 2FA card (16-03): start/cancel/beginEnroll/verify×2/askDisable/disableConfirm/copy + recovery modal copy/dismiss
  assert.equal(r, 57, 'data-r sites');
  assert.equal(v, 75, 'data-v sites');
});

test("the action module's own data-a sites are byte-identical to what they were", () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/actions/actions.js'), 'utf8');
  const keys = [...src.matchAll(/data-a="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(keys, ['confirmOk', 'confirmOk']);
});

test('the allow-list stays sorted by file then text and no longer carries this wave', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list is not sorted');
  const texts = new Set(list.filter(e => e.file === 'src/actions/actions.js').map(e => e.text));
  const leaked = GONE.filter(text => texts.has(text));
  assert.deepEqual(leaked, [], `this wave's literals are still listed: ${leaked.join(' | ')}`);
});
