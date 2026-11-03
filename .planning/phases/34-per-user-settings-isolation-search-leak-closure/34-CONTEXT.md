# Phase 34: Per-User Settings Isolation & Search Leak Closure - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

`notifPrefs` leave the shared workspace document and become real per-user rows
(`user_notif_prefs`, following the proven `migrateTeamMembership` recipe — additive
migration, pre-backup, row-level eligibility guard, byte-identical second boot), with
every consumer reading through one accessor; `invoices` stays out with a pin proving it.
On top of the Phase-32 visibility semantics, the substring-based recent-search leak
closes: `referencesHidden` stops leaking hidden names through `includes()` matching.
Requirements SETTINGS-01..03 and SEARCH-01 (see REQUIREMENTS.md). No new capabilities —
relocation of existing settings state plus a redaction-matching fix.
</domain>

<decisions>
## Implementation Decisions

### Prefs transport & API shape
- **D-01:** Dedicated routes — a new GET/PUT prefs endpoint pair owned by the
  authenticated user; the client keeps per-user prefs in its own store slot and stops
  writing `notifPrefs` into the document. The server strips the doc field on read
  (`normalizeDoc`) and on write (`mergeClientDoc`). Mirrors how sessions/locale already
  left the document. — **Reversibility:** costly — the document field is deleted from
  stored docs by the migration; going back means re-populating a doc field the write
  path now strips.
- **D-02:** Strip both directions — `normalizeDoc` deletes `out.data.notifPrefs` on
  every read (same pattern as the D-30 sessions/tfa strips) and `mergeClientDoc` strips
  the field from incoming writes: a stale client's copy is dropped, not merged
  (SETTINGS-02 wording).
- **D-03:** Whitelist keys — the PUT endpoint accepts only the pref keys the settings UI
  renders (email_mention, email_assign, email_comment, email_digest, email_reminder,
  push_mention, push_assign, push_comment, push_due, due_reminder, past_due,
  mention_all, mention_team, mention_ws, assign_self, assign_status, assign_over) and
  coerces values to boolean. No arbitrary JSON blob in the table.
- **D-04:** One accessor, pinned — a single `getUserNotifPrefs(userId, workspaceId)`
  accessor is the only reader; the reminder gate (server.js:1288), email dispatch
  (server.js:1116) and the GET route all call it. Pinned by test: no second prefs
  pipeline (mirrors the VIS one-funnel invariant).

### Local-mode prefs home
- **D-05:** Local (no-API) workspaces store per-user prefs in **localStorage**, keyed
  per workspace. Same whitelist, same defaults — only the storage backend differs; UI
  code converges on one prefs object, persistence is the only variable.
- **D-06:** The seed document's `notifPrefs` block (src/data/seed.js:514) is removed; a
  fresh local workspace starts from D-27-5 defaults via the same accessor.
- **D-07:** The client toggle (`npToggle`, src/actions/actions.js:2676) branches once:
  `api.enabled` → PUT /prefs; else → localStorage write + re-render. One branch, two
  persistence adapters — matches how `save()` already branches for local vs API.
- **D-08:** Local-mode behavior is test-pinned: prefs survive reload, are
  workspace-scoped (no bleed across local workspaces), and default to D-27-5 all-ON
  when the key is absent.

### Migration & default semantics
- **D-09:** Backfill scope — the migration copies the workspace-level `notifPrefs`
  object into a row for EVERY member of every workspace whose doc carries the field.
  Zero behavior change at switch-over; users diverge individually afterward.
  — **Reversibility:** one-way — undoing the migration would mean reconstructing
  workspace-level prefs from diverged per-user rows; the doc field is deleted in the
  same transaction (D-11).
- **D-10:** Table shape — one row per user per workspace: `(workspace_id, user_id,
  prefs JSON)`, keyed by user_id (accounts persist across workspaces). One SELECT per
  read, whole-object upsert on PUT.
- **D-11:** Backfill + strip doc — eligibility guard = doc contains `notifPrefs` AND
  some member lacks a row; the migration copies rows AND deletes the doc field in the
  same transaction. After that boot the doc is clean → guard false forever →
  byte-identical second boot, and later joiners read defaults instead of inheriting
  stale workspace prefs. Mirrors the `invites.team` last-reader discipline (Phase-28
  D-04). Pre-migration backup per the `migrateTeamMembership` recipe (no backup = no
  mutation).
- **D-12:** Merge-on-read, lazy rows — `getUserNotifPrefs` returns the D-27-5 defaults
  merged under the stored row for missing keys; users without rows read all-ON exactly
  like today's merge-on-read. A row exists only after the first PUT.

### Search leak fix mechanics
- **D-13:** Tokenized matching — keep the drop-if-references-hidden model, but match on
  word/token boundaries after normalization instead of raw substring: "Sara Corp" no
  longer collides with hidden "Sarah", while "sarah smith" still matches hidden
  "Sarah". Table-driven tests pin both directions (no leak, no false positive).
- **D-14:** Normalization — NFC normalize + `toLowerCase` on both hidden names and
  terms before tokenizing. Pinned cases: NFC vs NFD variants, accented names, case,
  surrounding punctuation. (Full Unicode casefold via Intl is out; `toLowerCase` is
  accepted.) No diacritic stripping — "Café" must not match "cafe".
