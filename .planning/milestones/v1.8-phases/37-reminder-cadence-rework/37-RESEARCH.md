# Phase 37: Reminder Cadence Rework - Research

**Researched:** 2026-11-04
**Domain:** Server reminder scheduler logic deletion + i18n catalogue cleanup (zero-dependency Node.js 24, node:test)
**Confidence:** HIGH (this is a pure logic-deletion phase over code paths read and verified in-session; no external research needed, as the roadmap predicted)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Keep the `localDate >= due` window-open predicate for the "due today" (morning_of) reminder — do NOT tighten to `=== due`. Late beats never: if the server is down over the due-date morning, the reminder fires at the first 09:00 after boot, and that one-time catch-up burst is what SC-5's release notes document. No predicate change beyond removing the `day_before` arm.
- **D-02:** Reminders re-arm when a task's due date changes: the dedup key keeps its `due` component (`ws:task:assignee:offset:due`). "At most two per task" means per due-date value, per task, per assignee — a rescheduled task legitimately gets a fresh "due today" + "past due" for the new date. The REM-03 regression pin targets the no-re-fire-on-later-days guarantee for an unchanged due date, not the re-arm case. **One-way decision — dropping `due` from the dedup key would require a reminders_sent re-derivation/sweep, which REM-04 forbids.**
- **D-03:** Delete, don't neuter: remove the `day_before` offset branch in `runReminderPass`, the `dayBefore` arm of the key-mapping ternary, `reminderSnippet`'s day_before branch, AND both EN+FR `notif.reminder.dayBefore` catalogue entries. Legacy inbox rows carrying the `notif.reminder.dayBefore` key degrade safely to their stored English prose snippet (Phase 36 D-06 dual store) — no blank text, no migration.
- **D-04:** Rename the `due_reminder` toggle copy to "Due-day reminder" (EN) / "Rappel le jour d'échéance" (FR) with descriptions that state exactly what remains: EN "Get a reminder on the morning a task is due" / FR "Recevez un rappel le matin de l'échéance d'une tâche". The `due_reminder` preference key and settings toggle itself stay (REM-02); only copy changes. Where the copy lives (client locale entries vs server catalogue) follows the existing string architecture.
- **D-05:** Reminder email copy gets an ACCURACY-ONLY pass, not a rewrite. Adjust only wording that implies additional reminders are coming. No explicit "this is your only notice" cadence messaging — keys stay within the existing `notif.reminder.*` family, and the Phase 36 build gate (EN+FR parity, all server-referenced keys resolve) must pass.
- **D-06:** The REM-03 pin is a multi-morning clock replay using the existing test harness: drive the clock via `POST /api/internal/reminder-pass` (`REMINDER_TEST_TOKEN`) across several consecutive mornings after the due date (e.g. due, due+1, due+2, due+5) and assert exactly one morning_of notification, exactly one past_due notification, and nothing further on later days. Same pattern as the Phase 27 scheduler tests — no new harness, no schema-level ledger assertions.

### the agent's Discretion

