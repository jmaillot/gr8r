# Domain Pitfalls — v1.8 "Notification Sanity"

**Domain:** Reminder-cadence rework, server-side i18n, daily digest, defaults migration on an existing zero-dependency Node app (`server.js`, hand-rolled scheduler, `reminders_sent` dedup ledger, per-user `user_notif_prefs` rows, client-side JSON catalogues with a build-gate scan).
**Researched:** 2026-11-04
**Overall confidence:** HIGH (code-read of server.js:1100–1432, PROJECT.md v1.8 scope, test/ inventory) — pitfalls 1–3 are derived from the live dedup-key format, prefs merge and hour gate, not from general lore.

---

## Critical Pitfalls

### Pitfall 1: Removing `day_before` while its dedup rows and prefs semantics change → the new cadence is silently suppressed or fires stale

**What goes wrong:** The dedup key is `${ws.id}:${t.id}:${t.assignee}:${offset}:${due}` (server.js:1410). Two traps:
1. **Orphaned dedup rows** — deleting the `day_before` offset means old rows like `...:day_before:2026-11-01` are never matched again. That's harmless for `day_before` itself, but the *stale-row cleanup habit* ("just delete rows where offset='day_before'") is the mistake: a data-touching migration violates the additive-only constraint and risks a non-byte-identical second boot. Leave dead rows alone; they are inert.
2. **Prefs whose meaning changes** — `due_reminder` today gates *both* `day_before` and `morning_of` (server.js:1386–1389). If the new "due today" toggle reuses the key `due_reminder` but drops `day_before`, an existing user who explicitly set `due_reminder: true` keeps its meaning — fine. But the whitelist/17-key shape and the PUT route validation must stay coherent: a key removed from the client settings UI but still validated server-side (or vice versa) causes a silent mismatch. The `undefined-falsy` merge in `getUserNotifPrefs` (server.js:1152–1164) means *any* key you stop writing defaults for silently flips to "on" — if you repurpose or retire a key, users who never touched it get a different behavior than users whose stored row has it explicitly.

**Why it happens:** The scheduler's exactly-once design makes rows look like "state to clean up" when they are actually an append-only ledger. And prefs keys look renameable when they are a public API (stored JSON per user).

**Consequences:** Either users get double reminders for one task (new key + old pref key both firing) or zero reminders (old rows interpreted as claims for the new offset), or a migration test fails the byte-identical-second-boot gate at the last minute.

**Prevention:**
- Keep `due_reminder` as the "due today" gate (its stored meaning narrows, never inverts); do NOT add a parallel `due_today` key that reads as a second gate.
- Touch no `reminders_sent` rows: orphaned `day_before` keys are dead weight, harmless. The additive-only rule wins.
- Because dedup includes `:due` (the due-date string), moving a task's due date *after* morning-of fired legitimately re-fires at the next 09:00 — verify the new cadence preserves this and the tests cover it.
- Put the pref-whitelist diff in the same phase as the scheduler change, with a test asserting `getUserNotifPrefs` output for: no row, row with `due_reminder: true`, row with `due_reminder: false`, row with the *retired* key shape.

**Detection:** A test that seeds a `reminders_sent` row with a `day_before` key and a task due today, runs one pass, and asserts exactly one `morning_of` notification exists. If it fires zero or two, the migration touched the wrong thing.

**Phase:** REM (cadence rework).

---

### Pitfall 2: Server-side i18n per recipient drifts from the client catalogue — the drift is invisible to the build gate

**What goes wrong:** The i18n gate (`scripts/i18n-scan.mjs`) scans **client** literals; the server image historically ships **no catalogue** (PROJECT.md "Out of scope" until now — the invitation email was explicitly deferred for this reason). Localizing `MAILER.sendNotif` subjects/bodies, reminder snippets (`reminderSnippet()`, server.js:1336) and push/inbox text per recipient introduces four classic failures:

