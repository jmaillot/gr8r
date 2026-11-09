/* Phase 49 (49-01, T-49-01) → Phase 50 (50-01, D-50-5): the actor × project
   visibility matrix as a raw SQLite fixture, plus the INDEPENDENT visibility
   oracle.

   ANTI-TAUTOLOGY CONTRACT: VISIBILITY_MODEL and MIRROR_MODEL below are
   hand-derived from the predicate — NEVER read from production code.
   Consumers must not derive expectations from memberCanReadProject (server.js)
   or canReadProject (mcp.js) either.

   D-50-5 model (2026-11-08, Phase 50 Plan 01): the single visibility
   predicate is
       public ∨ memberId ∈ p.members ∨ member's LIVE team ∈ p.teams
   where "live" means the predicate reads current p.teams and current
   team_members rows on every evaluation, with no caching layer. The Phase 49
   grant-materialization sweep is RETIRED: p.teams is never deleted, scope
   columns stay dormant-on-disk/ignored-by-code, and legacy p.access remains
   an un-honored string (projectIsPrivate reads the boolean only, so a
   never-swept access:'private' doc behaves public — D-49-4 posture kept).

   Probe-correction note (Phase 49, still true): the doc-GET admin/owner path
   is hiddenProjectIds = canSeeProject WITHOUT the team term (default param) —
   private projects stay access-list-gated for admins/owners, and a private
   project with an empty access list is served to the document owner alone
   (normalizeProjects injects ownerId into the served copy). The mcp.js mirror
   DOES grant admins/owners everything — the pre-existing mirror drift the
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

/* Deterministic actor and project ids (plan-mandated). Phase 52 (52-01,
   D-52-9) extends both sets: m_admin2 (admin whose ONLY private-project grant
   is a live team link — the funnel-authority divergence cell) and three
   project cells (p_adminteam, p_leadonly, p_lostvis). */
export const VIS_ACTORS = Object.freeze(['m_admin', 'm_owner', 'm_plain', 'm_team', 'm_scoped', 'm_guest', 'm_doconly', 'm_admin2', /* Phase 53 (53-01, D-03) team-perm actor cells — VISIBILITY ONLY: per-team perms (p.perms['team:'+id]) gate content WRITES and never tier visibility, so these actors' visible sets are derived from the SAME D-50-5 predicate as before: */ 'm_teamviewonly', 'm_teamrevoked', 'm_danglingteam']);
export const VIS_PROJECTS = Object.freeze([
  'p_membershare',
  'p_hidden',
  'p_teamshare',
  'p_teamboth',
  'p_scopeproj',
  'p_scopeteam',
  'p_scopeddeny',
  'p_publicgain',
  'p_sealed',
  'p_legacy',
  'p_legacyteam',
  'p_open',
  'p_adminteam',
  'p_leadonly',
  'p_lostvis',
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
  /* m_admin2 (Phase 52, D-52-9): an admin in engA whose ONLY grant to
     p_adminteam is a live team link. The transparency funnel lists it;
     the access-list-gated admin doc-GET path hides it. */
  m_admin2: { userId: 'u_admin2', email: 'admin2@visfix.local', name: "Ari Admin II", role: 'admin', roleLabel: 'Admin' },
  /* Phase 53 (53-01, D-03) team-perm actor cells. Visibility stays boolean —
     the per-team perms stored as p.perms['team:'+teamId] gate content WRITES
     only, so none of these rows tier visibility (boolean-only cells). */
  m_teamviewonly: { userId: 'u_tvonly', email: 'teamviewonly@visfix.local', name: 'Vera ViewOnly', role: 'member', roleLabel: 'Member' },
  m_teamrevoked: { userId: 'u_trevoked', email: 'teamrevoked@visfix.local', name: 'Rex Revoked', role: 'member', roleLabel: 'Member' },
  /* m_danglingteam's only team_members row points at team id 'ghost' — absent
     from doc.teams and from every p.teams (the dangling-key shape; the perm
     KEY sweep itself is pinned in test/perm.test.mjs row 5). */
  m_danglingteam: { userId: 'u_dangling', email: 'danglingteam@visfix.local', name: 'Dan Dangling', role: 'member', roleLabel: 'Member' },
});

/* member id → users.id, exported so consumers hit route paths in the userId
   space the member routes resolve (users lookup + membershipOf). */