- Exact copy final wording in EN+FR (user approved direction: rename + accuracy-only; planner/writer polishes strings).
- Whether the due_reminder/past_due settings labels are client-side locale entries or server catalogue strings — follow the existing architecture, don't restructure. **(Resolved by research: they are CLIENT locale entries — see D-04 resolution below.)**
- Internal test file placement and assertion style, following the Phase 27 reminder test conventions.
- Release-notes format/location for the catch-up burst note (SC-5) — follow existing release-notes convention if any, else document in the phase summary.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REM-01 | At most two due-date notifications total per task per assignee: "due today" morning-of + "past due" next morning; day-before gone on all channels | Verified deletion surface: offsets block server.js:1404-1408, snippet branch :1357, key ternary :1421; one shared code path feeds inbox rows + email fan-out (queueNotifEmails), so deleting the offset removes it on all three channels simultaneously |
| REM-02 | `due_reminder` preference governs only "due today"; key + toggle stay; copy updated EN+FR; `past_due` unchanged | Pref key verified in NOTIF_PREF_KEYS (server.js:1131) and defaults (:1147); toggle copy verified as client locale entries `settings.notif.dueReminder`/`dueReminderDesc` (src/locales/en.json:1249-1250, fr.json:1249-1250, rendered by src/pages/settings.js:385) |
| REM-03 | Past-due never re-fires on later days — regression pin | Multi-morning clock replay via existing harness `POST /api/internal/reminder-pass` (server.js:2849-2856), exactly-once via `INSERT OR IGNORE` dedup claim (server.js:1432-1441) — machinery unchanged, pin just re-proves it post-deletion |
| REM-04 | Deploy-safe removal: no migration, no sweep, second boot byte-identical; release notes announce one-time catch-up burst | No schema change anywhere in the deletion surface; orphaned `*:day_before:*` ledger rows go inert (offset never generated again); existing inbox rows with the dead key degrade to snippet (already pinned by test/notif-i18n.test.mjs:448-456) |
</phase_requirements>

## Summary

Phase 37 is the smallest-risk phase of the v1.8 milestone: a pure logic deletion over code paths verified in-session. Every change lands in five files — `server.js` (three small deletions), `src/locales/en.json` + `src/locales/fr.json` (one catalogue entry deleted, two settings copy entries updated), plus the test suite (several existing tests actively pin `day_before` behavior and MUST be rewritten, not just added to). No new packages, no schema change, no migration, no new harness.

The critical discovery is the **test debt**: `test/due-reminders.test.mjs` has extensive day_before pins (window matrix, month rollover, dedup keys ending `:day_before:2026-01-15`, snippet assertions `'Due tomorrow: Ship it'`) and `test/notif-i18n.test.mjs:365-374` asserts the dayBefore key is emitted. These turn red the moment the offset is deleted and must be updated in the same phase — this is planned work, not a surprise. Conversely, `test/notif-i18n.test.mjs:448-456` was written in Phase 36 anticipating exactly this phase: it pins that a legacy `notif.reminder.dayBefore` row renders via the snippet fallback, and it should survive untouched as proof of the inert-rows guarantee.

The second discovery is a **shared-label trap**: the client locale key `settings.notif.dueReminder` (singular) is used BOTH as the settings toggle row label (settings.js:385) AND as the inbox filter dropdown label for the `due_reminder` type (src/pages/inbox.js:16). Renaming the value per D-04 ("Due-day reminder") changes the inbox filter text too — the planner must decide whether that collateral is acceptable or whether the inbox gets its own key. A separate key `settings.notif.dueReminders` (plural, en.json:1254) labels the `push_due` toggle (settings.js:384) — do not confuse the two; only the singular pair changes.

The email accuracy pass (D-05) is likely a **no-op**: verified email frame wording is "Reminder: {title}" subject / "sent you a reminder about" verb — generic, implies nothing about future reminders; the "Due today:"/"Past due:" specificity lives in the snippet, which remains accurate.

**Primary recommendation:** One plan, four tasks: (1) delete the three server.js arms + both catalogue entries, (2) rewrite the day_before-pinning tests and add the D-06 multi-morning regression pin, (3) update settings copy EN+FR (+ decide inbox-filter collateral), (4) i18n gate + full suite + release-notes note for SC-5.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reminder offset scheduling (delete day_before) | API / Backend (server.js) | — | The reminder pass is server-only; no push-emission surface exists (Phase 36 boundary pin) |
| Notification text for reminders | API / Backend (tFor + catalogue) | Client (inbox render of keyed rows) | Rows carry machine key + EN snippet; client localizes keyed rows at render time (Phase 36 D-05/D-06) — day_before deletion must happen on BOTH sides (server producer + both catalogues) |
| Settings toggle copy (due_reminder) | Browser / Client (src/locales + settings.js) | — | Verified: labels are client locale entries via `t()`, not server catalogue strings (D-04 discretion resolved) |
| Dedup / exactly-once ledger | Database / Storage (reminders_sent, untouched) | — | No change allowed (REM-04); orphaned day_before rows stay |
| Regression pin (REM-03) | Test harness (node:test + clock-injection route) | — | `POST /api/internal/reminder-pass` already exists — zero new infrastructure |