1. **Catalogue copy-paste drift.** Two copies of the catalogue (one bundled for the browser, one importable by plain Node on the server) diverge: a key added client-side never gets a server counterpart, or the FR server copy is edited while the FR client copy isn't. Nothing fails — the server falls back to English silently.
2. **Plural forms chosen by the wrong locale.** The existing plural layer is `{name}` + `{count, plural, …}` via `Intl.PluralRules` (v1.2 decision 6). French has `one`/`many`/`other`; a server `t()` that hard-codes English plural logic (`count === 1 ? … : …`) produces "1 fichiers". Use the same `Intl.PluralRules` selection with the **recipient's** locale, not the workspace's.
3. **Date formatting with the wrong locale or wrong tz.** A reminder email saying "due 11/04/2026" is ambiguous; server-side dates must use the recipient's locale **and** the workspace-shared tz via `Intl.DateTimeFormat` with an explicit `timeZone`. Node's ICU is full in Node 24, but the Docker image must actually contain the full-icu data (the default Node image does since v13, but *verify* the pinned base image — a small-icu image silently formats with `en-US`).
4. **Fallback locale leaking English.** Missing key → English fallback is correct behavior, but *which English* and *when*: if the recipient locale is `fr` and only the subject is catalogued while the body isn't, you get mixed-language emails — worse than all-English.

**Why it happens:** The client `t()` and a new server `t()` are two implementations of one contract; only a shared module + a shared gate can keep them honest.

**Consequences:** Mixed-language or mistranslated emails to real users; silent English fallback for weeks; i18n-scan green while the server is wrong.

**Prevention:**
- **One catalogue, two importers.** The catalogues are already "importable by plain Node" (v1.2 decision 12/17) — import the *same JSON files* server-side; never fork a server copy. Make `server.js` fail at boot (or a test fail) if a server-needed key is missing from the FR catalogue.
- Extend `scripts/i18n-scan.mjs` (or add a phase gate test) to enumerate the *server-used key set* and assert EN+FR presence — the gate only protects what it is told about.
- Ship the catalogue in the Docker image: this is a real Dockerfile change (COPY of the catalogue dir) — remember `test/dependencies.test.mjs` has a COPY-pin allowlist that already needs updating (STATE.md deferred item); fold that in.
- Store `locale` on the user (it exists — per-user since v1.2) and resolve recipient locale via the authority map the email pipeline already builds (`authority` in `queueNotifEmails`), falling back: recipient locale → workspace default → EN.

**Detection:** A table-driven test rendering every server-emitted notification kind × {en, fr} and snapshotting subject/body; plus a grep-test asserting no server string literal (`'Due today: '`, `'Past due: '`) remains outside the catalogue.

**Phase:** I18N — but the shared-importer decision must be made in this phase's spec, because the DIGEST phase (which emits its own email) depends on it.

---

### Pitfall 3: The digest is not idempotent across restarts, or its window slices the day wrong

**What goes wrong:** The reminder pass is exactly-once because it writes a dedup claim **in the same transaction** as the effect, and its hour gate (`hour !== 9` → pure read, server.js:1357) makes replays harmless. A digest has *none* of this for free:

