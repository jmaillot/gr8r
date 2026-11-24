/* =====================================================================
   SETTINGS CLIENT-SLICE HARNESS (plan 95-01 task 3) — surviving-anchor
   pins the later phase-95 plans (95-02 settings polish, my-access payload
   work) rely on and must not break. Static-slice idiom (restore-client /
   team-pick-client / xws-gate precedent): readFileSync + regex assertions
   against the REAL sources — no DOM harness, no server boot.

   Pinned anchors (all green NOW, must stay green after 95-02):
   (a) settings.js my-access derives ONLY from the server response
       (refreshMyAccess → S.ui.myAccessData; never visibleProjects())
   (b) pIcon is imported from ui/helpers.js and used in the my-access rows
   (c) the apiKeyRevoke ask/confirm inline-confirm pair exists — the idiom
       the purge button clones (plan 95-02)
   (d) members.js still consumes the visibility payload (data.projects
       rows) — 95-02's additive payload work proves non-breakage here
   (e) the workspace URL field renders inside the flex row with a host
       prefix span — the anchor 95-02 edits
   ===================================================================== */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = rel => readFileSync(`${ROOT}/${rel}`, 'utf8');

const settings = () => src('src/pages/settings.js');
const members = () => src('src/pages/members.js');

/* The my-access case block, sliced between its case label and the next one. */
const myAccess = () => {
  const s = settings();
  const start = s.indexOf("case 'my-access': {");
  const end = s.indexOf("case 'notif-email':");
  assert.ok(start !== -1 && end > start, 'the my-access case block moved — re-pin this slice');
  return s.slice(start, end);
};