- **D-15:** Recent searches stay workspace-wide (locked out-of-scope) — one test pins
  the list remains a single workspace-wide list so the choice reads as deliberate.
- **D-16:** Tests extend the existing search/redaction test file that pins
  `mergeRecentSearches` today; table rows = `{term, hiddenTerms, expected}` covering
  NFC/NFD variants, punctuation, token-boundary collisions, hidden/visible name
  collisions. Plus the CHANGELOG.md free-text limitation note (SEARCH-01).

### the agent's Discretion
- Exact route paths for the GET/PUT prefs endpoints.
- Exact accessor naming/signature (`getUserNotifPrefs` is a suggestion, not a contract).
- localStorage key naming and structure.
- Tokenization details (word-boundary regex vs splitting) as long as the table-driven
  pins pass.
- Which test file precisely hosts the SEARCH-01 table suite (the one pinning
  `mergeRecentSearches` today, or `test/scope.test.mjs` next to the MATRIX).
- Placement of the SETTINGS-03 `invoices` pin test.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §Phase 34 — Goal, Success Criteria 1-4 (guarded backfill,
  byte-identical second boot, one accessor, invoices pin, tokenized redaction)
- `.planning/REQUIREMENTS.md` §SETTINGS/§SEARCH — SETTINGS-01..03, SEARCH-01 text
- `.planning/REQUIREMENTS.md` §Out of Scope — "no per-user free-text search migration
  beyond the containment direction fix" (D-15's basis)
- `.planning/PROJECT.md` §Current Milestone v1.7 — SETTINGS/SEARCH feature summaries

### Prior-phase decisions (binding)
- `.planning/phases/32-team-derived-project-visibility/32-CONTEXT.md` — the post-VIS
  visibility semantics (`hiddenFor` single funnel, team-intersect helper) the search
  fix consumes; one-funnel invariant D-04's accessor pin mirrors
- `.planning/phases/33-membership-surface-hardening/33-CONTEXT.md` — D-02: additive
  migrations reserved for this phase's byte-identical-second-boot burden
- `.planning/STATE.md` §v1.7 Phase Order / milestone-wide invariants — 803-test
  baseline, additive migrations, i18n gate

### Code recipes (in-repo)
- `server.js` `migrateTeamMembership` (:1775) — the named migration recipe: row-level
  eligibility guard, pre-backup, `insert or ignore`, no-backup-no-mutation
- `server.js` `normalizeDoc` (:607) — home of the D-02 read strip (D-30 pattern)
- `server.js` `mergeClientDoc`/`mergeList` (:1039 area) — write-path strip target
- `server.js` `hiddenProjectTerms`/`referencesHidden`/`mergeRecentSearches`
  (:881/:891/:897) — the leak surface SEARCH-01 fixes
- `server.js` reminder gate (:1288) and `queueNotifEmails` (:1116) — consumers D-04
  reroutes through the accessor
- `src/pages/settings.js` notif sections (:367-391) — the 17 whitelisted keys
- `src/actions/actions.js` `npToggle` (:2676) — the client toggle D-07 branches
- `src/data/seed.js` (:513-514) — seed doc block D-06 removes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `migrateTeamMembership` (server.js:1775) — the byte-identical
  second-boot recipe to clone for `user_notif_prefs`
- `normalizeDoc` strip pattern (D-30 sessions/tfa) — the exact mechanism for the
  read-side strip
- D-27-5 default-ON merge (normalizeDoc:633) — becomes the accessor's default layer
- Existing search/redaction tests pinning `mergeRecentSearches` — home for the
  table-driven SEARCH-01 suite
- `test/migration.test.mjs` — home for the byte-identical-boot and invoices pins

### Established Patterns
- Authority in rows, document as display projection (TEAM-05/D-02) — prefs follow the
  same trajectory membership already took
- Strip-on-read for legacy doc fields (D-30) — stale data never resurrects
- One-funnel discipline (VIS/Phase 32) — one accessor, pinned by test
- Merge-on-read defaults (`=== false` disables) — preserved by D-12

### Integration Points
- Settings UI reads `d.notifPrefs` (src/pages/settings.js:167) — must read the new
  per-user prefs object instead
- `npToggle` writes `D().notifPrefs` + `save()` — branches per D-07
- Reminder gate + email dispatch read `doc?.data?.notifPrefs` — rerouted via accessor
- `redactDoc` recentSearches filter (server.js:936) and `mergeRecentSearches` — the
  call sites the tokenized matcher replaces

</code_context>

<specifics>
## Specific Ideas

- Zero behavior change at switch-over was the deciding factor for D-09: every member
  backfilled means nobody's notifications change the day the migration runs.
- The D-11 doc-field strip is what makes "byte-identical second boot" structurally
  true (guard flips false), not just tested — later joiners must NOT inherit stale
  workspace prefs.
- Tokenized matching (not in-place redaction): partial-mangled history looked worse
  than dropping; the false-positive collision ("Sara" vs "Sarah") was the concrete
  pain to fix.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 34-Per-User Settings Isolation & Search Leak Closure*
*Context gathered: 2026-11-03*
