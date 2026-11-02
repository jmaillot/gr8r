# Pitfalls Research — v1.7 Team Visibility & Hardening

**Domain:** Self-hosted PM workspace — debt-closure milestone on an existing 803-test suite
**Researched:** 2026-11-02
**Confidence:** HIGH (every pitfall verified against `server.js` at HEAD unless labeled general-practice)

**Verification method:** all code claims below were read from the current tree (`server.js` ~4.9k lines, `src/actions/teams.js`, `test/scope.test.mjs`, `test/migration.test.mjs`, `test/totp-encryption.test.mjs`, `docker-compose.yml`). Line numbers are per-archived-head; they will drift — trust the quoted identifiers.

---

## Critical Pitfalls

### Pitfall VIS-1: Team-derived visibility bypassing the Phase-29 scope funnel (double-visibility OR)

**What goes wrong:**
Team-derived visibility (`project.teams ∩ member.teams ≠ ∅`) is implemented as a *new* predicate bolted beside `hiddenFor()` instead of *inside* it. The result is two code paths that disagree: a route that redacts via the funnel hides a project, while another route (file serve, mentions, reminders, client-emit pre-filter — the Phase-29 send-time surfaces) still uses the old predicate, or vice versa. The Phase-29 contract is that **every** project-touching surface goes through one shared funnel (`projectScope()` server.js:671, `hiddenFor()` server.js:730, `redactDoc()` server.js:861). A second visibility source silently forks that invariant.

**Why it happens:**
`hiddenFor()` currently computes hidden = private-hidden ∪ out-of-scope. The natural-but-wrong edit is to compute team visibility at *call sites* ("can this member see project X?") rather than changing what the funnel counts as hidden.

**How to avoid:**
Extend `hiddenFor()` itself: a project is hidden iff (not workspace-wide-open) ∧ (not team-visible) ∧ (not scope-granted). Respect the **D-03 grant inversion** — scope *opens* private projects, so a scoped grant must still win even when the team intersection is empty; team visibility must never *close* something scope granted. Then re-run the named 404-matrix (test/scope.test.mjs:512 "the named 404-matrix (SCOPE-03)") with new rows for the team-visible combinations.

**Warning signs:**
A test where a project disappears from doc GET but is still assignable, or an out-of-scope by-id request that returns 403 instead of the byte-identical 404 `fileNotFound` (scope.test.mjs:478).

**Phase to address:** VIS phase. Regression surfaces that must stay green: `test/scope.test.mjs` (full 404-matrix, D-03 inversion cases), `test/membership.test.mjs`, `test/due-reminders.test.mjs` (send-time scope filtering).

---

### Pitfall VIS-2: The 404 no-oracle property broken by distinguishable errors

**What goes wrong:**
Team-visibility changes touch the by-id guard path. Two classic breaks: (a) a project that is *known* but team-invisible now answers 403/400 with a descriptive code instead of the identical 404 body — an existence oracle for a non-member probing ids; (b) the file-serve side door returns a *different* 404 (different body or timing) than the unknown-id 404.

**Why it happens:**
The visibility predicate becomes multi-factor (private ∧ teams ∧ scope), and each new `if` branch is a chance to emit a specific error message ("you are not in this project's team").

**How to avoid:**
Keep the invariant "out-of-scope ⇒ exact same 404 as unknown, byte-identical, on every endpoint family." Pin it per family in the 404-matrix, and add the file-serve byte-identical assertion (scope.test.mjs:443, 478) for team-hidden projects specifically.

**Warning signs:** `grep`-ing the diff for any new `fail(res, 403` inside project-touching routes.

**Phase to address:** VIS phase. Regression surfaces: `test/scope.test.mjs`, `test/file-route-ordering.test.mjs`.

---

### Pitfall VIS-3: No-team projects accidentally becoming team-restricted

