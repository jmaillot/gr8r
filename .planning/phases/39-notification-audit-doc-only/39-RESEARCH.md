# Phase 39: Notification Audit (doc-only) - Research

**Researched:** 2026-11-05
**Domain:** Notification preference surface documentation (audit doc) + RFC 8058 unsubscribe decision — doc-only deliverable, zero code change
**Confidence:** HIGH (all factual backbone read from source this session; RFC verified from primary source)

## Summary

Phase 39 produces exactly one artifact: `docs/notification-audit.md` (D-01). Every factual row in it must be derived from the post-Phase-38 server reality and cite a `file:line` source (D-03). This research did the source reading and establishes the **verified fact backbone** below — the complete notification type × channel × key matrix, which keys are live, which are dead toggles, and the exact insertion points a future RFC 8058 header change would use. The planner can build the audit doc's tables directly from this backbone, but every row must still carry its own citation line (the discipline D-03 mandates).

The critical findings for the trim-recommendation column: **six of the sixteen pref keys gate nothing**. The three `push_*` keys have no emission surface anywhere (server or client — no Web Notification API, no service worker; confirmed by grep across `src/` and the Phase 36 boundary pin 36-02), and `mention_ws`, `assign_status`, `assign_over`, `assign_self` are rendered as settings toggles but are **read by no emission code** — the only client-side emission gate is `mention_all` + `mention_team` in `emitMentions` (src/actions/actions.js:148-158), and server-side email gating keys exclusively off `NOTIF_EMAIL_KIND` (server.js:1175-1181). These are prime trim candidates, but proposing their removal is the audit's job — validated by the owner per D-05, never coded in this phase.

The second critical finding concerns RFC 8058 (D-04 leans yes): the RFC is unambiguous that one-click unsubscribe **requires a DKIM signature covering both headers** (§3.1, §4: "MUST apply at least one valid DKIM signature... SHOULD NOT offer a one-click unsubscribe" without it). This project's mailer sends **no DKIM signature at all** (grep for "dkim" in mailer.js: zero hits; headers at mailer.js:479-491 confirm). So D-04's "header-only change, ~zero dependencies" framing is only half-true: a plain `List-Unsubscribe` header (RFC 2369) is genuinely header-only, but `List-Unsubscribe-Post` one-click compliance additionally requires DKIM — a much larger lift for a zero-dependency mailer. The audit must present this trade-off honestly; the recommendation shape suggested below is "plain List-Unsubscribe now (header-only), one-click deferred until DKIM exists."

**Primary recommendation:** Plan a single-plan phase: one task writes the audit doc from the verified backbone below (per-type sections, per-row file:line citations, status column per D-05), one task adds the RFC 8058 decision section presenting the DKIM nuance, one task mirrors the doc's existence into STATE.md. No code, no tests, no packages.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Audit lives at `docs/notification-audit.md` — alongside the code it audits, visible to anyone cloning the repo.
- **D-02:** Structure = one section per notification TYPE (mentions, assignments, comments, due-reminders, digest) with a per-type table and narrative; not a single flat matrix. Each per-type table carries rows per type×channel combination with pref key, current default, storage state, and trim recommendation. The RFC 8058 decision is its own section.
- **D-03:** Hand-written from a direct read of the post-38 server reality — `NOTIF_PREF_KEYS` / `NOTIF_PREF_DEFAULTS` / `NOTIF_EMAIL_KIND` in server.js, `runReminderPass`, `queueNotifEmails`, `getUserNotifPrefs` — plus the client mirror in src/core/notifPrefs.js and the settings toggle surface. No inventory script, no regression test pinning the doc. Drift handled by requiring a source-line citation (file:line) on **every row**.
- **D-04:** The audit LEANS: presents the trade-off and RECOMMENDS implementing `List-Unsubscribe` + `List-Unsubscribe-Post` for the digest email. Recommendation is a `proposed` status row until validated. (Context states mailer.js sends no unsubscribe headers — re-verified this session.)
- **D-05:** Each trim recommendation row carries a status cell (`proposed` / `validated` / `rejected`) plus a `validated-by` + date line once ruled. Only `validated` rows are codeable. Every validated change gets one line in `.planning/STATE.md` → "Recent Decisions".

