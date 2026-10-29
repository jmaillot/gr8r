/* =====================================================================
   core: i18n — the leaf layer over the JSON catalogues.
   It imports the catalogues and nothing else from the app, so the dependency graph
   stays acyclic: the renderer never enters this module.
   ===================================================================== */
import en from '../locales/en.json' with { type: 'json' };

export const BASE_LOCALE = 'en';
export const LOCALES = Object.freeze([
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
]);

/* The locale is a module-level mutable singleton, read at call time and never threaded
   through a signature — the house pattern of dateFormat in core/utils.js. */
let locale = BASE_LOCALE;

const catalogues = new Map();

/* Vite rewrites this into one chunk per locale; plain Node has no import.meta.glob, so the
   call throws and the catch leaves the loader map empty. */
let loaders = {};
try {
  loaders = import.meta.glob(['../locales/*.json', '!../locales/en.json']);
} catch {
  loaders = {};
}

export function registerCatalogue(code, data) {
  catalogues.set(code, data || {});
  return code;
}

/* A top-level call, so the static JSON import survives tree-shaking and the base catalogue
   is inlined in the entry chunk. */
registerCatalogue(BASE_LOCALE, en);

export function getLocale() {
  return locale;
}

/* The shared core of every locale change: it resolves the requested code against the
   registry — an unknown code resolves to the base locale rather than throwing, so a stale
   preference cannot brick the interface — sets the singleton synchronously, makes sure the
   catalogue is available, then points the document's language attribute at it. Outside a
   bundler the loader map is empty, so the catalogue stays absent and the English fallback
   applies: that is the documented behaviour, not an error. */
async function activateLocale(code) {
  const known = LOCALES.some(l => l.code === code);
  const target = known ? code : BASE_LOCALE;
  locale = target;
  if (!catalogues.has(target)) {
    const loader = loaders[`../locales/${target}.json`];
    if (loader) {
      const mod = await loader();
      registerCatalogue(target, (mod && mod.default) || mod);
    }
  }
  /* D-02: the document's language attribute follows the active locale — the boot
     path never hardcodes an initial language, and a screen reader or the
     browser's language-dependent features see the switched language, not a stale
     one. A process without a document — plain Node — simply skips it. */
  if (typeof document !== 'undefined' && document && document.documentElement) document.documentElement.lang = target;
  return target;
}

/* The locale switch: activate, then announce. The change is announced on the global
   document, never on an imported renderer: the dependency graph stays acyclic. The dispatch
   comes after the catalogue is ready, so a listener that re-renders sees the new language,
   not a promise of one. The event bubbles: the boot listener lives on window (main.js), and
   a non-bubbling event dispatched on the document never reaches it — the switch would set
   the language attribute while the interface stays in the old language (proven by the
   French overflow spec). */
export async function setLocale(code) {
  const target = await activateLocale(code);
  if (typeof document !== 'undefined' && document && typeof document.dispatchEvent === 'function') {
    document.dispatchEvent(new CustomEvent('projects:locale', { detail: { code: target }, bubbles: true }));
  }
  return target;
}

/* The boot variant of setLocale: the same resolution, catalogue load and document language,
   but no announcement. Before the first render the re-render listener would paint an
   uninitialised shell (the demo shell, flashing English), so every pre-render application
   — negotiation, account locale, the migration seed — goes through this and the one render
   that follows picks the language up. */
export async function primeLocale(code) {
  return activateLocale(code);
}

/* D-09: browser negotiation by language-subtag prefix, clamped to the registry. The first
   supported entry of the preference list wins; anything else resolves to the base locale.
   Pure and DOM-free: the list is the only input, and nothing is ever transmitted. */
export function negotiate(codes) {
  let list = codes;
  if (list === undefined && typeof navigator !== 'undefined' && navigator) {
    list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  }
  for (const c of Array.isArray(list) ? list : Array.from(list || [])) {
    const sub = String(c || '')
      .toLowerCase()
      .split('-')[0];
    if (LOCALES.some(l => l.code === sub)) return sub;
  }
  return BASE_LOCALE;
}

/* D-15: demo mode's persistence backend. A dedicated key, deliberately outside the
   projects.v2 blob, so the language can never re-enter the prefs/document pipeline. */
export const LOCALE_STORAGE_KEY = 'projects.locale';

export function storeLocale(code) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    /* storage blocked or absent */
  }
}

export function readStoredLocale() {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    return LOCALES.some(l => l.code === v) ? v : null;
  } catch {
    return null;
  }
}

/* The registry entries that have a catalogue behind them: the base locale, every registered
   code, and every locale the build ships a catalogue file for. */
