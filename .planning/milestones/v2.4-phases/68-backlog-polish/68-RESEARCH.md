# Phase 68: Backlog Polish - Research

**Researched:** 2026-11-16
**Domain:** In-repo polish — client view-state filtering (mobile card), server claim-table SMTP retry, CSS scoping, planning-artifact reconciliation
**Confidence:** HIGH — every claim below was verified by reading the source files this session; no external packages are involved.

## Summary

Phase 68 is a four-item debt-clearing phase. Two items (POL-01, POL-03) are small client-side changes in already-understood files. One (POL-02) is the largest: a new `email_outbox` claim table mirroring the Phase 67 `webhook_deliveries` design, replacing the two fire-and-forget email sites (`server.js:2126` notif, `server.js:2419` digest) with claim-then-deliver semantics. One (POL-04) is documentation-only: a Formal Acceptance section appended to the archived 64-VALIDATION.md.

The webhook claim machinery is fully built and is the direct template: `webhook-retry.js` exports pure backoff math (`BACKOFF_MS`, `nextAttemptMs`, `isDead` — verified verbatim below), `runWebhookDeliveryPass` (server.js:2796) is the drain loop piggybacking a 30 s unref'd tick with inline 7-day purge, and `webhook_deliveries` in db-adapter.mjs:343 is the table shape to mirror. POL-02 should reuse the backoff module directly (it takes no webhook-specific params) and copy the pass/claim/purge structure, not invent new semantics.

The mobile card change is smaller than it appears: `.mcard` (table.js:94, inside `tableHtml`) renders a hardcoded field set and never reads `v.hidden[]` — the fix is a render-time filter plus minimum-identity guarantee (status row + title + key are the `.mch` row; the `.mcm` row holds priority/assignees/due/estimate/progress). The cols popover exists and is fully functional; it is only hidden ≤900px by `responsive.css:107-109` (`[data-pop='cols'] { display: none !important; }`), which D-02 removes. Note POL-03 touches the same CSS band: `.toolbar { flex-shrink: 0 }` (responsive.css:104-106) becomes `.page.flush .toolbar`.

**Primary recommendation:** Structure as 4 independent work items; POL-02 mirrors the Phase 67 claim machinery (shared backoff module, new `email_outbox` table byte-identical across SCHEMA+pg with epoch columns registered, claim inside the existing reminder/digest transactions, a delivery pass on the existing tick); POL-01 filters `.mcard` fields by `hidden[]` with the 4 minimum-identity fields exempt; POL-03 is a two-line CSS scope change; POL-04 is a doc edit.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**POL-01 — Mobile card × hidden[]**
- **D-01:** Minimum-identity always visible on card: status + title + key + assignees — never affected by hidden[].
- **D-02:** Existing cols popover becomes usable ≤900px (remove the `display:none` at responsive.css:107) — one control UI; card and table share the same `hidden[]` view state.
- **D-03:** Global toggle: hiding a table column also hides its card equivalent if one exists; entries with no card equivalent (labels, deps…) stay togglable — the card simply reads `hidden[]` and ignores what it doesn't render. — Reversible: pure read of existing view state, no published contract.

**POL-02 — Claim-based SMTP retry**
- **D-04:** Scope: email notifications (site fire-and-forget server.js:2126) + digest (server.js:2419) go claim-based. Invites and 2FA alerts stay fire-and-forget (failure = log; user can resend invite manually).
- **D-05:** Dedicated table `email_outbox` (same shape as webhook_deliveries: status/next_attempt_at/last_status_code/last_error/ctx) — separate from webhooks, different volume and lifecycle. — Costly: new table mirrored on both backends (SQLite + pg, byte-identical, Pitfall P-B).
- **D-06:** Retry policy identical to webhooks (67 D-05): 5 attempts max, backoff 1m → 5m → 30m → 2h → 8h — one mental model, shareable backoff code.
- **D-07:** Ledger digest D-12 stays the semantic claim (WHAT to send, who-was-notified history); email_outbox is the transport claim (HOW to deliver). Digest writes to outbox at the D-12 claim moment — one outbox row per digest, no double-send possible.
- **D-08:** Dead email (retries exhausted): status `dead` in email_outbox, purge 7 days after, silent — no badge, no notification.

