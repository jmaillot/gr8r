# Phase 22: Operator Session Revocation - Context

**Gathered:** 2026-10-29
**Status:** Ready for planning

<domain>
## Phase Boundary

The instance operator can revoke all sessions of any non-owner user through a new operator-authorized route; the operator's own sessions survive a revoke-others action on themselves; owner targets are refused at the route (regression-tested); a workspace admin who is not the operator cannot revoke (privilege-matrix test). Revoked browsers sign out honestly via the existing central mid-session 401 teardown (`signedOutElsewhere`, D-28). The gate mechanism is a new `is_instance_admin` flag on users — the blocking decision ROADMAP flagged, resolved here (D-112). One cross-feature Chromium e2e covers the full v1.4 lifecycle in EN + FR, with no v1.3 test deleted or weakened.

Two deliverables (OPREV-01, OPREV-02):

1. **Operator gate + revoke route + operator UI** — `is_instance_admin` flag (bootstrap + boot stamp), `POST /api/auth/operator/users/:userId/revoke-sessions`, operator-only users-list route, and an operator-only settings card.
2. **Automated proof** — server-level privilege-matrix suite plus the lifecycle e2e in both languages.

Operator transfer, revoke-all-users, audit trail entries, and workspace-admin-tier revocation remain deferred per REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

### Operator identity gate (the ROADMAP-flagged blocking decision)
- **D-112:** The gate is an **additive `is_instance_admin` flag column** on `users` (integer not null default 0), checked by the route — not `ADMIN_EMAIL` matching and not `isAdminUser()`/workspace role. Workspace roles stay tenant-bound; a workspace admin without the flag fails the privilege-matrix test. ADMIN_EMAIL-derived and first-user-stamp alternatives were rejected (env dependency at request time; email-change breakage; invisibility). — **Reversibility:** costly — a users-table column with a default is a schema migration; the flag becomes the load-bearing privilege boundary of the operator surface, and every consumer (route, UI, tests) keys off it.
- **D-113:** The flag is set at **bootstrap + boot stamp**: `ensureAdmin` sets `is_instance_admin = 1` on the ADMIN_EMAIL bootstrap account, and a one-time boot migration stamps the ADMIN_EMAIL-matching account on existing databases if no user is flagged (pre-v1.4 installs get a working operator). Documented in the migration comment.
- **D-114:** **No operator transfer mechanism this phase.** Reassigning the flag is a documented manual DB update — same escape-hatch spirit as the key-custody deferral. A transfer route would be its own phase.

### Route & throttle shape
- **D-115:** The route is **`POST /api/auth/operator/users/:userId/revoke-sessions`** — auth-family namespace, action-style POST, no body required. Guard order mirrors every auth sibling (Pitfall 22): `sameOrigin` → `requireUser` → throttle → handler, with the operator gate after `requireUser`.
- **D-116:** Throttle budget **`operator-revoke|${operator.id}`, 5 attempts / 15 minutes, every attempt consumes a try** — the D-11 band. Keyed on the operator (caller), not the target.
- **D-117:** Response is **200 `{ revoked, remaining }`** — live post-delete counts (Pitfall 10), `Cache-Control: no-store` via `json()` — the exact envelope of `/api/auth/sessions/others`. Successful revocation records **`logSecurity(target.id, 'sessions_revoked_by_operator')`** — the Phase 20/21 mechanism; log after the transaction commits, before the response.
- **D-118:** The revocation itself is one delete: `delete from sessions where user_id = target.id and token_hash != currentOperatorToken` — the D-105/P-H shape. For a self-target this is exactly revoke-others (success criterion 2); for any other target the operator's token_hash differs from the target's rows, so all target sessions go. A self-target is **allowed** (not refused): the operator can clear their own other browsers through the same route.

### Owner immunity & refusal
- **D-119:** An owner target (bootstrap-flagged operator included) is refused with **403 `ownerImmune` before any session lookup** — the failure family of `crossOriginRejected`/`forbidden`. A refused attempt consumes a throttle try. Regression test: revoke an owner → 403, owner sessions untouched.

### Operator UI surface
- **D-120:** The trigger is an **operator-only card on the settings page** (`src/pages/settings.js`), not the members page — members is workspace-scoped (`D().members`) and would contradict instance-wide reach. The card lists instance users with a per-user revoke action and an inline confirmation (the D-90 inline-stage pattern). Owner rows show the action disabled/hidden with an "owners are immune" hint.
- **D-121:** The card's data comes from a **new operator-only read route** `GET /api/auth/operator/users` returning `id, name, email, is_instance_admin, last_login_at` (no session data). Same operator gate, same family guards; reads are not throttled.

