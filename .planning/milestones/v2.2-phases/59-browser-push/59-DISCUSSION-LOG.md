# Phase 59: Browser Push - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-13
**Phase:** 59-browser-push
**Areas discussed:** Opt-in & test push UX, Which events push, Double-notify policy, Ticker wording

---

## Opt-in & test push UX

| Option | Description | Selected |
|--------|-------------|----------|
| Settings-only opt-in | Permission requested only from Settings tab | ✓ |
| Settings + first-mention nudge | Plus one-time inline button after first mention | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-device test button | Each device row gets its own send-test action | ✓ |
| One test to all devices | Single button, doesn't isolate dead endpoints | |

| Option | Description | Selected |
|--------|-------------|----------|
| Visible device list | All subscriptions with labels + dates | ✓ |
| Current device only | Minimal UI, weaker PUSH-01 story | |

| Option | Description | Selected |
|--------|-------------|----------|
| Prefs gate delivery only | Subscriptions persist until sweep/unsubscribe | ✓ |
| Prefs off = unsubscribe | Re-enable requires re-subscribe + re-prompt | |

| Option | Description | Selected |
|--------|-------------|----------|
| Master enable + per-type prefs | Two-layer model | ✓ |
| First pref triggers prompt | Less obvious which switch subscribed | |

| Option | Description | Selected |
|--------|-------------|----------|
| Set at subscribe, no edit | Client-chosen label stored at subscribe | ✓ |
| Editable labels | PUT route per row | |

**User's choice:** All recommended options
**Notes:** — (extra "More questions" round consumed; no further questions raised)

---

## Which events push

| Option | Description | Selected |
|--------|-------------|----------|
| Mentions + assigns only | PUSH-02 literal scope | |
| Add comments too | | |
| Add reminders too | | |
| **User typed "all"** | Clarified → all four types | ✓ (all four: mentions, assignments, comments, due-reminders) |

| Option | Description | Selected |
|--------|-------------|----------|
| Real path, test-tagged | Test push uses real payload/display path | ✓ |
| Minimal transport-only payload | Proves transport only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 38 invariants apply | Digest/suppression rules apply to push | ✓ |
| Push ignores digest | Simpler, breaks digest contract | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror email gating | Self-suppression + permission re-check | ✓ |
| No permission re-check | Can push to revoked members | |

| Option | Description | Selected |
|--------|-------------|----------|
| Amend G-37-2 | push_due becomes live reminder-push pref | ✓ |
| Reminders ride email_reminder pref | One pref, two channels | |

**User's choice:** All four types; standing G-37-2 ruling amended (see CONTEXT.md D-09)
**Notes:** Agent flagged the G-37-2 conflict (src/core/push.js line 26–27, "push_due stays dead") surfaced from the user's "all" answer; user confirmed the amendment.

---

## Double-notify policy

| Option | Description | Selected |
|--------|-------------|----------|
| Skip when tab visible | SW suppresses OS notification when a client exists | ✓ |
| Always show + dedupe by id | Redundant surfaces | |

| Option | Description | Selected |
|--------|-------------|----------|
| Any open client suppresses | Focused OR unfocused | ✓ |
| Only focused suppresses | Background tab still gets OS notification | |

| Option | Description | Selected |
|--------|-------------|----------|
| One push per notif row | No aggregation; Phase 61 owns bursts | ✓ |
| Aggregate by task tag now | Pre-empts Phase 61 scope | |

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort in SW | No page↔SW handshake | ✓ |
| Page-SW handshake | Exact suppression, more moving parts | |

| Option | Description | Selected |
|--------|-------------|----------|
| Click routes like always | Click path unaffected by suppression | ✓ |
| No special click path needed | (clarity variant) | |

**User's choice:** All recommended options
**Notes:** —

---

## Ticker wording

| Option | Description | Selected |
|--------|-------------|----------|
| Sender in title, ref+title in body | "Élodie mentioned you" / "WEBS-42 Fix login redirect" | ✓ |
| Project in title, action in body | Scannable per project | |

| Option | Description | Selected |
|--------|-------------|----------|
| KEY + title only | Shortest body | ✓ |
| Project + title | Needs aggressive truncation | |

| Option | Description | Selected |
|--------|-------------|----------|
| Truncate + assert budget | Test asserts ≤4096 octets, pathological FR | ✓ |
| No truncation | Rely on 413 never happening | |

| Option | Description | Selected |
|--------|-------------|----------|
| SW stays string-free | T-48-02 contract kept, even for test marker | ✓ |
| Allow SW strings | Breaks zero-strings contract | |

| Option | Description | Selected |
|--------|-------------|----------|
| Name only, no avatar | Display name only | ✓ |
| Avatar icon | Payload budget + asset plumbing | |

**User's choice:** All recommended options
**Notes:** —

---

## the agent's Discretion

- Truncation mechanics within the assert-test constraint
- Last-seen tracking mechanics (optional if cheap)
- Master-toggle unsubscribe affordance (D-07 permits either)
- SW suppression check details (clients.matchAll options)
- Notification icon/badge asset reuse
- Test-push "test" marker mechanics (server-side, SW stays string-free)

## Deferred Ideas

- Burst coalescing / per-task stacking → Phase 61 (NOTIF-03)
- Avatar icons on notifications
- Editable device labels
