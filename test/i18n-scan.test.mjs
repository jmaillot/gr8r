/* =====================================================================
   test: i18n-scan — the contract of the static source scan.

   The suite runs against a TEMPORARY FIXTURE TREE, not against the live
   sources: the live tree changes in every later wave, and a contract test
   that fails because a string moved is a contract test that stops being
   read. The one exception is the machine-identifier guard, which MUST run
   against the live tree: it is the tripwire that catches a rule growing
   broad enough to report a machine identifier.
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

import { scanSource, scanTree, compare, EXCLUDED_FILES, main } from '../scripts/i18n-scan.mjs';

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/* A temporary tree: the suite never reads the live sources. */
function fixtureTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-scan-'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
  return dir;
}

const texts = findings => findings.map(f => f.text).sort();

/* ---------- the measured instances of the display-label class ----------
   The excerpts are copied VERBATIM from the real files. The scan must
   report exactly these labels — no more, no fewer. */
const REAL_INSTANCES = [
  {
    file: 'src/overlays/popovers.js',
    line: 280,
    snippet:
      "          ['manual', 'Manual'],\n          ['priority', 'Priority'],\n          ['due', 'Due date'],\n          ['start', 'Start date'],\n          ['title', 'Title'],\n          ['status', 'Status'],\n          ['assignee', 'Assignee'],\n          ['created', 'Created'],",
    expected: ['Manual', 'Priority', 'Due date', 'Start date', 'Title', 'Status', 'Assignee', 'Created'],
  },
  {
    file: 'src/main.js',
    line: 78,
    snippet: "      action: 'Reload',",
    expected: ['Reload'],
  },
  {
    file: 'src/main.js',
    line: 85,
    snippet: "    action: 'Retry',",
    expected: ['Retry'],
  },
  {
    file: 'src/ui/select.js',
    line: 21,
    snippet: "      sel.getAttribute('aria-label') || (sel.id && document.querySelector(`label[for=\"${CSS.escape(sel.id)}\"]`)?.textContent) || 'Choose',",
    expected: ['Choose'],
  },
  {
    file: 'src/core/store.js',
    line: 251,
    snippet: "export const roleLabel = role => ROLE_LABELS[role] || 'Member';",
    expected: ['Member'],
  },
  {
    file: 'src/ui/helpers.js',
    line: 74,
    snippet:
      "export const FT = {\n  fig: { c: '#8662C9', i: 'pen-tool', n: 'Figma' },\n  pdf: { c: '#C4473A', i: 'file-text', n: 'PDF' },\n  zip: { c: '#6B7280', i: 'folder-archive', n: 'Archive' },\n  img: { c: '#23918A', i: 'image', n: 'Image' },\n  sheet: { c: '#3D8E5F', i: 'file-spreadsheet', n: 'Spreadsheet' },\n  doc: { c: '#3B82C4', i: 'file-text', n: 'Document' },\n  code: { c: '#C48A1E', i: 'file-code', n: 'Code' },\n  other: { c: '#6B7280', i: 'file', n: 'File' },\n};",
    expected: ['Figma', 'PDF', 'Archive', 'Image', 'Spreadsheet', 'Document', 'Code', 'File'],
  },
];

/* The excerpts that must report NOTHING: the machine identifiers. */
const MACHINE_INSTANCES = [
  { file: 'src/overlays/popovers.js', snippet: '`<button data-a="setSort"></button>`' },
  { file: 'src/overlays/popovers.js', snippet: '`<button data-a="go" data-r="home"></button>`' },
  { file: 'src/overlays/popovers.js', snippet: '`<button data-a="setPref" data-v="1"></button>`' },
  { file: 'src/shell/layout.js', snippet: '`<span class="mi"></span>`' },
  { file: 'src/shell/layout.js', snippet: '`<button class="tab-btn"></button>`' },
  { file: 'src/core/utils.js', snippet: "import { esc } from '../core/utils.js';" },
  { file: 'src/core/icons.js', snippet: "const el = ic('circle-alert', 13);" },
  { file: 'src/core/store.js', snippet: "const isOwner = role === 'Owner';" },
  { file: 'src/core/store.js', snippet: "const map = { owner: 'Owner', admin: 'Admin' };" },
  { file: 'src/core/store.js', snippet: "const admin = ['Owner', 'Admin'].includes(role);" },
  { file: 'src/core/theme.js', snippet: "el.style.setProperty('--bg', '#fff');" },
  { file: 'src/core/api.js', snippet: "const r = await call('GET', '/api/config');" },
  { file: 'src/pages/settings.js', snippet: "sel('tz', ['(GMT+00:00) London'], P.tz)" },
  { file: 'src/pages/settings.js', snippet: "sel('lang', ['English (US)', 'Deutsch'], P.lang)" },
  { file: 'src/core/i18n.js', snippet: "const key = 'a11y.dismiss';" },
  { file: 'src/actions/keyboard.js', snippet: "if (e.key === 'Enter') go();" },
  { file: 'src/ui/helpers.js', snippet: "const FT = { fig: { i: 'pen-tool' } };" },
];

