# Phase 61: Notification Trim - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning — gated on the in-session audit + ruling collection (D-05) that precedes plan-phase

<domain>
## Phase Boundary

The notification surface shrinks by owner ruling, not guess: (1) NOTIF-01 — a fresh notification audit doc rebuilt from current code produces trim recommendations (suppression candidates and burst candidates) for the owner to rule on; (2) NOTIF-02 — the owner applies a validated trim ruling from the Settings surface in one click, landing in `user_notif_prefs` so the owner stops receiving that class; (3) NOTIF-03 — rapid successive notifications on the same task coalesce at inbox render so the inbox shows a burst summary instead of flooding. Phase 38 suppression + no-double-send invariants pass unmodified (standing constraint). No workspace-wide suppression semantics, no digest overhaul, no new notification types.

</domain>

<decisions>
## Implementation Decisions

### Audit home & ruling flow (NOTIF-01, D-05 gate)
- **D-01:** The audit is a **fresh doc rebuilt from current code** (line citations re-verified against today's `server.js`/`src/`), written to `docs/notification-audit.md` as a Phase 61 deliverable. The Phase 39 audit content (deleted in owner cleanup `b16010f`; recoverable at commit `85785a2`) is **input, not gospel** — every row re-derived, push rows now reflect the live Phase 59 channel.
- **D-02:** D-05 rulings are collected **by the agent in a dedicated in-session ruling presentation** (table-by-table), immediately after this context discussion and **before `/gsd-plan-phase 61` runs** — no placeholder trims in plans. The agent records each ruling into the doc's Status cells (`validated`/`rejected` + `validated-by` + date) and mirrors one line per ruling to `.planning/STATE.md` → Recent Decisions, per the Phase 39 D-05 convention.

### Audit content & scope (NOTIF-01)
- **D-03:** **Full type × channel × default matrix** re-audited — email, push (now live per Phase 59), inbox — same table shape as Phase 39.
- **D-04:** Dead pref keys (`mention_ws`, `assign_self`, `assign_status`, `assign_over`) are presented **individually for per-key ruling**: trim-to-default vs full removal (push_due Phase 37 precedent for full removal).
- **D-05:** The audit produces **burst candidates** (burst-prone classes such as comment storms, reminder stacks) feeding NOTIF-03's design; the owner rules which classes coalesce.
- **D-06:** The ungated `update` notification type (status changes to watchers with no pref reader) is presented as a recommendation row so the owner can rule on gating it.

### One-click suppression (NOTIF-02)
- **D-07:** The one-click apply writes **the owner's own prefs only** — via the existing Phase 34 `user_notif_prefs` mechanism (e.g. `email_comment=false`), same model as the manual toggle. **Zero new tables, no workspace-level class suppression.**
- **D-08:** The apply surface lives in the **existing Settings › Notifications section** (the notif-email / notif-push tab pattern in `src/pages/settings.js`).
- **D-09:** Only audit rows whose Status reads **`validated`** get an apply button on the Settings surface.

### Burst coalescing (NOTIF-03)
- **D-10:** Coalescing happens **at inbox render (client-side)** — notifications are still emitted one per row server-side; the inbox groups bursts at display. Zero server changes. Phase 59 D-14 (one push per notif row) stays true.
- **D-11:** Grouping trigger = **same task + same type among unread notifications** (no time window); the group collapses into one summary row and expands to the individual entries.
- **D-12:** **Inbox only** — push and email are untouched by coalescing.
- **D-13:** The burst summary row shows **count by type + task key + title** (e.g. « 5 nouveaux commentaires — WEBS-42 Fix login »), clickable to the existing `/w/:slug/task/:key` drawer path, expandable to the list.

### the agent's Discretion
- Exact audit doc table wording/section order (Phase 39 shape as reference)
- Mechanics of the Settings apply button (where the validated-rulings list comes from — build-time generation or post-ruling coding; server rejects non-validated classes as defense-in-depth is permitted)
- Burst group rendering details (markup, expand/collapse interaction, i18n keys EN+FR) within D-13
- Whether marking a burst group read marks all entries read (natural reading; agent decides)
- Rerun/sync policy between the audit doc's citations and future code drift

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements
- `.planning/ROADMAP.md` §Phase 61 — goal, NOTIF-01..03, success criteria (incl. Phase 38 invariants standing)
- `.planning/REQUIREMENTS.md` §Notifications Trim (NOTIF-TRIM) — requirement wording; §Out of scope (digest overhaul beyond NOTIF-03)

### The Phase 39 audit (deleted doc, recovered as input)
- git commit `85785a2` — `docs/notification-audit.md` full content (all rows `proposed` at Phase 39 delivery): the convention section (D-05 Status gate), per-type tables, dead-key findings, digest asymmetry notes. **Deleted from working tree by `b16010f` (owner cleanup 2026-11-10)** — read via `git show 85785a2:docs/notification-audit.md`, never re-trust its line citations (D-01).
- `.planning/milestones/v1.8-phases/39-notification-audit-doc-only/39-CONTEXT.md` — Phase 39 decisions incl. D-05 ruling-gate convention (Status cells + STATE.md mirror)

### Prior-phase decisions that bind here
- `.planning/phases/59-browser-push/59-CONTEXT.md` — D-14 (one push per row; Phase 61 owns burst), D-09/D-10 (push_due live, Phase 38 invariants apply to push), the live push fan-out
- Phase 38 invariants (PROJECT.md Recent Wins) — inbox rows never suppressed; digest users: reminder emails suppressed, inbox/push untouched; exactly-once reminder claims
- Phase 37 REM-01..04 — two-reminders-per-task cadence, `reminders_sent` transactional claim
- Phase 34 SETTINGS-02 — `user_notif_prefs` rows-not-doc ruling (D-05/D-08), the mechanism D-07 reuses

### Existing implementation touchpoints
- `server.js` — `NOTIF_PREF_DEFAULTS` (~1116-1154), email fan-out gates (~1188-1260), `getUserNotifPrefs` accessor (~1639), push fan-out `sendPushFor` (~1798), `queueNotifEmails` (~1883), doc-PUT `newNotifs` diff site (~5848)
- `src/core/notifPrefs.js` — client-side prefs persistence (Phase 34)
- `src/core/push.js` — `PUSH_TYPE_PREF` map, foreground toast path
- `src/pages/settings.js` — notif-email / notif-push cases (~line 392-560): the D-08 surface
- `src/pages/notifications.js` + `src/pages/inbox.js` (`notifIcon`, `notifText`) — the inbox render where D-10/D-13 land
- `src/actions/actions.js` — client emission sites (`emitMentions` ~146-171, watcher fan-out ~177-185, status-change `update` ~203-210, comments ~1125-1129) the audit re-cites

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `user_notif_prefs` table + accessor (Phase 34) — the write path for D-07's one-click apply; no new storage
- Settings › Notifications tab pattern (`settings.js` notif-email/notif-push) — D-08's surface extends it
- Inbox filter/row rendering (`notifications.js`, `inbox.js` helpers) — burst grouping (D-10/D-13) is a render-time transform over the existing list
- Task drawer deep-link `/w/:slug/task/:key` — the burst summary row's click target
- i18n `t()` layer + i18n gate (`scripts/i18n-scan.mjs`) — all new burst strings catalogued EN+FR

### Established Patterns
- Rows-not-doc for per-user prefs (Phase 34 ruling) — suppression lands in `user_notif_prefs`
- D-05 Status-column ruling gate (Phase 39) — nothing is codeable without a `validated` cell + STATE.md mirror
- Phase 38 invariant tests exist and must pass unmodified (standing constraint, SC4)
- Phase 56 chunk discipline — any new Settings surface code stays out of the entry chunk if it grows a page

### Integration Points
- New audit doc at `docs/notification-audit.md` (recreated by this phase)
- `settings.js` notif section — new "apply validated trim" actions
- `notifications.js` render pipeline — burst grouping transform
- `.planning/STATE.md` Recent Decisions — ruling mirror rows

</code_context>

<specifics>
## Specific Ideas

- The D-05 gate is the product intent of this phase: **decided trims, applied one-click — no speculative trims**. The audit doc's Status column is the single source of truth for what may be coded.
- The owner explicitly chose owner-prefs-only suppression: a ruling changes what the OWNER receives, not what the workspace receives. Workspace-wide semantics would be a new capability (deferred).
- Burst coalescing is deliberately render-only: server state stays one-row-per-notification, keeping Phase 38 invariants and Phase 59 D-14 untouched.
- Rulings are collected BEFORE planning — the planning session must see only validated trims.

</specifics>

<deferred>
## Deferred Ideas

- Workspace-wide notification class suppression (new semantics beyond per-user prefs) — future requirement if ever wanted; explicitly rejected this phase (D-07)
- Digest overhaul beyond NOTIF-03 coalescing — REQUIREMENTS.md out-of-scope (D-05 rulings may re-open later)

</deferred>

---

*Phase: 61-Notification Trim*
*Context gathered: 2026-11-13*
