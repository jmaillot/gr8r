/* =====================================================================
   BACKUP CRON EVALUATOR — Phase 87 (87-01, BKBCK-03, D-04/D-08)
   =====================================================================
   Pure 5-field cron evaluator for backup_tasks.cron. The stored raw
   5-field string (D-04, one-way ratified 2026-11-21) is parsed here —
   never mutated, never re-derived from next_run_at (that column is a
   persisted cache, computed once per write and never re-parsed at tick).

   Lives at the repository ROOT beside export/backup.js and tz.js —
   never under src/ (the prohibition test fails the moment a src/
   module reaches this file). Zero new npm dependencies: parsing and
   timezone math are hand-rolled on Node's Intl stdlib only (T-87-01 —
   char-class whitelist parser, no eval/Function/exec usage, bounded scan).

   nextRunAt() NEVER caches formatters or offsets across evaluations
   (tz.js discipline: "DST is real"): a fresh Intl.DateTimeFormat is
   built per call and every candidate instant is measured with it, so
   spring-forward skips nonexistent wall times (the scan simply never
   observes them) and fall-back picks the earlier of the two ambiguous
   instants (the forward scan meets it first).

   Grammar (full matrix pinned by test/backup-cron.test.mjs):
     minute 0-59, hour 0-23, dom 1-31, month 1-12, dow 0-7 (0=7=Sunday)
     per field: star, comma lists, a-b ranges (with slash-n steps), star over n steps
     Vixie dom/dow OR when both restricted; a single restricted field
     wins; neither restricted matches every day.
   A malformed expression makes parseCron return null — callers refuse
   (keyed invalidSchedule) or disable; a stored bad cron never crashes
   a consumer.
   -------------------------------------------------------------------- */

const MINUTE_MS = 60_000;
/* Bounded horizon: one leap-year of minutes (~366 days). A cron that
   matches nothing inside the horizon (e.g. '0 0 29 2 *' queried far
   from any Feb 29) returns null — documented, never an infinite scan. */
const MAX_SCAN_MINUTES = 527_040;

/* Single cron field → Set of ints (or null when malformed). Char-class
   whitelist only: digits, '-', ',', '/', '*' — everything else refuses.
   Full grammar: star, lists, ranges a-b (a ≤ b, in-bounds), steps over
   star or over a range; a bare single value may not carry a step.
   dow is 0-7 with 0=7=Sunday (7 folds onto 0 per the vixie convention). */
function parseField(field, min, max, isDow) {
  if (typeof field !== 'string' || !field) return null;
  const out = new Set();
  const fold = v => (isDow && v === 7 ? 0 : v);
  for (const part of field.split(',')) {
    if (!part) return null;
    let range = part;
    let step = 1;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      range = part.slice(0, slash);
      const rest = part.slice(slash + 1);
      if (!/^\d+$/.test(rest)) return null;
      step = Number(rest);
      if (step < 1) return null;
    }
    if (range === '*') {
      for (let v = min; v <= max; v += step) out.add(fold(v));
      continue;
    }
    const rm = range.match(/^(\d+)-(\d+)$/);
    if (rm) {
      const lo = Number(rm[1]);
      const hi = Number(rm[2]);
      if (lo < min || hi > max || lo > hi) return null;
      for (let v = lo; v <= hi; v += step) out.add(fold(v));
      continue;
    }
    /* A bare single value carries no step ('5/10' is not vixie grammar). */
    if (slash !== -1 || !/^\d+$/.test(range)) return null;
    const v = Number(range);
    if (v < min || v > max) return null;
    out.add(fold(v));
  }
  return out;
}

/* Parse a 5-field cron expression → normalized field sets + restriction
   flags, or null when malformed. Field-set sizes decide restriction so
   a full-range step pattern behaves like an all-wildcard field. */
export function parseCron(expr) {
  if (typeof expr !== 'string') return null;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minute = parseField(fields[0], 0, 59);
  const hour = parseField(fields[1], 0, 23);
  const dom = parseField(fields[2], 1, 31);
  const mon = parseField(fields[3], 1, 12);
  const dow = parseField(fields[4], 0, 7, true);
  if (!minute || !hour || !dom || !mon || !dow) return null;
  return {
    minute,
    hour,
    dom,
    mon,
    dow,
    domRestricted: dom.size !== 31,
    dowRestricted: dow.size !== 7,
    /* Phase 94 (Rule 1 fix): restriction flags for describeCron's kind
       classification — a mon-restricted expression ("every day of February")
       is NOT a daily/weekly preset. Set-size based like its siblings. */
    monRestricted: mon.size !== 12,
  };
}

/* Phase 92 (D-04): the structured cron descriptor — derived from parseCron
   output ONLY (field Sets + restriction flags; the field-set SIZES decide
   restriction, so a full-range step pattern behaves like a wildcard).
   Classification: daily = dom+dow both unrestricted with singleton hour and
   minute; weekly = dow-only restricted with singleton dow; yearly = dom
   restricted with singleton dom AND singleton mon; monthly = dom restricted
   (singleton dom); everything else — steps, ranges, multi-values, any
   non-singleton set, mon-only restriction, vixie dom+dow OR — is `custom`,
   carrying ONLY `raw` (an honest fallback; a malformed expression whose
   parseCron is null lands here too). Always includes `raw`. NO server-side
   translated strings — the client localizes via t() keys (Phase 94).
   Phase 94 (D-02) additive descriptor growth: monthly/yearly also carry
   their singleton `dom` (+ `mon` for yearly) so the editor's dropdowns
   pre-select without ever re-parsing the raw string client-side. Existing
   descriptor keys are unchanged — the growth is additive only. */
