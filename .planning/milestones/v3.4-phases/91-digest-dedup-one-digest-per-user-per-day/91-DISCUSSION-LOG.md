# Discussion Log — Phase 91 (Digest Dedup)

**Date:** 2026-11-23 · **Mode:** default · **Areas selected:** 4/4

| Area | Options presented | Decision |
|------|-------------------|----------|
| Send timing & tz | Per-recipient-tz trigger (recommended) / fixed server time | **D-01** — per-tz trigger kept; in-memory coalescing per (user, localDate) in the global tick |
| Unsubscribe multi-ws | Global link (recommended) / per-section / both | **D-02** — global link, unsubscribes all workspaces; new HMAC scope needed |
| Email branding | App header + ws-titled sections (recommended) / per-section logos | **D-03** — neutral app header, sections titled by workspace, single global footer |
| Outbox ctx | 1 aggregated outbox row (recommended) / N rows + coalescing at delivery | **D-04** — one `digest-aggregated` ctx row per user/day; reminders_sent claims still per-ws |

**Deferred:** per-section unsubscribe; email locales beyond fr/en.

**Agent's discretion:** coalescing mechanism (map-then-enqueue vs counting), delivery-pass reuse.
