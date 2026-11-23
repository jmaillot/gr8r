/* =====================================================================
   GFS bucket math — Phase 92 (BKNAME-02, D-02): THE single pure
   definition of the Grandfather-Father-Son bucket assignment, shared by
   archive naming, the rotation pass, the kept-position badge, the
   bucket-at-creation write and the boot backfill sweep.

   isoWeekKey and assignGfsBuckets are relocated VERBATIM from server.js
   (the Phase 87/90 definitions beside gfsKeptPositions) — no logic
   edits; the pinned date tests (test/gfs-kept-until.test.mjs) keep
   passing unchanged across the move.

   Zero non-stdlib imports (the export/cron.js Wave-0 discipline): the
   walk is pure UTC calendar math, DST structurally irrelevant.

   gfsBucketFor(priorSucceededAsc, newRow) is the single-run entry
   point for bucket-at-creation: it batch-walks [...priorSucceededAsc,
   newRow] and returns the LAST entry's bucket — zero new math, exactly
   one definition. Callers MUST pass the prior succeeded runs in the
   rotation ordering (`created_at asc, id asc` — the Pitfall-1 tiebreak:
   a different order could store a bucket that disagrees with a future
   batch re-derivation for same-second runs).
   ===================================================================== */

const ISO_DAY_MS = 86_400_000;

/* ISO-8601 week key (UTC, nearest-Thursday algorithm) — the weekly-bucket
   label. Pure UTC math, no tz caching (tz.js discipline). */
function isoWeekKey(ms) {
  const d = new Date(ms);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  target.setUTCDate(target.getUTCDate() - ((target.getUTCDay() + 6) % 7) + 3); // nearest Thursday
  const isoYear = target.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3); // week-1 Thursday
  const week = 1 + Math.round((target.getTime() - jan4.getTime()) / (7 * ISO_DAY_MS));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/* D-10 exactly-one-bucket assignment over the task's succeeded runs OLDEST
   first: yearly when the run is the task's FIRST of its calendar year, else
   monthly when first of its calendar month, else weekly when first of its
   ISO week, else daily. A run holds exactly ONE bucket label (documented
   choice — RESEARCH Pattern 4 "exactly-one-bucket"). Task-scoped manual
   Run-now rows (trigger manual, task_id set) participate the same way —
   daily-tier candidates per D-10. */
function assignGfsBuckets(runsAsc) {
  const seenYears = new Set();
  const seenMonths = new Set();
  const seenWeeks = new Set();
  const out = new Map();
  for (const r of runsAsc) {
    const d = new Date(r.created_at);
    const year = d.getUTCFullYear();
    const month = `${year}-${d.getUTCMonth() + 1}`;
    const week = isoWeekKey(r.created_at);
    /* Mark ALL calendar positions seen — a yearly run is also that month's
       and that week's first run, but it holds only the yearly label: later
       runs must not inherit the monthly/weekly slots from it. */
    const newYear = !seenYears.has(year);
    const newMonth = !seenMonths.has(month);
    const newWeek = !seenWeeks.has(week);
    seenYears.add(year);
    seenMonths.add(month);
    seenWeeks.add(week);
    let bucket = 'daily';
    if (newYear) bucket = 'yearly';
    else if (newMonth) bucket = 'monthly';
    else if (newWeek) bucket = 'weekly';
    out.set(r.id, bucket);
  }
  return out;
}

/* Single-run form: the bucket for newRow given the task's prior succeeded
   runs (oldest first, rotation ordering). Returns 'daily'|'weekly'|
   'monthly'|'yearly'. newRow needs { id, created_at }. */
export function gfsBucketFor(priorSucceededAsc, newRow) {
  return assignGfsBuckets([...priorSucceededAsc, newRow]).get(newRow.id);
}

export { isoWeekKey, assignGfsBuckets };
