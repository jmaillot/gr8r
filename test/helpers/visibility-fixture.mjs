/* Phase 49 (49-01, T-49-01): the 13-cell actor × project visibility matrix as a
   raw SQLite fixture, plus the INDEPENDENT visibility oracle.

   ANTI-TAUTOLOGY CONTRACT: VISIBILITY_MODEL and MIRROR_MODEL below are
   hand-derived from the model tables in
   .planning/phases/49-visibility-model-collapse-grant-materialization/49-RESEARCH.md
   (§Fixtures), corrected by a one-time empirical probe of the OLD-model server
   (2026-11-07, recorded in the comments on each row). They NEVER call
   memberCanReadProject (server.js) or canReadProject (mcp.js); consumers must
   not derive expectations from production code either.

   Probe correction (2026-11-07): the RESEARCH model-table row "admin / owner —
   ROLE_RANK bypass — visible, untouched" is wrong for the doc-GET surface.
   hiddenFor's admin/owner path is hiddenProjectIds (server.js:894), which is
   canSeeProject ONLY: private projects are access-list-gated for EVERYONE, and
   a private project with an empty access list is served to the document owner
   alone (normalizeProjects injects ownerId into the served copy, server.js:929-936).
   The ROLE_RANK bypass at server.js:882 only skips the scope/team funnel — it
   does not open the access list. The mcp.js mirror (canReadProject :182) DOES
   grant admins/owners everything, which is the pre-existing mirror drift the
   parity harness documents rather than hides. */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { legacyScryptHash } from './legacy-fixture.mjs';

export const VIS_PASSWORD = 'visibility-password-1';
export const VIS_WS = Object.freeze({ id: 'ws_visfix', slug: 'visfix' });
export const VIS_INVITE_TOKEN = 'visfix-invite-token-1234567890';
export const VIS_CREATED_AT = 1_700_000_000_000;

/* Deterministic actor and project ids (plan-mandated). */
export const VIS_ACTORS = Object.freeze(['m_admin', 'm_owner', 'm_plain', 'm_team', 'm_scoped', 'm_guest', 'm_doconly']);
export const VIS_PROJECTS = Object.freeze([
  'p_membershare',
  'p_hidden',
  'p_teamshare',
  'p_scopeproj',
  'p_scopeteam',
  'p_scopeddeny',
  'p_publicgain',
  'p_sealed',
  'p_legacy',
  'p_open',
]);

/* The scope JSON columns (Phase 29) carried by the fixture, in the same shape
   the scope route stores: { teams: [], projects: [] }. */
export const VIS_SCOPED_SCOPE = Object.freeze({ projects: ['p_scopeproj'], teams: ['scopedTeam'] });
export const VIS_GUEST_SCOPE = Object.freeze({ projects: ['p_membershare'], teams: [] });

const USERS = Object.freeze({
  m_admin: { userId: 'u_admin', email: 'admin@visfix.local', name: 'Andy Admin', role: 'admin', roleLabel: 'Admin' },
  m_owner: { userId: 'u_owner', email: 'owner@visfix.local', name: 'Olive Owner', role: 'owner', roleLabel: 'Owner' },
  m_plain: { userId: 'u_plain', email: 'plain@visfix.local', name: 'Pat Plain', role: 'member', roleLabel: 'Member' },
  m_team: { userId: 'u_team', email: 'team@visfix.local', name: 'Tessa Team', role: 'member', roleLabel: 'Member' },
  m_scoped: { userId: 'u_scoped', email: 'scoped@visfix.local', name: 'Sam Scoped', role: 'member', roleLabel: 'Member' },
  m_guest: { userId: 'u_guest', email: 'guest@visfix.local', name: 'Gus Guest', role: 'viewer', roleLabel: 'Guest' },
  /* m_doconly is the doc-only profile: a document member entry with NO userId
     and NO memberships row, but WITH a team_members row (engA). Old-model read
     doors resolve the actor through memberships (server.js:884-887), so this
     member could never read the workspace at all — the Phase 49 expansion must
     skip them and lose nothing (RESEARCH §Fixtures row 4). */
  m_doconly: { userId: 'u_doconly', email: 'doconly@visfix.local', name: 'Dee DocOnly', role: 'member', roleLabel: 'Member' },
});

const profile = (id, extra = {}) => {
  const u = USERS[id];
  return {
    id,
    /* The doc-only profile carries no userId — that is the cell under test. */
    ...(u === USERS.m_doconly ? {} : { userId: u.userId }),
    name: u.name,
    email: u.email,
    role: u.roleLabel,
    teams: [],
    title: '',
    c: '#5A67D8',
    status: 'active',
    last: 0,
    tz: '',
    ...extra,
  };
};

