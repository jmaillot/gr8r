# Pitfalls Research — Digest Subject/Workspace Splitting + RFC 8058 One-Click Unsubscribe

**Domain:** Adding features to an existing self-hosted Node/SQLite PM app (Projects Studio) with an in-process reminder scheduler and hand-rolled SMTP mailer — zero runtime dependencies held.
**Researched:** 2026-11-05
**Confidence:** HIGH (RFC 8058 spec text, documented Gmail/Microsoft bulk-sender requirements, and project-local evidence from Phases 27/29/32/37/38/39)

**Context from PROJECT.md that shapes every pitfall below:**
- The digest ships from Phase 38: single email at 09:00 workspace-local, transactional send claim (the `reminders_sent` exactly-once pattern), strict `email_digest` opt-in, individual reminders suppressed for digest users.
- Phase 39 deferred RFC 8058 one-click explicitly to a future milestone, proposing a plain `List-Unsubscribe` header meanwhile.
- v1.8's whole thesis is "Notification Sanity" — trim, not grow. Phase 29 already fixed send-time scope filtering; Phase 32 routed the reminder pass and email mirror through `memberCanReadProject`; v1.8 CR-01 was a digest-content project-name leak of exactly the private-project class.
- Standing constraints: zero runtime dependencies, additive-only migrations with byte-identical second boot, EN+FR i18n gate.

---

## Critical Pitfalls

### Pitfall 1: `List-Unsubscribe-Post` with a non-https URL — providers silently reject one-click

**What goes wrong:**
The unsubscribe works locally, but Gmail/Microsoft ignore or penalize the message. RFC 8058 §4 requires the URI in `List-Unsubscribe` that the one-click POST targets to be `https://`; an `http://` URL (or a `mailto:` paired with a `List-Unsubscribe-Post` header) means the mailbox provider will not honor (and Gmail will not count as compliant) the one-click mechanism. Self-hosted installs behind Traefik are often reached over `http://` internally — if the URL is built from an internal base (`http://localhost:3000`, a container name, or `APP_URL` unset) instead of the public origin, the header advertises a non-https URL. Worse, an `http://` or private-IP URL in the header is itself an information disclosure about the deployment topology.

**Why it happens:**
The hand-rolled mailer already builds deep links from `APP_URL` (`/w/:slug/task/:key` since Phase 23), so it is tempting to reuse the same base blindly. But the digest runs in the scheduler context, not a request context, and there is exactly one place that should know the public origin.

**How to avoid:**
- Derive the unsubscribe URL from the same single `APP_URL`-rooted helper the deep links use; assert at send time that it starts with `https://` (fail loud in a test, degrade to plain `List-Unsubscribe` mailto-only if not — never emit `http://`).
- Emit BOTH headers together on the digest only: `List-Unsubscribe: <https://…/api/…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. RFC 8058 requires the `-Post` header value to be exactly `List-Unsubscribe=One-Click`.
- Do not add one-click to other notification emails in the same milestone — scope creep against the "trim" goal; other types keep their existing pref-based suppression.

**Warning signs:**
Header dumps in tests show `http://`; the mailer has its own URL-building code instead of reusing the Phase 23 helper; Postmaster Tools / Microsoft SNDS show no one-click compliance after deploy.

**Phase to address:** The UNSUB phase (header emission + URL construction) — first plan task, pinned by a unit test on the raw SMTP message headers.

---

### Pitfall 2: The one-click POST has no cookies, no CSRF token, no browser — and email scanners may fire it for you

**What goes wrong:**
The unsubscribe endpoint is designed like every other API route: cookie session, sameOrigin guard, CSRF protection. A real one-click POST from Gmail's servers carries none of that — it is a bare `POST` with body `List-Unsubscribe=One-Click`, no `Referer` guarantee, no cookie. If the route requires a session it 401s and unsubscribe silently never works. The opposite mistake is worse: an unauthenticated route keyed only by an ID or email → anyone (or a security scanner, or Outlook's SafeLinks, or any recipient-forward) can unsubscribe other users, and a non-secret enumerable URL becomes a vandalism endpoint.