export function availableLocales() {
  return LOCALES.filter(l => catalogues.has(l.code) || Object.hasOwn(loaders, `../locales/${l.code}.json`));
}

/* The one escaping table of the whole client: core/utils.js re-exports it as esc,
   so there is no second definition to diverge (IN-02). t() never calls it: the
   caller escapes at the point of interpolation. */
export function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(PLACEHOLDER, (m, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : m));
}

/* One rule instance per locale, cached: an Intl.PluralRules construction is expensive and the
   app re-renders often. The category always comes from the locale's CLDR data, never from a
   hand-written rule — French resolves 0 to one and 1000000 to many. */
const pluralRules = new Map();

function rulesFor(code) {
  let rules = pluralRules.get(code);
  if (!rules) {
    rules = new Intl.PluralRules(code);
    pluralRules.set(code, rules);
  }
  return rules;
}

/* A plural value is an object keyed by CLDR category. The selected member falls back to other;
   when other is missing too the value is unresolvable and t() returns the key. A missing count
   resolves to one when there is one, else to other, and never throws. */
function resolvePlural(value, vars) {
  const raw = vars ? vars.n : undefined;
  const count = raw === undefined || raw === null ? NaN : Number(raw);
  const category = Number.isFinite(count) ? rulesFor(locale).select(count) : 'one';
  const chosen = Object.hasOwn(value, category) ? value[category] : value.other;
  if (typeof chosen !== 'string') return undefined;
  return interpolate(chosen, vars);
}

export function t(key, vars) {
  const active = catalogues.get(locale);
  let value = active && Object.hasOwn(active, key) ? active[key] : undefined;
  if (value === undefined) {
    const base = catalogues.get(BASE_LOCALE);
    value = base && Object.hasOwn(base, key) ? base[key] : undefined;
  }
  if (typeof value === 'string') return interpolate(value, vars);
  if (value && typeof value === 'object') return resolvePlural(value, vars) ?? key;
  return key;
}

/* The key gate: true only when the catalogue actually resolves the key, so a caller can
   tell a real translation from t()'s return-the-key fallback (D-03). Leaf-module: plain-Node
   testable. */
export function has(key) {
  const active = catalogues.get(locale);
  if (active && Object.hasOwn(active, key)) return true;
  const base = catalogues.get(BASE_LOCALE);
  return !!(base && Object.hasOwn(base, key));
}

/* Translate a server error code; unknown code → the raw server message (D-03). */
export function tErr(code, params, raw) {
  const key = `err.${code}`;
  return has(key) ? t(key, params) : raw;
}

/* =====================================================================
   The formatters: the Intl primitives, the per-locale format table and
   the date, time and number surface.

   Every primitive is the platform's own Intl — no runtime dependency is
   added — and every instance is cached per (locale, option set), because
   an Intl constructor is expensive and the app re-renders often. The
   discipline is the one the plural rules already follow.

   The English output is frozen: it is the regression oracle of the
   hand-rolled fmtDate(), relDate(), ago(), dayBucket() and fsize() that
   these formatters replace. The French output is the roadmap's success
   criterion: '24/07/2026', a 24-hour clock and 'il y a 2 jours'.
   ===================================================================== */

/* One instance per (locale, option set). */
const dateTimeCache = new Map();
const numberCache = new Map();
const relativeCache = new Map();

const cacheKey = (code, options) => `${code}|${JSON.stringify(options)}`;

function dateTimeFor(code, options) {
  const key = cacheKey(code, options);
  let f = dateTimeCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(code, options);
    dateTimeCache.set(key, f);
  }
  return f;
}

function numberFor(code, options) {
  const key = cacheKey(code, options);
  let f = numberCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(code, options);
    numberCache.set(key, f);
  }
  return f;
}

function relativeFor(code, options) {
  const key = cacheKey(code, options);
  let f = relativeCache.get(key);
  if (!f) {
    f = new Intl.RelativeTimeFormat(code, options);
    relativeCache.set(key, f);
  }
  return f;
}

/* How each locale renders.

   Three entries are load-bearing, and each one is a measured decision:

   - date.base for 'en' is {month:'short', day:'numeric'} and NOT
     dateStyle:'short', because dateStyle:'short' renders '7/24/26' in
     English and the interface must keep rendering 'Jul 24'.
   - relativeStyle is 'narrow' for 'en' and 'long' everywhere else: the
     English compact durations ('5m ago') are part of the current
     appearance, and the French output is the long form.
   - the byte units are NOT in this table for the BASE locale: the English
     units are catalogue values (unit.byte, unit.kilobyte, unit.megabyte),
     read through t(), so the static scan can see them. Only the NON-base
     locales keep their tokens here, because D-02 freezes the French
     catalogue for phase 7 — fr.bytes is the migration point. */
