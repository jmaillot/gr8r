# Feature Research — v3.4 "UX Polish & Backup Console Refinement"

**Domain:** Self-hosted admin console UX refinement (governance roster, backup console, settings, digest email)
**Researched:** 2026-11-23
**Confidence:** HIGH for pattern conventions (well-established in Proxmox/Portainer/Grafana/GitHub-class consoles); MEDIUM for complexity estimates (gr8r-specific code touch points not yet mapped)
**Scope guard:** Everything below maps 1:1 to the owner's v3.4 target-feature list in PROJECT.md. No invented scope.

## Feature Landscape

### Table Stakes (Users Expect These)

These are the baseline behaviors of any well-crafted self-hosted admin console. Missing them is what made v3.3 surfaces feel rough ("tables honnêtes", "naming parlant" in the owner's words).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Role-tabbed roster, one row per user with cumulative role badges | Every governance surface (GitHub org roles, Grafana RBAC, Portainer) shows one user → many roles as a single roster with badges, never one list per role; tab-by-role is a *view filter*, not three separate rosters | LOW–MEDIUM | `instance_roles` already exists (v3.3); this is mostly a UI re-shape of existing data. Per-grant blocking stays as-is. Tabs = filter over the single roster; badge column = aggregate of a user's active grants |
| Rename « Super Admins & Roles » → « Instance Roles » | Console surfaces are named after the concept (roles), not an enumeration of one role | LOW | i18n key swap across 5 locales + e2e assertion update; standing EN+FR gate applies |
| Editable role-grant dialog with working searchable user picker | The Grant dialog search being broken is a bug, and the Edit-teams picker (v3.2) already proves the pattern in-app — users expect the same picker everywhere | LOW | Reuse the v3.2 searchable multi-add picker component; broken search is a defect fix, not a new feature |
| Unified job-run history table with filters (task, status, date) | Every backup console (Proxmox PBS, restic前面 UIs, Jenkins build history) offers ONE cross-job run table; forcing operators to visit N task pages to answer "what ran last night?" fails basic operability | MEDIUM | **Depends on run-row fields existing**: each run row must carry task_id, scope, status, started/finished, trigger (schedule vs manual). Verify current per-task history rows have these; enrich if not. Filters = status + task + trigger, client-side over the fetched window is enough at this scale |
| Schedule builder pre-filled with current cron | Round-trip editing is the norm; asking users to re-enter a schedule to change one field is a known frustration | LOW–MEDIUM | Builder presets already exist (v3.3); pre-fill = parse current cron back into the 5-field preset subset. Restrict to the supported subset, show raw cron fallback for anything outside it |
| Humanized schedule display (« Every Monday at 00:00 ») | Raw cron is operator-speak; consoles like Kubernetes CronJob UIs and PM2 all render humanized text beside the raw expression | LOW | Pure display function over the 5-field cron subset; new i18n keys ×5 locales. Do NOT attempt general cron-English libraries (zero-dependency constraint) — the subset makes a hand-rolled formatter trivial |
| Next run + Last run (status) columns on the task table | Operators scan a task table to answer "is it healthy, when does it fire next?" — Proxmox/Jenkins/Argo all show exactly these two columns | MEDIUM | Next run = existing cron computation (DST-safe matrix already shipped in v3.3); Last run = latest row from run history. Status coloring reuses failure/success/overlap states incl. `skipped_overlap` |
| Names (workspace/project) instead of ids in backup lists | Showing internal ids in a table is universally read as unfinished UI | LOW | Join/lookup at render; watch for deleted workspace/project fallback ("(deleted)" label) |
| Archive filenames + UI labels carrying scope + GFS bucket marker | The de-facto convention (Borg/restic/Proxmox PBS): `<scope>-<name>-<bucket>-<timestamp>` — e.g. `ws-acme-monthly-20261123T0000.tar.gz`. Bucket marker (daily/weekly/monthly/yearly) is what makes the GFS rotation auditable from a directory listing | MEDIUM | Touches export/backup.js naming AND UI labels. **Known landmine**: `export/backup.js:666` logo junk-name quirk documented in v3.3 deferred items — naming refactor must not reawaken the `[object Promise]/` debris class of bug. Only GFS-rotated runs carry a bucket marker; manual Run-now archives get NO bucket tag (they're under no retention — see hint below) |
| Run-now hint « manual archives are under no retention » | Surprise-deletion (or surprise-immortality) of archives is the #1 backup-UX complaint; stating the retention consequence at the action site is table stakes for honesty | LOW | Static hint on the Run now affordance; ties to the existing `task_id NULL / no retention` semantics |
| Cross-workspace visibility of all workspaces in Backup/Restore pickers for operators | v3.3 granted operators the *right*; v3.4 makes it *usable* — pickers must list every workspace or the right is theoretical | LOW | Picker data source swap gated on Super-Admin/Backup-Op/Restore-Op role; scope strictly to Backup/Restore pickers (owner's exact wording), not a global visibility change |
| Revocable-key list purge (API Keys) | Revoked keys lingering forever in a personal keys list reads as clutter and a mild security smell; GitHub/Stripe-style consoles separate or purge revoked keys | LOW | Gr8r already stores hashes and marks revocation; purge = delete revoked-key rows (or auto-expire). Recommend explicit per-row purge or "purge all revoked" button — never silent auto-purge, since the list is also the audit surface |
| My Access column/icon-view polish + Workspace URL on one line | Layout defects are pure table stakes — fix, don't design | LOW | CSS/viewport fixes; mobile columns-button precedent exists (v2.3/v3.2 sweeps) |
| Teams picker in Invite Member → Edit Teams | Same picker consistency expectation as the Grant dialog | LOW | Reuse the same v3.2 component — third consumer of it; this validates making it a shared component |

### Differentiators (Where gr8r Can Punch Above Its Weight)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Humanized schedules in BOTH directions (build → cron and cron → text) | Most consoles only render cron→text; a builder that round-trips losslessly on its own subset is a genuine polish point | MEDIUM | Feasible precisely because v3.3 restricted to a 5-field subset. Anything outside the subset: show raw cron read-only |
| GFS bucket marker visible in archive listings (kept-until badges, extended) | v3.3 shipped kept-until badges; extending the same vocabulary into filenames + unified history makes the rotation legible end-to-end — rare even in commercial consoles | MEDIUM | Builds directly on existing rotation-deletion preview + kept-until badges; incremental, not new machinery |
| Pinned digest test harness for the dedup fix | "Investigation + fix with test épinglé" — a regression pin proving one-recipient-one-email is a differentiator of engineering honesty (gr8r house style: regression pins on every advisory fix) | MEDIUM | See digest analysis below |

### Anti-Features (Tempting, But Out of Scope — With Rationale)

| Feature | Why Tempting | Why Problematic | What the Owner Asked Instead |
|---------|--------------|-----------------|------------------------------|
| General-purpose cron parser/DSL for schedules | "Humanize ANY cron" | Zero-dependency constraint + the 5-field subset is a deliberate v3.3 boundary; a general parser drags in edge semantics (ranges, steps, lists) | Humanize the existing subset; raw-cron fallback for the rest |
| Retention rules for manual Run-now archives | "Consistency" | The owner explicitly ruled manuals are under NO retention (`task_id NULL`); adding retention contradicts a shipped invariant | Keep manuals retention-free; surface that fact as the Run-now hint |
| Auto-deleting revoked API keys on a timer | "Less clutter" | Silent deletion of security-relevant rows; the list is the audit surface | Explicit purge affordance (per-key or bulk-revoked), user-triggered |
| Global operator visibility across all app surfaces (not just backup pickers) | "Simpler mental model" | Contradicts gr8r's strict isolation invariant (`hiddenFor` redaction funnel); owner scoped it to Backup/Restore pickers ONLY | Picker-scoped data source change only |
| Digest dedup via dedup keys on the SMTP layer | "Industry standard fix" | The bug is 4× delivery to the SAME recipient — likely a fan-out/enrollment bug in gr8r's own digest scheduler, not an SMTP retry issue. Symptom must be root-caused before choosing the mechanism | Owner asked for investigation + fix + pinned test; mechanism choice belongs to the phase's discuss/plan |
| Editable unified history rows / re-run from history | "Jenkins parity" | Adds write paths to what the owner framed as a read table with filters | Read-only unified history + existing per-task Run now |

## The Digest 4× Bug — Pattern Analysis (item 6 of the question)

Owner's report: same recipient receives the daily digest 4 times. Established patterns for digest dedup:

1. **Idempotency key per (recipient, digest period)** — the canonical fix per outbox-pattern literature (morling.dev, ByteByteGo, outbox-pattern write-ups): the send claim carries `UNIQUE(recipient_id, digest_date)` or equivalent, enforced by the database, not by application memory. gr8r's `email_outbox` (v2.4 webhook/email machinery, claim-once with backoff) already has claim semantics — the bug is more likely in *enrollment* (the recipient being added 4× to the fan-out list) than in delivery.
2. **Distinct-recipient fan-out** — dedup at list construction (`Set` of recipient ids) before any outbox insert; this matches gr8r's established `notifyMembers` duplicate-row-refresh precedent (v2.2 D-11 ruling: refresh in place, never re-send).
3. **Likely root causes to investigate in phase research** (hypotheses only, not findings): recipient enrolled once per workspace instead of once per account (multi-membership fan-out — a user in 4 workspaces receiving 4 digests would produce exactly 4×), a loop over teams duplicating membership rows, or a retry without claim.
4. **The pinned test** should assert: a recipient with N workspace memberships receives exactly one digest row. That single assertion covers the most probable cause class.

**Confidence:** MEDIUM — root cause not yet investigated; the pattern literature is HIGH confidence, gr8r's specific enrollment path is not.

## Feature Dependencies

```
Searchable user picker (shared component, v3.2)
    └──reused-by──> Role-tab roster Grant dialog
    └──reused-by──> Invite Member > Edit Teams picker

Unified run-history table
    └──requires──> Run rows carrying task_id / trigger / status / scope fields
    └──enhances──> Last run column on task table (same data source)

Schedule builder pre-fill
    └──requires──> cron→preset parser (subset)
    └──same-parser──> Humanized schedule display (cron→text)

GFS bucket marker in filenames
    └──requires──> run row knowing its GFS bucket (exists via rotation, v3.3)
    └──enhances──> kept-until badges / unified history legibility

Run-now "no retention" hint
    └──requires──> nothing new (existing task_id NULL semantics)

Cross-workspace backup pickers
    └──requires──> operator role check (exists, v3.3 hasInstanceRole)

Digest dedup fix
    └──requires──> root-cause investigation FIRST (phase-level research flag)
```

### Dependency Notes

- **Unified history requires run-row fields:** if per-task history rows lack `trigger` (schedule vs manual) or a stable `task_id`, the unified table can't filter honestly — enrich rows before/with building the table, in that order.
- **Builder pre-fill and humanized display share one parser:** build the cron-subset parser once, consume it twice; doing them in the same phase avoids two divergent cron interpretations.
- **Picker refactor groups naturally:** Grant dialog + Invite/Edit-Teams are the same shared component's second and third consumers — one phase candidate.
- **Naming (filenames) conflicts with nothing** but must respect the backup.js:666 landmine; it also feeds UI labels, so filename + label keys land together (i18n gate).

## MVP Definition (milestone-shaped: "launch" = v3.4 ship gate)

### Ship With (v3.4 core)

- [ ] Role-tabbed roster with cumulative badges + rename to « Instance Roles » — the governance surface the owner named first
- [ ] Working searchable picker in Grant dialog (+ Edit Teams) — broken search is a defect
- [ ] Unified run-history table with task/status/trigger filters — the console's biggest honesty gap
- [ ] Next run + Last run columns; humanized schedule display; pre-filled schedule editor
- [ ] Names instead of ids in backup tables
- [ ] Archive filename scope + GFS marker (with the backup.js:666 landmine guarded)
- [ ] Run-now "no retention" hint
- [ ] Cross-workspace operator pickers (Backup/Restore only)
- [ ] Digest 4× fix with pinned regression test
- [ ] Settings polish: My Access view, API-key revoked purge, one-line Workspace URL

### Add After Validation (deferred candidates, none committed by owner)

- [ ] Bulk purge affordance for revoked keys — trigger: list grows annoying
- [ ] History retention window controls — trigger: table volume makes client-side filtering insufficient

### Explicitly Not In This Milestone

- [ ] Anything retention-related for manual archives (invariant: none)
- [ ] General cron DSL, global operator visibility, webhook test-family debt (carried separately from v3.3 deferred items)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Digest 4× fix (root-caused + pinned test) | HIGH | MEDIUM (investigation-bound) | P1 — correctness bug |
| Unified run history + filters | HIGH | MEDIUM | P1 |
| Role-tab roster + picker fix + rename | HIGH | LOW–MEDIUM | P1 |
| Schedule: pre-fill + humanized + Next/Last run | HIGH | MEDIUM | P1 |
| Archive naming (scope + GFS) | MEDIUM–HIGH | MEDIUM (landmine risk) | P1 |
| Operator cross-workspace pickers | MEDIUM | LOW | P2 |
| API-key revoked purge | MEDIUM | LOW | P2 |
| Settings polish (My Access, URL one-line) | MEDIUM | LOW | P2 |
| Run-now retention hint | MEDIUM | LOW | P2 |

**Priority key:** P1 = owner-named, ship-gate; P2 = owner-named polish, same milestone, lower blast radius.

## Competitor Feature Analysis (pattern sources, not feature parity targets)

| Pattern | Reference consoles | gr8r's approach |
|---------|--------------------|------------------|
| Role rosters with badges | GitHub org roles, Grafana RBAC members view | Single roster + tabs as filters, badges aggregate grants |
| Unified job history | Proxmox PBS datastores/jobs view, Jenkins build history | Cross-task table, filters on task/status/trigger |
| Schedule display | Kubernetes CronJob UIs (humanized + raw cron side by side) | Humanized text over the 5-field subset, raw cron fallback |
| Archive naming | Borg/restic (`scope-timestamp` convention), PBS (`host-bucket-time`) | `scope-name-bucket-timestamp` + UI labels matching |
| Key lists | GitHub PATs / Stripe API keys (revoked separated or purgeable) | Explicit purge, no silent auto-delete |
| Digest dedup | Outbox + idempotency-key literature (morling.dev, ByteByteGo) | DB-enforced uniqueness at enrollment or claim; root cause first |

## Sources

- Proxmox Backup Server UI conventions (job tables, GFS bucket semantics) — general knowledge, HIGH
- Borg/restic archive naming conventions (timestamp-in-name, scope prefix) — borgbase docs, HIGH
- Outbox + idempotency-key dedup patterns — morling.dev "On Idempotency Keys", ByteByteGo delivery-semantics guide, emailverifier.dev outbox article, HIGH
- gr8r v3.3 shipped record + known gaps (`export/backup.js:666`, `task_id NULL` manual semantics) — PROJECT.md, HIGH
- Digest enrollment paths in gr8r (multi-membership fan-out hypothesis) — MEDIUM, unverified, flagged for phase research

---
*Feature research for: gr8r v3.4 UX Polish & Backup Console Refinement*
*Researched: 2026-11-23*
