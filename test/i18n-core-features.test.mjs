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
  assert.equal(verbs.length, 49, 'a call site moved'); // +2: the dashboard GET /workspaces/:slug/dashboard (activityWindow query) + the self-view GET /workspaces/:slug/me/visibility (60-02); prior: +1: memberVisibility GET /workspaces/:slug/members/:uid/visibility (52-02) // +1: removeLogo DELETE /w/:slug/logo (43-02) // +2: getNotifPrefs/putNotifPrefs (34-04) // 35: patchMe (08-02) + the three session endpoints (14-02) + changePassword (15-02) + the five tfa methods (16-03, tfaLogin 17-02, tfaRecover 20-02) + the two operator endpoints (22-02) + revokeMemberSessions (24-02) + auditLog (24-03) + setMemberTeams (28-01) + tfaFactors (31-01) + the three factor-lifecycle wrappers (31-03) + setMemberScope (29-04) // +3: the API-key endpoints — GET/POST /api/keys + DELETE /api/keys/:id (MCP-01) // +1: memberVisibility GET /workspaces/:slug/members/:uid/visibility (52-02)
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

test('the catalogue holds after the billing removal, the D-10/D-12/D-16 additions, the phase 9 error codes and the phase 9 activity keys — 1553 keys (+ err.fileNotFound, phase 12 plan 2; + err.uploadTooLarge, phase 12 plan 1; + toast.localeSaveFailed, phase 8; + 43 err.<code> keys, phase 9; + 4 act.verb/act.extra keys, phase 9 plan 3; + act.download, phase 12 plan 8; + toast.dirUp/dirDown, act.deleteProjectTaskCount, act.removeAccess.losesAccess/unassigns, page.files.browse, deferred-07 i18n literals; + 10 dev.<device> keys and err.signedOutElsewhere, phase 14 plan 2; + err.wrongCurrentPassword/err.passwordRequired, phase 15 plan 1; + toast.passwordUpdatedAll, phase 15 plan 2; + err.noPendingEnrollment/err.codeRejected/err.masterKeyMissing, phase 16 plan 2; + err.challengeExpired/err.invalidTfaCode, phase 17 plan 1; − err.tooManyLoginAttempts, phase 17 plan 1 — D-13 generic copy; − the generic session-expired key, phase 14 plan 5 — orphaned by the central teardown retirement; + page.auth.tfaTitle/tfaSubtitle/tfaCodeLabel/tfaVerify + auth.recoveryUsed/recoveryUsedLast, phase 17 plan 2; + err.tfaNotEnabled, phase 20 plan 1; + the six settings.tfa.regen* keys, phase 20 plan 2; + settings.tfa.regenShort, phase 20 plan 3; + err.operatorOnly/err.ownerImmune, phase 22 plan 1; + the ten settings.operator.* keys, phase 22 plan 2; + err.taskNotFound, phase 23 plan 1; + members.toastRevoked, phase 24 plan 2; + the six settings.notif reminder keys and notif.dueReminder/notif.pastDue, phase 27 plan 2; + settings.tfa.factor.primary, phase 31 plan 1 — D-07; + err.labelRequired/labelTooLong/factorNotFound, phase 31 plan 2; + the six settings.tfa add-factor keys and the three remove-factor keys, phase 31 plan 3; + err.unknownPrefKey, phase 34 plan 2; + err.notifPrefsSaveFailed, phase 34 plan 4 — the npToggle error toast; − notif.reminder.dayBefore, phase 37 plan 1 — the day_before offset removed; + the four notif.digest.* keys, phase 38 plan 1; + notif.digest.subjectWs, phase 40 plan 2; + notif.digest.unsubscribe, phase 41 plan 1; + notif.unsubscribe.*, phase 42 plan 1; + settings.notif.pushComingSoon, phase 42 plan 2; + settings.ws.uploadLogo/removeLogo, phase 43 plan 2; + the three settings.tz picker strings, phase 44 plan 3; +5: toast.pushMention/pushAssign/pushComment + settings.notif.pushBrowserBlocked + toast.pushBrowserBlocked, phase 48 plan 1; − settings.notif.pushComingSoon, phase 48 plan 2 (D-48-3; final catalogue 1710, EN-counted); +6: err.ownerInviteForbidden/inviteMemberRoleCeiling/inviteMemberProjectRequired/inviteGuestToggleOff/inviteTeamsAdminOnly/allowInviteGuestsRequired, phase 50 plan 3 (VIS-04/INV-01 keyed refusals; err.projectNotFound already catalogued); +2: err.inviteGuestProjectRequired/inviteGuestProjectSingle, phase 53 plan 2 (T-53-05 guest-invariant refusals); +1: err.webhookError, phase 67 plan 3 (the single coarse code for the webhook hook CRUD/test routes — the EN entry chunk sat 40 bytes under the 500 kB gate, so the nine specific codes were consolidated into one key; the specific English messages ride fail())); +2: pwa.install.cta/iosHint, phase 73 plan 1 — the install-banner strings (D-08), both catalogue files same commit; +1 err.signupDomainNotAllowed (phase 75 plan 01) — the DP-1 signup-door refusal, all 5 catalogues same commit; +1 err.inviteDomainNotAllowed (phase 75 plan 02) — the DP-2 per-email invite-create refusal, all 5 catalogues same commit), none under the reserved namespace', () => {
  const keys = Object.keys(en);
  assert.equal(keys.length, 1948, 'the catalogue size moved'); // +1 (75-02): err.inviteDomainNotAllowed — the DP-2 per-email invite-create refusal; prior +1 (75-01): err.signupDomainNotAllowed — the DP-1 signup-door refusal; prior +2 (73-01): pwa.install.cta + pwa.install.iosHint — the install banner strings (D-08); prior: templates.favToggle/favOn/favSection/favEmptyHint — the favourite-flag UI (Settings star button, picker tier heading, project-modal hint); prior: net 0: templates.empty replaced by templates.emptyTab (template Settings two-tab empty-state, owner ruling 2026-11-16 — EN count, FR parity in build-locales test); prior +1 (67-04): modal.settingsTabWebhooks — the settings tab-bar key, the ONLY webhook string the entry chunk carries (the 31 section labels ride the lazy webhooks-labels table + chunk, 67-04 Rule 3 — parity asserted in test/build-locales.test.mjs); prior: +1 (67-03): err.webhookError — the webhook route family's single catalogue key (chunk-gate consolidation); prior: +23 (66-03): the template-UI family — act.saveAsTemplate, modal.fromTemplate/fromTemplateHint, settings.nav.templates/settings.templates.lead and the 18 templates.* keys (the Settings CRUD card, the create-modal picker, the template editor); prior: +4 (66-02): toast.templateSaved/instantiatedFromTemplate + err.templateSaveFailed/templateInstantiateFailed — the template save/instantiate toasts; prior: +1 (65-04 task 2): page.search.viaSubtask — the D-07 subtask-hint label; task 1: net +7: act.moveSubUp/moveSubDown/reparentSub (the one-level restructure menu labels, D-09) + popover.subParentTitle (the re-parent picker heading) + act.verb.promotedASubtaskOf/demotedASubtaskOf/movedASubtaskOf (the restructure activity verbs); prior: net +2 (65-03 task 3): +2 a11y.openSubtasks (the D-11 board open-leaf badge aria) + popover.subtasksOf (the card-popover checklist heading); task 1: +2 a11y.collapseSubtasks/a11y.expandSubtasks — the per-node tree-caret labels (D-03/D-10 session-only collapse), -1 a11y.completeSubtask — orphaned when the flat list subrow joined the shared title-labelled tree renderer; prior: +2: err.subtaskCycle/err.subtaskDepth — the D-05 wholesale-reject codes for the subtask tree (65-02); prior: +9: the inbox burst summary family (61-02): notif.burst.mention/assign/comment/update/dueReminder/pastDue + notif.burst.generic (CLDR plural objects — the D-13 count-by-type summary line) + notif.burst.expand/collapse (the chevron aria/tip); prior: +21: the admin dashboard + self-view family (60-02): nav.route.dashboard + page.dashboard.subtitle/load/loading/activityWindow/win24h/win7d/win30d/emptyOverdue/emptyOverdueBody/emptyLoad/emptyLoadBody/emptyUpcoming/emptyUpcomingBody/emptyActivity + settings.nav.myAccess/settings.myAccess.lead/loading/empty/error/local; prior: +1: err.badActivityWindow — the dashboard activity-window whitelist 400 (60-01, Phase 60); prior: +13: the Settings Push tab family (59-03, Phase 59) — settings.notif.pushEnable/pushEnableDesc/pushTurnOn/pushDue/pushDueDesc/pushDevices/pushNoDevices/pushTest/pushUnnamed + toast.pushEnabled/pushDisabled/pushTestSent/pushTestFailed; prior: +6: notif.push.mentioned/assigned/commented/due/test/testBody — the server-side push ticker keys (59-02, Phase 59); prior: +2: err.pushUnavailable + err.invalidSubscription — the push-config fail-absent 404 and the push-subscription whitelist 400 (59-01, Phase 59); prior: +4: the default-visibility family (57-03, VIEW-03) — settings.perms.defaultPrivate/defaultPrivateDesc + modal.defaultPrivateOn/defaultPrivateOff; prior: +21: the named saved views family (57-02): popover.savedViews/saveCurrentView/updateView/noSavedViews, modal.saveTableView/replaceTableView/saveTableViewReplace/updateTableViewConfirm, act.replaceView, toast.savedTableView/appliedTableView/deletedTableView, a11y.deleteTableView, err.viewNameRequired/invalidViewName/viewNameConflict/viewLimitReached/viewBlobTooLarge/viewKeyNotNamed/viewSaveFailed/viewDeleteFailed // +1: toast.errGeneric — the async confirm-run failure toast (56-02 seed-lazy migration) // +1: toast.qrLoadFailed — the D-03 QR spinner/toast/retry UX (56-01, 7e45d82) // −1: act.reload — orphaned when the 55-08 409 recovery replaced the location.reload toast action (hydrate-wins, act.retry); // −2: modal.scopeFixedHint + modal.teamsHint — dead after the quick 2026-11-11 UI simplifications (member-edit scope editor removed; create-form team chips removed); // −9: invite access-limits retirement — modal.scopeSection/scopeProjectsLabel/scopeTeamsLabel/workspaceWideHint/guestToggle/guestHint/guests/guestsHint/inviteGuestNeedsProject (invite form is email + role + teams, workspace-wide); // +3 round 3: guest restored — modal.guestProjectLabel/guestProjectHint + inviteGuestNeedsProject back (Guest = viewer + exactly one project, project picker replaces the teams field); // +2: page.subtask.inheritedStart (the inherited-start hint) + act.verb.setASubtaskStartDateOn (the subtask start-date activity verb) — the subtask start dates folded in (55-06, D-55-18); // +4 −1: page.field.assigneeCap + modal.assigneeSearch/assigneeNoMatches + notif.assignRemoved — the assignee picker modal, its cap hint and the diff-based removed-assignee notification (55-04, D-55-6/7/13); − a11y.assignSubtask — orphaned by the subassignee pop removal (55-04 UX-01); // +6: kanban.section.columnHeader/columnEmpty/addCardHere/rowLabel/rowHeader/rowEmpty — the board-section render copy (55-03, wave-4 consumers); // +3: export.hint.xlsx/mspdi/csv — the hint line under each format box (owner request 2026-11-10); // +1: page.columns.progress — the table column header + tooltips (owner request 2026-11-10); // +1: page.subtask.inheritedDue — the inherited-due hint (2026-11-10); +12: export.month.* (54-05, another session, same landing); +12: task.label.assessment/preparation/migration/validation/identity/email/licensing/network/security/backup/documentation/vendor — the infrastructure/migration label catalog extension (2026-11-10) // +24: export.meta.* (6) + export.kpi.* (4) + export.chart.* (3) + export.col.lane/count/member/open/done/total/name/date/state (10) + export.milestone.done/upcoming (2) — the Summary/Board/Members/Milestones sheets and their chart headers (54-03) // +35: the export.* family (title/format/scope/options/submit/notice/col.*) plus err.exportFailed/Forbidden/InvalidRequest — the export modal, its five toggles and the keyed refusals (54-01) // +3: modal.settingsTabs/settingsTabGeneral/settingsTabAccess — the unified project settings modal tab bar (53-03 D-04); +2: modal.teamPermFor/modal.settingsConflict — the per-team perm dropdown and the honest revision-conflict message (53-03 D-02/T-53-08) // +2: err.inviteGuestProjectRequired/inviteGuestProjectSingle — the T-53-05 guest one-project refusals (53-02); +1: err.projectSaveFailed — the WR-01 conflict-honesty on the edit submit (2026-11-09 owner ruling) // +4: page.members.visReasonTeam/visReasonError/visLoading/visDetailTitle — the transparency-panel state copy (52-02 UI review) // +6: page.members.visReason.everyone/lead/member/team + page.members.visReasonEmpty + a11y.memberVisibility (52-02) // −17: the dead-key sweep of the new i18n-gate detector removed the orphaned keys no source references (51-03, UX-01 criterion 5): a11y.settings.ownerOnly/qr, a11y.toggleSubPages, act.disable2faTitle/Body, act.inviteTeam (the invite button reads a11y.inviteTeam), nav.tab.files, page.auth.signInTo/welcomeBack, settings.nav.twoFactor, settings.tfa.anyDigits/recovery/regenDesc/setup, toast.passwordUpdated, toast.twoFaEnabled/Disabled // −6: settings.nav.permissions + settings.perms.lead/guests/guestsDesc/public/publicDesc deleted with the Settings > Permissions page (51-03, CRT-02; settings.perms.create and settings.perms.roleTable survive — General row and Members table) // +6: modal.teamsSection/modal.teamsLiveHint/act.inviteTeam/a11y.inviteTeam/toast.teamLinked/toast.teamUnlinked — the share-modal Teams section (51-02, D-51-5..9; act.inviteTeam retired by the 51-03 sweep); +2: page.projects.createRestricted + err.projectCreateForbidden — the restricted-create gating and keyed-refusal toast (51-02, CRT-01) // −1: settings.notif.pushComingSoon deleted — real push toggles replace the Coming-soon badge (48-02, D-48-3; the plan's −2 total counts EN+FR, the catalogue counts EN only) // +5: toast.pushMention/pushAssign/pushComment, settings.notif.pushBrowserBlocked, toast.pushBrowserBlocked (48-01); +3: settings.tz.searchLabel/placeholder/noResults — the tz combobox strings (44-03); +2: err.invalidLogo/err.logoNotFound (43-01, LOGO-01); +2: settings.ws.uploadLogo/removeLogo (43-02) // −2: settings.notif.dueReminders/dueDesc deleted with the legacy push_due row (G-37-2) // −1: notif.reminder.dayBefore deleted (37-01, REM-01) // +15: notif.reminder.*/notif.email.* server notification keys (36-01) // +1: err.notifPrefsSaveFailed (34-04) // +1: err.unknownPrefKey (34-02, cataloguing the 34-01 route code) // +1: err.inviteAdminEmailRequired (33-02) // +5: err.scopeNotAllowed/scopeRequired/projectsRequired/tooManyProjects/unknownProject (29-01); +3: err.teamsRequired/tooManyTeams/unknownTeam (28-01); +3: err.changeTeam, act.editTeams, modal.memberTeamsHint (28-02); +1: modal.inviteTeamsHint (28-03); +1: settings.tfa.factor.primary (31-01, D-07); +3: err.labelRequired/labelTooLong/factorNotFound (31-02); +9: the settings.tfa add/remove-factor keys (31-03); +1: err.assigneeOutOfScope (29-03); +1: err.guestSingleProject (29-04); +8: modal.scopeSection/scopeProjectsLabel/scopeTeamsLabel/guestToggle/guestHint/workspaceWideHint/scopeFixedHint + err.changeScope (29-04 UI surfaces); +3: page.auth.ssoError/invitationsTitle/invitationsBody (30-04); +4: notif.digest.subject/dueToday/overdue/footer (38-01); +1: notif.digest.subjectWs (40-02); +1: notif.digest.unsubscribe (41-01); +1: settings.notif.pushComingSoon (42-02); +1: page.auth.panelLine, −6: the Google/Apple demo buttons, their toasts and the free-tier line retired (landing redesign); +2: notif.unsubscribe.verified/neutral + err.methodNotAllowed (42-01); +26: settings.apikeys.* — the personal API keys card (MCP-01); +4: err.keyLabelRequired/invalidScope/invalidExpiry/keyNotFound — the /api/keys codes (MCP-01) // −7: settings.nav.assignments + the six @workspace/assign notif strings deleted with the inert Assignments tab (PR #18 b094c22; count reconciled at merge); icons baseline −user-check same cause // +21: the named saved views family (57-02): popover.savedViews/saveCurrentView/updateView/noSavedViews, modal.saveTableView/replaceTableView/saveTableViewReplace/updateTableViewConfirm, act.replaceView, toast.savedTableView/appliedTableView/deletedTableView, a11y.deleteTableView, err.viewNameRequired/invalidViewName/viewNameConflict/viewLimitReached/viewBlobTooLarge/viewKeyNotNamed/viewSaveFailed/viewDeleteFailed
  assert.ok(
    keys.every(k => !k.startsWith('contract.') || k === 'contract.englishOnly'),
    'a phase key sits under contract.*',
  );
});

