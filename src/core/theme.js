/* ---------- theme ---------- */
import { setDateFormat } from './utils.js';
import { getLocale, setLocale } from './i18n.js';
import { S } from './store.js';

/* The label→code mapping (D-01): throwaway by design — phase 8 replaces the
   stored locale format, the selector and this mapping together. Only French is
   real this phase; every other stored label (English UK, Deutsch, Español,
   日本語, anything unknown) resolves to 'en' (D-03). */
const LANG_TO_LOCALE = { Français: 'fr' };

export function applyPrefs() {
  const r = document.documentElement,
    p = S.prefs;
  /* The guard is mandatory (07-RESEARCH loop-safety): applyPrefs runs at the top
     of every render and setLocale dispatches gr8r:locale unconditionally, so an
     unguarded call would create a render → applyPrefs → setLocale → event →
     render loop. */
  const target = LANG_TO_LOCALE[p.lang] || 'en';
  if (getLocale() !== target) setLocale(target);
  setDateFormat(p.dateFmt);
  if (p.theme === 'system') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', p.theme);
  if (p.accent === 'indigo') r.removeAttribute('data-accent');
  else r.setAttribute('data-accent', p.accent);
  r.setAttribute('data-side', p.side);
  r.setAttribute('data-density', p.density);
  if (p.motion === 'reduce') r.setAttribute('data-motion', 'reduce');
  else r.removeAttribute('data-motion');
}
export function effectiveDark() {
  if (S.prefs.theme === 'dark') return true;
  if (S.prefs.theme === 'light') return false;
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
}
