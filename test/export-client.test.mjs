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

/* ---- 54-01 Task 3: scope, toggles, static mode, second entry point ---- */

test('the context menu carries exactly one exportOpen item, guarded by canManageProject', () => {
  const src = read('src/overlays/context-menu.js');
  assert.equal(src.split("data-a=\"${act}\"").length >= 1, true, 'menu items ride the I factory');
  assert.equal(src.split('exportOpen').length - 1, 1, 'exactly one exportOpen occurrence');
  const guarded = src.slice(src.indexOf('exportOpen') - 200, src.indexOf('exportOpen'));
  assert.ok(guarded.includes('canManageProject(pr)'), 'the item is guarded by canManageProject(pr)');
  assert.ok(src.includes("tMsg('export.action')"), 'the label reads export.action');
  assert.ok(src.includes("'download'"), 'the item uses the download icon');
});

test('the modal contains the five option keys and the static note', () => {
  const src = read('src/overlays/modals.js');
  const modal = src.split('export function exportModal')[1];
  assert.ok(modal.includes('data-key="${key}"'), 'the toggles render their key through data-key');
  const opts = src.slice(src.indexOf('const EXP_OPTIONS'), src.indexOf('export function exportModal'));
  for (const key of ['descriptions', 'comments', 'subtasks', 'completed', 'archived']) {
    assert.ok(opts.includes(`'${key}'`), `EXP_OPTIONS carries ${key}`);
    assert.ok(modal.includes("'export.option.' + key"), 'the option label keys resolve through the EXP_OPTIONS loop');
  }
  assert.ok(modal.includes('data-in="exportOption"'), 'the toggles write through IN.exportOption');
  assert.ok(modal.includes('export.notice.staticMode'), 'the static note is present');
  assert.ok(modal.includes("t('export.scope.view')"), 'the view scope option exists');
  assert.ok(modal.includes("t('export.scope.viewUnavailable')"), 'the disabled-view fallback exists');
});

test('the static submit branch builds CSV locally and never calls download', () => {
  const src = read('src/actions/actions.js');
  const submit = src.slice(src.indexOf('A.exportSubmit'));
  const submitEnd = submit.indexOf('\n};');
  const staticBranch = submit.slice(submit.indexOf('!api.enabled'), submit.indexOf('\n  const body = {') > -1 ? submit.indexOf('\n  const body = {') : submitEnd);
  assert.ok(staticBranch.includes('toCsv('), 'the static branch calls toCsv directly');
  assert.ok(staticBranch.includes('new Blob('), 'the static branch builds a Blob');
  assert.ok(staticBranch.includes('saveBlob('), 'the static branch saves via saveBlob');
  assert.ok(!staticBranch.includes('download('), 'the static branch never calls the network helper');
  assert.ok(src.includes('charset=utf-8'), 'the Blob type carries the charset');
  /* the static filename uses the server-identical allow-list stem */
  assert.ok(src.includes('safeExportStem'), 'a local safeExportStem helper exists');
});

test('the scope count expression is derived from buildExportModel, not a raw length', () => {
  const src = read('src/actions/actions.js');
  const count = src.slice(src.indexOf('const exportCount'));
  assert.ok(count.includes('buildExportModel'), 'the count calls buildExportModel');
  const modal = read('src/overlays/modals.js').split('export function exportModal')[1];
  assert.ok(modal.includes('buildExportModel'), 'the modal count calls buildExportModel');
});

test('EN and FR catalogues carry the scope/option keys with matching placeholders', () => {
  const en = JSON.parse(read('src/locales/en.json'));
  const fr = JSON.parse(read('src/locales/fr.json'));
  for (const k of [
    'export.scope.view',
    'export.scope.viewUnavailable',
    'export.options.label',
    'export.option.descriptions',
    'export.option.comments',
    'export.option.subtasks',
    'export.option.completed',
    'export.option.archived',
  ]) {
    assert.ok(en[k] !== undefined, `EN has ${k}`);
    assert.ok(fr[k] !== undefined, `FR has ${k}`);
    assert.ok(!/[<>"]/.test(en[k]) && !/[<>"]/.test(fr[k]), `${k} values carry no angle bracket or double quote`);
  }
});

