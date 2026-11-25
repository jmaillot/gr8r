---
phase: 95-settings-polish-cross-workspace-pickers-project-overwrite-re
plan: 02
subsystem: settings (server routes + client surfaces)
tags: [set-01, set-02, set-03, d-07, d-08, d-09, d-10, d-13, my-access, purge]
requires: [membershipsOf (frozen, read-only call), /me/visibility funnel (copied verbatim), apiKeyRevoke 2-click idiom, pIcon/pColor client normalization]
provides: [GET /api/settings/my-access, POST /api/keys/purge-revoked, api.myAccess(), api.purgeRevokedKeys(), A.apiKeyPurgeAsk/Confirm, settings.apikeys purge locale keys ×5]
affects: [95-03 (pending plan rides the same settings surfaces)]
tech-stack:
  added: []
  patterns: [visibility-funnel copy per workspace (additive-fields posture), value-free audit event (count-only target_name), gated 2-click purge (rows.some(revokedAt)), nowrap+ellipsis+title URL row]
key-files:
  created: []
  modified: [server.js, src/core/api.js, src/pages/settings.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/self-visibility.test.mjs, test/mcp.test.mjs, test/settings-client.test.mjs, test/xws-gate.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs]
decisions:
  - "Role badge reuses the existing common.role.* catalogue keys (composed t() prefix) — no new roleBadge key; zero catalogue churn for the grid"
  - "settings.apikeys purge locale keys land in the Task-3 commit (the emitting markup), not Task-1 — the live dead-key gate requires key+usage in one commit"
  - "Purge route path /api/keys/purge-revoked (researcher suggestion adopted); guard chain sameOrigin → requireUser → tooMany(5/15min) never reordered"
  - "membershipsOf call-site pin extended by ONE read-only caller (the aggregate); the body pin still proves the super-access union intact"
actuals:
  tokens: 95000
  tasks: 3
  commits: 4
plan_head_before: 11f7d370
plan_head_after: 6d0d3711
commits: 4
status: complete
---

# Phase 95 Plan 02: Settings Polish — My Access Grid, Key Purge, Single-Line URL Summary

**One-liner:** Cross-workspace My Access card grid (D-07/D-08) over a new aggregate route, the honest revoked-key purge with a count-only audit event (D-09/D-10), and the one-line Workspace URL with title tooltip (D-13) — `/me/visibility` byte-untouched, membershipsOf widened by zero.

## What Was Built