/* The stored workspace document. `access: 'private'` (no boolean) on p_legacy
   is the legacy fallback cell (server.js:754); p_sealed is the sealed cell
   (RESEARCH §Fixtures row 11: normalizeProjects must not un-seal, D-49-8). */
export function visfixDoc() {
  return {
    data: {
      plan: 'Team',
      ws: { name: 'Visibility Fix', url: VIS_WS.slug, c: '#1D1C1A', brand: true },
      me: null,
      members: VIS_ACTORS.map(id => profile(id)),
      teams: [
        { id: 'engA', name: 'Eng A', c: '#0EA5E9' },
        { id: 'scopedTeam', name: 'Scoped Team', c: '#8B5CF6' },
      ],
      projects: [
        /* Plain member on the access list of a private project. */
        { id: 'p_membershare', key: 'membershare', name: 'Member Share', private: true, members: ['m_plain'], lead: 'm_plain', teams: [], status: 'active', perms: {} },
        /* Plain member NOT on the access list (hidden cell). */
        { id: 'p_hidden', key: 'hidden', name: 'Hidden From Plain', private: true, members: ['m_admin'], lead: 'm_admin', teams: [], status: 'active', perms: {} },
        /* Team-derived cell (Phase 32): to be materialized by the Plan 02 sweep. */
        { id: 'p_teamshare', key: 'teamshare', name: 'Team Share', private: true, members: ['m_admin'], lead: 'm_admin', teams: ['engA'], status: 'active', perms: {} },
        /* Scope.projects grant cell (D-03 inversion) — private, NOT in members. */
        { id: 'p_scopeproj', key: 'scopeproj', name: 'Scope Project', private: true, members: [], lead: null, teams: [], status: 'active', perms: {} },
        /* Scope.teams ∩ p.teams grant cell (D-03 A1 union). */
        { id: 'p_scopeteam', key: 'scopeteam', name: 'Scope Team', private: true, members: ['m_admin'], lead: 'm_admin', teams: ['scopedTeam'], status: 'active', perms: {} },
        /* Access-list member OUT OF scope: hidden today, stays hidden (RESEARCH row 7). */
        { id: 'p_scopeddeny', key: 'scopeddeny', name: 'Scope Deny', private: true, members: ['m_scoped'], lead: 'm_scoped', teams: [], status: 'active', perms: {} },
        /* The ONE intentional Phase 49 visibility gain: out-of-scope member ×
           PUBLIC project — hidden today, visible after the model swap. */
        { id: 'p_publicgain', key: 'publicgain', name: 'Public Gain', private: false, members: [], lead: null, teams: [], status: 'active', perms: {} },
        /* Sealed: private, empty members, no teams, no scope anywhere (D-49-8). */
        { id: 'p_sealed', key: 'sealed', name: 'Sealed', private: true, members: [], lead: null, teams: [], status: 'active', perms: {} },
        /* Legacy p.access:'private' with no boolean private (server.js:754). */
        { id: 'p_legacy', key: 'legacyp', name: 'Legacy Access', access: 'private', members: ['m_admin'], lead: 'm_admin', teams: [], status: 'active', perms: {} },
        /* Plain public project. */
        { id: 'p_open', key: 'open', name: 'Open', private: false, members: [], lead: null, teams: [], status: 'active', perms: {} },
      ],
      tasks: [
        { id: 't_open', project: 'p_open', title: 'Open task', status: 'todo', subtasks: [] },
        { id: 't_mshare', project: 'p_membershare', title: 'Membershare task', status: 'todo', subtasks: [] },
        { id: 't_hidden', project: 'p_hidden', title: 'Hidden task', status: 'todo', subtasks: [] },
        { id: 't_scopeproj', project: 'p_scopeproj', title: 'Scope project task', status: 'todo', subtasks: [] },
      ],
      comments: [],
      activity: [],
      notifs: [],
      files: [],
      events: [],
      projOrder: [...VIS_PROJECTS],
      savedViews: [],
      recentSearches: [],
      sessions: [],
      invoices: [],
      tfa: false,
    },
    prefs: {},
    views: {},
  };
}

