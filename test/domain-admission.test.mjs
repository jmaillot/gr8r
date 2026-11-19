/* Domain admission suite (Phase 75, DOM-01 / DOM-02 / DOM-07). The signup
   door (ALLOW_SIGNUP_DOMAINS) and the invite-door tri-state resolver
   (ALLOW_INVITE_DOMAINS, unset-inherits) proved end-to-end through the real
   server via the harness: out-of-list refused with the keyed localized
   refusal, unset byte-identical fail-open, set-empty deny-all (D-02). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { login, signup, startServer } from './helpers/server.mjs';

/* ---------- DOM-01: the signup door ---------- */

test('an in-list email signs up and logs in; an out-of-list email is refused with signupDomainNotAllowed', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    const inList = await signup(server.base, { name: 'Inside', email: 'inside@a.com' });
    assert.equal(inList.status, 201, `in-list signup must be admitted, got ${inList.status}: ${JSON.stringify(inList.data)}`);
    const loginRes = await login(server.base, 'inside@a.com', 'password-1234');
    assert.equal(loginRes.status, 200, 'an admitted account logs in normally');

    const outList = await signup(server.base, { name: 'Outside', email: 'outside@b.org' });
    assert.equal(outList.status, 400);
    assert.equal(outList.data.code, 'signupDomainNotAllowed');
    /* D-04: the refusal must not reveal the allowed-domain list or its width */
    assert.ok(!/a\.com/.test(outList.data.error || ''), 'the refusal copy must not reveal the allowed domain');
    /* the payload shape did not grow anything beside error and code */
    assert.deepEqual(Object.keys(outList.data).sort(), ['code', 'error']);
  } finally {
    await server.stop();
  }
});

test('unset ALLOW_SIGNUP_DOMAINS keeps signup fail-open — behavior unchanged', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: undefined, ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const res = await signup(server.base, { name: 'Anyone', email: 'anyone@any-domain.example' });
    assert.equal(res.status, 201, `unset must stay fail-open, got ${res.status}: ${JSON.stringify(res.data)}`);
  } finally {
    await server.stop();
  }
});

test("set-but-empty ALLOW_SIGNUP_DOMAINS='' denies all signups (D-02 deny-all, never inherit-fail-open)", async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: '' } });
  try {
    const res = await signup(server.base, { name: 'Blocked', email: 'blocked@a.com' });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'signupDomainNotAllowed');
  } finally {
    await server.stop();
  }
});

/* ---------- DOM-07: adversarial canonicalization table ---------- */
/* server.js boots on load and exports no test-facing internals, so every
   canonicalization edge is driven through the real door: one spawned server
   listing a.com, one signup per row. Admitted/refused is the observable. */

test('DOM-07 canonicalization table: adjacency edges against ALLOW_SIGNUP_DOMAINS=a.com', async () => {
  const cases = [
    ['User@A.COM.', true, 'case + trailing-dot adjacency (equal after canonicalization)'],
    ['user\uff20a.com', true, 'fullwidth ＠ (U+FF20) — NFKC before the split'],
    ['a@evil-a.com', false, 'suffix/hyphen-adjacent bypass must be refused (exact membership only)'],
    ['a@sub.a.com', false, 'subdomain must be refused (no implicit wildcard)'],
    ['a@a.com.', true, 'trailing dot in the email domain part'],
    ['A@A.COM.', true, 'uppercase email domain part with trailing dot'],
    ['a@a.com\uff0e', true, 'fullwidth full stop (U+FF0E) trailing dot — NFKC before the strip'],
    ['a@zzz.io', false, 'control: an unlisted plain domain is refused (sanity of the door itself)'],
  ];
  /* one server per row: the 5/hour signup throttle would eat row 6 of a shared server */
  for (const [email, admitted, why] of cases) {
    const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: undefined } });
    try {
      const res = await signup(server.base, { name: 'Case', email, password: 'password-1234' });
      if (admitted) {
        assert.equal(res.status, 201, `${email} (${why}) must be ADMITTED, got ${res.status}: ${JSON.stringify(res.data)}`);
      } else {
        assert.equal(res.status, 400, `${email} (${why}) must be REFUSED, got ${res.status}`);
        assert.equal(res.data.code, 'signupDomainNotAllowed', `${email} (${why}) must carry the keyed refusal`);
      }
    } finally {
      await server.stop();
    }
  }
});

