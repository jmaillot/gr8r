#!/usr/bin/env node
/* =====================================================================
   Gr8r Studio server — one process, zero runtime dependencies.

   Serves the built SPA from dist/ and a small JSON API backed by SQLite
   (node:sqlite). Auth uses scrypt + opaque session cookies. The workspace
   itself is stored as one versioned JSON document, which matches the
   shape the front end already persists, so sync stays simple.

   Env:
     PORT=8080              listen port
     DATA_DIR=/data         directory holding gr8r.db
     ADMIN_EMAIL            first-run admin account
     ADMIN_PASSWORD         first-run admin password (generated if absent)
     ADMIN_NAME=Admin
     WORKSPACE_NAME=Gr8r Studio
     ALLOW_SIGNUP=false     let visitors create accounts
     SEED_DATA=true         false = start with an empty workspace
     SESSION_DAYS=30
     INVITE_DAYS=7          invite link lifetime
     SECURE_COOKIE=auto     auto | true | false
     TRUST_PROXY=true       read X-Forwarded-* (behind Traefik)
     MAX_BODY_BYTES=8388608

   CLI:
     node server.js --add-user <email> [name]     (USER_PASSWORD env or generated)
     node server.js --set-password <email>        (revokes that user's sessions)
     node server.js --backup [file]               (consistent SQLite snapshot)
   ===================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.STATIC_DIR || path.join(HERE, 'dist'));
const SEED_FILE = path.join(HERE, 'seed.json');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, 'data'));
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(DATA_DIR, 'gr8r.db'));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
const SEED_DATA = process.env.SEED_DATA !== 'false';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const INVITE_DAYS = Number(process.env.INVITE_DAYS || 7);
const SECURE_COOKIE = process.env.SECURE_COOKIE || 'auto';
const TRUST_PROXY = process.env.TRUST_PROXY !== 'false';
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024);
const WS_ID = 'ws_default';
const COOKIE = 'gr8r_session';

/* ------------------------------- database ------------------------------ */
const SCHEMA = `
  create table if not exists users (
    id            text primary key,
    email         text not null unique collate nocase,
    name          text not null,
    password_hash text not null,
    member_id     text,
    created_at    integer not null,
    last_login_at integer
  );
  create table if not exists sessions (
    token_hash text primary key,
    user_id    text not null references users(id) on delete cascade,
    created_at integer not null,
    expires_at integer not null
  );
  create index if not exists sessions_expiry on sessions(expires_at);
  create table if not exists workspaces (
    id         text primary key,
    name       text not null,
    doc        text not null,
    revision   integer not null default 1,
    created_at integer not null,
    updated_at integer not null
  );
  create table if not exists memberships (
    workspace_id text not null references workspaces(id) on delete cascade,
    user_id      text not null references users(id) on delete cascade,
    role         text not null check (role in ('owner','admin','member','viewer')),
    primary key (workspace_id, user_id)
  );
  create table if not exists invites (
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
  create index if not exists invites_expiry on invites(expires_at);
`;

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('pragma journal_mode = wal');
  db.exec('pragma foreign_keys = on');
  db.exec('pragma busy_timeout = 5000');
  db.exec('pragma synchronous = normal');
  db.exec(SCHEMA);
  return db;
}

const db = openDb();

/* ------------------------------- helpers ------------------------------- */
const now = () => Date.now();
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const uid = () => crypto.randomUUID();
const emailOk = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, n, r, p, salt, key] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const want = Buffer.from(key, 'base64');
    const got = crypto.scryptSync(password, Buffer.from(salt, 'base64'), want.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * 1024 * 1024,
    });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

// Always spend the same work on unknown accounts, so login timing doesn't leak emails.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, memberId: row.member_id };
}

function roleOf(userId) {
  return db.prepare('select role from memberships where workspace_id = ? and user_id = ?').get(WS_ID, userId)?.role || null;
}

function getWorkspace() {
  return db.prepare('select * from workspaces where id = ?').get(WS_ID);
}