test('the icon baseline holds at its maintained size', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/icons-baseline.json'), 'utf8'));
  const names = Array.isArray(baseline) ? baseline : baseline.icons || Object.keys(baseline);
  assert.equal(names.length, 181, 'the icon baseline moved'); // +6 (2026-11-19, lucide 0.460→1.76 upgrade): the newer catalogue ships additional icons whose kebab names now collide with quoted source tokens — can, cap, form, numbers, rose, timeline (tokens already present in src/, newly recognized as icons by the expanded catalogue); prior: +1: corner-down-right (the 65-04 re-parent menu/picker glyph); prior: +1: gauge (the admin dashboard nav entry, 60-02; shield-check was already in the set — it returns for the Settings › My access nav entry); prior: +1: network (the Timeline connector/dependency legend, 54-04) // +1: gauge (the admin dashboard nav entry, 60-02; shield-check was already in the set — it returns for the Settings › My access nav entry); prior: +1: network (the Timeline connector/dependency legend, 54-04) // +1: percent (the Summary KPI rows, 54-03) // +2: align-left (export scope selector) + view (the export modal icon) — the export entry points and modal (54-01) // +1: plug for the API-keys nav entry (MCP-01); shield-check returns for the 2FA login screen (17-02); −1: the apple glyph left with the demo social buttons
});

