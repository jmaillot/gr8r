/* =====================================================================
   test: export prohibition — the writer/directory boundary, mechanically.
   =====================================================================
   Phase 54 (54-02, R10 + T-54-08). Source-policy assertions in the
   house style (fs.readFileSync + regex, as test/dependencies.test.mjs):

   (a) no module under src/ mentions the writer package — the client
       bundle can never resolve @office-kit/xlsx, and this makes the
       prohibition mechanical rather than aspirational;
   (b) no module under src/ imports the SERVER-ONLY writers at the
       repository-root export/ directory (export/xlsx.js, export/mspdi.js).
       The client-safe modules under src/export/ (model.js, csv.js,
       gantt.js) are the OPPOSITE path shape and are legitimate — plans
       01 and 04 import those from src/ all the time. The two shapes:
         - `../../export/…`  : climbs from src/<sub>/ up to the ROOT export/
         - `export/xlsx.js` / `export/mspdi.js` bare specifiers
   (c) inside the EXPORT-ROUTE markers on server.js the raw document
       token appears EXACTLY ONCE and that occurrence is the
       docForClient(JSON.parse(…) argument — a count assertion, not a
       grep for absence;
   (d) every module under export/ imports only node builtins, writer
       subpaths and relative modules under src/.
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO_ROOT, 'src');
const EXPORT = path.join(REPO_ROOT, 'export');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const srcFiles = walk(SRC);

test('no module under src/ mentions the writer package (R10, T-54-08)', () => {
  for (const file of srcFiles) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(
      !text.includes('@office-kit/xlsx'),
      `${path.relative(REPO_ROOT, file)} mentions @office-kit/xlsx — the writer is server-only and must never reach the client bundle (R10, T-54-08)`,
    );
  }
});

test('no module under src/ imports the server-only root export/ writers (R10, T-54-08)', () => {
  /* Two forbidden path shapes, and two that must NOT be flagged:
     - FORBIDDEN: '../../export/xlsx.js' style specifiers that climb out of
       src/<sub>/ to the repository-ROOT export/ directory (the server-only
       writers), and bare 'export/xlsx.js'/'export/mspdi.js' specifiers.
     - LEGITIMATE: '../export/model.js', '../export/csv.js', '../export/gantt.js'
       — src/export/ is the client-safe shared model/csv/gantt modules that
       plans 01 and 04 import from src/ constantly. Only xlsx.js and mspdi.js
       exist at the root; src/export/ holds model/csv/gantt. */
  for (const file of srcFiles) {
    const rel = path.relative(REPO_ROOT, file);
    const text = fs.readFileSync(file, 'utf8');
    const specifiers = [...text.matchAll(/(?:import|from)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const spec of specifiers) {
      /* bare root-writer specifiers */
      if (/^export\/(xlsx|mspdi)\.js$/.test(spec)) {
        assert.fail(`${rel} imports the server-only writer '${spec}' (R10, T-54-08)`);
      }
      /* relative climb to the ROOT export directory: any number of ../
         followed by export/<file>, resolved by counting segments. Depth from
         src/ = number of dirs under src/ the file sits in. */
      const climb = /^(?:\.\.\/)+(.+)$/.exec(spec);
      if (climb) {
        const depth = rel.split('/').length - 2; // dirs under src/ minus filename
        const ups = (spec.match(/\.\.\//g) || []).length;
        if (ups > depth) {
          const target = climb[1].replace(/^\.\//, '');
          if (/^export\/(xlsx|mspdi)\.js$/.test(target)) {
            assert.fail(`${rel} imports the server-only writer via '${spec}' (R10, T-54-08)`);
          }
        }
      }
    }
  }
});

test('the export route reads the raw document exactly once — as the docForClient argument (R10)', () => {
  const serverSource = fs.readFileSync(path.join(REPO_ROOT, 'server.js'), 'utf8');
  const begin = serverSource.indexOf('EXPORT-ROUTE-BEGIN');
  const end = serverSource.indexOf('EXPORT-ROUTE-END');
  assert.notEqual(begin, -1, 'server.js lost its EXPORT-ROUTE-BEGIN marker');
  assert.notEqual(end, -1, 'server.js lost its EXPORT-ROUTE-END marker');
  assert.ok(begin < end, 'the EXPORT-ROUTE markers are inverted');
  const route = serverSource.slice(begin, end);

  /* The markers themselves document the rule ("Never ctx.ws.doc."), so
     comments must be stripped before counting — only real code counts. */
  const code = route
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/[^\n]*/gm, '');
  const occurrences = code.split('ctx.ws.doc').length - 1;
  assert.equal(
    occurrences,
    1,
    `the raw workspace document token appears ${occurrences} times inside the export route markers — exactly 1 is allowed, and only as the docForClient argument (R10)`,
  );
  const line = route.split('\n').find(l => l.includes('ctx.ws.doc') && !/\/\*|^\s*\/\//.test(l.trim()) && l.includes('await'));
  assert.ok(
    line && line.includes('docForClient(JSON.parse('),
    `the single raw-document reference must be the docForClient argument — got: ${(line || '').trim()}`,
  );
});

test('every module under export/ imports only node builtins, writer subpaths and src/ relative modules', () => {
  if (!fs.existsSync(EXPORT)) return; // vacuously true before plan 02 Task 3 creates the directory
  const NODE_BUILTINS = new Set([
    'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https',
    'module', 'os', 'path', 'stream', 'string_decoder', 'timers', 'tty', 'url',
    'util', 'zlib', 'node:assert', 'node:buffer', 'node:child_process', 'node:crypto',
    'node:events', 'node:fs', 'node:http', 'node:https', 'node:module', 'node:os',
    'node:path', 'node:stream', 'node:string_decoder', 'node:timers', 'node:tty',
    'node:url', 'node:util', 'node:zlib',
  ]);
  for (const file of walk(EXPORT)) {
    const rel = path.relative(REPO_ROOT, file);
    const text = fs.readFileSync(file, 'utf8');
    const specifiers = [...text.matchAll(/from\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const spec of specifiers) {
      let ok = spec.startsWith('@office-kit/xlsx/') || NODE_BUILTINS.has(spec);
      if (!ok && spec.startsWith('.')) {
        /* a relative import must resolve back into src/ (shared model)
           or stay inside export/ — never anywhere else in the tree */
        const resolved = path.resolve(path.dirname(file), spec);
        const relToRoot = path.relative(REPO_ROOT, resolved);
        ok = relToRoot.startsWith('src/') || relToRoot.startsWith('export/');
      }
      assert.ok(
        ok,
        `${rel} imports '${spec}' — export/ modules may import only node builtins, @office-kit/xlsx subpaths and relative modules under src/`,
      );
    }
  }
});
