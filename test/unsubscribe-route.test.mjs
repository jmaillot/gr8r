/* =====================================================================
   Phase 42 plan 01 — the RFC 8058 one-click unsubscribe endpoint
   (UNSUB-02). Boot a real server with MASTER_KEY + APP_URL (digest.test.mjs
   second-fixture pattern), mint tokens via makeUnsubscribeToken with the
   mirrored key derivation sha256(MASTER_KEY ‖ 'unsubscribe-tokens:v1')
   (server.js unsubscribeHmacKey), and hit the route in the MAIL-CLIENT
   posture: NO cookies, NO Sec-Fetch headers, NO request body.

   The suite pins the full security contract of handleUnsubscribe
   (D-01..D-10, SC-1..SC-4) — Task 1 carries the tracer slice (valid POST +
   forged POST); the remaining matrix lands in the same plan.

   NEVER log the token from a test helper, and never send a request body.
   ===================================================================== */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { makeUnsubscribeToken } from '../mailer.js';
import { startServer, signup, client, withDb } from './helpers/server.mjs';

const MASTER_KEY = 'projects-unsub-route-key';
const GOOD = 'password-1234';
/* Frozen framing (mailer.js L129-132): 0x01 ‖ wsId(36B) ‖ userId(36B). */
const UNSUB_PAYLOAD_BYTES = 1 + 2 * 36;
const VERIFIED_TEXT = 'You will no longer receive these digest emails.';
const NEUTRAL_TEXT = 'Your request has been processed.';

/* Mirror of server.js unsubscribeHmacKey (L145-146): one createHash, two
   chained updates — byte-identical to the server derivation. */
function unsubKey(masterKey = MASTER_KEY) {
  return crypto.createHash('sha256').update(masterKey).update('unsubscribe-tokens:v1').digest();
}

/* Boot one unsub server fixture and return { server, wsId, userId, key }. */
async function bootUnsubServer(env = {}) {
  const server = await startServer({ env: { MASTER_KEY, APP_URL: 'https://app.test', ...env } });
  const email = `unsub-owner-${Math.random().toString(36).slice(2, 8)}@test.local`;
  await signup(server.base, { name: 'Owner', email, password: GOOD });
  const c = client(server.base, email);
  const logged = await c.post('/api/auth/login', { email, password: GOOD });
  assert.equal(logged.status, 200, 'fixture owner login');
  const created = await c.post('/api/workspaces', { name: 'Unsub', slug: `unsub-${Math.random().toString(36).slice(2, 8)}` });
  assert.equal(created.status, 201, 'fixture workspace create');
  const row = withDb(server.dbPath, db =>
    db.prepare('select m.workspace_id, m.user_id from memberships m order by m.rowid desc limit 1').get(),
  );
  assert.ok(row?.workspace_id && row?.user_id, 'fixture membership resolves (wsId, userId)');
  return { server, wsId: row.workspace_id, userId: row.user_id, key: unsubKey(env.MASTER_KEY === undefined ? MASTER_KEY : env.MASTER_KEY) };
}

/* Mail-client fetch: no cookies, no Sec-Fetch headers, no body. */
const unsubFetch = (base, token, method = 'POST') => fetch(`${base}/unsubscribe/${token}`, { method, redirect: 'manual' });

const prefsRow = (server, wsId, userId) =>
  withDb(server.dbPath, db =>
    db.prepare('select prefs from user_notif_prefs where workspace_id = ? and user_id = ?').get(wsId, userId),
  );

test('a valid POST flips the stored row to email_digest=false and answers the verified page', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    const res = await unsubFetch(fx.server.base, token);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^text\/html; charset=utf-8$/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.text();
    assert.ok(body.includes(VERIFIED_TEXT), 'the verified page text is rendered');
    const stored = prefsRow(fx.server, fx.wsId, fx.userId);
    assert.ok(stored, 'the sparse row was created');
    assert.equal(JSON.parse(stored.prefs).email_digest, false, 'email_digest flipped to false');
  } finally {
    await fx.server.stop();
  }
});

test('a forged token POST answers the neutral page with the identical envelope and no mutation', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    /* Flip one payload byte after the MAC — a structurally valid token that
       fails verification. */
    const raw = Buffer.from(token, 'base64url');
    raw[5] ^= 0xff;
    const forged = raw.toString('base64url');

    const res = await unsubFetch(fx.server.base, forged);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^text\/html; charset=utf-8$/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.text();
    assert.ok(body.includes(NEUTRAL_TEXT), 'the neutral page text is rendered');
    assert.ok(!body.includes(VERIFIED_TEXT), 'the neutral page never asserts unsubscription');
    assert.equal(prefsRow(fx.server, fx.wsId, fx.userId), undefined, 'no prefs row was created');

    /* Envelope parity (D-03): the forged outcome shares the verified
       outcome's exact status/content-type/cache envelope. */
    assert.deepEqual(
      { status: res.status, ct: res.headers.get('content-type'), cc: res.headers.get('cache-control') },
      { status: 200, ct: 'text/html; charset=utf-8', cc: 'no-store' },
    );
  } finally {
    await fx.server.stop();
  }
});

