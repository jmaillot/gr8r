---
phase: "57"
slug: "views-columns-general-access"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-12"
---

# Phase 57 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → /api/me/views routes | Untrusted PUT/DELETE body (workspace, key, blob, name) into per-user `saved_views` rows | member-supplied view blobs |
| stale clients → doc PUT | Pre-migration clients still shipping doc top-level `views` | crafted/legacy doc JSON |
| stored doc JSON → boot sweep | Hand-edited/crafted boot-time doc blobs parsed by `migrateUserViews()` | boot-time blob parse |
| client prefs blob → doc PUT | Member-crafted prefs copy claiming `defaultPrivate` | prefs merge funnel |
| stored blobs → GET | Old/corrupt blobs parsed and intersected on read | named-row blobs |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-57-01 | Tampering/Elevation | PUT /api/me/views | high | mitigate | server.js:4318-4342 — requireUser + sameOrigin + membership 404 (no-oracle); user_id from session only | closed |
| T-57-02 | Tampering | docSnapshot/mergeClientDoc/hydration | high | mitigate | Three-site `views` strip: store.js:321 (hydration), server.js:827 (read), server.js:1468 (merge); boot sweep idempotent (2666-2715, `insert or ignore`) | closed |
| T-57-03 | DoS | PUT live-row blob | medium | mitigate | server.js:4372 — `sanitizeViewBlob` whitelist intersection (1563-1579); 2 kB cap on named rows | closed |
| T-57-04 | DoS | named-row PUT | medium | mitigate | server.js:4349-4356 — 2048 B cap (`viewBlobTooLarge`), `NAMED_VIEW_MAX=20` (`viewLimitReached`), boundary-tested | closed |
| T-57-05 | Elevation | named-row routes | high | mitigate | GET/PUT/DELETE (4310/4341/4387) all address rows by `(workspace_id, user_id, key, name)` with session user | closed |
| T-57-06 | Tampering | apply/snapshot path | medium | mitigate | Whitelist both directions: server write 4347/4372, server read 4284-4299 (lenient corrupt handling); client mirror savedViews.js:18-28 + viewSync.js | closed |
| T-57-07 | Tampering | mergeClientDoc prefs | medium | mitigate | server.js:1463-1486 — `defaultPrivate` from STORED doc only; incoming normalized fail-closed (`=== true`) | closed |
| T-57-08 | Elevation | settings toggle | low | accept | settings.js:320 — rides existing owner-gated workspace-settings block; no new permission surface | closed |
| T-57-SC | Tampering | npm/pip/cargo installs | high | mitigate | No new runtime deps added this phase (all three SUMMARY `tech-stack.added: []`) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-57-01 | T-57-08 | Settings toggle rides the existing owner-gated workspace-settings block (same gating as `permCreate`); no new permission surface introduced (D-02) | security auditor verdict (user confirmed run) | 2026-11-12 |

---

## Observations (non-blocking)

- **Live-row blob has no byte cap** — only named rows enforce the 2 kB limit; `sanitizeViewBlob` intersects keys but does not deep-coerce value shapes, so large `filters`/`hidden` arrays could be persisted in the live row. Below the `high` block threshold and inside the plan's declared scope (cap scoped to named rows). Candidate for a future phase.
- Code review WR-01..WR-04 (57-REVIEW.md) remain open in the disposition ledger — none reach the high security threshold; tracked separately from this contract.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-12 | 9 (8 unique + shared SC) | 9 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-12