/* ---------- 5. phase 71 — the List subrow columns pins (71-01) ---------- */

/* The renderer lives in the lazy chunk that reaches a Vite virtual module,
   so bare Node cannot import it — the same constraint the i18n-format suite
   documents. The pins below assert the renderer's emitted TEMPLATE
   CONTRACTS on the source: the exact expressions the columns branch
   interpolates are static, so each pin holds for every render. */

const RENDERER_SRC = fs.readFileSync(path.join(ROOT, 'src/features/subtask-popovers.js'), 'utf8');
const LIST_SRC = fs.readFileSync(path.join(ROOT, 'src/components/task-list.js'), 'utf8');

const columnsBranch = RENDERER_SRC.slice(RENDERER_SRC.indexOf('const meta = opt.columns'), RENDERER_SRC.indexOf("walk(sid, depth + 1)"));

test('the columns branch emits the four meta cells (D-71-1)', () => {
  for (const cell of ['c-meta c-status', 'c-meta c-assignee', 'c-meta c-priority', 'c-meta c-due'])
    assert.ok(columnsBranch.includes(`<div class="${cell}${cell === 'c-meta c-priority' ? ' inh' : ''}">`), `the ${cell} cell is missing`);
  /* the cells are display divs — no pop action attributes (D-71-7) */
  assert.ok(!columnsBranch.includes('data-a'), 'the meta cells must not carry action attributes');
  /* the List forwards the parent grid template onto the subrows container */
  assert.ok(LIST_SRC.includes('<div class="subrows" style="--cols:${tpl}">'), 'the subrows container does not receive --cols');
  assert.ok(LIST_SRC.includes("rowClass: 'subrow', columns: cols"), 'the List does not forward the call-site cols to the renderer');
});

