/* =====================================================================
   scripts: i18n-scan — the static source scan of the interface literals.

   It lives OUTSIDE src/ for the same reason scripts/icons.mjs does: the
   lucideSubset() walk in vite.config.js reads every .js file under src/,
   and a scanner full of English prose would sweep its own pattern strings
   into the icon bundle and change the frozen 174-name baseline.

   The scan answers one question — "is there a user-visible literal in the
   sources that nobody put in a catalogue?" — and it answers it by POSITION,
   not by a lexical blacklist: the same word is display text in one place and
   a machine identifier in another ('Member' is the roleLabel() fallback and
   a stored role id in the same file).

   Two check families:
     1. the literal families — ruleTextNode, ruleAttribute, ruleToast,
        ruleHelperArgument, ruleDisplayName, ruleProse, ruleDisplayLabel;
     2. the catalogue-key family — every literal t('…') key under src/ must
        resolve in the English catalogue, and its placeholders must match the
        vars passed at the call site (t() returns the key itself when it
        cannot resolve, and nothing else would ever notice).

   The allow-list (test/fixtures/i18n-pending.json) holds the literals that
   are not extracted yet. It is the progress meter: every extracted literal
   leaves it, and an empty list is the proof the sweep is finished.

   Plain Node, no dependency. Only node:fs, node:path and node:url.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/* The files that are never scanned. src/data/seed.js is demo CONTENT, not
   interface: its strings are data the interface shows, not interface text. */
export const EXCLUDED_FILES = new Set(['src/data/seed.js']);

/* ---------- the documented display helpers ----------
   A helper added to the interface must be added to this list: the argument
   indices below are the ones that carry DISPLAY text. An argument that is a
   machine value (a pref key, a geometry, an icon name) is simply not listed. */
export const DISPLAY_HELPERS = Object.freeze({
  empty: [1, 2], // empty(icon, title, text, btn, cls, level)
  H: [0, 1], // modal / page heading and its sub-heading
  srow: [0, 1], // srow(label, hint, control)
  I: [2, 4], // context-menu I(action, icon, label, extra, key hint)
  tog: [], // tog(prefKey, on, src) — the pref key is a machine id
  card: [0], // design-system card(caption, icon, inner)
  sk: [], // skeleton geometry only
  miniRow: [],
  actHtml: [],
  kcard: [],
  pageTitle: [],
  prop: [1], // drawer property (icon, label, value)
  formChip: [2], // form chip (popover, html, label)
  sItem: [1], // sidebar item (route, label, icon, opt)
  b: [1], // bottom-nav item (route, label, icon, extra)
  c: [0], // breadcrumb (label, attrs, current, icon)
  dl: [0], // day-bucket label (label, from, to)
  sec: [1], // search section (key, title, html)
});

/* The object properties whose value is DISPLAY text. `n` is the file-type
   table's display name, `action` the toast options' action-button label. */
const DISPLAY_PROPERTIES = new Set(['name', 'label', 'title', 'desc', 'text', 'hint', 'message', 'n', 'action']);

/* The attributes whose value is DISPLAY text. `value` is deliberately NOT
   here: a literal value is a form or machine value (value="list", value="all"). */
const DISPLAY_ATTRIBUTES = new Set(['aria-label', 'placeholder', 'title', 'alt', 'data-tip']);

/* ---------- the machine categories ----------
   A machine set excludes a value only in the POSITION it names — the same
   word in another position is display text and IS reported. A set that
   accumulates one entry per finding is a disguised allow-list: a value that
   belongs to no category is a missing RULE, and the rule is written. */

const HTTP_VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/* The key names the keyboard map matches on. */
const KEYBOARD_KEYS = new Set(['Enter', 'Escape', 'Esc', 'Tab', 'Backspace', 'Del', 'ArrowUp', 'ArrowDown']);

/* The role values the DOCUMENT stores (src/core/constants.js). The display of
   a role is a catalogue lookup, the id never changes. */
const ROLE_IDS = new Set(['Owner', 'Admin', 'Member', 'Guest']);

/* The English date arrays of src/core/utils.js (plan 06-04 deletes them). */
const MONTH_WEEKDAY_NAMES = new Set([
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
  'January',
  'February',
  'March',
  'April',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]);

/* The consts whose flat string array is a MACHINE list, not a display table. */
const MACHINE_CONSTS = new Set(['ROLES']);

/* The permission names the document stores and the interface compares against
   (src/overlays/modals.js): the DISPLAY of a stored value is a catalogue
   lookup, not the value itself. */
const STORED_VOCABULARY = new Set(['Can view', 'Can comment', 'Can edit', 'Full access']);

/* The stored preference values the application displays verbatim. Each entry
   is a stored value, not interface text; phase 8 (LOC-02, LOC-04) replaces
   the language list. */
const STORED_VALUES = new Set([
  '(GMT-08:00) Pacific Time', // the stored tz labels
  '(GMT-05:00) Eastern Time',
  '(GMT+00:00) London',
  '(GMT+01:00) Berlin',
  '(GMT+08:00) Singapore',
  '(GMT-07:00) Pacific Time',
  'English (US)', // the stored language names
  'English (UK)',
  'Deutsch',
  'Español',
  'Français',
  '日本語',
  'MMM d', // the stored date patterns
  'd/M',
  'M/d',
  'yyyy-MM-dd',
  'Head of Product', // the stored default member title (DEFAULT_PREFS.title)
]);

/* The demo content values that live outside src/data/seed.js and are shown to
   the user as stored data: the default member name and the default project
   name. They are data, not interface text. */
const DEMO_VALUES = new Set(['Tanjim Islam', 'Website Launch']);

/* The native names of the registered locales: the name of a language is the
   language's own name, never translated (src/core/i18n.js LOCALES). */
const LOCALE_NAMES = new Set(['English', 'Français']);

