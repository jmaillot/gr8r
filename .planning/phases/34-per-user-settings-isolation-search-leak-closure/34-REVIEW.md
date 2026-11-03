---
phase: 34-per-user-settings-isolation-search-leak-closure
reviewed: 2026-11-03T14:19:52Z
depth: deep
files_reviewed: 10
files_reviewed_list:
  - server.js
  - src/lib/redaction.js
  - src/core/notifPrefs.js
  - src/core/store.js
  - src/core/api.js
  - src/actions/actions.js
  - src/pages/settings.js
  - src/data/seed.js
  - CHANGELOG.md
  - test/notif-prefs.test.mjs
findings:
  critical: 0
  high: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-11-03T14:19:52Z
**Depth:** deep
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the phase-34 commits (34-01..34-05): per-user `user_notif_prefs` table, accessor
`getUserNotifPrefs`, GET/PUT `/api/me/notif-prefs`, guarded `migrateUserNotifPrefs` backfill,
double doc strip (normalizeDoc + mergeClientDoc), tokenized recent-search matcher
(`src/lib/redaction.js`), client prefs adapter (`src/core/notifPrefs.js`, store snapshot
exclusion, settings binding) and API-mode hydration (`hydrateNotifPrefs` at every workspace
entry). 160/163 tests pass (the single known pre-existing `dependencies.test.mjs` failure is
excluded per review instructions).

The core design is sound: user_id always comes from the session (never the body), the PUT
whitelist + boolean coercion is correct, membership checks use the no-oracle 404 shape, the
accessor is the sole reader, and the double strip (read + write) plus client-side
`stripLegacyNotifPrefs`/`docSnapshot` exclusion closes the doc-resurrection hole in both
directions. No critical or high-severity defects were found. Three warnings and three
info-level items below.

## Warnings

### WR-01: PUT `/api/me/notif-prefs` replaces the whole stored row — a partial body silently erases previously stored keys

**File:** `server.js:3216-3217`
**Issue:** The route builds `prefs` from only the keys present in the request body and writes
them with `insert or replace`. There is no server-side merge with the existing row: any key
the caller omits is deleted from the row. The shipped client sends the full `S.notifPrefs`
object, so the happy path works, but the contract is fragile: if a hydration ever failed
silently (`hydrateNotifPrefs` non-401 failures are deliberately silent, actions.js:3209-3218)
`S.notifPrefs` falls back to the 13 local defaults and the four undefined-falsy keys
(`mention_team`, `mention_ws`, `assign_status`, `assign_over`) are absent from the next PUT —
a stored `mention_team: false` is then silently reverted to the ON default. Any future
single-key caller (e.g. a quick-toggle endpoint) loses every other customization the same way.

**Fix:** Merge into the existing row server-side instead of replacing it:

```js
const existing = (() => {
  const row = db.prepare('select prefs from user_notif_prefs where workspace_id = ? and user_id = ?').get(ws.id, user.id);
  try { const s = JSON.parse(row?.prefs ?? '{}'); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; }
  catch { return {}; }
})();
const prefs = { ...existing };
for (const key of Object.keys(incoming)) prefs[key] = Boolean(incoming[key]);
```

(or, minimally, document the full-object PUT contract next to `putNotifPrefs` and assert in
`notif-prefs.test.mjs` that a partial PUT is rejected — but the merge is the robust fix).

### WR-02: `migrateUserNotifPrefs` guard can leave `data.notifPrefs` in the stored doc forever, contradicting the plan's "field is gone from every doc" truth

**File:** `server.js:1920-1932`
**Issue:** A workspace is only marked eligible when (a) its doc carries `notifPrefs` AND (b)
**at least one** member lacks a `user_notif_prefs` row. If every current member already has a
row — e.g. a single-member workspace where the user toggled a pref via the phase-34-01 routes
before the migrating boot ever ran, or a workspace whose doc carries prefs but whose
memberships table is empty — the workspace is skipped on every boot. The stale doc field is
never stripped (boot only, no ongoing strip of the stored copy beyond the read/write strips),
the guard never becomes permanently false, and every subsequent boot re-parses and re-scans it,
which also violates the "byte-identical second boot / guard false forever" must-have. Impact is
low (normalizeDoc and mergeClientDoc strip the field on every read/write) but the stored copy
lingers indefinitely.

