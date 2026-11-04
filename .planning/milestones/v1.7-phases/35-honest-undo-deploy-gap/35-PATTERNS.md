# Phase 35: Honest Undo & Deploy Gap - Pattern Map

**Mapped:** 2026-11-03
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/actions/teams.js` (mod: `A.delTeam`) | controller (action) | event-driven (confirm → purge → toast) | `A.delTeam` itself + `A.submitTeam` in same file | exact (in-place modification) |
| `src/core/store.js` (possible mod: export flush/push primitive, planner's call) | service | event-driven (debounced persistence) | `save()` / `push()` / `flushNow()` in same file | exact (in-place) |
| `test/*.test.mjs` (undo pins — placement planner's call; natural home `test/membership.test.mjs`) | test | request-response (HTTP harness) | `test/membership.test.mjs:348-413` (PUT-teams test) | exact |
| `test/compose-config.test.mjs` (new, name at planner's discretion) | test | batch (process invocation) | `test/membership.test.mjs` (node:test shape); no compose-test precedent exists | partial |
| `docker-compose.yml` (mod: +1 env line) | config | transform (env interpolation) | its own `environment:` block (majority `:-` form) | exact (in-place) |
| `DEPLOY.md` (mod: §14 walkthrough) | documentation | — | its own §14 (extension, not new section) | exact (in-place) |

## Pattern Assignments

### `src/actions/teams.js` — `A.delTeam` modification (controller, event-driven)

**Analog:** `A.delTeam` itself (src/actions/teams.js:119-168) — the undo is this flow mirrored; plus `A.submitTeam` (lines 53-118) for the before-map + PUT-failure rollback idioms.

**Imports already present** (lines 1-12) — no import changes needed unless store.js export is added:
```js
import { D, S, mem, memberTeams, projInTeam, projTeams, team, teamsList } from '../core/store.js';
import { api } from '../core/api.js';
import { mutate, toast } from '../ui/toast.js';
import { A, IN, confirmDlg, restore, snapshot } from './actions.js';
```

**Before-map capture idiom** (line 70, from submitTeam — mirror this shape in delTeam, ABOVE the `api.enabled` block):
```js
const before = new Map(D().members.map(x => [x.id, memberTeams(x)]));
```
**Key-id pitfall (Pitfall 3):** this Map keys by doc member id (`x.id`); the PUT needs `x.userId`. Resolve `x.userId` at replay time from the post-restore doc (or key by `userId`) — one explicit comment either way.

**Current delTeam purge flow** (lines 130-165 — the undo reverses this exact sequence):
```js
run: async () => {
  const affected = D().members.filter(x => memberTeams(x).includes(tm.id));
  if (api.enabled) {
    const results = await Promise.all(
      affected.map(x =>
        api.setMemberTeams(
          x.userId,
          memberTeams(x).filter(id => id !== tm.id),
        ),
      ),
    );
    if (results.some(r => !r?.ok)) {
      toast(t('err.changeTeam'), { kind: 'err' });
      return;
    }
  }
  const snap = snapshot();
  if (mutate(() => { /* doc mutate: drop team, filter member/project team sets */ })) {
    if (S.ui.route === 'team') go('teams');
    toast(t('toast.deleted', { name: tm.name }), { action: t('toast.undo'), onAction: () => restore(snap) });
  }
},
```

**PUT-failure pattern (D-02)** (lines 145-148, delTeam) and the doc-rollback variant (lines 101-108, submitTeam — note this is the pattern NOT to use for undo; D-02 forbids compensating rollback):
```js
if (results.some(r => !r?.ok)) {
  toast(t('err.changeTeam'), { kind: 'err' });
  return;
}
```

**Toast undo affordance** (line 164 — exact shape the new onAction extends):
```js
toast(t('toast.deleted', { name: tm.name }), { action: t('toast.undo'), onAction: () => restore(snap) });
```
New shape: `onAction` becomes an async closure that (a) `restore(snap)` — always, local mode stops here (D-06); (b) if `api.enabled`: force/await doc push, then per affected member compute union and PUT; (c) on any `!r?.ok` → error toast, no rollback (D-02).

**Union PUT (the whole of UNDO-02)** — new code, riding the server contract (server.js:4286-4297: full-set delete+insert in one transaction, whitelist against doc teams at :4291-4292 → 400 `unknownTeam`):
```js
const union = Array.from(new Set([...memberTeams(x), tm.id]));
await api.setMemberTeams(x.userId, union);
```
Cap note: server rejects >25 teams (`tooManyTeams`); union of ≤25 + 1 can't exceed in the ~5s window — one comment, no guard (D-04: no server-side guard).

### `src/core/store.js` — possible doc-push primitive export (service, event-driven)

**Analog:** its own `save()`/`push()`/`flushNow()` (src/core/store.js:133-184). Read if the planner picks Pitfall-1 option 1 (export an awaitable flush); option 1b (explicit `api.putWorkspace(docSnapshot())`-shaped call in the handler) keeps this file untouched.

**Why sequencing matters — the double debounce** (lines 155-170):
```js
export function save() {
  changeSeq++;
  if (api.enabled && api.user && !S.ui.conflict) dirty = true;
  clearTimeout(_saveT);
  _saveT = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(docSnapshot())); } catch { }
    if (api.enabled && api.user && !S.ui.conflict) {
      clearTimeout(_pushT);
      _pushT = setTimeout(push, 450);      // ← doc PUT lands ~600ms after restore()
    }
  }, 150);
}
```

**Conflict guard the sequencing must respect** (lines 133-147):
```js
async function push() {
  if (!api.enabled || !api.user || S.ui.conflict) return;   // ← push skips on conflict (Pitfall 4)
  ...
  const res = await api.putWorkspace(docSnapshot());
  if (!res.ok) {
    if (res.status === 409 || res.status === 401 || res.status === 403) S.ui.conflict = true;
    notify({ status: res.status, error: res.error });
    return;
  }
}
```
**Existing flush precedent** (lines 174-184, page-hide only, fire-and-forget keepalive — not directly reusable as an awaitable, but its guard shape is):
```js
function flushNow() {
  if (flushing || pushing || !dirty || !api.enabled || !api.user || S.ui.conflict) return;
  ...
  api.putWorkspace(docSnapshot(), { keepalive: true }).then(...)
}
```
`docSnapshot()` is module-private (line 122-125); any explicit-push-in-handler option either exports a flush variant or calls `api.putWorkspace` with a hand-built payload — planner's call (Research Open Question 1, preference: explicit push in the handler, store.js surface untouched).

### `test/membership.test.mjs` — undo pins (test, request-response)

**Analog:** the Phase-28 PUT-teams test at lines 348-413 — the exact harness pattern, fixtures, and authority-row assertions the undo tests extend.

**Harness setup** (lines 8-11, 348-353):
```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, client, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';
...
test('PUT member teams writes authority rows, projects teams[] and gates on admin', async () => {
  const s = await startServer();
  try {
    const signedIn = await login(s.base, ADMIN.email, ADMIN.password);
    const boss = signedIn.client;
```

**Doc PUT (team definitions) precedes teams PUT** (lines 356-362) — this IS the Pitfall-1 sequencing contract, already tested server-side:
```js
const live = (await boss.get('/api/workspaces/acme')).data;
const doc = structuredClone(live.doc);
doc.data.teams = [
  { id: 'team_a', name: 'Alpha', members: [] },
  { id: 'team_b', name: 'Beta', members: [] },
];
assert.equal((await boss.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);
```

**Whitelist + admin gate precedents** (lines 375-378):
```js
assert.equal((await memberAccount.put(`/api/workspaces/acme/members/${target.userId}/teams`, { teams: ['team_a'] })).status, 403);
assert.equal((await boss.put(`/api/workspaces/acme/members/${target.userId}/teams`, { teams: ['team_nope'] })).status, 400);
```

**Authority-row (DB-level) assertion** (lines 390-398) — use for UNDO-01's "rows re-created" pin:
```js
withDb(s.dbPath, db => {
  assert.deepEqual(
    db.prepare('select team_id from team_members where workspace_id = ? and user_id = ? order by team_id').all(wsId, target.userId).map(r => r.team_id),
    ['team_a', 'team_b'],
  );
});
```
**Roster projection read** (lines 401-402) — use for the "rosters honest after undo" assertion.

**UNDO-02 no-clobber pin shape:** on a fresh server instance (line 348 comment: shared suite spends the invite throttle budget — each test needing accepts starts its own server), delete team → PUT member into a DIFFERENT team (the "newer change") → PUT the union set → assert withDb rows contain BOTH the new team and the restored team. Stale-before-map variant: PUT with only the captured set must NOT be the assertion target — the pin asserts the union client-side semantics via what the server accepts; keep the test at "union PUT keeps both rows".

**D-06 local-mode pin:** client-module test convention (per i18n-actions-modules.test.mjs style) or a harness-level note — placement is planner discretion (Research A2).

### `test/compose-config.test.mjs` — new (test, batch)

**Closest analog:** `test/membership.test.mjs` for node:test file shape (`import { test } from 'node:test'; assert/strict`). No compose/env-parsing test precedent exists — this is the only genuinely novel test file.

**Two-case shape per D-09 + Pitfall 2** (the three `:?` vars are ALWAYS provided; only MASTER_KEY_PREVIOUS varies):
```js
const base = { ADMIN_EMAIL: 'a@b.c', ADMIN_PASSWORD: 'x'.repeat(12), MASTER_KEY: 'k'.repeat(64) };
// case 1: parse docker-compose.yml → MASTER_KEY_PREVIOUS line uses `${MASTER_KEY_PREVIOUS:-` form
// case 2 (set + unset): spawn `docker compose config` with base env (+/- MASTER_KEY_PREVIOUS) → exit 0 both;
//        in the set case the rendered config's environment carries MASTER_KEY_PREVIOUS=<old>
// docker absent → test.skip('docker compose unavailable', ...) — explicit skip reason, never silently pass
```
Use `node:child_process` spawn/execFile with `process.env` injection; run from repo root so `docker-compose.yml` resolves.

### `docker-compose.yml` — env line insertion (config)

**Analog:** its own environment block. The majority convention is the optional `:-` form (every line but `MASTER_KEY` at :39 and the `PRJSTUDIO_HOST` labels).

**Insertion point** (line 39, add immediately after):
```yaml
      MASTER_KEY: ${MASTER_KEY:?set MASTER_KEY in .env (32+ random chars; encrypts TOTP secrets — losing it locks out 2FA)}
      MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}   # key rotation (DEPLOY.md §14)
```
Never `:?` (fresh installs must boot) — pinned by compose-config case 1.

### `DEPLOY.md` §14 — compose rotation walkthrough (documentation)

**Analog:** §14 itself (starts line 802). The walkthrough EXTENDS the existing runbook — reuse its idioms: `.env` at `/opt/projects/.env` mode 600, `openssl rand -hex 32` for generation, `set -a; source .env; set +a` for shell injection, key-id verification via SHA-256 first-8-hex (lines 830-850, including the `docker compose exec projects node -e` container idiom at :848-850), "never on the command line, never echoed" discipline (lines 817-820). The compose walkthrough: add `MASTER_KEY_PREVIOUS=<old>` to `.env` → `docker compose up -d` (reboot) → verify stamped ids (idom above) → remove the old key line → reboot. Plus the note: compose users need no extra step beyond setting the env var (D-08).

## Shared Patterns

### Toast-only undo affordance
**Source:** `src/actions/teams.js:164` (also all task/project undo call sites)
**Apply to:** the new delTeam onAction — same toast, same `t('toast.undo')` action key, no new UI, no persistent restore.
```js
toast(t('toast.deleted', { name: tm.name }), { action: t('toast.undo'), onAction: () => restore(snap) });
```

### Doc restore via JSON snapshot
**Source:** `src/actions/actions.js:268-275`
**Apply to:** undo handler step (a) — always runs, local mode stops here (D-06).
```js
export function snapshot() { return JSON.stringify(S.data); }
export function restore(snap) { S.data = JSON.parse(snap); save(); render(); }
```

### Membership write through the single authority path
**Source:** `src/core/api.js:394-401`
**Apply to:** undo replay PUTs — no other fetch, no new route. Deliberately no `adoptRevision` (membership never claims a doc revision).
```js
async setMemberTeams(userId, teams) {
  const slug = state.workspace?.slug;
  if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
  return call('PUT', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/teams`, { teams });
},
```

### PUT-failure = early return + error toast (no compensation)
**Source:** `src/actions/teams.js:145-148`
**Apply to:** undo PUT failures (D-02) — error toast only; doc stays restored; no rollback, no retry loop.
```js
if (results.some(r => !r?.ok)) {
  toast(t('err.changeTeam'), { kind: 'err' });
  return;
}
```

### Before-map Map capture
**Source:** `src/actions/teams.js:70`
**Apply to:** delTeam — capture ABOVE the `api.enabled` purge block (the fix's core).
```js
const before = new Map(D().members.map(x => [x.id, memberTeams(x)]));
```

### Server-harness test shape (admin-exercised)
**Source:** `test/membership.test.mjs:348-413`
**Apply to:** UNDO-01/02 tests — fresh `startServer()` per test needing invite accepts, admin client via `login`, doc PUT before teams PUTs, `withDb` row assertions, `finally { await s.stop(); }`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `test/compose-config.test.mjs` | test | batch | No compose/YAML/process-invocation test exists in test/; copy only the generic node:test file shape from membership.test.mjs; the spawn/env logic is new |
| Undo onAction itself | controller logic | event-driven | No existing undo replays authority PUTs — the mechanism is delTeam (teams.js:130-149) run in reverse; the doc-push sequencing (Pitfall 1) is a brand-new constraint with no existing caller |

## Metadata

**Analog search scope:** `src/actions/`, `src/core/`, `test/`, repo root (`docker-compose.yml`, `DEPLOY.md`)
**Files scanned:** 6 primary analogs (teams.js, store.js, api.js, actions.js, membership.test.mjs, docker-compose.yml, DEPLOY.md) + glob of test/*.test.mjs (67 files, no compose precedent)
**All named analog paths are git-tracked source** (core repo files, not mirrors).
**Pattern extraction date:** 2026-11-03