**What goes wrong:**
The spec: a project with an empty `teams[]` stays **workspace-wide**. A naive `project.teams ∩ member.teams ≠ ∅` check hides every teamless project from everyone except… nobody, breaking every existing workspace where most projects have no team. The inverse bug also exists: a member with **zero** `team_members` rows (e.g. a fresh JIT/SSO account, or the profile-seed "teamless" start — server.js:2207 comment) would see nothing.

**Why it happens:** the intersection predicate is correct only when conditioned on `teams.length > 0` on the project side.

**How to avoid:**
Encode "empty teams ⇒ visible to all members" as the first branch of the predicate, and test it with the SSO JIT account and the pre-migration single-team backfill path (server.js:1693 `TEAM-01` backfill — its guard "inserts only where the user has NO team_members row yet" interacts directly with derived visibility).

**Warning signs:** an upgraded legacy workspace where a long-standing member suddenly sees zero projects.

**Phase to address:** VIS phase. Regression surfaces: `test/scope.test.mjs`, `test/migration.test.mjs` (team_members backfill pins at lines 126/439), SSO tests.

---

### Pitfall UNDO-1: delTeam undo restoring the doc but not the purged `team_members` rows (verified)

**What goes wrong:**
This is the known v1.6 deferred item, verified in `src/actions/teams.js:145-164`: the delete path first purges authority rows server-side (`api.setMemberTeams(x.userId, …filter(id => id !== tm.id))` per affected member), *then* snapshots and mutates the doc. The Undo toast calls `restore(snap)`, which resurrects `doc.teams`, `project.teams` and the client-side `member.teams` arrays — but the server-side `team_members` authority rows are **gone**. The UI then *lies*: rosters, mention fan-out, @team dedup and (post-VIS) project visibility all read the authority rows (server.js:1474 "the team_members join table is the authority"). Every subsequent doc PUT also strips doc-carried membership (server.js:1345 area, TEAM-05/D-02), so the lie self-heals into data loss on the next save.

**Why it happens:** the undo mechanism is a generic client-side `snapshot()/restore()` of the document; authority rows live outside the document and outside the snapshot.

**How to avoid (two honest options — pick one in requirements):**
1. **Make undo real:** server-side delete captures the removed `(workspace_id, team_id, member_id, user_id)` rows; undo issues a compensating batch of `setMemberTeams` re-PUTs. Then guard the classic undo trap: a member who was removed, left the workspace, or was re-invited with a *different* team set between delete and undo must not get stale rows resurrected — reconcile against current `memberships` before re-inserting (`insert or ignore` against live membership ids, never a blind restore of captured rows).
2. **Remove the Undo offer for teams** (`toast.deleted` without the `onAction` in `src/actions/teams.js:164`). Cheaper and honest; matches the PROJECT.md alternative "or removes the misleading Undo offer".

If option 1: also reconcile the **doc snapshot restore** with what the server round-trips — `restore(snap)` must go through the normal PUT so `docFromClient` normalization and revision bumping stay intact, otherwise the next concurrent save 409s.

**Warning signs:** after delete→undo, `select count(*) from team_members where team_id = ?` is 0 while the team page shows members.

**Phase to address:** UNDO phase. Regression surfaces: `test/membership.test.mjs` (teams routes), the TEAM-05 born-green pin, e2e teams flows; add a dedicated "undo restores rows / or no undo offered" test either way.

---

### Pitfall HARD-1: `sameOrigin` on invite-accept breaking legitimate emailed links

**What goes wrong:**
Adding `sameOrigin()` (server.js:2389: passes when no `Origin` header, rejects cross-origin browser POSTs) to `POST /api/invites/:token/accept` can break the *email* journey: a user clicks an invite link in Gmail/Outlook, lands on `/join`, fills the form — the POST carries the app's own origin and is fine. The real break is subtler: (a) behind a proxy with `TRUST_PROXY`, `origin === proto(req)://host` fails when `X-Forwarded-Host`/proto are mis-detected, rejecting every real user (verified pattern: `sameOrigin` already guards ~17 routes and this exact misconfig is the known production failure mode); (b) if the guard is added to the GET of `/join` instead of only the POST, email links opened from webmail send `Origin: https://mail.example.com`… (GETs don't send Origin on navigation, but any fetch/XHR from a *prefetched* or service-worker context might) — an over-broad guard turns "invite link" into "invite 403 with `crossOriginRejected`", leaking to attackers that the token exists.

