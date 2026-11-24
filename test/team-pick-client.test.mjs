/* =====================================================================
   PHASE 84 BP-01 TEAM PICKER (84-02 task 2): static client-source
   assertions per the creation-gate-client precedent (no DOM harness →
   source assertions). The team picker clones the 55-04 assignee-picker
   modal pattern (open/toggle/apply trio, draft-in-S.ui, lazy chunk,
   foldForSearch filter) onto both team-selection surfaces, per D-01/D-02.

   Pinned invariants (plan 84-02 task 2 behavior block):
   (1) teamPickOpen seeds S.ui.teamPick = { surface, draft, q } from the
       surface's current array and lazy-imports through S.ui.tpMod
   (2) teamPickApply writes the whole draft as ONE array write back to
       S.ui.inviteTeams / S.ui.memberTeams.teams and clears S.ui.teamPick;
       scope/scopeTouched untouched
   (3) the search filter matches only via foldForSearch containment
   (4) POST-shape pin — submitInvite/copyInviteLink still read
       [...new Set(S.ui.inviteTeams || [])]; open/apply never touch
       S.ui.inviteDraft (Pitfall 1)
   (5) entry-chunk pin — team-pick is dynamically imported, never static
   (6) D-03 keyboard contract in keyboard.js: Enter select-and-keep-open,
       Backspace remove last chip, Escape close
   (7) aria combobox/listbox/option contract + esc() on all interpolated
       list content (T-84-02)
   ===================================================================== */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = rel => readFileSync(`${ROOT}/${rel}`, 'utf8');

const actions = () => src('src/actions/actions.js');
const pick = () => src('src/features/team-pick.js');
const keyboard = () => src('src/actions/keyboard.js');
const modals = () => src('src/overlays/modals.js');

