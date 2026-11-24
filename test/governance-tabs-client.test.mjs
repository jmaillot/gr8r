/* =====================================================================
   PHASE 93 GOVERNANCE TABS (93-01): static client-source assertions for
   the role-tabbed "Instance Roles" re-skin (D-01..D-04), per the
   creation-gate-client precedent (no DOM harness → source assertions).

   Pinned invariants (plan 93-01 Task 1, pins a–i):
   (a) seg control carries THREE data-v values — admins / backup / restore —
       each with data-a="govSuperSeg" and aria-pressed toggling
   (b) superTitle renamed from the old "Super Admins" wording (×5 locales)
   (c) rolesCard dissolved: no separate `roles` seg value; the rolesCard
       sblock/h2 wrapper and rolesLead seg usage are gone
   (d) per-role tab body: User / Grants / Actions columns; grant badges
       STACKED (one per grant, granted date + grantedByName via esc())
   (e) recentHtml renders ONLY inside the admins-tab branch
   (f) IN.govRoleQ writes S.ui.govRoleMod.q AND calls render() (the
       dead-search fix at actions.js:5604–5606)
   (g) picker contract: role="option" + aria-selected + data-a toggle,
       filtering via foldForSearch, honest popover.noMatches, no
       user-creation path from the dialog
   (h) ×5 parity: renamed superTitle + tab keys + Grants column present;
       guard keys ownerImmune / instanceRoleAdminImplicit /
       instanceRoleDuplicate exist ×5; retired keys absent ×5
   (i) revoke rides the grant id (per GRANT, never per user); zero new
       mutation endpoint URLs in actions.js
   ===================================================================== */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import nl from '../src/locales/nl.json' with { type: 'json' };
import de from '../src/locales/de.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = rel => readFileSync(`${ROOT}/${rel}`, 'utf8');

const actions = () => src('src/actions/actions.js');
const page = () => src('src/pages/governance.js');
const LOCALES = { en, de, es, fr, nl };

/* (a) the seg control carries three values, each with the govSuperSeg handler */
test('(a) seg control renders THREE tabs (admins/backup/restore) with govSuperSeg + aria-pressed', () => {
  const p = page();
  const segArr = p.match(/const seg = `<div class="seg"[\s\S]*?superSegAria[\s\S]*?join\(''\)\}<\/div>`;/);
  assert.ok(segArr, 'the superAdminsView seg array is missing');
  const body = segArr[0];
  assert.match(body, /\['admins',\s*'page\.governance\.superSegAdmins'\]/, 'the admins tab entry is missing');
  assert.match(body, /\['backup',\s*'page\.governance\.superSegBackup'\]/, 'the backup tab entry is missing');
  assert.match(body, /\['restore',\s*'page\.governance\.superSegRestore'\]/, 'the restore tab entry is missing');
  assert.match(body, /data-a="govSuperSeg" data-v="\$\{v\}" aria-pressed="\$\{segV === v\}"/, 'seg buttons lost the govSuperSeg/aria-pressed contract');
});

/* (b) the section title key renamed — old wording gone from every locale */
test('(b) superTitle renamed to "Instance Roles" wording ×5 — old wording absent', () => {
  const p = page();
  assert.match(p, /<h2[^>]*>\$\{t\('page\.governance\.superTitle'\)\}<\/h2>/, 'the section title no longer renders superTitle');
  const old = {
    en: 'Super Admins & roles',
    de: 'Super Admins & Rollen',
    es: 'Super Admins y roles',
    fr: 'Super Admins et rôles',
    nl: 'Super Admins en rollen',
  };
  for (const [lc, cat] of Object.entries(LOCALES)) {
    const v = cat['page.governance.superTitle'];
    assert.ok(v, `superTitle missing in ${lc}`);
    assert.notEqual(v, old[lc], `superTitle still carries the old wording in ${lc}: ${v}`);
  }
});

/* (c) rolesCard dissolved: no `roles` seg value, no wrapper, no rolesLead */
test('(c) rolesCard dissolution: no roles seg value, no sblock/h2 wrapper, rolesLead gone', () => {
  const p = page();
  assert.doesNotMatch(p, /\['roles',\s*'page\.governance\.rolesTitle'\]/, 'the `roles` seg value still exists');
  assert.doesNotMatch(p, /page\.governance\.rolesLead/, 'rolesLead is still referenced in governance.js');
  assert.doesNotMatch(p, /<div class="sblock"[^>]*><h2[^>]*>\$\{t\('page\.governance\.rolesTitle'\)\}<\/h2><p class="hint"[^>]*>\$\{t\('page\.governance\.rolesLead'\)\}/, 'the rolesCard sblock/h2/lead wrapper still exists');
  assert.doesNotMatch(p, /export function rolesCard\(\)/, 'rolesCard() still exists as its own card');
});

/* (d) per-role tab body: shared User/Grants/Actions columns + stacked grant badges */
test('(d) per-role tabs render User/Grants/Actions columns with STACKED grant badges (role + date + granted-by, esc)', () => {
  const p = page();
  const thead = p.match(/<thead><tr><th style="padding-left:14px">\$\{t\('page\.governance\.rolesColUser'\)\}<\/th><th style="text-align:left">\$\{t\('page\.governance\.rolesColGrants'\)\}<\/th><th><\/th><\/tr><\/thead>/);
  assert.ok(thead, 'the per-tab table header must be User / Grants / (actions) — got no User/Grants columns');
  /* the stacked badge: one badge per grant carrying grantedByName and the granted date, esc()d */
  assert.match(p, /grants\.map\(\s*\(?r\)?\s*=>\s*`<div[^>]*>\$\{roleBadge\(r\.role\)\}[\s\S]{0,200}?<\/div>`\s*\)\.join\(''\)/, 'the stacked per-grant badge block is missing');
  assert.match(p, /esc\(ago\(r\.grantedAt\)\)/, 'the grant badge must carry the granted date via esc(ago())');
  assert.match(p, /esc\(r\.grantedByName\)/, 'the grant badge must carry grantedByName via esc()');
  assert.match(p, /data-a="govRoleRevokeAsk" data-id="\$\{esc\(r\.id\)\}"/, 'revoke must carry the GRANT id, not the user id');
});

