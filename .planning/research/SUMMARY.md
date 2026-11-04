# Project Research Summary

**Project:** Projects Studio (gr8r) — v1.8 "Notification Sanity"
**Domain:** Notification system rework on an existing zero-dependency Node 24 application (reminder cadence, server-side i18n, daily digest email)
**Researched:** 2026-11-04
**Confidence:** HIGH

## Executive Summary

v1.8 reworks gr8r's notification behavior along three axes validated against how Todoist, Asana, Workfront, and ServiceNow actually build this: (1) cap due-date reminders at 2 per task ("due today" + one past-due, then silence) by dropping the `day_before` offset — this is the aggressive end of the industry norm, not a downgrade; (2) localize all server-emitted text (email subject/body, push, inbox snippets) per **recipient** account locale — the per-recipient axis is the universal industry invariant, with English fallback; (3) ship an opt-in daily digest at 09:00 workspace-local time that **replaces** individual reminder emails (Asana's model: digest is an email-channel choice; push/inbox stay real-time), and runs a notification audit whose threshold changes are owner-validated before coding.

The recommended approach is remarkable for its smallness: **zero new packages, zero new dev dependencies, zero migrations**. Every capability already exists in the repo — the client catalogues are plain-Node-importable by design (v1.2 decision), `users.locale` and the `email_digest` pref key already exist, the `reminders_sent` dedup ledger accepts new key shapes, and the hand-rolled SMTP client just needs a fourth message builder. The server work is: extend `src/core/i18n.js` with a locale-parameterized `tIn()` (never the module-level locale singleton — that's an interleaving bug in a concurrent server), add `runDigestPass()` as a sibling of `runReminderPass()` in the same 60s tick, and gate suppression in `queueNotifEmails` (the single email choke point), type-scoped to reminder emails only.

The key risks are all in the seams with existing state, and all are code-verified: the `email_digest` stub currently defaults to `true` and must be flipped to explicit opt-in (undefined-falsy, removed from `NOTIF_PREF_DEFAULTS`) or every existing user gets digests on deploy morning; the deploy-day boot catch-up will legitimately fire one-time "due today" bursts that must be announced in release notes; and the i18n build gate only protects what it's told about — server-referenced keys need scan-corpus extension or a regression test, or server strings drift to English silently. None require migrations; all require explicit decisions written down in the phase specs before code.

## Key Findings

### Recommended Stack

**Zero additions.** Nothing to install, nothing to vendor, no Dockerfile change (the Dockerfile already copies `src/` — the v1.2 "server image ships no catalogue" deferral retires itself). All new capability is in-repo logic. Full detail in [STACK.md](./STACK.md).

- **`src/core/i18n.js` + `tIn(locale, key, vars)`** — additive pure function alongside the browser singleton; refactor `t()` onto `tIn()` internally so there's one resolution path. Statically import `src/locales/fr.json` at boot (import attributes, Node ≥ 22 stable).
- **`Intl.PluralRules` + `Intl.DateTimeFormat` with `timeZone`** — already power plurals and `localParts()`; full-icu built into Node 24. `Intl.MessageFormat` does **not** exist in Node 24 (verified) — the existing `{name}` + plural subset is the ceiling.
- **`mailer.js` fourth builder (`buildDigestMessage` / `sendDigest`)** — same MIME/boundary/UTF-8 scaffolding as `buildNotifMessage`; keep the mailer a dumb builder with pre-localized strings passed in.
- **`reminders_sent` ledger with new key namespaces** — `digest:ws:user:localDate` for digests; orphaned `:day_before:` rows go inert (never touch them).
- **No nodemailer / i18next / node-cron / template engine / DB migration** — all explicitly rejected under the zero-dep rule.

### Expected Features

Full landscape in [FEATURES.md](./FEATURES.md). Ecosystem consensus: 1–2 notifications per task max; digest as a channel choice; per-recipient localization (Trello, ServiceNow).

**Must have (table stakes):**
- Cadence capped at 2 per task: "due today" + past-due **once** the next morning, then silence
- Per-recipient locale for ALL server-emitted text, EN fallback, EN+FR catalogues complete at commit (i18n gate)
- Digest email: two sections (due today + overdue), deep-linked items, 09:00 workspace-local
- Digest ON ⇒ individual reminder emails suppressed (emails only; inbox/push unchanged)
- Silent digest — send nothing when there's nothing due/overdue
- Notification audit doc; threshold changes owner-validated BEFORE coding

**Should have (differentiators):**
- "Digest replaces reminders" explained in digest header + settings copy (prevents "where did my reminders go" tickets)
- Past-due fires exactly once — protect in tests against daily re-fire regressions

**Defer (anti-features):**
- Per-task custom reminder offsets (the cause of the noise being fixed)
- Digest content beyond due-today/overdue (mentions, activity, comments)
- "Digest AND individual emails" (Asana's "both" — more email, not less)
- New languages / machine translation (out of scope since v1.2)
- Workspace-locale or Accept-Language localization (wrong axis)

### Architecture Approach

All server-side changes integrate at verified points in `server.js` / `mailer.js` (full detail in [ARCHITECTURE.md](./ARCHITECTURE.md)). The critical structural insight: **do not compose the digest from reminder notif rows** — the digest reads tasks directly (`remindable()` predicate verbatim, reusing the Phase-29/32 scope chain), because digest users receive no reminder emails and there are no rows to summarize. Suppression lives in `queueNotifEmails` (the single choke point covering boot catch-up, tick, and test route), type-scoped to `due_reminder`/`past_due` only.

**Major components:**
1. **Server i18n layer** (`tIn()` + boot catalogue import + locale in the existing `authority` JOIN) — leaf, no deps, unblocks everything
2. **`runReminderPass` (modified)** — drop `day_before`; notif rows store a machine key (`reminderKey(offset)`), inbox snippet localized client-side at render for keyed rows
3. **`runDigestPass` (new)** — same 09:00 gate via `localParts()`, per-user aggregate, transactional `reminders_sent` claim, one localized email per user
4. **`queueNotifEmails` (modified)** — recipient locale resolution + type-scoped digest suppression gate
5. **`NOTIF_PREF_DEFAULTS` (modified)** — `email_digest` removed (undefined-falsy = opt-in); settings copy updated only

### Critical Pitfalls

Full list in [PITFALLS.md](./PITFALLS.md) — all code-verified, HIGH confidence.

1. **`email_digest` stub default is `true`** — making the digest real without flipping the default opts in every existing user overnight. Remove the key from `NOTIF_PREF_DEFAULTS` entirely (undefined-falsy = off per the D-09 pattern); test no-row user vs stored-row user produce the same documented outcome.
2. **The digest must be idempotent across restarts** — email cannot be transactional with SQLite. Claim `reminders_sent` in a transaction first, accept duplicate-on-crash (an annoyance beats a lost day). Boot catch-up: any pass on the same local date may still send the digest.
3. **Deploy-day catch-up burst** — after removing `day_before`, the next 09:00 pass fires `morning_of` for every currently-due task missing its key. Correct REM-01 behavior, but announce it; digest opt-in partially shields it.
4. **Never touch `reminders_sent` rows** — orphaned `day_before` keys are inert ballast; a cleanup sweep violates additive-only/byte-identical-boot and risks failing the migration gate.
5. **i18n drift is invisible to the gate** — the scan covers client literals only. Extend the scan (or add a test) for the server-used key set; grep-guard `Due today: `/`Past due: ` literals; guard every locale against `Intl` RangeError with EN fallback (the per-pass try/catch would otherwise silently kill all reminders for a workspace).
6. **Type-scoped suppression** — a generic "don't email if digest on" flag would eat mentions/assigns until 09:00. Suppression is reminders-only; test that mention/assign emails still flow with digest on.

## Implications for Roadmap

Based on research, suggested phase structure (dependency-ordered; ARCHITECTURE.md §build order):

### Phase 1: Server Notification i18n
**Rationale:** Pure additive infrastructure that both other features render through; leaf with no dependencies. Must decide the shared-catalogue contract here — DIGEST depends on it.
**Delivers:** `tIn()` in `src/core/i18n.js`, boot-time EN+FR catalogue import, recipient locale in the `authority` JOIN, ~15 new EN+FR catalogue keys, server-key scan/regression gate.
**Addresses:** I18N table stakes (per-recipient locale, EN fallback).
**Avoids:** Pitfalls 5 (drift) and locale-crash masking; includes the test-migration subtask (source-extraction tests asserting English text).

### Phase 2: Reminder Cadence Rework (REM)
**Rationale:** Smallest risk, directly fixes the feedback that named the milestone; depends on Phase 1 for reminder keys.
**Delivers:** `day_before` removed, machine-key notif rows with client-side render, `due_reminder` narrowed to "due today" (pref key and toggle unchanged, copy updated), deploy-safe via unchanged dedup keys, release-note copy for the catch-up burst.
**Addresses:** Cadence table stakes.
**Avoids:** Pitfall 1/3 (dedup-row temptation, pref semantics).

### Phase 3: Daily Digest + Reminder Suppression
**Rationale:** Composes Phases 1+2 (localized frames, mailer scaffolding; digest lists exactly the surviving offsets). Largest new component.
**Delivers:** `runDigestPass()` (09:00 gate, per-user aggregate over tasks, transactional claim), `buildDigestMessage`/`sendDigest`, type-scoped suppression in `queueNotifEmails`, `email_digest` default inversion (removed from defaults), settings copy.
**Addresses:** Digest table stakes + differentiators.
**Avoids:** Pitfalls 2, 4, 6 (idempotence, default flip, suppression leak, 09:00 collision — snapshot-at-pass semantics, both-orderings test).

### Phase 4: Notification Audit
**Rationale:** Read-only analysis that must gate any threshold coding (milestone constraint: owner validates thresholds before changes). Runs in parallel from day one as a doc; any code changes it triggers land after Phases 1–3 so they audit the new reality.
**Delivers:** Audit doc — every notification type × channel × default, trim recommendations, explicit decision on RFC 8058 `List-Unsubscribe` for the digest.
**Avoids:** Pitfall 11 (post-ship threshold changes re-firing).

### Phase Ordering Rationale

- I18N first is forced: REM and DIGEST both render localized text through it.
- REM before DIGEST: the digest lists the post-REM offsets and its suppression gate interacts with REM's pref semantics; getting cadence stable first makes the digest's content definition unambiguous.
- The `email_digest` default flip decision belongs in the **spec of whichever phase lands first with pref semantics** — do not let code decide it implicitly.
- Phases 1 and 2 are independently shippable; Phase 3 must follow both; audit findings gate further threshold edits.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Digest):** the idempotence/catch-up window semantics and the 09:00-pass-collision snapshot semantics deserve a deliberate design decision in discuss/spec — research exists but the resend-vs-never trade-off should be explicitly confirmed.
- **Phase 1 (i18n):** verify whether `scripts/i18n-scan.mjs` scans `server.js`/`mailer.js` (probably not) and pick the server-key gate mechanism; confirm `users.locale` population on real rows.

Phases with standard patterns (skip research-phase):
- **Phase 2 (REM):** pure logic deletion over verified code paths; the architecture doc already specifies the exact lines. No external research needed.
- **Phase 4 (Audit):** doc-only, no research beyond the existing code inventory.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Everything read directly from the repo; zero dependencies proposed, so no version risk; Node 24 behavior verified by probes |
| Features | HIGH | Cadence/digest patterns grounded in Todoist/Asana/Workfront docs; matches gr8r's planned scope |
| Architecture | HIGH | Every integration point verified against live code (line numbers cited); no assumptions |
| Pitfalls | HIGH | Derived from live dedup-key format, prefs merge, hour gate — not general lore |

**Overall confidence:** HIGH — this milestone touches well-understood, previously designed (v1.5 REM-01..05) machinery with cited line numbers.

### Gaps to Address

- **`i18n-scan.mjs` corpus scope:** unverified whether server files are scanned. Handle: check in Phase 1 planning; extend scan or add a dedicated regression test.
- **`users.locale` data quality:** unverified that all real rows have non-null locales. Handle: exercise the EN fallback path in tests regardless.
- **Resend-vs-never digest trade-off:** research recommends claim-then-send with duplicate-on-crash; confirm explicitly in the Phase 3 spec.
- **`List-Unsubscribe` (RFC 8058) for the digest:** likely deferrable, but the audit must decide and record it.
- **Catch-up burst communication:** release-notes task for Phase 2 — schedule it deliberately so it isn't dropped.

## Sources

### Primary (HIGH confidence)
- Direct code reads: `server.js` (1100–1432, 5200–5212), `mailer.js`, `src/core/i18n.js`, `src/locales/*.json`, `src/pages/settings.js`, `Dockerfile`, `vite.config.js`
- `.planning/PROJECT.md` — v1.2 i18n decisions, v1.5 REM-01..05, v1.7 SETTINGS-01..03, v1.8 scope
- Todoist Help — reminder model (reminders separate from due dates)
- Asana Help — email notification choices (individual / digest / both)
- Adobe Workfront — overdue digest per recipient per day
- ServiceNow Docs — multilingual email notifications in recipient's preferred language
- Node 24 runtime probes (`Intl.MessageFormat` absent, import attributes stable, full-icu)

### Secondary (MEDIUM confidence)
- Idalko Trello guide — per-user language detection
- Ziflow Help — 09:00 digest slot
- Asana Forum threads — digest expectations

### Tertiary (LOW confidence)
- Artala marketing copy — per-user localized emails (corroborates convergence only)

---
*Research completed: 2026-11-04*
*Ready for roadmap: yes*
