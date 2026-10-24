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
     WORKSPACE_SLUG         optional slug for a fresh install (defaults to the name)
     APP_URL                public base URL for share/invite links
     ALLOW_SIGNUP=false     let visitors create accounts and workspaces
     SEED_DATA=true         false = start with an empty workspace
     SESSION_DAYS=30
     INVITE_DAYS=7          invite link lifetime
     SECURE_COOKIE=auto     auto | true | false
     TRUST_PROXY=false      opt-in: read X-Forwarded-* (set true behind Traefik)
     MAX_BODY_BYTES=8388608
     SMTP_HOST              optional; enables automatic invite emails
     SMTP_PORT              587 (STARTTLS) or 465 (implicit TLS)
     SMTP_SECURE            true | false; inferred from the port when unset
     SMTP_USER/SMTP_PASS    optional SMTP AUTH credentials
     SMTP_REQUIRE_TLS       require TLS; default true
     MAIL_FROM              sender address (required with SMTP_HOST)
     MAIL_FROM_NAME         sender display name
     MAIL_REPLY_TO          optional Reply-To address

   CLI:
     node server.js --add-user <email> [name] [workspace-slug]  (USER_PASSWORD env or generated)
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
import { createMailer } from './mailer.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.STATIC_DIR || path.join(HERE, 'dist'));
const SEED_FILE = path.join(HERE, 'seed.json');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, 'data'));
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(DATA_DIR, 'gr8r.db'));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
const SEED_DATA = process.env.SEED_DATA !== 'false';
const WORKSPACE_NAME = (process.env.WORKSPACE_NAME || 'Gr8r Studio').trim() || 'Gr8r Studio';
const WORKSPACE_SLUG = String(process.env.WORKSPACE_SLUG || '').trim();
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const INVITE_DAYS = Number(process.env.INVITE_DAYS || 7);
const SECURE_COOKIE = process.env.SECURE_COOKIE || 'auto';
/* Public base URL (no trailing slash). Empty means "use the request host". */
const APP_URL = String(process.env.APP_URL || '')
  .trim()
  .replace(/\/+$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024);
const DEFAULT_WS_ID = 'ws_default';
const COOKIE = 'gr8r_session';
const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Guest' };
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const RESERVED_SLUGS = new Set(['api', 'w', 'join', 'assets', 'static', 'health', 'login', 'signup', 'onboarding', 'settings', 'admin']);
const MAILER = createMailer();
/* Registry codes the interface actually renders (src/core/i18n.js LOCALES). */
const LOCALE_CODES = ['en', 'fr'];

/* ------------------------------- database ------------------------------ */
const SCHEMA = `
  create table if not exists users (
    id            text primary key,
    email         text not null unique collate nocase,
    name          text not null,
    password_hash text not null,
    member_id     text,
    created_at    integer not null,
    last_login_at integer,
    locale        text
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
    primary key (workspace_id, user_id)
  );
  create table if not exists invites (
    token_hash   text primary key,
    email        text,
    role         text not null check (role in ('admin','member','viewer')),
    team         text,
    workspace_id text references workspaces(id) on delete cascade,
    created_by   text not null references users(id) on delete cascade,
    created_at   integer not null,
    expires_at   integer not null,
    used_at      integer,
    used_by      text
  );
  create index if not exists invites_expiry on invites(expires_at);
`;

function ensureColumn(conn, table, name, def) {
  const cols = conn.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
}

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('pragma journal_mode = wal');
  db.exec('pragma foreign_keys = on');
  db.exec('pragma busy_timeout = 5000');
  db.exec('pragma synchronous = normal');
  db.exec(SCHEMA);
  // Additive migration for databases created before multi-workspace support.
  ensureColumn(db, 'workspaces', 'slug', 'text');
  ensureColumn(db, 'workspaces', 'color', 'text');
  ensureColumn(db, 'memberships', 'member_id', 'text');
  ensureColumn(db, 'invites', 'workspace_id', 'text');
  ensureColumn(db, 'users', 'locale', 'text');
  db.exec('create unique index if not exists workspaces_slug_idx on workspaces(slug)');
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

/* --------------------------- tenancy helpers --------------------------- */
function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function sanitizeSlug(value) {
  const slug = slugify(value);
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) ? slug : null;
}

/* Readable slug for a new workspace; appends -2, -3… when taken. */
function uniqueSlug(base, excludeId = null) {
  let root = sanitizeSlug(base) || 'workspace';
  root = root.slice(0, 32).replace(/-+$/g, '');
  let slug = root;
  let n = 2;
  while (db.prepare('select 1 from workspaces where slug = ? collate nocase and id is not ?').get(slug, excludeId)) {
    slug = `${root}-${n++}`;
  }
  return slug;
}

function wsBySlug(slug) {
  return db.prepare('select * from workspaces where slug = ? collate nocase').get(String(slug || '')) || null;
}

function membershipOf(workspaceId, userId) {
  return db.prepare('select * from memberships where workspace_id = ? and user_id = ?').get(workspaceId, userId) || null;
}

function membershipsOf(userId) {
  return db
    .prepare(
      `select w.*, m.role, m.member_id
         from memberships m join workspaces w on w.id = m.workspace_id
        where m.user_id = ?
        order by w.created_at, w.name collate nocase`,
    )
    .all(userId);
}

function workspacePayload(row, membership = null) {
  const color = row.color || '#1D1C1A';
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color,
    c: color,
    role: membership?.role || null,
    memberId: membership?.member_id || null,
  };
}

function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale ?? null,
    workspaces: membershipsOf(user.id).map(row => workspacePayload(row, row)),
  };
}

function firstWorkspace() {
  return db.prepare('select * from workspaces order by created_at, name collate nocase limit 1').get() || null;
}

function hasAdminRole(userId) {
  return !!db.prepare("select 1 from memberships where user_id = ? and role in ('owner','admin') limit 1").get(userId);
}

/* Tenancy metadata is owned by the columns; the document never overrides it. */
function normalizeDoc(doc, meta) {
  const out = doc && typeof doc === 'object' ? doc : {};
  out.data = out.data && typeof out.data === 'object' ? out.data : {};
  out.data.savedViews = Array.isArray(out.data.savedViews) ? out.data.savedViews : [];
  out.data.recentSearches = Array.isArray(out.data.recentSearches) ? out.data.recentSearches : [];
  out.data.ws = { name: meta.name, url: meta.slug, c: meta.color, brand: true };
  out.data.me = null;
  delete out.data.workspaces;
  return out;
}

function projectIsPrivate(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.private === 'boolean') return p.private;
  return p.access === 'private';
}

/* A private project is visible to its access list only. */
function canSeeProject(p, memberId) {
  if (!projectIsPrivate(p)) return true;
  return !!memberId && Array.isArray(p.members) && p.members.includes(memberId);
}

function canManageProject(p, memberId, role) {
  if (role === 'owner' || role === 'admin') return true;
  return !!memberId && p?.lead === memberId;
}

/*
 * Normalises project access in place. The document is the source of truth, but legacy rows and
 * crafted documents can carry strings, missing lists, retired `access` flags or no manager.
 * Private projects always keep a manager and a non-empty access list.
 */
