# Phase 59: Browser Push - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-sent Web Push so the workspace reaches members with the tab closed: a browser push arrives when they are mentioned, assigned, commented on, or a task reminder fires — honoring per-type prefs, deep-linking to the exact task. Includes the Settings opt-in surface (extending the Phase 48 badge/permission foundation), the `push_subscriptions` table, VAPID key custody, the SW `push` handler (extending `public/sw.js`), send-failure dead-subscription sweep, and the DEPLOY.md runbook. No burst aggregation (Phase 61), no mobile app push, no new notification types.

</domain>

<decisions>
## Implementation Decisions

### Opt-in & test push UX (PUSH-01)
- **D-01:** Permission prompt lives **Settings-only** (Settings › Notifications › Push tab). No first-mention in-context nudge, never on page load.
- **D-02:** Two-layer UI: a top-level **master enable** toggle (drives `requestPermission` + PushManager.subscribe) with the per-type mention/assign/comment/reminder toggles below as delivery prefs only.
- **D-03:** The Push tab shows a **visible device list** — every subscription of the member with a human label and created/last-seen info.
- **D-04:** Device label is **client-chosen at subscribe time** (e.g. "MacBook — Chrome") and stored with the row; not editable afterwards.
- **D-05:** PUSH-01's test push is **per-device**: each device row gets its own "send test" action, proving that exact subscription endpoint.
- **D-06:** The test push exercises the **real payload/display path** (same SW route, same ticker format) tagged as a test — proves the whole chain, not just transport.
- **D-07:** Turning push prefs off **gates delivery only**; subscriptions persist until the 404/410 sweep or explicit unsubscribe (same model as email prefs vs addresses).

### Which events push (PUSH-02)
- **D-08:** **All four notification types** fire server push: mentions, assignments, comments, due-reminders — each honoring its per-type push pref.
- **D-09:** **Standing ruling G-37-2 is amended**: `push_due` (currently a deliberately dead pref, see `src/core/push.js` line 26–27) becomes the live reminder-push pref. Client foreground behavior is unchanged (reminders still never foreground-toast).
- **D-10:** Reminder pushes respect the **Phase 38 digest/suppression invariants** exactly like email: inbox rows never suppressed, digest users get push per digest cadence rules.
- **D-11:** Push mirrors the email fan-out gating: **self-action suppression** (no push for your own mention/comment) and a **`memberCanReadProject` re-check at send time** (revoked access = no push).

### Double-notify policy
- **D-12:** The SW `push` handler checks for **any open client of this origin** (`clients.matchAll`) and **skips the OS notification** when one exists — the foreground poll/toast path (D-48-2) owns visible-tab delivery.
- **D-13:** Suppression is **best-effort inside the SW** — no page↔SW handshake; a rare duplicate while switching tabs is acceptable.
- **D-14:** **One push per notif row** — no burst aggregation or per-task tag stacking this phase; Phase 61 (NOTIF-03) owns burst handling.
- **D-15:** Click path is unaffected by suppression: `notificationclick` always deep-links to `/w/:slug/task/:key` via the existing router.

### Ticker wording (PUSH-03)
- **D-16:** Title carries the **sender + action**, pre-localized via `tFor`: "Élodie mentioned you" / "assigned you a task" / "New comment" / "Task due". **Sender is display name only — no avatar icon** in the OS notification.
- **D-17:** Body carries the **task key + title** only, e.g. "WEBS-42 Fix login redirect" (the key prefix encodes the project; no separate project name). Never task bodies/descriptions.
- **D-18:** Payload budget: truncate the task title to a conservative body budget (~120 chars after localization) and **assert the serialized payload ≤ 4096 octets in tests** with pathological FR strings — 413 can never reach the push service.

### the agent's Discretion
- Exact truncation mechanics (title budget vs whole-payload budget interaction) within D-18's assert-test constraint
- Last-seen tracking mechanics for the device list (created_at always; last-seen optional if cheap)
- Whether the master-enable toggle also offers explicit unsubscribe (D-07 permits either)
- SW suppression check details (`clients.matchAll` type/windowClient options) within D-12/D-13
- Which existing icon/badge assets the notification reuses (Phase 48 assets if present)
- Test-push payload's "test" marker mechanics (server-side tag in title, still string-free SW)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements
- `.planning/ROADMAP.md` §Phase 59 — goal, PUSH-01..05, success criteria (incl. per-device test push, sweep, VAPID persistence)
- `.planning/REQUIREMENTS.md` §Browser Push — requirement wording

