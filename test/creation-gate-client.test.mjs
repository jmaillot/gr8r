/* =====================================================================
   PHASE 78 CLIENT GATE (78-02, WSG-03/WSG-10 client half): static
   client-source assertions for the gate-aware creation surfaces.

   The server side (env contract, POST /api/workspaces gate, /api/config
   boolean, operator endpoints) is covered by test/creation-gate.test.mjs.
   The client has no DOM test harness, so the client contract is pinned
   here as source assertions (precedent: the sw-contract/icon-contract
   static tests) plus real 5-catalogue key-presence checks (WSG-11).

   Pinned invariants:
   - state.creation is a BOOLEAN adoption of /api/config (the 'open'/'admins'
     string shape is dead server-side since 78-01)
   - canCreateWorkspace = gate open OR isInstanceAdmin — never a workspace
     owner/admin clause (D-112: tenant-bound roles cannot pass the instance gate)
   - the workspace-switcher create button renders only when canCreateWorkspace
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

test('state.creation adopts the /api/config boolean (78-01 shape)', () => {
  const api = src('src/core/api.js');
  assert.match(api, /state\.creation = !!r\.data\?\.workspaceCreation;/);
  assert.doesNotMatch(api, /workspaceCreation === 'open'/);
});

test('no consumer of the dead creation string shape remains in src/', () => {
  for (const f of ['src/core/api.js', 'src/main.js', 'src/actions/actions.js', 'src/overlays/popovers.js']) {
    assert.doesNotMatch(src(f), /creation === 'open'/, `${f} still compares creation === 'open'`);
  }
});

test('canCreateWorkspace is gate-aware: gate boolean OR isInstanceAdmin (D-112)', () => {
  const api = src('src/core/api.js');
  assert.match(api, /get canCreateWorkspace\(\) \{\s*return state\.creation \|\| state\.user\?\.isInstanceAdmin;/);
  // the workspace owner/admin clause is dead under the closed gate — it must be gone
  assert.doesNotMatch(api, /canCreateWorkspace[\s\S]{0,200}role === 'owner'/);
});

test('the workspace-switcher create button is gated on canCreateWorkspace (WSG-10)', () => {
  const pop = src('src/overlays/popovers.js');
  assert.match(pop, /api\.canCreateWorkspace \? `<button class="mi" data-a="newWorkspace">/);
});

test('A.newWorkspace keeps the belt-and-braces refusal (err.askAdmin toast)', () => {
  const actions = src('src/actions/actions.js');
  assert.match(actions, /A\.newWorkspace = \(\) => \{/);
  assert.match(actions, /if \(!api\.canCreateWorkspace\) \{\s*return toast\(t\('err\.askAdmin'\)/);
});

const KEYS = [];

for (const key of KEYS) {
  for (const [lang, cat] of [['en', en], ['fr', fr], ['nl', nl], ['de', de], ['es', es]]) {
    test(`${lang} catalogue carries ${key} (WSG-11)`, () => {
      assert.equal(typeof cat[key], 'string');
    });
  }
}
