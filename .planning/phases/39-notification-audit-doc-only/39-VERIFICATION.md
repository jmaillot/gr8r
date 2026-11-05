---
phase: 39-notification-audit-doc-only
verified: 2026-11-05T10:34:08Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - docs/notification-audit.md
  - .planning/STATE.md
  - .planning/phases/39-notification-audit-doc-only/39-01-PLAN.md
  - .planning/phases/39-notification-audit-doc-only/39-01-SUMMARY.md
covered_digest: "v2:sha256:fbeec249da32771d89c15833181cab930e42e0d59ad93de56e514be84e49b8b6"
behavior_unverified: 0
overrides_applied: 0
prohibitions:
  - statement: "MUST NOT assert a proven negative for dead-key rows — dated absence-of-evidence phrasing only"
    status: verified
    verification: judgment
    evidence: "Doc uses 'aucun lecteur trouvé (grep src/ + server.js, 2026-11-05)' ×7 and '⚠️ absence constatée, pas prouvée' ×4; every dead-key row (mention_ws, assign_self, assign_status, assign_over, push_mention, push_assign, push_comment) carries a dated grep note plus the dynamic np[k] caveat. Matches plan prohibition and 39-REVIEW.md prohibition 2."
  - statement: "MUST NOT contain real user emails, real tokens, or forgeable unsubscribe URIs"
    status: verified
    verification: judgment
    evidence: "Only URI in the doc is `<https://example.com/unsubscribe/opaquepart>` (line 89), explicitly labeled placeholder; grep for real-looking addresses/tokens found nothing. Matches 39-REVIEW.md prohibition 1."
  - statement: "MUST NOT promise Gmail/Yahoo one-click compliance from headers alone — DKIM prerequisite stated, one-click deferred"
    status: verified
    verification: judgment
    evidence: "Doc line 90 states RFC 8058 §3.1/§4 DKIM prerequisite, defers List-Unsubscribe-Post to a DKIM milestone, and warns 'Ne pas promettre de conformité one-click Gmail/Yahoo à partir des seuls headers.' Independently re-verified: `git show 0e64d67:server.js | grep -ci dkim` = 0, same for mailer.js — the mailer truly signs nothing."
human_verification:
  - test: "Owner reviews docs/notification-audit.md and rules per row per the D-05 gate: set each trim recommendation's Status cell to `validated` (with `validated-by: <owner>, <date>`) or `rejected`, mirroring rulings to .planning/STATE.md Recent Decisions."
    expected: "Every row carries an explicit owner ruling before any future coding milestone touches a threshold/default; no code change proceeds against a `proposed` or `rejected` row."
    why_human: "The semantic soundness of each trim/keep recommendation (e.g. whether mention_ws should be trimmed, whether the RFC 8058 split is the right trade-off) is a product decision grep cannot make. Structure, citations, and the all-proposed state were verified mechanically; the rulings themselves are the designed owner gate. The plan's own coverage marked D1/D2 human_judgment: true."
next_action: owner_review
gaps: []
---

# Phase 39: Notification Audit (doc-only) Verification Report