/* The expected VISIBLE project-id set per actor through the doc-GET door under
   the OLD model, hand-derived from the RESEARCH §Fixtures matrix plus the
   probe-corrected admin/owner semantics (see module comment).

   Reading of the old predicate per actor class:
   - admin/owner (projectScope null via role, D-49-retired): hiddenProjectIds = canSeeProject
     ONLY (server.js:894) — access list or public; the served copy has
     normalizeProjects' ownerId injected into private-empty projects
     (server.js:929-936), so those belong to the doc owner alone. No team term,
     no scope term.
   - member without scope (null-scope branch, server.js:882-893): canSeeProject
     OR a live team_members intersection (memberCanReadProject :786-794).
   - scoped member (server.js:896-901, D-49-retired): visible ⟺ inScopeProject ∧ scopeGrants
     (:864-870) — scope OPENS its projects/teams (D-03) and SUBTRACTS everything
     else, including public projects.
   - viewer with invite-derived scope: same scoped branch.
   - doc-only profile: no memberships row → requireWorkspace 404s before any
     predicate runs. */
export const VISIBILITY_MODEL = Object.freeze({
  m_admin: ['p_hidden', 'p_teamshare', 'p_scopeteam', 'p_publicgain', 'p_legacy', 'p_open'],
  m_owner: ['p_scopeproj', 'p_sealed', 'p_publicgain', 'p_open'],
  m_plain: ['p_membershare', 'p_open', 'p_publicgain'],
  m_team: ['p_teamshare', 'p_open', 'p_publicgain'],
  m_scoped: ['p_scopeproj', 'p_scopeteam'],
  m_guest: ['p_membershare'],
  m_doconly: [],
});

/* The expected visible set per actor through the MCP mirror under the OLD
   model, hand-derived from mcp.js canReadProject (:180-189):
   admin/owner bypass (ROLE_RANK >= admin → everything) ∨ public ∨ access list
   (on the STORED doc, before any normalization) ∨ live team intersection.
   The mirror has NO scope term — the documented Phase 49 divergence for
   m_scoped/m_guest. After Plan 02's sweep + Plan 03's collapse, mirror and
   server converge; consumers flip the documented-divergence assertions then. */
const ALL = [...VIS_PROJECTS];
export const MIRROR_MODEL = Object.freeze({
  m_admin: ALL,
  m_owner: ALL,
  m_plain: ['p_membershare', 'p_open', 'p_publicgain'],
  m_team: ['p_teamshare', 'p_open', 'p_publicgain'],
  m_scoped: ['p_scopeteam', 'p_scopeddeny', 'p_publicgain', 'p_open'],
  m_guest: ['p_open', 'p_publicgain'],
  /* m_doconly can never obtain an API key: no memberships row → POST /api/keys
     answers 403 notAMember. */
});

/* Actors whose memberships carry a scope column value (the scoped branch). */
export const VIS_SCOPED_ACTORS = Object.freeze(['m_scoped', 'm_guest']);

/* Phase 49 Plan 02 (2026-11-07, D-49-2/A3 interim state): the dated, additive
   visibility delta the ONE boot sweep induces, on top of the untouched
   old-model oracles above. The sweep runs during boot (before any request),
   so post-sweep doc-GETs ride the old predicate over swept data:
   - scope columns NULL → scoped actors ride the null-scope branch and gain
     every PUBLIC project (the A3 gain is inherent to the model swap; Plan 03
     owns the collapsed-model pins and keeps it);
   - m_owner: p_scopeddeny's out-of-scope access-list entry is dissolved
     (old-hidden stays hidden) and its scoped lead is cleared with it —
     normalizeProjects re-adds p.lead to the served members list (:925), so a
     surviving lead would resurrect the dissolved entry on read. The project
     is left private-empty — normalizeProjects' owner injection (:929-936)
     serves it to the doc owner alone, exactly the pre-existing sealed-project
     behavior — so m_owner GAINS it and m_scoped LOSES it;
   - MIRROR (mcp.js, still old semantics, reads the STORED doc): grants now
     sit on the stored access lists, so the mirror sees p_membershare (m_guest)
     and p_scopeproj (m_scoped, D-03 grant materialized); p_scopeddeny's
     dissolved entry no longer shows to m_scoped.
   Plan 03 replaces these deltas with the collapsed-model pins. */
export const POST_SWEEP_SERVER_DELTA = Object.freeze({
  gains: Object.freeze({ m_owner: ['p_scopeddeny'], m_scoped: ['p_open', 'p_publicgain'], m_guest: ['p_open', 'p_publicgain'] }),
  losses: Object.freeze({ m_scoped: ['p_scopeddeny'] }),
});
export const POST_SWEEP_MIRROR_DELTA = Object.freeze({
  gains: Object.freeze({ m_guest: ['p_membershare'], m_scoped: ['p_scopeproj'] }),
  losses: Object.freeze({ m_scoped: ['p_scopeddeny'] }),
});

