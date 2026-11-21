---
phase: 83-governance-workspace-rename-slug-edit
discussed: 2026-11-20
status: decided
---

# Phase 83: Governance — Workspace Rename & Slug Edit - Context

**Gathered:** 2026-11-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Operators edit a workspace's name and slug from the /governance page —
server-side validation, collision refusal, keyed 5-locale errors, explicit
confirm on destructive slug change, old slug 404s with no redirect (D-82-5).
A dead-mapping warning section surfaces orphaned group mappings and
guard-refused audit rows per D-82-6. Parallel with Phases 80–82; the only
shared surface is the i18n key gate. Mapping EDITING remains deferred —
display-only warnings this phase.
</domain>

<decisions>
## Implementation Decisions

### Rename UX shape

- **D-01:** Row edit modal — an "Edit" action on each workspace row opens a
  small modal with Name + Slug fields, mirroring the existing govOrphanPick
  modal and confirmArchive/confirmDelete dialog patterns in governance.js.
- **D-02:** Per-row Edit action sits beside the existing
  govArchive/govUnarchive/govDeleteAsk row actions, operator-gated as today.
- **D-03:** Confirm ONLY when the slug actually changed; a name-only edit
  saves directly with a success toast. The confirm dialog body explicitly
  warns the old slug will 404 permanently (D-82-5, no redirect), old slug
  shown bold — same dialog style as the archive confirm. After save: refresh
  the table + success toast. No redirect of the operator's own view
  (on /governance there is nothing to redirect).

### Slug validation & API shape

- **D-04:** Reuse the workspace-creation slug rules verbatim: `sanitizeSlug`
  (2–40 lowercase letters/numbers/hyphens) and the same `invalidSlug` /
  `slugTaken` keyed refusals — no new vocabulary, no divergent behavior
  between creation and rename.
- **D-05:** New operator route `POST /api/auth/operator/workspaces/:id/rename`
  with `{name, slug}`, mirroring the archive/unarchive guard order exactly:
  sameOrigin FIRST (before body read/throttle), then requireUser, then
  operator-keyed throttle, then the operator gate BEFORE any target lookup
  (no existence oracle / leak), then target fetch. Stays inside the Phase 79
  operator family (D-10: user-facing /api/workspaces is never extended).
- **D-06:** Renames are audit-logged via a logInfo line, following the
  existing `workspace deleted (governance)` precedent — no audit_log row.
- **D-07:** Slug collision returns the existing `409 slugTaken` response
  including the suggestion payload (`uniqueSlug`); the modal offers the
  suggested available slug with one click to adopt.

### Dead-mapping warning section

- **D-08:** The warning section lists BOTH sources: (a) group_mappings rows
  whose workspace_id is gone (non-cascading FK orphans — boot-logWarn parity,
  D-82-6) and (b) guard-refused / dead-workspace rows from the Phase 82
  encoded audit trail (D-82-9 format `group_<delta>:group:<guid>:<reason>`,
  split on first colon for rendering). Deleted group GUIDs are NOT
  heuristically detected — claims-only semantics make staleness guessing
  unreliable; the section is honest about what the server can know.
- **D-09:** Derived on read: a `GET /api/auth/operator/dead-mappings` route
  queries orphaned mappings + recent trail rows on demand. No schema change,
  no boot-time snapshot (snapshot would go stale mid-session).
- **D-10:** Rendered as a top warning card above the workspaces table,
  operator-gated, hidden ENTIRELY when zero dead items (D-11 zero-rows
  vocabulary).
- **D-11:** Display-only — no mutation actions on dead mappings. Cleanup
  stays deferred with the mapping editor.

### i18n & test strategy

- **D-12:** All new keyed refusals ship with 5-locale translations in the
  SAME commit as the first emitting gate; refusal-code literals passed
  EXPLICITLY at the server.js call site (domains.js reverse-parity precedent);
  `data-a`/`data-r` count pins in test/i18n-toast.test.mjs updated in the
  same change.
- **D-13:** Server tests in a NEW `test/governance-rename.test.mjs` (rename
  route, dead-mappings route, slug rules); client-source assertions extend
  the existing `test/governance-client.test.mjs` — mirrors the Phase 79
  governance test split.
- **D-14:** No new e2e this phase — unit/fixture pins only; e2e green-suite
  coverage is Phase 84 work (BP-02 sequencing).
