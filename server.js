#!/usr/bin/env node
/* =====================================================================
   Projects Studio server — one process, zero runtime dependencies.

   Serves the built SPA from dist/ and a small JSON API backed by SQLite
   (node:sqlite). Auth uses scrypt + opaque session cookies. The workspace
   itself is stored as one versioned JSON document, which matches the
   shape the front end already persists, so sync stays simple.

   Env:
     PORT=8080              listen port
     DATA_DIR=/data         directory holding projects.db
     ADMIN_EMAIL            first-run admin account
     ADMIN_PASSWORD         first-run admin password (generated if absent)
     ADMIN_NAME=Admin
     WORKSPACE_NAME=Projects Studio
     WORKSPACE_SLUG         optional slug for a fresh install (defaults to the name)
     APP_URL                public base URL for share/invite links
     ALLOW_SIGNUP=false     let visitors create accounts (WORKSPACE_CREATION gates workspace creation)
     WORKSPACE_CREATION     'true'|'false' — who may create workspaces; unset = false (operators only)
     SUPER_ACCESS=true      'false' = the instance admin keeps governance powers but can no
                            longer enter workspaces they hold no membership in (no synthetic
                            owner access, no governance Open action, membership-only switcher)
     SEED_DATA=true         false = start with an empty workspace
     SESSION_DAYS=30
     INVITE_DAYS=7          invite link lifetime
     SECURE_COOKIE=auto     auto | true | false
     TRUST_PROXY=false      opt-in: read X-Forwarded-* (set true behind Traefik)
     MAX_BODY_BYTES=8388608
     MAX_UPLOAD_MB=25       per-file upload cap in megabytes (raw-body uploads)
     SMTP_HOST              optional; enables automatic invite emails
     SMTP_PORT              587 (STARTTLS) or 465 (implicit TLS)
     SMTP_SECURE            true | false; inferred from the port when unset
     SMTP_USER/SMTP_PASS    optional SMTP AUTH credentials
     SMTP_REQUIRE_TLS       require TLS; default true
     MAIL_FROM              sender address (required with SMTP_HOST)
     MAIL_FROM_NAME         sender display name
     MAIL_REPLY_TO          optional Reply-To address
     OIDC_ENABLED           true to enable Entra SSO (also needs the three vars below)
     OIDC_TENANT_ID         Entra directory (tenant) id
     OIDC_CLIENT_ID         app registration application (client) id
     OIDC_CLIENT_SECRET     app registration client secret
     OIDC_SSO_ONLY          true = SSO is the only sign-in door (Phase 30 plan 02)
     OIDC_SCOPES            default "openid profile email"
     OIDC_ISSUER_OVERRIDE   TEST-ONLY issuer override for the mock IdP — never in production

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
import { pipeline } from 'node:stream/promises';
/* Phase 45: the raw node:sqlite import moved out — db-adapter.mjs owns the
   handle. server.js only ever sees the adapter facade + transitional shims. */
import { createMailer, unsubscribeUrl, unsubscribeUrlGlobal, verifyUnsubscribeToken, decodeUnsubscribePayload, buildUnsubscribePage } from './mailer.js';
import { createOidc, pkcePair, verifyIdToken } from './oidc.js';
import { buildOtpauthUri, generateRecoveryCode, generateTotpSecret, normalizeRecoveryCode, recoveryHash, verifyTotpCode } from './totp.js';
import { referencesHidden } from './src/lib/redaction.js';
import { createMcp, generateApiKey, API_KEY_DAYS, validKeyDays, validKeyScope } from './mcp.js';
import { registerCatalogue, tFor } from './src/core/i18n.js';
/* Phase 65 (65-01): the subtask-tree normalize/heal pass — one DOM-free
   definition shared with the client bundle (D-01/D-01a/D-03). */
import { normalizeTaskSubtasks, validateSubtree } from './src/core/subtree.js';
import { ssrfOk, pinnedFetch } from './webhook-ssrf.js';
import { nextAttemptMs, isDead } from './webhook-retry.js';
import { diffWebhookEvents, buildEnvelope, WEBHOOK_EVENTS } from './src/core/webhook-events.js';
import { formatPayload, truncateToCap } from './webhook-formats.js';
/* [Phase 66, 66-01] The ONE template-record sanitizer/funnel sink — the
   same pure module mergeClientDoc and normalizeDoc run below (T-65-11
   discipline: one validator, several call sites). */
import { normalizeTemplatesData } from './src/core/templates.js';
/* Phase 54 (54-01): the export funnel — one redacted-document read, one
   DOM-free model, one writer per format (T-54-01..T-54-06). 54-02 adds
   the server-only xlsx writer at the repository root (never under src/). */
import { buildExportModel } from './src/export/model.js';
import { toCsv } from './src/export/csv.js';
import { buildWorkbook } from './export/xlsx.js';
import { buildMspdi } from './export/mspdi.js';
/* Phase 86 (86-02, D-16): the /api/backup/runs surface — trigger + status
   routes wire the 86-01 pipeline; run-state/sweep/claim all come from it. */
import { runExport, getRunState, cancelRun, sweepStaleBackupStaging, setBackupRunWriter, setBackupDestination, setBackupGfsBucketProvider, scopeLabel, runLabel, instanceSlug, backupsRoot, sha256AndSize } from './export/backup.js';
import { parseCron, nextRunAt, describeCron, cronToPreset } from './export/cron.js';
import { assignGfsBuckets, gfsBucketFor } from './export/gfs.js'; // Phase 92 (BKNAME-02): THE single pure GFS definition — verbatim relocation
import { probeS3, downloadToStaged, s3BackupKey } from './export/s3.js';
import { streamVerifyArchive, sweepStaleRestoreStaging, restoreStagingDir, runRestore, restoreOverwriteUnit, restoreInstanceUnit, setRestoreRunEmitter } from './export/restore.js';
import frLocale from './src/locales/fr.json' with { type: 'json' };
/* Phase 45 (D-05): async dual-backend database facade. Boot, then every
   converted callsite, goes through this module — see db-adapter.mjs. */
import {
  connectDb,
  close as dbClose,
  get as dbGet,
  all as dbAll,
  run as dbRun,
  tx as dbTx,
  sqliteOnly,
  ensureColumn as adapterEnsureColumn,
  runSchema as adapterRunSchema,
  backendKind,
  ensureSearchIndex,
  syncTaskFts,
  searchTasks,
  ftsSweep,
} from './db-adapter.mjs';
import { searchTerms, foldForSearch } from './search-terms.mjs';
/* Phase 80 (GM-01): the group-mapping validators the save route consumes —
   canonicalizeGuid/guidRefusal/roleTokenRefusal from the 80-01 core. Runtime
   import of a root module → the Dockerfile COPY list and
   test/dependencies.test.mjs must ship groups.js too (Task 3, G-75-3
   precedent). */
import { canonicalizeGuid, guidRefusal, resolveGroupsClaim, resolve, roleTokenRefusal } from './groups.js';
import { CAP, capabilitiesFor, roleTokenRefusal as instanceRoleTokenRefusal } from './roles.js';
/* D-50-6: the reverse-sweep provenance reader opens the pre-sweep backup
   snapshots READ-ONLY (never through the adapter — they are historical files,
   not the live handle). Sole direct node:sqlite use in server.js. */
import { DatabaseSync } from 'node:sqlite';

/* I18N-01/02 (Phase 36): the server renders notification emails per recipient
   through tFor, so the FR catalogue must be registered at boot from the SAME
   src/locales/*.json the client ships (no forked copy, no Dockerfile change).
   One static import + one registration — no lazy loading, no file I/O
   mid-send. The EN base catalogue is registered by src/core/i18n.js itself. */
registerCatalogue('fr', frLocale);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.STATIC_DIR || path.join(HERE, 'dist'));
const SEED_FILE = path.join(HERE, 'seed.json');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, 'data'));
const FILES_DIR = path.join(DATA_DIR, 'files');
/* Phase 43 (D-01): workspace logos get their own storage directory — deliberately
   NOT the files/ attachment system; a dedicated route serves them publicly with
   a route-private mime map (LOGO_MIME below). */
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(DATA_DIR, 'projects.db'));
/* Phase 45 (D-05): optional Postgres backend. A postgres:// DB_URL routes
   boot through db-adapter.mjs; empty/unset keeps the node:sqlite default.
   Any other scheme is a typo — fail loudly at boot (D-04), never guess. */
const DB_URL = process.env.DB_URL
  ? (() => {
      if (!process.env.DB_URL.startsWith('postgres://')) {
        throw new Error('[db] unsupported DB_URL scheme — only postgres:// URLs are supported (D-04)');
      }
      return process.env.DB_URL;
    })()
  : '';
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
/* Phase 78 (WSG-01, D-78-1): the creation gate. Boolean tokens ONLY — exactly
   'true' or 'false'; unset defaults to false (fail-closed); ANY other token
   ('', whitespace, 'TRUE', 'yes', '1') boot-refuses below (after logError is
   defined). No trim, no case folding: unset and '' are DIFFERENT (Pitfall 4). */
const _WORKSPACE_CREATION_RAW = process.env.WORKSPACE_CREATION;
const WORKSPACE_CREATION =
  _WORKSPACE_CREATION_RAW === undefined
    ? false
    : _WORKSPACE_CREATION_RAW === 'true'
      ? true
      : _WORKSPACE_CREATION_RAW === 'false'
        ? false
        : null; // sentinel → boot-refuse
/* [2026-11-21, owner quick-task] SUPER_ACCESS: the super-access gate. When
   'false', the instance admin keeps instance-level powers (governance:
   create/archive/delete/rename, operator console) but can NO LONGER enter a
   workspace they hold no membership in — requireWorkspace synthesizes no
   membership, membershipsOf unions nothing, the governance Open action is
   hidden and the switcher lists only real memberships. Default: 'true' (the
   ratified behavior; the flag is an opt-OUT for stricter instances). Same
   strict token discipline as WORKSPACE_CREATION (WSG-01): exactly 'true' or
   'false', unset defaults to true, any other token boot-refuses. */
const _SUPER_ACCESS_RAW = process.env.SUPER_ACCESS;
const SUPER_ACCESS =
  _SUPER_ACCESS_RAW === undefined
    ? true
    : _SUPER_ACCESS_RAW === 'true'
      ? true
      : _SUPER_ACCESS_RAW === 'false'
        ? false
        : null; // sentinel → boot-refuse
const SEED_DATA = process.env.SEED_DATA !== 'false';
const WORKSPACE_NAME = (process.env.WORKSPACE_NAME || 'Projects Studio').trim() || 'Projects Studio';
const WORKSPACE_SLUG = String(process.env.WORKSPACE_SLUG || '').trim();
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const INVITE_DAYS = Number(process.env.INVITE_DAYS || 7);
const SECURE_COOKIE = process.env.SECURE_COOKIE || 'auto';
/* Public base URL (no trailing slash). Empty means "use the request host". */
const APP_URL = String(process.env.APP_URL || '')
  .trim()
  .replace(/\/+$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

/* Phase 88 (D-88-11/13): the S3 destination env pair — boot-frozen like
   WORKSPACE_CREATION/MAILER. Read ONCE here; no process.env reads after boot.
   S3_ENDPOINT is OPTIONAL (absent = the AWS native host derived from the
   region at config time — the documented default, never scheme guessing,
   D-88-13); S3_REGION defaults us-east-1; S3_PATH_STYLE is a strict-token
   boolean (default true — path-style PUT, MinIO/B2 need it, AWS accepts)
   whose invalid token boot-refuses below (D-88-13). The raw values never
   leave these consts: /api/config exposes the s3Enabled BOOLEAN only, task
   rows carry s3_enabled, and no log line or error text carries a key
   (D-88-11 custody / V14). */
const S3_ENDPOINT = String(process.env.S3_ENDPOINT || '').trim();
const S3_BUCKET = String(process.env.S3_BUCKET || '').trim();
const S3_ACCESS_KEY_ID = String(process.env.S3_ACCESS_KEY_ID || '').trim();
const S3_SECRET_KEY = String(process.env.S3_SECRET_KEY || '');
const S3_REGION = String(process.env.S3_REGION || '').trim() || 'us-east-1';
const _S3_PATH_STYLE_RAW = process.env.S3_PATH_STYLE;
const S3_PATH_STYLE =
  _S3_PATH_STYLE_RAW === undefined
    ? true
    : _S3_PATH_STYLE_RAW === 'true'
      ? true
      : _S3_PATH_STYLE_RAW === 'false'
        ? false
        : null; // sentinel → boot-refuse

/* Phase 96 (D-05): dormant FTP/SMB destination env — boot-frozen like the
   S3 pair. Read ONCE here; no process.env reads after boot. No FTP/SMB
   client exists yet (phases 98/100 install them) — these consts only
   custody the raw values and feed the enabled derivation the registry and
   /api/config expose. Raw values never leave these consts (D-88-11
   custody / V14): no log line or error text carries a key. */
const FTP_HOST = String(process.env.FTP_HOST || '').trim();
const FTP_PORT = Number.parseInt(process.env.FTP_PORT || '', 10) || 21;
const FTP_USER = String(process.env.FTP_USER || '').trim();
const FTP_PASSWORD = String(process.env.FTP_PASSWORD || '');
const FTP_SECURE = process.env.FTP_SECURE === 'true';
const FTP_PASV_HOST = String(process.env.FTP_PASV_HOST || '').trim();
const FTP_INSECURE = process.env.FTP_INSECURE === 'true';
const SMB_HOST = String(process.env.SMB_HOST || '').trim();
const SMB_SHARE = String(process.env.SMB_SHARE || '').trim();
const SMB_USER = String(process.env.SMB_USER || '').trim();
const SMB_PASSWORD = String(process.env.SMB_PASSWORD || '');

/* ------------------------------ LOG_LEVEL ------------------------------- */
/* Zero-dependency leveled logging (Kanzo #9): one ladder — debug < info
   (default) < warn < error — selected by the LOG_LEVEL env variable. Every
   line is stamped `ISO-timestamp LEVEL message`. Structured enough for
   `docker logs`, plain enough to read. */
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LOG_LEVEL_RAW = String(process.env.LOG_LEVEL || '')
  .trim()
  .toLowerCase();
const LOG_LEVEL = LOG_LEVEL_RAW in LOG_LEVELS ? LOG_LEVEL_RAW : 'info';
if (LOG_LEVEL_RAW && !(LOG_LEVEL_RAW in LOG_LEVELS)) {
  console['warn'](`LOG_LEVEL: unknown value "${LOG_LEVEL_RAW}" — falling back to "info" (valid: debug, info, warn, error)`);
}
function logLine(level, msg) {
  if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL]) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}`;
  if (level === 'error') console['error'](line);
  else if (level === 'warn') console['warn'](line);
  else console['log'](line);
}
const logDebug = msg => logLine('debug', msg);
const logInfo = msg => logLine('info', msg);
const logWarn = msg => logLine('warn', msg);
const logError = msg => logLine('error', msg);
/* Phase 96 (D-05/SC-4): partial-config warn parity for the dormant
   destinations — a HALF-set FTP/SMB env pair disables the slot and warns
   at boot. Unlike S3's S3_PATH_STYLE hard boot-refuse (the S3 sentinel),
   absent/partial FTP/SMB env NEVER exits the process (SC-4 wording). */
if ((FTP_HOST || FTP_USER || FTP_PASSWORD) && !(FTP_HOST && FTP_USER && FTP_PASSWORD)) {
  logWarn('backup ftp: FTP_HOST/FTP_USER/FTP_PASSWORD partially set — destination disabled (all three required)');
}
if ((SMB_HOST || SMB_SHARE || SMB_USER || SMB_PASSWORD) && !(SMB_HOST && SMB_SHARE && SMB_USER && SMB_PASSWORD)) {
  logWarn('backup smb: SMB_HOST/SMB_SHARE/SMB_USER/SMB_PASSWORD partially set — destination disabled (all four required)');
}

/* Phase 78 (T-78-01): boot-refuse on an invalid WORKSPACE_CREATION token — a
   typo must never silently weaken or open the gate. Runs before listen (the
   module top evaluates before main()), via the wired main().catch exit path. */
if (WORKSPACE_CREATION === null) {
  logError(
    `WORKSPACE_CREATION: invalid value ${JSON.stringify(_WORKSPACE_CREATION_RAW)} — only 'true' or 'false' are accepted (unset defaults to false)`,
  );
  process.exit(1);
}
if (SUPER_ACCESS === null) {
  logError(
    `SUPER_ACCESS: invalid value ${JSON.stringify(_SUPER_ACCESS_RAW)} — only 'true' or 'false' are accepted (unset defaults to true)`,
  );
  process.exit(1);
}
if (S3_PATH_STYLE === null) {
  logError(
    `S3_PATH_STYLE: invalid value ${JSON.stringify(_S3_PATH_STYLE_RAW)} — only 'true' or 'false' are accepted (unset defaults to true)`,
  );
  process.exit(1);
}

/* ---------------------- domain admission (Phase 75) --------------------- */
/* DOM-01/DOM-02/DOM-07: the shared canonicalizing domain machinery lives in
   domains.js (root, Phase 75 plan 02) — outside src/ so the i18n literal scan
   keeps its client-only scope, and out of server.js so the MCP invite_member
   door composes the EXACT same pipeline (T-75-16: no bypass lane, no
   reimplemented matching). The boot-frozen consts are the module's own
   exports, evaluated once at first import. */
import {
  SIGNUP_DOMAINS,
  INVITE_DOMAINS,
  emailDomainRefusal,
  emailFromEmail,
  isWildcardList,
} from './domains.js';

/* D-05: the AES-256 master key material comes from the environment. Missing or
   unusable on the enable path → fail-closed 503 naming MASTER_KEY (D-06/D-58). */
const MASTER_KEY = String(process.env.MASTER_KEY || '');
/* D-K1/D-K2/D-K3: a two-key keyring — the current MASTER_KEY plus an optional
   MASTER_KEY_PREVIOUS (rotation support, Phase 26). No open-ended chain: no
   _2/_3 variables exist. The key id (D-K3) is the first 8 hex chars of ONE
   sha256 call over the raw key material — the same call that yields the AES
   key (raw digest bytes), so id and key can never drift apart (Pitfall 3).
   D-K2: PREVIOUS without CURRENT fails boot loudly — never serve requests. */
const MASTER_KEY_PREVIOUS = String(process.env.MASTER_KEY_PREVIOUS || '');
const keyIdFor = material => crypto.createHash('sha256').update(material).digest('hex').slice(0, 8);
const KEYRING = new Map();
if (MASTER_KEY) KEYRING.set(keyIdFor(MASTER_KEY), MASTER_KEY);
if (MASTER_KEY_PREVIOUS) {
  if (!MASTER_KEY) {
    throw new Error('MASTER_KEY_PREVIOUS is set but MASTER_KEY is not — configure the current key before a previous one (fail-closed, D-K2)');
  }
  KEYRING.set(keyIdFor(MASTER_KEY_PREVIOUS), MASTER_KEY_PREVIOUS);
}
/* A1 (Pitfall 2): identical key material collapses both ids — harmless for
   decrypt, but Phase 26 rotation would re-wrap zero rows. Warn, never fail. */
if (MASTER_KEY && MASTER_KEY_PREVIOUS && keyIdFor(MASTER_KEY) === keyIdFor(MASTER_KEY_PREVIOUS)) {
  logWarn('TOTP encryption: MASTER_KEY_PREVIOUS hashes to the same key id as MASTER_KEY — identical key material?');
}
/* Phase 41 (UNSUB-01, D-10): purpose-tagged HMAC key for unsubscribe tokens —
   sha256(MASTER_KEY ‖ 'unsubscribe-tokens:v1') via ONE createHash with two
   chained updates (encryptTotpSecret precedent, L432-437). Domain-separated:
   never raw MASTER_KEY, never the AES/TOTP envelope path — the purpose tag is
   the domain separator (frozen by the token-freeze tests). Fail-open-null:
   no MASTER_KEY → null → no token → no unsubscribeUrl → headers omitted. */
const UNSUB_TOKENS_PURPOSE = 'unsubscribe-tokens:v1';
const unsubscribeHmacKey = () => (MASTER_KEY ? crypto.createHash('sha256').update(MASTER_KEY).update(UNSUB_TOKENS_PURPOSE).digest() : null);
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
const MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024;
const DEFAULT_WS_ID = 'ws_default';
const COOKIE = 'projects_session';
/* D-68: the pending second-factor challenge rides its OWN cookie — never the
   session cookie — so requireUser()/currentUser() structurally never see it. */
const CHALLENGE_COOKIE = 'projects_tfa_challenge';
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // D-66: 5-minute challenge lifetime
/* SSO-01: the transient flow cookie keys a server-side entry holding the
   HASHED state/nonce plus the PKCE verifier — raw values never ride a cookie
   (30-01 prohibition). ~10-minute Max-Age, delete-on-use at the callback. */
const OIDC_FLOW_COOKIE = 'projects_oidc_flow';
const OIDC_FLOW_TTL_MS = 10 * 60 * 1000;
/* Server-side flow entries, keyed by the opaque cookie value. The PKCE
   verifier and nonce live here raw ONLY because the token exchange and the
   id_token check need them verbatim — they never touch a cookie or any
   persistent store (T-30-01/T-30-02/T-30-03). Pruned on every start. */
const OIDC_FLOWS = new Map();
/* Timing-safe compare over two fixed-length sha256 hex digests. */
function timingSafeHex(aHex, bHex) {
  const a = Buffer.from(String(aHex), 'hex');
  const b = Buffer.from(String(bHex), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Guest' };
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const RESERVED_SLUGS = new Set(['api', 'w', 'join', 'assets', 'static', 'health', 'login', 'signup', 'onboarding', 'settings', 'admin']);
const MAILER = createMailer();
const OIDC = createOidc();
/* Phase 88 (D-88-11/13): the boot-frozen S3 capability, mirroring the
   MAILER `.enabled` pattern (optional-facility precedent). `.enabled` = the
   bucket + key pair present — S3_ENDPOINT alone is never sufficient, and
   its absence alone never disables. `S3.config()` is the ONE seam that
   resolves the request config export/s3.js consumes (endpoint resolves to
   the AWS native host when unset); everything else reads only `.enabled`.
   No process.env reads after boot. */
const S3 = {
  enabled: !!(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_KEY),
  config: () => ({
    endpoint: S3_ENDPOINT || `https://s3.${S3_REGION}.amazonaws.com`,
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_KEY,
    region: S3_REGION,
    pathStyle: S3_PATH_STYLE !== false,
  }),
};
/* Registry codes the interface actually renders — derived from the same
   source of truth as the client's import.meta.glob (D-07): the build's own
   src/locales/*.json files. Was a hardcoded ['en','fr'] pair until phase 77
   exposed it: phases 75's nl/de/es catalogues shipped client-side, the
   select offered them, and the PATCH /api/auth/me write 400'd
   (unknownLocale) — the language silently failed to persist. A future
   locale file lands in the gate automatically, no second list to forget. */
const LOCALE_CODES = fs
  .readdirSync(path.join(HERE, 'src', 'locales'))
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace(/\.json$/, ''))
  .sort();

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
    locale        text,
    /* D-13 (Phase 67): the Entra AAD object id (oid claim), persisted at
       OIDC login — the webhook formatter resolves real <at> mentions from
       it (D-14). Server-only: nullable, additive, never serialized to any
       client payload. Named aad_oid, NOT oid: SQLite 3.54+ refuses
       ALTER TABLE ADD COLUMN for reserved alias names with
       "cannot add <name> alias" — the boot-time ensureColumn would crash
       every fresh container (G-67-1 follow-up). */
    aad_oid       text,
    two_fa_enabled   integer not null default 0,
    two_fa_secret    text,
    two_fa_last_step integer not null default 0,
    is_instance_admin integer not null default 0
  );
  /* TOTP2 (Phase 31, D-06): the totp_factors single source of truth. Additive
     create-if-not-exists — boot-time idempotent by construction
     (second boot is a no-op for free). One row per enrolled factor; the
     migrated primary carries the users-column envelope verbatim (decrypt-free
     copy) and last_step seeded from two_fa_last_step (D-09 replay-guard
     continuity). users.two_fa_secret / two_fa_last_step stay in schema kept,
     unread after migration (D-08); users.two_fa_enabled stays the switch. */
  create table if not exists totp_factors (
    id         text primary key,
    user_id    text not null references users(id) on delete cascade,
    name       text not null,
    secret     text not null,
    last_step  integer not null default 0,
    created_at integer not null
  );
  create index if not exists totp_factors_user on totp_factors(user_id);
  /* SSO-01 (Phase 30): one row per (issuer, subject) Entra identity, joined to
     users(id) independently — the exact shape the Phase 28 comment below
     settled for the OIDC identity table. The unique (issuer, subject) index
     is the race-safety anchor for plan 30-02's linking policy: a concurrent
     double-login can never create two identities for one IdP subject. */
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
    updated_at integer not null,
    /* Phase 79 (D-02): soft-archive flag. 0 = active, 1 = archived (hidden
       from member listing/entry, unarchivable from the governance surface). */
    archived   integer not null default 0
  );
  create table if not exists memberships (
    workspace_id text not null references workspaces(id) on delete cascade,
    user_id      text not null references users(id) on delete cascade,
    role         text not null check (role in ('owner','admin','member','viewer')),
    member_id    text,
    /* Phase 81 (D-81-6): membership origin — group:<guid> | invite | manual | null(legacy). */
    provenance   text,
    primary key (workspace_id, user_id)
  );
  /* TEAM-01: the single authority for team membership (Phase 28, D-01/D-03).
     team_id references the doc's teams[] definitions, which stay in the document
     (D-02) — so no FK there, only a whitelist check at write time. Both id columns
     are carried, exactly like memberships: doc profiles key on member_id, sessions
     and the API on user_id. The user_id FK mirrors memberships exactly, which
     settles the Phase 30 OIDC identity-column decision (research Pitfall 5): any
     future identity table joins users(id) independently — this shape is additive. */
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
    role         text not null check (role in ('owner','admin','member','viewer')),
    team         text,
    teams        text,
    workspace_id text references workspaces(id) on delete cascade,
    created_by   text not null references users(id) on delete cascade,
    created_at   integer not null,
    expires_at   integer not null,
    used_at      integer,
    used_by      text
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
  /* AUD-01: append-only audit trail. FK-free by design (D-A2) — no references,
     no cascade, no trigger: the security_log cascade is exactly what audit_log
     must not have. Rows carry actor/target name+email snapshots so the trail
     survives user deletion. Written in the same transaction as the mutation. */
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
  /* REM-03: exactly-once reminder ledger. One row per (workspace, task, assignee,
     offset, due date) — the dedup key carries the due date, so editing a due
     date re-arms the reminder. Claimed with INSERT OR IGNORE inside the same
     transaction that appends the notification row. */
  create table if not exists reminders_sent (
    dedup_key    text primary key,
    workspace_id text not null,
    created_at   integer not null
  );
  create index if not exists reminders_sent_ws on reminders_sent(workspace_id, created_at);
  /* PREFS (Phase 34, D-04/D-10): one row per (workspace, user) — the single
     authority for per-user notification preferences. The workspace document
     never carries prefs again (normalizeDoc/mergeClientDoc strip notifPrefs in
     both directions); getUserNotifPrefs is the only reader. The composite PK
     needs no extra index and no FK — the same shape Plan 02's backfill writes. */
  create table if not exists user_notif_prefs (
    workspace_id text not null,
    user_id      text not null,
    prefs        text not null,
    primary key (workspace_id, user_id)
  );
  /* PUSH (Phase 59, PUSH-01/PUSH-05): one row per browser push subscription,
     endpoint UNIQUE so a re-subscribe replaces the row (insert or replace on
     endpoint, pg conflict target '(endpoint)' in db-adapter.mjs). user_id and
     workspace_id always come from the session (mass-assignment guard):
     p256dh/auth are unpacked from the canonical body keys.p256dh/keys.auth
     (subscription.toJSON() shape, POSTed verbatim by the client). */
  create table if not exists push_subscriptions (
    workspace_id text not null,
    user_id      text not null,
    endpoint     text not null unique,
    p256dh       text not null,
    auth         text not null,
    label        text not null default '',
    created_at   integer,
    last_seen_at integer
  );
  /* VIEWS (Phase 57, D-05/D-12): per-user saved views AND live column state —
     one row per (workspace, user, table key, view name). The document is never
     a view-state carrier again (normalizeDoc / mergeClientDoc strip the
     top-level views field in both directions; migrateUserViews moved legacy
     doc.views blobs here at boot). The LIVE/CURRENT row uses the sentinel
     name '' — named views (Phase 57 plan 02) use their name; names are unique
     per (user, key) case-insensitively, so the sentinel can never collide
     (D-12). blob carries a whitelisted viewOf() snapshot; schema_version
     enables the lenient-load intersection (unknown fields dropped, no hard
     failure). The composite PK needs no extra index and no FK. */
  create table if not exists saved_views (
    workspace_id   text not null,
    user_id        text not null,
    key            text not null,
    name           text not null,
    blob           text not null,
    schema_version integer not null,
    primary key (workspace_id, user_id, key, name)
  );
  /* MCP-01: personal API keys for the /mcp endpoint. One key = one user on
     ONE workspace (D-KEY-SCOPE), with a mandatory expiry (no permanent
     keys) and a read/write scope. Only the sha256 hash is stored — the
     raw psk_live_ key is shown exactly once at creation, exactly like the
     session-token discipline (hash-at-rest, never a plaintext lookup).
     'prefix' carries the first chars for display/leak-scanning, never
     enough to reconstruct. */
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
  /* =====================================================================
     Phase 67 (WHK-05, D-10): webhook hook registry — server MIRROR tables
     only. Hook config never enters the workspace document or docForClient:
     the Workflows URL is itself a bearer credential and the secret signs
     deliveries (HMAC), so both stay server-side. 'events' is a JSON array
     over the 8-event vocabulary (src/core/webhook-events.js); 'status' is
     'active' | 'disabled'. Unlike api_keys the plaintext secret MUST be
     stored (the server signs each delivery); show-once applies to the
     CLIENT surface only (D-10) — never in a log line (T-67-03).
     ===================================================================== */
  create table if not exists webhook_hooks (
    id           text primary key,
    workspace_id text not null,
    project_id   text not null,
    url          text not null,
    secret       text not null,
    format       text not null default 'teams-adaptive',
    events       text not null default '[]',
    status       text not null default 'active',
    created_by   text not null,
    created_at   integer not null
  );
  create index if not exists webhook_hooks_project on webhook_hooks(workspace_id, project_id);
  /* WHK-03: exactly-once delivery claim + state machine (POL-02 co-design).
     The UNIQUE dedup_key ({hookId}:{event}:{subjectKey}) IS the claim —
     INSERT OR IGNORE inside the enqueue transaction is the whole
     exactly-once mechanism (reminders_sent pattern): a re-enqueue of the
     same (hook, event, subject) is a no-op. Never mark-then-send (Phase 38
     invariant): the attempt bump is a guarded UPDATE and the delivered
     status is written only AFTER the HTTP request returned 2xx. Retention
     D-07: rows older than 7 days are purged by the delivery pass.
     pg twin: db-adapter.mjs SQLITE_SCHEMA + PG_CONFLICT_TARGETS
     webhook_deliveries '(dedup_key)'.
     'ctx' (67-02): the diff-time event snapshot + D-03 context trio as
     JSON — the envelope is built from THIS at delivery time, so
     task.deleted carries the last-known title and a 40 KB comment body
     truncates from the original text (the doc may have moved on). */
  create table if not exists webhook_deliveries (
    id               text primary key,
    workspace_id     text not null,
    hook_id          text not null,
    event            text not null,
    dedup_key        text not null unique,
    ctx              text not null default '',
    payload_hash     text not null default '',
    attempt          integer not null default 0,
    status           text not null default 'pending',
    next_attempt_at  integer,
    last_status_code integer,
    last_error       text not null default '',
    created_at       integer not null,
    delivered_at     integer
  );
  create index if not exists webhook_deliveries_due on webhook_deliveries(status, next_attempt_at);
  /* Phase 68 (POL-02, D-05): email transport claim — mirrors
     webhook_deliveries' exactly-once shape (UNIQUE dedup_key + INSERT OR
     IGNORE) with the SAME retry state columns; webhook-retry.js math is
     shared verbatim (D-06). 'ctx' carries everything the email rebuild
     needs at delivery time (recipient, locale, kind, payload snapshot).
     pg twin: db-adapter.mjs SQLITE_SCHEMA (byte-identical DDL — Pitfall
     P-B); epoch columns reuse webhook names already registered in
     PG_EPOCH_COLUMNS (created_at/next_attempt_at/delivered_at). */
  create table if not exists email_outbox (
    id               text primary key,
    workspace_id     text not null,
    dedup_key        text not null unique,
    kind             text not null,
    recipient        text not null,
    ctx              text not null default '',
    attempt          integer not null default 0,
    status           text not null default 'pending',
    next_attempt_at  integer,
    last_status_code integer,
    last_error       text not null default '',
    created_at       integer not null,
    delivered_at     integer
  );
  create index if not exists email_outbox_due on email_outbox(status, next_attempt_at);
  /* GROUP-MAPPING (Phase 80, GM-01): operator-managed Entra group → workspace
     role grants. The workspace reference deliberately OMITS on delete
     cascade (D-82-6): a deleted workspace must leave the mapping row behind
     so boot and the operator console can warn about it (dead mapping). Role
     tokens are the locked 3-token set — owner|admin|member, no viewer (locked
     owner decision; Pitfall 5). kind carries the dedicated operator-mapping
     row kind beside ordinary workspace mappings — the resolver contract fixed
     here so Phase 81 passes claims without any config migration. */
  create table if not exists group_mappings (
    id           text primary key,
    group_guid   text not null,
    workspace_id text not null,
    role         text not null check (role in ('owner','admin','member')),
    kind         text not null default 'workspace' check (kind in ('workspace','operator')),
    label        text,
    created_by   text references users(id) on delete set null,
    created_at   integer not null,
    updated_at   integer not null
  );
  create unique index if not exists group_mappings_pair on group_mappings(group_guid, workspace_id);
  /* INSTANCE-ROLES (Phase 85, BKROLE-01, D-01..D-04): explicit Backup /
     Restore Operator grants. role is a CHECK-constrained enum (D-01) — a
     typo can never become a silent no-op; widening later rides the
     invites rebuild-migration precedent (server.js:717). user_id FK is ON
     DELETE CASCADE (D-04 — rows vanish with the deleted account, unlike
     the group_mappings set-null choice above); granted_by is set null so
     a deleted granter's rows survive (D-33 renders the fallback id).
     granted_by is a plain users reference with no uniqueness interplay.
     One row per (user_id, role) (D-02) — a user may hold both roles as
     two rows; revoke deletes the row. No pg variant entry (Pattern 2/A1):
     pgSchemaVariant derives the pg DDL from this verbatim. */
  create table if not exists instance_roles (
    id           text primary key,
    user_id      text not null references users(id) on delete cascade,
    role         text not null check (role in ('backup_operator','restore_operator')),
    granted_by   text not null references users(id) on delete set null,
    granted_at   integer not null
  );
  create unique index if not exists instance_roles_pair on instance_roles(user_id, role);
  /* BACKUP TASKS (Phase 87, 87-01, BKBCK-02/BKBCK-03): scheduled backup task
     definitions. cron is the RAW 5-field string — D-04 (one-way, ratified by
     the owner at execute-phase 2026-11-21): the stored string is the single
     source of truth (scheduler, catch-up and future task-config export all
     parse it); changing representation later requires a data migration.
     next_run_at is a PERSISTED CACHE computed once per write by
     export/cron.js nextRunAt() — never re-parsed, never recomputed at tick
     (roadmap schema decision); NULL while disabled (D-07: a disabled-while-
     down task must never fire from a stale value — re-enable recomputes from
     now in the same write). tz defaults to Europe/Paris via resolveTz(null)
     — the users table has no tz column (verified 87-01 checkpoint); the
     operator picks explicitly through the form combobox (D-02). Retention
     columns default 7/4/12/5 (D-09). last_notified_state backs the D-15
     failure/recovery email transitions. scope is the JSON-serialized
     {kind, id?} shape the 86-02 runs route already validates.
     pg twin: db-adapter.mjs SQLITE_SCHEMA (pgSchemaVariant derives the pg
     DDL — next_run_at/started_at/finished_at are registered in
     PG_EPOCH_COLUMNS; created_at/updated_at already were). */
  create table if not exists backup_tasks (
    id                  text primary key,
    name                text not null,
    scope               text not null default '{}',
    cron                text not null,
    tz                  text not null default 'Europe/Paris',
    enabled             integer not null default 1,
    retention_daily     integer not null default 7,
    retention_weekly    integer not null default 4,
    retention_monthly   integer not null default 12,
    retention_yearly    integer not null default 5,
    next_run_at         integer,
    last_notified_state text,
    /* Phase 88 (D-88-12): per-task S3 opt-in — boolean only; credentials stay
       in the boot-frozen S3_* env pair (D-88-11 custody), never in the row.
       Existing rows default 0 via the additive ensureColumn in initDb. */
    s3_enabled          integer not null default 0,
    created_at          integer not null,
    updated_at          integer not null
  );
  create index if not exists backup_tasks_name on backup_tasks(name);
  /* BACKUP RUNS (Phase 87, 87-01): per-run history rows — the surface the
     scheduler, run history and rotation (D-10/D-11/D-12) all build on.
     task_id NULL = a manual Run-now archive (D-11, ratified 2026-11-21):
     manual runs stay OUTSIDE rotation; scheduled runs are task-scoped and
     their filenames carry the task id (backup-task-<taskId>-<ts>.tar.gz,
     greppable on disk) while manual filenames stay frozen per 86-D-14.
     status is CHECK-constrained (instance_roles precedent) so a typo can
     never become a silent state; 'skipped_overlap' records the D-10
     single-run invariant refusal; 'deleted' marks rotation-removed rows —
     run rows are history and NEVER cascade on task delete.
     Phase 88 (D-88-2): 'upload_failed' joins the terminal set — a failed
     upload keeps the local archive and lands as its own status. 'uploading'
     is deliberately NOT a status: it is a stage inside 'running' whose
     progress rides the D-19 payload. Pre-existing installs migrate via the
     invites-rebuild idiom (sqliteOnly, initDb). */
  create table if not exists backup_runs (
    id           text primary key,
    task_id      text,
    scope        text not null default '{}',
    trigger      text not null check (trigger in ('manual','scheduled')),
    status       text not null check (status in ('running','succeeded','failed','upload_failed','interrupted','skipped_overlap','deleted')),
    started_at   integer not null,
    finished_at  integer,
    duration_ms  integer,
    size_bytes   integer,
    sha256       text,
    filename     text,
    error        text,
    /* Phase 89 (D-89-15): per-run upload truth — the honest S3 badge
       source for the restore list (89-03). Additive, def byte-identical
       on both engines (Pitfall P-B); existing rows default 0 via the
       ensureColumn at boot — D-89-14: run-row truth only, never live S3
       state. */
    uploaded     integer not null default 0,
    /* Phase 90 (D-90-11, 90-02): the verify-checksum result — nullable until
       the first verify lands (null = never checked, 1 = match, 0 = mismatch —
       a comment here must never end a line with a semicolon, runSchema splits
       statements on ';-newline'). checksum_checked_at is the SERVER ISO
       timestamp of that verify. Both outcomes persist, so the client badge
       re-renders payload-derived (D-23 doctrine). Def byte-identical on both
       engines (Pitfall P-B); existing rows default null via the boot
       ensureColumns — no data migration. */
    checksum_ok          integer,
    checksum_checked_at  text,
    /* Phase 90 (D-90-23, 90-03): the per-run honest data-quality warning —
       how many manifest entries the export flagged missingBlob (the D-04
       record-and-continue collectors). The writer stamps it beside the
       uploaded-flag write, once before the run is marked terminal, never in
       a catch path. Additive, def byte-identical on both engines (Pitfall
       P-B); existing rows default 0 via the boot ensureColumn — no data
       migration (a comment here must never end a line with a semicolon,
       runSchema splits statements on ';-newline'). */
    missing_blob_count   integer not null default 0,
    /* Phase 92 (BKNAME-02, D-02): the stored GFS bucket — written at run
       creation for succeeded rows only (null = not-yet-backfilled marker,
       the idempotent boot sweep's WHERE clause). Nullable text, NO default
       (a comment here must never end a line with a semicolon — runSchema
       splits statements on ';-newline'). Def byte-identical on both
       engines (Pitfall P-B); the boot ensureColumn covers existing dbs. */
    gfs_bucket           text,
    created_at   integer not null
  );
  create index if not exists backup_runs_task on backup_runs(task_id, created_at);
  /* RESTORE RUNS (Phase 89, 89-02, BKRST-02/D-89-2): background restore run
     rows — the same lifecycle idioms as 87's backup_runs (created running
     → done|failed). trigger is the restore unit family (import_new /
     overwrite / instance) and stage is the D-89-29 coarse render-only
     vocabulary (fetching → validating → restoring → verifying →
     done|failed) CHECK-constrained so a stage outside it can never
     persist — summary carries the D-89-7 skip-report payload while
     snapshot_run_id/snapshot_tag carry the D-89-5 pre-restore snapshot
     link (tag 'pre_restore'). A crash mid-restore is healed at boot by
     sweepStaleRestoreRuns (interrupted, D-89-31).
     pg twin: db-adapter.mjs SQLITE_SCHEMA (pgSchemaVariant widens
     started_at/finished_at/created_at via PG_EPOCH_COLUMNS — already
     registered). */
  create table if not exists restore_runs (
    id               text primary key,
    scope            text not null default '{}',
    trigger          text not null check (trigger in ('import_new','overwrite','instance')),
    status           text not null check (status in ('running','done','failed','interrupted')),
    stage            text not null default 'fetching' check (stage in ('fetching','validating','restoring','verifying','done','failed')),
    final_name       text,
    summary          text,
    snapshot_run_id  text,
    snapshot_tag     text,
    error            text,
    started_at       integer not null,
    finished_at      integer,
    created_at       integer not null
  );
  create index if not exists restore_runs_created on restore_runs(created_at);
  /* RESTORE LOCK (Phase 89, 89-02, D-89-31): the engine-neutral global
     restore claim — a single-row CAS (update ... where id = 1 and
     claimed_by is null) is the ONLY serialization point for the whole
     D-89-1 mutual exclusion (restore ↔ backup), on BOTH engines — no
     per-engine advisory locks. Released at boot by the stale sweep and in
     the holder's finally. The seed is insert-or-ignore idempotent so a
     second boot writes nothing (the pg-matrix row-count discipline
     holds). claimed_at is registered in PG_EPOCH_COLUMNS. */
  create table if not exists restore_lock (
    id          integer primary key check (id = 1),
    claimed_by  text,
    claimed_at  integer
  );
  insert into restore_lock (id, claimed_by, claimed_at) values (1, null, null) on conflict do nothing;
`;

async function initDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(LOGOS_DIR, { recursive: true }); // Phase 43 (D-01): logos dir sibling of files/
  await connectDb({ dbPath: DB_PATH, dbUrl: DB_URL });
  // The facade is complete (D-06): every db.* callsite is async now —
  // get/all/run/tx plus the close() handle. No sync passthrough remains.
  db = {
    close: dbClose,
    // async facade (D-06): every region calls db.get/all/run/tx
    get: dbGet,
    all: dbAll,
    run: dbRun,
    tx: dbTx,
  };
  /* D-10: schema creation is dialect-owned — the adapter branches ONCE
     (runSchema): SQLite executes the SCHEMA above verbatim; pg executes
     pgSchemaVariant(SCHEMA) — the nocase collation stripped, epoch-ms
     columns widened to bigint, the lower(email) functional unique index
     added. D-11 (checkpoint-approved, one-way): the workspace doc column
     stays a plain text column in the pg variant — no jsonb. One statement
     per facade call (node:sqlite prepare is single-statement). */
  await adapterRunSchema(SCHEMA);
  // Additive migration for databases created before multi-workspace support.
  // (D-10): the pragma table_info probe is SQLite-only; the adapter branches
  // to information_schema on pg — one branch site, pinned in the adapter.
  await adapterEnsureColumn('workspaces', 'slug', 'text');
  await adapterEnsureColumn('workspaces', 'color', 'text');
  // Phase 79 (D-02): soft-archive flag — def byte-identical to the SCHEMA
  // declaration (Pitfall P-B).
  await adapterEnsureColumn('workspaces', 'archived', 'integer not null default 0');
  await adapterEnsureColumn('memberships', 'member_id', 'text');
  // P4-c fix: the team picked at invite time must survive into the profile seed.
  await adapterEnsureColumn('memberships', 'team', 'text');
  /* Phase 81 (D-81-6): membership origin — group:<guid> | invite | manual | null(legacy).
     Selection key for Phase 82 removal-sync; never backfilled. */
  await adapterEnsureColumn('memberships', 'provenance', 'text');
  await adapterEnsureColumn('invites', 'workspace_id', 'text');
  // Phase 28 D-07: invites carry a JSON array of teams. The scalar `team`
  // column above stays on disk as backfill-only legacy (D-04) — never read.
  await adapterEnsureColumn('invites', 'teams', 'text');
  // Phase 29 D-02 introduced the scope columns; Phase 49 (D-49-5) retired
  // them — they stay on disk only so the boot sweep can read legacy payloads.
  await adapterEnsureColumn('memberships', 'scope', 'text');
  await adapterEnsureColumn('invites', 'scope', 'text');
  // Phase 50 (VIS-04): a member-tier guest invite is scoped to one project —
  // nullable, set only on the member path (admin/owner invites stay
  // workspace-scoped).
  await adapterEnsureColumn('invites', 'project', 'text');
  /* [2026-11-11 second-owner invites, owner request] The invites role CHECK
     originally excluded 'owner' (INV-01's belt-and-braces). SQLite cannot
     alter a CHECK in place — rebuild the table when the stored definition
     predates the widened constraint (sqliteOnly: sqlite_master is a SQLite
     concept; pg tables are created fresh from the variant schema each boot).
     Additive-safe: every column and index is carried verbatim; legacy
     'guest' rows pre-normalize to 'viewer' so the strict CHECK holds. */
  await sqliteOnly(async () => {
    const invTbl = await db.get("select sql from sqlite_master where type = 'table' and name = 'invites'");
    if (invTbl?.sql && !invTbl.sql.includes("role in ('owner'")) {
      await db.run(`create table invites_rebuild (
    token_hash   text primary key,
    email        text,
    role         text not null check (role in ('owner','admin','member','viewer')),
    team         text,
    teams        text,
    workspace_id text references workspaces(id) on delete cascade,
    created_by   text not null references users(id) on delete cascade,
    created_at   integer not null,
    expires_at   integer not null,
    used_at      integer,
    used_by      text,
    scope        text,
    project      text
  )`);
      await db.run(
        "insert into invites_rebuild (token_hash, email, role, team, teams, workspace_id, created_by, created_at, expires_at, used_at, used_by, scope, project) select token_hash, email, case when role = 'guest' then 'viewer' else role end, team, teams, workspace_id, created_by, created_at, expires_at, used_at, used_by, scope, project from invites",
      );
      await db.run('drop table invites');
      await db.run('alter table invites_rebuild rename to invites');
      await db.run('create index if not exists invites_expiry on invites(expires_at)');
    }
  }, 'invites role-CHECK widening rebuild');
  /* Phase 88 (D-88-12): per-task S3 opt-in — additive, def byte-identical to
     the SCHEMA declaration (Pitfall P-B); existing rows default 0 (D-88-12:
     env pair set or not, no task uploads until opted in). */
  await adapterEnsureColumn('backup_tasks', 's3_enabled', 'integer not null default 0');
  /* Phase 88 (D-88-2): backup_runs status CHECK widening — 'upload_failed'
     joins the terminal set ('uploading' deliberately NOT a status: it is a
     stage inside 'running', the progress rides the D-19 payload). SQLite
     cannot alter a CHECK in place — rebuild the table when the stored
     definition predates the widened constraint (sqliteOnly: sqlite_master is
     a SQLite concept; pg tables are created fresh from the variant schema
     each boot). Additive-safe: every column and index is carried verbatim —
     no data loss path (T-88-08). The `error` column already carries the
     run-level error text plan 03 needs for the upload failure, so no
     additional upload column is required. */
  await sqliteOnly(async () => {
    const runsTbl = await db.get("select sql from sqlite_master where type = 'table' and name = 'backup_runs'");
    if (runsTbl?.sql && !runsTbl.sql.includes("'upload_failed'")) {
      await db.run(`create table backup_runs_rebuild (
    id           text primary key,
    task_id      text,
    scope        text not null default '{}',
    trigger      text not null check (trigger in ('manual','scheduled')),
    status       text not null check (status in ('running','succeeded','failed','upload_failed','interrupted','skipped_overlap','deleted')),
    started_at   integer not null,
    finished_at  integer,
    duration_ms  integer,
    size_bytes   integer,
    sha256       text,
    filename     text,
    error        text,
    created_at   integer not null
  )`);
      await db.run(
        'insert into backup_runs_rebuild (id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at) select id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at from backup_runs',
      );
      await db.run('drop table backup_runs');
      await db.run('alter table backup_runs_rebuild rename to backup_runs');
      await db.run('create index if not exists backup_runs_task on backup_runs(task_id, created_at)');
    }
  }, 'backup_runs status-CHECK widening rebuild (D-88-2 upload_failed)');
  /* Phase 89 (D-89-15, 89-03): per-run upload truth — the additive column
     behind the restore list's honest S3 badge (planner decision flag 2:
     a column beats a heuristic badge). Def byte-identical to the SCHEMA
     declaration (Pitfall P-B); existing rows default 0 — no task uploads
     lie about S3 state. The 88-2 rebuild above predates the column, so
     this ensureColumn must come AFTER it. */
  await adapterEnsureColumn('backup_runs', 'uploaded', 'integer not null default 0');
  // Phase 90 (D-90-11, 90-02): the verify-checksum result columns — defs
  // byte-identical to the SCHEMA declaration (Pitfall P-B); nullable, no
  // default — null = never checked. No data migration.
  await adapterEnsureColumn('backup_runs', 'checksum_ok', 'integer');
  await adapterEnsureColumn('backup_runs', 'checksum_checked_at', 'text');
  // Phase 90 (D-90-23, 90-03): the per-run missing-blob warning count — def
  // byte-identical to the SCHEMA declaration (Pitfall P-B), default 0.
  await adapterEnsureColumn('backup_runs', 'missing_blob_count', 'integer not null default 0');
  // Phase 92 (BKNAME-02, D-02): the stored GFS bucket — nullable text, NO
  // default (null = not-yet-backfilled marker, the gated boot sweep's WHERE
  // clause). Def byte-identical to the SCHEMA declaration (Pitfall P-B).
  await adapterEnsureColumn('backup_runs', 'gfs_bucket', 'text');
  // Phase 92 (D-02, owner-approved 2026-11-24): deployment-time backfill —
  // migration, NOT a user-triggered mutation (no audit-funnel row: it is a
  // boot DDL-companion like the additive columns above). Idempotent over
  // `gfs_bucket is null`, one shared GFS function, dual-engine statement
  // shapes (parameterized select/update — the T-45-08 pg-safe lint covers
  // both engines).
  await backfillGfsBuckets();
  await adapterEnsureColumn('users', 'locale', 'text');
  // Phase 14 AUTH-02 additive migration: session metadata + dormant 2FA columns.
  // Each def is byte-identical to the SCHEMA declaration (Pitfall P-B).
  await adapterEnsureColumn('sessions', 'label', 'text');
  await adapterEnsureColumn('sessions', 'ip', 'text');
  await adapterEnsureColumn('sessions', 'last_seen_at', 'integer');
  await adapterEnsureColumn('sessions', 'user_agent', 'text');
  await adapterEnsureColumn('users', 'two_fa_enabled', 'integer not null default 0');
  await adapterEnsureColumn('users', 'two_fa_secret', 'text');
  await adapterEnsureColumn('users', 'two_fa_last_step', 'integer not null default 0');
  // Phase 22 D-112: instance-operator privilege flag — def byte-identical to
  // the SCHEMA declaration (Pitfall P-B).
  await adapterEnsureColumn('users', 'is_instance_admin', 'integer not null default 0');
  // Phase 67 (D-13): the Entra AAD object id on the user row — def
  // byte-identical to the SCHEMA declaration (Pitfall P-B); idempotent boot.
  // Named aad_oid, NOT oid: SQLite 3.54+ refuses ADD COLUMN on reserved
  // alias names ("cannot add <name> alias: oid") — crashes container boot.
  // One-shot data migration below moves any pre-existing values over.
  await adapterEnsureColumn('users', 'aad_oid', 'text');
  // One-shot data migration: DBs created between Phase 67 and the aad_oid
  // rename carry a legacy users.oid TEXT column (added by the pre-3.54
  // ensureColumn). Copy any persisted values over once, then leave the old
  // column alone — SQLite 3.54+ also refuses DROP COLUMN on aliases, and
  // it is inert after this copy. Idempotent: the update matches only rows
  // where aad_oid is still null.
  try {
    await db.run('update users set aad_oid = (select oid from users u2 where u2.id = users.id) where aad_oid is null and exists (select 1 from users u3 where u3.id = users.id and u3.oid is not null)');
  } catch { /* legacy column absent — fresh DB, nothing to migrate */ }
  // Phase 67 (67-02): delivery ctx snapshot column — additive, byte-identical
  // to the SCHEMA declaration (Pitfall P-B); second boot is a no-op.
  await adapterEnsureColumn('webhook_deliveries', 'ctx', "text not null default ''");
  await db.run('create unique index if not exists workspaces_slug_idx on workspaces(slug)');
}

/* Module-level handle: assigned by initDb() inside the async boot below.
   Between import time and initDb completion it is null — nothing touches it
   because all consumers run inside the boot chain or request handlers that
   only start after server.listen(). */
let db = null;

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

/* D-05: AES-256-GCM envelope for the TOTP secret at rest — `v1:<iv>:<tag>:<ct>`,
   key derived from MASTER_KEY via sha256. D-K4 (frozen format, checkpoint-
   confirmed): version='v2' — written ONLY by the enable path — emits
   `v2:<key-id>:<iv>:<tag>:<ct>` where the id is the first 8 hex chars of the
   SAME sha256 call that yields the AES key (Pitfall 3: one hash, both uses).
   The boot migration keeps writing v1 (Phase 26 re-wrap owns the rest).
   Returns null when MASTER_KEY is missing/undecryptable; the caller must fail
   closed 503 (D-06) BEFORE any state mutation. Recovery codes are never
   encrypted (D-09/D-51). */
function encryptTotpSecret(secretB32, version = 'v1') {
  if (!MASTER_KEY) return null;
  try {
    const digest = crypto.createHash('sha256').update(MASTER_KEY);
    const key = digest.digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(String(secretB32), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    if (version === 'v2') {
      return `v2:${key.toString('hex').slice(0, 8)}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
    }
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
  } catch {
    return null;
  }
}

// Mirror of encryptTotpSecret — returns the plaintext secret or null when the
// envelope is undecryptable (wrong/missing MASTER_KEY, tampered tag). Callers
// fail closed 503 (D-06) rather than proceeding.
// D-K4/D-K5: version dispatch. v1 resolves against the CURRENT key (no key id
// in the v1 layout — unchanged behavior). v2 = `v2:<key-id>:<iv>:<tag>:<ct>`:
// the id is validated strictly as [0-9a-f]{8} and resolved through the keyring;
// every failure (malformed shape, unknown id, missing key, tampered tag) is the
// SAME null return — no third error shape, no plaintext fallback (D-78a). The
// catch swallows GCM auth failures exactly like v1; no try/catch flow control.
function decryptTotpSecret(envelope) {
  if (!MASTER_KEY) return null;
  try {
    const parts = String(envelope).split(':');
    if (parts[0] === 'v1') {
      const [, ivB64, tagB64, ctB64] = parts;
      if (!ivB64 || !tagB64 || !ctB64) return null;
      const key = crypto.createHash('sha256').update(MASTER_KEY).digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
    }
    if (parts[0] === 'v2') {
      const [, kid, ivB64, tagB64, ctB64] = parts;
      if (parts.length !== 5) return null;
      if (!/^[0-9a-f]{8}$/.test(kid || '')) return null; // D-K5 strictness
      if (!ivB64 || !tagB64 || !ctB64) return null;
      const material = KEYRING.get(kid);
      if (!material) return null; // unknown key id → fail closed, same as tampered
      const key = crypto.createHash('sha256').update(material).digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
    }
    return null;
  } catch {
    return null;
  }
}

/* D-77/D-79: single decrypt boundary — requireTotpSecret is the ONLY caller of
   decryptTotpSecret (D-78c exclusivity, proven by test/totp-encryption.test.mjs).
   Call sites branch on ok and fail closed 503 with code masterKeyMissing (D-80);
   per-route body copy stays verbatim (D-81). No plaintext fallback exists or may
   be added (D-78a). */
/* Parameterized copy of decryptTotpSecret's v1 branch — Phase 26 re-wrap helper.
   The v1 layout carries NO key id (D-K4), so rotation cannot dispatch it through
   the keyring: the re-wrap pass supplies the material (current first, then
   PREVIOUS — D-K8 trial order). Standalone sibling on purpose (lean choice):
   decryptTotpSecret's D-78c-tested body is untouched. Returns utf8 plaintext or
   null on ANY error — same single failure shape as decryptTotpSecret (D-78a).
   Not a runtime boundary: the only caller is migrateTotpReWrap at boot. */
function decryptV1WithMaterial(envelope, material) {
  try {
    const [, ivB64, tagB64, ctB64] = String(envelope).split(':');
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const key = crypto.createHash('sha256').update(material).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function requireTotpSecret(envelope) {
  const secret = decryptTotpSecret(envelope); // already returns null on EVERY failure
  return secret ? { ok: true, secret } : { ok: false };
}

/* D-46: pending (not-yet-verified) TOTP secrets live ONLY here — in memory,
   keyed by user_id, with a 10-minute TTL. Nothing touches users.two_fa_secret
   until enable succeeds; a server restart mid-enrollment just means re-scanning
   the QR. Re-enroll overwrites the single pending entry. */
const PENDING_TFA_TTL = 10 * 60 * 1000;
const pendingTfa = new Map();
/* TOTP2 (Phase 31 Plan 02, D-13): stagedId extends the SAME map's key to
   `${userId}:${stagedId}` for additional-factor enrollments (a user may stage
   several factors at once) — the legacy userId key stays for the first-ever
   enroll route. Label rides the entry: the enable step stores it verbatim.
   Memory-only, 10-minute TTL, lazy sweep — never persisted (D-46 invariant). */
function stashPendingTfa(userId, secret, otpauth, stagedId = null, label = null) {
  const t = now();
  const key = stagedId ? `${userId}:${stagedId}` : userId;
  pendingTfa.set(key, { secret, otpauth, expiresAt: t + PENDING_TFA_TTL, label });
  // Lazy sweep, same shape as the attempts Map — bounded memory (T-16-08).
  if (pendingTfa.size > 5000) for (const [k, v] of pendingTfa) if (t > v.expiresAt) pendingTfa.delete(k);
}

/* TOTP2 (Phase 31, D-10/D-11/D-12): the shared factor-loop verifier — the ONE
   runtime TOTP verification surface for enrolled factors. Loads every
   totp_factors row in enrollment order, decrypts each through
   requireTotpSecret (D-77: the ONLY boundary — never decryptTotpSecret
   directly) and skips an undecryptable factor alone, failing closed for that
   factor only (D-12). First matching code short-circuits (D-11); the caller
   counts ONE failed attempt per submission regardless of factor count.
   decrypted === 0 tells the caller nothing was verifiable → fail closed 503
   (Pitfall 3). Callers persist matchedStep to the matched factor's last_step
   — the users.two_fa_last_step column is never written from here (D-06).
   excludeFactorId (Plan 02, D-15/D-16): removes ONE factor from the
   candidate set — the remove route requires a code from a factor that is
   NOT the removed one, so self-lockout is structurally impossible. */
async function verifyTotpAgainstFactors(userId, code, nowSec, excludeFactorId = null) {
  const rows = (await db.all('select id, secret, last_step from totp_factors where user_id = ? order by created_at', [userId])).filter(
    row => row.id !== excludeFactorId,
  );
  let decrypted = 0;
  for (const row of rows) {
    const wrapped = requireTotpSecret(row.secret);
    if (!wrapped.ok) continue; // D-12: undecryptable factor skipped alone
    decrypted++;
    const verified = verifyTotpCode(wrapped.secret, code, row.last_step || null, nowSec);
    if (verified.ok) return { ok: true, factorId: row.id, matchedStep: verified.matchedStep, decrypted };
  }
  return { ok: false, decrypted };
}

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
async function uniqueSlug(base, excludeId = null) {
  let root = sanitizeSlug(base) || 'workspace';
  root = root.slice(0, 32).replace(/-+$/g, '');
  let slug = root;
  let n = 2;
  while (await db.get('select 1 from workspaces where slug = ? collate nocase and id is not ?', [slug, excludeId])) {
    slug = `${root}-${n++}`;
  }
  return slug;
}

async function wsBySlug(slug) {
  return (await db.get('select * from workspaces where slug = ? collate nocase', [String(slug || '')])) || null;
}

async function membershipOf(workspaceId, userId) {
  return (await db.get('select * from memberships where workspace_id = ? and user_id = ?', [workspaceId, userId])) || null;
}

async function membershipsOf(userId) {
  /* [2026-11-20, owner quick-task] Instance-admin super-access (server side):
     the operator's membership list is UNIONed with every workspace in the
     instance, so the switcher lists them all ("Governance + switcher" entry
     decision). Real memberships keep their real role/member_id; foreign ones
     get the same synthetic shape requireWorkspace synthesizes — owner while
     active, viewer once archived (read-only entry, 79-D-02 preserved for
     members). dedup by id, real membership wins.
     NOTE the two redirect consumers (workspace delete / leave "nextSlug")
     use membershipsOnly below — redirecting into a foreign workspace the
     operator merely super-accesses would be surprising; they keep landing on
     a REAL membership. */
  const rows = await db.all(
    `select w.*, m.role, m.member_id
       from memberships m join workspaces w on w.id = m.workspace_id
      where m.user_id = ? and w.archived = 0
      order by w.created_at, w.name collate nocase`,
    [userId],
  );
  const user = await db.get('select is_instance_admin from users where id = ?', [userId]);
  if (!user || !user.is_instance_admin || !SUPER_ACCESS) return rows;
  const all = await db.all('select * from workspaces order by created_at, name');
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const w of all) {
    if (!byId.has(w.id)) {
      byId.set(w.id, { ...w, role: w.archived === 1 ? 'viewer' : 'owner', member_id: null, origin: null });
    }
  }
  return [...byId.values()].sort((a, b) => a.created_at - b.created_at || a.name.localeCompare(b.name));
}

/* Real membership rows only (no super-access union) — delete/leave redirects. */
async function membershipsOnly(userId) {
  return await db.all(
    `select w.*, m.role, m.member_id
       from memberships m join workspaces w on w.id = m.workspace_id
      where m.user_id = ? and w.archived = 0
      order by w.created_at, w.name`,
    [userId],
  );
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
    /* Phase 43 (D-08/D-11): the logo reference rides the workspace document;
       null when unset — every consumer falls back per-surface (D-10). The
       versioned URL comes from the single logoShape builder. */
    logo: logoShape(row, docLogo(row)),
  };
}

async function userPayload(user) {
  /* Phase 85 (D-23/D-25): capability flags recomputed per load via the
     hasInstanceRole funnel — render-only for the client, never client-side
     role logic; revocation drops the flag on the next payload load. */
  const caps = await userCapabilities(user);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale ?? null,
    twoFa: !!user.two_fa_enabled, // server ground truth for the settings 2FA card (16-03, T-16-13)
    isInstanceAdmin: !!user.is_instance_admin, // server ground truth for the operator card (D-112: DB flag only)
    canBackup: caps.includes(CAP.BACKUP_MANAGE), // D-23: backup-surface visibility (D-21)
    canRestore: caps.includes(CAP.RESTORE_USE), // D-23: restore actions visibility (D-22)
    workspaces: (await membershipsOf(user.id)).map(row => workspacePayload(row, row)),
  };
}

async function firstWorkspace() {
  // Phase 79 (A5/D-02): the boot fallback never lands a member in an archived
  // workspace — they would immediately hit the workspaceArchived refusal.
  return (await db.get('select * from workspaces where archived = 0 order by created_at, name collate nocase limit 1')) || null;
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
  // Auth state lives in the sessions table and user columns, never in the
  // document (D-30): drop legacy sessions/tfa keys on every read.
  delete out.data.sessions;
  delete out.data.tfa;
  // P4-a: notifications are per-recipient — rows without `to` are pre-P4 legacy and purged.
  // Recipient validity is checked in docForClient, AFTER syncProfiles rebuilds the roster:
  // the stored document intentionally carries no members.
  if (Array.isArray(out.data.notifs)) out.data.notifs = out.data.notifs.filter(n => n && typeof n.to === 'string' && n.to);
  /* TEAM-05 (D-02): membership left the document — doc.teams[] carries only the
     team definitions (id, name, color). A stale or crafted document carrying
     members arrays is stripped on every read; the roster lives in team_members. */
  if (Array.isArray(out.data.teams)) {
    out.data.teams = out.data.teams.map(t => {
      if (!t || typeof t !== 'object' || !('members' in t)) return t;
      const definition = { ...t };
      delete definition.members;
      return definition;
    });
  }
  /* PREFS (Phase 34, D-02/D-04): per-user notification preferences live in the
     user_notif_prefs table — the document is never a prefs carrier again. A
     stale or crafted document carrying notifPrefs is stripped on every read;
     the D-27-5 read-side default merge is retired with the doc field itself. */
  delete out.data.notifPrefs;
  /* VIEWS (Phase 57, D-05/D-06): per-user view state lives in the saved_views
     table — the document is never a view-state carrier again. A stale or
     crafted document carrying the top-level views field is stripped on every
     read; migrateUserViews moved the legacy blobs into rows at boot. */
  delete out.views;
  /* [Phase 55, D-55-1..4] Read-time assignee migration: every task and subtask
     leaves this function carrying `assignees` as an array — the one canonical
     shape (D-55-3, array-only reads). Old scalar `assignee` docs self-heal to
     `[old]` (D-55-2); invariants (dedupe, junk strip, cap 5) are enforced HERE
     in one place so no consumer defends individually. The OUT-OF-SCOPE strip
     needs a resolved member roster: it runs where the roster is authoritative
     — docForClient (after syncProfiles) and mergeClientDoc — so a raw stored
     doc with an incomplete roster is never destructively stripped on migration. */
  normalizeAssigneesData(out.data, []);
  /* [Phase 65, 65-01] Read-side subtask-tree heal — every task leaves this
     function carrying the canonical flat { id, parentId, position } shape. */
  normalizeSubtasksData(out.data, uid);
  /* [Phase 66, 66-01 D-01/D-02/D-04] Read-side templates pass — every
     template leaves this function carrying the whitelisted D-02 shape
     (unknown fields dropped by construction, D-04), embedded subtask
     trees healed. gate=false: heal-only — a stored doc that slipped
     past the write gate must never become a read failure. Mirrors the
     Phase 65 read-path asymmetry. */
  normalizeTemplatesData(out.data, uid, { gate: false });
  return out;
}

/* [Phase 55, D-55-1..4] The single assignee-normalization step. Sync and
   idempotent: an old scalar `assignee` joins the candidate set alongside any
   existing `assignees` array; ids are deduped, nulls/junk dropped, ids outside
   the document's member roster dropped (out-of-scope strip), the result capped
   at 5 in insertion order, written back to `assignees` (an empty array is
   valid — Unassigned), and the scalar field deleted. Runs on every read
   (normalizeDoc/docForClient) and on every incoming doc (mergeClientDoc).
   `memberIds` may be supplied by a caller holding the authoritative roster;
   when omitted it is derived from `data.members`. A missing/empty roster
   disables the scope strip — a doc with no member set has nothing to resolve
   against, and the write-guard re-derives per member anyway (D-55-9). */
function normalizeTaskAssignees(t, memberIds) {
  const incoming = [];
  if (Array.isArray(t.assignees)) incoming.push(...t.assignees);
  if (t.assignee !== null && t.assignee !== undefined && t.assignee !== '') incoming.push(t.assignee);
  const out = [];
  const seen = new Set();
  for (const id of incoming) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    if (memberIds && memberIds.size && !memberIds.has(id)) continue; // out-of-scope strip (D-55-4)
    seen.add(id);
    out.push(id);
    if (out.length === 5) break; // cap 5, insertion order preserved (D-55-7)
  }
  t.assignees = out;
  delete t.assignee;
  if (Array.isArray(t.subtasks)) {
    for (const s of t.subtasks) if (s && typeof s === 'object') normalizeTaskAssignees(s, memberIds);
  }
}

function normalizeAssigneesData(data, memberIds = null) {
  if (!data || !Array.isArray(data.tasks)) return;
  const ids = memberIds
    ? new Set(memberIds)
    : new Set((Array.isArray(data.members) ? data.members : []).map(m => m?.id).filter(Boolean));
  for (const t of data.tasks) {
    if (!t || typeof t !== 'object') continue;
    normalizeTaskAssignees(t, ids);
  }
}

/* [Phase 65, 65-01 D-01/D-01a/D-03] The subtask-tree normalize pass — the
   mirror of normalizeAssigneesData above, recursing over every task's flat
   subtasks[] array. Mutates in place via the shared DOM-free module:
   legacy flat entries heal (parentId → null, junk position → array index),
   non-object entries are spliced, missing ids are generated through the
   server's uid() scheme, and any parentId not resolving INSIDE the same
   task's array — dangling or a crafted cross-task reference — normalizes
   to null so cross-task linkage never persists (T-65-02). Runs on every
   read (normalizeDoc — docForClient delegates to it) and on every incoming
   doc (mergeClientDoc), before the perm gates read tasks. */
function normalizeSubtasksData(data, uidFactory) {
  if (!data || !Array.isArray(data.tasks)) return;
  for (const t of data.tasks) {
    if (!t || typeof t !== 'object') continue;
    normalizeTaskSubtasks(t, uidFactory);
  }
}

/* [2026-11-07 D-49-4] Visibility is the boolean `private` flag only. The
   legacy `access: 'private'` spelling is retired — the Phase 49 sweep
   strips it from every stored document, so honoring it here would let a
   crafted pre-sweep document resurrect the old model. */
function projectIsPrivate(p) {
  if (!p || typeof p !== 'object') return false;
  return p.private === true;
}

/* [2026-11-08 D-50-5] LIVE team-link resolution — the third term of the single
   visibility predicate: public ∨ memberId ∈ p.members ∨ member's team ∈ p.teams.
   member_id space (p.members) → memberships.user_id → team_members (user_id
   space), the same join direction the Phase 49 sweep documented. Resolved
   fresh on EVERY evaluation — no memoization anywhere in the funnel
   (D-50-3): a team join grants access on the very next request, a leave
   revokes it the same way. `membershipRow` (when the caller already holds
   the memberships row, e.g. requireWorkspace's ctx) supplies user_id
   directly and skips the lookup. */
async function teamsOfMember(wsId, memberId, membershipRow) {
  let userId = membershipRow?.user_id ?? null;
  if (!userId && memberId && wsId) {
    userId = (await db.get('select user_id from memberships where workspace_id = ? and member_id = ?', [wsId, memberId]))?.user_id || null;
  }
  if (!userId || !wsId) return [];
  const rows = await db.all('select team_id from team_members where workspace_id = ? and user_id = ?', [wsId, userId]);
  return rows.map(r => r.team_id);
}

/* A private project is visible to its access list, and (D-50-5) to every
   current member of a linked team unless they lost the link. Callers that
   hold the member's live team ids pass them in; without them (the admin
   hiddenProjectIds path) only the access list applies — the same
   access-list-gated admin posture Phase 49 pinned. */
function canSeeProject(p, memberId, memberTeams = []) {
  if (!projectIsPrivate(p)) return true;
  if (!memberId) return false;
  if (Array.isArray(p.members) && p.members.includes(memberId)) return true;
  return Array.isArray(p.teams) && p.teams.length > 0 && memberTeams.some(t => p.teams.includes(t));
}

/*
 * [2026-11-07 D-49-2/D-49-3, 2026-11-08 D-50-5] The ONE member-level readable
 * predicate after the visibility collapse. The D-49-retired Phase 29 scope
 * term is gone; the LIVE team term is restored by D-50-5 (public ∨ access
 * list ∨ linked team). Kept `async` because every consumer already awaits it.
 */
async function memberCanReadProject(p, wsId, memberId) {
  if (canSeeProject(p, memberId)) return true;
  if (!Array.isArray(p?.teams) || !p.teams.length || !wsId || !memberId) return false;
  const memberTeams = await teamsOfMember(wsId, memberId, null);
  return canSeeProject(p, memberId, memberTeams);
}

/* SEARCH (Phase 58, D-06): plain-text snippet around the first folded term
   match in the task description — the searchall HTML-strip treatment, no
   FTS5 snippet()/highlight() markup (no server-generated HTML surface).
   The fold's original-index map lands the slice on the ORIGINAL string so
   accented characters stay intact. Title-only matches answer the head of
   the description (or '') — the client renders hl() on the title itself. */
function searchSnippet(task, terms) {
  const plain = String(task?.desc ?? '').replace(/<[^>]+>/g, ' ');
  const { text: folded, map } = foldForSearch(plain);
  let at = -1;
  for (const term of terms) {
    const i = folded.indexOf(term);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return plain.slice(0, 140).trim();
  const start = Math.max(0, (map[at] ?? 0) - 40);
  const end = Math.min(plain.length, (map[Math.min(at + 80, folded.length - 1)] ?? plain.length) + 1);
  return (start > 0 ? '…' : '') + plain.slice(start, end).trim() + (end < plain.length ? '…' : '');
}

/* [2026-11-08 Phase 52, D-52-5/D-52-6] The transparency LABEL helper — a pure
   mirror of canSeeProject's short-circuit order (above) that names the FIRST
   matching reason. It never edits the funnel: the predicate above stays the
   single authority. The lead check inside the membership tier is a label
   refinement only — normalizeProjects guarantees lead ∈ members on every
   normalized read, so `lead` and `member` are the same predicate term and
   'lead' merely names it. Coarse machine CODES only ('everyone' | 'lead' |
   'member' | 'team') — never team rosters or access lists (T-52-03). */
function projectAccessReason(p, memberId, memberTeams = []) {
  if (!projectIsPrivate(p)) return 'everyone';
  if (!memberId) return null;
  if (p.lead === memberId) return 'lead';
  if (Array.isArray(p.members) && p.members.includes(memberId)) return 'member';
  if (Array.isArray(p.teams) && p.teams.length > 0 && memberTeams.some(t => p.teams.includes(t))) return 'team';
  return null;
}

function canManageProject(p, memberId, role) {
  if (role === 'owner' || role === 'admin') return true;
  return !!memberId && p?.lead === memberId;
}

/* [2026-11-09 Phase 53 (53-01), PSET-02/03] Per-team permission levels live as
   namespaced keys INSIDE the existing p.perms map ('team:'+teamId) — never a
   top-level field (zero sink changes: the pin block, the removal sweep and
   normalizeProjects' object check cover them for free). The ONE content-write
   gate after the visibility collapse: returns the member's effective
   permission TIER — one of PROJECT_PERMS. Visibility stays boolean (D-03):
   this gates content writes only, never reads. Rank order mirrors PERMS in
   src/overlays/modals.js:195 (duplicated literal — server.js never imports
   client modules). Semantics (docs/ProjectPermissions.md, decision A3):
   role owner/admin or p.lead ⇒ 'Full access'; otherwise the BEST
   (highest-ranked) of the direct p.perms[memberId] entry and every live
   p.perms['team:'+t] entry where t ∈ memberTeams ∩ p.teams; a member with no
   applicable entry defaults to the per-person tier ('Can edit' for members,
   'Can comment' for guests/viewer — the shareModal defaults) when they sit on
   the access list or a linked team; a caller who canSeeProject but holds NO
   applicable entry (a public-project non-member) ranks 'Can view' — see ≠
   write. Enforcement reads the STORED doc (D-51-15/16 rule). Team 'Full
   access' is content-only: canManageProject stays the manager gate (D-01),
   and this function never grants management. */
/* [2026-11-09 IN-01] The tier ladder mirrors the client's PERMS literal
   (src/overlays/modals.js) — one contract, two sides; drift is pinned in
   test/perm-drift.test.mjs. */
const PROJECT_PERMS = ['Can view', 'Can comment', 'Can edit', 'Full access'];

function projectPermFor(p, memberId, memberTeams = [], role = null) {
  if (!p || typeof p !== 'object') return 'Can view';
  if (role === 'owner' || role === 'admin') return 'Full access';
  if (memberId && p.lead === memberId) return 'Full access';
  const rank = v => {
    const i = PROJECT_PERMS.indexOf(v);
    return i === -1 ? -1 : i;
  };
  const perms = p.perms && typeof p.perms === 'object' ? p.perms : {};
  let best = rank(perms[memberId]);
  const teams = Array.isArray(p.teams) ? p.teams : [];
  const mine = Array.isArray(memberTeams) ? memberTeams : [];
  for (const t of mine) {
    if (!teams.includes(t)) continue;
    best = Math.max(best, rank(perms['team:' + t]));
  }
  if (best === -1) {
    const onAccessList = Array.isArray(p.members) && p.members.includes(memberId);
    const onLinkedTeam = teams.some(t => mine.includes(t));
    if (!onAccessList && !onLinkedTeam) return 'Can view'; // see ≠ write
    return role === 'viewer' ? 'Can comment' : 'Can edit';
  }
  return PROJECT_PERMS[best];
}

/*
 * [2026-11-07 D-49-1] The ONE hidden-project funnel after the visibility
 * collapse: private-hidden only. The D-49-retired Phase 29 scoped branch
 * (projectScope / inScopeProject / scopeGrants) is gone (D-49) — membership scope
 * columns were
 * materialized into project access lists by the boot sweep and cleared, so
 * the scoped term has no input left to read. Admin/owner keep the plain
 * hiddenProjectIds path (exemption on top, D-06).
 */
async function hiddenFor(doc, membership) {
  /* [2026-11-20, owner quick-task] Super-access: the SYNTHETIC operator
     membership (member_id null — an instance admin entering a workspace they
     have no membership in) reads every project, private ones included. This
     deliberately does NOT widen real owner-rank memberships: D-50-5 keeps
     real owners/admins blind to private projects they are not on (pinned at
     test/privacy.test.mjs:236 and the phase-03 matrix). The
     hiddenProjectIds(doc, null) fallback below serves caller shapes without
     a membership row. */
  if (membership && membership.member_id === null && ROLE_RANK[membership.role] >= ROLE_RANK.owner) {
    return new Set();
  }
  if (membership?.workspace_id && ROLE_RANK[membership.role] < ROLE_RANK.admin) {
    const memberId = membership.member_id || null;
    /* [2026-11-08 D-50-5] the member's LIVE team ids, resolved once per funnel
       evaluation (the membership row already carries user_id — no extra
       lookup, no memoization). */
    const memberTeams = await teamsOfMember(membership.workspace_id, memberId, membership);
    const seen = new Set();
    for (const p of doc?.data?.projects || []) {
      if (p?.id && !canSeeProject(p, memberId, memberTeams)) seen.add(p.id);
    }
    return seen;
  }
  return hiddenProjectIds(doc, membership?.member_id || null);
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
    /* [2026-11-07 D-49-6] The legacy scalar `team` → `teams[]` migration and
       the teams[] normalization are retired: the Phase 49 sweep deletes
       p.teams from every stored document, and re-adding the field here would
       break the sweep's second-boot byte-identity marker. */
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
    /* [2026-11-09 Phase 53 (53-01), PSET-02] Team-perm keys ride p.perms as
       'team:'+teamId — a dangling key (team id not in p.teams) or a
       non-PERMS value is swept in place, fail-safe (delete, never throw).
       Non-team keys keep their member semantics (the pin block already pins
       p.perms wholesale on non-manager PUTs). */
    if (p.perms && typeof p.perms === 'object') {
      const pTeams53 = Array.isArray(p.teams) ? p.teams : [];
      for (const k of Object.keys(p.perms)) {
        if (!k.startsWith('team:')) continue;
        if (!pTeams53.includes(k.slice(5)) || !PROJECT_PERMS.includes(p.perms[k])) delete p.perms[k];
      }
    }
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
      if (typeof value === 'string' && value.trim()) terms.push(value.trim().normalize('NFC').toLowerCase());
    }
  }
  return terms;
}

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

async function redactDoc(doc, membership) {
  const data = doc?.data;
  if (!data) return doc;
  // [2026-11-07 D-49-1] the single collapsed funnel — private-hidden only.
  const hiddenProjects = await hiddenFor(doc, membership);
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

async function mergeClientDoc(incoming, stored, membership, wsId, refusals = []) {
  const next = incoming && typeof incoming === 'object' ? JSON.parse(JSON.stringify(incoming)) : {};
  next.data = next.data && typeof next.data === 'object' ? next.data : {};
  normalizeProjects(stored);
  /* [Phase 57 VIEW-03, A3/T-57-07] Default-visibility seeding evidence:
     which incoming NEW projects carry NO explicit private key — captured
     BEFORE normalizeProjects fills `private: false` on every row and
     destroys the "absent" evidence. Only read when the STORED pref is on
     (same stored-doc read as permCreate below — never the incoming blob).
     An explicit private (true or false) always wins over the pref (D-04). */
  const seedPrivateIds = new Set();
  if (stored?.prefs?.defaultPrivate === true && Array.isArray(next.data?.projects)) {
    const storedIds = new Set(
      (Array.isArray(stored?.data?.projects) ? stored.data.projects : []).map(p => p?.id),
    );
    for (const p of next.data.projects) {
      if (p && typeof p === 'object' && p.id && !storedIds.has(p.id) && !('private' in p)) {
        seedPrivateIds.add(p.id);
      }
    }
  }
  normalizeProjects(next);
  /* [Phase 55, D-55-1/D-55-4] Every incoming doc normalizes to the canonical
     `assignees[]` shape before any downstream consumer (merge gates, the
     write-guard) reads it. The roster scope set is the union of stored and
     incoming members — an admin roster edit and the task writes ride the same
     PUT, and the removed member's assignments are handled by stripMember. */
  normalizeAssigneesData(next.data, [
    ...((Array.isArray(stored?.data?.members) ? stored.data.members : []).map(m => m?.id)),
    ...((Array.isArray(next.data.members) ? next.data.members : []).map(m => m?.id)),
  ].filter(Boolean));
  /* [Phase 65, 65-01 D-01/D-01a/D-03] The subtask-tree whitelist sink — runs
     right after the assignee pass, BEFORE any perm gate reads tasks, so the
     stored doc and every downstream consumer (FTS, exports, MCP) always see
     the healed { id, parentId, position } shape (T-65-01/T-65-02). */
  /* [Phase 65, 65-02 D-04/D-05 T-65-04/T-65-05] Wholesale tree-shape reject —
     runs BEFORE the lazy heal because the heal re-roots self-parents (a raw
     self-parenting PUT must be rejected, never silently normalized). Only
     tasks whose subtasks changed shape are validated (cheap serialized
     id/parentId/position/done signature) — once per changed task, not per
     read (T-65-05). A violation throws inside the funnel tx: db.tx rolls
     back, the catch below maps the code to a 400 (fail()), and neither the
     stored doc nor the FTS index changes. */
  {
    const storedTasks65 = new Map(
      (Array.isArray(stored?.data?.tasks) ? stored.data.tasks : []).map(t => [t?.id, t]).filter(([id]) => id),
    );
    const subSig65 = list => JSON.stringify((Array.isArray(list) ? list : []).map(s => [s?.id, s?.parentId, s?.position, !!s?.done]));
    for (const t of next.data.tasks || []) {
      if (!t || typeof t !== 'object' || !Array.isArray(t.subtasks) || !t.subtasks.length) continue;
      const prev65 = storedTasks65.get(t.id);
      if (prev65 && subSig65(prev65.subtasks) === subSig65(t.subtasks)) continue;
      const verdict = validateSubtree(t.subtasks);
      if (!verdict.ok) {
        const err = new Error(verdict.code === 'subtaskCycle' ? 'That change would create a subtask cycle' : 'Subtasks cannot nest deeper than five levels');
        err.status = 400;
        err.code = verdict.code;
        throw err;
      }
    }
  }
  normalizeSubtasksData(next.data, uid);
  /* [Phase 66, 66-01 D-01/D-02/D-04] The templates whitelist sink — the
     D-53-1/Phase 65 trap defense: doc.templates[] is rebuilt per-record
     through sanitizeTemplate (unknown fields silently dropped, D-04),
     beside the subtask pass and BEFORE any perm gate reads tasks, so
     the stored doc and every downstream consumer (FTS, exports, MCP)
     always see the canonical D-02 shape. The stored templates ride along
     so unchanged bodies skip the wholesale validateSubtree walk (the
     subSig65 semantics — v2.4 audit tech-debt fix). */
  normalizeTemplatesData(next.data, uid, { storedTemplates: stored?.data?.templates });
  const memberId = membership?.member_id || null;
  const role = membership?.role || 'member';
  /* [2026-11-08 D-51-15/16, T-51-01] The project-creation restriction is read
     from the STORED document's prefs ONLY — the client ships its prefs copy on
     every save, so the incoming one is never trusted (Pitfall 3). Read fresh
     per request: a settings flip bites on the very next PUT (D-51-16 — no
     cache, no restart). */
  const createRestricted = stored?.prefs?.permCreate === true;
  const isWorkspaceManager = ROLE_RANK[role] >= ROLE_RANK.admin;
  // [2026-11-07 D-49-1] same collapsed funnel as the read side — hidden rows
  // can never be resurrected by a stale client doc PUT.
  const hiddenProjects = await hiddenFor(stored, membership);
  const storedData = stored?.data || {};
  const nextData = next.data;

  // Tasks reserved by a hidden project, whether they are stored there or being moved there.
  const reservedTasks = hiddenTaskIds(stored, hiddenProjects);
  for (const t of nextData.tasks || []) if (t?.id && hiddenProjects.has(t.project)) reservedTasks.add(t.id);

  /* [2026-11-09 Phase 53 (53-01), T-53-03] The per-team content-write gate,
     enforced SERVER-side on the STORED doc (D-51-15/16 rule — never the
     incoming payload). Task writes (create, edit, move, delete) require
     ≥ 'Can edit'; the refusal is keyed and scoped per item (the D-51-15
     shape) — the rest of the PUT still merges, never a whole-PUT 403
     (Pitfall 1). Denied rows are held via the merge reserved-sets below, so
     the stored row survives byte-identical. Visibility stays boolean (D-03);
     project-level routes stay under canManageProject (D-01). */
  const permDeniedTasks = new Set();
  const permDeniedComments = new Set();
  const permDeniedFiles = new Set();
  const isBelowManager = !isWorkspaceManager && !!memberId;
  const memberTeams53 = isBelowManager && membership?.workspace_id
    ? await teamsOfMember(membership.workspace_id, memberId, membership)
    : [];
  if (isBelowManager) {
    const permProjects = new Map((storedData.projects || []).map(p => [p?.id, p]).filter(([id]) => id));
    const effCache = new Map();
    const effFor = pid => {
      if (!effCache.has(pid)) effCache.set(pid, projectPermFor(permProjects.get(pid), memberId, memberTeams53, role));
      return effCache.get(pid);
    };
    const EDIT_RANK = PROJECT_PERMS.indexOf('Can edit');
    const COMMENT_RANK = PROJECT_PERMS.indexOf('Can comment');
    const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
    /* Task writes (create, edit, move, delete) require ≥ 'Can edit'. */
    const storedTasksById = new Map((storedData.tasks || []).map(t => [t?.id, t]).filter(([id]) => id));
    const incomingTaskIds = new Set((nextData.tasks || []).map(t => t?.id).filter(Boolean));
    /* [2026-11-09 CR-01 fix] Gate on the STORED row's project ("stored parent
       wins" — same rule as the comment gate): a member cannot re-point a row's
       project to dodge the source-project check, and a row that drops its
       project binding entirely can never skip the gate. Fail closed: an id
       with no resolvable project is refused (held byte-identical), never
       merged past the gate. */
    for (const t of nextData.tasks || []) {
      if (!t?.id) continue;
      const prev = storedTasksById.get(t.id);
      const tProj = prev?.project || t.project;
      if (!tProj) { permDeniedTasks.add(t.id); continue; }
      if (hiddenProjects.has(tProj) || reservedTasks.has(t.id)) continue;
      if (prev && !changed(prev, t)) continue;
      if (PROJECT_PERMS.indexOf(effFor(tProj)) < EDIT_RANK) permDeniedTasks.add(t.id);
    }
    // A delete is a content write too: a stored row the actor dropped from the
    // incoming list is held back unless they may edit its project.
    for (const [id, t] of storedTasksById) {
      if (incomingTaskIds.has(id) || reservedTasks.has(id)) continue;
      if (!t?.project || hiddenProjects.has(t.project)) continue;
      if (PROJECT_PERMS.indexOf(effFor(t.project)) < EDIT_RANK) permDeniedTasks.add(id);
    }
    /* Comment writes (create, edit, delete) require ≥ 'Can comment'; the
       project comes from the parent task (stored parent wins — a comment can
       never relocate itself onto a task the payload claims). */
    const storedCommentsById = new Map((storedData.comments || []).map(c => [c?.id, c]).filter(([id]) => id));
    const incomingCommentIds = new Set((nextData.comments || []).map(c => c?.id).filter(Boolean));
    const storedTasksProject = new Map([...storedTasksById].map(([id, t]) => [id, t?.project || null]));
    const commentProject = c => storedTasksProject.get(c?.task)
      || (nextData.tasks || []).find(t => t?.id === c?.task)?.project
      || (storedData.files || []).find(f => f?.id && f?.task === c?.task)?.project
      || null;
    for (const c of nextData.comments || []) {
      if (!c?.id || !c.task) continue;
      if (hiddenProjects.has(commentProject(c)) || reservedTasks.has(c.task)) continue;
      const prev = storedCommentsById.get(c.id);
      if (prev && !changed(prev, c)) continue;
      if (PROJECT_PERMS.indexOf(effFor(commentProject(c))) < COMMENT_RANK) permDeniedComments.add(c.id);
    }
    for (const [id, c] of storedCommentsById) {
      if (incomingCommentIds.has(id) || reservedTasks.has(c?.task)) continue;
      const proj = commentProject(c);
      if (!proj || hiddenProjects.has(proj)) continue;
      if (PROJECT_PERMS.indexOf(effFor(proj)) < COMMENT_RANK) permDeniedComments.add(id);
    }
    /* File record writes (attach, edit metadata, delete) require ≥ 'Can edit'
       — the /w/:slug/files REST upload carries no project binding (the record
       rides the doc channel), so the doc funnel IS the file gate. */
    const storedFilesById = new Map((storedData.files || []).map(f => [f?.id, f]).filter(([id]) => id));
    const incomingFileIds = new Set((nextData.files || []).map(f => f?.id).filter(Boolean));
    /* [2026-11-09 CR-01 fix] Same stored-wins rule as tasks: the file record's
       project comes from the stored row first; an unresolvable id fails
       closed. */
    for (const f of nextData.files || []) {
      if (!f?.id) continue;
      const prevF = storedFilesById.get(f.id);
      const fProj = prevF?.project || f.project;
      if (!fProj) { permDeniedFiles.add(f.id); continue; }
      if (hiddenProjects.has(fProj) || reservedTasks.has(f.task)) continue;
      if (prevF && !changed(prevF, f)) continue;
      if (PROJECT_PERMS.indexOf(effFor(fProj)) < EDIT_RANK) permDeniedFiles.add(f.id);
    }
    for (const [id, f] of storedFilesById) {
      if (incomingFileIds.has(id) || reservedTasks.has(f?.task)) continue;
      if (!f?.project || hiddenProjects.has(f.project)) continue;
      if (PROJECT_PERMS.indexOf(effFor(f.project)) < EDIT_RANK) permDeniedFiles.add(id);
    }
    for (const id of permDeniedTasks) refusals.push({ code: 'projectPermDenied', task: id });
    for (const id of permDeniedComments) refusals.push({ code: 'projectPermDenied', comment: id });
    for (const id of permDeniedFiles) refusals.push({ code: 'projectPermDenied', file: id });
  }

  nextData.projects = mergeList(storedData.projects, nextData.projects, hiddenProjects);
  const storedProjects = new Map((storedData.projects || []).map(p => [p.id, p]));
  const refusedCreateIds = new Set();
  for (const p of nextData.projects) {
    if (!p?.id) continue;
    const prev = storedProjects.get(p.id);
    /* [2026-11-08 D-51-15/16, CRT-01] The scoped create-refusal: a
       below-admin actor on a restricted workspace can never introduce a
       project id the stored doc has never seen. The refusal is keyed and
       scoped to the create operation only — the rest of the PUT still merges
       (never a whole-PUT 403, Pitfall 1). */
    if (!prev && !isWorkspaceManager && createRestricted) {
      refusedCreateIds.add(p.id);
      refusals.push({ code: 'projectCreateForbidden', project: p.id });
      continue;
    }
    /* [2026-11-08 D-51-17] Lead-on-create: on a member-created project the
       creator becomes lead SERVER-side, so the guarantee does not depend on
       client goodwill (the client createProject defaults f.lead to its own
       id — this mirrors it). Admin/owner creates keep the doc-set lead. */
    if (!prev && !isWorkspaceManager && memberId) {
      p.lead = memberId;
      if (!Array.isArray(p.members)) p.members = [];
      if (!p.members.includes(memberId)) p.members.push(memberId);
    }
    /* [Phase 57 VIEW-03, A3] Creation-time seeding from the STORED workspace
       pref — the server parity of the client createProject seed, so the
       guarantee does not depend on which surface created the project. No
       new permission semantics: the per-project binary stays the authority,
       the pref never retro-applies (only `!prev` rows), and the visibility
       funnel (projectIsPrivate/hiddenFor) is untouched (D-01/D-02). */
    if (!prev && seedPrivateIds.has(p.id)) p.private = true;
    if (prev && !canManageProject(prev, memberId, role)) {
      // Access fields belong to a manager even when the project is visible.
      p.private = prev.private;
      p.members = prev.members;
      p.perms = prev.perms;
      p.lead = prev.lead;
      /* [2026-11-08 T-50-01] The team link and the per-project invite toggle
         are manager-owned too: a stale client doc PUT from a non-manager can
         never delete p.teams (which would silently revoke a whole team) or
         flip p.allowInviteGuests. */
      p.teams = prev.teams;
      p.allowInviteGuests = prev.allowInviteGuests;
    }
    const wasPrivate = projectIsPrivate(prev);
    if (prev && projectIsPrivate(p) && !wasPrivate && memberId && !p.members.includes(memberId)) {
      // Whoever restricts an existing project keeps access to it, even if they were not listed.
      p.members.push(memberId);
    }
  }
  nextData.projOrder = mergeIds(storedData.projOrder, nextData.projOrder, hiddenProjects);
  /* [2026-11-08 CRT-01] A refused create leaves nothing behind: the project,
     its tasks, their comments and the projOrder entries never merge — a
     retried PUT must not resurrect them through orphaned dependants. */
  if (refusedCreateIds.size) {
    nextData.projects = nextData.projects.filter(p => !refusedCreateIds.has(p?.id));
    nextData.tasks = (nextData.tasks || []).filter(t => !refusedCreateIds.has(t?.project));
    const mergedTaskIds = new Set(nextData.tasks.map(t => t?.id).filter(Boolean));
    nextData.comments = (nextData.comments || []).filter(c => !c?.task || mergedTaskIds.has(c.task));
    if (Array.isArray(nextData.projOrder)) nextData.projOrder = nextData.projOrder.filter(id => !refusedCreateIds.has(id));
  }

  const reservedDependants = (storedList, incomingList, isHidden) => {
    const ids = new Set();
    for (const row of storedList || []) if (row?.id && isHidden(row)) ids.add(row.id);
    for (const row of incomingList || []) if (row?.id && isHidden(row)) ids.add(row.id);
    return ids;
  };
  const taskHidden = t => hiddenProjects.has(t?.project) || reservedTasks.has(t?.id) || permDeniedTasks.has(t?.id);
  nextData.tasks = mergeList(storedData.tasks, nextData.tasks, reservedDependants(storedData.tasks, nextData.tasks, taskHidden));

  const commentHidden = c => reservedTasks.has(c?.task) || permDeniedComments.has(c?.id);
  nextData.comments = mergeList(storedData.comments, nextData.comments, reservedDependants(storedData.comments, nextData.comments, commentHidden));
  const fileHidden = f => hiddenProjects.has(f?.project) || reservedTasks.has(f?.task) || permDeniedFiles.has(f?.id);
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

  /* VIEWS (Phase 57, D-05/D-06): per-user view state lives in the saved_views
     table — a stale client's top-level views copy must never merge back into
     a stored document (the notifPrefs Pitfall-3 resurrection failure mode).
     The whole views merge funnel is retired with the doc field; stripped
     here (write) and in normalizeDoc (read), notifPrefs-style. */
  delete next.views;
  /* [2026-11-08 T-51-01, Pitfall 3] A below-admin doc PUT never rewrites the
     workspace creation restriction — the stored value wins no matter what the
     client ships in its prefs copy. Admin/owner pref writes (the settings
     toggle) pass through unchanged. */
  if (!isWorkspaceManager) {
    next.prefs = {
      ...(next.prefs && typeof next.prefs === 'object' ? next.prefs : {}),
      permCreate: stored?.prefs?.permCreate,
      /* [Phase 57 VIEW-03, T-57-07] The workspace default visibility is read
         from the STORED document for non-managers — the client's prefs copy
         is never trusted (same D-51-15/16 convention as permCreate above). */
      defaultPrivate: stored?.prefs?.defaultPrivate === true,
    };
  } else if (next.prefs && typeof next.prefs === 'object') {
    /* [Phase 57 VIEW-03, T-57-07] Even an owner/admin prefs write is coerced
       fail-closed — a non-boolean defaultPrivate can never smuggle truthiness
       into the stored doc. */
    next.prefs.defaultPrivate = next.prefs.defaultPrivate === true;
  }
  /* [2026-11-07 D-49-3, authority-not-advisory] A document write can never
     assign a member to a task whose project the assignee cannot read — this
     closes the assignableInProject picker seam. The client emit filter is
     advisory; this guard is the authority. Visibility is the collapsed
     memberCanReadProject funnel — a pure funnel over canSeeProject with NO
     ROLE_RANK bypass of the private access list — so an admin/owner assignee
     on a private project they are not listed on IS rejected by this guard,
     exactly like any other member. Members without a membership row, and
     tasks without a project, always pass. */
  if (wsId) {
    const projectById = new Map([...(storedData.projects || []), ...(nextData.projects || [])].filter(p => p?.id).map(p => [p.id, p]));
    /* [Phase 55, D-55-4/D-55-9] Per-member guard: every member of every task's
       AND subtask's assignees array must be able to read the task's project —
       a guest/private leak through a subtask array is the same rejection as
       through the task itself (research pitfall 2). Empty arrays pass —
       Unassigned is valid. mergeClientDoc normalized above, so the arrays are
       canonical here; no scalar fallback is read (D-55-3). */
    for (const t of nextData.tasks || []) {
      if (!t?.id || !t.project) continue;
      const assigneeIds = [
        ...(Array.isArray(t.assignees) ? t.assignees : []),
        ...((Array.isArray(t.subtasks) ? t.subtasks : []).flatMap(s => (Array.isArray(s?.assignees) ? s.assignees : []))),
      ];
      for (const a of assigneeIds) {
        if (!(await memberCanReadProject(projectById.get(t.project), wsId, a))) {
          const err = new Error('Assignee cannot read the task project');
          err.code = 'assigneeOutOfScope';
          throw err;
        }
      }
    }
  }
  return next;
}

/* P4-f: notification emails. Gated by the per-recipient notifPrefs (email_mention,
   email_assign, email_comment — the same toggles the settings page renders),
   resolved per recipient through getUserNotifPrefs (Phase 34, D-04).
   The `update` type has no email toggle and stays in-app only. Each recipient
   gets at most one email per new notification row; senders never block the
   HTTP response and their failures are logged, not surfaced. */
/* REM-05: reminder emails ride the same pipeline — both reminder notif types
   gate on the single `email_reminder` pref (D-27-5). */
/* PREFS (Phase 34, D-03/D-09): the exact 13-key whitelist and the 11-key
   default layer (emptyDoc's set; email_comment is the ONLY false). The legacy
   push toggle for due dates was removed with gap G-37-2 — D-09 (Phase 59)
   amends that standing ruling: push_due is LIVE again as the reminder-push
   pref, read by the Plan 02 reminder fan-out. D-04 (Phase 61, 2026-11-13)
   removed the 4 dead keys — no reader and no settings toggle since
   projectsstudio#18, see docs/notification-audit.md for the per-key rulings —
   from both the whitelist and (for the one dead key that still carried a
   default) the default layer, following the push_due Phase 37 precedent. A PUT
   carrying a removed key gets 400 unknownPrefKey (the accepted migration);
   legacy stored rows holding the keys are silently dropped by
   getStoredNotifPrefs' whitelist filter below — read-side absorption, no data
   task. */
const NOTIF_PREF_KEYS = [
  'email_mention',
  'email_assign',
  'email_comment',
  'email_digest',
  'email_reminder',
  'push_mention',
  'push_assign',
  'push_comment',
  'push_due',
  'due_reminder',
  'past_due',
  'mention_all',
  'mention_team',
];

/* VIEWS (Phase 57, D-11/D-12): the viewOf() snapshot whitelist — a saved blob
   captures filters + columns (hidden + widths) + sort + group + showDone.
   The transient free-text `q` and every `_`-prefixed transient key are never
   stored; unknown fields intersect away silently (lenient load, no hard
   failure). Shared by the routes, the PUT merge and migrateUserViews. */
const VIEW_BLOB_KEYS = ['filters', 'sort', 'group', 'hidden', 'colW', 'showDone'];
const VIEW_SCHEMA_VERSION = 1;
/* Named views (Phase 57 plan 02, VIEW-02/D-10/D-12): they exist only for the
   two static table keys; the caps and uniqueness are enforced server-side
   because the client can never be the guard (T-57-04). SQLite's NOCASE
   collation is stripped by the pg adapter, so the case-insensitive compare is
   done in JS over lowercase names — portable across both backends. */
const NAMED_VIEW_KEYS = new Set(['tasks', 'mytasks']);
const NAMED_VIEW_MAX = 20;
const NAMED_VIEW_BLOB_MAX_BYTES = 2048;
const NAMED_VIEW_NAME_MAX = 100;
function sanitizeViewBlob(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of VIEW_BLOB_KEYS) if (raw[k] !== undefined) out[k] = raw[k];
  return out;
}

const NOTIF_PREF_DEFAULTS = {
  email_mention: true,
  email_assign: true,
  email_comment: false,
  email_reminder: true,
  due_reminder: true,
  past_due: true,
  push_mention: true,
  push_assign: true,
  push_comment: true,
  push_due: true,
  mention_all: true,
};

async function getStoredNotifPrefs(userId, workspaceId) {
  const row = await db.get('select prefs from user_notif_prefs where workspace_id = ? and user_id = ?', [workspaceId, userId]);
  try {
    const stored = row ? JSON.parse(row.prefs) : {};
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    /* Whitelist-filter the STORED blob too (K-10): rows written before the key
       whitelist existed (or carried by a pre-notif-prefs import) can hold keys
       that are no longer accepted. getUserNotifPrefs feeds them straight into
       every response, the client adopts the object verbatim and sends it back
       on the next PUT — which the whitelist then rejects (400 unknownPrefKey):
       the first toggle after load saved, every subsequent one failed until F5
       re-sanitized client-side. Filter at the single read point so GET, the
       PUT merge and the email gate never see a legacy key. */
    const out = {};
    for (const key of NOTIF_PREF_KEYS) {
      if (typeof stored[key] === 'boolean') out[key] = stored[key];
    }
    return out;
  } catch {
    return {};
  }
}

/* PREFS (Phase 34, D-04): the ONLY reader of per-user notification prefs —
   one prepared SELECT, JSON.parse with a try/catch backstop (malformed or
   unreadable rows read as {}), merged over the defaults. `=== false` disables;
   everything else (including mention_team, the one undefined-falsy key) stays on. */
async function getUserNotifPrefs(userId, workspaceId) {
  return { ...NOTIF_PREF_DEFAULTS, ...(await getStoredNotifPrefs(userId, workspaceId)) };
}

/* ------------------- browser push (Phase 59, PUSH-01/PUSH-05) -------------------

   VAPID key custody: env (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY) overrides the
   persisted file (DATA_DIR/vapid-keys.json); a missing pair is generated ONCE
   and written to the file — never regenerated over an existing file (PUSH-05
   idempotency: a second boot loads identical keys). Unconfigured-and-
   unpersistable = feature absent (PUSH.enabled false, routes fail-absent 404).
   THREAT T-59-03: key VALUES never cross a log line or a route — presence,
   source and the public key only. web-push is imported inside this function
   (dynamic import) so the dependency stays off the hot path and test suites
   can mock.module the seam. */
let webpush = null;
const PUSH = { enabled: false, publicKey: '', subject: '' };

const PUSH_ENDPOINT_MAX = 2048;
const PUSH_KEY_MAX = 512;
const PUSH_LABEL_MAX_BYTES = 200;
const pushEndpointOk = s => typeof s === 'string' && s.length > 0 && s.length <= PUSH_ENDPOINT_MAX && /^https:\/\//.test(s);
const pushKeyOk = s => typeof s === 'string' && s.length > 0 && s.length <= PUSH_KEY_MAX && /^[A-Za-z0-9_-]+$/.test(s);

async function initPushCustody() {
  PUSH.enabled = false;
  PUSH.publicKey = '';
  try {
    const mod = await import('web-push');
    webpush = mod.default ?? mod;
  } catch (err) {
    logWarn(`push: web-push unavailable (${err.message}) — browser push disabled`);
    return;
  }
  /* Test seam (PUSH_SINK_MODULE): the node:test fan-out suite stubs the
     sender so sends are recorded, never networked. Load failures fall back
     to the real sender — the seam is never a silent send suppressor. */
  if (process.env.PUSH_SINK_MODULE) {
    try {
      pushSender = (await import(process.env.PUSH_SINK_MODULE)).sendNotification || null;
    } catch (err) {
      logWarn(`push: PUSH_SINK_MODULE unavailable (${err.message}) — using the real push sender`);
    }
  }
  const envPub = String(process.env.VAPID_PUBLIC_KEY || '');
  const envPriv = String(process.env.VAPID_PRIVATE_KEY || '');
  let pub = envPub && envPriv ? envPub : '';
  let priv = envPub && envPriv ? envPriv : '';
  let source = pub ? 'env' : '';
  const keyFile = path.join(DATA_DIR, 'vapid-keys.json');
  if (!pub) {
    try {
      if (fs.existsSync(keyFile)) {
        const stored = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
        if (stored?.publicKey && stored?.privateKey) {
          pub = String(stored.publicKey);
          priv = String(stored.privateKey);
          source = 'file';
        }
      }
    } catch (err) {
      logWarn(`push: unreadable ${keyFile} (${err.message}) — treating as absent`);
    }
  }
  if (!pub) {
    try {
      const generated = webpush.generateVAPIDKeys();
      pub = String(generated.publicKey);
      priv = String(generated.privateKey);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(keyFile, `${JSON.stringify({ publicKey: pub, privateKey: priv }, null, 2)}\n`, { mode: 0o600 });
      source = 'generated';
      logWarn('push: generated a new VAPID keypair — persisted to vapid-keys.json in DATA_DIR');
      logWarn('push: keep that file (or pin VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY): losing the keys orphans every existing subscription');
    } catch (err) {
      logWarn(`push: could not persist VAPID keys (${err.message}) — browser push stays disabled`);
      return;
    }
  }
  let subject = String(process.env.VAPID_SUBJECT || '');
  if (!subject) {
    try {
      subject = `mailto:operator@${new URL(APP_URL).host}`;
    } catch {
      subject = 'mailto:operator@localhost';
    }
  }
  try {
    webpush.setVapidDetails(subject, pub, priv);
  } catch (err) {
    logWarn(`push: VAPID details rejected (${err.message}) — browser push disabled`);
    return;
  }
  PUSH.enabled = true;
  PUSH.publicKey = pub;
  PUSH.subject = subject;
  logInfo(`push: VAPID keys loaded (source: ${source}) — browser push enabled`);
}

/* ------------------- browser push fan-out (Phase 59 Plan 02, PUSH-02/03/04) -------------------

   PUSH_NOTIF_KIND clones NOTIF_EMAIL_KIND onto the push_* prefs (D-08). The
   per-notif gate order mirrors queueNotifEmails exactly (D-11) — self
   suppression → per-type pref → memberCanReadProject at send time — with NO
   digest-suppression branch (D-10: push, like inbox rows, is never
   suppressed). Gated on PUSH.enabled (VAPID presence) only, never
   MAILER.enabled. Payload is pre-localized per recipient via tFor (D-16:
   sender display name + action title; D-17: task key + title only, never a
   body/description; D-18: title truncated to 120 chars and a whole-payload
   budget assert so 413 can never reach the push service).

   Test seam (node:test harness): PUSH_SINK_MODULE names a module exporting
   sendNotification(sub, payload) — the fan-out tests record sends and
   simulate push-service failures without touching the network. Unset → the
   real web-push sender. */
const PUSH_NOTIF_KIND = {
  mention: 'push_mention',
  assign: 'push_assign',
  comment: 'push_comment',
  due_reminder: 'push_due',
  past_due: 'push_due',
};
const PUSH_TITLE_MAX_CHARS = 120;
const PUSH_PAYLOAD_MAX_OCTETS = 4096;
let pushSender = null;

function pushTitle(locale, n, senderName) {
  if (n.type === 'mention') return tFor(locale, 'notif.push.mentioned', { name: senderName });
  if (n.type === 'assign') return tFor(locale, 'notif.push.assigned', { name: senderName });
  if (n.type === 'comment') return tFor(locale, 'notif.push.commented', { name: senderName });
  return tFor(locale, 'notif.push.due');
}

async function sendPushFor(wsRow, nextDoc, newNotifs, isTest = false, onlyEndpoint = null) {
  if (!PUSH.enabled || !webpush) return;
  const profiles = new Map((Array.isArray(nextDoc?.data?.members) ? nextDoc.data.members : []).map(m => [m?.id, m]));
  const projectById = new Map((Array.isArray(nextDoc?.data?.projects) ? nextDoc.data.projects : []).filter(p => p?.id).map(p => [p.id, p]));
  const authority = new Map(
    (
      await db.all('select m.member_id, m.user_id, u.name, u.email, u.locale from memberships m join users u on u.id = m.user_id where m.workspace_id = ?', [
        wsRow.id,
      ])
    ).map(r => [r.member_id, r]),
  );
  for (const n of newNotifs) {
    try {
      if (!isTest && n.by === n.to) continue; // never push the author about their own action (D-11)
      const prefKey = PUSH_NOTIF_KIND[n.type];
      if (!prefKey) continue;
      /* A test push is the caller exercising their own device (D-05/D-06): the
         recipient IS the caller and no notif row exists — the pref gate and
         the self-skip above are bypassed, everything else is identical. */
      if (!isTest) {
        const prefs = await getUserNotifPrefs(authority.get(n.to)?.user_id || n.to, wsRow.id);
        if (prefs[prefKey] === false) continue;
      }
      const task = n.task ? (nextDoc?.data?.tasks || []).find(x => x?.id === n.task) : null;
      /* D-11 send-time re-check (T-59-07): visibility against the NEXT doc's
         project map — a recipient who lost access after the notif row was
         written gets no push. Underivable → keep flowing (email parity). */
      const projectId = n.project || task?.project || null;
      if (projectId && !(await memberCanReadProject(projectById.get(projectId), wsRow.id, n.to))) continue;
      const recipientLocale = authority.get(n.to)?.locale === 'fr' ? 'fr' : 'en';
      let title = pushTitle(recipientLocale, n, authority.get(n.by)?.name || profiles.get(n.by)?.name || 'Un membre');
      if (isTest) title = `${tFor(recipientLocale, 'notif.push.test')} · ${title}`;
      /* D-17/D-18: body = task key + truncated title, never a task body. A
         notif with no resolvable task (the test push) localizes a fixed body. */
      const rawTitle = (task?.title || '').slice(0, PUSH_TITLE_MAX_CHARS) || tFor(recipientLocale, 'notif.push.testBody');
      const body = task?.key ? `${task.key} ${rawTitle}` : rawTitle;
      const url = task?.key ? `${APP_URL}/w/${wsRow.slug}/task/${encodeURIComponent(task.key)}` : `${APP_URL}/w/${wsRow.slug}/`;
      const payload = JSON.stringify({ url, title, body, test: !!isTest });
      const octets = Buffer.byteLength(payload, 'utf8');
      if (octets > PUSH_PAYLOAD_MAX_OCTETS) throw new Error(`push payload budget exceeded: ${octets} > ${PUSH_PAYLOAD_MAX_OCTETS} octets`);
      const send = pushSender || webpush.sendNotification.bind(webpush);
      /* D-14: one push per notif row per subscribed device — no aggregation. */
      const rows = onlyEndpoint
        ? await db.all('select * from push_subscriptions where workspace_id = ? and user_id = ? and endpoint = ?', [
            wsRow.id,
            authority.get(n.to)?.user_id || n.to,
            onlyEndpoint,
          ])
        : await db.all('select * from push_subscriptions where workspace_id = ? and user_id = ?', [wsRow.id, authority.get(n.to)?.user_id || n.to]);
      for (const row of rows) {
        try {
          await send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
          await db.run('update push_subscriptions set last_seen_at = ? where endpoint = ?', [now(), row.endpoint]);
        } catch (err) {
          /* PUSH-04 (Pitfall 1): 404/410 are authoritative dead-endpoint
             signals — the row is deleted in the SAME send pass, never
             retried. Everything else (429/5xx/network) keeps the row and only
             logs; the next natural fan-out is the retry. */
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await db.run('delete from push_subscriptions where endpoint = ?', [row.endpoint]);
          } else {
            logWarn(`push send ${n.id} → ${String(row.endpoint).slice(0, 48)}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      logWarn(`push fan-out ${n?.id}: ${err.message}`);
    }
  }
}


const NOTIF_EMAIL_KIND = {
  mention: 'email_mention',
  assign: 'email_assign',
  comment: 'email_comment',
  due_reminder: 'email_reminder',
  past_due: 'email_reminder',
};

/* D-27-4: reminder rows carry `by: null` (system actor) so the self-skip below
   never drops them; their emails must not read "from Un membre". The reminder
   check is inlined in the by-resolution (not a module constant) so the
   notif-email-link source-extraction tests keep evaluating that line standalone. */

async function queueNotifEmails(wsRow, nextDoc, newNotifs) {
  /* POL-02 (Phase 68, D-04/D-05): this is now a CLAIM function — it resolves
     the per-recipient email params (everything sendNotif needs) and inserts
     one email_outbox transport claim per notification. Delivery moved to
     runEmailDeliveryPass (30 s tick + post-commit kick). Returns the number
     of claims made. */
  let queued = 0;
  const wsName = wsRow.name || 'Projects Studio';
  const profiles = new Map((Array.isArray(nextDoc?.data?.members) ? nextDoc.data.members : []).map(m => [m?.id, m]));
  const emailByUserId = new Map((await db.all('select id, email from users')).map(u => [u.id, u.email]));
  const emailByMemberEmail = new Map();
  for (const m of profiles.values()) if (m?.email && m.id) emailByMemberEmail.set(m.id, m.email);
  /* [2026-11-07 D-49-1, defense in depth] the email mirror re-checks each
     recipient's visibility against the notification's project before
     queuing, through the SAME collapsed memberCanReadProject funnel every
     other surface uses. Workspace-level rows (no project) keep flowing —
     send-time enforcement only, never a notifications-list filter (D-07). */
  const projectById = new Map((Array.isArray(nextDoc?.data?.projects) ? nextDoc.data.projects : []).filter(p => p?.id).map(p => [p.id, p]));
  /* G-23-1: the stored doc never persists account-backed member profiles (the
     roster is authority-backed in memberships+users, rebuilt only on read via
     syncProfiles), so the doc-profile map is empty of account members at
     email-build time. Resolve names/emails from the authority rows first —
     workspace-scoped so a name is only ever revealed to co-members (T-23-06)
     — keeping the doc profiles as the fallback for doc-only members. */
  const authority = new Map(
    (
      await db.all('select m.member_id, m.user_id, u.name, u.email, u.locale from memberships m join users u on u.id = m.user_id where m.workspace_id = ?', [
        wsRow.id,
      ])
    ).map(r => [r.member_id, r]),
  );
  for (const n of newNotifs) {
    if (n.by === n.to) continue; // never email the author about their own action
    const prefKey = NOTIF_EMAIL_KIND[n.type];
    if (!prefKey) continue;
    /* PREFS (Phase 34, D-04): prefs resolve PER RECIPIENT through the
       accessor — n.to is a member_id, mapped to the account row (user_id)
       via the memberships-derived authority map; doc-only recipients carry
       no row and read defaults. */
    const prefs = await getUserNotifPrefs(authority.get(n.to)?.user_id || n.to, wsRow.id);
    if (prefs[prefKey] === false) continue;
    /* Phase 38 (DIGEST-02, D-09/D-10/D-11): digest users lose individual
       reminder EMAILS at the fan-out — inbox rows and push are never
       suppressed (rows are appended + claimed by runReminderPass BEFORE
       this gate, so suppression cannot lose notification state; D-10).
       email_digest === true wins over email_reminder regardless of its
       value, so this is a DISTINCT gate from the === false check above —
       a recipient with email_reminder: true AND email_digest: true still
       loses the reminder email (D-11). The opt-in reads the STORED
       email_digest (strict === true, D-05/D-14) — never the merged
       default, which still carries true until the default layer is
       inverted. Mention/assign/comment kinds never reach this branch. */
    if (prefKey === 'email_reminder' && (await getStoredNotifPrefs(authority.get(n.to)?.user_id || n.to, wsRow.id)).email_digest === true) continue;
    const profile = profiles.get(n.to);
    const to = authority.get(n.to)?.email || (profile && emailByUserId.get(profile.userId)) || emailByMemberEmail.get(n.to);
    if (!to) continue;
    /* I18N-01 (Phase 36): the render locale rides the authority row — the
       SAME workspace-scoped users read already used for name/email (T-36-02,
       no new join). Anything but an exact 'fr' clamps to EN, so doc-only
       members (no row), NULL locales and malformed stored values ('fr-FR')
       all degrade to the base locale (Pitfalls 4/5, SC-5). */
    const recipientLocale = authority.get(n.to)?.locale === 'fr' ? 'fr' : 'en';
    const task = n.task ? (nextDoc?.data?.tasks || []).find(x => x?.id === n.task) : null;
    /* [2026-11-07 D-49-1] skip recipients who cannot read the notification's
       project under the collapsed funnel (private ∨ access list). Tasks carry
       `project` (the client's createTask writes it); the retired `projectId`
       key is never read. Underivable → keep flowing. */
    const projectId = n.project || task?.project || null;
    if (projectId && !(await memberCanReadProject(projectById.get(projectId), wsRow.id, n.to))) continue;
    const taskTitle = task?.title || 'a task';
    /* I18N-01 (Phase 36): the reminder by-label renders per recipient locale
       through tFor — still inlined in the by-resolution so the notif-email-link
       source-extraction tests keep evaluating this line standalone. */
    const by = ['due_reminder', 'past_due'].includes(n.type)
      ? tFor(recipientLocale, 'notif.email.byReminders')
      : authority.get(n.by)?.name || profiles.get(n.by)?.name || 'Un membre';
    /* LINK-01 (plan 23-01): the email links to the task, not the app root. The
       key is resolved at email-build time (it is mutable on project move) and
       the absolute base is APP_URL unconditionally — the boot guard exits when
       SMTP is enabled without it, so a request's Host header can never poison
       an emailed link (T-23-01). A task deleted between the doc write and the
       email build falls back to the workspace root. */
    const url = task?.key ? `${APP_URL}/w/${wsRow.slug}/task/${encodeURIComponent(task.key)}` : `${APP_URL}/w/${wsRow.slug}/`;
    /* POL-02 (Phase 68, D-04/D-05/D-06): claim-then-deliver — the outbox row
       IS the transport claim (UNIQUE dedup_key + INSERT OR IGNORE). Rides the
       caller's transaction (doc-PUT tx / reminders_sent claim tx) so claim +
       semantic append commit together; delivery is post-commit via
       runEmailDeliveryPass. dedup_key derives from n.id, the per-recipient
       unique notification identity (A2) — a re-run can never duplicate. */
    await db.run('insert or ignore into email_outbox (id, workspace_id, dedup_key, kind, recipient, ctx, created_at) values (?,?,?,?,?,?,?)', [
      uid(),
      wsRow.id,
      `notif:${n.id}`,
      'notif',
      to,
      JSON.stringify({ type: 'notif', to, workspace: wsName, by, task: taskTitle, snippet: n.snippet || '', kind: n.type, url, locale: recipientLocale }),
      now(),
    ]);
    queued++;
  }
  return queued;
}

/* =======================================================================
   Due-date reminder scheduler (phase 27, REM-01..REM-05).

   D-27-1 (rewritten Phase 44, D-09/D-11): both reminder offsets and the
   digest target 08:00 in EACH MEMBER'S OWN timezone — the shared
   workspace-tz model (first-membership lookup) is deleted; per-member
   resolution through the resolveTz funnel (tz.js) is the only semantics.
   D-27-2: the pass runs at boot (restart catch-up) and every
   minute from an unref'd interval. D-27-3: the past-due nudge fires at the
   first 08:00 after the due date passes, exactly once. The emission window
   is AT-OR-AFTER 08:00 local (Phase 37/38 — mirrors the digest loop): the
   pass is a pure read only BEFORE 08:00 local; from the first tick at-or-
   after 08:00 the window-open predicates plus the reminders_sent ledger
   deliver any missed emission late (boot restart, downtime, delayed boot),
   exactly once per (workspace, task, assignee, offset, due) — the claim
   commits in the same transaction as the notif append (REM-03 / SC-5:
   no claim, no doc write, no revision bump on any idle tick before 08:00).
   ======================================================================= */

import { localParts, resolveTz } from './tz.js';

/* REM-04 + RESEARCH Pitfall 4: one predicate for every offset. Mirrors the
   client's isOver (t.due && status !== 'done') plus archived-task and
   archived-project exclusions. [Phase 55, D-55-3] The private-project
   visibility term moved INTO the loops: with multiple assignees it re-derives
   per member (canSeeProject / memberCanReadProject per assignee id) — the
   structure here is member-agnostic now. */
function remindable(task, project) {
  if (!task || !/^\d{4}-\d{2}-\d{2}$/.test(task.due || '')) return false;
  if (task.status === 'done' || task.archived) return false;
  if (!project || project.archived) return false;
  return true;
}

function reminderSnippet(offset, task) {
  const title = task?.title || 'a task';
  if (offset === 'morning_of') return `Due today: ${title}`;
  return `Past due: ${title}`;
}

/*
 * One scheduler pass over every workspace. Injectable clock (`now`, a Date)
 * so tests drive 08:00-local instants without sleeping or fake timers.
 * Returns the notification rows emitted this pass (dedup claims included).
 */
async function runReminderPass({ now: at = new Date() } = {}) {
  const emitted = [];
  let digests = 0;
  /* =====================================================================
     Phase 91 (NOTIF-01, D-01/D-04): per-(user, localDate) digest
     accumulation. The per-workspace reminders_sent claim below stays the
     byte-compatible SEMANTIC claim (SC4) — aggregation happens ONLY on
     the transport side. Keyed on `${userId}:${localDate}`, never userId
     alone: a cross-tz user can legitimately get two digests on different
     localDates (Pitfall 1). Sections accumulate INDEPENDENT of the claim
     result — an already-claimed (user, ws, day) still contributes its
     section, so a restart between partial claims and the enqueue keeps
     ALL sections (Q5 restart hole); the outbox dedup key collision is
     what prevents a double-SEND. Gated on MAILER.enabled only —
     MAILER-disabled servers never accumulate, never enqueue (SC3).
     ===================================================================== */
  const digestAcc = new Map();
  for (const ws of await db.all('select * from workspaces')) {
    try {
      const doc = JSON.parse(ws.doc);
      /* [Phase 55, D-55-1] The stored doc is normalized before the loops:
         every task carries the canonical `assignees` array — the reminder
         pass is an array-only reader (D-55-3). Migration only — no roster
         strip: the pass reads raw stored docs whose roster may be partial,
         and per-member visibility is re-derived below anyway (D-55-9). */
      normalizeAssigneesData(doc?.data, []);
      const tasks = Array.isArray(doc?.data?.tasks) ? doc.data.tasks : [];
      const projects = new Map((Array.isArray(doc?.data?.projects) ? doc.data.projects : []).map(p => [p?.id, p]));
      /* D-09/D-14 per-member window: (localDate, hour) is computed per
         assignee/recipient INSIDE each loop below — never hoisted to the
         workspace level, never cached across members or ticks (Pitfall 3,
         DST is real). */
      /* D-27-1 window gate: reminder emission opens AT the 08:00 local tick
         and stays catch-up-eligible for the rest of the day (Phase 37/38,
         mirroring the digest loop below). The reminders_sent ledger — its
         claim commits in the same transaction as the notif append — makes
         the wider window exactly-once per (workspace, task, assignee,
         offset, due); ticks before 08:00 stay pure reads (REM-01 / SC-5:
         no claim, no doc write, no revision bump). */
      for (const t of tasks) {
        const project = projects.get(t?.project);
        if (!remindable(t, project)) continue;
        /* [Phase 55, D-55-3/D-55-10 (minimal)] Array-only reads: one pass per
           ASSIGNEE inside the existing loop — each member resolves their own
           tz, prefs, read-check and ledger row. The full fan-out design is
           Plan 55-02; the shape conversion lives here because the stored doc
           no longer carries a scalar assignee. */
        for (const assigneeId of Array.isArray(t.assignees) ? t.assignees : []) {
          /* Per-assignee resolution (D-09): the window comes from THE
             ASSIGNEE's own stored tz (doc.data.members[*].tz) through the
             resolveTz funnel — never from a shared workspace tz. */
          const assigneeTz = resolveTz((doc?.data?.members || []).find(m => m?.id === assigneeId)?.tz);
          const { date: localDate, hour } = localParts(assigneeTz, at);
          if (hour < 8) continue;
          /* [2026-11-07 D-49-1] visibility gate is the collapsed funnel only —
             the Phase 29 scope term is retired. Re-derived PER MEMBER. */
          const assigneeMembership = await db.get('select user_id, role from memberships where workspace_id = ? and member_id = ?', [ws.id, assigneeId]);
          /* PREFS (Phase 34, D-04): reminder prefs resolve per assignee through
             the accessor — the membership row maps the member_id to the account
             (user_id); a doc-only assignee carries no row and reads defaults. */
          const prefs = await getUserNotifPrefs(assigneeMembership?.user_id || assigneeId, ws.id);
          if (!(await memberCanReadProject(project, ws.id, assigneeId))) continue;
          const due = t.due;
          /* Window-open predicates on plain YYYY-MM-DD string compare — the
             open window plus an absent dedup key is the late-delivery
             catch-up for ANY tick at-or-after 08:00 local (restart, downtime,
             delayed boot), not only during the 08:00 hour. */
          const offsets = [];
          if (prefs.due_reminder !== false) {
            if (localDate >= due) offsets.push('morning_of');
          }
          if (prefs.past_due !== false && localDate > due) offsets.push('past_due');
          for (const offset of offsets) {
            const notif = {
              id: uid(),
              type: offset === 'past_due' ? 'past_due' : 'due_reminder',
              to: assigneeId,
              by: null, // system actor — queueNotifEmails' self-skip must never drop a reminder
              task: t.id,
              /* I18N-03 (D-04/D-05): machine key + send-time vars snapshot
                 VALUES — the inbox localizes per viewer locale without joins,
                 so historical text survives task rename/deletion. Additive:
                 the English snippet stays (D-06 dual store). */
              key: `notif.reminder.${offset === 'morning_of' ? 'morningOf' : 'pastDue'}`,
              vars: { title: t.title || 'a task' },
              snippet: reminderSnippet(offset, t),
              /* Client notif contract is `at` + `read` (store.js notifyMembers) —
                 `ts` kept only for existing test assertions. */
              at: at.getTime(),
              read: false,
              ts: at.getTime(),
            };
            /* T-27-03: claim + append commit together or not at all. */
            let claimed = false;
            await db.tx(async () => {
              const r = await db.run('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)', [
                `${ws.id}:${t.id}:${assigneeId}:${offset}:${due}`,
                ws.id,
                now(),
              ]);
              if (r.changes === 0) return; // already sent — exactly-once (REM-03)
              await updateDoc(ws.id, d => {
                d.data.notifs.push(notif);
              });
              /* WHK-02 (67-02): due.reminder is the SECOND webhook emission
                 site. The webhook claim rides THIS same transaction, gated on
                 the reminders_sent dedup above — a reminder that already
                 claimed cannot re-claim (Pitfall 3: no double-fire between
                 the reminder dedup and the webhook claim). The webhook dedup
                 key itself carries (task, offset, due), so multiple assignees
                 on one task still produce exactly ONE delivery per hook.
                 Fail-absent: webhook plumbing never fails the reminder. */
              await emitWebhookEvent(ws.id, {
                projectId: t.project,
                event: 'due.reminder',
                subjectId: `${t.id}:${offset}:${due}`,
                ctxJson: JSON.stringify({
                  event: 'due.reminder',
                  taskId: t.id,
                  title: t.title || '',
                  due,
                  offset,
                  projectId: t.project,
                  projectName: projects.get(t.project)?.name || '',
                }),
              });
              /* POL-02 (Phase 68, D-04): the email transport claim rides THIS
                 same tx (D-07 articulation, webhook-claim pattern) — claim +
                 reminders_sent + notif append commit together, a crash cannot
                 lose or duplicate the email. Fail-absent: email plumbing
                 never fails the reminder (the semantic claim stays intact). */
              if (MAILER.enabled) {
                try {
                  await queueNotifEmails(ws, doc, [notif]);
                } catch (err) {
                  logWarn(`email outbox enqueue (reminder): ${err.message}`);
                }
              }
              claimed = true;
            });
            if (!claimed) continue;
            emitted.push(notif);
            /* POL-02: post-commit delivery kick — NEVER inside the transaction
               (a hung SMTP server would hold the SQLite write lock). The 30 s
               tick is the safety net; this kick makes first delivery prompt. */
            if (MAILER.enabled) runEmailDeliveryPass().catch(err => logWarn(`email post-commit pass: ${err.message}`));
            /* Post-commit fan-out — NEVER inside the transaction (a hung SMTP
               server would hold the SQLite write lock). Uses the post-write doc.
               One parse, two consumers (RESEARCH open question 3): the push
               fan-out reuses the same parse. Push is gated on PUSH.enabled
               ONLY — never inside the MAILER gate (D-09/D-10: a digest user
               still gets reminder pushes, inbox rows stay untouched). */
            if (PUSH.enabled) {
              const nextDoc = JSON.parse((await db.get('select doc from workspaces where id = ?', [ws.id])).doc);
              await sendPushFor(ws, nextDoc, [notif]);
            }
          }
        }
      }

      /* =====================================================================
         Phase 38 (DIGEST-01): daily digest — AFTER the per-task reminder
         loop, inside the same per-workspace block (D-04/D-08). Reuses the
         in-scope `tasks` array and `projects` map computed above, plus the
         per-recipient `localDate` resolved inside this loop (D-09 — the
         window is each recipient's own tz, never a shared workspace date).
         Recipients come from the memberships⋈users authority join (D-05,
         never doc.data.members); opt-in is a STRICT stored `email_digest ===
         true` (D-05/D-14 — undefined-falsy is off). Task filtering copies
         the reminder loop's SCOPE-04 checks verbatim (D-06 — one visibility
         pipeline, no digest-specific filter). No notif row, no revision
         bump: the claim is a bare insert-or-ignore and the send is strictly
         post-commit so a hung SMTP cannot hold the SQLite write lock
         (Pattern 1 / T-38-03).

         Window (D-01/D-02, plan Task 2 pin 3): the digest fires at the
         FIRST tick at-or-after 08:00 local and stays catch-up-eligible for
         the rest of the day — a missed 08:00 (downtime, restart) delivers
         late at the next tick, with content computed at the send instant.
         Exactly-once per (workspace, user, localDate) comes from the claim,
         so the wider window cannot double-send. Both loops share the same
         at-or-after-08:00 catch-up window (Phase 37 alignment), each
         exactly-once via its own claim (reminders_sent for reminders /
         digest claim for digests).
         ===================================================================== */
      for (const r of await db.all(
        'select m.member_id, m.user_id, u.email, u.locale from memberships m join users u on u.id = m.user_id where m.workspace_id = ?',
        [ws.id],
      )) {
        if (!r.user_id || !r.email) continue;
        /* Per-recipient resolution (D-09/D-14): the window comes from THE
           RECIPIENT's own doc member tz through resolveTz — computed inside
           the loop, before any opt-in gate or claim (Pitfall 3: never
           hoisted, never cached). */
        const recipientTz = resolveTz((doc?.data?.members || []).find(m => m?.id === r.member_id)?.tz);
        const { date: localDate, hour } = localParts(recipientTz, at);
        if (hour < 8) continue;
        /* D-14: the opt-in is the STORED value — stored true IS the opt-in;
           undefined (no row, unparseable row, missing key) is off. Plan 38-02
           deleted the pre-38 default `email_digest: true` from the merged
           defaults, so the accessor reads falsy here; the stored read via
           getStoredNotifPrefs keeps ONE parse path for the opt-in. */
        if ((await getStoredNotifPrefs(r.user_id, ws.id)).email_digest !== true) continue;
        const dueToday = [];
        const overdue = [];
        for (const t of tasks) {
          /* CR-01 (38-03): the digest lists THE RECIPIENT'S tasks — a task
             assigned to someone else never enters this recipient's digest,
             no matter its project or visibility. First filter, before any
             content is computed (T-38-07). */
          /* [Phase 55, D-55-11] Digest membership is `assignees.includes(me)` —
             a task with N assignees enters every member's digest. */
          if (!Array.isArray(t.assignees) || !t.assignees.includes(r.member_id)) continue;
          const project = projects.get(t?.project);
          if (!remindable(t, project)) continue;
          /* [2026-11-07 D-49-1] per (recipient, task) visibility — the
             collapsed funnel only. With the assignee gate above, assignee ===
             recipient, so these are evaluated against the RECIPIENT's own
             visibility: one pipeline, per D-06 (no digest-specific
             second filter). */
          if (!(await memberCanReadProject(project, ws.id, r.member_id))) continue;
          /* Same string compares as the reminder window predicates, split
             disjointly: due-today is the morning_of window's due-date edge,
             overdue is past_due's strictly-after edge. Future-dated tasks
             never appear. */
          if (localDate === t.due) dueToday.push(t);
          else if (localDate > t.due) overdue.push(t);
        }
        /* D-12 ledger honesty: an empty digest claims nothing and sends nothing. */
        if (!dueToday.length && !overdue.length) continue;
        let claimed = false;
        await db.tx(async () => {
          const res = await db.run('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)', [
            `${ws.id}:${r.user_id}:digest:${localDate}`,
            ws.id,
            now(),
          ]);
          /* D-11/D-12: claims keyed on (user, localDate-of-emission-time).
             Changing a member's tz never re-fires an already-claimed reminder
             for the same localDate; a tz change yielding a different localDate
             fires exactly one new legitimate claim (re-window allowed). No
             ledger reset on tz change. */
          claimed = res.changes !== 0; // D-03: user_id id space, exactly-once
          /* POL-02 (Phase 68, D-07) — Phase 91 revision (NOTIF-01, D-04): the
             reminders_sent ledger stays the SEMANTIC claim (WHAT to send);
             email_outbox is the TRANSPORT claim (HOW to deliver). The per-ws
             outbox insert MOVED OUT of this claim site: one aggregated row
             per (user, localDate) is enqueued AFTER the workspace loop (the
             root-cause site of the 4× duplicate was this per-ws insert —
             one row per ws membership). Exactly-once now comes from the
             user/day dedup key `digest:user:{userId}:{localDate}` colliding
             on INSERT OR IGNORE. */
        });
        /* Phase 91 (D-01/D-04): accumulate the section for the aggregated
           digest — BEFORE/independent of the claim result (restart hole),
           gated on MAILER.enabled only. The digest is non-empty here (the
           D-12 honesty `continue` above), so every accumulated section has
           ≥1 task; empty sections never accumulate, never enqueue (SC1
           belt-and-braces: the enqueue loop skips empty section lists). */
        if (MAILER.enabled) {
          const logo = logoShape(ws, docLogo(ws));
          const accKey = `${r.user_id}:${localDate}`;
          if (!digestAcc.has(accKey)) {
            digestAcc.set(accKey, { userId: r.user_id, email: r.email, locale: r.locale === 'fr' ? 'fr' : 'en', localDate, sections: [] });
          }
          digestAcc.get(accKey).sections.push({
            wsId: ws.id,
            wsSlug: ws.slug,
            wsName: ws.name || 'Projects Studio',
            logoUrl: logo ? `${APP_URL}${logo.url}` : null,
            dueToday: dueToday.map(t => ({ key: t.key, title: t.title || 'a task', project: projects.get(t?.project)?.name || '' })),
            overdue: overdue.map(t => ({ key: t.key, title: t.title || 'a task', project: projects.get(t?.project)?.name || '' })),
          });
        }
        if (!claimed) continue;
        /* Phase 91: the log/response `digests` counter is the users-ENQUEUED
           count when MAILER is on (the enqueue loop below increments it).
           MAILER-disabled servers keep the OLD semantic count — claims still
           run (the digest-honesty ledger, research Q1 asymmetry) and the
           response still reports them even though nothing is enqueued. */
        if (!MAILER.enabled) digests++;
        /* POL-02: post-commit delivery kick moved to ONE post-loop kick after
           the aggregated enqueue (Phase 91) — NEVER inside a transaction
           (POL-02 D-07). The reminder loop above keeps its own kick. */
      }
    } catch (err) {
      logWarn(`reminder pass ${ws.id}: ${err.message}`);
    }
  }
  /* =====================================================================
     Phase 91 (NOTIF-01, D-04): ONE aggregated enqueue per (user, localDate)
     — after the ws loop, in its own fail-absent tx. workspace_id carries
     the first section's ws (text NOT NULL, no FK — informational for the
     digest kind). The ctx is everything the template rebuild needs at
     delivery time: sections + app-level logo/unsubscribe (D-04). The
     unsubscribeUrl uses the GLOBAL user-scoped token (D-02) under the
     same MASTER_KEY + https APP_URL gates as the per-ws link it replaces.
     Fail-absent: enqueue plumbing never fails the pass.
     ===================================================================== */
  for (const acc of digestAcc.values()) {
    if (!acc.sections.length) continue; // SC1 belt-and-braces: empty never enqueues
    let enqueued = false;
    try {
      const logoUrl = acc.sections.find(s => s.logoUrl)?.logoUrl || null;
      /* Phase 91 (D-02): GLOBAL user-scoped unsubscribe token (0x02) under
         the same MASTER_KEY + https APP_URL gates the per-ws link had. */
      const unsubscribe = unsubscribeHmacKey() && APP_URL.startsWith('https://')
        ? unsubscribeUrlGlobal(unsubscribeHmacKey(), APP_URL, acc.userId)
        : null;
      await db.tx(async () => {
        const r = await db.run('insert or ignore into email_outbox (id, workspace_id, dedup_key, kind, recipient, ctx, created_at) values (?,?,?,?,?,?,?)', [
          uid(),
          acc.sections[0].wsId,
          `digest:user:${acc.userId}:${acc.localDate}`,
          'digest-aggregated',
          acc.email,
          JSON.stringify({
            type: 'digest-aggregated',
            to: acc.email,
            locale: acc.locale,
            appUrl: APP_URL,
            ...(logoUrl ? { logoUrl } : {}),
            ...(unsubscribe ? { unsubscribeUrl: unsubscribe } : {}),
            sections: acc.sections.map(({ wsId: _wsId, logoUrl: _logoUrl, ...s }) => s),
          }),
          now(),
        ]);
        enqueued = r.changes !== 0;
      });
    } catch (err) {
      logWarn(`email outbox enqueue (digest-aggregated): ${err.message}`);
    }
    if (enqueued) digests++;
  }
  /* POL-02: ONE post-commit delivery kick for the whole pass — never inside
     a tx (D-07). A restart mid-tick re-collides on the user/day key, so the
     re-run cannot double-send (exactly-once per SC3). */
  if (MAILER.enabled && digestAcc.size) runEmailDeliveryPass().catch(err => logWarn(`email post-commit pass: ${err.message}`));
  if (emitted.length || digests) logInfo(`reminder pass: ${emitted.length} reminder notification(s), ${digests} digest email(s)`);
  else logDebug('reminder pass: nothing to send');
  return { emitted, digests };
}

/* TEAM-01: team assignment for account-backed members lives in the
   team_members authority rows, edited only through the dedicated
   PUT /members/:uid/teams route (D-01) — the document never carries it. */

async function docForClient(doc, ws, membership) {
  const out = normalizeDoc(JSON.parse(JSON.stringify(doc || {})), { name: ws.name, slug: ws.slug, color: ws.color || '#1D1C1A' });
  normalizeProjects(out);
  await syncProfiles(out, ws.id);
  /* [Phase 55, D-55-1] Re-run the assignee normalize AFTER syncProfiles: the
     roster completion above may add profiles for members the stored doc was
     missing, and their ids must not be stripped from assignees arrays. */
  normalizeAssigneesData(out.data);
  // P4-a: with the roster rebuilt, drop notifications addressed to removed members.
  if (Array.isArray(out.data.notifs)) {
    const memberIds = new Set((Array.isArray(out.data.members) ? out.data.members : []).map(m => m?.id).filter(Boolean));
    out.data.notifs = out.data.notifs.filter(n => memberIds.has(n.to));
  }
  return membership ? await redactDoc(out, membership) : out;
}

/* Kanzo #9 (docker logs): one INFO line per user-visible task change carried
   by a doc PUT. Diffed against the stored doc, so a no-op sync logs nothing.
   Best-effort and exception-proof — logging must never fail a push. */
function logDocChanges(ws, storedDoc, next, actorName) {
  try {
    const slug = ws?.slug || 'ws';
    /* [Phase 55, D-55-3] The stored doc may predate the assignee migration —
       normalize a copy so the diff below is a pure array-vs-array comparison
       (array-only reads; the stored original is never mutated). */
    const memberIds = new Set((Array.isArray(next?.data?.members) ? next.data.members : []).map(m => m?.id).filter(Boolean));
    const beforeTasks = new Map(
      (Array.isArray(storedDoc?.data?.tasks) ? storedDoc.data.tasks : [])
        .filter(t => t?.id)
        .map(t => {
          const copy = { ...t };
          normalizeTaskAssignees(copy, memberIds);
          return [t.id, copy];
        }),
    );
    const afterTasks = (Array.isArray(next?.data?.tasks) ? next.data.tasks : []).filter(t => t?.id);
    const afterIds = new Set(afterTasks.map(t => t.id));
    const commentsByTask = doc => {
      const map = new Map();
      for (const c of Array.isArray(doc?.data?.comments) ? doc.data.comments : []) {
        if (c?.task) map.set(c.task, (map.get(c.task) || 0) + 1);
      }
      return map;
    };
    const beforeComments = commentsByTask(storedDoc);
    const afterComments = commentsByTask(next);
    const memberName = id => (Array.isArray(next?.data?.members) ? next.data.members : []).find(m => m?.id === id)?.name || 'unassigned';
    for (const t of afterTasks) {
      const prev = beforeTasks.get(t.id);
      if (!prev) {
        logInfo(`task added "${t.title || 'untitled'}" by ${actorName} [${slug}]`);
        continue;
      }
      const title = t.title || prev.title || 'untitled';
      /* [Phase 55, D-55-13] Diff-based assignment logging: one line per added
         member and one per removed member; untouched members emit nothing.
         The assignee arrays are read destructured so the scalar-era grep
         gates only ever match the normalize migration input above. */
      const { assignees: prevMembers } = prev;
      const { assignees: nextMembers } = t;
      const added = (Array.isArray(nextMembers) ? nextMembers : []).filter(id => !(Array.isArray(prevMembers) ? prevMembers : []).includes(id));
      const removed = (Array.isArray(prevMembers) ? prevMembers : []).filter(id => !(Array.isArray(nextMembers) ? nextMembers : []).includes(id));
      for (const id of added) logInfo(`task "${title}" assigned to ${memberName(id)} by ${actorName} [${slug}]`);
      for (const id of removed) logInfo(`task "${title}" unassigned from ${memberName(id)} by ${actorName} [${slug}]`);
      if (prev.title !== t.title && prev.title) logInfo(`task renamed "${prev.title}" → "${title}" by ${actorName} [${slug}]`);
      if ((afterComments.get(t.id) || 0) > (beforeComments.get(t.id) || 0)) logInfo(`task "${title}" commented by ${actorName} [${slug}]`);
    }
    for (const [id, t] of beforeTasks) {
      if (!afterIds.has(id)) logInfo(`task removed "${t.title || 'untitled'}" by ${actorName} [${slug}]`);
    }
  } catch {
    /* never fail a doc push over logging */
  }
}

/* =====================================================================
   WEBHOOK DELIVERY ENGINE — Phase 67 (WHK-03/WHK-05, T-67-01/02/03/04).
   =====================================================================
   Claim/delivery state machine over webhook_deliveries (POL-02 co-design,
   Phase 68 reuses the shape):

   - Exactly-once claim: the UNIQUE dedup_key IS the claim. The enqueue
     (INSERT OR IGNORE) commits INSIDE the transaction that produced the
     event; a duplicate (hook, event, subject) is a no-op — a re-run is
     free (reminders_sent pattern).
   - Never mark-then-send (Phase 38 invariant): the attempt is claimed with
     a GUARDED update (attempt = attempt + 1 where attempt = seen) BEFORE
     the fetch, so two concurrent passes cannot both send; the 'delivered'
     status is written only AFTER the HTTP request returned 2xx.
   - D-05: 5 attempts max (webhook-retry.js backoff table), Retry-After
     (seconds or HTTP-date) honored when present. attempt ≥ 5 → 'dead'
     (D-06 badge feeds 67-04).
   - WHK-05/T-67-01: ssrfOk(hook.url) is re-checked EVERY attempt, BEFORE
     fetch; fetch carries redirect:'error' (a redirect could point at an
     internal address) and AbortSignal.timeout(10_000) (house rule,
     oidc.js:28 — every outbound fetch carries it). WR-01 fix (v2.4
     audit): when no test fetch is injected, the send goes through
     pinnedFetch — the TLS connect resolves the hostname THROUGH the
     guard-validated address set, closing the within-attempt rebinding
     window (ssrfOk validated one resolution; the old plain fetch
     resolved the name AGAIN, and a rebinding attacker could flip DNS in
     between).
   - T-67-03 log hygiene: log hook id + delivery id + status code + HOST
     only — never the URL (the Workflows URL is itself a bearer secret:
     its query carries the bearer) and never the signing secret.
   - Fail-absent: every delivery error is caught inside the pass; one bad
     row never kills the tick, and the pass never throws to its callers.
   ===================================================================== */
/* D-07: deliveries older than 7 days are purged by the pass (piggybacks
   the 30 s tick — no new timer; CONTEXT.md leaves the purge mechanism to
   discretion). */
const WEBHOOK_RETENTION_MS = 604_800_000;

/* WHK-03 exactly-once claim. Called INSIDE the enqueue transaction; the
   dedup key is {hookId}:{event}:{subjectKey} (subjectKey = taskId or
   project id), plus the event's occurredAt as the OCCURRENCE component
   when the caller provides one (CR-01 fix, v2.4 audit): the doc-PUT diff
   stamps occurredAt per diff-call, so a repeat real-world event for the
   same subject (task completed → reopened → completed again) claims a
   NEW row instead of being silently no-op'd forever by the old 3-part
   key. Callers without an occurrence (the test nonce, the reminder site
   — its subjectId already encodes offset:due) keep the 3-part key.
   Returns the claim result (changes = 1 → this caller owns
   the delivery, 0 → already claimed). `ctxJson` (67-02) is the diff-time
   event snapshot + D-03 context trio stored on the row — the envelope is
   built from THIS at delivery time (task.deleted keeps the last-known
   title; a huge comment body truncates from the original text). */
function webhookDedupKey(hookId, event, subjectId, occurrence) {
  const base = `${hookId}:${event}:${subjectId}`;
  return occurrence == null || occurrence === '' ? base : `${base}:${occurrence}`;
}
function enqueueWebhookDelivery({ hookId, workspaceId, event, subjectId, occurrence, ctxJson }) {
  return db.run('insert or ignore into webhook_deliveries (id, workspace_id, hook_id, event, dedup_key, ctx, attempt, status, created_at) values (?, ?, ?, ?, ?, ?, 0, ?, ?)', [
    uid(),
    workspaceId,
    hookId,
    event,
    webhookDedupKey(hookId, event, subjectId, occurrence),
    ctxJson || '',
    'pending',
    now(),
  ]);
}

/* WHK-02 (67-02) shared emission — called from EXACTLY TWO sites: the
   doc-PUT transaction (through enqueueWebhookDeliveries) and runReminderPass
   (due.reminder). Routes ONE event to the ACTIVE hooks subscribed to it, on
   the event's project. Claims commit inside the CALLER's transaction (doc-PUT
   tx / reminder claim tx) — the reminders_sent-style INSERT OR IGNORE dedup
   makes a re-emission a no-op, so reminder dedup + webhook claim can never
   double-fire (Pitfall 3). Fail-absent: an enqueue error must never fail its
   caller. Returns the number of claims made. */
async function emitWebhookEvent(workspaceId, { projectId, event, subjectId, occurrence, ctxJson }) {
  let claimed = 0;
  try {
    const hooks = await db.all("select id, events from webhook_hooks where workspace_id = ? and project_id = ? and status = 'active'", [workspaceId, projectId]);
    for (const hook of hooks) {
      let list = [];
      try {
        list = JSON.parse(hook.events);
      } catch {
        /* an unparseable filter subscribes to nothing */
        list = [];
      }
      if (!Array.isArray(list) || !list.includes(event)) continue;
      const r = await enqueueWebhookDelivery({ hookId: hook.id, workspaceId, event, subjectId, occurrence, ctxJson });
      claimed += r?.changes || 0;
    }
  } catch (err) {
    logWarn(`webhook emit ${event}: ${err.message}`);
  }
  return claimed;
}

/* WHK-02 emission: route diff events to the ACTIVE hooks subscribed to the
   event, on the event's project. A doc PUT may span several projects, so
   the project is resolved PER EVENT from the outgoing doc (a PUT-level
   single projectId would misroute multi-project writes). Called INSIDE the
   doc-PUT transaction — claims commit or roll back with the doc write.
   The D-03 context trio (projectName, projectId, authorName) is captured
   HERE, at diff time, and stored on the delivery row; task.assigned also
   resolves D-14 mentions (oid when the assignee account carries one — the
   users.aad_oid column (D-13) — bold-name fallback otherwise).
   Returns the number of claims made. */
async function enqueueWebhookDeliveries(workspaceId, next, events, { authorName } = {}) {
  if (!Array.isArray(events) || !events.length) return 0;
  const hooks = await db.all("select id, project_id, events from webhook_hooks where workspace_id = ? and status = 'active'", [workspaceId]);
  if (!hooks.length) return 0;
  const projectOf = new Map((Array.isArray(next?.data?.tasks) ? next.data.tasks : []).filter(t => t?.id).map(t => [t.id, t?.project]));
  const projectNameOf = new Map((Array.isArray(next?.data?.projects) ? next.data.projects : []).filter(p => p?.id).map(p => [p.id, p?.name || '']));
  const docMemberName = new Map((Array.isArray(next?.data?.members) ? next.data.members : []).filter(m => m?.id).map(m => [m.id, m?.name || '']));
  /* D-14 mention resolution: member_id → account name + aad_oid. Defensive
     on the column (users.aad_oid is the D-13 additive migration — until it
     exists the query still succeeds on name-only via the fallback below). */
  const resolveMentions = async memberIds => {
    const ids = (Array.isArray(memberIds) ? memberIds : []).filter(Boolean);
    if (!ids.length) return undefined;
    const byMember = new Map();
    try {
      const rows = await db.all(
        `select m.member_id, u.name, u.aad_oid from memberships m join users u on u.id = m.user_id
           where m.workspace_id = ? and m.member_id in (${ids.map(() => '?').join(',')})`,
        [workspaceId, ...ids],
      );
      for (const r of rows) byMember.set(r.member_id, r);
    } catch (err) {
      logWarn(`webhook mention resolve: ${err.message}`);
    }
    return ids.map(id => ({
      memberId: id,
      name: byMember.get(id)?.name || docMemberName.get(id) || id,
      oid: byMember.get(id)?.aad_oid || null,
    }));
  };
  let claimed = 0;
  for (const ev of events) {
    const data = ev?.data || {};
    const taskId = data.taskId || ev.subjectId;
    const projectId = data.projectId || projectOf.get(taskId);
    if (!projectId) continue;
    const ctx = { ...data, event: ev.event, projectId, projectName: data.projectName || projectNameOf.get(projectId) || '', authorName: authorName || null };
    if (ev.event === 'task.assigned') ctx.mentions = await resolveMentions(data.assignees);
    const ctxJson = JSON.stringify(ctx);
    claimed += await emitWebhookEvent(workspaceId, { projectId, event: ev.event, subjectId: ev.subjectId, occurrence: ev.occurredAt, ctxJson });
  }
  return claimed;
}

/* WHK-04 (67-02): the envelope is built from the delivery row's ctx — the
   diff-time event snapshot + D-03 context trio stored at enqueue — then
   run through truncateToCap (28 KB cap, D-02: truncate the biggest field,
   deliver anyway) and formatPayload(hook.format) (three Teams formats,
   unknown value → teams-adaptive, D-12). raw-json signs the raw stringified
   envelope. Fallback (rows enqueued without a ctx, e.g. the test harness):
   a minimal context rebuilt from the CURRENT doc at delivery time. */
async function webhookCtxFromDoc(workspaceId, event, subjectId) {
  const ctx = { event };
  try {
    const row = await db.get('select doc from workspaces where id = ?', [workspaceId]);
    const doc = JSON.parse(row?.doc || '{}');
    const task = (Array.isArray(doc?.data?.tasks) ? doc.data.tasks : []).find(x => x?.id === subjectId);
    if (task) {
      ctx.taskId = task.id;
      ctx.title = task.title || '';
      ctx.projectId = task.project;
      ctx.projectName = (Array.isArray(doc?.data?.projects) ? doc.data.projects : []).find(p => p?.id === task.project)?.name || '';
    }
  } catch {
    /* fail-absent: the subject id still labels the event */
  }
  return ctx;
}

async function webhookBodyFor(hook, d) {
  let ctx;
  try {
    ctx = d.ctx ? JSON.parse(d.ctx) : null;
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx !== 'object') ctx = await webhookCtxFromDoc(d.workspace_id, d.event, webhookSubjectKey(d));
  if (!ctx.occurredAt) ctx.occurredAt = new Date().toISOString(); // D-04
  const env = buildEnvelope(d.event, ctx) || buildEnvelope(d.event, { event: d.event, taskId: webhookSubjectKey(d), occurredAt: ctx.occurredAt });
  const capped = truncateToCap(env, hook.format);
  return JSON.stringify(formatPayload(hook.format, capped));
}

const webhookSubjectKey = d => {
  const prefix = `${d.hook_id}:${d.event}:`;
  return d.dedup_key?.startsWith(prefix) ? d.dedup_key.slice(prefix.length) : d.dedup_key;
};

/* Failure write-back, guarded by the attempt number (a concurrent pass
   that already re-claimed a higher attempt must not be clobbered). */
async function webhookFailDelivery(d, newAttempt, atMs, statusCode, errorText, retryAfterHeader, payloadHash) {
  const lastError = String(errorText || '').slice(0, 500);
  if (isDead(newAttempt)) {
    await db.run("update webhook_deliveries set status = 'dead', last_status_code = ?, last_error = ?, payload_hash = coalesce(?, payload_hash), next_attempt_at = null where id = ? and attempt = ?", [
      statusCode,
      lastError,
      payloadHash ?? null,
      d.id,
      newAttempt,
    ]);
    return { dead: 1 };
  }
  const nextAt = nextAttemptMs({ attempt: d.attempt, retryAfterHeader, now: atMs });
  await db.run("update webhook_deliveries set status = 'failed', next_attempt_at = ?, last_status_code = ?, last_error = ?, payload_hash = coalesce(?, payload_hash) where id = ? and attempt = ?", [
    nextAt,
    statusCode,
    lastError,
    payloadHash ?? null,
    d.id,
    newAttempt,
  ]);
  return { failed: 1 };
}

/* One delivery attempt. Returns a tally fragment; never throws (the pass
   wraps it anyway — fail-absent). */
async function deliverWebhook(d, atMs, fetchFn, lookup) {
  const hook = await db.get('select * from webhook_hooks where id = ?', [d.hook_id]);
  if (!hook || hook.status !== 'active') {
    /* The hook was deleted or disabled after enqueue — the claim row has
       nowhere to go: dead with an explicit reason, never retried forever. */
    await db.run("update webhook_deliveries set status = 'dead', last_error = ? where id = ?", ['hook removed or disabled', d.id]);
    return { dead: 1 };
  }
  /* T-67-02 guarded attempt claim: bump BEFORE the fetch — a concurrent
     pass racing on the same attempt number loses (changes = 0). Status
     stays pending/failed during the HTTP call. */
  const claimed = await db.run('update webhook_deliveries set attempt = attempt + 1 where id = ? and attempt = ? and status in (?, ?)', [d.id, d.attempt, 'pending', 'failed']);
  if (!claimed.changes) return { skipped: 1 };
  const newAttempt = d.attempt + 1;
  let host = '?';
  try {
    host = new URL(hook.url).host;
  } catch { /* logged as '?' — never the full URL (T-67-03) */ }

  /* WHK-05 per-attempt SSRF re-check, BEFORE fetch. A refusal consumes the
     attempt and reschedules per D-05 — the guard is re-evaluated on the
     next attempt too (DNS rebinding between attempts is still caught). */
  const guard = await ssrfOk(hook.url, { lookup });
  if (!guard.ok) {
    logWarn(`webhook delivery ${d.id} hook ${hook.id} refused by SSRF guard (host ${host}): ${guard.reason}`);
    return await webhookFailDelivery(d, newAttempt, atMs, null, `ssrf refused (${guard.reason})`, null, null);
  }

  let bodyStr;
  try {
    bodyStr = await webhookBodyFor(hook, d);
  } catch (err) {
    return await webhookFailDelivery(d, newAttempt, atMs, null, `envelope build: ${err.message}`, null, null);
  }
  const signature = crypto.createHmac('sha256', hook.secret).update(bodyStr).digest('hex');
  const payloadHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

  let res = null;
  let fetchErr = null;
  /* WR-01 fix: the default transport is pinnedFetch bound to the address
     set ssrfOk just validated; an injected fetchFn (test harness, the
     test route) keeps its old contract. redirect:'error' is moot on the
     pinned path — node:https never follows redirects. */
  const send = fetchFn || ((u, o) => pinnedFetch(u, { addresses: guard.addresses, ...o }));
  try {
    res = await send(hook.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gr8r-signature': `sha256=${signature}` },
      body: bodyStr,
      redirect: 'error', // T-67-01: a redirect could point at an internal address
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    fetchErr = err;
  }

  if (res && res.ok) {
    await db.run("update webhook_deliveries set status = 'delivered', delivered_at = ?, last_status_code = ?, last_error = '', payload_hash = ? where id = ? and attempt = ?", [
      atMs,
      res.status,
      payloadHash,
      d.id,
      newAttempt,
    ]);
    logInfo(`webhook delivery ${d.id} hook ${hook.id} delivered (status ${res.status}, host ${host}, attempt ${newAttempt})`);
    return { delivered: 1 };
  }
  const statusCode = res ? res.status : null;
  const errorText = fetchErr ? `${fetchErr?.name || 'fetch'}: ${fetchErr?.message}` : `http ${statusCode}`;
  if (res) logWarn(`webhook delivery ${d.id} hook ${hook.id} not delivered (status ${statusCode}, host ${host}, attempt ${newAttempt})`);
  else logWarn(`webhook delivery ${d.id} hook ${hook.id} transport error (host ${host}, attempt ${newAttempt})`);
  /* Retry-After honored on 429/5xx only (Pitfall 7: seconds OR HTTP-date). */
  const retryAfterHeader = res && (res.status === 429 || res.status >= 500) ? res.headers?.get?.('retry-after') : null;
  return await webhookFailDelivery(d, newAttempt, atMs, statusCode, errorText, retryAfterHeader, payloadHash);
}

/*
 * One delivery pass over webhook_deliveries. Injectable clock (`now`, an
 * epoch-ms number or Date), fetch and DNS lookup — the test harness drives
 * attempts without network or real timers. Starts with the D-07 retention
 * purge, then drains due rows. Fail-absent: resolves even when every
 * delivery throws. */
async function runWebhookDeliveryPass({ now: at, fetch: fetchFn, lookup } = {}) {
  const atMs = at instanceof Date ? at.getTime() : Number.isFinite(at) ? at : now();
  const tally = { purged: 0, due: 0, delivered: 0, failed: 0, dead: 0, skipped: 0 };
  try {
    const purge = await db.run('delete from webhook_deliveries where created_at < ?', [atMs - WEBHOOK_RETENTION_MS]);
    tally.purged = purge.changes || 0;
    if (tally.purged) logInfo(`webhook delivery purge: ${tally.purged} row(s) older than 7 days`);
  } catch (err) {
    logWarn(`webhook purge: ${err.message}`);
  }
  let due;
  try {
    due = await db.all("select * from webhook_deliveries where status in ('pending', 'failed') and (next_attempt_at is null or next_attempt_at <= ?) order by created_at", [atMs]);
  } catch (err) {
    logWarn(`webhook drain select: ${err.message}`);
    return tally;
  }
  tally.due = due.length;
  for (const d of due) {
    try {
      const r = await deliverWebhook(d, atMs, fetchFn, lookup);
      for (const k of ['delivered', 'failed', 'dead', 'skipped']) tally[k] += r?.[k] || 0;
    } catch (err) {
      /* fail-absent: one bad delivery never kills the pass (house rule) */
      tally.failed += 1;
      logWarn(`webhook delivery ${d.id}: ${err.message}`);
    }
  }
  return tally;
}

/* =======================================================================
   Email delivery engine (Phase 68, POL-02 / D-04..D-08) — the webhook
   delivery engine's second consumer, same mental model (D-06: identical
   retry policy via the shared webhook-retry.js math). Producers (notif
   loop, digest loop) insert one email_outbox claim per email inside their
   semantic-claim transaction; this pass drains due rows post-commit.
   ======================================================================= */

/* Failure write-back, guarded by the attempt number (a concurrent pass
   that already re-claimed a higher attempt must not be clobbered).
   D-06: 5 attempts max via isDead; D-08: dead rows purge after 7 days. */
async function emailFailDelivery(d, newAttempt, atMs, errorText) {
  const lastError = String(errorText || '').slice(0, 500);
  if (isDead(newAttempt)) {
    await db.run("update email_outbox set status = 'dead', last_status_code = null, last_error = ?, next_attempt_at = null where id = ? and attempt = ?", [
      lastError,
      d.id,
      newAttempt,
    ]);
    return { dead: 1 };
  }
  await db.run("update email_outbox set status = 'failed', next_attempt_at = ?, last_status_code = null, last_error = ? where id = ? and attempt = ?", [
    nextAttemptMs({ attempt: d.attempt, now: atMs }),
    lastError,
    d.id,
    newAttempt,
  ]);
  return { failed: 1 };
}

/* One delivery attempt. Rebuilds the email from the row's ctx (the
   diff-time snapshot) and hands it to the injected send (or MAILER).
   Never throws (the pass wraps it anyway — fail-absent). */
async function deliverEmail(d, atMs, sendFn) {
  /* Guarded attempt claim (T-67-02 pattern): bump BEFORE the send — a
     concurrent pass racing on the same attempt number loses. */
  const claimed = await db.run('update email_outbox set attempt = attempt + 1 where id = ? and attempt = ? and status in (?, ?)', [d.id, d.attempt, 'pending', 'failed']);
  if (!claimed.changes) return { skipped: 1 };
  const newAttempt = d.attempt + 1;
  let ctx;
  try {
    ctx = d.ctx ? JSON.parse(d.ctx) : null;
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx !== 'object' || !ctx.type) {
    /* Malformed row: dead with an explicit reason, never retried forever. */
    await db.run("update email_outbox set status = 'dead', last_error = ? where id = ?", ['malformed ctx', d.id]);
    return { dead: 1 };
  }
  const { type, ...args } = ctx;
  const send =
    sendFn ||
    (async (kind, a) => {
      if (kind === 'digest') return MAILER.sendDigest(a);
      /* Phase 91 (NOTIF-01, D-03/D-04): one aggregated row = one send; the
         stored ctx is replayed verbatim on every retry (pure re-render). */
      if (kind === 'digest-aggregated') return MAILER.sendDigestAggregated(a);
      if (kind === 'backup_alert') return MAILER.sendBackupAlert(a);
      if (kind === 'restore_alert') return MAILER.sendRestoreAlert(a);
      return MAILER.sendNotif(a);
    });
  try {
    await send(type, args);
    await db.run("update email_outbox set status = 'delivered', delivered_at = ?, last_status_code = null, last_error = '' where id = ? and attempt = ?", [
      atMs,
      d.id,
      newAttempt,
    ]);
    return { delivered: 1 };
  } catch (err) {
    logWarn(`email delivery ${d.id} → ${d.recipient}: ${err?.message || err}`);
    return await emailFailDelivery(d, newAttempt, atMs, `${err?.name || 'Error'}: ${err?.message}`);
  }
}

/*
 * One delivery pass over email_outbox — mirrors runWebhookDeliveryPass:
 * D-08 retention purge (dead rows cannot accumulate), then drains due rows.
 * Injectable clock (`now`, epoch-ms number or Date) and send fn (the test
 * harness drives attempts without SMTP). MAILER-disabled servers return
 * immediately — producers skip claiming, so the pass leaves any row
 * untouched (open question 2: claim-based retry only matters when SMTP is
 * configured but down). Fail-absent.
 *
 * Phase 91 (Rule-1 fix): passes are SERIALIZED on a module-level promise
 * chain. The digest coalescing kicks the pass post-commit right after the
 * reminder loop's own post-commit kick — two concurrent passes re-select a
 * row whose attempt was already bumped and deliverEmail's
 * `where attempt = ?` claim matches again, double-sending. Chaining keeps
 * POL-02 D-07 (post-commit kick, never in tx) while closing the same-tick
 * double-send window; every caller still gets its own full drain. */
let emailDeliveryChain = Promise.resolve();
async function runEmailDeliveryPass({ now: at, send: sendFn } = {}) {
  const run = emailDeliveryChain.then(() => runEmailDeliveryPassNow({ now: at, send: sendFn }));
  emailDeliveryChain = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function runEmailDeliveryPassNow({ now: at, send: sendFn } = {}) {
  const atMs = at instanceof Date ? at.getTime() : Number.isFinite(at) ? at : now();
  const tally = { purged: 0, due: 0, delivered: 0, failed: 0, dead: 0, skipped: 0 };
  if (!MAILER.enabled) return tally;
  try {
    const purge = await db.run('delete from email_outbox where created_at < ?', [atMs - WEBHOOK_RETENTION_MS]);
    tally.purged = purge.changes || 0;
    if (tally.purged) logInfo(`email outbox purge: ${tally.purged} row(s) older than 7 days`);
  } catch (err) {
    logWarn(`email outbox purge: ${err.message}`);
  }
  let due;
  try {
    due = await db.all("select * from email_outbox where status in ('pending', 'failed') and (next_attempt_at is null or next_attempt_at <= ?) order by created_at", [atMs]);
  } catch (err) {
    logWarn(`email outbox drain select: ${err.message}`);
    return tally;
  }
  tally.due = due.length;
  for (const d of due) {
    try {
      const r = await deliverEmail(d, atMs, sendFn);
      for (const k of ['delivered', 'failed', 'dead', 'skipped']) tally[k] += r?.[k] || 0;
    } catch (err) {
      /* fail-absent: one bad delivery never kills the pass (house rule) */
      tally.failed += 1;
      logWarn(`email delivery ${d.id}: ${err.message}`);
    }
  }
  return tally;
}

/* Test-only injectable fetch + DNS lookup for the internal route — the
   node:test harness pins claim/retry/SSRF/retention behavior with ZERO
   network and ZERO real timers. Body contract:
     fetch:   { statusCode, retryAfter, throw }  (a Response or a throw)
     lookup:  { hostname: [ip, ...] }            (fake dns.lookup(all)) */
function webhookTestFetch(spec = {}, calls = []) {
  return async (url, init) => {
    calls.push({
      host: (() => {
        try {
          return new URL(url).host;
        } catch {
          return '?';
        }
      })(),
      signature: init?.headers?.['x-gr8r-signature'] || null,
      body: typeof init?.body === 'string' ? init.body : '',
    });
    if (spec.throw) throw new Error(String(spec.throw));
    return new Response(spec.body ?? '', {
      status: spec.statusCode ?? 200,
      headers: spec.retryAfter != null ? { 'retry-after': String(spec.retryAfter) } : {},
    });
  };
}

function webhookTestLookup(map) {
  return async hostname => (map?.[hostname] || ['93.184.216.34']).map(a => ({ address: a, family: a.includes(':') ? 6 : 4 }));
}

/* =====================================================================
   BACKUP SCHEDULER — Phase 87 (87-02, BKBCK-03/BKBCK-04, D-05..D-08).
   =====================================================================
   The sweep is a named async helper with an injectable clock (the
   runEmailDeliveryPass({ now }) precedent) so tests time-travel without
   sleeps. Catch-up is AT-MOST-ONCE BY CONSTRUCTION: a due task fires at
   most once per pass and next_run_at is recomputed from NOW (never from
   the missed window — no while(next <= now) fire loop exists anywhere;
   D-05). next_run_at is advanced BEFORE the fire is awaited so a long
   export cannot let a concurrent pass double-fire the same task.

   T-87-04: per-task try/catch — one malformed task never starves the
   others in the same tick, and the interval callback keeps the
   try/catch + promise .catch + unref() discipline (an uncaught throw in
   a setInterval callback kills the process). */

/* Persisted-run writer (BKBCK-04 / 86-D-11): installed ONCE at boot; the
   seam in export/backup.js emits start/complete/fail for EVERY run — the
   manual POST /api/backup/runs path AND scheduled sweep fires — so both
   triggers produce backup_runs history rows. Row id = the D-18 run id.
   Writer errors never propagate (the seam swallows them). */
const writeBackupRunRow = async event => {
  if (event.kind === 'start') {
    await db.run(
      'insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values (?,?,?,?,?,?,?)',
      [event.runId, event.taskId ?? null, JSON.stringify({ kind: event.scope?.kind, id: event.scope?.id ?? null }), event.trigger, 'running', event.startedAt, now()],
    );
  } else if (event.kind === 'complete') {
    await db.run(
      'update backup_runs set status = ?, finished_at = ?, duration_ms = ?, size_bytes = ?, sha256 = ?, filename = ? where id = ?',
      ['succeeded', event.finishedAt, event.durationMs, event.sizeBytes, event.sha256, event.filename, event.runId],
    );
    if (event.taskId) {
      /* Phase 92 (BKNAME-02, D-02): bucket-at-creation — query the task's
         PRIOR succeeded runs in the rotation ordering (`created_at asc, id
         asc`, Pitfall-1 tiebreak) and store gfsBucketFor(...) on THIS new
         row only. Never writes historical rows — the backfill sweep is the
         single historical writer (gated, Phase 92 Task 4). Best-effort:
         a failed store leaves the row NULL, which the rotation's in-memory
         fallback and the boot sweep both handle through the shared
         function. */
      try {
        const row = await db.get('select id, created_at from backup_runs where id = ?', [event.runId]);
        if (row) {
          const prior = await db.all(
            "select id, created_at from backup_runs where task_id = ? and status = 'succeeded' and id <> ? order by created_at asc, id asc",
            [event.taskId, event.runId],
          );
          const bucket = gfsBucketFor(prior, row);
          if (bucket) await db.run('update backup_runs set gfs_bucket = ? where id = ?', [bucket, event.runId]);
        }
      } catch (err) {
        logWarn(`backup run ${event.runId}: gfs_bucket store skipped: ${err?.message || err}`);
      }
      /* 87-03: verified success → GFS rotation for THIS task (D-10/D-13:
         the pipeline fails the run on manifest mismatch, so 'succeeded' IS
         verified success — rotation only ever follows a verified run),
         then the outcome transition hook (failed→ok recovery email, D-16).
         Both are swallowed with any other writer error by the seam. */
      await runBackupRotationPass({ taskId: event.taskId });
      await handleBackupTaskOutcome(event.taskId, event.runId, 'ok', '');
    }
  } else if (event.kind === 'upload_failed') {
    /* Phase 88 (88-03, D-88-1/2/3): a failed S3 upload is a DISTINCT terminal
       state — the local archive was published first and is KEPT, so the row
       carries filename/sha256/size like a success. The email gate rides it
       as a FAILED outcome (failure email on entry, recovery on later
       success, D-88-3) — handleBackupTaskOutcome needs no change. */
    await db.run(
      'update backup_runs set status = ?, finished_at = ?, duration_ms = ?, size_bytes = ?, sha256 = ?, filename = ?, error = ? where id = ?',
      ['upload_failed', event.finishedAt, event.durationMs, event.sizeBytes ?? null, event.sha256 ?? null, event.filename ?? null, event.error, event.runId],
    );
    if (event.taskId) {
      await handleBackupTaskOutcome(event.taskId, event.runId, 'failed', event.error);
    }
  } else if (event.kind === 'fail') {
    await db.run(
      'update backup_runs set status = ?, finished_at = ?, duration_ms = ?, error = ? where id = ?',
      ['failed', event.finishedAt, event.durationMs, event.error, event.runId],
    );
    if (event.taskId) {
      /* 87-03: outcome transition (ok→failed failure email on transition
         only, D-15 — consecutive failures never re-email). */
      await handleBackupTaskOutcome(event.taskId, event.runId, 'failed', event.error);
    }
  }
};
setBackupRunWriter(writeBackupRunRow);

/* Phase 92 (BKNAME-01/D-02): the GFS marker provider for archive naming —
   the SAME single pure function bucket-at-creation uses (one definition).
   Called once per scheduled run, after the start-event row insert, so the
   row exists; derives from the row + prior succeeded history in the
   rotation ordering (created_at asc, id asc — Pitfall-1 tiebreak). */
setBackupGfsBucketProvider(async ({ taskId, runId }) => {
  const row = await db.get('select id, created_at from backup_runs where id = ?', [runId]);
  if (!row) return null;
  const prior = await db.all(
    "select id, created_at from backup_runs where task_id = ? and status = 'succeeded' and id <> ? order by created_at asc, id asc",
    [taskId, runId],
  );
  return gfsBucketFor(prior, row);
});

/* =====================================================================
   RESTORE RUNS + GLOBAL RESTORE LOCK (Phase 89, 89-02, BKRST-02/D-89-31).
   =====================================================================
   The persisted restore lifecycle (D-89-2): restore-trigger routes (plan
   04/05) emit start/update/fail/finish events through this best-effort
   seam — the exact shape of export/backup.js's setBackupRunWriter/
   emitRunEvent pair — and every event lands in restore_runs carrying the
   D-89-29 stage vocabulary (fetching → validating → restoring →
   verifying → done|failed, CHECK-enforced at the schema). Writer errors
   never propagate: history-write trouble must never fail a restore. */
let restoreRunWriter = null;
export function setRestoreRunWriter(fn) {
  restoreRunWriter = typeof fn === 'function' ? fn : null;
}
async function emitRestoreRunEvent(event) {
  if (!restoreRunWriter) return;
  try {
    await restoreRunWriter(event);
  } catch {
    /* history-write trouble never fails a restore (best-effort discipline) */
  }
}

/* Row-shaped writer: 'start' inserts the running/fetching row, 'update'
   advances the stage/snapshot/summary fields (coalesce — a partial event
   never wipes an earlier value), 'fail' forces the failed terminal state
   with the slice(0, 300) error discipline, 'finish' lands done. Every
   write through parameterized statements. */
const writeRestoreRunRow = async event => {
  if (event.kind === 'start') {
    await db.run(
      'insert into restore_runs (id, scope, trigger, status, stage, started_at, created_at) values (?,?,?,?,?,?,?)',
      [event.runId, JSON.stringify({ kind: event.scope?.kind, id: event.scope?.id ?? null }), event.trigger, 'running', 'fetching', event.startedAt, now()],
    );
  } else if (event.kind === 'update') {
    await db.run(
      'update restore_runs set stage = coalesce(?, stage), snapshot_run_id = coalesce(?, snapshot_run_id), snapshot_tag = coalesce(?, snapshot_tag), summary = coalesce(?, summary), final_name = coalesce(?, final_name) where id = ?',
      [event.stage ?? null, event.snapshotRunId ?? null, event.snapshotTag ?? null, event.summary ?? null, event.finalName ?? null, event.runId],
    );
  } else if (event.kind === 'fail') {
    /* The `and status = 'running'` guard IS the D-89-28 transition gate —
       the same compare-in-UPDATE atomicity as backup_tasks.last_notified_state
       (87-03): a duplicate terminal event for a finished run changes zero
       rows, and the outcome hook below claims nothing. */
    const res = await db.run(
      'update restore_runs set status = ?, stage = ?, error = ?, summary = coalesce(?, summary), final_name = coalesce(?, final_name), finished_at = ? where id = ? and status = ?',
      ['failed', 'failed', String(event.error ?? '').slice(0, 300), event.summary ?? null, event.finalName ?? null, event.finishedAt, event.runId, 'running'],
    );
    if (res.changes) await handleRestoreRunOutcome(event.runId, 'failed', { error: String(event.error ?? '').slice(0, 300), finalName: event.finalName ?? null });
  } else if (event.kind === 'finish') {
    const res = await db.run(
      'update restore_runs set status = ?, stage = ?, summary = coalesce(?, summary), final_name = coalesce(?, final_name), finished_at = ? where id = ? and status = ?',
      ['done', 'done', event.summary ?? null, event.finalName ?? null, event.finishedAt, event.runId, 'running'],
    );
    if (res.changes) await handleRestoreRunOutcome(event.runId, 'done', { finalName: event.finalName ?? null });
  }
};
setRestoreRunWriter(writeRestoreRunRow);

/* 89-04 outcome emails (D-89-28): a REAL terminal transition (the guarded
   write above observed changes ≥ 1 — exactly the last_notified_state
   discipline) enqueues one POL-02 claim row per recipient (Backup Operators
   + Super Admins, the same union as the backup alert, D-17: no
   notification-preferences gating). workspace_id sentinel '' (instance-scope
   rows), dedup_key `restore-alert:<runId>:<email>` — one claim per run per
   recipient even if a terminal event were somehow replayed. kind
   'restore_alert'. Enqueue gated on MAILER.enabled (no SMTP → zero claims;
   the transition was already consumed — honest, matches 87-03). Delivery is
   post-commit via runEmailDeliveryPass().catch(...) — never awaited into
   any response. Locale keys defer to plan 06 (page.restore email keys ×5,
   the 87-03 handoff precedent) — the builder's key-shaped-fallback detector
   renders the English literals in the meantime. DR (trigger 'instance')
   skips this gate — the re-login wall is its notification (D-89-28,
   enforced by the trigger check below). */
async function handleRestoreRunOutcome(runId, outcome, { error = '', finalName = null } = {}) {
  if (!MAILER.enabled) return;
  /* D-89-28: DR (trigger 'instance') skips the outcome email — the
     post-commit global session revocation (D-89-25) IS its notification:
     every recipient is force-logged-out before any claim could matter. */
  const run = await db.get('select trigger from restore_runs where id = ?', [runId]);
  if (run?.trigger === 'instance') return;
  const recipients = await db.all(
    `select distinct u.email, u.locale from instance_roles ir
       join users u on u.id = ir.user_id
      where ir.role = 'backup_operator'
      union
      select u.email, u.locale from users u where u.is_instance_admin = 1`,
  );
  for (const r of recipients) {
    const locale = r.locale && r.locale !== 'en' ? r.locale : null; // null → base EN at send time
    await db.run('insert or ignore into email_outbox (id, workspace_id, dedup_key, kind, recipient, ctx, created_at) values (?,?,?,?,?,?,?)', [
      uid(),
      '',
      `restore-alert:${runId}:${r.email}`,
      'restore_alert',
      r.email,
      JSON.stringify({
        type: 'restore_alert',
        to: r.email,
        outcome, // 'done' | 'failed'
        runId,
        finalName: finalName || '',
        error: error || '',
        locale,
      }),
      now(),
    ]);
  }
  runEmailDeliveryPass().catch(err => logWarn(`restore alert post-commit pass: ${err.message}`));
}

/* 89-04: the engine-level seam install — export/restore.js's stage events
   (validating → restoring → verifying → done|failed, Task 2 runRestore)
   forward into this writer exactly like setBackupRunWriter does for the
   export core. The 'start' event remains the trigger route's own write. */
setRestoreRunEmitter(event => emitRestoreRunEvent(event));

/* Phase 96 (DEST-01, D-01/D-04/D-06): the S3 destination install —
   re-expressed through the destination registry so export/backup.js stays
   env/engine agnostic (the boot-frozen S3_* consts and the s3_enabled
   column read live HERE, the 88-02 custody). `upload` is the existing
   closure body VERBATIM: task runs upload only when the task opted in
   (s3_enabled = 1, D-88-6); manual Run-now archives (task_id NULL) upload
   whenever S3 is configured (D-88-4) under the backup-manual/ prefix
   (D-88-9, declared via manualPrefix per D-01). A task-row lookup error
   fails CLOSED (upload skipped, warned) — an S3 upload is never attempted
   on a broken read. Rotation stays local-only either way (D-88-7/D-11). */
setBackupDestination('s3', {
  label: 'S3',
  enabled: S3.enabled,
  manualPrefix: 'backup-manual/', // D-88-9 — DECLARED BY the destination (D-01)
  upload: async meta => {
    if (!S3.enabled) return null;
    if (meta?.taskId) {
      try {
        const task = await db.get('select s3_enabled from backup_tasks where id = ?', [meta.taskId]);
        if (!task || task.s3_enabled !== 1) return null;
      } catch (err) {
        logWarn(`backup s3: task ${meta.taskId} lookup failed — upload skipped: ${err?.message || err}`);
        return null;
      }
    }
    return { config: S3.config() };
  },
});

/* Phase 96 (D-05): dormant ftp/smb registry slots — canonical order s3,
   ftp, smb (D-04), registered AFTER s3. enabled derives from the
   boot-frozen env consts (D-05); upload/verify/probe/fetchToStaged are
   deliberately UNSET — phases 98/100 install the real clients. The
   manualPrefixes are DECLARED per-destination (D-01) but never used in 96.
   NO fake probe, NO UI render, NO export/ftp.js or export/smb.js this
   phase (D-05); /api/config exposes ftpEnabled/smbEnabled as false in 96. */
setBackupDestination('ftp', {
  label: 'FTP',
  enabled: !!(FTP_HOST && FTP_USER && FTP_PASSWORD), // derived from env — D-05
  manualPrefix: 'backup-ftp/', // declared, never used in 96 (D-05)
});
setBackupDestination('smb', {
  label: 'SMB',
  enabled: !!(SMB_HOST && SMB_SHARE && SMB_USER && SMB_PASSWORD), // derived from env — D-05
  manualPrefix: 'backup-smb/', // declared, never used in 96 (D-05)
});

export async function runBackupSchedulerPass({ now: at } = {}) {
  const nowMs = at instanceof Date ? at.getTime() : Number(at ?? Date.now());
  const due = await db.all(
    'select * from backup_tasks where enabled = 1 and next_run_at is not null and next_run_at <= ?',
    [nowMs],
  );
  for (const task of due) {
    /* T-87-04: one malformed task never starves the others in the same tick. */
    try {
      const next = nextRunAt(task.cron, task.tz, nowMs);
      if (!Number.isInteger(next)) {
        /* A stored cron the evaluator cannot parse fails the task honestly —
           log + clear the cache, never crash the sweep (D-08 discipline). */
        logWarn(`backup scheduler: task ${task.id} cron "${task.cron}" does not evaluate — no fire, next_run_at cleared`);
        await db.run('update backup_tasks set next_run_at = ?, updated_at = ? where id = ?', [null, nowMs, task.id]);
        continue;
      }
      /* D-05: advance the persisted cache from NOW first — several missed
         windows collapse into this single firing, and a concurrent pass
         (or a crash mid-export) can never re-fire the same window. */
      await db.run('update backup_tasks set next_run_at = ?, updated_at = ? where id = ?', [next, nowMs, task.id]);
      /* D-89-1 (89-02, export-side half): a held restore_lock blocks a
         scheduled fire too — the same mutual exclusion the manual trigger
         honors, never a scheduler bypass (T-89-04). The refused window
         records a skipped_overlap row carrying the reason (D-06 — never
         silent) and no export starts; next_run_at was already advanced
         above, so the 87-02 catch-up-once discipline holds for the skipped
         window as well. */
      if (await restoreLockHeld()) {
        await db.run(
          'insert into backup_runs (id, task_id, scope, trigger, status, error, started_at, created_at) values (?,?,?,?,?,?,?,?)',
          [uid(), task.id, task.scope, 'scheduled', 'skipped_overlap', 'restore_in_progress', nowMs, nowMs],
        );
        continue;
      }
      let scope;
      try { scope = JSON.parse(task.scope); } catch { scope = {}; }
      /* 86-D-10 overlap: the sweep maps runExport's SYNCHRONOUS claim refusal
         — the claim inside runExport is the atomicity point (86-02 precedent,
         chosen over a pre-claim getRunState() probe). A refused fire records
         a skipped_overlap history row (D-06 — never silent) and never starts
         a second export. */
      const result = await runExport(scope, { taskId: task.id, trigger: 'scheduled' });
      if (!result.ok && result.code === 'backupRunInProgress') {
        await db.run(
          'insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values (?,?,?,?,?,?,?)',
          [uid(), task.id, task.scope, 'scheduled', 'skipped_overlap', nowMs, nowMs],
        );
      }
    } catch (err) {
      logWarn(`backup scheduler: task ${task.id}: ${err?.message || err}`);
    }
  }
  return due.length;
}

/* Boot-time stale-run sweep (BKBCK-03): a crash mid-export leaves
   status='running' rows behind; boot marks them interrupted before the
   first sweep tick so history never lies about in-flight work. */
async function sweepStaleBackupRuns() {
  const marked = (await db.run('update backup_runs set status = ? where status = ?', ['interrupted', 'running']))?.changes || 0;
  return marked;
}

/* Boot-time restore sweeps (Phase 89, 89-02, D-89-31): a crash mid-restore
   leaves status='running' restore_runs rows AND a held restore_lock behind;
   boot marks the rows interrupted (stage 'failed', honest error text — the
   87 stale-sweep idiom) and releases the claim, BEFORE the first restore
   trigger or scheduler tick can observe either. Both writes are plain
   UPDATEs (no DDL — D-89-31: schema comes from boot runSchema only). */
async function sweepStaleRestoreRuns() {
  const marked =
    (await db.run(
      "update restore_runs set status = 'interrupted', stage = 'failed', error = 'interrupted at boot', finished_at = ? where status = 'running'",
      [now()],
    ))?.changes || 0;
  const released = (await db.run('update restore_lock set claimed_by = null, claimed_at = null where claimed_by is not null'))?.changes || 0;
  return { marked, released };
}

/* 87-03 failure/recovery email transitions (D-14..D-17). Called from the
   writer seam for EVERY task-scoped run outcome. Map outcome → observed
   state ('ok' | 'failed'), compare-and-update backup_tasks.last_notified_state
   in ONE guarded write (the compare lives in the UPDATE — the atomic
   last-write wins, so two concurrent passes can never both observe a
   transition), and on a REAL transition enqueue one POL-02 claim row per
   recipient (instance_roles backup_operator + users.is_instance_admin=1,
   D-17: no notification-preferences gating for backup alerts — operators
   who own the task must hear about its failure/recovery regardless).
   workspace_id sentinel '' (instance-scope rows, POL-02 nullable-workspace
   precedent), dedup_key `backup-alert:<runId>:<recipientEmail>` (one claim
   per run per recipient), kind 'backup_alert'. Enqueue gated on
   MAILER.enabled (no SMTP → the state is still tracked honestly, zero
   claims). Delivery is post-commit via runEmailDeliveryPass().catch(...)
   (fire-and-forget, the seam's failure discipline). */
async function handleBackupTaskOutcome(taskId, runId, outcome, errorText) {
  const notified = outcome === 'ok' ? 'ok' : 'failed'; // whitelist the observed state
  const task = await db.get('select id, name, last_notified_state from backup_tasks where id = ?', [taskId]);
  if (!task) return;
  /* D-16: NULL→ok (first-ever success) is NOT a transition; recovery fires
     only after a NOTIFIED failure. Steady-state outcomes write only. */
  const transition =
    (task.last_notified_state === 'failed' && notified === 'ok' && 'recovered') ||
    (task.last_notified_state !== 'failed' && notified === 'failed' && 'failed') ||
    null;
  const claimed = await db.run('update backup_tasks set last_notified_state = ? where id = ? and (last_notified_state is null or last_notified_state <> ?)', [
    notified,
    taskId,
    notified,
  ]);
  if (!claimed.changes || !transition) return; // no transition observed → nothing to email
  if (!MAILER.enabled) return; // D-17: enqueue gated on SMTP presence (state still tracked above)
  const recipients = await db.all(
    `select distinct u.email, u.locale from instance_roles ir
       join users u on u.id = ir.user_id
      where ir.role = 'backup_operator'
      union
      select u.email, u.locale from users u where u.is_instance_admin = 1`,
  );
  for (const r of recipients) {
    const locale = r.locale && r.locale !== 'en' ? r.locale : null; // null → base EN at send time
    const subjectKey = transition === 'recovered' ? 'backup.alert.recovered.subject' : 'backup.alert.failed.subject';
    await db.run('insert or ignore into email_outbox (id, workspace_id, dedup_key, kind, recipient, ctx, created_at) values (?,?,?,?,?,?,?)', [
      uid(),
      '',
      `backup-alert:${runId}:${r.email}`,
      'backup_alert',
      r.email,
      JSON.stringify({
        type: 'backup_alert',
        to: r.email,
        transition,
        taskId,
        taskName: task.name,
        runId,
        error: errorText || '',
        subjectKey,
        locale,
      }),
      now(),
    ]);
  }
  runEmailDeliveryPass().catch(err => logWarn(`backup alert post-commit pass: ${err.message}`));
}

/* =====================================================================
   GFS ROTATION (Phase 87, plan 87-03, BKBCK-03 / D-09..D-13).

   One pass, per task, over THAT task's succeeded backup_runs rows only
   (D-11: every delete query is scoped by task_id — task_id NULL manual
   archives are structurally outside every task's set, T-87-06; filenames
   are read from DB rows only). Buckets are assigned exactly-one-per-run
   (D-10) lazily at rotation time from the run's UTC calendar position —
   the same UTC stamp archiveName() writes into the filename
   (export/backup.js:502-510). Deletable = per-bucket rows beyond the
   task's keep-N, minus the newest VERIFIED run's EXPLICIT ID (D-13 —
   exclusion lives in the delete-set query as `id <> ?`, never ordering
   arithmetic alone, T-87-07), with the refuse-to-empty floor as an
   independent second guard. Deletion order: .sha256 sidecar FIRST, then
   the .tar.gz, both best-effort (rmStaging discipline, Pitfall 5); run
   rows are marked status='deleted' only after both unlinks — history
   rows REMAIN, marked deleted (D-12). One audited event per task pass;
   details ride the action string per house convention
   (group_<delta>:group:<guid>:... precedent) — ids, per-id bucket, why.
   Injectable clock ({ now }) like every other pass. Invoked from the
   run-writer seam's complete event (verified success only — the export
   pipeline fails the run on manifest mismatch, so 'succeeded' IS
   verified success).
   ===================================================================== */

/* Phase 92 (BKNAME-02) + assignGfsBuckets relocated VERBATIM
   into export/gfs.js — THE single pure GFS definition (D-02: one function
   feeds naming, rotation, gfsKeptPositions and the backfill). server.js
   imports them beside the cron module. The pinned date tests
   (test/gfs-kept-until.test.mjs) prove the relocation behavior-neutral. */

/* Phase 92 (D-02): boot backfill sweep — the ONLY writer of HISTORICAL
   backup_runs rows (bucket-at-creation covers new rows). Per task: walk ALL
   succeeded runs oldest-first through the ONE shared pure function, then
   write only the rows whose stored bucket is still NULL — the `where
   gfs_bucket is null` guard makes the sweep idempotent (a second boot is a
   no-op) and keeps any bucket written at creation untouched: the batch walk
   MUST span every succeeded run (not just the NULL ones), because a
   non-NULL predecessor consumes its calendar slots (exactly-one-bucket,
   D-10). Owner-approved one-way migration (decision 2026-11-24). */
async function backfillGfsBuckets() {
  const taskIds = (await db.all('select distinct task_id as id from backup_runs where task_id is not null')).map(r => r.id);
  let filled = 0;
  for (const taskId of taskIds) {
    try {
      const rows = await db.all(
        "select id, created_at, gfs_bucket from backup_runs where task_id = ? and status = 'succeeded' order by created_at asc, id asc",
        [taskId],
      );
      if (!rows.some(r => !r.gfs_bucket)) continue;
      const buckets = assignGfsBuckets(rows);
      for (const r of rows) {
        if (r.gfs_bucket) continue; // written at creation (or a previous sweep) — never touched
        const bucket = buckets.get(r.id);
        if (bucket) {
          await db.run('update backup_runs set gfs_bucket = ? where id = ? and gfs_bucket is null', [bucket, r.id]);
          filled += 1;
        }
      }
    } catch (err) {
      /* per-task try/catch — one broken task never starves the others (T-87-04 discipline) */
      logWarn(`gfs_bucket backfill task ${taskId}: ${err?.message || err}`);
    }
  }
  if (filled) logInfo(`gfs_bucket backfill: ${filled} succeeded run row(s) filled`);
}

/* Phase 90 (SC-3, D-90-16 refined): the kept-POSITION map — per-request
   retention visibility, never a date. GFS is count-based per bucket: a run's
   deletion depends on FUTURE run arrivals, so "run date + retention × cadence"
   is semantically wrong (90-RESEARCH Pitfall 1). Each succeeded run instead
   gets its position WITHIN its bucket, counted exactly like the keep-N
   reverse walk below: newest-first per bucket, 1 = newest of that bucket.
   keep is the task's CURRENT retention count for the run's bucket —
   recomputed on EVERY call from the live policy, never stored on the run
   row, so a policy change re-renders truthfully (D-90-16: kept-until is the
   bucket position, never a date). runsAsc is the succeeded runs of one task,
   created_at asc — the SAME input assignGfsBuckets consumes, so the badge
   and the deletion projection can never drift (one bucket source, one
   counting walk, dont-hand-roll). */
function gfsKeptPositions(task, runsAsc) {
  const buckets = assignGfsBuckets(runsAsc);
  const keep = { daily: task.retention_daily, weekly: task.retention_weekly, monthly: task.retention_monthly, yearly: task.retention_yearly };
  const seenPerBucket = {};
  const out = new Map();
  for (const r of [...runsAsc].reverse()) {
    const bucket = buckets.get(r.id);
    seenPerBucket[bucket] = (seenPerBucket[bucket] || 0) + 1;
    out.set(r.id, { position: seenPerBucket[bucket], keep: keep[bucket], scale: bucket });
  }
  return out;
}

/* One rotation pass. taskId rotates just that task; omitted rotates every
   task that has rotation-eligible rows. Injectable clock for tests. */
export async function runBackupRotationPass({ now: at, taskId: onlyTaskId } = {}) {
  void at; // clock accepted for pass-shape parity (bucket math is UTC-calendar, not wall-clock)
  const taskIds = onlyTaskId
    ? [onlyTaskId]
    : (await db.all("select distinct task_id as id from backup_runs where task_id is not null and status in ('succeeded','deleted')")).map(r => r.id);
  const report = { scanned: taskIds.length, deleted: 0, floorHeld: 0, tasks: [] };
  const backupsDir = backupsRoot(); // BACKUPS_DIR-aware — same derivation as export/backup.js
  for (const taskId of taskIds) {
    /* Per-task try/catch — one broken task never starves the others (T-87-04 discipline). */
    try {
      const task = await db.get('select * from backup_tasks where id = ?', [taskId]);
      if (!task) continue;
      const runsAsc = await db.all(
        "select id, created_at, filename, gfs_bucket from backup_runs where task_id = ? and status = 'succeeded' order by created_at asc, id asc",
        [taskId],
      );
      if (runsAsc.length < 2) continue;
      /* D-13 (T-87-07): resolve the newest VERIFIED run's explicit ID first —
         the exclusion below is by ID, never by ordering arithmetic. */
      const newestVerified = await db.get(
        "select id from backup_runs where task_id = ? and status = 'succeeded' order by created_at desc, id desc limit 1",
        [taskId],
      );
      /* Phase 92 (BKNAME-02): rotation READS the stored gfs_bucket — never
         re-derives from created_at (D-02: the stored column is the truth
         the naming/backfill wrote). A succeeded row with an unexpectedly
         NULL bucket (pre-backfill rows, failed bucket-at-creation store)
         derives IN MEMORY per task with the shared function — keep math
         unchanged, and NO write lands on the row: the historical write is
         the gated boot sweep's alone (Phase 92 Task 4). */
      const buckets = new Map();
      let missingBucket = false;
      for (const r of runsAsc) {
        if (r.gfs_bucket) buckets.set(r.id, r.gfs_bucket);
        else missingBucket = true;
      }
      if (missingBucket) {
        const derived = assignGfsBuckets(runsAsc);
        for (const r of runsAsc) if (!buckets.has(r.id)) buckets.set(r.id, derived.get(r.id));
      }
      const keep = { daily: task.retention_daily, weekly: task.retention_weekly, monthly: task.retention_monthly, yearly: task.retention_yearly };
      /* keep-N per bucket: count from the newest backwards; rows beyond the
         bucket's keep-N are expired candidates. */
      const seenPerBucket = {};
      const candidates = [];
      for (const r of [...runsAsc].reverse()) {
        const bucket = buckets.get(r.id);
        seenPerBucket[bucket] = (seenPerBucket[bucket] || 0) + 1;
        if (seenPerBucket[bucket] > keep[bucket]) candidates.push(r.id);
      }
      if (!candidates.length) continue;
      /* T-87-07: the delete set is re-selected with the newest verified ID as
         an explicit `id <> ?` parameter — the exclusion lives in the QUERY,
         not only in the JS arithmetic above. */
      const deleteSet = await db.all(
        `select id, filename from backup_runs where task_id = ? and status = 'succeeded' and id in (${candidates.map(() => '?').join(',')}) and id <> ?`,
        [taskId, ...candidates, newestVerified.id],
      );
      /* D-13 refuse-to-empty floor (independent second guard): a pass that
         would remove EVERY remaining archive of the task performs zero
         deletes and leaves the floor intact. */
      if (deleteSet.length >= runsAsc.length) {
        report.floorHeld += 1;
        report.tasks.push({ taskId, floor: true });
        continue;
      }
      if (!deleteSet.length) continue;
      /* D-12 / Pitfall 5: sidecar FIRST, then archive, both best-effort
         (rmStaging discipline); run rows marked deleted only after both. */
      for (const row of deleteSet) {
        try {
          fs.rmSync(path.join(backupsDir, `${row.filename}.sha256`), { force: true });
        } catch {
          /* best-effort — a dangling sidecar is detectable, never fatal */
        }
        try {
          fs.rmSync(path.join(backupsDir, row.filename), { force: true });
        } catch {
          /* best-effort */
        }
      }
      const ids = deleteSet.map(r => r.id);
      const marked = await db.run(
        `update backup_runs set status = 'deleted' where id in (${ids.map(() => '?').join(',')}) and task_id = ?`,
        [...ids, taskId],
      );
      /* T-87-08: one audited rotation event per task pass — ids, per-id
         bucket and why named in the action string (house convention:
         details ride the action column). */
      const detail = deleteSet.map(r => `${buckets.get(r.id)}:${r.id}`).join(',');
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), null, taskId, `backup_rotation:expired:${detail}`, 0, null, null, 'Backup rotation', '', task.name, '', now()],
      );
      report.deleted += marked?.changes || 0;
      report.tasks.push({ taskId, deletedRunIds: ids });
      logInfo(`backup rotation: task ${taskId} deleted ${ids.length} expired archive(s) (${detail})`);
    } catch (err) {
      logWarn(`backup rotation: task ${taskId}: ${err?.message || err}`);
    }
  }
  return report;
}

/* =====================================================================
   WEBHOOK HOOK CRUD — Phase 67 (67-03, WHK-01/D-06/D-10/D-11/D-12).
   =====================================================================
   Route family: GET/POST /api/workspaces/:slug/projects/:pid/webhooks,
   PATCH/DELETE .../webhooks/:hookId, POST .../webhooks/:hookId/test.
   Scoping follows the export-route precedent: the slug resolves ws +
   membership via requireWorkspace, the project comes from the doc, and
   canManageProject gates EVERY route (the server gate is the control,
   T-52-02; T-67-07). The secret column NEVER rides a client response —
   only the POST create body carries the raw secret (D-10). */

const WEBHOOK_FORMATS = ['teams-adaptive', 'teams-messagecard', 'raw-json'];
const WEBHOOK_URL_MAX = 2048;

/* Client-safe projection: the projection IS the secret gate — build it
   from the columns explicitly, never spread the row (T-67-08). */
function webhookHookView(h, health) {
  let events = [];
  try {
    events = JSON.parse(h.events || '[]');
  } catch {
    /* an unparseable filter reads as empty — never crash a list */
  }
  return {
    id: h.id,
    url: h.url,
    format: h.format,
    events: Array.isArray(events) ? events : [],
    status: h.status,
    health,
    createdBy: h.created_by,
    createdAt: h.created_at,
  };
}

/* D-06 health badge computed from delivery rows: a disabled hook reads
   'disabled'; any dead delivery inside the 7-day window reads 'failing';
   otherwise 'active'. No in-app notification (D-06). */
async function webhookHookHealth(hookId, status) {
  if (status === 'disabled') return 'disabled';
  const dead = await db.get("select count(*) as n from webhook_deliveries where hook_id = ? and status = 'dead' and created_at >= ?", [hookId, now() - WEBHOOK_RETENTION_MS]);
  return dead?.n ? 'failing' : 'active';
}

/* Shared body validation for POST/PATCH. Returns { fields } on success or
   { error: [code, message] }. Only url/format/events/status are ever read —
   workspace_id, project_id and created_by come from the ctx below, never
   the body (T-67-09 mass-assignment guard). */
function webhookValidateBody(body, { requireUrl } = {}) {
  const fields = {};
  if (body?.url !== undefined || requireUrl) {
    const u = String(body?.url ?? '').trim();
    if (!u || u.length > WEBHOOK_URL_MAX) return { error: ['webhookError', 'Provide an https URL'] };
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      return { error: ['webhookError', 'Provide a valid https URL'] };
    }
    if (parsed.protocol !== 'https:') return { error: ['webhookError', 'Webhook URLs must use https'] };
    fields.url = u;
  }
  if (body?.format !== undefined) {
    if (!WEBHOOK_FORMATS.includes(body.format)) return { error: ['webhookError', 'Format must be teams-adaptive, teams-messagecard or raw-json'] };
    fields.format = body.format;
  }
  if (body?.events !== undefined) {
    if (!Array.isArray(body.events) || !body.events.length || body.events.length > WEBHOOK_EVENTS.length || body.events.some(e => !WEBHOOK_EVENTS.includes(e))) {
      return { error: ['webhookError', `Events must be a non-empty subset of: ${WEBHOOK_EVENTS.join(', ')}`] };
    }
    fields.events = body.events;
  }
  if (body?.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'disabled') return { error: ['webhookError', 'Status must be active or disabled'] };
    fields.status = body.status;
  }
  return { fields };
}

async function docFromClient(incoming, stored, ws, role, membership, refusals = []) {
  const next = await mergeClientDoc(incoming, stored, membership, ws.id, refusals);
  /* [2026-11-08 D-51-15] V7 audit: one INFO line per refused operation, best-effort.
     [2026-11-09 53-01] The refusal code is logged (projectCreateForbidden rides the
     same channel as the 53-01 projectPermDenied content-write refusals). */
  for (const r of refusals) {
    try {
      logInfo(`doc write refused (${r.code || 'unknown'}) project "${r.project || '-'}" by ${membership?.member_id || 'unknown'} [${ws?.slug || 'ws'}]`);
    } catch {
      /* refusal logging is best-effort */
    }
  }
  delete next.data.workspaces;
  next.data.me = null;
  next.data.ws = { name: ws.name, url: ws.slug, c: ws.color || '#1D1C1A', brand: true };
  // Membership edits stay with the roles that are allowed to make them.
  const storedMembers = stored?.data?.members || [];
  /* D-09/D-10 (Phase 44): a member may write exactly one field — their OWN tz.
     Capture it from the incoming snapshot before the role gates below; both
     the non-admin replacement and the admin pinning then let the carve-out
     re-apply it, same "access fields belong to the membership" family as the
     pinned-field block above. */
  const incomingSelfTz = (Array.isArray(incoming?.data?.members) ? incoming.data.members : []).find(m => m?.id === membership?.member_id && 'tz' in m)?.tz;
  if (ROLE_RANK[role] < ROLE_RANK.admin) {
    next.data.members = storedMembers;
  } else {
    // Access fields of an account-backed profile belong to the membership, not the document.
    // A profile claiming a userId that has no membership is dropped: only the server adds accounts.
    const official = new Map(storedMembers.filter(m => m.userId).map(m => [m.userId, m]));
    const incomingMembers = Array.isArray(next.data.members) ? next.data.members : storedMembers;
    next.data.members = incomingMembers
      .map(m => {
        if (!m?.userId) {
          /* D-10 (G-44-3, WR-01): doc-only members pass through unpinned, but
             tz still goes through the resolveTz funnel — the wholly-unpinned
             path cannot smuggle a raw string into the doc. */
          return { ...m, tz: typeof m?.tz === 'string' && m.tz.trim() === '' ? '' : resolveTz(m.tz) };
        }
        const prev = official.get(m.userId);
        return prev
          ? {
              ...m,
              id: prev.id,
              userId: prev.userId,
              email: prev.email,
              role: prev.role,
              status: prev.status,
              /* D-10 (G-44-3, WR-01): tz funnels exactly like the self carve-out —
             undefined keeps the stored value (an admin snapshot omitting tz
             must not wipe it), '' clears (D-07), anything else funnels. */
              tz: m.tz === undefined ? prev.tz : typeof m.tz === 'string' && m.tz.trim() === '' ? '' : resolveTz(m.tz),
            }
          : null;
      })
      .filter(Boolean);
    // A member the client's copy does not know about — they joined in another
    // session — keeps the stored profile, so a stale document cannot drop them.
    const kept = new Set(next.data.members.map(m => m?.userId).filter(Boolean));
    for (const m of storedMembers) {
      if (m?.userId && !kept.has(m.userId)) next.data.members.push(m);
    }
  }
  /* D-09/D-10: apply the self-tz carve-out AFTER the role gates, for both
     paths. Exactly one field on exactly one member — the requester's own.
     Empty submits store '' (D-07: resolves to Europe/Paris on read);
     anything else goes through the resolveTz funnel (invalid → Europe/Paris,
     never stored raw — and since G-44-3 every member's tz funnels on the
     admin path too, so this statement is finally true for all members).
     No other field is ever taken from the incoming array. */
  if (incomingSelfTz !== undefined) {
    const storedSelf = (Array.isArray(next.data.members) ? next.data.members : []).find(m => m?.id === membership?.member_id);
    if (storedSelf) storedSelf.tz = typeof incomingSelfTz === 'string' && incomingSelfTz.trim() === '' ? '' : resolveTz(incomingSelfTz);
  }
  // The plan, invoices, sessions and tfa fields are gone; a stale client's copy
  // must never resurrect them. Both the read path (normalizeDoc) and this write
  // path strip independently (D-30, P-A), so a stored document is cleaned on the
  // first load and stays clean after every save.
  delete next.data.plan;
  delete next.data.invoices;
  delete next.data.sessions;
  delete next.data.tfa;
  /* PREFS (Phase 34, D-02): notification preferences are per-user rows now —
     a stale client's notifPrefs copy must never be merged back into a stored
     document. Stripped here (write) and in normalizeDoc (read), D-30-style. */
  delete next.data.notifPrefs;
  /* TEAM-05 (D-02): the write path strips doc-carried membership independently
     of the read path (D-30 precedent), so the STORED document comes out clean
     even when a stale client ships teams[].members. */
  if (Array.isArray(next.data.teams)) {
    next.data.teams = next.data.teams.map(t => {
      if (!t || typeof t !== 'object' || !('members' in t)) return t;
      const definition = { ...t };
      delete definition.members;
      return definition;
    });
  }
  normalizeProjects(next);
  return next;
}

/* --------------------------- membership helpers ------------------------- */
function roleRank(role) {
  return ROLE_RANK[role] || 0;
}

/* Memberships joined with the account, in the order people joined. */
async function membersOf(workspaceId) {
  return await db.all(
    `select m.role, m.member_id, u.id as user_id, u.email, u.name, u.last_login_at, u.created_at
       from memberships m join users u on u.id = m.user_id
      where m.workspace_id = ?
      order by u.created_at, u.email collate nocase`,
    [workspaceId],
  );
}

/* TEAM-01: the team set of one member, read from the join-table authority. */
async function teamsOfUser(workspaceId, userId) {
  return (await db.all('select team_id from team_members where workspace_id = ? and user_id = ? order by team_id', [workspaceId, userId])).map(r => r.team_id);
}

/* TEAM-01: bulk form for syncProfiles — Map<user_id, string[]> over the workspace. */
async function teamsByUser(workspaceId) {
  const map = new Map();
  for (const r of await db.all('select user_id, team_id from team_members where workspace_id = ? order by team_id', [workspaceId])) {
    if (!map.has(r.user_id)) map.set(r.user_id, []);
    map.get(r.user_id).push(r.team_id);
  }
  return map;
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
    /* TEAM-01/D-04: the scalar `team` is retired — the projected teams[] array
       (filled by syncProfiles from the team_members authority) is the only
       membership surface a payload exposes. */
    teams: profile?.teams || [],
    title: profile?.title || '',
    status: profile?.status || 'active',
    lastLoginAt: row.last_login_at || null,
    joinedAt: row.created_at || null,
    isSelf: row.user_id === selfId,
  };
}

/* Pending invites; the hash is a safe identifier because the token is not derivable from it. */
async function invitesOf(workspaceId) {
  return (
    await db.all(
      `select token_hash, email, role, teams, project, created_at, expires_at
         from invites
        where workspace_id = ? and used_at is null and expires_at > ?
        order by created_at desc`,
      [workspaceId, now()],
    )
  ).map(r => {
    let teams = [];
    try {
      teams = JSON.parse(r.teams || '[]');
    } catch {
      /* unreadable set degrades to teamless (D-03), never to the scalar */
    }
    if (!Array.isArray(teams)) teams = [];
    /* [2026-11-07 D-49-5] scope is retired — the Phase 49 sweep cleared the
         columns and invites no longer carry one. The projection stays `null`
         so client surfaces keep a stable shape until Phase 51 prunes it. */
    return {
      id: r.token_hash,
      email: r.email,
      role: r.role,
      roleLabel: ROLE_LABEL[r.role] || r.role,
      teams,
      scope: null,
      project: r.project || null,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    };
  });
}

async function ownerCount(workspaceId, excludeUserId = null) {
  return (await db.get("select count(*) as n from memberships where workspace_id = ? and role = 'owner' and user_id is not ?", [workspaceId, excludeUserId])).n;
}

/* Overlay the authority fields of every profile that belongs to an account,
   and add the profile of a member that has none yet. The membership table is
   the source of truth: a member who joined in another session is repaired
   here, so joining never has to invalidate that session's revision. */
async function syncProfiles(doc, workspaceId) {
  if (!doc?.data || !Array.isArray(doc.data.members)) return;
  const rows = await db.all(
    `select m.user_id, m.role, m.member_id, u.name, u.email
       from memberships m join users u on u.id = m.user_id
      where m.workspace_id = ?`,
    [workspaceId],
  );
  const byUser = new Map(rows.map(r => [r.user_id, r]));
  /* TEAM-01/D-04: the team_members join table is the authority; the projection
     is a sorted teams[] array per account-backed profile. The scalar
     memberships.team column stays on disk but is never read (D-04). */
  const teamMap = await teamsByUser(workspaceId);
  for (const profile of doc.data.members) {
    if (!profile?.userId) continue;
    const row = byUser.get(profile.userId);
    if (!row) continue;
    if (row.member_id && profile.id !== row.member_id) profile.id = row.member_id;
    profile.role = ROLE_LABEL[row.role] || profile.role;
    /* Membership lives in the team_members rows, not the doc (D-01/D-04): the
       projection writes the teams[] array and retires any stale scalar `team`
       the stored document still carries. Doc-only profiles (no account) keep
       their own fields untouched. */
    profile.teams = teamMap.get(profile.userId) || [];
    delete profile.team;
    if (profile.status === 'invited') profile.status = 'active';
    // The document stores minutes since last activity; older rows stored a timestamp.
    if (typeof profile.last === 'number' && profile.last > 1e11) profile.last = Math.max(0, Math.round((now() - profile.last) / 60000));
  }
  /* A member without a profile in the document: the membership row says they
     belong here, so the roster is completed instead of being left to a write. */
  const known = new Set(doc.data.members.map(m => m?.userId).filter(Boolean));
  for (const row of rows) {
    if (known.has(row.user_id)) continue;
    const profile = memberProfile(row, doc.data.members.length);
    profile.teams = teamMap.get(row.user_id) || [];
    doc.data.members.push(profile);
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
  /* [Phase 55, D-55-4] Assignments live in assignees arrays now — normalize
     first (migrates any legacy scalar), then filter the removed member's id
     out of every task and subtask array. An array that becomes empty stays an
     empty array (renders Unassigned downstream). */
  normalizeAssigneesData(d);
  d.tasks = (d.tasks || []).map(t => {
    const next = { ...t };
    if (Array.isArray(next.assignees)) next.assignees = next.assignees.filter(id => !hit(id));
    if (Array.isArray(next.subtasks) && next.subtasks.some(s => Array.isArray(s?.assignees) && s.assignees.some(hit))) {
      next.subtasks = next.subtasks.map(s => (Array.isArray(s?.assignees) ? { ...s, assignees: s.assignees.filter(id => !hit(id)) } : s));
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
  /* TEAM-05 (D-02): doc.teams[] carries definitions only — there is no member
     roster left to strip. The team_members authority rows are purged by the
     caller in the same transaction. */
}

/* Read-modify-write the workspace document inside the caller's transaction.
   bumpRevision:false is reserved for server-owned housekeeping writes that
   must not charge the revision the clients still hold (e.g. the project-scoped
   invite-accept grant, like the restart repair at the teamLink restoration) —
   the document is still persisted under the same serialization. */
async function updateDoc(workspaceId, edit, { bumpRevision = true } = {}) {
  const row = await db.get('select doc from workspaces where id = ?', [workspaceId]);
  if (!row) throw httpError(404, 'Workspace not found', 'workspaceNotFound');
  const doc = JSON.parse(row.doc);
  await edit(doc); // D-05 ripple: callbacks may be async (ensureMember facade await)
  await db.run(
    bumpRevision
      ? 'update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?'
      : 'update workspaces set doc = ?, updated_at = ? where id = ?',
    [JSON.stringify(doc), now(), workspaceId],
  );
  return doc;
}

/* The workspace revision after a server-side document change. Every endpoint
   that edits the document must return it, or the client keeps a stale
   revision and its next write is rejected with 409. */
async function wsRevision(workspaceId) {
  const row = await db.get('select revision from workspaces where id = ?', [workspaceId]);
  return row ? row.revision : 0;
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
async function ensureWorkspace() {
  if ((await db.get('select count(*) as n from workspaces')).n > 0) return;
  const name = WORKSPACE_NAME;
  const slug = await uniqueSlug(WORKSPACE_SLUG || name);
  const color = '#1D1C1A';
  const meta = { name, slug, color };
  const doc = normalizeDoc(seedDoc() || emptyDoc(meta), meta);
  const t = now();
  await db.run('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)', [
    DEFAULT_WS_ID,
    slug,
    name,
    color,
    JSON.stringify(doc),
    1,
    t,
    t,
  ]);
}

async function ensureAdmin({ quiet = false } = {}) {
  if ((await db.get('select count(*) as n from users')).n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim();
  const name = process.env.ADMIN_NAME || 'Admin';
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }
  const user = await createUser(email, name, password);
  await addMembership(await firstWorkspace(), user, 'owner', [], 'manual');
  if (!quiet) {
    logInfo(`  bootstrap account: ${email}`);
    if (generated) logInfo(`  generated password: ${password}\n  (set ADMIN_PASSWORD and recreate the volume to choose your own)`);
  }
}

/* D-113/D-114: the boot stamp. Pre-v1.4 installs get a working operator: if no
   user is flagged yet, stamp the ADMIN_EMAIL-matching account. Gated on "no
   user currently flagged", so later boots are a no-op; reassigning the flag is
   a documented manual DB update (D-114 — no transfer mechanism this phase).
   Lives in bootstrap(), NOT inside ensureAdmin: ensureAdmin early-returns on
   any existing user (Pitfall 1), so a stamp there would never fire on
   existing databases. */
async function stampInstanceAdmin() {
  if ((await db.get('select count(*) as n from users where is_instance_admin = 1')).n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim();
  const res = await db.run('update users set is_instance_admin = 1 where email = ? collate nocase', [email]);
  if (res.changes === 0) {
    logWarn(`  [bootstrap] no operator flagged: no users row matches ADMIN_EMAIL (${email}); set is_instance_admin=1 manually (D-114)`);
  }
}

async function bootstrap(opts) {
  await ensureWorkspace();
  await migrateTenancy();
  /* TEAM-01: one-time backfill of the team_members join table from the scalar
     memberships.team column (D-03). Runs AFTER migrateTenancy — not inside
     openDb() — because the backfill carries member_id, and on a cold legacy
     database that column is only populated by tenancy's membership linking
     (Pitfall 4: migration order is load-bearing). The ensureColumn for
     memberships.team has long since run inside openDb(), so the source column
     always exists here. */
  await migrateTeamMembership();
  /* PREFS (Phase 34, SETTINGS-01, D-09): one-time notifPrefs doc→rows backfill.
     AFTER migrateTeamMembership — same recipe, same load-bearing-order
     discipline: it reads the memberships authority rows that earlier
     migrations guarantee (Pitfall 2). */
  await migrateUserNotifPrefs();
  await migrateTotpEncryption();
  /* TOTP2 (Phase 31): one-time primary-factor copy into totp_factors (D-06).
     AFTER migrateTotpEncryption — a legacy plaintext secret is already sealed
     before the copy carries the envelope over (migration order is
     load-bearing, Pitfall 2 discipline). */
  await migrateTotpFactors();
  await migrateTotpReWrap();
  /* VIEWS (Phase 57, D-06): one-time doc.views → saved_views rows sweep.
     AFTER migrateTotpReWrap — the same load-bearing-order discipline: it
     reads the memberships authority rows that earlier migrations guarantee
     (Pitfall 2), and it must land before the first doc read so no client
     ever sees the legacy field. */
  await migrateUserViews();
  /* SEARCH (Phase 58, D-08): the task_fts shadow index must exist before
     the first funnel write or search read touches it, then a per-workspace
     conditional sweep heals drift (missing marker row, empty index with a
     nonzero doc, count mismatch) WITHOUT rebuilding healthy workspaces —
     the same cheap-guard discipline as stampInstanceAdmin above. AFTER
     migrateUserViews — the same load-bearing-order discipline as the
     Phase 57 sweep: migration order is load-bearing (Pitfall 2), and the
     index must be healed before the first search route read serves
     results. pg parity lands in 58-02 (the sweep no-ops there). */
  await ensureSearchIndex();
  /* T-34-05 discipline: a corrupt doc blob is skipped, never crashing the
     boot — the same per-row guard the prefs backfill pins. */
  for (const ws of await dbAll('select id, doc from workspaces')) {
    let doc;
    try {
      doc = JSON.parse(ws.doc);
    } catch {
      logWarn(`  [bootstrap] fts sweep: corrupt doc skipped for workspace ${ws.id}`);
      continue;
    }
    await ftsSweep(ws.id, doc);
  }
  /* D-50-6/D-50-10 (Phase 50, Plan 02): the reverse-sweep restoration and the
     legacy guest normalization. The Phase 49 materialization sweep stays
     RETIRED — restoreTeamLinks() only ever ADDS p.teams back from a
     human-confirmed provenance source and never deletes a link (Pitfall 1);
     a boot pass that erased live links would undo D-50-5 on every restart. */
  await restoreTeamLinks();
  await normalizeGuestRoles();
  await ensureAdmin(opts);
  await stampInstanceAdmin();
}

/*
 * TEAM-01 (Phase 28, D-03): one-time backfill of the team_members join table
 * from the scalar memberships.team column. The guard is per-row, not a global
 * "table empty" check: a memberships row is eligible iff its team is set AND
 * the user has NO team_members row yet. This is what keeps the migration a
 * byte-identical no-op on every boot after the first — a plain
 * `insert ... select ... where team is not null` would resurrect a team a
 * member has since left, because the scalar column stays on disk unread (D-04)
 * while team_members has moved on. A fresh workspace is safe: it has zero
 * scalar-team memberships, so zero eligible rows and no backup.
 *
 * No backup = no mutation (deliberately stricter than migrateTenancy, same
 * policy as the TOTP envelope migration, D-74).
 */
async function migrateTeamMembership() {
  const eligible = async () =>
    (
      await db.get(
        `select count(*) as n from memberships m
          where m.team is not null
            and not exists (select 1 from team_members tm
                             where tm.workspace_id = m.workspace_id and tm.user_id = m.user_id)`,
      )
    ).n;
  /* TEAM-01/D-07: the invites scalar→array backfill shares this guard, this
     backup and this transaction — one pre-migration snapshot covers both
     mutations, and a boot where only invites need backfilling still backs up
     before writing. */
  const invitesEligible = async () => (await db.get('select count(*) as n from invites where team is not null and teams is null')).n;
  if (!(await eligible()) && !(await invitesEligible())) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-pre-team-members-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    await sqliteOnly(async () => {
      await db.run('pragma wal_checkpoint(truncate)');
      await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
    }, `pre-migration backup ${backup}`);
    logInfo(`  pre-migration backup: ${backup}`);
  } catch (err) {
    logError(`  pre-migration backup failed: ${err.message}`);
    return;
  }
  await db.tx(async () => {
    await db.run(
      `insert or ignore into team_members (workspace_id, team_id, member_id, user_id)
       select m.workspace_id, m.team, m.member_id, m.user_id from memberships m
        where m.team is not null
          and not exists (select 1 from team_members tm
                           where tm.workspace_id = m.workspace_id and tm.user_id = m.user_id)`,
    );
    /* D-07: scalar invites.team becomes a one-element JSON array in invites.teams.
       The scalar column is never read again — this is its last reader (D-04).
       D-09/D-10: the loop below is SQLite-only (pg has no row identifier) and
       gated through sqliteOnly — on pg this backfill no-ops, because a pg
       database is always created fresh with the teams column (no legacy
       scalar rows can exist there). The portable team_members insert above
       still runs on both backends. */
    await sqliteOnly(async () => {
      for (const row of await db.all('select rowid, team from invites where team is not null and teams is null')) {
        await db.run('update invites set teams = ? where rowid = ?', [JSON.stringify([row.team]), row.rowid]);
      }
    }, 'invites scalar→teams rowid backfill');
  });
}

/*
 * PREFS (Phase 34, SETTINGS-01, D-09/D-11): one-time guarded backfill of the
 * per-user notification preferences. Legacy installs carried prefs in the
 * workspace document's data.notifPrefs blob; the authority now lives in
 * user_notif_prefs rows keyed (workspace_id, user_id). Structural clone of
 * migrateTeamMembership: JS guard (the field lives inside the doc JSON —
 * SQL can't see it, research Pitfall 5) → pre-migration backup → one
 * `begin immediate` transaction that copies the workspace-level prefs object
 * into a row for EVERY member of every eligible workspace (D-09: zero
 * behavior change at switch-over) and deletes the field from the stored doc
 * in the SAME transaction (D-11: rows and doc can never disagree). A corrupt
 * doc blob parses as {} and is skipped — it can never crash the boot
 * (T-34-05, the migrateTenancy precedent). The guard is false forever after
 * the first migrating boot: the field is gone from every doc, so later boots
 * are byte-identical no-ops, and later workspace joiners read the accessor
 * defaults instead of stale workspace prefs.
 *
 * No backup = no mutation (deliberately stricter than migrateTenancy, same
 * policy as migrateTeamMembership and the TOTP envelope migration, D-74).
 */
async function migrateUserNotifPrefs() {
  /* Guard, evaluated in JS: a workspace is eligible iff its stored doc carries
     data.notifPrefs. The strip is the trigger (not "some member lacks a row"):
     if every member already has a row, waiting for a missing row would leave
     the stale doc field in place forever and re-fire this guard on every
     boot, violating the byte-identical-second-boot guarantee. Row backfill
     stays inside the same transaction and relies on insert or ignore to keep
     any per-user row the user already set. */
  const eligible = [];
  for (const row of await db.all('select id, doc from workspaces')) {
    let doc;
    try {
      doc = JSON.parse(row.doc);
    } catch {
      /* unreadable document: never crash the boot (T-34-05) — the row is skipped */
      continue;
    }
    const prefs = doc?.data?.notifPrefs;
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) continue;
    eligible.push({ id: row.id, doc, prefs });
  }
  if (eligible.length === 0) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-pre-notif-prefs-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    await sqliteOnly(async () => {
      await db.run('pragma wal_checkpoint(truncate)');
      await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
    }, `pre-migration backup ${backup}`);
    logInfo(`  pre-migration backup: ${backup}`);
  } catch (err) {
    logError(`  pre-migration backup failed: ${err.message}`);
    return;
  }
  await db.tx(async () => {
    for (const ws of eligible) {
      /* D-09: EVERY member of the workspace gets the workspace-level prefs —
         not just members who "already have a row" (insert or ignore keeps any
         pre-existing per-user row the user set after the accessor shipped). */
      for (const m of await db.all('select user_id from memberships where workspace_id = ?', [ws.id])) {
        await db.run('insert or ignore into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)', [ws.id, m.user_id, JSON.stringify(ws.prefs)]);
      }
      /* D-11: the doc-field delete lives in the SAME transaction as the row
         copies, so a crashed boot can never leave rows and doc disagreeing. */
      const stripped = { ...ws.doc, data: { ...ws.doc.data } };
      delete stripped.data.notifPrefs;
      await db.run('update workspaces set doc = ? where id = ?', [JSON.stringify(stripped), ws.id]);
    }
  });
}

/*
 * VIEWS (Phase 57, D-05/D-06): one-time guarded sweep of the legacy
 * top-level doc.views blobs into saved_views rows. The authority now lives
 * in saved_views keyed (workspace_id, user_id, key, name) — the live row
 * uses the sentinel name ''. Structural clone of migrateUserNotifPrefs:
 * JS guard (the field lives inside the doc JSON — SQL can't see it) →
 * pre-migration backup → one transaction that inserts a live row per
 * views[key] snapshot and deletes the field from the stored doc in the SAME
 * transaction (rows and doc can never disagree). doc.views carries no
 * author, so every migrated row is attributed to the workspace OWNER — the
 * owner ruling accepted this caveat (D-06). insert or ignore keeps any
 * newer per-user row the user already set. A corrupt doc blob parses as {}
 * and is skipped — it can never crash the boot. The guard is field
 * presence, never "table empty": after the strip, later boots are
 * byte-identical no-ops.
 *
 * No backup = no mutation on sqlite (the migrateUserNotifPrefs / D-74
 * discipline). pg has no sqlite backup to take (WR-04) — there the
 * migration runs without one rather than silently discarding doc.views.
 */
async function migrateUserViews() {
  const eligible = [];
  for (const row of await db.all('select id, doc from workspaces')) {
    let doc;
    try {
      doc = JSON.parse(row.doc);
    } catch {
      /* unreadable document: never crash the boot — the row is skipped */
      continue;
    }
    const views = doc?.views;
    if (!views || typeof views !== 'object' || Array.isArray(views)) continue;
    const keys = Object.keys(views).filter(k => views[k] && typeof views[k] === 'object' && !Array.isArray(views[k]));
    if (keys.length === 0) continue;
    eligible.push({ id: row.id, doc, views, keys });
  }
  if (eligible.length === 0) return;
  /* WR-04: the sqlite-only backup (wal_checkpoint + vacuum into) can never
     run on the pg backend — gating the strip behind it meant legacy doc.views
     was silently discarded on pg (normalizeDoc/mergeClientDoc strip it on the
     first read/write) with no rows ever created. On pg the migration proceeds
     WITHOUT the file backup: the row-insert + doc-strip still run as ONE
     transaction (rows and doc can never disagree), which completes the D-06
     migration on both backends instead of degrading to "strip and lose". */
  if (backendKind !== 'pg') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(DATA_DIR, `projects-pre-user-views-${stamp}.db`);
    try {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      await sqliteOnly(async () => {
        await db.run('pragma wal_checkpoint(truncate)');
        await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
      }, `pre-migration backup ${backup}`);
      logInfo(`  pre-migration backup: ${backup}`);
    } catch (err) {
      logError(`  pre-migration backup failed: ${err.message}`);
      return;
    }
  } else {
    logInfo('  views migration: pg backend — proceeding without a sqlite file backup (rows + doc strip in one transaction)');
  }
  await db.tx(async () => {
    for (const ws of eligible) {
      /* D-06 attribution: the workspace OWNER owns the migrated rows.
         Fall back to the first membership row if the owner role is absent
         (a crafted doc) — attribution stays deterministic either way. */
      const owner = await db.get(
        "select user_id from memberships where workspace_id = ? order by case when role = 'owner' then 0 else 1 end, user_id limit 1",
        [ws.id],
      );
      if (!owner?.user_id) continue;
      for (const key of ws.keys) {
        await db.run(
          'insert or ignore into saved_views (workspace_id, user_id, key, name, blob, schema_version) values (?,?,?,?,?,?)',
          [ws.id, owner.user_id, key, '', JSON.stringify(ws.views[key]), VIEW_SCHEMA_VERSION],
        );
      }
      /* The doc-field delete lives in the SAME transaction as the row
         copies, so a crashed boot can never leave rows and doc disagreeing. */
      const stripped = { ...ws.doc };
      delete stripped.views;
      await db.run('update workspaces set doc = ? where id = ?', [JSON.stringify(stripped), ws.id]);
    }
  });
}

/*
 * In-place migration for databases created before multi-workspace support:
 * backfills slugs/colors, scopes legacy invites, links member profiles to
 * accounts, and drops the demo-only `data.workspaces` switcher from the document.
 */
async function migrateTenancy() {
  const rows = await db.all('select * from workspaces');
  if (rows.some(row => !row.slug)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(DATA_DIR, `projects-premultitenant-${stamp}.db`);
    try {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      await sqliteOnly(async () => {
        await db.run('pragma wal_checkpoint(truncate)');
        await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
      }, `pre-migration backup ${backup}`);
      logInfo(`  pre-migration backup: ${backup}`);
    } catch (err) {
      logError(`  pre-migration backup failed: ${err.message}`);
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
      const slug = await uniqueSlug(meta.url || name, row.id);
      const color = /^#[0-9a-f]{6}$/i.test(meta.c || '') ? meta.c : '#1D1C1A';
      await db.run('update workspaces set slug = ?, name = ?, color = ? where id = ?', [slug, name, color, row.id]);
    }
  }
  await backfillInvites();
  await backfillMemberships();
}

/*
 * D-K6: generic envelope-version recognition — ANY `v<digits>:` prefix marks a
 * stored value as an envelope, never plaintext. This is a pattern, not a
 * known-versions list, so future envelope versions are never re-wrapped as
 * plaintext by this migration (T-25-01). ONE predicate, shared by the
 * migration's candidate path and the in-transaction re-check — the D-75
 * defense-in-depth layers must not drift apart. The pattern is case-
 * insensitive (WR-01) to agree with SQLite LIKE's ASCII case-insensitivity:
 * the `v_:%` SQL prefilter already selects `V2:...` rows, so a case-sensitive
 * predicate here would silently drop them from the D-K7 counter (never
 * silent). SQLite LIKE remains the broad prefilter; this predicate is the
 * per-row authority.
 */
const ENVELOPE_VERSION_RE = /^v\d+:/i;
function isEnvelopeVersion(value) {
  return ENVELOPE_VERSION_RE.test(String(value || '').trim());
}

/*
 * D-75/WR-01 (Phase 26): stale-envelope predicate for the re-wrap rotation pass.
 * A value is stale iff it is an envelope (isEnvelopeVersion — plaintext is the
 * OTHER pass's stock, Pitfall 2) whose id is not EXACTLY the current key id:
 * the version tag compares case-insensitively (to agree with SQLite LIKE's
 * ASCII case-insensitivity, exactly like ENVELOPE_VERSION_RE — WR-01), the key
 * id compares exactly (key ids are derived lowercase hex; no normalization or
 * merging, ever). ONE shared predicate — closed over by the candidate scan AND
 * the in-transaction re-check — so the two defense-in-depth layers cannot drift
 * apart (T-26-04: no double-encryption via predicate drift).
 */
function isStaleEnvelope(value, currentId) {
  const v = String(value || '').trim();
  if (!isEnvelopeVersion(v)) return false;
  const parts = v.split(':');
  return !(parts[0].toLowerCase() === 'v2' && parts[1] === currentId);
}

/*
 * WR-02: bound pre-migration backup accumulation. A row that never converges —
 * a non-base32 plaintext value the D-75 skip leaves in the pending set, or (if
 * the SQL prefilter ever drifts) a permanently-undecryptable envelope — would
 * otherwise mint a fresh `projects-preenvelope-<timestamp>.db` on every boot,
 * forever. Keep only the newest PREENVELOPE_BACKUP_KEEP backups (re-wrap
 * rotation of the rows themselves is Phase 26's scope, not this cleanup).
 */
const PREENVELOPE_BACKUP_KEEP = 5;
function prunePreenvelopeBackups(currentBackup) {
  try {
    const stale = fs
      .readdirSync(DATA_DIR)
      .filter(name => /^projects-preenvelope-.*\.db$/.test(name) && name !== path.basename(currentBackup))
      .map(name => ({ name, mtimeMs: fs.statSync(path.join(DATA_DIR, name)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(PREENVELOPE_BACKUP_KEEP - 1);
    for (const { name } of stale) {
      fs.rmSync(path.join(DATA_DIR, name), { force: true });
    }
  } catch (err) {
    // Pruning is best-effort housekeeping; a failure never blocks the migration.
    logWarn(`  pre-migration backup pruning failed: ${err.message}`);
  }
}

/*
 * D-82/D-83: boot-time migration of legacy plaintext `users.two_fa_secret`
 * rows into the `v1:` AES-256-GCM envelope (D-05), as a sibling of
 * migrateTenancy(). Ordering is load-bearing (research Pitfall 2):
 * trigger count (D-83) → MASTER_KEY check (D-73) → backup (D-74) →
 * transaction of updates (D-75) → console summary (D-76). A deferred or
 * empty boot never leaves a stray backup file; second boot after a
 * completed migration is a byte-identical no-op.
 */
async function migrateTotpEncryption() {
  // D-K7: unrecognized-version envelope rows are counted and warned about —
  // skip-silently is never an option. Decryptability is the authoritative
  // test (research A2): an envelope this server cannot decrypt today counts
  // as unrecognized, so rows stop warning automatically when a version gains
  // decrypt support. Only MASTER_KEY-bearing boots scan — without a key the
  // D-73 defer governs and every decrypt fails closed anyway. Warn lines
  // quote only version tags + counts, never key material or ciphertext.
  let unrecognizedVersion = 0;
  const unrecognizedTags = new Set();
  if (MASTER_KEY) {
    const envelopeCandidates = await db.all(
      "select id, two_fa_secret from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret like 'v_:%'",
    );
    for (const row of envelopeCandidates) {
      const value = String(row.two_fa_secret || '').trim();
      if (!isEnvelopeVersion(value) || decryptTotpSecret(value) !== null) continue;
      unrecognizedVersion++;
      unrecognizedTags.add(value.split(':', 1)[0]);
    }
  }
  if (unrecognizedVersion > 0) {
    logWarn(
      `  TOTP encryption: ${unrecognizedVersion} row(s) carry unrecognized secret envelope version(s) (${[...unrecognizedTags].join(', ')}) — left as-is; decryption attempts fail closed (D-K7).`,
    );
  }

  // D-83: trigger-gated no-op — zero eligible rows means no backup file and no writes.
  // KEY-01/D-K6: the SQL exclusion is deliberately broad — `v<char>:` requires a
  // colon, which bare base32 plaintext never contains — so envelope rows of any
  // version are excluded and zero-envelope DBs still yield zero eligible rows.
  // The authoritative version test is the shared JS predicate, applied per row
  // below (WR-02): the JS filter — not the SQL prefilter — is what keeps an
  // envelope-shaped row out of the pending set, so SQL/JS drift can never put
  // a permanently-undecryptable envelope back on the backup-every-boot churn.
  const pendingRows = async () =>
    (await db.all("select id, two_fa_secret from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret not like 'v_:%'")).filter(
      row => !isEnvelopeVersion(row.two_fa_secret),
    );
  let rows = await pendingRows();
  if (rows.length === 0) return;

  // D-73: MASTER_KEY missing with eligible plaintext rows → defer the whole
  // migration (loud warning, rows untouched, boot proceeds); decrypt fails
  // closed at runtime (D-06) meanwhile. Retries on the next boot.
  if (!MASTER_KEY) {
    logWarn(
      `  TOTP encryption deferred: MASTER_KEY is not configured — ${rows.length} plaintext two_fa_secret row(s) left unencrypted; migration retries on the next boot.`,
    );
    return;
  }

  // D-74: backup first. Failure skips the migration entirely this boot —
  // no backup = no mutation (deliberately stricter than migrateTenancy).
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-preenvelope-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    await sqliteOnly(async () => {
      await db.run('pragma wal_checkpoint(truncate)');
      await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
    }, `pre-migration backup ${backup}`);
    logInfo(`  pre-migration backup: ${backup}`);
    prunePreenvelopeBackups(backup); // WR-02: bound backup accumulation
  } catch (err) {
    logError(`  TOTP encryption skipped: pre-migration backup failed: ${err.message}`);
    return;
  }

  let migrated = 0;
  let skippedBlank = 0;
  let skippedGarbage = 0;
  let alreadyEncrypted = 0;
  await db.tx(async () => {
    // D-75: per-row re-check inside the transaction — defense in depth
    // against double-encryption (research Pitfall 5). Skip, never wrap
    // blanks or non-base32 garbage into an envelope.
    rows = await pendingRows();
    for (const row of rows) {
      const value = String(row.two_fa_secret || '').trim();
      if (!value) {
        skippedBlank++;
        continue;
      }
      // D-75 re-check — the SAME shared predicate as the candidate filter
      // (anti-pattern: filter and re-check drifting apart). Any envelope
      // version, not just v1:, is recognized and never re-wrapped.
      if (isEnvelopeVersion(value)) {
        alreadyEncrypted++;
        continue;
      }
      if (!/^[A-Z2-7]{32}$/.test(value)) {
        skippedGarbage++;
        logWarn(`  TOTP encryption: user ${row.id} has a non-base32 two_fa_secret — left as-is; decrypt fails closed (D-75)`);
        continue;
      }
      const envelope = encryptTotpSecret(value);
      if (!envelope) {
        skippedGarbage++;
        continue;
      }
      await db.run('update users set two_fa_secret = ? where id = ?', [envelope, row.id]);
      migrated++;
    }
  });
  // D-76: outcomes on console only — no admin UI surface. The unrecognized
  // count (D-K7) is part of the same summary so every outcome is represented.
  logInfo(
    `  TOTP encryption: ${migrated} row(s) migrated to the v1: envelope, ${skippedBlank} blank skipped, ${skippedGarbage} non-base32 skipped, ${alreadyEncrypted} already encrypted, ${unrecognizedVersion} unrecognized version(s) left as-is.`,
  );
}

/*
 * TOTP2 (Phase 31, D-06/D-09): one-time boot copy of the primary 2FA factor
 * into totp_factors — the single-source-of-truth migration. A legacy 2FA user
 * (two_fa_enabled = 1, non-empty two_fa_secret) gets exactly one factor row
 * whose secret is the users-column envelope copied VERBATIM (decrypt-free —
 * no MASTER_KEY gate, RESEARCH Open Question 3) and whose last_step is the
 * users two_fa_last_step value (D-09 replay-guard continuity: no window where
 * a pre-migration code replays). Structure mirrors migrateTotpEncryption
 * (D-83 trigger gate → backup → transaction → summary):
 *   - zero eligible rows → return BEFORE any backup or console output
 *     (byte-identical second boot);
 *   - JS anti-join: users that already have any totp_factors row are skipped;
 *   - D-75: per-row re-check inside the transaction — defense in depth
 *     against double-copy;
 *   - name is the fixed catalogue key (D-07 — localized at display time,
 *     never free text).
 * D-06 reversibility: one-way — the copy IS the migration, pinned by
 * test/migration.test.mjs + test/tfa-multi-factor.test.mjs.
 */
async function migrateTotpFactors() {
  const eligibleRows = async () => {
    // Anti-join resolved with awaited reads — Array.filter with an async
    // predicate would keep every row (all promises are truthy) and re-copy
    // on the second boot (Pitfall 2, byte-identical second boot).
    const rows = await db.all(
      "select id, two_fa_secret, two_fa_last_step from users where two_fa_enabled = 1 and two_fa_secret is not null and two_fa_secret != ''",
    );
    const out = [];
    for (const row of rows) {
      if (!(await db.get('select 1 from totp_factors where user_id = ?', [row.id]))) out.push(row);
    }
    return out;
  };
  let rows = await eligibleRows();
  if (rows.length === 0) return;

  // D-74: backup first — failure skips the copy entirely this boot, no mutation.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-prefactors-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    await sqliteOnly(async () => {
      await db.run('pragma wal_checkpoint(truncate)');
      await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
    }, `pre-migration backup ${backup}`);
    logInfo(`  pre-migration backup: ${backup}`);
  } catch (err) {
    logError(`  TOTP factor copy skipped: pre-migration backup failed: ${err.message}`);
    return;
  }

  let copied = 0;
  await db.tx(async () => {
    // D-75: per-row re-check inside the transaction — defense in depth
    // against double-copy (anti-pattern: candidate filter drifting apart).
    rows = await eligibleRows();
    for (const row of rows) {
      await db.run('insert into totp_factors (id, user_id, name, secret, last_step, created_at) values (?,?,?,?,?,?)', [
        uid(),
        row.id,
        'settings.tfa.factor.primary',
        row.two_fa_secret,
        row.two_fa_last_step || 0,
        now(),
      ]);
      copied++;
    }
  });
  // D-76: outcomes on console only — counts + user ids, never secrets.
  if (copied > 0) logInfo(`  TOTP factors: copied ${copied} primary factor row(s) into totp_factors (D-06/D-09).`);
}

/*
 * D-K15: boot-time re-wrap rotation pass — the sibling that converges every
 * old-envelope secret onto the CURRENT key. An operator rotates MASTER_KEY by
 * setting MASTER_KEY (new) + MASTER_KEY_PREVIOUS (old) and rebooting; one boot
 * re-wraps every v1 and stale-v2 envelope to `v2:<new-key-id>:…` (SC-1), a
 * second boot is a byte-identical no-op (SC-2). Ordering is load-bearing:
 * called AFTER migrateTotpEncryption() so plaintext rows are already sealed
 * before this pass scans (Pitfall 2 — the two passes never touch each other's
 * stock). Structure mirrors migrateTotpEncryption (D-83 gate → backup →
 * transaction → summary):
 *   - D-K14 gate: env-var driven every boot — both keys must be set; boots
 *     with only MASTER_KEY never scan, never warn, never touch rows. No
 *     operator flag, endpoint, or manual trigger exists (D-K14).
 *   - D-74: pre-migration backup first — failure skips the pass entirely,
 *     no mutation (same guarantee as the encryption pass).
 *   - D-75: per-row re-check inside the transaction via the SAME shared
 *     isStaleEnvelope predicate as the candidate scan (WR-01/WR-02 — no drift).
 *   - D-K8: v1 rows trial-decrypt CURRENT first, then PREVIOUS.
 *   - D-K9: rows decryptable under neither key are left byte-identical,
 *     counted, and warned — never deleted, never guessed (decrypt fails
 *     closed at runtime).
 *   - D-K10: re-seal target is ALWAYS v2 (encryptTotpSecret is the single v2
 *     writer, D-K4) — v1 rows are never re-keyed as v1 (one-way per decision).
 *   - D-76/D-K7 tone: console lines carry counts, version tags and user ids
 *     only — never key material, ciphertext, or plaintext (T-26-01).
 */
async function migrateTotpReWrap() {
  // D-K14 gate: the pass exists for rotation only.
  if (!MASTER_KEY || !MASTER_KEY_PREVIOUS) return;
  const currentId = keyIdFor(MASTER_KEY);
  // SQL prefilter broad, JS predicate authoritative (same discipline as the
  // encryption pass, WR-02): `v_:%` is the broad SQLite net, isStaleEnvelope
  // is the per-row authority — SQL/JS drift can never widen the mutation set.
  // TOTP2 (Phase 31, D-06): totp_factors rows ride the SAME rotation pass —
  // a factor row left under the old key would brick TOTP login after the
  // users column converges. One pass, one backup, one summary.
  const staleCandidates = async () => [
    ...(await db.all("select id, two_fa_secret from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret like 'v_:%'"))
      .filter(row => isStaleEnvelope(row.two_fa_secret, currentId))
      .map(row => ({ table: 'users', id: row.id, value: row.two_fa_secret })),
    ...(await db.all("select id, secret from totp_factors where secret is not null and secret != '' and secret like 'v_:%'"))
      .filter(row => isStaleEnvelope(row.secret, currentId))
      .map(row => ({ table: 'totp_factors', id: row.id, value: row.secret })),
  ];
  const rows = await staleCandidates();
  if (rows.length === 0) {
    // Zero stale candidates: byte-identical no-op — no backup, no writes.
    // D-K12: when PREVIOUS is configured AND resolves no envelope anywhere in
    // the users table, rotation is complete — nudge the operator to remove it.
    // Resolution means: a v1 row decrypts under PREVIOUS, or a v2 row carries
    // PREVIOUS's key id (trial-decrypt the few envelope rows; the candidate
    // set is empty, so nothing here is stale). The nudge is the ONLY output
    // of this boot: no backup, no mutation.
    const previousId = keyIdFor(MASTER_KEY_PREVIOUS);
    const envelopeRows = await db.all(
      "select id, two_fa_secret from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret like 'v_:%'",
    );
    const resolvesPrevious = envelopeRows.some(row => {
      const value = String(row.two_fa_secret || '').trim();
      const parts = value.split(':');
      const tag = (parts[0] || '').toLowerCase();
      if (tag === 'v1') return decryptV1WithMaterial(value, MASTER_KEY_PREVIOUS) !== null;
      if (tag === 'v2') return parts[1] === previousId;
      return false;
    });
    if (!resolvesPrevious) {
      logWarn('  TOTP re-wrap: rotation appears complete — MASTER_KEY_PREVIOUS resolves no envelopes and can be removed (D-K12).');
    }
    return;
  }

  // D-74: backup first — verbatim sibling of the encryption pass's block.
  // Failure skips the pass entirely this boot: no backup = no mutation.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-preenvelope-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    await sqliteOnly(async () => {
      await db.run('pragma wal_checkpoint(truncate)');
      await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
    }, `pre-migration backup ${backup}`);
    logInfo(`  pre-migration backup: ${backup}`);
    prunePreenvelopeBackups(backup); // WR-02: bound backup accumulation
  } catch (err) {
    logError(`  TOTP re-wrap skipped: pre-migration backup failed: ${err.message}`);
    return;
  }

  let rewrapped = 0;
  let undecryptable = 0;
  let sealFailed = 0;
  await db.tx(async () => {
    // D-75 re-check — the SAME shared isStaleEnvelope predicate as the scan
    // (anti-pattern: filter and re-check drifting apart, T-26-04).
    const txnRows = await staleCandidates();
    for (const row of txnRows) {
      const value = String(row.value || '').trim();
      const tag = (value.split(':', 1)[0] || '').toLowerCase();
      // D-K8 trial order: current first, then PREVIOUS (v1 has no key id);
      // v2 dispatches through the keyring, which resolves stale ids.
      const plaintext =
        tag === 'v1'
          ? (decryptV1WithMaterial(value, MASTER_KEY) ?? decryptV1WithMaterial(value, MASTER_KEY_PREVIOUS))
          : tag === 'v2'
            ? decryptTotpSecret(value)
            : null;
      if (plaintext === null) {
        undecryptable++;
        logWarn(
          `  TOTP re-wrap: ${row.table === 'users' ? 'user' : 'factor row'} ${row.id} carries an envelope that decrypts under neither keyring key — left as-is; decrypt fails closed (D-K9).`,
        );
        continue; // byte-identical, never deleted (D-K9)
      }
      // D-K10: the ONLY writer is encryptTotpSecret(…, 'v2') — never re-key as v1.
      const envelope = encryptTotpSecret(plaintext, 'v2');
      if (!envelope) {
        sealFailed++;
        continue;
      }
      if (row.table === 'users') await db.run('update users set two_fa_secret = ? where id = ?', [envelope, row.id]);
      else await db.run('update totp_factors set secret = ? where id = ?', [envelope, row.id]);
      rewrapped++;
    }
  });
  // D-76: outcomes on console only — counts, version tags, ids; no key material.
  logInfo(`  TOTP re-wrap: ${rewrapped} row(s) re-sealed to v2:<current-key-id>, ${undecryptable} undecryptable left as-is, ${sealFailed} seal failure(s).`);
}

/*
 * D-50-6 (Phase 50, Plan 02): reverse-sweep boot migration — the inverse of the
 * retired Phase 49 grant materialization. Phase 49 pushed team-derived grants
 * into p.members with NO per-entry provenance marker and deleted p.teams, so
 * the reconstruction source is a HUMAN-CONFIRMED decision (checkpoint recorded
 * 2026-11-08): (a) read the pre-sweep backup DBs (projects-pre-visibility-*.db,
 * the Phase 49 sweep's own "no backup = no mutation" snapshots) when present —
 * the backup doc holds each project's pre-sweep teams[] and members[], so
 * team-derived entries are exactly (current members − pre-sweep members);
 * (b) otherwise FAIL OPEN: every stored p.members entry is treated as a
 * genuine individual invite, no team link is restored from the sweep era, and
 * a boot warning names the workspaces that need owner relinking (no lockouts;
 * stale access persists until an owner relinks — documented, tested posture).
 *
 * Prohibition (T-50-04): no heuristic ever converts a genuine individual
 * p.members entry into a team link — removal happens ONLY where the backup
 * positively identifies the entry as sweep-materialized (absent from the
 * pre-sweep members list). The migration is idempotent via a doc marker
 * (data.teamLinksRestored): a second boot is a byte-identical no-op, and a
 * team link an owner later deletes is never resurrected.
 *
 * D-49-8 discipline: raw JSON.stringify doc writes only — normalizeProjects is
 * never called inside this migration (sealed private-empty projects stay
 * sealed), and no revision churn.
 */
async function restoreTeamLinks() {
  const PRE_SWEEP_PREFIX = 'projects-pre-visibility-';
  let preSweepBackups = [];
  try {
    preSweepBackups = fs
      .readdirSync(DATA_DIR)
      .filter(name => name.startsWith(PRE_SWEEP_PREFIX) && name.endsWith('.db'))
      .sort();
  } catch {
    preSweepBackups = [];
  }
  if (preSweepBackups.length === 0) {
    // Provenance posture (b): fail open. Zero writes — the scan itself must
    // never mutate, so later boots re-evaluate (e.g. if a backup appears).
    const wsIds = (await db.all('select id from workspaces')).map(r => r.id);
    if (wsIds.length > 0) {
      logWarn(
        `  team-link restoration (D-50-6): no pre-sweep backup (${PRE_SWEEP_PREFIX}*.db) found — fail-open posture: every stored p.members entry is treated as a genuine individual invite and NO team links are restored from the Phase 49 sweep era. Workspaces that may need an owner to relink teams: ${wsIds.join(', ')}`,
      );
    }
    return;
  }

  // Provenance posture (a): read the newest pre-sweep snapshot read-only,
  // SQLite-only (the backups exist only on the SQLite lane — pg boots take
  // the fail-open path above, their DATA_DIR carries no such backups).
  const preSweep = new Map(); // wsId -> Map(projectId -> { teams, members })
  await sqliteOnly(async () => {
    let dbBackup;
    try {
      dbBackup = new DatabaseSync(path.join(DATA_DIR, preSweepBackups[preSweepBackups.length - 1]), { readOnly: true });
      for (const row of dbBackup.prepare('select id, doc from workspaces').all()) {
        let doc = {};
        try {
          doc = JSON.parse(row.doc);
        } catch {
          continue;
        }
        const projects = new Map();
        for (const p of doc?.data?.projects || []) {
          if (!p || typeof p !== 'object' || typeof p.id !== 'string') continue;
          projects.set(p.id, {
            teams: Array.isArray(p.teams) ? p.teams.filter(t => typeof t === 'string') : [],
            members: Array.isArray(p.members) ? p.members.filter(m => typeof m === 'string') : [],
          });
        }
        preSweep.set(row.id, projects);
      }
    } catch (err) {
      // Unreadable snapshot → no provenance → fail open, never guess.
      logWarn(`  team-link restoration (D-50-6): pre-sweep backup unreadable (${err.message}) — fail-open posture, nothing restored.`);
      preSweep.clear();
    } finally {
      try {
        dbBackup?.close();
      } catch {
        /* already closed */
      }
    }
  }, `read pre-sweep provenance snapshot (${PRE_SWEEP_PREFIX}*)`);
  if (preSweep.size === 0) return;

  // Candidate scan (marker-guard): a workspace needs restoration iff the
  // marker is absent AND some project lost a teams key to the sweep (absent
  // now, non-empty in the snapshot). A project the owner already relinked
  // (teams key present) is skipped entirely — its current entries are
  // post-migration truth, never touched.
  const candidates = [];
  for (const row of await db.all('select id, doc from workspaces')) {
    if (!preSweep.has(row.id)) continue;
    let doc;
    try {
      doc = JSON.parse(row.doc);
    } catch {
      continue;
    }
    if (doc?.data?.teamLinksRestored) continue;
    const snapshot = preSweep.get(row.id);
    let needsRestore = false;
    for (const p of doc?.data?.projects || []) {
      const pre = p && typeof p === 'object' ? snapshot.get(p.id) : undefined;
      if (pre && pre.teams.length > 0 && !('teams' in p)) {
        needsRestore = true;
        break;
      }
    }
    if (needsRestore) candidates.push(row.id);
  }
  if (candidates.length === 0) return;

  // No backup = no mutation (T-50-03): a dedicated snapshot under a NEW
  // prefix before the first restore boot touches anything.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-pre-team-link-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    await sqliteOnly(async () => {
      await db.run('pragma wal_checkpoint(truncate)');
      await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
    }, `pre-migration backup ${backup}`);
    logInfo(`  pre-migration backup: ${backup}`);
  } catch (err) {
    logError(`  team-link restoration skipped: pre-migration backup failed: ${err.message}`);
    return;
  }

  let restored = 0;
  let removed = 0;
  await db.tx(async () => {
    for (const wsId of candidates) {
      // In-tx re-read — the candidate scan is a hint, the tx state is the
      // authority (Phase 49 template mechanics).
      const row = await db.get('select doc from workspaces where id = ?', [wsId]);
      let doc;
      try {
        doc = JSON.parse(row?.doc);
      } catch {
        continue;
      }
      if (doc?.data?.teamLinksRestored) continue;
      const snapshot = preSweep.get(wsId);
      let changed = false;
      for (const p of doc?.data?.projects || []) {
        const pre = p && typeof p === 'object' ? snapshot.get(p.id) : undefined;
        if (!pre || pre.teams.length === 0 || 'teams' in p) continue;
        // Sweep-materialized = present now, absent from the pre-sweep access
        // list AND positively team-derived (50-05 CR-01): the removed
        // member_id must resolve through memberships.user_id to a current
        // team_members row of one of the restored teams. An entry that fails
        // the lookup or the team check may be a genuine individual invite
        // added between boots — it STAYS (D-50-6 preservation clause,
        // fail-open for the indistinguishable).
        const current = Array.isArray(p.members) ? p.members.filter(m => typeof m === 'string') : [];
        const materialized = [];
        for (const m of current) {
          if (pre.members.includes(m)) continue;
          const userId = (await db.get('select user_id from memberships where workspace_id = ? and member_id = ?', [wsId, m]))?.user_id || null;
          if (!userId) continue;
          const onRestoredTeam = await db.get(
            `select 1 from team_members where workspace_id = ? and user_id = ? and team_id in (${pre.teams.map(() => '?').join(',')}) limit 1`,
            [wsId, userId, ...pre.teams],
          );
          if (onRestoredTeam) materialized.push(m);
        }
        p.teams = [...pre.teams];
        if (materialized.length > 0) {
          p.members = (Array.isArray(p.members) ? p.members : []).filter(m => !materialized.includes(m));
          removed += materialized.length;
        }
        restored++;
        changed = true;
      }
      if (!changed) continue;
      doc.data.teamLinksRestored = 1; // second-boot no-op marker (idempotence)
      await db.run('update workspaces set doc = ? where id = ?', [JSON.stringify(doc), wsId]);
    }
  });
  if (restored > 0) {
    logInfo(`  team-link restoration (D-50-6): restored ${restored} team link(s), removed ${removed} sweep-materialized p.members entr(ies).`);
  }
}

/*
 * D-50-10 (Phase 50, Plan 02): defensive normalization of the collapsed guest
 * model. The current schema's CHECK constraints admit only
 * owner/admin/member/viewer (memberships) and admin/member/viewer (invites),
 * so current-schema databases can never carry a 'guest' role row — this pass
 * exists for legacy pre-constraint SQLite databases only. Scan-based guard:
 * zero 'guest' rows → zero writes, no backup, byte-identical no-op. When
 * candidates exist: dedicated projects-pre-guest-normalize-<stamp>.db backup
 * first (no backup = no mutation, T-50-03), then a single transaction of
 * guest→viewer rewrites. Doc-embedded role copies need no transform: p.members
 * is a plain member-id array (no roles), and the doc profiles' role field is
 * the presentation label (ROLE_LABEL), not the authorization value. The
 * guest specialness survives via behavior only (D-50-11) — viewer-role checks.
 * inviteRole()'s intake mapping guest→viewer (server.js inviteRole) stays:
 * it IS the normalization at the door.
 */
async function normalizeGuestRoles() {
  const guestCount = async table => (await db.get(`select count(*) as n from ${table} where role = 'guest'`)).n;
  if ((await guestCount('memberships')) === 0 && (await guestCount('invites')) === 0) return;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-pre-guest-normalize-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    await sqliteOnly(async () => {
      await db.run('pragma wal_checkpoint(truncate)');
      await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
    }, `pre-migration backup ${backup}`);
    logInfo(`  pre-migration backup: ${backup}`);
  } catch (err) {
    logError(`  guest-role normalization skipped: pre-migration backup failed: ${err.message}`);
    return;
  }

  let normalized = 0;
  await db.tx(async () => {
    // Per-table re-check inside the transaction (Phase 49 defense-in-depth
    // discipline): only touch tables that still hold candidates.
    for (const table of ['memberships', 'invites']) {
      const before = await guestCount(table);
      if (before === 0) continue;
      await db.run(`update ${table} set role = 'viewer' where role = 'guest'`);
      normalized += before;
    }
  });
  logInfo(`  guest normalization (D-50-10): ${normalized} legacy 'guest' role row(s) normalized to 'viewer'.`);
}

/*
 * Invites created before workspaces were addressable belong to the workspace that
 * existed then. Scoped invites always carry an id, so later boots change nothing.
 */
async function backfillInvites() {
  const ws = await firstWorkspace();
  if (!ws) return;
  await db.run('update invites set workspace_id = ? where workspace_id is null', [ws.id]);
}

async function backfillMemberships() {
  for (const ws of await db.all('select * from workspaces')) {
    let doc;
    try {
      doc = JSON.parse(ws.doc);
    } catch {
      continue;
    }
    if (!doc?.data) continue;
    const before = JSON.stringify(doc);
    for (const m of await db.all('select m.*, u.email, u.name from memberships m join users u on u.id = m.user_id where m.workspace_id = ?', [ws.id])) {
      const memberId = await ensureMember(doc, { id: m.user_id, email: m.email, name: m.name }, m.role, ws.id);
      if (memberId && memberId !== m.member_id) {
        await db.run('update memberships set member_id = ? where workspace_id = ? and user_id = ?', [memberId, ws.id, m.user_id]);
      }
    }
    delete doc.data.workspaces;
    doc.data.me = null;
    if (JSON.stringify(doc) !== before) {
      /* The backfill only repairs server-owned state — the legacy profile
         links and the demo switcher — so it must not move the revision: a
         session that is open across the restart would lose its next write. */
      await db.run('update workspaces set doc = ?, updated_at = ? where id = ?', [JSON.stringify(doc), now(), ws.id]);
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
    /* TEAM-01/D-04: membership is projected as the teams[] array by syncProfiles
       from the team_members authority — the profile seed starts teamless. */
    teams: [],
    title: '',
    c: ['#5A67D8', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index % 6],
    status: 'active',
    last: 0,
    tz: '',
  };
}

/* The document id of an account-backed member. The membership table holds the
   ids that are already taken, so a new member never collides with one. */
async function memberIdFor(workspaceId, user) {
  const row = await db.get('select member_id from memberships where workspace_id = ? and user_id = ?', [workspaceId, user.id]);
  if (row?.member_id) return row.member_id;
  const base = `m_${user.id.slice(0, 8)}`;
  const taken = await db.get('select 1 from memberships where workspace_id = ? and member_id = ?', [workspaceId, base]);
  return taken ? `m_${user.id}` : base;
}

async function ensureMember(doc, user, role = 'member', workspaceId = null) {
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
  const id = workspaceId ? await memberIdFor(workspaceId, user) : `m_${user.id.slice(0, 8)}`;
  members.push(memberProfile({ user_id: user.id, member_id: id, role, name: user.name, email: user.email }, members.length));
  return id;
}

async function addMembership(ws, user, role, teams = [], provenance = null) {
  if (!ws) throw httpError(500, 'No workspace available', 'noWorkspaceReady');
  /* The membership row is the source of truth. The document profile is a
     mirror that the read path repairs, so joining a workspace never moves the
     document's revision and never invalidates another session's write. */
  const memberId = await memberIdFor(ws.id, user);
  /* D-07: the invited team set lands as one authority row per team inside the
     same transaction — an invite accepted between boots must not wait for the
     next backfill to appear in rosters. Scalar-tolerant only for the sake of
     the two no-team internal callers that pass nothing at all. */
  const teamList = [
    ...new Set(
      []
        .concat(teams || [])
        .filter(Boolean)
        .map(t => String(t).slice(0, 40)),
    ),
  ];
  /* [2026-11-07 D-49-1/D-49-5] The membership `scope` column is retired: the
     Phase 49 sweep materialized any stored scope into project access lists
     and cleared the columns, so new rows are written with a NULL scope and
     legacy coalescing is gone. */
  await db.tx(async () => {
    /* Phase 82 (D-82-7, amends D-81-7): provenance follows role for GROUP
       writers — a group-shaped excluded value owns the role it set, so the
       row's provenance flips to `group:<guid>` and becomes the removal/
       downgrade selection key (GS-01/GS-03). The conditional is REQUIRED:
       a literal `provenance = excluded.provenance` would let the DP-5
       invite auto-accept (provenance 'invite') clobber group provenance —
       Pin C (test/groups-sso.test.mjs:105). Manual/invite writers keep
       preserving creation origin. */
    await db.run(
      `insert into memberships (workspace_id, user_id, role, member_id, team, scope, provenance) values (?,?,?,?,?,null,?)
       on conflict(workspace_id, user_id) do update set role = excluded.role, member_id = excluded.member_id,
         provenance = case when excluded.provenance like 'group:%' then excluded.provenance else memberships.provenance end`,
      [ws.id, user.id, role, memberId, null, provenance],
    );
    /* TEAM-01: the teams picked at invite time land in the authority rows too —
       the scalar column is backfill-only legacy (D-04). */
    if (teamList.length) {
      for (const team of teamList) {
        await db.run('insert or ignore into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)', [ws.id, team, memberId, user.id]);
      }
    }
  });
  return memberId;
}

async function createUser(email, name, password) {
  const clean = email.trim().toLowerCase();
  if (!emailOk(clean)) throw httpError(400, 'Enter a valid email address', 'enterValidEmail');
  if (String(password).length < 10) throw httpError(400, 'Use at least 10 characters', 'passwordTooShort');
  if (await db.get('select 1 from users where email = ?', [clean])) throw httpError(409, 'An account with that email already exists', 'accountExists');

  const id = uid();
  const cleanName = (name || '').trim() || clean.split('@')[0];
  try {
    await db.run('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)', [id, clean, cleanName, hashPassword(password), now()]);
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
async function createWorkspace(name, slugBase, user) {
  const slug = await uniqueSlug(slugBase || name);
  const color = ['#1D1C1A', '#5A67D8', '#3B82C4', '#23918A', '#C54B78', '#C48A1E'][(await db.get('select count(*) as n from workspaces')).n % 6];
  const id = uid();
  const doc = emptyDoc({ name, slug, color });
  const t = now();
  await db.run('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)', [
    id,
    slug,
    name,
    color,
    JSON.stringify(doc),
    1,
    t,
    t,
  ]);
  const ws = await db.get('select * from workspaces where id = ?', [id]);
  await addMembership(ws, user, 'owner', [], 'manual');
  return await wsBySlug(slug);
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

/* HARD-05 (D-07): one first-value discipline for every trusted proxy header —
   multi-value x-forwarded-* collapses to its first value. An absent header
   yields '' so each caller's existing truthiness gate behaves unchanged. */
function firstForwardedValue(req, header) {
  const raw = req.headers[header];
  return raw ? String(raw).split(',')[0].trim() : '';
}

function proto(req) {
  if (TRUST_PROXY && firstForwardedValue(req, 'x-forwarded-proto')) return firstForwardedValue(req, 'x-forwarded-proto');
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
  /* [2026-11-11 second-owner invites, owner request] 'owner' is now a real
     invite role — but only an owner-tier inviter gets past the raw-body gate
     below; for everyone else the gate fires before this coercion matters. */
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') return role;
  if (role === 'guest') return 'viewer';
  return 'member';
}

/* [2026-11-09 INVT-03 / T-53-05, D-50-11 re-derived] ONE shared guest
   validator: a guest (viewer-tier) invitee carries EXACTLY one project —
   zero is a workspace-wide guest, two is scope drift. Returns null when
   valid, else a { code, message } keyed refusal (one cause per key).
   Applied on every write path that can change a guest's project scope:
   the invite create route (ALL inviter tiers — the admin/owner path had
   no check before T-53-05), the project-membership add/remove routes,
   and the accept path (defensive belt-and-braces). Never clamp, never
   auto-downgrade (D-06): the server refuses, the client disables+hints. */
function validateGuestInviteShape(role, projects) {
  if (role !== 'viewer') return null;
  const list = (Array.isArray(projects) ? projects : []).filter(Boolean);
  if (list.length === 0) return { code: 'inviteGuestProjectRequired', message: 'Guests need exactly one project' };
  if (list.length > 1) return { code: 'inviteGuestProjectSingle', message: 'Guests can only be scoped to one project' };
  return null;
}

function clientIp(req) {
  if (TRUST_PROXY && firstForwardedValue(req, 'x-forwarded-for')) return firstForwardedValue(req, 'x-forwarded-for');
  return req.socket.remoteAddress || 'unknown';
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl / non-browser clients; CSRF needs a browser
  const host = (TRUST_PROXY && firstForwardedValue(req, 'x-forwarded-host')) || req.headers.host;
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

/* D-68: the challenge cookie mirrors setSessionCookie's attributes EXCEPT the
   lifetime — a hard ~5-minute Max-Age, never SESSION_DAYS (Pitfall 15). */
function challengeCookieAttrs(req) {
  const secure = SECURE_COOKIE === 'true' || (SECURE_COOKIE === 'auto' && proto(req) === 'https');
  return `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function setChallengeCookie(req, res, token) {
  res.setHeader('Set-Cookie', `${CHALLENGE_COOKIE}=${token}; ${challengeCookieAttrs(req)}; Max-Age=${CHALLENGE_TTL_MS / 1000}`);
}

/* Several auth responses carry TWO cookies (session + challenge). setHeader
   overwrites, so appends go through this helper. */
function appendCookie(res, line) {
  const cur = res.getHeader('Set-Cookie');
  if (!cur) res.setHeader('Set-Cookie', line);
  else res.setHeader('Set-Cookie', Array.isArray(cur) ? [...cur, line] : [cur, line]);
}

function clearChallengeCookie(req, res) {
  appendCookie(res, `${CHALLENGE_COOKIE}=; ${challengeCookieAttrs(req)}; Max-Age=0`);
}

/* D-62/D-63: server-side, per-request masking (first char + *** on each side of
   the @). Nothing length- or TLD-preserving (Pitfall 7); nothing persisted. */
function maskEmail(email) {
  const at = String(email).indexOf('@');
  if (at <= 0) return '***';
  return `${String(email).slice(0, at)[0]}***@${String(email).slice(at + 1)[0] || ''}***`;
}

async function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const tokenHash = sha256(token);
  const row = await db.get(
    `select u.*, s.last_seen_at as last_seen_at from sessions s join users u on u.id = s.user_id
       where s.token_hash = ? and s.expires_at > ?`,
    [tokenHash, now()],
  );
  if (!row) return null;
  await touchLastSeen(tokenHash, row.last_seen_at, now());
  return row;
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    fail(res, 401, 'signInRequired', 'Sign in to continue');
    return null;
  }
  return user;
}

/* D-112: the instance-operator privilege boundary. Reads the DB flag ONLY —
   never process.env.ADMIN_EMAIL, never workspace membership or isAdminUser().
   Workspace roles stay tenant-bound; the flag is the sole instance-level tier. */
function isInstanceAdmin(user) {
  return user?.is_instance_admin === 1;
}

/* -------------- instance roles funnel (Phase 85, BKROLE-01, D-09/D-12/D-14) --------------

   The ONE capability gate behind every instance-role route and payload
   flag. The pure half (the D-12 short-circuit + the D-11 map) lives in
   roles.js; this wiring does the two DB reads per call — DIRECT, no
   caching (D-14): a revocation applies on the very next load, so the
   in-memory throttle map is the only state between a revoke and its
   effect. Callers pass a CAP constant, never a role slug (D-09). */
async function userCapabilities(user) {
  const rows = await db.all('select role from instance_roles where user_id = ?', [user.id]);
  return capabilitiesFor(isInstanceAdmin(user), rows.map(r => r.role));
}

async function hasInstanceRole(userId, capability) {
  const user = await db.get('select id, is_instance_admin from users where id = ?', [userId]);
  if (!user) return false; // unknown/deleted account holds nothing
  return (await userCapabilities(user)).includes(capability);
}

/* -------------- global restore lock (Phase 89, 89-02, D-89-31) --------------

   The engine-neutral claim behind the D-89-1 mutual exclusion (any restore
   blocks any backup run and vice versa) and the ONLY restore concurrency
   control (D-89-26 — the instance stays live during a restore). A
   single-row CAS on restore_lock: the WHERE clause IS the compare-and-set
   — atomic on BOTH engines, no per-engine advisory locks (D-89-31). The
   release is holder-checked; stale claims are released at boot
   (sweepStaleRestoreRuns). No DDL ever runs near the lock — the table
   comes from boot runSchema only. */
async function claimRestoreLock(userId) {
  const res = await db.run('update restore_lock set claimed_by = ?, claimed_at = ? where id = 1 and claimed_by is null', [userId, now()]);
  return res.changes === 1;
}

async function releaseRestoreLock(userId) {
  const res = await db.run('update restore_lock set claimed_by = null, claimed_at = null where id = 1 and claimed_by = ?', [userId]);
  return res.changes === 1;
}

/* The lock-held probe both refusal sites (manual trigger + scheduler, D-89-1)
   read — a single row read, never a claim attempt (claiming to test would
   race). Unknown claimant → not held. */
async function restoreLockHeld() {
  return !!(await db.get('select claimed_by from restore_lock where id = 1 and claimed_by is not null'));
}

/* Resolve a workspace by slug and enforce a minimum role. Unknown slugs 404. */
async function requireWorkspace(req, res, slug, minRole = 'viewer') {
  const user = await requireUser(req, res);
  if (!user) return null;
  const ws = await wsBySlug(slug);
  let membership = ws ? await membershipOf(ws.id, user.id) : null;
  /* [2026-11-20, owner quick-task] Instance-admin super-access: an operator
     entering a workspace they hold NO membership in acts as owner inside it
     (owner ratification: "operator = owner inside"), without a memberships
     row — the member list stays honest (no auto-membership). The synthetic
     membership carries member_id = null: project-lead checks (canManageProject
     short-circuits on role, and lead===null never matches), member-scoped
     queries skip it, and every governance-actionable mutation already logs
     the actor's email. Archived workspaces: the operator may ENTER (79-D-02
     blocked members only) but read-only — rank stays below admin so every
     content write fails the role check naturally; no new gate vocabulary. */
  const isOperator = !membership && ws && isInstanceAdmin(user) && SUPER_ACCESS;
  if (isOperator) {
    membership = {
      workspace_id: ws.id,
      user_id: user.id,
      member_id: null,
      role: ws.archived === 1 ? 'viewer' : 'owner',
      origin: null, // not a real grant — never reconciled by group sync (GS-01)
    };
  }
  if (!ws || !membership) {
    fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    return null;
  }
  /* Phase 79 (D-02): archived workspaces refuse member entry at the single
     funnel — every /api/workspaces/:slug route rides this one check, no
     per-route filtering. Operators reach workspace data only through the
     governance routes (which never ride requireWorkspace — Pitfall 3), so
     no operator bypass exists here: members simply can't enter.
     [2026-11-20] revised by owner decision: the instance admin MAY enter an
     archived workspace (read-only via the synthetic viewer membership above);
     real members still can't. */
  if (ws.archived === 1 && !isOperator) {
    fail(res, 403, 'workspaceArchived', 'This workspace is archived');
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

/* Throttled last_seen_at heartbeat (D-22/D-23/D-24): one write per session per
   LAST_SEEN_BAND. The in-memory map is keyed by token_hash and holds the next
   eligible epoch; it is lost on restart (T-14-07: one harmless extra write). */
const lastSeenNext = new Map();
const LAST_SEEN_BAND = 60 * 1000; // D-22: one write per minute per session
async function touchLastSeen(tokenHash, storedLastSeen, nowTs) {
  const next = lastSeenNext.get(tokenHash);
  if (next && nowTs < next) return;
  if (storedLastSeen && nowTs - storedLastSeen < LAST_SEEN_BAND) {
    lastSeenNext.set(tokenHash, storedLastSeen + LAST_SEEN_BAND);
    return;
  }
  await db.run('update sessions set last_seen_at = ? where token_hash = ?', [nowTs, tokenHash]);
  lastSeenNext.set(tokenHash, nowTs + LAST_SEEN_BAND);
  if (lastSeenNext.size > 5000) for (const [k, v] of lastSeenNext) if (nowTs > v) lastSeenNext.delete(k);
}

/* D-99: minimal account-security event store (Phase 20) — a per-user, verb-keyed
   log deliberately NOT the task-scoped logAct (src/core/store.js). Phase 21's
   DIS-01 reuses this table and this helper verbatim. Never logs secrets or codes. */
async function logSecurity(userId, verb) {
  await db.run('insert into security_log (id, user_id, verb, created_at) values (?,?,?,?)', [uid(), userId, verb, now()]);
}

/* TFA-MAIL: fire-and-forget security alert on 2FA factor changes. Account-level
   by design — it deliberately does NOT ride queueNotifEmails: no workspace
   notif prefs gate a security alert, and the pipeline's self-skip (by === to)
   plus member-email resolution are workspace concepts this must bypass.
   Failures are logged, never surfaced to the client (same discipline as
   notif emails). The primary factor's server-side name is a catalogue key —
   humanize it for the email body. */
function sendTfaSecurityAlert(user, action, factorName, req) {
  if (!MAILER.enabled) return;
  const factor = factorName === 'settings.tfa.factor.primary' ? 'Primary authenticator' : factorName || '';
  MAILER.sendSecurityAlert({
    to: user.email,
    action,
    factor,
    ip: clientIp(req),
  }).catch(err => logWarn(`tfa security alert ${action} → ${user.email}: ${err.message}`));
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

  /* Plan 27-01: test-only clock injection for the reminder scheduler. The
     route exists ONLY while REMINDER_TEST_TOKEN is set (the node:test harness
     sets it); unset in production the path 404s like any unknown route. It
     merely runs runReminderPass early — idempotent by construction (window
     open + reminders_sent claim). */
  if (pathname === '/api/internal/reminder-pass' && method === 'POST') {
    if (!process.env.REMINDER_TEST_TOKEN || req.headers['x-reminder-token'] !== process.env.REMINDER_TEST_TOKEN) {
      return fail(res, 404, 'notFound', 'Not found');
    }
    const body = await readJson(req).catch(() => ({}));
    const { emitted, digests } = await runReminderPass({ now: body?.now ? new Date(body.now) : undefined });
    return json(res, 200, { emitted, digests });
  }

  /* Plan 67-01: test-only fetch/lookup/clock injection for the webhook
     delivery engine. Exists ONLY while WEBHOOK_TEST_TOKEN is set (node:test
     harness); unset in production the path 404s like any unknown route.
     The pass is idempotent by construction (claim table + status machine). */
  if (pathname === '/api/internal/webhook-pass' && method === 'POST') {
    if (!process.env.WEBHOOK_TEST_TOKEN || req.headers['x-webhook-token'] !== process.env.WEBHOOK_TEST_TOKEN) {
      return fail(res, 404, 'notFound', 'Not found');
    }
    const body = await readJson(req).catch(() => ({}));
    const calls = [];
    const fetchFn = body?.fetch ? webhookTestFetch(body.fetch, calls) : undefined;
    const lookup = body?.lookup ? webhookTestLookup(body.lookup) : undefined;
    let claimed = 0;
    for (const e of Array.isArray(body?.enqueue) ? body.enqueue : []) {
      try {
        const r = await enqueueWebhookDelivery({ hookId: e.hookId, workspaceId: e.workspaceId || body?.workspaceId, event: e.event, subjectId: e.subjectId, occurrence: e.occurrence });
        claimed += r?.changes || 0;
      } catch (err) {
        logWarn(`webhook test enqueue: ${err.message}`);
      }
    }
    const pass = await runWebhookDeliveryPass({ now: body?.now, fetch: fetchFn, lookup });
    return json(res, 200, { ...pass, claimed, calls });
  }

  /* Plan 68-02: test-only clock + send injection for the email outbox
     delivery engine (the webhook-pass pattern). Exists ONLY while
     EMAIL_TEST_TOKEN is set (node:test harness); unset in production the
     path 404s like any unknown route. The pass is idempotent by
     construction (claim table + status machine). */
  if (pathname === '/api/internal/email-pass' && method === 'POST') {
    if (!process.env.EMAIL_TEST_TOKEN || req.headers['x-email-token'] !== process.env.EMAIL_TEST_TOKEN) {
      return fail(res, 404, 'notFound', 'Not found');
    }
    const body = await readJson(req).catch(() => ({}));
    const calls = [];
    const sendFn = body?.send
      ? async (type, args) => {
          calls.push({ type, ...args });
          if (body.send.fail) throw new Error(body.send.fail);
        }
      : undefined;
    const pass = await runEmailDeliveryPass({ now: body?.now, send: sendFn });
    return json(res, 200, { ...pass, calls });
  }

  /* Plan 87-02: test-only clock injection for the backup scheduler sweep
     (the reminder-pass pattern). The route exists ONLY while
     BACKUP_TEST_TOKEN is set (the node:test harness sets it); unset in
     production the path 404s like any unknown route. The pass is
     idempotent by construction (next_run_at claim + single-fire pass). */
  if (pathname === '/api/internal/backup-scheduler-pass' && method === 'POST') {
    if (!process.env.BACKUP_TEST_TOKEN || req.headers['x-backup-token'] !== process.env.BACKUP_TEST_TOKEN) {
      return fail(res, 404, 'notFound', 'Not found');
    }
    const body = await readJson(req).catch(() => ({}));
    const fired = await runBackupSchedulerPass({ now: body?.now ? new Date(body.now) : undefined });
    return json(res, 200, { fired });
  }

  /* Plan 87-03: test-only clock injection for the GFS rotation pass — the
     same harness pattern as the scheduler-pass route above. Exists ONLY
     while BACKUP_TEST_TOKEN is set; unset in production the path 404s. */
  if (pathname === '/api/internal/backup-rotation-pass' && method === 'POST') {
    if (!process.env.BACKUP_TEST_TOKEN || req.headers['x-backup-token'] !== process.env.BACKUP_TEST_TOKEN) {
      return fail(res, 404, 'notFound', 'Not found');
    }
    const body = await readJson(req).catch(() => ({}));
    const report = await runBackupRotationPass({
      now: body?.now ? new Date(body.now) : undefined,
      taskId: typeof body?.taskId === 'string' && body.taskId ? body.taskId : undefined,
    });
    return json(res, 200, report);
  }

  /* Plan 89-02: test-only restore-lock/writer probe — the same harness
     pattern as the backup-scheduler-pass route above (reminder-pass
     pattern). Drives claimRestoreLock/releaseRestoreLock and the
     emitRestoreRunEvent seam directly (both are server-internal). Exists
     ONLY while RESTORE_TEST_TOKEN is set; unset in production the path
     404s like any unknown route. */
  if (pathname === '/api/internal/restore-probe' && method === 'POST') {
    if (!process.env.RESTORE_TEST_TOKEN || req.headers['x-restore-token'] !== process.env.RESTORE_TEST_TOKEN) {
      return fail(res, 404, 'notFound', 'Not found');
    }
    const body = await readJson(req).catch(() => ({}));
    if (body?.action === 'claim') return json(res, 200, { claimed: await claimRestoreLock(String(body.userId ?? '')) });
    if (body?.action === 'release') return json(res, 200, { released: await releaseRestoreLock(String(body.userId ?? '')) });
    if (body?.action === 'lockRow') return json(res, 200, { lock: await db.get('select id, claimed_by, claimed_at from restore_lock where id = 1') });
    if (body?.action === 'emit') {
      const event = body.event && typeof body.event === 'object' ? body.event : {};
      await emitRestoreRunEvent(event);
      return json(res, 200, { row: event.runId ? await db.get('select * from restore_runs where id = ?', [String(event.runId)]) ?? null : null });
    }
    return fail(res, 404, 'notFound', 'Unknown probe action');
  }

  if (pathname === '/api/config' && method === 'GET') {
    return json(res, 200, {
      app: 'projects',
      signup: ALLOW_SIGNUP,
      mail: MAILER.enabled,
      url: appBase(req),
      workspaceCreation: WORKSPACE_CREATION,
      superAccess: SUPER_ACCESS,
      maxUploadMb: MAX_UPLOAD_MB,
      oidcEnabled: OIDC.enabled,
      oidcSsoOnly: OIDC.ssoOnly,
      /* Phase 88 (D-88-11/T-88-05): the S3 boolean ground truth only — never
         the endpoint/bucket names. The client hides the toggle when false. */
      s3Enabled: S3.enabled,
    });
  }

  /* SSO-01 (Phase 30): the Entra OIDC authorization-code flow. Both routes are
     404-no-oracle when OIDC is disabled (D-02/D-10) — the body never reveals
     WHICH var is missing, because a disabled client hides the config entirely. */
  if (pathname === '/api/auth/oidc/start' && method === 'GET') {
    if (!OIDC.enabled) return fail(res, 404, 'notFound', 'Not found');
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    if (tooMany(`oidc|${clientIp(req)}`)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');

    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const { verifier, challenge } = pkcePair();
    const redirectUri = `${appBase(req)}/api/auth/oidc/callback`;
    /* Hashed-at-rest flow state (prohibition): raw state/nonce live only
       inside the authorize URL and the IdP token round-trip — never in a
       cookie. The cookie carries a fresh opaque key into the in-memory map. */
    const flowKey = crypto.randomBytes(32).toString('base64url');
    OIDC_FLOWS.set(flowKey, {
      stateHash: sha256(state),
      nonce,
      verifier,
      redirectUri,
      createdAt: now(),
    });
    for (const [key, entry] of OIDC_FLOWS) if (now() - entry.createdAt > OIDC_FLOW_TTL_MS) OIDC_FLOWS.delete(key);

    const secure = SECURE_COOKIE === 'true' || (SECURE_COOKIE === 'auto' && proto(req) === 'https');
    appendCookie(res, `${OIDC_FLOW_COOKIE}=${flowKey}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${OIDC_FLOW_TTL_MS / 1000}${secure ? '; Secure' : ''}`);
    res.writeHead(302, { Location: OIDC.buildAuthUrl(redirectUri, { state, nonce, challenge }) });
    return res.end();
  }

  if (pathname === '/api/auth/oidc/callback' && method === 'GET') {
    /* No-oracle failure surface: every failure branch below funnels into ONE
       generic 302 back to the login page — never a JSON error, never a cause,
       never a redirect target taken from the request (open-redirect ban). */
    const errorRedirect = () => {
      appendCookie(res, `${OIDC_FLOW_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      res.writeHead(302, { Location: '/login?sso=error' });
      res.end();
    };
    if (!OIDC.enabled) return fail(res, 404, 'notFound', 'Not found');
    try {
      const flowKey = parseCookies(req.headers.cookie)[OIDC_FLOW_COOKIE];
      /* Delete-on-use (T-30-01): the entry is consumed on the FIRST callback,
         so a replayed ?code&state with the same flow cookie finds nothing. */
      const flow = flowKey ? OIDC_FLOWS.get(flowKey) : null;
      if (flowKey) OIDC_FLOWS.delete(flowKey);
      if (!flow || now() - flow.createdAt > OIDC_FLOW_TTL_MS) return errorRedirect();

      const code = String(url.searchParams.get('code') || '');
      const state = String(url.searchParams.get('state') || '');
      if (!code || !state || !timingSafeHex(flow.stateHash, sha256(state))) return errorRedirect();

      const tokenSet = await OIDC.exchangeCode(code, flow.verifier, flow.redirectUri);
      if (!tokenSet?.id_token) return errorRedirect();

      let jwks = await OIDC.getJwks();
      const verifyOpts = { issuer: OIDC.config.issuer, audience: OIDC.config.clientId, nonce: flow.nonce, now: now() / 1000 };
      let verdict = verifyIdToken(tokenSet.id_token, jwks, verifyOpts);
      /* Pitfall 3: unknown kid → exactly one JWKS refetch (key rotation),
         then fail closed on the second miss. */
      if (!verdict.ok && verdict.reason === 'kid') {
        jwks = await OIDC.getJwks(true);
        verdict = verifyIdToken(tokenSet.id_token, jwks, verifyOpts);
      }
      if (!verdict.ok) return errorRedirect();

      const claims = verdict.claims;
      const subject = String(claims.sub || '');
      const email = String(claims.email || '')
        .trim()
        .toLowerCase();
      if (!subject || !emailOk(email)) return errorRedirect();

      /* Identity resolution — SSO-03 strict verified-email linking (T-30-06,
         tightened by gap closure G-30-1). "Verified email" is the LITERAL
         `email_verified: true` claim from the IdP — planner assumption A2
         (pinned-tenant member vouching substitutes for verification) is
         SUPERSEDED by operator decision and no longer substitutes for the
         claim. Gating (fail closed, generic /login?sso=error):
           - LINKING an existing account requires pinned-tenant tid match +
             non-guest shape AND email_verified === true;
           - JIT-PROVISIONING a fresh email (guest or member) requires
             email_verified === true;
           - invite reconciliation (SSO-07) flows through the same row
             resolution, so it inherits both gates.
         An ALREADY-LINKED (issuer, subject) identity row still resolves
         without re-checking the claim — repeat logins must not break; the
         fail-closed policy applies to linking/provisioning, not to an
         established identity. preferred_username is never consulted — only
         the email claim can link. */
      const isPinnedTenant = claims.tid === OIDC.config.tenantId;
      const guestShape = (typeof claims.idp === 'string' && claims.idp !== '' && claims.idp !== OIDC.config.issuer) || String(claims.acct ?? '') === '1';
      const canLink = isPinnedTenant && !guestShape;
      /* OIDC_TRUST_TENANT_EMAIL (opt-in, default off): Azure AD work/school
         accounts routinely omit the MSA-style `email_verified` claim, which
         fail-closed blocks linking AND JIT provisioning for genuine tenant
         members. When the operator sets the flag, a PINNED-TENANT member
         (tid matches, non-guest shape) substitutes for the claim — the IdP
         vouches for its own members' mailboxes. Guests and cross-tenant
         identities still require literal email_verified === true. */
      const trustTenantEmail = ['true', '1', 'yes', 'on'].includes(String(process.env.OIDC_TRUST_TENANT_EMAIL ?? '').trim().toLowerCase());
      const verifiedEmail = claims.email_verified === true || (trustTenantEmail && isPinnedTenant && !guestShape);
      let row = await db.get('select u.* from oidc_identities i join users u on u.id = i.user_id where i.issuer = ? and i.subject = ?', [
        OIDC.config.issuer,
        subject,
      ]);
      if (!row) {
        const existing = await db.get('select * from users where email = ?', [email]);
        if (existing && !(canLink && verifiedEmail)) return errorRedirect();
        if (existing) {
          row = existing;
        } else if (!verifiedEmail) {
          /* G-30-1: no verified email → no JIT account, guest or not —
             fail closed BEFORE any users/oidc_identities write. */
          return errorRedirect();
        } else {
          /* DP-4 (Phase 76, DOM-06): the signup door gates JIT provisioning —
             fresh-provision branch ONLY, AFTER the email_verified gate; an
             already-linked identity never reaches this arm (immunity, DOM-05)
             and an existing verified-email account links above without being
             gated. Refusal logs the domain only, never the full email (D-09,
             V7 PII ban), and the client sees the ONE generic sso=error
             surface — no domain-revealing query param. */
          const signupRefusal = emailDomainRefusal(email, SIGNUP_DOMAINS);
          if (signupRefusal) {
            /* D-09 (V7 PII ban): the domain only — never the full email.
               logInfo is single-argument here, so the domain rides the
               message string (the surrounding interpolated-log style). */
            logInfo(`sso signup domain refused — domain: ${emailFromEmail(email)}`);
            return errorRedirect();
          }
          /* Pitfall 5: JIT accounts get a RANDOM unusable scrypt hash — never
             a constant — into the password_hash NOT NULL column. Bare account,
             no workspace (D-05); the onboarding flow lands them next. */
          const created = await createUser(email, String(claims.name || ''), crypto.randomBytes(24).toString('base64url'));
          row = await db.get('select * from users where id = ?', [created.id]);
        }
        try {
          await db.run('insert into oidc_identities (id, user_id, issuer, subject, created_at, last_login_at) values (?,?,?,?,?,?)', [
            uid(),
            row.id,
            OIDC.config.issuer,
            subject,
            now(),
            now(),
          ]);
        } catch (err) {
          /* Concurrency backstop (SSO-03): a parallel first-login for the same
             (issuer, subject) won the unique index — resolve to ITS row instead
             of failing the login. Any other SQL error rethrows (fail closed). */
          if (!/UNIQUE|oidc_identities_subject/i.test(String(err?.message || ''))) throw err;
          row = await db.get('select u.* from oidc_identities i join users u on u.id = i.user_id where i.issuer = ? and i.subject = ?', [
            OIDC.config.issuer,
            subject,
          ]);
        }
      }

      /* Phase 82 (D-82-10, GS-01/GS-02): the group reconcile pass runs after
         DP-4/DP-5 identity resolution and BEFORE the DP-5 invite reconcile —
         strictly after the oidc_identities concurrency backstop above (keyed
         to the resolved row), inside the existing try so ANY throw funnels
         to errorRedirect (D-81-11 fail closed). One pass per workspace over
         the union of grant targets and existing group-derived rows: delete
         (no mapping + group provenance, owner-guarded) / downgrade (mapped <
         existing, group provenance ONLY — GS-03) / upgrade (mapped >
         existing, Phase 81 rule) / no-op. The encoded grant-trail conversion
         and the byte-identical gate land in Plan 02 Task 2/3. */
      const claimState = resolveGroupsClaim(claims);
      if (claimState.state === 'unmapped') {
        /* D-81-10: ONE fixed logWarn on overage — never claim content, GUIDs,
           or counts in the message. */
        if (claimState.reason === 'overage') logWarn('sso groups claim overage — treating as unmapped');
      } else {
        const mappings = await db.all('select group_guid, workspace_id, role, kind from group_mappings');
        const { grants, operatorFlag } = resolve(claimState.groups, mappings);
        /* D-81-3: viewer ranks 0 — ANY mapped role upgrades a viewer row. This
           map is callback-local ON PURPOSE: groups.js ROLE_RANK is test-locked
           Phase 80 surface and mappings can never map TO viewer (PATTERNS
           anti-pattern 5). */
        const ROLE_RANK_WITH_VIEWER = { owner: 3, admin: 2, member: 1, viewer: 0 };
        /* Phase 82 (D-82-10, GS-01): ONE reconcile pass per workspace — the
           target set is the union of the resolved grant targets AND the
           workspaces already holding the user's group-derived rows (a deleted
           mapping produces no grant, but the row still exists and must be
           reconciled). Exactly ONE delta per workspace in place — never
           delete-then-reinsert. The whole pass lives inside this mapped
           else-branch: an overage/unmapped login skips grants AND removals
           (SC5 / D-82-4). Selection key is provenance itself (`group:<guid>`
           parsed from the stored row, never from claims — mappings can be
           deleted between logins). The lastOperator guard (:6909) is
           structurally unreachable from group logic — grants only increase
           the operator count and removal-sync never touches
           is_instance_admin (D-82-8) — deliberately not duplicated. */
        const mappedByWs = new Map();
        for (const grant of grants) {
          const cur = mappedByWs.get(grant.workspaceId);
          if (!cur || ROLE_RANK_WITH_VIEWER[grant.role] > ROLE_RANK_WITH_VIEWER[cur.role]) mappedByWs.set(grant.workspaceId, grant);
        }
        /* GS-02 owner guard funnel — count-before-write (Pitfall 4), shared
           by Plan 02's owner-downgrade arm via the same `delta` vocabulary.
           Refusal is NEVER a throw (Pitfall 6: guard refusals are `continue`s,
           distinct from the fail-closed catch): skip + ONE fixed logWarn (no
           GUID, no email, no counts — D-81-10 PII posture) + ONLY a
           guard-refused audit row (count-before-write means no delta write is
           in flight to roll back) — then the login proceeds and mints a
           session. `ownerCount` counts OTHER owners, so refusal fires exactly
           when the user is the SOLE owner — the route's semantics. */
        const guardRefuse = async (wsId, guid, delta) => {
          logWarn('sso group removal refused — last workspace owner');
          await db.tx(async () => {
            await db.run(
              'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
              [uid(), row.id, row.id, `group_${delta}:group:${guid}:guard-refused`, 0, clientIp(req), wsId, row.name, row.email, row.name, row.email, now()],
            );
          });
        };
        const groupRows = await db.all("select workspace_id, role, member_id, provenance from memberships where user_id = ? and provenance like 'group:%'", [row.id]);
        for (const wsId of new Set([...mappedByWs.keys(), ...groupRows.map(r => r.workspace_id)])) {
          const mapped = mappedByWs.get(wsId);
          /* Widened Phase 81 select: the delete cell needs member_id and the
             provenance GUID, not just the role. */
          const existing = await db.get('select role, member_id, provenance from memberships where workspace_id = ? and user_id = ?', [wsId, row.id]);
          if (!mapped) {
            /* GS-01 delete cell: NO mapping for this workspace. Only a
               group-derived row is removed — manual/invite/NULL rows are
               immune (zero writes, zero audit rows). The GUID comes from the
               row's own provenance value (server-side), never from claims
               (T-82-01/T-82-02). */
            if (!existing || !String(existing.provenance || '').startsWith('group:')) continue;
            const guid = existing.provenance.slice('group:'.length);
            /* Archived/deleted workspace: skip the removal (a deleted
               workspace's rows are already cascade-gone; archived rows stay
               restorable) — the skip+audit vocabulary for these lands with
               the full delta trail in Plan 02. */
            const wsState = await db.get('select archived from workspaces where id = ?', [wsId]);
            if (!wsState || wsState.archived === 1) continue;
            /* GS-02 owner guard — count-before-write through the shared
               funnel, mirroring the member DELETE route (:7637). */
            if (existing.role === 'owner' && (await ownerCount(wsId, row.id)) === 0) {
              await guardRefuse(wsId, guid, 'membership_removed');
              continue;
            }
            /* Mirror the member-DELETE route tx shape (:7638–7643) exactly —
               memberships + team_members + doc stripMember — plus the encoded
               audit row in the SAME tx (AUD-01: a forced audit failure rolls
               back the removal). */
            await db.tx(async () => {
              await db.run('delete from memberships where workspace_id = ? and user_id = ?', [wsId, row.id]);
              await db.run('delete from team_members where workspace_id = ? and user_id = ?', [wsId, row.id]);
              await updateDoc(wsId, doc => stripMember(doc, existing.member_id, row.id));
              await db.run(
                'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
                [uid(), row.id, row.id, `group_membership_removed:group:${guid}:lost-claim`, 0, clientIp(req), wsId, row.name, row.email, row.name, row.email, now()],
              );
            });
            continue;
          }
          /* D-81-8 + D-82-9: dead/archived workspace → skip + logWarn, never
             fatal — now WITH its encoded audit row (reason dead-workspace for
             a missing workspace, archived-workspace for archived = 1). The
             GUID is the GRANT's groupGuid (grant side). Removal side: dead-
             workspace removals are structurally unreachable (FK on delete
             cascade pre-deletes rows of deleted workspaces) — the reason
             stays in the vocabulary for Phase 83 rendering only. */
          const ws = await db.get('select * from workspaces where id = ?', [wsId]);
          if (!ws || ws.archived === 1) {
            logWarn('sso group grant skipped — workspace missing or archived');
            const skipReason = ws ? 'archived-workspace' : 'dead-workspace';
            await db.tx(async () => {
              await db.run(
                'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
                [uid(), row.id, row.id, `group_membership_skipped:group:${mapped.groupGuid}:${skipReason}`, 0, clientIp(req), wsId, row.name, row.email, row.name, row.email, now()],
              );
            });
            continue;
          }
          if (existing) {
            const curRank = ROLE_RANK_WITH_VIEWER[existing.role];
            const mappedRank = ROLE_RANK_WITH_VIEWER[mapped.role];
            /* D-81-5 changes-only: mapped == existing → no-op, zero writes. */
            if (mappedRank === curRank) continue;
            if (mappedRank < curRank) {
              /* GS-03 downgrade cell: ONLY a group-derived row may be lowered —
                 manual/invite/NULL provenance rows are immune (zero writes, zero
                 audit rows; T-82-05). D-82-7 role-source semantics: the write
                 goes through addMembership so the conditional conflict clause
                 stamps the DRIVING group's provenance `group:<guid>` (a row
                 originally from group A demoted per group B now carries B's
                 provenance — the same predicate key the next delete pass uses). */
              if (!String(existing.provenance || '').startsWith('group:')) continue;
              const guid = mapped.groupGuid;
              /* GS-02 owner-downgrade guard arm: demoting the SOLE owner removes
                 the only owner (research A5) — mirror the PATCH route guard
                 template (:7653: row.role === 'owner' && nextRole !== 'owner' &&
                 ownerCount(...) === 0) and route through the SAME guardRefuse
                 funnel. Refusal = skip + loud logWarn + guard-refused audit row,
                 login proceeds. */
              if (existing.role === 'owner' && mapped.role !== 'owner' && (await ownerCount(wsId, row.id)) === 0) {
                await guardRefuse(wsId, guid, 'role_downgraded');
                continue;
              }
              await addMembership(ws, row, mapped.role, [], 'group:' + guid);
              /* GS-04/D-82-9: the mapped-lower delta is audit-logged in its own
                 db.tx (addMembership owns its internal tx — db.tx does not
                 nest), encoded action per D-82-9, actor=target=self. */
              await db.tx(async () => {
                await db.run(
                  'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
                  [uid(), row.id, row.id, `group_role_downgraded:group:${guid}:mapped-lower`, 0, clientIp(req), wsId, row.name, row.email, row.name, row.email, now()],
                );
              });
              continue;
            }
            /* mappedRank > curRank → upgrade: fall through to the grant/upgrade
               write below (Phase 81 rule, D-81-2). */
          }
          /* D-82-11 (GS-04 literal): grants AND upgrades land as encoded
             delta rows in the D-82-9 format — reason segment omitted (the
             fixed vocabulary applies only to skips/refusals). Each row is
             written in its own db.tx (addMembership owns its internal tx —
             db.tx does not nest), actor=target=self. logSecurity's
             sso_group% verbs are GONE from the delta path — heartbeats
             (sso_login, sso_invite_accepted) keep the helper. The
             operator_promoted block below is UNCHANGED (D-81-4/D-82-8). */
          const wasUpgrade = !!existing;
          await addMembership(ws, row, mapped.role, [], 'group:' + mapped.groupGuid);
          await db.tx(async () => {
            await db.run(
              'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
              [uid(), row.id, row.id, wasUpgrade ? `group_role_upgraded:group:${mapped.groupGuid}` : `group_granted:group:${mapped.groupGuid}`, 0, clientIp(req), wsId, row.name, row.email, row.name, row.email, now()],
            );
          });
        }
        /* Phase 81 (GO-01/GO-02, D-81-4): operator self-grant — mirror the console
           promote tx EXACTLY (:6879–6898 shape) with actor = target = the granted
           user (self-grant) and the audit row in the SAME db.tx (AUD-01: a forced
           audit failure rolls back the promotion — never a write un-logged). The
           console route's lastOperator count guard is structurally unreachable
           here: a grant only INCREASES the operator count, so the guard would
           never fire — deliberately not duplicated. D-82-3 re-grant is automatic:
           a demoted user's next login flips 0→1, which IS a change (audit row);
           already-operator + operator-mapping match = no write, no audit
           (D-81-5 changes-only). */
        if (operatorFlag && row.is_instance_admin !== 1) {
          await db.tx(async () => {
            await db.run('update users set is_instance_admin = ? where id = ?', [1, row.id]);
            await db.run(
              'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
              [uid(), row.id, row.id, 'operator_promoted', 0, clientIp(req), null, row.name, row.email, row.name, row.email, now()],
            );
          });
        }
      }

      /* SSO-07 (D-06): reconcile pending invitations at the first sight of
         the identity. Only accounts with ZERO memberships are candidates —
         linked users who already belong to a workspace skip this entirely,
         which also makes repeat logins idempotent (no duplicate rows). The
         criteria mirror the accept route: unused, unexpired, email match.
         Expired invites are filtered out here — they neither block nor
         auto-accept. */
      let ssoRedirect = '/';
      if (!(await db.get("select 1 from memberships where user_id = ? and (provenance is null or provenance not like 'group:%')", [row.id]))) {
        /* DP-5 (Phase 76, DOM-05/SC3): refuse invites the accept door would
           refuse — the ROW's stored invite.email against the live boot-frozen
           INVITE_DOMAINS, verbatim DP-3 semantics (the SQL already matches
           the row's email; the row is the ticket, never client input). The
           filter produces a NEW array and the branching below consumes ONLY
           the filtered one. Silent per D-10: no log verb, no redirect change,
           no used_at write on refusal — a filtered invite is neither consumed
           nor messaged, and loosening the list revives it. The signup list is
           deliberately never consulted here (one door, one rule — DOM-03). */
        const pendingInvites = (await db.all('select * from invites where email = ? collate nocase and used_at is null and expires_at > ?', [row.email, now()])).filter(
          invite => emailDomainRefusal(invite.email, INVITE_DOMAINS) === null,
        );
        if (pendingInvites.length === 1) {
          /* Exactly one pending invite: auto-accept with the acceptance
             recipe VERBATIM from the accept route — addMembership with the
             invite's stored role/teams/scope plus the same invite-clearing
             writes. Never a parallel membership insert (T-30-11). */
          const invite = pendingInvites[0];
          /* HARD-03 (D-03/D-05): resolve explicitly — no firstWorkspace()
             fallback, no cross-tenant join. */
          const ws = await db.get('select * from workspaces where id = ?', [invite.workspace_id]);
          if (ws) {
            await addMembership(
              ws,
              row,
              invite.role,
              (() => {
                try {
                  return JSON.parse(invite.teams || '[]');
                } catch {
                  return [];
                }
              })(),
              'invite',
            );
            /* Same single-use clearing as the accept route: the consumed
               token plus every other pending link for that address. */
            await db.run('update invites set used_at = ?, used_by = ? where token_hash = ?', [now(), row.id, invite.token_hash]);
            await db.run('update invites set used_at = ? where workspace_id = ? and email = ? and used_at is null', [now(), ws.id, invite.email]);
            await logSecurity(row.id, 'sso_invite_accepted');
          } else {
            /* HARD-03 (D-03/D-04): fail closed — the invite's workspace is
               gone. Consume the ONE invite with the same :2868-shaped write so
               the zombie link can never be retried; NO membership is granted,
               the address-wide clearing write is skipped (no ws.id to scope it
               to), no success security verb fires (that would log a lie), and
               the login lands on the ONE generic ssoError surface. */
            await db.run('update invites set used_at = ?, used_by = ? where token_hash = ?', [now(), row.id, invite.token_hash]);
            ssoRedirect = '/login?sso=error';
          }
        } else if (pendingInvites.length > 1) {
          /* Multiple pending invites: surface, don't guess — no silent
             mass-accept. Every invite stays pending; the 302 lands the SPA
             on the invitations surface (plan 30-04 wires the fragment). */
          ssoRedirect = '/#invitations';
        }
      }

      /* SSO-05 (T-30-09): the D-68 challenge-then-stop branch, VERBATIM from
         the login route below — a TOTP-enrolled account is exactly as
         untrusted after the IdP round-trip as after a password. Same
         login_challenges insert, same setChallengeCookie, same
         CHALLENGE_TTL_MS; only the response differs (browser 302, not XHR
         JSON): /#tfa lands the SPA on the pending-2FA state (Pitfall 9 — the
         hash fragment survives a mid-challenge refresh). The throttle
         attempts map is NOT touched (D-03/Pitfall 18 discipline) and
         /api/auth/tfa/login needs ZERO changes — challenge rows are
         user-scoped. */
      if (row.two_fa_enabled) {
        const challengeToken = crypto.randomBytes(32).toString('base64url');
        await db.run('insert into login_challenges (challenge_token_hash, user_id, expires_at, attempts) values (?,?,?,0)', [
          sha256(challengeToken),
          row.id,
          now() + CHALLENGE_TTL_MS,
        ]);
        setChallengeCookie(req, res, challengeToken);
        res.writeHead(302, { Location: '/#tfa' });
        return res.end();
      }

      /* Session mint — VERBATIM from the login route (server.js 2613-2629);
         only the final response becomes a 302 (browser navigation, not XHR). */
      const token = crypto.randomBytes(32).toString('base64url');
      const t = now();
      const ua = String(req.headers['user-agent'] || '');
      const ip = clientIp(req);
      await db.run('insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)', [
        sha256(token),
        row.id,
        t,
        t + SESSION_DAYS * 86400 * 1000,
        ip,
        ua,
        t, // a just-created session was seen at creation (D-25 need not apply to new rows)
      ]);
      /* D-13 (67-02): persist the AAD object id (oid claim) onto the user at
         login — the SINGLE write site. Server-only: userPayload is a field
         whitelist and never carries it, docForClient never sees the users
         table — the oid is readable only by the webhook mention resolver. */
      const oidClaim = typeof claims.oid === 'string' && claims.oid ? claims.oid : null;
      await db.run('update users set last_login_at = ?, aad_oid = ? where id = ?', [t, oidClaim, row.id]);
      await db.run('update oidc_identities set last_login_at = ? where issuer = ? and subject = ?', [t, OIDC.config.issuer, subject]);
      setSessionCookie(req, res, token);
      await logSecurity(row.id, 'sso_login');
      res.writeHead(302, { Location: ssoRedirect });
      return res.end();
    } catch {
      /* Pitfall 7: exchange/verification failures (timeout, HTTP error,
         malformed token) fail closed to the same generic redirect. */
      return errorRedirect();
    }
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    /* SSO-06/D-07 (plan 04): under SSO-only the password door is a bare 404 —
       the exact no-oracle shape of any unknown route, answered BEFORE the
       sameOrigin guard so a cross-origin POST never earns a 403-with-message
       either. OIDC.ssoOnly is true only when OIDC is enabled (readConfig in
       oidc.js). Reversible: clearing OIDC_SSO_ONLY reopens the door; no
       password_hash is ever touched (D-08). */
    if (OIDC.ssoOnly) return fail(res, 404, 'notFound', 'Not found');
    /* Same origin guard as every other mutation — before the body read AND before the
       throttle, so a cross-origin POST cannot consume the victim IP's attempt budget. */
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(body?.password || '');
    if (!emailOk(email) || !password) return fail(res, 400, 'emailAndPasswordRequired', 'Email and password are required');
    if (tooMany(`${clientIp(req)}|${email}`)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    logWarn(`login failed: ${email} from ${clientIp(req)}`);

    const row = await db.get('select * from users where email = ?', [email]);
    const valid = verifyPassword(password, row?.password_hash || DUMMY_HASH) && !!row;
    if (!valid) return fail(res, 401, 'invalidCredentials', 'Email or password is incorrect');

    /* D-68: a 2FA-enabled account gets NO identity from the password alone.
       Issue the short-lived challenge (row + its own cookie) and stop. This
       branch MUST NOT touch the throttle attempts map — the password→code
       steps share ONE budget (D-03/Pitfall 18: no success-clear between steps). */
    if (row.two_fa_enabled) {
      const challengeToken = crypto.randomBytes(32).toString('base64url');
      await db.run('insert into login_challenges (challenge_token_hash, user_id, expires_at, attempts) values (?,?,?,0)', [
        sha256(challengeToken),
        row.id,
        now() + CHALLENGE_TTL_MS,
      ]);
      setChallengeCookie(req, res, challengeToken);
      logInfo(`2fa challenge issued: ${email} from ${clientIp(req)}`);
      return json(res, 200, { pending2fa: true, maskedEmail: maskEmail(row.email) });
    }

    attempts.delete(`${clientIp(req)}|${email}`);
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    const ua = String(req.headers['user-agent'] || '');
    const ip = clientIp(req);
    await db.run('insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)', [
      sha256(token),
      row.id,
      t,
      t + SESSION_DAYS * 86400 * 1000,
      ip,
      ua,
      t, // a just-created session was seen at creation (D-25 need not apply to new rows)
    ]);
    await db.run('update users set last_login_at = ? where id = ?', [t, row.id]);
    setSessionCookie(req, res, token);
    logInfo(`login: ${email} from ${clientIp(req)}`);
    return json(res, 200, { user: await userPayload(row) });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const sess = await db.get('select user_id from sessions where token_hash = ?', [sha256(token)]);
      if (sess) {
        const u = await db.get('select email from users where id = ?', [sess.user_id]);
        if (u) logInfo(`logout: ${u.email}`);
      }
      await db.run('delete from sessions where token_hash = ?', [sha256(token)]);
    }
    // D-61/D-71: logout also works from the pending state — kill any live challenge.
    const challengeToken = parseCookies(req.headers.cookie)[CHALLENGE_COOKIE];
    if (challengeToken) await db.run('delete from login_challenges where challenge_token_hash = ?', [sha256(challengeToken)]);
    clearSessionCookie(req, res);
    clearChallengeCookie(req, res);
    return json(res, 204);
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    // Probe endpoint: answer 200 with null instead of 401 so a signed-out
    // boot doesn't log a console error in every browser.
    const user = await currentUser(req);
    if (!user) return json(res, 200, { user: null });
    return json(res, 200, { user: await userPayload(user) });
  }

  if (pathname === '/api/auth/me' && method === 'PATCH') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    // Only body.locale is read; every other field is ignored (mass-assignment guard).
    const locale = String(body?.locale || '');
    if (!LOCALE_CODES.includes(locale)) return fail(res, 400, 'unknownLocale', 'Unknown locale');
    await db.run('update users set locale = ? where id = ?', [locale, user.id]);
    const fresh = await db.get('select * from users where id = ?', [user.id]);
    return json(res, 200, { user: await userPayload(fresh) });
  }

  /* ------------------- per-user notif prefs (Phase 34, SETTINGS-01/02) ------------------- */

  if (pathname === '/api/me/notif-prefs' && method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const wsId = String(url.searchParams.get('workspace') || '');
    const ws = wsId ? await db.get('select id from workspaces where id = ?', [wsId]) : null;
    const member = ws ? await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]) : null;
    // No-oracle: a workspace the caller is not a member of reads as not-found.
    if (!ws || !member) return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    return json(res, 200, { prefs: await getUserNotifPrefs(user.id, ws.id) });
  }

  if (pathname === '/api/me/notif-prefs' && method === 'PUT') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    // Only body.workspace and body.prefs.prefs-keys are read; user_id always
    // comes from the session — never the body (same mass-assignment discipline
    // as body.locale above). Every key must be whitelisted (D-03, the
    // LOCALE_CODES analog) and every value coerced to boolean.
    const incoming = body?.prefs;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return fail(res, 400, 'unknownPrefKey', 'Unknown preference key');
    }
    for (const key of Object.keys(incoming)) {
      if (!NOTIF_PREF_KEYS.includes(key)) return fail(res, 400, 'unknownPrefKey', 'Unknown preference key');
    }
    const wsId = String(body?.workspace || '');
    const ws = wsId ? await db.get('select id from workspaces where id = ?', [wsId]) : null;
    const member = ws ? await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]) : null;
    if (!ws || !member) return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    // Merge into the existing row instead of replacing it: a partial body must
    // never erase keys the caller omits (e.g. after a silent hydration failure
    // the client falls back to local defaults and would otherwise revert a
    // stored `false` to the ON default). Whitelist + boolean coercion still
    // apply to every incoming key.
    const existingRow = await db.get('select prefs from user_notif_prefs where workspace_id = ? and user_id = ?', [ws.id, user.id]);
    let existing = {};
    try {
      const parsed = JSON.parse(existingRow?.prefs ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existing = parsed;
    } catch {
      /* corrupt stored blob: start from a clean object rather than crash */
    }
    const prefs = { ...existing };
    for (const key of Object.keys(incoming)) prefs[key] = Boolean(incoming[key]);
    await db.run('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)', [ws.id, user.id, JSON.stringify(prefs)]);
    return json(res, 200, { prefs: await getUserNotifPrefs(user.id, ws.id) });
  }

  /* ------------------- browser push subscriptions (Phase 59, PUSH-01/PUSH-05) ------------------- */

  /* Shared guard ladder, cloned from /api/me/notif-prefs: requireUser →
     sameOrigin → workspace/member 404 no-oracle. Rows are only ever created,
     read or deleted for the SESSION user_id (T-59-02 — body-supplied ids are
     ignored; mass-assignment forbidden). */
  async function pushSubscriptionWorkspace(req, res, user, bodyWorkspace) {
    const wsId = String(url.searchParams.get('workspace') || bodyWorkspace || '');
    const ws = wsId ? await db.get('select id from workspaces where id = ?', [wsId]) : null;
    const member = ws ? await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]) : null;
    if (!ws || !member) {
      fail(res, 404, 'workspaceNotFound', 'Workspace not found');
      return null;
    }
    return ws;
  }

  /* PUSH-05 fail-absent: the client hides the whole Push surface when this
     404s (MCP-01 pattern). Only the PUBLIC key ever crosses the wire (T-59-03). */
  if (pathname === '/api/me/push-config' && method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    if (!PUSH.enabled) return fail(res, 404, 'pushUnavailable', 'Browser push is not configured');
    return json(res, 200, { vapidPublicKey: PUSH.publicKey });
  }

  if (pathname === '/api/me/push-subscriptions' && method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const ws = await pushSubscriptionWorkspace(req, res, user);
    if (!ws) return;
    const rows = await db.all(
      'select endpoint, label, created_at, last_seen_at from push_subscriptions where workspace_id = ? and user_id = ? order by created_at',
      [ws.id, user.id],
    );
    return json(res, 200, { subscriptions: rows });
  }

  if (pathname === '/api/me/push-subscriptions' && method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    /* CANONICAL body shape {endpoint, keys:{p256dh, auth}, label} — the exact
       shape pushManager.subscribe().toJSON() yields, so the client POSTs it
       verbatim. Whitelist-validate every field (T-59-01): endpoint https URL,
       p256dh/auth base64url, label byte-capped; user_id always from the
       session. Re-subscribing an existing endpoint REPLACES the row and
       preserves its original created_at (device-list creation date, D-03). */
    const endpoint = body?.endpoint;
    const keys = body?.keys;
    if (!pushEndpointOk(endpoint) || !keys || !pushKeyOk(keys.p256dh) || !pushKeyOk(keys.auth)) {
      return fail(res, 400, 'invalidSubscription', 'Invalid push subscription');
    }
    let label = '';
    if (typeof body?.label === 'string') {
      // Byte-cap (never byte-count) — multi-byte chars must not half-overflow.
      for (const ch of String(body.label)) {
        if (Buffer.byteLength(label + ch, 'utf8') > PUSH_LABEL_MAX_BYTES) break;
        label += ch;
      }
    }
    const ws = await pushSubscriptionWorkspace(req, res, user, body?.workspace);
    if (!ws) return;
    const t = now();
    /* CR-01 (59-REVIEW): endpoint is globally UNIQUE, so the old unscoped
       lookup + insert-or-replace let any member who learned another member's
       endpoint URL hijack the row (reparent + key swap → silent victim
       unsubscribe). Replacement is now scoped to THIS member's own row; a
       row owned by someone else is never reparented — honest 409, keyed. */
    const existing = await db.get(
      'select workspace_id, user_id, created_at from push_subscriptions where endpoint = ? and workspace_id = ? and user_id = ?',
      [endpoint, ws.id, user.id],
    );
    const foreign = await db.get('select user_id from push_subscriptions where endpoint = ?', [endpoint]);
    /* Any pre-existing row this session does not own in THIS workspace is
       refused (another member's row, or your own row under another
       workspace — the old replace silently clobbered it cross-workspace). */
    if (!existing && foreign) {
      return fail(res, 409, 'pushEndpointOwned', 'Push endpoint belongs to another member');
    }
    const createdAt = existing?.created_at ?? t;
    await db.run(
      'insert or replace into push_subscriptions (workspace_id, user_id, endpoint, p256dh, auth, label, created_at, last_seen_at) values (?,?,?,?,?,?,?,?)',
      [ws.id, user.id, endpoint, keys.p256dh, keys.auth, label, createdAt, t],
    );
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/me/push-subscriptions' && method === 'DELETE') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req).catch(() => null);
    const endpoint = url.searchParams.get('endpoint') || body?.endpoint;
    if (!pushEndpointOk(endpoint)) return fail(res, 400, 'invalidSubscription', 'Invalid push subscription');
    const ws = await pushSubscriptionWorkspace(req, res, user, body?.workspace);
    if (!ws) return;
    // Caller-owned rows only — endpoint alone can never address another user's row.
    await db.run('delete from push_subscriptions where workspace_id = ? and user_id = ? and endpoint = ?', [ws.id, user.id, endpoint]);
    return json(res, 200, { ok: true });
  }

  /* ------------------- per-device test send (Phase 59, D-05/D-06, PUSH-01) -------------------

     EXACT literal route, body-carried endpoint (matching the DELETE route's
     no-:id family). T-59-08: no arbitrary content is accepted — the notif
     object is built SERVER-side and rides the SAME payload-shaping path as a
     real fan-out (isTest=true tags the title). Only the caller's OWN device
     row in the caller's own workspace is addressable: user_id comes from the
     session, never the body. */
  if (pathname === '/api/me/push-subscriptions/test' && method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    if (!PUSH.enabled) return fail(res, 404, 'pushUnavailable', 'Browser push is not configured');
    const body = await readJson(req).catch(() => null);
    const endpoint = body?.endpoint;
    if (!pushEndpointOk(endpoint)) return fail(res, 400, 'invalidSubscription', 'Invalid push subscription');
    const ws = await pushSubscriptionWorkspace(req, res, user, body?.workspace);
    if (!ws) return;
    const membership = await db.get('select member_id from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]);
    if (!membership) return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    const row = await db.get('select endpoint from push_subscriptions where workspace_id = ? and user_id = ? and endpoint = ?', [ws.id, user.id, endpoint]);
    if (!row) return fail(res, 404, 'notFound', 'Not found');
    const nextDoc = JSON.parse((await db.get('select doc from workspaces where id = ?', [ws.id])).doc);
    const testNotif = {
      id: `test-${uid()}`,
      type: 'mention',
      to: membership.member_id,
      by: membership.member_id, // self — the isTest path bypasses the self-skip by design
      task: null,
      at: Date.now(),
      read: true,
    };
    await sendPushFor(ws, nextDoc, [testNotif], true, endpoint);
    return json(res, 200, { ok: true });
  }

  /* ------------------- per-user saved views (Phase 57, VIEW-01/VIEW-02, D-05/D-07) ------------------- */

  /* The canonical GET body builder, shared by GET/PUT/DELETE so all three
     routes answer with the same shape: { views: { live, named: [{name, blob}] } }.
     Every stored blob is parsed leniently — corrupt JSON and old-schema blobs
     whitelist-intersect to the current field set instead of failing (D-12,
     ROADMAP SC-3) — and a stored row whose blob or schema_version normalizes
     is written back so the read path is also the migration path.
     INVARIANT (IN-03): this makes GET non-idempotent — it can UPDATE stored
     blobs (deliberate: it converges after the first request). If a
     read-replica or caching layer is ever introduced in front of these
     routes, the migration write-back must move off the GET path first. Named rows
     are only listed for the D-10 key family (tasks/mytasks); project keys
     read live state only, and a named write there is rejected at the PUT. */
  const viewsBody = async (wsId, userId, key) => {
    const liveRow = await db.get('select blob from saved_views where workspace_id = ? and user_id = ? and key = ? and name = ?', [wsId, userId, key, '']);
    let live = null;
    let liveChanged = false;
    try {
      const parsed = JSON.parse(liveRow ? liveRow.blob : 'null');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        live = sanitizeViewBlob(parsed);
        liveChanged = JSON.stringify(live) !== liveRow.blob;
      }
    } catch {
      /* corrupt stored blob: read as no live state — viewOf() defaults apply */
    }
    if (liveRow && liveChanged) await db.run('update saved_views set blob = ?, schema_version = ? where workspace_id = ? and user_id = ? and key = ? and name = ?', [JSON.stringify(live), VIEW_SCHEMA_VERSION, wsId, userId, key, '']);
    const named = [];
    if (NAMED_VIEW_KEYS.has(key)) {
      const rows = await db.all("select name, blob, schema_version from saved_views where workspace_id = ? and user_id = ? and key = ? and name != ''", [wsId, userId, key]);
      for (const row of rows) {
        let blob = {};
        let changed;
        try {
          const parsed = JSON.parse(row.blob);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            blob = sanitizeViewBlob(parsed);
            changed = JSON.stringify(blob) !== row.blob;
          } else changed = true;
        } catch {
          changed = true; /* corrupt blob: normalized to the empty whitelist blob */
        }
        if (changed) await db.run('update saved_views set blob = ?, schema_version = ? where workspace_id = ? and user_id = ? and key = ? and name = ?', [JSON.stringify(blob), VIEW_SCHEMA_VERSION, wsId, userId, key, row.name]);
        named.push({ name: row.name, blob });
      }
    }
    return { views: { live, named } };
  };

  if (pathname === '/api/me/views' && method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const wsId = String(url.searchParams.get('workspace') || '');
    const ws = wsId ? await db.get('select id from workspaces where id = ?', [wsId]) : null;
    const member = ws ? await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]) : null;
    // No-oracle: a workspace the caller is not a member of reads as not-found.
    if (!ws || !member) return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    const key = String(url.searchParams.get('key') || '');
    if (!key || key.length > 120) return fail(res, 400, 'invalidViewKey', 'Invalid view key');
    return json(res, 200, await viewsBody(ws.id, user.id, key));
  }

  if (pathname === '/api/me/views' && method === 'PUT') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    // Only body.workspace, body.key and body.blob are read; user_id always
    // comes from the session — never the body (mass-assignment discipline,
    // same as the notif-prefs PUT above). Revision-free per D-07: a view save
    // can never 409 against a concurrent doc save.
    const key = String(body?.key || '');
    const incoming = body?.blob;
    if (!key || key.length > 120) return fail(res, 400, 'invalidViewKey', 'Invalid view key');
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return fail(res, 400, 'invalidViewBlob', 'Invalid view blob');
    }
    // A `name` turns the PUT into a NAMED snapshot (replace semantics — the
    // caller sends the whole view); no name is the live-row merge from VIEW-01.
    const name = body?.name == null ? '' : String(body.name).trim();
    if (name.length > NAMED_VIEW_NAME_MAX) return fail(res, 400, 'invalidViewName', 'Invalid view name');
    // D-10: named views exist only for the tasks/mytasks keys.
    if (name && !NAMED_VIEW_KEYS.has(key)) return fail(res, 400, 'viewKeyNotNamed', 'Named views are only available on the tasks tables');
    const wsId = String(body?.workspace || '');
    const ws = wsId ? await db.get('select id from workspaces where id = ?', [wsId]) : null;
    const member = ws ? await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]) : null;
    if (!ws || !member) return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    if (name) {
      // Server-side guardrails (T-57-04, D-12): caps and case-insensitive
      // uniqueness. Overwriting the caller's OWN exact-same-name row is
      // allowed by the route even at the cap — the confirm gate is client UX.
      const clean = sanitizeViewBlob(incoming);
      const blobStr = JSON.stringify(clean);
      if (Buffer.byteLength(blobStr, 'utf8') > NAMED_VIEW_BLOB_MAX_BYTES) {
        return fail(res, 413, 'viewBlobTooLarge', 'Saved view is too large (2 kB max)');
      }
      const rows = await db.all("select name from saved_views where workspace_id = ? and user_id = ? and key = ? and name != ''", [ws.id, user.id, key]);
      const lower = name.toLowerCase();
      const dup = rows.find(r => r.name.toLowerCase() === lower);
      if (dup && dup.name !== name) return fail(res, 409, 'viewNameConflict', 'A view with this name already exists');
      if (!dup && rows.length >= NAMED_VIEW_MAX) return fail(res, 413, 'viewLimitReached', 'Saved view limit reached (20 max)');
      await db.run('insert or replace into saved_views (workspace_id, user_id, key, name, blob, schema_version) values (?,?,?,?,?,?)', [ws.id, user.id, key, name, blobStr, VIEW_SCHEMA_VERSION]);
      return json(res, 200, await viewsBody(ws.id, user.id, key));
    }
    // Merge into the existing row instead of replacing it (D-14 prohibition):
    // a partial body must never erase blob keys the caller omits. Corrupt
    // stored JSON starts clean; the whitelist intersection applies to the
    // MERGED object so a stored legacy key cannot survive forever either.
    const existingRow = await db.get('select blob from saved_views where workspace_id = ? and user_id = ? and key = ? and name = ?', [ws.id, user.id, key, '']);
    let existing = {};
    try {
      const parsed = JSON.parse(existingRow ? existingRow.blob : '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existing = parsed;
    } catch {
      /* corrupt stored blob: start from a clean object rather than crash */
    }
    const clean = sanitizeViewBlob({ ...existing, ...incoming });
    // WR-03: the whitelist constrains KEYS, not VALUES — the merged live blob
    // needs the same byte cap as a named row (the plan's own threat model:
    // "the client can never be the guard", T-57-04).
    if (Buffer.byteLength(JSON.stringify(clean), 'utf8') > NAMED_VIEW_BLOB_MAX_BYTES) {
      return fail(res, 413, 'viewBlobTooLarge', 'Saved view is too large (2 kB max)');
    }
    await db.run('insert or replace into saved_views (workspace_id, user_id, key, name, blob, schema_version) values (?,?,?,?,?,?)', [ws.id, user.id, key, '', JSON.stringify(clean), VIEW_SCHEMA_VERSION]);
    return json(res, 200, await viewsBody(ws.id, user.id, key));
  }

  /* Named-row + live-row DELETE (Phase 57 plan 02, VIEW-02/D-14): revision-free
     like the PUT (D-07), addressed by (workspace, session-user, key, name) so a
     member can only ever delete their own rows (T-57-05). name='' is the D-14
     reset half — deleting the sentinel live row so viewOf() defaults return. */
  if (pathname === '/api/me/views' && method === 'DELETE') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const wsId = String(url.searchParams.get('workspace') || '');
    const ws = wsId ? await db.get('select id from workspaces where id = ?', [wsId]) : null;
    const member = ws ? await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]) : null;
    if (!ws || !member) return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    const key = String(url.searchParams.get('key') || '');
    if (!key || key.length > 120) return fail(res, 400, 'invalidViewKey', 'Invalid view key');
    const name = String(url.searchParams.get('name') || '');
    if (name.length > NAMED_VIEW_NAME_MAX) return fail(res, 400, 'invalidViewName', 'Invalid view name');
    if (name && !NAMED_VIEW_KEYS.has(key)) return fail(res, 400, 'viewKeyNotNamed', 'Named views are only available on the tasks tables');
    await db.run('delete from saved_views where workspace_id = ? and user_id = ? and key = ? and name = ?', [ws.id, user.id, key, name]);
    return json(res, 200, await viewsBody(ws.id, user.id, key));
  }

  /* ----------------------- password change (PASS-01/02) ----------------------- */

  if (pathname === '/api/auth/password' && method === 'PATCH') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // D-40/D-41: the caller is cookie-authenticated, so the budget is keyed by
    // user_id — and every attempt below (including a wrong current password)
    // has already consumed one try before it is processed.
    if (tooMany(`pwchange|${user.id}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const cur = String(body?.currentPassword || '');
    const nw = String(body?.newPassword || '');
    if (!cur || !nw) return fail(res, 400, 'passwordRequired', 'Enter your current and new password');
    if (nw.length < 10 || !/[0-9\W]/.test(nw)) {
      return fail(res, 400, 'passwordTooWeak', 'Use at least 10 characters, including a number or symbol');
    }
    // Pitfall 9: hash the caller's own cookie — never a body or param value.
    const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    // PASS-02: verify, rehash and revoke-others are one atomic unit.
    const ok = await db.tx(async () => {
      // Pitfall 4: re-select the hash fresh inside the transaction.
      const row = await db.get('select password_hash from users where id = ?', [user.id]);
      if (!row || !verifyPassword(cur, row.password_hash)) return false;
      await db.run('update users set password_hash = ? where id = ?', [hashPassword(nw), user.id]);
      // Keep-current (P-H): the caller's own session is excluded by the != clause.
      await db.run('delete from sessions where user_id = ? and token_hash != ?', [user.id, tokenHash]);
      return true;
    });
    if (!ok) return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
    return json(res, 200, { ok: true }); // D-37: minimal payload, no revokedCount
  }

  /* ----------------------- TFA enrollment (D-46/D-47) ----------------------- */

  if (pathname === '/api/auth/tfa/enroll' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // D-49: password step-up before any secret generation. Every attempt —
    // including a wrong current password — consumes one try (D-41 precedent).
    if (tooMany(`tfa-enroll|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const cur = String(body?.currentPassword || '');
    if (!cur) return fail(res, 400, 'passwordRequired', 'Enter your current password');
    // T-16-03: a wrong password never generates a secret.
    if (!verifyPassword(cur, user.password_hash)) return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
    // TOTP2-05 (CR-01): this legacy route is the FIRST-factor path only. Once
    // factor rows exist, adding a factor requires the existing-factor step-up
    // (factors/enroll) — password-only enrollment here would let a hijacked
    // session QR-bomb itself past TOTP2-05 and stack a duplicate
    // "Primary authenticator" row.
    const factorCount = (await db.get('select count(*) as c from totp_factors where user_id = ?', [user.id])).c;
    if (factorCount > 0) return fail(res, 409, 'tfaNotEnabled', 'Additional factors use the add-factor flow');
    const secret = generateTotpSecret();
    const otpauth = buildOtpauthUri(user.email, secret);
    stashPendingTfa(user.id, secret, otpauth); // memory-only (D-46), 10-min TTL
    return json(res, 200, { secret, otpauth }); // D-48: the server owns the URI format
  }

  if (pathname === '/api/auth/tfa/enable' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // D-11: this exact budget shape is what Phase 17's login second step reuses.
    if (tooMany(`2fa-verify|${clientIp(req)}|${user.email}`, 5, 15 * 60 * 1000))
      return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const code = String(body?.code || '');
    // TFA-03 verify-before-enable: no pending entry → no enable, no state change.
    const pending = pendingTfa.get(user.id);
    if (!pending || now() > pending.expiresAt) {
      pendingTfa.delete(user.id);
      return fail(res, 409, 'noPendingEnrollment', 'Start the enrollment again — no pending setup');
    }
    // TOTP2-05 (CR-01): the legacy enable route is the FIRST-factor path only.
    // With factor rows present, the pending entry is dead weight — enabling
    // through here would stack a second verifiable factor with no
    // existing-factor step-up. The add-factor flow owns additional factors.
    if ((await db.get('select count(*) as c from totp_factors where user_id = ?', [user.id])).c > 0)
      return fail(res, 409, 'tfaNotEnabled', 'Additional factors use the add-factor flow');
    // WR-03 (double-submit race): consume the pending entry ATOMICALLY before
    // verification (WR-03 note on factors/enable). A failed verify re-stashes
    // it below — retry semantics unchanged.
    pendingTfa.delete(user.id);
    // TOTP2 (Phase 31, RESEARCH Pattern 1/Pitfall 2): the pending challenge
    // verifies the STAGED pending secret directly — NOT the shared factor
    // helper, which loads totp_factors rows and would find none on a
    // first-ever enable. The new factor carries its own null baseline (a
    // fresh row has no replay history); no users.two_fa_last_step read
    // remains here (D-08 kept-unread).
    const verified = verifyTotpCode(pending.secret, code, null, Math.floor(now() / 1000));
    if (!verified.ok) {
      pendingTfa.set(user.id, pending); // WR-03: the wrong code doesn't burn the staged setup
      return fail(res, 400, 'codeRejected', 'That code is not valid');
    }
    // D-06/T-16-09: MASTER_KEY missing/undecryptable → fail closed BEFORE any
    // state mutation. The body names MASTER_KEY — admin-facing, never user copy.
    // D-K4: the enable path is the ONLY v2 writer (frozen format, checkpoint-
    // confirmed); disable/verify/regen call sites and the boot migration keep v1.
    const envelope = encryptTotpSecret(pending.secret, 'v2');
    if (!envelope) {
      pendingTfa.set(user.id, pending); // WR-03: fail closed, not fail-lost
      return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured — 2FA cannot be enabled until the admin sets it');
    }
    // D-50: generate the 10 plaintext codes first — they are returned exactly
    // once in this response (D-53) and only their hashes hit the database.
    const codes = [];
    for (let i = 0; i < 10; i++) codes.push(generateRecoveryCode());
    // One atomic unit: flip on, write the D-05 envelope + D-04 baseline,
    // rotate recovery codes (D-53), clear the pending entry.
    await db.tx(async () => {
      await db.run('update users set two_fa_enabled = 1, two_fa_secret = ? where id = ?', [envelope, user.id]);
      // TOTP2 (Phase 31, D-06): the factor row is the single source of truth —
      // the first-ever enable inserts it alongside the users columns so the
      // any-factor verify path sees it without a reboot. First-ever semantics
      // (recovery rotation, the enable flip) are unchanged.
      await db.run('insert into totp_factors (id, user_id, name, secret, last_step, created_at) values (?,?,?,?,?,?)', [
        uid(),
        user.id,
        'settings.tfa.factor.primary',
        envelope,
        verified.matchedStep,
        now(),
      ]);
      await db.run('delete from recovery_codes where user_id = ?', [user.id]);
      for (const code0 of codes) {
        // D-09/D-51: hash of the ONE normalization (Pitfall 6) — plaintext never stored.
        await db.run('insert into recovery_codes (id, user_id, code_hash, used_at, created_at) values (?,?,?,null,?)', [
          uid(),
          user.id,
          recoveryHash(normalizeRecoveryCode(code0)),
          now(),
        ]);
      }
      // WR-03: the pending entry was already consumed before verification —
      // nothing left to clear here.
    });
    sendTfaSecurityAlert(user, 'added', 'settings.tfa.factor.primary', req);
    return json(res, 200, { ok: true, recoveryCodes: codes });
  }

  if (pathname === '/api/auth/tfa/disable' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // T-16-14: a distinct budget from the other tfa routes (D-11 band).
    if (tooMany(`tfa-disable|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const cur = String(body?.currentPassword || '');
    const code = String(body?.code || '').trim();
    if (!cur) return fail(res, 400, 'passwordRequired', 'Enter your current password');
    // D-101 (structural invariant): strict 6-digit-only gate with NO else-branch
    // and NO recovery-code lookup or verify anywhere in this route — a
    // recovery code can never satisfy the step-up. (The D-59 teardown delete
    // below is a wipe, not a lookup.)
    if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', 'Enter a 6-digit verification code');
    // Pitfall 9/D-105: hash the caller's own cookie — never a body or param value.
    const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    // One atomic unit (Pitfall 4): re-select fresh INSIDE the transaction,
    // verify password + live TOTP, and tear down on success. No writes happen
    // on any miss, so a failed verify commits nothing.
    const outcome = await db.tx(async () => {
      const fresh = await db.get('select password_hash from users where id = ?', [user.id]);
      if (!fresh || !verifyPassword(cur, fresh.password_hash)) return 'password';
      // TOTP2 (Phase 31, D-10): the step-up verifies a code from ANY enrolled
      // factor through the shared helper. D-77: every decrypt runs through
      // requireTotpSecret inside the helper — no plaintext fallback.
      // decrypted === 0 → fail closed 503 (Pitfall 3) with the D-81 route
      // copy unchanged.
      const result = await verifyTotpAgainstFactors(user.id, code, Math.floor(now() / 1000));
      if (result.decrypted === 0) return 'masterKey';
      if (!result.ok) return 'code';
      // D-04/D-09: the replay guard advances on the MATCHED FACTOR's row —
      // no users.two_fa_last_step write on this path (Pitfall 5/D-08).
      await db.run('update totp_factors set last_step = ? where id = ?', [result.matchedStep, result.factorId]);
      // D-59: complete teardown — a fresh enroll afterwards is indistinguishable
      // from a first one. two_fa_last_step resets to its NOT NULL default 0
      // (the no-baseline sentinel from Phase 14).
      await db.run("update users set two_fa_enabled = 0, two_fa_secret = '', two_fa_last_step = 0 where id = ?", [user.id]);
      // TOTP2 (Phase 31, D-06/D-18): the factor rows die with 2FA — the
      // no-half-state guarantee (a fresh enroll afterwards is indistinguishable
      // from a first one, and the boot copy's anti-join never resurrects rows).
      await db.run('delete from totp_factors where user_id = ?', [user.id]);
      await db.run('delete from recovery_codes where user_id = ?', [user.id]);
      // D-103: all pending 2FA login challenges die with 2FA — keyed on
      // user_id ONLY (an unscoped or token-keyed variant either misses rows
      // or breaks other users' in-flight logins).
      await db.run('delete from login_challenges where user_id = ?', [user.id]);
      // D-105: revoke-others, keep-current — the caller's own session is
      // excluded by the != clause against its cookie-derived hash.
      await db.run('delete from sessions where user_id = ? and token_hash != ?', [user.id, tokenHash]);
      return 'ok';
    });
    if (outcome === 'password') return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
    if (outcome === 'masterKey') return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured or the stored secret is undecryptable');
    if (outcome === 'code') return fail(res, 400, 'codeRejected', 'That code is not valid');
    // D-107: the security verb records only on committed success — after the
    // transaction, before the response.
    await logSecurity(user.id, 'tfa_disabled');
    sendTfaSecurityAlert(user, 'disabled', '', req);
    return json(res, 200, { ok: true });
  }

  /* ----------------- recovery-code regeneration (REGEN-01/02, D-85..D-100) ----------------- */

  if (pathname === '/api/auth/tfa/recovery' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // T-20-02/D-93: a distinct budget from the other tfa routes (D-11 band).
    // D-94: every attempt below — including a wrong password — has already
    // consumed one try before it is processed.
    if (tooMany(`tfa-regen|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const cur = String(body?.currentPassword || '');
    const code = String(body?.code || '').trim();
    if (!cur) return fail(res, 400, 'passwordRequired', 'Enter your current password');
    // D-85 (structural invariant): strict 6-digit-only gate with NO else-branch
    // and NO recovery_codes lookup anywhere in this route — a recovery code
    // can never satisfy the step-up.
    if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', 'Enter a 6-digit verification code');
    // D-50/D-97: generate the 10 plaintext codes first — returned exactly once
    // (D-100); only their hashes hit the database.
    const codes = [];
    for (let i = 0; i < 10; i++) codes.push(generateRecoveryCode());
    // One atomic unit (Pitfall 4/D-88): re-select fresh INSIDE the transaction,
    // verify both factors (D-86), then update the replay guard, burn-all and
    // insert-new — no writes happen on any miss.
    const outcome = await db.tx(async () => {
      const fresh = await db.get('select password_hash, two_fa_enabled from users where id = ?', [user.id]);
      if (!fresh || !fresh.two_fa_enabled) return 'notEnabled'; // D-95: before any factor check
      if (!verifyPassword(cur, fresh.password_hash)) return 'password'; // D-86: password first (D-94: try already consumed)
      // TOTP2 (Phase 31, D-10): the step-up verifies a code from ANY enrolled
      // factor through the shared helper (D-77 boundary inside; decrypted === 0
      // → fail closed 503, Pitfall 3).
      const result = await verifyTotpAgainstFactors(user.id, code, Math.floor(now() / 1000));
      if (result.decrypted === 0) return 'masterKey';
      if (!result.ok) return 'code';
      // D-87: keep the replay guard current in the SAME transaction — on the
      // MATCHED FACTOR's row (no users.two_fa_last_step write, Pitfall 5/D-08).
      await db.run('update totp_factors set last_step = ? where id = ?', [result.matchedStep, result.factorId]);
      await db.run('delete from recovery_codes where user_id = ?', [user.id]);
      for (const code0 of codes) {
        // D-97: hash of the ONE normalization (Pitfall 6) — plaintext never stored.
        await db.run('insert into recovery_codes (id, user_id, code_hash, used_at, created_at) values (?,?,?,null,?)', [
          uid(),
          user.id,
          recoveryHash(normalizeRecoveryCode(code0)),
          now(),
        ]);
      }
      // D-99: the security event shares the transaction — success-only rows.
      await logSecurity(user.id, 'tfa_recovery_regenerated');
      return 'ok';
    });
    if (outcome === 'notEnabled') return fail(res, 409, 'tfaNotEnabled', 'Enable two-factor authentication first');
    if (outcome === 'password') return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
    if (outcome === 'masterKey')
      return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured — codes cannot be regenerated until the admin sets it');
    if (outcome === 'code') return fail(res, 400, 'codeRejected', 'That code is not valid');
    return json(res, 200, { ok: true, recoveryCodes: codes }); // D-100; no-store comes from json()
  }

  /* --------------- additional TOTP factors (TOTP2-02, D-02/D-04/D-13) --------------- */

  if (pathname === '/api/auth/tfa/factors/enroll' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // Distinct budget band (D-11) from the other tfa routes; every attempt —
    // including a wrong password — has consumed one try before it is processed.
    if (tooMany(`tfa-add-enroll|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const cur = String(body?.currentPassword || '');
    const code = String(body?.code || '').trim();
    // D-02: a factor is never stored unnamed — blank after trim is a 400, and
    // an oversized label is refused before any secret is generated.
    const label = String(body?.label || '').trim();
    if (!cur) return fail(res, 400, 'passwordRequired', 'Enter your current password');
    if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', 'Enter a 6-digit verification code');
    if (!label) return fail(res, 400, 'labelRequired', 'Give this factor a name');
    if (label.length > 64) return fail(res, 400, 'labelTooLong', 'Keep the factor name under 64 characters');
    // T-16-03: a wrong password never reveals a secret.
    if (!verifyPassword(cur, user.password_hash)) return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
    // Route contract (D-04 consequence): additional factors ONLY — a
    // first-ever enrollment (zero factor rows) rides /api/auth/tfa/enroll,
    // which is password-only and carries no existing-factor step-up by design.
    const factorCount = (await db.get('select count(*) as c from totp_factors where user_id = ?', [user.id])).c;
    if (factorCount === 0) return fail(res, 409, 'tfaNotEnabled', 'Enable two-factor authentication first');
    // TOTP2-05/T-31-06: a LIVE code from an EXISTING factor is verified
    // server-side BEFORE the new secret is generated or revealed — the
    // lock-out guard against QR-bombing an hijacked session. D-14: strict
    // 6-digit shape only, no recovery lookup anywhere in this route.
    const stepUp = await verifyTotpAgainstFactors(user.id, code, Math.floor(now() / 1000));
    if (stepUp.decrypted === 0) return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured — 2FA cannot be verified until the admin sets it');
    if (!stepUp.ok) return fail(res, 400, 'codeRejected', 'That code is not valid');
    // D-04: the step-up code's replay guard advances on its matched factor.
    await db.run('update totp_factors set last_step = ? where id = ?', [stepUp.matchedStep, stepUp.factorId]);
    const secret = generateTotpSecret();
    const otpauth = buildOtpauthUri(user.email, secret);
    const stagedId = uid();
    // D-13: per-factor staging key under the SAME in-memory 10-min TTL map.
    stashPendingTfa(user.id, secret, otpauth, stagedId, label);
    return json(res, 200, { secret, otpauth, stagedId, label }); // D-48: the server owns the URI format
  }

  if (pathname === '/api/auth/tfa/factors/enable' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // D-11 budget shape — the same band the legacy enable route uses.
    if (tooMany(`2fa-verify|${clientIp(req)}|${user.email}`, 5, 15 * 60 * 1000))
      return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const code = String(body?.code || '').trim();
    const stagedId = String(body?.stagedId || '');
    // T-31-09: strict 6-digit-only gate with no recovery lookup (D-14).
    if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', 'Enter a 6-digit verification code');
    // TFA-03 verify-before-enable: no pending entry → no enable, no state
    // change. D-13: the per-factor key first; the legacy userId key is the
    // fallback — the first-ever re-enable rides /api/auth/tfa/enroll, which
    // was never re-keyed.
    let resolvedKey = stagedId ? `${user.id}:${stagedId}` : user.id;
    let pending = pendingTfa.get(resolvedKey);
    if (!pending) {
      resolvedKey = user.id;
      pending = pendingTfa.get(resolvedKey);
    }
    if (!pending || now() > pending.expiresAt) {
      pendingTfa.delete(resolvedKey);
      return fail(res, 409, 'noPendingEnrollment', 'Start the enrollment again — no pending setup');
    }
    // WR-03 (double-submit race): consume the pending entry ATOMICALLY before
    // any verification — get+delete land in the same synchronous turn, so a
    // concurrent duplicate submission finds nothing and bails with
    // noPendingEnrollment instead of inserting a second factor row. A failed
    // verify re-stashes the entry below, so the retry semantics are unchanged.
    pendingTfa.delete(resolvedKey);
    // RESEARCH Pattern 1/Pitfall 2: the staged pending secret verifies with
    // the NEW factor's own null baseline — the shared helper cannot serve
    // here (a first-ever enable has zero factor rows to load).
    const verified = verifyTotpCode(pending.secret, code, null, Math.floor(now() / 1000));
    if (!verified.ok) {
      pendingTfa.set(resolvedKey, pending); // WR-03: the wrong code doesn't burn the staged setup
      return fail(res, 400, 'codeRejected', 'That code is not valid');
    }
    // D-K4: the enable path is the ONLY v2 writer (frozen format). Fail
    // closed BEFORE any state mutation (D-58: admin-facing body copy).
    const envelope = encryptTotpSecret(pending.secret, 'v2');
    if (!envelope) {
      pendingTfa.set(resolvedKey, pending); // WR-03: fail closed, not fail-lost
      return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured — 2FA cannot be enabled until the admin sets it');
    }
    // D-02: the enroll step validated the label; a legacy-keyed pending entry
    // (first-ever re-enable) carries none and stores the primary catalogue key.
    const label = pending.label || 'settings.tfa.factor.primary';
    const wasFirst = (await db.get('select count(*) as c from totp_factors where user_id = ?', [user.id])).c === 0;
    // D-50/D-53: the plaintext codes are generated first and returned exactly
    // once — first-ever enable (or first after a disable) rotates recovery.
    const codes = wasFirst ? Array.from({ length: 10 }, () => generateRecoveryCode()) : null;
    await db.tx(async () => {
      // D-13/Pitfall 4: the factor insert (with its own baseline) and the
      // first-ever flip are ONE atomic unit — no half-state on failure.
      await db.run('insert into totp_factors (id, user_id, name, secret, last_step, created_at) values (?,?,?,?,?,?)', [
        uid(),
        user.id,
        label,
        envelope,
        verified.matchedStep,
        now(),
      ]);
      if (wasFirst) {
        // D-13: two_fa_enabled flips only for the first-ever factor;
        // D-17: the recovery rotation rides the same first-ever semantics.
        await db.run('update users set two_fa_enabled = 1 where id = ?', [user.id]);
        await db.run('delete from recovery_codes where user_id = ?', [user.id]);
        for (const code0 of codes) {
          // D-09/D-51: hash of the ONE normalization (Pitfall 6).
          await db.run('insert into recovery_codes (id, user_id, code_hash, used_at, created_at) values (?,?,?,null,?)', [
            uid(),
            user.id,
            recoveryHash(normalizeRecoveryCode(code0)),
            now(),
          ]);
        }
      }
      // WR-03: the pending entry was already consumed before verification —
      // nothing left to clear here.
    });
    // Success-only security event (D-107 discipline).
    await logSecurity(user.id, 'tfa_factor_added');
    sendTfaSecurityAlert(user, 'added', label, req);
    return json(res, 200, codes ? { ok: true, recoveryCodes: codes } : { ok: true });
  }

  if (pathname === '/api/auth/tfa/factors/remove' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // Own budget band (D-11) — removal is its own throttle surface.
    if (tooMany(`tfa-factor-remove|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const cur = String(body?.currentPassword || '');
    const code = String(body?.code || '').trim();
    const factorId = String(body?.factorId || '');
    if (!cur) return fail(res, 400, 'passwordRequired', 'Enter your current password');
    // T-16-03: a wrong password never reaches the verify.
    if (!verifyPassword(cur, user.password_hash)) return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
    // T-31-09: strict 6-digit-only gate with NO recovery lookup (D-14/D-59/D-72).
    if (!/^\d{6}$/.test(code)) return fail(res, 400, 'codeRejected', 'Enter a 6-digit verification code');
    // Ownership: an unknown or foreign factorId is a 404 before any verify.
    const target = await db.get('select id, name from totp_factors where id = ? and user_id = ?', [factorId, user.id]);
    if (!target) return fail(res, 404, 'factorNotFound', 'That factor does not exist');
    // D-15/T-31-08: with more than one factor the code must verify against a
    // factor that is NOT the removed one — self-lockout is structurally
    // impossible. D-16: no factor picker — the exclusion param, not a
    // route-level second loop. When the target is the LAST factor the removal
    // IS a disable (D-18): its own live code satisfies the disable contract,
    // so the helper runs unexcluded. Pitfall 3: zero verifiable factors →
    // fail closed 503 either way.
    // WR-01 (TOCTOU): the outside read feeds only the VERIFY exclusion; the
    // branch decision itself is re-read INSIDE the transaction below — two
    // concurrent removes both observing "2 factors" could otherwise take the
    // single-delete path twice and strand the user at 0 rows with 2FA on.
    const factorCount = (await db.get('select count(*) as c from totp_factors where user_id = ?', [user.id])).c;
    const result = await verifyTotpAgainstFactors(user.id, code, Math.floor(now() / 1000), factorCount > 1 ? target.id : null);
    if (result.decrypted === 0) return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured — 2FA cannot be verified until the admin sets it');
    if (!result.ok) return fail(res, 400, 'codeRejected', 'That code is not valid');
    // D-04: the verifying code's replay guard advances on ITS matched factor.
    await db.run('update totp_factors set last_step = ? where id = ?', [result.matchedStep, result.factorId]);
    // Pitfall 9/D-105: hash the caller's own cookie — never a body value.
    const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    await db.tx(async () => {
      // WR-01: the count is re-read inside the transaction (Pitfall 4) — the
      // branch below can no longer race a concurrent removal into a
      // 0-factors-but-2FA-on half-state.
      const freshCount = (await db.get('select count(*) as c from totp_factors where user_id = ?', [user.id])).c;
      if (freshCount > 1) {
        // D-17: single-factor removal touches NOTHING else — the target row
        // dies alone; recovery codes, sessions and 2FA itself stay.
        await db.run('delete from totp_factors where id = ? and user_id = ?', [factorId, user.id]);
      } else {
        // D-18: the LAST factor's removal IS the disable-2FA transaction —
        // the teardown block runs verbatim (users flip, recovery wipe,
        // challenge wipe, revoke-others-keep-current; D-53 rotation rides
        // the next enable). No divergent half-state path exists.
        await db.run("update users set two_fa_enabled = 0, two_fa_secret = '', two_fa_last_step = 0 where id = ?", [user.id]);
        await db.run('delete from totp_factors where user_id = ?', [user.id]);
        await db.run('delete from recovery_codes where user_id = ?', [user.id]);
        await db.run('delete from login_challenges where user_id = ?', [user.id]);
        await db.run('delete from sessions where user_id = ? and token_hash != ?', [user.id, tokenHash]);
      }
    });
    await logSecurity(user.id, 'tfa_factor_removed');
    sendTfaSecurityAlert(user, 'removed', target.name, req);
    return json(res, 200, { ok: true });
  }

  /* ----------------------- session revocation (D-26/D-27) ----------------------- */

  /* ------------------- TFA login second step (D-69, TFA-05) ------------------- */

  if (pathname === '/api/auth/tfa/login' && method === 'POST') {
    // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    // The challenge cookie (not a body-carried email) selects the budget key —
    // an attacker cannot aim the throttle at an arbitrary victim address.
    const challengeToken = parseCookies(req.headers.cookie)[CHALLENGE_COOKIE];
    const challenge = challengeToken
      ? await db.get('select lc.*, u.email as email from login_challenges lc join users u on u.id = lc.user_id where lc.challenge_token_hash = ?', [
          sha256(challengeToken),
        ])
      : null;
    if (!challenge) return fail(res, 401, 'challengeExpired', 'Your sign-in challenge has expired — start again');
    // D-11 budget shape, keyed 2fa-login|ip|email (constants match tfa/enable).
    if (tooMany(`2fa-login|${clientIp(req)}|${challenge.email}`, 5, 15 * 60 * 1000))
      return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const code = String(body?.code || '');
    // D-67/Pitfall 22b: an empty code is rejected BEFORE the transaction — it
    // consumes neither an attempt nor the challenge.
    if (!code.trim()) return fail(res, 400, 'invalidTfaCode', 'That code is not valid');

    const outcome = await db.tx(async () => {
      const fresh = await db.get('select * from login_challenges where challenge_token_hash = ?', [sha256(challengeToken)]);
      if (!fresh || fresh.expires_at <= now()) {
        await db.run('delete from login_challenges where challenge_token_hash = ?', [sha256(challengeToken)]);
        return 'dead';
      }
      // D-67 anti-race: the attempt is consumed BEFORE any code comparison, so
      // two concurrent submissions cannot both reach the verify inside budget.
      await db.run('update login_challenges set attempts = attempts + 1 where challenge_token_hash = ?', [fresh.challenge_token_hash]);
      const counted = await db.get('select attempts from login_challenges where challenge_token_hash = ?', [fresh.challenge_token_hash]);
      if (!counted || counted.attempts > 3) {
        // D-66: three wrong codes kill the challenge.
        await db.run('delete from login_challenges where challenge_token_hash = ?', [fresh.challenge_token_hash]);
        return 'dead';
      }
      const user = await db.get('select * from users where id = ?', [fresh.user_id]);
      if (!user || !user.two_fa_enabled) {
        await db.run('delete from login_challenges where challenge_token_hash = ?', [fresh.challenge_token_hash]);
        return 'dead';
      }
      let recoveryRemaining;
      if (/^\d{6}$/.test(code.trim())) {
        // D-06/D-10: the shared factor-loop verifier — an undecryptable factor
        // set fails closed before any mutation; every factor decrypt runs
        // through requireTotpSecret inside the helper (D-77), no plaintext
        // fallback. decrypted === 0 → 503 (Pitfall 3). One attempt per
        // submission regardless of factor count (D-11 — the increment above
        // already consumed it).
        const result = await verifyTotpAgainstFactors(user.id, code, Math.floor(now() / 1000));
        if (result.decrypted === 0) return 'masterKey';
        if (!result.ok) return 'code';
        // D-04/D-09: the replay guard advances on the MATCHED FACTOR's row —
        // no two_fa_last_step writes remain on this path (Pitfall 5).
        await db.run('update totp_factors set last_step = ? where id = ?', [result.matchedStep, result.factorId]);
      } else {
        // D-64/D-72 recovery shape: the race-safe conditional burn — a used
        // (or unknown) code matches zero eligible rows.
        const burn = await db.run('update recovery_codes set used_at = ? where user_id = ? and code_hash = ? and used_at is null', [
          now(),
          user.id,
          recoveryHash(normalizeRecoveryCode(code)),
        ]);
        if (burn.changes !== 1) return 'code';
        recoveryRemaining = (await db.get('select count(*) as c from recovery_codes where user_id = ? and used_at is null', [user.id])).c;
      }
      // Mint the real session verbatim (login-handler recipe) inside the same
      // transaction that deletes the challenge and burns the code (Pitfall 4).
      const token = crypto.randomBytes(32).toString('base64url');
      const t = now();
      const ua = String(req.headers['user-agent'] || '');
      const ip = clientIp(req);
      await db.run('insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)', [
        sha256(token),
        user.id,
        t,
        t + SESSION_DAYS * 86400 * 1000,
        ip,
        ua,
        t,
      ]);
      await db.run('update users set last_login_at = ? where id = ?', [t, user.id]);
      await db.run('delete from login_challenges where challenge_token_hash = ?', [fresh.challenge_token_hash]);
      return { token, user, recoveryRemaining };
    });

    // D-65: ONE generic error code for both failure shapes — no oracle.
    if (outcome === 'code') return fail(res, 400, 'invalidTfaCode', 'That code is not valid');
    if (outcome === 'masterKey') return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured — 2FA cannot be verified until the admin sets it');
    if (outcome === 'dead') {
      clearChallengeCookie(req, res);
      return fail(res, 401, 'challengeExpired', 'Your sign-in challenge has expired — start again');
    }
    setSessionCookie(req, res, outcome.token);
    clearChallengeCookie(req, res);
    // D-03/Pitfall 18: the one logical login is complete — clear the shared
    // password budget and this challenge's code budget. The pending branch
    // never reaches here, so the budget carries across the two steps.
    for (const key of [`${clientIp(req)}|${challenge.email}`, `2fa-login|${clientIp(req)}|${challenge.email}`]) attempts.delete(key);
    const payload = { user: await userPayload(outcome.user) };
    if (outcome.recoveryRemaining !== undefined) payload.recoveryRemaining = outcome.recoveryRemaining;
    return json(res, 200, payload);
  }

  /* --------------------- TOTP2: factor list (TOTP2-01 slice) --------------------- */

  if (pathname === '/api/auth/tfa/factors' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    /* WR-02: NO throttle on this read-only GET — the client refreshes it on
       every settings-tab visit and after every mutation, so a 5/15-min budget
       429s into a silently emptied factor list (indistinguishable from
       removal). It leaks nothing (names + steps only, owner-gated), matching
       the unthrottled /api/auth/sessions GET. */
    /* T-31 trust boundary: names + steps only — a secret never leaves the
       server. Last-used is derived at display time from the replay guard's
       matched step (RESEARCH A3): step * period seconds; 0 = never used. */
    const rows = await db.all('select id, name, last_step, created_at from totp_factors where user_id = ? order by created_at', [user.id]);
    return json(res, 200, {
      factors: rows.map(r => ({ id: r.id, name: r.name, createdAt: r.created_at, lastStep: r.last_step })),
    });
  }

  if (pathname === '/api/auth/sessions' && method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    const rows = await db.all(
      `select token_hash, created_at, last_seen_at, ip, user_agent
         from sessions where user_id = ? and expires_at > ? order by created_at desc`,
      [user.id, now()],
    );
    return json(res, 200, {
      sessions: rows.map(r => ({
        id: r.token_hash.slice(0, 12), // D-27: opaque 12-char prefix — the full hash never leaves the server
        userAgent: r.user_agent,
        ip: r.ip,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at, // may be NULL for pre-upgrade rows; the client falls back to createdAt (D-25)
        current: r.token_hash === tokenHash,
      })),
    });
  }

  if (pathname === '/api/auth/sessions/others' && method === 'DELETE') {
    /* Exact-string match BEFORE the :id regex below — 'others' is not hex, but the
       ordering is the auth family convention and defensive against regex loosening. */
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    // Keep-current (P-H): the caller's own session is excluded by the != clause.
    const del = await db.run('delete from sessions where user_id = ? and token_hash != ?', [user.id, tokenHash]);
    const left = await db.get('select count(*) as n from sessions where user_id = ? and expires_at > ?', [user.id, now()]);
    return json(res, 200, { revoked: del.changes, remaining: left.n }); // live post-delete counts (Pitfall 10)
  }

  /* ------------------------- MCP API keys (MCP-01) -----------------------
     The keys live in the api_keys table; only the sha256 hash is stored.
     Creation happens behind the FULL browser session (login + 2FA +
     sameOrigin) — the key is returned exactly once in the POST response,
     then only its prefix is ever readable. A key is pinned to ONE
     workspace the user belongs to and carries a MANDATORY expiry. */
  if (pathname === '/api/keys' && method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    const rows = await db.all('select * from api_keys where user_id = ? order by created_at desc', [user.id]);
    const wsName = async id => (await db.get('select name from workspaces where id = ?', [id]))?.name || null;
    return json(res, 200, {
      keys: await Promise.all(
        rows.map(async r => ({
          id: r.id,
          label: r.label,
          prefix: r.prefix,
          scope: r.scope,
          workspaceId: r.workspace_id,
          workspaceName: await wsName(r.workspace_id),
          createdAt: r.created_at,
          expiresAt: r.expires_at,
          lastUsedAt: r.last_used_at,
          revokedAt: r.revoked_at,
          expired: r.expires_at <= now(),
        })),
      ),
      days: API_KEY_DAYS,
    });
  }

  if (pathname === '/api/keys' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readJson(req);
    const label = String(body?.label || '')
      .trim()
      .slice(0, 60);
    if (!label) return fail(res, 400, 'keyLabelRequired', 'Enter a label for this key');
    const scope = validKeyScope(String(body?.scope || ''));
    if (!scope) return fail(res, 400, 'invalidScope', 'Scope must be read or write');
    const days = validKeyDays(body?.days);
    if (!days) return fail(res, 400, 'invalidExpiry', `Expiry must be one of: ${API_KEY_DAYS.join(', ')} days`);
    const wsId = String(body?.workspaceId || '');
    const membership = await membershipOf(wsId, user.id);
    if (!membership) return fail(res, 403, 'notAMember', 'You are not a member of that workspace');
    const { key, prefix, hash } = generateApiKey();
    const id = uid();
    await db.run('insert into api_keys (id, user_id, workspace_id, label, key_hash, prefix, scope, created_at, expires_at) values (?,?,?,?,?,?,?,?,?)', [
      id,
      user.id,
      wsId,
      label,
      hash,
      prefix,
      scope,
      now(),
      now() + days * 24 * 60 * 60 * 1000,
    ]);
    logSecurity(user.id, 'api_key_created');
    logInfo(`api key "${label}" (${scope}, ${days}d) created by ${user.email} for workspace ${membership.workspace_id}`);
    await db.run(
      'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
      [uid(), user.id, id, 'api_key_created', 0, clientIp(req), wsId, user.name, user.email, label, 'api-key', now()],
    );
    /* The raw key rides THIS response only — never stored, never logged. */
    return json(res, 201, { id, key, prefix, scope, days });
  }

  const keyMatch = pathname.match(/^\/api\/keys\/([A-Za-z0-9_-]+)$/);
  if (keyMatch && method === 'DELETE') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    /* Soft revoke: the row stays for the audit trail and last-used metadata. */
    const row = await db.get('select * from api_keys where id = ? and user_id = ?', [keyMatch[1], user.id]);
    if (!row) return fail(res, 404, 'keyNotFound', 'API key not found');
    if (!row.revoked_at) {
      await db.run('update api_keys set revoked_at = ? where id = ?', [now(), row.id]);
      logSecurity(user.id, 'api_key_revoked');
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), user.id, row.id, 'api_key_revoked', 0, clientIp(req), row.workspace_id, user.name, user.email, row.label, 'api-key', now()],
      );
    }
    return json(res, 200, { revoked: true });
  }

  /* =====================================================================
     SETTINGS (SET-01/SET-02, phase 95-02) — the My Access aggregate.
     Cross-workspace read: the caller's member workspaces via membershipsOf
     (READ-ONLY call — the function body and its call-site set are
     byte-pinned by test/xws-gate.test.mjs; this route ADDS one caller,
     it widens nothing). Per workspace, the visibility funnel is copied
     VERBATIM from the /me/visibility handler above: same superOwner
     short-circuit, same memberCanReadProject walk, same
     projectAccessReason ?? 'member' fallback, same single-teamName block.
     The existing handler is NOT touched — its {projects:[{id,name,reason
     [,teamName]}]} shape is pinned by members.js:95 and the self-visibility
     tests. icon/color/role are ADDITIVE display fields (omitted when
     absent); workspaces whose filtered project list is empty are omitted
     (D-07: empty workspaces hidden).
     ===================================================================== */
  if (pathname === '/api/settings/my-access' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    const rows = await membershipsOf(user.id);
    const workspaces = [];
    for (const row of rows) {
      let doc;
      try {
        doc = JSON.parse(row.doc);
      } catch {
        continue;
      }
      normalizeProjects(doc);
      const myId = row.member_id || null;
      const memberTeams = await teamsOfMember(row.id, myId, row);
      /* [2026-11-24] superOwner union copied verbatim from /me/visibility:
         synthetic operator membership only — a real owner stays blind to
         private projects they are not on (D-50-5, privacy.test.mjs:236). */
      const superOwner = ROLE_RANK[row.role] >= ROLE_RANK.owner && row.member_id === null;
      const projects = [];
      for (const p of doc?.data?.projects || []) {
        if (!p?.id) continue;
        if (!superOwner && !(await memberCanReadProject(p, row.id, myId))) continue;
        const reason = superOwner ? 'member' : projectAccessReason(p, myId, memberTeams) ?? 'member';
        const entry = { id: p.id, name: p.name || p.id, reason };
        if (reason === 'team') {
          const tid = memberTeams.find(t => Array.isArray(p.teams) && p.teams.includes(t));
          const tName = (Array.isArray(doc?.data?.teams) ? doc.data.teams : []).find(tm => tm?.id === tid)?.name;
          if (tName) entry.teamName = String(tName);
        }
        /* Additive display fields (T-95-06): raw p.icon/p.color ride through
           and the CLIENT normalizes against PCOLORS (store.js pColor); role
           feeds the D-08 badge from the caller's own membership row. */
        if (p.icon) entry.icon = p.icon;
        if (p.color) entry.color = p.color;
        entry.role = row.role;
        projects.push(entry);
      }
      if (projects.length) workspaces.push({ id: row.id, name: row.name, slug: row.slug, projects });
    }
    return json(res, 200, { workspaces });
  }

  /* SET-03 (phase 95-02, D-09/D-10): the honest revoked-key purge. Own keys
     only, revoked rows only (expired-but-not-revoked is NOT purgeable), one
     audit event carrying the COUNT only — no key values, labels, hashes or
     prefixes anywhere (D-10). Guard chain order sameOrigin → requireUser →
     tooMany never reordered (T-95-04). */
  if (pathname === '/api/keys/purge-revoked' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (tooMany(`keypurge|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const del = await db.run('delete from api_keys where user_id = ? and revoked_at is not null', [user.id]);
    logSecurity(user.id, 'api_key_purged');
    await db.run(
      'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
      [uid(), user.id, user.id, 'api_key_purged', 0, clientIp(req), null, user.name, user.email, String(del.changes), 'api-key', now()],
    );
    return json(res, 200, { removed: del.changes });
  }

  /* =====================================================================
     PROJECT WEBHOOKS — hook CRUD (67-03, WHK-01/D-08/D-10/D-11/D-12).
     Funnel per route: requireWorkspace → sameOrigin → project from the
     doc (404 parity) → canManageProject on EVERY route (the server gate
     is the control, T-52-02; D-08 gates the whole section) → validate →
     write. The Workflows URL is itself a bearer credential and the
     secret signs deliveries — both stay server-side except the one D-10
     create response; log lines carry hook id + host only, never URL or
     secret (T-67-03/T-67-08). No MCP route exists for this family
     (documented out of scope, WHK-01).
     ===================================================================== */
  const webhookProjectFor = async (ctx, projectId) => {
    /* the docForClient read is the ONLY doc reference these routes make
       (same discipline as the export funnel, D-54-1) */
    const doc = await docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership);
    return (Array.isArray(doc?.data?.projects) ? doc.data.projects : []).find(p => p?.id === projectId) || null;
  };

  const whListMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/projects\/([A-Za-z0-9_-]{1,64})\/webhooks$/);
  if (whListMatch && (method === 'GET' || method === 'POST')) {
    const ctx = await requireWorkspace(req, res, whListMatch[1], 'viewer');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const project = await webhookProjectFor(ctx, whListMatch[2]);
    if (!project) return fail(res, 404, 'projectNotFound', 'Project not found');
    if (!canManageProject(project, ctx.membership.member_id, ctx.membership.role)) {
      return fail(res, 403, 'webhookError', 'You do not have permission to manage webhooks for this project');
    }
    if (method === 'GET') {
      const rows = await db.all('select * from webhook_hooks where workspace_id = ? and project_id = ? order by created_at', [ctx.ws.id, project.id]);
      const hooks = [];
      for (const r of rows) hooks.push(webhookHookView(r, await webhookHookHealth(r.id, r.status)));
      return json(res, 200, { hooks });
    }
    // POST — create. Each call creates a NEW hook (WHK-01 idempotency edge:
    // there is no natural dedup key, no auto-merge). Creation always lands
    // 'active' with the D-12 default format.
    const body = await readJson(req);
    /* T-67-09: the body is consulted for url/format/events ONLY —
       workspace_id, project_id and created_by come from the ctx below. */
    const v = webhookValidateBody(body, { requireUrl: true });
    if (v.error) return fail(res, 400, v.error[0], v.error[1]);
    const f = v.fields;
    const id = uid();
    const secret = crypto.randomBytes(32).toString('hex');
    await db.run('insert into webhook_hooks (id, workspace_id, project_id, url, secret, format, events, status, created_by, created_at) values (?,?,?,?,?,?,?,?,?,?)', [
      id,
      ctx.ws.id,
      project.id,
      f.url,
      secret,
      f.format || 'teams-adaptive',
      JSON.stringify(f.events),
      'active',
      ctx.membership.member_id || ctx.user.id,
      now(),
    ]);
    logInfo(`webhook hook ${id} created for project ${project.id} in ws ${ctx.ws.id} (host ${new URL(f.url).host})`);
    const row = await db.get('select * from webhook_hooks where id = ?', [id]);
    /* D-10: the raw secret rides THIS response only — never a list/patch
       response, never a log line, never the client doc. */
    return json(res, 201, { hook: webhookHookView(row, 'active'), secret });
  }

  const whHookMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/projects\/([A-Za-z0-9_-]{1,64})\/webhooks\/([A-Za-z0-9_-]{1,64})$/);
  if (whHookMatch && (method === 'PATCH' || method === 'DELETE')) {
    const ctx = await requireWorkspace(req, res, whHookMatch[1], 'viewer');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const project = await webhookProjectFor(ctx, whHookMatch[2]);
    if (!project) return fail(res, 404, 'projectNotFound', 'Project not found');
    if (!canManageProject(project, ctx.membership.member_id, ctx.membership.role)) {
      return fail(res, 403, 'webhookError', 'You do not have permission to manage webhooks for this project');
    }
    /* scope: workspace + project — a hook id from another ws/project 404s. */
    const hook = await db.get('select * from webhook_hooks where id = ? and workspace_id = ? and project_id = ?', [whHookMatch[3], ctx.ws.id, project.id]);
    if (!hook) return fail(res, 404, 'webhookError', 'Webhook not found');
    if (method === 'DELETE') {
      /* Backstop: historical delivery rows stay (audit trail, D-06/POL-02);
         the engine dead-letters any pending row for a missing hook. */
      await db.run('delete from webhook_hooks where id = ?', [hook.id]);
      logInfo(`webhook hook ${hook.id} deleted from project ${project.id} in ws ${ctx.ws.id}`);
      return json(res, 200, { deleted: true });
    }
    // PATCH — validate only the provided fields; the last committed PATCH
    // wins (last-write-wins concurrency edge — one statement, no merge).
    const body = await readJson(req);
    const v = webhookValidateBody(body);
    if (v.error) return fail(res, 400, v.error[0], v.error[1]);
    const f = v.fields;
    await db.run('update webhook_hooks set url = ?, format = ?, events = ?, status = ? where id = ?', [
      f.url ?? hook.url,
      f.format ?? hook.format,
      f.events !== undefined ? JSON.stringify(f.events) : hook.events,
      f.status ?? hook.status,
      hook.id,
    ]);
    const row = await db.get('select * from webhook_hooks where id = ?', [hook.id]);
    return json(res, 200, { hook: webhookHookView(row, await webhookHookHealth(row.id, row.status)) });
  }

  const whTestMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/projects\/([A-Za-z0-9_-]{1,64})\/webhooks\/([A-Za-z0-9_-]{1,64})\/test$/);
  if (whTestMatch && method === 'POST') {
    const ctx = await requireWorkspace(req, res, whTestMatch[1], 'viewer');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const project = await webhookProjectFor(ctx, whTestMatch[2]);
    if (!project) return fail(res, 404, 'projectNotFound', 'Project not found');
    if (!canManageProject(project, ctx.membership.member_id, ctx.membership.role)) {
      return fail(res, 403, 'webhookError', 'You do not have permission to manage webhooks for this project');
    }
    const hook = await db.get('select * from webhook_hooks where id = ? and workspace_id = ? and project_id = ?', [whTestMatch[3], ctx.ws.id, project.id]);
    if (!hook) return fail(res, 404, 'webhookError', 'Webhook not found');
    if (hook.status !== 'active') return fail(res, 409, 'webhookError', 'Enable the hook before sending a test');
    const body = await readJson(req);
    const event = String(body?.event || '');
    if (!WEBHOOK_EVENTS.includes(event)) return fail(res, 400, 'webhookError', 'Unknown webhook event');
    /* D-11: fixed sample content (planner discretion) — the envelope
       whitelist (EVENT_FIELDS) keeps only what the event needs. */
    const sampleCtx = {
      event,
      taskId: 'sample-task-1',
      title: 'Sample task',
      status: 'todo',
      done: false,
      assignees: [],
      commentId: 'sample-comment-1',
      taskTitle: 'Sample task',
      body: 'This is a test payload sent from Projects Studio.',
      due: new Date(now()).toISOString(),
      offset: 0,
      projectId: project.id,
      projectName: project.name || '',
      authorName: ctx.user.name || null,
    };
    const sampleSubject = `test-${uid()}`; // D-11: per-call nonce — each button press sends (exempt from the exactly-once subject dedup)
    try {
      await db.tx(async () => {
        await enqueueWebhookDelivery({ hookId: hook.id, workspaceId: ctx.ws.id, event, subjectId: sampleSubject, ctxJson: JSON.stringify(sampleCtx) });
      });
    } catch (err) {
      logWarn(`webhook test enqueue hook ${hook.id}: ${err.message}`);
      return fail(res, 500, 'webhookError', 'Could not enqueue the test delivery');
    }
    const delivery = await db.get('select * from webhook_deliveries where dedup_key = ?', [`${hook.id}:${event}:${sampleSubject}`]);
    if (!delivery) return fail(res, 500, 'webhookError', 'Could not enqueue the test delivery');
    /* T-67-10: the test rides the IDENTICAL guarded pipeline as real
       events — deliverWebhook re-checks ssrfOk per attempt, signs with the
       hook secret, and the fetch carries the same 10 s timeout. No bypass
       path exists. Awaited here: the caller wants the immediate result. */
    const tokenOk = process.env.WEBHOOK_TEST_TOKEN && req.headers['x-webhook-token'] === process.env.WEBHOOK_TEST_TOKEN;
    const fetchFn = tokenOk && body?.fetch ? webhookTestFetch(body.fetch, []) : undefined;
    const lookup = tokenOk && body?.lookup ? webhookTestLookup(body.lookup) : undefined;
    const atMs = tokenOk && Number.isFinite(body?.now) ? body.now : now();
    try {
      await deliverWebhook(delivery, atMs, fetchFn, lookup);
    } catch (err) {
      logWarn(`webhook test delivery ${delivery.id}: ${err.message}`);
    }
    const after = await db.get('select status, last_status_code, last_error from webhook_deliveries where id = ?', [delivery.id]);
    /* the test delivery row stays for the badge/audit; D-07 purges it. */
    return json(res, 200, { ok: after?.status === 'delivered', statusCode: after?.last_status_code ?? null, error: after?.last_error || null });
  }

  const sessionMatch = pathname.match(/^\/api\/auth\/sessions\/([0-9a-f]{12})$/);
  if (sessionMatch && method === 'DELETE') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // P-F: always scoped to the caller's user_id — a foreign id can never be revoked.
    await db.run('delete from sessions where user_id = ? and token_hash like ?', [user.id, `${sessionMatch[1]}%`]);
    return json(res, 204); // idempotent: an already-dead or foreign id is not an error (OQ4)
  }

  /* ----------------------- audit trail read (AUD-03, D-T3) -----------------------
     Read-only trail endpoint. Gate order mirrors the D-121 operator-users GET
     precedent: sameOrigin → requireUser → tier gate, NO throttle (read-only,
     capped at 101 rows per query — T-24-05 accept). Visibility is decided
     SERVER-side, never from a query param (D-T3/T-24-06):
       - instance operator (D-112 DB flag): every row, workspace-less included;
       - workspace admin/owner: only rows whose workspace_id is one of their
         admin-or-owner memberships (workspace_id null rows never leave);
       - anyone else: 403 adminOnly (honest gate, D-V1). */
  if (pathname === '/api/audit-log' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;

    const where = [];
    const args = [];
    // The verb filter compares against the two fixed D-T1 verbs only; any other
    // value matches zero rows rather than erroring (flagged AUD-03 assumption).
    if (url.searchParams.get('verb')) {
      if (url.searchParams.get('verb') === 'sessions_revoked_by_operator') {
        where.push('action = ?');
        args.push('sessions_revoked_by_operator');
      } else if (url.searchParams.get('verb') === 'sessions_revoked_by_workspace_admin') {
        where.push('action = ?');
        args.push('sessions_revoked_by_workspace_admin');
      } else {
        where.push('0'); // unknown verb → empty result, never a 400
      }
    }

    if (isInstanceAdmin(user)) {
      // Operators see the whole trail — workspace-less operator-tier rows included.
    } else {
      const adminWsIds = (await membershipsOf(user.id)).filter(m => ROLE_RANK[m.role] >= ROLE_RANK.admin).map(m => m.id);
      if (!adminWsIds.length) return fail(res, 403, 'adminOnly', 'Only workspace admins can do that');
      where.push(`workspace_id in (${adminWsIds.map(() => '?').join(',')})`);
      args.push(...adminWsIds);
    }

    // Keyset cursor (RESEARCH Pattern 2): (created_at, id) < (before, beforeId),
    // latest first — forward-stable for an append-only trail (flagged assumption).
    const beforeTs = Number(url.searchParams.get('before'));
    const beforeId = url.searchParams.get('beforeId');
    if (Number.isFinite(beforeTs) && beforeId) {
      where.push('(created_at < ? or (created_at = ? and id < ?))');
      args.push(beforeTs, beforeTs, beforeId);
    }

    const clause = where.length ? `where ${where.join(' and ')}` : '';
    // 101st row = cursor for the next page; only 100 are served.
    const rows = await db.all(`select * from audit_log ${clause} order by created_at desc, id desc limit 101`, args);
    const nextBefore = rows.length > 100 ? { created_at: rows[100].created_at, id: rows[100].id } : null;
    return json(res, 200, { rows: rows.slice(0, 100), nextBefore });
  }

  /* -------------- operator session revocation (OPREV-01, D-115) -------------- */

  const operatorUsersMatch = pathname === '/api/auth/operator/users';
  if (operatorUsersMatch && method === 'GET') {
    // D-121: read route — sameOrigin → requireUser → operator gate. NO throttle
    // (read-only, no oracle: the payload exposes only the five D-121 fields).
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const rows = await db.all('select id, name, email, is_instance_admin, last_login_at from users order by created_at');
    return json(res, 200, {
      users: rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        is_instance_admin: r.is_instance_admin,
        last_login_at: r.last_login_at,
      })),
    });
  }

  const operatorRevokeMatch = pathname.match(/^\/api\/auth\/operator\/users\/([A-Za-z0-9_-]{1,64})\/revoke-sessions$/);
  if (operatorRevokeMatch && method === 'POST') {
    // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    // D-116: keyed on the caller, and every attempt — including 403 refusals —
    // consumes a try, because tooMany increments before any gate decision.
    if (tooMany(`operator-revoke|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    // D-112: the gate reads the DB flag only — never env matching, never workspace role.
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const target = await db.get('select id, name, email, is_instance_admin from users where id = ?', [operatorRevokeMatch[1]]);
    if (!target) return fail(res, 404, 'notFound', 'Not found');
    // D-119: owner immunity BEFORE any session lookup — other flagged owners are
    // untouchable. A self-target is allowed (D-118): it is exactly revoke-others.
    if (target.is_instance_admin && target.id !== operator.id) return fail(res, 403, 'ownerImmune', 'Owner accounts are immune to operator revocation');
    // D-118/Keep-current (P-H): ONE statement — the operator's own session is
    // excluded by the != clause; for any other target the hashes differ, so
    // every target session goes.
    const operatorTokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    // AUD-01: the audit row must be written in the SAME transaction as the
    // session DELETE (D-R3 — db.tx(), never hand-rolled
    // BEGIN/COMMIT). A forced audit failure rolls back the entire revocation.
    const out = await db.tx(async () => {
      const del = await db.run('delete from sessions where user_id = ? and token_hash != ?', [target.id, operatorTokenHash]);
      const remaining = await db.get('select count(*) as n from sessions where user_id = ? and expires_at > ?', [target.id, now()]);
      if (del.changes > 0) {
        await logSecurity(target.id, 'sessions_revoked_by_operator');
        await db.run(
          'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
          [
            uid(),
            operator.id,
            target.id,
            'sessions_revoked_by_operator',
            del.changes,
            clientIp(req),
            null,
            operator.name,
            operator.email,
            target.name,
            target.email,
            now(),
          ],
        );
      }
      return { revoked: del.changes, remaining: remaining.n };
    });
    return json(res, 200, out); // live post-delete counts (Pitfall 10)
  }

  /* Phase 78 (WSG-06, D-78-2): operator promote/demote — the console-managed
     multi-seat identity. Same D-121 POST shape (Pitfall 22: sameOrigin FIRST,
     then requireUser, then the operator gate BEFORE the target lookup so an
     unknown id is a no-oracle 404 for non-operators too). Throttle omitted —
     low-frequency console writes, matching the read-route precedent. */
  const operatorFlagMatch = pathname.match(/^\/api\/auth\/operator\/users\/([A-Za-z0-9_-]{1,64})\/(promote|demote)$/);
  if (operatorFlagMatch && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    // D-112: the gate reads the DB flag only — never workspace role, never env.
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const target = await db.get('select id, name, email, is_instance_admin from users where id = ?', [operatorFlagMatch[1]]);
    if (!target) return fail(res, 404, 'notFound', 'Not found');
    const promoting = operatorFlagMatch[2] === 'promote';
    // Idempotency (research Q3): an already-in-state target is a 200 no-op —
    // the console stays honest without inventing a second error key.
    if (target.is_instance_admin === (promoting ? 1 : 0)) {
      return json(res, 200, { user: { id: target.id, is_instance_admin: target.is_instance_admin } });
    }
    // Last-operator guard (needOwner analog): count BEFORE the UPDATE — the
    // instance always keeps at least one operator. Demote-self with other
    // operators present is legal; this guard is the safety net.
    if (!promoting) {
      const count = (await db.get('select count(*) as n from users where is_instance_admin = 1')).n;
      if (count <= 1) return fail(res, 409, 'lastOperator', 'The instance needs at least one operator');
    }
    // AUD-01/D-R3: the flag UPDATE and the audit row share ONE db.tx — a
    // forced audit failure rolls back the promotion/demotion (no write ever
    // lands un-logged).
    const out = await db.tx(async () => {
      await db.run('update users set is_instance_admin = ? where id = ?', [promoting ? 1 : 0, target.id]);
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          uid(),
          operator.id,
          target.id,
          promoting ? 'operator_promoted' : 'operator_demoted',
          0,
          clientIp(req),
          null,
          operator.name,
          operator.email,
          target.name,
          target.email,
          now(),
        ],
      );
      return { user: { id: target.id, is_instance_admin: promoting ? 1 : 0 } };
    });
    logInfo(`operator ${promoting ? 'promoted' : 'demoted'}: ${target.email} by ${operator.email}`);
    return json(res, 200, out);
  }

  /* -------------- operator workspace governance (Phase 79, WSG-07/WSG-08) --------------
     D-10: a NEW route family under /api/auth/operator/workspaces — the user-facing
     /api/workspaces family is NOT extended. Guard order mirrors the Phase 78
     operator-users family verbatim (Pitfall 22: sameOrigin FIRST, before any body
     read or throttle; then requireUser; then the operator gate BEFORE any target
     lookup, so an unknown id stays a no-oracle exact-403 operatorOnly for
     non-operators — D-09). Governance routes NEVER ride requireWorkspace
     (Pitfall 3): rows are fetched by id, so an archived workspace stays
     actionable (unarchive is possible) and a non-member operator gets real data. */

  if (pathname === '/api/auth/operator/workspaces' && method === 'GET') {
    // D-09: read route — sameOrigin → requireUser → operator gate. NO throttle
    // (read-only, Phase 78 read precedent).
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    // WSG-07: EVERY workspace on the instance — including ones the operator holds
    // no membership in. Creator is derived from the owner-membership join ONLY:
    // no created_by column exists (Pitfall 1); null when the owner membership is
    // gone. memberCount is a scalar subquery so zero-member rows survive the join.
    const rows = await db.all(`select w.id, w.slug, w.name, w.archived, w.created_at,
        (select count(*) from memberships m where m.workspace_id = w.id) as member_count,
        owner_u.name as creator_name, owner_u.email as creator_email
      from workspaces w
      left join memberships owner_m on owner_m.workspace_id = w.id and owner_m.role = 'owner'
      left join users owner_u on owner_u.id = owner_m.user_id
      order by w.created_at, w.name collate nocase`);
    return json(res, 200, {
      workspaces: rows.map(r => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        archived: !!r.archived,
        createdAt: r.created_at,
        memberCount: r.member_count,
        creator: r.creator_name ? { name: r.creator_name, email: r.creator_email } : null,
      })),
    });
  }

  const operatorWsFlagMatch = pathname.match(/^\/api\/auth\/operator\/workspaces\/([A-Za-z0-9_-]{1,64})\/(archive|unarchive)$/);
  if (operatorWsFlagMatch && method === 'POST') {
    // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    // Pitfall 10: throttle keyed on the operator (never per-IP) — the single
    // legitimate operator is never locked out; every attempt consumes a try.
    if (tooMany(`op-ws-archive|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    // T-79-07/D-09: the gate runs BEFORE any target lookup (no existence oracle).
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const ws = await db.get('select id, slug, name, archived from workspaces where id = ?', [operatorWsFlagMatch[1]]);
    if (!ws) return fail(res, 404, 'notFound', 'Not found');
    const archiving = operatorWsFlagMatch[2] === 'archive';
    // D-07: archiving triggers NO orphan flow — member rows stay frozen.
    // AUD-01/D-R3: the flag write and the audit row share ONE db.tx.
    await db.tx(async () => {
      await db.run('update workspaces set archived = ? where id = ?', [archiving ? 1 : 0, ws.id]);
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), operator.id, ws.id, archiving ? 'workspace_archived' : 'workspace_unarchived', 0, clientIp(req), ws.id, operator.name, operator.email, ws.name, ws.slug, now()],
      );
    });
    await logSecurity(operator.id, archiving ? 'workspace_archived' : 'workspace_unarchived');
    logInfo(`workspace ${archiving ? 'archived' : 'unarchived'} "${ws.name}" (slug: ${ws.slug}) by ${operator.email}`);
    return json(res, 200, { workspace: { id: ws.id, slug: ws.slug, name: ws.name, archived: archiving } });
  }

  const operatorWsRenameMatch = pathname.match(/^\/api\/auth\/operator\/workspaces\/([A-Za-z0-9_-]{1,64})\/rename$/);
  if (operatorWsRenameMatch && method === 'POST') {
    // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    // Pitfall 10: throttle keyed on the operator (never per-IP) — the single
    // legitimate operator is never locked out; every attempt consumes a try.
    if (tooMany(`op-ws-rename|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    // T-83-01: the gate runs BEFORE any target lookup (no existence oracle —
    // real and fake ids answer identically).
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    // Fetched by id, NEVER requireWorkspace: archived rows stay renameable —
    // planner decision per 83-CONTEXT discretion (same reachability as
    // archive/unarchive).
    const ws = await db.get('select id, slug, name, archived from workspaces where id = ?', [operatorWsRenameMatch[1]]);
    if (!ws) return fail(res, 404, 'notFound', 'Not found');
    const body = await readJson(req);
    // D-04: the workspace-creation slug rules reused VERBATIM — explicit
    // refusal literals at this call site (reverse-parity precedent).
    const name = String(body?.name || '')
      .trim()
      .slice(0, 60);
    if (!name) return fail(res, 400, 'workspaceNameRequired', 'Enter a workspace name');
    const next = sanitizeSlug(body?.slug);
    if (!next) return fail(res, 400, 'invalidSlug', 'Use 2–40 lowercase letters, numbers, or hyphens');
    // Pitfall 1: self-collision excluded — the row's own unchanged slug passes.
    if (next !== ws.slug && (await wsBySlug(next))) {
      return fail(res, 409, 'slugTaken', 'That URL is already taken', { suggestion: await uniqueSlug(next, ws.id) });
    }
    await db.run('update workspaces set name = ?, slug = ?, updated_at = ? where id = ?', [name, next, now(), ws.id]);
    // D-06: logInfo only — NO audit_log row (the `workspace deleted
    // (governance)` precedent). Old→new slug visible per the convention.
    logInfo(`workspace renamed "${ws.name}" (${ws.slug}) → "${name}" (${next}) (governance) by ${operator.email}`);
    return json(res, 200, { workspace: { id: ws.id, slug: next, name } });
  }

  const operatorWsDeleteMatch = pathname.match(/^\/api\/auth\/operator\/workspaces\/([A-Za-z0-9_-]{1,64})\/delete$/);
  if (operatorWsDeleteMatch && method === 'POST') {
    // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    if (tooMany(`op-ws-delete|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const ws = await db.get('select * from workspaces where id = ?', [operatorWsDeleteMatch[1]]);
    if (!ws) return fail(res, 404, 'notFound', 'Not found');
    // D-03 FIRST (Pitfall 5 — a DIFFERENT refusal from dispositions): the
    // empty-only check runs on the RAW stored doc; the doc IS the content store.
    let doc = null;
    try {
      doc = JSON.parse(ws.doc);
    } catch {
      /* a corrupt doc is treated as empty — D-03 judges the raw content only */
    }
    const projects = Array.isArray(doc?.data?.projects) ? doc.data.projects : [];
    const hasTasks = projects.some(p => p && Array.isArray(p.tasks) && p.tasks.length > 0);
    if (projects.length > 0 || hasTasks) {
      return fail(res, 409, 'workspaceNotEmpty', 'This workspace has projects and cannot be deleted. Archive it instead.');
    }
    // D-06: block-until-resolved — every member needs a disposition; 'release'
    // counts as resolved. The server re-checks regardless of client state (T-79-02).
    const body = await readJson(req);
    const dispositions = Array.isArray(body?.dispositions) ? body.dispositions : null;
    if (!dispositions) return fail(res, 400, 'invalidBody', 'Invalid request body');
    const members = await membersOf(ws.id);
    const byUser = new Map();
    for (const d of dispositions) if (d && typeof d === 'object') byUser.set(String(d.userId || ''), d);
    if (members.some(m => !byUser.has(m.user_id))) {
      return fail(res, 409, 'dispositionRequired', 'Every member needs a destination or release before deleting.');
    }
    // T-79-02 (mass-assignment guard): role whitelisted against the D-08 domain
    // ('owner','admin','member') — viewer excluded; target must exist and must
    // not already hold the user (memberships PK (workspace_id,user_id), Pitfall 6).
    const GOV_ROLES = ['owner', 'admin', 'member'];
    const planned = [];
    for (const m of members) {
      const d = byUser.get(m.user_id);
      if (d.type === 'release') {
        planned.push({ type: 'release', userId: m.user_id });
        continue;
      }
      if (d.type === 'reassign') {
        const role = String(d.role || '');
        if (!GOV_ROLES.includes(role)) return fail(res, 400, 'invalidRole', 'Role must be owner, admin or member');
        const target = await db.get('select id, name, slug, archived from workspaces where id = ?', [String(d.targetWorkspaceId || '')]);
        if (!target) return fail(res, 404, 'notFound', 'Reassign target workspace not found');
        // WR-02: an archived destination lands the member somewhere requireWorkspace
        // refuses — worse than release (the documented await-access state). The
        // server is the control (D-11): refuse regardless of what the client offers.
        if (target.archived) return fail(res, 409, 'targetArchived', 'The destination workspace is archived. Pick an active destination.');
        const dup = await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [target.id, m.user_id]);
        if (dup) return fail(res, 409, 'memberAlreadyMember', 'That member is already a member of the destination workspace. Pick another destination.');
        planned.push({ type: 'reassign', userId: m.user_id, targetId: target.id, targetName: target.name, targetSlug: target.slug, role });
        continue;
      }
      return fail(res, 409, 'dispositionRequired', 'Every member needs a destination or release before deleting.');
    }
    const reassignedN = planned.filter(p => p.type === 'reassign').length;
    const releasedN = planned.filter(p => p.type === 'release').length;
    /* Phase 43 (D-09): unlink the stored logo bytes alongside the row purge —
       captured BEFORE the tx, unlinked AFTER it commits (owner DELETE precedent). */
    const deletedLogo = docLogo(ws)?.file || null;
    await db.tx(async () => {
      for (const p of planned) {
        if (p.type === 'reassign') {
          await db.run('insert into memberships (workspace_id, user_id, role, provenance) values (?,?,?,?)', [p.targetId, p.userId, p.role, 'manual']);
        } else {
          await db.run('delete from memberships where workspace_id = ? and user_id = ?', [ws.id, p.userId]);
        }
      }
      await db.run('delete from memberships where workspace_id = ?', [ws.id]);
      await db.run('delete from invites where workspace_id = ?', [ws.id]);
      await db.run('delete from workspaces where id = ?', [ws.id]);
      // D-04/AUD-01: the audit row rides the SAME tx — the snapshot carries the
      // slug echo (type-to-confirm contract) and the disposition summary.
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          uid(), operator.id, ws.id, 'workspace_deleted', 0, clientIp(req), ws.id, operator.name, operator.email,
          `${ws.name} (slug: ${ws.slug}) — dispositions: ${reassignedN} reassigned, ${releasedN} released`, ws.slug, now(),
        ],
      );
      for (const p of planned) {
        await db.run(
          'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
          [
            uid(), operator.id, p.userId, p.type === 'reassign' ? 'member_reassigned' : 'member_released', 0, clientIp(req), ws.id,
            operator.name, operator.email, p.userId,
            p.type === 'reassign' ? `reassigned to ${p.targetName} (slug: ${p.targetSlug}) as ${p.role}` : 'released', now(),
          ],
        );
      }
    });
    if (deletedLogo) fs.unlink(path.join(LOGOS_DIR, deletedLogo), () => {});
    await logSecurity(operator.id, 'workspace_deleted');
    logInfo(`workspace deleted (governance) "${ws.name}" (slug: ${ws.slug}) by ${operator.email}`);
    return json(res, 200, { deleted: true });
  }

  /* 79-03 (D-05/D-08): the orphan modal's read route — the member list of the
     workspace being deleted plus the reassign targets (name + member count).
     Read route: NO throttle (Phase 78 read precedent); guard order mirrors the
     family (sameOrigin → requireUser → operator gate BEFORE target lookup, D-09).
     D-08: targets exclude the delete target itself AND archived workspaces —
     a reassign into an archived workspace lands the member somewhere they can
     never enter (requireWorkspace refuses archived slugs), so the server never
     offers one (the standalone reassign refusal is the control, WR-02). */
  const operatorWsMembersReadMatch = pathname.match(/^\/api\/auth\/operator\/workspaces\/([A-Za-z0-9_-]{1,64})\/members$/);
  if (operatorWsMembersReadMatch && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const ws = await db.get('select id from workspaces where id = ?', [operatorWsMembersReadMatch[1]]);
    if (!ws) return fail(res, 404, 'notFound', 'Not found');
    const targets = (
      await db.all(`select w.id, w.slug, w.name,
          (select count(*) from memberships m where m.workspace_id = w.id) as member_count
        from workspaces w where w.id is not ? and w.archived = 0`, [operatorWsMembersReadMatch[1]])
    ).map(r => ({ id: r.id, slug: r.slug, name: r.name, memberCount: r.member_count }));
    return json(res, 200, {
      members: (await membersOf(ws.id)).map(m => ({ userId: m.user_id, name: m.name, email: m.email, role: m.role })),
      targets,
    });
  }

  const operatorWsMemberMatch = pathname.match(/^\/api\/auth\/operator\/workspaces\/([A-Za-z0-9_-]{1,64})\/members\/([A-Za-z0-9_-]{1,64})\/(reassign|release)$/);
  if (operatorWsMemberMatch && method === 'POST') {
    // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    if (tooMany(`op-ws-member|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const [, wsId, targetUserId, verb] = operatorWsMemberMatch;
    const ws = await db.get('select id, slug, name from workspaces where id = ?', [wsId]);
    if (!ws) return fail(res, 404, 'notFound', 'Not found');
    const membership = await db.get('select * from memberships where workspace_id = ? and user_id = ?', [wsId, targetUserId]);
    if (!membership) return fail(res, 404, 'notFound', 'Not found');
    if (verb === 'release') {
      // D-05: release drops the membership row — a member left with no other
      // workspace lands in the await-access state (empty workspace list).
      await db.tx(async () => {
        await db.run('delete from memberships where workspace_id = ? and user_id = ?', [wsId, targetUserId]);
        await db.run(
          'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
          [uid(), operator.id, targetUserId, 'member_released', 0, clientIp(req), wsId, operator.name, operator.email, targetUserId, `released from ${ws.name} (slug: ${ws.slug})`, now()],
        );
      });
      await logSecurity(operator.id, 'member_released');
      logInfo(`member released (governance) from "${ws.slug}": ${targetUserId} by ${operator.email}`);
      return json(res, 200, { released: true });
    }
    // D-08: reassign carries the destination AND the role in the same step.
    const body = await readJson(req);
    const role = String(body?.role || '');
    if (!['owner', 'admin', 'member'].includes(role)) return fail(res, 400, 'invalidRole', 'Role must be owner, admin or member');
    const target = await db.get('select id, name, slug, archived from workspaces where id = ?', [String(body?.targetWorkspaceId || '')]);
    if (!target) return fail(res, 404, 'notFound', 'Reassign target workspace not found');
    // WR-02: same archived-destination refusal as the delete-path dispositions.
    if (target.archived) return fail(res, 409, 'targetArchived', 'The destination workspace is archived. Pick an active destination.');
    // Pitfall 6: the memberships PK is (workspace_id,user_id) — refuse before
    // any write instead of tripping the UNIQUE constraint.
    const dup = await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [target.id, targetUserId]);
    if (dup) return fail(res, 409, 'memberAlreadyMember', 'That member is already a member of the destination workspace. Pick another destination.');
    await db.tx(async () => {
      await db.run('insert into memberships (workspace_id, user_id, role, provenance) values (?,?,?,?)', [target.id, targetUserId, role, 'manual']);
      await db.run('delete from memberships where workspace_id = ? and user_id = ?', [wsId, targetUserId]);
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), operator.id, targetUserId, 'member_reassigned', 0, clientIp(req), wsId, operator.name, operator.email, targetUserId, `reassigned to ${target.name} (slug: ${target.slug}) as ${role}`, now()],
      );
    });
    await logSecurity(operator.id, 'member_reassigned');
    logInfo(`member reassigned (governance) from "${ws.slug}" to "${target.slug}" as ${role}: ${targetUserId} by ${operator.email}`);
    return json(res, 200, { reassigned: true, workspace: { id: target.id, slug: target.slug, role } });
  }

  /* -------------- group mapping config save (Phase 80, GM-01) --------------
     Mappings enter the DB ONLY through this operator-gated, fully-validated
     route — nothing invalid is ever stored (T-80-05), and the operator gate
     runs BEFORE any target lookup so a non-operator cannot distinguish
     bad-guid from bad-workspace (T-80-04, Pitfall 4: no existence oracle).
     Guard order mirrors the operator family verbatim (Pitfall 22). Validation
     rides the 80-01 groups.js funnel (guidRefusal, roleTokenRefusal on the
     locked 3-token set — 'viewer' refuses at save) plus the two DB checks
     shape alone cannot decide: workspace existence (a workspace id is
     GUID-shaped too) and the (guid, workspace) duplicate pre-check. */
  if (pathname === '/api/governance/group-mappings' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    // T-80-04: the operator gate BEFORE any target lookup — an
    // unauthenticated caller gets the generic 401, a non-operator the exact
    // 403 operatorOnly regardless of body validity.
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const body = await readJson(req);
    // T-80-05: allow-list validation completes BEFORE any write — validate
    // everything, store nothing until every check passes. The codes are
    // passed EXPLICITLY at this call site (the domains.js door precedent):
    // the keyed refusal literal lives where the route emits it.
    const guidR = guidRefusal(body?.groupGuid, 'groupMappingBadGuid', 'Group ID must be an Entra Object ID (GUID)');
    if (guidR) return fail(res, 400, guidR.code, guidR.message);
    const guid = canonicalizeGuid(body.groupGuid);
    const roleR = roleTokenRefusal(body?.role, 'groupMappingBadRole', 'Role must be owner, admin, or member');
    if (roleR) return fail(res, 400, roleR.code, roleR.message);
    const workspaceId = String(body?.workspaceId || '');
    const ws = await db.get('select id from workspaces where id = ?', [workspaceId]);
    if (!ws) return fail(res, 400, 'groupMappingUnknownWorkspace', 'No workspace with that ID exists');
    const dup = await db.get('select 1 from group_mappings where group_guid = ? and workspace_id = ?', [guid, ws.id]);
    if (dup) return fail(res, 400, 'groupMappingDuplicate', 'That group is already mapped to this workspace');
    // T-80-07 (accepted): label is opaque display-only text — never a match
    // key, never rendered until Phase 83 (escaping happens there).
    const label = String(body?.label || '').trim().slice(0, 200) || null;
    const t = now();
    const row = {
      id: uid(),
      group_guid: guid,
      workspace_id: ws.id,
      role: body.role,
      kind: 'workspace',
      label,
      created_by: operator.id,
      created_at: t,
      updated_at: t,
    };
    await db.run(
      'insert into group_mappings (id, group_guid, workspace_id, role, kind, label, created_by, created_at, updated_at) values (?,?,?,?,?,?,?,?,?)',
      [row.id, row.group_guid, row.workspace_id, row.role, row.kind, row.label, row.created_by, row.created_at, row.updated_at],
    );
    // Research Open Question 3: audit the mutation cheaply now, avoid the
    // Phase 83 retrofit (same logSecurity discipline as the operator family).
    await logSecurity(operator.id, 'group_mapping_saved');
    logInfo(`group mapping saved: group ${guid} → workspace ${ws.id} as ${row.role} by ${operator.email}`);
    return json(res, 200, {
      mapping: { id: row.id, groupGuid: row.group_guid, workspaceId: row.workspace_id, role: row.role, kind: row.kind, label: row.label },
    });
  }

  if (pathname === '/api/auth/operator/dead-mappings' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    // T-80-04: operator gate before any data read — non-operators get the
    // exact 403 operatorOnly, unauthenticated callers the generic 401.
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    // NO throttle: read route (Phase 78/79 GET read precedent) — derived
    // on read per D-09, zero schema change, no boot snapshot.
    // Query A — the boot dead-mapping predicate (logWarn loop) moved
    // on-read: exact JS Set membership, a mapping is alive ONLY on exact
    // id match. Raw values returned; the FIRST-colon split for rendering
    // is a client concern (D-08) — the server does not transform the
    // encoded action strings.
    const mappings = await db.all('select group_guid, workspace_id, kind, label from group_mappings');
    const wsIds = new Set((await db.all('select id from workspaces')).map(r => r.id));
    const orphans = mappings.filter(m => !wsIds.has(m.workspace_id));
    // Query B — Phase 82 encoded guard trail (group_<delta>:group:<guid>:<reason>),
    // bounded and newest-first (discretion bound: 100). WR-83-03: the literal
    // `group_` prefix — `_` is ESCAPED so the LIKE cannot over-match
    // `groupX:group:…` one-char variants.
    const trail = await db.all("select action, workspace_id, created_at from audit_log where action like 'group\\_%:group:%' escape '\\' order by created_at desc limit 100");
    return json(res, 200, { orphans, trail });
  }

  /* -------------- instance roles (Phase 85, BKROLE-01..03, D-16/D-17/D-18) --------------
     The Super-Admin-only grant/revoke/list family. Guard order is the
     Phase 83 D-05 ladder VERBATIM (Pitfall 22: sameOrigin FIRST, before any
     body read or throttle; then requireUser; then the operator-keyed
     throttle consuming a try even on 403; then the isInstanceAdmin gate
     BEFORE any target lookup — a non-operator gets the exact 403
     operatorOnly regardless of body validity, no 403-vs-400 existence
     oracle (T-85-02/T-80-04)). Grant and revoke write the instance_roles
     row and the audit_log row inside ONE db.tx (BKROLE-03, D-18): a forced
     audit failure rolls the whole mutation back — no write ever lands
     un-logged (T-85-05). */
  if (pathname === '/api/auth/operator/instance-roles' && method === 'GET') {
    // D-16 list route — sameOrigin → requireUser → operator gate. NO throttle
    // (read-only, Phase 78 read precedent). granted_by resolves server-side
    // for the tab render (D-33); null granter name falls back to the raw id.
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const rows = await db.all(`select ir.id, ir.user_id, ir.role, ir.granted_by, ir.granted_at,
        tu.name as user_name, tu.email as user_email,
        gu.name as granted_by_name, gu.email as granted_by_email
      from instance_roles ir
      left join users tu on tu.id = ir.user_id
      left join users gu on gu.id = ir.granted_by
      order by ir.granted_at desc`);
    /* D-32: the recent-activity trail rides the same GET (dead-mappings
       {.., trail} shape) — the append-only audit_log is the single source,
       newest first, capped at 8. Role isn't an audit column, so the trail
       carries the action + actor + target only. */
    const recentRows = await db.all(
      `select action, actor_name, actor_email, target_name, target_email, created_at
        from audit_log where action in ('instance_role_granted','instance_role_revoked')
        order by created_at desc limit 8`);
    const recent = recentRows.map(a => ({
      action: a.action,
      actorName: a.actor_name,
      targetName: a.target_name || a.target_id,
      createdAt: a.created_at,
    }));
    return json(res, 200, {
      roles: rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        role: r.role,
        grantedBy: r.granted_by,
        grantedAt: r.granted_at,
        userName: r.user_name || r.user_id,
        userEmail: r.user_email || null,
        grantedByName: r.granted_by_name || r.granted_by, // D-33: deleted-granter fallback to raw id
      })),
      recent, // D-32
    });
  }

  if (pathname === '/api/auth/operator/instance-roles' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    // T-85-04: keyed on the caller; every attempt — including 403 refusals —
    // consumes a try (tooMany increments before any gate decision).
    if (tooMany(`instance-role-grant|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    // T-85-02: the operator gate BEFORE any target lookup (D-16/T-80-04).
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const body = await readJson(req);
    // D-01: the role token allow-list rides the roles.js funnel, code passed
    // EXPLICITLY at the call site (domains.js door precedent).
    const roleR = instanceRoleTokenRefusal(body?.role, 'instanceRoleBadRole', 'Role must be backup_operator or restore_operator');
    if (roleR) return fail(res, 400, roleR.code, roleR.message);
    // D-05: granting to a Super Admin is refused BEFORE the duplicate check —
    // they hold everything implicitly and a row would wrongly surface them in
    // (and make them demotable from) the membership list.
    const target = await db.get('select id, name, email, is_instance_admin from users where id = ?', [String(body?.userId || '')]);
    if (!target) return fail(res, 404, 'notFound', 'Not found');
    if (target.is_instance_admin) return fail(res, 400, 'instanceRoleAdminImplicit', 'Super Admins already hold every role implicitly');
    // D-08: duplicate grant refuses keyed; the OTHER role stays grantable
    // (two rows per user, D-02).
    const dup = await db.get('select 1 from instance_roles where user_id = ? and role = ?', [target.id, body.role]);
    if (dup) return fail(res, 400, 'instanceRoleDuplicate', 'That user already holds this role');
    const row = { id: uid(), user_id: target.id, role: body.role, granted_by: operator.id, granted_at: now() };
    // BKROLE-03/D-18/T-85-05: grant + audit share ONE db.tx.
    await db.tx(async () => {
      await db.run(
        'insert into instance_roles (id, user_id, role, granted_by, granted_at) values (?,?,?,?,?)',
        [row.id, row.user_id, row.role, row.granted_by, row.granted_at],
      );
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          uid(),
          operator.id,
          target.id,
          'instance_role_granted:' + row.role, // role-suffixed: the audit action carries the granted role verbatim (D-32 trail)
          0,
          clientIp(req),
          null,
          operator.name,
          operator.email,
          target.name,
          target.email,
          now(),
        ],
      );
    });
    logInfo(`instance role granted: ${target.email} as ${row.role} by ${operator.email}`);
    return json(res, 200, { role: { id: row.id, userId: row.user_id, role: row.role, grantedBy: row.granted_by, grantedAt: row.granted_at } });
  }

  const instanceRoleRevokeMatch = pathname.match(/^\/api\/auth\/operator\/instance-roles\/([A-Za-z0-9_-]{1,64})$/);
  if (instanceRoleRevokeMatch && method === 'DELETE') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const operator = await requireUser(req, res);
    if (!operator) return;
    // T-85-04: same keyed throttle discipline as the grant route.
    if (tooMany(`instance-role-revoke|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    // T-85-02: the operator gate BEFORE any row lookup (D-16/D-17 — Backup/
    // Restore Operators can never revoke, and a non-operator cannot probe
    // which ids exist).
    if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
    const row = await db.get(
      'select ir.id, ir.user_id, ir.role, tu.name as user_name, tu.email as user_email from instance_roles ir left join users tu on tu.id = ir.user_id where ir.id = ?',
      [instanceRoleRevokeMatch[1]],
    );
    if (!row) return fail(res, 404, 'notFound', 'Not found');
    // BKROLE-03/D-18/T-85-05: revoke + audit share ONE db.tx — a forced audit
    // failure rolls the DELETE back (the row survives un-logged removal).
    await db.tx(async () => {
      await db.run('delete from instance_roles where id = ?', [row.id]);
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          uid(),
          operator.id,
          row.user_id,
          'instance_role_revoked:' + row.role, // role-suffixed: the audit action carries the revoked role verbatim (D-32 trail)
          0,
          clientIp(req),
          null,
          operator.name,
          operator.email,
          row.user_name || row.user_id,
          row.user_email || '',
          now(),
        ],
      );
    });
    logInfo(`instance role revoked: ${row.user_email || row.user_id} ${row.role} by ${operator.email}`);
    return json(res, 200, { revoked: row.id });
  }

  /* -------------- backup stub endpoints (Phase 85, BKROLE-02, D-19/D-24/D-26) --------------
     Real endpoints behind the real gates — the refusal path is live before
     any task logic exists (Phases 86/87 own the contract). Every request
     re-checks server-side via hasInstanceRole (D-23/T-85-06): the payload
     flags are render-only, never authority. */
  /* -------------- backup task endpoints (Phase 87, 87-01, BKBCK-02/BKBCK-03) --------------
     Real task CRUD replacing the Phase 85 stub family. The guard-chain order
     is copied verbatim from the Phase 86 runs route (never reordered —
     sameOrigin before body read AND throttle, house rule):
       sameOrigin → requireUser → throttle → capability gate → body/scope checks.
     The capability gate sits BEFORE any body probing (T-86-07/T-87-02: no
     403-vs-400 oracle — a non-holder gets the same keyed refusal for a valid
     and an invalid body); every mutation and every refusal is keyed AND
     audited (D-20 funnel shape). Refusals carry the 87-01 keyed vocabulary:
     backupManageRequired / invalidSchedule / invalidTimezone / invalidScope /
     invalidRetention / taskNameRequired (+ taskNotFound with PUT/DELETE).
     POST persists the RAW 5-field cron string (D-04, owner-ratified
     2026-11-21) and a next_run_at computed by export/cron.js nextRunAt() in
     the same write. GET keeps the D-24 capability flags beside the list so
     the client renders role-aware actions from one contract. */
  const auditBackupTask = async (user, action, targetId, targetName) => {
    await db.run(
      'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
      [uid(), user.id, targetId ?? user.id, action, 0, clientIp(req), null, user.name, user.email, targetName ?? user.name, user.email, now()],
    );
  };
  /* D-09: retention buckets are small non-negative ints; omitted → the
     frozen defaults 7/4/12/5. Anything else refuses keyed invalidRetention. */
  const BACKUP_RETENTION_DEFAULTS = { daily: 7, weekly: 4, monthly: 12, yearly: 5 };
  const backupRetentionFrom = value => {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const key of ['daily', 'weekly', 'monthly', 'yearly']) {
      const n = src[key];
      if (n === undefined || n === null) {
        out[key] = BACKUP_RETENTION_DEFAULTS[key];
        continue;
      }
      if (!Number.isInteger(n) || n < 0 || n > 999) return null;
      out[key] = n;
    }
    return out;
  };
  /* T-87-02 scope validation — the same allow-list + existence probe the
     Phase 86 runs route uses; every failure is ONE keyed refusal. */
  const backupScopeOk = async scope => {
    const kind = scope?.kind;
    const id = typeof scope?.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(scope.id) ? scope.id : null;
    if (kind === 'instance') return scope?.id === undefined; // the instance always exists — id OMITTED (D-17)
    if ((kind === 'project' || kind === 'workspace') && id) {
      if (kind === 'workspace') return !!(await db.get('select id from workspaces where id = ?', [id]));
      for (const ws of await db.all('select doc from workspaces')) {
        let doc;
        try { doc = JSON.parse(ws.doc)?.data ?? {}; } catch { continue; }
        if ((Array.isArray(doc.projects) ? doc.projects : []).some(p => p?.id === id)) return true;
      }
      return false;
    }
    return false;
  };
  /* A stored task row → API shape (scope parsed back to the object form).
     Phase 92 (D-04): `schedule` rides along as the structured cron
     descriptor (describeCron, from parseCron output only) — the client
     localizes the kind via t() keys (Phase 94) and never derives or
     translates server strings. */
  const backupTaskShape = row => {
    let scope;
    try { scope = JSON.parse(row.scope); } catch { scope = {}; }
    /* Phase 94 (D-02): the descriptor grows `preset` — the flat reverse-map
       (cronToPreset, same parseCron discipline) the editor uses to pre-select
       the builder dropdowns; null → the readonly custom fallback. Additive
       only: every Phase-92 descriptor key is unchanged. */
    return { ...row, scope, schedule: { ...describeCron(row.cron), preset: cronToPreset(row.cron) } };
  };
  /* Phase 92 (D-06): the operator-gated scope picker — the minimal
     `{ workspaces: [{ id, name, slug }] }` payload the task-create form
     needs. SEPARATE direct query (archived workspaces excluded) — do NOT
     route through workspacesForUser (its byte-unchanged mandate and
     member-vs-operator semantics differ). No nested projects, no role
     echo (deferred). Gate: either backup role, or Super Admin. */
  if (pathname === '/api/backup/scopes' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) && !(await hasInstanceRole(user.id, CAP.RESTORE_USE)) && !(isInstanceAdmin(user) && SUPER_ACCESS)) {
      return fail(res, 403, 'backupRoleRequired', 'You need a backup role to see that');
    }
    /* 95-05 (BKRST-05): each entry gains an ADDITIVE `projects: [{id,name}]`
       read from the workspace doc — no visibility filtering here (the drawer
       picker needs names to arm a target; the overwrite route re-validates
       everything against the live doc, fail-closed). Gate + direct query
       unchanged (do NOT route through workspacesForUser or any membership
       helper). */
    const workspaces = (await db.all('select id, name, slug, doc from workspaces where archived = 0 order by name, id')).map(w => {
      let doc;
      try { doc = JSON.parse(w.doc)?.data ?? {}; } catch { doc = {}; }
      return {
        id: w.id,
        name: w.name,
        slug: w.slug,
        projects: (Array.isArray(doc.projects) ? doc.projects : []).map(p => ({ id: p?.id, name: p?.name || p?.id })),
      };
    });
    return json(res, 200, { workspaces });
  }

  if (pathname === '/api/backup/tasks' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // D-19/D-26: a non-holder deep-linking gets the keyed 403 refusal, not a
    // silent redirect or an existence oracle. Both roles may read.
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) && !(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
      return fail(res, 403, 'backupRoleRequired', 'You need a backup role to see that');
    }
    // D-24: the capability flags ride beside the list so Phase 87 renders
    // role-aware actions from the same contract.
    const canBackup = await hasInstanceRole(user.id, CAP.BACKUP_MANAGE);
    const canRestore = await hasInstanceRole(user.id, CAP.RESTORE_USE);
    const rows = await db.all('select * from backup_tasks order by created_at, id');
    return json(res, 200, { tasks: rows.map(backupTaskShape), canBackup, canRestore });
  }

  if (pathname === '/api/backup/tasks' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // D-21 shape: operator-keyed throttle AFTER sameOrigin+requireUser and
    // BEFORE the gate checks — a refused attempt consumes a try (T-86-08).
    if (tooMany(`backuptask|${user.id}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    // D-19: task editing is BACKUP_MANAGE-only — a Restore Operator reaches
    // the endpoint and gets the keyed localized refusal, audited (D-20).
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
      await auditBackupTask(user, 'backup_task_refused:backupManageRequired');
      return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can edit backup tasks');
    }
    const body = await readJson(req);
    /* Body validation — cron/tz/scope/retention each keyed, each refusal
       audited. Order inside the body checks does not leak (same refusal
       vocabulary; one key per field kind). */
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 120) {
      await auditBackupTask(user, 'backup_task_refused:taskNameRequired');
      return fail(res, 400, 'taskNameRequired', 'Give the backup task a name');
    }
    const cron = typeof body?.cron === 'string' ? body.cron.trim() : '';
    if (!cron || !parseCron(cron)) {
      await auditBackupTask(user, 'backup_task_refused:invalidSchedule');
      return fail(res, 400, 'invalidSchedule', 'Invalid schedule — use a 5-field cron expression');
    }
    // D-02 (ratified): absent tz → resolveTz(null) → Europe/Paris; a provided
    // label must resolve through Intl (the same funnel tz.js uses).
    const tzIn = typeof body?.tz === 'string' ? body.tz.trim() : '';
    let tz = 'Europe/Paris';
    if (tzIn) {
      try {
        tz = new Intl.DateTimeFormat('en-CA', { timeZone: tzIn }).resolvedOptions().timeZone || 'Europe/Paris';
      } catch {
        await auditBackupTask(user, 'backup_task_refused:invalidTimezone');
        return fail(res, 400, 'invalidTimezone', 'Invalid timezone');
      }
    }
    const scope = body?.scope && typeof body.scope === 'object' && !Array.isArray(body.scope) ? body.scope : null;
    if (!scope || !(await backupScopeOk(scope))) {
      await auditBackupTask(user, 'backup_task_refused:backupInvalidScope');
      return fail(res, 400, 'backupInvalidScope', 'That backup scope does not exist');
    }
    const retention = backupRetentionFrom(body?.retention);
    if (!retention) {
      await auditBackupTask(user, 'backup_task_refused:invalidRetention');
      return fail(res, 400, 'invalidRetention', 'Retention must be small non-negative integers');
    }
    /* Phase 88 (D-88-12/T-88-06): per-task S3 opt-in. Boolean-only (V5);
       a truthy s3Enabled with the S3_* env pair absent is a keyed, audited
       refusal — the same funnel shape every other field uses. */
    if (body?.s3Enabled !== undefined && typeof body.s3Enabled !== 'boolean') {
      await auditBackupTask(user, 'backup_task_refused:invalidS3Enabled');
      return fail(res, 400, 'invalidS3Enabled', 's3Enabled must be a boolean');
    }
    if (body?.s3Enabled && !S3.enabled) {
      await auditBackupTask(user, 'backup_task_refused:s3NotConfigured');
      return fail(res, 400, 's3NotConfigured', 'S3 destination is not configured on this instance');
    }
    /* SC-1 probe-at-save (D-88-15, post-merge gate fix): a task enabled for
       S3 runs the SAME write+delete marker probe the manual route uses,
       BEFORE the write — it exercises the exact operations uploads use.
       unreachable / badCreds / s3ClockSkew refuse the save keyed (D-88-17);
       deleteFailed ACCEPTS with warning:true (D-88-15: the write path —
       the one uploads need — is proven; the marker delete is not). */
    let s3Probe = null;
    if (body?.s3Enabled === true && S3.enabled) {
      s3Probe = await probeS3(S3.config());
      if (!s3Probe.ok && s3Probe.key !== 'deleteFailed') {
        await auditBackupTask(user, `backup_task_refused:s3Probe:${s3Probe.key}`);
        return fail(res, 400, s3Probe.key, 'S3 destination probe failed — the task was not saved');
      }
    }
    /* D-04: the raw string is stored verbatim; next_run_at is the persisted
       cache computed in the SAME write (never re-parsed at tick). */
    const nextRun = nextRunAt(cron, tz, now());
    if (!Number.isInteger(nextRun)) {
      await auditBackupTask(user, 'backup_task_refused:invalidSchedule');
      return fail(res, 400, 'invalidSchedule', 'Invalid schedule — use a 5-field cron expression');
    }
    const task = {
      id: uid(),
      name,
      scope: JSON.stringify(scope),
      cron,
      tz,
      enabled: 1,
      retention_daily: retention.daily,
      retention_weekly: retention.weekly,
      retention_monthly: retention.monthly,
      retention_yearly: retention.yearly,
      next_run_at: nextRun,
      s3_enabled: body?.s3Enabled === true ? 1 : 0,
      last_notified_state: null,
      created_at: now(),
      updated_at: now(),
    };
    await db.run(
      'insert into backup_tasks (id, name, scope, cron, tz, enabled, retention_daily, retention_weekly, retention_monthly, retention_yearly, next_run_at, s3_enabled, last_notified_state, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [task.id, task.name, task.scope, task.cron, task.tz, task.enabled, task.retention_daily, task.retention_weekly, task.retention_monthly, task.retention_yearly, task.next_run_at, task.s3_enabled, task.last_notified_state, task.created_at, task.updated_at],
    );
    await auditBackupTask(user, 'backup_task_created', task.id, task.name);
    /* MIN-07: the probe outcome at save is audited too — the backup_* audit
       funnel stays symmetric with the dedicated probe route (refusals are
       already audited above; deleteFailed is a warning, keyed in the detail). */
    if (s3Probe) {
      await auditBackupTask(user, s3Probe.ok ? 'backup_s3_probe_ok' : 'backup_s3_probe_failed', task.id, s3Probe.key);
    }
    logInfo(`backup task created: ${task.name} (${task.id}) cron="${task.cron}" tz=${task.tz}`);
    /* s3Probe rides the response so the client can toast the keyed outcome
       (SC-1: probe-at-save is visible, not silent). */
    return json(res, 200, s3Probe ? { task: backupTaskShape(task), s3Probe } : { task: backupTaskShape(task) });
  }

  const backupTaskMatch = pathname.match(/^\/api\/backup\/tasks\/([A-Za-z0-9_-]{1,64})$/);
  if (backupTaskMatch && (method === 'PUT' || method === 'DELETE')) {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    // D-21 shape: operator-keyed throttle AFTER sameOrigin+requireUser and
    // BEFORE the gate checks — a refused attempt consumes a try (T-86-08).
    if (tooMany(`backuptask|${user.id}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
      await auditBackupTask(user, 'backup_task_refused:backupManageRequired');
      return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can edit backup tasks');
    }
    const id = backupTaskMatch[1];
    const row = await db.get('select * from backup_tasks where id = ?', [id]);
    if (!row) {
      await auditBackupTask(user, 'backup_task_refused:taskNotFound', id);
      return fail(res, 404, 'taskNotFound', 'That backup task does not exist');
    }

    if (method === 'DELETE') {
      /* History never cascades (D-11): run rows persist with their task_id;
         only the task definition goes. */
      await db.run('delete from backup_tasks where id = ?', [id]);
      await auditBackupTask(user, 'backup_task_deleted', id, row.name);
      logInfo(`backup task deleted: ${row.name} (${id})`);
      return json(res, 200, { deleted: id });
    }

    /* PUT — partial edit: name/scope/cron/tz/retention/enabled, all optional.
       Schedule or tz changes recompute next_run_at from NOW in the same
       write; enabled=0 stores NULL next_run_at; enabled=1 (freshly enabled
       or after any schedule change) recomputes from now — a disabled-while-
       down task must never fire from a stale value (D-07). */
    const body = await readJson(req);
    let name = row.name;
    if (body?.name !== undefined) {
      name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 120) {
        await auditBackupTask(user, 'backup_task_refused:taskNameRequired', id);
        return fail(res, 400, 'taskNameRequired', 'Give the backup task a name');
      }
    }
    let cron = row.cron;
    if (body?.cron !== undefined) {
      cron = typeof body.cron === 'string' ? body.cron.trim() : '';
      if (!cron || !parseCron(cron)) {
        await auditBackupTask(user, 'backup_task_refused:invalidSchedule', id);
        return fail(res, 400, 'invalidSchedule', 'Invalid schedule — use a 5-field cron expression');
      }
    }
    let tz = row.tz;
    if (body?.tz !== undefined) {
      const tzIn = typeof body.tz === 'string' ? body.tz.trim() : '';
      tz = 'Europe/Paris';
      if (tzIn) {
        try {
          tz = new Intl.DateTimeFormat('en-CA', { timeZone: tzIn }).resolvedOptions().timeZone || 'Europe/Paris';
        } catch {
          await auditBackupTask(user, 'backup_task_refused:invalidTimezone', id);
          return fail(res, 400, 'invalidTimezone', 'Invalid timezone');
        }
      }
    }
    let scopeJson = row.scope;
    if (body?.scope !== undefined) {
      const scope = body.scope && typeof body.scope === 'object' && !Array.isArray(body.scope) ? body.scope : null;
      if (!scope || !(await backupScopeOk(scope))) {
        await auditBackupTask(user, 'backup_task_refused:backupInvalidScope', id);
        return fail(res, 400, 'backupInvalidScope', 'That backup scope does not exist');
      }
      scopeJson = JSON.stringify(scope);
    }
    let retention = {
      daily: row.retention_daily,
      weekly: row.retention_weekly,
      monthly: row.retention_monthly,
      yearly: row.retention_yearly,
    };
    if (body?.retention !== undefined) {
      const parsed = backupRetentionFrom(body.retention);
      if (!parsed) {
        await auditBackupTask(user, 'backup_task_refused:invalidRetention', id);
        return fail(res, 400, 'invalidRetention', 'Retention must be small non-negative integers');
      }
      retention = parsed;
    }
    /* Phase 88 (D-88-12/T-88-06): per-task S3 opt-in on edit — the same
       boolean-only + configured gate the POST funnel uses; absent flag keeps
       the stored value. */
    let s3Enabled = row.s3_enabled === 1;
    if (body?.s3Enabled !== undefined) {
      if (typeof body.s3Enabled !== 'boolean') {
        await auditBackupTask(user, 'backup_task_refused:invalidS3Enabled', id);
        return fail(res, 400, 'invalidS3Enabled', 's3Enabled must be a boolean');
      }
      if (body.s3Enabled && !S3.enabled) {
        await auditBackupTask(user, 'backup_task_refused:s3NotConfigured', id);
        return fail(res, 400, 's3NotConfigured', 'S3 destination is not configured on this instance');
      }
      s3Enabled = body.s3Enabled;
    }
    /* SC-1 probe-at-save on edit (same contract as create): the save only
       probes when the resulting row keeps S3 enabled and the env pair is
       live. Refusal keys identical to the create path; deleteFailed warns
       and accepts (D-88-15). */
    let s3Probe = null;
    if (s3Enabled && S3.enabled) {
      s3Probe = await probeS3(S3.config());
      if (!s3Probe.ok && s3Probe.key !== 'deleteFailed') {
        await auditBackupTask(user, `backup_task_refused:s3Probe:${s3Probe.key}`, id);
        return fail(res, 400, s3Probe.key, 'S3 destination probe failed — the task was not saved');
      }
    }
    const cronChanged = cron !== row.cron;
    const tzChanged = tz !== row.tz;
    const wasEnabled = row.enabled === 1;
    /* Explicit enabled flag wins; absent flag keeps the stored value. */
    const willEnable = body?.enabled === undefined ? wasEnabled : body.enabled === true || body.enabled === 1;
    let nextRun = row.next_run_at;
    if (!willEnable) {
      nextRun = null; // D-07: disabled tasks hold no cached schedule
    } else if (cronChanged || tzChanged || !wasEnabled) {
      nextRun = nextRunAt(cron, tz, now()); // recomputed from now, same write
      if (!Number.isInteger(nextRun)) {
        await auditBackupTask(user, 'backup_task_refused:invalidSchedule', id);
        return fail(res, 400, 'invalidSchedule', 'Invalid schedule — use a 5-field cron expression');
      }
    }
    const updated = {
      ...row,
      name,
      scope: scopeJson,
      cron,
      tz,
      enabled: willEnable ? 1 : 0,
      retention_daily: retention.daily,
      retention_weekly: retention.weekly,
      retention_monthly: retention.monthly,
      retention_yearly: retention.yearly,
      next_run_at: nextRun,
      s3_enabled: s3Enabled ? 1 : 0,
      updated_at: now(),
    };
    await db.run(
      'update backup_tasks set name = ?, scope = ?, cron = ?, tz = ?, enabled = ?, retention_daily = ?, retention_weekly = ?, retention_monthly = ?, retention_yearly = ?, next_run_at = ?, s3_enabled = ?, updated_at = ? where id = ?',
      [updated.name, updated.scope, updated.cron, updated.tz, updated.enabled, updated.retention_daily, updated.retention_weekly, updated.retention_monthly, updated.retention_yearly, updated.next_run_at, updated.s3_enabled, updated.updated_at, id],
    );
    await auditBackupTask(user, 'backup_task_updated', id, updated.name);
    /* MIN-07: probe outcome audit on edit — same symmetry as the create path. */
    if (s3Probe) {
      await auditBackupTask(user, s3Probe.ok ? 'backup_s3_probe_ok' : 'backup_s3_probe_failed', id, s3Probe.key);
    }
    logInfo(`backup task updated: ${updated.name} (${id}) enabled=${updated.enabled}`);
    return json(res, 200, s3Probe ? { task: backupTaskShape(updated), s3Probe } : { task: backupTaskShape(updated) });
  }

  /* -------------- S3 probe-at-save (Phase 88, D-88-15, SC-1) --------------
     POST /api/backup/s3/probe rides the EXACT task-mutation funnel: sameOrigin
     → requireUser → operator-keyed throttle → capability gate → audit
     (T-88-06/T-88-07). Env pair unset → the no-oracle keyed refusal (never a
     probe, never a deployment oracle). Set → probeS3 (plan 01) runs
     HeadBucket + marker PUT/DELETE with the boot-frozen consts and the keyed
     result returns VERBATIM: success / deleteFailed / badCreds / s3ClockSkew
     / unreachable + httpWarning (D-88-14/17). Probe events follow the
     backup_* audit convention (CONTEXT discretion). */
  if (pathname === '/api/backup/s3/probe' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (tooMany(`backupprobe|${user.id}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
      await auditBackupTask(user, 'backup_probe_refused:backupManageRequired');
      return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can probe the S3 destination');
    }
    if (!S3.enabled) {
      await auditBackupTask(user, 'backup_probe_refused:s3NotConfigured');
      return fail(res, 400, 's3NotConfigured', 'S3 destination is not configured on this instance');
    }
    const result = await probeS3(S3.config());
    await auditBackupTask(user, result.ok ? 'backup_s3_probe_ok' : 'backup_s3_probe_failed', user.id, result.key);
    logInfo(`s3 probe: ${result.key}${result.httpWarning ? ' (plain-http endpoint)' : ''}`);
    return json(res, 200, result);
  }

  /* -------------- backup run endpoints (Phase 86, 86-02, BKBCK-01/D-16) --------------
     The frozen /api/backup/runs surface Phases 87/88 build on: POST triggers a
     background export (86-01 pipeline) and returns the D-18 UUID immediately;
     GET current polls the D-19 status payload. Guard chain order is copied
     verbatim from the Phase 85 stub family (never reordered — sameOrigin before
     body read AND throttle, house rule server.js signup comment):
       sameOrigin → requireUser → throttle → capability gate → scope checks →
       concurrency → claim → fire-and-forget export.
     Every refusal is keyed AND audited (D-20); the POST throttle is
     operator-keyed and consumes a try even on refusal (D-21). No download
     endpoint and no MCP mirror exist in v1 (D-23/Phase 90 deferral). */
  if (pathname === '/api/backup/runs' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    /* D-21: operator-keyed throttle placed AFTER sameOrigin+requireUser and
       BEFORE the gate checks — a refused attempt consumes a try, exactly like
       the grant/revoke routes (T-86-08). */
    if (tooMany(`backuprun|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    /* T-86-07: the capability gate BEFORE any body/scope probing — a non-holder
       gets the same keyed refusal for a valid and an invalid body (no oracle). */
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
      /* D-20: refused trigger attempts land on the trail. */
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), user.id, user.id, 'backup_run_refused:backupManageRequired', 0, clientIp(req), null, user.name, user.email, user.name, user.email, now()],
      );
      return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can run backups');
    }
    /* D-17: body + scope validation — kind allow-list, id presence per kind,
       then DB existence. Every failure is the SAME keyed refusal (T-86-06: no
       which-part-was-wrong oracle) and lands on the trail (D-20). */
    const auditRefusedScope = async () => {
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), user.id, user.id, 'backup_run_refused:scopeNotFound', 0, clientIp(req), null, user.name, user.email, user.name, user.email, now()],
      );
    };
    const body = await readJson(req);
    const scope = body?.scope;
    const kind = scope?.kind;
    const scopeId = typeof scope?.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(scope.id) ? scope.id : null;
    let scopeExists = false;
    if ((kind === 'project' || kind === 'workspace') && scopeId) {
      /* Existence reads stay fail-closed: workspace ids are table rows; project
         ids live in the workspace doc's data.projects (the same doc source the
         86-01 collector scans). */
      if (kind === 'workspace') {
        scopeExists = !!(await db.get('select id from workspaces where id = ?', [scopeId]));
      } else {
        for (const ws of await db.all('select doc from workspaces')) {
          let doc;
          try { doc = JSON.parse(ws.doc)?.data ?? {}; } catch { continue; }
          if ((Array.isArray(doc.projects) ? doc.projects : []).some(p => p?.id === scopeId)) {
            scopeExists = true;
            break;
          }
        }
      }
    } else if (kind === 'instance' && scope?.id === undefined) {
      scopeExists = true; // the instance always exists — id must be OMITTED (D-17)
    }
    if (!['project', 'workspace', 'instance'].includes(kind) || !scopeExists) {
      await auditRefusedScope();
      return fail(res, 400, 'scopeNotFound', 'That backup scope does not exist');
    }
    /* D-89-1 (89-02, export-side half): a held restore_lock blocks any
       backup — keyed backupRestoreInProgress, the shared vocabulary the
       restore-side refusal half (plan 04) and the 5-locale key (plan 06)
       ride; the refusal is audited like every other (D-89-22/D-20). Sits in
       the concurrency slot — after the gate, before the claim — so the
       403-vs-400 oracle is unchanged. */
    if (await restoreLockHeld()) {
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), user.id, user.id, 'backup_run_refused:restoreInProgress', 0, clientIp(req), null, user.name, user.email, user.name, user.email, now()],
      );
      return fail(res, 409, 'backupRestoreInProgress', 'A restore is in progress');
    }
    /* D-10: one export at a time. The check sits immediately before the claim
       with NO await between — the claim inside runExport is synchronous before
       its first await (Pitfall 5), so the check→claim segment is atomic on the
       single-process model and a simultaneous trigger is refused, never doubled. */
    const active = getRunState();
    if (active && (active.stage === 'collecting' || active.stage === 'archiving' || active.stage === 'verifying' || active.stage === 'uploading')) {
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), user.id, user.id, 'backup_run_refused:backupRunInProgress', 0, clientIp(req), null, user.name, user.email, user.name, user.email, now()],
      );
      return fail(res, 409, 'backupRunInProgress', 'A backup is already running');
    }
    /* Fire-and-forget: runExport claims SYNCHRONOUSLY on the call itself, so
       the run id is readable from the state holder before the response leaves. */
    const started = runExport(scope);
    const runId = getRunState()?.runId;
    if (!started || !runId) {
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), user.id, user.id, 'backup_run_refused:backupRunInProgress', 0, clientIp(req), null, user.name, user.email, user.name, user.email, now()],
      );
      return fail(res, 409, 'backupRunInProgress', 'A backup is already running');
    }
    /* D-20: the STARTED attempt is on the trail too. */
    await db.run(
      'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
      [uid(), user.id, user.id, `backup_run_started:${kind}`, 0, clientIp(req), null, user.name, user.email, user.name, user.email, now()],
    );
    started.catch(err => logWarn(`backup run ${runId}: ${err?.message || err}`)); // runExport resolves by design — belt-and-braces only
    logInfo(`backup run started: ${runId} (${kind}) by ${user.email}`);
    return json(res, 200, { runId });
  }

  if (pathname === '/api/backup/runs/current' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    /* D-22: status is a BACKUP_MANAGE read — a non-holder (including a Restore
       Operator) gets the keyed backupRoleRequired 403, never a free oracle. */
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
      return fail(res, 403, 'backupRoleRequired', 'You need a backup role to see that');
    }
    /* D-19 frozen payload: scope, stage, startedAt — plus on completion the
       archive filename + whole-archive sha256. No run → { stage: 'idle' }. */
    const rs = getRunState();
    if (!rs) return json(res, 200, { stage: 'idle' });
    const payload = {
      scope: { kind: rs.scope.kind, id: rs.scope.id ?? null },
      stage: rs.stage,
      startedAt: new Date(rs.startedAt).toISOString(),
    };
    if (rs.stage === 'uploading') {
      /* D-88-5: parts progress rides the D-19 payload verbatim — the client
         renders it render-only, never derives it. */
      payload.partsDone = Number.isInteger(rs.partsDone) ? rs.partsDone : 0;
      payload.partsTotal = Number.isInteger(rs.partsTotal) ? rs.partsTotal : null;
    }
    if (rs.stage === 'done') {
      payload.filename = rs.filename;
      payload.sha256 = rs.sha256;
    }
    return json(res, 200, payload);
  }

  /* -------------- backup run history (Phase 87, 87-02, BKBCK-04/D-14) --------------
     GET /api/backup/runs?taskId=<id> — one task's run rows, newest first
     (created_at desc), capped at 50 (D-14 "capped ~50" → 50, documented).
     taskId=manual lists the manual Run-now archives (task_id NULL, D-11).
     The frozen /api/backup/runs/current GET block above is UNTOUCHED (Phase
     86 frozen surface) — this is a separate query variant. Guard chain
     order copied verbatim from that GET: sameOrigin → requireUser →
     capability gate → query; both operator roles may read (D-33-7).
     Refusals keyed; taskNotFound resolves only AFTER the gate (T-86-06 —
     never a pre-gate existence oracle). Error strings are persisted
     verbatim and rendered client-side through esc() (T-87-05 / Pitfall 7). */
  if (pathname === '/api/backup/runs' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) && !(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
      return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can read backup history');
    }
    /* Phase 92 (D-05): the ?all=1 unified cross-task history variant.
       Branched FIRST — every line of the legacy parse below is untouched
       (byte-identity pinned by the golden fixture test; D-05 grep gate:
       no new param is read on the legacy path). Same guard chain above;
       per-run scope authorization stays server-side and FAIL-CLOSED: an
       instance-scope row is covered by the operator gate, a workspace/
       project-scope row requires a LIVE membership (or instance-admin
       super-access, the server.js:1282 union) — a run the caller cannot
       see is DROPPED, never error'd (T-92-01). */
    if (pathname === '/api/backup/runs' && method === 'GET' && url.searchParams.get('all') === '1') {
      /* filters — untrusted input on a frozen surface: unknown values
         narrow to EMPTY (fail-closed), never widen. */
      const clauses = [];
      const params = [];
      const task = url.searchParams.get('task');
      if (task === 'manual') {
        clauses.push('task_id is null');
      } else if (task) {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(task)) return json(res, 200, { runs: [] });
        clauses.push('task_id = ?');
        params.push(task);
      }
      const trigger = url.searchParams.get('trigger');
      if (trigger) {
        if (trigger !== 'manual' && trigger !== 'scheduled') return json(res, 200, { runs: [] });
        clauses.push('trigger = ?');
        params.push(trigger);
      }
      const status = url.searchParams.get('status');
      if (status) {
        if (!['running', 'succeeded', 'failed', 'upload_failed', 'deleted'].includes(status)) return json(res, 200, { runs: [] });
        clauses.push('status = ?');
        params.push(status);
      }
      const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
      const limitRaw = url.searchParams.get('limit');
      const offsetRaw = url.searchParams.get('offset');
      const limit = Math.min(Math.max(Number.parseInt(limitRaw ?? '50', 10) || 50, 1), 200);
      const offset = Math.max(Number.parseInt(offsetRaw ?? '0', 10) || 0, 0);
      const rows = await db.all(
        `select id, task_id, scope, uploaded, checksum_ok, checksum_checked_at, missing_blob_count, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at, gfs_bucket
           from backup_runs ${where}
          order by created_at desc, id desc limit ? offset ?`,
        [...params, limit, offset],
      );
      const superAccess = isInstanceAdmin(user) && SUPER_ACCESS;
      /* Per-run fail-closed visibility (T-92-01). */
      const visible = async r => {
        let scope = null;
        try { scope = JSON.parse(r.scope); } catch { return false; }
        if (!scope?.kind) return false;
        if (scope.kind === 'instance') return true; // covered by the operator gate above
        if (scope.kind === 'workspace') return superAccess || !!(await membershipOf(scope.id, user.id));
        if (scope.kind === 'project') {
          if (superAccess) return true;
          for (const ws of await db.all('select id, doc from workspaces')) {
            let doc;
            try { doc = JSON.parse(ws.doc)?.data ?? {}; } catch { continue; }
            if ((Array.isArray(doc.projects) ? doc.projects : []).some(p => p?.id === scope.id) && (await membershipOf(ws.id, user.id))) return true;
          }
          return false;
        }
        return false;
      };
      const out = [];
      for (const r of rows) {
        if (!(await visible(r))) continue; // dropped, never error'd
        let scope = null;
        try { scope = JSON.parse(r.scope); } catch { scope = null; }
        const name = await scopeLabel(scope);
        const { scope: _internal, ...pub } = r;
        void _internal;
        out.push({
          ...pub,
          location: r.filename
            ? (fs.existsSync(path.join(backupsRoot(), r.filename)) ? 'local' : (r.uploaded === 1 ? 's3' : 'missing'))
            : (r.uploaded === 1 ? 's3' : 'missing'),
          /* Phase 94 renders this verbatim — the instance-scope-gfs run label,
             resolved server-side (BKNAME-01: the client derives nothing). */
          label: runLabel({ instance: instanceSlug(), scope: scope?.kind ?? 'instance', label: name, gfsBucket: r.gfs_bucket, createdAt: r.created_at }),
        });
      }
      return json(res, 200, { runs: out });
    }
    const taskId = url.searchParams.get('taskId');
    if (!taskId) return fail(res, 400, 'taskNotFound', 'That backup task does not exist');
    /* Phase 90 (SC-2, 90-02 task 1): history rows gain the render-only chrome
       inputs the location badge + download/verify CTAs gate on — location
       derived SERVER-side from run-row truth + local fs membership ONLY
       (D-89-14: never live S3 probing), the exact derivation the restore
       list uses below. The client renders these verbatim and never derives
       location or authority itself (D-23 doctrine). The raw scope JSON stays
       INTERNAL (D-14 projection contract, pinned in backup-scheduler): the
       instance tier is enforced server-side (download route), so the
       payload carries only the derived location flag — uploaded rides along
       as the honest tier input, checksum fields arrive with task 3. */
    const historyChrome = rows =>
      rows.map(r => ({
        ...r,
        location: r.filename
          ? (fs.existsSync(path.join(backupsRoot(), r.filename)) ? 'local' : (r.uploaded === 1 ? 's3' : 'missing'))
          : (r.uploaded === 1 ? 's3' : 'missing'),
      }));
    if (taskId === 'manual') {
      const rows = await db.all('select id, task_id, uploaded, checksum_ok, checksum_checked_at, missing_blob_count, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at from backup_runs where task_id is null order by created_at desc, id desc limit 50');
      return json(res, 200, { runs: historyChrome(rows) });
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(taskId)) return fail(res, 404, 'taskNotFound', 'That backup task does not exist');
    const task = await db.get('select id, retention_daily, retention_weekly, retention_monthly, retention_yearly from backup_tasks where id = ?', [taskId]);
    if (!task) {
      return fail(res, 404, 'taskNotFound', 'That backup task does not exist');
    }
    /* Phase 90 (SC-3, D-90-16 refined, 90-03 task 1): the kept-position badge
       input — computed per REQUEST from the task's CURRENT GFS policy over
       its succeeded runs (the same assignGfsBuckets + keep-N counting the
       rotation pass uses), attached ONLY to succeeded rows. Manual
       task_id-null runs (outside rotation, D-11 — the branch above) and
       non-succeeded runs carry no keptPosition: the client renders the badge
       only when the payload carries it (payload-flag chrome, D-89-21), and
       never computes retention itself (D-90-12/16 — zero client GFS math).
       Never stored: a policy change re-renders truthfully on the next read. */
    const succeededAsc = await db.all(
      "select id, created_at from backup_runs where task_id = ? and status = 'succeeded' order by created_at asc, id asc",
      [taskId],
    );
    const kept = succeededAsc.length ? gfsKeptPositions(task, succeededAsc) : null;
    const rows = await db.all('select id, task_id, uploaded, checksum_ok, checksum_checked_at, missing_blob_count, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at from backup_runs where task_id = ? order by created_at desc, id desc limit 50', [taskId]);
    return json(res, 200, {
      runs: historyChrome(rows).map(r => {
        const kp = kept?.get(r.id);
        return kp ? { ...r, keptPosition: kp } : r;
      }),
    });
  }

  /* -------------- rotation projection (Phase 90, 90-03 task 2, SC-3) --------------
     GET /api/backup/rotation-preview?taskId= — the D-90-12 on-demand dry-run
     of the GFS keep-N pass. Guard funnel copied from the house template
     (restore preview, D-89-22 idiom): sameOrigin → requireUser → throttle →
     capability → validation → lookup → projection. Throttle FIRST in the
     D-89-22 order (a refused attempt still consumed a try — the projection
     reads every succeeded run of the task, D-90-15), key `rotationproj|${user.id}`
     distinct from restorepreview. DRY-RUN: the keep-N walk is COPIED from
     runBackupRotationPass (same assignGfsBuckets input, same reverse
     counting, same explicit `id <> ?` newest-verified exclusion — the T-87-07
     SQL shape verbatim) but STOPS after candidates: NO unlink, NO
     status='deleted' write, NO audit insert — a projection mutates nothing.
     The count groups are fixed daily→weekly→monthly→yearly with honest zeros
     (D-90-14): the client renders every group, even count 0. */
  if (pathname === '/api/backup/rotation-preview' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    /* D-89-22/OQ5: the whole-task run read is the resource being guarded —
       a refused attempt still consumed a try. */
    if (tooMany(`rotationproj|${user.id}`, 10, 15 * 60 * 1000)) {
      return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    }
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
      return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can preview rotation deletions');
    }
    const taskId = url.searchParams.get('taskId');
    if (!taskId || !/^[A-Za-z0-9_-]{1,64}$/.test(taskId)) return fail(res, 404, 'taskNotFound', 'That backup task does not exist');
    const task = await db.get('select id, retention_daily, retention_weekly, retention_monthly, retention_yearly from backup_tasks where id = ?', [taskId]);
    if (!task) return fail(res, 404, 'taskNotFound', 'That backup task does not exist');
    /* The dry-run walk — inputs identical to runBackupRotationPass (D-90-13:
       one projection source, dont-hand-roll). */
    const runsAsc = await db.all(
      "select id, created_at, filename from backup_runs where task_id = ? and status = 'succeeded' order by created_at asc, id asc",
      [taskId],
    );
    if (!runsAsc.length) return json(res, 200, { noRuns: true });
    /* T-87-07 shape: the newest verified run's explicit ID resolves first. */
    const newestVerified = await db.get(
      "select id from backup_runs where task_id = ? and status = 'succeeded' order by created_at desc, id desc limit 1",
      [taskId],
    );
    const buckets = assignGfsBuckets(runsAsc);
    const keep = { daily: task.retention_daily, weekly: task.retention_weekly, monthly: task.retention_monthly, yearly: task.retention_yearly };
    const seenPerBucket = {};
    const candidates = [];
    for (const r of [...runsAsc].reverse()) {
      const bucket = buckets.get(r.id);
      seenPerBucket[bucket] = (seenPerBucket[bucket] || 0) + 1;
      if (seenPerBucket[bucket] > keep[bucket]) candidates.push(r.id);
    }
    /* The delete-set re-selection with the explicit `id <> ?` exclusion —
       the projection STOPS here: no unlink, no status write, no audit. */
    const projected = candidates.length
      ? await db.all(
          `select id, filename, created_at from backup_runs where task_id = ? and status = 'succeeded' and id in (${candidates.map(() => '?').join(',')}) and id <> ?`,
          [taskId, ...candidates, newestVerified.id],
        )
      : [];
    const groups = { daily: [], weekly: [], monthly: [], yearly: [] };
    for (const row of projected) {
      groups[buckets.get(row.id)]?.push({ id: row.id, filename: row.filename, createdAt: row.created_at });
    }
    return json(res, 200, {
      groups: {
        daily: { count: groups.daily.length, runs: groups.daily },
        weekly: { count: groups.weekly.length, runs: groups.weekly },
        monthly: { count: groups.monthly.length, runs: groups.monthly },
        yearly: { count: groups.yearly.length, runs: groups.yearly },
      },
      total: projected.length,
    });
  }

  /* -------------- restore read surface (Phase 89, 89-03, BKRST-01/D-89-14) --------------
     GET /api/backup/restore/backups — the restorable-archive list. Guard
     chain copied VERBATIM from the history GET above (never reordered —
     sameOrigin first, house rule): sameOrigin → requireUser → capability
     gate → query; a GET list read skips throttle per that GET precedent.
     The gate is RESTORE_USE ONLY (D-89-21: restore authority is distinct
     from backup authority; D-33-10/D-11: archive contents never grant it).
     Refusal keyed + audited (D-20). Rows: terminal statuses always,
     ANY status when uploaded = 1 (D-89-15 S3-only survival after local
     rotation). Location is derived SERVER-SIDE from run-row truth only
     (D-89-14): local file exists → 'local'; else uploaded = 1 → 's3';
     else 'missing'. NO ListObjectsV2 anywhere on this path — live S3
     state is never consulted; the uploaded flag (written only after the
     full D-88-8 upload verification) IS the S3 truth. The payload is
     render-only — the client renders these fields verbatim, never
     derives location or authority client-side (D-23 doctrine). */
  if (pathname === '/api/backup/restore/backups' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (!(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
      await auditBackupTask(user, 'restore_refused:restoreRoleRequired');
      return fail(res, 403, 'backupRoleRequired', 'Only a Restore Operator can list restorable backups');
    }
    const rows = await db.all(
      `select id, task_id, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, uploaded, created_at
         from backup_runs
        where status in ('succeeded','upload_failed','deleted') or uploaded = 1
        order by created_at desc, id desc limit 50`,
    );
    return json(res, 200, {
      runs: rows.map(r => ({
        runId: r.id,
        taskId: r.task_id,
        trigger: r.trigger,
        status: r.status,
        /* filename can be null (a failed run never produced an archive) —
           fs membership only applies when there is a name to check. */
        location: r.filename
          ? (fs.existsSync(path.join(backupsRoot(), r.filename)) ? 'local' : (r.uploaded === 1 ? 's3' : 'missing'))
          : (r.uploaded === 1 ? 's3' : 'missing'),
        filename: r.filename,
        sizeBytes: r.size_bytes,
        sha256: r.sha256,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        createdAt: r.created_at,
      })),
    });
  }

  /* -------------- restore preview (Phase 89, 89-03, BKRST-01/D-89-16..18) --------------
     GET /api/backup/restore/preview?runId=<id> — what would I be restoring?
     Guard chain copied VERBATIM from the family (never reordered): sameOrigin
     → requireUser → operator-keyed throttle → capability gate → runId regex
     gate → row read. The throttle deviation from the history-GET no-throttle
     precedent is DELIBERATE and documented (research OQ5): preview streams
     AND hashes the whole archive (T-89-06 DoS cost), so
     tooMany(`restorepreview|<user>`, 10, 15min) sits BEFORE the gate and
     consumes a try even on refusal (D-89-22). Gate = RESTORE_USE only
     (D-89-21), refusal keyed + audited. runId regex gate BEFORE any row
     read — no 404-vs-400 existence oracle (T-86-06 shape). Archive
     resolution from run-row truth ONLY (D-89-14/15): local file → stream-
     verify in place; else uploaded = 1 → the 88-01 downloadToStaged seam
     into restore-staging (D-89-16), temp removed in finally; else keyed
     restoreArchiveMissing. Every 89-01 reader refusal class is named on
     the consumer side (D-89-33 families 2/3): entry-gate rejections →
     restoreEntryRejected (reason variant in the detail, audited);
     structural reader corruption AND manifest parse/validation failures →
     restoreManifestCorrupt (the specific class named in the detail);
     digest mismatch → restoreShaMismatch. The response carries
     manifest-derived counts ONLY — no archive bytes, no client-side
     parsing, and no download endpoint exists (prohibition P2; Phase 90
     owns download tiering + ARCHIVE_READ). No MCP mirror (D-89-19). */
  /* -------------- restore trigger (Phase 89, plan 89-04, BKRST-02) --------------
     POST /api/backup/restore { runId, targetWorkspaceId? } — import-as-new.
     Guard chain VERBATIM from the backup trigger funnel: sameOrigin →
     requireUser → operator-keyed throttle (a refused attempt consumes a try,
     D-89-22) → capability gate BEFORE body probing (D-89-21 — a non-holder
     gets the same keyed refusal for a valid and an invalid body) → body
     checks → D-89-23 live-membership targeting (project archives need a
     target the operator is CURRENTLY a member of — the archive never confers
     anything) → concurrency slot (active export OR held restore_lock — the
     D-89-1 restore-side half, keyed backupRestoreInProgress, the shared
     vocabulary the export-side refusal rides) → claimRestoreLock → start row
     → fire-and-forget runRestore → audited start → 200 { runId } (D-89-2:
     the run id leaves BEFORE the pipeline finishes). The pipeline's finally
     always releases the lock. */
  if (pathname === '/api/backup/restore' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (tooMany(`restorerun|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    if (!(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
      await auditBackupTask(user, 'restore_refused:restoreRoleRequired');
      return fail(res, 403, 'backupRoleRequired', 'Only a Restore Operator can trigger restores');
    }
    const body = await readJson(req);
    const backupRunId = typeof body?.runId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.runId) ? body.runId : null;
    if (!backupRunId) {
      return fail(res, 400, 'restoreInvalidRunId', 'That backup run reference is invalid');
    }
    const row = await db.get('select id, task_id, scope, status, sha256, filename, uploaded from backup_runs where id = ?', [backupRunId]);
    if (!row || row.status !== 'succeeded' || !row.sha256 || !row.filename) {
      await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
      return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
    }
    let scope = null;
    try {
      scope = JSON.parse(row.scope);
    } catch {
      scope = null;
    }
    if (!scope || (scope.kind !== 'workspace' && scope.kind !== 'project')) {
      await auditBackupTask(user, 'restore_refused:restoreScopeUnsupported');
      return fail(res, 400, 'restoreScopeUnsupported', 'That archive scope cannot be restored');
    }
    /* D-89-23: targeting validates LIVE membership at trigger time, BEFORE
       the lock claim — zero live memberships → keyed restoreNoWorkspace,
       the lock row is never touched by a refused trigger.
       UAT round-8 (owner ruling): a Super Admin (isInstanceAdmin +
       SUPER_ACCESS — the same authority idiom as the /api/backup/scopes
       gate) restores a project WITHOUT live membership; the archive still
       confers nothing (the role is the authority, not the archive). */
    const targetWorkspaceId = typeof body?.targetWorkspaceId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.targetWorkspaceId) ? body.targetWorkspaceId : null;
    const superAccess = isInstanceAdmin(user) && SUPER_ACCESS;
    if (scope.kind === 'project') {
      const memberOk = targetWorkspaceId
        ? await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [targetWorkspaceId, user.id])
        : null;
      if (!memberOk && !superAccess) {
        await auditBackupTask(user, 'restore_refused:restoreNoWorkspace');
        return fail(res, 400, 'restoreNoWorkspace', 'Restoring a project needs a workspace you are currently a member of');
      }
    }
    /* Concurrency slot — the D-89-1 restore-side half: an active export
       (the frozen getRunState stage list) OR a claimed restore_lock blocks
       the trigger, keyed + audited (D-89-22). */
    const active = getRunState();
    const exportActive = !!active && ['collecting', 'archiving', 'verifying', 'uploading'].includes(active.stage);
    if (exportActive || (await restoreLockHeld())) {
      await auditBackupTask(user, 'restore_refused:restoreInProgress');
      return fail(res, 409, 'backupRestoreInProgress', 'A restore is in progress');
    }
    /* Claim SYNCHRONOUSLY before firing: a lost claim is a refused trigger,
       never a second pipeline against a held lock (D-89-31 CAS). */
    const claimed = await claimRestoreLock(user.id);
    if (!claimed) {
      await auditBackupTask(user, 'restore_refused:restoreInProgress');
      return fail(res, 409, 'backupRestoreInProgress', 'A restore is in progress');
    }
    const restoreRunId = uid();
    await emitRestoreRunEvent({ kind: 'start', runId: restoreRunId, scope: { kind: scope.kind, id: scope.id ?? null }, trigger: 'import_new', startedAt: now() });
    runRestore({
      runId: restoreRunId,
      backupRun: { filename: row.filename, sha256: row.sha256, uploaded: row.uploaded, taskId: row.task_id },
      scope: { kind: scope.kind, id: scope.id ?? null },
      targetWorkspaceId,
      operatorId: user.id,
      trigger: 'import_new',
      startedAt: now(),
      uniqueSlug: name => uniqueSlug(name),
      s3Config: S3.enabled ? S3.config() : null,
      releaseLock: () => releaseRestoreLock(user.id),
    }).catch(err => logWarn(`restore run ${restoreRunId}: ${err?.message || err}`)); // resolve-by-design — belt-and-braces only
    await auditBackupTask(user, 'restore_started:import_new', null, scope.kind);
    logInfo(`restore run started: ${restoreRunId} (${scope.kind}) by ${user.email}`);
    return json(res, 200, { runId: restoreRunId });
  }

  /* -------------- instance disaster-recovery trigger (Phase 89, plan 89-05, BKRST-04) --------------
     POST /api/backup/restore/instance { runId, confirmPhrase } — replaces
     the instance's DATA tables with an INSTANCE-scope archive's. Guard
     chain copied VERBATIM from the import-as-new funnel above (never
     reordered — sameOrigin first, house rule), with DR-specific gates:
     - the throttle is TIGHTER (D-89-22: restoreinstance|<id> 3/15min —
       the most destructive surface on the instance consumes a try per
       refused attempt);
     - the capability gate is CAP.INSTANCE_ROLES_MANAGE — deliberately
       absent from every role map (roles.js D-09/D-11), so the gate IS
       Super-Admin-only; refusal keyed operatorOnly (the existing
       instance-roles family code — NO new refusal code) + audited
       restore_refused:instanceAdminRequired;
     - the confirm phrase is re-validated SERVER-side (D-89-27/P8 — the
       client checkbox is never trusted): !== 'RESTORE-INSTANCE' exactly →
       keyed confirmPhraseMismatch + audited, checked BEFORE archive
       resolution so a refused phrase is a zero-read trigger;
     - concurrency slot + claimRestoreLock identical to import-as-new
       (D-89-1/D-89-31: one global restore pipeline, ever).
     The pipeline is fire-and-forget (resolve-by-design); the unit's
     events ride the SAME restore_runs row writer — start here with
     trigger 'instance', snapshot/stage/summary updates from the unit.
     The unit's finally ALWAYS releases the lock; D-89-25 global session
     revocation (including the initiator) is strictly post-commit inside
     the unit; DR emits NO email claims (D-89-28 — the re-login wall is
     the notification). */
  if (pathname === '/api/backup/restore/instance' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (tooMany(`restoreinstance|${user.id}`, 3, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    if (!(await hasInstanceRole(user.id, CAP.INSTANCE_ROLES_MANAGE))) {
      await auditBackupTask(user, 'restore_refused:instanceAdminRequired');
      return fail(res, 403, 'operatorOnly', 'Only a Super Admin can trigger an instance restore');
    }
    const body = await readJson(req);
    const backupRunId = typeof body?.runId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.runId) ? body.runId : null;
    if (!backupRunId) {
      return fail(res, 400, 'restoreInvalidRunId', 'That backup run reference is invalid');
    }
    if (body?.confirmPhrase !== 'RESTORE-INSTANCE') {
      await auditBackupTask(user, 'restore_refused:confirmPhraseMismatch');
      return fail(res, 400, 'confirmPhraseMismatch', 'Confirmation phrase does not match');
    }
    const row = await db.get('select id, task_id, scope, status, sha256, filename, uploaded from backup_runs where id = ?', [backupRunId]);
    if (!row || row.status !== 'succeeded' || !row.sha256 || !row.filename) {
      await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
      return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
    }
    let scope = null;
    try {
      scope = JSON.parse(row.scope);
    } catch {
      scope = null;
    }
    if (!scope || scope.kind !== 'instance') {
      await auditBackupTask(user, 'restore_refused:restoreTargetMismatch');
      return fail(res, 400, 'restoreTargetMismatch', 'An instance restore needs an instance-scope archive');
    }
    const active = getRunState();
    const exportActive = !!active && ['collecting', 'archiving', 'verifying', 'uploading'].includes(active.stage);
    if (exportActive || (await restoreLockHeld())) {
      await auditBackupTask(user, 'restore_refused:restoreInProgress');
      return fail(res, 409, 'backupRestoreInProgress', 'A restore is in progress');
    }
    const claimed = await claimRestoreLock(user.id);
    if (!claimed) {
      await auditBackupTask(user, 'restore_refused:restoreInProgress');
      return fail(res, 409, 'backupRestoreInProgress', 'A restore is in progress');
    }
    const restoreRunId = uid();
    await emitRestoreRunEvent({ kind: 'start', runId: restoreRunId, scope: { kind: 'instance', id: null }, trigger: 'instance', startedAt: now() });
    restoreInstanceUnit({
      runId: restoreRunId,
      backupRun: { filename: row.filename, sha256: row.sha256, uploaded: row.uploaded, taskId: row.task_id },
      s3Config: S3.enabled ? S3.config() : null, // the 88-01 seam — DR must fetch a rotated-away archive (90-04 e2e, Rule 1)
      operator: { id: user.id, email: user.email },
      releaseLock: () => releaseRestoreLock(user.id),
    }).catch(err => logWarn(`instance restore run ${restoreRunId}: ${err?.message || err}`)); // resolve-by-design — belt-and-braces only
    await auditBackupTask(user, 'restore_started:instance', null, 'instance');
    logInfo(`instance restore run started: ${restoreRunId} by ${user.email}`);
    return json(res, 200, { runId: restoreRunId });
  }

  /* -------------- overwrite trigger (Phase 89, plan 89-05, BKRST-03) --------------
     POST /api/backup/restore/overwrite { runId, targetId, confirmName } —
     the guarded destructive overwrite. Guard chain VERBATIM from the
     destructive funnel above (never reordered — sameOrigin first, house
     rule), with overwrite-specific gates (D-89-21/22/27):
     - the throttle is operator-keyed restoreoverwrite|<id> 5/15min
       consuming a try per attempt, refused or not (D-89-22);
     - the capability gate is CAP.BACKUP_MANAGE (D-89-21: overwrite
       authority = Backup Operator/Super Admin), refusal keyed
       backupManageRequired (the existing backup family code — NO new
       refusal code) + audited restore_refused:overwriteRoleRequired;
     - confirmName is re-validated SERVER-side against the target's exact
       CURRENT name read from the live workspaces row (D-89-27/P8 — the
       client confirmModal typeName is chrome, never the boundary);
       anything other than === on the live name → keyed
       confirmPhraseMismatch + audited, checked BEFORE archive resolution
       so a refused phrase is a near-zero-read trigger with zero state
       change;
     - the archive scope kind must match the target kind (workspace — the
       engine's overwrite containment is workspace-only, 86-D-01);
       mismatch → keyed restoreTargetMismatch BEFORE any lock claim;
     - concurrency slot identical to import-as-new/DR (D-89-1): an active
       export OR a claimed restore_lock refuses 409
       backupRestoreInProgress + audited restore_refused:restoreInProgress;
     - claimRestoreLock → start row (trigger 'overwrite') → fire-and-forget
       restoreOverwriteUnit (the unit's finally ALWAYS releases the lock and
       sweeps staging; its automatic pre_restore snapshot rides the 86
       runExport core BEFORE any mutation — P7/D-89-5) → audited
       restore_started:overwrite → 200 { runId } (D-89-2: the run id leaves
       BEFORE the pipeline finishes). */
  if (pathname === '/api/backup/restore/overwrite' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (tooMany(`restoreoverwrite|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
      await auditBackupTask(user, 'restore_refused:overwriteRoleRequired');
      return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can trigger an overwrite restore');
    }
    const body = await readJson(req);
    const backupRunId = typeof body?.runId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.runId) ? body.runId : null;
    if (!backupRunId) {
      return fail(res, 400, 'restoreInvalidRunId', 'That backup run reference is invalid');
    }
    const targetId = typeof body?.targetId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.targetId) ? body.targetId : null;
    if (!targetId) {
      await auditBackupTask(user, 'restore_refused:restoreTargetMissing');
      return fail(res, 400, 'restoreTargetMissing', 'That overwrite target is invalid');
    }
    /* BKRST-05 (95-04): project scope carries the armed target project —
       same regex-guard discipline as every other id. */
    const targetProjectId = typeof body?.targetProjectId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.targetProjectId) ? body.targetProjectId : null;
    /* D-89-27: the phrase IS the target's live name — read the CURRENT row
       and compare exactly. The client dialog is never the boundary. For
       project scope the live name is the PROJECT's name read from the
       workspace doc (the doc is fetched here for both scopes). */
    const targetRow = await db.get('select id, name, doc from workspaces where id = ?', [targetId]);
    if (!targetRow) {
      await auditBackupTask(user, 'restore_refused:restoreTargetMissing');
      return fail(res, 404, 'restoreTargetMissing', 'That overwrite target does not exist');
    }
    let confirmAgainst = targetRow.name;
    if (targetProjectId) {
      let liveProject = null;
      try {
        liveProject = (JSON.parse(targetRow.doc)?.data?.projects ?? []).find(p => p?.id === targetProjectId);
      } catch {
        liveProject = null;
      }
      if (!liveProject) {
        await auditBackupTask(user, 'restore_refused:restoreTargetMissing');
        return fail(res, 404, 'restoreTargetMissing', 'That target project does not exist in the target workspace');
      }
      confirmAgainst = liveProject.name;
    }
    if (typeof body?.confirmName !== 'string' || body.confirmName !== confirmAgainst) {
      await auditBackupTask(user, 'restore_refused:confirmPhraseMismatch');
      return fail(res, 400, 'confirmPhraseMismatch', targetProjectId ? 'The typed name does not match the target project' : 'The typed name does not match the target workspace');
    }
    const row = await db.get('select id, task_id, scope, status, sha256, filename, uploaded from backup_runs where id = ?', [backupRunId]);
    if (!row || row.status !== 'succeeded' || !row.sha256 || !row.filename) {
      await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
      return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
    }
    let scope = null;
    try {
      scope = JSON.parse(row.scope);
    } catch {
      scope = null;
    }
    if (!scope || (scope.kind !== 'workspace' && scope.kind !== 'project')) {
      await auditBackupTask(user, 'restore_refused:restoreTargetMismatch');
      return fail(res, 400, 'restoreTargetMismatch', 'An overwrite needs an archive whose scope matches the target');
    }
    /* BKRST-05 (95-04) D-05 targeting, mirroring the import-as-new
       precedent (:9669-9683): a project overwrite needs the operator to be
       a CURRENT member of the target workspace — a Super Admin (the same
       isInstanceAdmin + SUPER_ACCESS authority idiom) bypasses. The lock
       is never touched by a refused trigger. */
    const projectScope = scope.kind === 'project';
    if (projectScope) {
      const superAccess = isInstanceAdmin(user) && SUPER_ACCESS;
      const memberOk = await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [targetId, user.id]);
      if (!memberOk && !superAccess) {
        await auditBackupTask(user, 'restore_refused:restoreNoWorkspace');
        return fail(res, 400, 'restoreNoWorkspace', 'Overwriting a project needs a target workspace you are currently a member of');
      }
    }
    const active = getRunState();
    const exportActive = !!active && ['collecting', 'archiving', 'verifying', 'uploading'].includes(active.stage);
    if (exportActive || (await restoreLockHeld())) {
      await auditBackupTask(user, 'restore_refused:restoreInProgress');
      return fail(res, 409, 'backupRestoreInProgress', 'A restore is in progress');
    }
    const claimed = await claimRestoreLock(user.id);
    if (!claimed) {
      await auditBackupTask(user, 'restore_refused:restoreInProgress');
      return fail(res, 409, 'backupRestoreInProgress', 'A restore is in progress');
    }
    const restoreRunId = uid();
    await emitRestoreRunEvent({ kind: 'start', runId: restoreRunId, scope: { kind: scope.kind, id: projectScope ? scope.id : targetId }, trigger: 'overwrite', startedAt: now() });
    restoreOverwriteUnit({
      runId: restoreRunId,
      backupRun: { filename: row.filename, sha256: row.sha256, uploaded: row.uploaded, taskId: row.task_id },
      scope: projectScope ? { kind: 'project', id: scope.id } : { kind: 'workspace', id: targetId },
      operator: { id: user.id, email: user.email },
      targetWorkspaceId: targetId,
      targetProjectId: projectScope ? targetProjectId : undefined,
      releaseLock: () => releaseRestoreLock(user.id),
    }).catch(err => logWarn(`overwrite restore run ${restoreRunId}: ${err?.message || err}`)); // resolve-by-design — belt-and-braces only
    await auditBackupTask(user, 'restore_started:overwrite', null, projectScope ? 'project' : 'workspace');
    logInfo(`overwrite restore run started: ${restoreRunId} (${projectScope ? `project ${targetProjectId} in ${targetId}` : targetId}) by ${user.email}`);
    return json(res, 200, { runId: restoreRunId });
  }

  /* -------------- restore poll + history (plan 89-04) --------------
     GET /api/backup/restore/current — the active restore_runs row (status
     running, newest) or { idle: true }; GET /api/backup/restore/runs —
     restore history capped 50 newest-first (D-14 discipline, the backup
     history shape). Both: sameOrigin → requireUser → RESTORE_USE gate;
     GET reads ride WITHOUT a throttle per the history-GET precedent. */
  if (pathname === '/api/backup/restore/current' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (!(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
      return fail(res, 403, 'backupRoleRequired', 'Only a Restore Operator can watch restores');
    }
    const row = await db.get("select id, scope, status, stage, final_name, started_at from restore_runs where status = 'running' order by created_at desc limit 1");
    if (!row) return json(res, 200, { idle: true });
    return json(res, 200, {
      runId: row.id,
      stage: row.stage,
      startedAt: new Date(row.started_at).toISOString(),
      finalName: row.final_name ?? null,
    });
  }

  if (pathname === '/api/backup/restore/runs' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (!(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
      return fail(res, 403, 'backupRoleRequired', 'Only a Restore Operator can see restore history');
    }
    const rows = await db.all(
      'select id, scope, status, stage, final_name, summary, snapshot_run_id, snapshot_tag, error, started_at, finished_at, created_at from restore_runs order by created_at desc, started_at desc limit 50',
    );
    return json(res, 200, {
      runs: rows.map(r => {
        let scope = null;
        try {
          scope = JSON.parse(r.scope);
        } catch {
          scope = null;
        }
        return { ...r, scope };
      }),
    });
  }

  if (pathname === '/api/backup/restore/preview' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    /* D-89-22/OQ5: the streaming+hashing cost is the resource being
       guarded — a refused attempt still consumed a try. */
    if (tooMany(`restorepreview|${user.id}`, 10, 15 * 60 * 1000)) {
      return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    }
    if (!(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
      await auditBackupTask(user, 'restore_refused:restoreRoleRequired');
      return fail(res, 403, 'backupRoleRequired', 'Only a Restore Operator can preview restorable backups');
    }
    const runId = url.searchParams.get('runId') ?? '';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
      return fail(res, 404, 'taskNotFound', 'That backup run does not exist');
    }
    const row = await db.get(
      'select id, task_id, scope, status, size_bytes, sha256, filename, uploaded, created_at from backup_runs where id = ?',
      [runId],
    );
    if (!row) {
      await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
      return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
    }
    const localPath = row.filename ? path.join(backupsRoot(), row.filename) : null;
    const hasLocal = !!localPath && fs.existsSync(localPath);
    if (!hasLocal && row.uploaded !== 1) {
      await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
      return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
    }
    let stagedPath = null;
    try {
      let archivePath = localPath;
      if (!hasLocal) {
        /* D-89-16: S3-located archive — fetch through the 88-01 seam into
           restore-staging (same-fs with the archives); downloadToStaged
           itself refuses keyed on a stream-back digest mismatch. The key
           reconstructs from the run row exactly as the upload built it
           (D-88-6 task prefix / D-88-9 backup-manual/). */
        if (!S3.enabled) {
          await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
          return fail(res, 404, 'restoreArchiveMissing', 'That backup archive lives in S3 but no S3 destination is configured');
        }
        const back = await downloadToStaged(S3.config(), s3BackupKey({ taskId: row.task_id }, row.filename), row.sha256, restoreStagingDir());
        stagedPath = back.tmpPath;
        archivePath = back.tmpPath;
      }
      let verified;
      try {
        verified = await streamVerifyArchive(archivePath, row.sha256);
      } catch (err) {
        const code = typeof err?.code === 'string' ? err.code : '';
        if (code === 'restoreEntryRejected') {
          /* D-89-33 families 2/3: attacker-supplied entry names get their
             own keyed code with the reason variant — never a bare 500. */
          await auditBackupTask(user, 'restore_refused:restoreEntryRejected');
          return fail(res, 400, 'restoreEntryRejected', `Archive entry rejected (${err.reason ?? 'unknown'}): ${err.message}`);
        }
        if (code === 'restoreShaMismatch') {
          await auditBackupTask(user, 'restore_refused:restoreShaMismatch');
          return fail(res, 400, 'restoreShaMismatch', 'Archive checksum mismatch — this archive is not restore-eligible');
        }
        /* Structural reader corruption (chksum / oversize / truncated /
           duplicate / magic) and a manifest failing parse/validation both
           land here — the specific reader class rides the detail. */
        if (code.startsWith('restore')) {
          await auditBackupTask(user, 'restore_refused:restoreManifestCorrupt');
          return fail(res, 400, 'restoreManifestCorrupt', `Archive unreadable (${code}): ${err.message}`);
        }
        throw err; // not a keyed reader refusal — the generic 500 path owns it
      }
      const m = verified.manifest;
      const files = m.files.map(f => ({
        name: f.name,
        ext: f.ext ?? null,
        size: Number.isSafeInteger(f.size) ? f.size : 0,
        flagged: !!(f.missingBlob || f.pathEscaped || f.nameReserved || f.symlinkSkipped),
      }));
      /* Manifest-derived counts ONLY (prohibition P2) — the archive bytes
         never leave the server. checksum = the digest re-verified ON the
         streaming pass (D-89-18), which equals the run-row sha256 (the
         comparison above already refused a mismatch). */
      return json(res, 200, {
        runId: row.id,
        scope: m.scope,
        createdAt: m.createdAt,
        tables: m.tables.map(t => ({ name: t.name, classification: t.classification, rows: t.rows })),
        fileCount: files.length,
        missingBlobCount: m.files.filter(f => f.missingBlob).length,
        files,
        /* D-89-33 consumer-side honesty: non-allow-listed entry names the
           walk skipped (extraction will skip them too) ride the payload —
           render-only, the client never derives anything from them. */
        skippedEntries: verified.skippedEntries,
        checksum: verified.sha256,
      });
    } finally {
      if (stagedPath) fs.rmSync(stagedPath, { force: true }); // D-89-16: the staged temp never outlives the response
    }
  }

  /* -------------- archive download (Phase 90, 90-02, SC-2 / D-90-7..10) --------------
     GET /api/backup/download?runId=<id> — the tiered streaming download of a
     stored archive. Guard funnel copied VERBATIM from the preview route above
     in the house order (never reordered — Shared Pattern 1): sameOrigin →
     requireUser → operator-keyed throttle → capability gate → runId regex →
     row read. tooMany(`backupdownload|<user>`, 10, 15min) sits BEFORE the
     capability gate and consumes a try even on refusal (D-89-22 — the
     streaming cost is the guarded resource). Capability = BACKUP_MANAGE ||
     RESTORE_USE (both operator roles may retrieve). Tiering (D-90-7 /
     T-90-02): scope.kind === 'instance' is a full-credential dump — Super
     Admin ONLY, keyed backupDownloadAdminOnly + audited, checked AFTER the
     role gate and BEFORE location resolution (no pre-gate existence oracle,
     T-86-06); runId is regex-gated before any row read. Archive resolution
     from run-row truth ONLY (D-89-14): local file → stream straight off
     BACKUPS_DIR (zero staging leg, D-90-8); else uploaded = 1 → the 88-01
     downloadToStaged seam into restore-staging with the temp removed in a
     finally AFTER the stream completes (D-89-16: the temp never outlives the
     response); else keyed restoreArchiveMissing + audit — the fail-closed
     double with the CTA the client hides (D-90-9). The Content-Disposition
     carries the stored archive name through fileDisposition — the ONLY
     header-escaping path (D-90-8, T-12-08). Success-only audit
     backup_download:<runId> written once every gate passed and the source is
     confirmed resolvable (D-90-10); every refusal audits
     backup_download_refused:<code>. No MCP mirror (D-89-19 posture). */
  if (pathname === '/api/backup/download' && method === 'GET') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    /* D-89-22/OQ5: the streaming cost is the resource being guarded — a
       refused attempt still consumed a try. */
    if (tooMany(`backupdownload|${user.id}`, 10, 15 * 60 * 1000)) {
      return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    }
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) && !(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
      await auditBackupTask(user, 'backup_download_refused:backupRoleRequired');
      return fail(res, 403, 'backupRoleRequired', 'Only a backup operator can download backup archives');
    }
    const runId = url.searchParams.get('runId') ?? '';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
      return fail(res, 404, 'taskNotFound', 'That backup run does not exist');
    }
    const row = await db.get(
      'select id, task_id, scope, status, sha256, filename, uploaded from backup_runs where id = ?',
      [runId],
    );
    if (!row || !row.filename) {
      await auditBackupTask(user, 'backup_download_refused:restoreArchiveMissing');
      return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
    }
    let scope = null;
    try {
      scope = JSON.parse(row.scope);
    } catch {
      scope = null;
    }
    /* T-90-02: the instance tier is the confidentiality boundary — checked
       AFTER the role gate, BEFORE any location resolution or byte leaves. */
    if (scope?.kind === 'instance' && !isInstanceAdmin(user)) {
      await auditBackupTask(user, 'backup_download_refused:backupDownloadAdminOnly');
      return fail(res, 403, 'backupDownloadAdminOnly', 'Only a Super Admin can download an instance-scope archive');
    }
    const localPath = path.join(backupsRoot(), row.filename);
    const hasLocal = fs.existsSync(localPath);
    let stagedPath = null;
    try {
      if (!hasLocal) {
        if (row.uploaded !== 1) {
          await auditBackupTask(user, 'backup_download_refused:restoreArchiveMissing');
          return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
        }
        if (!S3.enabled) {
          await auditBackupTask(user, 'backup_download_refused:restoreArchiveMissing');
          return fail(res, 404, 'restoreArchiveMissing', 'That backup archive lives in S3 but no S3 destination is configured');
        }
        /* The 88-01 seam re-verifies the digest on the stream-back itself —
           a mismatch refuses keyed before any byte reaches the client. */
        const back = await downloadToStaged(S3.config(), s3BackupKey({ taskId: row.task_id }, row.filename), row.sha256, restoreStagingDir());
        stagedPath = back.tmpPath;
      }
      /* D-90-10: the success audit rides the confirmed-resolvable path —
         every refusal above carried its own backup_download_refused row. */
      await auditBackupTask(user, `backup_download:${runId}`);
      const streamPath = stagedPath || localPath;
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Content-Length': fs.statSync(streamPath).size,
        'Content-Disposition': fileDisposition(row.filename, false),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      /* Awaited so the finally below removes the staged temp only after the
         last byte left (pipe-and-forget would delete mid-stream, D-89-16). */
      await pipeline(fs.createReadStream(streamPath, { highWaterMark: 64 * 1024 }), res);
      return;
    } finally {
      if (stagedPath) fs.rmSync(stagedPath, { force: true }); // D-89-16: the staged temp never outlives the response
    }
  }

  /* -------------- verify-checksum (Phase 90, 90-02, D-90-11) --------------
     POST /api/backup/verify-checksum (JSON body { runId }) — re-hash the
     whole archive hash-on-the-pipe and compare against the stored sha256.
     Guard funnel: sameOrigin → requireUser → operator-keyed throttle
     (verifychecksum, 10/15min, BEFORE the capability gate — the re-hash cost
     is the guarded resource, D-89-22; a refused attempt still consumes a
     try) → capability BACKUP_MANAGE || RESTORE_USE — the preview tier,
     D-89-21 parity, deliberately NO scope-kind restriction: the response
     discloses only ok/timestamp, never archive content; the instance-scope
     binary restriction stays exclusive to the download route — → runId
     regex → row lookup → resolution identical to the preview route: local
     file → exported sha256AndSize on the pipe (no staging leg); else
     uploaded = 1 → S3.enabled else keyed 404, then the 88-01
     downloadToStaged seam (it re-hashes mid-stream and throws keyed on a
     digest mismatch — that keyed throw IS the verify result, caught and
     persisted, never a 5xx) with the staged temp removed in finally; else
     keyed restoreArchiveMissing + audit. A mismatch is a RESULT
     (200 { ok: false }), not a refusal — the durable keyed badge is the
     feedback (UI-SPEC), so BOTH outcomes persist checksum_ok +
     checksum_checked_at (server timestamp) and the response carries only
     ok + checkedAt. */
  if (pathname === '/api/backup/verify-checksum' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (tooMany(`verifychecksum|${user.id}`, 10, 15 * 60 * 1000)) {
      return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    }
    if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) && !(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
      await auditBackupTask(user, 'backup_verify_refused:backupRoleRequired');
      return fail(res, 403, 'backupRoleRequired', 'Only a backup operator can verify backup archives');
    }
    const body = await readJson(req);
    const runId = String(body?.runId ?? '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
      return fail(res, 404, 'taskNotFound', 'That backup run does not exist');
    }
    const row = await db.get(
      'select id, task_id, sha256, filename, uploaded from backup_runs where id = ?',
      [runId],
    );
    if (!row || !row.filename) {
      await auditBackupTask(user, 'backup_verify_refused:restoreArchiveMissing');
      return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
    }
    const localPath = path.join(backupsRoot(), row.filename);
    const hasLocal = fs.existsSync(localPath);
    let stagedPath = null;
    try {
      let ok;
      if (hasLocal) {
        /* The exported primitive: one streaming pass, hash-on-the-pipe —
           the archive is never buffered whole (Shared Pattern 5). */
        ok = (await sha256AndSize(localPath)).sha256 === row.sha256;
      } else {
        if (row.uploaded !== 1) {
          await auditBackupTask(user, 'backup_verify_refused:restoreArchiveMissing');
          return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
        }
        if (!S3.enabled) {
          await auditBackupTask(user, 'backup_verify_refused:restoreArchiveMissing');
          return fail(res, 404, 'restoreArchiveMissing', 'That backup archive lives in S3 but no S3 destination is configured');
        }
        /* The 88-01 seam re-hashes ON the stream-back and refuses keyed
           (s3Class sha256Mismatch) — that keyed throw IS the verify result
           (mismatch semantics above), so it is caught and persisted, never
           surfaced as a 5xx. The seam removed its own temp on the throw. */
        try {
          const back = await downloadToStaged(S3.config(), s3BackupKey({ taskId: row.task_id }, row.filename), row.sha256, restoreStagingDir());
          stagedPath = back.tmpPath;
          ok = back.sha256 === row.sha256; // the seam already refused on any mismatch
        } catch (err) {
          if (err?.s3Class === 'sha256Mismatch') ok = false;
          else throw err;
        }
      }
      /* Both outcomes persist with the SERVER timestamp — the client badge
         re-renders payload-derived (D-89-21 chrome doctrine). */
      const checkedAt = new Date().toISOString();
      await db.run('update backup_runs set checksum_ok = ?, checksum_checked_at = ? where id = ?', [ok ? 1 : 0, checkedAt, runId]);
      return json(res, 200, { ok, checkedAt });
    } finally {
      if (stagedPath) fs.rmSync(stagedPath, { force: true }); // D-89-16: the staged temp never outlives the response
    }
  }

  if (pathname === '/api/auth/signup' && method === 'POST') {
    /* Same origin guard as every other mutation — before the body read AND before the
       throttle, so a cross-origin POST cannot consume the victim IP's attempt budget. */
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    if (!ALLOW_SIGNUP) return fail(res, 403, 'signupDisabled', 'Sign-ups are disabled. Ask an admin for an account.');
    if (tooMany(`signup|${clientIp(req)}`, 5, 60 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const body = await readJson(req);
    const email = String(body?.email || '')
      .normalize('NFKC') // DOM-07: fullwidth ＠ (U+FF20) becomes a real '@' before any check
      .trim()
      .toLowerCase();
    const name = String(body?.name || '').trim();
    const password = String(body?.password || '');
    if (!name) return fail(res, 400, 'nameRequired', 'Enter your name');
    if (password.length < 10 || !/[0-9\W]/.test(password)) {
      return fail(res, 400, 'passwordTooWeak', 'Use at least 10 characters, including a number or symbol');
    }
    /* DP-1 (Phase 75, DOM-01): the signup door — one canonicalizing funnel,
       exact Set membership against the boot-frozen signup list. Inserted
       between passwordTooWeak and createUser; never reorders the guard chain. */
    const domainRefusal = emailDomainRefusal(email, SIGNUP_DOMAINS);
    if (domainRefusal) return fail(res, 400, 'signupDomainNotAllowed', domainRefusal.message);
    let user;
    try {
      user = await createUser(email, name, password);
    } catch (err) {
      return json(res, err.status || 500, { error: err.message, code: err.code });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    const ua = String(req.headers['user-agent'] || '');
    const ip = clientIp(req);
    await db.run('insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)', [
      sha256(token),
      user.id,
      t,
      t + SESSION_DAYS * 86400 * 1000,
      ip,
      ua,
      t, // a just-created session was seen at creation
    ]);
    setSessionCookie(req, res, token);
    logInfo(`signup: ${user.email} (${user.name}) from ${ip}`);
    return json(res, 201, { user: await userPayload(user) });
  }

  /* ------------------------------ workspaces ----------------------------- */
  if (pathname === '/api/workspaces' && method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    return json(res, 200, { workspaces: (await userPayload(user)).workspaces });
  }

  if (pathname === '/api/workspaces' && method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    /* Phase 78 (WSG-02, T-78-02, D-112): the gate is WORKSPACE_CREATION — when
       closed, ONLY the instance operator passes (the users.is_instance_admin
       DB flag). Workspace owner/admin roles never pass (tenant-bound, D-112);
       ALLOW_SIGNUP governs signup only (server.js:6758) — fully decoupled. */
    if (!WORKSPACE_CREATION && !isInstanceAdmin(user)) {
      return fail(res, 403, 'workspaceCreationClosed', 'Workspace creation is closed on this instance. Ask an operator to create one for you or invite you.');
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
      if (await wsBySlug(slug)) return fail(res, 409, 'slugTaken', 'That URL is already taken', { suggestion: await uniqueSlug(slug) });
    }
    const ws = await createWorkspace(name, slug, user);
    logInfo(`workspace created "${name}" (slug: ${ws.slug}) by ${user.email}`);
    return json(res, 201, { workspace: workspacePayload(ws, await membershipOf(ws.id, user.id)) });
  }

  /* SEARCH (Phase 58, SEARCH-01/02, D-14): plain-keyword task search.
     Membership-gated, sameOrigin; the raw query never reaches MATCH —
     searchTerms folds/tokenizes/whitelists server-side (D-13/D-15). Every
     hit is resolved in the FULL doc and filtered through
     memberCanReadProject BEFORE the payload is built and BEFORE the 30
     cap is applied (fetch 60 pre-filter so private hits never consume
     the result budget — Pitfall 5). The response shape is constant:
     always { tasks: [...] }, plain strings only, no counts/totals —
     nothing a member can probe private-project existence through. */
  const wsSearchMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/search$/);
  if (wsSearchMatch && method === 'GET') {
    const ctx = await requireWorkspace(req, res, wsSearchMatch[1], 'member');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const terms = searchTerms(url.searchParams.get('q'));
    if (!terms.length) return json(res, 200, { tasks: [] }); // D-15: <2 folded chars → empty
    const hits = await searchTasks(ctx.ws.id, terms, 60); // pre-filter over-fetch (Pitfall 5)
    const doc = JSON.parse(ctx.ws.doc);
    const tasks = new Map((Array.isArray(doc?.data?.tasks) ? doc.data.tasks : []).map(t => [t?.id, t]).filter(([id]) => id));
    const projects = new Map((Array.isArray(doc?.data?.projects) ? doc.data.projects : []).map(p => [p?.id, p]).filter(([id]) => id));
    const out = [];
    for (const hit of hits) {
      const task = tasks.get(hit.task_id);
      const project = task ? projects.get(task.project) : null;
      if (!task || !project) continue;
      /* SEARCH-02: server-side only — the client's doc is redacted, never
         trusted. A dropped hit reveals nothing: the shape stays a plain
         tasks array either way. */
      if (!(await memberCanReadProject(project, ctx.ws.id, ctx.membership.member_id))) continue;
      /* 65-04 (D-07): the subtask-hint. The FTS row text cannot attribute a
         match to a subtask (one folded blob per task), so the handler runs a
         folded substring scan over the task's own subtask titles — the same
         foldForSearch the index uses — and attaches the FIRST matching
         subtask title as a plain string. Precision improves when 65-05 folds
         subtask titles into the index (a title-only hit then reaches this
         handler at all); the field stays absent on plain hits. The title
         comes from the same permissioned task the hit already exposes — no
         new disclosure boundary (T-65-10). */
      let subtaskMatch;
      for (const st of Array.isArray(task.subtasks) ? task.subtasks : []) {
        const title = String(st?.title ?? '');
        const f = foldForSearch(title).text;
        if (f && terms.some(term => f.includes(term))) {
          subtaskMatch = title;
          break;
        }
      }
      out.push({
        id: String(task.id),
        key: String(task.key ?? ''),
        title: String(task.title ?? ''),
        snippet: searchSnippet(task, terms),
        projectId: String(task.project ?? ''),
        ...(subtaskMatch !== undefined ? { subtaskMatch: String(subtaskMatch) } : {}),
      });
      if (out.length >= 30) break; // D-14: top-30 AFTER filtering
    }
    return json(res, 200, { tasks: out });
  }

  const wsMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})$/);
  if (wsMatch && method === 'GET') {
    const ctx = await requireWorkspace(req, res, wsMatch[1]);
    if (!ctx) return;
    return json(res, 200, {
      ...workspacePayload(ctx.ws, ctx.membership),
      revision: ctx.ws.revision,
      updatedAt: ctx.ws.updated_at,
      doc: await docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership),
    });
  }

  if (wsMatch && method === 'PUT') {
    const ctx = await requireWorkspace(req, res, wsMatch[1], 'member');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');

    const body = await readJson(req);
    const revision = Number(body?.revision);
    const doc = body?.doc;
    if (!Number.isInteger(revision) || revision < 1) return fail(res, 400, 'missingRevision', 'Missing revision');
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return fail(res, 400, 'missingDocument', 'Missing workspace document');
    if (JSON.stringify(doc).length > MAX_BODY) return fail(res, 413, 'documentTooLarge', 'Workspace document is too large');

    /* D-R3 (Plan 45): the optimistic-concurrency doc write runs in one db.tx() —
       rollback on any throw, and early refusals exit via the sentinel below so
       the transaction commits harmlessly with no write. */
    const refusal = {};
    /* [2026-11-08 D-51-15] Scoped create-refusals (projectCreateForbidden) ride
       the 200 response — a whole-PUT 403 would break unrelated concurrent
       edits (Pitfall 1). */
    const createRefusals = [];
    let outcome;
    try {
      outcome = await db.tx(async scope => {
        const row = await db.get('select * from workspaces where id = ?', [ctx.ws.id]);
        if (!row) {
          refusal.code = 'workspaceNotFound';
          return null;
        }
        if (row.revision !== revision) {
          refusal.code = 'workspaceChanged';
          refusal.revision = row.revision;
          return null;
        }
        const storedDoc = JSON.parse(row.doc);
        const next = await docFromClient(doc, storedDoc, row, ctx.membership.role, ctx.membership, createRefusals);
        /* D-04: the same server mutation that drops a file record unlinks its
         binary. Strict same-PUT diff only — no broader orphan sweep. */
        const storedFileIds = new Set((Array.isArray(storedDoc?.data?.files) ? storedDoc.data.files : []).map(f => f?.id).filter(Boolean));
        const keptFileIds = new Set((Array.isArray(next?.data?.files) ? next.data.files : []).map(f => f?.id).filter(Boolean));
        /* P4-f: notifications that arrived with this PUT are candidates for a
         notification email. Diffed against the stored doc so each row emails
         exactly once. Collected now, sent after the commit — the response
         must never wait on SMTP. */
        const storedNotifIds = new Set((Array.isArray(storedDoc?.data?.notifs) ? storedDoc.data.notifs : []).map(n => n?.id).filter(Boolean));
        const newNotifs = (Array.isArray(next?.data?.notifs) ? next.data.notifs : []).filter(n => n?.id && !storedNotifIds.has(n.id));
        /* TEAM-05 (D-02): membership no longer rides the doc PUT — the
         team_members rows are edited only through the dedicated PUT
         /members/:uid/teams route, inside its own transaction. Doc writes can
         neither carry nor clobber membership. */
        const t = now();
        await db.run('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?', [JSON.stringify(next), t, row.id]);
        /* SEARCH (Phase 58, D-07): task_fts diff sync runs INSIDE this same
           transaction through the tx scope — a task written through the
           funnel is findable via db.searchTasks the moment this tx commits,
           with no findability window. Unlike the email fan-out below (which
           is deliberately post-commit), index writes must roll back with
           the doc write. */
        await syncTaskFts(scope, row.id, storedDoc, next);
        /* WHK-02 (Phase 67): webhook event diff + delivery claims, INSIDE
           this same tx — both sides canonical (docFromClient returned
           next; Pitfall 1). Claims commit or roll back with the doc write
           (reminders_sent pattern). Fail-absent: a webhook error must
           never fail the PUT. */
        let webhookClaims = 0;
        try {
          /* D-03: the event author (the PUT actor) is captured here, at diff
             time, into every envelope's context trio. */
          webhookClaims = await enqueueWebhookDeliveries(row.id, next, diffWebhookEvents(storedDoc, next), { authorName: ctx.user?.name || null });
        } catch (err) {
          logWarn(`webhook enqueue: ${err.message}`);
        }
        /* POL-02 (Phase 68, D-04): notification email transport claims ride
           THIS same tx (D-07, webhook-claim pattern) — claim + doc append
           commit together. Fail-absent: email plumbing never fails the PUT. */
        let emailClaims = 0;
        if (MAILER.enabled && newNotifs.length) {
          try {
            emailClaims = await queueNotifEmails(row, next, newNotifs);
          } catch (err) {
            logWarn(`email outbox enqueue: ${err.message}`);
          }
        }
        return { row, storedDoc, next, storedFileIds, keptFileIds, newNotifs, t, webhookClaims, emailClaims };
      });
    } catch (err) {
      // SCOPE-04: the assignee write-guard rejects with an explicit 400 —
      // db.tx has already rolled the transaction back.
      if (err?.code === 'assigneeOutOfScope') return fail(res, 400, 'assigneeOutOfScope', 'Assignee cannot read the task project');
      // [Phase 65, 65-02 D-05 T-65-04] Wholesale tree-shape rejects — same
      // tx-rollback-then-400 shape; the stored doc and the FTS index (synced
      // inside this same tx) are untouched after either reject.
      if (err?.code === 'subtaskCycle') return fail(res, 400, 'subtaskCycle', 'That change would create a subtask cycle');
      if (err?.code === 'subtaskDepth') return fail(res, 400, 'subtaskDepth', 'Subtasks cannot nest deeper than five levels');
      throw err;
    }
    if (refusal.code === 'workspaceNotFound') return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    if (refusal.code === 'workspaceChanged') return fail(res, 409, 'workspaceChanged', 'Workspace changed elsewhere', { revision: refusal.revision });
    if (!outcome) return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    {
      const { row, storedDoc, next, storedFileIds, keptFileIds, newNotifs, t, webhookClaims, emailClaims } = outcome;
      logDocChanges(row, storedDoc, next, ctx.user?.name || ctx.user?.email || 'unknown');
      /* POL-02 (Phase 68, D-04): email claims committed with the doc — the
         delivery pass fires POST-COMMIT and is never awaited into the
         response (webhook twin below, T-67-04). The 30 s tick is the
         safety net for anything the kick misses (retries included). */
      if (emailClaims) runEmailDeliveryPass().catch(err => logWarn(`email post-commit pass: ${err.message}`));
      /* P4-f push twin (Phase 59, PUSH-02): same collected-in-tx / sent-after-
         commit shape, gated on PUSH.enabled (VAPID presence) — never on
         MAILER.enabled (D-10: no digest suppression, D-11: same gate order). */
      if (PUSH.enabled && newNotifs.length) await sendPushFor(row, next, newNotifs);
      /* P4-f webhook twin (Phase 67, WHK-02/WHK-03): delivery pass fired
         POST-COMMIT and NEVER awaited into the response (T-67-04 DoS) —
         a hanging hook endpoint delays nothing; errors are logged inside
         the pass (fail-absent). Empty-claims edge skips the pass entirely. */
      if (webhookClaims) runWebhookDeliveryPass().catch(err => logWarn(`webhook post-commit pass: ${err.message}`));
      /* After the commit succeeds: missing file at unlink time is success
         (idempotent); unlink errors are logged and swallowed — the doc write
         is already committed and must not be failed by a filesystem hiccup. */
      for (const fileId of storedFileIds) {
        if (keptFileIds.has(fileId) || !/^[A-Za-z0-9_-]+$/.test(fileId)) continue;
        fs.unlink(path.join(FILES_DIR, fileId), err => {
          if (err && err.code !== 'ENOENT') logWarn(`file unlink ${fileId}: ${err.message}`);
        });
      }
      return json(res, 200, { revision: revision + 1, updatedAt: t, ...(createRefusals.length ? { refused: createRefusals } : {}) });
    }
  }

  if (wsMatch && method === 'PATCH') {
    const ctx = await requireWorkspace(req, res, wsMatch[1], 'admin');
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
      if (await wsBySlug(next)) return fail(res, 409, 'slugTaken', 'That URL is already taken');
      slug = next;
    }
    if (body?.color !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(String(body.color))) return fail(res, 400, 'invalidColor', 'Use a hex color like #1D1C1A');
      color = String(body.color);
    }
    await db.run('update workspaces set name = ?, slug = ?, color = ?, updated_at = ? where id = ?', [name, slug, color, now(), ctx.ws.id]);
    const ws = await db.get('select * from workspaces where id = ?', [ctx.ws.id]);
    logInfo(`workspace updated "${name}" (slug: ${ws.slug}) by ${ctx.user.email}`);
    return json(res, 200, { workspace: workspacePayload(ws, await membershipOf(ws.id, ctx.user.id)) });
  }

  if (wsMatch && method === 'DELETE') {
    const ctx = await requireWorkspace(req, res, wsMatch[1], 'owner');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    /* Phase 79 (research Open Q1): the OWNER-scoped delete deliberately keeps
       its any-content behavior — D-03's empty-only refusal scopes to the
       GOVERNANCE delete endpoint (/api/auth/operator/workspaces/:id/delete)
       only. This route predates Phase 79 and no decision changes it; the two
       delete paths coexist by design. */
    /* Phase 43 (D-09): the workspace doc may carry a logo reference — unlink
       the stored bytes alongside the row purge, no orphaned files (A4). */
    const deletedLogo = docLogo(ctx.ws)?.file || null;
    await db.tx(async () => {
      await db.run('delete from memberships where workspace_id = ?', [ctx.ws.id]);
      await db.run('delete from invites where workspace_id = ?', [ctx.ws.id]);
      await db.run('delete from workspaces where id = ?', [ctx.ws.id]);
    });
    if (deletedLogo) fs.unlink(path.join(LOGOS_DIR, deletedLogo), () => {});
    logInfo(`workspace deleted "${ctx.ws.name}" (slug: ${ctx.ws.slug}) by ${ctx.user.email}`);
    return json(res, 200, { deleted: true, nextSlug: (await membershipsOnly(ctx.user.id))[0]?.slug || null });
  }

  /* ------------------------------- members ------------------------------- */
  const wsMembersMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members$/);
  if (wsMembersMatch && method === 'GET') {
    const ctx = await requireWorkspace(req, res, wsMembersMatch[1]);
    if (!ctx) return;
    const doc = JSON.parse(ctx.ws.doc);
    await syncProfiles(doc, ctx.ws.id); // TEAM-01: project the team_members authority into teams[]
    return json(res, 200, {
      members: (await membersOf(ctx.ws.id)).map(row => memberPayload(row, doc, ctx.user.id)),
      invites: roleRank(ctx.membership.role) >= ROLE_RANK.admin ? await invitesOf(ctx.ws.id) : [],
    });
  }

  const wsLeaveMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/leave$/);
  if (wsLeaveMatch && method === 'POST') {
    const ctx = await requireWorkspace(req, res, wsLeaveMatch[1]);
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    if (ctx.membership.role === 'owner' && (await ownerCount(ctx.ws.id, ctx.user.id)) === 0) {
      return fail(res, 409, 'lastOwnerLeaves', 'Promote someone else to owner before you leave');
    }
    await db.tx(async () => {
      await db.run('delete from memberships where workspace_id = ? and user_id = ?', [ctx.ws.id, ctx.user.id]);
      // TEAM-01: leaving purges the team_members authority rows too.
      await db.run('delete from team_members where workspace_id = ? and user_id = ?', [ctx.ws.id, ctx.user.id]);
      await updateDoc(ctx.ws.id, doc => stripMember(doc, ctx.membership.member_id, ctx.user.id));
    });
    logInfo(`member left workspace "${ctx.ws.slug}": ${ctx.user.email}`);
    return json(res, 200, { left: true, nextSlug: (await membershipsOnly(ctx.user.id))[0]?.slug || null });
  }

  const wsMemberMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})$/);
  if (wsMemberMatch && (method === 'PATCH' || method === 'DELETE')) {
    const ctx = await requireWorkspace(req, res, wsMemberMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const target = await db.get('select * from users where id = ?', [wsMemberMatch[2]]);
    const row = target ? await membershipOf(ctx.ws.id, target.id) : null;
    if (!target || !row) return fail(res, 404, 'notAMember', 'That person is not a member of this workspace');
    if (target.id === ctx.user.id) return fail(res, 409, 'removeSelfViaLeave', 'Use “Leave workspace” to remove yourself');
    const actorRank = roleRank(ctx.membership.role);
    if (actorRank < ROLE_RANK.owner && roleRank(row.role) >= ROLE_RANK.admin) {
      return fail(res, 403, 'ownerManagedRoles', 'Only an owner can manage admins and owners');
    }

    if (method === 'DELETE') {
      if (row.role === 'owner' && (await ownerCount(ctx.ws.id, target.id)) === 0) return fail(res, 409, 'needOwner', 'Every workspace needs an owner');
      await db.tx(async () => {
        await db.run('delete from memberships where workspace_id = ? and user_id = ?', [ctx.ws.id, target.id]);
        // TEAM-01: membership is authority rows — removal purges the team set too.
        await db.run('delete from team_members where workspace_id = ? and user_id = ?', [ctx.ws.id, target.id]);
        await updateDoc(ctx.ws.id, doc => stripMember(doc, row.member_id, target.id));
      });
      logInfo(`member removed "${target.email}" from "${ctx.ws.slug}" by ${ctx.user.email}`);
      return json(res, 200, { removed: true, userId: target.id, revision: await wsRevision(ctx.ws.id) });
    }

    const body = await readJson(req);
    const nextRole = body?.role === undefined ? row.role : String(body.role).toLowerCase();
    if (!(nextRole in ROLE_RANK)) return fail(res, 400, 'unknownRole', 'Unknown role');
    if (nextRole !== row.role && nextRole === 'owner' && actorRank < ROLE_RANK.owner) {
      return fail(res, 403, 'ownerTransferOnly', 'Only an owner can transfer ownership');
    }
    if (row.role === 'owner' && nextRole !== 'owner' && (await ownerCount(ctx.ws.id, target.id)) === 0) {
      return fail(res, 409, 'needOwner', 'Every workspace needs an owner');
    }
    const title = body?.title === undefined ? undefined : String(body.title).slice(0, 60);
    /* TEAM-05 (D-02): the PATCH route no longer accepts `team` — membership is
       edited only through PUT /members/:uid/teams against the authority rows. */
    await db.tx(async () => {
      if (nextRole !== row.role) {
        await db.run('update memberships set role = ? where workspace_id = ? and user_id = ?', [nextRole, ctx.ws.id, target.id]);
        /* [2026-11-07 D-49-5] The scope column is retired — the Phase 49
           sweep cleared it; role changes no longer maintain it. */
      }
      await updateDoc(ctx.ws.id, async doc => {
        // D-05 ripple: ensureMember is async now (memberIdFor goes through the facade).
        const memberId = (await ensureMember(doc, target, nextRole)) || row.member_id;
        const profile = (doc.data.members || []).find(m => m.id === memberId || m.userId === target.id);
        if (!profile) return;
        profile.role = ROLE_LABEL[nextRole] || profile.role;
        if (title !== undefined) profile.title = title;
      });
    });
    const doc = JSON.parse((await db.get('select doc from workspaces where id = ?', [ctx.ws.id])).doc);
    if (nextRole !== row.role) logInfo(`member role ${row.role} → ${nextRole} for "${target.email}" in "${ctx.ws.slug}" by ${ctx.user.email}`);
    return json(res, 200, {
      revision: await wsRevision(ctx.ws.id),
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

  /* TEAM-01 (D-01): set a member's full team set in one call. Admin-gated — any
     admin may edit any member's teams, no owner-tier restriction (unlike role
     management). The route edits ONLY the team_members authority rows inside its
     own transaction; the document and its revision are untouched, so the response
     carries no `revision` claim (Open Question 2 / TEAM-05 precondition: another
     session's pending doc write can never be clobbered by a membership change). */
  const wsMemberTeamsMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})\/teams$/);
  if (wsMemberTeamsMatch && method === 'PUT') {
    const ctx = await requireWorkspace(req, res, wsMemberTeamsMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    const target = await db.get('select * from users where id = ?', [wsMemberTeamsMatch[2]]);
    const row = target ? await membershipOf(ctx.ws.id, target.id) : null;
    if (!target || !row) return fail(res, 404, 'notAMember', 'That person is not a member of this workspace');
    if (!Array.isArray(body?.teams)) return fail(res, 400, 'teamsRequired', 'Provide a teams array');
    if (body.teams.length > 25) return fail(res, 400, 'tooManyTeams', 'Too many teams');
    // Whitelist: every team id must be a team defined in the workspace document (T-28-02).
    const known = new Set((JSON.parse(ctx.ws.doc)?.data?.teams || []).map(t => t?.id).filter(Boolean));
    const teams = [...new Set(body.teams.map(t => String(t).slice(0, 40)))];
    if (teams.some(t => !known.has(t))) return fail(res, 400, 'unknownTeam', 'Unknown team');
    await db.tx(async () => {
      await db.run('delete from team_members where workspace_id = ? and user_id = ?', [ctx.ws.id, target.id]);
      for (const t of teams)
        await db.run('insert or ignore into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)', [
          ctx.ws.id,
          t,
          row.member_id,
          target.id,
        ]);
    });
    const doc = JSON.parse((await db.get('select doc from workspaces where id = ?', [ctx.ws.id])).doc);
    await syncProfiles(doc, ctx.ws.id); // the response projects the fresh teams[] set
    const member = memberPayload(
      {
        role: row.role,
        member_id: row.member_id,
        user_id: target.id,
        email: target.email,
        name: target.name,
        last_login_at: target.last_login_at,
        created_at: target.created_at,
      },
      doc,
      ctx.user.id,
    );
    member.teams = await teamsOfUser(ctx.ws.id, target.id); // read back from the authority, not the request
    return json(res, 200, { member });
  }

  /* Phase 52 (TRN-01, D-52-4..D-52-6): the admin transparency view — what can
     the TARGET member read, and why. The list is computed ONLY through the
     ONE funnel (memberCanReadProject) for the target member, never from the
     redacted client doc; projectAccessReason mirrors the funnel's
     short-circuit order for the label. The server-side 'admin' gate is the
     control (D-52-4 — client gating is UX only, per the 51-02 convention).
     Unknown AND absent target ids share the same keyed notAMember 404 body
     (T-52-01 — no existence oracle). Teams resolve ONCE per target per
     request (the hiddenFor pattern; never memoized across members or
     requests, D-50-3). No funnel function is edited (Phase 49/50 pins). */
  const wsMemberVisibilityMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})\/visibility$/);
  if (wsMemberVisibilityMatch && method === 'GET') {
    const ctx = await requireWorkspace(req, res, wsMemberVisibilityMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const target = await db.get('select * from users where id = ?', [wsMemberVisibilityMatch[2]]);
    const row = target ? await membershipOf(ctx.ws.id, target.id) : null;
    if (!target || !row) return fail(res, 404, 'notAMember', 'That person is not a member of this workspace');
    const targetMemberId = row.member_id || null;
    /* normalizeProjects is in-place and runs on a READ COPY of the stored doc
       (same posture as the served doc-GET: lead ∈ members push, owner
       injection into private-empty projects) — the stored bytes are never
       written by this route. */
    const doc = JSON.parse(ctx.ws.doc);
    normalizeProjects(doc);
    const memberTeams = await teamsOfMember(ctx.ws.id, targetMemberId, row);
    const projects = [];
    for (const p of doc?.data?.projects || []) {
      if (!p?.id) continue;
      if (!(await memberCanReadProject(p, ctx.ws.id, targetMemberId))) continue;
      const reason = projectAccessReason(p, targetMemberId, memberTeams) ?? 'member';
      const entry = { id: p.id, name: p.name || p.id, reason };
      /* Phase 52 UI review: for team-granted access, name the ONE first-matching
         team so the admin sees WHY without a roster. A single team name — never
         the team list, never member rosters (T-52-03). The coarse reason code is
         unchanged for backward compat. */
      if (reason === 'team') {
        const tid = memberTeams.find(t => Array.isArray(p.teams) && p.teams.includes(t));
        const tName = (Array.isArray(doc?.data?.teams) ? doc.data.teams : []).find(tm => tm?.id === tid)?.name;
        if (tName) entry.teamName = String(tName);
      }
      projects.push(entry);
    }
    return json(res, 200, { member: targetMemberId, projects });
  }

  /* Phase 60 (DASH-01..04, D-04): the admin aggregate dashboard — overdue,
     load, upcoming and activity in ONE payload computed server-side over the
     RAW stored doc. Power-admin ruling (2026-11-12): this route deliberately
     INVERTS the export route's docForClient rule — admins see full
     private-project content here; the requireWorkspace('admin') gate below is
     the only protection (D-52-4: the server gate is the control). Gate order
     copied verbatim from the Phase 52 route above: regex match →
     requireWorkspace → if (!ctx) return → sameOrigin → fail() exits, all
     BEFORE any doc parse. Read-copy posture: normalizeProjects on the parsed
     copy, the stored bytes are never written. */
  const wsDashboardMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/dashboard$/);
  if (wsDashboardMatch && method === 'GET') {
    const ctx = await requireWorkspace(req, res, wsDashboardMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    /* Server date anchor: the due-reminder funnel's own date helper (tz.js
       localParts through resolveTz — D-06: windows are server-side, one
       definition; the '' zone label rides the resolveTz default-zone
       fallback the whole app shares). Due dates are 'YYYY-MM-DD' strings —
       the same string compares the reminder pass uses. */
    const today = localParts('', new Date()).date;
    const addDaysIso = (iso, n) => {
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    /* DASH-03/D-06: activity window — the preset selector param is
       WHITELISTED (T-60-03: never passed through raw); any other value fails
       400 BEFORE any doc work — the check sits above the JSON.parse below, so
       malformed requests never pay doc-parse cost (60-03 WR-02: this ordering
       is pinned behaviorally by the corrupt-doc probe in dashboard.test.mjs). */
    const windowParam = String(url.searchParams.get('activityWindow') || '7d');
    const WINDOW_MS = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };
    if (!(windowParam in WINDOW_MS)) return fail(res, 400, 'badActivityWindow', 'activityWindow must be one of 24h, 7d, 30d');
    const doc = JSON.parse(ctx.ws.doc);
    normalizeProjects(doc);
    const projectsById = new Map((doc?.data?.projects || []).map(p => [p?.id, p]));
    const tasks = doc?.data?.tasks || [];
    /* DASH-01/D-10: overdue groups per project, oldest group first, tasks
       within groups by dueDate ascending — mirroring store.js isOver's
       semantic (due && status !== 'done' && due < today). */
    const isOpen = t => !t.archived && t.status !== 'done';
    const isOverdue = t => t?.due && isOpen(t) && today > t.due;
    const groups = new Map();
    for (const t of tasks) {
      if (!isOverdue(t)) continue;
      const g = groups.get(t.project) || {
        projectId: t.project,
        projectName: projectsById.get(t.project)?.name || t.project || '',
        tasks: [],
      };
      g.tasks.push({ key: t.key || t.id, name: t.title || t.key || t.id, due: t.due });
      groups.set(t.project, g);
    }
    const overdue = [...groups.values()]
      .map(g => ({ ...g, tasks: g.tasks.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0)) }))
      .sort((a, b) => {
        const aMin = a.tasks[0].due;
        const bMin = b.tasks[0].due;
        return aMin < bMin ? -1 : aMin > bMin ? 1 : 0;
      });
    /* DASH-02/D-07: load = OPEN tasks only, each member counted once per task
       they appear in assignees[] (the v2.1 array — read ONLY the array, never
       a scalar). Doc members only; sorted count descending (D-10). */
    const memberName = new Map((doc?.data?.members || []).map(m => [m?.id, m?.name || m?.id]));
    const counts = new Map();
    for (const t of tasks) {
      if (!isOpen(t)) continue;
      for (const mid of Array.isArray(t.assignees) ? t.assignees : []) {
        if (!mid || !memberName.has(mid)) continue;
        counts.set(mid, (counts.get(mid) || 0) + 1);
      }
    }
    const load = [...counts.entries()]
      .map(([memberId, count]) => ({ memberId, name: memberName.get(memberId), count }))
      .sort((a, b) => b.count - a.count);
    /* DASH-03/D-06: upcoming = today..+7d, not done — flat, dueDate ascending. */
    const horizon = addDaysIso(today, 7);
    const upcoming = tasks
      .filter(t => t?.due && isOpen(t) && t.due >= today && t.due <= horizon)
      .map(t => ({ key: t.key || t.id, name: t.title || t.key || t.id, due: t.due, projectId: t.project }))
      .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    /* DASH-03/D-06: activity — rows are the store.js pushActivity shape
       { id, by, verb, task, project, at, extra }; machine verbs stay on the
       wire (labels render client-side per the Phase 9 rules). Sorted `at`
       descending. The WINDOW_MS lookup above already validated the param. */
    const sinceMs = Date.now() - WINDOW_MS[windowParam];
    const activity = (doc?.data?.activity || [])
      .filter(a => a?.at >= sinceMs)
      .map(a => ({ id: a.id, by: a.by, verb: a.verb, task: a.task, project: a.project, at: a.at }))
      .sort((a, b) => b.at - a.at);
    return json(res, 200, { overdue, load, upcoming, activity });
  }

  /* Phase 60 (TRN-01/TRN-02, D-11/D-13): the member self-view — the Phase 52
     transparency funnel scoped to the CALLING member. Exactly three changes
     vs. the route above: the gate is any workspace member (viewer included —
     self-view is "any member", D-11), there is no target-member param (myId
     comes from the caller's own membership row — no 404 branch), and the
     response carries NO member echo (TRN-02: { projects } and nothing else).
     The funnel loop, the single-teamName block (T-52-03) and the
     ?? 'member' fallback are copied verbatim. teamsOfMember resolves ONCE
     per request from the caller's membership row — never memoized (D-50-3). */
  const wsSelfVisibilityMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/me\/visibility$/);
  if (wsSelfVisibilityMatch && method === 'GET') {
    const ctx = await requireWorkspace(req, res, wsSelfVisibilityMatch[1], 'viewer');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const myId = ctx.membership.member_id || null;
    const doc = JSON.parse(ctx.ws.doc);
    normalizeProjects(doc);
    const memberTeams = await teamsOfMember(ctx.ws.id, myId, ctx.membership);
    const projects = [];
    /* [2026-11-20, owner quick-task] Super-access: an operator without a real
       membership (member_id null) acts as owner inside — they read every
       project, private ones included, via the owner rank. The per-project
       memberCanReadProject funnel is member-scoped and can never admit a
       null member, so the owner-rank short-circuit comes first (mirrors
       canManageProject's role check). */
    const superOwner = ROLE_RANK[ctx.membership.role] >= ROLE_RANK.owner && ctx.membership.member_id === null; // synthetic operator membership only — D-50-5 keeps real owners blind (privacy.test.mjs:236)
    for (const p of doc?.data?.projects || []) {
      if (!p?.id) continue;
      if (!superOwner && !(await memberCanReadProject(p, ctx.ws.id, myId))) continue;
      const reason = superOwner ? 'member' : projectAccessReason(p, myId, memberTeams) ?? 'member';
      const entry = { id: p.id, name: p.name || p.id, reason };
      if (reason === 'team') {
        const tid = memberTeams.find(t => Array.isArray(p.teams) && p.teams.includes(t));
        const tName = (Array.isArray(doc?.data?.teams) ? doc.data.teams : []).find(tm => tm?.id === tid)?.name;
        if (tName) entry.teamName = String(tName);
      }
      projects.push(entry);
    }
    return json(res, 200, { projects });
  }

  /* -------------------- project membership & the guest toggle --------------------
     Phase 50 (INV-02 / VIS-04, D-50-1/2/4/7): the post-invite edit surface.
     Scope (p.members add/remove) and status (in/out via the same list) are
     p.members membership operations ONLY — no per-project roles, no suspended
     flags, no provenance records (D-50-1/D-50-2). Every mutation writes the
     CURRENT doc inside db.tx, and requireWorkspace/hiddenFor re-resolve per
     request, so the change is enforced on the very next request (D-50-3 —
     no memoization). The edit hierarchy is the stricter D-50-4 rule: only an
     owner touches an admin/owner's project access. */

  /* =====================================================================
     EXPORT-ROUTE-BEGIN — Phase 54 (54-01): POST project export.
     Funnel order IS the security property (D-54-1, R10, T-54-01/02/05):
     workspace → sameOrigin → body/format → docForClient (the ONLY raw-doc
     reference inside these markers) → 404 parity → canManageProject →
     generation → binary headers. Every failure exits through fail() as
     JSON before a single byte is generated or a header written.
     ===================================================================== */
  const exportMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/projects\/([A-Za-z0-9_-]{1,64})\/export$/);
  if (exportMatch && method === 'POST') {
    const ctx = await requireWorkspace(req, res, exportMatch[1], 'viewer');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    /* T-54-04: the extension and MIME come from this server-side map,
       never from the request. Plan 01 carries csv only; the xlsx and
       MSPDI entries arrive with their writers in plans 02 and 05. */
    const EXPORT_FORMATS = {
      csv: { ext: 'csv', mime: 'text/csv; charset=utf-8', write: model => Buffer.from(toCsv(model), 'utf8') },
      /* 54-02: the workbook writer is async — write() returns a promise the
         generation step awaits below, before any header is written. */
      xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', write: model => buildWorkbook(model) },
      /* 54-05: the MSPDI serializer is a pure string builder — the route
         converts to a UTF-8 Buffer here, the only place the extension and
         media type are chosen (T-54-20: static map, never the request). */
      mspdi: { ext: 'xml', mime: 'application/xml; charset=utf-8', write: model => Buffer.from(buildMspdi(model), 'utf8') },
    };
    const entry = body && EXPORT_FORMATS[body.format];
    if (!entry) return fail(res, 400, 'exportInvalidRequest', 'Provide a supported export format');
    if (body.scope !== undefined && body.scope !== 'view' && body.scope !== 'all') {
      return fail(res, 400, 'exportInvalidRequest', 'Scope must be view or all');
    }
    /* T-54-05: the ONLY document read this route may make — the redacted
       docForClient-shaped document. Never ctx.ws.doc. */
    const doc = await docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership);
    const project = (Array.isArray(doc?.data?.projects) ? doc.data.projects : []).find(p => p?.id === exportMatch[2]);
    if (!project) return fail(res, 404, 'projectNotFound', 'Project not found');
    if (!canManageProject(project, ctx.membership.member_id, ctx.membership.role)) {
      return fail(res, 403, 'exportForbidden', 'You do not have permission to export this project');
    }
    const locale = ctx.user.locale === 'fr' ? 'fr' : 'en';
    try {
      const model = buildExportModel(
        doc.data,
        exportMatch[2],
        {
          scope: body.scope === 'view' ? 'view' : 'all',
          ids: body.scope === 'view' && Array.isArray(body.ids) ? body.ids.slice(0, 5000).map(String) : undefined,
          options: body.options,
        },
        {
          translate: (k, v) => tFor(locale, k, v),
          labelName: id => tFor(locale, 'task.label.' + id),
          now: new Date(),
        },
      );
      if (!model) return fail(res, 404, 'projectNotFound', 'Project not found');
      const buffer = await entry.write(model);
      /* T-54-04: filename allow-list — every character outside A-Z a-z 0-9
         dot underscore hyphen becomes a hyphen; extension from the map. */
      const safeStem = value => {
        const safe = String(value || '')
          .replace(/[^A-Za-z0-9._-]+/g, '-')
          .replace(/-{2,}/g, '-')
          .replace(/^-+|-+$/g, '');
        return safe || 'project';
      };
      const name = `${safeStem(project.key)}-${model.exportDateISO}.${entry.ext}`;
      res.writeHead(200, {
        'Content-Type': entry.mime,
        'Content-Disposition': fileDisposition(name, false),
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(buffer),
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(buffer);
    } catch (err) {
      logWarn(`export failed for ${exportMatch[2]} in "${ctx.ws.slug}": ${err?.message || err}`);
      return fail(res, 500, 'exportFailed', 'Export generation failed');
    }
  }
  /* EXPORT-ROUTE-END */

  /* VIS-04 (D-50-7): the per-project "members may invite guests" toggle.
     Admin/owner-only by workspace rank (a project lead who is a plain member
     cannot flip it); default OFF everywhere. */
  const wsProjectMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/projects\/([A-Za-z0-9_-]{1,64})$/);
  if (wsProjectMatch && method === 'PATCH') {
    const ctx = await requireWorkspace(req, res, wsProjectMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    if (typeof body?.allowInviteGuests !== 'boolean') {
      return fail(res, 400, 'allowInviteGuestsRequired', 'Provide allowInviteGuests: true or false');
    }
    try {
      await db.tx(async () => {
        await updateDoc(ctx.ws.id, doc => {
          const p = (Array.isArray(doc.data.projects) ? doc.data.projects : []).find(p => p?.id === wsProjectMatch[2]);
          if (!p) {
            const err = new Error('project not found');
            err.code = 'projectNotFound';
            throw err;
          }
          p.allowInviteGuests = body.allowInviteGuests;
        });
      });
    } catch (err) {
      if (err?.code === 'projectNotFound') return fail(res, 404, 'projectNotFound', 'Unknown project');
      throw err;
    }
    logInfo(`project ${wsProjectMatch[2]} allowInviteGuests → ${body.allowInviteGuests} in "${ctx.ws.slug}" by ${ctx.user.email}`);
    return json(res, 200, { projectId: wsProjectMatch[2], allowInviteGuests: body.allowInviteGuests, revision: await wsRevision(ctx.ws.id) });
  }

  const projectTargetOf = async (ctx, uidOrBody) => {
    const target = await db.get('select * from users where id = ?', [String(uidOrBody || '')]);
    const row = target ? await membershipOf(ctx.ws.id, target.id) : null;
    return target && row ? { target, row } : null;
  };

  const wsProjectMembersMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/projects\/([A-Za-z0-9_-]{1,64})\/members$/);
  if (wsProjectMembersMatch && method === 'POST') {
    const ctx = await requireWorkspace(req, res, wsProjectMembersMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const body = await readJson(req);
    const found = await projectTargetOf(ctx, body?.userId);
    if (!found) return fail(res, 404, 'notAMember', 'That person is not a member of this workspace');
    const { target, row } = found;
    if (ROLE_RANK[ctx.membership.role] < ROLE_RANK.owner && ROLE_RANK[row.role] >= ROLE_RANK.admin) {
      return fail(res, 403, 'ownerManagedRoles', 'Only an owner can manage admins and owners');
    }
    /* [2026-11-09 INVT-03 / D-50-11] Guest scope invariant on the edit
       surface: a guest already scoped to one project cannot be granted a
       second — the validator refuses, no clamping (D-06). */
    const guestMid = row.member_id;
    if (row.role === 'viewer' && guestMid) {
      const docNow = JSON.parse(ctx.ws.doc);
      const projects = Array.isArray(docNow?.data?.projects) ? docNow.data.projects : [];
      const guestScopes = projects.filter(p => Array.isArray(p?.members) && p.members.includes(guestMid) && p.id !== wsProjectMembersMatch[2]);
      const shape = validateGuestInviteShape('viewer', [wsProjectMembersMatch[2], ...guestScopes.map(p => p.id)]);
      if (shape) return fail(res, 400, shape.code, shape.message);
    }
    try {
      await db.tx(async () => {
        await updateDoc(ctx.ws.id, async doc => {
          const p = (Array.isArray(doc.data.projects) ? doc.data.projects : []).find(p => p?.id === wsProjectMembersMatch[2]);
          if (!p) {
            const err = new Error('project not found');
            err.code = 'projectNotFound';
            throw err;
          }
          const memberId = (await ensureMember(doc, target, row.role, ctx.ws.id)) || row.member_id;
          if (!Array.isArray(p.members)) p.members = [];
          if (!p.members.includes(memberId)) p.members.push(memberId);
        });
      });
    } catch (err) {
      if (err?.code === 'projectNotFound') return fail(res, 404, 'projectNotFound', 'Unknown project');
      throw err;
    }
    logInfo(`project member "${target.email}" added to ${wsProjectMembersMatch[2]} in "${ctx.ws.slug}" by ${ctx.user.email}`);
    return json(res, 200, { added: true, userId: target.id, revision: await wsRevision(ctx.ws.id) });
  }

  const wsProjectMemberMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/projects\/([A-Za-z0-9_-]{1,64})\/members\/([A-Za-z0-9_-]{1,64})$/);
  if (wsProjectMemberMatch && method === 'DELETE') {
    const ctx = await requireWorkspace(req, res, wsProjectMemberMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const found = await projectTargetOf(ctx, wsProjectMemberMatch[3]);
    if (!found) return fail(res, 404, 'notAMember', 'That person is not a member of this workspace');
    const { target, row } = found;
    if (ROLE_RANK[ctx.membership.role] < ROLE_RANK.owner && ROLE_RANK[row.role] >= ROLE_RANK.admin) {
      return fail(res, 403, 'ownerManagedRoles', 'Only an owner can manage admins and owners');
    }
    /* [2026-11-09 INVT-03 / D-50-11] Guest scope invariant on the edit
       surface: removing a guest from their ONLY project would leave them
       scoped to zero — the validator refuses (D-06: no silent clamp, no
       role downgrade; the admin revokes the guest role explicitly if the
       access must go). */
    const guestMid = row.member_id;
    if (row.role === 'viewer' && guestMid) {
      const docNow = JSON.parse(ctx.ws.doc);
      const projects = Array.isArray(docNow?.data?.projects) ? docNow.data.projects : [];
      const guestScopes = projects.filter(p => Array.isArray(p?.members) && p.members.includes(guestMid));
      const shape = validateGuestInviteShape('viewer', guestScopes.filter(p => p.id !== wsProjectMemberMatch[2]).map(p => p.id));
      if (shape) return fail(res, 400, shape.code, shape.message);
    }
    try {
      await db.tx(async () => {
        await updateDoc(ctx.ws.id, async doc => {
          const p = (Array.isArray(doc.data.projects) ? doc.data.projects : []).find(p => p?.id === wsProjectMemberMatch[2]);
          if (!p) {
            const err = new Error('project not found');
            err.code = 'projectNotFound';
            throw err;
          }
          const memberId = (await ensureMember(doc, target, row.role, ctx.ws.id)) || row.member_id;
          if (Array.isArray(p.members)) p.members = p.members.filter(id => id !== memberId);
        });
      });
    } catch (err) {
      if (err?.code === 'projectNotFound') return fail(res, 404, 'projectNotFound', 'Unknown project');
      throw err;
    }
    logInfo(`project member "${target.email}" removed from ${wsProjectMemberMatch[2]} in "${ctx.ws.slug}" by ${ctx.user.email}`);
    return json(res, 200, { removed: true, userId: target.id, revision: await wsRevision(ctx.ws.id) });
  }

  /* ---------- workspace-admin session revocation (AUD-02, D-R1/R2/R4) ----------
     D-R1 locks the /api/w/ prefix for this route even though sibling member
     routes use /api/workspaces/. The gate order mirrors the operator route
     (Pitfall 22): sameOrigin → requireUser → throttle (D-116, every attempt
     consumes a try) → requireWorkspace('admin') → notAMember → tier rule. */
  const adminRevokeMatch = pathname.match(/^\/api\/w\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})\/revoke-sessions$/);
  if (adminRevokeMatch && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const actor = await requireUser(req, res);
    if (!actor) return;
    // D-116: keyed on the caller; refusals consume a try too.
    if (tooMany(`admin-revoke|${actor.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    const ctx = await requireWorkspace(req, res, adminRevokeMatch[1], 'admin');
    if (!ctx) return;
    const target = await db.get('select id, name, email, is_instance_admin from users where id = ?', [adminRevokeMatch[2]]);
    const membership = target ? await membershipOf(ctx.ws.id, target.id) : null;
    if (!target || !membership) return fail(res, 404, 'notAMember', 'That person is not a member of this workspace');
    // D-R2 tier refusals, in D-119 order: the instance operator first (honest
    // error copy, defense in depth), then the rank rule — strictly-below-admin
    // only. Peer admins and workspace owners are untouchable from the admin
    // tier. A self-target is allowed (D-118): it is exactly revoke-my-others.
    if (target.is_instance_admin && target.id !== actor.id) return fail(res, 403, 'ownerImmune', 'Owner accounts are immune to revocation');
    // Strictly-below-admin — but a self-target is always allowed (D-118:
    // revoke-my-others; the keep-current DELETE protects the acting session).
    if (target.id !== actor.id && ROLE_RANK[membership.role] >= ROLE_RANK.admin)
      return fail(res, 403, 'adminOnly', 'Only members below admin rank can be revoked here');
    // Keep-current (P-H) + audited transaction, same shape as the operator route:
    // DELETE + security verb + audit row in one db.tx(), all three gated on
    // del.changes > 0 (D-117); refusals never reach this point.
    const actorTokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    const out = await db.tx(async () => {
      const del = await db.run('delete from sessions where user_id = ? and token_hash != ?', [target.id, actorTokenHash]);
      const remaining = await db.get('select count(*) as n from sessions where user_id = ? and expires_at > ?', [target.id, now()]);
      if (del.changes > 0) {
        await logSecurity(target.id, 'sessions_revoked_by_workspace_admin');
        await db.run(
          'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
          [
            uid(),
            actor.id,
            target.id,
            'sessions_revoked_by_workspace_admin',
            del.changes,
            clientIp(req),
            ctx.ws.id,
            actor.name,
            actor.email,
            target.name,
            target.email,
            now(),
          ],
        );
      }
      return { revoked: del.changes, remaining: remaining.n };
    });
    return json(res, 200, out); // live post-delete counts (Pitfall 10)
  }

  /* ------------------------------- invites ------------------------------- */
  const wsInviteMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/invites$/);
  if (wsInviteMatch && method === 'POST') {
    /* VIS-04 (D-50-7): the gate lowers to member tier — a member may mint ONE
       thing only, a project-scoped guest (viewer) invite gated by the
       per-project toggle. Admins/owners keep today's full surface. */
    const ctx = await requireWorkspace(req, res, wsInviteMatch[1], 'member');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');

    const body = await readJson(req);
    const role = inviteRole(body?.role);
    /* INV-01, revised [2026-11-11 second-owner invites, owner request]: an
       owner-role invite is allowed ONLY from an owner-tier inviter —
       admins/members still hit the keyed refusal. Checked on the RAW body
       value — inviteRole() would silently coerce 'owner' to 'member' and
       mint a member invite where an escalation was attempted. HARD-02 still
       forbids a link-only owner invite (email required, enforced below and
       re-checked at accept). */
    if (
      String(body?.role || '')
        .trim()
        .toLowerCase() === 'owner' &&
      ROLE_RANK[ctx.membership.role] < ROLE_RANK.owner
    ) {
      return fail(res, 403, 'ownerInviteForbidden', 'Only an owner can invite another owner');
    }
    /* VIS-04 member-tier validation (T-50-05): viewer role only, a real
       project on the CURRENT doc, toggle ON. Each cause carries its own
       keyed refusal; team sets are a trusted admin/owner act (D-50-9) and
       never ride a member invite. */
    let inviteProject = null;
    /* [2026-11-09 INVT-03] The client sends the scope as body.scope.projects
       (SCOPE-05, api.createInvites); a scalar body.project stays the raw-API
       fallback. The candidate list is derived for ALL inviter tiers and the
       guest shape is validated BEFORE tier branching (T-53-05: the
       admin/owner path had no guest-project check today). */
    const guestProjects = Array.isArray(body?.scope?.projects)
      ? body.scope.projects
      : body?.project
        ? [body.project]
        : [];
    const guestShapeRefusal = validateGuestInviteShape(role, guestProjects);
    if (guestShapeRefusal) return fail(res, 400, guestShapeRefusal.code, guestShapeRefusal.message);
    /* VIS-04 member-tier validation (T-50-05): viewer role only, a real
       project on the CURRENT doc, toggle ON. Each cause carries its own
       keyed refusal; team sets are a trusted admin/owner act (D-50-9) and
       never ride a member invite. */
    if (ROLE_RANK[ctx.membership.role] < ROLE_RANK.admin) {
      if (role !== 'viewer') {
        return fail(res, 403, 'inviteMemberRoleCeiling', 'Members can only invite guests (viewers) to a project');
      }
      inviteProject = String(guestProjects[0] || '');
      const currentDoc = JSON.parse(ctx.ws.doc);
      const project = (Array.isArray(currentDoc?.data?.projects) ? currentDoc.data.projects : []).find(p => p?.id === inviteProject);
      if (!project) return fail(res, 400, 'inviteMemberProjectRequired', 'Unknown project');
      /* D-50-7: OFF is the default everywhere — absent and false both mean
         OFF, and nothing in the creation path ever writes it true. */
      if (project.allowInviteGuests !== true) {
        return fail(res, 403, 'inviteGuestToggleOff', 'Guest invites are off for this project');
      }
      if ((Array.isArray(body?.teams) ? body.teams : []).length > 0) {
        return fail(res, 403, 'inviteTeamsAdminOnly', 'Only admins can invite teams');
      }
    } else if (role === 'viewer') {
      /* T-53-05 (admin/owner guest invite): the validator above only
         guarantees an exactly-one candidate list — resolve it against the
         CURRENT doc so a stale/unknown id fails closed. */
      inviteProject = String(guestProjects[0]);
      const currentDoc = JSON.parse(ctx.ws.doc);
      const project = (Array.isArray(currentDoc?.data?.projects) ? currentDoc.data.projects : []).find(p => p?.id === inviteProject);
      if (!project) return fail(res, 400, 'inviteGuestProjectRequired', 'Unknown project');
      /* [2026-11-09 WR-03] The toggle applies to EVERY guest invite, admin
         tier included: accept-time re-derives allowInviteGuests from the
         CURRENT doc and fails closed (inviteGuestToggleOff), so minting an
         invite against a toggle-OFF project was a shareable link that 403'd
         on every accept — dead on arrival. The D-50-9 bypass survives for
         member/admin invites (no project scope); a guest invite IS a project
         scope, so it obeys the same gate at creation as at accept. */
      if (project.allowInviteGuests !== true) {
        return fail(res, 403, 'inviteGuestToggleOff', 'Guest invites are off for this project');
      }
    }
    /* D-07: an invite carries the full team set. Validation mirrors the PUT
       members/:uid/teams route exactly (T-28-07): per-item trim + 40-char
       slice, Set-dedup, whitelist against the doc's team definitions, cap 25.
       An absent teams field degrades to the empty set (D-03), not an error. */
    if (body?.teams !== undefined && !Array.isArray(body.teams)) return fail(res, 400, 'teamsRequired', 'Provide a teams array');
    if ((body?.teams || []).length > 25) return fail(res, 400, 'tooManyTeams', 'Too many teams');
    const knownTeams = new Set((JSON.parse(ctx.ws.doc)?.data?.teams || []).map(t => t?.id).filter(Boolean));
    const teams = [
      ...new Set(
        (body?.teams || [])
          .map(t =>
            String(t || '')
              .trim()
              .slice(0, 40),
          )
          .filter(Boolean),
      ),
    ];
    if (teams.some(t => !knownTeams.has(t))) return fail(res, 400, 'unknownTeam', 'Unknown team');
    /* [2026-11-07 D-49-5] Invite-carried scope is retired: the Phase 49
       sweep materialized stored scopes into project access lists and
       cleared the columns, so invites no longer validate, store or echo a
       scope. Grant access by adding the member to the project's access
       list instead. */
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
    /* DP-2 (Phase 75, D-03/D-04): per-email invite-list refusal riding the
       same loop as the emailOk shape check — INVITE_DOMAINS (never the
       signup list; one door, one rule, DOM-02/DOM-03). Generic copy, flat
       { email } extra so the client renders the refusal inline next to that
       field. The loop sits before db.tx, so a refused batch leaves zero rows
       (zero-side-effect). */
    for (const email of emails) {
      if (!emailOk(email)) return fail(res, 400, 'invalidEmail', `Invalid email: ${email}`, { email });
      const domainRefusal = emailDomainRefusal(email, INVITE_DOMAINS, 'inviteDomainNotAllowed', 'This email is outside the domains allowed for invites');
      if (domainRefusal) return fail(res, 400, 'inviteDomainNotAllowed', domainRefusal.message, { email });
    }
    /* HARD-02 (D-01, first enforcement point): an admin/owner invite can
       never be link-only — one pasteable URL would mint a privilege
       escalation. The link-only branch below resolves to [null]; a
       null-only body array normalizes to length 0, so both shapes are
       caught here BEFORE any insert. */
    if (ROLE_RANK[role] >= ROLE_RANK.admin && emails.length === 0) {
      return fail(res, 400, 'inviteAdminEmailRequired', 'Admin invites must be sent to an email address');
    }

    const t = now();
    const expiresAt = t + INVITE_DAYS * 86400 * 1000;
    const rows = [];
    /* D-R3: the invite batch runs in one db.tx() — rollback on any throw. The
       alreadyMember refusal exits via the sentinel below so the transaction
       rolls back nothing-but-nothing and the 409 ships after. */
    const alreadyMember = { email: null };
    try {
      await db.tx(async () => {
        await db.run('delete from invites where expires_at < ?', [t]);
        for (const email of emails.length ? emails : [null]) {
          if (email) {
            const account = await db.get('select * from users where email = ?', [email]);
            if (account && (await membershipOf(ctx.ws.id, account.id))) {
              alreadyMember.email = email;
              throw new Error('alreadyMember');
            }
            // One live invite per address: a fresh link replaces the previous one.
            await db.run('update invites set used_at = ? where workspace_id = ? and email = ? and used_at is null', [t, ctx.ws.id, email]);
          }
          const token = crypto.randomBytes(24).toString('base64url');
          await db.run(
            'insert into invites (token_hash, email, role, teams, scope, project, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,null,?,?,?,?,?)',
            [
              sha256(token),
              email,
              role,
              JSON.stringify(teams),
              /* VIS-04: only the member guest path scopes an invite to a project. */
              inviteProject,
              ctx.ws.id,
              ctx.user.id,
              t,
              expiresAt,
            ],
          );
          rows.push({ id: sha256(token), email, role, teams, scope: null, project: inviteProject, url: `${appBase(req)}/join/${token}`, expiresAt });
        }
      });
    } catch (err) {
      if (!alreadyMember.email) throw err; // genuine failure rethrows; sentinel carries the 409 refusal
    }
    if (alreadyMember.email) {
      return fail(res, 409, 'alreadyMember', `${alreadyMember.email} is already a member of ${ctx.ws.name}`, { email: alreadyMember.email, name: ctx.ws.name });
    }
    logInfo(`invite(s) created: role ${role}, ${rows.length} link(s) for "${ctx.ws.slug}" by ${ctx.user.email}`);

    // Email delivery happens after the invites are committed, so a temporary
    // SMTP failure never loses the links. The client also receives the URL.
    const workspace = ctx.ws;
    const inviter = await db.get('select name from users where id = ?', [ctx.user.id]);
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
            logError(`invite email to ${row.email} failed: ${err.message}`);
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
    const ctx = await requireWorkspace(req, res, wsInviteMatch[1], 'admin');
    if (!ctx) return;
    return json(res, 200, { invites: await invitesOf(ctx.ws.id) });
  }

  const wsInviteIdMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/invites\/([0-9a-f]{64})$/);
  if (wsInviteIdMatch && method === 'DELETE') {
    const ctx = await requireWorkspace(req, res, wsInviteIdMatch[1], 'admin');
    if (!ctx) return;
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const row = await db.get('select token_hash from invites where token_hash = ? and workspace_id = ?', [wsInviteIdMatch[2], ctx.ws.id]);
    if (!row) return fail(res, 404, 'inviteNotPending', 'That invite is no longer pending');
    await db.run('delete from invites where token_hash = ?', [row.token_hash]);
    return json(res, 200, { revoked: true });
  }

  const inviteMatch = pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{16,128})$/);
  if (inviteMatch && method === 'GET') {
    const row = await db.get('select * from invites where token_hash = ?', [sha256(inviteMatch[1])]);
    if (!row) return fail(res, 404, 'inviteInvalid', 'This invite link is not valid');
    if (row.used_at) return fail(res, 410, 'inviteAlreadyUsed', 'This invite has already been used');
    if (row.expires_at <= now()) return fail(res, 410, 'inviteExpired', 'This invite has expired');
    const ws = row.workspace_id ? await db.get('select name, slug from workspaces where id = ?', [row.workspace_id]) : null;
    return json(res, 200, {
      workspace: ws ? { name: ws.name, slug: ws.slug } : null,
      email: row.email,
      role: row.role,
      expiresAt: row.expires_at,
      existing: !!(row.email && (await db.get('select 1 from users where email = ?', [row.email]))),
    });
  }

  const acceptMatch = pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{16,128})\/accept$/);
  if (acceptMatch && method === 'POST') {
    // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    if (tooMany(`invite|${clientIp(req)}`, 5, 60 * 60 * 1000)) {
      return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
    }
    const tokenHash = sha256(acceptMatch[1]);
    const invite = await db.get('select * from invites where token_hash = ?', [tokenHash]);
    if (!invite) return fail(res, 404, 'inviteInvalid', 'This invite link is not valid');
    if (invite.used_at) return fail(res, 410, 'inviteAlreadyUsed', 'This invite has already been used');
    if (invite.expires_at <= now()) return fail(res, 410, 'inviteExpired', 'This invite has expired');
    /* HARD-02 (D-01, second enforcement point): an email-less invite row
       carrying an admin/owner role never grants that role — the creation
       route refuses to mint one and the boot sweep neutralizes stored
       legacy rows; this refusal makes any survivor harmless. */
    if (ROLE_RANK[invite.role] >= ROLE_RANK.admin && !invite.email) {
      return fail(res, 403, 'inviteAdminEmailRequired', 'Admin invites must be sent to an email address');
    }
    /* [2026-11-09 INVT-03 / D-50-11] Defensive re-derivation at accept time:
       a stored viewer invite whose scope violates the one-project invariant
       is refused before any membership write (belt-and-braces — the create
       route refuses to mint one, but a legacy/crafted row must stay inert). */
    if (invite.role === 'viewer') {
      const shape = validateGuestInviteShape('viewer', invite.project ? [invite.project] : []);
      if (shape) return fail(res, 403, shape.code, shape.message);
    }
    /* VIS-04 (D-50-8, T-50-06): the invite row is never trusted for
       authorization — a project-scoped guest invite re-derives the toggle
       from the CURRENT project doc at accept time (Phase 33 fail-closed
       pattern). A flip to OFF (or a deleted project) kills the stale invite
       without consuming it — and BEFORE any account creation or membership
       write, so the refusal leaves no side effects. */
    {
      const wsRow = invite.workspace_id ? await db.get('select doc from workspaces where id = ?', [invite.workspace_id]) : null;
      if (invite.project) {
        let project;
        try {
          const currentDoc = JSON.parse(wsRow?.doc || 'null');
          project = (Array.isArray(currentDoc?.data?.projects) ? currentDoc.data.projects : []).find(p => p?.id === invite.project) || null;
        } catch {
          project = null;
        }
        if (!project || project.allowInviteGuests !== true) {
          return fail(res, 403, 'inviteGuestToggleOff', 'Guest invites are no longer open for this project');
        }
      }
    }

    /* DP-3 (Phase 75, DOM-04/D-07): fail-closed re-derivation against the
       LIVE boot-frozen invite list — the ROW's email is the ticket, never a
       stored/resolved domain. The refusal is BEFORE any write and
       non-consuming (loosening the list revives the pending invite). When
       INVITE_DOMAINS is null (both doors unset) the gate is absent — the
       unset contract stays fail-open. The signup list is deliberately never
       consulted here (one door, one rule — DOM-03). */
    if (invite.email && INVITE_DOMAINS) {
      const acceptRefusal = emailDomainRefusal(invite.email, INVITE_DOMAINS, 'inviteDomainNoLonger', 'This invite can no longer be accepted');
      if (acceptRefusal) return fail(res, 403, 'inviteDomainNoLonger', acceptRefusal.message);
    }

    const body = await readJson(req);
    const session = await currentUser(req);
    const account = invite.email ? await db.get('select * from users where email = ?', [invite.email]) : null;
    let user = session && (!invite.email || session.email === invite.email) ? session : null;
    if (!user && account) {
      return fail(res, 409, 'accountExistsSignIn', 'An account with this email already exists. Sign in to accept the invite.', { needsSignIn: true });
    }

    if (!user) {
      /* HARD-04 (D-06): structural silent whitelist — exactly these three
         fields are read; everything else in the body is discarded by
         construction (no 400 on unknown keys: no schema probe, no breakage
         of future client fields). Role and teams come ONLY from the
         invite row below. */
      const { name: rawName, email: rawEmail, password: rawPassword } = body || {};
      const name = String(rawName || '').trim();
      const email = String(rawEmail || '')
        .trim()
        .toLowerCase();
      const password = String(rawPassword || '');
      if (!name) return fail(res, 400, 'nameRequired', 'Enter your name');
      if (!emailOk(email)) return fail(res, 400, 'enterValidEmail', 'Enter a valid email address');
      if (invite.email && invite.email !== email) return fail(res, 400, 'inviteForOtherEmail', `This invite is for ${invite.email}`, { email: invite.email });
      /* DP-3 link-only (Phase 75, DOM-04): a null-email invite is a live
         ticket for WHOMEVER holds the link — the body email (already
         trimmed+lowercased) is re-derived against the live invite list
         BEFORE createUser. Same code, same non-consuming posture (D-07). */
      const linkRefusal = emailDomainRefusal(email, INVITE_DOMAINS, 'inviteDomainNoLonger', 'This invite can no longer be accepted');
      if (linkRefusal) return fail(res, 403, 'inviteDomainNoLonger', linkRefusal.message);
      if (password.length < 10 || !/[0-9\W]/.test(password)) {
        return fail(res, 400, 'passwordTooWeak', 'Use at least 10 characters, including a number or symbol');
      }
      try {
        user = await createUser(email, name, password);
      } catch (err) {
        return json(res, err.status || 500, { error: err.message, code: err.code });
      }
    } else if (!invite.email && INVITE_DOMAINS) {
      /* DP-3 session-accept (Phase 75, CR-01 review fix): a LINK-ONLY invite
         accepted by a signed-in user must re-derive the SESSION email against
         the live invite list — the review found the two gates above (row gate
         needs invite.email; linkRefusal lives inside if (!user)) both skip
         this path. Same ticket (the user's email), same non-consuming
         posture (D-07). Email-targeted invites are already covered by the
         row gate above. */
      const sessionRefusal = emailDomainRefusal(user.email, INVITE_DOMAINS, 'inviteDomainNoLonger', 'This invite can no longer be accepted');
      if (sessionRefusal) return fail(res, 403, 'inviteDomainNoLonger', sessionRefusal.message);
    }

    /* HARD-03 (D-05): resolve explicitly — no firstWorkspace() fallback. A
       missing row fails closed to the 410 below; never a cross-tenant join. */
    const ws = await db.get('select * from workspaces where id = ?', [invite.workspace_id]);
    if (!ws) return fail(res, 410, 'workspaceGone', 'This workspace no longer exists');
    const existingMembership = await membershipOf(ws.id, user.id);
    if (!existingMembership) {
      await addMembership(
        ws,
        user,
        invite.role,
        (() => {
          try {
            return JSON.parse(invite.teams || '[]');
          } catch {
            return [];
          }
        })(),
        'invite',
      );
    }
    /* VIS-04, hoisted (50-05 WR-01): the project-scoped grant runs for EVERY
       successful acceptance — not only accounts that were not members before.
       The fail-closed re-derivation above has already run for both shapes, so
       a project-scoped invite surviving to this point is toggle-valid. For an
       existing member the membership row's member_id is used and ensureMember
       is NOT called (its match branch would rewrite match.role — a clobber);
       the ensureMember path is kept verbatim on the new-member branch. */
    if (invite.project) {
      await updateDoc(ws.id, async doc => {
        const p = (Array.isArray(doc.data.projects) ? doc.data.projects : []).find(p => p?.id === invite.project);
        if (!p) return;
        const memberId = existingMembership
          ? existingMembership.member_id || (await memberIdFor(ws.id, user))
          : await ensureMember(doc, user, invite.role, ws.id);
        if (memberId && Array.isArray(p.members) && !p.members.includes(memberId)) p.members.push(memberId);
        /* Accept-must-not-move-revision contract (invite-revision.test.mjs):
           the membership row is the source of truth and syncProfiles completes
           the roster on read; this mirrored-profile write must not charge the
           revision the inviter's client still holds. */
      }, { bumpRevision: false });
    }
    // Links sent to a specific address are single-use; joining clears every pending one for that address.
    if (invite.email) {
      await db.run('update invites set used_at = ?, used_by = ? where token_hash = ?', [now(), user.id, tokenHash]);
      await db.run('update invites set used_at = ? where workspace_id = ? and email = ? and used_at is null', [now(), ws.id, invite.email]);
    }

    const t = now();
    if (!session) {
      const token = crypto.randomBytes(32).toString('base64url');
      const ua = String(req.headers['user-agent'] || '');
      const ip = clientIp(req);
      await db.run('insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)', [
        sha256(token),
        user.id,
        t,
        t + SESSION_DAYS * 86400 * 1000,
        ip,
        ua,
        t, // a just-created session was seen at creation
      ]);
      setSessionCookie(req, res, token);
    }
    await db.run('update users set last_login_at = ? where id = ?', [t, user.id]);
    return json(res, session ? 200 : 201, {
      user: await userPayload(user),
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
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt', '.webmanifest']);
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
  if (path.basename(file) === 'index.html' || path.basename(file) === 'sw.js' || path.basename(file) === 'manifest.webmanifest') return 'no-cache';
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

/* ---------------------------- file uploads ----------------------------- */

/* Raw-body upload: stream the request body straight to disk (never buffered),
   size-capped mid-stream. On overflow we keep draining the socket (WR-05) so
   the client actually receives the 413, then destroy the write stream and
   unlink the partial file. */
function uploadBinary(req, dest) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    /* A write in flight when we destroy the stream surfaces as an 'error' on
       the WriteStream after the fs callback fires — swallow it, the httpError
       rejection is the real outcome. */
    out.on('error', () => {});
    let size = 0;
    let overflow = null;
    req.on('data', chunk => {
      if (overflow) return; // keep draining
      size += chunk.length;
      if (size > MAX_UPLOAD) {
        overflow = httpError(413, 'Upload too large', 'uploadTooLarge');
        out.destroy();
        fs.unlink(dest, () => {});
        return;
      }
      out.write(chunk);
    });
    req.on('end', () => {
      if (overflow) return reject(overflow);
      out.end(() => resolve(size));
    });
    req.on('error', err => {
      out.destroy();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function handleUpload(req, res, slug) {
  /* Guard order per the login-handler contract: cross-origin rejected before
     the body read, then the workspace/role gate, then the stream. */
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const ctx = await requireWorkspace(req, res, slug, 'member');
  if (!ctx) return; // response already sent (404 workspaceNotFound / 403 readOnlyAccess)
  const id = uid();
  await uploadBinary(req, path.join(FILES_DIR, id));
  json(res, 200, { id }); // metadata record flows through the existing doc channel
}

/* --------------------------- workspace logos ---------------------------- */

/* Phase 43 (D-01/D-03): per-workspace logo upload/serve. Dedicated storage dir
   (DATA_DIR/logos), NOT the files/ attachment system. Route-private mime map:
   D-03 deliberately serves svg inline here (same trust class as the app's own
   logo-light.svg assets; the upload is Owner/Admin role-gated) — NEVER add svg
   to FILE_INLINE_MIME, which stays attachment-only for scriptable types. */
const LOGO_MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' }; // D-03
const LOGO_RE = /^\/w\/([a-z0-9-]{2,40})\/logo$/;

/* T-43-01 (Pitfall 7): image identity is decided by server-side magic bytes,
   never the client's claimed Content-Type or extension. D-13: ~15 lines of
   prefix checks instead of an image library. SVG accepts only `<?xml` or
   `<svg` prefixes — a bare leading `<` would admit `<!DOCTYPE html>` bodies
   masquerading as images. */
function sniffLogoExt(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return null;
  const head = buf.toString('latin1', 0, Math.min(buf.length, 64)).replace(/^\s+/, '');
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'svg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  return null;
}

/* First bytes of the freshly written file — sniff AFTER uploadBinary's
   streaming completes (matches its resolve-with-size contract). */
function readLogoHead(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(64);
    const read = fs.readSync(fd, buf, 0, 64, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function docLogo(ws) {
  try {
    return JSON.parse(ws?.doc || 'null')?.data?.logo || null;
  } catch {
    return null;
  }
}

/* D-11 (Pitfall 6): THE single versioned-URL builder — every consumer
   (workspacePayload, digest, favicon swap) reuses this shape; the GET route
   ignores the ?v= param for lookup. Null when unset/malformed (D-10). */
function logoShape(row, logo) {
  if (!logo?.file || !LOGO_MIME[logo.ext]) return null;
  return { url: `/w/${row.slug}/logo?v=${logo.uploaded_at}`, ext: logo.ext, uploaded_at: logo.uploaded_at };
}

/* POST /w/:slug/logo — guard order per the login-handler contract (copied from
   handleUpload, role tightened member→admin per D-01): cross-origin rejected
   before the body read, then the workspace/role gate, then the stream. */
async function handleLogoUpload(req, res, slug) {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const ctx = await requireWorkspace(req, res, slug, 'admin');
  if (!ctx) return; // response already sent (404 workspaceNotFound / 403 adminOnly)
  const id = uid();
  const file = path.join(LOGOS_DIR, id);
  await uploadBinary(req, file); // D-04: MAX_UPLOAD cap + mid-stream 413 via uploadBinary, unchanged
  const ext = sniffLogoExt(readLogoHead(file));
  if (!ext) {
    fs.unlink(file, () => {});
    return fail(res, 400, 'invalidLogo', 'Upload a png, jpg or svg image');
  }
  /* D-09: capture the replaced file BEFORE the doc update, unlink AFTER it
     succeeds — no orphaned bytes on either path (fire-and-forget idiom). */
  const previous = docLogo(ctx.ws)?.file || null;
  const uploadedAt = Date.now();
  await updateDoc(ctx.ws.id, doc => {
    doc.data = doc.data || {};
    doc.data.logo = { ext, file: id, uploaded_at: uploadedAt };
  });
  if (previous) fs.unlink(path.join(LOGOS_DIR, previous), () => {});
  json(res, 200, {
    logo: logoShape({ slug: ctx.ws.slug }, { ext, file: id, uploaded_at: uploadedAt }),
    revision: await wsRevision(ctx.ws.id), // Pitfall 2: the doc write bumped the revision
  });
}

/* GET /w/:slug/logo — public, session-free (D-02): the workspace-scoped path
   IS the access model. No requireWorkspace, no redirect: unknown slug AND
   logo-unset answer the IDENTICAL 404 (D-10, no existence oracle, never a 302
   to the favicon). Own header set, NOT securityHeaders() — same reasoning as
   serveFileBinary (5164). Served mime derives ONLY from the server-verified
   stored ext (T-43-01); the ?v= cache-bust param is ignored for lookup (D-11). */
async function handleLogoGet(req, res, slug) {
  const ws = await wsBySlug(slug);
  const logo = ws ? docLogo(ws) : null;
  /* T-43-06: the stored id never builds a path outside LOGOS_DIR. */
  const file = logo?.file ? path.join(LOGOS_DIR, logo.file) : null;
  if (!ws || !logo || !LOGO_MIME[logo.ext] || !file || path.dirname(file) !== LOGOS_DIR) {
    return fail(res, 404, 'logoNotFound', 'Logo not found');
  }
  let stat = null;
  try {
    stat = fs.statSync(file);
  } catch {
    /* fall through to the 404 */
  }
  if (!stat?.isFile()) return fail(res, 404, 'logoNotFound', 'Logo not found');
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': LOGO_MIME[logo.ext],
    'Content-Length': stat.size,
    /* D-11: immutable is safe ONLY because every consumer URL carries ?v=<uploaded_at>. */
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  /* T-43-02 (Pitfall 4): inline svg is inert in <img> but scripts execute on
     direct top-level navigation — GitHub's svg-serving posture, sandboxed. */
  if (logo.ext === 'svg') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/* DELETE /w/:slug/logo — same gate order as the upload (D-01); D-09: unlink the
   stored file and clear the doc fields. Removing when unset answers the same
   404 logoNotFound as the GET-unset fallback (no separate oracle). */
async function handleLogoDelete(req, res, slug) {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const ctx = await requireWorkspace(req, res, slug, 'admin');
  if (!ctx) return; // response already sent (404 workspaceNotFound / 403 adminOnly)
  const logo = docLogo(ctx.ws);
  if (!logo?.file) return fail(res, 404, 'logoNotFound', 'Logo not found');
  await updateDoc(ctx.ws.id, doc => {
    if (doc.data) delete doc.data.logo;
  });
  fs.unlink(path.join(LOGOS_DIR, logo.file), () => {});
  json(res, 200, { ok: true, revision: await wsRevision(ctx.ws.id) });
}

/* ----------------------------- file serving ----------------------------- */

/* D-06: the fixed inline/attachment policy. Only the known-safe renderable
   types serve inline with their real mime; everything else — scriptable
   (svg/html), unknown, or binary — serves as `application/octet-stream` (or
   plain text for txt/md/csv) with `Content-Disposition: attachment`, never
   the upload's claimed mime. */
const FILE_INLINE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};
const FILE_ATTACHMENT_MIME = {
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  csv: 'text/plain; charset=utf-8',
};

/* T-12-08 RFC 6266 sanitizer: strip CR/LF, quotes and control characters from
   the record's name so the header cannot be split or injected, then emit both
   the ASCII fallback and the RFC 5987 UTF-8 form. */
function fileDisposition(name, inline) {
  // The control-character class is intentional: the regex MUST match control
  // characters to strip them from the header value (T-12-08 sanitizer).
  // eslint-disable-next-line no-control-regex
  const safe = String(name || 'file').replace(/[\r\n"\u0000-\u001f\u007f]/g, '');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_') || 'file';
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

/* GET/HEAD /w/:slug/file/:id — serve the stored bytes (D-07 published URL).
   Own header set, NOT securityHeaders() (Pitfall 2): inline types need
   frame-ancestors 'self' for previews instead of X-Frame-Options DENY. */
async function serveFileBinary(req, res, slug, id) {
  /* D-05: viewer minimum; unknown workspace/unauthorized already get 404/403
     with no oracle. The id must also match a record in the stored doc —
     auth and existence in one check. */
  const ctx = await requireWorkspace(req, res, slug, 'viewer');
  if (!ctx) return;
  let record = null;
  let data = null;
  try {
    data = JSON.parse(ctx.ws.doc)?.data;
    /* D-49: normalize first so a legacy scalar-`team` project reads the same
       on the file path as it does on the (normalized) doc read. Parses fresh
       above, so mutating in place never touches shared state. */
    if (data) normalizeProjects({ data });
    record = Array.isArray(data?.files) ? data.files.find(f => f?.id === id) : null;
  } catch {
    /* fall through to the 404 */
  }
  /* T-12-02: the id never builds a path outside FILES_DIR. */
  const file = path.join(FILES_DIR, id);
  if (!record || path.dirname(file) !== FILES_DIR) return fail(res, 404, 'fileNotFound', 'File not found');
  /* T-29-05: the by-id side door rides the same scope-aware funnel as the
     doc reads — a record whose project is hidden (private the caller cannot
     see, or out-of-scope) answers the SAME 404 as an unknown id so status,
     code and message give away no existence oracle. A record WITHOUT a
     project is a workspace-level attachment (uploads outside a project
     context serialize without the key) and stays member-visible — the
     pre-phase contract; only project-bound records are scope-checked. */
  if (record.project && (await hiddenFor({ data }, ctx.membership)).has(record.project)) {
    return fail(res, 404, 'fileNotFound', 'File not found');
  }
  let stat = null;
  try {
    stat = fs.statSync(file);
  } catch {
    /* missing binary = same 404 as the unknown id */
  }
  if (!stat?.isFile()) return fail(res, 404, 'fileNotFound', 'File not found');

  /* Single-range support (G-12-4): the 401/404 paths above are processed
     exactly as before and never see range logic; D-06's fixed mime/
     disposition map stays the header authority and only the three range
     fields (Accept-Ranges, Content-Range, the overridable Content-Length)
     vary.

     Parsing rules: an absent Range header, a multi-range header (any comma —
     multipart/byteranges is deliberately NOT implemented), a unit other than
     `bytes`, or any malformed shape is IGNORED — RFC 7233 allows a server to
     ignore Range, so those answer 200 with the full body. A valid single
     range is `bytes=a-b` (0 <= a <= b, end clamped to size-1), `bytes=a-`
     (end = size-1) or `bytes=-n` (n > 0; start = size-n clamped to 0, i.e.
     the last n bytes — a suffix larger than the file yields the whole file).
     An UNSATISFIABLE range (start >= size, an explicit a > b, or a suffix of
     0) answers 416 with the `Content-Range: bytes * / size` form (integer
     size) and an empty body — no stream is created. If-Range is deliberately
     not honored: responses are `Cache-Control: private, max-age=3600`, so a
     stale 206 is a bounded, self-healing risk, and pdf.js does not require
     the validator. */
  let range = null;
  let unsatisfiable = false;
  /* CR-01: an empty representation has no bytes to range over — a suffix
     range (`bytes=-N`) would otherwise derive end = -1 and emit a malformed
     `Content-Range: bytes 0--1/0` (and a synchronous ERR_OUT_OF_RANGE from
     createReadStream after the headers are sent). Ranges are optional to
     honor (RFC 9110 §14.2), so a zero-byte file simply ignores the header
     and answers 200 with its (empty) full representation. */
  const rawRange = typeof req.headers.range === 'string' && stat.size > 0 ? req.headers.range.trim() : '';
  if (rawRange && !rawRange.includes(',')) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rawRange);
    if (m && (m[1] !== '' || m[2] !== '')) {
      if (m[1] === '') {
        const n = Number(m[2]);
        if (n === 0) unsatisfiable = true;
        else range = { start: Math.max(0, stat.size - n), end: stat.size - 1 };
      } else {
        const a = Number(m[1]);
        const b = m[2] === '' ? stat.size - 1 : Math.min(Number(m[2]), stat.size - 1);
        if (a >= stat.size || (m[2] !== '' && Number(m[2]) < a)) unsatisfiable = true;
        else range = { start: a, end: b };
      }
    }
  }

  const ext = path
    .extname(String(record.name || ''))
    .toLowerCase()
    .replace(/^\./, '');
  const mime = FILE_INLINE_MIME[ext] || FILE_ATTACHMENT_MIME[ext] || 'application/octet-stream';
  const inline = Boolean(FILE_INLINE_MIME[ext]);

  /* T-12-16/DoS T-12-17: the 416 is header-only — no workspace/record body,
     no stream — so hostile range syntax cannot amplify anything. */
  if (unsatisfiable) {
    res.writeHead(416, {
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes */${stat.size}`,
    });
    return res.end();
  }

  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Content-Disposition': fileDisposition(record.name, inline),
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  };
  if (inline) headers['Content-Security-Policy'] = "frame-ancestors 'self'";
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    headers['Content-Length'] = range.end - range.start + 1;
  }

  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file, range ? { start: range.start, end: range.end } : undefined);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/* Phase 42 (UNSUB-02): the RFC 8058 one-click unsubscribe landing handler.
   SECURITY CONTRACT (D-01..D-10, SC-1..SC-4) — pinned by test/unsubscribe-route.test.mjs
   in the same plan as this route (D-13):

   Token model: the :token is the Phase 41 FROZEN contract (0x01 ‖ wsId(36B) ‖
   userId(36B) ‖ HMAC-SHA256), verified verify-then-decode through the existing
   timing-safe helpers (verifyUnsubscribeToken → decodeUnsubscribePayload).
   unsubscribeHmacKey() is null without MASTER_KEY — a null key IS a
   verification failure → neutral page, never 500.

   Method allow-list: exactly {GET, POST}; every other method (incl. HEAD —
   conflicts with serveStatic's GET/HEAD habit) → 405 methodNotAllowed with an
   `Allow: GET, POST` response header and the generic JSON error envelope.

   Replay posture (D-09): no token burn, no 410, no claim key — repeated POSTs
   re-merge email_digest=false (idempotent convergent upsert creating the row
   if sparse) and receive the byte-identical response. The upsert is
   unconditional for valid tokens (orphan rows for deleted users are harmless —
   the digest gate joins memberships), keeping the response a pure function of
   token validity. Merge source is getStoredNotifPrefs (whitelist-filtered,
   K-10) — NEVER blind-replace the row.

   Response matrix (D-03/D-04): every token outcome (valid, forged, stale,
   rotated-out, garbage) answers 200 text/html with the SAME one-template page
   and identical status/headers — only the localized body text differs
   (verified vs neutral). GET is a stateless no-op: same neutral page, zero
   mutation (D-05). The 429 throttle is token-blind and orthogonal to this
   matrix: it keys on the client IP ONLY (never the token — a token key would
   burn budgets and open a 429-vs-200 existence oracle) and fires BEFORE
   verification. Budget: `unsub|<ip>`, 10 attempts / 15 min (login-family).

   sameOrigin exemption (D-07): the unguessable token IS the CSRF defence — no
   cookies and no Sec-Fetch headers arrive from a mail client, so the
   Fetch-Metadata navigation guard (which lives inside the file-route branch)
   is structurally bypassed by this separate branch. No session is read.

   Logging (SC-3): this branch sits OUTSIDE the /api/ chain — the finish
   handler logs only /api/ pathnames, so the token never reaches request logs.
   NEVER call logSecurity/logAct/logDebug with the token, and never write it to
   an activity row. The POST body is never read (Node discards unread bodies
   when the response ends). The page needs no <meta noindex>/robots tags — the
   URL is per-recipient, unguessable and never crawled.

   Ordering: intercepted BEFORE serveStatic (which 405s non-GET with
   Allow: GET, HEAD and SPA-fallbacks GET — both wrong here). */
async function handleUnsubscribe(req, res, token) {
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'methodNotAllowed', 'Method not allowed');
  }
  /* Token-blind, IP-keyed throttle BEFORE verification (D-08; login-family). */
  if (tooMany(`unsub|${clientIp(req)}`, 10, 15 * 60 * 1000)) {
    return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  }
  const key = unsubscribeHmacKey();
  const valid = !!key && verifyUnsubscribeToken(key, token);
  const payload = valid ? decodeUnsubscribePayload(token) : null;
  if (payload && method === 'POST') {
    /* D-10: merge-upsert the stored prefs row (convergent, replay-safe,
       creates the row if sparse). Merge source is getStoredNotifPrefs
       (whitelist-filtered, K-10) — NEVER blind-replace the row.
       Phase 91 (D-02): the GLOBAL 0x02 token carries no wsId — the flip
       applies to EVERY workspace the user is a member of (one footer link
       unsubscribes the whole account's digests). The 0x01 path keeps its
       exact (token.wsId, token.userId) scope, byte-unchanged. */
    const targets = payload.wsId
      ? [payload.wsId]
      : (await db.all('select workspace_id from memberships where user_id = ?', [payload.userId])).map(m => m.workspace_id);
    for (const wsId of targets) {
      const merged = { ...(await getStoredNotifPrefs(payload.userId, wsId)), email_digest: false };
      await db.run('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)', [
        wsId,
        payload.userId,
        JSON.stringify(merged),
      ]);
    }
  }
  /* D-02 (post-verification only): the page locale rides the token user's
     users.locale row, clamped exactly like the I18N-01 pattern — NULL,
     missing-row and malformed values degrade to 'en'. */
  let locale = 'en';
  if (payload) {
    const row = await db.get('select locale from users where id = ?', [payload.userId]);
    locale = row?.locale === 'fr' ? 'fr' : 'en';
  }
  const message = tFor(locale, valid && method === 'POST' ? 'notif.unsubscribe.verified' : 'notif.unsubscribe.neutral');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(buildUnsubscribePage(message));
}

/* ------------------------------- MCP ----------------------------------- */
/* The /mcp endpoint (MCP-01): streamable HTTP mounted in the dispatch below,
   BEFORE the /api/ chain. Auth is a bearer API key (api_keys table), never a
   session cookie, so the sameOrigin CSRF gate structurally never applies.
   See mcp.js for the full contract. */
/* `db` is assigned inside connectDb() at boot — after this module-level
   createMcp() call — so MCP gets a forwarding stub that resolves the live
   facade at call time instead of a captured null (merge of Phase 45 × 46). */
const mcpDb = {
  get: async (...args) => {
    return db.get(...args);
  },
  all: async (...args) => {
    return db.all(...args);
  },
  run: async (...args) => {
    return db.run(...args);
  },
  tx: async (...args) => {
    return db.tx(...args);
  },
};
const MCP = createMcp({ db: mcpDb, now, uid, clientIp, logInfo, logWarn, tooMany, maxBody: MAX_BODY, ROLE_RANK });

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
    /* Upload POST must be intercepted before serveStatic (which 405s non-GET). */
    const uploadMatch = url.pathname.match(/^\/w\/([a-z0-9-]{2,40})\/files$/);
    if (uploadMatch && req.method === 'POST') {
      await handleUpload(req, res, uploadMatch[1]);
    } else if (/^\/w\/([a-z0-9-]{2,40})\/file\/([A-Za-z0-9_-]+)$/.test(url.pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
      /* The file GET must be intercepted before serveStatic (Pitfall 1): the
         extensionless /w/:slug/file/:id path would fall into the SPA fallback.
         D-13 (revised, plan 12-05): this route is BYTE-ONLY. Every consumer —
         the preview modal's iframe, a fetch — receives the workspace-scoped
         bytes; serveFileBinary's D-06 fixed inline/attachment header map is
         the sole header authority on this route.

         T-12-13 — REOPENED on user instruction in UAT test 2 (G-12-5, plan
         12-07): an UNAUTHENTICATED top-level navigation — Sec-Fetch-Dest:
         document, or a navigation with no Fetch Metadata at all — now 302-
         redirects to /login?next=<path> instead of answering 404/401 JSON,
         so a pasted file URL greets a logged-out browser with the login page
         and returns it to the bytes after sign-in. The `next` value is built
         ONLY from url.pathname (never the query string, never a client
         parameter), so the target is same-origin and path-only by
         construction and an open redirect is structurally impossible; the
         leading-slash assertion is defense in depth (T-12-15).
         The D-05 404 no-oracle (T-12-16) is preserved: the discrimination
         happens here BEFORE any workspace or record lookup, so the 302 is
         byte-identical for real, unknown and foreign slugs — it answers "no
         session" only, never "not a member". The modal's iframe and every
         fetch-style destination (iframe/frame/empty) keep the JSON 401
         signInRequired, and an authenticated-but-unauthorized caller still
         404s through serveFileBinary regardless of destination. Do not touch
         requireUser/requireWorkspace themselves (every other route keeps its
         JSON 401), securityHeaders, the SPA fallback, or any other route. */
      const fileMatch = url.pathname.match(/^\/w\/([a-z0-9-]{2,40})\/file\/([A-Za-z0-9_-]+)$/);
      const dest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
      if (!(await currentUser(req)) && (dest === 'document' || dest === '')) {
        const next = `/login?next=${encodeURIComponent(url.pathname)}`;
        if (next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.includes('://')) {
          res.writeHead(302, { Location: next });
          return res.end();
        }
      }
      await serveFileBinary(req, res, fileMatch[1], fileMatch[2]);
    } else if (/^\/unsubscribe\/([A-Za-z0-9_-]+)$/.test(url.pathname)) {
      /* The unsubscribe route is intercepted BEFORE the /api/ branch (whose
         finish handler logs pathnames — the token must never be logged) and
         BEFORE serveStatic (which 405s non-GET and SPA-fallbacks GET).
         See the contract block above handleUnsubscribe. */
      const unsubMatch = url.pathname.match(/^\/unsubscribe\/([A-Za-z0-9_-]+)$/);
      await handleUnsubscribe(req, res, unsubMatch[1]);
    } else if (LOGO_RE.test(url.pathname)) {
      /* Phase 43 (D-01/D-02): logo POST/GET intercepted BEFORE serveStatic
         (which 405s non-GET and SPA-fallbacks the extensionless GET — Pitfall 1)
         and before the /api/ branch. */
      const logoMatch = url.pathname.match(LOGO_RE);
      const logoMethod = req.method.toUpperCase();
      if (logoMethod === 'POST') await handleLogoUpload(req, res, logoMatch[1]);
      else if (logoMethod === 'DELETE') await handleLogoDelete(req, res, logoMatch[1]);
      else if (logoMethod === 'GET' || logoMethod === 'HEAD') await handleLogoGet(req, res, logoMatch[1]);
      else {
        res.setHeader('Allow', 'GET, HEAD, POST, DELETE');
        fail(res, 405, 'methodNotAllowed', 'Method not allowed');
      }
    } else if (url.pathname === '/mcp' || url.pathname === '/mcp/') {
      /* MCP-01: intercepted BEFORE the /api/ branch (whose finish handler logs
         /api/ pathnames and whose sameOrigin gate never applies here) and
         before serveStatic (which would SPA-fallback the GET). Auth is the
         bearer API key inside handle(); failures answer JSON 401/429, never
         the login redirect — a non-browser client has no login page. */
      await MCP.handle(req, res);
    } else if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      res.on('finish', () => {
        if (url.pathname !== '/api/health') logDebug(`${req.method} ${url.pathname} ${res.statusCode} ${now() - started}ms`);
      });
    } else {
      serveStatic(req, res, url);
    }
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) logError(err);
    if (!res.headersSent) json(res, status, { error: status >= 500 ? 'Internal server error' : err.message, code: err.code });
    else res.end();
  }
});

async function backupCli(target) {
  const dest = path.resolve(target || path.join(DATA_DIR, `projects-${new Date().toISOString().replace(/[:.]/g, '-')}.db`));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // D-09: wal_checkpoint + vacuum into are SQLite-only — on pg this CLI no-ops.
  await sqliteOnly(async () => {
    await db.run('pragma wal_checkpoint(truncate)');
    await db.run(`vacuum into '${dest.replaceAll("'", "''")}'`);
  }, 'cli backup');
  logInfo(dest);
  await db.close();
}

async function addUserCli(args) {
  const email = args[0];
  const name = args[1];
  const slug = args[2];
  if (!email) {
    logError('usage: node server.js --add-user <email> [name] [workspace-slug]');
    process.exit(1);
  }
  await ensureWorkspace();
  const ws = slug ? await wsBySlug(slug) : await firstWorkspace();
  if (!ws) {
    logError(slug ? `no workspace with slug ${slug}` : 'no workspace available');
    process.exit(1);
  }
  const password = process.env.USER_PASSWORD || crypto.randomBytes(9).toString('base64url');
  try {
    const user = await createUser(email, name, password);
    await addMembership(ws, user, 'member', [], 'manual');
    logInfo(`created ${user.email} in ${ws.slug}`);
    if (!process.env.USER_PASSWORD) logInfo(`password: ${password}`);
  } catch (err) {
    logError(err.message);
    process.exitCode = 1;
  }
  await db.close();
}

async function setPasswordCli(args) {
  const email = String(args[0] || '')
    .trim()
    .toLowerCase();
  if (!email) {
    logError('usage: node server.js --set-password <email>');
    process.exit(1);
  }
  const row = await db.get('select id from users where email = ?', [email]);
  if (!row) {
    logError(`no account for ${email}`);
    process.exit(1);
  }
  const password = process.env.USER_PASSWORD || crypto.randomBytes(9).toString('base64url');
  await db.run('update users set password_hash = ? where id = ?', [hashPassword(password), row.id]);
  await db.run('delete from sessions where user_id = ?', [row.id]);
  logInfo(`password updated for ${email} (existing sessions revoked)`);
  if (!process.env.USER_PASSWORD) logInfo(`password: ${password}`);
  await db.close();
}

async function main() {
  const args = process.argv.slice(2);
  const BOOT_STARTED = Date.now();

  await initDb();
  if (args[0] === '--add-user') return addUserCli(args.slice(1));
  if (args[0] === '--set-password') return setPasswordCli(args.slice(1));
  if (args[0] === '--backup') return backupCli(args[1]);
  /* --db-init: connect, create the schema on an empty database and run the
     additive ensureColumn migrations, then exit — the same openDb() path the
     server takes at boot, without listening. Works on both backends; with
     DB_URL set it initializes a fresh Postgres database non-interactively
     (docker exec / CI / first-deploy probe). */
  if (args[0] === '--db-init') {
    logInfo(
      backendKind === 'pg'
        ? 'schema ready: Postgres initialized (DB_URL) — tables created if empty, additive migrations applied'
        : `schema ready: SQLite initialized (${DB_PATH}) — tables created if empty, additive migrations applied`,
    );
    await db.close();
    return;
  }

  await bootstrap();
  /* D-13 (86-02): crash hygiene — boot sweeps DATA_DIR/tmp/backup-* staging
     orphans left by a SIGTERM/crash (the sweep is from the 86-01 pipeline). */
  const sweptBackupStaging = sweepStaleBackupStaging();
  if (sweptBackupStaging) logInfo(`backup staging sweep: removed ${sweptBackupStaging} orphan(s)`);
  /* BKBCK-03 (87-02): stale status='running' run rows from a crash become
     'interrupted' at boot, BEFORE the first sweep tick (history never lies). */
  const interruptedRuns = await sweepStaleBackupRuns();
  if (interruptedRuns) logInfo(`backup run sweep: marked ${interruptedRuns} stale running run(s) interrupted`);
  /* BKRST-02/D-89-31 (89-02): stale running restore runs become interrupted
     and a held restore_lock is released at boot — the same stale-sweep
     idiom as the backup sweep, before the first trigger can observe them. */
  const restoreSweep = await sweepStaleRestoreRuns();
  if (restoreSweep.marked) logInfo(`restore run sweep: marked ${restoreSweep.marked} stale running restore(s) interrupted`);
  if (restoreSweep.released) logInfo(`restore lock sweep: released ${restoreSweep.released} stale claim(s)`);
  /* D-89-32 (89-03): crash hygiene mirrors the backup-staging sweep — boot
     clears BACKUPS_DIR/restore-staging orphans left by a crashed preview/
     restore before the first one can observe them. */
  const sweptRestoreStaging = sweepStaleRestoreStaging();
  if (sweptRestoreStaging) logInfo(`restore staging sweep: removed ${sweptRestoreStaging} orphan(s)`);
  /* PUSH-05: VAPID custody runs after the migrations so DATA_DIR is settled —
     env → persisted file → generate-once ladder (feature absent on failure). */
  await initPushCustody();
  logInfo(`boot complete in ${Date.now() - BOOT_STARTED}ms (schema migrations + sweeps)`);
  /* HARD-02 (D-02): legacy link-only admin/owner invites are neutralized at
     boot — UPDATE only (the row is an audit trail, never destroyed), no
     schema change, no migration. Boot-scoped, NOT the route-scoped cleanup. */
  await db.run('update invites set used_at = ? where email is null and role in (?, ?) and used_at is null', [now(), 'owner', 'admin']);
  /* D-05: the hourly sweeps are named async helpers so the facade call stays
     awaited inside (wave-gate hygiene) and the interval promise is caught —
     an unhandled rejection in a setInterval callback would kill the process. */
  const sweepExpiredSessions = async () => {
    await db.run('delete from sessions where expires_at <= ?', [now()]);
  };
  const sweepExpiredChallenges = async () => {
    await db.run('delete from login_challenges where expires_at <= ?', [now()]);
  };
  await sweepExpiredSessions();
  setInterval(() => sweepExpiredSessions().catch(err => logWarn(`session sweep: ${err.message}`)), 3600_000).unref();
  /* D-66 lifecycle: expired login challenges are swept at boot and hourly. */
  await sweepExpiredChallenges();
  setInterval(() => sweepExpiredChallenges().catch(err => logWarn(`challenge sweep: ${err.message}`)), 3600_000).unref();

  /* Invite + notification links are absolute URLs built from APP_URL; without it
     appBase() falls back to the request's Host header, so a hostile Host would email
     invitation or notification links pointing at the attacker's domain. Fail loudly
     at boot instead of at the first email. */
  if (MAILER.enabled && !APP_URL) {
    logError('invite email: refusing to start — SMTP_HOST is set but APP_URL is empty.');
    logError(
      "Invitation and notification links are built from APP_URL; without it a request host header could point those emails at an attacker's domain. Set APP_URL (e.g. https://projects.example.com) or unset SMTP_HOST to disable email invitations.",
    );
    process.exit(1);
  }

  /* REM-01 boot catch-up: reminder windows that opened while the server was
     down fire once here (window-open predicate + reminders_sent claim). Then
     D-27-2's 1-minute tick. The try/catch inside the interval callback is
     mandatory — an uncaught throw in a setInterval callback kills the
     process. unref() keeps the timer from holding the event loop open. */
  /* Async facade (Phase 45 D-05): the pass is async now; the interval wrapper
     keeps its try/catch AND a promise catch — an unhandled rejection in a
     setInterval callback would otherwise kill the process. */
  await runReminderPass();
  setInterval(() => {
    runReminderPass().catch(err => logWarn(`reminder tick: ${err.message}`));
  }, 60_000).unref();

  /* BKBCK-03 (87-02, D-05/D-08): backup scheduler sweep — the boot catch-up
     pass fires each due task exactly once (missed windows collapse into one
     firing; next_run_at recomputes from NOW inside the pass), then the
     1-minute unref'd tick. Same house rules as the reminder tick: the
     interval callback keeps try/catch AND a promise .catch (an uncaught
     throw or rejection in a setInterval callback kills the process);
     unref() keeps the timer from holding the event loop open. */
  await runBackupSchedulerPass();
  setInterval(() => {
    try {
      runBackupSchedulerPass().catch(err => logWarn(`backup scheduler tick: ${err.message}`));
    } catch (err) {
      logWarn(`backup scheduler tick: ${err.message}`);
    }
  }, 60_000).unref();

  /* WHK-03 (Phase 67): webhook delivery driver — same house rules as the
     reminder tick: try/catch inside the interval callback AND a promise
     .catch (an uncaught throw or rejection in a setInterval callback kills
     the process), .unref() so the timer never holds the event loop open.
     The pass carries the D-07 7-day retention purge, so the claim table
     cannot grow unbounded. */
  setInterval(() => {
    try {
      runWebhookDeliveryPass().catch(err => logWarn(`webhook tick: ${err.message}`));
      /* POL-02 (Phase 68, D-04): email delivery pass piggybacks the same
         30 s tick — drain + D-08 purge, same house rules (try/catch AND a
         promise .catch, .unref()). */
      runEmailDeliveryPass().catch(err => logWarn(`email tick: ${err.message}`));
    } catch (err) {
      logWarn(`webhook tick: ${err.message}`);
    }
  }, 30_000).unref();

  server.listen(PORT, HOST, async () => {
    logInfo(`Projects Studio listening on http://${HOST}:${PORT}`);
    logInfo(backendKind === 'pg' ? 'database: Postgres (DB_URL set — path log shows the SQLite rollback file only)' : `database: ${DB_PATH}`);
    if (MAILER.enabled) logInfo(`invite email: enabled via ${MAILER.host}:${MAILER.port} as ${MAILER.from}`);
    else if (MAILER.error) logWarn(`invite email: disabled — ${MAILER.error}`);
    else logInfo('invite email: disabled (set SMTP_HOST to email invitations)');
    /* Config summary at startup (Kanzo #9): the flags that change runtime
       behavior, one line each, so `docker logs` answers "how is this deployed". */
    logInfo(`log level: ${LOG_LEVEL} (LOG_LEVEL env: debug | info | warn | error)`);
    logInfo(`sessions: ${SESSION_DAYS}d ttl · sign-ups: ${ALLOW_SIGNUP ? 'open' : 'closed'} · secure cookie: ${SECURE_COOKIE} · trust proxy: ${TRUST_PROXY}`);
    logInfo(`sso: ${OIDC.enabled ? `enabled via ${OIDC.config?.issuer || 'configured issuer'}${OIDC.ssoOnly ? ' (sso-only)' : ''}` : 'disabled'}`);
    logInfo(`due reminders: from 08:00 workspace-local, catch-up window all day · daily digest: opt-in, 08:00`);
    /* D-06 (Phase 75): one grep-able, source-tagged line per admission var —
       `docker logs` answers "how are the doors configured". */
    const domainListLog = list => (list === null ? 'off' : isWildcardList(list) ? '*' : list.size === 0 ? 'deny-all' : [...list].sort().join(', '));
    logInfo(`domains: ALLOW_SIGNUP_DOMAINS: ${domainListLog(SIGNUP_DOMAINS)} (source: own)`);
    logInfo(`domains: ALLOW_INVITE_DOMAINS: ${domainListLog(INVITE_DOMAINS)} (source: ${'ALLOW_INVITE_DOMAINS' in process.env ? 'own' : 'inherit'})`);
    /* D-11 (Phase 76, SC4): ONE combined line answering exactly which of the
       five doors admit which domains — no assembly by the reader. The
       door→list mapping is structural: signup + sso-jit ride SIGNUP_DOMAINS;
       invite-create + invite-accept + sso-reconcile ride INVITE_DOMAINS
       (already inherit-resolved via ?? in domains.js). Source attribution
       stays on the two D-06 lines above, which are deliberately untouched. */
    logInfo(`domains: door matrix — signup: ${domainListLog(SIGNUP_DOMAINS)} | invite-create: ${domainListLog(INVITE_DOMAINS)} | invite-accept: ${domainListLog(INVITE_DOMAINS)} | sso-jit: ${domainListLog(SIGNUP_DOMAINS)} | sso-reconcile: ${domainListLog(INVITE_DOMAINS)}`);
    /* Phase 78 (WSG-03, D-11 style): one grep-able line answering how the
       creation gate resolved — docker logs answers "who can create". */
    logInfo(`workspace creation: ${WORKSPACE_CREATION ? 'open (any authenticated user)' : 'closed (instance operators only)'}`);
    /* [2026-11-21] one grep-able line for the super-access gate — same
       WSG-03 rationale: docker logs answers "can the admin enter spaces". */
    logInfo(`super access: ${SUPER_ACCESS ? 'on (admin enters any workspace owner-like)' : 'off (governance actions only)'}`);
    /* Phase 80 (GM-01, D-82-6 boot half): one grep-able line answering how
       much group-mapping config exists — docker logs answers "is group
       mapping in use". Zero rows → exactly this ONE line and no
       dead-mapping query (byte-identical boot, Pitfall 6). With rows → an
       N summary line plus one logWarn per DEAD mapping: a workspace_id no
       longer present in workspaces (the non-cascading FK deliberately
       leaves the row behind — D-82-6 detection; the operator-console
       section that renders these is Phase 83). */
    const groupMappings = await db.all('select group_guid, workspace_id from group_mappings');
    if (groupMappings.length === 0) {
      logInfo('group mappings: off');
    } else {
      logInfo(`group mappings: ${groupMappings.length}`);
      const wsIds = new Set((await db.all('select id from workspaces')).map(r => r.id));
      for (const m of groupMappings) {
        if (!wsIds.has(m.workspace_id)) {
          logWarn(`group mapping dead: group ${m.group_guid} → missing workspace ${m.workspace_id}`);
        }
      }
    }
  });

  const shutdown = signal => {
    logInfo(`${signal} received, shutting down`);
    /* D-13 (86-02) + WR-03 + Phase 88 MIN-04: an active export run is
       CANCELLED via the token — including an `uploading` run, whose
       cancellation lands at the next multipart part boundary (the
       executor's isCancelled seam aborts the multipart transaction) and
       routes into upload_failed (the local archive already published —
       the exporter's own catch path owns staging removal and the outcome
       flip; no rmSync-while-streaming, no state flip back to done
       mid-shutdown). The boot sweep remains the backstop for a hard crash
       that never reaches this handler. */
    const activeRun = getRunState();
    if (activeRun && (activeRun.stage === 'collecting' || activeRun.stage === 'archiving' || activeRun.stage === 'verifying' || activeRun.stage === 'uploading')) {
      cancelRun();
    }
    server.close(async () => {
      await db.close(); // Phase 45: adapter close (pool.end on pg)
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  logError(err);
  process.exit(1);
});