function emptyDoc() {
  const name = process.env.WORKSPACE_NAME || 'Gr8r Studio';
  return {
    data: {
      ws: { name, url: '', c: '#1D1C1A', brand: true },
      workspaces: [{ id: 'w1', name, c: '#1D1C1A', plan: 'Team', brand: true }],
      me: null,
      members: [],
      projects: [],
      tasks: [],
      comments: [],
      activity: [],
      notifs: [],
      files: [],
      events: [],
      projOrder: [],
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
  };
}

function seedDoc() {
  if (!SEED_DATA) return emptyDoc();
  try {
    return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  } catch {
    return emptyDoc();
  }
}

/* Create the workspace and, when the database is empty, the first admin. */
function ensureWorkspace() {
  if (getWorkspace()) return;
  const t = now();
  db.prepare('insert into workspaces (id, name, doc, revision, created_at, updated_at) values (?,?,?,?,?,?)').run(
    WS_ID,
    process.env.WORKSPACE_NAME || 'Gr8r Studio',
    JSON.stringify(seedDoc()),
    1,
    t,
    t,
  );
}

function ensureAdmin({ quiet = false } = {}) {
  if (db.prepare('select count(*) as n from users').get().n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@localhost').trim();
  const name = process.env.ADMIN_NAME || 'Admin';
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }
  createUser(email, name, password, 'owner');
  if (!quiet) {
    console.log(`  bootstrap account: ${email}`);
    if (generated) console.log(`  generated password: ${password}\n  (set ADMIN_PASSWORD and recreate the volume to choose your own)`);
  }
}

function bootstrap(opts) {
  ensureWorkspace();
  ensureAdmin(opts);
}

function ensureMember(doc, user) {
  const members = doc?.data?.members;
  if (!Array.isArray(members)) return null;
  const match = members.find(m => (m.email || '').toLowerCase() === user.email.toLowerCase());
  if (match) {
    if (!match.id) match.id = `m_${user.id.slice(0, 8)}`;
    if (user.name && (!match.name || match.name === 'Member')) match.name = user.name;
    if (match.status === 'invited') match.status = 'active';
    return match.id;
  }
  const id = `m_${user.id.slice(0, 8)}`;
  members.push({
    id,
    name: user.name,
    email: user.email,
    role: 'Member',
    team: null,
    title: '',
    c: ['#5A67D8', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][members.length % 6],
    status: 'active',
    last: now(),
    tz: '',
  });
  return id;
}

function createUser(email, name, password, role) {
  const clean = email.trim().toLowerCase();
  if (!emailOk(clean)) throw httpError(400, 'Enter a valid email address');
  if (String(password).length < 10) throw httpError(400, 'Use at least 10 characters');
  if (db.prepare('select 1 from users where email = ?').get(clean)) throw httpError(409, 'An account with that email already exists');

  const id = uid();
  const user = { id, email: clean, name: (name || '').trim() || clean.split('@')[0] };

  const ws = getWorkspace();
  const doc = JSON.parse(ws.doc);
  const memberId = ensureMember(doc, user);
  if (!doc.data.me) doc.data.me = memberId;

  db.exec('begin immediate');
  try {
    db.prepare('insert into users (id, email, name, password_hash, member_id, created_at) values (?,?,?,?,?,?)').run(
      id,
      clean,
      user.name,
      hashPassword(password),
      memberId,
      now(),
    );
    db.prepare('insert into memberships (workspace_id, user_id, role) values (?,?,?)').run(WS_ID, id, role);
    db.prepare('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?').run(JSON.stringify(doc), now(), WS_ID);
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
  return { id, email: clean, name: user.name, member_id: memberId };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function json(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function proto(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-proto']) return String(req.headers['x-forwarded-proto']).split(',')[0].trim();
  return req.socket.encrypted ? 'https' : 'http';
}

function publicBase(req) {
  const forwarded = TRUST_PROXY
    ? String(req.headers['x-forwarded-host'] || '')
        .split(',')[0]
        .trim()
    : '';
  return `${proto(req)}://${forwarded || req.headers.host || 'localhost'}`;
}

/* UI labels map to the API's membership roles. */
function inviteRole(value) {
  const role = String(value || '').toLowerCase();
  if (role === 'admin' || role === 'member' || role === 'viewer') return role;
  if (role === 'guest') return 'viewer';
  return 'member';
}

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl / non-browser clients; CSRF needs a browser
  const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host;
  return origin === `${proto(req)}://${host}`;
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(req, res, token) {
  const secure = SECURE_COOKIE === 'true' || (SECURE_COOKIE === 'auto' && proto(req) === 'https');
  const maxAge = SESSION_DAYS * 86400;
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(req, res) {
  const secure = SECURE_COOKIE === 'true' || (SECURE_COOKIE === 'auto' && proto(req) === 'https');
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `select u.* from sessions s join users u on u.id = s.user_id
       where s.token_hash = ? and s.expires_at > ?`,
    )
    .get(sha256(token), now());
  return row || null;
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { error: 'Sign in to continue' });
    return null;
  }
  return user;
}

/* In-memory throttle: a handful of attempts per IP+email per window. */
const attempts = new Map();
function tooMany(key, max = 10, windowMs = 15 * 60 * 1000) {
  const t = now();
  const row = attempts.get(key);
  if (!row || t > row.reset) {
    attempts.set(key, { n: 1, reset: t + windowMs });
    if (attempts.size > 5000) for (const [k, v] of attempts) if (t > v.reset) attempts.delete(k);
    return false;
  }
  row.n += 1;
  return row.n > max;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(httpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(httpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/* -------------------------------- API ---------------------------------- */
async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (pathname === '/api/health' && method === 'GET') {
    return json(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  }

  if (pathname === '/api/config' && method === 'GET') {
    return json(res, 200, { app: 'gr8r', signup: ALLOW_SIGNUP });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readJson(req);
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(body?.password || '');
    if (!emailOk(email) || !password) return json(res, 400, { error: 'Email and password are required' });
    if (tooMany(`${clientIp(req)}|${email}`)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });

    const row = db.prepare('select * from users where email = ?').get(email);
    const valid = verifyPassword(password, row?.password_hash || DUMMY_HASH) && !!row;
    if (!valid) return json(res, 401, { error: 'Email or password is incorrect' });

    attempts.delete(`${clientIp(req)}|${email}`);
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    db.prepare('insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)').run(
      sha256(token),
      row.id,
      t,
      t + SESSION_DAYS * 86400 * 1000,
    );
    db.prepare('update users set last_login_at = ? where id = ?').run(t, row.id);
    setSessionCookie(req, res, token);
    return json(res, 200, { user: { ...publicUser(row), role: roleOf(row.id) } });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare('delete from sessions where token_hash = ?').run(sha256(token));
    clearSessionCookie(req, res);
    return json(res, 204);
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    // Probe endpoint: answer 200 with null instead of 401 so a signed-out
    // boot doesn't log a console error in every browser.
    const user = currentUser(req);
    if (!user) return json(res, 200, { user: null });
    return json(res, 200, { user: { ...publicUser(user), role: roleOf(user.id) } });
  }

  if (pathname === '/api/auth/signup' && method === 'POST') {
    if (!ALLOW_SIGNUP) return json(res, 403, { error: 'Sign-ups are disabled. Ask an admin for an account.' });
    if (tooMany(`signup|${clientIp(req)}`, 5, 60 * 60 * 1000)) return json(res, 429, { error: 'Too many attempts. Try again later.' });
    const body = await readJson(req);
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const name = String(body?.name || '').trim();
    const password = String(body?.password || '');
    if (!name) return json(res, 400, { error: 'Enter your name' });
    if (password.length < 10 || !/[0-9\W]/.test(password)) {
      return json(res, 400, { error: 'Use at least 10 characters, including a number or symbol' });
    }
    let user;
    try {
      user = createUser(email, name, password, 'member');
    } catch (err) {
      return json(res, err.status || 500, { error: err.message });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    db.prepare('insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)').run(
      sha256(token),
      user.id,
      t,
      t + SESSION_DAYS * 86400 * 1000,
    );
    setSessionCookie(req, res, token);
    return json(res, 201, { user: { ...publicUser(user), role: 'member' } });
  }

  if (pathname === '/api/invites' && method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-origin request rejected' });
    const actorRole = roleOf(user.id);
    if (actorRole !== 'owner' && actorRole !== 'admin') {
      return json(res, 403, { error: 'Only workspace admins can invite people' });
    }

    const body = await readJson(req);
    const role = inviteRole(body?.role);
    const team = body?.team ? String(body.team).slice(0, 40) : null;
    let emails = Array.isArray(body?.emails) ? body.emails : [];
    emails = [
      ...new Set(
        emails
          .map(e =>
            String(e || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
    if (emails.length > 20) return json(res, 400, { error: 'Create at most 20 invites at a time' });
    for (const email of emails) if (!emailOk(email)) return json(res, 400, { error: `Invalid email: ${email}` });

    const t = now();
    const expiresAt = t + INVITE_DAYS * 86400 * 1000;
    const rows = [];
    db.exec('begin immediate');
    try {
      db.prepare('delete from invites where expires_at < ?').run(t);
      for (const email of emails.length ? emails : [null]) {
        if (email && db.prepare('select 1 from users where email = ?').get(email)) {
          db.exec('rollback');
          return json(res, 409, { error: `${email} already has an account` });
        }
        const token = crypto.randomBytes(24).toString('base64url');
        db.prepare('insert into invites (token_hash, email, role, team, created_by, created_at, expires_at) values (?,?,?,?,?,?,?)').run(
          sha256(token),
          email,
          role,
          team,
          user.id,
          t,
          expiresAt,
        );
        rows.push({ email, role, url: `${publicBase(req)}/join/${token}`, expiresAt });
      }
      db.exec('commit');
    } catch (err) {
      db.exec('rollback');
      throw err;
    }
    return json(res, 201, { invites: rows });
  }

  const inviteMatch = pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{16,128})$/);
  if (inviteMatch && method === 'GET') {
    const row = db.prepare('select * from invites where token_hash = ?').get(sha256(inviteMatch[1]));
    if (!row) return json(res, 404, { error: 'This invite link is not valid' });
    if (row.used_at) return json(res, 410, { error: 'This invite has already been used' });
    if (row.expires_at <= now()) return json(res, 410, { error: 'This invite has expired' });
    const ws = getWorkspace();
    return json(res, 200, { workspace: ws.name, email: row.email, role: row.role, expiresAt: row.expires_at });
  }

  const acceptMatch = pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{16,128})\/accept$/);
  if (acceptMatch && method === 'POST') {
    if (tooMany(`invite|${clientIp(req)}`, 5, 60 * 60 * 1000)) {
      return json(res, 429, { error: 'Too many attempts. Try again later.' });
    }
    const body = await readJson(req);
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(body?.password || '');
    if (!name) return json(res, 400, { error: 'Enter your name' });
    if (!emailOk(email)) return json(res, 400, { error: 'Enter a valid email address' });
    if (password.length < 10 || !/[0-9\W]/.test(password)) {
      return json(res, 400, { error: 'Use at least 10 characters, including a number or symbol' });
    }

    const tokenHash = sha256(acceptMatch[1]);
    const invite = db.prepare('select * from invites where token_hash = ?').get(tokenHash);
    if (!invite) return json(res, 404, { error: 'This invite link is not valid' });
    if (invite.used_at) return json(res, 410, { error: 'This invite has already been used' });
    if (invite.expires_at <= now()) return json(res, 410, { error: 'This invite has expired' });
    if (invite.email && invite.email !== email) {
      return json(res, 400, { error: `This invite is for ${invite.email}` });
    }
    if (db.prepare('select 1 from users where email = ?').get(email)) {
      return json(res, 409, { error: 'An account with this email already exists. Sign in instead.' });
    }

    let user;
    try {
      user = createUser(email, name, password, invite.role);
    } catch (err) {
      return json(res, err.status || 500, { error: err.message });
    }
    // Links sent to a specific address are single-use; a generic link can add several people.
    if (invite.email) db.prepare('update invites set used_at = ?, used_by = ? where token_hash = ?').run(now(), user.id, tokenHash);

    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    db.prepare('insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)').run(
      sha256(token),
      user.id,
      t,
      t + SESSION_DAYS * 86400 * 1000,
    );
    db.prepare('update users set last_login_at = ? where id = ?').run(t, user.id);
    setSessionCookie(req, res, token);
    return json(res, 201, { user: { ...publicUser(user), role: invite.role } });
  }

  if (pathname === '/api/workspace' && method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    const ws = getWorkspace();
    return json(res, 200, {
      id: ws.id,
      name: ws.name,
      revision: ws.revision,
      updatedAt: ws.updated_at,
      doc: JSON.parse(ws.doc),
      role: roleOf(user.id),
    });
  }

  if (pathname === '/api/workspace' && method === 'PUT') {
    const user = requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-origin request rejected' });
    const role = roleOf(user.id);
    if (!role) return json(res, 403, { error: 'You are not a member of this workspace' });
    if (role === 'viewer') return json(res, 403, { error: 'Your account has read-only access' });

    const body = await readJson(req);
    const revision = Number(body?.revision);
    const doc = body?.doc;
    if (!Number.isInteger(revision) || revision < 1) return json(res, 400, { error: 'Missing revision' });
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return json(res, 400, { error: 'Missing workspace document' });
    if (JSON.stringify(doc).length > MAX_BODY) return json(res, 413, { error: 'Workspace document is too large' });

    db.exec('begin immediate');
    try {
      const ws = db.prepare('select revision from workspaces where id = ?').get(WS_ID);
      if (!ws) {
        db.exec('rollback');
        return json(res, 404, { error: 'Workspace not found' });
      }
      if (ws.revision !== revision) {
        db.exec('rollback');
        return json(res, 409, { error: 'Workspace changed elsewhere', revision: ws.revision });
      }
      const t = now();
      db.prepare('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?').run(JSON.stringify(doc), t, WS_ID);
      db.exec('commit');
      return json(res, 200, { revision: revision + 1, updatedAt: t });
    } catch (err) {
      db.exec('rollback');
      throw err;
    }
  }

  return json(res, 404, { error: 'Not found' });
}

/* ------------------------------- static -------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt']);
const gzipCache = new Map();

function securityHeaders(req) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  };
  if (proto(req) === 'https') headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

function notFound(res) {
  const body = 'Not found';
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendFile(req, res, file, stat) {
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = securityHeaders(req);

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl(file) });
    return res.end();
  }

  let body = fs.readFileSync(file);
  headers['Content-Type'] = MIME[ext] || 'application/octet-stream';
  headers['ETag'] = etag;
  headers['Cache-Control'] = cacheControl(file);
  headers['Accept-Ranges'] = 'none';

  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && body.length > 1024) {
    const key = `${file}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
    let gz = gzipCache.get(key);
    if (!gz) {
      gz = zlib.gzipSync(body, { level: 6 });
      if (gzipCache.size > 64) gzipCache.clear();
      gzipCache.set(key, gz);
    }
    body = gz;
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }

  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function cacheControl(file) {
  if (file.includes(`${path.sep}assets${path.sep}`)) return 'public, max-age=31536000, immutable';
  if (path.basename(file) === 'index.html' || path.basename(file) === 'sw.js') return 'no-cache';
  return 'public, max-age=3600';
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return notFound(res);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, `.${rel}`);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return notFound(res);

  let stat = null;
  try {
    stat = fs.statSync(file);
  } catch {
    /* fall through to SPA fallback */
  }

  if (stat?.isFile()) return sendFile(req, res, file, stat);

  // Hash routes don't need this, but it keeps deep links and bookmarks working.
  if (!path.extname(rel)) {
    const index = path.join(ROOT, 'index.html');
    try {
      return sendFile(req, res, index, fs.statSync(index));
    } catch {
      /* no build */
    }
  }
  return notFound(res);
}

/* ------------------------------- server -------------------------------- */
const server = http.createServer(async (req, res) => {
  const started = now();
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return notFound(res);
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      res.on('finish', () => {
        if (url.pathname !== '/api/health') console.log(`${req.method} ${url.pathname} ${res.statusCode} ${now() - started}ms`);
      });
    } else {
      serveStatic(req, res, url);
    }
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    if (!res.headersSent) json(res, status, { error: status >= 500 ? 'Internal server error' : err.message });
    else res.end();
  }
});

function backupCli(target) {
  const dest = path.resolve(target || path.join(DATA_DIR, `gr8r-${new Date().toISOString().replace(/[:.]/g, '-')}.db`));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  db.exec('pragma wal_checkpoint(truncate)');
  db.exec(`vacuum into '${dest.replaceAll("'", "''")}'`);
  console.log(dest);
  db.close();
}

function addUserCli(args) {
  const email = args[0];
  const name = args[1];
  if (!email) {
    console.error('usage: node server.js --add-user <email> [name]');
    process.exit(1);
  }
  ensureWorkspace();
  const password = process.env.USER_PASSWORD || crypto.randomBytes(9).toString('base64url');
  try {
    const user = createUser(email, name, password, 'member');
    console.log(`created ${user.email}`);
    if (!process.env.USER_PASSWORD) console.log(`password: ${password}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
  db.close();
}

function setPasswordCli(args) {
  const email = String(args[0] || '')
    .trim()
    .toLowerCase();
  if (!email) {
    console.error('usage: node server.js --set-password <email>');
    process.exit(1);
  }
  const row = db.prepare('select id from users where email = ?').get(email);
  if (!row) {
    console.error(`no account for ${email}`);
    process.exit(1);
  }
  const password = process.env.USER_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('update users set password_hash = ? where id = ?').run(hashPassword(password), row.id);
  db.prepare('delete from sessions where user_id = ?').run(row.id);
  console.log(`password updated for ${email} (existing sessions revoked)`);
  if (!process.env.USER_PASSWORD) console.log(`password: ${password}`);
  db.close();
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--add-user') return addUserCli(args.slice(1));
  if (args[0] === '--set-password') return setPasswordCli(args.slice(1));
  if (args[0] === '--backup') return backupCli(args[1]);

  bootstrap();
  db.prepare('delete from sessions where expires_at <= ?').run(now());
  setInterval(() => db.prepare('delete from sessions where expires_at <= ?').run(now()), 3600_000).unref();

  server.listen(PORT, HOST, () => {
    console.log(`gr8r studio listening on http://${HOST}:${PORT}`);
    console.log(`database: ${DB_PATH}`);
  });

  const shutdown = signal => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
