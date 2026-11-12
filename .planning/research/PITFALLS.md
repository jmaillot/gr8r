# Domain Pitfalls — v2.2 Notifications, Search & Delivery

**Domain:** Adding browser push, FTS5 search, dashboards, transparency self-view, saved views, i18n infra, e2e guard and code-splitting to an existing Node monolith (JSON workspace docs + revision-based optimistic concurrency + dual SQLite/pg adapter, vanilla-JS SPA).
**Researched:** 2026-11-12
**Overall confidence:** HIGH (specs/canonical docs: RFC 8291/8030, SQLite FTS5 source, web.dev push docs; integration pitfalls derived from this codebase's own architecture — PROJECT.md, Phases 45/48/52 records)

Every pitfall below is written for *adding the feature to this system*, not generic advice. Each has an owner-phase recommendation since phases don't exist yet.

---

## Critical Pitfalls

### Pitfall 1: Push subscription churn — server keeps pushing to dead endpoints
**What goes wrong:** Endpoints die constantly: browsers rotate push endpoints, Chrome re-issues them, users clear site data, devices expire subscriptions. A server that treats every `sendNotification()` failure as a retryable error accumulates dead subscriptions, retriggers exponential-backoff loops, and inflates push-send latency on every mention/assignment fan-out.
**Why it happens:** The web-push response codes are easy to ignore — `404` and `410` mean *this subscription is gone forever* (410 additionally carries a reason header when the user revoked permission). Everything else (429, 5xx) is retryable.
**Consequences:** Silent notification loss (the worst failure for a "mentions + assignments" feature), a growing `push_subscriptions` table full of corpses, fan-out that takes seconds.
**Prevention:** On push send, treat `404`/`410` as authoritative: delete the subscription row **in the same pass as the fan-out** (mirrors the Phase 27 `reminders_sent` transactional-claim pattern — claim, send, sweep dead rows atomically). Keep one subscription row per (user, device) keyed by endpoint hash; a re-subscribe to a new endpoint replaces rather than accumulates. Do NOT retry 404/410.
**Detection:** `push_subscriptions` count grows monotonically; fan-out duration grows; unit test asserting dead-endpoint sweep after a mocked 410.
**Phase:** Push fan-out phase (the mentions/assignments delivery phase — NOT the Phase 48 continuation, which only did subscription UX). Should be a plan-level acceptance criterion.

### Pitfall 2: VAPID keys not persisted — every restart silently orphans all subscriptions
**What goes wrong:** VAPID keys are the server's push identity. If generated at boot (or regenerated on redeploy because they weren't stored), every existing browser subscription becomes invalid — signed claims fail, deliveries 404, and users who granted permission never re-prompt because the browser still shows "granted".
**Why it happens:** Keys look like any other crypto ephemeral; nothing at boot warns they're identity, not secret material. This project has a strong precedent for boot-generated material going wrong (MASTER_KEY handling needed an entire keyring milestone, v1.5 Phase 25/26).
**Consequences:** Push silently dead after first Docker restart; debugging is nasty because the failure is asymmetric (server thinks it sent).
**Prevention:** Generate once at first use, persist in `/data` (same durability class as `projects.db`), and treat like the keyring: document in DEPLOY.md §16 alongside MASTER_KEY custody, env-overridable for reproducible deploys. Never regenerate when a stored key exists; log loudly at boot if none exists yet.
**Detection:** A restart integration test: subscribe → restart server → push still delivers (mocked push service).
**Phase:** Push phase (same phase as Pitfall 1). DEPLOY.md section is part of the phase's definition of done, mirroring the Phase 26 runbook pattern.

