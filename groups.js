/* =====================================================================
   Group mapping core (Phase 80, GM-02/GM-03) — the ONE canonicalizing
   Entra-group claim machinery behind the group mapping doors. Pure
   server-side module: NOT under src/ so Vite never bundles it (same
   rule as oidc.js / totp.js / mailer.js); no process.env reads; DB
   access is injected by the caller (never imported here).

   Inert by design in Phase 80 — nothing in the login callback consumes
   resolveGroupsClaim()/resolve() until Phase 81 wires the callback; the
   contract below is fixed NOW so Phase 81 passes verdict.claims straight
   in without migration.

   The four-outcome contract (D-82-4, overage trap): an _claim_names
   overage pointer or a missing groups claim must NEVER resolve to an
   empty list — a naive `claims.groups ?? []` would read "user left all
   groups" in Phase 82's removal sync and strip every power user with
   >200 groups. Overage/missing resolve to { state: 'unmapped', reason };
   only a real array yields { state: 'groups', groups } — and `groups: []`
   is a DISTINCT outcome (genuinely no groups), never collapsed.
   ===================================================================== */

/* Canonical GUID shape: 8-4-4-4-12 hex, hyphenated, case-insensitive.
   Entra group Object IDs are GUID-shaped — and so is workspaces.id
   (crypto.randomUUID()), so shape alone never proves group-ness: the
   workspace legitimacy check is the caller's DB lookup, not this regex. */
const GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Canonicalize a pasted/claimed GUID to the ONE lowercase-hyphenated key the
   unique (group_guid, workspace_id) index matches on: trim, strip {}
   braces, lowercase. Paste variants ({braced}, uppercase, no-hyphen) all
   collapse to the same key so they can never create duplicate dead rows.
   Canonicalization shape mirrors domains.js canonicalizeDomain. Returns
   '' for non-GUID garbage (never throws). */
export const canonicalizeGuid = raw => {
  const s = String(raw ?? '')
    .trim()
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .toLowerCase();
  if (GUID_SHAPE.test(s)) return s;
  // No-hyphen variant: 32 hex chars — re-hyphenate if it matches.
  if (/^[0-9a-f]{32}$/.test(s)) {
    const hyphenated = `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    if (GUID_SHAPE.test(hyphenated)) return hyphenated;
  }
  return '';
};

/* The house {code,message}|null refusal funnel (mirrors domains.js
   emailDomainRefusal / validateGuestInviteShape): null = valid,
   object = keyed generic refusal the save API turns into
   fail(res, 400, code, message) → err.<code> in 5 locales. */

export function guidRefusal(raw, code = 'groupMappingBadGuid', message = 'Group ID must be an Entra Object ID (GUID)') {
  return canonicalizeGuid(raw) ? null : { code, message };
}

/* Role tokens: exactly the app's workspace role names — owner|admin|member,
   strict lowercase, no aliases (locked decision). Note the tension with
   memberships' 4-token CHECK (viewer): mappings deliberately narrow to 3 —
   a mapping to viewer must refuse at save. */
const ROLE_TOKENS = new Set(['owner', 'admin', 'member']);

export function roleTokenRefusal(role, code = 'groupMappingBadRole', message = 'Role must be owner, admin, or member') {
  if (typeof role === 'string' && ROLE_TOKENS.has(role)) return null;
  return { code, message };
}

/* Overage / claim-shape detection (T-80-01). Total over every claim object:
   the four documented shapes resolve to distinct outcomes and NO abnormal
   path ever produces a groups array — fail closed, never throws.

   - _claim_names present (alone or with _claim_sources)  → unmapped/overage
     (the full overage pair is { _claim_names: { groups: 'src1' } } +
     { _claim_sources: { src1: { endpoint } } }; the pointer alone is
     already evidence the claim list was truncated — act on nothing).
   - hasgroups: true (implicit-flow variant)              → unmapped/overage
   - groups claim absent entirely                         → unmapped/missing
   - groups not an array (string/number/object)           → unmapped/shape
     (A5: fail-closed default — a single-string groups claim is NOT
     tolerated into an array)
   - groups: []                                           → groups/[]
     (genuinely-empty — the ONLY shape that yields a list)
   - groups: [guid, ...]                                  → groups/[...] */
export function resolveGroupsClaim(claims) {
  if (claims && typeof claims === 'object') {
    if (claims._claim_names !== undefined && claims._claim_names !== null) {
      return { state: 'unmapped', reason: 'overage' };
    }
    if (claims.hasgroups === true) {
      return { state: 'unmapped', reason: 'overage' };
    }
    if (!('groups' in claims)) {
      return { state: 'unmapped', reason: 'missing' };
    }
    if (!Array.isArray(claims.groups)) {
      return { state: 'unmapped', reason: 'shape' };
    }
    return { state: 'groups', groups: claims.groups };
  }
  // null/undefined/non-object claims: evidence incomplete → unmapped/missing
  return { state: 'unmapped', reason: 'missing' };
}

/* D-82-1 highest-role-wins resolver over stored mappings. Inputs:
   claimGroups — the groups array from resolveGroupsClaim's 'groups' state;
   mappings — plain rows from the group_mappings table
   ({ group_guid, workspace_id, role, kind? }).

   Returns the Phase-81 contract shape: { grants, operatorFlag } where
   grants = [{ workspaceId, role, groupGuid }] — ONE grant per workspace
   carrying the winning role and the groupGuid that produced it — and
   operatorFlag = true when a dedicated operator mapping row (kind
   'operator') matched the claim, null otherwise (no operator mapping
   matched → no flag, never false — the tri-state the callback reads).

   Canonicalizes BOTH sides before comparison so paste variants and claim
   variants collapse to the same key. Never throws on any input: bad claim
   entries, bad mappings, wrong types all degrade to fewer grants. */
const ROLE_RANK = { owner: 3, admin: 2, member: 1 };

export function resolve(claimGroups, mappings) {
  const grants = [];
  const winners = new Map(); // workspaceId → { role, groupGuid } (highest role wins)
  let operatorFlag = null;

  const claimed = Array.isArray(claimGroups)
    ? claimGroups.map(canonicalizeGuid).filter(Boolean)
    : [];
  const claimedSet = new Set(claimed);
  const rows = Array.isArray(mappings) ? mappings : [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const guid = canonicalizeGuid(row.group_guid);
    if (!guid || !claimedSet.has(guid)) continue; // unknown claim GUID → no grant
    if (row.kind === 'operator') {
      operatorFlag = true; // dedicated operator mapping row matched
      continue;
    }
    const role = ROLE_RANK[row.role] ? row.role : null;
    if (!role || !row.workspace_id) continue;
    const workspaceId = String(row.workspace_id);
    const incumbent = winners.get(workspaceId);
    if (!incumbent || ROLE_RANK[role] > ROLE_RANK[incumbent.role]) {
      winners.set(workspaceId, { role, groupGuid: guid });
    }
  }

  for (const [workspaceId, win] of winners) {
    grants.push({ workspaceId, role: win.role, groupGuid: win.groupGuid });
  }
  return { grants, operatorFlag };
}
