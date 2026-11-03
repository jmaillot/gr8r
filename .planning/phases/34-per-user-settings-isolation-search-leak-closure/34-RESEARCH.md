# Phase 34: Per-User Settings Isolation & Search Leak Closure - Research

**Researched:** 2026-11-03
**Domain:** In-repo SQLite/Node server — document-field extraction to a per-user table (migration recipe), plus Unicode-aware tokenized redaction of recent-search terms
**Confidence:** HIGH (all claims verified by reading source files this session; no external packages involved)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Prefs transport & API shape
- **D-01:** Dedicated routes — a new GET/PUT prefs endpoint pair owned by the authenticated user; the client keeps per-user prefs in its own store slot and stops writing `notifPrefs` into the document. The server strips the doc field on read (`normalizeDoc`) and on write (`mergeClientDoc`). Mirrors how sessions/locale already left the document. — **Reversibility:** costly — the document field is deleted from stored docs by the migration; going back means re-populating a doc field the write path now strips.
- **D-02:** Strip both directions — `normalizeDoc` deletes `out.data.notifPrefs` on every read (same pattern as the D-30 sessions/tfa strips) and `mergeClientDoc` strips the field from incoming writes: a stale client's copy is dropped, not merged (SETTINGS-02 wording).
- **D-03:** Whitelist keys — the PUT endpoint accepts only the pref keys the settings UI renders (email_mention, email_assign, email_comment, email_digest, email_reminder, push_mention, push_assign, push_comment, push_due, due_reminder, past_due, mention_all, mention_team, mention_ws, assign_self, assign_status, assign_over) and coerces values to boolean. No arbitrary JSON blob in the table.
- **D-04:** One accessor, pinned — a single `getUserNotifPrefs(userId, workspaceId)` accessor is the only reader; the reminder gate (server.js:1288), email dispatch (server.js:1116) and the GET route all call it. Pinned by test: no second prefs pipeline (mirrors the VIS one-funnel invariant).

#### Local-mode prefs home
- **D-05:** Local (no-API) workspaces store per-user prefs in **localStorage**, keyed per workspace. Same whitelist, same defaults — only the storage backend differs; UI code converges on one prefs object, persistence is the only variable.
- **D-06:** The seed document's `notifPrefs` block (src/data/seed.js:514) is removed; a fresh local workspace starts from D-27-5 defaults via the same accessor.
- **D-07:** The client toggle (`npToggle`, src/actions/actions.js:2676) branches once: `api.enabled` → PUT /prefs; else → localStorage write + re-render. One branch, two persistence adapters — matches how `save()` already branches for local vs API.
- **D-08:** Local-mode behavior is test-pinned: prefs survive reload, are workspace-scoped (no bleed across local workspaces), and default to D-27-5 all-ON when the key is absent.

#### Migration & default semantics
- **D-09:** Backfill scope — the migration copies the workspace-level `notifPrefs` object into a row for EVERY member of every workspace whose doc carries the field. Zero behavior change at switch-over; users diverge individually afterward. — **Reversibility:** one-way.
- **D-10:** Table shape — one row per user per workspace: `(workspace_id, user_id, prefs JSON)`, keyed by user_id (accounts persist across workspaces). One SELECT per read, whole-object upsert on PUT.
- **D-11:** Backfill + strip doc — eligibility guard = doc contains `notifPrefs` AND some member lacks a row; the migration copies rows AND deletes the doc field in the same transaction. After that boot the doc is clean → guard false forever → byte-identical second boot, and later joiners read defaults instead of inheriting stale workspace prefs. Pre-migration backup per the `migrateTeamMembership` recipe (no backup = no mutation).
- **D-12:** Merge-on-read, lazy rows — `getUserNotifPrefs` returns the D-27-5 defaults merged under the stored row for missing keys; users without rows read all-ON exactly like today's merge-on-read. A row exists only after the first PUT.

