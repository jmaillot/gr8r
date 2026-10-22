/* =====================================================================
   The page contract (plan 06-09): the authentication page with its
   six-step onboarding wizard (task 1), the design-system gallery with
   its system-states page (task 2) and the settings page with its
   eighteen sections (task 3) read the English catalogue — while the
   machine identifiers stay exactly as they are: the onboarding step
   keys, the theme keys, the token names, the tab keys, the stored
   time-zone and language values, and the demo values the pages
   pre-fill their forms with.

   Families:
     1. the English oracle — every new value renders its previous English,
        and the keys this wave reuses still render theirs;
     2. the absence — the scanner reports no finding for the swept files
        and the allow-list carries none of them;
     3. the machine identifiers — the data-a / data-v sites, the onboarding
        keys, the token variables, the stored preference values and the
        computed date/time previews are byte-identical to what they were.
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
const WAVE_FILES = ['src/pages/auth.js', 'src/pages/design-system.js', 'src/pages/settings.js'];

/* ---------- 1. the English oracle ---------- */

const TABLES = [
  /* ---- task 1: the authentication page ---- */
  [
    // the shell
    ['a11y.auth.toggleTheme', undefined, 'Toggle theme'],
    ['page.auth.legal', undefined, '© 2026 Gr8r Studio · Terms · Privacy'],
    ['page.auth.continueGoogle', undefined, 'Continue with Google'],
    ['page.auth.continueMicrosoft', undefined, 'Continue with Microsoft'],
    ['page.auth.continueApple', undefined, 'Continue with Apple'],
    // sign in
    ['page.auth.welcomeBack', undefined, 'Welcome back'],
    ['page.auth.signInTo', undefined, 'Sign in to'],
    ['page.auth.forgotPassword', undefined, 'Forgot password?'],
    ['page.auth.hidePw', undefined, 'Hide password'],
    ['page.auth.showPw', undefined, 'Show password'],
    ['page.auth.rememberMe', undefined, 'Remember me for 30 days'],
    ['page.auth.signIn', undefined, 'Sign in'],
    ['page.auth.noAccount', undefined, "Don't have an account?"],
    ['page.auth.signUp', undefined, 'Sign up'],
    ['page.auth.adminCreates', undefined, 'Accounts are created by your workspace admin.'],
    // join
    ['page.auth.inviteUnavailable', undefined, 'Invite unavailable'],
    ['page.auth.goToSignIn', undefined, 'Go to sign in'],
    ['page.auth.joinTitle', { name: 'Acme' }, 'Join Acme'],
    ['page.auth.thisAddress', undefined, 'This address'],
    ['page.auth.existingBody', { email: 'a@b.co' }, 'a@b.co already has a Gr8r account. Sign in with it to join this workspace.'],
    ['page.auth.signInAndJoin', undefined, 'Sign in and join'],
    ['page.auth.wrongAddress', { name: 'Acme' }, 'Invited with the wrong address? Ask an administrator of Acme for a new invite.'],
    ['page.auth.joinSubtitle', undefined, 'Create your account to get access to this workspace.'],
    ['a11y.auth.yourName', undefined, 'Your name'],
    ['page.auth.inviteForAddress', undefined, 'This invite is for this address.'],
    // the &amp; entity case: the catalogue carries the text the user reads
    ['page.auth.createJoin', undefined, 'Create account & join'],
    ['page.auth.haveAccount', undefined, 'Already have an account?'],
    // no workspace / sign up
    ['page.auth.noWorkspaceTitle', undefined, "You're not in a workspace yet"],
    [
      'page.auth.noWorkspaceBody',
      undefined,
      'Ask an administrator of an existing workspace for an invitation. Once you accept it, the workspace will show up here.',
    ],
    ['page.auth.signedInAs', undefined, 'Signed in as'],
    ['page.auth.you', undefined, 'you'],
    ['page.auth.createYourAccount', undefined, 'Create your account'],
    ['page.auth.signupCloud', undefined, 'You can create or join a workspace next.'],
    ['page.auth.signupFree', undefined, 'Free for up to 3 members. No credit card required.'],
    ['page.auth.workEmail', undefined, 'Work email'],
    ['page.auth.createAccount', undefined, 'Create account'],
    ['page.auth.termsNote', undefined, 'By creating an account you agree to the Terms and Privacy Policy.'],
    ['page.auth.logIn', undefined, 'Log in'],
    // forgot / reset / verify
    ['page.auth.resetTitle', undefined, 'Reset your password'],
    ['page.auth.resetSubtitle', undefined, "Enter your account email and we'll send you a reset link."],
    ['page.auth.sendResetLink', undefined, 'Send reset link'],
    ['page.auth.backToSignIn', undefined, 'Back to sign in'],
    ['page.auth.checkEmail', undefined, 'Check your email'],
    ['page.auth.resetLinkSent', undefined, 'We sent a reset link to'],
    ['page.auth.resetExpires', undefined, '. It expires in 30 minutes.'],
    ['page.auth.openResetLink', undefined, 'Open reset link'],
    ['page.auth.prototypeNote', undefined, 'In this prototype, the button above stands in for the link in your email.'],
    ['page.auth.noEmail', undefined, "Didn't get it?"],
    ['page.auth.resendEmail', undefined, 'Resend email'],
    ['page.auth.chooseNewPw', undefined, 'Choose a new password'],
    ['page.auth.for', undefined, 'for'],
    ['page.auth.newPassword', undefined, 'New password'],
    ['page.auth.confirmPassword', undefined, 'Confirm password'],
    ['page.auth.resetPassword', undefined, 'Reset password'],
    ['page.auth.pwUpdated', undefined, 'Password updated'],
    ['page.auth.pwUpdatedBody', undefined, 'You can now sign in with your new password.'],
    ['page.auth.verifyTitle', undefined, 'Verify your email'],
    ['page.auth.verifyLinkSent', undefined, 'We sent a verification link to'],
    ['page.auth.verifyClick', undefined, '. Click it to activate your account.'],
    ['page.auth.waitingVerification', undefined, 'Waiting for verification…'],
    ['page.auth.verifiedButton', undefined, "I've verified my email"],
    ['page.auth.resendIn', undefined, 'Resend email in'],
    ['page.auth.secondsSuffix', undefined, 's'],
    ['page.auth.wrongEmail', undefined, 'Wrong email?'],
    ['page.auth.changeIt', undefined, 'Change it'],
    // the wizard chrome
    ['page.auth.continue', undefined, 'Continue'],
    ['page.auth.back', undefined, 'Back'],
    ['page.auth.skipForNow', undefined, 'Skip for now'],
    ['page.auth.stepOf', { n: 2, total: 6 }, 'Step 2 of 6'],
    // step 1 — what are you working on
    ['page.auth.onb1Title', undefined, 'What are you working on?'],
    ['page.auth.onb1Sub', undefined, "We'll tailor templates and views to fit. You can change this later."],
    ['page.auth.use.product', undefined, 'Product'],
    ['page.auth.use.productSub', undefined, 'Roadmaps & launches'],
    ['page.auth.use.design', undefined, 'Design'],
    ['page.auth.use.designSub', undefined, 'Reviews & handoff'],
    ['page.auth.use.marketing', undefined, 'Marketing'],
    ['page.auth.use.marketingSub', undefined, 'Campaigns & content'],
    ['page.auth.use.engineering', undefined, 'Engineering'],
    ['page.auth.use.engineeringSub', undefined, 'Sprints & releases'],
    ['page.auth.use.personal', undefined, 'Personal'],
    ['page.auth.use.personalSub', undefined, 'Goals & side projects'],
    ['page.auth.use.other', undefined, 'Other'],
    ['page.auth.use.otherSub', undefined, 'Something else'],
    // step 2 — workspace
    ['page.auth.onb2Title', undefined, 'Create your workspace'],
    ['page.auth.onb2Sub', undefined, "A workspace is where your team's projects live."],
    ['a11y.auth.wsNamePlaceholder', undefined, 'e.g. Gr8r Studio'],
    ['page.auth.wsUrlHint', undefined, 'Your workspace will live at'],
    // step 3 — how does your team work
    ['page.auth.onb3Title', undefined, 'How does your team work?'],
    ['page.auth.onb3Sub', undefined, "We'll set your default project view."],
    ['page.auth.team.boards', undefined, 'Boards'],
    ['page.auth.team.boardsSub', undefined, 'Move cards through stages'],
    ['page.auth.team.lists', undefined, 'Lists'],
    ['page.auth.team.listsSub', undefined, 'Checklists and priorities'],
    ['page.auth.team.timelines', undefined, 'Timelines'],
    ['page.auth.team.timelinesSub', undefined, 'Plan with dates & dependencies'],
    ['page.auth.team.tables', undefined, 'Tables'],
    ['page.auth.team.tablesSub', undefined, 'Spreadsheet-style tracking'],
    ['page.auth.teamSize', undefined, 'Team size'],
    ['page.auth.size.justMe', undefined, 'Just me'],
    // step 4 — first project
    ['page.auth.onb4Title', undefined, 'Create your first project'],
    ['page.auth.onb4Sub', undefined, 'Start from a template or a blank project.'],
    ['page.auth.projectName', undefined, 'Project name'],
    // step 5 — invites
    ['page.auth.onb5Title', undefined, 'Invite your team'],
    ['page.auth.onb5Sub', undefined, 'Gr8r works best with your teammates.'],
    ['page.auth.onb5MailHint', undefined, "They'll get an email invite."],
    ['page.auth.onb5LinkHint', undefined, "You'll get a link to share."],
    ['a11y.auth.inviteEmail', undefined, 'Teammate email'],
    ['page.auth.copyInviteLink', undefined, 'Copy invite link instead'],
    ['page.auth.sendInvites', undefined, 'Send invites'],
    // step 6 — ready
    ['page.auth.onb6Title', undefined, 'Your workspace is ready'],
    ['page.auth.onb6Sub', undefined, "Here's what we set up for you."],
    ['page.auth.myWorkspace', undefined, 'My Workspace'],
    ['page.auth.readyWorkspace', { name: 'My Workspace' }, 'Workspace “My Workspace”'],
    ['page.auth.readyProject', { name: 'Homepage' }, 'Project “Homepage”'],
    ['page.auth.readyStarter', { n: 3, view: 'Board' }, '3 starter tasks · Board view'],
    ['page.auth.noInvites', undefined, 'No invites yet'],
    ['page.auth.invitesAppear', undefined, "They'll appear in Members once they join"],
    ['page.auth.inviteAnytime', undefined, 'Invite people any time from the sidebar'],
    ['page.auth.openWorkspace', undefined, 'Open workspace'],
    // the reused keys
    ['common.email', undefined, 'Email'],
    ['common.password', undefined, 'Password'],
    ['common.fullName', undefined, 'Full name'],
    ['common.pwHint', undefined, 'At least 10 characters with a number or symbol.'],
    ['common.wsName', undefined, 'Workspace name'],
    ['common.wsUrl', undefined, 'Workspace URL'],
    ['page.auth.invitesSent', { n: 2 }, '2 invites sent'],
  ],
  /* ---- task 2: the design-system page ---- */
  [
    ['page.design.title', undefined, 'Design system'],
    ['page.design.subtitle', undefined, 'Tokens and components that make up Gr8r. Switch themes to see both palettes.'],
    ['page.design.state.default', undefined, 'Default'],
    ['page.design.state.hover', undefined, 'Hover'],
    ['page.design.state.active', undefined, 'Active'],
    ['page.design.state.focus', undefined, 'Focus'],
    ['page.design.state.disabled', undefined, 'Disabled'],
    ['page.design.state.loading', undefined, 'Loading'],
    ['page.design.colorTitle', undefined, 'Color'],
    ['page.design.colorSub', undefined, 'Semantic tokens, redefined per theme'],
    ['page.design.token.background', undefined, 'Background'],
    ['page.design.token.sidebar', undefined, 'Sidebar'],
    ['page.design.token.surface', undefined, 'Surface'],
    ['page.design.token.surface2', undefined, 'Surface 2'],
    ['page.design.token.surface3', undefined, 'Surface 3'],
    ['page.design.token.border', undefined, 'Border'],
    ['page.design.token.borderStrong', undefined, 'Border strong'],
    ['page.design.token.text', undefined, 'Text'],
    ['page.design.token.text2', undefined, 'Text 2'],
    ['page.design.token.text3', undefined, 'Text 3'],
    ['page.design.token.accent', undefined, 'Accent'],
    ['page.design.token.success', undefined, 'Success'],
    ['page.design.token.warning', undefined, 'Warning'],
    ['page.design.token.error', undefined, 'Error'],
    ['page.design.statusTitle', undefined, 'Status & priority'],
    ['page.design.statusSub', undefined, 'Always paired with text or a tooltip'],
    ['page.design.typeTitle', undefined, 'Typography'],
    ['page.design.typeSub', undefined, 'Geist · Geist Mono'],
    ['page.design.type.pageTitle', undefined, 'Page title'],
    ['page.design.type.sectionTitle', undefined, 'Section title'],
    ['page.design.type.subsection', undefined, 'Subsection'],
    ['page.design.type.body', undefined, 'Body'],
    ['page.design.type.secondary', undefined, 'Secondary'],
    ['page.design.type.metadata', undefined, 'Metadata'],
    ['page.design.type.label', undefined, 'Label'],
    ['page.design.demo.redesign', undefined, 'Website Redesign'],
    ['page.design.demo.deadlines', undefined, 'Upcoming deadlines'],
    ['page.design.demo.subtasks', undefined, 'Subtasks'],
    ['page.design.demo.wireframes', undefined, 'Low-fidelity wireframes for the new homepage.'],
    ['page.design.demo.updatedAgo', undefined, 'Updated 38 minutes ago'],
    ['page.design.demo.dueTicket', undefined, 'WEB-109 · Due tomorrow'],
    ['page.design.demo.workspaceTag', undefined, 'WORKSPACE'],
    ['page.design.spacingTitle', undefined, 'Spacing, radius, elevation'],
    ['page.design.spacingSub', undefined, '4pt scale'],
    ['page.design.buttonsTitle', undefined, 'Buttons'],
    ['page.design.buttonsSub', undefined, 'Primary · Secondary · Ghost · Destructive · Icon'],
    ['page.design.btn.createTask', undefined, 'Create task'],
    ['page.design.btn.share', undefined, 'Share'],
    ['page.design.btn.filter', undefined, 'Filter'],
    ['page.design.sizes', undefined, 'Sizes:'],
    ['page.design.size.small', undefined, 'Small'],
    ['page.design.size.medium', undefined, 'Medium'],
    ['page.design.size.large', undefined, 'Large'],
    ['a11y.design.disabled', undefined, 'Disabled'],
    ['page.design.inputsTitle', undefined, 'Inputs'],
    ['page.design.input.text', undefined, 'Text'],
    ['page.design.input.focus', undefined, 'Focus'],
    ['page.design.input.error', undefined, 'Error'],
    ['page.design.input.disabled', undefined, 'Disabled'],
    ['page.design.input.search', undefined, 'Search'],
    ['page.design.input.select', undefined, 'Select'],
    ['page.design.input.multi', undefined, 'Multi-select'],
    ['page.design.input.date', undefined, 'Date'],
    ['page.design.input.time', undefined, 'Time'],
    ['page.design.input.checks', undefined, 'Checkbox · Radio · Toggle'],
    ['page.design.input.textarea', undefined, 'Textarea'],
    ['page.design.input.richText', undefined, 'Rich text'],
    ['a11y.design.taskName', undefined, 'Task name'],
    ['page.design.emailError', undefined, 'Enter a valid email address'],
    ['a11y.design.searchTasks', undefined, 'Search tasks'],
    ['page.design.inProgress', undefined, 'In Progress'],
    ['page.design.review', undefined, 'Review'],
    ['page.design.addMore', undefined, 'Add…'],
    ['page.design.descPlaceholder', undefined, 'Add a description…'],
    ['page.design.bold', undefined, 'Bold'],
    ['page.design.italic', undefined, 'italic'],
    ['page.design.andLists', undefined, 'and lists.'],
    ['page.design.navTitle', undefined, 'Navigation'],
    ['page.design.demo.inboxActive', undefined, 'Inbox (active)'],
    ['page.design.demo.mytasksHover', undefined, 'My Tasks (hover)'],
    ['page.design.demo.studio', undefined, 'Gr8r Studio'],
    ['page.design.seg.grid', undefined, 'Grid'],
    ['page.design.dataTitle', undefined, 'Data display'],
    ['page.design.lab.avatar', undefined, 'Avatar'],
    ['page.design.lab.badge', undefined, 'Badge'],
    ['page.design.lab.progress', undefined, 'Progress'],
    ['page.design.badge.overdue', undefined, '3 overdue'],
    ['page.design.feedbackTitle', undefined, 'Feedback'],
    ['page.design.alert.headsUp', undefined, 'Heads up.'],
    ['page.design.alert.timelineDeps', undefined, 'Timeline dependencies are shown as dashed when out of order.'],
    ['page.design.alert.archived', undefined, 'Project archived.'],
    ['page.design.alert.saveFailed', undefined, "Your changes couldn't be saved."],
    ['page.design.alert.dueWeek', undefined, '3 tasks due this week are not started.'],
    ['page.design.trigger.toast', undefined, 'Toast'],
    ['page.design.trigger.errorToast', undefined, 'Error toast'],
    ['page.design.trigger.tooltip', undefined, 'Tooltip'],
    ['page.design.trigger.modal', undefined, 'Modal'],
    ['page.design.trigger.drawer', undefined, 'Drawer'],
    ['page.design.trigger.confirmation', undefined, 'Confirmation'],
    ['page.design.trigger.commandMenu', undefined, 'Command menu'],
    ['a11y.design.tooltipTip', undefined, 'Tooltips pair with icon buttons'],
    ['page.design.iconTitle', undefined, 'Iconography'],
    ['page.design.iconSub', undefined, 'Lucide · 1.8px stroke · 12–18px'],
    ['page.states.title', undefined, 'System states'],
    ['page.states.subtitle', undefined, 'Empty, loading, error, and confirmation states used throughout Gr8r.'],
    ['page.states.backOnline', undefined, 'Go back online'],
    ['page.states.simulateOffline', undefined, 'Simulate offline'],
    ['page.states.emptyTitle', undefined, 'Empty states'],
    ['page.states.loadingTitle', undefined, 'Loading states'],
    ['page.states.errorTitle', undefined, 'Error states'],
    ['page.states.confirmTitle', undefined, 'Confirmation dialogs'],
    ['page.states.noProjects', undefined, 'No projects'],
    ['page.states.noProjectsYet', undefined, 'No projects yet'],
    ['page.states.createFirst', undefined, 'Create your first project to start organizing your work.'],
    ['page.states.createProject', undefined, 'Create project'],
    ['page.states.noTasks', undefined, 'No tasks'],
    ['page.states.noTasksHere', undefined, 'No tasks here'],
    ['page.states.addTaskBody', undefined, 'Add a task to get things moving.'],
    ['page.states.noNotifications', undefined, 'No notifications'],
    ['page.states.caughtUp', undefined, "You're all caught up."],
    ['page.states.mentionsShowUp', undefined, 'New mentions and assignments will show up here.'],
    ['page.states.noSearchResults', undefined, 'No search results'],
    ['page.states.noResults', undefined, 'No results found'],
    ['page.states.noResultsBody', undefined, 'Nothing matches “brand guidlines”. Check the spelling or try a broader term.'],
    ['page.states.clearSearch', undefined, 'Clear search'],
    ['page.states.listRows', undefined, 'List / table rows'],
    ['page.states.cards', undefined, 'Cards'],
    ['page.states.boardColumn', undefined, 'Board column'],
    ['page.states.buttonsPage', undefined, 'Buttons & page'],
    ['page.states.saving', undefined, 'Saving'],
    ['page.states.loading', undefined, 'Loading'],
    ['page.states.clickToLoad', undefined, 'Click to load'],
    ['page.states.loadingProject', undefined, 'Loading project…'],
    ['page.states.replaySkeleton', undefined, 'Replay page skeleton'],
    ['page.states.networkError', undefined, 'Network error'],
    ['page.states.offlineTitle', undefined, "You're offline"],
    ['page.states.offlineBody', undefined, "Check your connection. We'll sync your changes when you're back."],
    ['page.states.failedToLoad', undefined, 'Failed to load'],
    ['page.states.somethingWentWrong', undefined, 'Something went wrong.'],
    ['page.states.loadFailedBody', undefined, 'This view failed to load. Your data is safe.'],
    ['page.states.failedToSave', undefined, 'Failed to save'],
    ['page.states.serverTimeout', undefined, "The server didn't respond in time."],
    ['page.states.showAsToast', undefined, 'Show as toast'],
    ['page.states.permissionDenied', undefined, 'Permission denied'],
    ['page.states.noAccess', undefined, "You don't have access"],
    ['page.states.portalPrivate', undefined, 'Customer Portal is private. Request access from Marcus Lee.'],
    ['page.states.openExample', undefined, 'Open example'],
    ['page.states.notFound', undefined, 'Page not found'],
    ['page.states.notFoundBody', undefined, 'The page was moved, deleted, or never existed.'],
    ['page.states.formValidation', undefined, 'Form validation'],
    ['page.states.emailErrorLong', undefined, 'Enter a valid email, like name@company.com'],
    ['page.states.removeMember', undefined, 'Remove member'],
    ['page.states.archiveProject', undefined, 'Archive project'],
    ['page.states.demoNote', undefined, 'These open the real dialogs. Confirming performs the action on demo data; use Help → Reset demo data to restore.'],
  ],
  /* ---- task 3: the settings page ---- */
  [
    // the navigation
    ['settings.nav.workspace', undefined, 'Workspace'],
    ['settings.nav.appearance', undefined, 'Appearance'],
    ['settings.nav.datetime', undefined, 'Date & time'],
    ['settings.nav.permissions', undefined, 'Permissions'],
    ['settings.nav.profile', undefined, 'Profile'],
    ['settings.nav.preferences', undefined, 'Preferences'],
    ['settings.nav.shortcuts', undefined, 'Keyboard shortcuts'],
    ['settings.nav.password', undefined, 'Password'],
    ['settings.nav.sessions', undefined, 'Sessions'],
    ['settings.nav.twoFactor', undefined, 'Two-factor authentication'],
    ['settings.nav.plan', undefined, 'Plan'],
    ['settings.nav.payment', undefined, 'Payment'],
    ['settings.nav.invoices', undefined, 'Invoices'],
    ['settings.nav.email', undefined, 'Email'],
    ['settings.nav.push', undefined, 'Push'],
    ['settings.nav.mentions', undefined, 'Mentions'],
    ['settings.nav.assignments', undefined, 'Task assignments'],
    ['settings.group.personal', undefined, 'Personal'],
    ['settings.group.security', undefined, 'Security'],
    ['settings.group.billing', undefined, 'Billing'],
    // workspace
    ['settings.ws.lead', undefined, 'Your workspace name, address, and identity.'],
    ['settings.ws.icon', undefined, 'Workspace icon'],
    ['settings.ws.urlWarning', undefined, 'Changing the URL will break existing links.'],
    ['settings.ws.urlReadonly', undefined, 'Only workspace admins can change these settings.'],
    ['settings.ws.saveChanges', undefined, 'Save changes'],
    ['settings.ws.dangerZone', undefined, 'Danger zone'],
    ['settings.ws.leaveTitle', undefined, 'Leave workspace'],
    ['settings.ws.leaveBody', undefined, 'You lose access to this workspace until someone invites you back.'],
    ['settings.ws.deleteTitle', undefined, 'Delete workspace'],
    [
      'settings.ws.deleteBodyApi',
      undefined,
      'Permanently delete this workspace, its projects, tasks and files for every member. You will be asked to type the workspace URL.',
    ],
    ['settings.ws.deleteBodyLocal', undefined, 'Permanently delete this workspace, its projects, tasks, and files. This cannot be undone.'],
    // appearance
    ['settings.appearance.lead', undefined, 'Customize how Gr8r looks on this device.'],
    ['settings.appearance.accentTitle', undefined, 'Accent color'],
    ['settings.appearance.accent', undefined, 'Accent'],
    ['settings.appearance.accentDesc', undefined, 'Used for primary buttons, focus rings, and selection.'],
    ['a11y.settings.accentColor', undefined, 'Accent color'],
    ['settings.accent.indigo', undefined, 'Indigo'],
    ['settings.accent.blue', undefined, 'Blue'],
    ['settings.accent.violet', undefined, 'Violet'],
    ['settings.accent.teal', undefined, 'Teal'],
    ['settings.accent.rose', undefined, 'Rose'],
    ['settings.accent.graphite', undefined, 'Graphite'],
    ['settings.appearance.density', undefined, 'Density'],
    ['settings.density.sidebarTitle', undefined, 'Sidebar density'],
    ['settings.density.sidebarDesc', undefined, 'Compact fits more projects on screen.'],
    ['settings.density.taskTitle', undefined, 'Task display'],
    ['settings.density.taskDesc', undefined, 'Row height in lists and card padding on boards.'],
    ['settings.density.motionTitle', undefined, 'Motion'],
    ['settings.density.motionDesc', undefined, 'Reduce animations for drawers, modals, and transitions.'],
    ['settings.density.comfortable', undefined, 'Comfortable'],
    ['settings.density.compact', undefined, 'Compact'],
    ['settings.motion.system', undefined, 'Follow system'],
    ['settings.motion.reduce', undefined, 'Reduce motion'],
    // language
    ['settings.language.lead', undefined, 'Language and regional formats.'],
    ['settings.language.rowDesc', undefined, 'The language used throughout the interface.'],
    ['settings.language.spellcheck', undefined, 'Spellcheck'],
    ['settings.language.spellcheckDesc', undefined, 'Check spelling in descriptions and comments.'],
    // date & time
    ['settings.datetime.lead', undefined, 'How dates and times appear across the workspace.'],
    ['settings.datetime.tzTitle', undefined, 'Time zone'],
    ['settings.datetime.tzDesc', undefined, 'Used for due dates and reminders.'],
    ['settings.datetime.dateTitle', undefined, 'Date format'],
    ['settings.datetime.preview', undefined, 'Preview:'],
    ['settings.datetime.weekTitle', undefined, 'Start week on'],
    ['settings.datetime.weekDesc', undefined, 'Affects calendars and the timeline.'],
    ['settings.datetime.monday', undefined, 'Monday'],
    ['settings.datetime.sunday', undefined, 'Sunday'],
    ['settings.datetime.saturday', undefined, 'Saturday'],
    ['settings.datetime.timeTitle', undefined, 'Time format'],
    // members / teams / projects
    ['settings.members.lead', { n: 3, name: 'Acme' }, '3 people have access to Acme.'],
    ['settings.members.invite', undefined, 'Invite member'],
    ['settings.members.openDirectory', undefined, 'Open member directory'],
    ['common.invited', undefined, 'Invited'],
    ['a11y.settings.options', undefined, 'Options'],
    ['settings.teams.lead', undefined, 'Teams group people and projects.'],
    ['settings.projects.lead', undefined, 'Defaults for new projects and archived work.'],
    ['settings.projects.defaultView', undefined, 'Default project view'],
    ['settings.projects.defaultViewDesc', undefined, 'The tab that opens when you open a project.'],
    ['settings.projects.showDone', undefined, 'Show completed tasks on boards'],
    ['settings.projects.archived', undefined, 'Archived projects'],
    ['settings.projects.noArchived', undefined, 'No archived projects. Archived projects are hidden from the sidebar but keep all their tasks.'],
    ['settings.projects.openArchive', undefined, 'Open archive'],
    // permissions
    ['settings.perms.lead', undefined, 'Control what each role can do.'],
    ['settings.perms.create', undefined, 'Members can create projects'],
    ['settings.perms.guests', undefined, 'Members can invite guests'],
    ['settings.perms.guestsDesc', undefined, 'Guests only see projects they are added to.'],
    ['settings.perms.public', undefined, 'Allow public share links'],
    ['settings.perms.publicDesc', undefined, 'Anyone with the link can view a project.'],
    ['settings.perms.roleTable', undefined, 'Role permissions'],
    // notifications
    ['settings.notif.emailLead', undefined, 'Choose which emails you receive.'],
    ['settings.notif.mentions', undefined, 'Mentions'],
    ['settings.notif.mentionsDesc', undefined, 'When someone @mentions you.'],
    ['settings.notif.assignments', undefined, 'Assignments'],
    ['settings.notif.assignmentsDesc', undefined, 'When a task is assigned to you.'],
    ['settings.notif.comments', undefined, 'Comments'],
    ['settings.notif.commentsDesc', undefined, 'On tasks you created or are assigned.'],
    ['settings.notif.digest', undefined, 'Daily digest'],
    ['settings.notif.digestDesc', undefined, 'A summary of what changed, every weekday at 8:00.'],
    ['settings.notif.pushLead', undefined, 'Notifications on desktop and mobile.'],
    ['settings.notif.dueReminders', undefined, 'Due date reminders'],
    ['settings.notif.dueDesc', undefined, 'One day before a task is due.'],
    ['settings.notif.mentionsLead', undefined, 'Decide which mentions reach you.'],
    ['settings.notif.atAll', undefined, '@mentions in comments and descriptions'],
    ['settings.notif.atTeam', undefined, '@team mentions'],
    ['settings.notif.atTeamDesc', undefined, 'When your team is mentioned, e.g. @Product.'],
    ['settings.notif.atWorkspace', undefined, '@workspace mentions'],
    ['settings.notif.atWorkspaceDesc', undefined, 'Announcements to everyone.'],
    ['settings.notif.assignLead', undefined, 'Updates about tasks assigned to you.'],
    ['settings.notif.assignedMe', undefined, "When I'm assigned a task"],
    ['settings.notif.statusChange', undefined, 'When my task changes status'],
    ['settings.notif.overdue', undefined, 'When my task is overdue'],
    // profile
    ['settings.profile.lead', undefined, 'How you appear to others in the workspace.'],
    ['settings.profile.avatarColor', undefined, 'Avatar color'],
    ['settings.profile.title', undefined, 'Title'],
    ['settings.profile.emailHint', undefined, 'Contact a workspace owner to change your sign-in email.'],
    ['settings.profile.save', undefined, 'Save profile'],
    // preferences
    ['settings.prefs.lead', undefined, 'Personal defaults for how you work.'],
    ['settings.prefs.launch', undefined, 'Open on launch'],
    ['settings.prefs.launchDesc', undefined, 'The page you see when Gr8r opens.'],
    ['settings.prefs.openTasks', undefined, 'Open tasks in'],
    ['settings.prefs.openTasksDesc', undefined, 'Side panel keeps your place in the list.'],
    ['settings.prefs.sidePanel', undefined, 'Side panel'],
    ['settings.prefs.fullPage', undefined, 'Full page'],
    ['settings.prefs.confirmDel', undefined, 'Confirm before deleting tasks'],
    // shortcuts
    ['settings.shortcuts.lead', undefined, 'Move faster with the keyboard.'],
    // password
    ['settings.pw.lead', undefined, "Use a long password you don't use anywhere else."],
    ['settings.pw.done', undefined, 'Password updated. Other sessions stay signed in.'],
    ['settings.pw.current', undefined, 'Current password'],
    ['settings.pw.new', undefined, 'New password'],
    ['settings.pw.confirm', undefined, 'Confirm new password'],
    ['settings.pw.update', undefined, 'Update password'],
    ['settings.pw.meter.tooShort', undefined, 'Too short'],
    ['settings.pw.meter.weak', undefined, 'Weak'],
    ['settings.pw.meter.fair', undefined, 'Fair'],
    ['settings.pw.meter.good', undefined, 'Good'],
    ['settings.pw.meter.strong', undefined, 'Strong'],
    // sessions
    ['settings.sessions.lead', undefined, 'Devices currently signed in to your account.'],
    ['settings.sessions.thisDevice', undefined, 'This device'],
    ['settings.sessions.revokeAll', undefined, 'Sign out of all other sessions'],
    // 2fa
    ['settings.tfa.lead', undefined, 'Add a second step when signing in.'],
    ['settings.tfa.on', undefined, 'Two-factor authentication is on.'],
    ['settings.tfa.onDesc', undefined, "You'll enter a code from your authenticator app when signing in on a new device."],
    ['settings.tfa.recovery', undefined, 'Recovery codes'],
    ['settings.tfa.recoveryDesc', undefined, 'Store these somewhere safe. Each code works once.'],
    ['settings.tfa.turnOff', undefined, 'Turn off two-factor authentication'],
    ['a11y.settings.qr', undefined, 'QR code'],
    ['settings.tfa.scan', undefined, '1. Scan the QR code'],
    ['settings.tfa.appHint', undefined, 'Use 1Password, Authy, or Google Authenticator.'],
    ['settings.tfa.enterCode', undefined, '2. Enter the 6-digit code'],
    ['settings.tfa.verify', undefined, 'Verify'],
    ['settings.tfa.anyDigits', undefined, 'Any 6 digits work in this prototype.'],
    ['settings.tfa.off', undefined, 'Two-factor authentication is off'],
    ['settings.tfa.offDesc', undefined, 'Protect your account with a code from an authenticator app in addition to your password.'],
    ['settings.tfa.setup', undefined, 'Set up two-factor authentication'],
    // plan
    ['settings.plan.lead', undefined, 'Your subscription and usage.'],
    ['settings.plan.current', undefined, 'Current plan'],
    ['settings.plan.perMember', undefined, 'per member / month'],
    ['settings.plan.noRenewal', undefined, 'No renewal · Free forever'],
    ['settings.plan.renews', { date: 'Oct 8' }, 'Renews Oct 8 · Billed monthly'],
    ['settings.plan.viewInvoices', undefined, 'View invoices'],
    ['settings.plan.storage', undefined, 'Storage'],
    ['settings.plan.of', { v: 12.4, u: ' GB', m: 100 }, '12.4 GB of 100 GB'],
    ['settings.plan.feature.members3', undefined, 'Up to 3 members'],
    ['settings.plan.feature.tasksUnlimited', undefined, 'Unlimited tasks'],
    ['settings.plan.feature.storage5', undefined, '5 GB storage'],
    ['settings.plan.feature.members50', undefined, 'Up to 50 members'],
    ['settings.plan.feature.timelines', undefined, 'Timelines & custom views'],
    ['settings.plan.feature.storage100', undefined, '100 GB storage'],
    ['settings.plan.feature.guests', undefined, 'Guest access'],
    ['settings.plan.feature.membersUnlimited', undefined, 'Unlimited members'],
    ['settings.plan.feature.advancedPerms', undefined, 'Advanced permissions'],
    ['settings.plan.feature.saml', undefined, 'SAML SSO'],
    ['settings.plan.feature.storage1tb', undefined, '1 TB storage'],
    ['settings.plan.currentBadge', undefined, 'Current'],
    ['settings.plan.downgrade', undefined, 'Downgrade'],
    ['settings.plan.upgrade', undefined, 'Upgrade'],
    ['a11y.settings.ownerOnly', undefined, 'Only the workspace owner can change the plan'],
    ['settings.plan.contactOwner', undefined, 'Contact the owner'],
    // payment
    ['settings.pay.lead', undefined, 'Payment method and billing details.'],
    ['settings.pay.card', undefined, 'Visa ending in 4242'],
    ['settings.pay.expiry', undefined, 'Expires 08/2028 · Default'],
    ['settings.pay.update', undefined, 'Update'],
    ['settings.pay.cardUpdateMsg', undefined, 'Card updates open in a secure payment window'],
    ['settings.pay.emailTitle', undefined, 'Billing email'],
    ['settings.pay.emailDesc', undefined, 'Invoices and receipts are sent here.'],
    ['settings.pay.addrTitle', undefined, 'Billing address'],
    ['settings.pay.address', undefined, '2150 Mission St, San Francisco, CA 94110'],
    ['settings.pay.addressUpdateMsg', undefined, 'Address editing opens in the billing portal'],
    ['settings.pay.taxTitle', undefined, 'Tax ID'],
    ['settings.pay.taxDesc', undefined, 'Shown on invoices'],
    ['settings.pay.taxId', undefined, 'US EIN ••-•••4410'],
    // invoices
    ['settings.inv.lead', undefined, 'Past invoices for this workspace.'],
    ['settings.inv.invoice', undefined, 'Invoice'],
    ['settings.inv.date', undefined, 'Date'],
    ['settings.inv.amount', undefined, 'Amount'],
  ],
];