test('the meta cells follow the call site\u2019s column order, not a hardcoded sequence (CR-01 71-REVIEW)', () => {
  /* my-tasks.js reorders to ['project','status','priority','due'] — the
     renderer must map one cell per FORWARDED column so the cells land on
     the parent's own tracks, never a hardcoded status→assignee→priority→due
     sequence. */
  assert.ok(LIST_SRC.includes("rowClass: 'subrow', columns: cols"), 'the List does not forward the call-site cols to the renderer');
  assert.ok(columnsBranch.includes('opt.columns'), 'the columns branch does not consume the forwarded cols');
  assert.ok(columnsBranch.includes('.map(c =>'), 'the columns branch does not map one cell per forwarded column');
  /* a column the renderer does not model (project, labels) emits an empty
     placeholder div so the supported cells keep their parent tracks */
  assert.ok(columnsBranch.includes('`<div class="c-meta"></div>`'), 'unsupported columns do not emit an alignment placeholder');
});

test('the toggleSub contract survives the columns branch (D-71-2, T-71-01 XSS)', () => {
  const toggleDecl = RENDERER_SRC.match(/const toggle = `<input type="checkbox" class="check"[^`]*`;/);
  assert.ok(toggleDecl, 'the toggleSub input template is missing');
  const toggle = toggleDecl[0];
  for (const attr of ['data-a="toggleSub"', 'data-id="${tid}"', 'data-sid="${sid}"'])
    assert.ok(toggle.includes(attr), `the toggle input lost ${attr}`);
  assert.ok(toggle.includes('${s.done ? \'checked\' : \'\'}'), 'the checked state is not derived from s.done');
  assert.ok(toggle.includes("t('a11y.subtaskReopen'") && toggle.includes("t('a11y.subtaskComplete'"), 'the aria labels are not the catalogue lookups');
  /* the chip composes the pill next to the SAME input, inside the status cell */
  assert.ok(columnsBranch.includes('${toggle}${stPill(s.done ? \'done\' : \'todo\')}'), 'the status chip does not wrap the toggleSub input with the done/todo pill');
  /* user-controlled strings escape: the title goes through esc(), the empty-assignees fallback is a catalogue key */
  assert.ok(RENDERER_SRC.includes('const et = esc(s.title);'), 'the subtask title is not escaped');
  assert.ok(columnsBranch.includes(`t('common.unassigned')`), 'the empty-assignees fallback is not the catalogue key');
});

test('the priority cell inherits the PARENT priority, dimmed (D-71-4)', () => {
  assert.ok(columnsBranch.includes('prPill(task0.priority)'), 'the priority pill is not the parent task0.priority');
  assert.ok(columnsBranch.includes('c-meta c-priority inh'), 'the priority cell does not carry the .inh dim modifier');
  /* the subtask never renders an own priority (it has none in the model) */
  assert.ok(!columnsBranch.includes('s.priority'), 'the columns branch must not read an own subtask priority');
});

test('the due cell keeps the inherited tooltip and the overdue class (D-71-5)', () => {
  const dueCell = columnsBranch.slice(columnsBranch.indexOf('c-meta c-due'));
  assert.ok(RENDERER_SRC.includes('const due = s.due || task0.due;'), 'the due value does not fall back to the parent');
  assert.ok(dueCell.includes('page.subtask.inheritedDue'), 'the inherited tooltip key is missing');
  assert.ok(dueCell.includes("s.due ? '' : ` data-tip="), 'the tooltip is not gated on !s.due');
  assert.ok(dueCell.includes("!s.done && diffD(parse(due), TODAY) < 0 ? 'over'"), 'the overdue class is not gated on !s.done + past due');
  assert.ok(dueCell.includes('relDate(due)'), 'the due label is not the relative date helper');
});

