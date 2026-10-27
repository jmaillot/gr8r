# Phase 16 — API Coverage Decision

**Detector verdict:** `detected: true` — the signal is a prose match ("API/Backend" tier naming in 16-RESEARCH.md), not an actual external API integration.

**Decision: no external API integration.** TOTP is `node:crypto` (stdlib), the QR encoder is a vendored source file copied verbatim (never called over the network at runtime), and all new routes are internal `/api/auth/tfa/*` endpoints over the existing SQLite database.

## Capability Matrix

| Capability | Decision | Reason |
|------------|----------|--------|
| external-http-api | OPT-OUT | No external service is integrated; all new endpoints are internal TFA routes over the existing SQLite database. |
| third-party-sdk | OPT-OUT | TOTP uses stdlib node:crypto only; the QR encoder is a vendored file, not an SDK dependency. |