### Test & e2e scope (success criterion 5)
- **D-122:** Server-level node:test suite covers the **privilege matrix**: operator succeeds on non-owner; workspace-admin-without-flag fails (403-style, target sessions intact); owner target refused (D-119); self-target revokes others only (D-118); throttle band (D-116). Server-level also covers: revoked token's next request 401s (the honest-teardown premise), and the users-list route's gate.
- **D-123:** One Chromium spec in EN + FR covers the **full lifecycle**: enroll → regenerate → login with 2FA → disable → re-enroll → operator revokes the user's sessions → revoked browser shows the honest `signedOutElsewhere` teardown while the operator's own session survives. No v1.3 e2e is deleted or weakened; new strings catalogued EN + FR (i18n-scan green) under the settings/operator namespace.

### the agent's Discretion
- Exact error code for the privilege-matrix failure (operator-gate rejection vs generic forbidden), i18n key names, card layout details within the settings-page patterns, test file placement within existing conventions, and route comment wording.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ground-truth code
- `server.js:93–105` — users table schema: where `is_instance_admin` is added (D-112).
- `server.js:937–955` — `ensureAdmin`: the bootstrap flag set + the boot-stamp location (D-113).
- `server.js:1893–1901` — `/api/auth/sessions/others` DELETE: the `{ revoked, remaining }` envelope and keep-current `!=` clause D-117/D-118 mirror.
- `server.js:1587, 1697` — the two revoke-others precedents (password change, disable).
- `server.js:1873–1891` — `GET /api/auth/sessions`: shape reference for the operator users-list route (D-121).
- Central honest 401 teardown + `signedOutElsewhere` — `src/main.js:79,213`, `src/actions/actions.js:2133–2139`; the mechanism D-123's e2e asserts.
- `logSecurity` mechanism (Phase 20, `server.js` regen route call site) — the verb recording pattern D-117 reuses.
- `src/pages/settings.js` — settings page the operator card joins; D-90 inline-stage pattern from the tfa card (`settings.js:391–432`).
- `src/locales/en.json`, `src/locales/fr.json` — i18n catalogue for new strings (D-123).
- `src/pages/members.js` — read for contrast only: workspace-scoped membership model D-120 rejected as the surface.

### Planning docs
- `.planning/REQUIREMENTS.md` § OPREV-01/OPREV-02 — locked requirement text and the deferred list (transfer, revoke-all, audit trail, admin tier).
- `.planning/ROADMAP.md` Phase 22 details — the five success criteria, including the flagged blocking gate decision resolved as D-112.
- `.planning/phases/21-disable-2fa-verification-closure/21-CONTEXT.md` — D-105 session-policy shape, D-107 logSecurity, D-109/D-110 e2e-vs-server test split this phase repeats.
- `.planning/phases/20-recovery-code-regeneration/20-CONTEXT.md` — D-11 throttle band, D-90 inline-stage UI pattern, D-99 logSecurity origin.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `/api/auth/sessions/others` route: complete response-envelope + keep-current-delete template for D-117/D-118.
- `logSecurity` + security-log UI path: verb recording is a solved pattern.
- Settings-card inline-stage machinery (Phases 20–21): the confirmation flow for the operator card.
- Existing Chromium e2e helpers and node:test server-suite conventions from Phases 20–21.

### Established Patterns
- Guard order `sameOrigin` → `requireUser` → throttle (Pitfall 22); D-11 throttle band; Pitfall-10 live post-delete counts; `Cache-Control: no-store` via `json()`.
- Schema evolution precedent: `migrateTotpEncryption` (Phase 19) and `migrateTenancy` show the boot-migration pattern D-113 joins.
- Defense-in-depth refusal: UI hides impossible actions; the server remains the hard boundary (D-120/D-119).

### Integration Points
- `ensureAdmin`/`bootstrap` (`server.js:955–960`): flag stamping integrates here without touching migration ordering guarantees.
- Central 401 teardown: session deletion needs no new push mechanism — deleted rows 401 on next request and the client does the rest (D-28).
- i18n-scan pipeline: new settings.operator.* strings must be catalogued.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — the discussion locked the gate mechanism, route/UI shape, and proof split; standard approaches cover the rest.

</specifics>

<deferred>
## Deferred Ideas

- **Operator transfer route** (reassign `is_instance_admin` via UI) — raised and explicitly deferred per D-114; a privilege-transfer surface is its own phase.
- Revoke-all-users shape, audit trail entries, workspace-admin revocation tier — already in REQUIREMENTS.md deferred list; unchanged.

</deferred>

---

*Phase: 22-Operator Session Revocation*
*Context gathered: 2026-10-29*
