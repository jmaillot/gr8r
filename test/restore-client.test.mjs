/* =====================================================================
   Restore client wiring (Phase 89, plan 89-06, BKRST-01/BKRST-02) —
   the backup-history-client source-assertion discipline.
   fs-reads the REAL sources and pins the 89-06 restore surface
   structurally:

   - api client: the five restore methods exist beside the keyed-error
     doc block (every route refusal flows call()'s central handling)
   - restore section: payload fields render through esc(); render-only
     doctrine — no client-side archive parsing, no client-side name
     derivation (no `-restored` counter math under the page, D-89-13)
   - actions: the accepted trigger starts the ONE shared poll timer —
     backupPollTick fetches BOTH current payloads; no second interval
   - stages: fetching/validating/restoring/verifying/done/failed render
     verbatim from the payload — no client-side stage inference
   - 5-locale key parity: every page.restore.* key lands in ALL FIVE
     catalogues with identical key sets, beside the keyed refusals
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const apiSrc = read('src/core/api.js');
const pagesSrc = read('src/pages/backup.js');
const actionsSrc = read('src/actions/actions.js');

test('the api client exports the five restore methods with the keyed-error doc block', () => {
  for (const name of ['restoreBackups', 'restorePreview', 'restoreRun', 'restoreRunCurrent', 'restoreRuns']) {
    assert.match(apiSrc, new RegExp(`async ${name}\\(`), `api.js must export ${name}`);
  }
  assert.match(
    apiSrc,
    /restoreBackups[\s\S]*restorePreview[\s\S]*restoreRun\([\s\S]*restoreRunCurrent[\s\S]*restoreRuns/,
    'the five methods sit beside the backup family',
  );
  /* The keyed-error doc block names the route refusal vocabulary EXACTLY as
     the server emits it (89-03/04/05 routes) — closed on both sides. */
  for (const code of ['restoreArchiveMissing', 'restoreManifestCorrupt', 'restoreEntryRejected', 'restoreShaMismatch', 'restoreNoWorkspace', 'backupRestoreInProgress', 'operatorOnly', 'backupRoleRequired', 'backupManageRequired', 'tooManyAttempts']) {
    assert.ok(apiSrc.includes(code), `the restore doc block names the refusal ${code} exactly as the server emits it`);
  }
  assert.match(apiSrc, /encodeURIComponent\(runId\)/, 'the preview read carries runId in the query string');
});