A second trap: **link prefetching**. Google/Proxy/Microsoft scanners *GET* links in emails. If the unsubscribe is implemented as a GET that mutates state (the "one-click" URL is fetched by a crawler), the user is unsubscribed without ever clicking. RFC 8058 one-click must be POST-only; the GET on that URL must be a no-op (or the human-friendly landing page only).

**Why it happens:**
The codebase's two existing unauthenticated send-state routes (invite accept, login challenge) were each hardened in dedicated phases (HARD-01..05, Phase 17). This route looks "small" and skips that scrutiny.

**How to avoid:**
- Capability-token URL: `POST /api/unsubscribe/:token` where `token` is a random 256-bit per-(user, workspace) value, generated at digest-send time (or persisted per user), stored hashed server-side — same pattern as `recovery_codes`. No user ID, no email in the URL, no enumeration.
- POST-only mutation. A `GET` to the token URL returns the localized confirmation page and changes nothing.
- Idempotency by construction: unsubscribing an already-unsubscribed user returns the same 200 confirmation, not an error (see Pitfall 3 for the replay dimension).
- Log the token **never** (Pitfall 8).
- Consider the middle ground explicitly and decide with the owner: instant-unsub on POST (what RFC 8058 consumers expect — providers require the POST to actually unsubscribe, no confirmation page in between) vs. a confirmation interstitial. **For the one-click POST itself there is no interstitial: RFC 8058 semantics require the opt-out to happen on receipt of the POST.** The confirmation page belongs only to the GET fallback path in the email footer.

**Warning signs:**
Route reads `req.session`; route is GET; token contains a user id or email; tests never cover an unauthenticated POST.

**Phase to address:** UNSUB phase — security contract first (token model, method allow-list, replay posture), route code second. This is Phase-30-class security surface and deserves the same threat-model treatment.

---

### Pitfall 3: Scanner prefetch / replay treats "unsubscribe" as idempotent-by-luck — but replay plus the digest claim can interact badly

