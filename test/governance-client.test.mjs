/* =====================================================================
   PHASE 79 CLIENT GOVERNANCE (79-02, WSG-07/WSG-08 client half): static
   client-source assertions for the operator governance surface, per the
   creation-gate-client precedent (no DOM harness → source assertions).

   Pinned invariants (plan 79-02 Task 3, behaviors a–h):
   (a) memberCount > 0 opens the orphan modal; 0 members → slug type-to-confirm
   (b) S.ui.govDispositions entries keyed by userId: {type:'reassign',wsId,role}|{type:'release'}
   (c) the modal Delete button is disabled while any member lacks a disposition
   (d) the dispositions array rides the operatorWsDelete request body
   (e) workspaceNotEmpty / dispositionRequired / memberAlreadyMember → three DISTINCT keyed err toasts
   (f) confirmModal typeName exact-match gates the archive/delete OK (mixed-case slug does not enable it)
   (g) long names/emails ride .trunc — the .perm-t row layout never breaks
   (h) a non-operator deep link renders the 403 fullstate (lock + err.code403 + err.operatorOnly)
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

/* (a) the orphan fork: memberCount > 0 → orphan modal stage; 0 → typed confirm */
test('govDeleteAsk forks on memberCount: >0 opens the orphan modal, 0 goes to the slug type-to-confirm', () => {
  const a = actions();
  assert.match(a, /if \(ws\.memberCount > 0\) \{[\s\S]{0,400}?S\.ui\.govOrphan = \{ ws, members: null, targets: null \}/, 'the >0 fork does not stage the orphan modal');
  assert.match(a, /memberCount > 0[\s\S]{0,1400}?typeName: ws\.slug/, 'the 0-member path misses the slug type-to-confirm');
});

/* (b) disposition state shape */
test('govDispositions entries are keyed by userId with the exact reassign/release shapes', () => {
  const a = actions();
  assert.match(a, /S\.ui\.govDispositions\[uidm\] = \{ type: 'release' \}/, 'release shape missing');
  assert.match(a, /S\.ui\.govDispositions\[uidm\] = \{ type: 'reassign', wsId: [^}]+role: 'member' \}/, 'reassign shape missing (default member role)');
  const p = page();
  assert.match(p, /data-in="govDest" data-id="\$\{esc\(m\.userId\)\}"/, 'destination select not keyed by userId');
  assert.match(p, /data-in="govRole" data-id="\$\{esc\(m\.userId\)\}"/, 'role select not keyed by userId');
});

/* (c) block-until-resolved footer */
test('the orphan modal Delete button is disabled while any member lacks a disposition (D-06)', () => {
  const p = page();
  assert.match(p, /const unresolved = members\.some\(m => !disp\[m\.userId\]\);/);
  assert.match(p, /data-a="govOrphanSubmit" \$\{unresolved \? 'disabled' : ''\}/, 'the footer Delete button is not gated on full resolution');
  const a = actions();
  assert.match(a, /const missing = o\.members\.some\(m => !S\.ui\.govDispositions\?\.\[m\.userId\]\);/, 'the submit guard (second lock) is missing');
  assert.match(a, /if \(missing\) return;/);
});

