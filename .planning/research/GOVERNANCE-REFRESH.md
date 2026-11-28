# v3.8 Governance UI Refresh — Research

**Researched:** 2026-11-29 (post-v3.7-ship tree, tag v3.7; every anchor read this session)
**Scope:** R-9 carry-over (Governance page perm-t unification) · ROADMAP stale-anchor cleanup · webhook-events due.reminder flake re-triage
**Confidence:** HIGH — codebase-grounded (governance.js, mappings.js, webhook test, archives all read directly); zero ecosystem research needed (zero-dependency house SPA)

## Stack / Architecture Status

| Aspect | Status |
|---|---|
| Stack | Unchanged: zero-dep Node server + hand-rolled ES-module SPA. **Zero new dependencies, zero server changes, zero API changes** for the whole milestone. |
| Server | The refresh is presentation-only over three existing GET payloads (`/api/auth/operator/workspaces`, `/users`, `/instance-roles`). The flake fix is test-only (the `/api/internal/reminder-pass` route **already accepts a `now` body param**, server.js:6546). |
| Design language | Established by v3.7 Phase 107: `perm-t` table + `<div class="panel" style="overflow-x:auto">` wrapper + sblock sections (mappings.js:86–96, 188, 231–233). |
| i18n | `page.governance.*` = **80 keys, ×5 parity complete** (verified programmatically: 0 missing in de/es/fr/nl). New keys land ×5 same-commit (GD-7/D-12). |
| Pins today | verbs = **87** (test/i18n-core-features.test.mjs:171) · data-a = **637** (test/i18n-shell.test.mjs:349) · icons 185 · ROUTE_IDS 24 — all unchanged unless markup restructure moves a data-a occurrence. |

---

## Q1 — Governance page anatomy TODAY (line-verified, src/pages/governance.js, 471 lines)

The page has **two visual generations on one route**:

| Region | Anchor | Structure | Idiom compliance |
|---|---|---|---|
| Workspaces table | :104, wsRow :51–66 | `perm-t` min-width:880px, panel `overflow-x:auto` (:113), first th `padding-left:14px`, empty gutter th, When column (`ago(w.createdAt)` :62), badges :63 | ✅ **the idiom source** (v3.4-era, still current) |
| Super Admin tab (SA) | superRosterView :165–218 | `srow()` stacked cards in a plain `<div class="panel">` (:186) — **no table, no column headers, no overflow-x wrapper, no min-width**; candidates block :213–215 also srow | ❌ drifted — pre-perm-t card idiom |
| SA recent-activity trail | recentHtml :301–312 | bare `<div class="srow">` list, no panel wrapper, badge `<span class="badge">` bare | ❌ drifted |
| Backup/Restore tabs | roleTabView :239–292 | `perm-t` min-width:**760px** (:288) + panel `overflow-x:auto` (:291) — table present but **no When column** (granted date embedded as hint inside grantMeta :261–262); inline picker above table :284–286 | ⚠️ partial — right family, wrong details |
| Seg control | :139–145 | one seg, 3 tabs (`govSuperSeg`), state torn down :466–467 | ✅ |
| Esc discipline | — | every payload string through `esc()` (T-79-10); pickers draft in `S.ui.govRoleMod`, never the DOM | ✅ keep verbatim |
| Empty states | :186 roster, :287–290 roles | `empty()` three-tier | ✅ keep |
| Fullstates | :33–36 | 403/error fullstate, verbatim mappings.js:27–30 twins | ✅ keep |

**Render funnel:** pageGovernance :68–117 — workspaces sblock always; `superAdminsView()` :115 only for `isInstanceAdmin` (server ground truth D-112).

## Q2 — Concrete Super Admin vs Backup/Restore drift (the owner's complaint)

