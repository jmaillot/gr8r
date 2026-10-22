/* =====================================================================
   test: i18n-search — the search contract: the folding, the highlight
   window and the unchanged sort order.

   "elodie" must find "Élodie" (SEARCH-01, D-06): the comparison folds
   BOTH sides with foldForSearch() — lower-case, NFD, then the
   combining marks are dropped — and the highlight window is computed
   on the SAME folded string and mapped back to the ORIGINAL
   characters, so the <mark> lands on the right characters.

   The sort order is NOT part of this change: the only localeCompare in
   the tree (src/views/files.js) stays exactly where it is, and no
   Intl.Collator is introduced anywhere under src/ (D-06 defers it).

   The sources import `virtual:icons` (a Vite virtual module), so the
   suite registers the resolver hook in test/helpers/ first and then
   imports the real modules — the browser code runs as shipped, not a
   re-implementation.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { test } from 'node:test';

register(new URL('./helpers/virtual-icons-loader.mjs', import.meta.url));

/* The browser modules read `document`, `navigator` and `localStorage` while they
   load, so those globals are stubbed before the modules are imported dynamically. */
globalThis.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  addEventListener: () => {},
  body: {},
  title: '',
};
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
  writable: true,
});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};

const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const utils = await import('../src/core/utils.js');
const helpers = await import('../src/ui/helpers.js');
const { foldForSearch } = utils;
const { hl } = helpers;

/* ---------- the folding helper ---------- */

test('foldForSearch folds "Élodie" to "elodie" and maps every folded character back to the original index', () => {
  const f = foldForSearch('Élodie');
  assert.equal(f.text, 'elodie');
  assert.equal(f.text.length, 6);
  assert.deepEqual(f.map, [0, 1, 2, 3, 4, 5]);
});

test('foldForSearch returns the { text, map } shape and folds an emptyish input to an empty text', () => {
  for (const input of [null, undefined, '']) {
    const f = foldForSearch(input);
    assert.deepEqual(Object.keys(f).sort(), ['map', 'text']);
    assert.equal(f.text, '');
    assert.deepEqual(f.map, []);
  }
});

test('a combining mark contributes no folded character, and the map reports the original index of the character that carried it', () => {
  const f = foldForSearch('e\u0301lodie'); /* é as e + U+0301 — 7 source characters */
  assert.equal(f.text, 'elodie');
  /* folded 'e' ← source 0; the mark at source 1 is dropped; 'l' ← source 2, … */
  assert.deepEqual(f.map, [0, 2, 3, 4, 5, 6]);
});

test('a precomposed accented character folds to one folded character at its own index', () => {
  const f = foldForSearch('Céline');
  assert.equal(f.text, 'celine');
  assert.deepEqual(f.map, [0, 1, 2, 3, 4, 5]);
});

test('a character whose lower-case form is longer (İ) folds to a single character and the map stays exact', () => {
  const f = foldForSearch('İstanbul');
  assert.equal(f.text, 'istanbul');
  /* 'İ' lower-cases to i + U+0307 (two units); the i folds to one character at original
     index 0 and the combining dot is dropped, so the next entry is the 's' at index 2 —
     every folded character reports the ORIGINAL index it came from. */
  assert.deepEqual(f.map, [0, 2, 3, 4, 5, 6, 7, 8]);
});

/* ---------- the highlight ---------- */

test('hl("Élodie", "elodie") marks the accented character itself, not the character after it', () => {
  assert.equal(hl('Élodie', 'elodie'), '<mark>Élodie</mark>');
});

test('hl and its unaccented twin highlight the same window: both wrap the whole text in one mark', () => {
  assert.equal(hl('Élodie', 'elodie'), '<mark>Élodie</mark>');
  assert.equal(hl('elodie', 'elodie'), '<mark>elodie</mark>');
});

test('the highlight window maps back through a combining mark to the original characters', () => {
  /* 'e\u0301lodie' is 7 source characters folding to 6; the query 'elod' matches 4 folded
     characters whose mapped window is the 5 original units 'e\u0301lod' — a window computed
     on the folded text alone would slice only 'e\u0301lo' and land one character short. */
  assert.equal(hl('e\u0301lodie', 'elod'), '<mark>e\u0301lod</mark>ie');
  /* a full match marks the whole word, the mark's end mapped back past the combining mark */
  assert.equal(hl('e\u0301lodie', 'elodie'), '<mark>e\u0301lodie</mark>');
});

test('hl escapes the text it does not mark, exactly once', () => {
  assert.equal(hl('Tom & Élodie', 'elodie'), 'Tom &amp; <mark>Élodie</mark>');
});

test('a query that matches nothing returns the escaped text with no mark at all', () => {
  assert.equal(hl('A <b>bold</b> claim', 'zzz'), 'A &lt;b&gt;bold&lt;/b&gt; claim');
  assert.equal(hl('Nothing here', 'zzz'), 'Nothing here');
});

