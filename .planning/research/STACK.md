# Technology Stack — Milestone v3.4 UX Polish & Backup Console Refinement

**Project:** Projects Studio (gr8r) — milestone v3.4
**Researched:** 2026-11-23
**Mode:** Ecosystem/feasibility, grounded in the actual codebase
**Overall confidence:** HIGH — every claim cites a repo file verified this session

## Verdict: ZERO new dependencies. Existing idioms cover every v3.4 need.

`package.json` dependencies today: `@office-kit/xlsx 0.27.0`, `pg ^8.23.1`, `web-push 4.0.0` (dev: eslint, prettier, playwright, vite, lucide, globals). v3.4 adds **nothing** to either list. All five target features are UI composition or a bug fix on existing send-path machinery.

## 1. Role-tabbed governance roster + tabs/seg idiom (no new code pattern needed)

The tab idiom already exists in two flavors, both wired through the single `data-a` action-delegation + `S.ui.*` staged-state architecture:

| Flavor | Precedent (verified) | Mechanism |
|--------|---------------------|-----------|
| `.seg` with `aria-pressed` | `src/pages/governance.js:91-96` (`govSeg`), `:135-146` (`govSuperSeg` — **already a seg-staged roles view**: `segV === 'roles' ? rolesCard() : ...`) | `data-a="govSeg" data-v="…"` handler sets `S.ui.govSegV`; render function re-branches on state |
| `.tabs` with `role="tablist"`/`role="tab"` + `aria-selected` | `src/pages/inbox.js:45`, `src/features/archive.js:40-46`, `src/overlays/modals.js:377-387` | Same: `data-a="set" data-k="inboxCat" data-v="…"` → `S.ui` key → re-render |

