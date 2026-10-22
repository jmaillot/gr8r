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

/* The locale switch: it resolves the requested code against the registry — an unknown code
   resolves to the base locale rather than throwing, so a stale preference cannot brick the
   interface — sets the singleton synchronously, then makes sure the catalogue is available.
   Outside a bundler the loader map is empty, so the catalogue stays absent and the English
   fallback applies: that is the documented behaviour, not an error. */
export async function setLocale(code) {
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
  return target;
}

/* The registry entries that have a catalogue behind them: the base locale, every registered
   code, and every locale the build ships a catalogue file for. */
export function availableLocales() {
  return LOCALES.filter(l => catalogues.has(l.code) || Object.hasOwn(loaders, `../locales/${l.code}.json`));
}

/* The module's own one-line escaper, the same table as esc() in core/utils.js. t() never
   calls it: the caller escapes at the point of interpolation. */
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