export const VIS_USER_IDS = Object.freeze(Object.fromEntries(Object.entries(USERS).map(([mid, u]) => [mid, u.userId])));

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
        /* Team-derived cell (D-50-5): m_team's engA team_members row grants
           live access — NO materialization step (sweep retired). */
        { id: 'p_teamshare', key: 'teamshare', name: 'Team Share', private: true, members: ['m_admin'], lead: 'm_admin', teams: ['engA'], status: 'active', perms: {} },
        /* Team-linked AND individually listed (D-50-5 unless-clause): m_team
           keeps access even after leaving engA (individual entry stands). */
        { id: 'p_teamboth', key: 'teamboth', name: 'Team And Member', private: true, members: ['m_admin', 'm_team'], lead: 'm_admin', teams: ['engA'], status: 'active', perms: {} },
        /* Scope.projects grant cell (D-03 inversion) — private, NOT in members. */
        { id: 'p_scopeproj', key: 'scopeproj', name: 'Scope Project', private: true, members: [], lead: null, teams: [], status: 'active', perms: {} },
        /* Scope.teams ∩ p.teams grant cell (D-03 A1 union). */
        { id: 'p_scopeteam', key: 'scopeteam', name: 'Scope Team', private: true, members: ['m_admin'], lead: 'm_admin', teams: ['scopedTeam'], status: 'active', perms: {} },
        /* Access-list member OUT OF scope: hidden today, stays hidden (RESEARCH row 7). */
        { id: 'p_scopeddeny', key: 'scopeddeny', name: 'Scope Deny', private: true, members: ['m_scoped'], lead: 'm_scoped', teams: [], status: 'active', perms: {} },
        /* The ONE intentional Phase 49 visibility gain: out-of-scope member ×
           PUBLIC project — hidden today, visible after the model swap. The
           engA link on a public project changes nothing (public is public):
           the D-50-5 "team-linked on public project" cell. */
        { id: 'p_publicgain', key: 'publicgain', name: 'Public Gain', private: false, members: [], lead: null, teams: ['engA'], status: 'active', perms: {} },
        /* Sealed: private, empty members, no teams, no scope anywhere (D-49-8). */
        { id: 'p_sealed', key: 'sealed', name: 'Sealed', private: true, members: [], lead: null, teams: [], status: 'active', perms: {} },
        /* Legacy p.access:'private' with no boolean private (server.js:754). */
        { id: 'p_legacy', key: 'legacyp', name: 'Legacy Access', access: 'private', members: ['m_admin'], lead: 'm_admin', teams: [], status: 'active', perms: {} },
        /* Legacy scalar `team` cell (CR-01, 49-05): a pre-Phase-32 stored doc —
           scalar `team` key, NO `teams` key. The Phase 50 sweep retirement
           means NOTHING converts or deletes this key: the D-50-5 predicate
           reads p.teams only, so the engA link here is dead — a live-team
           grant must use the teams[] spelling. */
        { id: 'p_legacyteam', key: 'legacyteam', name: 'Legacy Scalar Team', private: true, members: ['m_admin'], lead: 'm_admin', team: 'engA', status: 'active', perms: {} },
        /* Plain public project. */
        { id: 'p_open', key: 'open', name: 'Open', private: false, members: [], lead: null, teams: [], status: 'active', perms: {} },
        /* Phase 52 (D-52-9) cells:
           - p_adminteam: an admin's ONLY grant is the LIVE engA link. The
             transparency funnel lists it (reason 'team'); the access-list-
             gated admin doc-GET path hides it — the pinned funnel-authority
             divergence (RESEARCH Open Question 1, option (a)). Stored
             members [] / lead null: normalizeProjects injects the doc owner
             into the served copy, so the OWNER alone sees it on doc-GET. */
        { id: 'p_adminteam', key: 'adminteam', name: 'Admin Team Link', private: true, members: [], lead: null, teams: ['engA'], status: 'active', perms: {} },
        /* - p_leadonly: the target is p.lead and NOT in the literal
             p.members array before normalization — normalizeProjects pushes
             the lead into members on every read (that push IS part of the
             cell), so the funnel reads the member through the lead term,
             labeled 'lead' before plain 'member' inside the membership tier. */
        { id: 'p_leadonly', key: 'leadonly', name: 'Lead Only', private: true, members: [], lead: 'm_admin', teams: [], status: 'active', perms: {} },
        /* - p_lostvis: the D-51-4 lost-visibility cell — m_team sits on the
             access list of a private project with NO team link; the
             transparency suite removes the entry and the server list must
             shrink on the very next request. */
        { id: 'p_lostvis', key: 'lostvis', name: 'Lost Visibility', private: true, members: ['m_team'], lead: 'm_admin', teams: [], status: 'active', perms: {} },
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
   the D-50-5 model, HAND-DERIVED from:
       public ∨ memberId ∈ p.members ∨ member's LIVE team ∈ p.teams
   with the Phase 49 admin/owner posture kept (hiddenProjectIds = access-list-
   gated, NO team term for admins/owners) and normalizeProjects' effects:
   p_legacy (access:'private', no boolean) is un-honored → public for everyone;
   private-empty p_scopeproj/p_sealed get the doc owner injected into the
   SERVED copy (owner alone sees them).
   Per actor:
   - m_admin (admin, access-list-gated): private ∋ m_admin → p_hidden,
     p_teamshare, p_teamboth, p_scopeteam, p_legacyteam, p_leadonly,
     p_lostvis (normalization pushes the lead into members on every read)
     + publics. NOT p_adminteam (no individual entry; the admin doc-GET
     path carries no team term).
   - m_owner (owner, same gate): private-empty injection → p_scopeproj,
     p_sealed, p_adminteam (owner injected into the served copy) + publics.
      NOT p_scopeddeny (m_scoped keeps its entry — the
     Phase 49 dissolve sweep is retired).
   - m_plain: p_membershare (access list) + publics. NOT p_teamshare
     (non-linked member × team-linked private project — the 404 cell).
   - m_team (member, engA live): p_teamshare (live team), p_teamboth (team AND
     individual), p_adminteam (live team), p_lostvis (access list) + publics. NOT p_legacyteam (scalar team key is dead —
     nothing converts it, the sweep is retired).
   - m_scoped (member, scopedTeam live): p_scopeteam (live team),
     p_scopeddeny (access list — the scope SUBTRACTION is gone with the
     dormant scope columns) + publics. NOT p_scopeproj (the D-03 scope grant
     is dormant, nothing materializes it).
   - m_guest (viewer, no team rows): publics only — the scope.projects grant
     to p_membershare is dormant.
   - m_admin2 (admin, engA live, access-list-gated doc-GET): publics only —
     p_adminteam stays hidden on THIS door (the funnel-authority divergence
     cell; the transparency endpoint DOES list it).
   - m_doconly: no memberships row → requireWorkspace 404s before any
     predicate runs. */