test('the board card popover keeps its compact output — no columns leakage (ADR-1 regression)', () => {
  const boardCall = RENDERER_SRC.slice(RENDERER_SRC.indexOf('subPop.subs = p =>'), RENDERER_SRC.indexOf('subPop.subParent'));
  assert.ok(boardCall.includes('subTreeChecklistHtml(st, { compact: true })'), 'the board consumer no longer passes bare compact');
  assert.ok(!boardCall.includes('columns'), 'the board consumer leaks the columns opt');
  assert.ok(!boardCall.includes('c-meta'), 'the board popover template emits meta-cell markup');
});

/* ---------- 6. phase 71 — the subrow alignment pins (71-02 gap closure) ---------- */

const LIST_CSS = fs.readFileSync(path.join(ROOT, 'src/styles/views/list.css'), 'utf8');

const subrowBlock = LIST_CSS.slice(LIST_CSS.indexOf('.subrow {'), LIST_CSS.indexOf('/* Phase 71 (ADR-5)'));
const subheadRule = LIST_CSS.slice(LIST_CSS.indexOf('.subrow > .subhead {'), LIST_CSS.indexOf('.subrow > .subhead .s'));

test('the subrow grid shares the parent rows\u2019 zero inter-track gap (CR-01, D-71-1)', () => {
  assert.ok(subrowBlock.includes('display: grid'), 'the subrow is not a grid');
  assert.ok(subrowBlock.includes('grid-template-columns: var(--cols'), 'the subrow does not join the parent template via --cols');
  assert.ok(subrowBlock.includes('gap: 0'), 'the subrow keeps a non-zero inter-track gap');
  assert.ok(!subrowBlock.includes('gap: 8px'), 'the subrow still carries the legacy flex gap');
});

