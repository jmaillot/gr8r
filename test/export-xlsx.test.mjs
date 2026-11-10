/* =====================================================================
   test: export xlsx — the six-sheet workbook shell + Tasks sheet.
   =====================================================================
   Phase 54 (54-02). Verifies the binary with test/helpers/unzip.mjs
   (node:zlib central-directory reader — @office-kit/xlsx's fromBuffer
   is BROKEN in 0.26.1 and must never be used to verify output).

   Assertions follow the plan's acceptance criteria: sheet order (R4),
   frozen header rows, workbookView activeTab, model-driven Tasks rows,
   name-not-id assignees, child indent (D-54-9), real dates under the
   builtin short-date format (D-54-13), literal percent on the 0-100
   progress scale, literal user text (R12/T-54-07: =1+1 never a
   formula, escaping round-trips, no undefined, script tags inert).
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkbook } from '../export/xlsx.js';
import { buildExportModel } from '../src/export/model.js';
import { makeDoc, makeZeroChartDoc, makeChartDoc, makeEmptyLaneDoc, makeMilestoneDoc } from './fixtures/export-fixtures.mjs';
import { textEntries } from './helpers/unzip.mjs';
import { assertWellFormed, tags } from './helpers/xml.mjs';

const NOW = new Date('2026-01-15T12:00:00');
/* Owner request 2026-11-10: milestones excluded from the XLSX — five sheets. */
const SHEET_ORDER = ['Summary', 'Tasks', 'Board', 'Timeline', 'Members'];

/* Full-opt-in model: descriptions, comments and subtasks all in —
   the widest Tasks-sheet shape. */
function buildModel(opts = { descriptions: true, comments: true, subtasks: true }) {
  return buildExportModel(makeDoc(), 'p_alpha', { scope: 'all', options: opts }, {
    translate: k => k,
    labelName: id => 'L:' + id,
    now: NOW,
  });
}

async function buildZip(model) {
  const buf = await buildWorkbook(model);
  assert.ok(buf.subarray(0, 2).toString('latin1') === 'PK', 'the workbook buffer must start with the zip magic PK');
  return { buf, parts: textEntries(buf) };
}

/* Parse styles.xml's cellXfs into an ordered array of full xf elements
   (attributes plus any nested <alignment> etc.). */