1. **Double-send after restart.** Digest at 09:00 crashes after sending but before recording → next pass (or boot catch-up, which the pass contractually supports, D-27-2) resends the whole digest. Or crashes *before* send but *after* recording → digest never arrives. Sending email cannot be transactional with SQLite; you must pick the resend-vs-never side deliberately (resend is the correct side — duplicate digest is an annoyance, missing digest is a lost day).
2. **Idempotence marker without a ledger.** "Send digest if hour===9 and last-sent != today" breaks when the process restarts at 09:01 with a clock now reading 09:01 — actually fine — but breaks again if the server was down the whole 09:00 hour: the boot catch-up logic must define *when* a missed digest is still worth sending (e.g. any pass on the same local date, like the reminder window predicate) and when the day is conceded.
3. **Partial-day / boundary bugs.** "Tasks due today + overdue" must be evaluated **at send time** in the workspace tz (`localParts`), not from a snapshot taken at 00:00; and "overdue" must reuse `remindable()`-equivalent semantics (`due < localDate`, not-done, not archived) — a second, slightly different predicate here is the classic drift the codebase already guards against ("never a second pipeline", server.js:1243).
4. **DST.** `addDaysIso` deliberately avoids local-midnight Date math (server.js:1310). A digest that computes "yesterday" via `Date(now - 86400e3)` is wrong twice a year. Compare ISO date strings derived from `localParts`.
5. **Digest suppressing individual emails without a recorded suppression.** If `email_digest: true` means "no individual reminder emails", the suppression must be applied where reminders enqueue email (`queueNotifEmails` / the `email_reminder` gate) — **not** by skipping notification rows (inbox/push must stay identical, per milestone scope). Forgetting this means digest users see nothing in the inbox either, or push users get emails.
6. **Urgent notifications swallowed by the digest.** The milestone only says digest replaces *reminder* emails — but if the implementation flips any generic "don't email if digest on" flag, mentions and assigns (often urgent) vanish until 09:00. Suppression must be type-scoped: reminders only, never mention/assign/comment.

**Why it happens:** Digest *looks* like the reminder pass reusing the scheduler, but it has a different delivery transactionality (one email covering many events) and a different failure recovery.

**Consequences:** Duplicated or missing digests; timezone-off digests; urgent notifications silently eaten; scope creep of suppression into other email types.

**Prevention:**
- Give the digest its own ledger table (additive migration: e.g. `digest_sent(workspace_id, user_id, local_date)`) claimed in the same transaction pattern as `reminders_sent` — one prepared `insert or ignore`, claim-then-send, accept the duplicate-on-crash side.
- Compute the window from `localParts` ISO strings only; never timestamp arithmetic.
- Type-scoped suppression: in the reminder email path only, `if (prefs.email_digest === true) continue;` — with a test asserting mention/assign emails still flow when digest is on.
- Injectable clock test: two `runReminderPass`-style calls at the same local 09:00 → one digest; a call at 08:59 → zero; a boot with no 09:00 ever seen that local date → one (catch-up), matching the reminder catch-up philosophy.
- Fail-loud that `email_digest`'s existing default (`true` in `NOTIF_PREF_DEFAULTS`, server.js:1135) is the stub value — when it becomes real, users who never opted in suddenly get digests. That default flip is exactly the next pitfall.

**Phase:** DIGEST — with a hard dependency on I18N's shared catalogue (the digest email is fully server-rendered) and on REM's pref semantics.

---

### Pitfall 4: Changing notification defaults for existing users without an explicit, visible migration

**What goes wrong:** `getUserNotifPrefs` merges stored JSON over defaults with `=== false` disables and `undefined-falsy` = on (server.js:1148–1164). Two failure modes when defaults change:

1. **The silent flip.** `email_digest: true` is *already* a default in the shipped defaults layer (it was a stub). Making digest real doesn't need a migration to take effect — every existing user is opted in the moment the code ships. If the product intent is opt-in (the milestone says "opt-in daily digest"), the default **must flip to `false`** — but that change itself is silent: users with stored rows containing `email_digest: true` (written by an early PUT) keep `true` forever, while users with no row get `false`. Behavior now depends on whether a user ever touched settings. This asymmetry is invisible in a defaults-only code review.
2. **The migration you can't do.** A boot sweep rewriting `user_notif_prefs` rows (e.g. `email_digest: true → remove key` or normalizing retired `day_before`-era keys) violates the "migrations additive-only, byte-identical second boot" constraint unless it is strictly guarded like `migrateTotpReWrap` was. Editing JSON-prefs rows in place is a *data* migration the constraint machinery wasn't designed for — it will be attempted "just this once" and it will break idempotence (second boot not byte-identical) or run before the backup.

