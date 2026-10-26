# Phase 14: Schema & Session Ground Truth - Context

**Gathered:** 2026-10-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Auth state stops being decorative JSON: the `sessions` table gains real per-row
metadata (label, ip, last_seen_at, user_agent), the full set of 2FA columns and the
`login_challenges` table land in the same additive AUTH-02 migration, the fake
`sessions`/`tfa` fields are stripped from the workspace document (server + client +
seed), and the sessions page drives a genuine revocation primitive —
revoke-others and per-row revoke — that Phase 15 (password change) reuses.
Byte-identical second boot is proven by the extended `test/migration.test.mjs`.

No password change (Phase 15), no TOTP behavior (Phase 16 — this phase only lands
the dormant columns), no login second-factor flow (Phase 17).

</domain>

<decisions>
## Implementation Decisions

### Session metadata capture

- **D-18:** Device label comes from the **raw User-Agent string**, stored per
  session at login in a `user_agent` column; the **client** renders the friendly
  label ('Mac · Chrome') from it using the existing `isMac`-style sniffing
  pattern (`src/core/utils.js:41`). The server stays dumb — no UA parsing
  server-side, zero-deps held, raw evidence preserved. — **Reversibility:**
  reversible — storing the raw string keeps every future parsing option open;
  only the client-side renderer would change.
- **D-19:** The **location column is dropped** — no `loc` data anywhere, no
  placeholder column. Geolocation is explicitly out of scope (REQUIREMENTS.md);
  the seed's 'San Francisco, US' entries die with the seed mirror. Sessions rows
  show device label + IP + last-seen only.
- **D-20:** **IP is captured once at login** via the existing `clientIp(req)`
  helper into an `ip` column — not updated per-request (a rotating IP won't
  churn the display; the hot path stays write-throttled).
- **D-21:** `last_seen_at` is an **epoch integer; the client renders relative
  time** ('Active now' / '2 hours ago') in the viewer's locale via the existing
  `t()` catalogue — no server-side date formatting, consistent with the i18n
  pattern (catalogues are client-side JSON, `t()` never escapes).

### last_seen_at freshness

- **D-22:** **Throttled update:** `currentUser()` (`server.js:1125-1131`) writes
  `last_seen_at` only when the stored value is stale beyond a threshold
  (~60 s; exact constant is implementation discretion). One write per active
  minute max instead of a write per request on the hottest path.
- **D-23:** Throttle eligibility state lives in an **in-memory Map**
  (`token_hash → next-eligible-ts`), the same pattern as the existing `attempts`
  map (`server.js:1163`). A restart losing the map means one extra write after
  boot — harmless. No SQLite table for this.
- **D-24:** The throttled write touches **only `last_seen_at`** — login/logout
  paths keep their own writes; no other field is touched during request
  handling.
- **D-25:** Pre-existing sessions with `NULL last_seen_at` **fall back to
  `created_at` for display** — honest 'never seen since upgrade' semantics, no
  boot backfill (Pitfall 21 prohibits per-user generation at boot).

### API shape & 401 UX

