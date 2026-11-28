---
phase: 112-settings-unification-client-only
plan: 01
subsystem: settings-ui
tags: [perm-t, design-language, i18n, settings, R-14, R-17]
requires: [Phase 111 (backup-console detailing — pin baseline 635/94/64/86)]
provides: [6 settings data lists on the perm-t design language, settings.* col-header key set]
affects: [UAT visual pass, i18n key-count chains]
tech-stack:
  added: []
  patterns: [perm-t table + overflow-x panel + named th row (mappings.js:86 recipe)]
key-files:
  created: []
  modified:
    - src/pages/settings.js
    - src/locales/en.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/fr.json
    - src/locales/nl.json
decisions:
  - D-112-A: min-width:880 only on the 6-column API-keys table; all other tables (4-col sessions, 4-col members, 4-col projects ×2, 3-col push/tfa) omit it, each with a one-line comment (109 narrow-table precedent)
  - D-112-B: Members + Projects ship WITHOUT a When column — d.members is the workspace-doc profile array (no joined field) and project doc rows carry no served When; the joinedAt-bearing /api/workspaces/:slug/members feed is NOT consumed here (never a payload extension, zero-server-delta ruling)
  - D-112-C: Role header reuses modal.role ("Role" — already the member-edit modal's wording, truthful, in-reach namespace); no page.* cross-page borrowing (W4 lesson)
  - D-112-D: Status column: projects show esc(p.status) faint badge (both sections); members show the invited amber badge only, nothing for active (picked "nothing" per plan's one-or-the-other ruling — no new key)
metrics:
  duration: ~35 min
  completed: 2026-11-29
status: complete
estimate:
  tokens: 80000
actuals:
  tokens: ~48000
  tasks: 2
  commits: 2
plan_head_before: 9ea74684
plan_head_after: 4bfa5979
commits: 2
---

# Phase 112 Plan 01: Settings Unification (Client Only) Summary

All 6 settings data lists (sessions, API keys, projects active+archived, push devices, TFA factors, members) converted from srow cards / mini cards to the v3.7/v3.8 perm-t design language — client-only, zero server diff — with every preference/toggle row kept on srow (R-17).

## What Was Done

**Task 1 (tracer) — commit 86333561:**
- Sessions srow cards → 4-column perm-t (Device / IP / Last seen / gutter). D-19 (no location column) and D-25 (`ago(s.lastSeenAt || s.createdAt)`, '—' fallback) verbatim. `data-a="revokeSession"` one-for-one. min-width deliberately omitted (one-line comment). Keyed empty state added (`settings.sessions.noSessions`).
- API keys srow cards → 6-column perm-t (Key / Scope / Workspace / Expires / Last used / gutter), `min-width:880px`. Inline-confirm trio (`apiKeyRevokeAsk` → `apiKeyRevokeConfirm` + `apiKeyCancel`) preserved byte-exact; settings-client pins (c) :56–58 green with NO re-alignment needed (they pin data-a idiom presence, not srow shape). Purge pair (:96–101 pins) untouched — action bar, not a data list. Badge vocabulary (revoked/expired amber) moved onto the Key row.

**Task 2 (expansion) — commit 4bfa5979:**
- Projects: active + archived srows → two perm-t tables, same column set (Project / Teams / Status / gutter); `data-a="go" data-r="project"`, `restoreProject`, `delProject` one-for-one; keyed empty states kept.
- Push devices: deviceRows srows → perm-t (Device / Registered / gutter); `pushTest`/`pushUnsub` one-for-one with exact `data-id="${esc(dev.endpoint)}"`; master-enable + toggle srows KEPT as srow (R-17).
- TFA factors: factor srows → perm-t (Factor / Last step / gutter); `f.lastStep > 0 ? ago(f.lastStep * 30 * 1000) : '—'` verbatim; `tfaAskRemove` one-for-one; master row + all staged forms untouched (D-56).
- Members: `div.mini` cards → perm-t (Member / Role / Status / gutter); `data-ctx="member" data-id` moved onto the `<tr>` so the context menu keeps working; role pillbtn logic (admin-editable `pop` / static crown) verbatim; ctxBtn + a11y label preserved.
- New settings.* keys ×5 locales in each commit (×5 parity green).

## Members / Projects When-Omission (required documentation)

Both lists ship WITHOUT a When column, verified at plan time and unchanged at execution:
- **Members:** `d.members` is the workspace-doc profile array (id/name/email/role/status/title/tz) — NO joined field. The `joinedAt`-bearing `/api/workspaces/:slug/members` payload is a different feed the settings section does not consume. Never a payload extension (standing zero-server-delta ruling).
- **Projects:** project doc rows carry no served When field; omitted rather than invented.

## Pin Deltas (D-12)

All four pins net-zero across both commits — every action survived one-for-one:

| Pin | Before (post-111) | After |
|-----|-----|-----|
| data-a (i18n-shell:349) | 635 | 635 |
| data-v (:350) | 94 | 94 |
| data-r (:351) | 64 | 64 |
| verbs (i18n-core-features:171) | 86 | 86 |

**No pin re-alignment or annotation was needed** — verified with greps at both commits. settings-client literal regex pins :56–58 and :96–101 all green without edits (they pin the data-a idiom, which moved shape but not string).

## New Keys vs Budget

**12 new settings.* keys** (plan budget ~2–4/phase, research A7 ceiling ≤8 — **overage declared**):
`settings.colDevice`, `settings.colIp`, `settings.colKey`, `settings.colProject`, `settings.colTeams`, `settings.colStatus`, `settings.colMember`, `settings.sessions.colLastSeen`, `settings.sessions.noSessions`, `settings.notif.colRegistered`, `settings.tfa.colFactor`, `settings.tfa.colLastStep`.

**Rationale:** the plan mandates 6 tables × 2–5 named headers each = ~22 header slots; only 5 slots reused existing truthful settings.*/modal.* wordings (`settings.apikeys.scope/workspace/expires/lastUsed`, `modal.role`); no page.* borrowing allowed (W4). Header-key families are shared (colDevice serves sessions+push; colStatus serves projects+members), keeping the set at 12 rather than ~17. settings namespace: 238 → 250 keys ×5 parity.

## Deviations from Plan

**1. [Rule 1 - Bug] API-keys empty-state dedup**
- **Found during:** Task 1 — introducing a table-with-empty-branch would have duplicated the pre-existing gated `settings.apikeys.empty` hint line below it.
- **Fix:** new table block renders table-only (`rows.length ? table : ''`); the existing gated hint remains the sole keyed empty state.
- **Files modified:** src/pages/settings.js — **Commit:** 86333561

None otherwise — plan executed as written.

## Verification Results

| Gate | Result |
|------|--------|
| settings-client + i18n-shell + i18n-core-features (+ i18n-pages, Task 2) | pass 70 / fail 0 |
| `git status --porcelain -- server.js src/core/api.js` | empty — zero server/API diff |
| i18n:scan | 0 literals / 0 pending / 0 stale / 0 dead |
| Full suite | 2836 tests, **fail 2** — exactly the documented baseline (french-typography, webhook-routes GET list); one earlier run showed fail 3, the third being the documented scheduler/load-flake contention family (allowed band [2,3]) |
| 500 kB lazy-chunk gate (vite build) | green — largest chunk index 374.85 kB; settings chunk 41.56 kB |
| settings-tz / settings-tz-combobox / notif-i18n / governance-client / browser-push / i18n-scan | pass 134 / fail 0 |

## Commits

- 86333561 feat(112-01): sessions + API keys → perm-t design language (tracer batch)
- 4bfa5979 feat(112-01): projects/push devices/tfa factors/members → perm-t (expansion batch)

## Self-Check: PASSED

- settings.js: 6 perm-t tables confirmed by grep (sessions :870, apikeys :833, members :432, projects :467/:493, push :571, tfa :697).
- Commits verified in `git log 9ea74684..HEAD`.
- Locale ×5 parity: 2384 keys per file (fr 2423 incl. apostrophe variants), scan clean.