export function postSweepIds(model, mid, delta) {
  return [...new Set([...(model[mid] || []), ...(delta.gains[mid] || [])])]
    .filter(id => !(delta.losses[mid] || []).includes(id))
    .sort();
}

/* The current server.js SCHEMA (2026-11-07), copied verbatim so the fixture DB
   boots with zero ensureColumn surprises. boot's create-if-not-exists and
   ensureColumn probes are then all no-ops — the byte-identity pin measures the
   migrations, not schema creation. */
const CURRENT_SCHEMA = `
  create table if not exists users (
    id            text primary key,
    email         text not null unique collate nocase,
    name          text not null,
    password_hash text not null,
    member_id     text,
    created_at    integer not null,
    last_login_at integer,
    locale        text,
    two_fa_enabled   integer not null default 0,
    two_fa_secret    text,
    two_fa_last_step integer not null default 0,
    is_instance_admin integer not null default 0
  );
  create table if not exists totp_factors (
    id         text primary key,
    user_id    text not null references users(id) on delete cascade,
    name       text not null,
    secret     text not null,
    last_step  integer not null default 0,
    created_at integer not null
  );
  create index if not exists totp_factors_user on totp_factors(user_id);
  create table if not exists oidc_identities (
    id            text primary key,
    user_id       text not null references users(id) on delete cascade,
    issuer        text not null,
    subject       text not null,
    created_at    integer not null,
    last_login_at integer
  );
  create unique index if not exists oidc_identities_subject on oidc_identities(issuer, subject);
  create index if not exists oidc_identities_user on oidc_identities(user_id);
  create table if not exists sessions (
    token_hash text primary key,
    user_id    text not null references users(id) on delete cascade,
    created_at integer not null,
    expires_at integer not null,
    label      text,
    ip         text,
    last_seen_at integer,
    user_agent text
  );
  create index if not exists sessions_expiry on sessions(expires_at);
  create table if not exists login_challenges (
    challenge_token_hash text primary key,
    user_id              text not null references users(id) on delete cascade,
    expires_at           integer not null,
    attempts             integer not null default 0
  );
  create index if not exists login_challenges_expiry on login_challenges(expires_at);
  create table if not exists workspaces (
    id         text primary key,
    slug       text,
    name       text not null,
    color      text,
    doc        text not null,
    revision   integer not null default 1,
    created_at integer not null,
    updated_at integer not null
  );
  create table if not exists memberships (
    workspace_id text not null references workspaces(id) on delete cascade,
    user_id      text not null references users(id) on delete cascade,
    role         text not null check (role in ('owner','admin','member','viewer')),
    member_id    text,
    /* team/scope are boot ensureColumns in server.js (initDb :423/:432); the
       fixture declares them up front so its inserts carry scope values — the
       boot's ensureColumn probes then no-op. */
    team         text,
    scope        text,
    primary key (workspace_id, user_id)
  );
  create table if not exists team_members (
    workspace_id text not null references workspaces(id) on delete cascade,
    team_id      text not null,
    member_id    text,
    user_id      text not null references users(id) on delete cascade,
    primary key (workspace_id, team_id, user_id)
  );
  create index if not exists team_members_user on team_members(workspace_id, user_id);
  create table if not exists invites (
    token_hash   text primary key,
    email        text,
    role         text not null check (role in ('admin','member','viewer')),
    team         text,
    teams        text,
    workspace_id text references workspaces(id) on delete cascade,
    created_by   text not null references users(id) on delete cascade,
    created_at   integer not null,
    expires_at   integer not null,
    used_at      integer,
    used_by      text,
    /* scope is a boot ensureColumn in server.js (initDb :433) — same rationale
       as memberships above. */
    scope        text
  );
  create index if not exists invites_expiry on invites(expires_at);
  create table if not exists recovery_codes (
    id         text primary key,
    user_id    text not null references users(id) on delete cascade,
    code_hash  text not null,
    used_at    integer,
    created_at integer not null
  );
  create index if not exists recovery_codes_user on recovery_codes(user_id);
  create table if not exists security_log (
    id         text primary key,
    user_id    text not null references users(id) on delete cascade,
    verb       text not null,
    created_at integer not null
  );
  create index if not exists security_log_user on security_log(user_id);
  create table if not exists audit_log (
    id            text primary key,
    actor_id      text,
    target_id     text,
    action        text not null,
    session_count integer not null,
    ip            text,
    workspace_id  text,
    actor_name    text not null,
    actor_email   text not null,
    target_name   text not null,
    target_email  text not null,
    created_at    integer not null
  );
  create index if not exists audit_log_created on audit_log(created_at desc);
  create index if not exists audit_log_workspace on audit_log(workspace_id, created_at desc);
  create table if not exists reminders_sent (
    dedup_key    text primary key,
    workspace_id text not null,
    created_at   integer not null
  );
  create index if not exists reminders_sent_ws on reminders_sent(workspace_id, created_at);
  create table if not exists user_notif_prefs (
    workspace_id text not null,
    user_id      text not null,
    prefs        text not null,
    primary key (workspace_id, user_id)
  );
  create table if not exists api_keys (
    id           text primary key,
    user_id      text not null references users(id) on delete cascade,
    workspace_id text not null references workspaces(id) on delete cascade,
    label        text not null,
    key_hash     text not null unique,
    prefix       text not null,
    scope        text not null check (scope in ('read','write')),
    created_at   integer not null,
    expires_at   integer not null,
    last_used_at integer,
    revoked_at   integer
  );
  create index if not exists api_keys_user on api_keys(user_id);
  create index if not exists api_keys_ws on api_keys(workspace_id);
`;