function normalizeProjects(doc) {
  const data = doc?.data;
  if (!data || !Array.isArray(data.projects)) return;
  const profiles = Array.isArray(data.members) ? data.members : [];
  const ownerId = profiles.find(m => String(m?.role || '').toLowerCase() === 'owner')?.id || null;
  for (const p of data.projects) {
    if (!p || typeof p !== 'object') continue;
    if (!Array.isArray(p.members)) p.members = [];
    if (p.lead && !p.members.includes(p.lead)) p.members.push(p.lead);
    if (projectIsPrivate(p)) {
      p.private = true;
      // A private project must always have a manager, otherwise nobody can add members or open it.
      if (!p.lead || !p.members.includes(p.lead)) p.lead = p.members[0] || ownerId || null;
      if (p.lead && !p.members.includes(p.lead)) p.members.push(p.lead);
      if (!p.members.length && ownerId) {
        p.members.push(ownerId);
        p.lead = ownerId;
      }
      // No workspace member at all: leave it accessible rather than sealed forever.
      if (!p.members.length) p.private = false;
    } else {
      p.private = false;
    }
    if (p.perms && typeof p.perms !== 'object') delete p.perms;
    delete p.access;
  }
}

function hiddenProjectIds(doc, memberId) {
  const seen = new Set();
  for (const p of doc?.data?.projects || []) {
    if (p?.id && !canSeeProject(p, memberId)) seen.add(p.id);
  }
  return seen;
}

function hiddenTaskIds(doc, hiddenProjects) {
  const seen = new Set();
  for (const t of doc?.data?.tasks || []) if (t?.id && hiddenProjects.has(t.project)) seen.add(t.id);
  return seen;
}

/* Drop hidden project ids from a filter list; remove a project filter left empty. */
function scrubProjectFilters(filters, hiddenProjects) {
  if (!Array.isArray(filters)) return filters;
  return filters
    .map(f => {
      if (!f || f.f !== 'project' || !Array.isArray(f.v)) return f;
      const v = f.v.filter(id => !hiddenProjects.has(id));
      return v.length ? { ...f, v } : null;
    })
    .filter(Boolean);
}

/* Keep view-state keys and project filters for hidden projects out of the served document. */
function redactViews(views, hiddenProjects, hiddenViews) {
  if (!views || typeof views !== 'object') return views;
  for (const [key, value] of Object.entries(views)) {
    const projectId = key.startsWith('p:') ? key.slice(2) : null;
    const viewId = key.startsWith('sv:') ? key.slice(3) : null;
    if ((projectId && hiddenProjects.has(projectId)) || (viewId && hiddenViews.has(viewId))) {
      delete views[key];
      continue;
    }
    if (!value || typeof value !== 'object' || !Array.isArray(value.filters)) continue;
    value.filters = scrubProjectFilters(value.filters, hiddenProjects);
  }
  return views;
}

/* Names and keys of the projects this caller must not see. */
function hiddenProjectTerms(doc, hiddenProjects) {
  const terms = [];
  for (const p of doc?.data?.projects || []) {
    if (!p?.id || !hiddenProjects.has(p.id)) continue;
    for (const value of [p.name, p.key]) {
      if (typeof value === 'string' && value.trim()) terms.push(value.trim().toLowerCase());
    }
  }
  return terms;
}

/* A free-text term that names a project the caller cannot see. Non-strings never match. */
const referencesHidden = (term, hiddenTerms) => typeof term === 'string' && hiddenTerms.some(name => term.toLowerCase().includes(name));

/*
 * Merge workspace-wide recent searches. They are free text shared by the workspace, so a
 * caller who cannot see every project must not be able to erase or rewrite the stored
 * history, and a term that names a hidden project never enters or leaves their document.
 */
function mergeRecentSearches(storedList, incomingList, hiddenTerms, keepStored) {
  const stored = Array.isArray(storedList) ? storedList : [];
  const incoming = Array.isArray(incomingList) ? incomingList : [];
  const out = [];
  for (const term of incoming) {
    if (typeof term !== 'string' || referencesHidden(term, hiddenTerms) || out.includes(term)) continue;
    out.push(term);
  }
  stored.forEach((term, index) => {
    if (typeof term !== 'string' || out.includes(term)) return;
    if (!keepStored && !referencesHidden(term, hiddenTerms)) return;
    out.splice(Math.min(index, out.length), 0, term);
  });
  return out.slice(0, 5);
}

function redactDoc(doc, memberId) {
  const data = doc?.data;
  if (!data) return doc;
  const hiddenProjects = hiddenProjectIds(doc, memberId);
  if (!hiddenProjects.size) return doc;
  const hiddenTasks = hiddenTaskIds(doc, hiddenProjects);
  const hiddenViews = new Set((data.savedViews || []).filter(v => v?.id && hiddenProjects.has(v.project)).map(v => v.id));
  const hiddenTerms = hiddenProjectTerms(doc, hiddenProjects);
  const drop = list => (Array.isArray(list) ? list.filter(x => x && !hiddenProjects.has(x.project)) : list);
  data.projects = (data.projects || []).filter(p => !hiddenProjects.has(p.id));
  data.projOrder = Array.isArray(data.projOrder) ? data.projOrder.filter(id => !hiddenProjects.has(id)) : data.projOrder;
  data.tasks = (data.tasks || []).filter(t => !hiddenProjects.has(t.project));
  data.comments = Array.isArray(data.comments) ? data.comments.filter(c => !hiddenTasks.has(c.task)) : data.comments;
  data.files = Array.isArray(data.files) ? data.files.filter(f => !hiddenProjects.has(f.project) && !hiddenTasks.has(f.task)) : data.files;
  data.activity = Array.isArray(data.activity) ? data.activity.filter(a => !hiddenProjects.has(a.project) && !hiddenTasks.has(a.task)) : data.activity;
  data.notifs = Array.isArray(data.notifs) ? data.notifs.filter(n => !hiddenProjects.has(n.project) && !hiddenTasks.has(n.task)) : data.notifs;
  data.events = drop(data.events);
  data.savedViews = (data.savedViews || []).filter(v => !hiddenProjects.has(v.project));
  for (const view of data.savedViews) {
    if (view && Array.isArray(view.filters)) view.filters = scrubProjectFilters(view.filters, hiddenProjects);
  }
  if (Array.isArray(data.recentSearches)) data.recentSearches = data.recentSearches.filter(term => !referencesHidden(term, hiddenTerms));
  redactViews(doc.views, hiddenProjects, hiddenViews);
  return doc;
}

