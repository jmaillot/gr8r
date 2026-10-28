---
phase: 14-schema-session-ground-truth
reviewed: 2026-10-26T18:54:40Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/core/utils.js
  - src/data/seed.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/pages/settings.js
  - src/core/api.js (session methods / deviceLabel slice)
  - test/sessions.test.mjs
  - test/migration.test.mjs
  - test/error-codes.test.mjs
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-10-26T18:54:40Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the phase-14 session-ground-truth surface: the additive SCHEMA migration (session metadata columns, dormant 2FA columns, `login_challenges` table), the three `/api/auth/sessions*` endpoints, the throttled `touchLastSeen` heartbeat, the client API methods (`sessions`/`revokeSession`/`revokeAllSessions`), `deviceLabel()`, the settings Sessions tab, the locale keys in both catalogues, and the three phase test suites.

All three phase test suites were executed during this review and pass (sessions 5/5, migration 14/14, error-codes 24/24). The security posture of the new endpoints is sound: every mutation carries `sameOrigin` before the body read, the per-row revoke is scoped to the caller's `user_id`, the 12-hex id regex prevents `LIKE` wildcard injection, the full token hash never leaves the server, and revocation answers are idempotent 204/200 with no existence oracle. I independently verified the doc-strip double protection (D-30): `normalizeDoc` (server.js:305-306) and `docFromClient` (server.js:629-630) both strip `sessions`/`tfa`, and greps confirm no client module writes `D().sessions` or `tfa` anywhere.

The two warnings are client robustness gaps in the D-28 teardown contract — the sessions read path swallows a 401 that the write paths handle honestly — and a slug-collision race in workspace creation that re-runs the same failure mode `createUser` already fixed (WR-06). No blockers found.

Verification commands run:
- `node --test test/sessions.test.mjs` → 5 pass, 0 fail
- `node --test test/migration.test.mjs` → 14 pass, 0 fail
- `node --test test/error-codes.test.mjs` → 24 pass, 0 fail
- `node --test` on the i18n count claim: both catalogues hold 1549 keys including the 11 phase-14 keys (`dev.*` ×10, `err.signedOutElsewhere`) — verified by direct JSON parse of en/fr.

## Warnings

### WR-01: `refreshSessions()` swallows a 401 — the sessions surface never triggers the D-28 teardown on a dead session

**File:** `src/actions/actions.js:1800-1808` (call site `:210`)
**Issue:** `refreshSessions()` returns `null` for any non-ok response with no status discrimination:

```js
const res = await api.sessions();
if (!res.ok) return null;
```

The write paths of the same surface (`A.revokeSession` :2396-2397, `A.revokeAll` :2412-2413) correctly route a 401 to `signOutRevoked()`, and D-28's contract is that *any* 401 from a revoked session delivers the "signed out elsewhere" teardown. But the read path bypasses it: a browser revoked elsewhere that navigates to Settings → Sessions gets a silent `null`, renders an empty device list ("Devices currently signed in to your account." with the revoke-all button disabled) and stays in a zombie authenticated-looking UI until an unrelated save fails. The bare call at the mount hook (`A.go`, :210) doesn't await or handle the result either.
**Fix:** Discriminate the status:

```js
export async function refreshSessions() {
  if (!api.enabled) return null;
  const res = await api.sessions();
  if (!res.ok) {
    if (res.status === 401) await signOutRevoked();
    return null;
  }
  S.ui.sessions = res.data.sessions || [];
  S.ui.sessionsLoaded = true;
  render();
  return res.data;
}
```

### WR-02: `createWorkspace` slug race surfaces an unhandled UNIQUE violation as a raw 500, not `slugTaken` 409

**File:** `server.js:1443-1450` (endpoint), `server.js:1040-1059` (`createWorkspace`)
**Issue:** `POST /api/workspaces` checks `wsBySlug(slug)` (:1447) then `createWorkspace` re-derives the slug with `uniqueSlug` and inserts the workspace row *without* wrapping the check-then-insert in a transaction or a UNIQUE-constraint catch. `openDb` creates `workspaces_slug_idx` (server.js:177), so two concurrent workspace creations with the same requested slug can both pass the pre-check; the loser hits the UNIQUE constraint and falls to the catch-all 500 handler with a raw SQL error, losing its `code` field — exactly the TOCTOU race the phase-13 fix for `createUser` (WR-06, server.js:1027-1035) already solved for accounts. Logged-in admins only, so likelihood is low, but the failure mode is inconsistent with the house pattern and emits an undocumented error shape.
**Fix:** Reuse the WR-06 pattern — catch the UNIQUE violation and map it to the existing 409:

