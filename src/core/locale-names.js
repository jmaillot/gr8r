/* =====================================================================
   core: locale-names — the native display names of the known locales.
   Pure data: no imports, no fs. It lives in src/ so the browser registry
   (core/i18n.js) can import it, and it is deliberately scan-friendly plain
   data: every name is a literal the i18n scan gate can read and whitelist
   (scripts/i18n-scan.mjs derives its LOCALE_NAMES exclusion from the same
   map, via scripts/locales.mjs). A language's name is its own name, never
   translated. A code the map does not know falls back to the raw code at
   the call site (D-07).
   ===================================================================== */
export const LOCALE_NAME_MAP = Object.freeze({
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  nl: 'Nederlands',
  ar: 'العربية',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  hi: 'हिन्दी',
  ru: 'Русский',
  tr: 'Türkçe',
  pl: 'Polski',
});
