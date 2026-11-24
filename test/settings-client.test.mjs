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
  assert.match(b, /The list comes ONLY from the server response/, 'the render-only doctrine comment moved');
  assert.match(b, /never from\s+visibleProjects\(\)/, 'the visibleProjects() prohibition comment moved');
  assert.match(b, /if \(api\.enabled && !S\.ui\.myAccessData && !S\.ui\.myAccessErr\) refreshMyAccess\(\);/, 'the payload-driven kick moved');
  assert.match(b, /else if \(!data\.projects\.length\)/, 'the payload shape (data.projects) moved');
  assert.match(b, /body = data\.projects\s*\n\s*\.map\(/, 'the my-access rows no longer render from the payload');
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
    /<div class="row" style="gap:0"><span class="input"[^>]*>\$\{esc\(api\.host\)\}\/w\/<\/span><input class="input" id="ws-url" value="\$\{esc\(d\.ws\.url\)\}"/,
    'the ws-url flex row + prefix span moved',
  );
});
