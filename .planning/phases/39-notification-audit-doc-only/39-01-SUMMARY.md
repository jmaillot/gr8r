---
phase: 39-notification-audit-doc-only
plan: 01
subsystem: docs
tags: [notifications, rfc-8058, email, prefs-audit, doc-only]

requires:
  - phase: 38-daily-digest-reminder-suppression
    provides: digest opt-in semantics (stored !== true gate), reminder-email suppression gate — the post-38 reality the audit documents
  - phase: 37-reminder-cadence-rework
    provides: two-offset cadence (morning_of/past_due), push_due retirement precedent for trim severities
  - phase: 36-server-notification-i18n
    provides: boundary pin 36-02 (no server push-emission surface) driving the push-channel rows
provides:
  - docs/notification-audit.md — full type × channel × default notification audit with file:line citations per row
  - D-05 owner-validation gate convention (status column, proposed/validated/rejected) documented in the doc itself
  - RFC 8058 List-Unsubscribe decision section (plain header now, one-click deferred to a DKIM milestone)
  - STATE.md Recent Decisions mirror line recording delivery + all-proposed state
affects: [future trim/retire milestones, digest RFC 8058 implementation, DKIM milestone planning]

actuals:
  tokens: 2200   # chars/4 over the realized diff (~8600 chars, 3 files)
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Per-type cited audit table (Channel | Pref key | Default | Storage | Live? | Trim | Status | Source) — ProjectPermissions.md analog"
    - "Dated absence-of-evidence phrasing for dead keys (toggle line + grep date), never proven negatives"

key-files:
  created:
    - docs/notification-audit.md
    - .planning/phases/39-notification-audit-doc-only/phase-base.sha
  modified:
    - .planning/STATE.md

key-decisions:
  - "All trim recommendations and the RFC 8058 recommendation ship as `proposed` — nothing codeable until owner validation (D-05)"
  - "RFC 8058 split: plain List-Unsubscribe (RFC 2369, header-only, mailer.js:592-603) now; List-Unsubscribe-Post one-click deferred to a DKIM milestone (RFC 8058 §4 prerequisite, mailer has no DKIM)"
  - "Line citations re-verified against live code at execution time — research line numbers had drifted (e.g. NOTIF_EMAIL_KIND moved 1175-1181 → 1188-1194)"

patterns-established:
  - "Citation-bearing audit rows: every row's Source cell cites file:line for re-verification against code drift (D-03)"
  - "Status column as the machine-readable owner gate — the doc IS the gate, no sidecar (D-05)"

requirements-completed: [AUDIT-01, AUDIT-02]

coverage:
  - id: D1
    description: "Audit doc covering all six notification types (mentions, assignments, commentaires, update, rappels, digest) × channel × default with a trim recommendation and file:line citation per row"
    requirement: AUDIT-01
    verification:
      - kind: other
        ref: "grep -c 'proposed' docs/notification-audit.md → 25 (≥10); grep 'server.js:' → ≥5; section presence check (all six ## type sections + RFC 8058 section)"
        status: pass
    human_judgment: true
    rationale: "Doc completeness and correctness of per-row citations is ultimately a human review at /gsd-verify-work (RESEARCH Validation Architecture: AUDIT-01 test type = manual doc review)"
  - id: D2
    description: "RFC 8058 List-Unsubscribe decision section with DKIM prerequisite and one-click deferral"
    requirement: AUDIT-01
    verification:
      - kind: other
        ref: "grep -ci 'List-Unsubscribe' ≥2, grep -i DKIM, section 'Décision RFC 8058' present"
        status: pass
    human_judgment: true
    rationale: "Trade-off framing (recommendation level, DKIM nuance) needs owner review per D-04/D-05"
  - id: D3
    description: "Doc-only boundary: zero code changes; all 16 whitelist keys appear; all status cells proposed; STATE.md mirror line"
    requirement: AUDIT-02
    verification:
      - kind: other
        ref: "git diff --name-only $(cat phase-base.sha) → only docs/notification-audit.md + .planning/; node scripts/i18n-scan.mjs → 0 unresolved"
        status: pass
    human_judgment: false

