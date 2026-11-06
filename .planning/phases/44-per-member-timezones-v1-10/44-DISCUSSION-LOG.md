# Phase 44: Per-Member Timezones - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 44-Per-Member Timezones (v1.10)
**Areas discussed:** Picker contents & UX, Legacy label migration, Default & fallback semantics, Dedup under tz change

---

## Picker contents & UX

| Option | Description | Selected |
|--------|-------------|----------|
| Curated list + free input | ~30-40 common zones stored as IANA names plus text input | |
| Full IANA dropdown | Native select with ~600 entries | |
| Searchable combobox | Searchable combobox over the full IANA list | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| City + live offset | IANA id + localized city + live UTC offset via Intl | ✓ |
| City only | IANA id and city, no offset | |
| Grouped by offset | Zones grouped by UTC offset (DST-misleading) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled static list | Static JS array of IANA ids + names, offsets computed live | ✓ |
| Runtime enumeration | Intl.supportedValuesOf('timeZone') per browser | |
| Hybrid | Shortlist default, runtime enumeration fallback | |

| Option | Description | Selected |
|--------|-------------|----------|
| Preselect browser zone | Browser-detected zone preselected; Paris default server-side | ✓ |
| Always Paris | Paris preselected regardless | |
| Browser zone, never auto-save | Browser zone first visit only; empty stays empty | |

**User's choice:** Searchable combobox, city + live offset, bundled static list, preselect browser zone.
**Notes:** User accepted the largest-UX-effort option explicitly — picker experience is a first-class goal.

---

## Legacy label migration

| Option | Description | Selected |
|--------|-------------|----------|
| Resolve-on-read map | 5 legacy labels mapped to IANA equivalents at read; no writes | ✓ |
| One-time doc rewrite | Migration pass rewriting members[*].tz in workspace docs | |
| Degrade to fallback | Legacy labels hit fallback (silent zone shift — data loss) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Single resolve funnel | Legacy map + IANA validation + fallback in one choke point | ✓ |
| Two separate paths | Legacy map and new validation path as separate functions | |

| Option | Description | Selected |
|--------|-------------|----------|
| Show resolved, no forced save | UI shows effective zone; stored label untouched until re-pick | ✓ |
| Auto-upgrade on view | Silently persist IANA equivalent on page load | |
| Ignore legacy in UI | Combobox shows Paris for unrecognized stored values | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pin the full map | Tests pin each legacy label → zone plus fallback edges | ✓ |
| Pin fallbacks only | Only empty/unknown → Paris pinned | |
| You decide | Test granularity at planning time | |

**User's choice:** Resolve-on-read, single funnel, show-resolved-no-forced-save, full map pinned.
**Notes:** None.

---

## Default & fallback semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Paris for everyone unset | Empty/unknown/unset → Europe/Paris, one rule (replaces UTC fallback) | ✓ |
| Two-tier fallback | Existing members keep workspace tz during transition | |
| Member → workspace → Paris | Adds workspace default field (extra scope) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-member only | workspaceTzLabel()/first-membership lookup deleted; no workspace tz concept | ✓ |
| Workspace default + override | Workspace-level default tz field with per-member override | |

| Option | Description | Selected |
|--------|-------------|----------|
| Existing member section | Picker stays in member's Settings > Date & time (existing tz select slot) | ✓ |
| Admin-managed surface | Owner/Admin sets each member's tz (scope creep) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Validate on save | Server validates IANA name at save; reject or coerce on invalid | ✓ |
| Store-as-is, resolve defensively | Store any string; sanitize at resolve time | |

**User's choice:** Paris-for-everyone-unset, per-member only, existing member section, validate on save.
**Notes:** Per-member-only supersedes roadmap SC-4's "Workspace Settings > Date & time" wording — the picker stays in the existing member-profile datetime section.

---

## Dedup under tz change

| Option | Description | Selected |
|--------|-------------|----------|
| localDate-keyed, re-window allowed | Claims keyed on (user, localDate); same localDate never re-fires; different localDate fires once | ✓ |
| One-per-real-day guard | Extra suppression marker guaranteeing one notification per real day | |
| Reset claims on change | Invalidate member's claims on tz change (violates SC-3) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Comment + edge tests | D-notation comment at claim key + Paris→Tokyo edge tests | ✓ |
| Comment only | Document without new tests | |

| Option | Description | Selected |
|--------|-------------|----------|
| No cleanup this phase | Stale date-scoped rows inert; no retention sweep | ✓ |
| Retention sweep | Add row cleanup to the pass (extra scope) | |

| Option | Description | Selected |
|--------|-------------|----------|
| You decide refactor shape | Per-member loop semantics locked; exact refactor left to research/planning | ✓ |
| Lock the refactor now | Pre-decide function boundaries now | |

**User's choice:** localDate-keyed re-window, comment + edge tests, no cleanup, refactor shape at planning.
**Notes:** None.

---

## the agent's Discretion

- Combobox component structure within plain-ES-modules frontend (D-01 behavior only).
- Reject-vs-coerce choice in save validation (D-10).
- Resolve-funnel naming/signature and call-site placement (D-06 semantics).
- Exact scheduler refactor shape (D-14).
- i18n treatment of zone display names (EN+FR gate applies).

## Deferred Ideas

- Retention sweep for `reminders_sent` rows — future ledger maintenance.
- Workspace-level default timezone inherited by new members — rejected (D-09), revisit on demand.
- DST-shift edge display/warnings — not requested; live-offset rendering keeps labels honest.

## Agent notes

- Roadmap SC "09:00" wording is stale: quick task 261106-b46 (2026-11-06, commit aea0cb6) moved the window to 08:00. Fire hour follows existing predicates — not re-opened in discussion.
