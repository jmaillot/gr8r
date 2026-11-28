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
  /* UAT round-9 (owner ruling): the standalone list is retired — the Restore
     action rides the unified history table rows; no restoreRow renderer. */
  assert.ok(!pagesSrc.includes('const restoreRow = '), 'the retired list renderer is gone');
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
  /* UAT round-9/10: the standalone list AND the history card are retired —
     the unified table carries the rows; skipReportLabel lives in the drawer
     + the table's Run cell. */
  assert.match(pagesSrc, /t\('page\.restore\.skipReportLabel'\)/, 'the skipped-tables report is keyed (D-89-7: report-only, never hidden)');
  assert.match(pagesSrc, /t\('page\.restore\.errorToggle'\)/, 'the expandable error toggle is keyed');
  assert.match(pagesSrc, /restoreRuns\.map\(r => \(\{ at: Number\(r\.started_at\) \|\| 0, row: restoreRunTr\(r\)\s*\}\)\)/, 'restore rows enter the merged date-ordered stream — no client cap');
  /* UAT 2026-11-27 (owner: the Run cell showed only the workspace name):
     the Run cell leads with the SOURCE archive filename (archive_name
     rides the runs payload + the server select); the final workspace
     name stays as the secondary hint. */
  const runTrSlice = pagesSrc.slice(pagesSrc.indexOf('const restoreRunTr ='), pagesSrc.indexOf('const restoreRunTr =') + 1800);
  assert.match(runTrSlice, /run\.archive_name/, 'the Run cell renders the restored archive filename');
  assert.ok(read('server.js').includes('r.archive_name, r.created_by, u.name as created_by_name'), 'the runs select carries archive_name (+ created_by / created_by_name via the CARRY-02 left join — pin extended, never weakened)');
  assert.ok(!/\.slice\(0, 50\)/.test(pagesSrc), 'no client-side 50 cap');
  assert.match(pagesSrc, /esc\(run\.error\)/, 'restore errors render through esc()');
  assert.match(pagesSrc, /restorePollKickAllowed\(\)/, 'the restore kick honors the WR-02 failure cooldown');
  /* The page kick covers a mid-restore deep link — the shared tick re-fetches
     the restore current payload on page entry (backup.js:336 idiom). */
  assert.match(pagesSrc, /flags\.canRestore && !S\.ui\.restoreRun && !S\.ui\.restorePending && restorePollKickAllowed\(\)/, 'the page kick covers the restore surface (mid-restore re-entry)');
});