## Standard Stack

No new dependencies — zero-runtime-dependency project invariant (REQUIREMENTS.md standing constraint). Everything below already exists and is verified in-repo.

### Core (existing, unchanged)
| Library / Surface | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:test | Node >=24 (engines field) | Test runner | Project standard; all reminder tests already node:test [VERIFIED: package.json:18,24-25] |
| `POST /api/internal/reminder-pass` | — | Clock injection for tests | Test-only route, guarded by `REMINDER_TEST_TOKEN`; body `{ now }`, header `x-reminder-token`, returns `{ emitted }` [VERIFIED: server.js:2849-2856] |
| scripts/i18n-scan.mjs | — | Build gate | Scans server.js + mailer.js for t/tFor `notif.*` first-string-arg keys resolving in EN AND FR, plus notif.* EN↔FR parity [VERIFIED: scripts/i18n-scan.mjs:1182-1251,1503-1521] |

**Installation:** none. **Package Legitimacy Audit: N/A — this phase installs zero external packages.**

## Architecture Patterns

### System Architecture Diagram

```
 09:00 tick / boot / POST /api/internal/reminder-pass (test clock)
        │
        ▼
 runReminderPass (server.js:1367)
        │  per workspace: localDate/hour via localParts
        │  hour !== 9 → pure read, skip
        ▼
 per task: remindable() ──► prefs gate (due_reminder / past_due) ──► offsets[]
        │                     [DELETE: day_before arm, server.js:1406]        │
        │                                                                     ▼
        │                                    for each offset: dedup claim
        │                                    INSERT OR IGNORE reminders_sent
        │                                    key `${ws}:${task}:${assignee}:${offset}:${due}`   ← D-02: unchanged
        ├─ claim fails (already sent) → skip
        ▼
 claim succeeds → notif row pushed to doc.data.notifs
        │   key: `notif.reminder.${offset}`  [DELETE dayBefore ternary arm, :1421]
        │   vars: { title }  snippet: reminderSnippet()  [DELETE day_before branch, :1357]
        ├──────────────► inbox (client renders keyed rows; unknown/dead key → snippet fallback)
        └── MAILER.enabled ──► queueNotifEmails ──► buildNotifMessage (mailer.js, tFor)
                                   subject "Reminder: {title}", snippet quoted in body
```

Deleting the `day_before` offset at the single `offsets[]` source removes it from all three channels at once — there is no per-channel reminder code to touch.

### Verified Deletion Surface (read this session)

All values quoted verbatim [VERIFIED: server.js:1355-1360, 1404-1421]:

```js
function reminderSnippet(offset, task) {
  const title = task?.title || 'a task';
  if (offset === 'day_before') return `Due tomorrow: ${title}`;   // ← delete line 1357
  if (offset === 'morning_of') return `Due today: ${title}`;
  return `Past due: ${title}`;
}
```

```js
const offsets = [];
if (prefs.due_reminder !== false) {
  if (localDate >= addDaysIso(due, -1)) offsets.push('day_before');  // ← delete line 1406
  if (localDate >= due) offsets.push('morning_of');
}
if (prefs.past_due !== false && localDate > due) offsets.push('past_due');
```

```js
key: `notif.reminder.${offset === 'day_before' ? 'dayBefore' : offset === 'morning_of' ? 'morningOf' : 'pastDue'}`,
//                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ← simplify ternary, line 1421
```

Catalogue entries to delete, quoted verbatim [VERIFIED: src/locales/en.json:1675, src/locales/fr.json:1675]:
- EN: `"notif.reminder.dayBefore": "Due tomorrow: {title}",`
- FR: `"notif.reminder.dayBefore": "À échéance demain : {title}",`