export const VISIBILITY_MODEL = Object.freeze({
  m_admin: ['p_hidden', 'p_leadonly', 'p_legacy', 'p_legacyteam', 'p_lostvis', 'p_open', 'p_publicgain', 'p_scopeteam', 'p_teamboth', 'p_teamshare'],
  m_owner: ['p_adminteam', 'p_legacy', 'p_open', 'p_publicgain', 'p_scopeproj', 'p_sealed'],
  m_plain: ['p_legacy', 'p_membershare', 'p_open', 'p_publicgain'],
  m_team: ['p_adminteam', 'p_legacy', 'p_lostvis', 'p_open', 'p_publicgain', 'p_teamboth', 'p_teamshare'],
  m_scoped: ['p_legacy', 'p_open', 'p_publicgain', 'p_scopeddeny', 'p_scopeteam'],
  m_guest: ['p_legacy', 'p_open', 'p_publicgain'],
  m_admin2: ['p_legacy', 'p_open', 'p_publicgain'],
  /* 53-01 (D-03) team-perm cells — VISIBILITY ONLY, hand-derived from the same
     D-50-5 predicate (per-team perms never tier visibility):
     - m_teamviewonly: engA live → the exact m_team set (a 'Can view' team perm
       would refuse its WRITES — test/perm.test.mjs — not its reads);
     - m_teamrevoked: no team rows → publics only;
     - m_danglingteam: its only live team id 'ghost' intersects NO p.teams →
       publics only, unchanged by any dangling 'team:ghost' perm key. */
  m_teamviewonly: ['p_adminteam', 'p_legacy', 'p_open', 'p_publicgain', 'p_teamboth', 'p_teamshare'],
  m_teamrevoked: ['p_legacy', 'p_open', 'p_publicgain'],
  m_danglingteam: ['p_legacy', 'p_open', 'p_publicgain'],
  m_doconly: [],
});