test('the tracer happy path is wired: list fill → preview fetch → import-as-new → shared poll', () => {
  /* UAT round-9: the standalone list fill is retired — the preview opens
     from the unified history table's per-run Restore button. */
  assert.ok(!actionsSrc.includes('export async function refreshRestoreBackups'), 'the retired list fill loop is gone');
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
    'page.restore.title',
    'page.restore.restoreAction',
    'page.restore.locLocal', 'page.restore.locS3', 'page.restore.locMissing',
    'page.restore.previewTitle', 'page.restore.previewCorrupt',
    'page.restore.scopeLabel', 'page.restore.targetPickLabel', 'page.restore.targetPickHint', 'page.restore.targetArmed', 'page.restore.tablesLabel', 'page.restore.filesLabel', 'page.restore.checksumLabel',
    'page.restore.skippedTablesNote', 'page.restore.restoreNewAction',
    'page.restore.stageLabel', 'page.restore.pending',
    'page.restore.stageFetching', 'page.restore.stageValidating', 'page.restore.stageRestoring', 'page.restore.stageVerifying',
    'page.restore.stageDone', 'page.restore.stageFailed',
    'page.restore.runDone', 'page.restore.runFailed',
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

/* =====================================================================
   Task 3 (105-01): the source transport matrix — the armed source rides
   all 6 restore calls (GD-4: GETs query, POSTs camelCase body), omitted
   when nothing non-default is armed; the zero-derivation guard; the
   reset coverage.
   ===================================================================== */
test('105-01: the armed source threads through all 6 restore calls — query on GETs, camelCase body on POSTs, omitted when default', () => {
  /* preview: GET builder appends &source= (encodeURIComponent'd) */
  assert.match(apiSrc, /async restorePreview\(runId, \{ source, signal \} = \{\}\)/, 'the preview builder accepts the armed source');
  assert.match(apiSrc, /&source=\$\{encodeURIComponent\(source\)\}/, 'the preview GET appends &source= encoded');
  /* verify: camelCase body.source */
  assert.match(apiSrc, /async backupVerifyChecksum\(runId, \{ source, signal \} = \{\}\)/, 'the verify builder accepts the armed source');
  assert.match(apiSrc, /call\('POST', '\/api\/backup\/verify-checksum', \{ runId, source \}/, 'the verify POST carries body.source camelCase');
  /* the actions pass restoreArmedSource — only values that came from sources[] */
  const preview = actionsSrc.slice(actionsSrc.indexOf('A.restorePreview ='), actionsSrc.indexOf('A.restorePreview =') + 2400);
  assert.ok(preview.includes('api.restorePreview(runId, { source: restoreArmedSource(runId) })'), 'the preview action passes the armed source');
  const dl = actionsSrc.slice(actionsSrc.indexOf('A.backupDownload ='), actionsSrc.indexOf('A.backupDownload =') + 900);
  assert.ok(dl.includes('restoreArmedSource(el.dataset.id)'), 'the download action threads the armed source');
  assert.ok(dl.includes('&source=${encodeURIComponent(src)}'), 'the download URL appends &source= encoded (omitted → byte-identical URL)');
  const verify = actionsSrc.slice(actionsSrc.indexOf('A.backupVerifyChecksum ='), actionsSrc.indexOf('A.backupVerifyChecksum =') + 900);
  assert.ok(verify.includes('api.backupVerifyChecksum(id, { source: restoreArmedSource(id) })'), 'the verify action threads the armed source');
  for (const name of ['A.restoreNew =', 'A.restoreOverwrite =', 'A.restoreInstance =']) {
    const slice = actionsSrc.slice(actionsSrc.indexOf(name), actionsSrc.indexOf(name) + 4600);
    assert.ok(slice.includes('source: restoreArmedSource(runId)'), `${name} carries body.source camelCase (omitted when default)`);
  }
  const newBody = actionsSrc.slice(actionsSrc.indexOf('api.restoreRun('), actionsSrc.indexOf('api.restoreRun(') + 200);
  assert.ok(newBody.includes('source: restoreArmedSource(runId)'), 'the import-new trigger body carries the armed source');
});

test('105-01: the picker consumes sources[] verbatim — zero client-side availability derivation; reset coverage is total', () => {
  /* Zero-derivation guard (D-23): the client never computes availability —
     no destination-enabled math anywhere under the page. The mirror flags
     themselves DO render as row badges (render-verbatim, R-4) — what is
     forbidden is deriving the PICKER's availability from them. */
  assert.ok(!pagesSrc.includes('S3.enabled') && !pagesSrc.includes('FTP.enabled') && !pagesSrc.includes('SMB.enabled'), 'no destination-enabled derivation under the page');
  const picker = pagesSrc.slice(pagesSrc.indexOf('const sourcePicker'), pagesSrc.indexOf('${sourcePicker}'));
  assert.ok(!picker.includes('uploaded') && !picker.includes('.enabled'), 'the picker reads ONLY sources[] — no flag math inside the picker');
  /* The pending-run progress panel carries NO source/probe markup (no
     mid-run swap — RSRC-04: new runId semantics). */
  const progress = pagesSrc.slice(pagesSrc.indexOf('const restoreProgress ='), pagesSrc.indexOf('const restoreRunTr ='));
  assert.ok(!progress.includes('restoreSource') && !progress.includes('restoreProbe'), 'no source control in the pending-run progress panel');
  /* Resets: close + all three accepted-trigger paths null the full picker
     state (arm, probe badges, feed). */
  const close = actionsSrc.slice(actionsSrc.indexOf('A.restorePreviewClose ='), actionsSrc.indexOf('A.restorePreviewClose =') + 700);
  for (const slot of ['S.ui.restoreSource = null', 'S.ui.restoreProbe = null', 'S.ui.restoreSourcesById = null']) {
    assert.ok(close.includes(slot), `the close action resets ${slot}`);
  }
  const resets = actionsSrc.split('S.ui.restoreProbe = null;').length - 1;
  assert.ok(resets >= 6, `every accepted-trigger path resets the probe state too (found ${resets} reset sites: close + open-different-run + 4 triggers)`);
  /* The runId-different reopen invalidates the arm (no stale arm across drawers). */
  const preview = actionsSrc.slice(actionsSrc.indexOf('A.restorePreview ='), actionsSrc.indexOf('A.restorePreview =') + 2400);
  assert.ok(preview.includes('prevRunId !== runId'), 'opening a DIFFERENT run resets the armed source + probe badges');
  /* 5-locale parity gate for the whole source* key family rides the Task-2 parity test. */
});

/* =====================================================================
   Task 2 (D-89-23/27): destructive confirm flows + workspace picker +
   the CLOSED refusal-toast map.
   ===================================================================== */
test('the overwrite flow uses the exact-name confirmModal idiom — payload-named target, OK-gated, danger-styled', () => {
  assert.match(pagesSrc, /page\.restore\.restoreOverwriteAction/, 'the overwrite CTA copy is wired');
  assert.match(pagesSrc, /data-a="restoreOverwrite"/, 'the drawer renders the overwrite CTA');
  /* D-89-21: the CTA renders only when the payload's canBackup flag is true
     AND the archive is workspace-scope — never recomputed authority. */
  assert.match(pagesSrc, /const kind = d\.scope\?\.kind;/, 'the drawer CTAs gate on the preview payload\'s scope kind');
  assert.match(pagesSrc, /kind === 'workspace'/, 'the overwrite CTA renders for workspace archives only');
  assert.match(pagesSrc, /flags\?\.canBackup/, 'the overwrite CTA gates on the payload flag');
  assert.match(pagesSrc, /btn-danger" data-a="restoreOverwrite"/, 'the overwrite CTA is destructive-styled, never accent');
  /* 95-05: the project branch lengthens the action — widen the window to
     cover BOTH branches (project path first, workspace path after). */
  const h = actionsSrc.slice(actionsSrc.indexOf('A.restoreOverwrite ='), actionsSrc.indexOf('A.restoreOverwrite =') + 4600);
  assert.ok(h.includes('confirmDlg('), 'the overwrite flow opens the existing confirm idiom');
  assert.ok(h.includes('typeName: target.name'), 'typeName is the target\'s EXACT current name from the payload (D-89-27)');
  assert.ok(h.includes('danger: true'), 'the overwrite confirm is danger-styled');
  assert.ok(h.includes('page.restore.confirmOverwriteTitle') && h.includes('page.restore.confirmOverwriteBody'), 'the consequence copy is keyed (target + pre_restore snapshot + not undoable)');
  assert.ok(h.includes('page.restore.confirmOverwriteOk'), 'the OK label is keyed');
  assert.ok(h.includes('api.restoreOverwrite(') && h.includes('confirmName: target.name'), 'OK calls the overwrite route with the confirm value');
  assert.ok(h.includes('S.ui.restorePending = true') && h.includes('backupStartPolling()'), 'the accepted overwrite hands over to the pending panel + shared poll');
});

test('the DR flow is Super-Admin-only with the literal RESTORE-INSTANCE phrase rendered untranslated in --mono', () => {
  assert.match(pagesSrc, /page\.restore\.restoreInstanceAction/, 'the DR CTA copy is wired');
  assert.match(pagesSrc, /data-a="restoreInstance"/, 'the drawer renders the DR CTA');
  /* D-89-21: the CTA renders only for the auth payload's Super-Admin flag. */
  assert.match(pagesSrc, /api\.user\?\.isInstanceAdmin/, 'the DR CTA gates on the auth payload flag');
  assert.match(pagesSrc, /kind === 'instance'/, 'the DR CTA renders for instance archives only');
  const dr = actionsSrc.slice(actionsSrc.indexOf('A.restoreInstance ='), actionsSrc.indexOf('A.restoreInstance =') + 1800);
  /* The machine constant is a NAMED source constant (never a bare text node —
     the i18n scanner's zero-findings verdict), interpolated into the mono
     span inside the confirm body. */
  assert.match(actionsSrc, /const DR_CONFIRM_PHRASE = 'RESTORE-INSTANCE';/, 'the DR phrase is a named machine constant');
  assert.match(dr, /<span class="mono">\$\{DR_CONFIRM_PHRASE\}<\/span>/, 'the phrase renders untranslated in --mono inside the confirm body');
  assert.ok(dr.includes('confirmDlg('), 'the DR flow opens the existing confirm idiom');
  assert.ok(dr.includes('confirmPhrase: DR_CONFIRM_PHRASE'), 'OK calls the DR route with the literal phrase value (the shared OK gate guarantees the typed value matches)');
  assert.ok(dr.includes('typeName: DR_CONFIRM_PHRASE'), 'typeName is the literal phrase (server re-validates !==)');
  assert.ok(dr.includes('danger: true'), 'the DR confirm is danger-styled');
  assert.ok(dr.includes('page.restore.confirmInstanceTitle') && dr.includes('page.restore.confirmInstanceBody'), 'the consequence copy is keyed (OQ4 operand-loss sentence included)');
  assert.ok(dr.includes('page.restore.confirmInstanceOk'), 'the OK label is keyed');
  assert.ok(dr.includes('api.restoreInstance('), 'OK calls the DR route');
  assert.ok(dr.includes('S.ui.restorePending = true') && dr.includes('backupStartPolling()'), 'the accepted DR hands over to the pending panel + shared poll');
  /* The machine constant never leaks into any locale catalogue. */
  for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
    const cat = JSON.parse(read(`src/locales/${loc}.json`));
    for (const v of Object.values(cat)) {
      if (typeof v === 'string') assert.ok(!v.includes('RESTORE-INSTANCE'), `the machine constant stays out of the ${loc} catalogue`);
    }
  }
});

test('project archives show the workspace picker — live memberships verbatim, zero memberships hides it and mirrors the keyed refusal', () => {
  assert.match(pagesSrc, /page\.restore\.newNameLead/, 'the server-derived final-name preview is wired (D-89-13 render-verbatim from the poll payload)');
  assert.match(pagesSrc, /data-a="restoreTargetPick"/, 'the picker is a keyed action');
  assert.match(pagesSrc, /api\.workspaces/, 'the picker options come from the api client (live memberships payload — never fabricated)');
  assert.match(pagesSrc, /Array\.isArray\(api\.workspaces\)/, 'the memberships fallback stays payload-guarded (no fabrication)');
  /* UAT round-8 (owner ruling): a Super Admin restores without live
     membership — the picker prefers the phase-92 scopes payload (every
     active workspace), the trigger re-validates authority server-side. */
  assert.match(pagesSrc, /scopeTargets\.length/, 'the picker renders from the scopes payload (Super Admin no-membership case)');
  const pick = pagesSrc.slice(pagesSrc.indexOf('restoreTargetPick'), pagesSrc.indexOf('restoreTargetPick') + 900);
  assert.ok(/esc\(w\.name\)|esc\(String\(w\.name\)\)/.test(pick), 'workspace names render through esc()');
  const rn = actionsSrc.slice(actionsSrc.indexOf('A.restoreNew ='), actionsSrc.indexOf('A.restoreNew =') + 1200);
  assert.ok(rn.includes("'restoreTargetMissing'"), 'a project trigger attempt without a target refuses client-side with the keyed pick-a-target message (UAT round-10: not the membership refusal)');
});

test('restore refusals ride the CLOSED toast map — every route-level code maps 1:1 onto a ×5 key, no freeform strings', () => {
  const start = actionsSrc.indexOf('RESTORE_REFUSAL_TOASTS = {');
  assert.ok(start > 0, 'the closed refusal map is declared');
  const map = actionsSrc.slice(start, actionsSrc.indexOf('};', start));
  const codes = [
    'backupRoleRequired', 'backupManageRequired', 'operatorOnly', 'tooManyAttempts',
    'restoreInvalidRunId', 'restoreArchiveMissing', 'restoreNoWorkspace', 'restoreScopeUnsupported',
    'backupRestoreInProgress', 'restoreEntryRejected', 'restoreShaMismatch',
    'confirmPhraseMismatch', 'restoreTargetMismatch', 'restoreTargetMissing',
  ];
  for (const c of codes) assert.match(map, new RegExp(`${c}:\\s*'`), `the map covers ${c}`);
  assert.match(map, /restoreManifestCorrupt:\s*'page\.restore\.previewCorrupt'/, 'the corrupt class maps to the UI-SPEC contract copy');
  const mappedKeys = [...map.matchAll(/'(err\.[A-Za-z]+|page\.restore\.[A-Za-z]+)'/g)].map(x => x[1]);
  assert.ok(mappedKeys.length >= codes.length + 1, 'every entry maps onto a locale key');
  for (const k of mappedKeys) {
    for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
      const cat = JSON.parse(read(`src/locales/${loc}.json`));
      assert.ok(Object.hasOwn(cat, k), `${loc} is missing the mapped key ${k}`);
    }
  }
  /* Every restore action routes refusals through the map — no freeform tErr
     path for restore codes (unknown codes fall to tErr's raw-message D-03
     fallback inside restoreToast itself). */
  for (const a of ['A.restorePreview =', 'A.restoreNew =', 'A.restoreOverwrite =', 'A.restoreInstance =']) {
    /* 105-01: the preview action also carries the restoreBackups picker
       kick (RSRC-04) — the window widens to cover the full action. */
    const slice = actionsSrc.slice(actionsSrc.indexOf(a), actionsSrc.indexOf(a) + 2600);
    /* UAT 2026-11-27: restoreMissingToast wraps restoreToast — the
       restoreArchiveMissing detail (which seam failed, why) rides the toast.
       Client-side early refusals (restoreTargetMissing) keep restoreToast —
       there is no server detail to carry. */
    assert.match(slice, /restore(Missing)?Toast\(/, `${a} surfaces refusals through the closed map`);
  }
});

test('5-locale key parity for the Task-2 destructive surface', () => {
  const required = [
    'page.restore.restoreOverwriteAction', 'page.restore.restoreInstanceAction',
    'page.restore.newNameLead',
    'page.restore.confirmOverwriteTitle', 'page.restore.confirmOverwriteBody', 'page.restore.confirmOverwriteOk',
    'page.restore.confirmInstanceTitle', 'page.restore.confirmInstanceBody', 'page.restore.confirmInstanceOk',
    /* The 89-04 handoff: email alert keys are top-level (backup.alert.* idiom),
       consumed by the server's buildRestoreAlertMessage via tFor. */
    'restore.alert.done.subject', 'restore.alert.done.body',
    'restore.alert.failed.subject', 'restore.alert.failed.body',
  ];
  const sets = new Set();
  for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
    const cat = JSON.parse(read(`src/locales/${loc}.json`));
    sets.add(Object.keys(cat).filter(k => k.startsWith('page.restore.')).sort().join('|'));
    for (const key of required) assert.ok(Object.hasOwn(cat, key), `${loc} is missing ${key}`);
  }
  assert.equal(sets.size, 1, 'page.restore.* key sets stay identical across the five locales (same-commit doctrine)');
  /* The DR-operand-loss sentence lands verbatim in every locale (OQ4). */
  for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
    const cat = JSON.parse(read(`src/locales/${loc}.json`));
    assert.ok(String(cat['page.restore.confirmInstanceBody']).length > 120, `${loc} confirmInstanceBody carries the full consequence copy (OQ4)`);
  }
  /* The error-codes catalogue closure: the Task-2 refusal keys land too. */
  for (const code of ['confirmPhraseMismatch', 'restoreTargetMismatch', 'restoreTargetMissing']) {
    for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
      const cat = JSON.parse(read(`src/locales/${loc}.json`));
      assert.ok(typeof cat[`err.${code}`] === 'string' && cat[`err.${code}`] !== '', `${loc} err.${code} is non-empty`);
    }
  }
});

