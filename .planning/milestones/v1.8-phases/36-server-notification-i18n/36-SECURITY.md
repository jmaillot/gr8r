---
phase: "36"
slug: server-notification-i18n
status: verified
threats_open: 0
threats_total: 7
register_authored_at_plan_time: true
asvs_level: 1
block_on: high
verified: 2026-11-04
---

# Phase 36 — Security Threat Verification

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Status | Evidence |
|-----------|----------|-----------|----------|-------------|--------|----------|
| T-36-01 | Tampering | buildNotifMessage interpolation into email HTML/Subject | high | mitigate | CLOSED | escapeHtml (HTML body, mailer.js:75,467-468) and encodeWord (Subject header, mailer.js:52) applied AFTER tFor interpolation — never inside the catalogue lookup; FR integration test asserts accents/apostrophes survive; Subject header injection safe (text() strips CR/LF before encodeWord) — confirmed by code review |
| T-36-02 | Information Disclosure | u.locale added to the authority query | low | mitigate | CLOSED | locale rides the same memberships⋈users workspace-scoped row (server.js:1222), no new join/exposure surface; recipient clamp server.js:1244 exact-'fr' check |
| T-36-03 | Tampering | client mass-assignment of key/vars into doc notifs | medium | mitigate | CLOSED | client-composed rows never carry key/vars — purity pin test/notif-i18n.test.mjs:405-416 (notifyMembers push literal stays key/vars-free); inbox treats client-supplied key as untrusted, unknown key degrades to stored snippet (D-06 pin) |
| T-36-05 | Tampering (gate bypass) | server-family width / allow-list | medium | mitigate | CLOSED | scanServerNotifKeys (scripts/i18n-scan.mjs:1194) bound to tFor/t notif.* literals in exactly server.js + mailer.js; server findings never allow-listed (test/fixtures/i18n-pending.json stays []); width pinned by tests asserting non-notif server prose produces no findings; live i18n:scan exit 0 |
| T-36-06 | Denial of Service (false positives) | scanner regression on untouched src files | medium | mitigate | CLOSED | additive scan — byte-compat pin test/i18n-scan.test.mjs:499 proves scanTree('src') output unchanged, allow-list staleness semantics intact |
| T-36-07 | Denial of Service | per-recipient locale → tFor in the send loop | medium | mitigate | CLOSED | tFor clamp (src/core/i18n.js registry clamp, unknown/malformed/null → 'en', never throws) + try/catch at buildNotifMessage boundary; malformed locale degrades to EN, fan-out loop never dies — edge tests green |
| T-36-SC | Tampering | npm/pip/cargo installs | high | mitigate | CLOSED | zero packages installed in the phase (zero-dependency invariant held); no [ASSUMED]/[SUS] entries in any SUMMARY |

## Accepted Risks

None.

## Security Audit 2026-11-04
| Metric | Count |
|--------|-------|
| Threats found | 7 |
| Closed | 7 |
| Open | 0 |