#### Search leak fix mechanics
- **D-13:** Tokenized matching — keep the drop-if-references-hidden model, but match on word/token boundaries after normalization instead of raw substring: "Sara Corp" no longer collides with hidden "Sarah", while "sarah smith" still matches hidden "Sarah". Table-driven tests pin both directions (no leak, no false positive).
- **D-14:** Normalization — NFC normalize + `toLowerCase` on both hidden names and terms before tokenizing. No diacritic stripping — "Café" must not match "cafe". (Full Unicode casefold via Intl is out; `toLowerCase` is accepted.)
- **D-15:** Recent searches stay workspace-wide (locked out-of-scope) — one test pins the list remains a single workspace-wide list.
- **D-16:** Tests extend the existing search/redaction test file; table rows = `{term, hiddenTerms, expected}` covering NFC/NFD variants, punctuation, token-boundary collisions, hidden/visible name collisions. Plus the CHANGELOG.md free-text limitation note (SEARCH-01).

### the agent's Discretion
- Exact route paths for the GET/PUT prefs endpoints.
- Exact accessor naming/signature (`getUserNotifPrefs` is a suggestion, not a contract).
- localStorage key naming and structure.
- Tokenization details (word-boundary regex vs splitting) as long as the table-driven pins pass.
- Which test file precisely hosts the SEARCH-01 table suite (the one pinning `mergeRecentSearches` today, or `test/scope.test.mjs` next to the MATRIX).
- Placement of the SETTINGS-03 `invoices` pin test.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETTINGS-01 | `notifPrefs` → real per-user rows, additive migration w/ backup + byte-identical second boot + row-level eligibility guard; doc stops carrying the field | `migrateTeamMembership` recipe verified verbatim (server.js:1775-1823); table creation block at server.js:140-288; byte-identical test patterns in test/migration.test.mjs:418-496 |
| SETTINGS-02 | Every consumer reads per-user rows; stale doc writes stripped, not merged; two users can differ | Consumer sites verified: server.js:1116 (email dispatch), server.js:1288 (reminder gate), src/pages/settings.js:167 (UI); strip precedent server.js:1409-1412 and server.js:613-614 |
| SETTINGS-03 | `invoices` pin — no migration, absence from write path proven by test | Write-path delete verified at server.js:1409-1410; existing precedent test at test/migration.test.mjs:196-210 |
| SEARCH-01 | Tokenized redaction, table-driven tests, CHANGELOG limitation note | Leak surface verified: `referencesHidden` server.js:891 uses `term.toLowerCase().includes(name)`; call sites server.js:903, 908, 936 |
</phase_requirements>

## Summary

This phase is almost entirely **in-repo pattern replication**, not new technology. The `user_notif_prefs` table + migration is a direct clone of the proven `migrateTeamMembership` recipe (guard → backup → `begin immediate` → insert-or-ignore → commit), and the read/write strips are clones of the D-30 `sessions`/`tfa` strips. The search fix replaces one predicate (`referencesHidden`, server.js:891) with a tokenized/normalized variant used by three call sites (two in `mergeRecentSearches`, one in `redactDoc`).

**Critical planning fact discovered:** `server.js` has **zero exports** — every test drives the server over HTTP via `test/helpers/server.mjs` (`startServer`, `withDb`, `signup`, `login`, `client`). There is today **no test file that imports or unit-pins `mergeRecentSearches`/`referencesHidden` directly** — redaction is pinned end-to-end through doc GET/PUT in `test/scope.test.mjs:1132-1142` and `test/privacy.test.mjs:190-278`. CONTEXT D-16's "the existing file that pins `mergeRecentSearches` today" does not exist as a unit-test file; the pin is indirect. The planner must either (a) run the SEARCH-01 table suite end-to-end through doc fixtures (heavier per row), or (b) extract the matcher to a small importable module (e.g. `src/lib/` or a server-side module) so the table runs as pure unit tests. Discretion area — recommend (b): a pure `redactionMatch(term, hiddenTerms)` module keeps the table-driven suite fast and matches D-13/D-16's row shape verbatim.

