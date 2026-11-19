---
phase: 78-creation-gate-instance-owner-identity
discussed: 2026-11-19
status: decided
---

# Phase 78 Context: Creation Gate & Instance-Owner Identity

<domain>
One boolean `WORKSPACE_CREATION=true|false` env gates `POST /api/workspaces`; when closed
(false), only instance operators (the existing `users.is_instance_admin` flag) may create
workspaces. Multi-operator support + console promote/demote replaces D-114's manual-DB-only
transfer. Rights-less users land on a standalone "await access" page with auto-poll entry.
</domain>

<spec_lock>
None — no SPEC.md for this phase.
</spec_lock>

<decisions>

## Env contract (WSG-01, WSG-03)

- **`WORKSPACE_CREATION=true|false`** — boolean tokens ONLY (user explicitly collapsed the
  roadmap's tri-state open|admins|owners to boolean; docs amended — see D-78-1).
- **Strict token matching:** only exactly `true` or `false` accepted. No aliases (no yes/no/on/off),
  no case tolerance beyond exact lowercase match. Anything else (typo, `''`, whitespace,
  `TRUE`) = **boot-refuse** with a clear startup error naming the variable and the two valid
  values.
- **Unset default = `false`** (fail-closed): an operator who upgrades without setting the var
  gets operator-only creation, never open creation. This inverts today's behavior — the
  upgrade note must call it out.
- Boot log line (D-11 style, alongside the existing door-matrix log): resolved value +
  effective gate meaning, e.g. `workspace creation: closed (operator-only)`.

## Gate semantics (WSG-02, WSG-04)

- `true` (open): any authenticated user may `POST /api/workspaces` — unchanged behavior.
- `false` (closed): **instance operators only** — `isInstanceAdmin(user)` (server.js:4838),
  NOT `hasAdminRole`. Workspace-level owner/admin roles do NOT pass (D-112: tenant-bound).
  This supersedes the current `ALLOW_SIGNUP`-derived coupling at server.js:6811.
- `ALLOW_SIGNUP` continues to govern **account signup only** (server.js:6758) — the two
  concerns are now fully decoupled.
- Rejected users get a keyed refusal (`operatorOnly` exists but a creation-specific key is
  cleaner — planner picks; must be new if reused semantics differ) rendered in all 5 locales
  in the SAME commit as the gate (WSG-11).
- Creator still becomes workspace `owner` in both modes (WSG-04 unchanged); admin promotion
  stays post-create via existing member UI.

## Instance operators (WSG-05, D-78-2)

- **Multiple operators allowed** — `is_instance_admin` flag no longer single-seat.
- Seeding unchanged: `stampInstanceAdmin()` (server.js:3542) still stamps `ADMIN_EMAIL` at
  boot when zero operators exist. The `--add-user` CLI does NOT auto-flag (owner decision:
  bootstrap + console management only).
- **Promote/demote lives in the existing operator console** (Settings, `operatorCard`,
  src/pages/settings.js:253) — the users list already renders the flag; add promote/demote
  actions via new operator-gated endpoints (pattern: GET/POST `/api/auth/operator/users/...`,
  `operatorOnly` gate, D-121 shape).
- **Last-operator protection:** demoting the final remaining operator is refused (keyed error,
  same pattern as workspace `needOwner` server.js:7121). Promote freely.
- **D-114 amended, not replaced:** the console is the sanctioned transfer mechanism; the
  documented manual DB update stays as a break-glass fallback in DEPLOY.md.

## Await-access experience (WSG-10)

- **Standalone page** after signup/login when the user has no workspace membership AND
  creation is closed for them: message "you need to be invited to a workspace to get access",
  sign-out button, no app shell.
- **Auto-poll to enter:** 15 s interval, **visible-tab only** (visibilitychange paused),
  stops when membership or rights appear; then normal app entry. Endpoint: reuse
  `GET /api/workspaces` or a lighter membership probe — planner picks.
- Create-button visibility elsewhere follows `/api/config`'s gate value + `/api/me`
  `isInstanceAdmin` (already exposed, server.js:939).
- `/api/config` change (WSG-03): `workspaceCreation` field becomes the boolean gate value
  (replacing `ALLOW_SIGNUP ? 'open' : 'admins'` at server.js:5020). Client consumers must
  be updated in the same commit.

</decisions>

<amendments>

## D-78-1: Tri-state collapsed to boolean (owner decision, supersedes ROADMAP/REQUIREMENTS text)

The roadmap's `WORKSPACE_CREATION=open|admins|owners` tri-state and REQUIREMENTS WSG-01
wording are superseded by this discussion: boolean `true|false`, closed = operator-only,
open = everyone. Because 'admins' and 'owners' modes both resolved to operator-only, the
tri-state had no distinct middle. WSG-01 must be rewritten (boolean), WSG-02's mode table
reduced to two rows, ROADMAP Phase 78 success criteria #1 adjusted. WSG-05's
"seeded from bootstrap admins + --add-user" narrows to bootstrap-stamp only (--add-user does
not flag).

## D-78-2: D-114 multi-operator amendment

D-114 ("no transfer mechanism, manual DB update") is amended: console promote/demote becomes
the sanctioned mechanism (with last-operator refusal); manual DB update documented as
break-glass fallback.

</amendments>

<canonical_refs>
- .planning/ROADMAP.md — Phase 78 section (success criteria; #1/#4 need D-78-1 adjustment)
- .planning/REQUIREMENTS.md — WSG-01..11 (WSG-01/02 amended per D-78-1)
- .planning/PROJECT.md — v3.1 Current Milestone section (standing constraints)
- server.js:4838 — isInstanceAdmin() (the gate primitive; D-112: DB flag only)
- server.js:3542 — stampInstanceAdmin() boot seeding
- server.js:6807-6832 — POST /api/workspaces current gate (the code being replaced)
- server.js:6758 — ALLOW_SIGNUP signup gate (stays, untouched scope)
- server.js:5015-5025 — /api/config workspaceCreation field (must change shape)
- server.js:939 — isInstanceAdmin in user payload (client ground truth)
- server.js:6685-6725 — operator console endpoints (D-121 pattern for new promote/demote)
- server.js:7121 — needOwner keyed refusal pattern (last-operator guard analog)
- src/pages/settings.js:253 — operatorCard() (promote/demote UI home)
- src/locales/*.json — 5 catalogues, ~1950 keys, parity-gated (new keys same commit)
- .planning/phases/75-domain-admission-core/75-RESEARCH.md — tri-state parse precedent
  (boot-frozen consts, loud log) — archived to milestones/v3.0-phases/75-domain-admission-core/
</canonical_refs>

<code_context>
- Existing operator endpoints + operatorCard give promote/demote nearly all its UI scaffold
- /api/me already carries isInstanceAdmin — client gating needs no new payload plumbing
- POST /api/workspaces refactor is small: replace one condition + keyed refusal
- Boot log pattern: server.js:8938-8952 (sessions line + door-matrix line) — add workspace
  creation line adjacent
- Audit-log table exists (server.js:418) — operator promote/demote should audit-log (Phase 79
  will require it for destructive workspace actions; establish pattern here)
- Client routing: await page slots into the post-auth flow where workspace-creation onboarding
  currently redirects (verify exact hook point at research)
</code_context>

<deferred>
- Workspace settings editing (rename/slug) from governance page — Phase 79 scope decision
- Approval queue (users request workspace, operator approves) — future milestone
- Per-workspace creation quotas — future milestone
</deferred>
