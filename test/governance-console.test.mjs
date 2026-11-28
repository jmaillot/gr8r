/* =====================================================================
   PHASE 90 SUPER ADMINS CONSOLE (90-01, SACON-01/SC-1): static
   client-source assertions for the seg-staged console, per the
   governance-client precedent (no DOM harness → source assertions).

   Pinned invariants (plan 90-01, D-90-1..6):
   (1) the seg control mirrors the govSeg idiom (role=group + aria-pressed,
       default 'admins' — roster-first, D-90-1/2); NO tab component exists
   (2) the roster renders is_instance_admin rows ONLY and carries the
       D-118/D-119 inline-confirm stages verbatim (D-90-2)
   (3) the search floor is 2 characters; ≥2 searches ALL users on name AND
       email lowercase substring; candidates are promote-ONLY — no
       revoke-sessions on candidate rows (D-90-3, seed constraint)
   (4) cap 10 + show-more (+10 per click), visible cap note, slice counter
       resets when the query changes (D-90-4)
   (5) post-promote reconcile rides the EXISTING A.operatorPromote refetch
       — candidate leaves results, joins roster, no page reload (D-90-5)
   (6) both empty states are keyed (roster guard + zero-match search,
       D-90-6)
   (7) govSuperSeg/govSuperShown join govOrphanTeardown; the section
       mounts only for isInstanceAdmin (D-112 gate unchanged)
   (8) the 12 console keys resolve ×5 catalogues (D-90-20/D-12)
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
  assert.match(v, /segV === 'admins' \? `\$\{superRosterView\(\)\}\$\{recentHtml\(\)\}` : roleTabView\(segV === 'backup' \? 'backup_operator' : 'restore_operator'\)/, 'the 93-01 three-tab switch is missing (roster/trail under admins, role tabs for backup/restore)');
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

/* (7) teardown + mount gate */
test('govSuperSeg/govSuperShown join govOrphanTeardown, ROUTE_TEARDOWN still resolves to it, and the section mounts only for isInstanceAdmin', () => {
  const p = page();
  assert.match(p, /S\.ui\.govSuperSeg = null;/, 'the seg stage is not torn down on route exit');
  assert.match(p, /S\.ui\.govSuperShown = null;/, 'the slice counter is not torn down on route exit');
  assert.match(p, /ROUTE_TEARDOWN\.governance = govOrphanTeardown;/, 'the governance teardown registry moved');
  assert.match(p, /api\.user\?\.isInstanceAdmin \? superAdminsView\(\) : ''/, 'the section is not gated on the server isInstanceAdmin payload (D-112)');
});

/* (3b) search floor + name/email filter + promote-only candidates */
test('the candidate search floors at 2 chars, filters on name AND email lowercase substring, and renders promote-only rows (D-90-3)', () => {
  const r = rosterView();
  assert.match(r, /q\.length >= 2/, 'the 2-character floor guarding the candidates block is missing');
  assert.match(
    r,
    /\(u\.name \|\| ''\)\.toLowerCase\(\)\.includes\(q\) \|\| \(u\.email \|\| ''\)\.toLowerCase\(\)\.includes\(q\)/,
    'the pinned name/email lowercase-substring expression drifted',
  );
  assert.match(r, /matches\.filter\(u => !u\.is_instance_admin\)/, 'admin matches are not excluded from the candidates block');
  // candidate rows carry ONLY the promote action
  const cand = r.match(/const candRow = u =>[\s\S]*?\n    <\/tr>`;/);
  assert.ok(cand, 'candRow not found');
  assert.match(cand[0], /data-a="operatorPromote"/, 'the candidate row lost the promote CTA');
  assert.doesNotMatch(cand[0], /operatorRevoke/, 'a revoke-sessions control leaked onto a candidate row (seed constraint)');
  // the promote action itself is the UNCHANGED refetch reconcile — no reload (D-90-5)
  const a = actions();
  assert.match(
    a,
    /A\.operatorPromote = async el => \{[\s\S]{0,400}?await refreshOperatorUsers\(\);[\s\S]{0,120}?toast\(t\('settings\.operator\.toastPromoted'\)\);/,
    'the promote reconcile drifted off the refetch + keyed-toast idiom',
  );
});

/* (4) cap 10 + show-more + cap note + query-change reset */
test('candidates slice by govSuperShown, show-more adds 10, the cap note renders shown/total, and the query resets the slice (D-90-4)', () => {
  const r = rosterView();
  assert.match(r, /candidates\.slice\(0, shown\)/, 'the candidate slice cap is missing');
  assert.match(r, /S\.ui\.govSuperShown \|\| 10/, 'the slice counter does not default to 10');
  assert.match(r, /data-a="govSuperMore"/, 'the show-more control is missing');
  assert.match(r, /shown: String\(Math\.min\(shown, candidates\.length\)\)/, 'the cap note does not render the shown count');
  assert.match(r, /total: String\(candidates\.length\)/, 'the cap note does not render the total count');
  const a = actions();
  assert.match(a, /A\.govSuperMore = \(\) => \{\s*S\.ui\.govSuperShown = \(S\.ui\.govSuperShown \|\| 10\) \+ 10;/, 'show-more does not reveal +10 per click');
  assert.match(a, /IN\.govOpQ = el => \{\s*S\.ui\.govOpQ = el\.value;\s*S\.ui\.govSuperShown = null;/, 'the slice counter does not reset when the query changes');
});

/* (6) both empty states are keyed */
test('zero matches and an empty roster render through the keyed empty states (D-90-6)', () => {
  const r = rosterView();
  assert.match(r, /empty\('search', t\('page\.governance\.superNoMatchesTitle'\), t\('page\.governance\.superNoMatchesBody', \{ query: esc\(qRaw\) \}\)/, 'the zero-match empty state is missing/unkeyed');
  assert.match(r, /empty\('users', t\('page\.governance\.superRosterEmptyTitle'\), t\('page\.governance\.superRosterEmptyBody'\)/, 'the roster-empty guard is missing/unkeyed');
});

/* (8) the query echo renders through esc() on the candidate side too */
test('candidate payload strings render through esc() and the query echo never interpolates raw (T-79-10 backstop)', () => {
  const r = rosterView();
  const cand = r.match(/const candRow = u =>[\s\S]*?\n    <\/tr>`;/);
  assert.ok(cand, 'candRow not found');
  assert.match(cand[0], /\$\{esc\(u\.name \|\| ''\)\}/, 'the candidate name cell lost esc()');
  assert.match(cand[0], /\$\{esc\(u\.email \|\| ''\)\}/, 'the candidate email cell lost esc()');
  assert.match(cand[0], /data-id="\$\{esc\(u\.id\)\}"/, 'the candidate action id lost esc()');
  assert.doesNotMatch(cand[0], /\$\{u\.(name|email)\}/, 'a payload string escapes escaping in the candidate row');
  assert.doesNotMatch(r, /t\('page\.governance\.super(MatchCount|NoMatchesBody)'[^)]*\{ query: qRaw \}/, 'the query echo interpolates RAW (must render through esc())');
});