**What goes wrong:**
Two distinct failure modes share one root: the POST endpoint is *stateful in both directions*.
1. **Accidental unsubscribe:** a scanner (or the user's own mail client pre-fetching) POSTs the token once → user silently opted out with zero signal. If the token is single-use and replay returns 410 (the `firstWorkspace()` invite-accept twin behavior), a *retry by the provider* after a transient failure turns a delivered unsubscribe into an error the provider may log as a bad one-click URL.
2. **Replay confusion:** if unsubscribing *deletes* the token, a second provider retry 410s; if it doesn't delete it, the token remains valid forever for a user who already left.

**Why it happens:**
The codebase's exactly-once instincts (`reminders_sent`, TOTP replay guards) push toward "single-use token," which is the wrong semantics for unsubscribe. Unsubscribe is a **convergent** operation, not a **consumed** operation: the target state is "email_digest off," and repeating it must be a no-op success.

**How to avoid:**
- Design the endpoint as idempotent-state, not token-burn: `UPDATE ... SET email_digest=0 WHERE token matches` — success whether or not it was already 0. Do not delete the token row on use; instead give tokens an expiry (e.g. valid while the user is a member; reject with the same generic response for a stale/expired token).
- Return the **same response body and status** for success, already-unsubscribed, and expired-token (mirror the Phase 1 404-no-oracle and Phase 30 generic-`ssoError` discipline) — the response must never distinguish "token valid" from "token stale" to an unauthenticated caller.
- One-click POST also toggles the right pref key only (`email_digest`) — not a blanket "unsubscribe from everything," which would fight the per-type prefs model from Phase 34 and the suppression logic from Phase 38.

**Warning signs:** any `DELETE`/`burn` of the token on use; any 4xx other than the generic stale-token response; a test asserting "second POST fails."

**Phase to address:** UNSUB phase — idempotency test (POST ×3, same result) in the plan's verification list.

---

### Pitfall 4: Per-workspace splitting multiplies email volume — colliding head-on with the v1.8 anti-goal

**What goes wrong:**
Naively, "one digest per workspace" means: user in 5 workspaces → 5 emails per morning. v1.8 exists because users complained about *too many* notifications (Kanzo #6); the digest was the *fix*, and the AUDIT phase (39) exists to trim. A split that turns 1 email into N undoes the milestone's own thesis. The subtle version is worse: a user with the digest on in one workspace and individual reminders still on in another now gets digest(s) **and** reminder emails — the Phase 38 suppression rule ("individual reminders suppressed for digest users") was written per-user, and splitting per-workspace can accidentally un-suppress or double-suppress depending on where the flag is read.

**Why it happens:**
`email_digest` lives in per-(workspace, user) `notif_prefs` rows (Phase 34), so "per-workspace digest" is the *natural* reading of the data model — and the reminder pass iterates workspaces, so emitting one email per workspace inside the loop is the path of least resistance.

**How to avoid:**
- Decide the aggregation policy **before** coding, owner-validated like D-05: recommended policy is **one email per user per day, sections per workspace** — workspace name as section heading, tasks grouped underneath — *unless* the owner explicitly wants N emails. The SUBJ requirement ("subject carries the Workspace name") only forces workspace context into the subject when there is exactly one workspace's worth of content; a multi-workspace single email gets a localized generic subject with sections. Make this an explicit D-decision, not an implementation accident.
- Check the exact workspaces-with-content set, not the membership set: a user in 5 workspaces who only has due tasks in 1 gets exactly the single-workspace email — no empty sections, no email when all sections are empty (already implied by Phase 38's "only when tasks exist" but must survive the refactor).
- Re-verify the suppression invariant after splitting: for a digest user, *no workspace* in the pass sends individual reminder emails, even when that workspace's digest section is empty or the user's digest is on in only some workspaces. This is the highest-value regression test in the whole milestone.
- The unsubscribe from one workspace digest must not unsubscribe the others (per-workspace pref), and the email must make it clear which workspace(s) it covers.

**Warning signs:** any loop that calls `sendMail` per workspace without a per-user aggregation decision recorded in the phase plan; a test suite with no "user in 3 workspaces, tasks in 2" case.

**Phase to address:** SUBJ phase (splitting/aggregation decision is intrinsic to the subject-line work) — decide in discuss-phase, pin in plan.

---

### Pitfall 5: Changing the ledger-claim key breaks exactly-once on deploy day — duplicate digests

**What goes wrong:**
Phase 38's digest claim lives in `reminders_sent` (or its sibling) keyed by some composite — likely (workspace, user, date, type) or similar. The per-workspace split and subject change both tempt a key change: adding workspace to the key, adding a "digest v2" type, or keying on (user, date) to support aggregation. Get this wrong on deploy morning and one of two things happens: **every digest user gets a duplicate email** (old key rows don't match the new lookup → the pass re-sends for the same date), or worse, the catch-up logic (Phase 37's `hour >= 9` post-09:00 boot window) re-sends for *yesterday* because the old rows are invisible under the new key shape. Since the scheduler runs in-process on boot, the duplicate fires *immediately* at first deploy — a bad morning for trust in the notification system.

**Why it happens:**
The claim table is the project's exactly-once anchor (REM-01..05, Phase 38 DIGEST claims), but its key was designed for one email shape. Schema-key evolution is invisible to the feature diff.

**How to avoid:**
- **Never mutate the meaning of existing claim rows.** If the key must change, additive-only: new column or new row shape with a migration (standing constraint: additive-only, byte-identical second boot), and a boot-time or send-time guard that treats *either* old-key or new-key presence as "already sent" for the transition day.
- Cleanest option: keep the claim key's *identity* dimension unchanged (whatever identifies "the 09:00 digest for this recipient/date") and treat the split/aggregation purely as *content* changes — if the owner accepts per-user aggregation (Pitfall 4), the claim becomes (user, date, 'digest') for the *new* rows, and the migration backfills today's already-claimed (workspace, user) rows into the new shape, or simply: deploy before 09:00 or accept that deploy day may double-send once, documented in DEPLOY.md.
- Test the transition explicitly: a fixture DB with rows in the old shape, run the pass, assert zero emails. This is a migration-test-shaped test — the repo already has the pattern (`test/migration.test.mjs`).
- Also verify the second-boot guarantee: a boot immediately after a digest send must send nothing (this test likely exists from Phase 38 — it must survive the key change *unmodified*, or be consciously updated).

**Warning signs:** a PR that touches the claim insert *and* the claim lookup in different shapes; no migration test with pre-existing claim rows; deploy notes say nothing about "when to deploy relative to 09:00."

**Phase to address:** SUBJ phase — but flag it in the roadmap as the phase's *riskiest* task, with the transition test as an explicit plan deliverable.

---

### Pitfall 6: Subject-line i18n — RFC 2047 encoding, workspace-name injection, and the wrong-language name

**What goes wrong:**
Three stacked mistakes:
1. **Non-ASCII workspace names break the subject.** `Subject: Acme — Tâches du jour` must be RFC 2047 MIME encoded-word (`=?UTF-8?B?…?=`) or raw UTF-8 with 8BITMIME-aware headers; a hand-rolled SMTP mailer that wrote ASCII subjects so far will happily emit mojibake or a header that some clients render as `???`. The codebase has FR locales and workspace names are user data — non-ASCII is the *common* case, not the edge.
2. **Header injection via workspace name.** A workspace named `Foo\r\nBcc: victim@x` must never reach a header unescaped. The mailer presumably escapes task text in bodies, but subject interpolation of *user-controlled workspace names* is a new sink. Strip CRLF (and long-line fold per RFC 5322's 78-char soft limit) at the single subject-building function.
3. **Localization order.** The subject is per-recipient locale (Phase 36 `tFor` catalogue) — the pattern "Project Name — Task Name" and "Workspace — Digest" must be built through the catalogue so FR gets its punctuation house style (v1.2 decision 11: no-break space before `:`, etc.), and the *workspace name itself* is data, not a catalogue key. Interpolating user data into `t()` templates must go through the existing escape-at-call-site discipline (v1.2 decision 5) adapted to headers.

**Why it happens:**
Subjects have been static/localized-only strings until now ("Due today" etc. via `tFor`); interpolating dynamic user data into a *header* (not a body) is genuinely new for this mailer.

**How to avoid:**
- One `buildDigestSubject(workspaceName, locale)` (or multi-workspace variant) function: `tFor` template + name interpolation + CRLF strip + RFC 2047 encode + fold. Unit-test it with an emoji workspace name, a 200-char name, a name containing `é` and `—`, and a name with embedded `\r\n`.
- Encode-words only when needed (pure-ASCII names stay readable) — cosmetic, but keeps Gmail's subject snippets clean.
- The "Project Name — Task Name" task line is *body* content, so it escapes HTML but needs no RFC 2047 — but the same CRLF discipline applies to any future header it migrates into (e.g. per-project List-ID).

**Warning signs:** `subject:` built by string concatenation at the send call site; no test with non-ASCII workspace names; the mailer has no encode-word helper.

**Phase to address:** SUBJ phase — the encoding helper + tests are its first plan task; localization keys ride the existing i18n gate (i18n-scan).

---

### Pitfall 7: Task-line "Project Name — Task Name" leaks private / scope-restricted project names to digest recipients

**What goes wrong:**
The digest task lines currently show task names only. Adding the project name re-introduces exactly the class of leak v1.8 CR-01 fixed: a recipient who cannot read a project (private project, team-scoped project they're not in — the `hiddenFor()` / `memberCanReadProject` funnel from Phases 29/32) now sees the project's *name* in their own email. Wait — if they can't read it, how are they getting the task line at all? Because the digest grouping query may be built from the *send-time scope filter* (correct) or from a cached/precomputed list (leaky), and because the *assignment* itself can outlive the restriction: a user assigned to a task in a project that later goes private (or gets moved to a team they leave) should not just lose the project name — they arguably shouldn't be listed as still-on-the-hook in a project they can no longer see. The name leak is the visible symptom; the deeper question is whether the task line should appear at all.

Also note the inverse leak direction: with per-workspace splitting, a **guest collaborator** (viewer + exactly one project, Phase 29) whose digest covers only their one project must not receive a subject/email hinting at other projects' existence.

**Why it happens:**
The reminder pass already filters sends through `memberCanReadProject` (Phase 32), so the temptation is "we're already scoped." But scoping was proven for *send/no-send* decisions, not for *per-line content enrichment*, and the new aggregation query is new code that must re-enter the same funnel rather than read the doc directly.

**How to avoid:**
- Every task line's project name is resolved *through* `memberCanReadProject`/`hiddenFor` at line-build time — same funnel, same helper, zero new authorization logic. If the member can't read the project, either omit the line or render without the project name — pick one policy and owner-validate it (recommended: omit the project prefix; the task is still the user's).
- Add the "task became invisible since last pass" case to tests: assignment survives, project goes private/team-scoped → line drops or degrades; never a crash, never a leak.
- Reuse, don't fork: if the digest aggregation query can't express the funnel, fetch the candidate lines broadly then filter lines through the shared helper — keep one authorization funnel (the project's own architecture decision from v1.7 VIS work).

**Warning signs:** a new SQL join fetching `projects.name` without a subsequent funnel check; tests only cover "member can read everything" fixtures; no guest-collaborator digest test.

**Phase to address:** SUBJ phase — but this deserves a named security check in the phase (CR-class), verified with a private-project + guest fixture.

---

### Pitfall 8: Unsubscribe URL (bearer token) leaking into logs, error trackers, and referrer-free-but-shared places

**What goes wrong:**
The one-click capability URL is a bearer credential. Common leak paths in this codebase's shape:
- **Request logging:** the server logs paths (likely for debugging); `POST /api/unsubscribe/<token>` puts the token in every log line, which then lands in `docker logs`, Traefik access logs, and any copy-pasted support output.
- **Error reporting / assertion messages:** an idempotency bug logged with the full URL persists the token.
- **The email body itself** is fine (that's its purpose), but the *GET fallback landing page* renders the URL in the address bar where a user might copy it into a bug report — acceptable, but don't *also* print it in page text/toasts.
- Token in the **activity log**: the app has an audited operator trail (Phase 24) — an "unsubscribed via one-click" audit row must record user + workspace, never the token.

**Why it happens:**
Existing routes take IDs in paths and are logged uniformly; the token route gets the same treatment.

**How to avoid:**
- Scrub the unsubscribe path pattern from request logging (replace token with `[redacted]`), same as session-cookie discipline.
- Tokens stored **hashed** (scrypt/sha-256 like recovery codes) so a DB read or backup leak doesn't yield live unsubscribe capability.
- Rotate per send (recompute token at each digest, replacing the old) so a leaked token from an old email dies at the next 09:00.
- Log only the outcome: `digest_unsub one-click user=… ws=…` verb, consistent with the Phase 24 machine-verb activity model.

**Warning signs:** grep the log helper for the unsubscribe route prefix and find no scrub; tokens stored plaintext.

**Phase to address:** UNSUB phase — security contract item, pinned by a test that triggers the route and asserts no raw token in captured logs.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse `reminders_sent` with a reshaped key, no migration test | Fast implementation | Duplicate digests on deploy day; erodes the exactly-once guarantee everywhere | Never — the transition test is cheap |
| GET-based unsubscribe "for simplicity" | No POST handling in the hand-rolled server | Scanner prefetch unsubscribes users; RFC 8058 non-compliant; providers penalize | Never |
| Token = user id + email + shared secret (deterministic) | No DB table for tokens | Secret rotation un-burns old tokens; timing-safe comparison easy to get wrong | Only if persisted per-user with rotation — but random hashed tokens are strictly better |
| Per-workspace email loop inside the pass, no aggregation decision | One commit | N emails/user/day; contradicts the milestone thesis; users disable digests entirely | Never without an owner-validated D-decision |
| RFC 2047 encoding only "when the name has accents" via naive regex | Small code | Emoji/CJK names mojibake; hand-rolled regex misses combined cases | Never — use `Buffer`-based base64 encode-words unconditionally for non-pure-ASCII |
| One-click added to all email types "while we're at it" | Feels complete | Each type needs its own token/pref semantics; scope explosion against the trim goal | Never in this milestone; digest only |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Gmail / Microsoft bulk-sender rules | Assuming one-click is optional decoration; or omitting the https requirement | `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` with an https URL on the digest; providers honor POSTs to it server-to-server |
| Hand-rolled SMTP mailer | Writing headers without folding/encoding; CRLF injection via interpolated names | Single subject-builder with RFC 2047 encode + CRLF strip + line-length fold; test with hostile names |
| In-process scheduler + boot catch-up | Deploying mid-morning → catch-up window (`hour >= 9`) re-runs against a changed claim key → dupes | Ship the claim transition test; document deploy-before-09:00 in DEPLOY.md if the transition can't be made airtight |
| Per-(workspace,user) `notif_prefs` | Reading `email_digest` once per user and applying globally (or vice versa) | Pref stays per-workspace; suppression of individual reminders stays "digest on in ANY of the user's workspaces ⇒ no individual reminder for that user's tasks" — assert it in tests |
| Mailbox-provider retries | Token burn + 410 on replay | Convergent idempotent unsubscribe; identical generic responses for every state |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 funnel checks per digest line (per-line `memberCanReadProject` re-querying the doc) | 09:00 pass slows; event-loop blocked on a workspace with many digest users | Resolve visibility per (user, project) pair once per pass into a small Map; the funnel helper stays the source of truth | ~50+ users/workspace — early for this app's scale, but the pass is also handling reminders |
| Per-workspace-per-user emails inside a single synchronous tick | Mailer SMTP latency serializes; the unref'd tick overruns its window | Keep sends fire-and-forget per existing mailer pattern; aggregate first, send second | Multiple workspaces × digest users |
| Recomputing RFC 2047 encode per line | Trivial CPU waste but no risk | Encode once per email | Cosmetic |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unauthenticated unsubscribe keyed by user id / email | Anyone unsubscribes anyone; enumeration | Random 256-bit per-user-workspace token, stored hashed, no PII in URL |
| GET mutates state on the token URL | Scanner prefetch = silent opt-out | POST-only mutation; GET = localized no-op confirmation page |
| Workspace name into subject header unescaped | Header injection (Bcc smuggling), mojibake | CRLF strip + RFC 2047 encode at one function |
| Token in request logs / activity rows | Bearer credential in docker logs, backups | Log-path scrubbing + hashed storage + rotate-on-send |
| Project names enriched into lines outside `hiddenFor()` | Private/team-scoped project name leak (CR-01 class) | Route every line's name through `memberCanReadProject`; guest fixture test |
| Response distinguishes valid vs stale token | Existence oracle on unsubscribe capability | Identical generic response body/status for all outcomes |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Unsubscribe = nuclear (kills all notification prefs) | User wanted fewer emails, loses inbox rows too | One-click toggles `email_digest` only; other channels untouched per Phase 38 model |
| Multi-workspace split: identical-looking emails with different content | User can't tell which workspace an email is about; mass-delete everything | Subject carries workspace name; footer states which workspace(s) the email covers and which unsubscribe it performs |
| No visible unsubscribe except the RFC header | Users in clients that hide headers can't leave | Plain-text footer link (GET confirmation page) alongside the one-click header — the Phase 39 "plain header" baseline already implies this; keep the footer link |
| Digest arrives after user already worked (post-09:00 catch-up) | Duplicate-feeling email | Already handled by the claim; don't let the refactor break it |

## "Looks Done But Isn't" Checklist

- [ ] **One-click headers:** both headers present, https URL, exact `List-Unsubscribe=One-Click` value, on the digest email only — verify by asserting on the raw RFC 822 output in a test
- [ ] **Unsubscribe endpoint:** unauthenticated POST works, GET is a no-op, replay is a no-op success, stale token indistinguishable from fresh — 4-case test matrix
- [ ] **Suppression invariant:** digest-on-in-one-workspace suppresses individual reminders across *all* the user's workspaces — regression test from Phase 38 must pass unmodified
- [ ] **Deploy-day exactly-once:** fixture DB with pre-existing old-shape claim rows → pass sends zero emails
- [ ] **Subject encoding:** emoji / accented / CRLF / 200-char workspace names — 4 subject unit tests
- [ ] **FR house style in subject:** no-break spaces and catalogue-driven word order verified by the i18n gate
- [ ] **Project-name scoping:** private-project, team-scoped, and guest-collaborator fixtures — line omission (or degradation) proven
- [ ] **Token hygiene:** hashed at rest, redacted in logs, rotated per send
- [ ] **Multi-workspace aggregation:** user in 3 workspaces with tasks in 2 → exactly the owner-validated email count (1 or 2 per D-decision), never 3, never 0
- [ ] **Second boot byte-identical:** migration test green with the new claim/unsub tables

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate digests on deploy day | LOW | The claim table says who got one; suppress the immediate re-send, post a CHANGELOG known-issue, fix key before next 09:00 |
| Silent mass unsubscriptions (scanner/GET bug) | MEDIUM | Affected users identified from the unsub audit rows; re-enable `email_digest` via a one-off script + notify; fix mutation-method bug first |
| Non-https / malformed one-click URL in the wild | LOW | Old emails already sent carry the bad URL; fix the builder; old tokens expire on rotation |
| Project-name leak in sent digests | MEDIUM | Can't unsend; audit scope (which users, which projects), owner notification, fix funnel usage; add the fixture test |
| Mojibake subjects | LOW | Fix encoder; emails are ephemeral — no data damage |
| Token leak into logs | LOW | Rotation-on-send kills old tokens at next pass; scrub logs; hash storage before next deploy |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — https one-click URL | UNSUB | Raw-header unit test: https + exact `-Post` value |
| 2 — No-cookie POST, scanner prefetch | UNSUB (security contract first) | Unauthenticated-POST + GET-noop tests; threat list like Phase 30's |
| 3 — Replay/idempotency semantics | UNSUB | POST×3 identical result; generic stale-token response |
| 4 — Email multiplication vs Notification Sanity | SUBJ (discuss-phase D-decision) | "3 workspaces, 2 with tasks" fixture asserting validated count |
| 5 — Claim-key transition dupes | SUBJ (flagged riskiest task) | Old-shape-rows fixture → zero sends; Phase 38 second-boot test unmodified |
| 6 — Subject RFC 2047 / injection / i18n order | SUBJ | 4 hostile-name subject tests; i18n-scan gate |
| 7 — Project-name leak (CR-01 class) | SUBJ | Private + team-scoped + guest fixtures; funnel used, not forked |
| 8 — Token leak in logs | UNSUB | Captured-log assertion shows redacted token; hashed-at-rest check |

## Sources

- RFC 8058 (One-Click Unsubscribe): https URI requirement, POST semantics, `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header value, opt-out-on-receipt — HIGH
- Gmail Email Sender Guidelines / Postmaster Tools (bulk sender one-click compliance requirements) and Microsoft Outlook junk-mail reporting interop — HIGH
- RFC 2047 (MIME encoded-words) and RFC 5322 (header folding, 78-char lines) — HIGH
- Project-local evidence: Phase 27/37/38 reminder & digest claim architecture, Phase 29/32 `hiddenFor`/`memberCanReadProject` funnel and send-time scope filtering, Phase 39 notification-audit RFC 8058 deferral decision, v1.8 CR-01 leak class, Phase 34 per-(workspace,user) prefs model — HIGH
- Scanner/link-prefetch behavior (SafeLinks, Google image/link proxying) — MEDIUM (documented vendor behaviors, exact prefetch-of-POST semantics vary)

---
*Pitfalls research for: digest workspace-splitting + RFC 8058 one-click unsubscribe in Projects Studio*
*Researched: 2026-11-05*
