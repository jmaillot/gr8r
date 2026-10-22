/* =====================================================================
   The contract of the shell chrome (plan 06-08, task 1): the sidebar,
   the topbar, the offline bar, the bottom navigation, the skeletons and
   the document title read the English catalogue, and the route ids stay
   the machine identifiers the router matches on (D-08).

   Families:
     1. the route coverage — ROUTE_IDS lists the twenty route ids and
        every one of them has a nav.route.* key that renders the display
        name the old ROUTE_NAMES table carried;
     2. the English oracle — every chrome value renders its previous
        English exactly;
     3. the absence — the scanner reports no finding for the three shell
        files and the allow-list carries none of them;
     4. the machine identifiers — the data-r attributes still carry
        route ids, and the lookup is built from the id.
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

const SHELL_FILES = ['src/shell/layout.js', 'src/shell/render.js', 'src/shell/skeletons.js'];

/* The twenty route ids, byte for byte what the ROUTE_NAMES table carried:
   the router, the data-r attributes and the URL deep-links match on them,
   so they are never translated (D-08). */
const ROUTE_IDS = [
  'home',
  'inbox',
  'mytasks',
  'favorites',
  'notifications',
  'search',
  'overview',
  'projects',
  'tasks',
  'calendar',
  'timeline',
  'members',
  'member',
  'teams',
  'team',
  'activity',
  'settings',
  'system',
  'states',
  'archive',
];

/* [route id, the display name the old ROUTE_NAMES table carried] */
const ROUTE_ORACLE = [
  ['home', 'Home'],
  ['inbox', 'Inbox'],
  ['mytasks', 'My Tasks'],
  ['favorites', 'Favorites'],
  ['notifications', 'Notifications'],
  ['search', 'Search'],
  ['overview', 'Overview'],
  ['projects', 'Projects'],
  ['tasks', 'Tasks'],
  ['calendar', 'Calendar'],
  ['timeline', 'Timeline'],
  ['members', 'Members'],
  ['member', 'Member'],
  ['teams', 'Teams'],
  ['team', 'Team'],
  ['activity', 'Activity'],
  ['settings', 'Settings'],
  ['system', 'Design system'],
  ['states', 'System states'],
  ['archive', 'Archive'],
];

/* The other chrome values the wave introduced: [key, previous English]. */
const CHROME_ORACLE = [
  ['nav.notFound', 'Not found'],
  ['nav.helpResources', 'Help & resources'],
  ['nav.help', 'Help'],
  ['nav.profile', 'Profile'],
  ['nav.more', 'More'],
  ['nav.offlineTitle', "You're offline."],
  ['nav.offlineBody', "Changes won't be saved until your connection is back."],
  ['nav.searchOrJumpTo', 'Search or jump to…'],
  ['nav.tab.board', 'Board'],
  ['nav.tab.list', 'List'],
  ['nav.tab.files', 'Files'],
  ['page.savedView', 'Saved view'],
  ['a11y.skipToContent', 'Skip to content'],
  ['a11y.mainNav', 'Main'],
  ['a11y.primaryNav', 'Primary'],
  ['a11y.breadcrumb', 'Breadcrumb'],
  ['a11y.switchWorkspace', 'Switch workspace'],
  ['a11y.collapseSidebar', 'Collapse sidebar'],
  ['a11y.collapseSidebarTip', 'Collapse sidebar  ['],
  ['a11y.expandSidebar', 'Expand sidebar'],
  ['a11y.toggleSubPages', 'Toggle sub-pages'],
  ['a11y.projectOptions', 'Project options'],
  ['a11y.expand', 'Expand'],
  ['a11y.newProject', 'New project'],
  ['a11y.newProjectTip', 'New project  P'],
  ['a11y.newTeam', 'New team'],
  ['a11y.openNavigation', 'Open navigation'],
  ['a11y.searchAndCommands', 'Search and commands'],
  ['a11y.createNew', 'Create new'],
  ['a11y.accountMenu', 'Account menu'],
  ['a11y.loading', 'Loading'],
  ['act.new', 'New'],
];

/* The catalogue values the chrome reuses — already carried by earlier
   waves, asserted here because the chrome now reads them. */
const REUSED_ORACLE = [
  ['common.workspace', 'Workspace'],
  ['toast.tryAgain', 'Try again'],
  ['app.name', 'Gr8r Studio'],
];