/* =====================================================================
   54-05: the completed format surface. Every rendered option must be a
   format the server actually serves; the static build keeps CSV only.
   ===================================================================== */

const SERVER_FORMATS = () => {
  const server = read('server.js');
  const block = server.slice(server.indexOf('EXPORT-ROUTE-BEGIN'), server.indexOf('EXPORT-ROUTE-END'));
  return [...block.matchAll(/(\w+):\s*\{\s*ext:/g)].map(m => m[1]).sort();
};

test('the modal format list is xlsx, mspdi, csv on the server build and csv only on the static build', () => {
  const modal = read('src/overlays/modals.js').split('export function exportModal')[1];
  const formatsLine = modal.split('\n').find(l => l.includes('const FORMATS'));
  assert.ok(formatsLine, 'the format list is built per mode');
  const serverList = formatsLine.split('?')[1].split(':')[0];
  const staticList = formatsLine.split(':')[1];
  assert.ok(serverList.includes("'xlsx'") && serverList.includes("'mspdi'") && serverList.includes("'csv'"), 'the server build offers all three');
  assert.ok(!staticList.includes("'xlsx'") && !staticList.includes("'mspdi'") && staticList.includes("'csv'"), 'the static build offers CSV only');
  assert.ok(modal.includes("t('export.format.' + id)"), 'each radio reads its catalogue label');
  assert.ok(modal.includes("data-in=\"${name === 'expScope' ? 'exportScope' : 'exportFormat'}\"") || modal.includes("'exportFormat'"), 'the radios write through IN.exportFormat');
});

test('the mspdi notice renders only on the server build and only when mspdi is selected', () => {
  const modal = read('src/overlays/modals.js').split('export function exportModal')[1];
  assert.ok(modal.includes("api.enabled && fmt === 'mspdi'"), 'the notice is gated on the server build AND the selected format');
  assert.ok(modal.includes('export.notice.mspdi'), 'the notice key is export.notice.mspdi');
});

test('A.exportOpen defaults to xlsx on the server build and csv on the static build', () => {
  const src = read('src/actions/actions.js');
  const open = src.slice(src.indexOf('A.exportOpen'));
  assert.ok(open.includes("S.ui.expFormat = api.enabled ? 'xlsx' : 'csv'"), 'the default follows the mode');
  const submit = src.slice(src.indexOf('A.exportSubmit'));
  assert.ok(submit.includes('format: S.ui.expFormat'), 'the submit sends the selected format, never a hardcoded id');
});

test('every format id rendered by the modal exists in the server EXPORT_FORMATS map', () => {
  const serverFormats = SERVER_FORMATS();
  assert.deepEqual(serverFormats, ['csv', 'mspdi', 'xlsx'].sort(), 'the server serves csv, mspdi and xlsx');
  const modal = read('src/overlays/modals.js').split('export function exportModal')[1];
  const formatsLine = modal.split('\n').find(l => l.includes('const FORMATS'));
  const rendered = [...formatsLine.matchAll(/\['(\w+)',/g)].map(m => m[1]);
  for (const id of rendered) {
    assert.ok(serverFormats.includes(id), `the rendered format ${id} is servable`);
  }
});

test('the mspdi catalogue keys exist in both languages and name the XML format honestly', () => {
  const en = JSON.parse(read('src/locales/en.json'));
  const fr = JSON.parse(read('src/locales/fr.json'));
  for (const k of ['export.format.mspdi', 'export.notice.mspdi']) {
    assert.ok(typeof en[k] === 'string' && en[k].length > 0, `EN has ${k}`);
    assert.ok(typeof fr[k] === 'string' && fr[k].length > 0, `FR has ${k}`);
    assert.ok(!/[<>"]/.test(en[k]) && !/[<>"]/.test(fr[k]), `${k} carries no angle bracket or double quote`);
  }
  assert.ok(/\.xml/.test(en['export.format.mspdi']), 'the label names the .xml extension');
  assert.ok(!/\.mpp/i.test(en['export.format.mspdi'] + en['export.notice.mspdi']), 'no label claims native Project binary support');
});