function cellXfs(stylesXml) {
  const m = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  assert.ok(m, 'styles.xml carries a cellXfs block');
  return [...m[1].matchAll(/<xf\s[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map(match => match[0]);
}

function xfAttr(xf, attr) {
  const m = new RegExp(`(?:^|\\s)${attr}="([^"]*)"`).exec(xf);
  return m ? m[1] : undefined;
}

test('the workbook is a zip whose workbook.xml lists the five sheets in the locked order (R4, as amended 2026-11-10)', async () => {
  const { parts } = await buildZip(buildModel());
  const wbXml = parts.get('xl/workbook.xml');
  assert.ok(wbXml, 'xl/workbook.xml exists');
  assertWellFormed(wbXml);
  const sheetTags = tags(wbXml, 'sheet');
  assert.equal(sheetTags.length, 5, `exactly five sheets expected — got ${sheetTags.length}`);
  const names = sheetTags.map(t => /name="([^"]*)"/.exec(t)[1]);
  assert.deepEqual(names, SHEET_ORDER);
});

test('every sheet has a frozen pane and the workbook activates Timeline (R4, R6; activeTab 3)', async () => {
  const { parts } = await buildZip(buildModel());
  const wbXml = parts.get('xl/workbook.xml');
  const views = tags(wbXml, 'workbookView');
  assert.equal(views.length, 1, 'exactly one workbookView — setActiveSheet alone emits none');
  assert.match(views[0], /activeTab="3"/, 'the workbook opens on Timeline (activeTab 3, sheet 4)');

  for (let i = 1; i <= 5; i++) {
    const xml = parts.get(`xl/worksheets/sheet${i}.xml`);
    assert.ok(xml, `xl/worksheets/sheet${i}.xml exists`);
    assertWellFormed(xml);
    const pane = tags(xml, 'pane').join('');
    assert.match(pane, /state="frozen"/, `sheet${i} (${SHEET_ORDER[i - 1]}) has a frozen pane`);
    /* row 1 is populated (the header) on every sheet */
    const row1 = tags(xml, 'row').some(t => /\br="1"/.test(t));
    assert.ok(row1, `sheet${i} (${SHEET_ORDER[i - 1]}) carries a header row 1`);
  }
});

test('the Tasks sheet has one row per model row plus the header', async () => {
  const model = buildModel();
  const { parts } = await buildZip(model);
  const xml = parts.get('xl/worksheets/sheet2.xml');
  const rowTags = tags(xml, 'row');
  assert.equal(rowTags.length, model.rows.length + 1, `header + ${model.rows.length} model rows`);
});

test('the assignee cell holds the member NAME, never the member id', async () => {
  const model = buildModel();
  assert.ok(model.rows.some(r => r.assignee === 'Pat Plain'), 'fixture sanity: Pat Plain is exported');
  const { parts } = await buildZip(model);
  const shared = parts.get('xl/sharedStrings.xml');
  assert.ok(shared.includes('Pat Plain'), 'assignee name reaches shared strings');
  for (const member of ['m_plain', 'm_lead', 'm_guest', 'm_idle']) {
    /* ids may legitimately appear inside a quoted member-name string only if
       they are substrings of a name — the fixture names contain none, so any
       standalone id is a leak. Search for the quoted-string form exactly. */
    assert.ok(!new RegExp(`>${member}</t>`).test(shared), `member id ${member} must never be written as a cell value`);
  }
});

/* Extract the raw attribute string of one cell (e.g. 'B4') from a
   worksheet part. Returns undefined when the cell is absent. */
function cellAttrs(xml, ref) {
  const m = new RegExp(`<c\\s+([^>]*?\\br="${ref}"[^>]*?)(?:\\/>|>([\\s\\S]*?)</c>)`).exec(xml);
  return m ? m[1] : undefined;
}

const STYLE_INDEX = /(?:^|\s)s="(\d+)"/;

test('child rows carry a one-level cell-style indent on the title; parents do not (D-54-9)', async () => {
  const model = buildModel();
  const childIdx = model.rows.findIndex(r => r.parent);
  assert.ok(childIdx !== -1, 'fixture sanity: the opt-in model has child rows');
  const parentIdx = model.rows.findIndex(r => r.key === 'ALPHA-9');
  assert.ok(parentIdx !== -1, 'fixture sanity: the parent row exists');

  const { parts } = await buildZip(model);
  const xml = parts.get('xl/worksheets/sheet2.xml');
  const xfs = cellXfs(parts.get('xl/styles.xml'));
  assert.ok(xfs.length > 0, 'cellXfs parsed');

  /* rows are 1-based on the sheet with the header at row 1 */
  const childS = Number((STYLE_INDEX.exec(cellAttrs(xml, `B${childIdx + 2}`) || '') || [])[1] || 0);
  const parentS = Number((STYLE_INDEX.exec(cellAttrs(xml, `B${parentIdx + 2}`) || '') || [])[1] || 0);
  const childIndent = Number(xfAttr(xfs[childS] || '', 'indent') || 0);
  const parentIndent = Number(xfAttr(xfs[parentS] || '', 'indent') || 0);
  assert.equal(childIndent, 1, `child title cell style indents by 1 (got style ${childS}: ${xfs[childS]})`);
  assert.equal(parentIndent, 0, `parent title cell carries no indent (got style ${parentS}: ${xfs[parentS]})`);
});

test('date cells are numeric under the builtin short-date format (numFmtId 14), never ISO strings (D-54-13)', async () => {
  const { parts } = await buildZip(buildModel());
  const xml = parts.get('xl/worksheets/sheet2.xml');
  const stylesXml = parts.get('xl/styles.xml');

  /* no pinned ISO-looking custom date code anywhere */
  assert.ok(!/formatCode="yyyy-mm-dd"/.test(stylesXml), 'the literal yyyy-mm-dd code must not be used (D-54-13)');

  /* t_a3 (ALPHA-2, in progress) has start 2026-01-10 and due 2026-02-01 */
  const model = buildModel();
  const datedRow = model.rows.findIndex(r => r.start && r.due);
  assert.ok(datedRow !== -1, 'fixture sanity: a dated task exists');
  const startAttrs = cellAttrs(xml, `F${datedRow + 2}`);
  assert.ok(startAttrs, `a start-date cell exists in column F of row ${datedRow + 2}`);
  assert.ok(!/\bt="(s|str|inlineStr)"/.test(startAttrs), 'the date cell is NOT a string cell');
  const s = Number((STYLE_INDEX.exec(startAttrs) || [])[1] || 0);
  const xf = cellXfs(stylesXml)[s] || '';
  assert.equal(xfAttr(xf, 'numFmtId'), '14', `the date style resolves to builtin numFmtId 14 (got xf: ${xf})`);
});

test('progress cells store the raw 0-100 value under the literal-percent format (45 renders as 45%)', async () => {
  const { parts } = await buildZip(buildModel());
  const xml = parts.get('xl/worksheets/sheet2.xml');
  const stylesXml = parts.get('xl/styles.xml');

  assert.ok(/formatCode="0&quot;%&quot;"|formatCode='0"%"'/.test(stylesXml), 'the literal-percent format 0"%" exists in styles.xml');
  assert.ok(!/formatCode="0%"/.test(stylesXml), 'the multiplying percentage code 0% must not be used');

  /* the done task (ALPHA-3, progress 100) and in-progress (ALPHA-2, 45) */
  const progressCells = [...xml.matchAll(/<c\s+([^>]*?)>\s*<v>(\d+)<\/v>\s*<\/c>/g)]
    .filter(m => /r="H\d+"/.test(m[1]));
  const values = progressCells.map(m => Number(m[2]));
  assert.ok(values.includes(45), `the in-progress task stores 45 (got ${values.join(', ')})`);
  assert.ok(values.includes(100), `the done task stores 100 (got ${values.join(', ')})`);
});

test('=1+1 stays literal shared-string text and no worksheet carries a formula element for user data (R12, T-54-07)', async () => {
  const { parts } = await buildZip(buildModel());
  const shared = parts.get('xl/sharedStrings.xml');
  assert.ok(shared.includes('=1+1'), 'the title =1+1 is stored as literal shared-string text');
  for (let i = 1; i <= 5; i++) {
    const xml = parts.get(`xl/worksheets/sheet${i}.xml`);
    assert.ok(!/<f[\s>]/.test(xml), `sheet${i} contains no <f> formula element`);
  }
});

test('A & <B> is XML-escaped in the shared string and reads back literally (R12)', async () => {
  const { parts } = await buildZip(buildModel());
  const shared = parts.get('xl/sharedStrings.xml');
  assert.ok(shared.includes('A &amp; &lt;B&gt;'), `the title is XML-escaped — found: ${shared.slice(0, 200)}`);
});

test('a description containing a script tag reaches the sheet only as inert text (R12, T-54-09)', async () => {
  const { parts } = await buildZip(buildModel());
  const shared = parts.get('xl/sharedStrings.xml');
  assert.ok(!/<script/i.test(shared), 'no script tag in shared strings');
  assert.ok(!/alert\(1\)/i.test(shared), 'the script payload is stripped WITH its content (plainText)');
  assert.ok(shared.includes('Bonjour'), 'the surrounding text survives');
});

test('an empty description produces an empty cell — never the word undefined (R12 edge)', async () => {
  const { parts } = await buildZip(buildModel());
  for (const [name, xml] of parts) {
    if (name.startsWith('xl/worksheets/')) {
      assert.ok(!/>undefined</.test(xml), `${name} must not contain the word undefined as a cell value`);
    }
  }
  const shared = parts.get('xl/sharedStrings.xml');
  assert.ok(!/undefined/.test(shared), 'sharedStrings never contains undefined');
});

test('accents and non-Latin characters round-trip through UTF-8 (T-54-09)', async () => {
  const { parts } = await buildZip(buildModel());
  const shared = parts.get('xl/sharedStrings.xml');
  assert.ok(shared.includes('Données — naïve café 日本語'), 'the multi-script title round-trips');
});

test('generated XML parts are well-formed', async () => {
  const { parts } = await buildZip(buildModel());
  for (const [name, xml] of parts) {
    if (/\.xml$/.test(name)) assertWellFormed(xml);
  }
});

/* =====================================================================
   54-03 Task 2: the Summary sheet — meta, KPIs, source blocks, charts.
   ===================================================================== */

/* Resolve one cell's displayed value: shared-string index -> text, or
   the raw <v> number. Returns { raw, shared } — shared is the resolved
   string when the cell is a string cell. */
function readCell(xml, ref, sharedStrings) {
  const m = new RegExp(`<c\\s+([^>]*?\\br="${ref}"[^>]*?)(?:\\/>|>([\\s\\S]*?)</c>)`).exec(xml);
  if (!m) return undefined;
  const attrs = m[1];
  const body = m[2] || '';
  const v = /<v>([\s\S]*?)<\/v>/.exec(body);
  if (!v) return { raw: undefined, attrs, body };
  if (/\bt="s"/.test(attrs)) {
    return { raw: Number(v[1]), shared: sharedStrings[Number(v[1])], attrs, body };
  }
  return { raw: v[1], attrs, body };
}

function parseSharedStrings(sharedXml) {
  if (!sharedXml) return [];
  return [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''),
  );
}

/* Pull one chart's category and value caches out of chart XML. */
function chartCaches(chartXml) {
  const strRef = /<c:strRef>([\s\S]*?)<\/c:strRef>/.exec(chartXml);
  const numRef = /<c:numRef>([\s\S]*?)<\/c:numRef>/.exec(chartXml);
  const strCache = strRef ? /<c:strCache>([\s\S]*?)<\/c:strCache>/.exec(strRef[1]) : null;
  const numCache = numRef ? /<c:numCache>([\s\S]*?)<\/c:numCache>/.exec(numRef[1]) : null;
  const pts = block => (block ? [...block[1].matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map(m => m[1]) : []);
  return {
    strRefF: strRef ? /<c:f>([\s\S]*?)<\/c:f>/.exec(strRef[1])[1] : null,
    numRefF: numRef ? /<c:f>([\s\S]*?)<\/c:f>/.exec(numRef[1])[1] : null,
    cats: pts(strCache),
    vals: pts(numCache),
    title: /<c:title>[\s\S]*?<a:t>([\s\S]*?)<\/a:t>/.exec(chartXml)?.[1],
  };
}

test('chart1 and chart2 exist with a barChart, one strRef and one numRef, and non-empty caches (R5)', async () => {
  const { parts } = await buildZip(buildModel());
  for (const [part, catRef, valRef] of [
    ['xl/charts/chart1.xml', 'Summary!$A$20:$A$24', 'Summary!$B$20:$B$24'],
    ['xl/charts/chart2.xml', 'Summary!$A$27:$A$31', 'Summary!$B$27:$B$31'],
  ]) {
    const xml = parts.get(part);
    assert.ok(xml, `${part} exists`);
    assertWellFormed(xml);
    assert.ok((xml.match(/<c:barChart>/g) || []).length === 1, `${part} carries exactly one barChart element`);
    assert.equal((xml.match(/<c:strRef>/g) || []).length, 1, `${part} carries one strRef`);
    assert.equal((xml.match(/<c:numRef>/g) || []).length, 1, `${part} carries one numRef`);
    const cache = chartCaches(xml);
    assert.equal(cache.strRefF, catRef, `${part} category range points at the source block`);
    assert.equal(cache.numRefF, valRef, `${part} value range points at the source block`);
    assert.ok(cache.cats.length > 0 && cache.cats.every(Boolean), `${part} string cache non-empty`);
    assert.ok(cache.vals.length > 0, `${part} numeric cache non-empty`);
  }
});

test('the Summary sheet carries the meta rows 4-9, KPI numbers 11-14, and source blocks equal to the chart caches', async () => {
  const model = buildModel();
  const { parts } = await buildZip(model);
  const xml = parts.get('xl/worksheets/sheet1.xml');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const cell = ref => readCell(xml, ref, shared);

  /* meta rows 4..9: label in A, value in B */
  const meta = model.summary.meta;
  for (let i = 0; i < meta.length; i++) {
    const row = 4 + i;
    assert.equal(cell(`A${row}`).shared, meta[i].label, `meta label row ${row}`);
    if (meta[i].kind === 'percent') {
      assert.equal(Number(cell(`B${row}`).raw), meta[i].value, 'progress keeps the raw 0-100 scale');
    } else if (meta[i].kind === 'date') {
      /* YYYY-MM-DD at UTC midnight: days since 1899-12-30 */
      const [y, mo, d] = meta[i].value.split('-').map(Number);
      const expected = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
      assert.equal(Number(cell(`B${row}`).raw), expected, `a date meta value is a real serial (${meta[i].key})`);
    } else {
      assert.equal(cell(`B${row}`).shared, String(meta[i].value), `meta value row ${row}`);
    }
  }

  /* KPI rows 11..14 */
  for (let i = 0; i < model.summary.kpis.length; i++) {
    const row = 11 + i;
    assert.equal(cell(`A${row}`).shared, model.summary.kpis[i].label);
    assert.equal(Number(cell(`B${row}`).raw), model.summary.kpis[i].value, `KPI ${model.summary.kpis[i].key}`);
  }

  /* source blocks match the chart caches exactly (T-54-11) */
  const statusCache = chartCaches(parts.get('xl/charts/chart1.xml'));
  const priorityCache = chartCaches(parts.get('xl/charts/chart2.xml'));
  statusCache.cats.forEach((label, i) => assert.equal(cell(`A${20 + i}`).shared, label, `status block label row ${20 + i}`));
  statusCache.vals.forEach((v, i) => assert.equal(Number(cell(`B${20 + i}`).raw), Number(v), `status block count row ${20 + i}`));
  priorityCache.cats.forEach((label, i) => assert.equal(cell(`A${27 + i}`).shared, label, `priority block label row ${27 + i}`));
  priorityCache.vals.forEach((v, i) => assert.equal(Number(cell(`B${27 + i}`).raw), Number(v), `priority block count row ${27 + i}`));
});

test('the meta date cells are real dates: numeric cells under a builtin date number format (D-54-13)', async () => {
  const { parts } = await buildZip(buildModel());
  const xml = parts.get('xl/worksheets/sheet1.xml');
  const stylesXml = parts.get('xl/styles.xml');
  for (const ref of ['B7', 'B8']) {
    const attrs = cellAttrs(xml, ref);
    assert.ok(attrs, `the date cell ${ref} exists`);
    assert.ok(!/\bt="(s|str|inlineStr)"/.test(attrs), `${ref} is NOT a string cell`);
    const s = Number((STYLE_INDEX.exec(attrs) || [])[1] || 0);
    const xf = cellXfs(stylesXml)[s] || '';
    assert.equal(xfAttr(xf, 'numFmtId'), '14', `${ref} carries builtin numFmtId 14`);
  }
});

test('A19 and chart1\'s title both come from the model — a French build renders the French title everywhere', async () => {
  const en = buildModel();
  const { parts } = await buildZip(en);
  const summaryXml = parts.get('xl/worksheets/sheet1.xml');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const a19 = readCell(summaryXml, 'A19', shared);
  assert.equal(a19.shared, en.charts.status.title);
  assert.equal(chartCaches(parts.get('xl/charts/chart1.xml')).title, en.charts.status.title, 'chart1 title equals the model title');

  /* French translator: every exporter key renders a French value */
  const frValues = {
    'export.chart.status': 'Tâches par statut',
    'export.chart.priority': 'Tâches par priorité',
    'export.chart.assignees': 'Tâches ouvertes par assigné',
  };
  const frModel = buildExportModel(makeDoc(), 'p_alpha', { scope: 'all', options: { descriptions: true, comments: true, subtasks: true } }, {
    translate: k => frValues[k] || k,
    labelName: id => 'L:' + id,
    now: NOW,
  });
  const fr = await buildZip(frModel);
  const frSummary = fr.parts.get('xl/worksheets/sheet1.xml');
  const frShared = parseSharedStrings(fr.parts.get('xl/sharedStrings.xml'));
  assert.equal(readCell(frSummary, 'A19', frShared).shared, 'Tâches par statut', 'the source block label is French');
  assert.equal(chartCaches(fr.parts.get('xl/charts/chart1.xml')).title, 'Tâches par statut', 'chart1 title is French');
  /* no English chart title anywhere in the package */
  for (const [name, xml] of fr.parts) {
    if (/\.xml$/.test(name)) assert.ok(!xml.includes('export.chart.'), `${name} carries no untranslated chart key`);
  }
});

test('all-zero data emits NO chart part and NO source block, and the workbook stays valid (R5 boundary)', async () => {
  const zeroModel = buildExportModel(makeZeroChartDoc(), 'p_zero', {}, { translate: k => k, labelName: id => 'L:' + id, now: NOW });
  const { parts } = await buildZip(zeroModel);
  for (const part of ['xl/charts/chart1.xml', 'xl/charts/chart2.xml', 'xl/charts/chart3.xml']) {
    assert.equal(parts.get(part), undefined, `${part} must not exist for zero data`);
  }
  assert.ok(!/[Cc]hart/.test(parts.get('xl/worksheets/sheet1.xml')), 'no chart source block on Summary');
  assert.ok(!parts.has('xl/drawings/drawing1.xml'), 'no drawing part for zero data');
  /* the workbook remains valid: five sheets, ordered, frozen */
  const wbXml = parts.get('xl/workbook.xml');
  assertWellFormed(wbXml);
  assert.deepEqual(tags(wbXml, 'sheet').map(t => /name="([^"]*)"/.exec(t)[1]), SHEET_ORDER);
  for (let i = 1; i <= 5; i++) {
    assert.match(tags(parts.get(`xl/worksheets/sheet${i}.xml`), 'pane').join(''), /state="frozen"/, `sheet${i} still frozen`);
  }
});

test('no worksheet part carries a formula element for any user-authored title or name', async () => {
  const { parts } = await buildZip(buildModel());
  for (const [name, xml] of parts) {
    if (name.startsWith('xl/worksheets/')) {
      assert.ok(!/<f[\s>]/.test(xml), `${name} holds no <f> formula element`);
    }
  }
});

/* =====================================================================
   54-03 Task 3: Board, Members (+ chart 3) and Milestones sheets.
   ===================================================================== */

/* All (row, column) -> displayed value of one sheet, resolved through
   the shared-strings table. */
function sheetValues(xml, sharedStrings) {
  const out = new Map();
  /* Self-closing cells (styled empties, e.g. the Today column) carry no
     value and must not swallow the following cell's content. */
  for (const m of xml.matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const ref = /\br="([A-Z]+\d+)"/.exec(attrs)[1];
    const inner = m[2] || '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
    if (!v) continue;
    if (/\bt="s"/.test(attrs)) out.set(ref, sharedStrings[Number(v[1])]);
    else out.set(ref, v[1]);
  }
  return out;
}

const modelOf = (doc, pid, opts = {}) => buildExportModel(doc, pid, { scope: 'all', ...opts }, {
  translate: k => k, labelName: id => 'L:' + id, now: NOW,
});

test('Board lane rows appear in the locked order with the model counts, cards carry their fields (R7)', async () => {
  const model = modelOf(makeChartDoc(), 'p_chart');
  const { parts } = await buildZip(model);
  const xml = parts.get('xl/worksheets/sheet3.xml');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(xml, shared);

  const laneLabels = model.board.lanes.map(l => l.label);
  const laneRows = laneLabels.map(label => {
    for (const [ref, value] of values) {
      if (/^A\d+$/.test(ref) && value === label) return Number(ref.slice(1));
    }
    return -1;
  });
  assert.ok(laneRows.every(r => r > 0), 'every lane label is present');
  assert.deepEqual([...laneRows].sort((a, b) => a - b), laneRows, 'lane rows appear in backlog, todo, progress, review, done order');
  laneRows.forEach((row, i) => {
    assert.equal(Number(values.get(`B${row}`)), model.board.lanes[i].count, `lane ${model.board.lanes[i].id} count`);
    const card = model.board.lanes[i].cards[0];
    if (card) {
      assert.equal(values.get(`C${row + 1}`), card.key, 'card key');
      assert.equal(values.get(`D${row + 1}`), card.title, 'card title');
      assert.equal(values.get(`E${row + 1}`), card.assigneeName, 'card assignee');
      assert.equal(values.get(`F${row + 1}`), card.priorityLabel, 'card priority');
    }
  });
});

test('the empty-lane fixture still shows its label with count 0 (R7 empty)', async () => {
  const model = modelOf(makeEmptyLaneDoc(), 'p_lane');
  const { parts } = await buildZip(model);
  const xml = parts.get('xl/worksheets/sheet3.xml');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(xml, shared);
  const labels = model.board.lanes.map(l => l.label);
  const rows = labels.map(label => Number(Object.entries(Object.fromEntries(values)).find(([, v]) => v === label)?.[0]?.slice(1)));
  assert.ok(rows.every(Number.isFinite), 'all five lane labels rendered');
  assert.deepEqual([...rows].sort((a, b) => a - b), rows, 'lanes in locked order');
  const todoIdx = model.board.lanes.findIndex(l => l.id === 'todo');
  const todoRow = rows[todoIdx];
  assert.equal(Number(values.get(`B${todoRow}`)), 0, 'the empty todo lane shows count 0');
  /* no card rows follow it: the next lane label sits directly below */
  assert.equal(values.get(`A${todoRow + 1}`), model.board.lanes[todoIdx + 1].label, 'an empty lane writes only its lane row');
  /* card rows carry a real due date when dated */
  const datedCard = model.board.lanes.flatMap(l => l.cards).find(c => c.due);
  assert.equal(datedCard, undefined, 'fixture sanity: lane cards are undated');
});

test('a dated Board card stores a real date serial under numFmtId 14 (D-54-13)', async () => {
  const model = modelOf(makeDoc(), 'p_alpha');
  const dated = model.board.lanes.flatMap(l => l.cards).find(c => c.due);
  assert.ok(dated, 'fixture sanity: a dated card exists');
  const { parts } = await buildZip(model);
  const xml = parts.get('xl/worksheets/sheet3.xml');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(xml, shared);
  const [y, mo, d] = dated.due.split('-').map(Number);
  const expected = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
  const rowRef = [...values.entries()].find(([ref, v]) => /^G\d+$/.test(ref) && Number(v) === expected);
  assert.ok(rowRef, `the due serial ${expected} appears in the Board due column`);
  const attrs = cellAttrs(xml, rowRef[0]);
  const xf = cellXfs(parts.get('xl/styles.xml'))[Number((STYLE_INDEX.exec(attrs) || [])[1] || 0)] || '';
  assert.equal(xfAttr(xf, 'numFmtId'), '14', 'the Board due cell carries the builtin short-date format');
});

test('Board card progress stores the same number AND format as that task\'s Tasks-sheet cell', async () => {
  const model = modelOf(makeDoc(), 'p_alpha');
  const task = model.rows.find(r => r.id === 't_a3'); // ALPHA-2, progress 45
  assert.equal(task.progress, 45);
  const { parts } = await buildZip(model);
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const board = sheetValues(parts.get('xl/worksheets/sheet3.xml'), shared);
  const tasksXml = parts.get('xl/worksheets/sheet2.xml');
  const tasks = sheetValues(tasksXml, shared);
  const taskRow = Number(Object.entries(Object.fromEntries(tasks)).find(([ref, v]) => /^A\d+$/.test(ref) && v === task.key)?.[0]?.slice(1));
  assert.ok(taskRow, 'the task row found by its key on Tasks');
  /* progress on Board sits in column H under the card's lane row */
  const boardRef = [...board.entries()].find(([ref, v]) => /^H\d+$/.test(ref) && v === String(task.progress));
  assert.ok(boardRef, `progress ${task.progress} appears on the Board progress column`);
  const boardAttrs = cellAttrs(parts.get('xl/worksheets/sheet3.xml'), boardRef[0]);
  const taskAttrs = cellAttrs(tasksXml, `H${taskRow}`);
  const boardS = (STYLE_INDEX.exec(boardAttrs) || [])[1];
  const taskS = (STYLE_INDEX.exec(taskAttrs) || [])[1];
  assert.equal(boardS, taskS, 'the two progress cells carry the identical style index (same number format)');
});

test('Members rows equal the model and the source block matches chart3\'s cache (T-54-11)', async () => {
  const model = modelOf(makeDoc(), 'p_alpha');
  const { parts } = await buildZip(model);
  const xml = parts.get('xl/worksheets/sheet5.xml');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(xml, shared);
  model.members.forEach((e, i) => {
    const row = 2 + i;
    assert.equal(values.get(`A${row}`), e.name, `member ${e.name}`);
    assert.equal(Number(values.get(`B${row}`)), e.open);
    assert.equal(Number(values.get(`C${row}`)), e.done);
    assert.equal(Number(values.get(`D${row}`)), e.total, 'total is open plus done');
  });
  const unassigned = model.members.filter(e => e.id === null);
  assert.equal(unassigned.length, 1, 'exactly one Unassigned row');

  const chartXml = parts.get('xl/charts/chart3.xml');
  assert.ok(chartXml, 'chart3.xml exists for the full fixture');
  const cache = chartCaches(chartXml);
  assert.equal(cache.title, model.charts.assignees.title, 'chart3 title equals the model title');
  assert.equal(cache.strRefF, `Members!$A$13:$A$${12 + cache.cats.length}`, 'chart3 category range points at the Members source block');
  assert.equal(cache.numRefF, `Members!$B$13:$B$${12 + cache.cats.length}`, 'chart3 value range points at the Members source block');
  assert.ok(cache.cats.length > 0 && cache.vals.length > 0, 'chart3 caches non-empty');
  cache.cats.forEach((label, i) => assert.equal(values.get(`A${13 + i}`), label, `block label row ${13 + i} equals the cache`));
  cache.vals.forEach((v, i) => assert.equal(Number(values.get(`B${13 + i}`)), Number(v), `block count row ${13 + i} equals the cache`));
});

test('chart3 is a clustered bar chart (barDir bar) anchored at F2', async () => {
  const { parts } = await buildZip(modelOf(makeDoc(), 'p_alpha'));
  const chartXml = parts.get('xl/charts/chart3.xml');
  assert.ok(chartXml, 'chart3.xml exists');
  assert.match(chartXml, /<c:barDir val="bar"\/>/, 'barDir bar');
  assert.match(chartXml, /<c:grouping val="clustered"\/>/, 'grouping clustered');
  /* resolve the Members drawing through the sheet's rels — never a
     hardcoded drawing number (the numbering shifts with the sheet set) */
  const rels = parts.get('xl/worksheets/_rels/sheet5.xml.rels') || '';
  const target = /Target="([^"]*drawings\/[^"]*)"/.exec(rels)?.[1];
  const drawing = target ? parts.get('xl/drawings/' + target.split('/').pop()) : null;
  assert.ok(drawing, 'the Members sheet carries its own drawing part');
  assert.match(drawing, /<xdr:col>5<\/xdr:col>/, 'the anchor column is F (0-based 5)');
  assert.match(chartXml, /<c:spPr>[\s\S]*?<a:srgbClr val="4F46E5">/, 'the series style was assigned AFTER construction (makeBarSeries drops it)');
});

test('chart3 is absent for the zero-chart fixture while all five sheets stay valid', async () => {
  const zeroModel = modelOf(makeZeroChartDoc(), 'p_zero');
  const { parts } = await buildZip(zeroModel);
  assert.equal(parts.get('xl/charts/chart3.xml'), undefined, 'no chart part for zero data');
  assert.ok(!/[Cc]hart/.test(parts.get('xl/worksheets/sheet5.xml')), 'no Members source block for zero data');
  const wbXml = parts.get('xl/workbook.xml');
  assert.deepEqual(tags(wbXml, 'sheet').map(t => /name="([^"]*)"/.exec(t)[1]), SHEET_ORDER, 'five sheets still in order');
  for (let i = 1; i <= 5; i++) {
    assert.match(tags(parts.get(`xl/worksheets/sheet${i}.xml`), 'pane').join(''), /state="frozen"/, `sheet${i} still frozen`);
  }
});

/* =====================================================================
   54-04 Task 2: the Timeline sheet — date header, shapes, row basis,
   Today column, freeze and viewport, cap degradation.
   ===================================================================== */
import { buildGantt, toDay as ganttToDay, fromDay as ganttFromDay } from '../src/export/gantt.js';
import {
  makeDailyGanttDoc, makeWeeklyGanttDoc, makeZeroDatedDoc, makeCapDoc, makeFutureDoc,
} from './fixtures/export-fixtures.mjs';

const NOW_GANTT = new Date('2026-03-15T12:00:00Z');
const NOW_WEEKLY = new Date('2026-04-01T12:00:00Z');
const NOW_FUTURE = new Date('2026-05-15T12:00:00Z');

const ganttModel = (doc, now = NOW_GANTT) => buildExportModel(doc, 'p_g', { scope: 'all' }, {
  translate: k => k, labelName: id => 'L:' + id, now,
});

/* Resolve the Timeline sheet part (sheet4) and its drawing part through
   the sheet's relationship file — never a hardcoded drawing number. */
async function timelineParts(doc, now) {
  const { parts } = await buildZip(ganttModel(doc, now));
  const rels = parts.get('xl/worksheets/_rels/sheet4.xml.rels') || '';
  const target = /Target="([^"]*drawings\/[^"]*)"/.exec(rels)?.[1];
  return {
    parts,
    sheet: parts.get('xl/worksheets/sheet4.xml'),
    drawing: target ? parts.get('xl/drawings/' + target.split('/').pop()) : null,
  };
}

/* Parse every twoCellAnchor of a drawing part into plain numbers. */
function anchors(drawingXml) {
  assert.ok(drawingXml, 'a drawing part exists');
  return [...drawingXml.matchAll(/<xdr:twoCellAnchor([^>]*)>([\s\S]*?)<\/xdr:twoCellAnchor>/g)].map(m => {
    const body = m[2];
    const marker = (tag) => {
      const seg = new RegExp(`<xdr:${tag}>([\\s\\S]*?)</xdr:${tag}>`).exec(body)?.[1] || '';
      return {
        col: Number(/<xdr:col>(\d+)<\/xdr:col>/.exec(seg)?.[1]),
        row: Number(/<xdr:row>(\d+)<\/xdr:row>/.exec(seg)?.[1]),
        rowOff: Number(/<xdr:rowOff>(\d+)<\/xdr:rowOff>/.exec(seg)?.[1] || 0),
      };
    };
    return {
      editAs: /\seditAs="([^"]*)"/.exec(m[1])?.[1],
      from: marker('from'),
      to: marker('to'),
      name: /name="([^"]*)"/.exec(body)?.[1],
      prst: /prstGeom prst="([^"]*)"/.exec(body)?.[1],
      connector: body.includes('<xdr:cxnSp'),
      fill: /<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(body)?.[1],
      tailEnd: /<a:tailEnd type="([^"]*)"/.exec(body)?.[1],
      widthEmu: Number(/<a:ln w="(\d+)"/.exec(body)?.[1] || 0),
    };
  });
}

