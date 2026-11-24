/* =====================================================================
   XWS-01 GREP GATE (plan 95-01 task 1) — byte-identity pin on the frozen
   membershipsOf helper (server.js) plus the Run-now picker's scopes-payload
   contract (D-11). Cross-workspace visibility is PICKERS-ONLY: the picker
   option list may widen for operators, but the switcher/navigation source
   (membershipsOf and its call sites) must stay byte-identical. Any drift in
   the pinned body, call-site set, or the /api/backup/scopes guard comment
   fails this gate BEFORE the change ships.

   Static-slice idiom (restore-client / team-pick-client precedent):
   readFileSync + exact-string/regex assertions, no DOM, no server boot.
   ===================================================================== */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = rel => readFileSync(`${ROOT}/${rel}`, 'utf8');

const serverSrc = () => src('server.js');
const backupSrc = () => src('src/pages/backup.js');

test('membershipsOf: the frozen function body is byte-pinned (declaration + query + super-access union)', () => {
  const s = serverSrc();
  /* Signature + the distinguishing internals — any rewrite of the
     membership query or the super-access union trips the gate. */
  assert.match(s, /async function membershipsOf\(userId\) \{/);
  assert.match(s, /from memberships m join workspaces w on w\.id = m\.workspace_id/);
  assert.match(s, /where m\.user_id = \? and w\.archived = 0/);
  assert.match(s, /order by w\.created_at, w\.name collate nocase/);
  assert.match(s, /const all = await db\.all\('select \* from workspaces order by created_at, name'\)/);
  assert.match(s, /if \(!user \|\| !user\.is_instance_admin \|\| !SUPER_ACCESS\) return rows;/);
  assert.match(s, /const byId = new Map\(rows\.map\(r => \[r\.id, r\]\)\);/);
  assert.match(s, /if \(!byId\.has\(w\.id\)\)/);
});

test('membershipsOf: the call-site set is byte-pinned — declaration + the frozen consumers, verbatim lines', () => {
  const lines = serverSrc().split('\n');
  const sites = lines.filter(l => l.includes('membershipsOf('));
  assert.deepEqual(
    sites.map(l => l.trim()),
    [
      'async function membershipsOf(userId) {',
      'workspaces: (await membershipsOf(user.id)).map(row => workspacePayload(row, row)),',
      /* 95-02 (SET-01): the My Access aggregate joins the set as a READ-ONLY
         caller — it enumerates the caller's own member workspaces and never
         widens the helper. The body pin above still proves the union intact. */
      'const rows = await membershipsOf(user.id);',
      'const adminWsIds = (await membershipsOf(user.id)).filter(m => ROLE_RANK[m.role] >= ROLE_RANK.admin).map(m => m.id);',
    ],
    'membershipsOf call sites drifted — cross-workspace visibility is pickers-only; switcher consumers are frozen (XWS-01)',
  );
});

test('the /api/backup/scopes handler keeps its separate-query guard comment and never routes through membershipsOf', () => {
  const s = serverSrc();
  const start = s.indexOf("Phase 92 (D-06): the operator-gated scope picker");
  const end = s.indexOf("'/api/backup/tasks'");
  assert.ok(start !== -1 && end > start, 'the scopes handler block moved — re-pin the gate');
  const handler = s.slice(start, end);
  assert.match(handler, /do NOT\s+route through workspacesForUser/, 'the D-06 guard comment must stand');
  assert.ok(!handler.includes('membershipsOf'), 'the scopes handler must keep its direct workspaces query (no membershipsOf routing)');
  assert.match(handler, /select id, name, slug from workspaces where archived = 0 order by name, id/);
});

test('the Run-now workspace picker renders from S.ui.backupScopes (D-11) with the loaded-workspace fallback only', () => {
  const p = backupSrc();
  assert.match(p, /runNowScopes = Array\.isArray\(S\.ui\.backupScopes\) && S\.ui\.backupScopes\.length/);
  assert.match(p, /data-in="backupScopeId"/, 'the staged-state input contract holds');
  assert.match(p, /refreshBackupScopes\(\)/, 'the page kicks the once-per-session scopes fill');
  /* No api.workspace option markup inside runNowCard — the loaded workspace
     appears ONLY as the fail-closed fallback entry, never as a pinned
     single-option select. */
  const card = p.slice(p.indexOf('const runNowCard'), p.indexOf('/* D-07 stage progress'));
  assert.ok(!card.includes('api.workspace?.id ?'), 'runNowCard still branches on api.workspace for its select');
});