/* Every set whose values are excluded wherever they appear. */
const VALUE_EXCLUSIONS = new Set([...STORED_VOCABULARY, ...STORED_VALUES, ...DEMO_VALUES, ...LOCALE_NAMES]);

/* The objects whose every value is a display name: the const name ends with
   NAMES, LABELS, TITLES or HEADINGS (ROUTE_NAMES, ROLE_LABELS, sortName). */
const DISPLAY_TABLE_CONST = /(names?|labels?|titles?|headings?)$/i;

/* ---------- shapes ---------- */

const LOWERCASE_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DOTTED_KEY = /^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
const DISPLAY_WORD = /^[A-Z][A-Za-z0-9]{2,}$/; // a single-word capitalised label
const PROSE = /^[A-Z].*\s/; // begins with a capital and holds a space
const PLACEHOLDER = /\{(\w+)\}/g;
const HOLE = '\u0000';

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  times: '×',
  check: '✓',
  laquo: '«',
  raquo: '»',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const key = name.toLowerCase();
    return Object.hasOwn(ENTITIES, key) ? ENTITIES[key] : m;
  });
}

/* ---------- the lexer ---------- */

const IDENT_START = /[A-Za-z_$]/;
const REGEX_PRECEDERS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const PUNCTUATORS = [
  '===',
  '!==',
  '>>>',
  '...',
  '=>',
  '==',
  '!=',
  '&&',
  '||',
  '??',
  '?.',
  '<=',
  '>=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**',
  '++',
  '--',
  '<<',
  '>>',
];

function decodeEscapes(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, c) => {
    if (c[0] === 'u' && c[1] === '{') return String.fromCodePoint(parseInt(c.slice(2, -1), 16));
    if (c[0] === 'u') return String.fromCharCode(parseInt(c.slice(1), 16));
    if (c[0] === 'x') return String.fromCharCode(parseInt(c.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }[c] ?? c;
  });
}

function readStringAt(src, i) {
  const quote = src[i];
  let j = i + 1;
  let raw = '';
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') {
      raw += c + (src[j + 1] ?? '');
      j += 2;
      continue;
    }
    if (c === quote) {
      j++;
      break;
    }
    raw += c;
    j++;
  }
  return { raw, end: j };
}

function findExprEnd(src, i) {
  let depth = 0;
  let j = i;
  while (j < src.length) {
    const c = src[j];
    if (c === '{' || c === '(' || c === '[') {
      depth++;
      j++;
      continue;
    }
    if (c === '}' || c === ')' || c === ']') {
      depth--;
      if (depth === 0) return j;
      j++;
      continue;
    }
    if (c === '"' || c === "'") {
      j = readStringAt(src, j).end;
      continue;
    }
    if (c === '`') {
      j = skipTemplate(src, j);
      continue;
    }
    if (c === '/' && src[j + 1] === '/') {
      while (j < src.length && src[j] !== '\n') j++;
      continue;
    }
    if (c === '/' && src[j + 1] === '*') {
      const e = src.indexOf('*/', j + 2);
      j = e < 0 ? src.length : e + 2;
      continue;
    }
    j++;
  }
  return src.length;
}

function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '`') return j + 1;
    if (c === '$' && src[j + 1] === '{') {
      j = findExprEnd(src, j + 1) + 1;
      continue;
    }
    j++;
  }
  return j;
}

function readTemplateAt(src, i) {
  const quasis = [];
  const exprs = [];
  let j = i + 1;
  let curStart = j;
  let cur = '';
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') {
      cur += c + (src[j + 1] ?? '');
      j += 2;
      continue;
    }
    if (c === '`') {
      quasis.push({ text: cur, start: curStart, end: j });
      j++;
      break;
    }
    if (c === '$' && src[j + 1] === '{') {
      quasis.push({ text: cur, start: curStart, end: j });
      cur = '';
      const close = findExprEnd(src, j + 1);
      exprs.push({ tokens: lex(src, j + 2, close).tokens, start: j + 2, end: close });
      j = close + 1;
      curStart = j;
      continue;
    }
    cur += c;
    j++;
  }
  return { quasis, exprs, end: j };
}

function regexAllowed(prev) {
  if (!prev) return true;
  if (prev.type === 'num' || prev.type === 'str' || prev.type === 'template' || prev.type === 'regex') return false;
  if (prev.type === 'ident') return REGEX_PRECEDERS.has(prev.value);
  if (prev.type === 'punc') return !')]}'.includes(prev.value);
  return true;
}