**POL-03 — WR-01 CSS scoping**
- **D-09:** Strict scope: `.toolbar { flex-shrink: 0 }` becomes `.page.flush .toolbar` ≤900px — other toolbars (board, settings…) are not in a fixed-height flex column and never had the bug. Non-regression proven by existing e2e suite.

**POL-04 — 64-VALIDATION reconciliation**
- **D-10:** Formal acceptance: draft gets a "Formal Acceptance" section (status accepted, rationale audit-milestone §5.5, evidence: 115/115 green suite at close + integration audit 5/5 chains). No retroactive re-validation.

### the agent's Discretion
- Exact form of the email retry driver (reuse/adapt webhook driver) and purge mechanism (cron vs at-write).
- Structure of the Formal Acceptance section in 64-VALIDATION.md (as long as status + rationale + evidence appear).
- Implementation details of card filtering by hidden[] (render-time filter vs computed fields), as long as D-01 guarantees the 4 minimum-identity fields.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Explicitly out of scope: invites and 2FA alerts remain fire-and-forget; no new UI surface beyond what is decided above.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POL-01 | Mobile card fields driven by existing `hidden[]` contract; popover hides/shows card fields; minimum-identity always visible; dedicated 390×844 e2e | `tableHtml` (table.js:70-94) reads `v.hidden` for table cols but `.mcard` at line 94 is hardcoded; popover live but CSS-hidden ≤900px (responsive.css:107). `mobile-tasks-table.spec.mjs` is the e2e template (context `viewport` option pattern). |
| POL-02 | Email retry claim-state machine, never mark-then-send, never blanket re-drive; Phase 38 no-double-send invariant | Full Phase 67 claim machinery exists to mirror: `webhook-retry.js` backoff math (verbatim below), `webhook_deliveries` schema (db-adapter.mjs:343-358), `runWebhookDeliveryPass` drain+purge (server.js:2796), `webhookFailDelivery` guarded write-back. The two email sites are inside the reminder pass after the `reminders_sent` ledger claim — the natural claim points. |
| POL-03 | `.toolbar { flex-shrink: 0 }` scoped to `.page.flush .toolbar` ≤900px; board proven unchanged | Rule verified verbatim at responsive.css:104-106. Phase 64 D-07 comment explains why the rule exists (fixed-height flex column squeeze) — scoping keeps exactly that page context. |
| POL-04 | 64-VALIDATION reconciled or formally accepted per audit-milestone §5.5 | Draft status is "draft" per audit line 12; D-10 locked formal acceptance. Doc-only edit to `.planning/milestones/v2.3-phases/64-mobile-tasks-table-suite-green/64-VALIDATION.md`. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Card field filtering by hidden[] (POL-01) | Browser/Client (view engine) | Server (view-state persistence — already exists, no change) | `tableHtml` renders both table and card; `hidden[]` persistence contract (VIEW_BLOB_KEYS, server.js:1762) already exists. |
| Cols popover on mobile (D-02) | Browser/Client (CSS) | — | Pure CSS unhide at responsive.css:107. |
| email_outbox claim table + retry (POL-02) | API/Backend (server.js + db-adapter.mjs) | Database/Storage (new mirror table, both backends) | Claim must commit in the sender's transaction; drain pass is server-side like webhooks. |
| WR-01 CSS scoping (POL-03) | Browser/Client (CSS) | — | Two-line responsive.css change. |
| 64-VALIDATION acceptance (POL-04) | Planning docs | — | Markdown edit only. |

## Standard Stack

No new packages. This phase uses only existing in-repo infrastructure — **Package Legitimacy Audit: not applicable (zero external installs).**

### Core (existing, verified)
| Asset | Location | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `webhook-retry.js` | repo root | Pure backoff math: `BACKOFF_MS`, `nextAttemptMs({attempt, retryAfterHeader, now})`, `isDead(attempt)` | Already implements D-06 exactly; pure (no I/O, clock injected) so directly reusable for email [VERIFIED: webhook-retry.js:17,25,42] |
| `webhook_deliveries` schema | db-adapter.mjs:343-358 | The table shape D-05 mirrors | Column list quoted verbatim below [VERIFIED: db-adapter.mjs:343-358] |
| `runWebhookDeliveryPass` | server.js:2796 | Drain loop: purge → select due → deliver → guarded fail write-back | Architectural template for the email pass [VERIFIED: server.js:2796-2816] |
| `ensureColumn` | db-adapter.mjs:828 | Idempotent additive migration | Boot-time migration for any additive column [VERIFIED: db-adapter.mjs:828-845] |
| `PG_EPOCH_COLUMNS` | db-adapter.mjs:369-377 | pg bigint widening for epoch-ms integer columns | Any new integer epoch column (e.g. `next_attempt_at` clone names) must be registered here [VERIFIED: db-adapter.mjs:369-377] |
| `mobile-tasks-table.spec.mjs` | e2e/ | 390×844 e2e template (context `viewport` option, one context per account, fixtures through real API) | Existing conventions to follow [VERIFIED: e2e/mobile-tasks-table.spec.mjs:1-30] |