/* ---------- the module contract ---------- */

test('the scanner exports its contract and imports nothing but node:fs, node:path and node:url', () => {
  assert.equal(typeof scanTree, 'function');
  assert.equal(typeof scanSource, 'function');
  assert.equal(typeof main, 'function');
  assert.ok(EXCLUDED_FILES instanceof Set);
  assert.deepEqual([...EXCLUDED_FILES], ['src/data/seed.js']);
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts/i18n-scan.mjs'), 'utf8');
  const imports = [...source.matchAll(/^import\s+(?:.*?from\s+)?'([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual([...new Set(imports)].sort(), ['node:fs', 'node:path', 'node:url']);
});

test('the scanner walks a tree and reports one finding per occurrence', () => {
  const dir = fixtureTree({
    'src/a.js': 'const x = `<button aria-label="Dismiss">Skip to content</button>`;\n',
    'src/data/seed.js': "const seed = 'Website Redesign';\n",
  });
  const findings = scanTree(dir, { catalogue: {} });
  const files = new Set(findings.map(f => f.file));
  assert.ok(!files.has(path.join(dir, 'src/data/seed.js')));
  assert.ok(findings.some(f => f.text === 'Dismiss'));
  assert.ok(findings.some(f => f.text === 'Skip to content'));
});

/* ---------- the rule families ---------- */

test('the scanner reports an HTML text node, a display attribute, a toast, an empty() title, a display name and a prose literal', () => {
  const source = [
    'const html = `<button aria-label="Dismiss">Skip to content</button>`;',
    "toast('Saved');",
    "empty('list-checks', 'No tasks here', 'Add a task to get things moving.');",
    "const STATUSES = [{ id: 'backlog', name: 'Backlog' }];",
    "const msg = 'Your changes could not be saved.';",
  ].join('\n');
  const found = scanSource(source, 'src/x.js', { catalogue: {} });
  const reported = texts(found);
  assert.ok(reported.includes('Skip to content'));
  assert.ok(reported.includes('Dismiss'));
  assert.ok(reported.includes('Saved'));
  assert.ok(reported.includes('No tasks here'));
  assert.ok(reported.includes('Add a task to get things moving.'));
  assert.ok(reported.includes('Backlog'));
  assert.ok(reported.includes('Your changes could not be saved.'));
});

test('the scanner decodes an HTML entity before reporting it', () => {
  const found = scanSource('const x = `<p>Create account &amp; join</p>`;', 'src/x.js', { catalogue: {} });
  const reported = texts(found);
  assert.ok(reported.includes('Create account & join'));
  assert.ok(!reported.includes('Create account &amp; join'));
});

test('the scanner reports each one of the REAL_INSTANCES excerpts and nothing else', () => {
  for (const instance of REAL_INSTANCES) {
    const found = scanSource(instance.snippet, instance.file, { catalogue: {} });
    assert.deepEqual(texts(found), [...instance.expected].sort(), `${instance.file}:${instance.line}`);
  }
});

test('the scanner reports NOTHING for the MACHINE_INSTANCES excerpts', () => {
  for (const instance of MACHINE_INSTANCES) {
    const found = scanSource(instance.snippet, instance.file, { catalogue: {} });
    assert.deepEqual(texts(found), [], `${instance.file}: ${instance.snippet}`);
  }
});

test('the scanner never reports a data-*, class, id, href or style value', () => {
  const source = [
    '`<button data-a="setSort" data-r="home" data-v="1" data-k="accent" class="mi" id="row-1" href="/w/acme" style="color:red">Label</button>`',
  ].join('\n');
  const found = scanSource(source, 'src/x.js', { catalogue: {} });
  assert.deepEqual(texts(found), ['Label']);
});

/* ---------- the catalogue-key family ---------- */

test('a t() key the English catalogue does not carry is an unresolved violation', () => {
  const source = ["import { t } from '../core/i18n.js';", "const label = t('a11y.doesNotExist');"].join('\n');
  const found = scanSource(source, 'src/x.js', { catalogue: { 'a11y.dismiss': 'Dismiss' } });
  const unresolved = found.filter(f => f.kind === 'unresolved');
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].text, 'a11y.doesNotExist');
});

