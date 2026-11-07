# Pitfalls Research — Replacing Team-Derived Visibility with Project-Level Permissions (v2.0)

**Domain:** Permission-model replacement in a live multi-tenant PM workspace (Projects Studio v2.0)
**Researched:** 2026-11-07
**Confidence:** HIGH — grounded in this codebase's documented funnel architecture (`hiddenFor()`, `memberCanReadProject`, `projectScope`, D-03, 404-matrix tests, reminder/digest/email/MCP consumers) rather than generic advice. These are the specific traps this codebase invites.

---

## Critical Pitfalls

### Pitfall 1: Orphaned access paths — a second consumer still calls the old model

**What goes wrong:**
The v1.7/v1.10 work established a *single* read funnel (`hiddenFor()` via `memberCanReadProject`) deliberately adopted by the reminder pass, email mirror, and digest. When the model changes, the danger is not that the funnel changes — it is that some consumer bypasses the funnel or keeps an old assumption cached in its own code. Classic failure: the digest or reminder pass still computes "in scope" from the Phase 29 scope columns (D-03 inversion) or from `project.teams ∩ member.teams` directly, so a reminder email leaks a task in a private project the recipient can no longer read — or silently *drops* notifications for a project the recipient CAN read (leak one direction, silent data loss the other; both are defects, the drop is quieter and rots longer).

**Why it happens:**
`inScopeProject` (Phase 40 digest) and `memberCanReadProject` are separate helpers with overlapping semantics. When you rewrite one, grep-hits on the other look like "already handled." The MCP server (35 tools, Phase 46) was built on "same permission funnel as UI/API" — but each tool resolves lists independently, and a tool that pages or projects rows (`list_tasks`, activity reads, file metadata) can hold a pre-redaction row set before the funnel runs.

**How to avoid:**
1. Make the swap inside `memberCanReadProject` ONLY — the new model (private → explicit invitees ∪ teams-as-invitees ∪ creator/lead; non-private → workspace-visible) must be expressed as a new body of the same helper, not a parallel `canSeeProjectV2`.
2. Before starting, produce an exhaustive call-site census of: `memberCanReadProject`, `hiddenFor`, `projectScope`, `inScopeProject`, `redactDoc`, `mergeClientDoc` — every file:line, committed to the phase plan. Phase 39's audit doc did this for notifications; repeat the exercise for visibility.
3. The 404-matrix per endpoint family must gain new rows for the new model BEFORE the implementation phase writes code (test-first matrix extension) — see Test Strategy below.

**Warning signs:**
- Any diff that touches visibility without touching at least one of reminder/digest/email-mirror/MCP tests.
- A digest fixture that passes with zero recipient-filtering assertions changed.
- grep still finds `project.teams` or scope-column reads outside `memberCanReadProject` after the swap.

**Phase to address:** Funnel phase (the phase that rewrites `memberCanReadProject`). The census is its first task; the 404-matrix extension its second.

---

### Pitfall 2: D-03 scope columns and team-derived visibility left half-dead — two competing truths

**What goes wrong:**
M-05 says the new model "replaces" both team-derived visibility AND the D-03 scope columns *as the primary model*. The trap: degrading D-03 to "no longer consulted" without deciding what happens to the *stored data*. Existing `team_members` rows carry scope columns; existing private projects carry `teams[]` arrays and per-member scopes written under the old semantics (scope OPENS private projects — the inverse of the new "private = explicit invitees only" read). If the new reader interprets old rows literally, a team that was granted scope under D-03 (which *opened* a private project) may or may not count as "invited" — the two models disagree about what a scope grant means. Silent privilege change either way: access gained that no admin intended, or access lost with no email and no UI trace.

**Why it happens:**
"Replace the model" is read as "change the predicate." It should be read as "change the predicate AND converge stored state so the predicate reads the truth." Scope columns were also *invite-carried* (Phase 29) and editable in the member modal — UI surfaces for them still exist at swap time.