/* =====================================================================
   Task 3 — the four held-out UI-state backstop rows (89-UI-SPEC.md
   190-193) as structural assertions, then the consideration-matrix tally.
   ===================================================================== */
test('backstop: long-text render sites truncate with title attrs and the counter name renders fully', () => {
  /* The list row's filename and the history row's final name truncate via
     the .trunc idiom (display:inline-block + max-width, backup.js:90) with
     the FULL value in the title attr. */
  /* UAT round-9: the list filename trunc span is retired — the filename
     rides the history run cell's tooltip (runTip, esc'd). */
  assert.match(pagesSrc, /const runTip = \[run\.label, run\.filename\]/, 'the archive filename rides the history tooltip');
  /* UAT 2026-11-27: the Run cell leads with the archive filename (mono,
     title carries it); the final workspace name stays as the faint
     secondary hint — same truncation + esc discipline. */
  assert.match(pagesSrc, /<span class="mono trunc" style="display:inline-block;max-width:\d+px" title="\$\{esc\(archiveName \|\| finalName\)\}">/, 'the history archive filename truncates with the full value in title');
  /* The sha256 12-char slice idiom (backup.js history tooltip round-6) —
     the list sha trunc span is retired with the list. */
  assert.match(pagesSrc, /const runTip = \[run\.label, run\.filename\]/, 'the archive filename rides the history tooltip');
  /* A `-restored-2` counter name renders FULLY in the stage panel — the
     done/active bodies interpolate the payload name inside a wrapping <p>,
     never a trunc span (no client name math either, D-89-13). */
  const progress = pagesSrc.slice(pagesSrc.indexOf('const restoreProgress ='), pagesSrc.indexOf('const restoreRunTr ='));
  assert.match(progress, /page\.restore\.newNameLead/, 'the active body carries the final-name preview');
  assert.match(progress, /page\.restore\.runDone/, 'the done body carries the payload name');
  assert.ok(!progress.includes('trunc'), 'the stage panel never truncates the counter name — it renders fully and wraps');
  /* The picker's workspace names carry title attrs for the truncated form. */
  assert.match(pagesSrc, /data-a="restoreTargetPick" data-id="\$\{esc\(w\.id\)\}" title="\$\{esc\(w\.name\)\}"/, 'picker names truncate with the full value in title');
});

