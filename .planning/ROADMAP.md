# Roadmap: gr8r

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2025-11-27)
- ✅ **v1.1 Security** — Phases 10-15 (shipped 2026-01)
- ✅ **v1.2 Authentication (SSO/OIDC)** — Phases 16-20 (shipped 2026-03)
- ✅ **v1.3 Invitations & Onboarding** — Phases 21-24 (shipped 2026-05)
- ✅ **v1.4 Admin Experience** — Phases 25-27 (shipped 2026-06)
- ✅ **v1.5 Integrations & Email** — Phases 28-30 (shipped 2026-09)
- ✅ **v1.6 Membership Refinement** — Phase 31 (shipped 2026-11-02)
- ✅ **v1.7 Team Visibility & Hardening** — Phases 32-35 (shipped 2026-11-04)
- ✅ **v1.8 Notification Sanity** — Phases 36-39 (shipped 2026-11-05)
- 🚧 **v1.9 Digest Context & One-Click Unsubscribe** — Phases 40-42
- 📋 **v1.10 Workspace Polish** — Phases 43-44 (planned — sourced from Kanzo tasks #16/#14)

<details>
<summary>✅ v1.8 Notification Sanity (Phases 36-39) — SHIPPED 2026-11-05</summary>

- [x] Phase 36: Server Notification i18n (4/4 plans) — completed 2026-11-04
- [x] Phase 37: Reminder Cadence Rework (4/4 plans) — completed 2026-11-05
- [x] Phase 38: Daily Digest & Reminder Suppression (3/3 plans) — completed 2026-11-04
- [x] Phase 39: Notification Audit, doc-only (1/1 plan) — completed 2026-11-05

Details: [.planning/milestones/v1.8-ROADMAP.md](milestones/v1.8-ROADMAP.md)

</details>

## Phases

- [x] **Phase 40: Digest Subject & Task Lines** - Workspace name in the digest subject, "Project — Task" lines, and a hardened RFC 2047 subject builder (SUBJ-01..03) (completed 2026-11-05)
- [ ] **Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers** - Stateless HMAC unsubscribe token, List-Unsubscribe/-Post headers on digest mail, footer link preserved, DEPLOY.md DKIM caveat (UNSUB-01, UNSUB-03)
- [x] **Phase 42: One-Click Unsubscribe Endpoint** - The codebase's first anonymous mutating route: `POST /unsubscribe/:token` with a security contract first (UNSUB-02) (completed 2026-11-06)
- [ ] **Phase 43: Workspace Logo** - Per-workspace logo upload with favicon.svg fallback, stored server-side, surfaced in the UI (Kanzo #16)
- [ ] **Phase 44: Per-Member Timezones** - Multiple configurable timezones with Paris default, replacing the single workspace-TZ model (Kanzo #14)

## Phase Details

### Phase 40: Digest Subject & Task Lines

**Goal**: A digest email is instantly identifiable per workspace and each task line names its parent project — with user-controlled names safe in SMTP headers
**Depends on**: Nothing (first phase of v1.9; independent of Phases 41-42)
**Requirements**: SUBJ-01, SUBJ-02, SUBJ-03
**Success Criteria** (what must be TRUE):
  1. A member of two workspaces receives two digest emails on the same morning, each subject naming its workspace (localized via `tFor`, EN+FR); the `reminders_sent` claim key `${ws.id}:${user_id}:digest:${localDate}` is byte-identical — the existing no-double-send tests pass unmodified
  2. Each digest task line reads "Project Name — Task Name" (em dash, HTML-escaped); when the project is unknown or invisible to the recipient (private/team-scoped, resolved through the single `memberCanReadProject` funnel), the line degrades to task-name-only — no name leak
  3. A workspace name containing CRLF, emoji, accents or 200+ characters produces exactly one well-formed RFC 2047-encoded Subject header through the single tested subject builder — hostile-name tests prove no header injection and no mojibake in FR
  4. All new user-facing/subject strings are catalogued EN+FR and `npm run i18n:scan` stays green (server `notif.*` keys included)

**Plans:** 2/2 plans complete

Plans:
- [x] 40-01-PLAN.md — Hardened `encodeWord` (C0 strip), `truncate` helper, hostile-name tests (SUBJ-03)
- [x] 40-02-PLAN.md — `[WS]` subject via `subjectWs` key, server-side project resolution, `Project — Task` lines, digest test extensions (SUBJ-01/02)

### Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers

**Goal**: Digest emails carry RFC 8058 one-click unsubscribe headers built on a stateless, test-pinned HMAC token — the frozen contract the endpoint will consume
**Depends on**: Nothing structurally (parallel-safe with Phase 40; mailer-only); must precede Phase 42
**Requirements**: UNSUB-01, UNSUB-03
**Success Criteria** (what must be TRUE):
  1. Every digest email carries `List-Unsubscribe` (HTTPS URL) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers whose URL embeds an HMAC-SHA256 token over (wsId, userId) — domain-separated from the MASTER_KEY keyring, purpose-tagged, timing-safe-verifiable; the token format is frozen by unit tests (no migration, no table)
  2. When `MASTER_KEY` is unset, digest emails are sent with no List-Unsubscribe headers at all — no broken or `http://` links (fail-open honestly, pinned by test)
  3. The existing plain footer unsubscribe link still renders alongside the one-click header, and the Settings digest toggle remains the re-subscribe path (re-enabling `email_digest` makes the next morning's digest arrive again)
  4. DEPLOY.md documents the DKIM caveat (RFC 8058 §4 — one-click is honored on DKIM-authenticated mail; instances get it at their signing relay) and the MASTER_KEY-rotation-invalidates-old-links semantics
  5. Phase 38 suppression invariant and the second-boot/no-duplicate digest tests pass unmodified; zero runtime dependencies, zero migrations

Plans:
**Wave 1**
- [x] 41-01-PLAN.md — Token helpers + gated RFC 8058 headers + footer link, end-to-end (tracer) + format-freeze tests

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 41-02-PLAN.md — Gate-negative integration tests (D-05) + DEPLOY.md DKIM/rotation subsection

### Phase 42: One-Click Unsubscribe Endpoint

**Goal**: A mail-client one-click POST actually turns the digest off for that (workspace, user) — the milestone's Phase-30-class security surface, contract first
**Depends on**: Phase 41 (frozen token format)
**Requirements**: UNSUB-02
**Success Criteria** (what must be TRUE):
  1. A one-click POST from a logged-out mail client (no cookies, no sameOrigin — token is the auth) flips `email_digest=false` for exactly that (workspace, user) prefs row — creating the row if sparse — and the next morning's digest for that user does not arrive while individual reminder emails resume per Phase 38 semantics
  2. Repeat and replayed POSTs are convergent: identical generic responses, no token burn, no 410; GET on the token URL is a stateless no-op — a provider retry after transient failure never errors
  3. The response matrix has no existence oracle: valid, stale, rotated-out and forged tokens all receive the same generic response; token verification is timing-safe and the token path is redacted from request logs and never written to activity rows
  4. The route ships with a written security contract (token model, method allow-list, replay posture, response matrix, throttle on the login-family budget) pinned by tests before/with the route implementation — sameOrigin exemption documented at the route
  5. Phase 38 suppression invariant and second-boot/no-duplicate digest tests pass unmodified; full suite green, zero runtime dependencies

**Plans**: 2 plans

Plans:
- [ ] 42-01-PLAN.md — One-click route end-to-end: helpers, contract comment, security-contract test matrix (UNSUB-02, D-01..D-10/D-13)
- [ ] 42-02-PLAN.md — Push "coming soon" badge on the three inert toggles (D-11/D-12) *(v1.10)*

### Phase 43: Workspace Logo

**Goal**: A workspace can carry its own logo — uploaded by an admin, stored server-side, rendered wherever the workspace identity appears — with a clean fallback to `favicon.svg` when none is set
**Depends on**: Nothing (first phase of v1.10)
**Requirements**: LOGO-01 (to be added to REQUIREMENTS.md at milestone start — Kanzo task #16)
**Success Criteria** (what must be TRUE):
  1. An admin can upload an image (png/jpg/svg, size-capped) from Workspace > General > Workspace settings; the upload is stored server-side (documented location, documented serving route) and survives restart
  2. When no logo is set, every surface that shows the workspace identity falls back to `favicon.svg` byte-identically — no broken image, no layout shift on load
  3. Only Owner/Admin roles can upload or remove the logo (role gate pinned by test); any member sees it read-only
  4. Upload validation rejects non-images and oversized files with a localized error message (EN+FR catalogued, `npm run i18n:scan` green)
  5. Full suite green; no new runtime dependencies

**Plans**: 2 plans

Plans:
- [ ] 43-01-PLAN.md — Server-side logo routes: POST/DELETE/GET /w/:slug/logo, doc reference, magic-byte validation, workspacePayload.logo, lifecycle tests (D-01..D-04, D-08..D-11)
- [ ] 43-02-PLAN.md — Render surfaces: sidebar avatar, favicon swap, settings upload/remove UI, digest header logo (D-05..D-07, D-12)

### Phase 44: Per-Member Timezones *(v1.10)*

**Goal**: Each member's reminders and digest fire at their own 09:00 — multiple timezones supported, Paris as the default — replacing the single workspace-timezone model built on five hard-coded `TZ_BY_LABEL` labels
**Depends on**: Nothing structurally (parallel-safe with Phase 43); touches the reminder/digest scheduler window predicates
**Requirements**: TZ-01 (to be added at milestone start — Kanzo task #14)
**Success Criteria** (what must be TRUE):
  1. A member's reminder/digest 09:00 window resolves from THEIR timezone (Paris default when unset), not the first-membership workspace label — members in different timezones in the same workspace fire at their own local 09:00
  2. Arbitrary IANA timezone names are accepted (not just the five `TZ_BY_LABEL` labels); an unknown/empty value falls back to Paris (`Europe/Paris`) deterministically, pinned by test
  3. The exactly-once ledger keys remain correct under timezone change: changing a member's tz never re-fires an already-claimed reminder for the same local date (dedup key semantics documented and tested)
  4. Workspace Settings > Date & time exposes the timezone picker with common IANA zones (Paris preselected by default); existing stored tz labels migrate or degrade without loss
  5. All existing Phase 27/37/38 scheduler tests (window-open predicates, no-double-send, boot catch-up) pass unmodified or are deliberately re-pinned with rationale; full suite green

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 40. Digest Subject & Task Lines | 2/2 | Complete    | 2026-11-05 |
| 41. Unsubscribe Tokens & Headers | 2/2 | In Progress|  |
| 42. One-Click Unsubscribe Endpoint | 0/2 | Not started | - |
| 43. Workspace Logo | 0/? | Not started | - |
| 44. Per-Member Timezones | 0/? | Not started | - |

## Backlog

*(Empty — Phase 999.1 (Phase 37 deferred UAT Test 2: workspace name in digest subject +
project name on task lines) is consumed by v1.9 SUBJ-01/02, mapped to Phase 40. Remaining
Phase 39 audit recommendations stay `proposed` pending D-05 owner rulings and join only
when validated.)*

### Phase 999.2: Follow-up — Phase 41 email-notification audit decision: real browser push + toasts (BACKLOG)

**Goal:** Implement real browser push notifications and toast notifications, replacing the inert `push_mention`/`push_assign`/`push_comment` toggles (currently visible with a "coming soon" badge) and adding toast feedback for mentions/assignments.
**Source phase:** 41 (email-notification audit, Kanzo task projectsstudio#6)
**Deferred at:** 2026-11-05 during /gsd-verify-work 41 session (audit decisions)
**Follow-ups:**
- [ ] Test 1: Real web push (service worker + browser Notification) wired to the existing push_* pref keys, with a "coming soon" badge added to the Push section in Settings in the meantime (deferred 2026-11-05)
- [ ] Test 3: Toast notifications for mention/assign events (deferred 2026-11-05)
