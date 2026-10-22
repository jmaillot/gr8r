# Milestones

## v1.1 Multitenant (Shipped: 2026-10-22)

**Phases completed:** 4 phases, 7 plans, 10 tasks
**Requirements:** 8/8 validated (R1–R8) · **Audit:** `tech_debt` — no blockers
**Releases:** 1.1.0 (milestone), 1.1.1 (patch, the three revision fixes)
**Archive:** `milestones/v1.1-ROADMAP.md` · `milestones/v1.1-REQUIREMENTS.md` ·
`milestones/v1.1-MILESTONE-AUDIT.md` · `milestones/v1.1-phases/`

**Delivered:** a workspace is a real tenant. It has its own row, its own unique slug, its own
document and its own URL (`/w/:slug`); an account can belong to several workspaces with a role in
each; every API call is authorised against the caller's membership of that workspace; and a
private project is redacted on the server, so a member who is not on it receives no trace of it
and cannot write to it. Existing installs migrate in place with a backup, and the milestone ships
with a real test suite: 50 `node:test` cases and 6 Chromium tests against real `server.js`
processes and real SQLite databases, wired into CI.

**Key accomplishments:**

- A workspace is a row with a unique slug and its own document; the document is redacted on read
  and merged on write, so a redacted client cannot delete or rewrite what it cannot see.
- The membership table is the single source of truth for access. Roles, status, removal, leave,
  invites, the plan and workspace deletion all go through dedicated endpoints, and the roster is
  repaired on read rather than trusted from the document.
- The migration is proven against the exact pre-tenancy schema: one backup before any rewrite, the
  workspace derived from the old document, members and invites linked, and a byte-identical
  second boot.
- A Chromium suite boots its own throwaway server and proves two-tenant isolation and
  private-project invisibility in a real browser, and CI runs it as a required job.

**Found by the milestone audit and fixed in 1.1.1:**

- Three defects in one family: the workspace revision moved without the client being able to
  follow it, so the next write was rejected with `409` and dropped while the interface still
  announced it. The triggers were a role or plan change, an invite accepted in another session,
  and a restart. Each fix has a regression guard that fails without it — server, client and
  browser.

**Known gaps (deferred, tracked in the audit and in `PROJECT.md`):** the browser URL is
write-only, two routes and eight client exports have no caller, the invite-accept route has no
`sameOrigin` check, a guest profile can be spoofed by an admin, a link-only invite can carry the
admin role, the recent-search redaction is substring-based, and eight UI flows are still unproven
by an automated test.

---

## v1.0 Initial release (pre-milestone)

Single-workspace Gr8r Studio: dashboard, inbox, my tasks, projects with board / list / table /
calendar / timeline / files views, members, teams, activity and settings, served by a single
Docker image behind Traefik.