/* Excel serial for a UTC date: days since 1899-12-30. */
const serial = iso => ganttToDay(iso) + 25569;

test('Timeline date headers on row 2, month row on row 1, width 4.5, heights 18/28 (R6 + owner 2026-11-10)', async () => {
  const daily = ganttModel(makeDailyGanttDoc());
  const axisDaily = buildGantt(daily).axis;
  const { parts, sheet } = await timelineParts(makeDailyGanttDoc());
  const row2 = /<row r="2"[^>]*>([\s\S]*?)<\/row>/.exec(sheet)[1];
  const cells = [...row2.matchAll(/<c r="([A-Z]+)2"/g)].map(m => m[1]);
  assert.equal(cells.length, 3 + axisDaily.columns, 'A-C task block plus one date cell per axis column, on row 2');
  assert.ok(/<row r="2" ht="28" customHeight="1"/.test(sheet), 'date row 2 height 28');
  assert.ok(/<row r="1" ht="18" customHeight="1"/.test(sheet), 'month row 1 height 18');
  assert.match(sheet, /<col min="4" max="38" width="4.5" customWidth="1"/, 'date columns width 4.5');
  /* last daily header is the padded Sunday, serial-valued */
  const lastRef = cells[cells.length - 1] + '2';
  const lastCell = new RegExp(`<c r="${lastRef}"[^>]*><v>([\\d.]+)</v>`).exec(sheet);
  assert.equal(Number(lastCell[1]), serial(axisDaily.endISO), 'the last daily header holds the padded Sunday');
  assert.match(sheet, new RegExp(`<c r="${lastRef}"[^>]*s="`), 'date headers are styled cells');

  /* the month row: localized labels (the test model's translate is identity,
     so the label IS the catalogue key), merged across each month span */
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(sheet, shared);
  const merges = [...sheet.matchAll(/<mergeCell ref="([A-Z]+1:[A-Z]+1)"\/>/g)].map(m => m[1]);
  assert.ok(merges.length >= 2, 'the month spans are merged — got ' + JSON.stringify(merges));
  const firstMonthCell = values.get(merges[0].split(':')[0]);
  assert.ok(firstMonthCell && firstMonthCell.startsWith('export.month.'), 'the month label is a catalogue key through the model translator');
  const monthCells = [...values.entries()].filter(([ref, v]) => /1$/.test(ref) && String(v).startsWith('export.month.'));
  const monthIdxs = monthCells.map(([ref]) => ref);
  assert.ok(monthIdxs.every(ref => merges.some(m => m.startsWith(ref.split('').filter(ch => /[A-Z]/.test(ch)).join('') + '1:')) || merges.some(m => m.split(':')[0] === ref)),
    'every month label anchors one of the merged spans');

  const weekly = ganttModel(makeWeeklyGanttDoc(), NOW_WEEKLY);
  const axisWeekly = buildGantt(weekly).axis;
  const weeklyParts = await timelineParts(makeWeeklyGanttDoc(), NOW_WEEKLY);
  const weeklyRow2 = /<row r="2"[^>]*>([\s\S]*?)<\/row>/.exec(weeklyParts.sheet)[1];
  const weeklyCells = [...weeklyRow2.matchAll(/<c r="[A-Z]+2"/g)].map(m => m[0]);
  assert.equal(weeklyCells.length, 3 + axisWeekly.columns, 'weekly: one header per week column on row 2');
  const lastWeeklyRef = [...weeklyRow2.matchAll(/<c r="([A-Z]+)2"/g)][weeklyCells.length - 1][1] + '2';
  const lastWeekly = new RegExp(`<c r="${lastWeeklyRef}"[^>]*><v>([\\d.]+)</v>`).exec(weeklyParts.sheet);
  assert.equal(Number(lastWeekly[1]), serial(ganttFromDay(ganttToDay(axisWeekly.startISO) + (axisWeekly.columns - 1) * 7)),
    'the last weekly header holds the Monday of the last week column');
});

