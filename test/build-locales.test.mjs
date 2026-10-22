/* The build contract, proven on the REAL bundle.
   I18N-08 is a property of the shipped artifact, not of the source tree: the suite runs the
   same `vite build` the CI runs, into a temporary out directory, and asserts on the produced
   bytes. Nothing is written into dist/: the developer's bundle is never touched.

   Every structural claim is anchored to an OBSERVABLE rule. The entry chunk is the asset the
   built page loads (the `src` of its own script tag) — never a file that "looks like the main
   chunk". The markers are computed from the catalogue files and filtered against the
   application's own sources, so a marker can only be satisfied by the catalogue itself. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { lucideIconNames } from '../scripts/icons.mjs';
import { ROOT } from './helpers/server.mjs';

const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const BASELINE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'icons-baseline.json'), 'utf8'));

/* ---------- the build ---------- */

/* The real build, into a fresh temporary directory. The developer's dist/ is never touched. */
function build(locales) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-build-'));
  const result = spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, LOCALES: locales },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `the LOCALES=${locales} build failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  return outDir;
}

/* Every asset of a build, with its text. */
function assetsOf(outDir) {
  const dir = path.join(outDir, 'assets');
  return fs
    .readdirSync(dir)
    .sort()
    .map(name => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/* The entry chunk, named by the built page's own script tag. Never by guesswork. */
function entryChunkName(outDir) {
  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  const tag = [...html.matchAll(/<script\b[^>]*>/g)].map(m => m[0]).find(s => /\btype="module"/.test(s));
  assert.ok(tag, `the built page carries a module script tag\n${html}`);
  const src = /\bsrc="([^"]+)"/.exec(tag);
  assert.ok(src, `the module script tag carries a src\n${tag}`);
  return path.basename(src[1]);
}

/* ---------- the markers, computed from the catalogue files ---------- */

function readCatalogue(code) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'locales', `${code}.json`), 'utf8'));
}

/* Every string a catalogue carries: a string value and every member of a plural object alike. */
function flatten(catalogue) {
  const out = [];
  for (const value of Object.values(catalogue)) {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') {
      for (const member of Object.values(value)) if (typeof member === 'string') out.push(member);
    }
  }
  return out;
}

/* The application's own sources: the .js files under src/. A marker that occurs there is in the
   bundle whatever the catalogue does, so it could not prove anything. */
function appSources() {
  const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : /\.js$/.test(e.name) ? [p] : [];
    });
  return walk(path.join(ROOT, 'src'))
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n');
}

/* The markers of one catalogue: its strings the other catalogue does not carry, at least six
   characters long, and absent from the application's own sources. An empty set is a broken
   test, not a passing one, so the suites assert it is NOT empty. */
function markersOf(catalogue, other) {
  const others = new Set(flatten(other));
  const sources = appSources();
  return flatten(catalogue).filter(value => !others.has(value) && value.length >= 6 && !sources.includes(value));
}

/* A built asset may have escaped a non-ASCII character, so a marker is searched in its raw
   form and in its \uXXXX-escaped form. */
function variants(marker) {
  const escaped = [...marker]
    .map(ch => {
      const cp = ch.codePointAt(0);
      if (cp <= 0x7e && cp >= 0x20) return ch;
      if (cp > 0xffff) {
        const hi = Math.floor((cp - 0x10000) / 0x400) + 0xd800;
        const lo = ((cp - 0x10000) % 0x400) + 0xdc00;
        return `\\u${hi.toString(16)}\\u${lo.toString(16)}`;
      }
      return `\\u${cp.toString(16).padStart(4, '0')}`;
    })
    .join('');
  return escaped === marker ? [marker] : [marker, escaped];
}

function carries(text, marker) {
  return variants(marker).some(v => text.includes(v));
}

/* ---------- the icons ---------- */

/* The minifier does NOT serialise the ICONS map as JSON: it rewrites it as an object literal
   whose key is BARE when it is a valid identifier (activity:'<path …) and DOUBLE-QUOTED
   otherwise ("chevron-down":'<path …), with a SINGLE-quoted value, and whose first tag is
   <path, <rect, <circle, <line, <polyline or <polygon — never <svg. The value quote is NOT
   loosened to a double quote: the bundle carries an unrelated desc:"<p>Low-fidelity …" seed
   payload whose bare key would match and would break the count by one. */
const ICON_ENTRY = /(?:[a-z][a-z0-9]*|"[a-z0-9-]+"):'<[a-z]/g;

function shippedIconKeys(assets) {
  const keys = new Set();
  for (const asset of assets) {
    for (const match of asset.text.matchAll(ICON_ENTRY)) {
      keys.add(match[0].slice(0, match[0].indexOf(':')).replace(/"/g, ''));
    }
  }
  return [...keys].sort();
}

/* ---------- the builds ---------- */

const BUILDS = { default: null, en: null, fr: null };
const FRENCH_MARKERS = markersOf(readCatalogue('fr'), readCatalogue('en'));
const ENGLISH_MARKERS = markersOf(readCatalogue('en'), readCatalogue('fr'));

before(() => {
  BUILDS.default = build('en,fr');
  BUILDS.en = build('en');
  BUILDS.fr = build('fr');
});

after(() => {
  for (const outDir of Object.values(BUILDS)) if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

/* ---------- the contract ---------- */

test('the marker sets are not empty: a marker must be able to prove something', () => {
  assert.ok(FRENCH_MARKERS.length > 0, 'the French catalogue carries markers the bundle can only hold because of it');
  assert.ok(ENGLISH_MARKERS.length > 0, 'the English catalogue carries markers the bundle can only hold because of it');
});

test('the French catalogue is a chunk of its own, and not the entry chunk', () => {
  const assets = assetsOf(BUILDS.default);
  const entry = entryChunkName(BUILDS.default);
  const carrying = assets.filter(a => FRENCH_MARKERS.every(marker => carries(a.text, marker)));
  assert.equal(carrying.length, 1, `exactly one asset carries the French catalogue (${assets.map(a => a.name).join(', ')})`);
  assert.notEqual(carrying[0].name, entry, `the French catalogue is not the entry chunk (${entry})`);
});

test('the English catalogue is inlined in the entry chunk of the default build', () => {
  const assets = assetsOf(BUILDS.default);
  const entry = assets.find(a => a.name === entryChunkName(BUILDS.default));
  assert.ok(entry, 'the entry chunk is one of the built assets');
  for (const marker of ENGLISH_MARKERS) {
    assert.ok(carries(entry.text, marker), `the entry chunk carries the English marker ${JSON.stringify(marker)}`);
  }
});

test('an English-only build carries no French byte at all', () => {
  const assets = assetsOf(BUILDS.en);
  for (const asset of assets) {
    for (const marker of FRENCH_MARKERS) {
      assert.ok(!carries(asset.text, marker), `the asset ${asset.name} carries no French marker (${JSON.stringify(marker)})`);
    }
  }
});

test('the English-only build still carries the English catalogue', () => {
  const assets = assetsOf(BUILDS.en);
  const entry = assets.find(a => a.name === entryChunkName(BUILDS.en));
  assert.ok(entry, 'the entry chunk is one of the built assets');
  for (const marker of ENGLISH_MARKERS) {
    assert.ok(carries(entry.text, marker), `the entry chunk carries the English marker ${JSON.stringify(marker)}`);
  }
});

test('the base catalogue ships in every build, so the interface is never without a language', () => {
  const assets = assetsOf(BUILDS.fr);
  const entry = assets.find(a => a.name === entryChunkName(BUILDS.fr));
  assert.ok(entry, 'the entry chunk is one of the built assets');
  for (const marker of ENGLISH_MARKERS) {
    assert.ok(carries(entry.text, marker), `the entry chunk carries the English marker ${JSON.stringify(marker)}`);
  }
});

test('no catalogue key added an icon: the source scan is the frozen pre-phase baseline', () => {
  const names = lucideIconNames('src');
  assert.deepEqual(names, BASELINE, 'the source scan reproduces the frozen pre-phase icon list, name for name');
});

test('no catalogue key added an icon: the shipped bundle carries exactly that baseline', () => {
  const keys = shippedIconKeys(assetsOf(BUILDS.default));
  assert.equal(keys.length, BASELINE.length, `the bundle carries one icon entry per baseline name (${keys.length} against ${BASELINE.length})`);
  assert.deepEqual(keys, [...BASELINE].sort(), 'the bundle carries the baseline icon set, name for name');
});

test('the catalogue is importable by the browser build and by plain Node', async () => {
  const assets = assetsOf(BUILDS.default);
  const entry = assets.find(a => a.name === entryChunkName(BUILDS.default));
  assert.ok(entry, 'the entry chunk is one of the built assets');
  for (const marker of ENGLISH_MARKERS) {
    assert.ok(carries(entry.text, marker), `the browser build carries the English marker ${JSON.stringify(marker)}`);
  }
  const mod = await import(pathToFileURL(path.join(ROOT, 'src', 'locales', 'en.json')).href, { with: { type: 'json' } });
  assert.deepEqual(mod.default, readCatalogue('en'), 'bare Node loads the English catalogue, key for key');
});
