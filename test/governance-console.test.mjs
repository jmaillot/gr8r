/* =====================================================================
   PHASE 90 SUPER ADMINS CONSOLE (90-01, SACON-01/SC-1): static
   client-source assertions for the seg-staged console, per the
   governance-client precedent (no DOM harness → source assertions).

   Pinned invariants (plan 90-01, D-90-1..2 — task 1; extended by task 2):
   (1) the seg control mirrors the govSeg idiom (role=group + aria-pressed,
       default 'admins' — roster-first, D-90-1/2); NO tab component exists
   (2) the roster renders is_instance_admin rows ONLY and carries the
       D-118/D-119 inline-confirm stages verbatim (D-90-2)
   (3) govSuperSeg joins govOrphanTeardown; the section mounts only for
       isInstanceAdmin (D-112 gate unchanged)
   (4) the task-1 console keys resolve ×5 catalogues (D-90-20/D-12)
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

const page = () => src('src/pages/governance.js');
const actions = () => src('src/actions/actions.js');

const segView = () => {
  const p = page();
  const m = p.match(/export function superAdminsView\(\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'superAdminsView not found in governance.js');
  return m[0];
};
const rosterView = () => {
  const p = page();
  const m = p.match(/function superRosterView\(\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'superRosterView not found in governance.js');
  return m[0];
};

/* (1) the seg control: the ONLY "tab" mechanism — the govSeg idiom verbatim */
test('the seg control mirrors the govSeg idiom: role=group, aria-pressed, default admins (D-90-1/2)', () => {
  const v = segView();
  assert.match(v, /class="seg" role="group" aria-label="\$\{t\('page\.governance\.superSegAria'\)\}"/, 'the seg group is missing its role/aria shape');
  assert.match(v, /data-a="govSuperSeg" data-v="\$\{v\}" aria-pressed="\$\{segV === v\}"/, 'the seg buttons lost the aria-pressed two-state contract');
  assert.match(v, /S\.ui\.govSuperSeg \|\| 'admins'/, 'the seg default is not admins — roster-first is non-negotiable (D-90-2)');
  assert.match(v, /segV === 'roles' \? rolesCard\(\) : superRosterView\(\)/, 'the roles view is not relocated verbatim inside the switched section');
  // there is NO tab component: no role="tab" anywhere on the page
  assert.doesNotMatch(page(), /role="tab"/, 'a tab component leaked into the console (research Pitfall 7)');
  // the handler mirrors the govSeg idiom: set the staged stage, rerender
  const a = actions();
  assert.match(a, /A\.govSuperSeg = el => \{\s*S\.ui\.govSuperSeg = el\.dataset\.v;/, 'the seg-switch handler drifted');
});

/* (2) roster-first: admins only, D-118/D-119 stages verbatim */
test('the roster renders is_instance_admin rows ONLY and carries the D-118/D-119 inline stages verbatim (D-90-2)', () => {
  const p = page();
  const r = rosterView();
  assert.match(r, /all\.filter\(u => u\.is_instance_admin\)/, 'the roster does not filter on is_instance_admin');
  for (const a of ['operatorDemoteAsk', 'operatorDemote', 'operatorDemoteCancel', 'operatorRevokeAsk', 'operatorRevokeConfirm', 'operatorRevokeCancel']) {
    assert.match(p, new RegExp(`data-a="${a}"`), `the ${a} control left the roster`);
  }
  assert.match(p, /S\.ui\.operatorDemote === u\.id/, 'the demote D-90 stage gate moved');
  assert.match(p, /S\.ui\.operatorRevoke === u\.id/, 'the revoke D-90 stage gate moved');
  // demote/revoke ride the UNCHANGED Phase 78 api methods — no endpoint drift
  const a = actions();
  assert.match(a, /api\.operatorDemote\(id\)/);
  assert.match(a, /api\.operatorRevokeSessions\(id\)/);
});

/* (3) teardown + mount gate */
test('govSuperSeg joins govOrphanTeardown, ROUTE_TEARDOWN still resolves to it, and the section mounts only for isInstanceAdmin', () => {
  const p = page();
  assert.match(p, /S\.ui\.govSuperSeg = null;/, 'the seg stage is not torn down on route exit');
  assert.match(p, /ROUTE_TEARDOWN\.governance = govOrphanTeardown;/, 'the governance teardown registry moved');
  assert.match(p, /api\.user\?\.isInstanceAdmin \? superAdminsView\(\) : ''/, 'the section is not gated on the server isInstanceAdmin payload (D-112)');
});

/* esc() discipline: the roster row interpolations never render raw payload strings */
test('roster payload strings render through esc() (T-79-10 backstop)', () => {
  const r = rosterView();
  const row = r.match(/const rosterRow = u =>[\s\S]*?\n    \);/);
  assert.ok(row, 'rosterRow not found');
  assert.match(row[0], /\$\{esc\(u\.name \|\| ''\)\}/, 'the roster name cell lost esc()');
  assert.match(row[0], /\$\{esc\(u\.email\)\}/, 'the roster email cell lost esc()');
  assert.match(row[0], /data-id="\$\{esc\(u\.id\)\}"/, 'the roster action ids lost esc()');
  assert.doesNotMatch(row[0], /\$\{u\.(name|email)\}/, 'a payload string escapes escaping in the roster row');
});

/* locale parity: the task-1 console keys ×5 catalogues (D-90-20/D-12) */
test('the task-1 page.governance.super.* keys resolve in all 5 catalogues (D-90-20)', () => {
  const KEYS = [
    'page.governance.superTitle',
    'page.governance.superSegAria',
    'page.governance.superSegAdmins',
    'page.governance.superRosterEmptyTitle',
    'page.governance.superRosterEmptyBody',
  ];
  for (const [lang, cat] of Object.entries({ en, fr, de, es, nl })) {
    for (const k of KEYS) assert.ok(cat[k], `${lang} catalogue lost ${k}`);
  }
});