test('(a) my-access derives ONLY from the server response — payload-driven, never visibleProjects()', () => {
  const b = myAccess();
  assert.match(b, /The list comes ONLY from the server\s*\n\s*response/, 'the render-only doctrine comment moved');
  assert.match(b, /never from\s+visibleProjects\(\)/, 'the visibleProjects() prohibition comment moved');
  assert.match(b, /if \(api\.enabled && !S\.ui\.myAccessData && !S\.ui\.myAccessErr\) refreshMyAccess\(\);/, 'the payload-driven kick moved');
  assert.match(b, /else if \(!data\.workspaces\.length\)/, 'the payload shape (data.workspaces, 95-02 aggregate) moved');
  assert.match(b, /body = data\.workspaces\s*\n\s*\.map\(/, 'the my-access groups no longer render from the payload');
  assert.ok(!/visibleProjects\(\)/.test(b.replace(/never from\s+visibleProjects\(\)/, '')), 'my-access calls visibleProjects() — the client doc is not the truth-teller');
});

test('(b) pIcon rides the helpers import and renders in the my-access rows', () => {
  assert.match(settings(), /import \{ av, pIcon \} from '\.\.\/ui\/helpers\.js';/, 'the helpers import lost pIcon');
  assert.match(myAccess(), /pIcon\(p, '', 14\)/, 'my-access rows no longer use pIcon');
});

test('(c) the apiKeyRevoke ask/confirm inline-confirm pair exists (the 95-02 purge-button idiom)', () => {
  const s = settings();
  assert.match(s, /data-a="apiKeyRevokeAsk" data-id="\$\{esc\(k\.id\)\}"/, 'the revoke ask stage moved');
  assert.match(s, /data-a="apiKeyRevokeConfirm" data-id="\$\{esc\(k\.id\)\}"/, 'the revoke confirm stage moved');
  assert.match(s, /data-a="apiKeyCancel"/, 'the revoke cancel escape moved');
});

test('(d) members.js still consumes the visibility payload (data.projects rows)', () => {
  const m = members();
  assert.match(m, /body = data\.projects\s*\n\s*\.map\(/, 'the members visibility expander no longer renders the payload');
  assert.match(m, /data && !data\.err \? ` \(\$\{data\.projects\.length\}\)`/, 'the payload-driven count moved');
});

test('(e) the workspace URL field renders inside the flex row with a host prefix span (the 95-02 edit anchor)', () => {
  const s = settings();
  assert.match(
    s,
    /<div class="row" style="gap:0[^"]*"><span class="input"[^>]*>\$\{esc\(api\.host\)\}\/w\/<\/span><input class="input" id="ws-url" value="\$\{esc\(d\.ws\.url\)\}"/,
    'the ws-url flex row + prefix span moved',
  );
});

/* ---- 95-02 slices: card grid (D-07/D-08), purge button (D-09/D-10), URL (D-13) ---- */

test('95-02 (D-07): my-access renders read-only cards grouped by workspace — no action handlers on cards', () => {
  const b = myAccess();
  assert.match(b, /data\.workspaces\s*\n\s*\.map\(/, 'one group per workspace');
  assert.match(b, /esc\(w\.name\)/, 'the workspace name is the group subtitle');
  assert.match(b, /pIcon\(p, '', 14\)/, 'cards reuse the colored-project-icon idiom');
  assert.match(b, /t\('common\.role\.' \+ \(p\.role \|\| 'member'\)\)/, 'the D-08 role badge renders from the payload role');
  assert.match(b, /visReasonLabel\(p\)/, 'the vis-reason badge survives');
  const card = b.slice(b.indexOf('border:1px solid var(--border);border-radius:8px;padding:6px 10px'));
  assert.ok(card.includes('cursor:default'), 'the card is read-only styled');
  assert.ok(!/data-a=/.test(card.slice(0, card.indexOf('</div>'))), 'no click/action handler on the card itself (D-07 read-only)');
});

test('95-02 (D-09): the purge button renders only when revoked keys exist, with the 2-click ask→confirm pair', () => {
  const s = settings();
  const start = s.indexOf("case 'apikeys': {");
  const end = s.indexOf("case 'sessions': {");
  assert.ok(start !== -1 && end > start, 'the apikeys case block moved — re-pin this slice');
  const b = s.slice(start, end);
  assert.match(b, /rows\.some\(k => k\.revokedAt\)/, 'the purge button is gated on revokedAt presence');
  assert.match(b, /data-a="apiKeyPurgeAsk"/, 'the ask stage exists');
  assert.match(b, /data-a="apiKeyPurgeConfirm"/, 'the confirm stage exists');
  assert.match(b, /S\.ui\.apiKeyPurge/, 'the purge stage rides S.ui (the 95-02 state key)');
  assert.match(b, /S\.ui\.apiKeyPurge\s*\n\s*\?[\s\S]*?data-a="apiKeyPurgeConfirm"[\s\S]*?data-a="apiKeyCancel"/, 'confirm+cancel only when armed');
  assert.match(b, /: `<div class="sblock"><div class="row" style="justify-content:flex-end"><button class="btn btn-danger-ghost btn-sm" data-a="apiKeyPurgeAsk">/, 'the unarmed branch renders the ask button only');
});

test('95-02 (D-13): the workspace URL sits on one line — ellipsis + full-URL title tooltip, no marquee', () => {
  const s = settings();
  const start = s.indexOf('id="ws-url"');
  assert.ok(start !== -1, 'the ws-url field moved');
  const b = s.slice(Math.max(0, start - 400), start + 300);
  assert.match(b, /white-space:nowrap/, 'the URL row is nowrap (D-13)');
  assert.match(b, /text-overflow:ellipsis/, 'the value ellipsizes (D-13)');
  assert.match(b, /title="\$\{esc\(api\.host\)\}\/w\/\$\{esc\(d\.ws\.url\)\}"/, 'the full URL rides the title attribute (hover tooltip)');
  assert.ok(!/marquee/i.test(s), 'no marquee anywhere');
});

test('95-02: the purge actions clone the revoke idiom and toast the removed count', () => {
  const a = src('src/actions/actions.js');
  assert.match(a, /A\.apiKeyPurgeAsk = \(\) => \{\s*\n\s*S\.ui\.apiKeyPurge = true;/, 'the ask action arms the stage');
  assert.match(a, /api\.purgeRevokedKeys\(\)/, 'the confirm action calls the purge endpoint');
  assert.match(a, /t\('settings\.apikeys\.purgedToast', \{ n: res\.data\.removed \}\)/, 'the toast carries the removed count (D-10)');
  assert.match(a, /S\.ui\.apiKeyPurge = null;/, 'cancel/confirm both clear the stage');
});
