# Phase 44: Per-Member Timezones - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Per-member timezone resolution for the reminder/digest scheduler (Kanzo #14, TZ-01, v1.10): each member's morning window resolves from THEIR timezone — Paris (`Europe/Paris`) as the universal default — replacing the single workspace-TZ model where the first-membership row's `tz` provided one shared timezone (`workspaceTzLabel()`, `TZ_BY_LABEL`, five hard-coded GMT labels). A searchable combobox over the full IANA list replaces the five-label select in the member's own Settings > Date & time. Legacy stored labels resolve on read; no migration, no workspace-level timezone concept, no new runtime dependencies. NO retention sweep of old `reminders_sent` rows, NO admin-managed timezone surface, NO workspace default tz field, NO changes to the fire hour (08:00 local since quick task 261106-b46).

Note: roadmap SC wording says "their own 09:00" — stale; the actual window predicates use 08:00 since quick task 261106-b46. Fire hour follows the existing predicates unchanged.

</domain>

<decisions>
## Implementation Decisions

### Timezone picker (Settings > Date & time, member profile)
- **D-01:** The picker is a **searchable combobox over the full IANA zone list** — replaces the current 5-label `<select>` in `settings.js` case `datetime`. Largest UX option, explicitly chosen over curated lists and native selects. — **Reversibility:** reversible — a UI component swap; stored values remain IANA names regardless.
- **D-02:** Each option displays **IANA id + city label + live UTC offset** computed at render via `Intl.DateTimeFormat` (DST-safe; never cached/static offset labels).
- **D-03:** The zone list is a **bundled static JS array** of IANA ids + display names — no `Intl.supportedValuesOf` runtime enumeration, no dependency. Offsets are computed live (D-02), so a static list never goes stale on offsets.
- **D-04:** The combobox **preselects the browser-detected zone** (`Intl.DateTimeFormat().resolvedOptions().timeZone`) on render; nothing auto-saves — the value persists only on explicit save. If the browser zone is invalid, Paris default applies per D-07.

### Legacy label migration (the five `(GMT±xx) City` labels)
- **D-05:** **Resolve-on-read, no migration writes**: the five stored GMT labels map to their IANA equivalents (e.g. `(GMT+01:00) Berlin` → `Europe/Berlin`) inside the resolve funnel; the picker stops offering them. Satisfies SC-4 "migrate or degrade without loss" by reading, not rewriting — no doc revisions churned. — **Reversibility:** reversible — the alias map is additive; stored labels never change.
- **D-06:** Legacy handling lives in a **single resolve funnel** — one function owning legacy-label mapping + IANA validation + Paris fallback, used by every tz resolution site (mirrors the single-funnel pattern from visibility/settings work).
- **D-07:** Fallback is **`Europe/Paris` for every member without a valid tz** — empty string, unknown label, anything unresolvable. One deterministic rule; deliberately replaces the current UTC fallback. Pinned by test (empty → Paris, unknown → Paris).
- **D-08:** The full legacy map is **pinned by tests**: each of the 5 labels → expected IANA zone, plus the D-07 fallback edges — same test-pinned-contract style as Phases 41/42.

### Model: per-member only, no workspace tz
- **D-09:** **No workspace-level timezone concept anymore** — `workspaceTzLabel()` and the first-membership lookup are deleted; every scheduler resolution is per-member. Supersedes roadmap SC-4's "Workspace Settings > Date & time" wording: the picker lives in the **existing member-profile Settings > Date & time section** (`settings.js` case `datetime`), which is where the tz select already sits — no new page, no admin-managed surface. — **Reversibility:** one-way — removing the workspace-tz model deletes the resolution path prior phases' comments (D-27-1) describe; once shipped, per-member is the only semantics.
- **D-10:** **Server validates tz at save time**: the submitted value must be a valid IANA name (reject or coerce-to-Paris on invalid, at planner discretion). "Arbitrary IANA accepted" (SC-2) means any valid IANA name — never arbitrary strings stored in the doc.

### Exactly-once dedup under tz change (SC-3)
- **D-11:** Claims stay **keyed on (user, localDate-of-emission-time)**. Contract: changing a member's tz never re-fires an already-claimed reminder for the same localDate; if the new tz yields a *different* localDate, exactly one new claim fires legitimately ("re-window allowed"). No new ledger state, no per-real-day guard, no claim reset on change. — **Reversibility:** one-way — the ledger semantics are a published contract (Phase 27/37/38 tests pin `${ws.id}:${user_id}:digest:${localDate}` key shape); changing the key scheme would need re-pinning rationale.
- **D-12:** Semantics are **documented (D-notation comment at the claim key definition) and pinned by edge tests**: (a) fired in Paris, switch to Tokyo, same localDate → no refire; (b) switch yielding a different localDate → exactly one new claim.
- **D-13:** **No `reminders_sent` housekeeping this phase** — date-scoped keys make stale workspace-tz-era rows inert.
- **D-14:** The per-member refactor shape (per-recipient window predicate + `localParts` call inside the reminder/digest loops) is **left to research/planning** — only the semantics above are locked.