test('a t() call site whose vars do not match the value placeholders is a placeholder-mismatch violation', () => {
  const source = ["import { t } from '../core/i18n.js';", "const label = t('a11y.dismiss', { name: 'x' });"].join('\n');
  const found = scanSource(source, 'src/x.js', { catalogue: { 'a11y.dismiss': 'Dismiss {title}' } });
  assert.equal(found.filter(f => f.kind === 'placeholder-mismatch').length, 1);
  const ok = scanSource(["import { t } from '../core/i18n.js';", "const label = t('a11y.dismiss', { title: 'x' });"].join('\n'), 'src/x.js', {
    catalogue: { 'a11y.dismiss': 'Dismiss {title}' },
  });
  assert.equal(ok.filter(f => f.kind === 'placeholder-mismatch').length, 0);
});

test('a dynamic t() key is not a literal key and is not reported', () => {
  const source = ["import { t } from '../core/i18n.js';", "const label = t('nav.route.' + id);"].join('\n');
  const found = scanSource(source, 'src/x.js', { catalogue: { 'nav.route.home': 'Home' } });
  assert.equal(found.filter(f => f.kind === 'unresolved' || f.kind === 'placeholder-mismatch').length, 0);
});

/* ---------- the CLI verdicts ---------- */

test('a finding covered by the allow-list is accepted, an unlisted finding and a stale entry are violations', () => {
  const findings = scanSource("toast('Saved');", 'src/x.js', { catalogue: {} });
  const covered = compare(findings, [{ file: 'src/x.js', text: 'Saved' }]);
  assert.equal(covered.unlisted.length, 0);
  assert.equal(covered.stale.length, 0);
  assert.equal(covered.pending.length, 1);

  const unlisted = compare(findings, []);
  assert.equal(unlisted.unlisted.length, 1);
  assert.equal(unlisted.unlisted[0].text, 'Saved');

  const stale = compare(findings, [
    { file: 'src/x.js', text: 'Saved' },
    { file: 'src/x.js', text: 'Gone' },
  ]);
  assert.equal(stale.stale.length, 1);
  assert.equal(stale.stale[0].text, 'Gone');
});

test('the build gate is not vacuous: a literal in neither the catalogue nor the allow-list is unlisted', () => {
  const dir = fixtureTree({
    'src/x.js': "const label = 'A brand new literal nobody extracted';\n",
    'src/locales/en.json': JSON.stringify({ 'a11y.dismiss': 'Dismiss' }),
    'test/fixtures/i18n-pending.json': JSON.stringify([]),
  });
  const options = {
    root: path.join(dir, 'src'),
    allowList: path.join(dir, 'test/fixtures/i18n-pending.json'),
    catalogue: path.join(dir, 'src/locales/en.json'),
  };
  const findings = scanTree(options.root, { catalogue: { 'a11y.dismiss': 'Dismiss' } });
  const verdict = compare(findings, []);
  assert.equal(verdict.unlisted.length, 1);
  assert.equal(verdict.unlisted[0].text, 'A brand new literal nobody extracted');
  assert.equal(main([], options), 1);
});