function lex(src, from = 0, to = src.length) {
  const tokens = [];
  let i = from;
  while (i < to) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < to && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? to : Math.min(e + 2, to);
      continue;
    }
    if (c === '"' || c === "'") {
      const s = readStringAt(src, i);
      tokens.push({ type: 'str', value: decodeEscapes(s.raw), raw: s.raw, start: i, end: s.end });
      i = s.end;
      continue;
    }
    if (c === '`') {
      const t = readTemplateAt(src, i);
      tokens.push({ type: 'template', quasis: t.quasis, exprs: t.exprs, start: i, end: t.end });
      i = t.end;
      continue;
    }
    if (c >= '0' && c <= '9') {
      const m = /^[0-9][0-9_]*(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(src.slice(i, to));
      const len = m ? m[0].length : 1;
      tokens.push({ type: 'num', value: src.slice(i, i + len), start: i, end: i + len });
      i += len;
      continue;
    }
    if (IDENT_START.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i, to));
      tokens.push({ type: 'ident', value: m[0], start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    if (c === '/' && regexAllowed(tokens[tokens.length - 1])) {
      let j = i + 1;
      let inClass = false;
      while (j < to) {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        else if (d === '\n') break;
        j++;
      }
      if (src[j] === '/') {
        let k = j + 1;
        while (k < to && /[a-z]/.test(src[k])) k++;
        tokens.push({ type: 'regex', value: src.slice(i, k), start: i, end: k });
        i = k;
        continue;
      }
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (PUNCTUATORS.some(p => p.length === 3 && p === three)) {
      tokens.push({ type: 'punc', value: three, start: i, end: i + 3 });
      i += 3;
      continue;
    }
    if (PUNCTUATORS.some(p => p.length === 2 && p === two)) {
      tokens.push({ type: 'punc', value: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    tokens.push({ type: 'punc', value: c, start: i, end: i + 1 });
    i += 1;
  }
  return { tokens };
}

/* ---------- the structure pass ---------- */

/* The token stream is split into brackets, and every token is told which
   call, array or object it belongs to, and in which slot. */
function analyse(tokens) {
  const n = tokens.length;
  const ctx = new Array(n).fill(null);
  const frames = [];
  const stack = [];

  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    if (t.type === 'punc' && (t.value === '(' || t.value === '[' || t.value === '{')) {
      const frame = {
        type: t.value === '(' ? 'call' : t.value === '[' ? 'array' : 'object',
        open: i,
        close: -1,
        callee: null,
        constName: null,
        elements: null,
        machineList: false,
      };
      if (frame.type === 'call') {
        const p = tokens[i - 1];
        frame.callee = p && p.type === 'ident' ? p.value : null;
      }
      frames.push(frame);
      stack.push(frame);
      ctx[i] = { frame, call: null, array: null, object: null };
      continue;
    }
    if (t.type === 'punc' && (t.value === ')' || t.value === ']' || t.value === '}')) {
      const frame = stack.pop();
      if (frame) frame.close = i;
      ctx[i] = { frame, call: null, array: null, object: null };
      continue;
    }
    ctx[i] = { frame: stack.length ? stack[stack.length - 1] : null, call: null, array: null, object: null };
  }

  /* The const an array or an object is assigned to. */
  for (let i = 0; i + 2 < n; i++) {
    const t = tokens[i];
    if (t.type !== 'ident' || (t.value !== 'const' && t.value !== 'let' && t.value !== 'var')) continue;
    const name = tokens[i + 1];
    const eq = tokens[i + 2];
    if (!name || name.type !== 'ident' || !eq || eq.type !== 'punc' || eq.value !== '=') continue;
    const holder = ctx[i + 3];
    if (holder && holder.frame && (holder.frame.type === 'array' || holder.frame.type === 'object')) holder.frame.constName = name.value;
  }

  /* The property separators of every object: a ':' that ends a property is
     not the ':' that ends a ternary branch. */
  const separators = new Set();

  for (const frame of frames) {
    if (frame.close < 0) continue;
    const groups = splitTop(tokens, frame.open + 1, frame.close);
    if (frame.type === 'call') {
      groups.forEach(([gs, ge], index) => {
        for (let k = gs; k < ge; k++) {
          if (ctx[k].frame === frame) ctx[k].call = { callee: frame.callee, argIndex: index };
        }
      });
    } else if (frame.type === 'array') {
      frame.elements = groups;
      frame.machineList = groups.every(([gs]) => {
        const e = tokens[gs];
        if (!e || e.type !== 'str') return false;
        return ROLE_IDS.has(e.value) || MONTH_WEEKDAY_NAMES.has(e.value) || STORED_VOCABULARY.has(e.value);
      });
      groups.forEach(([gs, ge], index) => {
        for (let k = gs; k < ge; k++) {
          if (ctx[k].frame === frame) ctx[k].array = { elemIndex: index, frame };
        }
      });
    } else {
      frame.elements = groups;
      groups.forEach(([gs, ge]) => {
        const sep = propertySeparator(tokens, gs, ge);
        if (sep < 0) return;
        separators.add(sep);
        const keyTokens = tokens.slice(gs, sep).filter(t => t.type === 'ident' || t.type === 'str');
        const key = keyTokens.length ? keyTokens[keyTokens.length - 1] : null;
        const propName = key && key.type === 'ident' ? key.value : null;
        const propIsKey = !!key && key.type === 'str';
        for (let k = sep + 1; k < ge; k++) {
          if (ctx[k].frame === frame) ctx[k].object = { propName, propIsKey };
        }
      });
    }
  }

  return { ctx, separators };
}

function splitTop(tokens, from, to) {
  const groups = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < to; i++) {
    const t = tokens[i];
    if (t.type !== 'punc') continue;
    if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
    else if (t.value === ')' || t.value === ']' || t.value === '}') depth--;
    else if (t.value === ',' && depth === 0) {
      groups.push([start, i]);
      start = i + 1;
    }
  }
  groups.push([start, to]);
  return groups;
}

/* The separator of an object property: the first ':' at depth zero that does
   not close a ternary. */
function propertySeparator(tokens, from, to) {
  let depth = 0;
  let ternary = 0;
  for (let i = from; i < to; i++) {
    const t = tokens[i];
    if (t.type !== 'punc') continue;
    if (t.value === '(' || t.value === '[' || t.value === '{') {
      depth++;
      continue;
    }
    if (t.value === ')' || t.value === ']' || t.value === '}') {
      depth--;
      continue;
    }
    if (depth !== 0) continue;
    if (t.value === '?') {
      ternary++;
      continue;
    }
    if (t.value === ':') {
      if (ternary > 0) {
        ternary--;
        continue;
      }
      return i;
    }
  }
  return -1;
}

/* ---------- the machine-identifier guards ---------- */

function isMachineLexical(text) {
  if (LOWERCASE_TOKEN.test(text)) return true; // a lowercase machine token
  if (DOTTED_KEY.test(text)) return true; // a catalogue key
  if (text.startsWith('--')) return true; // a CSS custom property
  if (/^[${<#/]/.test(text)) return true; // markup, a path, a fragment
  if (text.includes('://')) return true; // a URL
  if (/^[0-9a-f]{6}$/i.test(text)) return true; // a hex colour
  if (isCssValue(text)) return true; // a CSS declaration value
  if (isSvgPathData(text)) return true; // an SVG path
  return false;
}

/* A CSS value: a custom-property reference, a colour, a length, a keyword or
   a CSS function. They are styling, never interface text. */
function isCssValue(text) {
  if (/^var\(--/.test(text)) return true;
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return true;
  if (/^-?[0-9.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|s|ms|fr|deg)$/.test(text)) return true;
  if (/^(none|auto|inherit|initial|unset|transparent|currentColor|currentcolor)$/.test(text)) return true;
  if (/^(color-mix|linear-gradient|radial-gradient|translate|rotate|scale|calc|var|rgb|rgba|hsl|hsla)\(/.test(text)) return true;
  if (/^[\d.]+(px|rem|em|%)$/.test(text)) return true;
  /* A CSS declaration: a property, a colon and a value. */
  if (/^[a-z-]+\s*:/.test(text) && /(var\(--|;|px\b|solid|dashed|none|inherit|!important)/.test(text)) return true;
  return false;
}

/* An SVG path: commands, digits and separators only. A word of two lowercase
   letters would mean it is prose, not a path. */
function isSvgPathData(text) {
  if (!/^[A-Za-z0-9.,\-+ ]+$/.test(text)) return false;
  if (!/[0-9]/.test(text)) return false;
  return !/[a-z]{2}/.test(text);
}

/* A literal that holds MARKUP is not interface text: it is scanned as HTML,
   so the text nodes and the display attributes inside it are found instead. */
function looksLikeMarkup(text) {
  return text.includes('<') || text.includes('="');
}

const COMPARISON_OPS = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'];

function isComparisonOperand(tokens, index) {
  const prev = tokens[index - 1];
  const next = tokens[index + 1];
  if (prev && prev.type === 'punc' && COMPARISON_OPS.includes(prev.value)) return true;
  if (next && next.type === 'punc' && COMPARISON_OPS.includes(next.value)) return true;
  return false;
}

function hasLetters(text) {
  const m = text.match(/[A-Za-z]/g);
  return !!m && m.length >= 2;
}

/* A capitalised word: the filter that keeps the machine identifiers and the
   connective fragments ("and", "of", "in") out of the findings. The rules of
   this scan are capitalisation-based, so a literal without a capitalised word
   is not a literal this scan can carry. */
function hasCapitalWord(text) {
  return /(^|[^A-Za-z])[A-Z]/.test(text);
}

/* ---------- the rule families ---------- */

function emit(findings, file, lineAt, offset, kind, text) {
  findings.push({ file, line: lineAt(offset), col: offset, kind, text });
}

/* An HTML text node: the content between > and < inside a template. */
function ruleTextNode(text, offset, file, findings, lineAt) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (/^&[a-z]+;$/i.test(trimmed)) return; // a pure entity
  if (!hasLetters(trimmed)) return;
  if (!hasCapitalWord(trimmed)) return;
  emit(findings, file, lineAt, offset, 'ruleTextNode', decodeEntities(trimmed));
}

/* A display attribute value. */
function ruleAttribute(name, value, offset, file, findings, lineAt) {
  if (!DISPLAY_ATTRIBUTES.has(name)) return;
  const trimmed = value.trim();
  if (!hasLetters(trimmed)) return;
  if (!hasCapitalWord(trimmed)) return;
  emit(findings, file, lineAt, offset, 'ruleAttribute', decodeEntities(trimmed));
}

/* The HTML of a template literal: the text nodes and the display attributes. */
function scanTemplateHtml(tpl, file, findings, lineAt) {
  let html = '';
  const map = [];
  tpl.quasis.forEach((q, qi) => {
    for (let k = 0; k < q.text.length; k++) {
      html += q.text[k];
      map.push(q.start + k);
    }
    if (qi < tpl.exprs.length) {
      html += HOLE;
      map.push(tpl.exprs[qi].start);
    }
  });

  const flush = (from, to) => {
    let p = from;
    while (p < to) {
      const next = html.indexOf(HOLE, p);
      const end = next < 0 || next > to ? to : next;
      let seg = html.slice(p, end);
      let segStart = p;
      const lead = seg.length - seg.trimStart().length;
      segStart += lead;
      ruleTextNode(seg, map[segStart] ?? map[p] ?? p, file, findings, lineAt);
      if (next < 0 || next >= to) break;
      p = next + 1;
    }
  };

  let i = 0;
  let textStart = 0;
  while (i < html.length) {
    if (html[i] === '<' && /^<\/?[a-zA-Z]/.test(html.slice(i))) {
      flush(textStart, i);
      i = scanTag(html, i, map, file, findings, lineAt);
      textStart = i;
      continue;
    }
    i++;
  }
  flush(textStart, html.length);
}

/* The tag that starts at `i`: its display attributes, then the index after
   the tag. A <style> or <script> element is skipped whole. */
function scanTag(html, i, map, file, findings, lineAt) {
  let j = i + 1;
  let quote = null;
  while (j < html.length) {
    const c = html[j];
    if (quote) {
      if (c === quote) quote = null;
      j++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      j++;
      continue;
    }
    if (c === '>') break;
    j++;
  }
  const content = html.slice(i + 1, j);
  const nameMatch = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(i));
  const tagName = nameMatch ? nameMatch[1].toLowerCase() : '';
  scanAttributes(content, i + 1, map, file, findings, lineAt);
  const end = j + 1;
  if (tagName === 'style' || tagName === 'script') {
    const close = html.toLowerCase().indexOf(`</${tagName}`, end);
    return close < 0 ? html.length : close;
  }
  return end;
}

function scanAttributes(content, start, map, file, findings, lineAt) {
  let i = 0;
  while (i < content.length) {
    const m = /^[A-Za-z_:][-A-Za-z0-9_:.]*/.exec(content.slice(i));
    if (!m) {
      i++;
      continue;
    }
    const name = m[0];
    let j = i + m[0].length;
    while (j < content.length && /\s/.test(content[j])) j++;
    if (content[j] !== '=') {
      i = j;
      continue;
    }
    j++;
    while (j < content.length && /\s/.test(content[j])) j++;
    const quote = content[j];
    if (quote !== '"' && quote !== "'") {
      i = j;
      continue;
    }
    const end = content.indexOf(quote, j + 1);
    if (end < 0) break;
    const value = content.slice(j + 1, end);
    const valueStart = start + j + 1;
    if (!value.includes(HOLE)) {
      ruleAttribute(name, value, map[valueStart] ?? valueStart, file, findings, lineAt);
    } else {
      /* A value that mixes a hole and literal text: the literal part is
         reported, the hole is code and is handled by the code rules. */
      let p = 0;
      while (p < value.length) {
        const next = value.indexOf(HOLE, p);
        const stop = next < 0 ? value.length : next;
        const seg = value.slice(p, stop);
        if (seg.trim()) {
          const lead = seg.length - seg.trimStart().length;
          ruleAttribute(name, seg, map[valueStart + p + lead] ?? valueStart, file, findings, lineAt);
        }
        if (next < 0) break;
        p = next + 1;
      }
    }
    i = end + 1;
  }
}

/* ---------- the code-level families ---------- */

function isImportSpecifier(tokens, index) {
  for (let i = index - 1; i >= 0 && i >= index - 60; i--) {
    const t = tokens[i];
    if (t.type === 'ident' && t.value === 'import') return true;
    if (t.type === 'punc' && t.value === ';') return false;
  }
  return false;
}

/* An element of an array literal is a display label when it is a capitalised
   word and the array is not a machine list. */
function isDisplayTableElement(tokens, info, index) {
  const slot = info.ctx[index].array;
  if (!slot) return false;
  const group = slot.frame.elements[slot.elemIndex];
  if (!group) return false;
  const t = tokens[group[0]];
  if (!t || t.type !== 'str') return false;
  const text = t.value.trim();
  if (!DISPLAY_WORD.test(text) && !PROSE.test(text)) return false;
  return !slot.frame.machineList;
}

/* A ternary branch: the consequent after a '?', the alternate after the ':'
   that closes the ternary. */
function isTernaryBranch(tokens, info, index) {
  const prev = tokens[index - 1];
  const next = tokens[index + 1];
  if (prev && prev.type === 'punc' && prev.value === '?') return true;
  if (prev && prev.type === 'punc' && prev.value === ':' && !info.separators.has(index - 1)) return true;
  if (next && next.type === 'punc' && next.value === ':' && !info.separators.has(index + 1)) return true;
  return false;
}

/* The right-hand side of a `||` whose left-hand side is a member expression,
   a call or an attribute read. */
function isFallback(tokens, index) {
  const prev = tokens[index - 1];
  if (!prev || prev.type !== 'punc' || prev.value !== '||') return false;
  const lhs = tokens[index - 2];
  if (!lhs) return false;
  if (lhs.type === 'ident') return true;
  if (lhs.type === 'punc' && (lhs.value === ')' || lhs.value === ']')) return true;
  return false;
}

function isReturnValue(tokens, index) {
  const prev = tokens[index - 1];
  return !!prev && prev.type === 'ident' && prev.value === 'return';
}

function isPlainTextTemplate(tpl) {
  return !tpl.quasis.some(q => q.text.includes('<'));
}

/* A plain string that holds markup is treated like a template whose holes are
   the `${…}` sequences it carries: the literal parts are interface, the holes
   are code. */
function pseudoTemplate(raw, start) {
  const quasis = [];
  const exprs = [];
  let i = 0;
  let cur = '';
  let curStart = start;
  while (i < raw.length) {
    if (raw[i] === '$' && raw[i + 1] === '{') {
      quasis.push({ text: cur, start: curStart, end: start + i });
      cur = '';
      const close = raw.indexOf('}', i + 2);
      const end = close < 0 ? raw.length : close;
      exprs.push({ tokens: lex(raw.slice(i + 2, end)).tokens, start: start + i + 2, end: start + end });
      i = close < 0 ? raw.length : close + 1;
      curStart = start + i;
      continue;
    }
    cur += raw[i];
    i++;
  }
  quasis.push({ text: cur, start: curStart, end: start + raw.length });
  return { quasis, exprs };
}

/* A computed member read: obj['key']. The bracket of an ARRAY LITERAL is not
   one — there the token before the bracket is punctuation, never an
   expression. */
function isComputedMember(tokens, index) {
  const open = tokens[index - 1];
  if (!open || open.type !== 'punc' || open.value !== '[') return false;
  const before = tokens[index - 2];
  if (!before) return false;
  if (before.type === 'ident' || before.type === 'str' || before.type === 'template') return true;
  if (before.type === 'punc' && (before.value === ')' || before.value === ']')) return true;
  return false;
}

/* A display label shape: a single capitalised word, or a capitalised
   phrase. The D-positions (a tuple label, a display table, a fallback, a
   returned label) carry DISPLAY LABELS, so they carry this shape — a
   lowercase fragment ('task/', 'is not') is machine or grammar, not a label. */
function isDisplayShape(text) {
  return DISPLAY_WORD.test(text) || PROSE.test(text);
}

/* The display position of a token, or null. */
function displayPosition(tokens, info, index, text) {
  const slot = info.ctx[index];
  const call = slot.call;
  const object = slot.object;
  if (call && call.callee === 'toast' && call.argIndex === 0) return 'ruleToast';
  if (call && call.callee === 'mutate' && call.argIndex === 1) return 'ruleToast';
  if (call && call.callee && DISPLAY_HELPERS[call.callee]?.includes(call.argIndex)) return 'ruleHelperArgument';
  if (object && DISPLAY_PROPERTIES.has(object.propName)) return 'ruleDisplayName';
  if (object && slot.frame?.constName && DISPLAY_TABLE_CONST.test(slot.frame.constName)) return 'ruleDisplayName';
  if (object && isDisplayTableObject(tokens, info, index)) return 'ruleDisplayName';
  if (!isDisplayShape(text)) return null;
  if (isDisplayTableElement(tokens, info, index)) return 'ruleDisplayLabel';
  if (isTernaryBranch(tokens, info, index)) return 'ruleDisplayLabel';
  if (isFallback(tokens, index)) return 'ruleDisplayLabel';
  if (isReturnValue(tokens, index)) return 'ruleDisplayLabel';
  if (isDefaultValue(tokens, index)) return 'ruleDisplayLabel';
  if (isConcatenationOperand(tokens, index)) return 'ruleDisplayLabel';
  return null;
}

/* A LOOKUP TABLE of display names: an object literal that is immediately
   indexed (`{ status: 'Status', … }[v.group]`). A machine map of the same
   shape (`{ owner: 'Owner' }`) is not indexed where it is written, so it
   stays out — the position is what tells them apart. */
function isDisplayTableObject(tokens, info, index) {
  const slot = info.ctx[index];
  if (!slot.object || slot.object.propIsKey) return false;
  const frame = slot.frame;
  if (!frame.elements || frame.close < 0) return false;
  const after = tokens[frame.close + 1];
  if (!after || after.type !== 'punc' || after.value !== '[') return false;
  let values = 0;
  for (const [gs, ge] of frame.elements) {
    const sep = propertySeparator(tokens, gs, ge);
    if (sep < 0) return false;
    for (let k = sep + 1; k < ge; k++) {
      const t = tokens[k];
      if (t.type === 'str') {
        const text = t.value.trim();
        if (!DISPLAY_WORD.test(text) && !PROSE.test(text)) return false;
        values++;
      }
    }
  }
  return values > 0;
}

/* The default value of a parameter: `const nav = (next = 'Continue') => …`. */
function isDefaultValue(tokens, index) {
  const prev = tokens[index - 1];
  if (!prev || prev.type !== 'punc' || prev.value !== '=') return false;
  const name = tokens[index - 2];
  if (!name || name.type !== 'ident') return false;
  const frame = tokens[index - 3];
  if (!frame || frame.type !== 'punc' || frame.value !== '(') return false;
  const before = tokens[index - 4];
  if (before && before.type === 'ident' && !['return', 'typeof', 'await', 'yield'].includes(before.value)) return false;
  return true;
}

/* An operand of a `+` concatenation: the label of a composed message. */
function isConcatenationOperand(tokens, index) {
  const prev = tokens[index - 1];
  const next = tokens[index + 1];
  if (prev && prev.type === 'punc' && prev.value === '+') return true;
  if (next && next.type === 'punc' && next.value === '+') return true;
  return false;
}

/* The string literals of a token stream. */
function scanStringLiterals(tokens, file, findings, lineAt, info, catalogue) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'str') continue;
    const text = t.value.trim();
    if (!text || !hasLetters(text)) continue;
    if (VALUE_EXCLUSIONS.has(text)) continue;

    /* A literal that holds MARKUP is a fragment of interface, not interface
       text: it is scanned as HTML, so the text nodes and the display
       attributes it carries are the findings. */
    if (looksLikeMarkup(t.value)) {
      const pseudo = pseudoTemplate(t.value, t.start);
      scanTemplateHtml(pseudo, file, findings, lineAt);
      for (const expr of pseudo.exprs) scanTokens(expr.tokens, file, findings, lineAt, catalogue, 1);
      continue;
    }
    if (isMachineLexical(text)) continue;

    /* The machine positions come first: a comparison operand, a switch case,
       an object key, an import specifier, a computed member. */
    const slot = info.ctx[i];
    const prev = tokens[i - 1];
    if (prev && prev.type === 'ident' && (prev.value === 'case' || prev.value === 'default')) continue;
    if (prev && prev.type === 'ident' && prev.value === 'from' && isImportSpecifier(tokens, i)) continue;
    if (isComputedMember(tokens, i)) continue;
    if (slot.object && slot.object.propIsKey) continue;
    if (isComparisonOperand(tokens, i)) continue;
    if (slot.call && slot.call.callee === 'includes') continue;
    if (slot.call && slot.call.callee === 'call' && slot.call.argIndex === 0) continue;
    if (slot.object && slot.object.propName === 'role') continue;
    if (slot.array && slot.frame.machineList) continue;
    if (slot.array && slot.frame.constName && MACHINE_CONSTS.has(slot.frame.constName)) continue;

    let kind = displayPosition(tokens, info, i, text);
    if (!kind && PROSE.test(text)) kind = 'ruleProse';
    if (!kind) continue;
    emit(findings, file, lineAt, t.start, kind, text);
  }
}

/* The plain-text templates that carry a display message. */
function scanDisplayTemplates(tokens, file, findings, lineAt, info) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'template') continue;
    if (!isPlainTextTemplate(t)) continue;
    const kind = displayPosition(
      tokens,
      info,
      i,
      t.quasis
        .map(q => q.text)
        .join(' ')
        .trim(),
    );
    if (!kind) continue;
    for (const seg of t.quasis) {
      const trimmed = seg.text.trim();
      if (!hasLetters(trimmed)) continue;
      if (!hasCapitalWord(trimmed)) continue;
      if (!isDisplayShape(trimmed) && kind === 'ruleDisplayLabel') continue;
      const lead = seg.text.length - seg.text.trimStart().length;
      emit(findings, file, lineAt, seg.start + lead, kind, trimmed);
    }
  }
}