**How to avoid:**
1. Explicitly decide (owner-validated, as with D-03 in v1.6) the migration rule: e.g. "a Phase-29 scope grant on a private project converts to an explicit project-membership/invitee row" or "scope columns become read-only projections, deleted in a later sweep." Write it as a named decision (D-xx) in PROJECT.md before the migration phase plans.
2. Migration must be additive and guarded per the standing invariant: pre-backup, transactional, **byte-identical second boot** — the `migrateTotpReWrap()` / SETTINGS-01 pattern is the house style; copy it, including the loud-deferral path when a precondition is missing.
3. Boot sweep for legacy shapes is proven here (Phase 33's "extinct in stored data" update-only sweep) — use the same pattern for stale scope semantics.
4. Test the pg variant too: pg rows carry bigint epochs; the copy script and pg schema must both survive the migration (multi-backend matrix — see Test Strategy).

**Warning signs:**
- A migration phase plan with no owner-validated decision id for scope-column disposition.
- Tests that assert old-scope behavior still pass unchanged after the "swap" (means nothing actually converged).
- Second boot produces a diff (any byte) — migration not idempotent.

**Phase to address:** Migration phase (data convergence + decision D-xx). The UI phase must not ship member-modal scope editing until the decision lands.

---

### Pitfall 3: Guest model collapse — "exactly one project" breaks silently

**What goes wrong:**
Today a guest is `viewer + exactly one project`. The new model removes the "Invité externe" toggle (M-04) and makes guests per-project invitees with the per-project member-invite-guest toggle (M-06). Traps:
- **Old guests with zero or >1 project:** a guest whose single project becomes public, or whose project membership is removed, becomes a guest with *no* project — an undefined state. Today the invariant is structural; after the swap it must be re-derived or the account must be converted (to member? suspended?).
- **Toggle drift:** per-project "members may invite guests" defaults — a project created before the toggle exists has no stored value; default-allow vs default-deny silently changes who can invite on legacy projects.
- **Guest editing after invite (M-02):** "everything editable post-invite" interacts with guests — changing a guest's project must revoke access to the old one in the same transaction, or the redaction funnel briefly (or forever) trusts a stale row.
- **Invite hierarchy enforcement:** members can invite guests *only where the project allows* — the check must run at invite-creation AND at accept time (invite accepted later, after the toggle flips to deny → must fail closed, matching the v1.7 HARD-01..05 fail-closed invite twins).

**Why it happens:**
Guests are a *cross-project* invariant living in per-project data after the swap. Every invariant that spans rows needs a migration check plus a boot-time validator, not just a route guard.

**How to avoid:**
1. Boot sweep classifying existing guests: exactly-one-project → convert to new guest shape; zero-project → convert or flag loudly (never silently delete access).
2. Decide and pin the default value of the member-invite-guest toggle for pre-existing and new projects (owner decision, like the rest of M-01..M-08).
3. Re-validate guest state at accept-time and at every role/scope edit (M-02): the edit route re-checks the invite hierarchy, not just the create route.
4. Extend the 404-matrix with guest rows: guest reads second project → byte-identical 404; guest after project-reassignment → old project 404s.

**Warning signs:**
- Any test suite with no guest-with-zero-projects fixture.
- Invite-accept route unchanged while invite-create route changed (half-enforced hierarchy).
- Toggle absence treated as `true` by default without a written decision.

**Phase to address:** Migration phase (state conversion) + funnel phase (accept-time re-validation). UI phase owns the toggle surfaces and EN+FR keys.

---

### Pitfall 4: Invite-in-flight during the model swap

**What goes wrong:**
Invites carry scope today (Phase 29 `invite-carried scope`). An invite created under the old model, accepted after the new model ships, must land in the *new* model — but the stored invite row was written under old semantics. Failure modes: a workspace-level invite that carried team-sharing or scope now confers project access nobody re-approved; an admin "link-only invite" (made impossible at creation in Phase 33, harmless at accept, swept to extinction) resurfaces as a viable path; the guest toggle flips between create and accept and the accept honors the stale permission.

**Why it happens:**
Accept routes were hardened to fail closed (Phase 33) precisely because invites are *stored permission promises*. Model swaps invalidate promises; accept-time code that trusts the row rather than re-deriving from current state ships the stale promise.

**How to avoid:**
1. Accept-time re-derivation rule: at accept, evaluate the invite against *current* project/workspace state under the new model; deny (410, matching the HARD twins) when the promised shape no longer exists.
2. Boot sweep migrating in-flight invites to the new schema in the same additive migration as the scope convergence (Pitfall 2) — one migration, one backup, one idempotence proof.
3. Test the interleaving explicitly: create invite → run migration → accept → assert new-model outcome; and the reverse order.

**Warning signs:**
- Accept route diffs limited to a role-mapping rename.
- No test covers "invite created pre-swap, accepted post-swap."

**Phase to address:** Migration phase (row conversion), verified inside the funnel phase with interleaving tests.

---

### Pitfall 5: Client store caches roster/visibility — UI shows ghosts after the swap

**What goes wrong:**
The client keeps workspace documents with optimistic concurrency (`revision`, `redactDoc`/`mergeClientDoc` round-trips). After the swap, three stale-cache surfaces appear:
- **Ghost projects:** a project that just went private still renders for a non-invitee until the next full doc fetch; clicks hit 404s mid-session.
- **Ghost access:** the transparency view (M-08) computed client-side from a cached doc can show *more* than the server would send — the transparency view must be server-computed or it lies, and a lying transparency view is worse than none (admins make revocation decisions from it).
- **Roster drift:** project member lists (now invitee lists + teams-as-bulk-invitees) cached in the client store show removed members; the share modal offers teams that are no longer invitees.

**Why it happens:**
Redaction is server-side, but *staleness* is client-side. The mid-session 401 teardown (Phase 14) handles auth loss; nothing handles "your visibility changed under you." `mergeClientDoc` restores access fields it can't see — correct for write-merging, but it means the client never learns a project vanished unless the server explicitly sends its absence.

**How to avoid:**
1. Server pushes (PUSH-01..03 infrastructure exists) or 30s polling must carry a cheap visibility-version/epoch per workspace; client refetches the doc when it changes. A per-workspace `visibility_epoch` bumped by any permission-affecting write is zero-dependency and matches the house style.
2. 404 handling on project deep-links must route to a localized "no longer available" state, not a dead toast — mirrors the v1.5 localized not-found toast pattern.
3. Transparency view (M-08) is server-computed: one endpoint returning exactly the visible set for a member, built by calling `memberCanReadProject` — never derived client-side. This also makes it the human-readable oracle for the 404-matrix (the view and the 404s must agree by construction, same helper).
4. Removing the Settings > Permissions page (M-06): sweep client code, palette commands, and i18n keys for the removed surface — the i18n-scan build gate will catch orphaned *new* keys, not orphaned *removed* pages; add a leak check for the removed strings.

**Warning signs:**
- Transparency view rendered from client state.
- No epoch/version in the doc payload.
- Chromium tests only cover fresh-load, never "permission changed in another tab/session."

**Phase to address:** UI phase (staleness handling, transparency endpoint, permissions-page removal). The epoch bump belongs to the funnel phase (bump on every permission write).

---

### Pitfall 6: The 404-matrix regresses into a tautology

**What goes wrong:**
The 404-matrix tests (Phase 29/32) prove "no existence oracle" — byte-identical 404s for unauthorized and nonexistent. Two failure modes during the swap:
- **Tautology:** the matrix is rewritten to use `memberCanReadProject` itself as the oracle — now the tests assert the implementation agrees with itself and can never catch a leak. The matrix must encode the *model* (who should see what) independently of the code under test.
- **Incomplete families:** 35 MCP tools are endpoint families too. The original matrix covered HTTP families; MCP tools resolve lists through the same funnel but a matrix row per MCP tool is easy to skip ("it goes through the funnel") — exactly the assumption Pitfall 1 warns against. Also: the file-serve side door (Phase 29 byte-identical `fileNotFound`) is its own family and must gain new-model rows.

**Why it happens:**
Matrix tests are expensive to extend; the shortcut is "the funnel is shared, one family proves it." That is true only if every consumer calls the funnel *unconditionally*, which is the thing being tested.

**How to avoid:**
1. Extend the matrix BEFORE implementation with a table of (actor shape × project shape × expected visibility) where actor/project shapes are the new model's: explicit invitee, team-invitee, guest via allowed toggle, guest via denied toggle, member on public, member on private, admin/owner, removed invitee, SSO JIT bare account (no role — must see nothing).
2. One row per MCP tool family, at least for list/read tools; assert byte-identical empty-result/404 bodies, not just status.
3. Keep 404 bodies byte-identical — assert body equality, not just status codes; the existing named-404-per-family tests make this cheap to extend.
4. Add EN+FR parity to nothing here (no user-visible copy in 404 bodies) — but the "no longer available" UI state from Pitfall 5 does need both locales; the i18n-scan gate covers it only if keys are added, not strings.

**Warning signs:**
- Matrix diffs that reduce row count or replace expected values with `memberCanReadProject(...)` output.
- No MCP tool in any 404/empty test after the swap.

**Phase to address:** Funnel phase (matrix extension is its definition-of-done), written before implementation code.

---

### Pitfall 7: Zero-dependency scheduler reads permissions outside a transaction — torn notification passes

**What goes wrong:**
The reminder pass and digest are scheduled, batched, transactional-exactly-once (`reminders_sent` claims). During (or after) the swap, a pass that reads project visibility across many projects in one tick can observe torn state: migration partially applied, a toggle flipped mid-scan, a bulk team invite half-committed. Consequences: duplicate or missing notifications, or a digest built against pre-swap visibility. The no-double-send and post-09:00 catch-up invariants (Phase 37/38) must survive unmodified — a torn pass that claims-and-fails burns the exactly-once slot.

**Why it happens:**
The scheduler's correctness story is per-claim, not per-view. The new model adds more per-project state consulted per recipient, widening the read set inside a pass.

**How to avoid:**
1. Snapshot the visibility decision per (recipient, project) once per pass — resolve `memberCanReadProject` at claim time inside the same transaction as the claim, exactly as the digest already resolves names strictly after `inScopeProject` + `memberCanReadProject` (Phase 40 D-05/D-06 pattern — preserve that ordering verbatim).
2. Migration must be transactional per its own guard so a pass never observes half-migrated rows (the guarded-additive invariant already demands this — test it with a pass running concurrently in the multi-backend matrix).
3. Keep the Phase 38 suppression invariant tests green unmodified — they are the canary; if they need changes beyond recipient-source updates, the pass architecture drifted.

**Warning signs:**
- Reminder/digest tests needing new ordering or new transactions to pass.
- A pass that resolves visibility before claiming.

**Phase to address:** Funnel phase (with the consumers), verified in the migration phase's concurrency tests.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Parallel `canReadV2` next to old helper | No risk to old paths during dev | Two funnels diverge; consumers pick the wrong one; leaks | Never — swap in place inside `memberCanReadProject` |
| Leaving Phase 29 scope columns readable but ignored | No migration risk | Stored state disagrees with access decisions; future contributor "fixes" it in either direction | Only with a written D-xx decision + boot sweep plan |
| Client-side transparency view | No new endpoint | View lies about access; admins revoke on bad data | Never |
| Default-allow on the new member-invite-guest toggle for legacy projects | One less migration column | Legacy projects change who can invite, silently | Only if owner-validated as the intended default (M-06 gap) |
| Skipping per-MCP-tool matrix rows ("same funnel") | Cheaper tests | One bypassing tool = leak with no test | Never for read/list tools |
| Deleting old `project.teams` arrays at swap | Cleaner model | Undo/history (delTeam undo pattern) and audit lose context | Never — additive; sweep only when proven extinct (Phase 33 pattern) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Reminder pass | Re-deriving visibility from scope columns/teams instead of calling the helper | Resolve strictly after (and via) `memberCanReadProject` inside the claim transaction (Phase 40 ordering) |
| Digest | Project-name resolution before the visibility filter (`|| ''` masking a leak) | Preserve the D-05/D-06 strict ordering; the `|| ''` is snapshot defense, not a substitute for the filter |
| Email mirror / inbox rows | Writing notif rows for recipients who cannot read the project | Recipient set computed through the funnel at write time; keyed rows render post-hoc but recipient selection must be current |
| MCP (35 tools) | Treating "same funnel" as automatic | Census each tool's row-resolution path; add matrix rows per read/list tool |
| Client doc sync | Assuming redaction-on-read implies freshness | Add a visibility epoch; refetch on change; localized not-found for ghosts |
| pg backend | Migrating SQLite only | Migration + sweeps + matrix run under both backends (`POSTGRES_TEST_URL` matrix; bigint epoch columns) |
| i18n gate | Adding EN keys, FR "later" | i18n-scan gate fails the build — new toggle/share/transparency strings land EN+FR together, server notif keys included (Phase 36 parity gate) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-user × per-project visibility queries without index on invitee rows | Slow digest at 09:00 for all workspaces at once | Invitee/permission tables indexed on (project_id, user_id); resolve in batched queries per pass | Hundreds of invitees × many private projects |
| Transparency view recomputing full doc redaction per member | Slow member-inspection UI | Compute visible-set directly from invitee rows; only render redacted doc on demand | Member lists > ~100 |
| Visibility epoch refetch storms | Every permission write triggers all clients refetching | Coalesce epoch bumps per write; clients debounce refetch | Busy workspaces with many concurrent editors |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Public toggle meaning "workspace-visible" but code treating it as "anyone with URL" | Data exposure beyond tenant | Keep tenant boundary (`requireWorkspace`) untouched; public = workspace members only — pin with test |
| Existence oracle via timing or differing bodies on new routes (share options, transparency) | Enumerating private projects | Byte-identical 404s on every new route; matrix rows for them |
| Bulk team invite granting more than intended (team later gains members) | Access creep — new team members inherit project access silently | Decide and document: team-as-invitee is live membership (per M-03); warn in share UI; transparency view shows team-sourced access explicitly |
| Stale API keys after guest conversion | MCP key retains access to project it lost | Key resolution re-runs the funnel per call (it already must) — add a matrix test: guest loses project → MCP tool 404s with same key |
| Guest role escalation via M-02 post-invite edits | Guest edited into member where toggle denied | Edit route re-checks invite hierarchy with current toggle state, fail-closed |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Members lose access with zero explanation (team-derived → explicit) | Confusion, support load, "the app is broken" | Migration report per workspace; admins see who lost what; transparency view ready at switch |
| Share modal still offering team-derived language ("teams on this project") | Users expect old semantics | Copy reflects invite semantics ("invite this team to this project"); EN+FR |
| Settings > Permissions removed but referenced in docs/onboarding | Dead links | DEPLOY.md/README sweep; palette commands removed |
| Ghost project links from old notifications/emails | 404 on click, feels like data loss | Localized "no longer available" landing state (v1.5 pattern) |

## "Looks Done But Isn't" Checklist

- [ ] **Funnel swap:** every consumer re-verified — grep census shows zero `project.teams`/scope reads outside the helper — verify with committed census doc
- [ ] **Migration:** second boot byte-identical, both backends — run migration.test.mjs extended for pg
- [ ] **Guests:** zero-project guest state impossible or loudly flagged — boot validator test
- [ ] **Invites in flight:** created-pre-swap invite accepted post-swap lands in new model — interleaving test
- [ ] **MCP:** all 35 tools resolve through new funnel; read/list tools have matrix rows — per-tool test
- [ ] **Transparency view:** server-computed via `memberCanReadProject`; agrees with 404-matrix by construction
- [ ] **Scheduler:** Phase 37/38 no-double-send + suppression invariants pass unmodified
- [ ] **i18n:** every new key EN+FR, server notif keys included; removed Permissions-page keys swept
- [ ] **404 bodies:** byte-identical asserted (body equality, not status) on all new routes
- [ ] **Client staleness:** visibility epoch + refetch; cross-session permission-change Chromium test
- [ ] **Team bulk invite:** later-added team members gain access per M-03 — pinned by test
- [ ] **Member-invite-guest toggle:** enforced at create AND accept; fail-closed after flip

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Leaked access via bypassing consumer | MEDIUM | Fix consumer to call helper; add matrix row; audit notif rows sent (they are keyed/logged) and notify affected users if needed |
| Lost access after swap (silent drop) | MEDIUM | Additive migration re-grants from backup-derived mapping; the pre-migration backup (standing invariant) is the recovery artifact |
| Non-idempotent migration discovered in prod | HIGH | Restore from vacuum-into backup; fix; re-run — this is why the backup precedes first write |
| Client ghost state reported by users | LOW | Ship epoch/refetch; no data harm, cosmetic |
| Torn scheduler pass / burned claim | MEDIUM | `reminders_sent` claim is transactional — un-claim in a repair script scoped to the affected window; Phase 37 catch-up re-sends |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Orphaned access paths | Funnel phase | Consumer census committed; zero out-of-funnel reads; per-MCP-tool matrix rows |
| 2 Scope/teams half-dead data | Migration phase | D-xx decision logged; boot sweep; second-boot byte-identical on SQLite + pg |
| 3 Guest model collapse | Migration + funnel | Boot guest validator; guest matrix rows; create+accept hierarchy tests |
| 4 Invites in flight | Migration (data) + funnel (tests) | Interleaving tests; fail-closed accept re-derivation |
| 5 Client staleness / lying transparency | UI phase (endpoint in funnel phase) | Server-computed transparency agrees with matrix; epoch refetch Chromium test; i18n sweep |
| 6 404-matrix tautology | Funnel phase | Matrix extended BEFORE implementation; expected values independent of code under test |
| 7 Torn scheduler passes | Funnel phase, concurrency-tested in migration phase | Phase 37/38 invariants unmodified; concurrent-pass test in both backends |

## Suggested test strategy (for the roadmap)

- **404-matrix extension first:** new (actor × project) shape table covering invitee, team-invitee, guest (toggle allow/deny), public/private, removed invitee, JIT bare account, admin/owner; assert body-byte equality; add rows for every new route (share options, transparency) and per-MCP read/list tool.
- **Multi-backend matrix:** every migration, sweep, and scheduler-concurrency test runs under both SQLite and `POSTGRES_TEST_URL`; second-boot byte-identity asserted per backend.
- **Interleaving tests:** invite create → migrate → accept; toggle flip → accept; team join after bulk invite.
- **Consumer canaries:** Phase 37/38 invariant tests must pass unmodified; Phase 40 digest-ordering pins must pass unmodified.
- **Full suite:** ~1133 tests green stands; new suites push count up but skipped count must not grow.

## Sources

- `.planning/PROJECT.md` — funnel architecture, D-03, Phase 29/32/33/37/38/40/45/46/48 ground truth, M-01..M-08 decisions (HIGH, first-party)
- House patterns cited from shipped phases: guarded additive migration (SETTINGS-01, TEAM-01), boot sweeps (HARD-05), fail-closed invite twins (HARD-01..05), digest ordering (Phase 40 D-05/D-06), 404-matrix (Phase 29/32), pg test matrix (Phase 45)
- No external sources needed — this is a codebase-internal architecture analysis; generic "permission migration" literature adds nothing the first-party funnel facts don't already pin down more precisely.

---
*Pitfalls research for: Projects Studio v2.0 — project-level permissions & invitations*
*Researched: 2026-11-07*
