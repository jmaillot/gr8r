# Project Research Summary — v1.5 "Reliability & Rotation"

**Project:** Projects Studio (gr8r)
**Domain:** Self-hosted PM workspace — server-side scheduling, key-envelope rotation, operator audit, deep-linked emails, grafted onto a single-process zero-dependency Node/`node:sqlite` app
**Researched:** 2026-10-30
**Confidence:** HIGH — stack APIs verified by local execution on Node v24.21.0; architecture and pitfalls anchored to specific lines of the live v1.4 tree; feature landscape grounded in documented competitor behavior (Asana/Linear/Todoist) and audit-logging standards

## Executive Summary

v1.5 adds four capabilities to an app whose constraints are unusually firm: zero runtime dependencies, one Node process, one SQLite file, and workspace state stored as revision-optimistic JSON blobs. Research concluded that **all four features fit inside Node built-ins with no dependency exception** — `setInterval().unref()` plus a SQLite dedup table replaces cron/Redis; the existing `v1:` GCM envelope generalizes into a prefix-keyed keyring map (no new crypto); deep links are string composition off the existing `BASE_URL`/`APP_URL`; the audit trail extends the existing `security_log` table with nullable columns rather than adding a second log table. Every recommendation was verified against the actual call sites in `server.js` and `src/`.

The recommended approach follows a strict dependency order. First, **email deep links + APP_URL plumbing** (smallest surface; the SPA already resolves `/w/:slug/task/:key` — the work is almost entirely server-side, and `queueNotifEmails` must drop its `req` dependency). Second, **audit hardening** (extend `security_log` with target/scope/ip + a shared `auditOperatorAction()` helper) so the workspace-admin revocation tier is audited from birth. Third, the **key-rotation sequence**: land the version-aware migration filter *before* any `v2:` row can exist, then the keyring + dual-key decrypt, then the re-wrap pass + DEPLOY.md runbook. The **reminder scheduler comes last** — it is the biggest integration surface (transaction discipline, dedup, prefs, tz semantics) and its email fan-out should exercise the finished deep-link path.

The dominant risks are all codebase-specific, not domain-specific: (1) the reminder pass writing into the JSON doc can cause 409 storms against every active client — it must do a fresh read inside `BEGIN IMMEDIATE`, batch per workspace, and persist dedup keys in SQLite (never in memory, which dies on restart); (2) the boot migration's `not like 'v1:%'` filter treats a future `v2:` envelope as plaintext-eligible and would corrupt every TOTP secret — this one-line fix must land before any v2 code; (3) rotation protects against key *loss*, not key *compromise* — the runbook must prescribe forced re-enrollment in the compromise case.

## Key Findings

### Recommended Stack

Zero new dependencies — runtime or dev. Every candidate dependency (node-cron, BullMQ, cryptr, @noble/ciphers, urlcat) was rejected as adding review surface without adding capability. Verified by local execution: AES-256-GCM envelope roundtrip, `setInterval(...).unref()`, `node:sqlite` DatabaseSync prepare/exec, base64url encoding.

**Core technologies:**
- `setInterval` + `.unref()` (60s tick) — reminder scheduler inside `server.js`; timer never holds the process open; testable by injecting the tick function
- `node:sqlite` tables — `reminders` dedup table (`UNIQUE(task_id, due_date, kind)`) persisted outside the JSON doc; audit columns on `security_log`; key-version metadata — restart-safe by construction
- `node:crypto` keyring map — `{ v1: derive(MASTER_KEY_PREVIOUS), v2: derive(MASTER_KEY) }`; encrypt with `CURRENT`, decrypt by envelope-prefix lookup; re-wrap rotation = one transactional pass; envelope format unchanged
- URL string building from `APP_URL`/`BASE_URL` — deep links; scheduler has no `req`, so `queueNotifEmails` signature changes from `req` → `base`

### Expected Features

