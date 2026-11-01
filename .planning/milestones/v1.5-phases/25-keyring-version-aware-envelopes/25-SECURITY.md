---
phase: "25"
slug: "keyring-version-aware-envelopes"
status: validated
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-31"
---

# Phase 25 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| stored DB → boot migration | `users.two_fa_secret` values are untrusted-at-boot data crossing the re-wrap filter | envelope strings / ciphertext |
| attacker-crafted two_fa_secret row → decryptTotpSecret | stored envelope strings are untrusted input crossing the v2 parser/keyring lookup | envelope strings |
| env (MASTER_KEY / MASTER_KEY_PREVIOUS) → KEYRING | operator-supplied key material; fingerprints derive from it | key material (never logged) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-25-01 | Tampering | migrateTotpEncryption re-wrap filter | high | mitigate | Generic `/^v\d+:/` predicate (D-K6, no known-versions list) shared by SQL prefilter + D-75 in-transaction re-check; SC-1 byte-identity proof ×2 boots, zero backups (server.js:1198-1201, test/migration.test.mjs:533) | closed |
| T-25-02 | Information Disclosure | D-K7 / D-76 boot log lines | medium | mitigate | Warn lines quote only version tag + row id + counts — never key material or ciphertext; exact warn shape asserted in tests (server.js:1232-1238, migration.test.mjs:550,584) | closed |
| T-25-03 | Spoofing/Info Disclosure | decryptTotpSecret v2 id validation | high | mitigate | 5-part shape + strict `/^[0-9a-f]{8}$/` id check; unknown id and corrupt tag converge on the same `catch { return null }` → 503 `masterKeyMissing` (no timing/shape oracle); rows unmutated (server.js:333-348, totp-encryption.test.mjs:319,352) | closed |
| T-25-04 | Information Disclosure | boot/warn log lines in keyring block | medium | mitigate | D-K2 throw + identical-key warn quote only 8-hex fingerprints / fixed strings; static drift-guard tests confirm no plaintext fallback (server.js:80-94) | closed |
| T-25-05 | DoS | malformed v2 envelopes at login | low | mitigate | All shape/id validation returns null BEFORE any decipher construction; identical catch shape to v1; no new error codes (server.js:324-345) | closed |
| T-25-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package installs — node built-ins (`crypto`) + existing deps only; `tech-stack.added: []` in both SUMMARYs | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

*No accepted risks.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-31 | 6 | 6 | 0 | gsd-security-auditor (ASVS L1, block_on: high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed

**Verdict:** SECURED — 6/6 threats closed with verifiable evidence; no unregistered flags; suite evidence 621/621 green.