test('the tree indent rides the grid item, not the container (WR-02)', () => {
  assert.ok(!subrowBlock.includes('var(--ind'), 'the indent custom property still shifts the grid container');
  assert.ok(!subrowBlock.includes('padding-left'), 'a padding-left on the grid container shifts the meta tracks (G-71-2: the tree base rides the item)');
  assert.ok(subheadRule.includes('margin-left: calc(64px + var(--ind, 0px))'), 'the tree base + depth indent do not ride the .subhead grid item');
  assert.ok(!subheadRule.includes('margin-left: var(--ind, 0px);'), 'the subhead margin lost the fixed 64px tree base');
});

test('the status chip shows a visible keyboard focus indicator (WR-01, WCAG 2.4.7)', () => {
  const focusRule = LIST_CSS.match(/\.stchip:focus-within\s*\{[^}]*\}/);
  assert.ok(focusRule, 'no :focus-within rule targets .stchip');
  assert.ok(focusRule[0].includes('outline'), 'the focus rule does not declare an outline');
  assert.ok(focusRule[0].includes('var(--accent)'), 'the focus outline does not use the accent token');
});

test('the --cols fallback documents LCOLS as its sync source (IN-01)', () => {
  const fallbackComment = LIST_CSS.slice(LIST_CSS.indexOf('.subrow {'), LIST_CSS.lastIndexOf('grid-template-columns'));
  assert.ok(fallbackComment.includes('LCOLS') && fallbackComment.includes('task-list.js'), 'the fallback template does not reference LCOLS / task-list.js as the sync source');
});

