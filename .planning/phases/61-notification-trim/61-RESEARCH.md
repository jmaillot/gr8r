# Phase 61: Notification Trim - Research

**Researched:** 2026-11-13
**Domain:** Owner-ruled notification trims (dead pref-key removal, one-click suppression surface, render-only inbox burst coalescing) in a vanilla-JS + Express/SQLite app
**Confidence:** HIGH (all findings re-derived from current code this session; audit doc is owner-validated ground truth)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Audit is a fresh doc rebuilt from current code → `docs/notification-audit.md` — **DONE, exists, owner-validated 2026-11-13** (see <phase_requirements>)
- **D-02:** Rulings collected in-session before plan-phase — **DONE, D-05 gate CLEARED** (STATE.md:111, 128-132)
- **D-04 (validated):** Full removal of the 4 dead pref keys `mention_ws` / `assign_self` / `assign_status` / `assign_over` — both whitelists + defaults; Phase 37 `push_due` precedent (PUT rejects unknown key 400 accepted)
- **D-05 (validated):** Burst coalescing for comments + `update` + mention-bursts **AND reminders** (`due_reminder`/`past_due` — owner override of the "don't coalesce reminders" recommendation)
- **D-06 (validated):** `update` type stays ungated/undeleted — burst handled by NOTIF-03
- **D-07:** One-click apply writes **the owner's own prefs only**, via existing `user_notif_prefs` (Phase 34 mechanism); zero new tables, no workspace-level suppression
- **D-08:** Apply surface lives in the existing Settings › Notifications section (`src/pages/settings.js` notif-email/notif-push cases, :548-569)
- **D-09:** Only audit rows whose Status reads `validated` get an apply button
- **D-10:** Coalescing is **client-side at inbox render only** — server keeps one row per notification; Phase 59 D-14 (one push per row) untouched
- **D-11:** Grouping trigger = **same task + same type among unread notifications** (no time window); group collapses to one summary row, expandable to individual entries
- **D-12:** Inbox only — push and email untouched
- **D-13:** Summary row shows count by type + task key + title (e.g. « 5 nouveaux commentaires — WEBS-42 Fix login »), clickable to `/w/:slug/task/:key` drawer path, expandable

### the agent's Discretion
- Mechanics of the Settings apply button (source of the validated-rulings list; server defense-in-depth rejection permitted)
- Burst group rendering details (markup, expand/collapse interaction, i18n keys EN+FR) within D-13
- Whether marking a burst group read marks all entries read (natural reading; agent decides)
- Audit doc table wording / rerun-sync policy