**Why it happens:** The defaults layer looks like configuration; it is actually the effective state of every user who never opened settings.

**Consequences:** Every existing user gets a 09:00 digest email the morning after deploy (support noise, opt-out stampede), or an unguarded boot sweep makes the second boot diverge and fails the phase's byte-identical gate.

**Prevention:**
- Decide the semantics first and write them down: "opt-in" = default `false` + stored `true` respected; or "auto-on for reminder-suppression only" = keep `true` but scope it. Do not let the code decide implicitly.
- Prefer **reading-time normalization** over a boot sweep: since the only reader is `getUserNotifPrefs`, retire/reshape keys by changing what the merge produces, not what rows contain. No migration, no boot risk.
- If a sweep is truly required, follow the established pattern exactly: pre-backup (`vacuum into`), guarded trigger, transactional, second-boot byte-identical — and extend `test/migration.test.mjs`, don't hope.
- Add a defaults-diff test: assert `getUserNotifPrefs` for a no-row user vs a user whose stored row predates the change; both outcomes must match the documented intent, not accidentally differ.

**Detection:** The morning-after support test — a test asserting a no-row user with `email_digest` at its new default produces **zero** digest sends on a normal pass. Plus the migration test asserting second-boot byte identity if any sweep exists.

**Phase:** DIGEST (the `email_digest` default) and REM (any pref reshaping) — the defaults decision belongs in the *discuss/spec* step of whichever phase lands first, before any code.

---

## Moderate Pitfalls

### Pitfall 5: `email_digest` default flip interacts with the 17-key whitelist and PUT validation
**What goes wrong:** The PUT route validates against `NOTIF_PREF_KEYS`. Adding a key (e.g. per-channel digest options) or repurposing one touches three places: whitelist, defaults layer, settings UI render — and a fourth the client catalogue. Miss one and the UI shows a toggle that does nothing, or a key PUT accepts but nothing reads.
**Prevention:** One test iterating `NOTIF_PREF_KEYS` asserting: default defined, PUT round-trips it, `getUserNotifPrefs` reads it, and an i18n key exists EN+FR for its label. This file is the cheapest regression net in the milestone.

### Pitfall 6: Reminder pass hour gate is 09:00 everywhere — the digest scheduled "at 09:00 workspace time" collides with the reminder pass
**What goes wrong:** Digest users at 09:00 get the digest *and* their reminder emails race it in the same minute window: if digest suppression is checked per-email at enqueue time and the two passes interleave, ordering decides whether a task appears both in the digest and as an individual email, or in neither (suppressed after the digest snapshot was taken, before the individual send).
**Prevention:** Define the suppression boundary at *content-snapshot* time: the digest lists tasks due today/overdue as of its pass; individual reminder emails for the same local date are suppressed unconditionally by pref, so a task can be in the digest while its row still fired — decide and document which way (digest listing is sufficient; the reminder notif row still lands in the inbox, which is correct per scope "push unchanged, inbox unchanged"). Test both orderings.

### Pitfall 7: Localized emails need the recipient's locale where the email is *built*, but `queueNotifEmails` resolves authority maps lazily
**What goes wrong:** The email builder already joins `memberships × users` for emails/names; locale adds another column. A second query per notification (N+1 per reminder pass over many tasks) is the easy path; forgetting doc-only members (no account row → no locale) yields "undefined" locale and a thrown `RangeError` from `Intl` with an invalid locale tag.
**Prevention:** One query `select … , u.locale from memberships m join users u …` folding into the existing `authority` map; guard every locale with a known-locale check and fall back to EN. The existing per-pass try/catch (server.js:1427) masks a throw as a silent per-workspace skip — a locale crash would silently stop *all* reminders for a workspace. That masking is itself the pitfall: the catch logs `err.message` and moves on; watch for it in digest/reminder tests.