test("DOM-07 symmetric trailing-dot equivalence: listed 'a.com.' admits a@a.com", async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com.', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const res = await signup(server.base, { name: 'Case', email: 'a@a.com' });
    assert.equal(res.status, 201, `a listed-with-trailing-dot value admits the plain domain, got ${res.status}: ${JSON.stringify(res.data)}`);
  } finally {
    await server.stop();
  }
});

/* ---------- DOM-02: the env tri-state matrix (boot-log observable) ---------- */
/* The invite ROUTE enforcement is Plan 02 (DP-2); at this wave the resolved
   door matrix is observable deterministically through the D-06 boot lines and
   the signup door's own behavior. */

test('env matrix: unset/unset — both doors off (invite line reads off, source inherit)', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: undefined, ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const line = server.output().split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(line, 'invite boot line missing');
    assert.ok(line.includes(': off (source: inherit)'), `both unset → off/inherit, got: ${line}`);
  } finally {
    await server.stop();
  }
});

test("env matrix: a.com/'' — signup allowlist, invite deny-all standing alone (D-01)", async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: '' } });
  try {
    const ok = await signup(server.base, { name: 'In', email: 'in@a.com' });
    assert.equal(ok.status, 201);
    const line = server.output().split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(line.includes(': deny-all (source: own)'), `set-empty invite must stand alone as deny-all/own, got: ${line}`);
  } finally {
    await server.stop();
  }
});

test("env matrix: ''/unset — signup deny-all, invite inherits deny-all (D-02)", async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: '', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const res = await signup(server.base, { name: 'Blocked', email: 'blocked@a.com' });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'signupDomainNotAllowed');
    const line = server.output().split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(line.includes(': deny-all (source: inherit)'), `deny-all must inherit, got: ${line}`);
  } finally {
    await server.stop();
  }
});

test("env matrix: ' a , B '/unset — list canonicalizes to {a, b} (case, whitespace, source inherit)", async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: ' a , B ', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const line = server.output().split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(line.includes(': a, b (source: inherit)'), `must resolve {a, b}, got: ${line}`);
    /* no signup probe here: bare-domain entries (a, b) can never equal an
    email's dotted domain — the resolved-list boot log IS the observable */
  } finally {
    await server.stop();
  }
});

test("env matrix: 'a,,b'/unset — empty middle entry dropped with a boot warning (D-05)", async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a,,b', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const line = server.output().split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(line.includes(': a, b (source: inherit)'), `empty middle entry must be dropped, got: ${line}`);
    assert.ok(/ALLOW_SIGNUP_DOMAINS: dropping invalid entry/.test(server.output()), 'the D-05 boot warning must be observable');
  } finally {
    await server.stop();
  }
});

test("env matrix: ' , '/unset — whitespace-only entries dropped with warnings, boot survives (deny-all)", async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: ' , ', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    /* the server booted and serves — warn-and-clean never crashed boot */
    const res = await signup(server.base, { name: 'Blocked', email: 'blocked@a.com' });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'signupDomainNotAllowed');
    const out = server.output();
    const line = out.split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(line.includes(': deny-all (source: inherit)'), `whitespace-only list must resolve deny-all, got: ${line}`);
    const warnings = out.split('\n').filter(l => l.includes('ALLOW_SIGNUP_DOMAINS: dropping invalid entry'));
    assert.ok(warnings.length >= 2, `each whitespace-only entry must warn (D-05), got ${warnings.length}`);
  } finally {
    await server.stop();
  }
});

test('dedupe idempotency: A.COM, a.com, a.com., a.com collapse to one canonical entry', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'A.COM, a.com, a.com., a.com', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const line = server.output().split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(line.includes(': a.com (source: inherit)'), `duplicates must dedupe to one canonical entry, got: ${line}`);
  } finally {
    await server.stop();
  }
});


