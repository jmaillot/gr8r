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

<details>
<summary>✅ v1.8 Notification Sanity (Phases 36-39) — SHIPPED 2026-11-05</summary>

- [x] Phase 36: Server Notification i18n (4/4 plans) — completed 2026-11-04
- [x] Phase 37: Reminder Cadence Rework (4/4 plans) — completed 2026-11-05
- [x] Phase 38: Daily Digest & Reminder Suppression (3/3 plans) — completed 2026-11-04
- [x] Phase 39: Notification Audit, doc-only (1/1 plan) — completed 2026-11-05

Details: [.planning/milestones/v1.8-ROADMAP.md](milestones/v1.8-ROADMAP.md)

</details>

## Phases

- [ ] **Phase 40: Digest Subject & Task Lines** - Workspace name in the digest subject, "Project — Task" lines, and a hardened RFC 2047 subject builder (SUBJ-01..03)
- [ ] **Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers** - Stateless HMAC unsubscribe token, List-Unsubscribe/-Post headers on digest mail, footer link preserved, DEPLOY.md DKIM caveat (UNSUB-01, UNSUB-03)
- [ ] **Phase 42: One-Click Unsubscribe Endpoint** - The codebase's first anonymous mutating route: `POST /unsubscribe/:token` with a security contract first (UNSUB-02)

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

**Plans:** 1/2 plans executed

Plans:
- [x] 40-01-PLAN.md — Hardened `encodeWord` (C0 strip), `truncate` helper, hostile-name tests (SUBJ-03)
- [ ] 40-02-PLAN.md — `[WS]` subject via `subjectWs` key, server-side project resolution, `Project — Task` lines, digest test extensions (SUBJ-01/02)

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

**Plans**: TBD

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

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 40. Digest Subject & Task Lines | 1/2 | In Progress|  |
| 41. Unsubscribe Tokens & Headers | 0/? | Not started | - |
| 42. One-Click Unsubscribe Endpoint | 0/? | Not started | - |

## Backlog

*(Empty — Phase 999.1 (Phase 37 deferred UAT Test 2: workspace name in digest subject +
project name on task lines) is consumed by v1.9 SUBJ-01/02, mapped to Phase 40. Remaining
Phase 39 audit recommendations stay `proposed` pending D-05 owner rulings and join only
when validated.)*