const LOCALE_FORMATS = {
  en: {
    date: {
      base: { month: 'short', day: 'numeric' },
      withYear: { month: 'short', day: 'numeric', year: 'numeric' },
    },
    relativeStyle: 'narrow',
    /* The English output must stay byte-identical to what the hand-rolled
       formatters produced, and they never grouped thousands: a 1 023 KB file
       read '1023 KB'. Grouping is a locale's own habit, so it belongs to the
       non-base locales; the English one keeps the old shape until a
       deliberate change says otherwise. */
    number: { useGrouping: false },
  },
  fr: {
    date: {
      base: { day: '2-digit', month: '2-digit', year: 'numeric' },
      withYear: { day: '2-digit', month: '2-digit', year: 'numeric' },
    },
    relativeStyle: 'long',
    bytes: ['o', 'ko', 'Mo'],
  },
};

/* A locale the table does not carry: the platform's short date, the long
   relative style, and the catalogue's byte units. */
const FALLBACK_FORMATS = {
  date: {
    base: { dateStyle: 'short' },
    withYear: { dateStyle: 'short' },
  },
  relativeStyle: 'long',
};

function formatsFor(code) {
  return LOCALE_FORMATS[code] || FALLBACK_FORMATS;
}

/* The explicit date patterns: a user choice, hand-composed, in every
   locale. An explicit choice always wins over the locale form. */
const EXPLICIT_PATTERNS = new Set(['d/M', 'M/d', 'yyyy-MM-dd']);

/* The number of a megabyte: exactly one fraction digit, in the locale. */
const ONE_DECIMAL = { minimumFractionDigits: 1, maximumFractionDigits: 1 };

const DAY_MS = 864e5;

/* The local YYYY-MM-DD parser: an ISO date string is a LOCAL calendar
   day, never a UTC instant, so the day never shifts with the time zone. */
function parseDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

/* The value a formatter accepts: a Date, an ISO date string or a
   timestamp in milliseconds. */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value) : null;
  if (typeof value === 'string') {
    const parsed = parseDate(value);
    return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function timestampOf(value) {
  if (value instanceof Date) return value.getTime();
  return Number(value);
}

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* The calendar-day distance between two instants, rounded. */
function diffDays(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS);
}

/* The local YYYY-MM-DD of an instant. */
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* The option set without its year key. */
function withoutYear(options) {
  const out = {};
  for (const [k, v] of Object.entries(options)) {
    if (k !== 'year') out[k] = v;
  }
  return out;
}

/* The date format preference: 'MMM d' IS the 'auto' sentinel (D-04) — the
   document cannot distinguish a preference that was never touched from one
   the user explicitly picked as the default, and the default is 'MMM d'. A
   pure read: it never writes the preference bag and never touches the
   shared document. */
export function isAutoDateFmt(value) {
  return value === 'auto' || value === 'MMM d';
}

/* The date, in the locale's shape. */
export function formatDate(value, options = {}) {
  const d = toDate(value);
  if (!d) return '';
  const pattern = options.pattern;
  if (!isAutoDateFmt(pattern) && EXPLICIT_PATTERNS.has(pattern)) {
    if (pattern === 'yyyy-MM-dd') return isoDate(d);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const head = pattern === 'd/M' ? `${day}/${month}` : `${month}/${day}`;
    return options.long ? `${head}/${d.getFullYear()}` : head;
  }
  const fmts = formatsFor(locale);
  const year = options.year || 'auto';
  let opts;
  if (year === 'always') opts = fmts.date.withYear;
  else if (year === 'never') opts = withoutYear(fmts.date.base);
  else opts = options.long || d.getFullYear() !== new Date().getFullYear() ? fmts.date.withYear : fmts.date.base;
  return dateTimeFor(locale, opts).format(d);
}

/* The relative day: today, tomorrow, yesterday, then the weekday of a
   FUTURE offset of two to six days, then the date.

   The sign matters and the branch is asymmetric: the hand-rolled
   relDate() tested n > 1 && n < 7, so a date two days in the PAST fell
   through to fmtDate() and never showed a weekday.

   The options travel through to the date: the hand-rolled relDate() fell
   through to fmtDate(), which honoured the date-format preference, so an
   explicit pattern must win here too. */