test('method matrix: PUT/DELETE/HEAD/OPTIONS answer 405 methodNotAllowed with Allow: GET, POST and no mutation (D-06)', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    for (const method of ['PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
      const res = await fetch(`${fx.server.base}/unsubscribe/${token}`, { method });
      assert.equal(res.status, 405, `${method} status`);
      assert.equal(res.headers.get('allow'), 'GET, POST', `${method} Allow header`);
      if (method !== 'HEAD') {
        /* HEAD answers headers only — no body to parse. */
        const data = await res.json().catch(() => null);
        assert.equal(data?.code, 'methodNotAllowed', `${method} envelope code`);
      }
    }
    assert.equal(prefsRow(fx.server, fx.wsId, fx.userId), undefined, 'no mutation from disallowed methods');
  } finally {
    await fx.server.stop();
  }
});

test('GET with a valid token is a stateless no-op: 200 neutral page, stored row unchanged (D-05)', async () => {
  const fx = await bootUnsubServer();
  try {
    withDb(fx.server.dbPath, db =>
      db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(
        fx.wsId, fx.userId, JSON.stringify({ email_digest: true, email_reminder: false }),
      ),
    );
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    const before = prefsRow(fx.server, fx.wsId, fx.userId);
    const res = await unsubFetch(fx.server.base, token, 'GET');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^text\/html; charset=utf-8$/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.text();
    assert.ok(body.includes(NEUTRAL_TEXT), 'GET always answers the neutral page');
    assert.ok(!body.includes(VERIFIED_TEXT), 'GET never asserts unsubscription');
    assert.deepEqual(JSON.parse(prefsRow(fx.server, fx.wsId, fx.userId).prefs), JSON.parse(before.prefs), 'zero mutation');
  } finally {
    await fx.server.stop();
  }
});

test('replayed POSTs are convergent: byte-identical responses, no burn, idempotent row (D-09)', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    const r1 = await unsubFetch(fx.server.base, token);
    const b1 = await r1.text();
    const r2 = await unsubFetch(fx.server.base, token);
    const b2 = await r2.text();
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200, 'no 410, no burn — replay answers 200');
    assert.equal(r2.headers.get('content-type'), r1.headers.get('content-type'));
    assert.equal(r2.headers.get('cache-control'), r1.headers.get('cache-control'));
    assert.equal(b2, b1, 'identical body across replays');
    assert.equal(JSON.parse(prefsRow(fx.server, fx.wsId, fx.userId).prefs).email_digest, false);
  } finally {
    await fx.server.stop();
  }
});

test('hostile-token matrix: wrong-version/truncated/garbage/empty all answer the identical neutral envelope with no mutation (D-03)', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    const raw = Buffer.from(token, 'base64url');
    const flippedVersion = Buffer.from(raw);
    flippedVersion[0] = 0x02;
    const truncated = raw.subarray(0, UNSUB_PAYLOAD_BYTES - 8).toString('base64url');
    const hostile = [
      ['wrong-version', flippedVersion.toString('base64url')],
      ['truncated', truncated],
      /* Garbage INSIDE the base64url alphabet — out-of-alphabet bytes never
         match the route regex at all (they fall to the generic chain). */
      ['garbage', 'z'.repeat(105)],
    ];
    for (const [label, bad] of hostile) {
      const res = await unsubFetch(fx.server.base, bad);
      assert.equal(res.status, 200, `${label} status`);
      assert.match(res.headers.get('content-type') || '', /^text\/html; charset=utf-8$/, `${label} content-type`);
      assert.equal(res.headers.get('cache-control'), 'no-store', `${label} cache-control`);
      const body = await res.text();
      assert.ok(body.includes(NEUTRAL_TEXT), `${label} neutral text`);
      assert.ok(!body.includes(VERIFIED_TEXT), `${label} never asserts unsubscription`);
    }
    /* Empty token: /unsubscribe/ with no segment never reaches the route —
       assert only that it can never assert unsubscription or mutate. */
    const empty = await fetch(`${fx.server.base}/unsubscribe/`);
    assert.ok(!((await empty.text()).includes(VERIFIED_TEXT)), 'empty token never asserts unsubscription');
    assert.equal(prefsRow(fx.server, fx.wsId, fx.userId), undefined, 'no mutation from hostile tokens');
  } finally {
    await fx.server.stop();
  }
});

