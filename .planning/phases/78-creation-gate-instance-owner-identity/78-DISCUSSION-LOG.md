---
phase: 78-creation-gate-instance-owner-identity
discussed: 2026-11-19
mode: default (all 4 areas selected)
---

# Phase 78 Discussion Log

## Pre-discussion findings (scout)

- `users.is_instance_admin` already exists (D-112/D-113/D-114, phase 22 OPREV): DB flag,
  sole instance tier, stamped from ADMIN_EMAIL at boot, no transfer mechanism (manual DB
  update documented).
- Operator console (settings.js operatorCard) already lists all users with the flag and
  session-revoke actions (D-121 endpoint pattern).
- POST /api/workspaces gate at server.js:6811 couples to ALLOW_SIGNUP.
- hasAdminRole = owner/admin of any workspace (derived) — NOT used for the new gate.

## Area 1: Invalid env semantics

- Q: invalid WORKSPACE_CREATION value at boot? → **Boot-refuse** (fail-closed posture).
- Q: boolean-style aliases accepted? → **Strict tokens only** (no aliases).

## Area 2: Owner management UX

- Q: where does promote/demote live? → **Extend operator console** (existing users list).
  Phase 79 governance page stays separate.

## Area 3: Role mapping per mode

- User asked "owner is the highest level right?" → laid out the two-layer role model
  (instance operator flag vs workspace membership roles vs derived hasAdminRole).
- Q: who passes in 'admins' mode? → **Operator only** (user's typed answer).
- Q: who passes in 'owners' mode? → **Operator only** (recommended option chosen).
- Consequence surfaced: admins ≡ owners — tri-state has no distinct middle.
- Q: keep tri-state for future or collapse? → **Collapse to open/closed** (user decision).
- Flagged as scope amendment (contradicts ratified roadmap text); user chose
  **Amend docs to boolean**.
- Q: token style? → **true|false** (matches user's original WORKSPACE_ADD_ENABLED instinct).
- Q: unset default + invalid handling? → **Boot-refuse + default false** (fail-closed;
  upgrade behavior change acknowledged).

## Area 4: Await-access experience

- Q: what does a rights-less user see? → **Standalone page** (no app shell).
- Q: how do they exit the await state? → **Auto-poll to enter**.
- Q: poll cadence? → **15 s visible-only** (visibilitychange paused).
- Q: D-114 supersede or keep manual fallback? → **UI + keep manual fallback** (break-glass).

## Scope amendments made (owner-approved)

- D-78-1: tri-state → boolean env contract; REQUIREMENTS WSG-01/02 rewritten; ROADMAP Phase 78
  success criteria 1/2/5 + Phase 79 criteria 4 adjusted; PROJECT.md target features updated;
  WSG-05 seeding narrowed (bootstrap stamp only, --add-user does not flag); WSG-06 moved to
  Phase 78's console UI (Phase 79 links/relocates).
- D-78-2: multi-operator + console transfer sanctioned; D-114 manual update retained as
  break-glass fallback.

## Deferred ideas

- Workspace settings editing (rename/slug) from governance page — Phase 79 scope decision
- Approval queue (users request workspace, operator approves) — future milestone
- Per-workspace creation quotas — future milestone