export function formatRelativeDay(value, options = {}) {
  if (!value) return '';
  const d = toDate(value);
  if (!d) return '';
  const n = diffDays(d, new Date());
  if (n === 0) return t('common.today');
  if (n === 1) return t('common.tomorrow');
  if (n === -1) return t('common.yesterday');
  if (n > 1 && n < 7) return weekdayName(d, 'short');
  return formatDate(value, options);
}

/* The relative time. The thresholds mirror the hand-rolled ago() EXACTLY,
   including its rounding: a timestamp 40 seconds old is m = 1 and renders
   '1m ago', not 'just now'.

   The relative time is never built with numeric:'auto', which turns minus
   two days into 'avant-hier' in French. */
export function formatRelativeTime(timestamp, options = {}) {
  const ts = timestampOf(timestamp);
  if (!Number.isFinite(ts)) return '';
  const relative = { style: formatsFor(locale).relativeStyle, numeric: 'always' };
  const m = Math.round((Date.now() - ts) / 6e4);
  if (m < 1) return t('common.justNow');
  if (m < 60) return relativeFor(locale, relative).format(-m, 'minute');
  const h = Math.round(m / 60);
  if (h < 24) return relativeFor(locale, relative).format(-h, 'hour');
  const d = Math.round(h / 24);
  if (d < 7) return relativeFor(locale, relative).format(-d, 'day');
  return formatDate(isoDate(new Date(ts)), options);
}

/* The day bucket: a STABLE id, never a label. The label is mapped at
   render, so the grouping key never depends on the language. */
export function dayBucketId(timestamp) {
  const ts = timestampOf(timestamp);
  const n = diffDays(new Date(ts), new Date());
  if (n === 0) return 'today';
  if (n === -1) return 'yesterday';
  if (n > -7) return 'week';
  return 'earlier';
}

/* The label of a bucket id: a catalogue value. */
export function bucketLabel(id) {
  return t('bucket.' + id);
}

/* The number, in the locale's format. */
export function formatNumber(value, options = {}) {
  return numberFor(locale, { ...formatsFor(locale).number, ...options }).format(value);
}

/* The unit token of a file size: the locale's own table entry when it has
   one (the non-base locales, whose catalogue is frozen until phase 7),
   the catalogue's values otherwise. */
function byteUnit(fmts, index) {
  if (fmts.bytes) return fmts.bytes[index];
  if (index === 0) return t('unit.byte');
  if (index === 1) return t('unit.kilobyte');
  return t('unit.megabyte');
}

/* The file size. Intl's own unit style is NOT used: it renders '512 byte'
   and '1 kB', not '512 B' and '1 KB'. The number and the unit are
   formatted separately. */
export function formatFileSize(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b)) return '';
  const fmts = formatsFor(locale);
  if (b < 1024) return `${formatNumber(b)} ${byteUnit(fmts, 0)}`;
  if (b < 1048576) return `${formatNumber(Math.round(b / 1024))} ${byteUnit(fmts, 1)}`;
  return `${formatNumber(Number((b / 1048576).toFixed(1)), ONE_DECIMAL)} ${byteUnit(fmts, 2)}`;
}

/* The task estimate. Stored ASCII form ('30m', '2h', '2d') stays the document's
   value; this is a display-only formatter. English keeps the raw ASCII form,
   French renders a space + localized unit (min / h / j). Unknown or empty
   input returns it unchanged. */
const ESTIMATE_UNITS = { m: 'estimate.minutes', h: 'estimate.hours', d: 'estimate.days' };
export function fmtEstimate(est) {
  if (!est || typeof est !== 'string') return est || '';
  const m = est.match(/^(\d+)([mhd])$/);
  if (!m) return est;
  if (locale === BASE_LOCALE) return est;
  return `${m[1]} ${t(ESTIMATE_UNITS[m[2]])}`;
}

/* The clock. 'auto' follows the locale: a 12-hour clock in English, a
   24-hour clock in French. */
export function formatTime(value, options = {}) {
  const d = toDate(value);
  if (!d) return '';
  const cycle = options.cycle || 'auto';
  if (cycle === '12') return dateTimeFor(locale, { hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  if (cycle === '24') return dateTimeFor(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return dateTimeFor(locale, { timeStyle: 'short' }).format(d);
}

/* The name of a month, in the locale. */
export function monthName(value, style = 'long') {
  const d = toDate(value);
  if (!d) return '';
  return dateTimeFor(locale, { month: nameStyle(style) }).format(d);
}

/* The name of a weekday, in the locale. */
export function weekdayName(value, style = 'long') {
  const d = toDate(value);
  if (!d) return '';
  return dateTimeFor(locale, { weekday: nameStyle(style) }).format(d);
}

function nameStyle(style) {
  return style === 'short' || style === 'narrow' ? style : 'long';
}
