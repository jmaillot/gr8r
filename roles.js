/* =====================================================================
   Instance roles core (Phase 85, BKROLE-01..03, D-09..D-13) — the ONE
   capability funnel behind every instance-role gate. Pure server-side
   module: NOT under src/ so Vite never bundles it (same rule as
   groups.js / oidc.js / totp.js / mailer.js); no process.env reads; DB
   access is injected by the caller (server.js hasInstanceRole passes the
   rows in — never imported here).

   D-10 vocabulary: four named capability constants. Callers NEVER see raw
   role slugs (D-09) — server.js wiring resolves DB rows through
   capabilitiesFor() and tests membership of a CAP constant.

   D-11 (one-way, roadmap SC5): this map IS the restore-authority ≠
   archive-read-authority encoding. ARCHIVE_READ is deliberately mapped to
   NO role in Phase 85 — reserved for the Phase 90 download-tiering
   decision. INSTANCE_ROLES_MANAGE never appears in the map at all — it is
   reachable ONLY through the Super-Admin short-circuit (D-12), so no role
   row can ever confer role administration. Pin tests
   (test/roles-core.test.mjs, D-35a) lock both properties.
   ===================================================================== */

/* D-10: the four capability constants. Values are stable string slugs —
   never reorder, never rename without widening every gate call site. */
export const CAP = Object.freeze({
  BACKUP_MANAGE: 'backup_manage', // create/edit/delete/run backup tasks (Phase 86/87)
  RESTORE_USE: 'restore_use', // browse/preview/restore (Phase 89)
  ARCHIVE_READ: 'archive_read', // download archives — DEFINED, granted to NO role (Phase 90)
  INSTANCE_ROLES_MANAGE: 'instance_roles_manage', // never in ROLE_CAPS — Super-Admin short-circuit only
});

/* Every capability capabilitiesFor can return. The D-12 short-circuit
   returns ALL of them for an instance admin — implicit membership (D-35b). */
export const ALL_CAPS = Object.freeze(Object.values(CAP));

/* D-11: role → capability map. ARCHIVE_READ deliberately absent;
   INSTANCE_ROLES_MANAGE deliberately absent. One-way per D-11 — adding an
   entry later is the Phase 90 design decision, never a side effect. */
export const ROLE_CAPS = Object.freeze({
  backup_operator: [CAP.BACKUP_MANAGE],
  restore_operator: [CAP.RESTORE_USE],
});

/* The role tokens the instance_roles CHECK enum admits (D-01). Kept in
   lock-step with ROLE_CAPS keys: every grantable role must resolve to at
   least one capability, or the row would be a silent no-op. */
const ROLE_TOKENS = new Set(Object.keys(ROLE_CAPS));

/* The house {code,message}|null refusal funnel (mirrors groups.js
   guidRefusal / roleTokenRefusal): null = valid, object = keyed generic
   refusal the route turns into fail(res, 400, code, message) →
   err.<code> in 5 locales. Strict lowercase allow-list, no aliases — a
   typo must refuse, never silently grant nothing (D-01 rationale). */
export function roleTokenRefusal(role, code = 'instanceRoleBadRole', message = 'Role must be backup_operator or restore_operator') {
  if (typeof role === 'string' && ROLE_TOKENS.has(role)) return null;
  return { code, message };
}

/* D-12: the capability resolver — the pure half of the hasInstanceRole
   funnel. An instance admin (first argument truthy) returns EVERY
   capability BEFORE any row consideration: no row state can ever demote a
   Super Admin, and a Super Admin with ZERO instance_roles rows holds
   everything (implicit membership, D-35b). Otherwise the union of the
   capabilities of the held roles; unknown/typo role slugs contribute
   nothing (fail-closed, never throws). */
export function capabilitiesFor(isInstanceAdmin, roles) {
  if (isInstanceAdmin) return [...ALL_CAPS];
  const out = new Set();
  const rows = Array.isArray(roles) ? roles : [];
  for (const role of rows) {
    const caps = ROLE_CAPS[role];
    if (Array.isArray(caps)) for (const cap of caps) out.add(cap);
  }
  return [...out];
}
