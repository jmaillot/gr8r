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
import { makeDoc } from './fixtures/export-fixtures.mjs';
import { textEntries } from './helpers/unzip.mjs';
import { assertWellFormed, tags } from './helpers/xml.mjs';

const NOW = new Date('2026-01-15T12:00:00');
const SHEET_ORDER = ['Summary', 'Tasks', 'Board', 'Timeline', 'Members', 'Milestones'];

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

test('the workbook is a zip whose workbook.xml lists the six sheets in the locked order (R4)', async () => {
  const { parts } = await buildZip(buildModel());
  const wbXml = parts.get('xl/workbook.xml');
  assert.ok(wbXml, 'xl/workbook.xml exists');
  assertWellFormed(wbXml);
  const sheetTags = tags(wbXml, 'sheet');
  assert.equal(sheetTags.length, 6, `exactly six sheets expected — got ${sheetTags.length}`);
  const names = sheetTags.map(t => /name="([^"]*)"/.exec(t)[1]);
  assert.deepEqual(names, SHEET_ORDER);
});

test('every sheet has a frozen header pane and the workbook activates Summary (R4, activeTab 0)', async () => {
  const { parts } = await buildZip(buildModel());
  const wbXml = parts.get('xl/workbook.xml');
  const views = tags(wbXml, 'workbookView');
  assert.equal(views.length, 1, 'exactly one workbookView — setActiveSheet alone emits none');
  assert.match(views[0], /activeTab="0"/, 'the workbook opens on Summary (activeTab 0)');

  for (let i = 1; i <= 6; i++) {
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
  for (let i = 1; i <= 6; i++) {
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
