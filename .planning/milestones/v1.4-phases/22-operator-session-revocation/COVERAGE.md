# API Coverage — Phase 22: Operator Session Revocation

No external API integration: the phase adds two in-house routes (`POST /api/auth/operator/users/:userId/revoke-sessions`, `GET /api/auth/operator/users`) and a settings card on a zero-runtime-dependency Node server — no third-party or external service is called or consumed.
