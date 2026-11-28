/* =====================================================================
   Phase 108 plan 02 (CARRY-02 + CARRY-03 + CARRY-04): restore run
   attribution & closeout.

   CARRY-02 capture chain (static-source asserts, mirror of the D-89-14
   style — the trigger routes / writer / runs GET are server-internal
   seams whose wire behavior is pinned by their route suites; here we pin
   the WIRING exactly):
   - one engine-agnostic adapterEnsureColumn('restore_runs','created_by')
     adjacent to the archive_name precedent — NO schema-block edit, NO
     PG_EPOCH_COLUMNS entry (a text uid is NOT an epoch-ms integer);
   - exactly THREE start-event emit sites carry createdBy: user.id
     (import_new / instance / overwrite) — the event-payload route, not
     post-insert stamping;
   - writeRestoreRunRow's 'start' insert names created_by (write-once:
     only the start branch changes, update/fail/finish untouched);
   - the runs GET selects created_by AND u.name as created_by_name via a
     left join on users (server-side name resolution — no raw uid shipped
     for display).

   CARRY-03: the SSO callback outer catch logs ONE fixed non-interpolated
   line (no e.message — exception text can carry token fragments; this
   log site is not on the 97-scrub path) and the catch stays unbound.

   CARRY-04: the DEPLOY.md symptom table carries the email-optional-claim
   row verbatim.

   Zero new dependencies. No backfill: legacy rows read NULL → '—'
   client-side (restore-client pins the render).
   ===================================================================== */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const serverSrc = () => readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('CARRY-02: created_by is ensured via adapterEnsureColumn — additive DDL only', () => {
  const s = serverSrc();
  assert.match(s, /await adapterEnsureColumn\('restore_runs', 'created_by', 'text'\);/, 'the ensureColumn line exists at the archive_name precedent site');
  /* The archive_name precedent is adjacent (same engine-agnostic block) */
  const idx = s.indexOf("await adapterEnsureColumn('restore_runs', 'archive_name', 'text')");
  const nearby = s.slice(idx, idx + 600);
  assert.ok(nearby.includes("adapterEnsureColumn('restore_runs', 'created_by'"), 'created_by lands adjacent to the archive_name precedent');
  /* Pitfall 5: the schema block and the epoch registry are BOTH wrong registries */
  assert.ok(!/PG_EPOCH_COLUMNS[^\n]*created_by/.test(s), 'the epoch registry is NOT polluted (text uid, not epoch-ms)');
  const schemaBlock = s.slice(s.indexOf('create table if not exists restore_runs'), s.indexOf('create table if not exists restore_runs') + 1200);
  assert.ok(!schemaBlock.includes('created_by'), 'the restore_runs create-table block is untouched (comment-splitting hazard)');
});

test('CARRY-02: exactly THREE start-event emit sites carry createdBy: user.id', () => {
  const s = serverSrc();
  const sites = [...s.matchAll(/emitRestoreRunEvent\(\{ kind: 'start'/g)].map(m => m.index);
  assert.equal(sites.length, 3, `exactly three start-event emit sites exist (found ${sites.length})`);
  const withCreatedBy = sites.map(i => s.slice(i, i + 400)).filter(chunk => /createdBy: user\.id/.test(chunk));
  assert.equal(withCreatedBy.length, 3, 'all three emit sites stamp createdBy: user.id (event-payload route)');
  /* Each trigger is covered — import_new / instance / overwrite */
  for (const trigger of ['import_new', 'instance', 'overwrite']) {
    const hit = sites.map(i => s.slice(i, i + 400)).find(chunk => chunk.includes(`trigger: '${trigger}'`));
    assert.ok(hit, `the ${trigger} emit site exists`);
    assert.match(hit, /createdBy: user\.id/, `the ${trigger} start event carries createdBy`);
  }
  /* The restore/upload route emits NO start event — untouched */
  assert.ok(!s.includes("kind: 'start', runId: uploadRunId"), 'the upload route emits no restore start event');
});

test('CARRY-02: writeRestoreRunRow start-insert names created_by (write-once)', () => {
  const s = serverSrc();
  const writerStart = s.indexOf('const writeRestoreRunRow =');
  const writer = s.slice(writerStart, s.indexOf('setRestoreRunWriter(', writerStart));
  assert.match(writer, /insert into restore_runs \(id, scope, trigger, status, stage, archive_name, created_by, started_at, created_at\) values \(\?,\?,\?,\?,\?,\?,\?,\?,\?\)/, 'the start insert names created_by in the explicit column list');
  assert.match(writer, /typeof event\.createdBy === 'string' \? event\.createdBy : null/, 'createdBy binds conditionally (string or null — legacy/missing never a non-string)');
  /* The other branches stay untouched: created_by is write-once at start */
  assert.ok(!writer.includes('created_by ='), 'no update branch writes created_by (write-once discipline)');
});

test('CARRY-02: the runs GET resolves the display name server-side via left join users', () => {
  const s = serverSrc();
  const runsGet = s.slice(s.indexOf("'/api/backup/restore/runs' && method === 'GET'"));
  const slice = runsGet.slice(0, runsGet.indexOf('return json'));
  assert.match(slice, /from restore_runs r\s+left join users u on u\.id = r\.created_by/, 'the runs GET left-joins users on created_by');
  assert.match(slice, /r\.created_by/, 'the select names r.created_by');
  assert.match(slice, /u\.name as created_by_name/, 'the select aliases u.name as created_by_name (server-side resolution — no raw uid shipped for display)');
});

test('CARRY-03: the SSO callback outer catch logs ONE fixed non-interpolated line', () => {
  const s = serverSrc();
  /* The locked CARRIED-ITEMS wording, verbatim, exactly once */
  const hits = [...s.matchAll(/logWarn\('sso callback: token exchange or verification failed; redirecting to generic error'\)/g)];
  assert.equal(hits.length, 1, `the fixed logWarn appears exactly once (found ${hits.length})`);
  /* It sits in the callback outer catch, BEFORE the errorRedirect return */
  const ctx = s.slice(hits[0].index - 200, hits[0].index + 200);
  assert.ok(ctx.includes('return errorRedirect()'), 'the fixed line sits in the generic-error catch');
  /* The catch stays unbound — NO e.message on this un-scrubbed log site */
  const catchStart = s.lastIndexOf('catch {', hits[0].index);
  assert.ok(catchStart > 0, 'the enclosing catch binds no error variable');
  const catchBody = s.slice(catchStart, hits[0].index);
  assert.ok(!/catch \(\w+\)/.test(catchBody.slice(catchBody.length - 20)), 'no error binding (Pitfall 7: nothing rides exception text)');
});

test('CARRY-04: the DEPLOY.md symptom table carries the email-optional-claim row', () => {
  const s = readFileSync(new URL('../docs/DEPLOY.md', import.meta.url), 'utf8');
  for (const fragment of [
    'One user fails sign-in where another succeeds',
    'Azure AD omits the optional `email` claim',
    'Add optional claim → `email`',
  ]) {
    assert.ok(s.includes(fragment), `the symptom row contains: ${fragment}`);
  }
});