**Fix:** Split the eligibility guard from the backfill: strip the doc field whenever the doc
carries `notifPrefs`, and backfill rows for members missing them — both inside the same
transaction, e.g. treat "doc has notifPrefs" alone as eligible and rely on
`insert or ignore` to keep existing per-user rows (which the code already does).

### WR-03: Tokenized matcher narrows SEARCH-01 protection for hidden names with no letter/number tokens

**File:** `src/lib/redaction.js:15-19, 28-33`
**Issue:** `tokenize` splits on `[^\p{L}\p{N}]+`, so a hidden project name consisting only of
symbols/punctuation (e.g. `###`, `!!!`, `***`) tokenizes to `[]` and can never match. The
pre-34-03 substring matcher (`term.toLowerCase().includes(name.toLowerCase())`) DID catch a
recent-search term containing such a name, so phase 34-03 regressed protection for this class:
a co-member's recent search containing the hidden symbol-only project name now survives both
the merge filter (server.js:904-918) and the `redactDoc` filter (server.js:936) and is served
to a caller who cannot see the project. The same applies to names whose distinguishing part is
purely symbolic (`###-internal`). Letter/number names keep full coverage.

**Fix:** Keep the tokenized matcher as the primary path but add a fallback for tokenless names,
e.g. in `referencesHidden`:

```js
const nameTokens = tokenize(name);
if (nameTokens.length === 0) {
  const norm = String(name ?? '').normalize('NFC').toLowerCase().trim();
  if (norm && term.normalize('NFC').toLowerCase().includes(norm)) return true;
  continue;
}
```

with a table-test pin for a symbol-only hidden name. Alternatively, document this residual
class next to the existing free-text limitation note in CHANGELOG.md if it is deemed
unreachable in practice (project names come from user input, so it is not).

## Info

### IN-01: `hydrateNotifPrefs` computes a dead local-mode wsId before its early return

**File:** `src/actions/actions.js:3209-3212`
**Issue:** `const wsId = api.enabled ? api.workspace?.id : D().ws.url;` evaluates the
`D().ws.url` branch, then the very next line returns when `!api.enabled` — the local value is
never used and touching `D()` before the guard is misleading (it can also mislead future
readers into thinking a GET happens in local mode).
**Fix:** Move the `if (!api.enabled) return;` above the `wsId` line and drop the ternary:
`const wsId = api.workspace?.id;`.

### IN-02: Duplicated 17-key whitelist / 13-key defaults between server and client modules

**File:** `server.js:1112-1149` vs `src/core/notifPrefs.js:12-46`
**Issue:** `NOTIF_PREF_KEYS` and `NOTIF_PREF_DEFAULTS` exist twice (server.js and the client
adapter), kept in sync only by comments ("Mirror of the server's NOTIF_PREF_DEFAULTS"). A key
added on one side and not the other fails silently: the server rejects unknown keys with 400,
or a new default renders as undefined-falsy on one side only. The import direction is not
trivially fixable (server.js stays export-free by D-16 / the runtime image copies `src/`
separately), but the drift risk deserves a mechanical guard.
**Fix:** Add a test (e.g. in `test/notif-prefs.test.mjs`) that imports both modules and asserts
`Object.keys(NOTIF_PREF_DEFAULTS)` and `NOTIF_PREF_KEYS` are byte-equal across server and
client, so drift fails CI instead of a toggle.

### IN-03: Pre-existing observation (out of phase scope, noted for the record)

**File:** `server.js:903-918`
**Issue:** In `mergeRecentSearches`, when `keepStored` is false (caller sees every project,
`hiddenTerms` empty) every stored term fails the `!keepStored && !referencesHidden(...)` test
and is dropped — a fully-privileged caller's save replaces the workspace-wide stored history
with only their own incoming list, discarding other members' searches. This logic predates
phase 34 (introduced in phase 29's CR-01 fix; 34-03 only re-pointed the matcher) and was not
changed by this phase, so it is recorded here as an observation, not a phase-34 finding.

---

_Reviewed: 2026-11-03T14:19:52Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