/* Build the fixture database inside `dataDir` and leave it closed on disk.
   memberships.team stays NULL everywhere — the TEAM-01 backfill
   (migrateTeamMembership) must find zero eligible rows so no backup fires and
   the Phase 49 backup-count assertions own the dataDir. Team membership rides
   team_members rows directly. */
export function createVisibilityFixtureDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'projects.db');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(CURRENT_SCHEMA);

    const hash = legacyScryptHash(VIS_PASSWORD);
    const insertUser = db.prepare('insert into users (id, email, name, password_hash, member_id, created_at) values (?,?,?,?,?,?)');
    for (const [mid, u] of Object.entries(USERS)) {
      insertUser.run(u.userId, u.email, u.name, hash, mid, VIS_CREATED_AT);
    }

    db.prepare('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
      VIS_WS.id,
      VIS_WS.slug,
      'Visibility Fix',
      '#1D1C1A',
      JSON.stringify(visfixDoc()),
      1,
      VIS_CREATED_AT,
      VIS_CREATED_AT,
    );

    /* Profile roles must equal ROLE_LABEL[role] so backfillMemberships'
       ensureMember pass is a byte-no-op on the stored doc (no boot write). */
    const insertMembership = db.prepare('insert into memberships (workspace_id, user_id, role, member_id, scope) values (?,?,?,?,?)');
    insertMembership.run(VIS_WS.id, USERS.m_owner.userId, 'owner', 'm_owner', null);
    insertMembership.run(VIS_WS.id, USERS.m_admin.userId, 'admin', 'm_admin', null);
    insertMembership.run(VIS_WS.id, USERS.m_plain.userId, 'member', 'm_plain', null);
    insertMembership.run(VIS_WS.id, USERS.m_team.userId, 'member', 'm_team', null);
    insertMembership.run(VIS_WS.id, USERS.m_scoped.userId, 'member', 'm_scoped', JSON.stringify(VIS_SCOPED_SCOPE));
    insertMembership.run(VIS_WS.id, USERS.m_guest.userId, 'viewer', 'm_guest', JSON.stringify(VIS_GUEST_SCOPE));
    /* No memberships row for u_doconly — that absence IS the cell. */

    /* team_members is the team authority (Phase 28); user_id space. The
       doc-only member's row is unreachable through the old predicate. */
    const insertTeamMember = db.prepare('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)');
    insertTeamMember.run(VIS_WS.id, 'engA', 'm_team', USERS.m_team.userId);
    insertTeamMember.run(VIS_WS.id, 'engA', null, USERS.m_doconly.userId);
    insertTeamMember.run(VIS_WS.id, 'scopedTeam', 'm_scoped', USERS.m_scoped.userId);

    /* The invite carrying the guest's scope: the materialization source shape
       (Phase 29 SCOPE-05). The guest's membership above already carries the
       accepted scope — this row proves the invites.scope column is populated
       pre-sweep and gives Plan 02's NULL sweep a row to clear. */
    db.prepare(
      `insert into invites (token_hash, email, role, teams, workspace_id, created_by, created_at, expires_at, scope)
       values (?,?,?,?,?,?,?,?,?)`,
    ).run(
      crypto.createHash('sha256').update(VIS_INVITE_TOKEN).digest('hex'),
      'pending@visfix.local',
      'viewer',
      JSON.stringify([]),
      VIS_WS.id,
      USERS.m_owner.userId,
      VIS_CREATED_AT,
      VIS_CREATED_AT + 7 * 86400 * 1000,
      JSON.stringify(VIS_GUEST_SCOPE),
    );
  } finally {
    db.close();
  }
  return dbPath;
}
