/* =====================================================================
   EXPORT CLIENT TESTS — Phase 54 (54-01), Task 2: the client slice.
   The client modules touch the DOM at import, so these are source-text
   contracts (the same house pattern) plus catalogue parity checks run
   against the real locale JSON.
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { filenameFrom } from '../src/core/download.js';
import { DEFAULT_OPTIONS } from '../src/export/model.js';

const read = rel => fs.readFileSync(path.resolve(import.meta.dirname, '..', rel), 'utf8');

test('project.js renders exactly one exportOpen entry point, guarded by canManageProject', () => {
  const src = read('src/pages/project.js');
  assert.equal(src.split('data-a="exportOpen"').length - 1, 1, 'exactly one exportOpen in the header');
  assert.ok(src.includes('canManageProject(p)'), 'the button is guarded by canManageProject');
  assert.ok(src.includes("t('export.action')"), 'tip and aria-label read export.action');
});

test('modals.js wires case export and re-checks canManageProject', () => {
  const src = read('src/overlays/modals.js');
  assert.ok(src.includes("case 'export'"), 'the modal switch has an export case');
  assert.ok(src.includes('export function exportModal'), 'exportModal is exported');
  const modal = src.slice(src.indexOf('export function exportModal'));
  assert.ok(modal.includes('canManageProject(p)'), 'the modal re-checks canManageProject');
  assert.ok(modal.includes("t('err.projectNotFound')"), 'a failed guard falls back to the localized not-found header');
});

test('actions.js defines the export actions and input handlers', () => {
  const src = read('src/actions/actions.js');
  assert.ok(src.includes('A.exportOpen'), 'A.exportOpen exists');
  assert.ok(src.includes('A.exportSubmit'), 'A.exportSubmit exists');
  assert.ok(src.includes('IN.exportFormat'), 'IN.exportFormat exists');
  assert.ok(src.includes('IN.exportScope'), 'IN.exportScope exists');
  assert.ok(src.includes('IN.exportOption'), 'IN.exportOption exists');
  /* D-54-2: the submit guard — a tampered DOM cannot post for a non-manager. */
  const submit = src.slice(src.indexOf('A.exportSubmit'));
  assert.ok(submit.includes('canManageProject(p)'), 'exportSubmit re-checks canManageProject');
  assert.ok(src.includes('DEFAULT_OPTIONS'), 'the option state starts from DEFAULT_OPTIONS');
});

test('download.js parses filename* BEFORE the plain filename form', () => {
  /* RFC 5987 first — the UTF-8 form must win even when both appear. */
  const both = `attachment; filename="fallback.csv"; filename*=UTF-8''caf%C3%A9-na%C3%AFve.csv`;
  assert.equal(filenameFrom(both), 'café-naïve.csv');
  assert.equal(filenameFrom(`attachment; FILENAME*=UTF-8''upper.csv`), 'upper.csv');
  /* Plain form fallback, quoted and unquoted. */
  assert.equal(filenameFrom(`attachment; filename="plain.csv"`), 'plain.csv');
  assert.equal(filenameFrom(`attachment; filename=plain2.csv`), 'plain2.csv');
  assert.equal(filenameFrom(''), 'export');
  assert.equal(filenameFrom('attachment'), 'export');
});

test('download.js is the only fetch path and never reads text on success', () => {
  const src = read('src/core/download.js');
  assert.ok(src.includes('credentials'), 'the export fetch sends same-origin credentials');
  assert.ok(src.includes('res.blob()'), 'success reads the payload as a Blob');
  assert.ok(!/\.text\(\)/.test(src.split('if (!res.ok)')[0].split('export async function download')[1] || ''), 'the success path never calls res.text()');
});

test('no xlsx or .mpp surface exists anywhere under src/ (SPEC prohibition)', () => {
  const dir = path.resolve(import.meta.dirname, '..', 'src');
  const files = fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? [] : /\.js$/.test(e.name) ? [p] : [];
  });
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    assert.ok(!/xlsx|\.mpp/i.test(text), `${path.basename(f)} mentions no xlsx/.mpp`);
  }
});

test('the modal checks api.enabled for the static-mode notice', () => {
  const modal = read('src/overlays/modals.js').split('export function exportModal')[1];
  assert.ok(modal.includes('api.enabled'), 'the static-mode notice is gated on api.enabled');
  assert.ok(modal.includes('export.notice.staticMode'), 'the notice key is export.notice.staticMode');
});

test('EN and FR catalogues carry the export keys with identical placeholders', () => {
  const en = JSON.parse(read('src/locales/en.json'));
  const fr = JSON.parse(read('src/locales/fr.json'));
  const keys = [
    'export.action',
    'export.title',
    'export.format.label',
    'export.format.csv',
    'export.scope.label',
    'export.scope.all',
    'export.scope.count',
    'export.submit',
    'export.notice.staticMode',
  ];
  const placeholders = v => (typeof v === 'string' ? [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',') : '');
  for (const k of keys) {
    assert.ok(en[k] !== undefined, `EN has ${k}`);
    assert.ok(fr[k] !== undefined, `FR has ${k}`);
    assert.equal(placeholders(fr[k]), placeholders(en[k]), `${k} placeholder parity`);
  }
  assert.equal(typeof en['export.scope.count'], 'object', 'scope.count is a one/other plural');
  assert.deepEqual(Object.keys(fr['export.scope.count']).sort(), ['one', 'other']);
  /* The prohibition: no export value may name the native Project binary. */
  const values = Object.entries(en).flatMap(([k, v]) => (k.startsWith('export.') ? (typeof v === 'object' ? Object.entries(v).map(([sub, s]) => [k + '.' + sub, s]) : [[k, v]]) : []));
  for (const [k, text] of values) {
    assert.ok(!/\.mpp/.test(text), `${k} does not mention .mpp`);
    assert.ok(!/[<>"]/.test(text), `${k} carries no angle bracket or double quote`);
  }
});

test('DEFAULT_OPTIONS stays frozen with the five toggles (model/CSV client parity)', () => {
  assert.deepEqual(DEFAULT_OPTIONS, { descriptions: false, comments: false, subtasks: false, completed: true, archived: false });
  assert.ok(Object.isFrozen(DEFAULT_OPTIONS));
});