test('Timeline pane: frozen at xSplit 3 and topLeftCell one column before today (D-54-7)', async () => {
  const { sheet } = await timelineParts(makeDailyGanttDoc());
  const pane = tags(sheet, 'pane').join('');
  assert.match(pane, /state="frozen"/);
  assert.match(pane, /xSplit="3"/, 'the task block A-C is frozen');
  assert.match(pane, /ySplit="2"/, 'the month + date rows are frozen');
  assert.match(pane, /topLeftCell="P3"/, 'today is column Q (index 13) — the viewport opens one column before it, on the table row');
});

test('Timeline shapes: one anchored roundRect per bar, NO diamonds (milestones excluded, owner 2026-11-10), exact columns (R6, T-54-16)', async () => {
  const { drawing } = await timelineParts(makeDailyGanttDoc());
  const list = anchors(drawing);
  const sps = list.filter(a => !a.connector);
  assert.equal(sps.length, 3, 'three bars, no milestone diamonds');

  const byName = Object.fromEntries(list.map(a => [a.name, a]));
  /* padded Monday 2026-03-02: columnOf(date) = dayDiff */
  assert.deepEqual([byName['bar-0'].from.col, byName['bar-0'].to.col], [3, 6], 'G-3 spans 03-02..03-04');
  assert.deepEqual([byName['bar-1'].from.col, byName['bar-1'].to.col], [11, 22], 'G-2 spans 03-10..03-20');
  assert.deepEqual([byName['bar-2'].from.col, byName['bar-2'].to.col], [21, 22], 'G-1 (start equals due) is one column wide');
  assert.equal(byName['ms-0'], undefined, 'no diamond shape exists');
  assert.equal(byName['bar-0'].prst, 'roundRect');
  assert.equal(byName['bar-0'].fill, '60A5FA', 'todo status fill');

  /* T-54-16: shape names are machine ids — never a task title. */
  for (const a of list) assert.match(a.name, /^(bar|link)-\d+$/, `shape name ${a.name} is a machine id`);

  /* connectors are emitted after bars so they draw on top */
  const firstLink = list.findIndex(a => a.connector);
  const lastSp = list.map(a => a.connector ? -1 : list.indexOf(a)).reduce((x, y) => Math.max(x, y), -1);
  assert.ok(firstLink > lastSp, 'every cxnSp comes after every bar');
});

