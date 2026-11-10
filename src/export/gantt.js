/* =====================================================================
   GANTT GEOMETRY — Phase 54 (54-04)
   =====================================================================
   The one pure, adaptive-axis geometry module behind the Timeline
   sheet (R6, D-54-5..D-54-7). Every column decision the workbook
   writer makes comes from here: axis mode, column count, columnOf,
   the Today marker and the shape budget (R13).

   NO IMPORTS AT ALL: src/core/utils.js touches the DOM at load, and
   this module must run identically in Node (tests, server) and the
   browser. Dates are parsed with Date.UTC and compared as UTC
   epoch-day numbers so no host timezone can shift a column.

   ROW BASIS (stated once, used by every consumer): `row` on a bar or
   milestone is the 0-based TABLE index in drawing order. The writer
   writes that entry at sheet row row + 2 (sheet row 1 is the header /
   date-header row) and anchors its drawing at marker rows row + 1
   (top) and row + 2 (bottom), because drawing markers are 0-based and
   marker 1 sits on the sheet's first data row, sheet row 2.
   ===================================================================== */

/* R13 / T-54-13: above DAILY_LIMIT_DAYS padded days the axis switches
   to weekly; above SHAPE_CAP shapes (bars + connectors — milestone
   diamonds are OUTSIDE the budget) the Timeline degrades to the table
   plus the truncation note instead of failing. */
export const DAILY_LIMIT_DAYS = 90;
export const SHAPE_CAP = 400;

const MS_PER_DAY = 86400000;

