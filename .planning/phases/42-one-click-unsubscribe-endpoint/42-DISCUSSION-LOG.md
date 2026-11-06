# Phase 42 Discussion Log

**Date:** 2026-11-06
**Mode:** default (all four gray areas selected by user)

## Questions & Decisions

| # | Area | Question | Decision |
|---|------|----------|----------|
| 1 | Response | POST with valid token | 200 + minimalist self-contained HTML page, language from token's workspace (D-01/D-02) |
| 2 | Response | POST with invalid/stale/rotated/forged token | 200 + same page, neutral generic text; identical envelope, no oracle (D-03/D-04) |
| 3 | Methods | GET on token URL | 200 + neutral page, zero mutation, stateless no-op (D-05) |
| 4 | Methods | Other methods | 405 generic JSON; allow-list exactly {GET, POST} (D-06) |
| 5 | Methods | SameOrigin/session guards | Route explicitly sameOrigin-exempt, bypasses Fetch-Metadata nav guard, documented (D-07) |
| 6 | Throttle | Throttle mechanism | Existing login-family IP rate limiter budget; no new counter (D-08) |
| 7 | Replay | Burn/410/claim semantics | None — convergent idempotent re-write, no token burn (D-09) |
| 8 | Push badge | Placement | Badge on the 3 inert push toggles only; due_reminder/past_due stay badge-free (D-11) |
| 9 | Push badge | Toggle behavior | Unchanged — clickable, informational badge only (D-12) |

## Agent Discretion Items
- HTML page construction, i18n mechanism for page texts, 405 envelope reuse, robots meta choice, log-redaction implementation point.

## Deferred Ideas
- Per-type one-click unsubscribe for mention/assign/comment emails → revisit with push/toasts (backlog 999.2).
- Real push notifications + toasts → backlog 999.2.
