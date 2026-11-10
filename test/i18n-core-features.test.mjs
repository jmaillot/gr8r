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
  ['a11y.brand', 'Projects Studio'],
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
  ['page.team.accessHint', 'Every member of a team can have access to a project that is assigned to a team'],
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
  assert.equal(verbs.length, 47, 'a call site moved'); // +1: removeLogo DELETE /w/:slug/logo (43-02) // +2: getNotifPrefs/putNotifPrefs (34-04) // 35: patchMe (08-02) + the three session endpoints (14-02) + changePassword (15-02) + the five tfa methods (16-03, tfaLogin 17-02, tfaRecover 20-02) + the two operator endpoints (22-02) + revokeMemberSessions (24-02) + auditLog (24-03) + setMemberTeams (28-01) + tfaFactors (31-01) + the three factor-lifecycle wrappers (31-03) + setMemberScope (29-04) // +3: the API-key endpoints — GET/POST /api/keys + DELETE /api/keys/:id (MCP-01) // +1: memberVisibility GET /workspaces/:slug/members/:uid/visibility (52-02)
});

test('the icon names and the brand path are untouched', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/core/icons.js'), 'utf8');
  assert.ok(src.includes("ICONS[name] || '<rect"), 'the icon fallback moved');
  assert.ok(src.includes('M55.4 39Q69.2 39'), 'the brand path moved');
  assert.ok(src.includes('viewBox="0 0 1412 188"'), 'the logo viewBox moved');
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

test('the catalogue holds after the billing removal, the D-10/D-12/D-16 additions, the phase 9 error codes and the phase 9 activity keys — 1552 keys (+ err.fileNotFound, phase 12 plan 2; + err.uploadTooLarge, phase 12 plan 1; + toast.localeSaveFailed, phase 8; + 43 err.<code> keys, phase 9; + 4 act.verb/act.extra keys, phase 9 plan 3; + act.download, phase 12 plan 8; + toast.dirUp/dirDown, act.deleteProjectTaskCount, act.removeAccess.losesAccess/unassigns, page.files.browse, deferred-07 i18n literals; + 10 dev.<device> keys and err.signedOutElsewhere, phase 14 plan 2; + err.wrongCurrentPassword/err.passwordRequired, phase 15 plan 1; + toast.passwordUpdatedAll, phase 15 plan 2; + err.noPendingEnrollment/err.codeRejected/err.masterKeyMissing, phase 16 plan 2; + err.challengeExpired/err.invalidTfaCode, phase 17 plan 1; − err.tooManyLoginAttempts, phase 17 plan 1 — D-13 generic copy; − the generic session-expired key, phase 14 plan 5 — orphaned by the central teardown retirement; + page.auth.tfaTitle/tfaSubtitle/tfaCodeLabel/tfaVerify + auth.recoveryUsed/recoveryUsedLast, phase 17 plan 2; + err.tfaNotEnabled, phase 20 plan 1; + the six settings.tfa.regen* keys, phase 20 plan 2; + settings.tfa.regenShort, phase 20 plan 3; + err.operatorOnly/err.ownerImmune, phase 22 plan 1; + the ten settings.operator.* keys, phase 22 plan 2; + err.taskNotFound, phase 23 plan 1; + members.toastRevoked, phase 24 plan 2; + the six settings.notif reminder keys and notif.dueReminder/notif.pastDue, phase 27 plan 2; + settings.tfa.factor.primary, phase 31 plan 1 — D-07; + err.labelRequired/labelTooLong/factorNotFound, phase 31 plan 2; + the six settings.tfa add-factor keys and the three remove-factor keys, phase 31 plan 3; + err.unknownPrefKey, phase 34 plan 2; + err.notifPrefsSaveFailed, phase 34 plan 4 — the npToggle error toast; − notif.reminder.dayBefore, phase 37 plan 1 — the day_before offset removed; + the four notif.digest.* keys, phase 38 plan 1; + notif.digest.subjectWs, phase 40 plan 2; + notif.digest.unsubscribe, phase 41 plan 1; + notif.unsubscribe.*, phase 42 plan 1; + settings.notif.pushComingSoon, phase 42 plan 2; + settings.ws.uploadLogo/removeLogo, phase 43 plan 2; + the three settings.tz picker strings, phase 44 plan 3; +5: toast.pushMention/pushAssign/pushComment + settings.notif.pushBrowserBlocked + toast.pushBrowserBlocked, phase 48 plan 1; − settings.notif.pushComingSoon, phase 48 plan 2 (D-48-3; final catalogue 1710, EN-counted); +6: err.ownerInviteForbidden/inviteMemberRoleCeiling/inviteMemberProjectRequired/inviteGuestToggleOff/inviteTeamsAdminOnly/allowInviteGuestsRequired, phase 50 plan 3 (VIS-04/INV-01 keyed refusals; err.projectNotFound already catalogued); +2: err.inviteGuestProjectRequired/inviteGuestProjectSingle, phase 53 plan 2 (T-53-05 guest-invariant refusals)), none under the reserved namespace', () => {
  const keys = Object.keys(en);
  assert.equal(keys.length, 1807, 'the catalogue size moved'); // +1: page.subtask.inheritedDue — the inherited-due hint (2026-11-10); +12: export.month.* (54-05, another session, same landing); +12: task.label.assessment/preparation/migration/validation/identity/email/licensing/network/security/backup/documentation/vendor — the infrastructure/migration label catalog extension (2026-11-10) // +24: export.meta.* (6) + export.kpi.* (4) + export.chart.* (3) + export.col.lane/count/member/open/done/total/name/date/state (10) + export.milestone.done/upcoming (2) — the Summary/Board/Members/Milestones sheets and their chart headers (54-03) // +35: the export.* family (title/format/scope/options/submit/notice/col.*) plus err.exportFailed/Forbidden/InvalidRequest — the export modal, its five toggles and the keyed refusals (54-01) // +3: modal.settingsTabs/settingsTabGeneral/settingsTabAccess — the unified project settings modal tab bar (53-03 D-04); +2: modal.teamPermFor/modal.settingsConflict — the per-team perm dropdown and the honest revision-conflict message (53-03 D-02/T-53-08) // +2: err.inviteGuestProjectRequired/inviteGuestProjectSingle — the T-53-05 guest one-project refusals (53-02); +1: err.projectSaveFailed — the WR-01 conflict-honesty on the edit submit (2026-11-09 owner ruling) // +4: page.members.visReasonTeam/visReasonError/visLoading/visDetailTitle — the transparency-panel state copy (52-02 UI review) // +6: page.members.visReason.everyone/lead/member/team + page.members.visReasonEmpty + a11y.memberVisibility (52-02) // −17: the dead-key sweep of the new i18n-gate detector removed the orphaned keys no source references (51-03, UX-01 criterion 5): a11y.settings.ownerOnly/qr, a11y.toggleSubPages, act.disable2faTitle/Body, act.inviteTeam (the invite button reads a11y.inviteTeam), nav.tab.files, page.auth.signInTo/welcomeBack, settings.nav.twoFactor, settings.tfa.anyDigits/recovery/regenDesc/setup, toast.passwordUpdated, toast.twoFaEnabled/Disabled // −6: settings.nav.permissions + settings.perms.lead/guests/guestsDesc/public/publicDesc deleted with the Settings > Permissions page (51-03, CRT-02; settings.perms.create and settings.perms.roleTable survive — General row and Members table) // +6: modal.teamsSection/modal.teamsLiveHint/act.inviteTeam/a11y.inviteTeam/toast.teamLinked/toast.teamUnlinked — the share-modal Teams section (51-02, D-51-5..9; act.inviteTeam retired by the 51-03 sweep); +2: page.projects.createRestricted + err.projectCreateForbidden — the restricted-create gating and keyed-refusal toast (51-02, CRT-01) // −1: settings.notif.pushComingSoon deleted — real push toggles replace the Coming-soon badge (48-02, D-48-3; the plan's −2 total counts EN+FR, the catalogue counts EN only) // +5: toast.pushMention/pushAssign/pushComment, settings.notif.pushBrowserBlocked, toast.pushBrowserBlocked (48-01); +3: settings.tz.searchLabel/placeholder/noResults — the tz combobox strings (44-03); +2: err.invalidLogo/err.logoNotFound (43-01, LOGO-01); +2: settings.ws.uploadLogo/removeLogo (43-02) // −2: settings.notif.dueReminders/dueDesc deleted with the legacy push_due row (G-37-2) // −1: notif.reminder.dayBefore deleted (37-01, REM-01) // +15: notif.reminder.*/notif.email.* server notification keys (36-01) // +1: err.notifPrefsSaveFailed (34-04) // +1: err.unknownPrefKey (34-02, cataloguing the 34-01 route code) // +1: err.inviteAdminEmailRequired (33-02) // +5: err.scopeNotAllowed/scopeRequired/projectsRequired/tooManyProjects/unknownProject (29-01); +3: err.teamsRequired/tooManyTeams/unknownTeam (28-01); +3: err.changeTeam, act.editTeams, modal.memberTeamsHint (28-02); +1: modal.inviteTeamsHint (28-03); +1: settings.tfa.factor.primary (31-01, D-07); +3: err.labelRequired/labelTooLong/factorNotFound (31-02); +9: the settings.tfa add/remove-factor keys (31-03); +1: err.assigneeOutOfScope (29-03); +1: err.guestSingleProject (29-04); +8: modal.scopeSection/scopeProjectsLabel/scopeTeamsLabel/guestToggle/guestHint/workspaceWideHint/scopeFixedHint + err.changeScope (29-04 UI surfaces); +3: page.auth.ssoError/invitationsTitle/invitationsBody (30-04); +4: notif.digest.subject/dueToday/overdue/footer (38-01); +1: notif.digest.subjectWs (40-02); +1: notif.digest.unsubscribe (41-01); +1: settings.notif.pushComingSoon (42-02); +1: page.auth.panelLine, −6: the Google/Apple demo buttons, their toasts and the free-tier line retired (landing redesign); +2: notif.unsubscribe.verified/neutral + err.methodNotAllowed (42-01); +26: settings.apikeys.* — the personal API keys card (MCP-01); +4: err.keyLabelRequired/invalidScope/invalidExpiry/keyNotFound — the /api/keys codes (MCP-01) // −7: settings.nav.assignments + the six @workspace/assign notif strings deleted with the inert Assignments tab (PR #18 b094c22; count reconciled at merge); icons baseline −user-check same cause
  assert.ok(
    keys.every(k => !k.startsWith('contract.') || k === 'contract.englishOnly'),
    'a phase key sits under contract.*',
  );
});

test('the icon baseline holds at 173 names', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/icons-baseline.json'), 'utf8'));
  const names = Array.isArray(baseline) ? baseline : baseline.icons || Object.keys(baseline);
  assert.equal(names.length, 173, 'the icon baseline moved'); // +1: network (the Timeline connector/dependency legend, 54-04) // +1: percent (the Summary KPI rows, 54-03) // +2: align-left (export scope selector) + view (the export modal icon) — the export entry points and modal (54-01) // +1: plug for the API-keys nav entry (MCP-01); shield-check returns for the 2FA login screen (17-02); −1: the apple glyph left with the demo social buttons
});