/* ---------- the catalogue-key family ---------- */

function cataloguePlaceholders(value) {
  const names = new Set();
  const members = typeof value === 'object' && value !== null ? Object.values(value) : [value];
  for (const member of members) {
    if (typeof member !== 'string') continue;
    for (const m of member.matchAll(PLACEHOLDER)) names.add(m[1]);
  }
  return names;
}

/* The names of the vars passed at the call site: the keys of the object
   literal that is the second argument. null when it is not an object. */
function callVars(tokens, info, openIndex) {
  const frame = info.ctx[openIndex]?.frame;
  if (!frame || frame.type !== 'call') return null;
  let depth = 0;
  let argIndex = -1;
  for (let i = openIndex + 1; i < frame.close; i++) {
    const t = tokens[i];
    if (t.type !== 'punc') continue;
    if (t.value === '(' || t.value === '[' || t.value === '{') {
      if (depth === 0 && argIndex === 0 && t.value === '{') {
        const groups = splitTop(tokens, i + 1, frame.close);
        const names = [];
        for (const [gs, ge] of groups) {
          const sep = propertySeparator(tokens, gs, ge);
          if (sep < 0) continue;
          const key = tokens.slice(gs, sep).find(x => x.type === 'ident' || x.type === 'str');
          if (key) names.push(key.value);
        }
        return names;
      }
      depth++;
      continue;
    }
    if (t.value === ')' || t.value === ']' || t.value === '}') depth--;
    else if (t.value === ',' && depth === 0) argIndex++;
  }
  return null;
}