### Pitfall 8: The i18n build gate can regress the server scan silently
**What goes wrong:** `scripts/i18n-scan.mjs` fails builds on uncatalogued *client* literals. Server strings live in `server.js` and `oidc.js` — out of the scan's current corpus. Adding server catalogue support without extending the scan corpus means the next server-side string added is unchecked forever.
**Prevention:** In the I18N phase, make the scan (or a dedicated node test) walk `server.js` for the notification-template functions and require every interpolated template to come from the catalogue — e.g. forbid the literal patterns `Due today: `, `Past due: `, `Due tomorrow: ` outside the catalogue, as a regression guard.

## Minor Pitfalls

### Pitfall 9: DST-transition days make "due today" ambiguous for a task due the transition day
**What goes wrong:** ISO-date string compare (the codebase's approach) handles this correctly, but any "digest covers the last 24h" shortcut doesn't.
**Prevention:** Keep everything ISO-string based (`localParts` + `addDaysIso`); add one DST-boundary test with a timezone like `America/New_York` crossing the shift.

### Pitfall 10: Test suites asserting on English server text will break en masse during I18N
**What goes wrong:** `due-reminders.test.mjs`, `notif-email-link.test.mjs` and the source-extraction tests (which the code comments say evaluate specific lines standalone, server.js:1176) assert English snippets. Replacing literals with `t()` calls breaks source-extraction tests in ways that look unrelated.
**Prevention:** Budget for a test-migration subtask in the I18N phase: update the source-extraction regexes and render both locales in assertions instead of hard-coded English.

### Pitfall 11: The audit (AUDIT item) changing thresholds after features ship re-triggers dedup/re-fires
**What goes wrong:** The audit phase may recommend changing *which* offsets fire. Because dedup keys include the offset, re-introducing or renaming an offset later re-fires for tasks whose `due` is still current — a burst of "Due today" emails on deploy day for every currently-due task is actually expected catch-up behavior, but a surprise if unplanned.
**Prevention:** Document catch-up behavior in the phase plan; announce that the first pass after a cadence change may notify for tasks already due (the window-open predicate makes this correct, not a bug).

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| REM (cadence) | Pref key semantics change / dedup-row temptation | Keep `due_reminder` meaning; never touch `reminders_sent` rows; no-row vs stored-row tests |
| I18N (server emails) | Catalogue drift, plural/date locale, fallback | One shared JSON import; scan-extended server key gate; locale guard with EN fallback; Dockerfile COPY-pin test update |
| I18N | Silent per-workspace catch masking locale crashes | Locale validation before `Intl` use; explicit tests for unknown locale |
| DIGEST | Non-idempotent send across restart | Claim-ledger in same transaction as record; accept duplicate-on-crash |
| DIGEST | Suppression leaks to non-reminder emails | Type-scoped suppression; test mention/assign flow with digest on |
| DIGEST | `email_digest` stub default is `true` | Explicit default-flip decision in spec; no-row user test |
| DIGEST × REM | 09:00 collision between two passes | Snapshot-at-pass semantics; both-orderings test |
| AUDIT | Threshold changes re-fire via window predicates | Document catch-up; time the audit before REM if offsets may change again |

## Sources

- Code-read (HIGH): `server.js:1100–1432` — `NOTIF_PREF_KEYS`/`NOTIF_PREF_DEFAULTS`, `getUserNotifPrefs`, `queueNotifEmails`, `runReminderPass`, dedup-key format, hour gate, `localParts`/`addDaysIso`, per-pass try/catch masking.
- `.planning/PROJECT.md` v1.8 milestone scope, v1.2 i18n decisions (plurals via `Intl.PluralRules`, catalogues importable by plain Node, server-ships-no-catalogue out-of-scope item being reversed), v1.5 REM-01..05 record.
- `test/` inventory: `due-reminders.test.mjs`, `notif-prefs.test.mjs`, `notif-email-link.test.mjs`, 16 `i18n-*.test.mjs` files, `local-prefs.test.mjs`, `migration.test.mjs` (referenced from PROJECT.md).
