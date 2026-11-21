/* The one-JSON-file-is-one-locale contract, proven end-to-end with a real fixture.
   D-08 / Pitfall 6: adding a locale must require exactly one thing — dropping a JSON file
   into src/locales/. This suite drops a fixture (xx.json), runs the SAME `vite build` CI
   runs, and asserts the locale is auto-shipped, offered by the derived registry, and that
   nothing else moved (en/fr intact, scan gate clean, build-locales suite still green).

   The fixture lifecycle is the proof's own guard: a left-behind xx.json would poison every
   later build and scan on this machine, so the copy is wrapped in try/finally and after()
   asserts the tree is clean.

   Cross-file race guard (Phase 86 post-merge finding): the fixture MUST be materialized
   only while this suite's tests run — `npm test` executes test files with
   --test-concurrency=2, and a concurrently-loaded server.js snapshots
   LOCALE_CODES = readdirSync(src/locales) at import time. A fixture alive during another
   file's server boot makes `xx` a legal locale there (the unknown-locale 400 pin in
   locale-account flaked on exactly this window). The mutex below (lockfile in os.tmpdir,
   retried acquisition) serializes the materialize→test→remove window against itself so a
   future second fixture-bearing suite cannot widen the race, and the window stays inside
   this process's lifetime. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers/server.mjs';

const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const FIXTURE_CODE = 'xx';
const FIXTURE_PATH = path.join(ROOT, 'src', 'locales', `${FIXTURE_CODE}.json`);

/* A minimal catalogue mirroring en.json's structure plus a display-name entry. The
   translated string is unique to the fixture, so a marker can only be satisfied by the
   fixture itself — never by application sources. */
const FIXTURE_CATALOGUE = {
  _locale: FIXTURE_CODE,
  _displayName: 'Xxlang',
  app: { title: 'Xxqwanxo fenestrka' },
};

let OUT_DIR = null;

