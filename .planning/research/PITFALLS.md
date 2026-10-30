# Domain Pitfalls

**Domain:** Adding [scheduled reminder passes, email deep links, key-version envelope rotation, operator audit hardening] to an existing single-process, zero-dependency Node/`node:sqlite` PM app whose state is a revision-optimistic JSON workspace document.
**Researched:** 2026-10-30 (code-verified against `server.js` v1.4 tree)
**Overall confidence:** HIGH — every pitfall below is anchored to a specific line or established pattern in this codebase.

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: The reminder pass writes into the doc → 409 storm against every active client
**What goes wrong:** Notifications live *inside* the workspace JSON blob (`data.notifs`) behind optimistic concurrency (`PUT` answers 409 `workspaceChanged` on revision mismatch, `server.js:2168-2172`). A server-side scheduled pass that appends reminder rows to `data.notifs` and bumps `revision` invalidates every client's cached revision — every open browser gets a 409 on its next PUT and must re-sync. With a pass every N minutes, users editing around the tick hit a periodic conflict wall.
**Why it happens:** The reminder writer is treated like a client PUT; the revision contract was designed for client-vs-client races, not a periodic server writer.
**Consequences:** Conflicts, lost client edits (if a client overwrites blindly), users blaming the editor.
**Prevention:** The pass must (a) run inside `begin immediate` like the PUT handler so it never clobbers a concurrent write, (b) re-read the stored doc inside that transaction and merge reminder notifs into *it* (never a doc captured earlier — the doc could have changed between read and write), and (c) be considered for a revision bump policy: either accept the bump (honest, clients already handle 409→refetch) or move reminder rows to a real table (`reminders`/`notifs` side table) keyed outside the doc. Decide explicitly in the reminders phase; do not let the implementation drift into "whichever doc we had".
**Detection:** 409 rates correlated with the scheduler tick in logs; e2e tests that PUT during a pass.
**Phase:** Reminders pass phase — this is its central design decision.

### Pitfall 2: In-memory dedup lost on restart → duplicate reminder emails
**What goes wrong:** The existing email dedup is diff-based against the stored doc (`storedNotifIds`, `server.js:2184-2187`) — it only works because notif rows persist in the doc. If the reminder pass keeps "already sent" state in a module-level `Set`/Map (the natural temptation for a zero-dependency scheduler), a container restart (deploy, crash — `server.js:3020` has an intentional `process.exit(1)` path) silently loses it and every assignee gets re-emailed for the same due date.
**Why it happens:** Single process = "state in memory feels fine". It isn't: this deployment restarts.
**Consequences:** Spam emails, broken trust in the reminder feature.
**Prevention:** Persist dedup keys in SQLite from day one: a `reminders_sent(task_id, user_id, due_date, kind)` row (or a `sent_at` on the reminder row) written *in the same transaction* as the notif/email decision. Key on `(task, due_date, kind)` — not on a run timestamp — so an idempotent re-run after crash dedups naturally.
**Detection:** Restart the server with a due task and count emails in the test mailbox — make it a node:test.
**Phase:** Reminders pass phase; dedup schema belongs in its migration.

### Pitfall 3: Envelope v2 breaks the boot migration's version filter → double-wrap or plaintext regression
**What goes wrong:** Two concrete traps verified in code:
1. The boot encryption migration selects rows with `two_fa_secret not like 'v1:%'` (`server.js:1114`). A `v2:` envelope **matches that filter** — on next boot the migration would treat already-encrypted-v2 secrets as plaintext and wrap them again (`v1:<...>` wrapping a `v2:<...>` string), making every secret undecryptable.
2. `decryptTotpSecret` parses `String(envelope).split(':')` and **ignores the version field** (`server.js:268`) — it will happily "decrypt" a `v2:` envelope with the v1 key path and fail, or worse, a naive rotation implementation adds `decrypt(x) ?? x` "so old data still works", reintroducing exactly the plaintext fallback v1.4 explicitly eliminated (D-06/D-75/D-79, single `requireTotpSecret()` boundary).
**Why it happens:** The version prefix was introduced as a guard tag, not as a discriminated union; nothing forces new code to dispatch on it.
**Consequences:** Silent 2FA lockout for all users after rotation, or a security regression undoing a v1.4 guarantee.
**Prevention:** (a) Migration filter becomes `not like 'v_:%' escape '_'` or explicitly `and not (like 'v1:%' or like 'v2:%')`; add a migration test with a synthetic `v2:` row. (b) Decrypt dispatches on the version token: unknown version → return null (fail closed 503), never fall through to v1 parsing. (c) Keep `requireTotpSecret()` as the only entry point — the D-79 exclusivity test must be extended to assert no v2 path bypasses it. (d) Rotation = re-wrap (decrypt with old key → encrypt with new key) in one transaction with a pre-rotation backup file, mirroring the proven D-74 pattern; never re-enroll.
**Detection:** `test/migration.test.mjs` + `test/totp-encryption.test.mjs` cases: v2 row survives boot unchanged; rotation with wrong old key is a no-op.
**Phase:** Key rotation phase — write these tests before the rotation code.

