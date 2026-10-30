---
phase: "19"
slug: "totp-encryption-closure"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-28"
---

# Phase 19 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| SQLite db file → boot process | A restored pre-v1.3 database (or any tampered db) crosses into the boot migration; row values are attacker/legacy-controlled data | `users.two_fa_secret` values (secret material) |
| DATA_DIR filesystem → backup step | Backup path writeability determines whether the mutation is allowed to proceed (D-74) | plaintext TOTP secrets (backup files) |
| HTTP client → TOTP-verify/disable endpoints | Untrusted codes/requests reach routes that decrypt a stored secret; failure handling is the security surface | verification codes, error responses |
| Database stored envelope → decrypt path | A tampered or malformed `two_fa_secret` value crosses into `decryptTotpSecret` | `v1:` AES-256-GCM envelopes |
| API response → client | Error bodies must never leak secret material or distinguish corrupt-vs-missing-key | error JSON (`masterKeyMissing`) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-19-01 | Information Disclosure | users.two_fa_secret at rest | high | mitigate | `migrateTotpEncryption()` (server.js:1000–1072) wraps every eligible plaintext row via `encryptTotpSecret()`; backup-first (1023–1033); wired into `bootstrap()` (server.js:950); proven by test/migration.test.mjs (envelope match + decrypt round-trip) | closed |
| T-19-02 | Tampering | migrateTotpEncryption trigger/edge rules | medium | mitigate | Trigger excludes `v1:`/blank rows (server.js:1002–1009); per-row re-check inside transaction (1043–1058) skips blanks, non-`/^[A-Z2-7]{32}$/`, and `v1:` — garbage never wrapped; edge-row test test/migration.test.mjs:541–561 | closed |
| T-19-03 | Denial of Service | boot sequence when MASTER_KEY missing | low | accept | D-73 deliberate deferral: defer branch (server.js:1014–1019) logs loud `console.warn`, rows untouched, boot proceeds; decrypt fails closed at runtime; no-backup invariant asserted in test | closed (accepted risk — see log) |
| T-19-04 | Spoofing / Elevation of Privilege | decryptTotpSecret call sites | high | mitigate | Wrapper exclusivity (D-77/D-78c): `decryptTotpSecret` appears only at definition (server.js:252) and inside `requireTotpSecret` (271–274); both call sites (1663, 1737) `wrapped.ok` → `'masterKey'` → 503 (1683, 1774); no `?? `/`\|\| String(` fallback anywhere; 10 behavioral 503 cases + negative control in test/totp-encryption.test.mjs | closed |
| T-19-05 | Tampering | stored v1: envelope | medium | mitigate | GCM auth-tag via `decipher.setAuthTag` + `final()` (server.js:259–260) — tamper throws → catch → null (261–263) → `ok:false` → 503; malformed/valid-shaped envelope variants behaviorally tested | closed |
| T-19-06 | Information Disclosure | API error responses | low | mitigate | Single `masterKeyMissing` code at both fail sites (server.js:1683, 1774); per-route copy asserted byte-identical (D-80/D-81); no secret material in any response body | closed |
| T-19-07 | Denial of Service | non-2FA login routes | medium | mitigate | `two_fa_enabled` gate intact (server.js:1729); negative control "non-2FA account logs in normally with MASTER_KEY unset" green (D-78b) | closed |
| T-19-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package installs this phase — `git log 2b85c22..65b3dcb -- package.json` empty; legitimacy checkpoint trivially clean | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-19-01 | T-19-03 | MASTER_KEY-missing at boot deliberately defers migration (D-73): plaintext rows remain until a boot with the key present, but every decrypt path fails closed at runtime (null → 503 `masterKeyMissing`), so no plaintext verification is ever possible. Boot never hangs or crashes. Evidence: server.js:1014–1019 + migration test defer case. | gsd-security-auditor (audit) / orchestrator | 2026-10-28 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-28 | 8 | 7 | 1 (low — missing accepted-risks entry only; closed by this document) | gsd-security-auditor (ses_e7d08d33effeRXeCZzYoj2gqdS) |

Audit verification runs: `node --test test/migration.test.mjs test/totp-encryption.test.mjs` → 34/34 pass; fallback-pattern grep on server.js → no matches; exclusivity grep → exactly 2 `decryptTotpSecret` occurrences (definition + wrapper call).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-28
