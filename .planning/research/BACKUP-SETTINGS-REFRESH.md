# v3.9 Backup & Settings UI Refresh — Research

**Researched:** 2026-11-29 (post-v3.8-ship tree, tag v3.8; every anchor read this session)
**Scope:** Backup console + Settings refresh onto the v3.7/v3.8 perm-t design language · scheduler/load-flake housekeeping · wording residue
**Confidence:** HIGH — codebase-grounded (backup.js 900 lines, settings.js 873 lines, both read in full; pins, tests, planning artifacts read directly). Zero ecosystem research needed (zero-dependency house SPA).

## Stack / Architecture Status

| Aspect | Status |
|---|---|
| Stack | Unchanged: zero-dep Node server + hand-rolled ES-module SPA. **Zero new dependencies, zero server changes** for the whole milestone (see Q5 — payload check passed). |
| Design language | Established by v3.7 Phase 107, codified by v3.8 Phase 109: `perm-t` table + `<div class="panel" style="overflow-x:auto">` + named th headers (first `padding-left:14px`, trailing empty gutter) + faint When column + keyed empty states + esc() everywhere. |
| Pins today | verbs = **86** (test/i18n-core-features.test.mjs:171, −1 auditLog retirement) · data-a = **635** (test/i18n-shell.test.mjs:349) · data-v = **94** (:350) · data-r = **64** (:351) — all annotated same-commit (D-12 convention). |
| i18n namespaces | `page.backup.*` = **115 keys**, `page.restore.*` = **57 keys**, `settings.*` = **238 keys** (en catalogue, counted programmatically). ×5 parity enforced by build-locales/i18n-scan gates. |
| Baseline | 2836 tests, exactly 2 documented failures (french-typography content, webhook-routes GET list) + the known full-suite-only load-flake family (Q6). |

---

## Q1 — backup.js anatomy TODAY (line-verified, src/pages/backup.js, 900 lines)

**Good news first: backup.js is ~85% already on the design language.** The v3.4 Phase 94 rebuild gave it real `perm-t` tables; drift is detailing, not structure.

| Surface | Anchor | Structure | Idiom compliance |
|---|---|---|---|
| Task table | taskTable :389–430 | `perm-t` min-width:**860** (:429), panel `overflow-x:auto`, first th `padding-left:14px`, gutter th, named headers (Task/Scope/Schedule/Next run/Last run/—), per-row controls :391–397, enabled badge :421 | ⚠️ right family, min-width **860 ≠ 880 standard** |
| Unified run history | historySblock :272–339, table :320 | `perm-t hist-t` min-width:**820** (:320), panel `overflow-x:auto`, named headers (Type/Task/Trigger/Schedule/Status/Date/gutter), merged backup+restore rows sorted by date :311–314 | ⚠️ min-width **820 ≠ 880**; see restore-row header mismatch below |
| Backup history rows | historyTr :175–270 | real `<tr>`s, When cell :267 (`fmtDate(started_at||created_at)`, `—` fallback), per-state badges :212–246, gutter actions :247–260 | ✅ compliant |
| Restore history rows | restoreRunTr :795–833 | real `<tr>`, When cell :830, status badge :829, gutter empty :831 | ❌ **header mismatch**: the initiator name (`created_by_name` :827) renders in the cell under the **Task** header (header 2 = `page.backup.colTask`) — a column with no header of its own; schedule cell is a hardcoded filler `<td><span class="faint">—</span></td>` :828. Also malformed markup on :826 (two `<td>`s on one line with stray whitespace — cosmetic). |
| Rotation-deletion preview | deletionsPanel :469–494 | div rows (count + GFS label + expander), border-top separators, NOT a table | ⚠️ deliberate: ephemeral server projection with aria-expanded/controls per D-90-14 — restyle optional, converting to perm-t is a judgement call for discuss-phase |
| Run now card | runNowCard :55–91 | form panel (selects + CTA) | ✅ form, not a table — out of idiom scope |
| Run/restore progress panels | runProgress :97–117, restoreProgress :765–784 | panel-h + badge + body | ✅ fine |
| Task builder form | taskFormCard :496–574 | form fields, retention grid, destination toggles | ✅ form |
| Restore preview drawer | restorePreviewDrawer :751–759 + restorePreviewBody :620–749 | drawer idiom, detail grid :731–736, chip pickers (workspace :656–664, project :673–681, source+probe+stat :692–730) | ✅ chips are the sanctioned picker idiom (105/108 pinned); leave byte-identical (105-01 pins freeze the probe markup) |
| Empty states | :315–321 (history loading/err/empty), :881–883 (`empty()` tasks) | keyed, three-tier | ✅ |
| Esc discipline | — | every payload string through esc() | ✅ keep verbatim |

