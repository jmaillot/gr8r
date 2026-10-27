# Phase 17: Login Second-Factor Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-27
**Phase:** 17-Login Second-Factor Flow
**Areas discussed:** Second-step screen shape, Input & error contract, Pending-state client contract, Recovery-code UX at login

---

## Second-step screen shape

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated full-screen step | New `s === '2fa'` state rendering authShell() with its own card | ✓ |
| Inline swap on the login card | Login card swaps fields in place — new pattern for auth.js | |
| You decide | — | |

| Option | Description | Selected |
|--------|-------------|----------|
| Back link, challenge abandoned | Clear challenge cookie, return to login; throttle budget preserved | ✓ |
| No back link | Must complete or let challenge expire | |

| Option | Description | Selected |
|--------|-------------|----------|
| Masked email | e.g. j***@d***.com, helps multi-account users | ✓ |
| No email shown | Minimal disclosure | |

| Option | Description | Selected |
|--------|-------------|----------|
| Server sends masked email | In login response payload; nothing persisted | ✓ |
| Client masks locally | Breaks on mid-challenge reload | |
| You decide | — | |

**User's choice:** All recommended options.
**Notes:** None.

---

## Input & error contract

| Option | Description | Selected |
|--------|-------------|----------|
| One dual-shape field | Server decides by shape; mirrors D-57 disable flow | ✓ |
| Two fields with a toggle | Explicit UX but more surface + attacker signal | |
| You decide | — | |

| Option | Description | Selected |
|--------|-------------|----------|
| One error code for both | No recovery-code liveness oracle | ✓ |
| Distinct codes | Enumeration oracle on recovery codes | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per D-03 exactly | 3 wrong / 5 min kills challenge; budget persists | ✓ |
| Challenge survives 3 misses | Would need explicit D-03 override | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per D-03/D-11 mechanics | No delay, no extra logging | ✓ |
| Add failure delay | Pitfall 18 optional sleep(50) | |
| You decide | — | |

**User's choice:** All recommended options.
**Notes:** None.

---

## Pending-state client contract

| Option | Description | Selected |
|--------|-------------|----------|
| 200 {pending2fa} + challenge cookie | Short-lived cookie, no session, no user payload | ✓ |
| 401 with pending marker, no cookie | Even more inert; masked email in error body | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated verify route | sameOrigin + D-11 throttle + challenge cookie; atomic delete + session mint | ✓ |
| Extend /api/auth/login | Second identity-minting path in one handler | |

| Option | Description | Selected |
|--------|-------------|----------|
| No persistence — reload = login form | Challenge expires server-side; no client auth-state mirror | ✓ |
| sessionStorage flag | Decorative client auth state | |

| Option | Description | Selected |
|--------|-------------|----------|
| Matrix as scoped in ROADMAP | API route, file route, invite accept, me PATCH + me GET + logout | ✓ |
| Exhaustive per-route matrix | Redundant given requireUser()-only path | |

**User's choice:** All recommended options.
**Notes:** None.

---

## Recovery-code UX at login

| Option | Description | Selected |
|--------|-------------|----------|
| Straight to session | Burn = authentication event; same transaction mints session | ✓ |
| Burn + password again | Extra friction on the recovery path | |

| Option | Description | Selected |
|--------|-------------|----------|
| Post-login banner | "Recovery code used — N left" + settings link | ✓ |
| Silent | No additional surface | |
| You decide | — | |

| Option | Description | Selected |
|--------|-------------|----------|
| Escalate copy at zero left | "Last recovery code — generate new ones" | ✓ |
| Uniform banner | Simpler, user learns late | |
| You decide | — | |

| Option | Description | Selected |
|--------|-------------|----------|
| Normal landing — home | Same as a normal login | ✓ |
| Land on settings 2FA | Surprising navigation for a login | |

**User's choice:** All recommended options.
**Notes:** None.

---

## the agent's Discretion

- Challenge-cookie name/attributes (separate from session cookie, ~5 min Max-Age, httpOnly/sameSite per existing style)
- Verify-route path name and remaining-recovery-count payload key
- Masking algorithm (must not enable enumeration)
- Test file placement/structure (tfa-enrollment.test.mjs model)
- New locale keys EN+FR in-commit
- Exact generic lockout replacement copy within D-13's contract

## Deferred Ideas

- None raised during this discussion (admin 2FA reset remains deferred from Phase 16).