```js
try {
  const ws = createWorkspace(name, slug, user);
  return json(res, 201, { workspace: workspacePayload(ws, membershipOf(ws.id, user.id)) });
} catch (err) {
  if (/UNIQUE|workspaces\.slug/i.test(String(err?.message || ''))) {
    return fail(res, 409, 'slugTaken', 'That URL is already taken', { suggestion: uniqueSlug(slug) });
  }
  throw err;
}
```

## Info

### IN-01: `S.ui.sessionsLoaded` is written but never read — dead state flag

**File:** `src/actions/actions.js:1805` (also referenced in a comment at `src/pages/settings.js:390-394`)
**Issue:** `refreshSessions()` sets `S.ui.sessionsLoaded = true`, but no module reads it (verified by grep across `src/`). The Sessions case renders `S.ui.sessions || []` unconditionally, so "loading", "load failed", and "zero sessions" all render identically as an empty list — and the flag implies an empty‑vs‑loaded distinction that was never wired up.
**Fix:** Either consume the flag in `settings.js` (`case 'sessions'` → render a loading/error state while `!S.ui.sessionsLoaded`), or delete the write until a consumer exists.

### IN-02: Masked operator precedence in the last-seen ternary

**File:** `src/pages/settings.js:402`
**Issue:** `esc(s.lastSeenAt || s.createdAt ? ago(s.lastSeenAt || s.createdAt) : '—')` parses as `(s.lastSeenAt || s.createdAt) ? ago(...) : '—'` — the `||` binds tighter than `?:`. The behavior is correct (the else arm is unreachable today because the server always sets `created_at`), but the missing parentheses read as `s.lastSeenAt || (s.createdAt ? … : …)`, inviting a future edit to change the meaning silently.
**Fix:**

```js
` · ${esc((s.lastSeenAt || s.createdAt) ? ago(s.lastSeenAt || s.createdAt) : '—')}`
```

### IN-03: Hardcoded English "then" in the shortcuts rendering bypasses i18n

**File:** `src/pages/settings.js:374`
**Issue:** `<span class="faint" ...>then</span>` is a raw literal in a file whose own neighboring comment block (utils.js:48-50, and the settings.js import of `t`) establishes the "every visible token is a catalogue key" rule. French users see the English word in chord sequences. Pre-existing code outside the phase-14 diff, flagged here because settings.js is in the reviewed scope.
**Fix:** Add an `act.pressThen` (or `common.then`) key to both catalogues and use `t('common.then')`.

### IN-04: `sessions.label` column has no producer or consumer

**File:** `server.js:103, 170` (SCHEMA + `ensureColumn`)
**Issue:** The `label` column is declared in the SCHEMA, migrated additively, and tested byte-identically (migration.test.mjs:229) — but no insert ever writes it and no read path selects it. The 2FA columns and `login_challenges` are documented as dormant (server.js:168); `label` is not, so the next reader can't tell forward-compat scaffolding from dead schema. Every session renders from `user_agent` alone today.
**Fix:** Either document it as dormant alongside the 2FA comment (server.js:168-176) or drop it from both the SCHEMA and the migration until the labeling feature lands.

### IN-05: Revocation failure fallback toast reads `err.sessionExpired` for non-401 failures

**File:** `src/actions/actions.js:2398, 2414`
**Issue:** `toast(res.error || t('err.sessionExpired'), { kind: 'err' })` uses the session-expired message as the generic fallback. On a network failure (`status 0`, error "Server unreachable") or a 403 (`crossOriginRejected`), the user is told their session expired when it didn't. The 401 branch is handled correctly above; only the residual fallback is mislabeled.
**Fix:** Fall back to the neutral `t('err.serverUnreachable')` (already catalogued in both locales) for non-401 failures, and reserve `err.sessionExpired` for the main.js mid-session 401 handler that owns it per the CLIENT_ONLY_ERR_CODES annotation.

---

_Reviewed: 2026-10-26T18:54:40Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