Second critical fact: the reminder gate (server.js:1288) reads prefs **once per workspace pass**, but per-user rows mean the gate must resolve prefs **per recipient** (the reminder types gate on `email_reminder` per D-27-5; the assignee is the recipient). The email dispatch loop (server.js:1153+) already iterates per-notification `n.to`, so the per-user lookup slots in naturally there. Plan a task for the reminder gate restructuring, not just a one-line swap.

**Primary recommendation:** Clone `migrateTeamMembership` into `migrateUserNotifPrefs` (guard = doc has `notifPrefs` AND a member lacks a row; backup; one transaction copies rows AND `delete out.data.notifPrefs` equivalent on stored docs); add the GET/PUT route pair next to `/api/auth/me` PATCH (server.js:3025) as per-user-authenticated endpoints; strip the doc field in both `normalizeDoc` and `mergeClientDoc`; extract the tokenized matcher into a pure module and table-test it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Prefs storage (API mode) | Database / Storage (`user_notif_prefs` table) | API / Backend (accessor + routes) | Rows are authority (TEAM-05 trajectory); accessor is the only reader |
| Prefs migration & backfill | Database / Storage (boot migration) | — | Follows `migrateTeamMembership` boot-migration pattern |
| Prefs storage (local mode) | Browser / Client (localStorage, per-workspace key) | — | D-05 locks this; mirrors `LOCALE_STORAGE_KEY` precedent in src/core/i18n.js:114 |
| Prefs UI + toggle | Browser / Client (settings.js, actions.js) | API / Backend (PUT route) | UI renders one prefs object; persistence adapter branches on `api.enabled` |
| Doc-field strip (read+write) | API / Backend (`normalizeDoc`, `mergeClientDoc`) | — | Server owns document hygiene; stale clients can't resurrect |
| Search redaction matching | API / Backend (pure matcher fn) | — | Runs inside `redactDoc`/`mergeRecentSearches` during doc GET/PUT |

## Standard Stack

### Core
No new packages. Everything uses the existing stack.

| Library/Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 (existing db handle `db`) | in repo | `user_notif_prefs` table, prepared statements | Already the persistence layer [VERIFIED: server.js:140-288 create-table block] |
| Node test runner (`node --test`) | Node v24.21.2 [VERIFIED: shell `node --version` → v24.21.2] | table-driven SEARCH-01 suite + migration pins | Existing suite: `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json:18] |
| `String.prototype.normalize('NFC')` + `toLowerCase()` | JS built-in | D-14 normalization | Standard ECMAScript Unicode normalization [ASSUMED for exact UCD version — pinned by test rows, not by docs] |
| `test/helpers/server.mjs` | in repo | HTTP-driven integration harness (`startServer`, `withDb`, `signup`, `login`, `client`) | Only test entry to server behavior — server.js exports nothing [VERIFIED: imports at test/scope.test.mjs:16, test/migration.test.mjs:11; `grep -n export server.js` returns nothing] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure matcher module + unit table | End-to-end HTTP fixture per table row | End-to-end is the current house style but one HTTP boot per row is slow; a pure module keeps the D-16 `{term, hiddenTerms, expected}` rows cheap. Router helpers must stay importable — server.js itself stays unexported. |
| `Intl` full casefold | `toLowerCase()` | D-14 locks `toLowerCase` — do not deviate. |

**Installation:** none — zero new dependencies.

## Package Legitimacy Audit

Not applicable — this phase installs **no external packages**. All work is in-repo (server.js, src/*, test/*).

## Architecture Patterns

### System Architecture Diagram

```
                       PUT /api/.../prefs  ──┐
  Settings UI (settings.js) ──npToggle───────┤
        │  one prefs object                  │ whitelist(17 keys)+bool coerce
        │                                    ▼
        │                        ┌────────────────────────┐
        ▼                        │  getUserNotifPrefs()   │◄── ONE accessor (D-04)
  [api.enabled?] ── no ──► localStorage ──┘      │                        │
        │ yes                    (per-ws key)     │  defaults(D-27-5)      │
        ▼                              ▲         │  merged UNDER row      │
  user_notif_prefs row ◄──upsert───────┘         └───┬──────────┬─────────┘
        ▲                                            │          │
  boot migration ──backfill── workspaces.doc         │          │
  (migrateTeamMembership recipe)                     ▼          ▼
                                            reminder gate   queueNotifEmails
                                            (server.js:1288) (server.js:1116)

  Doc strip (both directions):  normalizeDoc (read) ✂ delete data.notifPrefs
                                mergeClientDoc (write) ✂ delete data.notifPrefs

  Search redaction:  doc GET/PUT → redactDoc / mergeRecentSearches
                     → referencesHidden  [OLD: toLowerCase().includes(name)  ← LEAK]
                     → NEW tokenized matcher (NFC + toLowerCase + token boundary)