- **D-15:** Dedicated regression pin for D-82-5: after a rename, fetch the
  old slug URL and assert exact 404 with NO Location header — the SC easiest
  to violate with a "helpful" redirect. — **Reversibility:** reversible — test-only pin; the no-redirect contract itself is already owner-ratified (D-82-5) and unchangeable without a new ruling.

### Agent Discretion

- Exact modal markup/key naming (follow governance.js + govOrphanPick
  patterns; escape `label` at first render — the carried XSS watch-item).
- Dead-mappings trail lookback window (recent rows only — pick a sane bound).
- Throttle budget for the rename + dead-mappings routes (mirror archive
  route values unless a reason not to).
- Exact logInfo wording for the rename line (keep the
  `(governance)` convention with old→new slug visible).
- Whether archived workspaces are renameable (rows are fetched by id and
  stay actionable per the Pitfall 3 note — decide in planning, document).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & rulings
- .planning/REQUIREMENTS.md — GV-01..03; owner rulings D-82-1..6 (esp. D-82-5 old-slug 404, D-82-6 dead mappings)
- .planning/ROADMAP.md §Phase 83 — success criteria 1–4, "UI hint: yes"

### Prior phase decisions (binding)
- .planning/phases/82-removal-sync-guards-audit/82-CONTEXT.md — D-82-9 encoded
  action format (Phase 83 renders it, split on first colon), D-82-11 uniform
  delta trail, guard-refused rows surfaced in operator console
- .planning/phases/80-group-mapping-core-parser-resolver-overage-detection/80-CONTEXT.md —
  group_mappings schema, boot dead-mapping warning, label-is-opaque rule
  ("never rendered until Phase 83 — escaping happens there")

### Code anchors (re-verify line numbers)
- server.js:7084–7345 — Phase 79 operator workspace governance family
  (guard-order + throttle template for the rename route)
- server.js:7345–7400 — group-mappings save route (keyed refusal style, logSecurity heartbeat)
- server.js:9607–9622 — boot dead-mapping detection (source of truth for the orphan query)
- server.js:7460–7470 — workspace creation slug validation (sanitizeSlug, invalidSlug, slugTaken+suggestion to reuse)
- src/pages/governance.js — page structure, govQ filter, per-row actions
- src/actions/actions.js:4659–4741 — confirmArchive/confirmDelete dialog patterns (D-03 confirm style)
- test/governance-client.test.mjs — client-source assertion suite to extend
- test/i18n-toast.test.mjs:301,303 — data-a/data-r count pins to update

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- sanitizeSlug + wsBySlug + uniqueSlug — the full slug validation/collision
  stack already exists; rename just calls it with the current row excluded
  (self-collision check needed)
- Phase 79 operator route family — copy the guard order verbatim (Pitfall 22)
- govOrphanPick modal + confirmArchive dialogs — markup/confirm templates
- Phase 82 encoded audit rows — the trail source for the warning card
- Boot dead-mapping loop (server.js:9607) — the same orphan predicate,
  moved into the on-read route

### Established Patterns
- Keyed refusals with explicit literals at the call site (reverse-parity test)
- D-11 vocabulary: zero rows → exactly one "off" line, section hidden
- sameOrigin → requireUser → throttle → operator gate → target lookup
- logInfo `(governance)` convention for operator workspace mutations

### Integration Points
- i18n 5-locale files — new page.governance rename + warning keys
- test/dependencies.test.mjs invariant — zero new dependencies
- Phase 84 DEPLOY.md — old-slug policy documentation lands there

</code_context>

<specifics>
## Specific Ideas

- The load-bearing honesty rule: the warning card shows only what the server
  can actually KNOW (orphaned workspace_ids, guard-refused trail rows) —
  no heuristic guesses about deleted group GUIDs under snapshot-at-login.
- The 409-with-suggestion payload already exists from workspace creation;
  the modal should make adopting the suggested slug one click.

</specifics>

<deferred>
## Deferred Ideas

- Dead-mapping cleanup actions (delete orphaned rows) + full mapping editor
  UI — already deferred in REQUIREMENTS.md (future trigger documented)
- Deleted-group-GUID detection — needs Graph or claim-history heuristics;
  out of scope under zero-dependency + snapshot-at-login rulings
- Rename e2e spec — Phase 84 (BP-02 green-suite work)

</deferred>

---

*Phase: 83-governance-workspace-rename-slug-edit*
*Context gathered: 2026-11-20*