**Integration points for v3.4:**
- Instance Roles tabs: the `govSuperSeg` seg at `src/pages/governance.js:135-146` is literally a staged selector between an admins roster and a roles card. Role tabs (Super Admin / Backup Op / Restore Op) are the same one-level-deeper pattern: a new `S.ui.govRolesSeg`-style key, `data-a` handler in `src/actions/actions.js`, filter/branch in `src/pages/governance.js`. Roster rows with cumulative badges reuse the `wsRow`/`srow` row idioms (`src/pages/governance.js:51-66`, imported `srow` from `src/pages/settings.js:25`).
- Honest filtered run-history table: clone `govFiltered()` (`src/pages/governance.js:41-49`) — staged `S.ui` filter state + a pure client filter over the `GET /api/backup/runs` payload (`src/pages/backup.js:17,109-119`; newest-first is already the server's). The `data-in` debounced-search input idiom is `govQ` at `src/pages/governance.js:113`.

## 2. Reusable selectable user/team picker — clone, don't abstract prematurely

Two proven lazy-chunk picker chunks already exist; both follow the DELIV-02 lazy-modal pattern (bytes leave the entry chunk via dynamic import, `S.ui.<x>Mod` module cache, handlers stay in `src/actions/actions.js`):

| Picker | File | Draft state | ARIA contract |
|--------|------|-------------|---------------|
| Team multi-add | `src/features/team-pick.js` (84-02) | `S.ui.teamPick = { surface, draft[], q, hl }` | `role="combobox"` input + `role="listbox"`/`role="option"` + `aria-selected` (`team-pick.js:28,41,46`); chip row with `data-a="teamPickToggle"` removal (`:31-38`) |
| Assignee multi-add | `src/features/assignee-pick.js` (55-04) | `S.ui.assigneePick = { taskId, draft[], q }` | `role="checkbox"`/`aria-checked` per candidate (`:45`), cap alert (`:38`) |

**v3.4 approach:** the "user picker sélectionnable style Edit-team" is a **third sibling** of these two — same draft-in-`S.ui`, chip row, `foldForSearch` accent-insensitive filter (`src/core/utils.js`, imported by both pickers), same handler naming family (`userPickOpen/Toggle/Apply/…` in `src/actions/actions.js`). Keyboard contract comes free via the `pk._flat` mechanism in `src/actions/keyboard.js` (`team-pick.js:10-13` documents it, `settings.js:226` precedent).

**Do NOT** build a generic `createPicker()` abstraction this milestone — two existing siblings prove copy-with-tweaks is the house style (both files carry explicit "Clone of…" headers). Generalization can come later if a fourth picker appears.

**Grant-dialog search fix:** the broken search in the Grant dialog is a bug in existing `src/actions/actions.js` handlers (search filter/`IN.*` input wiring), not a missing capability — same fix surface, zero deps.

**Cross-workspace pickers** (operators see all workspaces): these read operator payloads (`refreshInstanceRoles`/`refreshOperatorUsers` already imported at `src/pages/governance.js:26`; the Super-Admin promote-search precedent from v3.3 already lists instance users). The candidate *source* changes; the picker mechanics do not. Server payload is the authority per the D-23/T-85-06 doctrine documented at `src/pages/backup.js:15-26`.

## 3. Cron humanization — server-side, riding `export/cron.js`

`export/cron.js` already exists at repo root (Phase 87): a full hand-rolled 5-field parser (`parseField` char-class whitelist, `parseCron` → normalized field Sets, `nextRunAt` with fresh-`Intl.DateTimeFormat` DST discipline). Zero dependencies by design (header lines 11-13).

**Critical constraint (verified in the file header, lines 8-10):** *"never under src/ — the prohibition test fails the moment a src/ module reaches this file."* The client therefore **cannot import** the parser.

**Recommended approach:** a display-only `describeCron(cron, locale)` helper **server-side**, colocated with `export/cron.js`'s grammar, that emits the humanized string added to each task row of the `GET /api/backup/tasks` payload (e.g. `scheduleLabel: "Every Monday at 00:00"`). This matches two standing doctrines:
- D-23/T-85-06 (`src/pages/backup.js:15-26`): the client renders payload fields *verbatim*, never derives.
- Pitfall 6 / D-01 (`src/pages/backup.js:27-30`, `src/actions/actions.js:5007-5010`): "NO client cron evaluation… no second cron parser."

Note the locale nuance: i18n keys must go through the 5-locale catalogues (`src/locales/*.json`) with the server-side `tFor()` used by the digest (`mailer.js:850-889` precedent) — or, simpler, the server emits a structured descriptor (`{ freq: 'weekly', dow: 1, hour: 0 }`) and the **client** renders it through `t('page.backup.scheduleWeekly', …)` keys. The descriptor variant is preferred: it keeps humanization text in the normal client i18n gate (`scripts/i18n-scan.mjs`) and respects the same-commit 5-locale rule, while the *parsing* stays server-side. Either way: no dependency, no second client parser — the client maps a tiny enum to a catalogue key.

## 4. Email digest duplicate-send fix — existing machinery is the fix surface

The exactly-once design is already two-layered (verified `server.js:2780-2925`):
1. **Semantic claim:** `insert or ignore into reminders_sent` with `dedup_key = ${ws.id}:${r.user_id}:digest:${localDate}` (`server.js:2862-2866`) — exactly-once per (workspace, user, localDate).
2. **Transport claim:** one `email_outbox` row with `dedup_key = digest:${ws.id}:${r.user_id}:${localDate}`, `insert or ignore`, inside the same tx (`server.js:2887-2891`); drained post-commit by the Phase 68 delivery engine (`server.js:3347-3379`), 5-attempt retry then 7-day purge.

**Stack implication: none.** The fix is investigation *within* this path. Strongest hypothesis from the code shape: **the claim is per-workspace** — a recipient who is a digest opt-in member of N workspaces receives N digest emails/day (each legitimately claimed). If the member belongs to ~4 workspaces (or the same user appears under multiple `member_id`s — e.g. duplicate memberships or a `user_id` shared across member rows in the `memberships⋈users` join at `server.js:2815-2817`), the subject/frame reads identically → perceived "same digest 4×". The test the milestone pins should discriminate: multi-workspace copy vs. a true double-claim. Investigation surface: `server.js:2815-2925` (producer), `server.js:3377+` + `mailer.js:846-895,1227` (delivery + `sendDigest`). No schema change needed unless the ruling is "one digest per user per day across workspaces" — which would be a content decision (aggregation), not a stack change.

## 5. Backup console refinements — payload + existing table idioms

- Edit pre-filled with current cron: the builder already restores via `backupTaskFormDefaults` + `cronDirty` semantics (`src/actions/actions.js:5030,5046,5121,5150-5152`) — pre-fill means seeding `form.fields` from the task's parsed cron **server-side descriptor** (same §3 mechanism), never client-parsing the raw string.
- Next run / Last run columns: `next_run_at` is already a persisted column per `export/cron.js:6-7`; the tasks/runs payloads already carry it. Render with `fmtDate` (`src/pages/backup.js:35` import).
- Names instead of ids in the run history: if runs span workspaces, the `GET /api/backup/runs` payload must carry `workspaceName`/`projectName` server-side (client store only knows the current doc — D-23 doctrine). Small server payload change, no dep.
- GFS-labeled archive names: naming lives in `export/backup.js` (archive filename construction) + the `export/cron.js`-derived daily/weekly/monthly/yearly GFS tier already computed at rotation time (v3.3 shipped GFS 7/4/12/5). Label-only change.

## What NOT to add (confirmed)

| Temptation | Ruling | Why |
|------------|--------|-----|
| Tab/picker framework (e.g. a web-component lib) | NO | Both idioms exist and are battle-tested across ≥8 surfaces (grep evidence: inbox, archive, modals, palette, home, my-tasks, projects, governance) |
| Cron parser library (cronstrue, later.js…) | NO | Violates the zero-dep standing constraint AND the "no second cron parser" pitfall discipline (`backup.js:27-30`); humanization = enum→i18n-key mapping |
| Generic picker abstraction this milestone | NO | House style is documented clones (`team-pick.js:1-2`, `assignee-pick.js:1-2`); generalize only on a 4th picker |
| Client-side cron import/eval | NO | `export/cron.js` is prohibition-test-gated away from `src/`; client renders payload fields verbatim |
| Digest queue/worker library | NO | The two-layer claim + outbox engine already provides exactly-once; the bug is inside that design, not a missing capability |

## Installation

```bash
# Nothing to install. package.json unchanged for v3.4.
```

## Sources

All claims verified against the working tree this session:
- `package.json` (dependency inventory, 3.2.0)
- `src/pages/governance.js` (seg idiom :91-96/:135-146, filter idiom :41-49, row idiom :51-66)
- `src/pages/inbox.js:45`, `src/features/archive.js:40-46`, `src/overlays/modals.js:377-387` (tabs idiom)
- `src/features/team-pick.js`, `src/features/assignee-pick.js` (picker clones, ARIA, lazy-chunk pattern)
- `src/actions/actions.js:5007-5194` (cron builder, cronDirty), `src/actions/keyboard.js` (pk._flat)
- `export/cron.js` (parser, root-placement prohibition, DST discipline)
- `src/pages/backup.js:1-119` (payload-verbatim doctrine, no-client-cron discipline)
- `server.js:2780-2925` (digest producer claims), `server.js:3347-3379` (outbox delivery engine), `mailer.js:846-895` (sendDigest, tFor locale)