Keys that STAY, quoted verbatim [VERIFIED: en.json:1676-1677]:
- `"notif.reminder.morningOf": "Due today: {title}",`
- `"notif.reminder.pastDue": "Past due: {title}",`

Settings copy to update, quoted verbatim [VERIFIED: en.json:1249-1250, fr.json:1249-1250]:
- EN: `"settings.notif.dueReminder": "Due date reminders",` → "Due-day reminder"
- EN: `"settings.notif.dueReminderDesc": "A reminder the day before and the morning a task is due.",` → must lose "the day before" (D-04 gives target wording)
- FR: `"settings.notif.dueReminder": "Rappels d'échéance",` → "Rappel le jour d'échéance"
- FR: `"settings.notif.dueReminderDesc": "Un rappel la veille et le matin de l'échéance d'une tâche.",` → must lose "la veille"

Rendered at `src/pages/settings.js:385` [VERIFIED]:
```js
srow(t('settings.notif.dueReminder'), t('settings.notif.dueReminderDesc'), tog('due_reminder', np.due_reminder, 'np'))
```

### Pattern 1: Zero-migration removal (REM-04)
**What:** The offset is deleted from the producer only. `reminders_sent` rows with `:day_before:` suffixes and inbox rows with the `notif.reminder.dayBefore` key are never swept or rewritten — the producer never generates those offsets again, so the rows are permanently inert / snippet-fallback.
**When to use:** Any removal from the reminder family in this codebase — the standing invariant is "additive-only migrations, byte-identical second boot."
**Proof already pinned:** test/notif-i18n.test.mjs:448-456 asserts a legacy dayBefore-keyed row renders its stored snippet in FR ("À échéance demain : Rapport naïf") and EN — this test must KEEP PASSING after the catalogue entries are deleted [VERIFIED: test/notif-i18n.test.mjs:448-456].

### Anti-Patterns to Avoid
- **Neutering instead of deleting** (D-03): no dead branches, no "kept for compatibility" producers — the catalogue must stay honest; the i18n gate only guards reachable strings.
- **Tightening the window predicate** (D-01): `localDate >= due` is the boot catch-up mechanism. Changing to `=== due` silently kills catch-up and changes SC behavior.
- **"Simplifying" the dedup key** (D-02): dropping `due` makes re-scheduled tasks never re-remind, or forces a ledger sweep REM-04 forbids. One-way decision — leave `:due` in the key.
- **Sweeping orphaned ledger rows or legacy inbox rows:** forbidden by REM-04 and Out of Scope in REQUIREMENTS.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clock control for multi-morning pin | Fake timers / sleeps / cron mocks | `POST /api/internal/reminder-pass` with `{ now }` body | Injectable clock already built and battle-tested in Phase 27 tests [VERIFIED: server.js:2849-2856, test/due-reminders.test.mjs:29] |
| Test server scaffold | Custom HTTP harness | `startServer({ dataDir, env: { REMINDER_TEST_TOKEN } })` from existing test helpers | due-reminders.test.mjs:111 shows the exact incantation [VERIFIED: test/due-reminders.test.mjs:111] |
| i18n gate | Ad-hoc key assertions in tests | `npm run i18n:scan` (prebuild hook) | Catches EN↔FR parity + unresolvable server keys automatically |
| Date arithmetic in tests | Hand-rolled date math | `at9('2026-01-15')`-style helpers already in due-reminders.test.mjs | 09:00-local-instant construction is subtle (TZ map) |

## Runtime State Inventory

