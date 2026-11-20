/* Phase 80 (GM-02/GM-03) — groups.js pure-unit suite. Imports groups.js
   directly: NO server boot, NO db. Task 1 tracer slice pins the four-outcome
   claim contract and the dual-schema mirror presence; Tasks 2-3 expand. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeGuid, guidRefusal, roleTokenRefusal, resolveGroupsClaim, resolve } from '../groups.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---- four-outcome claim contract (D-82-4) ----------------------------- */

test('fixture 1: _claim_names alone → unmapped/overage (never [])', () => {
  assert.deepEqual(resolveGroupsClaim({ _claim_names: { groups: 'src1' } }), {
    state: 'unmapped',
    reason: 'overage',
  });
});

test('fixture 2: _claim_names + _claim_sources (full overage pair) → unmapped/overage', () => {
  assert.deepEqual(
    resolveGroupsClaim({
      _claim_names: { groups: 'src1' },
      _claim_sources: { src1: { endpoint: 'https://graph.microsoft.com/v1.0/me/getMemberObjects' } },
    }),
    { state: 'unmapped', reason: 'overage' },
  );
});

test('fixture 3: missing groups claim → unmapped/missing (never [])', () => {
  assert.deepEqual(resolveGroupsClaim({ sub: 'abc' }), { state: 'unmapped', reason: 'missing' });
});

test('fixture 4: groups: [] → genuinely-empty groups (DISTINCT from unmapped)', () => {
  const out = resolveGroupsClaim({ groups: [] });
  assert.deepEqual(out, { state: 'groups', groups: [] });
  assert.notEqual(out.state, 'unmapped', 'empty must never collapse into unmapped');
});

test('hasgroups: true → unmapped/overage', () => {
  assert.deepEqual(resolveGroupsClaim({ hasgroups: true }), { state: 'unmapped', reason: 'overage' });
});

test('non-array groups (string) → unmapped/shape (fail-closed, A5)', () => {
  assert.deepEqual(resolveGroupsClaim({ groups: 'not-an-array' }), { state: 'unmapped', reason: 'shape' });
});

/* ---- GUID canonicalization (T-80-02) ---------------------------------- */

test('GUID paste variants collapse to one lowercase-hyphenated key', () => {
  const key = canonicalizeGuid('a1b2c3d4-e5f6-4789-9abc-def012345678');
  assert.equal(canonicalizeGuid('{A1B2C3D4-E5F6-4789-9ABC-DEF012345678}'), key, 'braced+uppercase');
  assert.equal(canonicalizeGuid('A1B2C3D4E5F647899ABCDEF012345678'), key, 'no-hyphen');
  assert.equal(canonicalizeGuid('  a1b2c3d4-e5f6-4789-9abc-def012345678  '), key, 'whitespace');
});

