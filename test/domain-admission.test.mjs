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

/* ---------- DOM-02: tri-state inheritance + D-06 boot logs ---------- */

test('unset ALLOW_INVITE_DOMAINS inherits the signup list, source-tagged inherit in the boot log', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const out = server.output();
    /* the single committed mechanism for this case: the D-06 boot log line */
    const line = out.split('\n').find(l => l.includes('ALLOW_INVITE_DOMAINS:'));
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
    const signupLine = out.split('\n').find(l => l.includes('ALLOW_SIGNUP_DOMAINS:'));
    const inviteLine = out.split('\n').find(l => l.includes('ALLOW_INVITE_DOMAINS:'));
    assert.ok(signupLine && signupLine.includes('a.com') && signupLine.includes('(source: own)'), `signup line: ${signupLine}`);
    assert.ok(inviteLine && inviteLine.includes('b.com') && inviteLine.includes('(source: own)'), `invite line: ${inviteLine}`);
  } finally {
    await server.stop();
  }
});
