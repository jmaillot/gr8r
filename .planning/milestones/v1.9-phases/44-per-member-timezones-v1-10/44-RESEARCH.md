# Phase 44: Per-Member Timezones - Research

**Researched:** 2026-11-06
**Domain:** Server scheduler timezone resolution (`Intl.DateTimeFormat`-based), member-profile settings UI (plain-ES-modules frontend), zero-dependency Node 24 app
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Picker is a searchable combobox over the full IANA zone list, replacing the 5-label `<select>` in `settings.js` case `datetime` (line 285). Reversible UI swap.
- **D-02:** Each option displays IANA id + city label + live UTC offset computed at render via `Intl.DateTimeFormat` (DST-safe; never static offset labels).
- **D-03:** Zone list is a bundled static JS array of IANA ids + display names — no `Intl.supportedValuesOf` runtime enumeration, no dependency. Offsets computed live.
- **D-04:** Combobox preselects the browser-detected zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`); nothing auto-saves; invalid browser zone → Paris per D-07.
- **D-05:** Legacy `(GMT±xx) City` labels resolve-on-read (no migration writes) — e.g. `(GMT+01:00) Berlin` → `Europe/Berlin`; picker stops offering them. Alias map is additive; stored labels never change.
- **D-06:** All legacy-label mapping + IANA validation + Paris fallback lives in a **single resolve funnel**, used by every tz resolution site.
- **D-07:** Fallback is **`Europe/Paris` for every member without a valid tz** (empty, unknown, unresolvable) — deliberately replaces the UTC fallback. Pinned by test (empty → Paris, unknown → Paris).
- **D-08:** The full legacy map (5 labels → IANA) plus D-07 edges pinned by tests.
- **D-09:** **No workspace-level timezone concept** — `workspaceTzLabel()` and the first-membership lookup deleted; every scheduler resolution is per-member. Picker lives in the existing member-profile Settings > Date & time (`settings.js` case `datetime`).
- **D-10:** Server validates tz at save time (reject or coerce-to-Paris at planner discretion). Valid IANA names only — never arbitrary strings stored.
- **D-11:** Claims stay keyed on (user, localDate-of-emission-time). Changing tz never re-fires an already-claimed reminder for the same localDate; a different localDate yields exactly one new legitimate claim ("re-window allowed"). No new ledger state, no claim reset.
- **D-12:** Dedup semantics documented (D-notation comment at the claim key definition) and pinned by edge tests: (a) fired in Paris, switch to Tokyo, same localDate → no refire; (b) different localDate → exactly one new claim.
- **D-13:** No `reminders_sent` housekeeping — date-scoped keys make stale rows inert.
- **D-14:** Per-member refactor shape (per-recipient window predicate + `localParts` call inside the loops) is left to research/planning — only the semantics are locked.

### the agent's Discretion
- Exact combobox component structure (markup, keyboard handling, list rendering) within D-01's behavior.
- Reject-vs-coerce choice in D-10 save validation.
- Exact resolve-funnel naming/signature and call-site placement.
- Exact refactor shape of the scheduler loops.
- Whether zone display names get i18n treatment (EN+FR catalogue rules apply to any new user-facing string; `npm run i18n:scan` must stay green).

### Deferred Ideas (OUT OF SCOPE)
- Retention/cleanup sweep for `reminders_sent` rows.
- Workspace-level default timezone inherited by new members.
- DST-shift edge display warnings.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TZ-01 | Per-member timezone resolution for reminders/digest, Paris default, IANA picker, legacy label handling, dedup-preserved | All sections below; especially Architecture Patterns (resolve funnel, per-member predicate refactor, save path) and the Critical Finding on the save path |
</phase_requirements>

## Summary

The phase replaces the workspace-shared timezone model (`TZ_BY_LABEL` five labels → `localParts()` → `workspaceTzLabel()` first-membership lookup) with per-member resolution. The mechanics are well-trodden: `localParts(tz, date)` already resolves arbitrary IANA zone ids through `Intl.DateTimeFormat` — only the label→zone step becomes the new resolve funnel (D-05/06/07), and the workspace-level `localDate`/`hour` computed once per pass (~server.js:1442) becomes per-recipient inside the reminder and digest loops.

**The single most important research finding is a pre-existing save-path disconnect:** the Settings page writes `tz` into `S.prefs` (blob top-level `prefs.tz`), while the scheduler reads `doc.data.members[*].tz`, which only `memberProfile()` seeds (as `''`) — the client pref flow **never writes** it. Today, changing the tz select in Settings has **no effect on the scheduler for any member**. Additionally, `docFromClient()` (server.js:1699-1700) replaces `next.data.members` wholesale with stored members for non-admin roles, so even a client that wrote `members[me].tz` would be silently dropped for regular members. The planner must pick and design a save path that actually lands the value in the doc member profile (or equivalent server-authoritative store) — options analyzed below.

Existing Phase 27/37/38 tests use the legacy label `'(GMT+00:00) London'` as their fixture tz; the D-05 alias map makes those resolve to `Europe/London` (UTC in winter), so the clock math and the majority of tests survive **unmodified**. One test (due-reminders.test.mjs:380-382) pins "empty tz → UTC fallback" and **must be deliberately re-pinned to Paris** (D-07) with rationale. One more stored label exists that is NOT in `TZ_BY_LABEL`: `DEFAULT_PREFS.tz = '(GMT-07:00) Pacific Time'` (src/core/store.js:17) — the alias map should cover it too (→ `America/Los_Angeles`), else it degrades to Paris.

**Primary recommendation:** build one `resolveTz(value)` funnel (legacy map + IANA validation via `Intl.DateTimeFormat` construction + `Europe/Paris` fallback), refactor both scheduler loops to compute `(localDate, hour)` per assignee/recipient from that funnel, fix the save path so a member's own tz reaches the stored doc through a server-validated write, and ship the combobox over a static canonical zone list with live-offset labels.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tz resolution (legacy map + IANA validation + Paris fallback) | API/Backend (server.js funnel) | — | The scheduler runs server-side; resolution must be the server's single choke point |
| Per-recipient window predicate (localDate/hour per member) | API/Backend (runReminderPass) | — | The scheduler loops own emission timing |
| Tz save + server-side validation (D-10) | API/Backend (doc PUT / dedicated route) | — | "Server validates tz at save time" is locked; client validation is advisory only |
| IANA zone picker (searchable combobox) | Browser/Client (settings.js + actions.js) | — | Pure UI; preselect from `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| Zone list + live offset/city labels | Browser/Client (static module + `Intl`) | — | D-03 static list; D-02 live offsets at render |
| Exactly-once ledger (`reminders_sent`) | Database/Storage (SQLite) | — | Key shape unchanged (D-11); no schema change |