/* The literal texts the sweep removed from the three shell files. */
const GONE = {
  'src/shell/layout.js': [
    'Skip to content',
    "You're offline.",
    "Changes won't be saved until your connection is back.",
    'Try again',
    'Main',
    'Switch workspace',
    'Collapse sidebar  [',
    'Collapse sidebar',
    'Expand sidebar',
    'Home',
    'Inbox',
    'My Tasks',
    'Favorites',
    'Notifications',
    'Workspace',
    'Overview',
    'Projects',
    'Tasks',
    'Calendar',
    'Timeline',
    'Members',
    'Activity',
    'New project  P',
    'New project',
    'Toggle sub-pages',
    'Project options',
    'Expand',
    'Board',
    'List',
    'Files',
    'Archive',
    'Teams',
    'New team',
    'data-tip="Help" data-tip-pos="right"',
    'Help & resources',
    'Settings',
    'data-tip="Profile" data-tip-pos="right"',
    'Member',
    'Not found',
    'Open navigation',
    'Primary',
    'More',
    'Breadcrumb',
    'Search and commands',
    'Search or jump to…',
    'Create new',
    'Account menu',
  ],
  'src/shell/render.js': [
    'Home',
    'Inbox',
    'My Tasks',
    'Favorites',
    'Notifications',
    'Search',
    'Overview',
    'Projects',
    'Tasks',
    'Calendar',
    'Timeline',
    'Members',
    'Member',
    'Teams',
    'Team',
    'Activity',
    'Settings',
    'Design system',
    'System states',
    'Archive',
    'Gr8r Studio',
    'Not found',
    'Saved view',
  ],
  'src/shell/skeletons.js': ['Loading'],
};

/* ---------- 1. the route coverage ---------- */

test('ROUTE_IDS survives in src/shell/render.js and lists the twenty route ids byte-identically', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/shell/render.js'), 'utf8');
  const m = src.match(/ROUTE_IDS = \[([\s\S]*?)\]/);
  assert.ok(m, 'ROUTE_IDS not found in src/shell/render.js');
  const ids = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  assert.deepEqual(ids, ROUTE_IDS, 'the route ids are not what the router matches on');
});

test('the old ROUTE_NAMES table is gone from the shell', () => {
  for (const file of ['src/shell/render.js', 'src/shell/layout.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!src.includes('ROUTE_NAMES'), `${file} still mentions ROUTE_NAMES`);
  }
});

test('the route display name is a catalogue lookup built from the id', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/shell/render.js'), 'utf8');
  assert.ok(src.includes("routeName = id => t('nav.route.' + id)"), 'the routeName lookup moved');
});

test('every route id has a nav.route.* key that renders its previous English', () => {
  for (const [id, name] of ROUTE_ORACLE) {
    assert.ok(Object.hasOwn(en, 'nav.route.' + id), `missing key: nav.route.${id}`);
    assert.equal(t('nav.route.' + id), name, `nav.route.${id}`);
  }
});

/* ---------- 2. the English oracle ---------- */

test('every chrome value renders its previous English exactly', () => {
  for (const [key, expected] of CHROME_ORACLE) {
    assert.ok(Object.hasOwn(en, key), `missing key: ${key}`);
    assert.equal(t(key), expected, key);
  }
});

test('the values the chrome reuses still render their English', () => {
  for (const [key, expected] of REUSED_ORACLE) assert.equal(t(key), expected, key);
});

test('no two keys of this wave carry the same value', () => {
  const seen = new Map();
  for (const [id] of ROUTE_ORACLE) seen.set(en['nav.route.' + id], 'nav.route.' + id);
  for (const [key, ] of CHROME_ORACLE) {
    const flat = typeof en[key] === 'string' ? en[key] : JSON.stringify(en[key]);
    assert.ok(!seen.has(flat), `${key} duplicates ${seen.get(flat)}`);
    seen.set(flat, key);
  }
});

/* ---------- 3. the absence ---------- */

for (const file of SHELL_FILES) {
  test(`no extracted literal survives as a finding in ${file}`, () => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const findings = scanSource(src, file);
    const texts = new Set(findings.map(f => f.text));
    const surviving = GONE[file].filter(text => texts.has(text));
    assert.deepEqual(surviving, [], `these literals are still in the source: ${surviving.join(' | ')}`);
  });
}

test('the scanner reports nothing at all for the three shell files', () => {
  for (const file of SHELL_FILES) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const findings = scanSource(src, file);
    assert.deepEqual(findings, [], `${file} still reports: ${findings.map(f => `${f.kind}:${f.line} ${f.text}`).join(' | ')}`);
  }
});

test('the allow-list carries no entry of the three shell files and stays sorted', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  const keys = list.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list is not sorted');
  const left = list.filter(e => SHELL_FILES.includes(e.file));
  assert.deepEqual(left, [], 'the shell files still have allow-list entries');
});

/* ---------- 4. the machine identifiers ---------- */

test('the data-r attributes of the sidebar still carry route ids', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/shell/layout.js'), 'utf8');
  const routes = [...src.matchAll(/data-r="([^"]*)"/g)].map(m => m[1]);
  assert.ok(routes.length > 0, 'the sidebar lost its data-r attributes');
  const unknown = routes.filter(r => !ROUTE_IDS.includes(r) && r !== 'project' && !r.includes('${'));
  assert.deepEqual(unknown, [], `data-r values that are not route ids: ${unknown.join(' | ')}`);
});

test('the ROUTE_ICONS table is untouched — the icon names are machine values', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/shell/render.js'), 'utf8');
  assert.ok(src.includes("home: 'house'"), 'the icon table moved');
  assert.ok(src.includes("archive: 'archive'"), 'the icon table moved');
});