**Must have (table stakes):**
- Due-date reminders: day-before + morning-of, pref-selectable, default both on (Asana's core notification; Linear notifies on due date)
- Transactional dedup: exactly one reminder per (task, user, offset, due date), crash-safe across restarts
- Per-user reminder prefs + `email_reminder` gate in existing `notifPrefs`; never remind completed/archived tasks
- Email deep links to the task (not workspace root) with login-redirect-`next` for logged-out clicks (Phase-12 file-route pattern exists)
- Creator auto-watched on task creation (Linear/Asana default; known gr8r gap)
- `v2` envelope + re-wrap rotation without 2FA re-enrollment; DEPLOY.md runbook covering generate/inject/rotate/verify/recover/backup
- Audit rows on operator session revocation (actor, target, session count, timestamp), append-only, owner-visible

**Should have (differentiators):**
- Documented, public key-rotation procedure without re-enrollment — rare even among self-hosted tools
- Owner-visible operator audit surface (competitors bury this in enterprise tiers)
- Workspace-admin revocation tier emitting the same audit rows (sequenced *after* the audit helper exists)

**Defer (v1.6+/v2+):**
- Watcher reminders, past-due nudges, digest emails (v1.6, on user demand)
- Per-user timezone for "morning of" (v1.6; use workspace-shared tz at MVP)
- Custom per-task reminder offsets, push/Slack channels, hash-chained audit log (v2+)

**Anti-features (explicitly rejected):** arbitrary per-task reminder offsets, reminders to non-assignees, editable/deletable audit entries, algorithm-namespace change under cover of rotation, email reminders for every notification type.

### Architecture Approach

The headline finding: **task deep links already exist in the SPA** — `applyDeepLink()` resolves `/w/:slug/task/:key` and `A.copyLink` already produces that canonical shape. The deep-link milestone item is therefore almost entirely a server-side one-line URL change (`${base}/w/${slug}/task/${taskKey}`), **using `task.key`, not `task.id`**. Everything else is additive machinery around verified anchors: the `requireTotpSecret()` single decrypt boundary is the seam for version dispatch; `ensureColumn()` extends `security_log`; the boot-migration backup (`vacuum into`) pattern is the template for the re-wrap pass.

**Major components (14-item integration map in ARCHITECTURE.md):**
1. `reminders` table + `reminderPass()` — dedup state outside the doc; notif rows written into the doc via fresh-read-inside-`BEGIN IMMEDIATE`, batched per workspace, one revision bump per pass; `rem-`-prefixed notif ids to avoid client collisions
2. KEYRING + re-wrap migration — prefix-keyed map; `MASTER_KEY_PREVIOUS` env during rotation; version-aware migration filter derived from known prefixes; completion = zero `v1:` rows
3. `security_log` extensions + `auditOperatorAction()` — nullable `target_type/target_id/scope/ip` columns; audit write in the same transaction as the revocation; machine verbs (ACT-02)

### Critical Pitfalls

1. **409 storm from the reminder pass (CRITICAL)** — scheduler writes into the revision-optimistic JSON doc must never reuse a doc parsed outside the transaction; per-workspace `BEGIN IMMEDIATE` with fresh read, batched writes, skip-when-nothing-to-do
2. **In-memory dedup lost on restart (CRITICAL)** — this deployment restarts (deploy, crash, intentional `process.exit(1)`); dedup keys persist in SQLite from day one, keyed on (task, due date, kind) not run timestamp
3. **`v2:` rows re-wrapped/corrupted by the boot migration filter (CRITICAL)** — `not like 'v1:%'` matches `v2:` envelopes; fix the filter (and decrypt dispatch on the version token — no plaintext fallback, extending the D-79 exclusivity test) *before* v2 ships
4. **No `req` in the scheduled pass → dead email links (CRITICAL)** — `appBase(req)` breaks outside requests; introduce `APP_URL` with a loud boot warning when reminders + mailer are on without it; `next` param must be path-only (open-redirect guard)
5. **Audit insert outside the revocation transaction (MODERATE — the WR-02 trap again)** — make the audit write non-optional and same-transaction; a forced audit-insert failure must roll back the revocation

Also notable: key selection by envelope key-id, never by comparing key material (use `timingSafeEqual` if ever needed); the pass must be wrapped in try/catch (an interval-callback rejection kills the process); malformed client-authored doc JSON must be skipped, not crashed on; the `popstate`/URL-writing debt (v1.1 Active item) will be exposed by deep links — fix it in the deep-link phase or explicitly scope it out.

## Implications for Roadmap

Based on combined research, five phases (ARCHITECTURE.md's dependency-driven build order, expanded):

### Phase 1: Email deep links + APP_URL plumbing
**Rationale:** Smallest surface, unblocks email quality for everything downstream; scheduler emails and reminder fan-out both depend on it.
**Delivers:** `queueNotifEmails` refactored (`req` → `base`), `/w/:slug/task/:key` links (using `task.key`), `APP_URL` boot guard, anonymous login-redirect-`next` (optional but cheap via Phase-12 pattern), creator auto-watch riding the client mutation.
**Avoids:** Pitfall 4 (dead links), Pitfall 7 (route collisions — add the route-ordering test proving `/w/:slug/file/:id` still claims bytes); decide popstate scope here.

### Phase 2: Operator audit hardening
**Rationale:** Independent of Phase 1; must exist before the workspace-admin revocation tier so the new tier is audited from birth.
**Delivers:** `security_log` nullable columns (target/scope/ip), `auditOperatorAction()` shared helper, retrofit of the v1.4 operator-revocation route, index on `(scope, created_at)`.
**Avoids:** Pitfall 6 (same-transaction audit writes; failure rolls back the revocation); anti-pattern "second security table".

### Phase 3: MASTER_KEY rotation — version-aware filter + keyring
**Rationale:** The version-aware migration filter is a hard prerequisite and trivially small; it must land before any `v2:` row can exist.
**Delivers:** Version-aware `not like` filter (#10), KEYRING map + `MASTER_KEY_PREVIOUS`, prefix-dispatching `requireTotpSecret` (signature unchanged), tests with both keys / one key / no key.
**Avoids:** Pitfall 3 (double-wrap corruption, plaintext fallback regression), Pitfall 9 (key-id dispatch, never key comparison).

### Phase 4: Re-wrap rotation + DEPLOY.md runbook
**Rationale:** Depends on Phase 3's keyring; the runbook ships in the same phase — an operator mid-rotation with no runbook is a support incident.
**Delivers:** Idempotent boot-time re-wrap pass (backup → transaction → verify count(v1)=0), compromise-vs-loss policy in DEPLOY.md (compromise ⇒ forced re-enrollment), backup-before-rotation mirror of the D-74 pattern.
**Avoids:** Pitfall 9's re-wrap ordering (verify → backup → re-wrap → sample-verify → drop old key).

### Phase 5: Reminder scheduler
**Rationale:** Biggest integration surface and consumer of everything above (deep links, APP_URL, audit-adjacent migrations); its email fan-out exercises the finished link path end to end.
**Delivers:** `reminders` table, 60s `reminderPass()` with boot catch-up, per-workspace batched transactions, dedup keys, `email_reminder` prefs gate, tz-aware "due today" against the workspace-shared tz.
**Avoids:** Pitfalls 1, 2, 5, 8, 11, 12 (409 storm, memory dedup, long transactions, DST/tz fixtures, unhandled rejection, doc bloat pruning).

### Phase Ordering Rationale

- Deep links first because they are one line + a signature refactor, and both the scheduler and all future email types depend on correct URLs.
- Audit before the admin-revocation tier so every new privileged verb is audited from birth rather than retrofitted.
- The rotation sequence is strictly ordered internally: migration filter → keyring → re-wrap. Shipping v2 code before the filter fix corrupts every TOTP secret on next boot.
- The scheduler is last not because it is least important but because it has the most failure modes and the most upstream dependencies; a stable link path makes its e2e tests meaningful.

### Research Flags

Phases likely needing deeper research during planning (`--research-phase`):
- **Phase 5 (Reminder scheduler):** date-format semantics in `seed.js`/docs need a phase-specific look (Pitfall 8 flags this explicitly if due-date storage isn't canonical); revision-bump policy (accept bump vs side-table notifs) is the phase's central design decision and deserves discussion before planning
- **Phase 1 (Deep links):** decide in discuss-phase whether the `?next` post-login redirect ships now or the "login → home" UX is accepted; popstate scope decision belongs here

Phases with standard patterns (skip research-phase):
- **Phase 2 (Audit):** additive `ensureColumn` migration + one helper; proven patterns
- **Phase 3/4 (Rotation):** everything verified against live call sites; the migration/backup test patterns exist (`test/migration.test.mjs`, `test/totp-encryption.test.mjs`)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every API executed on the target runtime (Node v24.21.0); zero-dep verdict holds across all four features |
| Features | HIGH for reminders/emails/audit; MEDIUM for rotation runbook specifics | Competitor behavior documented; rotation pattern grounded in AWS KMS envelope-encryption references but few PM tools expose it publicly |
| Architecture | HIGH | Every anchor verified against the live v1.4 tree with line numbers; integration research, not library research |
| Pitfalls | HIGH | Each pitfall anchored to a specific line or established v1.4 defect class (WR-02, D-79) |

**Overall confidence:** HIGH

### Gaps to Address

- **Revision-bump policy for scheduler writes** — accept the bump (honest; clients already handle 409→refetch) vs move notif rows to a side table. Must be decided explicitly in the Phase 5 discuss/plan, not drifted into. Research leans "accept the bump, batch per workspace, skip no-op passes."
- **Due-date storage format** — research assumed a canonical comparable form; verify against actual doc/`seed.js` shapes during Phase 5 planning (or normalize in the migration).
- **`?next` post-login redirect** — cheap to add (server plumbing exists from the Phase-12 file route) but needs a product decision; also interacts with the unfixed `popstate` debt (v1.1 Active item).
- **Other MASTER_KEY consumers** — rotation scope is verified as `users.two_fa_secret` only (recovery codes/login challenges are hashed, not encrypted); confirm no other envelope column exists at Phase 3 plan time.
- **Actor-row cascade on `security_log`** — deleting a user must not erase audit history of actions *against* them (target_id is bare text for this reason); whether actor rows should cascade for operator verbs is an explicit Phase 2 plan decision.
- **Note:** ARCHITECTURE.md was written twice (a retry overwrote the first version); the synthesis uses the version currently on disk, which is verified line-by-line against the live tree.

## Sources

### Primary (HIGH confidence)
- Local execution on Node v24.21.0 (2026-10-30) — GCM envelope roundtrip, `timer.unref()`, `node:sqlite` roundtrip, base64url
- Live v1.4 tree anchors — `server.js` (73, 87, 163-169, 244-284, 554, 651, 689-730, 1102-1180, 1370-1373, 1537, 2160-2200, 2883-2902, 2990-2998, 3020), `src/main.js` (75-88, 123-147, 183-185, 214-218), `src/actions/actions.js` (521-530, 598-615), `src/overlays/drawer.js` (19-31)
- `.planning/PROJECT.md` — v1.5 scope, v1.4 guarantees (D-05/D-06/D-58/D-73/D-74/D-77/D-79/D-83), v1.1 audit Active items, v1.2 decisions (ACT-01/02, workspace tz, email i18n out of scope)

### Secondary (MEDIUM confidence)
- Asana forums (threads 3794, 101405, 1041429) — no native pre-due reminder; "due today" email is the built-in
- Linear docs/changelog — due-date reminders, "redundant notifications are skipped" dedup philosophy
- Todoist help — relative vs fixed reminder model
- AWS KMS ReEncrypt / EKS envelope-encryption docs; qcecuring.com key-rotation strategies
- Sonar, Mattermost, Contentful audit-logging guidance — append-only, event-context, tamper-resistance

### Tertiary (LOW confidence)
- None — no finding rests on a single unverified source.

---
*Research completed: 2026-10-30*
*Ready for roadmap: yes*