/* Merge a redacted client document with the stored copy, restoring hidden rows. */
function mergeList(storedList, incomingList, reserved) {
  const stored = Array.isArray(storedList) ? storedList : [];
  const incoming = Array.isArray(incomingList) ? incomingList : [];
  const out = [];
  const seen = new Set();
  for (const row of incoming) {
    if (!row?.id || reserved.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  const held = [];
  stored.forEach((row, index) => {
    if (row?.id && reserved.has(row.id)) held.push([index, row]);
  });
  for (const [index, row] of held) out.splice(Math.min(index, out.length), 0, row);
  return out;
}

function mergeIds(storedList, incomingList, reserved) {
  const stored = Array.isArray(storedList) ? storedList : [];
  const incoming = Array.isArray(incomingList) ? incomingList : [];
  const out = [];
  const seen = new Set();
  for (const id of incoming) {
    if (!id || reserved.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  stored.forEach((id, index) => {
    if (id && reserved.has(id)) out.splice(Math.min(index, out.length), 0, id);
  });
  return out;
}

function mergeClientDoc(incoming, stored, membership) {
  const next = incoming && typeof incoming === 'object' ? JSON.parse(JSON.stringify(incoming)) : {};
  next.data = next.data && typeof next.data === 'object' ? next.data : {};
  normalizeProjects(stored);
  normalizeProjects(next);
  const memberId = membership?.member_id || null;
  const role = membership?.role || 'member';
  const hiddenProjects = hiddenProjectIds(stored, memberId);
  const storedData = stored?.data || {};
  const nextData = next.data;

  // Tasks reserved by a hidden project, whether they are stored there or being moved there.
  const reservedTasks = hiddenTaskIds(stored, hiddenProjects);
  for (const t of nextData.tasks || []) if (t?.id && hiddenProjects.has(t.project)) reservedTasks.add(t.id);

  nextData.projects = mergeList(storedData.projects, nextData.projects, hiddenProjects);
  const storedProjects = new Map((storedData.projects || []).map(p => [p.id, p]));
  for (const p of nextData.projects) {
    if (!p?.id) continue;
    const prev = storedProjects.get(p.id);
    if (prev && !canManageProject(prev, memberId, role)) {
      // Access fields belong to a manager even when the project is visible.
      p.private = prev.private;
      p.members = prev.members;
      p.perms = prev.perms;
      p.lead = prev.lead;
    }
    const wasPrivate = projectIsPrivate(prev);
    if (prev && projectIsPrivate(p) && !wasPrivate && memberId && !p.members.includes(memberId)) {
      // Whoever restricts an existing project keeps access to it, even if they were not listed.
      p.members.push(memberId);
    }
  }
  nextData.projOrder = mergeIds(storedData.projOrder, nextData.projOrder, hiddenProjects);

  const reservedDependants = (storedList, incomingList, isHidden) => {
    const ids = new Set();
    for (const row of storedList || []) if (row?.id && isHidden(row)) ids.add(row.id);
    for (const row of incomingList || []) if (row?.id && isHidden(row)) ids.add(row.id);
    return ids;
  };
  const taskHidden = t => hiddenProjects.has(t?.project) || reservedTasks.has(t?.id);
  nextData.tasks = mergeList(storedData.tasks, nextData.tasks, reservedDependants(storedData.tasks, nextData.tasks, taskHidden));

  const commentHidden = c => reservedTasks.has(c?.task);
  nextData.comments = mergeList(storedData.comments, nextData.comments, reservedDependants(storedData.comments, nextData.comments, commentHidden));
  const fileHidden = f => hiddenProjects.has(f?.project) || reservedTasks.has(f?.task);
  nextData.files = mergeList(storedData.files, nextData.files, reservedDependants(storedData.files, nextData.files, fileHidden));
  const activityHidden = a => hiddenProjects.has(a?.project) || reservedTasks.has(a?.task);
  nextData.activity = mergeList(storedData.activity, nextData.activity, reservedDependants(storedData.activity, nextData.activity, activityHidden));
  const notifHidden = n => hiddenProjects.has(n?.project) || reservedTasks.has(n?.task);
  nextData.notifs = mergeList(storedData.notifs, nextData.notifs, reservedDependants(storedData.notifs, nextData.notifs, notifHidden));
  const eventHidden = e => hiddenProjects.has(e?.project);
  nextData.events = mergeList(storedData.events, nextData.events, reservedDependants(storedData.events, nextData.events, eventHidden));
  const savedHidden = v => hiddenProjects.has(v?.project);
  nextData.savedViews = mergeList(storedData.savedViews, nextData.savedViews, reservedDependants(storedData.savedViews, nextData.savedViews, savedHidden));
  for (const view of nextData.savedViews) {
    if (view && Array.isArray(view.filters)) view.filters = scrubProjectFilters(view.filters, hiddenProjects);
  }
  // Recent searches are workspace-wide free text: a caller who cannot see every project
  // keeps the stored history, so a redacted save cannot erase or rewrite it.
  nextData.recentSearches = mergeRecentSearches(
    storedData.recentSearches,
    nextData.recentSearches,
    hiddenProjectTerms(stored, hiddenProjects),
    hiddenProjects.size > 0,
  );

  // Per-user view state: hidden keys stay from storage, hidden project ids leave filter values.
  const hiddenViewIds = new Set((storedData.savedViews || []).filter(v => v?.id && hiddenProjects.has(v.project)).map(v => v.id));
  const mergedViews = {};
  for (const [key, value] of Object.entries(stored?.views || {})) {
    const projectId = key.startsWith('p:') ? key.slice(2) : null;
    const viewId = key.startsWith('sv:') ? key.slice(3) : null;
    if ((projectId && hiddenProjects.has(projectId)) || (viewId && hiddenViewIds.has(viewId))) mergedViews[key] = value;
  }
  for (const [key, value] of Object.entries(next.views || {})) {
    const projectId = key.startsWith('p:') ? key.slice(2) : null;
    const viewId = key.startsWith('sv:') ? key.slice(3) : null;
    if ((projectId && hiddenProjects.has(projectId)) || (viewId && hiddenViewIds.has(viewId))) continue;
    if (value && typeof value === 'object' && Array.isArray(value.filters)) {
      value.filters = scrubProjectFilters(value.filters, hiddenProjects);
    }
    mergedViews[key] = value;
  }
  next.views = mergedViews;
  return next;
}

function docForClient(doc, ws, membership) {
  const out = normalizeDoc(JSON.parse(JSON.stringify(doc || {})), { name: ws.name, slug: ws.slug, color: ws.color || '#1D1C1A' });
  normalizeProjects(out);
  syncProfiles(out, ws.id);
  return membership ? redactDoc(out, membership.member_id) : out;
}

function docFromClient(incoming, stored, ws, role, membership) {
  const next = mergeClientDoc(incoming, stored, membership);
  delete next.data.workspaces;
  next.data.me = null;
  next.data.ws = { name: ws.name, url: ws.slug, c: ws.color || '#1D1C1A', brand: true };
  // Membership edits stay with the roles that are allowed to make them.
  const storedMembers = stored?.data?.members || [];
  if (ROLE_RANK[role] < ROLE_RANK.admin) {
    next.data.members = storedMembers;
  } else {
    // Access fields of an account-backed profile belong to the membership, not the document.
    // A profile claiming a userId that has no membership is dropped: only the server adds accounts.
    const official = new Map(storedMembers.filter(m => m.userId).map(m => [m.userId, m]));
    const incomingMembers = Array.isArray(next.data.members) ? next.data.members : storedMembers;
    next.data.members = incomingMembers
      .map(m => {
        if (!m?.userId) return m;
        const prev = official.get(m.userId);
        return prev ? { ...m, id: prev.id, userId: prev.userId, email: prev.email, role: prev.role, status: prev.status } : null;
      })
      .filter(Boolean);
    // A member the client's copy does not know about — they joined in another
    // session — keeps the stored profile, so a stale document cannot drop them.
    const kept = new Set(next.data.members.map(m => m?.userId).filter(Boolean));
    for (const m of storedMembers) {
      if (m?.userId && !kept.has(m.userId)) next.data.members.push(m);
    }
  }
  // The plan and invoices fields are gone; a stale client's copy must never resurrect them.
  delete next.data.plan;
  delete next.data.invoices;
  normalizeProjects(next);
  return next;
}

/* --------------------------- membership helpers ------------------------- */
function roleRank(role) {
  return ROLE_RANK[role] || 0;
}

/* Memberships joined with the account, in the order people joined. */
function membersOf(workspaceId) {
  return db
    .prepare(
      `select m.role, m.member_id, u.id as user_id, u.email, u.name, u.last_login_at, u.created_at
         from memberships m join users u on u.id = m.user_id
        where m.workspace_id = ?
        order by u.created_at, u.email collate nocase`,
    )
    .all(workspaceId);
}

function memberPayload(row, doc, selfId) {
  const profile = (doc?.data?.members || []).find(p => (row.user_id && p.userId === row.user_id) || (row.member_id && p.id === row.member_id));
  return {
    userId: row.user_id,
    memberId: row.member_id || profile?.id || null,
    name: profile?.name || row.name,
    email: row.email,
    role: row.role,
    roleLabel: ROLE_LABEL[row.role] || row.role,
    team: profile?.team ?? null,
    title: profile?.title || '',
    status: profile?.status || 'active',
    lastLoginAt: row.last_login_at || null,
    joinedAt: row.created_at || null,
    isSelf: row.user_id === selfId,
  };
}

/* Pending invites; the hash is a safe identifier because the token is not derivable from it. */
function invitesOf(workspaceId) {
  return db
    .prepare(
      `select token_hash, email, role, team, created_at, expires_at
         from invites
        where workspace_id = ? and used_at is null and expires_at > ?
        order by created_at desc`,
    )
    .all(workspaceId, now())
    .map(r => ({
      id: r.token_hash,
      email: r.email,
      role: r.role,
      roleLabel: ROLE_LABEL[r.role] || r.role,
      team: r.team,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
}

function ownerCount(workspaceId, excludeUserId = null) {
  return db.prepare("select count(*) as n from memberships where workspace_id = ? and role = 'owner' and user_id is not ?").get(workspaceId, excludeUserId).n;
}

/* Overlay the authority fields of every profile that belongs to an account,
   and add the profile of a member that has none yet. The membership table is
   the source of truth: a member who joined in another session is repaired
   here, so joining never has to invalidate that session's revision. */
function syncProfiles(doc, workspaceId) {
  if (!doc?.data || !Array.isArray(doc.data.members)) return;
  const rows = db
    .prepare(
      `select m.user_id, m.role, m.member_id, u.name, u.email
         from memberships m join users u on u.id = m.user_id
        where m.workspace_id = ?`,
    )
    .all(workspaceId);
  const byUser = new Map(rows.map(r => [r.user_id, r]));
  for (const profile of doc.data.members) {
    if (!profile?.userId) continue;
    const row = byUser.get(profile.userId);
    if (!row) continue;
    if (row.member_id && profile.id !== row.member_id) profile.id = row.member_id;
    profile.role = ROLE_LABEL[row.role] || profile.role;
    if (profile.status === 'invited') profile.status = 'active';
    // The document stores minutes since last activity; older rows stored a timestamp.
    if (typeof profile.last === 'number' && profile.last > 1e11) profile.last = Math.max(0, Math.round((now() - profile.last) / 60000));
  }
  /* A member without a profile in the document: the membership row says they
     belong here, so the roster is completed instead of being left to a write. */
  const known = new Set(doc.data.members.map(m => m?.userId).filter(Boolean));
  for (const row of rows) {
    if (known.has(row.user_id)) continue;
    doc.data.members.push(memberProfile(row, doc.data.members.length));
  }
}

/* Remove someone from the document: profiles, assignments and project rosters. */
function stripMember(doc, memberId, userId = null) {
  const d = doc?.data;
  if (!d) return;
  normalizeProjects(doc);
  const ids = new Set(
    [memberId, ...(d.members || []).filter(m => (userId && m.userId === userId) || (memberId && m.id === memberId)).map(m => m.id)].filter(Boolean),
  );
  if (!ids.size && !userId) return;
  const hit = v => !!v && ids.has(v);
  d.members = (d.members || []).filter(m => !(userId && m.userId === userId) && !hit(m.id));
  d.tasks = (d.tasks || []).map(t => {
    const next = hit(t.assignee) ? { ...t, assignee: null } : t;
    if (Array.isArray(next.subtasks) && next.subtasks.some(s => hit(s?.assignee))) {
      next.subtasks = next.subtasks.map(s => (hit(s?.assignee) ? { ...s, assignee: null } : s));
    }
    return next;
  });
  d.projects = (d.projects || []).map(p => {
    const members = Array.isArray(p.members) ? p.members.filter(x => !hit(x)) : p.members;
    const perms = p.perms && typeof p.perms === 'object' ? Object.fromEntries(Object.entries(p.perms).filter(([k]) => !hit(k))) : p.perms;
    let lead = hit(p.lead) ? null : p.lead;
    if (projectIsPrivate(p)) {
      if (!Array.isArray(members) || !members.length) {
        throw httpError(409, 'Promote someone before removing the last member of a private project', 'lastPrivateMember');
      }
      if (!lead || !members.includes(lead)) lead = members[0];
    }
    return { ...p, lead, members, perms };
  });
  d.teams = (d.teams || []).map(t => (Array.isArray(t.members) ? { ...t, members: t.members.filter(x => !hit(x)) } : t));
}

/* Read-modify-write the workspace document inside the caller's transaction. */
function updateDoc(workspaceId, edit) {
  const row = db.prepare('select doc from workspaces where id = ?').get(workspaceId);
  if (!row) throw httpError(404, 'Workspace not found', 'workspaceNotFound');
  const doc = JSON.parse(row.doc);
  edit(doc);
  db.prepare('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?').run(JSON.stringify(doc), now(), workspaceId);
  return doc;
}

/* The workspace revision after a server-side document change. Every endpoint
   that edits the document must return it, or the client keeps a stale
   revision and its next write is rejected with 409. */
function wsRevision(workspaceId) {
  const row = db.prepare('select revision from workspaces where id = ?').get(workspaceId);
  return row ? row.revision : 0;
}

function transaction(fn) {
  db.exec('begin immediate');
  try {
    const out = fn();
    db.exec('commit');
    return out;
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}

function emptyDoc(meta) {
  return normalizeDoc(
    {
      data: {
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
    },
    meta,
  );
}

function seedDoc() {
  if (!SEED_DATA) return null;
  try {
    return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/* Create the default workspace and, when the database is empty, the first admin. */
function ensureWorkspace() {
  if (db.prepare('select count(*) as n from workspaces').get().n > 0) return;
  const name = WORKSPACE_NAME;
  const slug = uniqueSlug(WORKSPACE_SLUG || name);
  const color = '#1D1C1A';
  const meta = { name, slug, color };
  const doc = normalizeDoc(seedDoc() || emptyDoc(meta), meta);
  const t = now();
  db.prepare('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
    DEFAULT_WS_ID,
    slug,
    name,
    color,
    JSON.stringify(doc),
    1,
    t,
    t,
  );
}

function ensureAdmin({ quiet = false } = {}) {
  if (db.prepare('select count(*) as n from users').get().n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim();
  const name = process.env.ADMIN_NAME || 'Admin';
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }
  const user = createUser(email, name, password);
  addMembership(firstWorkspace(), user, 'owner');
  if (!quiet) {
    console.log(`  bootstrap account: ${email}`);
    if (generated) console.log(`  generated password: ${password}\n  (set ADMIN_PASSWORD and recreate the volume to choose your own)`);
  }
}

function bootstrap(opts) {
  ensureWorkspace();
  migrateTenancy();
  ensureAdmin(opts);
}

/*
 * In-place migration for databases created before multi-workspace support:
 * backfills slugs/colors, scopes legacy invites, links member profiles to
 * accounts, and drops the demo-only `data.workspaces` switcher from the document.
 */
function migrateTenancy() {
  const rows = db.prepare('select * from workspaces').all();
  if (rows.some(row => !row.slug)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(DATA_DIR, `gr8r-premultitenant-${stamp}.db`);
    try {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      db.exec('pragma wal_checkpoint(truncate)');
      db.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
      console.log(`  pre-migration backup: ${backup}`);
    } catch (err) {
      console.error(`  pre-migration backup failed: ${err.message}`);
    }
    for (const row of rows) {
      if (row.slug) continue;
      let doc = {};
      try {
        doc = JSON.parse(row.doc);
      } catch {
        /* unreadable document: fall back to the workspace row */
      }
      const meta = doc?.data?.ws || {};
      const name = String(meta.name || row.name || '').trim() || 'Workspace';
      const slug = uniqueSlug(meta.url || name, row.id);
      const color = /^#[0-9a-f]{6}$/i.test(meta.c || '') ? meta.c : '#1D1C1A';
      db.prepare('update workspaces set slug = ?, name = ?, color = ? where id = ?').run(slug, name, color, row.id);
    }
  }
  backfillInvites();
  backfillMemberships();
}

/*
 * Invites created before workspaces were addressable belong to the workspace that
 * existed then. Scoped invites always carry an id, so later boots change nothing.
 */
function backfillInvites() {
  const ws = firstWorkspace();
  if (!ws) return;
  db.prepare('update invites set workspace_id = ? where workspace_id is null').run(ws.id);
}

function backfillMemberships() {
  for (const ws of db.prepare('select * from workspaces').all()) {
    let doc;
    try {
      doc = JSON.parse(ws.doc);
    } catch {
      continue;
    }
    if (!doc?.data) continue;
    const before = JSON.stringify(doc);
    for (const m of db.prepare('select m.*, u.email, u.name from memberships m join users u on u.id = m.user_id where m.workspace_id = ?').all(ws.id)) {
      const memberId = ensureMember(doc, { id: m.user_id, email: m.email, name: m.name }, m.role, ws.id);
      if (memberId && memberId !== m.member_id) {
        db.prepare('update memberships set member_id = ? where workspace_id = ? and user_id = ?').run(memberId, ws.id, m.user_id);
      }
    }
    delete doc.data.workspaces;
    doc.data.me = null;
    if (JSON.stringify(doc) !== before) {
      /* The backfill only repairs server-owned state — the legacy profile
         links and the demo switcher — so it must not move the revision: a
         session that is open across the restart would lose its next write. */
      db.prepare('update workspaces set doc = ?, updated_at = ? where id = ?').run(JSON.stringify(doc), now(), ws.id);
    }
  }
}

/* The document profile of an account-backed member. */
function memberProfile(row, index = 0) {
  return {
    id: row.member_id || `m_${row.user_id.slice(0, 8)}`,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: ROLE_LABEL[row.role] || 'Member',
    team: null,
    title: '',
    c: ['#5A67D8', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index % 6],
    status: 'active',
    last: 0,
    tz: '',
  };
}

/* The document id of an account-backed member. The membership table holds the
   ids that are already taken, so a new member never collides with one. */
function memberIdFor(workspaceId, user) {
  const row = db.prepare('select member_id from memberships where workspace_id = ? and user_id = ?').get(workspaceId, user.id);
  if (row?.member_id) return row.member_id;
  const base = `m_${user.id.slice(0, 8)}`;
  const taken = db.prepare('select 1 from memberships where workspace_id = ? and member_id = ?').get(workspaceId, base);
  return taken ? `m_${user.id}` : base;
}

function ensureMember(doc, user, role = 'member', workspaceId = null) {
  const members = doc?.data?.members;
  if (!Array.isArray(members)) return null;
  const email = (user.email || '').toLowerCase();
  const match = members.find(m => (m.userId && m.userId === user.id) || (email && (m.email || '').toLowerCase() === email));
  if (match) {
    if (!match.id) match.id = `m_${user.id.slice(0, 8)}`;
    match.userId = user.id;
    if (user.name && (!match.name || match.name === 'Member')) match.name = user.name;
    if (match.status === 'invited') match.status = 'active';
    match.role = ROLE_LABEL[role] || match.role;
    return match.id;
  }
  const id = workspaceId ? memberIdFor(workspaceId, user) : `m_${user.id.slice(0, 8)}`;
  members.push(memberProfile({ user_id: user.id, member_id: id, role, name: user.name, email: user.email }, members.length));
  return id;
}

function addMembership(ws, user, role) {
  if (!ws) throw httpError(500, 'No workspace available', 'noWorkspaceReady');
  /* The membership row is the source of truth. The document profile is a
     mirror that the read path repairs, so joining a workspace never moves the
     document's revision and never invalidates another session's write. */
  const memberId = memberIdFor(ws.id, user);
  db.exec('begin immediate');
  try {
    db.prepare(
      `insert into memberships (workspace_id, user_id, role, member_id) values (?,?,?,?)
       on conflict(workspace_id, user_id) do update set role = excluded.role, member_id = excluded.member_id`,
    ).run(ws.id, user.id, role, memberId);
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
  return memberId;
}

function createUser(email, name, password) {
  const clean = email.trim().toLowerCase();
  if (!emailOk(clean)) throw httpError(400, 'Enter a valid email address', 'enterValidEmail');
  if (String(password).length < 10) throw httpError(400, 'Use at least 10 characters', 'passwordTooShort');
  if (db.prepare('select 1 from users where email = ?').get(clean))
    throw httpError(409, 'An account with that email already exists', 'accountExists');

  const id = uid();
  const cleanName = (name || '').trim() || clean.split('@')[0];
  try {
    db.prepare('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)').run(id, clean, cleanName, hashPassword(password), now());
  } catch (err) {
    /* WR-06: a signup race can pass the pre-check and hit the UNIQUE constraint.
       Map it to the same 409 accountExists as the pre-check; any other SQL error
       rethrows to the catch-all 500 (D-03 — no code). */
    if (/UNIQUE|users\.email/i.test(String(err?.message || ''))) {
      throw httpError(409, 'An account with that email already exists', 'accountExists');
    }
    throw err;
  }
  return { id, email: clean, name: cleanName };
}

/* Create a workspace and make its creator the owner. */
function createWorkspace(name, slugBase, user) {
  const slug = uniqueSlug(slugBase || name);
  const color = ['#1D1C1A', '#5A67D8', '#3B82C4', '#23918A', '#C54B78', '#C48A1E'][db.prepare('select count(*) as n from workspaces').get().n % 6];
  const id = uid();
  const doc = emptyDoc({ name, slug, color });
  const t = now();
  db.prepare('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
    id,
    slug,
    name,
    color,
    JSON.stringify(doc),
    1,
    t,
    t,
  );
  const ws = db.prepare('select * from workspaces where id = ?').get(id);
  addMembership(ws, user, 'owner');
  return wsBySlug(slug);
}

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
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

/* The single error constructor beside json(): every HTTP error payload leaves
   here, so no route builds an error object by hand. `code` is the machine
   identifier the client translates; `message` stays the English string the
   client falls back to when it does not know the code. */
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
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

/* Absolute base for links shown to users: APP_URL when set, else the request host. */
function appBase(req) {
  return APP_URL || publicBase(req);
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
    let value;
    try {
      value = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      continue; // malformed cookie: ignore it, the request is simply unauthenticated
    }
    out[part.slice(0, i).trim()] = value;
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
    fail(res, 401, 'signInRequired', 'Sign in to continue');
    return null;
  }
  return user;
}

/* Resolve a workspace by slug and enforce a minimum role. Unknown slugs 404. */
function requireWorkspace(req, res, slug, minRole = 'viewer') {
  const user = requireUser(req, res);
  if (!user) return null;
  const ws = wsBySlug(slug);
  const membership = ws ? membershipOf(ws.id, user.id) : null;
  if (!ws || !membership) {
    fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    return null;
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    if (minRole === 'admin') fail(res, 403, 'adminOnly', 'Only workspace admins can do that');
    else fail(res, 403, 'readOnlyAccess', 'Your account has read-only access');
    return null;
  }
  return { user, ws, membership };
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
    let overflow = null;
    const chunks = [];
    req.on('data', chunk => {
      /* WR-05: on overflow, keep draining the request instead of destroying the
         socket — the response is only written once the body is fully consumed,
         so the client actually receives the 413 with its code. */
      if (overflow) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        overflow = httpError(413, 'Request body too large', 'bodyTooLarge');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (overflow) return reject(overflow);
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(httpError(400, 'Invalid JSON body', 'invalidJson'));
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
    return json(res, 200, {
      app: 'gr8r',
      signup: ALLOW_SIGNUP,
      mail: MAILER.enabled,
      url: appBase(req),
      workspaceCreation: ALLOW_SIGNUP ? 'open' : 'admins',
    });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    /* Same origin guard as every other mutation — before the body read AND before the
       throttle, so a cross-origin POST cannot consume the victim IP's attempt budget. */
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(body?.password || '');
    if (!emailOk(email) || !password) return fail(res, 400, 'emailAndPasswordRequired', 'Email and password are required');
    if (tooMany(`${clientIp(req)}|${email}`)) return fail(res, 429, 'tooManyLoginAttempts', 'Too many attempts. Try again in 15 minutes.');

    const row = db.prepare('select * from users where email = ?').get(email);
    const valid = verifyPassword(password, row?.password_hash || DUMMY_HASH) && !!row;
    if (!valid) return fail(res, 401, 'invalidCredentials', 'Email or password is incorrect');

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
    return json(res, 200, { user: userPayload(row) });
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
    return json(res, 200, { user: userPayload(user) });
  }

  if (pathname === '/api/auth/me' && method === 'PATCH') {
    const user = requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    // Only body.locale is read; every other field is ignored (mass-assignment guard).
    const locale = String(body?.locale || '');
    if (!LOCALE_CODES.includes(locale)) return fail(res, 400, 'unknownLocale', 'Unknown locale');
    db.prepare('update users set locale = ? where id = ?').run(locale, user.id);
    const fresh = db.prepare('select * from users where id = ?').get(user.id);
    return json(res, 200, { user: userPayload(fresh) });
  }

  if (pathname === '/api/auth/signup' && method === 'POST') {
    /* Same origin guard as every other mutation — before the body read AND before the
       throttle, so a cross-origin POST cannot consume the victim IP's attempt budget. */
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    if (!ALLOW_SIGNUP) return fail(res, 403, 'signupDisabled', 'Sign-ups are disabled. Ask an admin for an account.');
    if (tooMany(`signup|${clientIp(req)}`, 5, 60 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const name = String(body?.name || '').trim();
    const password = String(body?.password || '');
    if (!name) return fail(res, 400, 'nameRequired', 'Enter your name');
    if (password.length < 10 || !/[0-9\W]/.test(password)) {
      return fail(res, 400, 'passwordTooWeak', 'Use at least 10 characters, including a number or symbol');
    }
    let user;
    try {
      user = createUser(email, name, password);
    } catch (err) {
      return json(res, err.status || 500, { error: err.message, code: err.code });
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
    return json(res, 201, { user: userPayload(user) });
  }

  /* ------------------------------ workspaces ----------------------------- */
  if (pathname === '/api/workspaces' && method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, { workspaces: userPayload(user).workspaces });
  }

  if (pathname === '/api/workspaces' && method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    if (!ALLOW_SIGNUP && !hasAdminRole(user.id)) {
      return fail(res, 403, 'askAdminForWorkspace', 'Ask a workspace administrator to create one for you');
    }
    const body = await readJson(req);
    const name = String(body?.name || '')
      .trim()
      .slice(0, 60);
    if (!name) return fail(res, 400, 'workspaceNameRequired', 'Enter a workspace name');
    let slug = null;
    if (body?.slug) {
      slug = sanitizeSlug(body.slug);
      if (!slug) return fail(res, 400, 'invalidSlug', 'Use 2–40 lowercase letters, numbers, or hyphens');
      if (wsBySlug(slug)) return fail(res, 409, 'slugTaken', 'That URL is already taken', { suggestion: uniqueSlug(slug) });
    }
    const ws = createWorkspace(name, slug, user);
    return json(res, 201, { workspace: workspacePayload(ws, membershipOf(ws.id, user.id)) });
  }

  const wsMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})$/);
  if (wsMatch && method === 'GET') {
    const ctx = requireWorkspace(req, res, wsMatch[1]);
    if (!ctx) return;
    return json(res, 200, {
      ...workspacePayload(ctx.ws, ctx.membership),
      revision: ctx.ws.revision,
      updatedAt: ctx.ws.updated_at,
      doc: docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership),
    });
  }

  if (wsMatch && method === 'PUT') {
    const ctx = requireWorkspace(req, res, wsMatch[1], 'member');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');

    const body = await readJson(req);
    const revision = Number(body?.revision);
    const doc = body?.doc;
    if (!Number.isInteger(revision) || revision < 1) return fail(res, 400, 'missingRevision', 'Missing revision');
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return fail(res, 400, 'missingDocument', 'Missing workspace document');
    if (JSON.stringify(doc).length > MAX_BODY) return fail(res, 413, 'documentTooLarge', 'Workspace document is too large');

    db.exec('begin immediate');
    try {
      const row = db.prepare('select * from workspaces where id = ?').get(ctx.ws.id);
      if (!row) {
        db.exec('rollback');
        return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
      }
      if (row.revision !== revision) {
        db.exec('rollback');
        return fail(res, 409, 'workspaceChanged', 'Workspace changed elsewhere', { revision: row.revision });
      }
      const next = docFromClient(doc, JSON.parse(row.doc), row, ctx.membership.role, ctx.membership);
      const t = now();
      db.prepare('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?').run(JSON.stringify(next), t, row.id);
      db.exec('commit');
      return json(res, 200, { revision: revision + 1, updatedAt: t });
    } catch (err) {
      db.exec('rollback');
      throw err;
    }
  }

  if (wsMatch && method === 'PATCH') {
    const ctx = requireWorkspace(req, res, wsMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    let name = ctx.ws.name;
    let slug = ctx.ws.slug;
    let color = ctx.ws.color || '#1D1C1A';
    if (body?.name !== undefined) {
      name = String(body.name).trim().slice(0, 60);
      if (!name) return fail(res, 400, 'workspaceNameRequired', 'Enter a workspace name');
    }
    if (body?.slug !== undefined && body.slug !== slug) {
      const next = sanitizeSlug(body.slug);
      if (!next) return fail(res, 400, 'invalidSlug', 'Use 2–40 lowercase letters, numbers, or hyphens');
      if (wsBySlug(next)) return fail(res, 409, 'slugTaken', 'That URL is already taken');
      slug = next;
    }
    if (body?.color !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(String(body.color))) return fail(res, 400, 'invalidColor', 'Use a hex color like #1D1C1A');
      color = String(body.color);
    }
    db.prepare('update workspaces set name = ?, slug = ?, color = ?, updated_at = ? where id = ?').run(name, slug, color, now(), ctx.ws.id);
    const ws = db.prepare('select * from workspaces where id = ?').get(ctx.ws.id);
    return json(res, 200, { workspace: workspacePayload(ws, membershipOf(ws.id, ctx.user.id)) });
  }

  if (wsMatch && method === 'DELETE') {
    const ctx = requireWorkspace(req, res, wsMatch[1], 'owner');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    transaction(() => {
      db.prepare('delete from memberships where workspace_id = ?').run(ctx.ws.id);
      db.prepare('delete from invites where workspace_id = ?').run(ctx.ws.id);
      db.prepare('delete from workspaces where id = ?').run(ctx.ws.id);
    });
    return json(res, 200, { deleted: true, nextSlug: membershipsOf(ctx.user.id)[0]?.slug || null });
  }

  /* ------------------------------- members ------------------------------- */
  const wsMembersMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members$/);
  if (wsMembersMatch && method === 'GET') {
    const ctx = requireWorkspace(req, res, wsMembersMatch[1]);
    if (!ctx) return;
    const doc = JSON.parse(ctx.ws.doc);
    return json(res, 200, {
      members: membersOf(ctx.ws.id).map(row => memberPayload(row, doc, ctx.user.id)),
      invites: roleRank(ctx.membership.role) >= ROLE_RANK.admin ? invitesOf(ctx.ws.id) : [],
    });
  }

  const wsLeaveMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/leave$/);
  if (wsLeaveMatch && method === 'POST') {
    const ctx = requireWorkspace(req, res, wsLeaveMatch[1]);
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    if (ctx.membership.role === 'owner' && ownerCount(ctx.ws.id, ctx.user.id) === 0) {
      return fail(res, 409, 'lastOwnerLeaves', 'Promote someone else to owner before you leave');
    }
    transaction(() => {
      db.prepare('delete from memberships where workspace_id = ? and user_id = ?').run(ctx.ws.id, ctx.user.id);
      updateDoc(ctx.ws.id, doc => stripMember(doc, ctx.membership.member_id, ctx.user.id));
    });
    return json(res, 200, { left: true, nextSlug: membershipsOf(ctx.user.id)[0]?.slug || null });
  }

  const wsMemberMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})$/);
  if (wsMemberMatch && (method === 'PATCH' || method === 'DELETE')) {
    const ctx = requireWorkspace(req, res, wsMemberMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const target = db.prepare('select * from users where id = ?').get(wsMemberMatch[2]);
    const row = target ? membershipOf(ctx.ws.id, target.id) : null;
    if (!target || !row) return fail(res, 404, 'notAMember', 'That person is not a member of this workspace');
    if (target.id === ctx.user.id) return fail(res, 409, 'removeSelfViaLeave', 'Use “Leave workspace” to remove yourself');
    const actorRank = roleRank(ctx.membership.role);
    if (actorRank < ROLE_RANK.owner && roleRank(row.role) >= ROLE_RANK.admin) {
      return fail(res, 403, 'ownerManagedRoles', 'Only an owner can manage admins and owners');
    }

    if (method === 'DELETE') {
      if (row.role === 'owner' && ownerCount(ctx.ws.id, target.id) === 0) return fail(res, 409, 'needOwner', 'Every workspace needs an owner');
      transaction(() => {
        db.prepare('delete from memberships where workspace_id = ? and user_id = ?').run(ctx.ws.id, target.id);
        updateDoc(ctx.ws.id, doc => stripMember(doc, row.member_id, target.id));
      });
      return json(res, 200, { removed: true, userId: target.id, revision: wsRevision(ctx.ws.id) });
    }

    const body = await readJson(req);
    const nextRole = body?.role === undefined ? row.role : String(body.role).toLowerCase();
    if (!(nextRole in ROLE_RANK)) return fail(res, 400, 'unknownRole', 'Unknown role');
    if (nextRole !== row.role && nextRole === 'owner' && actorRank < ROLE_RANK.owner) {
      return fail(res, 403, 'ownerTransferOnly', 'Only an owner can transfer ownership');
    }
    if (row.role === 'owner' && nextRole !== 'owner' && ownerCount(ctx.ws.id, target.id) === 0) {
      return fail(res, 409, 'needOwner', 'Every workspace needs an owner');
    }
    const team = body?.team === undefined ? undefined : body.team ? String(body.team).slice(0, 40) : null;
    const title = body?.title === undefined ? undefined : String(body.title).slice(0, 60);
    transaction(() => {
      if (nextRole !== row.role) {
        db.prepare('update memberships set role = ? where workspace_id = ? and user_id = ?').run(nextRole, ctx.ws.id, target.id);
      }
      updateDoc(ctx.ws.id, doc => {
        const memberId = ensureMember(doc, target, nextRole) || row.member_id;
        const profile = (doc.data.members || []).find(m => m.id === memberId || m.userId === target.id);
        if (!profile) return;
        profile.role = ROLE_LABEL[nextRole] || profile.role;
        if (team !== undefined) profile.team = team;
        if (title !== undefined) profile.title = title;
      });
    });
    const doc = JSON.parse(db.prepare('select doc from workspaces where id = ?').get(ctx.ws.id).doc);
    return json(res, 200, {
      revision: wsRevision(ctx.ws.id),
      member: memberPayload(
        {
          role: nextRole,
          member_id: row.member_id,
          user_id: target.id,
          email: target.email,
          name: target.name,
          last_login_at: target.last_login_at,
          created_at: target.created_at,
        },
        doc,
        ctx.user.id,
      ),
    });
  }

  /* ------------------------------- invites ------------------------------- */
  const wsInviteMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/invites$/);
  if (wsInviteMatch && method === 'POST') {
    const ctx = requireWorkspace(req, res, wsInviteMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');

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
    if (emails.length > 20) return fail(res, 400, 'inviteBatchLimit', 'Create at most 20 invites at a time');
    for (const email of emails) if (!emailOk(email)) return fail(res, 400, 'invalidEmail', `Invalid email: ${email}`, { email });

    const t = now();
    const expiresAt = t + INVITE_DAYS * 86400 * 1000;
    const rows = [];
    db.exec('begin immediate');
    try {
      db.prepare('delete from invites where expires_at < ?').run(t);
      for (const email of emails.length ? emails : [null]) {
        if (email) {
          const account = db.prepare('select * from users where email = ?').get(email);
          if (account && membershipOf(ctx.ws.id, account.id)) {
            db.exec('rollback');
            return fail(res, 409, 'alreadyMember', `${email} is already a member of ${ctx.ws.name}`, { email, name: ctx.ws.name });
          }
          // One live invite per address: a fresh link replaces the previous one.
          db.prepare('update invites set used_at = ? where workspace_id = ? and email = ? and used_at is null').run(t, ctx.ws.id, email);
        }
        const token = crypto.randomBytes(24).toString('base64url');
        db.prepare('insert into invites (token_hash, email, role, team, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?,?)').run(
          sha256(token),
          email,
          role,
          team,
          ctx.ws.id,
          ctx.user.id,
          t,
          expiresAt,
        );
        rows.push({ email, role, url: `${appBase(req)}/join/${token}`, expiresAt });
      }
      db.exec('commit');
    } catch (err) {
      db.exec('rollback');
      throw err;
    }

    // Email delivery happens after the invites are committed, so a temporary
    // SMTP failure never loses the links. The client also receives the URL.
    const workspace = ctx.ws;
    const inviter = db.prepare('select name from users where id = ?').get(ctx.user.id);
    const emailRows = rows.filter(row => row.email);
    if (emailRows.length && MAILER.enabled) {
      let cursor = 0;
      const worker = async () => {
        while (cursor < emailRows.length) {
          const row = emailRows[cursor++];
          try {
            await MAILER.sendInvite({
              to: row.email,
              url: row.url,
              workspace: workspace.name,
              inviter: inviter?.name,
              role: row.role,
              expiresAt: row.expiresAt,
            });
            row.sent = true;
          } catch (err) {
            console.error(`invite email to ${row.email} failed: ${err.message}`);
            row.sent = false;
            row.error = 'Email could not be sent. Copy the link instead.';
            row.code = 'emailSendFailed';
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, emailRows.length) }, worker));
    }
    return json(res, 201, { invites: rows });
  }

  if (wsInviteMatch && method === 'GET') {
    const ctx = requireWorkspace(req, res, wsInviteMatch[1], 'admin');
    if (!ctx) return;
    return json(res, 200, { invites: invitesOf(ctx.ws.id) });
  }

  const wsInviteIdMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/invites\/([0-9a-f]{64})$/);
  if (wsInviteIdMatch && method === 'DELETE') {
    const ctx = requireWorkspace(req, res, wsInviteIdMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const row = db.prepare('select token_hash from invites where token_hash = ? and workspace_id = ?').get(wsInviteIdMatch[2], ctx.ws.id);
    if (!row) return fail(res, 404, 'inviteNotPending', 'That invite is no longer pending');
    db.prepare('delete from invites where token_hash = ?').run(row.token_hash);
    return json(res, 200, { revoked: true });
  }

  const inviteMatch = pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{16,128})$/);
  if (inviteMatch && method === 'GET') {
    const row = db.prepare('select * from invites where token_hash = ?').get(sha256(inviteMatch[1]));
    if (!row) return fail(res, 404, 'inviteInvalid', 'This invite link is not valid');
    if (row.used_at) return fail(res, 410, 'inviteAlreadyUsed', 'This invite has already been used');
    if (row.expires_at <= now()) return fail(res, 410, 'inviteExpired', 'This invite has expired');
    const ws = row.workspace_id ? db.prepare('select name, slug from workspaces where id = ?').get(row.workspace_id) : null;
    return json(res, 200, {
      workspace: ws ? { name: ws.name, slug: ws.slug } : null,
      email: row.email,
      role: row.role,
      expiresAt: row.expires_at,
      existing: !!(row.email && db.prepare('select 1 from users where email = ?').get(row.email)),
    });
  }

  const acceptMatch = pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{16,128})\/accept$/);
  if (acceptMatch && method === 'POST') {
    if (tooMany(`invite|${clientIp(req)}`, 5, 60 * 60 * 1000)) {
      return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    }
    const tokenHash = sha256(acceptMatch[1]);
    const invite = db.prepare('select * from invites where token_hash = ?').get(tokenHash);
    if (!invite) return fail(res, 404, 'inviteInvalid', 'This invite link is not valid');
    if (invite.used_at) return fail(res, 410, 'inviteAlreadyUsed', 'This invite has already been used');
    if (invite.expires_at <= now()) return fail(res, 410, 'inviteExpired', 'This invite has expired');

    const body = await readJson(req);
    const session = currentUser(req);
    const account = invite.email ? db.prepare('select * from users where email = ?').get(invite.email) : null;
    let user = session && (!invite.email || session.email === invite.email) ? session : null;
    if (!user && account) {
      return fail(res, 409, 'accountExistsSignIn', 'An account with this email already exists. Sign in to accept the invite.', { needsSignIn: true });
    }

    if (!user) {
      const name = String(body?.name || '').trim();
      const email = String(body?.email || '')
        .trim()
        .toLowerCase();
      const password = String(body?.password || '');
      if (!name) return fail(res, 400, 'nameRequired', 'Enter your name');
      if (!emailOk(email)) return fail(res, 400, 'enterValidEmail', 'Enter a valid email address');
      if (invite.email && invite.email !== email)
        return fail(res, 400, 'inviteForOtherEmail', `This invite is for ${invite.email}`, { email: invite.email });
      if (password.length < 10 || !/[0-9\W]/.test(password)) {
        return fail(res, 400, 'passwordTooWeak', 'Use at least 10 characters, including a number or symbol');
      }
      try {
        user = createUser(email, name, password);
      } catch (err) {
        return json(res, err.status || 500, { error: err.message, code: err.code });
      }
    }

    const ws = db.prepare('select * from workspaces where id = ?').get(invite.workspace_id) || firstWorkspace();
    if (!ws) return fail(res, 410, 'workspaceGone', 'This workspace no longer exists');
    if (!membershipOf(ws.id, user.id)) addMembership(ws, user, invite.role);
    // Links sent to a specific address are single-use; joining clears every pending one for that address.
    if (invite.email) {
      db.prepare('update invites set used_at = ?, used_by = ? where token_hash = ?').run(now(), user.id, tokenHash);
      db.prepare('update invites set used_at = ? where workspace_id = ? and email = ? and used_at is null').run(now(), ws.id, invite.email);
    }

    const t = now();
    if (!session) {
      const token = crypto.randomBytes(32).toString('base64url');
      db.prepare('insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)').run(
        sha256(token),
        user.id,
        t,
        t + SESSION_DAYS * 86400 * 1000,
      );
      setSessionCookie(req, res, token);
    }
    db.prepare('update users set last_login_at = ? where id = ?').run(t, user.id);
    return json(res, session ? 200 : 201, {
      user: userPayload(user),
      workspace: { id: ws.id, name: ws.name, slug: ws.slug },
    });
  }

  return fail(res, 404, 'notFound', 'Not found');
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
  const trailing = rel.endsWith('/');
  if (trailing) rel += 'index.html';
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
  if (trailing || !path.extname(rel)) {
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
    if (!res.headersSent) json(res, status, { error: status >= 500 ? 'Internal server error' : err.message, code: err.code });
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
  const slug = args[2];
  if (!email) {
    console.error('usage: node server.js --add-user <email> [name] [workspace-slug]');
    process.exit(1);
  }
  ensureWorkspace();
  const ws = slug ? wsBySlug(slug) : firstWorkspace();
  if (!ws) {
    console.error(slug ? `no workspace with slug ${slug}` : 'no workspace available');
    process.exit(1);
  }
  const password = process.env.USER_PASSWORD || crypto.randomBytes(9).toString('base64url');
  try {
    const user = createUser(email, name, password);
    addMembership(ws, user, 'member');
    console.log(`created ${user.email} in ${ws.slug}`);
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

  /* Invite links are absolute URLs built from APP_URL; without it appBase() falls back
     to the request's Host header, so a hostile Host would email invitation links pointing
     at the attacker's domain. Fail loudly at boot instead of at the first invite. */
  if (MAILER.enabled && !APP_URL) {
    console.error('invite email: refusing to start — SMTP_HOST is set but APP_URL is empty.');
    console.error('Invitation links are built from APP_URL; without it a request host header could point invite emails at an attacker\'s domain. Set APP_URL (e.g. https://gr8r.example.com) or unset SMTP_HOST to disable email invitations.');
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    console.log(`gr8r studio listening on http://${HOST}:${PORT}`);
    console.log(`database: ${DB_PATH}`);
    if (MAILER.enabled) console.log(`invite email: enabled via ${MAILER.host}:${MAILER.port} as ${MAILER.from}`);
    else if (MAILER.error) console.warn(`invite email: disabled — ${MAILER.error}`);
    else console.log('invite email: disabled (set SMTP_HOST to email invitations)');
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