### the agent's Discretion
- Exact table column headers, section ordering, prose depth within the per-type structure (D-02).
- Which candidate trim recommendations the audit proposes — derived from the post-38 reality (push keys with no push emission surface, `mention_ws`/`mention_team` overlap named in the context; researcher's judgment for the rest).
- Digest section's depth on unsubscribe mechanics — recommendation level, not implementation plan level.

### Deferred Ideas (OUT OF SCOPE)
- None. Coding any validated trim recommendation and the RFC 8058 implementation itself are follow-up milestones per REQUIREMENTS.md "Future Requirements (deferred)".
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDIT-01 | Audit document reviewing every notification type × channel × default with trim recommendations and an explicit RFC 8058 `List-Unsubscribe` decision for the digest | Verified fact backbone (below) supplies all rows; RFC 8058 section sourced from rfc-editor.org primary text; D-04 leans implement |
| AUDIT-02 | Every threshold/default change validated by owner BEFORE any code implements it; audit ships as documentation only | D-05 status-column mechanics; phase boundary — no code change tasks in the plan |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audit document | Docs (repo file) | — | D-01/D-02: pure documentation, no runtime tier |
| Owner-validation gate | Process (doc status column + STATE.md) | — | D-05: recorded process, no code contract |
| RFC 8058 decision | Docs (decision section) | Future: mailer.js header insert | Decision recorded now; any implementation is a follow-up milestone |

## Standard Stack

### Core
No new packages — the phase installs nothing (zero-dependency repo invariant; D-03 explicitly rejects an inventory script). The only "stack" is:

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Node.js (existing) | already in repo | none needed at runtime; doc is plain markdown | repo convention |
| Markdown tables | — | per-type audit tables with citation columns | docs/ProjectPermissions.md precedent |

**Package Legitimacy Audit:** N/A — this phase installs zero external packages. No registry lookups, no postinstall surface.

**Package Legitimacy Gate:** skipped (no installs). No packages were removed as [SLOP]; none flagged [SUS].

## Verified Fact Backbone (the audit's rows)

All quotes verbatim, read this session. The planner/executor may copy these into the audit doc **as the row content**, re-verifying each citation by opening the cited lines.

### 1. The 16-key whitelist (server authority)

`server.js:1124-1141` [VERIFIED: server.js:1124-1141] — the PUT whitelist (`PUT ... unknownPrefKey` guard at server.js:3339):

```
const NOTIF_PREF_KEYS = [
  'email_mention',
  'email_assign',
  'email_comment',
  'email_digest',
  'email_reminder',
  'push_mention',
  'push_assign',
  'push_comment',
  'due_reminder',
  'past_due',
  'mention_all',
  'mention_team',
  'mention_ws',
  'assign_self',
  'assign_status',
  'assign_over',
];
```

### 2. The 11-key default layer

`server.js:1143-1155` [VERIFIED: server.js:1143-1155]:

```
const NOTIF_PREF_DEFAULTS = {
  email_mention: true,
  email_assign: true,
  email_comment: false,
  email_reminder: true,
  due_reminder: true,
  past_due: true,
  push_mention: true,
  push_assign: true,
  push_comment: true,
  mention_all: true,
  assign_self: true,
};
```

Five whitelist keys have NO default (read undefined-falsy): `email_digest`, `mention_team`, `mention_ws`, `assign_status`, `assign_over` — comment block at server.js:1110-1122 [VERIFIED: server.js:1121-1122, quote: "keys (mention_team, mention_ws, assign_status, assign_over) have NO default"] plus `email_digest` (Phase 38 D-14 opt-in inversion).

**Client mirror:** `src/core/notifPrefs.js:17-41` [VERIFIED: src/core/notifPrefs.js:17-41] — same 11-key defaults, same 5 undefined-falsy extras; comment states "11 keys, email_comment the ONLY false" and "email_digest is a real OPT-IN as of Phase 38 (D-14: stored true = on, undefined/false = off)". Merge order (server row canonical): `src/core/notifPrefs.js:66-68`.

### 3. Type → email-channel map (the email channel's only gate)

`server.js:1175-1181` [VERIFIED: server.js:1175-1181]:

```
const NOTIF_EMAIL_KIND = {
  mention: 'email_mention',
  assign: 'email_assign',
  comment: 'email_comment',
  due_reminder: 'email_reminder',
  past_due: 'email_reminder',
};
```

`update` type is **absent** → in-app only. Email gating: `queueNotifEmails` skips when `prefs[prefKey] === false` (server.js:1228-1235) and, for reminder kinds, when stored `email_digest === true` (Phase 38 suppression gate, server.js:1247) [VERIFIED: server.js:1226-1247].

### 4. Notification types actually emitted (the "type" axis)

| Type | Emitted at | Row? | Email? |
|------|-----------|------|--------|
| `mention` | src/actions/actions.js:168 | yes | yes (email_mention) |
| `assign` | src/actions/actions.js:105, :231 | yes | yes (email_assign) |
| `comment` | src/actions/actions.js:1129 | yes | yes (email_comment, default **false**) |
| `update` | src/actions/actions.js:204-210 (status change to watchers) | yes | **no** — not in NOTIF_EMAIL_KIND |
| `due_reminder` / `past_due` | server.js:1423-1431 (runReminderPass offsets) | yes | yes (email_reminder), suppressed by digest opt-in (server.js:1247) |
| digest | no notif row — direct `MAILER.sendDigest` (server.js:1545-1553) | no | yes, strict stored opt-in (server.js:1504) |

[VERIFIED: src/actions/actions.js:105,168,204,231,1129; server.js:1423-1431,1504,1545]

### 5. Key-consumption map — which keys gate real behavior (the trim evidence)

| Key | Consumed by | Citation |
|-----|-------------|----------|
| `email_mention` / `email_assign` / `email_comment` | server email fan-out via NOTIF_EMAIL_KIND | server.js:1228-1235 |
| `email_reminder` | same, for due_reminder/past_due kinds | server.js:1228-1235 |
| `email_digest` | suppression gate (server) + digest opt-in (server) | server.js:1247, :1504 |
| `due_reminder` / `past_due` | reminder offset emission | server.js:1424, :1427 |
| `mention_all` | client mention fan-out gate | src/actions/actions.js:150 |
| `mention_team` | client @team mention gate | src/actions/actions.js:151 |
| `mention_ws` | **nothing found** — toggle exists (settings.js:373 area), no reader | grep across src/ + server.js |
| `assign_self` / `assign_status` / `assign_over` | **nothing found** — toggles exist (settings.js:397-399), no reader | grep across src/ + server.js |
| `push_mention` / `push_assign` / `push_comment` | **nothing** — no push emission surface exists anywhere (server or client; no `Notification` API / serviceWorker in src/) | grep + Phase 36 boundary pin 36-02 |

[VERIFIED: consumption greps run this session; settings toggles at src/pages/settings.js:375-399 — `case 'notif-email'` block lines ~366-373, `case 'notif-push'` ~375-384, `case 'notif-mentions'` ~386-391, `case 'notif-assign'` ~393-400]

⚠️ Caveat for the executor: the "nothing found" rows are **absence-of-reader findings** from grep; D-03's discipline is that each audit row re-cites its own evidence line. For dead-key rows, the citation is the *toggle* line plus a "no reader" note — phrase rows as "no consumption surface found (grep 2026-11-05)" rather than asserting a proven negative.

### 6. Digest email send path (RFC 8058 section's subject)

- Send: `MAILER.sendDigest({to, locale, workspace, wsSlug, appUrl, dueToday, overdue})` — server.js:1544-1553, post-commit fire-and-forget [VERIFIED: server.js:1544-1553].
- MIME frame: `buildDigestMessage` — mailer.js:525; header block at mailer.js:592-605 [VERIFIED: mailer.js:525, :592-622].
- **No `List-Unsubscribe` / `List-Unsubscribe-Post` anywhere** in server.js or mailer.js — grep returned zero hits (exit 1) [VERIFIED: grep this session].
- Notification email frame for contrast: `buildNotifMessage` mailer.js:402, headers at :479-491 (same headerless pattern).
- **No DKIM anywhere**: grep "dkim" in mailer.js/server.js → zero hits [VERIFIED: grep this session]. Outgoing headers are From/To/Reply-To/Subject/Date/Message-ID/MIME-Version/Content-Type/Auto-Submitted/X-Mailer (mailer.js:479-491).

### 7. Prefs storage & read path (the "storage state" column)

- Storage: per-user rows `user_notif_prefs (workspace_id, user_id, prefs JSON)` — `getStoredNotifPrefs` server.js:1157-1165 [VERIFIED: server.js:1157-1165, quote: `'select prefs from user_notif_prefs where workspace_id = ? and user_id = ?'`].
- Reader: `getUserNotifPrefs` is the ONLY prefs reader — `{...NOTIF_PREF_DEFAULTS, ...stored}`, `=== false` disables, undefined-falsy keys stay on (server.js:1167-1173) [VERIFIED: server.js:1167-1173].
- Client: local mode persists per-workspace in localStorage `projects.notifPrefs.<id>` (src/core/notifPrefs.js:7, :70-77); API mode hydrates via GET-on-open merge (src/actions/actions.js:3203-3214) [VERIFIED: src/core/notifPrefs.js:7,70-77; src/actions/actions.js:3214].
- Toggle writes: single handler PUTs all prefs (src/actions/actions.js:2686-2695) [VERIFIED: src/actions/actions.js:2686-2695].

## Architecture Patterns

### Recommended Project Structure
```
docs/
├── notification-audit.md    # NEW — the phase deliverable (D-01)
├── ProjectPermissions.md    # precedent: durable repo doc in docs/
└── WorkspacePermissions.md
```

### Pattern 1: Per-type section with citation-bearing table (D-02/D-03)
**What:** One `## <Type>` section per notification type; each section = short narrative + a table where every row cites `file:line`.
**Suggested columns** (planner discretion): Channel | Pref key | Current default | Storage state | Live? (consumed by) | Trim recommendation | Status | Source.
**Example row:**
```
| Email | email_comment | false (NOTIF_PREF_DEFAULTS, server.js:1146) | per-user row, strict === false gate (server.js:1235) | live — comment emails | keep (only false default; intentional opt-out for a noisy channel) | proposed | server.js:1175-1181, :1235 |
```

### Pattern 2: Status column as the machine-readable gate (D-05)
**What:** `proposed` / `validated` / `rejected` cell + `validated-by: <owner>, <date>` appended on ruling; STATE.md "Recent Decisions" gets one line per validated row.
**Anti-pattern to avoid:** encoding the gate anywhere else (a JSON sidecar, a test) — D-03 explicitly rejects maintenance assets; the doc column IS the gate ("The audit doc is the deliverable AND the gate", 39-CONTEXT specifics).

### Pattern 3: RFC 8058 decision section (D-04, discretion-bounded depth)
**What:** Own section presenting the trade-off at recommendation level. Must include the DKIM nuance (see Pitfall 2). Recommended shape:

```
## RFC 8058 List-Unsubscribe decision (digest email)

Recommendation (proposed — pending owner validation):
1. NOW: add a plain `List-Unsubscribe: <https://.../unsubscribe/...>` header (RFC 2369)
   to digest emails only — header-only change in buildDigestMessage (mailer.js:592-605),
   zero dependencies.
2. DEFER: `List-Unsubscribe-Post: List-Unsubscribe=One-Click` requires a DKIM signature
   covering both headers (RFC 8058 §3.1/§4); this mailer signs nothing (no DKIM in
   mailer.js). One-click lands only with a future DKIM milestone.
3. The unsubscribe target URI needs a hard-to-forge recipient identifier (RFC 8058 §6)
   and a POST endpoint — implementation detail for the follow-up milestone, noted not
   designed here.
```

### Anti-Patterns to Avoid
- **Generating the matrix with a script:** D-03 forbids it — no one-shot maintenance asset in a zero-dependency repo.
- **Coding any recommendation in this phase:** SC-3/AUDIT-02 — the audit changes no behavior; even "obvious" dead-key removal waits for `validated`.
- **Asserting proven negatives:** "key X is dead" must cite the toggle line + a dated no-reader note, not an unqualified claim.
- **A flat 16×3 matrix:** D-02 explicitly chose per-type sections over a single flat matrix.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Owner-validation tracking | A JSON ledger / DB table / test pin | The doc's status column + STATE.md line (D-05) | Doc-only phase; extra machinery contradicts D-03 |
| Key inventory | An inventory script that greps server.js | Hand-written rows with file:line citations (D-03) | Script becomes a maintenance liability; citations stay re-verifiable by any future editor |
| RFC 8058 research | Re-deriving header semantics | Cite RFC 8058 directly (rfc-editor.org/rfc/rfc8058) | Primary source, stable since 2017 |

**Key insight:** the deliverable's only durable property is *traceability* — every claim points at the code line it describes, so drift is detectable by re-reading, not by running anything.

## Common Pitfalls

### Pitfall 1: Stale line numbers
**What goes wrong:** Citations drift the moment any prior-phase file is touched; the audit is written against the post-38 tree but line numbers shift with any future edit.
**Why it happens:** D-03 chose file:line citations over tests.
**How to avoid:** Executor re-opens every cited line before writing the row (don't copy line numbers from this research blindly — re-verify; the quotes above make that cheap).
**Warning signs:** A cited line that doesn't contain the quoted symbol.

### Pitfall 2: Recommending one-click unsubscribe without the DKIM caveat
**What goes wrong:** The audit recommends `List-Unsubscribe-Post` as "~zero dependencies" and a follow-up phase discovers RFC 8058 §4's hard DKIM requirement ("MUST apply at least one valid DKIM signature... SHOULD NOT offer a one-click unsubscribe" without it), making the recommendation non-implementable as scoped.
**Why it happens:** D-04's framing mentions only the headers; the RFC's §4 requirement is easy to miss.
**How to avoid:** The decision section must state the DKIM prerequisite explicitly and split the recommendation: plain `List-Unsubscribe` (RFC 2369, header-only) now; one-click deferred to a DKIM milestone. [CITED: rfc-editor.org/rfc/rfc8058 §3.1, §4, §6 — fetched and read this session]
**Warning signs:** Any audit text promising Gmail/Yahoo one-click compliance from headers alone.

### Pitfall 3: Confusing "toggle exists" with "behavior exists"
**What goes wrong:** The settings UI shows 16 toggles across 4 panels (src/pages/settings.js:366-400); a naive audit treats all 16 as live behavior.
**How to avoid:** Use the consumption map (backbone §5) — every row's "live?" cell must point at a *reader*, not the toggle.
**Warning signs:** A trim recommendation justified by the toggle's presence rather than a reader's absence.

### Pitfall 4: Missing the `update` type
**What goes wrong:** SC-1 says "every notification type"; `update` (status-change watcher rows, actions.js:204) is easy to overlook because it has no pref key and no email channel.
**How to avoid:** Type axis = the six emitters in backbone §4. `update` gets a section stating "in-app only, no pref key gates it, email channel absent from NOTIF_EMAIL_KIND."
**Warning signs:** An audit with exactly five type sections and no mention of `update`.

### Pitfall 5: Digest ≠ a notif row
**What goes wrong:** Treating the digest as a notification *type* with a pref row like the others.
**How to avoid:** The digest never writes a notif row and its opt-in reads the STORED value strictly (`!== true` skip, server.js:1504), not the merged defaults — different gate shape from every email kind (`=== false` skip). The digest section should document this asymmetry.
**Warning signs:** Audit text saying digest respects `getUserNotifPrefs` defaults.

### Pitfall 6: Scope creep into coding
**What goes wrong:** Executor "helpfully" deletes a dead toggle or adds the List-Unsubscribe header while in the file.
**How to avoid:** Plan states a hard prohibition: zero non-doc file changes; verification = `git diff --name-only` shows only `docs/notification-audit.md` (+ STATE.md mirror per D-05).
**Warning signs:** Any plan task whose action verb isn't "write/document/record".

## Code Examples

### The suppression asymmetry the digest section must capture
```js
// server.js:1235 — email kinds: merged defaults, === false disables
if (prefs[prefKey] === false) continue;
// server.js:1247 — reminder kind, digest opt-in: STORED value, strict === true
if (prefKey === 'email_reminder' && getStoredNotifPrefs(...).email_digest === true) continue;
// server.js:1504 — digest send: STORED value, strict !== true skips
if (getStoredNotifPrefs(r.user_id, ws.id).email_digest !== true) continue;
```
[VERIFIED: server.js:1235, :1247, :1504]

### The header block a future List-Unsubscribe would ride (digest)
```js
// mailer.js:592-605 (buildDigestMessage headers — currently no unsubscribe headers)
const headers = [
  `From: ...`, `To: <${to}>`, ..., 'MIME-Version: 1.0',
  `Content-Type: multipart/alternative; boundary="${boundary}"`,
  'Auto-Submitted: auto-generated', 'X-Mailer: Projects Studio',
];
```
[VERIFIED: mailer.js:592-622 — full block read; the exact header list at :592-605 mirrors the notif block at :479-491]

### RFC 8058 minimal compliant example (for the decision section)
```
List-Unsubscribe: <https://example.com/unsubscribe/opaquepart>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```
[CITED: rfc-editor.org/rfc/rfc8058 §8.1 — plus §4: DKIM signature covering both headers is MUST for senders, and receivers SHOULD NOT offer one-click without it]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RFC 2369 `List-Unsubscribe` (mailto/GET) only | RFC 8058 one-click POST + Gmail/Yahoo bulk-sender mandates | RFC 8058: Jan 2017; Gmail/Yahoo requirements: Feb 2024 | Headers alone give Gmail's native Unsubscribe button; one-click POST additionally needs DKIM [CITED: rfc-editor.org/rfc/rfc8058; bulk-sender threshold is common knowledge — tag sender-size claims in the audit as [ASSUMED] unless separately verified] |
| `day_before` reminder cadence | two-offset (morning_of + past_due) | Phase 37 | Audit rows must reflect only morning_of/past_due offsets (server.js:1423-1427) |
| `email_digest` default true | opt-in, undefined-falsy, suppresses reminder emails | Phase 38 D-14/D-11 | Audit documents the precedence: digest ON beats email_reminder regardless of its value (server.js:1240-1247 comment) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `mention_ws`, `assign_status`, `assign_over`, `assign_self` have no reader anywhere (grep-based absence; storefront coverage was src/actions, src/core, src/pages minus the toggle lines, server.js) | Backbone §5 | A "dead toggle" trim recommendation could be wrong if a dynamic reader exists (e.g. `np[k]` computed access); executor must re-grep before writing each dead row — including patterns like `np[el.dataset.k]` (actions.js:2686 shows the generic write path) |
| A2 | Gmail/Yahoo bulk-sender 5,000 msg/day threshold and Feb 2024 date | State of the Art / RFC section | Low — the audit only needs "DKIM required for one-click" (RFC-verified); sender-size claims can be phrased conditionally |

All other claims carry inline `[VERIFIED: file:line]` tags with verbatim quotes above.

## Open Questions (RESOLVED)

1. **Should the audit doc's "live?" column cite grep evidence or silence?** — **RESOLVED (in-plan, planner's discretion per D-03):** dead-key rows cite the toggle line + "(no reader found; grep 2026-11-05)". Implemented in 39-01 task actions.
   - What we know: D-03 requires a file:line per row; dead-key rows have no reader line to cite.
   - Answer: cite the toggle line + "(no reader found; grep 2026-11-05)" — settled in-plan, planner's discretion.

