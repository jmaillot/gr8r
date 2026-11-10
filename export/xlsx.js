/* =====================================================================
   XLSX WRITER — Phase 54 (54-02)
   =====================================================================
   Server-only six-sheet workbook writer. Lives at the repository ROOT,
   never under src/: the prohibition test (test/export-prohibition.test.mjs)
   fails the build the moment a src/ module mentions this package or
   reaches this directory (R10, T-54-08).

   Imports ONLY @office-kit/xlsx subpaths — the package has no root
   export (54-PATTERNS §Repository Constraints, point 8) — plus the
   shared DOM-free export model under src/export/.

   Escaping contract (R12, T-54-07): every user-authored string goes
   through setCell as a shared string — never a formula cell. A value
   like "=1+1" stays literal text; OOXML escaping of shared strings is
   the writer library's job and is verified by the unzip round-trip in
   test/export-xlsx.test.mjs.

   D-54-13: start/due are real Date cells (UTC midnight) under the
   builtin short-date format — the reader's locale renders them; they
   are never pinned ISO strings. Progress keeps the model's 0-100
   value under the literal-percent format 0"%" (never the percentage
   code, which would multiply by 100).

   D-54-9: child rows (parentKey.n) sit under their parent with a
   one-level cell-style indent on the title — never leading spaces.

   fromBuffer (@office-kit/xlsx/node) is BROKEN in 0.26.1 — verification
   is via test/helpers/unzip.mjs (node:zlib), never the library reader.
   ===================================================================== */
import { createWorkbook, addWorksheet, setActiveSheet, makeWorkbookView } from '@office-kit/xlsx/workbook';
import {
  setCell, setColumnWidth, setFreezePanes, makePageSetup, getCell,
} from '@office-kit/xlsx/worksheet';
import { formatAsHeader, setCellNumberFormat, setBold, indentCell, wrapCellText } from '@office-kit/xlsx/styles';
import { makeBarChart, makeBarSeries, makeChartSpace } from '@office-kit/xlsx/chart';
import { addChartAt, makeShapeProperties, makeSolidFill, makeColor, makeSrgbColor, makeLine } from '@office-kit/xlsx/drawing';
import { workbookToBuffer } from '@office-kit/xlsx/node';

/* R4: the six sheets exist up front, in this fixed English order —
   never created lazily, sheet order is the acceptance criterion. */
const SHEET_NAMES = ['Summary', 'Tasks', 'Board', 'Timeline', 'Members', 'Milestones'];

/* Column widths (plan: sensible fixed values per column key). */
const WIDTHS = {
  key: 10,
  title: 40,
  status: 12,
  priority: 12,
  assignee: 18,
  start: 12,
  due: 12,
  progress: 10,
  labels: 20,
  estimate: 10,
  description: 40,
  comments: 40,
  latestComment: 40,
  thread: 40,
  /* Board / Members / Milestones column keys (54-03) */
  lane: 16,
  count: 8,
  member: 18,
  open: 8,
  done: 8,
  total: 8,
  name: 40,
  date: 14,
  state: 16,
};

/* Columns whose text wraps (descriptions and comment threads). */
const WRAP_COLUMNS = new Set(['description', 'latestComment', 'thread']);

/* D-54-13: 'mm-dd-yy' is the code the writer resolves to the builtin
   numFmtId 14 — Excel renders it in the READER's locale. A literal
   'yyyy-mm-dd' code would pin one format and fails the criterion. */
const SHORT_DATE_CODE = 'mm-dd-yy';

/* Literal percent: digit zero followed by a quoted percent sign.
   Never the percentage format code (which multiplies by 100). */
const LITERAL_PERCENT_CODE = '0"%"';

/* Local YYYY-MM-DD string -> a real Date at UTC midnight. Empty or
   malformed values become null (no cell written). */
function utcDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/* Row-1 header over the used range, styled, then the sheet's fixed setup:
   frozen header row + landscape print setup. */
