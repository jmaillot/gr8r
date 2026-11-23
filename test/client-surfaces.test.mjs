/* Phase 51 (51-01, D-51-1..3 / VIS-01): the share-modal private toggle made
   real end-to-end. Pins the authority matrix for the toggle write path — the
   doc-sync PUT through mergeClientDoc — and the ONE client surface path the
   phase mandates: a non-admin project lead flips their project private and
   the change persists through the server merge. Cells assert the STORED doc
   after each PUT (never the echoed request):

     owner ✓ · admin ✓ · lead ✓ (non-admin, via p.lead) · member ✗ (pinned)

   Expectations are stated inline (never read from production code). Fixture:
   the shared visibility fixture — p_membershare is private with lead m_plain
   (a plain Member, NOT an admin): exactly the D-51-17 lead shape. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createVisibilityFixtureDb, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';

let dataDir;
let server;
const sessions = {}; // email → client

const storedDoc = () =>
  JSON.parse(
    withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(VIS_WS.id)).doc,
  );
const project = id => storedDoc().data.projects.find(p => p.id === id);

/* The one doc-sync cell helper: GET the current doc+revision as `email`,
   apply `mutate` to the doc copy, PUT it back. Returns the raw response. */
async function docPutAs(email, mutate) {
  const c = sessions[email];
  const get = await c.get(`/api/workspaces/${VIS_WS.slug}`);
  assert.equal(get.status, 200, `${email} reads the workspace doc`);
  const doc = JSON.parse(JSON.stringify(get.data.doc));
  mutate(doc);
  return c.put(`/api/workspaces/${VIS_WS.slug}`, { revision: get.data.revision, doc });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-client-surfaces-'));
  createVisibilityFixtureDb(dataDir);
  server = await startServer({ dataDir });
  for (const email of ['owner@visfix.local', 'admin@visfix.local', 'plain@visfix.local', 'team@visfix.local']) {
    const s = await login(server.base, email, VIS_PASSWORD);
    assert.equal(s.status, 200, `${email} signs in`);
    sessions[email] = s.client;
  }
});

after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('fixture shape: p_membershare is private with a plain-member lead (D-51-17 cell)', () => {
  const p = project('p_membershare');
  assert.equal(p.private, true);
  assert.equal(p.lead, 'm_plain');
  assert.equal(storedDoc().data.members.find(m => m.id === 'm_plain').role, 'Member');
});

test('owner flips their injected private project public through the doc PUT (stored doc reflects it)', async () => {
  /* Phase 49 posture: the doc-GET admin/owner door is access-list-gated, so
     the owner cell uses p_sealed — the private-empty project the owner is
     injected into on the SERVED copy (normalizeProjects). */
  const res = await docPutAs('owner@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_sealed').private = false;
  });
  assert.equal(res.status, 200);
  assert.equal(project('p_sealed').private, false, 'the owner write persists');
});

test('admin flips p_hidden public through the doc PUT (stored doc reflects it)', async () => {
  /* p_hidden is on the admin's access list — visible and writable. */
  const res = await docPutAs('admin@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_hidden').private = false;
  });
  assert.equal(res.status, 200);
  assert.equal(project('p_hidden').private, false, 'the admin write persists');
});

test('END-TO-END: the non-admin lead flips their project private via doc-sync — both directions persist', async () => {
  /* m_plain leads p_membershare but holds NO workspace rank — the exact path
     the share-modal toggle must ride (D-51-17; doc-sync, no admin route). */
  const res = await docPutAs('plain@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_membershare').private = false;
  });
  assert.equal(res.status, 200);
  assert.equal(project('p_membershare').private, false, 'the lead write persists (public)');

  const res2 = await docPutAs('plain@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_membershare').private = true;
  });
  assert.equal(res2.status, 200);
  const after = project('p_membershare');
  assert.equal(after.private, true, 'the lead write persists (private)');
  assert.ok(after.members.includes('m_plain'), 'the lead keeps their access-list entry');
});

