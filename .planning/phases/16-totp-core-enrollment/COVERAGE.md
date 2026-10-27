# Phase 16 — API Coverage Decision

**Detector verdict:** `detected: true` — but the signal is a prose match ("API/Backend" tier naming in 16-RESEARCH.md's Architectural Responsibility Map), not an actual external API integration.

**No external API integration:** Phase 16 integrates zero external services — TOTP is ~50 lines of `node:crypto` (stdlib), the QR encoder is a vendored source file (`qrcode-generator@2.0.4 dist/qrcode.mjs` copied verbatim, never called over the network at runtime), and all new routes are internal `/api/auth/tfa/*` endpoints over the existing SQLite database. No capability matrix applies.
