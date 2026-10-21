/* A real pre-tenancy database: the exact single-workspace schema and rows that
   existed before the multitenant milestone. Tests boot the real server against
   this file, so the backup/migration path is proven without mocks. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const LEGACY_PASSWORD = 'legacy-password-1';
export const LEGACY_INVITE_TOKEN = 'legacy-invite-token-1234567890';
export const LEGACY_CREATED_AT = 1_700_000_000_000;

/* Exactly the format server.js verifies: scrypt$N$r$p$salt$key. */
const SALT = Buffer.from('gsd-legacy-salt!');
export function legacyScryptHash(password) {
  const key = crypto.scryptSync(password, SALT, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${SALT.toString('base64')}$${key.toString('base64')}`;
}

/* The old schema: no workspaces.slug/color, no memberships.member_id, no invites.workspace_id. */
const LEGACY_SCHEMA = `
  create table users (
    id            text primary key,
    email         text not null unique collate nocase,
    name          text not null,
    password_hash text not null,
    member_id     text,
    created_at    integer not null,
    last_login_at integer
  );
  create table sessions (
    token_hash text primary key,
    user_id    text not null references users(id) on delete cascade,
    created_at integer not null,
    expires_at integer not null
  );
  create table workspaces (
    id         text primary key,
    name       text not null,
    doc        text not null,
    revision   integer not null default 1,
    created_at integer not null,
    updated_at integer not null
  );
  create table memberships (
    workspace_id text not null references workspaces(id) on delete cascade,
    user_id      text not null references users(id) on delete cascade,
    role         text not null check (role in ('owner','admin','member','viewer')),
    primary key (workspace_id, user_id)
  );
  create table invites (
    token_hash text primary key,
    email      text,
    role       text not null check (role in ('admin','member','viewer')),
    team       text,
    created_by text not null references users(id) on delete cascade,
    created_at integer not null,
    expires_at integer not null,
    used_at    integer,
    used_by    text
  );
`;

/* A single-workspace document from before the switch to real tenancy. */
export function legacyDoc() {
  return {
    data: {
      plan: 'Team',
      ws: { name: 'Legacy Studio', url: 'legacy-studio', c: '#3D8E5F', brand: true },
      workspaces: [
        { id: 'w1', name: 'Legacy Studio', c: '#3D8E5F' },
        { id: 'w2', name: 'Side Project', c: '#C54B78' },
      ],
      me: 'm_alice',
      members: [
        {
          id: 'm_alice',
          name: 'Alice Legacy',
          email: 'alice@legacy.local',
          role: 'Owner',
          team: null,
          title: '',
          c: '#5A67D8',
          status: 'active',
          last: 0,
          tz: '',
        },
        {
          id: 'm_bob',
          name: 'Bob Legacy',
          email: 'bob@legacy.local',
          role: 'Member',
          team: null,
          title: '',
          c: '#0EA5E9',
          status: 'active',
          last: 0,
          tz: '',
        },
      ],
      projects: [
        {
          id: 'p_keep',
          key: 'keep-me',
          name: 'Surviving Project',
          private: false,
          members: [],
          lead: null,
          team: null,
          status: 'active',
          perms: {},
        },
      ],
      tasks: [{ id: 't_keep', projectId: 'p_keep', title: 'Surviving task', assignee: 'm_alice', status: 'todo', subtasks: [] }],
      comments: [],
      activity: [],
      notifs: [],
      files: [],
      events: [],
      projOrder: ['p_keep'],
      savedViews: [],
      recentSearches: [],
      sessions: [],
      invoices: [],
      tfa: false,
      notifPrefs: {
        email_mention: true,
        email_assign: true,
        email_digest: true,
        email_comment: false,
        push_mention: true,
        push_assign: true,
        push_comment: true,
        push_due: true,
        mention_all: true,
        assign_self: true,
      },
    },
    prefs: {},
    views: {},
  };
}

/* Build the legacy database inside `dataDir` and leave it closed on disk. */
export function createLegacyDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'gr8r.db');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('pragma foreign_keys = on');
    db.exec(LEGACY_SCHEMA);

    const hash = legacyScryptHash(LEGACY_PASSWORD);
    const insertUser = db.prepare('insert into users (id, email, name, password_hash, member_id, created_at) values (?,?,?,?,?,?)');
    insertUser.run('u_alice', 'alice@legacy.local', 'Alice Legacy', hash, 'm_alice', LEGACY_CREATED_AT);
    insertUser.run('u_bob', 'bob@legacy.local', 'Bob Legacy', hash, 'm_bob', LEGACY_CREATED_AT);

    db.prepare('insert into workspaces (id, name, doc, revision, created_at, updated_at) values (?,?,?,?,?,?)').run(
      'ws_legacy',
      'Legacy Studio',
      JSON.stringify(legacyDoc()),
      7,
      LEGACY_CREATED_AT,
      LEGACY_CREATED_AT,
    );

    const insertMembership = db.prepare('insert into memberships (workspace_id, user_id, role) values (?,?,?)');
    insertMembership.run('ws_legacy', 'u_alice', 'owner');
    insertMembership.run('ws_legacy', 'u_bob', 'member');

    db.prepare(
      `insert into invites (token_hash, email, role, team, created_by, created_at, expires_at)
       values (?,?,?,?,?,?,?)`,
    ).run(
      crypto.createHash('sha256').update(LEGACY_INVITE_TOKEN).digest('hex'),
      'new@legacy.local',
      'member',
      null,
      'u_alice',
      LEGACY_CREATED_AT,
      Date.now() + 7 * 86400 * 1000,
    );
  } finally {
    db.close();
  }
  return dbPath;
}