**Why it happens:** the invite accept route is pre-auth, so it cannot lean on cookies for CSRF and must rely on Origin — but it is also the one route whose entry point is off-site by design.

**How to avoid:**
Guard only the POST (the state-changing step), keep the GET/navigation unguarded, and follow the established "Pitfall 22 order" precedent (server.js:3402 comment: sameOrigin FIRST, before any body read or throttle) so a cross-origin probe gets the same response shape as anything else and never reads the body. Add an e2e test that emulates "click email link → render /join → POST accept" and asserts success, plus a cross-origin POST test asserting rejection. Verify the Traefik deployment forwards Host/proto (DEPLOY.md) or the guard must consult `X-Forwarded-Proto` the same way `proto(req)` does.

**Warning signs:** UAT report "invite link says cross-origin rejected" from behind the production proxy only.

**Phase to address:** HARD phase. Regression surfaces: new invite-accept tests; `test/oidc-sso.test.mjs` (the accept route's sibling invite-reconciliation at server.js:2765-2780 shares the acceptance recipe verbatim — if the guard wraps a shared helper, SSO reconcile must not inherit a browser-only assumption).

---

### Pitfall HARD-2: Removing `firstWorkspace()` fallback strands legacy invites / or keeping it as a tenant-confusion hole

**What goes wrong:**
`firstWorkspace()` (server.js:594: `select * from workspaces order by created_at … limit 1`) is used as a silent fallback in three live places: seed-owner membership (1647), invite backfill (2166, legitimate — pre-tenancy rows), and **invite acceptance** (2773) plus the SSO invite-reconcile (2773/2765 area): `… where id = ?).get(invite.workspace_id) || firstWorkspace()`. The fallback means an invite whose workspace was deleted silently joins the *oldest* workspace — a cross-tenant privilege grant in a multi-workspace install. But naive removal breaks the documented legacy path ("invites created before workspaces were addressable" — server.js:2160 comment): `backfillInvites()` fixes `workspace_id is null` rows, so acceptance of a *backfilled* invite is fine, but any legacy row that somehow skipped backfill would 410 — acceptable — while the SSO reconcile path must not strand a JIT user with a consumed invite either (SSO-07: "never silently stranded").

**Why it happens:** the fallback was written when exactly one workspace existed and survived the v1.1 multi-tenancy sweep.

**How to avoid:**
Acceptance/reconcile: resolve `invite.workspace_id` strictly; on miss return the existing honest `410 workspaceGone` (already the code at 2776 when no workspace at all). Keep `firstWorkspace()` only in `backfillInvites()` and seeding. Audit every remaining call site with `grep -n firstWorkspace server.js` and delete or justify each. Pin with a test: invite → delete workspace → accept ⇒ 410, and *no* membership row anywhere.

**Warning signs:** a user whose membership points at a workspace they were never invited to.

**Phase to address:** HARD phase. Regression surfaces: `test/oidc-sso.test.mjs` (SSO-07 invite reconciliation suite), invite/join e2e, `test/membership.test.mjs`.

---

### Pitfall HARD-3: Guest-profile spoof via client-carried role/profile fields

**What goes wrong:**
The guest model (viewer + exactly one project, server.js:4196 `guestSingleProject`, role clamp at 2380 `if (role === 'guest') return 'viewer'`) is enforced on the membership write path. The spoof risk is the *profile/doc* path: a client PUT whose `data.members[]` or profile payload carries a richer `role`/`perms`/`projects` shape for a guest than the server granted. Phase-29 mitigations already exist (`docFromClient` restores access fields server.js:1330-1338 area; write path strips doc-carried membership per TEAM-05; scope on accept comes only from the invite row per T-29-14 comment at 4348) — the pitfall is *regressing* one of these while touching the accept/profile code for sameOrigin or firstWorkspace, e.g. letting the signup-name/profile payload at accept (4330-4346) also carry role/teams/scope.

**Why it happens:** the accept route reads a free-form JSON body for account creation; any extra field honored there is attacker-controlled.

**How to avoid:**
On the accept route, whitelist exactly `name`, `email`, `password` from the body (it already does — pin it with a test that posts a body containing `role:'owner'`, `teams:[…]`, `scope:{…}` and asserts they are ignored). Keep the scope/role source-of-truth comments (T-29-14) intact when editing.

**Warning signs:** any new `body?.role` / `body?.scope` in the accept or profile path.

**Phase to address:** HARD phase. Regression surfaces: `test/scope.test.mjs` (guest model cases), `test/oidc-sso.test.mjs` (guest-shape rejection, G-30-1).

---

### Pitfall SEARCH-1: The substring redaction leak cuts both ways (verified)

**What goes wrong:**
Verified at server.js:825-854: `hiddenProjectTerms()` collects hidden project **names and keys**; `referencesHidden(term, hiddenTerms)` = hidden-term is a *substring* of the searched term. The leak: a recent search like `"Q4 roadmap Planning"` passes the filter (it *contains* the hidden name as substring — wait, contains ⇒ blocked) — the actual verified leak direction is the *reverse composition*: a term that embeds a hidden project name in a **case/whitespace variant** (`.trim().toLowerCase()` normalizes edges only — internal double spaces, accents, unicode confusable variants) slips through `includes()`; and conversely a legit search for a *visible* project whose name contains a hidden project's name as a substring (e.g. hidden "Atlas", visible "Atlas Backup") is wrongly redacted from the user's own history. Both directions are live because the filter runs on the **workspace-shared** `recentSearches` array (server.js:607, 882, 985).

**Why it happens:** string-contains matching over free text can never be both complete (no leak) and precise (no false positives); the current code is the best-effort `includes()` compromise.

**How to avoid:**
1. Keep the conservative `includes()` for the **leak** direction (never let a hidden-name-containing term in or out) — the false-positive cost is acceptable and must be **documented** (PROJECT.md already says "document the free-text limitation"). 2. Tighten normalization (NFC + accent-fold via the same `Intl` normalization used elsewhere) so case/spacing variants don't bypass. 3. Consider the structural fix if UAT flags it again: make recent searches **per-user** (same treatment as SETTINGS — which removes the shared-surface problem entirely and makes redaction unnecessary). If SETTINGS lands first, evaluate folding SEARCH into it.

**Warning signs:** a UAT where a guest types a hidden project's exact name in search and the term *appears* in history after a second search; or an owner's history losing entries about a visible "Atlas Backup".

**Phase to address:** SEARCH phase (or SETTINGS phase if folded). Regression surfaces: the recent-search redaction tests in `test/scope.test.mjs` (server.js:882/988 behaviors), i18n-search tests for client side.

---

### Pitfall SETTINGS-1: Per-user migration breaking the byte-identical second boot (verified pattern)

**What goes wrong:**
Moving `notifPrefs`/`invoices` out of the shared workspace doc into per-user rows repeats the v1.1 `locale`-column migration (PROJECT.md decision 3-4: "nullable column + client-side PATCH; the server never writes at boot"). Failure modes: (a) the boot backfill *writes* something unconditionally → second boot diverges → `test/migration.test.mjs:418` "a second boot is a no-op" fails; (b) the backfill creates rows for users who never had prefs, or resurrects defaults (all-ON) for legacy docs whose `notifPrefs` lack keys — pinned today by `test/due-reminders.test.mjs:302` "legacy doc whose notifPrefs lack the keys reads all-ON via docForClient"; (c) rows are keyed per-workspace but the doc is shared — a second workspace for the same user must get independent prefs (membership-scoped rows, not user-scoped), otherwise the doc's current workspace-shared semantics silently leak across tenants.

**Why it happens:** `notifPrefs` is read in at least four server places (email gate 1062, reminders gate 1226, normalizeDoc default 633, seed 1585) — missing one read site produces split-brain prefs.

**How to avoid:**
Follow the proven recipe: additive table + guarded one-time backfill with pre-backup + eligible-row guard that makes boot #2 byte-identical (the exact pattern of the team_members backfill, pinned at test/migration.test.mjs:126/439). Route **all four** read sites through one accessor. Keep the legacy all-ON read for docs missing keys. Existing clients that still PUT `data.notifPrefs` in the doc must be handled the way `invoices` is today (server.js:1341 `delete next.data.invoices` — write-path strip) once the field migrates, or a stale client resurrects the doc field and split-brain returns. Decide explicitly: strip-on-write + stop reading, or tolerate-and-ignore.

**Warning signs:** `assert.deepEqual(secondBoot, firstBoot)` failing; a reminder email honoring old prefs after the user changed them.

**Phase to address:** SETTINGS phase. Regression surfaces: `test/migration.test.mjs` (add a notifPrefs/invoices pin), `test/due-reminders.test.mjs`, `test/membership.test.mjs` (notifPrefs flows at lines 633/648/737), i18n-prefs tests.

---

### Pitfall DEPLOY-1: Compose forwarding `MASTER_KEY_PREVIOUS` breaking first boot when unset (verified)

**What goes wrong:**
Verified: `docker-compose.yml:39` forwards only `MASTER_KEY` with `${MASTER_KEY:?…}` (mandatory). Adding `MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS}` naively injects the **empty string** when unset. Two verified-code consequences: (1) `MASTER_KEY_PREVIOUS = String(process.env.MASTER_KEY_PREVIOUS || '')` (server.js:88) — empty is falsy so the keyring is fine, *but* (2) any compose expression like `${MASTER_KEY_PREVIOUS:-}` vs `${MASTER_KEY_PREVIOUS-}` matters: with `:-` compose substitutes empty (ok), but if the line instead uses a default value or the env-file exports it empty-quoted in a way Docker passes as a literal empty var, boot-time re-wrap (`migrateTotpReWrap`, server.js:2059 `if (!MASTER_KEY || !MASTER_KEY_PREVIOUS) return;`) is a no-op — harmless — while the *danger* direction is a compose mis-edit that makes `MASTER_KEY_PREVIOUS` **required** (`:?`) for every fresh install, breaking first boot of new instances that have no previous key. The verified loud-fail guard (server.js:92-94: PREVIOUS set without MASTER throws, pinned at test/totp-encryption.test.mjs:374) protects the inverse case only.

**Why it happens:** compose `:?` vs `-` substitution semantics; copy-paste of the MASTER_KEY line.

**How to avoid:**
Use the optional form `MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}` so unset → absent/empty, never `:?`. Add a compose/config test asserting `docker compose config` renders both with and without the var in `.env` (there are doc-parsing parity-test precedents from Phase 26 — DEPLOY.md §14 is pinned by "doc-parsing parity tests"; extend the same harness to the compose file, and update DEPLOY.md §14 which documents the two-env rotation and would otherwise drift).

**Warning signs:** a fresh `docker compose up` failing with "set MASTER_KEY_PREVIOUS in .env".

**Phase to address:** DEPLOY phase. Regression surfaces: `test/totp-encryption.test.mjs` (D-K2 loud-fail pin at 374, rotation idempotence at 390-401), the DEPLOY.md parity tests, `test/server-boot.test.mjs`, `test/dependencies.test.mjs` (zero-runtime-deps gate untouched).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Client-side snapshot/undo for server-authority data (UNDO) | One generic undo mechanism for everything | Authority rows diverge from doc; UI lies until next PUT | Never — remove the offer or make undo server-aware |
| Second visibility predicate beside the funnel (VIS) | Quick feature, no funnel surgery | Every new surface must remember both; 404-matrix rot | Never — extend `hiddenFor()` |
| `firstWorkspace()` as safety-net fallback (HARD) | Legacy rows never 410 | Silent cross-tenant join | Only in `backfillInvites()`/seed, pinned by test |
| Free-text `includes()` redaction (SEARCH) | No schema change | Documented false-positives; leak depends on normalization quality | Acceptable **if documented** (PROJECT.md already commits to that) or removed by per-user storage |
| Compose var without explicit `:-` guard (DEPLOY) | One-line change | Fresh-install boot breakage | Never |
| Migration that writes defaults at boot (SETTINGS) | Simpler read path | Byte-identical second-boot guarantee dies | Never — nullable/absent-until-touched pattern |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Traefik + `sameOrigin` | Guard trusts `req.headers.host` while the proxy rewrites Host | `TRUST_PROXY` + `X-Forwarded-Host` path (server.js:2392) must be exercised in the e2e invite test |
| Email → `/join` flow | Guarding the link *landing* instead of only the POST | Navigation GET unguarded; sameOrigin only on the state-changing POST, before body read/throttle (server.js:3402 precedent) |
| SSO invite reconciliation | Adding sameOrigin/strictness to a helper shared with the SSO-07 reconcile (server.js:2765) and breaking the server-side (no-Origin) path | `sameOrigin` passes on missing Origin (curl/server calls) — verify the shared helper keeps that |
| docker-compose + keyring | Making `MASTER_KEY_PREVIOUS` required | `${VAR:-}` optional form; D-K2 loud-fail test stays green |
| Doc-PUT normalization vs new per-user rows | Stale clients PUTting `notifPrefs`/`invoices` back into the doc | Write-path strip (server.js:1341 pattern) + accessor consolidation |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| 403-with-message where 404 is contract | Existence oracle for out-of-scope ids | Byte-identical 404 everywhere; 404-matrix re-run with team-visibility rows |
| Blind undo of captured rows | Re-grants membership to someone removed/re-invited meanwhile | Reconcile captured rows against live `memberships` before re-insert |
| Accept-route body carrying privilege fields | Guest/profile spoof — self-elevated role/teams/scope at signup | Whitelist name/email/password; pin with spoof-payload test |
| Shared `recentSearches` as oracle | Hidden project names inferred from history manipulation | Conservative `includes()` filter; better: per-user rows |
| `firstWorkspace()` fallback on accept | Invite to deleted workspace joins another tenant | Strict `410 workspaceGone`; fallback only in backfill/seed |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Undo that half-restores (doc yes, memberships no) | Admin believes the team is back; mentions/visibility silently dead | Either real undo (server reconcile) or no undo offer |
| Team-visibility surprising existing installs | Long-time members suddenly lose projects | Empty-`teams[]` ⇒ workspace-wide is the migration-safe default; communicate in changelog |
| Invite accept failing behind proxy | "Cross-origin rejected" for legit email recipients | Test through the real Traefik topology before ship |
| Recent-search history losing legit entries | Users think search is broken | Document the limitation; prefer per-user rows |

## "Looks Done But Isn't" Checklist

- [ ] **VIS:** every project-touching endpoint family re-covered by the named 404-matrix with team-visible/out-of-scope combos — verify `test/scope.test.mjs` matrix block (line 512+) extended, not just old rows green.
- [ ] **VIS:** D-03 inversion still wins over empty team intersection — verify scoped-guest-sees-private-project test.
- [ ] **VIS:** no-team project visible to a zero-team member (SSO JIT account) — verify with a JIT-shaped fixture.
- [ ] **UNDO:** whatever ships, the post-undo `team_members` state equals the post-undo doc state — verify with a direct SQL count in the test.
- [ ] **UNDO:** undo after member-removal/re-invite doesn't resurrect stale rows.
- [ ] **HARD:** email→click→accept e2e passes behind proxy headers; cross-origin POST fails *before* body read.
- [ ] **HARD:** invite→delete workspace→accept ⇒ 410 and zero memberships created.
- [ ] **HARD:** spoof payload (role/teams/scope in accept body) ignored.
- [ ] **SEARCH:** leak test with case/whitespace/accent variants of hidden names.
- [ ] **SETTINGS:** second-boot byte-identical pin extended to the new table; legacy all-ON read preserved (due-reminders.test.mjs:302).
- [ ] **DEPLOY:** `docker compose config` valid with and without `MASTER_KEY_PREVIOUS`; DEPLOY.md §14 parity tests updated.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Team-visibility regression leaks data | HIGH | Revert to funnel-only predicate; re-run full 404-matrix; audit logs for 403-on-known-id |
| Undo resurrected wrong memberships | MEDIUM | Delete resurrected `team_members` rows by captured timestamp; activity log has the audit trail |
| sameOrigin locked out email recipients | LOW | Fix proto/host detection; the invite rows are unused (single-use not consumed by rejected POSTs if guard precedes body read) |
| Migration diverges on second boot | HIGH | Restore the pre-migration backup (`vacuum into`, test/migration.test.mjs pattern); fix guard; re-migrate |
| Compose breaks fresh installs | LOW | Fix substitution form; no data impact |
| MASTER_KEY_PREVIOUS lost mid-rotation | HIGH | DEPLOY.md §14 no-data-loss note + keyring-miss signature; 2FA re-enrollment is the documented fallback |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| VIS-1/2/3 (funnel bypass, 404 oracle, teamless breakage) | VIS | Extended 404-matrix + D-03 inversion tests + teamless/zero-team cases in `test/scope.test.mjs` |
| UNDO-1 (doc-only undo) | UNDO | SQL-level row-count assertion + stale-restore guard test in `test/membership.test.mjs` |
| HARD-1/2/3 (sameOrigin, firstWorkspace, spoof) | HARD | Email-click e2e, deleted-workspace 410 test, spoof-payload test; `test/oidc-sso.test.mjs` stays green |
| SEARCH-1 (substring leak) | SEARCH (or folded into SETTINGS) | Variant-normalization leak tests; scope redaction tests |
| SETTINGS-1 (second-boot drift, split-brain reads) | SETTINGS | Extended `test/migration.test.mjs` pin; `test/due-reminders.test.mjs` legacy all-ON read |
| DEPLOY-1 (compose var) | DEPLOY | Compose-config parity test + `test/totp-encryption.test.mjs` D-K2/rotation pins |

**Suites that must stay green throughout:** `test/scope.test.mjs`, `test/migration.test.mjs`, `test/oidc-sso.test.mjs`, `test/membership.test.mjs`, `test/due-reminders.test.mjs`, `test/totp-encryption.test.mjs`, `test/server-boot.test.mjs`, `test/dependencies.test.mjs` — the full 803-test suite plus the i18n-scan build gate (EN+FR) per milestone invariants.

## Sources

- Code-verified: `server.js` (lines as cited: 83-101, 594-600, 633, 671, 730, 825-854, 861-882, 985-988, 1028, 1062, 1226-1239, 1330-1345, 1474, 1530-1536, 1647, 1693-1740, 2059-2101, 2160-2166, 2207, 2380, 2389-2394, 2765-2790, 3800-3818, 3902-4025, 4180-4196, 4316-4390)
- Code-verified: `src/actions/teams.js:121-164` (delTeam purge-then-snapshot undo trap)
- Code-verified: `docker-compose.yml:39` (only MASTER_KEY forwarded — the CR-01/DEPLOY gap)
- Code-verified: `test/migration.test.mjs:126,418-449` (byte-identical second-boot pins), `test/totp-encryption.test.mjs:374-401` (D-K2 + rotation), `test/scope.test.mjs:443-613` (404-matrix), `test/due-reminders.test.mjs:302` (legacy notifPrefs all-ON)
- General-practice (labeled): proxy/`Origin` misconfiguration failure modes for `sameOrigin`; undo-reconciliation stale-row trap (informed by the code's structure, standard CSRF/undo patterns)

---
*Pitfalls research for: Projects Studio v1.7 Team Visibility & Hardening*
*Researched: 2026-11-02*
