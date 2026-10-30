# Stack Research — v1.5 Reliability & Rotation

**Domain:** Server-side scheduling, key-envelope rotation, audit trail, deep-link URLs — added to an existing zero-runtime-dependency Node app (`server.js` + `node:sqlite` + `node:crypto`)
**Researched:** 2026-10-30
**Confidence:** HIGH — every recommended API was executed and verified on the target runtime (Node v24.21.0, local smoke test: AES-256-GCM envelope roundtrip, `setInterval(...).unref()`, `node:sqlite` DatabaseSync prepare/exec, `base64url` token encoding)

## Verdict Up Front

**Zero new dependencies. All four capabilities fit inside Node built-ins with less code than a dependency would add.** No dependency exception is required for any of the four items. The only "vendor-like" precedent is the existing vendored qrcode-generator; nothing here even needs that.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `setInterval` + `.unref()` | Node ≥22 (built-in) | Due-date reminder scheduler tick inside `server.js` | Verified: the timer object supports `.unref()`, so the tick never holds the process open. A 60 s tick (aligned minute boundary) scanning a `reminder_jobs` table is simple, restart-safe, and testable with `node:test` (inject the tick function; don't sleep). An external cron or `node-cron` would either add a runtime dep or a second process to the Docker image — both worse. |
| `node:sqlite` (`DatabaseSync`) | Node 22.5+/24 stable | `reminder_jobs` state, audit table, key-version metadata | Already the app's storage; jobs dedup and audit rows are just tables. Verified prepare/exec/insert roundtrip. Using SQLite as the job queue (SELECT due jobs WHERE sent_at IS NULL, with a `processing` guard or dedup unique index) beats an in-memory queue because the single-process Docker deploy restarts without losing reminder state. |
| `node:crypto` `createCipheriv/createDecipheriv('aes-256-gcm')` | Node ≥22 (built-in) | Key-version envelope (`v1:`, `v2:` …) for TOTP secrets | Verified roundtrip. The existing `v1:` prefix already is a key-version envelope — v1.5 generalizes it: `keyring = { v1: derive(master, salt-v1), v2: ... }`, encrypt with the *current* version, decrypt by prefix lookup. Re-wrap rotation = SELECT rows with prefix != current → decrypt with old key → re-encrypt with new key → UPDATE, all in one transaction. Zero new crypto primitives needed. |
| URL string building (no API needed) | — | Deep-link URLs in notification emails | The app already has single-domain, slug-in-path routing (`/w/:slug/...`). A deep link is `` `${BASE_URL}/w/${slug}#task-${taskId}` `` or the existing client route for a task — a pure string composition in `mailer.js` from an existing workspace slug + task id. `BASE_URL` env already exists (used for invite links). No `new URL()` subtlety beyond encodeURIComponent on path segments. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none — deliberately)* | — | — | Every candidate was rejected; see Alternatives Considered. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `node:test` (existing) | Scheduler + keyring unit tests | Test the tick handler as a pure function `runReminderPass(now, db, mailer)`; test rotation by constructing a DB with `v1:` rows and a rotated keyring. Existing 555-test suite pattern. |
| Playwright (existing, dev dep) | Deep-link e2e | Follow the deep-link URL in an anonymous session → login redirect → lands on the task (same pattern as the Phase 12 file deep-link test). |

## Installation

```bash
# Nothing. Zero runtime dependencies holds.
# No new dev dependencies either — node:test and Playwright cover it.
```

---

## Capability-by-Capability Integration

### 1. Scheduled reminder pass (due dates)

**Shape:** inside `server.js`, after boot:

```js
const TICK_MS = 60_000;
const timer = setInterval(() => runReminderPass(new Date()), TICK_MS);
timer.unref(); // verified: process can still exit
```