const TABLE_NAMES = ['the authentication page', 'the design-system page', 'the settings page'];
for (const [i, rows] of TABLES.entries()) {
  test(`the English oracle — ${TABLE_NAMES[i]}`, () => {
    for (const [key, vars, expected] of rows) assert.equal(t(key, vars), expected);
  });
}

/* ---------- 2. the absence ---------- */

for (const file of WAVE_FILES) {
  test(`the scanner reports no finding for ${file}`, () => {
    const findings = scanSource(read(file), file);
    assert.equal(findings.length, 0, findings.map(f => `${f.line} ${f.kind} ${f.text}`).join('\n'));
  });
}

test('the allow-list lost every entry of the three page files and stays sorted', () => {
  const list = JSON.parse(read('test/fixtures/i18n-pending.json'));
  const wave = list.filter(e => WAVE_FILES.includes(e.file));
  assert.deepEqual(wave, [], JSON.stringify(wave.slice(0, 5)));
  const sorted = [...list].sort((a, b) => a.file.localeCompare(b.file) || a.text.localeCompare(b.text));
  assert.deepEqual(list, sorted, 'the allow-list must stay sorted by file then text');
});

/* ---------- 3. the machine identifiers ---------- */

test('the auth page data-a and data-v sites are byte-identical', () => {
  const src = read('src/pages/auth.js');
  const a = [...src.matchAll(/data-a="([^"]*)"/g)].map(m => m[1]);
  assert.equal(a.length, 36, a.join(','));
  for (const key of [
    'toggleDark',
    'socialAuth',
    'auth',
    'toggleShowPw',
    'doLogin',
    'doJoin',
    'doSignup',
    'doForgot',
    'resend',
    'verified',
    'onbBack',
    'onbNext',
    'onbSet',
    'copyInviteLink',
    'onbFinish',
    'onbExit',
    'signOut',
  ]) {
    assert.ok(a.includes(key), `data-a=${key} lost`);
  }
  const v = [...src.matchAll(/data-v="([^"]*)"/g)].map(m => m[1]);
  for (const key of ['Google', 'Microsoft', 'Apple', 'forgot', 'signup', 'login', 'reset', 'verify']) {
    assert.ok(v.includes(key), `data-v=${key} lost`);
  }
});

