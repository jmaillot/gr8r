/* =====================================================================
   Phase 85 (BKROLE-01..03) — roles.js pure-unit suite. Imports roles.js
   directly: NO server boot, NO db. Pins the D-35 encoding:
   (a) restore_operator resolves to RESTORE_USE and NEVER ARCHIVE_READ;
       no ROLE_CAPS entry leaks ARCHIVE_READ; INSTANCE_ROLES_MANAGE appears
       in no map entry (D-35a — one-way per D-11);
   (b) capabilitiesFor(true, []) returns every CAP (D-35b — implicit
       Super-Admin membership with zero rows);
   (c) roleTokenRefusal pure cases (valid tokens, invalid/typo slugs
       refused).
   Template: test/groups-core.test.mjs.
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAP, ALL_CAPS, ROLE_CAPS, capabilitiesFor, roleTokenRefusal } from '../roles.js';

/* ---- D-35a: the restore-authority ≠ archive-read-authority encoding ---- */

test('restore_operator resolves to RESTORE_USE and NEVER ARCHIVE_READ (D-35a)', () => {
  assert.deepEqual(capabilitiesFor(false, ['restore_operator']), [CAP.RESTORE_USE]);
  assert.equal(capabilitiesFor(false, ['restore_operator']).includes(CAP.ARCHIVE_READ), false);
});

test('backup_operator resolves to BACKUP_MANAGE only (D-11)', () => {
  assert.deepEqual(capabilitiesFor(false, ['backup_operator']), [CAP.BACKUP_MANAGE]);
});

test('a user holding BOTH roles gets exactly the union — no extra capability', () => {
  const caps = capabilitiesFor(false, ['backup_operator', 'restore_operator']);
  caps.sort();
  assert.deepEqual(caps, [CAP.BACKUP_MANAGE, CAP.RESTORE_USE]);
  assert.equal(caps.includes(CAP.ARCHIVE_READ), false);
});

test('no ROLE_CAPS entry leaks ARCHIVE_READ in Phase 85 (SC5: reserved for Phase 90)', () => {
  for (const [role, caps] of Object.entries(ROLE_CAPS)) {
    assert.equal(
      caps.includes(CAP.ARCHIVE_READ),
      false,
      `role ${role} must NOT grant ARCHIVE_READ — granting it later is the Phase 90 design decision (D-11, one-way)`,
    );
  }
  assert.equal(Object.values(CAP).includes(CAP.ARCHIVE_READ), true, 'ARCHIVE_READ must stay DEFINED (reserved vocabulary)');
});

test('INSTANCE_ROLES_MANAGE appears in NO map entry — Super-Admin short-circuit only (D-10/D-35a)', () => {
  for (const [role, caps] of Object.entries(ROLE_CAPS)) {
    assert.equal(caps.includes(CAP.INSTANCE_ROLES_MANAGE), false, `role ${role} must never confer role administration`);
  }
});

test('no role — not even both — ever yields INSTANCE_ROLES_MANAGE or ARCHIVE_READ', () => {
  for (const role of [null, undefined, [], 'backup_operator', 'restore_operator', ['backup_operator', 'restore_operator'], 'garbage-role']) {
    const caps = capabilitiesFor(false, role);
    assert.equal(caps.includes(CAP.INSTANCE_ROLES_MANAGE), false, 'rows can never confer role administration');
    assert.equal(caps.includes(CAP.ARCHIVE_READ), false, 'rows can never confer archive read');
  }
});

/* ---- D-35b: implicit Super-Admin membership ---- */

test('capabilitiesFor(true, []) returns EVERY capability — implicit membership with zero rows (D-12/D-35b)', () => {
  const caps = capabilitiesFor(true, []);
  caps.sort();
  const expected = [...Object.values(CAP)].sort();
  assert.deepEqual(caps, expected, 'a Super Admin with ZERO instance_roles rows holds every capability');
  assert.equal(caps.includes(CAP.INSTANCE_ROLES_MANAGE), true, 'the short-circuit is the ONLY source of INSTANCE_ROLES_MANAGE');
});

test('the short-circuit wins regardless of any row state — no demotion (D-12)', () => {
  for (const roles of [[], ['garbage'], ['backup_operator']]) {
    const caps = capabilitiesFor(true, roles);
    assert.deepEqual([...caps].sort(), [...Object.values(CAP)].sort());
  }
});

test('non-admin with garbage/missing roles degrades to NO capabilities (fail-closed, never throws)', () => {
  for (const roles of [null, undefined, 'garbage', 42, [null, 5, {}, 'zz-not-a-role', 'backup_operator']]) {
    assert.doesNotThrow(() => capabilitiesFor(false, roles), `capabilitiesFor(false, ${JSON.stringify(roles)}) threw`);
  }
  assert.deepEqual(capabilitiesFor(false, null), []);
  assert.deepEqual(capabilitiesFor(false, [null, 'zz-not-a-role', 'backup_operator']), [CAP.BACKUP_MANAGE], 'valid entries still resolve beside garbage');
});

test('ALL_CAPS matches the CAP constant set exactly', () => {
  assert.deepEqual([...ALL_CAPS].sort(), [...Object.values(CAP)].sort());
});

/* ---- role token funnel (D-01) ---- */

test('roleTokenRefusal: 2-token allow-list, strict lowercase, no aliases', () => {
  for (const ok of ['backup_operator', 'restore_operator']) {
    assert.equal(roleTokenRefusal(ok), null, `${ok} must pass`);
  }
  for (const bad of ['Backup_Operator', 'RESTORE_OPERATOR', 'owner', 'admin', 'viewer', '', ' backup_operator', 'backup_operator ', null, undefined]) {
    assert.ok(roleTokenRefusal(bad), `${JSON.stringify(bad)} must refuse`);
    assert.equal(roleTokenRefusal(bad).code, 'instanceRoleBadRole');
    assert.ok(roleTokenRefusal(bad).message.length > 0);
  }
});