test('the restore section renders payload fields through esc() — render-only, no client-side derivation', () => {
  assert.match(pagesSrc, /RESTORE_LOCATION_KEYS = \{/, 'the location badge vocabulary is a keyed map');
  for (const loc of ['local', 's3', 'missing']) {
    assert.match(pagesSrc, new RegExp(`${loc}: 'page\\.restore\\.`), `the ${loc} location is keyed`);
  }
  assert.match(pagesSrc, /const restoreRow = /, 'the list row renderer exists');
  assert.match(pagesSrc, /esc\(r\.filename\b/, 'the archive filename renders as TEXT (payload verbatim)');
  assert.match(pagesSrc, /'page\.restore\.locMissing'/, 'the missing-location badge is keyed (D-89-15 — the restore is refused keyed)');
  /* D-89-13 render-verbatim: the client NEVER derives the final restore name
     — no `-restored` counter math, no slug computation under the page. */
  assert.ok(!pagesSrc.includes('-restored'), 'no `-restored` counter math under the page (D-89-13: the server derives the final name)');
  assert.ok(!pagesSrc.includes('uniqueSlug'), 'no slug computation under the page');
  /* Render-only prohibition: the client never parses archive bytes. */
  assert.ok(!/JSZip|unzip|AdmZip|\btar\b/i.test(pagesSrc), 'no archive parsing library under the page');
  assert.ok(!/\bfetch\(/.test(pagesSrc), 'no direct fetch under the page — every read rides the api client');
});

test('the preview drawer opens ONLY from a manifest payload and renders it verbatim', () => {
  assert.match(pagesSrc, /const restorePreviewDrawer = /, 'the preview drawer renderer exists');
  assert.match(pagesSrc, /S\.ui\.restorePreviewData/, 'the drawer body renders from the staged manifest payload — never fabricated');
  assert.match(pagesSrc, /aria-busy="true"/, 'the streaming manifest shows an honest aria-busy loading body');
  for (const key of ['previewTitle', 'scopeLabel', 'tablesLabel', 'filesLabel', 'checksumLabel', 'skippedTablesNote', 'restoreNewAction']) {
    assert.match(pagesSrc, new RegExp(`t\\('page\\.restore\\.${key}'`), `the drawer renders the keyed ${key} copy`);
  }
  /* D-89-12: missing-blob-flagged file rows render flagged with the count shown. */
  assert.match(pagesSrc, /missingBlobCount/, 'the missing-blob count rides the payload into the drawer');
  /* The corrupt-manifest contract lives on the ACTION side: the drawer never
     opens without a manifest — the refusal closes it and toasts the copy. */
  assert.match(actionsSrc, /page\.restore\.previewCorrupt/, 'a corrupt manifest toasts the previewCorrupt copy and the drawer stays closed');
  /* runRow idiom: the checksum renders a 12-char slice with the full digest in title. */
  assert.match(pagesSrc, /slice\(0, 12\)/, 'the checksum renders the runRow trunc/title idiom');
});

test('the poll loop is ONE timer — backupPollTick fetches both currents, no second interval exists', () => {
  assert.match(actionsSrc, /api\.restoreRunCurrent\(/, 'the shared tick also fetches the restore current payload');
  const tick = actionsSrc.slice(
    actionsSrc.indexOf('export async function backupPollTick'),
    actionsSrc.indexOf('function backupStartPolling'),
  );
  assert.ok(tick.includes('api.backupRunCurrent') && tick.includes('api.restoreRunCurrent'), 'the ONE tick serves both surfaces');
  assert.ok(!/restorePollTimer|restoreStartPolling|restoreStopPolling/.test(actionsSrc), 'no second interval machinery exists — ONE timer (D-89-1)');
  const intervals = actionsSrc.match(/setInterval\(/g) || [];
  assert.equal(intervals.length, 3, 'no NEW setInterval appeared in actions.js (the restore rides the existing backup interval)');
  assert.match(actionsSrc, /RESTORE_ACTIVE_STAGES/, 'the restore stage vocabulary is declared beside the backup one');
});

test('restore stages render verbatim from the payload — pending panel, stage labels, done/failed bodies', () => {
  assert.match(pagesSrc, /RESTORE_STAGE_KEYS = \{/, 'the stage vocabulary is a keyed map');
  for (const s of ['fetching', 'validating', 'restoring', 'verifying', 'done', 'failed']) {
    assert.match(pagesSrc, new RegExp(`${s}: 'page\\.restore\\.`), `the ${s} stage is keyed`);
  }
  assert.match(pagesSrc, /t\('page\.restore\.pending'\)/, 'the pending panel is keyed (aria-busy, no fabricated stage)');
  assert.match(pagesSrc, /t\('page\.restore\.stageLabel'\)/, 'the stage panel title is keyed');
  assert.match(pagesSrc, /t\('page\.restore\.runDone'/, 'the done body is keyed');
  assert.match(pagesSrc, /t\('page\.restore\.runFailed'\)/, 'the failed body is keyed');
  /* Render-only: no client-side stage inference — the stage string is a map
     lookup on the payload value, never an assignment. */
  assert.ok(!/stage = ['"](?:fetching|validating|restoring|verifying)['"]/.test(pagesSrc), 'no client-side stage assignment (render-only)');
  /* The accepted trigger starts the shared poll (the pending flag only says
     "trigger accepted, first poll has not landed yet"). */
  const trigger = actionsSrc.slice(actionsSrc.indexOf('A.restoreNew ='), actionsSrc.indexOf('A.restoreNew =') + 1600);
  assert.ok(trigger.includes('api.restoreRun('), 'the trigger calls api.restoreRun');
  assert.ok(trigger.includes('backupStartPolling()'), 'the accepted trigger starts the shared poll timer');
  assert.ok(trigger.includes('S.ui.restorePending = true'), 'the pending flag stages before the first poll lands');
});

test('restore empty/loading/history states mirror the backup card discipline', () => {
  assert.match(pagesSrc, /t\('page\.restore\.listEmptyTitle'\)/, 'the zero-runs empty state is keyed');
  assert.match(pagesSrc, /t\('page\.restore\.listLoading'\)/, 'the list loading row is keyed');
  assert.match(pagesSrc, /t\('page\.restore\.listUnavailable'\)/, 'the list unavailable row is keyed');
  assert.match(pagesSrc, /t\('page\.restore\.historyEmpty'\)/, 'the zero-history faint row is keyed');
  assert.match(pagesSrc, /t\('page\.restore\.historyCap'\)/, 'the 50-cap note is keyed (the server owns the cap)');
  assert.match(pagesSrc, /t\('page\.restore\.skipReportLabel'\)/, 'the skipped-tables report is keyed (D-89-7: report-only, never hidden)');
  assert.match(pagesSrc, /t\('page\.restore\.errorToggle'\)/, 'the expandable error toggle is keyed');
  assert.match(pagesSrc, /runs\.map\(restoreRunRow\)\.join\(''\)/, 'restore history renders verbatim in server order — no client re-sort, no client cap');
  assert.ok(!/\.slice\(0, 50\)/.test(pagesSrc), 'no client-side 50 cap');
  assert.match(pagesSrc, /esc\(run\.error\)/, 'restore errors render through esc()');
  assert.match(pagesSrc, /restorePollKickAllowed\(\)/, 'the restore kick honors the WR-02 failure cooldown');
  /* The page kick covers a mid-restore deep link — the shared tick re-fetches
     the restore current payload on page entry (backup.js:336 idiom). */
  assert.match(pagesSrc, /flags\.canRestore && !S\.ui\.restoreRun && !S\.ui\.restorePending && restorePollKickAllowed\(\)/, 'the page kick covers the restore surface (mid-restore re-entry)');
});

test('the tracer happy path is wired: list fill → preview fetch → import-as-new → shared poll', () => {
  assert.match(actionsSrc, /export async function refreshRestoreBackups/, 'the restore list fill loop exists');
  assert.match(pagesSrc, /refreshRestoreBackups\(\)/, 'the page fills the restore list');
  assert.match(actionsSrc, /A\.restorePreview =/, 'the preview action exists');
  assert.match(actionsSrc, /api\.restorePreview\(/, 'the preview action fetches the manifest');
  assert.match(actionsSrc, /A\.restoreNew =/, 'the import-as-new action exists');
  assert.match(actionsSrc, /A\.restorePreviewClose =/, 'the drawer close action exists');
  assert.match(pagesSrc, /data-a="restorePreview"/, 'the list rows render the preview action');
  assert.match(pagesSrc, /data-a="restoreNew"/, 'the drawer renders the import-as-new CTA');
  assert.match(pagesSrc, /data-a="restorePreviewClose"/, 'the drawer renders the close affordance');
});

test('5-locale key parity for the 89-06 restore surface', () => {
  const required = [
    'page.restore.title', 'page.restore.lead',
    'page.restore.listEmptyTitle', 'page.restore.listEmptyBody', 'page.restore.listLoading', 'page.restore.listUnavailable',
    'page.restore.locLocal', 'page.restore.locS3', 'page.restore.locMissing',
    'page.restore.previewAction', 'page.restore.previewTitle', 'page.restore.previewCorrupt',
    'page.restore.scopeLabel', 'page.restore.tablesLabel', 'page.restore.filesLabel', 'page.restore.checksumLabel',
    'page.restore.skippedTablesNote', 'page.restore.restoreNewAction',
    'page.restore.stageLabel', 'page.restore.pending',
    'page.restore.stageFetching', 'page.restore.stageValidating', 'page.restore.stageRestoring', 'page.restore.stageVerifying',
    'page.restore.stageDone', 'page.restore.stageFailed',
    'page.restore.runDone', 'page.restore.runFailed',
    'page.restore.historyTitle', 'page.restore.historyCap', 'page.restore.historyEmpty',
    'page.restore.historyLoading', 'page.restore.historyUnavailable',
    'page.restore.skipReportLabel', 'page.restore.errorToggle',
  ];
  for (const key of required) assert.ok(pagesSrc.includes(key) || actionsSrc.includes(key), `the combined source uses ${key}`);
  const sets = new Set();
  for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
    const cat = JSON.parse(read(`src/locales/${loc}.json`));
    sets.add(Object.keys(cat).filter(k => k.startsWith('page.restore.')).sort().join('|'));
    for (const key of required) assert.ok(Object.hasOwn(cat, key), `${loc} is missing ${key}`);
  }
  assert.equal(sets.size, 1, 'page.restore.* key sets are identical across the five locales');
  /* The keyed refusal vocabulary this slice renders (plan keys + the
     error-codes catalogue closure: every code the restore routes emit). */
  for (const code of ['restoreArchiveMissing', 'restoreNoWorkspace', 'backupRestoreInProgress', 'restoreEntryRejected', 'restoreShaMismatch', 'restoreInvalidRunId', 'restoreScopeUnsupported', 'restoreManifestCorrupt']) {
    for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
      const cat = JSON.parse(read(`src/locales/${loc}.json`));
      assert.ok(typeof cat[`err.${code}`] === 'string' && cat[`err.${code}`] !== '', `${loc} err.${code} is non-empty`);
    }
  }
});