test('backstop: near-miss confirm input keeps OK disabled with no error chrome; the DR operand renders --mono untranslated', () => {
  const modalsSrc = read('src/overlays/modals.js');
  /* The shared confirm idiom: OK carries the disabled attribute until the
     typed value exactly matches typeName — a near-miss never enables it. */
  assert.match(modalsSrc, /const ok = !needs \|\| \(S\.ui\.confirmText \|\| ''\) === needs;/, 'the OK gate compares the typed value EXACTLY against typeName');
  assert.match(modalsSrc, /data-a="confirmOk" \$\{ok \? '' : 'disabled'\}/, 'a near-miss typed name keeps OK disabled');
  /* No error chrome exists in the confirm modal — the disabled state IS the
     whole feedback surface. */
  const modal = modalsSrc.slice(modalsSrc.indexOf('function confirmModal'), modalsSrc.indexOf('function confirmModal') + 1600);
  assert.ok(!modal.includes('err.'), 'the confirm modal shows no keyed error copy on near-miss input — no error chrome');
  assert.ok(!/class="[^"]*error/.test(modal), 'the confirm modal renders no error element');
  /* The DR operand renders in --mono, untranslated (named machine constant). */
  const dr = actionsSrc.slice(actionsSrc.indexOf('A.restoreInstance ='), actionsSrc.indexOf('A.restoreInstance =') + 1800);
  assert.match(dr, /<span class="mono">\$\{DR_CONFIRM_PHRASE\}<\/span>/, 'the DR phrase renders untranslated in --mono');
  assert.ok(!dr.includes("t('page.restore.confirmPhrase'") && !dr.includes('err.restoreInstance'), 'the phrase is never routed through a locale key');
});