duration: 4 min
completed: 2026-11-05
status: complete
---

# Phase 39 Plan 01: Notification Audit (doc-only) Summary

**docs/notification-audit.md — full cited notification audit (six type sections, RFC 8058 decision with DKIM split), every trim recommendation `proposed` pending owner validation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-05T10:07:32Z
- **Completed:** 2026-11-05T10:11:21Z
- **Tasks:** 3
- **Files modified:** 3 (1 new doc, 1 new pin file, 1 STATE.md line)

## Accomplishments
- `docs/notification-audit.md` written in French (repo docs/ convention): epigraph, D-05 validation-convention preamble, six per-type sections (Mentions, Assignments, Commentaires, Mises à jour, Rappels d'échéance, Digest) with cited tables, RFC 8058 decision section
- Every table row cites file:line; dead-key rows (`push_mention/assign/comment`, `mention_ws`, `assign_self/status/over`) carry dated no-reader notes (grep 2026-11-05, including dynamic `np[k]` patterns) — never proven negatives
- RFC 8058 section: plain `List-Unsubscribe` (RFC 2369) now at buildDigestMessage mailer.js:592-603; `List-Unsubscribe-Post` one-click explicitly deferred to a DKIM milestone (RFC 8058 §4 — mailer signs nothing, grep verified); example URIs placeholder-only
- Digest section documents the no-notif-row + strict stored `!== true` opt-in asymmetry (server.js:1517) vs the merged-defaults `=== false` gate for email kinds (server.js:1248)
- STATE.md Recent Decisions mirror line records delivery, all-proposed state (D-05)
- All citations re-verified against live code at execution time (Pitfall 1) — research line numbers had drifted; updated (e.g. NOTIF_EMAIL_KIND 1188-1194, email gate 1248, digest suppression 1260, offsets 1437-1440, digest opt-in 1517, sendDigest 1558-1566)

## Task Commits

1. **Task 1: Audit doc skeleton + cited Mentions section (tracer)** - `530a65f` (docs)
2. **Task 2: Remaining type sections + RFC 8058 decision** - `85785a2` (docs)
3. **Task 3: STATE.md mirror line + boundary verification** - `886491b` (docs)

## Files Created/Modified
- `docs/notification-audit.md` — the deliverable (6 type sections + RFC 8058 decision + D-05 gate convention)
- `.planning/phases/39-notification-audit-doc-only/phase-base.sha` — pins the AUDIT-02 diff window (0e64d67, recorded before any deliverable write)
- `.planning/STATE.md` — one Recent Decisions line

## Decisions Made
- Citations taken from live code re-read, not transcribed from research (research line numbers stale post-38)
- Trim rows present both severities (trim-to-default vs full key removal, Phase 37 precedent); owner picks per row via the status column
- Doc language French (ProjectPermissions.md precedent, per plan)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase complete: doc-only deliverable shipped, AUDIT-01 + AUDIT-02 satisfied
- Owner must review the audit and rule per row (`validated`/`rejected` + `validated-by: <owner>, <date>`) before any coding milestone
- All 16 whitelist keys appear in the doc (5 explicit "no default (undefined-falsy)" rows included); boundary verified: git diff vs phase-base shows only docs/notification-audit.md + .planning/ artifacts; `node scripts/i18n-scan.mjs` green

---
*Phase: 39-notification-audit-doc-only*
*Completed: 2026-11-05*

## Self-Check: PASSED

- docs/notification-audit.md exists on disk (verified `[ -f ]`)
- Commits 530a65f, 85785a2, 886491b present in git log
- Plan-level verification re-run: `grep -c proposed` = 25 (≥10); List-Unsubscribe ≥2; DKIM present; boundary diff clean; i18n-scan green
