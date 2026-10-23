/* =====================================================================
   test: french-typography — the D-05 lint over every value in fr.json.

   The rules table below lints every French value — string values and every
   member of a plural object — against the D-04 typography contract:
   U+00A0 (no-break space) before ':', U+202F (narrow no-break space) before
   '; ! ?', U+00A0 on both sides inside « », the curly apostrophe U+2019,
   the ellipsis U+2026, and NFC-normalised accents. The exemptions are
   pattern-based and explicit: a time (14:30), an ISO date and a URL are
   STRIPPED from the value before the punctuation rules run, so the rules
   can never fire on one.
   ===================================================================== */
import assert from 'node:assert/strict';
import fr from '../src/locales/fr.json' with { type: 'json' };
import { test } from 'node:test';

const NBSP = '\u00A0';
const NNBS = '\u202F';

/* The exempt shapes: removed from the value before the punctuation rules
   run, so a URL's colon, a clock's colon and an ISO date's hyphens are
   never mistaken for prose (D-05). Order matters: URLs first (they may
   carry colons), then ISO dates, then times. */
const EXEMPT = [/https?:\/\/\S*/g, /\bwww\.\S*/g, /\d{4}-\d{2}-\d{2}/g, /\d{1,2}:\d{2}\b/g];

/* The rules. Each carries a name reported on failure and a breach pattern
   whose first match names the offending position in the message. The
   guillemet rule is a single pattern: an opening guillemet not followed by
   U+00A0, or a closing one not preceded by it. */
const RULES = [
  {
    name: 'plain space before ; ! ?',
    /* The required character before ; ! ? is U+202F. Any other space — a
       plain U+0020 or the wider no-break U+00A0 — is a breach. */
    test: value => /(^|[\u0020\u00A0])[;!?]/.test(value),
    pattern: /[\u0020\u00A0][;!?]/,
  },
  {
    name: 'wrong space before :',
    /* The required character before ':' is U+00A0: a plain U+0020 and the
       narrower U+202F are both breaches. */
    test: value => /(^|[\u0020\u202F]):/.test(value),
    pattern: /[\u0020\u202F]:/,
  },
  {
    name: 'straight apostrophe',
    test: value => value.includes("'"),
    pattern: /'/,
  },
  {
    name: 'three-dot ellipsis',
    test: value => value.includes('...'),
    pattern: /\.\.\./,
  },
  {
    name: 'unpadded guillemet',
    test: value => /«(?!\u00A0)|(?<!\u00A0)»/.test(value),
    pattern: /«(?!\u00A0)|(?<!\u00A0)»/,
  },
  {
    name: 'non-NFC accents',
    /* The breach is the value as a whole, so the reported position is its start. */
    test: value => value !== value.normalize('NFC'),
    position: 0,
  },
];

/* Strip the exempt shapes from a value, then run the punctuation rules
   over what remains. */
function stripped(value) {
  let out = value;
  for (const re of EXEMPT) out = out.replace(re, ' ');
  return out;
}

function lintValue(value) {
  const out = [];
  for (const rule of RULES) {
    const subject = rule.position === undefined ? stripped(value) : value;
    if (rule.test(subject)) {
      const pos = rule.position !== undefined ? rule.position : subject.search(rule.pattern);
      out.push(`${rule.name} at position ${pos}`);
    }
  }
  return out;
}

/* Every value the catalogue carries: strings and every member of a plural
   object — the same walk the placeholder parity does. */
function* frValues() {
  for (const [key, value] of Object.entries(fr)) {
    if (typeof value === 'string') yield [key, 'the value', value];
    else if (value && typeof value === 'object') {
      for (const [category, member] of Object.entries(value)) yield [key, `the plural member ${category}`, member];
    }
  }
}

test('every French catalogue value passes the D-05 typography rules', () => {
  const breaches = [];
  for (const [key, where, value] of frValues()) {
    if (typeof value !== 'string') continue;
    for (const breach of lintValue(value)) {
      breaches.push(`fr.json → ${key} (${where}): ${breach} — ${JSON.stringify(value)}`);
    }
  }
  assert.deepEqual(breaches, [], breaches.join('\n') || 'no breach reported');
});

/* The rules are proven on fixtures, never on the live catalogue: each one
   fires on a synthetic breach and stays silent on its compliant form. */

test('a plain space before ; ! ? breaches, and the narrow no-break space complies', () => {
  assert.deepEqual(lintValue('Attention !'), ['plain space before ; ! ? at position 9']);
  assert.deepEqual(lintValue(`Attention${NNBS}!`), [], 'U+202F is the required character');
  assert.deepEqual(lintValue(`Attention${NBSP}!`), ['plain space before ; ! ? at position 9'], 'U+00A0 is too wide');
});

test('a plain or narrow space before : breaches, and U+00A0 complies', () => {
  assert.deepEqual(lintValue('Attention :'), ['wrong space before : at position 9']);
  assert.deepEqual(lintValue(`Attention${NNBS}:`), ['wrong space before : at position 9'], 'U+202F is too narrow');
  assert.deepEqual(lintValue(`Attention${NBSP}:`), [], 'U+00A0 is the required character');
});

test('a time and an ISO date never breach the colon rule', () => {
  assert.deepEqual(lintValue('Rendez-vous à 14:30'), [], 'the time is exempt');
  assert.deepEqual(lintValue('Version du 2026-07-24'), [], 'the ISO date is exempt');
});

test('a URL never breaches the colon rule', () => {
  assert.deepEqual(lintValue('Voir https://example.com/docs'), [], 'the URL is exempt');
  assert.deepEqual(lintValue('Voir www.example.com/docs'), [], 'the www URL is exempt');
});

test('a straight apostrophe breaches, and the curly apostrophe complies', () => {
  assert.deepEqual(lintValue("l'outil"), ['straight apostrophe at position 1']);
  assert.deepEqual(lintValue('l’outil'), [], 'U+2019 is the required character');
});

test('a three-dot ellipsis breaches, and U+2026 complies', () => {
  assert.deepEqual(lintValue('Chargement...'), ['three-dot ellipsis at position 10']);
  assert.deepEqual(lintValue('Chargement…'), [], 'U+2026 is the required character');
});

test('an unpadded guillemet breaches on either side, and U+00A0 padding complies', () => {
  assert.deepEqual(lintValue('«Attention»'), ['unpadded guillemet at position 0']);
  assert.deepEqual(lintValue('« Attention »'), ['unpadded guillemet at position 0'], 'a plain space is not the padding');
  assert.deepEqual(lintValue(`«${NBSP}Attention${NBSP}»`), [], 'U+00A0 on both sides is the required padding');
});

test('decomposed accents breach, and NFC forms comply', () => {
  assert.deepEqual(lintValue('De\u0301ja\u0300'), ['non-NFC accents at position 0']);
  assert.deepEqual(lintValue('Déjà'), [], 'the composed form is required');
});