test('Timeline row basis: bar-0 anchors on the sheet rows its own table cells occupy (R6; table starts at row 3)', async () => {
  const doc = makeDailyGanttDoc();
  const model = ganttModel(doc);
  const g = buildGantt(model);
  const { parts, sheet, drawing } = await timelineParts(doc);
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(sheet, shared);
  const list = anchors(drawing);
  const byName = Object.fromEntries(list.map(a => [a.name, a]));

  /* the first bar (table index 0) writes its key at sheet row 3 —
     two header rows (months, dates) above the table */
  const firstBar = g.bars[0];
  const keyRef = `A${firstBar.row + 3}`;
  assert.equal(values.get(keyRef), firstBar.key, `the first bar's key cell sits at ${keyRef}`);
  assert.equal(byName['bar-0'].from.row, firstBar.row + 2, 'from row = table index + 2 (two header rows)');
  assert.equal(byName['bar-0'].to.row, firstBar.row + 3, 'to row = table index + 3 (its own cell row)');
});

test('Timeline connectors: predecessor finish to successor start, clamped so none points left (D-54-6)', async () => {
  const { drawing } = await timelineParts(makeDailyGanttDoc());
  const links = anchors(drawing).filter(a => a.connector);
  assert.equal(links.length, 2, 'one connector per resolvable dependency');

  const normal = links.find(l => l.from.col === 6);
  assert.ok(normal, 'link-0 leaves the G-3 finish boundary (columnOf(03-04) + 4 = 6)');
  assert.equal(normal.to.col, 11, 'and lands on the G-2 start boundary (columnOf(03-10) + 3 = 11)');
  assert.equal(normal.editAs, 'oneCell');
  assert.equal(normal.prst, 'bentConnector3');
  assert.equal(normal.widthEmu, 12700);
  assert.equal(normal.tailEnd, 'triangle');
  assert.equal(normal.from.rowOff, 700000, 'the predecessor end sits low in its drawing row');
  assert.equal(normal.to.rowOff, 300000, 'the successor end sits high in its drawing row');

  const equalDay = links.find(l => l.from.col === 22);
  assert.ok(equalDay, 'the equal-day pair (predDue = succStart = 03-20) survives');
  assert.equal(equalDay.to.col, equalDay.from.col, 'clamped: a zero-length horizontal connector, never one column leftward');
  assert.equal(equalDay.to.row, equalDay.from.row + 1, 'it steps down into the successor row');

  for (const link of links) {
    assert.ok(link.to.col >= link.from.col, `connector ${link.name} never points leftward`);
  }
});