test('an empty query returns the escaped text with no mark', () => {
  assert.equal(hl('Anything <x>', ''), 'Anything &lt;x&gt;');
  assert.equal(hl('Anything <x>', undefined), 'Anything &lt;x&gt;');
});

/* ---------- the call sites keep their signature ---------- */

test('the five search call sites still call hl(text, query) with the same signature', () => {
  const s = source('src/pages/search.js');
  for (const site of ['hl(t.title, q)', 'hl(p.name, q)', 'hl(m.name, q)', 'hl(f.name, q)', 'hl(c.text, q)'])
    assert.ok(s.includes(site), `search.js must keep calling ${site}`);
});

/* ---------- the global search folds both sides ---------- */

const store = await import('../src/core/store.js');
const { searchAll } = await import('../src/pages/search.js');

/* The suite seeds one accented fixture of each kind, once. The queries the other
   assertions use are distinctive enough that these fixtures cannot leak into their
   results, and the fixtures' emails/keys avoid the query strings so only the folded
   NAME can match. */
const d = store.D();
d.members.push({
  id: 'm-elo',
  name: 'Élodie',
  email: 'e.laurent@gr8r.dev',
  role: 'Member',
  title: 'Designer',
  c: '#123456',
  status: 'active',
  last: 0,
});
d.projects.push({
  id: 'p-elo',
  key: 'ELN',
  name: 'Élan',
  icon: 'globe',
  color: 'indigo',
  status: 'active',
  lead: 'm1',
  members: ['m1'],
  desc: 'Accent fixtures for the search suite',
  last: 0,
  due: '2026-11-01',
});
d.projOrder.push('p-elo');
d.tasks.push({
  id: 't-elo',
  key: 'ELN-1',
  project: 'p-elo',
  title: 'Élodie onboarding',
  status: 'todo',
  priority: 'none',
  desc: 'plain text body',
  created: 0,
  updated: 0,
  order: 99,
});
d.files.push({ id: 'f-elo', project: 'p-elo', name: 'élodie-notes.md', type: 'doc', size: '1 KB', by: 'm1', at: 0 });
d.comments.push({ id: 'c-elo', task: 't-elo', by: 'm1', at: 0, text: 'élodie says hi' });

test('searchAll("elodie") finds the task, the member, the file and the comment whose text is accented', () => {
  const r = searchAll('elodie');
  assert.deepEqual(
    r.tasks.map(t => t.title),
    ['Élodie onboarding'],
  );
  assert.deepEqual(
    r.people.map(m => m.name),
    ['Élodie'],
  );
  assert.deepEqual(
    r.files.map(f => f.name),
    ['élodie-notes.md'],
  );
  assert.deepEqual(
    r.comments.map(c => c.text),
    ['élodie says hi'],
  );
});

test('searchAll("elan") finds the project named "Élan"', () => {
  assert.deepEqual(
    searchAll('elan').projects.map(p => p.name),
    ['Élan'],
  );
});

test('an empty query returns five empty collections, exactly as before', () => {
  for (const q of ['', '   ']) {
    const r = searchAll(q);
    assert.deepEqual(r, { tasks: [], projects: [], people: [], files: [], comments: [] });
  }
});

test('a query that matched nothing before still matches nothing', () => {
  assert.deepEqual(searchAll('zzzquux'), { tasks: [], projects: [], people: [], files: [], comments: [] });
});