```

### Recommended Project Structure
```
server.js                          # table DDL (create-table block ~:140-288), migration,
                                   # accessor, routes, strips, reminder/email consumers
src/lib/redaction.js (new, or equivalent discretion)  # pure tokenized matcher — importable by tests
src/core/store.js (or adjacent)    # local-mode prefs load/save + defaults (D-05/D-08)
src/pages/settings.js              # np reads new prefs object (:167, :370+)
src/actions/actions.js             # npToggle branches (:2676-2680)
src/data/seed.js                   # notifPrefs block removed (:514-525)
test/migration.test.mjs            # byte-identical boot pins + invoices pin
test/<search tests>                # SEARCH-01 table suite (discretion: file choice)
CHANGELOG.md                       # SEARCH-01 free-text limitation note
```

### Pattern 1: The migrateTeamMembership recipe (verbatim structure to clone)
**What:** guard → backup → transaction. Source verified at server.js:1775-1823:
- `eligible()` = `select count(*)` of rows needing backfill (`... where X is not null and not exists (select 1 from target ...)`) — return early if 0.
- Backup: `pragma wal_checkpoint(truncate)` then `vacuum into '<backup path>'`; **backup failure = return without mutating** ("No backup = no mutation", server.js:1772-1773).
- `conn.exec('begin immediate')` → `insert or ignore into <target> select ... where ... and not exists (...)` → any doc mutation → `commit`; on error `rollback` + rethrow.
**For this phase:** eligibility = workspace docs whose JSON carries `data.notifPrefs` AND at least one membership user lacking a `user_notif_prefs` row (docs must be JSON-parsed per row — do it in JS after selecting rows, since the field lives in a JSON blob column). The doc-field delete MUST be inside the same transaction (D-11). Keep both the row-copy and doc-strip in one `begin immediate`.

### Pattern 2: The D-30 double strip
Read side (server.js:613-614, verified): inside `normalizeDoc`, plain `delete out.data.sessions; delete out.data.tfa;` with a comment naming the decision. **Important wrinkle:** `normalizeDoc` currently *creates* `out.data.notifPrefs` with D-27-5 defaults (server.js:633-638) — Phase 34 must REMOVE that default-merge block and replace it with the strip, so the served document no longer carries prefs at all. Write side (server.js:1409-1412, verified): `delete next.data.plan; delete next.data.invoices; delete next.data.sessions; delete next.data.tfa;` — add `delete next.data.notifPrefs;` here (which also completes the SETTINGS-03 invoices story: the field is already purged here; the pin test just asserts it).

### Pattern 3: Per-user route precedent
`/api/auth/me` PATCH (server.js:3025) is the existing per-user, session-authenticated, non-workspace-document endpoint — model the GET/PUT prefs routes on it (cookie auth, user from session). Route style is hand-rolled `if (pathname === '...' && method === '...')` dispatch — no router library.

### Pattern 4: Local-mode persistence precedent
`storeLocale`/`readStoredLocale` in src/core/i18n.js:114-122 use a module-level `localStorage` key with try/catch. D-05's per-workspace key follows this; key naming is discretion (recommend including the workspace slug/id in the key to satisfy D-08's no-bleed pin).

### Anti-Patterns to Avoid
- **A second prefs pipeline:** any consumer reading `doc?.data?.notifPrefs` after this phase is a bug — the accessor is the only reader (D-04, mirrors VIS one-funnel).
- **Merging a stale client's `notifPrefs` back:** strip, never merge (D-02).
- **Re-adding the default merge in normalizeDoc:** once the strip lands, normalizeDoc must not synthesize `notifPrefs` again — the accessor owns defaults (D-12).
- **Diacritic stripping:** "Café" must NOT match "cafe" (D-14) — do not reach for NFD-stripping "helpfully".
- **Backup skipped on migration:** no backup = no mutation (recipe invariant).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration safety | ad-hoc backup logic | the `migrateTeamMembership` backup block verbatim (wal_checkpoint + vacuum into) | Already proven; byte-identical tests depend on its shape |
| Tokenization | a Unicode segmentation library | simple word-boundary approach (`toLowerCase` + boundary regex or token split) per D-13/D-14 | D-14 explicitly scopes normalization to NFC+toLowerCase; the table tests are the contract |
| HTTP test harness | custom fetch plumbing | `test/helpers/server.mjs` helpers | House style; every existing test uses it |

**Key insight:** the codebase has already solved both hard problems once (guarded migration, strip-on-read); this phase is replication, and the tests already have established shapes to clone (test/migration.test.mjs:418-496 byte-identical pins).

## Runtime State Inventory

Migration phase → all five categories answered.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `workspaces.doc` JSON blobs carrying `data.notifPrefs` (source of truth today: server.js:633 merge-on-read; consumers read `doc?.data?.notifPrefs` at :1116/:1288). Also client localStorage `STORE_KEY` snapshots (src/core/store.js:32,138) may embed `data.notifPrefs` inside the doc snapshot. | Data migration: backfill rows + delete doc field (D-09/D-11). Client: `stripLegacyLang` precedent (src/core/store.js:27-30) — add an equivalent strip so an old localStorage blob doesn't resurrect `notifPrefs` into the doc on first save. |
| Live service config | None — no external services involved (verified: no notifPrefs refs outside repo code/tests). | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None — `notifPrefs` appears in no env/secret naming. | None. |
| Build artifacts | None — plain JS, no build step for server.js; seed data is a source module (src/data/seed.js:514). | None. |

## Common Pitfalls

### Pitfall 1: The reminder gate reads prefs once per workspace, not per recipient
**What goes wrong:** swapping `doc?.data?.notifPrefs` (server.js:1288) for the accessor without threading a user id silently keeps workspace-level semantics, or worse crashes (no userId at that point).
**Why:** `runReminderPass` loops workspaces → tasks; the prefs consumer is per-task-assignee once rows are per-user.
**How to avoid:** move the prefs lookup inside the per-task loop (or per-recipient resolution), calling `getUserNotifPrefs(t.assignee, ws.id)`. A dedicated task + test that two assignees with different rows get different reminder outcomes.
**Warning signs:** a reminder test where changing one user's row changes another user's email.

### Pitfall 2: normalizeDoc's default merge resurrects the field
**What goes wrong:** leaving server.js:633-638 in place re-creates `notifPrefs` on every read even after the migration strips stored docs — the byte-identical second-boot pin fails and stale clients keep a live field.
**How to avoid:** remove the default-merge block in the same task as the strip; verify via doc GET that `data.notifPrefs` is `undefined`.
**Warning signs:** `after.data.doc.data.notifPrefs` non-undefined in migration tests.

### Pitfall 3: Old localStorage snapshots resurrect prefs (client-side)
**What goes wrong:** the local store snapshot (src/core/store.js:138 `docSnapshot()`) contains the doc including `notifPrefs`; on load it flows back into `S.data`.
**How to avoid:** strip on load exactly like `stripLegacyLang` (store.js:27-30) and exclude prefs from `docSnapshot()`.
**Warning signs:** local-mode test writes prefs, reloads, doc snapshot still carries notifPrefs.

### Pitfall 4: `toLowerCase` ≠ Unicode casefold for the redaction terms
**What goes wrong:** hidden name "İstanbul" or "ß"-containing names edge-case differently under `toLowerCase`; D-14 accepts this — the mistake is silently "improving" it.
**How to avoid:** pin the accepted behavior with table rows (NFC/NFD pair, accents, punctuation); do not add Intl casefold.
**Warning signs:** a review suggesting `toLocaleUpperCase`/casefold "fixes".

### Pitfall 5: Migration eligibility scans JSON in SQL
**What goes wrong:** trying to detect `notifPrefs` in the doc blob with LIKE/JSON1 edges (malformed docs, nested keys) produces false eligibility or crashes the boot.
**How to avoid:** select workspace rows, `JSON.parse` in JS with try/catch (precedent: migrateTenancy at server.js:1845-1849 falls back to `{}` on unreadable docs), evaluate the guard in JS.
**Warning signs:** migration test with a deliberately corrupt doc row.

### Pitfall 6: Test home for the matcher doesn't exist as assumed
**What goes wrong:** planning tasks against "the test file that pins `mergeRecentSearches`" — none exists (verified: no test imports or references `mergeRecentSearches`/`referencesHidden`).
**How to avoid:** extract the pure matcher into an importable module (unit table) and keep/extend the end-to-end pins in `test/scope.test.mjs` (:1132-1142) and `test/privacy.test.mjs` (:190-278) for the doc-level behavior.
**Warning signs:** a plan task saying "edit the existing matcher unit test".

## Code Examples

### The accessor (D-04/D-10/D-12)
```js
// server.js — shape only; exact naming is discretion
const NOTIF_PREF_KEYS = [/* the 17 keys from D-03 */];
const NOTIF_PREF_DEFAULTS = { email_reminder: true, due_reminder: true, past_due: true /* ...all-ON per D-27-5 for reminder keys; emptyDoc defaults for the rest */ };

