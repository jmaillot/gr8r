---
phase: "12"
slug: "real-file-uploads-and-previews"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-25"
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client→upload POST | Raw bytes + user-controlled `name`/`task`/`project` query params cross into the server filesystem | binary file bytes, filenames |
| client→file GET | Byte-range requests and Sec-Fetch-Dest-discriminated navigations resolve stored binaries to any caller | binary bytes, Range/Content-Disposition headers |
| client→deep links | `?next=` consumption after login and top-level file-URL pastes route unauthenticated navigations | redirect targets, session cookies |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-12-01 | Tampering/Elevation | GET /w/:slug/file/:id inline serving | critical | mitigate | D-06 fixed Content-Type map (only png/jpg/jpeg/gif/webp/pdf inline; svg never inline) — `test/upload.test.mjs` "D-06 header policy" green | closed |
| T-12-02 | Tampering/Info disclosure | file id → path resolution | high | mitigate | Paths built only from `path.join(FILES_DIR, id)` of the resolved record, never raw URL params — "file GET serves exact bytes" green | closed |
| T-12-03 | Info disclosure | unknown-id lookup | medium | mitigate | D-05 `requireWorkspace` then record lookup; unknown ids/slugs all 404 (no oracle) — test green | closed |
| T-12-04 | DoS | POST /w/:slug/files stream | high | mitigate | Mid-stream size cap vs `MAX_UPLOAD_MB`, 413 `uploadTooLarge`, drain-then-respond — "uploadTooLarge 413 mid-stream" green | closed |
| T-12-05 | Tampering | POST /w/:slug/files | high | mitigate | `sameOrigin(req)` before body read + `requireWorkspace(…, 'member')` — "uploads are gated" green (401/403) | closed |
| T-12-06 | Spoofing | PDF iframe framing | medium | mitigate | File route builds its own header set: `nosniff` kept, `X-Frame-Options` dropped for same-origin embeds — byte-only route test green | closed |
| T-12-08 | Tampering | Content-Disposition header | medium | mitigate | `fileDisposition` strips CR/LF/quotes/control chars (server.js:1925-1927), RFC 6266 filename\* fallback | closed |
| T-12-09 | Tampering | filePreviewModal template | medium | mitigate | Every user-controlled value passes `esc()` — e2e preview flows green | closed |
| T-12-11 | Tampering | MAX_UPLOAD_MB documentation | low | mitigate | DEPLOY.md:157/176 + .env.example:96 state default (25 MB), units, raw-body scope | closed |
| T-12-12 | Tampering/Elevation | /w/:slug/file/:id answers document navigations | high | mitigate | Same `requireWorkspace` gate for every Sec-Fetch-Dest; no new exposure surface — byte-only + auth tests green | closed |
| T-12-15 | Tampering (open redirect) | `?next=` consumption after login | high | mitigate | Server builds `next` from pathname only, rejects absolute/protocol-relative — "redirects to login with path preserved" green | closed |
| T-12-16 | Information disclosure | 302-vs-404 as existence oracle | medium | mitigate | Session check precedes workspace lookup; unknown slugs byte-identical for anonymous document navigations — test green | closed |
| T-12-18 | Tampering (attribute injection) | footer anchor `download="${f.name}"` | medium | mitigate | `esc(f.name)` escapes `"` (attribute-safe) — verified in code review 12-REVIEW.md | closed |
| T-12-SC | Tampering | npm/pip/cargo installs | high | mitigate | Vacuous: zero package installs this phase (zero-runtime-dependency guarantee, RESEARCH.md § Package Legitimacy Audit) | closed |
| T-12-07 | DoS | DATA_DIR disk exhaustion | low | accept | Per-file cap only; per-workspace quotas deferred (CONTEXT Deferred Ideas) | open — below threshold (non-blocking) |
| T-12-10 | Information disclosure | deep-link preview | low | accept | Deep link opens the modal only after the doc's file record matches | open — below threshold (non-blocking) |
| T-12-13 | Information disclosure | unauthenticated top-level paste of a file URL | low | accept | Superseded by UAT decision: 302 to login (G-12-5, T-12-15/16 mitigations cover the implemented behavior) | open — below threshold (non-blocking) |
| T-12-14 | Information disclosure | maxUploadMb in GET /api/config | low | accept | Discloses a tuning knob (a number), to authenticated callers only | open — below threshold (non-blocking) |
| T-12-17 | DoS | Range request abuse | low | accept | Single-range only; multi-range/wrong-unit/malformed fall back to 200 full body — known residual: zero-byte suffix range (code-review CR-01, ledger 12-REVIEW-DISPOSITION.md) | open — below threshold (non-blocking) |
| T-12-19 | Information disclosure | widened modal revealing more to an authorized viewer | low | accept | Layout-only change; viewer already authorized for the bytes | open — below threshold (non-blocking) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-12-1 | T-12-07 | Per-workspace storage quotas explicitly deferred (PROJECT.md out-of-scope: file-storage hardening) | plan author | 2026-10-24 |
| AR-12-2 | T-12-10 | Deep-link preview is auth-equivalent to opening the doc; no extra disclosure | plan author | 2026-10-24 |
| AR-12-3 | T-12-14 | maxUploadMb is a non-sensitive tuning number in /api/config | plan author | 2026-10-24 |
| AR-12-4 | T-12-17 | Single-range parsing only; residual zero-byte suffix-range defect tracked as CR-01 in 12-REVIEW-DISPOSITION.md (fix-or-accept triage pending) | plan author | 2026-10-24 |
| AR-12-5 | T-12-19 | Widened modal changes layout only; bytes already visible to the same viewer | plan author | 2026-10-25 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-25 | 19 | 14 | 5 (all low, non-blocking) | agent (gsd-secure-phase, L1 grep depth) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-25
