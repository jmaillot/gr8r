# Phase 14: Schema & Session Ground Truth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-26
**Phase:** 14-Schema & Session Ground Truth
**Areas discussed:** Session metadata capture, last_seen_at freshness, API shape & 401 UX, Legacy doc-field stripping

---

## Session metadata capture

**Q1 — Where does the device label come from?**

| Option | Description | Selected |
|--------|-------------|----------|
| Store raw UA | Server stores raw User-Agent string per session; client renders friendly label via existing isMac-style sniffing | ✓ |
| Parse label at login | Server parses UA into compact device string; regex table server-side | |
| Client-reported label | Client sends self-reported device name at login; spoofable | |

**Q2 — What happens to the location column?**

| Option | Description | Selected |
|--------|-------------|----------|
| Drop location | Sessions page drops the location column entirely; geolocation out of scope | ✓ |
| Show locale instead | Coarse locale/timezone hint from Accept-Language | |
| Keep placeholder | Location column with '—' until a future milestone | |

**Q3 — When is IP captured?**

| Option | Description | Selected |
|--------|-------------|----------|
| IP at login | clientIp(req) captured once at login into an `ip` column | ✓ |
| IP per request | Updated every authenticated request; write on hot path | |

**Q4 — How is 'last seen' presented?**

| Option | Description | Selected |
|--------|-------------|----------|
| Epoch + client render | Relative-time integer; client formats in viewer's locale | ✓ |
| Server-formatted string | Server renders preformatted string; breaks client-side t() catalogue pattern | |

**Notes:** User consistently favored keeping the server dumb and rendering on the client.

---

## last_seen_at freshness

**Q1 — When does last_seen_at get written?**

| Option | Description | Selected |
|--------|-------------|----------|
| Throttled update | Write only when stale beyond a threshold (~60 s) | ✓ |
| Write per request | Every authenticated request | |
| Periodic sweeper | Not actually simpler — needs request-time bookkeeping anyway | |

**Q2 — Where does throttle state live?**

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory map | Map<token_hash, next-eligible-ts>, same pattern as `attempts` map | ✓ |
| DB-side guard | SQL-level no-op guard; saves nothing over the map | |

**Q3 — What exactly does the throttled write touch?**

| Option | Description | Selected |
|--------|-------------|----------|
| Only last_seen | Only last_seen_at; login/logout keep their own writes | ✓ |
| Also touch other fields | No such fields needed | |

**Q4 — What do pre-migration sessions show?**

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to created_at | Honest 'never seen since upgrade' semantics; no boot backfill | ✓ |
| Show 'unknown' | NULL rendered as 'unknown'; extra i18n string | |

**Notes:** User chose honest degenerate states (created_at fallback) over placeholder data.

---

## API shape & 401 UX

**Q1 — Endpoint shape for list + revokes?**

| Option | Description | Selected |
|--------|-------------|----------|
| 3 RESTful routes | GET /sessions, DELETE /sessions/:id, DELETE /sessions/others | ✓ |
| Single action endpoint | POST /sessions/revoke with body selector | |

**Q2 — Row identifier exposed to the client?**

| Option | Description | Selected |
|--------|-------------|----------|
| Server-issued row ids | Opaque short ids resolved server-side; token_hash never leaves the server | ✓ |
| Expose token_hash | 64-char credential-shaped string in the DOM | |

**Q3 — Revoked-browser experience on next request?**

| Option | Description | Selected |
|--------|-------------|----------|
| Toast + redirect | Clear state, honest 'signed out' toast, redirect to /login | ✓ |
| Silent redirect | No explanation | |
| Interstitial page | 'Session ended' page with manual continue | |

**Q4 — How does the list stay current?**

| Option | Description | Selected |
|--------|-------------|----------|
| On-mount + after action | Fetch on tab mount and after each revoke | ✓ |
| Poll while visible | Interval polling on a settings page | |

**Notes:** None beyond the selections.

---

## Legacy doc-field stripping

**Q1 — How do sessions/tfa leave stored docs?**

| Option | Description | Selected |
|--------|-------------|----------|
| Strip in normalizeDoc | Stop emitting + drop on load; converges on first save; one code path | ✓ |
| One-time boot pass | Boot rewrites every doc row; write-per-doc boot cost | |
| Serve-side filter only | Fails Phase 13 drift guard | |

**Q2 — Which columns land in the migration?**

| Option | Description | Selected |
|--------|-------------|----------|
| All Phase 16 cols now | sessions.label/ip/last_seen_at/user_agent + login_challenges + users.2FA cols incl. replay guard — one migration wave | ✓ |
| Split per phase | Only sessions columns now; 2FA columns wait for Phase 16 | |

**Q3 — How is the drift guard enforced?**

| Option | Description | Selected |
|--------|-------------|----------|
| Doc-shape test | Unit test asserts sessions/tfa absent from emptyDoc()/seedDoc(); boot test covers churn | ✓ |
| DB scan test | Scan a live DB copy for surviving keys; heavier | |

**Q4 — When do client stubs get rewired?**

| Option | Description | Selected |
|--------|-------------|----------|
| Rewire in Phase 14 | Client echoes of doc fields deleted/rewired same phase | ✓ |
| Client cleanup later | Smaller diff now; broken settings page between phases | |

**Notes:** Phase 13's D-01/D-04 pinning (2FA columns + login_challenges in this phase's migration) was restated in the question and confirmed by the choice.

---

## the agent's Discretion

- Exact last_seen_at staleness threshold (~60 s band); opaque id scheme details
  (rowid vs hash-prefix)
- Client-side UA-label rendering heuristics (following isMac sniff pattern)
- Test file placement following existing test/ conventions; route handler
  ordering within /api/auth/*
- Exact toast copy for the 401 handler within the honest-copy rule (EN+FR)

## Deferred Ideas

None — discussion stayed within phase scope.