test('unset ALLOW_INVITE_DOMAINS inherits the signup list, source-tagged inherit in the boot log', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const out = server.output();
    /* the single committed mechanism for this case: the D-06 boot log line */
    const line = out.split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(line, 'the invite boot log line is missing');
    assert.ok(line.includes('(source: inherit)'), `invite source tag must be inherit, got: ${line}`);
    assert.ok(line.includes('a.com'), `the inherited list must carry the signup domains, got: ${line}`);
  } finally {
    await server.stop();
  }
});

test('boot logs one source-tagged line per admission var (D-06)', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: 'b.com' } });
  try {
    const out = server.output();
    const signupLine = out.split('\n').find(l => l.includes('domains: ALLOW_SIGNUP_DOMAINS:'));
    const inviteLine = out.split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(signupLine && signupLine.includes('a.com') && signupLine.includes('(source: own)'), `signup line: ${signupLine}`);
    assert.ok(inviteLine && inviteLine.includes('b.com') && inviteLine.includes('(source: own)'), `invite line: ${inviteLine}`);
  } finally {
    await server.stop();
  }
});

/* ---------- DOM-02: the invite-create door (DP-2, plan 02) ---------- */
/* Per-email invite-list refusal (D-03/D-04) riding the emailOk loop, before
   db.tx — a refused batch leaves zero invite rows (zero-side-effect). */

const ownerAndWs = async base => {
  const owner = (await login(base, 'owner@test.local', 'owner-password-1')).client;
  const slug = (await owner.get('/api/workspaces')).data.workspaces[0].slug;
  return { owner, slug };
};