function scanCatalogueKeys(tokens, file, findings, lineAt, catalogue) {
  if (!catalogue) return;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'ident' || t.value !== 't') continue;
    const open = tokens[i + 1];
    if (!open || open.type !== 'punc' || open.value !== '(') continue;
    const key = tokens[i + 2];
    if (!key || key.type !== 'str') continue; // a dynamic key is not checked here
    const after = tokens[i + 3];
    if (after && after.type === 'punc' && (after.value === '+' || after.value === '.')) continue; // a composed key
    const name = key.value;
    if (!Object.hasOwn(catalogue, name)) {
      emit(findings, file, lineAt, key.start, 'unresolved', name);
      continue;
    }
    const info = analyse(tokens);
    const vars = callVars(tokens, info, i + 1);
    if (!vars) continue;
    const expected = cataloguePlaceholders(catalogue[name]);
    const given = new Set(vars);
    if (expected.size !== given.size || [...expected].some(v => !given.has(v))) {
      emit(findings, file, lineAt, key.start, 'placeholder-mismatch', name);
    }
  }
}

/* ---------- the public API ---------- */

function lineStarts(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return starts;
}

function lineAt(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function readCatalogue(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/* Scan one token stream. */
function scanTokens(tokens, file, findings, at, catalogue, depth) {
  const info = analyse(tokens);
  scanStringLiterals(tokens, file, findings, at, info, catalogue);
  scanDisplayTemplates(tokens, file, findings, at, info);
  if (catalogue) scanCatalogueKeys(tokens, file, findings, at, catalogue);
  for (const t of tokens) {
    if (t.type !== 'template') continue;
    if (t.quasis.some(q => q.text.includes('<'))) scanTemplateHtml(t, file, findings, at);
    if (depth < 8) {
      for (const expr of t.exprs) scanTokens(expr.tokens, file, findings, at, catalogue, depth + 1);
    }
  }
  return info;
}

/* Scan one file's content. */
export function scanSource(text, file, options = {}) {
  const findings = [];
  const starts = lineStarts(text);
  const at = offset => lineAt(starts, offset);
  const catalogue = options.catalogue === undefined ? readCatalogue(path.join(REPO_ROOT, 'src/locales/en.json')) : options.catalogue;
  const { tokens } = lex(text);

  /* A t() call site only counts when the file imports t from the i18n
     module: `t` is a common local variable name. */
  const importsT = tokens.some(t => t.type === 'str' && /(^|\/)core\/i18n\.js$/.test(t.value));

  scanTokens(tokens, file, findings, at, catalogue, 0);
  if (!importsT) {
    for (let i = findings.length - 1; i >= 0; i--) {
      if (findings[i].kind === 'unresolved' || findings[i].kind === 'placeholder-mismatch') findings.splice(i, 1);
    }
  }

  findings.sort((a, b) => a.col - b.col || a.kind.localeCompare(b.kind));
  return findings;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.js$/.test(e.name) ? [p] : [];
  });
}