### Pitfall 3: FTS index drift — JSON docs written outside the adapter break search silently
**What goes wrong:** Tasks live inside the workspace JSON document (`workspaces.doc`), not rows. An external-content FTS table over "tasks" has no task table to point at; a shadow mirror table will drift whenever the doc is written by anything that doesn't run the sync: `mergeClientDoc` restores, boot migrations, the MCP server, the pg copy script, `PUT /api/workspaces/:slug` bulk writes, future endpoints.
**Why it happens:** Every existing write path already goes through doc-merge; a new sync hook must be inserted at exactly one chokepoint, and it's tempting to sync "where convenient" instead. The system's single biggest integration risk in this milestone.
**Consequences:** Users search a task title that exists and get nothing — or worse, search returns a task that was deleted. Drift is invisible until someone notices.
**Prevention:** (a) Hook the rebuild at the **one real write chokepoint** — after each `pushNow()`/doc commit in the shared persistence funnel, not per-endpoint. (b) Include a **full rebuild** path (drop and re-index from the current doc) invoked on boot and exposed to an admin/maintenance route — drift recovery is mandatory, not optional. (c) A periodic or per-boot consistency count (`doc tasks vs index rows`) logged loudly on mismatch. (d) Tests that write the doc through the bulk PUT and MCP paths and assert the index follows. (e) Verify the pg adapter keeps parity — the mirror table DDL must exist in both schema variants with the pg bigint-epoch convention respected.
**Detection:** Boot-time count mismatch log; Ctrl-K returning stale results; test matrix includes pg (the standing dual-backend suite rule covers this automatically if the mirror is tested at all).
**Phase:** FTS5 search phase. The rebuild-on-boot + chokepoint decision should be a phase decision logged in the phase record (like D-53-1).

### Pitfall 4: Transparency self-view leaks other members' data through the member's own row
**What goes wrong:** TRN-02 mirrors the admin TRN-01 view for each member. The admin version legitimately shows team names, role reasoning, and access paths of *other* members (e.g. "via team X where Y is also a member", lead names, invite grants). Reusing the TRN-01 computation server-side and merely hiding admin chrome in the UI would leak: which teams other people belong to, who is project lead, private-project invitee identities, scope grants.
**Why it happens:** The obvious implementation reuses `memberCanReadProject` + the TRN-01 reason-code path — but that path was designed for an admin's eyes.
**Consequences:** Privacy breach through a "transparency" feature; this project's bar is redaction *server-side*, not CSS (`redactDoc()` precedent from v1.1; Phase 34 closed a recent-search leak caused by exactly this class of bug).
**Prevention:** A separate redaction funnel for the self-view: the member sees only their own access rows, coarse reason codes (same as TRN-01), and **never** other members' identity except what they'd see anyway (public rosters). Compute on a keyed route authorized to the caller only (owner-only TRN-01 route must stay distinct). Table-driven tests per role × per project shape asserting absent fields are literally absent from the response body — byte-level, in the Phase 32 "404 matrix" style.
**Detection:** Any `members`/`lead`/team-roster key appearing in a member's self-view response for data they don't already see.
**Phase:** Transparency self-view phase. Make the response-shape test suite a must-have in the plan.

### Pitfall 5: Permission leaks in dashboard aggregates
**What goes wrong:** The admin dashboard computes overdue-tasks-per-project and load-per-member. Admin-gated is necessary but not sufficient: an admin of *this workspace* may still not read a private project they're not invited to — `memberCanReadProject` is the single funnel for visibility, admins included (v2.0 model). Aggregate queries that iterate the doc and skip the funnel leak counts and names from private projects; "count-only" leaks are still leaks (task counts, member load patterns).
**Why it happens:** Dashboard code wants one big pass over the doc; permission checks feel like UI concerns. Also: the redaction funnel restores hidden rows from storage on write, so a naive read of the *stored* doc sees everything.
**Consequences:** Admin sees a private project's overdue counts and member names they can't open; violates R5's spirit and the Phase 29 send-time filtering discipline.
**Prevention:** Server-side enforcement at the aggregate level: each dashboard data item passes through `memberCanReadProject`/`hiddenFor` before aggregation, with private-project contributions either excluded or collapsed to an explicit "N more private" count for admins (owner decision to make during discuss-phase). Render the dashboard server-side (endpoint computes the payload), never ship raw doc + client-side rollup.
**Detection:** Dashboard endpoint test with a private project the calling admin isn't in — assert zero leakage of its name/tasks in the response.
**Phase:** Admin dashboard phase (decision about private-project collapse belongs in discuss-phase with the owner).