test('zero dated tasks: no drawing, but table header, date header and Today fill stay (R6 edge)', async () => {
  const { parts, sheet, drawing } = await timelineParts(makeZeroDatedDoc());
  assert.equal(drawing, null, 'no drawing part for an empty Gantt');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(sheet, shared);
  assert.equal(values.get('A2'), 'export.col.key');
  assert.equal(values.get('B2'), 'export.col.title');
  assert.equal(values.get('C2'), 'export.col.status');
  const row2 = /<row r="2"[^>]*>([\s\S]*?)<\/row>/.exec(sheet)[1];
  assert.equal([...row2.matchAll(/<c r="[A-Z]+2"/g)].length, 3 + buildGantt(ganttModel(makeZeroDatedDoc())).axis.columns,
    'the date header keeps one cell per axis column, on row 2');
  /* Today fill on the export-date column: a style change only, so pin
     the fill color in styles.xml. */
  assert.ok(parts.get('xl/styles.xml').includes('FEF3C7'), 'the Today column fill survives an empty Gantt');
});

test('a future project: no Today fill anywhere and the viewport opens at D3 (D-54-7)', async () => {
  const { parts, sheet } = await timelineParts(makeFutureDoc(), NOW_FUTURE);
  const pane = tags(sheet, 'pane').join('');
  assert.match(pane, /topLeftCell="D3"/, 'no today column to scroll to — open at the first date column, on the table row');
  assert.ok(!parts.get('xl/styles.xml').includes('FEF3C7'), 'no Today fill is written at all');
  assert.ok(!parts.get('xl/styles.xml').includes('FDE68A'), 'no Today header fill either');
});