function initSheet(wb, ws, headers, widthKeys) {
  for (const [i, label] of headers.entries()) {
    setCell(ws, 1, i + 1, label);
    setColumnWidth(ws, i + 1, (widthKeys && WIDTHS[widthKeys[i]]) || 12);
  }
  if (headers.length) formatAsHeader(wb, ws, `A1:${colLetter(headers.length)}1`);
  setFreezePanes(ws, 'A2');
  ws.pageSetup = makePageSetup({ orientation: 'landscape', fitToWidth: 1, fitToHeight: 0, paperSize: 9 });
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* Write one Tasks row. row is 1-based. Returns the sheet row index used
   (child rows and parents consume one row each, in model order). */
function writeTaskRow(wb, ws, row, r, columnKeys) {
  for (const [i, key] of columnKeys.entries()) {
    const col = i + 1;
    let value = r[key];
    if (value === undefined || value === null || value === '') {
      /* R12 edge: an absent value is an EMPTY CELL — never the word
         "undefined". But keep writing so the row shape stays aligned. */
      if (key === 'title' || key === 'key') value = '';
      else continue;
    }
    const date = key === 'start' || key === 'due' ? utcDate(value) : null;
    if (date) {
      setCell(ws, row, col, date);
      setCellNumberFormat(wb, getCell(ws, row, col), SHORT_DATE_CODE);
    } else if (key === 'progress') {
      /* D-54-9 scale contract: write the model's raw 0-100 value
         unchanged; the literal-percent format displays 45 as 45%. */
      setCell(ws, row, col, Number(value) || 0);
      setCellNumberFormat(wb, getCell(ws, row, col), LITERAL_PERCENT_CODE);
    } else {
      /* Strings through setCell — shared strings, never a formula cell
         (T-54-07): "=1+1" arrives as literal text. */
      setCell(ws, row, col, String(value));
      if (WRAP_COLUMNS.has(key)) wrapCellText(wb, getCell(ws, row, col), true);
      /* D-54-9: child rows indent their TITLE cell by one level via the
         cell style — never leading spaces in the text. */
      if (key === 'title' && r.parent) indentCell(wb, getCell(ws, row, col), 1);
    }
  }
  return row;
}

/**
 * Add one native clustered bar/column chart anchored at `at` on `ws`.
 * The title comes from the model (a translated string) and the series
 * caches carry the SAME arrays written into the sheet's source block, so
 * the chart renders without recalculation (R5, T-54-11). makeBarSeries
 * drops spPr — the series style is assigned after construction
 * (54-PATTERNS, Pitfall 4).
 */
function addBarChart(ws, at, title, labels, counts, catRef, valRef, opts = {}) {
  const series = makeBarSeries({
    idx: 0,
    order: 0,
    tx: { kind: 'literal', value: title },
    cat: { ref: catRef, cacheKind: 'str', cache: labels },
    val: { ref: valRef, cache: counts },
  });
  series.spPr = makeShapeProperties({
    fill: makeSolidFill(makeColor(makeSrgbColor('4F46E5'))),
    ln: makeLine({ fill: makeSolidFill(makeColor(makeSrgbColor('312E81'))) }),
  });
  addChartAt(ws, at, {
    space: makeChartSpace({
      plotArea: { chart: makeBarChart({ barDir: opts.barDir || 'col', grouping: 'clustered', series: [series] }) },
      title,
    }),
  }, { widthPx: opts.widthPx || 520, heightPx: opts.heightPx || 300 });
}

/**
 * Build the six-sheet workbook from the shared export model.
 * @param model the buildExportModel result (never a raw stored document)
 * @returns {Promise<Buffer>} the .xlsx binary, produced fully in memory
 */
export async function buildWorkbook(model) {
  const wb = createWorkbook();

  /* R4: all six sheets exist up front, in the locked order. */
  const sheets = SHEET_NAMES.map(name => ({ name, ws: addWorksheet(wb, name) }));
  const byName = Object.fromEntries(sheets.map(s => [s.name, s.ws]));

  const columnKeys = model.columns.map(c => c.key);
  const columnLabels = model.columns.map(c => c.label);

  /* Every sheet gets its header row, freeze and landscape setup now —
     plan 04 fills Timeline content. Summary's A1 is the project name
     (styled below); Board/Members/Milestones headers are the model's. */
  initSheet(wb, byName.Summary, []);
  initSheet(wb, byName.Board, model.headers.board, ['lane', 'count', 'key', 'title', 'assignee', 'priority', 'due', 'progress']);
  initSheet(wb, byName.Timeline, ['']);
  initSheet(wb, byName.Members, model.headers.members, ['member', 'open', 'done', 'total']);
  initSheet(wb, byName.Milestones, model.headers.milestones, ['name', 'date', 'state']);
  initSheet(wb, byName.Tasks, columnLabels, columnKeys);

  /* ===================================================================
     SUMMARY sheet (R5, D-54-15): project name in A1, the six meta rows
     from row 4, the four KPI counts from row 11, then the two chart
     source blocks (A19:B24 status, A26:B31 priority) and charts 1-2.
     Every label/title is the model's translated string — export/ holds
     no display literal (D-54-12).
     =================================================================== */
  const summaryWs = byName.Summary;
  setCell(summaryWs, 1, 1, model.project.name || '');
  formatAsHeader(wb, summaryWs, 'A1:B1');
  setColumnWidth(summaryWs, 1, 22);
  setColumnWidth(summaryWs, 2, 28);

  const writeMetaRow = (row, entry) => {
    setCell(summaryWs, row, 1, entry.label);
    if (entry.kind === 'date') {
      const date = utcDate(entry.value);
      if (date) {
        setCell(summaryWs, row, 2, date);
        setCellNumberFormat(wb, getCell(summaryWs, row, 2), SHORT_DATE_CODE);
      }
    } else if (entry.kind === 'percent') {
      /* raw 0-100 value under the literal-percent format — the same
         scale the Tasks and Board sheets use (never divided by 100). */
      setCell(summaryWs, row, 2, Number(entry.value) || 0);
      setCellNumberFormat(wb, getCell(summaryWs, row, 2), LITERAL_PERCENT_CODE);
    } else {
      setCell(summaryWs, row, 2, String(entry.value ?? ''));
    }
  };
  model.summary.meta.forEach((entry, i) => writeMetaRow(4 + i, entry));

  model.summary.kpis.forEach((kpi, i) => {
    const row = 11 + i;
    setCell(summaryWs, row, 1, kpi.label);
    setBold(wb, getCell(summaryWs, row, 1), true);
    setCell(summaryWs, row, 2, Number(kpi.value) || 0);
  });

  /* Chart source blocks + charts — presence is decided on the MODEL: a
     null block means no block and no chart part (R5 boundary rule). */
  if (model.charts.status) {
    setCell(summaryWs, 19, 1, model.charts.status.title);
    setBold(wb, getCell(summaryWs, 19, 1), true);
    model.charts.status.labels.forEach((label, i) => setCell(summaryWs, 20 + i, 1, label));
    model.charts.status.counts.forEach((count, i) => setCell(summaryWs, 20 + i, 2, count));
    addBarChart(summaryWs, 'D2', model.charts.status.title, model.charts.status.labels, model.charts.status.counts,
      'Summary!$A$20:$A$24', 'Summary!$B$20:$B$24');
  }
  if (model.charts.priority) {
    setCell(summaryWs, 26, 1, model.charts.priority.title);
    setBold(wb, getCell(summaryWs, 26, 1), true);
    model.charts.priority.labels.forEach((label, i) => setCell(summaryWs, 27 + i, 1, label));
    model.charts.priority.counts.forEach((count, i) => setCell(summaryWs, 27 + i, 2, count));
    addBarChart(summaryWs, 'D20', model.charts.priority.title, model.charts.priority.labels, model.charts.priority.counts,
      'Summary!$A$27:$A$31', 'Summary!$B$27:$B$31');
  }

  /* ===================================================================
     BOARD sheet (R7): a static snapshot of the five locked lanes.
     Row 1 is the model's header; each lane writes one lane row
     (label + count — an empty lane still shows count 0) followed by
     one row per card (C..H). Values are the SAME ones the Tasks
     sheet writes for that task: due as a real date under the builtin
     short-date format, progress as the raw 0-100 number under the
     literal-percent format.
     =================================================================== */
  const boardWs = byName.Board;
  let boardRow = 2;
  for (const lane of model.board.lanes) {
    setCell(boardWs, boardRow, 1, lane.label);
    setBold(wb, getCell(boardWs, boardRow, 1), true);
    setCell(boardWs, boardRow, 2, lane.count);
    boardRow += 1;
    for (const card of lane.cards) {
      setCell(boardWs, boardRow, 3, card.key);
      setCell(boardWs, boardRow, 4, card.title);
      setCell(boardWs, boardRow, 5, card.assigneeName);
      setCell(boardWs, boardRow, 6, card.priorityLabel);
      const dueDate = utcDate(card.due);
      if (dueDate) {
        setCell(boardWs, boardRow, 7, dueDate);
        setCellNumberFormat(wb, getCell(boardWs, boardRow, 7), SHORT_DATE_CODE);
      }
      setCell(boardWs, boardRow, 8, Number(card.progress) || 0);
      setCellNumberFormat(wb, getCell(boardWs, boardRow, 8), LITERAL_PERCENT_CODE);
      boardRow += 1;
    }
  }

  /* ===================================================================
     MEMBERS sheet (D-54-10): one row per assignee appearing in the
     exported set plus Unassigned, counts over top-level rows only.
     Below the rows sits the chart's source block (title + per-member
     open counts) and chart 3, when the model's assignees chart exists.
     =================================================================== */
  const membersWs = byName.Members;
  model.members.forEach((entry, i) => {
    const row = 2 + i;
    setCell(membersWs, row, 1, entry.name);
    setCell(membersWs, row, 2, entry.open);
    setCell(membersWs, row, 3, entry.done);
    setCell(membersWs, row, 4, entry.total);
  });
  if (model.charts.assignees) {
    const blockStart = Math.max(12, model.members.length + 3);
    setCell(membersWs, blockStart, 1, model.charts.assignees.title);
    setBold(wb, getCell(membersWs, blockStart, 1), true);
    const labels = model.charts.assignees.labels;
    const counts = model.charts.assignees.counts;
    labels.forEach((label, i) => setCell(membersWs, blockStart + 1 + i, 1, label));
    counts.forEach((count, i) => setCell(membersWs, blockStart + 1 + i, 2, count));
    const lastRow = blockStart + labels.length;
    addBarChart(membersWs, 'F2', model.charts.assignees.title, labels, counts,
      `Members!$A$${blockStart + 1}:$A$${lastRow}`, `Members!$B$${blockStart + 1}:$B$${lastRow}`,
      { barDir: 'bar', heightPx: 320 });
  }

  /* ===================================================================
     MILESTONES sheet (R11): name, real date, localized done/upcoming
     state — dates sorted by the model, states derived from the export
     date (D-54-13), user milestone names never translated.
     =================================================================== */
  const milestonesWs = byName.Milestones;
  model.milestones.forEach((milestone, i) => {
    const row = 2 + i;
    setCell(milestonesWs, row, 1, milestone.name);
    const date = utcDate(milestone.date);
    if (date) {
      setCell(milestonesWs, row, 2, date);
      setCellNumberFormat(wb, getCell(milestonesWs, row, 2), SHORT_DATE_CODE);
    }
    setCell(milestonesWs, row, 3, milestone.state);
  });

  /* TASKS sheet — one row per model row (parents and child rows in
     model order), starting at row 2 under the frozen header. */
  let row = 2;
  for (const r of model.rows) {
    writeTaskRow(wb, byName.Tasks, row, r, columnKeys);
    row += 1;
  }

  /* D-54-14 / 54-RESEARCH Pattern 2: setActiveSheet ALONE emits no
     bookViews — Excel would open on the first tab regardless. Set both. */
  setActiveSheet(wb, 'Summary');
  wb.bookViews = [makeWorkbookView({ activeTab: wb.activeSheetIndex })];

  /* R13 groundwork: one async build, one buffer — the route awaits this
     and writes headers only after it resolves. */
  return workbookToBuffer(wb);
}