test('a stale token (minted under a rotated-out key) gets the neutral page, not an error (D-03 rotation semantics)', async () => {
  const mintServer = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(mintServer.key, mintServer.wsId, mintServer.userId);
    await mintServer.server.stop();

    const rotated = await startServer({ env: { MASTER_KEY: 'projects-rotated-key', APP_URL: 'https://app.test' } });
    try {
      const res = await unsubFetch(rotated.base, token);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes(NEUTRAL_TEXT), 'stale token → neutral page');
      assert.ok(!body.includes(VERIFIED_TEXT));
    } finally {
      await rotated.stop();
    }
  } finally {
    /* mintServer stopped above; the rotated fixture stops in its own finally. */
  }
});

test('a server without MASTER_KEY answers the neutral page — never 500, never a mutation (Pitfall 1)', async () => {
  const fx = await startServer({ env: { APP_URL: 'https://app.test', MASTER_KEY: undefined } });
  try {
    /* Token shape is irrelevant — the key is null, so verification fails. */
    const token = makeUnsubscribeToken(unsubKey(), 'ws_x', 'u_y');
    const res = await unsubFetch(fx.base, token);
    assert.equal(res.status, 200, 'no 500 on the no-MASTER_KEY path');
    const body = await res.text();
    assert.ok(body.includes(NEUTRAL_TEXT));
    assert.ok(!body.includes(VERIFIED_TEXT));
  } finally {
    await fx.stop();
  }
});

test('envelope parity: verified and neutral bodies differ ONLY by the localized message (D-04)', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    const verified = await unsubFetch(fx.server.base, token);
    const verifiedBody = await verified.text();
    const neutral = await unsubFetch(fx.server.base, token, 'GET');
    const neutralBody = await neutral.text();
    assert.deepEqual(
      { s: verified.status, ct: verified.headers.get('content-type'), cc: verified.headers.get('cache-control') },
      { s: neutral.status, ct: neutral.headers.get('content-type'), cc: neutral.headers.get('cache-control') },
    );
    const strip = s => s.replace(VERIFIED_TEXT, '').replace(NEUTRAL_TEXT, '');
    assert.equal(strip(verifiedBody), strip(neutralBody), 'the template scaffold is byte-identical after removing the message');
  } finally {
    await fx.server.stop();
  }
});

test('the page renders in the token user\'s clamped locale (D-02 / decisions_pinned 1)', async () => {
  const fx = await bootUnsubServer();
  try {
    withDb(fx.server.dbPath, db => db.prepare('update users set locale = ? where id = ?').run('fr', fx.userId));
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    const res = await unsubFetch(fx.server.base, token);
    const body = await res.text();
    assert.ok(body.includes('Vous ne recevrez plus ces e-mails de synthèse.'), 'the FR verified text renders');
    /* NULL/malformed locales degrade to EN (I18N-01 clamp). */
    withDb(fx.server.dbPath, db => db.prepare('update users set locale = ? where id = ?').run('fr-FR', fx.userId));
    const res2 = await unsubFetch(fx.server.base, token, 'GET');
    assert.ok((await res2.text()).includes(NEUTRAL_TEXT), 'malformed locale degrades to EN');
  } finally {
    await fx.server.stop();
  }
});

test('throttle: 429 on/after the 11th attempt from one IP, token-blind and fired before verification (D-08)', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    const raw = Buffer.from(token, 'base64url');
    raw[5] ^= 0xff;
    const forged = raw.toString('base64url');
    /* 10 pass (budget), 11th+ → 429. #11 is VALID and still 429s; #12 is
       forged and also 429s — the throttle never reaches verification, so a
       forged token can never buy a 200 probe after the budget is spent. */
    for (let i = 1; i <= 12; i++) {
      const res = await unsubFetch(fx.server.base, i % 2 === 0 ? forged : token);
      if (i <= 10) assert.equal(res.status, 200, `attempt ${i} within budget`);
      else assert.equal(res.status, 429, `attempt ${i} throttled (valid=${i % 2 !== 0})`);
      if (res.status === 429) {
        const data = await res.json().catch(() => null);
        assert.equal(data?.code, 'tooManyAttempts', `attempt ${i} throttle envelope`);
      }
    }
  } finally {
    await fx.server.stop();
  }
});

test('ordering pin: /unsubscribe/ is intercepted before serveStatic (no 405 Allow: GET, HEAD, no SPA fallback)', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    /* serveStatic would 405 the POST with Allow: GET, HEAD — a valid POST
       must reach the route instead. */
    const post = await unsubFetch(fx.server.base, token);
    assert.equal(post.status, 200);
    assert.notEqual(post.headers.get('allow'), 'GET, HEAD', 'serveStatic must not claim the POST');
    /* serveStatic would SPA-fallback (or 404) the extensionless GET — the
       route must answer its own neutral page instead. */
    const get = await unsubFetch(fx.server.base, 'garbage-token', 'GET');
    assert.equal(get.status, 200, 'the GET lands on the route, not the SPA fallback');
    assert.ok((await get.text()).includes(NEUTRAL_TEXT));
  } finally {
    await fx.server.stop();
  }
});

