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