**Installation:** none.

## Code Examples

### Verified verbatim quotes (in-repo discrete values)

`webhook-retry.js` — the D-06 backoff table and helpers [VERIFIED: webhook-retry.js:17-46]:
```js
/* D-05: after failed attempt N (0-based), wait table entry N. */
export const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 28_800_000];
export function nextAttemptMs({ attempt = 0, retryAfterHeader = null, now = Date.now() } = {}) { /* Retry-After override, else table */ }
export function isDead(attempt = 0) {
  return attempt >= BACKOFF_MS.length;
}
```

`webhook_deliveries` SCHEMA [VERIFIED: db-adapter.mjs:343-358]:
```sql
create table if not exists webhook_deliveries (
  id               text primary key,
  workspace_id     text not null,
  hook_id          text not null,
  event            text not null,
  dedup_key        text not null unique,
  ctx              text not null default '',
  payload_hash     text not null default '',
  attempt          integer not null default 0,
  status           text not null default 'pending',
  next_attempt_at  integer,
  last_status_code integer,
  last_error       text not null default '',
  created_at       integer not null,
  delivered_at     integer
);
create index if not exists webhook_deliveries_due on webhook_deliveries(status, next_attempt_at);
```

WR-01 target rule + Phase 64 rationale comment [VERIFIED: src/styles/responsive.css:101-109]:
```css
  /* Phase 64 D-01..D-04: Columns hidden ≤900px, card stack shown (Option B band).
     D-07: .page.flush is a fixed-height flex column — without flex-shrink:0 the
     wrapped 390px toolbar is squeezed to 44px and its tabs clip under the list. */
  .toolbar {
    flex-shrink: 0;
  }
  [data-pop='cols'] {
    display: none !important;
  }
```

`hidden[]` persistence contract [VERIFIED: server.js:1762]:
```js
const VIEW_BLOB_KEYS = ['filters', 'sort', 'group', 'hidden', 'colW', 'showDone'];
```

`.mcard` render site — hardcoded field set, no `hidden` read [VERIFIED: src/views/table.js:94]:
```js
${ts.map(t => `<div class="panel mcard" data-a="openTask" data-id="${t.id}"><div class="row mch">${stIcon(t.status)}<b class="grow">${esc(t.title)}</b><span class="mono faint" ...>${t.key}</span></div><div class="row muted mcm">${prPill(t.priority)}${avStack(t.assignees || [], 3, 'sm', false)}...${dueHtml(t)}${t.estimate ? ... }...${progBar(taskProg(t), ...)}</div></div>`).join('')}
```
Field mapping for D-01: `.mch` row = status icon + title + key (3 of the 4 minimum-identity); assignees live in `.mcm` via `avStack`. priority/due/estimate/progress are the hideable extras.

Claim-then-deliver pattern in the digest loop (the POL-02 injection point) [VERIFIED: server.js:2374-2419]:
```js
/* D-12 ledger honesty: an empty digest claims nothing and sends nothing. */
let claimed = false;
await db.tx(async () => {
  const res = await db.run('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)', [...]);
  claimed = res.changes !== 0;
});
if (!claimed) continue;
/* Post-commit fire-and-forget — NEVER inside the transaction. */
if (MAILER.enabled) { MAILER.sendDigest({...}).catch(err => logWarn(...)); }
```

Existing fire-and-forget notif site to replace [VERIFIED: server.js:2126]:
```js
MAILER.sendNotif({ to, workspace: wsName, by, task: taskTitle, snippet: n.snippet || '', kind: n.type, url, locale: recipientLocale })
  .catch(err => logWarn(`notif email ${n.id} → ${to}: ${err.message}`));
```

### Pattern 1: email_outbox as transport claim (POL-02)