`runReminderPass(now)` queries a small `reminder_jobs`-style view (either a real table populated on task PUT, or computed on the fly from the doc's task rows — **recommend the table**: `reminders(task_id, workspace_id, due_at, kind, sent_at, dedup_key UNIQUE)`), finds due/unsent rows, respects per-user notification prefs, creates notification rows through the existing fan-out + email path, marks `sent_at`.

- **Dedup:** a UNIQUE index on `(task_id, kind, due_date_key)` makes re-sends idempotent across restarts — SQLite enforces what a setInterval double-fire would break.
- **"On due date" precision:** a 60 s tick is far finer than needed; the dedup key is the *date*, not the tick, so a restart or missed tick just means the next tick catches it. No cron parsing library needed — compare `due_at <= now` on ISO dates with the workspace's existing `tz`/`dateFmt` settings only for display, not scheduling (schedule in UTC, always).
- **Multi-workspace:** the pass iterates all workspaces' docs server-side; no scoping problem because the server already owns the documents.

### 2. Key-version envelope + MASTER_KEY rotation

**Shape:** generalize the existing single-`v1:` boundary. The Phase 19 pattern (single `requireTotpSecret()` fail-closed boundary) is exactly the seam:

```js
// boot: parse MASTER_KEY + optional MASTER_KEY_PREVIOUS (comma-list of versions)
const keyring = { 'v1': k1, 'v2': k2 }; const current = 'v2';
// encrypt: `${current}:${iv_b64}:${ct_b64}:${tag_b64}`  (format unchanged, prefix = version)
// decrypt: split prefix → keyring[prefix] ?? throw masterKeyMissing
```

- **Format is already version-tagged** — no migration of envelope format needed, only a keyring map. `MASTER_KEY_PREVIOUS` (or `MASTER_KEYS="v1=...,v2=..."`) holds the old key during rotation.
- **Re-wrap pass:** one transaction: SELECT users (and any future envelope columns) → decrypt with old → encrypt with current → UPDATE. Idempotent: rows already on `v2` are skipped by prefix check. After a verified pass, the runbook says remove `MASTER_KEY_PREVIOUS`.
- **Why not a dependency:** libs like `cryptr` or `@noble/ciphers` wrap *less* than what already exists here (existing code has the GCM envelope, fail-closed boundary, and migration machinery proven in Phase 19). A dep would add review surface without adding a capability.
- **Boot behavior:** missing key for an encountered version → same loud `masterKeyMissing` 503 semantics as today (fail-closed preserved per version).

### 3. Audit trail (operator revocations + admin tier)

**Shape:** a new `audit_log(id, at, actor_user_id, actor_role, verb, target_user_id, workspace_id, detail_json)` table; write rows inside the same transaction as the revocation (v1.4 lesson: WR-02 showed verb-insert-outside-transaction is a real defect class — do not repeat it). Verbs: `session_revoke`, `sessions_revoke_others`, `workspace_admin_revoke`, `membership_change`, etc. Read endpoint gated to operators (and workspace admins scoped to their workspace). Render through the existing activity-verb display pattern (machine verbs, i18n-catalogued). No append-only log library, no `winston`, no separate audit store — SQLite with the existing transaction discipline is the right weight.

### 4. Deep links in notification emails

**Shape:** in the existing per-type email builders, append a plain-text + HTML link: `` `${BASE_URL}/w/${encodeURIComponent(slug)}/...task route` ``. Verify the client deep-link target exists (the SPA route or `#task-id` anchor) and reuse the Phase 12 anonymous-navigation→login→redirect pattern so an anonymous click lands back on the task. `Auto-Submitted: auto-generated` is already on all mailer messages — nothing new. Watch out: `BASE_URL` trailing slash, and emails must link the *task*, not just the workspace (that's the feature).

### 5. Task creator added to watcher set

Not a stack item — a one-line data rule at task creation (creator id added to watchers/notification row fan-out), guarded so the creator's own prefs still gate email.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `setInterval` + `.unref()` tick | `node-cron` / `croner` (deps) or host cron / sidecar process | Only if scheduling ever needs cron expressions or multi-instance coordination. Single-container, single-process deploy: never justified here. |
| SQLite table as job queue + dedup index | BullMQ/Redis | Only with multiple server processes competing for jobs. The app is one process with one DB file — Redis would double the infra. |
| Keyring map over existing `v1:` envelope | `cryptr`, `@noble/ciphers`, KMS | Only if key custody must move off-server (KMS). Out of scope for a self-hosted Docker deploy; DEPLOY.md runbook covers it. |
| `audit_log` table in the same DB | Separate append-only file / syslog | Only if tamper-evidence beyond DB write discipline is required. Not a stated requirement; DB transaction + backup story is consistent with the app. |
| String-built deep links from `BASE_URL` | `new URL()` everywhere / urlcat | `new URL()` is fine and built-in for safety on user-influenced segments; urlcat is a pointless dep for ~3 URLs. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `node-cron`, `bullmq`, `agenda`, `node-schedule` | All add runtime deps for scheduling the app can do with one interval + one table; violate the hard constraint | `setInterval(...).unref()` + `node:sqlite` dedup table |
| Any new crypto dependency (incl. `@noble/*`) | The v1.4 envelope already implements exactly the needed AES-256-GCM primitive, fixture-tested | Generalize the existing `v1:` prefix into a keyring |
| Separate scheduler worker/container | Second deploy artifact, shared-DB races, breaks the single-image story | In-process tick; it's a low-frequency, low-cost scan |
| In-memory job state (Map/Set) | Lost on restart → duplicate or missed reminders | Persist sent/dedup state in SQLite |
| `process.exit`-based rotation or startup-time-only re-wrap | Blocks boot, no verification step | Explicit rotation endpoint/command + runbook, idempotent re-wrap pass |

## Stack Patterns by Variant

**If reminders must honor user timezones:** keep the schedule comparison in UTC and compute "due today" per the workspace/user tz at query time (Intl available built-in). Do not store local dates.

**If a second server instance ever appears:** move the reminder pass behind a SQLite advisory lock (`BEGIN IMMEDIATE` claim on a `scheduler_lock` row) before adding Redis. Not needed now.

**If more secret types get envelope-wrapped later** (recovery codes, future tokens): the keyring + prefix format scales unchanged; only the re-wrap SELECT widens.

## Version Compatibility

| API | Requires | Notes |
|-----|----------|-------|
| `node:sqlite` `DatabaseSync` | Node ≥22.5 (stable in 24) | Already the app's storage; verified on Node 24.21 |
| `setInterval().unref()` | All Node | Verified |
| `aes-256-gcm` via `createCipheriv` | All Node | Verified; auth-tag `setAuthTag` required before `final()` on decrypt |
| `base64url` buffer encoding | Node ≥15 | For IV/tag/ct fields and any new tokens |
| Intl (tz-safe date math) | Node ≥13 (full ICU) | Only for per-user "due today" display logic |

## Sources

- Local execution on Node v24.21.0 (2026-10-30): GCM envelope roundtrip, timer `.unref()`, `node:sqlite` roundtrip, base64url — **HIGH**
- Project ground truth: `.planning/PROJECT.md` (v1.4 envelope pattern, Phase 19 fail-closed boundary, zero-dep constraint, mailer Auto-Submitted) — **HIGH**
- Node.js API knowledge (node:crypto/timers/sqlite) consistent with verified local behavior — **HIGH**

---
*Stack research for: Projects Studio v1.5 — Reliability & Rotation*
*Researched: 2026-10-30*