/* (d) submit carries the dispositions array in the delete body */
test('govOrphanSubmit sends the per-member dispositions array through operatorWsDelete', () => {
  const a = actions();
  assert.match(a, /const dispositions = o\.members\.map\(m => \(\{ userId: m\.userId, \.\.\.S\.ui\.govDispositions\[m\.userId\] \}\)\);/);
  assert.match(a, /govDelete\(o\.ws\.id, dispositions\)/);
  const api = src('src/core/api.js');
  assert.match(api, /async operatorWsDelete\(id, dispositions\) \{\s*return call\('POST', `\/api\/auth\/operator\/workspaces\/\$\{encodeURIComponent\(id\)\}\/delete`, \{ dispositions \}\);/, 'the delete body does not carry dispositions');
});

/* (e) three refusals → three distinct keys */
test('the three delete-path refusal codes map to three DISTINCT keyed err toasts (Pitfall 5)', () => {
  const a = actions();
  const m = a.match(/const keyed = \[([^\]]+)\]\.includes\(code\);/);
  assert.ok(m, 'the keyed refusal list is missing');
  const keys = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
  assert.deepEqual(keys.sort(), ['dispositionRequired', 'memberAlreadyMember', 'workspaceNotEmpty'], 'the keyed list is not the three refusal codes');
  assert.match(a, /t\('err\.' \+ code\)/, 'the keyed lookup is missing');
  for (const k of keys) {
    assert.ok(en[`err.${k}`] && fr[`err.${k}`] && nl[`err.${k}`] && de[`err.${k}`] && es[`err.${k}`], `err.${k} missing from a catalogue`);
  }
});

/* (f) exact-match type-to-confirm gating */
test('confirmModal typeName exact-match gates archive/delete OK — mixed-case slug does not enable it (D-04/T-79-09)', () => {
  const modals = src('src/overlays/modals.js');
  assert.match(modals, /const ok = !needs \|\| \(S\.ui\.confirmText \|\| ''\) === needs;/, 'the exact-match OK gate moved');
  const act = src('src/actions/actions.js');
  assert.match(act, /A\.confirmOk = \(\) => \{\s*const m = S\.ui\.modals\[S\.ui\.modals\.length - 1\];\s*if \(m\.typeName && S\.ui\.confirmText !== m\.typeName\) return;/, 'the confirmOk exact-match guard moved');
  // no case-insensitive shortcut anywhere on the confirm path
  assert.doesNotMatch(modals + act, /confirmText[\s\S]{0,80}toLowerCase\(\)/, 'a case-insensitive confirm bypass exists');
  // archive + delete asks carry the slug as typeName; release carries the email
  assert.match(act, /typeName: ws\.slug,[\s\S]{0,200}?run: async \(\) => \{\s*const res = await api\.operatorWsArchive/ , 'archive ask misses the slug typeName');
  assert.match(act, /typeName: email/, 'release ask misses the email typeName');
});

/* (g) long-text backstop: the row keeps .trunc on name/slug/creator cells */
test('a 200-char workspace name and a long email cannot break the .perm-t row (backstop pin)', () => {
  const p = page();
  // the three payload-text cells each ride .trunc with a bounded max-width
  assert.match(p, /class="trunc" style="display:inline-block;max-width:\d+px[^"]*font-weight:600">\$\{esc\(w\.name\)\}/, 'the name cell lost .trunc');
  assert.match(p, /class="mono faint trunc"[^>]*>\$\{esc\(w\.slug \|\| '—'\)\}/, 'the slug cell lost .trunc');
  assert.match(p, /w\.creator \? `<span class="trunc"[^>]*>\$\{esc\(w\.creator\.name\)\}/, 'the creator cell lost .trunc');
  // every payload interpolation in the row goes through esc()
  const row = p.match(/const wsRow = w => \{[\s\S]*?\n\};/);
  assert.ok(row, 'wsRow not found');
  assert.doesNotMatch(row[0], /\$\{w\.(name|slug|creator\.name|createdAt|id|memberCount)\}/, 'a payload string escapes escaping in wsRow');
});

/* (h) honest 403 fullstate for a non-operator deep link */
test('a non-operator deep link renders the 403 fullstate (lock, err.code403, err.operatorOnly, home)', () => {
  const p = page();
  assert.match(p, /S\.ui\.govWsErr\?\.status === 403\) return full403\(\)/, 'the 403 branch is missing');
  const f = p.match(/const full403 = \(\) =>[\s\S]*?`;/);
  assert.ok(f, 'full403 not found');
  for (const frag of ["ic('lock', 20)", "t('err.code403')", "t('err.operatorOnly')", 'data-a="go" data-r="home"']) {
    assert.ok(f[0].includes(frag), `full403 misses ${frag}`);
  }
});