test('source pin: the consolidated security-contract comment sits at the route with the pinned anchors (D-13)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  /* Extract the route's consolidated comment block; only commented content
     counts (the way other source-pins in the suite filter). */
  const block = src.match(/\/\* Phase 42 \(UNSUB-02\): the RFC 8058 one-click[\s\S]*?\*\//);
  assert.ok(block, 'the consolidated contract comment block exists');
  const comment = block[0];
  assert.ok(comment.includes('{GET, POST}'), 'allow-list pinned');
  assert.ok(comment.includes('unsub|<ip>'), 'throttle key pinned');
  assert.ok(comment.includes('10 attempts / 15 min'), 'throttle budget pinned');
  assert.ok(comment.includes('no token burn, no 410'), 'replay posture pinned');
  assert.ok(comment.includes('sameOrigin exemption (D-07)'), 'sameOrigin rationale pinned');
  assert.ok(comment.includes('NEVER call logSecurity/logAct/logDebug with the token'), 'no-logging rule pinned');
  assert.ok(comment.includes('token-blind'), 'throttle orthogonality pinned');
});

test('reminder resume (Phase 38 semantics): the flip merges into the stored row — other prefs survive, digest gate reads false (D-10)', async () => {
  const fx = await bootUnsubServer();
  try {
    withDb(fx.server.dbPath, db =>
      db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(
        fx.wsId, fx.userId, JSON.stringify({ email_digest: true, email_reminder: false, mention_all: false }),
      ),
    );
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    const res = await unsubFetch(fx.server.base, token);
    assert.equal(res.status, 200);
    const stored = JSON.parse(prefsRow(fx.server, fx.wsId, fx.userId).prefs);
    assert.equal(stored.email_digest, false, 'the digest gate (email_digest !== true) resumes reminders');
    assert.equal(stored.email_reminder, false, 'merge, never blind-replace');
    assert.equal(stored.mention_all, false, 'merge, never blind-replace');
  } finally {
    await fx.server.stop();
  }
});

test('badge-placement pin (D-11/D-12/48-02): the derived browser-blocked badge decorates exactly the three push rows — functional rows untouched', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/pages/settings.js', import.meta.url), 'utf8');
  const pushCase = src.match(/case 'notif-push':\s*\{[\s\S]*?(?=\n {4}case )/);
  assert.ok(pushCase, "the 'notif-push' case exists in settings.js");
  const block = pushCase[0];
  // 48-02 (D-48-4): the badge is DERIVED per render — one blocked expression,
  // one shared `bad` slot reference per push row, no stored badge anywhere.
  assert.match(block, /Notification\.permission === 'denied'/, 'the badge derives from a live permission read');
  assert.match(block, /settings\.notif\.pushBrowserBlocked/, 'the badge label comes from the catalogue (T-48-06)');
  assert.ok(!block.includes('pushComingSoon'), 'the Coming-soon badge is gone (D-48-3)');
  assert.ok((block.match(/bad/g) || []).length >= 3, 'the three push rows share the derived badge slot');
  for (const [row] of [['push_mention', 'pushBrowserBlocked'], ['push_assign', 'pushBrowserBlocked'], ['push_comment', 'pushBrowserBlocked']]) {
    const re = new RegExp(`srow\\([^\\n]*tog\\('${row}'`);
    assert.match(block, re, `the ${row} row keeps its toggle`);
  }
  for (const [row, key] of [['due_reminder', 'settings.notif.dueReminderDesc'], ['past_due', 'settings.notif.pastDueDesc']]) {
    const re = new RegExp(`srow\\([^\\n]*${key.replace(/\./g, '\\.')}[^\\n]*tog\\('${row}'`);
    assert.match(block, re, `the functional ${row} row keeps its real description`);
    assert.doesNotMatch(
      block,
      new RegExp(`srow\\([^\\n]*${key.replace(/\./g, '\\.')}[^\\n]*bad`),
      `the functional ${row} row is badge-free (D-11)`,
    );
  }
  // D-12: the toggles stay rendered and clickable — data-in="np" handler wiring unchanged, no disabled attribute
  assert.equal((block.match(/tog\('push_/g) || []).length, 4, 'the three push toggles + the push_due row (59-03 D-09) are rendered via tog()');
  assert.ok(!block.includes('disabled'), 'no toggle is disabled (D-12)');
});