### Milestone research (pre-locked plumbing decisions)
- `.planning/research/ARCHITECTURE.md` §(2) Push subscriptions and fan-out — `push_subscriptions` schema, two fan-out sites (doc-PUT `newNotifs` diff beside `queueNotifEmails` + `runReminderPass`), fail-absent VAPID env pattern, SW-extends-not-redesigns, payload pre-localization via `tFor`, foreground/seen-set interaction
- `.planning/research/PITFALLS.md` — Pitfall 1 (404/410 sweep on send, same pass as fan-out), Pitfall 2 (VAPID persistence in /data, DEPLOY.md §16, restart test), Pitfall 6 (≤4096 ticker payload), Pitfall 12 (SW skipWaiting update pattern), Pitfall 13 (permission prompt UX)
- `.planning/research/STACK.md` — web-push@4.0.0 (owner-approved dependency #2), SQLite/pg dual-backend constraints

### Prior-phase decisions that bind here
- `.planning/phases/48-*` records via PROJECT.md — badge/permission surface, D-48-2 foreground poll, D-48-4 derived blocked badge, T-48-02 SW zero-strings contract
- `.planning/phases/56-delivery-infrastructure/56-CONTEXT.md` — SW + chunk-hash contract (Phase 56/59 ordering; SW precache/update strategy must respect DELIV-02 chunking)
- Phase 34 precedent — per-user prefs in rows not doc blobs (`user_notif_prefs` accessor pattern the server reads `push_*` prefs through)
- Phase 38 invariants — digest/suppression rules reminder push must obey (D-10)

### Existing implementation touchpoints
- `public/sw.js` — the 28-line minimal click router to extend with the `push` handler (zero strings preserved)
- `src/core/push.js` — `PUSH_TYPE_PREF` map (mention/assign/comment; push_due dead per G-37-2 — amended by D-09), foreground toast path, seen-set discipline
- `src/pages/settings.js` — `notif-push` case (~line 522): existing per-type rows + derived blocked badge — the D-02/D-03/D-05 surface
- `server.js` — doc-PUT funnel `newNotifs` diff site (beside `queueNotifEmails`), `memberCanReadProject` (~line 928), `runReminderPass`, `user_notif_prefs` accessor, boot migration sequence for `push_subscriptions`
- `db-adapter.mjs` — the SQL seam for the `push_subscriptions` table (both backends, DBA parity suite)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public/sw.js` `notificationclick` router — the deep-link path already exists (`/w/:slug/task/:key` with `?next=` from Phase 23); the push handler only adds notification display
- `queueNotifEmails` fan-out (server.js) — the exact gating/shaping template (self-suppression, permission filter, fire-and-forget after commit)
- `tFor()` per-recipient localization funnel (Phase 36) — pre-localizes title/body server-side so the SW holds zero strings
- Phase 48 permission surface + derived blocked badge (`settings.js` notif-push case) — D-01's opt-in UI extends it
- `user_notif_prefs` rows + accessor — how the server reads `push_mention`/`push_assign`/`push_comment`/`push_due` prefs
- `ensureTable` additive migration pattern (Phase 34) — `push_subscriptions` clone, pre-backup, byte-identical second boot

### Established Patterns
- Rows-not-doc for per-user high-churn state (Phase 34 ruling) — subscriptions follow
- Side-effect fan-out at the doc-PUT diff site, never blocking the response (P4-f)
- Fail-absent env config (SMTP/MASTER_KEY) — unconfigured VAPID = feature absent, client push-toasts keep working
- Transactional-claim sweep (Phase 27 `reminders_sent` pattern) — 404/410 row deletion rides the fan-out pass

### Integration Points
- doc-PUT `newNotifs` diff (server.js) — mention/assign/comment push fan-out site
- `runReminderPass` — reminder push fan-out site (Phase 38 invariants apply)
- `settings.js` notif-push case — master enable, device list, per-device test push
- New `/api/me/push-subscriptions` routes — subscribe/unsubscribe/list/test
- DEPLOY.md — new §16-adjacent runbook section for VAPID generation/custody

</code_context>

<specifics>
## Specific Ideas

- The G-37-2 amendment (D-09) is the owner reversing a standing ruling on record — downstream agents must treat `push_due` as live for server push while keeping the client foreground path unchanged, and any test asserting "reminders never push" from Phase 37/38 needs updating.
- "Any open client suppresses" (D-13) is deliberately broader than "focused tab": tab open in background = no OS notification. True tab-closed delivery.
- The per-device test push (D-05/D-06) is the owner's acceptance tool for PUSH-01 — it must go through the real payload path, not a stub.

</specifics>

<deferred>
## Deferred Ideas

- Burst coalescing / per-task notification stacking — Phase 61 (NOTIF-03) owns it (D-14)
- Avatar icons on notifications — payload budget + asset plumbing; revisit if wanted later
- Editable device labels — rejected for now (D-04); may revisit with the device list UX

</deferred>

---

*Phase: 59-Browser Push*
*Context gathered: 2026-11-13*