test('above the shape cap: no drawing items, the table stays and the note row carries the truncation label (R13)', async () => {
  const doc = makeCapDoc(201, 200); // 201 bars + 200 links = 401 shapes
  const { parts, sheet, drawing } = await timelineParts(doc);
  assert.equal(drawing, null, 'no drawing part is created above the cap');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(sheet, shared);
  /* last table row = 2 + 201 bars (table starts at row 3); the note sits one row further */
  const noteRow = 2 + 201 + 2;
  assert.equal(values.get(`A${noteRow}`), 'export.timeline.truncated', 'the truncation note lands in column A');
  const row2 = /<row r="2"[^>]*>([\s\S]*?)<\/row>/.exec(sheet)[1];
  assert.ok([...row2.matchAll(/<c r="[A-Z]+2"/g)].length > 3, 'the date header survives the degradation');
  assert.equal(values.get('A3'), 'K-0', 'the table rows stay');
});

test('exactly at the shape cap the sheet still draws (R13 inclusive boundary)', async () => {
  const doc = makeCapDoc(201, 199); // 201 bars + 199 links = 400 shapes
  const { drawing } = await timelineParts(doc);
  const list = anchors(drawing);
  assert.equal(list.filter(a => !a.connector).length, 201, 'all 201 bars draw');
  assert.equal(list.filter(a => a.connector).length, 199, 'all 199 connectors draw');
});

