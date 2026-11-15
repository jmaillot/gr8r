/* Webhook Teams formatter suite (Phase 67, WHK-04 / D-02 / D-12 / D-14).
   PURE module tests — no server, no imports in the module (subtree.js
   discipline, asserted). Shapes pinned against the 67-RESEARCH MS Learn
   payloads; the AAD mention shape (research assumption A1) is pinned by an
   explicit assertion below. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { formatPayload, truncateToCap } from '../src/core/webhook-formats.js';

const CAP = 28672;
const byteLen = s => Buffer.byteLength(s, 'utf8');
const bodyOf = env => JSON.stringify(formatPayload('teams-adaptive', env));

const baseEnv = event => ({ event, occurredAt: '2026-11-15T12:00:00.000Z', projectId: 'p1', projectName: 'P1', authorName: 'Ada' });

test('teams-adaptive produces the MS Learn Workflows payload shape', () => {
  const payload = formatPayload('teams-adaptive', { ...baseEnv('task.created'), taskId: 't1', title: 'Ship it' });
  assert.equal(payload.type, 'message');
  const att = payload.attachments?.[0];
  assert.equal(att.contentType, 'application/vnd.microsoft.card.adaptive');
  assert.equal(att.contentUrl, null);
  assert.equal(att.content.$schema, 'http://adaptivecards.io/schemas/adaptive-card.json');
  assert.equal(att.content.type, 'AdaptiveCard');
  assert.equal(att.content.version, '1.4');
  assert.ok(Array.isArray(att.content.body));
  for (const block of att.content.body) {
    assert.equal(block.type, 'TextBlock');
    assert.equal(block.wrap, true);
  }
  assert.ok(JSON.stringify(payload).includes('Ship it'), 'the title is rendered');
  assert.ok(JSON.stringify(payload).includes('2026-11-15T12:00:00.000Z'), 'occurredAt is rendered as ISO 8601 UTC (D-04)');
});

test('teams-messagecard produces a MessageCard shape', () => {
  const payload = formatPayload('teams-messagecard', { ...baseEnv('task.completed'), taskId: 't1', title: 'Ship it', done: true });
  assert.equal(payload['@type'], 'MessageCard');
  assert.equal(payload['@context'], 'http://schema.org/extensions');
  assert.ok(payload.summary, 'summary is set');
  assert.ok(JSON.stringify(payload).includes('Ship it'));
});

test('raw-json returns the whitelisted envelope itself (stringified verbatim)', () => {
  const env = { ...baseEnv('task.created'), taskId: 't1', title: 'Ship it' };
  const payload = formatPayload('raw-json', env);
  assert.equal(payload, env, 'the envelope passes through untouched — the caller stringifies it verbatim');
});

test('an unknown format falls back to teams-adaptive (D-12 default)', () => {
  const payload = formatPayload('mystery-format', { ...baseEnv('task.created'), taskId: 't1', title: 'Ship it' });
  assert.equal(payload.type, 'message');
  assert.equal(payload.attachments?.[0]?.contentType, 'application/vnd.microsoft.card.adaptive');
});

test('task.assigned with a persisted oid renders a real AAD <at> mention (D-14, A1 shape)', () => {
  const payload = formatPayload('teams-adaptive', {
    ...baseEnv('task.assigned'),
    taskId: 't1',
    title: 'Team up',
    assignees: ['m1'],
    mentions: [{ memberId: 'm1', name: 'Marie', oid: 'aad-oid-123' }],
  });
  const text = JSON.stringify(payload.content || payload);
  assert.ok(text.includes('<at>Marie</at>'), 'the card text carries the <at> mention');
  const entities = payload.attachments?.[0]?.content?.msteams?.entities;
  assert.ok(Array.isArray(entities) && entities.length === 1, 'msteams.entities carries the mention');
  assert.equal(entities[0].type, 'mention');
  assert.equal(entities[0].text, '<at>Marie</at>');
  assert.deepEqual(entities[0].mentioned, { id: 'aad-oid-123', name: 'Marie' });
});

test('task.assigned without an oid falls back to bold-name, no entities entry (D-14)', () => {
  const payload = formatPayload('teams-adaptive', {
    ...baseEnv('task.assigned'),
    taskId: 't1',
    title: 'Team up',
    assignees: ['m2'],
    mentions: [{ memberId: 'm2', name: 'Leo', oid: null }],
  });
  const text = JSON.stringify(payload);
  assert.ok(text.includes('**Leo**'), 'the bold-name fallback renders');
  assert.equal(payload.attachments?.[0]?.content?.msteams?.entities, undefined, 'no entities entry without an oid');
});

test('a 40 KB comment body is TRUNCATED to the 28 KB cap and still delivered (D-02)', () => {
  const env = { ...baseEnv('comment.added'), commentId: 'c1', taskId: 't1', taskTitle: 'Talk', body: 'x'.repeat(40_000) };
  const capped = truncateToCap(env, 'teams-adaptive');
  const len = byteLen(JSON.stringify(formatPayload('teams-adaptive', capped)));
  assert.ok(len <= CAP, `delivered payload is under the cap (got ${len})`);
  const rendered = JSON.stringify(capped);
  assert.ok(rendered.includes('truncated'), 'the truncated text ends with a truncation marker');
  assert.ok(rendered.includes('Talk'), 'the rest of the envelope survives');
});

test('an envelope whose full body is exactly 28672 bytes passes UNTRUNCATED (boundary)', () => {
  /* Build an envelope whose formatted body measures exactly the cap: start
     with a NON-empty title (an empty one falls back to the taskId label and
     breaks the linear padding math), then pad with ASCII bytes (1 char = 1
     UTF-8 byte) until the full JSON body hits 28672 exactly. */
  const env = { ...baseEnv('task.created'), taskId: 't1', title: 'X' };
  const start = byteLen(bodyOf(env));
  assert.ok(start < CAP, 'sanity: unpadded body is under the cap');
  env.title += 'A'.repeat(CAP - start);
  const exact = byteLen(bodyOf(env));
  assert.equal(exact, CAP, 'constructed body is exactly the cap');
  const capped = truncateToCap(env, 'teams-adaptive');
  assert.equal(byteLen(bodyOf(capped)), CAP, 'the boundary envelope passes untruncated');
  assert.equal(JSON.stringify(capped).includes('truncated'), false);
});

test('multi-byte text is measured in UTF-8 bytes, never code points', () => {
  /* 15 000 é chars: 15 000 CODE points (a code-point cap would pass it) but
     30 000 UTF-8 bytes (over the cap) — only a byte-measured cap truncates. */
  const env = { ...baseEnv('comment.added'), commentId: 'c1', taskId: 't1', taskTitle: 'é'.repeat(100), body: 'é'.repeat(15_000) };
  const capped = truncateToCap(env, 'teams-adaptive');
  const len = byteLen(JSON.stringify(formatPayload('teams-adaptive', capped)));
  assert.ok(len <= CAP, `byte-measured cap truncates the multi-byte body (got ${len})`);
});

test('zero-import discipline: no import or require statements in the module', () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core', 'webhook-formats.js'), 'utf8');
  assert.equal(/^import |^const .*require\(/m.test(src), false, 'src/core/webhook-formats.js must have ZERO imports (subtree.js discipline)');
});