test('the subrow meta cells carry the parent cells\u2019 horizontal padding (G-71-1)', () => {
  const cmetaRule = LIST_CSS.match(/\.subrow > \.c-meta\s*\{[^}]*\}/);
  assert.ok(cmetaRule, 'no .subrow > .c-meta rule in list.css');
  assert.ok(/^\.subrow > \.c-meta\s*\{[^}]*padding: 0 8px;/m.test(cmetaRule[0]), 'the subrow meta cells lack the parent cells\u2019 8px horizontal padding');
  assert.ok(cmetaRule[0].includes('display: flex'), 'the subrow meta rule does not keep display: flex');
  assert.ok(cmetaRule[0].includes('align-items: center'), 'the subrow meta rule does not keep align-items: center');
  // Geometry guards (grow-only reinforcement of the 71-02 pins): the new rule
  // must not silently displace the verified subrow geometry.
  assert.ok(subrowBlock.includes('gap: 0'), 'the subrow lost its zero inter-track gap');
  assert.ok(!subrowBlock.includes('padding-left'), 'a padding-left on the grid container shifts the meta tracks (G-71-2: the tree base rides the item)');
  assert.ok(subheadRule.includes('margin-left: calc(64px + var(--ind, 0px))'), 'the tree base + depth indent do not ride the .subhead grid item');
  assert.ok(!subheadRule.includes('margin-left: var(--ind, 0px);'), 'the subhead margin lost the fixed 64px tree base');
  // Decoy pin: count the ANCHORED full declaration, not the substring — the
  // .grp rule carries `padding: 0 8px 0 22px` and must not be miscounted.
  const anchored = LIST_CSS.match(/^[ \t]*padding: 0 8px;[ \t]*$/gm) || [];
  assert.strictEqual(anchored.length, 3, `expected exactly 3 anchored "padding: 0 8px;" declarations (.thead > div, .trow > div, .subrow > .c-meta), found ${anchored.length}`);
});