**What:** Producers (notif loop, digest loop) insert one `email_outbox` row inside their existing transaction context (the reminder claim tx / notif append flow) carrying everything needed to rebuild the email later (recipient, locale, kind, payload JSON in `ctx`). A pass on the existing 30 s tick drains due rows and calls MAILER. Failure → guarded attempt write-back using `webhook-retry.js` math; `isDead` → status `dead`.

**When to use:** The two D-04 sites only. `sendInvite` / `sendSecurityAlert` remain direct fire-and-forget.

**Key invariants to preserve (Phase 38 no-double-send):**
- The semantic claim (`reminders_sent` INSERT OR IGNORE for digest; the notif row append for notifications) must stay exactly as-is — D-07: outbox is transport only.
- Outbox insert must be claim-shaped: unique `dedup_key` + INSERT OR IGNORE, committed with (or immediately after) the semantic claim, so a crash between claim and insert cannot lose the email and a re-run cannot duplicate it. Note: for notifs, the semantic claim IS the notifications row itself — the outbox dedup_key should derive from `n.id` (notification id is the per-recipient unique identity, already used in the failure log line).
- Delivery is post-commit, never inside `db.tx` (existing comment: "NEVER inside the transaction").
- No blanket re-drive: only rows with `status in ('pending','failed') and next_attempt_at <= now` are drained, exactly like server.js:2808.

### Pattern 2: render-time hidden[] filter for .mcard (POL-01)

**What:** In `tableHtml`, compute the card-visible fields as a pure function of `v.hidden`: minimum-identity (status/title/key/assignees per D-01) always render; priority/due/estimate/progress render only when their table-column equivalent (`priority`, `due`, `estimate`, and the progress column id) is not hidden. Column ids come from `TCOLS` in table.js — the same array the popover toggles, guaranteeing the D-03 "same view state" contract with zero new state.

### Pattern 3: e2e at 390×844

Follow `mobile-tasks-table.spec.mjs` conventions: context-level `viewport` option (no second Playwright project, no `setViewportSize`-only reliance), fixtures via real API (`createAccount`, doc PUT), web-first assertions, no sleeps.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry backoff / Retry-After | New email backoff table | `webhook-retry.js` exports (pure, injectable clock) | D-06 mandates identical policy; already tested (`test/webhook-retry.test.mjs`) |
| Claim-table drain/pass/purge | New scheduler | Copy `runWebhookDeliveryPass` structure on the existing 30 s tick (server.js:8585-8591) | Proven fail-absent, purge piggybacks the tick |
| View state persistence | Any new card-state storage | Read existing `v.hidden` from `viewOf(key)` | D-03: one view state, no published contract |
| Mobile e2e harness | New viewport plumbing | `mobile-tasks-table.spec.mjs` context-viewport pattern | Avoids flake (Phase 63 lessons) |

**Key insight:** Phase 67 already built the entire claim-state machine; POL-02 is a second consumer of that machinery, not a new design.

## Common Pitfalls