This is a removal/refactor phase — all 5 categories answered:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `reminders_sent` rows with dedup keys ending `:day_before:<due>` (live SQLite data dirs) — go permanently inert once the producer arm is deleted; workspace docs contain inbox rows with `key: "notif.reminder.dayBefore"` | **None** — REM-04 forbids sweeping; rows stay untouched (code edit only, no data migration) |
| Live service config | None — reminders run in-process via setInterval; no external scheduler config exists [VERIFIED: D-27-2 comment, server.js:1289-1299] | None |
| OS-registered state | None — no cron/launchd/systemd registration; scheduling is an unref'd in-process interval | None |
| Secrets/env vars | `REMINDER_TEST_TOKEN` — production-unset; unchanged by this phase | None |
| Build artifacts | None — plain ESM JS, no compiled artifacts affected | None |

## Common Pitfalls

### Pitfall 1: Existing tests actively pin day_before — they will go red
**What goes wrong:** Deleting the offset breaks `test/due-reminders.test.mjs` (window matrix "REM-02: day_before opens the day before", month-rollover test, dedup-key assertions like `:day_before:2026-02-01`, snippet `'Due tomorrow: Ship it'`, the due-date-morning "both fire" assertion `emitted.length === 2`) and `test/notif-i18n.test.mjs:365-374` (asserts `notif.reminder.dayBefore` key present, `rows.length >= 2`).
**Why it happens:** Phase 27 wrote exhaustive behavioral pins; Phase 37 changes the pinned behavior.
**How to avoid:** Treat test rewriting as a first-class task, not cleanup. Due-date-morning assertion becomes `emitted.length === 1` (morning_of only). The i18n test at :365-374 needs a different keyed-row source (morning_of) or restatement. KEEP test/notif-i18n.test.mjs:448-456 (legacy-row fallback pin) untouched — it proves REM-04's inert-rows guarantee.
**Warning signs:** RED suite immediately after the deletion commit.

### Pitfall 2: Shared label key — settings rename leaks into the inbox filter
**What goes wrong:** `settings.notif.dueReminder` is rendered in TWO places: settings.js:385 (toggle row) and src/pages/inbox.js:16 (inbox type filter label for `due_reminder`). D-04's rename to "Due-day reminder" changes the inbox filter text too.
**How to avoid:** Planner decides (discretion area): accept the collateral (arguably fine — same concept) or split a new key for the inbox filter. i18n-pages.test.mjs:452 pins the plural key's value — check whether any test pins the singular value before renaming.
**Warning signs:** UI snapshot/test diffs outside settings.js.

### Pitfall 3: Plural/singular key confusion
**What goes wrong:** `settings.notif.dueReminders` (plural, en.json:1254) labels the `push_due` toggle (settings.js:384) — a DIFFERENT preference. Updating the wrong pair changes push prefs copy.
**How to avoid:** Only `dueReminder` + `dueReminderDesc` (singular) change. `dueReminders`/`dueDesc` (push_due row) stays.

### Pitfall 4: Window-predicate "cleanup" temptation
**What goes wrong:** After day_before is gone, `localDate >= due` for morning_of means a task that was due 3 weeks ago (never claimed, e.g. deployed mid-life or catch-up missed) fires "Due today" once at the next 09:00. Someone may read this as a bug and tighten to `=== due`.
**How to avoid:** D-01 locks it: open window = boot catch-up. The burst is the documented SC-5 release-note item. The D-06 pin itself exercises `due+2, due+5` mornings and must see zero NEW notifications precisely because the first pass claimed them.
**Warning signs:** A reviewer suggesting the predicate looks "wrong" post-deletion.

### Pitfall 5: i18n gate family scope
**What goes wrong:** Deleting `notif.reminder.dayBefore` from both catalogues is safe only because the server reference disappears in the same change; if either side lands alone, the gate goes red (unresolved server key OR parity mismatch).
**How to avoid:** Catalogue deletion and server.js deletion land in the SAME commit/task; run `npm run i18n:scan` as the per-task check.
**Note:** `settings.notif.*` keys are OUTSIDE the notif.* namespace — they are guarded by the general client-side scan, not the server family; renaming values (not keys) passes trivially.

