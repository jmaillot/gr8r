/* =====================================================================
   MSPDI WRITER — Phase 54 (54-05)
   =====================================================================
   Server-only Microsoft Project XML (MSPDI) serializer. Lives at the
   repository ROOT beside export/xlsx.js — never under src/ (the
   prohibition test fails the moment a src/ module reaches this file).

   R3 exception (recorded): the SPEC says descriptions, comments and
   subtasks are applied identically by the xlsx, MSPDI and CSV writers.
   MSPDI has NO comment element in the schema and D-54-8 scopes
   comments to the Tasks sheet columns, so this writer emits no comment
   content whatsoever — the toggle changes no byte of the output and
   test/export-mspdi.test.mjs asserts that no-op. Comments are never
   mapped onto an unrelated Project field: that would corrupt a real
   field rather than carry the data.

   Schema facts (54-RESEARCH §Pattern 6, Microsoft Learn, this phase):
   - the document is POSITIONAL: one reordered child triggers Project's
     repair prompt, so every element is emitted from ordered template
     strings — never from an object spread (Pitfall 8 / T-54-18);
   - there is NO <Text1> element: custom fields are
     <ExtendedAttribute><FieldID>…</FieldID><Value>…</Value>, with the
     non-sequential FieldIDs pinned below (Pitfall 9 / T-54-17);
   - every collection (Tasks/Resources/Assignments) requires at least
     one child when present, so an empty collection is omitted
     entirely. Calendars is the one exception: CalendarUID 1 at project
     level must always resolve, so the single base calendar is
     unconditional — even for a project with zero tasks (Pitfall 11);
   - dates carry NO timezone suffix (YYYY-MM-DDThh:mm:ss); durations
     are xsd:duration at one day = 480 minutes (D-54-13);
   - rows that parent child rows carry <Summary>1</Summary> so Project
     renders them as bold summary tasks (owner request 2026-11-10);
   - the short namespace xmlns="http://schemas.microsoft.com/project"
     (no /2007) — 54-RESEARCH Open Question 1, asserted by the suite
     and confirmed by the human Project check (54-05 Task 3).

   Zero imports: pure string building over the shared export model
   (buildExportModel output). Node's Buffer conversion happens in the
   route, not here.
   ===================================================================== */

/* Escape the five XML entities, ampersand first — the exact order keeps
   an escaped ampersand from being double-escaped (R12, T-54-17). */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* The stored ASCII estimate grammar '^(\d+)([mhd])$' → minutes at one
   day = 480 (D-54-13). Anything else returns null — the writer then
   falls back to the working-day span. */
export function parseEstimate(value) {
  const m = /^(\d+)([mhd])$/.exec(String(value || ''));
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  return m[2] === 'm' ? n : m[2] === 'h' ? n * 60 : n * 480;
}

/* Monday-to-Friday days between start and due INCLUSIVE, in UTC.
   Invalid or reversed ranges return 0. */
export function workingDaysInclusive(startISO, dueISO) {
  const parse = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const from = parse(startISO);
  const to = parse(dueISO);
  if (from === null || to === null || to < from) return 0;
  let count = 0;
  for (let t = from; t <= to; t += 86400000) {
    const day = new Date(t).getUTCDay();
    if (day >= 1 && day <= 5) count += 1;
  }
  return count;
}

/* Minutes → xsd:duration. Zero renders PT0H0M0S; hours may exceed 24
   (a 3-day estimate is PT24H0M0S, matching the schema form). */
export function isoDuration(minutes) {
  const m = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  return `PT${Math.floor(m / 60)}H${m % 60}M0S`;
}

/* ISO date + time-of-day → YYYY-MM-DDThh:mm:ss with NO Z and NO offset
   (D-54-13). Task starts use 08:00:00, finishes 17:00:00; milestones
   sit at 08:00:00. */