### Deferred Ideas (OUT OF SCOPE)
- Workspace-wide notification class suppression (D-07 rejects)
- Digest overhaul beyond NOTIF-03 coalescing
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | Audit produces trim recommendations for owner ruling | **SATISFIED at context level.** `docs/notification-audit.md` exists (135 lines, rebuilt 2026-11-13, citations re-verified); D-04/D-05/D-06 rulings recorded in Status cells + mirrored to STATE.md. **Residual NOTIF-01 work for plans: NONE** — do not plan an audit-writing task. At most a trivial doc touch if code edits invalidate citations (update the doc's Status/source lines in the same commit that removes the keys). |
| NOTIF-02 | Owner applies a trim ruling from Settings in one click; lands in `notif_prefs` | Two of the three validated rulings are **not prefs toggles** (see Tension Resolution below). The only prefs-shaped validated rows are the push/email/keep rows — which are already live toggles. Plans must reconcile this (recommended split below). |
| NOTIF-03 | Rapid same-task notifications coalesce into a burst summary in the inbox | Render-only transform in `src/pages/inbox.js` `pageInbox()` between the sort/filter pipeline (lines 24-29) and the `ns.map(n => inboxItem(...))` render (line 40). All four validated burst classes handled. |
</phase_requirements>

## Summary

Phase 61 has three work items, and the audit already de-risked the largest one. **NOTIF-01 is done** — the doc exists with all rulings validated; plans should contain zero audit-writing tasks. **D-04** is a small, well-precedented code removal: delete 4 keys from two whitelists (`server.js:1580-1598` `NOTIF_PREF_KEYS`, `src/core/notifPrefs.js:41-48` `NOTIF_PREF_KEYS`) plus the one live default (`assign_self: true` at `server.js:1635` and `notifPrefs.js:35`). The server already whitelist-rejects unknown keys with `400 unknownPrefKey` (`server.js:4514-4517`), legacy rows are filtered at read (`getStoredNotifPrefs`, server.js:1638-1650), and the stored-blob filter on the client drops unknown keys (`sanitize`, notifPrefs.js:55-63) — so removal is safe end-to-end with no migration. **NOTIF-03** is a pure render-time grouping in `inbox.js` — the pipeline is sort → filter → `map(inboxItem)`, so a grouping function slots in cleanly; `notifications.js` (`pageNotifications`) is a separate page and D-12 says inbox only.

**Primary recommendation:** Resolve the D-07/D-09 tension by splitting NOTIF-02 into: (a) the D-04 key removal as plain code (already "applied" — no Settings button possible for a nonexistent key), (b) burst coalescing as render-only code with no Settings representation, and (c) **no new Settings apply buttons at all** unless a validated prefs-shaped trim row emerges — every `keep` row is already a live toggle. If a visible "trims applied" trace is desired, it belongs in the audit doc Status cells (already done), not in Settings.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dead-key removal (D-04) | Code (server + client whitelist) | — | Pure config-schema change; server PUT 400 is the guard |
| One-click suppression (NOTIF-02/D-07) | API/Backend (`user_notif_prefs` PUT) | Frontend (Settings toggles) | Existing Phase 34 mechanism; D-08 surface already renders prefs toggles |
| Burst coalescing (NOTIF-03/D-10) | Client render (`inbox.js`) | — | Render-only by ruling; server untouched, Phase 59 D-14 preserved |
| Audit doc (NOTIF-01/D-01) | Docs (`docs/notification-audit.md`) | — | Deliverable already produced |

## Standard Stack

No new packages. Everything uses existing in-repo infrastructure. **Installation: none.**

| Asset | Location | Purpose | Provenance |
|-------|----------|---------|-----------|
| `NOTIF_PREF_KEYS` (server) | server.js:1580-1598 | 17-key PUT whitelist; remove 4 keys | [VERIFIED: server.js:1580-1598 — quote: `'mention_ws', 'assign_self', 'assign_status', 'assign_over'` present in list] |
| `NOTIF_PREF_DEFAULTS` (server) | server.js:1623-1636 | 12-key default layer; `assign_self: true` at :1635 is the one default to remove | [VERIFIED: server.js:1623-1636] |
| `NOTIF_PREF_KEYS` / `NOTIF_PREF_DEFAULTS` (client) | src/core/notifPrefs.js:23-48 | Mirror whitelist (17 keys, :41-48) + defaults (12 keys, :23-36, `assign_self` at :35) | [VERIFIED: src/core/notifPrefs.js:23-48 — quote: `assign_self: true,` :35; `'mention_ws', 'assign_status', 'assign_over',` :45-47] |
| PUT guard | server.js:4514-4517 | `if (!NOTIF_PREF_KEYS.includes(key)) return fail(res, 400, 'unknownPrefKey', ...)` | [VERIFIED: server.js:4514-4517] |
| Stored-row read filter | server.js:1638-1650 `getStoredNotifPrefs` | Whitelist-filters legacy stored blobs at the single read point — removed keys in old rows vanish silently, no migration | [VERIFIED: server.js:1638-1650] |
| Client sanitize | src/core/notifPrefs.js:55-63 | Same whitelist filter on localStorage blobs | [VERIFIED: src/core/notifPrefs.js:55-63] |
| Inbox render pipeline | src/pages/inbox.js:24-40 | `myNotifs()` → sort desc → category filter → unread filter → `ns.map(n => inboxItem(...))` — grouping transform inserts after filters, before map | [VERIFIED: src/pages/inbox.js:24-40] |
| Row helpers | src/pages/inbox.js:47-97 (`notifText`, `notifIcon`, `inboxItem`) | Reused for individual rows inside an expanded group | [VERIFIED: src/pages/inbox.js:47-97] |
| Settings notif cases | src/pages/settings.js:548-569 (`notif-email`, `notif-push`) | D-08 surface; `srow(..., tog('email_mention', np.email_mention, 'np'))` is the existing one-click prefs pattern | [VERIFIED: src/pages/settings.js:548-556] |
| Task deep-link | `/w/:slug/task/:key` drawer path; `inbox.js` uses `data-a="openTask" data-id="${tk.id}"` (:107) | D-13 summary-row click target | [VERIFIED: src/pages/inbox.js:107] |
| i18n | `t()` / `has()` from `src/core/i18n.js`; gate `scripts/i18n-scan.mjs` | All new burst strings need EN+FR catalogue keys | [VERIFIED: inbox.js imports :5; i18n-scan runs clean: `0 literals, 0 pending...`] |
| Test runner | `node --test --test-concurrency=2 test/*.test.mjs` | Existing notif suites to extend/keep green | [VERIFIED: package.json test script] |

## Package Legitimacy Audit

No external packages installed this phase — N/A.

## Architecture Patterns

### System Architecture Diagram

```
Server (UNCHANGED by NOTIF-03; D-04 removes 4 whitelist keys)
  emission sites (actions.js client / server fan-out)
        │  one row per notification (unchanged)
        ▼
  user_notif_prefs rows ── PUT /whitelist(:4514) ── GET (stored-blob filter :1638)
        │
        ▼
Client store: myNotifs() (src/core/store.js)
        │
        ▼
pageInbox() (inbox.js:24-29)  sort → category filter → unread filter
        │
        ▼  [NEW] groupBursts(ns): same task + same type + unread (D-11)
        │      ├─ group of 1        → inboxItem(n) as today
        │      └─ group of N        → BurstSummaryRow (count + type + KEY + title, D-13)
        │                              ├─ collapsed: summary (click → task drawer)
        │                              └─ expanded: N × inboxItem / inline entries
        ▼
DOM render (existing render loop)
```

### Recommended change footprint
```
server.js                       # NOTIF_PREF_KEYS: −4 keys; NOTIF_PREF_DEFAULTS: −assign_self
src/core/notifPrefs.js          # mirror both lists; update header comment (lines 9-22)
src/pages/inbox.js              # groupBursts() + BurstSummaryRow + expand/collapse state
src/core/i18n catalogue         # burst keys EN+FR (e.g. notif.burst.summary)
test/notif-prefs.test.mjs       # update for removed keys + PUT 400 cases
test/ (new burst test)          # grouping logic unit test
docs/notification-audit.md      # citation freshness only, if line numbers shift
```

### Pattern 1: Render-time grouping (NOTIF-03)
**What:** Pure function `groupBursts(list)` returning a mixed array of single notifs and group descriptors; `pageInbox` maps over it.
**When to use:** After the existing sort/filter chain (inbox.js:24-29), before the `map(inboxItem)` at :40.
**Key semantics to lock in the plan:**
- Group key: `n.task + '|' + n.type` **among unread only** (D-11). Read notifications never group — even a read row of the same task/type stays standalone, and unread groups don't absorb read siblings.
- Group order: place the summary at the position of the newest member (list is already `b.at - a.at` sorted).
- The four validated classes per D-05: `comment`, `update`, `mention`, `due_reminder`, `past_due` — but the D-11 trigger (same task + same type) already implies per-type grouping; plans should implement the trigger generically over unread rows (any type), which subsumes all validated classes and needs no class allowlist.
- Expand/collapse state: `S.ui.inboxBurstOpen` (a Set of group keys or a single open-group key) — follows the existing `S.ui.inboxCat` / `S.ui.inboxSel` pattern (inbox.js:20, :30).
- Mark-group-read: agent's discretion (CONTEXT) — natural reading is one `toggleRead` action fanning to all member ids; keep it a single data-a handler reusing the existing per-row `toggleRead` action idiom (inbox.js:95).

### Pattern 2: Dead-key removal (D-04, Phase 37 push_due precedent)
**What:** Delete the 4 keys from both whitelists and the `assign_self` default; update the explanatory comments (server.js:1572-1579, notifPrefs.js:9-22) that currently document the legacy keys.
**Why safe:** legacy rows holding removed keys are dropped by the read-side filters on both tiers (server.js:1643-1650, notifPrefs.js:55-63); a PUT carrying a removed key gets `400 unknownPrefKey` (server.js:4517) — accepted per D-04. No migration, no data task.
**Caveat:** `assign_self` is the only dead key with a live default — removing it from `NOTIF_PREF_DEFAULTS` on both sides changes `mergeNotifPrefs`/`getLocalNotifPrefs` output for every user (the key simply disappears from prefs objects). Grep confirms no reader consumes it (audit row: "aucun lecteur"), but the plan must include a verification grep for `assign_self` after removal (should only hit the audit doc + git history).

### Anti-Patterns to Avoid
- **Adding a Settings "apply trim" button for D-04 or coalescing:** D-04 is a code change (a key that no longer exists cannot be toggled); coalescing is render-only with no pref (D-10, no server change). A prefs-based button per D-07/D-09 has **nothing valid to apply** — see Tension Resolution below.
- **Grouping read notifications or crossing tasks/types:** violates D-11 and would hide Phase 38's "inbox rows never suppressed" invariant from the user.
- **Server-side coalescing or digest changes:** D-10/D-12 forbid; Phase 38 digest suppression semantics and Phase 59 D-14 must pass unmodified (SC4).
- **Growing the entry chunk with burst logic:** Phase 56 chunk discipline — inbox.js is already page-scoped; keep new code inside it (verify `vite.config.js` chunk contract / `test/build-chunk-size.test.mjs` stays green).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prefs persistence | New storage/table | Existing `user_notif_prefs` + PUT (D-07) | Phase 34 mechanism, whitelisted, tested (test/notif-prefs.test.mjs) |
| Burst expand state | New state system | `S.ui.*` transient keys (inboxCat/inboxSel precedent) | Matches app's re-render-on-state pattern |
| Summary-row navigation | New routing | Existing `data-a="openTask"` / drawer path (inbox.js:107) | D-13 mandates the existing drawer path |
| i18n | Hardcoded strings | `t()` catalogue + i18n-scan gate | Standing EN+FR gate is enforced by CI script |

## Runtime State Inventory

Rename/refactor-adjacent (key removal) — required:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `user_notif_prefs` rows may contain `mention_ws`/`assign_self`/`assign_status`/`assign_over` — silently dropped by `getStoredNotifPrefs` filter (server.js:1643-1650) once keys leave the whitelist | **None** — code-only, no migration (verified read-filter behavior) |
| Live service config | None — no external service holds pref keys | None — verified (no such integration in repo) |
| OS-registered state | None | None — verified |
| Secrets/env vars | None — pref keys are not env/secrets | None |
| Build artifacts | None — keys are plain JS constants, no generated artifacts carry them | None — verified (no codegen over notifPrefs) |

## Common Pitfalls

### Pitfall 1: Forgetting the mirror-whitelist parity rule
**What goes wrong:** Removing a key server-side but not in `src/core/notifPrefs.js` (or vice versa) — client `sanitize` then strips keys the server accepts, or the client sends keys the server 400s.
**How to avoid:** The two lists must change in the same commit; add/keep a parity assertion in `test/notif-prefs.test.mjs` (Phase 34 tests already assert whitelist parity).
**Warning signs:** `unknownPrefKey` 400s in tests or console after a toggle.

### Pitfall 2: Grouping swallowing the unread badge / category counts
**What goes wrong:** `count(k)` at inbox.js:27 counts raw rows; if grouping changes `ns` before counts are computed, tab badges and the summary's "N" disagree.
**How to avoid:** Compute counts from the raw filtered list (current code already does — counts at :27 run pre-render); grouping happens after counts, only affecting the rendered list.

### Pitfall 3: Burst summary row breaks selection/preview
**What goes wrong:** `S.ui.inboxSel` expects a notif id; clicking a summary row that sets `inboxSel` to a non-id breaks `inboxPreview`.
**How to avoid:** Summary-row primary click navigates to the task drawer (D-13), it does NOT set `inboxSel`. Expand toggle is a separate affordance (chevron button), mirroring how inbox.js separates `selNotif` from `toggleRead` per-row actions.

### Pitfall 4: Legacy notif rows with stored English `n.text` fragments
**What goes wrong:** Group summaries rendering raw stored prose or losing the legacy-render branch (inbox.js:51-56).
**How to avoid:** Groups render a synthesized summary line (new i18n key), never `notifText()` of an arbitrary member; expanded members render through `inboxItem` unchanged, preserving legacy handling.

### Pitfall 5: i18n gate drift
**What goes wrong:** New burst strings not in EN+FR catalogue → `scripts/i18n-scan.mjs` fails the standing gate.
**How to avoid:** Add keys to both catalogues in the same commit; run `node scripts/i18n-scan.mjs` locally (currently: 0 literals, 0 pending — baseline clean). French example from D-13: « 5 nouveaux commentaires — WEBS-42 Fix login » is `t('notif.burst.comments', { n, key, title })` — note EN/FR plural handling (see `test/i18n-plural.test.mjs` for the plural convention).

## Code Examples

### Grouping transform skeleton
```js
// src/pages/inbox.js — render-only (D-10), insert after unread filter (:29)
function groupBursts(ns) {
  const out = [];
  const open = i => S.ui.inboxBurstOpen?.has?.(i); // Set of group keys
  let i = 0;
  while (i < ns.length) {
    const n = ns[i];
    const gk = n.task && !n.read ? n.task + '|' + n.type : null;
    if (!gk || ns[i + 1]?.task !== n.task || ns[i + 1]?.type !== n.type || ns[i + 1].read) {
      out.push(n); i++; continue;
    }
    const members = [n];
    let j = i + 1;
    while (j < ns.length && ns[j].task === n.task && ns[j].type === n.type && !ns[j].read) members.push(ns[j++]);
    out.push({ burst: true, gk, members, open: open(gk) });
    i = j;
  }
  return out;
}
```
*(Skeleton only — plans must adapt to the real sort order and add i18n/a11y; adjacency works because the list is already time-sorted.)*

### Summary row (D-13 shape)
```html
<div class="row" data-a="openTask" data-id="${tk.id}" role="button" tabindex="0">
  <button class="ibtn ibtn-xs" data-a="toggleBurst" data-gk="${gk}" aria-expanded="...">chevron</button>
  ${notifIcon(first)} <!-- avatar/icon of newest member -->
  <b>${t('notif.burst.' + type, { n: count })}</b> <span class="faint mono">${tk.key}</span> ${esc(tk.title)}
  <span class="muted">${ago(newest.at)}</span>
</div>
${open ? members.map(m => inboxItem(m, false)).join('') : ''}
```

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| Phase 39 audit rows all `proposed` | Audit v2 with 7 rows `validated` | 2026-11-13 | NOTIF-01 complete; plans code only validated items |
| Dead keys whitelisted for legacy round-trip | Full removal (D-04) | 2026-11-13 | Whitelist shrinks 17→13 keys server / 17→13 client; read-filters absorb legacy rows |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Implementing the D-11 trigger generically over all unread types (no class allowlist) satisfies D-05's validated class list | Pattern 1 | LOW — subsumes all validated classes; if owner wants only the 4 classes grouped, an allowlist filter is a small change |
| A2 | `S.ui` transient state (not persisted) is acceptable for expand/collapse | Pattern 1 | LOW — matches inboxCat/inboxSel precedent; collapse state resetting on navigation is standard app behavior |
| A3 | No Phase 38 invariant test file exists under a specific name — invariants live in `test/digest.test.mjs`, `test/due-reminders.test.mjs`, `test/notif-prefs.test.mjs`, `test/notif-hydration.test.mjs`; full suite (`npm test`) is the gate | Validation | LOW — SC4 says "pass unmodified"; running the full suite covers it |

## Open Questions

1. **Does the owner want ANY visible Settings representation of the trims?** (see Tension Resolution) — Recommendation: none; the audit doc Status cells are the record. If a trace is wanted, a passive "recently applied trims" info block in Settings › Notifications (read-only, no prefs write) is the only coherent option. **Planner should default to none** and flag at plan-review if desired.
2. **Expanded group: per-member `toggleRead` vs whole-group toggle** — agent's discretion per CONTEXT; recommend both (per-row buttons still work via `inboxItem`; group summary click navigates, chevron expands, and a "mark all read" affordance inside the expanded group if trivially cheap).

## Tension Resolution: D-07/D-09 vs what the owner actually ruled (REQUIRED reading for planner)

CONTEXT D-07/D-09 assume "validated trim rulings" are prefs-shaped (a class the owner turns off via `user_notif_prefs`). The actual validated rulings are **not**:

| Validated ruling | Nature | Settings apply button? |
|------------------|--------|------------------------|
| D-04: full removal ×4 dead keys | Code change (whitelist/default deletion) | **No** — a removed key cannot be toggled; the "apply" already happened by shipping the code |
| D-06: `update` left as-is | No-op ruling | **No** — nothing to apply |
| D-05: coalesce 4 burst classes | Render-only client code (D-10) | **No** — no pref key exists or may exist (zero server changes) |
| push_*/email_* keep rows | Already-live toggles | Already exist (`settings.js:548-569`) |

**Recommendation to planner:** NOTIF-02's "one-click apply" is satisfied by the **existing** per-type toggles being the owner's one-click suppression surface (D-08 surface + D-07 mechanism unchanged), plus the D-04 code removal. Plans should: (1) state this interpretation explicitly in PLAN.md, (2) add NO new Settings buttons, (3) keep the `user_notif_prefs` write path untouched (it already works and is tested). SC2 ("suppressed notification class lands in `notif_prefs`") is met by the existing toggles — e.g. `email_comment=false` or any push_* toggle — demonstrated by the Phase 34 tests.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node test runner | Validation | ✓ | `node --test` (package.json) | — |
| Playwright | e2e (only if burst e2e added) | ✓ | e2e/ dir + playwright-report present | unit tests suffice |
| i18n-scan | Standing gate | ✓ | scripts/i18n-scan.mjs (runs clean) | — |

No missing dependencies. No packages installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (`node --test --test-concurrency=2 test/*.test.mjs`) |
| Config file | none (convention: `test/*.test.mjs`) |
| Quick run command | `node --test test/notif-prefs.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | Audit doc exists + Status cells validated | doc assertion (optional smoke) | `test -s docs/notification-audit.md && grep -c validated docs/notification-audit.md` | n/a (doc) |
| NOTIF-02 | Removed keys: PUT with `mention_ws` → 400 `unknownPrefKey`; prefs objects no longer contain `assign_self`; GET drops legacy keys | unit (extend) | `node --test test/notif-prefs.test.mjs` | ✅ extend existing |
| NOTIF-03 | groupBursts: same task+type unread groups; read rows standalone; summary count/task/title correct; expand/collapse; mark-group-read fans out | unit (new) + optional e2e | `node --test test/inbox-burst.test.mjs` (new) | ❌ Wave 0 |
| SC4 | Phase 38 invariants + full suite green | full suite | `npm test` | ✅ existing (digest, due-reminders, notif-hydration) |

### Sampling Rate
- **Per task commit:** relevant single test file
- **Per wave merge:** `npm test` (+ i18n gate `node scripts/i18n-scan.mjs`, lint)
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/inbox-burst.test.mjs` — grouping logic (NOTIF-03). Note: `pageInbox` is DOM-string rendering; extract `groupBursts` as a pure exported function to keep it unit-testable without DOM.
- None else — existing notif suites cover prefs and invariants.

## Security Domain

`security_enforcement` not disabled in `.planning/config.json` → included.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Existing `NOTIF_PREF_KEYS` whitelist + boolean coercion on PUT (server.js:4514-4517); key removal shrinks the surface — keep the 400 path tested |
| V4 Access Control | yes (unchanged) | Prefs are strictly per-user (`workspace_id AND user_id` in getStoredNotifPrefs) — D-07 owner-prefs-only preserved; no workspace-level writes added |
| V2/V3/V6 | no | No auth/session/crypto changes this phase |

| Threat Pattern | STRIDE | Mitigation |
|----------------|--------|------------|
| Injecting unknown/arbitrary pref keys via PUT | Tampering | Whitelist reject 400 (existing; verify with new test for a removed key) |
| Tampered localStorage prefs blob | Tampering | Client `sanitize` whitelist filter (existing, notifPrefs.js:55-63) |
| XSS via task titles in burst summary | Tampering | `esc()` every interpolated title/key — same as existing inbox rows (inbox.js:54-55, :106, :109) |

## Sources

### Primary (HIGH confidence)
- `docs/notification-audit.md` — owner-validated audit v2 (2026-11-13), read in full this session
- `.planning/phases/61-notification-trim/61-CONTEXT.md` — D-01..D-13, read in full
- `server.js:1580-1650, 4514-4517` — whitelists, defaults, read filter, PUT guard (read)
- `src/core/notifPrefs.js:1-92` — client mirror + sanitize/merge (read)
- `src/pages/inbox.js:1-116`, `src/pages/notifications.js:1-48` — render pipelines (read)
- `src/pages/settings.js:548-569` — notif cases (read)
- `.planning/STATE.md:108-132` — ruling mirror (grep + read)
- `.planning/REQUIREMENTS.md:32-36, 92-94` — NOTIF-TRIM wording (grep)
- `package.json` test script; `test/` inventory; `scripts/i18n-scan.mjs` clean run; `vite.config.js` chunk contract comments — all probed this session

### Secondary (MEDIUM)
- None needed — codebase is the domain.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all assets read this session
- Architecture: HIGH — render pipeline and prefs machinery read line-by-line
- Pitfalls: HIGH — grounded in the actual code (counts-before-grouping, inboxSel semantics, legacy prose rows)

**Research date:** 2026-11-13
**Valid until:** 2026-12-13 (stable; audit citations may drift with unrelated edits — re-grep if server.js changes before execution)