test('member PUT cannot flip p.private — the server pins it (stored doc keeps prev)', async () => {
  /* m_team can see the public p_open but is not its manager (no lead, not
     listed): the privatize attempt must be pinned, not rejected (200, T-50-01
     family), and the STORED doc keeps public. */
  const res = await docPutAs('team@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_open').private = true;
  });
  assert.equal(res.status, 200, 'the doc PUT itself succeeds (fields are pinned, not rejected)');
  assert.equal(project('p_open').private, false, 'the member privatize attempt was pinned');
});

/* ---------------- Phase 51 (51-02): the share modal's Teams section ----------------
   D-51-5/6/7/8/9: the invite + unlink actions ride the SAME doc-sync path as the
   toggle — the non-admin lead links and unlinks a team on their own project and
   the stored doc reflects it (the client canManageProject gate mirrors the
   server-side manager gating pinned in visibility-team.test.mjs). */

test('END-TO-END: the non-admin lead links then unlinks a team via doc-sync (Teams section write path)', async () => {
  const res = await docPutAs('plain@visfix.local', doc => {
    const p = doc.data.projects.find(x => x.id === 'p_membershare');
    p.teams = Array.isArray(p.teams) ? p.teams : [];
    if (!p.teams.includes('engA')) p.teams.push('engA');
  });
  assert.equal(res.status, 200);
  assert.deepEqual(project('p_membershare').teams, ['engA'], 'the team link persisted');

  const res2 = await docPutAs('plain@visfix.local', doc => {
    const p = doc.data.projects.find(x => x.id === 'p_membershare');
    p.teams = (Array.isArray(p.teams) ? p.teams : []).filter(x => x !== 'engA');
  });
  assert.equal(res2.status, 200);
  assert.deepEqual(project('p_membershare').teams, [], 'the team unlink persisted');
});

/* ---------------- Phase 51 (51-02): D-51-4 honest not-found ---------------- */

test('END-TO-END: after an admin privatizes p_open, the member\'s served doc no longer carries it (the visibility epoch)', async () => {
  /* The admin flips p_open private through doc-sync; m_team (not a member of
     p_open, no team link) stops seeing it — the GET that drives the client's
     hydration no longer contains the project. That hydration IS the epoch
     trigger: applyDoc detects the disappearance and records the loss. */
  const res = await docPutAs('admin@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_open').private = true;
  });
  assert.equal(res.status, 200);
  const c = sessions['team@visfix.local'];
  const get = await c.get(`/api/workspaces/${VIS_WS.slug}`);
  assert.equal(get.status, 200);
  const ids = (get.data.doc.data.projects || []).map(p => p.id);
  assert.ok(!ids.includes('p_open'), 'the privatized project is redacted from the member\'s served doc');
});