| Dimension | SA tab (:165–218) | Backup/Restore tabs (:239–292) | House idiom (v3.7) |
|---|---|---|---|
| Row markup | `srow(...)` card (settings.js helper) | `<tr>` in `perm-t` | `mapTr`-style `<tr>` (mappings.js:49) |
| Column headers | none | User / Grants / gutter | named th row, first `padding-left:14px`, last empty |
| Overflow panel | plain `.panel` (no overflow-x) | panel `overflow-x:auto` but min-width 760 | panel `overflow-x:auto` + min-width 880 |
| When/timestamp | `ago(u.last_login_at)` in srow arg, **no header** | granted date inside badge hint text, **no header** | dedicated faint When column |
| Badge style | bare `<span class="badge">` (owner/you) :172 | `roleBadge` green/default :237–238 | per-state badges (mappings.js:53–58) |
| Controls | inline-confirm stages in 3rd srow arg :174–180 | `revokeCtl` inline-confirm per grant :266–269 | gutter buttons + staged inline-confirm (D-90 trio) |
| Picker | search input + candidates **below** roster :182–216 | inline listbox picker **above** table :284–286 | one pattern per page (owner picks which survives) |
| Cap note | `superCapNote` always-visible :214 | — | `{shown}/{total}` cap-note idiom (reusable as-is) |

**Refresh scope = SA tab + recentHtml + roles-table detailing.** Backup/Restore are already tables; they need When-column + min-width/panel alignment, not a rebuild. Zero behavior change: D-90/D-118/D-119 (roster semantics), D-29..D-34 (roles), seg teardown — all preserved; every existing `data-a` id survives.

## Q3 — Seed `super-admin-console-role-first-listing.md`: ALREADY IMPLEMENTED

Shipped as v3.3 Phase 90-01 (D-90-1..6): roster-first (:169 filter `is_instance_admin`), promote-only candidates (:200), 2-char floor (:198), cap-10 + show-more (:211–214), post-promote reconcile (:193 comment). The seed file (`.planning/seeds/super-admin-console-role-first-listing.md`) is stale-unmarked — recommend marking "✅ implemented v3.3 (phase 90-01)" or moving to an archive dir. **Interaction with the refresh:** none functional — but its candidate-list markup is exactly the SA-tab surface being unified, so cite the seed as the semantics contract (roster = managing, search = adding; D-90-3) while the markup changes.

Other seeds checked: `backup-restore-operators.md` (implemented v3.3 roles) and `SEED-261119-f3w-domain-admission-rules.md` (implemented v3.0) — both also stale-unmarked; same one-line annotation treatment.

## Q4 — Reusable v3.7 helpers / pin impacts / server delta

**Directly reusable (copy verbatim):**
- `mapTr` table recipe incl. header row + gutter (mappings.js:49–67, 86)
- sblock + `panel overflow-x:auto` section wrapper (mappings.js:92–96, 188, 233)
- `empty()` three-tier per section (mappings.js:83–87)
- staged inline-confirm trio pattern (mapStage :64–66 ← govRoleRevoke — both already in governance.js)
- `{shown}/{total}` cap-note (superCapNote exists :214; usageCapNote mappings.js:231)
- `splitFirst` (mappings.js:176–179) — not needed here (no encoded actions on governance)

**Server delta: ZERO.** No route, no payload field, no err key needed. `restore_runs.created_by`-style extensions don't apply.

**i18n delta (small):** new governance-scoped keys only where headers appear — e.g. `colLastLogin` / `colGranted`-style When headers for the two new tables (~2–4 keys ×5). Reuse existing `page.governance.*` (80 keys) for everything else. If the candidates block becomes table rows, retire nothing (its keys stay in use); `i18n:scan` must show 0 stale.

**Pin impacts:**
- verbs 87: **unchanged** (no new api method — prefer zero api changes, satisfied).
- data-a 637: **at risk only if markup restructure moves an occurrence** (e.g. `operatorPromote` renders in the candidate rows :205; converting candidates to `<tr>` keeps one data-a per markup occurrence → count should stay 637, but verify with the pin and bump-with-annotation in the same commit if it shifts — D-12).
- icons 185: unchanged (`search`, `plus`, `users`, `history` all in baseline).
- ROUTE_IDS 24: unchanged.

## Q5 — ROADMAP stale-anchor inventory (exact, for the cleanup task)

The live `.planning/ROADMAP.md` is a clean 11-line shipped stub (v3.7 trimmed at close). The stale wording survives in **archives and research files** — the "verifier open note" is v3.6-MILESTONE-AUDIT.md:68 finding #5 plus 103-VERIFICATION.md:80 ("Recommend ROADMAP anchor cleanup in a low-cost pass"). The carried 103-02-SUMMARY.md:76 scope ruling explicitly deferred it.

