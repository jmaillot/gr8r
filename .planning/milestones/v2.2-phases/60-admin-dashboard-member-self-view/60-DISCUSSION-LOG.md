# Phase 60: Admin Dashboard & Member Self-View - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-13
**Phase:** 60-admin-dashboard-member-self-view
**Areas discussed:** Dashboard placement & shape, Data & freshness, Workload & drill-down, Member self-view UX

---

## Dashboard placement & shape

| Option | Description | Selected |
|--------|-------------|----------|
| New admin page + route | Dedicated admin-only page at own route, separate nav entry | ✓ |
| Admin sections on overview | Extend existing overview page with admin-only sections | |
| Inside Members page | Extend members page where Phase 52 expander lives | |

**User's choice:** New admin page + route
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Four panels, single screen | Overdue / Load / Upcoming / Activity as panels in one grid, no tabs | ✓ |
| Urgency-first asymmetric grid | Urgent columns prioritized top row | |
| Collapsible sections | Panels collapse; hides the at-a-glance overview | |

**User's choice:** Four panels, single screen
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar entry, admin-only | New sidebar nav item, admin-only visibility | ✓ |
| Palette / icon only | Ctrl-K G-shortcut / header icon, no permanent slot | |

**User's choice:** Sidebar entry, admin-only
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton then fill | Loading skeletons per panel, fill as payload arrives | ✓ |
| Block until loaded | Full-page spinner | |
| Stale-while-revalidate | Cached data + background refresh | |

**User's choice:** Skeleton then fill
**Notes:** —

---

## Data & freshness

| Option | Description | Selected |
|--------|-------------|----------|
| One aggregate endpoint | Single admin-gated endpoint, one gate, DASH-04 in one place | ✓ |
| Endpoint per section | Panels fetch independently | |

**User's choice:** One aggregate endpoint
**Notes:** DASH-04 forces server-side computation (redacted doc can't see private projects).

| Option | Description | Selected |
|--------|-------------|----------|
| On-load only | Fetch on page open, no polling | |
| On-load + interval poll | Refetch on timer while tab open, 30s rhythm | ✓ |
| On-load + focus refetch | Refetch on visibility change | |

**User's choice:** On-load + interval poll
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed windows, no controls | Last N activity entries, fixed 7-day upcoming | |
| Fixed + activity depth control | Adjustable entry count on activity | |
| Adjustable ranges | Date-range pickers on time panels | ✓ |

**User's choice:** Adjustable ranges → narrowed in follow-up
**Notes:** Follow-up pinned it: overdue fixed by definition, upcoming fixed today..+7d, ACTIVITY panel gets preset window selector 24h / 7d / 30d (default 7d).

---

## Workload & drill-down

| Option | Description | Selected |
|--------|-------------|----------|
| Open tasks only | Load = open tasks, assignees[] per member | ✓ |
| All assigned tasks | Includes done tasks (historical contribution) | |

**User's choice:** Open tasks only
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Overdue rows, load = numbers | Overdue panel = clickable rows; load = counts (+ optional overdue badge) | ✓ |
| Expandable member rows | Phase 52-style expanders per member | |
| Numbers only, no lists | Pure aggregates | |

**User's choice:** Overdue rows, load = numbers
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Deep-link everything | Task rows → /w/:slug/task/:key; projects and activity link too | ✓ |
| Projects only | Only group headers link | |
| Static | Nothing clickable | |

**User's choice:** Deep-link everything
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Most-urgent first | Overdue by oldest dueDate; load by count desc; upcoming by dueDate asc | ✓ |
| By project name | Alphabetical, stable | |

**User's choice:** Most-urgent first
**Notes:** —

---

## Member self-view UX

| Option | Description | Selected |
|--------|-------------|----------|
| Settings section | Settings › My access, any member reaches it | ✓ |
| Own route + nav entry | Dedicated member route | |
| Members page self-expander | Self expander on own members row | |

**User's choice:** Settings section
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Same codes as admin view | Phase 52 coarse reason codes verbatim, same i18n labels | ✓ |
| First-person wording | Softer member-facing wording, separate label set | |

**User's choice:** Same codes as admin view
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Grant type, no granter name | "Individual grant" without granter identity; team name OK | ✓ |
| Code only, minimal | Just the reason code | |
| Include granter name | Rejected — leaks other members' access info (TRN-02 spirit) | |

**User's choice:** Grant type, no granter name
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| List like admin view | Flat project + reason list, Phase 52 visual language | ✓ |
| Grouped by reason | Grouped headings per reason code | |
| Table with scope columns | More detail than admin view shows | |

**User's choice:** List like admin view
**Notes:** —

---

## the agent's Discretion

- Exact endpoint/route paths and payload shapes (within Phase 52/57 route style)
- Self-view endpoint placement (/api/me shape vs workspace self variant)
- Skeleton/panel markup and CSS
- Poll timer lifecycle mechanics
- i18n key naming (EN+FR gate stays green)
- Activity verb/date rendering details (Phase 9 rules)
- Whether load panel carries the overdue badge

## Deferred Ideas

None — discussion stayed within phase scope. (TRN-03 owner-facing named grants is already a REQUIREMENTS.md future requirement; NOTIF-TRIM is Phase 61.)