test('backstop: consequence copy wraps inside the modal body — no nowrap or overflow-hidden introduced', () => {
  /* The overwrite/DR bodies pass plain interpolated text into the shared
     .modal-b region — no nowrap, no overflow-hidden, no fixed height, so
     the longest locale copy wraps and the modal scrolls via existing
     behavior. */
  for (const a of ['A.restoreOverwrite =', 'A.restoreInstance =']) {
    const slice = actionsSrc.slice(actionsSrc.indexOf(a), actionsSrc.indexOf(a) + 1600);
    assert.ok(!/white-space:\s*nowrap/.test(slice), `${a} introduces no nowrap`);
    assert.ok(!/overflow:\s*hidden/.test(slice), `${a} introduces no overflow-hidden`);
    assert.ok(!/max-height/.test(slice), `${a} introduces no fixed height`);
  }
  /* The shared modal renders the body as-is inside .modal-b (plain text
     nodes — the existing wrap/scroll posture applies untouched). */
  const modalsSrc = read('src/overlays/modals.js');
  const modal = modalsSrc.slice(modalsSrc.indexOf('function confirmModal'), modalsSrc.indexOf('function confirmModal') + 1600);
  assert.match(modal, /\$\{m\.body\}/, 'the confirm body renders verbatim inside .modal-b');
  assert.ok(!/white-space:\s*nowrap/.test(modal), 'the shared confirm modal introduces no nowrap');
});

/* =====================================================================
   Phase 105 (RSRC-04, plan 105-01): the per-source probe surface —
   api.restoreProbe, the honest badge + detail toast, the structural
   zero-probes-on-load guarantee (D-89-14).
   ===================================================================== */