| File:line | Stale text | Truth | Action |
|---|---|---|---|
| `.planning/milestones/v3.6-ROADMAP.md:81` | anchors `server.js:10826/:10842/:10857`, overwrite `:11004-11032`, instance `:11134-11168` | actual `:11045/:11213/:11338`; "overwrite/instance" were always **download / verify-checksum** (103-RESEARCH.md:41) | archive edit: bracketed correction note (don't rewrite history silently) |
| `.planning/milestones/v3.6-ROADMAP.md:82` | baseline "2672 tests" | 2767 at v3.6 audit; **2836 today** | bracketed correction |
| `.planning/milestones/v3.6-ROADMAP.md:17, 25, 33, 76, 80` | "×3 ladders" wording | research corrected to six-site scope (103-RESEARCH) | bracketed note or leave (×3 was the requirement text) |
| `.planning/milestones/v3.7-ROADMAP.md:20` | baseline "~2767 / 2–3 documented pre-existing failures" | shipped at **2836 / 2** (108-VERIFICATION.md:34) | bracketed correction |
| `.planning/milestones/v3.7-ROADMAP.md:44` | "**Plans: 1/2 plans executed**" | 2/2 executed (both ticked :47–48) | fix |
| `.planning/milestones/v3.7-ROADMAP.md:77, 90` | "Parallel-safe with 106/107" / "parallel wave with 106" | premise **corrected**: executed sequentially, shared i18n pin lines (PROJECT.md:29) | fix wording |
| `.planning/research/ARCHITECTURE.md:165` | "refactor the ×3 ladders into…" | historical research, refactor shipped in v3.6 P103 | optional annotate |
| `.planning/MILESTONES.md:24` | "2672 tests" | correct **for v3.5's gate** — historical, leave | none |
| `.planning/STATE.md` | still says "Current milestone: v3.6" / phase 103 metrics (:22, :29, :39–41) | v3.7 shipped; GSD refreshes at next milestone intake, cosmetic | leave or refresh header |

## Q6 — webhook-events due.reminder flake: mechanism + fix

**Test:** test/webhook-events.test.mjs:262–300 (part 3, :258).

**Mechanism (real-clock dependence, two failure windows):**
1. **08:00Z window gate.** The reminder funnel is a pure read *before* 08:00 member-local; emission opens AT-or-AFTER 08:00 (server.js:2790–2796, D-27-1 gate :2857–2862). The fixture workspace runs UTC, so the open-window instant is 08:00Z. The test sends `now: new Date().toISOString()` **live** (:287) — any suite run **before 08:00 UTC** claims zero rows → `rows.length === 1` fails at :294. Runs after 08:00Z pass.
2. **Midnight straddle.** `today` is computed at :269 from the live clock; the trigger pass recomputes `new Date()` at :287. A suite straddling 00:00 UTC turns the due task into past-due mid-test → the second pass (:297) can claim a new row → `after.length === 1` fails at :299.

**Why the fix is trivial — the injection seam already exists:** `/api/internal/reminder-pass` accepts `body.now` (server.js:6546 → `runReminderPass({ now })`); server.js:2822 documents this design: "so tests drive 08:00-local instants without sleeping or fake timers." The test simply doesn't use it deterministically.

**Recommended stabilization (test-only, ~3 lines):** compute the instant once —
```js
const nowIso = `${today}T08:05:00Z`; // open-window instant, deterministic
// triggerPass body: JSON.stringify({ now: nowIso })
```
Both passes (first claim + replay :292/:297) send the same fixed instant; window is deterministically open; no straddle possible; no fake timers, no retry wrapper needed. **Zero server change.** (Optional belt-and-braces: assert the route's `{emitted}` count in the response.)

**Baseline after:** the documented pre-existing failures drop to exactly **2** (french-typography content, webhook-routes GET list) — the flake leaves the baseline entirely; PROJECT.md:12–13 wording updated in the same commit.

## Q7 — Other open items worth flagging for v3.8 scoping

- **Seeds hygiene:** all three seeds in `.planning/seeds/` are implemented-but-unmarked (Q3) — a 3-line housekeeping item, fits the ROADMAP-cleanup phase.
- **STATE.md drift** (Q5 table) — refreshed automatically at milestone intake; optional manual touch-up.
- **No other drafts/gaps found:** FEATURES/REQUIREMENTS carry no open v3.7 leftovers; 108-VERIFICATION.md:59–63 notes are UAT-level eyeball items (badge third state on real hardware) — worth one line in v3.8 UAT, not a phase.
- **Lint:** standing baseline at its pre-existing count; this milestone's markup edits shouldn't move it.

---

## Pitfalls (refresh-specific)

1. **data-a pin drift is the #1 mechanical risk** — converting srow cards to `<tr>` rows moves markup occurrences (operatorPromote :205, revoke controls). One data-a per markup occurrence, same-commit pin bump with annotated comment (D-12 convention, see i18n-shell.test.mjs:349 annotation style).
2. **Don't weaken the SA-tab semantics while restyling** — roster-first is "the seed's non-negotiable core" (governance.js:124 comment); candidates are promote-only (:190–194); the 2-char floor and always-visible cap-note are D-90-3/D-90-4 owner rulings. Restyle the container, never the rules.
3. **Picker duplication** — if both the SA tab and roles tabs end up with the same searchable picker, extract one shared helper (govPickerInput/govPickerList :342–354 already exist and are shared); do not fork a second picker implementation.
4. **Esc discipline at every new sink** — table cells, `title` attributes, value attributes (T-79-10/T-102-04). The staged inline-confirm repaint re-renders through the same template — keep it that way (the Pitfall-2 lesson from PITFALLS.md).
5. **Teardown must shed any new state** — govOrphanTeardown (:448–468) already clears govSuperSeg/govSuperShown/govRoleMod/govRoleDup/govRoleRevoke; any new S.ui slot added for the restyle joins the teardown in the same commit.
6. **Flake fix: don't reach for fake timers or retries** — the injection seam exists (server.js:6546); adding vi.mock-style clock faking or `retry:` would violate the house test doctrine (deterministic instants, no sleeps — server.js:2822 comment).
7. **Archive edits: annotate, don't rewrite history** — shipped ROADMAPs are audit records; bracketed `[correction v3.8: …]` notes preserve the audit trail while killing the misleading text.

## Assumptions Log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | The refresh keeps the 3-tab seg structure (no re-architecture) — owner note asks for visual unification only | Scope question — confirm at discuss-phase |
| A2 | "When" columns: SA roster = last_login_at, roles = grantedAt — owner may prefer created-at or one column only | Trivial swap, new key wording |
| A3 | Candidate-list → table conversion is in scope (it's the biggest remaining srow block) | If out of scope, data-a pin unchanged and SA tab stays partially card-based — owner ruling |
| A4 | due.reminder fix: `today` is derived once and both passes share one instant; reminder dedup keyed per date means the replay pass claims nothing new — verified by reading the window/claim comments (server.js:2857–2892), not by running the suite | Run the test file at a pre-08:00Z clock (or with a forced `now`) to prove red→green |
| A5 | data-a count stays 637 through the restyle | If it shifts, same-commit annotated bump (routine) |
| A6 | No fr-typography or webhook-routes baseline change in this milestone | Re-confirm baseline identity at each close |

## Sources

- src/pages/governance.js (1–471, read in full) — anatomy, drift, teardown, picker, modal idiom
- src/pages/mappings.js (1–299, read in full) — the v3.7 design language reference (perm-t, sblock, cap-note, splitFirst)
- .planning/phases/107-…/107-RESEARCH.md — the idiom spec + pin conventions
- test/webhook-events.test.mjs (240–300) — flake test; server.js (2784–2892, 6541–6548) — window gate + `now` injection seam
- .planning/milestones/v3.6-ROADMAP.md (:17, 25, 33, 76–82), v3.7-ROADMAP.md (:20, 44, 77, 90), v3.6-MILESTONE-AUDIT.md (:68), 103-VERIFICATION.md (:80), 103-02-SUMMARY.md (:76), 103-RESEARCH.md (:41) — stale-anchor inventory
- .planning/seeds/*.md (all three read) — implemented-status check
- Locale parity + pin counts: programmatic check (80 governance keys ×5, 0 missing); test/i18n-core-features.test.mjs:171 (verbs 87); test/i18n-shell.test.mjs:349 (data-a 637)
- PROJECT.md (:7–29) — v3.7 shipped record, corrected parallel-safe premise, test baseline