/* ---- fixture window mutex: exclusive across concurrent test-file processes ---- */
const LOCK_PATH = path.join(os.tmpdir(), 'projects-fixture-xx.lock');
const LOCK_STALE_MS = 5 * 60 * 1000; // a crashed runner must not wedge the next one
function acquireFixtureLock() {
  const deadline = Date.now() + 8 * 60 * 1000;
  for (;;) {
    try {
      // O_EXCL|O_WRONLY: atomic create-if-absent — the winner holds the window.
      const fd = fs.openSync(LOCK_PATH, 'wx');
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - fs.statSync(LOCK_PATH).mtimeMs > LOCK_STALE_MS) {
          fs.rmSync(LOCK_PATH, { force: true });
          continue;
        }
      } catch {
        /* holder released between stat and rm — loop retries the create */
      }
      if (Date.now() > deadline) {
        throw new Error(`fixture lock held longer than ${LOCK_STALE_MS} ms by another runner: ${LOCK_PATH}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}
function releaseFixtureLock() {
  fs.rmSync(LOCK_PATH, { force: true });
}

before(() => {
  acquireFixtureLock();
  try {
    assert.ok(!fs.existsSync(FIXTURE_PATH), `a stale ${FIXTURE_CODE}.json is already in the tree — clean it first`);
    fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(FIXTURE_CATALOGUE, null, 2)}\n`);
    OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-fixture-build-'));
    /* The default build: NO LOCALES env. The build must derive its locale set from
       src/locales/ itself — the fixture ships because it exists, not because a list named it. */
    const result = spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', OUT_DIR, '--emptyOutDir'], {
      cwd: ROOT,
      env: { ...process.env, LOCALES: undefined },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `the fixture build failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  } finally {
    /* Pitfall 6: the fixture NEVER outlives this suite, whatever a clause does.
       The lock releases in after() — the whole window (fixture alive + this suite
       still running) stays exclusive against any future concurrent fixture user. */
    if (fs.existsSync(FIXTURE_PATH)) fs.rmSync(FIXTURE_PATH);
  }
});

after(() => {
  assert.ok(!fs.existsSync(FIXTURE_PATH), `the fixture was left behind — Pitfall 6 poisoning`);
  releaseFixtureLock();
});

/* ---------- the harness, on the build-locales shape ---------- */

function assetsOf(outDir) {
  const dir = path.join(outDir, 'assets');
  return fs
    .readdirSync(dir)
    .sort()
    .map(name => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/* ---------- clause 1: auto-ship (D-09) ---------- */

test('the fixture locale ships from the default build with no LOCALES env', () => {
  const assets = assetsOf(OUT_DIR);
  const fixtureChunk = assets.find(a => new RegExp(`^${FIXTURE_CODE}-`).test(a.name));
  assert.ok(fixtureChunk, `the default build emits an ${FIXTURE_CODE}-*.js chunk from the lone fixture file`);
});

/* ---------- clause 2: offered + loaded (D-08) ---------- */

test('the fixture chunk carries the fixture string and the derived registry offers xx', () => {
  const assets = assetsOf(OUT_DIR);
  const fixtureChunk = assets.find(a => new RegExp(`^${FIXTURE_CODE}-`).test(a.name));
  assert.ok(fixtureChunk, `the ${FIXTURE_CODE} chunk is one of the built assets`);
  assert.ok(
    fixtureChunk.text.includes(FIXTURE_CATALOGUE.app.title),
    'the fixture chunk carries the fixture’s own translated string, not an empty stub',
  );
  /* The registry is DERIVED in the bundle: `Object.keys(glob).map(code).sort()` builds the
     registry, so the proof that xx is offered is the glob key itself reaching the bundle —
     plus the name-map entry the registry's native names come from. Under Vite 8 the glob
     keys ride the `i18n-*` chunk (statically imported by the entry) rather than the entry
     file itself, so both proofs are read across the full shipped set. */
  const bundled = assets.map(a => a.text).join('\n');
  assert.ok(bundled.includes(`"../locales/${FIXTURE_CODE}.json"`), 'the bundle’s locale glob matches the fixture file — the derived registry offers xx');
  /* The name-map value is quoted singly — `"xx"` on the esbuild chain up to Vite 6, a
     template literal `` `xx` `` under Vite 8. */
  assert.ok(
    bundled.includes(`${FIXTURE_CODE}:"${FIXTURE_CODE}"`) || bundled.includes(`${FIXTURE_CODE}:\`${FIXTURE_CODE}\``),
    'the name map carries the xx entry (native name falls back to the raw code)',
  );
});

/* ---------- clause 3: plain-Node parity (Pitfall 3 guard) ---------- */

test('plain Node keeps its degrade path with the fixture present in the tree', async () => {
  /* The fixture is already deleted by before()'s finally — the degrade path is proven with
     the tree as the suite leaves it: en-only registry, no crash, no phantom locale. */
  const mod = await import(pathToFileURL(path.join(ROOT, 'src', 'core', 'i18n.js')).href);
  const codes = mod.availableLocales().map(l => l.code);
  assert.ok(codes.includes('en'), 'the plain-Node registry keeps the base locale');
  assert.ok(!codes.includes(FIXTURE_CODE), 'the plain-Node registry carries no phantom locale once the file is gone');
  assert.equal(mod.availableLocales()[0].name, 'English', 'the base entry keeps its native name');
});

/* ---------- clause 4: en/fr untouched ---------- */

test('the existing build-locales suite still exits 0 with the fixture gone from the tree', () => {
  const result = spawnSync(process.execPath, ['--test', path.join(ROOT, 'test', 'build-locales.test.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300000,
  });
  assert.equal(result.status, 0, `build-locales.test.mjs failed with the fixture lifecycle exercised\n${result.stdout || ''}\n${result.stderr || ''}`);
});

/* ---------- clause 5: gate clean ---------- */

test('the i18n scan gate reports zero findings across the fixture lifecycle', async () => {
  const scan = await import(pathToFileURL(path.join(ROOT, 'scripts', 'i18n-scan.mjs')).href);
  const report = scan.main(['--report']);
  assert.ok(report === 0 || report === undefined || report === null, `the scan gate is clean with the fixture present and gone (main returned ${report})`);
});