export function formatDateTime(dateISO, time) {
  const iso = String(dateISO || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T${time}` : '';
}

const MIN_MS = 60000;

/* Local-calendar date part of a UTC-anchored instant computed from an
   ISO date — no Date-parsing timezone drift: the ISO string is split
   by hand and re-composed. */
function dateFromISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

function isoFromUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/* The custom-field FieldIDs (Pitfall 9): Text1..Text5 are NOT
   sequential — these exact values are pinned by the suite. */
const FIELD_IDS = [
  ['Text1', '188743731'],
  ['Text2', '188743734'],
  ['Text3', '188743737'],
  ['Text4', '188743740'],
  ['Text5', '188743743'],
];

const esc = escapeXml;

/* An ExtendedAttribute entry with the given FieldID and value; omitted
   entirely when the value is empty (Pitfall 11 applies to attribute
   entries too — an empty Value corrupts nothing but carries nothing). */
function extendedAttribute(fieldId, value) {
  const v = String(value ?? '');
  return v ? `<ExtendedAttribute><FieldID>${fieldId}</FieldID><Value>${esc(v)}</Value></ExtendedAttribute>` : '';
}

/* Project-level ExtendedAttributes block: the five Text fields defined
   once, so Project shows them as columns. */
function extendedAttributesBlock() {
  return `<ExtendedAttributes>${FIELD_IDS.map(([name, id]) => `<ExtendedAttribute><FieldID>${id}</FieldID><FieldName>${name}</FieldName></ExtendedAttribute>`).join('')}</ExtendedAttributes>`;
}

/* The one unconditional collection: a single base calendar, UID 1,
   Monday-to-Friday 08:00-12:00 + 13:00-17:00, Saturday/Sunday
   non-working (Microsoft's own WeekDays example shape). */
function calendarsBlock() {
  const workingDay = `<DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>`;
  const nonWorkingDay = `<DayWorking>0</DayWorking>`;
  /* DayType 1 = Sunday … 7 = Saturday. */
  const days = [nonWorkingDay, workingDay, workingDay, workingDay, workingDay, workingDay, nonWorkingDay]
    .map((inner, i) => `<WeekDay><DayType>${i + 1}</DayType>${inner}</WeekDay>`)
    .join('');
  return `<Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${days}</WeekDays></Calendar></Calendars>`;
}

/* One Task's scheduled instants. Row contract (model): start/due are
   YYYY-MM-DD or ''; estimate the stored ASCII form; progress 0-100. */
function taskSchedule(row, fallbackStartISO) {
  const startISO = /^\d{4}-\d{2}-\d{2}$/.test(String(row.start)) ? row.start : fallbackStartISO;
  const minutes = parseEstimate(row.estimate) ?? workingDaysInclusive(row.start, row.due) * 480;
  let finishISO;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(row.due))) {
    finishISO = row.due;
  } else {
    const base = dateFromISO(startISO) || dateFromISO(fallbackStartISO);
    finishISO = isoFromUTC((base ? base.getTime() : Date.UTC(1970, 0, 1)) + minutes * MIN_MS);
  }
  return { startISO, finishISO, minutes };
}

/* The whole document. model is the buildExportModel output — the SAME
   shape the CSV and workbook writers consume; inclusion decisions were
   already applied by the model and are NEVER re-filtered here
   (subtasks/completed/archived live in model.rows). */
export function buildMspdi(model) {
  const rows = Array.isArray(model?.rows) ? model.rows : [];
  const options = model?.options || {};
  const proj = model?.project || {};
  const exportDateISO = model?.exportDateISO;

  const fallbackStartISO = proj.start || exportDateISO || '';

  /* ---- UID resolution: rows in model order. Milestones are excluded
     from the MSPDI (owner request 2026-11-10).
     CR-01 (54-05 review): only TOP-LEVEL rows enter the id→UID map —
     child rows carry the parent's id (model.js emits id: t.id with
     parent: t.id), so a naive map let the LAST child overwrite the
     parent's UID, corrupting assignments and dependency resolution. */
  const uidOf = new Map();
  rows.forEach((r, i) => {
    if (r && r.id && !r.parent) uidOf.set(r.id, i + 1);
  });

  /* ---- summary flags (owner 2026-11-10): a row that parents child
     rows carries <Summary>1</Summary> — Project renders those tasks
     bold. Everything else is 0. ---- */
  const summaryIds = new Set(rows.map(r => r?.parent).filter(Boolean));

  /* ---- schedule extremes for the project StartDate/FinishDate. ---- */
  let earliestStart = null;
  let latestFinish = null;
  for (const row of rows) {
    const { startISO, finishISO } = taskSchedule(row, fallbackStartISO);
    if (startISO && (!earliestStart || startISO < earliestStart)) earliestStart = startISO;
    if (finishISO && (!latestFinish || finishISO > latestFinish)) latestFinish = finishISO;
  }
  const projectStartISO = earliestStart || proj.start || exportDateISO || '';
  const projectFinishISO = (proj.due && (!latestFinish || proj.due > latestFinish) ? proj.due : latestFinish) || exportDateISO || projectStartISO;

  /* ---- Tasks ---- */
  const tasksXml = [];
  let uid = 0;
  for (const row of rows) {
    uid += 1;
    const isMilestone = false; /* model.rows carries tasks and child rows only */
    const { startISO, finishISO, minutes } = taskSchedule(row, fallbackStartISO);
    const start = formatDateTime(startISO, '08:00:00');
    const finish = formatDateTime(finishISO, '17:00:00');
    const duration = isoDuration(minutes);
    const percent = Math.max(0, Math.min(100, Math.round(Number(row.progress) || 0)));

    /* One finish-to-start link per dependency that resolves to an
       exported UID; an unresolved dep emits nothing (Pitfall 11). */
    const links = (Array.isArray(row.deps) ? row.deps : [])
      .map(depId => uidOf.get(depId))
      .filter(u => u !== undefined)
      .map(
        predUid =>
          `<PredecessorLink><PredecessorUID>${predUid}</PredecessorUID><Type>1</Type><CrossProject>0</CrossProject><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`,
      )
      .join('');

    const attrs = [
      extendedAttribute('188743731', row.key),
      extendedAttribute('188743734', row.status),
      extendedAttribute('188743737', row.priority),
      extendedAttribute('188743740', row.labels),
      extendedAttribute('188743743', row.estimate),
    ].join('');

    /* Notes: opt-in description as inert plain text only — the model
       already stripped the markup (D-54-11); empty omits the element
       instead of writing the word undefined. */
    const notes = options.descriptions && row.description ? `<Notes>${esc(row.description)}</Notes>` : '';

    tasksXml.push(
      `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${esc(row.title)}</Name><Type>1</Type><Start>${start}</Start><Finish>${finish}</Finish><Duration>${duration}</Duration><DurationFormat>7</DurationFormat><Milestone>${isMilestone ? 1 : 0}</Milestone><Summary>${!row.parent && summaryIds.has(row.id) ? 1 : 0}</Summary><PercentComplete>${percent}</PercentComplete>${links}${attrs}${notes}</Task>`,
    );
  }
  const tasksBlock = tasksXml.length ? `<Tasks>${tasksXml.join('')}</Tasks>` : '';

  /* ---- Resources: distinct assignee names of the exported rows, in
       first-appearance order. The unassigned label is NOT a resource —
       rows carry assigneeId '' exactly when unassigned (T-54-19: the
       resource list is the exported rows' assignees only). ---- */
  const resourceNames = [];
  const resourceIndex = new Map();
  for (const row of rows) {
    const id = row?.assigneeId;
    if (!id) continue;
    const name = String(row.assigneeName || id);
    if (!resourceIndex.has(name)) {
      resourceIndex.set(name, resourceNames.length + 1);
      resourceNames.push(name);
    }
  }
  const resourcesBlock = resourceNames.length
    ? `<Resources>${resourceNames.map((name, i) => `<Resource><UID>${i + 1}</UID><ID>${i + 1}</ID><Name>${esc(name)}</Name><Type>1</Type></Resource>`).join('')}</Resources>`
    : '';

  /* ---- Assignments: one per task×resource pair, task-major order. ---- */
  const assignmentXml = [];
  let aUid = 0;
  for (const row of rows) {
    if (row.parent) continue; /* CR-01: child rows share the parent's id — the parent Task already carries the assignment */
    const id = row?.assigneeId;
    if (!id) continue;
    const name = String(row.assigneeName || id);
    const resourceUid = resourceIndex.get(name);
    const taskUid = uidOf.get(row.id);
    if (!resourceUid || taskUid === undefined) continue;
    aUid += 1;
    const { startISO, finishISO, minutes } = taskSchedule(row, fallbackStartISO);
    assignmentXml.push(
      `<Assignment><UID>${aUid}</UID><TaskUID>${taskUid}</TaskUID><ResourceUID>${resourceUid}</ResourceUID><PercentWorkComplete>${Math.max(0, Math.min(100, Math.round(Number(row.progress) || 0)))}</PercentWorkComplete><Start>${formatDateTime(startISO, '08:00:00')}</Start><Finish>${formatDateTime(finishISO, '17:00:00')}</Finish><Units>1</Units><Work>${isoDuration(minutes)}</Work></Assignment>`,
    );
  }
  const assignmentsBlock = assignmentXml.length ? `<Assignments>${assignmentXml.join('')}</Assignments>` : '';

  /* ---- Document, in the exact schema order (Pitfall 8). ---- */
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Project xmlns="http://schemas.microsoft.com/project">` +
    `<SaveVersion>12</SaveVersion>` +
    `<Name>${esc(proj.name)}</Name>` +
    `<Title>${esc(proj.name)}</Title>` +
    `<CreationDate>${formatDateTime(exportDateISO, '00:00:00')}</CreationDate>` +
    `<ScheduleFromStart>1</ScheduleFromStart>` +
    `<StartDate>${formatDateTime(projectStartISO, '08:00:00')}</StartDate>` +
    `<FinishDate>${formatDateTime(projectFinishISO, '17:00:00')}</FinishDate>` +
    `<CalendarUID>1</CalendarUID>` +
    `<DefaultStartTime>08:00:00</DefaultStartTime>` +
    `<DefaultFinishTime>17:00:00</DefaultFinishTime>` +
    `<MinutesPerDay>480</MinutesPerDay>` +
    `<MinutesPerWeek>2400</MinutesPerWeek>` +
    `<DaysPerMonth>20</DaysPerMonth>` +
    `<DurationFormat>7</DurationFormat>` +
    extendedAttributesBlock() +
    calendarsBlock() +
    tasksBlock +
    resourcesBlock +
    assignmentsBlock +
    `</Project>`
  );
}
