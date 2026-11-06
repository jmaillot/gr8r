/* =====================================================================
   Phase 43 plan 02 — digest email header logo (D-07/D-10/D-11).
   Unit-level: buildDigestMessage is a named export (Phase 40 pattern),
   so the header <img> contract is pinned without a live SMTP round-trip.
   ===================================================================== */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDigestMessage } from '../mailer.js';

const config = { fromName: 'Projects Studio', from: 'digest@projects.studio' };
/* buildDigestMessage returns { to, data } — data is the raw MIME message and the
   html part is base64, so decode every body chunk and concatenate the readable text. */
const build = msg => {
  const out = buildDigestMessage(config, { ...baseMsg, ...msg }).data;
  const base64Chunks = out.split('\r\n\r\n').slice(1);
  return base64Chunks.map(c => Buffer.from(c.replace(/\r\n/g, ''), 'base64').toString('utf8')).join('\n');
};
const firstImg = out => (out.match(/<img[^>]*>/) || [])[0];
const baseMsg = {
  to: 'ada@example.com',
  locale: 'en',
  workspace: 'Acme',
  wsSlug: 'acme',
  appUrl: 'http://localhost:3000',
  dueToday: [{ key: 'T-1', title: 'Ship it', project: 'Website' }],
  overdue: [],
};

test('D-07: logoUrl present → absolute, escaped, versioned header img capped at 48px, alt = workspace name', () => {
  const out = build({ logoUrl: 'http://localhost:3000/w/acme/logo?v=1698' });
  const img = firstImg(out);
  assert.ok(img, 'header img emitted');
  assert.ok(img.includes('src="http://localhost:3000/w/acme/logo?v=1698"'), 'absolute + versioned src');
  assert.ok(img.includes('alt="Acme"'), 'alt = workspace name');
  assert.ok(img.includes('max-height:48px'), 'D-07 cap');
});

test('T-43-07: hostile logoUrl is escapeHtml\u2019d before interpolation', () => {
  const out = build({
    logoUrl: 'http://x/w/a/logo?v=1" onerror="alert(1)',
  });
  assert.ok(out.includes('&quot; onerror=&quot;alert(1)'));
  assert.ok(!out.includes('onerror="alert(1)"'));
});

test('D-10: logoUrl absent → no img, header unchanged (text-only identity)', () => {
  const out = build({});
  assert.ok(!out.includes('<img'));
  const withEmpty = build({ logoUrl: '' });
  assert.ok(!withEmpty.includes('<img'));
});
