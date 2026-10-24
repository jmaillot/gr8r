/* =====================================================================
   QUIRE — core: utils, icons, seed data, store, render loop, events
   ===================================================================== */
import { dayBucketId, formatDate, formatRelativeDay, formatRelativeTime, t } from './i18n.js';

// Web fonts load without blocking first paint (the link starts as media=print).
document.querySelectorAll('link[data-font]').forEach(l => {
  l.media = 'all';
});
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- search ---------- */
/* The search folds both sides: NFD, then the combining marks are dropped, so "elodie"
   finds "Élodie". The map keeps the index of the ORIGINAL character behind every folded
   character, so a highlight computed on the folded text still lands on the right
   characters of the original string. */
export function foldForSearch(s) {
  const src = String(s ?? '').toLowerCase();
  let text = '';
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const folded = src[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const c of folded) {
      text += c;
      map.push(i);
    }
  }
  return { text, map };
}
export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/* The keyboard hint's modifier label, a lazy getter: the Ctrl half is interface text and
   reads the catalogue AT CALL TIME, so phase 8's live locale switch re-evaluates the hint on
   every render; the ⌘ symbol is a SYMBOL, not text, and stays a literal. (The old export was
   a module-load constant whose comment falsely claimed it re-evaluated on re-render.) */
export const modKey = () => (isMac ? '⌘' : t('common.ctrl'));

/* ---------- dates ---------- */
export const DAY = 864e5;
export const sod = d => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const TODAY = sod(new Date());
export const iso = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const parse = s => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addD = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const dOff = n => iso(addD(TODAY, n));
export const diffD = (a, b) => Math.round((sod(a) - sod(b)) / DAY);
/* The four English month and weekday name arrays lived here; every call site now reads the
   locale's own names through monthName() and weekdayName() (core/i18n.js), so no English month
   or weekday name survives in the sources. */
/* Set from preferences on every render (core/theme.js), so utils never depends on the store. */
export let dateFormat = 'MMM d';
export function setDateFormat(f) {
  dateFormat = f || 'MMM d';
}
export function fmtDate(s, long) {
  /* The date API delegates to the formatters: the locale owns the shape, and the pattern
     travels through untouched — 'MMM d' IS the 'auto' sentinel (D-04), while 'd/M', 'M/d' and
     'yyyy-MM-dd' are explicit choices that always win, in every locale. */
  return formatDate(s, { long: !!long, pattern: dateFormat });
}
export function relDate(s) {
  /* The date-format preference travels through: the hand-rolled relDate() fell through to
     fmtDate(), which honoured an explicit pattern, so the pattern must win here too. */
  return formatRelativeDay(s, { pattern: dateFormat });
}
export function ago(ts) {
  return formatRelativeTime(ts, { pattern: dateFormat });
}
export const minsAgo = m => Date.now() - m * 6e4;
/* The bucket is a STABLE id, never a label: the grouping key never depends on the language,
   and the label is mapped at render. */
export function dayBucket(ts) {
  return dayBucketId(ts);
}
