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

/* MAPUI-02 checker W1: the row template carries the createdAt/updatedAt
   timestamps in the house ago() format — presence pinned at source. */
test('the mappings row template renders createdAt/updatedAt timestamps', () => {
  const p = src('src/pages/mappings.js');
  assert.match(p, /ago\(m\.createdAt\)/, 'createdAt timestamp missing from the row template');
  assert.match(p, /ago\(m\.updatedAt\)/, 'updatedAt timestamp missing from the row template');
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
test('the moved dead card carries no data-a attributes (display-only)', () => {
  const p = src('src/pages/mappings.js');
  const card = p.match(/83-02 DEAD-MAPPING WARNING CARD[\s\S]*?^};/m);
  assert.ok(card, 'the moved govDeadCard block is missing from mappings.js');
  assert.doesNotMatch(card[0], /data-a=/, 'the dead card carries interactive controls');
  /* FIRST-colon split logic moved intact */
  assert.match(card[0], /splitFirst/, 'the FIRST-colon split logic did not move intact');
  /* rendered BELOW the list */
  assert.match(p, /pageMappings\(\)[\s\S]*govDeadCard\(\)/, 'the card is not rendered from the page body');
});

/* (c) the renamed keys: page.mappings.dead* ×5, page.governance.dead* nowhere */
test('page.mappings.dead* keys exist ×5 and page.governance.dead* keys exist in NO catalogue', () => {
  const keys = ['page.mappings.deadTitle', 'page.mappings.deadLead', 'page.mappings.deadOrphans', 'page.mappings.deadTrail'];
  for (const k of keys) {
    assert.ok(en[k] && fr[k] && nl[k] && de[k] && es[k], `${k} missing from a catalogue`);
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
  assert.match(fn[0], /groupGuid: guid, workspaceId: f\.wsId \|\| '', role: f\.role \|\| 'member', label/, 'the camelCase body shape is wrong');
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
  assert.ok(p.indexOf('mapCreateForm()') < p.indexOf('class="panel" style="overflow-x:auto"'), 'the form is not above the list');
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
    'page.mappings.viaGroup',
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
  const row = p.match(/const mapRow = m => \{[\s\S]*?\n\};/);
  assert.ok(row, 'mapRow is missing');
  assert.match(row[0], /data-id="\$\{esc\(m\.id\)\}"/, 'the staged-row ids render unescaped');
  assert.match(row[0], /page\.mappings\.deadBadgeArchived/, 'the archived dead badge is missing');
  assert.match(row[0], /page\.mappings\.deadBadgeDeleted/, 'the deleted dead badge is missing');
  assert.match(row[0], /page\.mappings\.viaGroup'\)\.replace\('\{n\}'/, 'the count chip does not use the {n} placeholder convention');
  assert.match(row[0], /S\.ui\.mapStage === m\.id/, 'the staged branch is missing');
});