/* YYYY-MM-DD -> UTC midnight epoch day number. */
export function toDay(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/* Epoch day number -> YYYY-MM-DD (UTC — never the local timezone). */
export function fromDay(n) {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

/* Whole days from a to b (b - a). */
export function dayDiff(a, b) {
  return toDay(b) - toDay(a);
}

/* UTC weekday with Monday as day 0 (0=Mon .. 6=Sun). */
function mondayIndex(iso) {
  return (new Date(toDay(iso) * MS_PER_DAY).getUTCDay() + 6) % 7;
}

/* Pad a raw span out to whole weeks: start is the Monday on or before
   the first date, end is the Sunday on or after the last date. */
export function padToWeek(firstISO, lastISO) {
  const start = fromDay(toDay(firstISO) - mondayIndex(firstISO));
  const end = fromDay(toDay(lastISO) + (6 - mondayIndex(lastISO)));
  return { start, end };
}

/**
 * Build the adaptive column axis over an already-padded span.
 * @param {string} paddedStart padded Monday
 * @param {string} paddedEnd   padded Sunday
 * @param {string|Date} exportDate the export date (Today marker source)
 * @returns {mode, spanDays, columns, columnOf, today}
 */
export function makeAxis({ paddedStart, paddedEnd, exportDate }) {
  const spanDays = dayDiff(paddedStart, paddedEnd) + 1; /* inclusive */
  const mode = spanDays <= DAILY_LIMIT_DAYS ? 'daily' : 'weekly';
  const columns = mode === 'daily' ? spanDays : Math.ceil(spanDays / 7);

  const exportISO = exportDate instanceof Date ? exportDate.toISOString().slice(0, 10) : exportDate;

  /* The caller pads; a date outside the padded range is never silently
     clamped — the writer omits the Today marker when today is null
     (D-54-7). Out-of-range columnOf calls are a caller bug: throw. */
  const columnOf = (iso) => {
    const d = dayDiff(paddedStart, iso);
    if (d < 0 || d >= spanDays) {
      throw new Error(`gantt: date ${iso} outside padded range ${paddedStart}..${paddedEnd}`);
    }
    return mode === 'daily' ? d : Math.floor(d / 7);
  };

  /* D-54-7: a project that starts in the future yields a padded range
     that excludes the export date — today is then null, never negative. */
  const exportDay = dayDiff(paddedStart, exportISO);
  const today = exportDay < 0 || exportDay >= spanDays ? null : columnOf(exportISO);

  return { mode, spanDays, columns, columnOf, today, startISO: paddedStart, endISO: paddedEnd };
}

/* 1-based column number -> letter(s): A..Z, AA.. */
export function columnLetter(n) {
  let s = '';
  let v = n;
  while (v > 0) {
    const rem = (v - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

/* Deterministic plain string comparison — never localeCompare (the
   host collation would make column geometry machine-dependent). */
const plainCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Build the whole Gantt geometry from the export model.
 * @param model the buildExportModel result — rows carry id, statusId,
 *              start, due and deps; project carries start and due;
 *              exportDateISO is the Today marker source.
 * @returns {axis, bars, milestones, links, truncated}
 */
export function buildGantt(model) {
  /* Only top-level rows reach the Timeline — child rows, archived,
     completed-off and foreign-project rows were already filtered by
     the model (T-54-15: the Gantt must not re-add a row). */
  const top = model.rows.filter(r => !r.parent);

  /* A row is dated when it has a due; its bar start is its start when
     start is present and not after due, otherwise its due (the
     timeline rule, src/views/timeline.js). */
  const dated = top
    .filter(r => r.due)
    .map(r => ({
      taskId: r.id,
      key: r.key || '',
      title: r.title || '',
      statusId: r.statusId,
      start: r.start && r.start <= r.due ? r.start : r.due,
      due: r.due,
    }));

  /* Span: earliest bar start (or the project start when earlier) to
     the latest bar due, project due or export date, whichever is
     latest. The export date only ever extends the END of the span, so
     a project that starts after today yields a padded range that
     excludes today (axis.today is then null; bars, milestones and
     links are unaffected). */
  let firstDate = '';
  for (const b of dated) if (!firstDate || b.start < firstDate) firstDate = b.start;
  if (model.project.start && (!firstDate || model.project.start < firstDate)) firstDate = model.project.start;
  if (!firstDate) firstDate = model.exportDateISO;

  let lastDate = model.exportDateISO || '';
  for (const b of dated) if (b.due > lastDate) lastDate = b.due;
  if (model.project.due && model.project.due > lastDate) lastDate = model.project.due;
  if (!lastDate) lastDate = firstDate;

  const padded = padToWeek(firstDate, lastDate);
  const axis = makeAxis({ paddedStart: padded.start, paddedEnd: padded.end, exportDate: model.exportDateISO });

  /* Bars sort by start then title then key; row is the 0-based table
     index (ROW BASIS above). */
  const bars = [...dated]
    .sort((a, b) => plainCmp(a.start, b.start) || plainCmp(a.title, b.title) || plainCmp(a.key, b.key))
    .map((b, i) => ({ ...b, row: i }));

  /* After the bars, one milestone per dated model milestone, sorted by
     date then name, with consecutive row indexes continuing after the
     last bar — the table index never gaps across the two arrays. */
  const milestones = (Array.isArray(model.milestones) ? model.milestones : [])
    .filter(m => m && m.date)
    .sort((a, b) => plainCmp(String(a.date), String(b.date)) || plainCmp(String(a.name ?? ''), String(String(b.name ?? ''))))
    .map((m, i) => ({ name: m.name || '', date: m.date, statusId: 'done', row: bars.length + i }));

  /* One connector per dependency that resolves to another in-scope
     bar. Dates stay RAW — the anchor columns are the writer's
     arithmetic. An equal-day pair (predDue equal to succStart) is a
     legitimate, expected link that must survive to the writer rather
     than being dropped as degenerate (D-54-6). A dependency to a row
     outside the exported set, a child row or a milestone is dropped. */
  const barByTaskId = new Map(bars.map(b => [b.taskId, b]));
  const links = [];
  for (const succ of bars) {
    for (const depId of model.rows.find(r => r.id === succ.taskId)?.deps || []) {
      const pred = barByTaskId.get(depId);
      if (!pred) continue;
      links.push({ predRow: pred.row, succRow: succ.row, predDue: pred.due, succStart: succ.start });
    }
  }
  links.sort((a, b) => (a.succRow - b.succRow) || (a.predRow - b.predRow));

  /* R13 / T-54-13: the cap counts bars plus connectors only —
     milestone diamonds are outside the budget (the fixture and the
     acceptance criterion agree). Inclusive at the cap: exactly 400
     shapes still draw, 401 degrades to the note row. */
  const truncated = bars.length + links.length > SHAPE_CAP;

  return { axis, bars, milestones, links, truncated };
}