test('the onboarding step keys are untouched', () => {
  const src = read('src/pages/auth.js');
  for (const key of ['o.ws', 'o.url', 'o.tmpl', 'o.team', 'o.size', 'o.invites', 'o.proj', "'use'", "'team'", "'tmpl'", 'data-k="size"']) {
    assert.ok(src.includes(key), `${key} lost`);
  }
  // the stored team-size values stay the values the wizard stores
  for (const value of ['Just me', '2-10', '11-50', '51-200', '200+']) assert.ok(src.includes(`'${value}'`), `stored size ${value} lost`);
});

test('the design-system token names, state keys, theme keys and demo values are untouched', () => {
  const src = read('src/pages/design-system.js');
  for (const v of [
    '--bg',
    '--bg-side',
    '--surface',
    '--surface-2',
    '--surface-3',
    '--border',
    '--border-strong',
    '--text',
    '--text-2',
    '--text-3',
    '--accent',
    '--green',
    '--amber',
    '--red',
  ]) {
    assert.ok(src.includes(`'${v}'`), `token ${v} lost`);
  }
  for (const s of ["''", "'state-hover'", "'state-active'", "'state-focus'", "'dis'", "'is-loading'"]) {
    assert.ok(src.includes(s), `state key ${s} lost`);
  }
  for (const k of ["'light'", "'dark'", "'system'"]) assert.ok(src.includes(k), `theme key ${k} lost`);
  // the demo values the page pre-fills its form with are data, not interface text
  for (const d of ['Homepage wireframes', 'alex@', 'hello@gr8rstudio.com', '14:30']) {
    assert.ok(src.includes(d), `demo value ${d} lost`);
  }
});

