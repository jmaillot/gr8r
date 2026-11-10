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
import { formatAsHeader, setCellNumberFormat, indentCell, wrapCellText } from '@office-kit/xlsx/styles';
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
     plans 03-04 fill Board/Timeline/Members/Milestones content. */
  const taskKeys = ['Summary', 'Board', 'Timeline', 'Members', 'Milestones'];
  for (const name of taskKeys) {
    initSheet(wb, byName[name], ['']);
  }
  initSheet(wb, byName.Tasks, columnLabels, columnKeys);

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