2. **Does the owner want the audit to propose whitelist *key removal* (breaking PUT for retired keys) or only default/UX trims?** — **RESOLVED (planner's discretion, consistent with Phase 37 precedent):** each dead-key row presents both severities (trim-to-default vs full removal) in the status column; the audit is doc-only and the owner chooses per row. Implemented in 39-01 task actions.
   - What we know: Phase 37 precedent retired `push_due` end-to-end with 400 on retired-key PUT (STATE.md 37-03).
   - Answer: the audit presents both severities per row (trim-to-default vs full removal) and lets the owner pick — that is exactly what the status column is for.

## Environment Availability

SKIPPED — no external dependencies. The phase needs only the repo tree and a text editor; no packages, services, or CLIs beyond what builds the repo today. (Config has no `nyquist_validation: false`; see Validation Architecture for how the doc-only shape affects testing.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (existing suite in test/*.test.mjs) |
| Config file | none needed — no tests added (D-03: no regression test pinning the doc) |
| Quick run command | `node scripts/i18n-scan.mjs` (build gate must stay green — sanity that nothing else broke) |
| Full suite command | `node --test test/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-01 | Audit doc exists, covers all types × channels × defaults, cites file:line per row, records RFC 8058 decision | manual (doc review) | human review at /gsd-verify-work | n/a |
| AUDIT-02 | No behavior change; owner gate recorded | verification command | `git diff --name-only <base>` shows only docs/notification-audit.md (+ STATE.md line per D-05) | n/a |

### Sampling Rate
- **Per task commit:** re-read the diff (doc-only).
- **Per wave merge:** `node scripts/i18n-scan.mjs` green (proves untouched behavior).
- **Phase gate:** doc reviewed; zero code files changed; full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
None — deliberately no new tests (D-03). Existing suite is untouched by a doc commit.

## Security Domain

security_enforcement is not disabled in config → included. This phase changes no executable code, so no ASVS category introduces new obligations:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3/V4/V6 | no | no auth/session/access/crypto surface touched |
| V5 Input Validation | no (doc-only) | n/a — the doc must not contain secrets or real user emails |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Audit doc leaking subscriber info (e.g. example unsubscribe URIs with real tokens) | Information Disclosure | Use placeholder/example URIs only (RFC 8058 §6 hard-to-forge-identifier guidance noted at recommendation level) |
| Future one-click unsubscribe forging (attackers POSTing unsubscribe links) | Tampering/Spoofing | RFC 8058 §6: opaque hard-to-forge recipient identifier + no cookies/auth context — record in the decision section as a follow-up design constraint [CITED: rfc-editor.org/rfc/rfc8058 §6] |

## Project Constraints (from AGENTS.md)

- Zero runtime dependencies; zero migrations; plain Node — respected trivially (no code).
- MCP/global instructions: context7/RFC verification done for RFC 8058 (primary source read this session); no invented values — every discrete value quoted verbatim with line ranges.
- GSD cycle: this research precedes planning; no code before a validated plan (doc-only plan expected).

## Sources

### Primary (HIGH confidence)
- server.js:1124-1263, 1360-1561, 2892-2958, 3322-3363 — read directly this session (whitelists, defaults, accessor, email-kind map, fan-out, reminder+digest pass, PUT route)
- src/core/notifPrefs.js:1-85 — read in full
- src/pages/settings.js:366-400 — notification toggle panels read directly
- src/actions/actions.js:135-160, 200-210, 3203-3214, 2686-2695 — read directly
- mailer.js:402-510, 525-622 — read directly (both MIME frames, header blocks, no DKIM)
- rfc-editor.org/rfc/rfc8058 — full text fetched this session

### Secondary (MEDIUM confidence)
- Prior-phase contexts 36/37/38 (`.planning/phases/*/` *-CONTEXT.md) — boundary pins and decisions, consistent with the code as read

### Tertiary (LOW confidence)
- Gmail/Yahoo bulk-sender requirements (A2) — common knowledge, not verified this session

## Metadata

**Confidence breakdown:**
- Fact backbone: HIGH — every value quoted verbatim from files opened this session
- RFC 8058 mechanics: HIGH — primary RFC text fetched
- Dead-key findings: MEDIUM-HIGH — grep-based absence (A1), mitigated by per-row re-verification discipline
- Trim recommendation content: researcher judgment per CONTEXT discretion — not a correctness claim

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 (stable — but line citations drift with any edit; re-verify rows at execution time per D-03)