/* The expected visible set per actor through the MCP mirror under the D-50-5
   model, hand-derived from mcp.js canReadProject: admin/owner bypass
   (ROLE_RANK >= admin → everything) ∨ public ∨ access list ∨ LIVE team
   intersection, read on the STORED doc (no normalization). The mirror keeps
   the documented admin/owner drift (RESEARCH Open Question 2: preserved). */
const ALL = [...VIS_PROJECTS];
export const MIRROR_MODEL = Object.freeze({
  m_admin: ALL,
  m_owner: ALL,
  m_admin2: ALL, // admin bypass on the mirror — including the team-link cell
  m_plain: ['p_legacy', 'p_membershare', 'p_open', 'p_publicgain'],
  m_team: ['p_adminteam', 'p_legacy', 'p_lostvis', 'p_open', 'p_publicgain', 'p_teamboth', 'p_teamshare'],
  m_scoped: ['p_legacy', 'p_open', 'p_publicgain', 'p_scopeddeny', 'p_scopeteam'],
  m_guest: ['p_legacy', 'p_open', 'p_publicgain'],
  /* 53-01 (D-03) team-perm cells — the mirror stays boolean; same hand-derived
     sets as VISIBILITY_MODEL for the three new non-admin actors. */
  m_teamviewonly: ['p_adminteam', 'p_legacy', 'p_open', 'p_publicgain', 'p_teamboth', 'p_teamshare'],
  m_teamrevoked: ['p_legacy', 'p_open', 'p_publicgain'],
  m_danglingteam: ['p_legacy', 'p_open', 'p_publicgain'],
  /* m_doconly can never obtain an API key: no memberships row → POST /api/keys
     answers 403 notAMember. */
});

/* Actors whose memberships carry a scope column value (dormant-on-disk since
   the Phase 50 sweep retirement — nothing reads them). */
export const VIS_SCOPED_ACTORS = Object.freeze(['m_scoped', 'm_guest']);

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
    insertMembership.run(VIS_WS.id, USERS.m_admin2.userId, 'admin', 'm_admin2', null);
    insertMembership.run(VIS_WS.id, USERS.m_plain.userId, 'member', 'm_plain', null);
    insertMembership.run(VIS_WS.id, USERS.m_team.userId, 'member', 'm_team', null);
    insertMembership.run(VIS_WS.id, USERS.m_scoped.userId, 'member', 'm_scoped', JSON.stringify(VIS_SCOPED_SCOPE));
    insertMembership.run(VIS_WS.id, USERS.m_guest.userId, 'viewer', 'm_guest', JSON.stringify(VIS_GUEST_SCOPE));
    /* Phase 53 (53-01) team-perm actor cells — all plain members. */
    insertMembership.run(VIS_WS.id, USERS.m_teamviewonly.userId, 'member', 'm_teamviewonly', null);
    insertMembership.run(VIS_WS.id, USERS.m_teamrevoked.userId, 'member', 'm_teamrevoked', null);
    insertMembership.run(VIS_WS.id, USERS.m_danglingteam.userId, 'member', 'm_danglingteam', null);
    /* No memberships row for u_doconly — that absence IS the cell. */

    /* team_members is the team authority (Phase 28); user_id space. The
       doc-only member's row is unreachable through the old predicate. */
    const insertTeamMember = db.prepare('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)');
    insertTeamMember.run(VIS_WS.id, 'engA', 'm_team', USERS.m_team.userId);
    insertTeamMember.run(VIS_WS.id, 'engA', 'm_admin2', USERS.m_admin2.userId);
    insertTeamMember.run(VIS_WS.id, 'engA', null, USERS.m_doconly.userId);
    insertTeamMember.run(VIS_WS.id, 'scopedTeam', 'm_scoped', USERS.m_scoped.userId);
    /* 53-01 cells: m_teamviewonly rides engA (a 'Can view' team perm on a
       project would gate its writes, never its visibility); m_teamrevoked has
       NO team rows (revoked — the team term grants nothing); m_danglingteam's
       only row targets 'ghost' (∉ doc.teams, ∉ every p.teams). */
    insertTeamMember.run(VIS_WS.id, 'engA', 'm_teamviewonly', USERS.m_teamviewonly.userId);
    insertTeamMember.run(VIS_WS.id, 'ghost', 'm_danglingteam', USERS.m_danglingteam.userId);

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