test('105-01: the probe rides api.restoreProbe ONLY — one call site, inside A.restoreProbe, never in a render path', () => {
  assert.match(apiSrc, /async restoreProbe\(/, 'the api client exports restoreProbe');
  assert.match(apiSrc, /call\('POST', '\/api\/backup\/restore\/probe'/, 'the probe POSTs the live Phase-104 route');
  /* Refusal vocabulary of the probe route, named verbatim in the doc block. */
  for (const code of ['tooManyAttempts', 'backupRoleRequired', 'restoreInvalidRunId', 'restoreArchiveMissing', 'restoreSourceInvalid', 'restoreSourceNotMirrored']) {
    assert.ok(apiSrc.includes(code), `the probe doc block names the refusal ${code} exactly as the server emits it`);
  }
  const sites = [...actionsSrc.matchAll(/api\.restoreProbe\(/g)].length;
  assert.equal(sites, 1, 'exactly ONE probe call site exists in actions.js');
  const probe = actionsSrc.slice(actionsSrc.indexOf('A.restoreProbe ='), actionsSrc.indexOf('A.restoreProbe =') + 1500);
  assert.ok(probe.includes('api.restoreProbe('), 'the probe call sits inside A.restoreProbe');
  assert.ok(probe.includes("source === 'local'"), 'local never probes (the server keyed-400s it)');
  assert.ok(probe.includes('`${runId}|${source}`'), 'probe state is keyed runId|source — one run\'s result never leaks into another');
  assert.ok(/restore(Missing)?Toast\(/.test(probe), 'probe refusals ride the closed restoreMissingToast map');
  assert.ok(probe.includes('restoreProbeToast('), 'the probe result toasts through the keyed family mapping');
  /* Zero probes on load: the page layer never calls the probe at all. */
  assert.ok(!pagesSrc.includes('api.restoreProbe'), 'no probe call under the page — probes fire only from explicit clicks (D-89-14)');
});

test('105-01: the source picker renders probe affordances + honest badges; failed probes never disable a chip', () => {
  assert.match(pagesSrc, /data-a="restoreProbe" data-id="\$\{esc\(d\.runId\)\}" data-source="\$\{esc\(s\)\}"/, 'the probe button carries esc()d runId + source data attributes');
  assert.match(pagesSrc, /aria-label="\$\{t\('page\.restore\.sourceProbeCheck'\)\}"/, 'the probe button is labelled');
  assert.match(pagesSrc, /aria-busy="true"/, 'the pending probe is aria-busy');
  assert.match(pagesSrc, /s !== 'local'/, 'NO probe control renders for local (server refuses it keyed)');
  assert.match(pagesSrc, /probe\.result\.ok \? 'green'/, 'the ok badge is green-styled');
  assert.match(pagesSrc, /title="\$\{esc\(String\(probe\.result\.key \|\| ''\)\)\}"/, 'the badge exposes the raw probe key in title (honest: key inspectable)');
  assert.match(pagesSrc, /page\.restore\.sourceProbeOk/, 'the ok badge copy is keyed');
  assert.match(pagesSrc, /page\.restore\.sourceProbeFail/, 'the fail badge copy is keyed');
  /* A probe result never disables the source chip (R-4: the flag is truth —
     a failed probe does not mutate a mirror flag). */
  const picker = pagesSrc.slice(pagesSrc.indexOf('const sourcePicker'), pagesSrc.indexOf('${sourcePicker}'));
  assert.ok(!/data-a="restoreSourcePick"[^>]*disabled/.test(picker), 'the source chip is never disabled by a probe result');
});

test('105-01: 5-locale parity for the source picker + probe keys', () => {
  const required = [
    'page.restore.sourcePickLabel', 'page.restore.sourcePickHint',
    'page.restore.sourceProbeCheck', 'page.restore.sourceProbeChecking',
    'page.restore.sourceProbeOk', 'page.restore.sourceProbeFail',
  ];
  const sets = new Set();
  for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
    const cat = JSON.parse(read(`src/locales/${loc}.json`));
    sets.add(Object.keys(cat).filter(k => k.startsWith('page.restore.')).sort().join('|'));
    for (const key of required) assert.ok(Object.hasOwn(cat, key), `${loc} is missing ${key}`);
  }
  assert.equal(sets.size, 1, 'page.restore.* key sets stay identical across the five locales (same-commit doctrine)');
  assert.ok(pagesSrc.includes('page.restore.sourceProbeCheck') && pagesSrc.includes('page.restore.sourcePickHint'), 'the new keys are consumed by the page source');
});

/* =====================================================================
   Phase 108 (CARRY-01, plan 108-01): the per-run archive STAT surface —
   additive over the 105-01 pins (decision A1): a second data-a="restoreStat"
   icon button beside the probe icon, S.ui.restoreStat keyed runId|source,
   the three-state result toast family. The probe pins above stay literal.
   ===================================================================== */
test('108-01: the stat rides api.restoreStat ONLY — one call site, inside A.restoreStat, never in a render path', () => {
  assert.match(apiSrc, /async restoreStat\(/, 'the api client exports restoreStat');
  assert.match(apiSrc, /call\('POST', '\/api\/backup\/restore\/stat'/, 'the stat POSTs the live Phase-108 route');
  /* Refusal vocabulary of the stat route — the SAME probe code family, named verbatim. */
  for (const code of ['tooManyAttempts', 'backupRoleRequired', 'restoreInvalidRunId', 'restoreArchiveMissing', 'restoreSourceInvalid', 'restoreSourceNotMirrored']) {
    assert.ok(apiSrc.includes(code), `the stat doc block names the refusal ${code} exactly as the server emits it`);
  }
  const sites = [...actionsSrc.matchAll(/api\.restoreStat\(/g)].length;
  assert.equal(sites, 1, 'exactly ONE stat call site exists in actions.js');
  const stat = actionsSrc.slice(actionsSrc.indexOf('A.restoreStat ='), actionsSrc.indexOf('A.restoreStat =') + 1500);
  assert.ok(stat.includes('api.restoreStat('), 'the stat call sits inside A.restoreStat');
  assert.ok(stat.includes("source === 'local'"), 'local never stats (the server keyed-400s it)');
  assert.ok(stat.includes('`${runId}|${source}`'), 'stat state is keyed runId|source — one run\'s result never leaks into another');
  assert.ok(/restore(Missing)?Toast\(/.test(stat), 'stat refusals ride the closed restoreMissingToast map');
  /* Zero stats on load: the page layer never calls the stat at all. */
  assert.ok(!pagesSrc.includes('api.restoreStat'), 'no stat call under the page — stats fire only from explicit clicks (D-89-14)');
});

test('108-01: the source picker renders the additive stat affordance + the three-state stat badge; probe pins stay literal', () => {
  assert.match(pagesSrc, /data-a="restoreStat" data-id="\$\{esc\(d\.runId\)\}" data-source="\$\{esc\(s\)\}"/, 'the stat button carries esc()d runId + source data attributes');
  assert.match(pagesSrc, /aria-label="\$\{t\('page\.restore\.sourceStatCheck'\)\}"/, 'the stat button is labelled');
  assert.match(pagesSrc, /page\.restore\.sourceStatChecking/, 'the pending stat is labelled');
  /* The 105-01 pinned probe substrings survive ADDITIVELY (decision A1). */
  assert.match(pagesSrc, /probe\.result\.ok \? 'green'/, 'the ok badge is green-styled (probe, unchanged)');
  assert.match(pagesSrc, /title="\$\{esc\(String\(probe\.result\.key \|\| ''\)\)\}"/, 'the probe badge title pin survives');
  assert.match(pagesSrc, /page\.restore\.sourceProbeOk/, 'probe ok copy untouched');
  assert.match(pagesSrc, /page\.restore\.sourceProbeFail/, 'probe fail copy untouched');
  assert.match(pagesSrc, /s !== 'local'/, 'NO stat control renders for local either');
  /* The three-state stat badge. */
  assert.match(pagesSrc, /page\.restore\.sourceStatOk/, 'the stat ok badge copy is keyed');
  assert.match(pagesSrc, /page\.restore\.sourceProbeMissing/, 'the archiveMissing badge is the third honest state');
  assert.match(pagesSrc, /page\.restore\.sourceStatFail/, 'the unreachable stat badge copy is keyed');
  assert.match(pagesSrc, /title="\$\{esc\(String\(stat\.result\.key \|\| ''\)\)\}"/, 'the stat badge exposes the raw result key in title (honest: key inspectable)');
  /* A stat result never disables the source chip (R-4: the flag is truth). */
  const picker = pagesSrc.slice(pagesSrc.indexOf('const sourcePicker'), pagesSrc.indexOf('${sourcePicker}'));
  assert.ok(!/data-a="restoreSourcePick"[^>]*disabled/.test(picker), 'the source chip is never disabled by a stat result');
});

test('108-01: 5-locale parity for the stat keys', () => {
  const required = [
    'page.restore.sourceProbeMissing', 'page.restore.sourceStatCheck',
    'page.restore.sourceStatChecking', 'page.restore.sourceStatOk', 'page.restore.sourceStatFail',
  ];
  const sets = new Set();
  for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
    const cat = JSON.parse(read(`src/locales/${loc}.json`));
    sets.add(Object.keys(cat).filter(k => k.startsWith('page.restore.')).sort().join('|'));
    for (const key of required) assert.ok(Object.hasOwn(cat, key), `${loc} is missing ${key}`);
  }
  assert.equal(sets.size, 1, 'page.restore.* key sets stay identical across the five locales (same-commit doctrine)');
  assert.ok(pagesSrc.includes('page.restore.sourceStatCheck'), 'the stat keys are consumed by the page source');
});

/* =====================================================================
   95-05 (BKRST-05, D-02/D-03) — project-level target picker + Overwrite
   CTA + confirm phrase for project archives.
   ===================================================================== */
test('95-05: the drawer renders the project chip row from the scopes payload and arms the project target', () => {
  assert.match(pagesSrc, /data-a="restoreProjectPick"/, 'the second picker level is a keyed action');
  assert.match(pagesSrc, /page\.restore\.projectPickLabel/, 'the project picker label is keyed');
  assert.match(pagesSrc, /page\.restore\.projectPickHint/, 'the project picker hint is keyed');
  /* Payload-driven: the chips read S.ui.backupScopes[].projects (via
     scopeTargets), NOT the memberships fallback — no api.workspace option
     markup in the picker. */
  assert.match(pagesSrc, /scopeTargets\.find\(w => w\.id === S\.ui\.restoreTarget\)\?\.projects/, 'the chips read the scopes payload projects of the chosen workspace');
  const pickSlice = pagesSrc.slice(pagesSrc.indexOf('data-a="restoreProjectPick"') - 600, pagesSrc.indexOf('data-a="restoreProjectPick"') + 300);
  assert.ok(pickSlice.includes('S.ui.restoreTargetProject === p.id'), 'picking arms S.ui.restoreTargetProject');
  assert.ok(pickSlice.includes('esc(p.name)'), 'project names render through esc()');
  const ppDecl = pagesSrc.slice(pagesSrc.indexOf('const pickedWsProjects'), pagesSrc.indexOf('${projectPicker}'));
  assert.ok(ppDecl.includes('scopeTargets') && !ppDecl.includes('api.workspaces'), 'the project picker rides the scopes payload only — no memberships reference');
  /* Workspace switch invalidates the armed project (D-02 reset). */
  const pick = actionsSrc.slice(actionsSrc.indexOf('A.restoreTargetPick ='), actionsSrc.indexOf('A.restoreProjectPick ='));
  assert.ok(pick.includes('S.ui.restoreTargetProject = null'), 'switching the workspace target resets the armed project');
});

test('95-05: both CTAs for project archives; Overwrite is armed only when a target project is picked', () => {
  assert.match(pagesSrc, /kind === 'project' && flags\?\.canBackup && S\.ui\.restoreTarget && S\.ui\.restoreTargetProject/, 'the project Overwrite CTA gates on the payload flag + BOTH armed ids');
  assert.match(pagesSrc, /page\.restore\.overwriteCta/, 'the project Overwrite CTA copy is keyed');
  assert.match(pagesSrc, /btn-danger" data-a="restoreOverwrite" data-id="\$\{esc\(d\.runId\)\}">\$\{ic\('pencil', 14\)\}\$\{t\('page\.restore\.overwriteCta'\)\}/, 'the project Overwrite CTA is destructive-styled');
  /* Restore-as-new stays beside it (D-02 owner ruling). */
  assert.match(pagesSrc, /kind === 'workspace' \|\| kind === 'project'/, 'Restore-as-new renders for both scopes — both CTAs, never Overwrite-only');
});

test('95-05: the project overwrite wraps the POST in confirmDlg with the CURRENT target project name', () => {
  const proj = actionsSrc.slice(actionsSrc.indexOf('A.restoreOverwrite ='), actionsSrc.indexOf('const scopeId = S.ui.restorePreviewData?.data?.scope?.id;'));
  assert.ok(proj.includes("scope?.kind === 'project'"), 'the action branches on the project scope');
  assert.ok(proj.includes('confirmDlg('), 'the project overwrite opens the confirm idiom');
  assert.ok(proj.includes('typeName: targetProject.name'), 'typeName is the target project CURRENT name from the scopes payload (chrome — the server re-validates vs the live doc)');
  assert.ok(proj.includes('danger: true'), 'the confirm is danger-styled');
  assert.ok(proj.includes('page.restore.overwriteConfirmTitle'), 'the confirm title is keyed');
  /* (D-03) collision refusal rides the existing closed-map vocabulary. */
  assert.ok(proj.includes('restoreToast('), 'refusals surface via restoreToast (restoreNameCollision included)');
});

test('95-05: the overwrite payload carries targetId + targetProjectId + confirmName; success resets the armed project', () => {
  const proj = actionsSrc.slice(actionsSrc.indexOf('A.restoreOverwrite ='), actionsSrc.indexOf('const scopeId = S.ui.restorePreviewData?.data?.scope?.id;'));
  assert.ok(proj.includes('api.restoreOverwrite({ runId, targetId: wsId, targetProjectId: projId, confirmName: targetProject.name, source: restoreArmedSource(runId) })'), 'the POST mirrors the 95-04 route contract (105-01: + armed source, omitted when default)');
  assert.ok(proj.includes('S.ui.restoreTargetProject = null'), 'the accepted overwrite resets the armed project');
  assert.ok(proj.includes("'restoreTargetMissing'"), 'a trigger attempt without a target refuses client-side with the keyed message');
});

test('95-05: 5-locale parity for the project picker + overwrite keys', () => {
  const required = ['page.restore.projectPickLabel', 'page.restore.projectPickHint', 'page.restore.overwriteCta', 'page.restore.overwriteConfirmTitle'];
  const sets = new Set();
  for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
    const cat = JSON.parse(read(`src/locales/${loc}.json`));
    sets.add(Object.keys(cat).filter(k => k.startsWith('page.restore.')).sort().join('|'));
    for (const key of required) assert.ok(Object.hasOwn(cat, key), `${loc} is missing ${key}`);
  }
  assert.equal(sets.size, 1, 'page.restore.* key sets stay identical across the five locales');
  assert.ok(pagesSrc.includes('page.restore.overwriteCta') && actionsSrc.includes('page.restore.overwriteConfirmTitle'), 'the new keys are consumed by the source, not just declared');
});

/* =====================================================================
   Phase 108 (CARRY-02, plan 108-02): run attribution render — the
   restoreRunTr Trigger cell (previously a hardcoded '—') shows the
   operator's display name esc()d; legacy rows (created_by_name null)
   render '—' exactly as before. NEVER a raw uid. initiatorLabel lands
   ×5 in one commit (Pitfall 7 parity).
   ===================================================================== */
test('108-02: the Trigger cell renders esc(run.created_by_name) with the honest legacy-— fallback; no raw uid', () => {
  const cell = pagesSrc.slice(pagesSrc.indexOf('const restoreRunTr ='), pagesSrc.indexOf('const restoreRunTr =') + 2600);
  assert.match(cell, /run\.created_by_name \? esc\(String\(run\.created_by_name\)\) : '—'/, 'the Trigger cell renders the esc()d display name with the legacy dash fallback');
  assert.match(cell, /t\('page\.restore\.initiatorLabel'\)/, 'the cell consumes the initiatorLabel key (i18n-scan-visible)');
  /* The pinned 89-06 runTr slice assertions above stay literal — the
     additive ternary does not restructure the Run cell. */
  assert.match(cell, /run\.archive_name/, 'the Run cell still leads with the source archive filename');
  assert.match(pagesSrc, /esc\(run\.error\)/, 'the error render stays esc()d');
});

test('108-02: page.restore.initiatorLabel exists in all five locales (same-commit parity)', () => {
  const sets = new Set();
  for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
    const cat = JSON.parse(read(`src/locales/${loc}.json`));
    assert.ok(typeof cat['page.restore.initiatorLabel'] === 'string' && cat['page.restore.initiatorLabel'] !== '', `${loc} has a non-empty initiatorLabel`);
    sets.add(Object.keys(cat).filter(k => k.startsWith('page.restore.')).sort().join('|'));
  }
  assert.equal(sets.size, 1, 'page.restore.* key sets stay identical across the five locales');
});

test('consideration-matrix tally — all 18 explicit rows are pinned by at least one cell', () => {  /* The tally lives IN this file and reads its own test names, so an edit
     that drops a pinned cell (or a row's last assertion cell) fails here. */
  const self = read('test/restore-client.test.mjs');
  const titles = [...self.matchAll(/^test\('([^']+)'/gm)].map(m => m[1]);
  const rows = [
    ['empty | restore list', 'restore empty/loading/history states'],
    ['empty | restore history', 'restore empty/loading/history states'],
    ['empty | preview drawer + confirm modal', 'the preview drawer opens ONLY'],
    ['loading | restore list + history + preview', 'restore empty/loading/history states'],
    ['error | page load / 403', 'restore empty/loading/history states'],
    ['error | corrupt manifest', 'restore refusals ride the CLOSED toast map'],
    ['error | dual-location missing', 'the restore section renders payload fields'],
    ['error | refusals (lock, membership, throttle, authority)', 'restore refusals ride the CLOSED toast map'],
    ['pending | trigger accepted, first poll not landed', 'restore stages render verbatim'],
    ['active-run re-entry | mid-restore page load', 'the poll loop is ONE timer'],
    ['populated | restore list', 'the restore section renders payload fields'],
    ['populated | restore history', 'restore empty/loading/history states'],
    ['populated | preview drawer + confirm modal', 'the preview drawer opens ONLY'],
    ['partial | skipped-operational-tables report', 'restore empty/loading/history states'],
    ['partial | missing-blob files in preview', 'the preview drawer opens ONLY'],
    ['zero-one-many | restore list entries', 'restore empty/loading/history states'],
    ['zero-one-many | S3-located entries', 'the restore section renders payload fields'],
    ['zero-one-many | workspace picker options', 'project archives show the workspace picker'],
  ];
  assert.equal(rows.length, 18, 'the explicit-row count matches the UI-consideration probe');
  for (const [row, cell] of rows) {
    assert.ok(
      titles.some(tn => tn.startsWith(cell) || tn.includes(cell)),
      `the "${row}" row must stay pinned by a cell named "${cell}" — dropping it breaks the consideration matrix`,
    );
  }
});