function getUserNotifPrefs(userId, workspaceId) {
  const row = db.prepare('select prefs from user_notif_prefs where workspace_id = ? and user_id = ?').get(workspaceId, userId);
  const stored = row ? JSON.parse(row.prefs) : {};
  return { ...NOTIF_PREF_DEFAULTS, ...stored }; // merge-on-read, `=== false` disables (D-12)
}
```
Note on defaults: `normalizeDoc` today defaults ONLY the three reminder keys then spreads stored (server.js:633-638), while `emptyDoc` (server.js:1654-1668) carries 13 keys — `email_comment: false` is the only non-ON default there. The accessor must reproduce exactly these defaults or switch-over changes behavior. Verified verbatim from server.js:1654-1668: `email_mention: true, email_assign: true, email_digest: true, email_comment: false, email_reminder: true, due_reminder: true, past_due: true, push_mention: true, push_assign: true, push_comment: true, push_due: true, mention_all: true, assign_self: true`. The remaining D-03 keys (`mention_team, mention_ws, assign_status, assign_over`) have no server default today — their current read-undefined behavior should be preserved (undefined = falsy at the gate) unless the table rows add them; flag in the plan.

### The leak and its replacement (D-13/D-14)
```js
// server.js:891 — TODAY (verified verbatim):
const referencesHidden = (term, hiddenTerms) =>
  typeof term === 'string' && hiddenTerms.some(name => term.toLowerCase().includes(name));