test('the CLI exits 1 on an unlisted finding, a stale entry, an unresolved key and a placeholder mismatch', () => {
  const dir = fixtureTree({
    'src/x.js': "import { t } from '../core/i18n.js';\nconst a = t('nope.missing');\nconst b = t('a11y.dismiss', { name: 'x' });\n",
    'src/locales/en.json': JSON.stringify({ 'a11y.dismiss': 'Dismiss {title}' }),
    'test/fixtures/i18n-pending.json': JSON.stringify([{ file: 'src/x.js', text: 'Gone' }], null, 2),
  });
  assert.equal(
    main([], {
      root: path.join(dir, 'src'),
      allowList: path.join(dir, 'test/fixtures/i18n-pending.json'),
      catalogue: path.join(dir, 'src/locales/en.json'),
    }),
    1,
  );
});

/* ---------- the final wave: the six view modules and the entry ---------- */

const WAVE_TEN_VIEWS = [
  'src/views/board.js',
  'src/views/calendar.js',
  'src/views/files.js',
  'src/views/project-overview.js',
  'src/views/table.js',
  'src/views/timeline.js',
];

test('the six view modules carry no user-visible literal and no allow-list entry', () => {
  const findings = scanTree(path.join(REPO_ROOT, 'src'), { catalogue: {} });
  const fromWave = findings.filter(f => WAVE_TEN_VIEWS.includes(f.file) && f.kind.startsWith('rule'));
  assert.deepEqual(texts(fromWave), [], `the view files still carry literals: ${[...new Set(fromWave.map(f => f.file))].join(', ')}`);
  const list = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  assert.deepEqual(
    list.filter(e => WAVE_TEN_VIEWS.includes(e.file)),
    [],
    'the allow-list still carries the entries of the six view modules',
  );
});

test('the six view modules keep the earlier waves\' formatter and search wiring', () => {
  const cal = fs.readFileSync(path.join(REPO_ROOT, 'src/views/calendar.js'), 'utf8');
  assert.ok(cal.includes('weekdayName(') && cal.includes('monthName('), 'calendar.js lost its locale-driven names');
  const tl = fs.readFileSync(path.join(REPO_ROOT, 'src/views/timeline.js'), 'utf8');
  assert.ok(tl.includes('monthName('), 'timeline.js lost its locale-driven month names');
  const files = fs.readFileSync(path.join(REPO_ROOT, 'src/views/files.js'), 'utf8');
  assert.ok(files.includes('a.name.localeCompare(b.name)'), 'files.js lost its localeCompare sort');
  assert.ok(files.includes('foldForSearch'), 'files.js lost the accent-insensitive filter');
});

/* ---------- the machine-identifier guard ---------- */

test('no data-a, data-r or data-v site of the live tree is ever reported', () => {
  const dir = path.join(REPO_ROOT, 'src');
  const files = [];
  const walk = d => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.js$/.test(entry.name)) files.push(p);
    }
  };
  walk(dir);

  let sites = 0;
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    if (EXCLUDED_FILES.has(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    const found = scanSource(text, rel, { catalogue: {} });
    const reported = new Set(found.map(f => `${f.line}::${f.text}`));
    for (const [index, line] of lines.entries()) {
      for (const m of line.matchAll(/data-[arv]\s*=\s*"([^"]*)"/g)) {
        sites++;
        assert.ok(!reported.has(`${index + 1}::${m[1]}`), `${rel}:${index + 1} reports the data-* value ${m[1]}`);
      }
    }
  }
  assert.ok(sites > 500, `the measured data-* sites are missing (${sites})`);
});

test('src/data/seed.js is never scanned', () => {
  assert.ok(EXCLUDED_FILES.has('src/data/seed.js'));
  const findings = scanTree(path.join(REPO_ROOT, 'src'), { catalogue: {} });
  const fromSeed = findings.filter(f => f.file === 'src/data/seed.js');
  assert.equal(fromSeed.length, 0);
  const seedStrings = [...fs.readFileSync(path.join(REPO_ROOT, 'src/data/seed.js'), 'utf8').matchAll(/'([A-Z][A-Za-z]{2,})'/g)].map(m => m[1]);
  assert.ok(seedStrings.length > 10, 'the seed fixture is empty');
});