**Concrete drift list for Backup (the whole refresh):**
1. min-width 860 (task table :429) and 820 (history :320) → **880 standard** (or document a smaller honest value; 109's trail precedent says "skip min-width — narrow columns don't need 880" — but these two tables are wide, so 880).
2. restoreRunTr header alignment: initiator gets its own header (e.g. reuse the `page.restore.initiatorLabel` key or a col-header key) OR fold initiator into the Run cell — owner ruling. The filler schedule `<td>—</td>` either gets a real value (restore rows have no schedule) or the merged table's headers need a restore-aware variant.
3. Fix the :826 malformed line (stray whitespace inside the `<tr>`).
4. Optional: deletionsPanel → compact table (only if owner wants full uniformity; D-90-14's honest-zeros + expander semantics must survive).

## Q2 — settings.js anatomy post-audit-removal (line-verified, src/pages/settings.js, 873 lines)

**Critical framing:** settings.js's `srow()` (:105–107) is the page's NATIVE idiom for preference rows (title + desc + control). It is NOT drift for toggles/selects. The design language (perm-t) applies to **tabular data lists**. The drift is where srow/mini-cards carry *data collections* that deserve tables.

| Section | Anchor | Structure | Verdict |
|---|---|---|---|
| Workspace | :261–293 | logo form + srow toggles (:275–276) + danger-zone srows (:279–290) | ✅ preference rows — keep srow |
| Appearance | :294–357 | themecards grid + accent srow (:311) + density seg srows (:342–343) + preview | ✅ |
| Language / Datetime | :358–427 | srow rows with selects/combobox | ✅ |
| Members | :428–433 | **mini cards** (`div.mini` :432) — avatar/name/email/role badge/ctx btn | ⚠️ card list — the Members *directory* page is the primary surface; this is a condensed view. Convert to perm-t (Member/Role/When-joined?/ctx) or leave — owner ruling. Payload check needed if a When column is wanted (memberships GET carries created_at? — verify at discuss) |
| Projects | :453–485 | **srow rows** for active (:460) and archived (:483) projects — name+teams \| status badge / restore+delete | ❌ drifted — data list in srow cards, no headers, no When column. Prime perm-t candidate: Project / Teams / Status / (actions) + gutter |
| My access | :486–513 | bordered chip cards per project, grouped by workspace (:505–510) | ✅ deliberate read-only cards (95-02 D-07 pins: no action handlers, card-grid idiom) — leave |
| Notif email/push/mentions | :515–589 | toggle srows; push devices srows (:557–570, `ago(dev.created_at)` :564 inline, no header) | ⚠️ devices list is tabular (Device / Last seen When / Test / Delete) — small perm-t candidate |
| Profile / Password | :590–651 | forms | ✅ |
| Shortcuts | :632–639 | srow kbd rows | ✅ reference list, fine |
| TFA | :652–799 | srow status row + **factor srows** (:687–697, name \| ago(lastStep) \| remove) + staged forms | ⚠️ factors list is tabular-ish (Factor / Last used / remove) — small perm-t candidate or leave (usually ≤3 rows) |
| API keys | :800–849 | **srow cards** (:811–820): label+prefix+scope badge \| workspace·expires·lastUsed inline text \| revoke inline-confirm; purge srow (:829–834) | ❌ drifted — the richest data list on the page (label/scope/workspace/expires/last-used/revoke state) in cards with the When data buried in arg-2 text. Prime perm-t candidate: Key / Scope / Workspace / Expires(When) / Last used(When) / gutter. **Inline-confirm trio pins (settings-client.test.mjs:56–58) must survive** |
| Sessions | :850–869 | **srow cards** (:860–866): device+this-device badge \| ip·ago(lastSeen) inline \| revoke | ❌ drifted — prime perm-t candidate: Device / IP / Last seen(When) / gutter. D-19 (no location column) and D-25 (NULL last_seen → createdAt fallback :863) semantics keep |

**Note the audit-trail card is already gone** (owner removal, pins annotated — verbs 86/data-a 635/data-v 94 include that −1/−2); the sessions tab now contains only the sessions list + revoke-all button :868.

## Q3 — The design-language checklist (distilled from mappings.js / 109)

Every table surface must satisfy ALL of:

1. **Markup**: `<table class="perm-t">` inside `<div class="panel" style="overflow-x:auto">` (mappings.js:86 recipe; 109-VERIFICATION:38 confirms the four governance tables all pass).
2. **Headers**: named `<th>` row — first th `style="padding-left:14px"`, last th an empty gutter `<th></th>`.
3. **min-width**: `880px` on the table for wide tables (mappings/governance standard); smaller/narrow tables may omit it (109's 4-column trail precedent) but the decision must be explicit.
4. **When column**: a dedicated faint column with a named header (e.g. `colWhen`-style key), cell = `ago(ts)` or `—` on null — never a timestamp buried in hint text or arg-2 prose.
5. **Empty states**: keyed `empty()` three-tier or the `faint` keyed line per section (loading/err/empty).
6. **esc()**: every payload string through esc() — cells, titles, value attributes (T-79-10).
7. **Badges**: per-state `.badge green/amber/red/accent` vocabulary, not bare badges.
8. **Controls**: gutter buttons, staged inline-confirm trio for destructive actions (ask → confirm + cancel), one data-a per markup occurrence.
9. **i18n**: new keys ×5 locales same commit as the emitting markup (D-12/GD-7); hard new-key budget declared per phase (~2–4); `i18n:scan` 0 stale/0 pending.
10. **Pins**: data-a/data-v/data-r/verbs annotated same-commit if any occurrence moves (D-12 comment style at i18n-shell.test.mjs:349–351).
11. **Teardown**: any new S.ui slot joins the page's teardown in the same commit.

## Q4 — Pin inventory & i18n namespaces

**Pins (exact locations):**
- verbs = 86 — test/i18n-core-features.test.mjs:171 (annotation chain already carries the auditLog −1)
- data-a = 635 — test/i18n-shell.test.mjs:349
- data-v = 94 — :350
- data-r = 64 — :351 (r shifts only if nav/route-level links change — unlikely here)

**Shift forecast:**
- Backup: converting tables in place moves **zero** data-a (all actions already live in the same markup shapes). min-width/header edits don't touch pins. **Expect 635/94/86 unchanged.**
- Settings: srow→perm-t conversions DO move occurrences: sessions `revokeSession` (1), apikeys revoke trio `apiKeyRevokeAsk/Confirm` + `apiKeyCancel` (3 markup occurrences, pinned by settings-client.test.mjs:56–58), purge pair `apiKeyPurgeAsk/Confirm` (2), push devices `pushTest`/`pushUnsub` (2 if converted), projects `restoreProject`/`delProject`/`go` (3 if converted), members `pop`/`ctxBtn` (2 if converted). Each keeps one data-a per markup occurrence → count should be **net-zero if converted one-for-one**, but verify with the pin and bump-with-annotation in the same commit if it shifts (D-12). data-v moves if any chip/seg conversion changes value carriers (sessions/apikeys carry data-id, not data-v — likely unchanged).
- settings-client.test.mjs:56–58, 97–101 literal-markup regex pins on the apikeys revoke/purge pairs **will break** if the srow shape changes — these pins must be updated in the same commit (they pin idiom presence, not srow-ness; rewrite the regexes against the new markup).

**i18n keys that shift:**
- Backup: possibly 1–2 new header keys (`colInitiator`-style) if the restore-row header fix adds a column; retire nothing. `page.backup.*` 115 → ≤117.
- Settings: header keys for the new tables (Key/Device/Status/Expires/Last seen…) — reuse `settings.apikeys.*` / `settings.sessions.*` wordings where truthful, add col-header keys only where none fits (~4–8 keys ×5). The settings namespace has no col-header convention today — consider `settings.colWhen`-style shared keys per section rather than cross-page reuse of `page.backup.*` (109's W4 lesson: cross-page key reuse was rejected as wrong-namespace).

**Test files pinning backup/settings markup:**
- test/backup-history-client.test.mjs — task-table esc pins (:36), unified-history verbatim (:93), cron negatives (:59, :234), 5-locale key parity (:148), 4-state badge (:189). Header/min-width edits: safe; restore-row restructure: update :93 assertions if cells move.
- test/settings-client.test.mjs — my-access cards (:78–87, keep), apikeys revoke/purge literal regexes (:56–58, :90–101, :115 — will break, update same commit), workspace-URL one-line (:104).
- test/settings-tz-combobox.test.mjs — combobox untouched.
- test/backup-routes.test.mjs — server-side, unaffected by client refresh.
- i18n-pages/i18n-core-features — key-count chains annotated same-commit.

## Q5 — Server/API changes needed: ZERO (with one payload note)

**Zero routes, zero err keys, zero migrations.** Every When-column field the refresh needs is already in the served payloads:
- backup runs (`?all=1` + per-task): `started_at`/`created_at` — already rendered (backup.js:177–178, :797–798).
- restore runs: `started_at`, `created_by_name` (v3.7 left-join), `archive_name`, `final_name`, `summary` — all present (backup.js:797–827).
- sessions: `lastSeenAt`/`createdAt`/`ip`/`userAgent`/`current` — present (settings.js:862–864).
- api keys: `label`/`prefix`/`scope`/`workspaceName`/`expiresAt`/`lastUsedAt`/`revokedAt`/`expired` — present (settings.js:813–814).
- projects: `p.name`/`p.status`/teams via `projTeams(p)` — present (settings.js:459–460).
- **One verify-at-discuss item**: if the Members section gains a When (joined) column, confirm the members payload carries `created_at`/joined — settings.js:432 renders only name/email/status/role today; if absent, that column is dropped, not added server-side (keep the zero-server-delta gate).

## Q6 — Scheduler/load flake (v3.3-era): mechanism + options

**Test:** test/backup-routes.test.mjs:508 — "restore upload: a re-uploaded instance archive publishes as uploaded-<name>…".

**Recorded observations:**
- 110-01-SUMMARY.md:66–68 ("Observed"): full-suite run showed this test fail; isolated runs of the file passed 16/16 twice. Tied to the v3.3-era "scheduler overlap load-flake" family (PROJECT.md:90).
- 110-VERIFICATION.md:31–35: reproduced once via a sibling (`locale-registry-fixture.test.mjs` i18n scan gate under load; isolated 5/5 green). Assessment: stays an observation; future-housekeeping recommendation = "serialize or resource-isolate the backup-routes/i18n-fixture tests to eliminate the contention family"; do not block a milestone on it.

**Mechanism (read from the test):** the test performs a REAL backup run (`POST /api/backup/runs` → `pollCurrent` until `done` :519–522), reads archive bytes, uploads, previews, re-uploads. Under full-suite CPU contention the poll timeout can lapse or the scheduler's own tick can interleave (the v3.3 "no-overlap/skipped_overlap" scheduler machinery runs in the same process), producing a non-deterministic timing failure that never reproduces isolated. It is a resource-contention family, not a logic bug — siblings fail under the same load (110's i18n-fixture sighting proves it's not backup-specific).

**Stabilization options (for the housekeeping task):**
1. **Document-as-known-flake with a dedicated allowlist** (cheapest): name the family once in PROJECT.md deferred-items wording (already there) + a comment block atop backup-routes.test.mjs; baseline wording becomes "2 documented failures + the documented full-suite contention family". No code change.
2. **Serialize the heavy integration files**: run backup-routes (and the i18n fixture) with `node --test --test-concurrency` isolation or split them into a separate npm script executed after the main suite — removes the contention window entirely but changes the test runner invocation (touches package.json, verify gates, CI docs).
3. **Timeout inflation inside the test**: raise `pollCurrent` bounds under a `process.env.CI_LOAD` flag — masks rather than fixes; rejected by house doctrine (deterministic instants, no sleeps).

**Recommendation:** option 1 for v3.9 (one comment + one PROJECT.md wording touch), option 2 parked as a future housekeeping item. Do NOT reach for retries/fake timers (same doctrine as the v3.8 webhook fix).

## Q7 — Wording residue & small debts

- **ROADMAP.md**: clean 11-line stub (v3.8 archived entry present, 🚧 next-milestone placeholder ready). Nothing to fix.
- **STATE.md**: header still says "# Project State: Projects Studio — v3.6" (:17) while frontmatter says milestone v3.8 complete; "Current milestone: v3.6" body (:21) and "Phase: 107" (:28) drift. GSD refreshes at v3.9 intake — optional manual touch-up, cosmetic.
- **PROJECT.md:90**: v3.3 "Known gaps carried forward" names the webhook-events family (now dead) and "scheduler overlap load-flake" — the flake family is the surviving item; if option 1 (Q6) is taken, one bracketed annotation `[status v3.9: contention family documented, backup-routes.test.mjs header]` keeps the record honest. The webhook-events mention is historical (inside the v3.3 archive block) — leave.
- **Seeds**: all three already marked `status: implemented` (verified this session). No residue.
- **109 research file**: `.planning/phases/109-.../109-RESEARCH.md` does not exist (research lived at `.planning/research/GOVERNANCE-REFRESH.md`) — no dangling reference found; no action.
- **110-VERIFICATION.md:15** history note about interleaved commits — accurate, leave.

## Q8 — Ecosystem scan / scoping flags

- **No FEATURES/REQUIREMENTS gaps**: no open v3.8 leftovers; 108-VERIFICATION's UAT-level eyeball items (badge third state on real hardware) remain one-line UAT notes, not phases.
- **Owner-UAT watch item for this refresh**: restore-run header realignment (Q1 #2) is a small UX ruling — put it in front of the owner at discuss-phase rather than guessing.
- **Chunk gate**: settings.js is the lazy settings chunk; backup.js sits in the entry/lazy-split per D-02. Markup-only edits won't move the 500 kB gate, but the gate run stays mandatory per phase.
- **Deletion-preview table conversion** (Q1 #4) is the only scope-grey area — everything else is mechanical.

---

## Pitfalls (refresh-specific)

1. **settings-client literal regex pins break on srow→table conversion** (apikeys revoke trio :56–58, purge pair :97–101) — update pins in the same commit as the markup, preserving the idiom assertions (ask→confirm→cancel order, armed-branch shape).
2. **One data-a per markup occurrence** — converting card rows to `<tr>` rows keeps counts net-zero only if every button survives one-for-one. Verify with the pin; annotate any shift (D-12).
3. **Don't convert preference srows to tables** — toggles/select rows (workspace perms, appearance, datetime, notif toggles) are the srow idiom's rightful home. Only data-list surfaces (sessions, apikeys, projects lists, maybe push devices/tfa factors/members) get perm-t. Over-conversion is the #1 taste risk.
4. **105/108 pinned markup is frozen** — the restore source/probe/stat chip block (backup.js:692–730) carries byte-identical pins from 105-01/108-01; the refresh must not touch it.
5. **Esc discipline at every new table cell** — incl. title attributes and the When cells (T-79-10); the 109-VERIFICATION:68 note shows candRow's un-esc'd `ago()` was accepted as cosmetic — follow the esc'd variant anyway.
6. **Cross-page key reuse rejected** — 109's W4 lesson: don't borrow `page.backup.*` header words into `settings.*` tables (wrong namespace); budget 2–4 new keys per page, ×5 same commit.
7. **D-semantics survive the restyle**: sessions D-19 (no location column) / D-25 (last_seen fallback), apikeys inline-confirm + purge 2-click, projects read-only-vs-action split, D-90-14 honest-zeros in the deletion preview. Restyle the container, never the rules.
8. **Teardown**: settings/backup S.ui slots added for the restyle join existing teardown in the same commit (109 pitfall 5 carry-over).
9. **The restore-row header mismatch fix changes the merged table's semantics for BOTH row types** — backup rows render trigger/schedule; restore rows render initiator/—. Either align headers to a superset (Type/Run/Detail/Trigger-or-Initiator/Status/When/gutter) or per-type header variants — decide at discuss, don't improvise mid-execution.

## Assumptions Log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | Scope = visual unification only; zero server/API diff (all When fields verified present) | If members-When is demanded without a payload field → either drop the column or break the zero-server gate — owner ruling |
| A2 | Settings perm-t targets: sessions, apikeys, projects (active+archived); push devices / tfa factors / members are optional small conversions — owner picks the set at discuss-phase | Scope bloat if all six convert; pin churn grows with each |
| A3 | data-a/data-v stay 635/94 through backup; settings shifts are net-zero if conversions are one-for-one | Any drift → same-commit annotated bump (routine, D-12) |
| A4 | The backup refresh is min-width + restore-row-header alignment + optional deletions-panel — no rebuild | If owner wants the whole page re-audited visually, UAT rounds will surface more nitpicks (94-era precedent: 11 UAT rounds) |
| A5 | Flake stays option-1 (documented allowlist) — no test-runner restructuring in v3.9 | If the owner wants determinism, option 2 is a dedicated plan (package.json/CI touch) |
| A6 | Baseline stays exactly 2 documented failures through the milestone | Re-confirm baseline identity at each close (french-typography, webhook-routes GET list) |
| A7 | `settings.*` new keys stay ≤8; `page.backup/restore.*` ≤2 | W4-style overage → declare in SUMMARY with rationale (109 precedent: accepted at 5 vs ≤4) |

## Sources

- src/pages/backup.js (1–900, read in full) — anatomy, drift, pins impact
- src/pages/settings.js (1–873, read in full) — post-audit-removal anatomy, srow inventory
- src/pages/mappings.js + 109-01-PLAN.md / 109-VERIFICATION.md — the idiom recipe + checklist source (perm-t, 880, When, W4 key-budget precedent)
- .planning/research/GOVERNANCE-REFRESH.md — v3.8 methodology + design-language definition
- test/i18n-shell.test.mjs:332–351, test/i18n-core-features.test.mjs:161–171 — pins (635/94/64/86)
- test/settings-client.test.mjs, test/backup-history-client.test.mjs, test/backup-routes.test.mjs:470–590 — markup pins + flake test
- .planning/phases/110-docs-test-housekeeping/110-01-SUMMARY.md:66–68 + 110-VERIFICATION.md:31–41 — flake observations
- .planning/PROJECT.md (:7, :90), .planning/ROADMAP.md, .planning/STATE.md, .planning/seeds/*.md — residue scan
- Locale counts: programmatic grep of src/locales/en.json (page.backup 115 / page.restore 57 / settings 238)