test('the settings stored preference values are byte-identical', () => {
  const src = read('src/pages/settings.js');
  assert.ok(
    src.includes("['(GMT-08:00) Pacific Time', '(GMT-05:00) Eastern Time', '(GMT+00:00) London', '(GMT+01:00) Berlin', '(GMT+08:00) Singapore']"),
    'the stored time-zone labels moved',
  );
  assert.ok(src.includes("['English (US)', 'English (UK)', 'Deutsch', 'Español', 'Français', '日本語']"), 'the stored language names moved');
  for (const id of [
    'workspace',
    'appearance',
    'language',
    'datetime',
    'members',
    'teams',
    'projects',
    'permissions',
    'notif-email',
    'notif-push',
    'notif-mentions',
    'notif-assign',
    'profile',
    'preferences',
    'shortcuts',
    'password',
    'sessions',
    '2fa',
    'plan',
    'payment',
    'invoices',
  ]) {
    assert.ok(src.includes(`'${id}'`), `section id ${id} lost`);
  }
});

test('the date-format and time-format rows keep their computed previews', () => {
  const src = read('src/pages/settings.js');
  assert.ok(src.includes('formatDate(SAMPLE_DATE'), 'the date preview must come from the formatter, not the catalogue');
  assert.ok(src.includes('formatTime(SAMPLE_TIME'), 'the time preview must come from the formatter, not the catalogue');
  assert.ok(!src.includes("'Oct 1'"), 'a hard-coded English date preview came back');
});

test('every static t() key of the three files resolves in the catalogue', () => {
  for (const file of WAVE_FILES) {
    const src = read(file);
    for (const m of src.matchAll(/\bt\('([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)'/g)) {
      assert.ok(Object.hasOwn(en, m[1]), `${file}: t('${m[1]}') does not resolve`);
    }
  }
});