test('non-hex garbage refuses (empty canonical form, keyed refusal)', () => {
  for (const bad of ['', 'hello', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', '12345', null, undefined]) {
    assert.equal(canonicalizeGuid(bad), '', `garbage ${JSON.stringify(bad)} must canonicalize to ''`);
    assert.deepEqual(guidRefusal(bad), { code: 'groupMappingBadGuid', message: 'Group ID must be an Entra Object ID (GUID)' });
  }
});

/* ---- role token funnel (T-80-03) -------------------------------------- */

test('roleTokenRefusal: 3-token allow-list, strict lowercase, no aliases', () => {
  for (const ok of ['owner', 'admin', 'member']) {
    assert.equal(roleTokenRefusal(ok), null, `${ok} must pass`);
  }
  for (const bad of ['Owner', 'VIEWER', 'viewer', '', ' administrator', 'member ', null, undefined]) {
    assert.ok(roleTokenRefusal(bad), `${JSON.stringify(bad)} must refuse`);
  }
});

/* ---- dual-schema mirror presence (grep-level so the mirror can't rot) -- */

test('group_mappings DDL present in BOTH server.js SCHEMA and db-adapter.mjs SQLITE_SCHEMA', () => {
  for (const file of ['server.js', 'db-adapter.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(src, /create table if not exists group_mappings \(/, `${file} missing group_mappings table`);
    assert.match(src, /create unique index if not exists group_mappings_pair on group_mappings\(group_guid, workspace_id\)/, `${file} missing pair index`);
  }
});

test('group_mappings workspace reference does NOT cascade (D-82-6) and role CHECK keeps 3 tokens', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const table = src.match(/create table if not exists group_mappings \([\s\S]*?\);/)?.[0];
  assert.ok(table, 'group_mappings table not found');
  assert.doesNotMatch(table, /workspace_id[^,]*on delete cascade/, 'workspace reference must NOT cascade (D-82-6)');
  assert.match(table, /role\s+text not null check \(role in \('owner','admin','member'\)\)/, 'role CHECK must stay the locked 3-token set');
});

/* ---- D-82-1 highest-role-wins resolver (Task 2) ----------------------- */

const GUID_A = 'a1b2c3d4-e5f6-4789-9abc-def012345678';
const GUID_B = 'b2c3d4e5-f6a7-4789-9abc-def012345679';
const claimGroups = [GUID_A, GUID_B];

const row = (group_guid, workspace_id, role, kind) => ({ group_guid, workspace_id, role, ...(kind ? { kind } : {}) });

test('resolve: two mappings to one workspace with roles member+admin → single grant, role admin (D-82-1)', () => {
  const mappings = [row(GUID_A, 'ws1', 'member'), row(GUID_B, 'ws1', 'admin')];
  const out = resolve(claimGroups, mappings);
  assert.deepEqual(out.grants, [{ workspaceId: 'ws1', role: 'admin', groupGuid: GUID_B }]);
  assert.equal(out.operatorFlag, null);
});

test('resolve: member/admin/owner on one workspace → owner wins', () => {
  const mappings = [
    row(GUID_A, 'ws1', 'member'),
    row(GUID_B, 'ws1', 'admin'),
    row(GUID_A, 'ws1', 'owner'),
  ];
  assert.deepEqual(resolve(claimGroups, mappings).grants, [{ workspaceId: 'ws1', role: 'owner', groupGuid: GUID_A }]);
});

test('resolve: disjoint workspaces → one grant each', () => {
  const mappings = [row(GUID_A, 'ws1', 'member'), row(GUID_B, 'ws2', 'admin')];
  const out = resolve(claimGroups, mappings);
  assert.equal(out.grants.length, 2);
  assert.deepEqual(
    out.grants.sort((a, b) => a.workspaceId.localeCompare(b.workspaceId)),
    [
      { workspaceId: 'ws1', role: 'member', groupGuid: GUID_A },
      { workspaceId: 'ws2', role: 'admin', groupGuid: GUID_B },
    ],
  );
});

test('resolve: no matches → empty grants (NOT an unmapped outcome)', () => {
  const out = resolve(claimGroups, [row('c3d4e5f6-a7b8-4789-9abc-def01234567a', 'ws9', 'admin')]);
  assert.deepEqual(out, { grants: [], operatorFlag: null });
});

test('resolve: mapping to a GUID outside the claim produces no grant', () => {
  const out = resolve([GUID_A], [row(GUID_B, 'ws1', 'owner')]);
  assert.deepEqual(out.grants, []);
});

test('resolve: claim-side GUID variants canonicalize before matching', () => {
  const out = resolve([`{${GUID_A.toUpperCase()}}`], [row(GUID_A.toUpperCase(), 'ws1', 'member')]);
  assert.deepEqual(out.grants, [{ workspaceId: 'ws1', role: 'member', groupGuid: GUID_A }]);
});

test('resolve: operator mapping row matched → operatorFlag true; unmatched → null', () => {
  const operatorRow = row(GUID_A, 'operator-flag', 'member', 'operator');
  assert.equal(resolve(claimGroups, [operatorRow]).operatorFlag, true, 'matched operator row');
  assert.equal(
    resolve([GUID_B], [operatorRow]).operatorFlag,
    null,
    'operator row whose group is not claimed → null (no flag, never false)',
  );
});

test('resolve: operator rows never produce workspace grants', () => {
  const out = resolve(claimGroups, [row(GUID_A, 'operator-flag', 'member', 'operator')]);
  assert.deepEqual(out.grants, []);
});

test('resolve: never throws on any input', () => {
  for (const claim of [null, undefined, 'garbage', 42, {}, [null, 5, {}, 'zz-not-a-guid', GUID_A]]) {
    for (const mappings of [null, undefined, 'garbage', 42, [null, {}, { group_guid: 7 }, { group_guid: GUID_A, workspace_id: 'ws1', role: 'Owner' }, row(GUID_A, 'ws1', 'member')]]) {
      assert.doesNotThrow(() => resolve(claim, mappings), `resolve(${JSON.stringify(claim)}, ${JSON.stringify(mappings)}) threw`);
    }
  }
});

test('resolve: invalid mapping role tokens are skipped, valid ones still resolve', () => {
  const out = resolve(claimGroups, [row(GUID_A, 'ws1', 'viewer'), row(GUID_A, 'ws1', 'admin')]);
  assert.deepEqual(out.grants, [{ workspaceId: 'ws1', role: 'admin', groupGuid: GUID_A }]);
});
