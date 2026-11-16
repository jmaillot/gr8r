/* POL-03 (Phase 68 D-09): scope the WR-01 squeeze fix to `.page.flush .toolbar`
   inside the ≤900px band. Byte-level assert on src/styles/responsive.css — no
   DOM, no build: the rule the shipped artifact must contain is checked as text.

   Gate rules:
   1. The ≤900px band contains `.page.flush .toolbar { flex-shrink: 0 }`.
   2. NO bare `.toolbar` selector in that band applies `flex-shrink: 0` — other
      toolbars (board, settings…) are not in a fixed-height flex column and never
      had the bug (D-09).
   3. The Phase 64 D-07 comment block stays adjacent to the rule, updated to
      mention the D-09 scoping. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT } from './helpers/server.mjs';

const CSS_PATH = path.join(ROOT, 'src', 'styles', 'responsive.css');

/** Extract the @media (max-width: 900px) band as text (balanced braces). */
function extract900pxBand(css) {
  const marker = '@media (max-width: 900px)';
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, 'a @media (max-width: 900px) band must exist');
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return css.slice(open + 1, end);
}

/** Split band text into `selector { body }` rules (top level of the band). */
function parseRules(band) {
  const rules = [];
  let depth = 0;
  let open = -1;
  let prevEnd = 0;
  for (let i = 0; i < band.length; i++) {
    const c = band[i];
    if (c === '{') {
      if (depth === 0) open = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        const selector = band.slice(prevEnd, open)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .trim();
        rules.push({ selector, body: band.slice(open + 1, i) });
        prevEnd = i + 1;
      }
    }
  }
  return rules;
}

test('POL-03: ≤900px band scopes flex-shrink:0 to .page.flush .toolbar', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const rules = parseRules(extract900pxBand(css));

  const scoped = rules.find((r) => r.selector === '.page.flush .toolbar');
  assert.ok(scoped, 'a .page.flush .toolbar rule must exist in the ≤900px band');
  assert.match(
    scoped.body.replace(/\s+/g, ' '),
    /flex-shrink:\s*0/,
    '.page.flush .toolbar must keep flex-shrink: 0 (Phase 64 D-07 squeeze fix)'
  );
});

test('POL-03: no bare .toolbar flex-shrink rule remains in the ≤900px band', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const rules = parseRules(extract900pxBand(css));

  const bare = rules.find(
    (r) => r.selector === '.toolbar' && /flex-shrink/.test(r.body)
  );
  assert.ok(!bare, 'D-09: bare .toolbar must not get flex-shrink in the band');
});

test('POL-03: Phase 64 D-07 comment stays adjacent and cites the D-09 scoping', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const band = extract900pxBand(css);
  const idx = band.indexOf('.page.flush .toolbar');
  assert.notEqual(idx, -1, 'scoped rule must exist in the band');
  const before = band.slice(Math.max(0, idx - 600), idx);
  assert.match(before, /D-07/, 'D-07 comment block must stay adjacent to the rule');
  assert.match(before, /D-09/, 'comment must mention the D-09 scoping');
});