/* esc() discipline: the roster row interpolations never render raw payload strings */
test('roster payload strings render through esc() (T-79-10 backstop)', () => {
  const r = rosterView();
  const row = r.match(/const rosterRow = u =>[\s\S]*?\n  <\/tr>`;/);
  assert.ok(row, 'rosterRow not found');
  assert.match(row[0], /\$\{esc\(u\.name \|\| ''\)\}/, 'the roster name cell lost esc()');
  assert.match(row[0], /\$\{esc\(u\.email\)\}/, 'the roster email cell lost esc()');
  assert.match(row[0], /data-id="\$\{esc\(u\.id\)\}"/, 'the roster action ids lost esc()');
  assert.doesNotMatch(row[0], /\$\{u\.(name|email)\}/, 'a payload string escapes escaping in the roster row');
});

/* 90-UAT item 3 (owner chose FIX): trunc+title discipline on the console
   rows — every truncating name/email span carries title="…" (through esc())
   so the full value is reachable on hover, matching the UI-SPEC long-text
   backstop used elsewhere. */
test('console roster + candidate rows carry title= on their truncating cells (90-UAT item 3)', () => {
  const r = rosterView();
  const row = r.match(/const rosterRow = u =>[\s\S]*?\n  <\/tr>`;/);
  assert.ok(row, 'rosterRow not found');
  assert.match(row[0], /title="\$\{esc\(u\.name \|\| ''\)\}"/, 'the roster name cell lost title=');
  assert.match(row[0], /title="\$\{esc\(u\.email\)\}"/, 'the roster email cell lost title=');
  const cand = r.match(/const candRow = u =>[\s\S]*?\n    <\/tr>`;/);
  assert.ok(cand, 'candRow not found');
  assert.match(cand[0], /title="\$\{esc\(u\.name \|\| ''\)\}"/, 'the candidate name cell lost title=');
  assert.match(cand[0], /title="\$\{esc\(u\.email \|\| ''\)\}"/, 'the candidate email cell lost title=');
});

/* locale parity: all 12 console keys ×5 catalogues (D-90-20/D-12) */
test('the 12 page.governance.super.* keys resolve in all 5 catalogues (D-90-20)', () => {
  const KEYS = [
    'page.governance.superTitle',
    'page.governance.superSegAria',
    'page.governance.superSegAdmins',
    'page.governance.superLead',
    'page.governance.superSearchHint',
    'page.governance.superMatchCount',
    'page.governance.superCapNote',
    'page.governance.superShowMore',
    'page.governance.superNoMatchesTitle',
    'page.governance.superNoMatchesBody',
    'page.governance.superRosterEmptyTitle',
    'page.governance.superRosterEmptyBody',
  ];
  for (const [lang, cat] of Object.entries({ en, fr, de, es, nl })) {
    for (const k of KEYS) assert.ok(cat[k], `${lang} catalogue lost ${k}`);
  }
  // placeholder parity across locales (D-07)
  const ph = s => (String(s).match(/\{[a-z]+\}/g) || []).sort();
  for (const k of ['page.governance.superMatchCount', 'page.governance.superCapNote', 'page.governance.superNoMatchesBody']) {
    for (const [lang, cat] of Object.entries({ fr, de, es, nl })) {
      assert.deepEqual(ph(cat[k]), ph(en[k]), `${lang} placeholder drift on ${k}`);
    }
  }
});