export function describeCron(expr) {
  const p = parseCron(expr);
  if (!p) return { kind: 'custom', raw: String(expr) };
  const singleton = s => (s.size === 1 ? [...s][0] : null);
  const hour = singleton(p.hour);
  const minute = singleton(p.minute);
  const weekday = singleton(p.dow);
  const dom = singleton(p.dom);
  const mon = singleton(p.mon);
  const timeSingleton = hour !== null && minute !== null;
  if (!p.domRestricted && !p.dowRestricted && !p.monRestricted && timeSingleton) {
    return { kind: 'daily', hour, minute, raw: expr };
  }
  if (!p.domRestricted && !p.monRestricted && p.dowRestricted && weekday !== null && timeSingleton) {
    return { kind: 'weekly', weekday, hour, minute, raw: expr };
  }
  if (p.domRestricted && p.dom.size === 1 && p.mon.size === 1 && timeSingleton) {
    return { kind: 'yearly', dom, mon, hour, minute, raw: expr };
  }
  if (p.domRestricted && p.dom.size === 1 && timeSingleton) {
    return { kind: 'monthly', dom, hour, minute, raw: expr };
  }
  return { kind: 'custom', raw: expr };
}

/* Phase 94 (D-02): the flat preset string the backup-task editor
   reverse-maps — derived from the SAME parseCron output describeCron
   consumes (its kind projection; never a raw-string regex hack). Returns
   'daily'|'weekly'|'monthly'|'yearly' when the descriptor kind matches a
   builder preset, null for custom (steps, ranges, multi-values, mon-only
   restriction, vixie dom+dow OR) and malformed — the client renders the
   D-02 readonly custom fallback for null. Server-side ONLY: importing
   this from anything under src/ fails the prohibition test (T-87-11 —
   the client never evaluates cron). */
export function cronToPreset(expr) {
  const d = describeCron(expr);
  return d.kind === 'daily' || d.kind === 'weekly' || d.kind === 'monthly' || d.kind === 'yearly' ? d.kind : null;
}

/* Inline label→zone funnel — byte-equivalent to tz.js resolveTz, duplicated
   instead of imported so this module keeps zero non-stdlib imports (the
   Wave-0 acceptance pins "no imports beyond node builtins"). */
function resolveTz(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: v }).resolvedOptions().timeZone || 'Europe/Paris';
    } catch {
      /* RangeError — unknown zone: fall through to the tz.js fallback */
    }
  }
  return 'Europe/Paris';
}

/* dom/dow match — vixie semantics: both restricted → EITHER may fire;
   a single restricted field wins; neither restricted → every day. */
function dayMatches(p, dom, dow) {
  if (p.domRestricted && p.dowRestricted) return p.dom.has(dom) || p.dow.has(dow);
  if (p.domRestricted) return p.dom.has(dom);
  if (p.dowRestricted) return p.dow.has(dow);
  return true;
}

const DOW_BY_LABEL = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/* Next matching local wall-clock time ≥ fromMs + 1 minute, in tz, as epoch
   ms — or null when malformed or nothing matches inside the bounded
   horizon. Minute-by-minute forward scan over real elapsed time: a fresh
   formatter measures every candidate, so DST shifts are observed live and
   ambiguous/nonexistent wall times resolve per the header contract. */
export function nextRunAt(cron, tzLabel, fromMs = Date.now()) {
  const p = parseCron(cron);
  if (!p) return null;
  const zone = resolveTz(tzLabel);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const partsAt = ms => {
    const parts = fmt.formatToParts(ms);
    const get = t => parts.find(x => x.type === t)?.value;
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      hour: Number(get('hour')) % 24,
      minute: Number(get('minute')),
      dow: DOW_BY_LABEL[get('weekday')] ?? -1,
    };
  };
  /* Candidate = minute-aligned real time ≥ from+1min. Advancing by real
     minutes (never wall arithmetic) is what makes the DST contract hold. */
  let t = Math.floor((Number(fromMs) + MINUTE_MS) / MINUTE_MS) * MINUTE_MS;
  if (!Number.isFinite(t)) return null;
  let cur = partsAt(t);
  for (let scanned = 0; scanned < MAX_SCAN_MINUTES; ) {
    if (p.mon.has(Number(cur.date.slice(5, 7))) && dayMatches(p, Number(cur.date.slice(8, 10)), cur.dow)) {
      /* Matching day: scan its minutes until the wall date rolls over. */
      while (scanned < MAX_SCAN_MINUTES) {
        scanned++;
        if (p.hour.has(cur.hour) && p.minute.has(cur.minute)) return t;
        const next = partsAt(t + MINUTE_MS);
        t += MINUTE_MS;
        const rolled = next.date !== cur.date;
        cur = next;
        if (rolled) break;
      }
    } else {
      /* Day skipped: advance to (about) next local midnight, then nudge in
         30-minute steps until the wall date actually changes — DST shifts
         make pure wall arithmetic unreliable, so the date check is the
         authority. A skipped day costs a full day of the horizon. */
      scanned += 1440;
      t += (1440 - cur.hour * 60 - cur.minute) * MINUTE_MS;
      let next = partsAt(t);
      let guard = 0;
      while (next.date === cur.date && guard < 180) {
        t += 30 * MINUTE_MS;
        next = partsAt(t);
        guard++;
      }
      cur = next;
    }
  }
  return null;
}