/* (e) trail placement: recentHtml only inside the admins-tab branch */
test('(e) the recent-activity trail renders only inside the admins tab branch (D-04)', () => {
  const p = page();
  /* the tab-body switch: trail rides ONLY the admins branch; backup/restore route to roleTabView */
  assert.match(p, /const body = segV === 'admins' \? `\$\{superRosterView\(\)\}\$\{recentHtml\(\)\}` : roleTabView\(segV === 'backup' \? 'backup_operator' : 'restore_operator'\);/, 'the tab-body switch must render recentHtml() only inside the admins branch');
  const tabFn = p.match(/export function roleTabView\(role\)\s*\{[\s\S]*?\n\}/);
  assert.ok(tabFn, 'roleTabView missing');
  assert.ok(!tabFn[0].includes('recentHtml('), 'backup/restore tab bodies must not render the trail');
  /* the hasRows-only gate is dropped: the trail renders whenever the payload exists */
  assert.match(p, /function recentHtml\(\)\s*\{[\s\S]{0,400}?!Array\.isArray\(recent\) \|\| !recent\.length\) return '';/, 'recentHtml must render whenever the SA tab is active and the recent payload exists');
});

/* (f) the dead-search fix: IN.govRoleQ writes state AND re-renders */
test('(f) IN.govRoleQ writes govRoleMod.q AND calls render() — the dead-search fix', () => {
  const a = actions();
  const handler = a.match(/IN\.govRoleQ = el => \{[\s\S]*?\};/);
  assert.ok(handler, 'IN.govRoleQ handler missing');
  assert.match(handler[0], /S\.ui\.govRoleMod\.q = el\.value/, 'the handler must write the staged q');
  assert.match(handler[0], /render\(\);/, 'the handler must re-render (the dead-search root cause)');
});

/* (g) the picker contract: selectable options, foldForSearch, honest no-results, no creation */
test('(g) pickers use role=option + aria-selected toggles, foldForSearch filtering, popover.noMatches, no creation path', () => {
  const p = page();
  assert.match(p, /role="option"/, 'picker options must carry role="option"');
  assert.match(p, /aria-selected="\$\{[^}]*=== /, 'picker options must carry aria-selected');
  assert.match(p, /data-a="govRolePick" data-v="\$\{esc\(/, 'picker options must toggle via the govRolePick handler on data-v');
  assert.match(p, /foldForSearch\(/, 'filtering must go through foldForSearch');
  assert.match(p, /t\('popover\.noMatches'\)/, 'the honest no-results message is missing');
  /* no user-creation affordance from the dialog: no promote/invite/signup handler in govRoleBody */
  const modal = p.match(/export function govRoleBody\(\)[\s\S]*?\n\}/);
  assert.ok(modal, 'govRoleBody missing');
  assert.doesNotMatch(modal[0], /operatorPromote|invite|signup|create/i, 'the dialog must not offer a user-creation path');
});

/* (h) ×5 locale parity: renamed/new keys present, guard keys, retired keys absent */
test('(h) ×5 parity: superTitle + tab labels + Grants column present; guard keys ×5; retired keys absent ×5', () => {
  const need = [
    'page.governance.superTitle',
    'page.governance.superSegAdmins',
    'page.governance.superSegBackup',
    'page.governance.superSegRestore',
    'page.governance.superSegAria',
    'page.governance.rolesColGrants',
    'page.governance.rolesColUser',
    'popover.noMatches',
  ];
  const guards = ['err.ownerImmune', 'err.instanceRoleAdminImplicit', 'err.instanceRoleDuplicate'];
  const retired = ['page.governance.rolesLead', 'page.governance.rolesColRole', 'page.governance.rolesTitle', 'page.governance.rolesColGrantedBy'];
  for (const [lc, cat] of Object.entries(LOCALES)) {
    for (const k of need) assert.ok(cat[k], `${k} missing in ${lc}`);
    for (const k of guards) assert.ok(cat[k], `guard key ${k} missing in ${lc}`);
    for (const k of retired) assert.ok(!(k in cat), `retired key ${k} still present in ${lc}`);
  }
});

/* (i) endpoint freeze: revoke per grant; zero new mutation endpoint URLs */
test('(i) revoke rides the existing DELETE handler; actions.js touches no new endpoint URL', () => {
  const a = actions();
  /* grant + revoke still ride the api.instanceRoles family (api.js:549–556 — the frozen paths) */
  assert.match(a, /api\.instanceRoleGrant\(/, 'grant must ride api.instanceRoleGrant');
  assert.match(a, /api\.instanceRoleRevoke\(/, 'revoke must ride api.instanceRoleRevoke');
  assert.doesNotMatch(a, /\/api\/auth\/operator\/instance-roles/, 'actions.js must not hand-roll endpoint URLs (api.js owns the frozen paths)');
  const apiSrc = src('src/core/api.js');
  const hits = apiSrc.match(/instance-roles/g) || [];
  assert.equal(hits.length, 3, `api.js must carry exactly the 3 frozen instance-roles paths, found ${hits.length}`);
});