---

## Moderate Pitfalls

### Pitfall 6: Push payload size limit (≤ 4096 bytes, encrypted) — silent drops on rich notifications
**What goes wrong:** RFC 8291 caps the encrypted payload at 4096 octets; stuffing task description, project name, avatar URLs and FR text into the payload intermittently fails per message, and Chrome enforces its own ~3 KB quirk for some cases. Failure surfaces as `413` from the push service mid-fan-out.
**Prevention:** Push payloads carry a **ticker, not the letter**: `{type, taskKey, wsSlug, shortTitle}` — the service worker fetches detail on click (deep-link route already exists from Phase 23, `/w/:slug/task/:key` with `?next=`). Assert payload size in tests with worst-case FR titles. Localized text for the notification body: prefer the user's locale catalogue server-side (the `tFor()` funnel already exists from Phase 36) but keep it short.
**Detection:** `413` in push send logs; a payload-size unit test with pathological strings.
**Phase:** Push fan-out phase.

### Pitfall 7: Query injection via FTS5 MATCH
**What goes wrong:** User search text passed raw into `MATCH` breaks on FTS5 syntax — quotes, `NEAR`, `*`, `AND`/`OR`, column filters (`title:drop table`) — producing SQL errors (500s) or, with careless string concatenation, actual injection. Accented FR text adds a second failure: default `unicode61` tokenizer keeps diacritics, so "elodie" won't match "Élodie".
**Prevention:** (a) Escape/quote user input into a quoted FTS phrase with `""` doubled, or tokenize into bare terms and join with implicit AND — never interpolate raw. (b) Set the tokenizer with `remove_diacritics 2` (`unicode61` option) **at table creation** — it's a creation-time constant, changing it later requires a rebuild; decide now since the app is EN/FR. Note this differs from the accent-*insensitive matching* the v1.2 recent-search matcher does (tokenized NFC+lowercase in `redaction.js`) — reuse the same normalization philosophy for the search input side (NFC+lowercase before querying) and `remove_diacritics` on the index side. (c) Careful: `remove_diacritics 2` handles Latin accents but the input normalization must match, or queries miss.
**Detection:** Unit table of hostile MATCH strings (`"`, `NEAR(`, `*`, `:`, `OR`) all returning results or clean empty sets, never 500; accent-pair test ("elodie" ↔ "Élodie").
**Phase:** FTS5 phase — tokenizer choice must be a phase decision (it's unchangeable without full rebuild).

### Pitfall 8: Saved views schema drift — stored views referencing dead columns
**What goes wrong:** Saved views store column sets/filters/ordering. When columns change (this milestone adds General-Access granularity and show/hide itself), stored views reference unknown columns or miss new ones; loading them renders broken tables or throws.
**Prevention:** Version the saved-view schema (`v: 1`); on load, intersect stored columns with the current live column set and drop unknowns (lenient-load), never trust stored ids; validate server-side on save too since views may live in the workspace doc (then `mergeClientDoc`/normalize sweeps must know the new sink — the D-53-1 lesson: prefer a shape that needs no new doc sink). Migrate on read, not with a destructive boot migration — zero-migrations constraint holds.
**Detection:** A saved view created before the show/hide feature loads after it; unit test with a synthetic old-format view.
**Phase:** Saved views / General-Access phase; lenient-load rule in the plan's must-haves.

### Pitfall 9: Locale catalogue chunk races with first paint
**What goes wrong:** Code-splitting locales into dynamic chunks means the first paint can happen with `t()` resolving against an empty catalogue — English flash, untranslated strings, or promise rejections. Worse: the i18n build gate (Phase 11) can't see keys that fail to load at runtime.
**Prevention:** Keep the **base (EN) catalogue in the entry chunk** synchronously; dynamic-import only *additional* locales. Await the locale chunk before first render (a tiny "boot gate" in the SPA's init), with the base catalogue as fallback so a failed chunk fetch degrades to English instead of a blank screen. Cache the resolved chunk (browser HTTP cache + in-memory module cache). Keep `t()` synchronous after boot — never make call sites async.
**Detection:** e2e in FR asserting zero English leak **on cold cache with throttled network** (the existing French-sweep test from Phase 10, rerun with `page.route` delays).
**Phase:** Code-splitting + i18n infrastructure phase (do i18n infra first or same phase — the catalogue loader contract must exist before splitting, or splitting will be redone).

### Pitfall 10: e2e dist guard — either rebuilds every run (slow) or trusts a stale build (wrong)
**What goes wrong:** Naive guard: always `vite build` before e2e (adds ~30–60s × 100+ test runs to every cycle) or never rebuild (tests validate yesterday's code and pass against bugs fixed since).
**Prevention:** Staleness detection: hash the current `src/`/`public/`/`index.html` content (mtime lies in git worktrees and CI) and compare to a stamp written at last build (`dist/.build-stamp`); rebuild only on mismatch. The e2e server **refuses to start** on mismatch rather than auto-rebuilding — the failure message tells the developer to run the build, keeping test runs fast and correctness enforced loudly (matches the project's fail-closed style). Stamp lives inside `dist/` so `rm -rf dist` forces a rebuild. Test stamp computation itself (it's the one piece of logic in the guard).
**Detection:** CI run where e2e passes but the built dist predates a source change — the guard test proves refusal.
**Phase:** E2E dist guard phase (small, standalone, can ship early — no dependency on other phases).

---

## Minor Pitfalls

### Pitfall 11: Over-splitting a small vanilla-JS SPA
**What goes wrong:** Chunking per-view in a ~19k-line SPA produces dozens of tiny chunks whose waterfall latency exceeds the single-bundle cost; also complicates the service worker precache list (push feature's SW must now track hashed chunks or updates break).
**Prevention:** Split only where weight is proven (heaviest views + locales); one shared vendor-less entry; SW update strategy must be coordinated — precache the entry, network-first for chunks, or stale chunks 404 after deploy and break navigation. Milestone goal is "no chunk >500 kB", not "chunk everything".
**Detection:** Chunk count / build-size diff in CI; SW navigation failure after redeploy.
**Phase:** Code-splitting phase, coordinated with the SW work in the push phase (order matters: SW + chunk contract should be settled in code-splitting or SW breaks).

### Pitfall 12: Service worker update staleness after deploys
**What goes wrong:** SW byte-compare makes old SWs linger; a deployed new SW with changed notification-click routing keeps the old routing for returning users (or worse: old SW + new chunk hashes → dead notification clicks).
**Prevention:** `skipWaiting` + `clients.claim` with a deliberate update-on-message pattern; notification click routing resolves URLs at click time, never baked-in hashes; version the SW and log current version. Test: deploy a new SW → push notification click lands on the new route.
**Phase:** Push phase (SW is born there) with code-splitting phase respecting the contract.

### Pitfall 13: Permission-prompt UX — prompt-on-load burns the permission permanently
**What goes wrong:** Asking `Notification.requestPermission()` on page load (or before any user intent) gets blocked-and-remembered by Chrome/Safari; the user then must dig into site settings. The project already has the Phase 48 "Browser blocked" badge + explanatory toast foundation — regressing to auto-prompt when adding mention/assignment push would undo it.
**Prevention:** Prompt only from an explicit settings affordance or an in-context first-mention moment ("enable push to get notified when mentioned" button). Keep the derived blocked-badge state. Never re-prompt when `denied`.
**Phase:** Push phase (Phase 48 continuation).

### Pitfall 14: Notification trim recommendations acting before owner rulings
**What goes wrong:** NOTIF-TRIM requires D-05 owner rulings during execution; implementing trims speculatively violates the Phase 39 discipline (all rows `proposed` until ruled) and the standing Phase 38 no-double-send + suppression invariants.
**Prevention:** The trim phase produces *recommendations + D-05 ruling gates*; actual suppression changes only after rulings land, and every trim re-runs the Phase 38 invariants unmodified (standing constraint).
**Phase:** NOTIF-TRIM phase (gate the phase's definition of done on D-05 rulings).

### Pitfall 15: Doc-sink bloat — new feature state stuffed into the workspace JSON doc
**What goes wrong:** Push subscriptions, saved views, dashboard prefs are tempting to put in the doc — but the doc is revision-locked (409 on mismatch), redacted on read, merged on write, and every added field must survive `mergeClientDoc`/normalize/removal sweeps. Phase 34 already moved notif prefs *out* to real rows for exactly these reasons.
**Prevention:** Push subscriptions and saved views belong in their own tables (additive migration, pre-backup, byte-identical second boot — the established migration pattern from Phases 14/28/34). Only genuinely workspace-shared display state (e.g. default column visibility) goes in the doc, following D-53-1 (no new top-level field when a keyed pattern fits).
**Detection:** Review gate question: "does this state need optimistic concurrency and redaction?" If no → own table.
**Phase:** Every phase; call it out explicitly in push and saved-views phases.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Push fan-out (mentions/assignments) | Dead-endpoint churn; 413 payload drops; VAPID key loss on restart | 404/410 sweep in send pass; ticker payload + size test; persisted VAPID + DEPLOY.md §16 |
| Push UX (Phase 48 continuation) | Auto-prompt regression; SW staleness after deploys | Explicit-intent prompting only; SW version + click-time routing |
| FTS5 search | Index drift via MCP/bulk-PUT paths; MATCH injection; tokenizer locks accents in | Chokepoint hook + boot rebuild; quoted/normalized input; `remove_diacritics 2` decision as phase decision |
| Admin dashboard | Private-project leakage in aggregates; N+1 doc parses | Funnel per aggregate item; single server-side computation pass (doc parsed once per request, endpoints keyed + admin-gated like TRN-01) |
| Transparency self-view | TRN-01 computation reuse leaks others' data | Separate redaction funnel; byte-level response-shape tests per role |
| Saved views / General-Access | Stored views vs live columns drift; new doc sinks | Versioned schema + lenient-load intersect; own table, not doc fields |
| NOTIF-TRIM | Acting without D-05 rulings; breaking Phase 38 invariants | Ruling gates; re-run suppression + no-double-send invariants |
| i18n infra + code-splitting | Locale chunk race at first paint; `t()` made async | EN base in entry chunk; boot-gate locale await; runtime FR e2e with cold cache |
| Code-splitting | Over-splitting; SW/chunk hash mismatch | Split proven-heavy views only; settle SW chunk contract before push ships |
| E2E dist guard | Rebuild-every-run slowness or silent staleness | Content-hash stamp inside `dist/`; refuse-to-start fail-closed |
| All phases | pg/SQLite parity for any new table or FTS mirror | Dual-backend test matrix (standing constraint) catches it — if tested |

## Sources

- SQLite FTS5 external-content semantics & integrity-check (sqlite/sqlite source, ext/fts5 — via Context7, HIGH)
- RFC 8291 (payload ≤ 4096 octets), RFC 8030 (push protocol status semantics), web.dev push 404/410 handling (HIGH, well-established)
- Codebase architecture: PROJECT.md — doc redaction/merge funnel, revision concurrency, adapter, Phase 27/34/36/45/48/52 precedents (HIGH, first-party)
- Phase 38/39 notification invariants & D-05 ruling discipline (first-party, HIGH)

## Gaps to Address

- Whether private-project contributions appear in admin dashboards as collapsed counts or are hidden entirely — owner decision, discuss-phase.
- Whether saved views live in the doc or a table — owner decision with the Phase 34 precedent as the recommended default (table).
- Exact tokenizer trade-off (`remove_diacritics 2` vs input-side normalization only) — small phase-level decision with a test matrix.