### Pitfall 6: Email copy overreach
**What goes wrong:** D-05 is accuracy-only; a rewrite would add keys, churn the gate, and violate the decision.
**How to avoid:** Verified current wording is already accurate and cadence-neutral: subject `"Reminder: {title}"`, verb `"sent you a reminder about"` / FR `"vous a envoyé un rappel pour"` [VERIFIED: mailer.js:415-428; en.json:1684-1685, fr.json:1684-1685]. Expect zero mailer/locale email changes; if any, only wording implying more notices to come.

## Code Examples

### D-06 regression pin skeleton (following due-reminders.test.mjs conventions)
```js
// Source: verified patterns at test/due-reminders.test.mjs:29,111 and server.js:2849-2856
test('REM-03: past-due fires exactly once across many mornings (regression pin)', async () => {
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: '...', REMINDER_TEST_TOKEN: TOKEN } });
  // ws with a task due 2026-01-15, assignee with defaults
  const trigger = nowIso =>
    fetch(`${server.base}/api/internal/reminder-pass`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
      body: JSON.stringify({ now: nowIso }),
    }).then(r => r.json());

  const onDue = (await trigger(at9('2026-01-15'))).emitted;
  // due today (morning_of only — day_before deleted)
  assert.equal(onDue.filter(n => n.type === 'due_reminder').length, 1);
  const after = (await trigger(at9('2026-01-16'))).emitted;
  // past due exactly once
  assert.equal(after.filter(n => n.type === 'past_due').length, 1);
  // silence on later mornings
  for (const day of ['2026-01-17', '2026-01-20']) {
    const more = (await trigger(at9(day))).emitted;
    assert.equal(more.length, 0, `nothing re-fires on ${day}`);
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Three offsets (day_before, morning_of, past_due) | Two (morning_of, past_due) | Phase 37 | REM-01 |
| day_before ledger claims | Orphaned rows inert | Phase 37 | REM-04 — no sweep, ever |
| "day before + morning" settings copy | "morning of due date" copy | Phase 37 | REM-02 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Catch-up burst scope: at first deploy, every remindable task with `due <= today` lacking a prior morning_of claim fires one "due today" (+ one past_due where applicable) at the first 09:00 pass | Pitfall 4 / SC-5 | Release-note wording under-describes or over-describes the burst; cosmetic — verify with the multi-morning pin covering a pre-due-date task |
| A2 | No test other than those cited pins the day_before behavior or the singular `dueReminder` label value | Pitfalls 1-2 | Unexpected RED suite task; recoverable — run full suite after deletion to enumerate |
| A3 | No existing release-notes convention file exists in-repo; SC-5 note lands in the phase summary/UAT doc | Discretion | Trivial — choose location at plan time |

## Open Questions

1. **Inbox filter label collateral (Pitfall 2)**
   - What we know: `settings.notif.dueReminder` is shared by settings toggle and inbox filter (inbox.js:16).
   - What's unclear: user preference — same label both places, or split keys?
   - Recommendation: default to shared (honest single label); only split if the inbox filter reads awkwardly. Decide at plan time; no user checkpoint needed given D-04 grants copy discretion.

2. **`settings.notif.dueReminders` (plural) key usage** — verified used only for the `push_due` row (settings.js:384) and pinned in i18n-pages.test.mjs:452; it does NOT change. No open action — listed so the planner doesn't "fix" it.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies; the phase uses the existing Node 24 runtime, node:test, and in-repo scripts only. (`node --test --test-concurrency=2 test/*.test.mjs` is the suite entry [VERIFIED: package.json:18].)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node >=24), concurrency 2 |
| Config file | none — plain `node --test` glob |
| Quick run command | `node --test test/due-reminders.test.mjs test/notif-i18n.test.mjs` |
| Full suite command | `npm test` (plus `npm run i18n:scan` gate, already a prebuild hook) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REM-01 | Due-date morning emits morning_of only (no day_before) | unit/integration | `node --test test/due-reminders.test.mjs` | ✅ (rewrite existing pins) |
| REM-02 | `due_reminder: false` gates due-today only; `past_due` gating unchanged; toggle copy renders | unit + i18n | `node --test test/due-reminders.test.mjs test/i18n-pages.test.mjs` | ✅ (existing D-27-5 pins largely survive; copy via i18n-pages) |
| REM-03 | Past-due never re-fires across due+1..due+5 mornings | integration (clock replay) | `node --test test/due-reminders.test.mjs` | ❌ Wave 0 — add D-06 pin |
| REM-04 | Legacy dayBefore-keyed inbox row degrades to snippet; no sweep; i18n gate green | unit + gate | `node --test test/notif-i18n.test.mjs && npm run i18n:scan` | ✅ (:448-456 already pins fallback) |

### Sampling Rate
- **Per task commit:** `npm run i18n:scan` + targeted reminder/i18n test files
- **Per wave merge:** `npm test`
- **Phase gate:** full suite + i18n gate green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] D-06 multi-morning regression pin in `test/due-reminders.test.mjs` (or a sibling file per discretion) — covers REM-03
- No framework/conftest gaps — harness fully exists.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new endpoints; test route already token-guarded |
| V3 Session Management | no | — |
| V4 Access Control | no change | remindable()/inScopeProject/memberCanReadProject gates untouched — deletion must not reorder or weaken them |
| V5 Input Validation | no | No new input surfaces |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Test-only route exposed in prod | Elevation | `REMINDER_TEST_TOKEN` unset in production → 404 [VERIFIED: server.js:2849-2852] — unchanged by this phase |
| Reminder leaking to out-of-scope member | Information disclosure | Existing scope predicates before any write — preserve their position during the offsets edit |

**security_enforcement:** config.json contains no `security_enforcement` key → treated as enabled; assessed above — this phase introduces no new attack surface (pure deletion).

## Sources

### Primary (HIGH confidence — read this session)
- `server.js:1289-1457` — scheduler block: D-27 header invariants, localParts/addDaysIso, remindable, reminderSnippet, runReminderPass, dedup claim, email fan-out
- `server.js:1120-1181` — NOTIF_PREF_KEYS / NOTIF_PREF_DEFAULTS / getUserNotifPrefs / NOTIF_EMAIL_KIND
- `server.js:2844-2856` — internal reminder-pass route contract
- `mailer.js:400-469` — buildNotifMessage reminder frame (subject/verb/sentence wording)
- `src/locales/en.json`, `src/locales/fr.json` :1249-1254, :1673-1685 — all keys quoted verbatim
- `src/pages/settings.js:384-385`, `src/pages/inbox.js:16,68-69,83` — copy render surfaces
- `scripts/i18n-scan.mjs:1182-1251, 1503-1521` — server-key gate + parity gate
- `test/due-reminders.test.mjs` — harness pattern + day_before pins to rewrite
- `test/notif-i18n.test.mjs:316-456` — dayBefore emission pin (rewrite) + legacy-fallback pin (keep)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/phases/37-.../37-CONTEXT.md`, `.planning/config.json`

### Secondary / Tertiary
- None used — no external research required (roadmap's prediction confirmed).

## Project Constraints (from AGENTS.md)

No root `AGENTS.md` or `.opencode/AGENTS.md` exists (glob verified). Standing project constraints from REQUIREMENTS.md/STATE.md apply: zero runtime dependencies, additive-only migrations + byte-identical second boot, full suite green, EN+FR i18n gate.

## Metadata

**Confidence breakdown:**
- Deletion surface & stack: HIGH — every line cited was read this session
- Pitfalls: HIGH — all derive from verified test/render call sites
- Release-note burst scope (A1): MEDIUM — behavior follows from verified predicate but exact burst magnitude is an execution-time observation

**Research date:** 2026-11-04
**Valid until:** 2026-12-04 (stable: deletion over pinned code paths)