### Pitfall 4: The scheduled pass has no `req` → `appBase(req)` breaks and deep links point nowhere
**What goes wrong:** Email URLs are built with `appBase(req)` (`server.js:694`, `:708`) — derived from the incoming request. The reminder pass runs outside any request; there is no `req`. A naive `appBase()` call returns garbage (localhost, wrong port), and every reminder email carries a dead link. Same trap behind Traefik: the request-facing base works because the proxy forwards Host, but the scheduled pass sees only `process.env`.
**Why it happens:** The email feature was born request-scoped; the scheduler is not.
**Consequences:** The flagship feature of this milestone (email deep links) emails links users can't open.
**Prevention:** Introduce an explicit `APP_URL` (or reuse whatever deploy config names the public origin, checked against `DEPLOY.md`) used by the scheduler; keep `appBase(req)` for request-scoped emails or unify both onto the env var. Validate at boot: warn loudly if APP_URL is unset while the scheduler is enabled. Deep-link URLs must follow the existing anonymous-navigation contract: `/w/:slug/...` path, and an anonymous hit lands on login with a **path-only** `next` (D-12-13) — never pass the full URL as `next` (open redirect).
**Detection:** Boot-time warning; a test that renders a reminder email for a workspace and asserts the link matches the configured origin.
**Phase:** Deep-link phase (APP_URL) + reminders phase (consumer). Flag in DEPLOY.md runbook.

## Moderate Pitfalls

### Pitfall 5: Long-running pass blocks the SQLite single writer and the event loop
**What goes wrong:** Existing `setInterval` jobs are single prepared statements (`server.js:2990,2993`). A reminder pass that scans all workspaces, parses every doc JSON, and holds one `begin immediate` transaction for the whole sweep blocks every concurrent PUT for its duration — `node:sqlite` serializes writers.
**Why it happens:** "One pass = one transaction" feels atomic and safe.
**Consequences:** Periodic latency spikes; worst case, `SQLITE_BUSY` errors on user writes.
**Prevention:** Per-workspace transactions (one `begin immediate` per workspace doc, committed before the next), sent *after* commit like `queueNotifEmails` already does. Keep SMTP sends fire-and-forget outside the pass loop. Cap batch size per tick; if the backlog is large, spread it over ticks.
**Detection:** Timing test: pass duration with N workspaces; monitor PUT latency around the tick.
**Phase:** Reminders pass phase.

### Pitfall 6: Audit rows written outside the revocation transaction (the WR-02 trap, again)
**What goes wrong:** v1.4 left an open advisory (WR-02): an activity verb insert sat *outside* its transaction. `security_log` inserts (`server.js:1537`) currently carry only `(id, user_id, verb, created_at)`. Operator revocation audit needs the **actor**, the **target**, the **workspace/instance scope**, and ideally the target session state at revocation time. If the audit row is best-effort (after commit, or with a bare `insert into security_log(user_id, verb)`), you get the exact gap the milestone names: *revocation without target-state record* — and if that insert throws, the revocation succeeds unlogged.
**Why it happens:** Audit feels like a side effect; the existing helper's signature doesn't carry actor/target.
**Consequences:** Unanswerable "who revoked whom, was the target actually signed out?" — the audit trail exists but proves nothing.
**Prevention:** Extend `security_log` (or add columns) with `actor_id`, `target_id`, `scope` in the migration; write the audit row **inside the same transaction** as the revocation; make the write non-optional (fail the revocation if the audit insert fails — an unlogged revocation should not be possible). Cover the new admin tier too: workspace-admin revocation must audit identically, with role recorded.
**Detection:** Test that a forced audit-insert failure rolls back the revocation.
**Phase:** Operator hardening phase.