test('DP-2: an out-of-list email is refused per-email with inviteDomainNotAllowed and zero invite rows', async () => {
  const server = await startServer({ env: { ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    const { owner, slug } = await ownerAndWs(server.base);
    const res = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['b@x.com'], role: 'member' });
    assert.equal(res.status, 400, `must refuse, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'inviteDomainNotAllowed');
    /* D-03: the refused email rides the flat extra payload for inline rendering */
    assert.equal(res.data.email, 'b@x.com');
    /* D-04: the refusal copy must not reveal the allowed domain */
    assert.ok(!/a\.com/.test(res.data.error || ''), 'the refusal copy must not reveal the allowed domain');
    /* zero-side-effect: the refused batch left no invite rows */
    const count = withDb(server.dbPath, db => db.prepare('select count(*) as n from invites').get().n);
    assert.equal(count, 0, 'a refused batch must leave zero invite rows');
  } finally {
    await server.stop();
  }
});

test('DP-2: a batch with one refused email refuses with that email and zero rows — valid emails proceed only when all valid', async () => {
  const server = await startServer({ env: { ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    const { owner, slug } = await ownerAndWs(server.base);
    const res = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['good@a.com', 'bad@x.com'], role: 'member' });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'inviteDomainNotAllowed');
    assert.equal(res.data.email, 'bad@x.com', 'the refusal must name the refused email');
    const count = withDb(server.dbPath, db => db.prepare('select count(*) as n from invites').get().n);
    assert.equal(count, 0, 'the batch must leave zero invite rows (refusal before db.tx)');
    /* all-valid batch proceeds */
    const ok = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['good@a.com'], role: 'member' });
    assert.equal(ok.status, 201, `an all-valid batch must succeed, got ${ok.status}: ${JSON.stringify(ok.data)}`);
  } finally {
    await server.stop();
  }
});

test('DP-2 inheritance: unset ALLOW_INVITE_DOMAINS reads the signup list through the invite door (DOM-02)', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const { owner, slug } = await ownerAndWs(server.base);
    const inList = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['b@a.com'], role: 'member' });
    assert.equal(inList.status, 201, `inherited list must admit b@a.com, got ${inList.status}: ${JSON.stringify(inList.data)}`);
    const outList = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['b@x.com'], role: 'member' });
    assert.equal(outList.status, 400);
    assert.equal(outList.data.code, 'inviteDomainNotAllowed');
  } finally {
    await server.stop();
  }
});

test("DP-2 standalone: ALLOW_INVITE_DOMAINS='' denies all invites while a signup list exists (D-01); an own list may be wider", async () => {
  const denyAll = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: '' } });
  try {
    const { owner, slug } = await ownerAndWs(denyAll.base);
    const res = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['b@a.com'], role: 'member' });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'inviteDomainNotAllowed', 'explicit-empty must deny even a signup-listed domain');
  } finally {
    await denyAll.stop();
  }
  const standalone = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: 'b.com' } });
  try {
    const { owner, slug } = await ownerAndWs(standalone.base);
    const wide = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['b@b.com'], role: 'member' });
    assert.equal(wide.status, 201, `the own list must admit b.com even though the signup list is narrower, got ${wide.status}: ${JSON.stringify(wide.data)}`);
    const refused = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['b@a.com'], role: 'member' });
    assert.equal(refused.status, 400, 'the signup list must never widen the invite door');
    assert.equal(refused.data.code, 'inviteDomainNotAllowed');
  } finally {
    await standalone.stop();
  }
});

/* ---------- DOM-07/MCP: the fourth admission door (T-75-16) ---------- */
/* invite_member through the real /mcp transport: the same canonicalizing
   funnel + boot-frozen INVITE_DOMAINS — no bypass lane. */
import { client, inviteToken, withDb } from './helpers/server.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MCP_INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'domain-admission-test', version: '0.0.0' } };

test('MCP invite_member composes the same funnel: in-list inserts, out-of-list refuses, fullwidth ＠ refused like the UI door', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-dom-mcp-'));
  const server = await startServer({ dataDir: tempDir, env: { ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    const owner = (await login(server.base, 'owner@test.local', 'owner-password-1')).client;
    const wsId = (await owner.get('/api/workspaces')).data.workspaces[0].id;
    const keyRes = await owner.post('/api/keys', { label: 'DomMcp', scope: 'write', workspaceId: wsId, days: 30 });
    assert.equal(keyRes.status, 201, `key creation failed: ${JSON.stringify(keyRes.data)}`);
    const key = keyRes.data.key;

    const mcpPost = (body, session) =>
      fetch(`${server.base}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${key}`, ...(session ? { 'mcp-session-id': session } : {}) },
        body: JSON.stringify(body),
      });
    const rpc = async (method, params, session) => {
      const res = await mcpPost({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method, params }, session);
      assert.equal(res.status, 200);
      const type = res.headers.get('content-type') || '';
      let result;
      if (type.includes('text/event-stream')) {
        const raw = await res.text();
        const line = raw.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5).trim())).find(m => m.id !== undefined && m.result);
        result = line.result;
      } else {
        result = (await res.json()).result;
      }
      return { session: res.headers.get('mcp-session-id'), result };
    };
    const session = (await rpc('initialize', MCP_INIT, null)).session;
    assert.ok(session, 'the MCP initialize must bind a session');
    await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' }, session);
    const callTool = async (name, args) => {
      const { result: out } = await rpc('tools/call', { name, arguments: args }, session);
      const text = out?.content?.[0]?.text;
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { isError: !!out?.isError, data };
    };

    /* in-list email inserts */
    const inv = await callTool('invite_member', { email: 'newbie@a.com', role: 'member' });
    assert.equal(inv.isError, false, `in-list email must be admitted, got ${JSON.stringify(inv.data)}`);
    assert.ok(inv.data.joinPath.startsWith('/join/'));
    /* out-of-list email refuses with the generic message — no list reveal (D-04) */
    const refused = await callTool('invite_member', { email: 'newbie@x.com' });
    assert.equal(refused.isError, true, 'out-of-list email must be refused through MCP too');
    assert.ok(!/a\.com/.test(String(refused.data)), 'the MCP refusal must not reveal the allowed domain');
    /* fullwidth ＠: the shape gate refuses it — the SAME verdict the UI
       invite door's emailOk gives (parity, T-75-16); the funnel's NFKC still
       canonicalizes anything that reaches membership. */
    const fullwidth = await callTool('invite_member', { email: 'user\uff20a.com' });
    assert.equal(fullwidth.isError, true, 'fullwidth ＠ must be refused through MCP');
    /* exactly one insert landed */
    const count = withDb(server.dbPath, db => db.prepare('select count(*) as n from invites').get().n);
    assert.equal(count, 1, `only the in-list email must have inserted, got ${count} rows`);
  } finally {
    await server.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

/* ---------- DOM-04: the accept door (DP-3, plan 02 — TDD) ---------- */
/* Fail-closed re-derivation against the LIVE invite list, validating the
   invite ROW's email — never a stored snapshot. Non-consuming (D-07),
   no inviter notification (D-08). */
import crypto from 'node:crypto';

const sha256hex = s => crypto.createHash('sha256').update(s).digest('hex');

test('DP-3 tighten/loosen: a pending invite refused after the list tightens keeps its row and is revived by loosening (SC4, D-07)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-dom-accept-'));
  const mint = await startServer({ dataDir, env: { ALLOW_INVITE_DOMAINS: 'a.com' } });
  let token;
  try {
    await signup(mint.base, { name: 'Pending', email: 'x@a.com' });
    const { owner, slug } = await ownerAndWs(mint.base);
    const inv = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['x@a.com'], role: 'member' });
    assert.equal(inv.status, 201);
    token = inviteToken(inv.data.invites[0].url);
    assert.ok(token, 'the mint returned a join token');
  } finally {
    await mint.stop();
  }

  /* tighten: the same DB rebooted with the list narrowed to b.com */
  const tight = await startServer({ dataDir, env: { ALLOW_INVITE_DOMAINS: 'b.com' } });
  let outboxBefore;
  try {
    const { client: accepter } = await login(tight.base, 'x@a.com', 'password-1234');
    outboxBefore = withDb(tight.dbPath, db => db.prepare('select count(*) as n from email_outbox').get().n);
    const res = await accepter.post(`/api/invites/${token}/accept`, {});
    assert.equal(res.status, 403, `the tightened list must refuse the stale invite, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'inviteDomainNoLonger');
    /* D-07: generic copy — never reveals the list, its width, or its history */
    assert.ok(!/domain|allow|a\.com|b\.com/i.test(res.data.error || ''), `the refusal copy must stay generic, got: ${res.data.error}`);
    /* non-consuming: the invite row survives untouched */
    const row = withDb(tight.dbPath, db => db.prepare('select used_at, email from invites where email = ?').get('x@a.com'));
    assert.ok(row, 'the invite row must survive the refusal (D-07)');
    assert.equal(row.used_at, null, 'the refusal must not consume the invite');
    /* D-08: the inviter was not notified — no new email_outbox rows */
    const outboxAfter = withDb(tight.dbPath, db => db.prepare('select count(*) as n from email_outbox').get().n);
    assert.equal(outboxAfter, outboxBefore, 'the refusal must write no notification rows (D-08)');
  } finally {
    await tight.stop();
  }

  /* loosen: the SAME invite now accepts (revival, D-07) */
  const loose = await startServer({ dataDir, env: { ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    const { client: accepter } = await login(loose.base, 'x@a.com', 'password-1234');
    const res = await accepter.post(`/api/invites/${token}/accept`, {});
    assert.ok([200, 201].includes(res.status), `loosening must revive the same invite, got ${res.status}: ${JSON.stringify(res.data)}`);
    const used = withDb(loose.dbPath, db => db.prepare('select used_at from invites where email = ?').get('x@a.com'));
    assert.ok(used.used_at, 'the revived accept consumed the invite');
  } finally {
    await loose.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('DP-3 row-email invariant: the refusal validates the ROW email even when the body carries an in-list email', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-dom-row-'));
  const mint = await startServer({ dataDir, env: { ALLOW_INVITE_DOMAINS: 'a.com' } });
  let token;
  try {
    await signup(mint.base, { name: 'Row', email: 'x@a.com' });
    const { owner, slug } = await ownerAndWs(mint.base);
    const inv = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['x@a.com'], role: 'member' });
    token = inviteToken(inv.data.invites[0].url);
  } finally {
    await mint.stop();
  }
  const tight = await startServer({ dataDir, env: { ALLOW_INVITE_DOMAINS: 'b.com' } });
  try {
    /* the body email IS in the tightened list — the row's email is not */
    const res = await client(tight.base).post(`/api/invites/${token}/accept`, { name: 'Sneak', email: 'sneak@b.com', password: 'password-1234' });
    assert.equal(res.status, 403, `the ROW email governs, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'inviteDomainNoLonger', 'the refusal must be the accept-door key, not the body-email shape checks');
  } finally {
    await tight.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('DOM-03 gmail scenario (SC3): an invited gmail user accepts and logs in; the same email can never self-register', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: 'gmail.com' } });
  try {
    /* control: direct signup of the gmail address is refused by the signup door */
    const direct = await signup(server.base, { name: 'Gmail', email: 'g@gmail.com' });
    assert.equal(direct.status, 400);
    assert.equal(direct.data.code, 'signupDomainNotAllowed');

    const { owner, slug } = await ownerAndWs(server.base);
    const inv = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['g@gmail.com'], role: 'member' });
    assert.equal(inv.status, 201, `the invite door admits gmail, got ${inv.status}: ${JSON.stringify(inv.data)}`);
    const token = inviteToken(inv.data.invites[0].url);

    /* accept creates the account (the invite path never consulted the signup list) */
    const accepter = client(server.base);
    const res = await accepter.post(`/api/invites/${token}/accept`, { name: 'Gmail', email: 'g@gmail.com', password: 'password-1234' });
    assert.ok([200, 201].includes(res.status), `the invited gmail user must accept, got ${res.status}: ${JSON.stringify(res.data)}`);
    const logged = await login(server.base, 'g@gmail.com', 'password-1234');
    assert.equal(logged.status, 200, 'the created account logs in normally');
    /* self-registration stays closed for the same email */
    const again = await signup(server.base, { name: 'Gmail', email: 'g@gmail.com' });
    assert.equal(again.status, 400);
    assert.equal(again.data.code, 'signupDomainNotAllowed', 'accepting an invite never opens the signup door for that email');
  } finally {
    await server.stop();
  }
});

test('DP-3 link-only invite: the body email is re-derived against the live list before createUser', async () => {
  const server = await startServer({ env: { ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    const { owner } = await ownerAndWs(server.base);
    const wsId = (await owner.get('/api/workspaces')).data.workspaces[0].id;
    const createdBy = withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get('owner@test.local').id);
    const t = Date.now();
    const mintLinkOnly = email => {
      const token = crypto.randomBytes(24).toString('base64url');
      withDb(server.dbPath, db =>
        db.prepare(
          'insert into invites (token_hash, email, role, teams, workspace_id, created_by, created_at, expires_at) values (?,null,?,?,?,?,?,?)',
        ).run(sha256hex(token), 'member', '[]', wsId, createdBy, t, t + 7 * 86400 * 1000),
      );
      return token;
    };
    const refusedToken = mintLinkOnly();
    const refused = await client(server.base).post(`/api/invites/${refusedToken}/accept`, { name: 'Out', email: 'out@x.com', password: 'password-1234' });
    assert.equal(refused.status, 403, `an out-of-list body email must be refused on a link-only invite, got ${refused.status}: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, 'inviteDomainNoLonger');
    const created = withDb(server.dbPath, db => db.prepare('select count(*) as n from users where email = ?').get('out@x.com').n);
    assert.equal(created, 0, 'the refusal must fire before createUser');
    /* the row survives (non-consuming) */
    assert.ok(withDb(server.dbPath, db => db.prepare('select 1 as ok from invites where token_hash = ?').get(sha256hex(refusedToken))), 'the link-only invite row survives');

    const acceptedToken = mintLinkOnly();
    const accepted = await client(server.base).post(`/api/invites/${acceptedToken}/accept`, { name: 'In', email: 'in@a.com', password: 'password-1234' });
    assert.ok([200, 201].includes(accepted.status), `an in-list body email is accepted, got ${accepted.status}: ${JSON.stringify(accepted.data)}`);
    assert.equal(withDb(server.dbPath, db => db.prepare('select count(*) as n from users where email = ?').get('in@a.com').n), 1);
  } finally {
    await server.stop();
  }
});
