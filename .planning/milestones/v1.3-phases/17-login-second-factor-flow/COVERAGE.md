# Phase 17 — Coverage Artifacts

## External API Coverage

No external API integration: this phase touches only the project's own first-party endpoints (`/api/auth/login` branch, new `POST /api/auth/tfa/login`, logout extension) via the existing zero-dependency in-repo API client — the detector's "api/endpoint" signals all refer to internal routes, not third-party services.

## Assumption Delta Decision

<assumption_delta_decision>
- primary_noun: auth endpoint (internal /api/auth route)
- decision: no-change
- rationale: The fired pluralization signal ("consuming endpoints" / "wiring api") references the project's own first-party API client and routes — no external API, SDK, or service is adopted in Phase 17, so there is no assumption to promote or extend.
</assumption_delta_decision>