### the agent's Discretion
- Exact combobox component structure within the plain-ES-modules frontend (markup, keyboard handling, list rendering) within D-01's behavior.
- Reject-vs-coerce choice in D-10 save validation.
- Exact resolve-funnel naming/signature and call-site placement (D-06 semantics, not schema).
- Exact refactor shape of the scheduler loops (D-14).
- Whether zone display names in the static list get i18n treatment (EN+FR catalogue rules apply to any new user-facing string; `npm run i18n:scan` must stay green).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` § Phase 44 — goal + five success criteria (SC-3 dedup and SC-4 migration are test-pinned obligations; note the stale "09:00" wording — actual window is 08:00)
- `.planning/REQUIREMENTS.md` — TZ-01 to be added at milestone start (v1.10, Kanzo task #14); standing constraints section
- `.planning/STATE.md` § Quick Tasks — `261106-b46` moved the window 09:00 → 08:00 and re-pinned T09 fixtures (do not re-open)

### Prior-phase context
- `.planning/phases/42-one-click-unsubscribe-endpoint/42-CONTEXT.md` — test-pinned-contract style and D-notation discipline this phase follows
- `.planning/phases/40-digest-subject-task-lines/40-CONTEXT.md` — digest loop construction and `tFor()` server i18n pattern (relevant if digest copy ever mentions the member's tz)

### Implementation anchors (source of truth in code)
- `server.js` (~lines 1373–1414) — `TZ_BY_LABEL`, `localParts()`, `workspaceTzLabel()`, and the D-27-1/A1 comments describing the current first-membership model being replaced
- `server.js` § `runReminderPass` (~line 1417) — the shared pass computing one `localDate`/`hour` per workspace (~1442), reminder loop at `hour >= 8` (~1452), digest loop per-recipient (~1551); claim inserts at ~1508 and ~1593
- `server.js` (~line 336) — `reminders_sent` ledger table + index (dedup key shapes pinned by existing tests)
- `server.js` (~line 2668) — `memberProfile` seeding `tz: ''` (the empty value Paris must catch)
- `src/pages/settings.js` case `datetime` (~line 283) — the five-label `sel('tz', ...)` the combobox replaces

No external ADRs/specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `localParts(tzLabel, date)` (server.js ~1387): already resolves arbitrary zone ids through `Intl.DateTimeFormat` — per-member resolution reuses it as-is; only the label→zone step (TZ_BY_LABEL) changes into the resolve funnel.
- The injectable-clock scheduler test harness (Phase 27/37/38 fixtures, T09 re-pins) — new per-member and dedup-edge tests drive the same instant-driven pattern.
- `tFor()` shared i18n core — any new user-facing string (combobox labels, validation messages) goes through the EN+FR catalogue.

### Established Patterns
- Single-funnel helpers (`memberCanReadProject`, `hiddenFor`) — the tz resolve funnel follows the same one-choke-point discipline.
- Test-pinned contracts written as D-notation comments beside the code (Phases 41/42) — the dedup contract (D-12) ships the same way.
- Doc-channel member profile fields — `tz` already lives on `doc.data.members[*].tz`; zero migration.

### Integration Points
- Scheduler: both window-open predicates (`hour >= 8`) and both claim-insert sites become per-recipient.
- Settings page: case `datetime` select → combobox; save path goes through the member-profile update the page already uses.
- `reminders_sent` ledger: key shape unchanged (D-11) — digest key `${ws.id}:${r.user_id}:digest:${localDate}` with per-member `localDate`.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly chose the **searchable combobox** despite being the largest UX effort of the options offered — the picker experience is a first-class goal, not a nice-to-have.
- Paris as the universal default is deliberate (replacing the old UTC fallback), per the roadmap's Paris-default framing and Kanzo task #14.

</specifics>

<deferred>
## Deferred Ideas

- Retention/cleanup sweep for `reminders_sent` rows — inert today (D-13), belongs with any future ledger maintenance phase.
- Workspace-level default timezone inherited by new members — rejected for now (D-09); revisit only if members ask for admin-managed defaults.
- DST-shift edge display (e.g. warning when a zone changes offset) — not requested; the live-offset rendering (D-02) already keeps labels honest.

None of these came from scope creep — the discussion stayed within phase scope.

</deferred>

---

*Phase: 44-Per-Member Timezones*
*Context gathered: 2026-11-06*