### Pitfall P-B: SCHEMA ↔ ensureColumn byte-identity + reserved names
**What goes wrong:** A new column (or table) defined differently in SCHEMA vs ensureColumn, or named `oid`/`rowid`/`_rowid_`, breaks on SQLite 3.54+ (reserved alias names refused in ALTER TABLE ADD COLUMN — the Phase 67 `aad_oid` lesson).
**Avoid:** For `email_outbox` prefer a CREATE TABLE in SCHEMA (both backends compile from the same DDL — that's how webhook_deliveries works) rather than ensureColumn; register every integer epoch column (`next_attempt_at`, `delivered_at`, `created_at`) in `PG_EPOCH_COLUMNS` (db-adapter.mjs:369-377 — both names already present there from webhook_deliveries; `email_outbox` reuses the same column names so no new Set entries should be needed, but verify).
**Note:** `PG_EPOCH_COLUMNS` is keyed by column NAME, not table — reusing `created_at`/`next_attempt_at`/`delivered_at` names means webhook_deliveries' registrations already cover email_outbox. [VERIFIED: db-adapter.mjs:369-377]

### Pitfall 2: double-send via transaction boundaries
**What goes wrong:** Marking an email sent before/after send outside a claim → crash windows duplicate or drop emails.
**Avoid:** Claim (outbox insert with unique dedup_key) commits with the semantic claim; delivery updates status after send; drain only claims due rows. Never "mark then send".

### Pitfall 3: SMTP-unavailable boot
**When SMTP is disabled (`MAILER.enabled` false), the digest loop skips sending entirely.** With an outbox, decide explicitly: producers still claim into outbox, and the pass marks rows dead/skipped when MAILER is disabled — otherwise rows accumulate forever. Keep the current "empty digest claims nothing" guard (server.js:2374).

### Pitfall 4: CSS scope too wide or too narrow
`.toolbar { flex-shrink: 0 }` is inside the ≤900px media band (line ~98 onward). Scoping to `.page.flush .toolbar` keeps the Phase 64 fix intact (the tasks-table page IS a `.page.flush`) while freeing board/settings toolbars. Prove by running the existing suite, not by manual inspection. [VERIFIED: responsive.css:98-109 comment explains the fixed-height flex column context]

### Pitfall 5: popover regression on desktop
Removing `[data-pop='cols'] { display:none !important }` affects only ≤900px (it's inside the band) — desktop behavior unchanged by construction. But the audit noted `[data-pop='cols']` hide was itself a Phase 64 D-01..D-04 decision (audit line 40, MOB-01 evidence) — the existing `mobile-tasks-table.spec.mjs` may assert the popover is hidden at 899px; that spec must be updated, not just extended. **Check for assertions on the cols popover in the existing spec before planning the e2e.**

### Pitfall 6: e2e claims about suite totals
POL-04 cites "115/115 green" — the suite has grown since (Phase 65/66/67 added specs). Cite the evidence as of the v2.3 close, per D-10 ("no retroactive re-validation"), not the current count.

## State of the Art (in-repo)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Email fire-and-forget (`.catch(logWarn)`) | Claim-table delivery (Phase 67 pattern) | v2.4 Phase 67 | POL-02 extends it to email |
| Fixed `.mcard` field set | `hidden[]`-driven (this phase) | — | Table and card share view state |
| 64-VALIDATION "draft" | Formal Acceptance section (this phase) | audit-milestone §5.5 precedent | Closes the last v2.3 open artifact |

## Runtime State Inventory

Not a rename/migration phase in the string-replacement sense, but POL-02 adds a table — additive only:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New `email_outbox` table (empty at creation); `reminders_sent` ledger unchanged | CREATE TABLE in SCHEMA (both backends); no data migration |
| Live service config | None — verified: no external service config carries any renamed value | none |
| OS-registered state | None — verified (no cron/tasks; timers are in-process `setInterval(...).unref()`, server.js:8585-8591) | none |
| Secrets/env vars | None new; SMTP env (SMTP_HOST etc.) unchanged | none |
| Build artifacts | None — no rename of shipped modules | none |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | tests, server | ✓ | v24.21.0 | — (engines >=24) |
| Playwright (@playwright/test) | POL-01 e2e, POL-03 regression | ✓ | ^1.64.1 | — |
| node --test runner | unit tests | ✓ | built-in | — |
| SQLite (node:sqlite DatabaseSync) | outbox table | ✓ (in use) | node built-in | — |
| pg driver | pg parity | ✓ | ^8.23.1 (dep present) | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (unit) + `@playwright/test` ^1.64.1 (e2e) |
| Config file | e2e/playwright.config.mjs; unit tests are `test/*.test.mjs` (no config) |
| Quick run command | `node --test test/<new-file>.test.mjs` |
| Full suite command | `npm test` (node --test --test-concurrency=2 test/*.test.mjs) and `npm run e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POL-01 | Card fields follow hidden[] at 390×844; minimum-identity always visible; popover usable ≤900px | e2e | `npx playwright test --config e2e/playwright.config.mjs e2e/mobile-card-hidden.spec.mjs` | ❌ Wave 0 |
| POL-01 | Existing mobile spec still green (popover assertions updated) | e2e | `... e2e/mobile-tasks-table.spec.mjs` | ✅ (update in place) |
| POL-02 | email_outbox claim/retry/dead/purge state machine; no-double-send invariant; digest one-row-per-digest; invites/2FA untouched | unit | `node --test test/email-outbox.test.mjs` | ❌ Wave 0 |
| POL-02 | Existing digest/notif tests unregressed | unit | `node --test test/digest.test.mjs test/due-reminders.test.mjs test/notif-*.test.mjs` | ✅ |
| POL-03 | Board toolbar unaffected; flush-page toolbar still flex-shrink:0 at ≤900px | e2e | `npm run e2e` (existing suite = non-regression proof per D-09) | ✅ (existing suite) |
| POL-03 | Byte-level CSS scoping assert (`.page.flush .toolbar` present, bare `.toolbar` rule absent in band) | unit | `node --test test/responsive-css-scope.test.mjs` (pattern: existing css-assert tests) | ❌ Wave 0 (optional but cheap) |
| POL-04 | 64-VALIDATION.md contains Formal Acceptance (status/rationale/evidence) | manual (doc edit, verified at phase gate) | — | manual-only (justification: planning artifact, not code) |

### Sampling Rate
- **Per task commit:** targeted `node --test <changed-area>.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` + full `npm run e2e` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `e2e/mobile-card-hidden.spec.mjs` — POL-01 390×844 proof (reuse mobile-tasks-table.spec.mjs conventions)
- [ ] `test/email-outbox.test.mjs` — claim state machine, retry math wiring, dead/purge, invariant checks (injectable clock, pattern of test/webhook-delivery.test.mjs)
- [ ] Update `e2e/mobile-tasks-table.spec.mjs` if it asserts cols-popover hiddenness (verify first)

## Package Legitimacy Audit

Not applicable — this phase installs zero external packages (verified: all work is in-repo server/client/tests/docs).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The progress card field corresponds to a togglable table column id in `TCOLS` (exact id not read — likely `progress`) | Pattern 2 | Filter maps one extra field wrongly; cosmetic, caught by e2e |
| A2 | Notifications have a natural unique per-recipient id (`n.id`) usable as outbox dedup basis | Pattern 1 | Dedup key design needs adjusting; discovered in Wave 0 tests |
| A3 | Existing `mobile-tasks-table.spec.mjs` may contain a cols-popover-hidden assertion at 899px (audit line 40 suggests the hide rule is spec-covered) | Pitfall 5 | Spec update missed → suite red; cheap to verify before planning |
| A4 | SCHEMA DDL is compiled for pg by the same DDL-rewrite path (strip nocase + epoch widening) — `email_outbox` needs no separate pg definition beyond DDL placement | Pitfall 1 | pg table drift; caught by db-adapter tests |
| A5 | `res.changes` is the portable affected-rows read on both backends for INSERT OR IGNORE | Pattern 1 | Claim detection differs on pg; caught by db-adapter tests |

## Open Questions

1. **Notif outbox claim timing** — notifs are appended outside an explicit `db.tx` (unlike the digest's claim tx). Should the outbox insert join a tx with the notif append, or ride post-append?
   - What we know: digest path has a clean claim tx (server.js:2379-2388); the notif loop reads pending rows and sends per-recipient.
   - Recommendation: let the planner pick; both are safe if outbox insert is idempotent by dedup_key (INSERT OR IGNORE).
2. **MAILER disabled behavior** — claim anyway + mark skipped, or skip claiming entirely (preserves current "no SMTP → no email" behavior)?
   - Recommendation: skip claiming when MAILER is disabled (mirrors current `if (MAILER.enabled)` gate at server.js:2391) — keeps semantics identical when SMTP was never configured; claim-based retry only matters when SMTP is configured but down.

## Sources

### Primary (HIGH confidence)
- All `[VERIFIED: ...]` tags above — files read this session: src/views/table.js (60-100), src/styles/responsive.css (95-120), server.js (2090-2150, 2360-2440, 2560-2830, 1755-1775, 8585-8604), db-adapter.mjs (335-400, 815-870), webhook-retry.js (full), mailer.js (995-1030), e2e/mobile-tasks-table.spec.mjs (1-40)
- .planning/phases/68-backlog-polish/68-CONTEXT.md, 67-CONTEXT.md, ROADMAP.md §Phase 68, REQUIREMENTS.md POL-01..04, v2.3-MILESTONE-AUDIT.md (lines 12, 29-41)

### Secondary (MEDIUM confidence)
- None needed — this is an in-repo phase; no external docs consulted.

### Tertiary (LOW confidence)
- Assumptions A1-A5 above (all cheaply verifiable at plan/execute time).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external deps; all assets read verbatim
- Architecture: HIGH — claim design copied from shipped, tested Phase 67 code
- Pitfalls: HIGH — P-B carried from Phase 67 lessons, others read from source

**Research date:** 2026-11-16
**Valid until:** 2026-12-16 (stable in-repo domain)
