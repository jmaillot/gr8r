# Phase 34: Per-User Settings Isolation & Search Leak Closure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-03
**Phase:** 34-per-user-settings-isolation-search-leak-closure
**Areas discussed:** Prefs transport & API shape, Local-mode prefs home, Migration & default semantics, Search leak fix mechanics

---

## Prefs transport & API shape

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated routes | New GET/PUT endpoints owned by the authenticated user; client keeps per-user prefs in its own store slot; server strips doc field both directions | ✓ |
| Piggyback on doc | Server injects user prefs into document payload at redactDoc time, relocates at merge time | |
| You decide | Planner and researcher weigh in | |

**User's choice:** Dedicated routes (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Strip both directions | normalizeDoc deletes notifPrefs on read (D-30 pattern), mergeClientDoc strips on write; stale client copy dropped | ✓ |
| Strip reads only | Only strip on read; writes tolerated but ignored | |

**User's choice:** Strip both directions (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Whitelist keys | Only UI-rendered pref keys accepted, coerced to boolean | ✓ |
| Free-form JSON | Store whatever object the client sends | |

**User's choice:** Whitelist keys (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| One accessor, pinned | Single getUserNotifPrefs is the only reader; pinned by test | ✓ |
| Direct queries per consumer | Each consumer queries the table directly | |

**User's choice:** One accessor, pinned (Recommended)
**Notes:** —

## Local-mode prefs home

| Option | Description | Selected |
|--------|-------------|----------|
| localStorage | Local workspaces store per-user prefs in localStorage, keyed per workspace; same whitelist/defaults | ✓ |
| Keep in doc for local | Only API mode migrates to rows; local keeps doc field | |
| You decide | Planner decides from local storage layer | |

**User's choice:** localStorage (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Remove from seed | Seed notifPrefs block deleted; fresh local workspace starts from D-27-5 defaults | ✓ |
| Keep + one-time migrate | Seed keeps block; local migrates once into localStorage | |

**User's choice:** Remove from seed (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Branch in npToggle | api.enabled → PUT /prefs; else → localStorage + re-render | ✓ |
| New prefsService module | Abstract both backends behind a module | |

**User's choice:** Branch in npToggle (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Pin local behavior | Test pins reload survival, workspace scoping, D-27-5 defaults | ✓ |
| No dedicated tests | Local mode rides existing UI coverage | |

**User's choice:** Pin local behavior (Recommended)
**Notes:** —

## Migration & default semantics

| Option | Description | Selected |
|--------|-------------|----------|
| All members | Copy workspace prefs into a row for every member; zero change at switch-over | ✓ |
| Only active users | No signal to distinguish — collapses into all members | |

**User's choice:** All members (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Row-per-user, JSON | (workspace_id, user_id, prefs JSON), keyed by user_id; one SELECT read, whole-object upsert | ✓ |
| Row-per-pref | One row per (user, key, value) | |

**User's choice:** Row-per-user, JSON (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Merge-on-read, lazy rows | Accessor merges D-27-5 defaults under stored row; rows only on first PUT | ✓ |
| Eager rows for everyone | Migration creates rows for all; accessor reads literally | |

**User's choice:** Merge-on-read, lazy rows (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill + strip doc | Guard = doc has notifPrefs AND a member lacks a row; rows copied AND doc field deleted in one transaction; byte-identical boots after | ✓ |
| Backfill only, keep doc field | Doc field left on disk; guard never settles | |

**User's choice:** Backfill + strip doc (Recommended)
**Notes:** Mirrors invites.team last-reader discipline (Phase-28 D-04).

## Search leak fix mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Tokenized matching | Keep drop-if-references-hidden model; match on word/token boundaries after normalization; table-driven tests both directions | ✓ |
| Redact in place | Redact hidden name portion from stored term | |
| You decide | Planner decides mechanics | |

**User's choice:** Tokenized matching (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| NFC + toLowerCase | NFC normalize + toLowerCase both sides; pinned NFC/NFD, accents, case, punctuation | ✓ |
| Add diacritic folding | Also strip combining marks — "Café" would match "cafe" | |

**User's choice:** NFC + toLowerCase (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Pin workspace-wide | Test pins recentSearches stays a single workspace-wide list | ✓ |
| Rely on docs only | REQUIREMENTS.md out-of-scope section is enough | |

**User's choice:** Pin workspace-wide (Recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing file | Table-driven suite in the file pinning mergeRecentSearches today (or scope.test.mjs next to MATRIX) | ✓ |
| New dedicated file | e.g. test/search-redaction.test.mjs | |

**User's choice:** Extend existing file (Recommended)
**Notes:** —

## the agent's Discretion

- Exact route paths for GET/PUT prefs endpoints
- Exact accessor naming/signature (getUserNotifPrefs is a suggestion)
- localStorage key naming and structure
- Tokenization details (regex vs splitting) as long as table pins pass
- Which test file hosts the SEARCH-01 table suite
- Placement of the SETTINGS-03 invoices pin test

## Deferred Ideas

None — discussion stayed within phase scope.