**Phase Goal:** The owner receives a complete notification audit — every type × channel × default with trim recommendations — and every threshold/default change it recommends is validated by the owner BEFORE any code implements it. The audit itself changes no behavior.
**Verified:** 2026-11-05T10:34:08Z
**Status:** human_needed (owner review per D-05 — no gaps)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Audit doc exists covering every notification type (mention, assign, comment, update, due_reminder/past_due, digest) × channel (email, inbox, push) × current default, with a trim recommendation per row | ✓ VERIFIED | `docs/notification-audit.md` (97 lines) has six type sections (Mentions, Assignments, Commentaires, Mises à jour, Rappels d'échéance, Digest) + RFC 8058 section. All 16 whitelist keys present (loop-verified, 1–3 occurrences each), including the 5 undefined-falsy keys rendered as explicit "aucun défaut (undefined-falsy)" rows. Every row carries a Trim recommendation cell. |
| 2 | Every table row carries a file:line source citation | ✓ VERIFIED | Every Source cell contains file:line citations. Spot-checked against committed code at phase-base 0e64d67: `NOTIF_EMAIL_KIND` at server.js:1188 ✓, `email_mention: true` :1144 ✓, `email_comment: false` :1146 ✓, `=== false` email gate :1248 ✓, digest suppression :1260 ✓, digest opt-in `!== true` :1517 ✓, offsets :1437/:1440 ✓, NOTIF_PREF_DEFAULTS = exactly 11 keys with email_comment the only `false` ✓, settings toggles mention_ws :392 / assign_self-status-over :397-399 ✓, emitMentions gates actions.js:150-151 ✓, update emission actions.js:203-210 ✓, comment emission actions.js:1129 ✓, mailer.js:525/592-603 header block (From/To/Subject/Auto-Submitted/X-Mailer, no unsubscribe header) ✓. See Citation Drift note below for the dirty-tree caveat. |
| 3 | RFC 8058 decision section for the digest email: plain List-Unsubscribe now, one-click deferred to DKIM milestone | ✓ VERIFIED | "## Décision RFC 8058 List-Unsubscribe (email digest)" section with 3-point recommendation (NOW header-only at buildDigestMessage mailer.js:592-603; DEFER List-Unsubscribe-Post citing RFC 8058 §3.1/§4 + grep-verified 0 DKIM occurrences in mailer.js and server.js at 0e64d67) + decision table with both rows `proposed`. |
| 4 | Status column convention (proposed/validated/rejected) documented; no row reads validated | ✓ VERIFIED | "Convention de validation (porte de propriétaire — D-05)" preamble documents all three statuses + validated-by/date convention + STATE.md mirror. `grep -c proposed` = 25. The only 2 "validated" occurrences are in the convention prose (lines 10, 13), not in any Status cell — all Status cells read `proposed`. |
| 5 | Zero non-doc files changed by the phase (AUDIT-02 doc-only boundary) | ✓ VERIFIED | `git diff --name-only 0e64d67..886491b` (phase-base → phase-end commit) = `.planning/STATE.md`, `phase-base.sha`, `docs/notification-audit.md` only. The full `0e64d67..HEAD` diff additionally contains server.js/.env.example/CHANGELOG.md/ROADMAP.md — all from post-phase commits (2e97648 review artifact, 48b46ca planning artifact, 7a7a423 Kanzo #9 LOG_LEVEL landed after the phase per orchestrator note), not attributable to Phase 39. `node scripts/i18n-scan.mjs` green (0 unresolved). |

**Score:** 5/5 truths verified (0 present, behavior-unverified)
**Prohibitions:** 3/3 verified (all judgment-tier; see frontmatter for per-item evidence — no flagged items)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `docs/notification-audit.md` | Complete cited audit, 6 type sections + RFC 8058 section + D-05 gate convention | ✓ VERIFIED | 97 lines, French per repo docs/ convention, all sections present, all rows cited and `proposed` |
| `.planning/STATE.md` Recent Decisions line | One line recording delivery + all-proposed state (D-05 mirror) | ✓ VERIFIED | Line 56: "[Phase 39]: 39-01: docs/notification-audit.md delivered doc-only — every trim recommendation and the RFC 8058 List-Unsubscribe recommendation ship as `proposed` pending owner validation (D-05)…" |
| `.planning/phases/39-notification-audit-doc-only/phase-base.sha` | Valid 40-hex SHA pinned before Task 1 | ✓ VERIFIED | `0e64d67ba71729842bcb4336f18dcf5b3dd046c5` — valid, and the phase's commits (530a65f..886491b) sit directly on it |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| Audit doc rows | server.js NOTIF_PREF_KEYS/DEFAULTS/NOTIF_EMAIL_KIND | file:line citations | ✓ WIRED | All spot-checked citations match committed code at 0e64d67 (see Truth 2) |
| Audit doc rows | src/core/notifPrefs.js client defaults mirror | notifPrefs.js:17-29 citation | ✓ WIRED | Cited in mention_all row (Source: actions.js:150,168; Storage: notifPrefs.js:17-29) |
| Dead-key rows | settings.js toggles + dated no-reader grep | toggle line + grep date | ✓ WIRED | mention_ws :392, assign_self :397, assign_status :398, assign_over :399 — all verified at 0e64d67; every dead row carries "grep src/ + server.js, 2026-11-05" |
| RFC 8058 section | mailer.js buildDigestMessage header block | mailer.js:592-603 | ✓ WIRED | Header block verified: current headers are From/To/Reply-To/Subject/Date/Message-ID/MIME/Content-Type/Auto-Submitted/X-Mailer — no unsubscribe header, exactly as the doc states (the future insertion point) |
| Status column | .planning/STATE.md Recent Decisions | D-05 mirror convention | ✓ WIRED | Convention documented in doc; STATE.md line 56 mirrors delivery + all-proposed state |

### Data-Flow Trace (Level 4)

Not applicable — doc-only phase; no dynamic values rendered from data sources.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Deliverable exists with ≥5 server.js citations | `grep -c "server\.js:" docs/notification-audit.md` | 24 | ✓ PASS |
| RFC 8058 decision recorded (≥2 List-Unsubscribe + DKIM) | `grep -ci List-Unsubscribe` / `grep -qi DKIM` | 5 / present | ✓ PASS |
| All recommendations gated (`proposed` ≥10) | `grep -c proposed` | 25 | ✓ PASS |
| Untouched behavior | `node scripts/i18n-scan.mjs` | 0 literals, 0 unresolved | ✓ PASS |
| All 16 whitelist keys documented | loop grep per key | 16/16 present | ✓ PASS |

### Probe Execution

No probes declared (doc-only phase; no `scripts/*/tests/probe-*.sh` applies). SKIPPED.

### Citation Drift Note (per orchestrator environment note)

The doc's server.js line citations match the committed phase-base (0e64d67) exactly — verified by spot-check via `git show 0e64d67:server.js`. Against the current dirty working tree (uncommitted Kanzo #9 LOG_LEVEL edit), some lines shift (e.g. NOTIF_EMAIL_KIND 1188 → ~1213). This is documented intended behavior — the doc's epigraph states a mismatching citation "signale une dérive du code, pas du document" — and matches 39-REVIEW.md IN-01. Not a gap. Future implementation milestones must re-verify citations against the code state at that time.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AUDIT-01 | 39-01 | Audit doc reviews every notification type × channel × default | ✓ SATISFIED | Truths 1-3; all 16 keys, 6 sections, trim rec + citation per row; RFC 8058 decision recorded. REQUIREMENTS.md lines 97-98 map both IDs to Phase 39 — no orphans. |
| AUDIT-02 | 39-01 | Every threshold/default change validated by owner before coding; audit ships doc-only | ✓ SATISFIED | Truths 4-5; all Status cells `proposed`, doc-only boundary proven, STATE.md D-05 mirror line present. Owner ruling is the routed next action (see Human Verification). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None (doc-only phase; no TBD/FIXME/XXX/placeholder-code markers; the one "placeholder" mention is the intentional RFC 8058 §6 URI guidance) | — | — |

Cross-reference: 39-REVIEW.md (status clean, 0 critical/warning, 2 info) independently reached the same prohibition verdicts; its IN-02 (code comment says "12-key" vs actual 11 defaults — doc is correct) is a pre-existing server.js comment issue outside phase scope.

### Human Verification Required

1. **Owner ruling per D-05** — review `docs/notification-audit.md` and set each row's Status to `validated` (+ `validated-by: <owner>, <date>`) or `rejected`, mirroring to STATE.md Recent Decisions. No threshold/default change may be coded against a `proposed` row. (This is the phase goal's designed gate, not a defect.)

### Gaps Summary

None. All 5 truths verified, all 3 prohibitions verified, doc-only boundary proven against the pinned phase-base commit, citations verified against committed code. Status is `human_needed` solely because the audit's substantive recommendations require the owner's ruling — the exact workflow the phase was built to enforce.

---

_Verified: 2026-11-05T10:34:08Z_
_Verifier: the agent (gsd-verifier)_