// "Sara Corp".includes("sarah") is false, but "Sarah Inc" vs hidden "Sara h"? The real
// failure: hidden "Sara" leaks any term containing "sara" as substring even inside
// longer visible words, and hidden "Sarah" blocks visible "Sara Corp" ... the table
// pins decide; the model is: tokenize both sides after NFC + toLowerCase.

// NEW (shape): normalize → tokenize → token-set intersection
function referencesHiddenTokens(term, hiddenTerms) {
  if (typeof term !== 'string') return false;
  const tokens = tokenize(term.normalize('NFC').toLowerCase());
  return hiddenTerms.some(name =>
    tokenize(name.normalize('NFC').toLowerCase()).some(h => tokens.includes(h)));
}
```
Call sites to swap: server.js:903 and :908 (inside `mergeRecentSearches`) and server.js:936 (`redactDoc` recentSearches filter). `hiddenProjectTerms` (server.js:879-888) already lowercases; it must NFC-normalize too so both sides share D-14.

### Table DDL placement
```sql
create table if not exists user_notif_prefs (
  workspace_id text not null,
  user_id      text not null,
  prefs        text not null,          -- JSON object, whitelisted boolean keys
  primary key (workspace_id, user_id)
);
```
Add alongside the existing `create table if not exists` block (server.js:140-288). Byte-identical DDL across boots is a pinned property in this suite (test/migration.test.mjs:460-496 precedent).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workspace-level notifPrefs in shared doc, merge-on-read defaults | Per-user rows + one accessor | This phase | Two users can differ; later joiners get defaults (D-11) |
| Substring `includes()` redaction | Tokenized normalized matching | This phase | No hidden-name leak, no false positive on near-miss names |
| plan/invoices/sessions/tfa doc fields | stripped both directions (D-30/P-A) | prior phases | notifPrefs joins this list; invoices pin formalizes it |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Node.js` `String.prototype.normalize('NFC')` provides the D-14 behavior adequately (UCD version unstated; pinned by table rows) | Code Examples | Low — table tests are the contract |
| A2 | `emptyDoc`'s 13-key default set (incl. `email_comment: false`) is the intended switch-over default set; the 4 extra D-03 keys default to undefined-falsy | Code Examples | Medium — if the intent is all-ON for mention_team/mention_ws/assign_status/assign_over, gate behavior changes at switch-over, violating D-09's zero-change guarantee. Planner should surface as a checkpoint or confirm from settings UI render defaults |
| A3 | Local-mode localStorage prefs should be keyed per workspace (slug or id) — D-05 says "keyed per workspace", exact key is discretion | Local-mode | Low — D-08 pin will catch bleed |