test('D-51-4: applyDoc records the visibility epoch — vanished projects are detected, not crashed on or silently dropped', async () => {
  /* Unit cell: the client store module imports into node behind a minimal DOM
     shim (node --test runs each file in its own process, so the shim cannot
     leak into the other suites). Expectations are stated inline. */
  globalThis.window = { addEventListener() {}, dispatchEvent() {}, matchMedia: () => ({ matches: false }) };
  globalThis.document = {
    addEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    visibilityState: 'visible',
    documentElement: { style: { setProperty() {} } },
  };
  globalThis.CustomEvent = class {
    constructor(type, opts) {
      this.type = type;
      this.detail = opts?.detail;
    }
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const store = await import('../src/core/store.js');
  const fresh = () => ({
    data: {
      projects: [
        { id: 'p_keep', name: 'Keep', subtasks: [] },
        { id: 'p_vanish', name: 'Vanish', subtasks: [] },
      ],
      members: [{ id: 'm1', name: 'M', status: 'active' }],
      me: 'm1',
      ws: { name: 'W' },
      tasks: [{ id: 't1', project: 'p_vanish', title: 'orphan', subtasks: [], labels: [], files: [] }],
      notifs: [],
      projOrder: ['p_keep', 'p_vanish'],
      activity: [],
      comments: [],
      files: [],
      savedViews: [],
      recentSearches: [],
    },
    prefs: {},
    views: {},
  });
  Object.assign(store.S, fresh(), { ui: store.S.ui });
  store.S.ui.modals = [];
  assert.equal(store.proj('p_vanish')?.name, 'Vanish', 'the local doc carries the project before hydration');
  assert.ok(store.allTasks().some(t => t.id === 't1'), 'the task on the visible project is listed before the epoch');

  const ok = store.applyDoc({ data: { ...JSON.parse(JSON.stringify(store.S.data)), projects: [{ id: 'p_keep', name: 'Keep', subtasks: [] }], projOrder: ['p_keep'] }, prefs: {}, views: {} }, 5);
  assert.equal(ok, true);
  assert.ok(store.S.ui.lostProjects?.includes('p_vanish'), 'the vanished project id is recorded on S.ui.lostProjects');
  assert.equal(store.proj('p_vanish'), undefined, 'the project is gone from the local doc after hydration');
  assert.equal(store.allTasks().some(t => t.id === 't1'), false, 'allTasks filters the orphaned task through canSee(proj) — no raw exception path');

  const ok2 = store.applyDoc({ data: JSON.parse(JSON.stringify(store.S.data)), prefs: {}, views: {} }, 6);
  assert.equal(ok2, true);
  assert.equal(store.S.ui.lostProjects, null, 'a clean hydrate with no loss clears the epoch state');
});

/* =====================================================================
   86-02 BACKUP RUN SURFACE (D-07/D-09/D-23 render-only doctrine): static
   client-source assertions per the governance-client precedent (no DOM
   harness → source assertions). Pins: the Run now card renders the scope
   picker from payload-driven lists with esc() on every payload string;
   the stage markup comes ONLY from the polled payload (never derived
   client-side); the poll loop stops on done|failed; refusals surface as
   keyed toasts through call(); no download action exists (Phase 90);
   the new page vocabulary ships with 5-locale parity (D-12).
   ===================================================================== */
import { readFileSync as readFileSync86 } from 'node:fs';
import { fileURLToPath as fileURLToPath86 } from 'node:url';
import { test as test86 } from 'node:test';
import nl86 from '../src/locales/nl.json' with { type: 'json' };
import de86 from '../src/locales/de.json' with { type: 'json' };
import es86 from '../src/locales/es.json' with { type: 'json' };
import en86 from '../src/locales/en.json' with { type: 'json' };
import fr86 from '../src/locales/fr.json' with { type: 'json' };

const ROOT86 = fileURLToPath86(new URL('..', import.meta.url));
const src86 = rel => readFileSync86(`${ROOT86}/${rel}`, 'utf8');

test86('the Run now card renders the scope picker from payload-driven lists with esc() on every payload string (D-09/T-79-10)', () => {
  const p = src86('src/pages/backup.js');
  assert.match(p, /data-in="backupScopeKind"/, 'the scope kind select is missing');
  assert.match(p, /data-in="backupScopeId"/, 'the scope id select is missing');
  /* the project list rides the doc payload, never local assumptions */
  assert.match(p, /S\.data\?\.projects/, 'the project picker does not read the payload-driven project list');
  assert.match(p, /api\.workspace\?\.id/, 'the workspace scope does not read the loaded api.workspace payload');
  const card = p.match(/const runNowCard = \w+ => \{[\s\S]*?\n\};/);
  assert.ok(card, 'runNowCard not found');
  assert.match(card[0], /esc\(p\.id\)/, 'the project option id is not esc()d');
  assert.match(card[0], /esc\(p\.name \|\| p\.id\)/, 'the project option name is not esc()d');
  assert.match(card[0], /esc\(api\.workspace\.name \|\| api\.workspace\.id\)/, 'the workspace option is not esc()d');
});

test86('the stage markup renders verbatim from the polled payload — no client-side stage derivation (85 D-23)', () => {
  const p = src86('src/pages/backup.js');
  const prog = p.match(/const runProgress = \(\) => \{[\s\S]*?\n\};/);
  assert.ok(prog, 'runProgress not found');
  assert.match(prog[0], /esc\(run\.stage\)/, 'the stage is not rendered verbatim through esc()');
  /* the page never hardcodes BACKUP stage names — the payload is the only
     source. 89-06: the RESTORE stage names appear ONLY as RESTORE_STAGE_KEYS
     lookup keys (the render is t(map[payload.stage]), never a client-side
     branch on a stage literal) — so the file-level ban keeps its intent by
     targeting derivation branches, not the keyed map. */
  assert.doesNotMatch(prog[0], /collecting|archiving|verifying/, 'a hardcoded backup stage name leaked into runProgress');
  assert.doesNotMatch(p, /===\s*'(?:collecting|archiving|verifying|fetching|validating|restoring)'/, 'a stage-literal branch leaked into the page — stage rendering is a keyed map lookup');
  /* on done the archive filename + sha256 render as text; no download action */
  assert.match(prog[0], /esc\(run\.filename \|\| ''\)/, 'the archive filename is not esc()d');
  assert.match(prog[0], /esc\(run\.sha256 \|\| ''\)/, 'the sha256 is not esc()d');
  assert.doesNotMatch(p, /data-a="backupDownload"/, 'a download action leaked into the page (Phase 90 prohibition)');
});

test86('the poll loop rides the seq + AbortController anti-stale pattern and stops on done|failed (D-07)', () => {
  const a = src86('src/actions/actions.js');
  assert.match(a, /let backupPollSeq = 0;/, 'the poll seq is missing');
  assert.match(a, /backupPollInflight\?\.abort\(\);/, 'the in-flight abort is missing');
  /* 89-06: the ONE tick fetches BOTH currents through the hoisted signal —
     the restore half rides the same AbortController as the backup half. */
  assert.match(a, /const signal = backupPollInflight\.signal;/, 'the poll does not hoist the abort signal');
  assert.match(a, /api\.backupRunCurrent\(\{ signal \}\)/, 'the poll does not ride the abort signal');
  assert.match(a, /clearInterval\(backupPollTimer\)/, 'the interval stop is missing');
  /* the trigger goes through api.backupRun (call()) and toasts keyed refusals.
     UAT fix 2026-11-22: the wire scope is normalized first (instance omits the
     id, workspace falls back to api.workspace) — the call itself keeps the
     frozen shape with the normalized object. */
  assert.match(a, /api\.backupRun\(wire\)/, 'the trigger does not ride api.backupRun');
  assert.match(a, /tErr\(code, null, res\.error \|\| t\('err\.serverUnreachable'\)\), \{ kind: 'err' \}/, 'the keyed refusal toast pipeline moved');
  /* the trigger never derives authority client-side — no canBackup pre-gate before the call */
  const runNow = a.match(/A\.backupRunNow = async \(\) => \{[\s\S]*?\n\};/);
  assert.ok(runNow, 'A.backupRunNow not found');
  assert.doesNotMatch(runNow[0], /canBackup/, 'the trigger pre-gates authority client-side (render-only violation — the server is the authority)');
});

test86('the run api methods keep the frozen call() shapes (D-16)', () => {
  const api = src86('src/core/api.js');
  assert.match(api, /async backupRun\(scope, \{ signal \} = \{\}\) \{\s*return call\('POST', '\/api\/backup\/runs', \{ scope \}, \{ signal \}\);/, 'backupRun drifted off the frozen shape');
  assert.match(api, /async backupRunCurrent\(\{ signal \} = \{\}\) \{\s*return call\('GET', '\/api\/backup\/runs\/current', undefined, \{ signal \}\);/, 'backupRunCurrent drifted off the frozen shape');
});

test86('the run-surface vocabulary ships with parity across all 5 catalogues (D-12)', () => {
  const KEYS = [
    'page.backup.runNowTitle',
    'page.backup.runNowLead',
    'page.backup.scopeLabel',
    'page.backup.scopeInstance',
    'page.backup.scopeWorkspace',
    'page.backup.scopeProject',
    'page.backup.projectLabel',
    'page.backup.workspaceLabel',
    'page.backup.runAction',
    'page.backup.stageLabel',
    'page.backup.archiveLabel',
    'page.backup.pending',
    'page.backup.runFailed',
    'err.backupRunInProgress',
    'err.scopeNotFound',
  ];
  for (const [lang, cat] of Object.entries({ en: en86, fr: fr86, nl: nl86, de: de86, es: es86 })) {
    for (const k of KEYS) assert.ok(cat[k], `${lang} catalogue lost ${k}`);
  }
});

