/* =====================================================================
   102-01 MAPPINGS CLIENT (MAPUI-01 client half): static client-source
   assertions for the Entra ID Mappings surface, per the governance-client
   precedent (no DOM harness → source assertions).

   Pinned invariants (plan 102-01 Task 1, items a–f):
   (a) 'mappings' is a registered ROUTE_ID
   (b) the layout nav sItem for 'mappings' is gated on
       api.user?.isInstanceAdmin && api.oidcEnabled (cosmetic gate, D-11)
   (c) P.mappings lazy-imports ../pages/mappings.js exporting pageMappings
   (d) the five Task-1 keys exist in ALL 5 catalogues
   (e) refreshMappings carries the 401 silent bail (D-28) + AbortController
   (f) esc() covers label and workspaceName in the row template (T-102-01)
   ===================================================================== */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';

import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import nl from '../src/locales/nl.json' with { type: 'json' };
import de from '../src/locales/de.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = rel => readFileSync(`${ROOT}/${rel}`, 'utf8');

/* (a) route registration */
test("'mappings' is a registered route id with an icon", () => {
  const r = src('src/shell/render.js');
  assert.match(r, /'mappings',\s*\];/, 'mappings missing from ROUTE_IDS');
  assert.match(r, /mappings: 'link'/, 'mappings missing from ROUTE_ICONS');
});