/* Scan a whole tree. */
export function scanTree(root = 'src', options = {}) {
  const base = path.resolve(REPO_ROOT, root);
  const findings = [];
  for (const file of walk(base).sort()) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    if (EXCLUDED_FILES.has(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const f of scanSource(text, rel, options)) findings.push(f);
  }
  return findings;
}

/* Every token stream of a file: the top level and every template
   expression. */
function tokenStreams(tokens, out = []) {
  out.push(tokens);
  for (const t of tokens) {
    if (t.type !== 'template') continue;
    for (const expr of t.exprs) tokenStreams(expr.tokens, out);
  }
  return out;
}

/* ---------- the coverage sweep ---------- */

/* The raw sweep of the display-label class: every capitalised single-word
   literal outside src/data/seed.js is either a reported finding or a member
   of a named machine category. The sweep is a RAW grep of the shape
   `'[A-Z][A-Za-z]{2,}'` — it does not use the rule families — and every
   occurrence is then classified by POSITION. */
export function sweepDisplayLabels(root = 'src') {
  const base = path.resolve(REPO_ROOT, root);
  const reported = new Set();
  const occurrences = [];

  for (const file of walk(base).sort()) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    if (EXCLUDED_FILES.has(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const { tokens } = lex(text);
    for (const f of scanSource(text, rel, { catalogue: {} })) reported.add(`${rel}:${f.col}`);

    /* The position of every string literal of the file. */
    const at = new Map();
    for (const stream of tokenStreams(tokens)) {
      const info = analyse(stream);
      for (let i = 0; i < stream.length; i++) {
        const t = stream[i];
        if (t.type === 'str') at.set(t.start, { tokens: stream, info, index: i, value: t.value });
      }
    }

    /* The raw shape of the sweep: a quoted, capitalised, single word. The
       letter class is Unicode-aware, so the accented language names
       ('Français', 'Español') are part of the sweep too. */
    const re = /'[A-Z]\p{L}{2,}'/gu;
    let m;
    while ((m = re.exec(text))) {
      const offset = m.index;
      const lit = at.get(offset);
      occurrences.push({
        file: rel,
        offset,
        text: m[0].slice(1, -1),
        literal: lit,
      });
    }
  }

  const categories = {};
  const unexplained = [];
  for (const occ of occurrences) {
    if (reported.has(`${occ.file}:${occ.offset}`)) {
      categories.reported = (categories.reported || 0) + 1;
      continue;
    }
    const category = machineCategory(occ);
    if (category) {
      categories[category] = categories[category || 0] ? (categories[category] || 0) + 1 : 1;
      continue;
    }
    unexplained.push({ file: occ.file, offset: occ.offset, text: occ.text });
  }
  return { total: occurrences.length, categories, unexplained };
}

/* The named machine category an occurrence belongs to, or null. */
function machineCategory(occ) {
  if (!occ.literal) return null; // not a string literal: a comment or a template chunk
  const { tokens, info, index } = occ.literal;
  const slot = info.ctx[index];
  if (isComparisonOperand(tokens, index)) {
    if (KEYBOARD_KEYS.has(occ.text)) return 'KEYBOARD_KEYS';
    if (ROLE_IDS.has(occ.text)) return 'ROLE_IDS';
    if (HTTP_VERBS.has(occ.text)) return 'HTTP_VERBS';
    return 'COMPARISON_OPERAND';
  }
  if (slot.object && slot.object.propIsKey) return 'OBJECT_KEY';
  if (slot.object && slot.object.propName === 'role') return 'ROLE_IDS';
  if (slot.array) {
    if (slot.frame.constName && MACHINE_CONSTS.has(slot.frame.constName)) return 'MACHINE_CONST';
    if (slot.frame.machineList) {
      const first = tokens[slot.frame.elements[0][0]];
      if (first && ROLE_IDS.has(first.value)) return 'ROLE_IDS';
      if (first && MONTH_WEEKDAY_NAMES.has(first.value)) return 'MONTH_WEEKDAY_NAMES';
      if (first && STORED_VOCABULARY.has(first.value)) return 'STORED_VOCABULARY';
    }
  }
  if (slot.call) {
    if (slot.call.callee === 'call' && slot.call.argIndex === 0) return 'HTTP_VERBS';
    if (slot.call.callee === 'includes') return 'MEMBERSHIP_TEST';
  }
  if (VALUE_EXCLUSIONS.has(occ.text)) return 'STORED_VALUE';
  return null;
}

/* ---------- the CLI ---------- */

const ALLOW_LIST = 'test/fixtures/i18n-pending.json';

function entryKey(file, text) {
  return `${file}::${text}`;
}

export function compare(findings, allowList) {
  const literal = findings.filter(f => f.kind.startsWith('rule'));
  const covered = new Set(allowList.map(e => entryKey(e.file, e.text)));
  const pending = [];
  const unlisted = [];
  for (const f of literal) {
    if (covered.has(entryKey(f.file, f.text))) pending.push(f);
    else unlisted.push(f);
  }
  const found = new Set(literal.map(f => entryKey(f.file, f.text)));
  const stale = allowList.filter(e => !found.has(entryKey(e.file, e.text)));
  return {
    pending,
    unlisted,
    stale,
    unresolved: findings.filter(f => f.kind === 'unresolved'),
    mismatch: findings.filter(f => f.kind === 'placeholder-mismatch'),
  };
}

function readAllowList(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function main(argv = process.argv.slice(2)) {
  const report = argv.includes('--report');
  const catalogue = readCatalogue(path.join(REPO_ROOT, 'src/locales/en.json')) || {};
  const findings = scanTree('src', { catalogue });
  const allowList = readAllowList(path.join(REPO_ROOT, ALLOW_LIST));
  const verdict = compare(findings, allowList);

  if (report) {
    for (const f of findings) console.log(`${f.file}:${f.line}  ${f.kind}  ${f.text}`);
  }

  const literals = findings.filter(f => f.kind.startsWith('rule'));
  console.log(
    `i18n scan — ${literals.length} literals, ${verdict.pending.length} pending, ` +
      `${verdict.unlisted.length} unlisted, ${verdict.stale.length} stale, ` +
      `${verdict.unresolved.length} unresolved, ${verdict.mismatch.length} placeholder-mismatch`,
  );

  for (const f of verdict.unlisted) console.log(`unlisted  ${f.file}:${f.line}  ${f.kind}  ${f.text}`);
  for (const e of verdict.stale) console.log(`stale     ${e.file}  ${e.text}`);
  for (const f of verdict.unresolved) console.log(`unresolved  ${f.file}:${f.line}  ${f.text}`);
  for (const f of verdict.mismatch) console.log(`placeholder-mismatch  ${f.file}:${f.line}  ${f.text}`);

  const violations = verdict.unlisted.length + verdict.stale.length + verdict.unresolved.length + verdict.mismatch.length;
  if (violations) {
    console.error(`i18n scan FAILED — ${violations} violation(s).`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  process.exit(main());
}