### Pitfall 7: Deep-link routes collide with the SPA's parse-once boot router — and the milestone overlaps an unfixed Active requirement
**What goes wrong:** Routing is boot-time only: `src/main.js:123` `applyDeepLink(rest)` parses the path *once at load*; there is **no `popstate` handler** (verified — zero matches in `src/`), and the app only ever calls `history.replaceState`. The v1.1 audit explicitly lists "write the browser URL on navigation and handle popstate" as an Active item. Adding email deep links (`/w/:slug/task/:id`) makes users hit these URLs constantly, exposing both the missing popstate handling and the parser's rigidity. Server-side, the SPA fallback serves `index.html` for any extensionless path (`server.js:2653`), so `/w/:slug/task/:id` works — unless it collides with the reserved `/w/:slug/file/:id` byte route (`server.js:2747`, D-13) or a future top-level route like `/join`.
**Why it happens:** Deep links were designed for "paste URL at boot", not "click email links all day".
**Consequences:** In-app navigation loses the URL; back button breaks out of the app; a careless new path shadows the file route.
**Prevention:** Decide scope explicitly: either (a) fix popstate + URL-writing *in the deep-link phase* (recommended — they're the same code), or (b) keep deep links boot-only and state the limitation. Either way: register deep-link paths in `applyDeepLink`'s dispatcher, add a server-side route-ordering test proving `/w/:slug/file/:id` still claims bytes and task paths still hit the SPA fallback, and keep the path grammar transposable (route names are never translated — D-08).
**Detection:** e2e: click email link → land on task → navigate → back button → URL and view agree, both locales.
**Phase:** Deep-link phase.

### Pitfall 8: Timezone and clock semantics of "due" in a workspace-shared tz model
**What goes wrong:** `dateFmt`/`tz` are workspace-shared settings (v1.2 decision 14); due dates are stored as doc fields (format only the doc knows). The pass must decide "is this due today/overdue" per workspace — naive UTC comparison sends reminders 12h off, and DST transitions double-fire or skip a day.
**Why it happens:** Server-side time looks simple until a human-facing date is involved.
**Consequences:** Reminders a day early/late; users disable them.
**Prevention:** Normalize to a canonical storage form in the migration (or derive one deterministically from the existing format); compute "due" in the workspace `tz` via `Intl` (zero-dep, already a project pattern); define the pass's reference "now" once per tick. Dedup key includes the due-date value (Pitfall 2), so a date re-edit legitimately re-reminds — decide and document that.
**Detection:** Fixture tests across tz offsets and a DST boundary date.
**Phase:** Reminders pass phase (needs a small phase-specific research look at the actual date format in `seed.js`/docs if not standardized).

### Pitfall 9: Key-comparison and key-derivation shortcuts in the rotation path
**What goes wrong:** The key is `sha256(MASTER_KEY)` (`server.js:251`). Rotation introduces "old key" and "new key" material in the same process. Classic mistakes: selecting the decrypt key by string-comparing raw keys with `===` (timing attack surface), deriving v2 with a different-but-weaker scheme, or keeping the old key in memory/env forever "for safety" (no actual rotation). Conversely, removing the old key before re-wrap completes bricks every TOTP secret.
**Why it happens:** Rotation is rare-path code with no natural test until the first real rotation.
**Consequences:** Either a lockout or a theoretical timing oracle; both are milestone-failure headlines.
**Prevention:** Identify keys by **key-id stored in the envelope** (`v2:<keyid>:<iv>:<tag>:<ct>`), never by comparing key material; key lookup is by id, decrypt dispatches by version+id (Pitfall 3). If any key comparison is ever needed (e.g. verifying a supplied rotation key), use `crypto.timingSafeEqual` on equal-length buffers. Re-wrap order: verify old key decrypts → backup → transaction re-wrap → verify a sampled row decrypts with new key → only then drop the old key. Document the whole sequence in the DEPLOY.md runbook the milestone promises.
**Detection:** Rotation test: rotate, re-verify login with TOTP, second boot byte-identical no-op; runbook reviewed against actual flags.
**Phase:** Key rotation phase (runbook = same phase's deliverable).

## Minor Pitfalls

### Pitfall 10: Reminder emails inherit the hardcoded-French email templates
**What goes wrong:** `queueNotifEmails` hardcodes `'Un membre'` (`server.js:707`) — emails are not localized (v1.2 decision 12 kept them out of scope, no server-side `t()`). Adding reminder emails silently inherits English/French soup.
**Prevention:** Out of scope unless the owner pulls it in — but state it in the phase doc; don't let i18n-scan accidentally gate email strings (catalogue gates are client-side; keep email literals out of scanned `src/` or the build goes red).
**Detection:** Run `scripts/i18n-scan.mjs` after adding email code.
**Phase:** Reminders/deep-link phase (one line in the plan).

### Pitfall 11: Unhandled rejection inside the interval callback kills the process
**What goes wrong:** An exception thrown synchronously in a `setInterval` callback surfaces as `uncaughtException`; one `await` rejection in an async pass can too. This deployment treats crashes as real (`process.exit(1)` on shutdown path).
**Prevention:** Wrap the entire pass body in try/catch; log, never rethrow; use `unref()` like the existing jobs so the timer never holds the process open. Test the pass against a workspace with malformed doc JSON (docs are client-authored — a bad shape must skip, not crash).
**Detection:** Unit test: poisoned doc row + pass run → process alive, warning logged.
**Phase:** Reminders pass phase.

### Pitfall 12: Doc growth — reminders and their dedup rows bloat the JSON blob
**What goes wrong:** `data.notifs` already lives in the doc; adding reminder-notifs with no pruning grows the blob unboundedly (PUT has a 413 `documentTooLarge` cap). Reminder dedup rows in the doc make it worse.
**Prevention:** Prune acked/expired notifs in the pass (bounded retention), and keep the dedup table *outside* the doc (Pitfall 2). Note the blob size in tests.
**Phase:** Reminders pass phase.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Scheduled reminder pass | 409 storm vs concurrent PUTs (P1); long transaction (P5) | per-workspace `begin immediate`, merge into freshly-read doc, decide revision policy up front |
| Reminder dedup | restart loses in-memory state (P2); DST/tz (P8); crash on malformed doc (P11) | SQLite dedup keyed on (task, due, kind); try/catch; fixture tests |
| Email deep links | no `req` in the pass → dead links (P4); popstate/route collisions (P7); open-redirect via `next` | APP_URL env + boot warning; path-only `next`; e2e back-button test; route-order test |
| MASTER_KEY rotation | v2 rows re-wrapped by boot migration (P3); plaintext fallback regression (P3); timing-unsafe key selection (P9) | version+key-id dispatch, migration filter `not like 'v_:%'`, re-wrap with backup, timingSafeEqual |
| Operator audit hardening | audit insert outside transaction / missing target state (P6) | extend security_log schema, same-transaction write, failure rolls back the revocation |
| All phases | security_log schema change + reminders table = migrations | reuse the proven additive-migration pattern (`test/migration.test.mjs`, byte-identical second boot, vacuum backup) for every new table/column |

## Sources

- `server.js` v1.4 tree: PUT transaction & 409 path (L2160-2200), `queueNotifEmails`/`appBase` (L689-723), envelope encrypt/decrypt (L244-290), boot v1 migration filter (L1102-1180), `security_log` schema & insert (L163-169, L1537), SPA fallback & file route (L2640-2680, L2747), session/challenge cleanup intervals (L2990-2993), shutdown exit (L3020)
- `src/main.js` boot-only deep-link parsing (L122-248); `grep popstate src/` → 0 matches
- `.planning/PROJECT.md`: v1.5 goals, v1.4 guarantees (D-06/D-79 fail-closed decrypt, no plaintext fallback), v1.1 audit Active items (popstate debt), v1.2 decisions (workspace tz, email localization out of scope)
