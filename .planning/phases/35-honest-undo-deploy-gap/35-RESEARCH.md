# Phase 35: Honest Undo & Deploy Gap - Research

**Researched:** 2026-11-03
**Domain:** Client-side membership reconciliation (undo of team deletion) + docker-compose env forwarding
**Confidence:** HIGH

## Summary

This phase is deliberately small and fully mapped by 35-CONTEXT.md's nine decisions
(D-01..D-09). The undo is a pure client-side orchestration around the existing
`PUT /members/:uid/teams` route: capture the affected members' team sets *before* the
purge, restore the doc snapshot via the existing `restore(snap)`, then re-PUT each
affected member's **union** set (current ∪ captured). Zero new routes, zero server
changes. The compose fix is one YAML line plus a DEPLOY.md §14 walkthrough and a
parse+config test.

The single genuinely new technical finding from code reading is a **sequencing race the
planner must design for**: the server's PUT teams route whitelists every team id against
the workspace *document's* team definitions (`server.js:4291-4292`, 400 `unknownTeam`).
Undo therefore requires the doc PUT (which re-adds the deleted team's definition) to land
on the server **before** the authority PUTs. But `restore(snap)` → `save()` is debounced
(~150 ms) and the push is further debounced (~450 ms, async) — an onAction that fires
`Promise.all(setMemberTeams(...))` immediately after `restore(snap)` can reach the server
first and 400. The undo handler must force/await the doc push (or otherwise sequence it)
before replaying the authority PUTs. Options and recommendation below.

Second verified finding: `docker compose config` **fails hard** when the three `:?`
required vars are unset (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MASTER_KEY`) — verified by
running it in this repo (Docker Compose v5.6.1 present). The compose-config test must set
those three variables explicitly in *both* of its cases; it varies only
`MASTER_KEY_PREVIOUS` between set/unset.

**Primary recommendation:** Client undo = capture before-map → restore(snap) → force the
doc push → union-replay `api.setMemberTeams` per affected member, union-computed from the
post-restore doc state ∪ captured sets; compose test = parse assertion + two-case
`docker compose config` with the three required vars always set.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Undo is toast-only (~5s window), same `action: t('toast.undo')` pattern as
  tasks/projects. Before-map captured in the closure at deletion time (pattern of
  `src/actions/teams.js:100` / the `before` Map at teams.js:70). No persistent Restore,
  no journal, no cold reads.
- **D-02:** Mid-course PUT failure → error toast, NO compensating rollback. Doc already
  restored client-side; failing authority rows stay as-is; admin re-invites/re-PUTs
  manually. Same compromise as `delTeam` today. No compensation layer.
- **D-03:** **Additive union** semantics — undo PUT sends current team set ∪ (deleted
  team id if captured). Newer changes between deletion and undo survive by construction.
- **D-04:** Stale-client corner covered by union naturally; pinned by UNDO-02 regression
  test; **no server-side guard**.
- **D-05:** Restore logic lives client-side in the toast's `onAction`: closure captures
  before-map before purge → `restore(snap)` (src/actions/actions.js:271) → replay
  `api.setMemberTeams(userId, unionSet)` per affected member. Zero new routes.
- **D-06:** Local mode = `restore(snap)` as-is, unchanged (snapshot already contains all
  member teams). `api.enabled` branch only ADDS the authority PUTs beside it. Test pin:
  local undo remains a plain restore(snap).
- **D-07:** `MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}` on the line immediately after
  the `MASTER_KEY` line in `docker-compose.yml:39` environment block, short comment
  pointing at DEPLOY.md §14. `:-` form only, never `:?`.
- **D-08:** DEPLOY.md §14 gets a compose rotation **walkthrough** (.env-based
  add-old-key → reboot → verify stamped ids → remove-old-key cycle) + note that no extra
  step beyond setting the env var is needed. Adapts §14, doesn't duplicate.
- **D-09:** Compose test = parse `docker-compose.yml` asserting the `:-` form on the
  MASTER_KEY_PREVIOUS line, PLUS `docker compose config` run with variable both set and
  unset. Docker binary required; if unavailable, config case skips with an explicit skip
  reason (never silently passes).

### the agent's Discretion
- Exact toast copy / i18n keys for the undo action if new keys are needed (EN+FR per project rule).
- Test file placement (extend `test/membership.test.mjs` vs a focused new file).
- Before-map capture: reuse the team-edit modal's Map helper or inline Map — same shape.

### Deferred Ideas (OUT OF SCOPE)
- Persistent admin "restore deleted team" surface (beyond the toast window).
- Server-side dedicated restore-memberships route with transactional reconciliation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UNDO-01 | Undo restores purged `team_members` rows via before-map + existing membership PUT route | delTeam flow (teams.js:119-168) mirrored in reverse; sequencing pitfall (doc PUT must precede authority PUTs — server whitelist server.js:4291); api.setMemberTeams wrapper (api.js:397) |
| UNDO-02 | Members who changed teams between deletion and undo are not clobbered — reconciling union PUT | Union semantics D-03; server PUT is full-set-replace per member inside its own transaction (server.js:4286-4297), so union computed client-side is the only clobber vector; regression test at server level |
| DEPLOY-01 | compose forwards MASTER_KEY_PREVIOUS via `:-` form; DEPLOY.md §14 notes no extra step | Insertion point docker-compose.yml:39; `docker compose config` two-case test; verified required-var failure mode of `compose config` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Undo orchestration (capture, restore, union, replay) | Browser / Client | — | D-05 locks it client-side; server unchanged |
| Authority-row truth (team_members) | API / Backend | — | Already exists (PUT teams route, transactional); untouched |
| Doc team-definition whitelist | API / Backend | — | Server-side guard at server.js:4291 — undo must sequence around it, not change it |
| Compose env forwarding | Deployment config | — | docker-compose.yml environment block |
| Rotation docs | Documentation | — | DEPLOY.md §14 |

## Standard Stack

### Core
No new dependencies — zero-runtime-dependency invariant held. Everything used already exists in the repo:

| Asset | Location | Purpose | Status |
|---------|---------|---------|--------|
| `restore(snap)` | src/actions/actions.js:271 | JSON round-trip doc restore (`S.data = JSON.parse(snap); save(); render();`) | [VERIFIED: src/actions/actions.js:271-275] |
| `snapshot()` | src/actions/actions.js:267 | `JSON.stringify(S.data)` — already used by delTeam | [VERIFIED: src/actions/actions.js:267-269] |
| `api.setMemberTeams(userId, teams)` | src/core/api.js:397 | `PUT /api/workspaces/:slug/members/:uid/teams`, full-set replace, no revision adoption | [VERIFIED: src/core/api.js:397-401] |
| `save()` / push pipeline | src/core/store.js:155-172 | Debounced localStorage write + debounced (450 ms) doc PUT via `api.putWorkspace` | [VERIFIED: src/core/store.js:155-172] |
| `node:test` + `helpers/server.mjs` | test/ | Server-level HTTP test harness (pattern of test/membership.test.mjs) | [VERIFIED: test/membership.test.mjs] |
| `docker compose` | system | Compose config validation for the test | Docker 29.9.2 / Compose v5.6.1 installed [VERIFIED: shell probe this session] |

### Alternatives Considered
None — D-01..D-09 lock the approach. Out of scope by decision: server restore route, persistent UI, compensation layer.

## Package Legitimacy Audit

No external packages installed this phase — zero runtime dependencies invariant plus no
new dev tooling needed (`node:test` built-in, `docker compose` system binary). Audit table
omitted; nothing to gate.

## Architecture Patterns

### System Architecture Diagram

```
[Admin taps Undo (toast, ≤5s window)]
        │
        ▼
onAction closure ── has: beforeMap (member_id → captured team set), tm.id, snap
        │
        ▼
restore(snap)                      ← doc JSON restored client-side (D-06: local mode STOPS here)
        │
        ▼ (api.enabled only)
force/await doc push               ← PITFALL 1: doc PUT must land server-side before
        │                            authority PUTs (server whitelist, server.js:4291)
        ▼
for each affected member:
  union = memberTeams(x) ∪ (beforeMap.has(x.id) ? [tm.id] : [])
  await api.setMemberTeams(x.userId, union)   ← full-set replace, own transaction
        │
        ├─ all ok → toast/honest rosters (authority rows restored; Phase-32 visibility
        │            reads rows live → visibility/mentions honest immediately)
        └─ some fail → error toast, NO rollback (D-02)
```

### Recommended change shape

```
src/actions/teams.js    # delTeam: move beforeMap capture ABOVE the purge (before api.enabled block)
docker-compose.yml      # +1 line after line 39, +1 short comment
DEPLOY.md               # §14: compose rotation walkthrough (adapt, don't duplicate)
test/*.test.mjs         # undo pins + compose-config test (placement = planner's discretion)
```

### Pattern 1: before-map capture (existing idiom to mirror)
**What:** `Map(member_id → memberTeams(x))` captured before mutation, compared/restored later.
**Where it already works:** src/actions/teams.js:70 (`const before = new Map(D().members.map(x => [x.id, memberTeams(x)]))`) and the diff/rollback usage at teams.js:97-108.
**Key detail for delTeam:** the capture must move **above** the `api.enabled` purge block
(current code captures nothing before the PUTs — the roadmap's "before-map capture moved
above the purge"). Capture key: use whatever the undo closure needs to find the member
later (`x.userId` for PUTs, `x.id` for doc lookup — match teams.js which keys by `x.id`
and PUTs by `x.userId`).

### Pattern 2: union PUT (the whole of UNDO-02)
```js
const union = Array.from(new Set([...memberTeams(x), tm.id]));
await api.setMemberTeams(x.userId, union);
```
Server behavior this rides on [VERIFIED: server.js:4286-4297]: the route deletes all
`team_members` rows for (workspace, user) then insert-or-ignores the full sent set inside
one transaction — full-set replace. So "restore only the deleted team's rows without
erasing newer changes" is achieved entirely by sending current ∪ restored; the server
cannot partially clobber. Note the sent set is capped at 25 teams server-side
(`tooManyTeams`, 400) — union of a ≤25 set with one more team can only exceed 25 if the
member gained 25 teams in the 5-second window; not a real path, but worth a comment.

### Anti-Patterns to Avoid
- **Compensating rollback on PUT failure** — explicitly rejected (D-02); doubles failure surface.
- **Server-side guard for nonexistent teams on the teams PUT** — rejected (D-04); the team definition is restored by the doc PUT before the replay anyway.
- **Capturing the before-map after the purge** — the whole point of the fix; capture must precede the `api.enabled` block.
- **`fork` of a new route or `:?` compose form** — both locked out.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Doc restore | custom diff/patch of teams | `restore(snap)` | shared by ~10 call sites, exact behavior D-06 pins |
| Membership write | new fetch/endpoint | `api.setMemberTeams` | the ONLY authority-write path; server validates, projects payload, syncs profiles |
| Before-map | new abstraction | inline Map like teams.js:70 | discretion-locked, same shape |
| Compose validation logic | custom YAML env interpolation | `docker compose config` | the tool IS the spec; D-09 requires it |

## Runtime State Inventory

Migration/rename-phase trigger: not applicable (no rename/migration). However a
state-affecting behavioral note: the undo writes `team_members` rows only via the
existing route — no stored-data migration, no live-service config change, no OS
registrations, no secrets changes, no build-artifact staleness. The compose line adds an
env var that is empty by default; server.js already treats unset vs empty identically
(`String(process.env.MASTER_KEY_PREVIOUS || '')`, server.js:89) — verified, so forwarding
an empty string is a no-op at boot.

## Common Pitfalls

### Pitfall 1: doc-push debounce races the authority PUTs (UNDO-01) — THE pitfall
**What goes wrong:** `restore(snap)` calls `save()`, which is debounced 150 ms and then
pushes the doc after another 450 ms delay (`push()`, src/core/store.js:159-172, async).
If the undo `onAction` immediately calls `Promise.all(affected.map(x =>
api.setMemberTeams(...)))`, the authority PUTs can hit the server before the doc PUT —
and the server whitelists team ids against `ctx.ws.doc` (`server.js:4291-4292`: 400
`unknownTeam`), where the restored team definition does not exist yet. Every PUT fails,
D-02 fires the error toast, and the undo is dishonest precisely when used.
**Why it happens:** today's delTeam never re-adds teams, so no caller of setMemberTeams
has ever needed the doc to be updated first — the constraint is new to undo.
**How to avoid:** the onAction must ensure the doc PUT lands before the replay. Options
for the planner (in preference order):
  1. Have the undo handler perform the doc PUT explicitly and await it (e.g. call
     `api.putWorkspace(docSnapshot())`-shaped push, or export/await an existing flush
     helper — `flushNow()` exists at store.js ~:175 for page-hide; reuse or export a
     variant) before the `Promise.all`.
  2. Sequence with the existing debounce timings (fragile — do not).
Note: whatever mechanism is chosen must also respect the `S.ui.conflict` guard (push()
skips when conflict is set — D-02's error-toast path then covers it naturally).
**Warning signs:** undo in API mode 400s with `unknownTeam` in the network tab; test it
in the harness by issuing the doc PUT and the teams PUTs in the wrong order.

### Pitfall 2: `docker compose config` fails on required vars
**What goes wrong:** running `docker compose config` plainly in the test env exits 1 —
three `:?` vars (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MASTER_KEY`) interpolate-fail [VERIFIED:
probe this session, error: "required variable ADMIN_EMAIL is missing a value: set
ADMIN_EMAIL in .env" and siblings].
**How to avoid:** the compose-config test sets those three env vars in BOTH cases (e.g.
`process.env` injection in the child invocation), varying only `MASTER_KEY_PREVIOUS`
between set/unset. Both cases must assert exit 0.
**Warning signs:** a test that "passes" both cases only because it treats exit 1 as skip.

### Pitfall 3: capture keyed by the wrong id
**What goes wrong:** `memberTeams(x)` and doc lookup key by member id (`x.id`), while the
PUT needs `x.userId`. A closure over one id shape failing to map to the other silently
re-PUTs the wrong member.
**How to avoid:** mirror teams.js:70's shape (`Map` keyed by `x.id`) and resolve
`x.userId` at replay time from the live doc after `restore(snap)`; or key the map by
`x.userId` — either way, one explicit comment.

### Pitfall 4: undo replaying after the doc has moved on (conflict path)
**What goes wrong:** if `S.ui.conflict` is set (409/401/403 on the doc push), push() never
writes; the undo's doc restore is local-only and the authority PUTs would whitelist
against a stale server doc.
**How to avoid:** accept it — D-02's error toast is the honest outcome; do not invent a
conflict-resolution flow inside a 5-second toast.

### Pitfall 5: test env lacks docker
**What goes wrong:** D-09 requires `docker compose config`; CI or another machine may
lack the binary.
**How to avoid:** explicit skip with a named reason when `docker compose` is unavailable
(never silently pass); parse assertion (case 1) still runs everywhere.

## Code Examples

### Server contract the undo rides on (verbatim, for planner reference)
```js
// Source: server.js:4291-4297 (read this session)
    // Whitelist: every team id must be a team defined in the workspace document (T-28-02).
    const known = new Set((JSON.parse(ctx.ws.doc)?.data?.teams || []).map(t => t?.id).filter(Boolean));
    const teams = [...new Set(body.teams.map(t => String(t).slice(0, 40)))];
    if (teams.some(t => !known.has(t))) return fail(res, 400, 'unknownTeam', 'Unknown team');
    transaction(() => {
      db.prepare('delete from team_members where workspace_id = ? and user_id = ?').run(ctx.ws.id, target.id);
      const insert = db.prepare('insert or ignore into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)');
      for (const t of teams) insert.run(ctx.ws.id, t, row.member_id, target.id);
    });
```
Implications: (a) whitelist ⇒ doc PUT first (Pitfall 1); (b) full-set replace ⇒ union
semantics is the entire no-clobber mechanism; (c) route is admin-gated (`requireWorkspace
... 'admin'`) — undo tests exercise as admin, matching the Phase-32 convention.

### Compose insertion (D-07 target, current line 39)
```yaml
      MASTER_KEY: ${MASTER_KEY:?set MASTER_KEY in .env (32+ random chars; encrypts TOTP secrets — losing it locks out 2FA)}
      MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}   # key rotation (DEPLOY.md §14)
```
Server-side consumption already tolerant of empty [VERIFIED: server.js:89]: `const
MASTER_KEY_PREVIOUS = String(process.env.MASTER_KEY_PREVIOUS || '');` — and same-id
guard at server.js:101 warns if PREVIOUS hashes equal to MASTER_KEY.

### Compose test shape
```js
// two cases; the three required `:?` vars are ALWAYS provided (Pitfall 2)
const base = { ADMIN_EMAIL: 'a@b.c', ADMIN_PASSWORD: 'x'.repeat(12), MASTER_KEY: 'k'.repeat(64) };
// case 1: MASTER_KEY_PREVIOUS unset  → docker compose config exits 0 (fresh install boots)
// case 2: MASTER_KEY_PREVIOUS=<old>  → docker compose config exits 0, and the rendered
//                                     config's environment carries MASTER_KEY_PREVIOUS=<old>
```
Skip path when docker is absent: explicit skip reason (D-09).

## State of the Art

Not applicable — no library choices; everything is repo-local patterns and system docker.
Compose `:-` form is standard POSIX-shell-style interpolation, already the majority form
in this compose file (every line but MASTER_KEY, PRJSTUDIO_HOST labels).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exporting or reusing a "force doc push now" mechanism from store.js (Pitfall 1 option 1) is feasible with zero-dep constraints — flushNow() exists for page-hide but its exact export surface wasn't fully read | Pitfalls 1 / Code Examples | Planner may need to pick option 1b (await an explicit `api.putWorkspace` call in the handler) instead; no contract risk, just sequencing code |
| A2 | The undo tests can be written at the server-harness level (membership.test.mjs pattern) for the UNDO-02 no-clobber pin, while the D-06 "local undo is plain restore(snap)" pin rides whatever client-module test convention exists — exact client-module test harness not inspected this session | Validation Architecture | Test placement may shift (planner's discretion anyway) |
| A3 | Cap-25 `tooManyTeams` unreachable in the 5-second undo window — reasoning, not tested | Pattern 2 | Cosmetic; add a comment or ignore |

## Open Questions

1. **How should the undo force the doc push before the authority PUTs?**
   - What we know: restore→save is double-debounced; server whitelists against the stored
     doc; flushNow() exists for the page-hide path (store.js ~:175).
   - What's unclear: cleanest zero-dep sequencing primitive — await an explicit
     putWorkspace in the handler vs export a flush/awaitable save.
   - Recommendation: planner decides in-plan; prefer awaiting an explicit doc push inside
     the onAction (keeps store.js surface untouched).

2. **Test file placement** — discretion per CONTEXT.md. Existing authority-row suite
   (test/membership.test.mjs, PUT-teams coverage at :348) is the natural home for the
   UNDO-02 regression; compose test wants its own focused file or a deploy-adjacent home.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | tests | ✓ | v24.21.0 | — |
| docker compose | compose-config test (D-09) | ✓ | Docker 29.9.2 / Compose v5.6.1 | explicit skip with reason when absent |
| npm test runner (`node --test`) | full gate | ✓ | node:test built-in | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none blocking (docker absence → D-09 skip path).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` built-in, server harness `test/helpers/server.mjs` |
| Config file | none (package.json `"test": "node --test --test-concurrency=2 test/*.test.mjs"`) [VERIFIED: package.json:18] |
| Quick run command | `node --test test/membership.test.mjs` |
| Full suite command | `npm test` (803-test baseline must stay green) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UNDO-01 | restore+replay re-creates purged rows; whitelisted only after doc PUT | integration (server harness) | `node --test test/membership.test.mjs` | ❌ Wave 0 |
| UNDO-02 | union PUT keeps newer other-team rows; stale before-map cannot erase | integration (server harness) | `node --test test/membership.test.mjs` | ❌ Wave 0 |
| UNDO-01 (D-06) | local-mode undo is plain restore(snap) — no API calls | unit/pin | `npm test` (per placement) | ❌ Wave 0 |
| DEPLOY-01 | compose line parses with `:-` form; `docker compose config` green with var set and unset | config test | `node --test test/<compose-file>.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `node --test` file(s) touched by the task
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Undo tests (UNDO-01/02 pins) — placement per discretion; membership.test.mjs has the harness + PUT-teams precedents (:348-404)
- [ ] Compose-config test file with the required-var handling of Pitfall 2
- [ ] No new fixtures needed — helpers/server.mjs supports doc PUT + teams PUT + admin clients (proven by existing membership tests)

## Security Domain

security_enforcement: not disabled in config (no key present → treated as enabled).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes (replay path) | PUT teams route admin-gated server-side (unchanged); undo is admin-only by construction (delTeam confirm is admin surface) |
| V5 Input Validation | yes | union sets flow through the existing route validation (trim/slice/dedup/whitelist) — no new input path |
| V6 Cryptography | yes (DEPLOY-01) | MASTER_KEY_PREVIOUS forwarding via env only, optional form; never `:?` breaking fresh installs; key material never on command lines (§14 discipline) |
| V3 Session Management | no change | — |
| V2 Authentication | no change | — |

### Known Threat Patterns for this change
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Replayed PUT widens a member's teams beyond intent | Elevation | Server whitelist against doc teams + admin gate (existing, untouched); union only ever ADDS the one deleted team |
| MASTER_KEY_PREVIOUS leaking into logs | Information disclosure | Compose `:-` empty default; §14 already forbids echoing keys; no new logging |
| Fresh-install boot breakage (regression) | DoS | `:-` form (never `:?`), pinned by two-case config test |

## Sources

### Primary (HIGH confidence)
- `src/actions/teams.js` (read in full) — delTeam purge flow, before-map idiom :70/:100
- `src/actions/actions.js:267-275` — snapshot()/restore()
- `src/core/api.js:397-401` — setMemberTeams wrapper
- `src/core/store.js:105-180` — save()/push() debounce pipeline, conflict guard, flushNow
- `server.js:82-102, 4286-4297` — keyring boot, PUT teams whitelist + transactional replace
- `docker-compose.yml` (read in full) — environment block, insertion point :39
- `DEPLOY.md §14` (read) — rotation runbook the walkthrough extends
- `test/membership.test.mjs` (read, harness pattern + PUT-teams tests :348-404)
- Session probes: `docker compose config` failure on required vars; docker/versions; package.json test script

### Secondary (MEDIUM confidence)
- None needed.

### Tertiary (LOW confidence)
- A1–A3 in Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all assets read in-repo this session, no new deps
- Architecture: HIGH — D-01..D-09 lock the design; single new finding (Pitfall 1) verified against server + client code
- Pitfalls: HIGH — Pitfalls 1/2/5 verified by code reading and live probes; 3/4 by inspection

**Research date:** 2026-11-03
**Valid until:** 2026-12-03 (repo-local, stable)