- **server.js** — `GET /api/settings/my-access`: requireUser aggregate over `membershipsOf(user.id)` (read-only caller); per workspace the visibility funnel is copied VERBATIM from `/me/visibility` (superOwner union, memberCanReadProject walk, `projectAccessReason ?? 'member'`, single-teamName block); entries `{id, name, reason[, teamName], icon?, color?, role}` — icon/color/role are additive display fields, raw icon/color left to the client's PCOLORS normalization; empty workspaces omitted. `POST /api/keys/purge-revoked`: sameOrigin → requireUser → `tooMany('keypurge|'+uid, 5, 15min)` → single delete of `revoked_at IS NOT NULL` rows of the caller → ONE audit event (`api_key_purged`, target_name = removed count, no key values/labels/hashes/prefixes) → `{ removed }`.
- **src/core/api.js** — `myAccess()`, `purgeRevokedKeys()` one-line wrappers.
- **src/pages/settings.js** — my-access renders the D-07 read-only card grid: one group per workspace (`esc(w.name)` subtitle), one card per project (pIcon with the project's own icon/color, D-08 role badge from `common.role.*`, vis-reason badge), no click/action handlers; loading/err/empty branches kept. API-keys purge button rendered only when `rows.some(k => k.revokedAt)`, 2-click ask→confirm, toast `{n} keys removed`. Workspace URL: nowrap + hidden overflow + ellipsis on the field wrapper, full URL in the `title` attribute — no marquee (D-13).
- **src/actions/actions.js** — `A.apiKeyPurgeAsk/Confirm` cloned from the revoke idiom; `A.apiKeyCancel` also clears the purge stage.
- **i18n ×5** — `settings.apikeys.purge`, `purgeConfirmBody`, `purgedToast` (CLDR one/other plural) added and used in the same commit.
- **Tests** — self-visibility: 5 aggregate cases (empty-group hidden via a seeded second workspace ws_alpha, additive field ride-through, funnel rejections absent, zero-memberships 200 `{workspaces:[]}`, 401); mcp: purge semantics (only revoked rows removed, active survive, exactly one value-free audit event per purge, removed:0 path, 6th call 429); settings-client: 95-01 anchors re-pinned + new D-07/D-09/D-13 slices; byte-count pins bumped (data-a 621, api verbs 80, membershipsOf call sites +1).

## Tasks

| Task | Type | Commit |
|------|------|--------|
| 1. Server — my-access aggregate + purge route | auto | 76c4c7ad |
| 2. Route behavior tests (aggregate shape + purge semantics) | auto (tdd) | d5c07b52 |
| 3. Client — card grid, purge button, single-line URL | auto | 6ea1717b |
| 3b. Byte-count pin bumps (data-a, api verbs) | test | 6d0d3711 |

## Deviations from Plan

**[Rule 1 - Pin update] xws-gate membershipsOf call-site pin extended by the aggregate's read-only caller**
- **Found during:** Task 1
- **Issue:** The 95-01 grep gate pins the EXACT call-site set (declaration + 2 consumers); the plan's aggregate adds a legitimate 4th.
- **Fix:** Pin extended with `const rows = await membershipsOf(user.id);` + comment; the function body pin (frozen union) untouched and green.
- **Files modified:** test/xws-gate.test.mjs
- **Commit:** 76c4c7ad

**[Rule 3 - Blocking] Locale keys moved from Task 1 to the Task 3 commit**
- **Found during:** Task 1 verify
- **Issue:** The plan put the `settings.apikeys.*` keys in Task 1's commit, but the live-tree dead-key gate (`test/i18n-scan.test.mjs` "scanner exits 0 on the live tree") requires keys to be USED in the same commit — the emitting markup is Task 3.
- **Fix:** Task 1 committed server-only (no locale churn); the three keys landed in Task 3's commit alongside the markup using them. Honors the harder "keys added+used in ONE commit" project rule.
- **Commit:** 6ea1717b

**[Rule 1 - Pin update] Byte-count pins bumped for the new markup/call sites**
- **Found during:** Full-suite verification
- **Issue:** i18n-shell/i18n-toast pin data-a sites (618 → 621: apiKeyPurgeAsk + apiKeyPurgeConfirm + the armed branch's apiKeyCancel escape) and i18n-core-features pins api.js call sites (78 → 80: myAccess + purgeRevokedKeys).
- **Fix:** Counts bumped with same-commit annotation comments (house precedent).
- **Files modified:** test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs
- **Commit:** 6d0d3711

## Verification

- `node --test test/self-visibility.test.mjs test/i18n-scan.test.mjs test/xws-gate.test.mjs` → 54 pass / 0 fail
- `node --test test/self-visibility.test.mjs test/mcp.test.mjs` → 58 pass / 0 fail
- `node --test test/settings-client.test.mjs test/i18n-scan.test.mjs` → 51 pass / 0 fail
- `npm run build` → exit 0 (i18n-scan gate; index chunk 364 kB < 500 kB gate)
- `npm test` → 2485 tests, 2457 pass, 3 fail = the 2 known pre-existing failures (D-05 fr-typography, D-06 webhook-routes) + the documented v3.3 scheduler-overlap load-flake (passes standalone — re-verified twice in isolation; fails only under full-suite load)
- `git diff` across the plan shows ZERO hunks inside the existing `/me/visibility` handler (server.js additions are one new block only)

## Known Stubs

None.

## Threat Flags

None — T-95-03/04/05/06 all mitigated and pinned by route tests (funnel rejections absent from the aggregate; audit row value-free; 6th purge call 429; additive display fields only).

## Self-Check: PASSED
