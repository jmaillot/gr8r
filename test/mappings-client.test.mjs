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