## Critical Finding: The tz Save Path Is Disconnected (must be addressed in the plan)

**Verified this session by reading the source:**

1. The settings select writes through `IN.prefSel` (src/actions/actions.js:2727-2733): `S.prefs['tz'] = value; save()`.
2. `S.prefs` is the **blob-level prefs object** — `docSnapshot()` returns `{ data: S.data, prefs: S.prefs, views, collapsed }` (src/core/store.js:122-125), and `save()`/`push()` PUT that whole snapshot to `PUT /api/workspaces/:slug`.
3. The server's `mergeClientDoc()` (server.js:1033+) never touches top-level `prefs`, so `doc.prefs.tz` is what gets stored.
4. The scheduler instead reads `doc.data.members[*].tz` (`workspaceTzLabel()`, server.js:1405-1410), which only `memberProfile()` seeds — always `''` (server.js:2668).
5. Even if a client wrote `members[me].tz`: `docFromClient()` (server.js:1692-1719) replaces `next.data.members` with `storedMembers` for any role below admin, silently discarding the change. For admins, incoming members keep only `id/userId/email/role/status` pinned — `tz` would survive for admins only.

**Consequence:** the plan must include a real save-path task. Options (planner picks; D-10 requires server validation either way):

| Option | Shape | Tradeoffs |
|--------|-------|-----------|
| **A. Self-tz exception in `mergeClientDoc`** | Allow the PUT's member array to update **only** the current membership's `tz` field (compare `membership.member_id`), through the resolve funnel as the validator (coerce-to-Paris per D-10, or reject). Mirrors the "access fields belong to membership" precedent. | Minimal route surface; touches a sensitive merge path — needs a targeted regression test (member A cannot write member B's tz; non-admin CAN write own tz). |
| **B. Dedicated route** e.g. `PUT /api/me/timezone` | Small authenticated route writing `storedDoc.data.members[membership.member_id].tz` inside a transaction, funnel-validated. | Cleanest validation story and one documented choke point (matches D-06 spirit); but adds a route + a client `api` method + a non-`prefSel` save handler, diverging from "the member-profile update the page already uses" (CONTEXT integration point). |

Note: a third "keep blob `prefs.tz` and have the scheduler read it" is **incompatible with D-09** (per-member semantics — `prefs` is one shared object in a multi-member doc) and is not recommended.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Intl.DateTimeFormat` | Node built-in (Node 24, full ICU) [VERIFIED: node --version → v24.21.0; used by existing `localParts` server.js:1386-1399] | Local date/hour per zone; live offset labels | Already the project's only tz mechanism; zero dependencies |
| `Intl.DateTimeFormat(...).resolvedOptions().timeZone` | Browser/Node built-in [VERIFIED: standard Intl; project targets modern browsers] | Browser-zone preselect (D-04) | The only reliable browser tz detection |
| `Intl.DisplayNames` (optional, discretion) | Browser built-in [ASSUMED — verify `type:'timeZone'` support in target browsers before relying on it] | Localized city/country labels | Avoids adding ~400 catalogue strings; falls back cleanly |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `scripts/` build-time generation (Node ESM) | project convention | Generate the static canonical zone list module (D-03) — Node 24 has `Intl.supportedValuesOf('timeZone')` available at build time; runtime enumeration in the *client* stays banned per D-03 | Once, committed as a static `src/**/timezones.js` (or similar) array |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static bundled zone list (D-03, locked) | `Intl.supportedValuesOf('timeZone')` at runtime | Locked out by D-03; static list + live offsets never goes stale on DST |
| `Intl.DisplayNames` city labels | Raw IANA city segment (`Europe/Paris` → `Paris`) | DisplayNames support for `type:'timeZone'` is recent [ASSUMED]; raw segment is deterministic and needs zero i18n catalogue entries — zone ids are not catalogue strings, keeping `i18n:scan` green trivially |
| Reject on invalid save (D-10) | Coerce-to-Paris | Reject gives honest UX but needs a new error string + catalogue EN/FR entries; coerce is silent. Both are locked-allowed; planner picks |

**Installation:** none — zero runtime dependencies is a standing project invariant; this phase adds none.

**Version verification:** N/A — no new packages. Package Legitimacy Audit: no packages to audit (built-ins only).

## Architecture Patterns

### System Architecture Diagram

```
Browser (Settings > Date & time)
  │  combobox: static zone list (D-03) + live offsets (D-02)
  │  preselect = resolvedOptions().timeZone (D-04)
  ▼
save action ──► PUT /api/workspaces/:slug (doc PUT) or dedicated route
  │                      │
  │                      ▼
  │        Server save-time validation (D-10): resolveTz funnel
  │        legacy label → IANA → valid? keep : Europe/Paris
  ▼                      ▼
doc.data.members[me].tz (stored, no migration of old values — D-05)
                         │
                         ▼
runReminderPass (per-minute interval + boot catch-up, injectable clock)
  │
  ├─ reminder loop (per task): assignee tz → resolveTz → localParts(zone, at)
  │     → hour >= 8 gate (per assignee) → string-compare localDate >= due
  │     → claim `${ws.id}:${t.id}:${t.assignee}:${offset}:${due}` (unchanged)
  │
  └─ digest loop (per recipient, memberships⋈users): r.member_id → doc member tz
        → resolveTz → localParts → hour >= 8 gate (per recipient)
        → claim `${ws.id}:${r.user_id}:digest:${localDate}` (unchanged shape,
          localDate now per-recipient)
```

### Recommended Project Structure
```
server.js                      # resolveTz funnel + TZ_BY_LABEL alias map (replaces
                               #   workspaceTzLabel); runReminderPass per-member refactor
src/lib/timezones.js (name at  # static canonical IANA list (D-03) — generated or hand-
  planner discretion)          #   curated commit; consumed by settings combobox
src/pages/settings.js          # case 'datetime': combobox replaces sel('tz', …)
src/actions/actions.js         # save handler for the combobox (replaces/extends IN.prefSel
                               #   'tz' path)
scripts/gen-timezones.mjs      # (optional, discretion) build-time zone-list generator
test/tz-resolve.test.mjs       # D-08 legacy map pins + D-07 fallback edges
test/tz-dedup.test.mjs         # D-12 dedup-under-tz-change edge tests
test/due-reminders.test.mjs    # re-pin empty-tz→UTC test to Paris (line ~380)
```

### Pattern 1: The Single Resolve Funnel (D-05/06/07/08)

**What:** one function owning legacy mapping, IANA validation, and Paris fallback. IANA validation without dependencies: constructing a formatter with a bad zone throws `RangeError`; catch and fall back.

```javascript
// server.js — shape is at planner discretion (D-06 semantics locked, not the signature)
const TZ_BY_LABEL = {
  // The 5 stored labels [VERIFIED: server.js:1378-1384, read this session]:
  '(GMT-08:00) Pacific Time': 'America/Los_Angeles',
  '(GMT-05:00) Eastern Time': 'America/New_York',
  '(GMT+00:00) London': 'Europe/London',
  '(GMT+01:00) Berlin': 'Europe/Berlin',
  '(GMT+08:00) Singapore': 'Asia/Singapore',
  // NOT currently in TZ_BY_LABEL but present as the client default
  // [VERIFIED: src/core/store.js:17]: '(GMT-07:00) Pacific Time'
  '(GMT-07:00) Pacific Time': 'America/Los_Angeles',
};

function resolveTz(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (TZ_BY_LABEL[v]) return TZ_BY_LABEL[v];            // D-05 legacy map
  if (v) {
    try { new Intl.DateTimeFormat('en-CA', { timeZone: v }); return v; } // valid IANA (incl. aliases)
    catch { /* fall through */ }
  }
  return 'Europe/Paris';                                 // D-07 deterministic fallback
}
```

**When to use:** every tz resolution site — scheduler loops, save-time validation (D-10). Never a second mapping inline.

### Pattern 2: Per-Recipient Window Predicate (D-14 refactor shape)

Currently one `(localDate, hour)` per workspace (server.js:1440-1442). The refactor:

- **Reminder loop (per task):** resolve the **assignee's** tz (doc member by `t.assignee`; doc-only members have no membership row — look them up in `doc.data.members` by id, falling back to the funnel). Compute `(localDate, hour)` per task; gate `hour >= 8` per task. The string compares (`localDate >= due`, `localDate > due`) and the claim key (which contains `due`, not localDate) are untouched.
- **Digest loop (per recipient):** the loop iterates `memberships⋈users` rows carrying `r.member_id` (server.js:1551-1553) — resolve tz from the doc member profile via `r.member_id`. Compute `(localDate, hour)` per recipient; gate `hour >= 8` per recipient. The claim key `${ws.id}:${r.user_id}:digest:${localDate}` keeps its shape; `localDate` is simply per-recipient now.
- Delete `workspaceTzLabel()` and the workspace-level computation; update the D-27-1/A1 comment block (server.js:1360-1377) to describe per-member semantics.

### Pattern 3: Combobox in the Plain-ES-Modules Frontend

Markup contract used by every settings control: `data-a` action + `data-k`/`data-v` dataset or `data-in` input hook (see `sel()` at settings.js:85 and `IN.prefSel` at actions.js:2727). The combobox follows the same discipline: an input + filtered list, keyboard (arrows/enter/escape), selected value stored as the IANA id, and Phase 43's wiring-regression pattern (`A.<action>` namespaces, every `data-a` pinned by test — STATE.md 43-03) applies to the new action.

### Anti-Patterns to Avoid
- **Reading `doc.prefs.tz` in the scheduler:** blob prefs is a shared per-workspace object (multi-member docs), not per-member — incompatible with D-09.
- **Migrating stored labels:** D-05 forbids rewrite churn; resolve on read only.
- **Caching offsets or formatter output per zone across ticks:** DST is real (the existing tests exercise a PDT winter/summer transition at due-reminders.test.mjs:372-377); compute per pass from the injected `now`.
- **A second tz mapping anywhere else in the codebase** — the funnel is the only choke point (D-06; mirrors the `hiddenFor`/`memberCanReadProject` one-pipeline discipline).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Local date/hour in a zone | Manual UTC-offset arithmetic | Existing `localParts()` (server.js:1386) pointed at the funnel's zone | DST-fragile by hand; already battle-tested by Phase 27/37/38 fixtures |
| IANA zone validation | Regex / hardcoded allowlist of ~400 names | `try { new Intl.DateTimeFormat('en-CA', { timeZone: v }) }` — throws `RangeError` on invalid | Node/browser ICU is the authority; supports aliases consistently |
| DST-safe local YYYY-MM-DD | `Date` local-midnight math | Existing pure string compare + `Date.UTC` helper pattern (server.js:1401-1403 comment) | The codebase explicitly documents local-midnight math as DST-fragile |
| Browser tz detection | `getTimezoneOffset()` heuristics | `Intl.DateTimeFormat().resolvedOptions().timeZone` (D-04) | Offset only gives minutes, not the zone id |

**Key insight:** every tz primitive this phase needs already exists as a built-in or in-repo helper; the work is funnel consolidation + loop refactor + UI, not tz math.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `doc.prefs.tz` values in existing workspace docs (the 5 legacy labels + client default `'(GMT-07:00) Pacific Time'`) [VERIFIED: src/core/store.js:17, server.js:1378-1384] | Resolve-on-read via funnel (D-05) — no migration writes |
| Stored data | `doc.data.members[*].tz` seeded `''` by `memberProfile()` [VERIFIED: server.js:2668] | Paris fallback on read (D-07); no writes |
| Live service config | None — verified by grep: no external service carries tz strings | none |
| OS-registered state | None — scheduler is in-process `setInterval` + boot catch-up (no cron/systemd) [VERIFIED: STATE.md "Zero-dependency scheduling"] | none |
| Secrets/env vars | None — tz is not secret-bearing | none |
| Build artifacts | None — no compiled/built artifact carries tz labels | none |

## Common Pitfalls

### Pitfall 1: The save-path write-block for non-admins (CRITICAL — discovered this session)
**What goes wrong:** the combobox saves through the doc PUT, but `docFromClient()` (server.js:1699-1700) replaces `members` with stored members for non-admins — the tz value silently reverts for regular members; and today the pref flow never writes `members[*].tz` at all.
**Why it happens:** the settings page writes `S.prefs.tz` (blob prefs), the scheduler reads `doc.data.members[*].tz` — two disconnected stores.
**How to avoid:** a dedicated plan task for the save path (Option A self-tz exception or Option B dedicated route — see Critical Finding), with a regression test proving a non-admin member's own tz persists AND cannot write another member's tz.
**Warning signs:** integration test where a member-role client sets a tz, re-GETs the workspace, and sees the old value.

### Pitfall 2: The `hour === 24` midnight edge
**What goes wrong:** `hour12:false` formatting yields `"24"` at midnight in some ICU versions; `Number('24')` breaks a `hour >= 8` gate in the wrong direction? No — 24 ≥ 8 passes, but it also breaks future hour-equality logic if reused.
**How to avoid:** keep the existing `Number(get('hour')) % 24` (server.js:1398) — `localParts` already handles it; do not duplicate its logic.
**Warning signs:** any new formatter construction that skips the `% 24`.

### Pitfall 3: Per-workspace state leaking across members (existing RESEARCH Pitfall 6, still applies)
**What goes wrong:** hoisting `localDate` out of the loops to "save" formatter construction makes every member share the first member's date.
**How to avoid:** compute `(localDate, hour)` inside each loop iteration; if perf matters, cache the **formatter per zone id** (not the result) in a module-level Map.
**Warning signs:** a test where two members with different tzs fire at different ticks in the same pass.

### Pitfall 4: Existing tests pin the UTC fallback
**What goes wrong:** due-reminders.test.mjs:380-382 asserts "empty tz label falls back to UTC" — D-07 changes this to Paris.
**How to avoid:** deliberately re-pin with rationale (SC-5 allows this); the Paris fallback at UTC-equivalent winter instants shifts the window by +1h — the re-pinned fixture should inject `2026-01-15T07:00:00Z` (08:00 Paris CET in winter) instead of `at8()` (08:00 UTC).
**Warning signs:** suite red on the fallback test after the funnel lands.

### Pitfall 5: Fixture labels rely on legacy resolution
**What goes wrong:** all existing fixtures set `tz: '(GMT+00:00) London'` (and `(GMT-08:00) Pacific Time`); deleting `TZ_BY_LABEL` outright would turn them into Paris.
**How to avoid:** keep the alias map (D-05 guarantees it) — then fixtures resolve identically and tests pass unmodified. Note the digest tests use fixed winter dates where `Europe/London` = UTC, so clock math holds.
**Warning signs:** digest/due-reminder tests failing en masse would mean the funnel dropped a legacy mapping.

### Pitfall 6: i18n scan gate
**What goes wrong:** any new user-facing string (combobox placeholder, aria labels, save-failure toast if reject-on-invalid chosen) not in both `src/locales/en.json` and `fr.json` fails `npm run i18n:scan` (also wired into `prebuild`).
**How to avoid:** catalogue all new strings EN+FR; prefer non-catalogue sources where legitimate (IANA ids, `Intl`-derived labels, offsets are machine values, not catalogue strings).
**Warning signs:** `prebuild` failing.

### Pitfall 7: Combobox option injection
**What goes wrong:** city labels derived from zone ids are inserted into HTML strings (`sel()`-style interpolation) — a hostile stored tz (rejected at save, but also rendered elsewhere, e.g. the members table shows `tz: '—'` at actions.js:1754) could carry markup.
**How to avoid:** escape every interpolated label with the existing `esc()` helper (core/utils.js); server-side funnel validation is the primary defence, client `esc()` is the habit.
**Warning signs:** a stored value containing `<` or `"` rendering unescaped anywhere.

### Pitfall 8: `reminders_sent` semantics must not drift (D-11/D-12)
**What goes wrong:** "fixing" the ledger to reset claims on tz change, or keying digest claims on the workspace tz, breaks the exactly-once contract pinned by Phase 27/37/38 tests.
**How to avoid:** claims stay as-is; only the localDate input becomes per-member. Ship the D-notation comment at the claim-key definition and the two edge tests (same-localDate-no-refire across tz change; different-localDate-exactly-one-new-claim).

## Code Examples

### Digest-loop per-recipient resolution (sketch)
```javascript
// server.js — illustrative; planner owns final shape (D-14)
if (hourGate /* per-recipient below */) ...
for (const r of db.prepare('select m.member_id, m.user_id, u.email, u.locale from memberships m join users u on u.id = m.user_id where m.workspace_id = ?').all(ws.id)) {
  const tz = resolveTz(docMemberTz(doc, r.member_id));   // doc.data.members find by id
  const { date: localDate, hour } = localParts(tz, at);  // per-recipient, never cached across iterations
  if (hour < 8) continue;                                // window not open in THIS member's zone
  // … existing opt-in gate, task filtering, claim (key shape unchanged) …
}
```

### Save-time validation (D-10, either option)
```javascript
const tz = resolveTz(incomingTz);          // coerce-to-Paris variant: never stores garbage
if (tz === 'Europe/Paris' && incomingTz && incomingTz.trim() !== 'Europe/Paris' && !TZ_BY_LABEL[incomingTz.trim()]) {
  // reject variant: 400 'invalidTimezone' — needs catalogue EN/FR entries
}
```

### Live offset label (D-02)
```javascript
// Browser — computed at render, never stored
const offsetLabel = zone => new Intl.DateTimeFormat(undefined, { timeZone: zone, timeZoneName: 'shortOffset' })
  .formatToParts(new Date()).find(p => p.type === 'timeZoneName').value; // e.g. "GMT+1"
```
`timeZoneName:'shortOffset'` support: Node 24 ✓ [VERIFIED: Node ICU implements ES2022 `shortOffset`; verify once in a browser smoke pass] [ASSUMED for older browser targets].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 5-label GMT select → `TZ_BY_LABEL` | Full IANA combobox + resolve funnel | This phase | Server never sees a label again after funnel; stored labels resolve on read |
| UTC fallback for empty/unknown | `Europe/Paris` fallback | This phase (D-07) | One existing test re-pinned |
| Workspace-shared tz (first membership) | Per-member tz | This phase (D-09) | `workspaceTzLabel()` deleted; per-recipient predicates |

**Deprecated/outdated:** `workspaceTzLabel()` and the D-27-1 "workspace's shared timezone" comment — update/remove as part of the refactor.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Intl.DisplayNames` with `type:'timeZone'` may not be supported on all target browsers; `timeZoneName:'shortOffset'` is fine on Node 24 but verify a browser smoke pass | Code Examples / Alternatives | Option labels degrade; use raw IANA city segment as fallback |
| A2 | `Intl.DateTimeFormat` construction is an acceptable IANA validator (accepts aliases like `US/Pacific`) | Pattern 1 | If aliases should be rejected as canonical-only, intersect with the static list instead — planner decision |
| A3 | Static canonical zone list is acceptable to generate from Node's `Intl.supportedValuesOf('timeZone')` at build time (D-03 bans *runtime* enumeration only) | Standard Stack | If the owner wants a hand-curated list, only the generation step changes |

## Open Questions (RESOLVED)

1. **Where exactly does the save write land (Option A vs B)?** — RESOLVED: Option A (self-tz carve-out in `docFromClient`), implemented by 44-02 Task 1, per CONTEXT.md's integration-point wording and the research recommendation.
2. **Does the doc-only member path need tz write support?** Doc-only members (no account) can't log in, so they can't save a tz — they only need read-side resolution (Paris default). No action expected. — RESOLVED: no action; confirmed non-blocking by planner.
3. **Reject or coerce on invalid save (D-10)?** Coerce keeps the catalogue untouched; reject is more honest. Planner's call per the discretion grant. — RESOLVED: coerce to Paris, implemented by 44-02 Task 1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node ≥ 24 with full ICU | Scheduler `localParts`, funnel validation, build-time zone list | ✓ | v24.21.0 [VERIFIED: node --version] | — |
| ESLint/Prettier gates | lint/format on new files | ✓ (devDeps present) | eslint 9 / prettier 9 | — |
| Playwright | optional combobox smoke | ✓ | 1.64 | Skip (node:test suite is the gate) |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 24 built-in) |
| Config file | none — `package.json` script |
| Quick run command | `node --test test/tz-resolve.test.mjs test/tz-dedup.test.mjs` |
| Full suite command | `npm test` (all `test/*.test.mjs`, concurrency 2) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TZ-01/SC-1 | Per-member window (two members, different tzs, same pass fire independently) | integration (injectable clock) | `node --test test/due-reminders.test.mjs test/digest.test.mjs` | ❌ Wave 0 |
| TZ-01/SC-2 / D-07 / D-08 | Legacy 5+1 label map pins; empty → Paris; unknown → Paris | unit | `node --test test/tz-resolve.test.mjs` | ❌ Wave 0 |
| TZ-01/SC-3 / D-11 / D-12 | Dedup under tz change (same localDate no-refire; new localDate one claim) | integration | `node --test test/tz-dedup.test.mjs` | ❌ Wave 0 |
| SC-4 / D-01..D-04 | Combobox renders, preselects browser zone, saves through validated path; non-admin self-tz persists, cannot write others' | integration + wiring regression | `node --test test/settings-tz.test.mjs` (name at planner discretion) | ❌ Wave 0 |
| SC-5 | Existing Phase 27/37/38 suites pass unmodified except the UTC-fallback re-pin | regression | `node --test test/due-reminders.test.mjs test/digest.test.mjs` | ✅ (re-pin ~due-reminders.test.mjs:380) |

### Sampling Rate
- **Per task commit:** the task's targeted test file(s)
- **Per wave merge:** `npm test` + `npm run i18n:scan` + `npm run lint`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/tz-resolve.test.mjs` — funnel pins (D-07/D-08)
- [ ] `test/tz-dedup.test.mjs` — D-12 edge tests against the injectable-clock harness (`/api/internal/reminder-pass`)
- [ ] Save-path regression test (non-admin self-tz write, cross-member write rejection)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `resolveTz` funnel as the single server-side validator (D-10); client validation advisory only |
| V4 Access Control | yes | Save path must enforce self-only tz write (Pitfall 1 — member A never writes member B's tz) |
| V3 Session Management | no | No new session surface (any new route rides existing `requireWorkspace`/auth middleware) |
| V6 Cryptography | no | — |
| V2 Authentication | no | — |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored-markup in tz value rendered client-side | Tampering | Server funnel validation + client `esc()` on every interpolation (Pitfall 7) |
| Doc PUT as a member-spoofing vector (writing another member's profile fields) | Elevation | Self-tz-only exception in the merge path, pinned by test (Critical Finding, Option A) |
| Doc bloat via 400-zone list | DoS | Zone list is client-side static; only one stored string per member |

## Sources

### Primary (HIGH confidence)
- `server.js` lines 336-341, 1360-1442, 1444-1636, 1692-1719, 2654-2668 — read this session (scheduler, ledger, docFromClient, memberProfile)
- `src/pages/settings.js` lines 279-286, 85 — read this session (tz select, `sel()` helper)
- `src/actions/actions.js` lines 2727-2733; `src/core/store.js` lines 17, 54-57, 122-125, 240-270 — read this session (pref save flow, DEFAULT_PREFS.tz)
- `test/due-reminders.test.mjs` (harness, TZ fixtures, UTC-fallback pin at 380-382), `test/digest.test.mjs` — read this session
- `.planning/phases/44-per-member-timezones-v1-10/44-CONTEXT.md` — all D-decisions

### Secondary (MEDIUM confidence)
- `package.json` scripts/engines; `src/locales/en.json` / `fr.json` catalogue shape — read this session
- STATE.md quick task 261106-b46 (08:00 window), prior-phase decision entries

### Tertiary (LOW confidence)
- Browser support breadth for `timeZoneName:'shortOffset'` / `Intl.DisplayNames type:'timeZone'` [ASSUMED — A1]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — built-ins and in-repo helpers, all read this session
- Architecture: HIGH — refactor targets verified at exact lines; save-path disconnect traced end-to-end
- Pitfalls: HIGH for server-side items (source-verified), MEDIUM for browser-side Intl feature support (A1)

**Research date:** 2026-11-06
**Valid until:** 2026-12-06 (stable; in-repo anchors)
