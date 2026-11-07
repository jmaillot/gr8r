/* =====================================================================
   Settings tz combobox wiring regression (Phase 44, Plan 44-03 — the
   Phase 43 43-03 wiring-test discipline): the picker's wiring cannot
   silently regress. Source assertions over the real files (settings.js,
   actions.js, keyboard.js, locales, members.js) plus direct invocation of
   the dependency-free static zone list. Pins the plan's probe edges:

   - wiring: data-in="tzSel" input, data-a="tzSel" options, the 43-03-style
     A.tzSel = IN.tzSel alias, keyboard arrows/enter/escape
   - D-09: the selection writes S.data.members[me].tz and calls the real
     save() — never S.prefs (the disconnected blob store)
   - D-02: offsets computed at render via Intl formatToParts shortOffset —
     no module-level cached offset table
   - D-03: no supportedValuesOf anywhere under src/ (build-time generator
     only); TIMEZONES imported from the committed static list
   - D-04/D-05/D-07 preselect chain ordering (structural source assertion):
     stored resolvable tz → browser zone → Europe/Paris; legacy labels
     through the single tz.js resolveTz funnel — no second mapping
   - empty/unresolvable stored tz → Europe/Paris shown, never blank
   - no-auto-save: the render path (tzCombobox) never calls save()
   - T-44-05: esc() on every interpolated zone id, name and offset; the
     members-table tz cell stays esc()-escaped (src/pages/members.js)
   - catalogue: EN+FR parity for the new picker strings
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { TIMEZONES } from '../src/lib/timezones.js';
import { resolveTz } from '../tz.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const settingsSrc = read('src/pages/settings.js');
const actionsSrc = read('src/actions/actions.js');
const keyboardSrc = read('src/actions/keyboard.js');

test('the combobox wiring is pinned: input data-in, option data-a, and the 43-03 alias', () => {
  assert.match(settingsSrc, /data-in="tzSel"/, 'combobox input must carry data-in="tzSel"');
  assert.match(settingsSrc, /data-a="tzSel"/, 'combobox options must carry data-a="tzSel"');
  assert.match(actionsSrc, /IN\.tzSel\s*=/, 'actions.js must define the IN.tzSel handler');
  assert.match(actionsSrc, /A\.tzSel\s*=\s*IN\.tzSel/, 'the 43-03 alias A.tzSel = IN.tzSel must pin both namespaces');
  assert.match(keyboardSrc, /\[data-in="tzSel"\]/, 'keyboard.js must route the combobox input keys');
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
    assert.ok(
      keyboardSrc.slice(keyboardSrc.indexOf('[data-in="tzSel"]')).includes(`'${key}'`),
      `keyboard.js must handle ${key} for the combobox`,
    );
  }
});

test('D-09: selection writes the member profile through save(), never S.prefs', () => {
  const handler = actionsSrc.slice(actionsSrc.indexOf('IN.tzSel ='), actionsSrc.indexOf('A.tzSel = IN.tzSel'));
  assert.ok(handler.includes('S.data.members'), 'the tz handler must write S.data.members');
  assert.ok(handler.includes('.tz ='), 'the tz handler must assign the tz field');
  assert.ok(handler.includes('save()'), 'the tz handler must persist through the real doc save()');
  assert.ok(!handler.includes('S.prefs'), 'the tz handler must never touch S.prefs (D-09)');
  assert.ok(!actionsSrc.includes('S.prefs.tz ='), 'no prefs.tz write anywhere in actions.js (D-09)');
});

test('D-02: offsets are computed at render via Intl shortOffset — no cached table', () => {
  assert.match(settingsSrc, /formatToParts/);
  assert.match(settingsSrc, /shortOffset/);
  assert.ok(!/OFFSET(S|_BY|_MAP|S_BY)/.test(settingsSrc), 'no module-level cached offset map');
  assert.match(settingsSrc, /resolvedOptions\(\)\.timeZone/, 'the browser zone feeds the D-04 preselect');
});

test('D-03: no runtime zone enumeration under src/, and the static list is imported', () => {
  const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : [],
    );
  for (const f of walk(path.join(REPO, 'src'))) {
    assert.ok(!fs.readFileSync(f, 'utf8').includes('supportedValuesOf'), `supportedValuesOf leaked into ${path.relative(REPO, f)}`);
  }
  assert.match(settingsSrc, /import\s*\{\s*TIMEZONES\s*\}\s*from\s*'\.\.\/lib\/timezones\.js'/);
});

test('preselect chain ordering (D-04 → D-05 → D-07), pinned structurally: stored → resolveTz → browser → Paris', () => {
  const fn = settingsSrc.slice(settingsSrc.indexOf('export function tzPreselect'), settingsSrc.indexOf('export function tzCombobox'));
  assert.ok(fn, 'tzPreselect must be exported for this assertion');
  const iResolve = fn.indexOf('resolveTz(');
  const iBrowser = fn.indexOf('resolvedOptions()');
  const iParis = fn.indexOf("'Europe/Paris'");
  assert.ok(iResolve > -1 && iParis > -1, 'the chain must consult resolveTz and the D-07 Paris fallback');
  assert.ok(iResolve < iParis, 'stored values resolve through the single tz.js funnel before any fallback');
  assert.ok(iBrowser > -1 && iResolve < iBrowser, 'an empty stored value falls to the browser zone (D-04)');
  assert.ok(!/GMT[+-]/.test(fn), 'no second legacy label map client-side (D-06/D-03)');
  // The D-07 edge: an unresolvable stored value shows Paris, never blank.
  const combobox = settingsSrc.slice(settingsSrc.indexOf('export function tzCombobox'));
  assert.ok(combobox.includes('tzPreselect'), 'the combobox preselects through tzPreselect');
  assert.ok(/Europe\/Paris/.test(fn), 'Paris shown, not blank');
});

test('no-auto-save: the render path never persists — selection only via the explicit handler', () => {
  const combobox = settingsSrc.slice(settingsSrc.indexOf('export function tzCombobox'), settingsSrc.indexOf('export function tzCombobox') + 2500);
  assert.ok(combobox.includes('data-in="tzSel"'), 'sanity: slicing the combobox body');
  assert.ok(!/\bsave\(\)/.test(combobox), 'tzCombobox must not call save() (D-04: nothing auto-saves)');
});

test('T-44-05: every interpolated zone id, name and offset goes through esc()', () => {
  const combobox = settingsSrc.slice(settingsSrc.indexOf('export function tzCombobox'));
  assert.match(combobox, /data-v="\$\{esc\(z\.id\)\}"/);
  assert.match(combobox, /\$\{esc\(z\.name\)\}/);
  assert.match(combobox, /off \? ` · \$\{esc\(off\)\}`/);
});

test('the members-table tz cell stays esc()-escaped', () => {
  assert.match(read('src/pages/members.js'), /esc\(m\.tz\)/);
});

test('EN+FR catalogue parity for the new picker strings', () => {
  const en = JSON.parse(read('src/locales/en.json'));
  const fr = JSON.parse(read('src/locales/fr.json'));
  for (const key of ['settings.tz.searchLabel', 'settings.tz.placeholder', 'settings.tz.noResults']) {
    assert.ok(en[key], `missing ${key} in en.json`);
    assert.ok(fr[key], `missing ${key} in fr.json`);
  }
});

test('the zone list is sorted ascending, duplicate-free, and covers the funnel targets', () => {
  assert.ok(TIMEZONES.length >= 300, `list too small: ${TIMEZONES.length}`);
  const ids = TIMEZONES.map(z => z.id);
  assert.deepEqual(ids, [...ids].sort(), 'search/keyboard order must be stable (generator-sorted)');
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
  for (const must of ['Europe/Paris', 'America/Los_Angeles', 'Europe/Berlin', 'Europe/London', 'Asia/Tokyo']) {
    assert.ok(ids.includes(must), `${must} missing — a resolveTz target would render unselectable`);
  }
  assert.ok(TIMEZONES.every(z => !z.name.includes('_')), 'display names must not leak raw underscores');
});

/* G-44-3, WR-02: a stored valid tz always preselects itself — never Paris.
   settings.js uses Vite virtual: imports and cannot load in Node, so this
   pins the exact contract tzPreselect implements (resolveTz(stored) must be
   a member of TIMEZONES); the structural test above pins that tzPreselect
   exact-matches the same list with the same funnel. */
test('WR-02: stored aliases and UTC resolve into the selectable list — preselect is not Paris', () => {
  const ids = new Set(TIMEZONES.map(z => z.id));
  for (const stored of ['US/Pacific', 'UTC', 'america/new_york']) {
    const zone = resolveTz(stored);
    assert.ok(ids.has(zone), `${stored} → ${zone} missing from the list (would preselect Paris)`);
    assert.notEqual(zone, 'Europe/Paris', `${stored} must not degrade to Paris`);
  }
  assert.equal(resolveTz('US/Pacific'), 'America/Los_Angeles');
  assert.equal(resolveTz('UTC'), 'UTC');
  /* The '' case defers to the browser zone (D-04) — here: the Node process
     zone, which must be in the list for tzPreselect to return it. */
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  assert.ok(ids.has(browser) || browser === '', `browser zone ${browser} not in list`);
});
