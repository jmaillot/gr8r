# Phase 91: Digest Dedup — One Digest Per User Per Day - Context

**Gathered:** 2026-11-23
**Status:** Ready for planning

<domain>
## Phase Boundary

A digest-enrolled user in multiple workspaces receives exactly ONE digest email per local day, with per-workspace sections inside — instead of one email per workspace (owner observed 4× duplicates). The per-workspace semantic claim (`reminders_sent`) stays untouched; aggregation happens at the transport layer (outbox). Root cause pinned by a failing regression test FIRST, then fixed.

</domain>

<decisions>
## Implementation Decisions

### Send timing & timezone
- **D-01:** The aggregated digest keeps the per-recipient-timezone trigger: the user receives their single email at their own local morning tick (existing ≥8h local-time gate, `localParts(recipientTz, at)`). The global tick loops all workspaces, then coalesces in-memory per (user, localDate) before enqueueing ONE outbox row. No fixed server-clock send time. — **Reversibility:** reversible — local scheduling change, no contract.

### Unsubscribe (multi-workspace email)
- **D-02:** ONE global unsubscribe link in the email footer: unsubscribing disables the daily digest across ALL of the user's workspaces at once. No per-section unsubscribe links. — **Reversibility:** costly — changes the unsubscribe contract; the existing HMAC scheme signs `(ws.id, user_id)` (server.js:2874, `unsubscribeUrl(unsubscribeHmacKey(), APP_URL, ws.id, r.user_id)`), so a user-scoped link needs a new signature scope and handler semantics. Research must define the new HMAC scope; audit the unsubscribe route family.

### Email branding
- **D-03:** Neutral app-level header (app name/logo), each workspace section titled with its workspace name (e.g. « Workspace : Marketing — 2 tâches »), one global footer. No per-section workspace logos. — **Reversibility:** reversible — template change.

### Outbox ctx format
- **D-04:** ONE outbox row per user/day with an aggregated ctx JSON: `type: 'digest-aggregated'` carrying `{ sections: [{ wsSlug, wsName, dueToday[], overdue[] }], logoUrl, unsubscribeUrl }` — `sendDigest` and the templating evolve together; 1 outbox row = 1 send, transport exactly-once guaranteed by the dedup key `digest:user:{userId}:{localDate}` (replacing the per-ws outbox dedup key). The per-workspace reminders_sent claim rows are STILL written per workspace (byte-compatible, per ROADMAP SC4) but no longer enqueue their own outbox row. — **Reversibility:** costly — outbox dedup_key shape is a transport contract; a bad migration would re-fire or silently drop digests. Pinned regression test gates it.
- **D-05:** Email locale follows the existing email pattern (`locale === 'fr' ? 'fr' : 'en'`) — do NOT widen to 5 locales for the email body itself; ×5 same-commit rule applies to any NEW app-side i18n keys only (there should be none — this phase is server/email only).

### the agent's Discretion
- Exact mechanism for the per-tick in-memory coalescing (accumulate map keyed by user across the ws loop, then enqueue after the loop vs per-claim counting) — planner/researcher's call, constrained by D-01 timing and D-04 single-row.
- Whether the aggregated send reuses `runEmailDeliveryPass` unchanged (ctx rebuild path) — researcher decides; restart/MAILER-disabled paths must stay honest per ROADMAP SC3.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Digest send path (root-cause site)
- `server.js` lines 2815–2925 — the reminder/digest pass: per-workspace loop, per-recipient tz resolution, opt-in read, `reminders_sent` claim (D-03/D-11/D-12), `email_outbox` transport claim (POL-02 D-07), post-commit `runEmailDeliveryPass` kick.
- `mailer.js` (digest templating + `sendDigest`, delivery pass) — ctx consumption to evolve for `digest-aggregated`.

### Locked decisions riding on this phase
- `.planning/ROADMAP.md` § Phase 91 — 4 success criteria (SC2 test-first, transport-layer-only coalescing, SC4 claim byte-compatibility).
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` — dedup-guard analysis (claim insert as prime site), outbox exactly-once invariants.
- `.planning/REQUIREMENTS.md` § NOTIF-01 — requirement + out-of-scope exclusions.

### Related invariants (do not break)
- D-11/D-12/D-03 (claim semantics, empty-digest-honesty, exactly-once) — documented inline at server.js:2835–2865.
- POL-02 D-07 (semantic vs transport claim split, post-commit delivery kick — NEVER inside tx).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `reminders_sent` INSERT OR IGNORE claim pattern — stays as-is per workspace (semantic honesty).
- `email_outbox` dedup_key INSERT OR IGNORE — the transport exactly-once mechanism to reuse with the new user/day key.
- `runEmailDeliveryPass` — existing post-commit delivery kick; aggregated ctx rides the same pass.
- `unsubscribeUrl(unsubscribeHmacKey(), ...)` — HMAC scheme to extend for the global (user-scoped) link (D-02).
- `resolveTz` / `localParts` — per-recipient tz resolution, already computed per recipient inside the loop (D-01 keeps it).

### Established Patterns
- POL-02 split: semantic claim (WHAT) vs transport claim (HOW) — the aggregation MUST live on the transport side only.
- MAILER-disabled producers skip claiming — aggregated path must keep this gate.
- Fail-absent: outbox plumbing failures never roll back the semantic claim.

### Integration Points
- server.js:2815–2925 (the pass) — loop restructure to coalesce per user.
- mailer.js digest builder/templating — new `digest-aggregated` ctx type, section rendering, global footer/unsubscribe.
- Unsubscribe route family — new user-scoped handler semantics (D-02).

</code_context>

<specifics>
## Specific Ideas

- Owner validated the 4× duplicate as a bug-shaped behavior and chose aggregation explicitly: « 1 seul email/jour par utilisateur, toutes workspaces confondues, sections groupées par workspace à l'intérieur ».
- The morning the bug was reported, all 4 emails were identical in subject (« [Prod] Résumé quotidien : 2 tâche(s) ») — the pinned regression test should assert one outbox row AND one send per user/day regardless of workspace count.

</specifics>

<deferred>
## Deferred Ideas

- Per-section unsubscribe (leave one workspace's digest only) — rejected for now (D-02 global link); can be revisited later if needed.
- Widening email-body locales beyond fr/en — out of scope; app-side ×5 discipline unaffected.

</deferred>

---

*Phase: 91-Digest Dedup — One Digest Per User Per Day*
*Context gathered: 2026-11-23*