/* =====================================================================
   54-04 Task 3: responsiveness — yields between sheets, the 500-task
   benchmark and the exact-cap draw.
   ===================================================================== */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { makeBenchmarkDoc, makeExactCapDoc } from './fixtures/export-fixtures.mjs';

test('the 500-task benchmark builds a valid zip with the event loop held under two seconds (R13, T-54-14)', async t => {
  if (typeof monitorEventLoopDelay !== 'function') {
    t.skip('monitorEventLoopDelay is unavailable on this runtime — responsiveness not measured');
    return;
  }
  const hist = monitorEventLoopDelay({ resolution: 10 });
  hist.enable();
  const started = Date.now();
  const buf = await buildWorkbook(ganttModel(makeBenchmarkDoc()));
  const elapsed = Date.now() - started;
  hist.disable();

  assert.ok(buf.subarray(0, 2).toString('latin1') === 'PK', 'the benchmark buffer starts with the zip magic');
  assert.ok(elapsed < 30000, `the 500-task build finished in ${elapsed}ms — under the 30000ms bound`);
  assert.ok(hist.max < 2000 * 1e6, `maximum event-loop delay ${hist.max}ns — under 2000ms because generation yields`);
  assert.ok(typeof hist.count === 'number' && hist.count >= 0, 'the histogram probe resolved (skip path only when monitorEventLoopDelay is unavailable)');

  /* the benchmark crosses the shape cap: the Timeline degrades */
  const { parts, sheet, drawing } = await timelineParts(makeBenchmarkDoc());
  assert.equal(drawing, null, 'the capped benchmark Timeline draws nothing');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(sheet, shared);
  assert.equal(values.get('A504'), 'export.timeline.truncated', 'the note row follows the table (two header rows + 500 bars)');
  assert.ok(values.get('A2'), 'the table itself stays');
});

test('the exact-cap fixture draws all 400 shapes with no note row (R13 inclusive boundary)', async () => {
  const { parts, sheet, drawing } = await timelineParts(makeExactCapDoc());
  const list = anchors(drawing);
  assert.equal(list.filter(a => !a.connector).length, 380, '380 bars draw at the cap');
  assert.equal(list.filter(a => a.connector).length, 20, '20 connectors draw at the cap');
  assert.equal(list.length, 400, 'exactly 400 shapes — the cap is inclusive');
  const shared = parseSharedStrings(parts.get('xl/sharedStrings.xml'));
  const values = sheetValues(sheet, shared);
  const noteRows = [...values.entries()].filter(([, v]) => v === 'export.timeline.truncated');
  assert.equal(noteRows.length, 0, 'no truncation note at exactly 400 shapes');
  assert.ok(list.some(a => a.connector), 'at least one cxnSp exists');
});

test('WR-01: the Timeline status column keeps the top-level row status — child rows never overwrite it (54-05 review)', async () => {
  const doc = makeDoc();
  const t = doc.tasks.find(x => x.id === 't_a9');
  t.start = '2026-02-02';
  t.due = '2026-02-06';
  const model = modelOf(doc, 'p_alpha', { options: { subtasks: true } });
  const parent = model.rows.find(r => r.id === 't_a9' && !r.parent);
  const lastChild = [...model.rows].reverse().find(r => r.parent === 't_a9');
  assert.ok(parent && lastChild && parent.status !== lastChild.status, 'fixture sanity: the parent status differs from the last child status');
  const { parts } = await buildZip(model);
  const values = sheetValues(parts.get('xl/worksheets/sheet4.xml'), parseSharedStrings(parts.get('xl/sharedStrings.xml')));
  const barRow = [...values.entries()].find(([, v]) => v === 'Subtasked task')?.[0].slice(1);
  assert.ok(barRow, 'the subtasked parent has a bar row on the Timeline');
  assert.equal(values.get('C' + barRow), parent.status, 'the status cell shows the parent status, not the last child status');
});