/* (b) the cosmetic nav gate (D-11) */
test('the mappings nav sItem is gated on isInstanceAdmin && oidcEnabled (cosmetic, D-11)', () => {
  const l = src('src/shell/layout.js');
  assert.match(l, /api\.user\?\.isInstanceAdmin && api\.oidcEnabled \? sItem\('mappings'/, 'the gated sItem is missing');
});

/* (c) the lazy page map entry */
test('P.mappings lazy-imports the mappings page exporting pageMappings', () => {
  const l = src('src/shell/layout.js');
  assert.match(l, /mappings: lazy\(\(\) => import\('\.\.\/pages\/mappings\.js'\), 'pageMappings'\)/, 'the lazy entry is missing');
  const p = src('src/pages/mappings.js');
  assert.match(p, /export function pageMappings\(\)/, 'pageMappings export missing');
});

/* (d) ×5 catalogue parity for the Task-1 keys */
test('the mappings i18n keys exist in ALL 5 catalogues', () => {
  const keys = [
    'nav.route.mappings',
    'page.mappings.subtitle',
    'page.mappings.loading',
    'page.mappings.emptyTitle',
    'page.mappings.emptyBody',
  ];
  for (const k of keys) {
    assert.ok(en[k] && fr[k] && nl[k] && de[k] && es[k], `${k} missing from a catalogue`);
  }
});

/* (e) the fill loop discipline (D-28 + abort) */
test('refreshMappings carries the 401 silent bail and the AbortController sequence guard', () => {
  const a = src('src/actions/actions.js');
  const m = a.match(/export async function refreshMappings\(\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'refreshMappings is missing');
  assert.match(m[0], /new AbortController\(\)/, 'no in-flight abort');
  assert.match(m[0], /res\.status !== 401/, 'the 401 silent bail (D-28) is missing');
  assert.match(m[0], /S\.ui\.mapRows = res\.data\.mappings \|\| \[\]/, 'rows not staged in S.ui.mapRows');
});

/* (f) stored-XSS discipline in the row template (T-102-01) */
test('the mappings row template esc()s label and workspaceName', () => {
  const p = src('src/pages/mappings.js');
  assert.match(p, /\$\{esc\(m\.label \|\| ''\)\}/, 'label renders unescaped');
  assert.match(p, /\$\{esc\(m\.workspaceName \|\| '—'\)\}/, 'workspaceName renders unescaped');
});

/* MAPUI-02 checker W1 → 107-01 (planner decision A6): the row template
   renders the created_at timestamp in the house ago() format — "When"
   reads as "since this mapping exists", so the updatedAt is NOT rendered. */
test('the mappings row template renders createdAt (created_at semantics, A6) and never updatedAt', () => {
  const p = src('src/pages/mappings.js');
  assert.match(p, /ago\(m\.createdAt\)/, 'createdAt timestamp missing from the row template');
  assert.doesNotMatch(p, /ago\(m\.updatedAt\)/, 'updatedAt must not render — When = created_at (A6)');
});

/* =====================================================================
   107-01 Task 1 (SPA-01): the perm-t table + the team cell + the picker.
   ===================================================================== */

/* (SPA-01) the perm-t idiom verbatim: table class, first-th padding,
   wrapper panel with overflow-x, rows.map(mapTr) */
test('the mappings section renders as a perm-t table (SPA-01 idiom)', () => {
  const p = src('src/pages/mappings.js');
  assert.match(p, /const mapTr = m => \{/, 'the mapTr builder is missing');
  assert.doesNotMatch(p, /const mapRow = m => \{/, 'the old srow mapRow lingers');
  assert.match(p, /<table class="perm-t" style="min-width:880px">/, 'the perm-t table idiom is missing');
  assert.match(p, /<th style="padding-left:14px">/, 'the first-th padding is missing');
  assert.match(p, /rows\.map\(mapTr\)\.join\(''\)/, 'rows are not mapped through mapTr');
  assert.match(p, /<div class="panel" style="overflow-x:auto">\$\{body\}/, 'the table wrapper panel is missing');
  for (const k of ['colLabel', 'colGuid', 'colWorkspace', 'colTeam', 'colRole', 'colUsers', 'colWhen']) {
    assert.match(p, new RegExp(`page\\.mappings\\.${k}`), `the ${k} column header is missing`);
  }
});

/* (SPA-01 team cell, 106-02 handoff) the team state keys off teamMissing —
   never a falsy teamName check — and every interpolated cell rides esc() */
test('the team cell keys off teamMissing and every new interpolated cell rides esc() (T-107-01)', () => {
  const p = src('src/pages/mappings.js');
  assert.match(p, /m\.teamMissing\s*\n?\s*\?/, 'the team cell must key off teamMissing (106-02 handoff)');
  assert.doesNotMatch(p, /m\.teamName \?/, 'a falsy teamName check would mask the dead-team state (Pitfall 2)');
  assert.match(p, /esc\(m\.teamName \|\| '—'\)/, 'the teamName cell renders unescaped');
  assert.match(p, /esc\(m\.groupGuid \|\| ''\)/, 'the GUID cell renders unescaped');
  assert.match(p, /\$\{esc\(String\(m\.liveMembers \?\? 0\)\)\}/, 'the liveMembers count renders unescaped');
  assert.doesNotMatch(p, /viaGroup/, 'the {n} viaGroup chip must be retired with the table columns');
});

/* ×5 parity for the Task-1 key batch */
test('the 107-01 Task-1 i18n keys exist in ALL 5 catalogues (and viaGroup is retired ×5)', () => {
  const keys = [
    'page.mappings.sectionTitle',
    'page.mappings.sectionLead',
    'page.mappings.colLabel',
    'page.mappings.colGuid',
    'page.mappings.colWorkspace',
    'page.mappings.colTeam',
    'page.mappings.colRole',
    'page.mappings.colUsers',
    'page.mappings.colWhen',
    'page.mappings.teamMissingBadge',
    'page.mappings.teamLabel',
    'page.mappings.teamNone',
  ];
  for (const k of keys) {
    assert.ok(en[k] && fr[k] && nl[k] && de[k] && es[k], `${k} missing from a catalogue`);
  }
  for (const [name, cat] of [['en', en], ['fr', fr], ['nl', nl], ['de', de], ['es', es]]) {
    assert.ok(!cat['page.mappings.viaGroup'], `${name} still carries the retired viaGroup key`);
  }
});

/* (SPA-05) the create-form team picker: hidden until a workspace is chosen,
   options from that workspace's teams, esc()d values + names, teamNone default */
test('mapCreateForm renders the team picker only when wsId is set, fed by that workspace’s teams (SPA-05)', () => {
  const p = src('src/pages/mappings.js');
  const form = p.match(/const mapCreateForm = \(\) => \{[\s\S]*?\n\};/);
  assert.ok(form, 'mapCreateForm is missing');
  assert.match(form[0], /wsPool\.find\(w => w\.id === f\.wsId\)\?\.teams \|\| \[\]/, 'the picker options do not come from the chosen workspace’s teams');
  assert.match(form[0], /const teamSelect = f\.wsId\s*\n?\s*\?/, 'the picker must be hidden until a workspace is chosen (SPA-05)');
  assert.match(form[0], /value="\$\{esc\(tm\.id \|\| ''\)\}"/, 'the team option value is unescaped');
  assert.match(form[0], />\$\{esc\(tm\.name \|\| ''\)\}<\/option>/, 'the team option name is unescaped');
  assert.match(form[0], /page\.mappings\.teamNone/, 'the — no team — empty-value option is missing');
  assert.doesNotMatch(form[0], /teamPlaceholder/, 'the hidden picker carries no placeholder markup');
});

/* (SPA-05, Pitfall 8) changing the workspace resets the draft teamId; the
   team picker draft rides IN.mapTeam (staged draft, never the DOM) */
test('IN.mapWs resets the draft teamId and IN.mapTeam stages the pick (Pitfall 8)', () => {
  const a = src('src/actions/actions.js');
  const ws = a.match(/IN\.mapWs = el => \{[\s\S]*?\n\};/);
  const team = a.match(/IN\.mapTeam = el => \{[\s\S]*?\n\};/);
  assert.ok(ws && team, 'the picker handlers are missing');
  assert.match(ws[0], /S\.ui\.mapForm\.teamId = '';/, 'changing the workspace must reset the stale teamId');
  assert.match(team[0], /S\.ui\.mapForm\.teamId = el\.value;/, 'the team pick is not staged in the draft');
});

/* (SPA-05 wiring) A.mapCreate sends the picked teamId (POST accepts it
   since Phase 106) — null when unset */
test('A.mapCreate sends the draft teamId (null when unset) in the camelCase body', () => {
  const a = src('src/actions/actions.js');
  const fn = a.match(/A\.mapCreate = async \(\) => \{[\s\S]*?\n\};/);
  assert.match(fn[0], /teamId: f\.teamId \|\| null/, 'the create body does not carry the picked team');
});

/* =====================================================================
   107-01 Task 2 (SPA-02): the staged edit modal + groupMappingUpdate.
   ===================================================================== */

/* the api method exists and PATCHes the 106 route */
test('api.groupMappingUpdate PATCHes the 106 route with the encodeURIComponentd id', () => {
  const a = src('src/core/api.js');
  assert.match(a, /async groupMappingUpdate\(id, body\) \{\s*\n\s*return call\('PATCH', `\/api\/governance\/group-mappings\/\$\{encodeURIComponent\(id\)\}`, body\);/, 'the PATCH method is missing or malformed');
});

/* the modal body: GUID read-only (no data-in binding), esc'd mono + hint */
test('mapEditBody renders the GUID read-only esc mono with the cannot-change hint (R-8 client-side)', () => {
  const p = src('src/pages/mappings.js');
  const body = p.match(/export function mapEditBody\(\) \{[\s\S]*?\n\}\n\n/);
  assert.ok(body, 'mapEditBody is missing');
  assert.match(p, /export function mapEditBody\(\)/, 'mapEditBody is not exported');
  assert.doesNotMatch(body[0], /data-in="mapEditGuid"/, 'the GUID must have NO editable binding');
  assert.doesNotMatch(body[0], /<input[^>]*guid/i, 'no GUID input may exist in the edit modal');
  assert.match(body[0], /\$\{esc\(d\.guid \|\| ''\)\}/, 'the read-only GUID renders unescaped');
  assert.match(body[0], /page\.mappings\.editGuidHint/, 'the cannot-change hint is missing');
  assert.match(body[0], /maxlength="200"/, 'the label input lacks maxlength="200"');
  assert.match(body[0], /value="\$\{esc\(d\.label \|\| ''\)\}"/, 'the label value attribute is unescaped');
  assert.match(body[0], /value="\$\{esc\(tm\.id \|\| ''\)\}"/, 'the team option value is unescaped');
  assert.match(body[0], /wsPool\.find\(w => w\.id === d\.wsId\)\?\.teams/, 'the team options must follow the select’s CURRENT wsId (Pitfall 8)');
  assert.match(body[0], /data-a="mapEditSave"/, 'the save control is missing');
  assert.match(body[0], /data-a="mapEditCancel"/, 'the cancel control is missing');
  assert.match(body[0], /t\('common\.save'\)/, 'the footer must reuse common.save');
});

/* the edit trio: staged draft, IN handlers, 401 bail, tErr funnel, refresh */
test('A.mapEditAsk/Save/Cancel stage the draft and PATCH all four fields (never groupGuid)', () => {
  const a = src('src/actions/actions.js');
  const ask = a.match(/A\.mapEditAsk = el => \{[\s\S]*?\n\};/);
  const save = a.match(/A\.mapEditSave = async \(\) => \{[\s\S]*?\n\};/);
  const cancel = a.match(/A\.mapEditCancel = \(\) => \{[\s\S]*?\n\};/);
  assert.ok(ask && save && cancel, 'the edit trio is missing');
  assert.match(ask[0], /S\.ui\.mapEdit = \{ id: row\.id/, 'the ask handler does not stage the draft');
  assert.match(ask[0], /openModal\(\{ type: 'custom', cls: 'sm', render: \(\) => m\.mapEditBody/, 'the modal host idiom is missing');
  assert.match(save[0], /\(d\.label \|\| ''\)\.trim\(\)/, 'the label pre-check is missing');
  assert.match(save[0], /api\.groupMappingUpdate\(d\.id, \{ workspaceId: d\.wsId \|\| '', teamId: d\.teamId \|\| null, role: d\.role \|\| 'member', label \}\)/, 'the PATCH body must carry ALL FOUR fields');
  assert.doesNotMatch(save[0], /groupGuid: /, 'the PATCH body must NEVER carry groupGuid');
  assert.match(save[0], /res\.status === 401\) return/, 'the 401 silent bail is missing');
  assert.match(save[0], /tErr\(code, null, res\.error \|\| t\('err\.serverUnreachable'\)\)/, 'the keyed refusal funnel is missing');
  assert.match(save[0], /t\('page\.mappings\.savedToast'\)/, 'the success toast is missing');
  assert.match(save[0], /await refreshMappings\(\)/, 'the reconcile refresh is missing');
  assert.match(cancel[0], /S\.ui\.mapEdit = null;/, 'the cancel does not clear the draft');
  assert.match(cancel[0], /closeModal\(\)/, 'the cancel does not close the modal');
});

/* the IN.mapEdit* handlers + the Pitfall-8 ws-change team reset */
test('IN.mapEdit* handlers stage in S.ui.mapEdit; changing ws resets the draft teamId (Pitfall 8)', () => {
  const a = src('src/actions/actions.js');
  for (const h of ['mapEditWs', 'mapEditTeam', 'mapEditRole', 'mapEditLabel']) {
    assert.match(a, new RegExp(`IN\\.${h} = el => \\{`), `IN.${h} is missing`);
  }
  const ws = a.match(/IN\.mapEditWs = el => \{[\s\S]*?\n\};/);
  assert.match(ws[0], /S\.ui\.mapEdit\.teamId = null;/, 'changing the target ws must reset the draft teamId');
});

/* teardown clears the edit draft too (extends the :296 pin) */
test('ROUTE_TEARDOWN.mappings also clears S.ui.mapEdit', () => {
  const p = src('src/pages/mappings.js');
  const td = p.match(/const mapTeardown = \(\) => \{[\s\S]*?\n\};/);
  assert.match(td[0], /S\.ui\.mapEdit = null;/, 'the teardown does not clear the edit draft');
});

/* the Edit button renders on EVERY row (dead-row repair sanctioned, D-11) */
test('the mapTr gutter carries the Edit button beside the staged Delete', () => {
  const p = src('src/pages/mappings.js');
  const row = p.match(/const mapTr = m => \{[\s\S]*?\n\};/);
  assert.match(row[0], /data-a="mapEditAsk" data-id="\$\{esc\(m\.id\)\}"/, 'the Edit button is missing or unescaped');
});

/* ×5 parity for the Task-2 key batch */
test('the 107-01 Task-2 i18n keys exist in ALL 5 catalogues', () => {
  const keys = ['page.mappings.edit', 'page.mappings.editTitle', 'page.mappings.editGuidHint', 'page.mappings.savedToast'];
  for (const k of keys) {
    assert.ok(en[k] && fr[k] && nl[k] && de[k] && es[k], `${k} missing from a catalogue`);
  }
});

/* =====================================================================
   102-01 Task 2 (TDD): src/core/guid.js — the client canonicalizeGuid
   port of groups.js:27-55. Acceptance contract: {braced}/no-hyphen/
   uppercase inputs canonicalize identically to the server implementation
   (D-08 client pre-check and the server funnel never diverge); garbage/
   null/undefined → ''.
   ===================================================================== */
import { canonicalizeGuid } from '../src/core/guid.js';

const GUID = 'd16b5a5b-1234-4abc-9d2e-abcdef012345';

test('canonicalizeGuid: braced + uppercase accepted → hyphenated lowercase', () => {
  assert.equal(canonicalizeGuid('{D16B5A5B-1234-4ABC-9D2E-ABCDEF012345}'), GUID);
});

test('canonicalizeGuid: 32-hex accepted → hyphenated lowercase form', () => {
  assert.equal(canonicalizeGuid('d16b5a5b12344abc9d2eabcdef012345'), GUID);
  assert.equal(canonicalizeGuid('D16B5A5B12344ABC9D2EABCDEF012345'), GUID);
});

test('canonicalizeGuid: garbage/null/undefined → empty string', () => {
  assert.equal(canonicalizeGuid('not-a-guid'), '');
  assert.equal(canonicalizeGuid(null), '');
  assert.equal(canonicalizeGuid(undefined), '');
});

test('canonicalizeGuid: whitespace-padded input → trimmed canonical form', () => {
  assert.equal(canonicalizeGuid(`  ${GUID.toUpperCase()}  `), GUID);
});

/* the bundling doctrine: groups.js is a server-root module — no src/ file
   may import it (research § GUID canonicalization importability verdict) */
test('no src/ file imports groups.js (server-only module, never bundled)', () => {
  let out = '';
  try {
    out = execFileSync('grep', ['-rlE', `import[^;]*['"].*groups\\.js['"]`, 'src/'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    /* grep exit 1 = no matches = the invariant holds */
  }
  assert.equal(out.trim(), '', 'a src/ file imports groups.js');
});

/* the quiet empty state (D-10) rides the house empty() helper with the
   mappings keys, and the page fetch rides the in-render kick */
test('pageMappings renders the quiet empty state and the in-render kick', () => {
  const p = src('src/pages/mappings.js');
  assert.match(p, /empty\('link', t\('page\.mappings\.emptyTitle'\), t\('page\.mappings\.emptyBody'\)/, 'the empty-state hint is missing');
  assert.match(p, /if \(!S\.ui\.mapRows && !S\.ui\.mapErr\) refreshMappings\(\);/, 'the in-render kick is missing');
});

/* =====================================================================
   102-01 Task 3: the STRICT dead-mappings card move (D-06/D-07).
   ===================================================================== */

/* (a) governance loses the card and the dead-mappings fetch entirely */
test('governance.js keeps zero dead-card/dead-fetch references (strict move, D-06)', () => {
  const g = src('src/pages/governance.js');
  assert.doesNotMatch(g, /govDeadCard/, 'governance.js still references govDeadCard');
  assert.doesNotMatch(g, /operatorDeadMappings|dead-mappings['"]/, 'governance.js still references the dead-mappings fetch');
  const a = src('src/actions/actions.js');
  const govRefresh = a.match(/export async function refreshGovernanceWorkspaces\(\) \{[\s\S]*?\n\}/);
  assert.ok(govRefresh, 'refreshGovernanceWorkspaces moved');
  assert.doesNotMatch(govRefresh[0], /operatorDeadMappings/, 'the dead fetch is still entangled with the governance refresh (Pitfall 2)');
  /* the fetch moved INTO refreshMappings */
  const mapRefresh = a.match(/export async function refreshMappings\(\) \{[\s\S]*?\n\}/);
  assert.ok(mapRefresh, 'refreshMappings moved');
  assert.match(mapRefresh[0], /operatorDeadMappings/, 'the dead fetch did not move into refreshMappings');
  assert.match(mapRefresh[0], /S\.ui\.govDead = /, 'the dead payload is not staged in S.ui.govDead');
});

/* (b) the moved card is display-only — no data-a in the card region (D-06/D-07) */
test('the govDeadCard block carries no data-a attributes (display-only; re-scoped 107-01 — the edit modal below it legitimately carries the mapEdit pair)', () => {
  const p = src('src/pages/mappings.js');
  const card = p.match(/107-01 DEAD-MAPPINGS TABLE \+ USAGE LOG[\s\S]*?^};/m);
  assert.ok(card, 'the dead/usage section block is missing from mappings.js');
  assert.doesNotMatch(card[0], /data-a=/, 'the dead/usage sections carry interactive controls');
  /* FIRST-colon split logic moved intact */
  assert.match(card[0], /splitFirst/, 'the FIRST-colon split logic did not move intact');
  /* rendered BELOW the list */
  assert.match(p, /pageMappings\(\)[\s\S]*govDeadCard\(\)/, 'the card is not rendered from the page body');
  /* the edit modal body (BELOW the card region) carries the staged edit pair */
  assert.match(p, /export function mapEditBody\(\)[\s\S]*data-a="mapEditSave"/, 'the edit modal pair is missing');
});

/* (c) the renamed keys: page.mappings.dead* ×5, page.governance.dead* nowhere */
test('page.mappings.dead* keys exist ×5 and page.governance.dead* keys exist in NO catalogue', () => {
  const keys = ['page.mappings.deadTitle', 'page.mappings.deadLead', 'page.mappings.deadColGuid', 'page.mappings.deadColWorkspace', 'page.mappings.deadColTeam', 'page.mappings.deadColLastSeen'];
  for (const k of keys) {
    assert.ok(en[k] && fr[k] && nl[k] && de[k] && es[k], `${k} missing from a catalogue`);
  }
  for (const [name, cat] of [['en', en], ['fr', fr], ['nl', nl], ['de', de], ['es', es]]) {
    assert.ok(!cat['page.mappings.deadOrphans'] && !cat['page.mappings.deadTrail'], `${name} still carries a retired deadOrphans/deadTrail key`);
  }
  const deadPrefix = /^page\.governance\.dead/;
  for (const [name, cat] of [['en', en], ['fr', fr], ['nl', nl], ['de', de], ['es', es]]) {
    assert.ok(!Object.keys(cat).some(k => deadPrefix.test(k)), `${name} still carries a page.governance.dead* key`);
  }
});

/* =====================================================================
   102-02 Task 1: the always-visible create form (MAPUI-02,
   D-01/D-03/D-08/D-09).
   ===================================================================== */

/* (a) the 11 Task-1 keys exist in ALL 5 catalogues */
test('the create-form i18n keys exist in ALL 5 catalogues', () => {
  const keys = [
    'page.mappings.formTitle',
    'page.mappings.formLead',
    'page.mappings.guidLabel',
    'page.mappings.guidPlaceholder',
    'page.mappings.labelLabel',
    'page.mappings.wsLabel',
    'page.mappings.wsPlaceholder',
    'page.mappings.roleLabel',
    'page.mappings.create',
    'page.mappings.createdToast',
    'page.mappings.badLabelToast',
  ];
  for (const k of keys) {
    assert.ok(en[k] && fr[k] && nl[k] && de[k] && es[k], `${k} missing from a catalogue`);
  }
});

/* (b) the create path canonicalizes the GUID BEFORE submit (D-08) and
   POSTs the camelCase body through api.groupMappingCreate */
test('A.mapCreate canonicalizes the GUID pre-submit and POSTs the camelCase body', () => {
  const a = src('src/actions/actions.js');
  const fn = a.match(/A\.mapCreate = async \(\) => \{[\s\S]*?\n\};/);
  assert.ok(fn, 'A.mapCreate is missing');
  assert.match(a, /import \{ canonicalizeGuid \} from '\.\.\/core\/guid\.js';/, 'actions.js does not import canonicalizeGuid');
  assert.match(fn[0], /canonicalizeGuid\(f\.guid \|\| ''\)/, 'the GUID is not canonicalized before submit');
  assert.ok(fn[0].indexOf('canonicalizeGuid') < fn[0].indexOf('groupMappingCreate'), 'canonicalization must run before the POST');
  assert.match(fn[0], /groupGuid: guid, workspaceId: f\.wsId \|\| '', teamId: f\.teamId \|\| null, role: f\.role \|\| 'member', label/, 'the camelCase body shape is wrong');
  assert.match(fn[0], /\(f\.label \|\| ''\)\.trim\(\)/, 'the label is not trimmed');
});

/* (c) the label input carries maxlength="200" (T-102-04: server slices) */
test('the create-form label input carries maxlength="200" and esc()d value attributes', () => {
  const p = src('src/pages/mappings.js');
  const form = p.match(/const mapCreateForm = \(\) => \{[\s\S]*?\n\};/);
  assert.ok(form, 'mapCreateForm is missing');
  assert.match(form[0], /maxlength="200"/, 'the label input lacks maxlength="200"');
  /* every value-bearing attribute rides esc() (T-102-04) */
  assert.match(form[0], /value="\$\{esc\(f\.guid \|\| ''\)\}"/, 'the guid value attribute is unescaped');
  assert.match(form[0], /value="\$\{esc\(f\.label \|\| ''\)\}"/, 'the label value attribute is unescaped');
  assert.match(form[0], /value="\$\{esc\(w\.id \|\| ''\)\}"/, 'the workspace option value is unescaped');
  assert.match(form[0], /data-a="mapCreate"/, 'the create CTA is missing');
  /* the form panel renders ABOVE the list (D-01) */
  assert.ok(p.indexOf('mapCreateForm()') < p.indexOf('class="panel" style="overflow-x:auto">${body}'), 'the form is not above the list');
});

/* (d) the pre-checks are LIGHT (D-08): exactly two flags, both keyed, and
   the refusal funnel is the tErr keyed lookup (D-09) */
test('A.mapCreate carries the two light pre-checks and the keyed tErr refusal funnel', () => {
  const a = src('src/actions/actions.js');
  const fn = a.match(/A\.mapCreate = async \(\) => \{[\s\S]*?\n\};/);
  assert.match(fn[0], /t\('err\.groupMappingBadGuid'\)/, 'the bad-guid pre-check toast is missing');
  assert.match(fn[0], /t\('page\.mappings\.badLabelToast'\)/, 'the empty-label pre-check toast is missing');
  assert.match(fn[0], /res\.status === 401\) return/, 'the 401 silent bail is missing');
  assert.match(fn[0], /tErr\(code, null, res\.error \|\| t\('err\.serverUnreachable'\)\)/, 'the keyed refusal funnel is missing');
});

/* (e) D-09 parity gate: every refusal code in the Phase 101 inventory maps
   to an existing err.${code} key in ALL 5 catalogues — zero new err keys */
test('every group-mapping refusal code maps to an existing err.* key ×5 (D-09 parity gate)', () => {
  const codes = [
    'groupMappingBadGuid',
    'groupMappingUnknownWorkspace',
    'groupMappingBadRole',
    'groupMappingDuplicate',
    'operatorOnly',
    'notFound',
    'tooManyAttempts',
  ];
  for (const c of codes) {
    assert.ok(en[`err.${c}`] && fr[`err.${c}`] && nl[`err.${c}`] && de[`err.${c}`] && es[`err.${c}`], `err.${c} missing from a catalogue`);
  }
});

/* =====================================================================
   102-02 Task 2: row hints (D-02) + the staged inline-confirm delete
   (D-04/D-05, D-90 pattern).
   ===================================================================== */

/* (a) the 7 Task-2 keys exist in ALL 5 catalogues */
test('the row-hint/delete i18n keys exist in ALL 5 catalogues', () => {
  const keys = [
    'page.mappings.deadBadgeArchived',
    'page.mappings.deadBadgeDeleted',
    'page.mappings.delete',
    'page.mappings.deleteConfirm',
    'page.mappings.deleteCopy',
    'page.mappings.deletedToast',
  ];
  for (const k of keys) {
    assert.ok(en[k] && fr[k] && nl[k] && de[k] && es[k], `${k} missing from a catalogue`);
  }
});

/* (b) the EN deleteCopy carries the verbatim SC sentence (D-05 — pinned) */
test('en.json page.mappings.deleteCopy carries the verbatim lazy-revocation sentence', () => {
  assert.ok(
    en['page.mappings.deleteCopy'].includes('Members mapped through this group will lose access at their next Microsoft sign-in.'),
    'the verbatim SC sentence is missing from en.json deleteCopy',
  );
});

/* (c) ROUTE_TEARDOWN.mappings clears the staged delete state (no stage
   across route exit) */
test('ROUTE_TEARDOWN.mappings clears S.ui.mapStage', () => {
  const p = src('src/pages/mappings.js');
  assert.match(p, /ROUTE_TEARDOWN\.mappings = mapTeardown;/, 'the teardown registration is missing');
  const td = p.match(/const mapTeardown = \(\) => \{[\s\S]*?\n\};/);
  assert.ok(td, 'mapTeardown is missing');
  assert.match(td[0], /S\.ui\.mapStage = null/, 'the teardown does not clear the delete stage');
});

/* (d) the delete fires on the second click with the OPAQUE row id only
   (Phase 101 D-08 — never a GUID+workspace composite) */
test('mapDeleteAsk/Confirm/Cancel stage and fire with the opaque row id via encodeURIComponent-free opaque id', () => {
  const a = src('src/actions/actions.js');
  const ask = a.match(/A\.mapDeleteAsk = el => \{[\s\S]*?\n\};/);
  const cancel = a.match(/A\.mapDeleteCancel = \(\) => \{[\s\S]*?\n\};/);
  const confirm = a.match(/A\.mapDeleteConfirm = async el => \{[\s\S]*?\n\};/);
  assert.ok(ask && cancel && confirm, 'the staged delete trio is missing');
  assert.match(ask[0], /S\.ui\.mapStage = el\.dataset\.id/, 'the ask handler does not stage the row id');
  assert.match(cancel[0], /S\.ui\.mapStage = null/, 'the cancel handler does not clear the stage');
  assert.match(confirm[0], /api\.groupMappingDelete\(id\)/, 'the confirm handler does not call api.groupMappingDelete with the opaque id');
  assert.match(confirm[0], /res\.status === 401\) return/, 'the 401 silent bail is missing');
  assert.match(confirm[0], /tErr\(code, null, res\.error \|\| t\('err\.serverUnreachable'\)\)/, 'the keyed refusal funnel is missing');
  assert.match(confirm[0], /t\('page\.mappings\.deletedToast'\)/, 'the success toast is missing');
  assert.match(confirm[0], /await refreshMappings\(\)/, 'the list refresh is missing');
});

/* (e) the staged-row repaint is a re-render through the SAME template —
   esc() coverage persists on the delete path (T-102-04 stored-XSS
   watch-item) */
test('the staged delete row template keeps esc() coverage on every value-bearing attribute', () => {
  const p = src('src/pages/mappings.js');
  const row = p.match(/const mapTr = m => \{[\s\S]*?\n\};/);
  assert.ok(row, 'mapTr is missing');
  assert.match(row[0], /data-id="\$\{esc\(m\.id\)\}"/, 'the staged-row ids render unescaped');
  assert.match(row[0], /page\.mappings\.deadBadgeArchived/, 'the archived dead badge is missing');
  assert.match(row[0], /page\.mappings\.deadBadgeDeleted/, 'the deleted dead badge is missing');
  assert.match(row[0], /S\.ui\.mapStage === m\.id/, 'the staged branch is missing');
});

/* =====================================================================
   107-01 Task 3 (SPA-03/SPA-04/TEAM-08): dead table + usage log +
   the role-loss delete clause.
   ===================================================================== */

/* (SPA-03) the dead section: perm-t table fed by orphans, quiet-absence */
test('the dead mappings section renders as a perm-t table fed by orphans with quiet-absence (SPA-03)', () => {
  const p = src('src/pages/mappings.js');
  assert.doesNotMatch(p, /const mapRow/, 'the old srow builder lingers');
  const dead = p.match(/const govDeadCard = \(\) => \{[\s\S]*?\n\};/);
  assert.ok(dead, 'the dead section is missing');
  assert.match(dead[0], /const orphans = dead\.orphans \|\| \[\];/, 'the section is not fed by orphans');
  assert.doesNotMatch(dead[0], /dead\.trail/, 'the refused-guard trail must no longer render (usage slice supersedes it)');
  assert.match(dead[0], /if \(!orphans\.length\) return '';/, 'quiet-absence (D-10) is missing');
  assert.match(dead[0], /<table class="perm-t"/, 'the dead section is not a perm-t table');
  for (const k of ['deadColGuid', 'deadColWorkspace', 'deadColTeam', 'deadColLastSeen']) {
    assert.match(dead[0], new RegExp(`page\\.mappings\\.${k}`), `the ${k} column header is missing`);
  }
  assert.match(dead[0], /\$\{esc\(o\.group_guid \|\| ''\)\}/, 'the orphan GUID renders unescaped');
});

/* (SPA-04) the usage section: keyed action labels incl. team verbs, honest
   group name with the raw-GUID fallback, cap-note ONLY at 100 */
test('the usage section labels all group lifecycle actions incl. the 106-01 team verbs (SPA-04, Pitfall 4)', () => {
  const p = src('src/pages/mappings.js');
  const usage = p.match(/const usageSection = \(\) => \{[\s\S]*?\n\};/);
  assert.ok(usage, 'the usage section is missing');
  assert.match(p, /group_team_granted: 'page\.mappings\.usage\.action\.teamGranted'/, 'the teamGranted verb label is missing');
  assert.match(p, /group_team_removed: 'page\.mappings\.usage\.action\.teamRemoved'/, 'the teamRemoved verb label is missing');
  assert.match(p, /group_membership_skipped: 'page\.mappings\.usage\.action\.skipped'/, 'the skipped verb label is missing');
  assert.match(p, /group_team_skipped: 'page\.mappings\.usage\.action\.skipped'/, 'the team-skipped verb label is missing');
  /* the FIRST-colon split stays client-side (D-08) */
  assert.match(usage[0], /splitFirst\(u\.action\)/, 'the encoded action split is not client-side');
  /* honest Group Name: mapping label, raw GUID fallback */
  assert.match(usage[0], /find\(r => r\.groupGuid === guid\)\?\.label/, 'the group-name lookup is missing');
  assert.match(usage[0], /\$\{esc\(groupName \|\| guid\)\}/, 'the group-name fallback GUID renders unescaped');
  /* Who + When + cap-note only at cap */
  assert.match(usage[0], /\$\{esc\(u\.targetName \|\| ''\)\}/, 'Who renders unescaped');
  assert.match(usage[0], /usage\.length === 100 \?/, 'the cap-note must render ONLY at the 100 cap');
  assert.match(usage[0], /t\('page\.mappings\.usageCapNote', \{ shown: String\(usage\.length\), total: '100' \}\)/, 'the cap-note interpolation is missing');
  /* the keyed empty state when orphans exist but usage is empty (A1) */
  assert.match(usage[0], /usageEmptyTitle/, 'the usage empty state is missing');
  assert.match(usage[0], /!usage\.length && !orphans\.length\) return '';/, 'the whole-sblock quiet-absence is missing');
});

/* ×5 parity for the Task-3 key batch */
test('the 107-01 Task-3 i18n keys exist in ALL 5 catalogues', () => {
  const keys = [
    'page.mappings.usageTitle', 'page.mappings.usageLead',
    'page.mappings.usageColAction', 'page.mappings.usageColGuid', 'page.mappings.usageColGroup', 'page.mappings.usageColWho', 'page.mappings.usageColWhen',
    'page.mappings.usageEmptyTitle', 'page.mappings.usageEmptyBody', 'page.mappings.usageCapNote',
    'page.mappings.usage.action.granted', 'page.mappings.usage.action.upgraded', 'page.mappings.usage.action.downgraded',
    'page.mappings.usage.action.removed', 'page.mappings.usage.action.teamGranted', 'page.mappings.usage.action.teamRemoved', 'page.mappings.usage.action.skipped',
    'page.mappings.usage.reason.guardRefused', 'page.mappings.usage.reason.lostClaim', 'page.mappings.usage.reason.deadTeam', 'page.mappings.usage.reason.mappedLower',
  ];
  for (const k of keys) {
    assert.ok(en[k] && fr[k] && nl[k] && de[k] && es[k], `${k} missing from a catalogue`);
  }
});

/* (TEAM-08) the only-mapping derivation: client-side count over mapRows for
   the row's (groupGuid, workspaceId); the clause earns its keep exactly when
   the group holds team-kind siblings in the same workspace (Pitfall 9) */
test('the staged delete carries the TEAM-08 role-loss clause keyed on the client-side only-mapping derivation', () => {
  const p = src('src/pages/mappings.js');
  const row = p.match(/const mapTr = m => \{[\s\S]*?\n\};/);
  assert.match(row[0], /S\.ui\.mapRows\.filter\(r => r\.groupGuid === m\.groupGuid && r\.workspaceId === m\.workspaceId\)\.length === 1/, 'the only-mapping derivation is missing');
  assert.match(row[0], /page\.mappings\.deleteCopyRole/, 'the role-loss clause key is missing');
  assert.match(row[0], /page\.mappings\.deleteCopy/, 'the lazy-revocation copy must stay (the clause appends, never replaces)');
});

/* the EN clause ships verbatim as drafted (planner-authored per the 106-02
   W1 handoff — flagged for owner review before ship) */
test('en.json page.mappings.deleteCopyRole carries the verbatim role-loss clause ×5', () => {
  assert.ok(
    en['page.mappings.deleteCopyRole'].includes('members will also lose their workspace role at that same next sign-in.'),
    'the verbatim TEAM-08 clause is missing from en.json deleteCopyRole',
  );
  for (const [name, cat] of [['fr', fr], ['nl', nl], ['de', de], ['es', es]]) {
    assert.ok(cat['page.mappings.deleteCopyRole'] && cat['page.mappings.deleteCopyRole'].length > 20, `${name} deleteCopyRole is missing or stub-length`);
  }
});
test('all data-a attributes in mappings.js live outside the dead-card region (D-06/D-07 regression pin)', () => {
  const p = src('src/pages/mappings.js');
  const cardStart = p.indexOf('107-01 DEAD-MAPPINGS TABLE + USAGE LOG');
  assert.ok(cardStart >= 0, 'the dead-card block marker is missing');
  /* 107-01 re-scope: the DISPLAY-only dead card block itself stays data-a-free;
     the mapEditBody modal AFTER it legitimately carries the staged edit pair. */
  const card = p.match(/107-01 DEAD-MAPPINGS TABLE \+ USAGE LOG[\s\S]*?^};/m);
  assert.doesNotMatch(card[0], /data-a=/, 'a data-a attribute leaked into the dead-card block');
  const afterCard = p.slice(cardStart);
  const afterModal = afterCard.slice(afterCard.indexOf('export function mapEditBody'));
  assert.doesNotMatch(afterModal, /data-a="(?!mapEdit)/, 'an unexpected data-a leaked after the edit modal');
  assert.ok(p.slice(0, cardStart).includes('data-a="mapDeleteAsk"') && p.slice(0, cardStart).includes('data-a="mapCreate"'), 'the interactive controls are missing from the page region above the card');
});