- **D-26:** **Three RESTful routes** on the existing `/api/auth/*` family:
  `GET /api/auth/sessions` (caller's rows), `DELETE /api/auth/sessions/:id`
  (one row), `DELETE /api/auth/sessions/others` (everything but the caller).
  Matches the flat noun-resource style of the existing auth endpoints
  (`server.js:1225-1315`).
- **D-27:** Per-row revoke uses **server-issued opaque short ids** (rowid or
  hash prefix) resolved server-side to the full `token_hash`; the token hash
  never leaves the server. — **Reversibility:** costly — the id scheme is baked
  into the client actions and the SESS-02/SESS-03 tests; changing it later
  means re-doing both test files and the client wiring.
- **D-28:** A revoked browser's next request hits the **401 handler: clear
  stale state, honest 'You have been signed out' toast, redirect to /login**
  — reuses the existing `signOut` action and the v1.2 honest-copy rule. No
  silent redirect, no interstitial page.
- **D-29:** The sessions list **refreshes on settings-tab mount and after each
  successful revoke** — no polling, no sockets. Settings-page staleness
  elsewhere is accepted.

### Legacy doc-field stripping

- **D-30:** The `sessions`/`tfa` fields are stripped **in `normalizeDoc()`**
  (`server.js:759-810`): stop emitting them, drop them when present in stored
  docs — every doc load sanitizes and the next save persists the clean shape.
  One code path, converges on first load, zero extra migration machinery. The
  byte-identical second-boot test is unaffected because stripping converges on
  the first boot. — **Reversibility:** one-way — once client code stops
  reading these fields and the Phase 13 drift guard test pins their absence,
  re-adding them is a schema-contract change across server, client and seed.
- **D-31:** The additive migration lands the **full dormant column set now**:
  `sessions.label`, `sessions.ip`, `sessions.last_seen_at`,
  `sessions.user_agent` + the `login_challenges` table (D-01 shape:
  `challenge_token_hash` PK, `user_id`, `expires_at`, `attempts`) +
  `users.two_fa_enabled`, `users.two_fa_secret`, `users.two_fa_last_step`
  (replay guard, D-04). Phase 16 flips behavior onto the dormant columns; no
  second migration wave. Guarded-create / `ensureColumn` style
  (`server.js:134-137`); no backfill at boot (Pitfall 21).
- **D-32:** The Phase 13 drift guard is a **doc-shape unit test**: build
  `emptyDoc()` and `seedDoc()`, assert the JSON keys `sessions` and `tfa` are
  absent (build-locales.test.mjs-style); the byte-identical second-boot
  snapshot in `test/migration.test.mjs` proves no doc mutation churn.
- **D-33:** Client stubs referencing the doc fields — `A.revokeSession`
  (`src/actions/actions.js:2371`), `A.revokeAll` (:2377), `A.verify2fa`/`D().tfa`
  (:2409), the settings sessions/2FA renderer (`src/pages/settings.js:390-421`),
  the seed mirror (`src/data/seed.js:509-514`) — are **deleted or rewired to the
  new API in this same phase**. No dormant client references; the doc fields
  and their client echoes die together.

### Agent's Discretion

- The exact `last_seen_at` staleness threshold (D-22 band ~60 s) and the opaque
  id scheme details (D-27: rowid vs hash-prefix).
- The friendly UA-label rendering heuristics client-side (D-18), following the
  existing `isMac` sniff pattern.
- Test file placement following existing `test/` conventions; exact route
  handler ordering within the `/api/auth/*` family.
- Exact toast copy for D-28 within the honest-copy rule (catalogued EN+FR).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pinned contracts (Phase 13 — binding for this phase)
- `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` — the
  canonical D-01…D-17 citation target; D-01 (login_challenges DDL), D-04
  (replay-guard column), D-02 (sessions-table purity) and the "Doc-field removal
  scope (lands in Phase 14)" section are load-bearing here
- `.planning/phases/13-investigation-invariant-pinning/13-CONTEXT.md` — locked
  ground truth behind the D-NN contracts

### Milestone planning docs
- `.planning/ROADMAP.md` — Phase 14 goal + success criteria (SESS-01–03, AUTH-02)
- `.planning/REQUIREMENTS.md` — SESS-01–03, AUTH-02 definitions; out-of-scope
  list (geolocation, live session tracking) that D-19 enforces
- `.planning/STATE.md` — "Key Decisions for Planning" (revocation keep-current
  SQL, migration guarantees, doc-field removal)
- `.planning/research/SUMMARY.md` — root-cause confirmation and phase approach
- `.planning/research/PITFALLS.md` — Pitfall 9 (revoke self-DoS), Pitfall 21
  (no boot backfill), Pitfall 11 (one session tier)

### Code-anchored references
- `test/migration.test.mjs` (no-op snapshot test at :188) — the template the
  byte-identical second-boot extension must follow
- `server.js:134-137` (`ensureColumn`) — the guarded additive-migration pattern
- `DEPLOY.md` — env block context (SESSION_DAYS etc.); no new env vars required
  by this phase's decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sessions` table + `currentUser()` join (`server.js:1125-1131`): the
  revocation primitive's ground truth — `token_hash != sha256(current cookie)`
  keep-current is pure SQL on it; Phase 14 adds label/ip/last_seen_at/user_agent
  via `ensureColumn`
- `ensureColumn(conn, table, name, def)` (`server.js:134-137`): the established
  additive migration pattern for all new columns
- `clientIp(req)` (existing helper, precedent at `server.js:1235`): reused
  unchanged for the D-20 login-time IP capture
- `tooMany()` in-memory map pattern (`server.js:1163`): the template D-23's
  last-seen eligibility map copies
- `test/migration.test.mjs` snapshot test (:188): second-boot byte-identical
  no-op template extended by this phase
- Client `isMac` sniff (`src/core/utils.js:41`): the UA-label rendering pattern
  for D-18

### Established Patterns
- Zero runtime dependencies (PROJECT.md core decision) — no UA-parser library;
  client-side sniffing only
- Honest-copy rule (v1.2): the D-28 401 toast and revoke toasts state what
  actually happened
- i18n: every new string catalogued EN+FR, `t()` client-side, scan gate before
  bundler — D-21's relative-time rendering follows it
- Server tests never mock SQLite or HTTP; each test file owns its server +
  temp database (v1.1 carry-forward) — the new endpoint tests follow this
- `normalizeDoc()` as the doc-sanitizing choke point (`server.js:810`) — D-30's
  stripping lives there, one code path

### Integration Points
- `POST /api/auth/login` (`server.js:1225`) and signup (:1283) sessions inserts
  (`server.js:1244`, `:1307`): gain the ip/user_agent writes at creation; the
  invite-accept insert (:1714) also creates sessions — same columns apply
- `requireUser()` (`server.js:1134`): stays untouched structurally; only gains
  the D-22/D-24 throttled last_seen write beside the existing join
- Settings page sessions tab (`src/pages/settings.js:390-402`): rewired from
  doc fields to `GET /api/auth/sessions` data; revoke buttons rewire to the
  DELETE routes
- `emptyDoc()` (`server.js:759-775`) + `src/data/seed.js:509-514`: the doc-field
  removal targets (D-30/D-32)
- Logout + expiry sweepers (`server.js:1257`, `:2173-2174`): unchanged; revoked
  rows simply vanish from the GET list

</code_context>

<specifics>
## Specific Ideas

- The user consistently chose the option that keeps the **server dumb and the
  client rendering**: raw UA stored (not parsed server-side), epoch timestamps
  rendered client-side, IP captured once rather than churned per request.
  Prefer this bias in any follow-up implementation question.
- The user chose **honest degenerate states** twice: dropped location column
  (no placeholder) and created_at fallback for never-seen sessions — no fake
  data anywhere, matching the project's "never ships a backend that lies" core
  value.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-Schema & Session Ground Truth*
*Context gathered: 2026-10-26*
