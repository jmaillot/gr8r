# Phase 41 — API Coverage Decision

**Declaration:** No external API integration: this phase emits RFC 8058 email headers and signs a stateless HMAC token with `node:crypto` only — zero new packages, no external service calls (RESEARCH.md "Supporting: None", Package Legitimacy Audit empty).

No coverage matrix required. The phase has no external service surface; every conceivable capability row is an explicit opt-out.

| capability | decision | reason |
|------------|----------|--------|
| email-deliverability (RFC 8058 one-click) | INTEGRATE | native `node:crypto` HMAC tokens + List-Unsubscribe headers — no third-party API, zero new packages |
| unsubscribe-management-service (external SaaS e.g. Mailgun/SendGrid suppression lists) | OPT-OUT | not needed — stateless local tokens satisfy UNSUB-01/03; external suppression sync tracked for a future phase |
| webhook-provider (one-click callback integration) | OPT-OUT | not needed — RFC 8058 POST is handled by Phase 42's own endpoint, no provider involved |