## Open Questions

1. **Defaults for the 4 keys absent from `emptyDoc`** (`mention_team, mention_ws, assign_status, assign_over`)
   - What we know: D-03 whitelists 17 keys; server defaults today cover 13 (server.js:1654-1668); the D-27-5 reminder trio is defaulted in normalizeDoc (server.js:633-638).
   - What's unclear: should the accessor default the extra 4 to `true` (all-ON) or preserve today's undefined-falsy read?
   - Recommendation: preserve current read behavior (zero change at switch-over, D-09) and let the PUT upsert write them explicitly once toggled; note in plan.
2. **Unit-test home for the matcher** — extract a pure module (recommended) vs end-to-end-only rows. Discretion area; recommendation in Summary.

## Environment Availability

Step 2.6 audit — external dependencies:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tests, server | ✓ | v24.21.2 | — |
| npm test runner (`node --test`) | full suite | ✓ | bundled | — |

No missing dependencies. No external services, CLIs, or databases beyond the embedded SQLite.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (`node --test`) on Node v24.21.2 |
| Config file | none — glob convention `test/*.test.mjs` [VERIFIED: package.json:18] |
| Quick run command | `node --test test/migration.test.mjs` |
| Full suite command | `npm test` (= `node --test --test-concurrency=2 test/*.test.mjs`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETTINGS-01 | guarded backfill; byte-identical second boot; doc field gone | integration (HTTP harness) | `node --test test/migration.test.mjs` | ✅ (extend; patterns at :418-496) |
| SETTINGS-02 | one accessor; stale-client strip; two users differ | integration | `node --test test/membership.test.mjs test/due-reminders.test.mjs` (consumers) + new prefs route tests | ❌ Wave 0 (new file, e.g. `test/notif-prefs.test.mjs`) |
| SETTINGS-03 | invoices absent from write path | integration | `node --test test/migration.test.mjs` | ✅ (precedent at :196-210; add explicit pin) |
| SEARCH-01 | tokenized redaction table + workspace-wide pin + CHANGELOG note | unit (extracted matcher) + integration (scope.test.mjs-style doc fixtures) | `node --test test/scope.test.mjs` + new table file | ⚠️ partial — end-to-end pins exist (scope.test.mjs:1132-1142, privacy.test.mjs:190-278); table suite is Wave 0 |

Note: existing tests already touching notifPrefs that MUST keep passing (behavior-zero-change check): `test/membership.test.mjs`, `test/scope.test.mjs`, `test/due-reminders.test.mjs`, `test/i18n-toast.test.mjs`, `test/helpers/legacy-fixture.mjs` [VERIFIED: grep notifPrefs in test/].

### Sampling Rate
- **Per task commit:** `node --test test/migration.test.mjs` (or the touched file)
- **Per wave merge:** `npm test`
- **Phase gate:** full 803+-test suite green before `/gsd-verify-work` (STATE.md baseline)

### Wave 0 Gaps
- [ ] `test/notif-prefs.test.mjs` (or chosen name) — SETTINGS-01/02 route + accessor pins
- [ ] Extracted matcher module + table file — SEARCH-01 rows `{term, hiddenTerms, expected}`
- [ ] None for SETTINGS-03 (extends existing migration.test.mjs patterns)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | session cookie auth shared with `/api/auth/me` route precedent (server.js:3025) |
| V3 Session Management | no (unchanged) | existing sessions machinery untouched |
| V4 Access Control | yes | prefs routes are strictly self-scoped (`user_id` = authenticated user; no cross-user reads); workspace membership checked for the workspace_id param |
| V5 Input Validation | yes | D-03 whitelist (17 keys) + boolean coercion on PUT; no free-form JSON into the table |
| V6 Cryptography | no | no new secrets; prefs are non-sensitive booleans |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user prefs read/write (IDOR on user_id) | Elevation/Info-disclosure | derive user_id from session, never from the request body |
| Stale/malicious doc resurrecting notifPrefs | Tampering | double strip (normalizeDoc + mergeClientDoc), D-02 |
| Hidden-project name leak via search history | Information disclosure | tokenized redaction (this phase's SEARCH-01), workspace-wide list retained (D-15) |
| SQL injection in prefs upsert | Tampering | prepared statements (house style throughout server.js) |

## Sources

### Primary (HIGH confidence)
- `server.js` — read this session: normalizeDoc (:603-640), hiddenProjectTerms (:879-888), referencesHidden (:891), mergeRecentSearches (:898-912), redactDoc (:914-939), mergeClientDoc strips (:1405-1412), queueNotifEmails (:1114-1116), reminder gate (:1288), migrateTeamMembership (:1775-1823), emptyDoc defaults (:1654-1668), create-table block (:140-288), /api/auth/me PATCH (:3025)
- `src/pages/settings.js:156-167, 370-381` — np read + toggle rendering
- `src/actions/actions.js:2676-2680` — npToggle; :2692-2699 langSel api/local branch precedent
- `src/data/seed.js:500-526` — notifPrefs block + 'Sarah' recent search
- `src/core/store.js:24-33, 120-145` — localStorage snapshot, stripLegacyLang, save() branching
- `src/core/i18n.js:114-122` — localStorage key precedent
- `test/migration.test.mjs`, `test/scope.test.mjs`, `test/privacy.test.mjs`, `test/helpers/server.mjs` — test shapes and harness
- `.planning/REQUIREMENTS.md` §SEARCH/§SETTINGS, `.planning/ROADMAP.md` §Phase 34, `34-CONTEXT.md`

### Secondary (MEDIUM confidence)
- None needed — no external documentation consumed; all claims in-repo.

### Tertiary (LOW confidence)
- A2 default-set intent (see Assumptions Log).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; existing tooling verified
- Architecture: HIGH — every pattern cloned from in-repo proven code, read this session with line citations
- Pitfalls: HIGH — each pitfall anchored to a verified line (notably the per-recipient reminder gate and the normalizeDoc default-merge removal)

**Research date:** 2026-11-03
**Valid until:** 2026-12-03 (stable — in-repo patterns, no external churn)