test('the query is folded ONCE before the filter runs, and the search never sorts', () => {
  const s = source('src/pages/search.js');
  assert.ok(s.includes("const needle = foldForSearch((q || '').trim()).text;"), 'the query must be folded once, before the filter — the trim() stays');
  assert.ok(s.includes('const has = s => foldForSearch(s).text.includes(needle);'), 'every candidate must be folded as it is tested');
  assert.ok(!/\.sort\(|localeCompare|Collator/.test(s), 'the search must not sort — the order is untouched (D-06)');
});

/* ---------- the eight other filters fold both sides ---------- */

const { S } = store;
const { pageMembers } = await import('../src/pages/members.js');
const { pageProjects } = await import('../src/pages/projects.js');
const { filesHtml } = await import('../src/views/files.js');
const { applyView } = await import('../src/shell/view-engine.js');
const { popList } = await import('../src/overlays/popovers.js');
const { paletteItems } = await import('../src/overlays/palette.js');
const { shareModal } = await import('../src/overlays/modals.js');

test('the member filter folds both sides: "elodie" finds "Élodie" through her name alone', () => {
  S.ui.memQ = 'elodie';
  assert.ok(pageMembers().includes('Élodie'), 'the accented member must be found from the unaccented query');
  S.ui.memQ = 'sarah';
  assert.ok(pageMembers().includes('Sarah Chen'), 'an unaccented query still finds its member');
  S.ui.memQ = '';
});

test('the project filter folds both sides: "elan" finds "Élan"', () => {
  S.ui.projQ = 'elan';
  assert.ok(pageProjects().includes('Élan'), 'the accented project must be found from the unaccented query');
  S.ui.projQ = 'website';
  assert.ok(pageProjects().includes('Website Redesign'), 'an unaccented query still finds its project');
  S.ui.projQ = '';
});

test('the project list still sorts with the same plain comparison it uses today', () => {
  assert.ok(
    source('src/pages/projects.js').includes('ps.sort((a, b) => (sorter(a) > sorter(b) ? 1 : -1));'),
    'the plain > comparator must not be replaced (D-06)',
  );
});

test('the file filter folds both sides: "elodie" finds "élodie-notes.md"', () => {
  S.ui.fileQ = 'elodie';
  assert.ok(filesHtml('p-elo').includes('élodie-notes.md'), 'the accented file must be found from the unaccented query');
  S.ui.fileQ = 'wireframes';
  assert.ok(filesHtml('p1').includes('homepage-wireframes-v3.fig'), 'an unaccented query still finds its file');
  S.ui.fileQ = '';
});

test('the file list still sorts by name with the same localeCompare, and no Intl.Collator exists anywhere under src/', () => {
  const walk = dir =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
  for (const file of walk(path.join(ROOT, 'src')))
    assert.ok(!source(path.relative(ROOT, file).split(path.sep).join('/')).includes('Intl.Collator'), `${file} must not use Intl.Collator (D-06)`);
  const s = source('src/views/files.js');
  assert.ok(s.includes('a.name.localeCompare(b.name)'), 'the name sort keeps its localeCompare');
  assert.ok(s.includes('a.type.localeCompare(b.type)'), 'the type sort keeps its localeCompare');
});

test('the saved-view filter folds both sides: the view query "elodie" keeps the task titled "Élodie onboarding"', () => {
  const elo = { id: 't-elo', title: 'Élodie onboarding', key: 'ELN-1', order: 99 };
  const out = applyView([elo], { q: 'elodie', filters: [], sort: { f: 'manual', dir: 1 } });
  assert.deepEqual(
    out.map(t => t.title),
    ['Élodie onboarding'],
  );
  const plain = applyView([{ id: 't-x', title: 'Onboarding plain', key: 'WEB-9', order: 1 }, elo], {
    q: 'onboarding',
    filters: [],
    sort: { f: 'manual', dir: 1 },
  });
  assert.equal(plain.length, 2, 'an unaccented query still keeps every task it kept before');
});

test('the popover filter folds both sides: "elodie" keeps the item named "Élodie"', () => {
  S.ui.pop = { q: 'elodie' };
  const html = popList([{ id: 'x', name: 'Élodie', act: 'popPick' }]);
  assert.ok(html.includes('Élodie'), 'the accented item must survive the filter');
  assert.ok(!html.includes('No matches'), 'the filter must not report no matches');
  S.ui.pop = { q: 'sarah' };
  assert.ok(popList([{ id: 'y', name: 'Sarah Chen' }]).includes('Sarah Chen'), 'an unaccented query still keeps its item');
  S.ui.pop = null;
});

test('the palette folds both sides: searching "elodie" surfaces the task "Élodie onboarding"', () => {
  S.ui.palette = { mode: 'search', q: 'elodie', scope: 'all' };
  assert.ok(JSON.stringify(paletteItems()).includes('Élodie onboarding'), 'the palette search must find the accented task');
  S.ui.palette = null;
});

test("the palette's own command and workspace filters fold both sides", () => {
  const s = source('src/overlays/palette.js');
  assert.ok(s.includes('foldForSearch'), 'palette.js must fold through the shared helper');
  assert.ok(!s.includes('w.name.toLowerCase().includes(ql)'), 'the workspace filter must not compare raw lower-cased strings');
  assert.ok(!s.includes('c.name.toLowerCase().includes(ql)'), 'the command filter must not compare raw lower-cased strings');
});

test('the share-modal member filter folds both sides: "elodie" finds "Élodie"', () => {
  S.ui.shareQ = 'elodie';
  const html = shareModal({ id: 'p1' }, t => `<h2>${t}</h2>`);
  assert.ok(html.includes('Élodie'), 'the accented member must be offered for sharing');
  assert.ok(!html.includes('No matching members'), 'the modal must not report no matching members');
  S.ui.shareQ = 'zzzquux';
  assert.ok(shareModal({ id: 'p1' }, t => t).includes('No matching members'), 'a query that matched nothing before still matches nothing');
  S.ui.shareQ = '';
});