/* (1) the opener: draft-in-S.ui from the surface's current array + tpMod gate */
test('teamPickOpen seeds S.ui.teamPick = { surface, draft, q } and lazy-imports through S.ui.tpMod', () => {
  const a = actions();
  assert.match(a, /S\.ui\.teamPick = \{ surface, draft: \[\.\.\.cur\], q: '', hl: 0 \}/, 'the opener state shape moved');
  assert.match(a, /surface === 'invite' \? S\.ui\.inviteTeams \|\| \[\] : S\.ui\.memberTeams\?\.teams \|\| \[\]/, 'the current-teams read does not fork on surface');
  assert.match(a, /if \(S\.ui\.tpMod\) openModal\(\{ type: 'teamPick' \}\);/, 'the module-cache fast path is missing');
  assert.match(a, /import\('\.\.\/features\/team-pick\.js'\)\.then\(m => \{[\s\S]{0,120}S\.ui\.tpMod = m;/, 'the dynamic-import gate is missing');
});

/* (2) the apply: ONE array write, state cleared, scope untouched */
test('teamPickApply writes the whole draft as ONE array write and clears S.ui.teamPick; scope/scopeTouched untouched', () => {
  const a = actions();
  const apply = a.slice(a.indexOf('A.teamPickApply'), a.indexOf('A.teamPickApply') + 700);
  assert.match(apply, /const draft = \[\.\.\.st\.draft\];/, 'the draft snapshot write is missing');
  assert.match(apply, /if \(st\.surface === 'invite'\) S\.ui\.inviteTeams = draft;/, 'the invite write is missing');
  assert.match(apply, /S\.ui\.memberTeams\.teams = draft/, 'the member write is missing');
  assert.match(apply, /S\.ui\.teamPick = null;/, 'the picker state is not cleared');
  assert.ok(!apply.includes('scopeTouched') && !apply.includes('.scope'), 'teamPickApply must never touch scope/scopeTouched');
});

/* (3) the search filter: foldForSearch containment only */
test('the picker search filter matches only when foldForSearch(q) is contained in foldForSearch(teamName)', () => {
  const p = pick();
  assert.match(p, /import \{ esc, foldForSearch \} from '\.\.\/core\/utils\.js';/, 'foldForSearch/esc not imported from core/utils');
  assert.match(p, /const needle = foldForSearch\(st\.q \|\| ''\)\.text;/, 'the folded needle is missing');
  assert.match(p, /!needle \|\| foldForSearch\(tm\.name\)\.text\.includes\(needle\)/, 'the folded containment filter is missing');
});

/* (4) the POST shape and the invite-draft silent binding are load-bearing */
test('POST-shape pin: submitInvite and copyInviteLink still read [...new Set(S.ui.inviteTeams || [])]; picker open/apply never clear S.ui.inviteDraft', () => {
  const a = actions();
  assert.ok(a.includes('const teams = [...new Set(S.ui.inviteTeams || [])];'), 'the invite POST shape moved (submitInvite + copyInviteLink read it twice)');
  const open = a.slice(a.indexOf('A.teamPickOpen'), a.indexOf('A.teamPickOpen') + 700);
  const apply = a.slice(a.indexOf('A.teamPickApply'), a.indexOf('A.teamPickApply') + 700);
  for (const [name, block] of [['teamPickOpen', open], ['teamPickApply', apply]])
    assert.ok(!block.includes('inviteDraft'), `${name} must never touch S.ui.inviteDraft (Pitfall 1 — typed emails)`);
});

/* (5) the chunk story: dynamic import only, entry sources never carry the module */
test('entry-chunk pin: team-pick is dynamically imported via S.ui.tpMod, never statically imported', () => {
  const a = actions();
  assert.ok(!/from '\.\.\/features\/team-pick\.js'|from '\.\/features\/team-pick\.js'/.test(a), 'a STATIC import of team-pick.js exists — the chunk gate regression');
  const m = modals();
  assert.match(m, /case 'teamPick':[\s\S]{0,300}S\.ui\.tpMod \? S\.ui\.tpMod\.teamPickModal\(m, H\) :/, "modalHtml's teamPick case does not render through the lazy module");
  for (const f of ['src/overlays/modals.js', 'src/shell/render.js', 'src/overlays/drawer.js'])
    assert.ok(!/from '\.\.\/features\/team-pick\.js'|from '\.\/features\/team-pick\.js'|from '\.\.\/\.\.\/features\/team-pick\.js'/.test(src(f)), `${f} statically imports team-pick.js`);
});

/* (6) D-03 keyboard contract over the picker's search input */
test('keyboard contract per D-03: Enter selects highlighted and keeps the input open, Backspace removes the last chip, Escape closes', () => {
  const k = keyboard();
  assert.match(k, /t\.matches\?\.\('\[data-in="teamPickQ"\]'\)/, 'the picker input is not claimed in keyboard.js');
  const branch = k.slice(k.indexOf('[data-in="teamPickQ"]'));
  assert.match(branch, /A\.teamPickAdd\(\{ dataset: \{ v: hit \} \}\)/, 'Enter does not add the highlighted candidate');
  assert.ok(!/if \(e\.key === 'Enter'[\s\S]{0,200}closeModal/.test(branch), 'Enter must keep the picker open (multi-add, D-03)');
  assert.match(branch, /e\.key === 'Backspace'[\s\S]{0,300}(st|pk)\??\.draft = (st|pk)\??\.draft\.slice\(0, -1\)/, 'Backspace does not remove the last chip');
  assert.match(branch, /e\.key === 'Escape'[\s\S]{0,200}A\.teamPickClose\(\)/, 'Escape does not close the picker');
  const a = actions();
  assert.match(a, /A\.teamPickAdd = el => \{[\s\S]{0,400}st\.q = '';/, 'teamPickAdd does not accumulate the chip and clear the query');
  assert.match(a, /A\.teamPickClose = \(\) => \{[\s\S]{0,200}S\.ui\.teamPick = null;[\s\S]{0,200}closeModal\(\)/, 'teamPickClose does not discard the draft and close');
});

/* (7) the aria contract + XSS escape (T-84-02) */
test('aria combobox/listbox/option contract with .hl highlight, and esc() on every interpolated list content', () => {
  const p = pick();
  assert.match(p, /role="combobox" aria-expanded="true" aria-controls="tp-list" aria-activedescendant="tp-opt-\$\{st\.hl\}"/, 'the combobox aria contract is missing');
  assert.match(p, /autocomplete="off"/, 'the search input must disable native autocomplete');
  assert.match(p, /role="listbox" id="tp-list"/, 'the listbox role is missing');
  assert.match(p, /role="option" aria-selected="\$\{i === st\.hl\}"/, 'the option aria contract is missing');
  assert.match(p, /class="opt \$\{i === st\.hl \? 'hl' : ''\}/, 'the .hl highlight class is missing');
  assert.ok(!/\$\{tm\.name\}/.test(p), 'a raw tm.name interpolation survives — every team name must ride esc()');
  assert.ok(!/\$\{m\.name\}/.test(p), 'a raw member-name interpolation survives — every name must ride esc()');
});

/* (8) SET-04 / D-12 (plan 95-01 task 2): ONE chip-toggle contract — the
   invite chips ride data-a="mteamToggle" under data-surface="invite" and
   A.invTeamToggle is retired. */
test('the invite chips carry data-a="mteamToggle" under data-surface="invite" (D-12 unified contract)', () => {
  const m = modals();
  assert.match(m, /<form class="modal-b" data-submit="submitInvite" data-surface="invite">/, 'the invite form lost its surface marker');
  const inviteChips = m.slice(m.indexOf('data-submit="submitInvite" data-surface="invite"'), m.indexOf('data-surface="invite">ic'));
  assert.ok(inviteChips.includes('data-a="mteamToggle"'), 'the invite chips no longer use the mteamToggle contract');
  assert.ok(!inviteChips.includes('invTeamToggle'), 'a stale invTeamToggle chip survives in the invite markup');
  /* Member modal chips unchanged (the default branch of the toggle). */
  assert.match(m, /data-a="mteamToggle" data-v="\$\{id\}"/);
});

test('A.mteamToggle is surface-aware (invite → S.ui.inviteTeams, member → S.ui.memberTeams) and A.invTeamToggle is retired', () => {
  const a = actions();
  assert.match(a, /A\.mteamToggle = el => \{[\s\S]{0,200}el\.closest\('\[data-surface="invite"\]'\)[\s\S]{0,600}S\.ui\.inviteTeams[\s\S]{0,600}S\.ui\.memberTeams/, 'mteamToggle lost its surface-aware branch');
  assert.ok(!/A\.invTeamToggle = /.test(a), 'A.invTeamToggle still exists — the action was not retired');
});
